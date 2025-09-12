---
tags:
  - Memory Leak Detection
  - Garbage Collection
  - Memory Profiling
  - Heap Analysis
---

# 메모리 누수 탐지: "메모리가 계속 늘어나요"

## 상황: 지속적인 메모리 증가

"안녕하세요, 서버 애플리케이션이 시간이 지날수록 메모리 사용량이 계속 늘어나는 문제가 있습니다. 재시작하면 정상으로 돌아가지만 며칠 지나면 다시 메모리가 부족해져요. GC가 제대로 동작하지 않는 것 같습니다. 메모리 누수를 어떻게 찾고 해결할 수 있을까요?"

이런 메모리 누수 문제는 장기간 운영되는 서비스에서 치명적인 장애로 이어질 수 있습니다. 체계적인 탐지와 분석이 필요합니다.

## 메모리 누수 분석 체계

```mermaid
graph TD
    A[메모리 사용량 증가] --> B{누수 패턴 분석}
    
    B --> C[선형 증가]
    B --> D[계단식 증가]
    B --> E[주기적 증가]
    B --> F[급격한 스파이크]
    
    C --> G[지속적 할당]
    D --> H[배치 처리 누수]
    E --> I[주기적 작업 누수]
    F --> J[대용량 객체 누수]
    
    subgraph "탐지 도구"
        K[Heap Profiling]
        L[Object Tracking]
        M[GC 로그 분석]
        N[메모리 스냅샷 비교]
    end
    
    subgraph "일반적 원인"
        O[전역 변수 누적]
        P[이벤트 리스너 미해제]
        Q[클로저 참조]
        R[캐시 무제한 증가]
        S[순환 참조]
    end
    
    subgraph "해결 방법"
        T[WeakMap/WeakSet 사용]
        U[명시적 해제]
        V[라이프사이클 관리]
        W[메모리 풀링]
    end
```text

## 1. 메모리 누수 탐지 도구

포괄적인 메모리 누수 분석을 위한 C 기반 도구입니다.

```c
// memory_leak_detector.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <sys/time.h>
#include <pthread.h>
#include <errno.h>
#include <stdatomic.h>
#include <sys/resource.h>
#include <malloc.h>
#include <sys/mman.h>
#include <fcntl.h>

#define MAX_ALLOCATIONS 100000
#define MAX_STACK_DEPTH 16
#define HASH_TABLE_SIZE 10007
#define LEAK_THRESHOLD_BYTES 1024*1024 // 1MB
#define SAMPLE_INTERVAL_MS 1000

typedef struct allocation {
    void *ptr;
    size_t size;
    struct timeval timestamp;
    char stack_trace[MAX_STACK_DEPTH][256];
    int stack_depth;
    struct allocation *next;
    int freed;
} allocation_t;

typedef struct {
    allocation_t *buckets[HASH_TABLE_SIZE];
    pthread_mutex_t mutex;
} allocation_table_t;

typedef struct {
    atomic_long total_allocated;
    atomic_long total_freed;
    atomic_long current_usage;
    atomic_long peak_usage;
    atomic_int allocation_count;
    atomic_int free_count;
    atomic_int leak_count;
    
    // 시간별 통계
    long usage_history[3600]; // 1시간 분량 (1초 간격)
    int history_index;
    
    // 크기별 통계
    atomic_long small_allocations; // < 1KB
    atomic_long medium_allocations; // 1KB - 1MB
    atomic_long large_allocations; // > 1MB
    
    // 누수 패턴
    double leak_rate_per_second;
    double growth_rate;
    int leak_trend; // -1: 감소, 0: 안정, 1: 증가
} memory_stats_t;

static allocation_table_t alloc_table = {0};
static memory_stats_t stats = {0};
static int monitoring_enabled = 0;
static pthread_t monitor_thread;

// 해시 함수
unsigned int hash_ptr(void *ptr) {
    uintptr_t addr = (uintptr_t)ptr;
    return (addr >> 3) % HASH_TABLE_SIZE; // 하위 3비트 제거 (8바이트 정렬)
}

// 스택 트레이스 수집 (시뮬레이션)
int capture_stack_trace(char stack_trace[][256], int max_depth) {
    // 실제 구현에서는 execinfo.h의 backtrace() 사용
    snprintf(stack_trace[0], 256, "malloc+0x12");
    snprintf(stack_trace[1], 256, "my_function+0x34");
    snprintf(stack_trace[2], 256, "main+0x56");
    return 3; // 시뮬레이션
}

// 할당 기록
void record_allocation(void *ptr, size_t size) {
    if (!monitoring_enabled || !ptr) return;
    
    allocation_t *alloc = malloc(sizeof(allocation_t));
    if (!alloc) return;
    
    alloc->ptr = ptr;
    alloc->size = size;
    gettimeofday(&alloc->timestamp, NULL);
    alloc->stack_depth = capture_stack_trace(alloc->stack_trace, MAX_STACK_DEPTH);
    alloc->freed = 0;
    alloc->next = NULL;
    
    unsigned int bucket = hash_ptr(ptr);
    
    pthread_mutex_lock(&alloc_table.mutex);
    alloc->next = alloc_table.buckets[bucket];
    alloc_table.buckets[bucket] = alloc;
    pthread_mutex_unlock(&alloc_table.mutex);
    
    // 통계 업데이트
    atomic_fetch_add(&stats.total_allocated, size);
    long current = atomic_fetch_add(&stats.current_usage, size) + size;
    atomic_fetch_add(&stats.allocation_count, 1);
    
    // 피크 사용량 추적
    long peak = atomic_load(&stats.peak_usage);
    while (current > peak && !atomic_compare_exchange_weak(&stats.peak_usage, &peak, current)) {
        peak = atomic_load(&stats.peak_usage);
    }
    
    // 크기별 분류
    if (size < 1024) {
        atomic_fetch_add(&stats.small_allocations, 1);
    } else if (size < 1024 * 1024) {
        atomic_fetch_add(&stats.medium_allocations, 1);
    } else {
        atomic_fetch_add(&stats.large_allocations, 1);
    }
}

// 해제 기록
void record_free(void *ptr) {
    if (!monitoring_enabled || !ptr) return;
    
    unsigned int bucket = hash_ptr(ptr);
    
    pthread_mutex_lock(&alloc_table.mutex);
    allocation_t *current = alloc_table.buckets[bucket];
    
    while (current) {
        if (current->ptr == ptr && !current->freed) {
            current->freed = 1;
            
            atomic_fetch_add(&stats.total_freed, current->size);
            atomic_fetch_sub(&stats.current_usage, current->size);
            atomic_fetch_add(&stats.free_count, 1);
            
            pthread_mutex_unlock(&alloc_table.mutex);
            return;
        }
        current = current->next;
    }
    
    pthread_mutex_unlock(&alloc_table.mutex);
    
    // 기록되지 않은 해제 (이미 해제되었거나 추적 외부 할당)
    printf("경고: 추적되지 않은 포인터 해제: %p, ", ptr);
}

// malloc 래퍼
void* tracked_malloc(size_t size) {
    void *ptr = malloc(size);
    record_allocation(ptr, size);
    return ptr;
}

// free 래퍼
void tracked_free(void *ptr) {
    record_free(ptr);
    free(ptr);
}

// calloc 래퍼
void* tracked_calloc(size_t num, size_t size) {
    void *ptr = calloc(num, size);
    record_allocation(ptr, num * size);
    return ptr;
}

// realloc 래퍼
void* tracked_realloc(void *ptr, size_t new_size) {
    if (ptr) {
        record_free(ptr);
    }
    
    void *new_ptr = realloc(ptr, new_size);
    if (new_ptr) {
        record_allocation(new_ptr, new_size);
    }
    
    return new_ptr;
}

// 누수 탐지
void detect_memory_leaks() {
    printf(", === 메모리 누수 분석 ===, ");
    
    time_t current_time = time(NULL);
    int leak_count = 0;
    size_t total_leaked = 0;
    
    // 오래된 할당들 찾기 (5분 이상)
    for (int i = 0; i < HASH_TABLE_SIZE; i++) {
        pthread_mutex_lock(&alloc_table.mutex);
        allocation_t *current = alloc_table.buckets[i];
        
        while (current) {
            if (!current->freed) {
                double age = difftime(current_time, current->timestamp.tv_sec);
                
                if (age > 300) { // 5분 이상
                    leak_count++;
                    total_leaked += current->size;
                    
                    printf("잠재적 누수: %p (%zu bytes, %.0f초 전), ",
                           current->ptr, current->size, age);
                    
                    // 스택 트레이스 출력
                    printf("  할당 스택:, ");
                    for (int j = 0; j < current->stack_depth; j++) {
                        printf("    %s, ", current->stack_trace[j]);
                    }
                    printf(", ");
                }
            }
            current = current->next;
        }
        
        pthread_mutex_unlock(&alloc_table.mutex);
    }
    
    atomic_store(&stats.leak_count, leak_count);
    
    printf("총 누수 후보: %d개 (%zu bytes), ", leak_count, total_leaked);
    
    if (total_leaked > LEAK_THRESHOLD_BYTES) {
        printf("⚠️  심각한 메모리 누수 감지! (임계값: %d bytes), ", LEAK_THRESHOLD_BYTES);
    }
}

// 메모리 사용 패턴 분석
void analyze_memory_patterns() {
    printf(", === 메모리 사용 패턴 분석 ===, ");
    
    // 최근 1시간 데이터 분석
    int valid_samples = 0;
    long sum = 0, min_usage = LONG_MAX, max_usage = 0;
    
    for (int i = 0; i < 3600; i++) {
        if (stats.usage_history[i] > 0) {
            valid_samples++;
            sum += stats.usage_history[i];
            
            if (stats.usage_history[i] < min_usage) min_usage = stats.usage_history[i];
            if (stats.usage_history[i] > max_usage) max_usage = stats.usage_history[i];
        }
    }
    
    if (valid_samples > 0) {
        long avg_usage = sum / valid_samples;
        
        printf("메모리 사용량 통계 (최근 %d분):, ", valid_samples / 60);
        printf("  평균: %ld bytes (%.2f MB), ", avg_usage, avg_usage / (1024.0 * 1024.0));
        printf("  최소: %ld bytes (%.2f MB), ", min_usage, min_usage / (1024.0 * 1024.0));
        printf("  최대: %ld bytes (%.2f MB), ", max_usage, max_usage / (1024.0 * 1024.0));
        
        // 증가 추세 분석
        if (valid_samples >= 2) {
            long first_half_sum = 0, second_half_sum = 0;
            int half = valid_samples / 2;
            
            for (int i = 0; i < half; i++) {
                if (stats.usage_history[i] > 0) first_half_sum += stats.usage_history[i];
            }
            for (int i = half; i < valid_samples; i++) {
                if (stats.usage_history[i] > 0) second_half_sum += stats.usage_history[i];
            }
            
            double growth_rate = ((double)second_half_sum / half) / ((double)first_half_sum / half) - 1.0;
            stats.growth_rate = growth_rate;
            
            printf("  증가율: %.2f%%, ", growth_rate * 100);
            
            if (growth_rate > 0.1) {
                stats.leak_trend = 1;
                printf("  ⚠️  메모리 사용량이 증가 추세입니다!, ");
            } else if (growth_rate < -0.1) {
                stats.leak_trend = -1;
                printf("  ✅ 메모리 사용량이 감소 추세입니다., ");
            } else {
                stats.leak_trend = 0;
                printf("  ✅ 메모리 사용량이 안정적입니다., ");
            }
        }
    }
    
    // 할당 크기 분포
    printf(", 할당 크기 분포:, ");
    printf("  소형 (< 1KB): %ld개, ", atomic_load(&stats.small_allocations));
    printf("  중형 (1KB-1MB): %ld개, ", atomic_load(&stats.medium_allocations));
    printf("  대형 (> 1MB): %ld개, ", atomic_load(&stats.large_allocations));
}

// 힙 파편화 분석
void analyze_heap_fragmentation() {
    printf(", === 힙 파편화 분석 ===, ");
    
    struct mallinfo mi = mallinfo();
    
    printf("힙 정보:, ");
    printf("  총 할당된 공간: %d bytes, ", mi.hblkhd + mi.uordblks);
    printf("  사용 중인 공간: %d bytes, ", mi.uordblks);
    printf("  여유 공간: %d bytes, ", mi.fordblks);
    printf("  여유 블록 수: %d개, ", mi.ordblks);
    
    if (mi.fordblks > 0) {
        double fragmentation = (double)mi.ordblks / (mi.fordblks / 1024.0); // KB당 블록 수
        printf("  파편화 지수: %.2f (블록/KB), ", fragmentation);
        
        if (fragmentation > 10) {
            printf("  ⚠️  높은 파편화가 감지되었습니다!, ");
        }
    }
}

// GC 통계 시뮬레이션
void analyze_gc_performance() {
    printf(", === GC 성능 분석 ===, ");
    
    // 실제 구현에서는 GC 로그 파싱 또는 GC API 사용
    printf("GC 통계 (시뮬레이션):, ");
    printf("  Minor GC 횟수: %d, ", rand() % 100 + 50);
    printf("  Major GC 횟수: %d, ", rand() % 10 + 5);
    printf("  평균 GC 시간: %.2f ms, ", (rand() % 50 + 10) / 10.0);
    printf("  GC로 해제된 메모리: %.2f MB, ", (rand() % 1000 + 500) / 10.0);
    
    // GC 효율성 분석
    long total_allocated = atomic_load(&stats.total_allocated);
    long total_freed = atomic_load(&stats.total_freed);
    
    if (total_allocated > 0) {
        double gc_efficiency = (double)total_freed / total_allocated;
        printf("  GC 효율성: %.1f%%, ", gc_efficiency * 100);
        
        if (gc_efficiency < 0.8) {
            printf("  ⚠️  GC 효율성이 낮습니다. 객체 생존 시간을 검토하세요., ");
        }
    }
}

// 실시간 모니터링 스레드
void* memory_monitor(void *arg) {
    printf("메모리 모니터링 시작, ");
    
    while (monitoring_enabled) {
        long current_usage = atomic_load(&stats.current_usage);
        
        // 사용량 히스토리 업데이트
        stats.usage_history[stats.history_index] = current_usage;
        stats.history_index = (stats.history_index + 1) % 3600;
        
        // 누수율 계산 (초당 바이트)
        static long prev_usage = 0;
        static time_t prev_time = 0;
        
        time_t current_time = time(NULL);
        if (prev_time > 0 && current_time > prev_time) {
            stats.leak_rate_per_second = (double)(current_usage - prev_usage) / 
                                        (current_time - prev_time);
        }
        
        prev_usage = current_usage;
        prev_time = current_time;
        
        sleep(1);
    }
    
    printf("메모리 모니터링 종료, ");
    return NULL;
}

// 실시간 대시보드
void display_memory_dashboard() {
    while (monitoring_enabled) {
        system("clear");
        
        printf("========================================, ");
        printf("실시간 메모리 모니터링 대시보드, ");
        printf("========================================, ");
        
        long current = atomic_load(&stats.current_usage);
        long peak = atomic_load(&stats.peak_usage);
        int allocs = atomic_load(&stats.allocation_count);
        int frees = atomic_load(&stats.free_count);
        
        printf("📊 현재 상태:, ");
        printf("  현재 사용량: %.2f MB, ", current / (1024.0 * 1024.0));
        printf("  피크 사용량: %.2f MB, ", peak / (1024.0 * 1024.0));
        printf("  할당 횟수: %d, ", allocs);
        printf("  해제 횟수: %d, ", frees);
        printf("  미해제 객체: %d, ", allocs - frees);
        
        if (stats.leak_rate_per_second != 0) {
            printf("  누수율: %.2f bytes/sec, ", stats.leak_rate_per_second);
            
            if (stats.leak_rate_per_second > 1024) {
                printf("  ⚠️  높은 누수율 감지!, ");
            }
        }
        
        printf(", 📈 추세:, ");
        if (stats.leak_trend == 1) {
            printf("  메모리 사용량: 증가 추세 ⬆️, ");
        } else if (stats.leak_trend == -1) {
            printf("  메모리 사용량: 감소 추세 ⬇️, ");
        } else {
            printf("  메모리 사용량: 안정적 ➡️, ");
        }
        
        // 간단한 그래프 (최근 20개 데이터 포인트)
        printf(", 📊 사용량 그래프 (최근 20초):, ");
        long max_in_range = 0;
        int start_idx = (stats.history_index - 20 + 3600) % 3600;
        
        for (int i = 0; i < 20; i++) {
            int idx = (start_idx + i) % 3600;
            if (stats.usage_history[idx] > max_in_range) {
                max_in_range = stats.usage_history[idx];
            }
        }
        
        if (max_in_range > 0) {
            for (int i = 0; i < 20; i++) {
                int idx = (start_idx + i) % 3600;
                int height = (stats.usage_history[idx] * 10) / max_in_range;
                printf("%2d: ", i);
                for (int j = 0; j < height; j++) {
                    printf("█");
                }
                printf(" %.1fMB, ", stats.usage_history[idx] / (1024.0 * 1024.0));
            }
        }
        
        printf(", [Ctrl+C로 종료], ");
        sleep(1);
    }
}

// 메모리 누수 리포트 생성
void generate_leak_report() {
    FILE *fp = fopen("memory_leak_report.json", "w");
    if (!fp) {
        perror("리포트 파일 생성 실패");
        return;
    }
    
    fprintf(fp, "{, ");
    fprintf(fp, "  \"timestamp\": %ld,, ", time(NULL));
    fprintf(fp, "  \"statistics\": {, ");
    fprintf(fp, "    \"total_allocated\": %ld,, ", atomic_load(&stats.total_allocated));
    fprintf(fp, "    \"total_freed\": %ld,, ", atomic_load(&stats.total_freed));
    fprintf(fp, "    \"current_usage\": %ld,, ", atomic_load(&stats.current_usage));
    fprintf(fp, "    \"peak_usage\": %ld,, ", atomic_load(&stats.peak_usage));
    fprintf(fp, "    \"allocation_count\": %d,, ", atomic_load(&stats.allocation_count));
    fprintf(fp, "    \"free_count\": %d,, ", atomic_load(&stats.free_count));
    fprintf(fp, "    \"leak_count\": %d,, ", atomic_load(&stats.leak_count));
    fprintf(fp, "    \"leak_rate_per_second\": %.2f,, ", stats.leak_rate_per_second);
    fprintf(fp, "    \"growth_rate\": %.4f,, ", stats.growth_rate);
    fprintf(fp, "    \"leak_trend\": %d, ", stats.leak_trend);
    fprintf(fp, "  },, ");
    
    fprintf(fp, "  \"recommendations\": [, ");
    
    if (stats.leak_rate_per_second > 1024) {
        fprintf(fp, "    \"높은 누수율이 감지되었습니다. 할당 패턴을 검토하세요.\",, ");
    }
    
    if (stats.growth_rate > 0.1) {
        fprintf(fp, "    \"메모리 사용량이 지속적으로 증가하고 있습니다.\",, ");
    }
    
    long current = atomic_load(&stats.current_usage);
    long peak = atomic_load(&stats.peak_usage);
    if (current > peak * 0.9) {
        fprintf(fp, "    \"메모리 사용량이 피크에 근접했습니다.\",, ");
    }
    
    fprintf(fp, "    \"정기적인 메모리 프로파일링을 권장합니다.\", ");
    fprintf(fp, "  ], ");
    fprintf(fp, "}, ");
    
    fclose(fp);
    printf("메모리 누수 리포트 생성: memory_leak_report.json, ");
}

// 시그널 핸들러
void signal_handler(int sig) {
    printf(", 모니터링 중단 신호 수신..., ");
    monitoring_enabled = 0;
}

// 사용법 출력
void print_usage(const char *program_name) {
    printf("메모리 누수 탐지기, ");
    printf("사용법: %s [옵션], ", program_name);
    printf("옵션:, ");
    printf("  -m             실시간 모니터링 모드, ");
    printf("  -d             대시보드 모드, ");
    printf("  -a             전체 분석 실행, ");
    printf("  -t SECONDS     테스트 시간 (기본값: 60초), ");
    printf("  --help         이 도움말 출력, ");
}

int main(int argc, char *argv[]) {
    int mode = 0; // 0: 분석, 1: 모니터링, 2: 대시보드
    int test_duration = 60;
    
    // 명령행 인자 처리
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-m") == 0) {
            mode = 1;
        } else if (strcmp(argv[i], "-d") == 0) {
            mode = 2;
        } else if (strcmp(argv[i], "-a") == 0) {
            mode = 0;
        } else if (strcmp(argv[i], "-t") == 0 && i + 1 < argc) {
            test_duration = atoi(argv[++i]);
        } else if (strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return 0;
        }
    }
    
    // 초기화
    if (pthread_mutex_init(&alloc_table.mutex, NULL) != 0) {
        perror("뮤텍스 초기화 실패");
        return 1;
    }
    
    // 시그널 핸들러 설정
    signal(SIGINT, signal_handler);
    
    monitoring_enabled = 1;
    
    printf("메모리 누수 탐지기 시작, ");
    
    if (mode == 1 || mode == 2) {
        // 모니터링 스레드 시작
        if (pthread_create(&monitor_thread, NULL, memory_monitor, NULL) != 0) {
            perror("모니터링 스레드 생성 실패");
            return 1;
        }
        
        if (mode == 2) {
            // 대시보드 모드
            display_memory_dashboard();
        } else {
            // 백그라운드 모니터링
            printf("백그라운드 모니터링 중... (%d초), ", test_duration);
            sleep(test_duration);
        }
        
        monitoring_enabled = 0;
        pthread_join(monitor_thread, NULL);
    }
    
    // 테스트 할당 및 누수 시뮬레이션
    printf(", 메모리 할당 테스트 시작..., ");
    
    // 정상적인 할당/해제
    for (int i = 0; i < 1000; i++) {
        void *ptr = tracked_malloc(1024);
        if (i % 10 != 0) { // 10%는 해제하지 않음 (의도적 누수)
            tracked_free(ptr);
        }
    }
    
    // 대용량 할당 (일부 누수)
    for (int i = 0; i < 10; i++) {
        void *ptr = tracked_malloc(1024 * 1024); // 1MB
        if (i % 3 != 0) {
            tracked_free(ptr);
        }
    }
    
    printf("테스트 완료, ");
    
    // 분석 실행
    detect_memory_leaks();
    analyze_memory_patterns();
    analyze_heap_fragmentation();
    analyze_gc_performance();
    
    // 리포트 생성
    generate_leak_report();
    
    // 정리
    pthread_mutex_destroy(&alloc_table.mutex);
    
    return 0;
}
```text

## 2. Node.js 메모리 프로파일링 도구

```javascript
#!/usr/bin/env node
// memory_profiler.js

const v8 = require('v8');
const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class MemoryProfiler {
    constructor(options = {}) {
        this.options = {
            sampleInterval: options.sampleInterval || 5000, // 5초
            heapSnapshotInterval: options.heapSnapshotInterval || 60000, // 1분
            leakThreshold: options.leakThreshold || 50 * 1024 * 1024, // 50MB
            retentionCount: options.retentionCount || 10,
            outputDir: options.outputDir || './memory_analysis',
            enableDetailedGC: options.enableDetailedGC !== false,
            ...options
        };
        
        this.samples = [];
        this.heapSnapshots = [];
        this.gcEvents = [];
        this.isRunning = false;
        this.startTime = Date.now();
        
        this.baselineHeap = null;
        this.previousSnapshot = null;
        
        this.setupGCMonitoring();
        this.setupProcessMonitoring();
    }
    
    // GC 모니터링 설정
    setupGCMonitoring() {
        if (!this.options.enableDetailedGC) return;
        
        // GC 성능 관찰자 설정
        const obs = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            
            entries.forEach(entry => {
                if (entry.entryType === 'gc') {
                    this.gcEvents.push({
                        timestamp: Date.now(),
                        type: this.getGCTypeName(entry.kind),
                        duration: entry.duration,
                        flags: entry.flags
                    });
                    
                    // 긴 GC 경고
                    if (entry.duration > 100) {
                        console.warn(`⚠️  긴 GC 감지: ${this.getGCTypeName(entry.kind)} (${entry.duration.toFixed(2)}ms)`);
                    }
                }
            });
        });
        
        obs.observe({ entryTypes: ['gc'] });
    }
    
    // 프로세스 모니터링 설정
    setupProcessMonitoring() {
        // 메모리 경고 리스너
        process.on('warning', (warning) => {
            if (warning.name === 'MaxListenersExceededWarning' ||
                warning.name === 'DeprecationWarning') {
                console.warn('프로세스 경고:', warning.message);
            }
        });
        
        // 처리되지 않은 Promise 거부
        process.on('unhandledRejection', (reason, promise) => {
            console.error('처리되지 않은 Promise 거부:', reason);
            // 메모리 누수의 원인이 될 수 있음
        });
    }
    
    // GC 타입 이름 변환
    getGCTypeName(kind) {
        const gcTypes = {
            1: 'Scavenge',      // Minor GC
            2: 'Mark-Sweep',    // Major GC (old generation)
            4: 'Incremental',   // Incremental marking
            8: 'WeakPhantom',   // Weak callback processing
            15: 'All'           // Full GC
        };
        
        return gcTypes[kind] || `Unknown(${kind})`;
    }
    
    // 메모리 샘플 수집
    collectMemorySample() {
        const memUsage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();
        const heapSpaceStats = v8.getHeapSpaceStatistics();
        
        const sample = {
            timestamp: Date.now(),
            memoryUsage: memUsage,
            heapStatistics: heapStats,
            heapSpaceStatistics: heapSpaceStats,
            
            // 계산된 메트릭
            heapUsedMB: memUsage.heapUsed / 1024 / 1024,
            heapTotalMB: memUsage.heapTotal / 1024 / 1024,
            externalMB: memUsage.external / 1024 / 1024,
            rssMB: memUsage.rss / 1024 / 1024,
            
            // 힙 사용률
            heapUtilization: (memUsage.heapUsed / memUsage.heapTotal) * 100,
            
            // GC 압박 지표
            gcPressure: this.calculateGCPressure(heapStats)
        };
        
        this.samples.push(sample);
        
        // 샘플 수 제한
        if (this.samples.length > this.options.retentionCount * 12) { // 1시간 분량 유지
            this.samples = this.samples.slice(-this.options.retentionCount * 12);
        }
        
        return sample;
    }
    
    // GC 압박 지표 계산
    calculateGCPressure(heapStats) {
        // 힙 크기 대비 사용량과 GC 빈도를 고려한 압박 지표
        const heapUsageRatio = heapStats.used_heap_size / heapStats.heap_size_limit;
        const recentGCCount = this.gcEvents.filter(gc => 
            Date.now() - gc.timestamp < 60000
        ).length;
        
        return {
            heapUsageRatio: heapUsageRatio,
            recentGCCount: recentGCCount,
            pressure: heapUsageRatio * 0.7 + (recentGCCount / 10) * 0.3
        };
    }
    
    // 힙 스냅샷 생성
    async createHeapSnapshot() {
        const snapshotName = `heap_${Date.now()}.heapsnapshot`;
        const outputPath = path.join(this.options.outputDir, snapshotName);
        
        try {
            await fs.mkdir(this.options.outputDir, { recursive: true });
            
            console.log('힙 스냅샷 생성 중...');
            const startTime = performance.now();
            
            // 힙 스냅샷 생성
            const snapshot = v8.getHeapSnapshot();
            
            const writeStream = require('fs').createWriteStream(outputPath);
            
            await new Promise((resolve, reject) => {
                snapshot.pipe(writeStream);
                snapshot.on('end', resolve);
                snapshot.on('error', reject);
                writeStream.on('error', reject);
            });
            
            const duration = performance.now() - startTime;
            console.log(`힙 스냅샷 생성 완료: ${snapshotName} (${duration.toFixed(2)}ms)`);
            
            const stats = await fs.stat(outputPath);
            const snapshotInfo = {
                timestamp: Date.now(),
                filename: snapshotName,
                path: outputPath,
                sizeBytes: stats.size,
                duration: duration
            };
            
            this.heapSnapshots.push(snapshotInfo);
            
            // 스냅샷 수 제한
            if (this.heapSnapshots.length > this.options.retentionCount) {
                const oldSnapshot = this.heapSnapshots.shift();
                try {
                    await fs.unlink(oldSnapshot.path);
                    console.log(`이전 스냅샷 삭제: ${oldSnapshot.filename}`);
                } catch (error) {
                    console.warn(`스냅샷 삭제 실패: ${error.message}`);
                }
            }
            
            return snapshotInfo;
            
        } catch (error) {
            console.error('힙 스냅샷 생성 실패:', error);
            throw error;
        }
    }
    
    // 메모리 누수 감지
    detectMemoryLeaks() {
        if (this.samples.length < 10) {
            return { detected: false, reason: '샘플 부족' };
        }
        
        const recentSamples = this.samples.slice(-10); // 최근 10개 샘플
        const firstSample = recentSamples[0];
        const lastSample = recentSamples[recentSamples.length - 1];
        
        // 메모리 증가율 계산
        const heapGrowth = lastSample.memoryUsage.heapUsed - firstSample.memoryUsage.heapUsed;
        const rssGrowth = lastSample.memoryUsage.rss - firstSample.memoryUsage.rss;
        const timeDiff = lastSample.timestamp - firstSample.timestamp;
        
        const heapGrowthRate = heapGrowth / (timeDiff / 1000); // bytes/sec
        const rssGrowthRate = rssGrowth / (timeDiff / 1000);
        
        // 누수 임계값 확인
        const leakDetected = heapGrowthRate > 1024 * 1024 || // 1MB/sec 이상 증가
                            rssGrowth > this.options.leakThreshold;
        
        if (leakDetected) {
            return {
                detected: true,
                heapGrowthRate: heapGrowthRate,
                rssGrowthRate: rssGrowthRate,
                heapGrowthMB: heapGrowth / 1024 / 1024,
                rssGrowthMB: rssGrowth / 1024 / 1024,
                timeWindowMinutes: timeDiff / (1000 * 60)
            };
        }
        
        return { detected: false };
    }
    
    // 객체 타입별 분석
    analyzeObjectTypes() {
        const heapStats = v8.getHeapSpaceStatistics();
        
        const analysis = {
            timestamp: Date.now(),
            spaceUsage: heapStats.map(space => ({
                name: space.space_name,
                sizeUsed: space.space_used_size,
                sizeAvailable: space.space_available_size,
                physicalSize: space.physical_space_size,
                utilizationPercent: (space.space_used_size / space.space_available_size) * 100
            })),
            
            // 주요 공간별 분석
            oldSpaceUsage: heapStats.find(s => s.space_name === 'old_space'),
            newSpaceUsage: heapStats.find(s => s.space_name === 'new_space'),
            codeSpaceUsage: heapStats.find(s => s.space_name === 'code_space')
        };
        
        return analysis;
    }
    
    // 실시간 모니터링 시작
    startMonitoring() {
        if (this.isRunning) {
            console.warn('모니터링이 이미 실행 중입니다.');
            return;
        }
        
        this.isRunning = true;
        console.log('메모리 프로파일링 시작');
        
        // 베이스라인 수집
        this.baselineHeap = this.collectMemorySample();
        console.log(`베이스라인 힙 사용량: ${this.baselineHeap.heapUsedMB.toFixed(2)}MB`);
        
        // 정기적인 샘플 수집
        this.sampleInterval = setInterval(() => {
            this.collectMemorySample();
            this.displayCurrentStatus();
            
            // 누수 감지
            const leakResult = this.detectMemoryLeaks();
            if (leakResult.detected) {
                console.warn('🚨 메모리 누수 감지!');
                console.warn(`  힙 증가율: ${(leakResult.heapGrowthRate / 1024).toFixed(2)} KB/sec`);
                console.warn(`  RSS 증가: ${leakResult.rssGrowthMB.toFixed(2)} MB`);
            }
        }, this.options.sampleInterval);
        
        // 정기적인 힙 스냅샷
        this.snapshotInterval = setInterval(async () => {
            try {
                await this.createHeapSnapshot();
            } catch (error) {
                console.error('힙 스냅샷 생성 오류:', error);
            }
        }, this.options.heapSnapshotInterval);
    }
    
    // 현재 상태 표시
    displayCurrentStatus() {
        const latest = this.samples[this.samples.length - 1];
        if (!latest) return;
        
        console.clear();
        console.log('========================================');
        console.log('실시간 메모리 프로파일링');
        console.log('========================================');
        console.log(`실행 시간: ${Math.floor((Date.now() - this.startTime) / 1000)}초`);
        console.log(`샘플 수: ${this.samples.length}`);
        console.log('');
        
        console.log('📊 현재 메모리 사용량:');
        console.log(`  힙 사용량: ${latest.heapUsedMB.toFixed(2)}MB / ${latest.heapTotalMB.toFixed(2)}MB (${latest.heapUtilization.toFixed(1)}%)`);
        console.log(`  RSS: ${latest.rssMB.toFixed(2)}MB`);
        console.log(`  External: ${latest.externalMB.toFixed(2)}MB`);
        
        if (this.baselineHeap) {
            const heapGrowth = latest.heapUsedMB - this.baselineHeap.heapUsedMB;
            const rssGrowth = latest.rssMB - this.baselineHeap.rssMB;
            
            console.log('');
            console.log('📈 베이스라인 대비 변화:');
            console.log(`  힙: ${heapGrowth > 0 ? '+' : ''}${heapGrowth.toFixed(2)}MB`);
            console.log(`  RSS: ${rssGrowth > 0 ? '+' : ''}${rssGrowth.toFixed(2)}MB`);
        }
        
        // GC 정보
        if (this.gcEvents.length > 0) {
            const recentGC = this.gcEvents.filter(gc => Date.now() - gc.timestamp < 60000);
            console.log('');
            console.log('🗑️  GC 활동 (최근 1분):');
            console.log(`  GC 횟수: ${recentGC.length}`);
            
            if (recentGC.length > 0) {
                const avgDuration = recentGC.reduce((sum, gc) => sum + gc.duration, 0) / recentGC.length;
                console.log(`  평균 GC 시간: ${avgDuration.toFixed(2)}ms`);
                
                const gcTypes = {};
                recentGC.forEach(gc => {
                    gcTypes[gc.type] = (gcTypes[gc.type] || 0) + 1;
                });
                
                Object.entries(gcTypes).forEach(([type, count]) => {
                    console.log(`  ${type}: ${count}회`);
                });
            }
        }
        
        // GC 압박 지표
        console.log('');
        console.log('⚡ GC 압박 지표:');
        console.log(`  압박 수준: ${(latest.gcPressure.pressure * 100).toFixed(1)}%`);
        console.log(`  힙 사용률: ${(latest.gcPressure.heapUsageRatio * 100).toFixed(1)}%`);
        
        console.log('');
        console.log('[Ctrl+C로 종료]');
    }
    
    // 모니터링 중지
    stopMonitoring() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        
        if (this.sampleInterval) {
            clearInterval(this.sampleInterval);
        }
        
        if (this.snapshotInterval) {
            clearInterval(this.snapshotInterval);
        }
        
        console.log(', 모니터링 중지됨');
    }
    
    // 상세 분석 리포트 생성
    async generateDetailedReport() {
        const report = {
            metadata: {
                startTime: this.startTime,
                endTime: Date.now(),
                duration: Date.now() - this.startTime,
                sampleCount: this.samples.length,
                snapshotCount: this.heapSnapshots.length
            },
            
            baseline: this.baselineHeap,
            finalSample: this.samples[this.samples.length - 1],
            
            memoryGrowth: this.calculateMemoryGrowth(),
            gcAnalysis: this.analyzeGCPerformance(),
            leakDetection: this.detectMemoryLeaks(),
            objectAnalysis: this.analyzeObjectTypes(),
            
            recommendations: this.generateRecommendations(),
            
            samples: this.samples,
            gcEvents: this.gcEvents,
            heapSnapshots: this.heapSnapshots
        };
        
        // 리포트 저장
        const reportPath = path.join(this.options.outputDir, `memory_report_${Date.now()}.json`);
        await fs.mkdir(this.options.outputDir, { recursive: true });
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log(`상세 리포트 생성: ${reportPath}`);
        
        // 요약 출력
        this.printReportSummary(report);
        
        return report;
    }
    
    // 메모리 증가량 계산
    calculateMemoryGrowth() {
        if (this.samples.length < 2) return null;
        
        const first = this.samples[0];
        const last = this.samples[this.samples.length - 1];
        const duration = last.timestamp - first.timestamp;
        
        return {
            heapGrowthMB: (last.memoryUsage.heapUsed - first.memoryUsage.heapUsed) / 1024 / 1024,
            rssGrowthMB: (last.memoryUsage.rss - first.memoryUsage.rss) / 1024 / 1024,
            externalGrowthMB: (last.memoryUsage.external - first.memoryUsage.external) / 1024 / 1024,
            durationMinutes: duration / (1000 * 60),
            
            growthRates: {
                heapMBPerMinute: ((last.memoryUsage.heapUsed - first.memoryUsage.heapUsed) / 1024 / 1024) / (duration / (1000 * 60)),
                rssMBPerMinute: ((last.memoryUsage.rss - first.memoryUsage.rss) / 1024 / 1024) / (duration / (1000 * 60))
            }
        };
    }
    
    // GC 성능 분석
    analyzeGCPerformance() {
        if (this.gcEvents.length === 0) return null;
        
        const totalDuration = this.gcEvents.reduce((sum, gc) => sum + gc.duration, 0);
        const avgDuration = totalDuration / this.gcEvents.length;
        const maxDuration = Math.max(...this.gcEvents.map(gc => gc.duration));
        
        // GC 타입별 분석
        const typeStats = {};
        this.gcEvents.forEach(gc => {
            if (!typeStats[gc.type]) {
                typeStats[gc.type] = { count: 0, totalDuration: 0 };
            }
            typeStats[gc.type].count++;
            typeStats[gc.type].totalDuration += gc.duration;
        });
        
        Object.keys(typeStats).forEach(type => {
            typeStats[type].avgDuration = typeStats[type].totalDuration / typeStats[type].count;
        });
        
        return {
            totalEvents: this.gcEvents.length,
            totalDuration: totalDuration,
            avgDuration: avgDuration,
            maxDuration: maxDuration,
            typeStatistics: typeStats,
            
            // GC 압박 분석
            gcPressure: this.calculateOverallGCPressure()
        };
    }
    
    calculateOverallGCPressure() {
        const recentSamples = this.samples.slice(-10);
        if (recentSamples.length === 0) return 0;
        
        const avgPressure = recentSamples.reduce((sum, sample) => 
            sum + sample.gcPressure.pressure, 0) / recentSamples.length;
        
        return avgPressure;
    }
    
    // 권장사항 생성
    generateRecommendations() {
        const recommendations = [];
        const growth = this.calculateMemoryGrowth();
        const gcAnalysis = this.analyzeGCPerformance();
        const leakResult = this.detectMemoryLeaks();
        
        if (leakResult.detected) {
            recommendations.push({
                type: 'memory_leak',
                priority: 'critical',
                message: '메모리 누수가 감지되었습니다.',
                details: `힙 증가율: ${(leakResult.heapGrowthRate / 1024).toFixed(2)} KB/sec`,
                actions: [
                    '힙 스냅샷을 분석하여 증가하는 객체를 확인하세요',
                    '이벤트 리스너와 콜백 해제를 확인하세요',
                    '전역 변수와 캐시 사용을 검토하세요'
                ]
            });
        }
        
        if (growth && growth.growthRates.heapMBPerMinute > 1) {
            recommendations.push({
                type: 'memory_growth',
                priority: 'high',
                message: '높은 메모리 증가율이 감지되었습니다.',
                details: `힙 증가율: ${growth.growthRates.heapMBPerMinute.toFixed(2)} MB/min`,
                actions: [
                    '객체 생성 패턴을 최적화하세요',
                    '불필요한 메모리 할당을 줄이세요',
                    '메모리 풀링을 고려하세요'
                ]
            });
        }
        
        if (gcAnalysis && gcAnalysis.avgDuration > 50) {
            recommendations.push({
                type: 'gc_performance',
                priority: 'medium',
                message: 'GC 성능이 저하되었습니다.',
                details: `평균 GC 시간: ${gcAnalysis.avgDuration.toFixed(2)}ms`,
                actions: [
                    '힙 크기를 조정하여 GC 빈도를 최적화하세요',
                    '대용량 객체 할당을 피하세요',
                    'Incremental GC 옵션을 고려하세요'
                ]
            });
        }
        
        return recommendations;
    }
    
    // 리포트 요약 출력
    printReportSummary(report) {
        console.log(', === 메모리 프로파일링 리포트 요약 ===');
        console.log(`모니터링 시간: ${Math.floor(report.metadata.duration / (1000 * 60))}분`);
        
        if (report.memoryGrowth) {
            console.log(`힙 증가: ${report.memoryGrowth.heapGrowthMB.toFixed(2)}MB`);
            console.log(`RSS 증가: ${report.memoryGrowth.rssGrowthMB.toFixed(2)}MB`);
            console.log(`힙 증가율: ${report.memoryGrowth.growthRates.heapMBPerMinute.toFixed(2)}MB/min`);
        }
        
        if (report.gcAnalysis) {
            console.log(`총 GC 횟수: ${report.gcAnalysis.totalEvents}회`);
            console.log(`평균 GC 시간: ${report.gcAnalysis.avgDuration.toFixed(2)}ms`);
        }
        
        if (report.leakDetection.detected) {
            console.log('🚨 메모리 누수 감지됨!');
        } else {
            console.log('✅ 메모리 누수 없음');
        }
        
        console.log(`, 권장사항: ${report.recommendations.length}개`);
        report.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.message}`);
        });
    }
    
    // 정리
    cleanup() {
        this.stopMonitoring();
        this.samples = [];
        this.gcEvents = [];
        this.heapSnapshots = [];
    }
}

// CLI 실행
if (require.main === module) {
    const profiler = new MemoryProfiler({
        sampleInterval: 5000,
        heapSnapshotInterval: 30000,
        outputDir: './memory_analysis'
    });
    
    // 종료 처리
    process.on('SIGINT', async () => {
        console.log(', 프로파일링 중단...');
        profiler.stopMonitoring();
        
        try {
            await profiler.generateDetailedReport();
        } catch (error) {
            console.error('리포트 생성 실패:', error);
        }
        
        profiler.cleanup();
        process.exit(0);
    });
    
    // 모니터링 시작
    profiler.startMonitoring();
}

module.exports = MemoryProfiler;
```text

이 문서는 메모리 누수를 체계적으로 탐지하고 분석하는 방법을 제공합니다. C 기반 저수준 도구와 Node.js 전용 프로파일러를 통해 실시간으로 메모리 사용 패턴을 추적하고 누수를 조기에 발견할 수 있습니다.
