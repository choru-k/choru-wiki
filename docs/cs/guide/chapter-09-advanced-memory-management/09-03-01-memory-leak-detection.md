---
tags:
  - address-sanitizer
  - debugging
  - hands-on
  - intermediate
  - medium-read
  - memory-leak
  - profiling-tools
  - valgrind
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 9.3.1: 메모리 누수 탐지 기초

## 🎯 이 문서에서 다루는 내용

이 섹션에서는:

1. **실제 사례를 통한 메모리 누수 패턴** - 10가지 흔한 누수 유형과 해결책
2. **Valgrind와 ASan 활용법** - C/C++ 메모리 오류 탐지
3. **Java 프로파일링 도구** - JVM 환경에서의 메모리 분석
4. **실시간 모니터링** - 프로덕션 환경에서의 메모리 추적

## 1. 메모리 누수: 조용한 킬러

### 1.1 내가 만난 최악의 메모리 누수

2018년, 금융 거래 시스템에서 일어난 실화입니다:

```text
월요일: "서버 메모리가 좀 높네요" - 4GB
화요일: "음... 6GB인데 괜찮겠죠?"
수요일: "8GB... 뭔가 이상한데?"
목요일: "12GB! 뭔가 문제가 있어요!"
금요일 새벽 3시: "서버 다운! OOM!" - 16GB 💥

손실: 3시간 다운타임, 수억 원 손해...
```

원인은 단 한 줄의 코드였습니다:

```java
// 문제의 코드
public class TradingSystem {
    // static 컬렉션에 계속 추가만...
    private static final Map<String, Order> ORDER_CACHE = new HashMap<>();

    public void processOrder(Order order) {
        ORDER_CACHE.put(order.getId(), order);  // 제거는 없음!
        // ... 처리 로직
    }
}
```

### 1.2 메모리 누수의 10가지 패턴

```java
// Pattern 1: 끝나지 않는 컬렉션
public class LeakPattern1 {
    private List<byte[]> leakyList = new ArrayList<>();

    public void process(byte[] data) {
        leakyList.add(data);  // 계속 추가만
        // clear()나 remove() 없음
    }
}

// Pattern 2: 리스너 미해제
public class LeakPattern2 {
    public void registerListener() {
        EventBus.register(new EventListener() {
            @Override
            public void onEvent(Event e) {
                // 처리
            }
        });
        // unregister 없음 - 익명 클래스가 계속 메모리에!
    }
}

// Pattern 3: ThreadLocal 미정리
public class LeakPattern3 {
    private static ThreadLocal<BigObject> threadLocal = new ThreadLocal<>();

    public void process() {
        threadLocal.set(new BigObject());
        // 처리...
        // threadLocal.remove() 없음!
        // 스레드풀에서는 치명적!
    }
}

// Pattern 4: 캐시 무한 증가
public class LeakPattern4 {
    private Map<String, CachedData> cache = new HashMap<>();

    public CachedData get(String key) {
        return cache.computeIfAbsent(key, k -> loadData(k));
        // TTL 없음, 크기 제한 없음
    }
}

// Pattern 5: 내부 클래스의 외부 참조
public class LeakPattern5 {
    private byte[] hugeData = new byte[100_000_000];

    public Runnable createTask() {
        return new Runnable() {  // 내부 클래스
            public void run() {
                System.out.println("Task");
                // hugeData를 사용 안 해도 참조 유지!
            }
        };
    }
}

// Pattern 6: ClassLoader 누수
public class LeakPattern6 {
    private static final Map<String, Class<?>> classCache = new HashMap<>();

    public void loadPlugin(String jar) throws Exception {
        URLClassLoader loader = new URLClassLoader(new URL[]{new URL(jar)});
        Class<?> clazz = loader.loadClass("Plugin");
        classCache.put(jar, clazz);  // ClassLoader 전체가 메모리에!
    }
}

// Pattern 7: Native 메모리 누수
public class LeakPattern7 {
    public void processImage(String path) {
        long nativePtr = loadImageNative(path);
        // 처리...
        // freeImageNative(nativePtr) 없음!
    }

    private native long loadImageNative(String path);
    private native void freeImageNative(long ptr);
}

// Pattern 8: Connection 미반환
public class LeakPattern8 {
    public void query(String sql) throws SQLException {
        Connection conn = dataSource.getConnection();
        Statement stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery(sql);
        // conn.close() 없음 - Connection Pool 고갈!
    }
}

// Pattern 9: String.intern() 남용
public class LeakPattern9 {
    private Set<String> processedIds = new HashSet<>();

    public void process(String id) {
        processedIds.add(id.intern());  // PermGen/Metaspace 누수
        // intern된 문자열은 GC 안 됨!
    }
}

// Pattern 10: Finalizer 지옥
public class LeakPattern10 {
    @Override
    protected void finalize() throws Throwable {
        // 느린 작업
        Thread.sleep(100);
        // Finalizer 큐가 쌓여서 메모리 누수처럼 보임
    }
}
```

## 2. 메모리 누수 사냥 도구

### 2.1 Valgrind: C/C++의 수호자

```c
// memory_leak.c
#include <stdlib.h>
#include <string.h>

void leak_example() {
    char* buffer = malloc(1024);
    strcpy(buffer, "Hello");
    // free(buffer) 없음!
}

int main() {
    for (int i = 0; i < 1000; i++) {
        leak_example();
    }
    return 0;
}

// Valgrind로 검사
// $ valgrind --leak-check=full --show-leak-kinds=all ./memory_leak

/* 출력:
==12345== HEAP SUMMARY:
==12345==     in use at exit: 1,024,000 bytes in 1,000 blocks
==12345==   total heap usage: 1,000 allocs, 0 frees, 1,024,000 bytes allocated
==12345==
==12345== 1,024,000 bytes in 1,000 blocks are definitely lost in loss record 1 of 1
==12345==    at 0x4C2FB0F: malloc (in /usr/lib/valgrind/vgpreload_memcheck-amd64-linux.so)
==12345==    by 0x4005B7: leak_example (memory_leak.c:5)
==12345==    by 0x4005D7: main (memory_leak.c:11)
*/

// Valgrind 고급 사용법
void advanced_valgrind() {
    // Massif: 힙 프로파일링
    // $ valgrind --tool=massif ./program
    // $ ms_print massif.out.12345

    // Cachegrind: 캐시 프로파일링
    // $ valgrind --tool=cachegrind ./program

    // Helgrind: 스레드 오류 탐지
    // $ valgrind --tool=helgrind ./program
}
```

### 2.2 AddressSanitizer (ASan)

```c++
// address_sanitizer.cpp
// 컴파일: g++ -fsanitize=address -g address_sanitizer.cpp

#include <iostream>
#include <vector>

void heap_buffer_overflow() {
    int* array = new int[10];
    array[10] = 42;  // 오버플로우!
    delete[] array;
}

void use_after_free() {
    int* ptr = new int(42);
    delete ptr;
    *ptr = 100;  // Use after free!
}

void memory_leak() {
    void* leak = malloc(1024);
    // free 없음
}

int main() {
    heap_buffer_overflow();
    use_after_free();
    memory_leak();
    return 0;
}

/* ASan 출력:
=================================================================
==12345==ERROR: AddressSanitizer: heap-buffer-overflow
WRITE of size 4 at 0x60400000dff8 thread T0
    #0 0x4011b6 in heap_buffer_overflow() address_sanitizer.cpp:7

=================================================================
==12346==ERROR: AddressSanitizer: heap-use-after-free
WRITE of size 4 at 0x60300000eff0 thread T0
    #0 0x401234 in use_after_free() address_sanitizer.cpp:13

=================================================================
==12347==ERROR: LeakSanitizer: detected memory leaks
Direct leak of 1024 byte(s) in 1 object(s) allocated from:
    #0 0x7f8a4a8a9b40 in malloc
    #1 0x401267 in memory_leak() address_sanitizer.cpp:17
*/
```

### 2.3 Java 메모리 프로파일링

```java
// JVM 프로파일링 도구들

public class JavaMemoryProfiling {
    // 1. jmap: 힙 덤프
    public static void heapDump() {
        // $ jmap -dump:format=b,file=heap.hprof <pid>
        // $ jhat heap.hprof  // 분석

        // 프로그래밍적으로 덤프
        try {
            MBeanServer server = ManagementFactory.getPlatformMBeanServer();
            HotSpotDiagnosticMXBean bean = ManagementFactory.newPlatformMXBeanProxy(
                server, "com.sun.management:type=HotSpotDiagnostic",
                HotSpotDiagnosticMXBean.class);
            bean.dumpHeap("/tmp/heap.hprof", true);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // 2. jstat: GC 통계
    // $ jstat -gcutil <pid> 1000
    // S0     S1     E      O      M     CCS    YGC     YGCT    FGC    FGCT     GCT
    // 0.00  95.89  57.78  24.32  98.04  96.95    456    3.234     2    0.122    3.356

    // 3. Java Flight Recorder (JFR)
    public static void startJFR() {
        // JVM 옵션
        // -XX:StartFlightRecording=duration=60s,filename=recording.jfr

        // 또는 코드로
        try {
            ProcessBuilder pb = new ProcessBuilder(
                "jcmd", String.valueOf(ProcessHandle.current().pid()),
                "JFR.start", "duration=60s", "filename=recording.jfr"
            );
            pb.start();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // 4. Memory Analyzer (MAT) 분석
    public static void analyzeWithMAT() {
        /*
        MAT에서 찾는 것들:
        1. Dominator Tree: 큰 객체 찾기
        2. Leak Suspects: 의심되는 누수
        3. Path to GC Roots: 왜 GC 안 되는지
        4. Duplicate Classes: ClassLoader 누수
        */
    }
}

// 실시간 모니터링
class MemoryMonitor {
    private final ScheduledExecutorService scheduler =
        Executors.newScheduledThreadPool(1);

    public void startMonitoring() {
        scheduler.scheduleAtFixedRate(() -> {
            MemoryMXBean memoryBean = ManagementFactory.getMemoryMXBean();
            MemoryUsage heapUsage = memoryBean.getHeapMemoryUsage();
            MemoryUsage nonHeapUsage = memoryBean.getNonHeapMemoryUsage();

            long heapUsed = heapUsage.getUsed() / 1024 / 1024;
            long heapMax = heapUsage.getMax() / 1024 / 1024;
            long nonHeapUsed = nonHeapUsage.getUsed() / 1024 / 1024;

            System.out.printf("Heap: %d/%d MB, Non-Heap: %d MB, ",
                heapUsed, heapMax, nonHeapUsed);

            // 임계값 초과 시 경고
            if (heapUsed > heapMax * 0.8) {
                System.err.println("WARNING: Heap usage > 80%!");
                // 힙 덤프 자동 생성
                heapDump();
            }
        }, 0, 10, TimeUnit.SECONDS);
    }
}
```

## 핵심 요점

### 1. 메모리 누수 탐지 전략

- 프로덕션 환경에서는 실시간 모니터링 필수
- 개발 중에는 정적 분석 도구 적극 활용
- 부하 테스트로 누수 패턴 조기 발견

### 2. 도구별 특성

- **Valgrind**: 느리지만 정확한 C/C++ 분석
- **AddressSanitizer**: 빠른 실시간 탐지
- **JProfiler/MAT**: Java 힙 분석의 표준

### 3. 예방이 최선

- 코드 리뷰에서 누수 패턴 체크
- RAII와 스마트 포인터 활용 (C++)
- try-with-resources 사용 (Java)

---

**다음**: [Zero-allocation 프로그래밍](./09-04-01-zero-allocation-programming.md)에서 Zero-allocation 프로그래밍 패턴을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-09-advanced-memory-management)

- [8.1.2: 메모리 할당자의 내부 구현 개요](../chapter-08-memory-allocator-gc/08-01-02-memory-allocator.md)
- [8.1.1: malloc 내부 동작의 진실](../chapter-08-memory-allocator-gc/08-01-01-malloc-fundamentals.md)
- [8.1.3: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](../chapter-08-memory-allocator-gc/08-01-03-allocator-comparison.md)
- [8.1.4: 커스텀 메모리 할당자 구현](../chapter-08-memory-allocator-gc/08-01-04-custom-allocators.md)
- [9.4.2: 실전 메모리 최적화 사례](./09-04-02-production-optimization.md)

### 🏷️ 관련 키워드

`memory-leak`, `debugging`, `profiling-tools`, `valgrind`, `address-sanitizer`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
