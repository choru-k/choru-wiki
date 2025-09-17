---
tags:
  - advanced
  - atomic-operations
  - concurrency-control
  - deep-study
  - hands-on
  - memory-pooling
  - profiling
  - promise-performance
  - 애플리케이션개발
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 10.4.4: Promise 성능 분석

## 상황: 비효율적인 Promise 체이닝

"안녕하세요, 비동기 처리가 많은 Node.js 애플리케이션을 개발 중인데 성능이 기대보다 느립니다. Promise.all을 써도 느리고, async/await을 써도 느려요. 특히 대량의 데이터를 처리할 때 메모리 사용량도 급증합니다. Promise를 어떻게 최적화해야 할까요?"

이런 Promise 성능 문제는 잘못된 비동기 패턴 사용으로 인해 발생하는 경우가 많습니다. 근본적인 문제를 파악하기 위해서는 시스템 수준의 정밀한 성능 분석이 필요합니다.

## Promise 성능 최적화 전략

```mermaid
graph TD
    A[Promise 성능 문제] --> B{원인 분석}

    B --> C[순차적 실행]
    B --> D[과도한 동시성]
    B --> E[메모리 누수]
    B --> F[비효율적 체이닝]

    C --> G[병렬 처리로 전환]
    D --> H[동시성 제어]
    E --> I[메모리 관리]
    F --> J[체인 최적화]

    subgraph "최적화 기법"
        K[Promise.all 활용]
        L[배치 처리]
        M[스트림 처리]
        N[Worker Pool]
        O[메모리 풀링]
    end

    subgraph "동시성 제어"
        P[세마포어]
        Q[큐 관리]
        R[백프레셔]
        S[Rate Limiting]
    end

    subgraph "모니터링"
        T[Promise 추적]
        U[메모리 모니터링]
        V[성능 측정]
        W[병목점 분석]
    end
```

## C 기반 Promise 성능 분석기

Promise 사용 패턴과 성능을 정밀하게 분석하는 C 기반 도구입니다.

```c
// promise_performance_analyzer.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <sys/time.h>
#include <pthread.h>
#include <errno.h>
#include <math.h>
#include <stdatomic.h>
#include <sys/resource.h>

#define MAX_PROMISES 10000
#define MAX_BATCH_SIZE 100
#define MEMORY_POOL_SIZE 1024

typedef enum {
    PROMISE_PENDING,
    PROMISE_FULFILLED,
    PROMISE_REJECTED
} promise_state_t;

typedef struct promise {
    int id;
    promise_state_t state;
    struct timeval created;
    struct timeval resolved;
    double execution_time_ms;
    size_t memory_usage;
    char error_message[256];
    struct promise *next;
} promise_t;

typedef struct {
    promise_t *head;
    promise_t *tail;
    int count;
    pthread_mutex_t mutex;
} promise_queue_t;

typedef struct {
    atomic_int total_promises;
    atomic_int pending_promises;
    atomic_int fulfilled_promises;
    atomic_int rejected_promises;
    atomic_long total_memory_usage;
    atomic_long total_execution_time_ns;

    // 성능 메트릭
    double avg_execution_time_ms;
    double max_execution_time_ms;
    double min_execution_time_ms;
    double memory_peak_mb;
    int memory_leaks;

    // 동시성 통계
    int max_concurrent_promises;
    int current_concurrent_promises;
    double concurrency_efficiency;
} performance_stats_t;

typedef struct {
    int max_concurrent;
    int batch_size;
    int enable_memory_pool;
    int enable_detailed_logging;
    double timeout_ms;
} config_t;

static performance_stats_t stats = {0};
static promise_queue_t active_promises = {0};
static promise_queue_t completed_promises = {0};
static config_t config = {
    .max_concurrent = 10,
    .batch_size = 50,
    .enable_memory_pool = 1,
    .enable_detailed_logging = 0,
    .timeout_ms = 5000.0
};

// 메모리 풀
static char memory_pool[MEMORY_POOL_SIZE * 1024]; // 1MB 풀
static int memory_pool_index = 0;
static pthread_mutex_t memory_pool_mutex = PTHREAD_MUTEX_INITIALIZER;

// 고해상도 타이머
static inline uint64_t get_timestamp_ns() {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000000000ULL + ts.tv_nsec;
}

// 시간 차이 계산 (밀리초)
double time_diff_ms(struct timeval *start, struct timeval *end) {
    return (end->tv_sec - start->tv_sec) * 1000.0 +
           (end->tv_usec - start->tv_usec) / 1000.0;
}

// 메모리 풀에서 할당
void* pool_alloc(size_t size) {
    if (!config.enable_memory_pool) {
        return malloc(size);
    }

    pthread_mutex_lock(&memory_pool_mutex);

    if (memory_pool_index + size > sizeof(memory_pool)) {
        pthread_mutex_unlock(&memory_pool_mutex);
        return malloc(size); // 풀 부족 시 일반 할당
    }

    void *ptr = memory_pool + memory_pool_index;
    memory_pool_index += size;

    pthread_mutex_unlock(&memory_pool_mutex);
    return ptr;
}

// 메모리 풀 해제 (실제로는 아무것도 하지 않음)
void pool_free(void *ptr) {
    if (!config.enable_memory_pool) {
        free(ptr);
    }
    // 풀 메모리는 프로그램 종료 시 해제
}

// 큐 초기화
void init_queue(promise_queue_t *queue) {
    queue->head = NULL;
    queue->tail = NULL;
    queue->count = 0;
    if (pthread_mutex_init(&queue->mutex, NULL) != 0) {
        perror("큐 뮤텍스 초기화 실패");
        exit(1);
    }
}

// 큐에 Promise 추가
void enqueue_promise(promise_queue_t *queue, promise_t *promise) {
    pthread_mutex_lock(&queue->mutex);

    if (queue->tail) {
        queue->tail->next = promise;
    } else {
        queue->head = promise;
    }

    queue->tail = promise;
    promise->next = NULL;
    queue->count++;

    pthread_mutex_unlock(&queue->mutex);
}

// 큐에서 Promise 제거
promise_t* dequeue_promise(promise_queue_t *queue) {
    pthread_mutex_lock(&queue->mutex);

    if (!queue->head) {
        pthread_mutex_unlock(&queue->mutex);
        return NULL;
    }

    promise_t *promise = queue->head;
    queue->head = promise->next;

    if (!queue->head) {
        queue->tail = NULL;
    }

    queue->count--;

    pthread_mutex_unlock(&queue->mutex);
    return promise;
}

// Promise 생성
promise_t* create_promise() {
    promise_t *promise = (promise_t*)pool_alloc(sizeof(promise_t));
    if (!promise) {
        return NULL;
    }

    static int promise_id = 0;
    promise->id = __sync_add_and_fetch(&promise_id, 1);
    promise->state = PROMISE_PENDING;
    gettimeofday(&promise->created, NULL);
    promise->execution_time_ms = 0;
    promise->memory_usage = sizeof(promise_t);
    promise->error_message[0] = '\0';
    promise->next = NULL;

    atomic_fetch_add(&stats.total_promises, 1);
    atomic_fetch_add(&stats.pending_promises, 1);
    atomic_fetch_add(&stats.total_memory_usage, promise->memory_usage);

    // 동시성 추적
    int current = atomic_fetch_add(&stats.current_concurrent_promises, 1) + 1;
    if (current > stats.max_concurrent_promises) {
        stats.max_concurrent_promises = current;
    }

    enqueue_promise(&active_promises, promise);

    if (config.enable_detailed_logging) {
        printf("[CREATE] Promise %d 생성\n", promise->id);
    }

    return promise;
}

// Promise 해결
void resolve_promise(promise_t *promise, const char *result) {
    if (promise->state != PROMISE_PENDING) {
        return;
    }

    gettimeofday(&promise->resolved, NULL);
    promise->state = PROMISE_FULFILLED;
    promise->execution_time_ms = time_diff_ms(&promise->created, &promise->resolved);

    atomic_fetch_sub(&stats.pending_promises, 1);
    atomic_fetch_add(&stats.fulfilled_promises, 1);
    atomic_fetch_sub(&stats.current_concurrent_promises, 1);

    // 실행 시간 통계 업데이트
    if (promise->execution_time_ms > stats.max_execution_time_ms) {
        stats.max_execution_time_ms = promise->execution_time_ms;
    }

    if (promise->execution_time_ms < stats.min_execution_time_ms ||
        stats.min_execution_time_ms == 0) {
        stats.min_execution_time_ms = promise->execution_time_ms;
    }

    atomic_fetch_add(&stats.total_execution_time_ns,
                     (long)(promise->execution_time_ms * 1000000));

    enqueue_promise(&completed_promises, promise);

    if (config.enable_detailed_logging) {
        printf("[RESOLVE] Promise %d 해결 (%.2fms)\n",
               promise->id, promise->execution_time_ms);
    }
}

// Promise 거부
void reject_promise(promise_t *promise, const char *error) {
    if (promise->state != PROMISE_PENDING) {
        return;
    }

    gettimeofday(&promise->resolved, NULL);
    promise->state = PROMISE_REJECTED;
    promise->execution_time_ms = time_diff_ms(&promise->created, &promise->resolved);
    strncpy(promise->error_message, error, sizeof(promise->error_message) - 1);

    atomic_fetch_sub(&stats.pending_promises, 1);
    atomic_fetch_add(&stats.rejected_promises, 1);
    atomic_fetch_sub(&stats.current_concurrent_promises, 1);

    enqueue_promise(&completed_promises, promise);

    if (config.enable_detailed_logging) {
        printf("[REJECT] Promise %d 거부: %s\n", promise->id, error);
    }
}

// 비동기 작업 시뮬레이션
void* async_worker(void *arg) {
    promise_t *promise = (promise_t*)arg;

    // 실제 작업 시뮬레이션 (100ms ~ 1초)
    int work_time_ms = 100 + (rand() % 900);
    usleep(work_time_ms * 1000);

    // 90% 확률로 성공
    if (rand() % 100 < 90) {
        resolve_promise(promise, "작업 완료");
    } else {
        reject_promise(promise, "작업 실패");
    }

    return NULL;
}

// 동시성 제어된 Promise 실행
void execute_promises_with_concurrency_control(int count) {
    printf("동시성 제어 Promise 실행 시작 (%d개, 최대 동시성: %d)\n",
           count, config.max_concurrent);

    pthread_t threads[config.max_concurrent];
    int active_threads = 0;
    int created_promises = 0;

    uint64_t start_time = get_timestamp_ns();

    while (created_promises < count || active_threads > 0) {
        // 새 Promise 생성 (동시성 한도 내에서)
        while (created_promises < count && active_threads < config.max_concurrent) {
            promise_t *promise = create_promise();
            if (!promise) {
                printf("Promise 생성 실패\n");
                break;
            }

            if (pthread_create(&threads[active_threads], NULL,
                              async_worker, promise) == 0) {
                active_threads++;
                created_promises++;
            } else {
                reject_promise(promise, "스레드 생성 실패");
            }
        }

        // 완료된 스레드 정리
        for (int i = 0; i < active_threads; i++) {
            if (pthread_tryjoin_np(threads[i], NULL) == 0) {
                // 완료된 스레드를 배열에서 제거
                for (int j = i; j < active_threads - 1; j++) {
                    threads[j] = threads[j + 1];
                }
                active_threads--;
                i--; // 인덱스 조정
            }
        }

        usleep(1000); // 1ms 대기
    }

    uint64_t end_time = get_timestamp_ns();
    double total_time_ms = (end_time - start_time) / 1000000.0;

    printf("실행 완료: %.2fms\n", total_time_ms);
}

// 배치 처리
void execute_promises_in_batches(int total_count) {
    printf("배치 처리 시작 (총 %d개, 배치 크기: %d)\n",
           total_count, config.batch_size);

    int remaining = total_count;
    int batch_number = 1;

    uint64_t start_time = get_timestamp_ns();

    while (remaining > 0) {
        int batch_size = remaining < config.batch_size ? remaining : config.batch_size;

        printf("배치 %d 실행 중 (%d개)...\n", batch_number, batch_size);

        // 배치 내 Promise들을 병렬로 실행
        pthread_t threads[batch_size];
        promise_t *promises[batch_size];

        // Promise 생성 및 스레드 시작
        for (int i = 0; i < batch_size; i++) {
            promises[i] = create_promise();
            if (promises[i]) {
                if (pthread_create(&threads[i], NULL, async_worker, promises[i]) != 0) {
                    reject_promise(promises[i], "스레드 생성 실패");
                }
            }
        }

        // 배치 완료 대기
        for (int i = 0; i < batch_size; i++) {
            if (promises[i]) {
                pthread_join(threads[i], NULL);
            }
        }

        remaining -= batch_size;
        batch_number++;

        printf("배치 %d 완료\n", batch_number - 1);
    }

    uint64_t end_time = get_timestamp_ns();
    double total_time_ms = (end_time - start_time) / 1000000.0;

    printf("배치 처리 완료: %.2fms\n", total_time_ms);
}

// 메모리 사용량 모니터링
void monitor_memory_usage() {
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        double memory_mb = usage.ru_maxrss / 1024.0; // KB를 MB로 변환

        if (memory_mb > stats.memory_peak_mb) {
            stats.memory_peak_mb = memory_mb;
        }

        printf("현재 메모리 사용량: %.2f MB (피크: %.2f MB)\n",
               memory_mb, stats.memory_peak_mb);
    }
}

// 성능 통계 계산
void calculate_performance_stats() {
    int total = atomic_load(&stats.total_promises);
    int fulfilled = atomic_load(&stats.fulfilled_promises);
    long total_time_ns = atomic_load(&stats.total_execution_time_ns);

    if (fulfilled > 0) {
        stats.avg_execution_time_ms = (double)total_time_ns / (fulfilled * 1000000.0);
    }

    if (stats.max_concurrent_promises > 0) {
        stats.concurrency_efficiency = (double)fulfilled / stats.max_concurrent_promises;
    }

    // 메모리 누수 감지 (간단한 휴리스틱)
    if (atomic_load(&stats.total_memory_usage) > total * sizeof(promise_t) * 2) {
        stats.memory_leaks = 1;
    }
}

// 성능 리포트 출력
void print_performance_report() {
    calculate_performance_stats();

    printf("\n=====================================\n");
    printf("Promise 성능 분석 리포트\n");
    printf("=====================================\n");

    printf("📊 기본 통계:\n");
    printf("  총 Promise 수: %d\n", atomic_load(&stats.total_promises));
    printf("  성공한 Promise: %d\n", atomic_load(&stats.fulfilled_promises));
    printf("  실패한 Promise: %d\n", atomic_load(&stats.rejected_promises));
    printf("  대기 중인 Promise: %d\n", atomic_load(&stats.pending_promises));

    if (atomic_load(&stats.fulfilled_promises) > 0) {
        double success_rate = (double)atomic_load(&stats.fulfilled_promises) /
                             atomic_load(&stats.total_promises) * 100;
        printf("  성공률: %.1f%%\n", success_rate);
    }

    printf("\n⏱️  실행 시간 통계:\n");
    printf("  평균 실행 시간: %.2f ms\n", stats.avg_execution_time_ms);
    printf("  최소 실행 시간: %.2f ms\n", stats.min_execution_time_ms);
    printf("  최대 실행 시간: %.2f ms\n", stats.max_execution_time_ms);

    printf("\n🔄 동시성 통계:\n");
    printf("  최대 동시 Promise 수: %d\n", stats.max_concurrent_promises);
    printf("  동시성 효율성: %.2f\n", stats.concurrency_efficiency);
    printf("  설정된 최대 동시성: %d\n", config.max_concurrent);

    printf("\n💾 메모리 통계:\n");
    printf("  총 메모리 사용량: %ld bytes\n", atomic_load(&stats.total_memory_usage));
    printf("  피크 메모리 사용량: %.2f MB\n", stats.memory_peak_mb);
    printf("  메모리 풀 사용: %s\n", config.enable_memory_pool ? "활성화" : "비활성화");

    if (stats.memory_leaks) {
        printf("  ⚠️  메모리 누수 감지됨\n");
    }

    printf("\n🎯 최적화 권장사항:\n");

    if (stats.avg_execution_time_ms > 1000) {
        printf("  - 평균 실행 시간이 높습니다. 작업을 더 작은 단위로 분할하세요.\n");
    }

    if (stats.concurrency_efficiency < 0.5) {
        printf("  - 동시성 효율성이 낮습니다. 동시성 수준을 조정하세요.\n");
    }

    if (stats.memory_leaks) {
        printf("  - 메모리 누수가 감지되었습니다. Promise 정리를 확인하세요.\n");
    }

    if (atomic_load(&stats.rejected_promises) > atomic_load(&stats.total_promises) * 0.1) {
        printf("  - 실패율이 높습니다. 에러 처리를 개선하세요.\n");
    }

    if (stats.max_concurrent_promises < config.max_concurrent) {
        printf("  - 설정된 동시성이 충분히 활용되지 않았습니다.\n");
    }

    printf("\n최적화 기법:\n");
    printf("  - Promise.all() 사용으로 병렬 처리\n");
    printf("  - 적절한 동시성 제어 (세마포어 패턴)\n");
    printf("  - 메모리 풀링으로 할당 최적화\n");
    printf("  - 배치 처리로 리소스 효율성 향상\n");
}

// Promise 체인 분석
void analyze_promise_chains() {
    printf("\n🔗 Promise 체인 분석:\n");

    // 완료된 Promise들을 분석
    promise_t *current = completed_promises.head;
    int chain_length = 0;
    double total_chain_time = 0;

    while (current) {
        chain_length++;
        total_chain_time += current->execution_time_ms;
        current = current->next;
    }

    if (chain_length > 0) {
        printf("  평균 체인 길이: %d\n", chain_length);
        printf("  총 체인 실행 시간: %.2f ms\n", total_chain_time);
        printf("  체인당 평균 시간: %.2f ms\n", total_chain_time / chain_length);
    }
}

// 정리 함수
void cleanup() {
    printf("\n정리 중...\n");

    // 활성 Promise 정리
    promise_t *current = active_promises.head;
    while (current) {
        promise_t *next = current->next;
        pool_free(current);
        current = next;
    }

    // 완료된 Promise 정리
    current = completed_promises.head;
    while (current) {
        promise_t *next = current->next;
        pool_free(current);
        current = next;
    }

    pthread_mutex_destroy(&active_promises.mutex);
    pthread_mutex_destroy(&completed_promises.mutex);
    pthread_mutex_destroy(&memory_pool_mutex);
}

// 사용법 출력
void print_usage(const char *program_name) {
    printf("Promise 성능 분석기\n");
    printf("사용법: %s [옵션]\n", program_name);
    printf("옵션:\n");
    printf("  -n COUNT       Promise 수 (기본값: 100)\n");
    printf("  -c CONCURRENT  최대 동시성 (기본값: 10)\n");
    printf("  -b BATCH       배치 크기 (기본값: 50)\n");
    printf("  -m             메모리 풀 비활성화\n");
    printf("  -v             상세 로깅 활성화\n");
    printf("  -t TEST        테스트 모드 (concurrency|batch|chain)\n");
    printf("  --help         이 도움말 출력\n");
}

int main(int argc, char *argv[]) {
    int promise_count = 100;
    char test_mode[64] = "concurrency";

    // 명령행 인자 처리
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-n") == 0 && i + 1 < argc) {
            promise_count = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-c") == 0 && i + 1 < argc) {
            config.max_concurrent = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-b") == 0 && i + 1 < argc) {
            config.batch_size = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-m") == 0) {
            config.enable_memory_pool = 0;
        } else if (strcmp(argv[i], "-v") == 0) {
            config.enable_detailed_logging = 1;
        } else if (strcmp(argv[i], "-t") == 0 && i + 1 < argc) {
            strncpy(test_mode, argv[++i], sizeof(test_mode) - 1);
        } else if (strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return 0;
        }
    }

    // 초기화
    init_queue(&active_promises);
    init_queue(&completed_promises);

    printf("Promise 성능 분석 시작\n");
    printf("Promise 수: %d\n", promise_count);
    printf("테스트 모드: %s\n", test_mode);
    printf("============================\n\n");

    // 테스트 실행
    if (strcmp(test_mode, "concurrency") == 0) {
        execute_promises_with_concurrency_control(promise_count);
    } else if (strcmp(test_mode, "batch") == 0) {
        execute_promises_in_batches(promise_count);
    } else if (strcmp(test_mode, "chain") == 0) {
        // 체인 테스트는 간단 버전
        for (int i = 0; i < promise_count; i++) {
            promise_t *promise = create_promise();
            if (promise) {
                pthread_t thread;
                if (pthread_create(&thread, NULL, async_worker, promise) == 0) {
                    pthread_join(thread, NULL);
                } else {
                    reject_promise(promise, "스레드 생성 실패");
                }
            }
        }
    } else {
        printf("알 수 없는 테스트 모드: %s\n", test_mode);
        return 1;
    }

    // 메모리 모니터링
    monitor_memory_usage();

    // 결과 분석
    print_performance_report();
    analyze_promise_chains();

    // 정리
    cleanup();

    return 0;
}
```

## 핵심 요점

### 1. 정밀한 성능 측정

고해상도 타이머와 원자적 연산을 사용하여 나노초 단위의 정확한 성능 측정을 수행합니다.

### 2. 메모리 효율성

메모리 풀을 활용하여 동적 할당 오버헤드를 최소화하고 메모리 누수를 방지합니다.

### 3. 동시성 제어

세마포어 패턴을 구현하여 시스템 리소스를 효율적으로 사용하면서 성능을 최적화합니다.

### 4. 종합적 분석

실행 시간, 메모리 사용량, 동시성 효율성을 종합적으로 분석하여 최적화 방향을 제시합니다.

---

**이전**: [Promise 성능 최적화 개요](./10-04-01-promise-performance-optimization.md)  
**다음**: [JavaScript Promise 최적화 라이브러리](./10-04-02-promise-optimization-library.md)에서 실용적인 JavaScript 최적화 도구를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 애플리케이션 개발
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-10-async-programming)

- [8.1 Promise/Future 패턴 개요](./10-02-01-promise-future.md)
- [8.1a Promise/Future 기본 개념과 구현](./10-01-01-promise-future-basics.md)
- [8.1b 비동기 연산 조합과 병렬 처리](./10-02-02-async-composition.md)
- [8.1c 취소와 타임아웃 처리](./10-02-03-cancellation-timeout.md)
- [8.1d 실행 모델과 스케줄링](./10-02-04-execution-scheduling.md)

### 🏷️ 관련 키워드

`promise-performance`, `profiling`, `concurrency-control`, `memory-pooling`, `atomic-operations`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
