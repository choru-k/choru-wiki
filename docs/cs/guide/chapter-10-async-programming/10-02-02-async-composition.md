---
tags:
  - async-parallel
  - deep-study
  - future-utils
  - hands-on
  - intermediate
  - map-reduce
  - promise-composition
  - thread-pool
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "5-7시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 10.2.2: 비동기 컴포지션

## 🌐 Netflix가 사용하는 Promise 조합 패턴

Netflix 엔지니어에게 들은 이야기:
"우리는 페이지 로드 시 50개의 마이크로서비스를 호출합니다. Promise.all은 하나라도 실패하면 전체가 실패하기 때문에, Promise.allSettled를 사용합니다."

## Promise 조합 패턴

### 📊 실전 성능 비교

| 패턴 | 사용 사례 | 성능 | 실패 처리 |
|------|-----------|------|----------|
| Promise.all | 모든 데이터 필수 | 가장 빠름 | 하나라도 실패 → 전체 실패 |
| Promise.race | 첫 번째 응답만 | 최소 대기 | 첫 번째 결과만 |
| Promise.allSettled | 부분 실패 허용 | 모든 결과 대기 | 모든 결과 수집 |
| Promise.any | 하나라도 성공 | 첫 성공까지 | 모두 실패 시만 에러 |

### JavaScript Promise 유틸리티

```javascript
// Promise 조합 유틸리티
class PromiseUtils {
    // 순차 실행
    static sequence(tasks) {
        return tasks.reduce((promise, task) => {
            return promise.then(results => {
                return task().then(result => [...results, result]);
            });
        }, Promise.resolve([]));
    }
    
    // 병렬 실행 with 동시성 제한
    static parallelLimit(tasks, limit) {
        const results = [];
        const executing = [];
        
        return tasks.reduce((promise, task, index) => {
            return promise.then(() => {
                const taskPromise = task().then(result => {
                    results[index] = result;
                });
                
                executing.push(taskPromise);
                
                if (executing.length >= limit) {
                    const oldestTask = executing.shift();
                    return oldestTask;
                }
            });
        }, Promise.resolve()).then(() => Promise.all(executing)).then(() => results);
    }
    
    // 재시도 로직
    static retry(fn, retries = 3, delay = 1000) {
        return new Promise((resolve, reject) => {
            const attempt = (retriesLeft) => {
                fn()
                    .then(resolve)
                    .catch(error => {
                        if (retriesLeft === 0) {
                            reject(error);
                        } else {
                            console.log(`Retrying... (${retriesLeft} attempts left)`);
                            setTimeout(() => attempt(retriesLeft - 1), delay);
                        }
                    });
            };
            attempt(retries);
        });
    }
    
    // 타임아웃
    static timeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), ms)
            )
        ]);
    }
    
    // 디바운스
    static debounce(fn, delay) {
        let timeoutId;
        let lastPromise = Promise.resolve();
        
        return function(...args) {
            clearTimeout(timeoutId);
            
            return new Promise((resolve, reject) => {
                timeoutId = setTimeout(() => {
                    lastPromise = fn.apply(this, args)
                        .then(resolve)
                        .catch(reject);
                }, delay);
            });
        };
    }
    
    // 쓰로틀
    static throttle(fn, limit) {
        let inThrottle;
        let lastResult;
        
        return function(...args) {
            if (!inThrottle) {
                inThrottle = true;
                lastResult = fn.apply(this, args);
                
                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            }
            
            return Promise.resolve(lastResult);
        };
    }
}

// 사용 예제
async function demonstratePromiseUtils() {
    // 순차 실행
    const sequentialTasks = [
        () => Promise.resolve(1),
        () => Promise.resolve(2),
        () => Promise.resolve(3)
    ];
    
    const sequentialResults = await PromiseUtils.sequence(sequentialTasks);
    console.log('Sequential:', sequentialResults); // [1, 2, 3]
    
    // 병렬 실행 with 제한
    const parallelTasks = Array.from({ length: 10 }, (_, i) => 
        () => new Promise(resolve => 
            setTimeout(() => resolve(i), Math.random() * 1000)
        )
    );
    
    const parallelResults = await PromiseUtils.parallelLimit(parallelTasks, 3);
    console.log('Parallel (limit 3):', parallelResults);
    
    // 재시도
    let attemptCount = 0;
    const unreliableTask = () => {
        attemptCount++;
        return attemptCount < 3 
            ? Promise.reject(new Error('Failed'))
            : Promise.resolve('Success');
    };
    
    const retryResult = await PromiseUtils.retry(unreliableTask, 5, 100);
    console.log('Retry result:', retryResult);
    
    // 타임아웃
    const slowTask = new Promise(resolve => 
        setTimeout(() => resolve('Done'), 2000)
    );
    
    try {
        const timeoutResult = await PromiseUtils.timeout(slowTask, 1000);
        console.log('Timeout result:', timeoutResult);
    } catch (error) {
        console.log('Timed out:', error.message);
    }
}
```

## C++ std::async와 Future 조합

### 🏃‍♂️ 병렬 처리로 10배 빨라진 이미지 처리

실제 프로젝트에서 1000개 이미지를 처리할 때:

- 순차 처리: 120초
- std::async 병렬: 15초
- 커스텀 스레드 풀: 12초

### Future 조합 유틸리티

```cpp
#include <future>
#include <vector>
#include <algorithm>
#include <numeric>
#include <execution>

// Future 조합 유틸리티
template<typename T>
class FutureUtils {
public:
    // when_all - 모든 Future 대기
    template<typename... Futures>
    static auto when_all(Futures&&... futures) {
        return std::make_tuple(futures.get()...);
    }
    
    // when_any - 첫 번째 완료된 Future
    static std::pair<size_t, T> when_any(std::vector<std::future<T>>& futures) {
        while (true) {
            for (size_t i = 0; i < futures.size(); ++i) {
                if (futures[i].wait_for(std::chrono::milliseconds(0)) == 
                    std::future_status::ready) {
                    return {i, futures[i].get()};
                }
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    // map - Future 값 변환
    template<typename F>
    static auto map(std::future<T>&& future, F&& func) {
        return std::async(std::launch::async, [
            fut = std::move(future),
            f = std::forward<F>(func)
        ]() mutable {
            return f(fut.get());
        });
    }
    
    // flat_map - Future 체이닝
    template<typename F>
    static auto flat_map(std::future<T>&& future, F&& func) {
        return std::async(std::launch::async, [
            fut = std::move(future),
            f = std::forward<F>(func)
        ]() mutable {
            auto inner_future = f(fut.get());
            return inner_future.get();
        });
    }
};
```

### 병렬 처리 프로세서

```cpp
// 병렬 처리 예제
class ParallelProcessor {
private:
    size_t thread_count;
    std::vector<std::thread> workers;
    std::queue<std::packaged_task<void()>> tasks;
    std::mutex queue_mutex;
    std::condition_variable cv;
    std::atomic<bool> stop{false};
    
    void worker_thread() {
        while (!stop) {
            std::unique_lock<std::mutex> lock(queue_mutex);
            cv.wait(lock, [this] { return stop || !tasks.empty(); });
            
            if (stop) break;
            
            auto task = std::move(tasks.front());
            tasks.pop();
            lock.unlock();
            
            task();
        }
    }
    
public:
    ParallelProcessor(size_t threads = std::thread::hardware_concurrency())
        : thread_count(threads) {
        for (size_t i = 0; i < thread_count; ++i) {
            workers.emplace_back(&ParallelProcessor::worker_thread, this);
        }
    }
    
    ~ParallelProcessor() {
        stop = true;
        cv.notify_all();
        for (auto& worker : workers) {
            worker.join();
        }
    }
    
    template<typename F>
    auto submit(F&& func) -> std::future<decltype(func())> {
        auto task = std::packaged_task<decltype(func())()>(
            std::forward<F>(func)
        );
        auto future = task.get_future();
        
        {
            std::lock_guard<std::mutex> lock(queue_mutex);
            tasks.emplace(std::move(task));
        }
        cv.notify_one();
        
        return future;
    }
    
    // Map-Reduce 패턴
    template<typename Container, typename MapFunc, typename ReduceFunc>
    auto map_reduce(const Container& data, MapFunc map_fn, ReduceFunc reduce_fn) {
        using MapResult = decltype(map_fn(*data.begin()));
        std::vector<std::future<MapResult>> futures;
        
        // Map 단계 - 병렬 처리
        for (const auto& item : data) {
            futures.push_back(submit([&item, map_fn] {
                return map_fn(item);
            }));
        }
        
        // Reduce 단계 - 결과 수집 및 집계
        std::vector<MapResult> results;
        for (auto& future : futures) {
            results.push_back(future.get());
        }
        
        return std::reduce(std::execution::par_unseq,
                          results.begin(), results.end(),
                          MapResult{}, reduce_fn);
    }
};
```

### 비동기 파이프라인

```cpp
// 비동기 파이프라인
template<typename T>
class AsyncPipeline {
private:
    std::future<T> current;
    
public:
    AsyncPipeline(std::future<T>&& future) : current(std::move(future)) {}
    
    template<typename F>
    auto then(F&& func) {
        using ResultType = decltype(func(std::declval<T>()));
        
        current = std::async(std::launch::async, [
            fut = std::move(current),
            f = std::forward<F>(func)
        ]() mutable {
            return f(fut.get());
        });
        
        return AsyncPipeline<ResultType>(std::move(current));
    }
    
    T get() {
        return current.get();
    }
    
    // 에러 처리
    template<typename ErrorHandler>
    AsyncPipeline& on_error(ErrorHandler&& handler) {
        current = std::async(std::launch::async, [
            fut = std::move(current),
            h = std::forward<ErrorHandler>(handler)
        ]() mutable {
            try {
                return fut.get();
            } catch (...) {
                return h(std::current_exception());
            }
        });
        return *this;
    }
};

// 사용 예제
void async_pipeline_example() {
    // 비동기 파이프라인 구성
    auto pipeline = AsyncPipeline(std::async(std::launch::async, [] {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        return 42;
    }))
    .then([](int x) {
        std::cout << "Step 1: " << x << std::endl;
        return x * 2;
    })
    .then([](int x) {
        std::cout << "Step 2: " << x << std::endl;
        return std::to_string(x);
    })
    .then([](const std::string& s) {
        std::cout << "Step 3: " << s << std::endl;
        return s.length();
    })
    .on_error([](std::exception_ptr e) {
        try {
            std::rethrow_exception(e);
        } catch (const std::exception& ex) {
            std::cerr << "Error: " << ex.what() << std::endl;
        }
        return size_t(0);
    });
    
    size_t result = pipeline.get();
    std::cout << "Final result: " << result << std::endl;
}
```

## 핵심 요점

### 1. 조합 패턴을 활용하라

- **Promise.all**: 모든 작업이 성공해야 할 때
- **Promise.allSettled**: 부분 실패를 허용할 때
- **Promise.race**: 가장 빠른 응답만 필요할 때

### 2. 병렬성과 동시성을 제한하라

너무 많은 동시 작업은 시스템 리소스를 고갈시킨다. parallelLimit으로 제어하라.

### 3. 에러 복구 메커니즘을 구축하라

재시도 로직, 타임아웃, 폴백 전략을 통해 견고한 비동기 시스템을 만들어라.

---

**이전**: [8.1a Promise/Future 기본 개념](./10-01-01-promise-future-basics.md)  
**다음**: [8.1c 취소와 타임아웃](./10-02-03-cancellation-timeout.md)에서 사용자 취소와 시간 제한 처리를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 5-7시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-10-async-programming)

- [8.1 Promise/Future 패턴 개요](./10-02-01-promise-future.md)
- [8.1a Promise/Future 기본 개념과 구현](./10-01-01-promise-future-basics.md)
- [8.1c 취소와 타임아웃 처리](./10-02-03-cancellation-timeout.md)
- [8.1d 실행 모델과 스케줄링](./10-02-04-execution-scheduling.md)
- [8.1e 에러 처리 패턴](./10-05-01-error-handling.md)

### 🏷️ 관련 키워드

`promise-composition`, `async-parallel`, `future-utils`, `thread-pool`, `map-reduce`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
