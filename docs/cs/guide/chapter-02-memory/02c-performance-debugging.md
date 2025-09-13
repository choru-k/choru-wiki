---
tags:
  - Stack
  - Heap
  - Performance
  - Debugging
  - Memory Bugs
  - Computer Science
---

# Chapter 2-2c: 성능 비교와 메모리 버그 - 숫자로 보는 차이와 버그 사냥

## 스택 vs 힙: 성능의 극명한 차이

스택과 힙의 성능 차이는 단순한 추측이 아닙니다. 실제 측정을 통해 그 차이를 확인해봅시다.

## 1. 속도 측정: 숫자로 보는 차이

실제로 얼마나 차이가 날까요? 직접 측정해보겠습니다:

```c
// performance_showdown.c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>

#define ITERATIONS 10000000
#define ALLOC_SIZE 256

// 스택 할당 성능
double benchmark_stack() {
    clock_t start = clock();
    volatile int sum = 0;  // 최적화 방지

    for (int i = 0; i < ITERATIONS; i++) {
        char buffer[ALLOC_SIZE];
        memset(buffer, i & 0xFF, ALLOC_SIZE);
        sum += buffer[0];
    }

    clock_t end = clock();
    return ((double)(end - start)) / CLOCKS_PER_SEC;
}

// 힙 할당 성능
double benchmark_heap() {
    clock_t start = clock();
    volatile int sum = 0;

    for (int i = 0; i < ITERATIONS; i++) {
        char* buffer = malloc(ALLOC_SIZE);
        memset(buffer, i & 0xFF, ALLOC_SIZE);
        sum += buffer[0];
        free(buffer);
    }

    clock_t end = clock();
    return ((double)(end - start)) / CLOCKS_PER_SEC;
}

// 메모리 풀 성능 (최적화된 힙)
double benchmark_pool() {
    // 미리 큰 블록 할당
    char* pool = malloc(ALLOC_SIZE * ITERATIONS);

    clock_t start = clock();
    volatile int sum = 0;

    for (int i = 0; i < ITERATIONS; i++) {
        char* buffer = pool + (i * ALLOC_SIZE);
        memset(buffer, i & 0xFF, ALLOC_SIZE);
        sum += buffer[0];
    }

    clock_t end = clock();
    free(pool);

    return ((double)(end - start)) / CLOCKS_PER_SEC;
}

int main() {
    printf("=== 메모리 할당 성능 대결 ===, ");
    printf("테스트: %d회 반복, %d bytes 할당, , ", ITERATIONS, ALLOC_SIZE);

    double stack_time = benchmark_stack();
    double heap_time = benchmark_heap();
    double pool_time = benchmark_pool();

    printf("스택 할당: %.3f초, ", stack_time);
    printf("힙 할당:   %.3f초 (%.1fx 느림), ", heap_time, heap_time/stack_time);
    printf("메모리 풀: %.3f초 (%.1fx 느림), ", pool_time, pool_time/stack_time);

    printf(", 할당당 소요 시간:, ");
    printf("스택: %.1f ns, ", stack_time * 1e9 / ITERATIONS);
    printf("힙:   %.1f ns, ", heap_time * 1e9 / ITERATIONS);
    printf("풀:   %.1f ns, ", pool_time * 1e9 / ITERATIONS);

    return 0;
}
```

전형적인 결과:

```text
=== 메모리 할당 성능 대결 ===
테스트: 10000000회 반복, 256 bytes 할당

스택 할당: 0.124초
힙 할당:   3.867초 (31.2x 느림)
메모리 풀: 0.156초 (1.3x 느림)

할당당 소요 시간:
스택: 12.4 ns
힙:   386.7 ns
풀:   15.6 ns
```

## 2. 왜 이런 차이가 날까?

스택과 힙의 속도 차이를 해부해보면:

```text
스택 할당 (1-2 CPU 사이클):
1. sub rsp, 256    ; 스택 포인터 감소

힙 할당 (100-1000 CPU 사이클):
1. malloc 함수 호출 오버헤드
2. Free List 탐색
3. 적합한 블록 찾기
4. 블록 분할 (필요시)
5. 메타데이터 업데이트
6. 스레드 동기화 (멀티스레드)
7. 시스템 콜 (brk/mmap) 가능성
```

캐시 효과도 중요합니다:

```c
// cache_effects.c
void demonstrate_cache_effects() {
    // 스택: 연속적인 접근 패턴
    int stack_array[1000];
    for (int i = 0; i < 1000; i++) {
        stack_array[i] = i;  // 캐시 라인에 연속 적재
    }

    // 힙: 분산된 접근 패턴
    int* heap_ptrs[1000];
    for (int i = 0; i < 1000; i++) {
        heap_ptrs[i] = malloc(sizeof(int));
        *heap_ptrs[i] = i;  // 캐시 미스 가능성 높음
    }
}
```

## 3. 메모리 버그: 프로그래머의 악몽

### 3.1 스택 버그들

스택에서 발생하는 대표적인 버그들을 살펴봅시다:

```c
// stack_bugs.c
#include <stdio.h>
#include <string.h>

// 버그 1: 스택 오버플로우
int factorial(int n) {
    // 재귀 깊이 체크 없음!
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

// 버그 2: 스택 버퍼 오버플로우
void buffer_overflow_demo() {
    char password[16] = "secret";
    char input[16];
    int authorized = 0;

    printf("Password: ");
    gets(input);  // 절대 사용 금지! 길이 체크 없음

    if (strcmp(password, input) == 0) {
        authorized = 1;
    }

    // 공격자가 16자 이상 입력하면?
    // input 오버플로우 → authorized 덮어쓰기 가능!
    if (authorized) {
        printf("Access granted!, ");
    }
}

// 버그 3: 댕글링 포인터 (스택 버전)
int* get_local_pointer() {
    int local_var = 42;
    return &local_var;  // 경고! 지역 변수 주소 반환
}

void use_dangling_pointer() {
    int* ptr = get_local_pointer();
    // ptr은 이미 해제된 스택 메모리를 가리킴
    printf("Value: %d, ", *ptr);  // 정의되지 않은 동작!

    // 다른 함수 호출로 스택 덮어쓰기
    int other_function();
    other_function();

    printf("Value now: %d, ", *ptr);  // 완전히 다른 값!
}
```

### 3.2 힙 버그들: 더 교묘하고 위험한

힙 버그는 발견하기 어렵고 치명적입니다:

```c
// heap_bugs.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// 버그 1: 메모리 누수 (가장 흔함)
void memory_leak_patterns() {
    // 패턴 1: 단순 누수
    char* buffer = malloc(1024);
    // ... 사용 ...
    return;  // free() 잊음!

    // 패턴 2: 조건부 누수
    char* data = malloc(1024);
    if (error_condition) {
        return;  // 에러 경로에서 free() 누락
    }
    free(data);

    // 패턴 3: 포인터 덮어쓰기
    char* ptr = malloc(100);
    ptr = malloc(200);  // 첫 번째 할당 누수!
    free(ptr);

    // 패턴 4: 순환 참조 (수동 메모리 관리에서)
    typedef struct Node {
        struct Node* next;
        char data[100];
    } Node;

    Node* a = malloc(sizeof(Node));
    Node* b = malloc(sizeof(Node));
    a->next = b;
    b->next = a;  // 순환!
    // a나 b 하나만 free하면 나머지는 누수
}

// 버그 2: Use-After-Free (보안 취약점)
void use_after_free_demo() {
    char* buffer = malloc(100);
    strcpy(buffer, "Important Data");

    free(buffer);

    // ... 많은 코드 ...

    // 개발자가 이미 해제했다는 걸 잊음
    strcpy(buffer, "New Data");  // 충돌 또는 데이터 오염!

    // 더 위험한 시나리오
    char* other = malloc(100);  // 같은 메모리 재사용 가능
    // 이제 buffer와 other가 같은 메모리를 가리킬 수 있음!
}

// 버그 3: Double Free (치명적)
void double_free_demo() {
    char* ptr = malloc(100);

    free(ptr);

    // ... 복잡한 로직 ...

    if (some_condition) {
        free(ptr);  // 두 번째 free!
        // malloc 내부 구조 파괴 → 프로그램 충돌
    }
}

// 버그 4: 힙 버퍼 오버플로우
void heap_overflow_demo() {
    char* buf1 = malloc(16);
    char* buf2 = malloc(16);

    printf("buf1: %p, ", buf1);
    printf("buf2: %p, ", buf2);

    // buf1에 16바이트 이상 쓰기
    strcpy(buf1, "This is way too long for 16 bytes!");

    // buf2의 메타데이터나 내용 손상!
    printf("buf2 content: %s, ", buf2);  // 쓰레기값 또는 충돌
}
```

## 4. 디버깅 도구: 버그 사냥꾼의 무기

### 4.1 프로덕션 환경에서의 메모리 모니터링

```bash
# 실시간 메모리 사용량 모니터링
$ while true; do
    echo "$(date): $(cat /proc/meminfo | grep -E '(MemTotal|MemAvailable|MemFree)')"
    sleep 5
done

# 프로세스별 메모리 사용량 (RSS, VSZ)
$ ps aux --sort=-rss | head -10

# 메모리 누수 의심 프로세스 추적
$ watch -n 1 'ps -p [PID] -o pid,rss,vsz,comm'

# cgroup 메모리 제한 확인 (컨테이너 환경)
$ cat /sys/fs/cgroup/memory/memory.limit_in_bytes
$ cat /sys/fs/cgroup/memory/memory.usage_in_bytes
```

### 4.2 Valgrind로 메모리 누수 찾기

```c
// leak_example.c
#include <stdlib.h>

void leaky_function() {
    int* array = malloc(sizeof(int) * 100);
    array[0] = 42;
    // free(array);  // 의도적으로 주석 처리
}

int main() {
    for (int i = 0; i < 10; i++) {
        leaky_function();
    }
    return 0;
}
```

```bash
$ gcc -g leak_example.c -o leak_example
$ valgrind --leak-check=full --show-leak-kinds=all ./leak_example

==12345== HEAP SUMMARY:
==12345==     in use at exit: 4,000 bytes in 10 blocks
==12345==   total heap usage: 10 allocs, 0 frees, 4,000 bytes allocated
==12345==
==12345== 400 bytes in 1 blocks are definitely lost in loss record 1 of 1
==12345==    at 0x4C2FB0F: malloc (in /usr/lib/valgrind/...)
==12345==    by 0x400537: leaky_function (leak_example.c:4)
==12345==    by 0x400557: main (leak_example.c:10)
```

### 4.3 AddressSanitizer로 Use-After-Free 찾기

```bash
$ gcc -fsanitize=address -g use_after_free.c -o use_after_free
$ ./use_after_free

=================================================================
==67890==ERROR: AddressSanitizer: heap-use-after-free on address 0x60200000eff0
WRITE of size 1 at 0x60200000eff0 thread T0
    #0 0x7f8a12345678 in strcpy (/lib/x86_64-linux-gnu/libc.so.6+0x123456)
    #1 0x400abc in use_after_free_demo use_after_free.c:15
    #2 0x400def in main use_after_free.c:25

0x60200000eff0 is located 0 bytes inside of 100-byte region
freed by thread T0 here:
    #0 0x7f8a23456789 in free (/usr/lib/x86_64-linux-gnu/libasan.so.5+0x234567)
    #1 0x400a12 in use_after_free_demo use_after_free.c:12
```

## 5. 메모리 프로파일링 전략

### 5.1 시스템 레벨 모니터링

```c
// memory_monitor.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

void monitor_process_memory(pid_t pid) {
    char filename[256];
    char buffer[1024];
    
    // /proc/[pid]/status에서 메모리 정보 읽기
    snprintf(filename, sizeof(filename), "/proc/%d/status", pid);
    
    FILE* file = fopen(filename, "r");
    if (!file) return;
    
    printf("=== 프로세스 %d 메모리 정보 ===, ", pid);
    while (fgets(buffer, sizeof(buffer), file)) {
        if (strncmp(buffer, "VmPeak:", 7) == 0 ||
            strncmp(buffer, "VmSize:", 7) == 0 ||
            strncmp(buffer, "VmRSS:", 6) == 0 ||
            strncmp(buffer, "VmData:", 7) == 0 ||
            strncmp(buffer, "VmStk:", 6) == 0) {
            printf("%s", buffer);
        }
    }
    
    fclose(file);
}

void demonstrate_memory_growth() {
    printf("초기 상태, ");
    monitor_process_memory(getpid());
    
    // 10MB 할당
    void* large_alloc = malloc(10 * 1024 * 1024);
    printf(", 10MB 힙 할당 후, ");
    monitor_process_memory(getpid());
    
    // 스택 사용 증가 (재귀)
    void deep_recursion(int depth);
    deep_recursion(1000);
    
    free(large_alloc);
}
```

### 5.2 실시간 메모리 누수 감지

```c
// leak_detector.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// 간단한 메모리 추적기
typedef struct MemNode {
    void* ptr;
    size_t size;
    const char* file;
    int line;
    struct MemNode* next;
} MemNode;

static MemNode* allocations = NULL;
static size_t total_allocated = 0;

void* debug_malloc(size_t size, const char* file, int line) {
    void* ptr = malloc(size);
    if (ptr) {
        MemNode* node = malloc(sizeof(MemNode));
        node->ptr = ptr;
        node->size = size;
        node->file = file;
        node->line = line;
        node->next = allocations;
        allocations = node;
        total_allocated += size;
        
        printf("ALLOC: %p (%zu bytes) at %s:%d, Total: %zu, ", 
               ptr, size, file, line, total_allocated);
    }
    return ptr;
}

void debug_free(void* ptr, const char* file, int line) {
    MemNode** current = &allocations;
    while (*current) {
        if ((*current)->ptr == ptr) {
            MemNode* node = *current;
            *current = node->next;
            total_allocated -= node->size;
            
            printf("FREE: %p (%zu bytes) at %s:%d, Total: %zu, ",
                   ptr, node->size, file, line, total_allocated);
            
            free(node);
            break;
        }
        current = &(*current)->next;
    }
    free(ptr);
}

// 매크로로 편리하게 사용
#define MALLOC(size) debug_malloc(size, __FILE__, __LINE__)
#define FREE(ptr) debug_free(ptr, __FILE__, __LINE__)

void check_leaks() {
    if (allocations) {
        printf(", === 메모리 누수 발견! ===, ");
        MemNode* node = allocations;
        while (node) {
            printf("LEAK: %p (%zu bytes) allocated at %s:%d, ",
                   node->ptr, node->size, node->file, node->line);
            node = node->next;
        }
        printf("총 누수: %zu bytes, ", total_allocated);
    } else {
        printf("메모리 누수 없음!, ");
    }
}
```

## 핵심 요점

### 1. 성능 차이의 근본 원인

스택은 단순한 포인터 조작으로 30배 이상 빠른 할당이 가능합니다.

### 2. 버그 패턴 이해

스택은 오버플로우, 힙은 누수와 use-after-free가 주요 문제입니다.

### 3. 디버깅 도구 활용

Valgrind와 AddressSanitizer는 메모리 버그 탐지의 필수 도구입니다.

### 4. 프로파일링의 중요성

성능 문제는 추측이 아닌 실측을 통해 해결해야 합니다.

---

**이전**: [힙의 상세 동작](02b-heap-fundamentals.md)  
**다음**: [고급 메모리 관리 기법](02d-advanced-techniques.md)에서 메모리 풀과 Arena 할당자를 통한 성능 최적화를 학습합니다.
