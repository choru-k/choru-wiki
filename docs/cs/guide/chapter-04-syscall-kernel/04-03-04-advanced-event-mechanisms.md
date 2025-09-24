---
tags:
  - advanced
  - deep-study
  - epoll
  - event-driven
  - hands-on
  - real-time
  - signalfd
  - timerfd
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "6-10시간"
main_topic: "시스템 프로그래밍"
priority_score: 5
---

# 4.3.4: 고급 이벤트 메커니즘

## 📋 학습 목표

이 문서를 통해 다음을 배울 수 있습니다:

1.**timerfd를 이용한 정밀한 타이머 이벤트 처리**
2.**signalfd로 신호를 파일 디스크립터처럼 다루기**
3.**epoll과의 통합을 통한 통합 이벤트 처리**
4.**고성능 실시간 시스템 구현**

## 1. timerfd를 이용한 정밀 타이밍

### 1.1 기본 timerfd 사용

timerfd는 타이머 이벤트를 파일 디스크립터로 처리할 수 있게 해줍니다.

```c
// timerfd_demo.c - 고성능 타이머 이벤트
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/timerfd.h>
#include <sys/epoll.h>
#include <stdint.h>
#include <time.h>

void run_timer_demo() {
    int timer_fd, epoll_fd;
    struct epoll_event event, events[10];
    struct itimerspec timer_spec;
    
    // timerfd 생성
    timer_fd = timerfd_create(CLOCK_MONOTONIC, TFD_CLOEXEC);
    if (timer_fd == -1) {
        perror("timerfd_create");
        return;
    }
    
    // 타이머 설정: 초기 1초 후, 이후 500ms마다 반복
    timer_spec.it_value.tv_sec = 1;
    timer_spec.it_value.tv_nsec = 0;
    timer_spec.it_interval.tv_sec = 0;
    timer_spec.it_interval.tv_nsec = 500000000;  // 500ms
    
    if (timerfd_settime(timer_fd, 0, &timer_spec, NULL) == -1) {
        perror("timerfd_settime");
        close(timer_fd);
        return;
    }
    
    // epoll로 비동기 이벤트 처리
    epoll_fd = epoll_create1(0);
    if (epoll_fd == -1) {
        perror("epoll_create1");
        close(timer_fd);
        return;
    }
    
    event.events = EPOLLIN;
    event.data.fd = timer_fd;
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, timer_fd, &event);
    
    printf("timerfd 데모 시작 (10초 동안 실행)\n");
    printf("초기 1초 대기 후 500ms마다 타이머 이벤트 발생\n");
    
    time_t start_time = time(NULL);
    int timer_count = 0;
    
    while (time(NULL) - start_time < 10) {
        int nfds = epoll_wait(epoll_fd, events, 10, 1000);
        
        for (int i = 0; i < nfds; i++) {
            if (events[i].data.fd == timer_fd) {
                uint64_t expirations;
                ssize_t ret = read(timer_fd, &expirations, sizeof(expirations));
                
                if (ret == sizeof(expirations)) {
                    timer_count++;
                    struct timespec current_time;
                    clock_gettime(CLOCK_MONOTONIC, &current_time);
                    
                    printf("타이머 #%d: %lu번 만료 (시간: %ld.%03ld)\n", 
                           timer_count, expirations,
                           current_time.tv_sec, current_time.tv_nsec / 1000000);
                }
            }
        }
    }
    
    close(epoll_fd);
    close(timer_fd);
    printf("timerfd 데모 완료 (총 %d번 타이머 이벤트)\n", timer_count);
}

int main() {
    run_timer_demo();
    return 0;
}
```

### 1.2 고급 timerfd 활용

```c
// advanced_timerfd.c - 다중 타이머 관리
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/timerfd.h>
#include <sys/epoll.h>
#include <stdint.h>
#include <time.h>
#include <string.h>

#define MAX_TIMERS 5

struct timer_info {
    int fd;
    const char *name;
    int count;
};

void setup_timer(struct timer_info *timer, const char *name, 
                time_t initial_sec, long initial_nsec,
                time_t interval_sec, long interval_nsec) {
    
    timer->fd = timerfd_create(CLOCK_MONOTONIC, TFD_CLOEXEC);
    if (timer->fd == -1) {
        perror("timerfd_create");
        return;
    }
    
    timer->name = name;
    timer->count = 0;
    
    struct itimerspec spec = {
        .it_value = { initial_sec, initial_nsec },
        .it_interval = { interval_sec, interval_nsec }
    };
    
    timerfd_settime(timer->fd, 0, &spec, NULL);
}

void run_multi_timer_demo() {
    struct timer_info timers[MAX_TIMERS];
    int epoll_fd;
    struct epoll_event event, events[MAX_TIMERS];
    
    // 다양한 타이머 설정
    setup_timer(&timers[0], "빠른타이머", 1, 0, 0, 100000000);    // 100ms
    setup_timer(&timers[1], "중간타이머", 2, 0, 0, 500000000);    // 500ms
    setup_timer(&timers[2], "느린타이머", 3, 0, 1, 0);           // 1s
    setup_timer(&timers[3], "일회타이머", 5, 0, 0, 0);           // 5초 후 한번만
    setup_timer(&timers[4], "랜덤타이머", 1, 500000000, 0, 750000000); // 750ms
    
    epoll_fd = epoll_create1(0);
    
    // 모든 타이머를 epoll에 등록
    for (int i = 0; i < MAX_TIMERS; i++) {
        if (timers[i].fd != -1) {
            event.events = EPOLLIN;
            event.data.ptr = &timers[i];
            epoll_ctl(epoll_fd, EPOLL_CTL_ADD, timers[i].fd, &event);
        }
    }
    
    printf("다중 타이머 데모 시작 (15초 동안 실행)\n");
    
    time_t start = time(NULL);
    while (time(NULL) - start < 15) {
        int nfds = epoll_wait(epoll_fd, events, MAX_TIMERS, 1000);
        
        for (int i = 0; i < nfds; i++) {
            struct timer_info *timer = (struct timer_info*)events[i].data.ptr;
            uint64_t expirations;
            
            if (read(timer->fd, &expirations, sizeof(expirations)) == sizeof(expirations)) {
                timer->count++;
                printf("[%ld초] %s: %d번째 이벤트 (누적 만료: %lu)\n",
                       time(NULL) - start, timer->name, timer->count, expirations);
            }
        }
    }
    
    // 정리
    for (int i = 0; i < MAX_TIMERS; i++) {
        if (timers[i].fd != -1) {
            close(timers[i].fd);
        }
    }
    close(epoll_fd);
    
    printf("\n타이머 통계:\n");
    for (int i = 0; i < MAX_TIMERS; i++) {
        printf("  %s: %d번 실행\n", timers[i].name, timers[i].count);
    }
}

int main() {
    run_multi_timer_demo();
    return 0;
}
```

## 2. signalfd로 신호를 파일 디스크립터처럼 처리

### 2.1 기본 signalfd 사용

```c
// signalfd_demo.c - 신호를 파일 디스크립터처럼 처리
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
#include <sys/signalfd.h>
#include <sys/epoll.h>

void handle_signal_event(struct signalfd_siginfo *si) {
    printf("signalfd로 수신한 신호: %d\n", si->ssi_signo);
    
    switch (si->ssi_signo) {
        case SIGUSR1:
            printf("  -> SIGUSR1 from PID %d\n", si->ssi_pid);
            break;
        case SIGUSR2:
            printf("  -> SIGUSR2 from PID %d\n", si->ssi_pid);
            break;
        case SIGINT:
            printf("  -> SIGINT (인터럽트) - 종료 신호\n");
            break;
        case SIGTERM:
            printf("  -> SIGTERM (종료) 수신\n");
            break;
        default:
            printf("  -> 기타 신호 %d\n", si->ssi_signo);
    }
}

void run_signalfd_demo() {
    sigset_t mask;
    int signal_fd, epoll_fd;
    struct epoll_event event, events[10];
    
    printf("signalfd 데모 (PID: %d)\n", getpid());
    printf("다음 신호들을 보내보세요:\n");
    printf("  kill -USR1 %d\n", getpid());
    printf("  kill -USR2 %d\n", getpid());
    printf("  kill -TERM %d (or Ctrl+C)\n\n", getpid());
    
    // 신호 마스크 설정
    sigemptyset(&mask);
    sigaddset(&mask, SIGUSR1);
    sigaddset(&mask, SIGUSR2);
    sigaddset(&mask, SIGINT);
    sigaddset(&mask, SIGTERM);
    
    // 신호 차단 (일반 핸들러 대신 signalfd 사용)
    if (sigprocmask(SIG_BLOCK, &mask, NULL) == -1) {
        perror("sigprocmask");
        return;
    }
    
    // signalfd 생성
    signal_fd = signalfd(-1, &mask, SFD_CLOEXEC);
    if (signal_fd == -1) {
        perror("signalfd");
        return;
    }
    
    // epoll로 비동기 이벤트 처리
    epoll_fd = epoll_create1(0);
    if (epoll_fd == -1) {
        perror("epoll_create1");
        close(signal_fd);
        return;
    }
    
    event.events = EPOLLIN;
    event.data.fd = signal_fd;
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, signal_fd, &event);
    
    printf("신호 대기 중... (종료하려면 SIGTERM 또는 Ctrl+C)\n");
    
    int signal_count = 0;
    while (1) {
        int nfds = epoll_wait(epoll_fd, events, 10, -1);
        
        for (int i = 0; i < nfds; i++) {
            if (events[i].data.fd == signal_fd) {
                struct signalfd_siginfo si;
                ssize_t s = read(signal_fd, &si, sizeof(si));
                
                if (s == sizeof(si)) {
                    signal_count++;
                    handle_signal_event(&si);
                    
                    // 종료 신호 처리
                    if (si.ssi_signo == SIGINT || si.ssi_signo == SIGTERM) {
                        printf("\n종료 신호 수신 - 프로그램 종료\n");
                        goto cleanup;
                    }
                }
            }
        }
    }
    
cleanup:
    close(epoll_fd);
    close(signal_fd);
    printf("signalfd 데모 완료 (총 %d개 신호 처리)\n", signal_count);
}

int main() {
    run_signalfd_demo();
    return 0;
}
```

### 2.2 signalfd 실시간 모니터링

```c
// signalfd_monitoring.c - 시스템 신호 실시간 모니터링
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
#include <sys/signalfd.h>
#include <sys/epoll.h>
#include <time.h>

struct signal_stats {
    int sigusr1_count;
    int sigusr2_count;
    int sigchld_count;
    int other_count;
    time_t start_time;
};

void print_signal_stats(struct signal_stats *stats) {
    time_t current = time(NULL);
    int elapsed = current - stats->start_time;
    
    printf("\n=== 신호 통계 (%d초 경과) ===\n", elapsed);
    printf("SIGUSR1: %d개\n", stats->sigusr1_count);
    printf("SIGUSR2: %d개\n", stats->sigusr2_count);
    printf("SIGCHLD: %d개\n", stats->sigchld_count);
    printf("기타: %d개\n", stats->other_count);
    printf("총 신호: %d개\n", 
           stats->sigusr1_count + stats->sigusr2_count + 
           stats->sigchld_count + stats->other_count);
    if (elapsed > 0) {
        printf("초당 신호율: %.1f/sec\n", 
               (double)(stats->sigusr1_count + stats->sigusr2_count + 
                       stats->sigchld_count + stats->other_count) / elapsed);
    }
}

void run_signal_monitoring() {
    sigset_t mask;
    int signal_fd, epoll_fd;
    struct epoll_event event, events[10];
    struct signal_stats stats = {0};
    
    stats.start_time = time(NULL);
    
    printf("시스템 신호 모니터링 시작 (PID: %d)\n", getpid());
    printf("다양한 신호를 보내서 테스트해보세요.\n");
    printf("Ctrl+C로 종료\n\n");
    
    // 모니터링할 신호들 설정
    sigemptyset(&mask);
    sigaddset(&mask, SIGUSR1);
    sigaddset(&mask, SIGUSR2);
    sigaddset(&mask, SIGCHLD);
    sigaddset(&mask, SIGINT);
    sigaddset(&mask, SIGTERM);
    sigaddset(&mask, SIGHUP);
    sigaddset(&mask, SIGPIPE);
    
    // 신호 차단
    sigprocmask(SIG_BLOCK, &mask, NULL);
    
    // signalfd 생성
    signal_fd = signalfd(-1, &mask, SFD_CLOEXEC);
    if (signal_fd == -1) {
        perror("signalfd");
        return;
    }
    
    // epoll 설정
    epoll_fd = epoll_create1(0);
    event.events = EPOLLIN;
    event.data.fd = signal_fd;
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, signal_fd, &event);
    
    time_t last_stats = time(NULL);
    
    while (1) {
        int nfds = epoll_wait(epoll_fd, events, 10, 5000);  // 5초 타임아웃
        
        if (nfds == 0) {
            // 타임아웃 - 통계 출력
            print_signal_stats(&stats);
            continue;
        }
        
        for (int i = 0; i < nfds; i++) {
            if (events[i].data.fd == signal_fd) {
                struct signalfd_siginfo si;
                
                while (read(signal_fd, &si, sizeof(si)) == sizeof(si)) {
                    struct timespec ts;
                    clock_gettime(CLOCK_REALTIME, &ts);
                    
                    printf("[%ld.%03ld] 신호 %d (PID %d, UID %d)",
                           ts.tv_sec, ts.tv_nsec / 1000000,
                           si.ssi_signo, si.ssi_pid, si.ssi_uid);
                    
                    switch (si.ssi_signo) {
                        case SIGUSR1:
                            stats.sigusr1_count++;
                            printf(" - SIGUSR1\n");
                            break;
                        case SIGUSR2:
                            stats.sigusr2_count++;
                            printf(" - SIGUSR2\n");
                            break;
                        case SIGCHLD:
                            stats.sigchld_count++;
                            printf(" - SIGCHLD (자식 프로세스 상태 변경)\n");
                            break;
                        case SIGINT:
                        case SIGTERM:
                            printf(" - 종료 신호\n");
                            print_signal_stats(&stats);
                            goto cleanup;
                        default:
                            stats.other_count++;
                            printf(" - 기타 신호\n");
                    }
                }
            }
        }
    }
    
cleanup:
    close(epoll_fd);
    close(signal_fd);
}

int main() {
    run_signal_monitoring();
    return 0;
}
```

## 3. 고급 이벤트 메커니즘 활용

### 3.1 성능 특성

**timerfd 장점:**

- 나노초 정밀도 타이밍
- epoll과 완벽 통합
- 여러 타이머 동시 관리

**signalfd 장점:**

- 신호 처리의 예측 가능성
- 비동기 신호 처리
- 통합 이벤트 루프 지원

### 3.2 사용 권장 사항

**timerfd 적합한 경우:**

- 정밀한 주기적 작업
- 실시간 시스템
- 다중 타이머 관리

**signalfd 적합한 경우:**

- 신호 기반 IPC
- 시스템 모니터링
- 통합 이벤트 처리

## 4. 실습 가이드

### 컴파일 및 실행

```bash
# 기본 timerfd
gcc -o timerfd_demo timerfd_demo.c
./timerfd_demo

# 다중 타이머
gcc -o advanced_timerfd advanced_timerfd.c
./advanced_timerfd

# 기본 signalfd
gcc -o signalfd_demo signalfd_demo.c
./signalfd_demo

# signalfd 모니터링
gcc -o signalfd_monitoring signalfd_monitoring.c
./signalfd_monitoring
```

## 다음 단계

고급 이벤트 메커니즘을 익혔다면, 다음 문서에서 모든 이벤트 소스를 통합하는 방법을 학습하세요:

- [Chapter 10-4d4: 통합 이벤트 시스템](04-02-10-integrated-event-system.md) - 모든 이벤트 메커니즘 통합

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: ADVANCED
-**주제**: 시스템 프로그래밍
-**예상 시간**: 6-10시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-04-syscall-kernel)

- [Chapter 4-1-1: 시스템 호출 기초와 인터페이스](./04-01-01-system-call-basics.md)
- [Chapter 4-1-2: 리눅스 커널 아키텍처 개요](./04-01-02-kernel-architecture.md)
- [Chapter 4-1-3: 커널 설계 철학과 아키텍처 기초](./04-01-03-kernel-design-philosophy.md)
- [Chapter 4-1-3: 커널 설계 철학과 전체 구조](./04-01-04-kernel-design-structure.md)
- [Chapter 4-1-5: 핵심 서브시스템 탐구](./04-01-05-core-subsystems.md)

### 🏷️ 관련 키워드

`timerfd`, `signalfd`, `epoll`, `real-time`, `event-driven`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
