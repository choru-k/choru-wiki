---
tags:
  - Network
  - Socket
  - TCP
  - UDP
  - Linux
  - Programming
  - IO
  - System
---

# Socket Programming: 네트워크 통신의 핵심 기술

## 들어가며

"왜 우리 서버는 동시 접속자 수천 명만 되어도 느려질까?"

프로덕션 환경에서 네트워크 성능 문제에 직면했을 때, socket programming의 깊은 이해 없이는 근본적인 해결책을 찾기 어렵습니다. Socket은 네트워크 프로그래밍의 기초이자 고성능 서버 개발의 핵심입니다. Berkeley Socket API부터 최신 비동기 I/O까지, 실제 production 환경에서 검증된 기술들을 살펴보겠습니다.

## Socket이란 무엇인가?

### 네트워크 통신의 추상화

Socket은 **네트워크 통신을 위한 endpoint**입니다. 파일과 같은 인터페이스를 제공하여 네트워크 I/O를 file descriptor를 통해 처리할 수 있게 합니다.

```text
Application Layer
┌─────────────────────────────────────┐
│        Socket API                   │
│  ┌─────────┐      ┌─────────┐       │
│  │ Client  │◄────►│ Server  │       │
│  │ Socket  │      │ Socket  │       │
│  └─────────┘      └─────────┘       │
└─────────────────────────────────────┘
              │
              ▼
Transport Layer (TCP/UDP)
┌─────────────────────────────────────┐
│         Kernel Space                │
│  ┌─────────────────────────────────┐│
│  │     Network Stack               ││
│  │  TCP/UDP ► IP ► Ethernet        ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Socket의 종류

```c
// 네트워크 소켓 (인터넷 통신)
int network_socket = socket(AF_INET, SOCK_STREAM, 0);    // TCP
int udp_socket = socket(AF_INET, SOCK_DGRAM, 0);        // UDP

// Unix Domain Socket (로컬 IPC)
int unix_socket = socket(AF_UNIX, SOCK_STREAM, 0);      // Local TCP-like
int unix_dgram = socket(AF_UNIX, SOCK_DGRAM, 0);       // Local UDP-like

// IPv6 소켓
int ipv6_socket = socket(AF_INET6, SOCK_STREAM, 0);
```

## Socket System Call API

### 기본 Socket API 흐름

```text
Server                          Client
───────                         ───────

socket()                        socket()
   │                               │
   ▼                               │
bind()                             │
   │                               │
   ▼                               │
listen()                           │
   │                               │
   ▼                               ▼
accept() ◄─────────────────── connect()
   │                               │
   ▼                               ▼
read()/write() ◄─────────────► read()/write()
   │                               │
   ▼                               ▼
close()                         close()
```

### socket() - Socket 생성

```c
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

// TCP 서버 소켓 생성
int create_tcp_server_socket(int port) {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == -1) {
        perror("socket creation failed");
        return -1;
    }

    // SO_REUSEADDR 설정 (중요!)
    int opt = 1;
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR,
                   &opt, sizeof(opt)) == -1) {
        perror("setsockopt SO_REUSEADDR failed");
        close(server_fd);
        return -1;
    }

    // 주소 구조체 설정
    struct sockaddr_in server_addr = {0};
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;  // 모든 인터페이스
    server_addr.sin_port = htons(port);

    return server_fd;
}
```

### bind() - 주소 바인딩

```c
int setup_server_binding(int server_fd, int port) {
    struct sockaddr_in server_addr = {0};
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(port);

    if (bind(server_fd, (struct sockaddr*)&server_addr,
             sizeof(server_addr)) == -1) {
        perror("bind failed");
        return -1;
    }

    printf("Server bound to port %d, ", port);
    return 0;
}

// 특정 인터페이스에 바인딩
int bind_to_interface(int server_fd, const char *ip, int port) {
    struct sockaddr_in server_addr = {0};
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(port);

    if (inet_pton(AF_INET, ip, &server_addr.sin_addr) <= 0) {
        fprintf(stderr, "Invalid IP address: %s, ", ip);
        return -1;
    }

    if (bind(server_fd, (struct sockaddr*)&server_addr,
             sizeof(server_addr)) == -1) {
        perror("bind to interface failed");
        return -1;
    }

    printf("Server bound to %s:%d, ", ip, port);
    return 0;
}
```

### listen() - 연결 대기

```c
int start_listening(int server_fd, int backlog) {
    if (listen(server_fd, backlog) == -1) {
        perror("listen failed");
        return -1;
    }

    printf("Server listening with backlog %d, ", backlog);
    return 0;
}

// 최적화된 backlog 설정
int setup_optimized_listener(int server_fd) {
    // 시스템 최대값 확인
    FILE *f = fopen("/proc/sys/net/core/somaxconn", "r");
    int max_backlog = 128;  // 기본값

    if (f) {
        fscanf(f, "%d", &max_backlog);
        fclose(f);
    }

    // 일반적으로 시스템 최대값을 사용
    if (listen(server_fd, max_backlog) == -1) {
        perror("listen failed");
        return -1;
    }

    printf("Server listening with backlog %d (system max), ", max_backlog);
    return 0;
}
```

### accept() - 연결 수락

```c
int accept_client_connection(int server_fd) {
    struct sockaddr_in client_addr;
    socklen_t client_len = sizeof(client_addr);

    int client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &client_len);
    if (client_fd == -1) {
        perror("accept failed");
        return -1;
    }

    // 클라이언트 정보 출력
    char client_ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &client_addr.sin_addr, client_ip, sizeof(client_ip));
    printf("Client connected from %s:%d (fd=%d), ",
           client_ip, ntohs(client_addr.sin_port), client_fd);

    return client_fd;
}

// 논블로킹 accept (고급)
int accept_nonblocking(int server_fd) {
    struct sockaddr_in client_addr;
    socklen_t client_len = sizeof(client_addr);

    int client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &client_len);

    if (client_fd == -1) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            // 더 이상 대기 중인 연결 없음 (정상)
            return 0;
        } else {
            perror("accept failed");
            return -1;
        }
    }

    // 클라이언트 소켓도 논블로킹으로 설정
    int flags = fcntl(client_fd, F_GETFL);
    fcntl(client_fd, F_SETFL, flags | O_NONBLOCK);

    return client_fd;
}
```

### connect() - 서버 연결

```c
int connect_to_server(const char *server_ip, int port) {
    int client_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (client_fd == -1) {
        perror("socket creation failed");
        return -1;
    }

    struct sockaddr_in server_addr = {0};
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(port);

    if (inet_pton(AF_INET, server_ip, &server_addr.sin_addr) <= 0) {
        fprintf(stderr, "Invalid server IP: %s, ", server_ip);
        close(client_fd);
        return -1;
    }

    if (connect(client_fd, (struct sockaddr*)&server_addr,
                sizeof(server_addr)) == -1) {
        perror("connect failed");
        close(client_fd);
        return -1;
    }

    printf("Connected to %s:%d, ", server_ip, port);
    return client_fd;
}

// 타임아웃이 있는 connect
int connect_with_timeout(const char *server_ip, int port, int timeout_sec) {
    int client_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (client_fd == -1) return -1;

    // 논블로킹 모드 설정
    int flags = fcntl(client_fd, F_GETFL);
    fcntl(client_fd, F_SETFL, flags | O_NONBLOCK);

    struct sockaddr_in server_addr = {0};
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(port);
    inet_pton(AF_INET, server_ip, &server_addr.sin_addr);

    int result = connect(client_fd, (struct sockaddr*)&server_addr,
                        sizeof(server_addr));

    if (result == 0) {
        // 즉시 연결됨
        fcntl(client_fd, F_SETFL, flags);  // 원래 모드로 복구
        return client_fd;
    }

    if (errno != EINPROGRESS) {
        close(client_fd);
        return -1;
    }

    // select로 연결 완료 대기
    fd_set write_fds;
    struct timeval timeout = {timeout_sec, 0};

    FD_ZERO(&write_fds);
    FD_SET(client_fd, &write_fds);

    result = select(client_fd + 1, NULL, &write_fds, NULL, &timeout);

    if (result <= 0) {
        close(client_fd);
        return -1;  // 타임아웃 또는 에러
    }

    // 연결 상태 확인
    int error;
    socklen_t len = sizeof(error);
    getsockopt(client_fd, SOL_SOCKET, SO_ERROR, &error, &len);

    if (error != 0) {
        close(client_fd);
        return -1;
    }

    fcntl(client_fd, F_SETFL, flags);  // 원래 모드로 복구
    return client_fd;
}
```

## TCP vs UDP 소켓

### TCP Socket (SOCK_STREAM)

**특징:**

- 연결 지향적 (Connection-oriented)
- 신뢰성 있는 데이터 전송
- 순서 보장
- 흐름 제어와 혼잡 제어

```c
// TCP 에코 서버 구현
void tcp_echo_server(int port) {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(port);

    bind(server_fd, (struct sockaddr*)&addr, sizeof(addr));
    listen(server_fd, SOMAXCONN);

    printf("TCP Echo Server listening on port %d, ", port);

    while (1) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);

        int client_fd = accept(server_fd, (struct sockaddr*)&client_addr, &client_len);
        if (client_fd == -1) continue;

        // 클라이언트 처리 (간단한 버전)
        char buffer[8192];
        ssize_t bytes_read;

        while ((bytes_read = read(client_fd, buffer, sizeof(buffer))) > 0) {
            // 에코: 받은 데이터를 그대로 전송
            ssize_t bytes_written = write(client_fd, buffer, bytes_read);

            if (bytes_written != bytes_read) {
                fprintf(stderr, "Partial write occurred, ");
                break;
            }
        }

        close(client_fd);
        printf("Client disconnected, ");
    }

    close(server_fd);
}

// TCP 클라이언트
void tcp_client_example(const char *server_ip, int port) {
    int client_fd = connect_to_server(server_ip, port);
    if (client_fd == -1) return;

    const char *message = "Hello, TCP Server!";
    write(client_fd, message, strlen(message));

    char response[1024];
    ssize_t bytes_read = read(client_fd, response, sizeof(response) - 1);

    if (bytes_read > 0) {
        response[bytes_read] = '\0';
        printf("Server response: %s, ", response);
    }

    close(client_fd);
}
```

### UDP Socket (SOCK_DGRAM)

**특징:**

- 비연결형 (Connectionless)
- 빠르고 오버헤드가 적음
- 순서 보장 안됨
- 데이터 손실 가능

```c
// UDP 에코 서버
void udp_echo_server(int port) {
    int server_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (server_fd == -1) {
        perror("UDP socket creation failed");
        return;
    }

    struct sockaddr_in server_addr = {0};
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(port);

    if (bind(server_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) == -1) {
        perror("UDP bind failed");
        close(server_fd);
        return;
    }

    printf("UDP Echo Server listening on port %d, ", port);

    char buffer[8192];
    struct sockaddr_in client_addr;
    socklen_t client_len;

    while (1) {
        client_len = sizeof(client_addr);

        // UDP는 recvfrom/sendto 사용
        ssize_t bytes_received = recvfrom(server_fd, buffer, sizeof(buffer), 0,
                                         (struct sockaddr*)&client_addr, &client_len);

        if (bytes_received > 0) {
            char client_ip[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &client_addr.sin_addr, client_ip, sizeof(client_ip));

            printf("Received %zd bytes from %s:%d, ",
                   bytes_received, client_ip, ntohs(client_addr.sin_port));

            // 에코: 같은 클라이언트로 다시 전송
            sendto(server_fd, buffer, bytes_received, 0,
                   (struct sockaddr*)&client_addr, client_len);
        }
    }

    close(server_fd);
}

// UDP 클라이언트
void udp_client_example(const char *server_ip, int port) {
    int client_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (client_fd == -1) return;

    struct sockaddr_in server_addr = {0};
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(port);
    inet_pton(AF_INET, server_ip, &server_addr.sin_addr);

    const char *message = "Hello, UDP Server!";

    // UDP 전송
    sendto(client_fd, message, strlen(message), 0,
           (struct sockaddr*)&server_addr, sizeof(server_addr));

    // 응답 수신
    char response[1024];
    struct sockaddr_in response_addr;
    socklen_t addr_len = sizeof(response_addr);

    ssize_t bytes_received = recvfrom(client_fd, response, sizeof(response) - 1, 0,
                                     (struct sockaddr*)&response_addr, &addr_len);

    if (bytes_received > 0) {
        response[bytes_received] = '\0';
        printf("Server response: %s, ", response);
    }

    close(client_fd);
}
```

## Socket Options과 setsockopt

### 필수 Socket Options

```c
#include <sys/socket.h>
#include <netinet/tcp.h>

// 기본적인 소켓 옵션 설정
int setup_socket_options(int sockfd) {
    int opt = 1;

    // 1. SO_REUSEADDR: 주소 재사용 (TIME_WAIT 상태 무시)
    if (setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) == -1) {
        perror("setsockopt SO_REUSEADDR failed");
        return -1;
    }

    // 2. SO_REUSEPORT: 포트 재사용 (load balancing)
    if (setsockopt(sockfd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt)) == -1) {
        perror("setsockopt SO_REUSEPORT failed");
        // 이 옵션은 선택사항이므로 실패해도 계속 진행
    }

    // 3. TCP_NODELAY: Nagle 알고리즘 비활성화
    if (setsockopt(sockfd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt)) == -1) {
        perror("setsockopt TCP_NODELAY failed");
        return -1;
    }

    // 4. SO_KEEPALIVE: TCP keepalive 활성화
    if (setsockopt(sockfd, SOL_SOCKET, SO_KEEPALIVE, &opt, sizeof(opt)) == -1) {
        perror("setsockopt SO_KEEPALIVE failed");
        return -1;
    }

    return 0;
}
```

### 고급 Socket Options

```c
// 성능 최적화를 위한 고급 옵션들
int setup_high_performance_options(int sockfd) {
    // 1. 송신/수신 버퍼 크기 설정
    int send_buffer_size = 256 * 1024;    // 256KB
    int recv_buffer_size = 256 * 1024;    // 256KB

    setsockopt(sockfd, SOL_SOCKET, SO_SNDBUF,
               &send_buffer_size, sizeof(send_buffer_size));
    setsockopt(sockfd, SOL_SOCKET, SO_RCVBUF,
               &recv_buffer_size, sizeof(recv_buffer_size));

    // 2. Linger 옵션 설정 (graceful close)
    struct linger ling = {1, 5};  // 5초간 대기 후 강제 종료
    setsockopt(sockfd, SOL_SOCKET, SO_LINGER, &ling, sizeof(ling));

    // 3. TCP keepalive 세부 설정
    int keepalive_time = 120;      // 120초 후 keepalive 시작
    int keepalive_intvl = 30;      // 30초 간격으로 probe
    int keepalive_probes = 3;      // 3번 실패하면 연결 끊김

    setsockopt(sockfd, IPPROTO_TCP, TCP_KEEPIDLE,
               &keepalive_time, sizeof(keepalive_time));
    setsockopt(sockfd, IPPROTO_TCP, TCP_KEEPINTVL,
               &keepalive_intvl, sizeof(keepalive_intvl));
    setsockopt(sockfd, IPPROTO_TCP, TCP_KEEPCNT,
               &keepalive_probes, sizeof(keepalive_probes));

    // 4. 수신 타임아웃 설정
    struct timeval timeout = {10, 0};  // 10초 타임아웃
    setsockopt(sockfd, SOL_SOCKET, SO_RCVTIMEO,
               &timeout, sizeof(timeout));

    return 0;
}

// 소켓 상태 정보 조회
void print_socket_info(int sockfd) {
    int opt_val;
    socklen_t opt_len = sizeof(opt_val);

    // 송신 버퍼 크기
    getsockopt(sockfd, SOL_SOCKET, SO_SNDBUF, &opt_val, &opt_len);
    printf("Send buffer size: %d bytes, ", opt_val);

    // 수신 버퍼 크기
    getsockopt(sockfd, SOL_SOCKET, SO_RCVBUF, &opt_val, &opt_len);
    printf("Receive buffer size: %d bytes, ", opt_val);

    // TCP_NODELAY 상태
    getsockopt(sockfd, IPPROTO_TCP, TCP_NODELAY, &opt_val, &opt_len);
    printf("TCP_NODELAY: %s, ", opt_val ? "enabled" : "disabled");

    // SO_KEEPALIVE 상태
    getsockopt(sockfd, SOL_SOCKET, SO_KEEPALIVE, &opt_val, &opt_len);
    printf("SO_KEEPALIVE: %s, ", opt_val ? "enabled" : "disabled");
}
```

## Non-blocking Sockets과 비동기 I/O

### Non-blocking Socket 설정

```c
#include <fcntl.h>
#include <errno.h>

// 소켓을 논블로킹 모드로 설정
int set_nonblocking(int sockfd) {
    int flags = fcntl(sockfd, F_GETFL, 0);
    if (flags == -1) {
        perror("fcntl F_GETFL");
        return -1;
    }

    if (fcntl(sockfd, F_SETFL, flags | O_NONBLOCK) == -1) {
        perror("fcntl F_SETFL O_NONBLOCK");
        return -1;
    }

    return 0;
}

// 논블로킹 모드에서의 안전한 read
ssize_t safe_read(int sockfd, void *buffer, size_t count) {
    ssize_t total_read = 0;
    char *buf = (char*)buffer;

    while (total_read < count) {
        ssize_t bytes_read = read(sockfd, buf + total_read, count - total_read);

        if (bytes_read > 0) {
            total_read += bytes_read;
        } else if (bytes_read == 0) {
            // EOF: 연결 종료
            break;
        } else {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // 더 이상 읽을 데이터 없음 (논블로킹에서 정상)
                break;
            } else if (errno == EINTR) {
                // 시그널 인터럽트: 재시도
                continue;
            } else {
                // 실제 에러
                return -1;
            }
        }
    }

    return total_read;
}

// 논블로킹 모드에서의 안전한 write
ssize_t safe_write(int sockfd, const void *buffer, size_t count) {
    ssize_t total_written = 0;
    const char *buf = (const char*)buffer;

    while (total_written < count) {
        ssize_t bytes_written = write(sockfd, buf + total_written,
                                     count - total_written);

        if (bytes_written > 0) {
            total_written += bytes_written;
        } else if (bytes_written == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // 송신 버퍼 가득참: 나중에 다시 시도 필요
                break;
            } else if (errno == EINTR) {
                // 시그널 인터럽트: 재시도
                continue;
            } else {
                // 실제 에러
                return -1;
            }
        }
    }

    return total_written;
}
```

### select()를 사용한 다중 I/O

```c
#include <sys/select.h>

// select를 사용한 다중 클라이언트 처리
void handle_multiple_clients_select(int server_fd) {
    fd_set master_set, read_set;
    int max_fd = server_fd;

    FD_ZERO(&master_set);
    FD_SET(server_fd, &master_set);

    printf("Server started. Waiting for connections..., ");

    while (1) {
        read_set = master_set;  // master_set 복사

        // select: 읽기 가능한 파일 디스크립터 대기
        int activity = select(max_fd + 1, &read_set, NULL, NULL, NULL);

        if (activity == -1) {
            perror("select failed");
            break;
        }

        // 모든 파일 디스크립터 확인
        for (int fd = 0; fd <= max_fd; fd++) {
            if (FD_ISSET(fd, &read_set)) {
                if (fd == server_fd) {
                    // 새로운 연결
                    struct sockaddr_in client_addr;
                    socklen_t client_len = sizeof(client_addr);

                    int client_fd = accept(server_fd,
                                          (struct sockaddr*)&client_addr,
                                          &client_len);

                    if (client_fd != -1) {
                        FD_SET(client_fd, &master_set);
                        if (client_fd > max_fd) {
                            max_fd = client_fd;
                        }

                        char client_ip[INET_ADDRSTRLEN];
                        inet_ntop(AF_INET, &client_addr.sin_addr,
                                 client_ip, sizeof(client_ip));
                        printf("New client: %s:%d (fd=%d), ",
                               client_ip, ntohs(client_addr.sin_port), client_fd);
                    }
                } else {
                    // 기존 클라이언트에서 데이터
                    char buffer[8192];
                    ssize_t bytes_read = read(fd, buffer, sizeof(buffer));

                    if (bytes_read <= 0) {
                        // 연결 종료 또는 에러
                        printf("Client disconnected (fd=%d), ", fd);
                        close(fd);
                        FD_CLR(fd, &master_set);
                    } else {
                        // 에코: 모든 클라이언트에게 브로드캐스트
                        for (int i = 0; i <= max_fd; i++) {
                            if (FD_ISSET(i, &master_set) && i != server_fd && i != fd) {
                                write(i, buffer, bytes_read);
                            }
                        }
                    }
                }
            }
        }
    }
}
```

### epoll을 사용한 고성능 비동기 I/O

```c
#include <sys/epoll.h>

#define MAX_EVENTS 1000

// epoll을 사용한 고성능 서버
void high_performance_server(int port) {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    setup_socket_options(server_fd);
    set_nonblocking(server_fd);

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(port);

    bind(server_fd, (struct sockaddr*)&addr, sizeof(addr));
    listen(server_fd, SOMAXCONN);

    // epoll 인스턴스 생성
    int epoll_fd = epoll_create1(EPOLL_CLOEXEC);
    if (epoll_fd == -1) {
        perror("epoll_create1 failed");
        return;
    }

    // 서버 소켓을 epoll에 추가
    struct epoll_event event;
    event.events = EPOLLIN | EPOLLET;  // Edge-triggered
    event.data.fd = server_fd;
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, server_fd, &event);

    struct epoll_event events[MAX_EVENTS];
    printf("High-performance server listening on port %d, ", port);

    while (1) {
        int nready = epoll_wait(epoll_fd, events, MAX_EVENTS, -1);

        for (int i = 0; i < nready; i++) {
            int fd = events[i].data.fd;

            if (fd == server_fd) {
                // 새 연결 처리
                while (1) {
                    struct sockaddr_in client_addr;
                    socklen_t client_len = sizeof(client_addr);

                    int client_fd = accept(server_fd,
                                          (struct sockaddr*)&client_addr,
                                          &client_len);

                    if (client_fd == -1) {
                        if (errno == EAGAIN || errno == EWOULDBLOCK) {
                            break;  // 더 이상 대기 중인 연결 없음
                        }
                        perror("accept failed");
                        break;
                    }

                    // 클라이언트 소켓 설정
                    set_nonblocking(client_fd);
                    setup_socket_options(client_fd);

                    // epoll에 추가
                    event.events = EPOLLIN | EPOLLET;
                    event.data.fd = client_fd;
                    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &event);

                    printf("Client connected (fd=%d), ", client_fd);
                }
            } else {
                // 클라이언트 데이터 처리
                if (events[i].events & EPOLLIN) {
                    handle_client_data(fd);
                }

                if (events[i].events & (EPOLLHUP | EPOLLERR)) {
                    printf("Client disconnected (fd=%d), ", fd);
                    epoll_ctl(epoll_fd, EPOLL_CTL_DEL, fd, NULL);
                    close(fd);
                }
            }
        }
    }

    close(epoll_fd);
    close(server_fd);
}

void handle_client_data(int client_fd) {
    char buffer[8192];

    while (1) {
        ssize_t bytes_read = read(client_fd, buffer, sizeof(buffer));

        if (bytes_read > 0) {
            // 에코 서버: 받은 데이터 다시 전송
            write(client_fd, buffer, bytes_read);
        } else if (bytes_read == 0) {
            // EOF: 클라이언트 연결 종료
            break;
        } else {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // Edge-triggered에서 정상: 더 이상 읽을 데이터 없음
                break;
            } else {
                perror("read failed");
                break;
            }
        }
    }
}
```

## Unix Domain Sockets vs Network Sockets

### Unix Domain Socket 특징

**장점:**

- 로컬 IPC에서 네트워크 소켓보다 빠름
- 네트워크 스택 오버헤드 없음
- 파일 시스템 권한 활용 가능

**단점:**

- 같은 머신에서만 통신 가능
- 파일 시스템에 소켓 파일 생성

```c
#include <sys/un.h>

// Unix Domain Socket 서버
int create_unix_socket_server(const char *socket_path) {
    int server_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (server_fd == -1) {
        perror("Unix socket creation failed");
        return -1;
    }

    // 기존 소켓 파일 제거
    unlink(socket_path);

    struct sockaddr_un server_addr = {0};
    server_addr.sun_family = AF_UNIX;
    strncpy(server_addr.sun_path, socket_path, sizeof(server_addr.sun_path) - 1);

    if (bind(server_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) == -1) {
        perror("Unix socket bind failed");
        close(server_fd);
        return -1;
    }

    // 권한 설정 (필요시)
    chmod(socket_path, 0666);

    if (listen(server_fd, SOMAXCONN) == -1) {
        perror("Unix socket listen failed");
        close(server_fd);
        unlink(socket_path);
        return -1;
    }

    printf("Unix Domain Socket server listening on %s, ", socket_path);
    return server_fd;
}

// Unix Domain Socket 클라이언트
int connect_to_unix_socket(const char *socket_path) {
    int client_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (client_fd == -1) {
        perror("Unix socket creation failed");
        return -1;
    }

    struct sockaddr_un server_addr = {0};
    server_addr.sun_family = AF_UNIX;
    strncpy(server_addr.sun_path, socket_path, sizeof(server_addr.sun_path) - 1);

    if (connect(client_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) == -1) {
        perror("Unix socket connect failed");
        close(client_fd);
        return -1;
    }

    return client_fd;
}

// 성능 비교 테스트
void performance_comparison_test() {
    struct timespec start, end;
    const int iterations = 100000;
    const char *message = "Performance test message";

    // 1. Unix Domain Socket 테스트
    clock_gettime(CLOCK_MONOTONIC, &start);

    int unix_server = create_unix_socket_server("/tmp/perf_test.sock");
    int unix_client = connect_to_unix_socket("/tmp/perf_test.sock");

    for (int i = 0; i < iterations; i++) {
        write(unix_client, message, strlen(message));

        char buffer[256];
        read(unix_client, buffer, sizeof(buffer));
    }

    clock_gettime(CLOCK_MONOTONIC, &end);
    double unix_time = (end.tv_sec - start.tv_sec) +
                      (end.tv_nsec - start.tv_nsec) / 1e9;

    close(unix_client);
    close(unix_server);
    unlink("/tmp/perf_test.sock");

    // 2. TCP Socket 테스트 (localhost)
    clock_gettime(CLOCK_MONOTONIC, &start);

    int tcp_server = create_tcp_server_socket(12345);
    bind(tcp_server, (struct sockaddr*)&(struct sockaddr_in){
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(12345)
    }, sizeof(struct sockaddr_in));
    listen(tcp_server, 1);

    int tcp_client = connect_to_server("127.0.0.1", 12345);

    for (int i = 0; i < iterations; i++) {
        write(tcp_client, message, strlen(message));

        char buffer[256];
        read(tcp_client, buffer, sizeof(buffer));
    }

    clock_gettime(CLOCK_MONOTONIC, &end);
    double tcp_time = (end.tv_sec - start.tv_sec) +
                     (end.tv_nsec - start.tv_nsec) / 1e9;

    close(tcp_client);
    close(tcp_server);

    printf("Performance Comparison (%d iterations):, ", iterations);
    printf("Unix Domain Socket: %.3f seconds, ", unix_time);
    printf("TCP Socket (localhost): %.3f seconds, ", tcp_time);
    printf("Unix Domain Socket is %.2fx faster, ", tcp_time / unix_time);
}
```

## Socket Buffer Tuning과 성능 최적화

### 시스템 레벨 튜닝

```bash
# TCP 버퍼 크기 조정
echo 'net.core.rmem_default = 262144' >> /etc/sysctl.conf
echo 'net.core.rmem_max = 16777216' >> /etc/sysctl.conf
echo 'net.core.wmem_default = 262144' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 16777216' >> /etc/sysctl.conf

# TCP 자동 튜닝
echo 'net.ipv4.tcp_rmem = 4096 12582912 16777216' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_wmem = 4096 12582912 16777216' >> /etc/sysctl.conf

# TCP 혼잡 제어 알고리즘
echo 'net.ipv4.tcp_congestion_control = bbr' >> /etc/sysctl.conf

# 적용
sysctl -p
```

### 애플리케이션 레벨 튜닝

```c
// 최적 버퍼 크기 계산
int calculate_optimal_buffer_size(int sockfd) {
    // 1. 네트워크 대역폭과 RTT 측정
    struct sockaddr_in peer_addr;
    socklen_t addr_len = sizeof(peer_addr);
    getpeername(sockfd, (struct sockaddr*)&peer_addr, &addr_len);

    // 2. TCP 상태 정보 조회
    struct tcp_info tcp_info;
    socklen_t tcp_info_len = sizeof(tcp_info);
    getsockopt(sockfd, IPPROTO_TCP, TCP_INFO, &tcp_info, &tcp_info_len);

    // RTT 기반 버퍼 크기 계산 (Bandwidth-Delay Product)
    uint32_t rtt_us = tcp_info.tcpi_rtt;  // 마이크로초
    uint32_t bandwidth_bps = tcp_info.tcpi_delivery_rate;  // bits per second

    if (rtt_us > 0 && bandwidth_bps > 0) {
        // BDP = Bandwidth * RTT / 8 (bytes)
        uint64_t optimal_size = (uint64_t)bandwidth_bps * rtt_us / (8 * 1000000);

        // 최소/최대 제한 적용
        if (optimal_size < 64 * 1024) optimal_size = 64 * 1024;
        if (optimal_size > 16 * 1024 * 1024) optimal_size = 16 * 1024 * 1024;

        return (int)optimal_size;
    }

    return 256 * 1024;  // 기본값: 256KB
}

// 동적 버퍼 튜닝
int tune_socket_buffers(int sockfd) {
    int optimal_size = calculate_optimal_buffer_size(sockfd);

    // 송신 버퍼 설정
    if (setsockopt(sockfd, SOL_SOCKET, SO_SNDBUF,
                   &optimal_size, sizeof(optimal_size)) == -1) {
        perror("setsockopt SO_SNDBUF failed");
        return -1;
    }

    // 수신 버퍼 설정
    if (setsockopt(sockfd, SOL_SOCKET, SO_RCVBUF,
                   &optimal_size, sizeof(optimal_size)) == -1) {
        perror("setsockopt SO_RCVBUF failed");
        return -1;
    }

    printf("Socket buffers tuned to %d bytes, ", optimal_size);
    return 0;
}

// 고성능 전송을 위한 sendfile() 활용
#include <sys/sendfile.h>

ssize_t high_performance_file_transfer(int sockfd, int filefd, off_t offset, size_t count) {
    // sendfile()은 커널 공간에서 직접 파일 → 소켓 전송
    // 사용자 공간 버퍼를 거치지 않아 매우 빠름
    ssize_t bytes_sent = sendfile(sockfd, filefd, &offset, count);

    if (bytes_sent == -1) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) {
            // 논블로킹 모드에서 정상: 나중에 다시 시도
            return 0;
        }
        perror("sendfile failed");
        return -1;
    }

    return bytes_sent;
}

// 벡터 I/O (scatter-gather)
#include <sys/uio.h>

// 여러 버퍼를 한 번에 전송
ssize_t vectored_write(int sockfd, struct iovec *iov, int iovcnt) {
    ssize_t total_sent = 0;

    while (iovcnt > 0) {
        ssize_t bytes_sent = writev(sockfd, iov, iovcnt);

        if (bytes_sent == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                break;  // 나중에 다시 시도
            }
            return -1;
        }

        total_sent += bytes_sent;

        // 부분 전송 처리
        while (bytes_sent > 0 && iovcnt > 0) {
            if (bytes_sent >= iov->iov_len) {
                bytes_sent -= iov->iov_len;
                iov++;
                iovcnt--;
            } else {
                iov->iov_base = (char*)iov->iov_base + bytes_sent;
                iov->iov_len -= bytes_sent;
                bytes_sent = 0;
            }
        }
    }

    return total_sent;
}
```

## 일반적인 Socket 프로그래밍 오류와 디버깅

### 1. Address Already in Use 오류

```c
// ❌ 문제: SO_REUSEADDR 설정하지 않음
int bad_server() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    // SO_REUSEADDR 누락!

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(8080);

    if (bind(server_fd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
        perror("bind failed: Address already in use");  // 일반적인 에러
        return -1;
    }

    return server_fd;
}

// ✅ 해결책
int good_server() {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);

    // SO_REUSEADDR 설정
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(8080);

    if (bind(server_fd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
        perror("bind failed");
        close(server_fd);
        return -1;
    }

    return server_fd;
}
```

### 2. Partial Read/Write 문제

```c
// ❌ 문제: 부분 전송 미처리
int unsafe_send_data(int sockfd, const char *data, size_t len) {
    // 위험: write()가 전체 데이터를 전송한다고 가정
    return write(sockfd, data, len);
}

// ✅ 해결책: 완전 전송 보장
ssize_t safe_send_data(int sockfd, const char *data, size_t len) {
    size_t total_sent = 0;

    while (total_sent < len) {
        ssize_t bytes_sent = write(sockfd, data + total_sent, len - total_sent);

        if (bytes_sent == -1) {
            if (errno == EINTR) {
                continue;  // 인터럽트: 재시도
            } else if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // 논블로킹 소켓: 나중에 다시 시도 필요
                break;
            } else {
                return -1;  // 실제 에러
            }
        } else if (bytes_sent == 0) {
            // 연결 종료
            break;
        }

        total_sent += bytes_sent;
    }

    return total_sent;
}
```

### 3. Resource Leak (소켓 누수)

```c
// ❌ 문제: 예외 상황에서 소켓 누수
int leaky_client(const char *server_ip, int port) {
    int sockfd = socket(AF_INET, SOCK_STREAM, 0);

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    inet_pton(AF_INET, server_ip, &addr.sin_addr);

    if (connect(sockfd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
        return -1;  // 소켓 누수!
    }

    char buffer[1024];
    if (read(sockfd, buffer, sizeof(buffer)) == -1) {
        return -1;  // 소켓 누수!
    }

    close(sockfd);
    return 0;
}

// ✅ 해결책: RAII 패턴 또는 goto cleanup
int safe_client(const char *server_ip, int port) {
    int sockfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd == -1) {
        return -1;
    }

    int result = 0;

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    inet_pton(AF_INET, server_ip, &addr.sin_addr);

    if (connect(sockfd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
        result = -1;
        goto cleanup;
    }

    char buffer[1024];
    if (read(sockfd, buffer, sizeof(buffer)) == -1) {
        result = -1;
        goto cleanup;
    }

cleanup:
    close(sockfd);  // 항상 소켓 닫기
    return result;
}
```

### 4. 디버깅 도구와 기법

```c
// Socket 상태 모니터링
void debug_socket_state(int sockfd) {
    struct sockaddr_in local_addr, peer_addr;
    socklen_t addr_len = sizeof(local_addr);

    // 로컬 주소 정보
    if (getsockname(sockfd, (struct sockaddr*)&local_addr, &addr_len) == 0) {
        char local_ip[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &local_addr.sin_addr, local_ip, sizeof(local_ip));
        printf("Local address: %s:%d, ", local_ip, ntohs(local_addr.sin_port));
    }

    // 피어 주소 정보
    addr_len = sizeof(peer_addr);
    if (getpeername(sockfd, (struct sockaddr*)&peer_addr, &addr_len) == 0) {
        char peer_ip[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &peer_addr.sin_addr, peer_ip, sizeof(peer_ip));
        printf("Peer address: %s:%d, ", peer_ip, ntohs(peer_addr.sin_port));
    }

    // TCP 상태 정보 (Linux)
    struct tcp_info tcp_info;
    socklen_t tcp_info_len = sizeof(tcp_info);

    if (getsockopt(sockfd, IPPROTO_TCP, TCP_INFO, &tcp_info, &tcp_info_len) == 0) {
        printf("TCP State: %d, ", tcp_info.tcpi_state);
        printf("RTT: %u us, ", tcp_info.tcpi_rtt);
        printf("Send Queue: %u bytes, ", tcp_info.tcpi_notsent_bytes);
        printf("Recv Queue: %u bytes, ", tcp_info.tcpi_rcv_space);
    }

    // 소켓 에러 상태
    int socket_error;
    socklen_t error_len = sizeof(socket_error);
    getsockopt(sockfd, SOL_SOCKET, SO_ERROR, &socket_error, &error_len);

    if (socket_error != 0) {
        printf("Socket error: %s, ", strerror(socket_error));
    }
}

// 네트워크 트래픽 로깅
ssize_t debug_read(int sockfd, void *buffer, size_t count, const char *context) {
    ssize_t bytes_read = read(sockfd, buffer, count);

    if (bytes_read > 0) {
        printf("[DEBUG] %s: Read %zd bytes from fd %d, ",
               context, bytes_read, sockfd);

        // 첫 64바이트 hex dump
        unsigned char *buf = (unsigned char*)buffer;
        printf("Data: ");
        for (int i = 0; i < bytes_read && i < 64; i++) {
            printf("%02x ", buf[i]);
        }
        printf(", ");
    } else if (bytes_read == 0) {
        printf("[DEBUG] %s: EOF on fd %d, ", context, sockfd);
    } else {
        printf("[DEBUG] %s: Read error on fd %d: %s, ",
               context, sockfd, strerror(errno));
    }

    return bytes_read;
}
```

## Real Production Incident Examples

### Case 1: 소켓 고갈 문제

**상황 (2024년 3월):**

- 웹 서버에서 "socket: Too many open files" 에러 발생
- 동시 연결 수는 예상 범위 내였음

**분석:**

```bash
# 1. 현재 소켓 사용량 확인
$ lsof -i -P -n | grep :8080 | wc -l
8192

# 2. TIME_WAIT 상태 소켓 확인
$ netstat -an | grep TIME_WAIT | wc -l
6000

# 3. 애플리케이션 코드에서 소켓 누수 발견
```

**원인:** 에러 처리 경로에서 close() 누락

**해결책:**

```c
// 기존 코드 (문제)
int handle_request(const char *server_ip, int port) {
    int sockfd = connect_to_server(server_ip, port);

    if (process_data(sockfd) < 0) {
        return -1;  // sockfd 누수!
    }

    close(sockfd);
    return 0;
}

// 수정된 코드
int handle_request(const char *server_ip, int port) {
    int sockfd = connect_to_server(server_ip, port);
    if (sockfd < 0) return -1;

    int result = process_data(sockfd);
    close(sockfd);  // 항상 닫기

    return result;
}
```

### Case 2: 높은 지연시간 문제

**상황:** TCP 소켓에서 예상보다 높은 응답 시간

**분석 및 해결:**

```c
// 문제: Nagle 알고리즘으로 인한 지연
// 작은 패킷들이 합쳐져서 전송되어 지연 발생

// 해결책: TCP_NODELAY 설정
int fix_latency_issue(int sockfd) {
    int flag = 1;
    if (setsockopt(sockfd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag)) == -1) {
        perror("setsockopt TCP_NODELAY failed");
        return -1;
    }

    // 추가: TCP_QUICKACK으로 ACK 즉시 전송
    flag = 1;
    setsockopt(sockfd, IPPROTO_TCP, TCP_QUICKACK, &flag, sizeof(flag));

    return 0;
}
```

### 문제 해결 체크리스트

**소켓 문제 발생 시:**

- [ ] **리소스 누수 확인**

  ```bash
  lsof -p <pid> | grep socket | wc -l
  netstat -an | grep -E "(ESTABLISHED|TIME_WAIT)" | wc -l
  ```

- [ ] **소켓 옵션 점검**

  ```bash
  ss -i  # TCP 상세 정보 확인
  cat /proc/sys/net/core/somaxconn  # 백로그 제한 확인
  ```

- [ ] **네트워크 레벨 문제 확인**

  ```bash
  ping target_host  # 기본 연결성
  traceroute target_host  # 라우팅 경로
  tcpdump -i any host target_host  # 패킷 캡처
  ```

- [ ] **시스템 레벨 제한 확인**

  ```bash
  ulimit -n  # 파일 디스크립터 제한
  cat /proc/sys/fs/file-max  # 시스템 전체 제한
  ```

## 정리

Socket programming은 네트워크 애플리케이션의 기초이며, 고성능 서버 개발의 핵심입니다:

### 핵심 개념

**기본 API:**

- `socket()`: 소켓 생성
- `bind()`: 주소 바인딩
- `listen()/accept()`: 서버 연결 수락
- `connect()`: 클라이언트 연결
- `read()/write()`: 데이터 송수신

**프로토콜 선택:**

- **TCP (SOCK_STREAM)**: 신뢰성, 순서 보장, 연결 지향
- **UDP (SOCK_DGRAM)**: 빠름, 비연결형, 브로드캐스트 가능
- **Unix Domain Socket**: 로컬 IPC, 고성능

**성능 최적화:**

- 적절한 socket options 설정
- Non-blocking I/O + epoll/kqueue
- 버퍼 크기 튜닝
- sendfile() 등 고급 API 활용

**일반적인 함정:**

- 리소스 누수 (소켓 미해제)
- Partial read/write 미처리
- SO_REUSEADDR 누락
- Nagle 알고리즘으로 인한 지연

**프로덕션 고려사항:**

- 에러 처리와 복구 전략
- 모니터링과 로깅
- 시스템 레벨 튜닝
- 확장성과 부하 분산

Socket programming을 제대로 이해하면 웹서버, 데이터베이스, 메시지 큐 등 다양한 네트워크 서비스를 효율적으로 구현할 수 있습니다.

## 관련 문서

- [epoll 심화 분석](epoll.md) - Linux I/O 멀티플렉싱과 고성능 소켓 서버
- [File Descriptor 완벽 가이드](../system/file-descriptor.md) - 소켓의 기반이 되는 파일 디스크립터
- [Event Loop 완벽 가이드](../programming/event-loop.md) - 비동기 소켓 프로그래밍
- [Callback 함수 심화 분석](../programming/callback.md) - 비동기 네트워크 I/O 콜백
