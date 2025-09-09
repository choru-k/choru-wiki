# 가비지 컬렉션 기초: 왜 메모리를 자동으로 관리하는가?

**Tags:** `#memory` `#garbage-collection` `#automation` `#performance` `#algorithms`

## 들어가며

"GC가 멈춰서 서비스가 응답하지 않아요!", "메모리는 충분한데 왜 GC가 계속 돌아요?", "Reference Counting과 Tracing GC의 차이가 뭐죠?" DevOps/SRE로서 이런 문제를 해결하려면 GC의 기본 원리를 이해해야 합니다.

## 수동 메모리 관리의 문제점

C/C++처럼 수동으로 메모리를 관리하면 무엇이 문제일까요?

```c
// 문제 1: Memory Leak
void process_data() {
    char* buffer = malloc(1024);
    // ... 처리 ...
    // free(buffer) 빼먹음! → 메모리 누수
}

// 문제 2: Use After Free
char* get_data() {
    char buffer[100];
    sprintf(buffer, "data");
    return buffer;  // 스택 메모리 반환! → 크래시
}

// 문제 3: Double Free
void cleanup(char* ptr) {
    free(ptr);
    // ... 다른 로직 ...
    free(ptr);  // 이미 해제된 메모리! → 크래시
}

// 문제 4: Dangling Pointer
Object* obj = create_object();
Object* ref = obj;
destroy_object(obj);
ref->method();  // ref는 여전히 죽은 객체 가리킴! → 크래시
```

이런 문제들이 프로덕션에서 발생하면:
- **메모리 누수**: 서버가 점진적으로 느려지다가 OOM
- **세그멘테이션 폴트**: 즉시 크래시
- **보안 취약점**: 해제된 메모리 악용 가능

## GC의 핵심: 도달 가능성(Reachability)

GC의 핵심 아이디어는 간단합니다: **"도달할 수 없는 객체는 쓰레기다"**

```
GC Root부터 시작한 객체 그래프:
┌─────────────────────────────────────────┐
│           GC Roots                      │
│  ┌──────┐  ┌──────┐  ┌──────┐         │
│  │Stack │  │Static│  │Thread│         │
│  └──┬───┘  └──┬───┘  └──┬───┘         │
│     │         │         │              │
├─────┼─────────┼─────────┼──────────────┤
│     ▼         ▼         ▼              │
│   [Obj A]──>[Obj B]   [Obj C]          │ ← 도달 가능 (살아있음)
│     │         │                        │
│     ▼         ▼                        │
│   [Obj D]   [Obj E]                    │
│                                        │
│   [Obj X]──>[Obj Y]                    │ ← 도달 불가능 (쓰레기)
│        ↑_______|                       │
│       (순환 참조)                       │
└─────────────────────────────────────────┘
```

## Reference Counting vs Tracing GC

### Reference Counting (참조 카운팅)

각 객체가 참조되는 횟수를 추적합니다:

```python
# Python의 Reference Counting 동작 (단순화)
class Object:
    def __init__(self):
        self.ref_count = 0
        
    def add_reference(self):
        self.ref_count += 1
        
    def remove_reference(self):
        self.ref_count -= 1
        if self.ref_count == 0:
            self.deallocate()  # 즉시 해제!

# 실제 동작
obj = Object()       # ref_count = 1
another = obj        # ref_count = 2
another = None       # ref_count = 1
obj = None          # ref_count = 0 → 즉시 해제
```

**장점:**

- 즉시 해제 (메모리 효율적)
- 예측 가능한 동작
- Stop-the-World 없음

**단점:**

- 순환 참조 처리 불가
- 참조 카운트 업데이트 오버헤드
- 멀티스레드 환경에서 동기화 필요

### 순환 참조 문제

```python
# Reference Counting의 치명적 약점
class Node:
    def __init__(self):
        self.next = None

# 순환 참조 생성
a = Node()  # a.ref_count = 1
b = Node()  # b.ref_count = 1
a.next = b  # b.ref_count = 2
b.next = a  # a.ref_count = 2

# 외부 참조 제거
a = None    # a.ref_count = 1 (b.next가 여전히 참조)
b = None    # b.ref_count = 1 (a.next가 여전히 참조)

# 메모리 누수! 둘 다 ref_count > 0이지만 도달 불가능
```

### Tracing GC (추적 GC)

Root에서 시작해 도달 가능한 객체를 찾습니다:

```
Mark & Sweep 알고리즘:

Phase 1: Mark (표시)
┌────────────────────────────────┐
│ 1. GC Root에서 시작            │
│ 2. 도달 가능한 모든 객체 표시   │
│ 3. 재귀적으로 참조 따라가기     │
└────────────────────────────────┘
                ↓
Phase 2: Sweep (청소)
┌────────────────────────────────┐
│ 1. 힙 전체 스캔                │
│ 2. 표시 안 된 객체 해제         │
│ 3. 메모리 반환                 │
└────────────────────────────────┘
```

## Stop-the-World (STW)

GC의 가장 큰 문제는 STW입니다:

```
일반 실행:
│─────────────────────────────────────│
│ App Thread 1: ████████████████████  │
│ App Thread 2: ████████████████████  │
│ App Thread 3: ████████████████████  │
└─────────────────────────────────────┘

STW 발생:
│─────────────────────────────────────│
│ App Thread 1: ████──STOP──█████████ │
│ App Thread 2: ████──STOP──█████████ │
│ App Thread 3: ████──STOP──█████████ │
│ GC Thread:         ██████           │
└─────────────────────────────────────┘
                    ↑
                STW Pause
                (모든 앱 정지!)
```

### STW가 필요한 이유

```java
// GC 실행 중 객체 그래프가 변경되면?
class Problem {
    Object a = new Object();
    Object b = new Object();
    
    // Thread 1: GC가 a를 마킹 중
    // Thread 2: 동시에 실행
    void concurrent() {
        a = null;     // GC가 마킹한 객체 제거
        b = new Object(); // 새 객체 생성
        b.ref = a;    // 이미 null!
    }
}
// 결과: 일관성 깨짐, 살아있는 객체 해제 가능!
```

## Generational GC (세대별 GC)

대부분의 객체는 금방 죽는다는 관찰에 기반합니다:

```
객체 수명 분포:
│
│ 많음 ┤ ▓▓▓▓▓▓▓▓▓
│      │ ▓▓▓▓▓
│      │ ▓▓▓
│      │ ▓▓
│      │ ▓
│ 적음 └────────────────→
        짧음        긴 수명

결론: "대부분 객체는 Young에서 죽는다"
```

### 세대 구분

```
Heap Memory:
┌──────────────────────────────────────┐
│          Young Generation            │
│  ┌──────┬──────┬──────────────┐     │
│  │ Eden │  S0  │      S1       │     │ ← 자주 GC (Minor GC)
│  └──────┴──────┴──────────────┘     │
├──────────────────────────────────────┤
│          Old Generation              │ ← 가끔 GC (Major GC)
│  ┌──────────────────────────────┐   │
│  │    Long-lived Objects        │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

### Minor GC 동작

```
Step 1: Eden 가득 참
┌─────┬────┬────┐
│Eden │ S0 │ S1 │
│ ███ │    │    │
└─────┴────┴────┘

Step 2: Minor GC 실행 (Eden + S0 → S1)
┌─────┬────┬────┐
│Eden │ S0 │ S1 │
│     │    │ █  │ ← 살아남은 객체만
└─────┴────┴────┘

Step 3: 다음 Minor GC (Eden + S1 → S0)
┌─────┬────┬────┐
│Eden │ S0 │ S1 │
│     │ █  │    │ ← Survivor 교대
└─────┴────┴────┘

Step 4: Age 임계값 도달 → Old로 승격
```

## GC 튜닝의 핵심 메트릭

### 1. Throughput (처리량)

```
Throughput = Application Time / Total Time
          = Application Time / (Application Time + GC Time)

예시:
- 1시간 중 GC가 3분 (180초)
- Throughput = 3420/3600 = 95%
- 5%의 시간을 GC에 사용
```

### 2. Latency (지연시간)

```
GC Pause Distribution:
┌────────────────────────────────┐
│ P50:   10ms                   │
│ P95:   50ms                   │
│ P99:   200ms                  │
│ P99.9: 2000ms  ← 문제!        │
└────────────────────────────────┘

목표: P99.9도 SLA 이내로 유지
```

### 3. Footprint (메모리 사용량)

```
실제 사용 vs 할당:
┌────────────────────────────────┐
│ Heap Reserved:     4GB         │
│ Heap Committed:    3GB         │
│ Heap Used:         2GB         │
│ ├─ Live Objects:   1.5GB       │
│ └─ Garbage:        0.5GB       │
└────────────────────────────────┘
```

## Concurrent GC 전략

최신 GC들은 STW를 최소화하려 노력합니다:

```
Traditional GC (전체 STW):
│──────────────────────────────────│
│ App:  ████──STOP───████████████  │
│ GC:        █████                 │
└──────────────────────────────────┘

Concurrent GC (부분 동시 실행):
│──────────────────────────────────│
│ App:  ████─┬─██████████─┬─█████  │
│ GC:        └─█████████──┘        │
└──────────────────────────────────┘
            Initial  Concurrent  Final
            Mark     Mark        Mark
            (STW)    (동시)      (STW)
```

### Tri-color Marking

동시 마킹을 위한 알고리즘:

```
색상 의미:
⚫ Black: 완전히 스캔됨 (자식까지 모두 방문)
⚪ Gray:  방문했지만 자식은 아직 (작업 큐에 있음)
⚪ White: 아직 방문 안 함 (잠재적 쓰레기)

마킹 진행:
초기:        중간:         완료:
  ⚪           ⚫            ⚫
 ╱ ╲         ╱ ╲          ╱ ╲
⚪   ⚪      ⚪   ⚫        ⚫   ⚫
│           │             │
⚪           ⚪             ⚫

White 객체 = 쓰레기로 수집
```

## 실전: GC 문제 진단

### 1. GC 로그 분석

```bash
# JVM GC 로그 활성화
java -Xlog:gc*:file=gc.log:time,uptime,level,tags \
     -XX:+UseG1GC \
     -Xmx4g \
     MyApp

# 로그 예시
[2.345s][info][gc] GC(12) Pause Young (Normal) 256M->32M(512M) 15.234ms
#        시간  타입  GC번호  원인        전→후(전체)    소요시간
```

### 2. 메모리 누수 vs 메모리 부족

```python
# 메모리 누수 패턴
def memory_leak():
    cache = []
    while True:
        # 계속 추가만 하고 제거 안 함
        cache.append(create_large_object())
        # GC가 아무리 돌아도 cache가 살아있음

# 메모리 부족 패턴
def memory_hungry():
    # 실제로 모든 데이터가 필요
    dataset = load_huge_dataset()  # 10GB
    model = train_model(dataset)   # +5GB
    # 단순히 메모리가 더 필요한 상황
```

### 3. GC 압력 징후

```bash
# 높은 GC 빈도
$ jstat -gcutil &lt;pid&gt; 1000
S0     S1     E      O      M     YGC     YGCT    FGC    FGCT
0.00  100.00  85.43  95.67  98.12  1523   45.234   89    125.45
# YGC가 빠르게 증가 = Minor GC 빈번
# FGC 증가 = Major GC 빈번 (위험!)

# 컨테이너 환경에서
$ kubectl exec &lt;pod&gt; -- jcmd 1 GC.heap_info
```

## Kubernetes 환경에서의 GC 고려사항

### 1. 컨테이너 메모리 제한 인식

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    resources:
      requests:
        memory: "1Gi"
      limits:
        memory: "2Gi"  # GC는 이 값을 알아야 함
```

각 언어별 대응:
```bash
# Java (JDK 10+)
java -XX:MaxRAMPercentage=75.0 MyApp

# Go
GOMEMLIMIT=1500MiB ./myapp

# Node.js
node --max-old-space-size=1536 app.js
```

### 2. CPU 스로틀링과 GC

```
문제: GC는 CPU를 많이 사용 → 스로틀링 → GC 더 느림 → 악순환

CPU Limit 미설정:          CPU Limit 설정:
┌──────────────┐          ┌──────────────┐
│ GC: 4 cores  │          │ GC: 0.5 core │
│ Time: 100ms  │          │ Time: 800ms  │
└──────────────┘          └──────────────┘
```

## GC 선택 가이드

### 워크로드별 추천

```
1. 짧은 지연 중요 (실시간 서비스):
   → ZGC, Shenandoah (Java)
   → Go (기본 GC가 저지연)

2. 높은 처리량 중요 (배치 처리):
   → G1GC, Parallel GC (Java)
   → 수동 GC 트리거 (Python)

3. 메모리 효율 중요 (제한된 환경):
   → Serial GC (Java)
   → Reference Counting (Python)

4. 예측 가능성 중요:
   → Epsilon GC (No-Op GC)
   → Manual Memory Management (Rust)
```

## 정리

GC는 메모리 관리를 자동화하지만 공짜는 아닙니다:

1. **도달 가능성이 핵심**: Root에서 도달할 수 없으면 쓰레기
2. **Reference Counting vs Tracing**: 각각 장단점 존재
3. **STW는 불가피**: 하지만 최소화 가능
4. **Generational 가정**: 대부분 객체는 금방 죽는다
5. **튜닝의 3요소**: Throughput, Latency, Footprint
6. **컨테이너 환경 주의**: 메모리/CPU 제한 인식 필수

다음 글에서는 각 언어별 GC 특성과 Kubernetes 환경에서의 실전 튜닝을 다루겠습니다.

---

## 관련 문서

- [[jvm-memory-gc]] - JVM의 구체적인 GC 구현
- [[language-memory-management]] - 언어별 메모리 관리 전략
- [[process-memory-structure]] - 프로세스 메모리 구조
- [[page-cache]] - 시스템 레벨 메모리 캐싱

---

**관련 태그**: `#reference-counting` `#mark-and-sweep` `#generational-gc` `#stop-the-world`