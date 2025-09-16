---
tags:
  - hands-on
  - huge_pages
  - intermediate
  - medium-read
  - memory_optimization
  - numa
  - performance_tuning
  - swap
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 3.3D: 스왑과 대용량 페이지 활용

## 1. 스왑: 메모리의 비상구

### 1.1 스왑이 필요한 순간

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

### 1.2 스왑의 종류와 설정

```bash
# 스왑 공간 확인
$ swapon --show
NAME      TYPE      SIZE USED PRIO
/swapfile file        2G   0B   -2

# 스왑 파일 생성
$ sudo fallocate -l 4G /swapfile
$ sudo chmod 600 /swapfile
$ sudo mkswap /swapfile
$ sudo swapon /swapfile

# 스왑 파티션 정보
$ cat /proc/swaps
Filename    Type        Size    Used    Priority
/swapfile   file        4194300 0       -2

# 스왑 사용률 모니터링
$ vmstat 1
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 1  0      0 1250744  89532 1876420   0    0     8    12   45   89  2  1 97  0  0
```

### 1.3 스왑니스(Swappiness) 조정

```c
// swappiness_analysis.c
#include <stdio.h>
#include <stdlib.h>

void analyze_swappiness() {
    printf("=== 스왑니스 분석 ===\n\n");

    // 현재 스왑니스 값 읽기
    FILE* swappiness_file = fopen("/proc/sys/vm/swappiness", "r");
    int swappiness;
    fscanf(swappiness_file, "%d", &swappiness);
    fclose(swappiness_file);

    printf("현재 스왑니스: %d\n", swappiness);

    printf("\n스왑니스 값의 의미:\n");
    printf("  0:   스왑을 최대한 피함 (OOM 위험 증가)\n");
    printf("  10:  성능 우선 (서버 권장값)\n");
    printf("  60:  균형잡힌 설정 (기본값)\n");
    printf("  100: 적극적 스왑 사용\n");

    printf("\n워크로드별 권장 설정:\n");
    printf("• 데이터베이스 서버: 1-10\n");
    printf("• 웹 서버: 10-30\n");
    printf("• 데스크톱: 30-60\n");
    printf("• 배치 처리: 60-100\n");

    printf("\n설정 변경:\n");
    printf("  즉시 적용: echo 10 > /proc/sys/vm/swappiness\n");
    printf("  영구 적용: echo 'vm.swappiness=10' >> /etc/sysctl.conf\n");

    // 메모리 압박 시뮬레이션
    printf("\n메모리 압박 상황에서의 동작:\n");
    if (swappiness <= 10) {
        printf("• 페이지 캐시 먼저 해제\n");
        printf("• 익명 페이지 스왑 최소화\n");
        printf("• 성능 중시, OOM 위험 상승\n");
    } else if (swappiness <= 60) {
        printf("• 페이지 캐시와 익명 페이지 균형 해제\n");
        printf("• 적당한 스왑 사용\n");
        printf("• 균형잡힌 접근\n");
    } else {
        printf("• 익명 페이지 적극적 스왑 아웃\n");
        printf("• 페이지 캐시 유지 우선\n");
        printf("• 처리량 중시\n");
    }
}

int main() {
    analyze_swappiness();
    return 0;
}
```

## 2. 페이지 교체 알고리즘

### 2.1 운영체제는 어떤 페이지를 스왑할까?

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

### 2.2 리눅스의 실제 페이지 교체: LRU 근사

```c
// linux_lru_approximation.c
#include <stdio.h>
#include <stdint.h>

void explain_linux_lru() {
    printf("=== 리눅스의 LRU 근사 알고리즘 ===\n\n");

    printf("완벽한 LRU의 문제점:\n");
    printf("• 모든 페이지 접근마다 타임스탬프 업데이트\n");
    printf("• 오버헤드가 너무 큼\n");
    printf("• 확장성 문제\n\n");

    printf("리눅스의 해결책: Two-List Strategy\n");
    printf("1. Active List: 최근 활발히 사용된 페이지들\n");
    printf("2. Inactive List: 덜 활발한 페이지들\n\n");

    printf("페이지 이동 규칙:\n");
    printf("• 새 페이지 → Inactive List\n");
    printf("• Inactive에서 재접근 → Active List로 승격\n");
    printf("• Active에서 오래 미사용 → Inactive로 강등\n");
    printf("• 스왑 아웃 → Inactive List 끝에서 선택\n\n");

    printf("Access Bit 활용:\n");
    printf("• 하드웨어가 페이지 접근 시 자동 설정\n");
    printf("• 주기적으로 커널이 확인 후 클리어\n");
    printf("• 실제 접근 패턴 근사\n\n");

    printf("age 기반 정리:\n");
    printf("• 페이지마다 age 값 유지\n");
    printf("• 접근 시 age 증가\n");
    printf("• 시간 경과 시 age 감소\n");
    printf("• age가 0이 되면 교체 대상\n");

    printf("\n실제 확인 방법:\n");
    printf("• /proc/meminfo에서 Active/Inactive 확인\n");
    printf("• /proc/vmstat에서 페이징 통계 확인\n");
    printf("• sar -B로 실시간 모니터링\n");
}

int main() {
    explain_linux_lru();
    return 0;
}
```

## 3. 대용량 페이지: 더 큰 레고 블록

### 3.1 왜 Huge Pages인가?

현대 서버 환경에서 Huge Pages는 필수적인 성능 최적화 기법입니다:

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

int main() {
    compare_page_sizes();
    benchmark_huge_pages();
    return 0;
}
```

### 3.2 Huge Pages 설정과 관리

```bash
# Huge Pages 상태 확인
$ cat /proc/meminfo | grep -i huge
HugePages_Total:       0
HugePages_Free:        0
HugePages_Rsvd:        0
HugePages_Surp:        0
Hugepagesize:       2048 kB

# Huge Pages 할당 (2MB 페이지 1024개 = 2GB)
$ echo 1024 > /proc/sys/vm/nr_hugepages

# 영구 설정
$ echo 'vm.nr_hugepages=1024' >> /etc/sysctl.conf

# Transparent Huge Pages (THP) 확인
$ cat /sys/kernel/mm/transparent_hugepage/enabled
[always] madvise never

# THP 설정 변경
$ echo madvise > /sys/kernel/mm/transparent_hugepage/enabled
```

### 3.3 Transparent Huge Pages (THP) 최적화

```c
// thp_optimization.c
#include <stdio.h>
#include <sys/mman.h>
#include <string.h>

void demonstrate_thp() {
    printf("=== Transparent Huge Pages 데모 ===\n\n");

    size_t size = 20 * 1024 * 1024;  // 20MB (2MB의 배수)
    char* buffer = mmap(NULL, size,
                       PROT_READ | PROT_WRITE,
                       MAP_PRIVATE | MAP_ANONYMOUS,
                       -1, 0);

    if (buffer == MAP_FAILED) {
        perror("mmap failed");
        return;
    }

    printf("20MB 메모리 영역 할당: %p\n", buffer);

    // THP 사용 권장
    if (madvise(buffer, size, MADV_HUGEPAGE) == 0) {
        printf("THP 사용 힌트 제공 성공\n");
    } else {
        printf("THP 힌트 실패 (권한 또는 지원 문제)\n");
    }

    // 메모리 초기화 (실제 할당 발생)
    printf("메모리 초기화 중...\n");
    memset(buffer, 0x42, size);

    printf("THP 상태 확인:\n");
    system("cat /proc/meminfo | grep -E '(AnonHugePages|HugePages_|Hugepagesize)'");

    // 정리
    munmap(buffer, size);
    printf("\nTHP 최적화 팁:\n");
    printf("• 2MB 단위로 메모리 할당\n");
    printf("• madvise(MADV_HUGEPAGE) 사용\n");
    printf("• 대용량 연속 메모리 접근 패턴\n");
    printf("• fork() 후 exec() 빠른 호출\n");
}

int main() {
    demonstrate_thp();
    return 0;
}
```

## 4. NUMA와 메모리 최적화

### 4.1 NUMA 시스템에서의 메모리 관리

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

# NUMA 통계 확인
$ numastat
                           node0           node1
numa_hit                 8234567         7845231
numa_miss                  12345           23456
numa_foreign               23456           12345
interleave_hit             45678           56789
local_node               8222222         7821775
other_node                 12345           23456

# 특정 NUMA 노드에서 프로세스 실행
$ numactl --cpunodebind=0 --membind=0 ./memory_intensive_app
```

### 4.2 NUMA 최적화 프로그래밍

```c
// numa_optimization.c
#include <stdio.h>
#include <stdlib.h>
#include <numa.h>
#include <numaif.h>

void numa_memory_optimization() {
    printf("=== NUMA 메모리 최적화 ===\n\n");

    // NUMA 가용성 확인
    if (numa_available() == -1) {
        printf("NUMA 지원되지 않음\n");
        return;
    }

    int num_nodes = numa_num_configured_nodes();
    printf("NUMA 노드 수: %d\n", num_nodes);

    // 현재 노드 확인
    int current_node = numa_node_of_cpu(sched_getcpu());
    printf("현재 CPU의 NUMA 노드: %d\n", current_node);

    // 로컬 메모리 할당
    size_t size = 100 * 1024 * 1024;  // 100MB
    void* local_memory = numa_alloc_local(size);
    printf("로컬 메모리 할당: %p\n", local_memory);

    // 특정 노드에 메모리 할당
    void* node0_memory = numa_alloc_onnode(size, 0);
    printf("노드 0 메모리 할당: %p\n", node0_memory);

    // 인터리브 메모리 할당 (여러 노드 분산)
    void* interleaved = numa_alloc_interleaved(size);
    printf("인터리브 메모리 할당: %p\n", interleaved);

    // 메모리 정책 확인
    int policy;
    unsigned long nodemask;
    if (get_mempolicy(&policy, &nodemask, sizeof(nodemask), 
                      local_memory, MPOL_F_ADDR) == 0) {
        printf("메모리 정책: %d, 노드마스크: 0x%lx\n", policy, nodemask);
    }

    printf("\nNUMA 최적화 가이드라인:\n");
    printf("• CPU와 같은 노드의 메모리 사용\n");
    printf("• 큰 데이터는 인터리브로 분산\n");
    printf("• 스레드를 특정 노드에 바인딩\n");
    printf("• 원격 메모리 접근 최소화\n");

    // 정리
    numa_free(local_memory, size);
    numa_free(node0_memory, size);
    numa_free(interleaved, size);
}

int main() {
    numa_memory_optimization();
    return 0;
}
```

## 5. 실무 메모리 최적화 전략

### 5.1 데이터베이스 워크로드 최적화

```bash
# MySQL/PostgreSQL용 Huge Pages 설정
echo 2048 > /proc/sys/vm/nr_hugepages
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo 1 > /proc/sys/vm/swappiness

# Java 애플리케이션용 설정
export JAVA_OPTS="-XX:+UseLargePages -XX:LargePageSizeInBytes=2m"
export JAVA_OPTS="$JAVA_OPTS -XX:+AlwaysPreTouch"
```

### 5.2 고성능 컴퓨팅 최적화

```c
// hpc_memory_optimization.c
#include <stdio.h>
#include <sys/mman.h>
#include <time.h>

void hpc_optimization_patterns() {
    printf("=== HPC 메모리 최적화 패턴 ===\n\n");

    printf("1. 대용량 연속 할당:\n");
    size_t size = 1024 * 1024 * 1024;  // 1GB
    void* buffer = mmap(NULL, size,
                       PROT_READ | PROT_WRITE,
                       MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB,
                       -1, 0);

    if (buffer != MAP_FAILED) {
        printf("   ✓ 1GB Huge Pages 할당 성공\n");
        
        // 미리 페이지 할당 (프리페치)
        madvise(buffer, size, MADV_WILLNEED);
        printf("   ✓ 메모리 프리페치 완료\n");

        munmap(buffer, size);
    }

    printf("\n2. NUMA 인식 할당:\n");
    printf("   • CPU 바인딩과 메모리 노드 동기화\n");
    printf("   • First-touch policy 활용\n");
    printf("   • 작업 단위별 메모리 분할\n");

    printf("\n3. 캐시 최적화:\n");
    printf("   • 64B 캐시 라인 정렬\n");
    printf("   • False sharing 방지\n");
    printf("   • Prefetch 활용\n");

    printf("\n4. 스왑 완전 비활성화:\n");
    printf("   • echo 0 > /proc/sys/vm/swappiness\n");
    printf("   • mlockall()로 메모리 고정\n");
    printf("   • OOM killer 대신 직접 메모리 관리\n");
}

int main() {
    hpc_optimization_patterns();
    return 0;
}
```

### 5.3 실시간 시스템 최적화

```c
// realtime_memory_optimization.c
#include <stdio.h>
#include <sys/mman.h>
#include <sys/resource.h>

void realtime_memory_setup() {
    printf("=== 실시간 시스템 메모리 설정 ===\n\n");

    // 1. 모든 메모리 잠금
    if (mlockall(MCL_CURRENT | MCL_FUTURE) == 0) {
        printf("✓ 모든 메모리 잠금 성공\n");
    } else {
        printf("✗ 메모리 잠금 실패\n");
    }

    // 2. 스택 크기 제한 해제
    struct rlimit rlim;
    rlim.rlim_cur = RLIM_INFINITY;
    rlim.rlim_max = RLIM_INFINITY;
    if (setrlimit(RLIMIT_STACK, &rlim) == 0) {
        printf("✓ 스택 크기 제한 해제\n");
    }

    // 3. 힙 사전 할당
    size_t heap_size = 100 * 1024 * 1024;  // 100MB
    void* heap_buffer = mmap(NULL, heap_size,
                            PROT_READ | PROT_WRITE,
                            MAP_PRIVATE | MAP_ANONYMOUS | MAP_LOCKED,
                            -1, 0);

    if (heap_buffer != MAP_FAILED) {
        printf("✓ 힙 사전 할당 완료 (%zu MB)\n", heap_size >> 20);

        // 모든 페이지를 미리 터치
        char* ptr = (char*)heap_buffer;
        for (size_t i = 0; i < heap_size; i += 4096) {
            ptr[i] = 0;
        }
        printf("✓ 페이지 프리터치 완료\n");

        munmap(heap_buffer, heap_size);
    }

    printf("\n실시간 시스템 체크리스트:\n");
    printf("• mlockall()으로 메모리 고정\n");
    printf("• Huge Pages 사용으로 TLB 미스 최소화\n");
    printf("• 스왑 완전 비활성화\n");
    printf("• NUMA 바인딩으로 지연시간 최소화\n");
    printf("• 인터럽트 바인딩으로 캐시 일관성 유지\n");
}

int main() {
    realtime_memory_setup();
    return 0;
}
```

## 핵심 요점

### 1. 스왑의 현명한 활용

- 메모리 부족 시 마지막 안전장치 역할
- 스왑니스 조정으로 워크로드별 최적화
- 페이지 교체 알고리즘의 이해가 성능 튜닝 핵심

### 2. Huge Pages의 위력

- TLB 미스 대폭 감소로 성능 향상
- 메모리 집약적 애플리케이션의 필수 기법
- Transparent Huge Pages로 자동 최적화 가능

### 3. NUMA 인식 프로그래밍

- CPU와 메모리의 물리적 위치 고려
- 로컬 메모리 접근으로 지연시간 최소화
- 대규모 시스템에서 확장성 확보

### 4. 실무 최적화 전략

- 워크로드별 맞춤 설정
- 실시간 시스템의 엄격한 메모리 관리
- 모니터링과 튜닝의 지속적 순환

---

**이전**: [페이지 폴트와 TLB](chapter-03-memory-system/03-14-page-fault-tlb.md)  
**다음**: [가상 메모리 개요](chapter-03-memory-system/03-12-virtual-memory.md)로 돌아가서 전체 내용을 정리하거나, [메모리 매핑과 공유 메모리](chapter-03-memory-system/03-16-memory-mapping.md)에서 고급 메모리 기법을 학습합니다.

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

`swap`, `huge_pages`, `numa`, `memory_optimization`, `performance_tuning`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
