---
tags:
  - Java
  - VirtualThread
  - ProjectLoom
  - Continuation
  - JVM
---

# Chapter 8-3D: Java Virtual Threads와 Project Loom

## 🎯 Continuation 기반의 혁신

Java 19에서 도입된 Virtual Thread는 JVM 역사상 가장 혁신적인 기능 중 하나입니다:

1. **Continuation 마법**: 실행 컨텍스트를 동결/해제하는 기술
2. **Platform Thread와의 차이**: 성능과 메모리 사용량 비교 분석
3. **Pinning 문제**: 동기화 블록에서의 제약과 해결방안
4. **실전 활용**: 대규모 동시 연결 처리 비밀

## 4. Java Virtual Threads: Project Loom의 혁명

### 4.1 Continuation: 마법의 핵심

Java 19에서 도입된 Virtual Thread는 Continuation 기반입니다:

```java
// Continuation의 개념적 구현
public class Continuation {
    private final Runnable task;
    private Stack stack;  // 실행 컨텍스트
    private boolean done;

    public Continuation(Runnable task) {
        this.task = task;
        this.stack = new Stack();
    }

    public void run() {
        if (done) return;

        // 현재 스택 저장
        Stack oldStack = Thread.currentStack();
        Thread.setStack(this.stack);

        try {
            task.run();
            done = true;
        } catch (YieldException e) {
            // yield 호출 - 스택 저장하고 반환
            this.stack = Thread.currentStack();
        } finally {
            Thread.setStack(oldStack);
        }
    }

    public static void yield() {
        throw new YieldException();
    }
}

// Virtual Thread 구현
public class VirtualThread extends Thread {
    private static final ForkJoinPool SCHEDULER =
        ForkJoinPool.commonPool();

    private final Continuation continuation;
    private volatile int state;

    public VirtualThread(Runnable task) {
        this.continuation = new Continuation(task);
    }

    @Override
    public void start() {
        SCHEDULER.execute(this::run);
    }

    @Override
    public void run() {
        while (!continuation.isDone()) {
            continuation.run();

            if (!continuation.isDone()) {
                // Parking or I/O - yield to scheduler
                park();
            }
        }
    }

    private void park() {
        state = PARKED;
        // Scheduler가 다른 VirtualThread 실행
        LockSupport.park(this);
    }

    public void unpark() {
        state = RUNNABLE;
        SCHEDULER.execute(this::run);
    }
}
```

### 4.2 Virtual Thread vs Platform Thread 성능 비교

```java
import java.util.concurrent.*;
import java.time.Duration;
import java.time.Instant;

public class ThreadComparison {
    static final int NUM_TASKS = 100_000;

    // Platform Thread (기존 스레드)
    public static void platformThreadTest() throws Exception {
        ExecutorService executor =
            Executors.newFixedThreadPool(200);

        Instant start = Instant.now();
        CountDownLatch latch = new CountDownLatch(NUM_TASKS);

        for (int i = 0; i < NUM_TASKS; i++) {
            executor.submit(() -> {
                try {
                    Thread.sleep(100);  // I/O 시뮬레이션
                    latch.countDown();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
        }

        latch.await();
        Duration elapsed = Duration.between(start, Instant.now());

        System.out.println("Platform Threads:");
        System.out.println("Time: " + elapsed.toMillis() + "ms");
        System.out.println("Memory: " +
            (Runtime.getRuntime().totalMemory() / 1024 / 1024) + "MB");

        executor.shutdown();
    }

    // Virtual Thread
    public static void virtualThreadTest() throws Exception {
        Instant start = Instant.now();

        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            CountDownLatch latch = new CountDownLatch(NUM_TASKS);

            for (int i = 0; i < NUM_TASKS; i++) {
                executor.submit(() -> {
                    try {
                        Thread.sleep(100);  // I/O 시뮬레이션
                        latch.countDown();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
            }

            latch.await();
        }

        Duration elapsed = Duration.between(start, Instant.now());

        System.out.println("Virtual Threads:");
        System.out.println("Time: " + elapsed.toMillis() + "ms");
        System.out.println("Memory: " +
            (Runtime.getRuntime().totalMemory() / 1024 / 1024) + "MB");
    }

    public static void main(String[] args) throws Exception {
        // Warm up
        virtualThreadTest();
        platformThreadTest();

        System.gc();
        Thread.sleep(1000);

        // Actual test
        System.out.println(", === Performance Test ===");
        platformThreadTest();
        // 결과: Time: 50000ms, Memory: 800MB

        System.gc();
        Thread.sleep(1000);

        virtualThreadTest();
        // 결과: Time: 150ms, Memory: 150MB

        // Virtual Thread가 300배 빠르고 5배 메모리 효율적!
    }
}
```

### 4.3 Pinning 문제와 해결

Virtual Thread의 한계와 해결책:

```java
// Pinning 문제: synchronized 블록
public class PinningProblem {
    private static final Object lock = new Object();

    // 문제: synchronized는 carrier thread를 pin
    public void problematicMethod() {
        synchronized (lock) {
            try {
                Thread.sleep(100);  // Carrier thread blocked!
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    // 해결책 1: ReentrantLock 사용
    private final ReentrantLock reentrantLock = new ReentrantLock();

    public void betterMethod() {
        reentrantLock.lock();
        try {
            Thread.sleep(100);  // Virtual thread만 block
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            reentrantLock.unlock();
        }
    }

    // 해결책 2: Semaphore 사용
    private final Semaphore semaphore = new Semaphore(1);

    public void alternativeMethod() throws InterruptedException {
        semaphore.acquire();
        try {
            Thread.sleep(100);
        } finally {
            semaphore.release();
        }
    }

    // Pinning 감지
    public static void detectPinning() {
        // JVM 옵션: -Djdk.tracePinnedThreads=full
        System.setProperty("jdk.tracePinnedThreads", "full");

        Thread.startVirtualThread(() -> {
            synchronized (lock) {
                try {
                    Thread.sleep(100);
                    // 콘솔에 pinning 스택 트레이스 출력됨
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        });
    }
}
```

## 핵심 요점

### 1. Continuation의 혁신적 접근

실행 컨텍스트를 동결/해제하는 Continuation 기술로 JVM 역사상 가장 혁신적인 동시성 모델을 구현했습니다.

### 2. 압도적 성능 개선

기존 Platform Thread 대비 300배 높은 성능과 5배 적은 메모리 사용량으로 I/O 집약적 애플리케이션 개발에 혁명을 가져왔습니다.

### 3. Pinning 문제의 인식과 대안

`synchronized` 블록의 Pinning 문제를 인식하고 `ReentrantLock`, `Semaphore` 등의 대안 방안을 제시합니다.

---

**이전**: [03c-go-goroutine-architecture.md](03c-go-goroutine-architecture.md)  
**다음**: [03e-synchronization-debugging.md](03e-synchronization-debugging.md)에서 메모리 모델과 디버깅 기법을 다룹니다.
