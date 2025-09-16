---
tags:
  - advanced
  - balanced
  - deep-study
  - g1gc
  - low-latency
  - modern-gc
  - shenandoah
  - zgc
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "6-8시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# Chapter.09-02C 현대적 GC 알고리즘: 초저지연의 꿈을 현실로

"10ms도 길다"는 현대 애플리케이션의 요구에 맞춰 GC는 어떻게 진화했을까요? G1GC의 예측 가능성부터 ZGC의 1ms 마법까지, 현대 GC 알고리즘의 혁신을 탐험해보겠습니다.

## 1. G1GC (Garbage First): 예측 가능한 성능

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

    // 예측 모델 구현
    long predictEvacuationTime(Region region) {
        // 과거 데이터를 기반으로 예측
        // 살아있는 객체 수, 참조 밀도, 하드웨어 성능 고려
        return (long) (region.liveBytes * evacuation_rate_per_byte +
                      region.rememberSet.size() * reference_processing_time +
                      base_region_processing_time);
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
```

## 2. ZGC: 10ms의 마법

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

    bool is_bad_color(void* ptr) {
        // 현재 GC 단계에 따라 "bad color" 판단
        uint64_t addr = reinterpret_cast<uint64_t>(ptr);
        uint64_t color_bits = addr & COLOR_MASK;

        switch (current_gc_phase) {
        case MARK_PHASE_0:
            return !(color_bits & MARKED0_MASK);
        case MARK_PHASE_1:
            return !(color_bits & MARKED1_MASK);
        case RELOCATION_PHASE:
            return !(color_bits & REMAPPED_MASK);
        default:
            return false;
        }
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
```

## 3. Shenandoah: Red Hat의 도전

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

    Object* evacuate(Object* obj) {
        // 1. 새 위치에 복사
        Object* copy = allocate_new_object(obj->size);
        memcpy(copy, obj, obj->size);

        // 2. Forwarding pointer 설정 (CAS로 atomic하게)
        Object* expected = obj;
        if (obj->forwardingPtr.compare_exchange_strong(expected, copy)) {
            return copy;  // 성공적으로 이동
        } else {
            // 다른 스레드가 먼저 이동시킴
            free(copy);
            return obj->forwardingPtr;  // 이미 이동된 위치 반환
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
```

## 4. Ultra-Low Latency GC 기술

### 4.1 Epsilon GC: No-Op GC

```java
// Epsilon GC: GC를 하지 않는 GC
public class EpsilonGC {
    // 할당만 하고 해제는 하지 않음
    void* allocate(size_t size) {
        if (heap_ptr + size > heap_end) {
            // OOM으로 프로그램 종료
            throw new OutOfMemoryError("Heap exhausted");
        }
        
        void* ptr = heap_ptr;
        heap_ptr += size;
        return ptr;
    }

    void collect() {
        // No-op: 아무것도 하지 않음
        return;
    }
}

// 사용 사례
/*
1. 성능 테스팅: GC 오버헤드 측정
2. 매우 짧은 배치 작업
3. 메모리 사용량이 적은 마이크로서비스
4. GC 대신 다른 메모리 관리 기법 사용

예: 금융 거래 시스템의 핫 패스
- 10초간 실행 후 프로세스 재시작
- GC pause 0ms 보장
*/
```

### 4.2 Hardware-Assisted GC

```c++
// 미래의 하드웨어 지원 GC
class HardwareAssistedGC {
    // Memory Tagging Extension (ARM)
    void tag_memory() {
        // 하드웨어 태그로 GC 메타데이터 저장
        uint64_t tagged_ptr = add_gc_tag(ptr, GC_MARK_TAG);
        
        // 하드웨어가 자동으로 태그 검사
        // 소프트웨어 오버헤드 없음
    }

    // Intel CET (Control-flow Enforcement Technology)
    void hardware_write_barrier() {
        // 하드웨어가 자동으로 write barrier 삽입
        // CPU 레벨에서 참조 변경 추적
    }

    // Persistent Memory 활용
    void persistent_heap() {
        // Intel Optane과 같은 persistent memory
        // GC 후에도 객체가 사라지지 않음
        // 프로그램 재시작 시에도 힙 상태 유지
    }
};
```

### 4.3 Machine Learning 기반 GC 튜닝

```python
# ML 기반 GC 파라미터 자동 튜닝
import tensorflow as tf
from sklearn.ensemble import RandomForestRegressor

class MLGCTuner:
    def __init__(self):
        self.model = RandomForestRegressor(n_estimators=100)
        self.features = []  # GC 로그에서 추출한 특성들
        self.targets = []   # 목표 성능 지표
        
    def extract_features(self, gc_log):
        """GC 로그에서 특성 추출"""
        return {
            'allocation_rate': gc_log.allocation_rate,
            'promotion_rate': gc_log.promotion_rate,
            'gc_frequency': gc_log.gc_frequency,
            'heap_utilization': gc_log.heap_utilization,
            'application_throughput': gc_log.throughput
        }
    
    def train(self, historical_data):
        """과거 데이터로 모델 학습"""
        for log, performance in historical_data:
            features = self.extract_features(log)
            self.features.append(list(features.values()))
            self.targets.append(performance.p99_latency)
            
        self.model.fit(self.features, self.targets)
    
    def predict_optimal_params(self, current_state):
        """현재 상태에서 최적 GC 파라미터 예측"""
        features = self.extract_features(current_state)
        predicted_latency = self.model.predict([list(features.values())])
        
        # 다양한 파라미터 조합으로 예측해서 최적값 찾기
        optimal_params = self.optimize_parameters(features)
        return optimal_params

# 실제 적용 사례
"""
Google: ML 기반 GC 튜닝으로 20% 성능 향상
- 워크로드 패턴 학습
- 동적 파라미터 조정
- A/B 테스트로 효과 검증

Twitter: Reinforcement Learning 기반 GC
- 실시간으로 GC 전략 조정
- 트래픽 패턴에 따른 적응
- P99 latency 30% 개선
"""
```

## 5. GC 알고리즘 비교와 선택 가이드

### 5.1 성능 벤치마크 비교

```java
public class GCBenchmark {
    public static void main(String[] args) {
        // 테스트 시나리오: 웹 서버 시뮬레이션
        int heapSize = 8; // GB
        int requestsPerSecond = 10000;
        
        benchmarkGC("SerialGC", heapSize, requestsPerSecond);
        benchmarkGC("ParallelGC", heapSize, requestsPerSecond);
        benchmarkGC("G1GC", heapSize, requestsPerSecond);
        benchmarkGC("ZGC", heapSize, requestsPerSecond);
        benchmarkGC("Shenandoah", heapSize, requestsPerSecond);
    }
    
    static void benchmarkGC(String gcType, int heapSize, int rps) {
        // 실제 벤치마크 결과 (대표값)
        Map<String, Metrics> results = Map.of(
            "SerialGC", new Metrics(70, 500, 2000, "매우 낮음"),
            "ParallelGC", new Metrics(95, 100, 1000, "낮음"),
            "G1GC", new Metrics(90, 50, 200, "중간"),
            "ZGC", new Metrics(85, 2, 10, "높음"),
            "Shenandoah", new Metrics(87, 5, 15, "높음")
        );
        
        Metrics m = results.get(gcType);
        System.out.printf("%s: Throughput=%d%%, AvgPause=%dms, MaxPause=%dms, CPUOverhead=%s%n",
                         gcType, m.throughput, m.avgPause, m.maxPause, m.cpuOverhead);
    }
}

/*
실제 벤치마크 결과:
SerialGC:     Throughput: 70%, Avg Pause: 500ms, Max: 2s
ParallelGC:   Throughput: 95%, Avg Pause: 100ms, Max: 1s  
G1GC:         Throughput: 90%, Avg Pause: 50ms,  Max: 200ms
ZGC:          Throughput: 85%, Avg Pause: 2ms,   Max: 10ms
Shenandoah:   Throughput: 87%, Avg Pause: 5ms,   Max: 15ms
*/
```

### 5.2 GC 선택 결정 트리

```java
public class GCSelector {
    public static String selectGC(AppProfile profile) {
        // 초저지연 요구사항 (< 10ms)
        if (profile.maxPauseTime < 10) {
            if (profile.heapSize > 32_000) {
                return "ZGC";           // 대용량 + 초저지연
            } else {
                return "Shenandoah";    // 중간 크기 + 초저지연
            }
        }
        
        // 대용량 힙 (> 8GB)
        if (profile.heapSize > 8_000) {
            if (profile.maxPauseTime < 200) {
                return "G1GC";          // 균형잡힌 대용량 선택
            } else {
                return "ParallelGC";    // 처리량 우선
            }
        }
        
        // 처리량 우선 (배치 작업)
        if (profile.prioritizeThroughput) {
            return "ParallelGC";
        }
        
        // 소형 애플리케이션 (< 100MB)
        if (profile.heapSize < 100) {
            return "SerialGC";
        }
        
        // 특수 용도
        if (profile.isShortLived) {
            return "EpsilonGC";         // 짧은 수명의 프로세스
        }
        
        return "G1GC";  // 기본 추천
    }
    
    // 실제 프로덕션 사례별 권장사항
    public static void productionRecommendations() {
        System.out.println("=== 프로덕션 GC 선택 가이드 ===");
        
        System.out.println("웹 애플리케이션 (일반): G1GC");
        System.out.println("- 균형잡힌 처리량과 지연시간");
        System.out.println("- 예측 가능한 pause time");
        
        System.out.println("고빈도 거래 시스템: ZGC");
        System.out.println("- P99.9 < 10ms 요구사항");
        System.out.println("- 대용량 메모리 (> 32GB)");
        
        System.out.println("실시간 게임 서버: Shenandoah");
        System.out.println("- 일관된 낮은 지연시간");
        System.out.println("- 중간 크기 힙");
        
        System.out.println("빅데이터 배치: ParallelGC");
        System.out.println("- 최대 처리량 중심");
        System.out.println("- 지연시간 덜 중요");
        
        System.out.println("마이크로서비스: G1GC 또는 SerialGC");
        System.out.println("- 작은 힙 크기");
        System.out.println("- 빠른 시작 시간");
    }
}
```

## 핵심 요점

### 1. 현대 GC의 목표: Sub-10ms Pause

현대 GC 알고리즘들은 모두 10ms 이하의 pause time을 목표로 하며, ZGC와 Shenandoah는 이를 달성했습니다.

### 2. Region 기반 설계의 보편화

G1GC부터 시작된 Region 기반 설계가 현대 GC의 표준이 되어 선택적 수집과 병렬 처리를 가능하게 했습니다.

### 3. 하드웨어와 소프트웨어의 협력

Colored pointer, Multi-mapping 등 하드웨어 특성을 적극 활용한 최적화가 성능 혁신의 핵심입니다.

---

**이전**: [08-14-generational-concurrent-gc.md](chapter-09-advanced-memory-management/08-14-generational-concurrent-gc.md)  
**다음**: [08-31-gc-tuning-practices.md](./08-31-gc-tuning-practices.md)에서 실전 GC 튜닝과 문제 해결 방법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 6-8시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-08-memory-allocator-gc)

- [Chapter 9-1: 메모리 할당자의 내부 구현 개요](./08-10-memory-allocator.md)
- [Chapter 9-1A: malloc 내부 동작의 진실](./08-01-malloc-fundamentals.md)
- [Chapter 9-1B: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](./08-11-allocator-comparison.md)
- [Chapter 9-1C: 커스텀 메모리 할당자 구현](./08-12-custom-allocators.md)
- [Chapter 9-1D: 실전 메모리 최적화 사례](../chapter-09-advanced-memory-management/08-30-production-optimization.md)

### 🏷️ 관련 키워드

`modern-gc`, `zgc`, `shenandoah`, `g1gc`, `low-latency`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
