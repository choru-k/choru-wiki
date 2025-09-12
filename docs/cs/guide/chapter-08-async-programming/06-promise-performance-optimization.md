---
tags:
  - Promise Performance
  - Async/Await Optimization
  - Memory Management
  - Concurrency Control
---

# Promise 성능 최적화: "비동기 코드가 느려요"

## 상황: 비효율적인 Promise 체이닝

"안녕하세요, 비동기 처리가 많은 Node.js 애플리케이션을 개발 중인데 성능이 기대보다 느립니다. Promise.all을 써도 느리고, async/await을 써도 느려요. 특히 대량의 데이터를 처리할 때 메모리 사용량도 급증합니다. Promise를 어떻게 최적화해야 할까요? 동시성 제어는 어떻게 해야 하나요?"

이런 Promise 성능 문제는 잘못된 비동기 패턴 사용으로 인해 발생하는 경우가 많습니다. 체계적인 최적화가 필요합니다.

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
```text

## 1. Promise 성능 분석 도구

Promise 사용 패턴과 성능을 분석하는 C 기반 도구입니다.

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
        printf("[CREATE] Promise %d 생성, ", promise->id);
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
        printf("[RESOLVE] Promise %d 해결 (%.2fms), ", 
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
        printf("[REJECT] Promise %d 거부: %s, ", promise->id, error);
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
    printf("동시성 제어 Promise 실행 시작 (%d개, 최대 동시성: %d), ", 
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
                printf("Promise 생성 실패, ");
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
    
    printf("실행 완료: %.2fms, ", total_time_ms);
}

// 배치 처리
void execute_promises_in_batches(int total_count) {
    printf("배치 처리 시작 (총 %d개, 배치 크기: %d), ", 
           total_count, config.batch_size);
    
    int remaining = total_count;
    int batch_number = 1;
    
    uint64_t start_time = get_timestamp_ns();
    
    while (remaining > 0) {
        int batch_size = remaining < config.batch_size ? remaining : config.batch_size;
        
        printf("배치 %d 실행 중 (%d개)..., ", batch_number, batch_size);
        
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
        
        printf("배치 %d 완료, ", batch_number - 1);
    }
    
    uint64_t end_time = get_timestamp_ns();
    double total_time_ms = (end_time - start_time) / 1000000.0;
    
    printf("배치 처리 완료: %.2fms, ", total_time_ms);
}

// 메모리 사용량 모니터링
void monitor_memory_usage() {
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        double memory_mb = usage.ru_maxrss / 1024.0; // KB를 MB로 변환
        
        if (memory_mb > stats.memory_peak_mb) {
            stats.memory_peak_mb = memory_mb;
        }
        
        printf("현재 메모리 사용량: %.2f MB (피크: %.2f MB), ", 
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
    
    printf(", =====================================, ");
    printf("Promise 성능 분석 리포트, ");
    printf("=====================================, ");
    
    printf("📊 기본 통계:, ");
    printf("  총 Promise 수: %d, ", atomic_load(&stats.total_promises));
    printf("  성공한 Promise: %d, ", atomic_load(&stats.fulfilled_promises));
    printf("  실패한 Promise: %d, ", atomic_load(&stats.rejected_promises));
    printf("  대기 중인 Promise: %d, ", atomic_load(&stats.pending_promises));
    
    if (atomic_load(&stats.fulfilled_promises) > 0) {
        double success_rate = (double)atomic_load(&stats.fulfilled_promises) / 
                             atomic_load(&stats.total_promises) * 100;
        printf("  성공률: %.1f%%, ", success_rate);
    }
    
    printf(", ⏱️  실행 시간 통계:, ");
    printf("  평균 실행 시간: %.2f ms, ", stats.avg_execution_time_ms);
    printf("  최소 실행 시간: %.2f ms, ", stats.min_execution_time_ms);
    printf("  최대 실행 시간: %.2f ms, ", stats.max_execution_time_ms);
    
    printf(", 🔄 동시성 통계:, ");
    printf("  최대 동시 Promise 수: %d, ", stats.max_concurrent_promises);
    printf("  동시성 효율성: %.2f, ", stats.concurrency_efficiency);
    printf("  설정된 최대 동시성: %d, ", config.max_concurrent);
    
    printf(", 💾 메모리 통계:, ");
    printf("  총 메모리 사용량: %ld bytes, ", atomic_load(&stats.total_memory_usage));
    printf("  피크 메모리 사용량: %.2f MB, ", stats.memory_peak_mb);
    printf("  메모리 풀 사용: %s, ", config.enable_memory_pool ? "활성화" : "비활성화");
    
    if (stats.memory_leaks) {
        printf("  ⚠️  메모리 누수 감지됨, ");
    }
    
    printf(", 🎯 최적화 권장사항:, ");
    
    if (stats.avg_execution_time_ms > 1000) {
        printf("  - 평균 실행 시간이 높습니다. 작업을 더 작은 단위로 분할하세요., ");
    }
    
    if (stats.concurrency_efficiency < 0.5) {
        printf("  - 동시성 효율성이 낮습니다. 동시성 수준을 조정하세요., ");
    }
    
    if (stats.memory_leaks) {
        printf("  - 메모리 누수가 감지되었습니다. Promise 정리를 확인하세요., ");
    }
    
    if (atomic_load(&stats.rejected_promises) > atomic_load(&stats.total_promises) * 0.1) {
        printf("  - 실패율이 높습니다. 에러 처리를 개선하세요., ");
    }
    
    if (stats.max_concurrent_promises < config.max_concurrent) {
        printf("  - 설정된 동시성이 충분히 활용되지 않았습니다., ");
    }
    
    printf(", 최적화 기법:, ");
    printf("  - Promise.all() 사용으로 병렬 처리, ");
    printf("  - 적절한 동시성 제어 (세마포어 패턴), ");
    printf("  - 메모리 풀링으로 할당 최적화, ");
    printf("  - 배치 처리로 리소스 효율성 향상, ");
}

// Promise 체인 분석
void analyze_promise_chains() {
    printf(", 🔗 Promise 체인 분석:, ");
    
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
        printf("  평균 체인 길이: %d, ", chain_length);
        printf("  총 체인 실행 시간: %.2f ms, ", total_chain_time);
        printf("  체인당 평균 시간: %.2f ms, ", total_chain_time / chain_length);
    }
}

// 정리 함수
void cleanup() {
    printf(", 정리 중..., ");
    
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
    printf("Promise 성능 분석기, ");
    printf("사용법: %s [옵션], ", program_name);
    printf("옵션:, ");
    printf("  -n COUNT       Promise 수 (기본값: 100), ");
    printf("  -c CONCURRENT  최대 동시성 (기본값: 10), ");
    printf("  -b BATCH       배치 크기 (기본값: 50), ");
    printf("  -m             메모리 풀 비활성화, ");
    printf("  -v             상세 로깅 활성화, ");
    printf("  -t TEST        테스트 모드 (concurrency|batch|chain), ");
    printf("  --help         이 도움말 출력, ");
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
    
    printf("Promise 성능 분석 시작, ");
    printf("Promise 수: %d, ", promise_count);
    printf("테스트 모드: %s, ", test_mode);
    printf("============================, , ");
    
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
        printf("알 수 없는 테스트 모드: %s, ", test_mode);
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
```text

## 2. JavaScript Promise 최적화 라이브러리

```javascript
// promise_optimizer.js

class PromiseOptimizer {
    constructor(options = {}) {
        this.config = {
            maxConcurrency: options.maxConcurrency || 10,
            batchSize: options.batchSize || 50,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000,
            timeout: options.timeout || 30000,
            enableMetrics: options.enableMetrics !== false,
            memoryThreshold: options.memoryThreshold || 100 * 1024 * 1024, // 100MB
            ...options
        };
        
        this.metrics = {
            totalPromises: 0,
            succeededPromises: 0,
            failedPromises: 0,
            retries: 0,
            totalExecutionTime: 0,
            maxExecutionTime: 0,
            minExecutionTime: Infinity,
            memoryUsage: [],
            concurrencyLevels: [],
            errorTypes: new Map()
        };
        
        this.activePromises = new Set();
        this.semaphore = new Semaphore(this.config.maxConcurrency);
        
        if (this.config.enableMetrics) {
            this.startMetricsCollection();
        }
    }
    
    // 세마포어 구현
    static Semaphore = class {
        constructor(maxConcurrency) {
            this.maxConcurrency = maxConcurrency;
            this.currentConcurrency = 0;
            this.queue = [];
        }
        
        async acquire() {
            return new Promise(resolve => {
                if (this.currentConcurrency < this.maxConcurrency) {
                    this.currentConcurrency++;
                    resolve();
                } else {
                    this.queue.push(resolve);
                }
            });
        }
        
        release() {
            this.currentConcurrency--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                this.currentConcurrency++;
                next();
            }
        }
    };
    
    // 동시성 제어된 Promise 실행
    async withConcurrencyControl(promiseFactory) {
        await this.semaphore.acquire();
        
        const startTime = Date.now();
        const promiseId = this.generatePromiseId();
        
        try {
            this.metrics.totalPromises++;
            this.activePromises.add(promiseId);
            
            const result = await Promise.race([
                promiseFactory(),
                this.createTimeoutPromise(this.config.timeout)
            ]);
            
            const executionTime = Date.now() - startTime;
            this.updateExecutionTimeMetrics(executionTime);
            this.metrics.succeededPromises++;
            
            return result;
        } catch (error) {
            this.metrics.failedPromises++;
            this.updateErrorMetrics(error);
            throw error;
        } finally {
            this.activePromises.delete(promiseId);
            this.semaphore.release();
        }
    }
    
    // 배치 처리
    async processBatch(tasks, options = {}) {
        const batchSize = options.batchSize || this.config.batchSize;
        const results = [];
        const errors = [];
        
        console.log(`배치 처리 시작: ${tasks.length}개 작업, 배치 크기: ${batchSize}`);
        
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            console.log(`배치 ${Math.floor(i / batchSize) + 1} 처리 중... (${batch.length}개 작업)`);
            
            try {
                const batchResults = await this.executeBatch(batch, options);
                results.push(...batchResults.successes);
                errors.push(...batchResults.errors);
            } catch (error) {
                console.error(`배치 ${Math.floor(i / batchSize) + 1} 실패:`, error);
                errors.push({ batchIndex: Math.floor(i / batchSize) + 1, error });
            }
            
            // 메모리 압박 시 가비지 컬렉션 힌트
            if (this.isMemoryPressureHigh()) {
                console.warn('메모리 사용량 높음, GC 트리거 시도');
                global.gc && global.gc();
                await this.sleep(100); // GC 시간 제공
            }
        }
        
        return { results, errors };
    }
    
    // 개별 배치 실행
    async executeBatch(batch, options = {}) {
        const promises = batch.map(async (task, index) => {
            try {
                const result = await this.withConcurrencyControl(() => 
                    typeof task === 'function' ? task() : task
                );
                return { success: true, result, index };
            } catch (error) {
                return { success: false, error, index };
            }
        });
        
        const results = await Promise.allSettled(promises);
        
        const successes = [];
        const errors = [];
        
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                if (result.value.success) {
                    successes.push(result.value.result);
                } else {
                    errors.push({
                        index,
                        error: result.value.error,
                        task: batch[index]
                    });
                }
            } else {
                errors.push({
                    index,
                    error: result.reason,
                    task: batch[index]
                });
            }
        });
        
        return { successes, errors };
    }
    
    // 재시도 로직이 포함된 Promise 실행
    async withRetry(promiseFactory, options = {}) {
        const maxAttempts = options.retryAttempts || this.config.retryAttempts;
        const retryDelay = options.retryDelay || this.config.retryDelay;
        
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await this.withConcurrencyControl(promiseFactory);
            } catch (error) {
                lastError = error;
                this.metrics.retries++;
                
                if (attempt === maxAttempts) {
                    throw error;
                }
                
                const delay = retryDelay * Math.pow(2, attempt - 1); // 지수 백오프
                console.log(`재시도 ${attempt}/${maxAttempts} (${delay}ms 후)...`);
                await this.sleep(delay);
            }
        }
        
        throw lastError;
    }
    
    // 스트림 처리 (대용량 데이터)
    async processStream(dataSource, processor, options = {}) {
        const chunkSize = options.chunkSize || 1000;
        const highWaterMark = options.highWaterMark || 16;
        
        return new Promise((resolve, reject) => {
            const results = [];
            const errors = [];
            let processed = 0;
            let isProcessing = false;
            let ended = false;
            
            const processingQueue = [];
            
            const processChunk = async () => {
                if (isProcessing || processingQueue.length === 0) return;
                
                isProcessing = true;
                
                while (processingQueue.length > 0 && 
                       this.activePromises.size < this.config.maxConcurrency) {
                    
                    const chunk = processingQueue.shift();
                    
                    try {
                        const result = await this.withConcurrencyControl(() => 
                            processor(chunk)
                        );
                        results.push(result);
                        processed++;
                    } catch (error) {
                        errors.push({ chunk, error });
                    }
                }
                
                isProcessing = false;
                
                if (ended && processingQueue.length === 0 && this.activePromises.size === 0) {
                    resolve({ results, errors, processed });
                }
            };
            
            // 데이터 소스에서 청크 읽기
            const readChunks = async () => {
                try {
                    for await (const chunk of dataSource) {
                        processingQueue.push(chunk);
                        
                        // 백프레셔 제어
                        if (processingQueue.length >= highWaterMark) {
                            await this.sleep(10);
                        }
                        
                        processChunk();
                    }
                    ended = true;
                    processChunk();
                } catch (error) {
                    reject(error);
                }
            };
            
            readChunks();
        });
    }
    
    // Promise 래핑 및 최적화
    optimizePromise(promise, options = {}) {
        const startTime = Date.now();
        const promiseId = this.generatePromiseId();
        
        return promise
            .then(result => {
                const executionTime = Date.now() - startTime;
                this.updateExecutionTimeMetrics(executionTime);
                this.metrics.succeededPromises++;
                return result;
            })
            .catch(error => {
                this.metrics.failedPromises++;
                this.updateErrorMetrics(error);
                
                if (options.fallback) {
                    return options.fallback(error);
                }
                
                throw error;
            });
    }
    
    // 메모리 모니터링
    startMetricsCollection() {
        setInterval(() => {
            const memUsage = process.memoryUsage();
            this.metrics.memoryUsage.push({
                timestamp: Date.now(),
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                rss: memUsage.rss
            });
            
            this.metrics.concurrencyLevels.push({
                timestamp: Date.now(),
                active: this.activePromises.size,
                max: this.config.maxConcurrency
            });
            
            // 메트릭 데이터 크기 제한
            if (this.metrics.memoryUsage.length > 1000) {
                this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-500);
            }
            
            if (this.metrics.concurrencyLevels.length > 1000) {
                this.metrics.concurrencyLevels = this.metrics.concurrencyLevels.slice(-500);
            }
        }, 1000);
    }
    
    // 메모리 압박 감지
    isMemoryPressureHigh() {
        const memUsage = process.memoryUsage();
        return memUsage.heapUsed > this.config.memoryThreshold;
    }
    
    // 유틸리티 메서드들
    generatePromiseId() {
        return `promise_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    createTimeoutPromise(timeout) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`타임아웃: ${timeout}ms`)), timeout);
        });
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    updateExecutionTimeMetrics(executionTime) {
        this.metrics.totalExecutionTime += executionTime;
        this.metrics.maxExecutionTime = Math.max(this.metrics.maxExecutionTime, executionTime);
        this.metrics.minExecutionTime = Math.min(this.metrics.minExecutionTime, executionTime);
    }
    
    updateErrorMetrics(error) {
        const errorType = error.constructor.name;
        const count = this.metrics.errorTypes.get(errorType) || 0;
        this.metrics.errorTypes.set(errorType, count + 1);
    }
    
    // 성능 리포트 생성
    getPerformanceReport() {
        const avgExecutionTime = this.metrics.totalPromises > 0 ? 
            this.metrics.totalExecutionTime / this.metrics.totalPromises : 0;
        
        const successRate = this.metrics.totalPromises > 0 ? 
            (this.metrics.succeededPromises / this.metrics.totalPromises) * 100 : 0;
        
        const recentMemoryUsage = this.metrics.memoryUsage.slice(-10);
        const avgMemoryUsage = recentMemoryUsage.length > 0 ?
            recentMemoryUsage.reduce((sum, m) => sum + m.heapUsed, 0) / recentMemoryUsage.length : 0;
        
        return {
            summary: {
                totalPromises: this.metrics.totalPromises,
                succeededPromises: this.metrics.succeededPromises,
                failedPromises: this.metrics.failedPromises,
                successRate: successRate.toFixed(1) + '%',
                retries: this.metrics.retries
            },
            
            performance: {
                avgExecutionTime: avgExecutionTime.toFixed(2) + 'ms',
                maxExecutionTime: this.metrics.maxExecutionTime + 'ms',
                minExecutionTime: this.metrics.minExecutionTime === Infinity ? 
                    '0ms' : this.metrics.minExecutionTime + 'ms'
            },
            
            memory: {
                averageHeapUsed: this.formatBytes(avgMemoryUsage),
                currentHeapUsed: this.formatBytes(process.memoryUsage().heapUsed),
                memoryThreshold: this.formatBytes(this.config.memoryThreshold)
            },
            
            concurrency: {
                maxConcurrency: this.config.maxConcurrency,
                currentActive: this.activePromises.size,
                avgConcurrencyLevel: this.calculateAverageConcurrency()
            },
            
            errors: Array.from(this.metrics.errorTypes.entries()).map(([type, count]) => ({
                type,
                count,
                percentage: ((count / this.metrics.failedPromises) * 100).toFixed(1) + '%'
            })),
            
            recommendations: this.generateRecommendations()
        };
    }
    
    calculateAverageConcurrency() {
        if (this.metrics.concurrencyLevels.length === 0) return 0;
        
        const sum = this.metrics.concurrencyLevels.reduce((total, level) => total + level.active, 0);
        return (sum / this.metrics.concurrencyLevels.length).toFixed(2);
    }
    
    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return size.toFixed(2) + ' ' + units[unitIndex];
    }
    
    generateRecommendations() {
        const recommendations = [];
        const avgExecutionTime = this.metrics.totalPromises > 0 ? 
            this.metrics.totalExecutionTime / this.metrics.totalPromises : 0;
        
        if (avgExecutionTime > 5000) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: '평균 실행 시간이 높습니다. 작업을 더 작은 단위로 분할하거나 타임아웃을 줄이세요.'
            });
        }
        
        if (this.metrics.failedPromises / this.metrics.totalPromises > 0.1) {
            recommendations.push({
                type: 'reliability',
                priority: 'high',
                message: '실패율이 높습니다. 에러 처리와 재시도 로직을 개선하세요.'
            });
        }
        
        const avgConcurrency = this.calculateAverageConcurrency();
        if (avgConcurrency < this.config.maxConcurrency * 0.5) {
            recommendations.push({
                type: 'concurrency',
                priority: 'medium',
                message: '동시성이 충분히 활용되지 않고 있습니다. 작업 분할이나 동시성 수준을 검토하세요.'
            });
        }
        
        if (this.isMemoryPressureHigh()) {
            recommendations.push({
                type: 'memory',
                priority: 'high',
                message: '메모리 사용량이 높습니다. 배치 크기를 줄이거나 스트림 처리를 고려하세요.'
            });
        }
        
        return recommendations;
    }
    
    // 리소스 정리
    cleanup() {
        this.activePromises.clear();
        this.metrics.memoryUsage = [];
        this.metrics.concurrencyLevels = [];
        this.metrics.errorTypes.clear();
    }
}

// 사용 예제
async function example() {
    const optimizer = new PromiseOptimizer({
        maxConcurrency: 5,
        batchSize: 20,
        retryAttempts: 3,
        enableMetrics: true
    });
    
    // 1. 동시성 제어된 실행
    const task1 = () => fetch('https://api.example.com/data');
    const result1 = await optimizer.withConcurrencyControl(task1);
    
    // 2. 재시도 로직
    const task2 = () => riskyOperation();
    const result2 = await optimizer.withRetry(task2);
    
    // 3. 배치 처리
    const tasks = Array.from({ length: 100 }, (_, i) => 
        () => processItem(i)
    );
    const batchResult = await optimizer.processBatch(tasks);
    
    // 4. 성능 리포트
    const report = optimizer.getPerformanceReport();
    console.log('성능 리포트:', JSON.stringify(report, null, 2));
    
    // 정리
    optimizer.cleanup();
}

module.exports = PromiseOptimizer;
```text

이 문서는 Promise와 비동기 프로그래밍의 성능 최적화 방법을 제공합니다. 동시성 제어, 메모리 관리, 배치 처리 등의 고급 기법을 통해 대규모 비동기 애플리케이션의 성능을 크게 향상시킬 수 있습니다.
