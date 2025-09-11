---
tags:
  - Virtual Memory
  - Paging
  - Memory Management
  - Operating System
---

# Chapter 2-3: 가상 메모리와 페이징은 어떻게 동작하는가

## 이 문서를 읽으면 답할 수 있는 질문들

- 프로그램이 보는 메모리 주소와 실제 물리 메모리 주소는 어떻게 다른가?
- 4GB RAM에서 어떻게 여러 프로그램이 각각 4GB를 사용한다고 생각할 수 있는가?
- 페이지 폴트가 발생하면 정확히 무슨 일이 일어나는가?
- 스왑(Swap)은 언제, 왜 사용되는가?
- TLB가 없다면 프로그램이 얼마나 느려질까?

## 들어가며: 마법사의 트릭

여러분이 호텔에 묵는다고 상상해보세요. 호텔에는 100개의 방이 있는데, 손님은 200명입니다. 그런데 신기하게도 모든 손님이 "나는 101호에 묵고 있어요"라고 말합니다. 어떻게 가능할까요?

호텔 매니저(운영체제)가 마법을 부립니다. 각 손님에게는 가상의 방 번호를 주고, 실제로는 비어있는 방으로 안내합니다. 손님 A의 101호는 실제로 23호이고, 손님 B의 101호는 실제로 67호입니다. 손님들은 자신만의 101호를 가지고 있다고 믿지만, 실제로는 모두 다른 방에 있습니다.

이것이 바로 가상 메모리의 마법입니다. 모든 프로그램은 자신만의 완전한 메모리 공간을 가지고 있다고 믿지만, 실제로는 운영체제가 교묘하게 물리 메모리를 할당하고 관리합니다.

## 1. 가상 메모리: 환상의 세계

### 1.1 두 개의 세계: 가상과 현실

프로그램이 사는 세계와 실제 하드웨어의 세계는 다릅니다:

```c
// virtual_vs_physical.c
#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>

int main() {
    int shared_value = 42;
    printf("부모: shared_value의 주소 = %p, 값 = %d\n", 
           &shared_value, shared_value);
    
    pid_t pid = fork();
    
    if (pid == 0) {  // 자식 프로세스
        printf("자식: shared_value의 주소 = %p, 값 = %d\n", 
               &shared_value, shared_value);
        
        shared_value = 100;
        printf("자식: 값을 100으로 변경\n");
        printf("자식: shared_value의 주소 = %p, 값 = %d\n", 
               &shared_value, shared_value);
    } else {  // 부모 프로세스
        wait(NULL);
        printf("부모: shared_value의 주소 = %p, 값 = %d\n", 
               &shared_value, shared_value);
    }
    
    return 0;
}
```

실행 결과:
```text
부모: shared_value의 주소 = 0x7ffe5a3b7a2c, 값 = 42
자식: shared_value의 주소 = 0x7ffe5a3b7a2c, 값 = 42  # 같은 주소!
자식: 값을 100으로 변경
자식: shared_value의 주소 = 0x7ffe5a3b7a2c, 값 = 100
부모: shared_value의 주소 = 0x7ffe5a3b7a2c, 값 = 42  # 같은 주소인데 다른 값!
```

놀랍지 않나요? 부모와 자식이 **같은 주소**를 가지고 있는데 **다른 값**을 보고 있습니다! 이것이 가상 메모리의 마법입니다.

### 1.2 가상 메모리가 해결하는 문제들

가상 메모리가 없던 시절을 상상해봅시다:

**문제 1: 메모리 충돌**
```text
프로그램 A: 0x1000번지에 중요한 데이터 저장
프로그램 B: 0x1000번지에 자신의 데이터 저장
→ 충돌! 프로그램 A의 데이터가 파괴됨
```

**문제 2: 메모리 단편화**
```text
8KB RAM 상황:
[프로그램A: 2KB][빈공간: 1KB][프로그램B: 3KB][빈공간: 2KB]
→ 3KB 프로그램 C를 실행하려면? 
→ 빈 공간은 총 3KB이지만 연속되지 않아 실행 불가!
```

**문제 3: 보안 없음**
```c
// 악의적인 프로그램
int* steal_password = (int*)0x2000;  // 다른 프로그램의 메모리
printf("훔친 비밀번호: %s\n", steal_password);  // 😱
```

가상 메모리는 이 모든 문제를 우아하게 해결합니다!

### 1.3 주소 공간의 크기: 상상력의 한계

```c
// address_space_size.c
#include <stdio.h>
#include <stdint.h>

void explore_address_space() {
    printf("=== 주소 공간 탐험 ===\n\n");
    
    // 포인터 크기 확인
    printf("포인터 크기: %zu bytes = %zu bits\n", 
           sizeof(void*), sizeof(void*) * 8);
    
    // 32비트 시스템
    if (sizeof(void*) == 4) {
        uint32_t max_addr = UINT32_MAX;
        printf("32비트 시스템:\n");
        printf("  최대 주소: 0x%08X\n", max_addr);
        printf("  주소 공간: %.1f GB\n", max_addr / (1024.0 * 1024 * 1024));
    }
    
    // 64비트 시스템
    if (sizeof(void*) == 8) {
        printf("64비트 시스템:\n");
        printf("  이론적 최대: 2^64 = 16 EB (엑사바이트)\n");
        printf("  실제 사용 (x86-64): 2^48 = 256 TB\n");
        printf("  일반적 제한: 128 TB (사용자) + 128 TB (커널)\n");
        
        // 실제 주소 확인
        void* stack_addr = &max_addr;
        void* heap_addr = malloc(100);
        
        printf("\n실제 주소 예시:\n");
        printf("  스택: %p (상위 비트가 0x7F...)\n", stack_addr);
        printf("  힙:  %p (중간 영역)\n", heap_addr);
        
        free(heap_addr);
    }
}
```

생각해보세요. 64비트 시스템의 이론적 주소 공간은 16 엑사바이트입니다. 이는:
- 현재 전 세계 데이터 총량보다 많습니다
- 1초에 1바이트씩 쓴다면 5억년이 걸립니다
- 1mm 두께 종이에 인쇄하면 지구에서 태양까지 100번 왕복!

## 2. 페이징: 메모리를 책 페이지처럼

### 2.1 페이지와 프레임: 메모리의 레고 블록

메모리를 고정 크기 블록으로 나누는 것이 페이징입니다:

```c
// page_concept.c
#include <stdio.h>
#include <unistd.h>

void demonstrate_pages() {
    long page_size = sysconf(_SC_PAGESIZE);
    printf("시스템 페이지 크기: %ld bytes\n", page_size);
    
    // 보통 4KB (4096 bytes)
    if (page_size == 4096) {
        printf("= 2^12 bytes\n");
        printf("= 하위 12비트가 페이지 내 오프셋\n");
        printf("= 상위 비트가 페이지 번호\n");
    }
    
    // 주소 분해 예시
    void* addr = (void*)0x7FA812345678;
    uintptr_t addr_int = (uintptr_t)addr;
    
    uintptr_t page_num = addr_int >> 12;  // 상위 비트
    uintptr_t offset = addr_int & 0xFFF;   // 하위 12비트
    
    printf("\n주소 0x%lX 분해:\n", addr_int);
    printf("  페이지 번호: 0x%lX\n", page_num);
    printf("  페이지 내 오프셋: 0x%lX (%ld)\n", offset, offset);
}
```

페이지는 왜 4KB일까요? 
- **너무 작으면** (예: 256B): 페이지 테이블이 거대해짐
- **너무 크면** (예: 1MB): 내부 단편화가 심각해짐
- **4KB는 골디락스 크기**: 딱 적당합니다!

### 2.2 페이지 테이블: 주소 변환의 사전

페이지 테이블은 마치 번역 사전과 같습니다:

```c
// page_table_simulation.c
#include <stdio.h>
#include <stdint.h>

// 간단한 페이지 테이블 엔트리
typedef struct {
    uint64_t frame_number : 40;  // 물리 프레임 번호
    uint64_t present : 1;        // 메모리에 있음
    uint64_t writable : 1;       // 쓰기 가능
    uint64_t user : 1;           // 사용자 접근 가능
    uint64_t accessed : 1;       // 최근 접근됨
    uint64_t dirty : 1;          // 수정됨
    uint64_t reserved : 19;      // 예약됨
} PTE;

// 가상 주소 변환 시뮬레이션
void translate_address(uint64_t virtual_addr, PTE* page_table) {
    // 4KB 페이지 (12비트 오프셋)
    uint64_t page_num = virtual_addr >> 12;
    uint64_t offset = virtual_addr & 0xFFF;
    
    printf("가상 주소: 0x%lX\n", virtual_addr);
    printf("  → 페이지 번호: %ld\n", page_num);
    printf("  → 오프셋: 0x%lX\n", offset);
    
    // 페이지 테이블 조회
    PTE entry = page_table[page_num];
    
    if (!entry.present) {
        printf("  → 페이지 폴트! (페이지가 메모리에 없음)\n");
        return;
    }
    
    uint64_t physical_addr = (entry.frame_number << 12) | offset;
    printf("  → 물리 주소: 0x%lX\n", physical_addr);
    
    // 플래그 확인
    printf("  → 속성: ");
    if (entry.writable) printf("쓰기가능 ");
    if (entry.user) printf("사용자접근 ");
    if (entry.accessed) printf("최근접근 ");
    if (entry.dirty) printf("수정됨 ");
    printf("\n");
}
```

### 2.3 다단계 페이지 테이블: 공간 절약의 마법

64비트 시스템에서 단일 페이지 테이블을 사용한다면?

```text
주소 공간: 2^48 = 256TB
페이지 크기: 4KB = 2^12
페이지 개수: 2^48 / 2^12 = 2^36 = 68,719,476,736개
PTE 크기: 8 bytes
페이지 테이블 크기: 2^36 × 8 = 512GB!

각 프로세스마다 512GB 페이지 테이블? 불가능!
```

해결책: 다단계 페이지 테이블!

```c
// multilevel_paging.c
#include <stdio.h>
#include <stdint.h>

// x86-64의 4단계 페이징 시뮬레이션
typedef struct {
    uint16_t offset : 12;   // 12 bits: 페이지 내 오프셋
    uint16_t pt_idx : 9;    // 9 bits: Page Table 인덱스
    uint16_t pd_idx : 9;    // 9 bits: Page Directory 인덱스  
    uint16_t pdpt_idx : 9;  // 9 bits: Page Directory Pointer Table 인덱스
    uint16_t pml4_idx : 9;  // 9 bits: Page Map Level 4 인덱스
    uint16_t unused : 16;   // 16 bits: 사용 안 함 (48-64비트)
} VirtualAddress;

void decode_virtual_address(uint64_t addr) {
    printf("=== 4단계 페이지 테이블 주소 분해 ===\n");
    printf("가상 주소: 0x%016lX\n\n", addr);
    
    // 비트 분해
    uint64_t pml4_idx = (addr >> 39) & 0x1FF;  // 9 bits
    uint64_t pdpt_idx = (addr >> 30) & 0x1FF;  // 9 bits
    uint64_t pd_idx = (addr >> 21) & 0x1FF;    // 9 bits
    uint64_t pt_idx = (addr >> 12) & 0x1FF;    // 9 bits
    uint64_t offset = addr & 0xFFF;            // 12 bits
    
    printf("분해 결과:\n");
    printf("  PML4 인덱스: %3ld (비트 47-39)\n", pml4_idx);
    printf("  PDPT 인덱스: %3ld (비트 38-30)\n", pdpt_idx);
    printf("  PD 인덱스:   %3ld (비트 29-21)\n", pd_idx);
    printf("  PT 인덱스:   %3ld (비트 20-12)\n", pt_idx);
    printf("  오프셋:      0x%03lX (비트 11-0)\n", offset);
    
    printf("\n변환 과정:\n");
    printf("1. CR3 레지스터 → PML4 테이블\n");
    printf("2. PML4[%ld] → PDPT 테이블 주소\n", pml4_idx);
    printf("3. PDPT[%ld] → PD 테이블 주소\n", pdpt_idx);
    printf("4. PD[%ld] → PT 테이블 주소\n", pd_idx);
    printf("5. PT[%ld] → 물리 프레임 번호\n", pt_idx);
    printf("6. 물리 주소 = 프레임 번호 + 0x%lX\n", offset);
}

int main() {
    // 실제 주소로 테스트
    void* test_addr = malloc(100);
    printf("테스트 주소: %p\n\n", test_addr);
    decode_virtual_address((uint64_t)test_addr);
    free(test_addr);
    
    return 0;
}
```

다단계의 장점:
- **희소 주소 공간 효율적 표현**: 사용하지 않는 영역은 테이블 자체가 없음
- **메모리 절약**: 필요한 테이블만 생성
- **유연성**: 다양한 페이지 크기 지원 가능

## 3. 페이지 폴트: 메모리의 JIT(Just-In-Time)

### 3.1 페이지 폴트는 나쁜 것이 아니다

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

### 3.2 Copy-on-Write: 공유의 마법

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

### 3.3 페이지 폴트 핸들러의 여정

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

## 5. 스왑: 메모리의 비상구

### 5.1 스왑이 필요한 순간

```c
// memory_pressure.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

void create_memory_pressure() {
    printf("=== 메모리 압박 시뮬레이션 ===\n");
    printf("시스템 RAM을 초과하는 메모리 할당 시도\n\n");
    
    size_t chunk_size = 100 * 1024 * 1024;  // 100MB
    void* chunks[1000];
    int allocated = 0;
    
    // 메모리 정보 읽기
    FILE* meminfo = fopen("/proc/meminfo", "r");
    char line[256];
    long mem_total = 0, mem_available = 0, swap_free = 0;
    
    while (fgets(line, sizeof(line), meminfo)) {
        sscanf(line, "MemTotal: %ld", &mem_total);
        sscanf(line, "MemAvailable: %ld", &mem_available);
        sscanf(line, "SwapFree: %ld", &swap_free);
    }
    fclose(meminfo);
    
    printf("초기 상태:\n");
    printf("  총 메모리: %.1f GB\n", mem_total / (1024.0 * 1024));
    printf("  사용 가능: %.1f GB\n", mem_available / (1024.0 * 1024));
    printf("  스왑 여유: %.1f GB\n\n", swap_free / (1024.0 * 1024));
    
    // 점진적 할당
    while (allocated < 1000) {
        chunks[allocated] = malloc(chunk_size);
        if (!chunks[allocated]) {
            printf("할당 실패! (OOM)\n");
            break;
        }
        
        // 실제로 사용 (페이지 폴트 유발)
        memset(chunks[allocated], allocated, chunk_size);
        allocated++;
        
        printf("할당 #%d: ", allocated);
        
        // 현재 상태 체크
        meminfo = fopen("/proc/meminfo", "r");
        while (fgets(line, sizeof(line), meminfo)) {
            sscanf(line, "MemAvailable: %ld", &mem_available);
            sscanf(line, "SwapFree: %ld", &swap_free);
        }
        fclose(meminfo);
        
        printf("가용: %.1f GB, 스왑: %.1f GB", 
               mem_available / (1024.0 * 1024),
               swap_free / (1024.0 * 1024));
        
        // 스왑 사용 감지
        if (swap_free < mem_total) {
            printf(" [스왑 사용 중!]");
        }
        printf("\n");
        
        usleep(100000);  // 0.1초 대기
    }
    
    // 정리
    for (int i = 0; i < allocated; i++) {
        free(chunks[i]);
    }
}
```

### 5.2 페이지 교체 알고리즘

운영체제는 어떤 페이지를 스왑 아웃할지 결정해야 합니다:

```c
// page_replacement.c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

// 페이지 참조 기록
typedef struct {
    int page_num;
    int access_bit;
    int dirty_bit;
    time_t last_access;
    int access_count;
} PageInfo;

// FIFO 알고리즘
int fifo_select(PageInfo* pages, int num_pages) {
    int oldest_idx = 0;
    time_t oldest_time = pages[0].last_access;
    
    for (int i = 1; i < num_pages; i++) {
        if (pages[i].last_access < oldest_time) {
            oldest_time = pages[i].last_access;
            oldest_idx = i;
        }
    }
    
    printf("FIFO: 페이지 %d 선택 (가장 오래됨)\n", 
           pages[oldest_idx].page_num);
    return oldest_idx;
}

// LRU 알고리즘
int lru_select(PageInfo* pages, int num_pages) {
    int lru_idx = 0;
    time_t lru_time = pages[0].last_access;
    
    for (int i = 1; i < num_pages; i++) {
        if (pages[i].last_access < lru_time) {
            lru_time = pages[i].last_access;
            lru_idx = i;
        }
    }
    
    printf("LRU: 페이지 %d 선택 (최근 최소 사용)\n", 
           pages[lru_idx].page_num);
    return lru_idx;
}

// Clock 알고리즘 (Second Chance)
int clock_select(PageInfo* pages, int num_pages) {
    static int hand = 0;  // 시계 바늘
    
    while (1) {
        if (pages[hand].access_bit == 0) {
            printf("Clock: 페이지 %d 선택 (access bit = 0)\n", 
                   pages[hand].page_num);
            int selected = hand;
            hand = (hand + 1) % num_pages;
            return selected;
        }
        
        // 두 번째 기회 부여
        pages[hand].access_bit = 0;
        hand = (hand + 1) % num_pages;
    }
}

// 시뮬레이션
void simulate_page_replacement() {
    printf("=== 페이지 교체 알고리즘 시뮬레이션 ===\n\n");
    
    int num_pages = 5;
    PageInfo pages[5] = {
        {0, 1, 0, time(NULL) - 5, 10},
        {1, 0, 1, time(NULL) - 3, 5},
        {2, 1, 0, time(NULL) - 1, 15},
        {3, 0, 0, time(NULL) - 4, 3},
        {4, 1, 1, time(NULL) - 2, 8}
    };
    
    printf("현재 메모리 상태:\n");
    for (int i = 0; i < num_pages; i++) {
        printf("  페이지 %d: access=%d, dirty=%d, 접근수=%d\n",
               pages[i].page_num, pages[i].access_bit,
               pages[i].dirty_bit, pages[i].access_count);
    }
    printf("\n");
    
    printf("교체 대상 선택:\n");
    fifo_select(pages, num_pages);
    lru_select(pages, num_pages);
    clock_select(pages, num_pages);
}
```

## 6. 대용량 페이지: 더 큰 레고 블록

### 6.1 왜 Huge Pages인가?

현대 서버 환경에서 Huge Pages는 필수적인 성능 최적화 기법입니다. 특히 다음 환경에서 중요합니다:

**프로덕션 환경에서의 Huge Pages 설정:**

```bash
# 시스템 Huge Pages 확인
$ cat /proc/meminfo | grep -i huge
HugePages_Total:       0
HugePages_Free:        0
HugePages_Rsvd:        0
HugePages_Surp:        0
Hugepagesize:       2048 kB

# Huge Pages 활성화 (시스템 재부팅 후에도 유지)
$ echo 1024 > /proc/sys/vm/nr_hugepages  # 2GB 할당 (1024 * 2MB)
$ echo 'vm.nr_hugepages=1024' >> /etc/sysctl.conf

# Transparent Huge Pages 설정 확인
$ cat /sys/kernel/mm/transparent_hugepage/enabled
[always] madvise never

# Database 워크로드를 위한 권장 설정
$ echo madvise > /sys/kernel/mm/transparent_hugepage/enabled
```

**NUMA 시스템에서의 메모리 최적화:**

```bash
# NUMA 토폴로지 확인
$ numactl --hardware
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3 4 5
node 0 size: 32768 MB
node 0 free: 28123 MB
node 1 cpus: 6 7 8 9 10 11
node 1 size: 32768 MB
node 1 free: 29456 MB

# 특정 NUMA 노드에서 프로세스 실행
$ numactl --cpunodebind=0 --membind=0 ./high_memory_app

# 메모리 정책 확인
$ numactl --show
policy: default
preferred node: current
physcpubind: 0 1 2 3 4 5 6 7 8 9 10 11 
cpubind: 0 1
nodebind: 0 1
membind: 0 1
```

```c
// huge_pages_benefit.c
#include <stdio.h>
#include <sys/mman.h>
#include <time.h>
#include <string.h>

void compare_page_sizes() {
    printf("=== 일반 페이지 vs Huge Pages ===\n\n");
    
    size_t size = 1024 * 1024 * 1024;  // 1GB
    
    // 일반 페이지 (4KB)
    printf("일반 페이지 (4KB):\n");
    printf("  1GB = %ld 페이지\n", size / 4096);
    printf("  페이지 테이블 크기: %.1f MB\n", 
           (size / 4096) * 8.0 / (1024 * 1024));
    printf("  TLB 엔트리 필요: %ld개\n\n", size / 4096);
    
    // Huge Pages (2MB)
    printf("Huge Pages (2MB):\n");
    printf("  1GB = %ld 페이지\n", size / (2 * 1024 * 1024));
    printf("  페이지 테이블 크기: %.1f KB\n", 
           (size / (2 * 1024 * 1024)) * 8.0 / 1024);
    printf("  TLB 엔트리 필요: %ld개 (512배 감소!)\n", 
           size / (2 * 1024 * 1024));
}

// Huge Pages 성능 테스트
void benchmark_huge_pages() {
    size_t size = 100 * 1024 * 1024;  // 100MB
    clock_t start, end;
    
    printf("\n=== Huge Pages 성능 비교 ===\n\n");
    
    // 일반 페이지
    void* normal = mmap(NULL, size, 
                       PROT_READ | PROT_WRITE,
                       MAP_PRIVATE | MAP_ANONYMOUS, 
                       -1, 0);
    
    start = clock();
    memset(normal, 0, size);
    end = clock();
    printf("일반 페이지 초기화: %.3f seconds\n", 
           (double)(end - start) / CLOCKS_PER_SEC);
    
    munmap(normal, size);
    
    // Huge Pages
    void* huge = mmap(NULL, size,
                     PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB,
                     -1, 0);
    
    if (huge != MAP_FAILED) {
        start = clock();
        memset(huge, 0, size);
        end = clock();
        printf("Huge Pages 초기화: %.3f seconds (더 빠름!)\n", 
               (double)(end - start) / CLOCKS_PER_SEC);
        munmap(huge, size);
    } else {
        printf("Huge Pages 할당 실패 (설정 필요)\n");
    }
}
```

## 7. 정리: 가상 메모리의 마법

### 7.1 핵심 개념 정리

우리가 배운 가상 메모리의 마법:

**가상 주소 공간**
- 🎭 **환상**: 각 프로세스는 전체 메모리를 소유한다고 믿음
- 🛡️ **격리**: 프로세스 간 완벽한 분리
- 🎯 **효율**: 필요한 부분만 물리 메모리 사용

**페이징 시스템**
- 📄 **페이지**: 고정 크기 메모리 블록 (보통 4KB)
- 📚 **페이지 테이블**: 가상→물리 주소 변환 사전
- 🎯 **다단계**: 공간 효율적인 테이블 구조

**성능 최적화**
- ⚡ **TLB**: 주소 변환의 캐시
- 📦 **Huge Pages**: 큰 메모리 영역용 최적화
- 🔄 **CoW**: 복사 지연으로 성능 향상

### 7.2 기억해야 할 교훈

1. **"페이지 폴트는 정상이다"**
   - Demand Paging(요구 페이징)의 핵심 메커니즘
   - 메모리 효율성의 근원

2. **"TLB가 성능을 좌우한다"**
   - 메모리 접근 패턴이 중요
   - 지역성을 활용한 코드 작성

3. **"스왑은 최후의 수단"**
   - RAM이 부족할 때만 사용
   - 성능 저하의 주요 원인

4. **"가상 메모리는 마법이 아니다"**
   - 하드웨어(MMU)와 소프트웨어(OS)의 협력
   - 오버헤드가 있지만 이점이 더 큼

### 7.3 실무 활용

가상 메모리 지식을 어떻게 활용할까요?

- **메모리 접근 패턴 최적화**: 행 우선 순회, 타일링
- **Huge Pages 활용**: 대용량 데이터베이스, 과학 계산
- **페이지 폴트 모니터링**: 성능 문제 진단
- **NUMA 고려**: 멀티소켓 시스템 최적화

## 다음 섹션 예고

다음 섹션([2-4: 메모리 매핑과 공유 메모리는 어떻게 동작하는가](04-memory-mapping.md))에서는 **메모리 매핑과 공유 메모리**를 탐구합니다:

- mmap()은 어떻게 파일을 메모리처럼 다루게 할까?
- 프로세스 간 가장 빠른 통신 방법은?
- 공유 라이브러리가 메모리를 어떻게 절약할까?
- Zero-copy I/O의 비밀은?

파일과 메모리의 경계가 사라지는 놀라운 세계로 함께 떠나봅시다!

## 관련 문서

- [2-2: 스택과 힙은 어떻게 동작하는가](02-stack-heap.md) - 동적 메모리 관리 기초
- [2-4: 메모리 매핑과 공유 메모리는 어떻게 동작하는가](04-memory-mapping.md) - 고급 메모리 기법
- [Chapter 1: 컴파일러와 링커](../chapter-01-compiler-linker/index.md) - 컴파일과 링킹 기초