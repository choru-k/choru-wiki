---
tags:
  - cache-optimization
  - cpu-profiling
  - hands-on
  - intermediate
  - medium-read
  - perf
  - performance-optimization
  - simd
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 2.1.5: 성능 최적화

## 7. CPU 성능 측정

### 7.1 성능 카운터: 진짜 병목 찾기

**내가 3일 동안 삽질한 이유**

게임이 느려서 최적화하려고 프로파일링:

```text
Function Time:
- render(): 45%
- physics(): 30%
- AI(): 25%
```

"렌더링이 문제구나!" → 3일 동안 렌더링 최적화 → 변화 없음 😭

**perf로 진짜 원인 발견:**

```bash
$ perf stat ./game
L3-cache-misses: 45,234,123 (89% of all cache refs)
Branch-misses: 12,345,678 (15% of all branches)
```

진짜 문제는**캐시 미스**였습니다!

데이터 구조를 바꾸니:

```c
// Before: AoS (Array of Structures)
struct Entity {
    vec3 position;    // 12 bytes
    vec3 velocity;    // 12 bytes  
    int health;       // 4 bytes
    char name[100];   // 100 bytes
    // ... 총 256 bytes
} entities[10000];

// After: SoA (Structure of Arrays)
struct Entities {
    vec3 positions[10000];   // 연속된 위치 데이터
    vec3 velocities[10000];  // 연속된 속도 데이터
    // 물리 연산 시 필요한 것만 로드!
};

// 결과: 60 FPS → 144 FPS!
```

```c
// CPU 사이클 측정
static inline uint64_t rdtsc() {
    unsigned int lo, hi;
    __asm__ volatile("rdtsc" : "=a"(lo), "=d"(hi));
    return ((uint64_t)hi << 32) | lo;
}

// 명령어별 사이클 측정
void measure_instruction_latency() {
    const int iterations = 1000000;
    uint64_t start, end;
    volatile int dummy = 0;
    
    // ADD 레이턴시
    start = rdtsc();
    for (int i = 0; i < iterations; i++) {
        __asm__ volatile("add $1, %0" : "+r"(dummy));
    }
    end = rdtsc();
    printf("ADD: %.2f cycles\n", 
           (double)(end - start) / iterations);
    
    // MUL 레이턴시
    start = rdtsc();
    for (int i = 0; i < iterations; i++) {
        __asm__ volatile("imul $3, %0" : "+r"(dummy));
    }
    end = rdtsc();
    printf("MUL: %.2f cycles\n",
           (double)(end - start) / iterations);
    
    // DIV 레이턴시
    dummy = 1000;
    start = rdtsc();
    for (int i = 0; i < iterations; i++) {
        __asm__ volatile("idiv %0" : "+r"(dummy));
    }
    end = rdtsc();
    printf("DIV: %.2f cycles\n",
           (double)(end - start) / iterations);
}

// perf 이벤트 활용
#include <linux/perf_event.h>

void setup_perf_counter() {
    struct perf_event_attr attr;
    memset(&attr, 0, sizeof(attr));
    
    attr.type = PERF_TYPE_HARDWARE;
    attr.size = sizeof(attr);
    attr.config = PERF_COUNT_HW_CPU_CYCLES;
    
    int fd = syscall(__NR_perf_event_open, &attr, 0, -1, -1, 0);
    
    // 측정 시작
    ioctl(fd, PERF_EVENT_IOC_RESET, 0);
    ioctl(fd, PERF_EVENT_IOC_ENABLE, 0);
    
    // 작업 수행
    do_work();
    
    // 결과 읽기
    long long cycles;
    read(fd, &cycles, sizeof(cycles));
    printf("CPU cycles: %lld\n", cycles);
    
    close(fd);
}
```

## 8. 실전: CPU 최적화

### 8.1 최적화 기법: 실제로 효과 있는 것들

**10년간 최적화하며 배운 우선순위:**

```text
1. 알고리즘 개선 (100-1000x)
2. 캐시 최적화 (10-50x)
3. SIMD 벡터화 (4-16x)
4. 병렬화 (2-8x)
5. 컴파일러 플래그 (1.1-1.5x)
6. 어셈블리 수동 최적화 (1.01-1.1x) ← 시간 낭비!
```

**실제 사례: JSON 파서 최적화**

```c
// Step 1: 기본 구현
parse_json(data);  // 100MB/s

// Step 2: 브랜치 제거
parse_json_branchless(data);  // 200MB/s

// Step 3: SIMD 적용
parse_json_simd(data);  // 800MB/s

// Step 4: 캐시 프리페치
parse_json_prefetch(data);  // 1.2GB/s

// Step 5: 병렬화
parse_json_parallel(data);  // 4.5GB/s
```

**최적화의 함정**

Donald Knuth의 명언:
> "Premature optimization is the root of all evil"

하지만 제 경험:
> "No optimization is the root of all lag" 😄

```c
// 루프 언롤링
void loop_unrolling(int* array, int n) {
    int i;
    
    // 4개씩 처리
    for (i = 0; i <= n - 4; i += 4) {
        array[i] *= 2;
        array[i+1] *= 2;
        array[i+2] *= 2;
        array[i+3] *= 2;
    }
    
    // 나머지
    for (; i < n; i++) {
        array[i] *= 2;
    }
}

// 명령어 수준 병렬성
void instruction_level_parallelism(float* a, float* b, int n) {
    // 종속성 있는 버전
    float sum = 0;
    for (int i = 0; i < n; i++) {
        sum += a[i] * b[i];  // 각 반복이 이전 결과에 종속
    }
    
    // ILP 활용 버전
    float sum0 = 0, sum1 = 0, sum2 = 0, sum3 = 0;
    int i;
    
    for (i = 0; i <= n - 4; i += 4) {
        sum0 += a[i] * b[i];
        sum1 += a[i+1] * b[i+1];
        sum2 += a[i+2] * b[i+2];
        sum3 += a[i+3] * b[i+3];
    }
    
    for (; i < n; i++) {
        sum0 += a[i] * b[i];
    }
    
    float total = sum0 + sum1 + sum2 + sum3;
}

// CPU 친화도 설정
void set_cpu_affinity_for_performance() {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    
    // Performance 코어에만 바인딩 (예: 0-7)
    for (int i = 0; i < 8; i++) {
        CPU_SET(i, &cpuset);
    }
    
    pthread_setaffinity_np(pthread_self(), sizeof(cpuset), &cpuset);
}
```

## 9. 정리: CPU 아키텍처의 핵심

### 🎯 10년간 CPU와 싸우며 배운 것

### CPU란?

-**구성**: 제어 유닛, ALU, 레지스터, 캐시
-**동작**: Fetch-Decode-Execute 사이클
-**최적화**: 파이프라인, OoO, 캐시

### 주요 기술

1.**파이프라인**: 명령어 중첩 실행
2.**분기 예측**: 파이프라인 효율 극대화
3.**Out-of-Order**: 명령어 재정렬
4.**캐시**: 메모리 접근 가속
5.**SIMD**: 데이터 병렬 처리

### 왜 중요한가?

1.**성능**: 프로그램 실행 속도 결정
2.**효율성**: 전력 대비 성능
3.**병렬성**: 멀티코어 활용
4.**최적화**: 하드웨어 특성 활용

### 기억해야 할 점

#### 1.**"CPU는 계산기가 아니라 예측기다"**

- 분기 예측: 95% 정확도
- 메모리 프리페치: 다음 데이터 미리 로드
- 투기적 실행: 결과 미리 계산

#### 2.**실제 병목은 대부분 메모리**

```text
CPU 대기 시간의 60% = 메모리 대기
CPU 대기 시간의 20% = 분기 예측 실패
CPU 대기 시간의 20% = 실제 계산
```

#### 3.**최적화 체크리스트**

- [ ] 데이터 구조가 캐시 친화적인가?
- [ ] 분기를 예측 가능하게 만들 수 있나?
- [ ] SIMD로 병렬화 가능한가?
- [ ] False sharing은 없나?
- [ ] 메모리 접근 패턴이 순차적인가?

#### 4.**현대 CPU의 아이러니**

- ALU는 놀고 있다 (대부분 유휴)
- 캐시가 진짜 일꾼
- 예측기가 성능 결정
- 메모리가 병목

### 🎬 마지막 이야기

Jim Keller (AMD Zen 설계자)의 말:

> "우리는 더 이상 빠른 CPU를 만들지 않습니다.
> 우리는 똑똑한 CPU를 만듭니다.
> CPU는 미래를 예측하고,
> 필요한 것을 미리 준비하고,
> 쓸모없는 것은 버립니다.
>
> 마치... 좋은 비서처럼요."

다음에 코드를 작성할 때, CPU가 여러분의 코드를 어떻게 '이해'하고 '예측'하는지 생각해보세요. 그러면 더 나은 성능을 얻을 수 있을 겁니다. 🚀

## 핵심 요점

### 1. 성능 측정이 최적화의 출발점

- 함수별 시간 측정보다 하드웨어 카운터 활용
- perf 도구를 통한 실제 병목 지점 파악
- 캐시 미스, 분기 예측 실패 등 숨겨진 원인 발견

### 2. 최적화 우선순위의 중요성

- 알고리즘 개선이 가장 효과적 (100-1000배)
- 캐시 최적화와 SIMD가 실용적 (4-50배)
- 저수준 최적화는 효과 제한적 (1.01-1.5배)

### 3. 실전에서 검증된 최적화 기법

- 데이터 구조 변경 (AoS → SoA)
- 루프 언롤링과 명령어 수준 병렬성
- CPU 친화도 설정과 캐시 친화적 프로그래밍

### 다음 단계

- [인터럽트와 예외 처리](./02-02-02-interrupt-exception.md) - CPU 모드 전환 메커니즘
- [컨텍스트 스위칭](./02-03-03-context-switching.md) - Ring 전환과 상태 저장
- [전력 관리](./02-05-02-power-management.md) - CPU 상태 전환과 전력 최적화

### 연관 주제

- [파일 디스크립터의 내부 구조](../chapter-06-file-io/06-02-01-file-descriptor.md) - 시스템 콜과 모드 전환
- [블록 I/O와 디스크 스케줄링](../chapter-06-file-io/index.md) - 하드웨어 인터럽트와 CPU 처리 예정
- [비동기 I/O와 이벤트 기반 프로그래밍](../chapter-06-file-io/06-03-01-async-io-fundamentals.md) - 비동기 처리에서 CPU 효율성

## 다음 섹션 예고

다음 섹션(5-2)에서는**인터럽트와 예외 처리**를 다룹니다:

- 인터럽트 벡터와 핸들러
- 하드웨어/소프트웨어 인터럽트
- 예외와 트랩
- 인터럽트 우선순위와 중첩

CPU가 외부 이벤트를 처리하는 메커니즘을 탐구해봅시다!

---

**이전**: [CPU 캐시와 SIMD 벡터화](./02-01-04-cache-simd.md)  
**다음**: CPU 아키텍처 시리즈를 모두 완료했습니다! [인터럽트와 예외 처리](./02-02-02-interrupt-exception.md)로 넘어가거나 [CPU 아키텍처 개요](./02-01-01-cpu-architecture.md)에서 전체 내용을 다시 확인하세요.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 시스템 프로그래밍
-**예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-02-cpu-interrupt)

- [Chapter 2-1-1: CPU 아키텍처와 명령어 실행 개요](./02-01-01-cpu-architecture.md)
- [Chapter 2-1-2: CPU 기본 구조와 명령어 실행](./02-01-02-cpu-fundamentals.md)
- [Chapter 2-1-3: 분기 예측과 Out-of-Order 실행](./02-01-03-prediction-ooo.md)
- [Chapter 2-1-4: CPU 캐시와 SIMD 벡터화](./02-01-04-cache-simd.md)
- [Chapter 2-2-2: 인터럽트와 예외 개요](./02-02-02-interrupt-exception.md)

### 🏷️ 관련 키워드

`performance-optimization`, `cpu-profiling`, `perf`, `cache-optimization`, `simd`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
