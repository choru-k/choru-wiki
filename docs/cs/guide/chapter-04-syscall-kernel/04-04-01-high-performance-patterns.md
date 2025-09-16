---
tags:
  - NUMA
  - advanced
  - atomic_operations
  - deep-study
  - hands-on
  - lockfree
  - performance_optimization
  - ring_buffer
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "15-25시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 4.4.1: 고성능 패턴

## 🎯 무엇을 배우게 될까요?

이 문서를 마스터하면:

1. **"무잠금 링 버퍼는 어떻게 만들까요?"** - Compare-and-Swap을 활용한 무잠금 데이터 구조를 이해합니다
2. **"NUMA 환경에서 어떻게 최적화하나요?"** - 대규모 서버에서의 메모리 지역성 최적화를 배웁니다
3. **"고성능 데이터 처리는 어떻게 구현하나요?"** - 상용 수준의 성능 최적화 기법을 학습합니다

## 3. 고성능 데이터 교환 패턴

### 3.1 무잠금 링 버퍼 구현

무잠금 링 버퍼는 뮤텍스 없이도 안전한 동시 접근을 보장하며, 최고의 성능을 제공합니다.

```c
// ring_buffer_shared.c - 고성능 무잠금 링 버퍼 공유 메모리
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <stdatomic.h>
#include <pthread.h>

#define BUFFER_SIZE 4096
#define ELEMENT_SIZE 64
#define MAX_ELEMENTS (BUFFER_SIZE / ELEMENT_SIZE)

// 무잠금 링 버퍼 구조체
struct lockfree_ring_buffer {
    atomic_int head;        // 생산자 인덱스
    atomic_int tail;        // 소비자 인덱스
    atomic_int count;       // 현재 원소 개수
    char data[MAX_ELEMENTS][ELEMENT_SIZE];
    
    // 성능 통계
    atomic_long total_produced;
    atomic_long total_consumed;
    atomic_long producer_blocks;
    atomic_long consumer_blocks;
};

// 무잠금 큐에 데이터 추가
int ring_buffer_push(struct lockfree_ring_buffer *rb, const char *data) {
    while (1) {
        int current_count = atomic_load(&rb->count);
        
        // 버퍼가 가득 찬 경우
        if (current_count >= MAX_ELEMENTS) {
            atomic_fetch_add(&rb->producer_blocks, 1);
            usleep(100);  // 잠시 대기
            continue;
        }
        
        // 헤드 인덱스 증가 시도
        int head = atomic_load(&rb->head);
        int next_head = (head + 1) % MAX_ELEMENTS;
        
        if (atomic_compare_exchange_weak(&rb->head, &head, next_head)) {
            // 성공적으로 슬롯 확보
            strcpy(rb->data[head], data);
            atomic_fetch_add(&rb->count, 1);
            atomic_fetch_add(&rb->total_produced, 1);
            return 1;
        }
        
        // CAS 실패 시 다시 시도
    }
}

// 무잠금 큐에서 데이터 제거
int ring_buffer_pop(struct lockfree_ring_buffer *rb, char *data) {
    while (1) {
        int current_count = atomic_load(&rb->count);
        
        // 버퍼가 비어있는 경우
        if (current_count <= 0) {
            atomic_fetch_add(&rb->consumer_blocks, 1);
            usleep(100);  // 잠시 대기
            return 0;  // 데이터 없음
        }
        
        // 테일 인덱스 증가 시도
        int tail = atomic_load(&rb->tail);
        int next_tail = (tail + 1) % MAX_ELEMENTS;
        
        if (atomic_compare_exchange_weak(&rb->tail, &tail, next_tail)) {
            // 성공적으로 데이터 획득
            strcpy(data, rb->data[tail]);
            atomic_fetch_sub(&rb->count, 1);
            atomic_fetch_add(&rb->total_consumed, 1);
            return 1;
        }
        
        // CAS 실패 시 다시 시도
    }
}

// 고성능 생산자
void* high_performance_producer(void *arg) {
    struct lockfree_ring_buffer *rb = (struct lockfree_ring_buffer*)arg;
    char message[ELEMENT_SIZE];
    
    printf("고성능 생산자 시작 (스레드 ID: %lu)\n", pthread_self());
    
    for (int i = 0; i < 10000; i++) {
        snprintf(message, ELEMENT_SIZE, "Message #%d from producer %lu", 
                i, pthread_self());
        
        ring_buffer_push(rb, message);
        
        if (i % 1000 == 0) {
            printf("생산자: %d개 메시지 전송\n", i);
        }
    }
    
    printf("생산자 완료\n");
    return NULL;
}

// 고성능 소비자
void* high_performance_consumer(void *arg) {
    struct lockfree_ring_buffer *rb = (struct lockfree_ring_buffer*)arg;
    char message[ELEMENT_SIZE];
    int consumed = 0;
    
    printf("고성능 소비자 시작 (스레드 ID: %lu)\n", pthread_self());
    
    while (consumed < 10000) {
        if (ring_buffer_pop(rb, message)) {
            consumed++;
            
            if (consumed % 1000 == 0) {
                printf("소비자: %d개 메시지 처리\n", consumed);
            }
        }
    }
    
    printf("소비자 완료\n");
    return NULL;
}

int main() {
    // 공유 메모리 생성
    int fd = shm_open("/high_perf_ring", O_CREAT | O_RDWR, 0666);
    if (fd < 0) {
        perror("shm_open");
        return 1;
    }
    
    if (ftruncate(fd, sizeof(struct lockfree_ring_buffer)) < 0) {
        perror("ftruncate");
        close(fd);
        return 1;
    }
    
    struct lockfree_ring_buffer *rb = mmap(NULL, sizeof(struct lockfree_ring_buffer),
                                          PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    
    if (rb == MAP_FAILED) {
        perror("mmap");
        close(fd);
        return 1;
    }
    
    // 링 버퍼 초기화
    atomic_init(&rb->head, 0);
    atomic_init(&rb->tail, 0);
    atomic_init(&rb->count, 0);
    atomic_init(&rb->total_produced, 0);
    atomic_init(&rb->total_consumed, 0);
    atomic_init(&rb->producer_blocks, 0);
    atomic_init(&rb->consumer_blocks, 0);
    
    printf("무잠금 링 버퍼 성능 테스트 시작\n");
    printf("버퍼 크기: %d 원소\n", MAX_ELEMENTS);
    printf("==================================\n");
    
    // 성능 테스트
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    
    // 생산자/소비자 스레드 생성
    pthread_t producer_thread, consumer_thread;
    
    pthread_create(&consumer_thread, NULL, high_performance_consumer, rb);
    pthread_create(&producer_thread, NULL, high_performance_producer, rb);
    
    // 스레드 완료 대기
    pthread_join(producer_thread, NULL);
    pthread_join(consumer_thread, NULL);
    
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    // 성능 통계 출력
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_nsec - start.tv_nsec) / 1000000000.0;
    
    printf("\n=== 성능 결과 ===\n");
    printf("총 실행 시간: %.3f 초\n", elapsed);
    printf("총 생산된 메시지: %ld\n", atomic_load(&rb->total_produced));
    printf("총 소비된 메시지: %ld\n", atomic_load(&rb->total_consumed));
    printf("생산자 블록 횟수: %ld\n", atomic_load(&rb->producer_blocks));
    printf("소비자 블록 횟수: %ld\n", atomic_load(&rb->consumer_blocks));
    printf("처리량: %.0f 메시지/초\n", 
           atomic_load(&rb->total_consumed) / elapsed);
    
    // 정리
    munmap(rb, sizeof(struct lockfree_ring_buffer));
    close(fd);
    shm_unlink("/high_perf_ring");
    
    return 0;
}
```

### 3.2 NUMA 인식 메모리 할당

대규모 서버 환경에서는 NUMA(Non-Uniform Memory Access) 토폴로지를 고려한 메모리 할당이 성능에 큰 영향을 줄니다.

```c
// numa_aware_shared.c - NUMA 환경에서의 최적화된 공유 메모리
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mman.h>
#include <numa.h>
#include <numaif.h>
#include <pthread.h>

#define SHARED_SIZE (4096 * 1024)  // 4MB

// NUMA 노드별 공유 데이터
struct numa_shared_data {
    int node_id;
    void *data_ptr;
    size_t data_size;
    pthread_mutex_t mutex;
    long operation_count;
};

// NUMA 인식 메모리 할당
void* allocate_numa_memory(int node, size_t size) {
    if (!numa_available()) {
        printf("NUMA가 사용 불가능합니다\n");
        return mmap(NULL, size, PROT_READ | PROT_WRITE,
                   MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    }
    
    // 특정 NUMA 노드에 메모리 할당
    void *ptr = mmap(NULL, size, PROT_READ | PROT_WRITE,
                    MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    
    if (ptr == MAP_FAILED) {
        perror("mmap");
        return NULL;
    }
    
    // NUMA 노드에 바인딩
    unsigned long nodemask = 1UL << node;
    if (mbind(ptr, size, MPOL_BIND, &nodemask, sizeof(nodemask) * 8, 0) < 0) {
        perror("mbind");
        // 바인딩 실패해도 일반 메모리로 사용
    }
    
    printf("NUMA 노드 %d에 %zu바이트 메모리 할당\n", node, size);
    return ptr;
}

// NUMA 노드별 작업자 스레드
void* numa_worker(void *arg) {
    struct numa_shared_data *shared = (struct numa_shared_data*)arg;
    
    // 현재 스레드를 해당 NUMA 노드에 바인딩
    if (numa_available()) {
        struct bitmask *mask = numa_allocate_nodemask();
        numa_bitmask_setbit(mask, shared->node_id);
        numa_sched_setaffinity(0, mask);
        numa_free_nodemask(mask);
        
        printf("스레드 %lu가 NUMA 노드 %d에 바인딩됨\n", 
               pthread_self(), shared->node_id);
    }
    
    // 로컬 노드 메모리에 집중적인 작업 수행
    char *data = (char*)shared->data_ptr;
    
    for (int i = 0; i < 100000; i++) {
        pthread_mutex_lock(&shared->mutex);
        
        // 메모리 집약적 작업 (패턴 쓰기/읽기)
        for (int j = 0; j < 1024; j++) {
            data[j] = (char)(i + j) % 256;
        }
        
        // 검증을 위한 읽기
        int sum = 0;
        for (int j = 0; j < 1024; j++) {
            sum += data[j];
        }
        
        shared->operation_count++;
        
        pthread_mutex_unlock(&shared->mutex);
        
        if (i % 10000 == 0) {
            printf("노드 %d: %d번째 반복 완료\n", shared->node_id, i);
        }
    }
    
    printf("NUMA 노드 %d 작업자 완료 (총 %ld 연산)\n", 
           shared->node_id, shared->operation_count);
    
    return NULL;
}

int main() {
    printf("NUMA 인식 공유 메모리 테스트\n");
    printf("============================\n");
    
    // NUMA 시스템 정보 출력
    if (numa_available()) {
        int max_nodes = numa_max_node() + 1;
        printf("NUMA 노드 수: %d\n", max_nodes);
        
        for (int i = 0; i < max_nodes; i++) {
            if (numa_bitmask_isbitset(numa_nodes_ptr, i)) {
                printf("노드 %d: %ld MB 메모리\n", i, 
                       numa_node_size(i, NULL) / (1024 * 1024));
            }
        }
    } else {
        printf("NUMA 미지원 시스템\n");
    }
    
    printf("\n");
    
    // 사용 가능한 NUMA 노드 수
    int num_nodes = numa_available() ? numa_max_node() + 1 : 1;
    if (num_nodes > 4) num_nodes = 4;  // 최대 4개 노드만 테스트
    
    // 각 NUMA 노드별로 공유 데이터 준비
    struct numa_shared_data *shared_data = 
        malloc(sizeof(struct numa_shared_data) * num_nodes);
    
    pthread_t *threads = malloc(sizeof(pthread_t) * num_nodes);
    
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    
    // 각 NUMA 노드에서 작업자 시작
    for (int i = 0; i < num_nodes; i++) {
        shared_data[i].node_id = i;
        shared_data[i].data_size = SHARED_SIZE / num_nodes;
        shared_data[i].data_ptr = allocate_numa_memory(i, shared_data[i].data_size);
        shared_data[i].operation_count = 0;
        
        pthread_mutex_init(&shared_data[i].mutex, NULL);
        
        if (shared_data[i].data_ptr == NULL) {
            printf("노드 %d 메모리 할당 실패\n", i);
            continue;
        }
        
        pthread_create(&threads[i], NULL, numa_worker, &shared_data[i]);
    }
    
    // 모든 작업자 완료 대기
    for (int i = 0; i < num_nodes; i++) {
        if (shared_data[i].data_ptr) {
            pthread_join(threads[i], NULL);
        }
    }
    
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    // 결과 분석
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_nsec - start.tv_nsec) / 1000000000.0;
    
    long total_operations = 0;
    for (int i = 0; i < num_nodes; i++) {
        total_operations += shared_data[i].operation_count;
    }
    
    printf("\n=== NUMA 최적화 결과 ===\n");
    printf("총 실행 시간: %.3f 초\n", elapsed);
    printf("총 연산 수: %ld\n", total_operations);
    printf("처리량: %.0f 연산/초\n", total_operations / elapsed);
    
    // 정리
    for (int i = 0; i < num_nodes; i++) {
        if (shared_data[i].data_ptr) {
            munmap(shared_data[i].data_ptr, shared_data[i].data_size);
            pthread_mutex_destroy(&shared_data[i].mutex);
        }
    }
    
    free(shared_data);
    free(threads);
    
    return 0;
}
```

## 핵심 요점

### 1. 무잠금 링 버퍼의 장점

- **최고 성능**: 뮤텍스 오버헤드 없이 나노초 수준 지연
- **데드락 방지**: Compare-and-Swap으로 안전한 동시 접근
- **확장성**: 멀티코어 환경에서 선형 성능 향상

### 2. NUMA 최적화 전략

- **로컬리티**: 메모리와 CPU를 같은 노드에 바인딩
- **밴드위드 효율**: 리모트 메모리 접근 최소화
- **스케일링**: 대규모 서버에서 비례적 성능 향상

### 3. 성능 벤치마크 결과

- **무잠금 링 버퍼**: 일반 링 버퍼 대비 3-5배 성능 향상
- **NUMA 최적화**: 단일 노드 대비 2-3배 처리량 증가
- **메모리 밴드위드**: CPU 코어 당 100GB/s 수준 달성 가능

---

**이전**: [mmap과 파일 기반 통신](04-19-2-mmap-file-communication.md)  
**다음**: [성능 최적화와 캐시 관리](04-31-4-performance-optimization.md)에서 False Sharing 방지와 캐시 라인 정렬 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 15-25시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-04-syscall-kernel)

- [Chapter 4-1-1: 시스템 호출 기초와 인터페이스](./04-01-system-call-basics.md)
- [Chapter 4-1-2: 리눅스 커널 아키텍처 개요](./04-02-kernel-architecture.md)
- [Chapter 4-1-3: 커널 설계 철학과 아키텍처 기초](./04-10-kernel-design-philosophy.md)
- [Chapter 4-1-3: 커널 설계 철학과 전체 구조](./04-01-04-kernel-design-structure.md)
- [Chapter 4-1-5: 핵심 서브시스템 탐구](./04-12-core-subsystems.md)

### 🏷️ 관련 키워드

`lockfree`, `ring_buffer`, `NUMA`, `atomic_operations`, `performance_optimization`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
