---
tags:
  - NUMA optimization
  - advanced
  - buddy allocator
  - deep-study
  - hands-on
  - jemalloc
  - memory mapping
  - slab allocator
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "15-25시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 11.3d 고성능 메모리 관리 라이브러리

## jemalloc: 차세대 메모리 할당자

jemalloc은 Facebook, Netflix, Firefox 등에서 사용하는 고성능 메모리 할당자다. 시스템 기본 malloc 대비 현저한 성능 향상을 제공한다.

### jemalloc 활용

```c
// jemalloc 성능 비교
#ifdef USE_JEMALLOC
#include <jemalloc/jemalloc.h>
#endif

void benchmark_allocators() {
    const int ITERATIONS = 100000;
    const int MAX_SIZE = 1024;
    
    void** ptrs = malloc(ITERATIONS * sizeof(void*));
    clock_t start, end;
    
    printf("메모리 할당자 성능 비교:\n");
    
    // 시스템 기본 malloc
    start = clock();
    for (int i = 0; i < ITERATIONS; i++) {
        ptrs[i] = malloc(rand() % MAX_SIZE + 1);
    }
    for (int i = 0; i < ITERATIONS; i++) {
        free(ptrs[i]);
    }
    end = clock();
    printf("기본 malloc: %.4f초\n", (double)(end - start) / CLOCKS_PER_SEC);

#ifdef USE_JEMALLOC
    // jemalloc
    start = clock();
    for (int i = 0; i < ITERATIONS; i++) {
        ptrs[i] = je_malloc(rand() % MAX_SIZE + 1);
    }
    for (int i = 0; i < ITERATIONS; i++) {
        je_free(ptrs[i]);
    }
    end = clock();
    printf("jemalloc: %.4f초\n", (double)(end - start) / CLOCKS_PER_SEC);
#endif
    
    free(ptrs);
}

// jemalloc 통계 확인
void print_jemalloc_stats() {
#ifdef USE_JEMALLOC
    je_malloc_stats_print(NULL, NULL, NULL);
#endif
}
```

### jemalloc 컴파일 및 사용

```bash
# jemalloc 설치
wget https://github.com/jemalloc/jemalloc/releases/download/5.2.1/jemalloc-5.2.1.tar.bz2
tar -xjf jemalloc-5.2.1.tar.bz2
cd jemalloc-5.2.1
./configure --prefix=/usr/local
make && sudo make install

# 컴파일
gcc -DUSE_JEMALLOC -ljemalloc program.c -o program_jemalloc

# 또는 LD_PRELOAD로 기존 프로그램에 적용
LD_PRELOAD=/usr/local/lib/libjemalloc.so ./your_program
```

## 메모리 매핑 (Memory Mapping) 활용

### 대용량 파일 처리를 위한 메모리 매핑

```c
#include <sys/mman.h>
#include <fcntl.h>
#include <sys/stat.h>

// 대용량 파일 처리를 위한 메모리 매핑
void* map_large_file(const char* filename, size_t* file_size) {
    int fd = open(filename, O_RDONLY);
    if (fd == -1) {
        perror("파일 열기 실패");
        return NULL;
    }
    
    // 파일 크기 확인
    struct stat st;
    if (fstat(fd, &st) == -1) {
        close(fd);
        return NULL;
    }
    *file_size = st.st_size;
    
    // 메모리 매핑
    void* mapped = mmap(NULL, *file_size, PROT_READ, MAP_PRIVATE, fd, 0);
    close(fd);
    
    if (mapped == MAP_FAILED) {
        perror("메모리 매핑 실패");
        return NULL;
    }
    
    return mapped;
}

// 메모리 매핑 vs 전통적 파일 I/O 비교
void compare_file_access() {
    const char* filename = "large_data.bin";
    size_t file_size;
    clock_t start, end;
    
    // 전통적 방법: fread
    start = clock();
    FILE* fp = fopen(filename, "rb");
    if (fp) {
        char* buffer = malloc(1024 * 1024);  // 1MB 버퍼
        size_t total_read = 0;
        size_t bytes_read;
        
        while ((bytes_read = fread(buffer, 1, 1024 * 1024, fp)) > 0) {
            total_read += bytes_read;
            // 데이터 처리 시뮬레이션
            volatile char checksum = 0;
            for (size_t i = 0; i < bytes_read; i++) {
                checksum ^= buffer[i];
            }
        }
        
        free(buffer);
        fclose(fp);
    }
    end = clock();
    printf("fread 방식: %.4f초\n", (double)(end - start) / CLOCKS_PER_SEC);
    
    // 메모리 매핑 방법
    start = clock();
    char* mapped = (char*)map_large_file(filename, &file_size);
    if (mapped) {
        // 전체 파일을 메모리처럼 접근
        volatile char checksum = 0;
        for (size_t i = 0; i < file_size; i++) {
            checksum ^= mapped[i];
        }
        
        munmap(mapped, file_size);
    }
    end = clock();
    printf("mmap 방식: %.4f초\n", (double)(end - start) / CLOCKS_PER_SEC);
}
```

### 공유 메모리를 이용한 프로세스 간 통신

```c
#include <sys/shm.h>
#include <sys/ipc.h>

typedef struct {
    int counter;
    char message[256];
    pthread_mutex_t mutex;
} SharedData;

// 공유 메모리 생성 및 초기화
SharedData* create_shared_memory() {
    key_t key = ftok("shared_mem_key", 1234);
    int shmid = shmget(key, sizeof(SharedData), IPC_CREAT | 0666);
    
    if (shmid == -1) {
        perror("shmget 실패");
        return NULL;
    }
    
    SharedData* shared = (SharedData*)shmat(shmid, NULL, 0);
    if (shared == (SharedData*)-1) {
        perror("shmat 실패");
        return NULL;
    }
    
    // 뮤텍스 초기화 (프로세스 간 공유 가능하도록)
    pthread_mutexattr_t attr;
    pthread_mutexattr_init(&attr);
    pthread_mutexattr_setpshared(&attr, PTHREAD_PROCESS_SHARED);
    pthread_mutex_init(&shared->mutex, &attr);
    pthread_mutexattr_destroy(&attr);
    
    shared->counter = 0;
    strcpy(shared->message, "초기 메시지");
    
    return shared;
}

// 공유 메모리 사용 예시
void use_shared_memory(SharedData* shared) {
    pthread_mutex_lock(&shared->mutex);
    
    shared->counter++;
    sprintf(shared->message, "프로세스 %d에서 업데이트: %d", 
            getpid(), shared->counter);
    
    printf("공유 데이터 업데이트: %s\n", shared->message);
    
    pthread_mutex_unlock(&shared->mutex);
}
```

## 고급 메모리 할당 전략

### 슬랩 할당자 (Slab Allocator) 구현

```c
// 슬랩 할당자 - 리눅스 커널에서 사용하는 방식
typedef struct Slab {
    void* memory;
    void* free_list;
    int free_count;
    int total_count;
    struct Slab* next;
} Slab;

typedef struct SlabAllocator {
    Slab* slabs;
    size_t object_size;
    int objects_per_slab;
    size_t slab_size;
} SlabAllocator;

SlabAllocator* create_slab_allocator(size_t object_size, int objects_per_slab) {
    SlabAllocator* allocator = malloc(sizeof(SlabAllocator));
    
    // 객체 크기를 정렬에 맞춤
    allocator->object_size = (object_size + 7) & ~7;
    allocator->objects_per_slab = objects_per_slab;
    allocator->slab_size = allocator->object_size * objects_per_slab;
    allocator->slabs = NULL;
    
    return allocator;
}

Slab* create_slab(SlabAllocator* allocator) {
    Slab* slab = malloc(sizeof(Slab));
    slab->memory = malloc(allocator->slab_size);
    slab->free_count = allocator->objects_per_slab;
    slab->total_count = allocator->objects_per_slab;
    slab->next = NULL;
    
    // 프리 리스트 초기화
    char* current = (char*)slab->memory;
    slab->free_list = current;
    
    for (int i = 0; i < allocator->objects_per_slab - 1; i++) {
        *(void**)current = current + allocator->object_size;
        current += allocator->object_size;
    }
    *(void**)current = NULL;  // 마지막 객체
    
    return slab;
}

void* slab_alloc(SlabAllocator* allocator) {
    // 사용 가능한 슬랩 찾기
    Slab* slab = allocator->slabs;
    while (slab && slab->free_count == 0) {
        slab = slab->next;
    }
    
    // 사용 가능한 슬랩이 없으면 새로 생성
    if (!slab) {
        slab = create_slab(allocator);
        slab->next = allocator->slabs;
        allocator->slabs = slab;
    }
    
    // 객체 할당
    void* obj = slab->free_list;
    slab->free_list = *(void**)obj;
    slab->free_count--;
    
    return obj;
}

void slab_free(SlabAllocator* allocator, void* ptr) {
    if (!ptr) return;
    
    // 해당 슬랩 찾기 (실제로는 더 효율적인 방법 사용)
    Slab* slab = allocator->slabs;
    while (slab) {
        char* start = (char*)slab->memory;
        char* end = start + allocator->slab_size;
        
        if ((char*)ptr >= start && (char*)ptr < end) {
            // 프리 리스트에 추가
            *(void**)ptr = slab->free_list;
            slab->free_list = ptr;
            slab->free_count++;
            break;
        }
        slab = slab->next;
    }
}
```

### 버디 할당자 (Buddy Allocator)

```c
#define MAX_ORDER 10

typedef struct BuddyBlock {
    int order;
    int is_free;
    struct BuddyBlock* next;
} BuddyBlock;

typedef struct BuddyAllocator {
    void* memory;
    size_t total_size;
    BuddyBlock* free_lists[MAX_ORDER + 1];
} BuddyAllocator;

BuddyAllocator* create_buddy_allocator(size_t total_size) {
    BuddyAllocator* buddy = malloc(sizeof(BuddyAllocator));
    
    // 크기를 2의 거듭제곱으로 조정
    int order = 0;
    size_t size = 1;
    while (size < total_size) {
        size <<= 1;
        order++;
    }
    
    buddy->total_size = size;
    buddy->memory = malloc(size);
    
    // 프리 리스트 초기화
    for (int i = 0; i <= MAX_ORDER; i++) {
        buddy->free_lists[i] = NULL;
    }
    
    // 전체 메모리를 하나의 큰 블록으로 시작
    BuddyBlock* initial_block = (BuddyBlock*)buddy->memory;
    initial_block->order = order;
    initial_block->is_free = 1;
    initial_block->next = NULL;
    buddy->free_lists[order] = initial_block;
    
    return buddy;
}

void* buddy_alloc(BuddyAllocator* buddy, size_t size) {
    // 필요한 order 계산
    int order = 0;
    size_t block_size = sizeof(BuddyBlock);
    while (block_size < size + sizeof(BuddyBlock)) {
        block_size <<= 1;
        order++;
    }
    
    // 적절한 크기의 블록 찾기
    int current_order = order;
    while (current_order <= MAX_ORDER && !buddy->free_lists[current_order]) {
        current_order++;
    }
    
    if (current_order > MAX_ORDER) {
        return NULL; // 메모리 부족
    }
    
    // 블록을 분할하면서 할당
    BuddyBlock* block = buddy->free_lists[current_order];
    buddy->free_lists[current_order] = block->next;
    
    // 필요한 크기까지 분할
    while (current_order > order) {
        current_order--;
        
        // 버디 블록 생성
        BuddyBlock* buddy_block = (BuddyBlock*)((char*)block + (1 << current_order));
        buddy_block->order = current_order;
        buddy_block->is_free = 1;
        buddy_block->next = buddy->free_lists[current_order];
        buddy->free_lists[current_order] = buddy_block;
    }
    
    block->is_free = 0;
    return (char*)block + sizeof(BuddyBlock);
}
```

## NUMA 최적화

### NUMA 인식 메모리 할당

```c
#ifdef __linux__
#include <numa.h>
#include <numaif.h>

void numa_memory_optimization() {
    if (numa_available() < 0) {
        printf("NUMA 지원 안됨\n");
        return;
    }
    
    int num_nodes = numa_num_configured_nodes();
    printf("NUMA 노드 수: %d\n", num_nodes);
    
    // 현재 CPU가 속한 노드 확인
    int cpu = sched_getcpu();
    int node = numa_node_of_cpu(cpu);
    printf("현재 CPU %d는 NUMA 노드 %d에 속함\n", cpu, node);
    
    // 로컬 노드에 메모리 할당
    size_t size = 1024 * 1024;  // 1MB
    void* local_mem = numa_alloc_onnode(size, node);
    
    if (local_mem) {
        printf("로컬 NUMA 노드 %d에 메모리 할당 성공\n", node);
        
        // 메모리 사용
        memset(local_mem, 0, size);
        
        numa_free(local_mem, size);
    }
    
    // 모든 노드에 균등 배치
    void* interleaved_mem = numa_alloc_interleaved(size);
    if (interleaved_mem) {
        printf("NUMA 노드 간 균등 배치 메모리 할당 성공\n");
        numa_free(interleaved_mem, size);
    }
}
#endif
```

## 메모리 압축 및 최적화

### 메모리 압축 기법

```c
#include <zlib.h>

typedef struct CompressedBuffer {
    void* compressed_data;
    size_t compressed_size;
    size_t original_size;
} CompressedBuffer;

CompressedBuffer* compress_memory(const void* data, size_t size) {
    CompressedBuffer* buffer = malloc(sizeof(CompressedBuffer));
    
    // 압축된 데이터 크기 추정
    buffer->compressed_size = compressBound(size);
    buffer->compressed_data = malloc(buffer->compressed_size);
    buffer->original_size = size;
    
    // 압축 수행
    int result = compress((Bytef*)buffer->compressed_data, &buffer->compressed_size,
                         (const Bytef*)data, size);
    
    if (result != Z_OK) {
        free(buffer->compressed_data);
        free(buffer);
        return NULL;
    }
    
    printf("압축률: %.2f%% (원본: %zu, 압축: %zu)\n",
           (double)buffer->compressed_size / size * 100,
           size, buffer->compressed_size);
    
    return buffer;
}

void* decompress_memory(CompressedBuffer* buffer) {
    if (!buffer) return NULL;
    
    void* decompressed = malloc(buffer->original_size);
    uLongf dest_len = buffer->original_size;
    
    int result = uncompress((Bytef*)decompressed, &dest_len,
                           (const Bytef*)buffer->compressed_data,
                           buffer->compressed_size);
    
    if (result != Z_OK) {
        free(decompressed);
        return NULL;
    }
    
    return decompressed;
}

void free_compressed_buffer(CompressedBuffer* buffer) {
    if (buffer) {
        free(buffer->compressed_data);
        free(buffer);
    }
}
```

## 핵심 요점

### 1. 고성능 할당자를 활용하라

jemalloc 같은 최적화된 메모리 할당자로 시스템 성능을 크게 향상시킬 수 있다.

### 2. 메모리 매핑을 적극 활용하라

대용량 파일 처리나 프로세스 간 통신에서 메모리 매핑은 필수적이다.

### 3. 하드웨어 특성을 고려하라

NUMA 아키텍처에서는 메모리 지역성을 고려한 할당이 성능에 큰 영향을 준다.

### 4. 적재적소에 맞는 할당자를 선택하라

- **슬랩 할당자**: 고정 크기 객체의 빈번한 할당/해제
- **버디 할당자**: 다양한 크기의 블록을 효율적으로 관리
- **메모리 압축**: 메모리 사용량이 중요한 환경

---

**마무리**: 메모리 최적화는 시스템 성능의 핵심이다. 캐시 친화적 알고리즘, 효율적인 메모리 할당, 누수 방지, 고급 메모리 관리 기법을 종합적으로 활용하여 최고의 성능을 달성하자.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 15-25시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-11-performance-optimization)

- [Chapter 11-1: 성능 분석 방법론](./11-30-performance-methodology.md)
- [11.2 CPU 성능 최적화](./11-31-cpu-optimization.md)
- [11.3 메모리 성능 최적화](./11-32-memory-optimization.md)
- [11.3a 메모리 계층구조와 캐시 최적화](./11-10-memory-hierarchy-cache.md)
- [11.3b 메모리 할당 최적화](./11-11-memory-allocation.md)

### 🏷️ 관련 키워드

`jemalloc`, `memory mapping`, `slab allocator`, `buddy allocator`, `NUMA optimization`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
