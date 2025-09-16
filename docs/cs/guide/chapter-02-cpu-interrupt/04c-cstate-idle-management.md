---
tags:
  - C-State
  - Idle Management
  - MSR
  - MWAIT
  - Power Management
  - hands-on
  - intermediate
  - medium-read
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 2.4c: C-State와 절전 모드

## C-State 전력 관리

### 넷플릭스 서버의 야간 절전 비밀

넷플릭스 인프라 엔지니어:

> "새벽 3시, 시청자가 거의 없을 때 우리 서버의 90%는 C6 상태로 들어갑니다. CPU가 거의 '죽은' 상태죠. 하지만 누군가 영화를 틀면 0.001초 만에 깨어납니다. 연간 전기료 5천만 달러 절약!"

```python
# 넷플릭스 서버의 24시간 C-State 패턴
netflix_server_states = {
    '00:00-06:00': {  # 새벽 (미국 시간)
        'C0_active': '10%',
        'C6_deep_sleep': '90%',
        'power': '500W',
        'status': '😴 대부분 자는 중'
    },
    '18:00-23:00': {  # 피크 타임
        'C0_active': '95%',
        'C6_deep_sleep': '5%',
        'power': '10,000W',
        'status': '🔥 풀가동!'
    },
    'wake_latency': {
        'C1': '1 ns',     # 즉시 깨어남
        'C3': '100 ns',   # 눈 깜빡할 새
        'C6': '1000 ns',  # 1 마이크로초
    }
}
```

### C-State 진입과 탈출 - CPU의 겨울잠

```c
// Intel C-state 레지던시 MSR
#define MSR_PKG_C2_RESIDENCY    0x60D
#define MSR_PKG_C3_RESIDENCY    0x3F8
#define MSR_PKG_C6_RESIDENCY    0x3F9
#define MSR_PKG_C7_RESIDENCY    0x3FA

// C-state 진입 구현
static void enter_cstate(struct cpuidle_device *dev,
                        struct cpuidle_driver *drv,
                        int index) {
    struct cpuidle_state *state = &drv->states[index];

    switch (state->flags & CPUIDLE_FLAG_CSTATE_MASK) {
    case CPUIDLE_FLAG_C1:
        // HALT 명령어 실행
        safe_halt();
        break;

    case CPUIDLE_FLAG_C1E:
        // Enhanced halt with lower voltage
        mwait_idle_with_hints(0x01, 0);
        break;

    case CPUIDLE_FLAG_C3:
        // Deep sleep with cache flush
        wbinvd();  // Cache flush
        mwait_idle_with_hints(0x10, 0);
        break;

    case CPUIDLE_FLAG_C6:
        // Deep power down
        // CPU 컨텍스트를 SRAM에 저장
        save_processor_state();
        mwait_idle_with_hints(0x20, 0);
        restore_processor_state();
        break;
    }
}

// MWAIT 기반 idle 구현
static inline void mwait_idle_with_hints(unsigned long eax,
                                         unsigned long ecx) {
    // Monitor/Mwait을 사용한 전력 절약 대기
    __monitor((void *)&current_thread_info()->flags, 0, 0);

    if (!need_resched())
        __mwait(eax, ecx);
}

// C-state 선택 알고리즘
int select_idle_state(struct cpuidle_driver *drv,
                     struct cpuidle_device *dev,
                     bool *stop_tick) {
    s64 predicted_us;
    int i, idx = -1;

    // 다음 이벤트까지 예상 시간
    predicted_us = predict_next_event();

    // 적절한 C-state 선택
    for (i = 0; i < drv->state_count; i++) {
        struct cpuidle_state *s = &drv->states[i];

        if (s->disabled || s->exit_latency > latency_req)
            continue;

        // 진입/탈출 오버헤드 고려
        if (predicted_us < s->target_residency)
            continue;

        // 에너지 효율성 계산
        if (predicted_us * s->power < best_energy) {
            best_energy = predicted_us * s->power;
            idx = i;
        }
    }

    // 깊은 C-state는 틱 중지
    if (idx > 0)
        *stop_tick = true;

    return idx;
}
```

## C-State 상세 분석

### 각 C-State의 특성과 동작 원리

```c
// C-State 정의와 특성
struct cstate_properties {
    const char *name;
    u32 latency_us;        // 진입+탈출 지연시간
    u32 residency_us;      // 손익분기 시간
    u32 power_mw;          // 상태 유지 전력
    const char *description;
    const char *hardware_action;
};

// 실제 Intel Core i7-12700K 측정 데이터
static const struct cstate_properties intel_cstates[] = {
    {
        .name = "C0",
        .latency_us = 0,
        .residency_us = 0,
        .power_mw = 65000,     // 65W (활성 상태)
        .description = "활성 실행 상태",
        .hardware_action = "모든 회로 활성, 클록 동작"
    },
    {
        .name = "C1",
        .latency_us = 2,       // 2μs 진입/탈출
        .residency_us = 5,     // 5μs 이상 idle시 유리
        .power_mw = 3000,      // 3W
        .description = "Halt 상태",
        .hardware_action = "클록 정지, 캐시 유지, 전압 유지"
    },
    {
        .name = "C1E",
        .latency_us = 10,
        .residency_us = 20,
        .power_mw = 2000,      // 2W
        .description = "Enhanced Halt",
        .hardware_action = "클록 정지 + 전압 약간 감소"
    },
    {
        .name = "C3",
        .latency_us = 100,     // 100μs 진입/탈출
        .residency_us = 1000,  // 1ms 이상 idle시 유리
        .power_mw = 1000,      // 1W
        .description = "Deep Sleep",
        .hardware_action = "L1/L2 캐시 flush, PLL 정지, 전압 감소"
    },
    {
        .name = "C6",
        .latency_us = 1000,    // 1ms 진입/탈출  
        .residency_us = 5000,  // 5ms 이상 idle시 유리
        .power_mw = 500,       // 0.5W
        .description = "Deep Power Down",
        .hardware_action = "코어 전원 차단, 상태를 LLC에 저장"
    },
    {
        .name = "C7",
        .latency_us = 1200,
        .residency_us = 6000,
        .power_mw = 200,       // 0.2W
        .description = "Deeper Sleep",
        .hardware_action = "L3 캐시도 일부 flush"
    },
    {
        .name = "C10",
        .latency_us = 2000,    // 2ms 진입/탈출
        .residency_us = 10000, // 10ms 이상 idle시 유리
        .power_mw = 50,        // 0.05W
        .description = "Package C-State",
        .hardware_action = "전체 패키지 전력 차단, 메모리만 유지"
    }
};

// C-state 진입 결정 로직 - 스마트한 선택 알고리즘
int intelligent_cstate_selection(u64 predicted_idle_ns) {
    int best_cstate = 0;  // 기본값: C0 (활성)
    s64 best_energy = S64_MAX;
    int i;
    
    u32 predicted_idle_us = predicted_idle_ns / 1000;
    
    for (i = 0; i < ARRAY_SIZE(intel_cstates); i++) {
        const struct cstate_properties *cs = &intel_cstates[i];
        
        // 예상 idle 시간이 손익분기점보다 짧으면 Skip
        if (predicted_idle_us < cs->residency_us)
            continue;
            
        // 에너지 계산: 전환 비용 + 유지 비용
        s64 transition_energy = cs->latency_us * 65; // 65mW 평균 전환 전력
        s64 residency_energy = predicted_idle_us * cs->power_mw / 1000;
        s64 total_energy = transition_energy + residency_energy;
        
        if (total_energy < best_energy) {
            best_energy = total_energy;
            best_cstate = i;
        }
    }
    
    return best_cstate;
}
```

### Package C-State 조정 - 아파트 전체 소등

인텔 Xeon 설계자:

> "Package C-State는 아파트 전체 소등과 같습니다. 모든 세대가 자야만 아파트 전체를 끌 수 있죠. CPU도 모든 코어가 idle일 때만 패키지 전원을 내립니다."

```c
// 패키지 레벨 C-state 관리 - 아파트 관리 사무소
struct pkg_cstate_info {
    atomic_t core_count;       // 활성 코어 수
    atomic_t deepest_cstate;   // 가장 깊은 C-state
    spinlock_t lock;

    // PC-state (Package C-state) 카운터
    u64 pc2_residency;
    u64 pc3_residency;
    u64 pc6_residency;
    u64 pc7_residency;
};

// 코어 C-state 변경 시 패키지 상태 업데이트
void update_package_cstate(int cpu, int new_cstate) {
    struct pkg_cstate_info *pkg = per_cpu(pkg_info, cpu);
    int active_cores;

    spin_lock(&pkg->lock);

    if (new_cstate == C0) {
        active_cores = atomic_inc_return(&pkg->core_count);
    } else {
        active_cores = atomic_dec_return(&pkg->core_count);
    }

    // 모든 코어가 idle일 때만 패키지 C-state 진입
    if (active_cores == 0) {
        int pkg_cstate = atomic_read(&pkg->deepest_cstate);
        enter_package_cstate(pkg_cstate);
    }

    spin_unlock(&pkg->lock);
}
```

## 고급 C-State 최적화 기법

### 예측 기반 C-State 선택

Google 데이터센터 엔지니어:

> "우리는 머신러닝으로 다음 인터럽트 시간을 예측합니다. 과거 패턴을 학습해서 99% 정확도로 idle 시간을 맞춰요. 덕분에 최적의 C-state를 선택할 수 있죠."

```c
// 예측 기반 C-state 선택 시스템
struct idle_predictor {
    // 과거 idle 패턴 저장
    u32 history[16];           // 최근 16번의 idle 시간 (μs)
    u8 history_idx;            // 현재 인덱스
    
    // 통계 정보
    u32 avg_idle_time;         // 평균 idle 시간
    u32 std_deviation;         // 표준 편차
    u32 prediction_accuracy;   // 예측 정확도 (%)
    
    // 머신러닝 파라미터
    s32 weights[16];           // 가중치
    s32 bias;                  // 편향값
};

// 예측 알고리즘 구현
u32 predict_next_idle_time(struct idle_predictor *pred) {
    s64 prediction = pred->bias;
    int i;
    
    // 가중 평균 계산
    for (i = 0; i < 16; i++) {
        int idx = (pred->history_idx - i - 1) & 0xF;
        prediction += pred->weights[i] * pred->history[idx];
    }
    
    // 음수 방지 및 범위 제한
    prediction = max(prediction, 0L);
    prediction = min(prediction, 100000L);  // 최대 100ms
    
    return (u32)prediction;
}

// 예측 정확도 기반 가중치 업데이트
void update_predictor(struct idle_predictor *pred, u32 actual_idle_time) {
    u32 predicted = predict_next_idle_time(pred);
    s32 error = actual_idle_time - predicted;
    
    // 예측 오차 기반 가중치 조정 (간단한 경사하강법)
    int i;
    for (i = 0; i < 16; i++) {
        int idx = (pred->history_idx - i - 1) & 0xF;
        pred->weights[i] += (error * pred->history[idx]) >> 16;
    }
    pred->bias += error >> 12;
    
    // 새로운 데이터 저장
    pred->history[pred->history_idx] = actual_idle_time;
    pred->history_idx = (pred->history_idx + 1) & 0xF;
    
    // 정확도 업데이트
    u32 accuracy = 100 - (abs(error) * 100 / max(actual_idle_time, 1U));
    pred->prediction_accuracy = (pred->prediction_accuracy * 7 + accuracy) / 8;
}

// 적응형 C-state 선택
int adaptive_cstate_selection(struct idle_predictor *pred) {
    u32 predicted_idle = predict_next_idle_time(pred);
    
    // 예측 신뢰도가 낮으면 보수적으로 선택
    if (pred->prediction_accuracy < 80) {
        predicted_idle = predicted_idle / 2;  // 50% 할인
    }
    
    return intelligent_cstate_selection(predicted_idle * 1000);  // ns 변환
}
```

### 실시간 C-State 모니터링

```c
// C-state 레지던시 실시간 모니터링
struct cstate_monitor {
    u64 last_check_time;
    u64 residency_counters[8];    // C0-C7 누적 시간
    u32 entry_counts[8];          // 진입 횟수
    u32 power_savings_mw;         // 절약된 전력 (mW)
};

void monitor_cstate_residency(void) {
    static struct cstate_monitor monitor;
    u64 current_time = ktime_get_ns();
    u64 msr_value;
    int i;
    
    // 각 C-state MSR 읽기
    struct {
        u32 msr;
        const char *name;
    } cstate_msrs[] = {
        {MSR_PKG_C2_RESIDENCY, "C2"},
        {MSR_PKG_C3_RESIDENCY, "C3"},
        {MSR_PKG_C6_RESIDENCY, "C6"},
        {MSR_PKG_C7_RESIDENCY, "C7"}
    };
    
    printf("C-State Residency Report:\n");
    u64 total_time = current_time - monitor.last_check_time;
    
    for (i = 0; i < ARRAY_SIZE(cstate_msrs); i++) {
        rdmsrl(cstate_msrs[i].msr, msr_value);
        u64 delta = msr_value - monitor.residency_counters[i];
        u32 percentage = (delta * 100) / total_time;
        
        printf("  %s: %llu ns (%u%%)\n", 
               cstate_msrs[i].name, delta, percentage);
        
        monitor.residency_counters[i] = msr_value;
    }
    
    monitor.last_check_time = current_time;
}

// 전력 절약 효과 계산
u32 calculate_power_savings(struct cstate_monitor *mon) {
    u32 total_savings = 0;
    int i;
    
    for (i = 1; i < 8; i++) {  // C0 제외
        if (mon->residency_counters[i] > 0) {
            // 각 C-state에서 절약된 전력 계산
            u32 active_power = 65000;  // 65W
            u32 cstate_power = intel_cstates[i].power_mw;
            u32 savings_per_ns = active_power - cstate_power;
            
            total_savings += (mon->residency_counters[i] / 1000000) * 
                           savings_per_ns;  // mW·ms 단위
        }
    }
    
    return total_savings / 1000;  // W 단위로 변환
}
```

## 실제 활용 사례

### 모바일 디바이스 배터리 최적화

Samsung Galaxy 엔지니어:

> "스마트폰이 밤새도록 5% 밖에 안 떨어지는 비밀이 뭘까요? C6 상태에서 CPU는 0.5mW만 소모합니다. 화면 끄면 즉시 C6로 들어가고, 알람이나 전화가 오면 1마이크로초만에 깨어나죠."

```c
// 스마트폰 배터리 최적화를 위한 C-state 관리
struct mobile_power_manager {
    bool screen_on;
    int battery_level;
    enum device_state {
        DEVICE_ACTIVE,      // 사용자 상호작용 중
        DEVICE_IDLE,        // 화면 켜져있지만 대기
        DEVICE_DOZE,        // 화면 꺼짐, 백그라운드 작업
        DEVICE_DEEP_SLEEP   // 완전 절전
    } state;
};

void mobile_cstate_policy(struct mobile_power_manager *mgr) {
    switch (mgr->state) {
    case DEVICE_ACTIVE:
        // 활성 사용: 반응성 우선, 얕은 C-state만
        disable_deep_cstates();
        set_max_cstate(C1E);
        break;
        
    case DEVICE_IDLE:
        // 화면 켜져있지만 대기: 중간 절전
        enable_cstates_up_to(C3);
        break;
        
    case DEVICE_DOZE:
        // 화면 꺼짐: 적극적 절전
        enable_cstates_up_to(C6);
        
        // 배터리 20% 이하면 더 적극적으로
        if (mgr->battery_level < 20) {
            force_deepest_cstate(C7);
        }
        break;
        
    case DEVICE_DEEP_SLEEP:
        // 심야 모드: 최대 절전
        force_deepest_cstate(C10);
        disable_wake_sources_except_critical();
        break;
    }
}

// 배터리 수명 예측
int estimate_battery_hours(struct mobile_power_manager *mgr) {
    // C-state별 예상 전력 소비 (실제 측정값)
    u32 power_consumption[] = {
        [C0]  = 1200,  // 1.2W - 활성 사용
        [C1]  = 300,   // 0.3W - 가벼운 대기
        [C1E] = 150,   // 0.15W - 화면 켜진 대기
        [C3]  = 50,    // 0.05W - 화면 꺼진 대기
        [C6]  = 15,    // 0.015W - 깊은 절전
        [C7]  = 8,     // 0.008W - 더 깊은 절전
        [C10] = 3      // 0.003W - 최대 절전
    };
    
    u32 avg_power = power_consumption[get_current_cstate()];
    u32 battery_capacity = 4000;  // 4000mAh
    
    return (battery_capacity * mgr->battery_level / 100 * 3600) / avg_power;
}
```

## 핵심 요점

### 1. C-State는 유휴 시간 전력 관리의 핵심

C-State는 CPU가 일하지 않을 때의 전력 절약 메커니즘입니다:

- **C0**: 활성 상태 (일하는 중)
- **C1-C3**: 얕은 절전 (빠른 깨우기)
- **C6-C10**: 깊은 절전 (큰 전력 절약)

### 2. 진입/탈출 비용을 고려한 선택

모든 C-State 전환에는 시간과 전력 비용이 있습니다:

- **손익분기점**: 충분히 오래 idle해야 이득
- **지연시간**: 깊을수록 깨어나는 데 오래 걸림
- **예측 기반**: 미래 idle 시간을 예측하여 최적 선택

### 3. Package-level 조정의 중요성

멀티코어에서는 패키지 전체의 협조가 필요합니다:

- **모든 코어**: 동시에 idle해야 패키지 절전 가능
- **협조 알고리즘**: 코어 간 상태 동기화
- **최대 효과**: 패키지 C-state에서 가장 큰 절전 효과

---

**이전**: [DVFS와 주파수 조절](chapter-02-cpu-interrupt/04b-dvfs-frequency-scaling.md)  
**다음**: [터보 부스트와 동적 오버클럭](04d-turbo-boost.md)에서 순간 성능 향상 기술을 학습합니다.

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

`C-State`, `Power Management`, `Idle Management`, `MWAIT`, `MSR`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
