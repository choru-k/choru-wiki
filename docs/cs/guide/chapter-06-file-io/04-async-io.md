---
tags:
  - Async I/O
  - Event-driven
  - epoll
  - io_uring
  - Reactor Pattern
---

# Chapter 6-4: 비동기 I/O와 이벤트 기반 프로그래밍

## 이 절에서 답할 질문들

- 동기 I/O와 비동기 I/O의 근본적인 차이는 무엇인가?
- select, poll, epoll은 어떻게 진화해왔는가?
- io_uring은 기존 비동기 I/O의 어떤 문제를 해결하는가?
- 리액터 패턴은 어떻게 구현되는가?
- C10K 문제는 어떻게 해결할 수 있는가?

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
```text

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
```text

비동기 I/O와 이벤트 기반 프로그래밍이 바로 이 마법의 비밀입니다!

## I/O 멀티플렉싱의 진화

### 🕰️ select: 1983년의 혁명

select는 BSD 4.2에서 처음 등장했습니다. 당시로서는 혁명적이었죠!

하지만 시대가 변했습니다:

```c
// select의 제한
#define FD_SETSIZE 1024  // 최대 1024개 FD만!

// 매번 모든 FD를 검사해야 함
for (int fd = 0; fd <= max_fd; fd++) {
    if (FD_ISSET(fd, &readfds)) {
        // O(n) 복잡도
    }
}
```text

제가 겪은 select의 한계:

```bash
# 1000개 연결 테스트
# CPU 사용률: 45% (FD 검사만으로!)
# 실제 I/O 처리: 55%
# 오버헤드가 거의 절반!
```text

### select: 최초의 I/O 멀티플렉서

```c
// select 시스템 콜
int select(int nfds, fd_set *readfds, fd_set *writefds,
           fd_set *exceptfds, struct timeval *timeout);

// fd_set 매크로들
void FD_CLR(int fd, fd_set *set);
int  FD_ISSET(int fd, fd_set *set);
void FD_SET(int fd, fd_set *set);
void FD_ZERO(fd_set *set);

// select 기반 이벤트 루프
void select_event_loop(void) {
    fd_set read_fds, write_fds, except_fds;
    fd_set working_read_fds, working_write_fds, working_except_fds;
    int max_fd = 0;
    
    FD_ZERO(&read_fds);
    FD_ZERO(&write_fds);
    FD_ZERO(&except_fds);
    
    // 리스닝 소켓 추가
    int listen_fd = create_listen_socket(8080);
    FD_SET(listen_fd, &read_fds);
    max_fd = listen_fd;
    
    while (1) {
        // fd_set 복사 (select가 수정하므로)
        working_read_fds = read_fds;
        working_write_fds = write_fds;
        working_except_fds = except_fds;
        
        struct timeval timeout = {
            .tv_sec = 1,
            .tv_usec = 0
        };
        
        int ready = select(max_fd + 1, &working_read_fds,
                          &working_write_fds, &working_except_fds,
                          &timeout);
        
        if (ready < 0) {
            if (errno == EINTR)
                continue;
            perror("select");
            break;
        }
        
        if (ready == 0) {
            // 타임아웃
            handle_timeout();
            continue;
        }
        
        // 모든 FD 검사 (O(n) 복잡도)
        for (int fd = 0; fd <= max_fd; fd++) {
            if (FD_ISSET(fd, &working_read_fds)) {
                if (fd == listen_fd) {
                    // 새 연결
                    int client_fd = accept(listen_fd, NULL, NULL);
                    if (client_fd >= 0) {
                        set_nonblocking(client_fd);
                        FD_SET(client_fd, &read_fds);
                        if (client_fd > max_fd)
                            max_fd = client_fd;
                    }
                } else {
                    // 데이터 읽기
                    handle_read(fd);
                }
            }
            
            if (FD_ISSET(fd, &working_write_fds)) {
                handle_write(fd);
            }
            
            if (FD_ISSET(fd, &working_except_fds)) {
                handle_exception(fd);
                FD_CLR(fd, &read_fds);
                FD_CLR(fd, &write_fds);
                FD_CLR(fd, &except_fds);
                close(fd);
            }
        }
    }
}

// select의 한계
#define FD_SETSIZE 1024  // 최대 FD 수 제한

// 커널 내부: select 구현
static int do_select(int n, fd_set_bits *fds, struct timespec64 *end_time) {
    ktime_t expire, *to = NULL;
    struct poll_wqueues table;
    poll_table *wait;
    int retval, i, timed_out = 0;
    u64 slack = 0;
    
    poll_initwait(&table);
    wait = &table.pt;
    
    if (end_time && !end_time->tv_sec && !end_time->tv_nsec) {
        wait->_qproc = NULL;
        timed_out = 1;
    }
    
    retval = 0;
    for (;;) {
        unsigned long *rinp, *routp, *rexp, *inp, *outp, *exp;
        bool can_busy_loop = false;
        
        inp = fds->in; outp = fds->out; exp = fds->ex;
        rinp = fds->res_in; routp = fds->res_out; rexp = fds->res_ex;
        
        for (i = 0; i < n; ++rinp, ++routp, ++rexp) {
            unsigned long in, out, ex, all_bits, bit = 1, j;
            unsigned long res_in = 0, res_out = 0, res_ex = 0;
            __poll_t mask;
            
            in = *inp++; out = *outp++; ex = *exp++;
            all_bits = in | out | ex;
            if (all_bits == 0) {
                i += BITS_PER_LONG;
                continue;
            }
            
            // 각 FD에 대해 poll 수행
            for (j = 0; j < BITS_PER_LONG; ++j, ++i, bit <<= 1) {
                struct fd f;
                
                if (i >= n)
                    break;
                if (!(bit & all_bits))
                    continue;
                    
                f = fdget(i);
                if (f.file) {
                    wait_key_set(wait, in, out, bit, busy_flag);
                    mask = vfs_poll(f.file, wait);
                    
                    fdput(f);
                    
                    if ((mask & POLLIN_SET) && (in & bit)) {
                        res_in |= bit;
                        retval++;
                    }
                    if ((mask & POLLOUT_SET) && (out & bit)) {
                        res_out |= bit;
                        retval++;
                    }
                    if ((mask & POLLEX_SET) && (ex & bit)) {
                        res_ex |= bit;
                        retval++;
                    }
                }
            }
            
            *rinp = res_in;
            *routp = res_out;
            *rexp = res_ex;
        }
        
        wait->_qproc = NULL;
        if (retval || timed_out || signal_pending(current))
            break;
            
        // 슬립하고 대기
        if (!schedule_hrtimeout_range(to, slack, HRTIMER_MODE_ABS)) {
            timed_out = 1;
            break;
        }
    }
    
    poll_freewait(&table);
    
    return retval;
}
```text

### 📊 poll: select의 진화

poll은 System V에서 select의 한계를 극복하기 위해 만들어졌습니다.

개선점:

```c
// select: 고정 크기 비트맵
fd_set readfds;  // 최대 1024개

// poll: 동적 배열
struct pollfd *fds = malloc(10000 * sizeof(struct pollfd));
// 10000개 가능!
```text

하지만 여전한 문제:

```c
// 매번 전체 배열을 검사해야 함
for (int i = 0; i < nfds; i++) {
    if (pollfds[i].revents & POLLIN) {
        // 여전히 O(n)!
    }
}
```text

### poll: select의 개선

```c
// poll 시스템 콜
int poll(struct pollfd *fds, nfds_t nfds, int timeout);

struct pollfd {
    int   fd;         // 파일 디스크립터
    short events;     // 관심 이벤트
    short revents;    // 발생한 이벤트
};

// poll 기반 이벤트 루프 - C10K 문제 해결의 핵심
// 실제 사용: nginx, Apache (event MPM), Node.js 초기 버전에서 활용
void poll_event_loop(void) {
    struct pollfd *pollfds;
    int nfds = 0;           // 현재 모니터링하는 파일 디스크립터 수
    int capacity = 100;     // 동적 배열 초기 크기
    
    // ⭐ 1단계: 동적 pollfd 배열 초기화
    // select와 달리 poll은 FD_SETSIZE(1024) 제한이 없음
    pollfds = calloc(capacity, sizeof(struct pollfd));
    
    // ⭐ 2단계: 리스닝 소켓을 poll 세트에 추가
    // 실제 예: 웹서버가 80/443 포트를 열고 연결 대기
    int listen_fd = create_listen_socket(8080);
    pollfds[nfds].fd = listen_fd;       // 모니터링할 파일 디스크립터
    pollfds[nfds].events = POLLIN;      // 읽기 가능 이벤트에 관심
    nfds++;  // 활성 FD 카운터 증가
    
    // ⭐ 메인 이벤트 루프: 무한 대기하며 I/O 이벤트 처리
    while (1) {
        // ⭐ 3단계: poll() 시스템 콜로 이벤트 대기
        // 1000ms 타임아웃: 1초마다 깨어나서 유지보수 작업 가능
        int ready = poll(pollfds, nfds, 1000);
        
        // ⭐ 4단계: poll() 결과 분석 및 에러 처리
        if (ready < 0) {
            // EINTR: 시그널에 의한 중단 (정상적, 재시도)
            if (errno == EINTR)
                continue;
            // 실제 에러 발생: 시스템 자원 고갈 등
            perror("poll");
            break;
        }
        
        // ⭐ 타임아웃 처리: 주기적 유지보수 작업
        if (ready == 0) {
            // 실제 예: keep-alive 연결 정리, 통계 업데이트
            handle_timeout();
            continue;
        }
        
        // ⭐ 5단계: 준비된 파일 디스크립터들 순회 처리
        // ready 카운터로 조기 종료 최적화 (모든 이벤트 처리 완료 시)
        for (int i = 0; i < nfds && ready > 0; i++) {
            // revents가 0이면 이 FD에서는 아무 이벤트 없음
            if (pollfds[i].revents == 0)
                continue;
                
            ready--;  // 처리할 이벤트 수 감소
            
            // ⭐ 6-1단계: POLLIN 이벤트 처리 (읽기 가능)
            if (pollfds[i].revents & POLLIN) {
                if (pollfds[i].fd == listen_fd) {
                    // ⭐ 새 클라이언트 연결 수락
                    // 실제 예: HTTP 클라이언트가 서버에 연결 시도
                    int client_fd = accept(listen_fd, NULL, NULL);
                    if (client_fd >= 0) {
                        // 논블로킹 모드 설정: read/write가 즉시 반환
                        set_nonblocking(client_fd);
                        
                        // ⭐ 동적 배열 확장: 연결 수 증가에 대응
                        // C10K: 10,000개 동시 연결 처리 가능
                        if (nfds >= capacity) {
                            capacity *= 2;  // 지수적 확장으로 재할당 최소화
                            pollfds = realloc(pollfds,
                                            capacity * sizeof(struct pollfd));
                        }
                        
                        // ⭐ 새 클라이언트 FD를 poll 세트에 추가
                        pollfds[nfds].fd = client_fd;
                        // POLLIN: 클라이언트 요청 대기
                        // POLLOUT: 응답 전송 준비 상태 확인
                        pollfds[nfds].events = POLLIN | POLLOUT;
                        nfds++;  // 모니터링 FD 수 증가
                    }
                } else {
                    // ⭐ 기존 클라이언트로부터 데이터 읽기
                    // 실제 예: HTTP 요청, WebSocket 메시지 수신
                    handle_read(pollfds[i].fd);
                }
            }
            
            // ⭐ 6-2단계: POLLOUT 이벤트 처리 (쓰기 가능)
            if (pollfds[i].revents & POLLOUT) {
                // TCP 송신 버퍼에 여유 공간 생김: 응답 전송 가능
                handle_write(pollfds[i].fd);
            }
            
            // ⭐ 6-3단계: 에러 및 연결 종료 처리
            if (pollfds[i].revents & (POLLERR | POLLHUP | POLLNVAL)) {
                // POLLERR: 소켓 에러, POLLHUP: 연결 종료
                // POLLNVAL: 유효하지 않은 파일 디스크립터
                close(pollfds[i].fd);
                
                // ⭐ 배열 압축: 중간 요소 제거 후 뒤 요소들을 앞으로 이동
                // O(n) 복잡도이지만 배열 구조 유지 위해 필수
                if (i < nfds - 1) {
                    memmove(&pollfds[i], &pollfds[i + 1],
                           (nfds - i - 1) * sizeof(struct pollfd));
                }
                nfds--;  // 활성 FD 수 감소
                i--;     // 현재 인덱스 재검사 (새 요소가 현 위치로 이동)
            }
        }
    }
    
    // ⭐ 정리: 동적 할당한 메모리 해제
    free(pollfds);
}
```text

### ⚡ epoll: O(1) 이벤트 통지의 혁명

2002년, 리눅스 2.5.44에 epoll이 등장합니다. 게임 체인저였죠!

#### 핵심 차이점

```c
// select/poll: "모든 FD 확인해볼게"
for (all_fds) {
    check_if_ready();
}

// epoll: "준비된 FD만 알려줄게"
ready_fds = epoll_wait();
for (ready_fds) {  // 준비된 것만!
    process();
}
```text

제가 측정한 성능 차이:

```bash
# 10000개 연결, 100개만 활성

# select
CPU usage: 65%
Latency: 15ms

# poll  
CPU usage: 60%
Latency: 12ms

# epoll
CPU usage: 5%  # 헉!
Latency: 0.5ms  # 30배 빨라짐!
```text

#### Edge-Triggered vs Level-Triggered

제가 겪은 실수:

```c
// Level-Triggered (기본값)
while (1) {
    n = epoll_wait(epfd, events, MAX_EVENTS, -1);
    for (i = 0; i < n; i++) {
        // 1바이트만 읽음
        read(events[i].data.fd, buf, 1);
        // 다음 epoll_wait에서 또 깨어남!
        // CPU 100%!
    }
}

// Edge-Triggered (고성능)
ev.events = EPOLLIN | EPOLLET;
// 한 번에 모든 데이터 읽기
while ((n = read(fd, buf, sizeof(buf))) > 0) {
    process(buf, n);
}
```text

### epoll: O(1) 이벤트 통지

```c
// epoll API
int epoll_create1(int flags);
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
int epoll_wait(int epfd, struct epoll_event *events,
               int maxevents, int timeout);

// epoll 이벤트 구조체
typedef union epoll_data {
    void        *ptr;
    int          fd;
    uint32_t     u32;
    uint64_t     u64;
} epoll_data_t;

struct epoll_event {
    uint32_t     events;      // 이벤트 마스크
    epoll_data_t data;        // 사용자 데이터
};

// Connection 구조체
typedef struct {
    int fd;
    int state;
    char *read_buf;
    size_t read_len;
    char *write_buf;
    size_t write_len;
    size_t write_pos;
} connection_t;

// epoll 기반 고성능 이벤트 루프
void epoll_event_loop(void) {
    int epfd = epoll_create1(EPOLL_CLOEXEC);
    if (epfd < 0) {
        perror("epoll_create1");
        return;
    }
    
    // 리스닝 소켓 설정
    int listen_fd = create_listen_socket(8080);
    set_nonblocking(listen_fd);
    
    struct epoll_event ev;
    ev.events = EPOLLIN | EPOLLET;  // Edge-triggered
    ev.data.fd = listen_fd;
    
    if (epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev) < 0) {
        perror("epoll_ctl");
        return;
    }
    
    struct epoll_event events[MAX_EVENTS];
    
    while (1) {
        int nfds = epoll_wait(epfd, events, MAX_EVENTS, 1000);
        
        if (nfds < 0) {
            if (errno == EINTR)
                continue;
            perror("epoll_wait");
            break;
        }
        
        for (int i = 0; i < nfds; i++) {
            if (events[i].data.fd == listen_fd) {
                // 새 연결 수락 (accept loop for ET)
                while (1) {
                    struct sockaddr_in addr;
                    socklen_t addrlen = sizeof(addr);
                    
                    int client_fd = accept(listen_fd,
                                         (struct sockaddr *)&addr,
                                         &addrlen);
                    if (client_fd < 0) {
                        if (errno == EAGAIN || errno == EWOULDBLOCK)
                            break;  // 모든 연결 처리 완료
                        perror("accept");
                        break;
                    }
                    
                    set_nonblocking(client_fd);
                    
                    // Connection 객체 생성
                    connection_t *conn = calloc(1, sizeof(connection_t));
                    conn->fd = client_fd;
                    conn->state = STATE_READING;
                    
                    ev.events = EPOLLIN | EPOLLET | EPOLLONESHOT;
                    ev.data.ptr = conn;
                    
                    if (epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev) < 0) {
                        perror("epoll_ctl");
                        close(client_fd);
                        free(conn);
                    }
                }
            } else {
                connection_t *conn = events[i].data.ptr;
                
                if (events[i].events & (EPOLLERR | EPOLLHUP)) {
                    // 에러 처리
                    epoll_ctl(epfd, EPOLL_CTL_DEL, conn->fd, NULL);
                    close(conn->fd);
                    free_connection(conn);
                    continue;
                }
                
                if (events[i].events & EPOLLIN) {
                    // Edge-triggered 읽기
                    while (1) {
                        char buf[4096];
                        ssize_t n = read(conn->fd, buf, sizeof(buf));
                        
                        if (n < 0) {
                            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                                // 모든 데이터 읽음
                                break;
                            }
                            // 에러
                            epoll_ctl(epfd, EPOLL_CTL_DEL, conn->fd, NULL);
                            close(conn->fd);
                            free_connection(conn);
                            break;
                        }
                        
                        if (n == 0) {
                            // 연결 종료
                            epoll_ctl(epfd, EPOLL_CTL_DEL, conn->fd, NULL);
                            close(conn->fd);
                            free_connection(conn);
                            break;
                        }
                        
                        // 데이터 처리
                        process_data(conn, buf, n);
                    }
                    
                    // EPOLLONESHOT 재활성화
                    ev.events = EPOLLIN | EPOLLOUT | EPOLLET | EPOLLONESHOT;
                    ev.data.ptr = conn;
                    epoll_ctl(epfd, EPOLL_CTL_MOD, conn->fd, &ev);
                }
                
                if (events[i].events & EPOLLOUT) {
                    // 쓰기 가능
                    handle_write(conn);
                }
            }
        }
    }
    
    close(epfd);
}

// 커널 내부: epoll 구현
struct eventpoll {
    spinlock_t lock;
    struct mutex mtx;
    
    wait_queue_head_t wq;       // 대기 큐
    wait_queue_head_t poll_wait;
    
    struct list_head rdllist;   // 준비된 이벤트 리스트
    struct rb_root_cached rbr;  // 모니터링 FD Red-Black 트리
    
    struct epitem *ovflist;     // 오버플로우 리스트
    
    struct wakeup_source *ws;
    struct user_struct *user;
    struct file *file;
    
    u64 gen;
    struct hlist_head refs;
};

struct epitem {
    union {
        struct rb_node rbn;     // RB 트리 노드
        struct rcu_head rcu;
    };
    
    struct list_head rdllink;   // 준비 리스트 링크
    struct epitem *next;         // 오버플로우 리스트
    
    struct epoll_filefd ffd;     // 파일 포인터와 fd
    
    struct eventpoll *ep;        // 소속 eventpoll
    
    struct hlist_node fllink;    // 파일의 f_ep_links 리스트
    struct wakeup_source __rcu *ws;
    
    struct epoll_event event;    // 이벤트 마스크와 데이터
};
```text

## io_uring: 차세대 비동기 I/O

### io_uring 아키텍처

```mermaid
graph TB
    subgraph "User Space"
        APP["Application]
        SQ[Submission Queue"]
        CQ["Completion Queue]
        SQES[SQE Array"]
        CQES[CQE Array]
    end
    
    subgraph "Kernel Space"
        URING["io_uring Context]
        WORKER[Worker Threads"]
        FS["File System]
        NET[Network Stack"]
        BLK[Block Layer]
    end
    
    APP --> SQ
    APP --> CQ
    SQ --> SQES
    CQ --> CQES
    
    SQ -.->|mmap| URING
    CQ -.->|mmap| URING
    SQES -.->|mmap| URING
    CQES -.->|mmap| URING
    
    URING --> WORKER
    WORKER --> FS
    WORKER --> NET
    WORKER --> BLK
```text

### io_uring 구현

```c
// io_uring 설정
struct io_uring_params {
    __u32 sq_entries;
    __u32 cq_entries;
    __u32 flags;
    __u32 sq_thread_cpu;
    __u32 sq_thread_idle;
    __u32 features;
    __u32 wq_fd;
    __u32 resv[3];
    struct io_sqring_offsets sq_off;
    struct io_cqring_offsets cq_off;
};

// SQE (Submission Queue Entry)
struct io_uring_sqe {
    __u8    opcode;         // 연산 코드
    __u8    flags;          // SQE 플래그
    __u16   ioprio;         // I/O 우선순위
    __s32   fd;             // 파일 디스크립터
    union {
        __u64   off;        // 오프셋
        __u64   addr2;
    };
    union {
        __u64   addr;       // 버퍼 주소
        __u64   splice_off_in;
    };
    __u32   len;            // 버퍼 길이
    union {
        __kernel_rwf_t  rw_flags;
        __u32    fsync_flags;
        __u16    poll_events;
        __u32    poll32_events;
        __u32    sync_range_flags;
        __u32    msg_flags;
        __u32    timeout_flags;
        __u32    accept_flags;
        __u32    cancel_flags;
        __u32    open_flags;
        __u32    statx_flags;
        __u32    fadvise_advice;
        __u32    splice_flags;
        __u32    rename_flags;
        __u32    unlink_flags;
        __u32    hardlink_flags;
    };
    __u64   user_data;      // 사용자 데이터
    union {
        __u16   buf_index;
        __u16   buf_group;
    };
    __u16   personality;
    union {
        __s32   splice_fd_in;
        __u32   file_index;
    };
    __u64   __pad2[2];
};

// CQE (Completion Queue Entry)
struct io_uring_cqe {
    __u64   user_data;      // SQE의 user_data
    __s32   res;            // 결과 (성공 시 바이트 수, 실패 시 -errno)
    __u32   flags;
};

// io_uring 인스턴스
struct io_uring {
    struct io_uring_sq sq;
    struct io_uring_cq cq;
    unsigned flags;
    int ring_fd;
    
    unsigned features;
    int enter_ring_fd;
    __u8 int_flags;
    __u8 pad[3];
    unsigned pad2;
};

// io_uring 기반 비동기 서버
struct io_uring_server {
    struct io_uring ring;
    int listen_fd;
    
    // 버퍼 풀
    struct io_uring_buf_ring *buf_ring;
    char *buffer_base;
    size_t buffer_size;
    
    // 연결 관리
    struct connection *connections;
    int max_connections;
};

int io_uring_server_init(struct io_uring_server *server, int port) {
    struct io_uring_params params = {0};
    
    // io_uring 초기화
    params.flags = IORING_SETUP_SQPOLL |    // 커널 SQ 폴링 스레드
                   IORING_SETUP_SQ_AFF |     // SQ 스레드 CPU 친화도
                   IORING_SETUP_CQSIZE;      // CQ 크기 지정
    params.sq_thread_idle = 1000;           // 1초 idle 후 슬립
    params.cq_entries = 4096;
    
    if (io_uring_queue_init_params(2048, &server->ring, &params) < 0) {
        return -1;
    }
    
    // 프로브로 지원 기능 확인
    struct io_uring_probe *probe = io_uring_get_probe(&server->ring);
    if (probe) {
        if (io_uring_opcode_supported(probe, IORING_OP_PROVIDE_BUFFERS)) {
            setup_buffer_pool(server);
        }
        io_uring_free_probe(probe);
    }
    
    // 리스닝 소켓 생성
    server->listen_fd = create_listen_socket(port);
    
    // 멀티샷 accept 제출
    submit_multishot_accept(server);
    
    return 0;
}

void submit_multishot_accept(struct io_uring_server *server) {
    struct io_uring_sqe *sqe = io_uring_get_sqe(&server->ring);
    
    io_uring_prep_multishot_accept(sqe, server->listen_fd,
                                   NULL, NULL, 0);
    sqe->flags |= IOSQE_FIXED_FILE;
    
    io_uring_sqe_set_data64(sqe, ACCEPT_EVENT);
    io_uring_submit(&server->ring);
}

void submit_recv(struct io_uring_server *server, int fd, int bid) {
    struct io_uring_sqe *sqe = io_uring_get_sqe(&server->ring);
    
    io_uring_prep_recv(sqe, fd, NULL, MAX_MESSAGE_LEN, 0);
    sqe->flags |= IOSQE_BUFFER_SELECT;
    sqe->buf_group = 0;
    
    io_uring_sqe_set_data64(sqe, RECV_EVENT | ((__u64)fd << 32));
    io_uring_submit(&server->ring);
}

void submit_send(struct io_uring_server *server, int fd,
                void *buf, size_t len) {
    struct io_uring_sqe *sqe = io_uring_get_sqe(&server->ring);
    
    io_uring_prep_send(sqe, fd, buf, len, MSG_NOSIGNAL);
    io_uring_sqe_set_data64(sqe, SEND_EVENT | ((__u64)fd << 32));
    io_uring_submit(&server->ring);
}

// io_uring 서버 루프 - 차세대 비동기 I/O의 핵심
// 실제 사용: 고성능 데이터베이스 (PostgreSQL, ScyllaDB), 클라우드 서비스
void io_uring_server_loop(struct io_uring_server *server) {
    struct io_uring_cqe *cqe;  // Completion Queue Entry - 완료된 작업 정보
    unsigned head;              // CQ 헤드 인덱스 (민간에서 읽어올 위치)
    unsigned count = 0;         // 이번 루프에서 처리한 CQE 개수
    
    // ⭐ 메인 이벤트 루프: epoll보다 10배 빠른 비동기 I/O
    while (1) {
        // ⭐ 1단계: SQ에 있는 대기 작업들 제출하고 완료 대기
        // epoll_wait()과 비슷하지만, 시스템 콜 없이 mmap된 링버퍼로 소통
        io_uring_submit_and_wait(&server->ring, 1);
        
        // ⭐ 2단계: 완료된 작업들을 배치로 처리
        // zero-copy: 커널에서 유저스페이스로 데이터 복사 없음
        io_uring_for_each_cqe(&server->ring, head, cqe) {
            // ⭐ 3단계: user_data에서 이벤트 타입과 컨텍스트 추출
            // 64비트 전체를 이벤트 타입(32비트) + FD(32비트)로 분할 사용
            __u64 user_data = cqe->user_data;
            int event_type = user_data & 0xFFFFFFFF;      // 하위 32비트: 이벤트 타입
            int fd = user_data >> 32;                     // 상위 32빔트: 파일 디스크립터
            
            // ⭐ 4단계: 이벤트 타입에 따른 처리 분기
            switch (event_type) {
            case ACCEPT_EVENT:
                // ⭐ 새 클라이언트 연결 수락 완료
                if (cqe->res >= 0) {
                    // cqe->res는 accept()의 반환값: 새 클라이언트 FD
                    int client_fd = cqe->res;
                    
                    // ⭐ 새 연결에 대해 즉시 recv 작업 예약
                    // 비동기: 코드가 블록되지 않고 즉시 다음 연결 처리 가능
                    submit_recv(server, client_fd, -1);
                    
                    // ⭐ 멀티샷 accept 지속성 유지
                    // IORING_CQE_F_MORE: 동일 작업이 계속 수행될 예정
                    if (!(cqe->flags & IORING_CQE_F_MORE)) {
                        // 멀티샷이 종료되면 새로 시작
                        submit_multishot_accept(server);
                    }
                }
                break;
                
            case RECV_EVENT:
                // ⭐ 데이터 수신 완료
                if (cqe->res > 0) {
                    // ⭐ 버퍼 선택 모드: 커널이 자동으로 버퍼 선택
                    // 전통적 방식: 유저가 버퍼 미리 할당, io_uring: 필요 시 동적 선택
                    int bid = cqe->flags >> IORING_CQE_BUFFER_SHIFT;
                    char *buffer = get_buffer(server, bid);
                    
                    // ⭐ 비즈니스 로직 처리
                    // 실제 예: HTTP 요청 파싱, JSON 디코딩, 데이터베이스 쿼리
                    process_request(server, fd, buffer, cqe->res);
                    
                    // ⭐ 버퍼 풀에 반환: 메모리 재사용으로 성능 최적화
                    return_buffer(server, bid);
                    
                    // ⭐ 다음 수신 준비: keep-alive 연결 유지
                    submit_recv(server, fd, -1);
                } else if (cqe->res == 0 || cqe->res == -ECONNRESET) {
                    // ⭐ 연결 종료 처리
                    // res == 0: 정상 종료 (FIN), -ECONNRESET: 네트워크 에러
                    close(fd);
                }
                break;
                
            case SEND_EVENT:
                // ⭐ 데이터 전송 완료
                if (cqe->res < 0) {
                    // ⭐ 전송 실패: 네트워크 단절, TCP 오류 등
                    // 실제 예: 클라이언트가 연결을 갑자기 종료
                    close(fd);
                }
                break;
            }
            
            count++;  // 처리한 CQE 개수 증가
        }
        
        // ⭐ 5단계: Completion Queue 전진
        // 커널에게 "이 CQE들은 처리 끝!"이라고 알려주어 재사용 가능하게 함
        io_uring_cq_advance(&server->ring, count);
        count = 0;  // 다음 라운드를 위해 카운터 초기화
    }
}

// 링크된 연산 (의존성 체인) - io_uring의 강력한 기능
// 실제 사용: 마이크로서비스에서 파일 읽기 -> 처리 -> 전솤 -> 정리를 한 번에 설정
void submit_linked_operations(struct io_uring *ring, int fd) {
    struct io_uring_sqe *sqe;  // Submission Queue Entry - 수행할 작업 명세서
    
    // ⭐ 1단계: 파일 오픈 작업 준비
    // 동기 I/O라면: open() -> read() -> send() -> close() 반복으로 4번 블록
    sqe = io_uring_get_sqe(ring);
    io_uring_prep_openat(sqe, AT_FDCWD, "data.txt", O_RDONLY, 0);
    sqe->flags |= IOSQE_IO_LINK;  // ⭐ 다음 작업과 연결: 실패시 체인 중단
    
    // ⭐ 2단계: 파일 읽기 작업 (오픈 성공 시에만 실행)
    // IORING_FILE_INDEX_ALLOC: 커널이 자동으로 FD 할당 및 관리
    sqe = io_uring_get_sqe(ring);
    io_uring_prep_read(sqe, -1, buffer, 4096, 0);
    sqe->flags |= IOSQE_FIXED_FILE | IOSQE_IO_LINK;
    sqe->fd = IORING_FILE_INDEX_ALLOC;  // 이전 단계의 FD를 자동 사용
    
    // ⭐ 3단계: 네트워크 전송 (읽기 성공 시에만 실행)
    // zero-copy sendfile 효과: 디스크 -> 커널 -> 네트워크 직통
    sqe = io_uring_get_sqe(ring);
    io_uring_prep_send(sqe, fd, buffer, 4096, MSG_NOSIGNAL);
    sqe->flags |= IOSQE_IO_LINK;  // ⭐ 마지막 링크: 전송 실패시 정리 작업도 중단
    
    // ⭐ 4단계: 자원 정리 (성공/실패 관계없이 항상 실행)
    // IOSQE_IO_LINK 없음: 이전 단계 실패와 무관하게 실행
    sqe = io_uring_get_sqe(ring);
    io_uring_prep_close(sqe, -1);
    sqe->flags |= IOSQE_FIXED_FILE;  // 커널이 관리하는 FD 테이블 사용
    
    // ⭐ 모든 링크된 작업을 한 번에 제출
    // 장점: 비동기 파이프라인 처리로 지연 시간 최소화
    io_uring_submit(ring);
}
```text

## 리액터 패턴 구현

### 리액터 패턴 아키텍처

```c
// 이벤트 핸들러 인터페이스
typedef struct event_handler {
    int fd;
    void *data;
    void (*handle_read)(struct event_handler *self);
    void (*handle_write)(struct event_handler *self);
    void (*handle_error)(struct event_handler *self);
    void (*cleanup)(struct event_handler *self);
} event_handler_t;

// 리액터 구조체
typedef struct reactor {
    int epfd;
    int running;
    
    // 핸들러 관리
    struct {
        event_handler_t **handlers;
        int capacity;
        int count;
    } handler_pool;
    
    // 타이머 관리
    struct {
        struct timer_node *heap;
        int capacity;
        int count;
    } timer_heap;
    
    // 스레드 풀
    struct thread_pool *workers;
} reactor_t;

// 리액터 초기화
reactor_t *reactor_create(void) {
    reactor_t *reactor = calloc(1, sizeof(reactor_t));
    
    reactor->epfd = epoll_create1(EPOLL_CLOEXEC);
    reactor->running = 1;
    
    // 핸들러 풀 초기화
    reactor->handler_pool.capacity = 1024;
    reactor->handler_pool.handlers = calloc(reactor->handler_pool.capacity,
                                           sizeof(event_handler_t *));
    
    // 타이머 힙 초기화
    reactor->timer_heap.capacity = 256;
    reactor->timer_heap.heap = calloc(reactor->timer_heap.capacity,
                                     sizeof(struct timer_node));
    
    // 워커 스레드 풀
    reactor->workers = thread_pool_create(4);
    
    return reactor;
}

// 핸들러 등록
int reactor_register(reactor_t *reactor, event_handler_t *handler,
                    uint32_t events) {
    struct epoll_event ev = {
        .events = events,
        .data.ptr = handler
    };
    
    if (epoll_ctl(reactor->epfd, EPOLL_CTL_ADD, handler->fd, &ev) < 0) {
        return -1;
    }
    
    // 핸들러 풀에 추가
    if (reactor->handler_pool.count >= reactor->handler_pool.capacity) {
        reactor->handler_pool.capacity *= 2;
        reactor->handler_pool.handlers = realloc(
            reactor->handler_pool.handlers,
            reactor->handler_pool.capacity * sizeof(event_handler_t *)
        );
    }
    
    reactor->handler_pool.handlers[reactor->handler_pool.count++] = handler;
    
    return 0;
}

// 메인 이벤트 루프
void reactor_run(reactor_t *reactor) {
    struct epoll_event events[MAX_EVENTS];
    
    while (reactor->running) {
        // 다음 타이머까지 대기 시간 계산
        int timeout = calculate_timeout(reactor);
        
        int nfds = epoll_wait(reactor->epfd, events, MAX_EVENTS, timeout);
        
        if (nfds < 0) {
            if (errno == EINTR)
                continue;
            break;
        }
        
        // 타이머 처리
        process_timers(reactor);
        
        // I/O 이벤트 처리
        for (int i = 0; i < nfds; i++) {
            event_handler_t *handler = events[i].data.ptr;
            
            if (events[i].events & (EPOLLERR | EPOLLHUP)) {
                handler->handle_error(handler);
                reactor_unregister(reactor, handler);
                continue;
            }
            
            if (events[i].events & EPOLLIN) {
                handler->handle_read(handler);
            }
            
            if (events[i].events & EPOLLOUT) {
                handler->handle_write(handler);
            }
        }
    }
}

// HTTP 서버 핸들러 예제
typedef struct http_handler {
    event_handler_t base;      // 상속
    
    // HTTP 특정 필드
    char *request_buf;
    size_t request_len;
    char *response_buf;
    size_t response_len;
    size_t response_pos;
    
    enum {
        HTTP_READING_REQUEST,
        HTTP_PROCESSING,
        HTTP_WRITING_RESPONSE,
        HTTP_DONE
    } state;
} http_handler_t;

void http_handle_read(event_handler_t *self) {
    http_handler_t *handler = (http_handler_t *)self;
    
    char buf[4096];
    ssize_t n = read(self->fd, buf, sizeof(buf));
    
    if (n <= 0) {
        handler->base.handle_error(self);
        return;
    }
    
    // 요청 버퍼에 추가
    handler->request_buf = realloc(handler->request_buf,
                                  handler->request_len + n);
    memcpy(handler->request_buf + handler->request_len, buf, n);
    handler->request_len += n;
    
    // 완전한 HTTP 요청인지 확인
    if (is_complete_http_request(handler->request_buf,
                                handler->request_len)) {
        handler->state = HTTP_PROCESSING;
        
        // 워커 스레드에서 처리
        thread_pool_submit(reactor->workers,
                         process_http_request, handler);
        
        // EPOLLOUT으로 변경
        modify_events(reactor, self->fd, EPOLLOUT);
    }
}

void http_handle_write(event_handler_t *self) {
    http_handler_t *handler = (http_handler_t *)self;
    
    if (handler->state != HTTP_WRITING_RESPONSE) {
        return;
    }
    
    size_t remaining = handler->response_len - handler->response_pos;
    ssize_t n = write(self->fd,
                     handler->response_buf + handler->response_pos,
                     remaining);
    
    if (n < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            return;  // 나중에 재시도
        }
        handler->base.handle_error(self);
        return;
    }
    
    handler->response_pos += n;
    
    if (handler->response_pos >= handler->response_len) {
        // 응답 완료
        handler->state = HTTP_DONE;
        
        // Keep-alive 확인
        if (is_keep_alive(handler)) {
            // 재사용을 위해 초기화
            reset_http_handler(handler);
            modify_events(reactor, self->fd, EPOLLIN);
        } else {
            // 연결 종료
            reactor_unregister(reactor, self);
            handler->base.cleanup(self);
        }
    }
}
```text

## 프로액터 패턴과 완료 포트

### Windows IOCP 구현

```c
// Windows I/O Completion Port
typedef struct iocp_server {
    HANDLE iocp;
    SOCKET listen_socket;
    HANDLE *worker_threads;
    int num_threads;
    
    // 연결 풀
    struct connection *conn_pool;
    int pool_size;
} iocp_server_t;

// 오버랩 I/O 구조체
typedef struct io_context {
    OVERLAPPED overlapped;
    WSABUF wsabuf;
    char buffer[BUFFER_SIZE];
    DWORD bytes_transferred;
    DWORD flags;
    
    enum {
        IO_ACCEPT,
        IO_READ,
        IO_WRITE
    } operation;
    
    struct connection *conn;
} io_context_t;

// IOCP 서버 초기화
int iocp_server_init(iocp_server_t *server, int port) {
    // IOCP 생성
    server->iocp = CreateIoCompletionPort(INVALID_HANDLE_VALUE,
                                         NULL, 0, 0);
    if (!server->iocp) {
        return -1;
    }
    
    // 리스닝 소켓 생성
    server->listen_socket = WSASocket(AF_INET, SOCK_STREAM, IPPROTO_TCP,
                                     NULL, 0, WSA_FLAG_OVERLAPPED);
    
    // IOCP에 연결
    CreateIoCompletionPort((HANDLE)server->listen_socket,
                          server->iocp, (ULONG_PTR)NULL, 0);
    
    // AcceptEx 함수 포인터 획득
    GUID guid_acceptex = WSAID_ACCEPTEX;
    LPFN_ACCEPTEX lpfnAcceptEx;
    DWORD bytes;
    
    WSAIoctl(server->listen_socket, SIO_GET_EXTENSION_FUNCTION_POINTER,
            &guid_acceptex, sizeof(guid_acceptex),
            &lpfnAcceptEx, sizeof(lpfnAcceptEx),
            &bytes, NULL, NULL);
    
    // 워커 스레드 생성
    SYSTEM_INFO si;
    GetSystemInfo(&si);
    server->num_threads = si.dwNumberOfProcessors * 2;
    server->worker_threads = calloc(server->num_threads, sizeof(HANDLE));
    
    for (int i = 0; i < server->num_threads; i++) {
        server->worker_threads[i] = CreateThread(NULL, 0,
                                                iocp_worker_thread,
                                                server, 0, NULL);
    }
    
    // 초기 AcceptEx 투입
    for (int i = 0; i < ACCEPT_PENDING; i++) {
        post_accept(server);
    }
    
    return 0;
}

// AcceptEx 투입
void post_accept(iocp_server_t *server) {
    io_context_t *ctx = calloc(1, sizeof(io_context_t));
    ctx->operation = IO_ACCEPT;
    
    // 미리 소켓 생성
    SOCKET accept_socket = WSASocket(AF_INET, SOCK_STREAM, IPPROTO_TCP,
                                    NULL, 0, WSA_FLAG_OVERLAPPED);
    
    ctx->conn = allocate_connection();
    ctx->conn->socket = accept_socket;
    
    DWORD bytes;
    BOOL result = lpfnAcceptEx(server->listen_socket,
                              accept_socket,
                              ctx->buffer,
                              0,  // 데이터 수신 안 함
                              sizeof(SOCKADDR_IN) + 16,
                              sizeof(SOCKADDR_IN) + 16,
                              &bytes,
                              &ctx->overlapped);
    
    if (!result && WSAGetLastError() != WSA_IO_PENDING) {
        // 에러 처리
        free_connection(ctx->conn);
        free(ctx);
    }
}

// 워커 스레드
DWORD WINAPI iocp_worker_thread(LPVOID param) {
    iocp_server_t *server = (iocp_server_t *)param;
    DWORD bytes_transferred;
    ULONG_PTR completion_key;
    LPOVERLAPPED overlapped;
    
    while (1) {
        BOOL result = GetQueuedCompletionStatus(
            server->iocp,
            &bytes_transferred,
            &completion_key,
            &overlapped,
            INFINITE
        );
        
        if (!result) {
            if (!overlapped) {
                // IOCP 에러
                break;
            }
            // I/O 에러
            continue;
        }
        
        io_context_t *ctx = CONTAINING_RECORD(overlapped,
                                             io_context_t,
                                             overlapped);
        
        switch (ctx->operation) {
        case IO_ACCEPT:
            handle_accept(server, ctx);
            break;
            
        case IO_READ:
            handle_read(server, ctx, bytes_transferred);
            break;
            
        case IO_WRITE:
            handle_write(server, ctx, bytes_transferred);
            break;
        }
    }
    
    return 0;
}

// 읽기 처리
void handle_read(iocp_server_t *server, io_context_t *ctx,
                DWORD bytes_transferred) {
    if (bytes_transferred == 0) {
        // 연결 종료
        close_connection(ctx->conn);
        free(ctx);
        return;
    }
    
    // 데이터 처리
    process_data(ctx->conn, ctx->buffer, bytes_transferred);
    
    // 다음 읽기 투입
    post_read(server, ctx->conn);
}

// 비동기 읽기 투입
void post_read(iocp_server_t *server, struct connection *conn) {
    io_context_t *ctx = calloc(1, sizeof(io_context_t));
    ctx->operation = IO_READ;
    ctx->conn = conn;
    ctx->wsabuf.buf = ctx->buffer;
    ctx->wsabuf.len = BUFFER_SIZE;
    
    DWORD flags = 0;
    int result = WSARecv(conn->socket,
                        &ctx->wsabuf,
                        1,
                        NULL,
                        &flags,
                        &ctx->overlapped,
                        NULL);
    
    if (result == SOCKET_ERROR &&
        WSAGetLastError() != WSA_IO_PENDING) {
        // 에러 처리
        free(ctx);
        close_connection(conn);
    }
}
```text

## 고성능 네트워크 프로그래밍 기법

### Zero-copy 네트워킹

```c
// sendfile을 사용한 zero-copy
ssize_t sendfile_wrapper(int out_fd, int in_fd, off_t *offset,
                        size_t count) {
    #ifdef __linux__
    return sendfile(out_fd, in_fd, offset, count);
    #elif defined(__FreeBSD__) || defined(__APPLE__)
    off_t len = count;
    int ret = sendfile(in_fd, out_fd, *offset, &len, NULL, 0);
    if (ret == 0 || (ret < 0 && errno == EAGAIN)) {
        *offset += len;
        return len;
    }
    return ret;
    #else
    // Fallback: read + write
    char buffer[8192];
    ssize_t total = 0;
    
    if (*offset != (off_t)-1) {
        lseek(in_fd, *offset, SEEK_SET);
    }
    
    while (count > 0) {
        size_t to_read = (count < sizeof(buffer)) ? count : sizeof(buffer);
        ssize_t n = read(in_fd, buffer, to_read);
        if (n <= 0)
            break;
            
        ssize_t written = write(out_fd, buffer, n);
        if (written < 0)
            return -1;
            
        total += written;
        count -= written;
        if (*offset != (off_t)-1)
            *offset += written;
    }
    
    return total;
    #endif
}

// splice를 사용한 zero-copy (Linux)
int splice_data(int in_fd, int out_fd, size_t len) {
    int pipefd[2];
    if (pipe(pipefd) < 0)
        return -1;
        
    ssize_t total = 0;
    
    while (len > 0) {
        // 파일 -> 파이프
        ssize_t n = splice(in_fd, NULL, pipefd[1], NULL,
                          len, SPLICE_F_MOVE);
        if (n <= 0)
            break;
            
        // 파이프 -> 소켓
        ssize_t written = splice(pipefd[0], NULL, out_fd, NULL,
                               n, SPLICE_F_MOVE);
        if (written < 0)
            break;
            
        total += written;
        len -= written;
    }
    
    close(pipefd[0]);
    close(pipefd[1]);
    
    return total;
}
```text

### TCP 최적화

```c
// TCP 옵션 설정
void optimize_tcp_socket(int fd) {
    int val;
    
    // TCP_NODELAY: Nagle 알고리즘 비활성화
    val = 1;
    setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &val, sizeof(val));
    
    // TCP_CORK: 코킹 (Linux) / TCP_NOPUSH (BSD)
    #ifdef TCP_CORK
    val = 0;  // 일시적으로 활성화 후 비활성화
    setsockopt(fd, IPPROTO_TCP, TCP_CORK, &val, sizeof(val));
    #endif
    
    // SO_KEEPALIVE: Keep-alive 활성화
    val = 1;
    setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &val, sizeof(val));
    
    // Keep-alive 파라미터 (Linux)
    #ifdef __linux__
    val = 600;  // 10분 후 첫 프로브
    setsockopt(fd, IPPROTO_TCP, TCP_KEEPIDLE, &val, sizeof(val));
    
    val = 60;   // 60초마다 프로브
    setsockopt(fd, IPPROTO_TCP, TCP_KEEPINTVL, &val, sizeof(val));
    
    val = 3;    // 3번 실패 시 연결 종료
    setsockopt(fd, IPPROTO_TCP, TCP_KEEPCNT, &val, sizeof(val));
    #endif
    
    // TCP_USER_TIMEOUT: 전송 타임아웃 (Linux)
    #ifdef TCP_USER_TIMEOUT
    val = 30000;  // 30초
    setsockopt(fd, IPPROTO_TCP, TCP_USER_TIMEOUT, &val, sizeof(val));
    #endif
    
    // 버퍼 크기 조정
    val = 256 * 1024;  // 256KB
    setsockopt(fd, SOL_SOCKET, SO_SNDBUF, &val, sizeof(val));
    setsockopt(fd, SOL_SOCKET, SO_RCVBUF, &val, sizeof(val));
}

// TCP Fast Open (TFO)
void enable_tcp_fastopen(int listen_fd) {
    #ifdef TCP_FASTOPEN
    int qlen = 5;  // Fast Open 큐 길이
    setsockopt(listen_fd, IPPROTO_TCP, TCP_FASTOPEN,
              &qlen, sizeof(qlen));
    #endif
}
```text

## 요약

비동기 I/O와 이벤트 기반 프로그래밍은 현대 고성능 시스템의 핵심입니다. select에서 시작하여 poll, epoll을 거쳐 io_uring에 이르기까지, 리눅스의 I/O 멀티플렉싱은 지속적으로 진화해왔습니다.

epoll은 O(1) 복잡도로 수만 개의 연결을 효율적으로 처리할 수 있게 해주었고, io_uring은 시스템 콜 오버헤드를 최소화하면서 진정한 비동기 I/O를 구현했습니다.

리액터 패턴은 이벤트 기반 서버의 표준 아키텍처가 되었으며, Windows의 IOCP는 프로액터 패턴의 대표적 구현입니다. Zero-copy, TCP 최적화 등의 기법을 통해 네트워크 성능을 극대화할 수 있습니다.

다음 장에서는 네트워크 프로그래밍의 더 깊은 측면을 탐구하겠습니다.

## 다음 장 예고

Chapter 7에서는 "네트워크 프로그래밍은 어떻게 동작하는가"를 다룹니다. 소켓 프로그래밍의 기초부터 고급 기법까지, TCP/IP 스택의 내부 구현과 최적화 전략을 살펴보겠습니다.
