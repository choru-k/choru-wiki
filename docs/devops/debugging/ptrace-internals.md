---
tags:
  - ptrace
  - Debugging
  - System-Call
  - Linux
  - Kernel
  - Security
  - GDB
  - strace
---

# ptrace 시스템 콜: 디버깅 도구의 핵심 메커니즘

## 들어가며

"gdb는 어떻게 프로그램을 멈추고 변수 값을 볼 수 있을까?" "strace는 어떻게 다른 프로세스의 시스템 콜을 실시간으로 감시할까?" 이 모든 디버깅 도구들의 핵심에는 **ptrace**라는 강력한 시스템 콜이 있습니다. ptrace는 한 프로세스가 다른 프로세스의 실행을 제어하고, 메모리를 읽고 쓰며, 시스템 콜을 가로챌 수 있게 해주는 Linux 커널의 핵심 기능입니다.

Production 환경에서 "애플리케이션이 갑자기 멈췄는데 원인을 모르겠어요" 같은 상황이 발생했을 때, ptrace 기반 도구들이 어떻게 작동하는지 이해하면 더 효과적인 디버깅이 가능해집니다.

## ptrace 개념과 동작 원리

### 기본 개념

ptrace(Process Trace)는 부모 프로세스가 자식 프로세스를 제어할 수 있게 해주는 시스템 콜입니다:

```c
#include <sys/ptrace.h>

long ptrace(enum __ptrace_request request, pid_t pid, void *addr, void *data);
```

### 커널 레벨에서의 동작

```text
ptrace Architecture:
┌─────────────────────────────────────────────────┐
│ Tracer Process (gdb, strace)                    │
│ ├─ ptrace() system call                         │
│ ├─ wait() for tracee events                     │
│ └─ Process traced data                          │
├─────────────────────────────────────────────────┤
│ Kernel Space                                    │
│ ├─ task_struct.ptrace flags                     │
│ ├─ Signal delivery interception                 │
│ ├─ System call entry/exit hooks                 │
│ └─ Memory access control                        │
├─────────────────────────────────────────────────┤
│ Tracee Process (target application)             │
│ ├─ SIGSTOP/SIGTRAP signals                      │
│ ├─ Execution paused at trace points             │
│ └─ Memory accessible to tracer                  │
└─────────────────────────────────────────────────┘
```

### task_struct에서의 ptrace 상태

커널에서 각 프로세스의 ptrace 상태는 `task_struct` 구조체에 저장됩니다:

```c
struct task_struct {
    unsigned int ptrace;        // ptrace 플래그들
    struct task_struct *parent; // 부모 프로세스 (tracer)
    struct task_struct *real_parent; // 실제 부모 프로세스

    // ptrace 관련 플래그들
    // PT_TRACED: 현재 추적 중
    // PT_PTRACED: ptrace에 의해 제어됨
    // PT_SYSCALL: 시스템 콜에서 중단
};

// ptrace 플래그 정의
#define PT_PTRACED      0x00000001
#define PT_DTRACE       0x00000002
#define PT_TRACESYSGOOD 0x00000004
#define PT_PTRACE_CAP   0x00000008
#define PT_OPT_FORK     0x00000010
#define PT_OPT_VFORK    0x00000020
#define PT_OPT_CLONE    0x00000040
#define PT_OPT_EXEC     0x00000080
#define PT_OPT_EXIT     0x00000200
```

## ptrace 요청 타입과 사용법

### 기본 추적 설정

#### PTRACE_TRACEME

자식 프로세스가 부모에게 추적 허용을 요청:

```c
#include <sys/ptrace.h>
#include <sys/wait.h>
#include <unistd.h>
#include <stdio.h>

int main() {
    pid_t child = fork();

    if (child == 0) {
        // 자식 프로세스: 추적 허용
        printf("Child: Allowing parent to trace me, ");

        if (ptrace(PTRACE_TRACEME, 0, NULL, NULL) == -1) {
            perror("ptrace TRACEME failed");
            return 1;
        }

        // 부모가 추적을 시작할 수 있도록 자신을 중단
        raise(SIGSTOP);

        // 실제 실행할 프로그램
        printf("Child: About to exec, ");
        execl("/bin/ls", "ls", "-l", NULL);

    } else if (child > 0) {
        // 부모 프로세스: tracer
        int status;
        printf("Parent: Waiting for child to stop, ");

        // 자식이 SIGSTOP으로 멈출 때까지 대기
        waitpid(child, &status, 0);

        if (WIFSTOPPED(status)) {
            printf("Parent: Child stopped with signal %d, ", WSTOPSIG(status));

            // 자식 실행 재개
            ptrace(PTRACE_CONT, child, NULL, NULL);
        }

        // 자식 프로세스 완료 대기
        waitpid(child, &status, 0);
        printf("Parent: Child exited with status %d, ", WEXITSTATUS(status));

    } else {
        perror("fork failed");
        return 1;
    }

    return 0;
}
```

#### PTRACE_ATTACH

이미 실행 중인 프로세스에 추적 연결:

```c
#include <sys/ptrace.h>
#include <sys/wait.h>
#include <signal.h>
#include <stdio.h>

int attach_to_process(pid_t target_pid) {
    printf("Attempting to attach to process %d, ", target_pid);

    // 대상 프로세스에 추적 연결
    if (ptrace(PTRACE_ATTACH, target_pid, NULL, NULL) == -1) {
        perror("ptrace ATTACH failed");
        return -1;
    }

    // 프로세스가 중단될 때까지 대기
    int status;
    if (waitpid(target_pid, &status, 0) == -1) {
        perror("waitpid failed");
        return -1;
    }

    if (WIFSTOPPED(status)) {
        printf("Successfully attached. Process stopped with signal %d, ",
               WSTOPSIG(status));
        return 0;
    }

    return -1;
}

void detach_from_process(pid_t target_pid) {
    printf("Detaching from process %d, ", target_pid);

    // 추적 연결 해제 및 프로세스 재개
    if (ptrace(PTRACE_DETACH, target_pid, NULL, NULL) == -1) {
        perror("ptrace DETACH failed");
    }
}
```

### 시스템 콜 추적

#### PTRACE_SYSCALL

시스템 콜 진입/종료 시점에서 프로세스 중단:

```c
#include <sys/ptrace.h>
#include <sys/wait.h>
#include <sys/user.h>
#include <sys/syscall.h>
#include <stdio.h>

void trace_syscalls(pid_t child) {
    int status;
    int syscall_enter = 1;  // 시스템 콜 진입/종료 추적

    // 초기 중단 상태에서 시작
    waitpid(child, &status, 0);

    while (1) {
        // 시스템 콜에서 중단되도록 재개
        if (ptrace(PTRACE_SYSCALL, child, NULL, NULL) == -1) {
            perror("ptrace SYSCALL failed");
            break;
        }

        // 다음 중단점까지 대기
        if (waitpid(child, &status, 0) == -1) {
            perror("waitpid failed");
            break;
        }

        // 프로세스가 종료되었는지 확인
        if (WIFEXITED(status)) {
            printf("Child exited with status %d, ", WEXITSTATUS(status));
            break;
        }

        if (WIFSTOPPED(status)) {
            // 시스템 콜 번호 읽기 (x86_64)
            struct user_regs_struct regs;
            if (ptrace(PTRACE_GETREGS, child, NULL, &regs) == 0) {
                if (syscall_enter) {
                    printf("System call entry: %lld (", regs.orig_rax);
                    printf("args: %lld, %lld, %lld), ",
                           regs.rdi, regs.rsi, regs.rdx);
                } else {
                    printf("System call exit: return value = %lld, ", regs.rax);
                }
                syscall_enter = !syscall_enter;
            }
        }
    }
}

// 사용 예시
int main() {
    pid_t child = fork();

    if (child == 0) {
        ptrace(PTRACE_TRACEME, 0, NULL, NULL);
        raise(SIGSTOP);

        // 간단한 시스템 콜들 실행
        printf("Hello from traced process, ");
        sleep(1);

    } else {
        printf("Starting syscall tracing for PID %d, ", child);
        trace_syscalls(child);
    }

    return 0;
}
```

### 메모리 읽기/쓰기

#### PTRACE_PEEKDATA / PTRACE_POKEDATA

대상 프로세스의 메모리 직접 접근:

```c
#include <sys/ptrace.h>
#include <sys/wait.h>
#include <stdio.h>
#include <string.h>

long read_memory_word(pid_t pid, void *addr) {
    long word = ptrace(PTRACE_PEEKDATA, pid, addr, NULL);
    if (word == -1) {
        perror("ptrace PEEKDATA failed");
    }
    return word;
}

int write_memory_word(pid_t pid, void *addr, long data) {
    if (ptrace(PTRACE_POKEDATA, pid, addr, data) == -1) {
        perror("ptrace POKEDATA failed");
        return -1;
    }
    return 0;
}

void read_memory_string(pid_t pid, void *addr, char *buffer, size_t len) {
    size_t i = 0;
    long word;
    char *word_ptr = (char *)&word;

    while (i < len - 1) {
        word = read_memory_word(pid, (char *)addr + i);
        if (word == -1) break;

        // long을 바이트 단위로 복사
        for (int j = 0; j < sizeof(long) && i < len - 1; j++, i++) {
            buffer[i] = word_ptr[j];
            if (buffer[i] == '\0') {
                return;  // 문자열 끝 발견
            }
        }
    }
    buffer[len - 1] = '\0';
}

// 메모리 패치 예제: 함수 return value 변조
int patch_return_value(pid_t pid, long new_value) {
    struct user_regs_struct regs;

    // 현재 레지스터 상태 읽기
    if (ptrace(PTRACE_GETREGS, pid, NULL, &regs) == -1) {
        perror("ptrace GETREGS failed");
        return -1;
    }

    printf("Original return value (RAX): 0x%llx, ", regs.rax);

    // RAX 레지스터 (리턴 값) 변경
    regs.rax = new_value;

    // 변경된 레지스터 상태 쓰기
    if (ptrace(PTRACE_SETREGS, pid, NULL, &regs) == -1) {
        perror("ptrace SETREGS failed");
        return -1;
    }

    printf("Modified return value to: 0x%lx, ", new_value);
    return 0;
}
```

### 고급 추적 옵션

#### PTRACE_SETOPTIONS

추적 동작 세부 제어:

```c
#include <sys/ptrace.h>
#include <linux/ptrace.h>

void setup_advanced_tracing(pid_t child) {
    long options = 0;

    // fork된 자식 프로세스도 자동으로 추적
    options |= PTRACE_O_TRACEFORK;
    options |= PTRACE_O_TRACEVFORK;
    options |= PTRACE_O_TRACECLONE;

    // exec 호출 시 중단
    options |= PTRACE_O_TRACEEXEC;

    // 프로세스 종료 시 중단
    options |= PTRACE_O_TRACEEXIT;

    // 시스템 콜을 더 쉽게 구분 (시스템 콜에서는 SIGTRAP | 0x80)
    options |= PTRACE_O_TRACESYSGOOD;

    if (ptrace(PTRACE_SETOPTIONS, child, NULL, options) == -1) {
        perror("ptrace SETOPTIONS failed");
    } else {
        printf("Advanced tracing options set successfully, ");
    }
}

void handle_ptrace_events(pid_t child, int status) {
    int event = (status >> 16) & 0xffff;

    switch (event) {
    case PTRACE_EVENT_FORK:
        printf("Target process forked, ");
        break;
    case PTRACE_EVENT_VFORK:
        printf("Target process vforked, ");
        break;
    case PTRACE_EVENT_CLONE:
        printf("Target process cloned, ");
        break;
    case PTRACE_EVENT_EXEC:
        printf("Target process execed, ");
        break;
    case PTRACE_EVENT_EXIT:
        printf("Target process is exiting, ");
        break;
    default:
        if (WSTOPSIG(status) == (SIGTRAP | 0x80)) {
            printf("System call trap (TRACESYSGOOD), ");
        } else {
            printf("Other stop signal: %d, ", WSTOPSIG(status));
        }
        break;
    }
}
```

## 보안 메커니즘과 제한사항

### Yama LSM (Linux Security Module)

ptrace 사용을 제어하는 주요 보안 메커니즘:

```bash
# Yama ptrace_scope 확인
cat /proc/sys/kernel/yama/ptrace_scope

```

```text
# 값의 의미:
# 0: 전통적인 ptrace 동작 (제한 없음)
# 1: 제한된 ptrace - 부모-자식 관계만 허용
# 2: 관리자만 ptrace 허용
# 3: ptrace 완전 비활성화
```

실제 Yama 제한 우회 방법:

```c
#include <sys/prctl.h>
#include <sys/ptrace.h>

int bypass_yama_restrictions() {
    // 현재 프로세스가 다른 프로세스에 의해 추적될 수 있도록 허용
    if (prctl(PR_SET_PTRACER, getppid(), 0, 0, 0) == -1) {
        perror("prctl PR_SET_PTRACER failed");
        return -1;
    }

    printf("Yama restriction bypassed for parent process, ");
    return 0;
}

// 또는 CAP_SYS_PTRACE capability 확인
int check_ptrace_capability() {
    if (geteuid() == 0) {
        printf("Running as root - ptrace should work, ");
        return 0;
    }

    // libcap을 사용한 capability 확인
    // cap_t caps = cap_get_proc();
    // cap_flag_value_t cap_val;
    // cap_get_flag(caps, CAP_SYS_PTRACE, CAP_EFFECTIVE, &cap_val);

    printf("Non-root user - check capabilities, ");
    return -1;
}
```

### Container 환경에서의 ptrace

Docker 컨테이너에서 ptrace 사용:

```yaml
# docker-compose.yml - ptrace 허용 설정
version: '3'
services:
  debug-container:
    image: ubuntu:20.04
    cap_add:
      - SYS_PTRACE  # ptrace capability 추가
    security_opt:
      - seccomp:unconfined  # seccomp 프로파일 비활성화
    pid: host  # 호스트의 PID namespace 사용 (선택사항)
```

Kubernetes에서 디버깅 Pod 생성:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: debug-pod
spec:
  containers:
  - name: debugger
    image: nicolaka/netshoot
    securityContext:
      capabilities:
        add:
        - SYS_PTRACE
      runAsUser: 0
    volumeMounts:
    - name: proc
      mountPath: /host/proc
      readOnly: true
  volumes:
  - name: proc
    hostPath:
      path: /proc
  hostPID: true  # 호스트 PID namespace 접근
```

## 실제 디버깅 도구들의 ptrace 활용

### gdb의 ptrace 사용

gdb가 브레이크포인트를 설정하는 방법:

```c
// gdb 브레이크포인트 구현 원리 (simplified)
int set_breakpoint(pid_t pid, void *addr) {
    // 원본 명령어 읽기
    long original_instruction = ptrace(PTRACE_PEEKTEXT, pid, addr, NULL);
    if (original_instruction == -1) {
        perror("Failed to read original instruction");
        return -1;
    }

    printf("Original instruction at %p: 0x%lx, ", addr, original_instruction);

    // INT3 명령어 (0xCC)로 교체
    long breakpoint_instruction = (original_instruction & ~0xFF) | 0xCC;

    if (ptrace(PTRACE_POKETEXT, pid, addr, breakpoint_instruction) == -1) {
        perror("Failed to set breakpoint");
        return -1;
    }

    printf("Breakpoint set at %p, ", addr);
    return 0;
}

void handle_breakpoint(pid_t pid, void *addr, long original_instruction) {
    struct user_regs_struct regs;

    // 현재 레지스터 상태 읽기
    ptrace(PTRACE_GETREGS, pid, NULL, &regs);

    printf("Breakpoint hit at %p, ", addr);
    printf("RIP: 0x%llx, RSP: 0x%llx, ", regs.rip, regs.rsp);

    // RIP를 브레이크포인트 주소로 되돌림 (INT3는 RIP를 증가시킴)
    regs.rip = (unsigned long long)addr;
    ptrace(PTRACE_SETREGS, pid, NULL, &regs);

    // 원본 명령어 복구
    ptrace(PTRACE_POKETEXT, pid, addr, original_instruction);

    // 한 스텝 실행 후 브레이크포인트 재설정
    ptrace(PTRACE_SINGLESTEP, pid, NULL, NULL);

    int status;
    waitpid(pid, &status, 0);

    // 브레이크포인트 재설정
    long bp_instruction = (original_instruction & ~0xFF) | 0xCC;
    ptrace(PTRACE_POKETEXT, pid, addr, bp_instruction);
}
```

### strace의 시스템 콜 이름 해석

```c
#include <sys/syscall.h>

// 시스템 콜 번호를 이름으로 변환 (x86_64)
const char *syscall_names[] = {
    [0] = "read",
    [1] = "write",
    [2] = "open",
    [3] = "close",
    [4] = "stat",
    [5] = "fstat",
    // ... 전체 시스템 콜 테이블
    [59] = "execve",
    [60] = "exit",
    [61] = "wait4",
    [62] = "kill",
    // ...
};

void print_syscall_info(pid_t pid) {
    struct user_regs_struct regs;

    if (ptrace(PTRACE_GETREGS, pid, NULL, &regs) == -1) {
        perror("ptrace GETREGS failed");
        return;
    }

    long syscall_num = regs.orig_rax;
    const char *syscall_name = "unknown";

    if (syscall_num >= 0 &&
        syscall_num < sizeof(syscall_names)/sizeof(syscall_names[0]) &&
        syscall_names[syscall_num]) {
        syscall_name = syscall_names[syscall_num];
    }

    printf("%s(", syscall_name);

    // 시스템 콜별 인자 출력 (간략화)
    switch (syscall_num) {
    case SYS_write:
        printf("fd=%lld, buf=0x%llx, count=%lld",
               regs.rdi, regs.rsi, regs.rdx);
        break;
    case SYS_open:
        printf("pathname=0x%llx, flags=%lld, mode=%lld",
               regs.rdi, regs.rsi, regs.rdx);
        break;
    default:
        printf("%lld, %lld, %lld", regs.rdi, regs.rsi, regs.rdx);
        break;
    }

    printf("), ");
}
```

### ltrace의 라이브러리 함수 추적

ltrace는 PLT(Procedure Linkage Table) 후킹을 사용:

```c
// PLT 엔트리 후킹 예제
int hook_plt_entry(pid_t pid, void *plt_addr, const char *func_name) {
    // PLT 엔트리의 원본 주소 읽기
    long original_addr = ptrace(PTRACE_PEEKTEXT, pid, plt_addr, NULL);

    printf("Hooking %s at PLT address %p (original: 0x%lx), ",
           func_name, plt_addr, original_addr);

    // 브레이크포인트 설정 (0xCC)
    long bp_instruction = (original_addr & ~0xFF) | 0xCC;
    ptrace(PTRACE_POKETEXT, pid, plt_addr, bp_instruction);

    return 0;
}

void handle_library_call(pid_t pid, const char *func_name) {
    struct user_regs_struct regs;
    ptrace(PTRACE_GETREGS, pid, NULL, &regs);

    printf("%s(", func_name);

    // 함수별 인자 해석
    if (strcmp(func_name, "malloc") == 0) {
        printf("size=%lld", regs.rdi);
    } else if (strcmp(func_name, "printf") == 0) {
        char format[256];
        read_memory_string(pid, (void *)regs.rdi, format, sizeof(format));
        printf("format=\"%s\"", format);
    }

    printf("), ");
}
```

## Production 환경에서의 ptrace 활용

### 실시간 프로세스 분석 도구

실제 운영 환경에서 사용할 수 있는 ptrace 기반 분석 도구:

```c
// production_tracer.c - Production용 경량 tracer
#include <sys/ptrace.h>
#include <sys/wait.h>
#include <sys/user.h>
#include <signal.h>
#include <time.h>
#include <stdio.h>

struct syscall_stats {
    long syscall_num;
    unsigned long count;
    double total_time;
    double max_time;
    char name[32];
};

// 글로벌 통계 배열
struct syscall_stats stats[400] = {0};  // 최대 400개 시스템 콜
volatile sig_atomic_t stop_tracing = 0;

void signal_handler(int sig) {
    stop_tracing = 1;
}

double get_time_diff(struct timespec *start, struct timespec *end) {
    return (end->tv_sec - start->tv_sec) +
           (end->tv_nsec - start->tv_nsec) / 1000000000.0;
}

void print_statistics() {
    printf(", === Production Syscall Statistics ===, ");
    printf("%-20s %10s %10s %15s %15s, ",
           "SYSCALL", "COUNT", "TOTAL(s)", "AVG(ms)", "MAX(ms)");
    printf("------------------------------------------------------------, ");

    for (int i = 0; i < 400; i++) {
        if (stats[i].count > 0) {
            double avg_ms = (stats[i].total_time / stats[i].count) * 1000;
            double max_ms = stats[i].max_time * 1000;

            printf("%-20s %10lu %10.6f %15.3f %15.3f, ",
                   stats[i].name[0] ? stats[i].name : "unknown",
                   stats[i].count,
                   stats[i].total_time,
                   avg_ms,
                   max_ms);
        }
    }
}

int trace_production_process(pid_t target_pid, int duration_sec) {
    printf("Attaching to process %d for %d seconds..., ",
           target_pid, duration_sec);

    // 신호 핸들러 설정
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    // 프로세스에 연결
    if (ptrace(PTRACE_ATTACH, target_pid, NULL, NULL) == -1) {
        perror("ptrace ATTACH failed");
        return -1;
    }

    int status;
    waitpid(target_pid, &status, 0);

    // 시스템 콜 추적 시작
    ptrace(PTRACE_SETOPTIONS, target_pid, NULL, PTRACE_O_TRACESYSGOOD);

    time_t start_time = time(NULL);
    struct timespec syscall_start, syscall_end;
    int in_syscall = 0;
    long current_syscall = -1;

    while (!stop_tracing && (time(NULL) - start_time) < duration_sec) {
        if (ptrace(PTRACE_SYSCALL, target_pid, NULL, NULL) == -1) {
            break;
        }

        if (waitpid(target_pid, &status, 0) == -1) {
            break;
        }

        if (WIFEXITED(status)) {
            printf("Target process exited, ");
            break;
        }

        if (WIFSTOPPED(status)) {
            struct user_regs_struct regs;
            ptrace(PTRACE_GETREGS, target_pid, NULL, &regs);

            if (!in_syscall) {
                // 시스템 콜 진입
                current_syscall = regs.orig_rax;
                clock_gettime(CLOCK_MONOTONIC, &syscall_start);
                in_syscall = 1;
            } else {
                // 시스템 콜 종료
                clock_gettime(CLOCK_MONOTONIC, &syscall_end);

                if (current_syscall >= 0 && current_syscall < 400) {
                    double duration = get_time_diff(&syscall_start, &syscall_end);

                    stats[current_syscall].syscall_num = current_syscall;
                    stats[current_syscall].count++;
                    stats[current_syscall].total_time += duration;

                    if (duration > stats[current_syscall].max_time) {
                        stats[current_syscall].max_time = duration;
                    }

                    // 시스템 콜 이름 저장 (간단한 매핑)
                    if (!stats[current_syscall].name[0]) {
                        snprintf(stats[current_syscall].name,
                                sizeof(stats[current_syscall].name),
                                "syscall_%ld", current_syscall);
                    }
                }

                in_syscall = 0;
            }
        }
    }

    // 연결 해제
    ptrace(PTRACE_DETACH, target_pid, NULL, NULL);

    print_statistics();
    return 0;
}

int main(int argc, char *argv[]) {
    if (argc != 3) {
        printf("Usage: %s <pid> <duration_seconds>, ", argv[0]);
        return 1;
    }

    pid_t target_pid = atoi(argv[1]);
    int duration = atoi(argv[2]);

    return trace_production_process(target_pid, duration);
}
```

### 성능 최적화를 위한 샘플링

```c
// 샘플링 기반 ptrace 모니터링
int sample_based_tracing(pid_t pid, double sample_rate) {
    int sample_counter = 0;
    int should_trace = 1;

    // 샘플링 비율 계산 (예: 0.1 = 10%만 추적)
    int skip_count = (int)(1.0 / sample_rate) - 1;

    while (1) {
        if (ptrace(PTRACE_SYSCALL, pid, NULL, NULL) == -1) break;

        int status;
        if (waitpid(pid, &status, 0) == -1) break;

        if (WIFEXITED(status)) break;

        if (should_trace) {
            // 이번 시스템 콜은 추적
            struct user_regs_struct regs;
            ptrace(PTRACE_GETREGS, pid, NULL, &regs);

            printf("Sampled syscall: %lld, ", regs.orig_rax);

            should_trace = 0;
            sample_counter = 0;
        } else {
            // 샘플링으로 건너뛰기
            sample_counter++;
            if (sample_counter >= skip_count) {
                should_trace = 1;
            }
        }
    }

    return 0;
}
```

## 고급 ptrace 기법

### 코드 인젝션

런타임에 대상 프로세스에 코드를 주입하는 기법:

```c
// 코드 인젝션 예제: mmap 시스템 콜 호출
int inject_mmap_call(pid_t pid) {
    struct user_regs_struct original_regs, regs;

    // 원본 레지스터 상태 백업
    if (ptrace(PTRACE_GETREGS, pid, NULL, &original_regs) == -1) {
        perror("ptrace GETREGS failed");
        return -1;
    }

    regs = original_regs;

    // mmap 시스템 콜 설정 (syscall number 9 on x86_64)
    regs.rax = 9;          // sys_mmap
    regs.rdi = 0;          // addr (NULL = let kernel choose)
    regs.rsi = 4096;       // length (4KB)
    regs.rdx = 3;          // prot (PROT_READ|PROT_WRITE)
    regs.r10 = 34;         // flags (MAP_PRIVATE|MAP_ANONYMOUS)
    regs.r8 = -1;          // fd
    regs.r9 = 0;           // offset

    // 레지스터 설정
    if (ptrace(PTRACE_SETREGS, pid, NULL, &regs) == -1) {
        perror("ptrace SETREGS failed");
        return -1;
    }

    // syscall 명령어 주입을 위한 원본 코드 백업
    void *rip = (void *)original_regs.rip;
    long original_instruction = ptrace(PTRACE_PEEKTEXT, pid, rip, NULL);

    // syscall 명령어 (0x050f) 주입
    long syscall_instruction = 0x050f;
    if (ptrace(PTRACE_POKETEXT, pid, rip, syscall_instruction) == -1) {
        perror("ptrace POKETEXT failed");
        return -1;
    }

    // 시스템 콜 실행
    if (ptrace(PTRACE_SINGLESTEP, pid, NULL, NULL) == -1) {
        perror("ptrace SINGLESTEP failed");
        return -1;
    }

    int status;
    waitpid(pid, &status, 0);

    // 결과 확인
    struct user_regs_struct result_regs;
    ptrace(PTRACE_GETREGS, pid, NULL, &result_regs);

    printf("mmap() returned: 0x%llx, ", result_regs.rax);

    // 원본 명령어 복구
    ptrace(PTRACE_POKETEXT, pid, rip, original_instruction);

    // 원본 레지스터 상태 복구
    ptrace(PTRACE_SETREGS, pid, NULL, &original_regs);

    return 0;
}
```

### 함수 후킹 (Runtime Patching)

```c
// 라이브러리 함수 후킹 예제
int hook_malloc_calls(pid_t pid) {
    // malloc 함수의 PLT 주소 찾기 (실제로는 /proc/pid/maps 파싱 필요)
    void *malloc_plt = find_plt_address(pid, "malloc");
    if (!malloc_plt) {
        printf("malloc PLT not found, ");
        return -1;
    }

    // 원본 명령어 백업
    long original_instruction = ptrace(PTRACE_PEEKTEXT, pid, malloc_plt, NULL);

    // 후킹 함수로 점프하는 코드 작성
    // 실제로는 더 복잡한 trampoline 코드가 필요

    printf("malloc() hook installed at %p, ", malloc_plt);

    // 후킹된 호출 감지 및 로깅
    while (1) {
        if (ptrace(PTRACE_CONT, pid, NULL, NULL) == -1) break;

        int status;
        waitpid(pid, &status, 0);

        if (WIFSTOPPED(status) && WSTOPSIG(status) == SIGTRAP) {
            struct user_regs_struct regs;
            ptrace(PTRACE_GETREGS, pid, NULL, &regs);

            if ((void *)regs.rip == malloc_plt) {
                printf("malloc(%lld) called, ", regs.rdi);

                // 원본 함수 실행을 위한 복구 및 재실행
                ptrace(PTRACE_POKETEXT, pid, malloc_plt, original_instruction);
                regs.rip = (unsigned long long)malloc_plt;
                ptrace(PTRACE_SETREGS, pid, NULL, &regs);
                ptrace(PTRACE_SINGLESTEP, pid, NULL, NULL);
                waitpid(pid, &status, 0);

                // 후킹 코드 재설치
                long hook_instruction = (original_instruction & ~0xFF) | 0xCC;
                ptrace(PTRACE_POKETEXT, pid, malloc_plt, hook_instruction);
            }
        }
    }

    return 0;
}
```

## 성능 고려사항과 최적화

### ptrace 오버헤드 측정

```c
// ptrace 오버헤드 벤치마킹
#include <time.h>
#include <sys/times.h>

void benchmark_ptrace_overhead(pid_t pid) {
    struct timespec start, end;
    int iterations = 10000;

    printf("Benchmarking ptrace overhead..., ");

    // PTRACE_PEEKDATA 성능 테스트
    clock_gettime(CLOCK_MONOTONIC, &start);

    for (int i = 0; i < iterations; i++) {
        ptrace(PTRACE_PEEKDATA, pid, (void *)0x400000, NULL);
    }

    clock_gettime(CLOCK_MONOTONIC, &end);

    double peek_time = (end.tv_sec - start.tv_sec) +
                       (end.tv_nsec - start.tv_nsec) / 1000000000.0;

    printf("PEEKDATA: %d calls in %.6f seconds (%.2f µs/call), ",
           iterations, peek_time, (peek_time * 1000000) / iterations);

    // PTRACE_GETREGS 성능 테스트
    clock_gettime(CLOCK_MONOTONIC, &start);

    for (int i = 0; i < iterations; i++) {
        struct user_regs_struct regs;
        ptrace(PTRACE_GETREGS, pid, NULL, &regs);
    }

    clock_gettime(CLOCK_MONOTONIC, &end);

    double getregs_time = (end.tv_sec - start.tv_sec) +
                          (end.tv_nsec - start.tv_nsec) / 1000000000.0;

    printf("GETREGS: %d calls in %.6f seconds (%.2f µs/call), ",
           iterations, getregs_time, (getregs_time * 1000000) / iterations);
}
```

### 최적화된 시스템 콜 추적

```c
// 효율적인 시스템 콜 필터링
int optimized_syscall_tracing(pid_t pid) {
    // 관심 있는 시스템 콜만 정의
    int target_syscalls[] = {
        SYS_read, SYS_write, SYS_open, SYS_close,
        SYS_mmap, SYS_munmap, SYS_brk
    };
    int num_targets = sizeof(target_syscalls) / sizeof(target_syscalls[0]);

    while (1) {
        if (ptrace(PTRACE_SYSCALL, pid, NULL, NULL) == -1) break;

        int status;
        waitpid(pid, &status, 0);

        if (WIFEXITED(status)) break;

        struct user_regs_struct regs;
        ptrace(PTRACE_GETREGS, pid, NULL, &regs);

        // 관심 있는 시스템 콜인지 빠른 체크
        int is_target = 0;
        for (int i = 0; i < num_targets; i++) {
            if (regs.orig_rax == target_syscalls[i]) {
                is_target = 1;
                break;
            }
        }

        if (is_target) {
            // 상세 분석만 관심 있는 시스템 콜에 대해서만 수행
            analyze_syscall_details(pid, &regs);
        }
        // 나머지는 빠르게 넘어감
    }

    return 0;
}
```

## 실제 Production 사례

### 메모리 누수 추적

프로덕션 환경에서 메모리가 지속적으로 증가하는 Java 애플리케이션 분석:

```c
// 메모리 할당 추적기
struct memory_allocation {
    void *addr;
    size_t size;
    time_t timestamp;
    int active;
};

#define MAX_ALLOCATIONS 100000
struct memory_allocation allocations[MAX_ALLOCATIONS];
int allocation_count = 0;

void track_memory_allocations(pid_t pid) {
    printf("Starting memory allocation tracking for PID %d, ", pid);

    while (1) {
        if (ptrace(PTRACE_SYSCALL, pid, NULL, NULL) == -1) break;

        int status;
        waitpid(pid, &status, 0);
        if (WIFEXITED(status)) break;

        struct user_regs_struct regs;
        ptrace(PTRACE_GETREGS, pid, NULL, &regs);

        // mmap 시스템 콜 감지
        if (regs.orig_rax == SYS_mmap) {
            // 시스템 콜 종료 시점까지 대기
            ptrace(PTRACE_SYSCALL, pid, NULL, NULL);
            waitpid(pid, &status, 0);

            ptrace(PTRACE_GETREGS, pid, NULL, &regs);

            void *allocated_addr = (void *)regs.rax;
            size_t size = regs.rsi;  // mmap의 두 번째 인자

            if (allocated_addr != MAP_FAILED && allocation_count < MAX_ALLOCATIONS) {
                allocations[allocation_count].addr = allocated_addr;
                allocations[allocation_count].size = size;
                allocations[allocation_count].timestamp = time(NULL);
                allocations[allocation_count].active = 1;
                allocation_count++;

                printf("mmap: allocated %zu bytes at %p, ", size, allocated_addr);
            }
        }
        // munmap 시스템 콜 감지
        else if (regs.orig_rax == SYS_munmap) {
            void *addr = (void *)regs.rdi;

            // 해당 할당을 비활성으로 표시
            for (int i = 0; i < allocation_count; i++) {
                if (allocations[i].active && allocations[i].addr == addr) {
                    allocations[i].active = 0;
                    printf("munmap: freed memory at %p, ", addr);
                    break;
                }
            }
        }
    }

    // 최종 리포트
    size_t total_leaked = 0;
    int leaked_blocks = 0;

    for (int i = 0; i < allocation_count; i++) {
        if (allocations[i].active) {
            total_leaked += allocations[i].size;
            leaked_blocks++;
            printf("Leaked: %zu bytes at %p (allocated at %ld), ",
                   allocations[i].size, allocations[i].addr,
                   allocations[i].timestamp);
        }
    }

    printf(", Memory leak summary:, ");
    printf("Total leaked: %zu bytes in %d blocks, ", total_leaked, leaked_blocks);
}
```

### 네트워크 연결 문제 진단

```c
// 네트워크 I/O 패턴 분석
void analyze_network_performance(pid_t pid) {
    struct {
        int fd;
        struct sockaddr_in addr;
        time_t connect_time;
        size_t bytes_sent;
        size_t bytes_received;
        int active;
    } connections[1000] = {0};

    int connection_count = 0;

    while (1) {
        if (ptrace(PTRACE_SYSCALL, pid, NULL, NULL) == -1) break;

        int status;
        waitpid(pid, &status, 0);
        if (WIFEXITED(status)) break;

        struct user_regs_struct regs;
        ptrace(PTRACE_GETREGS, pid, NULL, &regs);

        switch (regs.orig_rax) {
        case SYS_connect: {
            // connect 결과 확인을 위해 종료 시점까지 대기
            ptrace(PTRACE_SYSCALL, pid, NULL, NULL);
            waitpid(pid, &status, 0);
            ptrace(PTRACE_GETREGS, pid, NULL, &regs);

            if (regs.rax == 0 && connection_count < 1000) {
                // 연결 성공
                int fd = regs.rdi;
                connections[connection_count].fd = fd;
                connections[connection_count].connect_time = time(NULL);
                connections[connection_count].active = 1;

                printf("New connection established: fd=%d, ", fd);
                connection_count++;
            } else if (regs.rax != 0) {
                printf("Connection failed: errno=%lld, ", -regs.rax);
            }
            break;
        }

        case SYS_send:
        case SYS_sendto:
        case SYS_write: {
            int fd = regs.rdi;
            ssize_t bytes = regs.rax;  // 종료 시점에서 읽어야 함

            // 해당 연결 찾아서 통계 업데이트
            for (int i = 0; i < connection_count; i++) {
                if (connections[i].active && connections[i].fd == fd) {
                    connections[i].bytes_sent += bytes > 0 ? bytes : 0;
                    break;
                }
            }
            break;
        }

        case SYS_recv:
        case SYS_recvfrom:
        case SYS_read: {
            int fd = regs.rdi;
            ssize_t bytes = regs.rax;

            for (int i = 0; i < connection_count; i++) {
                if (connections[i].active && connections[i].fd == fd) {
                    connections[i].bytes_received += bytes > 0 ? bytes : 0;
                    break;
                }
            }
            break;
        }

        case SYS_close: {
            int fd = regs.rdi;

            for (int i = 0; i < connection_count; i++) {
                if (connections[i].active && connections[i].fd == fd) {
                    connections[i].active = 0;
                    time_t duration = time(NULL) - connections[i].connect_time;

                    printf("Connection closed: fd=%d, duration=%lds, "
                           "sent=%zu, received=%zu, ",
                           fd, duration,
                           connections[i].bytes_sent,
                           connections[i].bytes_received);
                    break;
                }
            }
            break;
        }
        }
    }
}
```

## 문제 해결 가이드

### 일반적인 ptrace 오류

#### EPERM (Operation not permitted)

```bash
# 원인 확인
cat /proc/sys/kernel/yama/ptrace_scope

# 해결 방법들:
# 1. 임시로 제한 완화 (root 권한 필요)
echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope

# 2. CAP_SYS_PTRACE capability 부여
sudo setcap cap_sys_ptrace+ep ./my_tracer

# 3. PR_SET_PTRACER 사용 (대상 프로세스에서)
prctl(PR_SET_PTRACER, tracer_pid, 0, 0, 0);
```

#### EIO (Input/output error)

```c
// 대상 프로세스가 이미 다른 tracer에 의해 추적 중
int check_if_already_traced(pid_t pid) {
    char status_path[256];
    snprintf(status_path, sizeof(status_path), "/proc/%d/status", pid);

    FILE *f = fopen(status_path, "r");
    if (!f) return -1;

    char line[256];
    while (fgets(line, sizeof(line), f)) {
        if (strncmp(line, "TracerPid:", 10) == 0) {
            int tracer_pid = atoi(line + 10);
            fclose(f);

            if (tracer_pid != 0) {
                printf("Process %d is already traced by PID %d, ", pid, tracer_pid);
                return tracer_pid;
            }
            return 0;
        }
    }

    fclose(f);
    return 0;
}
```

#### ESRCH (No such process)

```c
// 프로세스 존재 여부 확인
int is_process_alive(pid_t pid) {
    if (kill(pid, 0) == 0) {
        return 1;  // 프로세스 존재
    } else if (errno == ESRCH) {
        return 0;  // 프로세스 없음
    } else {
        return -1; // 권한 없음 등 다른 오류
    }
}
```

### Container 환경 문제 해결

```yaml
# Docker에서 ptrace 사용 시 필요한 설정
version: '3'
services:
  app:
    image: myapp:latest
    cap_add:
      - SYS_PTRACE
    security_opt:
      - seccomp:unconfined
    # 또는 특정 seccomp 프로파일 사용
    # security_opt:
    #   - seccomp:/path/to/custom-seccomp.json
```

### 성능 문제 해결

```c
// ptrace 호출 최적화
int optimized_memory_read(pid_t pid, void *addr, void *buffer, size_t len) {
    // 한 번에 여러 워드 읽기
    long *long_buffer = (long *)buffer;
    size_t words = len / sizeof(long);
    size_t remaining = len % sizeof(long);

    for (size_t i = 0; i < words; i++) {
        errno = 0;
        long word = ptrace(PTRACE_PEEKDATA, pid,
                          (char *)addr + i * sizeof(long), NULL);
        if (errno != 0) {
            perror("ptrace PEEKDATA failed");
            return -1;
        }
        long_buffer[i] = word;
    }

    // 나머지 바이트 처리
    if (remaining > 0) {
        errno = 0;
        long word = ptrace(PTRACE_PEEKDATA, pid,
                          (char *)addr + words * sizeof(long), NULL);
        if (errno == 0) {
            memcpy((char *)buffer + words * sizeof(long), &word, remaining);
        }
    }

    return 0;
}
```

## 정리

ptrace는 Linux 디버깅 생태계의 핵심이며, 올바른 이해와 활용을 통해 강력한 분석 도구를 만들 수 있습니다:

### 핵심 개념

- **Process Control**: 다른 프로세스의 실행 제어
- **Memory Access**: 대상 프로세스 메모리 직접 접근
- **System Call Interception**: 시스템 콜 가로채기 및 수정
- **Signal Handling**: 시그널 기반 통신

### Production 활용 시 주의사항

- **성능 오버헤드**: 10-100배 느려질 수 있음
- **보안 제한**: Yama LSM, capabilities, seccomp 고려
- **권한 관리**: 적절한 권한과 보안 정책 필요
- **Container 호환성**: 특별한 권한과 설정 필요

### 효과적인 사용 전략

1. **목적별 최적화**: 필요한 기능만 추적
2. **샘플링 활용**: 전체 추적보다는 선택적 추적
3. **보안 고려**: 민감한 정보 노출 방지
4. **성능 모니터링**: 추적으로 인한 성능 영향 측정

### 관련 도구 연결

- **strace**: ptrace 기반 시스템 콜 추적
- **gdb**: 브레이크포인트와 디버깅
- **ltrace**: 라이브러리 함수 호출 추적
- **perf**: 성능 분석과 프로파일링

ptrace는 강력하지만 복잡한 도구입니다. Production 환경에서 사용할 때는 항상 성능 영향과 보안을 고려하여 신중하게 접근해야 합니다.

## 관련 문서

- [strace로 문제 분석하기](strace-debugging.md)
- [GDB 고급 디버깅 기법](gdb-advanced-debugging.md)
- [Linux Process Memory Structure](../linux/process-memory-structure.md)
- [Container Security](../security/container-security.md)
