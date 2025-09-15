---
tags:
  - Event Loop
  - JavaScript
  - Node.js
  - Performance Analysis
---

# JavaScript 분석 도구

Node.js 환경에서 이벤트 루프를 분석하기 위한 전용 JavaScript 도구를 구현해보겠습니다. 이 도구는 애플리케이션에 직접 통합하여 실시간으로 성능을 모니터링할 수 있습니다.

## EventLoopAnalyzer 클래스

Node.js의 내장 API들을 활용한 종합적인 이벤트 루프 분석 도구입니다.

```javascript
#!/usr/bin/env node
// event_loop_analyzer.js

const fs = require('fs');
const os = require('os');
const util = require('util');
const async_hooks = require('async_hooks');
const perf_hooks = require('perf_hooks');

class EventLoopAnalyzer {
    constructor(options = {}) {
        this.options = {
            lagThreshold: options.lagThreshold || 100, // ms
            sampleInterval: options.sampleInterval || 1000, // ms
            enableAsyncHooks: options.enableAsyncHooks || false,
            enableGCMonitoring: options.enableGCMonitoring || false,
            outputFile: options.outputFile || 'event_loop_analysis.json',
            ...options
        };

        this.samples = [];
        this.asyncResources = new Map();
        this.isRunning = false;
        this.startTime = Date.now();

        // 통계
        this.stats = {
            maxLag: 0,
            totalLag: 0,
            lagSpikes: 0,
            samples: 0,
            blockingEvents: 0,
            gcEvents: 0,
            gcTime: 0
        };

        this.setupAsyncHooks();
        this.setupGCMonitoring();
        this.setupPerformanceObserver();
    }
```

## Async Hooks 통합

비동기 리소스의 생성, 실행, 소멸을 추적하여 성능 병목점을 찾습니다.

```javascript
    // Async Hooks 설정
    setupAsyncHooks() {
        if (!this.options.enableAsyncHooks) return;

        const hook = async_hooks.createHook({
            init: (asyncId, type, triggerAsyncId) => {
                this.asyncResources.set(asyncId, {
                    type,
                    triggerAsyncId,
                    created: Date.now(),
                    stack: this.captureStack()
                });
            },

            before: (asyncId) => {
                const resource = this.asyncResources.get(asyncId);
                if (resource) {
                    resource.beforeTime = Date.now();
                }
            },

            after: (asyncId) => {
                const resource = this.asyncResources.get(asyncId);
                if (resource && resource.beforeTime) {
                    resource.duration = Date.now() - resource.beforeTime;

                    // 긴 실행 시간 감지
                    if (resource.duration > this.options.lagThreshold) {
                        this.logSlowAsync(asyncId, resource);
                    }
                }
            },

            destroy: (asyncId) => {
                this.asyncResources.delete(asyncId);
            }
        });

        hook.enable();
        console.log('Async Hooks 활성화됨');
    }
```

## GC 및 Performance Observer

V8 가비지 컬렉터 이벤트와 성능 메트릭을 실시간으로 모니터링합니다.

```javascript
    // GC 모니터링 설정
    setupGCMonitoring() {
        if (!this.options.enableGCMonitoring) return;

        // V8 GC 이벤트 감지 (Node.js 16+)
        if (perf_hooks.monitorEventLoopDelay) {
            this.eventLoopDelay = perf_hooks.monitorEventLoopDelay();
            this.eventLoopDelay.enable();
        }

        // GC 이벤트 리스너 (실험적)
        if (process.versions.node.split('.')[0] >= 16) {
            process.on('warning', (warning) => {
                if (warning.name === 'MemoryUsageWarning') {
                    this.stats.gcEvents++;
                    console.warn('GC 경고:', warning.message);
                }
            });
        }
    }

    // Performance Observer 설정
    setupPerformanceObserver() {
        const obs = new perf_hooks.PerformanceObserver((list) => {
            const entries = list.getEntries();

            entries.forEach(entry => {
                if (entry.entryType === 'gc') {
                    this.stats.gcEvents++;
                    this.stats.gcTime += entry.duration;

                    if (entry.duration > 50) { // 50ms 이상 GC
                        console.warn(`긴 GC 감지: ${entry.kind} ${entry.duration.toFixed(2)}ms`);
                    }
                }

                if (entry.entryType === 'function' && entry.duration > this.options.lagThreshold) {
                    this.logSlowFunction(entry);
                }
            });
        });

        // GC 및 함수 성능 관찰
        obs.observe({ entryTypes: ['gc', 'function'] });
    }
```

## 메트릭 수집 시스템

### 이벤트 루프 지연시간 측정

```javascript
    // 이벤트 루프 지연시간 측정
    measureEventLoopLag() {
        return new Promise(resolve => {
            const start = process.hrtime.bigint();

            setImmediate(() => {
                const end = process.hrtime.bigint();
                const lag = Number(end - start) / 1000000; // 나노초를 밀리초로 변환
                resolve(lag);
            });
        });
    }
```

### 시스템 리소스 정보

```javascript
    // 시스템 리소스 정보 수집
    getSystemInfo() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        return {
            memory: {
                rss: memUsage.rss / 1024 / 1024, // MB
                heapUsed: memUsage.heapUsed / 1024 / 1024,
                heapTotal: memUsage.heapTotal / 1024 / 1024,
                external: memUsage.external / 1024 / 1024
            },
            cpu: {
                user: cpuUsage.user / 1000, // 마이크로초를 밀리초로
                system: cpuUsage.system / 1000
            },
            loadAverage: os.loadavg(),
            uptime: process.uptime()
        };
    }

    // 활성 핸들 및 요청 수집
    getActiveHandles() {
        const handles = process._getActiveHandles();
        const requests = process._getActiveRequests();

        const handleTypes = {};
        handles.forEach(handle => {
            const type = handle.constructor.name;
            handleTypes[type] = (handleTypes[type] || 0) + 1;
        });

        return {
            handleCount: handles.length,
            requestCount: requests.length,
            handleTypes
        };
    }
```

## 진단 및 디버깅

### 스택 트레이스 캡처

```javascript
    // 스택 트레이스 캡처
    captureStack() {
        const obj = {};
        Error.captureStackTrace(obj, this.captureStack);
        return obj.stack;
    }

    // 느린 비동기 작업 로깅
    logSlowAsync(asyncId, resource) {
        console.warn(`[SLOW ASYNC] ID: ${asyncId}, Type: ${resource.type}, Duration: ${resource.duration}ms`);

        if (this.options.enableAsyncHooks && resource.stack) {
            console.warn('Stack trace:');
            console.warn(resource.stack);
        }

        this.stats.blockingEvents++;
    }

    // 느린 함수 로깅
    logSlowFunction(entry) {
        console.warn(`[SLOW FUNCTION] ${entry.name}: ${entry.duration.toFixed(2)}ms`);
    }
```

### 진단 정보 수집

```javascript
    // 진단 정보 수집
    collectDiagnosticInfo() {
        const v8 = require('v8');

        const diagnostics = {
            timestamp: Date.now(),
            heapStatistics: v8.getHeapStatistics(),
            heapSpaceStatistics: v8.getHeapSpaceStatistics(),
            stack: this.captureStack()
        };

        if (this.options.enableAsyncHooks) {
            // 활성 비동기 리소스 요약
            const resourceSummary = {};
            this.asyncResources.forEach((resource, id) => {
                const type = resource.type;
                resourceSummary[type] = (resourceSummary[type] || 0) + 1;
            });

            diagnostics.asyncResources = resourceSummary;
        }

        console.log('진단 정보 수집:', JSON.stringify(diagnostics, null, 2));
    }
```

## 데이터 샘플링과 모니터링

### 샘플 수집

```javascript
    // 샘플 수집
    async collectSample() {
        const lag = await this.measureEventLoopLag();
        const systemInfo = this.getSystemInfo();
        const activeInfo = this.getActiveHandles();

        const sample = {
            timestamp: Date.now(),
            eventLoopLag: lag,
            system: systemInfo,
            active: activeInfo,
            asyncResourceCount: this.asyncResources.size
        };

        // Event Loop Delay API 사용 (가능한 경우)
        if (this.eventLoopDelay) {
            sample.eventLoopDelay = {
                min: this.eventLoopDelay.min / 1000000, // 나노초를 밀리초로
                max: this.eventLoopDelay.max / 1000000,
                mean: this.eventLoopDelay.mean / 1000000,
                stddev: this.eventLoopDelay.stddev / 1000000
            };
        }

        this.samples.push(sample);

        // 통계 업데이트
        this.stats.samples++;
        this.stats.totalLag += lag;

        if (lag > this.stats.maxLag) {
            this.stats.maxLag = lag;
        }

        if (lag > this.options.lagThreshold) {
            this.stats.lagSpikes++;
            console.warn(`[LAG SPIKE] Event loop lag: ${lag.toFixed(2)}ms`);

            // 스택 트레이스 수집
            this.collectDiagnosticInfo();
        }

        return sample;
    }
```

### 실시간 모니터링 시작

```javascript
    // 실시간 모니터링 시작
    startMonitoring() {
        if (this.isRunning) {
            console.warn('모니터링이 이미 실행 중입니다.');
            return;
        }

        this.isRunning = true;
        console.log(`이벤트 루프 분석 시작 (임계값: ${this.options.lagThreshold}ms)`);

        const monitoringLoop = async () => {
            if (!this.isRunning) return;

            try {
                const sample = await this.collectSample();
                this.displayRealTimeInfo(sample);
            } catch (error) {
                console.error('샘플 수집 오류:', error);
            }

            setTimeout(monitoringLoop, this.options.sampleInterval);
        };

        monitoringLoop();
    }
```

## 실시간 대시보드

```javascript
    // 실시간 정보 표시
    displayRealTimeInfo(sample) {
        // 콘솔 지우기
        console.clear();

        console.log('=====================================');
        console.log('이벤트 루프 실시간 모니터링');
        console.log('=====================================');
        console.log(`실행 시간: ${Math.floor((Date.now() - this.startTime) / 1000)}초`);
        console.log(`샘플 수: ${this.stats.samples}`);
        console.log('-------------------------------------');

        console.log('📊 현재 상태:');
        console.log(`  이벤트 루프 지연: ${sample.eventLoopLag.toFixed(2)}ms`);
        console.log(`  메모리 사용량: ${sample.system.memory.heapUsed.toFixed(1)}MB / ${sample.system.memory.heapTotal.toFixed(1)}MB`);
        console.log(`  활성 핸들: ${sample.active.handleCount}`);
        console.log(`  활성 요청: ${sample.active.requestCount}`);
        console.log(`  비동기 리소스: ${sample.asyncResourceCount}`);

        if (sample.eventLoopDelay) {
            console.log(`  평균 지연: ${sample.eventLoopDelay.mean.toFixed(2)}ms`);
            console.log(`  최대 지연: ${sample.eventLoopDelay.max.toFixed(2)}ms`);
        }

        console.log('\n📈 통계:');
        console.log(`  최대 지연시간: ${this.stats.maxLag.toFixed(2)}ms`);
        console.log(`  평균 지연시간: ${(this.stats.totalLag / this.stats.samples).toFixed(2)}ms`);
        console.log(`  지연 스파이크: ${this.stats.lagSpikes}`);
        console.log(`  블로킹 이벤트: ${this.stats.blockingEvents}`);
        console.log(`  GC 이벤트: ${this.stats.gcEvents}`);
        console.log(`  총 GC 시간: ${this.stats.gcTime.toFixed(2)}ms`);

        // 경고 표시
        if (sample.eventLoopLag > this.options.lagThreshold) {
            console.log('\n⚠️  경고: 이벤트 루프 지연이 임계값을 초과했습니다!');
        }

        if (sample.system.memory.heapUsed > 500) { // 500MB 초과
            console.log('\n⚠️  경고: 높은 메모리 사용량이 감지되었습니다!');
        }

        // 핸들 타입별 분포
        if (Object.keys(sample.active.handleTypes).length > 0) {
            console.log('\n🔧 활성 핸들 타입:');
            Object.entries(sample.active.handleTypes).forEach(([type, count]) => {
                console.log(`  ${type}: ${count}`);
            });
        }

        console.log('\n[Ctrl+C로 종료]');
    }

    // 모니터링 중지
    stopMonitoring() {
        this.isRunning = false;
        console.log('\n모니터링 중지됨');

        if (this.eventLoopDelay) {
            this.eventLoopDelay.disable();
        }
    }
```

## 분석 보고서 생성

### 권장사항 생성

```javascript
    // 권장사항 생성
    generateRecommendations() {
        const recommendations = [];
        const avgLag = this.stats.samples > 0 ? this.stats.totalLag / this.stats.samples : 0;

        if (avgLag > 50) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: '평균 이벤트 루프 지연이 높습니다. CPU 집약적 작업을 Worker Thread로 이동하세요.',
                details: `평균 지연시간: ${avgLag.toFixed(2)}ms`
            });
        }

        if (this.stats.lagSpikes > this.stats.samples * 0.1) {
            recommendations.push({
                type: 'stability',
                priority: 'high',
                message: '빈번한 지연 스파이크가 감지됩니다. 블로킹 코드를 찾아 최적화하세요.',
                details: `지연 스파이크 비율: ${((this.stats.lagSpikes / this.stats.samples) * 100).toFixed(1)}%`
            });
        }

        if (this.stats.gcTime > 1000) {
            recommendations.push({
                type: 'memory',
                priority: 'medium',
                message: 'GC 시간이 많습니다. 메모리 사용 패턴을 최적화하세요.',
                details: `총 GC 시간: ${this.stats.gcTime.toFixed(2)}ms`
            });
        }

        if (this.stats.blockingEvents > 0) {
            recommendations.push({
                type: 'async',
                priority: 'high',
                message: '블로킹 비동기 작업이 감지되었습니다. 비동기 패턴을 검토하세요.',
                details: `블로킹 이벤트 수: ${this.stats.blockingEvents}`
            });
        }

        // 일반적인 권장사항
        recommendations.push({
            type: 'monitoring',
            priority: 'low',
            message: '정기적인 성능 모니터링을 통해 회귀를 방지하세요.',
            details: '프로덕션 환경에서 지속적인 모니터링 설정 권장'
        });

        return recommendations;
    }

    // 분석 결과 생성
    generateReport() {
        const report = {
            metadata: {
                startTime: this.startTime,
                endTime: Date.now(),
                duration: Date.now() - this.startTime,
                sampleCount: this.samples.length,
                sampleInterval: this.options.sampleInterval,
                lagThreshold: this.options.lagThreshold
            },

            statistics: {
                ...this.stats,
                avgLag: this.stats.samples > 0 ? this.stats.totalLag / this.stats.samples : 0,
                lagSpikePercentage: this.stats.samples > 0 ? (this.stats.lagSpikes / this.stats.samples) * 100 : 0
            },

            samples: this.samples,

            recommendations: this.generateRecommendations()
        };

        return report;
    }
```

### 보고서 저장

```javascript
    // 결과 저장
    async saveReport() {
        const report = this.generateReport();

        try {
            await fs.promises.writeFile(
                this.options.outputFile,
                JSON.stringify(report, null, 2),
                'utf8'
            );

            console.log(`\n분석 보고서 저장됨: ${this.options.outputFile}`);

            // 요약 출력
            console.log('\n=== 분석 요약 ===');
            console.log(`모니터링 시간: ${Math.floor(report.metadata.duration / 1000)}초`);
            console.log(`평균 지연시간: ${report.statistics.avgLag.toFixed(2)}ms`);
            console.log(`최대 지연시간: ${report.statistics.maxLag.toFixed(2)}ms`);
            console.log(`지연 스파이크: ${report.statistics.lagSpikes}회`);
            console.log(`권장사항: ${report.recommendations.length}개`);

            if (report.recommendations.length > 0) {
                console.log('\n=== 주요 권장사항 ===');
                report.recommendations
                    .filter(r => r.priority === 'high')
                    .forEach((rec, index) => {
                        console.log(`${index + 1}. ${rec.message}`);
                        console.log(`   세부사항: ${rec.details}`);
                    });
            }

        } catch (error) {
            console.error('보고서 저장 실패:', error);
        }
    }
}
```

## CLI 인터페이스

```javascript
// CLI 실행
if (require.main === module) {
    const options = {};

    // 명령행 인자 처리
    process.argv.slice(2).forEach((arg, index, arr) => {
        if (arg === '--threshold' && arr[index + 1]) {
            options.lagThreshold = parseFloat(arr[index + 1]);
        } else if (arg === '--interval' && arr[index + 1]) {
            options.sampleInterval = parseInt(arr[index + 1]);
        } else if (arg === '--async-hooks') {
            options.enableAsyncHooks = true;
        } else if (arg === '--gc-monitoring') {
            options.enableGCMonitoring = true;
        } else if (arg === '--output' && arr[index + 1]) {
            options.outputFile = arr[index + 1];
        } else if (arg === '--help') {
            console.log('이벤트 루프 분석기');
            console.log('사용법: node event_loop_analyzer.js [옵션]');
            console.log('옵션:');
            console.log('  --threshold VALUE    알림 임계값 (ms, 기본값: 100)');
            console.log('  --interval VALUE     샘플링 간격 (ms, 기본값: 1000)');
            console.log('  --async-hooks        Async Hooks 활성화');
            console.log('  --gc-monitoring      GC 모니터링 활성화');
            console.log('  --output FILE        출력 파일명');
            console.log('  --help               도움말 출력');
            process.exit(0);
        }
    });

    const analyzer = new EventLoopAnalyzer(options);

    // 종료 처리
    process.on('SIGINT', async () => {
        analyzer.stopMonitoring();
        await analyzer.saveReport();
        process.exit(0);
    });

    analyzer.startMonitoring();
}

module.exports = EventLoopAnalyzer;
```

## 실제 사용 예시

### 기본 모니터링

```bash
# 기본 설정으로 모니터링 시작
node event_loop_analyzer.js

# 낮은 임계값으로 민감하게 모니터링
node event_loop_analyzer.js --threshold 50 --interval 500

# 모든 기능을 활성화하여 종합 분석
node event_loop_analyzer.js --async-hooks --gc-monitoring --output detailed_analysis.json
```

### 애플리케이션 통합

```javascript
// app.js - Express 애플리케이션에 통합 예시
const express = require('express');
const EventLoopAnalyzer = require('./event_loop_analyzer');

const app = express();

// 프로덕션 환경에서 모니터링 시작
if (process.env.NODE_ENV === 'production') {
    const analyzer = new EventLoopAnalyzer({
        lagThreshold: 100,
        sampleInterval: 2000,
        enableGCMonitoring: true,
        outputFile: 'production_analysis.json'
    });
    
    analyzer.startMonitoring();
    
    // graceful shutdown
    process.on('SIGTERM', async () => {
        analyzer.stopMonitoring();
        await analyzer.saveReport();
        process.exit(0);
    });
}

app.get('/', (req, res) => {
    res.json({ status: 'OK' });
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
```

## 핵심 요점

### 1. Node.js 완벽 통합

Node.js의 내장 API를 활용하여 별도의 외부 의존성 없이 포괄적인 모니터링을 제공합니다.

### 2. 실시간 진단

Async Hooks와 Performance Observer를 통해 실행 중인 애플리케이션의 성능 병목점을 실시간으로 감지합니다.

### 3. 상세한 보고서

수집된 데이터를 바탕으로 구체적인 권장사항과 함께 상세한 분석 보고서를 제공합니다.

---

**이전**: [C 기반 모니터링 시스템](05b-c-monitoring-system.md)  
**다음**: [코루틴과 비동기 패턴](03-coroutine.md)에서 고급 비동기 프로그래밍 기법을 학습합니다.
