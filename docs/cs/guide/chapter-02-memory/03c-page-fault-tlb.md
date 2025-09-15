---
tags:
  - Page Fault
  - TLB
  - Copy-on-Write
  - Memory Optimization
---

# Chapter 2-3C: 페이지 폴트와 TLB 최적화

## 1. 페이지 폴트: 메모리의 JIT(Just-In-Time)

### 1.1 페이지 폴트는 나쁜 것이 아니다

페이지 폴트는 "폴트"라는 이름과 달리 정상적인 메커니즘입니다:

```c
// page_fault_demo.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>

void measure_page_faults() {
    struct rusage usage_before, usage_after;

    printf("=== 페이지 폴트 측정 ===\n\n");

    // 측정 시작
    getrusage(RUSAGE_SELF, &usage_before);

    // 큰 메모리 할당 (아직 물리 메모리 할당 안 됨)
    size_t size = 100 * 1024 * 1024;  // 100MB
    char* buffer = malloc(size);
    printf("100MB malloc 완료\n");

    getrusage(RUSAGE_SELF, &usage_after);
    printf("malloc 후 페이지 폴트: %ld\n",
           usage_after.ru_minflt - usage_before.ru_minflt);

    // 첫 번째 접근 (페이지 폴트 발생)
    printf("\n첫 번째 쓰기 시작...\n");
    getrusage(RUSAGE_SELF, &usage_before);

    for (size_t i = 0; i < size; i += 4096) {  // 페이지 단위로
        buffer[i] = 'A';  // 각 페이지 첫 바이트에 쓰기
    }

    getrusage(RUSAGE_SELF, &usage_after);
    long faults = usage_after.ru_minflt - usage_before.ru_minflt;
    printf("첫 쓰기 페이지 폴트: %ld\n", faults);
    printf("= %.1f MB 실제 할당\n", faults * 4.0 / 1024);

    // 두 번째 접근 (페이지 폴트 없음)
    printf("\n두 번째 쓰기 시작...\n");
    getrusage(RUSAGE_SELF, &usage_before);

    for (size_t i = 0; i < size; i += 4096) {
        buffer[i] = 'B';  // 같은 위치에 다시 쓰기
    }

    getrusage(RUSAGE_SELF, &usage_after);
    printf("두 번째 쓰기 페이지 폴트: %ld (거의 없음!)\n",
           usage_after.ru_minflt - usage_before.ru_minflt);

    free(buffer);
}
```

이것이 **Demand Paging(요구 페이징)**입니다:

- malloc은 주소 공간만 예약
- 실제 접근 시 물리 메모리 할당
- 사용하지 않는 메모리는 할당하지 않음

### 1.2 페이지 폴트의 종류와 처리

```c
// page_fault_types.c
#include <stdio.h>
#include <signal.h>
#include <sys/mman.h>
#include <string.h>

void analyze_page_fault_types() {
    printf("=== 페이지 폴트 유형 분석 ===\n\n");

    printf("1. Minor Page Fault (소프트 폴트):\n");
    printf("   • 페이지가 물리 메모리에 있지만 페이지 테이블에 매핑되지 않음\n");
    printf("   • 예: fork() 후 Copy-on-Write 페이지\n");
    printf("   • 빠른 처리 (디스크 I/O 없음)\n\n");

    printf("2. Major Page Fault (하드 폴트):\n");
    printf("   • 페이지가 물리 메모리에 없음 (디스크에서 로드 필요)\n");
    printf("   • 예: 스왑된 페이지, 메모리 매핑된 파일\n");
    printf("   • 느린 처리 (디스크 I/O 필요)\n\n");

    printf("3. Segmentation Fault:\n");
    printf("   • 접근 권한 없는 주소 또는 매핑되지 않은 주소\n");
    printf("   • 프로세스 종료 또는 시그널 전달\n\n");

    // Minor Page Fault 예제
    printf("Minor Page Fault 실험:\n");
    size_t size = 10 * 1024 * 1024;  // 10MB
    char* buffer = mmap(NULL, size,
                       PROT_READ | PROT_WRITE,
                       MAP_PRIVATE | MAP_ANONYMOUS,
                       -1, 0);

    if (buffer != MAP_FAILED) {
        struct rusage usage_before, usage_after;
        getrusage(RUSAGE_SELF, &usage_before);

        // 첫 번째 터치 - Minor Page Fault
        memset(buffer, 0x42, size);

        getrusage(RUSAGE_SELF, &usage_after);
        printf("  Minor faults: %ld\n",
               usage_after.ru_minflt - usage_before.ru_minflt);

        munmap(buffer, size);
    }
}

int main() {
    analyze_page_fault_types();
    return 0;
}
```

## 2. Copy-on-Write: 공유의 마법

### 2.1 CoW의 동작 원리

fork()의 놀라운 최적화:

```c
// copy_on_write.c
#include <stdio.h>
#include <unistd.h>
#include <string.h>
#include <sys/wait.h>
#include <sys/resource.h>

void demonstrate_cow() {
    // 큰 배열 생성
    size_t size = 50 * 1024 * 1024;  // 50MB
    char* big_array = malloc(size);
    memset(big_array, 'P', size);  // Parent 데이터

    printf("=== Copy-on-Write 데모 ===\n");
    printf("부모: 50MB 배열 생성 완료\n");

    struct rusage usage;
    getrusage(RUSAGE_CHILDREN, &usage);
    long faults_before = usage.ru_minflt;

    pid_t pid = fork();

    if (pid == 0) {  // 자식
        printf("자식: fork 직후 - 메모리 공유 중\n");

        // 읽기만 하면 페이지 폴트 없음
        int sum = 0;
        for (size_t i = 0; i < size; i += 4096) {
            sum += big_array[i];
        }
        printf("자식: 읽기 완료 (sum=%d)\n", sum);

        // 쓰기 시작 - CoW 페이지 폴트!
        printf("자식: 쓰기 시작 - CoW 발동!\n");
        for (size_t i = 0; i < size/2; i += 4096) {
            big_array[i] = 'C';  // Child 데이터
        }
        printf("자식: 25MB 수정 완료\n");

        _exit(0);
    } else {  // 부모
        wait(NULL);

        getrusage(RUSAGE_CHILDREN, &usage);
        long cow_faults = usage.ru_minflt - faults_before;

        printf("부모: 자식의 CoW 페이지 폴트: %ld\n", cow_faults);
        printf("부모: = %.1f MB 복사됨\n", cow_faults * 4.0 / 1024);

        // 부모의 데이터는 변경 없음
        printf("부모: 내 데이터 확인 - 여전히 'P': %c\n", big_array[0]);
    }

    free(big_array);
}
```

CoW의 천재성:

- fork()가 순간적으로 완료
- 메모리 사용량 최소화
- 수정하는 부분만 복사

### 2.2 CoW 최적화 기법

```c
// cow_optimization.c
#include <stdio.h>
#include <sys/mman.h>
#include <unistd.h>

void cow_optimization_techniques() {
    printf("=== Copy-on-Write 최적화 기법 ===\n\n");

    printf("1. 읽기 전용 데이터 공유:\n");
    // 읽기 전용 매핑 - 영원히 공유됨
    void* shared_readonly = mmap(NULL, 4096,
                                PROT_READ,
                                MAP_PRIVATE | MAP_ANONYMOUS,
                                -1, 0);
    printf("   읽기 전용 매핑: %p (영구 공유)\n", shared_readonly);

    printf("\n2. madvise()로 CoW 힌트:\n");
    void* buffer = mmap(NULL, 1024*1024,
                       PROT_READ | PROT_WRITE,
                       MAP_PRIVATE | MAP_ANONYMOUS,
                       -1, 0);

    // CoW 최적화 힌트
    madvise(buffer, 1024*1024, MADV_SEQUENTIAL);
    printf("   MADV_SEQUENTIAL: 순차 접근 패턴 힌트\n");

    madvise(buffer, 1024*1024, MADV_WILLNEED);
    printf("   MADV_WILLNEED: 미리 페이지 할당\n");

    printf("\n3. CoW 회피 전략:\n");
    printf("   • exec() 즉시 호출하는 프로세스\n");
    printf("   • vfork() 사용 (위험하지만 빠름)\n");
    printf("   • 큰 데이터 구조체는 fork() 후 할당\n");

    printf("\n💡 CoW 성능 팁:\n");
    printf("   • fork() 후 즉시 exec() 호출\n");
    printf("   • 필요한 메모리만 터치\n");
    printf("   • 대용량 읽기 전용 데이터는 mmap() 사용\n");

    munmap(shared_readonly, 4096);
    munmap(buffer, 1024*1024);
}

int main() {
    cow_optimization_techniques();
    return 0;
}
```

## 3. 페이지 폴트 핸들러의 여정

### 3.1 페이지 폴트 처리 과정

페이지 폴트가 발생하면 무슨 일이 일어날까요?

```c
// page_fault_handler_simulation.c
#include <stdio.h>
#include <signal.h>
#include <ucontext.h>
#include <sys/mman.h>

// 커스텀 페이지 폴트 핸들러 (시뮬레이션)
void segfault_handler(int sig, siginfo_t *info, void *context) {
    printf("\n=== 페이지 폴트 핸들러 실행 ===\n");
    printf("1. 폴트 주소: %p\n", info->si_addr);

    // 폴트 타입 확인
    if (info->si_code == SEGV_MAPERR) {
        printf("2. 원인: 매핑되지 않은 주소\n");
        printf("3. 처리: 새 페이지 할당\n");

        // 실제로는 커널이 처리
        // 여기서는 시뮬레이션으로 mmap
        void* page = (void*)((uintptr_t)info->si_addr & ~0xFFF);
        mmap(page, 4096, PROT_READ | PROT_WRITE,
             MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED, -1, 0);

        printf("4. 페이지 할당 완료: %p\n", page);
        printf("5. 명령어 재실행\n");
        return;  // 재시도
    } else if (info->si_code == SEGV_ACCERR) {
        printf("2. 원인: 권한 없는 접근\n");
        printf("3. 처리: SIGSEGV 전달\n");
        _exit(1);
    }
}

int main() {
    // SIGSEGV 핸들러 등록
    struct sigaction sa;
    sa.sa_flags = SA_SIGINFO;
    sa.sa_sigaction = segfault_handler;
    sigaction(SIGSEGV, &sa, NULL);

    printf("페이지 폴트 시뮬레이션\n");

    // 의도적으로 매핑 안 된 주소 접근
    // (실제로는 위험! 교육 목적으로만)
    volatile char* unmapped = (char*)0x10000000;

    printf("매핑 안 된 주소 접근 시도: %p\n", unmapped);
    *unmapped = 'A';  // 페이지 폴트!

    printf("페이지 폴트 처리 후 계속 실행\n");
    printf("값 확인: %c\n", *unmapped);

    return 0;
}
```

### 3.2 커널의 페이지 폴트 처리 경로

```c
// kernel_page_fault_path.c
#include <stdio.h>
#include <stdint.h>

void explain_kernel_page_fault_handling() {
    printf("=== 커널의 페이지 폴트 처리 경로 ===\n\n");

    printf("1. 하드웨어 단계:\n");
    printf("   • MMU가 페이지 폴트 감지\n");
    printf("   • CR2 레지스터에 폴트 주소 저장\n");
    printf("   • 인터럽트 #14 (Page Fault) 발생\n");
    printf("   • 커널의 page_fault() 핸들러 호출\n\n");

    printf("2. 커널 단계 (do_page_fault):\n");
    printf("   • 폴트 주소와 오류 코드 분석\n");
    printf("   • VMA (Virtual Memory Area) 검색\n");
    printf("   • 권한 검사 수행\n");
    printf("   • 적절한 처리 함수 호출\n\n");

    printf("3. 처리 유형별 분기:\n");
    printf("   a) Anonymous page fault:\n");
    printf("      → do_anonymous_page()\n");
    printf("      → 새 페이지 할당 및 Zero-fill\n\n");

    printf("   b) File-backed page fault:\n");
    printf("      → do_fault()\n");
    printf("      → 파일에서 페이지 읽기\n\n");

    printf("   c) Copy-on-Write fault:\n");
    printf("      → do_wp_page()\n");
    printf("      → 페이지 복사 및 권한 업데이트\n\n");

    printf("   d) Swap page fault:\n");
    printf("      → do_swap_page()\n");
    printf("      → 스왑 디바이스에서 페이지 읽기\n\n");

    printf("4. 마무리 단계:\n");
    printf("   • 페이지 테이블 업데이트\n");
    printf("   • TLB 무효화 (필요시)\n");
    printf("   • 사용자 모드로 복귀\n");
    printf("   • 원래 명령어 재실행\n");
}

void show_page_fault_statistics() {
    printf("\n=== 페이지 폴트 통계 보기 ===\n");
    printf("시스템 전체 통계:\n");
    system("cat /proc/vmstat | grep -E '(pgfault|pgmajfault)'");

    printf("\n프로세스별 통계:\n");
    printf("  /proc/[pid]/stat의 필드 9, 11: minor/major faults\n");
    printf("  예: cat /proc/self/stat | cut -d' ' -f9,11\n");

    printf("\n실시간 모니터링:\n");
    printf("  sar -B 1    # 페이징 통계\n");
    printf("  vmstat 1    # 가상 메모리 통계\n");
    printf("  iostat 1    # 스왑 I/O 통계\n");
}

int main() {
    explain_kernel_page_fault_handling();
    show_page_fault_statistics();
    return 0;
}
```

## 4. TLB: 주소 변환의 터보 엔진

### 4.1 TLB가 없다면? 지옥의 성능

4단계 페이지 테이블에서 한 번의 메모리 접근:

1. PML4 테이블 읽기 (메모리 접근 #1)
2. PDPT 테이블 읽기 (메모리 접근 #2)
3. PD 테이블 읽기 (메모리 접근 #3)
4. PT 테이블 읽기 (메모리 접근 #4)
5. 실제 데이터 읽기 (메모리 접근 #5)

**5배 느려집니다!** 😱

### 4.2 TLB의 구조와 동작

```c
// tlb_simulation.c
#include <stdio.h>
#include <time.h>
#include <stdlib.h>

// 간단한 TLB 시뮬레이션
#define TLB_SIZE 64

typedef struct {
    uint64_t virtual_page;
    uint64_t physical_frame;
    int valid;
    int lru_counter;
} TLBEntry;

typedef struct {
    TLBEntry entries[TLB_SIZE];
    long hits;
    long misses;
} TLB;

// TLB 조회
int tlb_lookup(TLB* tlb, uint64_t virtual_page, uint64_t* physical_frame) {
    // TLB 검색 (병렬로 수행됨)
    for (int i = 0; i < TLB_SIZE; i++) {
        if (tlb->entries[i].valid &&
            tlb->entries[i].virtual_page == virtual_page) {
            *physical_frame = tlb->entries[i].physical_frame;
            tlb->entries[i].lru_counter = 0;  // 최근 사용
            tlb->hits++;
            return 1;  // Hit!
        }
    }

    tlb->misses++;
    return 0;  // Miss
}

// TLB 업데이트
void tlb_update(TLB* tlb, uint64_t virtual_page, uint64_t physical_frame) {
    // LRU 교체
    int lru_idx = 0;
    int max_counter = 0;

    for (int i = 0; i < TLB_SIZE; i++) {
        tlb->entries[i].lru_counter++;

        if (!tlb->entries[i].valid) {
            lru_idx = i;
            break;
        }

        if (tlb->entries[i].lru_counter > max_counter) {
            max_counter = tlb->entries[i].lru_counter;
            lru_idx = i;
        }
    }

    tlb->entries[lru_idx].virtual_page = virtual_page;
    tlb->entries[lru_idx].physical_frame = physical_frame;
    tlb->entries[lru_idx].valid = 1;
    tlb->entries[lru_idx].lru_counter = 0;
}

// 메모리 접근 패턴 테스트
void test_access_pattern(TLB* tlb, const char* pattern_name,
                         int* array, int size, int stride) {
    tlb->hits = 0;
    tlb->misses = 0;

    clock_t start = clock();

    for (int i = 0; i < size; i += stride) {
        uint64_t virtual_page = ((uint64_t)&array[i]) >> 12;
        uint64_t physical_frame;

        if (!tlb_lookup(tlb, virtual_page, &physical_frame)) {
            // TLB miss - 페이지 테이블 조회 (느림)
            physical_frame = virtual_page;  // 시뮬레이션
            tlb_update(tlb, virtual_page, physical_frame);
        }

        array[i] = i;  // 실제 접근
    }

    clock_t end = clock();
    double time = (double)(end - start) / CLOCKS_PER_SEC;

    printf("%s:\n", pattern_name);
    printf("  TLB Hits: %ld (%.1f%%)\n",
           tlb->hits, 100.0 * tlb->hits / (tlb->hits + tlb->misses));
    printf("  TLB Misses: %ld\n", tlb->misses);
    printf("  Time: %.3f seconds\n\n", time);
}

int main() {
    printf("=== TLB 성능 영향 ===\n\n");

    int size = 10000000;
    int* array = malloc(size * sizeof(int));
    TLB tlb = {0};

    // 순차 접근 (TLB 친화적)
    test_access_pattern(&tlb, "순차 접근 (stride=1)",
                        array, size, 1);

    // 랜덤 접근 (TLB 비친화적)
    test_access_pattern(&tlb, "랜덤 접근 (stride=1009)",
                        array, size, 1009);

    free(array);
    return 0;
}
```

### 4.3 TLB 최적화 기법

```c
// tlb_optimization.c
#include <stdio.h>
#include <time.h>
#include <string.h>

#define SIZE 1024

// TLB 비친화적: 열 우선 순회
void column_major(int matrix[SIZE][SIZE]) {
    for (int j = 0; j < SIZE; j++) {
        for (int i = 0; i < SIZE; i++) {
            matrix[i][j] = i * j;
            // 각 접근마다 다른 페이지 (SIZE*4 bytes 떨어짐)
            // TLB 미스 다발!
        }
    }
}

// TLB 친화적: 행 우선 순회
void row_major(int matrix[SIZE][SIZE]) {
    for (int i = 0; i < SIZE; i++) {
        for (int j = 0; j < SIZE; j++) {
            matrix[i][j] = i * j;
            // 연속 메모리 접근
            // 같은 페이지 내에서 작업
        }
    }
}

// 타일링 최적화
void tiled_access(int matrix[SIZE][SIZE]) {
    const int TILE = 64;  // 타일 크기

    for (int i0 = 0; i0 < SIZE; i0 += TILE) {
        for (int j0 = 0; j0 < SIZE; j0 += TILE) {
            // 타일 내에서 작업
            for (int i = i0; i < i0 + TILE && i < SIZE; i++) {
                for (int j = j0; j < j0 + TILE && j < SIZE; j++) {
                    matrix[i][j] = i * j;
                }
            }
        }
    }
}

void benchmark_access_patterns() {
    static int matrix[SIZE][SIZE];
    clock_t start, end;

    printf("=== 메모리 접근 패턴 성능 ===\n");
    printf("Matrix: %dx%d (%.1f MB)\n\n",
           SIZE, SIZE, sizeof(matrix) / (1024.0 * 1024));

    // 열 우선 (나쁨)
    start = clock();
    column_major(matrix);
    end = clock();
    printf("열 우선 순회: %.3f seconds\n",
           (double)(end - start) / CLOCKS_PER_SEC);

    // 행 우선 (좋음)
    start = clock();
    row_major(matrix);
    end = clock();
    printf("행 우선 순회: %.3f seconds (더 빠름!)\n",
           (double)(end - start) / CLOCKS_PER_SEC);

    // 타일링 (최적)
    start = clock();
    tiled_access(matrix);
    end = clock();
    printf("타일링 순회: %.3f seconds (최적!)\n",
           (double)(end - start) / CLOCKS_PER_SEC);
}
```

### 4.4 실제 TLB 성능 측정

```c
// tlb_performance_analysis.c
#include <stdio.h>
#include <sys/time.h>
#include <unistd.h>

void measure_tlb_performance() {
    printf("=== TLB 성능 측정 ===\n\n");

    // TLB 크기보다 큰 메모리 영역
    size_t page_size = sysconf(_SC_PAGESIZE);
    size_t num_pages = 1024;  // 대부분 TLB보다 큰 수
    size_t total_size = num_pages * page_size;

    char* buffer = malloc(total_size);
    printf("테스트 영역: %zu 페이지 (%zu MB)\n",
           num_pages, total_size >> 20);

    struct timeval start, end;

    // 첫 번째 패스 - TLB 미스 발생
    printf("\n첫 번째 패스 (TLB 콜드):\n");
    gettimeofday(&start, NULL);

    for (size_t i = 0; i < num_pages; i++) {
        buffer[i * page_size] = 0x42;  // 각 페이지 첫 바이트 접근
    }

    gettimeofday(&end, NULL);
    double time1 = (end.tv_sec - start.tv_sec) +
                   (end.tv_usec - start.tv_usec) / 1e6;
    printf("  소요시간: %.6f seconds\n", time1);

    // 두 번째 패스 - TLB 히트 (캐시된 경우)
    printf("\n두 번째 패스 (TLB 워밍):\n");
    gettimeofday(&start, NULL);

    for (size_t i = 0; i < num_pages; i++) {
        buffer[i * page_size] = 0x43;  // 같은 패턴 반복
    }

    gettimeofday(&end, NULL);
    double time2 = (end.tv_sec - start.tv_sec) +
                   (end.tv_usec - start.tv_usec) / 1e6;
    printf("  소요시간: %.6f seconds\n", time2);

    printf("\n성능 비교:\n");
    printf("  속도 향상: %.1f%% (%.1fx faster)\n",
           ((time1 - time2) / time1) * 100, time1 / time2);

    if (time2 < time1) {
        printf("  → TLB 캐싱 효과 확인!\n");
    } else {
        printf("  → TLB 크기보다 작거나 다른 요인 있음\n");
    }

    free(buffer);
}

int main() {
    measure_tlb_performance();
    return 0;
}
```

## 핵심 요점

### 1. 페이지 폴트의 정체

- 정상적인 메모리 관리 메커니즘
- Demand Paging으로 메모리 효율성 달성
- Minor/Major 폴트로 나뉘며 처리 방식이 다름

### 2. Copy-on-Write의 혁신

- fork()를 즉각적으로 만드는 핵심 기술
- 메모리 사용량을 실제 수정 부분에만 제한
- 읽기 전용 데이터의 효율적 공유

### 3. TLB의 중요성

- 주소 변환 오버헤드를 극적으로 감소
- 메모리 접근 패턴이 성능에 직접적 영향
- 지역성 활용이 고성능의 핵심

### 4. 실무 최적화 전략

- 행 우선 메모리 접근 패턴 사용
- 타일링으로 캐시 지역성 향상
- 페이지 폴트 모니터링으로 성능 진단

---

**이전**: [페이징 시스템](03b-paging-system.md)  
**다음**: [스왑과 대용량 페이지 활용](03d-swap-huge-pages.md)에서 스왑 메커니즘과 Huge Pages의 성능 최적화를 학습합니다.
