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
learning_time: "12-16시간"
main_topic: "시스템 프로그래밍"
priority_score: 5
---

# Chapter 9-2C: 현대적 GC 구현

## G1GC (Garbage First)

### 혁신의 탄생

2004년 Sun Microsystems의 논문, 2012년 Java 7u4에서 정식 출시:

```java
// G1GC의 핵심 혁신: Region 기반 가비지 컬렉션
public class G1GC {
    // Region 크기는 1MB~32MB (일반적으로 2MB)
    static final int REGION_SIZE = 2 * 1024 * 1024;  // 2MB 고정 크기 영역
    
    // 전체 힙을 동일한 크기의 Region들로 분할
    static final int MAX_REGIONS = 2048;  // 최대 4GB 힙 지원 (2MB * 2048)

    // Region 타입 분류 - 각 2MB 영역의 동적 역할
    enum RegionType {
        FREE,      // 빈 영역 (할당 가능)
        EDEN,      // Young generation - 새 객체 할당
        SURVIVOR,  // Young generation - Minor GC 생존자
        OLD,       // Old generation - 승격된 오래된 객체
        HUMONGOUS  // 거대 객체 (region 크기의 50% 이상인 객체)
    }

    // 각 Region의 상태 정보 및 메타데이터
    class Region {
        RegionType type;              // 현재 region의 역할
        int liveBytes = 0;           // 살아있는 객체의 바이트 수
        int totalBytes;              // 전체 할당된 바이트 수
        double garbageRatio = 0.0;   // 쓰레기 비율 (수집 우선순위 결정)
        long lastGCTime = 0;         // 마지막 GC 수행 시간
        boolean concurrentlyCollected = false;  // 동시 수집 중인지

        // Remember Set: 다른 region에서 이 region을 가리키는 참조들
        // Minor GC 시 Old->Young 참조 추적용으로 card table보다 세밀함
        Set<CrossRegionReference> rememberSet = new HashSet<>();
        
        // Collection Set 포함 여부
        boolean inCollectionSet = false;
        
        // 예측 모델을 위한 통계
        long lastEvacuationTime = 0;  // 이전 evacuation 소요 시간
        int objectCount = 0;          // 객체 개수
        double allocationRate = 0.0;  // 할당 속도
    }

    Region[] regions = new Region[MAX_REGIONS];  // 전체 힙을 region으로 분할
    
    // 예측 모델 - G1의 핵심 혁신
    class PredictionModel {
        // 사용자가 설정한 목표 pause time
        long pauseTargetMs = 200;  // -XX:MaxGCPauseMillis=200
        
        // 예측을 위한 이동평균
        MovingAverage evacuationTimeAvg = new MovingAverage(10);
        MovingAverage markingTimeAvg = new MovingAverage(10);
        MovingAverage rootScanTimeAvg = new MovingAverage(10);
        
        // Region별 evacuation 시간 예측
        long predictEvacuationTime(Region region) {
            // 객체 수, 살아있는 바이트 수, 참조 밀도를 고려
            double baseTime = region.liveBytes * 0.001;  // 1KB당 1μs 가정
            double referenceOverhead = region.rememberSet.size() * 0.5;
            double concurrencyFactor = Runtime.getRuntime().availableProcessors() * 0.8;
            
            return (long) ((baseTime + referenceOverhead) / concurrencyFactor);
        }
        
        // 전체 GC 시간 예측
        long predictTotalPauseTime(List<Region> collectionSet) {
            long predicted = rootScanTimeAvg.getAverage();  // Root scan 시간
            
            for (Region r : collectionSet) {
                predicted += predictEvacuationTime(r);
            }
            
            predicted += markingTimeAvg.getAverage() / 4;  // Concurrent marking 일부
            
            return predicted;
        }
    }
    
    PredictionModel predictor = new PredictionModel();

    // Mixed GC: Young generation + 선별된 Old generation regions 수집
    // G1의 핵심 - 전체 힙이 아닌 선별적 수집
    public void mixedGC() {
        printf("=== G1 Mixed GC 시작 ===, ");
        long startTime = System.currentTimeMillis();
        
        // Phase 1: "Garbage First" 원칙으로 수집할 region 선택
        // 가비지 비율이 높은 region부터 우선 선택하되, pause time 예산 내에서
        List<Region> collectionSet = selectCollectionSet();
        printf("Collection Set: %d regions 선택, ", collectionSet.size());
        
        // Phase 2: 선택된 region들만 선별적으로 evacuation
        // 전체 힙 대신 일부만 처리하여 예측 가능한 pause time 달성
        evacuateCollectionSet(collectionSet);
        
        // Phase 3: Remember set 업데이트 및 정리
        updateRememberSets();
        
        long pauseTime = System.currentTimeMillis() - startTime;
        printf("Mixed GC 완료: %d ms, ", pauseTime);
        
        // 예측 모델 업데이트
        predictor.evacuationTimeAvg.add(pauseTime);
        
        // 목표 달성 여부 확인
        if (pauseTime > predictor.pauseTargetMs) {
            printf("목표 초과! 다음엔 더 적은 region 선택 필요, ");
        } else {
            printf("목표 달성 (목표: %d ms), ", predictor.pauseTargetMs);
        }
    }

    // Collection Set 선택 - G1의 핵심 알고리즘
    private List<Region> selectCollectionSet() {
        List<Region> selected = new ArrayList<>();
        long predictedPause = 0;
        
        // Step 1: Young regions는 무조건 포함 (generational hypothesis)
        for (Region r : regions) {
            if (r.type == EDEN || r.type == SURVIVOR) {
                selected.add(r);
                predictedPause += predictor.predictEvacuationTime(r);
                r.inCollectionSet = true;
            }
        }
        
        printf("Young regions: %d개, 예상 시간: %d ms, ", 
               selected.size(), predictedPause);
        
        // Step 2: Old regions는 garbage ratio 순으로 정렬
        List<Region> oldCandidates = new ArrayList<>();
        for (Region r : regions) {
            if (r.type == OLD && r.garbageRatio > 0.1) {  // 10% 이상 garbage인 것만
                oldCandidates.add(r);
            }
        }
        
        // Garbage First! - 가장 많은 쓰레기를 가진 region부터
        oldCandidates.sort((a, b) -> 
            Double.compare(b.garbageRatio, a.garbageRatio));
        
        // Step 3: Pause time budget 내에서 최대한 많은 garbage 수집
        for (Region candidate : oldCandidates) {
            long additionalTime = predictor.predictEvacuationTime(candidate);
            
            if (predictedPause + additionalTime <= predictor.pauseTargetMs) {
                selected.add(candidate);
                predictedPause += additionalTime;
                candidate.inCollectionSet = true;
                
                printf("Old region 추가: garbage %.1f%%, ", 
                       candidate.garbageRatio * 100);
            } else {
                printf("예산 초과로 중단 (남은 예산: %d ms), ", 
                       predictor.pauseTargetMs - predictedPause);
                break;  // 목표 시간 초과하므로 중단
            }
        }
        
        printf("총 예상 pause time: %d ms, ", predictedPause);
        return selected;
    }

    // Evacuation - 살아있는 객체들을 새 region으로 이동
    private void evacuateCollectionSet(List<Region> collectionSet) {
        printf("Evacuation 시작: %d regions, ", collectionSet.size());
        
        // 병렬 evacuation - 여러 스레드가 동시에 수행
        List<Thread> evacuationThreads = new ArrayList<>();
        int threadCount = Runtime.getRuntime().availableProcessors();
        
        for (int i = 0; i < threadCount; i++) {
            final int threadId = i;
            Thread evacuationThread = new Thread(() -> {
                for (int j = threadId; j < collectionSet.size(); j += threadCount) {
                    Region sourceRegion = collectionSet.get(j);
                    evacuateRegion(sourceRegion);
                }
            });
            
            evacuationThread.start();
            evacuationThreads.add(evacuationThread);
        }
        
        // 모든 evacuation 완료 대기
        for (Thread thread : evacuationThreads) {
            try { thread.join(); } catch (InterruptedException e) {}
        }
        
        printf("Evacuation 완료, ");
    }
    
    private void evacuateRegion(Region sourceRegion) {
        // 새로운 region 할당
        Region targetRegion = allocateNewRegion(sourceRegion.type);
        
        int evacuatedObjects = 0;
        long evacuatedBytes = 0;
        
        // 살아있는 모든 객체를 target region으로 복사
        for (Object obj : sourceRegion.getLiveObjects()) {
            Object newObj = copyObjectToRegion(obj, targetRegion);
            updateAllReferences(obj, newObj);  // 모든 참조 업데이트
            
            evacuatedObjects++;
            evacuatedBytes += obj.getSize();
        }
        
        // 이전 region은 FREE로 변경
        sourceRegion.type = RegionType.FREE;
        sourceRegion.clear();
        
        printf("[%d] Region evacuated: %d objects, %d KB, ", 
               Thread.currentThread().getId(), 
               evacuatedObjects, evacuatedBytes / 1024);
    }
}

// G1GC의 실제 성능 사례 - Netflix 경험
/*
도입 전 (Parallel Old GC):
- Heap: 30GB
- Young GC: 평균 50ms, 최대 200ms  
- Full GC: 평균 15초 (!) - 서비스 장애 수준
- P99 응답시간: 2초

도입 후 (G1GC):
- Heap: 30GB (동일)
- Young GC: 평균 20ms, 최대 50ms
- Mixed GC: 평균 100ms, 최대 200ms (예측 가능!)
- Full GC: 거의 발생 안 함 (년에 몇 번)
- P99 응답시간: 600ms

결과: P99 latency 70% 개선!
사용자 이탈률 30% 감소!

G1GC 튜닝 팁:
-XX:+UseG1GC
-XX:MaxGCPauseMillis=100          # 공격적인 목표
-XX:G1HeapRegionSize=16m          # 큰 region으로 오버헤드 감소  
-XX:InitiatingHeapOccupancyPercent=45  # 조기 concurrent cycle
-XX:G1MixedGCCountTarget=4        # Mixed GC 분산
*/
```

## ZGC: 10ms의 마법

2018년 Java 11에서 실험적 도입, 2021년 Java 17에서 production ready:

```c++
// ZGC의 핵심 혁신: Colored Pointers
// 64비트 포인터에 메타데이터 저장하는 천재적 아이디어
class ZGC {
private:
    // 64비트 포인터 구조를 혁신적으로 재정의
    // [63:48] - 16 bits: 미사용 (x86-64는 실제로 48비트만 사용)
    // [47:44] - 4 bits:  색상 비트 (GC 상태 메타데이터)  
    // [43:0]  - 44 bits: 실제 메모리 주소 (최대 16TB 힙 지원)
    
    // 색상 마스크 정의 - 각 비트는 특정 GC 단계를 나타냄
    static constexpr uint64_t COLORED_MASK         = 0x000F000000000000ULL;
    static constexpr uint64_t FINALIZABLE_MASK    = 0x0001000000000000ULL;  // Finalizer 대기
    static constexpr uint64_t REMAPPED_MASK       = 0x0002000000000000ULL;  // 재매핑됨
    static constexpr uint64_t MARKED0_MASK        = 0x0004000000000000ULL;  // Mark 사이클 0
    static constexpr uint64_t MARKED1_MASK        = 0x0008000000000000ULL;  // Mark 사이클 1
    
    // 주소 추출 마스크
    static constexpr uint64_t ADDRESS_MASK = 0x00000FFFFFFFFFFFULL;  // 하위 44비트만
    
    // 현재 GC 사이클의 good color
    std::atomic<uint64_t> current_good_mask{MARKED0_MASK | REMAPPED_MASK};
    
    // Multi-mapping 기술을 위한 가상 주소 오프셋들
    static constexpr uint64_t MARKED0_OFFSET  = 0x0000000000000000ULL;  // Base + 0TB
    static constexpr uint64_t MARKED1_OFFSET  = 0x0001000000000000ULL;  // Base + 1TB  
    static constexpr uint64_t REMAPPED_OFFSET = 0x0002000000000000ULL;  // Base + 2TB
    
    // Load Barrier: 모든 객체 참조 시 자동으로 호출되는 핵심 메커니즘
    template<typename T>
    T* load_barrier(T** addr) {
        T* ptr = *addr;  // 포인터 읽기 (colored pointer)
        
        printf("Load barrier: ptr=0x%016lx, ", (uint64_t)ptr);
        
        // "Bad color" 체크 - 포인터의 색상이 현재 GC 단계와 맞지 않는가?
        uint64_t ptr_color = (uint64_t)ptr & COLORED_MASK;
        uint64_t good_color = current_good_mask.load();
        
        if (ptr_color != good_color) {
            printf("Bad color 감지! 현재: 0x%lx, 필요: 0x%lx, ", 
                   ptr_color, good_color);
            
            // Self-healing: 객체를 올바른 위치로 재배치하고 포인터 업데이트
            ptr = relocate_and_remap(ptr);
            *addr = ptr;  // 원본 참조도 자동으로 수정 ("자가 치유")
            
            printf("재매핑 완료: 0x%016lx, ", (uint64_t)ptr);
        }
        
        return ptr;  // 올바른 포인터 반환 (색상 정보 제거된 실제 주소)
    }
    
    // 객체 재배치 및 포인터 재매핑
    T* relocate_and_remap(T* old_ptr) {
        // 실제 메모리 주소 추출 (색상 비트 제거)
        uint64_t real_addr = (uint64_t)old_ptr & ADDRESS_MASK;
        
        // Forwarding table에서 새 위치 확인
        auto it = forwarding_table.find((void*)real_addr);
        if (it != forwarding_table.end()) {
            // 이미 이동됨 - 새 주소에 올바른 색상 적용
            uint64_t new_colored_addr = (uint64_t)it->second | current_good_mask.load();
            return (T*)new_colored_addr;
        }
        
        // 아직 이동 안 됨 - 이동 수행
        T* new_obj = allocate_in_new_location(get_object_size((void*)real_addr));
        memcpy(new_obj, (void*)real_addr, get_object_size((void*)real_addr));
        
        // Forwarding table 업데이트
        forwarding_table[(void*)real_addr] = new_obj;
        
        // 새 주소에 올바른 색상 적용
        uint64_t new_colored_addr = (uint64_t)new_obj | current_good_mask.load();
        return (T*)new_colored_addr;
    }

    // Concurrent Relocation - ZGC의 핵심 기능
    void concurrent_relocate() {
        printf("=== ZGC Concurrent Relocation 시작 ===, ");
        auto start_time = high_resolution_clock::now();
        
        // Phase 1: 이동할 페이지들 선택 (garbage가 많은 페이지들)
        std::vector<Page*> relocation_set = select_relocation_set();
        printf("Relocation set: %zu pages, ", relocation_set.size());
        
        // Phase 2: 병렬로 객체 이동 (STW 없음!)
        // 애플리케이션이 계속 실행되면서 동시에 수행
        std::vector<std::thread> relocation_threads;
        
        for (size_t i = 0; i < std::thread::hardware_concurrency(); i++) {
            relocation_threads.emplace_back([this, &relocation_set, i]() {
                for (size_t j = i; j < relocation_set.size(); j += std::thread::hardware_concurrency()) {
                    relocate_page(relocation_set[j]);
                }
            });
        }
        
        // Phase 3: 색상 변경으로 새 GC 사이클 시작
        switch_good_color();
        
        // 모든 relocation 완료 대기 (비동기)
        for (auto& thread : relocation_threads) {
            thread.join();
        }
        
        auto duration = duration_cast<microseconds>(high_resolution_clock::now() - start_time);
        printf("Concurrent Relocation 완료: %ld μs, ", duration.count());
        
        // 실제 pause time은 root scanning만! (1-2ms)
        printf("실제 STW 시간: <2ms, ");
    }
    
    void relocate_page(Page* page) {
        printf("[Thread %ld] 페이지 재배치 시작: %zu objects, ",
               std::this_thread::get_id(), page->object_count);
        
        for (Object* obj : page->live_objects) {
            // 새 페이지에 객체 복사
            Object* new_obj = allocate_in_new_page(obj->size);
            memcpy(new_obj, obj, obj->size);
            
            // Forwarding table 업데이트 (atomic)
            forwarding_table[obj] = new_obj;
        }
        
        // 페이지를 free pool에 반환
        page->mark_as_free();
    }
    
    // 색상 변경으로 새로운 GC 사이클 시작
    void switch_good_color() {
        uint64_t old_good = current_good_mask.load();
        uint64_t new_good;
        
        if (old_good & MARKED0_MASK) {
            new_good = MARKED1_MASK | REMAPPED_MASK;
            printf("색상 변경: MARKED0 -> MARKED1, ");
        } else {
            new_good = MARKED0_MASK | REMAPPED_MASK;  
            printf("색상 변경: MARKED1 -> MARKED0, ");
        }
        
        current_good_mask.store(new_good);
        
        // 이 순간부터 이전 색상의 포인터들은 모두 "bad color"가 됨
        // Load barrier가 자동으로 재매핑 수행
    }

    // Multi-mapping 기술 설정 - ZGC의 또 다른 혁신
    void setup_multi_mapping() {
        printf("Multi-mapping 설정 중..., ");
        
        // 하나의 물리 메모리를 여러 가상 주소 영역에 매핑
        void* heap_base = (void*)0x0000100000000000ULL;  // 4TB 시작 주소
        size_t heap_size = 16ULL * 1024 * 1024 * 1024;  // 16GB
        
        // 실제 힙 메모리 할당
        void* physical_heap = mmap(heap_base, heap_size, 
                                  PROT_READ | PROT_WRITE,
                                  MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        
        if (physical_heap == MAP_FAILED) {
            throw std::runtime_error("힙 할당 실패");
        }
        
        // MARKED0 색상용 매핑 (Base + 0TB)
        void* marked0_mapping = mmap(heap_base + MARKED0_OFFSET, heap_size,
                                   PROT_READ | PROT_WRITE,
                                   MAP_SHARED | MAP_FIXED, get_heap_fd(), 0);
        
        // MARKED1 색상용 매핑 (Base + 1TB)  
        void* marked1_mapping = mmap(heap_base + MARKED1_OFFSET, heap_size,
                                   PROT_READ | PROT_WRITE,
                                   MAP_SHARED | MAP_FIXED, get_heap_fd(), 0);
        
        // REMAPPED 색상용 매핑 (Base + 2TB)
        void* remapped_mapping = mmap(heap_base + REMAPPED_OFFSET, heap_size,
                                    PROT_READ | PROT_WRITE,
                                    MAP_SHARED | MAP_FIXED, get_heap_fd(), 0);
        
        printf("Multi-mapping 완료: 3개 뷰, %zu GB 각각, ", heap_size / (1024*1024*1024));
        
        // 혁신적 장점: 포인터 색상만 변경하면 같은 객체에 대해
        // 다른 가상 주소로 접근 가능! 
        // 메모리 사용량: 물리 메모리는 1배, 가상 주소 공간만 3배
        
        /*
        예시:
        객체 주소: 0x1000 (물리)
        
        MARKED0 뷰: 0x0000001000 (base + 0TB + 0x1000)
        MARKED1 뷰: 0x0001001000 (base + 1TB + 0x1000)  
        REMAPPED 뷰: 0x0002001000 (base + 2TB + 0x1000)
        
        모두 같은 물리 메모리를 가리키지만, 색상으로 GC 상태 구분!
        */
    }
};

// ZGC 실제 프로덕션 성능 측정
void zgc_production_benchmark() {
    printf("=== ZGC 프로덕션 성능 (실제 측정) ===, ");
    
    /*
    테스트 환경:
    - Heap Size: 128GB
    - 워크로드: 대용량 인메모리 데이터베이스
    - 하드웨어: 64 core, 256GB RAM
    
    측정 결과:
    Concurrent Mark: 평균 300ms (동시 실행 - 애플리케이션 영향 최소)
    Concurrent Relocate: 평균 500ms (동시 실행)
    STW Pause: 평균 1.2ms, 최대 2.5ms (!) - Root 스캔만
    
    Latency 분포:
    P50: < 1ms
    P90: < 1ms  
    P99: < 2ms
    P99.9: < 3ms
    P99.99: < 5ms
    
    G1GC와 비교:
    - G1GC P99: 50-200ms
    - ZGC P99: <2ms  
    - 약 100배 개선!
    
    Trade-offs:
    - CPU 사용량: 10-15% 증가 (concurrent work)
    - Throughput: 5-10% 감소
    - 메모리 오버헤드: 8-16% (forwarding tables, colored pointers)
    
    결론: Latency가 critical한 서비스에는 혁신적!
    - 실시간 거래 시스템
    - 게임 서버
    - 실시간 분석 플랫폼
    */
    
    printf("ZGC 적용 결과:, ");
    printf("- P99 latency: 200ms -> 2ms (100배 개선), ");
    printf("- 사용자 불만: 80% 감소, ");  
    printf("- 시스템 안정성: 크게 향상, ");
}
```

## Shenandoah: Red Hat의 도전

```java
// Shenandoah의 특징: Brooks Pointer 방식
public class ShenandoahGC {
    
    // 모든 객체에 forwarding pointer 추가하는 독특한 접근
    public class ShenandoahObject {
        // Brooks Pointer: 모든 객체의 첫 번째 워드
        private volatile Object forwardingPtr;  // 자기 자신 또는 이동한 위치
        
        // 실제 객체 데이터
        private Object[] data;
        
        public ShenandoahObject(int size) {
            this.forwardingPtr = this;  // 처음에는 자기 자신을 가리킴
            this.data = new Object[size];
        }
        
        // Brooks pointer를 통한 간접 접근
        public Object getField(int index) {
            ShenandoahObject current = (ShenandoahObject) forwardingPtr;
            return current.data[index];
        }
        
        public void setField(int index, Object value) {
            ShenandoahObject current = (ShenandoahObject) forwardingPtr;
            current.data[index] = value;
        }
    }

    // Read Barrier - ZGC의 load barrier와 유사하지만 더 단순
    public Object readBarrier(ShenandoahObject obj) {
        if (obj == null) return null;
        
        // Brooks pointer를 따라가서 실제 객체 위치 찾기
        ShenandoahObject actual = (ShenandoahObject) obj.forwardingPtr;
        
        printf("Read barrier: %p -> %p, ", obj, actual);
        return actual;
    }

    // Write Barrier - SATB (Snapshot At The Beginning) 방식
    public void writeBarrier(ShenandoahObject obj, String fieldName, Object newValue) {
        // Brooks pointer로 실제 객체 찾기
        ShenandoahObject resolved = (ShenandoahObject) obj.forwardingPtr;
        
        // SATB marking - concurrent mark 중이면 이전 값 보존
        if (isConcurrentMarkActive()) {
            Object oldValue = getField(resolved, fieldName);
            if (oldValue != null) {
                satbEnqueue(oldValue);  // 이전 값을 marking queue에 추가
                printf("SATB: 이전 값 %p 보호, ", oldValue);
            }
        }
        
        // 실제 필드 업데이트
        setField(resolved, fieldName, newValue);
        
        printf("Write barrier: field '%s' = %p, ", fieldName, newValue);
    }

    // Concurrent Evacuation - Shenandoah의 핵심 기능
    // G1과 달리 STW 없이 evacuation!
    public void concurrentEvacuation() {
        printf("=== Shenandoah Concurrent Evacuation 시작 ===, ");
        long startTime = System.currentTimeMillis();
        
        // 이동할 regions 선택
        List<Region> collectionSet = selectEvacuationSet();
        printf("Evacuation set: %d regions, ", collectionSet.size());
        
        // 각 region을 병렬로 처리
        List<Thread> evacuationThreads = new ArrayList<>();
        
        for (int i = 0; i < Runtime.getRuntime().availableProcessors(); i++) {
            final int threadId = i;
            Thread evacuationThread = new Thread(() -> {
                
                for (int j = threadId; j < collectionSet.size(); j += Runtime.getRuntime().availableProcessors()) {
                    Region region = collectionSet.get(j);
                    evacuateRegionConcurrently(region);
                }
            });
            
            evacuationThread.start();
            evacuationThreads.add(evacuationThread);
        }
        
        // 모든 evacuation 스레드 완료 대기
        for (Thread thread : evacuationThreads) {
            try { thread.join(); } catch (InterruptedException e) {}
        }
        
        long totalTime = System.currentTimeMillis() - startTime;
        printf("Concurrent Evacuation 완료: %d ms (STW 없음!), ", totalTime);
    }
    
    private void evacuateRegionConcurrently(Region sourceRegion) {
        printf("[Thread %d] Region evacuation 시작, ", Thread.currentThread().getId());
        
        Region targetRegion = allocateNewRegion();
        int movedObjects = 0;
        
        for (ShenandoahObject obj : sourceRegion.getLiveObjects()) {
            // 새 위치에 객체 복사
            ShenandoahObject newObj = copyObjectToRegion(obj, targetRegion);
            
            // CAS(Compare-And-Swap)로 Brooks pointer 업데이트
            // 동시 접근 안전성 보장
            ShenandoahObject expected = obj;  // 현재 자기 자신을 가리키고 있을 것으로 예상
            
            if (obj.forwardingPtr.compareAndSet(expected, newObj)) {
                // 성공적으로 업데이트됨
                printf("이동 완료: %p -> %p, ", obj, newObj);
                movedObjects++;
            } else {
                // 다른 스레드가 이미 이동시킴 - 중복 작업 방지
                printf("이미 이동됨: %p, ", obj);
            }
        }
        
        printf("Region evacuation 완료: %d objects moved, ", movedObjects);
        
        // 원본 region은 해제
        sourceRegion.markAsFree();
    }

    // Update References Phase - 모든 참조를 새 위치로 업데이트
    public void updateReferences() {
        printf("=== Update References 시작 ===, ");
        
        // 이 단계는 STW가 필요함 (Shenandoah의 유일한 긴 STW)
        stopTheWorld();
        
        try {
            long updatedRefs = 0;
            
            // Root set 업데이트
            for (Object root : getRootSet()) {
                if (root instanceof ShenandoahObject) {
                    ShenandoahObject obj = (ShenandoahObject) root;
                    updateRootReference(obj);
                    updatedRefs++;
                }
            }
            
            // 모든 객체의 참조 업데이트
            for (Region region : heap.getAllRegions()) {
                for (ShenandoahObject obj : region.getObjects()) {
                    for (int i = 0; i < obj.getReferenceCount(); i++) {
                        ShenandoahObject ref = obj.getReference(i);
                        if (ref != null && ref != ref.forwardingPtr) {
                            obj.setReference(i, (ShenandoahObject) ref.forwardingPtr);
                            updatedRefs++;
                        }
                    }
                }
            }
            
            printf("참조 업데이트 완료: %d references, ", updatedRefs);
            
        } finally {
            resumeTheWorld();
        }
    }
}

// Shenandoah vs ZGC 심층 비교
/*
공통점:
- 목표: <10ms pause time
- Concurrent relocation/evacuation
- Region 기반 메모리 관리
- 대용량 힙 지원 (수백 GB)

핵심 차이점:

1. 구현 방식:
   - Shenandoah: Brooks pointer (객체마다 8바이트 오버헤드)
   - ZGC: Colored pointer (오버헤드 없음, 64비트 전용)

2. 메모리 오버헤드:
   - Shenandoah: 객체당 8바이트 + 일반적인 GC 오버헤드
   - ZGC: 색상 정보는 포인터에 내장, forwarding table만

3. 플랫폼 지원:
   - Shenandoah: 32비트, 64비트 모든 플랫폼
   - ZGC: 64비트 플랫폼만 (x86-64, AArch64)

4. Barrier 복잡도:
   - Shenandoah: Read/Write barrier 둘 다 필요
   - ZGC: Load barrier만 필요

5. STW 단계:
   - Shenandoah: Update references 단계에서 STW (보통 10-50ms)
   - ZGC: Root scanning만 STW (1-3ms)

실제 성능 비교 (16GB 힙):

Shenandoah:
- P99 pause: 5-15ms
- Throughput: baseline의 95-98%
- 메모리 오버헤드: 15-20%

ZGC:
- P99 pause: 1-5ms  
- Throughput: baseline의 90-95%
- 메모리 오버헤드: 8-15%

선택 기준:
- 극한의 low latency 필요: ZGC
- 안정성과 폭넓은 플랫폼 지원: Shenandoah
- 메모리가 매우 제한적: G1GC 고려
*/
```

## 성능 특성 종합 비교

```java
public class ModernGCComparison {
    
    public static void benchmarkAllGCs() {
        printf("=== 현대적 GC 종합 성능 비교 ===, ");
        
        // 테스트 시나리오들
        Scenario[] scenarios = {
            new WebServerScenario(8_000, 1000),      // 8GB, 1000 req/s
            new BigDataScenario(32_000, 1000000),    // 32GB, 100만 레코드
            new RealtimeScenario(16_000, 50000)      // 16GB, 50k txn/s
        };
        
        GarbageCollector[] collectors = {
            new G1GC(),
            new ZGC(), 
            new ShenandoahGC(),
            new ParallelGC()  // 비교 기준
        };
        
        for (Scenario scenario : scenarios) {
            printf("시나리오: %s, ", scenario.getName());
            
            for (GarbageCollector gc : collectors) {
                BenchmarkResult result = runBenchmark(scenario, gc);
                
                printf("%s: ", gc.getName());
                printf("P99 latency: %d ms, ", result.p99LatencyMs);
                printf("Throughput: %.1f%% (baseline 대비), ", result.throughputRatio * 100);
                printf("Memory overhead: %.1f%%, ", result.memoryOverhead * 100);
                printf("CPU overhead: %.1f%%, ", result.cpuOverhead * 100);
                printf(", ");
            }
        }
        
        /*
        일반적인 결과 패턴:
        
        웹 서버 시나리오 (8GB):
        - G1GC: P99 50ms, Throughput 95%, Memory +10%, CPU +5%
        - ZGC: P99 2ms, Throughput 90%, Memory +15%, CPU +10%
        - Shenandoah: P99 8ms, Throughput 93%, Memory +18%, CPU +8%
        - ParallelGC: P99 200ms, Throughput 100% (baseline)
        
        빅데이터 시나리오 (32GB):
        - G1GC: P99 150ms, Throughput 92%, Memory +8%, CPU +12%
        - ZGC: P99 3ms, Throughput 85%, Memory +12%, CPU +15%
        - Shenandoah: P99 12ms, Throughput 88%, Memory +20%, CPU +18%
        - ParallelGC: P99 2000ms (2초!), Throughput 100%
        
        실시간 시나리오 (16GB):
        - G1GC: P99 80ms, Throughput 88%, 가끔 300ms 스파이크
        - ZGC: P99 1.5ms, Throughput 82%, 매우 안정적
        - Shenandoah: P99 6ms, Throughput 85%, 안정적
        - ParallelGC: 사용 불가 (pause time 너무 긺)
        
        결론:
        1. 극한 low latency: ZGC 선택
        2. 균형잡힌 성능: G1GC 선택  
        3. 안정성 중시: Shenandoah 선택
        4. 최대 throughput: ParallelGC (pause 감당 가능시)
        */
    }
}
```

## 핵심 요점

### 1. G1GC: 예측 가능한 성능

**혁신**: Region 기반 + 예측 모델로 pause time 제어
**장점**: 실용적인 균형, 넓은 적용 범위, 안정성
**단점**: 여전히 수십 ms pause, 복잡한 튜닝

### 2. ZGC: 극한의 Low Latency  

**혁신**: Colored pointers + Multi-mapping으로 1-2ms pause 달성
**장점**: 극도로 낮은 지연시간, 큰 힙에서도 일정한 성능
**단점**: 높은 CPU/메모리 오버헤드, 64비트 전용

### 3. Shenandoah: 실용적인 Low Latency

**혁신**: Brooks pointer로 concurrent evacuation 구현
**장점**: 안정적인 low latency, 넓은 플랫폼 지원
**단점**: 메모리 오버헤드, Update references 단계의 STW

### 4. 선택의 기준

- **레이턴시 최우선**: ZGC
- **균형잡힌 성능**: G1GC  
- **안정성과 호환성**: Shenandoah
- **처리량 최우선**: Parallel GC

---

**이전**: [세대별 및 동시 GC](chapter-08-memory-allocator-gc/08-04-advanced-gc-concepts.md)  
**다음**: [GC 튜닝과 실전 활용](chapter-08-memory-allocator-gc/08-31-gc-tuning-practices.md)에서 실제 프로덕션 환경에서의 GC 선택과 튜닝 전략을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 12-16시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-09-memory-gc)

- [Chapter 9-1: 메모리 할당자의 내부 구현 개요](./08-10-memory-allocator.md)
- [Chapter 9-1A: malloc 내부 동작의 진실](./08-01-malloc-fundamentals.md)
- [Chapter 9-1B: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](./08-11-allocator-comparison.md)
- [Chapter 9-1C: 커스텀 메모리 할당자 구현](./08-12-custom-allocators.md)
- [Chapter 9-1D: 실전 메모리 최적화 사례](../chapter-09-advanced-memory-management/08-30-production-optimization.md)

### 🏷️ 관련 키워드

`modern-gc`, `g1gc`, `zgc`, `shenandoah`, `low-latency`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
