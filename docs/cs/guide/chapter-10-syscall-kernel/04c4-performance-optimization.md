---
tags:
  - Kernel
  - UserSpace
  - CacheOptimization
  - FalseSharing
  - Performance
---

# Chapter 10-4c4: 성능 최적화와 캐시 관리

## 🎯 무엇을 배우게 될까요?

이 문서를 마스터하면:

1. **"False Sharing은 무엇인가요?"** - 캐시 라인 충돌으로 인한 성능 저하를 이해합니다
2. **"캐시 라인 정렬은 어떻게 하나요?"** - 하드웨어 캐시에 최적화된 자료구조 설계를 배웁니다
3. **"공유 메모리 성능을 어떻게 최적화하나요?"** - 실전 최적화 기법과 성능 비교를 학습합니다

## 4. 공유 메모리 성능 최적화

### 4.1 캐시 라인 정렬과 False Sharing 방지

False Sharing은 서로 다른 데이터가 같은 캐시 라인에 위치하여 성능 저하를 일으키는 현상입니다. 이를 방지하려면 캐시 라인 정렬이 필수입니다.

```c
// cache_optimized_shared.c - 캐시 최적화된 공유 메모리
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mman.h>
#include <pthread.h>
#include <stdatomic.h>

#define CACHE_LINE_SIZE 64
#define NUM_THREADS 4

// 캐시 라인 정렬된 구조체
struct __attribute__((aligned(CACHE_LINE_SIZE))) cache_aligned_counter {
    atomic_long counter;
    char padding[CACHE_LINE_SIZE - sizeof(atomic_long)];
};

// False sharing이 발생하는 구조체 (나쁜 예)
struct false_sharing_counters {
    atomic_long counter1;
    atomic_long counter2;
    atomic_long counter3;
    atomic_long counter4;
};

// 캐시 최적화된 공유 데이터
struct cache_optimized_data {
    // 각 스레드별로 캐시 라인 정렬된 카운터
    struct cache_aligned_counter thread_counters[NUM_THREADS];
    
    // 공유 상태 변수들 (읽기 전용)
    atomic_int start_flag;
    atomic_int stop_flag;
    
    // 성능 측정을 위한 타임스탬프
    struct timespec start_time;
    struct timespec end_time;
};

// 최적화된 작업자 스레드
void* optimized_worker(void *arg) {
    struct {
        struct cache_optimized_data *shared;
        int thread_id;
    } *params = arg;
    
    struct cache_optimized_data *shared = params->shared;
    int thread_id = params->thread_id;
    
    // 시작 신호 대기
    while (!atomic_load(&shared->start_flag)) {
        usleep(1);
    }
    
    printf("최적화된 작업자 %d 시작\n", thread_id);
    
    // 자신만의 캐시 라인에서 작업 (False sharing 방지)
    struct cache_aligned_counter *my_counter = 
        &shared->thread_counters[thread_id];
    
    while (!atomic_load(&shared->stop_flag)) {
        // 로컬 캐시에서 빠른 증가 연산
        atomic_fetch_add(&my_counter->counter, 1);
    }
    
    printf("최적화된 작업자 %d 완료: %ld 연산\n", 
           thread_id, atomic_load(&my_counter->counter));
    
    return NULL;
}

// False sharing이 발생하는 작업자 (비교용)
void* false_sharing_worker(void *arg) {
    struct {
        struct false_sharing_counters *shared;
        int thread_id;
        atomic_int *start_flag;
        atomic_int *stop_flag;
    } *params = arg;
    
    atomic_long *my_counter;
    switch (params->thread_id) {
        case 0: my_counter = &params->shared->counter1; break;
        case 1: my_counter = &params->shared->counter2; break;
        case 2: my_counter = &params->shared->counter3; break;
        case 3: my_counter = &params->shared->counter4; break;
        default: return NULL;
    }
    
    // 시작 신호 대기
    while (!atomic_load(params->start_flag)) {
        usleep(1);
    }
    
    printf("False sharing 작업자 %d 시작\n", params->thread_id);
    
    // 같은 캐시 라인을 공유하는 카운터들 (성능 저하)
    while (!atomic_load(params->stop_flag)) {
        atomic_fetch_add(my_counter, 1);
    }
    
    printf("False sharing 작업자 %d 완료: %ld 연산\n", 
           params->thread_id, atomic_load(my_counter));
    
    return NULL;
}

void run_optimized_test() {
    printf("\n=== 캐시 최적화된 테스트 ===\n");
    
    // 공유 메모리 할당
    struct cache_optimized_data *shared = 
        mmap(NULL, sizeof(struct cache_optimized_data),
             PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    
    // 초기화
    for (int i = 0; i < NUM_THREADS; i++) {
        atomic_init(&shared->thread_counters[i].counter, 0);
    }
    atomic_init(&shared->start_flag, 0);
    atomic_init(&shared->stop_flag, 0);
    
    // 스레드 생성
    pthread_t threads[NUM_THREADS];
    struct {
        struct cache_optimized_data *shared;
        int thread_id;
    } params[NUM_THREADS];
    
    for (int i = 0; i < NUM_THREADS; i++) {
        params[i].shared = shared;
        params[i].thread_id = i;
        pthread_create(&threads[i], NULL, optimized_worker, &params[i]);
    }
    
    // 성능 측정 시작
    clock_gettime(CLOCK_MONOTONIC, &shared->start_time);
    atomic_store(&shared->start_flag, 1);
    
    // 5초간 실행
    sleep(5);
    
    atomic_store(&shared->stop_flag, 1);
    clock_gettime(CLOCK_MONOTONIC, &shared->end_time);
    
    // 스레드 종료 대기
    for (int i = 0; i < NUM_THREADS; i++) {
        pthread_join(threads[i], NULL);
    }
    
    // 결과 계산
    long total_ops = 0;
    for (int i = 0; i < NUM_THREADS; i++) {
        total_ops += atomic_load(&shared->thread_counters[i].counter);
    }
    
    double elapsed = (shared->end_time.tv_sec - shared->start_time.tv_sec) +
                    (shared->end_time.tv_nsec - shared->start_time.tv_nsec) / 1e9;
    
    printf("최적화된 결과: %.0f 연산/초\n", total_ops / elapsed);
    
    munmap(shared, sizeof(struct cache_optimized_data));
}

void run_false_sharing_test() {
    printf("\n=== False Sharing 테스트 ===\n");
    
    // 공유 메모리 할당
    struct false_sharing_counters *shared = 
        mmap(NULL, sizeof(struct false_sharing_counters),
             PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    
    atomic_int start_flag, stop_flag;
    atomic_init(&start_flag, 0);
    atomic_init(&stop_flag, 0);
    
    // 초기화
    atomic_init(&shared->counter1, 0);
    atomic_init(&shared->counter2, 0);
    atomic_init(&shared->counter3, 0);
    atomic_init(&shared->counter4, 0);
    
    // 스레드 생성
    pthread_t threads[NUM_THREADS];
    struct {
        struct false_sharing_counters *shared;
        int thread_id;
        atomic_int *start_flag;
        atomic_int *stop_flag;
    } params[NUM_THREADS];
    
    for (int i = 0; i < NUM_THREADS; i++) {
        params[i].shared = shared;
        params[i].thread_id = i;
        params[i].start_flag = &start_flag;
        params[i].stop_flag = &stop_flag;
        pthread_create(&threads[i], NULL, false_sharing_worker, &params[i]);
    }
    
    // 성능 측정 시작
    struct timespec start_time, end_time;
    clock_gettime(CLOCK_MONOTONIC, &start_time);
    atomic_store(&start_flag, 1);
    
    // 5초간 실행
    sleep(5);
    
    atomic_store(&stop_flag, 1);
    clock_gettime(CLOCK_MONOTONIC, &end_time);
    
    // 스레드 종료 대기
    for (int i = 0; i < NUM_THREADS; i++) {
        pthread_join(threads[i], NULL);
    }
    
    // 결과 계산
    long total_ops = atomic_load(&shared->counter1) + 
                    atomic_load(&shared->counter2) +
                    atomic_load(&shared->counter3) + 
                    atomic_load(&shared->counter4);
    
    double elapsed = (end_time.tv_sec - start_time.tv_sec) +
                    (end_time.tv_nsec - start_time.tv_nsec) / 1e9;
    
    printf("False sharing 결과: %.0f 연산/초\n", total_ops / elapsed);
    
    munmap(shared, sizeof(struct false_sharing_counters));
}

int main() {
    printf("공유 메모리 캐시 최적화 비교 테스트\n");
    printf("===================================\n");
    printf("캐시 라인 크기: %d 바이트\n", CACHE_LINE_SIZE);
    printf("스레드 수: %d\n", NUM_THREADS);
    
    // False sharing 테스트 (성능 저하)
    run_false_sharing_test();
    
    // 최적화된 테스트 (성능 향상)
    run_optimized_test();
    
    return 0;
}
```

## 5. 정리: 공유 메모리 선택 가이드

### 📊 성능 비교

| 통신 방식 | 지연시간 | 처리량 | 복잡도 | 메모리 사용량 |
|-----------|-----------|---------|---------|-----------------|
| **파이프** | 높음 (μs) | 낮음 | 낮음 | 적음 |
| **소켓** | 높음 (μs) | 중간 | 중간 | 적음 |
| **공유 메모리** | 매우 낮음 (ns) | 매우 높음 | 높음 | 높음 |
| **mmap** | 낮음 (ns) | 높음 | 중간 | 중간 |

### 🎯 사용 시나리오

**공유 메모리를 사용해야 할 때:**

- 대용량 데이터 교환이 필요할 때
- 실시간 성능이 중요할 때
- 프로세스 간 빈번한 통신이 발생할 때
- 메모리 복사 오버헤드를 피하고 싶을 때

**mmap을 사용해야 할 때:**

- 파일 기반 데이터 공유가 필요할 때
- 영구 저장이 필요할 때
- 메모리 매핑된 I/O가 필요할 때
- 다양한 프로세스 간 데이터 공유가 필요할 때

### ⚠️ 주의사항

1. **동기화**: 반드시 세마포어, 뮤텍스 등으로 접근 제어
2. **메모리 정렬**: 캐시 라인 정렬로 성능 최적화
3. **NUMA 인식**: 대규모 시스템에서는 NUMA 토폴로지 고려
4. **정리**: 프로그램 종료 시 공유 메모리 해제 필수

## 핵심 요점

### 1. False Sharing 방지 전략

- **캐시 라인 정렬**: 64바이트 단위로 데이터 구조 정렬
- **패딩 추가**: 서로 다른 스레드의 데이터를 별도 캐시 라인에 배치
- **성능 향상**: 일반적으로 3-5배 성능 향상 가능

### 2. 캐시 친화적 설계

- **데이터 지역성**: 관련 데이터를 인접한 위치에 배치
- **접근 패턴**: 순차적 접근으로 캐시 히트 비율 향상
- **프리페칭**: 데이터 미리 로드로 캐시 미스 최소화

### 3. 성능 모니터링

- **캐시 히트/미스 비율**: `perf stat -e cache-references,cache-misses`
- **메모리 밴드위드**: NUMA 노드별 사용량 모니터링
- **지연시간 분석**: 실시간 레이턴시 측정 및 분석

---

**이전**: [고성능 데이터 교환](04c3-high-performance-patterns.md)  
**다음**: [공유 메모리 개요](04c-shared-memory.md)에서 전체 공유 메모리 시스템의 마지막 요약을 확인합니다.
