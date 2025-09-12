---
tags:
  - GC
  - Memory
  - Algorithm
  - Performance
  - GarbageCollection
---

# Chapter 9-2: GC 알고리즘과 구현 원리

## 🎯 이 문서를 읽고 나면 얻을 수 있는 것들

이 문서를 마스터하면, 여러분은:

1. **"왜 자바 앱이 갑자기 멈추죠?"** - Stop-the-world의 원인과 해결책을 이해합니다
2. **"GC 튜닝을 어떻게 시작하죠?"** - 각 GC 알고리즘의 특성을 알고 선택할 수 있습니다
3. **"메모리는 충분한데 왜 OOM이 발생하죠?"** - 메모리 단편화와 GC 오버헤드를 진단할 수 있습니다
4. **"실시간 시스템에서 GC를 쓸 수 있나요?"** - Low-latency GC 전략을 구현할 수 있습니다

## 1. GC의 탄생: 1959년의 혁명

### 1.1 John McCarthy의 천재적 발상

1959년, MIT AI Lab에서 일어난 일입니다:

```text
John McCarthy: "프로그래머가 메모리 해제를 잊어버리면 어떻게 될까?"
동료: "메모리 누수로 프로그램이 죽겠죠."
McCarthy: "그럼 컴퓨터가 알아서 치우게 하면 어떨까?"
동료: "그게 가능해요?"
McCarthy: "제가 Lisp에 구현해봤는데..."
```text

그렇게 Garbage Collection이 탄생했습니다!

### 1.2 GC가 없던 시절의 악몽

제가 2010년에 C++로 대규모 시스템을 개발할 때의 실화:

```c++
// 악몽의 코드 (실제 버그)
class DataProcessor {
    char* buffer;
public:
    DataProcessor() {
        buffer = new char[1024 * 1024];  // 1MB
    }
    
    ~DataProcessor() {
        // delete[] buffer;  // 깜빡했다! 😱
    }
    
    void process() {
        // 복잡한 처리...
        if (error_condition) {
            return;  // early return - 메모리 해제 누락!
        }
        // delete[] buffer;  // 여기도 있어야 하는데...
    }
};

// 결과: 하루에 10GB 메모리 누수
// 서버가 3일마다 OOM으로 재시작... 😭
```text

### 1.3 GC의 기본 원리: 도달 가능성

```c
// GC의 핵심 아이디어: Reachability (도달 가능성)
// "Root에서 도달할 수 없는 객체 = 쓰레기"

// Root Set (GC의 시작점) - GC가 살아있다고 확신할 수 있는 참조들
void* roots[] = {
    stack_variables,   // 1. 스택 변수: 현재 실행 중인 함수의 로컬 변수
    global_variables,  // 2. 전역 변수: 프로그램 생명주기 동안 유지되는 변수
    cpu_registers,     // 3. CPU 레지스터: 현재 처리 중인 포인터
    jni_references     // 4. JNI 참조: Native 코드와 연결된 객체 (Java)
};

// 도달 가능성 판단 - BFS 알고리즘으로 객체 그래프 탐색
bool is_reachable(Object* obj) {
    // BFS(너비 우선 탐색)로 root에서 도달 가능한지 확인
    Queue<Object*> queue;      // 탐색할 객체 대기열
    Set<Object*> visited;      // 이미 방문한 객체 집합 (중복 방문 방지)
    
    // Phase 1: Root set을 큐에 추가 (탐색 시작점)
    for (auto root : roots) {
        queue.push(root);
    }
    
    // Phase 2: BFS 탐색으로 객체 그래프 순회
    while (!queue.empty()) {
        Object* current = queue.pop();
        visited.insert(current);      // 방문 기록
        
        // 찾고자 하는 객체에 도달했나?
        if (current == obj) {
            return true;  // 도달 가능! (GC 대상이 아님)
        }
        
        // Phase 3: 현재 객체가 참조하는 모든 객체를 탐색 대상에 추가
        for (auto ref : current->references) {
            if (!visited.contains(ref)) {
                queue.push(ref);  // 아직 방문하지 않은 객체만 추가
            }
        }
    }
    
    return false;  // 도달 불가능 = 쓰레기 (GC 대상)
}
```text

## 2. 기본 GC 알고리즘

### 2.1 Mark & Sweep: 가장 직관적인 방법

1960년대부터 사용된 고전 알고리즘:

```c++
// Mark & Sweep GC 구현 - 가장 기본적인 GC 알고리즘
class MarkSweepGC {
private:
    struct Object {
        bool marked = false;                    // GC 표시 플래그 (살아있음/죽음)
        size_t size;                           // 객체 크기 (메모리 해제시 필요)
        void* data;                            // 실제 객체 데이터
        std::vector<Object*> references;       // 이 객체가 참조하는 다른 객체들
    };
    
    std::vector<Object*> all_objects;          // 힙의 모든 객체 목록
    std::vector<void*> roots;                  // Root set (GC 시작점)
    
public:
    // 메인 GC 수집 함수 - 전형적인 2단계 과정
    void collect() {
        // Phase 1: Mark (표시) - 살아있는 객체 찾기
        mark();
        
        // Phase 2: Sweep (청소) - 죽은 객체 제거
        sweep();
    }
    
private:
    // Phase 1: Mark 단계 - 도달 가능한 모든 객체에 표시
    void mark() {
        // Step 1: 모든 객체를 unmarked로 초기화 ("모두 죽었다고 가정")
        for (auto obj : all_objects) {
            obj->marked = false;
        }
        
        // Step 2: Root set부터 시작해서 도달 가능한 객체들을 재귀적으로 표시
        for (auto root : roots) {
            mark_object(static_cast<Object*>(root));
        }
    }
    
    // 재귀적 표시 함수 - DFS(깊이 우선 탐색) 방식
    void mark_object(Object* obj) {
        // 종료 조건: null이거나 이미 표시된 객체
        if (!obj || obj->marked) return;
        
        obj->marked = true;  // "이 객체는 살아있다!" 표시
        
        // 재귀적으로 이 객체가 참조하는 모든 객체들도 표시
        // (객체 그래프를 따라 전파)
        for (auto ref : obj->references) {
            mark_object(ref);
        }
    }
    
    // Phase 2: Sweep 단계 - 표시되지 않은 객체들을 메모리에서 제거
    void sweep() {
        auto it = all_objects.begin();
        while (it != all_objects.end()) {
            if (!(*it)->marked) {
                // 표시 안 된 객체 = 쓰레기 -> 메모리 해제
                delete (*it)->data;                // 객체 데이터 해제
                delete *it;                       // 객체 구조체 해제
                it = all_objects.erase(it);       // 목록에서 제거
            } else {
                ++it;  // 살아있는 객체는 그대로 두고 다음으로
            }
        }
    }
};

// 실제 실행 시간 측정
void benchmark_mark_sweep() {
    MarkSweepGC gc;
    
    // 100만 개 객체 생성
    for (int i = 0; i < 1000000; i++) {
        gc.create_object(rand() % 1024);
    }
    
    auto start = high_resolution_clock::now();
    gc.collect();
    auto end = high_resolution_clock::now();
    
    auto duration = duration_cast<milliseconds>(end - start);
    printf("Mark & Sweep: %ld ms (Stop-the-world!), ", duration.count());
    // 결과: 약 100ms - 게임에서는 치명적!
}
```text

**Mark & Sweep의 문제점:**

```text
메모리 레이아웃 (GC 전):
[객체A][객체B][빈공간][객체C][객체D][빈공간][객체E]

GC 후:
[객체A][빈공간][빈공간][객체C][빈공간][빈공간][객체E]

문제: 메모리 단편화! (Swiss cheese problem)
```text

### 2.2 Copying Collector: 단편화 해결사

Cheney's Algorithm (1970):

```c++
// Semi-space Copying Collector - 단편화 문제 해결을 위한 복사 방식 GC
class CopyingGC {
private:
    uint8_t* from_space;      // 현재 사용 중인 공간 ("Old" space)
    uint8_t* to_space;        // 복사 대상 공간 ("New" space)
    size_t space_size;        // 각 공간의 크기 (전체 힙의 50%)
    uint8_t* allocation_ptr;  // 다음 할당 위치 (bump pointer 방식)
    
    struct Object {
        size_t size;                        // 객체 크기
        Object* forwarding_ptr;             // 복사된 새 주소 (중복 복사 방지)
        std::vector<Object**> references;   // 이 객체의 참조 포인터들
    };
    
public:
    CopyingGC(size_t size) : space_size(size) {
        from_space = new uint8_t[size];     // 현재 활성 공간
        to_space = new uint8_t[size];       // 복사 대상 공간
        allocation_ptr = from_space;        // 할당 시작 위치
    }
    
    // Cheney's Algorithm을 사용한 복사 수집
    void collect() {
        // BFS(너비 우선 탐색)로 복사 - 큐 없이 공간 자체를 큐로 활용하는 천재적 방법!
        uint8_t* scan_ptr = to_space;       // 스캔할 다음 객체 위치
        uint8_t* free_ptr = to_space;       // 다음 복사할 위치
        
        // Phase 1: Root set의 모든 객체를 to_space로 복사
        for (auto& root : roots) {
            if (is_in_from_space(root)) {
                root = copy_object(root, &free_ptr);  // root 포인터 업데이트
            }
        }
        
        // Phase 2: BFS로 참조 객체들을 순차적으로 복사
        // scan_ptr < free_ptr인 동안 계속 (큐가 빌 때까지)
        while (scan_ptr < free_ptr) {
            Object* obj = reinterpret_cast<Object*>(scan_ptr);
            
            // 현재 객체가 참조하는 모든 객체들을 복사
            for (auto& ref_ptr : obj->references) {
                if (is_in_from_space(*ref_ptr)) {
                    *ref_ptr = copy_object(*ref_ptr, &free_ptr);  // 참조 업데이트
                }
            }
            
            scan_ptr += obj->size;  // 다음 객체로 이동
        }
        
        // Phase 3: 공간 역할 교체 (from <-> to)
        std::swap(from_space, to_space);
        allocation_ptr = free_ptr;  // 새로운 할당 시작점
        
        // Phase 4: 이전 공간 정리 (매우 간단! - Mark&Sweep와 달리 개별 객체 해제 불필요)
        memset(to_space, 0, space_size);
    }
    
private:
    Object* copy_object(Object* obj, uint8_t** free_ptr) {
        // 이미 복사됨?
        if (obj->forwarding_ptr) {
            return obj->forwarding_ptr;
        }
        
        // to_space로 복사
        Object* new_obj = reinterpret_cast<Object*>(*free_ptr);
        memcpy(new_obj, obj, obj->size);
        *free_ptr += obj->size;
        
        // Forwarding pointer 설정
        obj->forwarding_ptr = new_obj;
        
        return new_obj;
    }
};

// 장단점 비교
void compare_gc_algorithms() {
    printf("=== Mark & Sweep ===, ");
    printf("장점: 메모리 50%만 사용, ");
    printf("단점: 단편화 발생, 할당 느림, , ");
    
    printf("=== Copying Collector ===, ");
    printf("장점: 단편화 없음, 할당 빠름 (bump pointer), ");
    printf("단점: 메모리 50%만 사용 가능, ");
    
    // 실제 벤치마크
    // 할당 속도: Copying이 10배 빠름!
    // GC 시간: 살아있는 객체 수에만 비례
}
```text

### 2.3 Mark & Compact: 둘의 장점을 합치다

```c++
// Mark-Compact GC
class MarkCompactGC {
private:
    struct Object {
        bool marked;
        size_t size;
        void* new_address;  // 압축 후 주소
        std::vector<Object**> references;
    };
    
public:
    void collect() {
        // Phase 1: Mark
        mark_phase();
        
        // Phase 2: Compute new addresses
        compute_addresses();
        
        // Phase 3: Update references
        update_references();
        
        // Phase 4: Compact
        compact();
    }
    
private:
    void compute_addresses() {
        uint8_t* new_addr = heap_start;
        
        for (auto obj : all_objects) {
            if (obj->marked) {
                obj->new_address = new_addr;
                new_addr += obj->size;
            }
        }
    }
    
    void update_references() {
        for (auto obj : all_objects) {
            if (obj->marked) {
                for (auto& ref : obj->references) {
                    if (*ref && (*ref)->marked) {
                        *ref = static_cast<Object*>((*ref)->new_address);
                    }
                }
            }
        }
    }
    
    void compact() {
        // Lisp2 algorithm: 객체를 새 위치로 이동
        for (auto obj : all_objects) {
            if (obj->marked && obj != obj->new_address) {
                memmove(obj->new_address, obj, obj->size);
            }
        }
    }
};

// 실제 사용 예: V8 JavaScript 엔진
/*
V8의 Mark-Compact:
1. Marking: Tri-color marking
2. Sweeping: Lazy sweeping
3. Compacting: Selective compaction (단편화가 심한 페이지만)

결과: Chrome이 빠른 이유 중 하나!
*/
```text

## 3. 세대별 GC (Generational GC)

### 3.1 Weak Generational Hypothesis

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
```text

### 3.2 Generational GC 구현

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
        printf("Minor GC 시작 (Young Generation만), ");
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
        printf("Minor GC 완료: %ld μs, ", duration.count());
        // 보통 1-10ms (매우 빠름!)
    }
    
    void major_gc() {
        printf("Major GC 시작 (전체 힙), ");
        // Mark & Sweep 또는 Mark & Compact
        // 훨씬 느림 (100ms - 1s)
    }
    
    // Write Barrier: Old->Young 참조 추적
    void write_barrier(Object** field, Object* new_value) {
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
    
    printf("Basic GC: %ld ms, ", 
           duration_cast<milliseconds>(basic_time).count());
    printf("Generational GC: %ld ms, ",
           duration_cast<milliseconds>(gen_time).count());
    
    // 결과:
    // Basic GC: 5000 ms (매번 전체 힙 스캔)
    // Generational GC: 500 ms (10배 빠름!)
}
```text

## 4. Concurrent GC: Stop-the-world 제거하기

### 4.1 Tri-color Marking

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
    void write_barrier_satb(Object** field, Object* new_value) {
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
    void write_barrier_incremental(Object** field, Object* new_value) {
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
```text

### 4.2 CMS (Concurrent Mark Sweep)

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
```text

## 5. 현대적 GC: G1과 ZGC

### 5.1 G1GC (Garbage First)

2004년 논문, 2012년 Java 7u4에서 정식 출시:

```java
// G1GC의 혁신: Region 기반 가비지 컬렉션
public class G1GC {
    static final int REGION_SIZE = 2 * 1024 * 1024;  // 2MB 고정 크기 영역
    
    // Region 타입 분류 - 각 2MB 영역의 역할
    enum RegionType {
        FREE,      // 빈 영역 (할당 가능)
        EDEN,      // Young generation - 새 객체 할당
        SURVIVOR,  // Young generation - Minor GC 생존자
        OLD,       // Old generation - 승격된 오래된 객체
        HUMONGOUS  // 거대 객체 (region 크기의 50% 이상인 객체)
    }
    
    // 각 Region의 상태 정보
    class Region {
        RegionType type;              // 현재 region의 역할
        int liveBytes;               // 살아있는 객체의 바이트 수
        double garbageRatio;         // 쓰레기 비율 (수집 우선순위 결정)
        long timestamp;              // 마지막 GC 수행 시간
        
        // Remember Set: 다른 region에서 이 region을 가리키는 참조들
        // (Minor GC 시 Old->Young 참조 추적용)
        Set<Card> rememberSet = new HashSet<>();
    }
    
    Region[] regions = new Region[HEAP_SIZE / REGION_SIZE];  // 전체 힙을 region으로 분할
    
    // Mixed GC: Young generation + 선별된 Old generation regions 수집
    void mixedGC() {
        // Phase 1: "Garbage First" 원칙으로 수집할 region 선택
        // 가비지 비율이 높은 region부터 우선 선택
        List<Region> collectionSet = selectRegions();
        
        // Phase 2: 선택된 region들만 선별적으로 수집 (전체 힙 대신)
        evacuateRegions(collectionSet);
        
        // 핵심 목표: 사용자 지정 Pause time target 달성
        // -XX:MaxGCPauseMillis=200 (200ms 목표)
        // 예측 모델을 통해 목표 시간 내에서 최대한 많은 garbage 수집
    }
    
    List<Region> selectRegions() {
        // 예측 모델로 pause time 계산
        long predictedPause = 0;
        List<Region> selected = new ArrayList<>();
        
        // Young regions는 무조건 포함
        for (Region r : regions) {
            if (r.type == EDEN || r.type == SURVIVOR) {
                selected.add(r);
                predictedPause += predictEvacuationTime(r);
            }
        }
        
        // Old regions는 garbage가 많은 순서로
        List<Region> oldRegions = getOldRegions();
        oldRegions.sort((a, b) -> 
            Double.compare(b.garbageRatio, a.garbageRatio));
        
        for (Region r : oldRegions) {
            if (predictedPause + predictEvacuationTime(r) < pauseTarget) {
                selected.add(r);
                predictedPause += predictEvacuationTime(r);
            } else {
                break;  // 목표 시간 초과
            }
        }
        
        return selected;
    }
}

// G1의 실제 성능 (Netflix 사례)
/*
Before (ParallelGC):
- Heap: 30GB
- Young GC: 50ms average, 200ms max
- Full GC: 15 seconds (!)

After (G1GC):
- Heap: 30GB
- Young GC: 20ms average, 50ms max
- Mixed GC: 100ms average, 200ms max
- Full GC: 거의 발생 안 함

결과: P99 latency 70% 개선!
*/
```text

### 5.2 ZGC: 10ms의 마법

2018년 Java 11에서 실험적 도입:

```c++
// ZGC의 핵심 혁신: Colored Pointers (64비트 포인터에 메타데이터 저장)
class ZGC {
private:
    // 64비트 포인터의 상위 비트를 메타데이터로 활용하는 천재적 아이디어
    // [63:48] - 16 bits: 미사용 (향후 확장 가능)
    // [47:44] - 4 bits:  색상 비트 (GC 상태 메타데이터)
    // [43:0]  - 44 bits: 실제 메모리 주소 (최대 16TB 힙 지원)
    
    // 색상 마스크 정의 - 각 비트는 특정 GC 단계를 나타냄
    static constexpr uint64_t FINALIZABLE_MASK = 0x0001000000000000ULL;  // Finalizer 대기
    static constexpr uint64_t REMAPPED_MASK    = 0x0002000000000000ULL;  // 재매핑됨
    static constexpr uint64_t MARKED0_MASK     = 0x0004000000000000ULL;  // Mark 사이클 0
    static constexpr uint64_t MARKED1_MASK     = 0x0008000000000000ULL;  // Mark 사이클 1
    
    // Load Barrier: 모든 객체 참조 시 자동으로 호출되는 핵심 메커니즘
    template<typename T>
    T* load_barrier(T** addr) {
        T* ptr = *addr;  // 포인터 읽기
        
        // "Bad color" 체크 - 포인터의 색상이 현재 GC 단계와 맞지 않는가?
        if (is_bad_color(ptr)) {
            // Self-healing: 객체를 올바른 위치로 재배치하고 포인터 업데이트
            ptr = relocate_object(ptr);
            *addr = ptr;  // 원본 참조도 자동으로 수정 ("자가 치유")
        }
        
        return ptr;  // 올바른 포인터 반환
    }
    
    // Concurrent Relocation
    void concurrent_relocate() {
        // 1. 이동할 페이지 선택
        std::vector<Page*> relocation_set = select_relocation_set();
        
        // 2. 동시에 객체 이동 (STW 없음!)
        parallel_for(relocation_set, [](Page* page) {
            for (Object* obj : page->live_objects) {
                Object* new_obj = allocate_in_new_page(obj->size);
                memcpy(new_obj, obj, obj->size);
                
                // Forwarding table 업데이트
                forwarding_table[obj] = new_obj;
            }
        });
        
        // 3. Remap (참조 업데이트는 lazy하게)
        // Load barrier가 알아서 처리!
    }
    
    // Multi-mapping 기술 - 같은 물리 메모리를 여러 가상 주소로 매핑
    void setup_multi_mapping() {
        // 하나의 물리 메모리를 여러 가상 주소 영역에 매핑하는 천재적 방법
        void* heap = mmap(HEAP_BASE, HEAP_SIZE, ...);                    // 기본 힙 영역
        mmap(HEAP_BASE + MARKED0_OFFSET, HEAP_SIZE, ..., heap);          // MARKED0 색상용 매핑
        mmap(HEAP_BASE + MARKED1_OFFSET, HEAP_SIZE, ..., heap);          // MARKED1 색상용 매핑
        
        // 혁신적 장점: 포인터 색상 비트만 변경하면 같은 객체에 대해
        // 다른 가상 주소로 접근 가능! (객체 복사 없이 매핑만으로 해결)
        // 메모리 사용량: 실제 1배, 가상 주소 공간만 3배
    }
};

// ZGC 성능 측정 (실제 프로덕션)
void zgc_production_metrics() {
    /*
    Heap Size: 128GB
    Concurrent Mark: 300ms (동시 실행)
    Concurrent Relocate: 500ms (동시 실행)
    STW Pause: 1-2ms (!) - Root 스캔만
    
    비교:
    - G1GC: 50-200ms pause
    - ZGC: 1-2ms pause (100배 개선!)
    
    Trade-off:
    - CPU 사용량 10-15% 증가
    - Throughput 5-10% 감소
    - 하지만 latency가 중요한 서비스에는 최고!
    */
}
```text

### 5.3 Shenandoah: Red Hat의 도전

```java
// Shenandoah의 특징: Brooks Pointer
class ShenandoahGC {
    // 모든 객체에 forwarding pointer 추가
    class Object {
        Object* forwardingPtr;  // 자기 자신 또는 이동한 위치
        // ... 실제 데이터
    }
    
    // Read/Write Barrier
    Object* read_barrier(Object* obj) {
        return obj->forwardingPtr;  // 간단!
    }
    
    void write_barrier(Object* obj, Field* field, Object* value) {
        Object* resolved = obj->forwardingPtr;
        resolved->field = value;
        
        // SATB marking
        if (is_marking_active()) {
            satb_enqueue(resolved->field);
        }
    }
    
    // Concurrent Evacuation
    void concurrent_evacuation() {
        // G1과 달리 STW 없이 evacuation!
        for (Region* r : collection_set) {
            for (Object* obj : r->live_objects) {
                Object* copy = evacuate(obj);
                
                // CAS로 forwarding pointer 업데이트
                Object* expected = obj;
                obj->forwardingPtr.compare_exchange(expected, copy);
            }
        }
    }
}

// Shenandoah vs ZGC
/*
공통점:
- 목표: <10ms pause
- Concurrent relocation
- Region 기반

차이점:
- Shenandoah: Brooks pointer (객체마다 8바이트 오버헤드)
- ZGC: Colored pointer (오버헤드 없음, 64비트 전용)

성능:
- 비슷한 pause time (1-10ms)
- Shenandoah이 조금 더 안정적
- ZGC가 메모리 효율적
*/
```text

## 6. 실전 GC 튜닝

### 6.1 GC 로그 분석

```bash
# JVM GC 로그 옵션
java -Xlog:gc*:file=gc.log:time,uptime,level,tags \
     -XX:+UseG1GC \
     -Xmx8g \
     -XX:MaxGCPauseMillis=200 \
     MyApp

# GC 로그 예시 분석
[2024-01-15T10:30:45.123+0000][123.456s][info][gc] GC(45) Pause Young (Normal) (G1 Evacuation Pause) 2048M->512M(8192M) 15.234ms
#     시간                    경과시간  레벨  태그  GC번호 종류              원인                    전->후(전체)     시간

# 중요 지표
# 1. Allocation Rate: 초당 할당량
# 2. Promotion Rate: Old로 승격량  
# 3. GC Frequency: GC 빈도
# 4. GC Duration: GC 시간
```text

### 6.2 실제 튜닝 사례

```java
// 사례 1: 대용량 캐시 서버
// 문제: Full GC로 10초 멈춤
// 원인: Old Gen에 큰 캐시, Reference 처리 오래 걸림

// 해결책 1: Off-heap 메모리 사용
ByteBuffer offHeap = ByteBuffer.allocateDirect(1024 * 1024 * 1024);
// GC 대상이 아님!

// 해결책 2: G1GC + 튜닝
// -XX:+UseG1GC
// -XX:MaxGCPauseMillis=500
// -XX:G1HeapRegionSize=32m
// -XX:InitiatingHeapOccupancyPercent=70

// 사례 2: 실시간 거래 시스템
// 문제: GC로 인한 지연 스파이크

// 해결책: ZGC + Huge Pages
// -XX:+UseZGC
// -XX:+UseLargePages
// -XX:ZAllocationSpikeTolerance=5
// -Xmx32g -Xms32g (같게 설정)

// 결과: P99.9 latency 100ms -> 5ms
```text

### 6.3 GC 선택 가이드

```java
public class GCSelector {
    public static String selectGC(AppProfile profile) {
        if (profile.heapSize > 32_000 && profile.maxPauseTime < 10) {
            return "ZGC";  // 대용량 + 낮은 지연
        }
        
        if (profile.heapSize > 8_000 && profile.maxPauseTime < 200) {
            return "G1GC";  // 균형잡힌 선택
        }
        
        if (profile.throughput > profile.latency) {
            return "ParallelGC";  // 처리량 최적화
        }
        
        if (profile.heapSize < 100) {
            return "SerialGC";  // 작은 힙
        }
        
        return "G1GC";  // 기본값
    }
}

// 실제 벤치마크 결과
/*
애플리케이션: Spring Boot 웹서버
부하: 10,000 req/s
힙: 8GB

SerialGC:     Throughput: 70%, Avg Pause: 500ms, Max: 2s
ParallelGC:   Throughput: 95%, Avg Pause: 100ms, Max: 1s  
G1GC:         Throughput: 90%, Avg Pause: 50ms,  Max: 200ms
ZGC:          Throughput: 85%, Avg Pause: 2ms,   Max: 10ms
Shenandoah:   Throughput: 87%, Avg Pause: 5ms,   Max: 15ms
*/
```text

## 7. 마무리: GC의 미래

### 🔮 미래 전망

1. **Hardware 발전과 GC**
   - Persistent Memory (Intel Optane)
   - Hardware GC 지원
   - NUMA-aware GC

2. **새로운 GC 알고리즘**
   - Epsilon GC (No-op GC)
   - Ultra-low latency GC (<1ms)
   - Machine Learning 기반 튜닝

3. **언어 레벨 혁신**
   - Rust: GC 없이 메모리 안전성
   - Zig: 수동 메모리 관리 + 안전성
   - Swift: ARC + Generational

### 💡 핵심 교훈

10년간 GC와 씨우며 배운 것:

1. **"은총알은 없다"**
   - 모든 GC는 트레이드오프
   - 워크로드에 맞게 선택
   - 측정하고 튜닝하라

2. **"GC를 이해하면 더 좋은 코드를 쓴다"**
   - 객체 수명 고려
   - 할당 패턴 최적화
   - Off-heap 활용

3. **"미래는 낮은 지연 시간"**
   - 사용자 기대치 상승
   - 실시간 처리 요구
   - ZGC/Shenandoah가 대세

GC는 프로그래밍의 큰 진보였고, 계속 진화하고 있습니다!

## 참고 자료

- [The Garbage Collection Handbook](https://gchandbook.org/) - Jones, Hosking, Moss
- [JVM Anatomy Quarks](https://shipilev.net/jvm/anatomy-quarks/) - Aleksey Shipilëv
- [ZGC Design](https://wiki.openjdk.java.net/display/zgc/Main) - Per Liden
- [G1GC Tuning](https://www.oracle.com/technical-resources/articles/java/g1gc.html) - Oracle
- [Shenandoah GC](https://wiki.openjdk.java.net/display/shenandoah/Main) - Red Hat
