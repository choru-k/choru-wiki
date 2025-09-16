---
tags:
  - c-programming
  - deep-study
  - hands-on
  - hash-table
  - intermediate
  - memory-leak-detection
  - real-time-monitoring
  - system-profiling
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-8시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 05a. 시스템 레벨 메모리 누수 탐지 도구

## C 기반 포괄적 메모리 누수 분석 도구

메모리 누수를 체계적으로 탐지하고 분석하기 위한 강력한 C 기반 도구입니다. 실시간 모니터링과 상세한 분석 기능을 제공합니다.

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
    printf("경고: 추적되지 않은 포인터 해제: %p\n", ptr);
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
    printf("\n=== 메모리 누수 분석 ===\n");

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

                    printf("잠재적 누수: %p (%zu bytes, %.0f초 전)\n",
                           current->ptr, current->size, age);

                    // 스택 트레이스 출력
                    printf("  할당 스택:\n");
                    for (int j = 0; j < current->stack_depth; j++) {
                        printf("    %s\n", current->stack_trace[j]);
                    }
                    printf("\n");
                }
            }
            current = current->next;
        }

        pthread_mutex_unlock(&alloc_table.mutex);
    }

    atomic_store(&stats.leak_count, leak_count);

    printf("총 누수 후보: %d개 (%zu bytes)\n", leak_count, total_leaked);

    if (total_leaked > LEAK_THRESHOLD_BYTES) {
        printf("⚠️  심각한 메모리 누수 감지! (임계값: %d bytes)\n", LEAK_THRESHOLD_BYTES);
    }
}

// 메모리 사용 패턴 분석
void analyze_memory_patterns() {
    printf("\n=== 메모리 사용 패턴 분석 ===\n");

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

        printf("메모리 사용량 통계 (최근 %d분):\n", valid_samples / 60);
        printf("  평균: %ld bytes (%.2f MB)\n", avg_usage, avg_usage / (1024.0 * 1024.0));
        printf("  최소: %ld bytes (%.2f MB)\n", min_usage, min_usage / (1024.0 * 1024.0));
        printf("  최대: %ld bytes (%.2f MB)\n", max_usage, max_usage / (1024.0 * 1024.0));

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

            printf("  증가율: %.2f%%\n", growth_rate * 100);

            if (growth_rate > 0.1) {
                stats.leak_trend = 1;
                printf("  ⚠️  메모리 사용량이 증가 추세입니다!\n");
            } else if (growth_rate < -0.1) {
                stats.leak_trend = -1;
                printf("  ✅ 메모리 사용량이 감소 추세입니다.\n");
            } else {
                stats.leak_trend = 0;
                printf("  ✅ 메모리 사용량이 안정적입니다.\n");
            }
        }
    }

    // 할당 크기 분포
    printf("\n할당 크기 분포:\n");
    printf("  소형 (< 1KB): %ld개\n", atomic_load(&stats.small_allocations));
    printf("  중형 (1KB-1MB): %ld개\n", atomic_load(&stats.medium_allocations));
    printf("  대형 (> 1MB): %ld개\n", atomic_load(&stats.large_allocations));
}

// 힙 파편화 분석
void analyze_heap_fragmentation() {
    printf("\n=== 힙 파편화 분석 ===\n");

    struct mallinfo mi = mallinfo();

    printf("힙 정보:\n");
    printf("  총 할당된 공간: %d bytes\n", mi.hblkhd + mi.uordblks);
    printf("  사용 중인 공간: %d bytes\n", mi.uordblks);
    printf("  여유 공간: %d bytes\n", mi.fordblks);
    printf("  여유 블록 수: %d개\n", mi.ordblks);

    if (mi.fordblks > 0) {
        double fragmentation = (double)mi.ordblks / (mi.fordblks / 1024.0); // KB당 블록 수
        printf("  파편화 지수: %.2f (블록/KB)\n", fragmentation);

        if (fragmentation > 10) {
            printf("  ⚠️  높은 파편화가 감지되었습니다!\n");
        }
    }
}

// GC 통계 시뮬레이션
void analyze_gc_performance() {
    printf("\n=== GC 성능 분석 ===\n");

    // 실제 구현에서는 GC 로그 파싱 또는 GC API 사용
    printf("GC 통계 (시뮬레이션):\n");
    printf("  Minor GC 횟수: %d\n", rand() % 100 + 50);
    printf("  Major GC 횟수: %d\n", rand() % 10 + 5);
    printf("  평균 GC 시간: %.2f ms\n", (rand() % 50 + 10) / 10.0);
    printf("  GC로 해제된 메모리: %.2f MB\n", (rand() % 1000 + 500) / 10.0);

    // GC 효율성 분석
    long total_allocated = atomic_load(&stats.total_allocated);
    long total_freed = atomic_load(&stats.total_freed);

    if (total_allocated > 0) {
        double gc_efficiency = (double)total_freed / total_allocated;
        printf("  GC 효율성: %.1f%%\n", gc_efficiency * 100);

        if (gc_efficiency < 0.8) {
            printf("  ⚠️  GC 효율성이 낮습니다. 객체 생존 시간을 검토하세요.\n");
        }
    }
}

// 실시간 모니터링 스레드
void* memory_monitor(void *arg) {
    printf("메모리 모니터링 시작\n");

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

    printf("메모리 모니터링 종료\n");
    return NULL;
}

// 실시간 대시보드
void display_memory_dashboard() {
    while (monitoring_enabled) {
        system("clear");

        printf("========================================\n");
        printf("실시간 메모리 모니터링 대시보드\n");
        printf("========================================\n");

        long current = atomic_load(&stats.current_usage);
        long peak = atomic_load(&stats.peak_usage);
        int allocs = atomic_load(&stats.allocation_count);
        int frees = atomic_load(&stats.free_count);

        printf("📊 현재 상태:\n");
        printf("  현재 사용량: %.2f MB\n", current / (1024.0 * 1024.0));
        printf("  피크 사용량: %.2f MB\n", peak / (1024.0 * 1024.0));
        printf("  할당 횟수: %d\n", allocs);
        printf("  해제 횟수: %d\n", frees);
        printf("  미해제 객체: %d\n", allocs - frees);

        if (stats.leak_rate_per_second != 0) {
            printf("  누수율: %.2f bytes/sec\n", stats.leak_rate_per_second);

            if (stats.leak_rate_per_second > 1024) {
                printf("  ⚠️  높은 누수율 감지!\n");
            }
        }

        printf("\n📈 추세:\n");
        if (stats.leak_trend == 1) {
            printf("  메모리 사용량: 증가 추세 ⬆️\n");
        } else if (stats.leak_trend == -1) {
            printf("  메모리 사용량: 감소 추세 ⬇️\n");
        } else {
            printf("  메모리 사용량: 안정적 ➡️\n");
        }

        // 간단한 그래프 (최근 20개 데이터 포인트)
        printf("\n📊 사용량 그래프 (최근 20초):\n");
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
                printf(" %.1fMB\n", stats.usage_history[idx] / (1024.0 * 1024.0));
            }
        }

        printf("\n[Ctrl+C로 종료]\n");
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

    fprintf(fp, "{\n");
    fprintf(fp, "  \"timestamp\": %ld,\n", time(NULL));
    fprintf(fp, "  \"statistics\": {\n");
    fprintf(fp, "    \"total_allocated\": %ld,\n", atomic_load(&stats.total_allocated));
    fprintf(fp, "    \"total_freed\": %ld,\n", atomic_load(&stats.total_freed));
    fprintf(fp, "    \"current_usage\": %ld,\n", atomic_load(&stats.current_usage));
    fprintf(fp, "    \"peak_usage\": %ld,\n", atomic_load(&stats.peak_usage));
    fprintf(fp, "    \"allocation_count\": %d,\n", atomic_load(&stats.allocation_count));
    fprintf(fp, "    \"free_count\": %d,\n", atomic_load(&stats.free_count));
    fprintf(fp, "    \"leak_count\": %d,\n", atomic_load(&stats.leak_count));
    fprintf(fp, "    \"leak_rate_per_second\": %.2f,\n", stats.leak_rate_per_second);
    fprintf(fp, "    \"growth_rate\": %.4f,\n", stats.growth_rate);
    fprintf(fp, "    \"leak_trend\": %d\n", stats.leak_trend);
    fprintf(fp, "  },\n");

    fprintf(fp, "  \"recommendations\": [\n");

    if (stats.leak_rate_per_second > 1024) {
        fprintf(fp, "    \"높은 누수율이 감지되었습니다. 할당 패턴을 검토하세요.\",\n");
    }

    if (stats.growth_rate > 0.1) {
        fprintf(fp, "    \"메모리 사용량이 지속적으로 증가하고 있습니다.\",\n");
    }

    long current = atomic_load(&stats.current_usage);
    long peak = atomic_load(&stats.peak_usage);
    if (current > peak * 0.9) {
        fprintf(fp, "    \"메모리 사용량이 피크에 근접했습니다.\",\n");
    }

    fprintf(fp, "    \"정기적인 메모리 프로파일링을 권장합니다.\"\n");
    fprintf(fp, "  ]\n");
    fprintf(fp, "}\n");

    fclose(fp);
    printf("메모리 누수 리포트 생성: memory_leak_report.json\n");
}

// 시그널 핸들러
void signal_handler(int sig) {
    printf("\n모니터링 중단 신호 수신...\n");
    monitoring_enabled = 0;
}

// 사용법 출력
void print_usage(const char *program_name) {
    printf("메모리 누수 탐지기\n");
    printf("사용법: %s [옵션]\n", program_name);
    printf("옵션:\n");
    printf("  -m             실시간 모니터링 모드\n");
    printf("  -d             대시보드 모드\n");
    printf("  -a             전체 분석 실행\n");
    printf("  -t SECONDS     테스트 시간 (기본값: 60초)\n");
    printf("  --help         이 도움말 출력\n");
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

    printf("메모리 누수 탐지기 시작\n");

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
            printf("백그라운드 모니터링 중... (%d초)\n", test_duration);
            sleep(test_duration);
        }

        monitoring_enabled = 0;
        pthread_join(monitor_thread, NULL);
    }

    // 테스트 할당 및 누수 시뮬레이션
    printf("\n메모리 할당 테스트 시작...\n");

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

    printf("테스트 완료\n");

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
```

## 핵심 기능

### 1. 해시 테이블 기반 할당 추적

- 모든 malloc/free 호출을 실시간으로 기록
- 포인터 기반 해시 테이블로 빠른 검색 제공
- 스택 트레이스 자동 수집으로 누수 발생 위치 추적

### 2. 다차원 통계 분석

- 시간별, 크기별, 패턴별 메모리 사용량 분석
- 누수율과 증가 추세 자동 계산
- 힙 파편화 수준 모니터링

### 3. 실시간 대시보드

- 시각적 그래프로 메모리 사용량 표시
- 즉각적인 누수 감지 및 경고
- 멀티스레드 안전 구현

## 핵심 요점

### 1. 포괄적 추적 시스템

C 기반의 저수준 메모리 추적으로 모든 할당/해제를 정밀하게 모니터링

### 2. 실시간 분석 엔진

다중 스레드 환경에서 안전하게 동작하는 실시간 누수 감지

### 3. 자동 리포트 생성

JSON 형식의 상세 분석 리포트와 개선 권장사항 제공

---

**이전**: [메모리 누수 탐지 개요](chapter-09-advanced-memory-management/05-memory-leak-detection.md)
**다음**: [JavaScript/Node.js 프로파일링](chapter-09-advanced-memory-management/09-37-nodejs-profiling.md)에서 고수준 언어의 메모리 프로파일링을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-8시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-09-memory-gc)

- [Chapter 9-1: 메모리 할당자의 내부 구현 개요](../chapter-08-memory-allocator-gc/09-10-memory-allocator.md)
- [Chapter 9-1A: malloc 내부 동작의 진실](../chapter-08-memory-allocator-gc/09-01-malloc-fundamentals.md)
- [Chapter 9-1B: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](../chapter-08-memory-allocator-gc/09-11-allocator-comparison.md)
- [Chapter 9-1C: 커스텀 메모리 할당자 구현](../chapter-08-memory-allocator-gc/09-12-custom-allocators.md)
- [Chapter 9-1D: 실전 메모리 최적화 사례](./09-30-production-optimization.md)

### 🏷️ 관련 키워드

`memory-leak-detection`, `system-profiling`, `c-programming`, `real-time-monitoring`, `hash-table`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
