---
tags:
  - Asynchronous I/O
  - Completion Port
  - IOCP
  - Proactor
  - Windows
  - advanced
  - deep-study
  - hands-on
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "15-25시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# Chapter 6-4E: 프로액터 패턴과 Windows IOCP

## 프로액터 패턴과 완료 포트

### 리액터 vs 프로액터 비교

```c
// 리액터 패턴: "준비된 것을 알려줄게"
int epoll_fd = epoll_create1(0);
epoll_wait(epoll_fd, events, MAX_EVENTS, -1);  // 읽기 가능 대기
read(fd, buffer, size);                        // 실제 읽기 수행

// 프로액터 패턴: "완료된 것을 알려줄게"
ReadFile(handle, buffer, size, NULL, &overlapped);  // 비동기 읽기 시작
GetQueuedCompletionStatus(iocp, &bytes, ...);       // 완료 대기
// 이미 buffer에 데이터가 들어있음!
```

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
```

## 프로액터 패턴의 핵심 구성 요소

### 1. Asynchronous Operation Processor

```c
// 비동기 연산 프로세서 - Windows IOCP 기반
typedef struct async_processor {
    HANDLE iocp;
    HANDLE *worker_threads;
    int num_workers;
    volatile LONG shutdown;
    
    // 통계
    volatile LONG active_operations;
    volatile LONG completed_operations;
    volatile LONG failed_operations;
} async_processor_t;

async_processor_t *async_processor_create(int num_workers) {
    async_processor_t *processor = malloc(sizeof(async_processor_t));
    
    // IOCP 생성 (최대 동시 스레드 수 = num_workers)
    processor->iocp = CreateIoCompletionPort(INVALID_HANDLE_VALUE,
                                           NULL, 0, num_workers);
    
    processor->worker_threads = calloc(num_workers, sizeof(HANDLE));
    processor->num_workers = num_workers;
    processor->shutdown = 0;
    processor->active_operations = 0;
    processor->completed_operations = 0;
    processor->failed_operations = 0;
    
    // 워커 스레드 생성
    for (int i = 0; i < num_workers; i++) {
        processor->worker_threads[i] = CreateThread(
            NULL, 0, async_processor_worker, processor, 0, NULL
        );
    }
    
    return processor;
}

// 핸들을 IOCP에 연결
int async_processor_associate(async_processor_t *processor,
                            HANDLE handle, ULONG_PTR completion_key) {
    HANDLE result = CreateIoCompletionPort(handle,
                                          processor->iocp,
                                          completion_key,
                                          0);
    return (result != NULL) ? 0 : -1;
}

// 비동기 작업 워커 스레드
DWORD WINAPI async_processor_worker(LPVOID param) {
    async_processor_t *processor = (async_processor_t *)param;
    DWORD bytes_transferred;
    ULONG_PTR completion_key;
    LPOVERLAPPED overlapped;
    
    while (!processor->shutdown) {
        BOOL result = GetQueuedCompletionStatus(
            processor->iocp,
            &bytes_transferred,
            &completion_key,
            &overlapped,
            1000  // 1초 타임아웃
        );
        
        if (!result) {
            DWORD error = GetLastError();
            if (error == WAIT_TIMEOUT) {
                continue;  // 타임아웃, 계속 루프
            }
            
            if (overlapped) {
                // I/O 에러
                InterlockedIncrement(&processor->failed_operations);
                // 에러 처리 로직
                handle_io_error(overlapped, error);
            }
            continue;
        }
        
        // 성공적인 완료
        InterlockedIncrement(&processor->completed_operations);
        InterlockedDecrement(&processor->active_operations);
        
        // 완료 핸들러 호출
        completion_handler_t *handler = (completion_handler_t *)completion_key;
        if (handler && handler->on_completion) {
            handler->on_completion(handler, overlapped, bytes_transferred);
        }
    }
    
    return 0;
}

// 비동기 읽기 시작
int async_read(async_processor_t *processor, HANDLE handle,
              void *buffer, DWORD size, LPOVERLAPPED overlapped) {
    InterlockedIncrement(&processor->active_operations);
    
    BOOL result = ReadFile(handle, buffer, size, NULL, overlapped);
    
    if (!result && GetLastError() != ERROR_IO_PENDING) {
        InterlockedDecrement(&processor->active_operations);
        InterlockedIncrement(&processor->failed_operations);
        return -1;
    }
    
    return 0;
}

// 비동기 쓰기 시작
int async_write(async_processor_t *processor, HANDLE handle,
               const void *buffer, DWORD size, LPOVERLAPPED overlapped) {
    InterlockedIncrement(&processor->active_operations);
    
    BOOL result = WriteFile(handle, buffer, size, NULL, overlapped);
    
    if (!result && GetLastError() != ERROR_IO_PENDING) {
        InterlockedDecrement(&processor->active_operations);
        InterlockedIncrement(&processor->failed_operations);
        return -1;
    }
    
    return 0;
}
```

### 2. Completion Handler

```c
// 완료 핸들러 인터페이스
typedef struct completion_handler {
    void *user_data;
    
    // 가상 함수들
    void (*on_completion)(struct completion_handler *self,
                         LPOVERLAPPED overlapped,
                         DWORD bytes_transferred);
    void (*on_error)(struct completion_handler *self,
                    LPOVERLAPPED overlapped,
                    DWORD error);
    void (*cleanup)(struct completion_handler *self);
} completion_handler_t;

// HTTP 요청 처리 핸들러
typedef struct http_completion_handler {
    completion_handler_t base;
    
    SOCKET client_socket;
    char *request_buffer;
    size_t request_size;
    char *response_buffer;
    size_t response_size;
    
    enum {
        HTTP_READING_HEADERS,
        HTTP_READING_BODY,
        HTTP_PROCESSING,
        HTTP_WRITING_RESPONSE,
        HTTP_COMPLETED
    } state;
} http_completion_handler_t;

void http_completion_handler_create(SOCKET client_socket) {
    http_completion_handler_t *handler = 
        calloc(1, sizeof(http_completion_handler_t));
    
    handler->base.on_completion = http_on_completion;
    handler->base.on_error = http_on_error;
    handler->base.cleanup = http_cleanup;
    
    handler->client_socket = client_socket;
    handler->request_buffer = malloc(8192);
    handler->request_size = 8192;
    handler->state = HTTP_READING_HEADERS;
    
    // 첫 번째 읽기 시작
    OVERLAPPED *overlapped = calloc(1, sizeof(OVERLAPPED));
    async_read(processor, (HANDLE)client_socket,
               handler->request_buffer, handler->request_size,
               overlapped);
    
    return handler;
}

void http_on_completion(completion_handler_t *self,
                       LPOVERLAPPED overlapped,
                       DWORD bytes_transferred) {
    http_completion_handler_t *handler = (http_completion_handler_t *)self;
    
    switch (handler->state) {
    case HTTP_READING_HEADERS:
        // HTTP 헤더 파싱
        if (parse_http_headers(handler, bytes_transferred)) {
            if (has_request_body(handler)) {
                handler->state = HTTP_READING_BODY;
                // 계속 읽기
                async_read(processor, (HANDLE)handler->client_socket,
                          handler->request_buffer + bytes_transferred,
                          handler->request_size - bytes_transferred,
                          overlapped);
            } else {
                // 헤더만 있음, 처리 시작
                handler->state = HTTP_PROCESSING;
                process_http_request_async(handler);
            }
        } else {
            // 헤더 불완전, 계속 읽기
            async_read(processor, (HANDLE)handler->client_socket,
                      handler->request_buffer + bytes_transferred,
                      handler->request_size - bytes_transferred,
                      overlapped);
        }
        break;
        
    case HTTP_READING_BODY:
        if (is_request_complete(handler, bytes_transferred)) {
            handler->state = HTTP_PROCESSING;
            process_http_request_async(handler);
        } else {
            // 본문 계속 읽기
            async_read(processor, (HANDLE)handler->client_socket,
                      handler->request_buffer + bytes_transferred,
                      handler->request_size - bytes_transferred,
                      overlapped);
        }
        break;
        
    case HTTP_WRITING_RESPONSE:
        // 응답 전송 완료 확인
        if (bytes_transferred < handler->response_size) {
            // 부분 전송, 나머지 전송
            async_write(processor, (HANDLE)handler->client_socket,
                       handler->response_buffer + bytes_transferred,
                       handler->response_size - bytes_transferred,
                       overlapped);
        } else {
            // 전송 완료
            handler->state = HTTP_COMPLETED;
            self->cleanup(self);
        }
        break;
    }
    
    free(overlapped);
}

// 비동기 HTTP 요청 처리
void process_http_request_async(http_completion_handler_t *handler) {
    // 스레드 풀에서 처리하거나 즉시 처리
    handler->response_buffer = generate_http_response(handler->request_buffer);
    handler->response_size = strlen(handler->response_buffer);
    handler->state = HTTP_WRITING_RESPONSE;
    
    // 응답 전송 시작
    OVERLAPPED *overlapped = calloc(1, sizeof(OVERLAPPED));
    async_write(processor, (HANDLE)handler->client_socket,
               handler->response_buffer, handler->response_size,
               overlapped);
}
```

### 3. Proactor Framework

```c
// 프로액터 프레임워크
typedef struct proactor {
    async_processor_t *processor;
    
    // 연결 관리
    SOCKET listen_socket;
    struct connection_pool *conn_pool;
    
    // AcceptEx 관련
    LPFN_ACCEPTEX lpfn_acceptex;
    LPFN_GETACCEPTEXSOCKADDRS lpfn_getacceptexsockaddrs;
    
    // 통계
    volatile LONG total_connections;
    volatile LONG active_connections;
    volatile LONG total_requests;
} proactor_t;

proactor_t *proactor_create(int port, int num_workers) {
    proactor_t *proactor = malloc(sizeof(proactor_t));
    
    // 비동기 프로세서 생성
    proactor->processor = async_processor_create(num_workers);
    
    // 리스닝 소켓 생성
    proactor->listen_socket = WSASocket(AF_INET, SOCK_STREAM, IPPROTO_TCP,
                                       NULL, 0, WSA_FLAG_OVERLAPPED);
    
    // 소켓을 IOCP에 연결
    async_processor_associate(proactor->processor,
                             (HANDLE)proactor->listen_socket,
                             (ULONG_PTR)proactor);
    
    // AcceptEx 함수 획득
    get_acceptex_functions(proactor);
    
    // 바인드 및 리슨
    bind_and_listen(proactor, port);
    
    // 연결 풀 생성
    proactor->conn_pool = connection_pool_create(1000);
    
    // 초기 AcceptEx 요청들 투입
    for (int i = 0; i < PENDING_ACCEPTS; i++) {
        post_acceptex(proactor);
    }
    
    return proactor;
}

// AcceptEx 투입
void post_acceptex(proactor_t *proactor) {
    // 연결 풀에서 구조체 가져오기
    connection_t *conn = connection_pool_get(proactor->conn_pool);
    
    // Accept용 소켓 생성
    conn->socket = WSASocket(AF_INET, SOCK_STREAM, IPPROTO_TCP,
                            NULL, 0, WSA_FLAG_OVERLAPPED);
    
    // AcceptEx용 컨텍스트 준비
    accept_context_t *ctx = &conn->accept_ctx;
    memset(&ctx->overlapped, 0, sizeof(OVERLAPPED));
    ctx->conn = conn;
    
    DWORD bytes;
    BOOL result = proactor->lpfn_acceptex(
        proactor->listen_socket,
        conn->socket,
        ctx->buffer,
        0,  // 초기 데이터 받지 않음
        sizeof(SOCKADDR_IN) + 16,
        sizeof(SOCKADDR_IN) + 16,
        &bytes,
        &ctx->overlapped
    );
    
    if (!result && WSAGetLastError() != WSA_IO_PENDING) {
        // 실패 시 연결 반환
        connection_pool_return(proactor->conn_pool, conn);
    }
}

// Accept 완료 처리
void handle_accept_completion(proactor_t *proactor, 
                            accept_context_t *ctx,
                            DWORD bytes_transferred) {
    connection_t *conn = ctx->conn;
    
    // 새 연결을 IOCP에 연결
    async_processor_associate(proactor->processor,
                             (HANDLE)conn->socket,
                             (ULONG_PTR)conn);
    
    InterlockedIncrement(&proactor->total_connections);
    InterlockedIncrement(&proactor->active_connections);
    
    // 클라이언트 주소 정보 추출
    SOCKADDR_IN *local_addr, *remote_addr;
    int local_len, remote_len;
    
    proactor->lpfn_getacceptexsockaddrs(
        ctx->buffer,
        0,
        sizeof(SOCKADDR_IN) + 16,
        sizeof(SOCKADDR_IN) + 16,
        (SOCKADDR**)&local_addr, &local_len,
        (SOCKADDR**)&remote_addr, &remote_len
    );
    
    // 연결 정보 설정
    conn->remote_addr = *remote_addr;
    conn->handler = http_completion_handler_create(conn->socket);
    
    // 다음 AcceptEx 투입
    post_acceptex(proactor);
    
    // 첫 번째 읽기 시작
    post_first_read(conn);
}
```

## 크로스 플랫폼 프로액터

```c
// 플랫폼 추상화 레이어
#ifdef _WIN32
    #include <winsock2.h>
    #include <windows.h>
    typedef HANDLE async_handle_t;
    typedef OVERLAPPED async_overlapped_t;
#else
    #include <aio.h>
    typedef int async_handle_t;
    typedef struct aiocb async_overlapped_t;
#endif

// 통합 프로액터 인터페이스
typedef struct cross_platform_proactor {
    #ifdef _WIN32
    async_processor_t *iocp_processor;
    #else
    int epoll_fd;
    struct aio_context *aio_ctx;
    #endif
    
    void (*async_read)(struct cross_platform_proactor *self,
                      async_handle_t handle,
                      void *buffer, size_t size,
                      async_overlapped_t *overlapped);
    
    void (*async_write)(struct cross_platform_proactor *self,
                       async_handle_t handle,
                       const void *buffer, size_t size,
                       async_overlapped_t *overlapped);
    
    int (*wait_completion)(struct cross_platform_proactor *self,
                          int timeout_ms);
} cross_platform_proactor_t;

// Windows 구현
#ifdef _WIN32
void win_async_read(cross_platform_proactor_t *self,
                   async_handle_t handle,
                   void *buffer, size_t size,
                   async_overlapped_t *overlapped) {
    ReadFile(handle, buffer, (DWORD)size, NULL, overlapped);
}

void win_async_write(cross_platform_proactor_t *self,
                    async_handle_t handle,
                    const void *buffer, size_t size,
                    async_overlapped_t *overlapped) {
    WriteFile(handle, buffer, (DWORD)size, NULL, overlapped);
}

int win_wait_completion(cross_platform_proactor_t *self, int timeout_ms) {
    DWORD bytes;
    ULONG_PTR key;
    LPOVERLAPPED overlapped;
    
    BOOL result = GetQueuedCompletionStatus(
        self->iocp_processor->iocp,
        &bytes, &key, &overlapped,
        (timeout_ms < 0) ? INFINITE : (DWORD)timeout_ms
    );
    
    return result ? (int)bytes : -1;
}
#endif

// Linux 구현 (POSIX AIO 사용)
#ifndef _WIN32
void linux_async_read(cross_platform_proactor_t *self,
                     async_handle_t handle,
                     void *buffer, size_t size,
                     async_overlapped_t *overlapped) {
    overlapped->aio_fildes = handle;
    overlapped->aio_buf = buffer;
    overlapped->aio_nbytes = size;
    overlapped->aio_offset = 0;
    overlapped->aio_sigevent.sigev_notify = SIGEV_NONE;
    
    aio_read(overlapped);
}

void linux_async_write(cross_platform_proactor_t *self,
                      async_handle_t handle,
                      const void *buffer, size_t size,
                      async_overlapped_t *overlapped) {
    overlapped->aio_fildes = handle;
    overlapped->aio_buf = (void*)buffer;
    overlapped->aio_nbytes = size;
    overlapped->aio_offset = 0;
    overlapped->aio_sigevent.sigev_notify = SIGEV_NONE;
    
    aio_write(overlapped);
}

int linux_wait_completion(cross_platform_proactor_t *self, int timeout_ms) {
    struct timespec timeout;
    if (timeout_ms >= 0) {
        timeout.tv_sec = timeout_ms / 1000;
        timeout.tv_nsec = (timeout_ms % 1000) * 1000000;
    }
    
    const struct aiocb *list[1];
    int result = aio_suspend(list, 1, 
                            (timeout_ms >= 0) ? &timeout : NULL);
    
    if (result == 0) {
        return aio_return((struct aiocb*)list[0]);
    }
    
    return -1;
}
#endif

// 프로액터 생성
cross_platform_proactor_t *create_proactor() {
    cross_platform_proactor_t *proactor = 
        malloc(sizeof(cross_platform_proactor_t));
    
    #ifdef _WIN32
    proactor->iocp_processor = async_processor_create(4);
    proactor->async_read = win_async_read;
    proactor->async_write = win_async_write;
    proactor->wait_completion = win_wait_completion;
    #else
    proactor->epoll_fd = epoll_create1(EPOLL_CLOEXEC);
    proactor->aio_ctx = malloc(sizeof(struct aio_context));
    proactor->async_read = linux_async_read;
    proactor->async_write = linux_async_write;
    proactor->wait_completion = linux_wait_completion;
    #endif
    
    return proactor;
}
```

## 성능 비교 및 최적화

```c
// 프로액터 vs 리액터 성능 측정
typedef struct performance_metrics {
    uint64_t total_operations;
    uint64_t completed_operations;
    uint64_t failed_operations;
    
    struct timeval start_time;
    struct timeval end_time;
    
    double operations_per_second;
    double average_latency_ms;
    double cpu_usage_percent;
} performance_metrics_t;

void benchmark_proactor_vs_reactor() {
    printf("=== 프로액터 vs 리액터 성능 비교 ===\n");
    printf("테스트 조건:\n");
    printf("- 동시 연결: 10,000개\n");
    printf("- 메시지 크기: 1KB\n");
    printf("- 테스트 시간: 60초\n\n");
    
    // 프로액터 (Windows IOCP)
    performance_metrics_t proactor_metrics = run_proactor_test();
    printf("프로액터 (IOCP):\n");
    printf("  처리량: %.0f ops/sec\n", proactor_metrics.operations_per_second);
    printf("  평균 지연: %.2f ms\n", proactor_metrics.average_latency_ms);
    printf("  CPU 사용률: %.1f%%\n", proactor_metrics.cpu_usage_percent);
    printf("  실패율: %.2f%%\n\n", 
           (double)proactor_metrics.failed_operations * 100 / 
           proactor_metrics.total_operations);
    
    // 리액터 (Linux epoll)
    performance_metrics_t reactor_metrics = run_reactor_test();
    printf("리액터 (epoll):\n");
    printf("  처리량: %.0f ops/sec\n", reactor_metrics.operations_per_second);
    printf("  평균 지연: %.2f ms\n", reactor_metrics.average_latency_ms);
    printf("  CPU 사용률: %.1f%%\n", reactor_metrics.cpu_usage_percent);
    printf("  실패율: %.2f%%\n\n",
           (double)reactor_metrics.failed_operations * 100 / 
           reactor_metrics.total_operations);
    
    // 성능 차이 분석
    double throughput_ratio = proactor_metrics.operations_per_second / 
                             reactor_metrics.operations_per_second;
    double latency_ratio = reactor_metrics.average_latency_ms / 
                          proactor_metrics.average_latency_ms;
    
    printf("성능 차이:\n");
    printf("  처리량: 프로액터가 %.1fx %s\n", 
           throughput_ratio > 1 ? throughput_ratio : 1/throughput_ratio,
           throughput_ratio > 1 ? "높음" : "낮음");
    printf("  지연시간: 프로액터가 %.1fx %s\n",
           latency_ratio,
           latency_ratio > 1 ? "낮음" : "높음");
}

// IOCP 최적화 기법
void optimize_iocp_performance() {
    // 1. 워커 스레드 수 최적화
    SYSTEM_INFO si;
    GetSystemInfo(&si);
    int optimal_threads = si.dwNumberOfProcessors * 2;
    
    // 2. 완료 포트 동시 실행 제한
    HANDLE iocp = CreateIoCompletionPort(INVALID_HANDLE_VALUE, NULL, 0, 
                                        optimal_threads);
    
    // 3. 버퍼 풀링으로 메모리 할당 최적화
    typedef struct buffer_pool {
        void **buffers;
        int count;
        int capacity;
        CRITICAL_SECTION cs;
    } buffer_pool_t;
    
    buffer_pool_t *pool = create_buffer_pool(1000, 4096);
    
    // 4. 연결별 컨텍스트 재사용
    typedef struct connection_context {
        OVERLAPPED overlapped;
        char buffer[4096];
        struct connection_context *next;
    } connection_context_t;
    
    // 5. 배치 처리로 시스템 콜 오버헤드 감소
    void batch_process_completions(HANDLE iocp) {
        OVERLAPPED_ENTRY entries[64];
        ULONG count;
        
        BOOL result = GetQueuedCompletionStatusEx(
            iocp, entries, 64, &count, 100, FALSE
        );
        
        if (result) {
            for (ULONG i = 0; i < count; i++) {
                process_completion(&entries[i]);
            }
        }
    }
}
```

## 핵심 요점

### 1. 프로액터 패턴의 특징

- **완료 기반**: I/O 작업이 완료된 후 통지받음
- **진정한 비동기**: 커널이 I/O 작업을 대행 수행
- **높은 처리량**: 시스템 콜 오버헤드 최소화

### 2. Windows IOCP의 강력함

- **Completion Port**: 효율적인 스레드 관리
- **AcceptEx**: 고성능 연결 수락
- **WSASend/WSARecv**: 스캐터-개더 I/O 지원

### 3. 리액터와의 차이점

- **리액터**: "준비됨" 통지 → 직접 I/O 수행
- **프로액터**: I/O 시작 → "완료됨" 통지
- **메모리 관리**: 프로액터에서 더 주의 필요

---

**이전**: [리액터 패턴 구현](./04d-reactor-pattern.md)  
**다음**: [고성능 네트워크 최적화](./06-31-network-optimization.md)에서 네트워크 성능 튜닝 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 15-25시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-06-file-io)

- [Chapter 6-1: 파일 디스크립터의 내부 구조](./06-10-file-descriptor.md)
- [Chapter 6-1A: 파일 디스크립터 기본 개념과 3단계 구조](./06-01-fd-basics-structure.md)
- [Chapter 6-1B: 파일 디스크립터 할당과 공유 메커니즘](./06-11-fd-allocation-management.md)
- [Chapter 6-1C: 파일 연산과 VFS 다형성](./06-12-file-operations-vfs.md)
- [Chapter 6-2: VFS와 파일 시스템 추상화 개요](./06-13-vfs-filesystem.md)

### 🏷️ 관련 키워드

`Proactor`, `IOCP`, `Windows`, `Asynchronous I/O`, `Completion Port`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
