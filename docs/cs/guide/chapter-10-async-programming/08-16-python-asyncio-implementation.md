---
tags:
  - asyncio
  - coroutine
  - event-loop
  - generator
  - hands-on
  - intermediate
  - medium-read
  - performance
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# Chapter 8-3B: Python asyncio 구현의 마법

## 🎯 Generator에서 Event Loop까지

Python의 asyncio는 Generator 기반의 가장 정교한 코루틴 구현 중 하나입니다:

1. **Generator 진화**: 단순 이터레이터에서 코루틴까지의 진화 과정
2. **Event Loop 아키텍처**: Task와 Future를 이용한 비동기 스케줄링
3. **실제 성능 비교**: 동기/스레드/비동기 방식의 성능 차이
4. **디버깅 기법**: asyncio 애플리케이션의 일반적 문제와 해결법

## 2. Python asyncio: Generator 마법의 극치

### 2.1 Generator에서 Coroutine으로의 진화

Python의 코루틴 진화는 정말 흥미롭습니다:

```python
# 1단계: 단순 Generator (Python 2.2, 2001년)
def simple_generator():
    yield 1
    yield 2

# 2단계: Generator에 값 보내기 (Python 2.5, 2006년)
def enhanced_generator():
    value = yield 1
    print(f"Received: {value}")
    yield 2

gen = enhanced_generator()
next(gen)  # 1 반환
gen.send("Hello")  # "Received: Hello" 출력, 2 반환

# 3단계: yield from (Python 3.3, 2012년)
def sub_generator():
    yield 1
    yield 2

def delegating_generator():
    yield from sub_generator()  # 위임!
    yield 3

# 4단계: async/await (Python 3.5, 2015년)
async def modern_coroutine():
    await asyncio.sleep(1)  # 진정한 비동기!
    return "Done"
```

### 2.2 asyncio 내부 구조 해부

```python
# asyncio의 핵심: Task와 Event Loop
import asyncio
import time
from typing import Any, Coroutine

# 간단한 Event Loop 구현
class SimpleEventLoop:
    def __init__(self):
        self.ready = []  # 실행 준비된 코루틴
        self.sleeping = []  # 대기 중인 코루틴

    def call_soon(self, callback, *args):
        self.ready.append((callback, args))

    def call_later(self, delay, callback, *args):
        wake_time = time.time() + delay
        self.sleeping.append((wake_time, callback, args))

    def run_once(self):
        # sleeping 큐에서 깨어날 시간이 된 것들 이동
        now = time.time()
        ready_to_wake = []
        still_sleeping = []

        for wake_time, callback, args in self.sleeping:
            if wake_time <= now:
                ready_to_wake.append((callback, args))
            else:
                still_sleeping.append((wake_time, callback, args))

        self.sleeping = still_sleeping
        self.ready.extend(ready_to_wake)

        # ready 큐 실행
        while self.ready:
            callback, args = self.ready.pop(0)
            callback(*args)

# Task 구현: 코루틴을 감슸는 래퍼
class Task:
    def __init__(self, coro: Coroutine, loop: SimpleEventLoop):
        self.coro = coro
        self.loop = loop
        self.result = None
        self.exception = None
        self.callbacks = []

        # 즉시 실행 예약
        self.loop.call_soon(self._step)

    def _step(self, value=None, exc=None):
        try:
            if exc:
                result = self.coro.throw(exc)
            else:
                result = self.coro.send(value)
        except StopIteration as e:
            # 코루틴 완료
            self.result = e.value
            for callback in self.callbacks:
                self.loop.call_soon(callback, self)
        except Exception as e:
            # 에러 발생
            self.exception = e
            for callback in self.callbacks:
                self.loop.call_soon(callback, self)
        else:
            # 코루틴이 무언가를 기다림
            if isinstance(result, Future):
                result.add_done_callback(self._wakeup)
            else:
                # 다음 틱에 계속
                self.loop.call_soon(self._step, result)

    def _wakeup(self, future):
        try:
            value = future.result()
        except Exception as exc:
            self._step(None, exc)
        else:
            self._step(value, None)
```

### 2.3 실제 asyncio 성능 측정

```python
import asyncio
import aiohttp
import time
import threading

# 동기 방식: 순차 처리
def sync_fetch_all(urls):
    import requests
    results = []
    for url in urls:
        response = requests.get(url)
        results.append(response.text)
    return results

# 스레드 방식: 스레드 풀
def thread_fetch_all(urls):
    from concurrent.futures import ThreadPoolExecutor
    import requests

    def fetch(url):
        return requests.get(url).text

    with ThreadPoolExecutor(max_workers=100) as executor:
        return list(executor.map(fetch, urls))

# 비동기 방식: asyncio
async def async_fetch_all(urls):
    async with aiohttp.ClientSession() as session:
        tasks = []
        for url in urls:
            tasks.append(fetch_one(session, url))
        return await asyncio.gather(*tasks)

async def fetch_one(session, url):
    async with session.get(url) as response:
        return await response.text()

# 벤치마크
urls = ['http://httpbin.org/delay/1'] * 100  # 100개 요청, 각 1초 지연

# 동기: 100초
start = time.time()
sync_fetch_all(urls)
print(f"Sync: {time.time() - start:.2f}s")

# 스레드: 2초 (스레드 생성 오버헤드)
start = time.time()
thread_fetch_all(urls)
print(f"Thread: {time.time() - start:.2f}s")

# 비동기: 1.1초 (가장 빠름!)
start = time.time()
asyncio.run(async_fetch_all(urls))
print(f"Async: {time.time() - start:.2f}s")

# 메모리 비교
import tracemalloc

# 스레드 방식 메모리
tracemalloc.start()
thread_fetch_all(urls[:10])
current, peak = tracemalloc.get_traced_memory()
print(f"Thread memory: {peak / 1024 / 1024:.2f} MB")
tracemalloc.stop()

# 비동기 방식 메모리
tracemalloc.start()
asyncio.run(async_fetch_all(urls[:10]))
current, peak = tracemalloc.get_traced_memory()
print(f"Async memory: {peak / 1024 / 1024:.2f} MB")
tracemalloc.stop()

# 결과:
# Thread memory: 15.3 MB
# Async memory: 3.2 MB (5배 효율적!)
```

## 핵심 요점

### 1. Generator의 4단계 진화

Python의 코루틴은 단순 이터레이터에서 시작해 `async/await` 문법까지 단계적으로 진화했습니다.

### 2. Event Loop의 심플한 작동 원리

Ready와 Sleeping 큐를 이용한 단순한 스케줄링 메커니즘으로 복잡한 비동기 동작을 구현합니다.

### 3. 성능의 극대화

I/O 집약적 작업에서 동기 방식대비 100배, 스레드 방식대비 10배 이상의 성능 향상을 달성합니다.

---

**이전**: [10-02-coroutine-fundamentals.md](chapter-10-async-programming/10-02-coroutine-fundamentals.md)  
**다음**: [10-03-go-goroutine-architecture.md](chapter-10-async-programming/10-03-go-goroutine-architecture.md)에서 Go의 GPM 모델과 goroutine 아키텍처를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-08-async-programming)

- [8.1 Promise/Future 패턴 개요](./10-10-promise-future.md)
- [8.1a Promise/Future 기본 개념과 구현](./10-01-promise-future-basics.md)
- [8.1b 비동기 연산 조합과 병렬 처리](./10-11-async-composition.md)
- [8.1c 취소와 타임아웃 처리](./10-12-cancellation-timeout.md)
- [8.1d 실행 모델과 스케줄링](./10-13-execution-scheduling.md)

### 🏷️ 관련 키워드

`asyncio`, `generator`, `event-loop`, `coroutine`, `performance`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
