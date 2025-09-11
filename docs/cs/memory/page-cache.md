---
tags:
  - memory
  - page-cache
  - kubernetes
  - linux
  - troubleshooting
  - performance
---

# Page Cache 동작 원리와 Kubernetes 환경의 함정

## 들어가며

"왜 메모리 사용량이 90%인데 애플리케이션은 정상 동작하지?", "컨테이너가 갑자기 OOM으로 죽었는데 메모리 여유가 있었는데?" 같은 의문을 가져보셨다면, Page Cache를 제대로 이해하지 못한 것입니다. 특히 Kubernetes 환경에서 Page Cache는 예상치 못한 문제를 일으킬 수 있습니다.

## Page Cache란 무엇인가?

Page Cache는 Linux 커널이 디스크 I/O를 최적화하기 위해 사용하는 메모리 캐시입니다. 한 번 읽은 파일 데이터를 메모리에 보관하여, 다시 읽을 때 디스크 접근 없이 메모리에서 직접 제공합니다.

```bash
# Page Cache 동작 확인
$ free -h
              total        used        free      shared  buff/cache   available
Mem:           15Gi       3.2Gi       1.8Gi       520Mi       10Gi        11Gi

# buff/cache 10GB = 대부분 Page Cache
# available 11GB = 실제 사용 가능한 메모리 (Page Cache 포함)
```

## Page Cache vs Direct I/O

대부분의 애플리케이션은 Page Cache를 통해 파일을 읽지만, 데이터베이스는 종종 Direct I/O를 사용합니다:

```
Normal Read (Page Cache 사용):
┌──────┐      ┌─────────────┐      ┌────────────┐
│ Disk │ ───> │ Page Cache  │ ───> │ User Space │
└──────┘      │ (stays here)│      │   (copy)   │
              └─────────────┘      └────────────┘
              Kernel Space

Direct I/O Read (Page Cache 우회):
┌──────┐      ┌─────────────┐      ┌────────────┐
│ Disk │ ───> │ Kernel Buffer│ ───> │ User Space │
└──────┘      │ (temporary) │      │  (direct)  │
              └─────────────┘      └────────────┘
              Not cached!
```

### 데이터베이스별 Page Cache 전략

각 데이터베이스는 Page Cache에 대해 다른 전략을 사용합니다:

**PostgreSQL**: OS Page Cache를 적극 활용

```bash
# PostgreSQL은 Page Cache에 의존
shared_buffers = 8GB        # 자체 버퍼는 RAM의 25%
effective_cache_size = 24GB # OS Page Cache 고려한 설정
```

**MySQL InnoDB**: Direct I/O로 Page Cache 우회

```ini
[mysqld]
innodb_flush_method = O_DIRECT  # Page Cache 우회
innodb_buffer_pool_size = 24GB  # 자체 버퍼 풀 사용 (RAM의 70-80%)
```

**Cassandra**: JVM 힙 외부 메모리로 자체 캐시 구현

```java
// Cassandra는 off-heap memory 사용
ByteBuffer buffer = ByteBuffer.allocateDirect(size);  // Direct memory
// Page Cache 최소 사용, JVM에서 자체 관리
```

## Kubernetes의 Shared Page Cache

Kubernetes 노드에서 Page Cache는 **모든 Pod가 공유**합니다. 이는 성능상 이점이 있지만, 예상치 못한 문제를 일으킬 수 있습니다.

### 공유 메커니즘

```
Kubernetes Node:
┌─────────────────────────────────────────┐
│              Kernel Space               │
│  ┌─────────────────────────────────┐   │
│  │     Shared Page Cache           │   │
│  │  ┌────────────────────────┐     │   │
│  │  │ file1.txt cached pages │     │   │ ← 모든 Pod가 공유!
│  │  └────────────────────────┘     │   │
│  └─────────────────────────────────┘   │
├─────────────────────────────────────────┤
│ Pod A         │ Pod B         │ Pod C   │
│ Reads file1   │ Reads file1   │ Writes  │
│ (uses cache)  │ (SAME cache!) │ file1   │
└─────────────────────────────────────────┘
```

커널은 inode 번호로 파일을 식별합니다:

```
Pod A: /app-data/file.txt     → inode 12345
Pod B: /different/file.txt    → inode 12345 (같은 파일!)
Pod C: /another/file.txt      → inode 67890 (다른 파일)

Page cache entry:
[inode 12345] → [cached pages in memory]
                  ↑
         Pod A와 B 모두 여기를 참조!
```

### 실제 사례: 컨테이너 이미지 레이어

```bash
# Node가 ubuntu:latest 이미지 pull (500MB)
$ docker pull ubuntu:latest

# 3개 Pod가 같은 이미지 사용
$ kubectl get pods -o wide
NAME     READY   STATUS    NODE
pod-a    1/1     Running   node1  # ubuntu:latest 사용
pod-b    1/1     Running   node1  # ubuntu:latest 사용  
pod-c    1/1     Running   node1  # ubuntu:latest 사용

# Page Cache 상태
# 첫 번째 Pod: 이미지 레이어 읽기 → Page Cache에 적재
# 두 번째, 세 번째 Pod: Page Cache에서 읽기 (빠름!)
# 총 Page Cache 사용: 500MB (1.5GB 아님)
```

### 공유 ML 모델 파일

```python
# Pod A - 첫 번째 실행 (느림)
import time
start = time.time()
model = load_model("/shared/model.bin")  # 5GB 모델, 디스크에서 읽기
print(f"Load time: {time.time() - start}s")  # 30초

# Pod B - 두 번째 실행 (빠름)  
start = time.time()
model = load_model("/shared/model.bin")  # Page Cache에서 읽기
print(f"Load time: {time.time() - start}s")  # 2초
```

## Page Cache Ownership의 함정

### OOM Cascade 시나리오

Page Cache의 가장 큰 함정은 **cache ownership 전환**입니다:

```
시나리오: 3개의 동일한 Pod가 같은 2GB 파일을 읽음

Timeline:
08:00 - Pod A 시작 → 파일 읽기 → 메모리: 2.5GB (500MB 앱 + 2GB cache)
08:05 - Pod B 시작 → 파일 읽기 → 메모리: 500MB (cache 이미 존재!)
08:10 - Pod C 시작 → 파일 읽기 → 메모리: 500MB (shared cache 사용)

이제 Pod A가 메모리 제한 초과로 OOM Kill 당함...
08:15 - Pod A killed → Cache ownership 전환
08:16 - Pod B 메모리 급증: 2.5GB (cache 상속!)
08:17 - Pod B OOM killed...
        (연쇄 실패!)
```

### 커널의 Cache Attribution 로직

```c
// 커널의 page cache 관리 (단순화)
struct page_cache_entry {
    inode_number: 12345,
    cached_pages: [...],
    first_accessor: cgroup_pod_a,  // 누가 "과금"되는가
}

// Pod A가 파일을 처음 읽을 때:
charge_memory_to_cgroup(pod_a_cgroup, cache_size);

// Pod B가 같은 파일 읽을 때:
// Cache hit! Pod B에게는 과금 안 함

// Pod A가 죽으면:
// 다음 접근자(Pod B)에게 과금 전환
// Pod B의 메모리가 갑자기 증가!
```

### 실제 프로덕션 사례

```yaml
# 문제 상황: 로그 수집 Pod들
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: log-collector
spec:
  template:
    spec:
      containers:
      - name: collector
        resources:
          limits:
            memory: "512Mi"
        volumeMounts:
        - name: varlog
          mountPath: /var/log
          readOnly: true
```

모든 Pod가 `/var/log/messages`를 읽지만, 첫 번째 Pod만 Page Cache 비용을 지불합니다. 첫 번째 Pod가 죽으면 다른 Pod가 갑자기 메모리 초과로 죽을 수 있습니다.

## Page Cache 문제 해결 방법

### 해결책 1: Cache Pre-warming

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: cache-warmer
spec:
  template:
    spec:
      initContainers:
      - name: warm-cache
        image: busybox
        command: 
        - sh
        - -c
        - |
          # 모든 공유 파일을 cache에 미리 로드
          find /data -type f -exec cat {} > /dev/null \;
      containers:
      - name: done
        image: busybox
        command: ["echo", "Cache warmed"]
```

이 방식의 동작 원리:

```
Timeline of cache ownership:

1. Job이 파일을 읽음:
┌────────────────┐
│ Job Pod        │ ← 2GB cache 과금
│ Memory: 2GB    │
└────────────────┘

2. Job 완료 후 종료:
┌────────────────┐
│ Kernel Cache   │ ← Cache는 남아있지만 "고아" 상태
│ No owner!      │    아무에게도 과금되지 않음!
└────────────────┘

3. App Pod들이 시작하고 cache 사용:
┌────────────────┐
│ App Pod 1: 500MB│ ← 앱 메모리만 과금
│ App Pod 2: 500MB│ ← Cache 존재하지만 과금 안 됨
│ App Pod 3: 500MB│ ← 모두 "무료" 고아 cache 사용
└────────────────┘
```

### 해결책 2: DaemonSet으로 Cache Owner 지정

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: cache-owner
spec:
  template:
    spec:
      containers:
      - name: cache-manager
        resources:
          requests:
            memory: "3Gi"  # 모든 cache를 수용할 크기
        command:
        - sh
        - -c
        - |
          # 주기적으로 파일을 읽어 cache 유지
          while true; do
            find /shared-data -type f -mmin -60 -exec cat {} > /dev/null \;
            sleep 300
          done
```

### 해결책 3: Memory Request/Limit 전략

```yaml
# Guaranteed QoS로 안정성 확보
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    resources:
      requests:
        memory: "1Gi"  # cache 포함 예상 사용량
      limits:
        memory: "1Gi"  # request와 동일 (Guaranteed)
```

## Page Cache 모니터링

### cgroup 메모리 통계 이해

```bash
# Pod의 실제 메모리 사용량 확인
$ cat /sys/fs/cgroup/memory/kubepods/pod&lt;uid&gt;/memory.stat
cache 2147483648         # 2GB Page Cache
rss 536870912           # 512MB RSS (실제 앱 메모리)
mapped_file 1073741824  # 1GB 메모리 맵 파일
```

### 실시간 모니터링 스크립트

```bash
#!/bin/bash
# pod-memory-monitor.sh

POD_NAME=$1
NAMESPACE=${2:-default}

# Pod의 cgroup 경로 찾기
POD_UID=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.metadata.uid}')
CGROUP_PATH="/sys/fs/cgroup/memory/kubepods/pod${POD_UID}"

while true; do
    if [ -d "$CGROUP_PATH" ]; then
        CACHE=$(cat $CGROUP_PATH/memory.stat | grep "^cache" | awk '{print $2}')
        RSS=$(cat $CGROUP_PATH/memory.stat | grep "^rss" | awk '{print $2}')
        TOTAL=$(cat $CGROUP_PATH/memory.usage_in_bytes)
        
        echo "$(date): RSS=$((RSS/1024/1024))MB, Cache=$((CACHE/1024/1024))MB, Total=$((TOTAL/1024/1024))MB"
    fi
    sleep 1
done
```

## Drop Caches: 위험한 해결책

```bash
# 절대 프로덕션에서 사용하지 마세요!
echo 3 > /proc/sys/vm/drop_caches

# 이유:
# 1. 모든 Page Cache 삭제 → 디스크 I/O 폭증
# 2. 성능 급격히 저하
# 3. 일시적 해결책일 뿐
```

대신 이렇게 하세요:

```bash
# 특정 파일만 cache에서 제거
fincore --pages --summarize --clear /path/to/file

# 또는 프로그램에서
posix_fadvise(fd, 0, 0, POSIX_FADV_DONTNEED);
```

## 실전 팁: DevOps/SRE를 위한 체크리스트

### 1. 배포 시 Page Cache 고려

```yaml
# Rolling Update 시 cache warming 고려
spec:
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0  # 항상 하나는 cache를 유지
```

### 2. 모니터링 Alert 설정

```yaml
# Prometheus rule
- alert: HighPageCacheUsage
  expr: |
    (container_memory_cache / container_spec_memory_limit_bytes) > 0.5
  annotations:
    summary: "Pod {{ $labels.pod }} has high page cache usage"
```

### 3. Node 레벨 최적화

```bash
# Cache 압력 조절
echo 50 > /proc/sys/vm/vfs_cache_pressure  # 기본값 100

# Dirty page 설정
echo 5 > /proc/sys/vm/dirty_background_ratio
echo 10 > /proc/sys/vm/dirty_ratio
```

## 정리

Page Cache는 성능에 중요하지만 Kubernetes 환경에서는 주의가 필요합니다:

1. **Page Cache는 노드 전체에서 공유**되므로 Pod 간 영향 존재
2. **Cache ownership 전환**은 OOM cascade를 일으킬 수 있음
3. **Pre-warming이나 DaemonSet**으로 ownership 문제 해결 가능
4. **모니터링 시 cache와 RSS를 구분**하여 확인 필요
5. **Drop caches는 최후의 수단**, 다른 방법 우선 고려

다음 글에서는 이러한 Page Cache 문제가 실제 OOM Kill로 이어지는 과정을 자세히 살펴보겠습니다.

---

## 관련 문서

- [[oom-killer]] - OOM Killer와 메모리 제한
- [[cgroup-container-memory]] - Cgroup과 컨테이너 메모리 격리
- [[process-memory-structure]] - 프로세스 메모리 구조
- [[multithread-stack-memory]] - 멀티스레드 스택 메모리

---

**관련 태그**: `#caching` `#file-system` `#container-orchestration` `#devops`
