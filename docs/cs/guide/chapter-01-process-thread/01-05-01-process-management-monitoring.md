---
tags:
  - hands-on
  - intermediate
  - medium-read
  - performance_optimization
  - process_management
  - process_pool
  - system_monitoring
  - troubleshooting
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 1.5.1: 프로세스 관리 모니터링

## 리눅스 가계도: 프로세스 트리와 관계

### pstree로 본 충격적 진실

처음 `pstree`를 실행했을 때의 충격을 잊을 수 없습니다:

```bash
$ pstree
systemd─┬─NetworkManager───2*[{NetworkManager}]
       ├─sshd───sshd───bash───pstree
       ├─dockerd─┬─containerd───12*[{containerd}]
       │         └─10*[{dockerd}]
       └─chrome─┬─chrome───chrome───5*[{chrome}]
                └─nacl_helper
```

**모든 프로세스가 연결되어 있다!** 리눅스는 거대한 가족입니다.

### 프로세스 계층 구조: 디지털 족보

리눅스 시스템의 실제 프로세스 트리 구조를 시각화해보겠습니다:

```mermaid
graph TD
    subgraph SYSTEM_ROOT["시스템 루트"]
        INIT["systemd (PID 1)<br/>• 시스템 최상위 조상<br/>• 모든 고아의 부모<br/>• 불사신 프로세스"]
    end
    
    subgraph SYSTEM_SERVICES["시스템 서비스"]
        NETWORK["NetworkManager<br/>네트워크 관리"]
        SSH["sshd<br/>SSH 데몬"]
        DOCKER["dockerd<br/>컨테이너 런타임"]
        CRON["cron<br/>스케줄 작업"]
    end
    
    subgraph USER_PROCESSES["사용자 프로세스"]
        LOGIN["login session"]
        BASH["bash shell"]
        CHROME["chrome browser"]
        VIM["vim editor"]
    end
    
    subgraph WORKER_PROCESSES["워커 프로세스"]
        SSH_SESSION["ssh session"]
        CHROME_TABS["chrome tabs<br/>(여러 프로세스)"]
        CHROME_GPU["chrome GPU<br/>프로세스"]
        DOCKER_CONTAINERS["container<br/>프로세스들"]
    end
    
    INIT --> NETWORK
    INIT --> SSH
    INIT --> DOCKER
    INIT --> CRON
    INIT --> LOGIN
    
    LOGIN --> BASH
    BASH --> CHROME
    BASH --> VIM
    
    SSH --> SSH_SESSION
    CHROME --> CHROME_TABS
    CHROME --> CHROME_GPU
    DOCKER --> DOCKER_CONTAINERS
    
    subgraph PROCESS_STATES["프로세스 상태 표시"]
        RUNNING["🏃 R: Running"]
        SLEEPING["😴 S: Sleeping"]
        WAITING["💀 D: Disk Wait"]
        ZOMBIE["🧟 Z: Zombie"]
    end
    
    style INIT fill:#4CAF50
    style SSH fill:#2196F3
    style CHROME fill:#FF9800
    style ZOMBIE fill:#F44336
```

### 프로세스 관계 분석: 부모-자식 추적

```mermaid
flowchart LR
    subgraph INVESTIGATION["프로세스 관계 조사"]
        FIND_PROC["문제 프로세스 발견<br/>PID: 12345"]
        CHECK_PARENT["부모 프로세스 확인<br/>PPID: 1234"]
        CHECK_CHILDREN["자식 프로세스 확인<br/>children: 12346, 12347"]
    end
    
    subgraph ANALYSIS["관계 분석"]
        PARENT_INFO["부모: nginx (1234)<br/>• 웹서버 마스터<br/>• 워커 관리 역할"]
        CURRENT_INFO["현재: nginx worker (12345)<br/>• HTTP 요청 처리<br/>• CPU 99% 사용"]
        CHILD_INFO["자식: 없음<br/>• 워커 프로세스<br/>• 단순 작업 수행"]
    end
    
    subgraph ACTIONS["대응 방안"]
        GENTLE["1. 부드러운 종료<br/>kill -TERM 12345"]
        FORCE["2. 강제 종료<br/>kill -KILL 12345"]
        RESTART["3. 서비스 재시작<br/>systemctl restart nginx"]
        MONITOR["4. 지속 모니터링<br/>watch 'ps aux | grep nginx'"]
    end
    
    FIND_PROC --> CHECK_PARENT
    CHECK_PARENT --> CHECK_CHILDREN
    CHECK_PARENT --> PARENT_INFO
    FIND_PROC --> CURRENT_INFO
    CHECK_CHILDREN --> CHILD_INFO
    
    CURRENT_INFO --> GENTLE
    GENTLE --> FORCE
    FORCE --> RESTART
    RESTART --> MONITOR
    
    style FIND_PROC fill:#FF5722
    style CURRENT_INFO fill:#FF9800
    style GENTLE fill:#4CAF50
    style FORCE fill:#F44336
```

### 프로세스 트리 구현: 계층 구조 시각화

```c
// 프로세스 트리 출력
void print_process_tree(pid_t pid, int level) {
    char path[256];
    sprintf(path, "/proc/%d/task/%d/children", pid, pid);
    
    FILE *f = fopen(path, "r");
    if (!f) return;
    
    // 들여쓰기
    for (int i = 0; i < level; i++) {
        printf("  ");
    }
    
    // 프로세스 정보
    char name[256];
    get_process_name(pid, name);
    printf("├─ %d %s\n", pid, name);
    
    // 자식 프로세스들
    pid_t child;
    while (fscanf(f, "%d", &child) == 1) {
        print_process_tree(child, level + 1);
    }
    
    fclose(f);
}

// 프로세스 이름 가져오기
void get_process_name(pid_t pid, char *name) {
    char path[256];
    sprintf(path, "/proc/%d/comm", pid);
    
    FILE *f = fopen(path, "r");
    if (f) {
        fscanf(f, "%s", name);
        fclose(f);
    } else {
        strcpy(name, "unknown");
    }
}

// init 프로세스 특징: 신이 되는 방법
void about_init_process() {
    // PID 1은 특별하다 - 리눅스의 아담
    if (getpid() == 1) {
        printf("I am init!\n");
        
        // init은 불사신! SIGKILL도 못 죽임
        signal(SIGTERM, SIG_IGN);
        signal(SIGKILL, SIG_IGN);  // 커널: "안 돼, 널 죽으면 안 돼!"
        
        // 모든 고아의 부모가 됨
        while (1) {
            // 좀비 자식들 수거
            while (waitpid(-1, NULL, WNOHANG) > 0);
            
            // init 작업 수행
            perform_init_duties();
            
            sleep(1);
        }
    }
}
```

## 프로세스 상태 전이: 삶의 단계들

### CPU를 얻기 위한 전쟁

한 번은 서버의 로드 애버리지가 200을 넘은 적이 있습니다. 무슨 일이 일어난 걸까요?

```bash
$ uptime
load average: 212.35, 198.67, 187.43  # CPU는 8개인데?!

$ ps aux | grep " D "
... (수십 개의 D 상태 프로세스)
```

**D 상태(Uninterruptible Sleep)**의 프로세스들이 I/O를 기다리며 쌓여있었습니다. NFS 서버가 죽어서 모든 프로세스가 대기 중이었죠.

### 프로세스 상태: 7개의 인생

```mermaid
stateDiagram-v2
    [*] --> NEW: fork()
    NEW --> READY: 스케줄 가능
    READY --> RUNNING: CPU 할당
    RUNNING --> READY: 시간 할당 종료
    RUNNING --> WAITING: I/O 대기
    WAITING --> READY: I/O 완료
    RUNNING --> ZOMBIE: exit()
    ZOMBIE --> [*]: wait() 수거
    
    RUNNING --> STOPPED: SIGSTOP
    STOPPED --> READY: SIGCONT
```

### 상태 확인과 변경: 프로세스 진단하기

```c
// 프로세스 상태 확인: 건강 검진
void check_process_state(pid_t pid) {
    printf("\n=== 프로세스 %d 상태 진단 ===\n", pid);
    char path[256];
    sprintf(path, "/proc/%d/stat", pid);
    
    FILE *f = fopen(path, "r");
    if (!f) return;
    
    char state;
    fscanf(f, "%*d %*s %c", &state);
    fclose(f);
    
    switch (state) {
        case 'R': printf("🏃 Running (CPU 사용 중!)\n"); break;
        case 'S': printf("😴 Sleeping (깨울 수 있음)\n"); break;
        case 'D': printf("💀 Disk sleep (깨울 수 없음! 위험!)\n"); break;
        case 'Z': printf("🧟 Zombie (죽었는데 안 죽음)\n"); break;
        case 'T': printf("⏸️ Stopped (일시정지)\n"); break;
        case 't': printf("🔍 Tracing stop (디버깅 중)\n"); break;
        case 'X': printf("☠️ Dead (완전히 죽음)\n"); break;
    }
}

// 프로세스 일시 정지/재개
void control_process() {
    pid_t pid = fork();
    
    if (pid == 0) {
        // 자식: 카운터
        for (int i = 0; i < 100; i++) {
            printf("Count: %d\n", i);
            sleep(1);
        }
        exit(0);
    } else {
        // 부모: 제어
        sleep(3);
        
        printf("Stopping child...\n");
        kill(pid, SIGSTOP);
        
        sleep(3);
        
        printf("Resuming child...\n");
        kill(pid, SIGCONT);
        
        waitpid(pid, NULL, 0);
    }
}
```

## 실전: 프로세스 관리 (프로덕션 레시피)

### Apache의 비밀: Prefork MPM

Apache 웹서버의 prefork 모드를 분석하면서 배운 프로세스 풀의 정수:

```text
초기: 5개 프로세스 대기
트래픽 증가 → 프로세스 10개로 증가
트래픽 폭증 → 최대 256개까지
트래픽 감소 → 천천히 감소 (급격한 변화 방지)
```

### Apache Prefork 모델 시각화: 효율적인 프로세스 관리

```mermaid
graph TD
    subgraph MASTER["마스터 프로세스"]
        APACHE_MASTER["Apache Master<br/>• 설정 관리<br/>• 워커 생성/제거<br/>• 로드 모니터링"]
    end
    
    subgraph WORKER_POOL["워커 프로세스 풀"]
        W1["Worker 1<br/>🟢 Idle"]
        W2["Worker 2<br/>🟡 Busy"]
        W3["Worker 3<br/>🟡 Busy"]
        W4["Worker 4<br/>🟢 Idle"]
        W5["Worker 5<br/>🟢 Idle"]
        DOTS["..."]
        W256["Worker 256<br/>🔴 Max Reached"]
    end
    
    subgraph CLIENTS["클라이언트 요청"]
        C1["Browser 1"]
        C2["Browser 2"]
        C3["Browser 3"]
        C4["API Client"]
    end
    
    subgraph LOAD_BALANCING["로드 밸런싱"]
        LB["요청 분배<br/>• Round Robin<br/>• Least Connections<br/>• Available Worker"]
    end
    
    APACHE_MASTER --> W1
    APACHE_MASTER --> W2
    APACHE_MASTER --> W3
    APACHE_MASTER --> W4
    APACHE_MASTER --> W5
    APACHE_MASTER --> W256
    
    C1 --> LB
    C2 --> LB
    C3 --> LB
    C4 --> LB
    
    LB --> W1
    LB --> W4
    LB --> W5
    
    subgraph SCALING["동적 스케일링"]
        SCALE_UP["트래픽 증가<br/>→ 워커 추가<br/>(최대 256개)"]
        SCALE_DOWN["트래픽 감소<br/>→ 점진적 감소<br/>(최소 5개 유지)"]
    end
    
    APACHE_MASTER --> SCALE_UP
    APACHE_MASTER --> SCALE_DOWN
    
    style APACHE_MASTER fill:#4CAF50
    style W2 fill:#FF9800
    style W3 fill:#FF9800
    style W256 fill:#F44336
    style LB fill:#2196F3
```

### 프로세스 풀 통신 아키텍처: 파이프 기반 IPC

```mermaid
sequenceDiagram
    participant Master as "마스터 프로세스"
    participant Pool as "프로세스 풀"
    participant W1 as "Worker 1"
    participant W2 as "Worker 2"
    participant Client as "클라이언트"
    
    Note over Master,Client: 프로세스 풀 초기화 및 작업 분배
    
    Master->>Pool: 프로세스 풀 생성 (5개)
    Pool->>W1: fork() → Worker 1 생성
    Pool->>W2: fork() → Worker 2 생성
    
    Note over W1,W2: 파이프 연결 설정
    W1->>Master: pipe_from_workers[1] 연결
    W2->>Master: pipe_from_workers[1] 연결
    
    loop 작업 대기 상태
        W1->>W1: read(pipe_to_workers[0]) 대기
        W2->>W2: read(pipe_to_workers[0]) 대기
    end
    
    Client->>Master: HTTP 요청 도착
    Master->>Pool: write(pipe_to_workers[1], task)
    
    alt Worker 1이 먼저 읽음
        Pool->>W1: 작업 할당
        W1->>W1: process_request() 실행
        W1->>Master: write(pipe_from_workers[1], result)
        Master->>Client: HTTP 응답 전송
    end
    
    Note over Master: 워커 상태 모니터링
    Master->>Master: 유휴 워커 < 2개?
    
    alt 워커 부족
        Master->>Pool: 새 워커 생성
        Pool->>Master: 최대 256개까지 확장
    else 워커 과다
        Master->>Pool: 유휴 워커 점진적 제거
    end
```

### 프로세스 풀 구현: 미리 만들어 놓고 재사용

```c
typedef struct {
    pid_t *workers;
    int num_workers;
    int pipe_to_workers[2];
    int pipe_from_workers[2];
} process_pool_t;

// 프로세스 풀 생성: Apache처럼 만들기
process_pool_t* create_process_pool(int num_workers) {
    printf("\n=== 프로세스 풀 생성 (워커: %d개) ===\n", num_workers);
    
    process_pool_t *pool = malloc(sizeof(process_pool_t));
    pool->num_workers = num_workers;
    pool->workers = malloc(num_workers * sizeof(pid_t));
    
    pipe(pool->pipe_to_workers);
    pipe(pool->pipe_from_workers);
    
    for (int i = 0; i < num_workers; i++) {
        pid_t pid = fork();
        
        if (pid == 0) {
            // 워커 프로세스
            close(pool->pipe_to_workers[1]);
            close(pool->pipe_from_workers[0]);
            
            worker_main(pool->pipe_to_workers[0],
                       pool->pipe_from_workers[1]);
            exit(0);
        } else {
            pool->workers[i] = pid;
        }
    }
    
    // 마스터용 파이프 설정
    close(pool->pipe_to_workers[0]);
    close(pool->pipe_from_workers[1]);
    
    return pool;
}

// 워커 프로세스 메인
void worker_main(int read_fd, int write_fd) {
    while (1) {
        task_t task;
        
        // 작업 대기
        if (read(read_fd, &task, sizeof(task)) != sizeof(task)) {
            break;
        }
        
        // 작업 수행
        result_t result = process_task(&task);
        
        // 결과 전송
        write(write_fd, &result, sizeof(result));
    }
}

// 작업 분배
void distribute_work(process_pool_t *pool, task_t *tasks, int num_tasks) {
    // 모든 작업 전송
    for (int i = 0; i < num_tasks; i++) {
        write(pool->pipe_to_workers[1], &tasks[i], sizeof(task_t));
    }
    
    // 결과 수집
    for (int i = 0; i < num_tasks; i++) {
        result_t result;
        read(pool->pipe_from_workers[0], &result, sizeof(result));
        process_result(&result);
    }
}
```

### 프로세스 모니터링: 나만의 htop 만들기

```c
// 프로세스 정보 수집
typedef struct {
    pid_t pid;
    char name[256];
    long memory_kb;
    double cpu_percent;
    char state;
} process_info_t;

process_info_t* get_process_info(pid_t pid) {
    process_info_t *info = malloc(sizeof(process_info_t));
    info->pid = pid;
    
    // 이름
    char path[256];
    sprintf(path, "/proc/%d/comm", pid);
    FILE *f = fopen(path, "r");
    if (f) {
        fscanf(f, "%s", info->name);
        fclose(f);
    }
    
    // 메모리
    sprintf(path, "/proc/%d/status", pid);
    f = fopen(path, "r");
    if (f) {
        char line[256];
        while (fgets(line, sizeof(line), f)) {
            if (strncmp(line, "VmRSS:", 6) == 0) {
                sscanf(line, "VmRSS: %ld kB", &info->memory_kb);
                break;
            }
        }
        fclose(f);
    }
    
    // CPU (간단 버전)
    sprintf(path, "/proc/%d/stat", pid);
    f = fopen(path, "r");
    if (f) {
        unsigned long utime, stime;
        fscanf(f, "%*d %*s %c %*d %*d %*d %*d %*d %*u "
               "%*u %*u %*u %*u %lu %lu",
               &info->state, &utime, &stime);
        
        // CPU 사용률 계산 (간소화)
        info->cpu_percent = (utime + stime) / (double)sysconf(_SC_CLK_TCK);
        fclose(f);
    }
    
    return info;
}

### 시스템 모니터링 아키텍처: 전체 생태계

```mermaid
graph TD
    subgraph KERNEL["커널 레벨"]
        PROC_FS["/proc 파일시스템<br/>• 실시간 프로세스 정보<br/>• 메모리 맵핑<br/>• 파일 디스크립터"]
        SYS_FS["/sys 파일시스템<br/>• 하드웨어 정보<br/>• 커널 파라미터<br/>• 디바이스 상태"]
        PERF["perf 이벤트<br/>• CPU 성능 카운터<br/>• 트레이싱 포인트<br/>• 프로파일링 데이터"]
    end
    
    subgraph TOOLS["모니터링 도구"]
        BASIC["기본 도구<br/>• ps, top, htop<br/>• vmstat, iostat<br/>• free, uptime"]
        ADVANCED["고급 도구<br/>• strace, ltrace<br/>• perf, valgrind<br/>• gdb, lsof"]
        NETWORK["네트워크<br/>• netstat, ss<br/>• tcpdump, wireshark<br/>• iftop, nethogs"]
    end
    
    subgraph AUTOMATION["자동화 시스템"]
        SCRIPTS["모니터링 스크립트<br/>• Bash 스크립트<br/>• Python 대시보드<br/>• 알람 시스템"]
        AGENTS["에이전트<br/>• collectd<br/>• node_exporter<br/>• zabbix_agentd"]
        METRICS["메트릭 수집<br/>• Prometheus<br/>• InfluxDB<br/>• Grafana"]
    end
    
    subgraph ALERTING["알람 및 대응"]
        MONITORING["모니터링 시스템<br/>• Nagios<br/>• Zabbix<br/>• AlertManager"]
        NOTIFICATION["알림 채널<br/>• Email, SMS<br/>• Slack, PagerDuty<br/>• Webhook"]
        ACTIONS["자동 대응<br/>• 프로세스 재시작<br/>• 스케일링<br/>• 로드밸런싱"]
    end
    
    PROC_FS --> BASIC
    PROC_FS --> ADVANCED
    SYS_FS --> BASIC
    PERF --> ADVANCED
    
    BASIC --> SCRIPTS
    ADVANCED --> SCRIPTS
    NETWORK --> SCRIPTS
    
    SCRIPTS --> AGENTS
    AGENTS --> METRICS
    METRICS --> MONITORING
    
    MONITORING --> NOTIFICATION
    MONITORING --> ACTIONS
    
    style PROC_FS fill:#4CAF50
    style BASIC fill:#2196F3
    style SCRIPTS fill:#FF9800
    style MONITORING fill:#9C27B0
```

### /proc 파일시스템 활용 맵: 프로세스 정보의 보물창고

```mermaid
graph LR
    subgraph PROC_ROOT["/proc 디렉토리 구조"]
        PROC_PID["/proc/[PID]/<br/>개별 프로세스 정보"]
        PROC_SYS["/proc/sys/<br/>커널 파라미터"]
        PROC_NET["/proc/net/<br/>네트워크 정보"]
        PROC_MEM["/proc/meminfo<br/>메모리 정보"]
    end
    
    subgraph PID_DETAILS["프로세스별 상세 정보"]
        STATUS["/proc/PID/status<br/>• 상태 정보<br/>• 메모리 사용량<br/>• 신호 마스크"]
        CMDLINE["/proc/PID/cmdline<br/>• 명령행 인자<br/>• 실행 경로"]
        MAPS["/proc/PID/maps<br/>• 메모리 맵<br/>• 라이브러리 위치<br/>• 권한 정보"]
        FD["/proc/PID/fd/<br/>• 파일 디스크립터<br/>• 소켓 연결<br/>• 파이프 정보"]
        STAT["/proc/PID/stat<br/>• CPU 시간<br/>• 상태 코드<br/>• 우선순위"]
    end
    
    subgraph SYSTEM_WIDE["시스템 전체 정보"]
        LOADAVG["/proc/loadavg<br/>로드 애버리지"]
        UPTIME["/proc/uptime<br/>시스템 가동시간"]
        CPUINFO["/proc/cpuinfo<br/>CPU 상세 정보"]
        DISKSTATS["/proc/diskstats<br/>디스크 I/O 통계"]
    end
    
    subgraph MONITORING_USES["모니터링 활용"]
        HTOP_USE["htop<br/>• /proc/PID/stat<br/>• /proc/meminfo<br/>• /proc/loadavg"]
        PS_USE["ps 명령어<br/>• /proc/PID/status<br/>• /proc/PID/cmdline<br/>• /proc/PID/stat"]
        CUSTOM_USE["커스텀 모니터<br/>• Python psutil<br/>• 직접 파일 읽기<br/>• 실시간 대시보드"]
    end
    
    PROC_PID --> STATUS
    PROC_PID --> CMDLINE
    PROC_PID --> MAPS
    PROC_PID --> FD
    PROC_PID --> STAT
    
    PROC_ROOT --> LOADAVG
    PROC_ROOT --> UPTIME
    PROC_ROOT --> CPUINFO
    PROC_ROOT --> DISKSTATS
    
    STATUS --> HTOP_USE
    STAT --> PS_USE
    LOADAVG --> CUSTOM_USE
    
    style PROC_PID fill:#4CAF50
    style STATUS fill:#2196F3
    style HTOP_USE fill:#FF9800
```

```c
// 프로세스 모니터: 미니 htop
void monitor_processes() {
    printf("\n=== 실시간 프로세스 모니터 (Ctrl+C로 종료) ===\n");

    while (1) {
        system("clear");
        printf("🖥️  프로세스 모니터 - %s\n", get_current_time());
        printf("PID\tNAME\t\tMEM(KB)\tCPU%%\tSTATE\n");
        printf("----------------------------------------\n");
        
        DIR *proc_dir = opendir("/proc");
        struct dirent *entry;
        
        while ((entry = readdir(proc_dir)) != NULL) {
            // 숫자로 된 디렉토리만 (PID)
            if (!isdigit(entry->d_name[0])) continue;
            
            pid_t pid = atoi(entry->d_name);
            process_info_t *info = get_process_info(pid);
            
            printf("%d\t%-15s\t%ld\t%.1f\t%c\n",
                   info->pid, info->name, info->memory_kb,
                   info->cpu_percent, info->state);
            
            free(info);
        }
        
        closedir(proc_dir);
        sleep(1);
    }
}
```

## 실전 모니터링 도구들

### 기본 명령어들

```bash
# 프로세스 목록 보기
ps aux                    # 모든 프로세스
ps -ef                    # 다른 형식
ps -eo pid,ppid,cmd      # 커스텀 출력

# 프로세스 트리
pstree                   # 계층 구조
pstree -p               # PID 포함
pstree -u user          # 특정 사용자

# 동적 모니터링
top                     # 기본 모니터
htop                    # 향상된 모니터
watch "ps aux"          # 주기적 실행

# 리소스 사용률
vmstat 1                # 메모리/CPU 통계
iostat 1                # I/O 통계
sar -u 1 10            # 시스템 통계
```

### 고급 분석 도구

```bash
# 프로세스 추적
strace -p PID           # 시스템 콜 추적
ltrace -p PID           # 라이브러리 콜 추적
gdb -p PID              # 디버거 연결

# 성능 분석
perf record ./program   # 성능 데이터 수집
perf report            # 분석 결과
valgrind ./program     # 메모리 검사

# 네트워크 모니터링
netstat -tulpn         # 포트 사용 현황
ss -tulpn              # 향상된 버전
lsof -i                # 네트워크 연결
```

### proc 파일시스템 활용

```bash
# 프로세스 상세 정보
cat /proc/PID/status    # 기본 정보
cat /proc/PID/cmdline   # 명령어 라인
cat /proc/PID/environ   # 환경변수
cat /proc/PID/maps      # 메모리 맵
cat /proc/PID/fd/       # 파일 디스크립터

# 시스템 전체 정보
cat /proc/meminfo       # 메모리 정보
cat /proc/cpuinfo       # CPU 정보
cat /proc/loadavg       # 로드 애버리지
cat /proc/uptime        # 시스템 가동시간
```

## 성능 최적화 기법

### CPU 친화도 (CPU Affinity)

```c
// CPU 친화도 설정: 특정 CPU에 프로세스 바인딩
void set_cpu_affinity(int cpu_id) {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(cpu_id, &cpuset);
    
    if (sched_setaffinity(0, sizeof(cpuset), &cpuset) == -1) {
        perror("sched_setaffinity");
        return;
    }
    
    printf("프로세스 %d가 CPU %d에 바인딩되었습니다\n", getpid(), cpu_id);
}

// NUMA 인식 배치
void numa_aware_allocation() {
    // NUMA 노드 정보 확인
    int numa_nodes = numa_num_configured_nodes();
    printf("NUMA 노드 수: %d\n", numa_nodes);
    
    // 로컬 메모리 할당
    numa_set_localalloc();
    
    // 특정 노드에 바인딩
    // numa_bind(numa_parse_nodestring("0"));
}
```

### 프로세스 우선순위 조정

```c
// nice 값 조정
void adjust_priority() {
    // 현재 우선순위 확인
    int current_priority = getpriority(PRIO_PROCESS, 0);
    printf("현재 우선순위: %d\n", current_priority);
    
    // 낮은 우선순위로 설정 (백그라운드 작업)
    if (setpriority(PRIO_PROCESS, 0, 10) == -1) {
        perror("setpriority");
    } else {
        printf("우선순위를 10으로 설정\n");
    }
}

// 리얼타임 스케줄링
void set_realtime_priority() {
    struct sched_param param;
    param.sched_priority = 50;  // 1-99 범위
    
    if (sched_setscheduler(0, SCHED_FIFO, &param) == -1) {
        perror("sched_setscheduler");
    } else {
        printf("리얼타임 FIFO 스케줄링 설정\n");
    }
}
```

## 장애 대응 시나리오

### 시스템 장애 진단 플로우차트: 문제 해결의 체계적 접근

```mermaid
flowchart TD
    START["시스템 장애 발생"] --> SYMPTOMS{"증상 확인"}
    
    SYMPTOMS -->|"CPU 100%"| CPU_HIGH["🔥 CPU 과부하"]
    SYMPTOMS -->|"메모리 부족"| MEM_HIGH["💾 메모리 부족"]
    SYMPTOMS -->|"응답 없음"| HANG["🚫 시스템 행"]
    SYMPTOMS -->|"디스크 Full"| DISK_FULL["💽 디스크 풀"]
    SYMPTOMS -->|"좀비 대량"| ZOMBIE_ISSUE["🧟 좀비 대량"]
    
    CPU_HIGH --> CPU_DIAG{"TOP으로 원인 분석"}
    CPU_DIAG -->|"특정 프로세스"| SINGLE_PROC["개별 프로세스 문제<br/>strace -p PID<br/>gdb -p PID"]
    CPU_DIAG -->|"시스템 전체"| SYSTEM_WIDE["시스템 전반 문제<br/>vmstat, iostat<br/>sar 분석"]
    
    MEM_HIGH --> MEM_DIAG{"메모리 사용 분석"}
    MEM_DIAG -->|"메모리 누수"| MEM_LEAK["메모리 누수<br/>valgrind 검사<br/>pmap 분석"]
    MEM_DIAG -->|"캐시 과다"| CACHE_CLEAR["캐시 정리<br/>echo 3 > /proc/sys/vm/drop_caches"]
    
    HANG --> HANG_DIAG{"프로세스 상태 확인"}
    HANG_DIAG -->|"D state 많음"| IO_WAIT["I/O 대기 상태<br/>iostat -x<br/>iotop 확인"]
    HANG_DIAG -->|"데드락"| DEADLOCK["데드락 상황<br/>strace 추적<br/>gdb 스택 분석"]
    
    ZOMBIE_ISSUE --> ZOMBIE_PARENT["부모 프로세스 확인<br/>ps -eo pid,ppid,state"]
    ZOMBIE_PARENT --> RESTART_PARENT["부모 프로세스 재시작<br/>systemctl restart service"]
    
    subgraph SOLUTIONS["해결 방안"]
        GENTLE_KILL["1. 정상 종료<br/>kill -TERM PID"]
        FORCE_KILL["2. 강제 종료<br/>kill -KILL PID"]
        SERVICE_RESTART["3. 서비스 재시작<br/>systemctl restart"]
        SYSTEM_REBOOT["4. 시스템 재부팅<br/>(최후 수단)"]
    end
    
    SINGLE_PROC --> GENTLE_KILL
    MEM_LEAK --> GENTLE_KILL
    GENTLE_KILL --> FORCE_KILL
    FORCE_KILL --> SERVICE_RESTART
    SERVICE_RESTART --> SYSTEM_REBOOT
    
    style START fill:#FF5722
    style CPU_HIGH fill:#FF9800
    style MEM_HIGH fill:#2196F3
    style ZOMBIE_ISSUE fill:#9C27B0
    style SYSTEM_REBOOT fill:#F44336
```

### 성능 병목 진단 트리: 단계별 성능 분석

```mermaid
flowchart LR
    PERF_ISSUE["성능 저하 발생"] --> METRIC_CHECK{"기본 메트릭 확인"}
    
    METRIC_CHECK --> CPU_CHECK["CPU 사용률<br/>top, htop"]
    METRIC_CHECK --> MEM_CHECK["메모리 사용률<br/>free -h"]
    METRIC_CHECK --> IO_CHECK["디스크 I/O<br/>iostat -x"]
    METRIC_CHECK --> NET_CHECK["네트워크<br/>iftop, ss"]
    
    CPU_CHECK --> CPU_ANALYSIS{"CPU 분석"}
    CPU_ANALYSIS -->|"> 80%"| CPU_BOTTLENECK["CPU 병목<br/>• 프로세스 최적화<br/>• CPU 업그레이드<br/>• 로드밸런싱"]
    CPU_ANALYSIS -->|"< 50%"| NOT_CPU["CPU 아님<br/>다른 원인 조사"]
    
    MEM_CHECK --> MEM_ANALYSIS{"메모리 분석"}
    MEM_ANALYSIS -->|"> 90%"| MEM_BOTTLENECK["메모리 병목<br/>• 메모리 누수 수정<br/>• 캐시 조정<br/>• 메모리 증설"]
    MEM_ANALYSIS -->|"< 70%"| NOT_MEM["메모리 아님<br/>다른 원인 조사"]
    
    IO_CHECK --> IO_ANALYSIS{"I/O 분석"}
    IO_ANALYSIS -->|"await > 100ms"| IO_BOTTLENECK["I/O 병목<br/>• SSD 업그레이드<br/>• I/O 스케줄러 조정<br/>• 파일시스템 최적화"]
    IO_ANALYSIS -->|"await < 10ms"| NOT_IO["I/O 아님<br/>다른 원인 조사"]
    
    NET_CHECK --> NET_ANALYSIS{"네트워크 분석"}
    NET_ANALYSIS -->|"bandwidth > 80%"| NET_BOTTLENECK["네트워크 병목<br/>• 대역폭 증설<br/>• 트래픽 최적화<br/>• CDN 도입"]
    NET_ANALYSIS -->|"bandwidth < 50%"| NOT_NET["네트워크 아님<br/>다른 원인 조사"]
    
    subgraph MONITORING["지속 모니터링"]
        SETUP_ALERT["알람 설정<br/>• 임계값 설정<br/>• 자동 알림<br/>• 대시보드 구성"]
        TREND_ANALYSIS["트렌드 분석<br/>• 장기 추이<br/>• 패턴 인식<br/>• 용량 계획"]
    end
    
    CPU_BOTTLENECK --> SETUP_ALERT
    MEM_BOTTLENECK --> SETUP_ALERT
    IO_BOTTLENECK --> SETUP_ALERT
    NET_BOTTLENECK --> SETUP_ALERT
    
    SETUP_ALERT --> TREND_ANALYSIS
    
    style PERF_ISSUE fill:#FF5722
    style CPU_BOTTLENECK fill:#FF9800
    style MEM_BOTTLENECK fill:#2196F3
    style IO_BOTTLENECK fill:#4CAF50
    style NET_BOTTLENECK fill:#9C27B0
```

### 시나리오 1: 프로세스 폭주

```bash
# 증상: CPU 사용률 100%
$ top
PID    USER     PR  NI    VIRT    RES    SHR S  %CPU %MEM
12345  apache   20   0  500000  50000   1000 R  99.9  5.0

# 원인 분석
$ strace -p 12345
# 무한 루프 또는 비효율적 코드 발견

# 대응
$ kill -STOP 12345  # 일시 정지
$ gdb -p 12345      # 디버거로 분석
$ kill -TERM 12345  # 정상 종료 요청
$ kill -KILL 12345  # 강제 종료
```

### 시나리오 2: 메모리 누수

```bash
# 증상: 메모리 사용률 지속 증가
$ free -h
              total        used        free      shared  buff/cache   available
Mem:            8.0G        7.8G        200M         50M        100M        150M

# 원인 분석
$ ps aux --sort=-%mem | head -10
$ pmap -x PID
$ valgrind --leak-check=full ./program

# 대응
$ echo 3 > /proc/sys/vm/drop_caches  # 버퍼 캠시 비우기
$ swapoff -a && swapon -a           # 스왈 리셋
```

### 시나리오 3: 좀비 대량 발생

```bash
# 증상: 좀비 프로세스 대량 발생
$ ps aux | grep defunct | wc -l
1500

# 원인 분석
$ ps -eo pid,ppid,state,comm | grep Z
$ pstree -p | grep defunct

# 대응
$ kill -CHLD PPID  # 부모 프로세스에 SIGCHLD 전솨
$ systemctl restart service  # 서비스 재시작
```

## 모니터링 스크립트

### 자동 알람 시스템

```bash
#!/bin/bash
# process_monitor.sh - 프로세스 모니터링 스크립트

CPU_THRESHOLD=80
MEM_THRESHOLD=80
ZOMBIE_THRESHOLD=100
LOGFILE="/var/log/process_monitor.log"

while true; do
    DATE=$(date '+%Y-%m-%d %H:%M:%S')
    
    # CPU 사용률 체크
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    if (( $(echo "$CPU_USAGE > $CPU_THRESHOLD" | bc -l) )); then
        echo "$DATE ALERT: High CPU usage: ${CPU_USAGE}%" >> $LOGFILE
    fi
    
    # 메모리 사용률 체크
    MEM_USAGE=$(free | awk 'NR==2{printf "%.2f", $3*100/$2}')
    if (( $(echo "$MEM_USAGE > $MEM_THRESHOLD" | bc -l) )); then
        echo "$DATE ALERT: High memory usage: ${MEM_USAGE}%" >> $LOGFILE
    fi
    
    # 좀비 프로세스 체크
    ZOMBIE_COUNT=$(ps aux | grep defunct | wc -l)
    if [ $ZOMBIE_COUNT -gt $ZOMBIE_THRESHOLD ]; then
        echo "$DATE ALERT: Too many zombies: $ZOMBIE_COUNT" >> $LOGFILE
    fi
    
    # 로드 애버리지 체크
    LOAD_AVG=$(uptime | awk '{print $(NF-2)}' | cut -d',' -f1)
    if (( $(echo "$LOAD_AVG > 10.0" | bc -l) )); then
        echo "$DATE ALERT: High load average: $LOAD_AVG" >> $LOGFILE
    fi
    
    sleep 60  # 1분마다 체크
done
```

### 성능 대시보드

```python
#!/usr/bin/env python3
# dashboard.py - 실시간 대시보드

import psutil
import time
import os
from datetime import datetime

def show_system_info():
    # CPU 정보
    cpu_percent = psutil.cpu_percent(interval=1)
    cpu_count = psutil.cpu_count()
    
    # 메모리 정보
    mem = psutil.virtual_memory()
    
    # 로드 애버리지
    load_avg = os.getloadavg()
    
    # 화면 초기화
    os.system('clear')
    
    print(f"""
    🖥️ 시스템 모니터 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
    
    📊 CPU: {cpu_percent}% ({cpu_count} cores)
    💾 메모리: {mem.percent}% ({mem.used//1024//1024}MB/{mem.total//1024//1024}MB)
    🏃 로드: {load_avg[0]:.2f} {load_avg[1]:.2f} {load_avg[2]:.2f}
    
    🔄 상위 프로세스 (CPU):
    """)
    
    # 상위 프로세스 표시
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent']):
        try:
            if proc.info['cpu_percent'] > 0:
                print(f"    {proc.info['pid']:>5} {proc.info['name']:<20} {proc.info['cpu_percent']:>5.1f}%")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

def main():
    try:
        while True:
            show_system_info()
            time.sleep(5)
    except KeyboardInterrupt:
        print("\n모니터링 종료")

if __name__ == "__main__":
    main()
```

## 핵심 요점

### 1. 프로세스 계층 구조

모든 프로세스는 부모-자식 관계로 연결된 트리 구조를 형성합니다. init(또는 systemd)이 모든 프로세스의 최상위 조상입니다.

### 2. 상태 모니터링

프로세스의 7가지 상태(R, S, D, Z, T, t, X)를 이해하고 각 상태의 의미를 파악해야 합니다.

### 3. 실전 관리 기법

- **프로세스 풀**: Apache처럼 미리 만들어 둔 프로세스 활용
- **CPU 친화도**: 특정 CPU에 프로세스 바인딩으로 성능 옵적화
- **우선순위 조정**: nice/renice로 시스템 자원 배분 제어

### 4. 모니터링 도구 활용

- **기본**: ps, top, htop, pstree
- **고급**: strace, perf, valgrind
- **자동화**: 모니터링 스크립트와 알람 시스템

### 5. /proc 파일시스템

리눅스의 핵심 인터페이스로 모든 프로세스 정보에 접근할 수 있습니다.

---

**이전**: [01-13-process-termination-zombies.md](./01-02-04-process-termination-zombies.md)  
**다음**: [01-14-thread-synchronization.md](./01-03-02-thread-synchronization.md)에서 스레드와 동기화 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-01-process-thread)

- [Chapter 4-1: 프로세스 생성과 종료 개요](./01-02-01-process-creation.md)
- [Chapter 4-1A: fork() 시스템 콜과 프로세스 복제 메커니즘](./01-02-02-process-creation-fork.md)
- [Chapter 4-1B: exec() 패밀리와 프로그램 교체 메커니즘](./01-02-03-program-replacement-exec.md)
- [Chapter 4-1C: 프로세스 종료와 좀비 처리](./01-02-04-process-termination-zombies.md)
- [1.3.2 스레드 동기화 개요: 멀티스레딩 마스터로드맵](./01-03-02-thread-synchronization.md)

### 🏷️ 관련 키워드

`process_management`, `system_monitoring`, `process_pool`, `performance_optimization`, `troubleshooting`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
