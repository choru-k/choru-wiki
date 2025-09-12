---
tags:
  - memory
  - programming-languages
  - python
  - go
  - java
  - nodejs
  - kubernetes
---

# 언어별 메모리 관리 전략과 Kubernetes 환경의 함정

## 들어가며

"Python 앱이 메모리를 반환하지 않아요", "Go 앱이 갑자기 메모리를 2배로 사용해요", "Node.js가 heap 제한을 무시해요" 같은 문제를 겪어보셨나요? 각 언어는 고유한 메모리 관리 전략을 가지고 있고, 컨테이너 환경에서는 예상치 못한 동작을 합니다.

## Python: Reference Counting + Cycle Detector

Python은 Reference Counting을 기본으로 하고, 순환 참조를 위한 별도 GC를 가집니다.

### Python 메모리 구조

```text
Python Process Memory:
┌─────────────────────────────────┐
│      Python Objects             │
│  ┌──────────────────────┐       │
│  │  PyObject Headers     │       │ ← 모든 객체가 오버헤드 가짐
│  │  (ref_count, type)    │       │   최소 24바이트
│  └──────────────────────┘       │
├─────────────────────────────────┤
│      Object Arenas              │
│  ┌──────────────────────┐       │
│  │  512KB Arenas        │       │ ← Python이 OS에서 할당
│  │  ├─ 4KB Pools        │       │ ← 비슷한 크기 객체끼리
│  │  │  └─ 8B Blocks     │       │ ← 실제 객체 저장
│  └──────────────────────┘       │
├─────────────────────────────────┤
│      Free Lists                 │ ← 자주 쓰는 객체 재활용
│  ├─ Integer (-5 ~ 256)          │   (절대 해제 안 됨)
│  ├─ Empty tuple                 │
│  └─ Single char strings         │
└─────────────────────────────────┘
```

### Python의 메모리 반환 문제

```python
import tracemalloc
import gc

# 메모리 추적 시작
tracemalloc.start()

# 대량 메모리 할당
big_list = [i for i in range(10_000_000)]  # ~380MB
current, peak = tracemalloc.get_traced_memory()
print(f"Current: {current / 1024 / 1024:.1f} MB")

# 객체 삭제
del big_list
gc.collect()  # 강제 GC

# 메모리 확인
current, peak = tracemalloc.get_traced_memory()
print(f"After GC: {current / 1024 / 1024:.1f} MB")
# Python 내부: 거의 0MB
# OS에서 본 RSS: 여전히 300MB+!

# 이유: Python은 Arena를 OS에 잘 반환하지 않음
```

### Python GC 튜닝

```python
import gc

# GC 임계값 확인 (기본값)
print(gc.get_threshold())  # (700, 10, 10)
# 의미: 
# - 0세대: 700개 객체 생성시 GC
# - 1세대: 0세대 GC 10번마다
# - 2세대: 1세대 GC 10번마다

# 메모리 중요한 환경에서 조정
gc.set_threshold(500, 5, 5)  # 더 자주 GC

# GC 비활성화 (성능 중요한 구간)
gc.disable()
try:
    # 크리티컬 섹션
    process_realtime_data()
finally:
    gc.enable()
    gc.collect()  # 수동 GC

# 순환 참조 디버깅
gc.set_debug(gc.DEBUG_LEAK)
```

### Kubernetes에서 Python 함정

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: python-app
    image: python:3.11
    resources:
      limits:
        memory: "512Mi"
    env:
    - name: PYTHONMALLOC
      value: "malloc"  # 기본 pymalloc 대신 시스템 malloc
    - name: MALLOC_TRIM_THRESHOLD_
      value: "10485760"  # 10MB 이상 free 시 OS에 반환
```

```python
# 컨테이너에서 메모리 제한 인식
import resource
import os

def get_memory_limit():
    """cgroup 메모리 제한 읽기"""
    try:
        # cgroup v2
        with open('/sys/fs/cgroup/memory.max') as f:
            limit = f.read().strip()
            if limit != 'max':
                return int(limit)
    except:
        # cgroup v1
        with open('/sys/fs/cgroup/memory/memory.limit_in_bytes') as f:
            return int(f.read().strip())
    
    # 폴백: 시스템 메모리
    return os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')

# 메모리 제한의 80%를 넘으면 경고
limit = get_memory_limit()
current_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
if current_rss > limit * 0.8:
    gc.collect()  # 긴급 GC
    print("Warning: High memory usage!")
```

## Go: Concurrent Tri-color Mark & Sweep

Go는 저지연 동시 GC로 유명합니다.

### Go 메모리 구조

```text
Go Memory Layout:
┌─────────────────────────────────┐
│         mheap                   │ ← 전역 힙
│  ┌──────────────────────┐       │
│  │  Spans (8KB pages)   │       │
│  │  ├─ Free spans       │       │
│  │  └─ Allocated spans  │       │
│  └──────────────────────┘       │
├─────────────────────────────────┤
│      Per-P mcache              │ ← P(Processor)별 캐시
│  ┌──────────────────────┐       │
│  │  Tiny allocator      │       │ ← <16B 객체
│  │  Small size classes  │       │ ← 16B~32KB
│  └──────────────────────┘       │
├─────────────────────────────────┤
│      Stack Pool                 │ ← Goroutine 스택
│  ├─ 2KB stacks                  │
│  ├─ 4KB stacks                  │
│  └─ 8KB stacks...               │
└─────────────────────────────────┘
```

### Go GC 트리거 조건

```go
// GC는 다음 조건 중 하나로 트리거:
// 1. 힙이 목표 크기에 도달
// 2. 2분 경과 (강제)
// 3. runtime.GC() 호출

// GOGC 환경변수 (기본 100)
// 다음 GC 목표 = 현재 라이브 힙 * (1 + GOGC/100)

// 예시:
// 라이브 힙: 100MB, GOGC=100
// 다음 GC: 200MB에서 트리거

// 메모리 제한 설정 (Go 1.19+)
package main

import (
    "runtime/debug"
    "runtime"
)

func main() {
    // 메모리 제한 설정
    debug.SetMemoryLimit(512 * 1024 * 1024)  // 512MB
    
    // GC 통계 확인
    var m runtime.MemStats
    runtime.ReadMemStats(&m)
    
    fmt.Printf("Alloc: %d MB, ", m.Alloc / 1024 / 1024)
    fmt.Printf("TotalAlloc: %d MB, ", m.TotalAlloc / 1024 / 1024)
    fmt.Printf("Sys: %d MB, ", m.Sys / 1024 / 1024)
    fmt.Printf("NumGC: %d, ", m.NumGC)
    fmt.Printf("PauseNs: %v, ", m.PauseNs[(m.NumGC+255)%256])
}
```

### Go의 메모리 급증 현상

```go
// 문제: Go는 힙을 2배로 키우는 경향
type Data struct {
    values []byte
}

func problematic() {
    // 100MB 할당
    data := &Data{
        values: make([]byte, 100*1024*1024),
    }
    
    // GC 전: 메모리 100MB
    // GOGC=100이면 200MB에서 GC 예정
    
    // 추가 90MB 할당
    moreData := make([]byte, 90*1024*1024)
    
    // 아직 200MB 미달, GC 안 함
    // 실제 메모리: 190MB
    
    // 추가 20MB 할당
    evenMore := make([]byte, 20*1024*1024)
    
    // 210MB 도달! GC 트리거
    // GC 후 라이브: 110MB
    // 다음 GC 목표: 220MB
    
    // 메모리 사용: 110MB
    // OS에서 본 RSS: 210MB (아직 반환 안 함)
}

// 해결책: GOMEMLIMIT 사용
// GOMEMLIMIT=450MiB ./myapp
```

### Kubernetes에서 Go 최적화

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: go-app
    resources:
      requests:
        memory: "256Mi"
      limits:
        memory: "512Mi"
    env:
    - name: GOMEMLIMIT
      value: "450MiB"  # 리밋의 90%
    - name: GOGC
      value: "50"  # 더 자주 GC (기본 100)
    - name: GOMAXPROCS
      valueFrom:
        resourceFieldRef:
          resource: requests.cpu
```

## Java/JVM: 세대별 GC의 정석

JVM은 가장 정교한 GC를 가지고 있지만, 컨테이너 환경에서 함정이 많습니다.

### JVM 메모리 영역

```text
JVM Memory (Native + Heap):
┌─────────────────────────────────┐
│      Native Memory              │
│  ├─ Thread Stacks               │ ← 스레드당 1MB
│  ├─ Code Cache                  │ ← JIT 컴파일된 코드
│  ├─ Metaspace                   │ ← 클래스 메타데이터
│  ├─ Direct Buffers              │ ← NIO 버퍼
│  └─ JNI                         │ ← Native 라이브러리
├─────────────────────────────────┤
│      Heap Memory                │
│  ┌──────────────────────┐       │
│  │   Young Generation    │       │
│  │  ├─ Eden              │       │
│  │  ├─ Survivor 0        │       │
│  │  └─ Survivor 1        │       │
│  ├──────────────────────┤       │
│  │   Old Generation      │       │
│  └──────────────────────┘       │
└─────────────────────────────────┘

총 메모리 = Heap + Non-Heap + Native
```

### 컨테이너 인식 문제

```java
// 문제: JVM이 호스트 메모리를 봄
public class MemoryCheck {
    public static void main(String[] args) {
        long maxHeap = Runtime.getRuntime().maxMemory();
        System.out.println("Max heap: " + maxHeap / 1024 / 1024 + " MB");
        // 컨테이너 512MB 제한인데 8GB로 나옴!
    }
}
```

해결책:

```dockerfile
# JDK 8u191+, JDK 10+
FROM openjdk:11-jre-slim

# 자동 컨테이너 인식
CMD ["java", \
     "-XX:+UseContainerSupport", \
     "-XX:MaxRAMPercentage=75.0", \
     "-XX:InitialRAMPercentage=50.0", \
     "-jar", "app.jar"]

# 또는 명시적 설정
CMD ["java", \
     "-Xmx384m", \          # 512MB의 75%
     "-Xms256m", \          # 초기 힙
     "-XX:MaxMetaspaceSize=64m", \
     "-XX:MaxDirectMemorySize=64m", \
     "-jar", "app.jar"]
```

### JVM 메모리 계산

```bash
# 실제 메모리 사용량 계산
Total Memory = 
    Heap (Xmx)                     # 384MB
  + Metaspace                      # 64MB
  + CodeCache                      # 48MB
  + Thread Stacks (스레드수 * 1MB) # 50MB (50 스레드)
  + Direct Memory                  # 64MB
  + JVM Overhead                   # ~50MB
  = ~660MB > 512MB 컨테이너 제한!

# 결과: OOM Kill!
```

## Node.js: V8 힙과 Native 메모리

Node.js는 V8 엔진의 GC를 사용하며, Native 애드온이 추가 복잡성을 만듭니다.

### V8 메모리 구조

```text
V8 Heap Structure:
┌─────────────────────────────────┐
│      New Space (Young)          │ ← Scavenge GC
│  ├─ From Space                  │   매우 빠름
│  └─ To Space                    │   (Copying GC)
├─────────────────────────────────┤
│      Old Space                  │ ← Mark-Sweep-Compact
│  ├─ Old Pointer Space           │   느림
│  ├─ Old Data Space              │
│  ├─ Large Object Space          │ ← 큰 객체 (>1MB)
│  └─ Code Space                  │ ← JIT 코드
├─────────────────────────────────┤
│      Non-V8 Memory              │
│  ├─ Buffer Pool                 │ ← Node.js Buffers
│  └─ Native Addons               │ ← C++ 모듈
└─────────────────────────────────┘
```

### Node.js 메모리 제한

```javascript
// 기본 힙 제한 확인
const v8 = require('v8');
console.log(v8.getHeapStatistics());
// {
//   heap_size_limit: 2147483648,  // 2GB (64비트 시스템)
//   total_heap_size: 10485760,
//   used_heap_size: 5242880,
//   ...
// }

// 메모리 모니터링
const used = process.memoryUsage();
console.log({
    rss: `${used.rss / 1024 / 1024} MB`,        // 전체 RSS
    heapTotal: `${used.heapTotal / 1024 / 1024} MB`,  // V8 힙 할당
    heapUsed: `${used.heapUsed / 1024 / 1024} MB`,   // V8 힙 사용
    external: `${used.external / 1024 / 1024} MB`,    // C++ 객체
    arrayBuffers: `${used.arrayBuffers / 1024 / 1024} MB`
});

// GC 강제 실행 (--expose-gc 필요)
if (global.gc) {
    global.gc();
}
```

### Buffer와 메모리 누수

```javascript
// 문제: Buffer는 V8 힙 외부
const bigBuffer = Buffer.alloc(100 * 1024 * 1024);  // 100MB
// V8 heap: 거의 변화 없음
// RSS: +100MB

// 문제: 클로저로 인한 메모리 유지
function leakyFunction() {
    const hugeData = Buffer.alloc(50 * 1024 * 1024);
    
    return function() {
        // hugeData를 사용하지 않지만
        // 클로저 때문에 메모리에 유지됨
        console.log('Hello');
    };
}

const leak = leakyFunction();  // 50MB 누수!

// 해결: WeakMap/WeakSet 사용
const cache = new WeakMap();
let obj = { data: 'huge' };
cache.set(obj, bigBuffer);
obj = null;  // obj가 GC되면 bigBuffer도 GC 가능
```

### Kubernetes에서 Node.js 설정

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: node-app
    resources:
      limits:
        memory: "512Mi"
    command: ["node"]
    args:
      - "--max-old-space-size=400"  # V8 힙 제한 (MB)
      - "--max-semi-space-size=2"   # Young 크기
      - "--expose-gc"               # GC 노출
      - "app.js"
```

## 언어별 메모리 프로파일링

### Python: memory_profiler

```python
# pip install memory_profiler
from memory_profiler import profile

@profile  # 줄 단위 메모리 사용량
def my_func():
    a = [1] * (10 ** 6)
    b = [2] * (2 * 10 ** 7)
    del b
    return a

# 실행: python -m memory_profiler example.py
```

### Go: pprof

```go
import (
    _ "net/http/pprof"
    "net/http"
)

func main() {
    go func() {
        http.ListenAndServe("localhost:6060", nil)
    }()
    // 앱 로직
}

// 프로파일링
// go tool pprof http://localhost:6060/debug/pprof/heap
// go tool pprof -http=:8080 profile.pb.gz
```

### Java: JFR (Java Flight Recorder)

```bash
# JFR 시작
java -XX:StartFlightRecording=duration=60s,filename=recording.jfr MyApp

# 분석
jfr print --events GCHeapSummary recording.jfr
```

### Node.js: Chrome DevTools

```javascript
// --inspect 플래그로 실행
// node --inspect app.js

// Chrome에서 chrome://inspect 접속
// Memory 탭에서 Heap Snapshot
```

## 언어별 Best Practices

### 메모리 효율성 순위

```text
1. Rust/C++ (수동 관리)
   └─ 오버헤드 최소, 완벽한 제어

2. Go
   └─ 작은 GC 오버헤드, 빠른 반환

3. Java (JVM)
   └─ 큰 초기 오버헤드, 효율적 GC

4. Node.js
   └─ 중간 오버헤드, Buffer 주의

5. Python
   └─ 큰 객체 오버헤드, 느린 반환
```

### Kubernetes 리소스 설정 가이드

```yaml
# Python 앱
resources:
  requests:
    memory: "512Mi"  # 실제 사용량
  limits:
    memory: "768Mi"  # 여유 50% (반환 안 함)

# Go 앱
resources:
  requests:
    memory: "256Mi"
  limits:
    memory: "384Mi"  # 여유 50% (GOMEMLIMIT 필수)

# Java 앱
resources:
  requests:
    memory: "512Mi"
  limits:
    memory: "768Mi"  # Heap + Native 고려

# Node.js 앱
resources:
  requests:
    memory: "256Mi"
  limits:
    memory: "384Mi"  # Buffer 고려
```

## 정리

각 언어는 고유한 메모리 관리 특성을 가집니다:

1. **Python**: Arena 기반, OS에 잘 반환 안 함, 객체 오버헤드 큼
2. **Go**: 동시 GC, 힙 2배 증가 경향, GOMEMLIMIT 필수
3. **Java**: 정교한 GC, 큰 초기 오버헤드, 컨테이너 인식 필요
4. **Node.js**: V8 힙 + Native, Buffer 주의, 힙 제한 설정 필수
5. **모든 언어**: 컨테이너 메모리 제한 명시적 인식 필요

다음 글에서는 JVM의 메모리 구조와 GC를 더 자세히 다루겠습니다.

---

## 관련 문서

- [[jvm-memory-gc]] - JVM 메모리와 GC 상세
- [[garbage-collection-basics]] - 가비지 컬렉션 기초 이론
- [[cgroup-container-memory]] - 컨테이너 메모리 격리
- [[process-memory-structure]] - 프로세스 메모리 구조

---

**관련 태그**: `#memory-profiling` `#container-optimization` `#gc-tuning` `#resource-management`
