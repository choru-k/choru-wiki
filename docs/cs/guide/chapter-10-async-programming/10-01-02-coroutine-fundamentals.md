---
tags:
  - cooperative_multitasking
  - coroutine
  - fundamentals
  - medium-read
  - memory_efficiency
  - stackful
  - stackless
  - theoretical
  - 애플리케이션개발
difficulty: FUNDAMENTALS
learning_time: "2-3시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 10.1.2: 코루틴 기초

## 🎯 코루틴의 탄생과 본질 이해

이 섹션에서는 코루틴의 역사적 배경과 기본 개념을 다룹니다:

1. **코루틴 vs 스레드**: 협력적 vs 선점적 멀티태스킹의 근본적 차이점
2. **Stackful vs Stackless**: 두 가지 구현 방식의 장단점 비교
3. **메모리 효율성**: 왜 코루틴이 스레드보다 효율적인지 실험으로 증명
4. **역사적 맥락**: 1958년 발명에서 현대 부활까지의 여정

## 1. 코루틴의 탄생: 협력적 멀티태스킹의 부활

### 1.1 역사의 아이러니: 1958년으로의 회귀

```text
1958년: Melvin Conway가 코루틴 개념 발명
1970년대: Preemptive multitasking이 대세가 됨
2000년대: 코루틴의 부활 - "Everything old is new again"
```

재미있는 사실: 코루틴은 사실 스레드보다 먼저 발명되었습니다! 하지만 하드웨어가 발전하면서 OS 레벨 스레드가 주류가 되었죠. 그런데 왜 다시 코루틴으로 돌아왔을까요?

**스레드의 한계를 보여주는 실험:**

```c
// 스레드 10,000개 생성 테스트
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>

void* thread_func(void* arg) {
    // 각 스레드는 8MB 스택 할당 (Linux 기본값)
    char stack_array[1024];  // 스택 사용
    sleep(60);  // 1분 대기
    return NULL;
}

int main() {
    pthread_t threads[10000];

    for (int i = 0; i < 10000; i++) {
        if (pthread_create(&threads[i], NULL, thread_func, NULL) != 0) {
            printf("Failed at thread %d, ", i);
            perror("pthread_create");
            break;
        }
    }

    // 결과:
    // Failed at thread 380
    // pthread_create: Resource temporarily unavailable
    //
    // 메모리 사용: 380 * 8MB = 3GB!
    // 컨텍스트 스위칭: 수 마이크로초 * 380 = 밀리초 단위 지연
}
```

**코루틴으로 같은 작업:**

```go
// Go로 goroutine 1,000,000개 생성
package main

import (
    "fmt"
    "runtime"
    "sync"
    "time"
)

func main() {
    var wg sync.WaitGroup
    startMem := runtime.MemStats{}
    runtime.ReadMemStats(&startMem)

    // 1백만 개 goroutine 생성!
    for i := 0; i < 1000000; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            time.Sleep(60 * time.Second)
        }(i)
    }

    endMem := runtime.MemStats{}
    runtime.ReadMemStats(&endMem)

    fmt.Printf("Goroutines: %d, ", runtime.NumGoroutine())
    fmt.Printf("Memory used: %d MB, ",
        (endMem.Alloc-startMem.Alloc)/1024/1024)

    // 결과:
    // Goroutines: 1000000
    // Memory used: 2000 MB (2KB * 1M = 2GB)
    //
    // 스레드 대비 15배 더 많은 동시성!
    wg.Wait()
}
```

### 1.2 Stackful vs Stackless: 두 가지 길

코루틴 구현에는 근본적으로 다른 두 가지 접근법이 있습니다:

```python
# Stackless 코루틴 (Python generator)
def stackless_coroutine():
    print("Step 1")
    yield 1  # 상태를 객체에 저장
    print("Step 2")
    yield 2
    print("Step 3")

# 변환된 상태 머신 (개념적)
class StacklessCoroutine:
    def __init__(self):
        self.state = 0

    def resume(self):
        if self.state == 0:
            print("Step 1")
            self.state = 1
            return 1
        elif self.state == 1:
            print("Step 2")
            self.state = 2
            return 2
        elif self.state == 2:
            print("Step 3")
            self.state = 3
            return None
```

```c
// Stackful 코루틴 (C with setjmp/longjmp)
#include <setjmp.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    jmp_buf context;
    char stack[8192];  // 자체 스택!
    void (*func)(void*);
    void* arg;
} Coroutine;

Coroutine* current_coro;
jmp_buf main_context;

void yield() {
    if (setjmp(current_coro->context) == 0) {
        longjmp(main_context, 1);
    }
}

void resume(Coroutine* coro) {
    current_coro = coro;
    if (setjmp(main_context) == 0) {
        longjmp(coro->context, 1);
    }
}

void coro_func(void* arg) {
    printf("Coroutine: Step 1, ");
    yield();
    printf("Coroutine: Step 2, ");
    yield();
    printf("Coroutine: Step 3, ");
}
```

**비교표:**

| 특성 | Stackful | Stackless |
|------|----------|---------- -|
| 구현 복잡도 | 높음 | 낮음 |
| 메모리 사용 | 많음 (스택 필요) | 적음 (상태만 저장) |
| 성능 | 빠른 스위칭 | 약간 느림 |
| 호출 깊이 | 제한 없음 | 제한적 |
| 대표 예 | Go, Lua | Python, JavaScript |

## 핵심 요점

### 1. 협력적 멀티태스킹의 부활

코루틴은 1958년 개념이지만, 현대의 I/O 집약적 애플리케이션에 최적화된 해결책입니다.

### 2. 메모리 효율성의 극대화

스레드 대비 10배 이상의 메모리 효율성으로 수백만 개의 동시 작업 처리가 가능합니다.

### 3. 구현 방식의 트레이드오프

Stackful은 성능과 유연성을, Stackless는 단순성과 메모리 효율성을 제공합니다.

---

**다음**: [10-02-07-python-asyncio-implementation.md](./10-02-07-python-asyncio-implementation.md)에서 Python의 Generator 기반 asyncio 구현을 살펴봅니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: FUNDAMENTALS
- **주제**: 애플리케이션 개발
- **예상 시간**: 2-3시간

### 🎯 학습 경로

- [📚 FUNDAMENTALS 레벨 전체 보기](../learning-paths/fundamentals/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-10-async-programming)

- [8.1 Promise/Future 패턴 개요](./10-02-01-promise-future.md)
- [8.1a Promise/Future 기본 개념과 구현](./10-01-01-promise-future-basics.md)
- [8.1b 비동기 연산 조합과 병렬 처리](./10-02-02-async-composition.md)
- [8.1c 취소와 타임아웃 처리](./10-02-03-cancellation-timeout.md)
- [8.1d 실행 모델과 스케줄링](./10-02-04-execution-scheduling.md)

### 🏷️ 관련 키워드

`coroutine`, `cooperative_multitasking`, `stackful`, `stackless`, `memory_efficiency`

### ⏭️ 다음 단계 가이드

- 기초 개념을 충분히 이해한 후 INTERMEDIATE 레벨로 진행하세요
- 실습 위주의 학습을 권장합니다
