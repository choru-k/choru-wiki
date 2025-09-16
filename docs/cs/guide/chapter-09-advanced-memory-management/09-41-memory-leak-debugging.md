---
tags:
  - address-sanitizer
  - debugging-tools
  - deep-study
  - hands-on
  - intermediate
  - java-profiling
  - memory-leak
  - valgrind
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "6-8시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# Chapter 9-4A: 메모리 누수 탐지와 디버깅 도구

프로덕션 환경에서 서버가 갑자기 OOM으로 죽는 상황은 개발자들의 악몽입니다. 이 문서에서는 메모리 누수의 일반적인 패턴을 이해하고, 전문가급 디버깅 도구로 원인을 정확히 찾아내는 방법을 학습합니다.

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

## 2. Valgrind: C/C++의 수호자

### 2.1 기본 메모리 누수 탐지

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
```

### 2.2 Valgrind 고급 사용법

```c
// valgrind_advanced.c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

void advanced_valgrind_demo() {
    printf("Valgrind 고급 기능들:\n");
    
    // 1. Massif: 힙 프로파일링
    // $ valgrind --tool=massif ./program
    // $ ms_print massif.out.12345
    
    // Massif 설정 예시
    // --stacks=yes          : 스택도 프로파일링
    // --threshold=1.0       : 1% 이상만 표시
    // --peak-inaccuracy=2.0 : 피크 감지 정확도
    
    printf("Massif: 시간별 힙 사용량 프로파일링\n");
    
    // 2. Cachegrind: 캐시 프로파일링
    // $ valgrind --tool=cachegrind ./program
    // $ cg_annotate cachegrind.out.12345
    
    printf("Cachegrind: L1/L2/L3 캐시 미스 분석\n");
    
    // 3. Helgrind: 스레드 오류 탐지
    // $ valgrind --tool=helgrind ./program
    
    printf("Helgrind: 스레드 안전성 검사\n");
    
    // 4. DRD: 또 다른 스레드 체커
    // $ valgrind --tool=drd ./program
    
    printf("DRD: 데이터 경합 조건 탐지\n");
    
    // 5. Memcheck 상세 옵션
    // --track-origins=yes   : 초기화되지 않은 값의 출처 추적
    // --show-reachable=yes  : 도달 가능한 블록도 표시
    // --gen-suppressions=all: 경고 억제 파일 생성
    
    printf("Memcheck: 상세 메모리 오류 분석\n");
}

// Valgrind 성능 최적화 팁
void valgrind_optimization_tips() {
    /*
    1. 컴파일 최적화
    - gcc -g -O0 (디버그 정보 + 최적화 끄기)
    - 너무 높은 최적화는 스택 트레이스를 방해
    
    2. 메모리 할당 최적화
    - 큰 블록 할당 후 작은 단위로 나누기
    - 자주 할당/해제하는 코드 최적화
    
    3. 억제 파일 사용
    - 라이브러리 오류 억제
    - --suppressions=my_suppressions.supp
    
    4. 선택적 체크
    - --partial-loads-ok=yes (부분 로드 허용)
    - --undef-value-errors=no (정의되지 않은 값 오류 끄기)
    */
}
```

## 3. AddressSanitizer (ASan): 빠르고 정확한 탐지

### 3.1 다양한 메모리 오류 탐지

```c++
// address_sanitizer.cpp
// 컴파일: g++ -fsanitize=address -g -O1 address_sanitizer.cpp

#include <iostream>
#include <vector>
#include <memory>

class AddressSanitizerDemo {
public:
    // 1. 힙 버퍼 오버플로우
    void heap_buffer_overflow() {
        int* array = new int[10];
        array[10] = 42;  // 오버플로우!
        delete[] array;
    }
    
    // 2. 스택 버퍼 오버플로우
    void stack_buffer_overflow() {
        char buffer[10];
        buffer[10] = 'A';  // 오버플로우!
    }
    
    // 3. Use after free
    void use_after_free() {
        int* ptr = new int(42);
        delete ptr;
        *ptr = 100;  // Use after free!
    }
    
    // 4. Use after return (스택)
    int* use_after_return() {
        int local = 42;
        return &local;  // 스택 변수 주소 반환!
    }
    
    // 5. Double free
    void double_free() {
        int* ptr = new int(42);
        delete ptr;
        delete ptr;  // Double free!
    }
    
    // 6. 메모리 누수
    void memory_leak() {
        void* leak = malloc(1024);
        // free 없음
    }
    
    // 7. 초기화되지 않은 메모리
    void uninitialized_memory() {
        int* array = new int[10];
        // 초기화 없이 사용
        for (int i = 0; i < 10; i++) {
            std::cout << array[i] << " ";
        }
        delete[] array;
    }
};

int main() {
    AddressSanitizerDemo demo;
    
    try {
        demo.heap_buffer_overflow();
        demo.stack_buffer_overflow();
        demo.use_after_free();
        demo.double_free();
        demo.memory_leak();
        demo.uninitialized_memory();
    } catch (const std::exception& e) {
        std::cerr << "Exception: " << e.what() << std::endl;
    }
    
    return 0;
}

/* ASan 출력 예시:
=================================================================
==12345==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x60400000dff8
READ/WRITE of size 4 at 0x60400000dff8 thread T0
    #0 0x4011b6 in AddressSanitizerDemo::heap_buffer_overflow()
    #1 0x401234 in main
    #2 0x7f8a4a8a9b40 in __libc_start_main

0x60400000dff8 is located 0 bytes to the right of 40-byte region
allocated by thread T0 here:
    #0 0x7f8a4a8a9c40 in operator new[](unsigned long)
    #1 0x4011a6 in AddressSanitizerDemo::heap_buffer_overflow()
*/
```

### 3.2 AddressSanitizer 고급 설정

```c++
// asan_advanced_config.cpp
#include <iostream>
#include <cstdlib>

class ASanAdvancedConfig {
public:
    static void configure_asan() {
        /*
        환경변수로 ASan 설정:
        
        1. ASAN_OPTIONS="detect_leaks=1"  
           - 메모리 누수 탐지 (기본값)
           
        2. ASAN_OPTIONS="abort_on_error=1"
           - 오류 발견 시 즉시 중단
           
        3. ASAN_OPTIONS="halt_on_error=0"
           - 첫 오류 후에도 계속 실행
           
        4. ASAN_OPTIONS="check_initialization_order=1"
           - 전역 변수 초기화 순서 체크
           
        5. ASAN_OPTIONS="strict_init_order=1"
           - 엄격한 초기화 순서 체크
           
        6. ASAN_OPTIONS="detect_stack_use_after_return=1"
           - 스택 use-after-return 탐지 (느려짐)
           
        7. ASAN_OPTIONS="symbolize=1"
           - 심볼 정보 출력
           
        8. ASAN_OPTIONS="print_stacktrace=1"
           - 스택 트레이스 출력
        */
        
        // 런타임에서 설정 가능한 옵션들
        std::cout << "ASan 고급 설정 옵션들:\n";
        std::cout << "1. 메모리 누수 탐지: detect_leaks\n";
        std::cout << "2. 스택 보호: detect_stack_use_after_return\n";
        std::cout << "3. 초기화 순서: check_initialization_order\n";
    }
    
    // 컴파일 타임 옵션
    static void compile_time_options() {
        /*
        컴파일러 플래그:
        
        1. -fsanitize=address
           - 기본 AddressSanitizer
           
        2. -fsanitize-address-use-after-scope
           - 스코프 밖 사용 탐지
           
        3. -fno-omit-frame-pointer
           - 프레임 포인터 유지 (스택 트레이스용)
           
        4. -O1 또는 -O2
           - 적절한 최적화 (-O0는 너무 느림, -O3는 디버그 정보 손실)
           
        5. -g
           - 디버그 정보 포함
           
        예시:
        g++ -fsanitize=address -fsanitize-address-use-after-scope \
            -fno-omit-frame-pointer -g -O1 program.cpp
        */
    }
    
    // ASan과 다른 도구 조합
    static void tool_combinations() {
        /*
        1. ASan + UBSan (Undefined Behavior Sanitizer)
        g++ -fsanitize=address,undefined program.cpp
        
        2. ASan + TSan (Thread Sanitizer) - 동시 사용 불가
        // 각각 따로 실행해야 함
        
        3. ASan + MSan (Memory Sanitizer) - 동시 사용 불가
        // 각각 따로 실행해야 함
        
        4. ASan + Valgrind - 동시 사용 불가
        // ASan이 더 빠르므로 보통 ASan 사용
        */
    }
};

// 성능 비교
void performance_comparison() {
    /*
    메모리 디버깅 도구 성능 비교:
    
    1. Valgrind
       - 속도: 10-50배 느림
       - 메모리: 2-4배 더 사용
       - 장점: 가장 정확, 다양한 도구
       - 단점: 매우 느림
    
    2. AddressSanitizer
       - 속도: 2-3배 느림
       - 메모리: 2-3배 더 사용
       - 장점: 빠름, 컴파일타임 통합
       - 단점: 일부 오류만 탐지
    
    3. 선택 가이드:
       - 개발 중: ASan (빠른 피드백)
       - QA/테스트: Valgrind (완전한 검사)
       - CI/CD: ASan (빠른 실행)
       - 프로덕션: 둘 다 사용 안 함 (성능 저하)
    */
}
```

## 4. Java 메모리 프로파일링 완전 정복

### 4.1 JVM 내장 도구들

```java
// JavaMemoryProfiling.java
import java.lang.management.*;
import java.util.concurrent.*;
import javax.management.MBeanServer;

public class JavaMemoryProfiling {
    
    // 1. 힙 덤프 생성
    public static void createHeapDump() {
        try {
            // 명령행 도구 사용
            // $ jmap -dump:format=b,file=heap.hprof [pid]
            // $ jhat heap.hprof  // 웹 인터페이스로 분석
            
            // 프로그래밍적으로 덤프 생성
            MBeanServer server = ManagementFactory.getPlatformMBeanServer();
            
            // HotSpot 전용 MBean 사용
            HotSpotDiagnosticMXBean diagnosticBean = 
                ManagementFactory.newPlatformMXBeanProxy(
                    server, 
                    "com.sun.management:type=HotSpotDiagnostic",
                    HotSpotDiagnosticMXBean.class
                );
            
            String heapDumpPath = "/tmp/heap_" + System.currentTimeMillis() + ".hprof";
            diagnosticBean.dumpHeap(heapDumpPath, true); // true = live objects only
            
            System.out.println("Heap dump created: " + heapDumpPath);
            
        } catch (Exception e) {
            System.err.println("Failed to create heap dump: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    // 2. GC 통계 모니터링
    public static void monitorGCStats() {
        // jstat 명령어로 실시간 GC 통계
        /*
        $ jstat -gcutil [pid] 1000  // 1초마다 출력
        
        출력 컬럼 설명:
        S0     - Survivor 0 사용률 (%)
        S1     - Survivor 1 사용률 (%)
        E      - Eden 사용률 (%)
        O      - Old Generation 사용률 (%)
        M      - Metaspace 사용률 (%)
        CCS    - Compressed Class Space 사용률 (%)
        YGC    - Young GC 횟수
        YGCT   - Young GC 총 시간 (초)
        FGC    - Full GC 횟수
        FGCT   - Full GC 총 시간 (초)
        GCT    - 전체 GC 시간 (초)
        
        예시 출력:
        S0     S1     E      O      M     CCS    YGC     YGCT    FGC    FGCT     GCT
        0.00  95.89  57.78  24.32  98.04  96.95    456    3.234     2    0.122    3.356
        */
        
        // 프로그래밍적으로 GC 정보 얻기
        for (GarbageCollectorMXBean gcBean : ManagementFactory.getGarbageCollectorMXBeans()) {
            System.out.printf("GC %s: %d collections, %d ms total\n",
                gcBean.getName(),
                gcBean.getCollectionCount(),
                gcBean.getCollectionTime()
            );
        }
    }
    
    // 3. Java Flight Recorder (JFR)
    public static void startJavaFlightRecorder() {
        /*
        JVM 옵션으로 시작:
        -XX:+FlightRecorder
        -XX:StartFlightRecording=duration=60s,filename=recording.jfr,settings=profile
        
        또는 런타임에 시작:
        */
        
        try {
            ProcessBuilder pb = new ProcessBuilder(
                "jcmd", 
                String.valueOf(ProcessHandle.current().pid()),
                "JFR.start",
                "duration=60s",
                "filename=/tmp/flight_recording.jfr",
                "settings=profile"  // 또는 default
            );
            
            Process process = pb.start();
            int exitCode = process.waitFor();
            
            if (exitCode == 0) {
                System.out.println("JFR recording started successfully");
            } else {
                System.err.println("Failed to start JFR recording");
            }
            
        } catch (Exception e) {
            System.err.println("Error starting JFR: " + e.getMessage());
        }
        
        /*
        JFR 분석 도구:
        1. JDK Mission Control (JMC) - GUI 도구
        2. jfr 명령어 도구 (JDK 14+)
        3. FlameGraph 생성
        
        JFR로 얻을 수 있는 정보:
        - 메모리 할당 패턴
        - GC 이벤트 상세 정보
        - CPU 프로파일링
        - 스레드 덤프
        - I/O 이벤트
        - 클래스 로딩
        */
    }
    
    // 4. Eclipse Memory Analyzer (MAT) 활용
    public static void analyzeWithMAT() {
        /*
        MAT에서 찾는 핵심 정보들:
        
        1. Dominator Tree
           - 가장 많은 메모리를 점유하는 객체 트리
           - 루트 객체 삭제 시 해제되는 메모리량 표시
        
        2. Leak Suspects Report
           - 자동으로 메모리 누수 의심 객체 탐지
           - 큰 객체와 그 참조 관계 분석
        
        3. Path to GC Roots
           - 특정 객체가 왜 GC되지 않는지 추적
           - 참조 체인을 통한 근본 원인 파악
        
        4. Duplicate Classes
           - 같은 클래스가 여러 ClassLoader에 로드되었는지 확인
           - ClassLoader 누수 탐지
        
        5. Top Components
           - 메모리 점유량 기준 상위 컴포넌트
           - 패키지별, 클래스별 메모리 사용량
        
        MAT 사용 팁:
        - 힙 덤프는 라이브 객체만 (jmap -dump:live)
        - 비교 분석을 위해 여러 시점의 덤프 생성
        - OQL(Object Query Language) 활용한 고급 쿼리
        */
        
        System.out.println("MAT 분석 체크리스트:");
        System.out.println("1. Leak Suspects - 자동 탐지된 누수 의심 객체");
        System.out.println("2. Dominator Tree - 메모리 점유량 순 객체 트리");
        System.out.println("3. Histogram - 클래스별 인스턴스 개수/크기");
        System.out.println("4. Top Consumers - 최대 메모리 소비자");
        System.out.println("5. Duplicate Classes - ClassLoader 문제 탐지");
    }
    
    // 5. 실시간 메모리 모니터링
    public static class MemoryMonitor {
        private final ScheduledExecutorService scheduler;
        private final MemoryMXBean memoryBean;
        private final long warningThreshold;
        private final long criticalThreshold;
        
        public MemoryMonitor(double warningPercent, double criticalPercent) {
            this.scheduler = Executors.newScheduledThreadPool(1);
            this.memoryBean = ManagementFactory.getMemoryMXBean();
            
            long maxHeap = memoryBean.getHeapMemoryUsage().getMax();
            this.warningThreshold = (long) (maxHeap * warningPercent);
            this.criticalThreshold = (long) (maxHeap * criticalPercent);
        }
        
        public void startMonitoring(int intervalSeconds) {
            scheduler.scheduleAtFixedRate(this::checkMemoryUsage, 
                0, intervalSeconds, TimeUnit.SECONDS);
        }
        
        private void checkMemoryUsage() {
            MemoryUsage heapUsage = memoryBean.getHeapMemoryUsage();
            MemoryUsage nonHeapUsage = memoryBean.getNonHeapMemoryUsage();
            
            long heapUsed = heapUsage.getUsed();
            long heapMax = heapUsage.getMax();
            long nonHeapUsed = nonHeapUsage.getUsed();
            
            double heapPercent = (double) heapUsed / heapMax * 100;
            
            System.out.printf("[%s] Heap: %d/%d MB (%.1f%%), Non-Heap: %d MB\n",
                new java.util.Date(),
                heapUsed / 1024 / 1024,
                heapMax / 1024 / 1024,
                heapPercent,
                nonHeapUsed / 1024 / 1024
            );
            
            // 경고 및 대응
            if (heapUsed > criticalThreshold) {
                System.err.println("CRITICAL: Heap usage > " + (criticalThreshold * 100 / heapMax) + "%!");
                createHeapDump();
                
                // 추가 대응 (선택사항)
                // - 알림 발송
                // - 긴급 GC 수행
                // - 서비스 일시 중단
                
            } else if (heapUsed > warningThreshold) {
                System.out.println("WARNING: Heap usage > " + (warningThreshold * 100 / heapMax) + "%");
                
                // 예방적 조치
                System.gc();  // 권장하지 않지만 긴급시
            }
        }
        
        public void shutdown() {
            scheduler.shutdown();
        }
    }
    
    // 메인 데모
    public static void main(String[] args) throws InterruptedException {
        System.out.println("=== Java 메모리 프로파일링 데모 ===");
        
        // 1. 현재 메모리 상태
        MemoryUsage heap = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
        System.out.printf("Initial Heap: %d MB used / %d MB max\n",
            heap.getUsed() / 1024 / 1024,
            heap.getMax() / 1024 / 1024
        );
        
        // 2. GC 통계
        monitorGCStats();
        
        // 3. 실시간 모니터링 시작 (80% 경고, 90% 위험)
        MemoryMonitor monitor = new MemoryMonitor(0.8, 0.9);
        monitor.startMonitoring(5);  // 5초마다 체크
        
        // 4. 메모리 부하 시뮬레이션
        System.out.println("\n메모리 부하 시뮬레이션 시작...");
        
        // 대용량 객체 생성으로 메모리 부하
        java.util.List<byte[]> memoryHog = new java.util.ArrayList<>();
        try {
            for (int i = 0; i < 100; i++) {
                memoryHog.add(new byte[10 * 1024 * 1024]); // 10MB씩
                Thread.sleep(1000);
                
                if (i % 10 == 0) {
                    System.out.printf("할당된 객체: %d개 (약 %d MB)\n", 
                        memoryHog.size(), memoryHog.size() * 10);
                }
            }
        } catch (OutOfMemoryError e) {
            System.err.println("OutOfMemoryError 발생!");
        } finally {
            // 정리
            memoryHog.clear();
            System.gc();
            monitor.shutdown();
        }
    }
}

// HotSpot 진단 MBean 인터페이스 (참고용)
interface HotSpotDiagnosticMXBean {
    void dumpHeap(String outputFile, boolean live);
    // ... 기타 메서드들
}
```

### 4.2 고급 메모리 분석 기법

```java
// AdvancedMemoryAnalysis.java
import java.lang.ref.*;
import java.util.concurrent.*;
import java.util.*;

public class AdvancedMemoryAnalysis {
    
    // 1. 메모리 누수 시뮬레이션 및 탐지
    public static class MemoryLeakSimulator {
        private static final Map<String, Object> GLOBAL_CACHE = new ConcurrentHashMap<>();
        private static final List<WeakReference<Object>> WEAK_REFS = new ArrayList<>();
        
        // 의도적인 메모리 누수 생성
        public void createLeak(String type) {
            switch (type.toLowerCase()) {
                case "collection":
                    createCollectionLeak();
                    break;
                case "listener":
                    createListenerLeak();
                    break;
                case "threadlocal":
                    createThreadLocalLeak();
                    break;
                case "classloader":
                    createClassLoaderLeak();
                    break;
            }
        }
        
        private void createCollectionLeak() {
            for (int i = 0; i < 10000; i++) {
                GLOBAL_CACHE.put("key_" + i, new byte[1024]); // 1KB씩
            }
            System.out.println("Collection leak created: " + GLOBAL_CACHE.size() + " objects");
        }
        
        private void createListenerLeak() {
            // 이벤트 리스너가 해제되지 않는 상황
            EventBus eventBus = EventBus.getInstance();
            
            for (int i = 0; i < 1000; i++) {
                final int id = i;
                eventBus.addListener(new EventListener() {
                    private final byte[] data = new byte[10240]; // 10KB
                    
                    @Override
                    public void onEvent(Event e) {
                        // 처리 로직
                    }
                });
            }
            System.out.println("Listener leak created: 1000 listeners");
        }
        
        private static final ThreadLocal<byte[]> THREAD_LOCAL_DATA = new ThreadLocal<>();
        
        private void createThreadLocalLeak() {
            // ThreadLocal이 정리되지 않는 상황
            ExecutorService executor = Executors.newFixedThreadPool(10);
            
            for (int i = 0; i < 100; i++) {
                executor.submit(() -> {
                    THREAD_LOCAL_DATA.set(new byte[100 * 1024]); // 100KB
                    // THREAD_LOCAL_DATA.remove() 호출 없음!
                    
                    try {
                        Thread.sleep(100);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
            }
            
            System.out.println("ThreadLocal leak created: 100 thread-local objects");
        }
        
        private void createClassLoaderLeak() {
            try {
                // 커스텀 ClassLoader 생성
                for (int i = 0; i < 10; i++) {
                    CustomClassLoader loader = new CustomClassLoader();
                    Class<?> clazz = loader.loadClass("java.lang.String");
                    GLOBAL_CACHE.put("class_" + i, clazz); // Class 객체 캐싱
                }
                System.out.println("ClassLoader leak created: 10 class loaders");
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
    
    // 2. WeakReference를 이용한 메모리 누수 탐지
    public static class LeakDetector {
        private final Map<String, WeakReference<Object>> trackedObjects = new ConcurrentHashMap<>();
        private final ReferenceQueue<Object> referenceQueue = new ReferenceQueue<>();
        private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        
        public void startTracking(String id, Object obj) {
            WeakReference<Object> ref = new WeakReference<>(obj, referenceQueue);
            trackedObjects.put(id, ref);
        }
        
        public void startLeakDetection(int checkIntervalMinutes) {
            scheduler.scheduleAtFixedRate(this::checkForLeaks, 
                checkIntervalMinutes, checkIntervalMinutes, TimeUnit.MINUTES);
        }
        
        private void checkForLeaks() {
            // 참조 큐에서 GC된 객체들 제거
            Reference<?> ref;
            while ((ref = referenceQueue.poll()) != null) {
                trackedObjects.values().remove(ref);
            }
            
            // 여전히 남아있는 객체들 (잠재적 누수)
            System.out.println("=== 메모리 누수 탐지 결과 ===");
            System.out.println("추적 중인 객체 수: " + trackedObjects.size());
            
            for (Map.Entry<String, WeakReference<Object>> entry : trackedObjects.entrySet()) {
                WeakReference<Object> objRef = entry.getValue();
                if (objRef.get() != null) {
                    System.out.println("잠재적 누수 객체: " + entry.getKey());
                }
            }
        }
        
        public void shutdown() {
            scheduler.shutdown();
        }
    }
    
    // 3. 메모리 사용 패턴 분석
    public static class MemoryUsageAnalyzer {
        private final List<MemorySnapshot> snapshots = new ArrayList<>();
        
        static class MemorySnapshot {
            final long timestamp;
            final long heapUsed;
            final long heapMax;
            final long nonHeapUsed;
            final int threadCount;
            final long gcCount;
            
            MemorySnapshot() {
                this.timestamp = System.currentTimeMillis();
                
                MemoryMXBean memBean = ManagementFactory.getMemoryMXBean();
                MemoryUsage heapUsage = memBean.getHeapMemoryUsage();
                MemoryUsage nonHeapUsage = memBean.getNonHeapMemoryUsage();
                
                this.heapUsed = heapUsage.getUsed();
                this.heapMax = heapUsage.getMax();
                this.nonHeapUsed = nonHeapUsage.getUsed();
                this.threadCount = ManagementFactory.getThreadMXBean().getThreadCount();
                
                long totalGC = 0;
                for (GarbageCollectorMXBean gcBean : ManagementFactory.getGarbageCollectorMXBeans()) {
                    totalGC += gcBean.getCollectionCount();
                }
                this.gcCount = totalGC;
            }
        }
        
        public void takeSnapshot() {
            snapshots.add(new MemorySnapshot());
        }
        
        public void analyzePattern() {
            if (snapshots.size() < 2) {
                System.out.println("분석을 위해 최소 2개 이상의 스냅샷이 필요합니다.");
                return;
            }
            
            System.out.println("=== 메모리 사용 패턴 분석 ===");
            
            MemorySnapshot first = snapshots.get(0);
            MemorySnapshot last = snapshots.get(snapshots.size() - 1);
            
            long timeDiff = last.timestamp - first.timestamp;
            long heapGrowth = last.heapUsed - first.heapUsed;
            long gcIncrease = last.gcCount - first.gcCount;
            
            System.out.printf("분석 기간: %.1f분\n", timeDiff / 60000.0);
            System.out.printf("힙 메모리 증가: %d MB\n", heapGrowth / 1024 / 1024);
            System.out.printf("GC 발생 횟수: %d회\n", gcIncrease);
            System.out.printf("평균 메모리 증가율: %.2f MB/분\n", 
                (heapGrowth / 1024.0 / 1024.0) / (timeDiff / 60000.0));
            
            // 메모리 누수 의심 판정
            if (heapGrowth > 100 * 1024 * 1024 && gcIncrease > 10) {
                System.out.println("⚠️  메모리 누수 의심: 지속적인 메모리 증가와 빈번한 GC 발생");
            } else if (heapGrowth > 500 * 1024 * 1024) {
                System.out.println("⚠️  메모리 누수 의심: 급격한 메모리 증가");
            } else {
                System.out.println("✅ 정상적인 메모리 사용 패턴");
            }
        }
        
        public void printDetailedReport() {
            System.out.println("\n=== 상세 메모리 리포트 ===");
            System.out.printf("%-20s %-10s %-10s %-10s %-8s %-6s\n",
                "시간", "힙사용(MB)", "힙최대(MB)", "비힙(MB)", "스레드", "GC횟수");
            
            for (MemorySnapshot snapshot : snapshots) {
                System.out.printf("%-20s %-10d %-10d %-10d %-8d %-6d\n",
                    new Date(snapshot.timestamp).toString().substring(11, 19),
                    snapshot.heapUsed / 1024 / 1024,
                    snapshot.heapMax / 1024 / 1024,
                    snapshot.nonHeapUsed / 1024 / 1024,
                    snapshot.threadCount,
                    snapshot.gcCount
                );
            }
        }
    }
    
    // 데모 및 테스트
    public static void main(String[] args) throws InterruptedException {
        System.out.println("=== 고급 메모리 분석 데모 ===");
        
        // 1. 누수 탐지기 시작
        LeakDetector detector = new LeakDetector();
        detector.startLeakDetection(1); // 1분마다 체크
        
        // 2. 사용 패턴 분석기 시작
        MemoryUsageAnalyzer analyzer = new MemoryUsageAnalyzer();
        
        // 3. 의도적 메모리 누수 생성
        MemoryLeakSimulator simulator = new MemoryLeakSimulator();
        
        // 초기 스냅샷
        analyzer.takeSnapshot();
        
        // 다양한 누수 패턴 시뮬레이션
        System.out.println("\n1. Collection 누수 시뮬레이션...");
        simulator.createLeak("collection");
        Thread.sleep(5000);
        analyzer.takeSnapshot();
        
        System.out.println("\n2. Listener 누수 시뮬레이션...");
        simulator.createLeak("listener");
        Thread.sleep(5000);
        analyzer.takeSnapshot();
        
        System.out.println("\n3. ThreadLocal 누수 시뮬레이션...");
        simulator.createLeak("threadlocal");
        Thread.sleep(10000); // ThreadLocal 누수는 시간이 걸림
        analyzer.takeSnapshot();
        
        // 분석 결과 출력
        analyzer.analyzePattern();
        analyzer.printDetailedReport();
        
        // 정리
        detector.shutdown();
    }
}

// 지원 클래스들
class EventBus {
    private static final EventBus INSTANCE = new EventBus();
    private final List<EventListener> listeners = new ArrayList<>();
    
    public static EventBus getInstance() { return INSTANCE; }
    
    public void addListener(EventListener listener) {
        listeners.add(listener);
    }
}

interface EventListener {
    void onEvent(Event e);
}

class Event {}

class CustomClassLoader extends ClassLoader {
    // 커스텀 클래스 로더 구현
}
```

## 핵심 요점

### 1. 메모리 누수 탐지의 핵심 원칙

**"패턴을 알면 범인이 보인다"** - 10가지 누수 패턴을 숙지하면 대부분의 누수를 예방할 수 있습니다.

### 2. 도구별 활용 전략

**"상황에 맞는 도구 선택"** - 개발 중에는 ASan, QA에서는 Valgrind, Java는 JFR+MAT 조합이 최적입니다.

### 3. 실시간 모니터링의 중요성

**"예방이 치료보다 낫다"** - 프로덕션에서는 임계값 기반 자동 알림과 힙 덤프 시스템을 구축해야 합니다.

---

**이전**: [메모리 최적화 개요](./09-34-memory-optimization.md)  
**다음**: [Zero-allocation 프로그래밍](./04b-zero-allocation-programming.md)에서 GC 압박을 완전히 제거하는 고급 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 6-8시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-09-advanced-memory-management)

- [Chapter 9-1: 메모리 할당자의 내부 구현 개요](../chapter-08-memory-allocator-gc/09-10-memory-allocator.md)
- [Chapter 9-1A: malloc 내부 동작의 진실](../chapter-08-memory-allocator-gc/09-01-malloc-fundamentals.md)
- [Chapter 9-1B: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](../chapter-08-memory-allocator-gc/09-11-allocator-comparison.md)
- [Chapter 9-1C: 커스텀 메모리 할당자 구현](../chapter-08-memory-allocator-gc/09-12-custom-allocators.md)
- [Chapter 9-1D: 실전 메모리 최적화 사례](./09-30-production-optimization.md)

### 🏷️ 관련 키워드

`memory-leak`, `debugging-tools`, `valgrind`, `address-sanitizer`, `java-profiling`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
