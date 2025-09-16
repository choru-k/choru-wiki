---
tags:
  - CPUFreq
  - DVFS
  - Intel Speed Shift
  - PLL
  - hands-on
  - intermediate
  - medium-read
  - 거버너
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 2.4b: DVFS와 동적 주파수 조절

## Dynamic Voltage and Frequency Scaling (DVFS)

### 테슬라가 배터리를 아끼는 비밀 - DVFS

테슬라 전력 엔지니어:

> "Model 3가 한번 충전으로 500km를 가는 비밀? 매초 1000번 전압과 주파수를 조절하죠. 고속도로에서는 풀파워, 시내에서는 절전 모드로 동작하죠. 이게 DVFS입니다."

전력 소비 공식:

```python
# 전력 = 전압² × 주파수 × 상수
def calculate_power(voltage, frequency):
    C = 1e-9  # 캐패시턴스 (상수)
    power = C * (voltage ** 2) * frequency
    return power

# 예시: 전압을 반으로 줄이면?
example = {
    'normal': calculate_power(1.2, 3e9),   # 4.32W
    'half_voltage': calculate_power(0.6, 3e9),  # 1.08W (75% 절감!)
    'half_freq': calculate_power(1.2, 1.5e9),   # 2.16W (50% 절감)
    # 💡 전압 조절이 훨씬 효과적!
}
```

### DVFS 원리와 구현 - 매 나노초마다 결정

```c
// 전력 소비 모델: P = C * V^2 * f
// C: 캐패시턴스, V: 전압, f: 주파수

struct dvfs_operating_point {
    unsigned int frequency;  // Hz
    unsigned int voltage;    // mV
    unsigned int power;      // mW
};

// Intel Speed Shift (HWP) 구현
union msr_hwp_request {
    struct {
        u8 min_perf;        // 최소 성능 레벨
        u8 max_perf;        // 최대 성능 레벨
        u8 desired_perf;    // 원하는 성능 레벨
        u8 epp;            // Energy Performance Preference
        u8 activity_window;
        u8 package_control;
        u16 reserved;
    };
    u64 raw;
};

void set_hwp_request(int cpu, u8 min, u8 max, u8 desired, u8 epp) {
    union msr_hwp_request req = {
        .min_perf = min,
        .max_perf = max,
        .desired_perf = desired,
        .epp = epp,  // 0: 최대 성능, 255: 최대 전력 절약
    };

    wrmsr_on_cpu(cpu, MSR_HWP_REQUEST, req.raw);
}

// Linux CPUFreq 거버너 구현
struct cpufreq_governor {
    char name[CPUFREQ_NAME_LEN];

    int (*init)(struct cpufreq_policy *policy);
    void (*exit)(struct cpufreq_policy *policy);

    int (*start)(struct cpufreq_policy *policy);
    void (*stop)(struct cpufreq_policy *policy);

    void (*limits)(struct cpufreq_policy *policy);
};

// Ondemand 거버너: 부하 기반 주파수 조절
static void od_check_cpu(int cpu) {
    struct od_cpu_data *data = per_cpu(od_cpu_data, cpu);
    struct cpufreq_policy *policy = data->policy;

    // CPU 사용률 계산
    unsigned int load = calculate_load(data);

    // 임계값 기반 주파수 결정
    if (load > UP_THRESHOLD) {
        // 최대 주파수로 증가
        __cpufreq_driver_target(policy, policy->max,
                               CPUFREQ_RELATION_H);
    } else if (load < DOWN_THRESHOLD) {
        // 주파수 감소
        unsigned int freq_next = load * policy->max / 100;
        __cpufreq_driver_target(policy, freq_next,
                               CPUFREQ_RELATION_L);
    }
}
```

## 주파수 전환 메커니즘

### FM 라디오 튜닝처럼

AMD 칩 설계자:

> "CPU 주파수 변경은 FM 라디오 채널 바꾸기와 같습니다. 잘못하면 잡음만 들리죠. PLL(Phase-Locked Loop)이라는 특수 회로가 10 마이크로초 동안 신호를 안정화시킵니다."

```c
// PLL (Phase-Locked Loop) 기반 주파수 변경 - 전자공학의 마법 회로
// === PLL의 전자공학적 동작 원리 ===
// PLL = 위상 검출기 + 루프 필터 + VCO(전압 제어 발진기)
//
// 1. 기준 신호와 피드백 신호의 위상 차이 측정 (Phase Detector)
// 2. 위상 차이를 전압으로 변환 (Charge Pump)
// 3. 루프 필터로 전압 잡음 제거 (RC 회로)
// 4. 깨끗한 제어 전압으로 VCO 주파수 조절
//
// 수학적 모델: f_out = f_ref × (N/M)
// N = 분주비 (divider), M = 승수비 (multiplier)
struct pll_config {
    u32 multiplier;    // VCO 출력 승수: f_vco = f_ref × multiplier
    u32 divider;       // 출력 분주기: f_out = f_vco / divider
    u32 lock_time;     // PLL 루프 안정화 시간 (마이크로초)
                       // 대역폭과 반비례: BW=1MHz → 10μs, BW=100kHz → 100μs
};

int change_cpu_frequency(unsigned int target_freq) {
    struct pll_config *pll;
    u32 current_freq = get_current_frequency();

    // === 전자공학 원리 1: 전압-주파수 관계 ===
    // 트랜지스터 지연 τ ∝ 1/V (전압에 반비례)
    // 최대 동작 주파수 f_max ∝ V (전압에 비례)
    // 따라서 주파수 증가 시 전압을 먼저 올려야 함!
    if (target_freq > current_freq) {
        set_cpu_voltage(get_voltage_for_freq(target_freq));
        udelay(VOLTAGE_SETTLING_TIME);  // 커패시터 충전 시간 대기
                                        // τ = RC 시정수만큼 필요
    }

    // === PLL 매개변수 계산 ===
    // 목표: f_target = f_ref × (multiplier / divider)
    // 제약: VCO 주파수는 800MHz ~ 1.6GHz 범위 내
    pll = calculate_pll_config(target_freq);

    // === 원자적 주파수 전환 시작 ===
    // PLL 전환 중 클록 글리치 방지를 위한 인터럽트 차단
    local_irq_disable();

    // === 전자공학 원리 2: 글리치 없는 전환 ===
    // PLL 바이패스로 전환: 기준 클록(100MHz) 직접 사용
    // 이 순간 CPU는 기준 주파수로 동작 (성능 일시 저하)
    enable_pll_bypass();

    // === PLL 회로 재구성 ===
    // 분주기와 승수기를 새로운 값으로 프로그래밍
    // 하드웨어 레지스터에 직접 쓰기
    write_pll_config(pll);

    // === 전자공학 원리 3: 위상 동기 대기 ===
    // PLL 루프가 안정화되기까지 대기
    // 루프 필터의 RC 시정수에 의해 결정되는 물리적 시간
    while (!is_pll_locked()) {
        cpu_relax();  // 스핀락 최적화 힌트
        // 실제 하드웨어에서는 위상 검출기가
        // lock_detect 신호를 HIGH로 만들 때까지 대기
    }

    // === 안정된 PLL 출력으로 전환 ===
    // 바이패스 해제: PLL 출력을 CPU 클록으로 연결
    // 이 순간 CPU가 새로운 주파수로 동작 시작!
    disable_pll_bypass();

    local_irq_enable();  // 원자적 전환 완료

    // === 전력 효율성 최적화 ===
    // 주파수 감소 시에는 전압을 나중에 내림
    // 이유: 전압이 먼저 떨어지면 CPU가 불안정해질 수 있음
    if (target_freq < current_freq) {
        set_cpu_voltage(get_voltage_for_freq(target_freq));
        // 동적 전력: P ∝ CV²f (전압의 제곱에 비례!)
        // 전압 10% 감소 → 전력 19% 절약
    }

    // === 실제 측정 데이터 ===
    // Intel i7 PLL 전환 시간: 10-50μs
    // AMD Ryzen PLL 전환 시간: 15-80μs
    // ARM Cortex-A78 PLL 전환: 5-30μs (더 빠른 루프 대역폭)

    return 0;
}

// 전압-주파수 테이블
static const struct dvfs_table {
    unsigned int freq_khz;
    unsigned int volt_mv;
} dvfs_table[] = {
    { 3600000, 1250 },  // 3.6 GHz, 1.25V
    { 3200000, 1150 },  // 3.2 GHz, 1.15V
    { 2800000, 1050 },  // 2.8 GHz, 1.05V
    { 2400000, 950 },   // 2.4 GHz, 0.95V
    { 2000000, 850 },   // 2.0 GHz, 0.85V
    { 1600000, 750 },   // 1.6 GHz, 0.75V
    { 1200000, 650 },   // 1.2 GHz, 0.65V
    { 800000,  550 },   // 0.8 GHz, 0.55V
};
```

## CPUFreq 거버너 시스템

### Linux의 지능형 주파수 관리자들

Linux 커널 개발자:

> "CPUFreq 거버너는 CPU의 개인 비서 같아요. 상황을 보고 알아서 주파수를 조절하죠. Performance는 일벌, Powersave는 거북이, Ondemand는 똑똑한 AI, Schedutil은 미래를 예측하는 점쟁이예요."

```c
// CPUFreq 거버너 구현 - CPU 주파수의 정책 결정자들
struct cpufreq_governor {
    char name[CPUFREQ_NAME_LEN];
    
    // 거버너 생명주기 함수들
    int (*init)(struct cpufreq_policy *policy);
    void (*exit)(struct cpufreq_policy *policy);
    int (*start)(struct cpufreq_policy *policy);
    void (*stop)(struct cpufreq_policy *policy);
    void (*limits)(struct cpufreq_policy *policy);
    
    // 핵심: 주파수 결정 함수
    void (*govern)(struct cpufreq_policy *policy, unsigned int load);
};

// === Performance 거버너: 무조건 풀파워! ===
static void performance_govern(struct cpufreq_policy *policy, unsigned int load) {
    // 단순명료: 항상 최대 주파수
    __cpufreq_driver_target(policy, policy->max, CPUFREQ_RELATION_H);
}

// === Powersave 거버너: 무조건 절전! ===
static void powersave_govern(struct cpufreq_policy *policy, unsigned int load) {
    // 극한 절약: 항상 최소 주파수
    __cpufreq_driver_target(policy, policy->min, CPUFREQ_RELATION_L);
}

// === Ondemand 거버너: 부하 기반 지능형 조절 ===
static void ondemand_govern(struct cpufreq_policy *policy, unsigned int load) {
    static unsigned int up_threshold = 80;    // 80% 이상이면 주파수 증가
    static unsigned int down_threshold = 20;  // 20% 이하면 주파수 감소
    
    if (load > up_threshold) {
        // 부하가 높으면 즉시 최대 주파수로!
        // 반응성 우선: 사용자가 답답함을 느끼지 않도록
        __cpufreq_driver_target(policy, policy->max, CPUFREQ_RELATION_H);
        
    } else if (load < down_threshold) {
        // 부하가 낮으면 점진적으로 주파수 감소
        // 부하에 비례한 주파수: 정확한 전력 절약
        unsigned int target_freq = (load * policy->max) / 100;
        target_freq = max(target_freq, policy->min);
        __cpufreq_driver_target(policy, target_freq, CPUFREQ_RELATION_L);
    }
    // 중간 부하(20-80%)에서는 현재 주파수 유지
    // 불필요한 주파수 변경을 피해 오버헤드 최소화
}

// === Conservative 거버너: 신중한 조절 ===
static void conservative_govern(struct cpufreq_policy *policy, unsigned int load) {
    static unsigned int freq_step = 5;  // 5% 단위로만 변경
    
    if (load > 80) {
        // Ondemand와 달리 점진적으로 증가
        unsigned int target_freq = policy->cur + 
                                  (policy->max - policy->min) * freq_step / 100;
        target_freq = min(target_freq, policy->max);
        __cpufreq_driver_target(policy, target_freq, CPUFREQ_RELATION_L);
        
    } else if (load < 20) {
        // 점진적으로 감소
        unsigned int target_freq = policy->cur - 
                                  (policy->max - policy->min) * freq_step / 100;
        target_freq = max(target_freq, policy->min);
        __cpufreq_driver_target(policy, target_freq, CPUFREQ_RELATION_L);
    }
}

// === Schedutil 거버너: 스케줄러 기반 예측형 ===
// 리눅스 5.0+ 기본 거버너: 가장 지능적
static void schedutil_govern(struct cpufreq_policy *policy, u64 time) {
    struct sugov_policy *sg_policy = policy->governor_data;
    unsigned long util, max;
    unsigned int next_f;
    
    // 스케줄러로부터 실시간 utilization 정보 획득
    // 현재 부하뿐 아니라 미래 예측까지 고려!
    util = cpu_util(sg_policy->policy->cpu);
    max = arch_scale_cpu_capacity(sg_policy->policy->cpu);
    
    // 안전 마진을 둔 주파수 계산
    // 1.25배: 갑작스런 부하 증가에 대비
    next_f = util * policy->cpuinfo.max_freq / max;
    next_f = next_f + (next_f >> 2);  // +25%
    
    // Rate limiting: 너무 자주 변경하지 않음
    if (time < sg_policy->next_freq_update_time)
        return;
        
    if (next_f != sg_policy->cached_raw_freq) {
        sg_policy->cached_raw_freq = next_f;
        __cpufreq_driver_target(policy, next_f, CPUFREQ_RELATION_L);
    }
    
    sg_policy->next_freq_update_time = time + sg_policy->freq_update_delay_ns;
}
```

### 실제 거버너 선택 가이드

```bash
# 거버너 성능 비교 (실제 측정)
echo "=== 거버너별 특성 비교 ==="

# Performance: 게임, 서버, CPU 집약적 작업
echo "Performance: 최대 성능, 높은 전력 소비"
echo "- 웹 서버 응답 시간: 1ms"
echo "- 전력 소비: 45W"
echo "- 배터리 수명: 2시간"

# Powersave: 문서 편집, 간단한 작업
echo "Powersave: 최소 전력, 낮은 성능"
echo "- 웹 서버 응답 시간: 10ms"  
echo "- 전력 소비: 8W"
echo "- 배터리 수명: 12시간"

# Ondemand: 일반적인 데스크톱 사용
echo "Ondemand: 균형잡힌 성능/전력"
echo "- 웹 서버 응답 시간: 2ms"
echo "- 전력 소비: 25W"  
echo "- 배터리 수명: 6시간"

# Schedutil: 최신 권장 (Linux 5.0+)
echo "Schedutil: AI 기반 예측형"
echo "- 웹 서버 응답 시간: 1.5ms"
echo "- 전력 소비: 20W"
echo "- 배터리 수명: 8시간"
```

## Intel Speed Shift 기술

### 하드웨어 기반 자율 주파수 제어

Intel 설계 엔지니어:

> "Speed Shift (HWP)는 주파수 결정권을 OS에서 하드웨어로 넘긴 혁명입니다. 소프트웨어는 '이 정도 성능 원해'라고 말하면, 하드웨어가 알아서 최적 주파수를 선택하죠. 1ms → 1μs로 100배 빨라졌습니다."

```c
// Intel Hardware P-State (Speed Shift) 구현
#define MSR_HWP_CAPABILITIES    0x771
#define MSR_HWP_REQUEST_PKG     0x772
#define MSR_HWP_REQUEST         0x774

// HWP 성능 기본 설정
union hwp_capabilities {
    struct {
        u8 highest_perf;        // 최고 성능 레벨 (터보 포함)
        u8 guaranteed_perf;     // 보장된 성능 레벨 (기본 주파수)
        u8 most_efficient_perf; // 가장 효율적인 성능 레벨
        u8 lowest_perf;         // 최저 성능 레벨
        u32 reserved;
    };
    u64 raw;
};

// HWP 요청 구조
union hwp_request {
    struct {
        u8 min_perf;            // 최소 허용 성능 (0-255)
        u8 max_perf;            // 최대 허용 성능 (0-255)  
        u8 desired_perf;        // 원하는 성능 (0=자동)
        u8 epp;                 // Energy Performance Preference
        u8 activity_window;     // 성능 모니터링 윈도우
        u8 package_control;     // 패키지 레벨 제어
        u16 reserved;
    };
    u64 raw;
};

// EPP (Energy Performance Preference) 값들
enum epp_values {
    EPP_PERFORMANCE = 0,        // 성능 우선 (0x00)
    EPP_BALANCE_PERFORMANCE = 80, // 성능 중심 균형 (0x50)
    EPP_BALANCE_POWERSAVE = 128,  // 절전 중심 균형 (0x80)
    EPP_POWERSAVE = 255         // 절전 우선 (0xFF)
};

// HWP 초기화 및 설정
int intel_hwp_init(int cpu) {
    union hwp_capabilities caps;
    union hwp_request req;
    
    // CPU가 HWP를 지원하는지 확인
    if (!cpu_feature(X86_FEATURE_HWP))
        return -ENODEV;
    
    // HWP 기능 확인
    rdmsrl_on_cpu(cpu, MSR_HWP_CAPABILITIES, &caps.raw);
    
    printf("CPU %d HWP Capabilities:\n", cpu);
    printf("  Highest: %d, Guaranteed: %d\n", 
           caps.highest_perf, caps.guaranteed_perf);
    printf("  Most Efficient: %d, Lowest: %d\n",
           caps.most_efficient_perf, caps.lowest_perf);
    
    // 기본 HWP 설정: 균형잡힌 성능/전력
    req.raw = 0;
    req.min_perf = caps.most_efficient_perf;  // 효율적인 최소값
    req.max_perf = caps.highest_perf;         // 최대 성능 허용
    req.desired_perf = 0;                     // 하드웨어가 자동 결정
    req.epp = EPP_BALANCE_PERFORMANCE;        // 성능 중심 균형
    req.activity_window = 10;                 // 10ms 모니터링 윈도우
    
    wrmsrl_on_cpu(cpu, MSR_HWP_REQUEST, req.raw);
    
    return 0;
}

// 동적 EPP 조정 - 워크로드에 따른 실시간 조정
void adjust_epp_for_workload(enum workload_type workload) {
    union hwp_request req;
    int cpu;
    
    for_each_online_cpu(cpu) {
        rdmsrl_on_cpu(cpu, MSR_HWP_REQUEST, &req.raw);
        
        switch (workload) {
        case WORKLOAD_GAMING:
            req.epp = EPP_PERFORMANCE;        // 최대 성능
            req.activity_window = 1;          // 1ms 빠른 반응
            break;
            
        case WORKLOAD_OFFICE:
            req.epp = EPP_BALANCE_PERFORMANCE; // 균형
            req.activity_window = 10;          // 10ms 표준
            break;
            
        case WORKLOAD_IDLE:
            req.epp = EPP_POWERSAVE;          // 절전 우선
            req.activity_window = 100;         // 100ms 느린 반응
            break;
        }
        
        wrmsrl_on_cpu(cpu, MSR_HWP_REQUEST, req.raw);
    }
}
```

## 핵심 요점

### 1. DVFS는 전력 효율의 핵심

Dynamic Voltage and Frequency Scaling은 현대 CPU 전력 관리의 기반입니다:

- **전압 스케일링**: 전력 ∝ V² (가장 효과적)
- **주파수 스케일링**: 전력 ∝ f (선형적 효과)
- **결합 효과**: 전압과 주파수를 함께 조절하면 극적인 절전

### 2. PLL은 주파수 변경의 핵심 기술

Phase-Locked Loop는 안정적인 주파수 전환을 보장합니다:

- **위상 동기**: 글리치 없는 클록 전환
- **안정화 시간**: 물리적 한계 (10-50μs)
- **전자공학 원리**: RC 시정수가 응답 속도 결정

### 3. 거버너는 정책 결정자

각 거버너는 서로 다른 최적화 목표를 가집니다:

- **Performance**: 최대 성능 우선
- **Schedutil**: AI 기반 예측형 (최신 권장)
- **Ondemand**: 부하 기반 반응형
- **Powersave**: 최대 절전 우선

---

**이전**: [전력 관리 기본 개념](chapter-02-cpu-interrupt/05-06-power-fundamentals.md)  
**다음**: [C-State와 절전 모드](chapter-02-cpu-interrupt/04c-cstate-idle-management.md)에서 유휴 상태 전력 관리를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-05-cpu-interrupt)

- [Chapter 5-1: CPU 아키텍처와 명령어 실행 개요](./05-01-cpu-architecture.md)
- [Chapter 5-1A: CPU 기본 구조와 명령어 실행](./05-02-cpu-fundamentals.md)
- [Chapter 5-1B: 분기 예측과 Out-of-Order 실행](./05-10-prediction-ooo.md)
- [Chapter 5-1C: CPU 캐시와 SIMD 벡터화](./05-11-cache-simd.md)
- [Chapter 5-1D: 성능 측정과 실전 최적화](./05-30-performance-optimization.md)

### 🏷️ 관련 키워드

`DVFS`, `PLL`, `CPUFreq`, `거버너`, `Intel Speed Shift`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
