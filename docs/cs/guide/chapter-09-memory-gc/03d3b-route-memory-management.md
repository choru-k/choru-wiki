---
tags:
  - SPA
  - Vue Router
  - React Router
  - Route Management
  - Memory Management
---

# 9.3d3b 라우트별 메모리 관리 전략

## 🛣️ 라우트 기반 메모리 관리의 중요성

Single Page Application에서 라우트 변경은 사실상 새로운 페이지로 전환하는 것과 같습니다. 각 라우트는 고유한 컴포넌트 트리, 데이터 구독, 이벤트 리스너를 가지며, 이들을 체계적으로 관리하지 않으면 심각한 메모리 누수가 발생합니다.

## 1. Vue Router 기반 메모리 관리

### 1.1 VueRouterMemoryManager 구현

```javascript
// Vue.js 기반 SPA의 라우트별 메모리 관리
class VueRouterMemoryManager {
    constructor(router, memoryManager) {
        this.router = router;
        this.memoryManager = memoryManager;
        this.routeData = new Map();
        this.routeHistory = [];
        this.maxHistorySize = 5; // 최근 5개 라우트만 추적
        
        this.setupRouterHooks();
    }
    
    setupRouterHooks() {
        // 라우트 진입 시
        this.router.beforeEach((to, from, next) => {
            console.log(`Navigating from ${from.name || 'initial'} to ${to.name}`);
            
            // 메모리 사용량 체크
            this.checkMemoryBeforeNavigation(to, from);
            
            // 이전 라우트 정리
            if (from.name) {
                this.cleanupRoute(from.name);
            }
            
            // 새 라우트 준비
            this.prepareRoute(to.name, to.params, to.query);
            
            // 라우트 히스토리 업데이트
            this.updateRouteHistory(to);
            
            next();
        });
        
        // 라우트 해결 후
        this.router.afterEach((to, from) => {
            console.log(`Navigation completed: ${to.name}`);
            this.onRouteResolved(to, from);
        });
        
        // 네비게이션 에러 처리
        this.router.onError((error) => {
            console.error("Router error:", error);
            this.handleNavigationError(error);
        });
    }
    
    checkMemoryBeforeNavigation(to, from) {
        if (performance.memory) {
            const memory = performance.memory;
            const usagePercent = (memory.totalJSHeapSize / memory.jsHeapSizeLimit) * 100;
            
            if (usagePercent > 80) {
                console.warn(`⚠️ High memory usage (${usagePercent.toFixed(1)}%) before navigating to ${to.name}`);
                
                // 긴급 정리 수행
                this.emergencyCleanup();
            }
        }
    }
    
    prepareRoute(routeName, params = {}, query = {}) {
        console.log(`Preparing route: ${routeName}`);
        
        // 라우트별 데이터 초기화
        const routeData = {
            name: routeName,
            params: { ...params },
            query: { ...query },
            components: new Set(),
            subscriptions: [],
            timers: new Set(),
            eventListeners: new Map(),
            observers: new Set(),
            caches: new Map(),
            startTime: Date.now(),
            memorySnapshot: this.captureMemorySnapshot()
        };
        
        this.routeData.set(routeName, routeData);
        
        // 라우트별 전역 이벤트 리스너 설정
        this.setupRouteEventListeners(routeName);
    }
    
    setupRouteEventListeners(routeName) {
        const routeData = this.routeData.get(routeName);
        if (!routeData) return;
        
        // 페이지 가시성 변화 감지
        const visibilityHandler = () => {
            if (document.visibilityState === 'hidden') {
                this.pauseRouteActivities(routeName);
            } else {
                this.resumeRouteActivities(routeName);
            }
        };
        
        document.addEventListener('visibilitychange', visibilityHandler);
        
        // 정리 함수 등록
        if (!routeData.eventListeners.has(document)) {
            routeData.eventListeners.set(document, []);
        }
        routeData.eventListeners.get(document).push({
            event: 'visibilitychange',
            handler: visibilityHandler
        });
    }
    
    captureMemorySnapshot() {
        if (!performance.memory) return null;
        
        return {
            timestamp: Date.now(),
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit
        };
    }
    
    cleanupRoute(routeName) {
        const data = this.routeData.get(routeName);
        if (!data) return;
        
        console.log(`Cleaning up route: ${routeName}`);
        const startTime = Date.now();
        
        // 1. 컴포넌트 정리
        let componentCount = 0;
        for (const component of data.components) {
            if (component.cleanup) {
                component.cleanup();
                componentCount++;
            }
        }
        data.components.clear();
        
        // 2. 구독 정리
        let subscriptionCount = 0;
        data.subscriptions.forEach(unsubscribe => {
            try {
                unsubscribe();
                subscriptionCount++;
            } catch (error) {
                console.error("Subscription cleanup error:", error);
            }
        });
        data.subscriptions.length = 0;
        
        // 3. 타이머 정리
        let timerCount = 0;
        data.timers.forEach(timerId => {
            clearInterval(timerId);
            clearTimeout(timerId);
            timerCount++;
        });
        data.timers.clear();
        
        // 4. Observer 정리
        let observerCount = 0;
        data.observers.forEach(observer => {
            observer.disconnect();
            observerCount++;
        });
        data.observers.clear();
        
        // 5. 이벤트 리스너 정리
        let eventListenerCount = 0;
        for (const [element, listeners] of data.eventListeners) {
            listeners.forEach(({ event, handler }) => {
                element.removeEventListener(event, handler);
                eventListenerCount++;
            });
        }
        data.eventListeners.clear();
        
        // 6. 캐시 정리
        data.caches.clear();
        
        // 정리 완료 로깅
        const cleanupTime = Date.now() - startTime;
        console.log(`Route ${routeName} cleanup completed in ${cleanupTime}ms:`);
        console.log(`  - Components: ${componentCount}`);
        console.log(`  - Subscriptions: ${subscriptionCount}`);
        console.log(`  - Timers: ${timerCount}`);
        console.log(`  - Observers: ${observerCount}`);
        console.log(`  - Event Listeners: ${eventListenerCount}`);
        
        // 메모리 사용량 비교
        const endSnapshot = this.captureMemorySnapshot();
        if (data.memorySnapshot && endSnapshot) {
            const memoryFreed = data.memorySnapshot.used - endSnapshot.used;
            console.log(`  - Memory freed: ${Math.round(memoryFreed / 1048576)}MB`);
        }
        
        // 데이터 삭제
        this.routeData.delete(routeName);
    }
    
    pauseRouteActivities(routeName) {
        const data = this.routeData.get(routeName);
        if (!data) return;
        
        console.log(`Pausing activities for route: ${routeName}`);
        
        // 타이머 일시 중지 (실제로는 간격 늘리기)
        data.timers.forEach(timerId => {
            // 실제 구현에서는 timer registry를 통해 간격 조절
        });
    }
    
    resumeRouteActivities(routeName) {
        const data = this.routeData.get(routeName);
        if (!data) return;
        
        console.log(`Resuming activities for route: ${routeName}`);
        
        // 타이머 재개
        // 실제 구현에서는 필요한 활동들 재개
    }
    
    updateRouteHistory(route) {
        this.routeHistory.push({
            name: route.name,
            path: route.path,
            timestamp: Date.now(),
            memoryUsage: this.captureMemorySnapshot()
        });
        
        // 히스토리 크기 제한
        if (this.routeHistory.length > this.maxHistorySize) {
            this.routeHistory.shift();
        }
    }
    
    onRouteResolved(to, from) {
        // 라우트 전환 완료 후 메모리 상태 체크
        setTimeout(() => {
            this.analyzeRouteMemoryImpact(to, from);
        }, 1000);
    }
    
    analyzeRouteMemoryImpact(to, from) {
        const currentSnapshot = this.captureMemorySnapshot();
        if (!currentSnapshot) return;
        
        const currentRoute = this.routeData.get(to.name);
        if (!currentRoute) return;
        
        const memoryIncrease = currentSnapshot.used - currentRoute.memorySnapshot.used;
        const timeSpent = Date.now() - currentRoute.startTime;
        
        console.log(`Route ${to.name} memory analysis:`);
        console.log(`  - Time spent: ${timeSpent}ms`);
        console.log(`  - Memory increase: ${Math.round(memoryIncrease / 1048576)}MB`);
        
        // 메모리 증가가 큰 경우 경고
        if (memoryIncrease > 50 * 1024 * 1024) { // 50MB
            console.warn(`⚠️ Route ${to.name} caused significant memory increase`);
        }
    }
    
    handleNavigationError(error) {
        // 네비게이션 에러 시 정리 작업
        console.error("Navigation error, performing cleanup:", error);
        
        // 현재 진행 중인 라우트 데이터 정리
        for (const [routeName, data] of this.routeData) {
            if (Date.now() - data.startTime > 30000) { // 30초 이상 된 데이터
                this.cleanupRoute(routeName);
            }
        }
    }
    
    emergencyCleanup() {
        console.log("Performing emergency cleanup before route navigation");
        
        // 가장 오래된 라우트부터 정리
        const sortedRoutes = Array.from(this.routeData.entries())
            .sort(([, a], [, b]) => a.startTime - b.startTime);
        
        // 오래된 라우트 절반 정리
        const cleanupCount = Math.ceil(sortedRoutes.length / 2);
        for (let i = 0; i < cleanupCount; i++) {
            const [routeName] = sortedRoutes[i];
            this.cleanupRoute(routeName);
        }
    }
    
    // 헬퍼 메서드들
    registerComponent(routeName, component) {
        const data = this.routeData.get(routeName);
        if (data) {
            data.components.add(component);
        }
    }
    
    registerSubscription(routeName, subscription) {
        const data = this.routeData.get(routeName);
        if (data) {
            data.subscriptions.push(subscription);
        }
    }
    
    registerTimer(routeName, timerId) {
        const data = this.routeData.get(routeName);
        if (data) {
            data.timers.add(timerId);
        }
    }
    
    registerObserver(routeName, observer) {
        const data = this.routeData.get(routeName);
        if (data) {
            data.observers.add(observer);
        }
    }
    
    // 상태 조회 메서드
    getRouteMemoryUsage() {
        const usage = new Map();
        
        for (const [routeName, data] of this.routeData) {
            const current = this.captureMemorySnapshot();
            if (current && data.memorySnapshot) {
                usage.set(routeName, {
                    increase: current.used - data.memorySnapshot.used,
                    duration: Date.now() - data.startTime,
                    componentCount: data.components.size,
                    subscriptionCount: data.subscriptions.length,
                    timerCount: data.timers.size
                });
            }
        }
        
        return usage;
    }
    
    getMemoryReport() {
        const report = {
            activeRoutes: this.routeData.size,
            routeHistory: this.routeHistory,
            memoryUsage: this.getRouteMemoryUsage(),
            recommendations: []
        };
        
        // 추천사항 생성
        if (report.activeRoutes > 3) {
            report.recommendations.push("Too many active routes - consider implementing route-based code splitting");
        }
        
        for (const [routeName, usage] of report.memoryUsage) {
            if (usage.increase > 100 * 1024 * 1024) { // 100MB
                report.recommendations.push(`Route '${routeName}' uses excessive memory (${Math.round(usage.increase / 1048576)}MB)`);
            }
        }
        
        return report;
    }
}
```

## 2. React Router 기반 메모리 관리

### 2.1 useMemoryManagement Hook 구현

```javascript
// React Router 기반 SPA의 메모리 관리 Hook
function useMemoryManagement(routeName, options = {}) {
    const [memoryStats, setMemoryStats] = useState(null);
    const [routeMetrics, setRouteMetrics] = useState({
        loadTime: 0,
        componentCount: 0,
        subscriptionCount: 0,
        timerCount: 0
    });
    
    // 참조 관리
    const abortController = useRef(new AbortController());
    const subscriptions = useRef([]);
    const timers = useRef(new Set());
    const observers = useRef(new Set());
    const componentRefs = useRef(new Set());
    const startTime = useRef(Date.now());
    const memoryMonitorRef = useRef(null);
    
    // 옵션 설정
    const config = {
        memoryCheckInterval: 5000,
        enableDetailedLogging: false,
        maxSubscriptions: 100,
        maxTimers: 50,
        ...options
    };
    
    // 메모리 사용량 추적
    useEffect(() => {
        const updateMemoryStats = () => {
            if (performance.memory) {
                const newStats = {
                    used: Math.round(performance.memory.usedJSHeapSize / 1048576),
                    total: Math.round(performance.memory.totalJSHeapSize / 1048576),
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
                    timestamp: Date.now()
                };
                
                setMemoryStats(newStats);
                
                if (config.enableDetailedLogging) {
                    console.log(`Route ${routeName} memory:`, newStats);
                }
            }
        };
        
        // 초기 측정
        updateMemoryStats();
        
        // 주기적 측정
        const interval = setInterval(updateMemoryStats, config.memoryCheckInterval);
        timers.current.add(interval);
        memoryMonitorRef.current = interval;
        
        return () => {
            clearInterval(interval);
            memoryMonitorRef.current = null;
        };
    }, [routeName, config.memoryCheckInterval, config.enableDetailedLogging]);
    
    // 라우트 메트릭 추적
    useEffect(() => {
        const updateMetrics = () => {
            setRouteMetrics(prev => ({
                ...prev,
                loadTime: Date.now() - startTime.current,
                componentCount: componentRefs.current.size,
                subscriptionCount: subscriptions.current.length,
                timerCount: timers.current.size
            }));
        };
        
        const metricsTimer = setInterval(updateMetrics, 10000); // 10초마다
        timers.current.add(metricsTimer);
        
        return () => clearInterval(metricsTimer);
    }, []);
    
    // 라우트 변경 시 정리
    useEffect(() => {
        return () => {
            const cleanupStartTime = Date.now();
            console.log(`Cleaning up route: ${routeName}`);
            
            // AbortController로 모든 요청 취소
            abortController.current.abort();
            
            // 모든 구독 해제
            let subscriptionErrors = 0;
            subscriptions.current.forEach((unsubscribe, index) => {
                if (typeof unsubscribe === 'function') {
                    try {
                        unsubscribe();
                    } catch (error) {
                        subscriptionErrors++;
                        console.error(`Subscription ${index} cleanup error:`, error);
                    }
                }
            });
            
            // 모든 타이머 정리
            let timerCount = 0;
            timers.current.forEach(timerId => {
                clearInterval(timerId);
                clearTimeout(timerId);
                timerCount++;
            });
            
            // 모든 Observer 정리
            let observerCount = 0;
            observers.current.forEach(observer => {
                observer.disconnect();
                observerCount++;
            });
            
            // 컴포넌트 참조 정리
            componentRefs.current.clear();
            
            const cleanupTime = Date.now() - cleanupStartTime;
            console.log(`Route ${routeName} cleaned up in ${cleanupTime}ms:`);
            console.log(`  - Subscriptions: ${subscriptions.current.length} (${subscriptionErrors} errors)`);
            console.log(`  - Timers: ${timerCount}`);
            console.log(`  - Observers: ${observerCount}`);
            
            if (subscriptionErrors > 0) {
                console.warn(`⚠️ ${subscriptionErrors} subscription cleanup errors in route ${routeName}`);
            }
        };
    }, [routeName]);
    
    // 구독 등록 헬퍼
    const addSubscription = useCallback((subscription) => {
        if (subscriptions.current.length >= config.maxSubscriptions) {
            console.warn(`Max subscriptions (${config.maxSubscriptions}) reached for route ${routeName}`);
            return false;
        }
        
        subscriptions.current.push(subscription);
        return true;
    }, [routeName, config.maxSubscriptions]);
    
    // 타이머 등록 헬퍼
    const addTimer = useCallback((timerId) => {
        if (timers.current.size >= config.maxTimers) {
            console.warn(`Max timers (${config.maxTimers}) reached for route ${routeName}`);
            return false;
        }
        
        timers.current.add(timerId);
        return true;
    }, [routeName, config.maxTimers]);
    
    // Observer 등록 헬퍼
    const addObserver = useCallback((observer) => {
        observers.current.add(observer);
        return () => observers.current.delete(observer);
    }, []);
    
    // 컴포넌트 참조 등록
    const registerComponent = useCallback((componentRef) => {
        componentRefs.current.add(componentRef);
        return () => componentRefs.current.delete(componentRef);
    }, []);
    
    // Fetch 요청 헬퍼 (AbortController 자동 적용)
    const fetchWithCleanup = useCallback(async (url, options = {}) => {
        return fetch(url, {
            ...options,
            signal: abortController.current.signal
        });
    }, []);
    
    // 메모리 경고 체크
    const checkMemoryWarnings = useCallback(() => {
        if (!memoryStats) return [];
        
        const warnings = [];
        
        if (memoryStats.used > memoryStats.limit * 0.8) {
            warnings.push({
                type: 'HIGH_MEMORY_USAGE',
                message: `High memory usage: ${memoryStats.used}MB (${((memoryStats.used / memoryStats.limit) * 100).toFixed(1)}%)`
            });
        }
        
        if (routeMetrics.subscriptionCount > 50) {
            warnings.push({
                type: 'TOO_MANY_SUBSCRIPTIONS',
                message: `Too many subscriptions: ${routeMetrics.subscriptionCount}`
            });
        }
        
        if (routeMetrics.timerCount > 20) {
            warnings.push({
                type: 'TOO_MANY_TIMERS',
                message: `Too many timers: ${routeMetrics.timerCount}`
            });
        }
        
        return warnings;
    }, [memoryStats, routeMetrics]);
    
    // 메모리 프로파일 생성
    const getMemoryProfile = useCallback(() => {
        return {
            route: routeName,
            memoryStats,
            routeMetrics,
            warnings: checkMemoryWarnings(),
            uptime: Date.now() - startTime.current,
            resourceCounts: {
                subscriptions: subscriptions.current.length,
                timers: timers.current.size,
                observers: observers.current.size,
                components: componentRefs.current.size
            }
        };
    }, [routeName, memoryStats, routeMetrics, checkMemoryWarnings]);
    
    return {
        memoryStats,
        routeMetrics,
        addSubscription,
        addTimer,
        addObserver,
        registerComponent,
        fetchWithCleanup,
        abortController: abortController.current,
        checkMemoryWarnings,
        getMemoryProfile
    };
}
```

### 2.2 React 컴포넌트에서 사용 예시

```javascript
// React 컴포넌트에서 사용 예시
function ProductListPage() {
    const { 
        memoryStats, 
        routeMetrics,
        addSubscription, 
        addTimer,
        addObserver,
        fetchWithCleanup,
        checkMemoryWarnings 
    } = useMemoryManagement('product-list', {
        enableDetailedLogging: true,
        memoryCheckInterval: 3000
    });
    
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [warnings, setWarnings] = useState([]);
    
    useEffect(() => {
        // 데이터 로딩
        const loadProducts = async () => {
            setLoading(true);
            try {
                const response = await fetchWithCleanup('/api/products');
                const data = await response.json();
                setProducts(data);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Failed to load products:', error);
                }
            } finally {
                setLoading(false);
            }
        };
        
        loadProducts();
        
        // WebSocket 구독
        const ws = new WebSocket('/ws/products');
        ws.onmessage = (event) => {
            const update = JSON.parse(event.data);
            setProducts(prev => prev.map(p => p.id === update.id ? update : p));
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        // 구독 정리 함수 등록
        addSubscription(() => {
            ws.close();
            console.log('WebSocket connection closed');
        });
        
        // 주기적 데이터 갱신
        const refreshTimer = setInterval(() => {
            loadProducts();
        }, 30000); // 30초마다
        
        addTimer(refreshTimer);
        
    }, [fetchWithCleanup, addSubscription, addTimer]);
    
    // IntersectionObserver 사용
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        // 뷰포트에 들어온 상품 이미지 로드
                        const img = entry.target.querySelector('img[data-src]');
                        if (img) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                        }
                    }
                });
            },
            { threshold: 0.1 }
        );
        
        // 모든 상품 카드 관찰
        const productCards = document.querySelectorAll('.product-card');
        productCards.forEach(card => observer.observe(card));
        
        // Observer 등록 및 정리 함수 반환
        const cleanup = addObserver(observer);
        
        return cleanup;
    }, [products, addObserver]);
    
    // 메모리 경고 체크
    useEffect(() => {
        const newWarnings = checkMemoryWarnings();
        setWarnings(newWarnings);
        
        if (newWarnings.length > 0) {
            console.warn('Memory warnings:', newWarnings);
        }
    }, [memoryStats, routeMetrics, checkMemoryWarnings]);
    
    return (
        <div className="product-list-page">
            <header className="page-header">
                <h1>Products</h1>
                
                {/* 개발 환경에서만 메모리 정보 표시 */}
                {process.env.NODE_ENV === 'development' && memoryStats && (
                    <div className="memory-debug-info">
                        <div className="memory-stats">
                            <span>Memory: {memoryStats.used}MB / {memoryStats.total}MB</span>
                            <span>Usage: {((memoryStats.used / memoryStats.limit) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="route-metrics">
                            <span>Components: {routeMetrics.componentCount}</span>
                            <span>Subscriptions: {routeMetrics.subscriptionCount}</span>
                            <span>Timers: {routeMetrics.timerCount}</span>
                        </div>
                        {warnings.length > 0 && (
                            <div className="memory-warnings">
                                {warnings.map((warning, index) => (
                                    <div key={index} className={`warning warning-${warning.type.toLowerCase()}`}>
                                        {warning.message}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </header>
            
            <main className="product-list-content">
                {loading && <div className="loading-spinner">Loading...</div>}
                
                <div className="product-grid">
                    {products.map(product => (
                        <ProductCard 
                            key={product.id} 
                            product={product}
                            className="product-card"
                        />
                    ))}
                </div>
                
                {products.length === 0 && !loading && (
                    <div className="empty-state">
                        <p>No products found</p>
                    </div>
                )}
            </main>
        </div>
    );
}
```

## 핵심 요점

### 1. 라우트별 격리

각 라우트의 메모리 사용을 독립적으로 관리하여 누수 원인을 명확히 식별

### 2. 자동화된 정리

라우트 변경 시 자동으로 모든 리소스를 정리하는 체계적인 메커니즘

### 3. 실시간 모니터링

메모리 사용량과 리소스 수를 실시간으로 추적하여 문제를 조기 발견

### 4. 프레임워크별 최적화

Vue Router와 React Router 각각의 특성을 활용한 맞춤형 메모리 관리

---

**이전**: [SPA 메모리 관리 아키텍처](03d3a-spa-architecture-lifecycle.md)  
**다음**: [고급 메모리 최적화 기법](03d3c-advanced-optimization.md)에서 가상 스크롤링과 Progressive Loading 기법을 학습합니다.
