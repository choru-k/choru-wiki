---
tags:
  - Process
  - Linux
  - Scheduling
  - CFS
  - vruntime
  - Performance
---

# Linux 스케줄링 완벽 가이드 (2): CFS (Completely Fair Scheduler) 깊이 파헤치기

## 들어가며

"왜 CFS는 '완전히 공정하다'고 하는 거야?", "vruntime이 정확히 뭐야?", "Red-Black Tree를 쓰는 이유가 뭐지?" 이번 편에서는 Linux의 현재 스케줄러인 CFS(Completely Fair Scheduler)의 내부 동작을 상세히 파헤쳐보겠습니다.

## CFS의 핵심 아이디어

### 이상적인 공정성

```text
이상적인 CPU (무한 분할 가능):
4개 태스크가 동시에 각각 25%씩 사용

시간 →
Task A: ████████████████████████ (25%)
Task B: ████████████████████████ (25%)
Task C: ████████████████████████ (25%)
Task D: ████████████████████████ (25%)

현실 CPU (한 번에 하나만):
Task A: ████    ████    ████    
Task B:     ████    ████    ████
Task C:         ████    ████    
Task D:             ████    ████

CFS 목표: 현실을 이상에 최대한 가깝게!
```text

### CFS의 해법: 가상 런타임

```c
// 각 태스크가 "공정한 몫"을 받았는지 추적
struct sched_entity {
    u64 vruntime;  // Virtual Runtime
    // vruntime = 실제 실행 시간 * (nice에 따른 가중치)
};

// 가장 적게 실행된 태스크 선택
next_task = task_with_minimum_vruntime();
```text

## vruntime: 가상 실행 시간

### vruntime 계산

```c
// 실제 계산 공식 (단순화)
vruntime += delta_exec * (NICE_0_LOAD / task_load);

// Nice 0 태스크: vruntime = 실제 시간
// Nice -20 태스크: vruntime이 천천히 증가 (더 많이 실행)
// Nice 19 태스크: vruntime이 빨리 증가 (적게 실행)
```text

### 실습: vruntime 관찰

```bash
# 테스트 프로그램 생성
cat > vruntime_test.c << 'EOF'
#include <stdio.h>
#include <unistd.h>
#include <sys/time.h>
#include <sys/resource.h>

int main(int argc, char *argv[]) {
    int nice_val = argc > 1 ? atoi(argv[1]) : 0;
    setpriority(PRIO_PROCESS, 0, nice_val);
    
    printf("PID: %d, Nice: %d, ", getpid(), nice_val);
    
    while(1) {
        // CPU 집약 작업
        for(volatile int i = 0; i < 1000000; i++);
    }
    return 0;
}
EOF

gcc vruntime_test.c -o vruntime_test

# Nice 값이 다른 3개 프로세스 실행
./vruntime_test -10 & PID1=$!
./vruntime_test 0 & PID2=$!
./vruntime_test 10 & PID3=$!

# vruntime 확인
sleep 2
for pid in $PID1 $PID2 $PID3; do
    echo "PID $pid:"
    cat /proc/$pid/sched | grep -E "nr_switches|vruntime|sum_exec"
done

# 출력 예시:
# PID 1234 (Nice -10):
# se.vruntime                          :       12345.678901  (느리게 증가)
# se.sum_exec_runtime                  :       23456.789012  (많이 실행)
# nr_switches                          :            123

# PID 2345 (Nice 0):
# se.vruntime                          :       23456.789012  (중간)
# se.sum_exec_runtime                  :       23456.789012  (vruntime = 실제시간)
# nr_switches                          :            234

# PID 3456 (Nice 10):
# se.vruntime                          :       45678.901234  (빠르게 증가)
# se.sum_exec_runtime                  :       12345.678901  (적게 실행)
# nr_switches                          :            345

killall vruntime_test
```text

### Nice 값과 가중치

```c
// Nice 값에 따른 가중치 (kernel/sched/core.c)
const int sched_prio_to_weight[40] = {
    /* -20 */     88761,     71755,     56483,     46273,     36291,
    /* -15 */     29154,     23254,     18705,     14949,     11916,
    /* -10 */      9548,      7620,      6100,      4904,      3906,
    /*  -5 */      3121,      2501,      1991,      1586,      1277,
    /*   0 */      1024,       820,       655,       526,       423,
    /*   5 */       335,       272,       215,       172,       137,
    /*  10 */       110,        87,        70,        56,        45,
    /*  15 */        36,        29,        23,        18,        15,
};

// Nice 0 = 1024 (기준점)
// Nice -1 = 1277 (25% 더 많은 CPU)
// Nice +1 = 820 (20% 적은 CPU)
```text

### 실험: Nice 값별 CPU 시간 비율

```bash
#!/bin/bash
# nice_ratio_test.sh

# CPU 집약 작업 함수
cpu_burner() {
    nice -n $1 bash -c '
        count=0
        start=$(date +%s%N)
        while [ $(($(date +%s%N) - start)) -lt 5000000000 ]; do
            count=$((count + 1))
        done
        echo "Nice $1: $count"
    ' &
}

echo "=== Nice 값별 CPU 시간 비율 테스트 ==="
echo "5초 동안 실행..."

# 동시 실행
cpu_burner 0
cpu_burner 5
cpu_burner 10

wait

# 예상 결과:
# Nice 0: 1000000
# Nice 5: 400000   (약 40%)
# Nice 10: 100000  (약 10%)
```text

## Red-Black Tree: O(log n) 스케줄링

### 왜 Red-Black Tree인가?

```text
요구사항:
1. 가장 작은 vruntime 찾기: O(1) - leftmost 캐시
2. 태스크 삽입: O(log n)
3. 태스크 제거: O(log n)
4. 균형 보장: 최악의 경우도 O(log n)

Red-Black Tree 구조:
           10 (Black)
          /         \
      5 (Red)    15 (Black)
       /   \       /    \
   3(B)  7(B)  12(R)  20(B)

vruntime 기준 정렬:
- 왼쪽: 더 작은 vruntime (더 우선)
- 오른쪽: 더 큰 vruntime (나중에)
```text

### CFS 런큐 구조

```c
struct cfs_rq {
    struct rb_root_cached tasks_timeline;  // RB-tree 루트
    struct sched_entity *curr;              // 현재 실행 중
    struct sched_entity *next;              // 다음 실행 예정
    struct sched_entity *last;              // 마지막 실행
    struct sched_entity *skip;              // 건너뛸 태스크
    
    u64 min_vruntime;                      // 최소 vruntime
    unsigned int nr_running;               // 실행 가능 태스크 수
    
    struct rb_node *rb_leftmost;           // 캐시된 leftmost
};
```text

### 실습: RB-tree 시각화

```bash
# CFS 런큐 상태 덤프
sudo cat /sys/kernel/debug/sched/debug | grep -A 50 "cfs_rq"

# 간단한 시각화 스크립트
cat > show_rbtree.py << 'EOF'
#!/usr/bin/env python3
import subprocess
import re

def get_tasks():
    tasks = []
    for proc in subprocess.check_output(['ps', 'aux']).decode().split(', ')[1:]:
        if proc:
            parts = proc.split()
            pid = parts[1]
            try:
                with open(f'/proc/{pid}/sched', 'r') as f:
                    for line in f:
                        if 'se.vruntime' in line:
                            vruntime = float(line.split(':')[1])
                            tasks.append((pid, parts[10][:15], vruntime))
                            break
            except:
                pass
    return sorted(tasks, key=lambda x: x[2])

print("PID     Command         vruntime")
print("-" * 40)
for pid, cmd, vrt in get_tasks()[:20]:
    bar = '█' * min(int(vrt / 1000), 50)
    print(f"{pid:6} {cmd:15} {vrt:12.2f} {bar}")
EOF

python3 show_rbtree.py
```text

## 스케줄링 레이턴시와 그래뉼러티

### 주요 파라미터

```bash
# 스케줄링 레이턴시 (목표 주기)
$ cat /proc/sys/kernel/sched_latency_ns
24000000  # 24ms - 모든 태스크가 한 번씩 실행되는 목표 시간

# 최소 그래뉼러티 (최소 실행 시간)
$ cat /proc/sys/kernel/sched_min_granularity_ns
3000000   # 3ms - 태스크당 최소 실행 시간

# 웨이크업 그래뉼러티
$ cat /proc/sys/kernel/sched_wakeup_granularity_ns
4000000   # 4ms - 깨어난 태스크가 선점하기 위한 임계값

# 계산:
# nr_tasks <= 8: 각 태스크 3ms (24ms / 8)
# nr_tasks > 8: period = nr_tasks * min_granularity
```text

### 실험: 태스크 수와 타임슬라이스

```bash
#!/bin/bash
# timeslice_test.sh

test_timeslice() {
    local n=$1
    echo "=== $n 태스크 실행 ==="
    
    # n개 CPU 버너 시작
    for i in $(seq 1 $n); do
        taskset -c 0 nice -n 0 bash -c 'while true; do :; done' &
        pids="$pids $!"
    done
    
    sleep 3
    
    # 각 태스크의 스위치 횟수 측정
    for pid in $pids; do
        switches=$(cat /proc/$pid/sched 2>/dev/null | grep nr_switches | awk '{print $3}')
        echo "  PID $pid: $switches switches"
    done
    
    # 정리
    kill $pids 2>/dev/null
    wait $pids 2>/dev/null
    pids=""
    echo
}

# 다양한 태스크 수로 테스트
test_timeslice 2   # 각 12ms
test_timeslice 4   # 각 6ms
test_timeslice 8   # 각 3ms
test_timeslice 16  # 각 3ms (최소값)
```text

## 슬리퍼 페어니스 (Sleeper Fairness)

### 문제: 깨어난 태스크의 불이익

```text
시나리오:
Task A: CPU 집약 (계속 실행) → vruntime 계속 증가
Task B: I/O 집약 (자주 잠듦) → vruntime 증가 멈춤

Task B 깨어남:
- vruntime이 너무 작음 → 독점 위험
- 해결: vruntime 조정
```text

### CFS의 슬리퍼 보상

```c
// 깨어난 태스크의 vruntime 조정
if (GENTLE_FAIR_SLEEPERS) {
    // min_vruntime - sched_latency/2 정도로 설정
    // 약간의 보상은 주되, 독점은 방지
    vruntime = max(vruntime, min_vruntime - sched_latency/2);
}
```text

### 실습: 슬리퍼 페어니스 관찰

```c
// sleeper_test.c
#include <stdio.h>
#include <unistd.h>
#include <time.h>

void cpu_burner() {
    while(1) {
        for(volatile int i = 0; i < 10000000; i++);
    }
}

void io_simulator() {
    while(1) {
        for(volatile int i = 0; i < 1000000; i++);
        usleep(1000);  // 1ms 슬립
    }
}

int main(int argc, char *argv[]) {
    if (argc < 2) return 1;
    
    if (argv[1][0] == 'c') {
        printf("CPU burner (PID %d), ", getpid());
        cpu_burner();
    } else {
        printf("I/O simulator (PID %d), ", getpid());
        io_simulator();
    }
    
    return 0;
}
```text

```bash
gcc sleeper_test.c -o sleeper_test

# 실행
./sleeper_test c & CPU_PID=$!
./sleeper_test i & IO_PID=$!

sleep 5

# vruntime 비교
echo "CPU burner:"
cat /proc/$CPU_PID/sched | grep vruntime

echo "I/O simulator:"
cat /proc/$IO_PID/sched | grep vruntime

# I/O 시뮬레이터의 vruntime이 더 작지만,
# 너무 차이나지 않도록 조정됨

kill $CPU_PID $IO_PID
```text

## 그룹 스케줄링

### 왜 그룹 스케줄링이 필요한가?

```text
문제 상황:
User A: 1개 프로세스
User B: 100개 프로세스

공정한가?
- 프로세스 레벨: User B가 100배 많은 CPU
- 사용자 레벨: 불공정!

해결: 계층적 스케줄링
```text

### autogroup: 자동 그룹화

```bash
# autogroup 상태 확인
$ cat /proc/sys/kernel/sched_autogroup_enabled
1  # 활성화됨

# 각 세션(터미널)이 자동으로 그룹
# 터미널 1
$ nice -n 0 bash -c 'while true; do :; done' &

# 터미널 2
$ for i in {1..10}; do
    nice -n 0 bash -c 'while true; do :; done' &
done

# 결과: 터미널1 프로세스 50%, 터미널2 전체 50%
# (터미널2의 10개 프로세스가 각각 5%)

# autogroup 비활성화
$ sudo sysctl -w kernel.sched_autogroup_enabled=0
# 이제 11개 프로세스가 각각 ~9% 사용
```text

### CPU cgroup으로 수동 그룹화

```bash
# cgroup 생성
sudo cgcreate -g cpu:/mygroup

# CPU 공유 설정 (기본값 1024)
echo 2048 > /sys/fs/cgroup/cpu/mygroup/cpu.shares

# 프로세스 할당
echo $$ > /sys/fs/cgroup/cpu/mygroup/cgroup.procs

# 계층 구조
/sys/fs/cgroup/cpu/
├── cpu.shares (1024)
├── user.slice/
│   ├── cpu.shares (1024)
│   └── user-1000.slice/
│       └── cpu.shares (1024)
└── mygroup/
    └── cpu.shares (2048)  # 2배 가중치
```text

## CFS 튜닝

### 주요 튜닝 파라미터

```bash
# 1. 대화형 응답성 개선 (데스크톱)
sudo sysctl -w kernel.sched_latency_ns=15000000        # 15ms
sudo sysctl -w kernel.sched_min_granularity_ns=2000000 # 2ms
sudo sysctl -w kernel.sched_wakeup_granularity_ns=2000000

# 2. 처리량 최적화 (서버)
sudo sysctl -w kernel.sched_latency_ns=30000000        # 30ms
sudo sysctl -w kernel.sched_min_granularity_ns=5000000 # 5ms
sudo sysctl -w kernel.sched_wakeup_granularity_ns=10000000

# 3. 마이그레이션 비용
sudo sysctl -w kernel.sched_migration_cost_ns=5000000  # 5ms
# 이 시간 내 마이그레이션 금지 (캐시 친화성)
```text

### 실전 튜닝 예제

```bash
#!/bin/bash
# cfs_tuning_benchmark.sh

benchmark() {
    local desc=$1
    echo "=== $desc ==="
    
    # 테스트 워크로드
    sysbench cpu --cpu-max-prime=10000 --threads=8 run | grep "events per second"
    
    # 레이턴시 테스트
    hackbench -s 512 -l 200 -g 15 -f 25 -P
    echo
}

# 기본값
benchmark "Default settings"

# 낮은 레이턴시 설정
sudo sysctl -w kernel.sched_latency_ns=10000000
sudo sysctl -w kernel.sched_min_granularity_ns=1000000
benchmark "Low latency"

# 높은 처리량 설정
sudo sysctl -w kernel.sched_latency_ns=40000000
sudo sysctl -w kernel.sched_min_granularity_ns=8000000
benchmark "High throughput"

# 기본값 복원
sudo sysctl -w kernel.sched_latency_ns=24000000
sudo sysctl -w kernel.sched_min_granularity_ns=3000000
```text

## CFS 모니터링과 디버깅

### /proc/sched_debug 분석

```bash
# 전체 스케줄링 상태
sudo cat /proc/sched_debug

# 특정 CPU의 런큐 상태
sudo cat /proc/sched_debug | sed -n '/cpu#0/,/cpu#1/p'

# 주요 메트릭 추출 스크립트
cat > analyze_sched.sh << 'EOF'
#!/bin/bash

echo "=== CFS 런큐 분석 ==="
for cpu in 0 1 2 3; do
    echo -n "CPU$cpu: "
    sudo cat /proc/sched_debug | grep -A 30 "cpu#$cpu" | \
        grep -E "nr_running|nr_switches|min_vruntime" | \
        awk '{printf "%s=%s ", $1, $3}'
    echo
done

echo -e ", === 태스크별 vruntime TOP 10 ==="
for pid in $(ps -eo pid --no-headers | head -100); do
    if [ -r /proc/$pid/sched ]; then
        vrt=$(grep vruntime /proc/$pid/sched 2>/dev/null | awk '{print $3}')
        cmd=$(ps -p $pid -o comm= 2>/dev/null)
        [ -n "$vrt" ] && echo "$vrt $pid $cmd"
    fi
done | sort -n | head -10
EOF

bash analyze_sched.sh
```text

### perf를 이용한 스케줄링 추적

```bash
# 스케줄링 이벤트 기록
sudo perf sched record -a sleep 10

# 레이턴시 분석
sudo perf sched latency

# 스케줄링 맵 (시각화)
sudo perf sched map

# 특정 태스크 추적
sudo perf sched timehist -p $(pgrep firefox)
```text

## 실전 문제 해결

### 케이스 1: 특정 프로세스가 CPU를 독점

```bash
# 증상: 한 프로세스가 CPU 독점
$ top
PID USER      PR  NI    VIRT    RES  %CPU  COMMAND
1234 user     20   0  123456  12345  99.9  bad_app

# 원인 확인: vruntime이 멈춤?
$ cat /proc/1234/sched | grep vruntime
se.vruntime                          :         0.000000
# 버그 또는 실시간 태스크!

# 확인
$ ps -p 1234 -o pid,ni,pri,psr,pcpu,comm,cls
  PID  NI PRI PSR %CPU COMMAND         CLS
 1234   0  20   0 99.9 bad_app         TS

# 해결: Nice 값 조정
$ sudo renice 19 -p 1234
```text

### 케이스 2: 그룹 스케줄링 불균형

```bash
# Docker 컨테이너간 불균형
$ docker stats
CONTAINER  CPU %
web        180%   # 2 CPU 가까이 사용
db         20%    # 부족

# 원인: cpu.shares 차이
$ cat /sys/fs/cgroup/cpu/docker/*/cpu.shares
2048  # web 컨테이너
512   # db 컨테이너

# 해결: shares 조정
$ docker update --cpu-shares 1024 web
$ docker update --cpu-shares 1024 db
```text

## 정리

CFS는 "완전한 공정성"을 추구하는 정교한 스케줄러입니다:

1. **vruntime**: Nice 값으로 가중치를 준 가상 실행 시간
2. **Red-Black Tree**: O(log n) 효율적 태스크 선택
3. **슬리퍼 페어니스**: I/O 집약 태스크 보호
4. **그룹 스케줄링**: 계층적 공정성 보장
5. **튜닝 포인트**: latency, granularity, migration cost
6. **모니터링**: /proc/sched_debug, perf sched

다음 편에서는 실시간 스케줄링 클래스와 우선순위 역전 문제를 다루겠습니다!

## 관련 문서

- [Linux 스케줄링 완벽 가이드 1: 스케줄링의 진화와 기본 개념](linux-scheduling-1.md)
- [Process vs Thread 심화 3: 스케줄링, 시그널, 그리고 실전 선택 가이드](process-vs-thread-3.md)
- [Linux 인터럽트 처리의 모든 것 1: 인터럽트 이해하기](linux-interrupt-1.md)
