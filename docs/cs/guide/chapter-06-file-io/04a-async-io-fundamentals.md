---
tags:
  - Async I/O
  - C10K Problem
  - Event-driven
  - Fundamentals
---

# Chapter 6-4A: 비동기 I/O 기본 개념과 C10K 문제

## 이 절에서 답할 질문들

- 동기 I/O와 비동기 I/O의 근본적인 차이는 무엇인가?
- C10K 문제는 왜 중요한 이정표가 되었는가?
- 이벤트 기반 아키텍처는 어떤 문제를 해결하는가?
- nginx는 어떻게 Apache를 압도할 수 있었는가?

## 도입: 동시성의 진화

### 🌐 C10K 문제: 1만 개 연결의 벽

2000년대 초, 웹 서버 개발자들은 큰 문제에 직면했습니다.

"어떻게 하면 동시에 1만 개의 연결을 처리할 수 있을까?"

전통적인 방법의 문제:

```c
// 각 연결마다 스레드 생성
for (int i = 0; i < 10000; i++) {
    pthread_create(&thread[i], NULL, handle_client, client_fd[i]);
}
// 결과:
// - 스레드당 1MB 스택 = 10GB 메모리!
// - 컨텍스트 스위칭으로 CPU 100%
// - 서버 폭발! 💥
```

### 💡 실전 경험: nginx의 비밀

제가 Apache에서 nginx로 전환한 이유:

```bash
# Apache (prefork MPM)
$ ab -n 10000 -c 1000 http://localhost/
Requests per second: 850 [#/sec]
Memory usage: 2.5GB

# nginx (event-driven)
$ ab -n 10000 -c 1000 http://localhost/
Requests per second: 15,000 [#/sec]  # 17배!
Memory usage: 15MB  # 166분의 1!
```

비동기 I/O와 이벤트 기반 프로그래밍이 바로 이 마법의 비밀입니다!

## 동기 I/O vs 비동기 I/O

### 동기 I/O의 문제점

```c
// 전통적인 동기 I/O 서버
void handle_client_sync(int client_fd) {
    char buffer[1024];
    
    // 1. 요청 읽기 - 블로킹!
    ssize_t n = read(client_fd, buffer, sizeof(buffer));
    if (n <= 0) return;
    
    // 2. 파일 읽기 - 또 블로킹!
    int file_fd = open("response.html", O_RDONLY);
    char file_buffer[4096];
    read(file_fd, file_buffer, sizeof(file_buffer));
    
    // 3. 응답 전송 - 또또 블로킹!
    write(client_fd, file_buffer, strlen(file_buffer));
    
    close(file_fd);
    close(client_fd);
}

// 메인 서버 루프
void run_server() {
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    // ... 바인딩 및 listen ...
    
    while (1) {
        int client_fd = accept(listen_fd, NULL, NULL);  // 블로킹!
        
        pthread_t thread;
        pthread_create(&thread, NULL, handle_client_sync, &client_fd);
        pthread_detach(thread);
    }
}
```

**문제점:**

- 각 연결마다 스레드 필요 → 메모리 급속 증가
- 블로킹 I/O → CPU 낭비 (대기 시간이 대부분)
- 컨텍스트 스위칭 오버헤드 → 성능 저하

### 비동기 I/O의 해결책

```c
// 비동기 I/O의 핵심 아이디어
void async_server_concept() {
    // 1. 논블로킹 소켓 설정
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    set_nonblocking(fd);
    
    // 2. 여러 소켓을 동시에 모니터링
    while (1) {
        // "준비된 소켓들만 알려줘!"
        int ready_fds = wait_for_events(all_sockets);
        
        // 3. 준비된 것들만 처리
        for (int i = 0; i < ready_fds; i++) {
            if (can_read(socket[i])) {
                handle_read(socket[i]);
            }
            if (can_write(socket[i])) {
                handle_write(socket[i]);
            }
        }
    }
}
```

## C10K 문제의 역사적 의미

### 문제의 배경

1999년, Dan Kegel이 처음 제기한 "C10K Problem":

> "어떻게 하면 단일 서버에서 동시에 10,000개의 클라이언트를 처리할 수 있을까?"

당시 상황:

- 인터넷 급속 확산
- 웹 서비스 대중화
- 서버 하드웨어 성능 향상
- **하지만 소프트웨어는 따라가지 못함**

### 전통적 접근법의 한계

#### 1. Thread-per-Connection 모델

```c
// Apache prefork MPM의 접근법
#define MAX_THREADS 1000  // 현실적 한계

typedef struct {
    pthread_t thread_id;
    int client_fd;
    char buffer[8192];
} connection_t;

void *worker_thread(void *arg) {
    connection_t *conn = (connection_t *)arg;
    
    // 한 연결을 전담으로 처리
    while (1) {
        ssize_t n = read(conn->client_fd, conn->buffer, 
                        sizeof(conn->buffer));
        if (n <= 0) break;
        
        // HTTP 요청 처리
        process_http_request(conn->buffer, n);
        
        // 응답 전송
        send_http_response(conn->client_fd);
    }
    
    close(conn->client_fd);
    free(conn);
    return NULL;
}

// 메모리 사용량 계산
// 스레드당 스택: 1MB (기본값)
// 10,000 연결 = 10GB RAM!
// 컨텍스트 스위칭: O(n)
```

#### 2. Process-per-Connection 모델

```c
// Apache prefork의 또 다른 접근법
void handle_with_fork() {
    int listen_fd = create_server_socket(80);
    
    while (1) {
        int client_fd = accept(listen_fd, NULL, NULL);
        
        pid_t pid = fork();
        if (pid == 0) {
            // 자식 프로세스
            close(listen_fd);
            handle_client(client_fd);
            exit(0);
        } else {
            // 부모 프로세스
            close(client_fd);
            waitpid(pid, NULL, WNOHANG);  // 좀비 프로세스 방지
        }
    }
}

// 더 심각한 문제:
// - 프로세스 생성 오버헤드
// - 메모리 사용량 급증 (프로세스당 최소 4MB)
// - IPC 복잡성
```

### 현실적 벽

```bash
# 실제 측정 결과 (2000년대 초)
$ ulimit -n  # 파일 디스크립터 한계
1024

$ free -h    # 메모리 현황
              total        used        free
Mem:          512M        450M         62M

# 1000개 연결 시도 시
$ netstat -an | grep ESTABLISHED | wc -l
847  # 1000개도 안 됨!

$ ps aux | grep httpd | wc -l
156  # 프로세스 수 폭증

$ top
CPU: 85% system, 15% user  # 컨텍스트 스위칭으로 시스템 시간 급증
```

## 이벤트 기반 아키텍처의 등장

### 이벤트 루프의 핵심 아이디어

```c
// 이벤트 기반 서버의 기본 구조
typedef enum {
    EVENT_READ,
    EVENT_WRITE,
    EVENT_ACCEPT,
    EVENT_CLOSE
} event_type_t;

typedef struct {
    int fd;
    event_type_t type;
    void (*callback)(int fd, void *data);
    void *data;
} event_t;

// 단일 스레드 이벤트 루프
void event_loop() {
    event_t events[MAX_EVENTS];
    
    while (1) {
        // 1. 준비된 이벤트들 수집
        int num_events = poll_for_events(events, MAX_EVENTS);
        
        // 2. 각 이벤트를 순차적으로 처리
        for (int i = 0; i < num_events; i++) {
            event_t *ev = &events[i];
            ev->callback(ev->fd, ev->data);
        }
        
        // 3. 타이머, 정리 작업 등
        handle_timeouts();
        cleanup_closed_connections();
    }
}
```

### nginx의 성공 비결

```c
// nginx의 핵심 아키텍처 (단순화)
typedef struct {
    int fd;
    ngx_event_handler_pt read_handler;
    ngx_event_handler_pt write_handler;
    
    // 버퍼링
    ngx_buf_t *buffer;
    
    // 상태 관리
    unsigned ready:1;
    unsigned active:1;
    unsigned timer_set:1;
} ngx_connection_t;

// 마스터-워커 모델
void nginx_master_process() {
    // CPU 코어 수만큼 워커 프로세스 생성
    int num_workers = sysconf(_SC_NPROCESSORS_ONLN);
    
    for (int i = 0; i < num_workers; i++) {
        pid_t pid = fork();
        if (pid == 0) {
            nginx_worker_process();
            exit(0);
        }
    }
    
    // 마스터는 워커들 관리
    manage_workers();
}

void nginx_worker_process() {
    // epoll 기반 이벤트 루프
    int epfd = epoll_create(1);
    
    // 리스닝 소켓들을 epoll에 등록
    register_listening_sockets(epfd);
    
    // 메인 이벤트 루프
    nginx_event_loop(epfd);
}
```

### 성능 비교: 수치로 보는 차이

```bash
# 동일 하드웨어에서 측정 (Intel Xeon, 8GB RAM)

# Apache 2.2 (prefork)
$ ab -n 100000 -c 1000 http://localhost/
Requests per second:    850.23 [#/sec]
Time per request:       1175.980 [ms]
Memory usage:          2.1GB
CPU usage:             95%
Failed requests:       127

# nginx 1.0
$ ab -n 100000 -c 1000 http://localhost/
Requests per second:    14,234.89 [#/sec]  # 16.7배!
Time per request:       70.251 [ms]        # 16.7배 빠름!
Memory usage:          18MB                # 1/116!
CPU usage:             23%                 # 1/4!
Failed requests:       0

# 10,000 동시 연결 테스트
# Apache: 연결 거부 (메모리 부족)
# nginx: 정상 처리, 메모리 사용량 45MB
```

## 비동기 I/O의 핵심 원리

### 논블로킹 I/O

```c
// 블로킹 vs 논블로킹 비교
void demonstrate_blocking_vs_nonblocking() {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    
    // === 블로킹 모드 (기본값) ===
    ssize_t n1 = read(fd, buffer, 1024);
    // 데이터가 올 때까지 여기서 멈춤!
    // 다른 연결들은 기다려야 함
    
    // === 논블로킹 모드 ===
    set_nonblocking(fd);
    ssize_t n2 = read(fd, buffer, 1024);
    if (n2 < 0 && errno == EAGAIN) {
        // 아직 데이터 없음 - 다른 일 하러 가자!
        handle_other_connections();
    }
}

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}
```

### I/O 멀티플렉싱의 개념

```c
// I/O 멀티플렉싱: 여러 FD를 동시에 모니터링
void io_multiplexing_concept() {
    fd_set readfds, writefds;
    int max_fd = 0;
    
    // 모니터링할 소켓들 등록
    FD_ZERO(&readfds);
    for (int i = 0; i < num_clients; i++) {
        FD_SET(clients[i].fd, &readfds);
        if (clients[i].fd > max_fd) {
            max_fd = clients[i].fd;
        }
    }
    
    // 한 번의 시스템 콜로 모든 소켓 확인
    int ready = select(max_fd + 1, &readfds, &writefds, NULL, NULL);
    
    // 준비된 소켓들만 처리
    for (int i = 0; i < num_clients && ready > 0; i++) {
        if (FD_ISSET(clients[i].fd, &readfds)) {
            handle_read(clients[i].fd);
            ready--;
        }
    }
}
```

## 핵심 요점

### 1. 비동기 I/O의 본질

- **블로킹 제거**: 하나의 느린 연결이 전체를 막지 않음
- **효율적 대기**: CPU를 낭비하지 않고 준비된 작업만 처리
- **확장성**: 메모리 사용량이 연결 수에 선형적으로 증가하지 않음

### 2. C10K 문제의 교훈

- 하드웨어 성능만으로는 부족
- 소프트웨어 아키텍처가 결정적
- 동시성 모델의 선택이 성능에 직접적 영향

### 3. 이벤트 기반 프로그래밍의 장점

- **메모리 효율성**: 스레드 스택 오버헤드 제거
- **CPU 효율성**: 컨텍스트 스위칭 최소화  
- **확장성**: 수십만 동시 연결 처리 가능

---

**이전**: [Chapter 6-4 개요](04-async-io.md)  
**다음**: [I/O 멀티플렉싱의 진화](04b-io-multiplexing-evolution.md)에서 select, poll, epoll의 발전 과정을 학습합니다.
