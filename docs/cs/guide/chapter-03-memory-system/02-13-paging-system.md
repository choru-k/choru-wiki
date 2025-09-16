---
tags:
  - balanced
  - intermediate
  - medium-read
  - mmu
  - multilevel_paging
  - page_table
  - paging
  - virtual_address_translation
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 3.3B: 페이징 시스템과 페이지 테이블

## 1. 페이징: 메모리를 책 페이지처럼

### 1.1 페이지와 프레임: 메모리의 레고 블록

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

### 1.2 페이지 크기의 트레이드오프

```c
// page_size_analysis.c
#include <stdio.h>
#include <stdint.h>

void analyze_page_size_tradeoff() {
    printf("=== 페이지 크기별 트레이드오프 분석 ===\n\n");

    uint64_t virtual_space = 1ULL << 48;  // 256TB (x86-64)
    size_t pte_size = 8;  // Page Table Entry 크기

    printf("가상 주소 공간: %lu TB\n\n", virtual_space >> 40);

    // 다양한 페이지 크기 분석
    size_t page_sizes[] = {1024, 4096, 16384, 65536, 1048576};  // 1KB, 4KB, 16KB, 64KB, 1MB
    const char* size_names[] = {"1KB", "4KB", "16KB", "64KB", "1MB"};

    printf("페이지 크기별 분석:\n");
    printf("%-8s %-12s %-15s %-20s\n", "크기", "페이지 수", "페이지 테이블", "내부 단편화 최대");
    printf("------------------------------------------------------------\n");

    for (int i = 0; i < 5; i++) {
        uint64_t num_pages = virtual_space / page_sizes[i];
        uint64_t table_size = num_pages * pte_size;
        size_t max_fragmentation = page_sizes[i] - 1;

        printf("%-8s %-12lu %-15lu MB %-20zu bytes\n",
               size_names[i],
               num_pages,
               table_size / (1024 * 1024),
               max_fragmentation);
    }

    printf("\n📊 트레이드오프:\n");
    printf("• 작은 페이지: 적은 내부 단편화 vs 큰 페이지 테이블\n");
    printf("• 큰 페이지: 작은 페이지 테이블 vs 많은 내부 단편화\n");
    printf("• 4KB: 균형잡힌 선택 (대부분의 시스템 기본값)\n");
}

int main() {
    analyze_page_size_tradeoff();
    return 0;
}
```

## 2. 페이지 테이블: 주소 변환의 사전

### 2.1 페이지 테이블 엔트리의 구조

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

### 2.2 페이지 테이블의 메모리 오버헤드

```c
// page_table_overhead.c
#include <stdio.h>
#include <stdint.h>

void calculate_page_table_overhead() {
    printf("=== 페이지 테이블 메모리 오버헤드 계산 ===\n\n");

    // 64비트 시스템에서 단일 레벨 페이지 테이블 가정
    uint64_t virtual_space_bits = 48;  // x86-64
    uint64_t page_size_bits = 12;      // 4KB pages
    size_t pte_size = 8;               // 8 bytes per entry

    uint64_t virtual_space = 1ULL << virtual_space_bits;
    uint64_t page_size = 1ULL << page_size_bits;
    uint64_t num_pages = virtual_space / page_size;

    printf("시스템 구성:\n");
    printf("  가상 주소 공간: 2^%lu = %lu TB\n",
           virtual_space_bits, virtual_space >> 40);
    printf("  페이지 크기: 2^%lu = %lu KB\n",
           page_size_bits, page_size >> 10);
    printf("  PTE 크기: %zu bytes\n\n", pte_size);

    printf("단일 레벨 페이지 테이블:\n");
    printf("  총 페이지 수: %lu (2^%lu)\n", num_pages, virtual_space_bits - page_size_bits);
    printf("  페이지 테이블 크기: %lu GB\n", (num_pages * pte_size) >> 30);
    printf("  프로세스당 오버헤드: %lu GB\n", (num_pages * pte_size) >> 30);

    printf("\n🚨 문제점:\n");
    printf("  각 프로세스마다 %lu GB의 페이지 테이블 필요!\n", (num_pages * pte_size) >> 30);
    printf("  16GB RAM 시스템에서 프로세스 3개만 실행해도 메모리 부족!\n");
    printf("  → 다단계 페이지 테이블이 필요한 이유\n");
}

int main() {
    calculate_page_table_overhead();
    return 0;
}
```

## 3. 다단계 페이지 테이블: 공간 절약의 마법

### 3.1 왜 다단계가 필요한가?

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

### 3.2 x86-64의 4단계 페이징

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

### 3.3 다단계 페이징의 메모리 절약 효과

```c
// multilevel_memory_savings.c
#include <stdio.h>
#include <stdint.h>

void calculate_multilevel_savings() {
    printf("=== 다단계 페이징의 메모리 절약 효과 ===\n\n");

    size_t pte_size = 8;  // 8 bytes per PTE
    size_t entries_per_table = 512;  // 2^9 entries per table

    // 단일 레벨 페이지 테이블
    uint64_t single_level_entries = 1ULL << 36;  // 2^36 entries
    uint64_t single_level_size = single_level_entries * pte_size;

    printf("단일 레벨 페이지 테이블:\n");
    printf("  엔트리 수: 2^36 = %lu\n", single_level_entries);
    printf("  테이블 크기: %lu GB\n", single_level_size >> 30);

    // 4단계 페이징 (최악의 경우 - 모든 테이블 필요)
    uint64_t pml4_tables = 1;
    uint64_t pdpt_tables = 512;  // 최대 512개
    uint64_t pd_tables = 512 * 512;  // 최대 262,144개
    uint64_t pt_tables = 512 * 512 * 512;  // 최대 134,217,728개

    uint64_t total_tables = pml4_tables + pdpt_tables + pd_tables + pt_tables;
    uint64_t multilevel_size = total_tables * entries_per_table * pte_size;

    printf("\n4단계 페이징 (최악의 경우):\n");
    printf("  PML4 테이블: %lu개\n", pml4_tables);
    printf("  PDPT 테이블: %lu개\n", pdpt_tables);
    printf("  PD 테이블: %lu개\n", pd_tables);
    printf("  PT 테이블: %lu개\n", pt_tables);
    printf("  총 테이블 크기: %lu GB\n", multilevel_size >> 30);

    // 실제 사용 시나리오 (희소 주소 공간)
    printf("\n실제 시나리오 (일반적인 프로세스):\n");
    printf("  사용하는 주소 영역: 텍스트, 데이터, 힙, 스택\n");
    printf("  필요한 테이블 수: ~10-100개 (전체의 0.001%)\n");
    printf("  실제 메모리 사용량: ~1-10 MB\n");
    printf("  절약률: 99.999%!\n");

    printf("\n💡 다단계 페이징의 핵심:\n");
    printf("  • 사용하지 않는 주소 영역은 테이블 자체가 없음\n");
    printf("  • 필요에 따라 동적으로 테이블 생성\n");
    printf("  • 메모리 사용량이 실제 사용 패턴에 비례\n");
}

int main() {
    calculate_multilevel_savings();
    return 0;
}
```

## 4. 페이지 테이블 워킹 (Page Table Walking)

### 4.1 하드웨어 페이지 테이블 워킹

```c
// page_table_walking.c
#include <stdio.h>
#include <stdint.h>
#include <time.h>

// 페이지 테이블 워킹 시뮬레이션
typedef struct {
    uint64_t entries[512];  // 512개 엔트리
    int level;              // 테이블 레벨 (4=PML4, 3=PDPT, 2=PD, 1=PT)
} PageTable;

// 페이지 테이블 엔트리에서 다음 레벨 테이블 주소 추출
uint64_t get_next_table_address(uint64_t pte) {
    return pte & 0x000FFFFFFFFFF000ULL;  // 물리 주소 (비트 51-12)
}

// 페이지 테이블 워킹 수행
uint64_t walk_page_table(uint64_t virtual_addr, PageTable* pml4) {
    printf("=== 페이지 테이블 워킹 과정 ===\n");
    printf("가상 주소: 0x%016lX\n\n", virtual_addr);

    int memory_accesses = 0;
    clock_t start_time = clock();

    // 주소 분해
    uint64_t indices[4] = {
        (virtual_addr >> 39) & 0x1FF,  // PML4 인덱스
        (virtual_addr >> 30) & 0x1FF,  // PDPT 인덱스
        (virtual_addr >> 21) & 0x1FF,  // PD 인덱스
        (virtual_addr >> 12) & 0x1FF   // PT 인덱스
    };
    uint64_t offset = virtual_addr & 0xFFF;

    const char* level_names[] = {"PML4", "PDPT", "PD", "PT"};
    PageTable* current_table = pml4;

    printf("워킹 단계:\n");

    for (int level = 4; level >= 1; level--) {
        memory_accesses++;
        int level_idx = 4 - level;

        printf("%d. %s 테이블 접근 (메모리 접근 #%d)\n",
               level_idx + 1, level_names[level_idx], memory_accesses);
        printf("   테이블 주소: %p\n", current_table);
        printf("   인덱스: %ld\n", indices[level_idx]);

        uint64_t entry = current_table->entries[indices[level_idx]];
        printf("   엔트리 값: 0x%016lX\n", entry);

        // Present 비트 확인
        if (!(entry & 1)) {
            printf("   → 페이지 폴트! (Present=0)\n");
            return 0;
        }

        if (level == 1) {
            // PT 레벨 - 물리 프레임 번호 반환
            uint64_t frame_number = entry >> 12;
            uint64_t physical_addr = (frame_number << 12) | offset;
            printf("   → 물리 프레임: 0x%lX\n", frame_number);
            printf("   → 최종 물리 주소: 0x%016lX\n", physical_addr);

            clock_t end_time = clock();
            double time_taken = ((double)(end_time - start_time)) / CLOCKS_PER_SEC;

            printf("\n📊 워킹 통계:\n");
            printf("   총 메모리 접근 횟수: %d\n", memory_accesses);
            printf("   소요 시간 (시뮬레이션): %.6f초\n", time_taken);
            printf("   실제 하드웨어에서는 수 나노초 내에 완료\n");

            return physical_addr;
        } else {
            // 다음 레벨 테이블 주소 계산
            uint64_t next_table_addr = get_next_table_address(entry);
            printf("   → 다음 레벨 테이블: 0x%016lX\n", next_table_addr);

            // 실제로는 물리 주소를 사용하지만, 시뮬레이션에서는 포인터 연산
            current_table = (PageTable*)(next_table_addr);
        }
        printf("\n");
    }

    return 0;
}

int main() {
    // 간단한 페이지 테이블 구조 설정
    PageTable pml4 = {.level = 4};

    // 가상 주소 0x7F8000001000을 변환
    uint64_t virtual_addr = 0x7F8000001000;
    uint64_t physical_addr = walk_page_table(virtual_addr, &pml4);

    if (physical_addr) {
        printf("✅ 변환 성공: 0x%016lX → 0x%016lX\n", virtual_addr, physical_addr);
    } else {
        printf("❌ 변환 실패: 페이지 폴트 발생\n");
    }

    return 0;
}
```

### 4.2 페이지 테이블 캐싱 최적화

```c
// page_table_cache.c
#include <stdio.h>
#include <stdint.h>

// 페이지 테이블 캐시 (실제 시스템의 페이지 워커 캐시 시뮬레이션)
typedef struct {
    uint64_t virtual_page;
    uint64_t physical_frame;
    int valid;
    int level;  // 캐시된 레벨 (중간 테이블도 캐싱 가능)
} PTECache;

#define CACHE_SIZE 16
PTECache pte_cache[CACHE_SIZE];
int cache_hits = 0, cache_misses = 0;

int lookup_pte_cache(uint64_t virtual_page) {
    for (int i = 0; i < CACHE_SIZE; i++) {
        if (pte_cache[i].valid && pte_cache[i].virtual_page == virtual_page) {
            cache_hits++;
            return i;
        }
    }
    cache_misses++;
    return -1;
}

void demonstrate_page_table_caching() {
    printf("=== 페이지 테이블 캐싱 효과 ===\n\n");

    // 연속된 가상 주소들 (같은 페이지 테이블 공유)
    uint64_t virtual_addresses[] = {
        0x400000000000,  // 같은 PML4, PDPT 공유
        0x400000001000,  // 같은 PML4, PDPT, PD 공유
        0x400000002000,  // 같은 PML4, PDPT, PD 공유
        0x400000400000,  // 같은 PML4, PDPT 공유
        0x400040000000,  // 같은 PML4 공유
        0x500000000000   // 모두 다름
    };

    int num_addresses = sizeof(virtual_addresses) / sizeof(virtual_addresses[0]);

    printf("가상 주소 패턴 분석:\n");
    for (int i = 0; i < num_addresses; i++) {
        uint64_t addr = virtual_addresses[i];
        printf("0x%012lX: PML4=%ld, PDPT=%ld, PD=%ld, PT=%ld\n",
               addr,
               (addr >> 39) & 0x1FF,
               (addr >> 30) & 0x1FF,
               (addr >> 21) & 0x1FF,
               (addr >> 12) & 0x1FF);
    }

    printf("\n캐싱 없는 경우: 각 주소마다 4번의 메모리 접근\n");
    printf("총 메모리 접근: %d × 4 = %d회\n\n", num_addresses, num_addresses * 4);

    printf("캐싱 있는 경우 (이상적):\n");
    printf("  첫 번째 주소: 4회 접근 (PML4, PDPT, PD, PT)\n");
    printf("  두 번째 주소: 1회 접근 (PT만, 나머지는 캐시)\n");
    printf("  세 번째 주소: 1회 접근 (PT만, 나머지는 캐시)\n");
    printf("  네 번째 주소: 2회 접근 (PD, PT)\n");
    printf("  다섯 번째 주소: 3회 접근 (PDPT, PD, PT)\n");
    printf("  여섯 번째 주소: 4회 접근 (모두 다름)\n");
    printf("  총합: 15회 접근 (62.5% 감소!)\n");

    printf("\n💡 페이지 테이블 캐싱의 이점:\n");
    printf("  • 중간 레벨 테이블들을 캐싱\n");
    printf("  • 지역성 있는 메모리 접근에서 큰 효과\n");
    printf("  • TLB와 함께 작동하여 전체 성능 향상\n");
}

int main() {
    demonstrate_page_table_caching();
    return 0;
}
```

## 핵심 요점

### 1. 페이징의 핵심 개념

- 고정 크기 메모리 블록으로 관리
- 4KB 페이지 크기는 효율성과 단편화의 균형점
- 가상 페이지와 물리 프레임의 유연한 매핑

### 2. 페이지 테이블의 구조

- 가상 주소를 물리 주소로 변환하는 핵심 자료구조
- Present, Writable, User 등의 권한 비트
- Accessed, Dirty 비트로 사용 패턴 추적

### 3. 다단계 페이징의 혁신

- 거대한 단일 페이지 테이블 문제 해결
- 희소 주소 공간의 효율적 표현
- 메모리 사용량이 실제 사용 패턴에 비례

### 4. 페이지 테이블 워킹의 최적화

- 하드웨어 MMU가 자동으로 수행
- 페이지 테이블 캐싱으로 성능 향상
- TLB와 함께 작동하여 전체 지연시간 최소화

---

**이전**: [가상 메모리 기초](chapter-03-memory-system/03-03-virtual-memory-basics.md)  
**다음**: [페이지 폴트와 TLB 최적화](chapter-03-memory-system/03-14-page-fault-tlb.md)에서 페이지 폴트 처리와 TLB의 성능 최적화를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-02-memory)

- [Chapter 2-1: 프로세스 메모리 구조는 어떻게 구성되는가](./03-10-process-memory.md)
- [Chapter 2-2: 스택과 힙은 어떻게 동작하는가 개요](./03-11-stack-heap.md)
- [Chapter 2-2a: 스택의 상세 동작 - 함수 호출의 발레](./03-01-stack-fundamentals.md)
- [Chapter 2-2b: 힙의 상세 동작 - 도시 계획과 같은 복잡성](./03-02-heap-fundamentals.md)
- [Chapter 2-2c: 성능 비교와 메모리 버그 - 숫자로 보는 차이와 버그 사냥](./03-40-performance-debugging.md)

### 🏷️ 관련 키워드

`paging`, `page_table`, `mmu`, `virtual_address_translation`, `multilevel_paging`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
