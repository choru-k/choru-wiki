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
    Note over OS,Disk: 페이지 폴트 발생 시에만<br/>디스크 읽기 (지연 로딩)
```

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
    
    SIZE -->|작음 (<1MB)| READ[read/write<br/>시스템 콜 오버헤드 적음]
    SIZE -->|큼 (>100MB)| MMAP[mmap<br/>가상 메모리 활용]
    
    PATTERN -->|순차| READ_SEQ[read + 큰 버퍼<br/>prefetch 효과]
    PATTERN -->|랜덤| MMAP_RANDOM[mmap<br/>필요한 부분만 로드]
    
    SHARING -->|단독 사용| BOTH[둘 다 가능]
    SHARING -->|다중 프로세스| MMAP_SHARED[mmap 공유<br/>메모리 효율성]
    
    style MMAP fill:#c8e6c9
    style READ fill:#fff3e0
```

### 1.2 성능 벤치마크 코드

실제로 어떤 차이가 있는지 측정해봅시다:

```c
// file_access_benchmark.c
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/time.h>
#include <string.h>

#define FILE_SIZE (1024 * 1024 * 1024)  // 1GB
#define BUFFER_SIZE (64 * 1024)          // 64KB

double get_time() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

void create_test_file(const char *filename) {
    printf("테스트 파일 생성 중... (%dMB)\n", FILE_SIZE / 1024 / 1024);
    
    int fd = open(filename, O_CREAT | O_WRONLY | O_TRUNC, 0644);
    if (fd == -1) {
        perror("create file failed");
        exit(1);
    }
    
    char buffer[BUFFER_SIZE];
    memset(buffer, 'A', BUFFER_SIZE);
    
    for (size_t written = 0; written < FILE_SIZE; written += BUFFER_SIZE) {
        size_t to_write = (FILE_SIZE - written > BUFFER_SIZE) ? BUFFER_SIZE : (FILE_SIZE - written);
        write(fd, buffer, to_write);
    }
    
    close(fd);
    printf("테스트 파일 생성 완료: %s\n", filename);
}

void test_sequential_read(const char *filename) {
    printf("\n=== 순차 읽기 테스트 ===\n");
    
    int fd = open(filename, O_RDONLY);
    if (fd == -1) {
        perror("open failed");
        return;
    }
    
    char *buffer = malloc(BUFFER_SIZE);
    double start = get_time();
    
    ssize_t total_read = 0;
    ssize_t bytes_read;
    
    while ((bytes_read = read(fd, buffer, BUFFER_SIZE)) > 0) {
        total_read += bytes_read;
        // 실제 처리를 시뮬레이션 (간단한 체크섬)
        for (int i = 0; i < bytes_read; i += 1024) {
            volatile char c = buffer[i];  // 메모리 접근 강제
        }
    }
    
    double end = get_time();
    
    printf("read() 방식:\n");
    printf("  읽은 데이터: %ld MB\n", total_read / 1024 / 1024);
    printf("  소요 시간: %.3f 초\n", end - start);
    printf("  처리 속도: %.1f MB/s\n", (total_read / 1024.0 / 1024.0) / (end - start));
    
    free(buffer);
    close(fd);
}

void test_mmap_sequential(const char *filename) {
    printf("\n=== mmap 순차 접근 테스트 ===\n");
    
    int fd = open(filename, O_RDONLY);
    if (fd == -1) {
        perror("open failed");
        return;
    }
    
    struct stat st;
    if (fstat(fd, &st) == -1) {
        perror("fstat failed");
        close(fd);
        return;
    }
    
    double start = get_time();
    
    // 파일 전체를 메모리에 매핑
    char *mapped = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (mapped == MAP_FAILED) {
        perror("mmap failed");
        close(fd);
        return;
    }
    
    // 순차 접근으로 처리
    for (size_t i = 0; i < st.st_size; i += 1024) {
        volatile char c = mapped[i];  // 페이지 폴트 유발
    }
    
    double end = get_time();
    
    printf("mmap() 방식:\n");
    printf("  매핑 크기: %ld MB\n", st.st_size / 1024 / 1024);
    printf("  소요 시간: %.3f 초\n", end - start);
    printf("  처리 속도: %.1f MB/s\n", (st.st_size / 1024.0 / 1024.0) / (end - start));
    
    munmap(mapped, st.st_size);
    close(fd);
}

void test_mmap_random(const char *filename) {
    printf("\n=== mmap 랜덤 접근 테스트 ===\n");
    
    int fd = open(filename, O_RDONLY);
    struct stat st;
    fstat(fd, &st);
    
    char *mapped = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (mapped == MAP_FAILED) {
        perror("mmap failed");
        close(fd);
        return;
    }
    
    double start = get_time();
    
    // 랜덤 위치 100,000회 접근
    const int random_accesses = 100000;
    srand(42);  // 재현 가능한 결과를 위해
    
    for (int i = 0; i < random_accesses; i++) {
        size_t offset = rand() % (st.st_size - 1024);
        volatile char c = mapped[offset];
    }
    
    double end = get_time();
    
    printf("mmap() 랜덤 접근:\n");
    printf("  접근 횟수: %d\n", random_accesses);
    printf("  소요 시간: %.3f 초\n", end - start);
    printf("  초당 접근: %.0f ops/s\n", random_accesses / (end - start));
    
    munmap(mapped, st.st_size);
    close(fd);
}

int main() {
    const char *test_file = "/tmp/mmap_test_file";
    
    create_test_file(test_file);
    
    test_sequential_read(test_file);
    test_mmap_sequential(test_file);
    test_mmap_random(test_file);
    
    unlink(test_file);  // 테스트 파일 삭제
    
    return 0;
}
```

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
```

## 2. madvise 패턴 활용

### 2.1 madvise로 성능 힌트 제공

운영체제에게 메모리 사용 패턴을 알려줘서 최적화를 도울 수 있습니다:

```mermaid
graph LR
    subgraph "madvise 패턴들"
        SEQUENTIAL[MADV_SEQUENTIAL<br/>순차 접근 예정<br/>→ 적극적 prefetch]
        RANDOM[MADV_RANDOM<br/>랜덤 접근 예정<br/>→ prefetch 비활성화]
        WILLNEED[MADV_WILLNEED<br/>곧 사용 예정<br/>→ 미리 로드]
        DONTNEED[MADV_DONTNEED<br/>더 이상 불필요<br/>→ 캐시에서 제거]
    end
    
    subgraph "성능 효과"
        SEQUENTIAL --> PREFETCH[읽기 성능 향상<br/>캐시 히트율 증가]
        RANDOM --> EFFICIENT[불필요한 prefetch 방지<br/>메모리 절약]
        WILLNEED --> PRELOAD[접근 전 미리 로드<br/>지연시간 단축]
        DONTNEED --> MEMORY[메모리 확보<br/>다른 프로세스 도움]
    end
```

### 2.2 실무 madvise 활용 예제

```c
// madvise_optimization.c
#include <stdio.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#include <sys/time.h>

double get_time() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

void test_sequential_processing(const char *filename) {
    printf("=== 순차 처리 최적화 ===\n");
    
    int fd = open(filename, O_RDONLY);
    struct stat st;
    fstat(fd, &st);
    
    // 파일 전체 매핑
    char *mapped = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (mapped == MAP_FAILED) {
        perror("mmap failed");
        return;
    }
    
    // 순차 접근 패턴 힌트
    if (madvise(mapped, st.st_size, MADV_SEQUENTIAL) != 0) {
        perror("madvise SEQUENTIAL failed");
    }
    
    double start = get_time();
    
    // 순차적으로 처리
    const size_t chunk_size = 64 * 1024;  // 64KB씩 처리
    for (size_t offset = 0; offset < st.st_size; offset += chunk_size) {
        size_t size = (offset + chunk_size > st.st_size) ? 
                      (st.st_size - offset) : chunk_size;
        
        // 현재 청크를 곧 사용한다고 힌트
        madvise(mapped + offset, size, MADV_WILLNEED);
        
        // 실제 처리 (체크섬 계산 시뮬레이션)
        unsigned char checksum = 0;
        for (size_t i = 0; i < size; i++) {
            checksum ^= mapped[offset + i];
        }
        
        // 처리 완료된 이전 청크는 더 이상 필요 없음
        if (offset >= chunk_size) {
            madvise(mapped + offset - chunk_size, chunk_size, MADV_DONTNEED);
        }
        
        printf("\rProcessing: %.1f%%", (double)offset / st.st_size * 100);
        fflush(stdout);
    }
    
    double end = get_time();
    printf("\n순차 처리 완료: %.3f초 (%.1f MB/s)\n", 
           end - start, (st.st_size / 1024.0 / 1024.0) / (end - start));
    
    munmap(mapped, st.st_size);
    close(fd);
}

void test_random_access(const char *filename) {
    printf("\n=== 랜덤 접근 최적화 ===\n");
    
    int fd = open(filename, O_RDONLY);
    struct stat st;
    fstat(fd, &st);
    
    char *mapped = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (mapped == MAP_FAILED) {
        perror("mmap failed");
        return;
    }
    
    // 랜덤 접근 패턴 힌트 (prefetch 비활성화)
    if (madvise(mapped, st.st_size, MADV_RANDOM) != 0) {
        perror("madvise RANDOM failed");
    }
    
    double start = get_time();
    
    // 랜덤 접근 시뮬레이션
    srand(42);
    const int num_accesses = 50000;
    
    for (int i = 0; i < num_accesses; i++) {
        size_t offset = rand() % (st.st_size - 4096);
        
        // 해당 페이지를 곧 사용한다고 힌트
        madvise(mapped + offset, 4096, MADV_WILLNEED);
        
        // 데이터 접근
        volatile char data = mapped[offset];
        
        if (i % 10000 == 0) {
            printf("\rRandom accesses: %d/%d", i, num_accesses);
            fflush(stdout);
        }
    }
    
    double end = get_time();
    printf("\n랜덤 접근 완료: %.3f초 (%.0f ops/s)\n", 
           end - start, num_accesses / (end - start));
    
    munmap(mapped, st.st_size);
    close(fd);
}

void demonstrate_memory_pressure() {
    printf("\n=== 메모리 압박 상황 시뮬레이션 ===\n");
    
    // 큰 메모리 블록 할당
    const size_t size = 256 * 1024 * 1024;  // 256MB
    void *memory = malloc(size);
    if (!memory) {
        perror("malloc failed");
        return;
    }
    
    printf("256MB 메모리 할당 완료\n");
    
    // 메모리를 사용하여 페이지를 물리 메모리에 로드
    memset(memory, 1, size);
    printf("메모리 초기화 완료\n");
    
    // 잠시 대기
    sleep(2);
    
    // 이 메모리를 더 이상 사용하지 않는다고 힌트
    if (madvise(memory, size, MADV_DONTNEED) == 0) {
        printf("MADV_DONTNEED 적용 - 물리 메모리 확보\n");
    }
    
    // 시스템의 메모리 상태 확인
    system("grep -E 'MemFree|MemAvailable' /proc/meminfo");
    
    free(memory);
    printf("메모리 해제 완료\n");
}

int main(int argc, char *argv[]) {
    if (argc != 2) {
        printf("Usage: %s <test_file>\n", argv[0]);
        return 1;
    }
    
    test_sequential_processing(argv[1]);
    test_random_access(argv[1]);
    demonstrate_memory_pressure();
    
    return 0;
}
```

## 3. Huge Pages 활용

### 3.1 Huge Pages의 성능 효과

일반적인 4KB 페이지 대신 2MB 또는 1GB 페이지를 사용하면 TLB 효율성이 크게 향상됩니다:

```mermaid
graph LR
    subgraph "일반 페이지 (4KB)"
        NORMAL_DATA[1GB 데이터] --> NORMAL_PAGES[256,000개<br/>4KB 페이지]
        NORMAL_PAGES --> NORMAL_TLB[TLB 엔트리<br/>256,000개 필요]
        NORMAL_TLB --> NORMAL_MISS[TLB 미스<br/>빈번 발생]
    end
    
    subgraph "Huge 페이지 (2MB)"
        HUGE_DATA[1GB 데이터] --> HUGE_PAGES[512개<br/>2MB 페이지]
        HUGE_PAGES --> HUGE_TLB[TLB 엔트리<br/>512개만 필요]
        HUGE_TLB --> HUGE_HIT[TLB 히트<br/>성능 향상]
    end
    
    style HUGE_HIT fill:#c8e6c9
    style NORMAL_MISS fill:#ffcccb
```

### 3.2 Huge Pages 설정과 사용

```bash
#!/bin/bash
# hugepages_setup.sh

echo "=== Huge Pages 설정 및 테스트 ==="

# 현재 Huge Pages 상태 확인
echo "1. 현재 Huge Pages 상태:"
grep -E "HugePages|Hugepagesize" /proc/meminfo

# Transparent Huge Pages 상태 확인
echo -e "\n2. THP 상태:"
cat /sys/kernel/mm/transparent_hugepage/enabled
cat /sys/kernel/mm/transparent_hugepage/defrag

# 2MB Huge Pages 예약 (root 권한 필요)
if [ "$EUID" -eq 0 ]; then
    echo -e "\n3. 100개 2MB Huge Pages 예약..."
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
```

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
    printf("=== 일반 페이지 (4KB) 테스트 ===\n");
    
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
    
    printf("일반 페이지 결과:\n");
    printf("  소요 시간: %.3f 초\n", end - start);
    printf("  초당 접근: %.0f ops/s\n", accesses / (end - start));
    
    free(array);
}

void test_hugepages() {
    printf("\n=== Huge Pages (2MB) 테스트 ===\n");
    
    // Huge Pages 파일 생성
    int fd = open("/mnt/hugepages/test", O_CREAT | O_RDWR, 0755);
    if (fd < 0) {
        perror("hugepage file creation failed");
        printf("Huge Pages가 마운트되지 않았을 수 있습니다.\n");
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
    
    printf("Huge Pages 결과:\n");
    printf("  소요 시간: %.3f 초\n", end - start);
    printf("  초당 접근: %.0f ops/s\n", accesses / (end - start));
    
    munmap(array, ARRAY_SIZE);
    close(fd);
    unlink("/mnt/hugepages/test");
}

void test_thp_performance() {
    printf("\n=== Transparent Huge Pages 테스트 ===\n");
    
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
    
    printf("THP 순차 접근:\n");
    printf("  소요 시간: %.3f 초\n", end - start);
    printf("  처리 속도: %.1f MB/s\n", 
           (ARRAY_SIZE / 1024.0 / 1024.0) / (end - start));
    printf("  체크섬: 0x%02x\n", checksum);
    
    free(array);
}

int main() {
    test_normal_pages();
    test_hugepages();
    test_thp_performance();
    
    return 0;
}
```

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
```

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
    printf("=== NUMA 로컬 메모리 접근 테스트 ===\n");
    
    if (numa_available() < 0) {
        printf("NUMA not available\n");
        return;
    }
    
    int num_nodes = numa_max_node() + 1;
    printf("NUMA 노드 수: %d\n", num_nodes);
    
    for (int node = 0; node < num_nodes; node++) {
        printf("\n--- NUMA 노드 %d 테스트 ---\n", node);
        
        // 특정 NUMA 노드로 프로세스 바인딩
        struct bitmask *node_mask = numa_allocate_nodemask();
        numa_bitmask_setbit(node_mask, node);
        numa_bind(node_mask);
        
        // 해당 노드에서 메모리 할당
        size_t size = 128 * 1024 * 1024;  // 128MB
        void *memory = numa_alloc_onnode(size, node);
        if (!memory) {
            printf("메모리 할당 실패 (노드 %d)\n", node);
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
        
        printf("노드 %d 접근 성능: %.3f초 (%.1f MB/s)\n", 
               node, end - start, 
               (size / 1024.0 / 1024.0) / (end - start));
        
        numa_free(memory, size);
        numa_bitmask_free(node_mask);
    }
    
    // 바인딩 해제
    numa_bind(numa_all_nodes_ptr);
}

void test_cross_node_access() {
    printf("\n=== NUMA 크로스 노드 접근 테스트 ===\n");
    
    if (numa_max_node() < 1) {
        printf("멀티 NUMA 시스템이 아닙니다.\n");
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
        
        printf("크로스 노드 접근 성능: %.3f초 (%.1f MB/s)\n",
               end - start, 
               (size / 1024.0 / 1024.0) / (end - start));
        
        numa_free(remote_memory, size);
    }
    
    numa_bitmask_free(cpu_mask);
    numa_bitmask_free(mem_mask);
}

void optimize_numa_allocation() {
    printf("\n=== NUMA 최적화 할당 전략 ===\n");
    
    // 현재 실행 중인 CPU의 NUMA 노드 확인
    int current_node = numa_node_of_cpu(sched_getcpu());
    printf("현재 CPU의 NUMA 노드: %d\n", current_node);
    
    // 로컬 노드에서 메모리 할당
    size_t size = 64 * 1024 * 1024;
    void *local_memory = numa_alloc_onnode(size, current_node);
    
    // 첫 번째 터치 정책 적용 (first-touch policy)
    char *buffer = (char*)local_memory;
    memset(buffer, 0, size);  // 로컬 노드에서 페이지 할당 보장
    
    printf("로컬 노드 메모리 할당 및 초기화 완료\n");
    
    // 메모리 정책 확인
    int policy;
    struct bitmask *node_mask = numa_allocate_nodemask();
    
    if (get_mempolicy(&policy, node_mask->maskp, node_mask->size, 
                     buffer, MPOL_F_ADDR) == 0) {
        printf("메모리 정책: ");
        switch (policy) {
            case MPOL_DEFAULT: printf("DEFAULT\n"); break;
            case MPOL_BIND: printf("BIND\n"); break;
            case MPOL_INTERLEAVE: printf("INTERLEAVE\n"); break;
            case MPOL_PREFERRED: printf("PREFERRED\n"); break;
            default: printf("UNKNOWN\n"); break;
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
```

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
                        while chunk_end < file_size and mm[chunk_end:chunk_end+1] != b'\n':
                            chunk_end += 1
                        chunk_end += 1
                    
                    # 현재 청크 분석
                    chunk_data = mm[chunk_start:chunk_end]
                    
                    for pattern_name, pattern in error_patterns.items():
                        matches = len(pattern.findall(chunk_data))
                        self.stats[pattern_name] += matches
                    
                    # 라인 수 계산
                    self.stats['total_lines'] += chunk_data.count(b'\n')
                    
                    processed += len(chunk_data)
                    progress = processed / file_size * 100
                    
                    print(f"\r진행률: {progress:.1f}%", end='', flush=True)
                    
                    chunk_start = chunk_end
        
        end_time = time.time()
        
        print(f"\n분석 완료! 소요시간: {end_time - start_time:.3f}초")
        print("=== 분석 결과 ===")
        for key, value in self.stats.items():
            print(f"{key}: {value:,}")
        
        speed = file_size / 1024 / 1024 / (end_time - start_time)
        print(f"처리 속도: {speed:.1f} MB/s")

    def analyze_with_read(self):
        """일반 read()를 사용한 비교 분석"""
        print(f"\n일반 read()로 로그 분석 시작: {self.filename}")
        
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
                last_newline = data.rfind(b'\n')
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
                
                stats['total_lines'] += process_data.count(b'\n')
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
        
        print(f"\n일반 read() 분석 완료! 소요시간: {end_time - start_time:.3f}초")
        print("=== 분석 결과 ===")
        for key, value in stats.items():
            print(f"{key}: {value:,}")

def create_test_log(filename, size_mb=100):
    """테스트용 로그 파일 생성"""
    print(f"테스트 로그 파일 생성: {filename} ({size_mb}MB)")
    
    log_templates = [
        "2023-12-01 10:00:{:02d} INFO [app] Processing request {}\n",
        "2023-12-01 10:00:{:02d} ERROR [db] Connection failed: {}\n", 
        "2023-12-01 10:00:{:02d} WARNING [cache] High memory usage: {}%\n",
        "2023-12-01 10:00:{:02d} DEBUG [auth] User {} authenticated\n",
        "2023-12-01 10:00:{:02d} FATAL [system] Exception in thread {}: timeout\n"
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
```

### 5.2 스트리밍 데이터 처리

```c
// streaming_processor.c - 실시간 대용량 데이터 처리
#include <stdio.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/time.h>
#include <signal.h>

typedef struct {
    char *mapped_memory;
    size_t file_size;
    size_t current_pos;
    size_t window_size;
    int fd;
} streaming_processor_t;

streaming_processor_t* processor_create(const char *filename, size_t window_size) {
    streaming_processor_t *proc = malloc(sizeof(streaming_processor_t));
    
    proc->fd = open(filename, O_RDONLY);
    if (proc->fd == -1) {
        free(proc);
        return NULL;
    }
    
    struct stat st;
    if (fstat(proc->fd, &st) == -1) {
        close(proc->fd);
        free(proc);
        return NULL;
    }
    
    proc->file_size = st.st_size;
    proc->window_size = window_size;
    proc->current_pos = 0;
    
    // 파일 전체를 메모리에 매핑
    proc->mapped_memory = mmap(NULL, proc->file_size, PROT_READ, 
                              MAP_PRIVATE, proc->fd, 0);
    if (proc->mapped_memory == MAP_FAILED) {
        close(proc->fd);
        free(proc);
        return NULL;
    }
    
    // 순차 접근 힌트
    madvise(proc->mapped_memory, proc->file_size, MADV_SEQUENTIAL);
    
    return proc;
}

void processor_destroy(streaming_processor_t *proc) {
    if (proc) {
        munmap(proc->mapped_memory, proc->file_size);
        close(proc->fd);
        free(proc);
    }
}

int processor_next_window(streaming_processor_t *proc, char **window_data, size_t *window_len) {
    if (proc->current_pos >= proc->file_size) {
        return 0;  // EOF
    }
    
    size_t remaining = proc->file_size - proc->current_pos;
    *window_len = (remaining < proc->window_size) ? remaining : proc->window_size;
    *window_data = proc->mapped_memory + proc->current_pos;
    
    // 다음 윈도우에 대한 힌트
    size_t prefetch_size = proc->window_size * 2;  // 2 윈도우 ahead
    if (proc->current_pos + prefetch_size < proc->file_size) {
        madvise(*window_data + *window_len, prefetch_size, MADV_WILLNEED);
    }
    
    // 이전 윈도우는 더 이상 필요 없음
    if (proc->current_pos > proc->window_size) {
        madvise(*window_data - proc->window_size, proc->window_size, MADV_DONTNEED);
    }
    
    proc->current_pos += *window_len;
    return 1;
}

// 실시간 데이터 처리 시뮬레이션
void process_streaming_data(const char *filename) {
    printf("=== 스트리밍 데이터 처리 시뮬레이션 ===\n");
    
    const size_t window_size = 1024 * 1024;  // 1MB 윈도우
    streaming_processor_t *proc = processor_create(filename, window_size);
    
    if (!proc) {
        perror("processor creation failed");
        return;
    }
    
    printf("파일 크기: %.1f MB, 윈도우 크기: %.1f MB\n",
           proc->file_size / 1024.0 / 1024.0,
           window_size / 1024.0 / 1024.0);
    
    double start_time = get_time();
    size_t total_processed = 0;
    int window_count = 0;
    
    char *window_data;
    size_t window_len;
    
    while (processor_next_window(proc, &window_data, &window_len)) {
        // 실제 처리 시뮬레이션 (체크섬 계산)
        unsigned char checksum = 0;
        for (size_t i = 0; i < window_len; i++) {
            checksum ^= window_data[i];
        }
        
        total_processed += window_len;
        window_count++;
        
        // 진행 상황 출력
        if (window_count % 100 == 0) {
            double progress = (double)total_processed / proc->file_size * 100;
            printf("\r윈도우 %d 처리 완료 (%.1f%%, 체크섬: 0x%02x)", 
                   window_count, progress, checksum);
            fflush(stdout);
        }
        
        // 실제 처리 시간 시뮬레이션
        usleep(1000);  // 1ms 지연
    }
    
    double end_time = get_time();
    
    printf("\n스트리밍 처리 완료!\n");
    printf("처리된 윈도우: %d개\n", window_count);
    printf("총 처리량: %.1f MB\n", total_processed / 1024.0 / 1024.0);
    printf("소요 시간: %.3f 초\n", end_time - start_time);
    printf("처리 속도: %.1f MB/s\n", 
           (total_processed / 1024.0 / 1024.0) / (end_time - start_time));
    
    processor_destroy(proc);
}

int main(int argc, char *argv[]) {
    if (argc != 2) {
        printf("Usage: %s <large_file>\n", argv[0]);
        return 1;
    }
    
    process_streaming_data(argv[1]);
    
    return 0;
}
```

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
```

다음 섹션에서는 스왑 관리와 OOM 디버깅을 다뤄보겠습니다.

효율적인 메모리 매핑으로 대용량 데이터 처리 성능을 극대화해봅시다! 🚀
