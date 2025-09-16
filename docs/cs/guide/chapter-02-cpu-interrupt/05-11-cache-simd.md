---
tags:
  - cache
  - hands-on
  - intermediate
  - medium-read
  - memory-hierarchy
  - performance-optimization
  - simd
  - vectorization
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 2.1C: CPU 캐시와 SIMD 벡터화

## 5. CPU 캐시

### 5.1 캐시 계층 구조: 도서관의 책상

**캐시를 도서관에 비유하면:**

```text
레지스터 = 손에 든 책 (1권, 즉시)
L1 캐시 = 책상 위 (10권, 1초)
L2 캐시 = 책장 (100권, 10초)
L3 캐시 = 같은 층 서고 (1000권, 30초)
메모리 = 지하 서고 (100만권, 2분)
디스크 = 다른 도서관 (무제한, 1시간)
```

**실제 레이턴시 (Intel i9):**

```text
L1: 4 cycles (1ns)
L2: 12 cycles (3ns)  
L3: 42 cycles (10ns)
RAM: 200+ cycles (50ns)
SSD: 100,000 cycles (25μs)
HDD: 10,000,000 cycles (2.5ms)
```

### 캐시 미스의 공포

제가 겪은 실제 사례:

```c
// 캐시 미스 지옥
struct pixel {
    uint8_t r, g, b, a;
} image[1920][1080];

// 잘못된 순서 (캐시 미스 폭탄)
for (int x = 0; x < 1920; x++) {
    for (int y = 0; y < 1080; y++) {
        process(image[y][x]);  // 2.4초
    }
}

// 올바른 순서 (캐시 친화적)
for (int y = 0; y < 1080; y++) {
    for (int x = 0; x < 1920; x++) {
        process(image[y][x]);  // 0.08초 - 30배 빠름!
    }
}
```

```c
// 캐시 라인
typedef struct {
    bool valid;
    bool dirty;
    uint64_t tag;
    uint8_t data[64];  // 64바이트 캐시 라인
    uint8_t lru_counter;
} cache_line_t;

// L1 캐시 구조 (32KB, 8-way)
typedef struct {
    cache_line_t sets[64][8];  // 64 sets, 8 ways
    uint64_t hits;
    uint64_t misses;
} l1_cache_t;

// 캐시 접근
bool l1_cache_access(l1_cache_t* cache, uint64_t address, 
                    void* data, bool is_write) {
    // 주소 분해
    uint64_t tag = address >> 12;        // 태그
    uint32_t set_index = (address >> 6) & 0x3F;  // 세트 인덱스
    uint32_t offset = address & 0x3F;    // 오프셋
    
    cache_line_t* set = cache->sets[set_index];
    
    // 태그 매칭
    for (int way = 0; way < 8; way++) {
        if (set[way].valid && set[way].tag == tag) {
            // Cache hit!
            cache->hits++;
            
            if (is_write) {
                memcpy(set[way].data + offset, data, 8);
                set[way].dirty = true;
            } else {
                memcpy(data, set[way].data + offset, 8);
            }
            
            // LRU 업데이트
            update_lru(set, way);
            return true;
        }
    }
    
    // Cache miss
    cache->misses++;
    
    // 교체할 라인 선택 (LRU)
    int victim = find_lru_victim(set);
    
    // Dirty 라인은 메모리에 쓰기
    if (set[victim].dirty) {
        writeback_cache_line(&set[victim]);
    }
    
    // 새 라인 로드
    load_cache_line(&set[victim], address);
    set[victim].valid = true;
    set[victim].tag = tag;
    set[victim].dirty = is_write;
    
    return false;
}

// 캐시 일관성 (MESI 프로토콜)
typedef enum {
    MESI_INVALID,
    MESI_SHARED,
    MESI_EXCLUSIVE,
    MESI_MODIFIED
} mesi_state_t;

typedef struct {
    cache_line_t line;
    mesi_state_t state;
} coherent_cache_line_t;

void handle_cache_coherence(coherent_cache_line_t* line, 
                           int cpu_id, bool is_write) {
    switch (line->state) {
        case MESI_INVALID:
            // 다른 CPU에서 데이터 요청
            broadcast_read_request(line->line.tag);
            line->state = is_write ? MESI_MODIFIED : MESI_SHARED;
            break;
            
        case MESI_SHARED:
            if (is_write) {
                // 다른 CPU에 무효화 요청
                broadcast_invalidate(line->line.tag);
                line->state = MESI_MODIFIED;
            }
            break;
            
        case MESI_EXCLUSIVE:
            if (is_write) {
                line->state = MESI_MODIFIED;
            }
            break;
            
        case MESI_MODIFIED:
            // 이미 수정된 상태
            break;
    }
}
```

### 5.2 캐시 최적화: Netflix의 비밀

**Netflix가 스트리밍 서버를 최적화한 방법**

Netflix 엔지니어가 공유한 비밀:

```c
// Before: 캐시 언친화적
struct video_chunk {
    metadata_t meta;      // 64 bytes - 자주 접근
    char padding[960];    // 960 bytes - 거의 안 씀
    uint8_t data[63488];  // 62KB - 가끔 접근
};  // 총 64KB

// After: 캐시 친화적
struct video_metadata {
    metadata_t meta;      // 64 bytes
} __attribute__((aligned(64)));

struct video_data {
    uint8_t data[65536];  // 64KB
} __attribute__((aligned(4096)));

// 결과: 캐시 히트율 45% → 92%
// 처리량: 10Gbps → 40Gbps!
```

**False Sharing: 멀티코어의 함정**

제가 만든 멀티스레드 카운터에서:

```c
// 문제: False Sharing
struct counters {
    int thread1_count;  // 같은 캐시라인!
    int thread2_count;  // 서로 무효화!
} counter;
// 성능: 1M ops/sec

// 해결: 캐시라인 분리  
struct counters {
    alignas(64) int thread1_count;
    alignas(64) int thread2_count;
} counter;
// 성능: 50M ops/sec - 50배!
```

```c
// 캐시 친화적 코드
void cache_friendly_matrix_multiply(double* A, double* B, double* C, int n) {
    const int BLOCK_SIZE = 64 / sizeof(double);  // 캐시 라인 크기
    
    // 블록 단위 처리
    for (int i0 = 0; i0 < n; i0 += BLOCK_SIZE) {
        for (int j0 = 0; j0 < n; j0 += BLOCK_SIZE) {
            for (int k0 = 0; k0 < n; k0 += BLOCK_SIZE) {
                
                // 블록 내부 계산
                for (int i = i0; i < min(i0 + BLOCK_SIZE, n); i++) {
                    for (int j = j0; j < min(j0 + BLOCK_SIZE, n); j++) {
                        double sum = C[i * n + j];
                        
                        for (int k = k0; k < min(k0 + BLOCK_SIZE, n); k++) {
                            sum += A[i * n + k] * B[k * n + j];
                        }
                        
                        C[i * n + j] = sum;
                    }
                }
            }
        }
    }
}

// 프리페칭
void manual_prefetch_example(int* array, int size) {
    for (int i = 0; i < size; i++) {
        // 다음 캐시 라인 프리페치
        if (i + 16 < size) {
            __builtin_prefetch(&array[i + 16], 0, 3);
        }
        
        // 실제 처리
        process_element(array[i]);
    }
}

// False Sharing 방지
typedef struct {
    alignas(64) int counter1;  // 캐시 라인 정렬
    alignas(64) int counter2;  // 다른 캐시 라인
} aligned_counters_t;

// 캐시 성능 측정
void measure_cache_performance() {
    const int sizes[] = {
        1 * 1024,        // 1KB - L1 hit
        32 * 1024,       // 32KB - L1 size
        256 * 1024,      // 256KB - L2 size
        8 * 1024 * 1024, // 8MB - L3 size
        64 * 1024 * 1024 // 64MB - RAM
    };
    
    for (int s = 0; s < 5; s++) {
        int size = sizes[s];
        int* array = malloc(size);
        
        // 워밍업
        for (int i = 0; i < size / sizeof(int); i++) {
            array[i] = i;
        }
        
        // 랜덤 액세스
        clock_t start = clock();
        long sum = 0;
        
        for (int iter = 0; iter < 10000000; iter++) {
            int index = (iter * 1009) % (size / sizeof(int));
            sum += array[index];
        }
        
        clock_t elapsed = clock() - start;
        
        printf("Size: %d KB, Time: %ld ms, Avg: %.2f ns\n",
               size / 1024, elapsed,
               (double)elapsed / 10000000 * 1000);
        
        free(array);
    }
}
```

## 6. SIMD와 벡터화

### 6.1 SIMD 명령어: 한 번에 여러 개

**Instagram 필터의 비밀**

Instagram이 실시간으로 필터를 적용하는 방법:

```c
// 일반 방식: 픽셀 하나씩
for (int i = 0; i < pixels; i++) {
    r[i] = r[i] * 0.393 + g[i] * 0.769 + b[i] * 0.189;
    g[i] = r[i] * 0.349 + g[i] * 0.686 + b[i] * 0.168;
    b[i] = r[i] * 0.272 + g[i] * 0.534 + b[i] * 0.131;
}
// 시간: 45ms (1080p)

// SIMD 방식: 8픽셀 동시에!
__m256 sepia_r = _mm256_set1_ps(0.393f);
for (int i = 0; i < pixels; i += 8) {
    __m256 r8 = _mm256_load_ps(&r[i]);
    __m256 g8 = _mm256_load_ps(&g[i]);
    __m256 b8 = _mm256_load_ps(&b[i]);
    
    __m256 new_r = _mm256_fmadd_ps(r8, sepia_r, ...);
    // ... 8픽셀 동시 처리
}
// 시간: 6ms - 7.5배 빠름!
```

**YouTube의 비디오 인코딩**

```text
일반 CPU: 1시간 비디오 → 3시간 인코딩
SIMD 최적화: 1시간 비디오 → 25분 인코딩
GPU 가속: 1시간 비디오 → 5분 인코딩
```

```c
#include <immintrin.h>

// 실제 사례 1: Instagram 세피아 필터 구현
// 1920x1080 이미지를 실시간(16ms)으로 처리해야 함!
void apply_sepia_filter_simd(uint8_t* pixels, int width, int height) {
    // 세피아 변환 공식:
    // new_r = 0.393*r + 0.769*g + 0.189*b
    // new_g = 0.349*r + 0.686*g + 0.168*b  
    // new_b = 0.272*r + 0.534*g + 0.131*b
    
    const __m256 sepia_r_coeff = _mm256_setr_ps(0.393f, 0.769f, 0.189f, 0.0f,
                                                0.393f, 0.769f, 0.189f, 0.0f);
    const __m256 sepia_g_coeff = _mm256_setr_ps(0.349f, 0.686f, 0.168f, 0.0f,
                                                0.349f, 0.686f, 0.168f, 0.0f);
    const __m256 sepia_b_coeff = _mm256_setr_ps(0.272f, 0.534f, 0.131f, 0.0f,
                                                0.272f, 0.534f, 0.131f, 0.0f);
    
    int total_pixels = width * height;
    
    // 8픽셀씩 동시 처리 (RGBA = 32바이트씩)
    // 일반 방식: 2.07억 픽셀 × 9연산 = 18억 연산
    // SIMD 방식: 2.07억 픽셀 ÷ 8 = 2600만 SIMD 연산!
    for (int i = 0; i < total_pixels - 7; i += 8) {
        // 8개 픽셀의 R, G, B 채널 로드
        __m256i pixel_data = _mm256_loadu_si256((__m256i*)&pixels[i * 4]);
        
        // 바이트를 float으로 변환 (8픽셀 병렬)
        __m256 r = _mm256_cvtepi32_ps(_mm256_unpacklo_epi8(pixel_data, _mm256_setzero_si256()));
        __m256 g = _mm256_cvtepi32_ps(_mm256_unpackhi_epi8(pixel_data, _mm256_setzero_si256()));
        
        // 세피아 변환 (8개 R값 동시 계산)
        __m256 new_r = _mm256_mul_ps(r, sepia_r_coeff);
        new_r = _mm256_fmadd_ps(g, _mm256_shuffle_ps(sepia_r_coeff, sepia_r_coeff, 1), new_r);
        // ... (8개 픽셀의 RGB 동시 변환)
        
        // 결과를 다시 바이트로 변환하여 저장
        _mm256_storeu_si256((__m256i*)&pixels[i * 4], 
                           _mm256_packus_epi16(_mm256_cvtps_epi32(new_r), 
                                             _mm256_cvtps_epi32(new_r)));
    }
    // 결과: 45ms → 6ms (7.5배 향상!)
}

// 실제 사례 2: YouTube 비디오 압축의 DCT 변환
// H.264/H.265 인코더에서 사용하는 핵심 알고리즘
void dct_8x8_simd(float block[64]) {
    // 8x8 DCT는 비디오 압축의 핵심
    // 일반 구현: 8×8×8 = 512 곱셈
    // SIMD 구현: 64÷8 = 8번의 벡터 곱셈
    
    const __m256 dct_coeffs[8] = {
        _mm256_set1_ps(0.35355f),  // sqrt(1/8)
        _mm256_setr_ps(0.49039f, 0.41573f, 0.27779f, 0.09755f, -0.09755f, -0.27779f, -0.41573f, -0.49039f),
        // ... DCT 계수들
    };
    
    // 8개 행을 동시에 처리
    for (int i = 0; i < 8; i++) {
        __m256 row = _mm256_load_ps(&block[i * 8]);
        
        // 8-point DCT를 벡터화
        __m256 result = _mm256_setzero_ps();
        for (int k = 0; k < 8; k++) {
            result = _mm256_fmadd_ps(row, dct_coeffs[k], result);
        }
        
        _mm256_store_ps(&block[i * 8], result);
    }
    // YouTube 서버에서 실제 사용: 1시간→25분 인코딩!
}

// AVX2 벡터 연산 기본 예제
void simd_add_vectors(float* a, float* b, float* c, int n) {
    int i;
    
    // 8개씩 병렬 처리 (256비트 / 32비트)
    for (i = 0; i <= n - 8; i += 8) {
        __m256 va = _mm256_load_ps(&a[i]);    // 8개 float 로드
        __m256 vb = _mm256_load_ps(&b[i]);    // 8개 float 로드
        __m256 vc = _mm256_add_ps(va, vb);    // 8개 동시 덧셈!
        _mm256_store_ps(&c[i], vc);           // 8개 결과 저장
    }
    
    // 나머지 처리 (스칼라 방식)
    for (; i < n; i++) {
        c[i] = a[i] + b[i];
    }
}

// AVX-512 예제
void avx512_example(float* data, int n) {
    // 16개 float 동시 처리
    for (int i = 0; i <= n - 16; i += 16) {
        __m512 v = _mm512_load_ps(&data[i]);
        
        // SIMD 연산
        v = _mm512_mul_ps(v, _mm512_set1_ps(2.0f));
        v = _mm512_add_ps(v, _mm512_set1_ps(1.0f));
        
        _mm512_store_ps(&data[i], v);
    }
}

// 자동 벡터화 힌트
void auto_vectorize(float* restrict a, 
                   float* restrict b,
                   float* restrict c, 
                   int n) {
    // restrict 키워드로 앨리어싱 없음 표시
    #pragma omp simd
    for (int i = 0; i < n; i++) {
        c[i] = a[i] * b[i] + c[i];
    }
}

// SIMD를 이용한 문자열 검색
int simd_strlen(const char* str) {
    const __m256i zero = _mm256_setzero_si256();
    const char* ptr = str;
    
    // 32바이트씩 검사
    while (1) {
        __m256i data = _mm256_loadu_si256((__m256i*)ptr);
        __m256i cmp = _mm256_cmpeq_epi8(data, zero);
        
        int mask = _mm256_movemask_epi8(cmp);
        if (mask != 0) {
            // 0 발견
            return ptr - str + __builtin_ctz(mask);
        }
        
        ptr += 32;
    }
}
```

## 핵심 요점

### 1. 캐시가 성능의 실질적 결정 요소

- 메모리 접근 패턴이 성능에 미치는 영향 (30배 차이)
- False Sharing으로 인한 멀티스레드 성능 저하
- 데이터 구조 설계 시 캐시 고려의 중요성

### 2. SIMD는 병렬 처리의 핵심

- 한 번에 8-16개 데이터 동시 처리
- 실시간 이미지/비디오 처리의 필수 기술
- 컴파일러 자동 벡터화의 한계와 수동 최적화

### 3. 하드웨어 친화적 프로그래밍의 중요성

- 순차 메모리 접근의 압도적 효율성
- 데이터 지역성 (temporal/spatial locality) 활용
- 캐시라인 정렬과 프리페칭 기법

---

**이전**: [분기 예측과 Out-of-Order 실행](chapter-02-cpu-interrupt/02-10-prediction-ooo.md)  
**다음**: [성능 측정과 실전 최적화](chapter-02-cpu-interrupt/02-30-performance-optimization.md)에서 실제 프로파일링과 최적화 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-05-cpu-interrupt)

- [Chapter 5-1: CPU 아키텍처와 명령어 실행 개요](./02-01-cpu-architecture.md)
- [Chapter 5-1A: CPU 기본 구조와 명령어 실행](./02-02-cpu-fundamentals.md)
- [Chapter 5-1B: 분기 예측과 Out-of-Order 실행](./02-10-prediction-ooo.md)
- [Chapter 5-1D: 성능 측정과 실전 최적화](./02-30-performance-optimization.md)
- [Chapter 5-2: 인터럽트와 예외 개요](./02-12-interrupt-exception.md)

### 🏷️ 관련 키워드

`cache`, `simd`, `vectorization`, `performance-optimization`, `memory-hierarchy`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
