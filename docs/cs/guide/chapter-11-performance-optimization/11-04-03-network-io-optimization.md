---
tags:
  - TCP optimization
  - deep-study
  - epoll
  - hands-on
  - intermediate
  - sendfile
  - splice
  - zero-copy
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "8-12시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 11.4.3: 네트워크 I/O 최적화

## 고성능 네트워크 애플리케이션의 핵심 기술

네트워크 I/O는 현대 분산 시스템에서 가장 중요한 성능 요소입니다. epoll을 이용한 이벤트 드리븐 프로그래밍과 제로 카피 기법을 통해 놀라운 성능 향상을 달성할 수 있습니다.

## epoll을 이용한 고성능 서버

epoll은 Linux에서 제공하는 고성능 I/O 이벤트 알림 메커니즘으로, 수만 개의 동시 연결을 효율적으로 처리할 수 있습니다.

```c
// epoll_server.c - epoll 기반 고성능 서버
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/socket.h>
#include <sys/epoll.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#define MAX_EVENTS 1000
#define BUFFER_SIZE 4096
#define MAX_CLIENTS 10000

// 클라이언트 연결 정보
typedef struct {
    int fd;
    char buffer[BUFFER_SIZE];
    size_t buffer_pos;
    time_t last_activity;
} client_info_t;

static client_info_t clients[MAX_CLIENTS];
static int client_count = 0;

// 소켓을 논블로킹 모드로 설정
int set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags == -1) return -1;
    
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

// 새 클라이언트 등록
client_info_t* register_client(int fd) {
    if (client_count >= MAX_CLIENTS) {
        return NULL;
    }
    
    client_info_t* client = &clients[client_count++];
    client->fd = fd;
    client->buffer_pos = 0;
    client->last_activity = time(NULL);
    
    return client;
}

// 클라이언트 제거
void unregister_client(int fd) {
    for (int i = 0; i < client_count; i++) {
        if (clients[i].fd == fd) {
            // 마지막 클라이언트를 현재 위치로 이동
            clients[i] = clients[client_count - 1];
            client_count--;
            break;
        }
    }
}

// 클라이언트 찾기
client_info_t* find_client(int fd) {
    for (int i = 0; i < client_count; i++) {
        if (clients[i].fd == fd) {
            return &clients[i];
        }
    }
    return NULL;
}

// HTTP 요청 파싱 및 응답
void handle_http_request(client_info_t* client) {
    // 간단한 HTTP 요청 처리 (GET 요청만)
    if (strstr(client->buffer, "GET / ") != NULL) {
        const char* response = 
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/html\r\n"
            "Content-Length: 51\r\n"
            "Connection: keep-alive\r\n"
            "\r\n"
            "<html><body><h1>Hello, World!</h1></body></html>";
        
        send(client->fd, response, strlen(response), MSG_NOSIGNAL);
    }
    
    // 버퍼 리셋
    client->buffer_pos = 0;
    memset(client->buffer, 0, BUFFER_SIZE);
}

// 클라이언트 데이터 처리
void handle_client_data(int epoll_fd, client_info_t* client) {
    ssize_t bytes_read;
    
    // 논블로킹으로 데이터 읽기
    while ((bytes_read = recv(client->fd, 
                             client->buffer + client->buffer_pos,
                             BUFFER_SIZE - client->buffer_pos - 1, 
                             0)) > 0) {
        
        client->buffer_pos += bytes_read;
        client->buffer[client->buffer_pos] = '\0';
        client->last_activity = time(NULL);
        
        // HTTP 요청 완료 확인 (간단한 검사)
        if (strstr(client->buffer, "\r\n\r\n") != NULL) {
            handle_http_request(client);
        }
        
        // 버퍼 오버플로우 방지
        if (client->buffer_pos >= BUFFER_SIZE - 1) {
            printf("클라이언트 버퍼 오버플로우: fd=%d\n", client->fd);
            client->buffer_pos = 0;
            break;
        }
    }
    
    if (bytes_read == -1) {
        if (errno != EAGAIN && errno != EWOULDBLOCK) {
            perror("recv 오류");
            goto client_disconnect;
        }
    } else if (bytes_read == 0) {
        // 클라이언트 연결 종료
        goto client_disconnect;
    }
    
    return;

client_disconnect:
    printf("클라이언트 연결 종료: fd=%d\n", client->fd);
    epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client->fd, NULL);
    close(client->fd);
    unregister_client(client->fd);
}

// 비활성 클라이언트 정리
void cleanup_inactive_clients(int epoll_fd) {
    time_t now = time(NULL);
    const int timeout = 30;  // 30초 타임아웃
    
    for (int i = client_count - 1; i >= 0; i--) {
        if (now - clients[i].last_activity > timeout) {
            printf("비활성 클라이언트 정리: fd=%d\n", clients[i].fd);
            epoll_ctl(epoll_fd, EPOLL_CTL_DEL, clients[i].fd, NULL);
            close(clients[i].fd);
            
            // 배열에서 제거 (역순으로 처리하므로 안전)
            clients[i] = clients[client_count - 1];
            client_count--;
        }
    }
}

// epoll 기반 서버 메인 루프
void run_epoll_server(int port) {
    int server_fd, epoll_fd;
    struct sockaddr_in server_addr;
    struct epoll_event event, events[MAX_EVENTS];
    
    // 서버 소켓 생성
    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == -1) {
        perror("socket 생성 실패");
        return;
    }
    
    // 소켓 옵션 설정
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));
    
    // 논블로킹 모드 설정
    set_nonblocking(server_fd);
    
    // 서버 주소 설정
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(port);
    
    // 바인드 및 리슨
    if (bind(server_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) == -1) {
        perror("bind 실패");
        close(server_fd);
        return;
    }
    
    if (listen(server_fd, SOMAXCONN) == -1) {
        perror("listen 실패");
        close(server_fd);
        return;
    }
    
    // epoll 인스턴스 생성
    epoll_fd = epoll_create1(EPOLL_CLOEXEC);
    if (epoll_fd == -1) {
        perror("epoll_create1 실패");
        close(server_fd);
        return;
    }
    
    // 서버 소켓을 epoll에 추가
    event.events = EPOLLIN;
    event.data.fd = server_fd;
    if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, server_fd, &event) == -1) {
        perror("epoll_ctl 실패");
        close(server_fd);
        close(epoll_fd);
        return;
    }
    
    printf("epoll 서버 시작 (포트: %d)\n", port);
    
    time_t last_cleanup = time(NULL);
    
    // 메인 이벤트 루프
    while (1) {
        // 1초 타임아웃으로 epoll 대기
        int event_count = epoll_wait(epoll_fd, events, MAX_EVENTS, 1000);
        
        if (event_count == -1) {
            if (errno == EINTR) continue;  // 시그널에 의한 중단
            perror("epoll_wait 실패");
            break;
        }
        
        // 이벤트 처리
        for (int i = 0; i < event_count; i++) {
            if (events[i].data.fd == server_fd) {
                // 새로운 클라이언트 연결
                struct sockaddr_in client_addr;
                socklen_t client_len = sizeof(client_addr);
                
                int client_fd = accept(server_fd, 
                                     (struct sockaddr*)&client_addr, 
                                     &client_len);
                
                if (client_fd == -1) {
                    if (errno != EAGAIN && errno != EWOULDBLOCK) {
                        perror("accept 실패");
                    }
                    continue;
                }
                
                // 클라이언트 소켓을 논블로킹 모드로 설정
                if (set_nonblocking(client_fd) == -1) {
                    perror("논블로킹 설정 실패");
                    close(client_fd);
                    continue;
                }
                
                // 클라이언트 등록
                client_info_t* client = register_client(client_fd);
                if (!client) {
                    printf("최대 클라이언트 수 초과: %d\n", client_count);
                    close(client_fd);
                    continue;
                }
                
                // epoll에 클라이언트 소켓 추가
                event.events = EPOLLIN | EPOLLET;  // Edge-triggered 모드
                event.data.fd = client_fd;
                
                if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &event) == -1) {
                    perror("클라이언트 소켓 epoll_ctl 실패");
                    close(client_fd);
                    unregister_client(client_fd);
                    continue;
                }
                
                printf("새 클라이언트 연결: %s:%d (fd=%d, 총 %d개)\n",
                       inet_ntoa(client_addr.sin_addr),
                       ntohs(client_addr.sin_port),
                       client_fd, client_count);
                
            } else {
                // 클라이언트 데이터 처리
                client_info_t* client = find_client(events[i].data.fd);
                if (client) {
                    handle_client_data(epoll_fd, client);
                }
            }
        }
        
        // 주기적으로 비활성 클라이언트 정리 (5초마다)
        time_t now = time(NULL);
        if (now - last_cleanup > 5) {
            cleanup_inactive_clients(epoll_fd);
            last_cleanup = now;
        }
    }
    
    close(server_fd);
    close(epoll_fd);
}

int main() {
    run_epoll_server(8080);
    return 0;
}
```

## 네트워크 성능 최적화 기법

### TCP 소켓 튜닝

```c
// network_optimization.c - 네트워크 최적화 예제
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>

// TCP 소켓 최적화 설정
void optimize_tcp_socket(int socket_fd) {
    int opt;
    socklen_t optlen = sizeof(opt);
    
    printf("=== TCP 소켓 최적화 ===\n");
    
    // 1. TCP_NODELAY: Nagle 알고리즘 비활성화
    opt = 1;
    if (setsockopt(socket_fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt)) == 0) {
        printf("✓ TCP_NODELAY 활성화 (Nagle 알고리즘 비활성화)\n");
    }
    
    // 2. SO_REUSEADDR: 주소 재사용 허용
    opt = 1;
    if (setsockopt(socket_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) == 0) {
        printf("✓ SO_REUSEADDR 활성화\n");
    }
    
    // 3. SO_REUSEPORT: 포트 재사용 허용 (다중 프로세스)
    opt = 1;
    if (setsockopt(socket_fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt)) == 0) {
        printf("✓ SO_REUSEPORT 활성화\n");
    }
    
    // 4. 송신 버퍼 크기 최적화
    int original_sndbuf;
    getsockopt(socket_fd, SOL_SOCKET, SO_SNDBUF, &original_sndbuf, &optlen);
    
    opt = 1024 * 1024;  // 1MB
    if (setsockopt(socket_fd, SOL_SOCKET, SO_SNDBUF, &opt, sizeof(opt)) == 0) {
        printf("✓ 송신 버퍼 크기: %d → %d bytes\n", original_sndbuf, opt);
    }
    
    // 5. 수신 버퍼 크기 최적화
    int original_rcvbuf;
    getsockopt(socket_fd, SOL_SOCKET, SO_RCVBUF, &original_rcvbuf, &optlen);
    
    opt = 1024 * 1024;  // 1MB
    if (setsockopt(socket_fd, SOL_SOCKET, SO_RCVBUF, &opt, sizeof(opt)) == 0) {
        printf("✓ 수신 버퍼 크기: %d → %d bytes\n", original_rcvbuf, opt);
    }
    
    // 6. TCP_CORK: 작은 패킷들을 합쳐서 전송
    opt = 1;
    if (setsockopt(socket_fd, IPPROTO_TCP, TCP_CORK, &opt, sizeof(opt)) == 0) {
        printf("✓ TCP_CORK 활성화 (패킷 집적)\n");
    }
    
    // 7. TCP_QUICKACK: 빠른 ACK
    opt = 1;
    if (setsockopt(socket_fd, IPPROTO_TCP, TCP_QUICKACK, &opt, sizeof(opt)) == 0) {
        printf("✓ TCP_QUICKACK 활성화\n");
    }
    
    // 8. SO_KEEPALIVE: 연결 유지 확인
    opt = 1;
    if (setsockopt(socket_fd, SOL_SOCKET, SO_KEEPALIVE, &opt, sizeof(opt)) == 0) {
        printf("✓ SO_KEEPALIVE 활성화\n");
        
        // Keep-alive 파라미터 조정
        opt = 60;  // 60초 후 첫 번째 프로브
        setsockopt(socket_fd, IPPROTO_TCP, TCP_KEEPIDLE, &opt, sizeof(opt));
        
        opt = 5;   // 5초 간격으로 프로브
        setsockopt(socket_fd, IPPROTO_TCP, TCP_KEEPINTVL, &opt, sizeof(opt));
        
        opt = 3;   // 3번 실패하면 연결 종료
        setsockopt(socket_fd, IPPROTO_TCP, TCP_KEEPCNT, &opt, sizeof(opt));
    }
    
    printf("TCP 소켓 최적화 완료\n\n");
}

// 대량 데이터 전송을 위한 최적화된 send 함수
ssize_t optimized_send(int socket_fd, const void* data, size_t size) {
    const char* ptr = (const char*)data;
    size_t remaining = size;
    ssize_t total_sent = 0;
    
    // 큰 청크로 나누어 전송 (MTU 고려)
    const size_t chunk_size = 65536;  // 64KB
    
    while (remaining > 0) {
        size_t send_size = (remaining > chunk_size) ? chunk_size : remaining;
        
        ssize_t sent = send(socket_fd, ptr, send_size, MSG_NOSIGNAL);
        if (sent <= 0) {
            if (sent == -1 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
                // 논블로킹 소켓에서 일시적으로 보낼 수 없음
                usleep(1000);  // 1ms 대기
                continue;
            }
            return -1;  // 에러 발생
        }
        
        ptr += sent;
        remaining -= sent;
        total_sent += sent;
        
        // 진행률 표시 (대용량 데이터의 경우)
        if (size > 1024 * 1024 && total_sent % (1024 * 1024) == 0) {
            printf("전송 진행률: %.1f%%\r", 
                   (double)total_sent / size * 100);
            fflush(stdout);
        }
    }
    
    return total_sent;
}

// 네트워크 연결 상태 모니터링
void monitor_connection_stats(int socket_fd) {
    struct tcp_info info;
    socklen_t info_len = sizeof(info);
    
    if (getsockopt(socket_fd, IPPROTO_TCP, TCP_INFO, &info, &info_len) == 0) {
        printf("=== TCP 연결 통계 ===\n");
        printf("상태: %u\n", info.tcpi_state);
        printf("RTT: %u μs\n", info.tcpi_rtt);
        printf("RTT 변동: %u μs\n", info.tcpi_rttvar);
        printf("송신 MSS: %u bytes\n", info.tcpi_snd_mss);
        printf("수신 MSS: %u bytes\n", info.tcpi_rcv_mss);
        printf("혼잡 윈도우: %u\n", info.tcpi_snd_cwnd);
        printf("재전송 횟수: %u\n", info.tcpi_retransmits);
        printf("수신 윈도우: %u\n", info.tcpi_rcv_space);
    }
}

int main() {
    // 테스트를 위한 소켓 생성
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock >= 0) {
        optimize_tcp_socket(sock);
        
        // 실제 연결 후에 통계 확인 가능
        // monitor_connection_stats(sock);
        
        close(sock);
    }
    
    return 0;
}
```

### 제로 카피 기법

```c
// zero_copy.c - 제로 카피 전송 기법
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/sendfile.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <netinet/in.h>

// sendfile() 시스템 콜을 이용한 제로 카피 전송
ssize_t zero_copy_file_send(int socket_fd, const char* filename) {
    int file_fd = open(filename, O_RDONLY);
    if (file_fd == -1) {
        perror("파일 열기 실패");
        return -1;
    }
    
    struct stat st;
    fstat(file_fd, &st);
    size_t file_size = st.st_size;
    
    printf("제로 카피로 파일 전송 시작: %zu bytes\n", file_size);
    
    struct timeval start, end;
    gettimeofday(&start, NULL);
    
    // sendfile()로 커널에서 직접 전송 (유저 공간 복사 없음)
    off_t offset = 0;
    ssize_t total_sent = 0;
    
    while (offset < file_size) {
        ssize_t sent = sendfile(socket_fd, file_fd, &offset, 
                               file_size - offset);
        if (sent <= 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // 논블로킹 소켓에서 일시적 대기
                usleep(1000);
                continue;
            }
            perror("sendfile 실패");
            break;
        }
        total_sent += sent;
    }
    
    gettimeofday(&end, NULL);
    
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_usec - start.tv_usec) / 1000000.0;
    
    printf("제로 카피 전송 완료: %.2f초, %.2f MB/s\n", 
           elapsed, (file_size / 1024.0 / 1024.0) / elapsed);
    
    close(file_fd);
    return total_sent;
}

// splice() 시스템 콜을 이용한 파이프 기반 제로 카피
ssize_t zero_copy_pipe_transfer(int src_fd, int dst_fd, size_t len) {
    int pipe_fds[2];
    if (pipe(pipe_fds) == -1) {
        perror("파이프 생성 실패");
        return -1;
    }
    
    printf("splice를 이용한 제로 카피 전송\n");
    
    struct timeval start, end;
    gettimeofday(&start, NULL);
    
    ssize_t total_transferred = 0;
    
    while (total_transferred < len) {
        size_t chunk_size = (len - total_transferred > 65536) ? 
                           65536 : (len - total_transferred);
        
        // 소스에서 파이프로 splice
        ssize_t bytes_to_pipe = splice(src_fd, NULL, pipe_fds[1], NULL,
                                      chunk_size, SPLICE_F_MOVE | SPLICE_F_MORE);
        
        if (bytes_to_pipe <= 0) {
            if (errno == EAGAIN) {
                usleep(1000);
                continue;
            }
            break;
        }
        
        // 파이프에서 목적지로 splice
        ssize_t bytes_from_pipe = splice(pipe_fds[0], NULL, dst_fd, NULL,
                                        bytes_to_pipe, SPLICE_F_MOVE | SPLICE_F_MORE);
        
        if (bytes_from_pipe <= 0) {
            break;
        }
        
        total_transferred += bytes_from_pipe;
    }
    
    gettimeofday(&end, NULL);
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_usec - start.tv_usec) / 1000000.0;
    
    printf("splice 전송 완료: %zd bytes, %.2f초, %.2f MB/s\n",
           total_transferred, elapsed, 
           (total_transferred / 1024.0 / 1024.0) / elapsed);
    
    close(pipe_fds[0]);
    close(pipe_fds[1]);
    
    return total_transferred;
}

// 벡터 I/O (scatter-gather)를 이용한 효율적 전송
#include <sys/uio.h>

ssize_t vectorized_send(int socket_fd, struct iovec* iov, int iovcnt) {
    // writev()로 여러 버퍼를 한 번에 전송
    ssize_t total_sent = 0;
    int current_iov = 0;
    
    printf("벡터 I/O 전송 시작 (%d개 벡터)\n", iovcnt);
    
    while (current_iov < iovcnt) {
        ssize_t sent = writev(socket_fd, &iov[current_iov], iovcnt - current_iov);
        
        if (sent <= 0) {
            if (sent == -1 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
                usleep(1000);
                continue;
            }
            return -1;
        }
        
        total_sent += sent;
        
        // 전송된 만큼 iovec 조정
        while (current_iov < iovcnt && sent >= iov[current_iov].iov_len) {
            sent -= iov[current_iov].iov_len;
            current_iov++;
        }
        
        if (current_iov < iovcnt) {
            iov[current_iov].iov_base = (char*)iov[current_iov].iov_base + sent;
            iov[current_iov].iov_len -= sent;
        }
    }
    
    printf("벡터 I/O 전송 완료: %zd bytes\n", total_sent);
    return total_sent;
}

// HTTP 응답 예시 (헤더 + 바디를 vectorized I/O로 전송)
void send_http_response(int client_fd, const char* body, size_t body_len) {
    char header[512];
    snprintf(header, sizeof(header),
             "HTTP/1.1 200 OK\r\n"
             "Content-Type: text/html\r\n"
             "Content-Length: %zu\r\n"
             "Connection: keep-alive\r\n"
             "Server: High-Performance/1.0\r\n"
             "\r\n", body_len);
    
    // vectorized I/O로 헤더와 바디를 한 번에 전송
    struct iovec iov[2];
    iov[0].iov_base = header;
    iov[0].iov_len = strlen(header);
    iov[1].iov_base = (void*)body;
    iov[1].iov_len = body_len;
    
    struct timeval start, end;
    gettimeofday(&start, NULL);
    
    ssize_t sent = vectorized_send(client_fd, iov, 2);
    
    gettimeofday(&end, NULL);
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_usec - start.tv_usec) / 1000000.0;
    
    printf("HTTP 응답 전송: %zd bytes, %.4f초\n", sent, elapsed);
}

// 성능 비교: 일반 I/O vs 제로 카피
void performance_comparison() {
    const char* test_file = "large_test_file.bin";
    const size_t file_size = 100 * 1024 * 1024;  // 100MB
    
    // 테스트 파일 생성
    printf("테스트 파일 생성 중...\n");
    int fd = open(test_file, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    char* buffer = malloc(1024 * 1024);
    memset(buffer, 'A', 1024 * 1024);
    
    for (int i = 0; i < 100; i++) {
        write(fd, buffer, 1024 * 1024);
    }
    close(fd);
    free(buffer);
    
    // 더미 소켓 (실제로는 네트워크 연결된 소켓 사용)
    int dummy_socket = open("/dev/null", O_WRONLY);
    
    if (dummy_socket >= 0) {
        printf("\n=== 성능 비교 테스트 ===\n");
        
        // 제로 카피 전송 테스트
        zero_copy_file_send(dummy_socket, test_file);
        
        close(dummy_socket);
    }
    
    // 정리
    unlink(test_file);
}

int main() {
    performance_comparison();
    
    // HTTP 응답 예제
    const char* html_body = 
        "<html><body><h1>Zero-Copy HTTP Response</h1>"
        "<p>This response was sent using vectorized I/O.</p>"
        "</body></html>";
    
    // 실제 사용 시에는 클라이언트 소켓 사용
    // send_http_response(client_socket, html_body, strlen(html_body));
    
    return 0;
}
```

### 고성능 연결 풀 관리

```c
// connection_pool.c - 고성능 연결 풀 구현
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <pthread.h>
#include <time.h>

#define MAX_CONNECTIONS 1000
#define POOL_TIMEOUT 30

typedef struct connection {
    int fd;
    char host[64];
    int port;
    time_t last_used;
    time_t created;
    int in_use;
    struct connection* next;
} connection_t;

typedef struct {
    connection_t* connections;
    int count;
    int max_size;
    pthread_mutex_t mutex;
} connection_pool_t;

static connection_pool_t pool = {NULL, 0, MAX_CONNECTIONS, PTHREAD_MUTEX_INITIALIZER};

// 새 연결 생성
connection_t* create_connection(const char* host, int port) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd == -1) {
        perror("소켓 생성 실패");
        return NULL;
    }
    
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    inet_pton(AF_INET, host, &addr.sin_addr);
    
    if (connect(fd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
        perror("연결 실패");
        close(fd);
        return NULL;
    }
    
    // 연결 최적화
    int opt = 1;
    setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt));
    setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &opt, sizeof(opt));
    
    connection_t* conn = malloc(sizeof(connection_t));
    conn->fd = fd;
    strncpy(conn->host, host, sizeof(conn->host) - 1);
    conn->port = port;
    conn->last_used = time(NULL);
    conn->created = time(NULL);
    conn->in_use = 0;
    conn->next = NULL;
    
    printf("새 연결 생성: %s:%d (fd=%d)\n", host, port, fd);
    
    return conn;
}

// 연결 풀에서 연결 획득
connection_t* get_connection(const char* host, int port) {
    pthread_mutex_lock(&pool.mutex);
    
    // 기존 연결 중에서 재사용 가능한 것 찾기
    connection_t* conn = pool.connections;
    connection_t* prev = NULL;
    
    while (conn) {
        if (!conn->in_use && 
            strcmp(conn->host, host) == 0 && 
            conn->port == port &&
            (time(NULL) - conn->last_used) < POOL_TIMEOUT) {
            
            // 연결 유효성 검사 (간단한 체크)
            int error = 0;
            socklen_t len = sizeof(error);
            if (getsockopt(conn->fd, SOL_SOCKET, SO_ERROR, &error, &len) == 0 && 
                error == 0) {
                
                conn->in_use = 1;
                conn->last_used = time(NULL);
                
                printf("연결 재사용: %s:%d (fd=%d)\n", host, port, conn->fd);
                pthread_mutex_unlock(&pool.mutex);
                return conn;
            } else {
                // 연결이 끊어짐 - 제거
                printf("끊어진 연결 제거: %s:%d (fd=%d)\n", host, port, conn->fd);
                close(conn->fd);
                
                if (prev) {
                    prev->next = conn->next;
                } else {
                    pool.connections = conn->next;
                }
                
                connection_t* to_free = conn;
                conn = conn->next;
                free(to_free);
                pool.count--;
                continue;
            }
        }
        
        prev = conn;
        conn = conn->next;
    }
    
    // 새 연결 생성
    if (pool.count < pool.max_size) {
        conn = create_connection(host, port);
        if (conn) {
            conn->in_use = 1;
            conn->next = pool.connections;
            pool.connections = conn;
            pool.count++;
        }
    } else {
        printf("연결 풀 포화 상태\n");
        conn = NULL;
    }
    
    pthread_mutex_unlock(&pool.mutex);
    return conn;
}

// 연결 반환
void return_connection(connection_t* conn) {
    if (!conn) return;
    
    pthread_mutex_lock(&pool.mutex);
    conn->in_use = 0;
    conn->last_used = time(NULL);
    pthread_mutex_unlock(&pool.mutex);
    
    printf("연결 반환: %s:%d (fd=%d)\n", conn->host, conn->port, conn->fd);
}

// 만료된 연결 정리
void cleanup_expired_connections() {
    pthread_mutex_lock(&pool.mutex);
    
    connection_t* conn = pool.connections;
    connection_t* prev = NULL;
    time_t now = time(NULL);
    
    while (conn) {
        if (!conn->in_use && (now - conn->last_used) > POOL_TIMEOUT) {
            printf("만료된 연결 제거: %s:%d (fd=%d, 유휴시간: %ld초)\n", 
                   conn->host, conn->port, conn->fd, now - conn->last_used);
            
            close(conn->fd);
            
            if (prev) {
                prev->next = conn->next;
            } else {
                pool.connections = conn->next;
            }
            
            connection_t* to_free = conn;
            conn = conn->next;
            free(to_free);
            pool.count--;
            continue;
        }
        
        prev = conn;
        conn = conn->next;
    }
    
    pthread_mutex_unlock(&pool.mutex);
}

// 연결 풀 통계 출력
void print_pool_stats() {
    pthread_mutex_lock(&pool.mutex);
    
    int in_use_count = 0;
    int idle_count = 0;
    connection_t* conn = pool.connections;
    
    while (conn) {
        if (conn->in_use) {
            in_use_count++;
        } else {
            idle_count++;
        }
        conn = conn->next;
    }
    
    printf("=== 연결 풀 통계 ===\n");
    printf("총 연결: %d\n", pool.count);
    printf("사용 중: %d\n", in_use_count);
    printf("유휴 상태: %d\n", idle_count);
    printf("최대 크기: %d\n", pool.max_size);
    
    pthread_mutex_unlock(&pool.mutex);
}

// HTTP 요청 예제
int send_http_request(const char* host, int port, const char* path) {
    connection_t* conn = get_connection(host, port);
    if (!conn) {
        printf("연결 획득 실패\n");
        return -1;
    }
    
    char request[1024];
    snprintf(request, sizeof(request),
             "GET %s HTTP/1.1\r\n"
             "Host: %s\r\n"
             "Connection: keep-alive\r\n"
             "\r\n", path, host);
    
    // 요청 전송
    if (send(conn->fd, request, strlen(request), MSG_NOSIGNAL) < 0) {
        perror("요청 전송 실패");
        return_connection(conn);
        return -1;
    }
    
    // 응답 수신 (간단한 예제)
    char response[4096];
    ssize_t received = recv(conn->fd, response, sizeof(response) - 1, 0);
    if (received > 0) {
        response[received] = '\0';
        printf("응답 수신: %zd bytes\n", received);
        // printf("내용:\n%s\n", response);  // 실제 응답 내용 출력
    }
    
    return_connection(conn);
    return 0;
}

// 정리 스레드
void* cleanup_thread(void* arg) {
    while (1) {
        sleep(10);  // 10초마다 정리
        cleanup_expired_connections();
        print_pool_stats();
    }
    return NULL;
}

int main() {
    // 정리 스레드 시작
    pthread_t cleanup_tid;
    pthread_create(&cleanup_tid, NULL, cleanup_thread, NULL);
    
    // 테스트 요청들
    printf("=== HTTP 요청 테스트 ===\n");
    
    for (int i = 0; i < 5; i++) {
        send_http_request("httpbin.org", 80, "/get");
        sleep(1);
    }
    
    // 통계 출력
    print_pool_stats();
    
    // 종료 시 모든 연결 정리
    pthread_mutex_lock(&pool.mutex);
    connection_t* conn = pool.connections;
    while (conn) {
        connection_t* next = conn->next;
        close(conn->fd);
        free(conn);
        conn = next;
    }
    pthread_mutex_unlock(&pool.mutex);
    
    printf("프로그램 종료\n");
    return 0;
}
```

## 핵심 요점

### 1. epoll의 효율성

epoll은 O(1) 성능으로 수만 개의 동시 연결을 효율적으로 처리할 수 있습니다.

### 2. TCP 소켓 튜닝의 중요성

적절한 버퍼 크기, Nagle 알고리즘 비활성화, Keep-alive 설정 등이 성능에 큰 영향을 미칩니다.

### 3. 제로 카피 기법의 위력

sendfile()과 splice()를 통해 CPU 사용량을 크게 줄이고 처리량을 향상시킬 수 있습니다.

### 4. 연결 풀의 필요성

연결 생성/해제 오버헤드를 줄이고 리소스를 효율적으로 관리할 수 있습니다.

---

**이전**: [고급 비동기 I/O 최적화](11-04-02-async-io-optimization.md)  
**다음**: [디스크 I/O 및 모니터링](11-06-01-disk-io-monitoring.md)에서 파일 시스템 최적화와 모니터링을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 인프라스트럭처
-**예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-11-performance-optimization)

- [11.1.2: 성능 분석 방법론](./11-01-02-performance-methodology.md)
- [11.2 CPU 성능 최적화](./11-03-01-cpu-optimization.md)
- [11.3 메모리 성능 최적화](./11-02-04-memory-optimization.md)
- [11.3a 메모리 계층구조와 캐시 최적화](./11-02-01-memory-hierarchy-cache.md)
- [11.3b 메모리 할당 최적화](./11-02-02-memory-allocation.md)

### 🏷️ 관련 키워드

`epoll`, `zero-copy`, `sendfile`, `splice`, `TCP optimization`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
