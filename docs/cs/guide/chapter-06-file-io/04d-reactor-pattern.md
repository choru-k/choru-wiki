---
tags:
  - async-io
  - deep-study
  - epoll
  - event-driven
  - hands-on
  - intermediate
  - reactor-pattern
  - server-architecture
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "8-12시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# Chapter 6-4D: 리액터 패턴 구현

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
```

## 리액터 패턴의 핵심 구성 요소

### 1. Synchronous Event Demultiplexer

```c
// 이벤트 디멀티플렉서 - epoll 기반 구현
typedef struct event_demux {
    int epfd;
    struct epoll_event *events;
    int max_events;
    
    // 통계
    uint64_t total_events;
    uint64_t read_events;
    uint64_t write_events;
    uint64_t error_events;
} event_demux_t;

event_demux_t *demux_create(int max_events) {
    event_demux_t *demux = malloc(sizeof(event_demux_t));
    
    demux->epfd = epoll_create1(EPOLL_CLOEXEC);
    demux->events = calloc(max_events, sizeof(struct epoll_event));
    demux->max_events = max_events;
    
    memset(&demux->total_events, 0, sizeof(uint64_t) * 4);
    
    return demux;
}

// 이벤트 대기
int demux_select(event_demux_t *demux, int timeout) {
    int nfds = epoll_wait(demux->epfd, demux->events,
                         demux->max_events, timeout);
    
    if (nfds > 0) {
        demux->total_events += nfds;
        
        // 이벤트 타입별 통계
        for (int i = 0; i < nfds; i++) {
            if (demux->events[i].events & EPOLLIN)
                demux->read_events++;
            if (demux->events[i].events & EPOLLOUT)
                demux->write_events++;
            if (demux->events[i].events & (EPOLLERR | EPOLLHUP))
                demux->error_events++;
        }
    }
    
    return nfds;
}

// 핸들러 등록
int demux_register(event_demux_t *demux, int fd,
                  uint32_t events, void *data) {
    struct epoll_event ev = {
        .events = events,
        .data.ptr = data
    };
    
    return epoll_ctl(demux->epfd, EPOLL_CTL_ADD, fd, &ev);
}

// 이벤트 수정
int demux_modify(event_demux_t *demux, int fd,
                uint32_t events, void *data) {
    struct epoll_event ev = {
        .events = events,
        .data.ptr = data
    };
    
    return epoll_ctl(demux->epfd, EPOLL_CTL_MOD, fd, &ev);
}

// 핸들러 제거
int demux_unregister(event_demux_t *demux, int fd) {
    return epoll_ctl(demux->epfd, EPOLL_CTL_DEL, fd, NULL);
}
```

### 2. Event Handler Hierarchy

```c
// 기본 이벤트 핸들러 인터페이스
typedef struct event_handler {
    int fd;                                    // 파일 디스크립터
    void *data;                               // 핸들러별 데이터
    
    // 가상 함수들 (다형성)
    void (*handle_read)(struct event_handler *self);
    void (*handle_write)(struct event_handler *self);
    void (*handle_error)(struct event_handler *self);
    void (*handle_timeout)(struct event_handler *self);
    void (*cleanup)(struct event_handler *self);
    
    // 메타데이터
    char name[32];                            // 핸들러 이름
    struct timeval created_at;                // 생성 시간
    uint64_t read_count;                      // 읽기 횟수
    uint64_t write_count;                     // 쓰기 횟수
} event_handler_t;

// Accept 핸들러 - 새로운 연결 수락
typedef struct accept_handler {
    event_handler_t base;
    
    struct sockaddr_in bind_addr;
    reactor_t *reactor;
    
    // 연결 생성 팩토리 함수
    event_handler_t *(*create_client_handler)(int client_fd);
} accept_handler_t;

void accept_handle_read(event_handler_t *self) {
    accept_handler_t *ah = (accept_handler_t *)self;
    
    while (1) {
        struct sockaddr_in client_addr;
        socklen_t addr_len = sizeof(client_addr);
        
        int client_fd = accept(self->fd,
                              (struct sockaddr *)&client_addr,
                              &addr_len);
        
        if (client_fd < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                break;  // 모든 연결 처리 완료
            }
            perror("accept");
            break;
        }
        
        // 논블로킹 모드 설정
        set_nonblocking(client_fd);
        
        // 클라이언트 핸들러 생성
        event_handler_t *client_handler = ah->create_client_handler(client_fd);
        if (client_handler) {
            reactor_register(ah->reactor, client_handler, EPOLLIN | EPOLLET);
        } else {
            close(client_fd);
        }
        
        self->read_count++;
    }
}

// Echo 서버 핸들러
typedef struct echo_handler {
    event_handler_t base;
    
    char read_buffer[4096];
    size_t read_pos;
    char write_buffer[4096];
    size_t write_len;
    size_t write_pos;
    
    enum {
        ECHO_READING,
        ECHO_WRITING,
        ECHO_CLOSED
    } state;
} echo_handler_t;

void echo_handle_read(event_handler_t *self) {
    echo_handler_t *eh = (echo_handler_t *)self;
    
    while (1) {
        ssize_t n = read(self->fd,
                        eh->read_buffer + eh->read_pos,
                        sizeof(eh->read_buffer) - eh->read_pos);
        
        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                break;  // 모든 데이터 읽음
            }
            self->handle_error(self);
            return;
        }
        
        if (n == 0) {
            // 연결 종료
            eh->state = ECHO_CLOSED;
            self->cleanup(self);
            return;
        }
        
        eh->read_pos += n;
        self->read_count++;
        
        // 줄바꿈을 찾아 에코할 데이터 확인
        char *newline = memchr(eh->read_buffer, '\n', eh->read_pos);
        if (newline) {
            size_t line_len = newline - eh->read_buffer + 1;
            
            // 에코 버퍼에 복사
            memcpy(eh->write_buffer, eh->read_buffer, line_len);
            eh->write_len = line_len;
            eh->write_pos = 0;
            
            // 읽기 버퍼에서 제거
            memmove(eh->read_buffer, newline + 1,
                   eh->read_pos - line_len);
            eh->read_pos -= line_len;
            
            eh->state = ECHO_WRITING;
            
            // EPOLLOUT 이벤트 활성화
            modify_events(reactor, self->fd, EPOLLIN | EPOLLOUT | EPOLLET);
        }
    }
}

void echo_handle_write(event_handler_t *self) {
    echo_handler_t *eh = (echo_handler_t *)self;
    
    if (eh->state != ECHO_WRITING) {
        return;
    }
    
    while (eh->write_pos < eh->write_len) {
        ssize_t n = write(self->fd,
                         eh->write_buffer + eh->write_pos,
                         eh->write_len - eh->write_pos);
        
        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                return;  // 나중에 재시도
            }
            self->handle_error(self);
            return;
        }
        
        eh->write_pos += n;
        self->write_count++;
    }
    
    // 쓰기 완료
    eh->state = ECHO_READING;
    modify_events(reactor, self->fd, EPOLLIN | EPOLLET);
}
```

### 3. Timer Management

```c
// 타이머 노드 구조체
typedef struct timer_node {
    struct timeval expire_time;
    void *data;
    void (*callback)(void *data);
    int heap_index;
} timer_node_t;

// 타이머 힙 관리
typedef struct timer_heap {
    timer_node_t *nodes;
    int capacity;
    int count;
} timer_heap_t;

timer_heap_t *timer_heap_create(int capacity) {
    timer_heap_t *heap = malloc(sizeof(timer_heap_t));
    heap->nodes = calloc(capacity, sizeof(timer_node_t));
    heap->capacity = capacity;
    heap->count = 0;
    return heap;
}

// 타이머 추가
void timer_heap_add(timer_heap_t *heap, struct timeval *expire_time,
                   void *data, void (*callback)(void *)) {
    if (heap->count >= heap->capacity) {
        heap->capacity *= 2;
        heap->nodes = realloc(heap->nodes,
                             heap->capacity * sizeof(timer_node_t));
    }
    
    int index = heap->count++;
    heap->nodes[index].expire_time = *expire_time;
    heap->nodes[index].data = data;
    heap->nodes[index].callback = callback;
    heap->nodes[index].heap_index = index;
    
    // 힙 속성 유지 (상향 조정)
    timer_heap_bubble_up(heap, index);
}

// 다음 타이머까지의 대기 시간 계산
int calculate_timeout(timer_heap_t *heap) {
    if (heap->count == 0) {
        return -1;  // 무한 대기
    }
    
    struct timeval now, diff;
    gettimeofday(&now, NULL);
    
    timer_node_t *next = &heap->nodes[0];  // 힙 루트
    
    if (timercmp(&now, &next->expire_time, >=)) {
        return 0;  // 이미 만료됨
    }
    
    timersub(&next->expire_time, &now, &diff);
    return diff.tv_sec * 1000 + diff.tv_usec / 1000;
}

// 만료된 타이머들 처리
void process_timers(timer_heap_t *heap) {
    struct timeval now;
    gettimeofday(&now, NULL);
    
    while (heap->count > 0) {
        timer_node_t *next = &heap->nodes[0];
        
        if (timercmp(&now, &next->expire_time, <)) {
            break;  // 아직 만료 안됨
        }
        
        // 콜백 실행
        if (next->callback) {
            next->callback(next->data);
        }
        
        // 힙에서 제거
        timer_heap_remove_min(heap);
    }
}

// 연결 타임아웃 처리 예제
typedef struct connection_timeout {
    event_handler_t *handler;
    reactor_t *reactor;
} connection_timeout_t;

void connection_timeout_callback(void *data) {
    connection_timeout_t *ct = (connection_timeout_t *)data;
    
    printf("Connection timeout: fd=%d\n", ct->handler->fd);
    
    // 연결 강제 종료
    reactor_unregister(ct->reactor, ct->handler);
    ct->handler->cleanup(ct->handler);
    
    free(ct);
}

void set_connection_timeout(reactor_t *reactor, event_handler_t *handler,
                           int timeout_seconds) {
    connection_timeout_t *ct = malloc(sizeof(connection_timeout_t));
    ct->handler = handler;
    ct->reactor = reactor;
    
    struct timeval expire_time;
    gettimeofday(&expire_time, NULL);
    expire_time.tv_sec += timeout_seconds;
    
    timer_heap_add(reactor->timer_heap, &expire_time,
                   ct, connection_timeout_callback);
}
```

## 스레드 풀 통합

```c
// 작업 큐 항목
typedef struct work_item {
    void (*func)(void *data);
    void *data;
    struct work_item *next;
} work_item_t;

// 스레드 풀 구조체
typedef struct thread_pool {
    pthread_t *threads;
    int num_threads;
    int shutdown;
    
    // 작업 큐
    work_item_t *queue_head;
    work_item_t *queue_tail;
    int queue_size;
    
    // 동기화
    pthread_mutex_t queue_mutex;
    pthread_cond_t queue_cond;
    
    // 통계
    uint64_t total_jobs;
    uint64_t completed_jobs;
} thread_pool_t;

thread_pool_t *thread_pool_create(int num_threads) {
    thread_pool_t *pool = malloc(sizeof(thread_pool_t));
    
    pool->threads = calloc(num_threads, sizeof(pthread_t));
    pool->num_threads = num_threads;
    pool->shutdown = 0;
    pool->queue_head = NULL;
    pool->queue_tail = NULL;
    pool->queue_size = 0;
    pool->total_jobs = 0;
    pool->completed_jobs = 0;
    
    pthread_mutex_init(&pool->queue_mutex, NULL);
    pthread_cond_init(&pool->queue_cond, NULL);
    
    // 워커 스레드 생성
    for (int i = 0; i < num_threads; i++) {
        pthread_create(&pool->threads[i], NULL, worker_thread, pool);
    }
    
    return pool;
}

// 워커 스레드 함수
void *worker_thread(void *arg) {
    thread_pool_t *pool = (thread_pool_t *)arg;
    
    while (1) {
        pthread_mutex_lock(&pool->queue_mutex);
        
        // 작업 대기
        while (pool->queue_head == NULL && !pool->shutdown) {
            pthread_cond_wait(&pool->queue_cond, &pool->queue_mutex);
        }
        
        if (pool->shutdown) {
            pthread_mutex_unlock(&pool->queue_mutex);
            break;
        }
        
        // 작업 가져오기
        work_item_t *item = pool->queue_head;
        pool->queue_head = item->next;
        if (pool->queue_head == NULL) {
            pool->queue_tail = NULL;
        }
        pool->queue_size--;
        
        pthread_mutex_unlock(&pool->queue_mutex);
        
        // 작업 실행
        item->func(item->data);
        free(item);
        
        // 통계 업데이트
        __atomic_fetch_add(&pool->completed_jobs, 1, __ATOMIC_RELAXED);
    }
    
    return NULL;
}

// 작업 제출
int thread_pool_submit(thread_pool_t *pool, void (*func)(void *), void *data) {
    if (pool->shutdown) {
        return -1;
    }
    
    work_item_t *item = malloc(sizeof(work_item_t));
    item->func = func;
    item->data = data;
    item->next = NULL;
    
    pthread_mutex_lock(&pool->queue_mutex);
    
    if (pool->queue_tail == NULL) {
        pool->queue_head = pool->queue_tail = item;
    } else {
        pool->queue_tail->next = item;
        pool->queue_tail = item;
    }
    pool->queue_size++;
    pool->total_jobs++;
    
    pthread_cond_signal(&pool->queue_cond);
    pthread_mutex_unlock(&pool->queue_mutex);
    
    return 0;
}

// HTTP 요청 처리 작업
typedef struct http_work_data {
    http_handler_t *handler;
    reactor_t *reactor;
} http_work_data_t;

void process_http_request_async(void *data) {
    http_work_data_t *work = (http_work_data_t *)data;
    http_handler_t *handler = work->handler;
    
    // CPU 집약적인 작업 (파싱, 인증, 비즈니스 로직 등)
    parse_http_request(handler->request_buf, handler->request_len);
    
    // 응답 생성
    handler->response_buf = generate_http_response(handler);
    handler->response_len = strlen(handler->response_buf);
    handler->response_pos = 0;
    handler->state = HTTP_WRITING_RESPONSE;
    
    // 메인 스레드에 쓰기 준비 알림
    struct epoll_event ev = {
        .events = EPOLLOUT | EPOLLET,
        .data.ptr = &handler->base
    };
    epoll_ctl(work->reactor->epfd, EPOLL_CTL_MOD, handler->base.fd, &ev);
    
    free(work);
}
```

## 실제 프로덕션 최적화

```c
// 연결 풀링
typedef struct connection_pool {
    event_handler_t **free_handlers;
    int capacity;
    int count;
    pthread_mutex_t mutex;
    
    // 통계
    int total_created;
    int total_reused;
} connection_pool_t;

connection_pool_t *connection_pool_create(int capacity) {
    connection_pool_t *pool = malloc(sizeof(connection_pool_t));
    pool->free_handlers = calloc(capacity, sizeof(event_handler_t *));
    pool->capacity = capacity;
    pool->count = 0;
    pool->total_created = 0;
    pool->total_reused = 0;
    pthread_mutex_init(&pool->mutex, NULL);
    return pool;
}

event_handler_t *connection_pool_get(connection_pool_t *pool) {
    pthread_mutex_lock(&pool->mutex);
    
    event_handler_t *handler = NULL;
    
    if (pool->count > 0) {
        // 재사용
        handler = pool->free_handlers[--pool->count];
        pool->total_reused++;
    }
    
    pthread_mutex_unlock(&pool->mutex);
    
    if (handler == NULL) {
        // 새로 생성
        handler = create_echo_handler();
        pool->total_created++;
    } else {
        // 재사용을 위한 리셋
        reset_handler(handler);
    }
    
    return handler;
}

void connection_pool_return(connection_pool_t *pool, event_handler_t *handler) {
    pthread_mutex_lock(&pool->mutex);
    
    if (pool->count < pool->capacity) {
        pool->free_handlers[pool->count++] = handler;
        handler = NULL;  // 풀에 반환됨
    }
    
    pthread_mutex_unlock(&pool->mutex);
    
    if (handler) {
        // 풀이 가득 참, 해제
        handler->cleanup(handler);
    }
}

// 성능 모니터링
typedef struct reactor_stats {
    uint64_t total_connections;
    uint64_t active_connections;
    uint64_t total_events;
    uint64_t events_per_second;
    
    struct timeval last_update;
    uint64_t last_event_count;
    
    // 지연 시간 히스토그램
    int latency_buckets[10];  // 0-1ms, 1-10ms, 10-100ms, ...
} reactor_stats_t;

void update_reactor_stats(reactor_t *reactor) {
    reactor_stats_t *stats = &reactor->stats;
    struct timeval now;
    gettimeofday(&now, NULL);
    
    // 1초마다 통계 업데이트
    if (now.tv_sec > stats->last_update.tv_sec) {
        uint64_t event_diff = reactor->demux->total_events - stats->last_event_count;
        stats->events_per_second = event_diff;
        stats->last_event_count = reactor->demux->total_events;
        stats->last_update = now;
        
        printf("EPS: %lu, Active: %lu, Pool: %d/%d\n",
               stats->events_per_second,
               stats->active_connections,
               reactor->connection_pool->count,
               reactor->connection_pool->capacity);
    }
}
```

## 핵심 요점

### 1. 리액터 패턴의 핵심 구조

- **Event Demultiplexer**: 여러 I/O 이벤트를 동시에 모니터링
- **Event Handler**: 각 이벤트 타입에 대한 처리 로직 캡슐화
- **Reactor**: 이벤트 루프와 핸들러 디스패칭 관리

### 2. 확장성과 성능 최적화

- **스레드 풀**: CPU 집약적 작업을 별도 스레드에서 처리
- **타이머 관리**: 효율적인 타임아웃 처리
- **연결 풀링**: 객체 재사용으로 GC 압박 감소

### 3. 실전 적용 시 고려사항

- **에러 처리**: 네트워크 연결의 예외 상황 대응
- **메모리 관리**: 비동기 환경에서의 생명주기 관리
- **성능 모니터링**: 실시간 성능 지표 추적

---

**이전**: [io_uring: 차세대 비동기 I/O](chapter-06-file-io/04c-io-uring-implementation.md)  
**다음**: [프로액터 패턴과 Windows IOCP](chapter-06-file-io/04e-proactor-iocp.md)에서 완료 기반 I/O 모델을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-06-file-io)

- [Chapter 6-1: 파일 디스크립터의 내부 구조](./06-10-file-descriptor.md)
- [Chapter 6-1A: 파일 디스크립터 기본 개념과 3단계 구조](./06-01-fd-basics-structure.md)
- [Chapter 6-1B: 파일 디스크립터 할당과 공유 메커니즘](./06-11-fd-allocation-management.md)
- [Chapter 6-1C: 파일 연산과 VFS 다형성](./06-12-file-operations-vfs.md)
- [Chapter 6-2: VFS와 파일 시스템 추상화 개요](./06-13-vfs-filesystem.md)

### 🏷️ 관련 키워드

`reactor-pattern`, `event-driven`, `epoll`, `server-architecture`, `async-io`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
