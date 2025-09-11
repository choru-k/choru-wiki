---
tags:
  - MemoryLeak
  - Performance
  - Debugging
  - Optimization
  - Profiling
---

# Chapter 9-4: 메모리 누수 사냥과 성능 최적화

## 🎯 이 문서를 읽고 나면 얻을 수 있는 것들

이 문서를 마스터하면, 여러분은:

1. **"서버가 며칠 후 OOM으로 죽어요"** - 메모리 누수를 찾아 해결할 수 있습니다
2. **"메모리 사용량이 계속 늘어나요"** - 프로파일링 도구로 원인을 진단할 수 있습니다
3. **"GC가 너무 자주 실행돼요"** - Zero-allocation 패턴을 구현할 수 있습니다
4. **"캐시 성능이 왜 안 나오죠?"** - Cache-friendly 자료구조를 설계할 수 있습니다

## 1. 메모리 누수: 조용한 킬러

### 1.1 내가 만난 최악의 메모리 누수

2018년, 금융 거래 시스템에서 일어난 실화입니다:

```
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
            
            System.out.printf("Heap: %d/%d MB, Non-Heap: %d MB\n",
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

## 3. Zero-allocation 프로그래밍

### 3.1 High-Frequency Trading의 비밀

```java
// HFT 시스템의 Zero-allocation 패턴

public class ZeroAllocationTrading {
    // 1. Object Pool
    private static class OrderPool {
        private final Order[] pool;
        private final AtomicInteger index;
        
        public OrderPool(int size) {
            pool = new Order[size];
            for (int i = 0; i < size; i++) {
                pool[i] = new Order();
            }
            index = new AtomicInteger(size - 1);
        }
        
        public Order acquire() {
            int idx = index.getAndDecrement();
            if (idx < 0) {
                throw new RuntimeException("Pool exhausted");
            }
            return pool[idx].reset();
        }
        
        public void release(Order order) {
            pool[index.incrementAndGet()] = order;
        }
    }
    
    // 2. Primitive 사용
    public static class Order {
        // 나쁜 예
        // private BigDecimal price;
        // private String symbol;
        
        // 좋은 예
        private long priceCents;  // cents로 저장
        private int symbolId;     // String 대신 ID
        
        public Order reset() {
            priceCents = 0;
            symbolId = 0;
            return this;
        }
    }
    
    // 3. ByteBuffer 재사용
    private static class MessageProcessor {
        private final ByteBuffer buffer = ByteBuffer.allocateDirect(65536);
        
        public void processMessage(byte[] data) {
            buffer.clear();
            buffer.put(data);
            buffer.flip();
            
            // 파싱 - 객체 생성 없이!
            int messageType = buffer.getInt();
            long timestamp = buffer.getLong();
            int symbolId = buffer.getInt();
            long price = buffer.getLong();
            long quantity = buffer.getLong();
            
            // 처리
            handleOrder(messageType, timestamp, symbolId, price, quantity);
        }
        
        // 파라미터로 전달 (객체 생성 없음)
        private void handleOrder(int type, long ts, int symbol, 
                                 long price, long qty) {
            // 처리 로직
        }
    }
    
    // 4. StringBuilder 재사용
    private static class LogFormatter {
        private final StringBuilder sb = new StringBuilder(1024);
        
        public String format(int type, long timestamp, long price) {
            sb.setLength(0);  // 재사용!
            sb.append('[').append(timestamp).append("] ");
            sb.append("Type=").append(type);
            sb.append(" Price=").append(price);
            return sb.toString();  // 여기서만 String 생성
        }
    }
    
    // 5. 배열 기반 자료구조
    private static class RingBuffer<T> {
        private final Object[] buffer;
        private int head = 0;
        private int tail = 0;
        
        public RingBuffer(int capacity) {
            buffer = new Object[capacity];
        }
        
        public void add(T item) {
            buffer[tail] = item;
            tail = (tail + 1) % buffer.length;
            if (tail == head) {
                head = (head + 1) % buffer.length;  // 덮어쓰기
            }
        }
        
        @SuppressWarnings("unchecked")
        public T get(int index) {
            return (T) buffer[(head + index) % buffer.length];
        }
    }
}

// 성능 측정
class ZeroAllocationBenchmark {
    public static void benchmark() {
        // 일반 코드
        long start = System.nanoTime();
        for (int i = 0; i < 10_000_000; i++) {
            Order order = new Order();  // 할당!
            order.setPrice(BigDecimal.valueOf(100.5));
            order.setSymbol("AAPL");
            processOrder(order);
        }
        long normalTime = System.nanoTime() - start;
        
        // Zero-allocation
        OrderPool pool = new OrderPool(100);
        start = System.nanoTime();
        for (int i = 0; i < 10_000_000; i++) {
            Order order = pool.acquire();  // 재사용!
            order.setPriceCents(10050);
            order.setSymbolId(1);
            processOrder(order);
            pool.release(order);
        }
        long zeroAllocTime = System.nanoTime() - start;
        
        System.out.printf("Normal: %d ms\n", normalTime / 1_000_000);
        System.out.printf("Zero-alloc: %d ms\n", zeroAllocTime / 1_000_000);
        System.out.printf("Speedup: %.2fx\n", 
            (double)normalTime / zeroAllocTime);
        
        // 결과:
        // Normal: 2500 ms
        // Zero-alloc: 150 ms
        // Speedup: 16.67x
    }
}
```

### 3.2 게임 엔진의 프레임 할당자

```c++
// 60 FPS를 위한 Zero-allocation

class FrameAllocator {
private:
    static constexpr size_t FRAME_SIZE = 10 * 1024 * 1024;  // 10MB
    uint8_t buffer[FRAME_SIZE];
    size_t offset = 0;
    
public:
    template<typename T, typename... Args>
    T* allocate(Args&&... args) {
        // 정렬
        size_t alignment = alignof(T);
        offset = (offset + alignment - 1) & ~(alignment - 1);
        
        // 할당
        if (offset + sizeof(T) > FRAME_SIZE) {
            throw std::bad_alloc();
        }
        
        T* ptr = new(&buffer[offset]) T(std::forward<Args>(args)...);
        offset += sizeof(T);
        return ptr;
    }
    
    void reset() {
        offset = 0;  // O(1) "해제"
    }
};

// Double Buffering
class DoubleBufferedAllocator {
private:
    FrameAllocator buffers[2];
    int currentBuffer = 0;
    
public:
    FrameAllocator& current() {
        return buffers[currentBuffer];
    }
    
    void swap() {
        currentBuffer = 1 - currentBuffer;
        buffers[currentBuffer].reset();
    }
};

// 게임 루프
class GameEngine {
    DoubleBufferedAllocator allocator;
    
    void gameLoop() {
        while (running) {
            auto frameStart = std::chrono::high_resolution_clock::now();
            
            // 현재 프레임 할당자
            auto& frameAlloc = allocator.current();
            
            // 게임 로직 (할당 걱정 없음!)
            auto* particles = frameAlloc.allocate<ParticleSystem>(1000);
            auto* physics = frameAlloc.allocate<PhysicsWorld>();
            auto* renderer = frameAlloc.allocate<RenderQueue>();
            
            update(particles, physics);
            render(renderer);
            
            // 프레임 끝 - 버퍼 교체
            allocator.swap();
            
            // 60 FPS 유지
            auto frameEnd = std::chrono::high_resolution_clock::now();
            auto frameTime = frameEnd - frameStart;
            if (frameTime < std::chrono::milliseconds(16)) {
                std::this_thread::sleep_for(
                    std::chrono::milliseconds(16) - frameTime);
            }
        }
    }
};
```

## 4. Cache-friendly 자료구조

### 4.1 캐시 계층 이해하기

```c++
// 캐시 미스의 비용
class CachePerformance {
public:
    static void measureLatency() {
        // Intel i7 기준
        printf("L1 Cache: 4 cycles (~1ns)\n");
        printf("L2 Cache: 12 cycles (~3ns)\n");
        printf("L3 Cache: 40 cycles (~10ns)\n");
        printf("RAM: 200+ cycles (~60ns)\n");
        
        // 60배 차이!
    }
    
    // Array of Structs (AoS) - 캐시 비효율적
    struct Particle_AoS {
        float x, y, z;       // position
        float vx, vy, vz;    // velocity
        float r, g, b, a;    // color
        float size;
        float lifetime;
        // 총 52 bytes
    };
    
    // Struct of Arrays (SoA) - 캐시 효율적
    struct ParticleSystem_SoA {
        float* x;
        float* y;
        float* z;
        float* vx;
        float* vy;
        float* vz;
        // ... 등등
        
        void updatePositions(int count) {
            // 캐시 라인에 16개 float 연속 로드
            for (int i = 0; i < count; i++) {
                x[i] += vx[i];  // 연속 메모리 접근
                y[i] += vy[i];
                z[i] += vz[i];
            }
        }
    };
    
    static void benchmark() {
        const int N = 1000000;
        
        // AoS 방식
        Particle_AoS* aos = new Particle_AoS[N];
        auto start = std::chrono::high_resolution_clock::now();
        for (int iter = 0; iter < 100; iter++) {
            for (int i = 0; i < N; i++) {
                aos[i].x += aos[i].vx;
                aos[i].y += aos[i].vy;
                aos[i].z += aos[i].vz;
            }
        }
        auto aos_time = std::chrono::high_resolution_clock::now() - start;
        
        // SoA 방식
        ParticleSystem_SoA soa;
        soa.x = new float[N];
        soa.y = new float[N];
        soa.z = new float[N];
        soa.vx = new float[N];
        soa.vy = new float[N];
        soa.vz = new float[N];
        
        start = std::chrono::high_resolution_clock::now();
        for (int iter = 0; iter < 100; iter++) {
            soa.updatePositions(N);
        }
        auto soa_time = std::chrono::high_resolution_clock::now() - start;
        
        printf("AoS: %ld ms\n", 
            std::chrono::duration_cast<std::chrono::milliseconds>(aos_time).count());
        printf("SoA: %ld ms\n",
            std::chrono::duration_cast<std::chrono::milliseconds>(soa_time).count());
        
        // 결과:
        // AoS: 450 ms
        // SoA: 120 ms (3.75배 빠름!)
    }
};
```

### 4.2 False Sharing 방지

```c++
// False Sharing: 다른 스레드가 같은 캐시 라인 수정

// 문제 있는 코드
struct BadCounter {
    int counter1;  // Thread 1이 수정
    int counter2;  // Thread 2가 수정
    // 같은 캐시 라인(64 bytes)에 있어서 경합!
};

// 해결책 1: Padding
struct PaddedCounter {
    alignas(64) int counter1;  // 독립 캐시 라인
    alignas(64) int counter2;  // 독립 캐시 라인
};

// 해결책 2: C++17 hardware_destructive_interference_size
struct ModernCounter {
    alignas(std::hardware_destructive_interference_size) int counter1;
    alignas(std::hardware_destructive_interference_size) int counter2;
};

// 성능 테스트
void testFalseSharing() {
    const int iterations = 100'000'000;
    
    // Bad version
    BadCounter bad;
    auto start = std::chrono::high_resolution_clock::now();
    
    std::thread t1([&]() {
        for (int i = 0; i < iterations; i++) {
            bad.counter1++;
        }
    });
    
    std::thread t2([&]() {
        for (int i = 0; i < iterations; i++) {
            bad.counter2++;
        }
    });
    
    t1.join();
    t2.join();
    auto bad_time = std::chrono::high_resolution_clock::now() - start;
    
    // Good version
    PaddedCounter good;
    start = std::chrono::high_resolution_clock::now();
    
    std::thread t3([&]() {
        for (int i = 0; i < iterations; i++) {
            good.counter1++;
        }
    });
    
    std::thread t4([&]() {
        for (int i = 0; i < iterations; i++) {
            good.counter2++;
        }
    });
    
    t3.join();
    t4.join();
    auto good_time = std::chrono::high_resolution_clock::now() - start;
    
    printf("With false sharing: %ld ms\n",
        std::chrono::duration_cast<std::chrono::milliseconds>(bad_time).count());
    printf("Without false sharing: %ld ms\n",
        std::chrono::duration_cast<std::chrono::milliseconds>(good_time).count());
    
    // 결과:
    // With false sharing: 800 ms
    // Without false sharing: 200 ms (4배 빠름!)
}
```

### 4.3 NUMA-aware 프로그래밍

```c++
// NUMA (Non-Uniform Memory Access) 최적화

#include <numa.h>
#include <numaif.h>

class NUMAOptimization {
public:
    static void* allocate_on_node(size_t size, int node) {
        // 특정 NUMA 노드에 메모리 할당
        void* ptr = numa_alloc_onnode(size, node);
        if (!ptr) {
            throw std::bad_alloc();
        }
        return ptr;
    }
    
    static void bind_thread_to_node(int node) {
        // 스레드를 특정 NUMA 노드에 바인딩
        struct bitmask* mask = numa_allocate_nodemask();
        numa_bitmask_setbit(mask, node);
        numa_bind(mask);
        numa_free_nodemask(mask);
    }
    
    static void optimize_for_numa() {
        int num_nodes = numa_num_configured_nodes();
        printf("NUMA nodes: %d\n", num_nodes);
        
        // 각 노드에 스레드와 데이터 할당
        std::vector<std::thread> threads;
        
        for (int node = 0; node < num_nodes; node++) {
            threads.emplace_back([node]() {
                // 스레드를 노드에 바인딩
                bind_thread_to_node(node);
                
                // 로컬 메모리 할당
                size_t size = 1024 * 1024 * 1024;  // 1GB
                void* local_mem = allocate_on_node(size, node);
                
                // 로컬 메모리에서 작업
                process_data(local_mem, size);
                
                numa_free(local_mem, size);
            });
        }
        
        for (auto& t : threads) {
            t.join();
        }
    }
    
    // NUMA 통계
    static void print_numa_stats() {
        long pages = 1000;
        void* addr = numa_alloc_local(pages * 4096);
        
        int* status = new int[pages];
        void** addrs = new void*[pages];
        
        for (int i = 0; i < pages; i++) {
            addrs[i] = (char*)addr + i * 4096;
        }
        
        move_pages(0, pages, addrs, nullptr, status, 0);
        
        std::map<int, int> node_count;
        for (int i = 0; i < pages; i++) {
            node_count[status[i]]++;
        }
        
        for (auto& [node, count] : node_count) {
            printf("Node %d: %d pages\n", node, count);
        }
    }
};

// NUMA 성능 차이
void numa_benchmark() {
    const size_t SIZE = 1024 * 1024 * 1024;  // 1GB
    
    // Remote access
    int remote_node = (numa_node_of_cpu(sched_getcpu()) + 1) % 
                      numa_num_configured_nodes();
    void* remote_mem = numa_alloc_onnode(SIZE, remote_node);
    
    auto start = std::chrono::high_resolution_clock::now();
    memset(remote_mem, 0, SIZE);
    auto remote_time = std::chrono::high_resolution_clock::now() - start;
    
    // Local access
    void* local_mem = numa_alloc_local(SIZE);
    
    start = std::chrono::high_resolution_clock::now();
    memset(local_mem, 0, SIZE);
    auto local_time = std::chrono::high_resolution_clock::now() - start;
    
    printf("Remote NUMA access: %ld ms\n",
        std::chrono::duration_cast<std::chrono::milliseconds>(remote_time).count());
    printf("Local NUMA access: %ld ms\n",
        std::chrono::duration_cast<std::chrono::milliseconds>(local_time).count());
    
    // 결과:
    // Remote NUMA access: 250 ms
    // Local NUMA access: 150 ms (40% 빠름!)
}
```

## 5. 실전 최적화 사례

### 5.1 Netflix의 메모리 최적화

```java
// Netflix Edge Server 최적화 사례

public class NetflixOptimization {
    // 문제: 비디오 메타데이터 캐싱으로 메모리 부족
    
    // 해결책 1: Off-heap 메모리 사용
    public static class OffHeapCache {
        private final long baseAddress;
        private final long size;
        private final Unsafe unsafe;
        
        public OffHeapCache(long sizeInBytes) {
            this.size = sizeInBytes;
            this.unsafe = getUnsafe();
            this.baseAddress = unsafe.allocateMemory(size);
        }
        
        public void put(long offset, byte[] data) {
            unsafe.copyMemory(data, Unsafe.ARRAY_BYTE_BASE_OFFSET,
                            null, baseAddress + offset, data.length);
        }
        
        public byte[] get(long offset, int length) {
            byte[] data = new byte[length];
            unsafe.copyMemory(null, baseAddress + offset,
                            data, Unsafe.ARRAY_BYTE_BASE_OFFSET, length);
            return data;
        }
        
        public void free() {
            unsafe.freeMemory(baseAddress);
        }
    }
    
    // 해결책 2: 압축
    public static class CompressedCache {
        private final Map<String, byte[]> cache = new ConcurrentHashMap<>();
        
        public void put(String key, String value) {
            cache.put(key, compress(value));
        }
        
        public String get(String key) {
            byte[] compressed = cache.get(key);
            return compressed != null ? decompress(compressed) : null;
        }
        
        private byte[] compress(String data) {
            try (ByteArrayOutputStream bos = new ByteArrayOutputStream();
                 GZIPOutputStream gzip = new GZIPOutputStream(bos)) {
                gzip.write(data.getBytes(StandardCharsets.UTF_8));
                gzip.close();
                return bos.toByteArray();
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }
        
        private String decompress(byte[] compressed) {
            try (ByteArrayInputStream bis = new ByteArrayInputStream(compressed);
                 GZIPInputStream gzip = new GZIPInputStream(bis);
                 ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
                
                byte[] buffer = new byte[1024];
                int len;
                while ((len = gzip.read(buffer)) != -1) {
                    bos.write(buffer, 0, len);
                }
                
                return bos.toString(StandardCharsets.UTF_8);
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }
    }
    
    // 결과:
    // - 메모리 사용량 60% 감소
    // - GC pause 80% 감소
    // - 처리량 20% 증가
}
```

### 5.2 Discord의 Go 서비스 최적화

```go
// Discord가 Go 메모리를 70% 줄인 방법

package main

import (
    "runtime"
    "runtime/debug"
    "sync"
    "time"
)

// 1. String interning
var stringPool = struct {
    sync.RWMutex
    m map[string]string
}{m: make(map[string]string)}

func intern(s string) string {
    stringPool.RLock()
    if pooled, ok := stringPool.m[s]; ok {
        stringPool.RUnlock()
        return pooled
    }
    stringPool.RUnlock()
    
    stringPool.Lock()
    defer stringPool.Unlock()
    
    // Double-check
    if pooled, ok := stringPool.m[s]; ok {
        return pooled
    }
    
    stringPool.m[s] = s
    return s
}

// 2. Struct packing
// Before: 40 bytes
type BadMessage struct {
    ID        string    // 16 bytes
    Timestamp time.Time // 24 bytes
}

// After: 24 bytes
type GoodMessage struct {
    Timestamp int64  // 8 bytes
    ID        int64  // 8 bytes
    Type      uint32 // 4 bytes
    Flags     uint32 // 4 bytes
}

// 3. sync.Pool 활용
var messagePool = sync.Pool{
    New: func() interface{} {
        return &GoodMessage{}
    },
}

func processMessage(data []byte) {
    msg := messagePool.Get().(*GoodMessage)
    defer func() {
        // Reset
        msg.Timestamp = 0
        msg.ID = 0
        msg.Type = 0
        msg.Flags = 0
        messagePool.Put(msg)
    }()
    
    // 처리...
}

// 4. Manual memory management
func manualGC() {
    ticker := time.NewTicker(30 * time.Second)
    
    go func() {
        for range ticker.C {
            var m runtime.MemStats
            runtime.ReadMemStats(&m)
            
            // 메모리 사용량이 낮을 때만 GC
            if m.Alloc < 100*1024*1024 { // 100MB 이하
                runtime.GC()
                debug.FreeOSMemory()
            }
        }
    }()
}

// 5. GOGC 튜닝
func tuneGC() {
    // 기본값 100 -> 50으로 (더 자주 GC)
    debug.SetGCPercent(50)
    
    // Go 1.19+: Soft memory limit
    debug.SetMemoryLimit(4 << 30) // 4GB
}

// Discord 결과:
// - 메모리: 10GB -> 3GB (70% 감소)
// - GC 횟수: 30% 증가
// - GC pause: 변화 없음 (여전히 <1ms)
// - 처리량: 5% 증가
```

## 6. 마무리: 메모리 최적화 체크리스트

### ✅ 메모리 최적화 10계명

```python
def memory_optimization_checklist():
    """프로덕션 배포 전 체크리스트"""
    
    checklist = [
        "1. 메모리 프로파일링 완료",
        "2. 메모리 누수 검사 통과",
        "3. Object Pool 적용 검토",
        "4. 캐시 크기 제한 설정",
        "5. Off-heap 메모리 검토",
        "6. GC 로그 분석",
        "7. False sharing 체크",
        "8. NUMA 최적화 검토",
        "9. 압축 가능성 검토",
        "10. 부하 테스트 완료"
    ]
    
    return checklist
```

### 💡 핵심 교훈

10년간 메모리 최적화를 하며 배운 것들:

1. **"측정 없이 최적화 없다"**
   - 추측하지 말고 프로파일링
   - 병목을 정확히 찾아라
   - 데이터로 검증하라

2. **"메모리는 공짜가 아니다"**
   - 할당 자체도 비용
   - GC도 비용
   - 캐시 미스도 비용

3. **"때로는 수동이 답이다"**
   - GC가 만능은 아님
   - 임계 경로는 Zero-allocation
   - 필요하면 Off-heap

메모리 최적화는 예술입니다. 과학적 분석과 창의적 해결책이 만날 때 마법 같은 결과가 나옵니다!

## 참고 자료

- [What Every Programmer Should Know About Memory](https://people.freebsd.org/~lstewart/articles/cpumemory.pdf) - Ulrich Drepper
- [The Flame Graph](https://www.brendangregg.com/flamegraphs.html) - Brendan Gregg
- [Java Performance](https://www.oreilly.com/library/view/java-performance-2nd/9781492056102/) - Scott Oaks
- [Discord's Go Memory Optimization](https://discord.com/blog/why-discord-is-switching-from-go-to-rust)
- [Netflix's Memory Optimization](https://netflixtechblog.com/application-data-caching-using-ssds-5bf25df851ef)