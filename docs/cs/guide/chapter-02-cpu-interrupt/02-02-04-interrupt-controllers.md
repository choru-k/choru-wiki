---
tags:
  - APIC
  - PIC
  - balanced
  - intermediate
  - interrupt-controllers
  - interrupt-optimization
  - medium-read
  - performance-tuning
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 0
---

# 2.2.4: 인터럽트 컨트롤러

## 4. 인터럽트 컨트롤러

### 인텔 8259 PIC - 40년간 살아남은 레거시

인텔 베테랑 엔지니어의 증언:

> "1976년에 설계한 8259 PIC가 2024년에도 에뮤레이션되고 있다니... 당시엔 8개 인터럽트면 충분하다고 생각했죠. 지금은 CPU당 수천 개의 인터럽트를 처리합니다."

진화의 역사:

```text
1976: 8259 PIC    - 8개 인터럽트 (충분해!)
1981: IBM PC      - 2개 PIC 캐스케이드 (15개 인터럽트)
1996: APIC        - CPU당 224개 인터럽트
2008: x2APIC     - 2^32개 인터럽트 (40억개!)
2024: 현재        - PIC는 여전히 부팅 시 필요 😅
```

### 데이터센터의 인터럽트 전쟁

아마존 AWS 엔지니어의 경험:

> "100Gbps 네트워크 카드는 초당 1480만 패킷을 처리합니다. 각 패킷마다 인터럽트? 불가능! 우리는 인터럽트를 '스마트하게' 분산시킵니다."

```bash
# AWS EC2 인스턴스의 인터럽트 분산
$ cat /proc/interrupts | grep mlx
      CPU0   CPU1   CPU2   CPU3
mlx0-0:  0    0      0    1234567  # Queue 0 → CPU3
mlx0-1:  0    0   1234567    0     # Queue 1 → CPU2
mlx0-2:  0  1234567   0      0     # Queue 2 → CPU1
mlx0-3: 1234567 0     0      0     # Queue 3 → CPU0
# 완벽한 로드 밸런싱! 🎯
```

### 4.1 PIC와 APIC

```c
// 8259A PIC (Programmable Interrupt Controller)
#define PIC1_COMMAND    0x20
#define PIC1_DATA       0x21
#define PIC2_COMMAND    0xA0
#define PIC2_DATA       0xA1

void init_pic() {
    // ICW1: 초기화 시작
    outb(PIC1_COMMAND, 0x11);
    outb(PIC2_COMMAND, 0x11);

    // ICW2: 인터럽트 벡터 오프셋
    outb(PIC1_DATA, 0x20);  // IRQ 0-7: 벡터 32-39
    outb(PIC2_DATA, 0x28);  // IRQ 8-15: 벡터 40-47

    // ICW3: 캐스케이드 설정
    outb(PIC1_DATA, 0x04);  // IRQ2에 슬레이브 연결
    outb(PIC2_DATA, 0x02);  // 슬레이브 ID

    // ICW4: 8086 모드
    outb(PIC1_DATA, 0x01);
    outb(PIC2_DATA, 0x01);

    // 모든 인터럽트 마스크 해제
    outb(PIC1_DATA, 0x00);
    outb(PIC2_DATA, 0x00);
}

// EOI (End of Interrupt) 전송
void send_eoi(int irq) {
    if (irq >= 8) {
        outb(PIC2_COMMAND, 0x20);
    }
    outb(PIC1_COMMAND, 0x20);
}

// Local APIC (Advanced PIC)
typedef struct {
    uint32_t reserved0[8];
    uint32_t id;            // APIC ID
    uint32_t version;       // 버전
    uint32_t reserved1[4];
    uint32_t tpr;          // Task Priority
    uint32_t apr;          // Arbitration Priority
    uint32_t ppr;          // Processor Priority
    uint32_t eoi;          // End of Interrupt
    uint32_t rrd;          // Remote Read
    uint32_t ldr;          // Logical Destination
    uint32_t dfr;          // Destination Format
    uint32_t sivr;         // Spurious Interrupt Vector
    uint32_t isr[8];       // In-Service Register
    uint32_t tmr[8];       // Trigger Mode Register
    uint32_t irr[8];       // Interrupt Request Register
    uint32_t esr;          // Error Status
    uint32_t reserved2[6];
    uint32_t lvt_cmci;     // LVT CMCI
    uint32_t icr_low;      // Interrupt Command (low)
    uint32_t icr_high;     // Interrupt Command (high)
    uint32_t lvt_timer;    // LVT Timer
    uint32_t lvt_thermal;  // LVT Thermal
    uint32_t lvt_pmc;      // LVT Performance Counter
    uint32_t lvt_lint0;    // LVT LINT0
    uint32_t lvt_lint1;    // LVT LINT1
    uint32_t lvt_error;    // LVT Error
    uint32_t timer_initial;// Timer Initial Count
    uint32_t timer_current;// Timer Current Count
    uint32_t reserved3[4];
    uint32_t timer_divide; // Timer Divide Configuration
} __attribute__((packed)) local_apic_t;

#define LAPIC_BASE 0xFEE00000
local_apic_t* lapic = (local_apic_t*)LAPIC_BASE;

void init_local_apic() {
    // === APIC 시스템 레벨 컨텍스트 ===
    // 왜 APIC가 필요한가?
    // 1. 옛날 PIC(8259)는 15개 인터럽트만 지원 → 현대 시스템에는 부족
    // 2. 멀티 코어에서 인터럽트 부하 분산 필요
    // 3. 코어간 통신(IPI)을 위한 하드웨어 지원 필요

    // === 1단계: APIC 기본 활성화 ===
    // IA32_APIC_BASE MSR(Model Specific Register)에서 APIC 설정
    // MSR 0x1B = APIC 베이스 주소와 제어 비트들
    uint64_t apic_base;
    __asm__ volatile("rdmsr" : "=A"(apic_base) : "c"(0x1B));
    apic_base |= (1 << 11);  // APIC Enable 비트 - 이게 없으면 APIC 접근 불가!
    __asm__ volatile("wrmsr" : : "c"(0x1B), "A"(apic_base));

    // === 2단계: Spurious Interrupt Vector 설정 ===
    // Spurious = 가짜 인터럽트 (하드웨어 노이즈 등으로 발생)
    // 벡터 255는 관례적으로 spurious interrupt용으로 예약
    lapic->sivr = 0x100 | 0xFF;  // 비트 8 = APIC Enable, 하위 8비트 = Vector 255

    // === 3단계: 인터럽트 우선순위 시스템 설정 ===
    // TPR(Task Priority Register) = 현재 태스크의 우선순위
    // 0 = 모든 인터럽트 수신, 255 = 아무 인터럽트도 수신 안함
    // 실시간 시스템에서는 중요한 태스크가 실행중일 때 TPR을 높여서 방해 차단
    lapic->tpr = 0;  // 모든 인터럽트 허용 (일반적인 설정)

    // === 4단계: 외부 인터럽트 라인 설정 ===
    // LINT0/LINT1 = Legacy 인터럽트 핀들 (예전 PIC와의 호환성)
    // 현대 시스템에서는 대부분 사용하지 않음 → 마스크 처리
    lapic->lvt_lint0 = 0x00010000;  // Masked (비트 16 = 마스크 비트)
    lapic->lvt_lint1 = 0x00010000;  // Masked

    // === 5단계: 로컬 타이머 설정 ===
    // APIC 내장 타이머 = 각 코어마다 독립적인 타이머
    // OS 스케줄링, 시간 관리의 핵심 하드웨어
    lapic->timer_divide = 0x03;      // CPU 클록을 16으로 나눔 (분주비)
                                 // 예: 3GHz CPU → 187.5MHz 타이머 클록
    lapic->lvt_timer = 0x20020;      // Vector 32(0x20), Periodic Mode(비트 17)
                                 // 주기적으로 인터럽트 발생하여 스케줄러 호출
    lapic->timer_initial = 1000000;  // 초기 카운터 값 (약 5.3ms마다 인터럽트)
                                 // 이 값이 Linux의 timeslice 기본값과 연관!
}

// IPI (Inter-Processor Interrupt) 전송 - 멀티코어 협업의 핵심
// 실제 사용 사례:
// 1. CPU 0에서 CPU 1에게 "TLB 플러시하라!" 명령
// 2. 워크로드 밸런싱 - "이 태스크를 처리해달라"
// 3. 시스템 종료 - "모든 코어 정지!"
void send_ipi(int cpu_id, int vector) {
    // === IPI의 시스템적 중요성 ===
    // Google/Facebook 같은 대형 서버에서:
    // - 캐시 일관성 유지 (수천 번/초 IPI 발생)
    // - RCU (Read-Copy-Update) 동기화
    // - 실시간 로드 밸런싱

    // === 1단계: 목적지 CPU 지정 ===
    // ICR_HIGH의 상위 8비트(24-31)에 목적지 APIC ID 저장
    // APIC ID는 보통 CPU 번호와 같지만, 항상 그런 건 아님!
    lapic->icr_high = cpu_id << 24;

    // === 2단계: 인터럽트 전송 ===
    // ICR_LOW에 인터럽트 벡터와 전송 모드 설정
    // 비트 8-10 = Delivery Mode (000 = Fixed)
    // 비트 14 = Assert (1 = 인터럽트 발생)
    // 비트 15 = Trigger Mode (0 = Edge)
    lapic->icr_low = vector | (1 << 14);  // Fixed delivery mode

    // === 3단계: 하드웨어 레벨 전송 완료 대기 ===
    // 비트 12 = Delivery Status (1 = 전송 진행중, 0 = 완료)
    // 이 대기가 없으면 다음 IPI가 덮어써서 유실 가능!
    // 일반적으로 수 마이크로초 내에 완료됨
    while (lapic->icr_low & (1 << 12)) {
        // 매우 짧은 시간이지만, 멀티코어 시스템에서는
        // 이 순간에도 다른 코어들이 열심히 일하고 있음!
        __asm__ volatile("pause");  // CPU에게 "잠깐 기다리는 중"이라고 힌트
    }
}
```

## 5. 인터럽트 최적화

### 구글이 전기료를 아끼는 방법

구글 SRE의 비밀:

> "우리 데이터센터는 매일 수조 개의 인터럽트를 처리합니다. 각 인터럽트마다 CPU가 깨어나면? 전기료만 연간 수백만 달러! 그래서 우리는 '인터럽트 다이어트'를 합니다."

```python
# 인터럽트 최적화 전후 비교
# 측정: 10Gbps 트래픽 처리

# Before (순진한 방법)
power_consumption = {
    'interrupts_per_sec': 1_000_000,
    'cpu_wakeups': 1_000_000,
    'power_watts': 95,
    'annual_cost': '$82,000'
}

# After (최적화)
power_consumption = {
    'interrupts_per_sec': 1_000,  # 1000배 감소!
    'cpu_wakeups': 1_000,
    'power_watts': 45,  # 50% 절감!
    'annual_cost': '$39,000'  # 연간 $43,000 절약!
}
```

### 5.1 인터럽트 결합 (Interrupt Coalescing) - 택배 묶음 배송처럼

```c
// 네트워크 인터럽트 결합
typedef struct {
    uint32_t packets_received;
    uint32_t interrupt_count;
    uint64_t last_interrupt_time;

    // 결합 파라미터
    uint32_t max_packets;     // 최대 패킷 수
    uint32_t max_delay_us;    // 최대 지연 시간
} nic_interrupt_coalescing_t;

void configure_interrupt_coalescing(nic_interrupt_coalescing_t* nic) {
    // 적응형 인터럽트 결합
    uint32_t packet_rate = calculate_packet_rate(nic);

    if (packet_rate > HIGH_RATE_THRESHOLD) {
        // 높은 트래픽 - 더 많이 결합
        nic->max_packets = 64;
        nic->max_delay_us = 100;
    } else if (packet_rate > MEDIUM_RATE_THRESHOLD) {
        // 중간 트래픽
        nic->max_packets = 16;
        nic->max_delay_us = 50;
    } else {
        // 낮은 트래픽 - 낮은 지연
        nic->max_packets = 1;
        nic->max_delay_us = 10;
    }
}

// NAPI (New API) 스타일 폴링
void napi_poll_handler(struct napi_struct* napi) {
    int budget = 64;  // 한 번에 처리할 최대 패킷
    int processed = 0;

    // 인터럽트 비활성화
    disable_nic_interrupts();

    while (processed < budget) {
        struct packet* pkt = get_next_packet();
        if (!pkt) break;

        process_packet(pkt);
        processed++;
    }

    if (processed < budget) {
        // 모든 패킷 처리 완료 - 인터럽트 모드로 전환
        enable_nic_interrupts();
        napi_complete(napi);
    } else {
        // 아직 패킷 남음 - 폴링 계속
        napi_reschedule(napi);
    }
}
```

### 5.2 인터럽트 친화도 (Affinity) - CPU 매칭 서비스

리눅스 토르발스의 조언:

> "인터럽트를 아무 CPU에나 보내는 건 파티에 초대장을 무작위로 뿌리는 것과 같아. 네트워크 인터럽트는 네트워크 처리하는 CPU로, 디스크 인터럽트는 파일시스템 담당 CPU로 보내야지."

실제 게임 서버 최적화 사례:

```bash
# Before: 렉 발생! 😫
$ mpstat -P ALL 1
CPU0: %irq 95.2  # 인터럽트 폭탄!
CPU1: %irq  2.1
CPU2: %irq  1.5
CPU3: %irq  1.2
Game FPS: 45 (목표: 60)

# After: 인터럽트 친화도 설정 ✨
$ echo 2 > /proc/irq/24/smp_affinity  # NIC → CPU1
$ echo 4 > /proc/irq/25/smp_affinity  # NIC → CPU2
$ echo 8 > /proc/irq/26/smp_affinity  # Disk → CPU3
# CPU0는 게임 로직 전용

CPU0: %irq  0.1  # 게임 로직만!
CPU1: %irq 33.3  # 네트워크 RX
CPU2: %irq 33.3  # 네트워크 TX
CPU3: %irq 33.3  # 디스크 I/O
Game FPS: 60 🎮  # 목표 달성!
```

```c
// CPU별 인터럽트 분산
void set_irq_affinity(int irq, int cpu) {
    char path[256];
    sprintf(path, "/proc/irq/%d/smp_affinity", irq);

    FILE* f = fopen(path, "w");
    if (f) {
        fprintf(f, "%x", 1 << cpu);
        fclose(f);
    }
}

// 인터럽트 밸런싱
void balance_interrupts() {
    int num_cpus = sysconf(_SC_NPROCESSORS_ONLN);
    int irq_per_cpu[num_cpus];
    memset(irq_per_cpu, 0, sizeof(irq_per_cpu));

    // 현재 인터럽트 분포 확인
    FILE* f = fopen("/proc/interrupts", "r");
    // ... 파싱 ...

    // 네트워크 인터럽트를 여러 CPU에 분산
    for (int i = 0; i < num_network_queues; i++) {
        int target_cpu = i % num_cpus;
        set_irq_affinity(network_irqs[i], target_cpu);
    }

    // 디스크 인터럽트는 NUMA 노드 고려
    for (int i = 0; i < num_disk_controllers; i++) {
        int numa_node = get_device_numa_node(disk_controllers[i]);
        int target_cpu = get_numa_cpu(numa_node);
        set_irq_affinity(disk_irqs[i], target_cpu);
    }
}

// IRQ 스티어링 (MSI-X)
void configure_msi_x(struct pci_device* dev) {
    int num_vectors = pci_msix_vec_count(dev);

    // 벡터 할당
    struct msix_entry entries[num_vectors];
    for (int i = 0; i < num_vectors; i++) {
        entries[i].vector = i;
        entries[i].entry = 0;
    }

    pci_enable_msix_range(dev, entries, 1, num_vectors);

    // 각 벡터를 다른 CPU에 할당
    for (int i = 0; i < num_vectors; i++) {
        int cpu = i % num_online_cpus();
        irq_set_affinity_hint(entries[i].vector, cpumask_of(cpu));
    }
}
```

## 핵심 요점

### 1. 인터럽트 컨트롤러의 진화

8259 PIC에서 APIC, x2APIC로 발전하며 현대 멀티코어 시스템의 요구를 충족시켰습니다.

### 2. 인터럽트 최적화 전략

인터럽트 결합과 친화도 설정을 통해 성능을 크게 향상시킬 수 있습니다.

### 3. 전력 효율성

적절한 인터럽트 관리는 전력 소모를 향상해 대규모 데이터센터의 운영 비용을 절감합니다.

---

**이전**: [인터럽트 처리 과정과 예외](./02-02-03-interrupt-processing.md)
**다음**: [소프트 인터럽트와 실시간 처리](./02-02-05-software-interrupts.md)에서 소프트IRQ와 디버깅 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 시스템 프로그래밍
-**예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-02-cpu-interrupt)

- [Chapter 2-1-1: CPU 아키텍처와 명령어 실행 개요](./02-01-01-cpu-architecture.md)
- [Chapter 2-1-2: CPU 기본 구조와 명령어 실행](./02-01-02-cpu-fundamentals.md)
- [Chapter 2-1-3: 분기 예측과 Out-of-Order 실행](./02-01-03-prediction-ooo.md)
- [Chapter 2-1-4: CPU 캐시와 SIMD 벡터화](./02-01-04-cache-simd.md)
- [Chapter 2-1-5: 성능 측정과 실전 최적화](./02-01-05-performance-optimization.md)

### 🏷️ 관련 키워드

`interrupt-controllers`, `PIC`, `APIC`, `interrupt-optimization`, `performance-tuning`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
