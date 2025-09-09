---
tags:
  - Process
  - Linux
  - Scheduling
  - CFS
  - Context-Switching
  - Performance
---

# Linux 스케줄링 완벽 가이드 (1): 스케줄링의 진화와 기본 개념

---
tags: [linux, scheduling, cfs, context-switching, load-average, nice, process-state, performance, operating-system]
---

## 들어가며

"왜 내 프로세스가 CPU를 100% 쓰는데도 시스템이 멈추지 않지?", "nice -20과 nice 19의 실제 차이가 뭐야?", "컨텍스트 스위칭이 많으면 왜 느려지는 거야?" 시스템을 운영하다 보면 이런 의문들이 생깁니다. 오늘은 Linux 스케줄링의 기초부터 시작해 실제 동작 원리를 파헤쳐보겠습니다.

## 스케줄링이란?

### 간단한 비유

```
식당 주방장(CPU)과 요리 주문(프로세스):

방법 1: 순서대로 (FIFO)
- 파스타(30분) → 샐러드(5분) → 음료(1분)
- 문제: 음료 손님이 36분 대기!

방법 2: 짧은 것 먼저 (SJF)
- 음료(1분) → 샐러드(5분) → 파스타(30분)
- 문제: 파스타가 늦게 시작하면 계속 밀림

방법 3: 시간 나누기 (Time Sharing)
- 파스타 10분 → 샐러드 5분 → 음료 1분 → 파스타 10분 → 파스타 10분
- 모든 손님이 조금씩 진행됨을 확인

Linux CFS: 공정하게 (Completely Fair)
- 각 주문이 받은 서비스 시간을 추적
- 가장 적게 받은 주문을 우선 처리
```

### CPU와 프로세스

```
실제 상황:
- CPU 코어: 4개
- 실행 가능한 프로세스: 100개

스케줄러의 역할:
1. 어떤 프로세스를 실행할지 선택
2. 얼마나 오래 실행할지 결정
3. 어느 CPU에서 실행할지 배치
4. 우선순위 고려
```

## 프로세스 상태와 스케줄링

### 프로세스 상태 전이

```
     생성(fork)
         ↓
    TASK_RUNNING ←──────────┐
    (실행 가능)             │
      ↓     ↑              │ 깨어남(wake up)
    실행 중  │              │
      ↓     ↑              │
    선점/양보               │
      ↓                    │
  대기 상태들:              │
  - TASK_INTERRUPTIBLE ────┘ (시그널 가능)
  - TASK_UNINTERRUPTIBLE     (I/O 대기)
  - TASK_STOPPED             (SIGSTOP)
  - TASK_ZOMBIE              (종료, 부모 대기)
```

### 실습: 프로세스 상태 확인

```bash
# 프로세스 상태 보기
$ ps aux | head -5
USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.1 169432 11384 ?        Ss   10:00   0:02 /sbin/init
root         2  0.0  0.0      0     0 ?        S    10:00   0:00 [kthreadd]
root         3  0.0  0.0      0     0 ?        I<   10:00   0:00 [rcu_gp]

# STAT 컬럼 의미:
# S: Sleeping (TASK_INTERRUPTIBLE)
# D: Disk sleep (TASK_UNINTERRUPTIBLE)
# R: Running (TASK_RUNNING)
# Z: Zombie (TASK_DEAD)
# T: Stopped (TASK_STOPPED)

# 상세 상태 확인
$ cat /proc/$$/status | grep State
State:S (sleeping)

# 실행 가능한 프로세스 수 (런큐 길이)
$ sar -q 1 3
10:30:01        runq-sz  plist-sz   ldavg-1   ldavg-5  ldavg-15
10:30:02              2       456      0.52      0.48      0.45
10:30:03              0       456      0.52      0.48      0.45
10:30:04              1       456      0.52      0.48      0.45
```

### 런큐(Run Queue) 구조

```c
// 각 CPU마다 자체 런큐 보유
struct rq {
    unsigned int nr_running;    // 실행 가능한 태스크 수
    u64 nr_switches;            // 컨텍스트 스위치 횟수
    
    struct cfs_rq cfs;          // CFS 스케줄러 큐
    struct rt_rq rt;            // 실시간 스케줄러 큐
    struct dl_rq dl;            // 데드라인 스케줄러 큐
    
    struct task_struct *curr;    // 현재 실행 중인 태스크
    struct task_struct *idle;    // idle 태스크
    
    u64 clock;                  // 런큐 클럭
    // ... 더 많은 필드
};
```

## 스케줄러의 진화

### 1. Linux 2.4: O(n) 스케줄러

```c
// 모든 프로세스를 순회하며 최적 선택 (느림!)
for (each process) {
    calculate_goodness();  // 우선순위 계산
}
select_best();  // O(n) 복잡도
```

### 2. Linux 2.6: O(1) 스케줄러

```c
// 우선순위별 큐 사용 (빠름!)
struct prio_array {
    unsigned long bitmap[5];     // 140개 우선순위 비트맵
    struct list_head queue[140]; // 우선순위별 큐
};

// 가장 높은 우선순위 찾기: O(1)
idx = find_first_bit(bitmap);
next = list_first_entry(&queue[idx]);
```

### 3. Linux 2.6.23+: CFS (현재)

```c
// Red-Black Tree 사용: O(log n)
struct sched_entity {
    struct rb_node run_node;    // RB-tree 노드
    u64 vruntime;              // 가상 실행 시간
};

// 가장 작은 vruntime 선택: O(log n)
leftmost = rb_first(&cfs_rq->tasks_timeline);
```

### 실습: 스케줄러 버전 확인

```bash
# 커널 버전 확인
$ uname -r
5.15.0-91-generic

# 스케줄러 확인 (CFS 사용 중)
$ cat /sys/kernel/debug/sched/features | head -5
GENTLE_FAIR_SLEEPERS
START_DEBIT
LAST_BUDDY
CACHE_HOT_BUDDY
WAKEUP_PREEMPTION

# 스케줄러 통계
$ cat /proc/sched_debug | head -20
Sched Debug Version: v0.11, 5.15.0-91-generic
ktime                                   : 1234567890.123456
sched_clk                               : 1234567890.123456
cpu_clk                                 : 1234567890.123456
jiffies                                 : 4295678901
```

## 컨텍스트 스위칭

### 컨텍스트 스위칭이란?

```
프로세스 A → 프로세스 B 전환:

1. A의 상태 저장
   - CPU 레지스터 (RAX, RBX, RCX...)
   - 프로그램 카운터 (RIP)
   - 스택 포인터 (RSP)
   - 플래그 레지스터

2. 메모리 맵 전환
   - 페이지 테이블 변경
   - TLB 플러시 (비용 높음!)

3. B의 상태 복원
   - 저장된 레지스터 복원
   - 프로그램 카운터 복원

4. B 실행 시작
```

### 컨텍스트 스위칭 비용 측정

```c
// context_switch_bench.c
#include <stdio.h>
#include <unistd.h>
#include <time.h>
#include <sched.h>
#include <sys/wait.h>

int main() {
    int pipe1[2], pipe2[2];
    pipe(pipe1); pipe(pipe2);
    
    struct timespec start, end;
    char buf = 'x';
    int iterations = 1000000;
    
    if (fork() == 0) {
        // Child: ping-pong
        for (int i = 0; i < iterations; i++) {
            read(pipe1[0], &buf, 1);
            write(pipe2[1], &buf, 1);
        }
        return 0;
    }
    
    // Parent: measure
    clock_gettime(CLOCK_MONOTONIC, &start);
    
    for (int i = 0; i < iterations; i++) {
        write(pipe1[1], &buf, 1);
        read(pipe2[0], &buf, 1);
    }
    
    clock_gettime(CLOCK_MONOTONIC, &end);
    wait(NULL);
    
    long ns = (end.tv_sec - start.tv_sec) * 1000000000 + 
              (end.tv_nsec - start.tv_nsec);
    
    printf("컨텍스트 스위치: %ld ns\n", ns / (iterations * 2));
    return 0;
}
```

```bash
$ gcc -O2 context_switch_bench.c -o csw_bench
$ ./csw_bench
컨텍스트 스위치: 1234 ns

# 시스템 전체 컨텍스트 스위치
$ vmstat 1
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 1  0      0 123456  78901 234567    0    0     0     0  234 1567  2  1 97  0  0
 0  0      0 123456  78901 234567    0    0     0     8  245 1423  1  1 98  0  0
#                                                             ↑ 초당 CS 횟수

# 프로세스별 컨텍스트 스위치
$ pidstat -w 1
10:45:01      UID       PID   cswch/s nvcswch/s  Command
10:45:02        0      1234      45.00      2.00  nginx
10:45:02        0      5678     234.00     12.00  mysql
# cswch/s: 자발적 스위치 (I/O 대기 등)
# nvcswch/s: 비자발적 스위치 (시간 할당 소진)
```

## 스케줄링 기본 매개변수

### 타임슬라이스와 퀀텀

```bash
# 기본 타임슬라이스 (CFS)
$ cat /proc/sys/kernel/sched_latency_ns
24000000  # 24ms - 목표 스케줄링 주기

$ cat /proc/sys/kernel/sched_min_granularity_ns
3000000   # 3ms - 최소 실행 시간

# 의미:
# - 8개 이하 태스크: 각각 3ms 이상 실행
# - 8개 초과: 24ms를 n으로 나눔

# 실습: 타임슬라이스 확인
$ cat > cpu_hog.c << 'EOF'
#include <stdio.h>
int main() {
    while(1) { /* CPU 소모 */ }
    return 0;
}
EOF

$ gcc cpu_hog.c -o cpu_hog
$ ./cpu_hog &
$ ./cpu_hog &
$ ./cpu_hog &

# 스케줄링 통계 확인
$ cat /proc/*/sched | grep -A2 "cpu_hog"
cpu_hog (12345, #threads: 1)

se.exec_start                                :      123456789.123456
se.vruntime                                  :          2345.678901
se.sum_exec_runtime                          :          1234.567890
nr_switches                                  :                  234
nr_voluntary_switches                        :                    0
nr_involuntary_switches                      :                  234
```

### Nice 값과 우선순위

```bash
# Nice 값 범위: -20 (높음) ~ 19 (낮음)
# 기본값: 0

# Nice 값 설정
$ nice -n 10 ./my_process    # Nice 10으로 시작
$ renice -n 5 -p 1234        # PID 1234를 Nice 5로 변경

# Nice 값과 CPU 시간 비율
# Nice 0 vs Nice 0 = 1:1
# Nice 0 vs Nice 5 = 3:1 (약)
# Nice 0 vs Nice 10 = 10:1 (약)

# 실험: Nice 값 영향
$ cat > nice_test.sh << 'EOF'
#!/bin/bash
# CPU 집약 작업 함수
cpu_work() {
    local nice_val=$1
    local name=$2
    nice -n $nice_val bash -c "
        start=\$(date +%s)
        count=0
        while [ \$(($(date +%s) - start)) -lt 10 ]; do
            count=\$((count + 1))
        done
        echo \"$name (nice $nice_val): \$count\"
    " &
}

cpu_work 0 "Normal"
cpu_work 10 "Low"
cpu_work -10 "High"

wait
EOF

$ sudo bash nice_test.sh
High (nice -10): 12345678
Normal (nice 0): 4567890
Low (nice 10): 1234567
# Nice 값에 따라 작업량 차이 확인
```

## Load Average의 진실

### Load Average란?

```
Load Average: 실행 가능 + 대기 중인 태스크의 평균 수

1분, 5분, 15분 평균:
$ uptime
 11:23:45 up 10 days, 3:14,  2 users,  load average: 2.45, 1.93, 1.65

해석:
- CPU 4개 시스템에서 2.45 = 61% 활용
- CPU 1개 시스템에서 2.45 = 245% 과부하 (1.45개 태스크 대기)
```

### Load Average 계산

```c
// 지수 가중 이동 평균 (EWMA)
// load = load * exp(-5/60) + n * (1 - exp(-5/60))
// n = 현재 실행 가능 태스크 수

// 실시간 관찰
while true; do
    cat /proc/loadavg
    sleep 1
done

# 출력: load_1m load_5m load_15m running/total last_pid
# 2.45 1.93 1.65 3/456 12345
#                ↑ 현재 실행 중/전체 태스크
```

### Load vs CPU 사용률

```bash
# 높은 Load, 낮은 CPU
# 원인: I/O 대기
$ dd if=/dev/zero of=/dev/null &  # CPU 100%
$ dd if=/dev/sda of=/dev/null &   # I/O 대기

$ uptime  # Load: 2.0
$ mpstat  # CPU: 50% (하나는 CPU, 하나는 I/O)

# D 상태 프로세스 찾기
$ ps aux | awk '$8 ~ /D/'
USER  PID %CPU %MEM    VSZ   RSS TTY STAT START   TIME COMMAND
root 1234  0.0  0.0   7360   680 ?   D    11:20   0:00 [flush-8:0]
```

## 스케줄러 통계와 모니터링

### /proc/schedstat 분석

```bash
$ cat /proc/schedstat
version 15
timestamp 4295691739
cpu0 0 0 0 0 0 0 3556164067 1025319  95896
domain0 0f 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ...

# 필드 의미 (cpu 라인):
# 7번째: 스케줄링 이벤트 수
# 8번째: CPU 마이그레이션 수
# 9번째: 컨텍스트 스위치 수

# 더 읽기 쉬운 형태
$ cat /proc/sched_debug | grep -A 10 "cpu#0"
```

### 실시간 모니터링 스크립트

```bash
#!/bin/bash
# sched_monitor.sh

echo "=== 스케줄링 모니터링 ==="
echo "CPU수: $(nproc)"
echo ""

while true; do
    clear
    echo "시간: $(date +%H:%M:%S)"
    echo ""
    
    # Load Average
    echo "Load Average: $(cat /proc/loadavg | cut -d' ' -f1-3)"
    echo ""
    
    # 런큐 길이
    echo "런큐 길이:"
    for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
        cpu_num=$(basename $cpu | sed 's/cpu//')
        runnable=$(cat /proc/sched_debug 2>/dev/null | \
                   grep -A 20 "cpu#$cpu_num" | \
                   grep nr_running | \
                   awk '{print $3}')
        echo "  CPU$cpu_num: $runnable"
    done
    echo ""
    
    # 컨텍스트 스위치
    echo "컨텍스트 스위치/초:"
    cs1=$(awk '/^ctxt/ {print $2}' /proc/stat)
    sleep 1
    cs2=$(awk '/^ctxt/ {print $2}' /proc/stat)
    echo "  $((cs2 - cs1))"
    
    sleep 4
done
```

## 실전 트러블슈팅

### 케이스 1: 높은 컨텍스트 스위칭

```bash
# 증상: 시스템이 느림, CS 높음
$ vmstat 1
procs  memory      page                    faults      cpu
r  b   si   so    in   cs us sy id wa st
12  0    0    0   234 45678  5  45 50  0  0
#                        ↑ 초당 45,678회!

# 원인 찾기
$ pidstat -wt 1
10:30:01      UID      TGID       TID   cswch/s nvcswch/s  Command
10:30:02        0      1234         -    1234.00     56.00  java
10:30:02        0         -      1235      567.00     12.00  |__java
10:30:02        0         -      1236      234.00    456.00  |__java

# 높은 nvcswch = CPU 경쟁
# 해결: CPU 추가 또는 프로세스 수 감소
```

### 케이스 2: 특정 프로세스 우선순위 조정

```bash
# 중요 데이터베이스 우선순위 높이기
$ pgrep mysqld
12345

$ sudo renice -n -10 -p 12345
12345 (process ID) old priority 0, new priority -10

# CPU 그룹으로 격리
$ sudo cgcreate -g cpu:/db_group
$ echo 8192 > /sys/fs/cgroup/cpu/db_group/cpu.shares  # 기본값의 8배
$ echo 12345 > /sys/fs/cgroup/cpu/db_group/cgroup.procs
```

## 정리

Linux 스케줄링의 기초를 이해했습니다:

1. **스케줄링 = CPU 시간 분배**: 공정성과 효율성의 균형
2. **프로세스 상태**: Running, Sleeping, Waiting이 스케줄링 대상 결정
3. **진화**: O(n) → O(1) → CFS (O(log n))
4. **컨텍스트 스위칭**: 1-2 마이크로초의 비용
5. **모니터링 포인트**: Load Average, 런큐, CS 횟수
6. **튜닝 포인트**: Nice 값, 타임슬라이스, CPU affinity

다음 편에서는 CFS의 핵심인 vruntime과 Red-Black Tree를 깊이 파헤쳐보겠습니다!

## 관련 문서

- [Linux 스케줄링 완벽 가이드 2: CFS Completely Fair Scheduler 깊이 파헤치기](linux-scheduling-2.md)
- [Process vs Thread 심화 3: 스케줄링, 시그널, 그리고 실전 선택 가이드](process-vs-thread-3.md)
- [Linux 인터럽트 처리의 모든 것 1: 인터럽트 이해하기](linux-interrupt-1.md)