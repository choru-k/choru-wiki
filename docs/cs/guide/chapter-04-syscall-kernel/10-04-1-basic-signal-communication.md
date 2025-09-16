---
tags:
  - IPC
  - POSIX
  - balanced
  - fundamentals
  - interrupt_handling
  - medium-read
  - process_communication
  - signal
  - 시스템프로그래밍
difficulty: FUNDAMENTALS
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 4.4d1: 기본 신호 통신

## 📋 학습 목표

이 문서를 통해 다음을 배울 수 있습니다:

1. **신호의 기본 개념과 동작 원리**
2. **간단한 신호 송수신 구현**
3. **신호 마스킹과 고급 처리 기법**
4. **sigaction을 이용한 신호 정보 활용**

## 1. 신호(Signal)의 기본 사용법

### 1.1 간단한 신호 통신

신호는 가장 간단한 형태의 프로세스 간 통신 방법입니다.

```c
// signal_communication.c - 신호를 통한 통신
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>
#include <sys/wait.h>

static int signal_count = 0;

// 신호 핸들러
void signal_handler(int signum) {
    signal_count++;
    printf("신호 %d 수신 (총 %d번)\n", signum, signal_count);
    
    if (signum == SIGUSR1) {
        printf("  -> 사용자 정의 신호 1\n");
    } else if (signum == SIGUSR2) {
        printf("  -> 사용자 정의 신호 2\n");
    }
}

// 신호 송신자
void signal_sender(pid_t target_pid) {
    printf("신호 송신자: PID %d로 신호 전송\n", target_pid);
    
    for (int i = 0; i < 5; i++) {
        kill(target_pid, SIGUSR1);
        printf("SIGUSR1 전송 #%d\n", i + 1);
        sleep(1);
    }
    
    for (int i = 0; i < 3; i++) {
        kill(target_pid, SIGUSR2);
        printf("SIGUSR2 전송 #%d\n", i + 1);
        sleep(1);
    }
    
    // 종료 신호
    kill(target_pid, SIGTERM);
    printf("SIGTERM 전송 (종료 신호)\n");
}

// 신호 수신자
void signal_receiver() {
    printf("신호 수신자: PID %d에서 신호 대기\n", getpid());
    
    // 신호 핸들러 등록
    signal(SIGUSR1, signal_handler);
    signal(SIGUSR2, signal_handler);
    
    // SIGTERM으로 종료할 때까지 대기
    while (1) {
        pause();  // 신호가 올 때까지 대기
        
        if (signal_count >= 8) {  // SIGUSR1(5) + SIGUSR2(3)
            printf("모든 신호 수신 완료, 종료 대기...\n");
        }
    }
}

int main() {
    pid_t pid = fork();
    
    if (pid == 0) {
        // 자식 프로세스: 수신자
        signal_receiver();
    } else if (pid > 0) {
        // 부모 프로세스: 송신자
        sleep(1);  // 자식이 준비할 시간
        signal_sender(pid);
        
        // 자식 프로세스 종료 대기
        wait(NULL);
        printf("통신 완료\n");
    } else {
        perror("fork");
        return 1;
    }
    
    return 0;
}
```

### 1.2 신호 마스킹과 고급 처리

고급 신호 처리에서는 `sigaction`과 신호 마스킹을 활용합니다.

```c
// advanced_signal.c - 신호 마스킹과 sigaction 사용
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>
#include <string.h>

static volatile sig_atomic_t keep_running = 1;
static volatile sig_atomic_t usr1_count = 0;
static volatile sig_atomic_t usr2_count = 0;

// 고급 신호 핸들러 (siginfo_t 사용)
void advanced_signal_handler(int sig, siginfo_t *info, void *context) {
    switch (sig) {
        case SIGUSR1:
            usr1_count++;
            printf("SIGUSR1 from PID %d (count: %d)\n", info->si_pid, usr1_count);
            break;
            
        case SIGUSR2:
            usr2_count++;
            printf("SIGUSR2 from PID %d (count: %d)\n", info->si_pid, usr2_count);
            break;
            
        case SIGINT:
            printf("\nSIGINT 수신 - 종료 신호\n");
            keep_running = 0;
            break;
            
        case SIGTERM:
            printf("SIGTERM 수신 - 정상 종료\n");
            keep_running = 0;
            break;
    }
}

void setup_signal_handling() {
    struct sigaction sa;
    sigset_t block_mask;
    
    // 신호 핸들러 구조체 설정
    memset(&sa, 0, sizeof(sa));
    sa.sa_sigaction = advanced_signal_handler;
    sa.sa_flags = SA_SIGINFO | SA_RESTART;  // siginfo_t 사용 + 시스템 호출 재시작
    
    // 신호 처리 중 마스킹할 신호들 설정
    sigemptyset(&block_mask);
    sigaddset(&block_mask, SIGUSR1);
    sigaddset(&block_mask, SIGUSR2);
    sa.sa_mask = block_mask;
    
    // 신호 핸들러 등록
    if (sigaction(SIGUSR1, &sa, NULL) == -1) {
        perror("sigaction SIGUSR1");
        exit(1);
    }
    
    if (sigaction(SIGUSR2, &sa, NULL) == -1) {
        perror("sigaction SIGUSR2");
        exit(1);
    }
    
    if (sigaction(SIGINT, &sa, NULL) == -1) {
        perror("sigaction SIGINT");
        exit(1);
    }
    
    if (sigaction(SIGTERM, &sa, NULL) == -1) {
        perror("sigaction SIGTERM");
        exit(1);
    }
}

void signal_mask_demo() {
    sigset_t old_mask, wait_mask;
    
    printf("신호 마스킹 데모 시작\n");
    
    // 특정 신호들을 일시적으로 차단
    sigset_t block_set;
    sigemptyset(&block_set);
    sigaddset(&block_set, SIGUSR1);
    sigaddset(&block_set, SIGUSR2);
    
    printf("신호 차단 시작...\n");
    sigprocmask(SIG_BLOCK, &block_set, &old_mask);
    
    // 이 구간에서는 SIGUSR1, SIGUSR2가 대기 상태에 있음
    printf("신호가 차단된 상태에서 3초 작업...\n");
    sleep(3);
    
    // 차단된 신호들을 기다리기
    printf("차단된 신호들을 기다리는 중...\n");
    sigemptyset(&wait_mask);
    sigaddset(&wait_mask, SIGUSR1);
    sigaddset(&wait_mask, SIGUSR2);
    sigaddset(&wait_mask, SIGINT);
    
    int sig;
    while (keep_running && (sigwait(&wait_mask, &sig) == 0)) {
        printf("신호 %d를 sigwait으로 수신\n", sig);
        
        if (sig == SIGINT) {
            break;
        }
        
        if (usr1_count + usr2_count >= 5) {
            break;
        }
    }
    
    // 원래 신호 마스크 복원
    sigprocmask(SIG_SETMASK, &old_mask, NULL);
    printf("신호 마스킹 데모 완료\n");
}

int main() {
    printf("고급 신호 처리 데모\n");
    printf("=====================\n");
    printf("PID: %d\n", getpid());
    printf("SIGUSR1, SIGUSR2를 보내주세요: kill -USR1 %d\n", getpid());
    printf("Ctrl+C로 종료\n\n");
    
    setup_signal_handling();
    signal_mask_demo();
    
    printf("\n=== 최종 결과 ===\n");
    printf("SIGUSR1 수신 횟수: %d\n", usr1_count);
    printf("SIGUSR2 수신 횟수: %d\n", usr2_count);
    
    return 0;
}
```

## 2. 신호 통신의 특징

### 2.1 신호의 장단점

**장점:**

- 매우 가벼운 IPC 메커니즘
- 간단한 알림에 최적화
- 표준 POSIX 시그널 사용

**단점:**

- 데이터 전달 불가 (단순 알림만)
- 신호 손실 가능성
- 중첩 신호 처리의 복잡성

### 2.2 사용 권장 사항

**적합한 경우:**

- 단순한 이벤트 알림
- 프로세스 간 상태 변경 통지
- 시스템 종료 신호 처리

**부적합한 경우:**

- 대용량 데이터 전송
- 순서가 중요한 메시지
- 실시간 성능이 중요한 상황

## 3. 실습 가이드

### 컴파일 및 실행

```bash
# 기본 신호 통신 컴파일
gcc -o signal_communication signal_communication.c

# 실행
./signal_communication

# 고급 신호 처리 컴파일  
gcc -o advanced_signal advanced_signal.c

# 실행 (다른 터미널에서 신호 전송)
./advanced_signal &
kill -USR1 $!
kill -USR2 $!
```

## 다음 단계

신호 통신의 기본을 익혔다면, 다음 문서에서 더 효율적인 eventfd 통신을 학습하세요:

- [Chapter 10-4d2: eventfd 기본 통신](04d2-eventfd-communication.md)
- [Chapter 10-4d3: 고급 이벤트 메커니즘](04-20-3-advanced-event-mechanisms.md)
- [Chapter 10-4d4: 통합 이벤트 시스템](04d4-integrated-event-system.md)

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: FUNDAMENTALS
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 FUNDAMENTALS 레벨 전체 보기](../learning-paths/fundamentals/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-10-syscall-kernel)

- [Chapter 10-1: 시스템 호출 기초와 인터페이스](./04-01-system-call-basics.md)
- [Chapter 10-2: 리눅스 커널 아키텍처 개요](./04-02-kernel-architecture.md)
- [Chapter 10-2A: 커널 설계 철학과 아키텍처 기초](./04-10-kernel-design-philosophy.md)
- [Chapter 10-2A: 커널 설계 철학과 전체 구조](./04-11-kernel-design-structure.md)
- [Chapter 10-2B: 핵심 서브시스템 탐구](./04-12-core-subsystems.md)

### 🏷️ 관련 키워드

`signal`, `IPC`, `POSIX`, `process_communication`, `interrupt_handling`

### ⏭️ 다음 단계 가이드

- 기초 개념을 충분히 이해한 후 INTERMEDIATE 레벨로 진행하세요
- 실습 위주의 학습을 권장합니다
