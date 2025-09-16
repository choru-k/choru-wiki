---
tags:
  - AbortController
  - SPA
  - hands-on
  - intermediate
  - medium-read
  - 메모리 관리
  - 메모리 모니터링
  - 애플리케이션개발
  - 컴포넌트 라이프사이클
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 9.3d3a SPA 메모리 관리 아키텍처

## 🏗️ 메모리 관리 시스템 설계

대규모 Single Page Application에서 메모리 관리는 시스템적인 접근이 필요합니다. 단순히 개별 컴포넌트를 정리하는 것이 아니라, 전체 애플리케이션의 메모리 라이프사이클을 관리하는 포괄적인 아키텍처가 필요합니다.

## 1. SPAMemoryManager 클래스 구조

### 1.1 핵심 메모리 관리 시스템

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
}
```

### 1.2 메모리 사용량 분석과 임계값 관리

```javascript
    // 메모리 사용량 분석
    analyzeMemoryUsage() {
        if (!performance.memory) {
            return {
                available: false,
                message: "Memory API not supported"
            };
        }
        
        const memory = performance.memory;
        const analysis = {
            current: {
                used: Math.round(memory.usedJSHeapSize / 1048576), // MB
                total: Math.round(memory.totalJSHeapSize / 1048576), // MB
                limit: Math.round(memory.jsHeapSizeLimit / 1048576) // MB
            },
            usage: {
                percentage: (memory.totalJSHeapSize / memory.jsHeapSizeLimit) * 100,
                efficiency: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100
            },
            status: 'normal'
        };
        
        // 상태 판정
        if (analysis.usage.percentage > 90) {
            analysis.status = 'critical';
        } else if (analysis.usage.percentage > 75) {
            analysis.status = 'warning';
        } else if (analysis.usage.percentage > 50) {
            analysis.status = 'moderate';
        }
        
        return analysis;
    }
    
    // 메모리 상태 기반 자동 최적화
    autoOptimizeByMemoryState() {
        const analysis = this.analyzeMemoryUsage();
        
        if (!analysis.available) return;
        
        console.log(`Memory Analysis: ${JSON.stringify(analysis, null, 2)}`);
        
        switch (analysis.status) {
            case 'critical':
                console.warn("🚨 Critical memory usage - aggressive cleanup");
                this.aggressiveCleanup();
                break;
                
            case 'warning':
                console.warn("⚠️ High memory usage - proactive cleanup");
                this.proactiveCleanup();
                break;
                
            case 'moderate':
                console.info("ℹ️ Moderate memory usage - routine cleanup");
                this.routineCleanup();
                break;
                
            default:
                console.info("✅ Normal memory usage");
        }
    }
```

## 2. 컴포넌트 라이프사이클 메모리 관리

### 2.1 메모리 최적화 컴포넌트 클래스

```javascript
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
                this.observers = new Set(); // ResizeObserver, IntersectionObserver 등
                
                this.componentDidMount();
                
                // WeakSet에 등록하여 추적
                SPAMemoryManager.prototype.componentInstances.add(this);
            }
            
            componentDidMount() {
                console.log("Component mounted");
                
                // 데이터 로딩
                this.loadData();
                
                // 전역 이벤트 리스너 (AbortController로 일괄 관리)
                this.setupEventListeners();
                
                // 주기적 업데이트
                this.setupPeriodicUpdates();
                
                // WebSocket 연결 시뮬레이션
                this.connectWebSocket();
                
                // Observer 설정 (Intersection, Resize 등)
                this.setupObservers();
            }
            
            setupEventListeners() {
                const events = [
                    { type: 'resize', handler: this.handleResize.bind(this) },
                    { type: 'scroll', handler: this.handleScroll.bind(this), options: { passive: true } },
                    { type: 'beforeunload', handler: this.handleBeforeUnload.bind(this) },
                    { type: 'visibilitychange', handler: this.handleVisibilityChange.bind(this) }
                ];
                
                events.forEach(({ type, handler, options = {} }) => {
                    window.addEventListener(type, handler, {
                        signal: this.abortController.signal,
                        ...options
                    });
                });
            }
            
            setupPeriodicUpdates() {
                // 주기적 데이터 업데이트
                const timer = setInterval(() => {
                    this.updateData();
                }, 5000);
                this.timers.add(timer);
                
                // 메모리 사용량 체크 타이머
                const memoryCheckTimer = setInterval(() => {
                    this.checkMemoryUsage();
                }, 30000); // 30초마다
                this.timers.add(memoryCheckTimer);
            }
            
            setupObservers() {
                // Intersection Observer - 뷰포트 내 요소 감지
                if ('IntersectionObserver' in window) {
                    const intersectionObserver = new IntersectionObserver(
                        this.handleIntersection.bind(this),
                        { threshold: 0.1 }
                    );
                    
                    // 관찰할 요소가 있다면 등록
                    const targetElement = document.getElementById(`component-${this.props.id}`);
                    if (targetElement) {
                        intersectionObserver.observe(targetElement);
                    }
                    
                    this.observers.add(intersectionObserver);
                }
                
                // Resize Observer - 요소 크기 변화 감지
                if ('ResizeObserver' in window) {
                    const resizeObserver = new ResizeObserver(
                        this.handleResize.bind(this)
                    );
                    
                    this.observers.add(resizeObserver);
                }
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
            
            // 이벤트 핸들러들
            handleResize() {
                console.log("Window resized");
                this.updateLayout();
            }
            
            handleScroll() {
                // 스크롤 로직 (throttled/debounced 처리 권장)
                this.updateVisibleContent();
            }
            
            handleBeforeUnload() {
                // 페이지 언로드 전 정리
                this.componentWillUnmount();
            }
            
            handleVisibilityChange() {
                if (document.visibilityState === 'hidden') {
                    // 탭이 숨겨졌을 때 리소스 절약
                    this.pauseUpdates();
                } else {
                    // 탭이 다시 보일 때 업데이트 재개
                    this.resumeUpdates();
                }
            }
            
            handleIntersection(entries) {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        console.log("Component is visible");
                        this.onVisible();
                    } else {
                        console.log("Component is hidden");
                        this.onHidden();
                    }
                });
            }
            
            // 상태 및 업데이트 메서드들
            updateData() {
                if (this.state.data) {
                    console.log("Data updated");
                }
            }
            
            updateLayout() {
                // 레이아웃 업데이트 로직
                if (this.state.data) {
                    console.log("Layout updated based on resize");
                }
            }
            
            updateVisibleContent() {
                // 보이는 컨텐츠만 업데이트하여 성능 최적화
            }
            
            checkMemoryUsage() {
                if (performance.memory) {
                    const used = Math.round(performance.memory.usedJSHeapSize / 1048576);
                    if (used > 100) { // 100MB 초과 시
                        console.warn(`Component ${this.props.id}: High memory usage ${used}MB`);
                    }
                }
            }
            
            pauseUpdates() {
                console.log("Pausing updates for hidden component");
                // 불필요한 업데이트 중지
            }
            
            resumeUpdates() {
                console.log("Resuming updates for visible component");
                // 업데이트 재개
            }
            
            onVisible() {
                // 컴포넌트가 보일 때 필요한 초기화
            }
            
            onHidden() {
                // 컴포넌트가 숨겨질 때 리소스 절약
            }
            
            setState(newState) {
                this.state = { ...this.state, ...newState };
            }
```

### 2.2 체계적인 컴포넌트 정리 시스템

```javascript
            // 컴포넌트 언마운트 시 정리
            componentWillUnmount() {
                console.log("Component unmounting - cleaning up...");
                
                // 1. AbortController로 모든 fetch와 event listener 일괄 해제
                this.abortController.abort();
                
                // 2. Timer 정리
                for (const timer of this.timers) {
                    clearInterval(timer);
                    clearTimeout(timer); // setTimeout도 함께 정리
                }
                this.timers.clear();
                
                // 3. Observer 정리
                for (const observer of this.observers) {
                    observer.disconnect();
                }
                this.observers.clear();
                
                // 4. 구독 정리
                for (const unsubscribe of this.subscriptions) {
                    try {
                        unsubscribe();
                    } catch (error) {
                        console.error("Subscription cleanup error:", error);
                    }
                }
                this.subscriptions.length = 0;
                
                // 5. DOM 참조 정리
                this.cleanupDOMReferences();
                
                // 6. 상태 정리
                this.state = null;
                this.props = null;
                
                console.log("Component cleanup completed");
            }
            
            cleanupDOMReferences() {
                // DOM 요소에 대한 직접 참조 정리
                if (this.elementRefs) {
                    this.elementRefs.clear();
                }
                
                // 이벤트 위임으로 등록된 핸들러 정리
                const componentElement = document.getElementById(`component-${this.props.id}`);
                if (componentElement) {
                    componentElement.removeEventListener('click', this.handleClick);
                    componentElement.removeEventListener('input', this.handleInput);
                }
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
                
                if (this.observers.size > 0) {
                    issues.push(`Active observers: ${this.observers.size}`);
                }
                
                if (issues.length > 0) {
                    console.warn("Potential memory leaks:", issues);
                    return false;
                }
                
                return true;
            }
            
            // 메모리 사용량 프로파일링
            getMemoryProfile() {
                const profile = {
                    timers: this.timers.size,
                    subscriptions: this.subscriptions.length,
                    observers: this.observers.size,
                    hasAbortController: !this.abortController.signal.aborted,
                    stateSize: JSON.stringify(this.state || {}).length,
                    propsSize: JSON.stringify(this.props || {}).length
                };
                
                return profile;
            }
        }
        
        return MemoryOptimizedComponent;
    }
```

## 3. 자동화된 메모리 최적화

### 3.1 메모리 최적화 트리거 시스템

```javascript
    // 메모리 최적화 트리거
    triggerMemoryOptimization() {
        console.log("\n=== 메모리 최적화 실행 ===");
        
        const startMemory = this.analyzeMemoryUsage();
        console.log("Optimization start:", startMemory);
        
        // 1. 사용하지 않는 캐시 정리
        this.clearUnusedCaches();
        
        // 2. 이벤트 리스너 정리
        this.cleanupEventListeners();
        
        // 3. DOM 참조 정리
        this.cleanupDOMReferences();
        
        // 4. 컴포넌트 인스턴스 검사
        this.validateComponentInstances();
        
        // 5. 수동 GC 트리거 (개발 환경에서만)
        if (global.gc && process.env.NODE_ENV === 'development') {
            global.gc();
            console.log("Manual GC triggered");
        }
        
        // 1초 후 결과 확인
        setTimeout(() => {
            const endMemory = this.analyzeMemoryUsage();
            console.log("Optimization result:", endMemory);
            
            if (startMemory.available && endMemory.available) {
                const freed = startMemory.current.used - endMemory.current.used;
                console.log(`Memory freed: ${freed}MB`);
            }
        }, 1000);
    }
    
    // 단계별 정리 전략
    routineCleanup() {
        console.log("Performing routine cleanup...");
        this.clearExpiredCaches();
    }
    
    proactiveCleanup() {
        console.log("Performing proactive cleanup...");
        this.clearUnusedCaches();
        this.cleanupInactiveComponents();
    }
    
    aggressiveCleanup() {
        console.log("Performing aggressive cleanup...");
        this.clearAllCaches();
        this.forceCleanupAllRoutes();
        this.cleanupDOMReferences();
    }
```

### 3.2 캐시 및 리소스 정리

```javascript
    clearUnusedCaches() {
        console.log("Clearing unused caches...");
        
        // 이미지 캐시 정리
        if (window.imageCache instanceof Map) {
            const now = Date.now();
            const maxAge = 10 * 60 * 1000; // 10분
            
            for (const [key, entry] of window.imageCache.entries()) {
                if (now - entry.timestamp > maxAge) {
                    window.imageCache.delete(key);
                    if (entry.objectURL) {
                        URL.revokeObjectURL(entry.objectURL);
                    }
                }
            }
        }
        
        // API 응답 캐시 정리
        if (window.apiCache instanceof Map) {
            const now = Date.now();
            const maxAge = 5 * 60 * 1000; // 5분
            
            let clearedCount = 0;
            for (const [key, entry] of window.apiCache.entries()) {
                if (now - entry.timestamp > maxAge) {
                    window.apiCache.delete(key);
                    clearedCount++;
                }
            }
            console.log(`Cleared ${clearedCount} API cache entries`);
        }
        
        // 컴포넌트 캐시 정리
        if (window.componentCache instanceof Map) {
            window.componentCache.clear();
        }
    }
    
    clearExpiredCaches() {
        // 만료된 캐시만 정리 (routine)
        console.log("Clearing expired caches only...");
    }
    
    clearAllCaches() {
        // 모든 캐시 강제 정리 (aggressive)
        console.log("Clearing all caches...");
        
        if (window.imageCache) window.imageCache.clear();
        if (window.apiCache) window.apiCache.clear();
        if (window.componentCache) window.componentCache.clear();
    }
    
    cleanupEventListeners() {
        console.log("Cleaning up event listeners...");
        
        let cleanedCount = 0;
        for (const [eventType, listeners] of this.globalEventListeners) {
            for (const listener of listeners) {
                if (listener.cleanup) {
                    listener.cleanup();
                    cleanedCount++;
                }
            }
        }
        this.globalEventListeners.clear();
        console.log(`Cleaned up ${cleanedCount} event listeners`);
    }
    
    cleanupDOMReferences() {
        console.log("Cleaning up DOM references...");
        
        // 사용하지 않는 DOM 요소 참조 정리
        const elementsToClean = document.querySelectorAll('[data-cleanup="true"]');
        elementsToClean.forEach(el => el.remove());
        
        // 고아 DOM 노드 정리
        this.cleanupOrphanNodes();
    }
    
    cleanupOrphanNodes() {
        // 참조가 끊어진 DOM 노드들 찾아서 정리
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: (node) => {
                    // 특정 조건에 맞는 고아 노드 식별
                    if (node.classList.contains('orphan') || 
                        node.hasAttribute('data-component-destroyed')) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            }
        );
        
        const orphanNodes = [];
        let node;
        while (node = walker.nextNode()) {
            orphanNodes.push(node);
        }
        
        orphanNodes.forEach(node => node.remove());
        console.log(`Removed ${orphanNodes.length} orphan nodes`);
    }
    
    validateComponentInstances() {
        // WeakSet을 사용하므로 직접 순회는 불가능
        // 대신 전역 레지스트리를 통해 검증
        console.log("Validating component instances...");
        
        if (window.__COMPONENT_REGISTRY__) {
            const activeComponents = window.__COMPONENT_REGISTRY__.size;
            console.log(`Active components: ${activeComponents}`);
            
            if (activeComponents > 1000) {
                console.warn("Too many active components - potential memory leak");
            }
        }
    }
    
    // 정리 메서드
    cleanup() {
        console.log("SPAMemoryManager cleanup started...");
        
        if (this.memoryMonitor) {
            clearInterval(this.memoryMonitor);
            this.memoryMonitor = null;
        }
        
        // 모든 라우트 정리
        for (const [routeName] of this.routeCleanups) {
            this.cleanupRoute(routeName);
        }
        
        this.routeCleanups.clear();
        this.globalEventListeners.clear();
        
        console.log("SPAMemoryManager cleanup completed");
    }
}
```

## 핵심 요점

### 1. 시스템적 접근

메모리 관리를 개별 컴포넌트 수준이 아닌 전체 애플리케이션 아키텍처로 설계

### 2. AbortController 패턴

모든 비동기 작업과 이벤트 리스너를 일괄 관리할 수 있는 강력한 정리 메커니즘

### 3. 단계적 최적화

메모리 사용량에 따른 단계적 정리 전략으로 성능 영향 최소화

### 4. 자동화된 모니터링

실시간 메모리 사용량 추적과 임계값 기반 자동 최적화

---

**이전**: [9.3d3 대규모 SPA 메모리 관리 개요](./03d3-spa-memory-management.md)  
**다음**: [라우트별 메모리 관리 전략](./03d3b-route-memory-management.md)에서 Vue Router와 React Router 기반 메모리 관리를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-09-advanced-memory-management)

- [Chapter 9-1: 메모리 할당자의 내부 구현 개요](../chapter-08-memory-allocator-gc/09-10-memory-allocator.md)
- [Chapter 9-1A: malloc 내부 동작의 진실](../chapter-08-memory-allocator-gc/09-01-malloc-fundamentals.md)
- [Chapter 9-1B: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](../chapter-08-memory-allocator-gc/09-11-allocator-comparison.md)
- [Chapter 9-1C: 커스텀 메모리 할당자 구현](../chapter-08-memory-allocator-gc/09-12-custom-allocators.md)
- [Chapter 9-1D: 실전 메모리 최적화 사례](./09-30-production-optimization.md)

### 🏷️ 관련 키워드

`SPA`, `메모리 관리`, `컴포넌트 라이프사이클`, `AbortController`, `메모리 모니터링`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
