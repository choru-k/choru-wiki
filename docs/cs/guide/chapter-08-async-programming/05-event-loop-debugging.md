---
tags:
  - Event Loop
  - Asynchronous Programming
  - Performance Debugging
  - Callback Hell
---

# 이벤트 루프 디버깅: "비동기가 멈춰있어요"

## 상황: 응답하지 않는 이벤트 루프

"안녕하세요, Node.js로 개발한 API 서버가 간헐적으로 응답하지 않는 문제가 있습니다. CPU 사용률은 높지 않은데 요청이 처리되지 않아요. 이벤트 루프가 블록되는 것 같은데 어떻게 원인을 찾을 수 있을까요? 비동기 코드에서 어떤 부분이 문제인지 모르겠어요."

이런 이벤트 루프 블로킹 문제는 비동기 프로그래밍에서 가장 흔하면서도 찾기 어려운 문제입니다. 체계적인 접근이 필요합니다.

## 이벤트 루프 분석 체계

```mermaid
graph TD
    A[이벤트 루프] --> B[Call Stack]
    A --> C[Callback Queue]
    A --> D[Microtask Queue]
    A --> E[Timer Queue]
    
    B --> F{Stack Empty?}
    F -->|Yes| G[Process Queues]
    F -->|No| H[Execute Current]
    
    G --> I[Microtasks First]
    I --> J[Callbacks]
    J --> K[Timers]
    K --> L[I/O Events]
    
    subgraph "블로킹 원인"
        M[동기 코드 실행]
        N[무거운 연산]
        O[무한 루프]
        P[블로킹 I/O]
        Q[메모리 부족]
    end
    
    subgraph "진단 도구"
        R[Event Loop Lag]
        S[CPU Profiling]
        T[Memory Profiling]
        U[Async Hooks]
        V[Performance Timing]
    end
    
    subgraph "최적화 방법"
        W[Worker Threads]
        X[Process Splitting]
        Y[Async Scheduling]
        Z[Memory Optimization]
    end
```text

## 1. 이벤트 루프 모니터링 도구

포괄적인 이벤트 루프 상태 분석을 위한 C 기반 도구입니다.

```c
// event_loop_monitor.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <sys/time.h>
#include <signal.h>
#include <pthread.h>
#include <errno.h>
#include <sys/resource.h>
#include <sys/syscall.h>
#include <linux/perf_event.h>
#include <sys/ioctl.h>
#include <fcntl.h>
#include <stdatomic.h>

#define MAX_SAMPLES 10000
#define SAMPLING_INTERVAL_US 1000
#define ALERT_THRESHOLD_MS 100

typedef struct {
    struct timeval timestamp;
    double event_loop_lag_ms;
    double cpu_usage;
    double memory_usage_mb;
    int active_handles;
    int pending_callbacks;
    int gc_count;
    double gc_time_ms;
} sample_t;

typedef struct {
    atomic_int running;
    atomic_int sample_count;
    sample_t samples[MAX_SAMPLES];
    pthread_mutex_t mutex;
    
    // 통계
    double max_lag_ms;
    double avg_lag_ms;
    int lag_spikes;
    int blocking_events;
    
    // 설정
    double alert_threshold_ms;
    int enable_detailed_logging;
    char log_file[256];
} event_loop_monitor_t;

static event_loop_monitor_t monitor = {0};

// 고해상도 타이머
static inline uint64_t get_timestamp_ns() {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000000000ULL + ts.tv_nsec;
}

// CPU 사용률 측정
double get_cpu_usage() {
    static long last_total = 0, last_idle = 0;
    FILE *fp = fopen("/proc/stat", "r");
    if (!fp) return -1;
    
    long user, nice, system, idle, iowait, irq, softirq, steal;
    if (fscanf(fp, "cpu %ld %ld %ld %ld %ld %ld %ld %ld",
               &user, &nice, &system, &idle, &iowait, &irq, &softirq, &steal) != 8) {
        fclose(fp);
        return -1;
    }
    fclose(fp);
    
    long total = user + nice + system + idle + iowait + irq + softirq + steal;
    long total_diff = total - last_total;
    long idle_diff = idle - last_idle;
    
    if (total_diff == 0) return 0;
    
    double cpu_usage = 100.0 * (1.0 - (double)idle_diff / total_diff);
    
    last_total = total;
    last_idle = idle;
    
    return cpu_usage;
}

// 메모리 사용량 측정
double get_memory_usage() {
    FILE *fp = fopen("/proc/self/status", "r");
    if (!fp) return -1;
    
    char line[256];
    double vmrss_kb = 0;
    
    while (fgets(line, sizeof(line), fp)) {
        if (sscanf(line, "VmRSS: %lf kB", &vmrss_kb) == 1) {
            break;
        }
    }
    fclose(fp);
    
    return vmrss_kb / 1024.0; // MB로 변환
}

// 이벤트 루프 지연시간 시뮬레이션 측정
double measure_event_loop_lag() {
    static uint64_t last_measurement = 0;
    uint64_t now = get_timestamp_ns();
    
    if (last_measurement == 0) {
        last_measurement = now;
        return 0;
    }
    
    // 예상 간격과 실제 간격의 차이
    uint64_t expected_interval = SAMPLING_INTERVAL_US * 1000; // 나노초
    uint64_t actual_interval = now - last_measurement;
    
    last_measurement = now;
    
    if (actual_interval > expected_interval) {
        return (double)(actual_interval - expected_interval) / 1000000.0; // 밀리초
    }
    
    return 0;
}

// 프로세스 핸들 수 확인
int count_active_handles() {
    char path[256];
    snprintf(path, sizeof(path), "/proc/%d/fd", getpid());
    
    // /proc/pid/fd 디렉토리의 파일 수 계산
    FILE *fp = popen("ls /proc/self/fd | wc -l", "r");
    if (!fp) return -1;
    
    int count = 0;
    if (fscanf(fp, "%d", &count) != 1) {
        pclose(fp);
        return -1;
    }
    pclose(fp);
    
    return count;
}

// GC 정보 시뮬레이션 (실제로는 V8/Node.js API 필요)
void get_gc_stats(int *gc_count, double *gc_time_ms) {
    static int last_gc_count = 0;
    static double last_gc_time = 0;
    
    // 실제 구현에서는 v8::Isolate::GetHeapStatistics() 등을 사용
    *gc_count = last_gc_count + (rand() % 3); // 시뮬레이션
    *gc_time_ms = last_gc_time + (rand() % 10) * 0.1; // 시뮬레이션
    
    last_gc_count = *gc_count;
    last_gc_time = *gc_time_ms;
}

// 샘플 수집
void collect_sample() {
    if (atomic_load(&monitor.sample_count) >= MAX_SAMPLES) {
        return; // 버퍼 가득 참
    }
    
    int index = atomic_fetch_add(&monitor.sample_count, 1);
    if (index >= MAX_SAMPLES) {
        atomic_store(&monitor.sample_count, MAX_SAMPLES);
        return;
    }
    
    sample_t *sample = &monitor.samples[index];
    
    gettimeofday(&sample->timestamp, NULL);
    sample->event_loop_lag_ms = measure_event_loop_lag();
    sample->cpu_usage = get_cpu_usage();
    sample->memory_usage_mb = get_memory_usage();
    sample->active_handles = count_active_handles();
    sample->pending_callbacks = rand() % 100; // 시뮬레이션
    
    get_gc_stats(&sample->gc_count, &sample->gc_time_ms);
    
    // 통계 업데이트
    if (sample->event_loop_lag_ms > monitor.max_lag_ms) {
        monitor.max_lag_ms = sample->event_loop_lag_ms;
    }
    
    if (sample->event_loop_lag_ms > monitor.alert_threshold_ms) {
        monitor.lag_spikes++;
        
        if (monitor.enable_detailed_logging) {
            printf("[ALERT] Event loop lag: %.2f ms at %ld.%06ld, ",
                   sample->event_loop_lag_ms,
                   sample->timestamp.tv_sec,
                   sample->timestamp.tv_usec);
        }
    }
    
    // 블로킹 이벤트 감지 (연속된 높은 지연시간)
    if (index > 0 && sample->event_loop_lag_ms > 50 && 
        monitor.samples[index-1].event_loop_lag_ms > 50) {
        monitor.blocking_events++;
    }
}

// 스택 트레이스 수집 (시뮬레이션)
void collect_stack_trace(char *buffer, size_t size) {
    // 실제 구현에서는 execinfo.h의 backtrace() 사용
    snprintf(buffer, size, 
        "Stack trace (simulated):, "
        "  at processCallback (/app/server.js:123:45), "
        "  at /app/middleware.js:67:89, "
        "  at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5), "
        "  at next (/app/node_modules/express/lib/router/route.js:137:13), "
    );
}

// 실시간 모니터링 스레드
void* monitoring_thread(void *arg) {
    printf("이벤트 루프 모니터링 시작, ");
    
    while (atomic_load(&monitor.running)) {
        collect_sample();
        usleep(SAMPLING_INTERVAL_US);
    }
    
    printf("이벤트 루프 모니터링 종료, ");
    return NULL;
}

// 실시간 대시보드
void* dashboard_thread(void *arg) {
    while (atomic_load(&monitor.running)) {
        system("clear");
        
        printf("========================================, ");
        printf("이벤트 루프 실시간 모니터링, ");
        printf("========================================, ");
        printf("샘플링 주기: %d μs, ", SAMPLING_INTERVAL_US);
        printf("알림 임계값: %.1f ms, ", monitor.alert_threshold_ms);
        printf("수집된 샘플: %d, ", atomic_load(&monitor.sample_count));
        printf("----------------------------------------, ");
        
        // 최근 샘플 표시
        int count = atomic_load(&monitor.sample_count);
        if (count > 0) {
            int recent_idx = count - 1;
            sample_t *recent = &monitor.samples[recent_idx];
            
            printf("최근 측정값:, ");
            printf("  이벤트 루프 지연: %.2f ms, ", recent->event_loop_lag_ms);
            printf("  CPU 사용률: %.1f%%, ", recent->cpu_usage);
            printf("  메모리 사용량: %.1f MB, ", recent->memory_usage_mb);
            printf("  활성 핸들: %d, ", recent->active_handles);
            printf("  대기 중인 콜백: %d, ", recent->pending_callbacks);
            printf("  GC 횟수: %d, ", recent->gc_count);
            printf("  GC 시간: %.2f ms, ", recent->gc_time_ms);
            
            printf(", ");
            
            // 지연시간 히스토그램 (간단 버전)
            printf("지연시간 분포 (최근 100샘플):, ");
            int start_idx = count > 100 ? count - 100 : 0;
            int ranges[5] = {0}; // <10ms, 10-50ms, 50-100ms, 100-500ms, >500ms
            
            for (int i = start_idx; i < count; i++) {
                double lag = monitor.samples[i].event_loop_lag_ms;
                if (lag < 10) ranges[0]++;
                else if (lag < 50) ranges[1]++;
                else if (lag < 100) ranges[2]++;
                else if (lag < 500) ranges[3]++;
                else ranges[4]++;
            }
            
            printf("  < 10ms:    [");
            for (int i = 0; i < ranges[0] / 5; i++) printf("█");
            printf("] %d, ", ranges[0]);
            
            printf("  10-50ms:   [");
            for (int i = 0; i < ranges[1] / 5; i++) printf("█");
            printf("] %d, ", ranges[1]);
            
            printf("  50-100ms:  [");
            for (int i = 0; i < ranges[2] / 5; i++) printf("█");
            printf("] %d, ", ranges[2]);
            
            printf("  100-500ms: [");
            for (int i = 0; i < ranges[3] / 5; i++) printf("█");
            printf("] %d, ", ranges[3]);
            
            printf("  > 500ms:   [");
            for (int i = 0; i < ranges[4] / 5; i++) printf("█");
            printf("] %d, ", ranges[4]);
        }
        
        printf(", ");
        printf("통계:, ");
        printf("  최대 지연시간: %.2f ms, ", monitor.max_lag_ms);
        printf("  지연 스파이크: %d, ", monitor.lag_spikes);
        printf("  블로킹 이벤트: %d, ", monitor.blocking_events);
        
        if (monitor.lag_spikes > 10) {
            printf(", ⚠️  경고: 이벤트 루프 지연이 빈번합니다!, ");
        }
        
        if (monitor.blocking_events > 5) {
            printf("⚠️  경고: 블로킹 이벤트가 감지되었습니다!, ");
        }
        
        printf(", [Ctrl+C로 종료], ");
        
        sleep(1);
    }
    
    return NULL;
}

// 분석 결과 저장
void save_analysis_report() {
    FILE *fp = fopen("event_loop_analysis.json", "w");
    if (!fp) {
        perror("리포트 파일 생성 실패");
        return;
    }
    
    int count = atomic_load(&monitor.sample_count);
    double total_lag = 0;
    double min_lag = INFINITY, max_lag = 0;
    int lag_over_100ms = 0;
    
    // 통계 계산
    for (int i = 0; i < count; i++) {
        double lag = monitor.samples[i].event_loop_lag_ms;
        total_lag += lag;
        
        if (lag < min_lag) min_lag = lag;
        if (lag > max_lag) max_lag = lag;
        if (lag > 100) lag_over_100ms++;
    }
    
    double avg_lag = count > 0 ? total_lag / count : 0;
    
    fprintf(fp, "{, ");
    fprintf(fp, "  \"analysis_timestamp\": \"%ld\",, ", time(NULL));
    fprintf(fp, "  \"monitoring_duration_seconds\": %d,, ", count * SAMPLING_INTERVAL_US / 1000000);
    fprintf(fp, "  \"sample_count\": %d,, ", count);
    fprintf(fp, "  \"sampling_interval_us\": %d,, ", SAMPLING_INTERVAL_US);
    fprintf(fp, "  \"statistics\": {, ");
    fprintf(fp, "    \"min_lag_ms\": %.2f,, ", min_lag == INFINITY ? 0 : min_lag);
    fprintf(fp, "    \"max_lag_ms\": %.2f,, ", max_lag);
    fprintf(fp, "    \"avg_lag_ms\": %.2f,, ", avg_lag);
    fprintf(fp, "    \"lag_spikes\": %d,, ", monitor.lag_spikes);
    fprintf(fp, "    \"blocking_events\": %d,, ", monitor.blocking_events);
    fprintf(fp, "    \"lag_over_100ms_count\": %d, ", lag_over_100ms);
    fprintf(fp, "  },, ");
    fprintf(fp, "  \"recommendations\": [, ");
    
    if (avg_lag > 50) {
        fprintf(fp, "    \"평균 이벤트 루프 지연이 높습니다. 동기 코드를 최적화하세요.\",, ");
    }
    
    if (monitor.lag_spikes > count * 0.1) {
        fprintf(fp, "    \"빈번한 지연 스파이크가 감지됩니다. CPU 집약적 작업을 Worker Thread로 이동하세요.\",, ");
    }
    
    if (monitor.blocking_events > 0) {
        fprintf(fp, "    \"블로킹 이벤트가 감지됩니다. 비동기 패턴을 검토하세요.\",, ");
    }
    
    fprintf(fp, "    \"정기적인 모니터링을 통해 성능 회귀를 방지하세요.\", ");
    fprintf(fp, "  ], ");
    fprintf(fp, "}, ");
    
    fclose(fp);
    printf("분석 리포트 저장: event_loop_analysis.json, ");
}

// 시그널 핸들러
void signal_handler(int sig) {
    printf(", 모니터링 중단 신호 수신..., ");
    atomic_store(&monitor.running, 0);
}

// 사용법 출력
void print_usage(const char *program_name) {
    printf("이벤트 루프 모니터링 도구, ");
    printf("사용법: %s [옵션], ", program_name);
    printf("옵션:, ");
    printf("  -t THRESHOLD   알림 임계값 (ms, 기본값: %.1f), ", ALERT_THRESHOLD_MS);
    printf("  -v             상세 로깅 활성화, ");
    printf("  -d DURATION    모니터링 시간 (초, 0=무제한), ");
    printf("  -o FILE        로그 파일 경로, ");
    printf("  --help         이 도움말 출력, ");
}

int main(int argc, char *argv[]) {
    // 기본값 설정
    monitor.alert_threshold_ms = ALERT_THRESHOLD_MS;
    monitor.enable_detailed_logging = 0;
    atomic_store(&monitor.running, 1);
    
    int duration_sec = 0; // 0 = 무제한
    
    // 명령행 인자 처리
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-t") == 0 && i + 1 < argc) {
            monitor.alert_threshold_ms = atof(argv[++i]);
        } else if (strcmp(argv[i], "-v") == 0) {
            monitor.enable_detailed_logging = 1;
        } else if (strcmp(argv[i], "-d") == 0 && i + 1 < argc) {
            duration_sec = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-o") == 0 && i + 1 < argc) {
            strncpy(monitor.log_file, argv[++i], sizeof(monitor.log_file) - 1);
        } else if (strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return 0;
        }
    }
    
    // 뮤텍스 초기화
    if (pthread_mutex_init(&monitor.mutex, NULL) != 0) {
        perror("뮤텍스 초기화 실패");
        return 1;
    }
    
    // 시그널 핸들러 설정
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    
    printf("이벤트 루프 모니터링 시작, ");
    printf("알림 임계값: %.1f ms, ", monitor.alert_threshold_ms);
    if (duration_sec > 0) {
        printf("모니터링 시간: %d초, ", duration_sec);
    } else {
        printf("모니터링 시간: 무제한 (Ctrl+C로 중단), ");
    }
    
    // 모니터링 스레드 시작
    pthread_t monitor_thread, dash_thread;
    
    if (pthread_create(&monitor_thread, NULL, monitoring_thread, NULL) != 0) {
        perror("모니터링 스레드 생성 실패");
        return 1;
    }
    
    if (pthread_create(&dash_thread, NULL, dashboard_thread, NULL) != 0) {
        perror("대시보드 스레드 생성 실패");
        return 1;
    }
    
    // 지정된 시간만큼 실행
    if (duration_sec > 0) {
        sleep(duration_sec);
        atomic_store(&monitor.running, 0);
    }
    
    // 스레드 종료 대기
    pthread_join(monitor_thread, NULL);
    pthread_join(dash_thread, NULL);
    
    // 분석 결과 저장
    save_analysis_report();
    
    // 정리
    pthread_mutex_destroy(&monitor.mutex);
    
    printf("모니터링 완료, ");
    return 0;
}
```text

## 2. Node.js 이벤트 루프 분석 스크립트

```javascript
#!/usr/bin/env node
// event_loop_analyzer.js

const fs = require('fs');
const os = require('os');
const util = require('util');
const async_hooks = require('async_hooks');
const perf_hooks = require('perf_hooks');

class EventLoopAnalyzer {
    constructor(options = {}) {
        this.options = {
            lagThreshold: options.lagThreshold || 100, // ms
            sampleInterval: options.sampleInterval || 1000, // ms
            enableAsyncHooks: options.enableAsyncHooks || false,
            enableGCMonitoring: options.enableGCMonitoring || false,
            outputFile: options.outputFile || 'event_loop_analysis.json',
            ...options
        };
        
        this.samples = [];
        this.asyncResources = new Map();
        this.isRunning = false;
        this.startTime = Date.now();
        
        // 통계
        this.stats = {
            maxLag: 0,
            totalLag: 0,
            lagSpikes: 0,
            samples: 0,
            blockingEvents: 0,
            gcEvents: 0,
            gcTime: 0
        };
        
        this.setupAsyncHooks();
        this.setupGCMonitoring();
        this.setupPerformanceObserver();
    }
    
    // Async Hooks 설정
    setupAsyncHooks() {
        if (!this.options.enableAsyncHooks) return;
        
        const hook = async_hooks.createHook({
            init: (asyncId, type, triggerAsyncId) => {
                this.asyncResources.set(asyncId, {
                    type,
                    triggerAsyncId,
                    created: Date.now(),
                    stack: this.captureStack()
                });
            },
            
            before: (asyncId) => {
                const resource = this.asyncResources.get(asyncId);
                if (resource) {
                    resource.beforeTime = Date.now();
                }
            },
            
            after: (asyncId) => {
                const resource = this.asyncResources.get(asyncId);
                if (resource && resource.beforeTime) {
                    resource.duration = Date.now() - resource.beforeTime;
                    
                    // 긴 실행 시간 감지
                    if (resource.duration > this.options.lagThreshold) {
                        this.logSlowAsync(asyncId, resource);
                    }
                }
            },
            
            destroy: (asyncId) => {
                this.asyncResources.delete(asyncId);
            }
        });
        
        hook.enable();
        console.log('Async Hooks 활성화됨');
    }
    
    // GC 모니터링 설정
    setupGCMonitoring() {
        if (!this.options.enableGCMonitoring) return;
        
        // V8 GC 이벤트 감지 (Node.js 16+)
        if (perf_hooks.monitorEventLoopDelay) {
            this.eventLoopDelay = perf_hooks.monitorEventLoopDelay();
            this.eventLoopDelay.enable();
        }
        
        // GC 이벤트 리스너 (실험적)
        if (process.versions.node.split('.')[0] >= 16) {
            process.on('warning', (warning) => {
                if (warning.name === 'MemoryUsageWarning') {
                    this.stats.gcEvents++;
                    console.warn('GC 경고:', warning.message);
                }
            });
        }
    }
    
    // Performance Observer 설정
    setupPerformanceObserver() {
        const obs = new perf_hooks.PerformanceObserver((list) => {
            const entries = list.getEntries();
            
            entries.forEach(entry => {
                if (entry.entryType === 'gc') {
                    this.stats.gcEvents++;
                    this.stats.gcTime += entry.duration;
                    
                    if (entry.duration > 50) { // 50ms 이상 GC
                        console.warn(`긴 GC 감지: ${entry.kind} ${entry.duration.toFixed(2)}ms`);
                    }
                }
                
                if (entry.entryType === 'function' && entry.duration > this.options.lagThreshold) {
                    this.logSlowFunction(entry);
                }
            });
        });
        
        // GC 및 함수 성능 관찰
        obs.observe({ entryTypes: ['gc', 'function'] });
    }
    
    // 스택 트레이스 캡처
    captureStack() {
        const obj = {};
        Error.captureStackTrace(obj, this.captureStack);
        return obj.stack;
    }
    
    // 느린 비동기 작업 로깅
    logSlowAsync(asyncId, resource) {
        console.warn(`[SLOW ASYNC] ID: ${asyncId}, Type: ${resource.type}, Duration: ${resource.duration}ms`);
        
        if (this.options.enableAsyncHooks && resource.stack) {
            console.warn('Stack trace:');
            console.warn(resource.stack);
        }
        
        this.stats.blockingEvents++;
    }
    
    // 느린 함수 로깅
    logSlowFunction(entry) {
        console.warn(`[SLOW FUNCTION] ${entry.name}: ${entry.duration.toFixed(2)}ms`);
    }
    
    // 이벤트 루프 지연시간 측정
    measureEventLoopLag() {
        return new Promise(resolve => {
            const start = process.hrtime.bigint();
            
            setImmediate(() => {
                const end = process.hrtime.bigint();
                const lag = Number(end - start) / 1000000; // 나노초를 밀리초로 변환
                resolve(lag);
            });
        });
    }
    
    // 시스템 리소스 정보 수집
    getSystemInfo() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            memory: {
                rss: memUsage.rss / 1024 / 1024, // MB
                heapUsed: memUsage.heapUsed / 1024 / 1024,
                heapTotal: memUsage.heapTotal / 1024 / 1024,
                external: memUsage.external / 1024 / 1024
            },
            cpu: {
                user: cpuUsage.user / 1000, // 마이크로초를 밀리초로
                system: cpuUsage.system / 1000
            },
            loadAverage: os.loadavg(),
            uptime: process.uptime()
        };
    }
    
    // 활성 핸들 및 요청 수집
    getActiveHandles() {
        const handles = process._getActiveHandles();
        const requests = process._getActiveRequests();
        
        const handleTypes = {};
        handles.forEach(handle => {
            const type = handle.constructor.name;
            handleTypes[type] = (handleTypes[type] || 0) + 1;
        });
        
        return {
            handleCount: handles.length,
            requestCount: requests.length,
            handleTypes
        };
    }
    
    // 샘플 수집
    async collectSample() {
        const lag = await this.measureEventLoopLag();
        const systemInfo = this.getSystemInfo();
        const activeInfo = this.getActiveHandles();
        
        const sample = {
            timestamp: Date.now(),
            eventLoopLag: lag,
            system: systemInfo,
            active: activeInfo,
            asyncResourceCount: this.asyncResources.size
        };
        
        // Event Loop Delay API 사용 (가능한 경우)
        if (this.eventLoopDelay) {
            sample.eventLoopDelay = {
                min: this.eventLoopDelay.min / 1000000, // 나노초를 밀리초로
                max: this.eventLoopDelay.max / 1000000,
                mean: this.eventLoopDelay.mean / 1000000,
                stddev: this.eventLoopDelay.stddev / 1000000
            };
        }
        
        this.samples.push(sample);
        
        // 통계 업데이트
        this.stats.samples++;
        this.stats.totalLag += lag;
        
        if (lag > this.stats.maxLag) {
            this.stats.maxLag = lag;
        }
        
        if (lag > this.options.lagThreshold) {
            this.stats.lagSpikes++;
            console.warn(`[LAG SPIKE] Event loop lag: ${lag.toFixed(2)}ms`);
            
            // 스택 트레이스 수집
            this.collectDiagnosticInfo();
        }
        
        return sample;
    }
    
    // 진단 정보 수집
    collectDiagnosticInfo() {
        const v8 = require('v8');
        
        const diagnostics = {
            timestamp: Date.now(),
            heapStatistics: v8.getHeapStatistics(),
            heapSpaceStatistics: v8.getHeapSpaceStatistics(),
            stack: this.captureStack()
        };
        
        if (this.options.enableAsyncHooks) {
            // 활성 비동기 리소스 요약
            const resourceSummary = {};
            this.asyncResources.forEach((resource, id) => {
                const type = resource.type;
                resourceSummary[type] = (resourceSummary[type] || 0) + 1;
            });
            
            diagnostics.asyncResources = resourceSummary;
        }
        
        console.log('진단 정보 수집:', JSON.stringify(diagnostics, null, 2));
    }
    
    // 실시간 모니터링 시작
    startMonitoring() {
        if (this.isRunning) {
            console.warn('모니터링이 이미 실행 중입니다.');
            return;
        }
        
        this.isRunning = true;
        console.log(`이벤트 루프 분석 시작 (임계값: ${this.options.lagThreshold}ms)`);
        
        const monitoringLoop = async () => {
            if (!this.isRunning) return;
            
            try {
                const sample = await this.collectSample();
                this.displayRealTimeInfo(sample);
            } catch (error) {
                console.error('샘플 수집 오류:', error);
            }
            
            setTimeout(monitoringLoop, this.options.sampleInterval);
        };
        
        monitoringLoop();
    }
    
    // 실시간 정보 표시
    displayRealTimeInfo(sample) {
        // 콘솔 지우기
        console.clear();
        
        console.log('=====================================');
        console.log('이벤트 루프 실시간 모니터링');
        console.log('=====================================');
        console.log(`실행 시간: ${Math.floor((Date.now() - this.startTime) / 1000)}초`);
        console.log(`샘플 수: ${this.stats.samples}`);
        console.log('-------------------------------------');
        
        console.log('📊 현재 상태:');
        console.log(`  이벤트 루프 지연: ${sample.eventLoopLag.toFixed(2)}ms`);
        console.log(`  메모리 사용량: ${sample.system.memory.heapUsed.toFixed(1)}MB / ${sample.system.memory.heapTotal.toFixed(1)}MB`);
        console.log(`  활성 핸들: ${sample.active.handleCount}`);
        console.log(`  활성 요청: ${sample.active.requestCount}`);
        console.log(`  비동기 리소스: ${sample.asyncResourceCount}`);
        
        if (sample.eventLoopDelay) {
            console.log(`  평균 지연: ${sample.eventLoopDelay.mean.toFixed(2)}ms`);
            console.log(`  최대 지연: ${sample.eventLoopDelay.max.toFixed(2)}ms`);
        }
        
        console.log(', 📈 통계:');
        console.log(`  최대 지연시간: ${this.stats.maxLag.toFixed(2)}ms`);
        console.log(`  평균 지연시간: ${(this.stats.totalLag / this.stats.samples).toFixed(2)}ms`);
        console.log(`  지연 스파이크: ${this.stats.lagSpikes}`);
        console.log(`  블로킹 이벤트: ${this.stats.blockingEvents}`);
        console.log(`  GC 이벤트: ${this.stats.gcEvents}`);
        console.log(`  총 GC 시간: ${this.stats.gcTime.toFixed(2)}ms`);
        
        // 경고 표시
        if (sample.eventLoopLag > this.options.lagThreshold) {
            console.log(', ⚠️  경고: 이벤트 루프 지연이 임계값을 초과했습니다!');
        }
        
        if (sample.system.memory.heapUsed > 500) { // 500MB 초과
            console.log(', ⚠️  경고: 높은 메모리 사용량이 감지되었습니다!');
        }
        
        // 핸들 타입별 분포
        if (Object.keys(sample.active.handleTypes).length > 0) {
            console.log(', 🔧 활성 핸들 타입:');
            Object.entries(sample.active.handleTypes).forEach(([type, count]) => {
                console.log(`  ${type}: ${count}`);
            });
        }
        
        console.log(', [Ctrl+C로 종료]');
    }
    
    // 모니터링 중지
    stopMonitoring() {
        this.isRunning = false;
        console.log(', 모니터링 중지됨');
        
        if (this.eventLoopDelay) {
            this.eventLoopDelay.disable();
        }
    }
    
    // 분석 결과 생성
    generateReport() {
        const report = {
            metadata: {
                startTime: this.startTime,
                endTime: Date.now(),
                duration: Date.now() - this.startTime,
                sampleCount: this.samples.length,
                sampleInterval: this.options.sampleInterval,
                lagThreshold: this.options.lagThreshold
            },
            
            statistics: {
                ...this.stats,
                avgLag: this.stats.samples > 0 ? this.stats.totalLag / this.stats.samples : 0,
                lagSpikePercentage: this.stats.samples > 0 ? (this.stats.lagSpikes / this.stats.samples) * 100 : 0
            },
            
            samples: this.samples,
            
            recommendations: this.generateRecommendations()
        };
        
        return report;
    }
    
    // 권장사항 생성
    generateRecommendations() {
        const recommendations = [];
        const avgLag = this.stats.samples > 0 ? this.stats.totalLag / this.stats.samples : 0;
        
        if (avgLag > 50) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: '평균 이벤트 루프 지연이 높습니다. CPU 집약적 작업을 Worker Thread로 이동하세요.',
                details: `평균 지연시간: ${avgLag.toFixed(2)}ms`
            });
        }
        
        if (this.stats.lagSpikes > this.stats.samples * 0.1) {
            recommendations.push({
                type: 'stability',
                priority: 'high',
                message: '빈번한 지연 스파이크가 감지됩니다. 블로킹 코드를 찾아 최적화하세요.',
                details: `지연 스파이크 비율: ${((this.stats.lagSpikes / this.stats.samples) * 100).toFixed(1)}%`
            });
        }
        
        if (this.stats.gcTime > 1000) {
            recommendations.push({
                type: 'memory',
                priority: 'medium',
                message: 'GC 시간이 많습니다. 메모리 사용 패턴을 최적화하세요.',
                details: `총 GC 시간: ${this.stats.gcTime.toFixed(2)}ms`
            });
        }
        
        if (this.stats.blockingEvents > 0) {
            recommendations.push({
                type: 'async',
                priority: 'high',
                message: '블로킹 비동기 작업이 감지되었습니다. 비동기 패턴을 검토하세요.',
                details: `블로킹 이벤트 수: ${this.stats.blockingEvents}`
            });
        }
        
        // 일반적인 권장사항
        recommendations.push({
            type: 'monitoring',
            priority: 'low',
            message: '정기적인 성능 모니터링을 통해 회귀를 방지하세요.',
            details: '프로덕션 환경에서 지속적인 모니터링 설정 권장'
        });
        
        return recommendations;
    }
    
    // 결과 저장
    async saveReport() {
        const report = this.generateReport();
        
        try {
            await fs.promises.writeFile(
                this.options.outputFile,
                JSON.stringify(report, null, 2),
                'utf8'
            );
            
            console.log(`, 분석 보고서 저장됨: ${this.options.outputFile}`);
            
            // 요약 출력
            console.log(', === 분석 요약 ===');
            console.log(`모니터링 시간: ${Math.floor(report.metadata.duration / 1000)}초`);
            console.log(`평균 지연시간: ${report.statistics.avgLag.toFixed(2)}ms`);
            console.log(`최대 지연시간: ${report.statistics.maxLag.toFixed(2)}ms`);
            console.log(`지연 스파이크: ${report.statistics.lagSpikes}회`);
            console.log(`권장사항: ${report.recommendations.length}개`);
            
            if (report.recommendations.length > 0) {
                console.log(', === 주요 권장사항 ===');
                report.recommendations
                    .filter(r => r.priority === 'high')
                    .forEach((rec, index) => {
                        console.log(`${index + 1}. ${rec.message}`);
                        console.log(`   세부사항: ${rec.details}`);
                    });
            }
            
        } catch (error) {
            console.error('보고서 저장 실패:', error);
        }
    }
}

// CLI 실행
if (require.main === module) {
    const options = {};
    
    // 명령행 인자 처리
    process.argv.slice(2).forEach((arg, index, arr) => {
        if (arg === '--threshold' && arr[index + 1]) {
            options.lagThreshold = parseFloat(arr[index + 1]);
        } else if (arg === '--interval' && arr[index + 1]) {
            options.sampleInterval = parseInt(arr[index + 1]);
        } else if (arg === '--async-hooks') {
            options.enableAsyncHooks = true;
        } else if (arg === '--gc-monitoring') {
            options.enableGCMonitoring = true;
        } else if (arg === '--output' && arr[index + 1]) {
            options.outputFile = arr[index + 1];
        } else if (arg === '--help') {
            console.log('이벤트 루프 분석기');
            console.log('사용법: node event_loop_analyzer.js [옵션]');
            console.log('옵션:');
            console.log('  --threshold VALUE    알림 임계값 (ms, 기본값: 100)');
            console.log('  --interval VALUE     샘플링 간격 (ms, 기본값: 1000)');
            console.log('  --async-hooks        Async Hooks 활성화');
            console.log('  --gc-monitoring      GC 모니터링 활성화');
            console.log('  --output FILE        출력 파일명');
            console.log('  --help               도움말 출력');
            process.exit(0);
        }
    });
    
    const analyzer = new EventLoopAnalyzer(options);
    
    // 종료 처리
    process.on('SIGINT', async () => {
        analyzer.stopMonitoring();
        await analyzer.saveReport();
        process.exit(0);
    });
    
    analyzer.startMonitoring();
}

module.exports = EventLoopAnalyzer;
```text

이 문서는 이벤트 루프 블로킹 문제를 체계적으로 진단하고 해결하는 방법을 제공합니다. C 기반 모니터링 도구와 Node.js 전용 분석 스크립트를 통해 실시간으로 이벤트 루프 상태를 추적하고 성능 병목점을 찾을 수 있습니다.
