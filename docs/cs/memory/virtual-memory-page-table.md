---
tags:
  - Memory
  - Virtual-Memory
  - Page-Table
  - MMU
  - TLB
  - Linux
  - Performance
  - Kernel
---

# Virtual Memory와 Page Table: 현대 운영체제의 핵심 메모리 관리

## 들어가며

"왜 32GB RAM을 가진 서버에서 각 프로세스가 4GB 이상의 가상 주소 공간을 가질 수 있을까?", "프로세스가 같은 주소 0x1000에 접근해도 서로 다른 데이터를 보는 이유는?", "Page fault가 발생해도 왜 애플리케이션이 느려지지 않을까?" 이런 의문들은 모두 Virtual Memory와 Page Table의 동작 원리를 이해하면 해결됩니다.

특히 production 환경에서 메모리 성능 이슈를 해결하려면 MMU(Memory Management Unit)와 TLB(Translation Lookaside Buffer)의 동작 방식을 깊이 이해해야 합니다.

## Virtual Memory가 필요한 이유

Virtual Memory가 없다면 현대적인 멀티태스킹은 불가능합니다:

```text
Physical Memory without Virtual Memory:
┌─────────────────────────────────────┐ 0xFFFFFFFF
│     Process C (Crashed!)            │ ← 프로세스 종료시 메모리 구멍
├─────────────────────────────────────┤
│     Process B                       │
├─────────────────────────────────────┤
│     Process A (Fragmented)          │ ← 연속된 메모리 찾기 어려움
├─────────────────────────────────────┤
│     OS Kernel                       │
└─────────────────────────────────────┘ 0x00000000

문제점:
1. 메모리 보호 없음 - 프로세스간 침범 가능
2. 외부 단편화 - 연속된 큰 메모리 할당 어려움
3. 물리 주소 직접 사용 - 프로그램 위치 의존성
4. 스와핑 복잡 - 전체 프로세스만 교체 가능
```

Virtual Memory 도입 후:

```text
Virtual Memory Architecture:
┌─────────────────────────────────────┐
│      Process A Virtual Space        │ 각 프로세스마다
│  ┌─────────────────────────────┐    │ 독립적인 4GB 공간
│  │ 0xFFFFFFFF                  │    │ (32-bit 시스템)
│  │                             │    │
│  │ Virtual Addresses           │    │
│  │                             │    │
│  │ 0x00000000                  │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
          │ MMU Translation
          ▼
┌─────────────────────────────────────┐
│     Physical RAM (Shared)           │ 실제 물리 메모리는
│                                     │ 모든 프로세스가 공유
└─────────────────────────────────────┘
```

### Virtual Memory의 핵심 이점

1.**Memory Protection**: 프로세스간 메모리 격리
2.**Address Space Layout Randomization (ASLR)**: 보안 강화
3.**Demand Paging**: 필요한 페이지만 로드
4.**Copy-on-Write**: fork() 성능 최적화
5.**Memory Overcommit**: 물리 메모리보다 많은 가상 메모리 할당

## Virtual Address Space vs Physical Address Space

### Virtual Address Space 구조

64-bit Linux 시스템에서 프로세스당 가상 주소 공간:

```text
Virtual Address Space Layout (x86_64):
┌─────────────────────────────────────┐ 0xFFFFFFFFFFFFFFFF
│     Kernel Space (128TB)            │ ← 커널 전용, User 접근 불가
│                                     │
├─────────────────────────────────────┤ 0xFFFF800000000000
│     Non-canonical addresses         │ ← 사용 불가 영역
│     (16MB gap)                      │
├─────────────────────────────────────┤ 0x00007FFFFFFFFFFF
│                                     │
│     User Space (128TB)              │ ← 애플리케이션 사용 가능
│                                     │
│     Stack (grows down)              │ ↓
│     ↕ Memory Mapped Region          │
│     Heap (grows up)                 │ ↑
│     BSS (uninitialized data)        │
│     Data (initialized globals)      │
│     Text (code)                     │
└─────────────────────────────────────┘ 0x0000000000000000
```

실제 프로세스 메모리 맵:

```c
#include <sys/mman.h>
#include <stdio.h>
#include <unistd.h>

int global_var = 42;                    // Data segment
int uninitialized_var;                  // BSS segment

int main() {
    int stack_var = 10;                 // Stack

    // 동적 할당 (Heap)
    void* heap_ptr = malloc(1024);

    // Memory mapped file
    void* mmap_ptr = mmap(NULL, 4096, PROT_READ | PROT_WRITE,
                         MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);

    printf("Code (text):    %p, ", main);
    printf("Data:           %p, ", &global_var);
    printf("BSS:            %p, ", &uninitialized_var);
    printf("Stack:          %p, ", &stack_var);
    printf("Heap:           %p, ", heap_ptr);
    printf("Mmap:           %p, ", mmap_ptr);

    // 실제 출력 예시:
    // Code (text):    0x000055b8c2f4d149
    // Data:           0x000055b8c2f4f010
    // BSS:            0x000055b8c2f4f014
    // Stack:          0x00007ffe8b9e5b8c
    // Heap:           0x000055b8c3d70260
    // Mmap:           0x00007f4c5a5e1000
}
```

### Physical Address Space

물리 메모리는 연속적인 주소 공간으로 관리됩니다:

```bash
# 물리 메모리 정보 확인
$ cat /proc/meminfo
MemTotal:       32947404 kB    # 32GB 물리 RAM
MemFree:         1248752 kB    # 1.2GB 사용 가능
MemAvailable:   25589544 kB    # 25GB 실제 사용 가능

# 물리 메모리 맵 확인
$ cat /proc/iomem
00000000-00000fff : System RAM
00001000-0009fbff : System RAM
000a0000-000bffff : PCI Bus 0000:00
...
100000000-83fffffff : System RAM    # 32GB 주소 범위
```

실제 물리 메모리 레이아웃:

```text
Physical Memory Layout:
┌─────────────────────────────────────┐ 32GB
│        Available RAM                │
├─────────────────────────────────────┤
│        Kernel Direct Map            │ ← 커널이 직접 매핑
├─────────────────────────────────────┤
│        DMA Zone                     │ ← 하드웨어 DMA용
├─────────────────────────────────────┤
│        Low Memory (ZONE_NORMAL)     │ ← 일반 페이지들
├─────────────────────────────────────┤
│        Reserved Areas               │ ← BIOS, 디바이스
└─────────────────────────────────────┘ 0x0
```

## Page Table 구조

현대 x86_64 시스템은 4-level Page Table을 사용합니다:

### 4-Level Page Table 구조

```text
Virtual Address (64-bit):
┌─────┬─────┬─────┬─────┬─────┬─────────────┐
│ --- │PML4 │PDPT │ PD  │ PT  │   Offset    │
│16bit│9bit │9bit │9bit │9bit │   12bit     │
└─────┴─────┴─────┴─────┴─────┴─────────────┘
  |     |     |     |     |         |
  |     |     |     |     |         └─ 4KB Page 내 offset
  |     |     |     |     └─ Page Table index
  |     |     |     └─ Page Directory index
  |     |     └─ Page Directory Pointer Table index
  |     └─ Page Map Level 4 index
  └─ 사용하지 않음 (sign extension)

Translation Process:
CR3 Register ──┐
               │
               ▼
          ┌─────────┐  PML4 Index
          │  PML4   │ ────────────┐
          │ Table   │             │
          └─────────┘             ▼
               │               ┌─────────┐  PDPT Index
               │               │  PDPT   │ ────────────┐
               │               │ Table   │             │
               │               └─────────┘             ▼
               │                    │               ┌─────────┐  PD Index
               │                    │               │   PD    │ ──────────┐
               │                    │               │ Table   │           │
               │                    │               └─────────┘           ▼
               │                    │                    │           ┌─────────┐  PT Index
               │                    │                    │           │   PT    │ ────────┐
               │                    │                    │           │ Table   │         │
               │                    │                    │           └─────────┘         ▼
Physical       │                    │                    │                │         ┌─────────┐
Address  ←─────┴────────────────────┴────────────────────┴────────────────┴─────────│ Physical│
                                                                                     │  Page   │
                                                                                     └─────────┘
```

### Page Table Entry (PTE) 구조

64-bit PTE의 각 비트는 중요한 의미를 가집니다:

```c
// x86_64 Page Table Entry 구조 (linux/arch/x86/include/asm/pgtable_types.h)
typedef unsigned long pte_t;

// PTE 비트 플래그들
#define _PAGE_PRESENT    (1UL << 0)  // P:  메모리에 존재
#define _PAGE_RW         (1UL << 1)  // RW: 읽기/쓰기 권한
#define _PAGE_USER       (1UL << 2)  // U:  사용자 모드 접근 허용
#define _PAGE_PWT        (1UL << 3)  // PWT: Page Write Through
#define _PAGE_PCD        (1UL << 4)  // PCD: Page Cache Disable
#define _PAGE_ACCESSED   (1UL << 5)  // A:  접근됨 (하드웨어가 설정)
#define _PAGE_DIRTY      (1UL << 6)  // D:  수정됨 (쓰기시 하드웨어가 설정)
#define _PAGE_PSE        (1UL << 7)  // PS: Page Size (large page)
#define _PAGE_GLOBAL     (1UL << 8)  // G:  TLB에서 flush하지 않음
#define _PAGE_UNUSED1    (1UL << 9)  // 사용 가능
#define _PAGE_UNUSED2    (1UL << 10) // 사용 가능
#define _PAGE_UNUSED3    (1UL << 11) // 사용 가능

// Physical Address bits (12-51)
#define PTE_PFN_MASK     (((1UL << 40) - 1) << 12)

// NX bit (No Execute) - bit 63
#define _PAGE_NX         (1UL << 63)
```

실제 PTE 분석:

```bash
# 프로세스의 페이지 테이블 정보 확인 (root 권한 필요)
$ hexdump -C /proc/[pid]/pagemap | head -20

# 또는 페이지 정보 확인
$ cat /proc/[pid]/maps
7ffff7a00000-7ffff7bd0000 r-xp 00000000 08:01 1234 /lib/x86_64-linux-gnu/libc.so.6

# 해당 주소의 페이지 정보
$ cat /proc/[pid]/smaps
7ffff7a00000-7ffff7bd0000 r-xp 00000000 08:01 1234 /lib/x86_64-linux-gnu/libc.so.6
Size:               1856 kB    # 가상 크기
Rss:                 516 kB    # 실제 물리 메모리 사용량 (Resident Set Size)
Pss:                 258 kB    # 공유 페이지 비율 고려한 크기
Shared_Clean:        516 kB    # 공유된 깨끗한 페이지
Private_Dirty:         0 kB    # 프로세스 전용 더티 페이지
Referenced:          516 kB    # 최근 접근된 페이지
Anonymous:             0 kB    # 파일과 연결되지 않은 페이지
Swap:                  0 kB    # 스왑된 페이지
```

## Address Translation 과정 (MMU)

### MMU (Memory Management Unit) 동작 원리

MMU는 CPU와 메모리 사이에서 가상 주소를 물리 주소로 변환합니다:

```text
CPU Address Translation Flow:

CPU Core            MMU                     Physical Memory
┌─────────┐        ┌─────────────────┐        ┌─────────────┐
│ Virtual │───────→│     TLB         │        │             │
│Address  │        │   (Cache)       │        │             │
│0x7fff00 │        └─────────────────┘        │             │
└─────────┘                 │                 │             │
     │                      │ TLB Miss        │ Physical    │
     │                      ▼                 │ Memory      │
     │             ┌─────────────────┐        │             │
     │             │ Page Table      │        │             │
     │             │ Walker          │◀──────┤             │
     │             └─────────────────┘        │             │
     │                      │                 │             │
     │                      │ Physical        │             │
     ▼                      │ Address         ▼             │
┌─────────┐                ▼        ┌────────────────────┐  │
│ Memory  │◀──────────────────────────│   Page Tables     │  │
│ Access  │                         │   in Memory       │  │
└─────────┘                         └────────────────────┘  │
                                                           │
                                    ┌────────────────────┐  │
                                    │   Data Pages       │  │
                                    │                    │  │
                                    └────────────────────┘  │
                                                           │
                                    └─────────────────────┘
```

### Page Table Walk 상세 과정

1.**Virtual Address Parsing**:

```c
// 64-bit 가상 주소 0x7ffff7bd5123 분석
unsigned long vaddr = 0x7ffff7bd5123UL;

// 각 레벨의 인덱스 추출
int pml4_index = (vaddr >> 39) & 0x1ff;  // bits 47-39: 0x0ff
int pdpt_index = (vaddr >> 30) & 0x1ff;  // bits 38-30: 0x1fe
int pd_index   = (vaddr >> 21) & 0x1ff;  // bits 29-21: 0x1ea
int pt_index   = (vaddr >> 12) & 0x1ff;  // bits 20-12: 0x1d5
int offset     = vaddr & 0xfff;          // bits 11-0:  0x123
```

1.**Page Table Walking Algorithm**:

```c
// 커널의 페이지 테이블 워킹 (단순화된 버전)
// linux/arch/x86/mm/fault.c의 실제 구현 참조

pte_t *page_table_walk(struct mm_struct *mm, unsigned long vaddr) {
    pgd_t *pgd;    // Page Global Directory (PML4)
    p4d_t *p4d;    // Page 4th Directory
    pud_t *pud;    // Page Upper Directory (PDPT)
    pmd_t *pmd;    // Page Middle Directory (PD)
    pte_t *pte;    // Page Table Entry (PT)

    // 1. PML4 테이블 접근 (CR3 레지스터에서 base address)
    pgd = pgd_offset(mm, vaddr);
    if (pgd_none(*pgd) || pgd_bad(*pgd))
        return NULL;

    // 2. PDPT 테이블 접근
    p4d = p4d_offset(pgd, vaddr);
    if (p4d_none(*p4d) || p4d_bad(*p4d))
        return NULL;

    pud = pud_offset(p4d, vaddr);
    if (pud_none(*pud) || pud_bad(*pud))
        return NULL;

    // 3. PD 테이블 접근
    pmd = pmd_offset(pud, vaddr);
    if (pmd_none(*pmd) || pmd_bad(*pmd))
        return NULL;

    // 4. PT 테이블 접근
    pte = pte_offset_map(pmd, vaddr);
    if (!pte || pte_none(*pte))
        return NULL;

    return pte;
}
```

1.**Physical Address 계산**:

```c
// 최종 물리 주소 계산
unsigned long get_physical_address(pte_t *pte, unsigned long vaddr) {
    // PTE에서 Physical Frame Number 추출
    unsigned long pfn = pte_pfn(*pte);

    // Physical Frame 주소 = PFN * PAGE_SIZE
    unsigned long page_base = pfn << PAGE_SHIFT;  // PAGE_SIZE = 4096

    // 최종 물리 주소 = 페이지 베이스 + 오프셋
    unsigned long paddr = page_base + (vaddr & (PAGE_SIZE - 1));

    return paddr;
}
```

## TLB (Translation Lookaside Buffer)

### TLB의 중요성

Page Table Walk는 메모리에 4번 접근해야 하므로 매우 비쌉니다. TLB는 이를 해결하는 하드웨어 캐시입니다:

```text
Memory Access without TLB:
Virtual Address → PML4 access → PDPT access → PD access → PT access → Data access
      1              2             3            4           5           6
                    ↑
                5번의 메모리 접근! (매우 느림)

Memory Access with TLB:
Virtual Address → TLB Hit → Data access
      1             2          3
                    ↑
                단 2번의 메모리 접근! (빠름)
```

### TLB 구조와 성능

```bash
# CPU TLB 정보 확인
$ lscpu | grep -i tlb
L1d cache:             32K
L1i cache:             32K
L2 cache:              256K
L3 cache:              8192K

# 더 자세한 TLB 정보 (Intel CPU)
$ cpuid | grep -i tlb
      instruction TLB: 2M/4M pages, 4-way, 8 entries
      instruction TLB: 4K pages, 8-way, 64 entries
      data TLB: 2M/4M pages, 4-way, 32 entries
      data TLB: 4K pages, 4-way, 64 entries
      data TLB: 1G pages, 4-way, 4 entries
```

### TLB Miss와 성능 영향

```c
// TLB 성능 측정 코드
#include <sys/time.h>
#include <time.h>

// TLB Miss를 강제로 발생시키는 테스트
void tlb_miss_test() {
    const int pages = 1024 * 1024;  // 1M 페이지 (4GB)
    const int page_size = 4096;
    char *memory = mmap(NULL, pages * page_size,
                       PROT_READ | PROT_WRITE,
                       MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);

    struct timespec start, end;

    // Sequential access (TLB friendly)
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int i = 0; i < pages; i++) {
        memory[i * page_size] = 1;  // 각 페이지의 첫 바이트 접근
    }
    clock_gettime(CLOCK_MONOTONIC, &end);

    long sequential_time = (end.tv_sec - start.tv_sec) * 1000000000 +
                          (end.tv_nsec - start.tv_nsec);

    // Random access (TLB unfriendly)
    srand(time(NULL));
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int i = 0; i < pages; i++) {
        int page = rand() % pages;
        memory[page * page_size] = 1;  // 임의 페이지 접근
    }
    clock_gettime(CLOCK_MONOTONIC, &end);

    long random_time = (end.tv_sec - start.tv_sec) * 1000000000 +
                      (end.tv_nsec - start.tv_nsec);

    printf("Sequential: %ld ns, ", sequential_time);  // ~100ms
    printf("Random: %ld ns, ", random_time);         // ~500ms
    printf("TLB penalty: %.2fx, ", (double)random_time / sequential_time);
}
```

### TLB Flush와 Context Switch

```bash
# TLB 플러시 이벤트 모니터링
$ perf stat -e dtlb-loads,dtlb-load-misses,itlb-loads,itlb-load-misses ./program

Performance counter stats:
    1,250,000,000      dtlb-loads           # Data TLB loads
       15,623,456      dtlb-load-misses     # 1.25% miss rate
       890,123,456      itlb-loads           # Instruction TLB loads
        2,345,678      itlb-load-misses     # 0.26% miss rate

# Context switch로 인한 TLB flush 확인
$ cat /proc/interrupts | grep TLB
```

## Page 크기와 성능 최적화

### Standard Page vs Large Page vs Huge Page

리눅스는 다양한 페이지 크기를 지원합니다:

```text
Page Size Options:
┌─────────────────┬─────────────┬─────────────┬──────────────┐
│ Page Type       │ Size        │ TLB Entries │ Coverage     │
├─────────────────┼─────────────┼─────────────┼──────────────┤
│ Standard Page   │ 4KB         │ ~64         │ 256KB        │
│ Large Page      │ 2MB         │ ~32         │ 64MB         │
│ Huge Page       │ 1GB         │ ~4          │ 4GB          │
└─────────────────┴─────────────┴─────────────┴──────────────┘

TLB Coverage Calculation:
- 4KB pages: 64 entries × 4KB = 256KB coverage
- 2MB pages: 32 entries × 2MB = 64MB coverage
- 1GB pages: 4 entries × 1GB = 4GB coverage
```

### Huge Pages 설정과 활용

```bash
# Huge Pages 상태 확인
$ cat /proc/meminfo | grep -i huge
AnonHugePages:         0 kB      # Transparent Huge Pages
ShmemHugePages:        0 kB      # 공유 메모리 Huge Pages
HugePages_Total:       0         # 정적 Huge Pages 총 개수
HugePages_Free:        0         # 사용 가능한 Huge Pages
HugePages_Rsvd:        0         # 예약된 Huge Pages
HugePages_Surp:        0         # 여분의 Huge Pages
Hugepagesize:       2048 kB      # 기본 Huge Page 크기 (2MB)

# Transparent Huge Pages 상태 확인
$ cat /sys/kernel/mm/transparent_hugepage/enabled
[always] madvise never           # 현재 always 모드

# 정적 Huge Pages 할당 (2MB × 1000 = 2GB)
$ echo 1000 > /proc/sys/vm/nr_hugepages
$ cat /proc/meminfo | grep HugePages_Total
HugePages_Total:    1000
```

### 데이터베이스에서 Huge Pages 활용

PostgreSQL에서 Huge Pages 사용:

```bash
# PostgreSQL 설정
shared_buffers = 8GB
huge_pages = on                  # Huge Pages 사용 활성화

# 필요한 Huge Pages 계산
# shared_buffers(8GB) / hugepage_size(2MB) = 4000 pages
$ echo 4000 > /proc/sys/vm/nr_hugepages

# PostgreSQL 로그에서 확인
LOG:  using 4000 huge pages out of 4000 huge pages allocated
```

MySQL에서 Large Pages:

```ini
[mysqld]
innodb_buffer_pool_size = 16G
large_pages = ON                 # Large Pages 활성화
innodb_use_native_aio = ON       # 비동기 I/O와 함께 사용
```

성능 측정:

```c
// Huge Pages 성능 테스트
void hugepage_benchmark() {
    const size_t size = 1UL << 30;  // 1GB

    // 일반 페이지 할당
    void *normal_mem = mmap(NULL, size, PROT_READ | PROT_WRITE,
                           MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);

    // Huge Pages 할당
    void *huge_mem = mmap(NULL, size, PROT_READ | PROT_WRITE,
                         MAP_ANONYMOUS | MAP_PRIVATE | MAP_HUGETLB, -1, 0);

    // 성능 측정: 메모리 순차 접근
    struct timespec start, end;

    // Normal pages
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (size_t i = 0; i < size; i += 4096) {
        ((char*)normal_mem)[i] = 1;
    }
    clock_gettime(CLOCK_MONOTONIC, &end);
    long normal_time = (end.tv_sec - start.tv_sec) * 1000000000 +
                      (end.tv_nsec - start.tv_nsec);

    // Huge pages
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (size_t i = 0; i < size; i += 4096) {
        ((char*)huge_mem)[i] = 1;
    }
    clock_gettime(CLOCK_MONOTONIC, &end);
    long huge_time = (end.tv_sec - start.tv_sec) * 1000000000 +
                    (end.tv_nsec - start.tv_nsec);

    printf("Normal pages: %ld ns, ", normal_time);
    printf("Huge pages: %ld ns, ", huge_time);
    printf("Speedup: %.2fx, ", (double)normal_time / huge_time);
    // 일반적으로 10-30% 성능 향상
}
```

## Page Fault와 Demand Paging

### Page Fault 유형

Page Fault는 여러 상황에서 발생합니다:

```c
// Page Fault 시나리오들
void page_fault_scenarios() {
    // 1. Minor Page Fault - 메모리에 있지만 Page Table에 없음
    void *mem1 = mmap(NULL, 4096, PROT_READ | PROT_WRITE,
                     MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);
    // mmap 호출 시점에는 Page Table entry 없음
    *(char*)mem1 = 'A';  // ← Minor page fault 발생

    // 2. Major Page Fault - 디스크에서 로드 필요
    int fd = open("largefile.txt", O_RDONLY);
    void *mem2 = mmap(NULL, 1024*1024, PROT_READ, MAP_PRIVATE, fd, 0);
    // 파일이 페이지 캐시에 없다면
    char data = *(char*)mem2;  // ← Major page fault 발생

    // 3. Copy-on-Write Page Fault
    pid_t pid = fork();
    if (pid == 0) {
        // 자식 프로세스에서 쓰기 시도
        *(char*)mem1 = 'B';  // ← COW page fault 발생
    }

    // 4. Stack Growth Page Fault
    char large_array[8192];  // 2 페이지 스택 확장
    large_array[0] = 'C';    // ← Stack growth page fault
}
```

### Page Fault Handler

커널의 Page Fault 처리 과정:

```c
// linux/arch/x86/mm/fault.c의 단순화된 버전
void do_page_fault(struct pt_regs *regs, unsigned long error_code) {
    unsigned long address = read_cr2();  // Faulting address
    struct mm_struct *mm = current->mm;
    struct vm_area_struct *vma;
    int fault;

    // 1. VMA 찾기 - 주소가 유효한 메모리 영역인가?
    vma = find_vma(mm, address);
    if (!vma || vma->vm_start > address) {
        // Segmentation fault 발생
        send_signal(SIGSEGV, current);
        return;
    }

    // 2. 권한 확인 - 읽기/쓰기/실행 권한이 있는가?
    if (error_code & PF_WRITE) {
        if (!(vma->vm_flags & VM_WRITE))
            goto bad_area;
    } else {
        if (!(vma->vm_flags & (VM_READ | VM_EXEC)))
            goto bad_area;
    }

    // 3. Page Fault 처리
    fault = handle_mm_fault(vma, address,
                           (error_code & PF_WRITE) ? FAULT_FLAG_WRITE : 0);

    if (fault & VM_FAULT_ERROR) {
        // OOM 또는 기타 오류
        if (fault & VM_FAULT_OOM)
            pagefault_out_of_memory();
        else
            send_signal(SIGBUS, current);
    }
}

static int handle_mm_fault(struct vm_area_struct *vma,
                          unsigned long address, unsigned int flags) {
    // Anonymous mapping (heap, stack)
    if (vma->vm_ops == NULL) {
        return handle_anonymous_fault(vma, address, flags);
    }
    // File mapping
    else {
        return handle_file_fault(vma, address, flags);
    }
}
```

### Demand Paging 최적화

프로덕션 환경에서 Page Fault 최소화:

```bash
# Page Fault 모니터링
$ sar -B 1
02:00:01 PM  pgpgin/s pgpgout/s   fault/s  majflt/s  pgfree/s pgscank/s pgscand/s pgsteal/s    %vmeff
02:00:02 PM      0.00      0.00  12543.00      0.00   8234.00      0.00      0.00      0.00      0.00

# majflt/s: Major page faults per second (디스크 I/O 필요)
# fault/s:  Total page faults per second

# 애플리케이션별 Page Fault 확인
$ cat /proc/[pid]/stat | awk '{print "Minor faults: " $10 ", Major faults: " $12}'
```

메모리 예열(Warm-up) 기법:

```c
// 메모리 예열로 Page Fault 방지
void memory_warmup(void *addr, size_t size) {
    char *ptr = (char*)addr;

    // 모든 페이지에 접근하여 Page Fault 미리 발생
    for (size_t i = 0; i < size; i += 4096) {
        volatile char dummy = ptr[i];  // 읽기 접근
        ptr[i] = dummy;                // 쓰기 접근 (COW 트리거)
    }

    // 또는 mlock으로 메모리 고정
    if (mlock(addr, size) == 0) {
        printf("Memory locked in RAM, ");
    }
}

// 대용량 할당 시 활용
void* allocate_and_warmup(size_t size) {
    void *mem = mmap(NULL, size, PROT_READ | PROT_WRITE,
                    MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);
    if (mem == MAP_FAILED) return NULL;

    memory_warmup(mem, size);  // 미리 모든 페이지 접근
    return mem;
}
```

## Memory Protection과 Access Control

### Page 권한 제어

```c
// 메모리 보호 기능 테스트
void memory_protection_demo() {
    size_t page_size = getpagesize();  // 4096

    // 1. 읽기 전용 페이지
    void *readonly = mmap(NULL, page_size, PROT_READ,
                         MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);
    *(char*)readonly = 'A';  // ← SIGSEGV 발생!

    // 2. 실행 불가 페이지 (NX bit)
    void *noexec = mmap(NULL, page_size, PROT_READ | PROT_WRITE,
                       MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);

    // 실행 가능한 코드를 작성한 후
    char shellcode[] = {0xc3};  // ret instruction
    memcpy(noexec, shellcode, 1);

    void (*func)() = (void(*)())noexec;
    func();  // ← SIGSEGV 발생! (NX bit로 인해)

    // 3. 권한 변경
    if (mprotect(noexec, page_size, PROT_READ | PROT_WRITE | PROT_EXEC) == 0) {
        func();  // 이제 실행 가능
    }
}
```

### SMEP/SMAP 보호 기능

최신 CPU의 고급 보호 기능:

```bash
# SMEP/SMAP 지원 확인
$ cat /proc/cpuinfo | grep -E "smep|smap"
flags: ... smep smap ...

# SMEP (Supervisor Mode Execution Prevention):
# - 커널이 사용자 공간 코드를 실행하지 못하도록 방지
# - ROP/JOP 공격 방어

# SMAP (Supervisor Mode Access Prevention):
# - 커널이 사용자 공간 데이터에 접근하지 못하도록 방지
# - privilege escalation 공격 방어
```

KPTI (Kernel Page Table Isolation):

```bash
# Meltdown 취약점 방어를 위한 KPTI 확인
$ dmesg | grep -i kpti
[    0.000000] Kernel/User page tables isolation: enabled

# 성능 오버헤드 (약 5-30%)
$ cat /sys/devices/system/cpu/vulnerabilities/meltdown
Mitigation: PTI
```

## Linux 구현체 분석

### /proc/[pid]/maps 심화 분석

```bash
# 프로세스 메모리 맵 상세 분석
$ cat /proc/self/maps
address           perms offset  dev   inode    pathname
00400000-00452000 r-xp  00000000 08:01 1234567  /bin/bash
00651000-00652000 r--p  00051000 08:01 1234567  /bin/bash
00652000-0065b000 rw-p  00052000 08:01 1234567  /bin/bash
0065b000-00666000 rw-p  00000000 00:00 0        [heap]
7ffff7a1c000-7ffff7bd2000 r-xp 00000000 08:01 2345678 /lib/x86_64-linux-gnu/libc.so.6
7ffffffde000-7ffffffff000 rw-p 00000000 00:00 0 [stack]

# 권한 필드 해석:
# r = 읽기 가능
# w = 쓰기 가능
# x = 실행 가능
# p = private (COW), s = shared
```

### /proc/[pid]/pagemap 활용

실제 가상-물리 주소 매핑 확인:

```c
// pagemap을 통한 물리 주소 얻기
#include <stdint.h>
#include <fcntl.h>

uint64_t get_physical_address(void *virtual_addr) {
    int pagemap_fd = open("/proc/self/pagemap", O_RDONLY);
    if (pagemap_fd < 0) return 0;

    // 가상 주소를 페이지 인덱스로 변환
    uintptr_t vaddr = (uintptr_t)virtual_addr;
    uint64_t page_index = vaddr / 4096;

    // pagemap 파일에서 해당 엔트리 읽기
    uint64_t pagemap_entry;
    lseek(pagemap_fd, page_index * sizeof(uint64_t), SEEK_SET);
    read(pagemap_fd, &pagemap_entry, sizeof(uint64_t));
    close(pagemap_fd);

    // Physical Frame Number 추출 (bits 0-54)
    uint64_t pfn = pagemap_entry & ((1ULL << 55) - 1);

    if (pfn == 0) return 0;  // 페이지가 메모리에 없음

    // 물리 주소 = PFN * PAGE_SIZE + offset
    uint64_t physical_addr = (pfn * 4096) + (vaddr % 4096);
    return physical_addr;
}

// 사용 예시
void test_address_translation() {
    char *buffer = malloc(4096);
    strcpy(buffer, "Hello, World!");

    printf("Virtual address: %p, ", buffer);
    printf("Physical address: 0x%lx, ", get_physical_address(buffer));

    // 같은 데이터에 대한 다른 가상 주소
    char *mmaped = mmap(NULL, 4096, PROT_READ | PROT_WRITE,
                        MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);
    strcpy(mmaped, "Hello, World!");

    printf("Mmaped virtual: %p, ", mmaped);
    printf("Mmaped physical: 0x%lx, ", get_physical_address(mmaped));
    // 다른 물리 페이지에 매핑됨
}
```

### 커널 메모리 관리 구조체

```c
// linux/include/linux/mm_types.h
struct vm_area_struct {
    unsigned long vm_start;     // VMA 시작 주소
    unsigned long vm_end;       // VMA 끝 주소
    struct mm_struct *vm_mm;    // 소유자 프로세스의 mm_struct
    pgprot_t vm_page_prot;      // 페이지 보호 속성
    unsigned long vm_flags;     // VMA 플래그 (VM_READ, VM_WRITE 등)

    struct vm_operations_struct *vm_ops;  // VMA 연산
    unsigned long vm_pgoff;     // 파일 오프셋 (페이지 단위)
    struct file *vm_file;       // 매핑된 파일 (있는 경우)
};

struct mm_struct {
    struct vm_area_struct *mmap;        // VMA 연결 리스트
    struct rb_root mm_rb;               // VMA red-black tree
    pgd_t *pgd;                        // Page Global Directory

    unsigned long start_code, end_code; // 코드 영역
    unsigned long start_data, end_data; // 데이터 영역
    unsigned long start_brk, brk;       // 힙 영역
    unsigned long start_stack;          // 스택 시작

    unsigned long total_vm;             // 총 가상 메모리 페이지
    unsigned long locked_vm;            // mlock된 페이지
    unsigned long pinned_vm;            // pin된 페이지
    unsigned long data_vm;              // 데이터 페이지
    unsigned long exec_vm;              // 실행 가능 페이지
    unsigned long stack_vm;             // 스택 페이지
};
```

## 성능 고려사항과 최적화

### TLB 최적화 전략

1.**메모리 지역성 개선**:

```c
// 나쁜 예: TLB Miss 많이 발생
void bad_memory_access(int**matrix, int size) {
    for (int i = 0; i < size; i++) {
        for (int j = 0; j < size; j++) {
            matrix[j][i] += 1;  // 열 우선 접근 (캐시/TLB 미스)
        }
    }
}

// 좋은 예: TLB Hit 최대화
void good_memory_access(int**matrix, int size) {
    for (int i = 0; i < size; i++) {
        for (int j = 0; j < size; j++) {
            matrix[i][j] += 1;  // 행 우선 접근 (캐시/TLB 친화적)
        }
    }
}
```

1.**메모리 풀 사용**:

```c
// 메모리 풀로 TLB 효율성 향상
struct memory_pool {
    void *base;
    size_t size;
    size_t offset;
};

struct memory_pool* create_pool(size_t size) {
    struct memory_pool *pool = malloc(sizeof(struct memory_pool));

    // 대용량 메모리를 한 번에 할당하여 TLB 효율성 증대
    pool->base = mmap(NULL, size, PROT_READ | PROT_WRITE,
                     MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);
    pool->size = size;
    pool->offset = 0;

    return pool;
}

void* pool_alloc(struct memory_pool *pool, size_t size) {
    if (pool->offset + size > pool->size) return NULL;

    void *ptr = (char*)pool->base + pool->offset;
    pool->offset += size;
    return ptr;
}
```

### NUMA와 가상 메모리

NUMA 시스템에서 메모리 배치 최적화:

```bash
# NUMA 토폴로지 확인
$ numactl --hardware
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3 8 9 10 11
node 0 size: 16384 MB
node 1 cpus: 4 5 6 7 12 13 14 15
node 1 size: 16384 MB

# 프로세스의 NUMA 메모리 사용량
$ cat /proc/[pid]/numa_maps
7ffff7a00000 default file=/lib/x86_64-linux-gnu/libc.so.6 mapped=464 N0=232 N1=232
7ffffffde000 default stack anon=1 dirty=1 N0=1

# N0=232, N1=232: NUMA 노드별 페이지 분포
```

NUMA 인식 메모리 할당:

```c
#include <numa.h>

void numa_aware_allocation() {
    if (numa_available() < 0) {
        printf("NUMA not available, ");
        return;
    }

    // 현재 노드에 메모리 할당
    int node = numa_node_of_cpu(sched_getcpu());
    void *mem = numa_alloc_onnode(1024*1024, node);  // 1MB

    if (mem) {
        printf("Allocated on NUMA node %d, ", node);

        // 메모리 사용 (first-touch policy에 의해 로컬 노드에 할당)
        memset(mem, 0, 1024*1024);

        numa_free(mem, 1024*1024);
    }
}
```

### 컨테이너 환경 최적화

Kubernetes Pod에서 메모리 성능 최적화:

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    resources:
      requests:
        memory: "4Gi"
        hugepages-2Mi: "2Gi"  # 2MB Huge Pages 요청
      limits:
        memory: "8Gi"
        hugepages-2Mi: "2Gi"
    volumeMounts:
    - name: hugepage-volume
      mountPath: /hugepages
  volumes:
  - name: hugepage-volume
    emptyDir:
      medium: HugePages-2Mi
```

컨테이너 내부에서 최적화:

```c
// 컨테이너에서 메모리 최적화
void container_memory_optimization() {
    // 1. cgroup 메모리 제한 확인
    FILE *limit_file = fopen("/sys/fs/cgroup/memory/memory.limit_in_bytes", "r");
    if (limit_file) {
        unsigned long limit;
        fscanf(limit_file, "%lu", &limit);
        printf("Memory limit: %lu bytes, ", limit);
        fclose(limit_file);
    }

    // 2. Huge Pages 사용 가능 여부 확인
    if (access("/hugepages", F_OK) == 0) {
        // Huge Pages 마운트 포인트 사용
        int fd = open("/hugepages/myapp", O_CREAT | O_RDWR, 0755);
        if (fd >= 0) {
            ftruncate(fd, 1024*1024*1024);  // 1GB
            void *huge_mem = mmap(NULL, 1024*1024*1024,
                                 PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
            if (huge_mem != MAP_FAILED) {
                printf("Using Huge Pages in container, ");
            }
        }
    }

    // 3. NUMA 노드 확인 (컨테이너에서도 영향 있음)
    cpu_set_t cpuset;
    sched_getaffinity(0, sizeof(cpuset), &cpuset);
    printf("Allowed CPUs: ");
    for (int i = 0; i < CPU_SETSIZE; i++) {
        if (CPU_ISSET(i, &cpuset)) {
            printf("%d ", i);
        }
    }
    printf(", ");
}
```

## Real Production 시나리오

### 시나리오 1: TLB Thrashing으로 인한 성능 저하

**증상**: CPU 사용률은 높지 않은데 애플리케이션이 느림

```bash
# TLB 관련 성능 카운터 확인
$ perf stat -e dTLB-load-misses,iTLB-load-misses -p [pid] sleep 10

Performance counter stats:
     12,345,678      dTLB-load-misses    # 매우 높은 Data TLB miss!
      3,456,789      iTLB-load-misses    # Instruction TLB miss도 높음

# 프로세스 메모리 분산도 확인
$ pmap -x [pid] | head -20
Address           Kbytes     RSS   Dirty Mode  Mapping
00400000               4       4       0 r-x-- /usr/bin/app
...
7f1234000000          64      64      64 rw---   [ anon ]
7f1234100000          64      64      64 rw---   [ anon ]
7f1234200000          64      64      64 rw---   [ anon ]
# 매우 많은 작은 메모리 영역들!
```

**해결책**:

```c
// 메모리 풀 도입으로 TLB 효율성 개선
#define POOL_SIZE (1024 * 1024 * 1024)  // 1GB pool

static char memory_pool[POOL_SIZE];
static size_t pool_offset = 0;

void* optimized_malloc(size_t size) {
    if (pool_offset + size > POOL_SIZE) {
        // 풀이 가득참, 별도 처리 필요
        return malloc(size);
    }

    void *ptr = memory_pool + pool_offset;
    pool_offset += (size + 7) & ~7;  // 8바이트 정렬
    return ptr;
}

// 결과: TLB miss가 90% 감소, 처리량 3배 증가
```

### 시나리오 2: Container OOM with Available Memory

**증상**: 컨테이너에 충분한 메모리가 있는데 OOM Kill 발생

```bash
# Pod 상태 확인
$ kubectl describe pod myapp-pod
...
Containers:
  myapp:
    Limits:      memory: 4Gi
    Requests:    memory: 2Gi
Status:
  Last State:     Terminated
    Reason:       OOMKilled
    Exit Code:    137

# 노드의 실제 메모리 상황
$ free -h
              total        used        free      shared  buff/cache   available
Mem:           31Gi        12Gi       2.1Gi       1.2Gi        16Gi        17Gi
# 충분한 available 메모리가 있음!
```

**원인 분석**:

```bash
# cgroup 메모리 상세 확인
$ cat /sys/fs/cgroup/memory/kubepods/burstable/pod-uuid/[container-id]/memory.usage_in_bytes
4294967296  # 정확히 4GB (limit)

$ cat /sys/fs/cgroup/memory/kubepods/burstable/pod-uuid/[container-id]/memory.stat
cache 3221225472          # 3GB가 page cache!
rss 1073741824            # 실제 RSS는 1GB
mapped_file 0
inactive_file 2147483648  # 2GB는 inactive
active_file 1073741824    # 1GB는 active

# 문제: Page cache가 memory limit에 포함됨!
```

**해결책**:

```yaml
# 1. Memory limit 여유 확보
resources:
  limits:
    memory: "6Gi"  # Page cache 고려하여 증가
  requests:
    memory: "2Gi"

# 2. 또는 Direct I/O 사용으로 page cache 우회
```

```c
// Direct I/O로 page cache 우회
int fd = open("largefile.dat", O_RDONLY | O_DIRECT);
if (fd >= 0) {
    // O_DIRECT는 page cache를 우회하므로
    // memory cgroup에서 제외됨
}
```

### 시나리오 3: 대용량 메모리 할당 실패

**증상**: 32GB RAM 서버에서 8GB 메모리 할당 실패

```c
// 실패하는 코드
void *huge_malloc = malloc(8UL * 1024 * 1024 * 1024);  // 8GB
if (huge_malloc == NULL) {
    perror("malloc failed");  // 실패!
}
```

**원인 분석**:

```bash
# 가상 메모리 커밋 설정 확인
$ cat /proc/sys/vm/overcommit_memory
0   # 휴리스틱 기반 overcommit

$ cat /proc/sys/vm/overcommit_ratio
50  # 물리 메모리의 50%까지만 overcommit

# 현재 커밋된 메모리
$ cat /proc/meminfo | grep Committed
CommitLimit:    50331648 kB  # ~49GB (물리32GB + 스왑16GB의 50%)
Committed_AS:   45234567 kB  # ~44GB 이미 커밋됨

# 남은 여유: 49 - 44 = 5GB < 8GB 요청
```

**해결책 1: overcommit 설정 변경**

```bash
# Always overcommit 모드로 변경 (주의 필요)
$ echo 1 > /proc/sys/vm/overcommit_memory

# 또는 ratio 증가
$ echo 80 > /proc/sys/vm/overcommit_ratio
```

**해결책 2: mmap 사용**

```c
// mmap은 overcommit 제약을 덜 받음
void *huge_mem = mmap(NULL, 8UL * 1024 * 1024 * 1024,
                     PROT_READ | PROT_WRITE,
                     MAP_ANONYMOUS | MAP_PRIVATE, -1, 0);
if (huge_mem == MAP_FAILED) {
    perror("mmap failed");
} else {
    // 성공! 하지만 실제 물리 메모리는 접근시 할당됨
    printf("Virtual allocation success: %p, ", huge_mem);
}
```

## 디버깅과 모니터링

### Virtual Memory 디버깅 도구

```bash
# 1. 프로세스 메모리 맵 실시간 모니터링
$ watch -n 1 "cat /proc/[pid]/status | grep -E 'Vm|RSS'"

VmPeak:  2345678 kB  # 최대 가상 메모리 사용량
VmSize:  1234567 kB  # 현재 가상 메모리 사용량
VmRSS:    456789 kB  # 물리 메모리 사용량 (Resident Set Size)
VmData:   234567 kB  # 데이터 세그먼트 크기
VmStk:       136 kB  # 스택 크기
VmExe:       123 kB  # 코드 세그먼트 크기

# 2. Page fault 추적
$ sudo perf record -e page-faults -p [pid] sleep 10
$ perf report

# 3. TLB 성능 분석
$ perf stat -e dTLB-loads,dTLB-load-misses,iTLB-loads,iTLB-load-misses \
  ./your_application

# 4. 메모리 할당 패턴 분석 (mtrace)
$ export MALLOC_TRACE=malloc.log
$ ./your_application
$ mtrace ./your_application malloc.log
```

### 시스템 전체 Virtual Memory 모니터링

```bash
# vmstat으로 전체 시스템 모니터링
$ vmstat 1
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 2  0      0 1048576  12345 8765432  0    0     0     5    50  100 25  5 70  0  0

# free: 사용 가능한 물리 메모리
# buff: 버퍼 캐시
# cache: 페이지 캐시
# si/so: 스왑 in/out (페이지 단위)
# bi/bo: 블록 디바이스 I/O

# /proc/vmstat으로 더 자세한 정보
$ cat /proc/vmstat | grep -E "pgfault|pgmajfault"
pgfault 123456789      # 총 page fault 횟수
pgmajfault 1234567     # major page fault 횟수 (I/O 필요)
```

### Kubernetes 환경에서 메모리 모니터링

```bash
# Pod 메모리 사용량 실시간 모니터링
$ kubectl top pod --containers

NAME                CPU    MEMORY
myapp-pod           100m   1024Mi

# cAdvisor 메트릭으로 상세 분석
$ kubectl exec -it myapp-pod -- cat /proc/1/cgroup
12:memory:/kubepods/burstable/pod12345/container67890

$ cat /sys/fs/cgroup/memory/kubepods/burstable/pod12345/container67890/memory.stat
cache 1073741824        # 1GB page cache
rss 536870912          # 512MB RSS
mapped_file 268435456   # 256MB memory-mapped files
pgpgin 1234567         # pages read from disk
pgpgout 234567         # pages written to disk
pgfault 12345678       # page faults
pgmajfault 123456      # major page faults
```

## 정리

Virtual Memory와 Page Table은 현대 운영체제의 핵심 메모리 관리 메커니즘입니다:

### 핵심 개념 요약

1.**Address Translation**: MMU가 4-level page table을 통해 가상 주소를 물리 주소로 변환
2.**TLB 최적화**: 메모리 지역성과 Huge Pages로 TLB 히트율 향상
3.**Demand Paging**: 필요한 페이지만 로드하여 메모리 효율성 극대화
4.**Memory Protection**: NX bit, SMEP/SMAP, KPTI로 보안 강화
5.**Performance Tuning**: NUMA 인식, 메모리 풀, Container 최적화

### Production 환경 체크리스트

- [ ]**TLB 효율성**: perf로 TLB miss rate 확인 (< 1% 권장)
- [ ]**Page Fault 패턴**: major fault 최소화, warm-up 고려
- [ ]**Huge Pages**: 대용량 메모리 사용 애플리케이션에 적용
- [ ]**NUMA 최적화**: CPU 친화성과 메모리 로컬리티 고려
- [ ]**Container 메모리**: Page cache 영향과 cgroup 제한 이해
- [ ]**모니터링**: RSS vs Virtual, Page fault, TLB miss 지속 관찰

## 관련 문서

- [Linker 완벽 가이드](../compilation/linker.md) - 메모리 매핑과 주소 재배치
- [File Descriptor 완벽 가이드](../system/file-descriptor.md) - 메모리 매핑 파일 I/O
- [프로세스 메모리 구조 완벽 이해](process-memory-structure.md) - 가상 주소 공간 레이아웃
- [Page Cache 완벽 가이드](page-cache.md) - 페이지 캐시와 가상 메모리
- [OOM Killer 완벽 가이드](oom-killer.md) - 메모리 부족 상황 처리
- [Cgroup과 컨테이너 메모리](cgroup-container-memory.md): 컨테이너 환경의 Virtual Memory 제한
