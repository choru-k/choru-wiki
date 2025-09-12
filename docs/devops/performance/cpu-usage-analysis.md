---
tags:
  - CPU
  - Performance
  - Monitoring
  - Linux
  - Debugging
  - Production
  - vmstat
  - lsof
---

# CPU 사용량 분석: Production 성능 문제 해결 완벽 가이드

## 들어가며

"서버 CPU가 갑자기 100%로 치솟았는데 도대체 뭐가 문제야?" Production 환경에서 가장 긴급한 상황 중 하나가 바로 **예기치 못한 CPU 사용량 급증**입니다. CPU 100%는 다양한 원인이 있을 수 있으며, 잘못된 진단은 더 큰 장애로 이어질 수 있습니다. 시스템 레벨에서 CPU 사용량을 정확히 분석하고 근본 원인을 찾는 체계적인 방법을 살펴보겠습니다.

## CPU 사용량의 이해

### Linux CPU 시간 분류

Linux 커널은 CPU 시간을 다음과 같이 분류합니다:

```c
// kernel/sched/cputime.c (simplified)
enum cpu_usage_stat {
    CPUTIME_USER,     // 사용자 공간에서 실행된 시간 (us)
    CPUTIME_NICE,     // nice 값이 설정된 사용자 프로세스 시간 (ni) 
    CPUTIME_SYSTEM,   // 커널 공간에서 실행된 시간 (sy)
    CPUTIME_IDLE,     // 유휴 시간 (id)
    CPUTIME_IOWAIT,   // I/O 대기 시간 (wa)
    CPUTIME_IRQ,      // 하드웨어 인터럽트 처리 시간 (hi)
    CPUTIME_SOFTIRQ,  // 소프트웨어 인터럽트 처리 시간 (si)
    CPUTIME_STEAL,    // 가상화 환경에서 하이퍼바이저에 의해 도난당한 시간 (st)
    CPUTIME_GUEST,    // 게스트 OS 실행 시간 (guest)
};
```

### /proc/stat을 통한 CPU 통계

```bash
# 시스템 전체 CPU 통계
cat /proc/stat | head -1
# cpu  2050123 1234 567890 12345678 89012 0 3456 0 0 0
#      user    nice system idle     iowait irq softirq steal guest guest_nice

# 코어별 CPU 통계  
grep "^cpu[0-9]" /proc/stat
# cpu0 512530 308 141972 3086842 22201 0 864 0 0 0
# cpu1 518645 309 142541 3084932 22205 0 865 0 0 0
```

## vmstat을 이용한 실시간 CPU 분석

### vmstat 출력 해석

```bash
# 1초마다 CPU 상태 출력
vmstat 1

# 출력 예시:
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 2  0      0 1234567  89012 345678    0    0     4    12  123  456 25 15 60  0  0
 5  1      0 1200000  89012 345678    0    0     0   100  234  678 85 10  5  0  0
12  3      0 1150000  89012 345678    0    0    50   200  456  890 95  4  1  0  0
```

**핵심 지표 해석:**

#### CPU 컬럼 (cpu)

- `us` (user): **사용자 공간 CPU 사용률** - 애플리케이션 코드 실행
- `sy` (system): **시스템 커널 CPU 사용률** - 시스템 콜, 커널 코드 실행
- `id` (idle): **유휴 CPU 비율** - 아무것도 하지 않는 시간
- `wa` (wait): **I/O 대기 CPU 비율** - 디스크/네트워크 I/O 완료 대기
- `st` (steal): **가상화 오버헤드** - 하이퍼바이저가 CPU를 다른 VM에 할당

#### 프로세스 컬럼 (procs)

- `r` (runnable): **실행 대기 중인 프로세스 수** - CPU를 할당받기 위해 대기
- `b` (blocked): **I/O 대기 중인 프로세스 수** - 디스크/네트워크 I/O 블록

### CPU 문제 패턴 분석

#### 1. CPU-bound 애플리케이션

```bash
# 패턴: us 높음, sy 낮음, wa 낮음
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
15  0      0 1234567  89012 345678    0    0     2     5  156  234 92  6  2  0  0

# 원인: 계산 집약적 작업 (암호화, 이미지 처리, 수학 계산 등)
# 해결: 스케일 아웃, 알고리즘 최적화, 작업 분산
```

#### 2. 시스템 콜 오버헤드

```bash
# 패턴: sy 높음, us 낮음
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 8  2      0 1234567  89012 345678    0    0    10    50  890 1234 25 70  5  0  0

# 원인: 과도한 시스템 콜 (파일 생성/삭제, 네트워크 연결 등)
# 해결: 시스템 콜 최소화, 배치 처리, 버퍼링 증가
```

#### 3. I/O Bottleneck

```bash
# 패턴: wa 높음, id 높음, r 낮음, b 높음
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 2 15      0 1234567  89012 345678    0    0   100   500  234  456 20  8 45 27  0

# 원인: 디스크 I/O 대기, 느린 스토리지
# 해결: SSD 업그레이드, I/O 최적화, 비동기 처리
```

## lsof를 이용한 연결 분석

### TCP 연결과 CPU 사용률 관계

```bash
# 전체 TCP 연결 수 확인
lsof | grep TCP | wc -l

# 상태별 TCP 연결 분석
netstat -an | grep tcp | awk '{print $6}' | sort | uniq -c | sort -nr
#     150 ESTABLISHED
#      50 TIME_WAIT  
#      20 LISTEN
#      10 CLOSE_WAIT

# 프로세스별 연결 수
lsof -i tcp | awk '{print $2}' | sort | uniq -c | sort -nr | head -10
#     25 12345  (nginx)
#     20 12346  (node)
#     15 12347  (mysql)
```

### 연결 리크 감지

```bash
#!/bin/bash
# connection_monitor.sh - 연결 수 모니터링

echo "Monitoring TCP connections and CPU usage..."
echo "Time,Connections,CPU_User,CPU_System,CPU_Idle,Load_Avg" > /tmp/connection_cpu.csv

while true; do
    TIMESTAMP=$(date '+%H:%M:%S')
    
    # TCP 연결 수
    CONN_COUNT=$(lsof | grep TCP | wc -l)
    
    # CPU 사용률 (1초 평균)
    CPU_INFO=$(vmstat 1 2 | tail -1 | awk '{print $13","$14","$15}')
    
    # 로드 애버리지
    LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    
    echo "$TIMESTAMP,$CONN_COUNT,$CPU_INFO,$LOAD_AVG" >> /tmp/connection_cpu.csv
    echo "$TIMESTAMP - Connections: $CONN_COUNT, CPU: $CPU_INFO, Load: $LOAD_AVG"
    
    sleep 5
done
```

## 프로세스 레벨 CPU 분석

### top/htop을 이용한 실시간 모니터링

```bash
# CPU 사용률 순으로 정렬
top -o %CPU

# 특정 사용자의 프로세스만
top -u apache

# 메모리 정렬로 전환 (실행 중 shift+m)
# CPU 정렬로 전환 (실행 중 shift+p)
```

### ps를 이용한 프로세스 분석

```bash
# CPU 사용률 상위 프로세스
ps aux --sort=-%cpu | head -20

# 특정 프로세스의 스레드별 CPU 사용률
ps -p 12345 -L -o pid,tid,pcpu,pmem,comm

# 프로세스 트리로 CPU 사용률 확인
ps auxf --sort=-%cpu | head -30
```

## 고급 CPU 분석 도구

### 1. iostat - I/O와 CPU 상관관계

```bash
# CPU와 디스크 I/O 동시 모니터링
iostat -x 1

# 출력 예시:
avg-cpu:  %user   %nice %system %iowait  %steal   %idle
           23.50    0.00    8.25   15.25    0.00   53.00

Device:         rrqm/s   wrqm/s     r/s     w/s    rkB/s    wkB/s avgrq-sz avgqu-sz   await r_await w_await  svctm  %util
sda              0.00     5.00   10.00   20.00   160.00   400.00    37.33     1.50   50.00   30.00   60.00   8.33  25.00
```

**주요 지표:**

- `%iowait`: I/O 대기로 인한 CPU 유휴 시간
- `%util`: 디스크 사용률 (100%에 가까우면 병목)
- `await`: 평균 I/O 응답 시간 (ms)

### 2. sar - 시간대별 CPU 패턴 분석

```bash
# 10초마다 CPU 정보 수집, 1시간 동안
sar -u 10 360 > cpu_usage.log

# 과거 데이터 분석 (sysstat 설치 필요)
sar -u -f /var/log/sysstat/saXX  # XX는 날짜

# 메모리와 함께 분석
sar -u -r 5 100  # CPU + 메모리
```

### 3. perf - CPU 핫스팟 분석

```bash
# 시스템 전체 CPU 프로파일링 (10초간)
sudo perf record -g -a sleep 10
sudo perf report

# 특정 프로세스 프로파일링
sudo perf record -g -p 12345 sleep 30
sudo perf report --stdio

# CPU 캐시 미스 분석
sudo perf stat -e cache-references,cache-misses ./application
```

## Production 시나리오별 대응법

### 시나리오 1: 갑작스런 CPU 스파이크

```bash
#!/bin/bash
# cpu_spike_analysis.sh

echo "=== CPU Spike Emergency Analysis ==="
echo "Time: $(date)"
echo

echo "1. Current CPU Usage:"
vmstat 1 3 | tail -1
echo

echo "2. Top CPU Consuming Processes:"
ps aux --sort=-%cpu | head -10
echo

echo "3. Load Average:"
uptime
echo

echo "4. CPU per Core:"
mpstat -P ALL 1 1 | grep -v "^$"
echo

echo "5. Process Tree (top CPU users):"
ps auxf --sort=-%cpu | head -20
echo

echo "6. System Calls (if strace available):"
if command -v strace &> /dev/null; then
    TOP_PID=$(ps aux --sort=-%cpu | awk 'NR==2 {print $2}')
    echo "Tracing top process (PID: $TOP_PID) for 5 seconds..."
    timeout 5 strace -p $TOP_PID -c 2>&1 | tail -10
fi
```

### 시나리오 2: 지속적인 높은 CPU 사용률

```bash
# 장기간 모니터링 스크립트
#!/bin/bash
# long_term_cpu_monitor.sh

LOG_FILE="/var/log/cpu_monitoring.log"
THRESHOLD=80  # CPU 사용률 임계치

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # 전체 CPU 사용률 계산 (idle 제외)
    CPU_USAGE=$(vmstat 1 2 | tail -1 | awk '{print 100-$15}')
    
    if (( $(echo "$CPU_USAGE > $THRESHOLD" | bc -l) )); then
        echo "[$TIMESTAMP] HIGH CPU ALERT: ${CPU_USAGE}%" >> "$LOG_FILE"
        
        # 상위 5개 프로세스 로깅
        echo "Top processes:" >> "$LOG_FILE"
        ps aux --sort=-%cpu | head -6 >> "$LOG_FILE"
        echo "---" >> "$LOG_FILE"
        
        # 알림 발송 (선택사항)
        # mail -s "High CPU Alert" admin@company.com < "$LOG_FILE"
    fi
    
    sleep 60  # 1분마다 체크
done
```

### 시나리오 3: 멀티코어 CPU 불균형

```bash
# 코어별 CPU 사용률 분석
mpstat -P ALL 1 10 | awk '
/Average/ && /CPU/ { 
    if ($2 ~ /^[0-9]+$/) {
        core=$2; user=$3; system=$5; idle=$12
        printf "Core %2s: User=%5.1f%% System=%5.1f%% Idle=%5.1f%%, ", core, user, system, idle
    }
}'

# 프로세스의 CPU affinity 확인
for pid in $(pgrep myapp); do
    echo "PID $pid affinity: $(taskset -cp $pid 2>/dev/null | cut -d: -f2)"
done
```

## Container 환경에서의 CPU 분석

### Docker 컨테이너 CPU 사용률

```bash
# 컨테이너별 CPU 사용률
docker stats --no-stream

# 특정 컨테이너의 상세 CPU 정보
CONTAINER_ID="abc123"
cat /sys/fs/cgroup/cpu,cpuacct/docker/$CONTAINER_ID/cpuacct.usage
cat /sys/fs/cgroup/cpu,cpuacct/docker/$CONTAINER_ID/cpu.cfs_quota_us
cat /sys/fs/cgroup/cpu,cpuacct/docker/$CONTAINER_ID/cpu.cfs_period_us

# CPU throttling 확인
cat /sys/fs/cgroup/cpu,cpuacct/docker/$CONTAINER_ID/cpu.stat
```

### Kubernetes Pod CPU 분석

```bash
# Pod의 실제 프로세스 찾기 (노드에서)
kubectl get pod app-pod -o wide  # 노드 확인
# SSH to node
ps aux | grep app-name
cat /proc/PID/cgroup | grep cpu

# cgroup 제한 확인
find /sys/fs/cgroup -name "*pod-uid*" -path "*cpu*" | head -5
```

## 성능 최적화 전략

### 1. CPU Affinity 설정

```bash
# 특정 프로세스를 특정 CPU 코어에 바인딩
taskset -cp 0,1 12345  # PID 12345를 CPU 0,1에 할당

# 애플리케이션 시작 시 affinity 설정
taskset -c 0-3 ./cpu_intensive_app

# NUMA 토폴로지 고려
numactl --hardware
numactl --cpunodebind=0 --membind=0 ./app
```

### 2. CPU Governor 조정

```bash
# 현재 CPU 거버너 확인
cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# 성능 모드로 변경 (최대 성능)
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# 절전 모드에서 성능 모드로 영구 변경
sudo cpupower frequency-set -g performance
```

### 3. 애플리케이션 레벨 최적화

```python
# Python 예시: CPU 집약적 작업 최적화
import multiprocessing
import concurrent.futures
from functools import partial

def cpu_intensive_task(data_chunk):
    # CPU 집약적 작업
    result = heavy_computation(data_chunk)
    return result

def optimized_processing(data):
    # CPU 코어 수에 맞춰 병렬 처리
    num_cores = multiprocessing.cpu_count()
    chunk_size = len(data) // num_cores
    
    chunks = [data[i:i+chunk_size] for i in range(0, len(data), chunk_size)]
    
    with concurrent.futures.ProcessPoolExecutor(max_workers=num_cores) as executor:
        results = list(executor.map(cpu_intensive_task, chunks))
    
    return results
```

## 모니터링 자동화

### Prometheus + Grafana 모니터링

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
- job_name: 'node-exporter'
  static_configs:
  - targets: ['localhost:9100']

# CPU 사용률 쿼리
# - 전체 CPU 사용률: 100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
# - 프로세스별: rate(process_cpu_seconds_total[5m]) * 100
```

### 알림 규칙

```yaml
# alert-rules.yml
groups:
- name: cpu-alerts
  rules:
  - alert: HighCPUUsage
    expr: 100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High CPU usage detected"
      description: "CPU usage is above 85% for more than 5 minutes"

  - alert: CPUSaturation  
    expr: node_load1 > (count(count(node_cpu_seconds_total) by (cpu)) * 1.5)
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "CPU saturation detected"
      description: "Load average exceeds CPU capacity"
```

## 정리

CPU 사용량 분석의 체계적 접근법:

### 1단계: 기본 상황 파악

- `vmstat`: 전체 시스템 CPU 상태 확인
- `top/htop`: 프로세스별 CPU 사용률
- `uptime`: 로드 애버리지 확인

### 2단계: 세부 원인 분석

- `lsof`: 네트워크 연결과 파일 디스크립터
- `iostat`: I/O 대기와 CPU 관계
- `ps aux`: 프로세스 트리와 리소스 사용량

### 3단계: 심화 분석

- `perf`: CPU 핫스팟과 함수 레벨 분석
- `strace`: 시스템 콜 패턴 분석
- `sar`: 시간대별 패턴 분석

### 주요 성능 지표

- **us (user)**: 애플리케이션 코드 실행 시간
- **sy (system)**: 커널/시스템 콜 실행 시간  
- **wa (wait)**: I/O 대기 시간
- **r (runnable)**: 실행 대기 프로세스 수

### Production 모니터링 필수사항

- CPU 사용률 임계치 알림 (85% 이상)
- 로드 애버리지 모니터링 (CPU 코어 수 × 1.5 초과시)
- 프로세스별 CPU 사용 패턴 추적
- I/O 대기와 CPU 사용률 상관관계 분석

## 관련 문서

- [strace를 이용한 시스템 호출 분석](../debugging/strace-debugging.md)
- [Container 성능 최적화](container-performance-optimization.md)
- [Prometheus 메트릭 설계](../monitoring/prometheus-metrics-design.md)
