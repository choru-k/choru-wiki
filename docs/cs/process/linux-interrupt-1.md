---
tags:
  - Process
  - Linux
  - Interrupt
  - IRQ
  - Hardware
  - Kernel
---

# Linux 인터럽트 처리의 모든 것 (1): 인터럽트 이해하기 - 기초부터 아키텍처까지

## 들어가며

키보드를 누르면 화면에 글자가 나타나고, 네트워크 패킷이 도착하면 애플리케이션이 데이터를 받습니다. 이 모든 것이 "인터럽트"라는 메커니즘 덕분입니다. 오늘은 인터럽트가 무엇인지부터 시작해, Linux가 이를 어떻게 처리하는지 단계별로 알아보겠습니다.

## 인터럽트란 무엇인가?

### 일상적인 비유

인터럽트를 이해하는 가장 쉬운 방법은 일상 생활과 비교하는 것입니다:

```text
폴링(Polling) 방식:
당신: "피자 왔나요?"
배달원: "아직이요"
(5분 후)
당신: "피자 왔나요?"
배달원: "아직이요"
(5분 후)
당신: "피자 왔나요?"
배달원: "네, 왔어요!"

인터럽트(Interrupt) 방식:
당신: (다른 일 하는 중)
초인종: 딩동!
당신: (하던 일 멈추고) "네?"
배달원: "피자 배달입니다!"
```text

CPU도 마찬가지입니다. 계속 확인하는 대신, 이벤트가 발생하면 알림을 받습니다.

### 인터럽트가 없다면?

```c
// 인터럽트 없이 키보드 입력 받기 (폴링)
while (1) {
    if (keyboard_has_data()) {      // 계속 확인
        char key = read_keyboard();  // 데이터 읽기
        process_key(key);
    }

    if (network_has_packet()) {     // 계속 확인
        packet = read_network();
        process_packet(packet);
    }

    if (disk_io_complete()) {       // 계속 확인
        data = read_disk_result();
        process_data(data);
    }

    // CPU 100% 사용 중... 다른 일 못 함!
}
```text

**문제점:**

- CPU 낭비 (계속 확인만 함)
- 응답 지연 (순서대로만 확인)
- 확장성 없음 (디바이스 추가 시 더 느려짐)

## 인터럽트 기본 동작

### 인터럽트 발생 시 CPU의 동작

```text
1. 하드웨어 이벤트 발생 (예: 키보드 키 누름)
   ↓
2. 인터럽트 컨트롤러가 CPU에 신호
   ↓
3. CPU가 현재 작업 중단
   ↓
4. 현재 상태 저장 (레지스터, 프로그램 카운터 등)
   ↓
5. 인터럽트 핸들러 실행
   ↓
6. 인터럽트 처리 완료 신호 (EOI)
   ↓
7. 저장된 상태 복원
   ↓
8. 원래 작업 계속
```text

### 간단한 실습: 인터럽트 관찰하기

```bash
# 인터럽트 발생 현황 보기
$ cat /proc/interrupts
           CPU0       CPU1       CPU2       CPU3
  0:         19          0          0          0   IO-APIC   2-edge      timer
  1:       2043          0          0          0   IO-APIC   1-edge      i8042
  8:          1          0          0          0   IO-APIC   8-edge      rtc0
  9:          0          0          0          0   IO-APIC   9-fasteoi   acpi
 12:       4567          0          0          0   IO-APIC  12-edge      i8042

# 1초마다 변화 관찰
$ watch -n 1 'cat /proc/interrupts | head -5'

# 키보드 치면서 관찰
$ watch -n 0.1 'cat /proc/interrupts | grep i8042'
# 키보드 칠 때마다 숫자 증가!
```text

**해석:**

- 첫 번째 열: IRQ 번호
- CPU0-3: 각 CPU가 처리한 인터럽트 수
- 마지막 열: 디바이스 이름
  - `timer`: 시스템 타이머
  - `i8042`: 키보드/마우스 컨트롤러
  - `rtc0`: Real Time Clock

## 인터럽트 종류

### 1. 하드웨어 인터럽트 (External)

```text
외부 디바이스가 발생시키는 인터럽트:

키보드 인터럽트 (IRQ 1):
[키 누름] → [키보드 컨트롤러] → [인터럽트 발생] → [CPU]

네트워크 인터럽트 (IRQ 11):
[패킷 도착] → [NIC] → [인터럽트 발생] → [CPU]

디스크 인터럽트 (IRQ 14):
[I/O 완료] → [디스크 컨트롤러] → [인터럽트 발생] → [CPU]
```text

### 2. 소프트웨어 인터럽트 (Exception)

```c
// CPU 내부에서 발생하는 인터럽트

// 1. Fault: 복구 가능한 예외
int *p = NULL;
*p = 42;  // → Page Fault (인터럽트 14번)

// 2. Trap: 의도적 인터럽트
int result = 10 / 0;  // → Divide Error (인터럽트 0번)

// 3. System Call: 사용자가 커널 서비스 요청
write(1, "Hello", 5);  // → System Call (인터럽트 0x80 또는 syscall)
```text

### 3. Inter-Processor Interrupt (IPI)

```text
CPU 간 통신:
CPU0: "CPU1아, 스케줄링 다시 해!"
      → IPI 전송 → CPU1 인터럽트 받음
```text

## IRQ와 인터럽트 벡터

### IRQ (Interrupt Request) 번호

전통적인 PC의 IRQ 할당:

```text
IRQ 0:  System Timer      (매우 중요!)
IRQ 1:  Keyboard
IRQ 2:  Cascade (IRQ 8-15 연결)
IRQ 3:  COM2/COM4 (Serial Port)
IRQ 4:  COM1/COM3 (Serial Port)
IRQ 5:  LPT2 (Parallel Port) or Sound Card
IRQ 6:  Floppy Disk
IRQ 7:  LPT1 (Parallel Port)
IRQ 8:  Real Time Clock
IRQ 9:  Available (often ACPI)
IRQ 10: Available (often Network)
IRQ 11: Available (often USB/Sound)
IRQ 12: PS/2 Mouse
IRQ 13: Math Coprocessor
IRQ 14: Primary IDE
IRQ 15: Secondary IDE
```text

### 실습: IRQ 충돌과 공유

```bash
# PCI 디바이스의 IRQ 확인
$ lspci -v | grep -E "^[0-9]|IRQ"
00:1f.3 Audio device: Intel Corporation
        Interrupt: pin A routed to IRQ 16
02:00.0 Network controller: Intel Corporation
        Interrupt: pin A routed to IRQ 16  # 같은 IRQ 공유!

# IRQ 16을 공유하는 디바이스들
$ cat /proc/interrupts | grep " 16:"
 16:    1234    5678   IO-APIC  16-fasteoi   i801_smbus, snd_hda_intel
```text

## 인터럽트 컨트롤러의 진화

### 1세대: 8259 PIC (Programmable Interrupt Controller)

```text
간단하지만 제한적:
┌──────────────┐
│  Master PIC  │ ← IRQ 0-7
│    (8259)    │
│              ├──→ CPU (INTR pin)
│  IRQ2 ←──────┤
└──────────────┘
        ↑
┌──────────────┐
│  Slave PIC   │ ← IRQ 8-15
│    (8259)    │
└──────────────┘

문제점:
- 최대 15개 IRQ만 지원
- CPU 하나만 지원
- 우선순위 고정
```text

### 2세대: APIC (Advanced PIC)

```text
현대적 멀티코어 지원:
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│  CPU 0  │ │  CPU 1  │ │  CPU 2  │ │  CPU 3  │
│ LAPIC 0 │ │ LAPIC 1 │ │ LAPIC 2 │ │ LAPIC 3 │
└────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
     │           │           │           │
     └───────────┴───────────┴───────────┘
                        │
                  ┌─────────────┐
                  │   I/O APIC   │
                  └─────────────┘
                        ↑
                    디바이스들

장점:
- 각 CPU가 Local APIC 보유
- 224개 인터럽트 지원
- 동적 라우팅 가능
```text

### 실습: APIC 정보 확인

```bash
# Local APIC 정보
$ cat /proc/cpuinfo | grep apic
flags : ... apic sep mtrr pge mca cmov pat pse36 ...

# I/O APIC 정보
$ dmesg | grep -i apic
[    0.000000] ACPI: LAPIC_NMI (acpi_id[0xff] high edge lint[0x1])
[    0.000000] IOAPIC[0]: apic_id 2, version 32, address 0xfec00000, GSI 0-119

# MSI 지원 확인 (현대적 인터럽트)
$ lspci -v | grep MSI
        Capabilities: [80] MSI: Enable+ Count=1/1 Maskable- 64bit-
        Capabilities: [70] MSI-X: Enable+ Count=10 Masked-
```text

## 인터럽트 벡터 테이블

### CPU가 핸들러를 찾는 방법

```text
인터럽트 발생 → 벡터 번호 → 테이블 조회 → 핸들러 주소 → 실행

x86 인터럽트 벡터 (0-255):
┌────────────────────────────────┐
│ 0-31:  CPU 예외                │
│        0 = Divide by Zero      │
│        14 = Page Fault         │
├────────────────────────────────┤
│ 32-47: 레거시 IRQ (0-15)       │
│        32 = Timer (IRQ 0)      │
│        33 = Keyboard (IRQ 1)   │
├────────────────────────────────┤
│ 48-255: 동적 할당              │
│        PCI 디바이스들          │
│        MSI/MSI-X 벡터          │
└────────────────────────────────┘
```text

### 실습: 벡터 할당 확인

```bash
# 현재 벡터 사용 현황
$ cat /proc/interrupts | head -20
           CPU0       CPU1
  0:         19          0   IO-APIC   2-edge      timer
  8:          1          0   IO-APIC   8-edge      rtc0
  9:          0          0   IO-APIC   9-fasteoi   acpi
 24:          0          0   PCI-MSI 327680-edge   xhci_hcd
 25:      11936          0   PCI-MSI 512000-edge   ahci[0000:00:17.0]

# 벡터 번호 계산
# IRQ 24 = 벡터 24 + 32 = 56
# MSI는 48 이상의 동적 벡터 사용
```text

## CPU 친화도 (IRQ Affinity)

### 특정 CPU로 인터럽트 보내기

```bash
# IRQ 24의 현재 CPU 설정 확인
$ cat /proc/irq/24/smp_affinity
f  # 16진수: 1111 = 모든 CPU (0,1,2,3)

# CPU 0만 처리하도록 설정
$ sudo echo 1 > /proc/irq/24/smp_affinity
# 1 = 0001 (이진수) = CPU 0만

# 더 쉬운 방법: CPU 리스트
$ cat /proc/irq/24/smp_affinity_list
0-3  # CPU 0,1,2,3

$ sudo echo 2 > /proc/irq/24/smp_affinity_list
# 이제 CPU 2만 처리

# 결과 확인
$ watch -n 1 'cat /proc/interrupts | grep "24:"'
# CPU2 열의 숫자만 증가!
```text

### 왜 중요한가?

```text
시나리오: 웹서버 최적화

나쁜 예:
CPU0: 모든 네트워크 인터럽트 + 애플리케이션
CPU1: 놀고 있음
CPU2: 놀고 있음
CPU3: 놀고 있음
→ CPU0 과부하, 성능 저하

좋은 예:
CPU0: 네트워크 인터럽트 (eth0)
CPU1: 애플리케이션 스레드 1
CPU2: 애플리케이션 스레드 2
CPU3: 디스크 I/O 인터럽트
→ 부하 분산, 성능 향상
```text

## MSI: 현대적 인터럽트

### Legacy IRQ vs MSI

```text
Legacy IRQ (전통적 방식):
디바이스 → 물리적 인터럽트 선 → I/O APIC → CPU
- 선 공유 필요 (IRQ 부족)
- 라우팅 복잡
- 제한된 수 (15개)

MSI (Message Signaled Interrupts):
디바이스 → 메모리 쓰기 → CPU
- 공유 불필요
- 다수 벡터 (이론상 무제한)
- 효율적 라우팅
```text

### 실습: MSI 확인

```bash
# MSI 사용 디바이스 확인
$ cat /proc/interrupts | grep MSI
 24:       0       0   PCI-MSI 327680-edge      xhci_hcd
 25:   11936       0   PCI-MSI 512000-edge      ahci[0000:00:17.0]
 26:       0    3421   PCI-MSI 376832-edge      nvidia

# MSI-X (다중 벡터) 확인
$ lspci -v | grep -A3 MSI-X
        Capabilities: [70] MSI-X: Enable+ Count=10 Masked-
        Vector table: BAR=4 offset=00000000
        PBA: BAR=4 offset=00000800
```text

## 인터럽트 스톰과 문제 해결

### 인터럽트 스톰이란?

```text
정상:
인터럽트 → 처리 → 완료 → (휴식) → 인터럽트 → 처리 → 완료

스톰:
인터럽트→인터럽트→인터럽트→인터럽트→인터럽트→
(처리 못 함, CPU 100%)
```text

### 진단과 해결

```bash
# 1. 인터럽트 폭증 감지
$ watch -n 0.5 'cat /proc/interrupts | grep -E "CPU|eth"'
# 특정 IRQ가 초당 수만 개씩 증가?

# 2. 어떤 디바이스인지 확인
$ cat /proc/interrupts | grep 1000000  # 많은 수 찾기
 19: 1234567 0 0 0  IO-APIC  19-fasteoi  eth0  # 네트워크!

# 3. 임시 조치: CPU 친화도 변경
$ echo 0 > /proc/irq/19/smp_affinity  # 모든 CPU에서 제거

# 4. 근본 해결: 드라이버 파라미터 조정
$ ethtool -C eth0 rx-usecs 100  # 인터럽트 합치기 (coalescing)
```text

## 실전 최적화 예제

### 고성능 네트워크 서버 설정

```bash
#!/bin/bash
# optimize_irq.sh

# 1. irqbalance 중지 (수동 제어)
systemctl stop irqbalance

# 2. 네트워크 카드 큐 수 확인
QUEUES=$(ethtool -l eth0 | grep Combined | tail -1 | awk '{print $2}')
echo "Network queues: $QUEUES"

# 3. 각 큐를 다른 CPU에 할당
for I in $(seq 0 $((QUEUES-1))); do
    IRQ=$(grep "eth0-$I" /proc/interrupts | awk '{print $1}' | tr -d ':')
    if [ ! -z "$IRQ" ]; then
        echo $I > /proc/irq/$IRQ/smp_affinity_list
        echo "Queue $I (IRQ $IRQ) → CPU $I"
    fi
done

# 4. 애플리케이션을 다른 CPU에
taskset -c $QUEUES-$(($(nproc)-1)) ./my_application
```text

## 정리

인터럽트는 현대 컴퓨터의 핵심 메커니즘입니다:

1.**폴링 vs 인터럽트**: CPU 효율성의 차이
2.**IRQ와 벡터**: 인터럽트 식별과 라우팅
3.**PIC → APIC → MSI**: 진화하는 인터럽트 전달
4.**CPU 친화도**: 성능 최적화의 열쇠
5.**모니터링과 튜닝**: /proc/interrupts 활용

이제 기초를 이해했으니, 다음 편에서는 인터럽트 처리의 Top-half와 Bottom-half, 그리고 softirq의 세계로 들어가보겠습니다!

## 관련 문서

- [Linux 인터럽트 처리의 모든 것 2: Top-half, Bottom-half 그리고 ksoftirqd의 비밀](linux-interrupt-2.md)
- [Linux 인터럽트 처리의 모든 것 3: 타이머, 시간 관리, 그리고 CPU Isolation](linux-interrupt-3.md)
- [Linux 스케줄링 완벽 가이드 1: 스케줄링의 진화와 기본 개념](linux-scheduling-1.md)
