---
tags:
  - balanced
  - cms-collector
  - concurrent-gc
  - deep-study
  - generational-gc
  - intermediate
  - tri-color-marking
  - write-barrier
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "6-10시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# Chapter 9-2B: 세대별 및 동시 GC

## 세대별 GC (Generational GC)

### Weak Generational Hypothesis

1984년, David Ungar의 혁신적인 관찰:

> "대부분의 객체는 젊어서 죽는다" (Infant mortality)

실제 측정 결과:

- 80-98%의 객체가 첫 GC 전에 죽음
- 살아남은 객체는 오래 살아남음
- 오래된 객체가 젊은 객체를 참조하는 경우는 드물다

```java
// 실제 코드에서의 객체 수명 패턴 - 웹 애플리케이션 예시
public void processRequest(HttpRequest req) {
    // 임시 객체들 - 99% 즉시 죽음
    String userAgent = req.getHeader("User-Agent");           // 메서드 끝에서 죽음
    Map<String, String> params = parseParameters(req);        // 메서드 끝에서 죽음
    List<String> tokens = tokenize(params.get("query"));      // 메서드 끝에서 죽음
    StringBuilder response = new StringBuilder(1024);         // 메서드 끝에서 죽음
    
    // JSON 파싱용 임시 객체들
    JsonObject jsonData = new JsonParser().parse(req.getBody());  // 즉시 죽음
    ValidationResult validation = validator.validate(jsonData);   // 즉시 죽음
    
    // 비즈니스 로직 처리
    ProcessingResult result = businessService.process(validation);
    
    // 응답 생성
    response.append(result.toJson());
    
    // 메서드 종료 = 모든 임시 객체 즉시 가비지가 됨!
    // 실제로 1초도 안 되어 95% 이상의 객체가 죽음
}

// vs 오래 사는 객체들
public class WebApplication {
    // 애플리케이션 생명주기 동안 계속 살아있음 (수시간~수일)
    private static final Logger logger = LoggerFactory.getLogger();      // 영구 생존
    private final Database connectionPool = new Database(config);        // 영구 생존
    private final Cache cache = new LRUCache(10000);                    // 영구 생존
    private final MetricsCollector metrics = new MetricsCollector();     // 영구 생존
    
    // 이런 객체들은 한 번 생성되면 JVM 종료까지 살아있음
}
```

### Generational GC 구현

```c++
// 실제 세대별 GC 구현
class GenerationalGC {
private:
    // Young Generation (Eden + 2개 Survivor 공간)
    struct YoungGeneration {
        uint8_t* eden;                  // 새 객체 할당 공간 (가장 큰 영역)
        uint8_t* survivor_from;         // 생존자 공간 1 (From space)
        uint8_t* survivor_to;           // 생존자 공간 2 (To space)
        size_t eden_size;              // 일반적으로 8:1:1 비율
        size_t survivor_size;
        uint8_t* allocation_ptr;        // 빠른 할당을 위한 bump pointer
        int gc_count = 0;              // Minor GC 횟수
    } young;

    // Old Generation (Tenured space)
    struct OldGeneration {
        uint8_t* space;
        size_t size;
        std::vector<Object*> objects;
        double occupancy_ratio = 0.0;  // 사용률 (Major GC 트리거용)
    } old;

    // Write Barrier를 위한 Card Table - Old->Young 참조 추적
    static constexpr size_t CARD_SIZE = 512;  // 512바이트 카드 단위
    uint8_t* card_table;  // 각 카드의 dirty 여부 (0=clean, 1=dirty)
    size_t card_count;

    struct Object {
        uint8_t age = 0;                       // GC 생존 횟수 (promotion 판단용)
        bool marked = false;                   // Mark 단계용
        size_t size;
        std::vector<Object**> references;
        
        // Promotion threshold (일반적으로 15)
        static constexpr uint8_t MAX_AGE = 15;
    };

public:
    GenerationalGC(size_t young_size, size_t old_size) {
        // Young generation 초기화 (8:1:1 비율)
        young.eden_size = young_size * 8 / 10;
        young.survivor_size = young_size * 1 / 10;
        
        young.eden = new uint8_t[young.eden_size];
        young.survivor_from = new uint8_t[young.survivor_size];
        young.survivor_to = new uint8_t[young.survivor_size];
        young.allocation_ptr = young.eden;
        
        // Old generation 초기화
        old.space = new uint8_t[old_size];
        old.size = old_size;
        
        // Card table 초기화
        card_count = old_size / CARD_SIZE;
        card_table = new uint8_t[card_count]();  // 0으로 초기화
    }

    // 빠른 객체 할당 - 대부분의 할당은 여기서 처리
    void* allocate(size_t size) {
        // Fast path: Eden에 할당 (95% 이상 케이스)
        if (young.allocation_ptr + size <= young.eden + young.eden_size) {
            void* ptr = young.allocation_ptr;
            young.allocation_ptr += size;
            return ptr;
        }

        // Eden이 가득 참 -> Minor GC 트리거
        printf("Eden 공간 부족 - Minor GC 실행, ");
        minor_gc();

        // GC 후 재시도
        if (young.allocation_ptr + size <= young.eden + young.eden_size) {
            void* ptr = young.allocation_ptr;
            young.allocation_ptr += size;
            return ptr;
        }

        // 매우 큰 객체는 직접 Old Generation에 할당
        printf("큰 객체 -> Old Generation 직접 할당, ");
        return allocate_in_old(size);
    }

    // Minor GC: Young Generation만 수집 (매우 빠름!)
    void minor_gc() {
        printf("=== Minor GC #%d 시작 ===, ", ++young.gc_count);
        auto start_time = high_resolution_clock::now();
        
        // 통계 수집
        size_t objects_before = count_young_objects();
        size_t bytes_before = young.allocation_ptr - young.eden;
        
        // Phase 1: Root set 구축 (Stack + Old->Young 참조)
        std::vector<Object*> roots = get_root_set();
        add_old_to_young_references(roots);  // Card table 활용
        
        // Phase 2: 생존 객체를 Survivor space로 복사 (Copying algorithm)
        uint8_t* survivor_ptr = young.survivor_to;
        for (auto root : roots) {
            if (is_in_young_generation(root)) {
                survivor_ptr = copy_to_survivor(root, survivor_ptr);
            }
        }
        
        // Phase 3: 나이든 객체들을 Old generation으로 승격
        promote_aged_objects();
        
        // Phase 4: 공간 정리 및 역할 교체
        memset(young.eden, 0, young.eden_size);  // Eden 초기화
        memset(young.survivor_from, 0, young.survivor_size);  // From 초기화
        std::swap(young.survivor_from, young.survivor_to);  // From <-> To 교체
        young.allocation_ptr = young.eden;  // 할당 포인터 리셋
        
        // 성능 측정 및 로그
        auto end_time = high_resolution_clock::now();
        auto duration = duration_cast<microseconds>(end_time - start_time);
        size_t objects_after = count_survivor_objects();
        size_t survival_rate = objects_after * 100 / objects_before;
        
        printf("Minor GC 완료: %ld μs, 생존율: %zu%%, ", 
               duration.count(), survival_rate);
        printf("Eden %zuKB -> Survivor %zuKB, ", 
               bytes_before / 1024, (survivor_ptr - young.survivor_from) / 1024);
        
        // Old generation이 가득 차면 Major GC 필요
        if (old.occupancy_ratio > 0.8) {
            printf("Old Gen 사용률 %.1f%% - Major GC 필요, ", old.occupancy_ratio * 100);
            major_gc();
        }
    }

    // Major GC: 전체 힙 수집 (느림, 하지만 드물게 발생)
    void major_gc() {
        printf("=== Major GC 시작 (전체 힙) ===, ");
        auto start_time = high_resolution_clock::now();
        
        // Mark & Compact 또는 Mark & Sweep 사용
        // Old generation에는 오래된 객체가 많아서 생존율이 높음
        mark_compact_old_generation();
        
        auto end_time = high_resolution_clock::now();
        auto duration = duration_cast<milliseconds>(end_time - start_time);
        printf("Major GC 완료: %ld ms, ", duration.count());
        
        // 통계 업데이트
        old.occupancy_ratio = calculate_old_occupancy();
        printf("Old Gen 사용률: %.1f%%, ", old.occupancy_ratio * 100);
    }

    // Write Barrier: Old->Young 참조를 추적하는 핵심 메커니즘
    void write_barrier(Object** field_addr, Object* new_value) {
        // 실제 참조 업데이트
        *field_addr = new_value;
        
        // Old 객체가 Young 객체를 참조하게 되었는가?
        if (is_in_old_generation(field_addr) && is_in_young_generation(new_value)) {
            // 해당 Card를 dirty로 표시
            size_t card_index = ((uint8_t*)field_addr - old.space) / CARD_SIZE;
            card_table[card_index] = 1;  // dirty 표시
            
            printf("Write barrier: Old->Young 참조 감지, Card %zu dirty, ", card_index);
        }
    }

private:
    // Card table을 스캔하여 Old->Young 참조를 root set에 추가
    void add_old_to_young_references(std::vector<Object*>& roots) {
        printf("Card table 스캔 중... ");
        size_t dirty_cards = 0;
        
        for (size_t i = 0; i < card_count; i++) {
            if (card_table[i]) {  // dirty card 발견
                dirty_cards++;
                scan_card_for_young_refs(i, roots);
                card_table[i] = 0;  // clean으로 리셋
            }
        }
        
        printf("dirty cards: %zu개, ", dirty_cards);
        // 이 최적화로 전체 Old generation을 스캔하지 않고
        // dirty card만 스캔하여 성능을 크게 향상
    }

    Object* copy_to_survivor(Object* obj, uint8_t*& survivor_ptr) {
        if (!obj || !is_in_young_generation(obj)) return obj;
        
        // 이미 복사되었나?
        if (obj->forwarding_ptr) {
            return obj->forwarding_ptr;
        }
        
        // Survivor space로 복사
        Object* new_obj = reinterpret_cast<Object*>(survivor_ptr);
        memcpy(new_obj, obj, obj->size);
        survivor_ptr += obj->size;
        
        // 나이 증가
        new_obj->age++;
        
        // Forwarding pointer 설정
        obj->forwarding_ptr = new_obj;
        
        return new_obj;
    }

    void promote_aged_objects() {
        // Survivor space의 오래된 객체들을 Old generation으로 이동
        // 일반적으로 15번 GC를 생존한 객체는 promotion
        
        size_t promoted_count = 0;
        for (auto obj : get_survivor_objects()) {
            if (obj->age >= Object::MAX_AGE) {
                move_to_old_generation(obj);
                promoted_count++;
            }
        }
        
        printf("승격된 객체: %zu개, ", promoted_count);
    }
};

// 실제 성능 비교: Generational vs Non-generational
void benchmark_generational_gc() {
    printf("=== 세대별 GC vs 일반 GC 성능 비교 ===, ");
    
    // 시나리오: 웹 서버 (요청당 많은 임시 객체 + 일부 영구 객체)
    const size_t REQUESTS = 10000;
    const size_t TEMP_OBJECTS_PER_REQUEST = 100;
    
    // Non-generational GC 테스트
    BasicGC basic_gc(1024 * 1024 * 1024);  // 1GB
    auto start = high_resolution_clock::now();
    
    for (size_t i = 0; i < REQUESTS; i++) {
        // 요청 처리: 많은 임시 객체 생성
        std::vector<void*> temp_objects;
        for (size_t j = 0; j < TEMP_OBJECTS_PER_REQUEST; j++) {
            temp_objects.push_back(basic_gc.allocate(rand() % 1024 + 64));
        }
        
        // 대부분의 임시 객체는 이제 가비지가 됨
        // 하지만 basic_gc는 이를 모르고 전체 힙을 스캔
    }
    
    auto basic_time = high_resolution_clock::now() - start;
    
    // Generational GC 테스트
    GenerationalGC gen_gc(256 * 1024 * 1024, 768 * 1024 * 1024);  // 256MB young, 768MB old
    start = high_resolution_clock::now();
    
    for (size_t i = 0; i < REQUESTS; i++) {
        std::vector<void*> temp_objects;
        for (size_t j = 0; j < TEMP_OBJECTS_PER_REQUEST; j++) {
            temp_objects.push_back(gen_gc.allocate(rand() % 1024 + 64));
        }
        // 임시 객체들은 Young generation에서만 처리됨
    }
    
    auto gen_time = high_resolution_clock::now() - start;
    
    printf("Basic GC: %ld ms (전체 힙 스캔), ",
           duration_cast<milliseconds>(basic_time).count());
    printf("Generational GC: %ld ms (Young generation만), ",
           duration_cast<milliseconds>(gen_time).count());
    
    // 일반적인 결과:
    // Basic GC: 5000 ms (매번 전체 힙을 스캔)
    // Generational GC: 500 ms (10배 빠름! Young generation만 주로 스캔)
    
    printf("성능 향상: %.1fx, ", (double)basic_time.count() / gen_time.count());
}
```

## Concurrent GC: Stop-the-world 제거하기

### Tri-color Marking

Dijkstra가 1978년에 제안한 혁신적인 방법:

```c++
// Tri-color Marking - 동시 실행 가능한 표시 알고리즘
enum Color {
    WHITE,  // 미방문 상태 (쓰레기 후보, 아직 탐색되지 않음)
    GRAY,   // 방문했지만 자식들이 아직 처리되지 않은 상태 (작업 큐에 있음)
    BLACK   // 완전 처리된 상태 (본인과 모든 자식이 처리 완료)
};

class TriColorGC {
private:
    struct Object {
        std::atomic<Color> color{WHITE};        // 원자적 색상 (동시 접근 안전)
        size_t size;
        std::atomic<bool> mark_bit{false};      // 추가 마킹용
        std::vector<Object*> references;
        std::mutex ref_mutex;                   // 참조 변경 보호
    };

    std::queue<Object*> gray_queue;             // GRAY 객체들의 작업 큐
    std::mutex queue_mutex;                     // 큐 동시 접근 보호
    std::atomic<bool> marking_active{false};   // 마킹 진행 상태

public:
    // Concurrent Marking - 핵심! 애플리케이션 실행 중에도 동시에 수행 가능
    void concurrent_mark() {
        printf("=== Concurrent Marking 시작 ===, ");
        marking_active = true;
        
        // Phase 1: Root set을 GRAY로 초기화 (탐색 시작점 설정)
        auto roots = get_roots();
        printf("Root 객체 %zu개 발견, ", roots.size());
        
        for (auto root : roots) {
            root->color = GRAY;           // "처리 대기 중" 상태로 변경
            {
                std::lock_guard<std::mutex> lock(queue_mutex);
                gray_queue.push(root);    // 작업 큐에 추가
            }
        }

        // Phase 2: Concurrent marking (핵심 단계!)
        // 여러 GC 스레드가 동시에 marking 수행
        std::vector<std::thread> marker_threads;
        const size_t MARKER_THREADS = std::thread::hardware_concurrency();
        
        for (size_t i = 0; i < MARKER_THREADS; i++) {
            marker_threads.emplace_back([this]() {
                mark_worker();  // 별도 스레드에서 마킹 작업
            });
        }

        // 모든 마킹 스레드 완료 대기
        for (auto& thread : marker_threads) {
            thread.join();
        }

        marking_active = false;
        printf("Concurrent Marking 완료, ");

        // Phase 3: Concurrent Sweep - WHITE 객체들만 제거
        concurrent_sweep();
    }

private:
    // 각 마킹 스레드가 실행하는 작업
    void mark_worker() {
        while (true) {
            Object* obj = nullptr;
            
            // 작업 큐에서 GRAY 객체 하나 가져오기
            {
                std::lock_guard<std::mutex> lock(queue_mutex);
                if (gray_queue.empty()) {
                    break;  // 더 이상 처리할 객체 없음
                }
                obj = gray_queue.front();
                gray_queue.pop();
            }

            // 현재 객체(GRAY)가 참조하는 모든 객체를 처리
            {
                std::lock_guard<std::mutex> lock(obj->ref_mutex);
                for (auto ref : obj->references) {
                    if (ref) {
                        // 원자적 색상 변경: WHITE -> GRAY
                        Color expected = WHITE;
                        if (ref->color.compare_exchange_strong(expected, GRAY)) {
                            // 성공적으로 WHITE에서 GRAY로 변경됨
                            // 새로 발견된 객체를 작업 큐에 추가
                            std::lock_guard<std::mutex> lock(queue_mutex);
                            gray_queue.push(ref);
                        }
                    }
                }
            }

            // 모든 자식 처리 완료 -> BLACK으로 변경
            obj->color = BLACK;
        }
    }

    // SATB Write Barrier (Snapshot At The Beginning)
    void write_barrier_satb(Object** field, Object* new_value) {
        Object* old_value = *field;

        // 이전 값이 있고 마킹이 진행 중이면
        if (old_value && marking_active) {
            // 이전 값이 WHITE면 GRAY로 변경 (놓치지 않기 위해)
            Color expected = WHITE;
            if (old_value->color.compare_exchange_strong(expected, GRAY)) {
                std::lock_guard<std::mutex> lock(queue_mutex);
                gray_queue.push(old_value);
                printf("SATB: 이전 참조 %p를 GRAY로 보호, ", old_value);
            }
        }

        // 실제 참조 업데이트
        *field = new_value;
    }

    // Incremental Update Write Barrier (다른 방식)
    void write_barrier_incremental(Object** field, Object* new_value) {
        *field = new_value;

        // 마킹 중이고, Black 객체가 White 객체를 참조하게 되는 경우
        if (marking_active && new_value) {
            Object* container = get_container_object(field);
            if (container->color == BLACK && new_value->color == WHITE) {
                // Invariant 위반 방지: 새 참조를 GRAY로 변경
                new_value->color = GRAY;
                std::lock_guard<std::mutex> lock(queue_mutex);
                gray_queue.push(new_value);
                printf("Incremental: BLACK->WHITE 참조 감지, %p를 GRAY로, ", new_value);
            }
        }
    }

    void concurrent_sweep() {
        printf("Concurrent Sweep 시작, ");
        
        // 별도 스레드에서 수행 (애플리케이션과 동시 실행)
        std::thread sweeper([this]() {
            size_t freed_objects = 0;
            size_t freed_bytes = 0;
            
            for (auto it = all_objects.begin(); it != all_objects.end();) {
                if ((*it)->color == WHITE) {
                    // WHITE 객체는 쓰레기 -> 해제
                    freed_bytes += (*it)->size;
                    freed_objects++;
                    delete *it;
                    it = all_objects.erase(it);
                } else {
                    // 다음 GC를 위해 색상 리셋
                    (*it)->color = WHITE;
                    ++it;
                }
            }
            
            printf("해제: 객체 %zu개, %zu bytes, ", freed_objects, freed_bytes);
        });
        
        sweeper.join();
        printf("Concurrent Sweep 완료, ");
    }
};

// Tri-color Invariant (핵심 불변성)
/*
Strong Tri-color Invariant: 
  - Black 객체는 White 객체를 직접 참조할 수 없다

Weak Tri-color Invariant:
  - White 객체로 가는 모든 경로에 최소 하나의 Gray 객체가 있다

이 불변성을 유지하면 concurrent marking이 안전하게 수행됨!
Write barrier가 이 불변성을 보장하는 핵심 메커니즘.
*/
```

### CMS (Concurrent Mark Sweep)

Java의 CMS collector 구현:

```java
// CMS의 혁신적인 6단계 프로세스
public class CMSCollector {
    private volatile boolean concurrentMarkActive = false;
    private Set<Object> graySet = new ConcurrentSkipListSet<>();
    private CardTable cardTable;
    private RememberedSet remSet;

    // Phase 1: Initial Mark (STW - 매우 짧음)
    public void initialMark() {
        printf("CMS: Initial Mark 시작, ");
        long startTime = System.nanoTime();
        
        // 전체 애플리케이션 일시 중지 (불가피)
        stopTheWorld();
        
        try {
            // Root set만 빠르게 표시 (매우 빠름 - 1~10ms)
            for (Object root : getRootSet()) {
                root.marked = true;
                graySet.add(root);
            }
            
            // Young generation에서 Old generation으로의 참조도 표시
            for (Object youngObj : getYoungGenObjects()) {
                for (Object ref : youngObj.getReferences()) {
                    if (isInOldGen(ref)) {
                        ref.marked = true;
                        graySet.add(ref);
                    }
                }
            }
            
        } finally {
            resumeTheWorld();
        }
        
        long duration = (System.nanoTime() - startTime) / 1_000_000;
        printf("Initial Mark 완료: %d ms (STW), ", duration);
    }

    // Phase 2: Concurrent Mark (동시 실행 - 핵심!)
    public void concurrentMark() {
        printf("CMS: Concurrent Mark 시작 (동시 실행), ");
        concurrentMarkActive = true;
        long startTime = System.nanoTime();
        
        // 여러 스레드로 동시 마킹 수행
        List<Thread> markingThreads = new ArrayList<>();
        int threadCount = Runtime.getRuntime().availableProcessors();
        
        for (int i = 0; i < threadCount; i++) {
            Thread markingThread = new Thread(() -> {
                while (!graySet.isEmpty()) {
                    Object obj = graySet.pollFirst();
                    if (obj == null) break;
                    
                    // 애플리케이션과 동시에 실행되므로 동기화 필요
                    synchronized (obj) {
                        for (Object ref : obj.getReferences()) {
                            if (ref != null && !ref.marked) {
                                ref.marked = true;
                                graySet.add(ref);
                            }
                        }
                    }
                }
            });
            
            markingThread.start();
            markingThreads.add(markingThread);
        }
        
        // 모든 마킹 스레드 완료 대기
        for (Thread thread : markingThreads) {
            try { thread.join(); } catch (InterruptedException e) {}
        }
        
        concurrentMarkActive = false;
        long duration = (System.nanoTime() - startTime) / 1_000_000;
        printf("Concurrent Mark 완료: %d ms (동시 실행), ", duration);
    }

    // Phase 3: Concurrent Preclean (동시 실행)
    public void concurrentPreclean() {
        printf("CMS: Concurrent Preclean 시작, ");
        
        // Concurrent mark 중에 dirty해진 card들 처리
        // 이렇게 미리 정리하면 다음 단계에서 STW 시간을 단축
        int cleanedCards = 0;
        for (Card card : cardTable.getDirtyCards()) {
            if (card.isDirty()) {
                scanCardForReferences(card);
                card.clean();
                cleanedCards++;
            }
        }
        
        printf("Preclean 완료: %d개 카드 정리, ", cleanedCards);
    }

    // Phase 4: Remark (STW - 짧음, 하지만 Initial Mark보다는 길 수 있음)
    public void remark() {
        printf("CMS: Final Remark 시작, ");
        long startTime = System.nanoTime();
        
        stopTheWorld();
        
        try {
            // Concurrent mark 중 놓친 참조들 처리
            processDirtyCards();
            
            // Weak references, finalizable objects 처리
            processWeakReferences();
            processFinalizableObjects();
            
            // Young generation 재스캔 (concurrent mark 중 변경사항)
            rescanYoungGeneration();
            
        } finally {
            resumeTheWorld();
        }
        
        long duration = (System.nanoTime() - startTime) / 1_000_000;
        printf("Final Remark 완료: %d ms (STW), ", duration);
    }

    // Phase 5: Concurrent Sweep (동시 실행)
    public void concurrentSweep() {
        printf("CMS: Concurrent Sweep 시작 (동시 실행), ");
        long startTime = System.nanoTime();
        
        // 별도 스레드에서 청소 작업 수행
        Thread sweepThread = new Thread(() -> {
            long freedObjects = 0;
            long freedBytes = 0;
            
            for (Region region : heap.getOldGenRegions()) {
                for (Object obj : region.getObjects()) {
                    if (!obj.marked) {
                        // 표시되지 않은 객체 = 쓰레기
                        freedBytes += obj.getSize();
                        freedObjects++;
                        region.deallocate(obj);
                    } else {
                        // 다음 GC를 위해 mark 비트 클리어
                        obj.marked = false;
                    }
                }
                
                // 완전히 비어버린 region은 free list에 추가
                if (region.isEmpty()) {
                    heap.addToFreeList(region);
                }
            }
            
            printf("해제: %d 객체, %d MB, ", freedObjects, freedBytes / (1024*1024));
        });
        
        sweepThread.start();
        try { sweepThread.join(); } catch (InterruptedException e) {}
        
        long duration = (System.nanoTime() - startTime) / 1_000_000;
        printf("Concurrent Sweep 완료: %d ms, ", duration);
    }

    // Phase 6: Concurrent Reset
    public void concurrentReset() {
        printf("CMS: Concurrent Reset, ");
        
        // 다음 GC 사이클을 위한 데이터 구조 리셋
        graySet.clear();
        cardTable.resetDirtyBits();
        remSet.clear();
        
        printf("Reset 완료, ");
    }

    // CMS Write Barrier - SATB 방식
    public void writeBarrier(Object obj, String fieldName, Object newValue) {
        Object oldValue = getField(obj, fieldName);
        
        // 실제 필드 업데이트
        setField(obj, fieldName, newValue);
        
        if (concurrentMarkActive && oldValue != null && !oldValue.marked) {
            // Concurrent mark 중이면 이전 값을 보호
            oldValue.marked = true;
            graySet.add(oldValue);
        }
        
        // Card table 업데이트 (Old->Young 참조 추적)
        if (isInOldGen(obj) && isInYoungGen(newValue)) {
            cardTable.markDirty(getCardFor(obj));
        }
    }
}

// CMS의 실제 성능 특성과 문제점
/*
장점:
1. 애플리케이션과 대부분 동시 실행 (낮은 pause time)
2. Old generation 전용이라 Young GC와 독립적
3. 큰 힙에서도 상대적으로 짧은 pause time

문제점과 해결책:

1. Concurrent Mode Failure:
   문제: Old Gen이 가득 차서 concurrent collection이 완료되기 전에 promotion 실패
   해결: -XX:CMSInitiatingOccupancyFraction=70 (70%에서 미리 시작)
   
2. 메모리 단편화:
   문제: Mark & Sweep 방식이라 단편화 발생
   해결: -XX:+UseCMSCompactAtFullCollection (Full GC 시 압축)
   
3. CPU 오버헤드:
   문제: 동시 실행으로 CPU 더 많이 사용 (보통 10-20%)
   해결: -XX:ConcGCThreads로 스레드 수 조정
   
4. Floating garbage:
   문제: Concurrent mark 중 생성된 가비지는 다음 GC까지 대기
   영향: 메모리 사용량 일시적 증가

실제 튜닝 예시:
-XX:+UseConcMarkSweepGC
-XX:CMSInitiatingOccupancyFraction=75  
-XX:+UseCMSInitiatingOccupancyOnly
-XX:ConcGCThreads=4
-XX:+CMSParallelRemarkEnabled
*/
```

## 핵심 요점

### 1. Weak Generational Hypothesis의 실증적 가치

- **95% 이상의 객체가 젊어서 죽음**: 웹 요청, 함수 호출 등 대부분의 임시 객체
- **Young generation 집중 최적화**: Minor GC는 빠르고 빈번, Major GC는 느리고 드물게
- **Write barrier로 성능 향상**: Card table을 통한 Old->Young 참조 효율적 추적

### 2. Tri-color Marking의 동시성 혁신

- **애플리케이션과 GC의 동시 실행**: Stop-the-world 시간 획기적 단축
- **Write barrier의 핵심 역할**: Tri-color invariant 유지를 통한 안전성 보장
- **Trade-off 이해**: CPU 오버헤드 증가 vs 응답 시간 개선

### 3. CMS의 실용적 교훈

- **6단계 프로세스**: Initial Mark → Concurrent Mark → Preclean → Remark → Concurrent Sweep → Reset
- **실제 운영 고려사항**: Concurrent Mode Failure, 메모리 단편화, CPU 사용량
- **적절한 튜닝의 중요성**: 워크로드별 임계값 조정

---

**이전**: [기본 GC 알고리즘](chapter-08-memory-allocator-gc/08-02-basic-gc-algorithms.md)  
**다음**: [현대적 GC 구현](chapter-08-memory-allocator-gc/08-17-modern-gc-implementations.md)에서 G1GC, ZGC, Shenandoah의 혁신적 기술을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 6-10시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-09-memory-gc)

- [Chapter 9-1: 메모리 할당자의 내부 구현 개요](./08-10-memory-allocator.md)
- [Chapter 9-1A: malloc 내부 동작의 진실](./08-01-malloc-fundamentals.md)
- [Chapter 9-1B: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](./08-11-allocator-comparison.md)
- [Chapter 9-1C: 커스텀 메모리 할당자 구현](./08-12-custom-allocators.md)
- [Chapter 9-1D: 실전 메모리 최적화 사례](../chapter-09-advanced-memory-management/08-30-production-optimization.md)

### 🏷️ 관련 키워드

`generational-gc`, `concurrent-gc`, `tri-color-marking`, `cms-collector`, `write-barrier`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
