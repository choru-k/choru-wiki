---
tags:
  - memory
  - oom-killer
  - cgroup
  - linux
  - troubleshooting
  - kubernetes
---

# OOM Killer와 Cgroup 메모리 제한의 진실

## 들어가며

"memory.high와 memory.max의 차이가 뭐지?", "왜 메모리가 남아있는데 컨테이너가 죽었지?", "OOM Score는 어떻게 계산되는 거야?" 이런 질문들에 답하기 위해 Linux의 OOM 메커니즘과 cgroup 메모리 제한을 깊이 파헤쳐보겠습니다.

## memory.high vs memory.max: 소프트 vs 하드 리밋

많은 엔지니어들이 memory.high와 memory.max의 차이를 정확히 모릅니다. 이 둘은 완전히 다른 방식으로 동작합니다.

```
Memory Usage Timeline:
│
memory.max ────────────────── OOM Kill (즉시 죽임)
│                      ↑
memory.high ──────────────── Throttle + Reclaim (점진적 제한)
│                      ↑
│                    Current Usage
│
0 ──────────────────────────
```

### memory.high: 스로틀링과 메모리 회수

memory.high는 "소프트 리밋"으로, 이를 초과하면 프로세스를 즉시 죽이지 않고 점진적으로 제한합니다.

```bash
# cgroup v2 설정
echo "2G" > /sys/fs/cgroup/my-pod/memory.high  # 소프트 리밋
echo "3G" > /sys/fs/cgroup/my-pod/memory.max   # 하드 리밋
```

#### Phase 1: 공격적 메모리 회수 (memory.high 초과 시)

```c
// 커널의 동작 (단순화)
if (memory_usage > memory.high) {
    // 1. 메모리 회수 시도 (우선순위 순서)
    reclaim_page_cache();        // 깨끗한 페이지 먼저
    reclaim_dirty_pages();        // 더티 페이지 writeback 후 회수
    reclaim_anonymous_pages();    // 스왑 활성화 시 anonymous 페이지
    
    // 2. 회수 목표량
    reclaim_target = memory_usage - (memory.high * 0.9);
}
```

#### Phase 2: 프로세스 스로틀링

```c
// 프로세스가 메모리 할당 시 지연 발생
if (memory_usage > memory.high) {
    overage = memory_usage - memory.high;
    max_overage = memory.max - memory.high;
    
    // 초과량에 비례하여 지연 증가
    delay_ms = (overage / max_overage) * MAX_DELAY;
    sleep(delay_ms);  // 프로세스가 잠시 멈춤!
}
```

실제 동작 예시:
```bash
# 테스트 프로그램
$ cat test_memory.c
#include <stdlib.h>
#include <unistd.h>

int main() {
    while(1) {
        void* p = malloc(1024 * 1024);  // 1MB씩 할당
        memset(p, 0, 1024 * 1024);
        usleep(10000);  // 10ms 대기
    }
}

# memory.high = 100MB, memory.max = 200MB 설정 후 실행
# 100MB 초과 시: 할당 속도가 점점 느려짐
# 200MB 도달 시: OOM Kill
```

### memory.max: 즉시 OOM Kill

memory.max는 "하드 리밋"으로, 이를 초과하면 즉시 OOM Killer가 발동합니다.

```bash
# 모니터링으로 확인
$ cat /sys/fs/cgroup/my-pod/memory.events
high 142          # memory.high 초과 횟수
max 0            # memory.max 초과 횟수
oom 0            # OOM 발생 횟수
oom_kill 1       # 실제 프로세스 kill 횟수
```

## 메모리 회수 우선순위

커널이 메모리를 회수할 때의 우선순위를 이해하는 것이 중요합니다:

```
회수 우선순위 (쉬운 것부터):
┌─────────────────────────────────────┐
│ 1. Clean Page Cache                │
│    ├── 수정되지 않은 파일 페이지    │
│    └── 읽기 전용 매핑              │
├─────────────────────────────────────┤
│ 2. Dirty Page Cache                │
│    ├── 수정된 파일 페이지          │
│    └── 디스크에 먼저 써야 함       │
├─────────────────────────────────────┤
│ 3. Anonymous Memory                 │
│    ├── 힙/스택 페이지              │
│    └── 스왑 활성화 시에만 가능     │
├─────────────────────────────────────┤
│ 4. 회수 불가능                     │
│    ├── mlock된 페이지              │
│    ├── 커널 메모리                 │
│    └── Huge pages                  │
└─────────────────────────────────────┘
```

## OOM Killer 동작 원리

### OOM Score 계산

커널은 각 프로세스에 대해 "badness score"를 계산합니다:

```c
// 기본 점수 계산 (단순화)
oom_score = (process_rss + process_swap + process_page_tables) * 1000 / total_memory;

// oom_score_adj 적용 (-1000 ~ 1000)
final_score = oom_score + oom_score_adj;

// 특별한 경우
if (oom_score_adj == -1000) {
    // 절대 죽이지 않음
    return 0;
}

if (has_capability(CAP_SYS_ADMIN)) {
    // root 프로세스는 3% 보너스
    score = score * 97 / 100;
}
```

실제 확인:
```bash
# 현재 프로세스의 OOM 점수 확인
$ cat /proc/$$/oom_score
43  # 0-1000 사이 값

# OOM 조정값 확인
$ cat /proc/$$/oom_score_adj
0   # -1000 ~ 1000

# 중요 프로세스 보호
$ sudo echo -500 > /proc/$(pidof mysqld)/oom_score_adj
```

### Kubernetes Pod QoS와 OOM Score

Kubernetes는 Pod QoS 클래스에 따라 OOM Score를 자동 설정합니다:

```go
// Kubernetes의 OOM Score 계산 로직
func GetContainerOOMScoreAdjust(pod *v1.Pod, container *v1.Container) int {
    switch pod.Status.QOSClass {
    case v1.PodQOSGuaranteed:
        // Guaranteed: -998 (거의 안 죽음)
        return -998
    
    case v1.PodQOSBestEffort:
        // BestEffort: 1000 (가장 먼저 죽음)
        return 1000
    
    case v1.PodQOSBurstable:
        // Burstable: request 비율에 따라 계산
        memoryRequest := container.Resources.Requests.Memory()
        machineMemory := node.Status.Capacity.Memory()
        
        // score = 1000 - (1000 * request / nodeCapacity)
        score := 1000 - int(1000 * memoryRequest / machineMemory)
        return min(max(score, 2), 999)
    }
}
```

실제 Pod 설정과 OOM Score:

```yaml
# Guaranteed Pod (request == limit)
apiVersion: v1
kind: Pod
spec:
  containers:
  - resources:
      requests:
        memory: "1Gi"
      limits:
        memory: "1Gi"
# OOM Score: -998 (마지막에 죽음)

# Burstable Pod (request < limit)
  - resources:
      requests:
        memory: "500Mi"
      limits:
        memory: "1Gi"
# OOM Score: ~500 (중간 우선순위)

# BestEffort Pod (no requests/limits)
  - resources: {}
# OOM Score: 1000 (첫 번째로 죽음)
```

## Memory Cgroup 계층 구조

### cgroup v2의 메모리 계산

Cgroup은 다양한 메모리 타입을 추적합니다:

```
Cgroup Memory Usage 포함 항목:
┌─────────────────────────────────────┐
│ 1. Anonymous Memory (RSS)           │ ← 앱의 힙/스택
│ 2. Page Cache (File-backed)         │ ← 파일 I/O 버퍼
│ 3. Kernel Memory (옵션)             │ ← 커널 객체
│ 4. Tmpfs/Shared Memory              │ ← /dev/shm, tmpfs
│ 5. Socket Memory Buffers            │ ← 네트워크 버퍼
└─────────────────────────────────────┘
```

실제 확인:
```bash
# cgroup v2 메모리 상태
$ cat /sys/fs/cgroup/my-app/memory.stat
anon 1073741824              # 1GB anonymous 메모리
file 2147483648              # 2GB file cache
kernel_stack 8388608         # 8MB 커널 스택
pagetables 4194304           # 4MB 페이지 테이블
sock 1048576                 # 1MB 소켓 버퍼

# 총 사용량 = anon + file + kernel + sock
```

### 계층적 메모리 보호

cgroup v2는 계층적 메모리 보호를 제공합니다:

```bash
# 메모리 보호 설정
/sys/fs/cgroup/
├── my-app/
│   ├── memory.min: 1G    # 최소 보장 (절대 회수 안 함)
│   ├── memory.low: 2G    # 소프트 보호 (압력 시에만 회수)
│   ├── memory.high: 3G   # 소프트 리밋 (스로틀링)
│   ├── memory.max: 4G    # 하드 리밋 (OOM)
│   └── memory.current: 2.5G  # 현재 사용량
```

```
메모리 압력 시 회수 순서:
1. memory.low 이하: 보호됨 (회수 안 함)
2. memory.low ~ memory.high: 보호 약함 (필요시 회수)
3. memory.high 이상: 적극적 회수 + 스로틀링
4. memory.max 도달: OOM Kill
```

## OOM 디버깅 실전

### dmesg로 OOM 원인 분석

```bash
$ dmesg | grep -A 20 "Out of memory"

Out of memory: Killed process 12345 (java) total-vm:8456932kB, anon-rss:7234560kB, file-rss:0kB
memory: usage 8388608kB, limit 8388608kB, failcnt 142
memory+swap: usage 8388608kB, limit 9437184kB, failcnt 0
kmem: usage 45236kB, limit 9007199254740988kB, failcnt 0
Memory cgroup stats for /kubepods/pod-xxx:
anon 7234560000
file 0
kernel_stack 163840
pagetables 3145728
```

해석:
- `total-vm`: 가상 메모리 크기 (실제 사용량 아님)
- `anon-rss`: 실제 anonymous 메모리 사용량
- `file-rss`: 파일 백업 메모리 (보통 0)
- `failcnt`: 메모리 할당 실패 횟수

### memory.pressure로 사전 감지

```bash
# PSI (Pressure Stall Information) 확인
$ cat /sys/fs/cgroup/my-app/memory.pressure
some avg10=12.34 avg60=8.56 avg300=5.23 total=1234567
full avg10=5.67 avg60=3.45 avg300=2.34 total=567890

# some: 일부 태스크가 메모리 대기
# full: 모든 태스크가 메모리 대기
# avg10: 최근 10초 평균 (%)
```

Alert 설정:
```yaml
# Prometheus alert
- alert: HighMemoryPressure
  expr: |
    rate(cgroup_memory_pressure_seconds_total[5m]) > 0.1
  annotations:
    summary: "Memory pressure high for {{ $labels.pod }}"
```

## 실전 OOM 방지 전략

### 1. 데이터베이스 보호

```bash
# MySQL 보호 설정
$ cat /etc/systemd/system/mysql.service.d/oom.conf
[Service]
OOMScoreAdjust=-500
MemoryMax=8G
MemoryHigh=6G

# PostgreSQL 보호
$ echo -500 > /proc/$(pidof postgres)/oom_score_adj
```

### 2. 멀티테넌트 격리

```bash
# 테넌트별 cgroup 구성
/sys/fs/cgroup/tenants/
├── tenant-a/
│   ├── memory.max: 4G
│   ├── memory.low: 2G      # 최소 보장
│   └── memory.oom.group: 1  # 그룹 단위 OOM
└── tenant-b/
    ├── memory.max: 8G
    ├── memory.low: 4G
    └── memory.oom.group: 1
```

memory.oom.group 설정 시, OOM 발생하면 전체 그룹이 함께 종료되어 부분 실패를 방지합니다.

### 3. 조기 OOM 감지 (systemd-oomd)

```ini
# /etc/systemd/oomd.conf
[OOM]
DefaultMemoryPressureLimitPercent=60%
DefaultMemoryPressureDurationSec=20s

# 메모리 압력이 20초 동안 60% 이상이면 
# OOM Score가 높은 프로세스부터 종료
```

### 4. Kubernetes 리소스 전략

```yaml
# 안정적인 워크로드
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    resources:
      requests:
        memory: "1Gi"
      limits:
        memory: "1Gi"  # Guaranteed QoS
        
# 버스트 허용 워크로드
  - name: batch
    resources:
      requests:
        memory: "500Mi"
      limits:
        memory: "2Gi"  # 4배 버스트 허용
```

## 프로덕션 사례: Facebook의 oomd

Facebook은 자체 개발한 oomd로 OOM 문제를 해결했습니다:

```json
{
  "memory_pressure": {
    "threshold": "60%",
    "duration": "10s"
  },
  "swap_usage": {
    "threshold": "90%"
  },
  "io_pressure": {
    "threshold": "80%",
    "duration": "30s"
  },
  "workload_protection": {
    "critical_services": ["mysql", "redis"],
    "oom_score_adj": -500
  }
}
```

결과:
- 서버 재부팅: 일일 5% → 0.5%
- 용량 활용도: 10% 증가
- 서비스 안정성: 대폭 개선

## 실전 체크리스트

### 메모리 문제 발생 시

1. **현재 상태 확인**
```bash
# cgroup 메모리 상태
cat /sys/fs/cgroup/*/memory.current
cat /sys/fs/cgroup/*/memory.stat

# 시스템 전체 메모리
free -h
vmstat 1
```

2. **압력 확인**
```bash
# PSI 확인
cat /proc/pressure/memory
cat /sys/fs/cgroup/*/memory.pressure
```

3. **OOM 위험도 확인**
```bash
# OOM Score 높은 프로세스 찾기
for pid in $(ls /proc | grep '^[0-9]'); do 
    if [ -r /proc/$pid/oom_score ]; then
        echo "$pid $(cat /proc/$pid/oom_score) $(cat /proc/$pid/comm)"
    fi
done | sort -nrk2 | head -10
```

4. **임시 조치**
```bash
# 중요 프로세스 보호
echo -500 > /proc/&lt;important-pid&gt;/oom_score_adj

# 불필요한 프로세스 우선 종료 대상으로
echo 500 > /proc/&lt;unimportant-pid&gt;/oom_score_adj
```

## 정리

OOM과 메모리 제한을 제대로 이해하면 안정적인 시스템 운영이 가능합니다:

1. **memory.high는 스로틀링**, memory.max는 즉시 OOM
2. **메모리 회수는 우선순위**가 있음 (clean → dirty → anonymous)
3. **OOM Score는 QoS와 연동**되어 자동 계산
4. **PSI로 사전에 압력 감지** 가능
5. **계층적 보호로 중요 워크로드 보호**

다음 글에서는 이러한 메모리 압력을 측정하는 PSI에 대해 자세히 알아보겠습니다.

---

## 관련 문서

- [[psi-monitoring]] - PSI를 통한 메모리 압력 실시간 모니터링
- [[cgroup-container-memory]] - Cgroup과 컨테이너 메모리 격리
- [[page-cache]] - Page Cache와 메모리 회수
- [[process-memory-structure]] - 프로세스 메모리 구조

---

**관련 태그**: `#memory-limits` `#system-stability` `#troubleshooting` `#process-management`