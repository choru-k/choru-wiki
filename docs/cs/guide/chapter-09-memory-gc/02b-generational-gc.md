---
tags:
  - GC
  - Memory
  - GenerationalGC
  - YoungGeneration
  - OldGeneration
  - WriteBarrier
---

# Chapter 9-2B: 세대별 GC (Generational GC)

## 🎯 이 문서에서 배우는 것

이 문서를 마스터하면, 여러분은:

1. **Weak Generational Hypothesis** - "대부분의 객체는 젊어서 죽는다"는 관찰과 그 활용법
2. **Young/Old Generation 구조** - 세대별 메모리 관리의 핵심 아키텍처
3. **Minor/Major GC의 차이** - 각각의 동작 원리와 성능 특성
4. **Write Barrier와 Card Table** - 세대 간 참조 추적의 핵심 메커니즘
5. **실제 성능 개선 효과** - 기존 GC 대비 10배 성능 향상의 비밀

## 1. Weak Generational Hypothesis

### 1.1 David Ungar의 관찰 (1984년)

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

### 1.2 세대별 GC의 핵심 아이디어

```text
전통적 GC:
[전체 힙을 매번 스캔] - 느림!

세대별 GC:
[Young Gen만 자주 스캔] + [Old Gen은 가끔 스캔] - 빠름!

핵심 통찰:
- Young Generation: 작고, 자주 GC, 빠름
- Old Generation: 크지만, 가끔 GC, 상대적으로 느림
```

## 2. Generational GC 구현

### 2.1 메모리 구조

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
```

### 2.2 Minor GC (Young Generation 수집)

```c++
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
```

### 2.3 Write Barrier: 핵심 메커니즘

```c++
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

    void scan_card(size_t card_index, std::vector<Object*>& roots) {
        // 해당 카드 영역의 모든 객체 스캔
        uint8_t* card_start = old.space + (card_index * CARD_SIZE);
        uint8_t* card_end = card_start + CARD_SIZE;

        for (uint8_t* addr = card_start; addr < card_end; ) {
            Object* obj = reinterpret_cast<Object*>(addr);
            
            // 이 객체의 참조들 중 Young Generation 가리키는 것 찾기
            for (auto ref : obj->references) {
                if (is_in_young(*ref)) {
                    roots.push_back(*ref);  // Minor GC root에 추가
                }
            }
            
            addr += obj->size;
        }
    }
};
```

## 3. 성능 분석과 최적화

### 3.1 실제 성능 비교

```c++
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

void simulate_web_server(GC* gc, int requests) {
    for (int i = 0; i < requests; i++) {
        // 요청당 많은 임시 객체 생성 (전형적인 패턴)
        auto* request = gc->allocate(sizeof(Request));
        auto* headers = gc->allocate(1024);  // 헤더 파싱
        auto* params = gc->allocate(512);    // 파라미터 파싱
        auto* tokens = gc->allocate(256);    // 토큰화
        auto* result = gc->allocate(2048);   // 응답 생성
        
        // 요청 처리...
        process_request(request, headers, params, tokens, result);
        
        // 메서드 끝 = 모든 임시 객체가 unreachable
        // (다음 Minor GC에서 제거될 예정)
    }
}
```

### 3.2 메모리 레이아웃 최적화

```c++
class OptimizedGenerationalGC {
private:
    // JVM과 같은 최적화된 구조
    struct OptimizedYoungGen {
        // Eden: 새 객체 할당 (전체 Young의 80%)
        uint8_t* eden;
        size_t eden_size = young_total_size * 0.8;
        
        // Survivor: From/To 공간 (각각 10%)
        uint8_t* survivor0;
        uint8_t* survivor1;
        size_t survivor_size = young_total_size * 0.1;
        
        // 현재 활성 survivor
        uint8_t* active_survivor;
        uint8_t* inactive_survivor;
        
        // Thread-Local Allocation Buffers (TLAB)
        struct TLAB {
            uint8_t* start;
            uint8_t* current;
            uint8_t* end;
        };
        
        std::map<std::thread::id, TLAB> tlabs;
    } young;
    
    // 승격 임계값 (기본: 15번 살아남으면 Old로)
    static constexpr uint8_t PROMOTION_THRESHOLD = 15;
    
public:
    // Thread-safe allocation with TLAB
    void* allocate(size_t size) {
        auto tid = std::this_thread::get_id();
        auto& tlab = young.tlabs[tid];
        
        // TLAB에서 빠른 할당 시도
        if (tlab.current + size <= tlab.end) {
            void* ptr = tlab.current;
            tlab.current += size;
            return ptr;
        }
        
        // TLAB 부족 -> 새 TLAB 할당
        return allocate_new_tlab(size);
    }
    
private:
    void* allocate_new_tlab(size_t requested_size) {
        // Eden에서 새 TLAB 할당 (보통 64KB)
        size_t tlab_size = std::max(requested_size, 64 * 1024);
        
        if (young.allocation_ptr + tlab_size > young.eden + young.eden_size) {
            // Eden 부족 -> Minor GC
            minor_gc();
        }
        
        // 새 TLAB 설정
        auto tid = std::this_thread::get_id();
        auto& tlab = young.tlabs[tid];
        tlab.start = young.allocation_ptr;
        tlab.current = tlab.start + requested_size;
        tlab.end = tlab.start + tlab_size;
        
        young.allocation_ptr += tlab_size;
        
        return tlab.start;
    }
};
```

## 4. 실제 JVM 구현 사례

### 4.1 HotSpot JVM의 세대별 GC

```java
// HotSpot JVM 설정 예시
public class GCTuningExample {
    public static void main(String[] args) {
        /*
        JVM 옵션 설명:
        -Xmx4g                    : 최대 힙 4GB
        -Xms4g                    : 초기 힙 4GB (같게 설정으로 리사이징 방지)
        -XX:NewRatio=3            : Old:Young = 3:1 비율
        -XX:SurvivorRatio=8       : Eden:Survivor = 8:1:1 비율
        -XX:MaxTenuringThreshold=15 : 15번 살아남으면 Old로 승격
        
        메모리 구조:
        Total Heap: 4GB
        ├── Young Generation: 1GB (25%)
        │   ├── Eden: 800MB (80%)
        │   ├── Survivor0: 100MB (10%)
        │   └── Survivor1: 100MB (10%)
        └── Old Generation: 3GB (75%)
        */
        
        // 전형적인 웹 애플리케이션 패턴
        for (int i = 0; i < 1000000; i++) {
            processRequest(createRequest()); // 99% 즉시 가비지됨
        }
    }
    
    static Request createRequest() {
        // 이런 객체들이 Eden에 할당되고
        // 메서드 끝나면 즉시 가비지가 됨
        return new Request(
            parseHeaders(getRawHeaders()),
            parseBody(getRawBody()),
            extractCookies(getRawCookies())
        );
    }
}
```

### 4.2 G1GC의 세대별 접근

```java
// G1GC는 Region 기반이지만 여전히 세대별 개념 사용
public class G1Example {
    /*
    G1GC 특징:
    - Region 기반 (각 2MB)
    - 각 Region은 Eden, Survivor, Old 중 하나
    - 동적으로 세대 간 비율 조정
    
    -XX:+UseG1GC
    -XX:MaxGCPauseMillis=200    // 목표 pause time 200ms
    -XX:G1HeapRegionSize=16m    // Region 크기 16MB
    -XX:G1NewSizePercent=20     // Young Gen 최소 20%
    -XX:G1MaxNewSizePercent=40  // Young Gen 최대 40%
    */
}
```

## 핵심 요점

### 1. Weak Generational Hypothesis의 활용

대부분의 객체가 젊어서 죽는다는 관찰을 바탕으로 Young Generation만 자주 수집하여 성능을 크게 개선

### 2. Write Barrier의 중요성

Old->Young 참조를 효율적으로 추적하기 위한 핵심 메커니즘. Card Table을 통해 전체 Old Generation 스캔 없이도 Minor GC 수행

### 3. TLAB을 통한 할당 최적화

Thread-Local Allocation Buffer로 멀티스레드 환경에서도 빠른 객체 할당 보장

### 4. 실제 성능 개선

- Minor GC: 1-10ms (매우 빠름)
- Major GC: 100ms-1s (상대적으로 느리지만 빈도 낮음)
- 전체적으로 기존 GC 대비 5-10배 성능 향상

---

**다음**: [02c-concurrent-gc.md](02c-concurrent-gc.md)에서 Stop-the-world를 제거하는 동시 실행 GC 기술을 학습합니다.
