---
tags:
  - memory
  - cgroup
  - containers
  - kubernetes
  - docker
  - isolation
---

# Cgroup과 컨테이너 메모리 격리의 비밀

## 들어가며

"컨테이너는 어떻게 메모리를 격리하지?", "왜 컨테이너 안에서 free 명령이 호스트 메모리를 보여주지?", "cgroup v1과 v2의 차이가 뭐야?" 이런 궁금증을 해결하기 위해 Cgroup의 동작 원리를 깊이 파헤쳐보겠습니다.

## Cgroup이란?

Cgroup(Control Groups)은 Linux 커널 기능으로, 프로세스 그룹의 리소스 사용을 제한하고 격리합니다. Docker, Kubernetes 등 모든 컨테이너 기술의 핵심입니다.

```text
컨테이너 기술 스택:
┌────────────────────┐
│   Application      │
├────────────────────┤
│   Container        │
├────────────────────┤
│   Container Runtime│ (Docker, containerd)
├────────────────────┤
│   Cgroups          │ ← 리소스 격리/제한
├────────────────────┤
│   Namespaces       │ ← 프로세스 격리
├────────────────────┤
│   Linux Kernel     │
└────────────────────┘
```

## Cgroup이 추적하는 메모리 타입

많은 엔지니어가 RSS만 생각하지만, Cgroup은 훨씬 더 많은 것을 추적합니다:

```text
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
# Docker 컨테이너의 메모리 사용량
$ docker stats --no-stream
CONTAINER   MEM USAGE / LIMIT
my-app      2.5GiB / 4GiB

# 실제 내역 확인
$ cat /sys/fs/cgroup/memory/docker/<container-id>/memory.stat
cache 1073741824        # 1GB Page Cache
rss 1610612736         # 1.5GB RSS
mapped_file 536870912   # 512MB Memory-mapped files
pgpgin 1234567          # Page in 횟수
pgpgout 654321          # Page out 횟수
```

## Cgroup v1 vs v2

### Cgroup v1의 문제점

```bash
# v1: 여러 계층 구조 (복잡함)
/sys/fs/cgroup/
├── memory/           # 메모리 컨트롤러
│   └── docker/
├── cpu/             # CPU 컨트롤러
│   └── docker/
├── blkio/           # I/O 컨트롤러
│   └── docker/
└── ...

# 같은 컨테이너가 여러 계층에 존재
# 관리 복잡, 일관성 문제
```

### Cgroup v2의 개선

```bash
# v2: 통합된 단일 계층
/sys/fs/cgroup/
├── cgroup.controllers    # 사용 가능한 컨트롤러
├── cgroup.subtree_control # 하위 전파 컨트롤러
├── docker/
│   ├── memory.max
│   ├── memory.current
│   ├── cpu.max
│   └── io.max
└── kubernetes/
    └── pods/
```

## Kubernetes와 Cgroup

### Pod의 Cgroup 구조

```bash
/sys/fs/cgroup/
└── kubepods.slice/                          # 모든 Pod
    ├── kubepods-guaranteed.slice/           # Guaranteed QoS
    │   └── kubepods-guaranteed-pod[uid].slice/
    │       ├── docker-<container1>.scope/
    │       └── docker-<container2>.scope/
    ├── kubepods-burstable.slice/           # Burstable QoS
    │   └── kubepods-burstable-pod[uid].slice/
    └── kubepods-besteffort.slice/          # BestEffort QoS
        └── kubepods-besteffort-pod[uid].slice/
```

### QoS별 Cgroup 설정

```bash
# Guaranteed Pod (request == limit)
$ cat /sys/fs/cgroup/kubepods-guaranteed.slice/*/memory.max
2147483648  # 2Gi 고정

# Burstable Pod (request < limit)
$ cat /sys/fs/cgroup/kubepods-burstable.slice/*/memory.high
1073741824  # 1Gi request (v2에서 memory.high)
$ cat /sys/fs/cgroup/kubepods-burstable.slice/*/memory.max
2147483648  # 2Gi limit

# BestEffort Pod (no limits)
$ cat /sys/fs/cgroup/kubepods-besteffort.slice/*/memory.max
max  # 제한 없음
```

## 메모리 계층과 보호

### Cgroup v2의 메모리 보호 메커니즘

```bash
# 메모리 보호 설정들
$ ls /sys/fs/cgroup/my-app/memory.*
memory.min      # 하드 보호 (절대 회수 안 함)
memory.low      # 소프트 보호 (압력 시에만 회수)
memory.high     # 소프트 리밋 (스로틀링)
memory.max      # 하드 리밋 (OOM)
memory.current  # 현재 사용량
```

계층적 보호 계산:

```text
Parent cgroup:
  memory.low = 4G
  ├── Child A: memory.low = 3G, usage = 2G
  ├── Child B: memory.low = 2G, usage = 1G
  └── Child C: memory.low = 1G, usage = 500M

총 요청: 6G > Parent의 4G
실제 보호:
  Child A: min(3G, 4G * 3/6) = 2G
  Child B: min(2G, 4G * 2/6) = 1.33G
  Child C: min(1G, 4G * 1/6) = 667M
```

## 실전: Docker 컨테이너 메모리 관리

### Docker Run 옵션과 Cgroup

```bash
# Docker 메모리 옵션
$ docker run -d \
  --memory="2g" \           # memory.max = 2GB
  --memory-reservation="1g" \ # memory.low = 1GB (v2)
  --memory-swap="3g" \      # memory+swap 총 3GB
  --oom-kill-disable \      # OOM Kill 비활성화 (위험!)
  nginx

# 설정 확인
$ docker inspect <container> | jq '.[0].HostConfig.Memory'
2147483648

# Cgroup 직접 확인
$ cat /sys/fs/cgroup/memory/docker/<container-id>/memory.limit_in_bytes
2147483648
```

### 컨테이너 내부에서의 메모리 뷰

```bash
# 문제: 컨테이너 안에서 호스트 메모리가 보임
$ docker exec -it my-app bash
root@container:/# free -h
              total        used        free
Mem:           31Gi        20Gi        11Gi  # 호스트 전체!

# 해결책 1: cgroup 직접 확인
root@container:/# cat /sys/fs/cgroup/memory/memory.limit_in_bytes
2147483648  # 실제 제한: 2GB

# 해결책 2: 올바른 도구 사용
root@container:/# cat /proc/meminfo | grep MemTotal
MemTotal:        2097152 kB  # 일부 런타임은 이를 수정
```

### Java 애플리케이션의 함정

```java
// 문제: JVM이 호스트 메모리를 봄
Runtime runtime = Runtime.getRuntime();
long maxMemory = runtime.maxMemory();
// 호스트가 32GB면 기본 힙 = 8GB (25%)

// 해결책: 컨테이너 인식 JVM 옵션
// Java 8u191+, Java 10+
java -XX:+UseContainerSupport \
     -XX:MaxRAMPercentage=75.0 \
     -jar app.jar

// 또는 명시적 설정
java -Xmx1536m -jar app.jar  # 2GB 컨테이너의 75%
```

## Cgroup 메모리 통계 상세

### memory.stat 파일 해석

```bash
$ cat /sys/fs/cgroup/my-app/memory.stat
# 파일별 설명
anon 1234567890              # Anonymous 메모리 (힙, 스택)
file 2345678901              # File-backed 메모리 (Page Cache)
kernel_stack 163840          # 커널 스택
pagetables 4194304           # 페이지 테이블
percpu 32768                 # Per-CPU 할당
sock 1048576                 # 소켓 버퍼
shmem 8388608               # 공유 메모리
file_mapped 16777216         # 메모리 맵 파일
file_dirty 4194304           # 더티 페이지
file_writeback 0             # Writeback 중인 페이지

# 파생 메트릭
inactive_anon 614400000      # 비활성 anonymous
active_anon 620167890        # 활성 anonymous
inactive_file 1145678901     # 비활성 file cache
active_file 1200000000       # 활성 file cache

# 이벤트 카운터
pgfault 1234567              # Page fault 횟수
pgmajfault 12345            # Major fault (디스크 읽기)
```

### Working Set 계산

```python
def calculate_working_set(cgroup_path):
    """실제 필요한 메모리 계산"""
    stats = parse_memory_stat(f"{cgroup_path}/memory.stat")

    # Working Set = Active + Recently Used
    working_set = (
        stats['active_anon'] +
        stats['active_file'] +
        stats['kernel_stack'] +
        stats['pagetables'] +
        stats['sock']
    )

    # Reclaimable 메모리
    reclaimable = (
        stats['inactive_file'] +  # 쉽게 회수 가능
        stats['slab_reclaimable']
    )

    return {
        'working_set': working_set,
        'reclaimable': reclaimable,
        'pressure': working_set / stats['limit']
    }
```

## 실전 Cgroup 튜닝

### 1. 데이터베이스 컨테이너

```bash
# PostgreSQL 컨테이너 최적화
docker run -d \
  --name postgres \
  --memory="8g" \
  --memory-reservation="6g" \
  --cpus="4.0" \
  -e POSTGRES_SHARED_BUFFERS="2GB" \
  -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
  postgres:14 \
  -c shared_buffers=2GB \
  -c effective_cache_size=6GB

# Cgroup 설정 확인
echo 6442450944 > /sys/fs/cgroup/docker/*/memory.low  # 6GB 보호
echo 8589934592 > /sys/fs/cgroup/docker/*/memory.high # 8GB 스로틀
```

### 2. 멀티테넌트 격리

```bash
# 테넌트별 cgroup 생성
mkdir -p /sys/fs/cgroup/{tenant-a,tenant-b}

# Tenant A: 프리미엄 (보장된 리소스)
echo "+memory +cpu +io" > /sys/fs/cgroup/tenant-a/cgroup.subtree_control
echo 4G > /sys/fs/cgroup/tenant-a/memory.min   # 4GB 보장
echo 8G > /sys/fs/cgroup/tenant-a/memory.max   # 8GB 제한

# Tenant B: 일반 (Best Effort)
echo "+memory +cpu +io" > /sys/fs/cgroup/tenant-b/cgroup.subtree_control
echo 0 > /sys/fs/cgroup/tenant-b/memory.min    # 보장 없음
echo 4G > /sys/fs/cgroup/tenant-b/memory.max   # 4GB 제한
```

### 3. 버스트 워크로드

```yaml
# Kubernetes에서 버스트 허용
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: bursty-app
    resources:
      requests:
        memory: "512Mi"  # 평상시
      limits:
        memory: "2Gi"    # 버스트 시
```

대응하는 Cgroup 설정:

```bash
# cgroup v2
memory.low = 536870912    # 512Mi 보호
memory.high = 1073741824  # 1Gi 스로틀 시작
memory.max = 2147483648   # 2Gi 하드 리밋
```

## Cgroup 이벤트와 알림

### memory.events 모니터링

```bash
$ cat /sys/fs/cgroup/my-app/memory.events
low 0        # memory.low 이하로 감소한 횟수
high 142     # memory.high 초과 횟수
max 3        # memory.max 도달 횟수
oom 3        # OOM 발생 횟수
oom_kill 2   # 실제 프로세스 kill 횟수
```

### 이벤트 기반 자동화

```c
#include <sys/eventfd.h>

int setup_oom_notification(const char* cgroup_path) {
    char event_path[256];
    sprintf(event_path, "%s/memory.events", cgroup_path);

    int event_fd = eventfd(0, EFD_CLOEXEC);
    int control_fd = open(event_path, O_RDONLY);

    // OOM 이벤트 등록
    write(control_fd, &event_fd, sizeof(event_fd));

    // 이벤트 대기
    uint64_t val;
    while (read(event_fd, &val, sizeof(val)) == sizeof(val)) {
        printf("OOM Event detected! Count: %llu, ", val);
        // 자동 복구 로직
        restart_container();
    }
}
```

## 문제 해결 가이드

### 1. 컨테이너 OOM 디버깅

```bash
# OOM 원인 찾기
$ docker inspect <container> | jq '.[0].State.OOMKilled'
true

# 상세 정보
$ journalctl -u docker | grep -I "out of memory"
kernel: Memory cgroup out of memory: Killed process 12345 (java)

# Cgroup 통계 확인
$ cat /sys/fs/cgroup/memory/docker/*/memory.failcnt
142  # 메모리 할당 실패 횟수
```

### 2. 메모리 누수 감지

```bash
#!/bin/bash
# memory-leak-detector.sh

CONTAINER=$1
THRESHOLD=90  # 90% 사용 시 경고

while true; do
    STATS=$(docker stats --no-stream --format "{{json .}}" $CONTAINER)
    MEM_PERCENT=$(echo $STATS | jq -r '.MemPerc' | tr -d '%')

    if (( $(echo "$MEM_PERCENT > $THRESHOLD" | bc -l) )); then
        echo "WARNING: Memory usage at ${MEM_PERCENT}%"

        # 힙 덤프 생성 (Java 앱의 경우)
        docker exec $CONTAINER jmap -dump:format=b,file=/tmp/heap.bin 1
    fi

    sleep 30
done
```

### 3. Cgroup 마이그레이션 (v1 → v2)

```bash
# 현재 버전 확인
mount | grep cgroup

# v2 활성화 (재부팅 필요)
# /etc/default/grub
GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=1"

# 업데이트 및 재부팅
update-grub
reboot

# Docker/Kubernetes 설정 업데이트
# Docker: /etc/docker/daemon.json
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "cgroup-parent": "/docker"
}

# Kubernetes: kubelet 설정
--cgroup-driver=systemd
```

## 실전 팁

### 1. 컨테이너 시작 시 메모리 체크

```dockerfile
# Dockerfile
FROM alpine
RUN apk add --no-cache bash

# 시작 스크립트
COPY check-memory.sh /
ENTRYPOINT ["/check-memory.sh"]

# check-memory.sh
#!/bin/bash
LIMIT=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)
if [ $LIMIT -lt 1073741824 ]; then  # 1GB 미만
    echo "ERROR: Insufficient memory. Need at least 1GB"
    exit 1
fi
exec "$@"
```

### 2. 동적 메모리 조정

```python
import os
import psutil

def adjust_cache_size():
    """Cgroup 제한에 따라 캐시 크기 조정"""
    try:
        # Cgroup v2
        with open('/sys/fs/cgroup/memory.max') as f:
            limit = int(f.read().strip())
    except:
        # Cgroup v1
        with open('/sys/fs/cgroup/memory/memory.limit_in_bytes') as f:
            limit = int(f.read().strip())

    # 제한의 50%를 캐시로 사용
    cache_size = limit * 0.5
    return cache_size
```

## 정리

Cgroup은 컨테이너 메모리 격리의 핵심입니다:

1. **Cgroup은 다양한 메모리 타입 추적** (RSS, Cache, Kernel 등)
2. **v2는 통합 계층으로 관리 단순화**
3. **Kubernetes QoS는 Cgroup 설정에 직접 매핑**
4. **memory.high로 점진적 제한, memory.max로 하드 제한**
5. **컨테이너 내부에서는 Cgroup 정보 직접 확인 필요**

다음 글에서는 가비지 컬렉션의 기초 이론과 알고리즘을 살펴보겠습니다.

---

## 관련 문서

- [[page-cache]] - Page Cache와 컨테이너 메모리
- [[oom-killer]] - OOM Killer와 Cgroup 제한
- [[psi-monitoring]] - PSI를 통한 Cgroup 압력 모니터링
- [[process-memory-structure]] - 프로세스 메모리 구조

---

**관련 태그**: `#container-runtime` `#resource-isolation` `#memory-limits` `#qos-classes`
