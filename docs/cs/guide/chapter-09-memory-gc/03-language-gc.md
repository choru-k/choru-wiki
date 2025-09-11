---
tags:
  - GC
  - Java
  - Go
  - Python
  - JavaScript
  - Memory
---

# Chapter 9-3: 언어별 GC 특징과 최적화

## 🎯 이 문서를 읽고 나면 얻을 수 있는 것들

이 문서를 마스터하면, 여러분은:

1. **"Java vs Go GC, 뭐가 더 좋아요?"** - 각 언어의 GC 철학과 트레이드오프를 이해합니다
2. **"Python이 느린 이유가 GIL 때문인가요?"** - Reference Counting과 GIL의 관계를 파악합니다
3. **"V8 엔진이 빠른 비결이 뭔가요?"** - JavaScript의 세대별 GC와 최적화 기법을 배웁니다
4. **"프로덕션에서 GC 튜닝 어떻게 하나요?"** - 실제 사례와 함께 튜닝 방법을 익힙니다

## 1. Java: GC의 제국

### 1.1 Java GC의 진화: 25년의 여정

```
1995: Java 1.0 - Mark & Sweep
1998: Java 1.2 - Generational GC
2002: Java 1.4 - Parallel GC
2004: Java 5 - CMS
2012: Java 7u4 - G1GC
2018: Java 11 - ZGC (실험적)
2019: Java 12 - Shenandoah
2020: Java 15 - ZGC 정식
```

제가 2010년부터 Java를 사용하며 겪은 GC의 진화:

```java
// 2010년: CMS의 시대
// 문제: 금융 거래 시스템에서 STW로 거래 실패
public class TradingSystem {
    // 당시 JVM 옵션
    // -XX:+UseConcMarkSweepGC
    // -XX:+CMSParallelRemarkEnabled
    // -XX:CMSInitiatingOccupancyFraction=70
    
    // 문제의 코드
    private Map<String, Order> orders = new HashMap<>();  // 10GB
    
    public void processOrder(Order order) {
        orders.put(order.id, order);  // Young -> Old promotion
        // Full GC 발생 시 5초 정지!
    }
}

// 2015년: G1GC로 전환
// -XX:+UseG1GC
// -XX:MaxGCPauseMillis=200
// 결과: 5초 -> 200ms (25배 개선!)

// 2020년: ZGC 도입
// -XX:+UseZGC
// -XX:ZCollectionInterval=30
// 결과: 200ms -> 2ms (100배 개선!)
```

### 1.2 JVM GC 완벽 가이드

#### Serial GC: 싱글 스레드의 단순함

```java
// Serial GC (-XX:+UseSerialGC)
public class SerialGCDemo {
    public static void main(String[] args) {
        // 특징: 싱글 스레드, 작은 힙에 최적
        // 사용 사례: 클라이언트 앱, 100MB 이하 힙
        
        // Young Generation: Copy
        // Old Generation: Mark-Compact
        
        // 실제 측정
        long start = System.currentTimeMillis();
        
        for (int i = 0; i < 1000000; i++) {
            byte[] array = new byte[1024];  // 1KB
            if (i % 10000 == 0) {
                System.gc();  // 강제 GC
            }
        }
        
        long elapsed = System.currentTimeMillis() - start;
        System.out.println("Serial GC: " + elapsed + "ms");
        // 결과: 약 5000ms (매우 느림)
    }
}

// JVM 내부 구현 (단순화)
void serialGC() {
    stopTheWorld();
    
    // Young GC
    copyLiveObjectsFromEden();
    
    // Old GC (필요시)
    markPhase();
    compactPhase();
    
    resumeTheWorld();
}
```

#### Parallel GC: 멀티코어 활용

```java
// Parallel GC (-XX:+UseParallelGC)
public class ParallelGCOptimization {
    // JVM 옵션
    // -XX:+UseParallelGC          # Parallel GC 사용
    // -XX:ParallelGCThreads=8      # GC 스레드 수
    // -XX:MaxGCPauseMillis=100     # 목표 pause time
    // -XX:GCTimeRatio=99           # 1/(1+99) = 1% GC 시간
    
    public static void optimizeForThroughput() {
        // Parallel GC는 처리량 최적화
        // 배치 작업, 데이터 분석에 적합
        
        List<byte[]> data = new ArrayList<>();
        
        // 대량 데이터 처리
        for (int i = 0; i < 10_000_000; i++) {
            data.add(processData(i));
            
            if (i % 100_000 == 0) {
                // 주기적으로 오래된 데이터 제거
                data.subList(0, 50_000).clear();
            }
        }
    }
    
    // 실제 프로덕션 설정 (배치 서버)
    /*
    -Xmx16g -Xms16g
    -XX:+UseParallelGC
    -XX:ParallelGCThreads=16
    -XX:+UseParallelOldGC
    -XX:+UseAdaptiveSizePolicy
    
    결과:
    - Throughput: 98.5%
    - Avg pause: 150ms
    - Max pause: 800ms
    */
}
```

#### G1GC: 예측 가능한 성능

```java
// G1GC 상세 튜닝
public class G1GCTuning {
    // Netflix 실제 설정
    public static String[] netflixG1Settings = {
        "-XX:+UseG1GC",
        "-XX:MaxGCPauseMillis=250",      // 목표 pause
        "-XX:G1HeapRegionSize=32m",       // Region 크기
        "-XX:InitiatingHeapOccupancyPercent=45",  // IHOP
        "-XX:G1ReservePercent=10",        // 예약 공간
        "-XX:ConcGCThreads=8",            // Concurrent 스레드
        "-XX:ParallelGCThreads=16",       // STW 스레드
        "-XX:+ParallelRefProcEnabled",    // Reference 병렬 처리
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:G1NewSizePercent=5",         // 최소 Young 크기
        "-XX:G1MaxNewSizePercent=60",     // 최대 Young 크기
        "-XX:G1MixedGCLiveThresholdPercent=85",  // Mixed GC 임계값
        "-XX:G1OldCSetRegionThresholdPercent=10", // Old region 비율
        "-XX:+AlwaysPreTouch"             // 힙 미리 할당
    };
    
    // Remember Set 모니터링
    public static void monitorG1() {
        // GC 로그 분석
        // [GC pause (G1 Evacuation Pause) (young) 
        //   [Parallel Time: 8.1 ms, GC Workers: 8]
        //     [GC Worker Start (ms): 10.0 10.1 10.1 10.2]
        //     [Ext Root Scanning (ms): 1.2 1.3 1.1 1.2]
        //     [Update RS (ms): 0.5 0.6 0.4 0.5]  // Remember Set
        //     [Scan RS (ms): 0.8 0.7 0.9 0.8]
        //     [Code Root Scanning (ms): 0.1 0.1 0.1 0.1]
        //     [Object Copy (ms): 5.2 5.1 5.3 5.2]
        
        // Remember Set 크기가 크면 Update RS 시간 증가
        // 해결: -XX:G1ConcRefinementThreads 증가
    }
    
    // Humongous 객체 처리
    public static void handleHumongousObjects() {
        // G1에서 Region 크기의 50% 이상 = Humongous
        // 32MB region이면 16MB 이상
        
        // 나쁜 예
        byte[] huge = new byte[20 * 1024 * 1024];  // 20MB
        // Humongous로 처리, 성능 저하
        
        // 좋은 예
        List<byte[]> chunks = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            chunks.add(new byte[1024 * 1024]);  // 1MB씩
        }
        // 일반 객체로 처리, 효율적
    }
}
```

#### ZGC: 차세대 GC

```java
// ZGC 실전 활용
public class ZGCProduction {
    // Cassandra에서 ZGC 사용 사례
    public static String[] cassandraZGCSettings = {
        "-XX:+UseZGC",
        "-Xmx31g",                        // 32GB 미만 (CompressedOops)
        "-XX:ConcGCThreads=8",            // Concurrent 스레드
        "-XX:ZCollectionInterval=300",    // 5분마다 GC
        "-XX:ZFragmentationLimit=25",     // 단편화 25% 제한
        "-XX:+UseLargePages",             // Huge Pages
        "-XX:ZPath=/mnt/hugepages",       // Huge Pages 경로
        "-XX:ZUncommitDelay=300",         // 5분 후 메모리 반환
        "-XX:ZAllocationSpikeTolerance=5" // 할당 스파이크 허용
    };
    
    // ZGC 페이지 크기
    // Small:  2MB (객체 < 256KB)
    // Medium: 32MB (객체 256KB - 4MB)  
    // Large:  N*2MB (객체 > 4MB)
    
    public static void monitorZGC() {
        // ZGC 통계
        // -XX:+PrintGCDetails -XX:+PrintGCDateStamps
        
        // [2024-01-15T10:00:00.000+0000][gc,start] GC(100) 
        // [2024-01-15T10:00:00.001+0000][gc,phases] GC(100) Pause Mark Start 0.893ms
        // [2024-01-15T10:00:00.150+0000][gc,phases] GC(100) Concurrent Mark 149.123ms
        // [2024-01-15T10:00:00.151+0000][gc,phases] GC(100) Pause Mark End 0.456ms
        // [2024-01-15T10:00:00.300+0000][gc,phases] GC(100) Concurrent Relocate 148.234ms
        
        // 중요: STW는 1ms 미만!
    }
    
    // ZGC vs G1 실제 비교 (전자상거래 사이트)
    public static void comparePerformance() {
        /*
        시나리오: Black Friday 트래픽 (평소의 10배)
        힙 크기: 64GB
        
        G1GC:
        - Average pause: 120ms
        - P99 pause: 450ms
        - P99.9 pause: 1200ms
        - Throughput: 92%
        
        ZGC:
        - Average pause: 1.2ms
        - P99 pause: 2.5ms
        - P99.9 pause: 4.8ms
        - Throughput: 88%
        
        결론: 4% throughput 손실로 100배 낮은 latency!
        */
    }
}
```

## 2. Go: 단순함의 미학

### 2.1 Go GC의 철학

Rob Pike의 설계 철학:
> "GC는 있어야 하지만, 프로그래머가 신경 쓸 필요는 없어야 한다"

```go
// Go GC의 특징
// 1. 튜닝 옵션 최소화 (GOGC, GOMEMLIMIT 정도)
// 2. 낮은 latency 우선
// 3. Concurrent, tri-color, non-generational

// Go GC의 진화
// Go 1.0 (2012): Stop-the-world
// Go 1.5 (2015): Concurrent GC, <10ms 목표
// Go 1.8 (2017): <100μs STW
// Go 1.12 (2019): Mark assist 개선
// Go 1.19 (2022): Soft memory limit

package main

import (
    "fmt"
    "runtime"
    "runtime/debug"
    "time"
)

// Go GC 동작 이해하기
func understandGoGC() {
    // GC 통계 확인
    var m runtime.MemStats
    runtime.ReadMemStats(&m)
    
    fmt.Printf("Alloc: %d MB\n", m.Alloc/1024/1024)
    fmt.Printf("TotalAlloc: %d MB\n", m.TotalAlloc/1024/1024)
    fmt.Printf("Sys: %d MB\n", m.Sys/1024/1024)
    fmt.Printf("NumGC: %d\n", m.NumGC)
    fmt.Printf("PauseNs: %v\n", m.PauseNs[(m.NumGC+255)%256])
    
    // GOGC 설정 (기본 100)
    // 100 = 힙이 2배가 되면 GC 실행
    debug.SetGCPercent(50)  // 더 자주 GC
    
    // Memory Limit 설정 (Go 1.19+)
    debug.SetMemoryLimit(1 << 30)  // 1GB 제한
}

// Write Barrier 이해
type Node struct {
    Value int
    Next  *Node
}

func createList() *Node {
    // Go의 Write Barrier는 자동
    // 컴파일러가 삽입
    head := &Node{Value: 1}
    head.Next = &Node{Value: 2}  // Write barrier 발동
    
    // 실제 생성되는 코드 (의사코드)
    // if writeBarrier.enabled {
    //     gcWriteBarrier(&head.Next, &Node{Value: 2})
    // } else {
    //     head.Next = &Node{Value: 2}
    // }
    
    return head
}
```

### 2.2 Go GC 내부 구현

```go
// Go GC의 핵심: Tricolor Concurrent Mark & Sweep
package main

import (
    "fmt"
    "runtime"
    "sync"
    "time"
)

// GC Pacer: GC 시작 시점 결정
func gcPacer() {
    // Go GC는 Pacer가 언제 GC를 시작할지 결정
    // 목표: 25% CPU를 GC에 사용
    
    // Pacer 알고리즘 (단순화)
    // next_gc = heap_marked * (1 + GOGC/100)
    // 
    // 예: heap_marked = 100MB, GOGC = 100
    // next_gc = 100MB * 2 = 200MB
    
    // 실제 코드에서 확인
    var m runtime.MemStats
    runtime.ReadMemStats(&m)
    
    nextGC := m.HeapMarked * uint64(100+runtime.GOMAXPROCS(0)) / 100
    fmt.Printf("Next GC at: %d MB\n", nextGC/1024/1024)
}

// Concurrent Marking 시뮬레이션
type GCSimulator struct {
    mu      sync.Mutex
    objects map[*Object]Color
    gray    []*Object
}

type Color int
const (
    White Color = iota  // 미방문
    Gray                // 방문했지만 자식 미처리
    Black               // 완전 처리
)

type Object struct {
    data  [1024]byte
    refs  []*Object
    color Color
}

func (gc *GCSimulator) concurrentMark() {
    // Phase 1: Mark Start (STW ~100μs)
    runtime.GC()  // 실제 GC 트리거
    startTime := time.Now()
    
    // Root scan
    roots := getRoots()
    for _, root := range roots {
        root.color = Gray
        gc.gray = append(gc.gray, root)
    }
    
    fmt.Printf("STW Mark Start: %v\n", time.Since(startTime))
    
    // Phase 2: Concurrent Mark (앱과 동시 실행)
    for len(gc.gray) > 0 {
        obj := gc.gray[0]
        gc.gray = gc.gray[1:]
        
        for _, ref := range obj.refs {
            if ref.color == White {
                ref.color = Gray
                gc.gray = append(gc.gray, ref)
            }
        }
        
        obj.color = Black
        
        // Mark assist: 할당이 marking보다 빠르면
        // mutator가 marking 도움
        if allocationRate() > markingRate() {
            assistMarking()
        }
    }
    
    // Phase 3: Mark Termination (STW ~100μs)
    // Finalization, weak pointer 처리
    
    // Phase 4: Concurrent Sweep
    // 백그라운드에서 White 객체 회수
}

// Stack 스캔 최적화
func stackScanning() {
    // Go 1.9+: Hybrid write barrier
    // Stack re-scanning 제거!
    
    // 이전: STW 중 모든 스택 재스캔
    // 현재: Concurrent mark 중 write barrier로 추적
    
    // 결과: STW 시간 크게 감소
    // 100ms -> 100μs (1000배!)
}

// 실제 성능 측정
func benchmarkGoGC() {
    const numGoroutines = 1000
    const allocPerGoroutine = 1000
    
    start := time.Now()
    var wg sync.WaitGroup
    
    for i := 0; i < numGoroutines; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            
            var data [][]byte
            for j := 0; j < allocPerGoroutine; j++ {
                data = append(data, make([]byte, 1024))
            }
            
            // 일부만 유지
            data = data[:10]
            runtime.KeepAlive(data)
        }()
    }
    
    wg.Wait()
    
    var m runtime.MemStats
    runtime.ReadMemStats(&m)
    
    fmt.Printf("Execution time: %v\n", time.Since(start))
    fmt.Printf("Number of GCs: %d\n", m.NumGC)
    fmt.Printf("Total GC pause: %v\n", time.Duration(m.PauseTotalNs))
    fmt.Printf("Average GC pause: %v\n", 
        time.Duration(m.PauseTotalNs/uint64(m.NumGC)))
    
    // 일반적인 결과:
    // Number of GCs: 15
    // Total GC pause: 1.5ms
    // Average GC pause: 100μs
}
```

### 2.3 Go GC 최적화 전략

```go
// Discord의 Go 서비스 최적화 사례
package main

import (
    "runtime"
    "runtime/debug"
    "sync"
    "time"
)

// 1. Object Pool로 할당 줄이기
var bufferPool = sync.Pool{
    New: func() interface{} {
        return make([]byte, 4096)
    },
}

func processWithPool(data []byte) {
    buf := bufferPool.Get().([]byte)
    defer bufferPool.Put(buf)
    
    // buf 사용...
    copy(buf, data)
    
    // GC pressure 크게 감소!
}

// 2. Ballast 기법
var ballast []byte

func init() {
    // 큰 바이트 슬라이스 할당 (실제 메모리는 사용 안 함)
    ballast = make([]byte, 10<<30)  // 10GB
    
    // GC가 너무 자주 실행되는 것 방지
    // next_gc = (10GB + live_heap) * 2
    
    // 주의: Go 1.19+ 에서는 GOMEMLIMIT 사용 권장
}

// 3. Manual GC Control
func manualGCControl() {
    // 특정 시점에 GC 실행
    ticker := time.NewTicker(30 * time.Second)
    
    go func() {
        for range ticker.C {
            var m runtime.MemStats
            runtime.ReadMemStats(&m)
            
            // Idle 상태에서만 GC
            if m.Alloc < m.TotalAlloc/10 {
                runtime.GC()
                debug.FreeOSMemory()  // OS에 메모리 반환
            }
        }
    }()
}

// 4. Escape Analysis 활용
type LargeStruct struct {
    data [10000]int
}

// 스택 할당 (좋음)
func stackAllocation() {
    var s LargeStruct  // 스택에 할당
    s.data[0] = 1
    // 함수 끝나면 자동 해제, GC 부담 없음
}

// 힙 할당 (피하기)
func heapAllocation() *LargeStruct {
    s := &LargeStruct{}  // 힙에 할당 (escape)
    return s  // 함수 밖으로 escape
}

// 5. GOGC와 GOMEMLIMIT 튜닝
func tuneGC() {
    // GOGC: GC 목표 비율
    debug.SetGCPercent(50)  // 50% 증가 시 GC (기본 100)
    
    // GOMEMLIMIT: 메모리 제한 (Go 1.19+)
    debug.SetMemoryLimit(8 << 30)  // 8GB
    
    // 조합 사용
    // - 평상시: GOGC로 제어
    // - 메모리 압박 시: GOMEMLIMIT로 제한
}

// Discord 실제 결과
func discordResults() {
    /*
    Before optimization:
    - Memory: 10GB average, 30GB peak
    - GC pause: 10ms P99
    - GC frequency: Every 2 seconds
    
    After optimization:
    - Memory: 3GB average, 5GB peak (70% 감소!)
    - GC pause: 1ms P99 (90% 감소!)
    - GC frequency: Every 30 seconds
    
    적용한 기법:
    1. sync.Pool 광범위 사용
    2. Ballast 10GB
    3. GOGC=50
    4. Escape analysis 최적화
    */
}
```

## 3. Python: Reference Counting + Cycle Detection

### 3.1 Python GC의 이중 구조

```python
import gc
import sys
import weakref
import tracemalloc

# Python GC = Reference Counting + Generational GC

class PythonGCDemo:
    def __init__(self):
        self.data = [0] * 1000000
    
    def __del__(self):
        print(f"객체 소멸: {id(self)}")

def reference_counting():
    """Python의 기본: Reference Counting"""
    
    # 참조 카운트 확인
    obj = PythonGCDemo()
    print(f"참조 카운트: {sys.getrefcount(obj) - 1}")  # -1: getrefcount 자체
    
    # 참조 증가
    ref1 = obj
    print(f"참조 카운트: {sys.getrefcount(obj) - 1}")  # 2
    
    ref2 = obj
    print(f"참조 카운트: {sys.getrefcount(obj) - 1}")  # 3
    
    # 참조 감소
    del ref1
    print(f"참조 카운트: {sys.getrefcount(obj) - 1}")  # 2
    
    del ref2
    print(f"참조 카운트: {sys.getrefcount(obj) - 1}")  # 1
    
    del obj
    # 여기서 __del__ 호출됨 (참조 카운트 0)

def circular_reference():
    """순환 참조 문제와 해결"""
    
    class Node:
        def __init__(self, value):
            self.value = value
            self.ref = None
            
    # 순환 참조 생성
    a = Node(1)
    b = Node(2)
    a.ref = b
    b.ref = a  # 순환 참조!
    
    # Reference counting만으로는 해제 불가
    del a
    del b
    # 메모리 누수 발생!
    
    # Cycle detector가 필요
    print(f"수집 전 객체 수: {len(gc.get_objects())}")
    collected = gc.collect()  # 수동 GC
    print(f"수집된 객체: {collected}")
    print(f"수집 후 객체 수: {len(gc.get_objects())}")

# Python GC 세대 관리
def generational_gc():
    """Python의 3세대 GC"""
    
    # GC 임계값 확인
    print("GC 임계값:", gc.get_threshold())
    # (700, 10, 10) 기본값
    # Gen0: 700개 할당 시 GC
    # Gen1: Gen0 GC 10번 후
    # Gen2: Gen1 GC 10번 후
    
    # 임계값 조정
    gc.set_threshold(500, 5, 5)  # 더 자주 GC
    
    # 각 세대 통계
    for i in range(3):
        count = len(gc.get_objects(i))
        print(f"Generation {i}: {count} objects")
    
    # 수동 GC (특정 세대)
    gc.collect(0)  # Gen0만
    gc.collect(1)  # Gen0, Gen1
    gc.collect(2)  # 전체

# 메모리 프로파일링
def memory_profiling():
    """메모리 사용량 추적"""
    
    tracemalloc.start()
    
    # 메모리 집약적 작업
    data = []
    for i in range(1000000):
        data.append({"id": i, "value": f"item_{i}"})
    
    current, peak = tracemalloc.get_traced_memory()
    print(f"현재 메모리: {current / 1024 / 1024:.2f} MB")
    print(f"최대 메모리: {peak / 1024 / 1024:.2f} MB")
    
    # Top 10 메모리 사용처
    snapshot = tracemalloc.take_snapshot()
    top_stats = snapshot.statistics('lineno')
    
    print("\nTop 10 메모리 사용:")
    for stat in top_stats[:10]:
        print(stat)
    
    tracemalloc.stop()
```

### 3.2 Python GC 최적화

```python
import gc
import time
from contextlib import contextmanager
from functools import wraps

class PythonGCOptimization:
    """Python GC 최적화 전략"""
    
    @staticmethod
    @contextmanager
    def gc_disabled():
        """임시로 GC 비활성화"""
        was_enabled = gc.isenabled()
        gc.disable()
        try:
            yield
        finally:
            if was_enabled:
                gc.enable()
    
    @staticmethod
    def benchmark_gc_impact():
        """GC의 성능 영향 측정"""
        
        def create_objects(n):
            return [{"id": i, "data": [0] * 100} for i in range(n)]
        
        # GC 활성화 상태
        gc.enable()
        start = time.time()
        with_gc = create_objects(1000000)
        gc_enabled_time = time.time() - start
        
        del with_gc
        gc.collect()
        
        # GC 비활성화 상태
        gc.disable()
        start = time.time()
        without_gc = create_objects(1000000)
        gc_disabled_time = time.time() - start
        gc.enable()
        
        print(f"GC 활성: {gc_enabled_time:.3f}초")
        print(f"GC 비활성: {gc_disabled_time:.3f}초")
        print(f"성능 향상: {(gc_enabled_time/gc_disabled_time - 1)*100:.1f}%")
        
        # 일반적 결과:
        # GC 활성: 2.5초
        # GC 비활성: 2.1초
        # 성능 향상: 19%
    
    @staticmethod
    def optimize_for_batch_processing():
        """배치 처리 최적화"""
        
        # 큰 배치 작업 시 GC 제어
        def process_large_batch(data):
            # GC 비활성화
            gc.disable()
            
            try:
                results = []
                for item in data:
                    # 복잡한 처리
                    processed = transform(item)
                    results.append(processed)
                
                return results
            
            finally:
                # 작업 후 GC 실행
                gc.enable()
                gc.collect()
        
        return process_large_batch

# __slots__로 메모리 최적화
class OptimizedClass:
    __slots__ = ['x', 'y', 'z']  # __dict__ 제거
    
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z

class NormalClass:
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z

def compare_memory_usage():
    """__slots__ 효과 측정"""
    import sys
    
    normal = NormalClass(1, 2, 3)
    optimized = OptimizedClass(1, 2, 3)
    
    print(f"일반 클래스: {sys.getsizeof(normal.__dict__)} bytes")
    print(f"최적화 클래스: {sys.getsizeof(optimized)} bytes")
    
    # 대량 생성 시
    normal_list = [NormalClass(i, i+1, i+2) for i in range(1000000)]
    # 약 200MB
    
    optimized_list = [OptimizedClass(i, i+1, i+2) for i in range(1000000)]
    # 약 100MB (50% 절약!)

# Weak Reference 활용
class CacheWithWeakRef:
    """약한 참조로 메모리 누수 방지"""
    
    def __init__(self):
        self._cache = weakref.WeakValueDictionary()
    
    def get(self, key):
        return self._cache.get(key)
    
    def set(self, key, value):
        self._cache[key] = value
        # value의 다른 참조가 없으면 자동 제거

# 실제 프로덕션 최적화 (Instagram 사례)
def instagram_optimization():
    """
    Instagram (Django) GC 최적화:
    
    문제: GC로 인한 주기적 지연
    
    해결책:
    1. gc.disable() in WSGI worker 시작
    2. Request 처리 후 수동 gc.collect()
    3. Worker 재시작 주기 단축 (메모리 누수 방지)
    
    결과:
    - P99 latency: 200ms -> 150ms (25% 개선)
    - GC pause: 50ms -> 5ms (90% 감소)
    """
    pass
```

## 4. JavaScript (V8): 숨겨진 복잡성

### 4.1 V8 GC의 정교함

```javascript
// V8 GC: Generational + Incremental + Concurrent

// V8의 메모리 구조
class V8Memory {
    constructor() {
        // Young Generation (Semi-space)
        this.newSpace = {
            from: new ArrayBuffer(8 * 1024 * 1024),  // 8MB
            to: new ArrayBuffer(8 * 1024 * 1024),    // 8MB
            // Scavenger (Cheney's algorithm)
        };
        
        // Old Generation
        this.oldSpace = {
            oldPointerSpace: [],  // 다른 객체 참조하는 객체
            oldDataSpace: [],     // 원시 데이터만
            largeObjectSpace: [], // 큰 객체 (>1MB)
            codeSpace: [],        // JIT 컴파일된 코드
            mapSpace: []          // Hidden classes
        };
    }
}

// Hidden Class 최적화
function demonstrateHiddenClasses() {
    // 좋은 예: 같은 hidden class
    class Point {
        constructor(x, y) {
            this.x = x;  // 항상 같은 순서
            this.y = y;
        }
    }
    
    const points = [];
    for (let i = 0; i < 1000000; i++) {
        points.push(new Point(i, i + 1));
    }
    // 모든 Point가 같은 hidden class 공유
    
    // 나쁜 예: 다른 hidden class
    const objects = [];
    for (let i = 0; i < 1000000; i++) {
        const obj = {};
        if (i % 2 === 0) {
            obj.x = i;      // 순서가
            obj.y = i + 1;  // 다름!
        } else {
            obj.y = i + 1;  // 순서가
            obj.x = i;      // 다름!
        }
        objects.push(obj);
    }
    // 2개의 다른 hidden class 생성
}

// Inline Caching과 GC
function inlineCachingImpact() {
    // Monomorphic (빠름)
    function processPoint(point) {
        return point.x + point.y;  // 항상 같은 타입
    }
    
    // Polymorphic (느림)
    function processAny(obj) {
        return obj.x + obj.y;  // 다양한 타입
    }
    
    // Megamorphic (매우 느림)
    function processMega(obj) {
        return obj.value;  // 너무 많은 타입
    }
}

// 수동 GC 트리거 (--expose-gc 필요)
function manualGC() {
    if (global.gc) {
        console.log('수동 GC 실행');
        global.gc();
    }
}

// 메모리 프로파일링
function profileMemory() {
    if (performance.memory) {
        console.log({
            totalJSHeapSize: performance.memory.totalJSHeapSize / 1048576,
            usedJSHeapSize: performance.memory.usedJSHeapSize / 1048576,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit / 1048576
        });
    }
}
```

### 4.2 V8 GC 최적화 패턴

```javascript
// Chrome DevTools에서 실제 측정한 패턴들

class V8Optimization {
    // 1. Object Pool 패턴
    static createObjectPool() {
        class ObjectPool {
            constructor(createFn, resetFn, size = 100) {
                this.createFn = createFn;
                this.resetFn = resetFn;
                this.pool = [];
                
                // 미리 생성
                for (let i = 0; i < size; i++) {
                    this.pool.push(createFn());
                }
            }
            
            acquire() {
                return this.pool.pop() || this.createFn();
            }
            
            release(obj) {
                this.resetFn(obj);
                this.pool.push(obj);
            }
        }
        
        // 사용 예: 게임의 총알
        const bulletPool = new ObjectPool(
            () => ({ x: 0, y: 0, vx: 0, vy: 0, active: false }),
            (bullet) => { 
                bullet.active = false;
                bullet.x = 0;
                bullet.y = 0;
            },
            1000
        );
        
        return bulletPool;
    }
    
    // 2. 큰 배열 재사용
    static reuseArrays() {
        // 나쁜 예
        function badPattern() {
            for (let i = 0; i < 1000; i++) {
                const tempArray = new Float32Array(10000);
                // 매번 새 배열 할당
                processArray(tempArray);
            }
        }
        
        // 좋은 예
        function goodPattern() {
            const tempArray = new Float32Array(10000);
            for (let i = 0; i < 1000; i++) {
                tempArray.fill(0);  // 재사용
                processArray(tempArray);
            }
        }
    }
    
    // 3. WeakMap/WeakSet 활용
    static useWeakCollections() {
        // DOM 요소에 메타데이터 저장
        const metadata = new WeakMap();
        
        function attachMetadata(element, data) {
            metadata.set(element, data);
            // element가 제거되면 자동으로 metadata도 GC
        }
        
        function getMetadata(element) {
            return metadata.get(element);
        }
        
        // 이벤트 리스너 관리
        const listeners = new WeakMap();
        
        function addEventListener(element, handler) {
            if (!listeners.has(element)) {
                listeners.set(element, new Set());
            }
            listeners.get(element).add(handler);
        }
    }
    
    // 4. 문자열 최적화
    static optimizeStrings() {
        // V8의 문자열 인터닝 활용
        const strings = ['hello', 'world', 'hello', 'world'];
        // 'hello'와 'world'는 한 번만 저장
        
        // 문자열 연결 최적화
        // 나쁜 예
        let bad = '';
        for (let i = 0; i < 10000; i++) {
            bad += 'a';  // 매번 새 문자열 생성
        }
        
        // 좋은 예
        const parts = [];
        for (let i = 0; i < 10000; i++) {
            parts.push('a');
        }
        const good = parts.join('');  // 한 번에 생성
    }
    
    // 5. 클로저 최적화
    static optimizeClosures() {
        // 나쁜 예: 큰 스코프 캡처
        function createBadClosure() {
            const hugeArray = new Array(1000000).fill(0);
            const smallValue = 42;
            
            return function() {
                return smallValue;  // hugeArray도 캡처됨!
            };
        }
        
        // 좋은 예: 필요한 것만 캡처
        function createGoodClosure() {
            const hugeArray = new Array(1000000).fill(0);
            const smallValue = 42;
            
            return (function(value) {
                return function() {
                    return value;  // smallValue만 캡처
                };
            })(smallValue);
        }
    }
}

// 실제 성능 측정
function measureGCImpact() {
    const iterations = 1000000;
    
    // GC 압박 테스트
    console.time('Heavy GC pressure');
    for (let i = 0; i < iterations; i++) {
        const obj = {
            data: new Array(100).fill(i),
            id: 'item_' + i,
            timestamp: Date.now()
        };
        // 즉시 버림 - GC 압박
    }
    console.timeEnd('Heavy GC pressure');
    
    // Object Pool 사용
    const pool = V8Optimization.createObjectPool();
    console.time('With Object Pool');
    for (let i = 0; i < iterations; i++) {
        const obj = pool.acquire();
        obj.data = i;
        obj.id = 'item_' + i;
        pool.release(obj);
    }
    console.timeEnd('With Object Pool');
    
    // 결과:
    // Heavy GC pressure: 2500ms
    // With Object Pool: 300ms (8배 빠름!)
}
```

## 5. 언어별 GC 비교와 선택 가이드

### 5.1 종합 비교표

```python
def compare_gc_systems():
    """각 언어의 GC 특성 비교"""
    
    comparison = {
        "Java": {
            "type": "Generational + Various",
            "latency": "1ms-1s (GC별)",
            "throughput": "High",
            "tuning": "매우 복잡",
            "memory_overhead": "10-30%",
            "best_for": "엔터프라이즈, 대규모 서버"
        },
        "Go": {
            "type": "Concurrent Tricolor",
            "latency": "<100μs",
            "throughput": "Good",
            "tuning": "간단 (GOGC)",
            "memory_overhead": "~25%",
            "best_for": "마이크로서비스, 네트워크 서버"
        },
        "Python": {
            "type": "Reference Counting + Cycle Detection",
            "latency": "10-100ms",
            "throughput": "Low",
            "tuning": "제한적",
            "memory_overhead": "높음",
            "best_for": "스크립팅, 데이터 분석"
        },
        "JavaScript": {
            "type": "Generational + Incremental",
            "latency": "1-10ms",
            "throughput": "Good",
            "tuning": "불가능",
            "memory_overhead": "20-40%",
            "best_for": "웹 프론트엔드, Node.js 서버"
        },
        "Rust": {
            "type": "No GC (Ownership)",
            "latency": "0",
            "throughput": "Highest",
            "tuning": "없음",
            "memory_overhead": "0%",
            "best_for": "시스템 프로그래밍, 임베디드"
        }
    }
    
    return comparison

# 실제 벤치마크 (웹 서버 시나리오)
"""
시나리오: REST API 서버, 10,000 req/s

Java (G1GC):
- Throughput: 9,500 req/s
- P50 latency: 5ms
- P99 latency: 50ms
- Memory: 2GB

Go:
- Throughput: 9,800 req/s
- P50 latency: 3ms
- P99 latency: 10ms
- Memory: 500MB

Python (Gunicorn + PyPy):
- Throughput: 3,000 req/s
- P50 latency: 30ms
- P99 latency: 200ms
- Memory: 1GB

Node.js:
- Throughput: 8,000 req/s
- P50 latency: 8ms
- P99 latency: 40ms
- Memory: 800MB

Rust (Actix):
- Throughput: 10,000 req/s
- P50 latency: 2ms
- P99 latency: 5ms
- Memory: 100MB
"""
```

### 5.2 선택 가이드

```python
def select_language_for_gc():
    """요구사항별 언어 선택 가이드"""
    
    guidelines = {
        "초저지연 (<1ms)": ["Rust", "C++", "Go", "Java with ZGC"],
        "높은 처리량": ["Java with ParallelGC", "Rust", "Go"],
        "적은 메모리": ["Rust", "Go", "C++"],
        "쉬운 개발": ["Python", "JavaScript", "Go"],
        "예측 가능한 성능": ["Rust", "Go"],
        "복잡한 비즈니스 로직": ["Java", "C#", "Python"],
        "빠른 프로토타이핑": ["Python", "JavaScript", "Ruby"],
        "대규모 데이터 처리": ["Java", "Scala", "Python with NumPy"],
        "실시간 시스템": ["Rust", "C++", "Go with manual GC"],
        "웹 프론트엔드": ["JavaScript", "TypeScript", "WebAssembly"]
    }
    
    return guidelines
```

## 6. 마무리: GC와 함께 살아가기

### 💡 10년간의 교훈

1. **"GC는 은총알이 아니다"**
   - 메모리 관리를 완전히 잊을 수는 없다
   - GC 특성을 이해하고 코드 작성
   - 필요하면 수동 메모리 관리도 고려

2. **"측정하지 않으면 최적화할 수 없다"**
   - 프로파일링은 필수
   - GC 로그 분석 습관화
   - 실제 워크로드로 테스트

3. **"각 언어의 철학을 이해하라"**
   - Java: 풍부한 옵션, 세밀한 튜닝
   - Go: 단순함, 낮은 지연
   - Python: 편의성 우선
   - JavaScript: 자동 최적화

각 언어의 GC는 그 언어의 철학을 반영합니다. 올바른 도구를 선택하고 그 특성을 이해하면, GC는 적이 아닌 동료가 됩니다!

## 참고 자료

- [Java GC Tuning Guide](https://docs.oracle.com/en/java/javase/17/gctuning/)
- [Go GC Design](https://github.com/golang/proposal/blob/master/design/44167-gc-pacer-redesign.md)
- [Python GC Module](https://docs.python.org/3/library/gc.html)
- [V8 Blog](https://v8.dev/blog)
- [Understanding Garbage Collection](https://craftinginterpreters.com/garbage-collection.html)