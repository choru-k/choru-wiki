---
tags:
  - Memory
  - Analysis
  - RSS
  - VSZ
  - PSS
  - Monitoring
---

# 2-7: 메모리 사용량 분석 - "RSS가 왜 이렇게 높지?"

## 이 문서를 읽으면 답할 수 있는 질문들

- VSZ, RSS, PSS 의미와 차이점은 무엇인가요?
- 공유 메모리는 어떻게 계산되나요?
- memory overcommit이 시스템에 미치는 영향은?
- Transparent Huge Pages가 성능에 주는 효과는?
- 컨테이너 환경에서 메모리 사용량을 정확히 측정하는 방법은?

## 들어가며: 메모리 수치의 미스터리

"우리 서버 메모리 사용량이 80%인데, 프로세스별로 더해보면 30%밖에 안 나와요..."

이런 경험 있으신가요? 메모리 사용량을 정확히 이해하는 것은 생각보다 복잡합니다.

```mermaid
graph LR
    subgraph "메모리 지표의 혼란"
        FREE["free 명령어, 사용률: 80%"]
        TOP["top 명령어, 합계: 30%"]
        DOCKER["docker stats, 컨테이너: 50%"]
        HTOP["htop, 또 다른 수치..."]
    end
    
    subgraph "왜 다를까?"
        SHARED["공유 메모리, 중복 계산"]
        KERNEL["커널 메모리, 숨겨진 사용량"]
        CACHE["페이지 캐시, 실제 vs 사용 가능"]
        OVERCOMMIT["Memory Overcommit, 약속된 메모리"]
    end
    
    FREE -.-> SHARED
    TOP -.-> KERNEL
    DOCKER -.-> CACHE
    HTOP -.-> OVERCOMMIT
```text

각 수치의 정확한 의미를 알아야 시스템을 제대로 모니터링하고 최적화할 수 있습니다.

## 1. 메모리 지표의 정확한 의미

### 1.1 기본 메모리 지표들

```mermaid
graph TD
    subgraph "프로세스 메모리 지표"
        VSZ["VSZ (Virtual Size), 가상 메모리 총 크기, 실제 사용과 무관"]
        RSS["RSS (Resident Set Size), 물리 메모리 사용량, 공유 메모리 중복 포함"]
        PSS["PSS (Proportional Set Size), 공유 메모리 비례 분할, 가장 정확한 지표"]
        USS["USS (Unique Set Size), 해당 프로세스만 사용, 프로세스 종료 시 해제량"]
    end
    
    subgraph "관계"
        VSZ --> VIRTUAL[가상 주소 공간]
        RSS --> PHYSICAL[물리 메모리]
        PSS --> ACCURATE[정확한 사용량]
        USS --> PRIVATE[순수 사용량]
    end
    
    style PSS fill:#c8e6c9
    style USS fill:#e1f5fe
```text

**실제 예시로 이해하기**:

```bash
# Chrome 브라우저 프로세스들
$ ps aux | grep chrome | head -5
USER   PID  %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
user  1234   5.2  3.1 2048000 128000 ?     Sl   10:00   0:30 /opt/google/chrome
user  1235   2.1  2.5 1536000 102400 ?     S    10:00   0:15 /opt/google/chrome --type=renderer
user  1236   1.8  1.9 1280000  76800 ?     S    10:00   0:10 /opt/google/chrome --type=renderer
```text

이 경우:

- **VSZ**: 각각 2GB, 1.5GB, 1.3GB (실제 메모리 사용량 아님!)
- **RSS**: 128MB, 100MB, 76MB (공유 라이브러리 중복 계산됨)

### 1.2 /proc/[pid]/smaps로 정확한 분석

```bash
# 특정 프로세스의 상세 메모리 정보
$ cat /proc/1234/smaps_rollup
Rss:              131072 kB    # 물리 메모리 사용량
Pss:               87543 kB    # 비례 분할된 사용량  
Pss_Anon:          65432 kB    # 익명 메모리 (힙, 스택)
Pss_File:          22111 kB    # 파일 백업 메모리 (라이브러리, mmap)
Pss_Shmem:             0 kB    # 공유 메모리
Shared_Clean:      43521 kB    # 공유된 읽기 전용 페이지
Shared_Dirty:       8912 kB    # 공유된 수정 페이지  
Private_Clean:     12345 kB    # 프라이빗 읽기 전용 페이지
Private_Dirty:     66294 kB    # 프라이빗 수정 페이지
```text

**각 지표의 실무 의미**:

```mermaid
graph LR
    subgraph "Clean vs Dirty"
        CLEAN["Clean Pages, 디스크에서 읽기만, 메모리 부족 시 바로 해제"]
        DIRTY["Dirty Pages, 수정된 메모리, 스왑 또는 저장 후 해제"]
    end
    
    subgraph "Shared vs Private"
        SHARED["Shared, 여러 프로세스가 공유, 라이브러리, 공유 메모리"]
        PRIVATE["Private, 해당 프로세스만 사용, 힙, 스택, 데이터"]
    end
    
    CLEAN --> FAST[빠른 해제 가능]
    DIRTY --> SLOW[느린 해제]
    SHARED --> EFFICIENT[메모리 효율적]
    PRIVATE --> EXACT[정확한 사용량]
```text

## 2. 공유 메모리 계산의 복잡성

### 2.1 공유 메모리가 중복 계산되는 이유

```c
// 공유 라이브러리 예시
// libc.so.6을 3개 프로세스가 공유하는 경우

프로세스 A: RSS에 libc.so 2MB 포함
프로세스 B: RSS에 libc.so 2MB 포함  
프로세스 C: RSS에 libc.so 2MB 포함

총 RSS 합계: 6MB
실제 물리 메모리 사용: 2MB

잘못된 계산으로 4MB 과대 추정!
```text

**정확한 시스템 메모리 사용량 계산법**:

```bash
#!/bin/bash
# accurate_memory_calc.sh

echo "=== 시스템 메모리 정확한 분석 ==="

# 1. 전체 시스템 메모리
free -h | head -2

# 2. PSS 기준 실제 사용량 (공유 메모리 비례 분할)
echo -e ", === PSS 기준 프로세스별 사용량 ==="
for pid in $(ps -eo pid --no-headers | head -10); do
    if [ -f /proc/$pid/smaps_rollup ]; then
        pss=$(grep "^Pss:" /proc/$pid/smaps_rollup | awk '{print $2}')
        cmd=$(ps -p $pid -o comm --no-headers 2>/dev/null)
        if [ -n "$pss" ] && [ "$pss" -gt 1000 ]; then
            echo "$cmd: $((pss/1024))MB"
        fi
    fi
done

# 3. USS 기준 순수 사용량
echo -e ", === USS 기준 순수 사용량 ==="
smem -t -k | tail -5
```text

### 2.2 공유 메모리 세그먼트 분석

```bash
# 시스템 공유 메모리 확인
$ ipcs -m
------ Shared Memory Segments --------
key        shmid      owner      perms      bytes      nattch     status
0x00000000 0          user       666        67108864   2          dest
0x00000000 32769      user       666        4194304    1

# 특정 프로세스가 연결된 공유 메모리
$ lsof -p 1234 | grep REG | grep "/dev/shm"

# 공유 메모리 사용 패턴 시각화
$ cat > shared_memory_analysis.py << 'EOF'
#!/usr/bin/env python3
import os
import re
from collections import defaultdict

def analyze_shared_memory():
    shared_regions = defaultdict(list)
    
    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue
            
        try:
            with open(f'/proc/{pid}/smaps') as f:
                content = f.read()
                
            # 공유 메모리 영역 찾기
            for match in re.finditer(r'(\w+-\w+).*, (?:.*, )*?Shared_Clean:\s+(\d+)', content):
                addr_range = match.group(1)
                shared_size = int(match.group(2))
                if shared_size > 0:
                    shared_regions[addr_range].append((pid, shared_size))
        except:
            continue
    
    print("공유 메모리 영역 분석:")
    for region, processes in shared_regions.items():
        if len(processes) > 1:  # 2개 이상 프로세스가 공유
            total_shared = sum(size for _, size in processes)
            print(f"{region}: {len(processes)}개 프로세스, {total_shared}KB 공유")

if __name__ == '__main__':
    analyze_shared_memory()
EOF

$ python3 shared_memory_analysis.py
```text

## 3. Memory Overcommit 이해

### 3.1 Overcommit이란?

Linux 커널은 기본적으로 실제 메모리보다 더 많은 메모리를 '약속'합니다:

```mermaid
sequenceDiagram
    participant App as 애플리케이션
    participant Kernel as 리눅스 커널
    participant RAM as 물리 메모리
    
    App->>Kernel: malloc(1GB) 요청
    Kernel-->>App: 성공! (실제로는 할당 안 함)
    Note over Kernel: "나중에 실제 사용할 때 할당하자"
    
    App->>Kernel: 메모리에 데이터 쓰기
    Kernel->>RAM: 페이지 폴트 발생, 실제 할당
    
    alt 메모리 부족 시
        Kernel->>Kernel: OOM Killer 발동
        Kernel->>App: 프로세스 강제 종료 💀
    end
```text

**Overcommit 설정 확인 및 변경**:

```bash
# 현재 설정 확인
$ cat /proc/sys/vm/overcommit_memory
0    # 0: 기본(휴리스틱), 1: 항상 허용, 2: 금지

$ cat /proc/sys/vm/overcommit_ratio
50   # overcommit_memory=2일 때 허용 비율

# Overcommit 상태 확인
$ cat /proc/meminfo | grep Commit
CommitLimit:     8123456 kB    # 최대 커밋 가능량
Committed_AS:    4567890 kB    # 현재 커밋된 양

# Overcommit 비율 계산
$ echo "scale=1; $(grep Committed_AS /proc/meminfo | awk '{print $2}') * 100 / $(grep CommitLimit /proc/meminfo | awk '{print $2}')" | bc
56.1    # 56.1% 오버커밋 상태
```text

### 3.2 Overcommit의 실무 영향

**장점**:

- 메모리 효율성 증대 (fork() 시 copy-on-write)
- 더 많은 프로세스 실행 가능

**단점**:

- 예측 불가능한 OOM 발생
- 중요한 프로세스가 갑자기 죽을 수 있음

```bash
# 안전한 Overcommit 설정 (운영 환경)
echo 2 > /proc/sys/vm/overcommit_memory     # 엄격한 제한
echo 80 > /proc/sys/vm/overcommit_ratio     # 80% 이하로 제한

# /etc/sysctl.conf에 영구 설정
vm.overcommit_memory = 2
vm.overcommit_ratio = 80
```text

## 4. Transparent Huge Pages (THP) 영향 분석

### 4.1 THP란 무엇인가?

기본적으로 Linux는 4KB 페이지를 사용하지만, THP는 2MB 큰 페이지를 자동으로 사용합니다:

```mermaid
graph LR
    subgraph "일반 페이지 (4KB)"
        SMALL1[데이터 4KB] --> PAGE1[페이지 1]
        SMALL2[데이터 4KB] --> PAGE2[페이지 2]  
        SMALL3[데이터 4KB] --> PAGE3[페이지 3]
        SMALL512[... 512개] --> PAGE512[페이지 512]
        
        PAGE1 --> TLB1[TLB 엔트리 1]
        PAGE2 --> TLB2[TLB 엔트리 2]
        PAGE512 --> TLB512[TLB 엔트리 512]
    end
    
    subgraph "Huge 페이지 (2MB)"
        LARGE[데이터 2MB] --> HUGEPAGE[Huge 페이지 1]
        HUGEPAGE --> TLBHUGE[TLB 엔트리 1개]
    end
    
    style TLBHUGE fill:#c8e6c9
    style TLB512 fill:#ffcccb
```text

**THP 상태 확인**:

```bash
# THP 설정 확인
$ cat /sys/kernel/mm/transparent_hugepage/enabled
always [madvise] never

$ cat /sys/kernel/mm/transparent_hugepage/defrag  
always defer defer+madvise [madvise] never

# THP 사용 통계
$ grep -E "AnonHugePages|HugePages" /proc/meminfo
AnonHugePages:    204800 kB    # 익명 huge pages (100개)
HugePages_Total:        0      # 예약된 huge pages
HugePages_Free:         0
```text

### 4.2 THP 성능 영향 측정

```c
// thp_benchmark.c
#include <stdio.h>
#include <stdlib.h>
#include <sys/time.h>
#include <string.h>

#define SIZE (512 * 1024 * 1024)  // 512MB

double get_time() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

int main() {
    char *buffer = malloc(SIZE);
    double start, end;
    
    printf("메모리 할당 완료: %d MB, ", SIZE/1024/1024);
    
    // 순차 접근 테스트
    start = get_time();
    for (int i = 0; i < SIZE; i += 4096) {
        buffer[i] = 1;
    }
    end = get_time();
    printf("순차 접근: %.3f 초, ", end - start);
    
    // 랜덤 접근 테스트  
    start = get_time();
    for (int i = 0; i < 100000; i++) {
        int idx = rand() % SIZE;
        buffer[idx] = 1;
    }
    end = get_time();
    printf("랜덤 접근: %.3f 초, ", end - start);
    
    free(buffer);
    return 0;
}
```text

**THP 효과 비교**:

```bash
# THP 비활성화
$ echo never > /sys/kernel/mm/transparent_hugepage/enabled
$ ./thp_benchmark
순차 접근: 0.245 초
랜덤 접근: 0.123 초

# THP 활성화
$ echo always > /sys/kernel/mm/transparent_hugepage/enabled  
$ ./thp_benchmark
순차 접근: 0.187 초    # 24% 향상!
랜덤 접근: 0.098 초    # 20% 향상!
```text

**THP 부작용**:

- 메모리 단편화 증가 가능
- 할당 지연(allocation stall) 발생 가능
- 일부 워크로드에서는 성능 저하

## 5. 컨테이너 환경 메모리 분석

### 5.1 Docker 메모리 제한과 실제 사용량

```bash
# Docker 컨테이너 메모리 제한 설정
$ docker run -m 512m --name myapp myimage

# 컨테이너 메모리 사용량 확인 (여러 방법)
$ docker stats myapp --no-stream
CONTAINER   CPU %   MEM USAGE / LIMIT   MEM %   NET I/O   BLOCK I/O   PIDS
myapp       2.50%   245MiB / 512MiB     47.85%  0B / 0B   0B / 0B     15

# 컨테이너 내부에서 확인 (잘못된 정보!)
$ docker exec myapp free -h
              total        used        free      shared  buff/cache   available
Mem:           7.8G        2.1G        3.2G        145M        2.5G        5.4G

# 정확한 메모리 제한 확인
$ docker exec myapp cat /sys/fs/cgroup/memory/memory.limit_in_bytes
536870912    # 512MB
```text

**문제점**: 컨테이너 내부 프로세스들이 호스트 메모리 정보를 보게 됨!

### 5.2 cgroup 메모리 통계 직접 분석

```bash
# 컨테이너 ID 찾기
CONTAINER_ID=$(docker ps -q --filter name=myapp)

# cgroup 경로 찾기
CGROUP_PATH="/sys/fs/cgroup/memory/docker/$CONTAINER_ID"

# 상세 메모리 통계
$ cat $CGROUP_PATH/memory.stat
cache 67108864          # 페이지 캐시
rss 178257920          # RSS
mapped_file 8388608     # 매핑된 파일
pgpgin 532471          # 페이지 인
pgpgout 489173         # 페이지 아웃
pgfault 1245678        # 페이지 폴트
pgmajfault 234         # 메이저 페이지 폴트

# 메모리 압박 상황
$ cat $CGROUP_PATH/memory.pressure_level
low    # low/medium/critical
```text

**정확한 컨테이너 메모리 모니터링**:

```python
#!/usr/bin/env python3
# container_memory_monitor.py
import docker
import time
import os

def get_container_memory_stats(container_name):
    client = docker.from_env()
    container = client.containers.get(container_name)
    
    # cgroup 경로
    cgroup_path = f"/sys/fs/cgroup/memory/docker/{container.id}"
    
    # memory.stat 파싱
    with open(f"{cgroup_path}/memory.stat") as f:
        stats = {}
        for line in f:
            key, value = line.strip().split()
            stats[key] = int(value)
    
    # 제한값
    with open(f"{cgroup_path}/memory.limit_in_bytes") as f:
        limit = int(f.read().strip())
    
    # 현재 사용량
    with open(f"{cgroup_path}/memory.usage_in_bytes") as f:
        usage = int(f.read().strip())
    
    return {
        'limit_mb': limit // 1024 // 1024,
        'usage_mb': usage // 1024 // 1024,
        'cache_mb': stats.get('cache', 0) // 1024 // 1024,
        'rss_mb': stats.get('rss', 0) // 1024 // 1024,
        'usage_percent': (usage / limit) * 100
    }

def monitor_container(name, duration=300):
    print(f"Monitoring container '{name}' for {duration} seconds...")
    
    for i in range(duration):
        try:
            stats = get_container_memory_stats(name)
            print(f"[{i:3d}s] "
                  f"Usage: {stats['usage_mb']}MB/{stats['limit_mb']}MB "
                  f"({stats['usage_percent']:.1f}%) "
                  f"RSS: {stats['rss_mb']}MB "
                  f"Cache: {stats['cache_mb']}MB")
        except Exception as e:
            print(f"Error: {e}")
        
        time.sleep(1)

if __name__ == '__main__':
    import sys
    if len(sys.argv) != 2:
        print("Usage: python container_memory_monitor.py <container_name>")
        sys.exit(1)
    
    monitor_container(sys.argv[1])
```text

## 6. 메모리 사용량 최적화 전략

### 6.1 메모리 효율성 체크리스트

**애플리케이션 레벨**:

- [ ] 메모리 풀 사용으로 할당/해제 횟수 최소화
- [ ] 큰 객체는 지연 로딩 적용
- [ ] 캐시 크기 제한 및 LRU 정책 구현
- [ ] 정적 메모리 할당 우선 고려

**시스템 레벨**:

- [ ] THP 설정 워크로드에 맞게 조정
- [ ] Overcommit 정책 안전하게 설정
- [ ] Swap 사용량 모니터링 및 최적화
- [ ] 컨테이너 메모리 제한 적절히 설정

### 6.2 실시간 메모리 효율성 모니터링

```bash
#!/bin/bash
# memory_efficiency_monitor.sh

while true; do
    echo "=== $(date) ==="
    
    # 1. 전체 시스템 메모리 효율성
    TOTAL=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    AVAILABLE=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
    EFFICIENCY=$((100 - (AVAILABLE * 100 / TOTAL)))
    echo "메모리 효율성: $EFFICIENCY%"
    
    # 2. 스왑 사용량
    SWAP_TOTAL=$(grep SwapTotal /proc/meminfo | awk '{print $2}')
    SWAP_FREE=$(grep SwapFree /proc/meminfo | awk '{print $2}')
    if [ $SWAP_TOTAL -gt 0 ]; then
        SWAP_USED=$((SWAP_TOTAL - SWAP_FREE))
        SWAP_PERCENT=$((SWAP_USED * 100 / SWAP_TOTAL))
        echo "스왑 사용률: $SWAP_PERCENT%"
    fi
    
    # 3. THP 효과
    THP_PAGES=$(grep AnonHugePages /proc/meminfo | awk '{print $2}')
    echo "THP 사용량: $((THP_PAGES / 1024))MB"
    
    # 4. 상위 메모리 사용 프로세스
    echo "상위 메모리 사용 프로세스:"
    ps aux --sort=-rss | head -6 | tail -5
    
    echo ""
    sleep 10
done
```text

## 7. 정리와 모니터링 가이드

메모리 사용량을 정확히 이해하고 모니터링하는 것은 시스템 안정성과 성능의 핵심입니다.

### 핵심 포인트

1. **PSS가 가장 정확한 지표**: 공유 메모리를 비례적으로 분할
2. **USS가 프로세스 순수 사용량**: 프로세스 종료 시 해제되는 메모리
3. **Overcommit 이해**: 가상 메모리와 실제 할당의 차이
4. **컨테이너 환경**: cgroup 통계를 직접 확인해야 정확

### 실무 모니터링 전략

```mermaid
graph TD
    MONITOR[메모리 모니터링] --> SYSTEM[시스템 레벨]
    MONITOR --> PROCESS[프로세스 레벨]  
    MONITOR --> CONTAINER[컨테이너 레벨]
    
    SYSTEM --> TOTAL[전체 사용량]
    SYSTEM --> SWAP[스왑 사용률]
    SYSTEM --> THP[THP 효과]
    
    PROCESS --> PSS[PSS 기준 측정]
    PROCESS --> USS[USS 기준 측정]
    PROCESS --> GROWTH[증가 패턴 추적]
    
    CONTAINER --> CGROUP[cgroup 직접 분석]
    CONTAINER --> LIMIT[제한값 대비 사용률]
    CONTAINER --> PRESSURE[메모리 압박 수준]
```text

다음 섹션에서는 스택 관련 문제와 디버깅 기법을 다뤄보겠습니다.

정확한 메모리 분석으로 더 안정적인 시스템을 만들어봅시다! 📊
