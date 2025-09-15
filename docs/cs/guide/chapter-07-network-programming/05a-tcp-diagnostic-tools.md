---
tags:
  - Network Debugging
  - TCP Connection
  - Socket Programming
  - C Programming
  - Diagnostic Tools
---

# TCP 연결 진단 도구

## C 기반 종합 TCP 연결 분석기

실제 운영 환경에서 발생하는 TCP 연결 문제를 체계적으로 분석하기 위한 종합적인 C 기반 도구입니다. 이 도구는 연결 상태 실시간 모니터링, 소켓 옵션 최적화, 스트레스 테스트를 통한 연결 안정성 검증 등의 기능을 제공합니다.

## 종합 TCP 연결 분석기 구현

```c
// tcp_connection_analyzer.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/epoll.h>
#include <time.h>
#include <signal.h>
#include <pthread.h>
#include <sys/types.h>
#include <ifaddrs.h>
#include <linux/sockios.h>
#include <sys/ioctl.h>

#define MAX_CONNECTIONS 1000
#define MAX_EVENTS 64
#define BUFFER_SIZE 4096
#define DEFAULT_PORT 8080

typedef struct {
    int fd;
    struct sockaddr_in addr;
    time_t connect_time;
    time_t last_activity;
    int state;
    uint64_t bytes_sent;
    uint64_t bytes_received;
    int error_count;
} connection_info_t;

typedef struct {
    connection_info_t connections[MAX_CONNECTIONS];
    int connection_count;
    pthread_mutex_t mutex;
    int running;

    // 통계
    uint64_t total_connections;
    uint64_t failed_connections;
    uint64_t bytes_total_sent;
    uint64_t bytes_total_received;
    uint64_t connection_errors;

    // 설정
    int target_port;
    char target_host[256];
    int connection_timeout;
    int keep_alive_timeout;
    int max_concurrent;
} tcp_analyzer_t;

static tcp_analyzer_t analyzer;

void print_usage(const char *prog_name) {
    printf("TCP 연결 분석기\n");
    printf("사용법: %s [옵션]\n", prog_name);
    printf("옵션:\n");
    printf("  -h HOST        대상 호스트 (기본값: localhost)\n");
    printf("  -p PORT        대상 포트 (기본값: 8080)\n");
    printf("  -c COUNT       최대 동시 연결 수 (기본값: 100)\n");
    printf("  -t TIMEOUT     연결 타임아웃 (초, 기본값: 30)\n");
    printf("  -k KEEPALIVE   Keep-alive 타임아웃 (초, 기본값: 60)\n");
    printf("  -m MODE        모드: client|server|monitor (기본값: monitor)\n");
    printf("  --help         이 도움말 출력\n");
}

int set_socket_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags == -1) {
        perror("fcntl F_GETFL");
        return -1;
    }

    if (fcntl(fd, F_SETFL, flags | O_NONBLOCK) == -1) {
        perror("fcntl F_SETFL");
        return -1;
    }

    return 0;
}

int configure_socket_options(int fd) {
    int opt = 1;

    // SO_REUSEADDR 설정
    if (setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("setsockopt SO_REUSEADDR");
        return -1;
    }

    // TCP_NODELAY 설정 (Nagle 알고리즘 비활성화)
    if (setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt)) < 0) {
        perror("setsockopt TCP_NODELAY");
        return -1;
    }

    // Keep-alive 설정
    if (setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &opt, sizeof(opt)) < 0) {
        perror("setsockopt SO_KEEPALIVE");
        return -1;
    }

    // Keep-alive 상세 설정
    int keepidle = 30;    // 30초 후 keep-alive 시작
    int keepintvl = 5;    // 5초 간격으로 probe
    int keepcnt = 3;      // 3번 실패 시 연결 종료

    if (setsockopt(fd, IPPROTO_TCP, TCP_KEEPIDLE, &keepidle, sizeof(keepidle)) < 0) {
        perror("setsockopt TCP_KEEPIDLE");
    }

    if (setsockopt(fd, IPPROTO_TCP, TCP_KEEPINTVL, &keepintvl, sizeof(keepintvl)) < 0) {
        perror("setsockopt TCP_KEEPINTVL");
    }

    if (setsockopt(fd, IPPROTO_TCP, TCP_KEEPCNT, &keepcnt, sizeof(keepcnt)) < 0) {
        perror("setsockopt TCP_KEEPCNT");
    }

    return 0;
}

void get_socket_info(int fd, char *buffer, size_t buffer_size) {
    struct tcp_info tcp_info;
    socklen_t tcp_info_len = sizeof(tcp_info);

    if (getsockopt(fd, IPPROTO_TCP, TCP_INFO, &tcp_info, &tcp_info_len) == 0) {
        snprintf(buffer, buffer_size,
            "상태: %d, RTT: %u us, 재전송: %u, 송신윈도우: %u, 수신윈도우: %u",
            tcp_info.tcpi_state,
            tcp_info.tcpi_rtt,
            tcp_info.tcpi_retrans,
            tcp_info.tcpi_snd_cwnd,
            tcp_info.tcpi_rcv_space
        );
    } else {
        snprintf(buffer, buffer_size, "TCP 정보 조회 실패");
    }
}

void print_connection_stats() {
    pthread_mutex_lock(&analyzer.mutex);

    printf("\n=== TCP 연결 분석 결과 ===\n");
    printf("총 연결 시도: %lu\n", analyzer.total_connections);
    printf("실패한 연결: %lu (%.2f%%)\n",
           analyzer.failed_connections,
           analyzer.total_connections > 0 ?
           (double)analyzer.failed_connections / analyzer.total_connections * 100 : 0);
    printf("현재 활성 연결: %d\n", analyzer.connection_count);
    printf("총 송신 바이트: %lu\n", analyzer.bytes_total_sent);
    printf("총 수신 바이트: %lu\n", analyzer.bytes_total_received);
    printf("연결 오류: %lu\n", analyzer.connection_errors);

    printf("\n=== 활성 연결 상세 ===\n");
    time_t now = time(NULL);

    for (int i = 0; i < analyzer.connection_count; i++) {
        connection_info_t *conn = &analyzer.connections[i];
        char addr_str[INET_ADDRSTRLEN];
        char socket_info[512];

        inet_ntop(AF_INET, &conn->addr.sin_addr, addr_str, INET_ADDRSTRLEN);
        get_socket_info(conn->fd, socket_info, sizeof(socket_info));

        printf("연결 %d: %s:%d\n", i + 1, addr_str, ntohs(conn->addr.sin_port));
        printf("  연결 시간: %ld초 전\n", now - conn->connect_time);
        printf("  마지막 활동: %ld초 전\n", now - conn->last_activity);
        printf("  송신: %lu bytes, 수신: %lu bytes\n",
               conn->bytes_sent, conn->bytes_received);
        printf("  오류 수: %d\n", conn->error_count);
        printf("  TCP 정보: %s\n", socket_info);
        printf("\n");
    }

    pthread_mutex_unlock(&analyzer.mutex);
}

int create_test_connection(const char *host, int port) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        perror("socket");
        return -1;
    }

    if (configure_socket_options(fd) < 0) {
        close(fd);
        return -1;
    }

    if (set_socket_nonblocking(fd) < 0) {
        close(fd);
        return -1;
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);

    if (inet_pton(AF_INET, host, &addr.sin_addr) <= 0) {
        perror("inet_pton");
        close(fd);
        return -1;
    }

    int result = connect(fd, (struct sockaddr*)&addr, sizeof(addr));
    if (result < 0 && errno != EINPROGRESS) {
        perror("connect");
        close(fd);
        return -1;
    }

    return fd;
}

void* connection_monitor_thread(void* arg) {
    while (analyzer.running) {
        print_connection_stats();
        sleep(10);  // 10초마다 통계 출력
    }
    return NULL;
}

void* stress_test_thread(void* arg) {
    int connections_per_thread = *(int*)arg;

    for (int i = 0; i < connections_per_thread && analyzer.running; i++) {
        int fd = create_test_connection(analyzer.target_host, analyzer.target_port);

        pthread_mutex_lock(&analyzer.mutex);
        analyzer.total_connections++;

        if (fd >= 0) {
            if (analyzer.connection_count < MAX_CONNECTIONS) {
                connection_info_t *conn = &analyzer.connections[analyzer.connection_count];
                conn->fd = fd;
                conn->connect_time = time(NULL);
                conn->last_activity = conn->connect_time;
                conn->state = 1;  // 연결됨
                conn->bytes_sent = 0;
                conn->bytes_received = 0;
                conn->error_count = 0;
                analyzer.connection_count++;
            } else {
                close(fd);
            }
        } else {
            analyzer.failed_connections++;
        }
        pthread_mutex_unlock(&analyzer.mutex);

        usleep(100000);  // 100ms 대기
    }

    return NULL;
}

void run_stress_test(int num_connections, int num_threads) {
    printf("스트레스 테스트 시작: %d개 연결, %d개 스레드\n",
           num_connections, num_threads);

    pthread_t threads[num_threads];
    pthread_t monitor_thread;
    int connections_per_thread = num_connections / num_threads;

    analyzer.running = 1;

    // 모니터링 스레드 시작
    if (pthread_create(&monitor_thread, NULL, connection_monitor_thread, NULL) != 0) {
        perror("pthread_create monitor");
        return;
    }

    // 스트레스 테스트 스레드들 시작
    for (int i = 0; i < num_threads; i++) {
        if (pthread_create(&threads[i], NULL, stress_test_thread,
                          &connections_per_thread) != 0) {
            perror("pthread_create stress");
            break;
        }
    }

    // 스레드들 종료 대기
    for (int i = 0; i < num_threads; i++) {
        pthread_join(threads[i], NULL);
    }

    // 30초 더 모니터링
    sleep(30);

    analyzer.running = 0;
    pthread_join(monitor_thread, NULL);

    // 연결들 정리
    pthread_mutex_lock(&analyzer.mutex);
    for (int i = 0; i < analyzer.connection_count; i++) {
        close(analyzer.connections[i].fd);
    }
    analyzer.connection_count = 0;
    pthread_mutex_unlock(&analyzer.mutex);

    print_connection_stats();
}

void analyze_network_stack() {
    printf("\n=== 네트워크 스택 분석 ===\n");

    // TCP 연결 상태 분석
    system("echo '=== 현재 TCP 연결 상태 ==='");
    system("ss -tuln | head -20");

    printf("\n");
    system("echo '=== TCP 연결 통계 ==='");
    system("ss -s");

    printf("\n");
    system("echo '=== 네트워크 인터페이스 통계 ==='");
    system("cat /proc/net/dev | head -10");

    printf("\n");
    system("echo '=== TCP 설정 확인 ==='");
    system("sysctl net.ipv4.tcp_keepalive_time");
    system("sysctl net.ipv4.tcp_keepalive_probes");
    system("sysctl net.ipv4.tcp_keepalive_intvl");
    system("sysctl net.core.somaxconn");
    system("sysctl net.ipv4.tcp_max_syn_backlog");

    printf("\n");
    system("echo '=== 소켓 통계 ==='");
    system("cat /proc/net/sockstat");
}

void signal_handler(int sig) {
    printf("\n신호 %d 수신, 정리 중...\n", sig);
    analyzer.running = 0;
}

int main(int argc, char *argv[]) {
    // 기본값 설정
    strcpy(analyzer.target_host, "127.0.0.1");
    analyzer.target_port = DEFAULT_PORT;
    analyzer.connection_timeout = 30;
    analyzer.keep_alive_timeout = 60;
    analyzer.max_concurrent = 100;

    char mode[20] = "monitor";

    // 명령행 인자 처리
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-h") == 0 && i + 1 < argc) {
            strcpy(analyzer.target_host, argv[++i]);
        } else if (strcmp(argv[i], "-p") == 0 && i + 1 < argc) {
            analyzer.target_port = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-c") == 0 && i + 1 < argc) {
            analyzer.max_concurrent = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-t") == 0 && i + 1 < argc) {
            analyzer.connection_timeout = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-k") == 0 && i + 1 < argc) {
            analyzer.keep_alive_timeout = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-m") == 0 && i + 1 < argc) {
            strcpy(mode, argv[++i]);
        } else if (strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return 0;
        }
    }

    // 시그널 핸들러 설정
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    // 뮤텍스 초기화
    if (pthread_mutex_init(&analyzer.mutex, NULL) != 0) {
        perror("pthread_mutex_init");
        return 1;
    }

    printf("TCP 연결 분석기 시작\n");
    printf("대상: %s:%d\n", analyzer.target_host, analyzer.target_port);
    printf("모드: %s\n", mode);

    if (strcmp(mode, "monitor") == 0) {
        analyze_network_stack();
    } else if (strcmp(mode, "stress") == 0) {
        run_stress_test(analyzer.max_concurrent, 4);
    } else if (strcmp(mode, "client") == 0) {
        // 단일 클라이언트 연결 테스트
        int fd = create_test_connection(analyzer.target_host, analyzer.target_port);
        if (fd >= 0) {
            printf("연결 성공: %d\n", fd);

            char socket_info[512];
            get_socket_info(fd, socket_info, sizeof(socket_info));
            printf("TCP 정보: %s\n", socket_info);

            sleep(5);
            close(fd);
        } else {
            printf("연결 실패\n");
        }
    }

    pthread_mutex_destroy(&analyzer.mutex);
    return 0;
}
```

## 컴파일 및 사용법

### 컴파일

```bash
gcc -o tcp_analyzer tcp_connection_analyzer.c -lpthread

# 디버그 모드로 컴파일
gcc -g -DDEBUG -o tcp_analyzer tcp_connection_analyzer.c -lpthread

# 최적화된 릴리스 버전
gcc -O3 -o tcp_analyzer tcp_connection_analyzer.c -lpthread
```

### 기본 사용법

```bash
# 네트워크 스택 분석 (기본 모드)
./tcp_analyzer

# 특정 호스트:포트 연결 테스트
./tcp_analyzer -h 192.168.1.100 -p 8080 -m client

# 스트레스 테스트 실행
./tcp_analyzer -h localhost -p 8080 -m stress -c 500

# Keep-alive 설정 조정
./tcp_analyzer -k 120 -t 60 -m monitor
```

## 주요 기능 설명

### 1. 소켓 옵션 최적화

- **SO_REUSEADDR**: TIME_WAIT 상태 소켓 재사용 허용
- **TCP_NODELAY**: Nagle 알고리즘 비활성화로 지연시간 최소화
- **SO_KEEPALIVE**: 비활성 연결 자동 감지 및 정리

### 2. Keep-alive 파라미터 세부 조정

- **TCP_KEEPIDLE**: 30초 대기 후 keep-alive 프로브 시작
- **TCP_KEEPINTVL**: 5초 간격으로 프로브 전송
- **TCP_KEEPCNT**: 3회 실패 시 연결 종료

### 3. 연결 상태 실시간 추적

- 연결 수립 시간, 마지막 활동 시간 기록
- 바이트 송수신량 통계
- 오류 발생 횟수 추적

### 4. TCP 정보 상세 분석

```c
struct tcp_info {
    __u8    tcpi_state;         // TCP 상태
    __u32   tcpi_rtt;          // Round Trip Time
    __u32   tcpi_retrans;      // 재전송 횟수
    __u32   tcpi_snd_cwnd;     // 송신 윈도우 크기
    __u32   tcpi_rcv_space;    // 수신 버퍼 공간
};
```

## 실행 결과 해석

### 정상적인 연결 상태

```text
=== TCP 연결 분석 결과 ===
총 연결 시도: 100
실패한 연결: 0 (0.00%)
현재 활성 연결: 100
총 송신 바이트: 12800
총 수신 바이트: 25600
연결 오류: 0
```

### 문제가 있는 경우

```text
=== TCP 연결 분석 결과 ===
총 연결 시도: 100
실패한 연결: 25 (25.00%)  ← 높은 실패율
현재 활성 연결: 50
연결 오류: 15              ← 연결 오류 발생
```

## 핵심 요점

### 1. 소켓 옵션 최적화의 중요성

TCP 연결의 안정성과 성능은 적절한 소켓 옵션 설정에 크게 좌우됩니다. Keep-alive 설정, Nagle 알고리즘 제어, 버퍼 크기 조정 등이 핵심입니다.

### 2. 비동기 프로그래밍 패턴

대량의 연결을 처리하기 위해서는 non-blocking 소켓과 멀티스레딩을 활용한 비동기 처리가 필수입니다.

### 3. 실시간 모니터링의 필요성

연결 상태를 지속적으로 모니터링하여 패턴을 파악하고, 문제 발생 시 신속하게 대응할 수 있는 체계가 중요합니다.

---

**이전**: [TCP 연결 디버깅 개요](05-tcp-connection-debugging.md)  
**다음**: [연결 풀 최적화](05b-connection-pool-optimization.md)에서 시스템 TCP 설정 자동화와 로드밸런서 설정 최적화를 학습합니다.
