---
tags:
  - Process
  - Linux
  - Interrupt
  - Softirq
  - Tasklet
  - Performance
---

# Linux 인터럽트 처리의 모든 것 (2): Top-half, Bottom-half 그리고 ksoftirqd의 비밀

---
tags: [linux, interrupt, top-half, bottom-half, softirq, tasklet, workqueue, ksoftirqd, napi, network-performance]
---

## 들어가며

서버를 운영하다 보면 이런 상황을 만나게 됩니다: "ksoftirqd/0이 CPU 100%를 먹고 있어요!", "네트워크 트래픽이 높을 때 시스템이 느려져요". 이런 문제의 근본 원인은 Linux가 인터럽트를 "두 단계"로 처리하기 때문입니다. 오늘은 Top-half와 Bottom-half, 그리고 악명 높은 ksoftirqd에 대해 알아보겠습니다.

## 왜 인터럽트를 두 단계로 나눌까?

### 문제 상황

```
키보드 인터럽트 처리 시간:
1. 하드웨어에서 키 값 읽기: 1 마이크로초
2. 키 값을 버퍼에 저장: 1 마이크로초
3. 화면에 출력: 1000 마이크로초 (느림!)
4. 로그 파일에 기록: 5000 마이크로초 (더 느림!)

총 6002 마이크로초 동안:
- 다른 인터럽트 처리 못 함
- CPU는 인터럽트 모드에서 갇힘
- 시스템 전체가 멈춘 것처럼 보임
```

### 해결책: 작업 분할

```
Top-half (긴급한 것만):
1. 하드웨어에서 키 값 읽기: 1 마이크로초
2. 키 값을 버퍼에 저장: 1 마이크로초
3. "나중에 처리할 작업" 큐에 등록
→ 총 2 마이크로초 (빠름!)

Bottom-half (나중에 처리):
1. 화면에 출력: 1000 마이크로초
2. 로그 파일에 기록: 5000 마이크로초
→ 일반 컨텍스트에서 천천히 처리
```

## Top-half: 긴급 처리

### Top-half의 특징

```
Top-half가 실행되는 동안:
┌─────────────────────────────────┐
│ ✗ 다른 인터럽트 비활성화        │
│ ✗ 프로세스 스케줄링 중단        │
│ ✗ Sleep 불가능                  │
│ ✗ Mutex 사용 불가               │
│ ✓ Spinlock만 사용 가능          │
│ ✓ 매우 빠르게 실행해야 함       │
└─────────────────────────────────┘
```

### 실제 Top-half 코드 예시

```c
// 네트워크 카드의 인터럽트 핸들러 (Top-half)
irqreturn_t network_interrupt_handler(int irq, void *dev_id)
{
    struct net_device *dev = dev_id;
    
    // 1. 인터럽트 원인 확인 (빠름)
    u32 status = read_register(INTERRUPT_STATUS);
    
    // 2. 하드웨어 인터럽트 비활성화 (빠름)
    write_register(INTERRUPT_DISABLE, 0xFF);
    
    // 3. Bottom-half 스케줄링 (빠름)
    napi_schedule(&dev->napi);  // NAPI 큐에 추가
    
    return IRQ_HANDLED;  // 2-3 마이크로초 내 완료!
}
```

### Top-half 모니터링

```bash
# Top-half 실행 시간 측정
$ sudo perf record -e irq:irq_handler_entry,irq:irq_handler_exit -a sleep 1
$ sudo perf script | head -20

# 인터럽트별 처리 시간
swapper     0 [000]  1234.567890: irq:irq_handler_entry: irq=24
swapper     0 [000]  1234.567892: irq:irq_handler_exit: irq=24 ret=1
# 시간 차이 = 2 마이크로초 (좋음!)
```

## Bottom-half의 진화

### 1. 초기: Bottom Half (BH)

```c
// Linux 2.0 시절 (1996년)
// 문제: 32개만 가능, 동시 실행 불가

void mark_bh(int nr)  // Bottom-half 예약
{
    set_bit(nr, &bh_active);
}

// 종류가 32개로 제한
enum {
    TIMER_BH = 0,
    CONSOLE_BH,
    NET_BH,
    // ... 최대 32개
};
```

### 2. 개선: Tasklet

```c
// Linux 2.4+ (2001년~)
// 장점: 동적 생성, 같은 tasklet은 한 CPU에서만 실행

// Tasklet 선언
void my_tasklet_handler(unsigned long data)
{
    struct net_device *dev = (struct net_device *)data;
    // 패킷 처리 등 무거운 작업
}

DECLARE_TASKLET(my_tasklet, my_tasklet_handler, 0);

// Top-half에서 스케줄
irqreturn_t interrupt_handler(int irq, void *dev_id)
{
    // 긴급 처리...
    tasklet_schedule(&my_tasklet);  // Bottom-half 예약
    return IRQ_HANDLED;
}
```

### 3. 현재: Softirq

```c
// 가장 효율적, 멀티코어 최적화
// 동시에 여러 CPU에서 실행 가능

// Softirq 종류 (우선순위 순)
enum {
    HI_SOFTIRQ = 0,      // 높은 우선순위
    TIMER_SOFTIRQ,       // 타이머
    NET_TX_SOFTIRQ,      // 네트워크 송신
    NET_RX_SOFTIRQ,      // 네트워크 수신
    BLOCK_SOFTIRQ,       // 블록 I/O
    IRQ_POLL_SOFTIRQ,    // I/O 폴링
    TASKLET_SOFTIRQ,     // Tasklet 실행
    SCHED_SOFTIRQ,       // 스케줄러
    HRTIMER_SOFTIRQ,     // 고해상도 타이머
    RCU_SOFTIRQ,         // RCU
    NR_SOFTIRQS          // 총 10개
};
```

## Softirq 실행 시점

### Softirq가 실행되는 때

```
1. 하드웨어 인터럽트 처리 직후 (가장 일반적)
   Top-half 완료 → do_IRQ() → irq_exit() → invoke_softirq()

2. ksoftirqd 커널 스레드에서
   부하가 높을 때 전담 처리

3. 네트워크 폴링 (NAPI) 중
   패킷 처리 중 주기적으로

4. 명시적 호출
   local_bh_enable() 호출 시
```

### 실제 동작 관찰

```bash
# Softirq 실행 통계
$ cat /proc/softirqs
                    CPU0       CPU1       CPU2       CPU3
          HI:          1          0          0          0
       TIMER:     234567     198234     187654     176543
      NET_TX:      45678      34567      23456      12345
      NET_RX:     987654     876543     765432     654321
       BLOCK:      12345      23456      34567      45678
    IRQ_POLL:          0          0          0          0
     TASKLET:        234        345        456        567
       SCHED:     123456     234567     345678     456789
     HRTIMER:       1234       2345       3456       4567
         RCU:      98765      87654      76543      65432

# NET_RX가 가장 많음 = 네트워크 수신 부하
```

## ksoftirqd: Softirq 전담 처리자

### ksoftirqd가 필요한 이유

```
문제 상황: Softirq 폭풍

패킷 도착 → Softirq 실행 → 처리 중 더 많은 패킷 도착 
→ 또 Softirq → 무한 반복 → 일반 프로세스 실행 못 함!

해결책:
- 일정 횟수(10번) 이상 반복하면 ksoftirqd에게 위임
- ksoftirqd는 일반 프로세스처럼 스케줄링됨
- 다른 프로세스도 실행 기회를 가짐
```

### ksoftirqd 관찰

```bash
# ksoftirqd 스레드 확인 (CPU당 하나)
$ ps aux | grep ksoftirqd
root         9  0.0  0.0      0     0 ?        S    10:00   0:01 [ksoftirqd/0]
root        16  0.0  0.0      0     0 ?        S    10:00   0:00 [ksoftirqd/1]
root        22  0.0  0.0      0     0 ?        S    10:00   0:00 [ksoftirqd/2]
root        28  0.0  0.0      0     0 ?        S    10:00   0:00 [ksoftirqd/3]

# CPU 사용률 높을 때
$ top -p $(pgrep -d, ksoftirqd)
  PID USER      PR  NI  %CPU  COMMAND
    9 root      20   0  95.3  ksoftirqd/0    # CPU 0 과부하!
   16 root      20   0   2.0  ksoftirqd/1
   22 root      20   0   1.5  ksoftirqd/2
   28 root      20   0   1.8  ksoftirqd/3
```

### ksoftirqd 부하 원인 분석

```bash
#!/bin/bash
# softirq_debug.sh - ksoftirqd 부하 원인 찾기

echo "=== Softirq 통계 변화율 ==="
cat /proc/softirqs > /tmp/softirqs1
sleep 1
cat /proc/softirqs > /tmp/softirqs2

echo "초당 증가량:"
paste /tmp/softirqs1 /tmp/softirqs2 | awk '
{
    if (NF >= 10) {
        name = $1
        cpu0_diff = $6 - $2
        cpu1_diff = $7 - $3
        cpu2_diff = $8 - $4
        cpu3_diff = $9 - $5
        
        if (cpu0_diff > 10000 || cpu1_diff > 10000 || 
            cpu2_diff > 10000 || cpu3_diff > 10000) {
            printf "%-10s CPU0:%-8d CPU1:%-8d CPU2:%-8d CPU3:%-8d\n",
                   name, cpu0_diff, cpu1_diff, cpu2_diff, cpu3_diff
        }
    }
}'

# 결과 예시:
# NET_RX:    CPU0:95432   CPU1:2341    CPU2:1234    CPU3:987
# → CPU0에서 네트워크 수신 폭증!
```

## 실전: 네트워크 성능 문제 해결

### 사례 1: 단일 CPU 과부하

```bash
# 문제: CPU 0만 100%, 나머지는 놀고 있음
$ mpstat -P ALL 1
CPU    %usr   %nice    %sys %iowait   %irq  %soft  %steal  %guest   %idle
all    3.00    0.00   22.00    0.00   0.00  25.00    0.00    0.00   50.00
  0    1.00    0.00   14.00    0.00   0.00  85.00    0.00    0.00    0.00
  1    4.00    0.00   26.00    0.00   0.00   2.00    0.00    0.00   68.00
  2    3.00    0.00   25.00    0.00   0.00   1.00    0.00    0.00   71.00
  3    4.00    0.00   23.00    0.00   0.00   1.00    0.00    0.00   72.00

# 원인: 모든 네트워크 인터럽트가 CPU 0으로
$ cat /proc/interrupts | grep eth0
 24: 9876543      0      0      0   PCI-MSI-edge  eth0

# 해결: RSS(Receive Side Scaling) 활성화
$ ethtool -L eth0 combined 4  # 4개 큐 사용
$ ethtool -K eth0 ntuple on   # 흐름 제어 활성화

# IRQ 분산
$ for i in {0..3}; do
    echo $i > /proc/irq/$((24+i))/smp_affinity_list
done
```

### 사례 2: Softirq 처리 시간 초과

```bash
# 문제: 네트워크 지연 발생
$ dmesg | grep "NAPI poll"
[1234.567890] net_rx_action: 10 callbacks suppressed

# 원인: Softirq budget 초과
# 기본값: 한 번에 300개 패킷, 2ms 시간 제한

# 해결: Budget 증가
$ sysctl -w net.core.netdev_budget=600        # 패킷 수 증가
$ sysctl -w net.core.netdev_budget_usecs=4000 # 시간 증가 (4ms)

# GRO(Generic Receive Offload) 활성화로 패킷 합치기
$ ethtool -K eth0 gro on
```

### 사례 3: NAPI와 인터럽트 모드 전환

```bash
# NAPI (New API) 동작 모드
# 1. 낮은 트래픽: 인터럽트 모드
# 2. 높은 트래픽: 폴링 모드 (Softirq)

# 현재 모드 확인
$ ethtool -S eth0 | grep -E "rx_packets|rx_poll"
rx_packets: 12345678
rx_poll_count: 9876543  # 폴링 횟수

# Coalescing 조정 (인터럽트 합치기)
$ ethtool -C eth0 rx-usecs 100  # 100 마이크로초마다
$ ethtool -C eth0 rx-frames 64  # 또는 64 프레임마다

# 효과: 인터럽트 감소, Softirq 배치 처리
```

## Workqueue: 더 무거운 작업

### Softirq vs Workqueue

```
Softirq/Tasklet:
- 인터럽트 컨텍스트
- Sleep 불가
- 빠른 처리 필요
- CPU 친화도 고정

Workqueue:
- 프로세스 컨텍스트 (커널 스레드)
- Sleep 가능
- 무거운 작업 가능
- 스케줄링 가능
```

### Workqueue 사용 예

```c
// 드라이버에서 Workqueue 사용
struct work_struct my_work;

void my_work_handler(struct work_struct *work)
{
    // Sleep 가능한 무거운 작업
    msleep(10);
    
    // 파일 I/O 가능
    struct file *f = filp_open("/var/log/driver.log", O_WRONLY, 0);
    // ...
}

// 초기화
INIT_WORK(&my_work, my_work_handler);

// Top-half에서 스케줄
irqreturn_t interrupt_handler(int irq, void *dev_id)
{
    // 긴급 처리...
    
    // 무거운 작업은 Workqueue로
    schedule_work(&my_work);
    
    return IRQ_HANDLED;
}
```

### Workqueue 모니터링

```bash
# Workqueue 스레드 확인
$ ps aux | grep kworker
root        45  0.1  0.0      0     0 ?        I<   10:00   0:12 [kworker/0:1H]
root       234  0.0  0.0      0     0 ?        I    10:01   0:03 [kworker/u8:2]
root       567  0.0  0.0      0     0 ?        I    10:02   0:01 [kworker/1:2]

# Workqueue 통계
$ cat /sys/devices/virtual/workqueue/*/per_cpu/cpu0/stats
executed: 12345     # 실행된 작업 수
max_active: 256     # 최대 동시 작업
```

## 성능 튜닝 체크리스트

### 1. IRQ 분산 확인

```bash
# 균등 분산 확인
$ awk '{if(NR>1){for(i=2;i<=NF-2;i++)a[i]+=$i}}END{for(i in a)print "CPU"i-2": "a[i]}' /proc/interrupts

# 불균형 시 재분배
$ systemctl restart irqbalance
# 또는 수동 설정
```

### 2. Softirq 부하 분석

```bash
# CPU별 softirq 시간 비율
$ mpstat -P ALL 1 | grep -E "CPU|all"

# 높으면 (>30%):
# - 네트워크: RSS/RPS 확인
# - 디스크: I/O 스케줄러 확인
# - 타이머: 고해상도 타이머 확인
```

### 3. ksoftirqd 최적화

```bash
# ksoftirqd 우선순위 조정
$ renice -n -5 -p $(pgrep ksoftirqd)

# CPU 친화도 고정
$ taskset -cp 0 $(pgrep ksoftirqd/0)

# Real-time 우선순위 설정 (주의!)
$ chrt -f -p 50 $(pgrep ksoftirqd/0)
```

## 실전 트러블슈팅 플로우

```
증상: 시스템 느림
↓
1. top 확인 → ksoftirqd 높음?
   ↓ Yes
2. cat /proc/softirqs → 어떤 softirq?
   ↓
3. NET_RX 높음 → 네트워크 문제
   - ethtool -S 확인
   - RSS/RPS 설정
   - Coalescing 조정
   
   TIMER 높음 → 타이머 문제
   - /proc/timer_stats 확인
   - 불필요한 타이머 제거
   
   BLOCK 높음 → I/O 문제
   - iostat 확인
   - I/O 스케줄러 변경
```

## 정리

Linux의 인터럽트 처리는 효율성을 위해 두 단계로 나뉩니다:

1. **Top-half**: 긴급한 것만 빠르게 (마이크로초)
2. **Bottom-half**: 무거운 작업은 나중에 (Softirq/Tasklet/Workqueue)
3. **ksoftirqd**: Softirq 전담 처리로 시스템 균형 유지
4. **모니터링 포인트**: /proc/interrupts, /proc/softirqs, mpstat
5. **튜닝 포인트**: IRQ affinity, RSS/RPS, Coalescing

다음 편에서는 고해상도 타이머와 틱리스 커널, 그리고 실시간 성능을 위한 CPU isolation에 대해 알아보겠습니다!

## 관련 문서

- [Linux 인터럽트 처리의 모든 것 1: 인터럽트 이해하기 - 기초부터 아키텍처까지](linux-interrupt-1.md)
- [Linux 인터럽트 처리의 모든 것 3: 타이머, 시간 관리, 그리고 CPU Isolation](linux-interrupt-3.md)
- [Linux 스케줄링 완벽 가이드 1: 스케줄링의 진화와 기본 개념](linux-scheduling-1.md)