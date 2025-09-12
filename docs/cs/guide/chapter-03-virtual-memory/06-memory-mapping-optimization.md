---
tags:
  - VirtualMemory
  - mmap
  - Performance
  - FileIO
  - madvise
---

# 3-6: 메모리 매핑 최적화 - "대용량 파일 처리가 느려요"

## 이 문서를 읽으면 답할 수 있는 질문들

- mmap과 read/write 중 언제 어느 것을 써야 하나요?
- madvise 패턴을 어떻게 활용하나요?
- huge pages가 성능에 주는 실질적 효과는?
- NUMA 환경에서 메모리 바인딩을 어떻게 하나요?
- 대용량 파일 처리 시 메모리 효율성을 높이는 방법은?

## 들어가며: 대용량 데이터의 딜레마

"1GB 로그 파일을 분석하는데 왜 이렇게 느릴까?"

대용량 파일 처리는 모든 Backend 개발자가 마주하는 도전입니다. 잘못된 접근 방식은 시스템을 마비시킬 수 있습니다.

```mermaid
sequenceDiagram
    participant App as 애플리케이션
    participant OS as 운영체제
    participant Disk as 디스크
    participant RAM as 물리 메모리
    
    Note over App,RAM: 일반적인 read() 방식
    App->>OS: read(fd, buffer, size)
    OS->>Disk: 디스크에서 데이터 읽기
    Disk-->>OS: 데이터 반환
    OS->>RAM: 커널 버퍼에 복사
    OS->>App: 유저 버퍼로 복사 (2번째 복사!)
    
    Note over App,RAM: mmap 방식
    App->>OS: mmap(addr, len, prot, flags, fd, offset)
    OS-->>App: 가상 주소 반환 (실제 읽기 없음)
    App->>RAM: 메모리 주소 접근
    Note over OS,Disk: 페이지 폴트 발생 시에만, 디스크 읽기 (지연 로딩)
```text

**mmap의 핵심 장점**:

1. **Zero-copy**: 불필요한 메모리 복사 제거
2. **지연 로딩**: 실제 접근하는 부분만 읽기
3. **공유 가능**: 여러 프로세스가 동일 파일 공유
4. **캐시 효율성**: 페이지 캐시 직접 활용

## 1. mmap vs read/write 성능 비교

### 1.1 선택 기준과 실제 성능

```mermaid
graph TD
    DECISION{파일 처리 방식 선택} --> SIZE[파일 크기]
    DECISION --> PATTERN[접근 패턴]
    DECISION --> SHARING[공유 필요성]
    
    SIZE -->|작음 1MB미만| READ[read/write 시스템콜 오버헤드 적음]
    SIZE -->|큼 100MB이상| MMAP[mmap 가상메모리 활용]
    
    PATTERN -->|순차| READ_SEQ[read + 큰버퍼 prefetch효과]
    PATTERN -->|랜덤| MMAP_RANDOM[mmap 필요한부분만 로드]
    
    SHARING -->|단독 사용| BOTH[둘 다 가능]
    SHARING -->|다중 프로세스| MMAP_SHARED[mmap공유 메모리효율성]
    
    style MMAP fill:#c8e6c9
    style READ fill:#fff3e0
```text

### 1.2 성능 벤치마크 코드

실제로 어떤 차이가 있는지 측정해봅시다:

```c
// file_access_benchmark.c - mmap vs read/write 성능 비교
#include <stdio.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <sys/time.h>

#define FILE_SIZE (256 * 1024 * 1024)  // 256MB로 축소
#define BUFFER_SIZE (64 * 1024)

double get_time() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

// 1. read() 방식: 커널-유저 공간 복사 발생
void test_read_method(const char *filename) {
    printf("=== read() 시스템 콜 방식 ===, ");
    
    int fd = open(filename, O_RDONLY);
    char *buffer = malloc(BUFFER_SIZE);
    double start = get_time();
    
    size_t total = 0;
    ssize_t bytes;
    while ((bytes = read(fd, buffer, BUFFER_SIZE)) > 0) {
        total += bytes;
        // 실제 처리 시뮬레이션: 매 1KB마다 접근
        for (int i = 0; i < bytes; i += 1024) {
            volatile char c = buffer[i];  // CPU 캐시 효과 제거
        }
    }
    
    double elapsed = get_time() - start;
    printf("  처리량: %zu MB, 시간: %.3f초, 속도: %.1f MB/s, ",
           total / 1024 / 1024, elapsed, (total / 1024.0 / 1024.0) / elapsed);
    
    free(buffer);
    close(fd);
}

// 2. mmap() 방식: 가상 메모리 직접 매핑
void test_mmap_method(const char *filename) {
    printf(", === mmap() 메모리 매핑 방식 ===, ");
    
    int fd = open(filename, O_RDONLY);
    struct stat st;
    fstat(fd, &st);
    
    double start = get_time();
    
    // 파일을 가상 메모리에 직접 매핑 (zero-copy)
    char *mapped = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    
    // 페이지 단위 접근으로 page fault 유발
    for (size_t i = 0; i < st.st_size; i += 1024) {
        volatile char c = mapped[i];  // 지연 로딩 트리거
    }
    
    double elapsed = get_time() - start;
    printf("  처리량: %ld MB, 시간: %.3f초, 속도: %.1f MB/s, ",
           st.st_size / 1024 / 1024, elapsed, 
           (st.st_size / 1024.0 / 1024.0) / elapsed);
    
    munmap(mapped, st.st_size);
    close(fd);
}

// 3. 랜덤 접근 패턴에서 mmap의 장점
void test_random_access(const char *filename) {
    printf(", === 랜덤 접근 성능 비교 ===, ");
    
    int fd = open(filename, O_RDONLY);
    struct stat st;
    fstat(fd, &st);
    
    char *mapped = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    
    double start = get_time();
    srand(42);  // 재현 가능한 결과
    
    // 10만 번의 랜덤 위치 접근 - 필요한 페이지만 로드
    const int accesses = 100000;
    for (int i = 0; i < accesses; i++) {
        size_t offset = rand() % (st.st_size - 1024);
        volatile char c = mapped[offset];
    }
    
    double elapsed = get_time() - start;
    printf("  랜덤 접근: %d회, 시간: %.3f초, 속도: %.0f ops/s, ",
           accesses, elapsed, accesses / elapsed);
    
    munmap(mapped, st.st_size);
    close(fd);
}

// 간단한 테스트 파일 생성
void create_test_file(const char *filename) {
    printf("테스트 파일 생성 중..., ");
    int fd = open(filename, O_CREAT | O_WRONLY | O_TRUNC, 0644);
    
    char buffer[BUFFER_SIZE];
    memset(buffer, 'T', BUFFER_SIZE);  // 'T'로 채움
    
    for (size_t written = 0; written < FILE_SIZE; written += BUFFER_SIZE) {
        write(fd, buffer, BUFFER_SIZE);
    }
    
    close(fd);
    printf("테스트 파일 생성 완료 (%d MB), ", FILE_SIZE / 1024 / 1024);
}

int main() {
    const char *test_file = "/tmp/mmap_benchmark";
    
    create_test_file(test_file);
    
    test_read_method(test_file);
    test_mmap_method(test_file);
    test_random_access(test_file);
    
    unlink(test_file);
    return 0;
}
```text

**실행 결과 예시**:

```bash
$ gcc -O2 file_access_benchmark.c -o benchmark
$ ./benchmark

=== 순차 읽기 테스트 ===
read() 방식:
  읽은 데이터: 1024 MB
  소요 시간: 3.245 초
  처리 속도: 315.4 MB/s

=== mmap 순차 접근 테스트 ===
mmap() 방식:
  매핑 크기: 1024 MB
  소요 시간: 2.156 초
  처리 속도: 475.0 MB/s    # 50% 더 빠름!

=== mmap 랜덤 접근 테스트 ===
mmap() 랜덤 접근:
  접근 횟수: 100000
  소요 시간: 0.234 초
  초당 접근: 427350 ops/s
```text

## 2. madvise 패턴 활용

### 2.1 madvise로 성능 힌트 제공

운영체제에게 메모리 사용 패턴을 알려줘서 최적화를 도울 수 있습니다:

```mermaid
graph LR
    subgraph "madvise 패턴들"
        SEQUENTIAL[MADV_SEQUENTIAL, 순차 접근 예정, → 적극적 prefetch]
        RANDOM[MADV_RANDOM, 랜덤 접근 예정, → prefetch 비활성화]
        WILLNEED[MADV_WILLNEED, 곧 사용 예정, → 미리 로드]
        DONTNEED[MADV_DONTNEED, 더 이상 불필요, → 캐시에서 제거]
    end
    
    subgraph "성능 효과"
        SEQUENTIAL --> PREFETCH[읽기 성능 향상, 캐시 히트율 증가]
        RANDOM --> EFFICIENT[불필요한 prefetch 방지, 메모리 절약]
        WILLNEED --> PRELOAD[접근 전 미리 로드, 지연시간 단축]
        DONTNEED --> MEMORY[메모리 확보, 다른 프로세스 도움]
    end
```text

### 2.2 실무 madvise 활용 예제

```c
// madvise_optimization.c - 메모리 접근 패턴 최적화
#include <stdio.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>

double get_time() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

// 1. 순차 접근 패턴 최적화
void test_sequential_with_hints(const char *filename) {
    printf("=== MADV_SEQUENTIAL + WILLNEED/DONTNEED ===, ");
    
    int fd = open(filename, O_RDONLY);
    struct stat st;
    fstat(fd, &st);
    
    char *mapped = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    
    // 핵심: OS에게 순차 접근 패턴 알림 -> 적극적 prefetch
    madvise(mapped, st.st_size, MADV_SEQUENTIAL);
    
    double start = get_time();
    const size_t chunk_size = 64 * 1024;  // 64KB 청크
    
    for (size_t offset = 0; offset < st.st_size; offset += chunk_size) {
        size_t size = (offset + chunk_size > st.st_size) ? 
                      (st.st_size - offset) : chunk_size;
        
        // 미리 prefetch 요청 - 지연시간 줄임
        madvise(mapped + offset, size, MADV_WILLNEED);
        
        // 체크섬 계산 (실제 데이터 처리 시뮬레이션)
        unsigned char checksum = 0;
        for (size_t i = 0; i < size; i++) {
            checksum ^= mapped[offset + i];
        }
        
        // 처리 완료된 이전 청크는 캐시에서 제거
        if (offset >= chunk_size) {
            madvise(mapped + offset - chunk_size, chunk_size, MADV_DONTNEED);
        }
        
        printf("\r진행률: %.1f%%", (double)offset / st.st_size * 100);
        fflush(stdout);
    }
    
    double elapsed = get_time() - start;
    printf(", 순차 처리 완료: %.3f초 (%.1f MB/s), ",
           elapsed, (st.st_size / 1024.0 / 1024.0) / elapsed);
    
    munmap(mapped, st.st_size);
    close(fd);
}

// 2. 랜덤 접근 패턴 최적화
void test_random_with_hints(const char *filename) {
    printf(", === MADV_RANDOM - prefetch 비활성화 ===, ");
    
    int fd = open(filename, O_RDONLY);
    struct stat st;
    fstat(fd, &st);
    
    char *mapped = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    
    // 핵심: 랜덤 접근 패턴 알림 -> 불필요한 prefetch 비활성화
    madvise(mapped, st.st_size, MADV_RANDOM);
    
    double start = get_time();
    srand(42);
    const int accesses = 50000;
    
    for (int i = 0; i < accesses; i++) {
        size_t offset = rand() % (st.st_size - 4096);
        
        // 해당 페이지만 미리 로드 요청
        madvise(mapped + offset, 4096, MADV_WILLNEED);
        
        volatile char data = mapped[offset];  // 실제 데이터 접근
        
        if (i % 10000 == 0) {
            printf("\r랜덤 접근: %d/%d", i, accesses);
            fflush(stdout);
        }
    }
    
    double elapsed = get_time() - start;
    printf(", 랜덤 접근 완료: %.3f초 (%.0f ops/s), ",
           elapsed, accesses / elapsed);
    
    munmap(mapped, st.st_size);
    close(fd);
}

// 3. 메모리 압박 상황에서 MADV_DONTNEED 활용
void demonstrate_memory_cleanup() {
    printf(", === MADV_DONTNEED - 메모리 정리 ===, ");
    
    const size_t size = 128 * 1024 * 1024;  // 128MB
    void *memory = malloc(size);
    
    // 메모리를 채워서 물리 페이지 할당 유도
    memset(memory, 1, size);
    printf("메모리 할당 및 초기화 완료 (128MB), ");
    
    // 잠시 후 이 메모리를 더 이상 사용하지 않음
    sleep(1);
    
    // OS에게 이 메모리를 스왑/캐시에서 제거해도 된다고 알리기
    if (madvise(memory, size, MADV_DONTNEED) == 0) {
        printf("MADV_DONTNEED 성공 - 물리 메모리 확보, ");
    }
    
    // 메모리 상태 확인
    system("echo '사용 가능 메모리:'; grep MemAvailable /proc/meminfo");
    
    free(memory);
    printf("메모리 해제 완료, ");
}

int main(int argc, char *argv[]) {
    if (argc != 2) {
        printf("Usage: %s <test_file>, ", argv[0]);
        return 1;
    }
    
    test_sequential_with_hints(argv[1]);
    test_random_with_hints(argv[1]);
    demonstrate_memory_cleanup();
    
    return 0;
}
```text

## 3. Huge Pages 활용

### 3.1 Huge Pages의 성능 효과

일반적인 4KB 페이지 대신 2MB 또는 1GB 페이지를 사용하면 TLB 효율성이 크게 향상됩니다:

```mermaid
graph LR
    subgraph "일반 페이지 (4KB)"
        NORMAL_DATA[1GB 데이터] --> NORMAL_PAGES[256,000개, 4KB 페이지]
        NORMAL_PAGES --> NORMAL_TLB[TLB 엔트리, 256,000개 필요]
        NORMAL_TLB --> NORMAL_MISS[TLB 미스, 빈번 발생]
    end
    
    subgraph "Huge 페이지 (2MB)"
        HUGE_DATA[1GB 데이터] --> HUGE_PAGES[512개, 2MB 페이지]
        HUGE_PAGES --> HUGE_TLB[TLB 엔트리, 512개만 필요]
        HUGE_TLB --> HUGE_HIT[TLB 히트, 성능 향상]
    end
    
    style HUGE_HIT fill:#c8e6c9
    style NORMAL_MISS fill:#ffcccb
```text

### 3.2 Huge Pages 설정과 사용

```bash
#!/bin/bash
# hugepages_setup.sh

echo "=== Huge Pages 설정 및 테스트 ==="

# 현재 Huge Pages 상태 확인
echo "1. 현재 Huge Pages 상태:"
grep -E "HugePages|Hugepagesize" /proc/meminfo

# Transparent Huge Pages 상태 확인
echo -e ", 2. THP 상태:"
cat /sys/kernel/mm/transparent_hugepage/enabled
cat /sys/kernel/mm/transparent_hugepage/defrag

# 2MB Huge Pages 예약 (root 권한 필요)
if [ "$EUID" -eq 0 ]; then
    echo -e ", 3. 100개 2MB Huge Pages 예약..."
    echo 100 > /proc/sys/vm/nr_hugepages
    
    # 결과 확인
    grep HugePages_Total /proc/meminfo
    
    # Huge Pages 파일시스템 마운트
    if ! mountpoint -q /mnt/hugepages; then
        mkdir -p /mnt/hugepages
        mount -t hugetlbfs none /mnt/hugepages
        echo "Huge Pages 파일시스템 마운트 완료: /mnt/hugepages"
    fi
else
    echo "root 권한이 필요합니다 (sudo 사용)"
fi
```text

**Huge Pages 성능 테스트**:

```c
// hugepages_benchmark.c
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/time.h>
#include <fcntl.h>
#include <unistd.h>

#define ARRAY_SIZE (512 * 1024 * 1024)  // 512MB
#define HUGEPAGE_SIZE (2 * 1024 * 1024)  // 2MB

double get_time() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

void test_normal_pages() {
    printf("=== 일반 페이지 (4KB) 테스트 ===, ");
    
    // 일반 malloc 할당
    char *array = malloc(ARRAY_SIZE);
    if (!array) {
        perror("malloc failed");
        return;
    }
    
    double start = get_time();
    
    // 랜덤 메모리 접근으로 TLB 미스 유발
    srand(42);
    const int accesses = 1000000;
    
    for (int i = 0; i < accesses; i++) {
        int idx = rand() % (ARRAY_SIZE - 64);
        array[idx] = i % 256;
        
        // 캐시 라인 전체 접근
        for (int j = 0; j < 64; j += 8) {
            volatile char c = array[idx + j];
        }
    }
    
    double end = get_time();
    
    printf("일반 페이지 결과:, ");
    printf("  소요 시간: %.3f 초, ", end - start);
    printf("  초당 접근: %.0f ops/s, ", accesses / (end - start));
    
    free(array);
}

void test_hugepages() {
    printf(", === Huge Pages (2MB) 테스트 ===, ");
    
    // Huge Pages 파일 생성
    int fd = open("/mnt/hugepages/test", O_CREAT | O_RDWR, 0755);
    if (fd < 0) {
        perror("hugepage file creation failed");
        printf("Huge Pages가 마운트되지 않았을 수 있습니다., ");
        return;
    }
    
    // Huge Pages로 메모리 매핑
    char *array = mmap(NULL, ARRAY_SIZE, PROT_READ | PROT_WRITE, 
                       MAP_SHARED, fd, 0);
    if (array == MAP_FAILED) {
        perror("hugepage mmap failed");
        close(fd);
        return;
    }
    
    double start = get_time();
    
    // 동일한 랜덤 접근 패턴
    srand(42);
    const int accesses = 1000000;
    
    for (int i = 0; i < accesses; i++) {
        int idx = rand() % (ARRAY_SIZE - 64);
        array[idx] = i % 256;
        
        // 캐시 라인 전체 접근
        for (int j = 0; j < 64; j += 8) {
            volatile char c = array[idx + j];
        }
    }
    
    double end = get_time();
    
    printf("Huge Pages 결과:, ");
    printf("  소요 시간: %.3f 초, ", end - start);
    printf("  초당 접근: %.0f ops/s, ", accesses / (end - start));
    
    munmap(array, ARRAY_SIZE);
    close(fd);
    unlink("/mnt/hugepages/test");
}

void test_thp_performance() {
    printf(", === Transparent Huge Pages 테스트 ===, ");
    
    // THP 활성화 후 큰 메모리 할당
    char *array = malloc(ARRAY_SIZE);
    if (!array) {
        perror("malloc failed");
        return;
    }
    
    // 메모리를 터치하여 THP 생성 유도
    for (size_t i = 0; i < ARRAY_SIZE; i += 4096) {
        array[i] = 1;
    }
    
    // THP 사용량 확인
    system("grep AnonHugePages /proc/meminfo");
    
    double start = get_time();
    
    // 순차 접근 테스트
    unsigned char checksum = 0;
    for (size_t i = 0; i < ARRAY_SIZE; i++) {
        checksum ^= array[i];
    }
    
    double end = get_time();
    
    printf("THP 순차 접근:, ");
    printf("  소요 시간: %.3f 초, ", end - start);
    printf("  처리 속도: %.1f MB/s, ", 
           (ARRAY_SIZE / 1024.0 / 1024.0) / (end - start));
    printf("  체크섬: 0x%02x, ", checksum);
    
    free(array);
}

int main() {
    test_normal_pages();
    test_hugepages();
    test_thp_performance();
    
    return 0;
}
```text

## 4. NUMA 최적화

### 4.1 NUMA 토폴로지 이해

```bash
# NUMA 정보 확인
$ numactl --hardware
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3 4 5 6 7
node 0 size: 32768 MB
node 0 free: 15234 MB
node distances:
node   0   1
  0:  10  21    # 로컬: 10, 원격: 21 (2.1배 느림)
  1:  21  10

$ lscpu | grep NUMA
NUMA node(s):          2
NUMA node0 CPU(s):     0-7
NUMA node1 CPU(s):     8-15
```text

### 4.2 NUMA 바인딩 최적화

```c
// numa_optimization.c
#include <stdio.h>
#include <stdlib.h>
#include <numa.h>
#include <numaif.h>
#include <sys/time.h>
#include <string.h>

double get_time() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

void test_local_memory_access() {
    printf("=== NUMA 로컬 메모리 접근 테스트 ===, ");
    
    if (numa_available() < 0) {
        printf("NUMA not available, ");
        return;
    }
    
    int num_nodes = numa_max_node() + 1;
    printf("NUMA 노드 수: %d, ", num_nodes);
    
    for (int node = 0; node < num_nodes; node++) {
        printf(", --- NUMA 노드 %d 테스트 ---, ", node);
        
        // 특정 NUMA 노드로 프로세스 바인딩
        struct bitmask *node_mask = numa_allocate_nodemask();
        numa_bitmask_setbit(node_mask, node);
        numa_bind(node_mask);
        
        // 해당 노드에서 메모리 할당
        size_t size = 128 * 1024 * 1024;  // 128MB
        void *memory = numa_alloc_onnode(size, node);
        if (!memory) {
            printf("메모리 할당 실패 (노드 %d), ", node);
            continue;
        }
        
        double start = get_time();
        
        // 메모리 접근 테스트
        char *buffer = (char*)memory;
        for (size_t i = 0; i < size; i += 4096) {
            buffer[i] = i % 256;
            volatile char c = buffer[i];  // 읽기
        }
        
        double end = get_time();
        
        printf("노드 %d 접근 성능: %.3f초 (%.1f MB/s), ", 
               node, end - start, 
               (size / 1024.0 / 1024.0) / (end - start));
        
        numa_free(memory, size);
        numa_bitmask_free(node_mask);
    }
    
    // 바인딩 해제
    numa_bind(numa_all_nodes_ptr);
}

void test_cross_node_access() {
    printf(", === NUMA 크로스 노드 접근 테스트 ===, ");
    
    if (numa_max_node() < 1) {
        printf("멀티 NUMA 시스템이 아닙니다., ");
        return;
    }
    
    // 노드 0에서 실행, 노드 1의 메모리에 접근
    struct bitmask *cpu_mask = numa_allocate_cpumask();
    struct bitmask *mem_mask = numa_allocate_nodemask();
    
    // CPU는 노드 0에 바인딩
    numa_bitmask_setbit(cpu_mask, 0);
    numa_sched_setaffinity(0, cpu_mask);
    
    // 메모리는 노드 1에서 할당
    size_t size = 128 * 1024 * 1024;
    void *remote_memory = numa_alloc_onnode(size, 1);
    
    if (remote_memory) {
        double start = get_time();
        
        char *buffer = (char*)remote_memory;
        for (size_t i = 0; i < size; i += 4096) {
            buffer[i] = i % 256;
            volatile char c = buffer[i];
        }
        
        double end = get_time();
        
        printf("크로스 노드 접근 성능: %.3f초 (%.1f MB/s), ",
               end - start, 
               (size / 1024.0 / 1024.0) / (end - start));
        
        numa_free(remote_memory, size);
    }
    
    numa_bitmask_free(cpu_mask);
    numa_bitmask_free(mem_mask);
}

void optimize_numa_allocation() {
    printf(", === NUMA 최적화 할당 전략 ===, ");
    
    // 현재 실행 중인 CPU의 NUMA 노드 확인
    int current_node = numa_node_of_cpu(sched_getcpu());
    printf("현재 CPU의 NUMA 노드: %d, ", current_node);
    
    // 로컬 노드에서 메모리 할당
    size_t size = 64 * 1024 * 1024;
    void *local_memory = numa_alloc_onnode(size, current_node);
    
    // 첫 번째 터치 정책 적용 (first-touch policy)
    char *buffer = (char*)local_memory;
    memset(buffer, 0, size);  // 로컬 노드에서 페이지 할당 보장
    
    printf("로컬 노드 메모리 할당 및 초기화 완료, ");
    
    // 메모리 정책 확인
    int policy;
    struct bitmask *node_mask = numa_allocate_nodemask();
    
    if (get_mempolicy(&policy, node_mask->maskp, node_mask->size, 
                     buffer, MPOL_F_ADDR) == 0) {
        printf("메모리 정책: ");
        switch (policy) {
            case MPOL_DEFAULT: printf("DEFAULT, "); break;
            case MPOL_BIND: printf("BIND, "); break;
            case MPOL_INTERLEAVE: printf("INTERLEAVE, "); break;
            case MPOL_PREFERRED: printf("PREFERRED, "); break;
            default: printf("UNKNOWN, "); break;
        }
    }
    
    numa_free(local_memory, size);
    numa_bitmask_free(node_mask);
}

int main() {
    test_local_memory_access();
    test_cross_node_access();
    optimize_numa_allocation();
    
    return 0;
}
```text

## 5. 실무 메모리 매핑 최적화 패턴

### 5.1 대용량 로그 파일 분석기

```python
#!/usr/bin/env python3
# log_analyzer.py - 효율적인 대용량 로그 분석

import mmap
import os
import re
import time
from collections import defaultdict, Counter

class EfficientLogAnalyzer:
    def __init__(self, filename, chunk_size=64*1024*1024):  # 64MB 청크
        self.filename = filename
        self.chunk_size = chunk_size
        self.stats = defaultdict(int)
        
    def analyze_with_mmap(self):
        """mmap을 사용한 효율적인 로그 분석"""
        print(f"mmap으로 로그 분석 시작: {self.filename}")
        
        start_time = time.time()
        
        with open(self.filename, 'rb') as f:
            # 파일 전체를 메모리에 매핑
            with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:
                file_size = len(mm)
                print(f"파일 크기: {file_size / 1024 / 1024:.1f} MB")
                
                # 순차 접근 힌트 (Python에서는 직접 지원 안 함)
                # 실제로는 madvise(mm, MADV_SEQUENTIAL) 필요
                
                processed = 0
                error_patterns = {
                    'error': re.compile(rb'ERROR'),
                    'warning': re.compile(rb'WARNING'),
                    'exception': re.compile(rb'Exception'),
                    'timeout': re.compile(rb'timeout', re.IGNORECASE)
                }
                
                # 청크 단위로 처리
                chunk_start = 0
                while chunk_start < file_size:
                    chunk_end = min(chunk_start + self.chunk_size, file_size)
                    
                    # 라인 경계까지 확장
                    if chunk_end < file_size:
                        while chunk_end < file_size and mm[chunk_end:chunk_end+1] != b', ':
                            chunk_end += 1
                        chunk_end += 1
                    
                    # 현재 청크 분석
                    chunk_data = mm[chunk_start:chunk_end]
                    
                    for pattern_name, pattern in error_patterns.items():
                        matches = len(pattern.findall(chunk_data))
                        self.stats[pattern_name] += matches
                    
                    # 라인 수 계산
                    self.stats['total_lines'] += chunk_data.count(b', ')
                    
                    processed += len(chunk_data)
                    progress = processed / file_size * 100
                    
                    print(f"\r진행률: {progress:.1f}%", end='', flush=True)
                    
                    chunk_start = chunk_end
        
        end_time = time.time()
        
        print(f", 분석 완료! 소요시간: {end_time - start_time:.3f}초")
        print("=== 분석 결과 ===")
        for key, value in self.stats.items():
            print(f"{key}: {value:,}")
        
        speed = file_size / 1024 / 1024 / (end_time - start_time)
        print(f"처리 속도: {speed:.1f} MB/s")

    def analyze_with_read(self):
        """일반 read()를 사용한 비교 분석"""
        print(f", 일반 read()로 로그 분석 시작: {self.filename}")
        
        start_time = time.time()
        stats = defaultdict(int)
        
        with open(self.filename, 'rb') as f:
            buffer_size = 64 * 1024  # 64KB 버퍼
            
            error_patterns = {
                'error': re.compile(rb'ERROR'),
                'warning': re.compile(rb'WARNING'),
                'exception': re.compile(rb'Exception'),
                'timeout': re.compile(rb'timeout', re.IGNORECASE)
            }
            
            processed = 0
            remainder = b''
            
            while True:
                chunk = f.read(buffer_size)
                if not chunk:
                    break
                
                # 이전 청크의 나머지와 합치기
                data = remainder + chunk
                
                # 마지막 라인 찾기
                last_newline = data.rfind(b', ')
                if last_newline != -1:
                    process_data = data[:last_newline + 1]
                    remainder = data[last_newline + 1:]
                else:
                    process_data = data
                    remainder = b''
                
                # 패턴 검색
                for pattern_name, pattern in error_patterns.items():
                    matches = len(pattern.findall(process_data))
                    stats[pattern_name] += matches
                
                stats['total_lines'] += process_data.count(b', ')
                processed += len(process_data)
                
                if processed % (10 * 1024 * 1024) == 0:  # 10MB마다 진행률 출력
                    print(f"\r처리된 데이터: {processed / 1024 / 1024:.1f} MB", 
                          end='', flush=True)
            
            # 마지막 나머지 처리
            if remainder:
                for pattern_name, pattern in error_patterns.items():
                    matches = len(pattern.findall(remainder))
                    stats[pattern_name] += matches
        
        end_time = time.time()
        
        print(f", 일반 read() 분석 완료! 소요시간: {end_time - start_time:.3f}초")
        print("=== 분석 결과 ===")
        for key, value in stats.items():
            print(f"{key}: {value:,}")

def create_test_log(filename, size_mb=100):
    """테스트용 로그 파일 생성"""
    print(f"테스트 로그 파일 생성: {filename} ({size_mb}MB)")
    
    log_templates = [
        "2023-12-01 10:00:{:02d} INFO [app] Processing request {}, ",
        "2023-12-01 10:00:{:02d} ERROR [db] Connection failed: {}, ", 
        "2023-12-01 10:00:{:02d} WARNING [cache] High memory usage: {}%, ",
        "2023-12-01 10:00:{:02d} DEBUG [auth] User {} authenticated, ",
        "2023-12-01 10:00:{:02d} FATAL [system] Exception in thread {}: timeout, "
    ]
    
    with open(filename, 'w') as f:
        target_size = size_mb * 1024 * 1024
        written = 0
        counter = 0
        
        while written < target_size:
            template = log_templates[counter % len(log_templates)]
            line = template.format(counter % 60, counter)
            f.write(line)
            written += len(line)
            counter += 1
    
    print(f"로그 파일 생성 완료: {os.path.getsize(filename) / 1024 / 1024:.1f}MB")

if __name__ == "__main__":
    test_file = "/tmp/test_large.log"
    
    # 테스트 로그 파일 생성 (100MB)
    create_test_log(test_file, 100)
    
    # 분석 비교
    analyzer = EfficientLogAnalyzer(test_file)
    analyzer.analyze_with_mmap()
    analyzer.analyze_with_read()
    
    # 정리
    os.unlink(test_file)
```text

### 5.2 스트리밍 데이터 처리

```c
// streaming_processor.c - 윈도우 슬라이딩으로 대용량 데이터 처리
#include <stdio.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <sys/time.h>

// 윈도우 슬라이딩 처리기 구조체
typedef struct {
    char *mapped_memory;  // 매핑된 메모리 주소
    size_t file_size;     // 전체 파일 크기
    size_t current_pos;   // 현재 처리 위치
    size_t window_size;   // 윈도우 크기
    int fd;
} stream_processor_t;

// 처리기 초기화 - mmap + madvise 힌트 설정
stream_processor_t* create_processor(const char *filename, size_t window_size) {
    stream_processor_t *proc = malloc(sizeof(stream_processor_t));
    
    proc->fd = open(filename, O_RDONLY);
    struct stat st;
    fstat(proc->fd, &st);
    
    proc->file_size = st.st_size;
    proc->window_size = window_size;
    proc->current_pos = 0;
    
    // 파일 전체를 메모리에 매핑
    proc->mapped_memory = mmap(NULL, proc->file_size, PROT_READ, MAP_PRIVATE, proc->fd, 0);
    
    // 핵심: 순차 접근 패턴 힌트 -> OS가 prefetch 최적화
    madvise(proc->mapped_memory, proc->file_size, MADV_SEQUENTIAL);
    
    return proc;
}

// 다음 윈도우 가져오기 + 메모리 힌트 관리
int get_next_window(stream_processor_t *proc, char **data, size_t *len) {
    if (proc->current_pos >= proc->file_size) return 0;  // 끝
    
    // 윈도우 크기 결정
    size_t remaining = proc->file_size - proc->current_pos;
    *len = (remaining < proc->window_size) ? remaining : proc->window_size;
    *data = proc->mapped_memory + proc->current_pos;
    
    // 성능 최적화: 미리 prefetch + 사용 완료된 영역 정리
    if (proc->current_pos + proc->window_size * 2 < proc->file_size) {
        // 다음 윈도우 2개를 미리 로드 요청
        madvise(*data + *len, proc->window_size * 2, MADV_WILLNEED);
    }
    
    if (proc->current_pos > proc->window_size) {
        // 이전 윈도우는 캐시에서 제거하여 메모리 절약
        madvise(*data - proc->window_size, proc->window_size, MADV_DONTNEED);
    }
    
    proc->current_pos += *len;
    return 1;  // 성공
}

// 대용량 데이터 윈도우 슬라이딩 처리
void process_large_file(const char *filename) {
    printf("=== 윈도우 슬라이딩 데이터 처리 ===, ");
    
    const size_t window_size = 2 * 1024 * 1024;  // 2MB 윈도우
    stream_processor_t *proc = create_processor(filename, window_size);
    
    printf("파일: %.1fMB, 윈도우: %.1fMB, ", 
           proc->file_size / 1024.0 / 1024.0, window_size / 1024.0 / 1024.0);
    
    double start = get_time();
    size_t total_processed = 0;
    int windows = 0;
    
    char *window_data;
    size_t window_len;
    
    // 윈도우별로 순차 처리
    while (get_next_window(proc, &window_data, &window_len)) {
        // 실제 데이터 처리: 체크섬 계산
        unsigned char checksum = 0;
        for (size_t i = 0; i < window_len; i++) {
            checksum ^= window_data[i];  // XOR 체크섬
        }
        
        total_processed += window_len;
        windows++;
        
        // 진행 상황 보고 (매 50개 윈도우마다)
        if (windows % 50 == 0) {
            double progress = (double)total_processed / proc->file_size * 100;
            printf("\r진행: %.1f%% (%d 윈도우, 체크섬: 0x%02x)", 
                   progress, windows, checksum);
            fflush(stdout);
        }
    }
    
    double elapsed = get_time() - start;
    
    printf(", 처리 완료!, ");
    printf("처리량: %.1fMB, 시간: %.3f초, 속도: %.1fMB/s, ",
           total_processed / 1024.0 / 1024.0, elapsed,
           (total_processed / 1024.0 / 1024.0) / elapsed);
    
    // 정리
    munmap(proc->mapped_memory, proc->file_size);
    close(proc->fd);
    free(proc);
}

int main(int argc, char *argv[]) {
    if (argc != 2) {
        printf("Usage: %s <large_file>, ", argv[0]);
        return 1;
    }
    
    process_large_file(argv[1]);
    return 0;
}
```text

## 6. 정리와 Best Practices

메모리 매핑 최적화는 대용량 데이터 처리에서 게임 체인저가 될 수 있습니다. 하지만 적절한 패턴과 힌트 제공이 핵심입니다.

### 6.1 메모리 매핑 최적화 체크리스트

**파일 크기별 전략**:

- [ ] <1MB: read/write 고려 (오버헤드 최소)
- [ ] 1MB-100MB: mmap 적용
- [ ] >100MB: mmap + madvise 힌트 필수
- [ ] >1GB: 청크 단위 처리 + 스트리밍

**접근 패턴별 최적화**:

- [ ] 순차 접근: MADV_SEQUENTIAL + 큰 윈도우
- [ ] 랜덤 접근: MADV_RANDOM + 작은 윈도우  
- [ ] 혼합 패턴: 동적 madvise 적용

**시스템 레벨 최적화**:

- [ ] Huge Pages 활용 고려
- [ ] NUMA 바인딩 최적화
- [ ] 적절한 페이지 캐시 크기 설정

### 6.2 성능 모니터링 지표

```bash
# 메모리 매핑 효율성 모니터링
watch -n 1 'echo "=== 페이지 폴트 ===" && \
cat /proc/vmstat | grep -E "(pgfault|pgmajfault)" && \
echo "=== 페이지 캐시 ===" && \
cat /proc/meminfo | grep -E "(Cached|Buffers|Dirty)" && \
echo "=== THP 사용량 ===" && \
cat /proc/meminfo | grep AnonHugePages'
```text

다음 섹션에서는 스왑 관리와 OOM 디버깅을 다뤄보겠습니다.

효율적인 메모리 매핑으로 대용량 데이터 처리 성능을 극대화해봅시다! 🚀
