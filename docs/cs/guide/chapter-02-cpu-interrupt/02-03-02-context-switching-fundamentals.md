---
tags:
  - context-switching
  - cpu-architecture
  - fundamentals
  - medium-read
  - multitasking
  - process-management
  - task-struct
  - theoretical
  - 시스템프로그래밍
difficulty: FUNDAMENTALS
learning_time: "2-3시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 2.3.2: 컨텍스트 스위칭 기초

## 🎯 컨텍스트 스위칭 기본 원리

멀티태스킹 환경에서 CPU가 여러 프로세스를 동시에 처리하는 핵심 메커니즘인 컨텍스트 스위칭의 기본 개념과 구성 요소를 살펴봅니다.

## 도입: 멀티태스킹의 핵심 메커니즘

### 구글 크롬이 탭 100개를 동시에 처리하는 비밀

한 구글 엔지니어의 경험담:

> "사용자가 크롬에서 탭 100개를 열어놓고 유튜브 동영상을 보면서, 구글 독스로 문서를 작성하고, Gmail을 확인합니다. CPU 코어는 4개뿐인데 어떻게 가능할까요? 비밀은 **초당 1000번의 컨텍스트 스위칭**이죠."

실제 측정 결과:

```bash
# 크롬 브라우저 실행 중 컨텍스트 스위칭 측정
$ vmstat 1
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
2  0      0 8234560 234560 4567890    0    0     0     8  2341 4567 45 12 43  0  0
#                                                           ^^^^ 초당 4567번!

# 각 탭이 받는 시간
100개 탭 ÷ 4 코어 = 코어당 25개 탭
1초 ÷ 25 = 40ms per 탭
# 40ms면 충분합니다! 인간은 50ms 이하 지연을 느끼지 못하거든요
```

## ⏱️ 컨텍스트 스위칭 타임라인

```mermaid
graph LR
    subgraph "크롬 브라우저 멀티탭 처리 (10ms 타임슬라이스)"
        subgraph "CPU 코어 1"
            A1["0-10ms:<br/>유튜브 탭"]
            A2["10-20ms:<br/>Gmail 탭"]
            A3["20-30ms:<br/>구글독스 탭"]
        end
        
        subgraph "CPU 코어 2"
            B1["0-10ms:<br/>광고 스크립트"]
            B2["10-20ms:<br/>이미지 로딩"]
            B3["20-30ms:<br/>CSS 렌더링"]
        end
        
        subgraph "사용자 경험"
            C1["끊김 없는 동영상"]
            C2["타이핑 반응성"]
            C3["페이지 스크롤"]
        end
    end
    
    A1 --> A2 --> A3
    B1 --> B2 --> B3
    
    style A1 fill:#ff5722,color:#fff
    style A2 fill:#4caf50,color:#fff
    style A3 fill:#2196f3,color:#fff
    style B1 fill:#ff9800,color:#fff
    style B2 fill:#9c27b0,color:#fff
    style B3 fill:#607d8b,color:#fff
```

## 🎪 CPU 저글링 비유

```mermaid
graph LR
    subgraph "시간: 0-10ms"
        A1["🏀 Process A<br/>실행 중"]
        B1["⚾ Process B<br/>대기"]
        C1["🎾 Process C<br/>대기"]
    end
    
    subgraph "시간: 10-20ms"
        A2["🏀 Process A<br/>저장됨"]
        B2["⚾ Process B<br/>실행 중"]
        C2["🎾 Process C<br/>대기"]
    end
    
    subgraph "시간: 20-30ms"
        A3["🏀 Process A<br/>대기"]
        B3["⚾ Process B<br/>저장됨"]
        C3["🎾 Process C<br/>실행 중"]
    end
    
    A1 -->|"컨텍스트 스위칭<br/>레지스터 저장"| A2
    B1 -->|"컨텍스트 복원<br/>실행 시작"| B2
    B2 -->|"컨텍스트 스위칭<br/>레지스터 저장"| B3
    C2 -->|"컨텍스트 복원<br/>실행 시작"| C3
    
    style A1 fill:#4caf50,color:#fff
    style B2 fill:#4caf50,color:#fff
    style C3 fill:#4caf50,color:#fff
```

### CPU의 저글링 - 프로세스 공을 떨어뜨리지 마라

서커스 저글러를 상상해보세요:

- **공 = 프로세스**
- **손 = CPU 코어**
- **공 잡기/던지기 = 컨텍스트 스위칭**

```python
# CPU의 저글링 시뮬레이션
class CPU:
    def juggle_processes(self):
        while True:
            process = self.catch_ball()     # 현재 프로세스 상태 저장
            self.juggle_time(10_ms)         # 10ms 동안 실행
            self.throw_ball(process)        # 다음을 위해 저장
            next_process = self.grab_next() # 다음 프로세스 로드
            # 🎪 완벽한 저글링! 아무도 떨어지지 않음
```

이제 이 마법같은 저글링이 어떻게 작동하는지 깊이 들어가봅시다!

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

## 핵심 요점

### 1. 컨텍스트 스위칭의 본질

컨텍스트 스위칭은 CPU가 하나의 프로세스 실행을 중단하고 다른 프로세스 실행을 시작하는 과정입니다. 이는 멀티태스킹의 핵심 메커니즘입니다.

### 2. 저장해야 하는 상태 정보

프로세스의 완전한 실행 상태를 보존하기 위해 CPU 레지스터, 메모리 관리 정보, 커널 상태 등 다양한 정보를 저장해야 합니다.

### 3. Task Struct의 중요성

Linux의 task_struct는 프로세스의 모든 상태 정보를 담고 있는 핵심 데이터 구조로, 효율적인 컨텍스트 스위칭을 위한 설계입니다.

---

**이전**: [인터럽트와 예외 처리](./02-02-02-interrupt-exception.md)에서 하드웨어 인터럽트의 동작을 학습했습니다.
**다음**: [컨텍스트 스위칭 구현](./02-03-04-context-switching-implementation.md)에서 실제 컨텍스트 스위칭 과정의 상세 구현을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: FUNDAMENTALS
- **주제**: 시스템 프로그래밍
- **예상 시간**: 2-3시간

### 🎯 학습 경로

- [📚 FUNDAMENTALS 레벨 전체 보기](../learning-paths/fundamentals/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-02-cpu-interrupt)

- [Chapter 2-1-1: CPU 아키텍처와 명령어 실행 개요](./02-01-01-cpu-architecture.md)
- [Chapter 2-1-2: CPU 기본 구조와 명령어 실행](./02-01-02-cpu-fundamentals.md)
- [Chapter 2-1-3: 분기 예측과 Out-of-Order 실행](./02-01-03-prediction-ooo.md)
- [Chapter 2-1-4: CPU 캐시와 SIMD 벡터화](./02-01-04-cache-simd.md)
- [Chapter 2-1-5: 성능 측정과 실전 최적화](./02-01-05-performance-optimization.md)

### 🏷️ 관련 키워드

`context-switching`, `process-management`, `cpu-architecture`, `task-struct`, `multitasking`

### ⏭️ 다음 단계 가이드

- 기초 개념을 충분히 이해한 후 INTERMEDIATE 레벨로 진행하세요
- 실습 위주의 학습을 권장합니다
