---
tags:
  - Programming
  - Coroutine
  - Async
  - Concurrency
  - C++
  - Python
  - Go
  - Rust
  - Performance
---

# Coroutine: 협력적 멀티태스킹의 혁신

## 들어가며

"왜 동시에 10,000개의 HTTP 요청을 처리할 때 스레드는 메모리가 부족해지는데, Node.js는 문제없이 동작할까?" 이 질문의 답이 바로 **코루틴(Coroutine)**입니다. 

2024년 현재, 대부분의 모던 언어들이 코루틴을 지원합니다. C++20의 `co_await`, Python의 `async/await`, Go의 goroutines, Rust의 futures 등이 모두 코루틴 기반입니다. 하지만 많은 개발자들이 코루틴의 내부 동작을 제대로 이해하지 못하고 사용하고 있습니다.

## Coroutine의 핵심 개념

### Thread vs Coroutine: 근본적 차이점

```c
// Traditional Thread Model
void handle_request(int socket_fd) {
    char buffer[1024];
    read(socket_fd, buffer, 1024);  // OS가 스레드를 블록시킴
    process_data(buffer);
    write(socket_fd, response, response_len);
}

// pthread를 사용한 전통적 방식
for (int i = 0; i < client_count; i++) {
    pthread_create(&threads[i], NULL, handle_request, &client_sockets[i]);
}
// 10,000개 클라이언트 = 10,000개 스레드 = 80GB 메모리 (8MB * 10,000)
```

```cpp
// Coroutine Model (C++20 style)
task<void> handle_request(int socket_fd) {
    char buffer[1024];
    co_await async_read(socket_fd, buffer, 1024);  // CPU를 다른 코루틴에 양보
    process_data(buffer);
    co_await async_write(socket_fd, response, response_len);
}

// 10,000개 코루틴 = ~10MB 메모리 (1KB * 10,000)
```

**핵심 차이점:**

1. **메모리 사용량**: 스레드는 최소 8MB 스택, 코루틴은 수백 바이트~수 KB
2. **컨텍스트 스위칭**: 스레드는 커널 개입 필요, 코루틴은 유저스페이스에서 처리
3. **동기화**: 스레드는 뮤텍스/세마포어, 코루틴은 cooperative scheduling

### 코루틴의 실행 모델

```mermaid
sequenceDiagram
    participant C1 as Coroutine 1
    participant S as Scheduler
    participant C2 as Coroutine 2
    participant IO as I/O System
    
    C1->>S: co_await file_read()
    S->>IO: 비동기 I/O 시작
    S->>C2: CPU 할당
    C2->>S: co_await network_send()
    S->>IO: 비동기 네트워크 전송
    S->>C1: I/O 완료, CPU 재할당
    C1->>S: 작업 완료
```

## Stackful vs Stackless Coroutines

### Stackful Coroutines: 완전한 스택 보존

```c
// Stackful coroutine 예시 (libco 스타일)
void coroutine_function(void* arg) {
    int local_var = 42;
    char local_array[1024];
    
    // 다른 함수 호출 가능
    deep_function_call();
    
    // 어느 지점에서든 yield 가능
    co_yield();  // 전체 스택이 보존됨
    
    printf("local_var is still %d\n", local_var);  // 42 출력
}

void deep_function_call() {
    // 깊은 호출 스택에서도 yield 가능
    co_yield();
}
```

**장점:**
- 기존 동기 코드를 거의 수정 없이 사용 가능
- 깊은 함수 호출에서도 suspend 가능
- 직관적인 프로그래밍 모델

**단점:**
- 각 코루틴이 독립적인 스택 필요 (보통 4KB~1MB)
- 메모리 사용량이 상대적으로 큼

### Stackless Coroutines: 상태 머신 기반

```cpp
// C++20 Stackless coroutine
struct async_reader {
    struct promise_type {
        async_reader get_return_object() { 
            return async_reader{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        void return_void() {}
        void unhandled_exception() {}
    };
    
    std::coroutine_handle<promise_type> coro;
    
    async_reader(std::coroutine_handle<promise_type> h) : coro(h) {}
    ~async_reader() { if (coro) coro.destroy(); }
};

async_reader read_file(const std::string& filename) {
    // 컴파일러가 상태 머신으로 변환
    auto file = co_await open_file(filename);  // suspend point 1
    auto data = co_await read_data(file);      // suspend point 2
    co_await close_file(file);                 // suspend point 3
    co_return;
}
```

컴파일러가 생성하는 상태 머신:
```cpp
// 컴파일러가 내부적으로 생성하는 구조체
struct read_file_state {
    enum { START, AFTER_OPEN, AFTER_READ, AFTER_CLOSE, DONE } state = START;
    
    std::string filename;  // 캡처된 매개변수
    File file;            // 로컬 변수들
    Data data;
    
    void resume() {
        switch(state) {
            case START:
                // auto file = co_await open_file(filename);
                break;
            case AFTER_OPEN:
                // auto data = co_await read_data(file);
                break;
            // ... 각 suspend point별 상태
        }
    }
};
```

**장점:**
- 메모리 효율적 (필요한 변수만 저장)
- 컴파일 타임 최적화 가능
- Zero-cost abstraction

**단점:**
- 일반 함수에서 co_await 사용 불가
- 학습 곡선이 가파름

## C++20 Coroutines 심화

### 기본 구조와 Promise Type

```cpp
#include <coroutine>
#include <iostream>
#include <chrono>
#include <thread>

template<typename T>
struct task {
    struct promise_type {
        T value;
        
        task get_return_object() {
            return task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        
        std::suspend_never initial_suspend() { return {}; }
        std::suspend_never final_suspend() noexcept { return {}; }
        
        void return_value(T val) { value = val; }
        void unhandled_exception() { std::terminate(); }
    };
    
    std::coroutine_handle<promise_type> coro;
    
    task(std::coroutine_handle<promise_type> h) : coro(h) {}
    
    T get() {
        if (!coro.done()) {
            coro.resume();
        }
        return coro.promise().value;
    }
};

// 실제 사용
task<int> compute_async(int n) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    co_return n * n;
}

int main() {
    auto task_obj = compute_async(10);
    std::cout << "Result: " << task_obj.get() << std::endl;  // 100
    return 0;
}
```

### Generator Pattern with co_yield

```cpp
#include <coroutine>
#include <iostream>

template<typename T>
struct generator {
    struct promise_type {
        T current_value;
        
        generator get_return_object() {
            return generator{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        
        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        std::suspend_always yield_value(T value) {
            current_value = value;
            return {};
        }
        void return_void() {}
        void unhandled_exception() { std::terminate(); }
    };
    
    std::coroutine_handle<promise_type> coro;
    
    generator(std::coroutine_handle<promise_type> h) : coro(h) {}
    ~generator() { if (coro) coro.destroy(); }
    
    bool next() {
        if (coro) {
            coro.resume();
            return !coro.done();
        }
        return false;
    }
    
    T value() { return coro.promise().current_value; }
};

generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
        co_yield a;
        int temp = a;
        a = b;
        b = temp + b;
    }
}

int main() {
    auto fib = fibonacci();
    for (int i = 0; i < 10 && fib.next(); ++i) {
        std::cout << fib.value() << " ";  // 0 1 1 2 3 5 8 13 21 34
    }
    return 0;
}
```

### Async I/O with co_await

```cpp
#include <coroutine>
#include <future>
#include <chrono>
#include <thread>

// Awaitable wrapper for std::future
template<typename T>
struct future_awaiter {
    std::future<T>& fut;
    
    bool await_ready() { 
        return fut.wait_for(std::chrono::seconds(0)) == std::future_status::ready; 
    }
    
    void await_suspend(std::coroutine_handle<> handle) {
        std::thread([&fut = fut, handle]() {
            fut.wait();
            handle.resume();
        }).detach();
    }
    
    T await_resume() { return fut.get(); }
};

template<typename T>
auto operator co_await(std::future<T>& fut) {
    return future_awaiter<T>{fut};
}

task<void> async_workflow() {
    std::cout << "Starting async workflow\n";
    
    // 비동기 작업들을 병렬로 시작
    auto fut1 = std::async(std::launch::async, []() {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        return 42;
    });
    
    auto fut2 = std::async(std::launch::async, []() {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        return std::string("Hello");
    });
    
    // 첫 번째 작업 완료 대기
    int result1 = co_await fut1;
    std::cout << "First result: " << result1 << std::endl;
    
    // 두 번째 작업 완료 대기  
    std::string result2 = co_await fut2;
    std::cout << "Second result: " << result2 << std::endl;
    
    std::cout << "Workflow completed\n";
}
```

## Python AsyncIO와 async/await

### 기본 구조와 Event Loop

```python
import asyncio
import aiohttp
import time
from typing import List

async def fetch_url(session: aiohttp.ClientSession, url: str) -> str:
    """비동기로 URL에서 데이터를 가져오는 코루틴"""
    async with session.get(url) as response:
        return await response.text()

async def fetch_multiple_urls(urls: List[str]) -> List[str]:
    """여러 URL을 동시에 처리"""
    async with aiohttp.ClientSession() as session:
        # 모든 요청을 동시에 시작
        tasks = [fetch_url(session, url) for url in urls]
        # 모든 완료를 기다림
        results = await asyncio.gather(*tasks)
        return results

# 성능 비교: 동기 vs 비동기
def sync_fetch_urls(urls: List[str]) -> List[str]:
    """동기 방식으로 URL 처리"""
    results = []
    for url in urls:
        # 각 요청을 순차적으로 처리
        import requests
        response = requests.get(url)
        results.append(response.text)
    return results

async def performance_comparison():
    urls = [
        'https://httpbin.org/delay/1',
        'https://httpbin.org/delay/1', 
        'https://httpbin.org/delay/1',
        'https://httpbin.org/delay/1',
        'https://httpbin.org/delay/1'
    ]
    
    # 비동기 방식 (약 1초)
    start = time.time()
    results = await fetch_multiple_urls(urls)
    async_time = time.time() - start
    print(f"Async time: {async_time:.2f}s")
    
    # 동기 방식 (약 5초)  
    start = time.time()
    results = sync_fetch_urls(urls)
    sync_time = time.time() - start
    print(f"Sync time: {sync_time:.2f}s")
    
    print(f"Async is {sync_time/async_time:.1f}x faster")

# 실행
asyncio.run(performance_comparison())
```

### 코루틴 내부 동작: Generator 기반 구현

```python
import types
from typing import Generator, Any

class SimpleEventLoop:
    """단순화된 이벤트 루프 구현"""
    
    def __init__(self):
        self.ready_queue = []
        self.waiting_tasks = {}
        
    def call_soon(self, callback):
        """콜백을 준비 큐에 추가"""
        self.ready_queue.append(callback)
        
    def run_until_complete(self, coro):
        """메인 이벤트 루프"""
        # 코루틴을 태스크로 변환
        task = self.create_task(coro)
        
        while self.ready_queue or self.waiting_tasks:
            # 준비된 태스크 실행
            while self.ready_queue:
                callback = self.ready_queue.pop(0)
                try:
                    callback()
                except StopIteration:
                    pass  # 코루틴 완료
                    
            # I/O 완료된 태스크 확인 (실제로는 select/epoll 사용)
            self.check_io_completion()
            
        return task.result
        
    def create_task(self, coro):
        """코루틴을 태스크로 래핑"""
        return Task(coro, self)
        
    def check_io_completion(self):
        """I/O 완료 확인 (단순화된 구현)"""
        import time
        current_time = time.time()
        completed = []
        
        for task_id, (task, wake_time) in self.waiting_tasks.items():
            if current_time >= wake_time:
                completed.append(task_id)
                self.call_soon(task.step)
                
        for task_id in completed:
            del self.waiting_tasks[task_id]

class Task:
    """단순화된 태스크 구현"""
    
    def __init__(self, coro, loop):
        self.coro = coro
        self.loop = loop
        self.result = None
        self.done = False
        loop.call_soon(self.step)
        
    def step(self):
        """코루틴의 다음 단계 실행"""
        try:
            # 코루틴에서 다음 값을 얻거나 대기 객체를 받음
            result = next(self.coro)
            
            if hasattr(result, '__await__'):
                # Awaitable 객체인 경우
                awaiter = result.__await__()
                try:
                    next(awaiter)  # 대기 시작
                    # 실제로는 여기서 I/O 완료를 기다림
                    self.loop.waiting_tasks[id(self)] = (self, time.time() + 1)
                except StopIteration as e:
                    # 즉시 완료된 경우
                    self.coro.send(e.value)
                    self.loop.call_soon(self.step)
            else:
                # 일반 값인 경우 계속 실행
                self.loop.call_soon(self.step)
                
        except StopIteration as e:
            self.result = e.value
            self.done = True

# 실제 사용
async def simple_coro():
    print("Coroutine started")
    await asyncio.sleep(0.1)  # 실제로는 SimpleSleep() 사용
    print("Coroutine resumed")
    return "Done"

loop = SimpleEventLoop()
result = loop.run_until_complete(simple_coro())
print(f"Result: {result}")
```

### Async Context Managers와 Generators

```python
import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

class AsyncResource:
    """비동기 리소스 예시"""
    
    async def __aenter__(self):
        print("Acquiring resource...")
        await asyncio.sleep(0.1)  # 리소스 획득 시뮬레이션
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        print("Releasing resource...")
        await asyncio.sleep(0.1)  # 리소스 해제 시뮬레이션

@asynccontextmanager
async def managed_resource():
    """비동기 컨텍스트 매니저"""
    resource = AsyncResource()
    async with resource:
        yield resource

async def async_generator_example() -> AsyncGenerator[int, None]:
    """비동기 제너레이터"""
    for i in range(5):
        await asyncio.sleep(0.1)
        yield i * i

async def main():
    # 비동기 컨텍스트 매니저 사용
    async with managed_resource() as resource:
        print("Using resource")
        
    # 비동기 제너레이터 사용
    async for value in async_generator_example():
        print(f"Generated: {value}")

asyncio.run(main())
```

## Go Goroutines: CSP 모델

### Goroutine의 내부 구조

```go
package main

import (
    "fmt"
    "runtime"
    "sync"
    "time"
)

// Goroutine의 스케줄링 모델: M:N 스케줄링
// M = OS 스레드, N = 고루틴, P = 프로세서 (논리적 CPU)

func demonstrateGoroutineScheduling() {
    numCPU := runtime.NumCPU()
    runtime.GOMAXPROCS(numCPU)
    
    fmt.Printf("Number of CPUs: %d\n", numCPU)
    fmt.Printf("Number of goroutines before: %d\n", runtime.NumGoroutine())
    
    var wg sync.WaitGroup
    
    // 1000개의 고루틴 생성
    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            
            // CPU 집약적 작업
            sum := 0
            for j := 0; j < 1000000; j++ {
                sum += j
            }
            
            fmt.Printf("Goroutine %d finished with sum: %d\n", id, sum)
        }(i)
    }
    
    fmt.Printf("Number of goroutines after creation: %d\n", runtime.NumGoroutine())
    wg.Wait()
    
    // 가비지 컬렉터 실행 후 고루틴 수 확인
    runtime.GC()
    time.Sleep(100 * time.Millisecond)
    fmt.Printf("Number of goroutines after completion: %d\n", runtime.NumGoroutine())
}
```

### Channel을 통한 통신

```go
// Producer-Consumer 패턴
func producerConsumerExample() {
    // 버퍼드 채널로 백프레셔 제어
    jobs := make(chan int, 100)
    results := make(chan int, 100)
    
    // 프로듀서
    go func() {
        defer close(jobs)
        for i := 0; i < 1000; i++ {
            jobs <- i
        }
    }()
    
    // 여러 워커 (컨슈머)
    const numWorkers = 5
    var wg sync.WaitGroup
    
    for w := 0; w < numWorkers; w++ {
        wg.Add(1)
        go func(workerID int) {
            defer wg.Done()
            for job := range jobs {
                // 작업 시뮬레이션
                result := job * job
                results <- result
                
                // 가끔 블로킹 I/O 시뮬레이션
                if job%50 == 0 {
                    time.Sleep(10 * time.Millisecond)
                    fmt.Printf("Worker %d processed job %d\n", workerID, job)
                }
            }
        }(w)
    }
    
    // 결과 수집용 고루틴
    go func() {
        wg.Wait()
        close(results)
    }()
    
    // 결과 처리
    sum := 0
    count := 0
    for result := range results {
        sum += result
        count++
    }
    
    fmt.Printf("Processed %d jobs with total sum: %d\n", count, sum)
}

// Select문을 이용한 다중 채널 처리
func selectExample() {
    ch1 := make(chan string)
    ch2 := make(chan string)
    timeout := time.After(2 * time.Second)
    
    // 두 개의 고루틴이 서로 다른 속도로 데이터 전송
    go func() {
        time.Sleep(500 * time.Millisecond)
        ch1 <- "Data from channel 1"
    }()
    
    go func() {
        time.Sleep(800 * time.Millisecond)
        ch2 <- "Data from channel 2"
    }()
    
    for i := 0; i < 2; i++ {
        select {
        case msg1 := <-ch1:
            fmt.Printf("Received: %s\n", msg1)
        case msg2 := <-ch2:
            fmt.Printf("Received: %s\n", msg2)
        case <-timeout:
            fmt.Println("Timeout occurred")
            return
        }
    }
}

func main() {
    fmt.Println("=== Goroutine Scheduling Demo ===")
    demonstrateGoroutineScheduling()
    
    fmt.Println("\n=== Producer-Consumer Demo ===")
    producerConsumerExample()
    
    fmt.Println("\n=== Select Statement Demo ===")
    selectExample()
}
```

### 고급 패턴: Worker Pool과 Rate Limiting

```go
package main

import (
    "context"
    "fmt"
    "golang.org/x/time/rate"
    "sync"
    "time"
)

// 고급 워커 풀 구현
type WorkerPool struct {
    workers   int
    jobQueue  chan Job
    wg        sync.WaitGroup
    ctx       context.Context
    cancel    context.CancelFunc
    limiter   *rate.Limiter
}

type Job struct {
    ID   int
    Data string
    ProcessFunc func(string) string
}

func NewWorkerPool(workers int, queueSize int, requestsPerSecond rate.Limit) *WorkerPool {
    ctx, cancel := context.WithCancel(context.Background())
    
    return &WorkerPool{
        workers:  workers,
        jobQueue: make(chan Job, queueSize),
        ctx:      ctx,
        cancel:   cancel,
        limiter:  rate.NewLimiter(requestsPerSecond, int(requestsPerSecond)),
    }
}

func (wp *WorkerPool) Start() {
    for i := 0; i < wp.workers; i++ {
        wp.wg.Add(1)
        go wp.worker(i)
    }
}

func (wp *WorkerPool) worker(id int) {
    defer wp.wg.Done()
    
    for {
        select {
        case job := <-wp.jobQueue:
            // Rate limiting 적용
            if err := wp.limiter.Wait(wp.ctx); err != nil {
                fmt.Printf("Worker %d: Rate limiter error: %v\n", id, err)
                return
            }
            
            start := time.Now()
            result := job.ProcessFunc(job.Data)
            duration := time.Since(start)
            
            fmt.Printf("Worker %d processed job %d: %s (took %v)\n", 
                id, job.ID, result, duration)
                
        case <-wp.ctx.Done():
            fmt.Printf("Worker %d shutting down\n", id)
            return
        }
    }
}

func (wp *WorkerPool) Submit(job Job) error {
    select {
    case wp.jobQueue <- job:
        return nil
    case <-wp.ctx.Done():
        return fmt.Errorf("worker pool is shutting down")
    default:
        return fmt.Errorf("job queue is full")
    }
}

func (wp *WorkerPool) Stop() {
    close(wp.jobQueue)
    wp.cancel()
    wp.wg.Wait()
}

// HTTP 클라이언트 시뮬레이션
func simulateHTTPRequest(data string) string {
    // HTTP 요청 시뮬레이션 (50-200ms)
    delay := time.Duration(50+len(data)%150) * time.Millisecond
    time.Sleep(delay)
    return fmt.Sprintf("processed_%s", data)
}

func main() {
    // 5개 워커, 큐 크기 20, 초당 10개 요청 제한
    pool := NewWorkerPool(5, 20, rate.Limit(10))
    pool.Start()
    
    // 100개 작업 제출
    go func() {
        for i := 0; i < 100; i++ {
            job := Job{
                ID:   i,
                Data: fmt.Sprintf("task_%d", i),
                ProcessFunc: simulateHTTPRequest,
            }
            
            if err := pool.Submit(job); err != nil {
                fmt.Printf("Failed to submit job %d: %v\n", i, err)
                time.Sleep(100 * time.Millisecond) // 백오프
            }
        }
    }()
    
    // 10초 후 종료
    time.Sleep(10 * time.Second)
    fmt.Println("Shutting down worker pool...")
    pool.Stop()
    fmt.Println("Worker pool stopped")
}
```

## Rust Async/Await와 Futures

### Future Trait와 Executor

```rust
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll, Waker};
use std::time::{Duration, Instant};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// 커스텀 Future 구현
struct Delay {
    when: Instant,
}

impl Delay {
    fn new(duration: Duration) -> Self {
        Self {
            when: Instant::now() + duration,
        }
    }
}

impl Future for Delay {
    type Output = ();
    
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        if Instant::now() >= self.when {
            Poll::Ready(())
        } else {
            // Waker를 등록하여 나중에 깨울 수 있도록 함
            cx.waker().wake_by_ref();
            Poll::Pending
        }
    }
}

// 간단한 executor 구현
struct SimpleExecutor {
    ready_queue: Vec<Arc<Task>>,
}

struct Task {
    future: Mutex<Pin<Box<dyn Future<Output = ()> + Send>>>,
    waker: Mutex<Option<Waker>>,
}

impl SimpleExecutor {
    fn new() -> Self {
        Self {
            ready_queue: Vec::new(),
        }
    }
    
    fn spawn(&mut self, future: impl Future<Output = ()> + Send + 'static) {
        let task = Arc::new(Task {
            future: Mutex::new(Box::pin(future)),
            waker: Mutex::new(None),
        });
        
        self.ready_queue.push(task);
    }
    
    fn run(&mut self) {
        while !self.ready_queue.is_empty() {
            let mut still_pending = Vec::new();
            
            for task in self.ready_queue.drain(..) {
                let waker = task_waker(Arc::clone(&task));
                let mut context = Context::from_waker(&waker);
                
                let mut future = task.future.lock().unwrap();
                match future.as_mut().poll(&mut context) {
                    Poll::Ready(()) => {
                        // 작업 완료
                    }
                    Poll::Pending => {
                        still_pending.push(task);
                    }
                }
            }
            
            self.ready_queue = still_pending;
            
            // 실제 구현에서는 여기서 I/O 이벤트를 확인
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

// Waker 구현 (단순화됨)
fn task_waker(task: Arc<Task>) -> Waker {
    // 실제 구현에서는 더 복잡한 waker 생성 필요
    todo!("Simplified for demonstration")
}

// 비동기 HTTP 클라이언트 예시
use tokio;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 병렬 HTTP 요청
    let urls = vec![
        "https://httpbin.org/delay/1",
        "https://httpbin.org/delay/1", 
        "https://httpbin.org/delay/1",
    ];
    
    let start = Instant::now();
    
    // 모든 요청을 병렬로 처리
    let futures: Vec<_> = urls.into_iter()
        .map(|url| fetch_url(url))
        .collect();
        
    let results = futures_util::future::join_all(futures).await;
    
    let duration = start.elapsed();
    println!("Completed {} requests in {:?}", results.len(), duration);
    
    // Stream processing 예시
    stream_processing_example().await?;
    
    Ok(())
}

async fn fetch_url(url: &str) -> Result<String, reqwest::Error> {
    println!("Fetching: {}", url);
    let response = reqwest::get(url).await?;
    let text = response.text().await?;
    println!("Completed: {}", url);
    Ok(text)
}

// Stream 처리 예시
use futures_util::{StreamExt, SinkExt};
use tokio_stream::wrappers::ReceiverStream;

async fn stream_processing_example() -> Result<(), Box<dyn std::error::Error>> {
    let (tx, rx) = tokio::sync::mpsc::channel(32);
    
    // 데이터 프로듀서
    tokio::spawn(async move {
        for i in 0..100 {
            if tx.send(i).await.is_err() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    });
    
    // Stream을 통한 데이터 처리
    let stream = ReceiverStream::new(rx);
    let processed: Vec<_> = stream
        .map(|x| async move {
            // 비동기 변환
            tokio::time::sleep(Duration::from_millis(1)).await;
            x * x
        })
        .buffer_unordered(10) // 최대 10개까지 병렬 처리
        .collect()
        .await;
    
    println!("Processed {} items", processed.len());
    Ok(())
}

// Pin과 Unpin 이해하기
use std::marker::Unpin;

struct SelfReferential {
    data: String,
    pointer: *const u8, // data를 가리키는 포인터
}

impl SelfReferential {
    fn new(data: String) -> Pin<Box<Self>> {
        let mut boxed = Box::pin(SelfReferential {
            pointer: std::ptr::null(),
            data,
        });
        
        // 안전하지 않은 코드: self-referential 구조 생성
        unsafe {
            let mut_ref: Pin<&mut Self> = boxed.as_mut();
            let ptr = mut_ref.data.as_ptr();
            let mut_ref = Pin::get_unchecked_mut(mut_ref);
            mut_ref.pointer = ptr;
        }
        
        boxed
    }
    
    fn data(&self) -> &str {
        &self.data
    }
    
    fn pointer_data(&self) -> &str {
        unsafe {
            let len = self.data.len();
            std::str::from_utf8_unchecked(
                std::slice::from_raw_parts(self.pointer, len)
            )
        }
    }
}

// Pin은 이런 구조가 메모리에서 이동하는 것을 방지합니다
```

### 고성능 비동기 서버

```rust
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::{RwLock, Semaphore};

#[derive(Clone)]
struct Server {
    connections: Arc<RwLock<HashMap<String, Arc<Connection>>>>,
    connection_semaphore: Arc<Semaphore>, // 동시 연결 제한
}

struct Connection {
    addr: String,
    last_activity: std::time::Instant,
}

impl Server {
    fn new(max_connections: usize) -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            connection_semaphore: Arc::new(Semaphore::new(max_connections)),
        }
    }
    
    async fn run(&self, addr: &str) -> Result<(), Box<dyn std::error::Error>> {
        let listener = TcpListener::bind(addr).await?;
        println!("Server listening on: {}", addr);
        
        loop {
            let (stream, addr) = listener.accept().await?;
            let server = self.clone();
            
            // 각 연결을 별도 태스크로 처리
            tokio::spawn(async move {
                if let Err(e) = server.handle_connection(stream, addr.to_string()).await {
                    println!("Error handling connection: {}", e);
                }
            });
        }
    }
    
    async fn handle_connection(&self, mut stream: TcpStream, addr: String) -> Result<(), Box<dyn std::error::Error>> {
        // 동시 연결 수 제한
        let _permit = self.connection_semaphore.acquire().await?;
        
        // 연결 등록
        let connection = Arc::new(Connection {
            addr: addr.clone(),
            last_activity: std::time::Instant::now(),
        });
        
        {
            let mut connections = self.connections.write().await;
            connections.insert(addr.clone(), connection.clone());
        }
        
        println!("New connection: {}", addr);
        
        // 연결 처리
        let mut buffer = [0; 1024];
        loop {
            match stream.read(&mut buffer).await {
                Ok(0) => break, // 연결 종료
                Ok(n) => {
                    let request = String::from_utf8_lossy(&buffer[..n]);
                    println!("Received from {}: {}", addr, request.trim());
                    
                    // Echo 응답
                    let response = format!("Echo: {}", request);
                    stream.write_all(response.as_bytes()).await?;
                }
                Err(e) => {
                    println!("Error reading from {}: {}", addr, e);
                    break;
                }
            }
        }
        
        // 연결 해제
        {
            let mut connections = self.connections.write().await;
            connections.remove(&addr);
        }
        
        println!("Connection closed: {}", addr);
        Ok(())
    }
    
    async fn get_connection_count(&self) -> usize {
        let connections = self.connections.read().await;
        connections.len()
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let server = Server::new(1000); // 최대 1000개 동시 연결
    
    // 서버 상태 모니터링 태스크
    let monitor_server = server.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(10));
        loop {
            interval.tick().await;
            let count = monitor_server.get_connection_count().await;
            println!("Active connections: {}", count);
        }
    });
    
    // 서버 실행
    server.run("127.0.0.1:8080").await?;
    Ok(())
}
```

## 성능 비교: Threads vs Coroutines vs Callbacks

### 메모리 사용량 비교

```bash
# 10,000개 동시 연결 처리 시 메모리 사용량

# 1. Thread per connection (Java/C++)
# 스레드 스택: 8MB * 10,000 = 80GB (불가능)
# 실제 제한: ~수백 개 스레드

# 2. Thread pool + blocking I/O (Java NIO before)
# 스레드: 200개 * 8MB = 1.6GB
# + 연결별 버퍼 등 = 2-3GB

# 3. Coroutines (Go/Rust/Python)
# 고루틴: 2KB * 10,000 = 20MB
# + 런타임 오버헤드 = 50-100MB

# 4. Event loop + callbacks (Node.js/nginx)
# 연결별 상태: 1KB * 10,000 = 10MB
# + 이벤트 루프 = 20-50MB
```

### 벤치마크 코드

```go
package main

import (
    "fmt"
    "net/http"
    "sync"
    "time"
    "context"
)

// Thread Pool 방식
func threadPoolServer() {
    const numWorkers = 100
    jobQueue := make(chan func(), 1000)
    
    // Worker pool 시작
    var wg sync.WaitGroup
    for i := 0; i < numWorkers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for job := range jobQueue {
                job()
            }
        }()
    }
    
    http.HandleFunc("/threadpool", func(w http.ResponseWriter, r *http.Request) {
        jobQueue <- func() {
            // I/O 시뮬레이션
            time.Sleep(100 * time.Millisecond)
            fmt.Fprintf(w, "Thread pool response")
        }
    })
}

// Goroutine 방식
func goroutineServer() {
    http.HandleFunc("/goroutine", func(w http.ResponseWriter, r *http.Request) {
        go func() {
            // I/O 시뮬레이션  
            time.Sleep(100 * time.Millisecond)
            fmt.Fprintf(w, "Goroutine response")
        }()
    })
}

// 성능 테스트
func benchmarkConcurrency() {
    const numRequests = 10000
    
    // Goroutine 벤치마크
    start := time.Now()
    var wg sync.WaitGroup
    
    for i := 0; i < numRequests; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            // 작업 시뮬레이션
            time.Sleep(1 * time.Millisecond)
        }(i)
    }
    
    wg.Wait()
    goroutineDuration := time.Since(start)
    
    // Thread Pool 벤치마크
    start = time.Now()
    jobQueue := make(chan int, numRequests)
    const numWorkers = 100
    
    wg = sync.WaitGroup{}
    wg.Add(numWorkers)
    
    for i := 0; i < numWorkers; i++ {
        go func() {
            defer wg.Done()
            for job := range jobQueue {
                _ = job
                time.Sleep(1 * time.Millisecond)
            }
        }()
    }
    
    for i := 0; i < numRequests; i++ {
        jobQueue <- i
    }
    close(jobQueue)
    
    wg.Wait()
    threadPoolDuration := time.Since(start)
    
    fmt.Printf("Goroutines: %v\n", goroutineDuration)
    fmt.Printf("Thread Pool: %v\n", threadPoolDuration)
    fmt.Printf("Goroutines are %.2fx faster\n", 
        float64(threadPoolDuration)/float64(goroutineDuration))
}
```

### 처리량(Throughput) 비교

```python
# Python으로 각 모델의 처리량 비교

import asyncio
import threading
import time
import concurrent.futures
import requests
from aiohttp import ClientSession

async def async_request(session, url):
    """비동기 HTTP 요청"""
    async with session.get(url) as response:
        return await response.text()

def sync_request(url):
    """동기 HTTP 요청"""
    response = requests.get(url)
    return response.text

async def benchmark_async(num_requests=100):
    """비동기 방식 벤치마크"""
    url = "https://httpbin.org/delay/0.1"  # 100ms 지연
    
    start = time.time()
    
    async with ClientSession() as session:
        tasks = [async_request(session, url) for _ in range(num_requests)]
        results = await asyncio.gather(*tasks)
    
    duration = time.time() - start
    return duration, len(results)

def benchmark_threads(num_requests=100):
    """스레드 풀 방식 벤치마크"""
    url = "https://httpbin.org/delay/0.1"
    
    start = time.time()
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        futures = [executor.submit(sync_request, url) for _ in range(num_requests)]
        results = [future.result() for future in concurrent.futures.as_completed(futures)]
    
    duration = time.time() - start
    return duration, len(results)

def benchmark_sequential(num_requests=100):
    """순차 처리 벤치마크"""
    url = "https://httpbin.org/delay/0.1"
    
    start = time.time()
    results = [sync_request(url) for _ in range(num_requests)]
    duration = time.time() - start
    
    return duration, len(results)

async def run_benchmarks():
    num_requests = 50
    
    print(f"Benchmarking {num_requests} HTTP requests...")
    
    # 비동기 방식
    async_duration, async_results = await benchmark_async(num_requests)
    print(f"Async: {async_duration:.2f}s, {async_results} requests")
    print(f"Async RPS: {num_requests/async_duration:.1f}")
    
    # 스레드 풀 방식
    thread_duration, thread_results = benchmark_threads(num_requests)
    print(f"Threads: {thread_duration:.2f}s, {thread_results} requests")
    print(f"Thread RPS: {num_requests/thread_duration:.1f}")
    
    # 순차 처리
    seq_duration, seq_results = benchmark_sequential(num_requests)
    print(f"Sequential: {seq_duration:.2f}s, {seq_results} requests")
    print(f"Sequential RPS: {num_requests/seq_duration:.1f}")
    
    print(f"\nAsync is {seq_duration/async_duration:.1f}x faster than sequential")
    print(f"Async is {thread_duration/async_duration:.1f}x faster than threads")

if __name__ == "__main__":
    asyncio.run(run_benchmarks())
```

## Real-World Use Cases

### 1. High-Performance Web Server

```python
# FastAPI + AsyncIO를 사용한 고성능 웹 서버
from fastapi import FastAPI, BackgroundTasks
import asyncio
import aioredis
import aiopg
import uvloop  # 더 빠른 이벤트 루프

# uvloop 사용 (Linux에서 30-40% 성능 향상)
asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())

app = FastAPI()

# 커넥션 풀들
redis_pool = None
postgres_pool = None

@app.on_event("startup")
async def startup():
    global redis_pool, postgres_pool
    redis_pool = await aioredis.create_redis_pool('redis://localhost')
    postgres_pool = await aiopg.create_pool('postgresql://user:pass@localhost/db')

@app.on_event("shutdown") 
async def shutdown():
    redis_pool.close()
    await redis_pool.wait_closed()
    postgres_pool.close()
    await postgres_pool.wait_closed()

@app.get("/api/data/{user_id}")
async def get_user_data(user_id: int):
    # 캐시 확인과 DB 쿼리를 병렬로 실행
    cache_task = asyncio.create_task(redis_pool.get(f"user:{user_id}"))
    
    cached_data = await cache_task
    if cached_data:
        return {"data": cached_data, "source": "cache"}
    
    # DB에서 데이터 조회
    async with postgres_pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            user_data = await cur.fetchone()
    
    if user_data:
        # 백그라운드에서 캐시 업데이트
        asyncio.create_task(redis_pool.setex(f"user:{user_id}", 300, str(user_data)))
        return {"data": user_data, "source": "database"}
    
    return {"error": "User not found"}

# 실행: uvicorn main:app --workers 4 --loop uvloop
# 단일 서버에서 50,000+ RPS 처리 가능
```

### 2. Game Programming: Entity Component System

```cpp
// C++20 코루틴을 이용한 게임 엔티티 시스템
#include <coroutine>
#include <chrono>
#include <vector>
#include <unordered_map>
#include <memory>

class GameTimer {
public:
    struct awaitable {
        std::chrono::milliseconds duration;
        std::chrono::steady_clock::time_point start_time;
        
        awaitable(std::chrono::milliseconds dur) 
            : duration(dur), start_time(std::chrono::steady_clock::now()) {}
        
        bool await_ready() const {
            return std::chrono::steady_clock::now() >= start_time + duration;
        }
        
        void await_suspend(std::coroutine_handle<> handle) const {
            // 게임 엔진의 타이머 시스템에 등록
            GameEngine::instance().schedule_resume(handle, start_time + duration);
        }
        
        void await_resume() const {}
    };
    
    static awaitable wait_for(std::chrono::milliseconds ms) {
        return awaitable(ms);
    }
};

// 게임 엔티티 behavior를 코루틴으로 구현
struct Task {
    struct promise_type {
        Task get_return_object() {
            return Task{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_never initial_suspend() { return {}; }
        std::suspend_never final_suspend() noexcept { return {}; }
        void return_void() {}
        void unhandled_exception() { std::terminate(); }
    };
    
    std::coroutine_handle<promise_type> coro;
    Task(std::coroutine_handle<promise_type> h) : coro(h) {}
    ~Task() { if (coro) coro.destroy(); }
};

// NPC AI 행동을 코루틴으로 구현
Task npc_patrol_behavior(EntityId entity_id) {
    auto& transform = EntityManager::get_component<Transform>(entity_id);
    auto& ai = EntityManager::get_component<AIComponent>(entity_id);
    
    while (ai.is_active) {
        // 첫 번째 웨이포인트로 이동
        for (auto& waypoint : ai.patrol_points) {
            while (Vector3::distance(transform.position, waypoint) > 0.1f) {
                transform.position = Vector3::move_towards(
                    transform.position, waypoint, ai.move_speed * Time::delta_time());
                
                // 한 프레임 대기 (60 FPS)
                co_await GameTimer::wait_for(std::chrono::milliseconds(16));
            }
            
            // 웨이포인트에서 2초 대기
            co_await GameTimer::wait_for(std::chrono::milliseconds(2000));
        }
    }
}

// 공격 쿨다운 시스템
Task attack_cooldown(EntityId entity_id, std::chrono::milliseconds cooldown) {
    auto& combat = EntityManager::get_component<CombatComponent>(entity_id);
    
    combat.can_attack = false;
    co_await GameTimer::wait_for(cooldown);
    combat.can_attack = true;
}

// 이벤트 기반 대화 시스템
Task dialogue_sequence(EntityId npc_id, const std::vector<std::string>& lines) {
    auto& dialogue = EntityManager::get_component<DialogueComponent>(npc_id);
    
    for (const auto& line : lines) {
        dialogue.current_text = line;
        dialogue.is_displaying = true;
        
        // 텍스트 타이핑 애니메이션 (문자당 50ms)
        for (size_t i = 0; i <= line.length(); ++i) {
            dialogue.visible_text = line.substr(0, i);
            co_await GameTimer::wait_for(std::chrono::milliseconds(50));
        }
        
        // 플레이어 입력 대기 (Enter 키 또는 클릭)
        while (!Input::is_action_pressed("continue")) {
            co_await GameTimer::wait_for(std::chrono::milliseconds(16));
        }
        
        // 다음 라인으로
        co_await GameTimer::wait_for(std::chrono::milliseconds(500));
    }
    
    dialogue.is_displaying = false;
}

// 파티클 시스템 - 생명주기 관리
Task particle_lifetime(ParticleId particle_id, float lifetime) {
    auto& particle = ParticleSystem::get_particle(particle_id);
    
    float elapsed = 0.0f;
    while (elapsed < lifetime) {
        float alpha = 1.0f - (elapsed / lifetime);  // 페이드 아웃
        particle.color.a = alpha;
        
        co_await GameTimer::wait_for(std::chrono::milliseconds(16));
        elapsed += Time::delta_time();
    }
    
    ParticleSystem::destroy_particle(particle_id);
}

// 메인 게임 루프에서 모든 코루틴 관리
class GameEngine {
    std::vector<Task> active_tasks;
    std::priority_queue<ScheduledResume> scheduled_resumes;
    
public:
    void update() {
        // 예약된 코루틴 재개
        auto now = std::chrono::steady_clock::now();
        while (!scheduled_resumes.empty() && 
               scheduled_resumes.top().resume_time <= now) {
            scheduled_resumes.top().handle.resume();
            scheduled_resumes.pop();
        }
        
        // 완료된 태스크 정리
        active_tasks.erase(
            std::remove_if(active_tasks.begin(), active_tasks.end(),
                [](const Task& task) { return task.coro.done(); }),
            active_tasks.end());
    }
    
    void schedule_resume(std::coroutine_handle<> handle, 
                        std::chrono::steady_clock::time_point when) {
        scheduled_resumes.emplace(handle, when);
    }
    
    void spawn_task(Task task) {
        active_tasks.emplace_back(std::move(task));
    }
};

// 사용 예시
void init_game() {
    auto& engine = GameEngine::instance();
    
    // NPC들의 AI 행동 시작
    for (auto npc_id : npc_entities) {
        engine.spawn_task(npc_patrol_behavior(npc_id));
    }
    
    // 대화 이벤트 설정
    engine.spawn_task(dialogue_sequence(quest_giver_id, {
        "Hello, brave adventurer!",
        "I have a quest for you...",
        "Will you help me?"
    }));
}
```

### 3. Data Pipeline Processing

```python
# 대용량 데이터 파이프라인을 AsyncIO로 구현
import asyncio
import aiofiles
import aiohttp
import json
from typing import AsyncIterator, Dict, Any
import logging

class AsyncDataPipeline:
    def __init__(self, max_concurrent_tasks: int = 100):
        self.semaphore = asyncio.Semaphore(max_concurrent_tasks)
        self.session = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def read_data_stream(self, file_path: str) -> AsyncIterator[Dict[str, Any]]:
        """대용량 JSON Lines 파일을 스트리밍으로 읽기"""
        async with aiofiles.open(file_path, 'r') as file:
            async for line in file:
                try:
                    yield json.loads(line.strip())
                except json.JSONDecodeError as e:
                    logging.warning(f"Invalid JSON line: {e}")
    
    async def enrich_data(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """외부 API로 데이터 보강"""
        async with self.semaphore:  # 동시 API 호출 제한
            try:
                user_id = record.get('user_id')
                if user_id:
                    # 사용자 정보 API 호출
                    async with self.session.get(f'https://api.example.com/users/{user_id}') as response:
                        if response.status == 200:
                            user_data = await response.json()
                            record['user_profile'] = user_data
                            
                    # 지역 정보 API 호출 (병렬)
                    if 'location' in record:
                        async with self.session.get(f'https://api.example.com/geo/{record["location"]}') as response:
                            if response.status == 200:
                                geo_data = await response.json()
                                record['geo_info'] = geo_data
                
                return record
            except Exception as e:
                logging.error(f"Error enriching record: {e}")
                return record
    
    async def transform_data(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """데이터 변환 및 정제"""
        # 데이터 변환 로직 (CPU 바운드 작업)
        await asyncio.sleep(0)  # yield control
        
        transformed = {
            'id': record.get('id'),
            'timestamp': record.get('created_at'),
            'user_id': record.get('user_id'),
            'event_type': record.get('event', '').lower(),
            'value': float(record.get('value', 0)),
            'processed_at': asyncio.get_event_loop().time()
        }
        
        # 데이터 검증
        if not all([transformed['id'], transformed['user_id'], transformed['event_type']]):
            raise ValueError("Missing required fields")
            
        return transformed
    
    async def write_batch(self, batch: List[Dict[str, Any]], output_file: str):
        """배치 단위로 출력 파일에 쓰기"""
        async with aiofiles.open(output_file, 'a') as file:
            for record in batch:
                await file.write(json.dumps(record) + '\n')
    
    async def process_pipeline(self, input_file: str, output_file: str, batch_size: int = 1000):
        """전체 데이터 파이프라인 실행"""
        batch = []
        processed_count = 0
        error_count = 0
        
        async for record in self.read_data_stream(input_file):
            try:
                # 단계별 처리 파이프라인
                enriched = await self.enrich_data(record)
                transformed = await self.transform_data(enriched)
                
                batch.append(transformed)
                processed_count += 1
                
                # 배치 크기에 도달하면 쓰기
                if len(batch) >= batch_size:
                    await self.write_batch(batch, output_file)
                    batch.clear()
                    logging.info(f"Processed {processed_count} records")
                    
            except Exception as e:
                error_count += 1
                logging.error(f"Error processing record: {e}")
        
        # 남은 배치 처리
        if batch:
            await self.write_batch(batch, output_file)
        
        logging.info(f"Pipeline completed: {processed_count} processed, {error_count} errors")

# 사용 예시
async def main():
    async with AsyncDataPipeline(max_concurrent_tasks=50) as pipeline:
        await pipeline.process_pipeline(
            input_file='large_dataset.jsonl',
            output_file='processed_output.jsonl',
            batch_size=500
        )

# 실행
if __name__ == "__main__":
    # 로깅 설정
    logging.basicConfig(level=logging.INFO)
    
    # 이벤트 루프 실행
    asyncio.run(main())

# 성능 모니터링을 위한 메트릭
async def monitor_pipeline_performance():
    """파이프라인 성능 모니터링"""
    import psutil
    import time
    
    process = psutil.Process()
    start_time = time.time()
    
    while True:
        cpu_percent = process.cpu_percent()
        memory_mb = process.memory_info().rss / 1024 / 1024
        elapsed = time.time() - start_time
        
        logging.info(f"Performance - CPU: {cpu_percent:.1f}%, Memory: {memory_mb:.1f}MB, Elapsed: {elapsed:.1f}s")
        
        await asyncio.sleep(10)

# 더 고급 파이프라인: 실시간 스트림 처리
import asyncio_mqtt

async def real_time_stream_processor():
    """MQTT를 통한 실시간 데이터 스트림 처리"""
    async with asyncio_mqtt.Client("mqtt.broker.com") as client:
        await client.subscribe("sensors/+/data")
        
        async with client.messages() as messages:
            async for message in messages:
                try:
                    # JSON 파싱
                    data = json.loads(message.payload.decode())
                    
                    # 실시간 처리 (비동기)
                    processed = await process_sensor_data(data)
                    
                    # 결과를 다른 토픽으로 발행
                    await client.publish("processed/sensor/data", json.dumps(processed))
                    
                except Exception as e:
                    logging.error(f"Error processing message: {e}")

async def process_sensor_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """센서 데이터 처리"""
    # 실제 처리 로직
    return {
        'sensor_id': data['id'],
        'value': data['temperature'] * 1.8 + 32,  # Celsius to Fahrenheit
        'timestamp': data['timestamp'],
        'status': 'normal' if data['temperature'] < 80 else 'high'
    }
```

## 성능 최적화 Tips

### 1. 적절한 동시성 레벨 설정

```python
# 잘못된 방법: 무제한 동시성
async def bad_concurrent_processing():
    urls = ['http://example.com'] * 10000
    tasks = [fetch_url(url) for url in urls]  # 10,000개 동시 연결!
    await asyncio.gather(*tasks)  # 서버 다운 위험

# 올바른 방법: Semaphore로 제한
async def good_concurrent_processing():
    semaphore = asyncio.Semaphore(50)  # 최대 50개 동시 연결
    
    async def limited_fetch(url):
        async with semaphore:
            return await fetch_url(url)
    
    urls = ['http://example.com'] * 10000
    tasks = [limited_fetch(url) for url in urls]
    await asyncio.gather(*tasks)
```

### 2. CPU 바운드 작업 처리

```python
# CPU 집약적 작업은 process pool 사용
import asyncio
import concurrent.futures
import multiprocessing

async def cpu_intensive_with_coroutines():
    loop = asyncio.get_event_loop()
    
    # CPU 바운드 작업을 별도 프로세스에서
    with concurrent.futures.ProcessPoolExecutor() as executor:
        tasks = []
        
        for i in range(100):
            # CPU 집약적 함수를 비동기적으로 실행
            task = loop.run_in_executor(executor, cpu_heavy_function, i)
            tasks.append(task)
        
        results = await asyncio.gather(*tasks)
    
    return results

def cpu_heavy_function(n):
    # 소수 찾기 등의 CPU 집약적 작업
    return sum(i for i in range(n * 1000000) if i % 2 == 0)
```

### 3. 메모리 효율적인 스트림 처리

```python
# 잘못된 방법: 모든 데이터를 메모리에 로드
async def memory_inefficient():
    async with aiofiles.open('huge_file.txt', 'r') as file:
        content = await file.read()  # 전체 파일을 메모리에!
        lines = content.split('\n')
        return [process_line(line) for line in lines]

# 올바른 방법: 스트림 처리
async def memory_efficient():
    results = []
    async with aiofiles.open('huge_file.txt', 'r') as file:
        async for line in file:  # 라인별로 스트리밍
            result = await process_line_async(line.strip())
            results.append(result)
            
            # 메모리 사용량 제어
            if len(results) >= 1000:
                await flush_results(results)
                results.clear()
    
    if results:
        await flush_results(results)
```

## 문제 해결과 디버깅

### 1. 데드락 방지

```go
// 잘못된 채널 사용 - 데드락 발생
func deadlock_example() {
    ch := make(chan int)  // unbuffered channel
    
    ch <- 42  // 블록됨 - 받는 고루틴 없음
    val := <-ch  // 도달 불가
    fmt.Println(val)
}

// 올바른 방법
func correct_channel_usage() {
    ch := make(chan int, 1)  // buffered channel
    
    ch <- 42
    val := <-ch
    fmt.Println(val)
    
    // 또는 별도 고루틴 사용
    ch2 := make(chan int)
    go func() {
        ch2 <- 42
    }()
    val2 := <-ch2
    fmt.Println(val2)
}
```

### 2. 메모리 누수 탐지

```python
# 코루틴 메모리 누수 디버깅
import tracemalloc
import asyncio

async def debug_memory_leaks():
    # 메모리 추적 시작
    tracemalloc.start()
    
    # 의심스러운 코드 실행
    await suspicious_async_function()
    
    # 메모리 사용량 스냅샷
    current, peak = tracemalloc.get_traced_memory()
    print(f"Current memory usage: {current / 1024 / 1024:.1f} MB")
    print(f"Peak memory usage: {peak / 1024 / 1024:.1f} MB")
    
    # 가장 많은 메모리를 사용하는 코드 라인 출력
    snapshot = tracemalloc.take_snapshot()
    top_stats = snapshot.statistics('lineno')
    
    print("Top 10 memory allocations:")
    for stat in top_stats[:10]:
        print(stat)
```

### 3. 성능 프로파일링

```rust
// Rust 비동기 코드 프로파일링
use tokio;
use std::time::Instant;

#[tokio::main]
async fn main() {
    let start = Instant::now();
    
    // 프로파일링할 비동기 함수들
    let tasks = vec![
        tokio::spawn(slow_async_function(1)),
        tokio::spawn(slow_async_function(2)),
        tokio::spawn(slow_async_function(3)),
    ];
    
    for (i, task) in tasks.into_iter().enumerate() {
        let task_start = Instant::now();
        let result = task.await.unwrap();
        let task_duration = task_start.elapsed();
        
        println!("Task {} completed in {:?}: {}", i, task_duration, result);
    }
    
    let total_duration = start.elapsed();
    println!("Total execution time: {:?}", total_duration);
}

async fn slow_async_function(id: u32) -> String {
    // 의도적인 지연
    tokio::time::sleep(tokio::time::Duration::from_millis(100 * id as u64)).await;
    format!("Result from function {}", id)
}

// Flamegraph 생성을 위한 설정 (Cargo.toml)
/*
[profile.release]
debug = true  # 심볼 정보 유지

[dependencies]  
tokio = { version = "1.0", features = ["full", "tracing"] }
tracing = "0.1"
tracing-subscriber = "0.3"
console-subscriber = "0.1"  # tokio-console 지원
*/
```

## 정리

코루틴은 현대적인 동시성 프로그래밍의 핵심입니다:

### 주요 장점
1. **메모리 효율성**: 스레드 대비 100배 적은 메모리 사용
2. **높은 동시성**: 수만 개의 동시 작업 처리 가능
3. **코드 가독성**: 동기식 코드와 유사한 작성 스타일
4. **성능**: I/O 바운드 작업에서 탁월한 성능

### 적용 시나리오
1. **웹 서버**: 고동시성 HTTP 요청 처리
2. **데이터 파이프라인**: 대용량 데이터 스트림 처리
3. **게임 개발**: 엔티티 행동 및 애니메이션
4. **IoT/실시간 시스템**: 센서 데이터 수집 및 처리
5. **마이크로서비스**: 서비스 간 비동기 통신

### 성능 고려사항
- **CPU 바운드**: 프로세스 풀과 결합 필요
- **메모리 관리**: 스트림 처리로 메모리 사용량 제어
- **동시성 제한**: Semaphore 등으로 리소스 보호
- **디버깅**: 전용 도구와 모니터링 필요

코루틴을 이해하고 적절히 활용하면, 기존 스레드 기반 시스템보다 훨씬 효율적이고 확장 가능한 애플리케이션을 개발할 수 있습니다. 특히 클라우드 환경에서 비용 효율성과 성능을 동시에 달성하는 핵심 기술입니다.

## 관련 문서

- [Callback 함수 심화 분석](callback.md) - 코루틴과 콜백의 비교
- [Event Loop 완벽 가이드](event-loop.md) - 비동기 이벤트 처리 메커니즘
- [epoll 심화 분석](../network/epoll.md) - I/O 멀티플렉싱과 코루틴
- [Socket 프로그래밍](../network/socket.md) - 비동기 네트워크 프로그래밍
- [Process vs Thread 심화 시리즈](../process/process-vs-thread-1.md) - 동시성 모델 비교
- [멀티스레드 스택 메모리의 진실](../memory/multithread-stack-memory.md) - 동시성 프로그래밍 메모리 관리