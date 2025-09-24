---
tags:
  - balanced
  - heap_management
  - intermediate
  - malloc
  - medium-read
  - memory_allocation
  - memory_fragmentation
  - ptmalloc2
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 8.1.1: malloc 기본 동작

## malloc의 충격적인 진실

### 첫 번째 충격: malloc은 시스템 콜이 아니다

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
```

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
```

### glibc malloc (ptmalloc2)의 내부 구조

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
```

### 메모리 단편화: 조용한 살인자

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
```

## 핵심 요점

### 1. malloc의 본질

malloc은 시스템 콜이 아닌 사용자 공간 라이브러리 함수로, 큰 메모리 덩어리를 미리 확보하여 작은 단위로 분할해 제공합니다.

### 2. ptmalloc2 구조

Arena, Bin, Chunk의 3단계 계층 구조로 다양한 크기의 메모리 요청을 효율적으로 처리합니다.

### 3. 메모리 단편화 문제

무작위 할당/해제 패턴은 Swiss cheese 현상을 야기하며, Memory Pool과 같은 전략으로 해결할 수 있습니다.

---

**다음**: [08-11-allocator-comparison.md](./08-01-03-allocator-comparison.md)에서 tcmalloc, jemalloc, mimalloc의 성능 비교를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 시스템 프로그래밍
-**예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-08-memory-allocator-gc)

- [8.1.2: 메모리 할당자의 내부 구현 개요](./08-01-02-memory-allocator.md)
- [8.1.3: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](./08-01-03-allocator-comparison.md)
- [8.1.4: 커스텀 메모리 할당자 구현](./08-01-04-custom-allocators.md)
- [Production: 실전 메모리 최적화 사례](../chapter-09-advanced-memory-management/09-04-02-production-optimization.md)
- [8.2.4: GC 알고리즘과 구현 원리 개요](./08-02-04-gc-algorithms.md)

### 🏷️ 관련 키워드

`malloc`, `ptmalloc2`, `memory_allocation`, `heap_management`, `memory_fragmentation`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
