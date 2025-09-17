---
tags:
  - AbortController
  - CancellationToken
  - backoff
  - cancellation
  - hands-on
  - intermediate
  - medium-read
  - timeout
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 10.2.3: 취소와 타임아웃

## 🚫 "사용자가 취소 버튼을 눌렀어요!"

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
```

## C++ 취소 토큰 시스템

### CancellationToken 구현

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
```

### 취소 가능한 Future

```cpp
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
```

## JavaScript AbortController

### 🎆 AbortController: 비동기의 긴급 정지 버튼

Google Chrome 팀이 AbortController를 도입한 이유:

- **메모리 누수**: 취소되지 않은 fetch가 메모리를 계속 점유
- **네트워크 대역폭**: 불필요한 요청이 계속 진행
- **UX 개선**: 사용자가 페이지 이동 시 즉시 취소

### 커스텀 AbortController 구현

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
```

### 취소 가능한 Fetch와 타임아웃

```javascript
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
```

### 재시도 로직 with 백오프

```javascript
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
```

### 사용 예제

```javascript
// 타임아웃과 취소가 지원되는 데이터 페칭
async function fetchWithTimeoutAndCancel() {
    const controller = new AbortController();
    const retryStrategy = new RetryWithBackoff({
        maxRetries: 3,
        baseDelay: 1000,
        factor: 2
    });
    
    // UI에 취소 버튼 연결
    document.getElementById('cancel-btn').onclick = () => {
        controller.abort();
    };
    
    try {
        const result = await retryStrategy.execute(
            () => TimeoutPromise.withTimeout(
                fetch('/api/data', { signal: controller.signal }),
                5000 // 5초 타임아웃
            ),
            controller.signal
        );
        
        const data = await result.json();
        console.log('Data fetched successfully:', data);
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Request cancelled by user');
        } else {
            console.error('Failed to fetch data:', error);
        }
    }
}
```

## 핵심 요점

### 1. 사용자 경험을 최우선으로 하라

사용자가 취소 버튼을 누르면 **즉시** 반응해야 한다. 메모리와 CPU를 낭비하지 마라.

### 2. 취소 토큰 패턴을 사용하라

- **C++**: CancellationToken으로 협조적 취소
- **JavaScript**: AbortController/AbortSignal 활용

### 3. 타임아웃은 필수다

모든 네트워크 요청과 장기 실행 작업에 적절한 타임아웃을 설정하라.

### 4. 재시도는 똑똑하게 하라

exponential backoff로 서버 부하를 줄이고 성공률을 높여라.

---

**이전**: [10.2.2 비동기 컴포지션](./10-02-02-async-composition.md)  
**다음**: [10.2.4 실행 스케줄링](./10-02-04-execution-scheduling.md)에서 스레드 풀과 작업 스케줄링을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-10-async-programming)

- [8.1 Promise/Future 패턴 개요](./10-02-01-promise-future.md)
- [8.1a Promise/Future 기본 개념과 구현](./10-01-01-promise-future-basics.md)
- [10.2.2 비동기 컴포지션](./10-02-02-async-composition.md)
- [10.2.4 실행 스케줄링](./10-02-04-execution-scheduling.md)
- [10.5.1 에러 처리](./10-05-01-error-handling.md)

### 🏷️ 관련 키워드

`cancellation`, `timeout`, `AbortController`, `CancellationToken`, `backoff`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
