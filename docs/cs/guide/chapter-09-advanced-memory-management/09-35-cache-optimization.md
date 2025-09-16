---
tags:
  - advanced
  - cache-optimization
  - deep-study
  - false-sharing
  - hands-on
  - memory-layout
  - numa
  - prefetching
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "20-30시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# Chapter 9-4C: Cache-friendly 자료구조와 NUMA 최적화

## 🎯 이 문서에서 다루는 내용

이 섹션에서는:

1. **캐시 계층 구조의 이해** - L1/L2/L3 캐시와 메모리 접근 비용
2. **Array of Structs vs Struct of Arrays** - 캐시 효율적인 데이터 배치
3. **False Sharing 방지** - 멀티스레드 환경에서의 캐시 라인 경합 해결
4. **NUMA-aware 프로그래밍** - 다중 소켓 시스템에서의 메모리 최적화

## 1. 캐시 계층 이해하기

### 1.1 메모리 계층과 성능 차이

```c++
// 캐시 미스의 비용
class CachePerformance {
public:
    static void measureLatency() {
        // Intel i7 기준
        printf("L1 Cache: 4 cycles (~1ns), ");
        printf("L2 Cache: 12 cycles (~3ns), ");
        printf("L3 Cache: 40 cycles (~10ns), ");
        printf("RAM: 200+ cycles (~60ns), ");

        // 60배 차이!
    }

    // Array of Structs (AoS) - 캐시 비효율적
    struct Particle_AoS {
        float x, y, z;       // position
        float vx, vy, vz;    // velocity
        float r, g, b, a;    // color
        float size;
        float lifetime;
        // 총 52 bytes
    };

    // Struct of Arrays (SoA) - 캐시 효율적
    struct ParticleSystem_SoA {
        float* x;
        float* y;
        float* z;
        float* vx;
        float* vy;
        float* vz;
        // ... 등등

        void updatePositions(int count) {
            // 캐시 라인에 16개 float 연속 로드
            for (int i = 0; i < count; i++) {
                x[i] += vx[i];  // 연속 메모리 접근
                y[i] += vy[i];
                z[i] += vz[i];
            }
        }
    };

    static void benchmark() {
        const int N = 1000000;

        // AoS 방식
        Particle_AoS* aos = new Particle_AoS[N];
        auto start = std::chrono::high_resolution_clock::now();
        for (int iter = 0; iter < 100; iter++) {
            for (int i = 0; i < N; i++) {
                aos[i].x += aos[i].vx;
                aos[i].y += aos[i].vy;
                aos[i].z += aos[i].vz;
            }
        }
        auto aos_time = std::chrono::high_resolution_clock::now() - start;

        // SoA 방식
        ParticleSystem_SoA soa;
        soa.x = new float[N];
        soa.y = new float[N];
        soa.z = new float[N];
        soa.vx = new float[N];
        soa.vy = new float[N];
        soa.vz = new float[N];

        start = std::chrono::high_resolution_clock::now();
        for (int iter = 0; iter < 100; iter++) {
            soa.updatePositions(N);
        }
        auto soa_time = std::chrono::high_resolution_clock::now() - start;

        printf("AoS: %ld ms, ",
            std::chrono::duration_cast<std::chrono::milliseconds>(aos_time).count());
        printf("SoA: %ld ms, ",
            std::chrono::duration_cast<std::chrono::milliseconds>(soa_time).count());

        // 결과:
        // AoS: 450 ms
        // SoA: 120 ms (3.75배 빠름!)
    }
};
```

## 2. False Sharing 방지

### 2.1 False Sharing 문제와 해결책

```c++
// False Sharing: 다른 스레드가 같은 캐시 라인 수정

// 문제 있는 코드
struct BadCounter {
    int counter1;  // Thread 1이 수정
    int counter2;  // Thread 2가 수정
    // 같은 캐시 라인(64 bytes)에 있어서 경합!
};

// 해결책 1: Padding
struct PaddedCounter {
    alignas(64) int counter1;  // 독립 캐시 라인
    alignas(64) int counter2;  // 독립 캐시 라인
};

// 해결책 2: C++17 hardware_destructive_interference_size
struct ModernCounter {
    alignas(std::hardware_destructive_interference_size) int counter1;
    alignas(std::hardware_destructive_interference_size) int counter2;
};
```

### 2.2 성능 테스트

```c++
// 성능 테스트
void testFalseSharing() {
    const int iterations = 100'000'000;

    // Bad version
    BadCounter bad;
    auto start = std::chrono::high_resolution_clock::now();

    std::thread t1([&]() {
        for (int i = 0; i < iterations; i++) {
            bad.counter1++;
        }
    });

    std::thread t2([&]() {
        for (int i = 0; i < iterations; i++) {
            bad.counter2++;
        }
    });

    t1.join();
    t2.join();
    auto bad_time = std::chrono::high_resolution_clock::now() - start;

    // Good version
    PaddedCounter good;
    start = std::chrono::high_resolution_clock::now();

    std::thread t3([&]() {
        for (int i = 0; i < iterations; i++) {
            good.counter1++;
        }
    });

    std::thread t4([&]() {
        for (int i = 0; i < iterations; i++) {
            good.counter2++;
        }
    });

    t3.join();
    t4.join();
    auto good_time = std::chrono::high_resolution_clock::now() - start;

    printf("With false sharing: %ld ms, ",
        std::chrono::duration_cast<std::chrono::milliseconds>(bad_time).count());
    printf("Without false sharing: %ld ms, ",
        std::chrono::duration_cast<std::chrono::milliseconds>(good_time).count());

    // 결과:
    // With false sharing: 800 ms
    // Without false sharing: 200 ms (4배 빠름!)
}
```

## 3. NUMA-aware 프로그래밍

### 3.1 NUMA 아키텍처 이해

```c++
// NUMA (Non-Uniform Memory Access) 최적화

#include <numa.h>
#include <numaif.h>

class NUMAOptimization {
public:
    static void* allocate_on_node(size_t size, int node) {
        // 특정 NUMA 노드에 메모리 할당
        void* ptr = numa_alloc_onnode(size, node);
        if (!ptr) {
            throw std::bad_alloc();
        }
        return ptr;
    }

    static void bind_thread_to_node(int node) {
        // 스레드를 특정 NUMA 노드에 바인딩
        struct bitmask* mask = numa_allocate_nodemask();
        numa_bitmask_setbit(mask, node);
        numa_bind(mask);
        numa_free_nodemask(mask);
    }

    static void optimize_for_numa() {
        int num_nodes = numa_num_configured_nodes();
        printf("NUMA nodes: %d, ", num_nodes);

        // 각 노드에 스레드와 데이터 할당
        std::vector<std::thread> threads;

        for (int node = 0; node < num_nodes; node++) {
            threads.emplace_back([node]() {
                // 스레드를 노드에 바인딩
                bind_thread_to_node(node);

                // 로컬 메모리 할당
                size_t size = 1024 * 1024 * 1024;  // 1GB
                void* local_mem = allocate_on_node(size, node);

                // 로컬 메모리에서 작업
                process_data(local_mem, size);

                numa_free(local_mem, size);
            });
        }

        for (auto& t : threads) {
            t.join();
        }
    }

    // NUMA 통계
    static void print_numa_stats() {
        long pages = 1000;
        void* addr = numa_alloc_local(pages * 4096);

        int* status = new int[pages];
        void** addrs = new void*[pages];

        for (int i = 0; i < pages; i++) {
            addrs[i] = (char*)addr + i * 4096;
        }

        move_pages(0, pages, addrs, nullptr, status, 0);

        std::map<int, int> node_count;
        for (int i = 0; i < pages; i++) {
            node_count[status[i]]++;
        }

        for (auto& [node, count] : node_count) {
            printf("Node %d: %d pages, ", node, count);
        }
    }
};
```

### 3.2 NUMA 성능 벤치마크

```c++
// NUMA 성능 차이
void numa_benchmark() {
    const size_t SIZE = 1024 * 1024 * 1024;  // 1GB

    // Remote access
    int remote_node = (numa_node_of_cpu(sched_getcpu()) + 1) %
                      numa_num_configured_nodes();
    void* remote_mem = numa_alloc_onnode(SIZE, remote_node);

    auto start = std::chrono::high_resolution_clock::now();
    memset(remote_mem, 0, SIZE);
    auto remote_time = std::chrono::high_resolution_clock::now() - start;

    // Local access
    void* local_mem = numa_alloc_local(SIZE);

    start = std::chrono::high_resolution_clock::now();
    memset(local_mem, 0, SIZE);
    auto local_time = std::chrono::high_resolution_clock::now() - start;

    printf("Remote NUMA access: %ld ms, ",
        std::chrono::duration_cast<std::chrono::milliseconds>(remote_time).count());
    printf("Local NUMA access: %ld ms, ",
        std::chrono::duration_cast<std::chrono::milliseconds>(local_time).count());

    // 결과:
    // Remote NUMA access: 250 ms
    // Local NUMA access: 150 ms (40% 빠름!)
}
```

## 4. Cache-friendly 자료구조 설계

### 4.1 B+ Tree 최적화

```c++
// 캐시 효율적인 B+ Tree
template<typename Key, typename Value, int ORDER = 16>
class CacheFriendlyBPlusTree {
    struct Node {
        // 캐시 라인에 맞춰 설계 (64 bytes)
        int num_keys = 0;
        bool is_leaf = false;
        Key keys[ORDER - 1];
        
        // 내부 노드와 리프 노드를 union으로 구분
        union {
            Node* children[ORDER];      // 내부 노드
            Value values[ORDER - 1];   // 리프 노드
        };
        Node* next = nullptr;  // 리프 노드 링크
        
        // 캐시 라인 경계에 맞춰 정렬
    } __attribute__((packed, aligned(64)));
    
    Node* root = nullptr;
    
public:
    void insert(const Key& key, const Value& value) {
        // Prefetch를 활용한 트리 탐색
        Node* current = root;
        while (current && !current->is_leaf) {
            int pos = binary_search(current->keys, current->num_keys, key);
            Node* next = current->children[pos];
            
            // 다음 노드를 미리 캐시에 로드
            __builtin_prefetch(next, 0, 3);
            current = next;
        }
        
        // 삽입 로직...
    }
    
private:
    int binary_search(Key* keys, int size, const Key& key) {
        // SIMD를 활용한 빠른 검색도 가능
        return std::lower_bound(keys, keys + size, key) - keys;
    }
};
```

### 4.2 Hash Table 최적화

```c++
// Robin Hood Hashing with Cache Optimization
template<typename Key, typename Value>
class CacheOptimizedHashTable {
    struct Entry {
        Key key;
        Value value;
        uint8_t distance = 0;  // Robin Hood distance
        bool occupied = false;
    };
    
    // 캐시 라인에 여러 엔트리가 들어가도록 설계
    static constexpr size_t ENTRIES_PER_CACHE_LINE = 64 / sizeof(Entry);
    
    std::vector<Entry> table;
    size_t capacity;
    size_t size = 0;
    
public:
    CacheOptimizedHashTable(size_t initial_capacity = 1024) 
        : capacity(initial_capacity), table(capacity) {}
    
    void insert(const Key& key, const Value& value) {
        size_t index = hash(key) % capacity;
        uint8_t distance = 0;
        
        Entry new_entry{key, value, distance, true};
        
        while (true) {
            // 현재 캐시 라인의 모든 엔트리를 미리 로드
            size_t cache_line_start = index & ~(ENTRIES_PER_CACHE_LINE - 1);
            __builtin_prefetch(&table[cache_line_start], 1, 3);
            
            Entry& current = table[index];
            
            if (!current.occupied) {
                current = new_entry;
                size++;
                return;
            }
            
            // Robin Hood: 거리가 더 긴 엔트리가 자리를 차지
            if (distance > current.distance) {
                std::swap(current, new_entry);
                distance = current.distance;
            }
            
            index = (index + 1) % capacity;
            distance++;
        }
    }
    
private:
    size_t hash(const Key& key) const {
        // 빠른 해시 함수 (예: xxHash)
        return std::hash<Key>{}(key);
    }
};
```

## 5. 메모리 접근 패턴 최적화

### 5.1 Loop Tiling (블록화)

```c++
// Matrix 곱셈 최적화
void matrix_multiply_optimized(float* A, float* B, float* C, int N) {
    const int BLOCK_SIZE = 64;  // L1 캐시에 맞는 크기
    
    for (int ii = 0; ii < N; ii += BLOCK_SIZE) {
        for (int jj = 0; jj < N; jj += BLOCK_SIZE) {
            for (int kk = 0; kk < N; kk += BLOCK_SIZE) {
                // 블록 단위로 처리
                int i_end = std::min(ii + BLOCK_SIZE, N);
                int j_end = std::min(jj + BLOCK_SIZE, N);
                int k_end = std::min(kk + BLOCK_SIZE, N);
                
                for (int i = ii; i < i_end; i++) {
                    for (int j = jj; j < j_end; j++) {
                        float sum = C[i * N + j];
                        for (int k = kk; k < k_end; k++) {
                            sum += A[i * N + k] * B[k * N + j];
                        }
                        C[i * N + j] = sum;
                    }
                }
            }
        }
    }
}
```

### 5.2 Prefetching 활용

```c++
// 수동 프리페칭
void prefetch_example(int* data, int size) {
    const int PREFETCH_DISTANCE = 64;  // 64 요소 앞서 프리페치
    
    for (int i = 0; i < size; i++) {
        // 미래 데이터를 미리 캐시에 로드
        if (i + PREFETCH_DISTANCE < size) {
            __builtin_prefetch(&data[i + PREFETCH_DISTANCE], 0, 3);
        }
        
        // 현재 데이터 처리
        data[i] = compute(data[i]);
    }
}

// 소프트웨어 프리페칭을 위한 래퍼
class PrefetchHelper {
public:
    template<typename T>
    static void prefetch_read(const T* ptr, int temporal_locality = 3) {
        __builtin_prefetch(ptr, 0, temporal_locality);
    }
    
    template<typename T>
    static void prefetch_write(T* ptr, int temporal_locality = 3) {
        __builtin_prefetch(ptr, 1, temporal_locality);
    }
    
    // NT (Non-Temporal) 스토어 - 캐시를 우회
    static void store_nt(void* dst, const void* src, size_t size) {
        // AVX를 활용한 non-temporal store
        const char* s = static_cast<const char*>(src);
        char* d = static_cast<char*>(dst);
        
        for (size_t i = 0; i < size; i += 32) {
            __m256i data = _mm256_load_si256(
                reinterpret_cast<const __m256i*>(s + i));
            _mm256_stream_si256(reinterpret_cast<__m256i*>(d + i), data);
        }
        _mm_sfence();  // 메모리 순서 보장
    }
};
```

## 핵심 요점

### 1. 캐시 최적화 전략

- **Spatial Locality**: 연속된 메모리 접근 패턴 설계
- **Temporal Locality**: 자주 사용하는 데이터를 캐시에 유지
- **Data Layout**: SoA 패턴으로 캐시 효율성 극대화

### 2. False Sharing 방지

- **Cache Line Alignment**: 독립적인 데이터를 별도 캐시 라인에 배치
- **Padding 활용**: alignas 지시어로 메모리 정렬
- **스레드별 데이터 분리**: 각 스레드가 독립적인 메모리 영역 사용

### 3. NUMA 최적화

- **메모리 Locality**: 스레드와 데이터를 같은 NUMA 노드에 배치
- **Load Balancing**: 노드별 워크로드 균등 분배
- **Migration 최소화**: 데이터 이동 비용 최소화

### 4. 고급 기법

- **Prefetching**: 미래 데이터를 미리 캐시에 로드
- **Loop Tiling**: 캐시 크기에 맞는 블록 단위 처리
- **SIMD 활용**: 벡터화로 처리량 극대화

---

**이전**: [04b-zero-allocation-programming.md](chapter-09-advanced-memory-management/04b-zero-allocation-programming.md)  
**다음**: [09-36-real-world-optimization.md](chapter-09-advanced-memory-management/09-36-real-world-optimization.md)에서 실제 기업들의 최적화 사례를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 20-30시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-09-memory-gc)

- [Chapter 9-1: 메모리 할당자의 내부 구현 개요](../chapter-08-memory-allocator-gc/09-10-memory-allocator.md)
- [Chapter 9-1A: malloc 내부 동작의 진실](../chapter-08-memory-allocator-gc/09-01-malloc-fundamentals.md)
- [Chapter 9-1B: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](../chapter-08-memory-allocator-gc/09-11-allocator-comparison.md)
- [Chapter 9-1C: 커스텀 메모리 할당자 구현](../chapter-08-memory-allocator-gc/09-12-custom-allocators.md)
- [Chapter 9-1D: 실전 메모리 최적화 사례](./09-30-production-optimization.md)

### 🏷️ 관련 키워드

`cache-optimization`, `numa`, `false-sharing`, `prefetching`, `memory-layout`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
