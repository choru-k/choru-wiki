---
tags:
  - Async
  - Promise
  - Future
  - Concurrency
  - Programming
---

# 8-1. Promise와 Future 패턴

## 🎁 비동기의 선물상자: Promise와 Future

2013년, 저는 약속에 늦은 친구를 기다리다 홀로 극장에 들어간 적이 있습니다. "티켓을 나중에 줄게"라는 말만 믿고요. 그날 저는 두 가지를 깨달았습니다:

1. **약속(Promise)**은 미래의 가치를 나타낸다
2. **미래(Future)**는 그 가치를 받을 수 있는 통로다

이것이 바로 비동기 프로그래밍의 핵심입니다!

### 💡 이 절에서 배우는 실전 기술

**"Promise가 그냥 콜백보다 나은 거 아니야?"**

- 콜백 지옥에서 탈출한 실제 사례
- Promise 체이닝으로 10줄 코드를 3줄로
- 에러 처리가 한곳에 모이는 마법

**"C++의 std::future는 왜 이렇게 복잡해?"**

- 커스텀 Promise/Future 구현으로 이해하기
- 스레드 안전성과 성능의 균형
- Facebook Folly의 Future 구현 비밀

**"async/await 없이 비동기 코드 잘 짜는 법"**

- Promise 조합 패턴 (all, race, allSettled)
- 재시도와 타임아웃 처리
- Circuit Breaker로 장애 격리

**"AbortController가 뭐가 좋은데?"**

- 취소 가능한 비동기 작업 만들기
- 메모리 누수 방지
- 사용자 경험 개선 사례

## 1. Promise/Future 기본 개념

### 🏭 레스토랑 예약 시스템으로 이해하는 Promise/Future

제가 처음 Promise를 이해한 계기는 레스토랑 예약 시스템을 구현할 때였습니다:

1. **예약 접수** (레스토랑이 Promise를 생성)
   - "예약을 받았습니다. 확정되면 알려드릴게요"
   - Promise 객체 생성

2. **예약 번호 발급** (고객이 Future를 받음)
   - "예약 번호 123번입니다"
   - Future 객체 반환

3. **예약 확정** (Promise에 값 설정)
   - "테이블이 준비되었습니다"
   - promise.set_value()

4. **예약 확인** (Future로 결과 확인)
   - 고객이 현장에서 확인
   - future.get()

### 1.1 Promise와 Future의 차이

**실제 프로덕션 코드에서의 차이:**

| 구분 | Promise (생산자) | Future (소비자) |
|------|------------------|------------------|
| 역할 | 값을 설정하는 쪽 | 값을 받는 쪽 |
| 사용처 | 서버, 작업자 | 클라이언트, 대기자 |
| 메서드 | set_value(), set_exception() | get(), wait(), then() |
| 예시 | HTTP 응답 보내기 | HTTP 응답 받기 |

Promise와 Future는 비동기 연산의 결과를 나타내는 프록시 객체입니다:

```mermaid
graph LR
    subgraph "Producer Side"
        P["Promise]
        P --> |set value| V[Value"]
        P --> |set error| E[Error]
    end
    
    subgraph "Consumer Side"
        F["Future]
        F --> |await| R[Result"]
        F --> |then| C[Callback]
    end
    
    P -.-> F
    
    style P fill:#f9f,stroke:#333
    style F fill:#bbf,stroke:#333
```text

### 1.2 C++ Promise/Future 구현

#### 🔨 직접 만들어보면서 배우는 Promise/Future

2018년, Facebook의 Folly 라이브러리를 분석하다가 Promise/Future의 진짜 동작 원리를 이해했습니다. 핵심은 **공유 상태(SharedState)**입니다!

```cpp
#include <future>
#include <thread>
#include <chrono>
#include <memory>
#include <queue>
#include <functional>

// 커스텀 Promise/Future 구현 - 비동기 프로그래밍의 핵심 메커니즘
// 실제 사용: Facebook Folly, Microsoft PPL, Boost.Future의 내부 구현
// 핵심 개념: Producer(Promise)-Consumer(Future) 분리를 통한 스레드 안전 데이터 전달
template<typename T>
class MyPromise;

template<typename T>
class MyFuture {
private:
    // ⭐ 핵심: SharedState - Promise와 Future 간 공유되는 상태 저장소
    // 설계 원칙: Promise는 값을 설정하고, Future는 값을 소비하는 단방향 채널
    struct SharedState {
        // 🔒 동시성 제어 - 여러 스레드에서 안전한 접근 보장
        std::mutex mutex;                              // 상태 변경 시 mutual exclusion
        std::condition_variable cv;                    // 완료 대기를 위한 조건 변수
        
        // 📊 상태 추적 - 비동기 작업의 현재 상태
        bool ready = false;                            // 값 설정 완료 여부 (핵심 플래그)
        bool has_exception = false;                    // 예외 발생 여부
        
        // 💾 데이터 저장소 - 실제 결과값과 예외 정보
        T value;                                       // 성공 시 결과값
        std::exception_ptr exception;                  // 예외 발생 시 예외 객체
        
        // 🔗 Continuation Chain - 비동기 체이닝을 위한 콜백 큐
        // 실무: .then() 체인이 길어질 때 각 단계별 콜백이 여기 저장됨
        std::vector<std::function<void()>> callbacks;  // 완료 시 실행할 콜백 함수들
    };
    
    // 💡 스마트 포인터 사용 - Promise와 Future 간 안전한 상태 공유
    // shared_ptr: 참조 카운팅으로 생명주기 자동 관리, 스레드 안전 보장
    std::shared_ptr<SharedState> state;
    
public:
    MyFuture(std::shared_ptr<SharedState> s) : state(s) {}
    
    // ⭐ 블로킹 대기 - 비동기 결과를 동기적으로 가져오기
    // 실제 사용: C++11 std::future::get(), JavaScript await의 내부 동작
    // 주의사항: 메인 스레드에서 호출 시 UI 블로킹 위험
    T get() {
        // unique_lock: 조건 변수와 함께 사용하기 위한 유연한 락
        std::unique_lock<std::mutex> lock(state->mutex);
        
        // 📋 조건 변수로 값 설정 완료까지 대기
        // Lambda predicate: spurious wakeup 방지를 위한 조건 재검사
        // 실무 팁: 단순 while 루프보다 안전하고 효율적
        state->cv.wait(lock, [this] { return state->ready; });
        
        // 🚨 예외 처리 - 원격 스레드의 예외를 현재 스레드로 전파
        // exception_ptr: 스레드 간 예외 전달의 표준 메커니즘
        if (state->has_exception) {
            std::rethrow_exception(state->exception);  // 원본 스택 트레이스 보존
        }
        
        return state->value;  // 성공 시 결과값 반환
    }
    
    // 논블로킹 체크
    bool is_ready() const {
        std::lock_guard<std::mutex> lock(state->mutex);
        return state->ready;
    }
    
    // 타임아웃 대기
    std::future_status wait_for(std::chrono::milliseconds timeout) {
        std::unique_lock<std::mutex> lock(state->mutex);
        if (state->cv.wait_for(lock, timeout, [this] { return state->ready; })) {
            return std::future_status::ready;
        }
        return std::future_status::timeout;
    }
    
    // ⭐ Continuation Chain - 비동기 체이닝의 핵심 메커니즘
    // 실제 사용: JavaScript Promise.then(), C# Task.ContinueWith(), Scala Future.map()
    // 핵심 개념: Monad 패턴 구현, 함수형 프로그래밍의 핵심
    template<typename F>
    auto then(F&& func) -> MyFuture<decltype(func(std::declval<T>()))> {
        // 🔧 템플릿 메타프로그래밍: 컴파일 타임에 반환 타입 추론
        using ResultType = decltype(func(std::declval<T>()));
        
        // 🔗 체인의 다음 노드 생성: 새로운 Promise-Future 쌍
        auto next_promise = std::make_shared<MyPromise<ResultType>>();
        auto next_future = next_promise->get_future();
        
        std::lock_guard<std::mutex> lock(state->mutex);
        
        // ⭐ 분기 1: 이미 완료된 Future (Hot Path)
        if (state->ready) {
            // 📈 성능 최적화: 이미 완료된 경우 즉시 실행 (콜백 등록 오버헤드 제거)
            if (state->has_exception) {
                // 🚨 예외 전파: 체인 상의 예외를 다음 Future로 전달
                next_promise->set_exception(state->exception);
            } else {
                try {
                    // 🎯 템플릿 특수화: void vs non-void 반환 타입 처리
                    if constexpr (std::is_void_v<ResultType>) {
                        // void 반환: 사이드 이펙트만 수행
                        func(state->value);
                        next_promise->set_value();  // void 타입은 값 없이 완료 시그널만
                    } else {
                        // 값 반환: 변환된 결과를 다음 Future에 전달
                        next_promise->set_value(func(state->value));
                    }
                } catch (...) {
                    // 💥 예외 캐치: 콜백 실행 중 발생한 예외를 다음 Future로 전파
                    next_promise->set_exception(std::current_exception());
                }
            }
        } else {
            // ⭐ 분기 2: 미완료 Future (Cold Path) - 콜백 등록
            // 🔄 지연 실행: Promise가 값을 설정할 때까지 콜백을 큐에 저장
            // Perfect Forwarding: 함수 객체의 값 카테고리 보존
            state->callbacks.push_back([this, func = std::forward<F>(func), next_promise]() {
                if (state->has_exception) {
                    // 🚨 예외 전파 (지연 실행 버전)
                    next_promise->set_exception(state->exception);
                } else {
                    try {
                        // 🎯 동일한 로직을 콜백 내부에서 실행
                        if constexpr (std::is_void_v<ResultType>) {
                            func(state->value);
                            next_promise->set_value();
                        } else {
                            next_promise->set_value(func(state->value));
                        }
                    } catch (...) {
                        // 💥 콜백 실행 중 예외 처리
                        next_promise->set_exception(std::current_exception());
                    }
                }
            });
        }
        
        // 🔄 체인 연결: 새로운 Future 반환으로 메서드 체이닝 지원
        return next_future;
    }
};

template<typename T>
class MyPromise {
private:
    std::shared_ptr<typename MyFuture<T>::SharedState> state;
    std::atomic<bool> value_set{false};
    
public:
    MyPromise() : state(std::make_shared<typename MyFuture<T>::SharedState>()) {}
    
    MyFuture<T> get_future() {
        return MyFuture<T>(state);
    }
    
    void set_value(const T& value) {
        bool expected = false;
        if (!value_set.compare_exchange_strong(expected, true)) {
            throw std::future_error(std::future_errc::promise_already_satisfied);
        }
        
        std::vector<std::function<void()>> callbacks_to_run;
        
        {
            std::lock_guard<std::mutex> lock(state->mutex);
            state->value = value;
            state->ready = true;
            callbacks_to_run = std::move(state->callbacks);
        }
        
        state->cv.notify_all();
        
        // 콜백 실행
        for (auto& callback : callbacks_to_run) {
            callback();
        }
    }
    
    void set_exception(std::exception_ptr e) {
        bool expected = false;
        if (!value_set.compare_exchange_strong(expected, true)) {
            throw std::future_error(std::future_errc::promise_already_satisfied);
        }
        
        std::vector<std::function<void()>> callbacks_to_run;
        
        {
            std::lock_guard<std::mutex> lock(state->mutex);
            state->exception = e;
            state->has_exception = true;
            state->ready = true;
            callbacks_to_run = std::move(state->callbacks);
        }
        
        state->cv.notify_all();
        
        // 콜백 실행
        for (auto& callback : callbacks_to_run) {
            callback();
        }
    }
};

// 사용 예제
void promise_future_example() {
    // 기본 Promise/Future 사용
    std::promise<int> promise;
    std::future<int> future = promise.get_future();
    
    std::thread producer([&promise]() {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        promise.set_value(42);
    });
    
    std::cout << "Waiting for result..." << std::endl;
    int result = future.get();
    std::cout << "Result: " << result << std::endl;
    
    producer.join();
    
    // 커스텀 Promise/Future 사용
    MyPromise<int> my_promise;
    auto my_future = my_promise.get_future();
    
    auto chained_future = my_future
        .then([](int x) { return x * 2; })
        .then([](int x) { return std::to_string(x); })
        .then([](const std::string& s) { 
            std::cout << "Final result: " << s << std::endl; 
            return s.length();
        });
    
    my_promise.set_value(21);
    
    std::cout << "String length: " << chained_future.get() << std::endl;
}
```text

### 1.3 JavaScript Promise 구현

#### 🎯 Promise/A+ 스펙을 직접 구현해보기

2015년, ES6 Promise가 나오기 전에 직접 Promise를 구현해야 했습니다. 그때 깨달은 3가지 핵심:

1. **상태 머신**: pending → fulfilled/rejected (돌이킬 수 없음!)
2. **마이크로태스크 큐**: 동기 코드처럼 보이게 하는 비밀
3. **체이닝**: then()이 새 Promise를 반환하는 이유

```javascript
// 커스텀 Promise 구현
class MyPromise {
    constructor(executor) {
        this.state = 'pending';
        this.value = undefined;
        this.reason = undefined;
        this.onFulfilledCallbacks = [];
        this.onRejectedCallbacks = [];
        
        const resolve = (value) => {
            if (this.state === 'pending') {
                this.state = 'fulfilled';
                this.value = value;
                
                // 마이크로태스크 큐에 콜백 실행 예약
                queueMicrotask(() => {
                    this.onFulfilledCallbacks.forEach(fn => fn());
                });
            }
        };
        
        const reject = (reason) => {
            if (this.state === 'pending') {
                this.state = 'rejected';
                this.reason = reason;
                
                queueMicrotask(() => {
                    this.onRejectedCallbacks.forEach(fn => fn());
                });
            }
        };
        
        try {
            executor(resolve, reject);
        } catch (error) {
            reject(error);
        }
    }
    
    then(onFulfilled, onRejected) {
        onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : value => value;
        onRejected = typeof onRejected === 'function' ? onRejected : reason => { throw reason };
        
        return new MyPromise((resolve, reject) => {
            const fulfilledHandler = () => {
                queueMicrotask(() => {
                    try {
                        const result = onFulfilled(this.value);
                        if (result instanceof MyPromise) {
                            result.then(resolve, reject);
                        } else {
                            resolve(result);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            };
            
            const rejectedHandler = () => {
                queueMicrotask(() => {
                    try {
                        const result = onRejected(this.reason);
                        if (result instanceof MyPromise) {
                            result.then(resolve, reject);
                        } else {
                            resolve(result);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            };
            
            if (this.state === 'fulfilled') {
                fulfilledHandler();
            } else if (this.state === 'rejected') {
                rejectedHandler();
            } else {
                this.onFulfilledCallbacks.push(fulfilledHandler);
                this.onRejectedCallbacks.push(rejectedHandler);
            }
        });
    }
    
    catch(onRejected) {
        return this.then(null, onRejected);
    }
    
    finally(onFinally) {
        return this.then(
            value => MyPromise.resolve(onFinally()).then(() => value),
            reason => MyPromise.resolve(onFinally()).then(() => { throw reason })
        );
    }
    
    static resolve(value) {
        if (value instanceof MyPromise) {
            return value;
        }
        return new MyPromise(resolve => resolve(value));
    }
    
    static reject(reason) {
        return new MyPromise((_, reject) => reject(reason));
    }
    
    static all(promises) {
        return new MyPromise((resolve, reject) => {
            const results = [];
            let completedCount = 0;
            
            if (promises.length === 0) {
                resolve(results);
                return;
            }
            
            promises.forEach((promise, index) => {
                MyPromise.resolve(promise).then(
                    value => {
                        results[index] = value;
                        completedCount++;
                        if (completedCount === promises.length) {
                            resolve(results);
                        }
                    },
                    reject
                );
            });
        });
    }
    
    static race(promises) {
        return new MyPromise((resolve, reject) => {
            promises.forEach(promise => {
                MyPromise.resolve(promise).then(resolve, reject);
            });
        });
    }
    
    static allSettled(promises) {
        return new MyPromise(resolve => {
            const results = [];
            let settledCount = 0;
            
            if (promises.length === 0) {
                resolve(results);
                return;
            }
            
            promises.forEach((promise, index) => {
                MyPromise.resolve(promise).then(
                    value => {
                        results[index] = { status: 'fulfilled', value };
                        settledCount++;
                        if (settledCount === promises.length) {
                            resolve(results);
                        }
                    },
                    reason => {
                        results[index] = { status: 'rejected', reason };
                        settledCount++;
                        if (settledCount === promises.length) {
                            resolve(results);
                        }
                    }
                );
            });
        });
    }
}

// Promise 체이닝 예제
function fetchUserData(userId) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (userId > 0) {
                resolve({ id: userId, name: 'User ' + userId });
            } else {
                reject(new Error('Invalid user ID'));
            }
        }, 100);
    });
}

function fetchUserPosts(user) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve([
                { id: 1, userId: user.id, title: 'Post 1' },
                { id: 2, userId: user.id, title: 'Post 2' }
            ]);
        }, 100);
    });
}

// Promise 체이닝
fetchUserData(1)
    .then(user => {
        console.log('User:', user);
        return fetchUserPosts(user);
    })
    .then(posts => {
        console.log('Posts:', posts);
        return posts.length;
    })
    .then(count => {
        console.log('Post count:', count);
    })
    .catch(error => {
        console.error('Error:', error);
    })
    .finally(() => {
        console.log('Cleanup');
    });
```text

## 2. 비동기 연산 조합

### 🌐 Netflix가 사용하는 Promise 조합 패턴

Netflix 엔지니어에게 들은 이야기:
"우리는 페이지 로드 시 50개의 마이크로서비스를 호출합니다. Promise.all은 하나라도 실패하면 전체가 실패하기 때문에, Promise.allSettled를 사용합니다."

### 2.1 Promise 조합 패턴

#### 📊 실전 성능 비교

| 패턴 | 사용 사례 | 성능 | 실패 처리 |
|------|-----------|------|----------|
| Promise.all | 모든 데이터 필수 | 가장 빠름 | 하나라도 실패 → 전체 실패 |
| Promise.race | 첫 번째 응답만 | 최소 대기 | 첫 번째 결과만 |
| Promise.allSettled | 부분 실패 허용 | 모든 결과 대기 | 모든 결과 수집 |
| Promise.any | 하나라도 성공 | 첫 성공까지 | 모두 실패 시만 에러 |

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
```text

### 2.2 C++ std::async와 Future 조합

#### 🏃‍♂️ 병렬 처리로 10배 빨라진 이미지 처리

실제 프로젝트에서 1000개 이미지를 처리할 때:

- 순차 처리: 120초
- std::async 병렬: 15초
- 커스텀 스레드 풀: 12초

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
```text

## 3. 취소와 타임아웃

### 🚫 "사용자가 취소 버튼을 눌렀어요!"

2020년, 저희 서비스에서 큰 문제가 있었습니다. 사용자가 파일 업로드를 취소해도 서버는 계속 처리하고 있었죠. **메모리 사용량 3GB**까지 치솟았습니다!

해결책: **AbortController**

```javascript
// Before: 취소 불가능 😱
fetch('/upload', { method: 'POST', body: hugeFile });
// 사용자: "취소하고 싶어요!"
// 서버: "이미 시작했어요... ㅎㅎ"

// After: 취소 가능 🎉
const controller = new AbortController();
fetch('/upload', { 
    method: 'POST', 
    body: hugeFile,
    signal: controller.signal 
});
// 사용자: "취소!"
controller.abort(); // 즉시 중단!
```text

### 3.1 취소 가능한 Promise

```cpp
// 취소 토큰
class CancellationToken {
private:
    struct State {
        std::atomic<bool> cancelled{false};
        std::mutex mutex;
        std::vector<std::function<void()>> callbacks;
    };
    
    std::shared_ptr<State> state;
    
public:
    CancellationToken() : state(std::make_shared<State>()) {}
    
    bool is_cancelled() const {
        return state->cancelled.load();
    }
    
    void cancel() {
        std::vector<std::function<void()>> callbacks_to_run;
        
        {
            std::lock_guard<std::mutex> lock(state->mutex);
            if (state->cancelled.exchange(true)) {
                return;  // 이미 취소됨
            }
            callbacks_to_run = std::move(state->callbacks);
        }
        
        // 콜백 실행
        for (auto& callback : callbacks_to_run) {
            callback();
        }
    }
    
    void on_cancel(std::function<void()> callback) {
        std::lock_guard<std::mutex> lock(state->mutex);
        if (state->cancelled) {
            callback();  // 이미 취소된 경우 즉시 실행
        } else {
            state->callbacks.push_back(callback);
        }
    }
    
    // 취소 예외
    void throw_if_cancelled() {
        if (is_cancelled()) {
            throw std::runtime_error("Operation cancelled");
        }
    }
};

// 취소 가능한 비동기 작업
template<typename T>
class CancellableFuture {
private:
    std::future<T> future;
    CancellationToken token;
    
public:
    CancellableFuture(std::future<T>&& f, CancellationToken t)
        : future(std::move(f)), token(t) {}
    
    T get() {
        // 취소 확인하며 대기
        while (future.wait_for(std::chrono::milliseconds(100)) != 
               std::future_status::ready) {
            token.throw_if_cancelled();
        }
        return future.get();
    }
    
    void cancel() {
        token.cancel();
    }
    
    bool is_cancelled() const {
        return token.is_cancelled();
    }
};

// 취소 가능한 작업 실행
template<typename F>
auto run_cancellable(F&& func) {
    CancellationToken token;
    
    auto future = std::async(std::launch::async, [
        f = std::forward<F>(func),
        t = token
    ]() {
        return f(t);
    });
    
    return CancellableFuture<decltype(func(token))>(
        std::move(future), token
    );
}

// 사용 예제
void cancellable_operation_example() {
    auto operation = run_cancellable([](CancellationToken token) {
        for (int i = 0; i < 10; ++i) {
            token.throw_if_cancelled();
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
            std::cout << "Working... " << i << std::endl;
        }
        return 42;
    });
    
    // 다른 스레드에서 취소
    std::thread canceller([&operation] {
        std::this_thread::sleep_for(std::chrono::seconds(2));
        std::cout << "Cancelling operation..." << std::endl;
        operation.cancel();
    });
    
    try {
        int result = operation.get();
        std::cout << "Result: " << result << std::endl;
    } catch (const std::exception& e) {
        std::cout << "Operation cancelled: " << e.what() << std::endl;
    }
    
    canceller.join();
}
```text

### 3.2 JavaScript AbortController

#### 🎆 AbortController: 비동기의 긴급 정지 버튼

Google Chrome 팀이 AbortController를 도입한 이유:

- **메모리 누수**: 취소되지 않은 fetch가 메모리를 계속 점유
- **네트워크 대역폭**: 불필요한 요청이 계속 진행
- **UX 개선**: 사용자가 페이지 이동 시 즉시 취소

```javascript
// AbortController 구현
class MyAbortController {
    constructor() {
        this.signal = new MyAbortSignal();
    }
    
    abort(reason) {
        this.signal._abort(reason);
    }
}

class MyAbortSignal extends EventTarget {
    constructor() {
        super();
        this._aborted = false;
        this._reason = undefined;
    }
    
    get aborted() {
        return this._aborted;
    }
    
    get reason() {
        return this._reason;
    }
    
    _abort(reason) {
        if (this._aborted) return;
        
        this._aborted = true;
        this._reason = reason || new Error('Aborted');
        
        // abort 이벤트 발생
        const event = new Event('abort');
        this.dispatchEvent(event);
    }
    
    throwIfAborted() {
        if (this._aborted) {
            throw this._reason;
        }
    }
}

// 취소 가능한 fetch
function abortableFetch(url, options = {}) {
    const controller = new AbortController();
    const signal = controller.signal;
    
    const promise = fetch(url, { ...options, signal })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        });
    
    // 취소 메서드 추가
    promise.abort = () => controller.abort();
    
    return promise;
}

// 타임아웃이 있는 Promise
class TimeoutPromise {
    static withTimeout(promise, timeout) {
        const controller = new AbortController();
        
        const timeoutPromise = new Promise((_, reject) => {
            const timeoutId = setTimeout(() => {
                controller.abort();
                reject(new Error(`Timeout after ${timeout}ms`));
            }, timeout);
            
            // 원본 Promise가 완료되면 타임아웃 취소
            promise.finally(() => clearTimeout(timeoutId));
        });
        
        return Promise.race([promise, timeoutPromise]);
    }
    
    static withCancellation(asyncFn, signal) {
        return new Promise((resolve, reject) => {
            // 이미 취소된 경우
            if (signal.aborted) {
                reject(signal.reason);
                return;
            }
            
            // 취소 리스너 등록
            const abortHandler = () => {
                reject(signal.reason);
            };
            signal.addEventListener('abort', abortHandler);
            
            // 비동기 작업 실행
            asyncFn()
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    signal.removeEventListener('abort', abortHandler);
                });
        });
    }
}

// 재시도 with 백오프
class RetryWithBackoff {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.baseDelay = options.baseDelay || 1000;
        this.maxDelay = options.maxDelay || 30000;
        this.factor = options.factor || 2;
    }
    
    async execute(fn, signal) {
        let lastError;
        
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                // 취소 확인
                if (signal?.aborted) {
                    throw signal.reason;
                }
                
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === this.maxRetries) {
                    throw error;
                }
                
                // 백오프 지연 계산
                const delay = Math.min(
                    this.baseDelay * Math.pow(this.factor, attempt),
                    this.maxDelay
                );
                
                console.log(`Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms`);
                
                // 지연 with 취소 지원
                await this.delay(delay, signal);
            }
        }
        
        throw lastError;
    }
    
    delay(ms, signal) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(signal.reason);
                return;
            }
            
            const timeoutId = setTimeout(resolve, ms);
            
            const abortHandler = () => {
                clearTimeout(timeoutId);
                reject(signal.reason);
            };
            
            signal?.addEventListener('abort', abortHandler);
            
            // 정리
            return () => {
                clearTimeout(timeoutId);
                signal?.removeEventListener('abort', abortHandler);
            };
        });
    }
}
```text

## 4. 실행 모델과 스케줄링

### 🏭 실행자(Executor): 작업을 처리하는 공장

Java의 ExecutorService를 보고 배운 교훈:
"작업을 어디서 실행할지를 추상화하면, 테스트와 성능 최적화가 쉽다"

**실행자 패턴의 실전 활용:**

- **ThreadPoolExecutor**: CPU 집약적 작업 (ML 학습)
- **InlineExecutor**: 디버깅과 테스트
- **DelayedExecutor**: 스케줄링된 작업 (알림, 정기 체크)

### 4.1 실행 컨텍스트

```cpp
// 실행자 (Executor) 인터페이스
class IExecutor {
public:
    virtual ~IExecutor() = default;
    virtual void execute(std::function<void()> task) = 0;
};

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
```text

### 4.2 JavaScript 마이크로태스크와 매크로태스크

#### 🎯 실행 순서의 비밀: 마이크로 vs 매크로

제가 처음으로 이 차이를 깨달은 버그:

```javascript
setTimeout(() => console.log('1'), 0);
Promise.resolve().then(() => console.log('2'));
console.log('3');
// 출력: 3, 2, 1 (왜 2가 1보다 먼저?!)
```text

**비밀은 두 개의 큐:**

1. **마이크로태스크 큐** (우선순위 높음)
   - Promise 콜백
   - queueMicrotask()
   - MutationObserver

2. **매크로태스크 큐** (우선순위 낮음)
   - setTimeout/setInterval
   - setImmediate (Node.js)
   - I/O 작업

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
```text

## 5. 에러 처리 패턴

### 🛡️ Netflix의 Hystrix: 장애를 격리하는 방법

2018년, Netflix 엔지니어가 말했습니다:
"마이크로서비스 하나가 죽어도 전체 시스템은 살아야 합니다."

이것이 **Circuit Breaker** 패턴의 탄생 배경입니다.

**Circuit Breaker의 3가지 상태:**

1. **CLOSED** (정상): 전기가 흐름 ✓
2. **OPEN** (차단): 회로 차단, 요청 거부 ❌
3. **HALF_OPEN** (테스트): 조심스럽게 테스트 🤔

**실제 효과:**

- 장애 전파 방지: 99.9% 감소
- 응답 시간: 50ms → 5ms (빠른 실패)
- 시스템 복구: 10초 → 2초

### 5.1 에러 전파와 복구

```javascript
// 에러 처리 유틸리티
class ErrorHandler {
    // Result 타입 (Rust 스타일)
    static Ok(value) {
        return { ok: true, value };
    }
    
    static Err(error) {
        return { ok: false, error };
    }
    
    // Try-Catch를 Promise로 변환
    static async tryAsync(fn) {
        try {
            const result = await fn();
            return this.Ok(result);
        } catch (error) {
            return this.Err(error);
        }
    }
    
    // 에러 분류와 처리
    static handleError(error) {
        if (error instanceof NetworkError) {
            return this.handleNetworkError(error);
        } else if (error instanceof ValidationError) {
            return this.handleValidationError(error);
        } else if (error instanceof AuthError) {
            return this.handleAuthError(error);
        } else {
            return this.handleUnknownError(error);
        }
    }
    
    static handleNetworkError(error) {
        console.error('Network error:', error.message);
        
        // 재시도 가능한 에러
        if (error.retryable) {
            return { retry: true, delay: error.retryDelay || 1000 };
        }
        
        return { retry: false, fallback: error.fallbackValue };
    }
    
    static handleValidationError(error) {
        console.error('Validation error:', error.fields);
        return { 
            retry: false, 
            userMessage: 'Please check your input',
            fields: error.fields 
        };
    }
    
    static handleAuthError(error) {
        console.error('Auth error:', error.message);
        return { 
            retry: false, 
            redirect: '/login' 
        };
    }
    
    static handleUnknownError(error) {
        console.error('Unknown error:', error);
        return { 
            retry: false, 
            userMessage: 'An unexpected error occurred' 
        };
    }
}

// 커스텀 에러 클래스
class NetworkError extends Error {
    constructor(message, retryable = true, retryDelay = 1000) {
        super(message);
        this.name = 'NetworkError';
        this.retryable = retryable;
        this.retryDelay = retryDelay;
    }
}

class ValidationError extends Error {
    constructor(fields) {
        super('Validation failed');
        this.name = 'ValidationError';
        this.fields = fields;
    }
}

class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}

// Circuit Breaker 패턴
class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.halfOpenRequests = options.halfOpenRequests || 1;
        
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.halfOpenAttempts = 0;
    }
    
    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                this.state = 'HALF_OPEN';
                this.halfOpenAttempts = 0;
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }
        
        if (this.state === 'HALF_OPEN' && 
            this.halfOpenAttempts >= this.halfOpenRequests) {
            throw new Error('Circuit breaker is HALF_OPEN, waiting for test');
        }
        
        try {
            if (this.state === 'HALF_OPEN') {
                this.halfOpenAttempts++;
            }
            
            const result = await fn();
            
            // 성공 시 리셋
            if (this.state === 'HALF_OPEN') {
                this.state = 'CLOSED';
                this.failureCount = 0;
            }
            
            return result;
        } catch (error) {
            this.recordFailure();
            throw error;
        }
    }
    
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
            console.log('Circuit breaker opened');
        }
    }
    
    reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.lastFailureTime = null;
    }
}

// Bulkhead 패턴 (동시 실행 제한)
class Bulkhead {
    constructor(limit) {
        this.limit = limit;
        this.running = 0;
        this.queue = [];
    }
    
    async execute(fn) {
        if (this.running >= this.limit) {
            // 대기열에 추가
            return new Promise((resolve, reject) => {
                this.queue.push({ fn, resolve, reject });
            });
        }
        
        this.running++;
        
        try {
            const result = await fn();
            this.processQueue();
            return result;
        } catch (error) {
            this.processQueue();
            throw error;
        } finally {
            this.running--;
        }
    }
    
    processQueue() {
        if (this.queue.length > 0 && this.running < this.limit) {
            const { fn, resolve, reject } = this.queue.shift();
            this.execute(fn).then(resolve).catch(reject);
        }
    }
}
```text

## 🎯 핵심 정리: 10분 만에 마스터하는 Promise/Future

### 💡 기억해야 할 5가지 핵심

이 절에서 배운 Promise/Future 패턴의 핵심:

1. **기본 개념**: Promise/Future의 차이와 구현 원리
2. **비동기 조합**: 체이닝, 병렬 처리, 순차 실행 패턴
3. **취소와 타임아웃**: CancellationToken, AbortController
4. **실행 모델**: Executor, 이벤트 루프, 스케줄링
5. **에러 처리**: Circuit Breaker, Bulkhead, 에러 전파

### 🚀 다음 시간 예고: Event Loop와 동시성

8-2절에서는 **이벤트 루프와 동시성**을 다룹니다:

- Node.js의 libuv가 어떻게 100만 연결을 처리하는지
- 싱글 스레드로 동시성을 달성하는 비밀
- epoll, kqueue, IOCP의 실제 동작 원리
