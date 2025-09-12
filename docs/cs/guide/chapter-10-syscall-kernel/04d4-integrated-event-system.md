---
tags:
  - Kernel
  - Integrated Events
  - epoll
  - Event System
---

# Chapter 10-4d4: 통합 이벤트 시스템 구현

## 📋 학습 목표

이 문서를 통해 다음을 배울 수 있습니다:

1. **다중 이벤트 소스의 통합 관리**
2. **epoll을 활용한 효율적인 이벤트 루프**
3. **실제 운영 환경에서의 이벤트 시스템 설계**
4. **성능과 사용성 비교를 통한 최적 선택**

## 1. 종합 이벤트 시스템 구현

### 1.1 다중 이벤트 소스 통합 처리

모든 이벤트 메커니즘을 하나의 시스템으로 통합한 완전한 예제입니다.

```c
// multi_event_system.c - 다양한 이벤트 소스를 통합 처리
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/eventfd.h>
#include <sys/timerfd.h>
#include <sys/signalfd.h>
#include <sys/epoll.h>
#include <signal.h>
#include <time.h>
#include <pthread.h>
#include <stdint.h>

#define MAX_EVENTS 10

struct event_system {
    int epoll_fd;
    int event_fd;
    int timer_fd;
    int signal_fd;
    int pipe_fd[2];
    
    volatile int running;
    pthread_t event_generator;
};

// 이벤트 생성기 스레드
void* event_generator_thread(void* arg) {
    struct event_system *sys = (struct event_system*)arg;
    
    printf("이벤트 생성기 시작\n");
    
    int counter = 1;
    while (sys->running) {
        sleep(2);  // 2초마다
        
        if (!sys->running) break;
        
        // eventfd에 이벤트 전송
        uint64_t value = counter++;
        write(sys->event_fd, &value, sizeof(value));
        
        // pipe에 데이터 전송
        char message[64];
        snprintf(message, sizeof(message), "Pipe message #%d\n", counter - 1);
        write(sys->pipe_fd[1], message, strlen(message));
        
        printf("이벤트 생성기: eventfd와 pipe에 데이터 전송 #%d\n", counter - 1);
    }
    
    printf("이벤트 생성기 종료\n");
    return NULL;
}

void setup_event_system(struct event_system *sys) {
    sigset_t mask;
    struct itimerspec timer_spec;
    struct epoll_event event;
    
    // epoll 인스턴스 생성
    sys->epoll_fd = epoll_create1(0);
    if (sys->epoll_fd == -1) {
        perror("epoll_create1");
        exit(1);
    }
    
    // eventfd 생성
    sys->event_fd = eventfd(0, EFD_CLOEXEC);
    if (sys->event_fd == -1) {
        perror("eventfd");
        exit(1);
    }
    
    // timerfd 생성 (3초마다)
    sys->timer_fd = timerfd_create(CLOCK_MONOTONIC, TFD_CLOEXEC);
    if (sys->timer_fd == -1) {
        perror("timerfd_create");
        exit(1);
    }
    
    timer_spec.it_value.tv_sec = 3;
    timer_spec.it_value.tv_nsec = 0;
    timer_spec.it_interval.tv_sec = 3;
    timer_spec.it_interval.tv_nsec = 0;
    timerfd_settime(sys->timer_fd, 0, &timer_spec, NULL);
    
    // signalfd 생성
    sigemptyset(&mask);
    sigaddset(&mask, SIGUSR1);
    sigaddset(&mask, SIGTERM);
    sigaddset(&mask, SIGINT);
    sigprocmask(SIG_BLOCK, &mask, NULL);
    
    sys->signal_fd = signalfd(-1, &mask, SFD_CLOEXEC);
    if (sys->signal_fd == -1) {
        perror("signalfd");
        exit(1);
    }
    
    // pipe 생성
    if (pipe(sys->pipe_fd) == -1) {
        perror("pipe");
        exit(1);
    }
    
    // 모든 fd들을 epoll에 등록
    event.events = EPOLLIN;
    
    event.data.fd = sys->event_fd;
    epoll_ctl(sys->epoll_fd, EPOLL_CTL_ADD, sys->event_fd, &event);
    
    event.data.fd = sys->timer_fd;
    epoll_ctl(sys->epoll_fd, EPOLL_CTL_ADD, sys->timer_fd, &event);
    
    event.data.fd = sys->signal_fd;
    epoll_ctl(sys->epoll_fd, EPOLL_CTL_ADD, sys->signal_fd, &event);
    
    event.data.fd = sys->pipe_fd[0];
    epoll_ctl(sys->epoll_fd, EPOLL_CTL_ADD, sys->pipe_fd[0], &event);
    
    sys->running = 1;
}

void handle_events(struct event_system *sys) {
    struct epoll_event events[MAX_EVENTS];
    
    printf("\n통합 이벤트 시스템 시작 (PID: %d)\n", getpid());
    printf("사용 가능한 이벤트:\n");
    printf("  - eventfd: 사용자 정의 이벤트\n");
    printf("  - timerfd: 3초마다 자동 이벤트\n");
    printf("  - signalfd: SIGUSR1, SIGTERM, SIGINT\n");
    printf("  - pipe: 데이터 전송 이벤트\n");
    printf("\n신호 보내기: kill -USR1 %d\n", getpid());
    printf("종료: Ctrl+C \n\n");
    
    int event_count = 0;
    
    while (sys->running) {
        int nfds = epoll_wait(sys->epoll_fd, events, MAX_EVENTS, 1000);
        
        if (nfds == 0) {
            printf("이벤트 대기 중... (1초 타임아웃)\n");
            continue;
        }
        
        for (int i = 0; i < nfds; i++) {
            event_count++;
            int fd = events[i].data.fd;
            
            if (fd == sys->event_fd) {
                uint64_t value;
                read(sys->event_fd, &value, sizeof(value));
                printf("[%d] eventfd: 사용자 이벤트 #%lu\n", event_count, value);
                
            } else if (fd == sys->timer_fd) {
                uint64_t expirations;
                read(sys->timer_fd, &expirations, sizeof(expirations));
                printf("[%d] timerfd: 주기적 타이머 이벤트 (%lu번 만료)\n", 
                       event_count, expirations);
                
            } else if (fd == sys->signal_fd) {
                struct signalfd_siginfo si;
                read(sys->signal_fd, &si, sizeof(si));
                printf("[%d] signalfd: 신호 %d from PID %d\n", 
                       event_count, si.ssi_signo, si.ssi_pid);
                
                if (si.ssi_signo == SIGTERM || si.ssi_signo == SIGINT) {
                    printf("종료 신호 수신\n");
                    sys->running = 0;
                }
                
            } else if (fd == sys->pipe_fd[0]) {
                char buffer[256];
                ssize_t len = read(sys->pipe_fd[0], buffer, sizeof(buffer) - 1);
                if (len > 0) {
                    buffer[len] = '\0';
                    printf("[%d] pipe: %s", event_count, buffer);
                }
            }
        }
    }
    
    printf("\n이벤트 처리 완료 (총 %d개 이벤트 처리)\n", event_count);
}

void cleanup_event_system(struct event_system *sys) {
    sys->running = 0;
    
    if (sys->event_generator) {
        pthread_join(sys->event_generator, NULL);
    }
    
    close(sys->epoll_fd);
    close(sys->event_fd);
    close(sys->timer_fd);
    close(sys->signal_fd);
    close(sys->pipe_fd[0]);
    close(sys->pipe_fd[1]);
}

int main() {
    struct event_system sys = {0};
    
    printf("종합 이벤트 시스템 데모\n");
    printf("========================\n");
    
    setup_event_system(&sys);
    
    // 이벤트 생성기 스레드 시작
    pthread_create(&sys.event_generator, NULL, event_generator_thread, &sys);
    
    // 메인 이벤트 루프
    handle_events(&sys);
    
    cleanup_event_system(&sys);
    
    return 0;
}
```

### 1.2 고급 이벤트 관리 시스템

```c
// advanced_event_manager.c - 고급 이벤트 관리자
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/epoll.h>
#include <pthread.h>
#include <time.h>

#define MAX_EVENTS 32
#define MAX_EVENT_SOURCES 16

struct event_handler {
    int fd;
    const char *name;
    void (*handler)(int fd, uint32_t events, void *data);
    void *user_data;
    int active;
};

struct event_manager {
    int epoll_fd;
    struct event_handler handlers[MAX_EVENT_SOURCES];
    int handler_count;
    volatile int running;
    
    // 통계
    struct {
        long total_events;
        long events_per_second;
        time_t last_stats_time;
    } stats;
};

// 이벤트 핸들러 등록
int register_event_handler(struct event_manager *mgr, int fd, const char *name,
                          void (*handler)(int, uint32_t, void*), void *data) {
    if (mgr->handler_count >= MAX_EVENT_SOURCES) {
        return -1;
    }
    
    struct epoll_event event;
    event.events = EPOLLIN | EPOLLET;  // Edge-triggered
    event.data.ptr = &mgr->handlers[mgr->handler_count];
    
    if (epoll_ctl(mgr->epoll_fd, EPOLL_CTL_ADD, fd, &event) == -1) {
        perror("epoll_ctl");
        return -1;
    }
    
    mgr->handlers[mgr->handler_count] = (struct event_handler) {
        .fd = fd,
        .name = name,
        .handler = handler,
        .user_data = data,
        .active = 1
    };
    
    return mgr->handler_count++;
}

void print_event_stats(struct event_manager *mgr) {
    time_t now = time(NULL);
    time_t elapsed = now - mgr->stats.last_stats_time;
    
    if (elapsed >= 5) {  // 5초마다 통계 출력
        if (elapsed > 0) {
            mgr->stats.events_per_second = mgr->stats.total_events / elapsed;
        }
        
        printf("\n=== 이벤트 통계 ===\n");
        printf("총 이벤트: %ld개\n", mgr->stats.total_events);
        printf("초당 이벤트: %ld/sec\n", mgr->stats.events_per_second);
        
        // 핸들러별 상태
        printf("등록된 핸들러: %d개\n", mgr->handler_count);
        for (int i = 0; i < mgr->handler_count; i++) {
            printf("  [%d] %s (fd=%d) - %s\n", 
                   i, mgr->handlers[i].name, mgr->handlers[i].fd,
                   mgr->handlers[i].active ? "활성" : "비활성");
        }
        
        mgr->stats.last_stats_time = now;
        mgr->stats.total_events = 0;
    }
}

void run_event_loop(struct event_manager *mgr) {
    struct epoll_event events[MAX_EVENTS];
    
    printf("고급 이벤트 매니저 시작\n");
    printf("등록된 핸들러: %d개\n", mgr->handler_count);
    
    mgr->stats.last_stats_time = time(NULL);
    
    while (mgr->running) {
        int nfds = epoll_wait(mgr->epoll_fd, events, MAX_EVENTS, 1000);
        
        if (nfds == 0) {
            print_event_stats(mgr);
            continue;
        }
        
        for (int i = 0; i < nfds; i++) {
            struct event_handler *handler = (struct event_handler*)events[i].data.ptr;
            
            if (handler && handler->active && handler->handler) {
                handler->handler(handler->fd, events[i].events, handler->user_data);
                mgr->stats.total_events++;
            }
        }
        
        print_event_stats(mgr);
    }
}

struct event_manager* create_event_manager() {
    struct event_manager *mgr = calloc(1, sizeof(struct event_manager));
    if (!mgr) return NULL;
    
    mgr->epoll_fd = epoll_create1(EPOLL_CLOEXEC);
    if (mgr->epoll_fd == -1) {
        free(mgr);
        return NULL;
    }
    
    mgr->running = 1;
    return mgr;
}

void destroy_event_manager(struct event_manager *mgr) {
    if (mgr) {
        close(mgr->epoll_fd);
        free(mgr);
    }
}

// 예제 이벤트 핸들러들
void stdin_handler(int fd, uint32_t events, void *data) {
    char buffer[256];
    ssize_t len = read(fd, buffer, sizeof(buffer) - 1);
    if (len > 0) {
        buffer[len - 1] = '\0';  // 개행 제거
        printf("사용자 입력: '%s'\n", buffer);
        
        if (strcmp(buffer, "quit") == 0) {
            struct event_manager *mgr = (struct event_manager*)data;
            mgr->running = 0;
        }
    }
}

void timer_handler(int fd, uint32_t events, void *data) {
    uint64_t expirations;
    read(fd, &expirations, sizeof(expirations));
    printf("타이머 이벤트: %lu번 만료\n", expirations);
}

int main() {
    struct event_manager *mgr = create_event_manager();
    if (!mgr) {
        perror("create_event_manager");
        return 1;
    }
    
    // stdin 핸들러 등록
    register_event_handler(mgr, STDIN_FILENO, "stdin", stdin_handler, mgr);
    
    // 타이머 핸들러 등록 (선택사항)
    int timer_fd = timerfd_create(CLOCK_MONOTONIC, TFD_CLOEXEC);
    if (timer_fd != -1) {
        struct itimerspec spec = {
            .it_value = {2, 0},     // 2초 후 시작
            .it_interval = {5, 0}   // 5초마다 반복
        };
        timerfd_settime(timer_fd, 0, &spec, NULL);
        register_event_handler(mgr, timer_fd, "timer", timer_handler, NULL);
    }
    
    printf("고급 이벤트 관리 시스템\n");
    printf("====================\n");
    printf("명령어:\n");
    printf("  - 아무 텍스트 입력: 에코\n");
    printf("  - 'quit': 종료\n");
    printf("\n");
    
    run_event_loop(mgr);
    
    if (timer_fd != -1) close(timer_fd);
    destroy_event_manager(mgr);
    
    return 0;
}
```

## 2. 이벤트 통신 선택 가이드

### 2.1 성능과 사용성 비교

| 메커니즘 | 지연시간 | 오버헤드 | 복잡도 | 데이터 전달 | 비동기 지원 |
|---------|----------|---------|---------|-------------|--------------|
| **Signal** | 높음 (μs) | 높음 | 낮음 | 없음 | 제한적 |
| **eventfd** | 낮음 (ns) | 낮음 | 낮음 | 64bit 카운터 | 우수 |
| **timerfd** | 낮음 (ns) | 낮음 | 낮음 | 시간 정보 | 우수 |
| **signalfd** | 낮음 (ns) | 낮음 | 중간 | 신호 정보 | 우수 |
| **pipe** | 중간 (μs) | 중간 | 낮음 | 임의 데이터 | 우수 |

### 2.2 사용 시나리오

**신호(Signal)를 사용할 때:**

- 간단한 알림이 필요할 때
- 레거시 시스템과의 호환성
- 프로세스 제어 (종료, 중지, 재시작)

**eventfd를 사용할 때:**

- 고성능 이벤트 카운터
- 스레드 간 빠른 동기화
- epoll과 함께 비동기 I/O

**timerfd를 사용할 때:**

- 정밀한 시간 기반 이벤트
- 주기적인 작업 스케줄링
- 비동기 타이머 처리

**signalfd를 사용할 때:**

- 신호를 비동기로 처리
- 다중 이벤트 소스 통합
- 신호 처리의 예측 가능성 증대

### 2.3 베스트 프랙티스

1. **epoll과 함께 사용**: 모든 이벤트 fd들을 단일 epoll로 통합 처리
2. **Edge-triggered 모드**: 성능이 중요한 경우 ET 모드 사용
3. **비블로킹 I/O**: 이벤트 fd들을 비블로킹으로 설정
4. **적절한 버퍼링**: 성능과 메모리 사용량의 균형

## 3. 실전 응용

### 3.1 웹 서버 이벤트 시스템

```c
// HTTP 요청 처리: eventfd로 워커 스레드 간 작업 분배
// 타이머: timerfd로 연결 타임아웃 관리
// 신호: signalfd로 graceful shutdown 처리
// 네트워크: epoll로 소켓 이벤트 처리
```

### 3.2 실시간 모니터링 시스템

```c
// 센서 데이터: pipe/eventfd로 데이터 수집
// 알람: signal/eventfd로 임계값 초과 알림
// 주기적 리포트: timerfd로 정기 보고서 생성
// 시스템 이벤트: signalfd로 시스템 상태 감지
```

## 4. 실습 가이드

### 컴파일 및 실행

```bash
# 통합 이벤트 시스템
gcc -pthread -o multi_event_system multi_event_system.c
./multi_event_system

# 고급 이벤트 매니저
gcc -pthread -o advanced_event_manager advanced_event_manager.c
./advanced_event_manager
```

### 테스트 방법

```bash
# 다른 터미널에서 신호 전송
kill -USR1 [PID]

# 또는 입력을 통한 테스트
echo "test message" | ./program
```

## 5. 마무리

가벼운 이벤트 통신 메커니즘들을 마스터했습니다. 이제 각각의 특성을 이해하고 상황에 맞는 최적의 도구를 선택할 수 있습니다.

다음 단계에서는 커널 내에서 직접 실행되는 사용자 코드인 eBPF에 대해 알아보겠습니다:

- [Chapter 10-4e: eBPF 커널 프로그래밍](04e-ebpf-programming.md)

## 참고 자료

- [signal(7) Manual Page](https://man7.org/linux/man-pages/man7/signal.7.html)
- [eventfd(2) Manual Page](https://man7.org/linux/man-pages/man2/eventfd.2.html)
- [timerfd_create(2) Manual Page](https://man7.org/linux/man-pages/man2/timerfd_create.2.html)
- [signalfd(2) Manual Page](https://man7.org/linux/man-pages/man2/signalfd.2.html)
- [epoll(7) Manual Page](https://man7.org/linux/man-pages/man7/epoll.7.html)
