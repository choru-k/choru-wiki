---
tags:
  - Memory
  - Allocator
  - malloc
  - Performance
  - SystemProgramming
---

# Chapter 9-1: 메모리 할당자의 내부 구현

## 🎯 이 문서를 읽고 나면 얻을 수 있는 것들

이 문서를 마스터하면, 여러분은:

1. **"malloc이 느려요. 어떻게 최적화하죠?"** - tcmalloc, jemalloc 중 최적의 선택을 할 수 있습니다
2. **"메모리 단편화가 심각해요!"** - Arena, Chunk, Bin의 동작을 이해하고 해결할 수 있습니다
3. **"게임에서 프레임 드랍이 발생해요"** - 커스텀 할당자로 Zero-allocation을 구현할 수 있습니다
4. **"서버가 OOM으로 죽었어요"** - 메모리 할당 패턴을 분석하고 최적화할 수 있습니다

## 1. malloc의 충격적인 진실

### 1.1 첫 번째 충격: malloc은 시스템 콜이 아니다

2015년, 신입 개발자였던 저는 선배에게 이런 질문을 받았습니다:

"malloc을 100만 번 호출하면 시스템 콜이 몇 번 발생할까?"

자신 있게 "100만 번이요!"라고 답했다가... 완전히 틀렸습니다. 😅

**진실은 이렇습니다:**

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/mman.h>

// strace로 확인해보기
int main() {
    // 시스템 콜 추적: strace -e brk,mmap,munmap ./a.out
    
    for (int i = 0; i < 1000000; i++) {
        void* ptr = malloc(100);  // 100바이트 할당
        free(ptr);
    }
    
    // 결과: brk() 시스템 콜 단 몇 번!
    // malloc은 미리 큰 덩어리를 받아서 나눠 쓴다!
}
```text

**실제 동작 방식:**

```text
사용자: malloc(100) 호출
   ↓
malloc: "내 캐시에 있나?" 
   ↓ (없으면)
malloc: brk() 또는 mmap()으로 큰 덩어리(예: 128KB) 할당
   ↓
malloc: 그 중 100바이트만 반환
   ↓
사용자: 다음 malloc(100) 호출
   ↓
malloc: "아까 받은 덩어리에서 또 100바이트 떼주기" (시스템 콜 없음!)
```text

### 1.2 glibc malloc (ptmalloc2)의 내부 구조

제가 메모리 문제로 3일 밤을 새운 후 깨달은 ptmalloc2의 구조입니다:

```c
// ptmalloc2의 핵심 구조체들 (단순화)

// 1. Arena: 스레드별 메모리 관리 영역
// 각 스레드마다 독립적인 Arena를 가져 경합을 줄입니다
struct malloc_arena {
    // 뮤텍스 (멀티스레드 동기화)
    // 스레드 간 Arena 접근 시 동기화 보장
    pthread_mutex_t mutex;
    
    // Fastbins: 작은 크기 전용 (16~80 바이트)
    // LIFO로 동작하여 캐시 지역성 최대화
    // 최근 해제된 메모리를 먼저 재사용해 CPU 캐시 효율성 향상
    mfastbinptr fastbins[NFASTBINS];  // 10개 크기 클래스
    
    // Unsorted bin: 방금 free된 청크들의 임시 저장소
    // 다음 malloc에서 크기가 맞으면 즉시 반환하는 캐시 역할
    mchunkptr unsorted_bin;
    
    // Small bins: 512바이트 미만의 고정 크기 청크
    // 정확한 크기 매칭으로 내부 단편화 최소화
    mchunkptr smallbins[NSMALLBINS];  // 62개 크기별 관리
    
    // Large bins: 512바이트 이상의 가변 크기 청크
    // 크기별로 정렬되어 best-fit 할당 가능
    mchunkptr largebins[NBINS - NSMALLBINS];  // 63개 범위별 관리
    
    // Top chunk: 힙의 최상단 미할당 영역
    // 연속된 큰 메모리 블록, 다른 bin에서 실패 시 최후 수단
    mchunkptr top;
};

// 2. Chunk: 실제 메모리 블록의 헤더 구조
struct malloc_chunk {
    // 이전 청크 크기 (인접 청크가 free일 때만 유효)
    // 병합(coalescing) 시 이전 청크 찾기 위해 사용
    size_t prev_size;
    
    // 현재 청크 크기 + 상태 플래그 (하위 3비트)
    // PREV_INUSE, IS_MMAPPED, NON_MAIN_ARENA 플래그 포함
    size_t size;
    
    // free 상태일 때만 사용되는 링크드 리스트 포인터
    struct malloc_chunk* fd;  // 다음 free 청크 (forward)
    struct malloc_chunk* bk;  // 이전 free 청크 (backward)
    
    // Large bin에서만 사용하는 크기별 정렬 포인터
    // 같은 bin 내에서 크기순 정렬을 위한 추가 링크
    struct malloc_chunk* fd_nextsize;
    struct malloc_chunk* bk_nextsize;
};

// 3. 실제 할당 과정 - 크기별 최적화된 경로 선택
void* ptmalloc_malloc(size_t size) {
    // Step 1: 요청 크기에 따른 할당 전략 결정
    // 각 크기 범위마다 다른 데이터 구조와 알고리즘 사용
    
    if (size <= 80) {
        // Fastbin 경로 (가장 빠른 할당)
        // 단일 연결 리스트로 O(1) 할당/해제
        // 동기화 없이 빠른 접근, 작은 객체에 최적화
        return fastbin_malloc(size);
    } else if (size <= 512) {
        // Smallbin 경로 (정확한 크기 매칭)
        // 고정 크기 bin으로 내부 단편화 없음
        // 이중 연결 리스트로 중간 제거 효율적
        return smallbin_malloc(size);
    } else if (size <= 128 * 1024) {
        // Largebin 경로 (best-fit 할당)
        // 크기별 정렬로 가장 적합한 청크 선택
        // 큰 청크를 분할하여 내부 단편화 최소화
        return largebin_malloc(size);
    } else {
        // mmap 직접 사용 (거대한 할당)
        // 힙 영역을 건드리지 않고 별도 매핑
        // 해제 시 즉시 OS에 반환되어 메모리 효율적
        return mmap_malloc(size);
    }
}
```text

### 1.3 메모리 단편화: 조용한 살인자

**실제 프로덕션 장애 사례 (2019년):**

```c
// 문제의 코드 (단순화)
struct Message {
    char data[1000];
};

void process_messages() {
    std::vector<Message*> messages;
    
    // 피크 시간: 10만 개 메시지 (100MB)
    for (int i = 0; i < 100000; i++) {
        messages.push_back(new Message());
    }
    
    // 90% 삭제 (무작위)
    for (int i = 0; i < 90000; i++) {
        int idx = rand() % messages.size();
        delete messages[idx];
        messages.erase(messages.begin() + idx);
    }
    
    // 문제: 90MB를 free했지만 OS에 반환 안 됨!
    // 이유: 메모리 단편화 (Swiss cheese 현상)
    
    // [할당][빈공간][할당][빈공간][할당]...
    // OS는 연속된 큰 블록만 회수 가능!
}

// 해결책: Memory Pool
class MessagePool {
private:
    static constexpr size_t POOL_SIZE = 100000;
    Message pool[POOL_SIZE];
    std::stack<Message*> available;
    
public:
    MessagePool() {
        for (int i = 0; i < POOL_SIZE; i++) {
            available.push(&pool[i]);
        }
    }
    
    Message* allocate() {
        if (available.empty()) return nullptr;
        Message* msg = available.top();
        available.pop();
        return msg;
    }
    
    void deallocate(Message* msg) {
        available.push(msg);
        // 실제로 메모리 해제 없음! 재사용만!
    }
};
```text

## 2. 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc

### 2.1 TCMalloc: Google의 해답

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
```text

### 2.2 JEMalloc: Facebook의 선택

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
    // Large bins: 4KB~4MB, 베스트핯 할당으로 단편화 최소화
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
```text

### 2.3 MIMalloc: Microsoft의 최신작

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
```text

## 3. 커스텀 메모리 할당자 구현

### 3.1 Memory Pool: 게임 엔진의 비밀

제가 게임 회사에서 일할 때 배운 60 FPS의 비밀:

```c++
// 프레임 할당자: 매 프레임마다 리셋
class FrameAllocator {
private:
    static constexpr size_t FRAME_MEMORY_SIZE = 10 * 1024 * 1024;  // 10MB
    uint8_t memory[FRAME_MEMORY_SIZE];
    size_t offset = 0;
    
public:
    void* allocate(size_t size, size_t alignment = 8) {
        // 정렬
        offset = (offset + alignment - 1) & ~(alignment - 1);
        
        if (offset + size > FRAME_MEMORY_SIZE) {
            throw std::bad_alloc();
        }
        
        void* ptr = &memory[offset];
        offset += size;
        return ptr;
    }
    
    void reset() {
        offset = 0;  // 모든 메모리 "해제" (O(1)!)
    }
    
    // 개별 해제 불가능 - 전체만 리셋!
    void deallocate(void* ptr) = delete;
};

// 사용 예: 게임 루프
class GameEngine {
    FrameAllocator frameAlloc;
    
    void gameLoop() {
        while (running) {
            // 프레임 시작
            frameAlloc.reset();
            
            // 임시 객체들 할당 (해제 걱정 없음!)
            auto* particles = frameAlloc.allocate<Particle>(1000);
            auto* renderCommands = frameAlloc.allocate<RenderCommand>(500);
            
            updatePhysics(particles);
            render(renderCommands);
            
            // 프레임 끝 - 자동으로 모든 메모리 회수!
            // malloc/free 호출 0번!
        }
    }
};

// Ring Buffer 할당자: 네트워크 패킷용
template<size_t SIZE>
class RingAllocator {
private:
    uint8_t buffer[SIZE];
    std::atomic<size_t> head{0};
    std::atomic<size_t> tail{0};
    
public:
    void* allocate(size_t size) {
        size_t current_head = head.load();
        size_t new_head = (current_head + size) % SIZE;
        
        // CAS로 lock-free 할당
        while (!head.compare_exchange_weak(current_head, new_head)) {
            new_head = (current_head + size) % SIZE;
        }
        
        return &buffer[current_head];
    }
    
    void deallocate_oldest(size_t size) {
        tail.fetch_add(size);
        tail %= SIZE;
    }
};
```text

### 3.2 Slab Allocator: Linux 커널의 선택

Linux 커널이 사용하는 Slab allocator 구현:

```c
// Slab Allocator: 같은 크기 객체 전용
template<typename T>
class SlabAllocator {
private:
    struct Slab {
        static constexpr size_t OBJECTS_PER_SLAB = 64;
        
        alignas(T) uint8_t memory[sizeof(T) * OBJECTS_PER_SLAB];
        std::bitset<OBJECTS_PER_SLAB> used;
        Slab* next = nullptr;
        
        T* allocate() {
            for (size_t i = 0; i < OBJECTS_PER_SLAB; i++) {
                if (!used[i]) {
                    used[i] = true;
                    return reinterpret_cast<T*>(&memory[i * sizeof(T)]);
                }
            }
            return nullptr;
        }
        
        bool deallocate(T* ptr) {
            auto offset = reinterpret_cast<uint8_t*>(ptr) - memory;
            if (offset >= 0 && offset < sizeof(memory)) {
                size_t index = offset / sizeof(T);
                used[index] = false;
                return true;
            }
            return false;
        }
        
        bool is_empty() const { return used.none(); }
        bool is_full() const { return used.all(); }
    };
    
    Slab* partial_slabs = nullptr;  // 부분적으로 찬 슬랩
    Slab* full_slabs = nullptr;     // 완전히 찬 슬랩
    Slab* empty_slabs = nullptr;    // 빈 슬랩 (캐시)
    
public:
    T* allocate() {
        // 1. Partial slab에서 시도
        if (partial_slabs) {
            T* obj = partial_slabs->allocate();
            if (obj) {
                if (partial_slabs->is_full()) {
                    move_to_full(partial_slabs);
                }
                return obj;
            }
        }
        
        // 2. Empty slab 활용
        if (empty_slabs) {
            Slab* slab = empty_slabs;
            empty_slabs = empty_slabs->next;
            slab->next = partial_slabs;
            partial_slabs = slab;
            return slab->allocate();
        }
        
        // 3. 새 slab 할당
        Slab* new_slab = new Slab();
        new_slab->next = partial_slabs;
        partial_slabs = new_slab;
        return new_slab->allocate();
    }
    
    void deallocate(T* ptr) {
        // 모든 slab 검색 (실제로는 더 효율적인 방법 사용)
        if (deallocate_from_list(ptr, full_slabs)) {
            // full -> partial로 이동
        } else if (deallocate_from_list(ptr, partial_slabs)) {
            // 빈 slab은 empty 리스트로
        }
    }
};

// 실제 사용: 커널 객체 캐시
struct task_struct {  // 프로세스 구조체
    pid_t pid;
    // ... 수많은 필드들
};

SlabAllocator<task_struct> task_cache;  // 프로세스 생성/소멸 최적화!
```text

### 3.3 Buddy System: 단편화 방지의 정석

```c++
// Buddy System: 2의 거듭제곱 크기로 분할/병합
class BuddyAllocator {
private:
    static constexpr size_t MIN_BLOCK_SIZE = 64;      // 최소 64B
    static constexpr size_t MAX_BLOCK_SIZE = 1 << 20; // 최대 1MB
    static constexpr size_t NUM_LEVELS = 15;           // log2(1MB/64B) + 1
    
    struct Block {
        size_t size;
        bool free;
        Block* buddy;
        Block* next;
        Block* prev;
    };
    
    // 각 크기별 free list
    Block* free_lists[NUM_LEVELS];
    uint8_t* memory_pool;
    
    size_t size_to_level(size_t size) {
        size = std::max(size, MIN_BLOCK_SIZE);
        return __builtin_clzll(1) - __builtin_clzll(size - 1);
    }
    
public:
    void* allocate(size_t size) {
        size_t level = size_to_level(size);
        
        // 해당 레벨에 free block이 있는지 확인
        for (size_t i = level; i < NUM_LEVELS; i++) {
            if (free_lists[i]) {
                Block* block = free_lists[i];
                remove_from_free_list(block, i);
                
                // 필요하면 분할
                while (i > level) {
                    i--;
                    Block* buddy = split_block(block, i);
                    add_to_free_list(buddy, i);
                }
                
                block->free = false;
                return block + 1;  // 헤더 다음 주소 반환
            }
        }
        
        return nullptr;  // 메모리 부족
    }
    
    void deallocate(void* ptr) {
        Block* block = static_cast<Block*>(ptr) - 1;
        block->free = true;
        
        // Buddy와 병합 시도
        size_t level = size_to_level(block->size);
        
        while (level < NUM_LEVELS - 1) {
            Block* buddy = find_buddy(block, level);
            
            if (!buddy || !buddy->free) {
                break;  // 병합 불가
            }
            
            // 병합
            remove_from_free_list(buddy, level);
            block = merge_blocks(block, buddy);
            level++;
        }
        
        add_to_free_list(block, level);
    }
    
    Block* find_buddy(Block* block, size_t level) {
        size_t block_size = 1 << (level + 6);  // MIN_BLOCK_SIZE = 64 = 2^6
        uintptr_t addr = reinterpret_cast<uintptr_t>(block);
        uintptr_t buddy_addr = addr ^ block_size;  // XOR로 buddy 주소 계산!
        return reinterpret_cast<Block*>(buddy_addr);
    }
};

// Buddy System의 장점 실측
void benchmark_fragmentation() {
    // 시나리오: 다양한 크기 할당/해제 반복
    std::vector<void*> ptrs;
    
    // 일반 malloc
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 100000; i++) {
        size_t size = 1 << (rand() % 10 + 6);  // 64B ~ 32KB
        ptrs.push_back(malloc(size));
        
        if (rand() % 2 && !ptrs.empty()) {
            free(ptrs.back());
            ptrs.pop_back();
        }
    }
    
    // 메모리 사용량 측정
    size_t malloc_usage = get_memory_usage();
    
    // Buddy System
    BuddyAllocator buddy;
    ptrs.clear();
    
    for (int i = 0; i < 100000; i++) {
        size_t size = 1 << (rand() % 10 + 6);
        ptrs.push_back(buddy.allocate(size));
        
        if (rand() % 2 && !ptrs.empty()) {
            buddy.deallocate(ptrs.back());
            ptrs.pop_back();
        }
    }
    
    size_t buddy_usage = buddy.get_memory_usage();
    
    printf("일반 malloc: %zu MB (단편화 심함), ", malloc_usage / 1024 / 1024);
    printf("Buddy System: %zu MB (단편화 최소), ", buddy_usage / 1024 / 1024);
    // 결과: Buddy가 20-30% 적은 메모리 사용!
}
```text

## 4. 실전 메모리 최적화 사례

### 4.1 Netflix의 jemalloc 튜닝

Netflix 엔지니어가 공유한 실제 튜닝 경험:

```c
// Netflix의 jemalloc 설정 (환경변수)
export MALLOC_CONF="background_thread:true,\
    metadata_thp:auto,\
    dirty_decay_ms:10000,\
    muzzy_decay_ms:0,\
    narenas:4,\
    lg_tcache_max:16"

// 코드로 동적 튜닝
void netflix_jemalloc_tuning() {
    // 1. Arena 수 제한 (NUMA 노드당 1개)
    unsigned narenas = 4;
    je_mallctl("opt.narenas", NULL, NULL, &narenas, sizeof(narenas));
    
    // 2. Transparent Huge Pages 활성화
    bool thp = true;
    je_mallctl("opt.metadata_thp", NULL, NULL, &thp, sizeof(thp));
    
    // 3. 통계 수집 (프로파일링용)
    bool stats = true;
    je_mallctl("opt.stats_print", NULL, NULL, &stats, sizeof(stats));
    
    // 결과:
    // - 메모리 사용량 25% 감소
    // - P99 레이턴시 15% 개선
    // - 페이지 폴트 50% 감소
}

// 실시간 메모리 프로파일링
void profile_memory_usage() {
    // 메모리 통계 덤프
    je_malloc_stats_print(NULL, NULL, NULL);
    
    // 특정 Arena 통계
    size_t allocated, active, metadata, resident, mapped;
    size_t sz = sizeof(size_t);
    
    je_mallctl("stats.allocated", &allocated, &sz, NULL, 0);
    je_mallctl("stats.active", &active, &sz, NULL, 0);
    je_mallctl("stats.metadata", &metadata, &sz, NULL, 0);
    je_mallctl("stats.resident", &resident, &sz, NULL, 0);
    je_mallctl("stats.mapped", &mapped, &sz, NULL, 0);
    
    printf("Allocated: %.2f MB, ", allocated / 1048576.0);
    printf("Active: %.2f MB, ", active / 1048576.0);
    printf("Metadata: %.2f MB, ", metadata / 1048576.0);
    printf("Resident: %.2f MB, ", resident / 1048576.0);
    printf("Mapped: %.2f MB, ", mapped / 1048576.0);
    printf("Fragmentation: %.2f%%, ", 
           (1.0 - (double)allocated / active) * 100);
}
```text

### 4.2 Discord의 Go 메모리 최적화

Discord가 Go 서비스에서 메모리를 70% 줄인 방법:

```go
// 문제: Go의 메모리 반환 정책이 너무 보수적
// 해결: GOGC와 Memory Limit 튜닝

package main

import (
    "runtime"
    "runtime/debug"
    "time"
)

// Discord의 메모리 최적화 전략
func optimizeGoMemory() {
    // 1. GOGC 조정 (기본 100)
    debug.SetGCPercent(50)  // 더 자주 GC 실행
    
    // 2. Memory Limit 설정 (Go 1.19+)
    debug.SetMemoryLimit(8 << 30)  // 8GB 제한
    
    // 3. 수동 GC 트리거 (idle 시간)
    go func() {
        ticker := time.NewTicker(30 * time.Second)
        for range ticker.C {
            var m runtime.MemStats
            runtime.ReadMemStats(&m)
            
            // Idle 상태면 메모리 반환
            if m.NumGC > 0 && m.Alloc < m.TotalAlloc/10 {
                runtime.GC()
                debug.FreeOSMemory()  // OS에 메모리 반환!
            }
        }
    }()
    
    // 4. Ballast 기법 (큰 빈 슬라이스)
    // GC가 너무 자주 실행되는 것 방지
    ballast := make([]byte, 1<<30)  // 1GB
    runtime.KeepAlive(ballast)
}

// Sync.Pool로 할당 최소화
var bufferPool = sync.Pool{
    New: func() interface{} {
        return make([]byte, 4096)
    },
}

func processRequest(data []byte) {
    // Pool에서 버퍼 가져오기
    buf := bufferPool.Get().([]byte)
    defer bufferPool.Put(buf)  // 사용 후 반환
    
    // buf 사용...
    copy(buf, data)
    
    // Zero allocation!
}

// 결과: Discord의 성과
// - 메모리 사용량: 10GB -> 3GB (70% 감소)
// - GC 일시정지: 10ms -> 1ms (90% 감소)
// - 처리량: 30% 증가
```text

### 4.3 게임 엔진의 Zero-allocation 패턴

Unreal Engine 스타일의 메모리 관리:

```c++
// Object Pool + Frame Allocator 조합
class GameMemoryManager {
private:
    // 타입별 Object Pool
    template<typename T>
    struct TypedPool {
        std::vector<T> objects;
        std::stack<T*> available;
        
        TypedPool(size_t initial_size) {
            objects.reserve(initial_size);
            for (size_t i = 0; i < initial_size; i++) {
                objects.emplace_back();
                available.push(&objects.back());
            }
        }
        
        T* allocate() {
            if (available.empty()) {
                objects.emplace_back();
                return &objects.back();
            }
            T* obj = available.top();
            available.pop();
            return obj;
        }
        
        void deallocate(T* obj) {
            obj->~T();  // 소멸자 호출
            new(obj) T();  // 재생성
            available.push(obj);
        }
    };
    
    // 프레임별 통계
    struct FrameStats {
        size_t allocations = 0;
        size_t deallocations = 0;
        size_t bytes_allocated = 0;
        size_t peak_usage = 0;
    };
    
    TypedPool<Particle> particle_pool{10000};
    TypedPool<Bullet> bullet_pool{1000};
    TypedPool<Enemy> enemy_pool{100};
    
    FrameAllocator frame_allocator;
    FrameStats stats;
    
public:
    // 매 프레임 시작
    void begin_frame() {
        frame_allocator.reset();
        stats = FrameStats{};
    }
    
    // 타입별 할당
    template<typename T>
    T* allocate() {
        stats.allocations++;
        stats.bytes_allocated += sizeof(T);
        
        if constexpr (std::is_same_v<T, Particle>) {
            return particle_pool.allocate();
        } else if constexpr (std::is_same_v<T, Bullet>) {
            return bullet_pool.allocate();
        } else {
            // 임시 객체는 frame allocator 사용
            return frame_allocator.allocate<T>();
        }
    }
    
    // 프레임 끝
    void end_frame() {
        if (stats.allocations > 0) {
            printf("Frame allocations: %zu (%.2f KB), ",
                   stats.allocations,
                   stats.bytes_allocated / 1024.0);
        }
        
        // 목표: allocations = 0 (완전한 zero-allocation)
    }
};

// 실제 게임 루프
void game_loop() {
    GameMemoryManager mem_mgr;
    
    while (running) {
        mem_mgr.begin_frame();
        
        // 게임 로직 (할당 없음!)
        update_physics();
        update_ai();
        render();
        
        mem_mgr.end_frame();
        
        // 60 FPS 유지!
    }
}
```text

## 5. 마무리: 메모리 할당자 선택 가이드

10년간 경험을 바탕으로 정리한 선택 기준:

### 🎯 상황별 최적 선택

| 상황 | 추천 할당자 | 이유 |
|------|------------|------|
| 일반 서버 | jemalloc | 균형잡힌 성능과 메모리 효율 |
| 멀티스레드 heavy | tcmalloc | Thread-local 캐시 최적화 |
| 작은 객체 많음 | mimalloc | 최신 기술, 가장 빠름 |
| 실시간 시스템 | Custom Pool | 예측 가능한 성능 |
| 임베디드 | Buddy System | 단편화 최소화 |
| 게임 엔진 | Frame Allocator | Zero-allocation 가능 |

### 💡 핵심 교훈

1. **"malloc은 공짜가 아니다"**
   - 시스템 콜은 비싸다
   - 할당자 내부 로직도 비용
   - 가능하면 재사용하라

2. **"측정 없이 최적화 없다"**
   - 메모리 프로파일링 필수
   - 단편화율 모니터링
   - 할당 패턴 분석

3. **"One size doesn't fit all"**
   - 워크로드별 최적 할당자가 다름
   - 필요하면 커스텀 할당자
   - 하이브리드 접근도 고려

메모리 할당자는 시스템 성능의 숨은 영웅입니다. 이제 여러분도 그 비밀을 알게 되었습니다!

## 참고 자료

- [TCMalloc Design Doc](https://google.github.io/tcmalloc/design.html)
- [JEMalloc Documentation](http://jemalloc.net/jemalloc.3.html)
- [MIMalloc Technical Report](https://www.microsoft.com/en-us/research/publication/mimalloc-free-list-sharding-in-action/)
- [Linux Slab Allocator](https://www.kernel.org/doc/gorman/html/understand/understand011.html)
- [Discord's Go Memory Optimization](https://discord.com/blog/why-discord-is-switching-from-go-to-rust)
