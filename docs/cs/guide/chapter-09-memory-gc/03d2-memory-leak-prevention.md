---
tags:
  - JavaScript
  - Memory Leak
  - Performance
  - Optimization
  - Event Listener
  - Timer
  - DOM
---

# 9.3d2 JavaScript 메모리 누수 방지와 성능 최적화

## 🚨 메모리 누수의 현실적 영향

JavaScript 메모리 누수는 서서히 진행되는 성능 저하의 주범입니다. 초기에는 눈에 띄지 않지만, 시간이 지나면서 애플리케이션 속도 저하, 브라우저 크래시, 서버 다운까지 이어질 수 있습니다.

## 1. 메모리 누수 방지 패턴

### 1.1 Event Listener 메모리 누수와 해결책

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
```

### 1.2 Timer 메모리 누수 방지

```javascript
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
```

### 1.3 DOM 참조 메모리 누수 방지

```javascript
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
```

### 1.4 클로저 메모리 누수 최적화

```javascript
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
```

## 2. 성능 최적화 실전 기법

### 2.1 Object Pooling 구현

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
```

### 2.2 대용량 배열과 문자열 최적화

```javascript
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
```

### 2.3 WeakMap/WeakSet 활용 패턴

```javascript
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
```

## 3. 핵심 요점과 실무 가이드

### 3.1 메모리 누수 체크리스트

```javascript
// 메모리 누수 자가 진단 체크리스트
class MemoryLeakChecker {
    
    static checkEventListeners() {
        console.log("=== Event Listener 체크리스트 ===");
        return [
            "✓ removeEventListener 호출 여부",
            "✓ AbortController 사용 고려",
            "✓ DOM 제거 시 listener 정리",
            "✓ 익명 함수 대신 명명된 함수 사용",
            "✓ 클로저에서 큰 객체 참조 피하기"
        ];
    }
    
    static checkTimers() {
        console.log("=== Timer 체크리스트 ===");
        return [
            "✓ clearInterval/clearTimeout 호출",
            "✓ Timer ID 저장 및 관리",
            "✓ WeakRef 패턴 고려",
            "✓ Component unmount 시 정리",
            "✓ 자동 정리 메커니즘 구현"
        ];
    }
    
    static checkDOMReferences() {
        console.log("=== DOM 참조 체크리스트 ===");
        return [
            "✓ WeakMap/WeakSet 사용",
            "✓ Observer disconnect 호출",
            "✓ DOM 제거 후 변수 null 할당",
            "✓ 순환 참조 피하기",
            "✓ 캐시된 DOM 요소 정리"
        ];
    }
}
```

### 3.2 성능 최적화 가이드라인

**메모리 효율성 우선순위:**

1. **Event Listener 정리** (가장 중요) - 80%의 누수 원인
2. **Timer 관리** - 지속적인 메모리 증가의 주범
3. **Object Pooling** - GC 압박 감소로 성능 향상
4. **WeakMap/WeakSet 활용** - 자동 정리로 안전성 확보
5. **클로저 최적화** - 불필요한 스코프 캡처 방지

**개발 단계별 적용 방법:**

- **설계 단계**: WeakMap/WeakSet 기반 아키텍처
- **구현 단계**: AbortController와 Object Pool 패턴
- **테스트 단계**: 메모리 프로파일링과 누수 감지
- **운영 단계**: 모니터링과 자동 정리 시스템

JavaScript 메모리 관리는 V8이 대부분 처리하지만, 개발자의 코딩 패턴이 성능을 좌우합니다. 특히 SPA와 같은 장기 실행 애플리케이션에서는 체계적인 메모리 관리가 필수입니다.

---

**다음**: [9.3d3 대규모 SPA 메모리 관리](03d3-spa-memory-management.md)에서 실제 프로덕션 환경의 메모리 관리를 학습합니다.
