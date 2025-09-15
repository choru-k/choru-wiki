---
tags:
  - Process
  - Linux
  - Interrupt
  - Timer
  - CPU-Isolation
  - Realtime
---

# Linux 인터럽트 처리의 모든 것 (3): 타이머, 시간 관리, 그리고 CPU Isolation

## 들어가며

"왜 1000Hz로 설정했는데 정확히 1ms마다 실행되지 않지?", "CPU가 놀고 있는데도 타이머 인터럽트가 계속 발생해요", "실시간 처리를 위해 CPU를 독점하고 싶어요". 저지연 시스템이나 실시간 애플리케이션을 운영하다 보면 이런 문제들을 만나게 됩니다. 오늘은 Linux의 시간 관리와 CPU isolation에 대해 알아보겠습니다.

## Linux의 시간 개념

### 시간의 종류

```text
Linux가 관리하는 시간들:

1. Wall Clock Time (실제 시간)
   - RTC (Real Time Clock)에서 읽음
   - 2024-01-15 10:30:45 같은 실제 시간

2. Monotonic Time (단조 시간)
   - 부팅 후 경과 시간
   - 거꾸로 가지 않음 (NTP 조정에도)

3. CPU Time (프로세스 시간)
   - User time: 사용자 모드 실행 시간
   - System time: 커널 모드 실행 시간

4. Jiffies (시스템 틱)
   - 커널 내부 시간 단위
   - HZ값에 따라 다름 (100, 250, 1000Hz)
```text

### 실습: 다양한 시간 확인

```bash
# Wall clock time
$ date
Mon Jan 15 10:30:45 UTC 2024

# Uptime (monotonic)
$ uptime
 10:30:45 up 23 days, 14:22,  3 users

# Jiffies와 HZ
$ cat /proc/timer_list | grep -E "^jiffies|^.resolution"
jiffies: 12043938475
.resolution: 1 nsecs  # 타이머 해상도

# 시스템 HZ 값
$ grep CONFIG_HZ /boot/config-$(uname -r)
CONFIG_HZ_250=y
CONFIG_HZ=250  # 4ms마다 틱

# 프로세스 CPU 시간
$ cat /proc/self/stat | awk '{print "user:", $14/100, "sys:", $15/100}'
user: 0.12 sys: 0.03
```text

## Jiffies: 전통적 시간 관리

### Jiffies란?

```c
// 부팅 후 틱 카운트
extern unsigned long volatile jiffies;

// HZ = 250이면:
// 1 jiffy = 1/250초 = 4ms
// 1초 = 250 jiffies

// 시간 변환 매크로
#define HZ CONFIG_HZ
#define msecs_to_jiffies(m) ((m) * HZ / 1000)
#define jiffies_to_msecs(j) ((j) * 1000 / HZ)

// 사용 예
unsigned long timeout = jiffies + msecs_to_jiffies(100);
while (time_before(jiffies, timeout)) {
    // 100ms 동안 대기
}
```text

### Timer Wheel: O(1) 타이머 관리

```text
Timer Wheel 구조:
┌─────────────────────────────┐
│   TV1: 256 buckets (256ms)  │ ← 가장 가까운 미래
│   [0][1][2]...[255]         │   각 버킷 = 1 jiffy
├─────────────────────────────┤
│   TV2: 64 buckets (16초)    │ ← 중간 미래
│   [0][1][2]...[63]          │   각 버킷 = 256 jiffies
├─────────────────────────────┤
│   TV3: 64 buckets (17분)    │
├─────────────────────────────┤
│   TV4: 64 buckets (18시간)  │
├─────────────────────────────┤
│   TV5: 64 buckets (49일)    │ ← 먼 미래
└─────────────────────────────┘

매 틱마다:
1. TV1[current] 실행
2. current++
3. current == 256이면 TV2에서 TV1로 cascade
```text

### 문제: 정확도 한계

```bash
#!/bin/bash
# jiffy 정확도 테스트

cat > test_jiffy.c << 'EOF'
#include <stdio.h>
#include <time.h>
#include <unistd.h>

int main() {
    struct timespec start, end;

    for (int ms = 1; ms <= 10; ms++) {
        clock_gettime(CLOCK_MONOTONIC, &start);
        usleep(ms * 1000);  // ms 밀리초 요청
        clock_gettime(CLOCK_MONOTONIC, &end);

        long actual = (end.tv_sec - start.tv_sec) * 1000 +
                     (end.tv_nsec - start.tv_nsec) / 1000000;
        printf("요청: %dms, 실제: %ldms, ", ms, actual);
    }
}
EOF

gcc test_jiffy.c -o test_jiffy
./test_jiffy

# HZ=250 (4ms jiffy) 결과:
# 요청: 1ms, 실제: 4ms    # 다음 jiffy까지 대기!
# 요청: 2ms, 실제: 4ms
# 요청: 3ms, 실제: 4ms
# 요청: 4ms, 실제: 4ms
# 요청: 5ms, 실제: 8ms    # 2 jiffy
```text

## 고해상도 타이머 (hrtimer)

### hrtimer의 필요성

```text
Jiffy 기반 타이머의 한계:
- HZ=1000이어도 최소 1ms 단위
- 멀티미디어, 실시간 처리에 부족
- CPU가 idle이어도 주기적 인터럽트

hrtimer의 장점:
- 나노초 단위 정확도
- 틱리스 동작 가능
- 동적 틱 (필요할 때만)
```text

### hrtimer 구현

```c
// 고해상도 타이머 사용
#include <linux/hrtimer.h>

struct hrtimer my_timer;
ktime_t period;

enum hrtimer_restart timer_callback(struct hrtimer *timer)
{
    // 정확한 시간에 실행됨
    ktime_t now = ktime_get();
    printk("Timer fired at %lld ns, ", ktime_to_ns(now));

    // 다음 타이머 설정
    hrtimer_forward_now(timer, period);
    return HRTIMER_RESTART;
}

void setup_hrtimer(void)
{
    // 100 마이크로초마다
    period = ktime_set(0, 100000);  // 0초 + 100,000 나노초

    hrtimer_init(&my_timer, CLOCK_MONOTONIC, HRTIMER_MODE_REL);
    my_timer.function = timer_callback;
    hrtimer_start(&my_timer, period, HRTIMER_MODE_REL);
}
```text

### 실습: hrtimer 정확도 확인

```bash
# 고해상도 타이머 확인
$ cat /proc/timer_list | grep "Clock Event Device"
Clock Event Device: hpet
 max_delta_ns:   149983013276
 min_delta_ns:   13410
 mult:           61316549
 shift:          32
 mode:           3

# 이벤트 소스 확인
$ cat /sys/devices/system/clocksource/clocksource0/available_clocksource
tsc hpet acpi_pm

$ cat /sys/devices/system/clocksource/clocksource0/current_clocksource
tsc  # Time Stamp Counter (가장 빠름)

# 정확도 테스트
$ cyclictest -p 90 -t 4 -n -I 1000 -l 10000
# T: 0 ( 1234) P:90 I:1000 C:  10000 Min:      2 Act:    4 Avg:    3 Max:     15
# 1ms 간격 요청 → 평균 3us 오차 (매우 정확!)
```text

## Tickless Kernel (NO_HZ)

### 전통적 방식 vs Tickless

```text
전통적 방식 (HZ=1000):
│││││││││││││││││││││││││││││││││
└─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴
매 1ms마다 타이머 인터럽트 (초당 1000번)
CPU idle이어도 계속 깨어남

Tickless (NO_HZ_IDLE):
│─────────│───│─────────────│────
└─────────┴───┴─────────────┴────
필요할 때만 인터럽트 (이벤트 기반)
CPU idle 시 인터럽트 없음 → 전력 절약
```text

### NO_HZ 종류

```bash
# 커널 설정 확인
$ grep NO_HZ /boot/config-$(uname -r)
CONFIG_NO_HZ_COMMON=y
CONFIG_NO_HZ_IDLE=y    # Idle 시 틱 중단
# CONFIG_NO_HZ_FULL=n  # 특정 CPU 완전 틱리스

# NO_HZ_IDLE (일반적)
- CPU가 idle이면 틱 중단
- 작업이 있으면 틱 재개
- 전력 절약 목적

# NO_HZ_FULL (고급)
- 지정된 CPU는 항상 틱리스
- 단일 태스크 실행 시 인터럽트 최소화
- 실시간/저지연 목적
```text

### NO_HZ_FULL 설정

```bash
# 부트 파라미터 (grub)
GRUB_CMDLINE_LINUX="nohz_full=2-7 rcu_nocbs=2-7"

# 의미:
# - CPU 2-7: 틱리스 모드
# - CPU 0-1: 하우스키핑 (시스템 작업)
# - RCU 콜백도 CPU 2-7에서 제외

# 재부팅 후 확인
$ cat /sys/devices/system/cpu/nohz_full
2-7

# 틱 상태 모니터링
$ perf stat -a -e irq_vectors:local_timer_entry sleep 1
# CPU 0-1: 많은 타이머 인터럽트
# CPU 2-7: 거의 없음
```text

## CPU Isolation: 완벽한 독점

### isolcpus: CPU 격리

```bash
# 부트 파라미터
GRUB_CMDLINE_LINUX="isolcpus=4-7 nohz_full=4-7 rcu_nocbs=4-7"

# 효과:
# 1. 스케줄러가 자동으로 태스크 할당 안 함
# 2. 수동으로만 태스크 할당 가능
# 3. 인터럽트와 커널 스레드 최소화

# 확인
$ cat /sys/devices/system/cpu/isolated
4-7

# 일반 프로세스는 CPU 0-3만 사용
$ taskset -p $$
pid 1234's current affinity mask: f  # 0x0f = CPU 0-3만

# 격리된 CPU에 수동 할당
$ taskset -c 4 ./realtime_app  # CPU 4에서만 실행
```text

### 실전: 저지연 트레이딩 시스템

```bash
#!/bin/bash
# low_latency_setup.sh

# 1. CPU 격리 (부트 파라미터 필요)
# isolcpus=4-7 nohz_full=4-7 rcu_nocbs=4-7

# 2. IRQ 친화도 조정
echo 0-3 > /proc/irq/default_smp_affinity  # 기본 IRQ는 CPU 0-3
for irq in $(ls /proc/irq/*/smp_affinity_list); do
    echo 0-3 > $irq 2>/dev/null
done

# 3. 커널 스레드 이동
for pid in $(ps -eo pid,comm | grep '\[.*\]' | awk '{print $1}'); do
    taskset -p 0x0f $pid 2>/dev/null  # CPU 0-3으로
done

# 4. 실시간 우선순위 설정
chrt -f 99 taskset -c 4 ./trading_engine  # CPU 4, FIFO 우선순위 99

# 5. 메모리 잠금
echo 'vm.swappiness = 0' >> /etc/sysctl.conf
sysctl -p

# 6. CPU 주파수 고정
for cpu in 4 5 6 7; do
    echo performance > /sys/devices/system/cpu/cpu$cpu/cpufreq/scaling_governor
    # 최대 주파수 고정
    cat /sys/devices/system/cpu/cpu$cpu/cpufreq/cpuinfo_max_freq > \
        /sys/devices/system/cpu/cpu$cpu/cpufreq/scaling_min_freq
done
```text

### 지연 시간 측정

```bash
# cyclictest로 지연 측정
# 일반 CPU
$ cyclictest -p 90 -t 1 -n -I 1000 -l 10000 -a 0
T: 0 ( 5678) P:90 I:1000 C:  10000 Min:      5 Act:   12 Avg:   15 Max:    234

# 격리된 CPU
$ cyclictest -p 90 -t 1 -n -I 1000 -l 10000 -a 4
T: 0 ( 5679) P:90 I:1000 C:  10000 Min:      1 Act:    2 Avg:    2 Max:      8

# 결과: 최대 지연 234us → 8us (29배 개선!)
```text

## 실전 문제 해결

### 사례 1: 타이머 인터럽트 폭증

```bash
# 문제: CPU 사용률은 낮은데 인터럽트 많음
$ vmstat 1
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 1  0      0 1234567  89012 345678    0    0     0     0 10234  567  2  3 95  0  0
#                                                         ↑ 초당 1만 인터럽트!

# 원인 분석
$ cat /proc/timer_list | grep "active timers" -A 5
active timers:
 #0: <ffff88003fc0e840>, tick_sched_timer, S:01
 expires at 139562884000000-139562884000000 nsecs [in 3996000 to 3996000 nsecs]
 #1: <ffff880037a33e40>, hrtimer_wakeup, S:01
 expires at 139562894567890-139562894617890 nsecs [in 14563890 to 14613890 nsecs]

# 너무 많은 타이머 발견!

# 해결: 불필요한 타이머 제거
$ echo 0 > /proc/sys/kernel/timer_migration  # 타이머 마이그레이션 비활성화
```text

### 사례 2: 주기적 작업 지터

```python
# 문제: 100ms마다 실행해야 하는데 불규칙함

import time
import numpy as np

# 나쁜 예: sleep 사용
delays = []
for i in range(100):
    start = time.perf_counter()
    time.sleep(0.1)  # 100ms
    work()
    end = time.perf_counter()
    delays.append((end - start - 0.1) * 1000)

print(f"지터: {np.std(delays):.2f}ms")  # 5-10ms 지터!

# 좋은 예: 절대 시간 사용
import signal

def handler(signum, frame):
    work()

signal.signal(signal.SIGALRM, handler)
signal.setitimer(signal.ITIMER_REAL, 0.1, 0.1)  # 100ms 간격

# 또는 timerfd 사용 (더 정확)
import os
import struct
import select

fd = os.timerfd_create(os.CLOCK_MONOTONIC, 0)
os.timerfd_settime(fd, 0, struct.pack('QQII', 0, 100000000, 0, 100000000))

while True:
    select.select([fd], [], [])
    os.read(fd, 8)  # 타이머 이벤트 소비
    work()
```text

### 사례 3: 실시간 오디오 처리

```c
// 문제: 오디오 끊김 (언더런)

// 해결: 실시간 스케줄링 + CPU 격리
void setup_realtime_audio() {
    // 1. 실시간 우선순위
    struct sched_param param;
    param.sched_priority = 90;
    pthread_setschedparam(pthread_self(), SCHED_FIFO, &param);

    // 2. CPU 친화도
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(4, &cpuset);  // 격리된 CPU 4
    pthread_setaffinity_np(pthread_self(), sizeof(cpuset), &cpuset);

    // 3. 메모리 잠금
    mlockall(MCL_CURRENT | MCL_FUTURE);

    // 4. 타이머 설정
    struct itimerspec its;
    its.it_value.tv_sec = 0;
    its.it_value.tv_nsec = 5000000;  // 5ms (오디오 버퍼)
    its.it_interval = its.it_value;

    timer_t timerid;
    timer_create(CLOCK_MONOTONIC, NULL, &timerid);
    timer_settime(timerid, 0, &its, NULL);
}
```text

## 모니터링과 디버깅

### 타이머 통계

```bash
# 타이머 이벤트 추적
$ perf record -e timer:* -a sleep 10
$ perf report

# 타이머 소스별 분류
$ perf script | awk '{print $4}' | sort | uniq -c | sort -rn
   1234 timer:timer_start
    567 timer:hrtimer_start
    234 timer:timer_expire_entry

# 어떤 함수가 타이머를 많이 쓰는지
$ perf record -e timer:timer_start -a -g sleep 10
$ perf report --stdio
```text

### 인터럽트 지연 추적

```bash
# IRQ 지연 추적
$ echo 1 > /sys/kernel/debug/tracing/events/irq/enable
$ echo 1 > /sys/kernel/debug/tracing/events/sched/enable
$ cat /sys/kernel/debug/tracing/trace_pipe

# 특정 CPU의 타이머 인터럽트
$ trace-cmd record -e irq_vectors:local_timer_entry -C 4
$ trace-cmd report
```text

## 성능 튜닝 체크리스트

### 1. 저지연 시스템

```bash
# 체크리스트
□ NO_HZ_FULL 활성화
□ isolcpus로 CPU 격리
□ IRQ affinity 조정
□ 실시간 우선순위 설정
□ CPU 주파수 고정
□ C-state 비활성화
```text

### 2. 고처리량 시스템

```bash
# 타이머 합치기
echo 1000 > /proc/sys/kernel/timer_migration

# 불필요한 타이머 제거
systemctl stop atd
systemctl stop cron  # 필요시만

# Interrupt coalescing
ethtool -C eth0 rx-usecs 100
```text

### 3. 전력 효율

```bash
# Tickless 최대 활용
echo 1 > /sys/devices/system/cpu/cpuidle/current_governor

# C-state 활성화
for i in /sys/devices/system/cpu/cpu*/cpuidle/state*/disable; do
    echo 0 > $i
done
```text

## 정리

Linux의 시간 관리는 다양한 요구사항을 만족시키기 위해 진화했습니다:

1. **Jiffies → hrtimer**: 밀리초에서 나노초 정확도로
2. **주기적 틱 → Tickless**: 전력 효율과 성능 개선
3. **NO_HZ_FULL + isolcpus**: 실시간 성능 달성
4. **모니터링 도구**: timer_list, cyclictest, perf
5. **튜닝 포인트**: HZ, NO_HZ, CPU isolation, IRQ affinity

다음 편에서는 네트워킹 스택의 핵심인 sk_buff와 패킷의 여정을 따라가보겠습니다!

## 관련 문서

- [Linux 인터럽트 처리의 모든 것 1: 인터럽트 이해하기 - 기초부터 아키텍처까지](linux-interrupt-1.md)
- [Linux 인터럽트 처리의 모든 것 2: Top-half, Bottom-half 그리고 ksoftirqd의 비밀](linux-interrupt-2.md)
- [Linux 스케줄링 완벽 가이드 1: 스케줄링의 진화와 기본 개념](linux-scheduling-1.md)
