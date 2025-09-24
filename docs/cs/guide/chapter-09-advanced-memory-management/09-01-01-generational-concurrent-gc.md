---
tags:
  - advanced
  - balanced
  - cms-collector
  - concurrent-gc
  - deep-study
  - generational-gc
  - tri-color-marking
  - write-barrier
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 9.1.1: 세대별 동시 실행 GC

"대부분의 객체는 젊어서 죽는다"는 관찰이 GC 성능을 혁신적으로 개선시켰고, "Stop-the-world 없이도 GC가 가능하다"는 발견이 현대 실시간 시스템을 가능하게 만들었습니다.

## 1. 세대별 GC (Generational GC)

### 1.1 Weak Generational Hypothesis

1984년, David Ungar의 관찰:

> "대부분의 객체는 젊어서 죽는다" (Infant mortality)

실제 측정 결과:

- 80-98%의 객체가 첫 GC 전에 죽음
- 살아남은 객체는 오래 삶
- 오래된 객체가 젊은 객체를 참조하는 경우는 드물다

```java
// 실제 코드에서의 객체 수명 패턴
public void processRequest(Request req) {
    // 임시 객체들 (99% 즉시 죽음)
    String temp = req.getHeader("User-Agent");
    Map<String, String> params = parseParams(req);
    List<String> tokens = tokenize(params.get("query"));

    // 처리...

    // 메서드 끝 = 모든 임시 객체 죽음
}

// vs 오래 사는 객체
public class Application {
    // 애플리케이션 생명주기 동안 살아있음
    private static final Logger logger = LoggerFactory.getLogger();
    private final Database db = new Database();
    private final Cache cache = new Cache(1000);
}
```

### 1.2 Generational GC 구현

```c++
// 세대별 GC 구현
class GenerationalGC {
private:
    // Young Generation (Eden + Survivor)
    struct YoungGen {
        uint8_t* eden;           // 새 객체 할당
        uint8_t* survivor_from;  // 생존자 공간 1
        uint8_t* survivor_to;    // 생존자 공간 2
        size_t eden_size;
        size_t survivor_size;
        uint8_t* allocation_ptr;
    } young;

    // Old Generation
    struct OldGen {
        uint8_t* space;
        size_t size;
        std::vector<Object*> objects;
    } old;

    // Write Barrier를 위한 Card Table
    static constexpr size_t CARD_SIZE = 512;  // 512 바이트
    uint8_t* card_table;  // 각 카드의 dirty 여부

    struct Object {
        uint8_t age;  // 몇 번 살아남았는지
        bool marked;
        size_t size;
        std::vector<Object**> references;
    };

public:
    void* allocate(size_t size) {
        // Fast path: Eden에 할당
        if (young.allocation_ptr + size <= young.eden + young.eden_size) {
            void* ptr = young.allocation_ptr;
            young.allocation_ptr += size;
            return ptr;
        }

        // Eden이 가득 참 -> Minor GC
        minor_gc();

        // 재시도
        if (young.allocation_ptr + size <= young.eden + young.eden_size) {
            void* ptr = young.allocation_ptr;
            young.allocation_ptr += size;
            return ptr;
        }

        // 큰 객체는 바로 Old로
        return allocate_in_old(size);
    }

    void minor_gc() {
        printf("Minor GC 시작 (Young Generation만)\n");
        auto start = high_resolution_clock::now();

        // 1. Root set + Old->Young 참조 스캔
        std::vector<Object*> roots = get_roots();
        add_old_to_young_refs(roots);  // Card table 활용

        // 2. Eden + Survivor From -> Survivor To 복사
        for (auto root : roots) {
            copy_young_object(root);
        }

        // 3. 나이 든 객체는 Old로 승격 (Promotion)
        promote_old_objects();

        // 4. 공간 정리
        memset(young.eden, 0, young.eden_size);
        memset(young.survivor_from, 0, young.survivor_size);
        std::swap(young.survivor_from, young.survivor_to);
        young.allocation_ptr = young.eden;

        auto end = high_resolution_clock::now();
        auto duration = duration_cast<microseconds>(end - start);
        printf("Minor GC 완료: %ld μs\n", duration.count());
        // 보통 1-10ms (매우 빠름!)
    }

    void major_gc() {
        printf("Major GC 시작 (전체 힙)\n");
        // Mark & Sweep 또는 Mark & Compact
        // 훨씬 느림 (100ms - 1s)
    }

    // Write Barrier: Old->Young 참조 추적
    void write_barrier(Object**field, Object* new_value) {
        *field = new_value;

        // Old 객체가 Young 객체를 참조하게 됨?
        if (is_in_old(field) && is_in_young(new_value)) {
            // Card를 dirty로 표시
            size_t card_index = ((uint8_t*)field - old.space) / CARD_SIZE;
            card_table[card_index] = 1;  // dirty
        }
    }

private:
    void add_old_to_young_refs(std::vector<Object*>& roots) {
        // Dirty card만 스캔 (효율적!)
        for (size_t i = 0; i < old.size / CARD_SIZE; i++) {
            if (card_table[i]) {
                scan_card(i, roots);
                card_table[i] = 0;  // clean
            }
        }
    }
};

// 실제 성능 비교
void benchmark_generational_gc() {
    // 시나리오: 웹 서버 (요청당 많은 임시 객체)

    // Non-generational GC
    BasicGC basic_gc;
    auto start = high_resolution_clock::now();
    simulate_web_server(&basic_gc, 10000);
    auto basic_time = high_resolution_clock::now() - start;

    // Generational GC
    GenerationalGC gen_gc;
    start = high_resolution_clock::now();
    simulate_web_server(&gen_gc, 10000);
    auto gen_time = high_resolution_clock::now() - start;

    printf("Basic GC: %ld ms\n",
           duration_cast<milliseconds>(basic_time).count());
    printf("Generational GC: %ld ms\n",
           duration_cast<milliseconds>(gen_time).count());

    // 결과:
    // Basic GC: 5000 ms (매번 전체 힙 스캔)
    // Generational GC: 500 ms (10배 빠름!)
}
```

## 2. Concurrent GC: Stop-the-world 제거하기

### 2.1 Tri-color Marking

Dijkstra가 1978년에 제안한 방법:

```c++
// Tri-color Marking - Dijkstra의 동시 실행 가능한 표시 알고리즘
enum Color {
    WHITE,  // 미방문 상태 (쓰레기 후보, 아직 탐색되지 않음)
    GRAY,   // 방문했지만 자식들이 아직 처리되지 않은 상태
    BLACK   // 완전 처리된 상태 (본인과 모든 자식이 처리됨)
};

class TriColorGC {
private:
    struct Object {
        std::atomic<Color> color{WHITE};        // 원자적 색상 (동시 접근 안전)
        size_t size;
        std::vector<Object*> references;
    };

    std::queue<Object*> gray_queue;  // GRAY 객체들의 작업 큐
    std::mutex queue_mutex;          // 큐 동시 접근 보호

public:
    // Concurrent Marking - 애플리케이션 실행 중에도 동시에 수행 가능
    void concurrent_mark() {
        // Phase 1: Root set을 GRAY로 초기화 (탐색 시작점)
        for (auto root : get_roots()) {
            root->color = GRAY;           // "아직 처리할 게 있다" 표시
            gray_queue.push(root);        // 작업 큐에 추가
        }

        // Phase 2: Concurrent marking (핵심! 애플리케이션과 동시 실행)
        while (!gray_queue.empty()) {
            Object* obj;
            {
                // 큐 접근을 위한 임계 영역 (최소화)
                std::lock_guard<std::mutex> lock(queue_mutex);
                if (gray_queue.empty()) break;
                obj = gray_queue.front();
                gray_queue.pop();
            }

            // 현재 객체(GRAY)가 참조하는 모든 객체를 처리
            for (auto ref : obj->references) {
                Color expected = WHITE;
                // 원자적 비교-교환: WHITE면 GRAY로 변경
                if (ref->color.compare_exchange_strong(expected, GRAY)) {
                    gray_queue.push(ref);  // 새로 발견된 객체를 큐에 추가
                }
            }

            // 모든 자식 처리 완료 -> BLACK으로 변경
            obj->color = BLACK;
        }

        // Phase 3: Sweep - WHITE 색상인 객체들만 제거
        sweep_white_objects();
    }

    // Write Barrier (SATB - Snapshot At The Beginning)
    void write_barrier_satb(Object**field, Object* new_value) {
        Object* old_value = *field;

        // 이전 값이 WHITE면 GRAY로 (놓치지 않기 위해)
        if (old_value) {
            Color expected = WHITE;
            if (old_value->color.compare_exchange_strong(expected, GRAY)) {
                std::lock_guard<std::mutex> lock(queue_mutex);
                gray_queue.push(old_value);
            }
        }

        *field = new_value;
    }

    // Incremental Update Barrier (다른 방식)
    void write_barrier_incremental(Object**field, Object* new_value) {
        *field = new_value;

        // Black이 White를 참조하게 되면 Gray로
        Object* container = get_container(field);
        if (container->color == BLACK && new_value && new_value->color == WHITE) {
            new_value->color = GRAY;
            std::lock_guard<std::mutex> lock(queue_mutex);
            gray_queue.push(new_value);
        }
    }
};

// Tri-color Invariant
/*
Strong Invariant: Black 객체는 White 객체를 직접 참조할 수 없다
Weak Invariant: White 객체로 가는 모든 경로에 Gray 객체가 있다

이 불변성을 유지하면 concurrent marking이 안전하다!
*/
```

### 2.2 CMS (Concurrent Mark Sweep)

Java의 CMS collector 구현:

```java
// CMS의 6단계
public class CMSCollector {
    // Phase 1: Initial Mark (STW - 짧음)
    void initialMark() {
        // Root set만 표시 (매우 빠름)
        stopTheWorld();  // 1-10ms
        for (Object root : getRootSet()) {
            root.mark = true;
            graySet.add(root);
        }
        resumeTheWorld();
    }

    // Phase 2: Concurrent Mark (동시 실행)
    void concurrentMark() {
        // 애플리케이션과 동시에 실행
        while (!graySet.isEmpty()) {
            Object obj = graySet.poll();

            for (Object ref : obj.references) {
                if (!ref.mark) {
                    ref.mark = true;
                    graySet.add(ref);
                }
            }

            // Write barrier로 변경 추적
        }
    }

    // Phase 3: Concurrent Preclean (동시 실행)
    void concurrentPreclean() {
        // Dirty card 정리
        for (Card card : dirtyCards) {
            scanCard(card);
        }
    }

    // Phase 4: Remark (STW - 짧음)
    void remark() {
        stopTheWorld();  // 10-50ms
        // Concurrent mark 중 놓친 것들 처리
        processDirtyCards();
        processWeakReferences();
        resumeTheWorld();
    }

    // Phase 5: Concurrent Sweep (동시 실행)
    void concurrentSweep() {
        // 애플리케이션과 동시에 청소
        for (Region region : heap.regions) {
            if (!region.hasLiveObjects()) {
                freeList.add(region);
            }
        }
    }

    // Phase 6: Concurrent Reset
    void concurrentReset() {
        // 다음 GC를 위한 준비
        clearMarkBits();
        resetDataStructures();
    }
}

// CMS의 문제점과 해결
/*
문제 1: Concurrent Mode Failure
- Old Gen이 가득 차서 promotion 실패
- 해결: -XX:CMSInitiatingOccupancyFraction=70 (70%에서 시작)

문제 2: 단편화
- Mark & Sweep이라 단편화 발생
- 해결: G1GC로 전환

문제 3: CPU 사용량
- 동시 실행이라 CPU 더 사용
- 해결: -XX:ConcGCThreads로 스레드 수 조정
*/
```

### 2.3 Write Barrier의 종류와 작동 원리

```c++
// Write Barrier 구현 비교
class WriteBarrierTypes {
public:
    // 1. Generational Write Barrier (Card Marking)
    void generational_write_barrier(Object**field, Object* new_value) {
        *field = new_value;

        // Old -> Young 참조가 생성됨?
        if (is_in_old_generation(field) && 
            is_in_young_generation(new_value)) {
            // Card table에 표시
            mark_card_dirty(get_card(field));
        }
    }

    // 2. SATB Write Barrier (Snapshot At The Beginning)
    void satb_write_barrier(Object**field, Object* new_value) {
        Object* old_value = *field;
        
        // 이전 값을 SATB 큐에 저장 (잃어버리지 않기 위해)
        if (old_value != nullptr && is_concurrent_marking()) {
            satb_queue.enqueue(old_value);
        }
        
        *field = new_value;
    }

    // 3. Incremental Update Write Barrier
    void incremental_write_barrier(Object**field, Object* new_value) {
        *field = new_value;
        
        // Black -> White 참조가 생성됨?
        Object* container = get_containing_object(field);
        if (container->color == BLACK && 
            new_value && new_value->color == WHITE) {
            // 새 값을 gray로 표시
            new_value->color = GRAY;
            marking_queue.enqueue(new_value);
        }
    }

    // 4. Colored Pointer Write Barrier (ZGC style)
    void colored_pointer_write_barrier(Object**field, Object* new_value) {
        // Load barrier에서 처리하므로 write barrier는 간단
        *field = add_color_bits(new_value, current_gc_phase);
    }
};

// 성능 비교
void benchmark_write_barriers() {
    const int iterations = 10000000;
    
    // No barrier
    auto start = steady_clock::now();
    for (int i = 0; i < iterations; i++) {
        simple_assignment();
    }
    auto no_barrier_time = steady_clock::now() - start;
    
    // With write barrier
    start = steady_clock::now();
    for (int i = 0; i < iterations; i++) {
        assignment_with_write_barrier();
    }
    auto with_barrier_time = steady_clock::now() - start;
    
    printf("No barrier: %ld ms\n", 
           duration_cast<milliseconds>(no_barrier_time).count());
    printf("With barrier: %ld ms\n", 
           duration_cast<milliseconds>(with_barrier_time).count());
    
    // 결과: Write barrier 오버헤드는 보통 5-15%
    // 하지만 GC 시간 대폭 단축으로 전체적으로는 성능 향상
}
```

## 핵심 요점

### 1. 세대별 GC의 핵심 통찰

"대부분의 객체는 젊어서 죽는다"는 관찰을 바탕으로 Young Generation에 집중하여 GC 성능을 10배 이상 개선했습니다.

### 2. Concurrent GC의 혁명적 변화

Tri-color marking을 통해 Stop-the-world 시간을 획기적으로 줄였고, 실시간 시스템에서도 GC 사용을 가능하게 만들었습니다.

### 3. Write Barrier의 중요성

GC의 정확성과 성능을 보장하기 위해 객체 참조 변경을 추적하는 Write Barrier가 핵심 역할을 합니다.

---

**이전**: [GC 역사와 기초](../chapter-08-memory-allocator-gc/08-02-02-gc-history-basics.md)  
**다음**: [현대적 GC 알고리즘](../chapter-08-memory-allocator-gc/08-02-05-modern-gc-algorithms.md)에서 G1GC, ZGC, Shenandoah 등 현대적 GC를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: ADVANCED
-**주제**: 시스템 프로그래밍
-**예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-09-advanced-memory-management)

- [Chapter 8-1: 메모리 할당자의 내부 구현 개요](../chapter-08-memory-allocator-gc/08-01-02-memory-allocator.md)
- [Chapter 8-1A: malloc 내부 동작의 진실](../chapter-08-memory-allocator-gc/08-01-01-malloc-fundamentals.md)
- [Chapter 8-1B: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](../chapter-08-memory-allocator-gc/08-01-03-allocator-comparison.md)
- [Chapter 8-1C: 커스텀 메모리 할당자 구현](../chapter-08-memory-allocator-gc/08-01-04-custom-allocators.md)
- [9.4.2: 실전 메모리 최적화 사례](./09-04-02-production-optimization.md)

### 🏷️ 관련 키워드

`generational-gc`, `concurrent-gc`, `tri-color-marking`, `write-barrier`, `cms-collector`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
