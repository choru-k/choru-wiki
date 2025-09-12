---
tags:
  - JavaScript
  - V8
  - GC
  - Memory
  - Performance
  - NodeJS
---

# Chapter 9-3d: JavaScript GC - V8 엔진의 숨겨진 복잡성

## 🎯 이 문서를 읽고 나면 얻을 수 있는 것들

이 문서를 마스터하면, 여러분은:

1. **"V8 엔진이 빠른 이유가 뭔가요?"** - V8의 정교한 GC 시스템과 최적화 기법을 이해합니다
2. **"Node.js 메모리 누수는 어떻게 찾나요?"** - 프로파일링 도구와 디버깅 기법을 익힙니다
3. **"JavaScript에서 GC 튜닝이 가능한가요?"** - 개발자가 할 수 있는 최적화 방법을 배웁니다
4. **"대용량 SPA에서 메모리 관리는?"** - 실제 웹 애플리케이션 최적화 사례를 이해합니다

## 1. V8 GC 아키텍처: 정교한 메모리 관리 시스템

### 1.1 V8 메모리 구조의 이해

```javascript
// V8 엔진의 메모리 구조 - 각 영역의 역할과 특성
class V8MemoryStructure {
    constructor() {
        // Young Generation (New Space) - 새로운 객체들의 영역
        this.newSpace = {
            // Semi-space Scavenger 알고리즘 사용
            from: new ArrayBuffer(8 * 1024 * 1024),  // 8MB - 현재 활성 영역
            to: new ArrayBuffer(8 * 1024 * 1024),    // 8MB - 복사 대상 영역
            
            // 특징: 빠른 할당, 짧은 GC 시간 (1-5ms)
            // 대상: 임시 변수, 함수 매개변수, 지역 변수 등
        };
        
        // Old Generation (Old Space) - 오래 살아남은 객체들
        this.oldSpace = {
            // 목적별로 세분화된 메모리 영역들
            oldPointerSpace: [],  // 다른 객체를 참조하는 객체들
            oldDataSpace: [],     // 원시 데이터, 문자열, 숫자 등
            largeObjectSpace: [], // 큰 객체들 (>512KB)
            codeSpace: [],        // JIT 컴파일된 기계어 코드
            mapSpace: []          // Hidden classes (객체 형태 정보)
        };
        
        // 각 영역별 GC 전략
        this.gcStrategies = {
            newSpace: "Scavenger (Copying GC)",
            oldPointerSpace: "Mark-Compact",
            oldDataSpace: "Mark-Sweep", 
            largeObjectSpace: "Mark-Sweep",
            codeSpace: "Mark-Sweep",
            mapSpace: "Mark-Sweep"
        };
    }
    
    // V8의 객체 생성과 메모리 할당 과정
    allocateObject(size, type) {
        if (size < 512 * 1024) { // 512KB 미만
            if (this.newSpace.available >= size) {
                return this.allocateInNewSpace(size, type);
            } else {
                // New Space가 가득참 - Minor GC 트리거
                this.minorGC();
                return this.allocateInNewSpace(size, type);
            }
        } else {
            // 큰 객체는 바로 Large Object Space로
            return this.allocateInLargeObjectSpace(size, type);
        }
    }
    
    minorGC() {
        console.log("Minor GC 실행 (Scavenger) - 예상 시간: 1-5ms");
        // Copying GC로 살아있는 객체를 to-space로 복사
        // 여러 번 살아남은 객체는 Old Space로 승격
    }
    
    majorGC() {
        console.log("Major GC 실행 (Mark-Compact/Mark-Sweep) - 예상 시간: 10-100ms");
        // Old Space 전체 수집
    }
}

// V8의 Hidden Class 시스템 - 성능의 핵심
function demonstrateHiddenClasses() {
    console.log("=== Hidden Class 시스템 데모 ===");
    
    // ✅ 좋은 예: 일관된 객체 구조 (같은 Hidden Class 공유)
    class Point {
        constructor(x, y) {
            this.x = x;  // 항상 같은 순서로 속성 추가
            this.y = y;  // V8이 최적화된 Hidden Class 생성
        }
        
        // 메서드도 Hidden Class에 포함됨
        distance() {
            return Math.sqrt(this.x * this.x + this.y * this.y);
        }
    }
    
    // 동일한 Hidden Class를 공유하는 객체들 - 메모리 효율적
    const points = [];
    for (let i = 0; i < 1000000; i++) {
        points.push(new Point(i, i + 1));
    }
    console.log("✅ 100만 개 Point 객체 - 동일한 Hidden Class 공유");
    
    // ❌ 나쁜 예: 다양한 Hidden Class 생성 (메모리 비효율)
    const badObjects = [];
    for (let i = 0; i < 1000000; i++) {
        const obj = {};
        if (i % 2 === 0) {
            obj.x = i;      // 첫 번째 Hidden Class
            obj.y = i + 1;
        } else {
            obj.y = i + 1;  // 다른 순서 = 두 번째 Hidden Class  
            obj.x = i;
        }
        badObjects.push(obj);
    }
    console.log("❌ 100만 개 객체 - 2개의 서로 다른 Hidden Class");
    
    /*
    V8 Hidden Class 최적화 원리:
    1. 동일한 속성 구조 = 동일한 Hidden Class
    2. 속성 추가 순서도 Hidden Class에 영향
    3. Hidden Class 공유 = 메모리 절약 + 속성 접근 속도 향상
    4. JIT 컴파일러가 Hidden Class 정보로 최적화된 코드 생성
    */
}

// Inline Caching과 GC의 상호작용
function demonstrateInlineCaching() {
    console.log("=== Inline Caching과 성능 ===");
    
    // Monomorphic IC (단형) - 가장 빠름
    function processPoint(point) {
        return point.x + point.y;  // 항상 같은 Hidden Class의 Point 처리
    }
    
    const points = Array.from({length: 1000000}, (_, i) => new Point(i, i));
    
    console.time("Monomorphic IC");
    let sum1 = 0;
    for (const point of points) {
        sum1 += processPoint(point); // V8이 최적화된 기계어 코드 생성
    }
    console.timeEnd("Monomorphic IC");
    
    // Polymorphic IC (다형) - 느림  
    function processAnyObject(obj) {
        return obj.x + obj.y;  // 여러 다른 Hidden Class 처리
    }
    
    // 의도적으로 다른 구조의 객체들 생성
    const mixedObjects = [];
    for (let i = 0; i < 1000000; i++) {
        if (i % 3 === 0) {
            mixedObjects.push({x: i, y: i});           // Hidden Class A
        } else if (i % 3 === 1) {
            mixedObjects.push({y: i, x: i});           // Hidden Class B (순서 다름)
        } else {
            mixedObjects.push({x: i, y: i, z: i});     // Hidden Class C (속성 다름)
        }
    }
    
    console.time("Polymorphic IC");
    let sum2 = 0;
    for (const obj of mixedObjects) {
        sum2 += processAnyObject(obj); // V8이 여러 케이스 처리하는 코드 생성
    }
    console.timeEnd("Polymorphic IC");
    
    /*
    일반적인 결과:
    Monomorphic IC: 15ms (V8 최적화 적용)
    Polymorphic IC: 150ms (10배 차이!)
    
    GC 관점에서의 영향:
    - Hidden Class가 많을수록 메모리 사용량 증가
    - IC 최적화 실패 시 더 많은 임시 객체 생성
    - JIT 코드 캐시 미스로 인한 추가 메모리 할당
    */
}

// V8의 수동 GC 제어 (--expose-gc 플래그 필요)
function manualGCControl() {
    console.log("=== 수동 GC 제어 (개발/테스트용) ===");
    
    if (typeof global !== 'undefined' && global.gc) {
        console.log("Global GC function available");
        
        // 메모리 사용량 측정 함수
        const getMemoryUsage = () => {
            if (performance.memory) {
                return {
                    used: Math.round(performance.memory.usedJSHeapSize / 1048576), // MB
                    total: Math.round(performance.memory.totalJSHeapSize / 1048576),
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
                };
            }
            return null;
        };
        
        // 테스트용 대량 객체 생성
        console.log("대량 객체 생성 전:", getMemoryUsage());
        
        const largeArray = [];
        for (let i = 0; i < 1000000; i++) {
            largeArray.push({
                id: i,
                data: `item_${i}`.repeat(10),
                nested: {value: i, metadata: [i, i*2, i*3]}
            });
        }
        
        console.log("대량 객체 생성 후:", getMemoryUsage());
        
        // 객체 해제
        largeArray.length = 0; // 배열 비우기
        
        console.log("객체 해제 후 (GC 전):", getMemoryUsage());
        
        // 수동 GC 실행
        global.gc();
        
        console.log("수동 GC 실행 후:", getMemoryUsage());
        
    } else {
        console.log("GC function not available. Run with --expose-gc flag.");
        console.log("Example: node --expose-gc script.js");
    }
}
```text

### 1.2 V8 GC 알고리즘 상세 분석

```javascript
// V8의 Scavenger (Young Generation GC) 구현 원리
class ScavengerSimulation {
    constructor() {
        this.fromSpace = new Map(); // 현재 활성 공간
        this.toSpace = new Map();   // 복사 대상 공간
        this.oldSpace = new Map();  // Old Generation
        this.scavengeCount = new Map(); // 각 객체의 scavenge 횟수
    }
    
    // 새 객체 할당
    allocate(id, data) {
        this.fromSpace.set(id, {
            data: data,
            references: []
        });
        this.scavengeCount.set(id, 0);
        
        console.log(`객체 ${id} 할당됨 (New Space)`);
    }
    
    // 참조 관계 설정
    addReference(fromId, toId) {
        if (this.fromSpace.has(fromId)) {
            this.fromSpace.get(fromId).references.push(toId);
        }
    }
    
    // Minor GC (Scavenger) 실행
    scavenge(rootIds) {
        console.log("\n=== Scavenger GC 시작 ===");
        const startTime = performance.now();
        
        // Phase 1: Root 객체들을 to-space로 복사
        for (const rootId of rootIds) {
            this.copyObject(rootId);
        }
        
        // Phase 2: BFS로 참조된 객체들 순차 복사 (Cheney's Algorithm)
        const toSpaceIds = Array.from(this.toSpace.keys());
        for (const objId of toSpaceIds) {
            const obj = this.toSpace.get(objId);
            for (const refId of obj.references) {
                if (this.fromSpace.has(refId)) {
                    this.copyObject(refId);
                }
            }
        }
        
        // Phase 3: 공간 교체
        this.fromSpace.clear();
        [this.fromSpace, this.toSpace] = [this.toSpace, this.fromSpace];
        
        const endTime = performance.now();
        console.log(`Scavenger 완료: ${(endTime - startTime).toFixed(2)}ms`);
        
        this.printSpaceStats();
    }
    
    copyObject(objId) {
        if (!this.fromSpace.has(objId) || this.toSpace.has(objId)) {
            return; // 이미 복사됨 또는 존재하지 않음
        }
        
        const obj = this.fromSpace.get(objId);
        const scavengeCount = this.scavengeCount.get(objId) + 1;
        
        // 승격 조건 체크 (2번 이상 살아남으면 Old Generation으로)
        if (scavengeCount >= 2) {
            this.promoteToOld(objId, obj);
            console.log(`객체 ${objId} Old Space로 승격`);
        } else {
            // to-space로 복사
            this.toSpace.set(objId, obj);
            this.scavengeCount.set(objId, scavengeCount);
            console.log(`객체 ${objId} to-space로 복사 (${scavengeCount}번째)`);
        }
    }
    
    promoteToOld(objId, obj) {
        this.oldSpace.set(objId, obj);
        this.scavengeCount.delete(objId);
    }
    
    printSpaceStats() {
        console.log(`\n메모리 통계:`);
        console.log(`  New Space: ${this.fromSpace.size} objects`);
        console.log(`  Old Space: ${this.oldSpace.size} objects`);
        console.log(`  Total: ${this.fromSpace.size + this.oldSpace.size} objects`);
    }
}

// Scavenger 시뮬레이션 실행
function runScavengerDemo() {
    console.log("=== V8 Scavenger 알고리즘 데모 ===");
    
    const gc = new ScavengerSimulation();
    
    // 시나리오: 웹 애플리케이션의 일반적인 객체 생성 패턴
    
    // 1. 초기 객체들 생성 (글로벌 변수, 이벤트 리스너 등)
    gc.allocate('global1', 'Global config object');
    gc.allocate('global2', 'Event listeners');
    gc.allocate('global3', 'Cache object');
    
    // 2. 요청 처리 관련 임시 객체들
    for (let i = 1; i <= 10; i++) {
        gc.allocate(`request${i}`, `Request ${i} data`);
        gc.allocate(`response${i}`, `Response ${i} data`);
        
        // 참조 관계 설정 (request -> response)
        gc.addReference(`request${i}`, `response${i}`);
    }
    
    // 3. 첫 번째 GC - 일부 요청 완료됨
    const roots = ['global1', 'global2', 'global3', 'request1', 'request2']; // 활성 root들
    gc.scavenge(roots);
    
    // 4. 새로운 요청들 추가
    for (let i = 11; i <= 15; i++) {
        gc.allocate(`request${i}`, `Request ${i} data`);
        gc.allocate(`response${i}`, `Response ${i} data`);
        gc.addReference(`request${i}`, `response${i}`);
    }
    
    // 5. 두 번째 GC - 더 많은 객체가 Old로 승격될 것
    const newRoots = ['global1', 'global2', 'global3', 'request1', 'request11', 'request12'];
    gc.scavenge(newRoots);
    
    /*
    결과 분석:
    - global 객체들: 계속 살아남아 Old Space로 승격
    - request/response: 일부만 살아남아 승격, 나머지는 해제
    - 실제 V8에서는 이 과정이 1-5ms 내에 완료
    - Copying GC의 특성상 살아있는 객체 수에만 비례하는 시간 복잡도
    */
}

// V8의 Incremental Marking 구현 원리
class IncrementalMarkingSimulation {
    constructor() {
        this.objects = new Map();
        this.markingProgress = 0;
        this.totalObjects = 0;
        this.markingThreshold = 0.1; // 10%씩 점진적으로 마킹
    }
    
    addObject(id, data, references = []) {
        this.objects.set(id, {
            data: data,
            references: references,
            color: 'white', // white, gray, black
            marked: false
        });
        this.totalObjects++;
    }
    
    // Incremental Marking 시작
    startIncrementalMarking(roots) {
        console.log("\n=== Incremental Marking 시작 ===");
        
        // Root 객체들을 gray로 표시
        for (const rootId of roots) {
            if (this.objects.has(rootId)) {
                this.objects.get(rootId).color = 'gray';
            }
        }
        
        this.markingProgress = 0;
        console.log("Root 객체들이 gray로 표시됨");
        
        // 점진적 마킹 시뮬레이션
        this.continueIncrementalMarking();
    }
    
    // 점진적 마킹 계속 (메인 스레드 실행 중에 조금씩)
    continueIncrementalMarking() {
        const maxObjectsPerStep = Math.max(1, Math.floor(this.totalObjects * this.markingThreshold));
        let processedInStep = 0;
        
        // Gray 객체들을 찾아서 처리
        for (const [objId, obj] of this.objects.entries()) {
            if (obj.color === 'gray' && processedInStep < maxObjectsPerStep) {
                // 이 객체가 참조하는 모든 객체를 gray로
                for (const refId of obj.references) {
                    if (this.objects.has(refId) && this.objects.get(refId).color === 'white') {
                        this.objects.get(refId).color = 'gray';
                    }
                }
                
                // 처리 완료된 객체는 black으로
                obj.color = 'black';
                obj.marked = true;
                processedInStep++;
                
                console.log(`객체 ${objId} 처리됨 (gray → black)`);
            }
        }
        
        this.markingProgress += processedInStep;
        const progressPercent = (this.markingProgress / this.totalObjects * 100).toFixed(1);
        console.log(`마킹 진행률: ${progressPercent}% (${processedInStep}개 객체 처리)`);
        
        // 아직 처리할 gray 객체가 있으면 계속
        const hasGrayObjects = Array.from(this.objects.values())
            .some(obj => obj.color === 'gray');
            
        if (hasGrayObjects) {
            // 실제 V8에서는 메인 스레드 실행 중 틈틈이 호출됨
            setTimeout(() => this.continueIncrementalMarking(), 10);
        } else {
            this.finishMarking();
        }
    }
    
    finishMarking() {
        console.log("\n=== Incremental Marking 완료 ===");
        
        // 통계 수집
        const stats = {white: 0, black: 0, total: 0};
        for (const obj of this.objects.values()) {
            if (obj.color === 'white') stats.white++;
            else if (obj.color === 'black') stats.black++;
            stats.total++;
        }
        
        console.log(`마킹 결과:`);
        console.log(`  살아있는 객체 (black): ${stats.black}개`);
        console.log(`  죽은 객체 (white): ${stats.white}개`);
        console.log(`  해제 예정 메모리: ${(stats.white / stats.total * 100).toFixed(1)}%`);
        
        // 실제로는 여기서 Sweeping이나 Compaction 실행
        console.log("다음: Sweeping 또는 Compaction 단계");
    }
    
    // Write Barrier 시뮬레이션 (Incremental Marking 중 참조 변경 시)
    writeBarrier(objId, newRefId) {
        const obj = this.objects.get(objId);
        const newRef = this.objects.get(newRefId);
        
        if (obj && newRef) {
            // Incremental marking 중이고, black 객체가 white 객체를 참조하려 할 때
            if (obj.color === 'black' && newRef.color === 'white') {
                console.log(`Write Barrier 발동: ${objId} → ${newRefId}`);
                // 새로 참조되는 객체를 gray로 표시 (놓치지 않기 위해)
                newRef.color = 'gray';
            }
            
            // 참조 관계 업데이트
            if (!obj.references.includes(newRefId)) {
                obj.references.push(newRefId);
            }
        }
    }
}

// Incremental Marking 데모
function runIncrementalMarkingDemo() {
    console.log("=== V8 Incremental Marking 데모 ===");
    
    const gc = new IncrementalMarkingSimulation();
    
    // 복잡한 객체 그래프 생성
    gc.addObject('root1', 'Main application');
    gc.addObject('root2', 'DOM elements');
    
    // 연결된 객체들
    gc.addObject('module1', 'User module', ['component1', 'component2']);
    gc.addObject('component1', 'User component', ['data1', 'data2']);
    gc.addObject('component2', 'Profile component', ['data3']);
    
    gc.addObject('data1', 'User data');
    gc.addObject('data2', 'Session data');
    gc.addObject('data3', 'Profile data');
    
    // 고아 객체들 (root에서 도달할 수 없음)
    gc.addObject('orphan1', 'Unused component', ['orphan2']);
    gc.addObject('orphan2', 'Unused data');
    
    // root에서 module1을 참조하도록 설정
    gc.objects.get('root1').references.push('module1');
    gc.objects.get('root2').references.push('component1');
    
    // Incremental Marking 시작
    const roots = ['root1', 'root2'];
    gc.startIncrementalMarking(roots);
    
    // 마킹 중에 새로운 참조 생성 시뮬레이션
    setTimeout(() => {
        console.log("\n중간에 새로운 참조 생성...");
        gc.writeBarrier('root1', 'data3'); // root1이 data3를 새로 참조
    }, 25);
}
```text

## 2. JavaScript GC 최적화 전략

### 2.1 메모리 누수 방지 패턴

```javascript
// JavaScript 메모리 누수의 주요 패턴과 해결책
class MemoryLeakPreventionGuide {
    constructor() {
        this.eventListeners = new Map();
        this.timers = new Set();
        this.observerConnections = new Set();
    }
    
    // 1. Event Listener 누수 방지
    demonstrateEventListenerLeaks() {
        console.log("=== Event Listener 메모리 누수 방지 ===");
        
        // ❌ 나쁜 예: Event listener 제거하지 않음
        function badEventHandling() {
            const button = document.createElement('button');
            const largeData = new Array(1000000).fill('data'); // 4MB 데이터
            
            // 클로저로 인해 largeData가 계속 참조됨
            button.addEventListener('click', function() {
                console.log('Button clicked', largeData.length);
            });
            
            document.body.appendChild(button);
            // 버튼이 DOM에서 제거되어도 event listener는 남아있음
            // → 메모리 누수!
        }
        
        // ✅ 좋은 예: 적절한 cleanup
        class GoodEventHandling {
            constructor() {
                this.largeData = new Array(1000000).fill('data');
                this.button = document.createElement('button');
                
                // 메서드를 변수에 저장 (나중에 제거하기 위해)
                this.handleClick = this.handleClick.bind(this);
                
                this.init();
            }
            
            init() {
                this.button.addEventListener('click', this.handleClick);
                document.body.appendChild(this.button);
            }
            
            handleClick() {
                console.log('Button clicked', this.largeData.length);
            }
            
            // 정리 메서드 - 반드시 호출해야 함
            destroy() {
                this.button.removeEventListener('click', this.handleClick);
                this.button.remove();
                this.largeData = null; // 명시적 참조 제거
                
                console.log('EventHandling 인스턴스 정리 완료');
            }
        }
        
        // AbortController를 사용한 현대적 방법 (더 권장)
        function modernEventHandling() {
            const controller = new AbortController();
            const button = document.createElement('button');
            const largeData = new Array(1000000).fill('data');
            
            // signal 옵션으로 일괄 제거 가능
            button.addEventListener('click', () => {
                console.log('Modern button clicked', largeData.length);
            }, { signal: controller.signal });
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    console.log('Escape pressed');
                }
            }, { signal: controller.signal });
            
            document.body.appendChild(button);
            
            // 정리할 때 한 번에 모든 listener 제거
            setTimeout(() => {
                controller.abort(); // 모든 listener 자동 제거!
                button.remove();
                console.log('Modern event handling 정리 완료');
            }, 5000);
        }
    }
    
    // 2. Timer 누수 방지
    demonstrateTimerLeaks() {
        console.log("\n=== Timer 메모리 누수 방지 ===");
        
        // ❌ 나쁜 예: Timer를 정리하지 않음
        class BadTimerUsage {
            constructor() {
                this.data = new Array(1000000).fill('timer data');
                this.startTimer();
            }
            
            startTimer() {
                // Timer가 this를 참조하므로 인스턴스가 GC되지 않음
                setInterval(() => {
                    console.log('Timer tick', this.data.length);
                }, 1000);
                // Timer ID를 저장하지 않아 제거 불가능!
            }
        }
        
        // ✅ 좋은 예: 적절한 Timer 관리
        class GoodTimerUsage {
            constructor() {
                this.data = new Array(1000000).fill('timer data');
                this.timers = new Set(); // Timer ID 관리
                this.startTimer();
            }
            
            startTimer() {
                const timerId = setInterval(() => {
                    console.log('Good timer tick', this.data.length);
                }, 1000);
                
                this.timers.add(timerId);
                
                // 자동 정리 스케줄링
                setTimeout(() => {
                    this.cleanup();
                }, 5000);
            }
            
            cleanup() {
                // 모든 Timer 정리
                for (const timerId of this.timers) {
                    clearInterval(timerId);
                }
                this.timers.clear();
                this.data = null;
                
                console.log('Timer 정리 완료');
            }
        }
        
        // WeakRef를 활용한 자동 정리 패턴 (ES2021+)
        class AutoCleaningTimer {
            constructor() {
                this.data = new Array(1000000).fill('weak ref data');
                this.startWeakTimer();
            }
            
            startWeakTimer() {
                const weakThis = new WeakRef(this);
                
                const timerId = setInterval(() => {
                    const instance = weakThis.deref(); // 약한 참조 해제
                    
                    if (instance) {
                        console.log('Weak timer tick', instance.data.length);
                    } else {
                        // 인스턴스가 GC됨 - Timer 자동 정리
                        clearInterval(timerId);
                        console.log('Instance GC됨, Timer 자동 정리');
                    }
                }, 1000);
            }
        }
        
        // 각 패턴 테스트
        // const badTimer = new BadTimerUsage(); // 메모리 누수 발생
        const goodTimer = new GoodTimerUsage(); // 자동 정리
        const autoTimer = new AutoCleaningTimer(); // WeakRef 활용
    }
    
    // 3. DOM 참조 누수 방지
    demonstrateDOMLeaks() {
        console.log("\n=== DOM 참조 메모리 누수 방지 ===");
        
        // ❌ 나쁜 예: DOM 요소에 대한 강한 참조 유지
        class BadDOMHandling {
            constructor() {
                this.elements = [];
                this.createElements();
            }
            
            createElements() {
                for (let i = 0; i < 1000; i++) {
                    const div = document.createElement('div');
                    div.innerHTML = `Element ${i}`;
                    
                    // 강한 참조로 저장
                    this.elements.push(div);
                    document.body.appendChild(div);
                }
            }
            
            removeFromDOM() {
                // DOM에서는 제거하지만 배열에는 여전히 참조 남음
                for (const element of this.elements) {
                    element.remove();
                }
                // this.elements는 여전히 DOM 노드들을 참조 → 메모리 누수!
            }
        }
        
        // ✅ 좋은 예: WeakMap/WeakSet을 활용한 약한 참조
        class GoodDOMHandling {
            constructor() {
                // WeakSet 사용 - DOM 노드가 GC되면 자동으로 제거됨
                this.elements = new WeakSet();
                this.elementData = new WeakMap(); // DOM 노드를 키로 하는 메타데이터
                this.createElements();
            }
            
            createElements() {
                for (let i = 0; i < 1000; i++) {
                    const div = document.createElement('div');
                    div.innerHTML = `Element ${i}`;
                    
                    // 약한 참조로 저장
                    this.elements.add(div);
                    this.elementData.set(div, {
                        id: i,
                        createdAt: Date.now(),
                        metadata: `Element ${i} metadata`
                    });
                    
                    document.body.appendChild(div);
                }
            }
            
            removeFromDOM() {
                // DOM에서 제거하면 WeakSet/WeakMap에서도 자동 제거됨
                document.querySelectorAll('div').forEach(div => div.remove());
                console.log('DOM 정리 완료 - WeakSet/WeakMap 자동 정리됨');
            }
            
            getElementCount() {
                // WeakSet 크기는 확인 불가 (의도된 제한)
                console.log('WeakSet/WeakMap 사용 중 - 정확한 크기 측정 불가');
            }
        }
        
        // Intersection Observer 누수 방지
        class ObserverLeakPrevention {
            constructor() {
                this.observers = new Set();
                this.setupObservers();
            }
            
            setupObservers() {
                // 여러 요소 관찰
                const elements = document.querySelectorAll('.observe-me');
                
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            console.log('Element visible:', entry.target);
                        }
                    });
                });
                
                // Observer 참조 저장 (나중에 disconnect하기 위해)
                this.observers.add(observer);
                
                elements.forEach(el => observer.observe(el));
            }
            
            cleanup() {
                // 모든 Observer 정리
                for (const observer of this.observers) {
                    observer.disconnect(); // 중요: 반드시 disconnect 호출!
                }
                this.observers.clear();
                
                console.log('Observer 정리 완료');
            }
        }
    }
    
    // 4. 클로저 메모리 누수 최적화
    demonstrateClosureOptimization() {
        console.log("\n=== 클로저 메모리 최적화 ===");
        
        // ❌ 나쁜 예: 불필요하게 큰 스코프 캡처
        function createBadClosure() {
            const hugeArray = new Array(1000000).fill('data'); // 4MB
            const anotherHugeArray = new Array(1000000).fill('more data'); // 4MB
            const smallValue = 42;
            const anotherSmallValue = 'hello';
            
            // 클로저가 전체 스코프를 캡처함 → 8MB 메모리 사용
            return function() {
                return smallValue; // smallValue만 사용하지만 모든 변수가 메모리에 남음
            };
        }
        
        // ✅ 좋은 예: 필요한 값만 캡처하는 패턴
        function createGoodClosure() {
            const hugeArray = new Array(1000000).fill('data');
            const anotherHugeArray = new Array(1000000).fill('more data');
            const smallValue = 42;
            const anotherSmallValue = 'hello';
            
            // 즉시실행함수로 필요한 값만 캡처
            return (function(capturedValue) {
                return function() {
                    return capturedValue; // capturedValue만 메모리에 남음
                };
            })(smallValue); // smallValue만 전달
        }
        
        // Module 패턴으로 메모리 사용량 최적화
        function createOptimizedModule() {
            const privateData = new Array(1000000).fill('module data');
            
            // 필요한 인터페이스만 노출
            const publicInterface = {
                getDataLength: function() {
                    return privateData.length;
                },
                
                processData: function(processor) {
                    return processor(privateData);
                }
            };
            
            // 클린업 메서드도 제공
            publicInterface.cleanup = function() {
                privateData.length = 0; // 배열 내용 제거
                console.log('Module 데이터 정리됨');
            };
            
            return publicInterface;
        }
        
        // 성능 테스트
        console.log("클로저 메모리 사용량 테스트...");
        
        const badClosures = [];
        const goodClosures = [];
        
        // 많은 클로저 생성
        for (let i = 0; i < 100; i++) {
            badClosures.push(createBadClosure());   // 각각 8MB 캡처
            goodClosures.push(createGoodClosure()); // 각각 최소한만 캡처
        }
        
        console.log("Bad closures 생성 완료 (예상 메모리: ~800MB)");
        console.log("Good closures 생성 완료 (예상 메모리: ~1MB)");
        
        // 정리
        badClosures.length = 0;
        goodClosures.length = 0;
        
        console.log("클로저 정리 완료");
    }
}

// 메모리 누수 방지 데모 실행
function runMemoryLeakPreventionDemo() {
    console.log("=== JavaScript 메모리 누수 방지 종합 가이드 ===");
    
    const guide = new MemoryLeakPreventionGuide();
    
    // 각 패턴별 데모 실행
    guide.demonstrateEventListenerLeaks();
    setTimeout(() => guide.demonstrateTimerLeaks(), 1000);
    setTimeout(() => guide.demonstrateDOMLeaks(), 2000);
    setTimeout(() => guide.demonstrateClosureOptimization(), 3000);
}
```text

### 2.2 성능 최적화 실전 기법

```javascript
// JavaScript 성능 최적화를 위한 GC 친화적 코딩 패턴
class V8OptimizationPatterns {
    constructor() {
        this.objectPools = new Map();
        this.recycledObjects = new Map();
    }
    
    // 1. Object Pooling 구현
    createObjectPool() {
        console.log("=== Object Pool 최적화 ===");
        
        // 일반적인 게임 오브젝트 Pool
        class BulletPool {
            constructor(initialSize = 100) {
                this.pool = [];
                this.activeObjects = new Set();
                
                // 미리 객체들 생성
                for (let i = 0; i < initialSize; i++) {
                    this.pool.push(this.createBullet());
                }
            }
            
            createBullet() {
                return {
                    x: 0, y: 0,
                    velocityX: 0, velocityY: 0,
                    active: false,
                    lifetime: 0,
                    // 메서드도 포함 (Hidden Class 최적화)
                    update: function(deltaTime) {
                        if (this.active) {
                            this.x += this.velocityX * deltaTime;
                            this.y += this.velocityY * deltaTime;
                            this.lifetime -= deltaTime;
                            
                            if (this.lifetime <= 0) {
                                this.active = false;
                            }
                        }
                    }
                };
            }
            
            acquire(x, y, vx, vy) {
                let bullet;
                
                if (this.pool.length > 0) {
                    // Pool에서 재사용
                    bullet = this.pool.pop();
                } else {
                    // Pool이 비어있으면 새로 생성
                    bullet = this.createBullet();
                    console.log("Pool exhausted - creating new bullet");
                }
                
                // 초기화
                bullet.x = x;
                bullet.y = y;
                bullet.velocityX = vx;
                bullet.velocityY = vy;
                bullet.active = true;
                bullet.lifetime = 5000; // 5초
                
                this.activeObjects.add(bullet);
                return bullet;
            }
            
            release(bullet) {
                if (this.activeObjects.has(bullet)) {
                    // 상태 초기화
                    bullet.active = false;
                    bullet.x = 0;
                    bullet.y = 0;
                    bullet.velocityX = 0;
                    bullet.velocityY = 0;
                    
                    // Pool에 반환
                    this.pool.push(bullet);
                    this.activeObjects.delete(bullet);
                }
            }
            
            // 자동 정리 (inactive 객체들)
            cleanup() {
                const toRelease = [];
                
                for (const bullet of this.activeObjects) {
                    if (!bullet.active) {
                        toRelease.push(bullet);
                    }
                }
                
                toRelease.forEach(bullet => this.release(bullet));
                
                console.log(`Cleanup: ${toRelease.length} bullets released`);
            }
            
            getStats() {
                return {
                    poolSize: this.pool.length,
                    activeCount: this.activeObjects.size,
                    totalAllocated: this.pool.length + this.activeObjects.size
                };
            }
        }
        
        // 성능 비교 테스트
        function benchmarkObjectPooling() {
            console.log("\n--- Object Pool vs Direct Creation 성능 비교 ---");
            
            const pool = new BulletPool(1000);
            const iterations = 100000;
            
            // Direct creation 테스트
            console.time("Direct Creation");
            const directObjects = [];
            for (let i = 0; i < iterations; i++) {
                const bullet = {
                    x: Math.random() * 800,
                    y: Math.random() * 600,
                    velocityX: Math.random() * 10 - 5,
                    velocityY: Math.random() * 10 - 5,
                    active: true,
                    lifetime: 5000
                };
                directObjects.push(bullet);
            }
            console.timeEnd("Direct Creation");
            
            // Object pool 테스트
            console.time("Object Pool");
            const pooledObjects = [];
            for (let i = 0; i < iterations; i++) {
                const bullet = pool.acquire(
                    Math.random() * 800,
                    Math.random() * 600,
                    Math.random() * 10 - 5,
                    Math.random() * 10 - 5
                );
                pooledObjects.push(bullet);
            }
            console.timeEnd("Object Pool");
            
            // 정리
            pooledObjects.forEach(bullet => pool.release(bullet));
            
            console.log("Object Pool 통계:", pool.getStats());
            
            /*
            일반적인 결과:
            Direct Creation: 50ms (새 객체 생성 + GC 압박)
            Object Pool: 15ms (재사용 + GC 부담 감소)
            
            메모리 장점:
            - GC 압박 대폭 감소
            - 메모리 단편화 방지
            - 예측 가능한 메모리 사용량
            */
        }
        
        benchmarkObjectPooling();
        return BulletPool;
    }
    
    // 2. 대용량 배열 최적화
    demonstrateArrayOptimization() {
        console.log("\n=== 대용량 배열 최적화 ===");
        
        // ❌ 나쁜 예: 매번 새 배열 생성
        function badArrayPattern() {
            const results = [];
            
            for (let i = 0; i < 1000; i++) {
                // 매번 새로운 Float32Array 생성 → GC 압박
                const tempArray = new Float32Array(10000);
                
                // 계산 작업
                for (let j = 0; j < tempArray.length; j++) {
                    tempArray[j] = Math.sin(j * 0.01) * i;
                }
                
                // 결과 저장
                results.push(tempArray.reduce((a, b) => a + b, 0));
            }
            
            return results;
        }
        
        // ✅ 좋은 예: 배열 재사용
        function goodArrayPattern() {
            const results = [];
            const reusedArray = new Float32Array(10000); // 한 번만 생성
            
            for (let i = 0; i < 1000; i++) {
                // 기존 배열 재사용
                reusedArray.fill(0); // 초기화
                
                // 계산 작업
                for (let j = 0; j < reusedArray.length; j++) {
                    reusedArray[j] = Math.sin(j * 0.01) * i;
                }
                
                // 결과 저장
                results.push(reusedArray.reduce((a, b) => a + b, 0));
            }
            
            return results;
        }
        
        // 성능 비교
        console.time("Bad Array Pattern");
        const badResults = badArrayPattern();
        console.timeEnd("Bad Array Pattern");
        
        console.time("Good Array Pattern");
        const goodResults = goodArrayPattern();
        console.timeEnd("Good Array Pattern");
        
        // 결과 검증
        const resultsMatch = badResults.every((val, idx) => 
            Math.abs(val - goodResults[idx]) < 0.001
        );
        console.log(`Results match: ${resultsMatch}`);
        
        /*
        일반적인 결과:
        Bad Array Pattern: 2500ms (많은 메모리 할당/해제)
        Good Array Pattern: 800ms (3배 빠름)
        */
    }
    
    // 3. 문자열 최적화
    demonstrateStringOptimization() {
        console.log("\n=== 문자열 최적화 ===");
        
        // V8의 문자열 인터닝 활용
        function demonstrateStringInterning() {
            console.log("--- 문자열 인터닝 ---");
            
            // 같은 문자열 리터럴은 메모리 공유
            const strings = [];
            for (let i = 0; i < 100000; i++) {
                strings.push('hello');  // 모두 같은 메모리 위치 참조
                strings.push('world');
            }
            
            console.log("동일한 문자열 리터럴 100만 개 생성 - 메모리 효율적");
        }
        
        // 문자열 연결 최적화
        function demonstrateStringConcatenation() {
            console.log("--- 문자열 연결 최적화 ---");
            
            const iterations = 10000;
            
            // ❌ 나쁜 예: += 연산자로 긴 문자열 만들기
            console.time("String concatenation with +=");
            let badString = '';
            for (let i = 0; i < iterations; i++) {
                badString += `item_${i}_`; // 매번 새 문자열 생성
            }
            console.timeEnd("String concatenation with +=");
            
            // ✅ 좋은 예: Array.join() 사용
            console.time("String concatenation with Array.join");
            const parts = [];
            for (let i = 0; i < iterations; i++) {
                parts.push(`item_${i}_`);
            }
            const goodString = parts.join('');
            console.timeEnd("String concatenation with Array.join");
            
            console.log(`Results equal: ${badString === goodString}`);
            console.log(`Final string length: ${goodString.length}`);
            
            /*
            결과 (일반적):
            String concatenation with +=: 150ms
            String concatenation with Array.join: 25ms (6배 빠름)
            */
        }
        
        // Template literal 최적화
        function demonstrateTemplateLiteralOptimization() {
            console.log("--- Template Literal 최적화 ---");
            
            const data = Array.from({length: 10000}, (_, i) => ({
                id: i,
                name: `item_${i}`,
                value: Math.random() * 1000
            }));
            
            // 큰 템플릿에서는 부분적으로 나누는 게 효율적
            console.time("Large template literal");
            const html = data.map(item => `
                <div class="item" data-id="${item.id}">
                    <h3>${item.name}</h3>
                    <span class="value">${item.value.toFixed(2)}</span>
                </div>
            `).join('');
            console.timeEnd("Large template literal");
            
            console.log(`Generated HTML length: ${html.length}`);
        }
        
        demonstrateStringInterning();
        demonstrateStringConcatenation();
        demonstrateTemplateLiteralOptimization();
    }
    
    // 4. WeakMap/WeakSet 활용 패턴
    demonstrateWeakCollections() {
        console.log("\n=== WeakMap/WeakSet 활용 패턴 ===");
        
        // DOM 요소 메타데이터 관리
        class DOMMetadataManager {
            constructor() {
                // DOM 요소를 키로 하는 메타데이터 저장
                this.elementMetadata = new WeakMap();
                this.trackedElements = new WeakSet();
            }
            
            attachMetadata(element, data) {
                this.elementMetadata.set(element, {
                    ...data,
                    attachedAt: Date.now(),
                    id: Math.random().toString(36).substr(2, 9)
                });
                
                this.trackedElements.add(element);
                
                console.log(`메타데이터 첨부: ${element.tagName}`);
            }
            
            getMetadata(element) {
                return this.elementMetadata.get(element);
            }
            
            isTracked(element) {
                return this.trackedElements.has(element);
            }
            
            // 강력한 점: 명시적 cleanup 불필요!
            // DOM 요소가 제거되면 WeakMap/WeakSet에서 자동으로 제거됨
        }
        
        // 캐시 시스템 구현
        class WeakRefCache {
            constructor() {
                this.cache = new Map();
                this.cleanupTimer = null;
                this.startCleanupTimer();
            }
            
            set(key, value) {
                // WeakRef로 값을 래핑하여 저장
                this.cache.set(key, new WeakRef(value));
            }
            
            get(key) {
                const weakRef = this.cache.get(key);
                if (weakRef) {
                    const value = weakRef.deref(); // 약한 참조 해제 시도
                    if (value === undefined) {
                        // 객체가 GC됨 - 캐시에서 제거
                        this.cache.delete(key);
                        console.log(`Cache entry expired for key: ${key}`);
                        return undefined;
                    }
                    return value;
                }
                return undefined;
            }
            
            // 주기적으로 만료된 항목 정리
            startCleanupTimer() {
                this.cleanupTimer = setInterval(() => {
                    let cleanedCount = 0;
                    
                    for (const [key, weakRef] of this.cache.entries()) {
                        if (weakRef.deref() === undefined) {
                            this.cache.delete(key);
                            cleanedCount++;
                        }
                    }
                    
                    if (cleanedCount > 0) {
                        console.log(`Cache cleanup: ${cleanedCount} expired entries removed`);
                    }
                }, 5000); // 5초마다 정리
            }
            
            size() {
                return this.cache.size;
            }
            
            cleanup() {
                if (this.cleanupTimer) {
                    clearInterval(this.cleanupTimer);
                }
                this.cache.clear();
            }
        }
        
        // 사용 예시
        function demonstrateUsage() {
            const metadataManager = new DOMMetadataManager();
            const cache = new WeakRefCache();
            
            // DOM 요소들 생성 및 메타데이터 첨부
            const elements = [];
            for (let i = 0; i < 100; i++) {
                const div = document.createElement('div');
                div.id = `element_${i}`;
                
                metadataManager.attachMetadata(div, {
                    index: i,
                    type: 'test-element',
                    data: new Array(1000).fill(`data_${i}`)
                });
                
                cache.set(`element_${i}`, div);
                elements.push(div);
            }
            
            console.log(`Created ${elements.length} elements with metadata`);
            console.log(`Cache size: ${cache.size()}`);
            
            // 일부 요소들 제거 (WeakMap/WeakSet 자동 정리 트리거)
            for (let i = 0; i < 50; i++) {
                elements[i] = null; // 참조 제거
            }
            elements.splice(0, 50); // 배열에서도 제거
            
            // 강제 GC (개발 환경에서만 가능)
            if (global.gc) {
                global.gc();
                console.log("강제 GC 실행됨");
            }
            
            // 잠시 후 캐시 상태 확인
            setTimeout(() => {
                console.log(`GC 후 Cache size: ${cache.size()}`);
                
                // 남은 요소들 확인
                let foundCount = 0;
                for (let i = 50; i < 100; i++) {
                    if (cache.get(`element_${i}`)) {
                        foundCount++;
                    }
                }
                console.log(`Still accessible elements: ${foundCount}`);
                
                cache.cleanup();
            }, 1000);
        }
        
        demonstrateUsage();
    }
}

// V8 최적화 패턴 종합 데모
function runV8OptimizationDemo() {
    console.log("=== V8 GC 최적화 패턴 종합 데모 ===");
    
    const optimizer = new V8OptimizationPatterns();
    
    // 각 최적화 기법 순차 실행
    optimizer.createObjectPool();
    
    setTimeout(() => optimizer.demonstrateArrayOptimization(), 1000);
    setTimeout(() => optimizer.demonstrateStringOptimization(), 2000);
    setTimeout(() => optimizer.demonstrateWeakCollections(), 3000);
}
```text

## 3. 실제 프로덕션 사례와 모니터링

### 3.1 대규모 SPA 메모리 관리

```javascript
// 대규모 Single Page Application의 메모리 관리 전략
class SPAMemoryManager {
    constructor() {
        this.routeCleanups = new Map(); // 라우트별 정리 함수들
        this.componentInstances = new WeakSet(); // 컴포넌트 인스턴스 추적
        this.globalEventListeners = new Map(); // 전역 이벤트 리스너 관리
        this.memoryMonitor = null;
        
        this.initMemoryMonitoring();
    }
    
    // 메모리 모니터링 시스템
    initMemoryMonitoring() {
        console.log("=== SPA 메모리 모니터링 시작 ===");
        
        if (!performance.memory) {
            console.log("performance.memory API 지원하지 않음");
            return;
        }
        
        this.memoryMonitor = setInterval(() => {
            const memory = performance.memory;
            const used = Math.round(memory.usedJSHeapSize / 1048576);
            const total = Math.round(memory.totalJSHeapSize / 1048576);
            const limit = Math.round(memory.jsHeapSizeLimit / 1048576);
            
            console.log(`Memory: ${used}MB used, ${total}MB total, ${limit}MB limit`);
            
            // 메모리 사용률이 80% 초과 시 경고
            const usagePercent = (total / limit) * 100;
            if (usagePercent > 80) {
                console.warn(`⚠️  High memory usage: ${usagePercent.toFixed(1)}%`);
                this.triggerMemoryOptimization();
            }
        }, 10000); // 10초마다 체크
    }
    
    // 라우트 변경 시 메모리 정리
    registerRouteCleanup(routeName, cleanupFn) {
        if (!this.routeCleanups.has(routeName)) {
            this.routeCleanups.set(routeName, []);
        }
        this.routeCleanups.get(routeName).push(cleanupFn);
    }
    
    cleanupRoute(routeName) {
        console.log(`Route cleanup: ${routeName}`);
        
        const cleanups = this.routeCleanups.get(routeName) || [];
        let cleanedCount = 0;
        
        for (const cleanup of cleanups) {
            try {
                cleanup();
                cleanedCount++;
            } catch (error) {
                console.error("Cleanup error:", error);
            }
        }
        
        this.routeCleanups.delete(routeName);
        console.log(`Cleaned up ${cleanedCount} items for route: ${routeName}`);
    }
    
    // React/Vue 스타일 컴포넌트 라이프사이클 관리
    simulateComponentLifecycle() {
        console.log("\n=== 컴포넌트 라이프사이클 메모리 관리 ===");
        
        class MemoryOptimizedComponent {
            constructor(props) {
                this.props = props;
                this.state = { data: null };
                this.subscriptions = [];
                this.timers = new Set();
                this.abortController = new AbortController();
                
                this.componentDidMount();
                
                // WeakSet에 등록하여 추적
                SPAMemoryManager.prototype.componentInstances.add(this);
            }
            
            componentDidMount() {
                console.log("Component mounted");
                
                // 데이터 로딩
                this.loadData();
                
                // 전역 이벤트 리스너 (AbortController로 일괄 관리)
                window.addEventListener('resize', this.handleResize.bind(this), {
                    signal: this.abortController.signal
                });
                
                window.addEventListener('scroll', this.handleScroll.bind(this), {
                    signal: this.abortController.signal,
                    passive: true // 성능 최적화
                });
                
                // 주기적 업데이트
                const timer = setInterval(() => {
                    this.updateData();
                }, 5000);
                this.timers.add(timer);
                
                // WebSocket 연결 시뮬레이션
                this.connectWebSocket();
            }
            
            async loadData() {
                try {
                    // AbortController로 fetch 요청도 관리
                    const response = await fetch('/api/data', {
                        signal: this.abortController.signal
                    });
                    
                    if (!response.ok) throw new Error('Network error');
                    
                    const data = await response.json();
                    this.setState({ data });
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error("Data loading error:", error);
                    }
                }
            }
            
            connectWebSocket() {
                // 실제 구현에서는 WebSocket 연결
                console.log("WebSocket 연결 시뮬레이션");
                
                // 정리 함수 등록
                this.subscriptions.push(() => {
                    console.log("WebSocket 연결 해제");
                    // websocket.close();
                });
            }
            
            handleResize() {
                // 리사이즈 로직
                console.log("Window resized");
            }
            
            handleScroll() {
                // 스크롤 로직 (throttled/debounced 처리 권장)
            }
            
            updateData() {
                // 주기적 데이터 업데이트
                if (this.state.data) {
                    console.log("Data updated");
                }
            }
            
            setState(newState) {
                this.state = { ...this.state, ...newState };
            }
            
            // 컴포넌트 언마운트 시 정리
            componentWillUnmount() {
                console.log("Component unmounting - cleaning up...");
                
                // 1. AbortController로 모든 fetch와 event listener 일괄 해제
                this.abortController.abort();
                
                // 2. Timer 정리
                for (const timer of this.timers) {
                    clearInterval(timer);
                }
                this.timers.clear();
                
                // 3. 구독 정리
                for (const unsubscribe of this.subscriptions) {
                    unsubscribe();
                }
                this.subscriptions.length = 0;
                
                // 4. 상태 정리
                this.state = null;
                this.props = null;
                
                console.log("Component cleanup completed");
            }
            
            // 메모리 누수 체크
            checkMemoryLeak() {
                const issues = [];
                
                if (this.timers.size > 0) {
                    issues.push(`Active timers: ${this.timers.size}`);
                }
                
                if (this.subscriptions.length > 0) {
                    issues.push(`Active subscriptions: ${this.subscriptions.length}`);
                }
                
                if (issues.length > 0) {
                    console.warn("Potential memory leaks:", issues);
                    return false;
                }
                
                return true;
            }
        }
        
        // 컴포넌트 라이프사이클 시뮬레이션
        const components = [];
        
        // 여러 컴포넌트 생성
        for (let i = 0; i < 10; i++) {
            const component = new MemoryOptimizedComponent({ id: i });
            components.push(component);
        }
        
        console.log(`Created ${components.length} components`);
        
        // 5초 후 일부 컴포넌트 정리
        setTimeout(() => {
            console.log("\nCleaning up components...");
            
            const toCleanup = components.splice(0, 5);
            for (const component of toCleanup) {
                component.componentWillUnmount();
            }
            
            console.log(`Cleaned up ${toCleanup.length} components`);
            console.log(`Remaining components: ${components.length}`);
        }, 5000);
        
        return MemoryOptimizedComponent;
    }
    
    // 메모리 최적화 트리거
    triggerMemoryOptimization() {
        console.log("\n=== 메모리 최적화 실행 ===");
        
        // 1. 사용하지 않는 캐시 정리
        this.clearUnusedCaches();
        
        // 2. 이벤트 리스너 정리
        this.cleanupEventListeners();
        
        // 3. DOM 참조 정리
        this.cleanupDOMReferences();
        
        // 4. 수동 GC 트리거 (개발 환경에서만)
        if (global.gc) {
            global.gc();
            console.log("Manual GC triggered");
        }
        
        setTimeout(() => {
            if (performance.memory) {
                const memory = performance.memory;
                const used = Math.round(memory.usedJSHeapSize / 1048576);
                console.log(`Memory after optimization: ${used}MB`);
            }
        }, 1000);
    }
    
    clearUnusedCaches() {
        // 다양한 캐시 정리 로직
        console.log("Clearing unused caches...");
        
        // 예: 이미지 캐시, API 응답 캐시, 컴포넌트 캐시 등
        if (window.imageCache) {
            window.imageCache.clear();
        }
        
        if (window.apiCache) {
            // 오래된 캐시 항목만 선별적으로 제거
            const now = Date.now();
            const maxAge = 5 * 60 * 1000; // 5분
            
            for (const [key, entry] of window.apiCache.entries()) {
                if (now - entry.timestamp > maxAge) {
                    window.apiCache.delete(key);
                }
            }
        }
    }
    
    cleanupEventListeners() {
        console.log("Cleaning up event listeners...");
        
        // 전역 이벤트 리스너 정리
        for (const [eventType, listeners] of this.globalEventListeners) {
            for (const listener of listeners) {
                if (listener.cleanup) {
                    listener.cleanup();
                }
            }
        }
        this.globalEventListeners.clear();
    }
    
    cleanupDOMReferences() {
        console.log("Cleaning up DOM references...");
        
        // 사용하지 않는 DOM 요소 참조 정리
        document.querySelectorAll('[data-cleanup="true"]').forEach(el => {
            el.remove();
        });
    }
    
    // 메모리 누수 감지
    detectMemoryLeaks() {
        console.log("=== 메모리 누수 감지 ===");
        
        if (!performance.memory) {
            console.log("Memory API not available");
            return;
        }
        
        const samples = [];
        const sampleInterval = 1000; // 1초
        const sampleDuration = 30000; // 30초
        
        console.log("Starting memory leak detection...");
        
        const startSampling = () => {
            const sample = {
                timestamp: Date.now(),
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize
            };
            samples.push(sample);
            
            if (samples.length > sampleDuration / sampleInterval) {
                samples.shift(); // 오래된 샘플 제거
            }
            
            // 30개 샘플 이상일 때 누수 분석
            if (samples.length >= 30) {
                this.analyzeMemoryTrend(samples);
            }
        };
        
        const samplingTimer = setInterval(startSampling, sampleInterval);
        
        // 30초 후 분석 완료
        setTimeout(() => {
            clearInterval(samplingTimer);
            console.log("Memory leak detection completed");
        }, sampleDuration);
        
        return samplingTimer;
    }
    
    analyzeMemoryTrend(samples) {
        if (samples.length < 10) return;
        
        // 최근 10개 샘플의 추세 분석
        const recent = samples.slice(-10);
        const first = recent[0];
        const last = recent[recent.length - 1];
        
        const memoryGrowth = last.used - first.used;
        const timeSpan = last.timestamp - first.timestamp;
        const growthRate = memoryGrowth / timeSpan * 1000; // bytes/second
        
        if (growthRate > 1024 * 1024) { // 1MB/sec 이상 증가
            console.warn(`⚠️  Potential memory leak detected: ${(growthRate / 1024 / 1024).toFixed(2)} MB/sec growth rate`);
            
            // 상세 정보 출력
            console.log("Recent memory samples:");
            recent.forEach((sample, i) => {
                const mb = Math.round(sample.used / 1024 / 1024);
                console.log(`  ${i}: ${mb}MB at ${new Date(sample.timestamp).toLocaleTimeString()}`);
            });
        }
    }
    
    // 정리 메서드
    cleanup() {
        if (this.memoryMonitor) {
            clearInterval(this.memoryMonitor);
        }
        
        this.routeCleanups.clear();
        this.globalEventListeners.clear();
        
        console.log("SPAMemoryManager cleanup completed");
    }
}

// SPA 메모리 관리 데모 실행
function runSPAMemoryDemo() {
    console.log("=== SPA 메모리 관리 종합 데모 ===");
    
    const manager = new SPAMemoryManager();
    
    // 컴포넌트 라이프사이클 시뮬레이션
    manager.simulateComponentLifecycle();
    
    // 메모리 누수 감지 시작
    const leakDetector = manager.detectMemoryLeaks();
    
    // 정리
    setTimeout(() => {
        manager.cleanup();
        if (leakDetector) {
            clearInterval(leakDetector);
        }
    }, 35000); // 35초 후 정리
}
```text

## 4. 마무리: JavaScript GC의 현실과 미래

### 💡 핵심 교훈

**JavaScript/V8 GC 10년 경험에서 얻은 실무 지혜:**

1. **"V8은 이미 충분히 똑똑하다, 방해하지 말자"**
   - 대부분의 경우 V8의 기본 GC가 최적
   - 섣불리 최적화하지 말고 프로파일링부터
   - Hidden Class 최적화가 가장 효과적

2. **"메모리 누수는 대부분 이벤트 리스너와 타이머"**
   - AbortController 적극 활용
   - WeakMap/WeakSet으로 자동 정리
   - Component unmount 시 확실한 cleanup

3. **"대규모 SPA에서는 라우트별 메모리 관리가 핵심"**
   - 페이지 전환 시 확실한 정리
   - Object pooling으로 GC 압박 감소
   - 메모리 모니터링 시스템 구축

### 🚀 JavaScript GC의 미래

**발전 방향과 새로운 기술들:**

- **WebAssembly**: 수동 메모리 관리로 GC 우회
- **Web Workers**: 메인 스레드 GC 부담 분산
- **OffscreenCanvas**: 별도 스레드에서 그래픽 처리
- **Streaming**: 대용량 데이터의 점진적 처리

JavaScript GC는 개발자가 직접 제어할 수 없지만, 특성을 이해하고 GC 친화적인 코드를 작성하면 뛰어난 성능을 얻을 수 있습니다. 특히 V8의 지속적인 발전으로 인해 앞으로도 더욱 강력하고 효율적인 메모리 관리가 가능해질 것입니다.

## 참고 자료

- [V8 Blog](https://v8.dev/blog) - V8 엔진 개발팀의 기술 블로그
- [Web.dev Memory](https://web.dev/memory/) - 웹 성능 최적화 가이드
- [Chrome DevTools Memory](https://developer.chrome.com/docs/devtools/memory/) - 메모리 프로파일링 도구
- [JavaScript Memory Management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management) - MDN 문서
- [V8 Garbage Collection](https://github.com/v8/v8/wiki) - V8 위키 문서
