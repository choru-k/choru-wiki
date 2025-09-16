---
tags:
  - RAII pattern
  - deep-study
  - hands-on
  - intermediate
  - memory allocation optimization
  - memory pool
  - ring buffer
  - stack allocator
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "7-10시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 11.3b 메모리 할당 최적화

## 메모리 할당의 숨겨진 비용

빈번한 `malloc()` / `free()` 호출은 성능의 숨은 킬러다. 시스템 콜 오버헤드, 메모리 단편화, 동기화 비용이 누적되어 성능을 크게 저하시킨다.

## 1. 메모리 풀 (Memory Pool) 구현

### 기본 메모리 풀 설계

```c
// memory_pool.h
typedef struct MemoryBlock {
    struct MemoryBlock* next;
    char data[];
} MemoryBlock;

typedef struct {
    MemoryBlock* free_list;
    void* pool_start;
    size_t block_size;
    size_t pool_size;
    size_t blocks_allocated;
    size_t blocks_total;
} MemoryPool;

// 메모리 풀 생성
MemoryPool* create_memory_pool(size_t block_size, size_t num_blocks) {
    MemoryPool* pool = malloc(sizeof(MemoryPool));
    if (!pool) return NULL;
    
    // 블록 크기를 정렬에 맞춰 조정
    block_size = (block_size + sizeof(void*) - 1) & ~(sizeof(void*) - 1);
    
    size_t total_size = (sizeof(MemoryBlock) + block_size) * num_blocks;
    pool->pool_start = malloc(total_size);
    
    if (!pool->pool_start) {
        free(pool);
        return NULL;
    }
    
    pool->block_size = block_size;
    pool->pool_size = total_size;
    pool->blocks_allocated = 0;
    pool->blocks_total = num_blocks;
    pool->free_list = NULL;
    
    // 프리 리스트 초기화
    char* current = (char*)pool->pool_start;
    for (size_t i = 0; i < num_blocks; i++) {
        MemoryBlock* block = (MemoryBlock*)current;
        block->next = pool->free_list;
        pool->free_list = block;
        current += sizeof(MemoryBlock) + block_size;
    }
    
    return pool;
}

// 메모리 할당
void* pool_alloc(MemoryPool* pool) {
    if (!pool->free_list) {
        printf("메모리 풀 고갈!\n");
        return NULL;
    }
    
    MemoryBlock* block = pool->free_list;
    pool->free_list = block->next;
    pool->blocks_allocated++;
    
    return block->data;
}

// 메모리 해제
void pool_free(MemoryPool* pool, void* ptr) {
    if (!ptr) return;
    
    MemoryBlock* block = (MemoryBlock*)((char*)ptr - offsetof(MemoryBlock, data));
    block->next = pool->free_list;
    pool->free_list = block;
    pool->blocks_allocated--;
}

// 메모리 풀 파괴
void destroy_memory_pool(MemoryPool* pool) {
    if (pool) {
        free(pool->pool_start);
        free(pool);
    }
}
```

### 성능 비교 테스트

```c
// 성능 비교 테스트
void benchmark_memory_allocation() {
    const int ITERATIONS = 1000000;
    const int BLOCK_SIZE = 128;
    
    clock_t start, end;
    
    // 표준 malloc/free 성능 측정
    start = clock();
    void** ptrs = malloc(ITERATIONS * sizeof(void*));
    
    for (int i = 0; i < ITERATIONS; i++) {
        ptrs[i] = malloc(BLOCK_SIZE);
    }
    
    for (int i = 0; i < ITERATIONS; i++) {
        free(ptrs[i]);
    }
    
    free(ptrs);
    end = clock();
    
    double malloc_time = (double)(end - start) / CLOCKS_PER_SEC;
    printf("malloc/free: %.4f초\n", malloc_time);
    
    // 메모리 풀 성능 측정
    MemoryPool* pool = create_memory_pool(BLOCK_SIZE, ITERATIONS);
    ptrs = malloc(ITERATIONS * sizeof(void*));
    
    start = clock();
    
    for (int i = 0; i < ITERATIONS; i++) {
        ptrs[i] = pool_alloc(pool);
    }
    
    for (int i = 0; i < ITERATIONS; i++) {
        pool_free(pool, ptrs[i]);
    }
    
    end = clock();
    
    double pool_time = (double)(end - start) / CLOCKS_PER_SEC;
    printf("메모리 풀: %.4f초\n", pool_time);
    printf("성능 향상: %.1f배\n", malloc_time / pool_time);
    
    free(ptrs);
    destroy_memory_pool(pool);
}
```

## 2. 스택 할당자 (Stack Allocator)

### 고속 임시 메모리 할당

```c
// 빠른 임시 메모리 할당용
typedef struct {
    char* buffer;
    size_t size;
    size_t top;
} StackAllocator;

StackAllocator* create_stack_allocator(size_t size) {
    StackAllocator* allocator = malloc(sizeof(StackAllocator));
    allocator->buffer = malloc(size);
    allocator->size = size;
    allocator->top = 0;
    return allocator;
}

void* stack_alloc(StackAllocator* allocator, size_t size) {
    // 정렬 조정
    size = (size + 7) & ~7;
    
    if (allocator->top + size > allocator->size) {
        return NULL;  // 스택 오버플로우
    }
    
    void* ptr = allocator->buffer + allocator->top;
    allocator->top += size;
    return ptr;
}

// 마지막 할당 지점까지 되돌리기
void stack_reset_to(StackAllocator* allocator, size_t position) {
    if (position <= allocator->size) {
        allocator->top = position;
    }
}

// 전체 스택 리셋
void stack_reset(StackAllocator* allocator) {
    allocator->top = 0;
}

void destroy_stack_allocator(StackAllocator* allocator) {
    free(allocator->buffer);
    free(allocator);
}
```

### 스택 할당자 사용 예시

```c
// 사용 예시: 함수 내 임시 메모리 할당
void process_data_with_stack_allocator() {
    StackAllocator* temp_allocator = create_stack_allocator(1024 * 1024); // 1MB
    
    size_t checkpoint = temp_allocator->top;
    
    // 임시 버퍼들 할당
    int* temp_array1 = (int*)stack_alloc(temp_allocator, 1000 * sizeof(int));
    char* temp_string = (char*)stack_alloc(temp_allocator, 256);
    double* temp_array2 = (double*)stack_alloc(temp_allocator, 500 * sizeof(double));
    
    // 작업 수행
    for (int i = 0; i < 1000; i++) {
        temp_array1[i] = i * i;
    }
    strcpy(temp_string, "임시 문자열");
    
    for (int i = 0; i < 500; i++) {
        temp_array2[i] = i * 3.14;
    }
    
    // 자동으로 모든 할당 해제 (매우 빠름)
    stack_reset_to(temp_allocator, checkpoint);
    
    destroy_stack_allocator(temp_allocator);
}
```

## 3. 다양한 크기의 블록을 위한 다층 메모리 풀

```c
// 여러 크기의 블록을 효율적으로 관리하는 다층 메모리 풀
#define NUM_POOL_SIZES 8

typedef struct {
    MemoryPool* pools[NUM_POOL_SIZES];
    size_t pool_sizes[NUM_POOL_SIZES];
    size_t blocks_per_pool[NUM_POOL_SIZES];
} MultiSizePool;

MultiSizePool* create_multisize_pool() {
    MultiSizePool* multipool = malloc(sizeof(MultiSizePool));
    
    // 2의 거듭제곱으로 블록 크기 설정: 16, 32, 64, 128, 256, 512, 1024, 2048
    for (int i = 0; i < NUM_POOL_SIZES; i++) {
        multipool->pool_sizes[i] = 16 << i;  // 16 * 2^i
        multipool->blocks_per_pool[i] = 8192 / multipool->pool_sizes[i]; // 총 8KB per pool
        multipool->pools[i] = create_memory_pool(
            multipool->pool_sizes[i], 
            multipool->blocks_per_pool[i]
        );
    }
    
    return multipool;
}

void* multipool_alloc(MultiSizePool* multipool, size_t size) {
    // 적절한 크기의 풀 찾기
    for (int i = 0; i < NUM_POOL_SIZES; i++) {
        if (size <= multipool->pool_sizes[i]) {
            return pool_alloc(multipool->pools[i]);
        }
    }
    
    // 너무 큰 크기는 일반 malloc 사용
    return malloc(size);
}

void multipool_free(MultiSizePool* multipool, void* ptr, size_t size) {
    if (!ptr) return;
    
    // 적절한 크기의 풀 찾기
    for (int i = 0; i < NUM_POOL_SIZES; i++) {
        if (size <= multipool->pool_sizes[i]) {
            pool_free(multipool->pools[i], ptr);
            return;
        }
    }
    
    // 일반 malloc으로 할당된 것은 free
    free(ptr);
}

void destroy_multisize_pool(MultiSizePool* multipool) {
    for (int i = 0; i < NUM_POOL_SIZES; i++) {
        destroy_memory_pool(multipool->pools[i]);
    }
    free(multipool);
}
```

## 4. RAII 패턴 구현 (C에서)

### 자동 리소스 관리

```c
// C에서 RAII 스타일 구현
#define DECLARE_AUTO_FREE(type, var, init) \
    type var __attribute__((cleanup(cleanup_##type))) = init

void cleanup_charp(char** ptr) {
    if (*ptr) {
        free(*ptr);
        *ptr = NULL;
    }
}

void cleanup_intp(int** ptr) {
    if (*ptr) {
        free(*ptr);
        *ptr = NULL;
    }
}

void cleanup_FILE(FILE** fp) {
    if (*fp) {
        fclose(*fp);
        *fp = NULL;
    }
}

// 사용 예시 (GCC 컴파일러에서만 동작)
void example_auto_cleanup() {
    // 함수 종료 시 자동으로 정리
    DECLARE_AUTO_FREE(char*, buffer, malloc(1000));
    DECLARE_AUTO_FREE(int*, numbers, malloc(100 * sizeof(int)));
    DECLARE_AUTO_FREE(FILE*, file, fopen("test.txt", "w"));
    
    if (!buffer || !numbers || !file) {
        return; // 자동으로 정리됨
    }
    
    // 작업 수행
    strcpy(buffer, "Hello World");
    for (int i = 0; i < 100; i++) {
        numbers[i] = i;
    }
    fprintf(file, "데이터 처리 완료\n");
    
    // 함수 종료 시 자동으로 free() 및 fclose() 호출
}
```

## 5. 링 버퍼를 이용한 순환 할당자

```c
typedef struct {
    char* buffer;
    size_t size;
    size_t head;
    size_t tail;
    size_t used;
} RingAllocator;

RingAllocator* create_ring_allocator(size_t size) {
    RingAllocator* ring = malloc(sizeof(RingAllocator));
    ring->buffer = malloc(size);
    ring->size = size;
    ring->head = 0;
    ring->tail = 0;
    ring->used = 0;
    return ring;
}

void* ring_alloc(RingAllocator* ring, size_t size) {
    // 정렬 조정
    size = (size + 7) & ~7;
    
    if (size > ring->size - ring->used) {
        return NULL; // 공간 부족
    }
    
    // 끝까지 갔으면 처음으로 돌아가기
    if (ring->tail + size > ring->size) {
        ring->tail = 0;
    }
    
    void* ptr = ring->buffer + ring->tail;
    ring->tail = (ring->tail + size) % ring->size;
    ring->used += size;
    
    return ptr;
}

// 링 버퍼는 일반적으로 전체 리셋만 지원
void ring_reset(RingAllocator* ring) {
    ring->head = 0;
    ring->tail = 0;
    ring->used = 0;
}

void destroy_ring_allocator(RingAllocator* ring) {
    free(ring->buffer);
    free(ring);
}
```

## 6. 실전 문자열 처리 최적화

### StringBuilder 구현

```c
// 문자열 연결 최적화
typedef struct {
    char* buffer;
    size_t capacity;
    size_t length;
} StringBuilder;

StringBuilder* sb_create(size_t initial_capacity) {
    StringBuilder* sb = malloc(sizeof(StringBuilder));
    sb->buffer = malloc(initial_capacity);
    sb->capacity = initial_capacity;
    sb->length = 0;
    sb->buffer[0] = '\0';
    return sb;
}

void sb_append(StringBuilder* sb, const char* str) {
    size_t str_len = strlen(str);
    
    // 용량 부족시 확장 (2배씩 증가)
    if (sb->length + str_len >= sb->capacity) {
        size_t new_capacity = sb->capacity;
        while (new_capacity <= sb->length + str_len) {
            new_capacity *= 2;
        }
        sb->buffer = realloc(sb->buffer, new_capacity);
        sb->capacity = new_capacity;
    }
    
    strcpy(sb->buffer + sb->length, str);
    sb->length += str_len;
}

char* sb_to_string(StringBuilder* sb) {
    char* result = malloc(sb->length + 1);
    strcpy(result, sb->buffer);
    return result;
}

void sb_destroy(StringBuilder* sb) {
    free(sb->buffer);
    free(sb);
}
```

### 성능 비교

```c
// 성능 비교 테스트
void compare_string_building() {
    const int ITERATIONS = 10000;
    const char* append_str = "Hello ";
    
    clock_t start, end;
    
    // ❌ 비효율적: 매번 realloc + strcpy
    start = clock();
    char* result1 = malloc(1);
    result1[0] = '\0';
    
    for (int i = 0; i < ITERATIONS; i++) {
        size_t old_len = strlen(result1);
        size_t new_len = old_len + strlen(append_str);
        result1 = realloc(result1, new_len + 1);
        strcat(result1, append_str);
    }
    end = clock();
    printf("비효율적 문자열 빌딩: %.4f초\n", (double)(end - start) / CLOCKS_PER_SEC);
    free(result1);
    
    // ✅ 효율적: StringBuilder 사용
    start = clock();
    StringBuilder* sb = sb_create(256);
    
    for (int i = 0; i < ITERATIONS; i++) {
        sb_append(sb, append_str);
    }
    
    char* result2 = sb_to_string(sb);
    end = clock();
    printf("StringBuilder: %.4f초\n", (double)(end - start) / CLOCKS_PER_SEC);
    
    free(result2);
    sb_destroy(sb);
}
```

## 핵심 요점

### 1. 메모리 할당을 최적화하라

빈번한 malloc/free는 성능 킬러다. **메모리 풀이나 스택 할당자**를 활용하자.

### 2. 용도에 맞는 할당자를 선택하라

- **메모리 풀**: 고정 크기 블록의 빈번한 할당/해제
- **스택 할당자**: 임시 메모리, 함수 스코프 내 사용
- **링 버퍼**: 순환적 사용 패턴
- **다층 풀**: 다양한 크기의 블록 효율적 관리

### 3. 자동 리소스 관리를 구현하라

RAII 패턴으로 메모리 누수를 방지하고 코드를 안전하게 만들어라.

---

**다음**: [11.3c 메모리 누수 탐지 및 방지](11-12-memory-leak-detection.md)에서 메모리 누수를 체계적으로 탐지하고 방지하는 방법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 7-10시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-11-performance-optimization)

- [Chapter 11-1: 성능 분석 방법론](./11-30-performance-methodology.md)
- [11.2 CPU 성능 최적화](./11-31-cpu-optimization.md)
- [11.3 메모리 성능 최적화](./11-32-memory-optimization.md)
- [11.3a 메모리 계층구조와 캐시 최적화](./11-10-memory-hierarchy-cache.md)
- [11.3c 메모리 누수 탐지 및 방지](./11-12-memory-leak-detection.md)

### 🏷️ 관련 키워드

`memory pool`, `stack allocator`, `memory allocation optimization`, `RAII pattern`, `ring buffer`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
