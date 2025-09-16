---
tags:
  - advanced
  - async_library
  - concurrency_control
  - deep-study
  - hands-on
  - memory_management
  - performance_monitoring
  - promise_optimization
  - 애플리케이션개발
difficulty: ADVANCED
learning_time: "6-10시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 06B. JavaScript Promise 최적화 라이브러리

## 실전 JavaScript Promise 최적화의 핵심

이론적인 분석 도구도 중요하지만, 실제 프로덕션 환경에서는 바로 사용할 수 있는 JavaScript 최적화 라이브러리가 필요합니다. 복잡한 비동기 로직을 안전하고 효율적으로 관리하면서, 동시에 성능 모니터링까지 제공하는 종합적인 솔루션입니다.

특히 Node.js 백엔드나 대규모 프론트엔드 애플리케이션에서는 수백, 수천 개의 Promise가 동시에 실행될 수 있습니다. 이런 상황에서는 단순히 Promise.all을 사용하는 것만으로는 부족하고, 체계적인 동시성 제어와 메모리 관리가 필요합니다.

## 고성능 Promise 최적화 라이브러리

다양한 최적화 기법을 통합한 종합적인 Promise 관리 라이브러리입니다.

```javascript
// promise_optimizer.js

class PromiseOptimizer {
    constructor(options = {}) {
        // 설정 초기화 - 실무에서 검증된 기본값들
        this.config = {
            maxConcurrency: options.maxConcurrency || 10,        // 동시 실행 제한
            batchSize: options.batchSize || 50,                  // 배치 크기
            retryAttempts: options.retryAttempts || 3,           // 재시도 횟수
            retryDelay: options.retryDelay || 1000,              // 재시도 지연(ms)
            timeout: options.timeout || 30000,                  // 타임아웃(ms)
            enableMetrics: options.enableMetrics !== false,     // 메트릭 수집
            memoryThreshold: options.memoryThreshold || 100 * 1024 * 1024, // 100MB
            ...options
        };

        // 성능 메트릭 추적을 위한 구조체
        this.metrics = {
            totalPromises: 0,           // 총 Promise 수
            succeededPromises: 0,       // 성공한 Promise 수
            failedPromises: 0,          // 실패한 Promise 수
            retries: 0,                 // 재시도 횟수
            totalExecutionTime: 0,      // 총 실행 시간
            maxExecutionTime: 0,        // 최대 실행 시간
            minExecutionTime: Infinity, // 최소 실행 시간
            memoryUsage: [],            // 메모리 사용량 히스토리
            concurrencyLevels: [],      // 동시성 레벨 히스토리
            errorTypes: new Map()       // 에러 타입별 통계
        };

        // 활성 Promise 추적
        this.activePromises = new Set();
        
        // 세마포어를 통한 동시성 제어
        this.semaphore = new PromiseOptimizer.Semaphore(this.config.maxConcurrency);

        // 메트릭 수집 시작
        if (this.config.enableMetrics) {
            this.startMetricsCollection();
        }
    }

    // 세마포어 구현 - 동시성 제어의 핵심
    static Semaphore = class {
        constructor(maxConcurrency) {
            this.maxConcurrency = maxConcurrency;
            this.currentConcurrency = 0;
            this.queue = [];  // 대기 중인 Promise들의 resolve 함수 저장
        }

        async acquire() {
            return new Promise(resolve => {
                // 동시성 한도 이내면 즉시 실행
                if (this.currentConcurrency < this.maxConcurrency) {
                    this.currentConcurrency++;
                    resolve();
                } else {
                    // 한도 초과 시 대기열에 추가
                    this.queue.push(resolve);
                }
            });
        }

        release() {
            this.currentConcurrency--;
            
            // 대기 중인 Promise가 있으면 다음 것 실행
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                this.currentConcurrency++;
                next();
            }
        }
    };

    // 동시성 제어된 Promise 실행 - 핵심 최적화 메서드
    async withConcurrencyControl(promiseFactory) {
        await this.semaphore.acquire();

        const startTime = Date.now();
        const promiseId = this.generatePromiseId();

        try {
            this.metrics.totalPromises++;
            this.activePromises.add(promiseId);

            // 타임아웃과 경쟁 조건으로 실행
            const result = await Promise.race([
                promiseFactory(),
                this.createTimeoutPromise(this.config.timeout)
            ]);

            const executionTime = Date.now() - startTime;
            this.updateExecutionTimeMetrics(executionTime);
            this.metrics.succeededPromises++;

            return result;
        } catch (error) {
            this.metrics.failedPromises++;
            this.updateErrorMetrics(error);
            throw error;
        } finally {
            this.activePromises.delete(promiseId);
            this.semaphore.release();
        }
    }

    // 대용량 작업을 위한 배치 처리 시스템
    async processBatch(tasks, options = {}) {
        const batchSize = options.batchSize || this.config.batchSize;
        const results = [];
        const errors = [];

        console.log(`배치 처리 시작: ${tasks.length}개 작업, 배치 크기: ${batchSize}`);

        // 전체 작업을 배치 단위로 분할하여 순차 처리
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            console.log(`배치 ${Math.floor(i / batchSize) + 1} 처리 중... (${batch.length}개 작업)`);

            try {
                const batchResults = await this.executeBatch(batch, options);
                results.push(...batchResults.successes);
                errors.push(...batchResults.errors);
            } catch (error) {
                console.error(`배치 ${Math.floor(i / batchSize) + 1} 실패:`, error);
                errors.push({ batchIndex: Math.floor(i / batchSize) + 1, error });
            }

            // 메모리 압박 상황 감지 및 대응
            if (this.isMemoryPressureHigh()) {
                console.warn('메모리 사용량 높음, GC 트리거 시도');
                global.gc && global.gc();
                await this.sleep(100); // GC 시간 제공
            }
        }

        return { results, errors };
    }

    // 개별 배치 내 병렬 실행
    async executeBatch(batch, options = {}) {
        const promises = batch.map(async (task, index) => {
            try {
                const result = await this.withConcurrencyControl(() =>
                    typeof task === 'function' ? task() : task
                );
                return { success: true, result, index };
            } catch (error) {
                return { success: false, error, index };
            }
        });

        // Promise.allSettled로 일부 실패해도 전체 배치 계속 진행
        const results = await Promise.allSettled(promises);

        const successes = [];
        const errors = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                if (result.value.success) {
                    successes.push(result.value.result);
                } else {
                    errors.push({
                        index,
                        error: result.value.error,
                        task: batch[index]
                    });
                }
            } else {
                errors.push({
                    index,
                    error: result.reason,
                    task: batch[index]
                });
            }
        });

        return { successes, errors };
    }

    // 지능형 재시도 시스템 - 지수 백오프 적용
    async withRetry(promiseFactory, options = {}) {
        const maxAttempts = options.retryAttempts || this.config.retryAttempts;
        const retryDelay = options.retryDelay || this.config.retryDelay;

        let lastError;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await this.withConcurrencyControl(promiseFactory);
            } catch (error) {
                lastError = error;
                this.metrics.retries++;

                // 최대 시도 횟수에 도달하면 실패
                if (attempt === maxAttempts) {
                    throw error;
                }

                // 지수 백오프: 재시도할 때마다 지연 시간이 2배씩 증가
                const delay = retryDelay * Math.pow(2, attempt - 1);
                console.log(`재시도 ${attempt}/${maxAttempts} (${delay}ms 후)...`);
                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    // 대용량 데이터 스트림 처리 시스템
    async processStream(dataSource, processor, options = {}) {
        const chunkSize = options.chunkSize || 1000;
        const highWaterMark = options.highWaterMark || 16; // 백프레셔 제어

        return new Promise((resolve, reject) => {
            const results = [];
            const errors = [];
            let processed = 0;
            let isProcessing = false;
            let ended = false;

            const processingQueue = [];

            // 청크 처리 로직
            const processChunk = async () => {
                if (isProcessing || processingQueue.length === 0) return;

                isProcessing = true;

                // 동시성 한도 내에서 청크 처리
                while (processingQueue.length > 0 &&
                       this.activePromises.size < this.config.maxConcurrency) {

                    const chunk = processingQueue.shift();

                    try {
                        const result = await this.withConcurrencyControl(() =>
                            processor(chunk)
                        );
                        results.push(result);
                        processed++;
                    } catch (error) {
                        errors.push({ chunk, error });
                    }
                }

                isProcessing = false;

                // 모든 청크 처리 완료 확인
                if (ended && processingQueue.length === 0 && this.activePromises.size === 0) {
                    resolve({ results, errors, processed });
                }
            };

            // 데이터 소스에서 청크 읽기
            const readChunks = async () => {
                try {
                    for await (const chunk of dataSource) {
                        processingQueue.push(chunk);

                        // 백프레셔 제어: 큐가 너무 크면 잠시 대기
                        if (processingQueue.length >= highWaterMark) {
                            await this.sleep(10);
                        }

                        processChunk();
                    }
                    ended = true;
                    processChunk();
                } catch (error) {
                    reject(error);
                }
            };

            readChunks();
        });
    }

    // Promise 래핑 및 최적화
    optimizePromise(promise, options = {}) {
        const startTime = Date.now();
        const promiseId = this.generatePromiseId();

        return promise
            .then(result => {
                const executionTime = Date.now() - startTime;
                this.updateExecutionTimeMetrics(executionTime);
                this.metrics.succeededPromises++;
                return result;
            })
            .catch(error => {
                this.metrics.failedPromises++;
                this.updateErrorMetrics(error);

                // 폴백 함수 지원
                if (options.fallback) {
                    return options.fallback(error);
                }

                throw error;
            });
    }

    // 실시간 메모리 및 성능 모니터링
    startMetricsCollection() {
        setInterval(() => {
            const memUsage = process.memoryUsage();
            
            // 메모리 사용량 기록
            this.metrics.memoryUsage.push({
                timestamp: Date.now(),
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                rss: memUsage.rss
            });

            // 동시성 레벨 기록
            this.metrics.concurrencyLevels.push({
                timestamp: Date.now(),
                active: this.activePromises.size,
                max: this.config.maxConcurrency
            });

            // 메트릭 데이터 크기 제한 (메모리 누수 방지)
            if (this.metrics.memoryUsage.length > 1000) {
                this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-500);
            }

            if (this.metrics.concurrencyLevels.length > 1000) {
                this.metrics.concurrencyLevels = this.metrics.concurrencyLevels.slice(-500);
            }
        }, 1000);
    }

    // 메모리 압박 상황 감지
    isMemoryPressureHigh() {
        const memUsage = process.memoryUsage();
        return memUsage.heapUsed > this.config.memoryThreshold;
    }

    // 유틸리티 메서드들
    generatePromiseId() {
        return `promise_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    createTimeoutPromise(timeout) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`타임아웃: ${timeout}ms`)), timeout);
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    updateExecutionTimeMetrics(executionTime) {
        this.metrics.totalExecutionTime += executionTime;
        this.metrics.maxExecutionTime = Math.max(this.metrics.maxExecutionTime, executionTime);
        this.metrics.minExecutionTime = Math.min(this.metrics.minExecutionTime, executionTime);
    }

    updateErrorMetrics(error) {
        const errorType = error.constructor.name;
        const count = this.metrics.errorTypes.get(errorType) || 0;
        this.metrics.errorTypes.set(errorType, count + 1);
    }

    // 포괄적인 성능 리포트 생성
    getPerformanceReport() {
        const avgExecutionTime = this.metrics.totalPromises > 0 ?
            this.metrics.totalExecutionTime / this.metrics.totalPromises : 0;

        const successRate = this.metrics.totalPromises > 0 ?
            (this.metrics.succeededPromises / this.metrics.totalPromises) * 100 : 0;

        const recentMemoryUsage = this.metrics.memoryUsage.slice(-10);
        const avgMemoryUsage = recentMemoryUsage.length > 0 ?
            recentMemoryUsage.reduce((sum, m) => sum + m.heapUsed, 0) / recentMemoryUsage.length : 0;

        return {
            summary: {
                totalPromises: this.metrics.totalPromises,
                succeededPromises: this.metrics.succeededPromises,
                failedPromises: this.metrics.failedPromises,
                successRate: successRate.toFixed(1) + '%',
                retries: this.metrics.retries
            },

            performance: {
                avgExecutionTime: avgExecutionTime.toFixed(2) + 'ms',
                maxExecutionTime: this.metrics.maxExecutionTime + 'ms',
                minExecutionTime: this.metrics.minExecutionTime === Infinity ?
                    '0ms' : this.metrics.minExecutionTime + 'ms'
            },

            memory: {
                averageHeapUsed: this.formatBytes(avgMemoryUsage),
                currentHeapUsed: this.formatBytes(process.memoryUsage().heapUsed),
                memoryThreshold: this.formatBytes(this.config.memoryThreshold)
            },

            concurrency: {
                maxConcurrency: this.config.maxConcurrency,
                currentActive: this.activePromises.size,
                avgConcurrencyLevel: this.calculateAverageConcurrency()
            },

            errors: Array.from(this.metrics.errorTypes.entries()).map(([type, count]) => ({
                type,
                count,
                percentage: ((count / this.metrics.failedPromises) * 100).toFixed(1) + '%'
            })),

            recommendations: this.generateRecommendations()
        };
    }

    calculateAverageConcurrency() {
        if (this.metrics.concurrencyLevels.length === 0) return 0;

        const sum = this.metrics.concurrencyLevels.reduce((total, level) => total + level.active, 0);
        return (sum / this.metrics.concurrencyLevels.length).toFixed(2);
    }

    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return size.toFixed(2) + ' ' + units[unitIndex];
    }

    // AI 기반 성능 개선 권장사항 생성
    generateRecommendations() {
        const recommendations = [];
        const avgExecutionTime = this.metrics.totalPromises > 0 ?
            this.metrics.totalExecutionTime / this.metrics.totalPromises : 0;

        // 실행 시간 기반 권장사항
        if (avgExecutionTime > 5000) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: '평균 실행 시간이 높습니다. 작업을 더 작은 단위로 분할하거나 타임아웃을 줄이세요.'
            });
        }

        // 실패율 기반 권장사항
        if (this.metrics.failedPromises / this.metrics.totalPromises > 0.1) {
            recommendations.push({
                type: 'reliability',
                priority: 'high',
                message: '실패율이 높습니다. 에러 처리와 재시도 로직을 개선하세요.'
            });
        }

        // 동시성 활용도 기반 권장사항
        const avgConcurrency = this.calculateAverageConcurrency();
        if (avgConcurrency < this.config.maxConcurrency * 0.5) {
            recommendations.push({
                type: 'concurrency',
                priority: 'medium',
                message: '동시성이 충분히 활용되지 않고 있습니다. 작업 분할이나 동시성 수준을 검토하세요.'
            });
        }

        // 메모리 사용량 기반 권장사항
        if (this.isMemoryPressureHigh()) {
            recommendations.push({
                type: 'memory',
                priority: 'high',
                message: '메모리 사용량이 높습니다. 배치 크기를 줄이거나 스트림 처리를 고려하세요.'
            });
        }

        return recommendations;
    }

    // 리소스 정리
    cleanup() {
        this.activePromises.clear();
        this.metrics.memoryUsage = [];
        this.metrics.concurrencyLevels = [];
        this.metrics.errorTypes.clear();
    }
}

// 실무 사용 예제
async function demonstrateOptimizer() {
    const optimizer = new PromiseOptimizer({
        maxConcurrency: 5,
        batchSize: 20,
        retryAttempts: 3,
        enableMetrics: true
    });

    console.log('Promise 최적화 라이브러리 데모 시작\n');

    // 1. 동시성 제어된 실행
    console.log('1. 동시성 제어된 API 호출');
    const apiTask = () => new Promise(resolve => {
        setTimeout(() => resolve('API 응답'), 100 + Math.random() * 400);
    });
    
    const result1 = await optimizer.withConcurrencyControl(apiTask);
    console.log('결과:', result1);

    // 2. 재시도 로직 적용
    console.log('\n2. 재시도 로직이 적용된 불안정한 작업');
    const unstableTask = () => new Promise((resolve, reject) => {
        if (Math.random() < 0.7) {
            reject(new Error('임시 실패'));
        } else {
            resolve('재시도 후 성공');
        }
    });
    
    try {
        const result2 = await optimizer.withRetry(unstableTask);
        console.log('결과:', result2);
    } catch (error) {
        console.log('최종 실패:', error.message);
    }

    // 3. 대용량 배치 처리
    console.log('\n3. 배치 처리 시스템');
    const batchTasks = Array.from({ length: 50 }, (_, i) =>
        () => new Promise(resolve => {
            setTimeout(() => resolve(`작업 ${i} 완료`), 50 + Math.random() * 100);
        })
    );
    
    const batchResult = await optimizer.processBatch(batchTasks);
    console.log(`배치 처리 완료: 성공 ${batchResult.results.length}개, 실패 ${batchResult.errors.length}개`);

    // 4. 성능 리포트 생성
    console.log('\n4. 성능 분석 리포트');
    const report = optimizer.getPerformanceReport();
    console.log('성능 리포트:', JSON.stringify(report, null, 2));

    // 정리
    optimizer.cleanup();
    
    console.log('\n데모 완료!');
}

module.exports = PromiseOptimizer;
```

## 고급 최적화 패턴

### 1. 동적 동시성 조절

시스템 부하에 따라 동시성 수준을 자동으로 조정하는 기능:

```javascript
class AdaptiveConcurrencyController {
    constructor(initialConcurrency = 10) {
        this.maxConcurrency = initialConcurrency;
        this.successRate = 0;
        this.avgResponseTime = 0;
        this.adjustmentInterval = 30000; // 30초마다 조정
        
        setInterval(() => this.adjustConcurrency(), this.adjustmentInterval);
    }
    
    adjustConcurrency() {
        // 성공률이 높고 응답 시간이 빠르면 동시성 증가
        if (this.successRate > 0.95 && this.avgResponseTime < 1000) {
            this.maxConcurrency = Math.min(this.maxConcurrency + 2, 50);
        }
        // 성공률이 낮거나 응답 시간이 느리면 동시성 감소
        else if (this.successRate < 0.8 || this.avgResponseTime > 5000) {
            this.maxConcurrency = Math.max(this.maxConcurrency - 2, 2);
        }
        
        console.log(`동시성 수준 조정: ${this.maxConcurrency}`);
    }
}
```

### 2. 지능형 에러 분류 및 대응

에러 타입에 따른 차별화된 재시도 전략:

```javascript
class IntelligentRetryStrategy {
    static getRetryConfig(error) {
        // 네트워크 타임아웃 - 적극적 재시도
        if (error.code === 'ETIMEDOUT') {
            return { attempts: 5, delay: 1000, backoff: 1.5 };
        }
        
        // Rate Limit - 긴 지연 후 재시도
        if (error.status === 429) {
            return { attempts: 3, delay: 60000, backoff: 2.0 };
        }
        
        // 서버 에러 - 표준 재시도
        if (error.status >= 500) {
            return { attempts: 3, delay: 2000, backoff: 2.0 };
        }
        
        // 클라이언트 에러 - 재시도 안함
        if (error.status >= 400 && error.status < 500) {
            return { attempts: 0, delay: 0, backoff: 1.0 };
        }
        
        // 기본 설정
        return { attempts: 2, delay: 1000, backoff: 1.5 };
    }
}
```

### 3. 메모리 효율적인 스트림 처리

대용량 데이터를 메모리 효율적으로 처리하는 스트림 시스템:

```javascript
class MemoryEfficientProcessor {
    async processLargeDataset(dataStream, processor, options = {}) {
        const maxMemoryUsage = options.maxMemoryUsage || 50 * 1024 * 1024; // 50MB
        const checkInterval = options.checkInterval || 1000; // 1초
        
        let processedCount = 0;
        let lastGcTime = Date.now();
        
        const processingPromises = new Set();
        
        for await (const chunk of dataStream) {
            // 메모리 사용량 모니터링
            if (Date.now() - lastGcTime > checkInterval) {
                const memUsage = process.memoryUsage();
                
                if (memUsage.heapUsed > maxMemoryUsage) {
                    // 진행 중인 작업 완료 대기
                    await Promise.all(processingPromises);
                    
                    // 강제 GC 실행 (--expose-gc 플래그 필요)
                    if (global.gc) {
                        global.gc();
                        console.log('메모리 정리 실행');
                    }
                    
                    lastGcTime = Date.now();
                }
            }
            
            // 청크 처리
            const promise = processor(chunk)
                .then(result => {
                    processedCount++;
                    processingPromises.delete(promise);
                    return result;
                })
                .catch(error => {
                    processingPromises.delete(promise);
                    throw error;
                });
                
            processingPromises.add(promise);
            
            // 동시 처리 제한
            if (processingPromises.size >= options.maxConcurrency) {
                await Promise.race(processingPromises);
            }
        }
        
        // 남은 작업 완료
        await Promise.all(processingPromises);
        
        return { processedCount };
    }
}
```

## 실전 적용 사례

### 웹 스크래핑 최적화

```javascript
async function optimizedWebScraping() {
    const optimizer = new PromiseOptimizer({
        maxConcurrency: 8, // 서버 부담 고려
        batchSize: 20,
        retryAttempts: 3,
        timeout: 15000
    });
    
    const urls = generateUrlList(1000); // 1000개 URL
    
    const scrapeTasks = urls.map(url => 
        () => optimizer.withRetry(
            () => scrapeUrl(url),
            { retryDelay: 2000 }
        )
    );
    
    const results = await optimizer.processBatch(scrapeTasks, {
        batchSize: 50 // 한 번에 50개씩 처리
    });
    
    console.log(`스크래핑 완료: ${results.results.length}개 성공`);
    
    return results;
}
```

### API 집계 서비스

```javascript
async function aggregateApiData() {
    const optimizer = new PromiseOptimizer({
        maxConcurrency: 12,
        enableMetrics: true
    });
    
    const dataSources = [
        'https://api1.example.com/data',
        'https://api2.example.com/data',
        'https://api3.example.com/data'
        // ... 더 많은 API들
    ];
    
    const fetchTasks = dataSources.map(url =>
        () => optimizer.withConcurrencyControl(
            () => fetch(url).then(r => r.json())
        )
    );
    
    const results = await Promise.allSettled(
        fetchTasks.map(task => task())
    );
    
    // 성공한 결과만 집계
    const successfulData = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
    
    // 성능 리포트 출력
    const report = optimizer.getPerformanceReport();
    console.log('API 집계 성능:', report.summary);
    
    return aggregateData(successfulData);
}
```

## 핵심 요점

### 1. 실용적인 동시성 제어

세마포어 패턴을 통한 안전하고 효율적인 Promise 동시성 관리

### 2. 지능형 재시도 시스템

지수 백오프와 에러 타입별 차별화된 재시도 전략

### 3. 메모리 인식 배치 처리

메모리 사용량을 모니터링하며 안전한 대용량 데이터 처리

### 4. 포괄적인 성능 분석

실시간 메트릭 수집과 AI 기반 최적화 권장사항 제공

---

**이전**: [Promise 성능 분석 도구](chapter-10-async-programming/10-44-promise-performance-analysis-tools.md)  
**다음**: [Promise 성능 최적화 개요](chapter-10-async-programming/10-30-promise-performance-optimization.md)에서 전체적인 최적화 전략을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 애플리케이션 개발
- **예상 시간**: 6-10시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-08-async-programming)

- [8.1 Promise/Future 패턴 개요](./10-10-promise-future.md)
- [8.1a Promise/Future 기본 개념과 구현](./10-01-promise-future-basics.md)
- [8.1b 비동기 연산 조합과 병렬 처리](./10-11-async-composition.md)
- [8.1c 취소와 타임아웃 처리](./10-12-cancellation-timeout.md)
- [8.1d 실행 모델과 스케줄링](./10-13-execution-scheduling.md)

### 🏷️ 관련 키워드

`promise_optimization`, `concurrency_control`, `performance_monitoring`, `memory_management`, `async_library`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
