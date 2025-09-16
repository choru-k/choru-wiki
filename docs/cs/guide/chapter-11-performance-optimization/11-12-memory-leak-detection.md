---
tags:
  - debugging
  - deep-study
  - hands-on
  - intermediate
  - memory-leak
  - memory-tracking
  - performance-monitoring
  - valgrind
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "6-10시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 11.3c 메모리 누수 탐지 및 방지

## 메모리 누수의 현실

메모리 누수는 시스템의 조용한 살인자다. 처음에는 작은 누수로 시작하지만, 시간이 지날수록 시스템 전체를 마비시킬 수 있다. 특히 장기간 실행되는 서버 애플리케이션에서는 치명적이다.

## 1. 메모리 사용량 추적 시스템

### 기본 메모리 추적 구현

```c
// 메모리 추적 시스템
typedef struct MemoryTracker {
    size_t total_allocated;
    size_t peak_usage;
    size_t current_usage;
    int allocation_count;
    int free_count;
} MemoryTracker;

static MemoryTracker g_memory_tracker = {0};

void* tracked_malloc(size_t size) {
    void* ptr = malloc(size + sizeof(size_t));
    if (!ptr) return NULL;
    
    // 크기 정보를 포인터 앞에 저장
    *(size_t*)ptr = size;
    
    // 통계 업데이트
    g_memory_tracker.total_allocated += size;
    g_memory_tracker.current_usage += size;
    g_memory_tracker.allocation_count++;
    
    if (g_memory_tracker.current_usage > g_memory_tracker.peak_usage) {
        g_memory_tracker.peak_usage = g_memory_tracker.current_usage;
    }
    
    return (char*)ptr + sizeof(size_t);
}

void tracked_free(void* ptr) {
    if (!ptr) return;
    
    // 원래 포인터로 되돌리기
    char* original_ptr = (char*)ptr - sizeof(size_t);
    size_t size = *(size_t*)original_ptr;
    
    // 통계 업데이트
    g_memory_tracker.current_usage -= size;
    g_memory_tracker.free_count++;
    
    free(original_ptr);
}

void print_memory_stats() {
    printf("=== 메모리 사용 통계 ===\n");
    printf("총 할당량: %zu bytes\n", g_memory_tracker.total_allocated);
    printf("최대 사용량: %zu bytes\n", g_memory_tracker.peak_usage);
    printf("현재 사용량: %zu bytes\n", g_memory_tracker.current_usage);
    printf("할당 횟수: %d\n", g_memory_tracker.allocation_count);
    printf("해제 횟수: %d\n", g_memory_tracker.free_count);
    printf("누수 가능성: %d 블록\n", 
           g_memory_tracker.allocation_count - g_memory_tracker.free_count);
}
```

### 사용 예시

```c
// 사용 예시
void test_memory_tracking() {
    char* buffer1 = tracked_malloc(1000);
    int* buffer2 = tracked_malloc(500 * sizeof(int));
    char* buffer3 = tracked_malloc(2000);
    
    print_memory_stats();
    
    tracked_free(buffer1);
    tracked_free(buffer2);
    // buffer3는 의도적으로 해제하지 않음 (누수 시뮬레이션)
    
    printf("\n해제 후:\n");
    print_memory_stats();
}
```

## 2. 상세 메모리 추적 시스템

### 할당 위치 추적

```c
#include <execinfo.h>  // backtrace 함수용
#include <string.h>

typedef struct AllocationInfo {
    void* ptr;
    size_t size;
    const char* file;
    int line;
    const char* function;
    void* backtrace[10];
    int backtrace_size;
    struct AllocationInfo* next;
} AllocationInfo;

static AllocationInfo* allocation_list = NULL;
static int total_allocations = 0;

#define DEBUG_MALLOC(size) debug_malloc(size, __FILE__, __LINE__, __FUNCTION__)
#define DEBUG_FREE(ptr) debug_free(ptr, __FILE__, __LINE__, __FUNCTION__)

void* debug_malloc(size_t size, const char* file, int line, const char* function) {
    void* ptr = malloc(size);
    if (!ptr) return NULL;
    
    AllocationInfo* info = malloc(sizeof(AllocationInfo));
    info->ptr = ptr;
    info->size = size;
    info->file = file;
    info->line = line;
    info->function = function;
    
    // 백트레이스 캡처
    info->backtrace_size = backtrace(info->backtrace, 10);
    
    // 리스트에 추가
    info->next = allocation_list;
    allocation_list = info;
    total_allocations++;
    
    return ptr;
}

void debug_free(void* ptr, const char* file, int line, const char* function) {
    if (!ptr) return;
    
    // 할당 리스트에서 찾기
    AllocationInfo** current = &allocation_list;
    while (*current) {
        if ((*current)->ptr == ptr) {
            AllocationInfo* to_remove = *current;
            *current = (*current)->next;
            free(to_remove);
            total_allocations--;
            break;
        }
        current = &(*current)->next;
    }
    
    free(ptr);
}

void print_leaks() {
    printf("=== 메모리 누수 리포트 ===\n");
    printf("남은 할당: %d개\n", total_allocations);
    
    AllocationInfo* current = allocation_list;
    while (current) {
        printf("\n누수 발견: %zu bytes\n", current->size);
        printf("위치: %s:%d (%s)\n", current->file, current->line, current->function);
        
        // 백트레이스 출력
        char** strings = backtrace_symbols(current->backtrace, current->backtrace_size);
        if (strings) {
            printf("호출 스택:\n");
            for (int i = 0; i < current->backtrace_size; i++) {
                printf("  %s\n", strings[i]);
            }
            free(strings);
        }
        
        current = current->next;
    }
}
```

## 3. Valgrind를 이용한 메모리 분석

### Valgrind 스크립트

```bash
#!/bin/bash
# memory_analysis.sh - Valgrind 메모리 분석 스크립트

# 메모리 누수 검사
echo "=== 메모리 누수 검사 ==="
valgrind --tool=memcheck \
         --leak-check=full \
         --show-leak-kinds=all \
         --track-origins=yes \
         --verbose \
         ./your_program

# 캐시 성능 분석
echo -e "\n=== 캐시 성능 분석 ==="
valgrind --tool=cachegrind ./your_program

# 캐시그라인드 결과 분석
echo -e "\n=== 캐시 통계 ==="
cg_annotate cachegrind.out.*

# 힙 사용량 프로파일링
echo -e "\n=== 힙 사용량 프로파일링 ==="
valgrind --tool=massif ./your_program

# 힙 사용량 그래프 생성
ms_print massif.out.* > heap_usage.txt
echo "힙 사용량 리포트: heap_usage.txt"

# 메모리 오류 요약
echo -e "\n=== 메모리 오류 요약 ==="
echo "1. Invalid reads/writes: 잘못된 메모리 접근"
echo "2. Use after free: 해제된 메모리 사용"  
echo "3. Double free: 중복 해제"
echo "4. Memory leaks: 메모리 누수"
echo "5. Uninitialized values: 초기화되지 않은 값 사용"
```

### AddressSanitizer 활용

```bash
# AddressSanitizer로 컴파일
gcc -fsanitize=address -fno-omit-frame-pointer -O1 -g program.c -o program_asan

# 실행 시 옵션 설정
export ASAN_OPTIONS=abort_on_error=1:print_stats=1:check_initialization_order=1

# 실행
./program_asan
```

## 4. 스마트 포인터 구현 (C에서)

### 참조 카운팅 구현

```c
// 참조 카운팅 스마트 포인터
typedef struct RefCounted {
    void* data;
    size_t ref_count;
    void (*destructor)(void*);
} RefCounted;

RefCounted* ref_create(void* data, void (*destructor)(void*)) {
    RefCounted* ref = malloc(sizeof(RefCounted));
    ref->data = data;
    ref->ref_count = 1;
    ref->destructor = destructor;
    return ref;
}

RefCounted* ref_retain(RefCounted* ref) {
    if (ref) {
        ref->ref_count++;
    }
    return ref;
}

void ref_release(RefCounted* ref) {
    if (!ref) return;
    
    ref->ref_count--;
    if (ref->ref_count == 0) {
        if (ref->destructor && ref->data) {
            ref->destructor(ref->data);
        }
        free(ref);
    }
}

void* ref_get(RefCounted* ref) {
    return ref ? ref->data : NULL;
}
```

### 스마트 포인터 사용 예시

```c
// 사용 예시
void custom_destructor(void* data) {
    printf("리소스 해제: %p\n", data);
    free(data);
}

void test_smart_pointer() {
    // 스마트 포인터 생성
    char* data = malloc(1000);
    RefCounted* smart_ptr = ref_create(data, custom_destructor);
    
    // 다른 곳에서 참조
    RefCounted* another_ref = ref_retain(smart_ptr);
    
    // 첫 번째 참조 해제
    ref_release(smart_ptr);
    printf("첫 번째 참조 해제됨, 아직 데이터는 살아있음\n");
    
    // 마지막 참조 해제 시 자동으로 소멸자 호출
    ref_release(another_ref);
    printf("모든 참조가 해제되어 데이터가 자동 삭제됨\n");
}
```

## 5. 메모리 보호 기법

### 가드 페이지를 이용한 버퍼 오버플로 탐지

```c
#include <sys/mman.h>
#include <unistd.h>

void* protected_malloc(size_t size) {
    long page_size = sysconf(_SC_PAGESIZE);
    size_t total_size = ((size + page_size - 1) / page_size + 1) * page_size;
    
    // 메모리 매핑
    void* ptr = mmap(NULL, total_size, PROT_READ | PROT_WRITE, 
                     MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    
    if (ptr == MAP_FAILED) {
        return NULL;
    }
    
    // 마지막 페이지를 보호 페이지로 설정
    char* guard_page = (char*)ptr + total_size - page_size;
    if (mprotect(guard_page, page_size, PROT_NONE) != 0) {
        munmap(ptr, total_size);
        return NULL;
    }
    
    // 보호 페이지 바로 앞에 데이터 배치
    return guard_page - size;
}

void protected_free(void* ptr, size_t size) {
    if (!ptr) return;
    
    long page_size = sysconf(_SC_PAGESIZE);
    size_t total_size = ((size + page_size - 1) / page_size + 1) * page_size;
    
    // 원래 매핑 주소 계산
    char* original = (char*)ptr + size;
    original = (char*)(((uintptr_t)original + page_size - 1) / page_size * page_size);
    original -= total_size;
    
    munmap(original, total_size);
}
```

## 6. 메모리 패턴 분석

### 할당 패턴 분석

```c
#include <time.h>

typedef struct AllocationPattern {
    size_t size;
    time_t timestamp;
    int frequency;
} AllocationPattern;

#define MAX_PATTERNS 100
static AllocationPattern patterns[MAX_PATTERNS];
static int pattern_count = 0;

void record_allocation_pattern(size_t size) {
    time_t now = time(NULL);
    
    // 기존 패턴 찾기
    for (int i = 0; i < pattern_count; i++) {
        if (patterns[i].size == size) {
            patterns[i].frequency++;
            patterns[i].timestamp = now;
            return;
        }
    }
    
    // 새 패턴 추가
    if (pattern_count < MAX_PATTERNS) {
        patterns[pattern_count].size = size;
        patterns[pattern_count].timestamp = now;
        patterns[pattern_count].frequency = 1;
        pattern_count++;
    }
}

void analyze_allocation_patterns() {
    printf("=== 할당 패턴 분석 ===\n");
    
    // 빈도별 정렬
    for (int i = 0; i < pattern_count - 1; i++) {
        for (int j = i + 1; j < pattern_count; j++) {
            if (patterns[i].frequency < patterns[j].frequency) {
                AllocationPattern temp = patterns[i];
                patterns[i] = patterns[j];
                patterns[j] = temp;
            }
        }
    }
    
    printf("빈번한 할당 크기:\n");
    for (int i = 0; i < pattern_count && i < 10; i++) {
        printf("%zu bytes: %d회 할당\n", patterns[i].size, patterns[i].frequency);
    }
}
```

## 7. 실시간 메모리 모니터링

### 메모리 사용량 실시간 모니터링

```c
#include <pthread.h>
#include <signal.h>

typedef struct MemoryMonitor {
    pthread_t thread;
    volatile int running;
    int check_interval_seconds;
    size_t warning_threshold;
    size_t critical_threshold;
} MemoryMonitor;

void* memory_monitor_thread(void* arg) {
    MemoryMonitor* monitor = (MemoryMonitor*)arg;
    
    while (monitor->running) {
        size_t current_usage = g_memory_tracker.current_usage;
        
        if (current_usage > monitor->critical_threshold) {
            printf("🚨 CRITICAL: 메모리 사용량이 임계치를 초과했습니다: %zu bytes\n", 
                   current_usage);
            
            // 긴급 조치: 가비지 컬렉션, 캐시 비우기 등
            printf("긴급 메모리 정리 실행...\n");
            
        } else if (current_usage > monitor->warning_threshold) {
            printf("⚠️ WARNING: 높은 메모리 사용량: %zu bytes\n", current_usage);
        }
        
        sleep(monitor->check_interval_seconds);
    }
    
    return NULL;
}

MemoryMonitor* start_memory_monitor(int interval, size_t warning, size_t critical) {
    MemoryMonitor* monitor = malloc(sizeof(MemoryMonitor));
    monitor->check_interval_seconds = interval;
    monitor->warning_threshold = warning;
    monitor->critical_threshold = critical;
    monitor->running = 1;
    
    pthread_create(&monitor->thread, NULL, memory_monitor_thread, monitor);
    
    return monitor;
}

void stop_memory_monitor(MemoryMonitor* monitor) {
    monitor->running = 0;
    pthread_join(monitor->thread, NULL);
    free(monitor);
}
```

## 핵심 요점

### 1. 메모리 누수를 방지하라

**자동화된 도구**를 사용하라. Valgrind, AddressSanitizer, 커스텀 추적 시스템 등.

### 2. 실시간 모니터링을 구축하라

메모리 사용량을 지속적으로 모니터링하여 문제를 조기에 발견하라.

### 3. 스마트 포인터를 활용하라

참조 카운팅이나 RAII 패턴으로 자동 메모리 관리를 구현하라.

### 4. 할당 패턴을 분석하라

빈번한 할당 크기를 파악하여 메모리 풀 설계에 활용하라.

---

**다음**: [11.3d 고성능 메모리 관리 라이브러리](11-20-advanced-memory-libs.md)에서 jemalloc, 메모리 매핑 등 고급 메모리 관리 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 6-10시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-11-performance-optimization)

- [Chapter 11-1: 성능 분석 방법론](./11-30-performance-methodology.md)
- [11.2 CPU 성능 최적화](./11-31-cpu-optimization.md)
- [11.3 메모리 성능 최적화](./11-32-memory-optimization.md)
- [11.3a 메모리 계층구조와 캐시 최적화](./11-10-memory-hierarchy-cache.md)
- [11.3b 메모리 할당 최적화](./11-11-memory-allocation.md)

### 🏷️ 관련 키워드

`memory-leak`, `debugging`, `valgrind`, `memory-tracking`, `performance-monitoring`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
