---
tags:
  - event-loop
  - executor
  - hands-on
  - intermediate
  - macrotask
  - medium-read
  - microtask
  - scheduler
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 8.1d 실행 모델과 스케줄링

## 🏭 실행자(Executor): 작업을 처리하는 공장

Java의 ExecutorService를 보고 배운 교훈:
"작업을 어디서 실행할지를 추상화하면, 테스트와 성능 최적화가 쉽다"

**실행자 패턴의 실전 활용:**

- **ThreadPoolExecutor**: CPU 집약적 작업 (ML 학습)
- **InlineExecutor**: 디버깅과 테스트
- **DelayedExecutor**: 스케줄링된 작업 (알림, 정기 체크)

## C++ 실행자 시스템

### 실행자 인터페이스

```cpp
// 실행자 (Executor) 인터페이스
class IExecutor {
public:
    virtual ~IExecutor() = default;
    virtual void execute(std::function<void()> task) = 0;
};
```

### 스레드 풀 실행자

```cpp
// 스레드 풀 실행자
class ThreadPoolExecutor : public IExecutor {
private:
    std::vector<std::thread> threads;
    std::queue<std::function<void()>> tasks;
    std::mutex queue_mutex;
    std::condition_variable cv;
    std::atomic<bool> stop{false};
    
    void worker() {
        while (!stop) {
            std::unique_lock<std::mutex> lock(queue_mutex);
            cv.wait(lock, [this] { return stop || !tasks.empty(); });
            
            if (stop && tasks.empty()) return;
            
            auto task = std::move(tasks.front());
            tasks.pop();
            lock.unlock();
            
            task();
        }
    }
    
public:
    ThreadPoolExecutor(size_t num_threads) {
        for (size_t i = 0; i < num_threads; ++i) {
            threads.emplace_back(&ThreadPoolExecutor::worker, this);
        }
    }
    
    ~ThreadPoolExecutor() {
        stop = true;
        cv.notify_all();
        for (auto& thread : threads) {
            thread.join();
        }
    }
    
    void execute(std::function<void()> task) override {
        {
            std::lock_guard<std::mutex> lock(queue_mutex);
            tasks.push(task);
        }
        cv.notify_one();
    }
};
```

### 인라인 실행자와 지연 실행자

```cpp
// 인라인 실행자 (동기 실행)
class InlineExecutor : public IExecutor {
public:
    void execute(std::function<void()> task) override {
        task();
    }
};

// 지연 실행자
class DelayedExecutor : public IExecutor {
private:
    struct DelayedTask {
        std::chrono::steady_clock::time_point when;
        std::function<void()> task;
        
        bool operator>(const DelayedTask& other) const {
            return when > other.when;
        }
    };
    
    std::priority_queue<DelayedTask, std::vector<DelayedTask>, std::greater<>> tasks;
    std::mutex mutex;
    std::condition_variable cv;
    std::thread worker;
    std::atomic<bool> stop{false};
    
    void run() {
        while (!stop) {
            std::unique_lock<std::mutex> lock(mutex);
            
            if (tasks.empty()) {
                cv.wait(lock);
                continue;
            }
            
            auto now = std::chrono::steady_clock::now();
            auto& next = tasks.top();
            
            if (next.when <= now) {
                auto task = std::move(next.task);
                tasks.pop();
                lock.unlock();
                task();
            } else {
                cv.wait_until(lock, next.when);
            }
        }
    }
    
public:
    DelayedExecutor() : worker(&DelayedExecutor::run, this) {}
    
    ~DelayedExecutor() {
        stop = true;
        cv.notify_all();
        worker.join();
    }
    
    void execute(std::function<void()> task) override {
        execute_after(std::chrono::milliseconds(0), task);
    }
    
    void execute_after(std::chrono::milliseconds delay, std::function<void()> task) {
        std::lock_guard<std::mutex> lock(mutex);
        tasks.push({
            std::chrono::steady_clock::now() + delay,
            task
        });
        cv.notify_one();
    }
};
```

### ExecutorFuture 구현

```cpp
// 실행자를 사용하는 Future
template<typename T>
class ExecutorFuture {
private:
    std::shared_ptr<IExecutor> executor;
    std::future<T> future;
    
public:
    ExecutorFuture(std::shared_ptr<IExecutor> exec, std::future<T>&& fut)
        : executor(exec), future(std::move(fut)) {}
    
    template<typename F>
    auto then(F&& func) {
        using ResultType = decltype(func(std::declval<T>()));
        
        auto promise = std::make_shared<std::promise<ResultType>>();
        auto result_future = promise->get_future();
        
        executor->execute([
            fut = std::move(future),
            f = std::forward<F>(func),
            p = promise
        ]() mutable {
            try {
                if constexpr (std::is_void_v<ResultType>) {
                    f(fut.get());
                    p->set_value();
                } else {
                    p->set_value(f(fut.get()));
                }
            } catch (...) {
                p->set_exception(std::current_exception());
            }
        });
        
        return ExecutorFuture<ResultType>(executor, std::move(result_future));
    }
    
    T get() {
        return future.get();
    }
};
```

## JavaScript 마이크로태스크와 매크로태스크

### 🎯 실행 순서의 비밀: 마이크로 vs 매크로

제가 처음으로 이 차이를 깨달은 버그:

```javascript
setTimeout(() => console.log('1'), 0);
Promise.resolve().then(() => console.log('2'));
console.log('3');
// 출력: 3, 2, 1 (왜 2가 1보다 먼저?!)
```

**비밀은 두 개의 큐:**

1. **마이크로태스크 큐** (우선순위 높음)
   - Promise 콜백
   - queueMicrotask()
   - MutationObserver

2. **매크로태스크 큐** (우선순위 낮음)
   - setTimeout/setInterval
   - setImmediate (Node.js)
   - I/O 작업

### 이벤트 루프 시뮬레이션

```javascript
// 이벤트 루프 시뮬레이션
class EventLoop {
    constructor() {
        this.macrotaskQueue = [];
        this.microtaskQueue = [];
        this.animationFrameCallbacks = [];
        this.running = false;
        this.currentTask = null;
    }
    
    // 매크로태스크 등록
    enqueueMacrotask(callback) {
        this.macrotaskQueue.push(callback);
        this.scheduleFlush();
    }
    
    // 마이크로태스크 등록
    enqueueMicrotask(callback) {
        this.microtaskQueue.push(callback);
    }
    
    // requestAnimationFrame
    enqueueAnimationFrame(callback) {
        this.animationFrameCallbacks.push(callback);
    }
    
    // 마이크로태스크 처리
    flushMicrotasks() {
        while (this.microtaskQueue.length > 0) {
            const task = this.microtaskQueue.shift();
            try {
                task();
            } catch (error) {
                console.error('Microtask error:', error);
            }
        }
    }
    
    // 애니메이션 프레임 콜백 처리
    flushAnimationFrames(timestamp) {
        const callbacks = this.animationFrameCallbacks.slice();
        this.animationFrameCallbacks = [];
        
        for (const callback of callbacks) {
            try {
                callback(timestamp);
            } catch (error) {
                console.error('Animation frame error:', error);
            }
        }
    }
    
    // 이벤트 루프 틱
    tick() {
        // 1. 매크로태스크 하나 실행
        if (this.macrotaskQueue.length > 0) {
            const task = this.macrotaskQueue.shift();
            this.currentTask = task;
            
            try {
                task();
            } catch (error) {
                console.error('Macrotask error:', error);
            }
            
            this.currentTask = null;
        }
        
        // 2. 모든 마이크로태스크 실행
        this.flushMicrotasks();
        
        // 3. 렌더링 (필요한 경우)
        if (this.shouldRender()) {
            this.render();
        }
        
        // 4. 다음 틱 스케줄
        if (this.macrotaskQueue.length > 0 || 
            this.animationFrameCallbacks.length > 0) {
            this.scheduleFlush();
        } else {
            this.running = false;
        }
    }
    
    shouldRender() {
        // 16ms (60fps) 기준
        return this.animationFrameCallbacks.length > 0;
    }
    
    render() {
        const timestamp = performance.now();
        this.flushAnimationFrames(timestamp);
    }
    
    scheduleFlush() {
        if (!this.running) {
            this.running = true;
            setImmediate(() => this.tick());
        }
    }
}
```

### 우선순위 기반 스케줄러

```javascript
// 스케줄러 구현
class Scheduler {
    constructor() {
        this.tasks = [];
        this.running = false;
        this.currentPriority = null;
    }
    
    // 우선순위 큐
    schedule(task, priority = 'normal') {
        const priorities = {
            'immediate': 0,
            'high': 1,
            'normal': 2,
            'low': 3,
            'idle': 4
        };
        
        this.tasks.push({
            task,
            priority: priorities[priority] || 2,
            timestamp: Date.now()
        });
        
        // 우선순위 정렬
        this.tasks.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.timestamp - b.timestamp;
        });
        
        this.flush();
    }
    
    flush() {
        if (this.running) return;
        this.running = true;
        
        const processNextTask = () => {
            if (this.tasks.length === 0) {
                this.running = false;
                return;
            }
            
            const { task, priority } = this.tasks.shift();
            this.currentPriority = priority;
            
            try {
                const result = task();
                
                // Generator 함수 지원
                if (result && typeof result.next === 'function') {
                    this.scheduleGenerator(result, priority);
                }
            } catch (error) {
                console.error('Task error:', error);
            }
            
            this.currentPriority = null;
            
            // 다음 태스크 스케줄
            if (priority <= 1) {
                // 높은 우선순위는 즉시 실행
                processNextTask();
            } else {
                // 낮은 우선순위는 양보
                setImmediate(processNextTask);
            }
        };
        
        processNextTask();
    }
    
    // Generator 기반 협동 스케줄링
    scheduleGenerator(generator, priority) {
        const step = () => {
            const { value, done } = generator.next();
            
            if (!done) {
                this.schedule(() => step(), priority);
            }
        };
        
        step();
    }
    
    // 작업 취소
    cancel(task) {
        const index = this.tasks.findIndex(t => t.task === task);
        if (index !== -1) {
            this.tasks.splice(index, 1);
        }
    }
}

// 사용 예제
const scheduler = new Scheduler();

// 우선순위별 작업 스케줄링
scheduler.schedule(() => console.log('Normal task'), 'normal');
scheduler.schedule(() => console.log('High priority'), 'high');
scheduler.schedule(() => console.log('Immediate'), 'immediate');
scheduler.schedule(() => console.log('Low priority'), 'low');

// Generator 기반 협동 멀티태스킹
function* longRunningTask() {
    console.log('Task start');
    for (let i = 0; i < 1000000; i++) {
        if (i % 100000 === 0) {
            console.log(`Progress: ${i}`);
            yield;  // 다른 작업에 양보
        }
    }
    console.log('Task complete');
}

scheduler.schedule(longRunningTask(), 'low');
```

### 실전 사용 예제

```javascript
// 실전 스케줄링 예제
class TaskManager {
    constructor() {
        this.eventLoop = new EventLoop();
        this.scheduler = new Scheduler();
    }
    
    // 버튼 클릭 처리 (높은 우선순위)
    handleUserClick() {
        this.scheduler.schedule(() => {
            console.log('Button clicked - immediate response');
            this.updateUI();
        }, 'immediate');
    }
    
    // 데이터 처리 (낮은 우선순위)
    processLargeDataset(data) {
        this.scheduler.schedule(function* () {
            console.log('Starting data processing');
            for (let i = 0; i < data.length; i++) {
                processItem(data[i]);
                
                if (i % 1000 === 0) {
                    yield; // 다른 작업에 양보
                }
            }
            console.log('Data processing complete');
        }(), 'low');
    }
    
    // 애니메이션 (프레임 동기화)
    startAnimation() {
        const animate = (timestamp) => {
            this.updateAnimation(timestamp);
            this.eventLoop.enqueueAnimationFrame(animate);
        };
        this.eventLoop.enqueueAnimationFrame(animate);
    }
}
```

## 핵심 요점

### 1. 실행자 패턴을 활용하라

작업의 실행 위치를 추상화하면 테스트와 성능 최적화가 쉬워진다.

### 2. 마이크로태스크가 우선순위가 높다

Promise는 setTimeout보다 먼저 실행된다. 이벤트 루프의 동작을 이해하라.

### 3. 협동적 멀티태스킹을 구현하라

Generator를 사용해 긴 작업을 작은 단위로 나누어 UI 반응성을 유지하라.

### 4. 우선순위 기반 스케줄링을 사용하라

사용자 상호작용은 높은 우선순위, 백그라운드 처리는 낮은 우선순위로 설정하라.

---

**이전**: [8.1c 취소와 타임아웃](chapter-10-async-programming/10-12-cancellation-timeout.md)  
**다음**: [8.1e 에러 처리 패턴](chapter-10-async-programming/10-40-error-handling.md)에서 Circuit Breaker와 장애 격리 기법을 학습합니다.

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
- [8.1e 에러 처리 패턴](./10-40-error-handling.md)

### 🏷️ 관련 키워드

`executor`, `scheduler`, `event-loop`, `microtask`, `macrotask`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
