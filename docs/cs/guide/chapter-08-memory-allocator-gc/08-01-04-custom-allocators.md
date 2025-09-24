---
tags:
  - advanced
  - buddy_system
  - deep-study
  - frame_allocator
  - hands-on
  - memory_pool
  - ring_buffer
  - slab_allocator
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 8.1.4: 커스텀 할당자

## Memory Pool: 게임 엔진의 비밀

제가 게임 회사에서 일할 때 배운 60 FPS의 비밀:

```c++
// 프레임 할당자: 매 프레임마다 리셋
class FrameAllocator {
private:
    static constexpr size_t FRAME_MEMORY_SIZE = 10 * 1024 * 1024;  // 10MB
    uint8_t memory[FRAME_MEMORY_SIZE];
    size_t offset = 0;

public:
    void* allocate(size_t size, size_t alignment = 8) {
        // 정렬
        offset = (offset + alignment - 1) & ~(alignment - 1);

        if (offset + size > FRAME_MEMORY_SIZE) {
            throw std::bad_alloc();
        }

        void* ptr = &memory[offset];
        offset += size;
        return ptr;
    }

    void reset() {
        offset = 0;  // 모든 메모리 "해제" (O(1)!)
    }

    // 개별 해제 불가능 - 전체만 리셋!
    void deallocate(void* ptr) = delete;
};

// 사용 예: 게임 루프
class GameEngine {
    FrameAllocator frameAlloc;

    void gameLoop() {
        while (running) {
            // 프레임 시작
            frameAlloc.reset();

            // 임시 객체들 할당 (해제 걱정 없음!)
            auto* particles = frameAlloc.allocate<Particle>(1000);
            auto* renderCommands = frameAlloc.allocate<RenderCommand>(500);

            updatePhysics(particles);
            render(renderCommands);

            // 프레임 끝 - 자동으로 모든 메모리 회수!
            // malloc/free 호출 0번!
        }
    }
};

// Ring Buffer 할당자: 네트워크 패킷용
template<size_t SIZE>
class RingAllocator {
private:
    uint8_t buffer[SIZE];
    std::atomic<size_t> head{0};
    std::atomic<size_t> tail{0};

public:
    void* allocate(size_t size) {
        size_t current_head = head.load();
        size_t new_head = (current_head + size) % SIZE;

        // CAS로 lock-free 할당
        while (!head.compare_exchange_weak(current_head, new_head)) {
            new_head = (current_head + size) % SIZE;
        }

        return &buffer[current_head];
    }

    void deallocate_oldest(size_t size) {
        tail.fetch_add(size);
        tail %= SIZE;
    }
};
```

## Slab Allocator: Linux 커널의 선택

Linux 커널이 사용하는 Slab allocator 구현:

```c
// Slab Allocator: 같은 크기 객체 전용
template<typename T>
class SlabAllocator {
private:
    struct Slab {
        static constexpr size_t OBJECTS_PER_SLAB = 64;

        alignas(T) uint8_t memory[sizeof(T) * OBJECTS_PER_SLAB];
        std::bitset<OBJECTS_PER_SLAB> used;
        Slab* next = nullptr;

        T* allocate() {
            for (size_t i = 0; i < OBJECTS_PER_SLAB; i++) {
                if (!used[i]) {
                    used[i] = true;
                    return reinterpret_cast<T*>(&memory[i * sizeof(T)]);
                }
            }
            return nullptr;
        }

        bool deallocate(T* ptr) {
            auto offset = reinterpret_cast<uint8_t*>(ptr) - memory;
            if (offset >= 0 && offset < sizeof(memory)) {
                size_t index = offset / sizeof(T);
                used[index] = false;
                return true;
            }
            return false;
        }

        bool is_empty() const { return used.none(); }
        bool is_full() const { return used.all(); }
    };

    Slab* partial_slabs = nullptr;  // 부분적으로 찬 슬랩
    Slab* full_slabs = nullptr;     // 완전히 찬 슬랩
    Slab* empty_slabs = nullptr;    // 빈 슬랩 (캐시)

public:
    T* allocate() {
        // 1. Partial slab에서 시도
        if (partial_slabs) {
            T* obj = partial_slabs->allocate();
            if (obj) {
                if (partial_slabs->is_full()) {
                    move_to_full(partial_slabs);
                }
                return obj;
            }
        }

        // 2. Empty slab 활용
        if (empty_slabs) {
            Slab* slab = empty_slabs;
            empty_slabs = empty_slabs->next;
            slab->next = partial_slabs;
            partial_slabs = slab;
            return slab->allocate();
        }

        // 3. 새 slab 할당
        Slab* new_slab = new Slab();
        new_slab->next = partial_slabs;
        partial_slabs = new_slab;
        return new_slab->allocate();
    }

    void deallocate(T* ptr) {
        // 모든 slab 검색 (실제로는 더 효율적인 방법 사용)
        if (deallocate_from_list(ptr, full_slabs)) {
            // full -> partial로 이동
        } else if (deallocate_from_list(ptr, partial_slabs)) {
            // 빈 slab은 empty 리스트로
        }
    }
};

// 실제 사용: 커널 객체 캐시
struct task_struct {  // 프로세스 구조체
    pid_t pid;
    // ... 수많은 필드들
};

SlabAllocator<task_struct> task_cache;  // 프로세스 생성/소멸 최적화!
```

## Buddy System: 단편화 방지의 정석

```c++
// Buddy System: 2의 거듭제곱 크기로 분할/병합
class BuddyAllocator {
private:
    static constexpr size_t MIN_BLOCK_SIZE = 64;      // 최소 64B
    static constexpr size_t MAX_BLOCK_SIZE = 1 << 20; // 최대 1MB
    static constexpr size_t NUM_LEVELS = 15;           // log2(1MB/64B) + 1

    struct Block {
        size_t size;
        bool free;
        Block* buddy;
        Block* next;
        Block* prev;
    };

    // 각 크기별 free list
    Block* free_lists[NUM_LEVELS];
    uint8_t* memory_pool;

    size_t size_to_level(size_t size) {
        size = std::max(size, MIN_BLOCK_SIZE);
        return __builtin_clzll(1) - __builtin_clzll(size - 1);
    }

public:
    void* allocate(size_t size) {
        size_t level = size_to_level(size);

        // 해당 레벨에 free block이 있는지 확인
        for (size_t i = level; i < NUM_LEVELS; i++) {
            if (free_lists[i]) {
                Block* block = free_lists[i];
                remove_from_free_list(block, i);

                // 필요하면 분할
                while (i > level) {
                    i--;
                    Block* buddy = split_block(block, i);
                    add_to_free_list(buddy, i);
                }

                block->free = false;
                return block + 1;  // 헤더 다음 주소 반환
            }
        }

        return nullptr;  // 메모리 부족
    }

    void deallocate(void* ptr) {
        Block* block = static_cast<Block*>(ptr) - 1;
        block->free = true;

        // Buddy와 병합 시도
        size_t level = size_to_level(block->size);

        while (level < NUM_LEVELS - 1) {
            Block* buddy = find_buddy(block, level);

            if (!buddy || !buddy->free) {
                break;  // 병합 불가
            }

            // 병합
            remove_from_free_list(buddy, level);
            block = merge_blocks(block, buddy);
            level++;
        }

        add_to_free_list(block, level);
    }

    Block* find_buddy(Block* block, size_t level) {
        size_t block_size = 1 << (level + 6);  // MIN_BLOCK_SIZE = 64 = 2^6
        uintptr_t addr = reinterpret_cast<uintptr_t>(block);
        uintptr_t buddy_addr = addr ^ block_size;  // XOR로 buddy 주소 계산!
        return reinterpret_cast<Block*>(buddy_addr);
    }
};

// Buddy System의 장점 실측
void benchmark_fragmentation() {
    // 시나리오: 다양한 크기 할당/해제 반복
    std::vector<void*> ptrs;

    // 일반 malloc
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 100000; i++) {
        size_t size = 1 << (rand() % 10 + 6);  // 64B ~ 32KB
        ptrs.push_back(malloc(size));

        if (rand() % 2 && !ptrs.empty()) {
            free(ptrs.back());
            ptrs.pop_back();
        }
    }

    // 메모리 사용량 측정
    size_t malloc_usage = get_memory_usage();

    // Buddy System
    BuddyAllocator buddy;
    ptrs.clear();

    for (int i = 0; i < 100000; i++) {
        size_t size = 1 << (rand() % 10 + 6);
        ptrs.push_back(buddy.allocate(size));

        if (rand() % 2 && !ptrs.empty()) {
            buddy.deallocate(ptrs.back());
            ptrs.pop_back();
        }
    }

    size_t buddy_usage = buddy.get_memory_usage();

    printf("일반 malloc: %zu MB (단편화 심함), ", malloc_usage / 1024 / 1024);
    printf("Buddy System: %zu MB (단편화 최소), ", buddy_usage / 1024 / 1024);
    // 결과: Buddy가 20-30% 적은 메모리 사용!
}
```

## 핵심 요점

### 1. Memory Pool의 활용

Frame Allocator와 Ring Buffer 등 특수 목적의 할당자로 성능과 예측 가능성을 극대화할 수 있습니다.

### 2. Slab Allocator 효율성

동일 크기 객체 전용으로 설계하여 단편화 없는 효율적인 메모리 관리를 제공합니다.

### 3. Buddy System의 균형

2의 거듭제곱 크기 관리로 할당 속도와 단편화 최소화의 균형을 잘 잡은 알고리즘입니다.

---

**이전**: [08-11-allocator-comparison.md](./08-01-03-allocator-comparison.md)  
**다음**: [08-30-production-optimization.md](chapter-09-advanced-memory-management/08-30-production-optimization.md)에서 실전 최적화 사례를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: ADVANCED
-**주제**: 시스템 프로그래밍
-**예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-08-memory-allocator-gc)

- [8.1.2: 메모리 할당자의 내부 구현 개요](./08-01-02-memory-allocator.md)
- [8.1.1: malloc 내부 동작의 진실](./08-01-01-malloc-fundamentals.md)
- [8.1.3: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](./08-01-03-allocator-comparison.md)
- [Production: 실전 메모리 최적화 사례](../chapter-09-advanced-memory-management/08-30-production-optimization.md)
- [8.2.4: GC 알고리즘과 구현 원리 개요](./08-02-04-gc-algorithms.md)

### 🏷️ 관련 키워드

`memory_pool`, `slab_allocator`, `buddy_system`, `frame_allocator`, `ring_buffer`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
