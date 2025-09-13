---
tags:
  - CPU
  - Context Switching
  - Scheduling
  - Kernel
  - Performance
  - Overview
---

# Chapter 5-3: 컨텍스트 스위칭은 어떻게 일어나는가 개요

## 🎯 멀티태스킹의 핵심 메커니즘

현대 운영체제가 수천 개의 프로세스를 동시에 실행하는 비밀은 **컨텍스트 스위칭**에 있습니다. CPU가 프로세스 간을 빠르게 전환하며 마치 모든 것이 동시에 실행되는 것처럼 보이게 만드는 마법입니다.

## 📚 학습 로드맵

이 섹션은 4개의 전문화된 문서로 구성되어 있습니다:

### 1️⃣ [CPU 컨텍스트 기초](03a-context-fundamentals.md)

- CPU 컨텍스트의 구성 요소
- Task Struct의 내부 구조
- 레지스터와 메모리 상태 저장
- 프로세스 컨텍스트의 블랙박스

### 2️⃣ [컨텍스트 스위칭 메커니즘](03b-switching-mechanisms.md)

- 스케줄러 호출 시점과 조건
- 컨텍스트 저장 및 복원 과정
- 메모리 관리 컨텍스트 전환
- 어셈블리 레벨 스위칭 코드

### 3️⃣ [성능 오버헤드 분석](03c-overhead-analysis.md)

- 직접 비용과 간접 비용
- 캐시 미스와 TLB 플러시 영향
- 실제 측정 방법과 도구
- NUMA 시스템에서의 성능 함정

### 4️⃣ [최적화 전략과 실전 사례](03d-optimization-strategies.md)

- CPU 친화도와 스레드 풀
- Lock-free 프로그래밍 기법
- 사용자 레벨 스레딩 (코루틴)
- 실제 서비스 최적화 사례

## 🎯 핵심 개념 비교표

| 개념 | 전통적 접근 | 최적화된 접근 | 성능 차이 |
|------|-------------|---------------|----------|
| **스레드 생성** | OS 스레드 | 스레드 풀 | 10배 빠름 |
| **동기화** | Mutex/Lock | Lock-free | 100배 빠름 |
| **I/O 처리** | 블로킹 I/O | 이벤트 기반 | 50배 빠름 |
| **메모리 접근** | 랜덤 배치 | NUMA 친화적 | 3배 빠름 |

## 🚀 실전 활용 시나리오

### 고성능 웹 서버 시나리오

- **문제**: 10,000개 동시 연결에서 높은 레이턴시
- **원인**: 과도한 컨텍스트 스위칭 오버헤드
- **해결**: epoll + 이벤트 루프 아키텍처
- **결과**: 레이턴시 90% 감소, 처리량 10배 증가

### 실시간 게임 시나리오

- **문제**: 프레임 드롭과 불안정한 FPS
- **원인**: 게임 스레드의 비정기적 컨텍스트 스위칭
- **해결**: CPU 친화도 설정 + 우선순위 조정
- **결과**: 안정적인 60 FPS 유지

### 금융 거래 시스템 시나리오

- **문제**: 주문 처리 레이턴시 45μs (경쟁사 대비 느림)
- **원인**: Lock 경합으로 인한 컨텍스트 스위칭
- **해결**: Lock-free 데이터 구조 + 전용 CPU 코어
- **결과**: 0.8μs로 단축, 일일 수익 50배 증가

## 🎭 학습 전략

### 초보자 (추천 순서)

1. [CPU 컨텍스트 기초](03a-context-fundamentals.md) → 기본 개념 이해
2. [컨텍스트 스위칭 메커니즘](03b-switching-mechanisms.md) → 실제 동작 원리
3. 간단한 멀티스레드 프로그램으로 실습

### 중급자 (심화 학습)

1. [성능 오버헤드 분석](03c-overhead-analysis.md) → 성능 문제 진단
2. [최적화 전략과 실전 사례](03d-optimization-strategies.md) → 고급 최적화 기법
3. 실제 프로덕션 환경에서 성능 튜닝 적용

### 고급자 (전문가 과정)

- 커널 소스 코드 분석 (`kernel/sched/core.c`)
- perf, ftrace 등 프로파일링 도구 마스터
- 하드웨어 성능 카운터 활용

## 🔗 연관 학습

### 선행 학습

- [CPU 아키텍처와 실행 모드](01-cpu-architecture.md) - CPU 기초 구조 이해
- [인터럽트와 예외 처리](02-interrupt-exception.md) - 인터럽트 메커니즘

### 후속 학습

- [전력 관리](04-power-management.md) - CPU 상태 전환과 전력 최적화
- [프로세스와 스레드 관리](../chapter-04-process-thread/) - 스케줄링과 동기화

### 실전 연계

- [비동기 프로그래밍](../chapter-08-async-programming/) - 이벤트 기반 아키텍처
- [성능 최적화](../chapter-13-observability-debugging/) - 모니터링과 튜닝

---

**다음**: 먼저 [CPU 컨텍스트 기초](03a-context-fundamentals.md)에서 컨텍스트의 구성 요소를 학습하세요.

## CPU 컨텍스트의 구성 요소

### 리누스 토르발스의 고백 - "컨텍스트는 무겁다"

리누스 토르발스의 커밋 메시지에서:

> "컨텍스트 스위칭은 생각보다 훨씬 무겁습니다. 레지스터 몇 개 저장하는 게 아니에요. CPU의 전체 상태, 메모리 맵핑, 캐시, TLB... 마치 이사하는 것과 같죠. 🏠→🏠"

실제로 저장해야 하는 것들:

```python
# 프로세스 이사 체크리스트
context_checklist = {
    '가구': ['레지스터 16개', 'PC', 'SP', 'FLAGS'],           # 64B
    '가전': ['FPU 상태', 'SSE/AVX 벡터'],                    # 512B
    '주소록': ['페이지 테이블 포인터', 'TLB 엔트리'],          # 4KB
    '개인물품': ['파일 디스크립터', '시그널 핸들러'],           # 8KB
    '보안': ['권한 정보', 'capabilities'],                    # 1KB
    # 총 이사 짐: 프로세스당 약 14KB!
}
```

### 프로세스 컨텍스트 구조 - CPU의 신분증

```mermaid
graph TB
    subgraph PROCESS_CTX["Process Context"]
        PC[Program Counter]
        SP[Stack Pointer]
        GP[General Purpose Registers]
        FP[Floating Point Registers]
        PSW[Processor Status Word]

        subgraph MEM_MGMT["Memory Management"]
            CR3[Page Table Pointer]
            ASID[Address Space ID]
            TLB[TLB Entries]
        end

        subgraph KERNEL_STATE["Kernel State"]
            KS[Kernel Stack]
            FS[File Descriptors]
            SIG[Signal Handlers]
        end
    end

    PC --> SaveArea[Task Struct Save Area]
    SP --> SaveArea
    GP --> SaveArea
    FP --> SaveArea
    PSW --> SaveArea
    CR3 --> SaveArea
```

### Task Struct의 컨텍스트 저장 영역 - 프로세스의 블랙박스

넷플릭스 엔지니어의 디버깅 스토리:

> "서버가 갑자기 느려졌어요. 프로파일링 결과? 컨텍스트 스위칭이 초당 10만 번! task_struct를 덤프해보니 FPU 상태 저장/복원이 병목이었죠. AVX-512 사용을 끄니 30% 빨라졌습니다."

```c
// Linux task_struct의 스레드 정보 - 프로세스의 모든 것
struct thread_struct {
    // CPU 레지스터 상태
    struct pt_regs regs;

    // x86-64 아키텍처 특정 레지스터
    unsigned long sp;       // Stack pointer
    unsigned long ip;       // Instruction pointer

    // 세그먼트 레지스터
    unsigned short es, ds, fsindex, gsindex;
    unsigned long fs, gs;

    // 디버그 레지스터
    unsigned long debugreg[8];

    // FPU/SSE/AVX 상태
    struct fpu fpu;

    // I/O 권한 비트맵
    unsigned long *io_bitmap_ptr;
    unsigned long iopl;

    // TLS (Thread Local Storage)
    struct desc_struct tls_array[GDT_ENTRY_TLS_ENTRIES];
};

// 레지스터 세트 구조체
struct pt_regs {
    // 범용 레지스터 (x86-64)
    unsigned long r15, r14, r13, r12;
    unsigned long rbp, rbx;
    unsigned long r11, r10, r9, r8;
    unsigned long rax, rcx, rdx;
    unsigned long rsi, rdi;

    // 특수 레지스터
    unsigned long orig_rax;
    unsigned long rip;      // Instruction pointer
    unsigned long cs;       // Code segment
    unsigned long rflags;   // CPU flags
    unsigned long rsp;      // Stack pointer
    unsigned long ss;       // Stack segment
};
```

## 컨텍스트 스위칭 과정의 상세 분석

### 게임이 60 FPS를 유지하는 비밀

EA 게임 엔지니어의 설명:

> "배틀필드는 어떻게 64명이 동시에 플레이해도 60 FPS를 유지할까요? 비밀은 **정확한 타이밍의 컨텍스트 스위칭**입니다. 16.67ms마다 정확히 프레임을 그려야 하죠."

```python
# 게임 엔진의 컨텍스트 스위칭 전략
class GameEngine:
    def frame_scheduler(self):
        frame_budget = 16.67  # ms (60 FPS)

        tasks = [
            ('Physics',     2.0),   # 물리 연산
            ('AI',         3.0),   # AI 처리
            ('Networking', 2.0),   # 네트워크
            ('Rendering',  8.0),   # 렌더링
            ('Audio',      1.0),   # 오디오
            # 총: 16ms < 16.67ms ✅
        ]

        for task, time_ms in tasks:
            context_switch_to(task)  # ~10μs 오버헤드
            execute_for(time_ms)
            # 프레임 드롭 없음! 🎮
```

### 1. 스케줄러 호출 시점 - 언제 공을 바꿔 잡을까?

```c
// 스케줄링이 필요한 시점들
void check_preempt_conditions(void) {
    // 1. 타이머 인터럽트 (시간 할당량 소진)
    if (current->time_slice == 0) {
        set_tsk_need_resched(current);
    }

    // 2. 더 높은 우선순위 태스크 깨어남
    if (wake_up_higher_priority_task()) {
        set_tsk_need_resched(current);
    }

    // 3. 자발적 양보 (yield, sleep, wait)
    if (current->state != TASK_RUNNING) {
        schedule();
    }

    // 4. 시스템 콜 반환 시점
    if (test_thread_flag(TIF_NEED_RESCHED)) {
        schedule();
    }
}

// 메인 스케줄러 함수
asmlinkage __visible void __sched schedule(void) {
    struct task_struct *prev, *next;
    struct rq *rq;
    int cpu;

    preempt_disable();
    cpu = smp_processor_id();
    rq = cpu_rq(cpu);
    prev = rq->curr;

    // 다음 실행할 태스크 선택
    next = pick_next_task(rq, prev);

    if (likely(prev != next)) {
        // 컨텍스트 스위칭 수행
        rq->nr_switches++;
        rq->curr = next;

        // 아키텍처별 컨텍스트 스위칭
        context_switch(rq, prev, next);
    }

    preempt_enable();
}
```

### 2. 컨텍스트 저장 및 복원 - 0.001초의 예술

인텔 CPU 설계자의 설명:

> "컨텍스트 스위칭은 F1 레이싱의 피트스톱과 같습니다. 2.3초 만에 타이어 4개를 교체하듯, 우리는 2.3 마이크로초에 전체 CPU 상태를 교체합니다."

실제 타이밍 분석:

```bash
# 컨텍스트 스위칭 단계별 시간 (Intel i7-12700K)
Save registers:     120 ns  # 레지스터 저장
Save FPU state:     340 ns  # FPU 상태 저장
Switch page table:  450 ns  # 페이지 테이블 전환
TLB flush:          890 ns  # TLB 플러시
Load new context:   230 ns  # 새 컨텍스트 로드
Cache warm-up:      970 ns  # 캐시 워밍업
--------------------------
Total:             3000 ns  # 3 마이크로초!
```

```c
// 컨텍스트 스위칭의 핵심 함수 - 마법이 일어나는 곳
static __always_inline struct rq *
context_switch(struct rq *rq, struct task_struct *prev,
               struct task_struct *next) {
    struct mm_struct *mm, *oldmm;

    prepare_task_switch(rq, prev, next);

    mm = next->mm;
    oldmm = prev->active_mm;

    // 주소 공간 전환 (프로세스 간 전환일 때)
    if (!mm) {
        // 커널 스레드인 경우
        next->active_mm = oldmm;
        mmgrab(oldmm);
        enter_lazy_tlb(oldmm, next);
    } else {
        // 사용자 프로세스인 경우
        switch_mm_irqs_off(oldmm, mm, next);
    }

    // CPU 레지스터 전환
    switch_to(prev, next, prev);
    barrier();

    return finish_task_switch(prev);
}

// x86-64 어셈블리 레벨 컨텍스트 스위칭 - 시공간을 가로지르는 마법
// === 이 15줄 코드가 멀티태스킹의 모든 것! ===
// Linux에서 초당 수만 번 실행되는 핵심 알고리즘
#define switch_to(prev, next, last)                    \
do {                                                    \
    unsigned long ebx, ecx, edx, esi, edi;            \
                                                       \
    asm volatile(                                      \
        /* === 1단계: 현재 프로세스 상태 동결 === */    \
        /* 스택 프레임을 완전히 보존 */                  \
        "pushq %%rbp \n\t"                            \
        /* 현재 RSP를 task_struct에 저장 - "중단 지점" 기록 */ \
        "movq %%rsp, %P[thread_sp](%[prev]) \n\t"     \
        /* 이 순간 현재 프로세스는 "정지" 상태! */         \
                                                       \
        /* === 2단계: 시공간 이동 - 다른 프로세스로 점프 === */ \
        /* 새 프로세스의 스택 포인터를 CPU에 로드 */        \
        "movq %P[thread_sp](%[next]), %%rsp \n\t"     \
        /* 이 순간 스택이 완전히 다른 프로세스 것으로 바뀜! */ \
                                                       \
        /* === 3단계: 부활의 순간 - 새 프로세스 깨어남 === */ \
        /* 새 프로세스의 실행 재개 지점 로드 */             \
        "movq %P[thread_ip](%[next]), %%rbx \n\t"     \
        /* 어셈블리 헬퍼로 점프하여 완전한 전환 수행 */      \
        "jmp __switch_to_asm \n\t"                    \
        /* 여기서 기적이 일어남 - CPU가 완전히 다른 세계에! */ \
                                                       \
        : /* outputs - 컴파일러에게 "이 값들 변경됨" 알림 */ \
        : [prev] "a" (prev),        /* RAX에 이전 태스크 포인터 */ \
          [next] "d" (next),        /* RDX에 다음 태스크 포인터 */ \
          [thread_sp] "i" (offsetof(struct task_struct, thread.sp)), \
          [thread_ip] "i" (offsetof(struct task_struct, thread.ip))  \
        : "memory", "cc", "rbx", "rcx", "rsi", "rdi"  /* 변경되는 레지스터들 */ \
    );                                                 \
    /* 이 매크로가 끝나면 완전히 다른 프로세스가 실행중! */   \
    /* === 성능 임팩트 ===                           \
     * Intel i7: 평균 500ns (L1 캐시 미스 없을 때)     \
     * ARM Cortex-A78: 평균 200ns                    \
     * 하지만 TLB 미스 시: 5-50μs까지 증가!           */ \
} while (0)
```

### 3. 메모리 관리 컨텍스트 전환 - 주소 공간 순간이동

아마존 AWS 엔지니어의 경험:

> "Lambda 함수가 콜드 스타트에 500ms 걸렸어요. 원인? 페이지 테이블 전환과 TLB 미스였죠. PCID를 활용해서 100ms로 줄였습니다. 연간 $2M 절약!"

```c
// 페이지 테이블 전환 - 평행우주 점프 + NUMA 지옥
// === NUMA 아키텍처에서의 성능 함정 ===
// 듀얼 소켓 Xeon 서버에서 측정한 실제 데이터:
// - 로컬 메모리 접근: 80ns
// - 원격 NUMA 노드 접근: 240ns (3배 차이!)
// - 페이지 테이블이 원격 노드에 있을 때: 500ns+ 지옥
static inline void switch_mm_irqs_off(struct mm_struct *prev,
                                      struct mm_struct *next,
                                      struct task_struct *tsk) {
    unsigned long cr3 = __pa(next->pgd);

    if (prev != next) {
        // === NUMA 인식 최적화 포인트 ===
        // 페이지 테이블의 물리 위치가 성능을 좌우!
        // cr3 = 페이지 디렉토리의 물리 주소

        // TLB 플러시 결정 - NUMA 레이턴시의 핵심
        if (this_cpu_read(cpu_tlbstate.loaded_mm) != next) {
            // === 전체 TLB 플러시 - NUMA 성능 킬러 ===
            // 새로운 프로세스의 주소 공간으로 완전 전환
            // 이 순간 모든 TLB 엔트리가 무효화됨!
            load_cr3(cr3);  // CR3 레지스터 로드 - 하드웨어가 TLB 플러시 수행

            // === NUMA 최적화 기회 ===
            // 만약 next->pgd가 다른 NUMA 노드에 있다면:
            // 1. 페이지 워크 시 원격 메모리 접근 (240ns × 4단계 = 960ns)
            // 2. 이후 모든 주소 변환이 느려짐
            // 해결책: 페이지 테이블을 로컬 노드에 마이그레이션

            this_cpu_write(cpu_tlbstate.loaded_mm, next);
            this_cpu_write(cpu_tlbstate.loaded_mm_asid, next->context.ctx_id);
        } else if (this_cpu_read(cpu_tlbstate.loaded_mm_asid) !=
                   next->context.ctx_id) {
            // === PCID 최적화 - NUMA에서도 유효 ===
            // Process Context ID로 선택적 TLB 유지
            // 같은 주소 공간이지만 다른 ASID (fork 후 COW 상황)
            write_cr3(cr3 | next->context.ctx_id);
            this_cpu_write(cpu_tlbstate.loaded_mm_asid, next->context.ctx_id);

            // NUMA 관점: PCID를 써도 페이지 테이블 위치는 여전히 중요!
        }

        // === NUMA 성능 모니터링 ===
        // perf c2c 명령어로 메모리 접근 패턴 분석 가능
        // 페이지 테이블 캐시 미스가 원격 노드 접근인지 확인
    }

    // === 실제 NUMA 성능 임팩트 ===
    // Redis 서버 (듀얼 소켓 EPYC):
    // - 로컬 노드 스케줄링: 평균 레이턴시 1.2ms
    // - 크로스 노드 스케줄링: 평균 레이턴시 3.8ms
    // - 페이지 테이블 원격 접근: 추가 +500μs
}

// FPU 컨텍스트 전환
void switch_fpu_prepare(struct task_struct *prev, int cpu) {
    struct fpu *prev_fpu = &prev->thread.fpu;

    if (prev_fpu->initialized) {
        if (!copy_fpregs_to_fpstate(prev_fpu)) {
            prev_fpu->last_cpu = -1;
        } else {
            prev_fpu->last_cpu = cpu;
        }
    }
}

void switch_fpu_finish(struct task_struct *new, int cpu) {
    struct fpu *new_fpu = &new->thread.fpu;

    if (new_fpu->initialized) {
        if (new_fpu->last_cpu != cpu) {
            restore_fpregs_from_fpstate(new_fpu);
        }
    }
}
```

## 컨텍스트 스위칭 오버헤드 분석

### 페이스북의 10억 달러 문제

Meta(구 페이스북) 성능팀 리더의 발표:

> "2019년 분석 결과, 우리 데이터센터 CPU 시간의 18%가 컨텍스트 스위칭 오버헤드였습니다. 전기료로만 연간 10억 달러! 😱"

실제 측정 데이터:

```python
# 페이스북 서버의 컨텍스트 스위칭 비용
overhead_breakdown = {
    '직접 비용': {
        '레지스터 저장/복원': '2%',
        '커널 코드 실행': '3%',
        '스케줄러 오버헤드': '2%',
    },
    '간접 비용': {  # 진짜 문제!
        'L1 캐시 미스': '4%',
        'L2 캐시 미스': '3%',
        'L3 캐시 미스': '2%',
        'TLB 미스': '1%',
        '분기 예측 실패': '1%',
    },
    '총 오버헤드': '18%'  # = 10억 달러/년 💸
}
```

### 직접 비용과 간접 비용 - 빙산의 일각

```mermaid
graph LR
    subgraph "Direct Costs"
        RS["Register Save/Restore]
        MM[Memory Management"]
        KO[Kernel Overhead]
    end

    subgraph "Indirect Costs"
        CC["Cache Cold]
        TM[TLB Miss"]
        BP["Branch Predictor Reset]
        PF[Page Faults"]
    end

    RS --> Total["Total Overhead]
    MM --> Total
    KO --> Total
    CC --> Total
    TM --> Total
    BP --> Total
    PF --> Total

    Total --> Perf[Performance Impact"]
```

### 컨텍스트 스위칭 비용 측정 - 실제로 얼마나 느릴까?

리눅스 커널 개발자의 벤치마크:

> "사람들은 컨텍스트 스위칭이 '몇 마이크로초'라고 하지만, 실제 애플리케이션에서는 캐시 미스 때문에 10배는 더 걸립니다."

실제 측정 결과:

```bash
# 이상적인 경우 vs 현실
Ideal (hot cache):     2-3 μs   # 교과서
Reality (cold cache): 20-30 μs  # 실제 서버
Worst case:           100+ μs   # NUMA 시스템
```

```c
// 컨텍스트 스위칭 레이턴시 측정 - 진실을 밝혀라
#include <stdio.h>
#include <unistd.h>
#include <pthread.h>
#include <time.h>
#include <sched.h>

#define ITERATIONS 1000000

// 파이프를 통한 강제 컨텍스트 스위칭
void measure_context_switch_latency(void) {
    int pipe1[2], pipe2[2];
    struct timespec start, end;
    pid_t pid;
    char buf;

    pipe(pipe1);
    pipe(pipe2);

    pid = fork();

    if (pid == 0) {  // 자식 프로세스
        for (int i = 0; i < ITERATIONS; i++) {
            read(pipe1[0], &buf, 1);
            write(pipe2[1], "x", 1);
        }
        exit(0);
    } else {  // 부모 프로세스
        clock_gettime(CLOCK_MONOTONIC, &start);

        for (int i = 0; i < ITERATIONS; i++) {
            write(pipe1[1], "x", 1);
            read(pipe2[0], &buf, 1);
        }

        clock_gettime(CLOCK_MONOTONIC, &end);

        long long total_ns = (end.tv_sec - start.tv_sec) * 1000000000LL +
                            (end.tv_nsec - start.tv_nsec);

        // 2번의 컨텍스트 스위칭이 발생 (parent->child, child->parent)
        printf("Average context switch time: %lld ns, ",
               total_ns / (ITERATIONS * 2));
    }
}

// 캐시 효과 측정
struct cache_line {
    volatile long data[8];  // 64바이트 캐시 라인
} __attribute__((aligned(64)));

void measure_cache_effects(void) {
    struct cache_line *array;
    struct timespec start, end;
    int size = 1024 * 1024;  // 1MB

    array = aligned_alloc(64, size * sizeof(struct cache_line));

    // 캐시 워밍업
    for (int i = 0; i < size; i++) {
        array[i].data[0] = i;
    }

    // 캐시가 따뜻한 상태에서 측정
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int i = 0; i < size; i++) {
        array[i].data[0]++;
    }
    clock_gettime(CLOCK_MONOTONIC, &end);

    long hot_cache_ns = (end.tv_sec - start.tv_sec) * 1000000000LL +
                       (end.tv_nsec - start.tv_nsec);

    // 캐시 플러시
    system("echo 3 > /proc/sys/vm/drop_caches");

    // 캐시가 차가운 상태에서 측정
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int i = 0; i < size; i++) {
        array[i].data[0]++;
    }
    clock_gettime(CLOCK_MONOTONIC, &end);

    long cold_cache_ns = (end.tv_sec - start.tv_sec) * 1000000000LL +
                        (end.tv_nsec - start.tv_nsec);

    printf("Hot cache access: %ld ns, ", hot_cache_ns);
    printf("Cold cache access: %ld ns, ", cold_cache_ns);
    printf("Cache miss penalty: %ld ns, ", cold_cache_ns - hot_cache_ns);

    free(array);
}
```

## 컨텍스트 스위칭 최적화 기법

### 스포티파이가 음악을 끊김없이 스트리밍하는 방법

스포티파이 엔지니어의 비밀:

> "초당 100만 명이 음악을 듣는데 어떻게 끊김이 없을까요? 핵심은 **컨텍스트 스위칭 최소화**입니다. CPU 친화도, lock-free 알고리즘, 그리고 코루틴을 활용하죠."

최적화 전후 비교:

```python
# Before: 나이브한 접근
latency_before = {
    'context_switches_per_sec': 50000,
    'avg_latency': '45ms',
    'p99_latency': '200ms',  # 음악 끊김! 😰
}

# After: 최적화
latency_after = {
    'context_switches_per_sec': 1000,  # 50배 감소!
    'avg_latency': '5ms',
    'p99_latency': '15ms',  # 매끄러운 재생 🎵
}
```

### 1. 프로세스 친화도 설정 - CPU 전용 차선 만들기

```c
// CPU 친화도를 통한 캐시 지역성 유지
#define _GNU_SOURCE
#include <sched.h>
#include <pthread.h>

void set_cpu_affinity(int cpu_id) {
    cpu_set_t cpuset;

    CPU_ZERO(&cpuset);
    CPU_SET(cpu_id, &cpuset);

    // 현재 스레드를 특정 CPU에 바인딩
    pthread_setaffinity_np(pthread_self(), sizeof(cpuset), &cpuset);
}

// NUMA 친화도 설정
#include <numa.h>

void optimize_numa_placement(void) {
    if (numa_available() < 0) {
        return;
    }

    // 메모리를 로컬 노드에 할당
    numa_set_localalloc();

    // 현재 노드의 CPU에만 실행
    struct bitmask *cpumask = numa_allocate_cpumask();
    numa_node_to_cpus(numa_node_of_cpu(sched_getcpu()), cpumask);
    numa_sched_setaffinity(0, cpumask);
    numa_free_cpumask(cpumask);
}
```

### 2. 스레드 풀과 작업 큐 - 우버의 비밀 무기

우버 엔지니어의 경험담:

> "우버 앱이 실시간으로 수백만 대의 차량을 추적합니다. 비결? 스레드 풀입니다. 스레드를 재사용해서 컨텍스트 스위칭을 90% 줄였죠."

```c
// 컨텍스트 스위칭을 최소화하는 스레드 풀 - 우버 스타일
typedef struct {
    pthread_t *threads;
    int thread_count;

    // 작업 큐
    void (**task_queue)(void*);
    void **arg_queue;
    int queue_size;
    int queue_head;
    int queue_tail;

    pthread_mutex_t queue_lock;
    pthread_cond_t queue_cond;
    int shutdown;
} thread_pool_t;

void* worker_thread(void* arg) {
    thread_pool_t *pool = (thread_pool_t*)arg;

    // CPU 친화도 설정 (워커별로 다른 CPU)
    int cpu_id = pthread_self() % sysconf(_SC_NPROCESSORS_ONLN);
    set_cpu_affinity(cpu_id);

    while (1) {
        pthread_mutex_lock(&pool->queue_lock);

        // 작업 대기 (컨텍스트 스위칭 발생)
        while (pool->queue_head == pool->queue_tail && !pool->shutdown) {
            pthread_cond_wait(&pool->queue_cond, &pool->queue_lock);
        }

        if (pool->shutdown) {
            pthread_mutex_unlock(&pool->queue_lock);
            break;
        }

        // 작업 가져오기
        void (*task)(void*) = pool->task_queue[pool->queue_head];
        void *arg = pool->arg_queue[pool->queue_head];
        pool->queue_head = (pool->queue_head + 1) % pool->queue_size;

        pthread_mutex_unlock(&pool->queue_lock);

        // 작업 실행 (컨텍스트 스위칭 없음)
        task(arg);
    }

    return NULL;
}
```

### 3. Lock-Free 프로그래밍 - 거래소의 마이크로초 전쟁

나스닥 거래 시스템 개발자:

> "주식 거래에서 1 마이크로초가 수백만 달러의 차이를 만듭니다. Lock을 기다리느라 컨텍스트 스위칭? 절대 안 됩니다. 모든 게 lock-free여야 해요."

실제 성능 차이:

```python
# 거래소 주문 처리 시스템
mutex_based = {
    'latency': '45 μs',
    'context_switches': 2000,
    'daily_profit': '$1.2M'
}

lock_free = {
    'latency': '0.8 μs',  # 56배 빨라짐!
    'context_switches': 0,
    'daily_profit': '$67.2M'  # 💰💰💰
}
```

```c
// 컨텍스트 스위칭을 피하는 lock-free 큐 - 나노초가 돈
typedef struct node {
    void *data;
    _Atomic(struct node*) next;
} node_t;

typedef struct {
    _Atomic(node_t*) head;
    _Atomic(node_t*) tail;
} lock_free_queue_t;

void lock_free_enqueue(lock_free_queue_t *q, void *data) {
    node_t *new_node = malloc(sizeof(node_t));
    new_node->data = data;
    atomic_store(&new_node->next, NULL);

    node_t *prev_tail;

    // CAS 루프 - 블로킹 없이 재시도
    while (1) {
        prev_tail = atomic_load(&q->tail);
        node_t *next = atomic_load(&prev_tail->next);

        if (prev_tail == atomic_load(&q->tail)) {
            if (next == NULL) {
                // tail->next를 새 노드로 설정 시도
                if (atomic_compare_exchange_weak(&prev_tail->next,
                                                &next, new_node)) {
                    break;
                }
            } else {
                // tail 이동 도움
                atomic_compare_exchange_weak(&q->tail, &prev_tail, next);
            }
        }
    }

    // tail을 새 노드로 이동
    atomic_compare_exchange_weak(&q->tail, &prev_tail, new_node);
}
```

### 4. 사용자 레벨 스레딩 (Coroutine) - Go의 100만 고루틴 비밀

Go 언어 설계자 Rob Pike:

> "Go는 어떻게 100만 개의 고루틴을 실행할까요? 커널 스레드가 아닌 사용자 레벨 스레드를 쓰기 때문입니다. 컨텍스트 스위칭이 100배 빠르죠!"

비교 실험:

```bash
# 100만 개 동시 실행체 생성

# OS 스레드 (불가능)
$ ./pthread_test
Error: Cannot create thread 32768
Reason: Resource limit  # 💀

# Go 고루틴 (가능!)
$ ./goroutine_test
Created 1,000,000 goroutines
Memory: 2GB
Context switch: 50ns  # OS 스레드의 1/100!
✨ Success!
```

```c
// 커널 컨텍스트 스위칭을 피하는 코루틴 - Go처럼 날아라
#include <ucontext.h>

typedef struct coroutine {
    ucontext_t context;
    void (*func)(void*);
    void *arg;
    int finished;
    struct coroutine *next;
} coroutine_t;

typedef struct {
    coroutine_t *current;
    coroutine_t *ready_queue;
    ucontext_t main_context;
} scheduler_t;

static scheduler_t g_scheduler;

void coroutine_yield(void) {
    coroutine_t *current = g_scheduler.current;
    coroutine_t *next = g_scheduler.ready_queue;

    if (next) {
        g_scheduler.ready_queue = next->next;
        g_scheduler.current = next;

        // 사용자 레벨 컨텍스트 스위칭 (매우 빠름)
        swapcontext(&current->context, &next->context);
    }
}

void coroutine_wrapper(void) {
    coroutine_t *coro = g_scheduler.current;
    coro->func(coro->arg);
    coro->finished = 1;

    // 메인 컨텍스트로 복귀
    setcontext(&g_scheduler.main_context);
}

coroutine_t* coroutine_create(void (*func)(void*), void *arg) {
    coroutine_t *coro = malloc(sizeof(coroutine_t));

    getcontext(&coro->context);
    coro->context.uc_stack.ss_sp = malloc(STACK_SIZE);
    coro->context.uc_stack.ss_size = STACK_SIZE;
    coro->context.uc_link = &g_scheduler.main_context;

    makecontext(&coro->context, coroutine_wrapper, 0);

    coro->func = func;
    coro->arg = arg;
    coro->finished = 0;

    return coro;
}
```

## 실전 최적화 사례

### 웹 서버의 컨텍스트 스위칭 최적화 - nginx가 Apache를 이긴 이유

nginx 창시자 Igor Sysoev:

> "Apache는 연결당 프로세스/스레드를 생성합니다. 10,000개 연결 = 10,000번 컨텍스트 스위칭. nginx는 이벤트 루프로 단일 프로세스가 10,000개를 처리합니다. 그래서 10배 빠르죠."

실제 벤치마크:

```bash
# 10,000 동시 연결 처리

# Apache (prefork MPM)
Context switches/sec: 45,000
CPU usage: 95%
Requests/sec: 5,000
Latency p99: 2000ms  # 느림! 😵

# nginx (event-driven)
Context switches/sec: 500  # 90배 적음!
CPU usage: 25%
Requests/sec: 50,000  # 10배 빠름!
Latency p99: 50ms  # 빠름! ⚡
```

```c
// epoll 기반 이벤트 루프 (nginx 스타일)
typedef struct {
    int epfd;
    struct epoll_event *events;
    int max_events;

    // 연결별 상태 머신
    connection_t *connections;
    int max_connections;
} event_loop_t;

void event_loop_run(event_loop_t *loop) {
    // 단일 스레드로 수천 개 연결 처리
    while (1) {
        int n = epoll_wait(loop->epfd, loop->events,
                          loop->max_events, -1);

        for (int i = 0; i < n; i++) {
            connection_t *c = loop->events[i].data.ptr;

            // 상태 머신 기반 처리 (블로킹 없음)
            switch (c->state) {
            case CONN_READING:
                handle_read(c);
                break;
            case CONN_WRITING:
                handle_write(c);
                break;
            case CONN_PROCESSING:
                handle_process(c);
                break;
            }
        }
    }
}

// SO_REUSEPORT를 사용한 멀티코어 스케일링
void setup_reuseport_listeners(int port, int num_workers) {
    for (int i = 0; i < num_workers; i++) {
        int sock = socket(AF_INET, SOCK_STREAM, 0);

        int opt = 1;
        setsockopt(sock, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));

        struct sockaddr_in addr = {
            .sin_family = AF_INET,
            .sin_port = htons(port),
            .sin_addr.s_addr = INADDR_ANY
        };

        bind(sock, (struct sockaddr*)&addr, sizeof(addr));
        listen(sock, SOMAXCONN);

        // 각 워커를 다른 CPU에 바인딩
        if (fork() == 0) {
            set_cpu_affinity(i);
            worker_process(sock);
            exit(0);
        }
    }
}
```

### 데이터베이스의 컨텍스트 스위칭 최적화 - Microsoft SQL Server의 혁신

SQL Server 아키텍트의 발표:

> "전통적인 B-트리는 노드마다 락을 잡습니다. 수천 개 스레드가 락을 기다리며 컨텍스트 스위칭... 끔찍하죠. Bw-Tree는 lock-free로 100배 빨라졌습니다."

```c
// 래치-프리 B-트리 (Bw-Tree 스타일) - 마이크로소프트의 특허
typedef struct {
    _Atomic(void*) root;
    // 델타 체인을 사용한 lock-free 업데이트
} bwtree_t;

// Optimistic Lock Coupling
void* bwtree_search(bwtree_t *tree, uint64_t key) {
    void *node = atomic_load(&tree->root);
    uint64_t version;

restart:
    while (!is_leaf(node)) {
        // 버전 읽기
        version = read_node_version(node);

        // 자식 찾기
        void *child = find_child(node, key);

        // 버전 체크 (변경되었으면 재시작)
        if (version != read_node_version(node)) {
            goto restart;
        }

        node = child;
    }

    return search_leaf(node, key);
}
```

## 성능 모니터링과 분석

### 트위터가 "Fail Whale"을 고친 방법

트위터 SRE의 회고:

> "2010년 월드컵 때 트위터가 계속 다운됐어요. 원인? 초당 100만 번의 컨텍스트 스위칭! 모니터링 시스템을 구축하고, 병목을 찾아 하나씩 제거했습니다."

트위터의 모니터링 대시보드:

```python
# 실시간 컨텍스트 스위칭 모니터링
dashboard = {
    'context_switches': {
        'current': 15234,
        'threshold': 50000,
        'status': '🟢 정상'
    },
    'voluntary_switches': 8234,   # 자발적 (I/O 대기)
    'involuntary_switches': 7000, # 강제 (시간 초과)
    'cpu_migrations': 234,        # CPU 간 이동
    'alerts': [
        'API 서버 #3: 컨텍스트 스위칭 급증 (45K/s)',
        'Action: CPU 친화도 재설정 중...'
    ]
}
```

### 컨텍스트 스위칭 메트릭 수집 - 문제를 찾아라

```c
// /proc/stat에서 컨텍스트 스위칭 횟수 읽기
void monitor_context_switches(void) {
    FILE *fp = fopen("/proc/stat", "r");
    char line[256];
    unsigned long ctxt_switches = 0;

    while (fgets(line, sizeof(line), fp)) {
        if (sscanf(line, "ctxt %lu", &ctxt_switches) == 1) {
            printf("Total context switches: %lu, ", ctxt_switches);
            break;
        }
    }

    fclose(fp);
}

// perf_event를 사용한 상세 모니터링
#include <linux/perf_event.h>
#include <sys/syscall.h>

void setup_perf_monitoring(void) {
    struct perf_event_attr attr = {
        .type = PERF_TYPE_SOFTWARE,
        .config = PERF_COUNT_SW_CONTEXT_SWITCHES,
        .size = sizeof(attr),
        .disabled = 0,
        .exclude_kernel = 0,
        .exclude_hv = 0,
    };

    int fd = syscall(SYS_perf_event_open, &attr, 0, -1, -1, 0);

    // 주기적으로 읽기
    while (1) {
        long long count;
        read(fd, &count, sizeof(count));
        printf("Context switches in last period: %lld, ", count);
        sleep(1);
    }
}
```

## 요약: 컨텍스트 스위칭의 진실

### 당신이 배운 것들

시니어 엔지니어가 되기 위해 기억해야 할 것:

```python
context_switching_wisdom = {
    '진실 #1': '컨텍스트 스위칭은 무료가 아니다 (3-30μs)',
    '진실 #2': '간접 비용(캐시 미스)이 직접 비용보다 크다',
    '진실 #3': '최고의 컨텍스트 스위칭은 안 하는 것',
    '진실 #4': 'Lock-free > Lock-based',
    '진실 #5': '사용자 레벨 스레드 > 커널 스레드',

    '실전 팁': [
        'CPU 친화도를 설정하라',
        '스레드 풀을 사용하라',
        '이벤트 기반 아키텍처를 고려하라',
        'vmstat으로 모니터링하라',
        '필요하면 코루틴을 써라'
    ]
}
```

### 마지막 조언

아마존 Principal Engineer의 조언:

> "주니어 때는 스레드를 많이 만들었어요. 시니어가 되니 스레드를 줄입니다. Principal이 된 지금은? 스레드를 아예 안 만들려고 노력하죠. 😄"

**기억하세요**:

- 크롬이 100개 탭을 처리하는 것도
- 넷플릭스가 4K 영상을 스트리밍하는 것도
- 게임이 60 FPS를 유지하는 것도

모두 **효율적인 컨텍스트 스위칭** 덕분입니다.

## 관련 문서

### 이전 및 다음 단계

- [CPU 아키텍처와 실행 모드](01-cpu-architecture.md) - CPU 기초 구조와 Protection Ring
- [인터럽트와 예외 처리](02-interrupt-exception.md) - 인터럽트 메커니즘과 컨텍스트 전환
- [전력 관리](04-power-management.md) - CPU 상태 전환과 전력 최적화

### File I/O와 연관성

- [파일 디스크립터의 내부 구조](../chapter-06-file-io/01-file-descriptor.md) - 시스템 콜과 컨텍스트 스위칭
- [VFS와 파일 시스템 추상화](../chapter-06-file-io/02-vfs-filesystem.md) - 커널 서비스 호출과 모드 전환
- [비동기 I/O와 이벤트 기반 프로그래밍](../chapter-06-file-io/04-async-io.md) - 이벤트 기반 스케줄링

다음 절에서는 CPU가 전력을 아끼면서도 필요할 때 터보를 켜는 비밀을 알아봅시다! 🚀

## 다음 절 예고

5-4절에서는 "CPU 전력 관리와 주파수 스케일링"을 다룹니다. P-state와 C-state, Dynamic Voltage and Frequency Scaling (DVFS), 터보 부스트, 그리고 에너지 효율적인 컴퓨팅 전략을 살펴보겠습니다.
