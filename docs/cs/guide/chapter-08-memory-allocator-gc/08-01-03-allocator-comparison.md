---
tags:
  - balanced
  - intermediate
  - jemalloc
  - medium-read
  - memory-allocator
  - mimalloc
  - tcmalloc
  - thread-local-cache
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 8.1.3: 메모리 할당자 비교

## TCMalloc: Google의 해답

Google이 만든 TCMalloc (Thread-Caching Malloc)의 혁신:

```c++
// TCMalloc의 핵심: Thread-local 캐시
// 각 스레드가 독립적인 캐시를 가져 lock 없는 고속 할당 실현
class ThreadCache {
private:
    // 크기별 free list (per-thread, lock-free!)
    // 88개의 서로 다른 크기 클래스로 세분화된 관리
    // 각 크기마다 별도 리스트로 할당 속도 극대화
    FreeList list_[kNumClasses];  // 88개 크기 클래스 (8B~32KB)

    // 현재 캐시 크기 추적 (메모리 사용량 제어)
    size_t size_;  // 바이트 단위 총 캐시 크기

public:
    void* Allocate(size_t size) {
        // 요청 크기를 미리 정의된 크기 클래스로 매핑
        // 예: 17바이트 요청 → 24바이트 클래스로 반올림
        const int cl = SizeClass(size);
        FreeList* list = &list_[cl];

        if (!list->empty()) {
            // Fast path: 스레드 로컬 캐시에서 즉시 반환
            // 뮤텍스나 atomic 연산 없이 O(1) 할당
            // CPU 캐시 친화적으로 최근 해제된 메모리 재사용
            return list->Pop();
        }

        // Slow path: 로컬 캐시 부족 시 중앙 힙에서 배치 가져오기
        // 여러 객체를 한 번에 가져와 시스템 호출 오버헤드 감소
        return FetchFromCentralCache(cl);
    }

    void Deallocate(void* ptr, size_t size) {
        // 해제할 객체의 크기 클래스 결정
        const int cl = SizeClass(size);
        FreeList* list = &list_[cl];

        // 스레드 로컬 캐시에 추가 (즉시 재사용 가능)
        list->Push(ptr);

        // 캐시 크기 제한으로 메모리 과다 사용 방지
        // 임계값 초과 시 중앙 캐시로 일부 반환
        if (list->length() > list->max_length()) {
            // 배치 단위로 반환하여 중앙 캐시 경합 최소화
            ReleaseToCentralCache(list, num_to_release);
        }
    }
};

// 성능 비교 (실제 벤치마크)
void benchmark_allocators() {
    const int THREADS = 16;
    const int ITERATIONS = 10000000;

    auto test = [](const char* name, auto malloc_func, auto free_func) {
        auto start = std::chrono::high_resolution_clock::now();

        std::vector<std::thread> threads;
        for (int t = 0; t < THREADS; t++) {
            threads.emplace_back([&]() {
                for (int i = 0; i < ITERATIONS; i++) {
                    size_t size = 16 + (rand() % 1024);
                    void* ptr = malloc_func(size);
                    // 간단한 작업
                    memset(ptr, 0, size);
                    free_func(ptr);
                }
            });
        }

        for (auto& t : threads) t.join();

        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

        printf("%s: %ld ms, ", name, duration.count());
    };

    test("glibc malloc", malloc, free);         // 12,000 ms
    test("tcmalloc", tc_malloc, tc_free);       // 3,200 ms (3.7x faster!)
    test("jemalloc", je_malloc, je_free);       // 3,500 ms
    test("mimalloc", mi_malloc, mi_free);       // 2,800 ms (최신, 가장 빠름!)
}
```

## JEMalloc: Facebook의 선택

Facebook, Firefox, Redis가 선택한 jemalloc의 특징:

```c
// JEMalloc의 핵심: Arena와 크기 클래스
// NUMA 아키텍처에 최적화된 메모리 할당자

// 1. Arena 구조 (NUMA 친화적)
// 각 CPU 코어마다 독립된 Arena를 배치하여 원격 메모리 접근 최소화
typedef struct arena_s {
    // 동시 접근 제어를 위한 뮤텍스
    // CPU별 Arena로 경합을 줄였지만 완전히 제거할 수는 없음
    malloc_mutex_t lock;

    // Bins: 크기별 청크 관리 전략
    // Small bins (39개): 8B~3KB, 정확한 크기 매칭으로 내부 단편화 없음
    // Large bins: 4KB~4MB, 베스트핏 할당으로 단편화 최소화
    arena_bin_t bins[NBINS];  // Small: 39개, Large: 별도

    // Huge allocations (chunk 크기 이상)
    // 4MB 이상의 거대 할당은 별도 관리로 mmap 직접 사용
    // 트리 구조로 빠른 검색과 병합 지원
    extent_tree_t huge;

    // 성능 모니터링을 위한 통계 정보
    // 할당/해제 빈도, 단편화율, 메모리 사용량 등 추적
    arena_stats_t stats;
} arena_t;

// 2. Slab 할당 (작은 객체용)
// 같은 크기의 객체들을 한 페이지에 모아 관리
typedef struct arena_bin_s {
    // bin 단위 동기화 (세밀한 잠금 제어)
    malloc_mutex_t lock;

    // Slab: 같은 크기 객체들의 그룹 페이지
    // 연속된 메모리 영역을 동일 크기로 분할하여 관리
    arena_slab_t *slabcur;  // 현재 할당 중인 slab (가장 빠른 할당)

    // 부분적으로 찬 slabs 관리 (힙 구조)
    // 사용 가능한 슬롯이 있는 slab들을 효율적 관리
    extent_heap_t slabs_nonfull;

    // 비트맵으로 할당 상태 추적
    // 각 슬롯의 사용 여부를 1비트로 관리 (메모리 효율적)
    bitmap_t bitmap[BITMAP_GROUPS];
} arena_bin_t;

// 3. Size classes (더 세밀한 구분)
// jemalloc은 2의 거듭제곱 + 중간값들
// 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128...
// -> 내부 단편화 최소화!

// 실제 사례: Redis의 jemalloc 튜닝
void redis_jemalloc_tuning() {
    // Background thread로 메모리 정리
    bool background_thread = true;
    je_mallctl("background_thread", NULL, NULL,
               &background_thread, sizeof(bool));

    // Dirty page decay time (메모리 반환 시기)
    ssize_t decay_ms = 10000;  // 10초
    je_mallctl("arenas.dirty_decay_ms", NULL, NULL,
               &decay_ms, sizeof(ssize_t));

    // 결과: 메모리 사용량 30% 감소, 지연시간 영향 없음!
}
```

## MIMalloc: Microsoft의 최신작

2019년 공개된 mimalloc의 혁신:

```c++
// MIMalloc의 핵심: Sharded free list + Local heap
// 2019년 Microsoft에서 공개한 최신 메모리 할당자

// 1. Free list sharding (false sharing 방지)
// CPU 캐시라인 단위로 free list를 분할하여 성능 최적화
typedef struct mi_page_s {
    // 여러 개의 free list (캐시라인별 분할)
    // 64비트 시스템에서 6개로 분할 (2^6=64바이트 캐시라인)
    // 독립적인 free list로 false sharing 완전 제거
    mi_block_t* free[MI_INTPTR_SHIFT];  // 64-bit에서 6개

    // 현재 사용 중인 블록 수 (빠른 가득성 검사)
    size_t used;

    // 네코딩된 블록 크기 (보안 + 공간 절약)
    // 실제 크기 정보를 인코딩하여 메타데이터 오버헤드 감소
    size_t xblock_size;  // encoded block size

    // Thread-local free list (가장 빠른 할당 경로)
    // 현재 스레드가 최근 해제한 블록들의 링크
    mi_block_t* local_free;
} mi_page_t;

// 2. Segment와 Page 구조
// - Segment: 2MB (huge page 친화적)
//   OS의 huge page와 정렬하여 TLB 미스 최소화
//   메모리 주소 변환 오버헤드 크게 감소
// - Page: Segment 내부를 나눔
//   동일 크기 블록들을 모아둔 관리 단위
// - 장점: 메모리 지역성 극대화!
//   공간적 지역성으로 CPU 캐시 효율성 극대화

// 3. Free list 인코딩 (보안 + 성능)
// XOR 인코딩으로 보안성 강화와 메타데이터 압축
static inline mi_block_t* mi_block_next(mi_page_t* page, mi_block_t* block) {
    // XOR 인코딩으로 heap overflow 공격 방어
    // 예측 불가능한 주소 패턴으로 ROP/JOP 공격 차단
    // 동시에 포인터 앞에 별도 사이즈 필드 없이 공간 절약
    return (mi_block_t*)((uintptr_t)block->next ^ page->keys[0]);
}

// 벤치마크: mimalloc이 빠른 이유
void analyze_mimalloc_performance() {
    // 1. First-fit이 아닌 LIFO
    // -> 캐시 지역성 극대화

    // 2. Bump pointer allocation in fresh pages
    // -> 새 페이지에서는 포인터만 증가 (매우 빠름)

    // 3. Free list sharding
    // -> False sharing 제거

    // 4. Huge OS pages (2MB) 지원
    // -> TLB 미스 감소
}

// 실제 성능 테스트 결과
/*
벤치마크: Redis 6.0 (100GB 데이터셋)
- jemalloc: 기준
- tcmalloc: 5% 빠름, 10% 더 많은 메모리
- mimalloc: 15% 빠름, 5% 적은 메모리 (승자!)
- 특히 작은 할당이 많은 워크로드에서 압도적
*/
```

## 핵심 요점

### 1. TCMalloc의 강점

Thread-local 캐시로 멀티스레드 환경에서의 lock 경합을 최소화하여 뛰어난 성능을 제공합니다.

### 2. JEMalloc의 균형

Arena 구조와 세밀한 크기 클래스로 메모리 효율성과 성능의 균형을 잘 잡았습니다.

### 3. MIMalloc의 혁신

최신 CPU 아키텍처에 최적화된 설계로 false sharing 제거와 캐시 효율성을 극대화했습니다.

---

**이전**: [08-01-malloc-fundamentals.md](./08-01-01-malloc-fundamentals.md)  
**다음**: [08-12-custom-allocators.md](./08-01-04-custom-allocators.md)에서 커스텀 메모리 할당자 구현을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-08-memory-allocator-gc)

- [8.1.2: 메모리 할당자의 내부 구현 개요](./08-01-02-memory-allocator.md)
- [8.1.1: malloc 내부 동작의 진실](./08-01-01-malloc-fundamentals.md)
- [8.1.4: 커스텀 메모리 할당자 구현](./08-01-04-custom-allocators.md)
- [Production: 실전 메모리 최적화 사례](../chapter-09-advanced-memory-management/09-04-02-production-optimization.md)
- [8.2.4: GC 알고리즘과 구현 원리 개요](./08-02-04-gc-algorithms.md)

### 🏷️ 관련 키워드

`memory-allocator`, `tcmalloc`, `jemalloc`, `mimalloc`, `thread-local-cache`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
