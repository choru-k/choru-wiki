---
tags:
  - Memory Leak Detection
  - Node.js
  - JavaScript
  - V8 Engine
  - Heap Profiling
---

# 05b. JavaScript/Node.js 메모리 프로파일링

## 고도화된 Node.js 메모리 누수 탐지 시스템

V8 엔진의 힙 스냅샷과 GC 이벤트를 활용한 정교한 메모리 프로파일링 도구입니다. 실시간 모니터링과 상세 분석을 제공합니다.

```javascript
#!/usr/bin/env node
// memory_profiler.js

const v8 = require('v8');
const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class MemoryProfiler {
    constructor(options = {}) {
        this.options = {
            sampleInterval: options.sampleInterval || 5000, // 5초
            heapSnapshotInterval: options.heapSnapshotInterval || 60000, // 1분
            leakThreshold: options.leakThreshold || 50 * 1024 * 1024, // 50MB
            retentionCount: options.retentionCount || 10,
            outputDir: options.outputDir || './memory_analysis',
            enableDetailedGC: options.enableDetailedGC !== false,
            ...options
        };

        this.samples = [];
        this.heapSnapshots = [];
        this.gcEvents = [];
        this.isRunning = false;
        this.startTime = Date.now();

        this.baselineHeap = null;
        this.previousSnapshot = null;

        this.setupGCMonitoring();
        this.setupProcessMonitoring();
    }

    // GC 모니터링 설정
    setupGCMonitoring() {
        if (!this.options.enableDetailedGC) return;

        // GC 성능 관찰자 설정
        const obs = new PerformanceObserver((list) => {
            const entries = list.getEntries();

            entries.forEach(entry => {
                if (entry.entryType === 'gc') {
                    this.gcEvents.push({
                        timestamp: Date.now(),
                        type: this.getGCTypeName(entry.kind),
                        duration: entry.duration,
                        flags: entry.flags
                    });

                    // 긴 GC 경고
                    if (entry.duration > 100) {
                        console.warn(`⚠️  긴 GC 감지: ${this.getGCTypeName(entry.kind)} (${entry.duration.toFixed(2)}ms)`);
                    }
                }
            });
        });

        obs.observe({ entryTypes: ['gc'] });
    }

    // 프로세스 모니터링 설정
    setupProcessMonitoring() {
        // 메모리 경고 리스너
        process.on('warning', (warning) => {
            if (warning.name === 'MaxListenersExceededWarning' ||
                warning.name === 'DeprecationWarning') {
                console.warn('프로세스 경고:', warning.message);
            }
        });

        // 처리되지 않은 Promise 거부
        process.on('unhandledRejection', (reason, promise) => {
            console.error('처리되지 않은 Promise 거부:', reason);
            // 메모리 누수의 원인이 될 수 있음
        });
    }

    // GC 타입 이름 변환
    getGCTypeName(kind) {
        const gcTypes = {
            1: 'Scavenge',      // Minor GC
            2: 'Mark-Sweep',    // Major GC (old generation)
            4: 'Incremental',   // Incremental marking
            8: 'WeakPhantom',   // Weak callback processing
            15: 'All'           // Full GC
        };

        return gcTypes[kind] || `Unknown(${kind})`;
    }

    // 메모리 샘플 수집
    collectMemorySample() {
        const memUsage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();
        const heapSpaceStats = v8.getHeapSpaceStatistics();

        const sample = {
            timestamp: Date.now(),
            memoryUsage: memUsage,
            heapStatistics: heapStats,
            heapSpaceStatistics: heapSpaceStats,

            // 계산된 메트릭
            heapUsedMB: memUsage.heapUsed / 1024 / 1024,
            heapTotalMB: memUsage.heapTotal / 1024 / 1024,
            externalMB: memUsage.external / 1024 / 1024,
            rssMB: memUsage.rss / 1024 / 1024,

            // 힙 사용률
            heapUtilization: (memUsage.heapUsed / memUsage.heapTotal) * 100,

            // GC 압박 지표
            gcPressure: this.calculateGCPressure(heapStats)
        };

        this.samples.push(sample);

        // 샘플 수 제한
        if (this.samples.length > this.options.retentionCount * 12) { // 1시간 분량 유지
            this.samples = this.samples.slice(-this.options.retentionCount * 12);
        }

        return sample;
    }

    // GC 압박 지표 계산
    calculateGCPressure(heapStats) {
        // 힙 크기 대비 사용량과 GC 빈도를 고려한 압박 지표
        const heapUsageRatio = heapStats.used_heap_size / heapStats.heap_size_limit;
        const recentGCCount = this.gcEvents.filter(gc =>
            Date.now() - gc.timestamp < 60000
        ).length;

        return {
            heapUsageRatio: heapUsageRatio,
            recentGCCount: recentGCCount,
            pressure: heapUsageRatio * 0.7 + (recentGCCount / 10) * 0.3
        };
    }

    // 힙 스냅샷 생성
    async createHeapSnapshot() {
        const snapshotName = `heap_${Date.now()}.heapsnapshot`;
        const outputPath = path.join(this.options.outputDir, snapshotName);

        try {
            await fs.mkdir(this.options.outputDir, { recursive: true });

            console.log('힙 스냅샷 생성 중...');
            const startTime = performance.now();

            // 힙 스냅샷 생성
            const snapshot = v8.getHeapSnapshot();

            const writeStream = require('fs').createWriteStream(outputPath);

            await new Promise((resolve, reject) => {
                snapshot.pipe(writeStream);
                snapshot.on('end', resolve);
                snapshot.on('error', reject);
                writeStream.on('error', reject);
            });

            const duration = performance.now() - startTime;
            console.log(`힙 스냅샷 생성 완료: ${snapshotName} (${duration.toFixed(2)}ms)`);

            const stats = await fs.stat(outputPath);
            const snapshotInfo = {
                timestamp: Date.now(),
                filename: snapshotName,
                path: outputPath,
                sizeBytes: stats.size,
                duration: duration
            };

            this.heapSnapshots.push(snapshotInfo);

            // 스냅샷 수 제한
            if (this.heapSnapshots.length > this.options.retentionCount) {
                const oldSnapshot = this.heapSnapshots.shift();
                try {
                    await fs.unlink(oldSnapshot.path);
                    console.log(`이전 스냅샷 삭제: ${oldSnapshot.filename}`);
                } catch (error) {
                    console.warn(`스냅샷 삭제 실패: ${error.message}`);
                }
            }

            return snapshotInfo;

        } catch (error) {
            console.error('힙 스냅샷 생성 실패:', error);
            throw error;
        }
    }

    // 메모리 누수 감지
    detectMemoryLeaks() {
        if (this.samples.length < 10) {
            return { detected: false, reason: '샘플 부족' };
        }

        const recentSamples = this.samples.slice(-10); // 최근 10개 샘플
        const firstSample = recentSamples[0];
        const lastSample = recentSamples[recentSamples.length - 1];

        // 메모리 증가율 계산
        const heapGrowth = lastSample.memoryUsage.heapUsed - firstSample.memoryUsage.heapUsed;
        const rssGrowth = lastSample.memoryUsage.rss - firstSample.memoryUsage.rss;
        const timeDiff = lastSample.timestamp - firstSample.timestamp;

        const heapGrowthRate = heapGrowth / (timeDiff / 1000); // bytes/sec
        const rssGrowthRate = rssGrowth / (timeDiff / 1000);

        // 누수 임계값 확인
        const leakDetected = heapGrowthRate > 1024 * 1024 || // 1MB/sec 이상 증가
                            rssGrowth > this.options.leakThreshold;

        if (leakDetected) {
            return {
                detected: true,
                heapGrowthRate: heapGrowthRate,
                rssGrowthRate: rssGrowthRate,
                heapGrowthMB: heapGrowth / 1024 / 1024,
                rssGrowthMB: rssGrowth / 1024 / 1024,
                timeWindowMinutes: timeDiff / (1000 * 60)
            };
        }

        return { detected: false };
    }

    // 객체 타입별 분석
    analyzeObjectTypes() {
        const heapStats = v8.getHeapSpaceStatistics();

        const analysis = {
            timestamp: Date.now(),
            spaceUsage: heapStats.map(space => ({
                name: space.space_name,
                sizeUsed: space.space_used_size,
                sizeAvailable: space.space_available_size,
                physicalSize: space.physical_space_size,
                utilizationPercent: (space.space_used_size / space.space_available_size) * 100
            })),

            // 주요 공간별 분석
            oldSpaceUsage: heapStats.find(s => s.space_name === 'old_space'),
            newSpaceUsage: heapStats.find(s => s.space_name === 'new_space'),
            codeSpaceUsage: heapStats.find(s => s.space_name === 'code_space')
        };

        return analysis;
    }

    // 실시간 모니터링 시작
    startMonitoring() {
        if (this.isRunning) {
            console.warn('모니터링이 이미 실행 중입니다.');
            return;
        }

        this.isRunning = true;
        console.log('메모리 프로파일링 시작');

        // 베이스라인 수집
        this.baselineHeap = this.collectMemorySample();
        console.log(`베이스라인 힙 사용량: ${this.baselineHeap.heapUsedMB.toFixed(2)}MB`);

        // 정기적인 샘플 수집
        this.sampleInterval = setInterval(() => {
            this.collectMemorySample();
            this.displayCurrentStatus();

            // 누수 감지
            const leakResult = this.detectMemoryLeaks();
            if (leakResult.detected) {
                console.warn('🚨 메모리 누수 감지!');
                console.warn(`  힙 증가율: ${(leakResult.heapGrowthRate / 1024).toFixed(2)} KB/sec`);
                console.warn(`  RSS 증가: ${leakResult.rssGrowthMB.toFixed(2)} MB`);
            }
        }, this.options.sampleInterval);

        // 정기적인 힙 스냅샷
        this.snapshotInterval = setInterval(async () => {
            try {
                await this.createHeapSnapshot();
            } catch (error) {
                console.error('힙 스냅샷 생성 오류:', error);
            }
        }, this.options.heapSnapshotInterval);
    }

    // 현재 상태 표시
    displayCurrentStatus() {
        const latest = this.samples[this.samples.length - 1];
        if (!latest) return;

        console.clear();
        console.log('========================================');
        console.log('실시간 메모리 프로파일링');
        console.log('========================================');
        console.log(`실행 시간: ${Math.floor((Date.now() - this.startTime) / 1000)}초`);
        console.log(`샘플 수: ${this.samples.length}`);
        console.log('');

        console.log('📊 현재 메모리 사용량:');
        console.log(`  힙 사용량: ${latest.heapUsedMB.toFixed(2)}MB / ${latest.heapTotalMB.toFixed(2)}MB (${latest.heapUtilization.toFixed(1)}%)`);
        console.log(`  RSS: ${latest.rssMB.toFixed(2)}MB`);
        console.log(`  External: ${latest.externalMB.toFixed(2)}MB`);

        if (this.baselineHeap) {
            const heapGrowth = latest.heapUsedMB - this.baselineHeap.heapUsedMB;
            const rssGrowth = latest.rssMB - this.baselineHeap.rssMB;

            console.log('');
            console.log('📈 베이스라인 대비 변화:');
            console.log(`  힙: ${heapGrowth > 0 ? '+' : ''}${heapGrowth.toFixed(2)}MB`);
            console.log(`  RSS: ${rssGrowth > 0 ? '+' : ''}${rssGrowth.toFixed(2)}MB`);
        }

        // GC 정보
        if (this.gcEvents.length > 0) {
            const recentGC = this.gcEvents.filter(gc => Date.now() - gc.timestamp < 60000);
            console.log('');
            console.log('🗑️  GC 활동 (최근 1분):');
            console.log(`  GC 횟수: ${recentGC.length}`);

            if (recentGC.length > 0) {
                const avgDuration = recentGC.reduce((sum, gc) => sum + gc.duration, 0) / recentGC.length;
                console.log(`  평균 GC 시간: ${avgDuration.toFixed(2)}ms`);

                const gcTypes = {};
                recentGC.forEach(gc => {
                    gcTypes[gc.type] = (gcTypes[gc.type] || 0) + 1;
                });

                Object.entries(gcTypes).forEach(([type, count]) => {
                    console.log(`  ${type}: ${count}회`);
                });
            }
        }

        // GC 압박 지표
        console.log('');
        console.log('⚡ GC 압박 지표:');
        console.log(`  압박 수준: ${(latest.gcPressure.pressure * 100).toFixed(1)}%`);
        console.log(`  힙 사용률: ${(latest.gcPressure.heapUsageRatio * 100).toFixed(1)}%`);

        console.log('');
        console.log('[Ctrl+C로 종료]');
    }

    // 모니터링 중지
    stopMonitoring() {
        if (!this.isRunning) return;

        this.isRunning = false;

        if (this.sampleInterval) {
            clearInterval(this.sampleInterval);
        }

        if (this.snapshotInterval) {
            clearInterval(this.snapshotInterval);
        }

        console.log('\n모니터링 중지됨');
    }

    // 상세 분석 리포트 생성
    async generateDetailedReport() {
        const report = {
            metadata: {
                startTime: this.startTime,
                endTime: Date.now(),
                duration: Date.now() - this.startTime,
                sampleCount: this.samples.length,
                snapshotCount: this.heapSnapshots.length
            },

            baseline: this.baselineHeap,
            finalSample: this.samples[this.samples.length - 1],

            memoryGrowth: this.calculateMemoryGrowth(),
            gcAnalysis: this.analyzeGCPerformance(),
            leakDetection: this.detectMemoryLeaks(),
            objectAnalysis: this.analyzeObjectTypes(),

            recommendations: this.generateRecommendations(),

            samples: this.samples,
            gcEvents: this.gcEvents,
            heapSnapshots: this.heapSnapshots
        };

        // 리포트 저장
        const reportPath = path.join(this.options.outputDir, `memory_report_${Date.now()}.json`);
        await fs.mkdir(this.options.outputDir, { recursive: true });
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        console.log(`상세 리포트 생성: ${reportPath}`);

        // 요약 출력
        this.printReportSummary(report);

        return report;
    }

    // 메모리 증가량 계산
    calculateMemoryGrowth() {
        if (this.samples.length < 2) return null;

        const first = this.samples[0];
        const last = this.samples[this.samples.length - 1];
        const duration = last.timestamp - first.timestamp;

        return {
            heapGrowthMB: (last.memoryUsage.heapUsed - first.memoryUsage.heapUsed) / 1024 / 1024,
            rssGrowthMB: (last.memoryUsage.rss - first.memoryUsage.rss) / 1024 / 1024,
            externalGrowthMB: (last.memoryUsage.external - first.memoryUsage.external) / 1024 / 1024,
            durationMinutes: duration / (1000 * 60),

            growthRates: {
                heapMBPerMinute: ((last.memoryUsage.heapUsed - first.memoryUsage.heapUsed) / 1024 / 1024) / (duration / (1000 * 60)),
                rssMBPerMinute: ((last.memoryUsage.rss - first.memoryUsage.rss) / 1024 / 1024) / (duration / (1000 * 60))
            }
        };
    }

    // GC 성능 분석
    analyzeGCPerformance() {
        if (this.gcEvents.length === 0) return null;

        const totalDuration = this.gcEvents.reduce((sum, gc) => sum + gc.duration, 0);
        const avgDuration = totalDuration / this.gcEvents.length;
        const maxDuration = Math.max(...this.gcEvents.map(gc => gc.duration));

        // GC 타입별 분석
        const typeStats = {};
        this.gcEvents.forEach(gc => {
            if (!typeStats[gc.type]) {
                typeStats[gc.type] = { count: 0, totalDuration: 0 };
            }
            typeStats[gc.type].count++;
            typeStats[gc.type].totalDuration += gc.duration;
        });

        Object.keys(typeStats).forEach(type => {
            typeStats[type].avgDuration = typeStats[type].totalDuration / typeStats[type].count;
        });

        return {
            totalEvents: this.gcEvents.length,
            totalDuration: totalDuration,
            avgDuration: avgDuration,
            maxDuration: maxDuration,
            typeStatistics: typeStats,

            // GC 압박 분석
            gcPressure: this.calculateOverallGCPressure()
        };
    }

    calculateOverallGCPressure() {
        const recentSamples = this.samples.slice(-10);
        if (recentSamples.length === 0) return 0;

        const avgPressure = recentSamples.reduce((sum, sample) =>
            sum + sample.gcPressure.pressure, 0) / recentSamples.length;

        return avgPressure;
    }

    // 권장사항 생성
    generateRecommendations() {
        const recommendations = [];
        const growth = this.calculateMemoryGrowth();
        const gcAnalysis = this.analyzeGCPerformance();
        const leakResult = this.detectMemoryLeaks();

        if (leakResult.detected) {
            recommendations.push({
                type: 'memory_leak',
                priority: 'critical',
                message: '메모리 누수가 감지되었습니다.',
                details: `힙 증가율: ${(leakResult.heapGrowthRate / 1024).toFixed(2)} KB/sec`,
                actions: [
                    '힙 스냅샷을 분석하여 증가하는 객체를 확인하세요',
                    '이벤트 리스너와 콜백 해제를 확인하세요',
                    '전역 변수와 캐시 사용을 검토하세요'
                ]
            });
        }

        if (growth && growth.growthRates.heapMBPerMinute > 1) {
            recommendations.push({
                type: 'memory_growth',
                priority: 'high',
                message: '높은 메모리 증가율이 감지되었습니다.',
                details: `힙 증가율: ${growth.growthRates.heapMBPerMinute.toFixed(2)} MB/min`,
                actions: [
                    '객체 생성 패턴을 최적화하세요',
                    '불필요한 메모리 할당을 줄이세요',
                    '메모리 풀링을 고려하세요'
                ]
            });
        }

        if (gcAnalysis && gcAnalysis.avgDuration > 50) {
            recommendations.push({
                type: 'gc_performance',
                priority: 'medium',
                message: 'GC 성능이 저하되었습니다.',
                details: `평균 GC 시간: ${gcAnalysis.avgDuration.toFixed(2)}ms`,
                actions: [
                    '힙 크기를 조정하여 GC 빈도를 최적화하세요',
                    '대용량 객체 할당을 피하세요',
                    'Incremental GC 옵션을 고려하세요'
                ]
            });
        }

        return recommendations;
    }

    // 리포트 요약 출력
    printReportSummary(report) {
        console.log('\n=== 메모리 프로파일링 리포트 요약 ===');
        console.log(`모니터링 시간: ${Math.floor(report.metadata.duration / (1000 * 60))}분`);

        if (report.memoryGrowth) {
            console.log(`힙 증가: ${report.memoryGrowth.heapGrowthMB.toFixed(2)}MB`);
            console.log(`RSS 증가: ${report.memoryGrowth.rssGrowthMB.toFixed(2)}MB`);
            console.log(`힙 증가율: ${report.memoryGrowth.growthRates.heapMBPerMinute.toFixed(2)}MB/min`);
        }

        if (report.gcAnalysis) {
            console.log(`총 GC 횟수: ${report.gcAnalysis.totalEvents}회`);
            console.log(`평균 GC 시간: ${report.gcAnalysis.avgDuration.toFixed(2)}ms`);
        }

        if (report.leakDetection.detected) {
            console.log('🚨 메모리 누수 감지됨!');
        } else {
            console.log('✅ 메모리 누수 없음');
        }

        console.log(`\n권장사항: ${report.recommendations.length}개`);
        report.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.message}`);
        });
    }

    // 정리
    cleanup() {
        this.stopMonitoring();
        this.samples = [];
        this.gcEvents = [];
        this.heapSnapshots = [];
    }
}

// CLI 실행
if (require.main === module) {
    const profiler = new MemoryProfiler({
        sampleInterval: 5000,
        heapSnapshotInterval: 30000,
        outputDir: './memory_analysis'
    });

    // 종료 처리
    process.on('SIGINT', async () => {
        console.log('\n프로파일링 중단...');
        profiler.stopMonitoring();

        try {
            await profiler.generateDetailedReport();
        } catch (error) {
            console.error('리포트 생성 실패:', error);
        }

        profiler.cleanup();
        process.exit(0);
    });

    // 모니터링 시작
    profiler.startMonitoring();
}

module.exports = MemoryProfiler;
```

## 고급 분석 기능

### 1. V8 힙 스냅샷 분석

- 주기적 힙 스냅샷 자동 생성
- 스냅샷 간 비교를 통한 메모리 증가 패턴 분석
- 객체 생성/소멸 추적

### 2. GC 성능 모니터링

- 실시간 GC 이벤트 추적
- GC 타입별 성능 분석 (Scavenge, Mark-Sweep, Incremental)
- GC 압박 지표 계산

### 3. 지능형 누수 감지 알고리즘

- 다중 메트릭 기반 누수 패턴 감지
- 임계값 기반 자동 경고 시스템
- 시간 윈도우별 증가율 분석

## 실전 활용 예시

### 웹 서버 메모리 모니터링

```javascript
// Express 서버와 함께 사용
const express = require('express');
const MemoryProfiler = require('./memory_profiler');

const app = express();
const profiler = new MemoryProfiler({
    sampleInterval: 10000, // 10초
    heapSnapshotInterval: 300000, // 5분
    leakThreshold: 100 * 1024 * 1024, // 100MB
    outputDir: './logs/memory'
});

// 프로파일링 시작
profiler.startMonitoring();

// 서버 시작
app.listen(3000, () => {
    console.log('서버 시작, 메모리 모니터링 활성화');
});

// 우아한 종료
process.on('SIGTERM', async () => {
    console.log('서버 종료 중...');
    profiler.stopMonitoring();
    await profiler.generateDetailedReport();
    process.exit(0);
});
```

### 배치 작업 메모리 분석

```javascript
// 배치 작업의 메모리 패턴 분석
async function analyzeMemoryLeaks() {
    const profiler = new MemoryProfiler({
        sampleInterval: 1000,
        enableDetailedGC: true
    });

    profiler.startMonitoring();

    // 메모리 집약적 작업 시뮬레이션
    const data = [];
    for (let i = 0; i < 100000; i++) {
        data.push({
            id: i,
            payload: new Array(1000).fill(Math.random())
        });
        
        // 정기적으로 일부 데이터 해제
        if (i % 10000 === 0) {
            data.splice(0, 5000);
            
            // 강제 GC (개발 환경에서만)
            if (global.gc) global.gc();
        }
    }

    // 5분 후 분석
    setTimeout(async () => {
        const report = await profiler.generateDetailedReport();
        
        if (report.leakDetection.detected) {
            console.log('누수 감지! 추가 분석 필요');
        }
        
        profiler.cleanup();
    }, 5 * 60 * 1000);
}
```

## 핵심 요점

### 1. 정밀한 V8 엔진 분석

JavaScript/Node.js 환경에 특화된 V8 엔진 레벨의 메모리 분석

### 2. 실시간 GC 모니터링  

GC 이벤트와 성능을 실시간으로 추적하여 메모리 관리 효율성 평가

### 3. 자동화된 분석 리포트

포괄적인 분석 결과와 실행 가능한 개선 권장사항 제공

---

**이전**: [시스템 레벨 탐지 도구](05a-system-level-detection.md)
**다음**: [메모리 최적화](04-memory-optimization.md)에서 누수 해결 후 성능 최적화를 학습합니다.
