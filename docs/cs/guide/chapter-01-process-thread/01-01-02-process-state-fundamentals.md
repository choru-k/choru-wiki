---
tags:
  - debugging-fundamentals
  - fundamentals
  - hands-on
  - medium-read
  - proc-filesystem
  - process-state
  - system-monitoring
  - 시스템프로그래밍
difficulty: FUNDAMENTALS
learning_time: "3-5시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 1.1.2: 프로세스 상태와 라이프사이클

## 프로세스 상태와 /proc 파일시스템 완전 분석

리눅스에서 프로세스 상태를 정확히 파악하는 것은 시스템 진단의 첫걸음입니다. /proc/[pid]/stat과 status 정보를 제대로 읽을 수 있어야 문제의 근본 원인을 찾을 수 있습니다.

### 프로세스 라이프사이클: 탄생부터 소멸까지

```mermaid
stateDiagram-v2
    [*] --> CREATED : "프로세스 생성
fork() 시스템 콜"
    
    CREATED --> READY : "스케줄러에 등록
대기 상태"
    
    READY --> RUNNING : "CPU 할당
스케줄러 선택"
    
    RUNNING --> READY : "시간 할당량 소진
또는 선점 발생"
    
    RUNNING --> INTERRUPTIBLE_SLEEP : "I/O 대기
시그널 처리 가능"
    
    RUNNING --> UNINTERRUPTIBLE_SLEEP : "디스크 I/O 대기
시그널 방해 금지"
    
    RUNNING --> STOPPED : "SIGSTOP 받음
또는 디버거 연결"
    
    RUNNING --> ZOMBIE : "exit() 호출
부모 wait() 대기"
    
    INTERRUPTIBLE_SLEEP --> READY : "이벤트 발생
또는 시그널 수신"
    
    UNINTERRUPTIBLE_SLEEP --> READY : "I/O 완료
커널이 깨움"
    
    STOPPED --> READY : "SIGCONT 수신
실행 재개"
    
    ZOMBIE --> [*] : "부모 wait() 호출
리소스 정리"
    
    note right of INTERRUPTIBLE_SLEEP
        타임아웃 가능
        kill 명령어로 종료 가능
        대부분의 일반적인 대기
    end note
    
    note right of UNINTERRUPTIBLE_SLEEP
        ⚠️ 위험한 상태
        kill -9도 동작 안함
        시스템 성능 저하
    end note
    
    note right of ZOMBIE
        ⚠️ 메모리 누수 원인
        자식 종료 후 부모가 방치
        PID 테이블 점유
    end note
```

### Linux 프로세스 상태 전체 맵

```mermaid
graph TB
    subgraph NORMAL_STATES["정상 상태"]
        R["🟢 R - Running
실행 중 또는 대기
CPU를 사용 중이거나 사용 대기"]
        S["🔵 S - Interruptible Sleep
인터럽트 가능한 대기
I/O, 네트워크, 사용자 입력 대기"]
        I["🟡 I - Idle
유휴 상태
커널 스레드 대기"]
    end
    
    subgraph WARNING_STATES["주의 상태"]
        D["🟠 D - Uninterruptible Sleep
인터럽트 불가능한 대기
디스크 I/O, 커널 작업 대기"]
        T["🟣 T - Stopped
정지된 상태
SIGSTOP, SIGTSTP 신호로 정지"]
        t["🟣 t - Tracing Stop
디버거 추적 중
ptrace(), gdb 디버깅"]
    end
    
    subgraph PROBLEM_STATES["문제 상태"]
        Z["🔴 Z - Zombie
좌비 프로세스
자식 종료, 부모 wait() 대기"]
        X["⚫ X - Dead
죽은 상태
ps에서 보이지 않음"]
    end
    
    subgraph DETAILED_INFO["상태별 세부 정보"]
        subgraph R_INFO["🟢 Running 상세"]
            R_DESC["• 런큐에서 대기 중
• 실제 CPU 사용 중
• 정상적인 상태
• 시스템 로드에 기여"]
        end
        
        subgraph S_INFO["🔵 Sleep 상세"]
            S_DESC["• 시그널 수신 가능
• kill 명령어로 종료 가능
• 대부분의 대기 상태
• 메모리에서 스왓 아웃 가능"]
        end
        
        subgraph D_INFO["🟠 D-State 상세"]
            D_DESC["⚠️ 시그널 방해 금지
⚠️ kill -9도 무효
⚠️ 시스템 성능 저하
⚠️ 커널 작업 완료 대기"]
        end
        
        subgraph Z_INFO["🔴 Zombie 상세"]
            Z_DESC["⚠️ 부모 wait() 대기
⚠️ PID 테이블 점유
⚠️ 메모리 누수 원인
⚠️ 자원 정리 필요"]
        end
    end
    
    R --> R_DESC
    S --> S_DESC
    D --> D_DESC
    Z --> Z_DESC
    
    style NORMAL_STATES fill:#E8F5E8
    style WARNING_STATES fill:#FFF3E0
    style PROBLEM_STATES fill:#FFEBEE
    style R fill:#4CAF50
    style S fill:#2196F3
    style I fill:#9E9E9E
    style D fill:#FF9800
    style T fill:#FF9800
    style t fill:#FF9800
    style Z fill:#F44336
    style X fill:#424242
```

## 1. 프로세스 상태 완전 분석

### 1.1 Linux 프로세스 상태 전체 목록

```bash
# 모든 프로세스 상태 확인
$ ps axo pid,ppid,state,comm | head -20

# 상태별 설명:
# R - Running (실행 중)
# S - Interruptible sleep (인터럽트 가능한 대기)
# D - Uninterruptible sleep (인터럽트 불가능한 대기) ⚠️
# T - Stopped (정지됨, SIGSTOP)
# t - Tracing stop (디버거에 의해 추적 중)
# Z - Zombie (좀비 프로세스) ⚠️
# X - Dead (죽음, ps에서 보이지 않음)
# I - Idle (유휴 상태, 커널 스레드)
```

### 실시간 프로세스 상태 대시보드

```mermaid
graph TB
    subgraph DASHBOARD["시스템 프로세스 대시보드"]
        subgraph HEALTHY["정상 상태"]
            RUNNING_COUNT["🟢 Running: 12개
실행 중 프로세스
CPU 사용 중"]
            SLEEPING_COUNT["🔵 Sleeping: 284개
대기 중 프로세스
정상 유휴 상태"]
            IDLE_COUNT["🟡 Idle: 8개
커널 스레드
작업 대기 중"]
        end
        
        subgraph WARNING["경고 상태"]
            DSTATE_COUNT["🟠 D-State: 2개
⚠️ I/O 대기 중
시그널 방해 금지"]
            STOPPED_COUNT["🟣 Stopped: 1개
정지된 프로세스
사용자 개입 필요"]
        end
        
        subgraph CRITICAL["중요 문제"]
            ZOMBIE_COUNT["🔴 Zombie: 5개
⚠️ 좌비 프로세스
즐시 정리 필요"]
        end
    end
    
    subgraph ANALYSIS["상태 분석"]
        NORMAL_RATIO["정상 비율: 98.4%
(304/309 프로세스)"]
        PROBLEM_RATIO["문제 비율: 1.6%
(5/309 프로세스)"]
    end
    
    subgraph ACTIONS["권장 조치"]
        ACTION_D["D-State 프로세스:
lsof로 I/O 분석"]
        ACTION_Z["Zombie 프로세스:
부모 프로세스 재시작"]
        ACTION_T["Stopped 프로세스:
SIGCONT 신호 전송"]
    end
    
    DSTATE_COUNT --> ACTION_D
    ZOMBIE_COUNT --> ACTION_Z
    STOPPED_COUNT --> ACTION_T
    
    style HEALTHY fill:#E8F5E8
    style WARNING fill:#FFF3E0
    style CRITICAL fill:#FFEBEE
    style RUNNING_COUNT fill:#4CAF50
    style SLEEPING_COUNT fill:#2196F3
    style IDLE_COUNT fill:#9E9E9E
    style DSTATE_COUNT fill:#FF9800
    style STOPPED_COUNT fill:#FF9800
    style ZOMBIE_COUNT fill:#F44336
```

### 1.2 /proc/[pid]/stat 상세 분석

각 필드가 무엇을 의미하는지 정확히 알아봅시다:

### /proc/[pid]/stat 파일 구조 맵

```mermaid
graph TB
    subgraph STAT_FILE["/proc/[pid]/stat 파일 구조"]
        subgraph BASIC_INFO["기본 식별 정보 (1-8번 필드)"]
            FIELD_1["1. PID
프로세스 ID"]
            FIELD_2["2. COMM
명령어 이름 (괄호)"]
            FIELD_3["3. STATE
프로세스 상태"]
            FIELD_4["4. PPID
부모 프로세스 ID"]
            FIELD_5["5. PGRP
프로세스 그룹 ID"]
            FIELD_6["6. SID
세션 ID"]
            FIELD_7["7. TTY
제어 터미널"]
            FIELD_8["8. TPGID
터미널 그룹 ID"]
        end
        
        subgraph MEMORY_INFO["메모리 정보 (9-25번 필드)"]
            FIELD_10["10. MINFLT
마이너 페이지 폴트"]
            FIELD_12["12. MAJFLT
메이저 페이지 폴트"]
            FIELD_23["23. VSIZE
가상 메모리 크기"]
            FIELD_24["24. RSS
실제 메모리 사용량"]
        end
        
        subgraph CPU_INFO["CPU 시간 정보 (14-17번 필드)"]
            FIELD_14["14. UTIME
사용자 모드 CPU 시간"]
            FIELD_15["15. STIME
커널 모드 CPU 시간"]
            FIELD_16["16. CUTIME
자식 사용자 시간"]
            FIELD_17["17. CSTIME
자식 커널 시간"]
        end
        
        subgraph SCHED_INFO["스케줄링 정보 (18-20번 필드)"]
            FIELD_18["18. PRIORITY
스케줄링 우선순위"]
            FIELD_19["19. NICE
Nice 값 (-20~19)"]
            FIELD_20["20. NUM_THREADS
스레드 개수"]
        end
        
        subgraph TIME_INFO["시간 정보 (22번 필드)"]
            FIELD_22["22. STARTTIME
프로세스 시작 시간"]
        end
    end
    
    subgraph PARSING_CHALLENGE["파싱 도전 과제"]
        CHALLENGE_1["특수 문자 처리
COMM 필드에 공백, 괄호 포함"]
        CHALLENGE_2["버전 호환성
커널 버전별 필드 추가"]
        CHALLENGE_3["실시간 변화
프로세스 종료 시 파일 사라짐"]
    end
    
    style BASIC_INFO fill:#E3F2FD
    style MEMORY_INFO fill:#E8F5E8
    style CPU_INFO fill:#FFF3E0
    style SCHED_INFO fill:#F3E5F5
    style TIME_INFO fill:#FFEBEE
    style PARSING_CHALLENGE fill:#FFCDD2
```

### /proc 파일시스템 내비게이션

```mermaid
graph LR
    subgraph PROC_FS["/proc 파일시스템"]
        subgraph PID_DIR["/proc/[PID]/ 디렉토리"]
            STAT["📄 stat
숫자로 된 원시 데이터
기계 처리용"]
            STATUS["📄 status
사람이 읽기 쉬운 형태
가독성 중시"]
            IO["📄 io
I/O 통계 정보
디스크 사용량"]
            MAPS["📄 maps
메모리 맵핑 정보
가상 메모리 레이아웃"]
            STACK["📄 stack
커널 스택 덕프
디버깅용"]
        end
        
        subgraph SYSTEM_WIDE["시스템 전체 정보"]
            LOADAVG["📄 /proc/loadavg
시스템 로드"]
            MEMINFO["📄 /proc/meminfo
메모리 사용량"]
            CPUINFO["📄 /proc/cpuinfo
CPU 정보"]
            UPTIME["📄 /proc/uptime
시스템 가동 시간"]
        end
    end
    
    subgraph TOOLS["시스템 모니터링 도구"]
        PS["🔍 ps
stat/status 파싱
프로세스 목록"]
        TOP["🔍 top
실시간 모니터링
동적 업데이트"]
        HTOP["🔍 htop
사용자 친화적 UI
색상 표시"]
        SYSTEMD["🔍 systemd
서비스 관리
자동 재시작"]
    end
    
    %% 데이터 흐름
    STAT --> PS
    STATUS --> PS
    STAT --> TOP
    STATUS --> TOP
    STAT --> HTOP
    STATUS --> HTOP
    
    LOADAVG --> TOP
    MEMINFO --> TOP
    UPTIME --> TOP
    
    style STAT fill:#4CAF50
    style STATUS fill:#2196F3
    style IO fill:#FF9800
    style MAPS fill:#9C27B0
    style STACK fill:#F44336
    style PS fill:#E1F5FE
    style TOP fill:#E8F5E8
    style HTOP fill:#FFF3E0
    style SYSTEMD fill:#F3E5F5
```

```c
// process_stat_analyzer.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>

typedef struct {
    int pid;
    char comm[256];
    char state;
    int ppid;
    int pgrp;
    int session;
    int tty_nr;
    int tpgid;
    unsigned long flags;
    unsigned long minflt;      // minor page faults
    unsigned long cminflt;     // children minor faults
    unsigned long majflt;      // major page faults
    unsigned long cmajflt;     // children major faults
    unsigned long utime;       // user mode time
    unsigned long stime;       // kernel mode time
    long cutime;               // children user time
    long cstime;               // children system time
    long priority;
    long nice;
    long num_threads;
    long itrealvalue;
    unsigned long long starttime;
    unsigned long vsize;       // virtual memory size
    long rss;                  // resident set size
    unsigned long rsslim;      // RSS limit
    // ... 더 많은 필드들
} proc_stat_t;

const char* state_description(char state) {
    switch (state) {
        case 'R': return "Running (실행 중)";
        case 'S': return "Interruptible sleep (신호로 깨울 수 있는 대기)";
        case 'D': return "Uninterruptible sleep (⚠️ 위험: 신호로 깨울 수 없음)";
        case 'T': return "Stopped (정지됨)";
        case 't': return "Tracing stop (디버거 추적 중)";
        case 'Z': return "Zombie (⚠️ 정리 필요)";
        case 'X': return "Dead (종료됨)";
        case 'I': return "Idle (유휴 상태)";
        default: return "Unknown";
    }
}

// /proc/[pid]/stat 파서 - Linux 프로세스 상태 분석의 핵심
// 실제 사용: htop, ps, top 등 모든 시스템 모니터링 도구가 사용하는 인터페이스
int parse_proc_stat(int pid, proc_stat_t *stat_info) {
    char path[256];
    snprintf(path, sizeof(path), "/proc/%d/stat", pid);

    // ⭐ 1단계: /proc/[pid]/stat 파일 열기
    // 이 파일은 커널이 실시간으로 생성하는 가상 파일
    // 프로세스가 사라지면 파일도 즉시 사라짐
    FILE *f = fopen(path, "r");
    if (!f) {
        // 프로세스가 이미 종료되었거나 권한이 없는 경우
        return -1;
    }

    // ⭐ 2단계: 복잡한 /proc/[pid]/stat 형식 파싱
    // 주의사항: comm 필드는 괄호로 둘러싸이며 공백/특수문자 포함 가능
    // 예: "1234 (hello world) S 1 ..." 형태
    // %255[^)]: 닫는 괄호가 아닌 문자를 최대 255개까지 읽기
    int ret = fscanf(f, "%d (%255[^)]) %c %d %d %d %d %d %lu %lu %lu %lu %lu %lu %lu %ld %ld %ld %ld %ld %ld %llu %lu %ld %lu",
        &stat_info->pid,          // [1] 프로세스 ID
        stat_info->comm,          // [2] 실행 파일명 (괄호 안)
        &stat_info->state,        // [3] 프로세스 상태 (R,S,D,Z,T,t,X,I)
        &stat_info->ppid,         // [4] 부모 프로세스 ID
        &stat_info->pgrp,         // [5] 프로세스 그룹 ID
        &stat_info->session,      // [6] 세션 ID
        &stat_info->tty_nr,       // [7] 터미널 번호
        &stat_info->tpgid,        // [8] 터미널 프로세스 그룹 ID
        &stat_info->flags,        // [9] 커널 플래그 (PF_*)
        &stat_info->minflt,       // [10] 마이너 페이지 폴트 수 (디스크 I/O 없음)
        &stat_info->cminflt,      // [11] 자식 프로세스들의 마이너 폴트 합계
        &stat_info->majflt,       // [12] ⭐ 메이저 페이지 폴트 (디스크 I/O 발생)
        &stat_info->cmajflt,      // [13] 자식 프로세스들의 메이저 폴트 합계
        &stat_info->utime,        // [14] ⭐ 사용자 모드 CPU 시간 (jiffies)
        &stat_info->stime,        // [15] ⭐ 커널 모드 CPU 시간 (jiffies)
        &stat_info->cutime,       // [16] 자식들의 사용자 모드 시간
        &stat_info->cstime,       // [17] 자식들의 커널 모드 시간
        &stat_info->priority,     // [18] ⭐ 스케줄링 우선순위
        &stat_info->nice,         // [19] ⭐ Nice 값 (-20~19)
        &stat_info->num_threads,  // [20] ⭐ 스레드 개수
        &stat_info->itrealvalue,  // [21] 사용되지 않음 (0)
        &stat_info->starttime,    // [22] 부팅 후 프로세스 시작 시간
        &stat_info->vsize,        // [23] ⭐ 가상 메모리 크기 (바이트)
        &stat_info->rss,          // [24] ⭐ 실제 사용 메모리 (페이지 수)
        &stat_info->rsslim        // [25] RSS 제한값
    );

    fclose(f);

    // ⭐ 3단계: 파싱 결과 검증
    // 25개 필드가 모두 올바르게 읽혔는지 확인
    // /proc/[pid]/stat 형식이 커널 버전마다 다를 수 있으므로 중요
    return (ret == 25) ? 0 : -1;
}

void print_process_analysis(const proc_stat_t *stat) {
    printf("=== 프로세스 상태 분석 ===\n");
    printf("PID: %d\n", stat->pid);
    printf("명령어: %s\n", stat->comm);
    printf("상태: %c (%s)\n", stat->state, state_description(stat->state));
    printf("부모 PID: %d\n", stat->ppid);
    printf("스레드 수: %ld\n", stat->num_threads);
    printf("우선순위: %ld (nice: %ld)\n", stat->priority, stat->nice);

    // 메모리 정보
    printf("\n=== 메모리 정보 ===\n");
    printf("가상 메모리: %.1f MB\n", stat->vsize / 1024.0 / 1024.0);
    printf("물리 메모리: %.1f MB\n", stat->rss * 4 / 1024.0);  // 페이지 크기 4KB 가정

    // 페이지 폴트 정보
    printf("\n=== 페이지 폴트 통계 ===\n");
    printf("Minor faults: %lu\n", stat->minflt);
    printf("Major faults: %lu\n", stat->majflt);
    printf("자식 minor faults: %lu\n", stat->cminflt);
    printf("자식 major faults: %lu\n", stat->cmajflt);

    // CPU 시간 정보
    long hz = sysconf(_SC_CLK_TCK);
    printf("\n=== CPU 시간 정보 ===\n");
    printf("사용자 모드: %.2f초\n", (double)stat->utime / hz);
    printf("커널 모드: %.2f초\n", (double)stat->stime / hz);
    printf("총 CPU 시간: %.2f초\n", (double)(stat->utime + stat->stime) / hz);

    // 경고 메시지
    if (stat->state == 'D') {
        printf("\n⚠️  경고: 프로세스가 D state입니다!\n");
        printf("   - I/O 작업을 기다리고 있습니다.\n");
        printf("   - 신호로 종료할 수 없습니다.\n");
        printf("   - 시스템 성능에 영향을 줄 수 있습니다.\n");
    } else if (stat->state == 'Z') {
        printf("\n⚠️  경고: 좀비 프로세스입니다!\n");
        printf("   - 부모 프로세스가 wait()를 호출하지 않았습니다.\n");
        printf("   - 프로세스 테이블 엔트리를 차지하고 있습니다.\n");
    }
}

void monitor_process_state(int pid, int duration) {
    printf("프로세스 %d 상태 모니터링 시작 (%d초간)...\n", pid, duration);

    time_t start_time = time(NULL);
    char last_state = 0;

    while (time(NULL) - start_time < duration) {
        proc_stat_t stat;
        if (parse_proc_stat(pid, &stat) == 0) {
            if (stat.state != last_state) {
                printf("[%s] 상태 변화: %c (%s)\n",
                       ctime(&(time_t){time(NULL)}),
                       stat.state,
                       state_description(stat.state));
                last_state = stat.state;

                // 위험한 상태 감지
                if (stat.state == 'D') {
                    printf("⚠️  D state 감지! I/O 대기 중...\n");
                }
            }
        } else {
            printf("프로세스 %d가 종료되었습니다.\n", pid);
            break;
        }

        sleep(1);
    }
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("사용법: %s <pid> [monitor_duration]\n", argv[0]);
        printf("예시: %s 1234\n", argv[0]);
        printf("예시: %s 1234 60  # 60초간 모니터링\n", argv[0]);
        return 1;
    }

    int pid = atoi(argv[1]);

    if (argc == 2) {
        // 한 번만 분석
        proc_stat_t stat;
        if (parse_proc_stat(pid, &stat) == 0) {
            print_process_analysis(&stat);
        } else {
            printf("프로세스 %d의 정보를 읽을 수 없습니다.\n", pid);
            return 1;
        }
    } else {
        // 지속적 모니터링
        int duration = atoi(argv[2]);
        monitor_process_state(pid, duration);
    }

    return 0;
}
```

### 1.3 /proc/[pid]/status 정보 활용

status 파일은 stat보다 읽기 쉬운 형태로 정보를 제공합니다:

```bash
#!/bin/bash
# process_status_analyzer.sh

analyze_process_status() {
    local pid=$1
    local status_file="/proc/$pid/status"

    if [ ! -f "$status_file" ]; then
        echo "프로세스 $pid를 찾을 수 없습니다."
        return 1
    fi

    echo "=== 프로세스 $pid 상세 분석 ==="

    # 기본 정보
    echo "== 기본 정보 =="
    grep -E "^(Name|State|Pid|PPid|Tgid|Threads)" "$status_file"

    # 메모리 정보
    echo -e "\n== 메모리 정보 =="
    grep -E "^(VmPeak|VmSize|VmLck|VmPin|VmHWM|VmRSS|VmData|VmStk|VmExe|VmLib|VmPTE|VmSwap)" "$status_file"

    # 신호 정보
    echo -e "\n== 신호 정보 =="
    grep -E "^(SigQ|SigPnd|ShdPnd|SigBlk|SigIgn|SigCgt)" "$status_file"

    # 권한 정보
    echo -e "\n== 권한 정보 =="
    grep -E "^(Uid|Gid|Groups)" "$status_file"

    # 상태별 분석
    local state=$(grep "^State:" "$status_file" | awk '{print $2}')

    case $state in
        "D")
            echo -e "\n⚠️  D STATE 감지!"
            echo "현재 프로세스가 I/O 작업을 기다리고 있습니다."
            echo "관련 정보를 확인해보겠습니다..."

            # 열린 파일 확인
            echo -e "\n열린 파일들:"
            lsof -p "$pid" 2>/dev/null | head -10

            # I/O 통계
            if [ -f "/proc/$pid/io" ]; then
                echo -e "\nI/O 통계:"
                cat "/proc/$pid/io"
            fi

            # 스택 트레이스 (root 권한 필요)
            if [ -f "/proc/$pid/stack" ] && [ -r "/proc/$pid/stack" ]; then
                echo -e "\n커널 스택 트레이스:"
                cat "/proc/$pid/stack"
            fi
            ;;

        "Z")
            echo -e "\n⚠️  ZOMBIE 프로세스 감지!"
            echo "부모 프로세스 정보:"
            local ppid=$(grep "^PPid:" "$status_file" | awk '{print $2}')
            if [ -f "/proc/$ppid/comm" ]; then
                echo "부모 PID $ppid: $(cat /proc/$ppid/comm)"
                echo "부모 프로세스에 SIGCHLD 신호를 보내거나 재시작을 고려하세요."
            fi
            ;;

        "T")
            echo -e "\n⚠️  정지된 프로세스 감지!"
            echo "SIGCONT 신호로 재시작할 수 있습니다: kill -CONT $pid"
            ;;
    esac
}

# 시스템 전체 프로세스 상태 요약
system_process_summary() {
    echo "=== 시스템 프로세스 상태 요약 ==="

    ps axo state | tail -n +2 | sort | uniq -c | while read count state; do
        echo "$count 개 프로세스: $state ($(
            case $state in
                R*) echo "Running" ;;
                S*) echo "Sleeping" ;;
                D*) echo "⚠️ Uninterruptible Sleep" ;;
                T*) echo "⚠️ Stopped" ;;
                Z*) echo "⚠️ Zombie" ;;
                I*) echo "Idle" ;;
                *) echo "기타" ;;
            esac
        ))"
    done

    # 문제가 있는 프로세스들 상세 분석
    echo -e "\n=== 문제 프로세스 분석 ==="

    # D state 프로세스들
    local d_processes=$(ps axo pid,state,comm | awk '$2 ~ /^D/ {print $1}')
    if [ -n "$d_processes" ]; then
        echo "⚠️ D state 프로세스들:"
        echo "$d_processes" | while read pid; do
            if [ -n "$pid" ]; then
                echo "  PID $pid: $(cat /proc/$pid/comm 2>/dev/null || echo 'unknown')"
            fi
        done
    fi

    # Zombie 프로세스들
    local zombie_processes=$(ps axo pid,state,comm | awk '$2 ~ /^Z/ {print $1}')
    if [ -n "$zombie_processes" ]; then
        echo "⚠️ Zombie 프로세스들:"
        echo "$zombie_processes" | while read pid; do
            if [ -n "$pid" ]; then
                echo "  PID $pid: $(cat /proc/$pid/comm 2>/dev/null || echo 'unknown')"
            fi
        done
    fi
}

# 메뉴
if [ $# -eq 0 ]; then
    echo "프로세스 상태 분석 도구"
    echo "1) 특정 프로세스 분석: $0 <pid>"
    echo "2) 시스템 전체 요약: $0 summary"
    exit 1
fi

if [ "$1" = "summary" ]; then
    system_process_summary
else
    analyze_process_status "$1"
fi
```

## 핵심 요점

### 프로세스 디버깅 워크플로우

```mermaid
flowchart TD
    START["프로세스 문제 발생"] --> IDENTIFY{"문제 유형
식별"}
    
    IDENTIFY -->|"높은 CPU 사용"| HIGH_CPU["ps aux --sort=-pcpu로
CPU 사용량 확인"]
    IDENTIFY -->|"높은 메모리 사용"| HIGH_MEM["ps aux --sort=-pmem로
메모리 사용량 확인"]
    IDENTIFY -->|"프로세스 메답"| HUNG_PROC["ps axo pid,state,comm로
D-state 프로세스 찾기"]
    IDENTIFY -->|"좌비 프로세스"| ZOMBIE["ps axo pid,ppid,state,comm로
Z-state 프로세스 찾기"]
    
    HIGH_CPU --> ANALYZE_CPU["top, htop, iotop으로
리얼타임 모니터링"]
    HIGH_MEM --> ANALYZE_MEM["/proc/[pid]/status로
메모리 맵핑 또세 분석"]
    HUNG_PROC --> ANALYZE_HUNG["/proc/[pid]/stack로
커널 스택 덤프"]
    ZOMBIE --> ANALYZE_ZOMBIE["/proc/[pid]/status로
부모 프로세스 확인"]
    
    ANALYZE_CPU --> CPU_ACTION["strace, perf로
시스템 콜 추적"]
    ANALYZE_MEM --> MEM_ACTION["valgrind, pmap으로
메모리 누수 추적"]
    ANALYZE_HUNG --> HUNG_ACTION["lsof로 I/O 대기
또는 리부트 고려"]
    ANALYZE_ZOMBIE --> ZOMBIE_ACTION["부모 프로세스에
SIGCHLD 전송 또는 재시작"]
    
    style START fill:#FFCDD2
    style HIGH_CPU fill:#FFF3E0
    style HIGH_MEM fill:#E8F5E8
    style HUNG_PROC fill:#FFEBEE
    style ZOMBIE fill:#F3E5F5
    style CPU_ACTION fill:#4CAF50
    style MEM_ACTION fill:#2196F3
    style HUNG_ACTION fill:#FF9800
    style ZOMBIE_ACTION fill:#9C27B0
```

### 실전 디버깅 명령어 사전

```mermaid
graph TB
    subgraph BASIC_COMMANDS["기본 버깅 명령어"]
        PS_CMD["🔍 ps aux
모든 프로세스 목록
CPU, 메모리 사용량"]
        TOP_CMD["🔍 top
리얼타임 모니터링
동적 정렬, 필터링"]
        PSTREE_CMD["🔍 pstree
프로세스 계층 구조
부모-자식 관계"]
    end
    
    subgraph ADVANCED_COMMANDS["고급 디버깅 명령어"]
        LSOF_CMD["🔍 lsof -p [PID]
열린 파일 목록
I/O 대기 원인 추적"]
        STRACE_CMD["🔍 strace -p [PID]
시스템 콜 추적
실시간 동작 관찰"]
        GDB_CMD["🔍 gdb -p [PID]
디버거 연결
소스 레벨 디버깅"]
    end
    
    subgraph SPECIALIZED_COMMANDS["전문 분석 명령어"]
        PERF_CMD["🔍 perf top
성능 프로파일링
CPU 핫스팏 분석"]
        IOTOP_CMD["🔍 iotop
I/O 사용량 모니터링
디스크 병목 발견"]
        PMAP_CMD["🔍 pmap [PID]
메모리 맵 시각화
메모리 누수 추적"]
    end
    
    subgraph PROC_ANALYSIS["/proc 기반 분석"]
        CAT_STAT["📄 cat /proc/[PID]/stat
원시 데이터 파싱
언전 머신 처리"]
        CAT_STATUS["📄 cat /proc/[PID]/status
가독성 높은 정보
인간 인터펙이스"]
        CAT_STACK["📄 cat /proc/[PID]/stack
커널 스택 덤프
D-state 원인 분석"]
    end
    
    style BASIC_COMMANDS fill:#E8F5E8
    style ADVANCED_COMMANDS fill:#E3F2FD
    style SPECIALIZED_COMMANDS fill:#FFF3E0
    style PROC_ANALYSIS fill:#F3E5F5
```

### 1. /proc/[pid]/stat 파싱의 핵심

- 25개 필드의 정확한 의미 파악
- comm 필드의 특수 문자 처리 주의
- 실시간 프로세스 모니터링 구현

### 2. 프로세스 상태별 특징

- D state: I/O 대기로 신호 처리 불가
- Z state: 부모의 wait() 호출 대기
- T state: SIGSTOP으로 정지된 상태

### 3. 시스템 진단을 위한 접근

- /proc/[pid]/status로 가독성 높은 정보 확인
- lsof로 열린 파일 분석
- I/O 통계로 성능 문제 추적

---

**다음**: [1.5.6 D-state 디버깅](./01-05-06-dstate-debugging.md)에서 위험한 D State 프로세스 디버깅을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: FUNDAMENTALS
-**주제**: 시스템 프로그래밍
-**예상 시간**: 3-5시간

### 🎯 학습 경로

- [📚 FUNDAMENTALS 레벨 전체 보기](../learning-paths/fundamentals/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-01-process-thread)

- [Chapter 1-2-1: 프로세스 생성과 종료 개요](./01-02-01-process-creation.md)
- [Chapter 1-2-2: fork() 시스템 콜과 프로세스 복제 메커니즘](./01-02-02-process-creation-fork.md)
- [Chapter 1-2-3: exec() 패밀리와 프로그램 교체 메커니즘](./01-02-03-program-replacement-exec.md)
- [Chapter 1-2-4: 프로세스 종료와 좀비 처리](./01-02-04-process-termination-zombies.md)
- [Chapter 1-5-1: 프로세스 관리와 모니터링](./01-05-01-process-management-monitoring.md)

### 🏷️ 관련 키워드

`process-state`, `proc-filesystem`, `system-monitoring`, `debugging-fundamentals`

### ⏭️ 다음 단계 가이드

- 기초 개념을 충분히 이해한 후 INTERMEDIATE 레벨로 진행하세요
- 실습 위주의 학습을 권장합니다
