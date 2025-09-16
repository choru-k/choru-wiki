---
tags:
  - bulkhead
  - circuit-breaker
  - fault-tolerance
  - hands-on
  - intermediate
  - medium-read
  - resilience
  - retry-patterns
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# Chapter 8-4D: Circuit Breaker와 복원력 패턴

## 🎯 이 섹션에서 배울 내용

시스템 장애에 대응하고 복원력을 높이는 핵심 패턴들을 마스터합니다:

1. **Circuit Breaker 패턴** - 장애 전파 방지와 빠른 실패
2. **Bulkhead 패턴** - 자원 격리로 장애 범위 제한
3. **Retry 전략** - 지능적인 재시도 메커니즘

## 1. Circuit Breaker 패턴

Circuit Breaker는 전기 회로의 차단기에서 영감을 받은 패턴입니다. 시스템이 장애 상태일 때 빠르게 실패시켜 더 큰 마비를 방지합니다.

### 1.1 Circuit Breaker 구현

```python
from enum import Enum
from datetime import datetime, timedelta
import asyncio
from typing import Callable, Any, Optional
import logging

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: type = Exception
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        
        self.failure_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.state = CircuitState.CLOSED
        
        # 메트릭
        self.total_calls = 0
        self.successful_calls = 0
        self.failed_calls = 0
        
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        self.total_calls += 1
        
        # Circuit이 열려있는지 확인
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitState.HALF_OPEN
            else:
                self.failed_calls += 1
                raise CircuitOpenError(
                    f"Circuit breaker is OPEN. "
                    f"Retry after {self._time_until_reset()} seconds"
                )
        
        try:
            # 실제 함수 호출
            result = await func(*args, **kwargs)
            self._on_success()
            return result
            
        except self.expected_exception as e:
            self._on_failure()
            raise e
    
    def _should_attempt_reset(self) -> bool:
        return (
            self.last_failure_time and
            datetime.now() >= self.last_failure_time + 
            timedelta(seconds=self.recovery_timeout)
        )
    
    def _time_until_reset(self) -> int:
        if not self.last_failure_time:
            return 0
        
        elapsed = datetime.now() - self.last_failure_time
        remaining = self.recovery_timeout - elapsed.total_seconds()
        return max(0, int(remaining))
    
    def _on_success(self):
        self.successful_calls += 1
        
        if self.state == CircuitState.HALF_OPEN:
            # Half-open에서 성공 -> Circuit 닫기
            self.state = CircuitState.CLOSED
            self.failure_count = 0
            logging.info("Circuit breaker closed after successful call")
    
    def _on_failure(self):
        self.failed_calls += 1
        self.failure_count += 1
        self.last_failure_time = datetime.now()
        
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logging.error(
                f"Circuit breaker opened after {self.failure_count} failures"
            )
        
        if self.state == CircuitState.HALF_OPEN:
            # Half-open에서 실패 -> 다시 열기
            self.state = CircuitState.OPEN
            logging.warning("Circuit breaker reopened after failure in half-open")
    
    def get_state(self) -> dict:
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "total_calls": self.total_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "success_rate": (
                self.successful_calls / self.total_calls 
                if self.total_calls > 0 else 0
            )
        }

# 사용 예제
class PaymentService:
    def __init__(self):
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=3,
            recovery_timeout=30,
            expected_exception=PaymentGatewayError
        )
    
    async def process_payment(self, amount: float, card: str) -> str:
        return await self.circuit_breaker.call(
            self._call_payment_gateway,
            amount,
            card
        )
    
    async def _call_payment_gateway(self, amount: float, card: str) -> str:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://payment-gateway.com/charge",
                json={"amount": amount, "card": card},
                timeout=aiohttp.ClientTimeout(total=5)
            ) as response:
                if response.status != 200:
                    raise PaymentGatewayError(f"Status: {response.status}")
                
                return await response.json()
```

**Circuit Breaker의 3상태:**

1. **CLOSED**: 정상 작동, 모든 호출 통과
2. **OPEN**: 장애 상태, 즉시 예외 발생
3. **HALF_OPEN**: 복구 테스트, 제한된 호출 허용

### 1.2 고급 Circuit Breaker 기능

```python
# 다단계 Circuit Breaker
class AdvancedCircuitBreaker(CircuitBreaker):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.response_time_threshold = kwargs.get('response_time_threshold', 1000)
        self.slow_call_threshold = kwargs.get('slow_call_threshold', 10)
        self.slow_call_count = 0
        
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        start_time = time.time()
        
        try:
            result = await super().call(func, *args, **kwargs)
            
            # 응답 시간 모니터링
            response_time = (time.time() - start_time) * 1000
            
            if response_time > self.response_time_threshold:
                self.slow_call_count += 1
                
                if self.slow_call_count >= self.slow_call_threshold:
                    logging.warning(
                        f"Too many slow calls ({self.slow_call_count}). "
                        f"Opening circuit breaker."
                    )
                    self.state = CircuitState.OPEN
                    self.last_failure_time = datetime.now()
            else:
                self.slow_call_count = max(0, self.slow_call_count - 1)
            
            return result
            
        except Exception as e:
            raise e
    
    def get_health_metrics(self) -> dict:
        base_metrics = self.get_state()
        
        return {
            **base_metrics,
            "slow_call_count": self.slow_call_count,
            "avg_response_time": self.get_avg_response_time(),
            "health_score": self.calculate_health_score()
        }
    
    def calculate_health_score(self) -> float:
        if self.total_calls == 0:
            return 1.0
        
        success_rate = self.successful_calls / self.total_calls
        slow_call_rate = self.slow_call_count / self.total_calls
        
        # Health score: 0.0 (나쁨) ~ 1.0 (우수)
        health_score = success_rate * (1 - slow_call_rate * 0.5)
        return max(0.0, min(1.0, health_score))
```

## 2. Bulkhead 패턴: 격리의 미학

Bulkhead 패턴은 선박의 격벽에서 영감을 받았습니다. 자원을 격리하여 한 서비스의 장애가 전체에 퍼지지 않도록 합니다.

### 2.1 Thread Pool Bulkhead

```java
// Thread Pool Bulkhead
@Component
public class BulkheadManager {
    private final Map<String, ThreadPoolExecutor> bulkheads = 
        new ConcurrentHashMap<>();
    
    public BulkheadManager() {
        // 서비스별 격리된 스레드 풀
        bulkheads.put("payment", createBulkhead(10, 20, 100));
        bulkheads.put("inventory", createBulkhead(5, 10, 50));
        bulkheads.put("shipping", createBulkhead(5, 10, 50));
        bulkheads.put("notification", createBulkhead(2, 5, 20));
    }
    
    private ThreadPoolExecutor createBulkhead(
        int coreSize, 
        int maxSize, 
        int queueCapacity
    ) {
        return new ThreadPoolExecutor(
            coreSize,
            maxSize,
            60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(queueCapacity),
            new ThreadPoolExecutor.CallerRunsPolicy()  // Back-pressure
        );
    }
    
    public <T> CompletableFuture<T> execute(
        String bulkheadName,
        Callable<T> task
    ) {
        ThreadPoolExecutor executor = bulkheads.get(bulkheadName);
        
        if (executor == null) {
            throw new IllegalArgumentException(
                "Unknown bulkhead: " + bulkheadName
            );
        }
        
        // 메트릭 수집
        recordMetrics(bulkheadName, executor);
        
        // 격리된 실행
        CompletableFuture<T> future = new CompletableFuture<>();
        
        executor.submit(() -> {
            try {
                T result = task.call();
                future.complete(result);
            } catch (Exception e) {
                future.completeExceptionally(e);
            }
        });
        
        return future;
    }
    
    private void recordMetrics(String name, ThreadPoolExecutor executor) {
        Metrics.gauge("bulkhead.active", executor.getActiveCount())
            .tag("bulkhead", name);
        
        Metrics.gauge("bulkhead.queue.size", executor.getQueue().size())
            .tag("bulkhead", name);
        
        Metrics.gauge("bulkhead.pool.size", executor.getPoolSize())
            .tag("bulkhead", name);
        
        // 포화 상태 감지
        if (executor.getQueue().remainingCapacity() == 0) {
            Metrics.counter("bulkhead.saturated")
                .tag("bulkhead", name)
                .increment();
        }
    }
    
    public Map<String, BulkheadStatus> getBulkheadStatus() {
        Map<String, BulkheadStatus> status = new HashMap<>();
        
        for (Map.Entry<String, ThreadPoolExecutor> entry : bulkheads.entrySet()) {
            ThreadPoolExecutor executor = entry.getValue();
            
            status.put(entry.getKey(), BulkheadStatus.builder()
                .name(entry.getKey())
                .activeThreads(executor.getActiveCount())
                .queueSize(executor.getQueue().size())
                .queueCapacity(executor.getQueue().remainingCapacity())
                .completedTasks(executor.getCompletedTaskCount())
                .isHealthy(executor.getQueue().remainingCapacity() > 0)
                .build());
        }
        
        return status;
    }
}
```

### 2.2 Semaphore Bulkhead (더 가벼운 격리)

```java
// Semaphore Bulkhead (더 가벼운 격리)
public class SemaphoreBulkhead {
    private final Semaphore semaphore;
    private final String name;
    private final AtomicInteger activeCount = new AtomicInteger(0);
    private final AtomicInteger totalRequests = new AtomicInteger(0);
    private final AtomicInteger rejectedRequests = new AtomicInteger(0);
    
    public SemaphoreBulkhead(String name, int maxConcurrency) {
        this.name = name;
        this.semaphore = new Semaphore(maxConcurrency);
    }
    
    public <T> T execute(Supplier<T> supplier) throws BulkheadFullException {
        totalRequests.incrementAndGet();
        boolean acquired = false;
        
        try {
            acquired = semaphore.tryAcquire(100, TimeUnit.MILLISECONDS);
            
            if (!acquired) {
                rejectedRequests.incrementAndGet();
                throw new BulkheadFullException(
                    "Bulkhead " + name + " is full"
                );
            }
            
            activeCount.incrementAndGet();
            long startTime = System.currentTimeMillis();
            
            try {
                T result = supplier.get();
                
                // 성공 메트릭
                Metrics.timer("bulkhead.execution.time")
                    .tag("bulkhead", name)
                    .record(Duration.ofMillis(
                        System.currentTimeMillis() - startTime
                    ));
                
                return result;
                
            } catch (Exception e) {
                // 실패 메트릭
                Metrics.counter("bulkhead.execution.failed")
                    .tag("bulkhead", name)
                    .increment();
                
                throw e;
            }
            
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            rejectedRequests.incrementAndGet();
            throw new RuntimeException(e);
        } finally {
            if (acquired) {
                activeCount.decrementAndGet();
                semaphore.release();
            }
        }
    }
    
    public BulkheadMetrics getMetrics() {
        return BulkheadMetrics.builder()
            .name(name)
            .activeCount(activeCount.get())
            .availablePermits(semaphore.availablePermits())
            .totalRequests(totalRequests.get())
            .rejectedRequests(rejectedRequests.get())
            .rejectionRate(
                totalRequests.get() > 0 ? 
                    (double) rejectedRequests.get() / totalRequests.get() : 0.0
            )
            .build();
    }
}
```

## 3. 지능적인 Retry 전략

### 3.1 스마트한 Retry 정책

```kotlin
// 스마트한 Retry 정책
class SmartRetryPolicy {
    private val logger = LoggerFactory.getLogger(javaClass)
    
    suspend fun <T> executeWithRetry(
        maxAttempts: Int = 3,
        initialDelay: Duration = Duration.ofMillis(100),
        maxDelay: Duration = Duration.ofSeconds(10),
        backoffMultiplier: Double = 2.0,
        jitterFactor: Double = 0.1,
        retryableExceptions: Set<Class<out Exception>> = setOf(
            IOException::class.java,
            TimeoutException::class.java
        ),
        operation: suspend () -> T
    ): T {
        var currentDelay = initialDelay
        var lastException: Exception? = null
        
        repeat(maxAttempts) { attempt ->
            try {
                // Circuit breaker 통합
                if (shouldCircuitBreak(attempt)) {
                    throw CircuitOpenException()
                }
                
                // Timeout 적용
                return withTimeout(calculateTimeout(attempt)) {
                    operation()
                }
                
            } catch (e: Exception) {
                lastException = e
                
                // 재시도 가능한 예외인지 확인
                if (!isRetryable(e, retryableExceptions)) {
                    throw e
                }
                
                // 마지막 시도였다면 예외 발생
                if (attempt == maxAttempts - 1) {
                    throw RetryExhaustedException(
                        "Failed after $maxAttempts attempts",
                        e
                    )
                }
                
                // 지수 백오프 + 지터
                val jitter = (Random.nextDouble() * 2 - 1) * jitterFactor
                val delayMillis = (currentDelay.toMillis() * (1 + jitter)).toLong()
                
                logger.warn(
                    "Attempt ${attempt + 1} failed: ${e.message}. " +
                    "Retrying in ${delayMillis}ms..."
                )
                
                delay(delayMillis)
                
                // 다음 지연 시간 계산
                currentDelay = Duration.ofMillis(
                    min(
                        (currentDelay.toMillis() * backoffMultiplier).toLong(),
                        maxDelay.toMillis()
                    )
                )
            }
        }
        
        throw lastException!!
    }
    
    private fun isRetryable(
        exception: Exception,
        retryableExceptions: Set<Class<out Exception>>
    ): Boolean {
        // 특정 에러 코드는 재시도 불가
        if (exception is HttpException) {
            return exception.code() !in listOf(400, 401, 403, 404)
        }
        
        return retryableExceptions.any { it.isInstance(exception) }
    }
    
    private fun calculateTimeout(attempt: Int): Duration {
        // 시도 횟수에 따라 타임아웃 증가
        return Duration.ofSeconds(5L * (attempt + 1))
    }
    
    private fun shouldCircuitBreak(attempt: Int): Boolean {
        // 연속 실패가 많으면 circuit break
        return getRecentFailureRate() > 0.8 && attempt > 1
    }
    
    private fun getRecentFailureRate(): Double {
        // 최근 1분간 실패율 계산
        val recentFailures = metricsCollector.getRecentFailures(Duration.ofMinutes(1))
        val recentTotal = metricsCollector.getRecentTotal(Duration.ofMinutes(1))
        
        return if (recentTotal > 0) recentFailures.toDouble() / recentTotal else 0.0
    }
}
```

### 3.2 Hedged Requests (여러 요청 동시 실행)

```kotlin
// Hedged Requests (여러 요청 동시 실행)
class HedgedRequestExecutor {
    suspend fun <T> executeHedged(
        primaryOperation: suspend () -> T,
        fallbackOperations: List<suspend () -> T>,
        hedgeDelay: Duration = Duration.ofMillis(200)
    ): T = coroutineScope {
        val results = Channel<Result<T>>()
        
        // Primary 요청
        launch {
            try {
                val result = primaryOperation()
                results.send(Result.success(result))
            } catch (e: Exception) {
                results.send(Result.failure(e))
            }
        }
        
        // Hedge 요청들
        fallbackOperations.forEach { operation ->
            launch {
                delay(hedgeDelay.toMillis())
                
                // 이미 성공했으면 실행 안 함
                if (!results.isClosedForSend) {
                    try {
                        val result = operation()
                        results.send(Result.success(result))
                    } catch (e: Exception) {
                        results.send(Result.failure(e))
                    }
                }
            }
        }
        
        // 첫 번째 성공 반환
        var failures = 0
        for (result in results) {
            if (result.isSuccess) {
                results.close()
                return@coroutineScope result.getOrThrow()
            }
            
            failures++
            if (failures == fallbackOperations.size + 1) {
                throw AllRequestsFailedException()
            }
        }
        
        throw IllegalStateException("No results received")
    }
    
    // 실용 예제: 여러 데이터베이스 동시 쿼리
    suspend fun queryWithHedging(
        query: String,
        primaryDb: DatabaseConnection,
        replicaDbs: List<DatabaseConnection>
    ): QueryResult {
        return executeHedged(
            primaryOperation = { primaryDb.execute(query) },
            fallbackOperations = replicaDbs.map { db ->
                { db.execute(query) }
            },
            hedgeDelay = Duration.ofMillis(100)
        )
    }
}
```

### 3.3 Adaptive Retry with Machine Learning

```kotlin
// ML 기반 적응적 Retry
class AdaptiveRetryPolicy {
    private val retryPredictor = RetrySuccessPredictionModel()
    private val historicalData = mutableListOf<RetryAttempt>()
    
    suspend fun <T> executeWithAdaptiveRetry(
        operation: suspend () -> T,
        context: OperationContext
    ): T {
        var attempt = 0
        var lastException: Exception? = null
        
        while (attempt < getMaxAttempts(context)) {
            try {
                val result = operation()
                
                // 성공 데이터 기록
                recordSuccess(attempt, context)
                return result
                
            } catch (e: Exception) {
                lastException = e
                attempt++
                
                // ML 모델로 재시도 성공 확률 예측
                val successProbability = retryPredictor.predictSuccessProbability(
                    exception = e,
                    attempt = attempt,
                    context = context,
                    historicalData = getRecentHistory(context)
                )
                
                // 성공 확률이 낮으면 조기 중단
                if (successProbability < 0.1) {
                    logger.info(
                        "Low success probability ($successProbability). "
                        + "Stopping retry after $attempt attempts."
                    )
                    break
                }
                
                // 동적 지연 시간 계산
                val delay = calculateAdaptiveDelay(
                    attempt = attempt,
                    exception = e,
                    successProbability = successProbability
                )
                
                logger.warn(
                    "Attempt $attempt failed. Success probability: $successProbability. "
                    + "Retrying in ${delay}ms..."
                )
                
                delay(delay)
            }
        }
        
        // 실패 데이터 기록
        recordFailure(attempt, context, lastException!!)
        throw lastException
    }
    
    private fun calculateAdaptiveDelay(
        attempt: Int,
        exception: Exception,
        successProbability: Double
    ): Long {
        // 기본 지수 백오프
        var delay = (100 * Math.pow(2.0, attempt.toDouble())).toLong()
        
        // 예외 타입에 따른 조정
        when (exception) {
            is TimeoutException -> delay *= 2  // 타임아웃은 오래 대기
            is RateLimitException -> delay *= 5  // 레이트 리미트는 더 오래
            is ConnectException -> delay /= 2   // 연결 에러는 빠르게 재시도
        }
        
        // 성공 확률에 따른 조정
        if (successProbability > 0.5) {
            delay /= 2  // 성공 가능성이 높으면 빠르게
        } else if (successProbability < 0.2) {
            delay *= 3  // 낮으면 오래 대기
        }
        
        return Math.min(delay, 30000)  // 최대 30초
    }
}
```

## 핵심 요점

### 1. Circuit Breaker로 장애 전파 방지

- **3상태 관리**: CLOSED, OPEN, HALF_OPEN
- **빠른 실패**: 장애 상태에서 즉시 예외 반환
- **자동 복구**: 일정 시간 후 복구 시도

### 2. Bulkhead로 자원 격리

- **Thread Pool 격리**: 서비스별 독립적인 스레드 풀
- **Semaphore 격리**: 더 가벼운 동시 접근 제한
- **장애 범위 제한**: 한 서비스 장애가 전체로 파급 방지

### 3. 지능적인 Retry 전략

- **Exponential Backoff + Jitter**: 서버 과부하 방지
- **Hedged Requests**: 여러 서버에 동시 요청
- **ML 기반 적응**: 성공 확률 기반 재시도 결정

---

**이전**: [04c-message-streaming.md](./04c-message-streaming.md)
**다음**: [10-51-production-case-study.md](./10-51-production-case-study.md)에서 대용량 이커머스 시스템 사례를 학습합니다.

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

- [8.1 Promise/Future 패턴 개요](./10-10-promise-future.md)
- [8.1a Promise/Future 기본 개념과 구현](./10-01-promise-future-basics.md)
- [8.1b 비동기 연산 조합과 병렬 처리](./10-11-async-composition.md)
- [8.1c 취소와 타임아웃 처리](./10-12-cancellation-timeout.md)
- [8.1d 실행 모델과 스케줄링](./10-13-execution-scheduling.md)

### 🏷️ 관련 키워드

`circuit-breaker`, `bulkhead`, `retry-patterns`, `resilience`, `fault-tolerance`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
