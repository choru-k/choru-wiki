---
tags:
  - SPA
  - Virtual Scrolling
  - Progressive Loading
  - Memory Optimization
  - Performance
---

# 9.3d3c 고급 메모리 최적화 기법

## 🚀 대용량 데이터와 메모리 효율성

대규모 SPA에서는 수만 개의 리스트 아이템, 복잡한 데이터 시각화, 실시간 스트리밍 데이터를 다뤄야 합니다. 전통적인 DOM 렌더링으로는 메모리와 성능 모두 한계에 부딪히게 됩니다. 이 장에서는 이러한 도전을 해결하는 고급 최적화 기법들을 다룹니다.

## 1. 가상 스크롤링으로 대용량 리스트 최적화

### 1.1 VirtualScrollManager 구현

```javascript
// 대용량 리스트를 위한 가상 스크롤링 구현
class VirtualScrollManager {
    constructor(containerElement, itemHeight, renderItem, options = {}) {
        this.container = containerElement;
        this.itemHeight = itemHeight;
        this.renderItem = renderItem;
        this.items = [];
        this.visibleItems = new Map();
        this.scrollTop = 0;
        this.containerHeight = 0;
        this.totalHeight = 0;
        
        // 성능 최적화 옵션
        this.options = {
            overscan: 5, // 보이는 영역 외에 추가로 렌더링할 아이템 수
            throttleMs: 16, // 스크롤 이벤트 스로틀링 간격 (~60fps)
            estimatedItemHeight: itemHeight, // 동적 높이 지원을 위한 추정 높이
            enableDynamicHeight: false,
            recycleElements: true, // 요소 재사용 여부
            ...options
        };
        
        // 요소 재사용 풀
        this.elementPool = [];
        this.poolSize = 50;
        
        // 스크롤 성능 최적화
        this.isScrolling = false;
        this.scrollEndTimer = null;
        this.rafId = null;
        
        this.setupScrollListener();
        this.setupResizeObserver();
    }
    
    setupScrollListener() {
        // 스로틀링된 스크롤 핸들러
        let lastScrollTime = 0;
        const throttledHandler = (event) => {
            const now = performance.now();
            if (now - lastScrollTime < this.options.throttleMs) {
                return;
            }
            lastScrollTime = now;
            
            this.handleScroll();
        };
        
        this.container.addEventListener('scroll', throttledHandler, {
            passive: true // 성능 최적화
        });
        
        // 스크롤 상태 추적
        this.container.addEventListener('scroll', () => {
            this.isScrolling = true;
            
            // 스크롤 종료 감지
            if (this.scrollEndTimer) {
                clearTimeout(this.scrollEndTimer);
            }
            
            this.scrollEndTimer = setTimeout(() => {
                this.isScrolling = false;
                this.onScrollEnd();
            }, 100);
        }, { passive: true });
    }
    
    setupResizeObserver() {
        // ResizeObserver로 컨테이너 크기 변화 감지
        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    this.containerHeight = entry.contentRect.height;
                    this.updateVisibleItems();
                }
            });
            
            this.resizeObserver.observe(this.container);
        } else {
            // 폴백: 윈도우 리사이즈 이벤트
            const handleResize = () => {
                this.containerHeight = this.container.clientHeight;
                this.updateVisibleItems();
            };
            
            window.addEventListener('resize', handleResize);
            this.cleanupResizeHandler = () => {
                window.removeEventListener('resize', handleResize);
            };
        }
    }
    
    setItems(items) {
        this.items = items;
        this.totalHeight = items.length * this.itemHeight;
        
        // 컨테이너 총 높이 설정
        this.container.style.height = `${this.totalHeight}px`;
        this.container.style.position = 'relative';
        
        this.updateVisibleItems();
    }
    
    handleScroll() {
        // RAF를 사용하여 스크롤 처리 최적화
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        
        this.rafId = requestAnimationFrame(() => {
            this.scrollTop = this.container.scrollTop;
            this.updateVisibleItems();
        });
    }
    
    updateVisibleItems() {
        if (!this.containerHeight || !this.items.length) return;
        
        // 현재 보이는 범위 계산
        const startIndex = Math.max(0, 
            Math.floor(this.scrollTop / this.itemHeight) - this.options.overscan
        );
        const endIndex = Math.min(
            this.items.length - 1,
            Math.ceil((this.scrollTop + this.containerHeight) / this.itemHeight) + this.options.overscan
        );
        
        // 성능 측정
        const updateStart = performance.now();
        
        // 현재 범위를 벗어난 아이템 제거
        this.removeInvisibleItems(startIndex, endIndex);
        
        // 새로 보이는 아이템 추가
        this.addVisibleItems(startIndex, endIndex);
        
        // 성능 로깅 (개발 환경에서만)
        if (process.env.NODE_ENV === 'development') {
            const updateTime = performance.now() - updateStart;
            if (updateTime > 16) { // 16ms 초과 시 경고
                console.warn(`Virtual scroll update took ${updateTime.toFixed(2)}ms`);
            }
        }
    }
    
    removeInvisibleItems(startIndex, endIndex) {
        const itemsToRemove = [];
        
        for (const [index, element] of this.visibleItems) {
            if (index < startIndex || index > endIndex) {
                itemsToRemove.push({ index, element });
            }
        }
        
        itemsToRemove.forEach(({ index, element }) => {
            // 요소 재사용을 위해 풀에 반환
            if (this.options.recycleElements && this.elementPool.length < this.poolSize) {
                this.resetElement(element);
                this.elementPool.push(element);
            } else {
                element.remove();
            }
            
            this.visibleItems.delete(index);
        });
    }
    
    addVisibleItems(startIndex, endIndex) {
        for (let i = startIndex; i <= endIndex; i++) {
            if (!this.visibleItems.has(i) && this.items[i]) {
                const element = this.createOrReuseElement(this.items[i], i);
                this.positionElement(element, i);
                
                this.container.appendChild(element);
                this.visibleItems.set(i, element);
            }
        }
    }
    
    createOrReuseElement(item, index) {
        let element;
        
        if (this.options.recycleElements && this.elementPool.length > 0) {
            // 풀에서 요소 재사용
            element = this.elementPool.pop();
        } else {
            // 새 요소 생성
            element = document.createElement('div');
            element.className = 'virtual-scroll-item';
        }
        
        // 사용자 정의 렌더링 함수 호출
        this.renderItem(element, item, index);
        
        return element;
    }
    
    positionElement(element, index) {
        element.style.position = 'absolute';
        element.style.top = `${index * this.itemHeight}px`;
        element.style.height = `${this.itemHeight}px`;
        element.style.width = '100%';
        element.style.left = '0';
    }
    
    resetElement(element) {
        // 요소를 재사용하기 위해 초기화
        element.innerHTML = '';
        element.className = 'virtual-scroll-item';
        element.removeAttribute('data-index');
        
        // 인라인 스타일 유지 (position, top 등)
    }
    
    onScrollEnd() {
        // 스크롤 종료 후 추가 최적화 작업
        console.log('Scroll ended, performing optimizations...');
        
        // 메모리 정리
        this.trimElementPool();
        
        // 사용하지 않는 캐시 정리
        this.cleanupCaches();
    }
    
    trimElementPool() {
        // 요소 풀 크기 제한
        while (this.elementPool.length > this.poolSize) {
            const element = this.elementPool.pop();
            element.remove();
        }
    }
    
    cleanupCaches() {
        // 가상 스크롤 관련 캐시 정리
        if (window.virtualScrollCache) {
            const cacheSize = window.virtualScrollCache.size;
            if (cacheSize > 1000) {
                // 오래된 캐시 항목 정리
                const entries = Array.from(window.virtualScrollCache.entries());
                const toDelete = entries.slice(0, Math.floor(cacheSize / 2));
                toDelete.forEach(([key]) => window.virtualScrollCache.delete(key));
            }
        }
    }
    
    // 동적 높이 지원 (옵션)
    updateItemHeight(index, newHeight) {
        if (!this.options.enableDynamicHeight) return;
        
        // 동적 높이 로직 구현
        console.log(`Updating item ${index} height to ${newHeight}px`);
        // 실제 구현에서는 각 아이템의 높이를 개별 추적
    }
    
    // 특정 인덱스로 스크롤
    scrollToIndex(index, alignment = 'start') {
        if (index < 0 || index >= this.items.length) return;
        
        let scrollTop;
        const itemTop = index * this.itemHeight;
        
        switch (alignment) {
            case 'start':
                scrollTop = itemTop;
                break;
            case 'center':
                scrollTop = itemTop - (this.containerHeight / 2) + (this.itemHeight / 2);
                break;
            case 'end':
                scrollTop = itemTop - this.containerHeight + this.itemHeight;
                break;
            default:
                scrollTop = itemTop;
        }
        
        this.container.scrollTop = Math.max(0, Math.min(scrollTop, 
            this.totalHeight - this.containerHeight));
    }
    
    // 현재 보이는 아이템 정보
    getVisibleRange() {
        if (!this.containerHeight) return { start: 0, end: 0 };
        
        const start = Math.floor(this.scrollTop / this.itemHeight);
        const end = Math.min(
            this.items.length - 1,
            Math.ceil((this.scrollTop + this.containerHeight) / this.itemHeight)
        );
        
        return { start, end };
    }
    
    // 메모리 사용량 추적
    getMemoryUsage() {
        return {
            visibleItemCount: this.visibleItems.size,
            poolSize: this.elementPool.length,
            totalItems: this.items.length,
            memoryEfficiency: this.visibleItems.size / this.items.length
        };
    }
    
    cleanup() {
        // 정리 작업
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        
        if (this.scrollEndTimer) {
            clearTimeout(this.scrollEndTimer);
        }
        
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        if (this.cleanupResizeHandler) {
            this.cleanupResizeHandler();
        }
        
        // 모든 visible 아이템 제거
        for (const element of this.visibleItems.values()) {
            element.remove();
        }
        this.visibleItems.clear();
        
        // 요소 풀 정리
        this.elementPool.forEach(element => element.remove());
        this.elementPool.length = 0;
        
        console.log('VirtualScrollManager cleanup completed');
    }
}
```

### 1.2 가상 스크롤링 사용 예시

```javascript
// 가상 스크롤링 사용 예시
function setupVirtualScrollDemo() {
    const container = document.getElementById('virtual-scroll-container');
    
    // 대용량 데이터 생성
    const items = Array.from({ length: 100000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        description: `This is item number ${i}`,
        category: `Category ${i % 10}`,
        timestamp: new Date(Date.now() - Math.random() * 1000000000).toISOString()
    }));
    
    // 렌더링 함수
    const renderItem = (element, item, index) => {
        element.innerHTML = `
            <div class="item-content">
                <div class="item-header">
                    <h3>${item.name}</h3>
                    <span class="item-category">${item.category}</span>
                </div>
                <p class="item-description">${item.description}</p>
                <div class="item-footer">
                    <span class="item-id">ID: ${item.id}</span>
                    <span class="item-time">${new Date(item.timestamp).toLocaleDateString()}</span>
                </div>
            </div>
        `;
        
        element.dataset.index = index;
        element.classList.add('virtual-item');
    };
    
    // 가상 스크롤 매니저 생성
    const virtualScroll = new VirtualScrollManager(container, 80, renderItem, {
        overscan: 10,
        throttleMs: 8, // 고성능 스크롤링
        recycleElements: true
    });
    
    // 데이터 설정
    virtualScroll.setItems(items);
    
    // 메모리 사용량 모니터링
    setInterval(() => {
        const usage = virtualScroll.getMemoryUsage();
        console.log('Virtual scroll memory usage:', usage);
        
        if (usage.visibleItemCount > 100) {
            console.warn('Too many visible items, consider increasing throttling');
        }
    }, 5000);
    
    // 검색 기능
    const searchInput = document.getElementById('search-input');
    searchInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        
        if (!query) {
            virtualScroll.setItems(items);
            return;
        }
        
        const filteredItems = items.filter(item => 
            item.name.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query)
        );
        
        virtualScroll.setItems(filteredItems);
    });
    
    return virtualScroll;
}
```

## 2. Progressive Loading으로 초기 로딩 최적화

### 2.1 ProgressiveLoader 구현

```javascript
// 점진적 로딩으로 초기 메모리 사용량 최적화
class ProgressiveLoader {
    constructor(options = {}) {
        this.batchSize = options.batchSize || 50;
        this.loadingDelay = options.loadingDelay || 16; // ~60fps
        this.maxConcurrentBatches = options.maxConcurrentBatches || 3;
        this.priorityFunction = options.priorityFunction || null;
        
        this.items = [];
        this.loadedCount = 0;
        this.isLoading = false;
        this.abortController = new AbortController();
        
        // 로딩 상태 관리
        this.loadingQueue = [];
        this.activeBatches = new Set();
        this.loadingCallbacks = new Set();
        this.errorHandlers = new Set();
        
        // 성능 메트릭
        this.metrics = {
            totalLoadTime: 0,
            batchCount: 0,
            errorCount: 0,
            averageBatchTime: 0,
            itemsPerSecond: 0
        };
    }
    
    async loadItems(itemsToLoad, renderCallback, options = {}) {
        if (this.isLoading) {
            console.log('Already loading, aborting previous load...');
            this.abortController.abort();
            this.abortController = new AbortController();
        }
        
        this.items = itemsToLoad;
        this.loadedCount = 0;
        this.isLoading = true;
        this.metrics.totalLoadTime = performance.now();
        this.metrics.batchCount = 0;
        this.metrics.errorCount = 0;
        
        // 옵션 병합
        const config = {
            showProgress: true,
            enableInterruption: true,
            adaptiveBatching: true,
            ...options
        };
        
        console.log(`Starting progressive loading of ${itemsToLoad.length} items...`);
        
        try {
            // 우선순위가 있는 경우 정렬
            if (this.priorityFunction) {
                this.items.sort(this.priorityFunction);
            }
            
            // 배치 로딩 시작
            await this.processBatches(renderCallback, config);
            
            // 로딩 완료
            this.isLoading = false;
            this.metrics.totalLoadTime = performance.now() - this.metrics.totalLoadTime;
            this.metrics.averageBatchTime = this.metrics.totalLoadTime / this.metrics.batchCount;
            this.metrics.itemsPerSecond = (this.loadedCount / this.metrics.totalLoadTime) * 1000;
            
            console.log(`Progressive loading completed:`, this.metrics);
            this.notifyLoadingCallbacks('complete', this.metrics);
            
        } catch (error) {
            this.isLoading = false;
            console.error('Progressive loading failed:', error);
            this.notifyErrorHandlers(error);
        }
    }
    
    async processBatches(renderCallback, config) {
        while (this.loadedCount < this.items.length && !this.abortController.signal.aborted) {
            // 동시 배치 수 제한
            if (this.activeBatches.size >= this.maxConcurrentBatches) {
                await this.waitForBatchCompletion();
            }
            
            const batchStartIndex = this.loadedCount;
            const batchEndIndex = Math.min(
                this.loadedCount + this.getCurrentBatchSize(config),
                this.items.length
            );
            
            const batch = this.items.slice(batchStartIndex, batchEndIndex);
            
            // 배치 처리
            const batchPromise = this.processBatch(batch, batchStartIndex, renderCallback, config);
            this.activeBatches.add(batchPromise);
            
            // 배치 완료 처리
            batchPromise.finally(() => {
                this.activeBatches.delete(batchPromise);
            });
            
            this.loadedCount = batchEndIndex;
            this.metrics.batchCount++;
            
            // 진행률 업데이트
            if (config.showProgress) {
                this.updateProgress();
            }
            
            // 다음 배치로 넘어가기 전 잠깐 대기 (메인 스레드 양보)
            if (config.enableInterruption) {
                await this.yieldToMainThread();
            }
        }
        
        // 모든 활성 배치 완료 대기
        await Promise.allSettled(Array.from(this.activeBatches));
    }
    
    async processBatch(batch, startIndex, renderCallback, config) {
        const batchStartTime = performance.now();
        
        try {
            for (let i = 0; i < batch.length; i++) {
                if (this.abortController.signal.aborted) break;
                
                const item = batch[i];
                const globalIndex = startIndex + i;
                
                try {
                    await renderCallback(item, globalIndex);
                } catch (error) {
                    this.metrics.errorCount++;
                    console.error(`Error rendering item ${globalIndex}:`, error);
                    
                    // 에러 처리 전략
                    if (config.stopOnError) {
                        throw error;
                    }
                }
                
                // 주기적으로 메인 스레드에 양보
                if ((i + 1) % 10 === 0 && config.enableInterruption) {
                    await new Promise(resolve => 
                        requestAnimationFrame(resolve)
                    );
                }
            }
        } finally {
            const batchTime = performance.now() - batchStartTime;
            console.log(`Batch processed in ${batchTime.toFixed(2)}ms (${batch.length} items)`);
        }
    }
    
    getCurrentBatchSize(config) {
        if (!config.adaptiveBatching) {
            return this.batchSize;
        }
        
        // 적응형 배치 크기 조절
        const avgBatchTime = this.metrics.averageBatchTime || 50;
        
        if (avgBatchTime > 100) { // 100ms 초과 시 배치 크기 축소
            return Math.max(10, Math.floor(this.batchSize * 0.7));
        } else if (avgBatchTime < 30) { // 30ms 미만 시 배치 크기 확대
            return Math.min(200, Math.floor(this.batchSize * 1.3));
        }
        
        return this.batchSize;
    }
    
    async waitForBatchCompletion() {
        // 가장 오래된 배치 하나가 완료될 때까지 대기
        if (this.activeBatches.size > 0) {
            await Promise.race(Array.from(this.activeBatches));
        }
    }
    
    async yieldToMainThread() {
        // 메인 스레드에 양보하여 UI 응답성 유지
        return new Promise(resolve => {
            if (this.loadingDelay > 0) {
                setTimeout(resolve, this.loadingDelay);
            } else {
                requestAnimationFrame(resolve);
            }
        });
    }
    
    updateProgress() {
        const progress = {
            loaded: this.loadedCount,
            total: this.items.length,
            percentage: (this.loadedCount / this.items.length) * 100,
            batchesProcessed: this.metrics.batchCount,
            errors: this.metrics.errorCount
        };
        
        console.log(`Progress: ${progress.percentage.toFixed(1)}% (${progress.loaded}/${progress.total})`);
        this.notifyLoadingCallbacks('progress', progress);
    }
    
    // 이벤트 리스너 관리
    onLoading(callback) {
        this.loadingCallbacks.add(callback);
        return () => this.loadingCallbacks.delete(callback);
    }
    
    onError(callback) {
        this.errorHandlers.add(callback);
        return () => this.errorHandlers.delete(callback);
    }
    
    notifyLoadingCallbacks(type, data) {
        this.loadingCallbacks.forEach(callback => {
            try {
                callback(type, data);
            } catch (error) {
                console.error('Loading callback error:', error);
            }
        });
    }
    
    notifyErrorHandlers(error) {
        this.errorHandlers.forEach(handler => {
            try {
                handler(error);
            } catch (handlerError) {
                console.error('Error handler failed:', handlerError);
            }
        });
    }
    
    // 로딩 제어 메서드
    abort() {
        console.log('Aborting progressive loading...');
        this.abortController.abort();
        this.isLoading = false;
        this.notifyLoadingCallbacks('aborted', { loadedCount: this.loadedCount });
    }
    
    pause() {
        // 로딩 일시 중지 (구현 시 플래그로 제어)
        console.log('Pausing progressive loading...');
    }
    
    resume() {
        // 로딩 재개
        console.log('Resuming progressive loading...');
    }
    
    // 상태 조회
    getProgress() {
        return {
            loaded: this.loadedCount,
            total: this.items.length,
            percentage: this.items.length > 0 ? 
                (this.loadedCount / this.items.length) * 100 : 0,
            isLoading: this.isLoading,
            activeBatches: this.activeBatches.size,
            metrics: { ...this.metrics }
        };
    }
    
    getMemoryEstimate() {
        // 대략적인 메모리 사용량 추정
        const avgItemSize = 1024; // 1KB per item (추정)
        return {
            loadedItems: this.loadedCount * avgItemSize,
            totalEstimated: this.items.length * avgItemSize,
            savedMemory: (this.items.length - this.loadedCount) * avgItemSize
        };
    }
}
```

### 2.2 Progressive Loading 사용 예시

```javascript
// Progressive Loading 사용 예시
function setupProgressiveLoadingDemo() {
    const container = document.getElementById('progressive-container');
    const progressBar = document.getElementById('progress-bar');
    
    // 대용량 이미지 갤러리 데이터
    const images = Array.from({ length: 5000 }, (_, i) => ({
        id: i,
        url: `https://picsum.photos/200/200?random=${i}`,
        title: `Image ${i}`,
        description: `Beautiful image number ${i}`,
        priority: Math.random(), // 랜덤 우선순위
        category: `Category ${i % 20}`
    }));
    
    // 우선순위 함수 (높은 우선순위부터)
    const priorityFunction = (a, b) => b.priority - a.priority;
    
    // Progressive Loader 생성
    const loader = new ProgressiveLoader({
        batchSize: 25,
        loadingDelay: 32, // 약 30fps로 제한
        maxConcurrentBatches: 2,
        priorityFunction
    });
    
    // 로딩 이벤트 리스너
    const unsubscribeLoading = loader.onLoading((type, data) => {
        switch (type) {
            case 'progress':
                if (progressBar) {
                    progressBar.style.width = `${data.percentage}%`;
                    progressBar.textContent = `${data.loaded}/${data.total} (${data.percentage.toFixed(1)}%)`;
                }
                
                // 메모리 사용량 체크
                if (performance.memory) {
                    const memoryUsage = performance.memory.usedJSHeapSize / 1048576;
                    if (memoryUsage > 200) { // 200MB 초과 시
                        console.warn(`High memory usage during loading: ${memoryUsage.toFixed(1)}MB`);
                    }
                }
                break;
                
            case 'complete':
                console.log('Loading completed:', data);
                if (progressBar) {
                    progressBar.style.width = '100%';
                    progressBar.textContent = 'Complete!';
                    setTimeout(() => {
                        progressBar.style.display = 'none';
                    }, 2000);
                }
                break;
                
            case 'aborted':
                console.log('Loading aborted:', data);
                break;
        }
    });
    
    // 에러 핸들러
    const unsubscribeError = loader.onError((error) => {
        console.error('Progressive loading error:', error);
    });
    
    // 렌더링 함수
    const renderImage = async (image, index) => {
        return new Promise((resolve, reject) => {
            const imageElement = document.createElement('div');
            imageElement.className = 'image-item';
            imageElement.innerHTML = `
                <div class="image-placeholder">
                    <div class="loading-spinner"></div>
                </div>
                <div class="image-info">
                    <h3>${image.title}</h3>
                    <p>${image.description}</p>
                    <span class="image-category">${image.category}</span>
                </div>
            `;
            
            // 이미지 지연 로딩
            const img = new Image();
            img.onload = () => {
                const placeholder = imageElement.querySelector('.image-placeholder');
                placeholder.innerHTML = '';
                placeholder.appendChild(img);
                img.className = 'loaded-image';
                resolve();
            };
            
            img.onerror = () => {
                const placeholder = imageElement.querySelector('.image-placeholder');
                placeholder.innerHTML = '<div class="error-image">Failed to load</div>';
                reject(new Error(`Failed to load image ${index}`));
            };
            
            img.src = image.url;
            container.appendChild(imageElement);
            
            // DOM 삽입 후 즉시 resolve (이미지 로딩과 병렬 처리)
            requestAnimationFrame(resolve);
        });
    };
    
    // 로딩 시작
    loader.loadItems(images, renderImage, {
        showProgress: true,
        enableInterruption: true,
        adaptiveBatching: true,
        stopOnError: false
    });
    
    // 제어 버튼
    const setupControls = () => {
        const abortButton = document.getElementById('abort-loading');
        abortButton?.addEventListener('click', () => {
            loader.abort();
        });
        
        // 메모리 사용량 모니터링
        const memoryDisplay = document.getElementById('memory-usage');
        const memoryTimer = setInterval(() => {
            const progress = loader.getProgress();
            const memoryEstimate = loader.getMemoryEstimate();
            
            if (memoryDisplay) {
                memoryDisplay.innerHTML = `
                    <div>Loaded: ${progress.loaded}/${progress.total}</div>
                    <div>Active Batches: ${progress.activeBatches}</div>
                    <div>Estimated Memory: ${(memoryEstimate.loadedItems / 1048576).toFixed(1)}MB</div>
                    <div>Memory Saved: ${(memoryEstimate.savedMemory / 1048576).toFixed(1)}MB</div>
                `;
            }
            
            if (!progress.isLoading) {
                clearInterval(memoryTimer);
            }
        }, 1000);
    };
    
    setupControls();
    
    // 정리 함수 반환
    return () => {
        loader.abort();
        unsubscribeLoading();
        unsubscribeError();
    };
}
```

## 핵심 요점

### 1. 가상 스크롤링의 핵심

DOM 노드 수를 일정하게 유지하면서 대용량 데이터를 효율적으로 표시

### 2. Progressive Loading의 장점

초기 로딩 부담을 분산시켜 더 나은 사용자 경험과 메모리 효율성 제공

### 3. 적응형 성능 최적화

실시간 성능 메트릭을 기반으로 배치 크기와 로딩 전략을 동적 조정

### 4. 메모리 효율성

사용자가 실제로 보는 부분만 메모리에 유지하여 전체 메모리 사용량 최적화

---

**이전**: [라우트별 메모리 관리 전략](03d3b-route-memory-management.md)  
**다음**: [프로덕션 환경 메모리 모니터링](03d3d-production-monitoring.md)에서 실시간 메모리 대시보드와 알림 시스템을 학습합니다.
