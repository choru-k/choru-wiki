---
tags:
  - advanced
  - cpu-affinity
  - deep-study
  - hands-on
  - kernel-tuning
  - memory-tuning
  - network-optimization
  - sysctl
  - 인프라스트럭처
difficulty: ADVANCED
learning_time: "6-10시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 4.2.9: eventfd 통신

## 📋 학습 목표

이 문서를 통해 다음을 배울 수 있습니다:

1. **eventfd의 기본 사용법과 성능 특성**
2. **epoll과 eventfd의 비동기 처리 연동**
3. **eventfd와 신호의 성능 비교 분석**
4. **실시간 이벤트 처리 최적화 기법**

## 1. eventfd 기본 사용법

### 1.1 기본 eventfd 통신

eventfd는 신호보다 훨씬 효율적인 이벤트 알림 메커니즘입니다.

```c
// eventfd_communication.c - eventfd를 통한 이벤트 기반 통신
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/eventfd.h>
#include <stdint.h>
#include <pthread.h>

// 생산자 스레드
void* producer_thread(void* arg) {
    int efd = *(int*)arg;
    
    printf("생산자 스레드 시작\n");
    
    for (int i = 0; i < 10; i++) {
        uint64_t value = i + 1;
        
        if (write(efd, &value, sizeof(value)) != sizeof(value)) {
            perror("write eventfd");
            break;
        }
        
        printf("생산자: 이벤트 %lu 생성\n", value);
        sleep(1);
    }
    
    printf("생산자 스레드 종료\n");
    return NULL;
}

// 소비자 스레드
void* consumer_thread(void* arg) {
    int efd = *(int*)arg;
    
    printf("소비자 스레드 시작\n");
    
    while (1) {
        uint64_t value;
        
        ssize_t ret = read(efd, &value, sizeof(value));
        if (ret != sizeof(value)) {
            if (ret == 0) {
                printf("eventfd 닫힘\n");
            } else {
                perror("read eventfd");
            }
            break;
        }
        
        printf("소비자: 이벤트 %lu 처리\n", value);
        
        if (value >= 10) {  // 마지막 이벤트
            break;
        }
    }
    
    printf("소비자 스레드 종료\n");
    return NULL;
}

int main() {
    // eventfd 생성 (세마포어 모드)
    int efd = eventfd(0, EFD_SEMAPHORE);
    if (efd == -1) {
        perror("eventfd");
        return 1;
    }
    
    printf("eventfd 생성됨: fd=%d\n", efd);
    
    pthread_t producer, consumer;
    
    // 스레드 생성
    if (pthread_create(&consumer, NULL, consumer_thread, &efd) != 0) {
        perror("pthread_create consumer");
        close(efd);
        return 1;
    }
    
    if (pthread_create(&producer, NULL, producer_thread, &efd) != 0) {
        perror("pthread_create producer");
        close(efd);
        return 1;
    }
    
    // 스레드 대기
    pthread_join(producer, NULL);
    pthread_join(consumer, NULL);
    
    close(efd);
    printf("eventfd 통신 완료\n");
    
    return 0;
}
```

### 1.2 eventfd와 epoll을 이용한 비동기 이벤트 처리

```c
// eventfd_epoll.c - eventfd와 epoll을 이용한 이벤트 루프
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/eventfd.h>
#include <sys/epoll.h>
#include <stdint.h>
#include <pthread.h>
#include <errno.h>

#define MAX_EVENTS 10

struct event_data {
    int eventfd;
    int timer_fd;
    int stop_flag;
    pthread_t producer_thread;
};

// 이벤트 생산자 스레드
void* event_producer(void* arg) {
    struct event_data *data = (struct event_data*)arg;
    
    printf("이벤트 생산자 시작\n");
    
    int counter = 1;
    while (!data->stop_flag) {
        uint64_t value = counter++;
        
        // eventfd에 이벤트 발생
        if (write(data->eventfd, &value, sizeof(value)) != sizeof(value)) {
            perror("write eventfd");
            break;
        }
        
        printf("생산자: 이벤트 %lu 발생\n", value);
        
        // 가변적인 인터벌
        usleep(500000 + (counter % 3) * 500000);  // 0.5~1.5초
    }
    
    printf("이벤트 생산자 종료\n");
    return NULL;
}

// 이벤트 처리기
void handle_eventfd_event(int eventfd) {
    uint64_t value;
    ssize_t ret = read(eventfd, &value, sizeof(value));
    
    if (ret == sizeof(value)) {
        printf("비동기 이벤트 처리: %lu\n", value);
        
        // 이벤트 값에 따른 다른 처리
        if (value % 3 == 0) {
            printf("  -> 중요한 이벤트! 특별 처리 수행\n");
        } else if (value % 2 == 0) {
            printf("  -> 짝수 이벤트 처리\n");
        } else {
            printf("  -> 홀수 이벤트 처리\n");
        }
    } else {
        perror("read eventfd");
    }
}

void run_event_loop(struct event_data *data) {
    int epoll_fd;
    struct epoll_event event, events[MAX_EVENTS];
    
    // epoll 인스턴스 생성
    epoll_fd = epoll_create1(0);
    if (epoll_fd == -1) {
        perror("epoll_create1");
        return;
    }
    
    // eventfd를 epoll에 등록
    event.events = EPOLLIN;
    event.data.fd = data->eventfd;
    
    if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, data->eventfd, &event) == -1) {
        perror("epoll_ctl");
        close(epoll_fd);
        return;
    }
    
    printf("비동기 이벤트 루프 시작 (10초 후 자동 종료)\n");
    
    int total_events = 0;
    time_t start_time = time(NULL);
    
    while (time(NULL) - start_time < 10) {  // 10초 동안 실행
        int nfds = epoll_wait(epoll_fd, events, MAX_EVENTS, 1000);  // 1초 타임아웃
        
        if (nfds == -1) {
            perror("epoll_wait");
            break;
        } else if (nfds == 0) {
            printf("비동기 루프: 1초 간 이벤트 없음\n");
            continue;
        }
        
        for (int i = 0; i < nfds; i++) {
            if (events[i].data.fd == data->eventfd) {
                handle_eventfd_event(data->eventfd);
                total_events++;
            }
        }
    }
    
    data->stop_flag = 1;  // 생산자 스레드 중지
    
    close(epoll_fd);
    printf("\n비동기 이벤트 루프 종료 (총 %d개 이벤트 처리)\n", total_events);
}

int main() {
    struct event_data data = {0};
    
    // eventfd 생성 (비블로킹 모드)
    data.eventfd = eventfd(0, EFD_CLOEXEC | EFD_NONBLOCK);
    if (data.eventfd == -1) {
        perror("eventfd");
        return 1;
    }
    
    printf("eventfd + epoll 비동기 이벤트 처리 데모\n");
    printf("========================================\n");
    
    // 이벤트 생산자 스레드 시작
    if (pthread_create(&data.producer_thread, NULL, event_producer, &data) != 0) {
        perror("pthread_create");
        close(data.eventfd);
        return 1;
    }
    
    // 비동기 이벤트 루프 실행
    run_event_loop(&data);
    
    // 스레드 종료 대기
    pthread_join(data.producer_thread, NULL);
    
    close(data.eventfd);
    return 0;
}
```

## 2. eventfd 성능 벤치마크

### 2.1 신호 vs eventfd 성능 비교

```c
// eventfd_benchmark.c - eventfd vs 신호 성능 비교
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/eventfd.h>
#include <signal.h>
#include <time.h>
#include <pthread.h>
#include <stdint.h>

#define BENCHMARK_COUNT 100000

static volatile int signal_counter = 0;
static volatile int benchmark_running = 1;

void signal_handler(int sig) {
    signal_counter++;
}

// 신호 기반 벤치마크
double benchmark_signals() {
    signal(SIGUSR1, signal_handler);
    signal_counter = 0;
    
    pid_t pid = fork();
    if (pid == 0) {
        // 자식: 신호 전송
        pid_t parent = getppid();
        for (int i = 0; i < BENCHMARK_COUNT; i++) {
            kill(parent, SIGUSR1);
        }
        exit(0);
    } else if (pid > 0) {
        // 부모: 신호 수신
        struct timespec start, end;
        clock_gettime(CLOCK_MONOTONIC, &start);
        
        while (signal_counter < BENCHMARK_COUNT) {
            pause();  // 신호 대기
        }
        
        clock_gettime(CLOCK_MONOTONIC, &end);
        
        wait(NULL);  // 자식 종료 대기
        
        double elapsed = (end.tv_sec - start.tv_sec) + 
                        (end.tv_nsec - start.tv_nsec) / 1e9;
        return elapsed;
    } else {
        perror("fork");
        return -1;
    }
}

// eventfd 기반 벤치마크
struct eventfd_benchmark_data {
    int eventfd;
    int count;
    pthread_mutex_t mutex;
    pthread_cond_t cond;
};

void* eventfd_sender(void* arg) {
    struct eventfd_benchmark_data *data = (struct eventfd_benchmark_data*)arg;
    
    for (int i = 0; i < BENCHMARK_COUNT; i++) {
        uint64_t value = 1;
        write(data->eventfd, &value, sizeof(value));
    }
    
    return NULL;
}

void* eventfd_receiver(void* arg) {
    struct eventfd_benchmark_data *data = (struct eventfd_benchmark_data*)arg;
    
    while (data->count < BENCHMARK_COUNT) {
        uint64_t value;
        if (read(data->eventfd, &value, sizeof(value)) == sizeof(value)) {
            pthread_mutex_lock(&data->mutex);
            data->count += value;
            pthread_cond_signal(&data->cond);
            pthread_mutex_unlock(&data->mutex);
        }
    }
    
    return NULL;
}

double benchmark_eventfd() {
    struct eventfd_benchmark_data data = {0};
    
    data.eventfd = eventfd(0, EFD_SEMAPHORE);
    if (data.eventfd == -1) {
        perror("eventfd");
        return -1;
    }
    
    pthread_mutex_init(&data.mutex, NULL);
    pthread_cond_init(&data.cond, NULL);
    
    pthread_t sender, receiver;
    
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    
    // 스레드 생성 및 시작
    pthread_create(&receiver, NULL, eventfd_receiver, &data);
    pthread_create(&sender, NULL, eventfd_sender, &data);
    
    // 수신 완료 대기
    pthread_mutex_lock(&data.mutex);
    while (data.count < BENCHMARK_COUNT) {
        pthread_cond_wait(&data.cond, &data.mutex);
    }
    pthread_mutex_unlock(&data.mutex);
    
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    // 스레드 정리
    pthread_join(sender, NULL);
    pthread_join(receiver, NULL);
    
    close(data.eventfd);
    pthread_mutex_destroy(&data.mutex);
    pthread_cond_destroy(&data.cond);
    
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_nsec - start.tv_nsec) / 1e9;
    return elapsed;
}

int main() {
    printf("신호 vs eventfd 성능 벤치마크\n");
    printf("============================\n");
    printf("테스트 횟수: %d\n\n", BENCHMARK_COUNT);
    
    // 신호 벤치마크
    printf("신호 벤치마크 실행 중...\n");
    double signal_time = benchmark_signals();
    if (signal_time > 0) {
        printf("신호 결과: %.3f초\n", signal_time);
        printf("  -> 처리량: %.0f signals/sec\n\n", BENCHMARK_COUNT / signal_time);
    }
    
    // eventfd 벤치마크  
    printf("eventfd 벤치마크 실행 중...\n");
    double eventfd_time = benchmark_eventfd();
    if (eventfd_time > 0) {
        printf("eventfd 결과: %.3f초\n", eventfd_time);
        printf("  -> 처리량: %.0f events/sec\n\n", BENCHMARK_COUNT / eventfd_time);
    }
    
    // 성능 비교
    if (signal_time > 0 && eventfd_time > 0) {
        printf("성능 비교:\n");
        printf("eventfd가 신호보다 %.2f배 빠름\n", signal_time / eventfd_time);
    }
    
    return 0;
}
```

## 3. eventfd의 특징과 활용

### 3.1 eventfd 플래그 옵션

```c
// eventfd 생성 옵션들
int efd1 = eventfd(0, 0);                    // 기본 모드
int efd2 = eventfd(0, EFD_SEMAPHORE);        // 세마포어 모드
int efd3 = eventfd(0, EFD_CLOEXEC);          // exec시 자동 닫기
int efd4 = eventfd(0, EFD_NONBLOCK);         // 비블로킹 모드
int efd5 = eventfd(0, EFD_SEMAPHORE | EFD_CLOEXEC | EFD_NONBLOCK);
```

### 3.2 적용 사례

**웹 서버 요청 처리:**

- 워커 스레드 간 작업 분배
- 연결 상태 변경 알림
- 비동기 I/O 완료 통지

**실시간 시스템:**

- 센서 데이터 수집 이벤트
- 알람 및 임계값 초과 알림
- 시스템 상태 모니터링

## 4. 실습 가이드

### 컴파일 및 실행

```bash
# 기본 eventfd 통신
gcc -pthread -o eventfd_communication eventfd_communication.c
./eventfd_communication

# epoll과 eventfd 연동
gcc -pthread -o eventfd_epoll eventfd_epoll.c
./eventfd_epoll

# 성능 벤치마크
gcc -pthread -o eventfd_benchmark eventfd_benchmark.c
./eventfd_benchmark
```

## 다음 단계

eventfd 통신을 익혔다면, 다음 문서에서 더 고급 이벤트 메커니즘을 학습하세요:

- [Chapter 10-4d3: 고급 이벤트 메커니즘](10-20-3-advanced-event-mechanisms.md) - timerfd, signalfd
- [Chapter 10-4d4: 통합 이벤트 시스템](04d4-integrated-event-system.md) - 다중 이벤트 소스 통합

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 인프라스트럭처
- **예상 시간**: 6-10시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-04-syscall-kernel)

- [Chapter 4-1-1: 시스템 호출 기초와 인터페이스](./04-01-01-system-call-basics.md)
- [Chapter 4-1-2: 리눅스 커널 아키텍처 개요](./04-02-kernel-architecture.md)
- [Chapter 4-1-3: 커널 설계 철학과 아키텍처 기초](./04-01-03-kernel-design-philosophy.md)
- [Chapter 4-1-3: 커널 설계 철학과 전체 구조](./04-01-04-kernel-design-structure.md)
- [Chapter 4-1-5: 핵심 서브시스템 탐구](./04-01-05-core-subsystems.md)

### 🏷️ 관련 키워드

`kernel-tuning`, `sysctl`, `cpu-affinity`, `network-optimization`, `memory-tuning`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
