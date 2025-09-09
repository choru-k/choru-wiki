---
tags:
  - memory
  - jvm
  - garbage-collection
  - performance
  - java
  - kubernetes
---

# JVM 메모리 구조와 GC 튜닝 실전

## 들어가며

"JVM이 512MB 제한인데 왜 700MB를 사용하죠?", "G1GC와 ZGC 중 뭘 선택해야 하죠?", "Metaspace OOM은 왜 발생하죠?" JVM은 강력하지만 복잡합니다. 특히 Kubernetes 환경에서는 예상치 못한 문제가 발생합니다. 이 글에서는 JVM 메모리 구조를 완벽히 이해하고 실전 튜닝 방법을 알아봅니다.

## JVM 메모리 구조 완벽 이해

### 전체 메모리 맵

```
JVM Process Memory (실제 RSS):
┌─────────────────────────────────────────┐
│           Heap Memory                   │
│  ┌───────────────────────────────┐      │
│  │     Young Generation          │      │
│  │  ┌──────┬────────┬────────┐  │      │
│  │  │ Eden │  S0    │   S1   │  │      │ ← Minor GC 영역
│  │  │ 80MB │  10MB  │  10MB  │  │      │
│  │  └──────┴────────┴────────┘  │      │
│  ├───────────────────────────────┤      │
│  │     Old Generation            │      │ ← Major GC 영역
│  │     (300MB)                   │      │
│  └───────────────────────────────┘      │
├─────────────────────────────────────────┤
│           Non-Heap Memory               │
│  ┌───────────────────────────────┐      │
│  │  Metaspace (Class metadata)   │      │ ← 클래스, 메서드 정보
│  │  (64MB, 동적 증가)             │      │
│  ├───────────────────────────────┤      │
│  │  Code Cache (JIT compiled)    │      │ ← JIT 컴파일된 코드
│  │  (48MB)                       │      │
│  ├───────────────────────────────┤      │
│  │  Compressed Class Space       │      │ ← 압축된 클래스 포인터
│  │  (1GB 고정)                   │      │
│  └───────────────────────────────┘      │
├─────────────────────────────────────────┤
│           Native Memory                 │
│  ├─ Thread Stacks (1MB * N)            │ ← 각 스레드 스택
│  ├─ Direct ByteBuffers                 │ ← NIO 버퍼
│  ├─ JNI Code                           │ ← Native 라이브러리
│  ├─ GC Structures                      │ ← GC 메타데이터
│  └─ Symbol tables                      │ ← 심볼, 문자열 테이블
└─────────────────────────────────────────┘
```

### 실제 메모리 계산

```java
// 흔한 실수: Heap만 계산
// -Xmx512m 설정했는데 왜 700MB 사용?

public class MemoryCalculator {
    public static void main(String[] args) {
        // Heap
        long heap = Runtime.getRuntime().maxMemory();
        
        // Metaspace (JMX로 확인)
        long metaspace = ManagementFactory
            .getPlatformMXBeans(MemoryPoolMXBean.class)
            .stream()
            .filter(pool -> pool.getName().contains("Metaspace"))
            .mapToLong(pool -> pool.getUsage().getUsed())
            .sum();
        
        // Thread stacks
        int threads = Thread.activeCount();
        long threadStacks = threads * 1024 * 1024; // 1MB per thread
        
        // Direct memory
        long directMemory = sun.misc.VM.maxDirectMemory();
        
        System.out.println("Memory Breakdown:");
        System.out.println("Heap: " + heap / 1024 / 1024 + " MB");
        System.out.println("Metaspace: " + metaspace / 1024 / 1024 + " MB");
        System.out.println("Threads: " + threads + " * 1MB = " + 
                          threadStacks / 1024 / 1024 + " MB");
        System.out.println("Direct: " + directMemory / 1024 / 1024 + " MB");
        
        long total = heap + metaspace + threadStacks + directMemory;
        System.out.println("Minimum Total: " + total / 1024 / 1024 + " MB");
        // 실제로는 JVM 오버헤드로 더 많이 사용
    }
}
```

## Young Generation 동작 상세

### Eden과 Survivor 메커니즘

```
객체 생성과 이동:

1. 새 객체 생성 → Eden
┌──────┬────┬────┐
│ Eden │ S0 │ S1 │
│ ████ │    │    │ ← 새 객체들
└──────┴────┴────┘

2. Eden 가득 → Minor GC
┌──────┬────┬────┐
│ Eden │ S0 │ S1 │
│      │    │ ██ │ ← 살아남은 객체 S1로
└──────┴────┴────┘
        Age: 1

3. 다시 Eden 가득 → Minor GC
┌──────┬────┬────┐
│ Eden │ S0 │ S1 │
│      │ ██ │    │ ← S1→S0, Age 증가
└──────┴────┴────┘
        Age: 2

4. Age가 임계값(기본 15) 도달 → Old로 승격
```

### TLAB (Thread Local Allocation Buffer)

```java
// 각 스레드는 Eden에서 전용 버퍼 할당
// 동기화 없이 빠른 할당 가능

// TLAB 동작 (내부 구조)
class TLAB {
    Thread owner;
    byte[] buffer;      // Eden의 일부
    int top;           // 현재 위치
    int end;           // 버퍼 끝
    
    Object allocate(int size) {
        if (top + size <= end) {
            // Fast path: 동기화 없음
            Object obj = buffer[top];
            top += size;
            return obj;
        } else {
            // Slow path: 새 TLAB 요청
            return allocateNewTLAB(size);
        }
    }
}

// JVM 옵션
// -XX:+UseTLAB (기본 활성화)
// -XX:TLABSize=256k
// -XX:+ResizeTLAB (동적 크기 조정)
```

## Old Generation과 카드 테이블

### 세대 간 참조 문제

```
문제: Old → Young 참조를 어떻게 추적?

Old Generation          Young Generation
┌────────────┐         ┌────────────┐
│  Object A  │ ──────> │  Object B  │
│  (Age: 20) │         │  (Age: 1)  │
└────────────┘         └────────────┘

Minor GC 시 Old 전체를 스캔? → 너무 느림!
```

### Card Table 해결책

```
Card Table: Old를 512바이트 카드로 분할
┌─────────────────────────────────┐
│        Old Generation           │
│ ┌────┬────┬────┬────┬────┐    │
│ │Card│Card│Card│Card│Card│    │ ← 512B each
│ │ 0  │ 1  │ 2  │ 3  │ 4  │    │
│ └────┴────┴────┴────┴────┘    │
└─────────────────────────────────┘
         ↓
┌─────────────────────────────────┐
│        Card Table               │
│ [0][0][1][0][1]...              │ ← 1 = dirty (Young 참조)
└─────────────────────────────────┘

// Write Barrier: Old 객체 수정 시
oldObject.field = youngObject;
cardTable[address >> 9] = 1;  // Mark dirty

// Minor GC: Dirty 카드만 스캔
for (card in cardTable) {
    if (card == 1) {
        scanCard();  // 512B만 스캔
    }
}
```

## GC 알고리즘 비교

### Serial GC

```
특징: 단일 스레드, Stop-the-World
용도: 힙 < 100MB, 단일 CPU

동작:
────────────────────────────────
│ App Threads: ████──STOP──████ │
│ GC Thread:        ████        │
────────────────────────────────
```

### Parallel GC (처리량 우선)

```
특징: 다중 스레드 GC, 긴 STW
용도: 배치 처리, 처리량 중요

동작:
────────────────────────────────
│ App Threads: ████──STOP──████ │
│ GC Thread 1:      ██          │
│ GC Thread 2:      ██          │
│ GC Thread 3:      ██          │
────────────────────────────────
```

### G1GC (균형)

```
특징: Region 기반, 예측 가능한 Pause
용도: 힙 > 4GB, 지연시간 중요

Region 구조:
┌──────────────────────────────┐
│ □ □ ■ □ □ ■ □ □ □ □ □ □    │
│ ■ □ □ ■ □ □ ■ □ □ ■ □ □    │
│ □ □ □ □ ■ □ □ □ □ □ ■ □    │
│ □ ■ □ □ □ □ ■ □ □ □ □ □    │
└──────────────────────────────┘
□ = Eden  ■ = Old  ▨ = Survivor

// 목표 Pause Time 설정
-XX:MaxGCPauseMillis=200
```

### ZGC (초저지연)

```
특징: Colored Pointers, <10ms Pause
용도: 초대형 힙(TB), 실시간 서비스

Colored Pointer (64비트):
┌──────────────────────────────────────┐
│ Unused │ Color │ Address (44 bits)   │
│ 16bits │ 4bits │                     │
└──────────────────────────────────────┘

색상 의미:
- Marked0/Marked1: 마킹 상태
- Remapped: 재배치 상태
- Finalizable: 종료 가능
```

### Shenandoah (초저지연 대안)

```
특징: Brooks Pointers, 동시 압축
용도: ZGC 대안, RedHat 지원

Brooks Pointer:
┌─────────┐     ┌─────────┐
│ Object  │────>│ Forward │────> 실제 객체
│ Header  │     │ Pointer │
└─────────┘     └─────────┘
```

## 실전 GC 선택 가이드

### 워크로드별 추천

```java
// 1. 마이크로서비스 (힙 < 1GB)
java -XX:+UseSerialGC -Xmx512m MyApp

// 2. 웹 애플리케이션 (힙 2-8GB)
java -XX:+UseG1GC \
     -Xmx4g \
     -XX:MaxGCPauseMillis=200 \
     MyApp

// 3. 배치 처리 (처리량 우선)
java -XX:+UseParallelGC \
     -Xmx8g \
     -XX:ParallelGCThreads=8 \
     MyApp

// 4. 실시간 서비스 (초저지연)
java -XX:+UseZGC \        // JDK 15+
     -Xmx16g \
     -XX:ZUncommitDelay=300 \
     MyApp

// 5. 캐시 서버 (대용량 힙)
java -XX:+UseShenandoahGC \  // JDK 12+
     -Xmx64g \
     -XX:ShenandoahGCHeuristics=compact \
     MyApp
```

## Metaspace 이해와 튜닝

### Metaspace vs PermGen

```
JDK 7 (PermGen):                JDK 8+ (Metaspace):
┌──────────────┐                ┌──────────────┐
│ Heap Memory  │                │ Heap Memory  │
│ ┌──────────┐ │                │              │
│ │ PermGen  │ │                │  (No PermGen)│
│ └──────────┘ │                └──────────────┘
└──────────────┘                
                                ┌──────────────┐
                                │Native Memory │
                                │ ┌──────────┐ │
                                │ │Metaspace │ │
                                │ └──────────┘ │
                                └──────────────┘
```

### Metaspace 문제 해결

```java
// 문제: "java.lang.OutOfMemoryError: Metaspace"

// 원인 1: 클래스 로더 누수
public class ClassLoaderLeak {
    // 잘못된 패턴
    static List<ClassLoader> loaders = new ArrayList<>();
    
    void deployApp() {
        URLClassLoader loader = new URLClassLoader(...);
        loaders.add(loader);  // 클래스로더 유지 → Metaspace 누수
    }
}

// 원인 2: 동적 프록시/CGLib 과다 생성
@Component
public class DynamicProxyAbuse {
    void createProxy() {
        // 매번 새 프록시 클래스 생성
        Enhancer enhancer = new Enhancer();
        enhancer.setSuperclass(MyClass.class);
        enhancer.create();  // 새 클래스 → Metaspace 증가
    }
}

// 해결책
java -XX:MaxMetaspaceSize=256m \
     -XX:MetaspaceSize=128m \
     -XX:+UseStringDeduplication \  // 문자열 중복 제거
     -XX:+TraceClassLoading \       // 클래스 로딩 추적
     MyApp
```

## Kubernetes에서 JVM 튜닝

### 컨테이너 인식 설정

```dockerfile
FROM openjdk:11-jre-slim

# JVM이 컨테이너 제한 인식
ENV JAVA_OPTS="-XX:+UseContainerSupport \
                -XX:MaxRAMPercentage=75.0 \
                -XX:InitialRAMPercentage=50.0 \
                -XX:+PreferContainerQuotaForCPUCount"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

### 리소스 계산 예시

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: java-app
    image: myapp:latest
    resources:
      requests:
        memory: "1Gi"
        cpu: "1000m"
      limits:
        memory: "2Gi"
        cpu: "2000m"
    env:
    - name: JAVA_OPTS
      value: >-
        -Xmx1536m
        -Xms768m
        -XX:MaxMetaspaceSize=256m
        -XX:MaxDirectMemorySize=256m
        -XX:ReservedCodeCacheSize=64m
        -XX:+UseG1GC
        -XX:MaxGCPauseMillis=200
        -XX:ParallelGCThreads=2
        -XX:ConcGCThreads=1
```

```
메모리 계산:
Heap:           1536 MB
Metaspace:       256 MB
Direct:          256 MB
CodeCache:        64 MB
Thread(50개):     50 MB
JVM Overhead:    ~50 MB
─────────────────────────
Total:         ~2200 MB > 2Gi 제한!

→ OOM Kill 위험!
```

### JVM 모니터링 설정

```yaml
# Prometheus JMX Exporter 설정
apiVersion: v1
kind: ConfigMap
metadata:
  name: jmx-config
data:
  config.yaml: |
    lowercaseOutputName: true
    rules:
    - pattern: 'java.lang<type=Memory><HeapMemoryUsage>used'
      name: jvm_heap_used
    - pattern: 'java.lang<type=GarbageCollector, name=(.*)><>CollectionCount'
      name: jvm_gc_count
      labels:
        gc: "$1"
```

```java
// 애플리케이션에 JMX 노출
public static void main(String[] args) {
    // Micrometer 설정
    MeterRegistry registry = new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
    new JvmGcMetrics().bindTo(registry);
    new JvmMemoryMetrics().bindTo(registry);
    new JvmThreadMetrics().bindTo(registry);
    
    // 메트릭 엔드포인트
    // GET /actuator/prometheus
}
```

## 실전 트러블슈팅

### 케이스 1: 느린 응답 시간

```bash
# 증상: P99 레이턴시 급증

# 1. GC 로그 확인
kubectl exec $POD -- jcmd 1 GC.heap_info
kubectl exec $POD -- jcmd 1 VM.native_memory

# 2. GC 이벤트 분석
[Full GC (Ergonomics) 3.5G->2.1G(4G), 2.534 secs]
# → Full GC 2.5초! G1GC 튜닝 필요

# 3. 해결: Mixed GC 빈도 증가
-XX:InitiatingHeapOccupancyPercent=45  # 기본 45
-XX:G1MixedGCLiveThresholdPercent=65   # 기본 85
```

### 케이스 2: 메모리 누수

```java
// 힙 덤프 생성
jcmd &lt;pid&gt; GC.heap_dump /tmp/heap.hprof

// 또는 OOM 시 자동 덤프
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/dumps

// 분석 (Eclipse MAT)
// 1. Dominator Tree 확인
// 2. Leak Suspects 리포트
// 3. OQL 쿼리
SELECT * FROM java.util.HashMap$Node WHERE size > 10000
```

### 케이스 3: Native 메모리 누수

```bash
# Native Memory Tracking 활성화
-XX:NativeMemoryTracking=detail

# 실행 중 확인
jcmd &lt;pid&gt; VM.native_memory detail

# 출력 예시
Native Memory Tracking:
Total: reserved=2530MB, committed=1893MB
-                 Java Heap (reserved=1024MB, committed=1024MB)
-                     Class (reserved=1090MB, committed=58MB)
-                    Thread (reserved=53MB, committed=53MB)
-                      Code (reserved=251MB, committed=51MB)
-                        GC (reserved=61MB, committed=61MB)
-                  Internal (reserved=51MB, committed=51MB)
```

## GC 튜닝 체크리스트

### 1. 측정

```bash
# GC 빈도와 시간
jstat -gcutil &lt;pid&gt; 1000 10

# GC 원인
jcmd &lt;pid&gt; GC.heap_info

# 메모리 상태
jcmd &lt;pid&gt; VM.native_memory summary
```

### 2. 목표 설정

```
□ P99 레이턴시 < 100ms
□ GC Pause < 200ms
□ Throughput > 95%
□ Heap 사용률 < 80%
□ Metaspace 안정적
```

### 3. 튜닝 우선순위

```
1. 힙 크기 조정 (-Xmx, -Xms)
2. GC 알고리즘 선택
3. Generation 비율 조정
4. GC 스레드 수 조정
5. 세부 파라미터 튜닝
```

## 정리

JVM 메모리 관리는 복잡하지만 체계적입니다:

1. **전체 메모리 = Heap + Metaspace + Native**: Heap만 계산하면 OOM
2. **Young/Old 비율 중요**: 대부분 객체는 Young에서 죽어야 함
3. **GC 선택은 워크로드 따라**: 지연 vs 처리량 트레이드오프
4. **Metaspace는 Native 메모리**: 클래스로더 누수 주의
5. **컨테이너 환경 필수 설정**: UseContainerSupport + 명시적 제한
6. **모니터링 없이 튜닝 없음**: JMX, 힙 덤프, Native 추적 활용

이제 여러분은 프로세스 메모리부터 GC까지, 메모리 관리의 모든 것을 이해했습니다. 실전에서 이 지식을 활용해 안정적이고 효율적인 시스템을 구축하시기 바랍니다!

---

## 관련 문서

- [[garbage-collection-basics]] - 가비지 컬렉션 기초 개념
- [[process-memory-structure]] - 프로세스 메모리 구조
- [[language-memory-management]] - 언어별 메모리 관리 전략
- [[cgroup-container-memory]] - 컨테이너 메모리 격리

---

**관련 태그**: `#gc-tuning` `#heap-management` `#metaspace` `#performance-optimization`