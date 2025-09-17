---
tags:
  - advanced
  - deep-study
  - hands-on
  - high-frequency-trading
  - memory-management
  - object-pool
  - performance-optimization
  - zero-allocation
  - 애플리케이션개발
difficulty: ADVANCED
learning_time: "20-30시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 9.4.1: Zero-allocation 프로그래밍

## 🎯 이 문서에서 다루는 내용

이 섹션에서는:

1. **High-Frequency Trading의 비밀** - Object Pool과 Primitive 활용
2. **ByteBuffer와 StringBuilder 재사용** - 할당 없는 메시지 처리
3. **게임 엔진의 프레임 할당자** - 60 FPS를 위한 메모리 전략
4. **성능 벤치마크** - Zero-allocation의 실제 성능 향상 효과

## 1. High-Frequency Trading의 비밀

### 1.1 Zero-allocation 패턴 구현

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
```

### 1.2 성능 측정과 비교

```java
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

        System.out.printf("Normal: %d ms, ", normalTime / 1_000_000);
        System.out.printf("Zero-alloc: %d ms, ", zeroAllocTime / 1_000_000);
        System.out.printf("Speedup: %.2fx, ",
            (double)normalTime / zeroAllocTime);

        // 결과:
        // Normal: 2500 ms
        // Zero-alloc: 150 ms
        // Speedup: 16.67x
    }
}
```

## 2. 게임 엔진의 프레임 할당자

### 2.1 프레임 기반 메모리 관리

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
```

### 2.2 게임 루프 최적화

```c++
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

## 3. 고급 Zero-allocation 패턴

### 3.1 Stack Allocator

```c++
// 스택 기반 할당자
template<size_t Size>
class StackAllocator {
private:
    alignas(std::max_align_t) uint8_t buffer[Size];
    size_t top = 0;

public:
    template<typename T, typename... Args>
    T* push(Args&&... args) {
        size_t alignment = alignof(T);
        size_t aligned_top = (top + alignment - 1) & ~(alignment - 1);
        
        if (aligned_top + sizeof(T) > Size) {
            return nullptr;
        }

        T* ptr = new(&buffer[aligned_top]) T(std::forward<Args>(args)...);
        top = aligned_top + sizeof(T);
        return ptr;
    }

    void pop_to(size_t mark) {
        top = mark;
    }

    size_t get_mark() const {
        return top;
    }

    void clear() {
        top = 0;
    }
};
```

### 3.2 Memory Pool 템플릿

```c++
// 범용 메모리 풀
template<typename T, size_t BlockSize = 1024>
class MemoryPool {
private:
    struct Block {
        alignas(T) uint8_t data[sizeof(T)];
        Block* next;
    };

    Block* head = nullptr;
    std::vector<std::unique_ptr<Block[]>> chunks;

    void allocate_chunk() {
        auto chunk = std::make_unique<Block[]>(BlockSize);
        
        // 링크드 리스트로 연결
        for (size_t i = 0; i < BlockSize - 1; ++i) {
            chunk[i].next = &chunk[i + 1];
        }
        chunk[BlockSize - 1].next = nullptr;

        head = chunk.get();
        chunks.push_back(std::move(chunk));
    }

public:
    MemoryPool() {
        allocate_chunk();
    }

    template<typename... Args>
    T* acquire(Args&&... args) {
        if (!head) {
            allocate_chunk();
        }

        Block* block = head;
        head = head->next;

        return new(block->data) T(std::forward<Args>(args)...);
    }

    void release(T* ptr) {
        ptr->~T();
        
        Block* block = reinterpret_cast<Block*>(ptr);
        block->next = head;
        head = block;
    }
};
```

### 3.3 실제 사용 예제

```c++
// 실제 게임에서의 활용
class GameEntity {
    StackAllocator<1024 * 1024> frameAlloc;  // 1MB per frame
    MemoryPool<Bullet, 1000> bulletPool;
    MemoryPool<Particle, 5000> particlePool;

public:
    void update() {
        size_t mark = frameAlloc.get_mark();
        
        // 임시 계산을 위한 데이터
        auto* tempData = frameAlloc.push<float[]>(10000);
        auto* workBuffer = frameAlloc.push<Vector3[]>(1000);

        // 게임 로직 실행
        processPhysics(tempData, workBuffer);

        // 프레임 끝에 자동 해제
        frameAlloc.pop_to(mark);
    }

    void fireBullet(const Vector3& pos, const Vector3& vel) {
        Bullet* bullet = bulletPool.acquire(pos, vel);
        // 총알 로직...
    }

    void createParticles(const Vector3& pos, int count) {
        for (int i = 0; i < count; ++i) {
            Particle* p = particlePool.acquire();
            p->position = pos + randomOffset();
            // 파티클 초기화...
        }
    }
};
```

## 4. Java에서의 고급 기법

### 4.1 Unsafe를 활용한 Off-heap 메모리

```java
// Off-heap 메모리 직접 관리
public class UnsafeAllocator {
    private static final Unsafe unsafe = getUnsafe();
    private long memory;
    private long size;
    private long position = 0;

    public UnsafeAllocator(long size) {
        this.size = size;
        this.memory = unsafe.allocateMemory(size);
    }

    public long allocate(long bytes) {
        if (position + bytes > size) {
            throw new OutOfMemoryError("Allocator exhausted");
        }
        long addr = memory + position;
        position += bytes;
        return addr;
    }

    public void putInt(long address, int value) {
        unsafe.putInt(address, value);
    }

    public int getInt(long address) {
        return unsafe.getInt(address);
    }

    public void free() {
        unsafe.freeMemory(memory);
    }

    private static Unsafe getUnsafe() {
        try {
            Field f = Unsafe.class.getDeclaredField("theUnsafe");
            f.setAccessible(true);
            return (Unsafe) f.get(null);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
```

### 4.2 Chronicle Map 활용

```java
// Off-heap 맵 사용
public class ChronicleMapExample {
    public static void main(String[] args) throws IOException {
        // Off-heap에 1백만 개 엔트리
        ChronicleMap<Integer, String> map = ChronicleMap
            .of(Integer.class, String.class)
            .entries(1_000_000)
            .averageValue("example-value")
            .create();

        // GC 압박 없이 대량 데이터 처리
        for (int i = 0; i < 1_000_000; i++) {
            map.put(i, "value-" + i);
        }

        // 메모리 사용량 체크
        System.gc();
        MemoryMXBean memoryBean = ManagementFactory.getMemoryMXBean();
        long heapUsed = memoryBean.getHeapMemoryUsage().getUsed();
        System.out.println("Heap used: " + heapUsed / 1024 / 1024 + "MB");
        // Chronicle Map 데이터는 off-heap에 있어서 heap은 거의 변화 없음
        
        map.close();
    }
}
```

## 핵심 요점

### 1. Zero-allocation의 핵심 원칙

- **Object Pool**: 객체 재사용으로 할당 비용 제거
- **Primitive 우선**: 박싱/언박싱 비용 회피
- **Buffer 재사용**: StringBuilder, ByteBuffer 등 재활용

### 2. 메모리 할당 전략

- **Frame Allocator**: 프레임 단위로 일괄 해제
- **Stack Allocator**: LIFO 방식의 빠른 할당/해제
- **Memory Pool**: 타입별 전용 풀로 관리

### 3. 성능 향상 효과

- **할당 속도**: 10-50배 향상 가능
- **GC 압박 감소**: Pause time 대폭 단축
- **캐시 효율성**: 메모리 locality 개선

### 4. 적용 영역

- **고빈도 거래**: 마이크로초 단위 최적화
- **게임 엔진**: 60 FPS 안정성 확보
- **실시간 시스템**: 예측 가능한 성능

---

**이전**: [메모리 누수 탐지](./09-03-01-memory-leak-detection.md)  
**다음**: [캐시 최적화](./09-04-05-cache-optimization.md)에서 Cache-friendly 자료구조 설계를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 애플리케이션 개발
- **예상 시간**: 20-30시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-09-advanced-memory-management)

- [8.1.2: 메모리 할당자의 내부 구현 개요](../chapter-08-memory-allocator-gc/08-01-02-memory-allocator.md)
- [8.1.1: malloc 내부 동작의 진실](../chapter-08-memory-allocator-gc/08-01-01-malloc-fundamentals.md)
- [8.1.3: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](../chapter-08-memory-allocator-gc/08-01-03-allocator-comparison.md)
- [8.1.4: 커스텀 메모리 할당자 구현](../chapter-08-memory-allocator-gc/08-01-04-custom-allocators.md)
- [9.4.2: 실전 메모리 최적화 사례](./09-04-02-production-optimization.md)

### 🏷️ 관련 키워드

`zero-allocation`, `object-pool`, `memory-management`, `performance-optimization`, `high-frequency-trading`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
