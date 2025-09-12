---
tags:
  - Stack
  - Heap
  - Memory Management
  - Computer Science
  - Overview
---

# Chapter 2-2: 스택과 힙은 어떻게 동작하는가 개요

## 🎯 스택과 힙: 메모리 관리의 두 기둥

프로그램이 실행될 때 메모리는 어떻게 관리될까요? 자판기에서 음료를 사는 것처럼 즉석에서 빠르게 처리되는 방법이 있고, 창고에서 물건을 찾는 것처럼 시간은 걸리지만 다양한 선택이 가능한 방법이 있습니다. 스택과 힙이 바로 이런 차이를 보여주는 메모리 관리의 핵심 메커니즘입니다.

## 📚 학습 로드맵

이 섹션은 5개의 전문화된 문서로 구성되어 있습니다:

### 1️⃣ [스택의 상세 동작](02a-stack-fundamentals.md)

- 함수 호출 시 스택에서 일어나는 일
- 스택 프레임과 함수 호출 규약
- 스택의 놀라운 속도 비밀
- 스택 관련 버그와 오버플로우

### 2️⃣ [힙의 상세 동작](02b-heap-fundamentals.md)

- malloc()의 내부 여정
- 메모리 청크와 Free List
- 메모리 단편화 문제
- 힙 메모리 관리 전략

### 3️⃣ [성능 비교와 메모리 버그](02c-performance-debugging.md)

- 스택 vs 힙 성능 대결
- 캐시 효과와 성능 차이 분석
- 스택과 힙에서 발생하는 대표적인 버그들
- 디버깅 도구 활용법

### 4️⃣ [고급 메모리 관리 기법](02d-advanced-techniques.md)

- 메모리 풀과 대량 생산의 효율성
- Arena 할당자로 한 번에 정리하기
- 게임과 서버에서의 실전 활용
- 성능 최적화 전략

### 5️⃣ [실전 가이드와 베스트 프랙티스](02e-practical-guide.md)

- 스택 vs 힙 결정 플로우차트
- 실제 시나리오별 권장사항
- 메모리 관리 베스트 프랙티스
- 핵심 요약과 다음 단계

## 🎯 핵심 개념 비교표

| 특징 | 스택 | 힙 | 설명 |
|------|------|----|---------|
| **속도** | 매우 빠름 (12ns) | 상대적으로 느림 (387ns) | 스택은 단순한 포인터 연산만 필요 |
| **관리** | 자동 | 수동 (malloc/free) | 스택은 함수 종료시 자동 정리 |
| **크기 제한** | 제한적 (~8MB) | 거의 무제한 | 스택 오버플로우 주의 |
| **접근 패턴** | LIFO (후입선출) | 임의 접근 | 스택은 순서가 정해져 있음 |
| **단편화** | 없음 | 발생 가능 | 힙은 메모리 조각화 문제 |
| **캐시 효율** | 높음 | 낮을 수 있음 | 스택은 지역성이 좋음 |

## 🚀 실전 활용 시나리오

### 스택 사용 권장 상황

- 작은 크기의 지역 변수 (< 1MB)
- 함수 매개변수와 리턴값
- 임시 계산용 버퍼
- 함수 내부에서만 사용하는 데이터

### 힙 사용 권장 상황

- 동적 크기가 필요한 경우
- 큰 데이터 구조 (이미지, 대용량 배열)
- 함수 밖으로 전달할 데이터
- 자료구조 (연결 리스트, 트리)

### 성능 최적화 전략

- **메모리 풀**: 같은 크기 객체 반복 할당시
- **Arena 할당자**: 관련 할당의 그룹화
- **스택 우선**: 가능한 한 스택 사용

## 🎭 학습 전략

### 초보자 (추천 순서)

1. [스택 기초](02a-stack-fundamentals.md) → 함수 호출 메커니즘 이해
2. [힙 기초](02b-heap-fundamentals.md) → 동적 메모리 할당 학습
3. [성능과 버그](02c-performance-debugging.md) → 실전 문제 해결 능력 개발
4. 간단한 메모리 관리 프로그램 작성 연습

### 중급자 (심화 학습)

1. [고급 기법](02d-advanced-techniques.md) → 성능 최적화 기술
2. [실전 가이드](02e-practical-guide.md) → 상황별 최적 선택
3. 실제 프로덕션 환경에서 메모리 프로파일링 경험
4. 커스텀 할당자 구현 도전

### 고급자 (전문 지식)

1. 모든 문서를 통합적으로 학습
2. 운영체제별 메모리 관리 차이점 연구
3. 고성능 시스템 설계에 메모리 최적화 적용

## 🔗 연관 학습

### 선행 학습

- [Chapter 2-1: 프로세스 메모리 구조](01-process-memory.md) - 메모리 세그먼트 이해

### 후속 학습

- [Chapter 2-3: 가상 메모리와 페이징](03-virtual-memory.md) - 메모리 추상화
- [Chapter 2-4: 메모리 매핑과 공유 메모리](04-memory-mapping.md) - 고급 메모리 기법

## 📊 이 섹션에서 배우게 될 핵심 질문들

- 함수를 호출할 때 스택에서 정확히 무슨 일이 일어나는가?
- malloc()은 내부적으로 어떻게 메모리를 찾아 할당하는가?
- 왜 스택은 빠르고 힙은 상대적으로 느린가?
- 메모리 누수는 어떻게 발생하고 어떻게 찾을 수 있는가?
- 스택 오버플로우와 힙 오버플로우의 차이는?
- 언제 스택을 사용하고 언제 힙을 사용해야 하는가?
- 메모리 관련 버그를 어떻게 예방하고 디버깅할 수 있는가?

---

**다음**: [스택의 상세 동작](02a-stack-fundamentals.md)에서 함수 호출의 발레와 같은 우아한 메커니즘을 탐구합니다.

## 1. 스택의 상세 동작: 함수 호출의 발레

### 1.1 함수 호출은 춤과 같다

함수 호출은 마치 잘 짜인 안무와 같습니다. 각 함수는 무대(스택)에 올라와 자신의 공연을 하고, 끝나면 깔끔하게 퇴장합니다. 다음 함수가 정확히 같은 자리를 사용할 수 있도록 말이죠.

실제 예제를 통해 이 춤사위를 관찰해봅시다:

```c
// stack_dance.c
#include <stdio.h>

int add(int a, int b) {
    int sum = a + b;
    printf("add: a=%d, b=%d, sum=%d, ", a, b, sum);
    printf("     &a=%p, &b=%p, &sum=%p, ", &a, &b, &sum);
    return sum;
}

int multiply(int x, int y) {
    int product = x * y;
    int doubled = add(product, product);  // add 호출
    printf("multiply: product=%d, doubled=%d, ", product, doubled);
    return doubled;
}

int main() {
    printf("=== 함수 호출의 춤 ===, ");
    int result = multiply(3, 4);
    printf("Final result: %d, ", result);
    return 0;
}
```

실행하면 무엇을 볼 수 있을까요?

```text
=== 함수 호출의 춤 ===
add: a=12, b=12, sum=24
     &a=0x7ffe5c3b7a2c, &b=0x7ffe5c3b7a28, &sum=0x7ffe5c3b7a24
multiply: product=12, doubled=24
Final result: 24
```

주소를 보세요! `add` 함수의 지역 변수들이 낮은 주소에 있습니다. 이것은 스택이 높은 주소에서 낮은 주소로 "자라기" 때문입니다.

### 1.2 스택 프레임: 함수의 무대

각 함수가 호출될 때 스택에는 '스택 프레임'이라는 무대가 만들어집니다. 이 무대에는 함수가 필요한 모든 것이 준비됩니다:

```text
multiply(3, 4) 호출 시 스택 상태:

높은 주소 (스택의 바닥)
┌─────────────────────────┐
│  main의 리턴 주소       │ ← 운영체제로 돌아갈 주소
├─────────────────────────┤
│  main의 이전 rbp        │ ← main 이전의 베이스 포인터
├─────────────────────────┤ ← rbp (main의 베이스)
│  result (미정)          │
├─────────────────────────┤
│  multiply 리턴 주소     │ ← main으로 돌아갈 주소
├─────────────────────────┤
│  main의 rbp 백업        │
├─────────────────────────┤ ← rbp (multiply의 베이스)
│  x = 3                  │ [rbp+16] 첫 번째 인자
├─────────────────────────┤
│  y = 4                  │ [rbp+24] 두 번째 인자
├─────────────────────────┤
│  product = 12           │ [rbp-8] 지역 변수
├─────────────────────────┤
│  doubled (미정)         │ [rbp-16] 지역 변수
├─────────────────────────┤ ← rsp (현재 스택 꼭대기)
│  (미사용 공간)          │
↓                         ↓
낮은 주소 (스택이 자라는 방향)
```

이 구조의 천재성은 무엇일까요? **rbp(Base Pointer)**를 기준으로 모든 변수의 위치를 알 수 있다는 것입니다!

- 인자는 rbp보다 높은 주소에 (양수 오프셋)
- 지역 변수는 rbp보다 낮은 주소에 (음수 오프셋)

### 1.3 함수 호출 규약: 국제 표준 같은 약속

함수 호출에는 엄격한 규칙이 있습니다. 마치 국제 우편 시스템처럼, 모든 참여자가 같은 규칙을 따라야 합니다.

x86-64 Linux에서는 이런 규칙을 따릅니다:

```c
// calling_convention.c
#include <stdio.h>

// 6개 이하의 인자: 레지스터 사용
int test_registers(int a, int b, int c, int d, int e, int f) {
    // a는 RDI에, b는 RSI에, c는 RDX에
    // d는 RCX에, e는 R8에, f는 R9에 전달됨
    return a + b + c + d + e + f;
}

// 7개 이상의 인자: 나머지는 스택 사용
int test_stack(int a, int b, int c, int d, int e, int f, int g, int h) {
    // 처음 6개는 레지스터, g와 h는 스택에 전달됨
    return a + b + c + d + e + f + g + h;
}

// 어셈블리로 직접 확인
void examine_assembly() {
    __asm__ volatile(
        "mov $1, %%edi, "    // 첫 번째 인자
        "mov $2, %%esi, "    // 두 번째 인자
        "mov $3, %%edx, "    // 세 번째 인자
        "mov $4, %%ecx, "    // 네 번째 인자
        "mov $5, %%r8d, "    // 다섯 번째 인자
        "mov $6, %%r9d, "    // 여섯 번째 인자
        ::: "edi", "esi", "edx", "ecx", "r8", "r9"
    );
}
```

왜 이렇게 복잡한 규칙이 필요할까요? 바로 **성능** 때문입니다! 레지스터는 메모리보다 100배 이상 빠릅니다. 자주 사용되는 처음 몇 개의 인자를 레지스터에 전달하면 성능이 크게 향상됩니다.

### 1.4 스택의 놀라운 속도 비밀

스택이 왜 그렇게 빠른지 실험해봅시다:

```c
// stack_speed_secret.c
#include <stdio.h>
#include <time.h>

#define ITERATIONS 100000000

// 스택 할당 테스트
void stack_allocation_test() {
    clock_t start = clock();

    for (long i = 0; i < ITERATIONS; i++) {
        int array[10];  // 스택 할당 - 단 1개 명령어!
        array[0] = i;   // 사용
        // 자동 해제 - 0개 명령어!
    }

    clock_t end = clock();
    double time_spent = ((double)(end - start)) / CLOCKS_PER_SEC;
    printf("스택 할당: %.3f초 (%.0f ns/할당), ",
           time_spent, time_spent * 1e9 / ITERATIONS);
}

// 어셈블리로 보는 스택 할당
void show_stack_assembly() {
    // 이 함수의 어셈블리를 보면:
    // sub rsp, 40    ; 40바이트 할당 (int[10])
    // ... 사용 ...
    // add rsp, 40    ; 40바이트 해제
    // ret

    int array[10];
    array[0] = 42;
}
```

스택 할당이 빠른 이유:

1. **단순한 포인터 연산**: `rsp -= size` 한 줄이면 끝!
2. **메타데이터 없음**: 크기나 상태를 기록할 필요 없음
3. **단편화 없음**: 항상 연속된 공간 사용
4. **캐시 친화적**: 최근 사용한 메모리 근처를 계속 사용

## 2. 힙의 상세 동작: 도시 계획과 같은 복잡성

### 2.1 malloc의 여정: 메모리를 찾아서

`malloc(100)`을 호출하면 무슨 일이 벌어질까요? 단순해 보이는 이 함수 뒤에는 복잡한 여정이 숨어있습니다:

```c
// malloc_journey.c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

void trace_malloc_journey() {
    printf("=== malloc의 여정 ===, ");

    // 1단계: 작은 할당
    printf(", 1. 작은 메모리 요청 (100 bytes), ");
    void* initial_brk = sbrk(0);
    printf("   힙 끝 주소: %p, ", initial_brk);

    char* small = malloc(100);
    printf("   할당된 주소: %p, ", small);

    void* new_brk = sbrk(0);
    printf("   새 힙 끝: %p, ", new_brk);
    printf("   힙 증가량: %ld bytes, ", (char*)new_brk - (char*)initial_brk);

    // 2단계: 또 다른 작은 할당
    printf(", 2. 또 다른 작은 요청 (200 bytes), ");
    char* small2 = malloc(200);
    printf("   할당된 주소: %p, ", small2);
    printf("   이전 할당과의 거리: %ld bytes, ", small2 - small);

    void* brk_after_second = sbrk(0);
    if (brk_after_second == new_brk) {
        printf("   힙 끝 변화 없음 - 기존 공간 재사용!, ");
    }

    // 3단계: 큰 할당
    printf(", 3. 큰 메모리 요청 (10MB), ");
    char* large = malloc(10 * 1024 * 1024);
    printf("   할당된 주소: %p, ", large);

    void* brk_after_large = sbrk(0);
    if (brk_after_large == brk_after_second) {
        printf("   힙 끝 변화 없음 - mmap 사용!, ");
        printf("   주소 차이: %ld MB, ",
               labs((long)large - (long)small2) / (1024*1024));
    }

    free(small);
    free(small2);
    free(large);
}
```

실행 결과:

```text
=== malloc의 여정 ===

1. 작은 메모리 요청 (100 bytes)
   힙 끝 주소: 0x55f4a9c2b000
   할당된 주소: 0x55f4a9c2b2a0
   새 힙 끝: 0x55f4a9c4c000
   힙 증가량: 135168 bytes

2. 또 다른 작은 요청 (200 bytes)
   할당된 주소: 0x55f4a9c2b310
   이전 할당과의 거리: 112 bytes
   힙 끝 변화 없음 - 기존 공간 재사용!

3. 큰 메모리 요청 (10MB)
   할당된 주소: 0x7f8a12345000
   힙 끝 변화 없음 - mmap 사용!
   주소 차이: 32156 MB
```

놀랍지 않나요? malloc은:

1. 작은 요청에는 **brk**로 힙을 확장합니다
2. 하지만 실제 요청보다 **훨씬 많이** 확장합니다 (135KB!)
3. 큰 요청에는 **mmap**으로 완전히 다른 영역을 사용합니다

### 2.2 메모리 청크: 힙의 레고 블록

힙 메모리는 '청크(chunk)'라는 블록으로 관리됩니다. 각 청크는 레고 블록처럼 헤더를 가지고 있습니다:

```c
// chunk_structure.c
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>

// glibc malloc 청크 구조 (간략화)
struct malloc_chunk {
    size_t prev_size;  // 이전 청크 크기 (해제된 경우만)
    size_t size;       // 현재 청크 크기 + 플래그

    // 할당된 청크: 여기부터 사용자 데이터
    // 해제된 청크: 여기에 free list 포인터들
    union {
        struct {
            struct malloc_chunk* fd;  // forward pointer
            struct malloc_chunk* bk;  // backward pointer
        } free;
        char user_data[0];  // 사용자 데이터 시작
    };
};

void examine_chunk() {
    printf("=== 메모리 청크 해부 ===, ");

    // 할당
    int* ptr = malloc(sizeof(int) * 10);  // 40 bytes 요청

    // 청크 헤더 접근 (위험! 실제로는 하지 마세요)
    size_t* chunk = (size_t*)((char*)ptr - sizeof(size_t) * 2);

    printf("요청한 크기: 40 bytes, ");
    printf("청크 헤더 주소: %p, ", chunk);
    printf("사용자 포인터: %p, ", ptr);
    printf("실제 청크 크기: %zu bytes, ", chunk[1] & ~0x7);

    // 왜 요청한 것보다 클까?
    printf(", 왜 크기가 다를까?, ");
    printf("1. 헤더 오버헤드: 16 bytes, ");
    printf("2. 정렬 요구사항: 16 bytes 단위, ");
    printf("3. 최소 크기: 32 bytes, ");

    free(ptr);
}
```

청크 구조의 영리함:

- **할당된 청크**: 헤더 + 사용자 데이터
- **해제된 청크**: 헤더 + Free List 포인터 (사용자 데이터 영역 재활용!)
- **크기 필드의 하위 3비트**: 플래그로 사용 (PREV_INUSE, IS_MMAPPED, NON_MAIN_ARENA)

### 2.3 Free List: 빈 메모리의 연결 리스트

해제된 메모리는 버려지는 것이 아니라 '재활용 대기소'에 들어갑니다:

```c
// free_list_visualization.c
#include <stdio.h>
#include <stdlib.h>

void visualize_free_list() {
    printf("=== Free List 시각화 ===, , ");

    // 1. 여러 블록 할당
    printf("1단계: 4개 블록 할당, ");
    void* a = malloc(64);
    void* b = malloc(64);
    void* c = malloc(64);
    void* d = malloc(64);

    printf("A: %p, B: %p, C: %p, D: %p, ", a, b, c, d);
    printf("메모리 상태: [A][B][C][D], , ");

    // 2. 중간 블록들 해제
    printf("2단계: B와 C 해제, ");
    free(b);
    free(c);
    printf("메모리 상태: [A][빈][빈][D], ");
    printf("Free List: C -> B -> NULL, , ");

    // 3. 새로운 할당 요청
    printf("3단계: 64 bytes 요청, ");
    void* e = malloc(64);
    printf("E: %p (", e);
    if (e == c) printf("C 자리 재사용!), ");
    else if (e == b) printf("B 자리 재사용!), ");
    printf("Free List: B -> NULL, , ");

    // 4. 작은 할당 요청
    printf("4단계: 32 bytes 요청, ");
    void* f = malloc(32);
    printf("F: %p, ", f);
    printf("남은 Free List의 64 bytes 블록을 분할했을 수 있음, ");

    free(a); free(d); free(e); free(f);
}
```

Free List의 전략들:

**1. First Fit (첫 번째 맞는 것)**

```text
Free List: [100B] -> [50B] -> [200B] -> [80B]
60B 요청 → [100B] 선택 (첫 번째로 충분한 크기)
```

**2. Best Fit (가장 적합한 것)**

```text
Free List: [100B] -> [50B] -> [200B] -> [80B]
60B 요청 → [80B] 선택 (가장 낭비가 적음)
```

**3. Worst Fit (가장 큰 것)**

```text
Free List: [100B] -> [50B] -> [200B] -> [80B]
60B 요청 → [200B] 선택 (큰 블록 유지)
```

### 2.4 메모리 단편화: 힙의 고질병

단편화는 힙 메모리의 암과 같습니다. 천천히 퍼져서 시스템을 마비시킬 수 있습니다:

```c
// fragmentation_demo.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void demonstrate_fragmentation() {
    printf("=== 메모리 단편화 시연 ===, , ");

    // 시나리오: 채팅 서버의 메시지 버퍼
    typedef struct {
        char* buffer;
        size_t size;
    } Message;

    #define NUM_MESSAGES 1000
    Message messages[NUM_MESSAGES];

    printf("1. 다양한 크기의 메시지 할당, ");
    for (int i = 0; i < NUM_MESSAGES; i++) {
        // 10 ~ 1000 bytes의 랜덤 크기
        size_t size = 10 + (rand() % 991);
        messages[i].buffer = malloc(size);
        messages[i].size = size;
    }
    printf("   %d개 메시지 할당 완료, , ", NUM_MESSAGES);

    printf("2. 홀수 번째 메시지 해제 (체크보드 패턴), ");
    for (int i = 1; i < NUM_MESSAGES; i += 2) {
        free(messages[i].buffer);
        messages[i].buffer = NULL;
    }
    printf("   500개 메시지 해제, ");
    printf("   현재 메모리: [사용][빈][사용][빈]..., , ");

    printf("3. 큰 메시지 할당 시도, ");
    char* large_msg = malloc(5000);  // 5KB
    if (large_msg) {
        printf("   성공! 하지만 새로운 영역에 할당되었을 것, ");
        printf("   기존의 작은 빈 공간들은 사용 불가, ");
        free(large_msg);
    }

    // 정리
    for (int i = 0; i < NUM_MESSAGES; i += 2) {
        free(messages[i].buffer);
    }

    printf(", 교훈: 단편화는 메모리가 있어도 사용할 수 없게 만듭니다!, ");
}
```

단편화를 줄이는 방법:

1. **메모리 풀**: 같은 크기 객체는 전용 풀에서 할당
2. **아레나**: 관련 할당을 그룹화
3. **적절한 할당자 선택**: jemalloc, tcmalloc 등

## 3. 스택 vs 힙: 성능 대결

### 3.1 속도 측정: 숫자로 보는 차이

실제로 얼마나 차이가 날까요? 직접 측정해보겠습니다:

```c
// performance_showdown.c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>

#define ITERATIONS 10000000
#define ALLOC_SIZE 256

// 스택 할당 성능
double benchmark_stack() {
    clock_t start = clock();
    volatile int sum = 0;  // 최적화 방지

    for (int i = 0; i < ITERATIONS; i++) {
        char buffer[ALLOC_SIZE];
        memset(buffer, i & 0xFF, ALLOC_SIZE);
        sum += buffer[0];
    }

    clock_t end = clock();
    return ((double)(end - start)) / CLOCKS_PER_SEC;
}

// 힙 할당 성능
double benchmark_heap() {
    clock_t start = clock();
    volatile int sum = 0;

    for (int i = 0; i < ITERATIONS; i++) {
        char* buffer = malloc(ALLOC_SIZE);
        memset(buffer, i & 0xFF, ALLOC_SIZE);
        sum += buffer[0];
        free(buffer);
    }

    clock_t end = clock();
    return ((double)(end - start)) / CLOCKS_PER_SEC;
}

// 메모리 풀 성능 (최적화된 힙)
double benchmark_pool() {
    // 미리 큰 블록 할당
    char* pool = malloc(ALLOC_SIZE * ITERATIONS);

    clock_t start = clock();
    volatile int sum = 0;

    for (int i = 0; i < ITERATIONS; i++) {
        char* buffer = pool + (i * ALLOC_SIZE);
        memset(buffer, i & 0xFF, ALLOC_SIZE);
        sum += buffer[0];
    }

    clock_t end = clock();
    free(pool);

    return ((double)(end - start)) / CLOCKS_PER_SEC;
}

int main() {
    printf("=== 메모리 할당 성능 대결 ===, ");
    printf("테스트: %d회 반복, %d bytes 할당, , ", ITERATIONS, ALLOC_SIZE);

    double stack_time = benchmark_stack();
    double heap_time = benchmark_heap();
    double pool_time = benchmark_pool();

    printf("스택 할당: %.3f초, ", stack_time);
    printf("힙 할당:   %.3f초 (%.1fx 느림), ", heap_time, heap_time/stack_time);
    printf("메모리 풀: %.3f초 (%.1fx 느림), ", pool_time, pool_time/stack_time);

    printf(", 할당당 소요 시간:, ");
    printf("스택: %.1f ns, ", stack_time * 1e9 / ITERATIONS);
    printf("힙:   %.1f ns, ", heap_time * 1e9 / ITERATIONS);
    printf("풀:   %.1f ns, ", pool_time * 1e9 / ITERATIONS);

    return 0;
}
```

전형적인 결과:

```text
=== 메모리 할당 성능 대결 ===
테스트: 10000000회 반복, 256 bytes 할당

스택 할당: 0.124초
힙 할당:   3.867초 (31.2x 느림)
메모리 풀: 0.156초 (1.3x 느림)

할당당 소요 시간:
스택: 12.4 ns
힙:   386.7 ns
풀:   15.6 ns
```

### 3.2 왜 이런 차이가 날까?

스택과 힙의 속도 차이를 해부해보면:

```text
스택 할당 (1-2 CPU 사이클):
1. sub rsp, 256    ; 스택 포인터 감소

힙 할당 (100-1000 CPU 사이클):
1. malloc 함수 호출 오버헤드
2. Free List 탐색
3. 적합한 블록 찾기
4. 블록 분할 (필요시)
5. 메타데이터 업데이트
6. 스레드 동기화 (멀티스레드)
7. 시스템 콜 (brk/mmap) 가능성
```

캐시 효과도 중요합니다:

```c
// cache_effects.c
void demonstrate_cache_effects() {
    // 스택: 연속적인 접근 패턴
    int stack_array[1000];
    for (int i = 0; i < 1000; i++) {
        stack_array[i] = i;  // 캐시 라인에 연속 적재
    }

    // 힙: 분산된 접근 패턴
    int* heap_ptrs[1000];
    for (int i = 0; i < 1000; i++) {
        heap_ptrs[i] = malloc(sizeof(int));
        *heap_ptrs[i] = i;  // 캐시 미스 가능성 높음
    }
}
```

## 4. 메모리 버그: 프로그래머의 악몽

### 4.1 스택 버그들

스택에서 발생하는 대표적인 버그들을 살펴봅시다:

```c
// stack_bugs.c
#include <stdio.h>
#include <string.h>

// 버그 1: 스택 오버플로우
int factorial(int n) {
    // 재귀 깊이 체크 없음!
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

// 버그 2: 스택 버퍼 오버플로우
void buffer_overflow_demo() {
    char password[16] = "secret";
    char input[16];
    int authorized = 0;

    printf("Password: ");
    gets(input);  // 절대 사용 금지! 길이 체크 없음

    if (strcmp(password, input) == 0) {
        authorized = 1;
    }

    // 공격자가 16자 이상 입력하면?
    // input 오버플로우 → authorized 덮어쓰기 가능!
    if (authorized) {
        printf("Access granted!, ");
    }
}

// 버그 3: 댕글링 포인터 (스택 버전)
int* get_local_pointer() {
    int local_var = 42;
    return &local_var;  // 경고! 지역 변수 주소 반환
}

void use_dangling_pointer() {
    int* ptr = get_local_pointer();
    // ptr은 이미 해제된 스택 메모리를 가리킴
    printf("Value: %d, ", *ptr);  // 정의되지 않은 동작!

    // 다른 함수 호출로 스택 덮어쓰기
    int other_function();
    other_function();

    printf("Value now: %d, ", *ptr);  // 완전히 다른 값!
}
```

### 4.2 힙 버그들: 더 교묘하고 위험한

힙 버그는 발견하기 어렵고 치명적입니다:

```c
// heap_bugs.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// 버그 1: 메모리 누수 (가장 흔함)
void memory_leak_patterns() {
    // 패턴 1: 단순 누수
    char* buffer = malloc(1024);
    // ... 사용 ...
    return;  // free() 잊음!

    // 패턴 2: 조건부 누수
    char* data = malloc(1024);
    if (error_condition) {
        return;  // 에러 경로에서 free() 누락
    }
    free(data);

    // 패턴 3: 포인터 덮어쓰기
    char* ptr = malloc(100);
    ptr = malloc(200);  // 첫 번째 할당 누수!
    free(ptr);

    // 패턴 4: 순환 참조 (수동 메모리 관리에서)
    typedef struct Node {
        struct Node* next;
        char data[100];
    } Node;

    Node* a = malloc(sizeof(Node));
    Node* b = malloc(sizeof(Node));
    a->next = b;
    b->next = a;  // 순환!
    // a나 b 하나만 free하면 나머지는 누수
}

// 버그 2: Use-After-Free (보안 취약점)
void use_after_free_demo() {
    char* buffer = malloc(100);
    strcpy(buffer, "Important Data");

    free(buffer);

    // ... 많은 코드 ...

    // 개발자가 이미 해제했다는 걸 잊음
    strcpy(buffer, "New Data");  // 충돌 또는 데이터 오염!

    // 더 위험한 시나리오
    char* other = malloc(100);  // 같은 메모리 재사용 가능
    // 이제 buffer와 other가 같은 메모리를 가리킬 수 있음!
}

// 버그 3: Double Free (치명적)
void double_free_demo() {
    char* ptr = malloc(100);

    free(ptr);

    // ... 복잡한 로직 ...

    if (some_condition) {
        free(ptr);  // 두 번째 free!
        // malloc 내부 구조 파괴 → 프로그램 충돌
    }
}

// 버그 4: 힙 버퍼 오버플로우
void heap_overflow_demo() {
    char* buf1 = malloc(16);
    char* buf2 = malloc(16);

    printf("buf1: %p, ", buf1);
    printf("buf2: %p, ", buf2);

    // buf1에 16바이트 이상 쓰기
    strcpy(buf1, "This is way too long for 16 bytes!");

    // buf2의 메타데이터나 내용 손상!
    printf("buf2 content: %s, ", buf2);  // 쓰레기값 또는 충돌
}
```

### 4.3 디버깅 도구: 버그 사냥꾼의 무기

**프로덕션 환경에서의 메모리 모니터링:**

```bash
# 실시간 메모리 사용량 모니터링
$ while true; do
    echo "$(date): $(cat /proc/meminfo | grep -E '(MemTotal|MemAvailable|MemFree)')"
    sleep 5
done

# 프로세스별 메모리 사용량 (RSS, VSZ)
$ ps aux --sort=-rss | head -10

# 메모리 누수 의심 프로세스 추적
$ watch -n 1 'ps -p [PID] -o pid,rss,vsz,comm'

# cgroup 메모리 제한 확인 (컨테이너 환경)
$ cat /sys/fs/cgroup/memory/memory.limit_in_bytes
$ cat /sys/fs/cgroup/memory/memory.usage_in_bytes
```

**Valgrind로 메모리 누수 찾기:**

```c
// leak_example.c
#include <stdlib.h>

void leaky_function() {
    int* array = malloc(sizeof(int) * 100);
    array[0] = 42;
    // free(array);  // 의도적으로 주석 처리
}

int main() {
    for (int i = 0; i < 10; i++) {
        leaky_function();
    }
    return 0;
}
```

```bash
$ gcc -g leak_example.c -o leak_example
$ valgrind --leak-check=full --show-leak-kinds=all ./leak_example

==12345== HEAP SUMMARY:
==12345==     in use at exit: 4,000 bytes in 10 blocks
==12345==   total heap usage: 10 allocs, 0 frees, 4,000 bytes allocated
==12345==
==12345== 400 bytes in 1 blocks are definitely lost in loss record 1 of 1
==12345==    at 0x4C2FB0F: malloc (in /usr/lib/valgrind/...)
==12345==    by 0x400537: leaky_function (leak_example.c:4)
==12345==    by 0x400557: main (leak_example.c:10)
```

**AddressSanitizer로 Use-After-Free 찾기:**

```bash
$ gcc -fsanitize=address -g use_after_free.c -o use_after_free
$ ./use_after_free

=================================================================
==67890==ERROR: AddressSanitizer: heap-use-after-free on address 0x60200000eff0
WRITE of size 1 at 0x60200000eff0 thread T0
    #0 0x7f8a12345678 in strcpy (/lib/x86_64-linux-gnu/libc.so.6+0x123456)
    #1 0x400abc in use_after_free_demo use_after_free.c:15
    #2 0x400def in main use_after_free.c:25

0x60200000eff0 is located 0 bytes inside of 100-byte region
freed by thread T0 here:
    #0 0x7f8a23456789 in free (/usr/lib/x86_64-linux-gnu/libasan.so.5+0x234567)
    #1 0x400a12 in use_after_free_demo use_after_free.c:12
```

## 5. 고급 메모리 관리 기법

### 5.1 메모리 풀: 대량 생산의 효율성

같은 크기의 객체를 반복적으로 할당한다면, 메모리 풀이 답입니다:

```c
// memory_pool.c
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>

typedef struct PoolBlock {
    struct PoolBlock* next;
} PoolBlock;

typedef struct {
    void* memory;           // 전체 메모리 블록
    PoolBlock* free_list;   // 사용 가능한 블록 리스트
    size_t block_size;      // 각 블록 크기
    size_t total_blocks;    // 전체 블록 수
    size_t used_blocks;     // 사용 중인 블록 수
} MemoryPool;

MemoryPool* pool_create(size_t block_size, size_t block_count) {
    MemoryPool* pool = malloc(sizeof(MemoryPool));

    // 정렬을 위해 블록 크기 조정
    if (block_size < sizeof(PoolBlock)) {
        block_size = sizeof(PoolBlock);
    }
    block_size = (block_size + 7) & ~7;  // 8바이트 정렬

    pool->block_size = block_size;
    pool->total_blocks = block_count;
    pool->used_blocks = 0;

    // 한 번에 모든 메모리 할당
    pool->memory = malloc(block_size * block_count);

    // Free list 초기화
    pool->free_list = NULL;
    char* mem = (char*)pool->memory;
    for (size_t i = 0; i < block_count; i++) {
        PoolBlock* block = (PoolBlock*)(mem + i * block_size);
        block->next = pool->free_list;
        pool->free_list = block;
    }

    printf("메모리 풀 생성: %zu blocks × %zu bytes = %zu bytes, ",
           block_count, block_size, block_count * block_size);

    return pool;
}

void* pool_alloc(MemoryPool* pool) {
    if (!pool->free_list) {
        printf("풀이 가득 참! (%zu/%zu 사용중), ",
               pool->used_blocks, pool->total_blocks);
        return NULL;
    }

    PoolBlock* block = pool->free_list;
    pool->free_list = block->next;
    pool->used_blocks++;

    return block;
}

void pool_free(MemoryPool* pool, void* ptr) {
    PoolBlock* block = (PoolBlock*)ptr;
    block->next = pool->free_list;
    pool->free_list = block;
    pool->used_blocks--;
}

// 사용 예제: 게임의 총알 시스템
typedef struct {
    float x, y, vx, vy;
    int damage;
    int active;
} Bullet;

void game_bullet_system() {
    printf(", === 게임 총알 시스템 ===, ");

    // 최대 1000개 총알을 위한 풀
    MemoryPool* bullet_pool = pool_create(sizeof(Bullet), 1000);

    // 성능 비교
    clock_t start = clock();

    // 풀 사용
    Bullet* bullets[1000];
    for (int frame = 0; frame < 1000; frame++) {
        // 100개 총알 생성
        for (int i = 0; i < 100; i++) {
            bullets[i] = pool_alloc(bullet_pool);
        }
        // 100개 총알 제거
        for (int i = 0; i < 100; i++) {
            pool_free(bullet_pool, bullets[i]);
        }
    }

    clock_t pool_time = clock() - start;

    // malloc 사용
    start = clock();
    for (int frame = 0; frame < 1000; frame++) {
        for (int i = 0; i < 100; i++) {
            bullets[i] = malloc(sizeof(Bullet));
        }
        for (int i = 0; i < 100; i++) {
            free(bullets[i]);
        }
    }
    clock_t malloc_time = clock() - start;

    printf("풀 사용: %ld ms, ", pool_time * 1000 / CLOCKS_PER_SEC);
    printf("malloc 사용: %ld ms (%.1fx 느림), ",
           malloc_time * 1000 / CLOCKS_PER_SEC,
           (double)malloc_time / pool_time);
}
```

### 5.2 Arena 할당자: 한 번에 정리하기

웹 서버의 요청 처리처럼 관련된 할당을 그룹화하면 편리합니다:

```c
// arena_allocator.c
typedef struct {
    char* memory;
    size_t size;
    size_t used;
} Arena;

Arena* arena_create(size_t size) {
    Arena* arena = malloc(sizeof(Arena));
    arena->memory = malloc(size);
    arena->size = size;
    arena->used = 0;
    return arena;
}

void* arena_alloc(Arena* arena, size_t size) {
    size = (size + 7) & ~7;  // 8바이트 정렬

    if (arena->used + size > arena->size) {
        return NULL;  // 공간 부족
    }

    void* ptr = arena->memory + arena->used;
    arena->used += size;
    return ptr;
}

void arena_reset(Arena* arena) {
    arena->used = 0;  // 모든 할당 즉시 해제!
}

// 사용 예제: HTTP 요청 처리
void handle_http_request() {
    // 요청당 하나의 Arena
    Arena* request_arena = arena_create(64 * 1024);  // 64KB

    // 요청 처리 중 필요한 모든 할당
    char* url = arena_alloc(request_arena, 256);
    char* headers = arena_alloc(request_arena, 1024);
    char* body = arena_alloc(request_arena, 4096);

    // ... 요청 처리 ...

    // 한 번에 모든 메모리 해제!
    arena_reset(request_arena);
    // 다음 요청을 위해 재사용 가능
}
```

## 6. 실전 팁: 언제 무엇을 사용할까?

### 6.1 스택 vs 힙 결정 플로우차트

```text
시작
  ↓
크기를 컴파일 시점에 아는가?
  ├─ NO → 힙 사용 (malloc)
  └─ YES ↓
     크기가 작은가? (<1MB)
       ├─ NO → 힙 사용 (큰 데이터)
       └─ YES ↓
          함수 종료 후에도 필요한가?
            ├─ YES → 힙 사용 (수명 연장)
            └─ NO → 스택 사용! ✓
```

### 6.2 실제 시나리오별 권장사항

```c
// scenario_recommendations.c

// ✅ 스택 사용 사례
void good_stack_usage() {
    // 1. 작은 임시 버퍼
    char temp_buffer[256];

    // 2. 간단한 구조체
    struct Point { int x, y; } p = {10, 20};

    // 3. 작은 배열
    int results[10];

    // 4. 함수 내부 계산용 변수
    double calculations[100];
}

// ✅ 힙 사용 사례
void good_heap_usage() {
    // 1. 크기가 동적인 경우
    int n = get_user_input();
    int* array = malloc(n * sizeof(int));

    // 2. 큰 데이터 구조
    Image* img = malloc(sizeof(Image));
    img->pixels = malloc(1920 * 1080 * 4);  // 4K 이미지

    // 3. 함수 밖으로 전달할 데이터
    char* result = malloc(strlen(input) + 1);
    strcpy(result, input);
    return result;  // 호출자가 free() 책임

    // 4. 자료구조 (연결 리스트, 트리 등)
    Node* node = malloc(sizeof(Node));
    node->next = NULL;
}

// ⚠️ 주의가 필요한 경우
void tricky_cases() {
    // VLA (Variable Length Array) - C99
    int n = 100;
    int vla[n];  // 스택에 동적 크기! 위험할 수 있음

    // alloca() - 스택에 동적 할당
    void* temp = alloca(n);  // 함수 종료시 자동 해제
    // 하지만 크기 체크 없음 - 스택 오버플로우 위험!

    // 큰 재귀
    void recursive(int depth) {
        char large[1024];  // 재귀마다 1KB
        if (depth > 0) recursive(depth - 1);
    }
    // recursive(10000);  // 스택 오버플로우!
}
```

## 7. 정리: 스택과 힙의 조화

### 7.1 핵심 요약

우리가 배운 내용을 정리하면:

**스택 (Stack)**

- 🚀 **빠름**: 단순한 포인터 조작
- 🤖 **자동 관리**: 함수 종료시 자동 정리
- 📏 **크기 제한**: 보통 8MB
- 📚 **LIFO 구조**: 마지막 입력이 첫 출력
- 🎯 **용도**: 지역 변수, 함수 매개변수, 리턴 주소

**힙 (Heap)**

- 🎨 **유연함**: 크기 제한 거의 없음
- 🔧 **수동 관리**: malloc/free 필요
- 🐌 **상대적으로 느림**: 복잡한 관리 필요
- 🔀 **임의 접근**: 어느 순서로든 할당/해제
- 🎯 **용도**: 동적 크기, 큰 데이터, 긴 수명

### 7.2 기억해야 할 교훈

1. **"가능하면 스택, 필요하면 힙"**
   - 스택이 30배 이상 빠릅니다
   - 하지만 제한이 있어 항상 사용할 수는 없습니다

2. **"할당한 메모리는 반드시 해제"**
   - 모든 malloc에는 대응하는 free가 있어야 합니다
   - RAII나 스마트 포인터로 자동화를 고려하세요

3. **"도구를 활용하라"**
   - Valgrind, AddressSanitizer는 친구입니다
   - 개발 중에 정기적으로 메모리 검사를 하세요

4. **"성능이 중요하다면 측정하라"**
   - 추측하지 말고 프로파일링하세요
   - 병목이 확인되면 메모리 풀 등을 고려하세요

### 7.3 다음으로 나아가기

스택과 힙은 프로그래밍의 기초입니다. 이를 마스터하면:

- 더 효율적인 코드를 작성할 수 있습니다
- 메모리 버그를 예방하고 디버깅할 수 있습니다
- 시스템 프로그래밍의 깊은 세계로 들어갈 준비가 됩니다

## 다음 섹션 예고

다음 섹션([2-3: 가상 메모리와 페이징은 어떻게 동작하는가](03-virtual-memory.md))에서는 **가상 메모리와 페이징**을 탐구합니다:

- 프로세스가 실제보다 큰 메모리를 어떻게 사용할까?
- 가상 주소가 물리 주소로 어떻게 변환될까?
- 페이지 폴트는 왜 발생하고 어떻게 처리될까?
- 메모리가 부족할 때 운영체제는 어떻게 대응할까?

프로세스가 보는 환상의 메모리 세계와 실제 물리 메모리 사이의 마법 같은 매핑, 가상 메모리의 비밀을 파헤쳐봅시다!

## 관련 문서

- [2-1: 프로세스 메모리 구조는 어떻게 구성되는가](01-process-memory.md) - 메모리 세그먼트 기초
- [2-3: 가상 메모리와 페이징은 어떻게 동작하는가](03-virtual-memory.md) - 가상 메모리 메커니즘
- [2-4: 메모리 매핑과 공유 메모리는 어떻게 동작하는가](04-memory-mapping.md) - 고급 메모리 기법
