---
tags:
  - Memory
  - Allocator
  - malloc
  - tcmalloc
  - jemalloc
  - Performance
---

# 2-6: 메모리 할당자 선택과 최적화 - "malloc이 너무 느려요"

## 이 문서를 읽으면 답할 수 있는 질문들

- 왜 같은 malloc인데 성능이 다를까요?
- tcmalloc과 jemalloc 중 어느 것을 써야 하나요?
- 메모리 단편화가 성능에 미치는 영향은?
- 메모리 할당 패턴을 어떻게 최적화하나요?
- malloc_stats()와 malloc_info()로 무엇을 알 수 있나요?

## 들어가며: 메모리 할당의 숨겨진 비용

"왜 우리 서버는 메모리가 충분한데도 malloc이 느릴까?"

이런 의문을 가져보신 적 있나요? 메모리 할당은 단순해 보이지만, 실제로는 매우 복잡한 과정입니다.

```mermaid
sequenceDiagram
    participant App as 애플리케이션
    participant Malloc as malloc()
    participant Heap as 힙 관리자
    participant OS as 운영체제
    
    App->>Malloc: malloc(1024)
    Malloc->>Heap: 적절한 블록 찾기
    Note over Heap: 빈 블록 검색, 분할 또는 합병, 메타데이터 업데이트
    Heap-->>Malloc: 메모리 블록 반환
    
    alt 힙에 공간 부족
        Malloc->>OS: brk() 또는 mmap()
        OS-->>Malloc: 새 메모리 영역
        Malloc->>Heap: 새 블록 추가
    end
    
    Malloc-->>App: 메모리 포인터
```text

이 과정에서 **성능 병목**이 생기는 이유:

1. **검색 오버헤드**: 적절한 크기의 빈 블록 찾기
2. **메타데이터 관리**: 할당/해제 정보 추적
3. **동기화 비용**: 멀티스레드 환경에서의 락
4. **단편화**: 메모리가 있어도 사용 못 하는 상황

## 1. 메모리 할당자 동작 원리

### 1.1 glibc malloc (ptmalloc2)의 구조

Linux의 기본 malloc 구현체인 ptmalloc2의 내부를 살펴봅시다:

```mermaid
graph TD
    subgraph "ptmalloc2 구조"
        MAIN_ARENA["Main Arena, 메인 스레드용"]
        THREAD_ARENA["Thread Arena, 스레드별 힙"]
        
        subgraph "Arena 내부"
            FASTBINS["Fast Bins, 작은 크기 (16-80바이트)"]
            SMALLBINS["Small Bins, 중간 크기 (<512바이트)"]  
            LARGEBINS["Large Bins, 큰 크기 (>=512바이트)"]
            UNSORTED["Unsorted Bin, 임시 저장소"]
        end
        
        MAIN_ARENA --> FASTBINS
        THREAD_ARENA --> SMALLBINS
    end
    
    subgraph "메모리 요청 처리"
        REQ["메모리 요청"] --> SIZE{"크기 확인"}
        SIZE -->|작음| FASTBINS
        SIZE -->|중간| SMALLBINS  
        SIZE -->|큼| LARGEBINS
    end
```text

**각 구조의 특징**:

- **Fast Bins**: LIFO 방식, 락 없음 → 빠름
- **Small Bins**: 정확한 크기 매칭 → 단편화 적음
- **Large Bins**: 크기별 정렬 → 검색 오버헤드 있음

### 1.2 메모리 단편화의 실체

메모리 단편화가 어떻게 성능을 저하시키는지 시각화해봅시다:

```mermaid
graph LR
    subgraph "단편화 발생 과정"
        INIT["초기 상태, [        8KB 빈 공간        ]"]
        ALLOC1["1KB씩 8개 할당, [1][2][3][4][5][6][7][8]"]
        FREE["홀수 번째 해제, [X][2][X][4][X][6][X][8]"]
        FRAG["단편화 발생, 4KB 빈 공간, 하지만, 2KB 할당 요청 실패!"]
    end
    
    INIT --> ALLOC1
    ALLOC1 --> FREE
    FREE --> FRAG
    
    style FRAG fill:#ffcccb
```text

**단편화 측정 방법**:

```bash
# 시스템 전체 메모리 단편화 확인
$ cat /proc/buddyinfo

# 프로세스별 메모리 단편화
$ cat /proc/PID/smaps | awk '/Size:/{total+=$2} /Rss:/{rss+=$2} END{printf "내부 단편화: %.1f%%, ", (total-rss)/total*100}'
```text

## 2. 대안 메모리 할당자들

### 2.1 tcmalloc (Thread-Caching Malloc)

Google이 개발한 고성능 메모리 할당자입니다:

```mermaid
graph TD
    subgraph "tcmalloc 아키텍처"
        FRONTEND["Frontend, 스레드 로컬 캐시"]
        CENTRAL["Central Heap, 공유 자원"]
        BACKEND["Backend, 운영체제"]
        
        subgraph "스레드별 캐시"
            SMALL_CACHE["Small Object Cache, (<32KB)"]
            LARGE_CACHE["Large Object Cache, (>32KB)"]
        end
        
        FRONTEND --> SMALL_CACHE
        FRONTEND --> LARGE_CACHE
        SMALL_CACHE --> CENTRAL
        LARGE_CACHE --> CENTRAL
        CENTRAL --> BACKEND
    end
    
    style FRONTEND fill:#c8e6c9
    style CENTRAL fill:#fff3e0
```text

**tcmalloc 설치 및 사용**:

```bash
# 설치 (Ubuntu)
$ sudo apt-get install libtcmalloc-minimal4

# 사용법 1: LD_PRELOAD
$ LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libtcmalloc.so.4 ./program

# 사용법 2: 링크 시 포함
$ gcc -ltcmalloc program.c -o program

# 성능 프로파일링 
$ LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libtcmalloc_and_profiler.so.4 \
  CPUPROFILE=profile.prof ./program
$ pprof --text ./program profile.prof
```text

### 2.2 jemalloc

Facebook(Meta)이 개발한 또 다른 고성능 할당자:

```bash
# 설치
$ sudo apt-get install libjemalloc2

# 사용
$ LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2 ./program

# 통계 확인
$ export MALLOC_CONF="stats_print:true"
$ ./program
```text

**jemalloc의 핵심 특징**:

- Size class 기반 할당
- 메모리 단편화 최소화
- 뛰어난 멀티스레드 성능

### 2.3 성능 비교 벤치마크

실제로 어떤 할당자가 빠른지 확인해봅시다:

```c
// malloc_benchmark.c
#include <stdio.h>
#include <stdlib.h>
#include <sys/time.h>

double get_time() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

int main() {
    const int iterations = 1000000;
    const int size = 1024;
    void **ptrs = malloc(sizeof(void*) * iterations);
    
    // 할당 테스트
    double start = get_time();
    for (int i = 0; i < iterations; i++) {
        ptrs[i] = malloc(size);
    }
    double alloc_time = get_time() - start;
    
    // 해제 테스트  
    start = get_time();
    for (int i = 0; i < iterations; i++) {
        free(ptrs[i]);
    }
    double free_time = get_time() - start;
    
    printf("Allocation: %.3f seconds, ", alloc_time);
    printf("Deallocation: %.3f seconds, ", free_time);
    printf("Total: %.3f seconds, ", alloc_time + free_time);
    
    free(ptrs);
    return 0;
}
```text

**벤치마크 실행**:

```bash
$ gcc -O2 malloc_benchmark.c -o benchmark

# glibc malloc
$ ./benchmark
Allocation: 0.234 seconds
Deallocation: 0.156 seconds
Total: 0.390 seconds

# tcmalloc
$ LD_PRELOAD=/usr/lib/libtcmalloc.so.4 ./benchmark  
Allocation: 0.098 seconds
Deallocation: 0.067 seconds
Total: 0.165 seconds  # 2.4배 빠름!

# jemalloc
$ LD_PRELOAD=/usr/lib/libjemalloc.so.2 ./benchmark
Allocation: 0.112 seconds  
Deallocation: 0.073 seconds
Total: 0.185 seconds  # 2.1배 빠름!
```text

## 3. 메모리 할당 패턴 최적화

### 3.1 할당 패턴 분석

애플리케이션의 메모리 할당 패턴을 이해하는 것이 최적화의 시작입니다:

```c
// allocation_profiler.c
#include <stdio.h>
#include <malloc.h>

// malloc 훅 함수
void* malloc_hook(size_t size, const void *caller) {
    static __thread int in_hook = 0;
    void *result;
    
    if (in_hook) return malloc(size);
    
    in_hook = 1;
    result = malloc(size);
    
    // 크기별 통계 수집
    if (size <= 64) small_allocs++;
    else if (size <= 1024) medium_allocs++;
    else large_allocs++;
    
    printf("ALLOC: %zu bytes from %p, ", size, caller);
    in_hook = 0;
    return result;
}

// 훅 등록
__malloc_hook = malloc_hook;
```text

### 3.2 메모리 풀 패턴

빈번한 할당/해제를 피하는 메모리 풀 구현:

```c
// memory_pool.c
typedef struct block {
    struct block *next;
} block_t;

typedef struct {
    block_t *free_list;
    void *memory;
    size_t block_size;
    size_t pool_size;
} memory_pool_t;

memory_pool_t* pool_create(size_t block_size, size_t num_blocks) {
    memory_pool_t *pool = malloc(sizeof(memory_pool_t));
    pool->block_size = block_size;
    pool->pool_size = num_blocks;
    
    // 큰 메모리 블록 하나만 할당
    pool->memory = malloc(block_size * num_blocks);
    
    // free list 초기화
    pool->free_list = NULL;
    char *ptr = (char*)pool->memory;
    for (size_t i = 0; i < num_blocks; i++) {
        block_t *block = (block_t*)ptr;
        block->next = pool->free_list;
        pool->free_list = block;
        ptr += block_size;
    }
    
    return pool;
}

void* pool_alloc(memory_pool_t *pool) {
    if (!pool->free_list) return NULL;  // 풀 고갈
    
    block_t *block = pool->free_list;
    pool->free_list = block->next;
    return block;
}

void pool_free(memory_pool_t *pool, void *ptr) {
    block_t *block = (block_t*)ptr;
    block->next = pool->free_list;
    pool->free_list = block;
}
```text

**메모리 풀의 장점**:

- O(1) 할당/해제
- 단편화 없음
- 캐시 친화적

## 4. 할당자별 성능 튜닝

### 4.1 glibc malloc 튜닝

```bash
# 환경 변수로 튜닝
export MALLOC_ARENA_MAX=2        # 아레나 개수 제한
export MALLOC_MMAP_THRESHOLD_=1048576  # mmap 임계값 1MB
export MALLOC_TRIM_THRESHOLD_=131072   # trim 임계값 128KB

# mallopt()로 런타임 튜닝
#include <malloc.h>
mallopt(M_ARENA_MAX, 2);         # 최대 아레나 수
mallopt(M_MMAP_THRESHOLD, 1024*1024);  # mmap 임계값
```text

### 4.2 tcmalloc 튜닝

```bash
# 환경 변수 설정
export TCMALLOC_SAMPLE_PARAMETER=1048576  # 샘플링 간격
export TCMALLOC_MAX_TOTAL_THREAD_CACHE_BYTES=33554432  # 스레드 캐시 크기
export TCMALLOC_CENTRAL_CACHE_DEFAULT_TO_SPAN=true
```text

### 4.3 jemalloc 튜닝

```bash
# 설정 문자열로 튜닝
export MALLOC_CONF="dirty_decay_ms:10000,muzzy_decay_ms:10000"

# 런타일임 튜닝
echo "background_thread:true" > /etc/malloc.conf
```text

## 5. 메모리 할당 모니터링

### 5.1 할당자별 통계 확인

**glibc malloc**:

```c
#include <malloc.h>

void print_malloc_stats() {
    struct mallinfo info = mallinfo();
    printf("Total allocated: %d bytes, ", info.uordblks);
    printf("Total free: %d bytes, ", info.fordblks);
    printf("Number of chunks: %d, ", info.ordblks);
    
    malloc_stats();  // 상세 통계 출력
}
```text

**tcmalloc**:

```bash
# 힙 프로파일 생성
$ HEAPPROFILE=/tmp/heap ./program
$ pprof --text ./program /tmp/heap.0001.heap
```text

**jemalloc**:

```bash
# 통계 출력 활성화
$ export MALLOC_CONF="stats_print:true"
$ ./program
```text

### 5.2 실시간 메모리 모니터링

```python
#!/usr/bin/env python3
# malloc_monitor.py
import psutil
import time
import matplotlib.pyplot as plt
from collections import deque

def monitor_process(pid, duration=300):
    process = psutil.Process(pid)
    times = deque(maxlen=duration)
    memory_usage = deque(maxlen=duration)
    
    plt.ion()
    fig, ax = plt.subplots()
    
    start_time = time.time()
    
    while time.time() - start_time < duration:
        try:
            mem_info = process.memory_info()
            current_time = time.time() - start_time
            
            times.append(current_time)
            memory_usage.append(mem_info.rss / 1024 / 1024)  # MB
            
            # 그래프 업데이트
            ax.clear()
            ax.plot(list(times), list(memory_usage), 'b-')
            ax.set_xlabel('Time (seconds)')
            ax.set_ylabel('Memory Usage (MB)')
            ax.set_title(f'Process {pid} Memory Usage')
            plt.pause(0.1)
            
            time.sleep(1)
            
        except psutil.NoSuchProcess:
            print(f"Process {pid} no longer exists")
            break
    
    plt.ioff()
    plt.show()

if __name__ == '__main__':
    import sys
    if len(sys.argv) != 2:
        print("Usage: python malloc_monitor.py <pid>")
        sys.exit(1)
    
    monitor_process(int(sys.argv[1]))
```text

## 6. 실무 할당자 선택 가이드

### 6.1 워크로드별 추천 할당자

```mermaid
graph TD
    WORKLOAD{워크로드 타입} --> WEB[웹 서버]
    WORKLOAD --> DB[데이터베이스]  
    WORKLOAD --> GAME[게임 서버]
    WORKLOAD --> HPC[고성능 컴퓨팅]
    
    WEB --> JEMALLOC[jemalloc, 균형잡힌 성능]
    DB --> TCMALLOC[tcmalloc, 큰 메모리 효율적]
    GAME --> CUSTOM[커스텀 풀, 예측 가능한 패턴]
    HPC --> GLIBC[glibc malloc, 안정성 중시]
```text

### 6.2 할당자 교체 시 고려사항

**성능 측정 방법**:

```bash
#!/bin/bash
# allocator_benchmark.sh

echo "Testing glibc malloc..."
time ./your_program > /dev/null
GLIBC_TIME=$?

echo "Testing tcmalloc..."  
time LD_PRELOAD=libtcmalloc.so ./your_program > /dev/null
TCMALLOC_TIME=$?

echo "Testing jemalloc..."
time LD_PRELOAD=libjemalloc.so ./your_program > /dev/null  
JEMALLOC_TIME=$?

echo "Results:"
echo "glibc: ${GLIBC_TIME}s"
echo "tcmalloc: ${TCMALLOC_TIME}s" 
echo "jemalloc: ${JEMALLOC_TIME}s"
```text

**메모리 사용량 비교**:

```bash
# 최대 메모리 사용량 측정
$ /usr/bin/time -v ./program 2>&1 | grep "Maximum resident set size"
```text

## 7. 정리와 실무 적용

메모리 할당자 선택은 애플리케이션 성능에 큰 영향을 줍니다. 하지만 **은탄환은 없습니다** - 워크로드에 따라 최적의 선택이 다릅니다.

### 7.1 선택 기준

1. **성능이 최우선** → tcmalloc 또는 jemalloc 시도
2. **안정성이 중요** → glibc malloc 유지  
3. **메모리 사용량 최소화** → jemalloc 고려
4. **멀티스레드 성능** → tcmalloc 고려

### 7.2 실무 체크리스트

- [ ] 현재 할당 패턴 프로파일링 완료
- [ ] 대안 할당자로 벤치마크 수행
- [ ] 메모리 단편화 측정 및 비교
- [ ] 장기 실행 안정성 테스트
- [ ] 운영 환경에서 점진적 롤아웃

다음 섹션에서는 메모리 사용량 분석과 시스템 튜닝에 대해 더 깊이 다뤄보겠습니다.

효율적인 메모리 관리로 더 빠른 서비스를 만들어봅시다! ⚡
