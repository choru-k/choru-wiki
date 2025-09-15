---
tags:
  - Network Optimization
  - Zero-copy
  - TCP Tuning
  - Performance
  - sendfile
  - splice
---

# Chapter 6-4F: 고성능 네트워크 최적화

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
```

## Zero-copy 기법의 심화

### 1. 고성능 파일 전송 서버

```c
// zero-copy 파일 전송 서버
typedef struct file_server {
    int epfd;
    int listen_fd;
    
    // 파일 캐시
    struct file_cache *cache;
    
    // 통계
    uint64_t total_bytes_sent;
    uint64_t zero_copy_bytes;
    uint64_t traditional_bytes;
} file_server_t;

// 파일 전송 핸들러
typedef struct file_transfer {
    int client_fd;
    int file_fd;
    off_t file_offset;
    size_t remaining;
    
    // 메타데이터
    char filename[256];
    struct stat file_stat;
    time_t start_time;
    
    // 상태
    enum {
        TRANSFER_STARTING,
        TRANSFER_HEADERS,
        TRANSFER_BODY,
        TRANSFER_COMPLETED
    } state;
} file_transfer_t;

// HTTP 파일 응답 전송
void send_file_response(file_transfer_t *transfer) {
    // HTTP 헤더 생성
    char headers[1024];
    snprintf(headers, sizeof(headers),
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: application/octet-stream\r\n"
        "Content-Length: %ld\r\n"
        "Connection: close\r\n"
        "\r\n",
        transfer->file_stat.st_size);
    
    // 헤더 전송
    ssize_t header_sent = send(transfer->client_fd, headers, 
                              strlen(headers), MSG_NOSIGNAL);
    if (header_sent < 0) {
        perror("send headers");
        return;
    }
    
    // 파일 내용을 zero-copy로 전송
    off_t offset = 0;
    size_t remaining = transfer->file_stat.st_size;
    
    while (remaining > 0) {
        size_t to_send = (remaining > 1024*1024) ? 1024*1024 : remaining;
        
        ssize_t sent = sendfile_wrapper(transfer->client_fd,
                                       transfer->file_fd,
                                       &offset, to_send);
        
        if (sent <= 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // 나중에 재시도
                transfer->file_offset = offset;
                transfer->remaining = remaining;
                return;
            }
            perror("sendfile");
            break;
        }
        
        remaining -= sent;
        transfer->zero_copy_bytes += sent;
    }
    
    transfer->state = TRANSFER_COMPLETED;
}

// 논블로킹 sendfile 래퍼
ssize_t nonblocking_sendfile(int out_fd, int in_fd, 
                            off_t *offset, size_t count) {
    ssize_t total_sent = 0;
    
    while (count > 0) {
        ssize_t sent = sendfile_wrapper(out_fd, in_fd, offset, count);
        
        if (sent < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // 더 이상 보낼 수 없음
                break;
            }
            return -1;  // 실제 에러
        }
        
        if (sent == 0) {
            break;  // EOF 또는 더 이상 전송할 데이터 없음
        }
        
        total_sent += sent;
        count -= sent;
    }
    
    return total_sent;
}
```

### 2. 고성능 프록시 서버

```c
// splice 기반 프록시 서버
typedef struct proxy_connection {
    int client_fd;
    int server_fd;
    
    // splice용 파이프
    int pipe_c2s[2];  // client to server
    int pipe_s2c[2];  // server to client
    
    // 상태 추적
    size_t c2s_bytes;
    size_t s2c_bytes;
    
    enum {
        PROXY_CONNECTING,
        PROXY_RELAYING,
        PROXY_CLOSING
    } state;
} proxy_connection_t;

proxy_connection_t *create_proxy_connection(int client_fd, 
                                           const char *target_host,
                                           int target_port) {
    proxy_connection_t *conn = calloc(1, sizeof(proxy_connection_t));
    conn->client_fd = client_fd;
    conn->state = PROXY_CONNECTING;
    
    // 타겟 서버 연결
    conn->server_fd = socket(AF_INET, SOCK_STREAM, 0);
    set_nonblocking(conn->server_fd);
    
    struct sockaddr_in server_addr = {0};
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(target_port);
    inet_pton(AF_INET, target_host, &server_addr.sin_addr);
    
    int result = connect(conn->server_fd, 
                        (struct sockaddr*)&server_addr,
                        sizeof(server_addr));
    
    if (result < 0 && errno != EINPROGRESS) {
        free(conn);
        return NULL;
    }
    
    // splice용 파이프 생성
    if (pipe(conn->pipe_c2s) < 0 || pipe(conn->pipe_s2c) < 0) {
        close(conn->server_fd);
        free(conn);
        return NULL;
    }
    
    return conn;
}

// zero-copy 릴레이 처리
void handle_proxy_relay(proxy_connection_t *conn, int ready_fd) {
    const size_t PIPE_SIZE = 65536;
    
    if (ready_fd == conn->client_fd) {
        // 클라이언트 -> 서버 릴레이
        ssize_t n = splice(conn->client_fd, NULL,
                          conn->pipe_c2s[1], NULL,
                          PIPE_SIZE, SPLICE_F_MOVE | SPLICE_F_NONBLOCK);
        
        if (n > 0) {
            ssize_t sent = splice(conn->pipe_c2s[0], NULL,
                                 conn->server_fd, NULL,
                                 n, SPLICE_F_MOVE | SPLICE_F_NONBLOCK);
            if (sent > 0) {
                conn->c2s_bytes += sent;
            }
        } else if (n == 0 || (n < 0 && errno != EAGAIN)) {
            // 클라이언트 연결 종료
            conn->state = PROXY_CLOSING;
        }
        
    } else if (ready_fd == conn->server_fd) {
        // 서버 -> 클라이언트 릴레이
        ssize_t n = splice(conn->server_fd, NULL,
                          conn->pipe_s2c[1], NULL,
                          PIPE_SIZE, SPLICE_F_MOVE | SPLICE_F_NONBLOCK);
        
        if (n > 0) {
            ssize_t sent = splice(conn->pipe_s2c[0], NULL,
                                 conn->client_fd, NULL,
                                 n, SPLICE_F_MOVE | SPLICE_F_NONBLOCK);
            if (sent > 0) {
                conn->s2c_bytes += sent;
            }
        } else if (n == 0 || (n < 0 && errno != EAGAIN)) {
            // 서버 연결 종료
            conn->state = PROXY_CLOSING;
        }
    }
}
```

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
```

## 고급 TCP 최적화 기법

### 1. TCP 혼잡 제어 최적화

```c
// TCP 혼잡 제어 알고리즘 설정
void optimize_tcp_congestion_control(int fd) {
    // 사용 가능한 혼잡 제어 알고리즘 확인
    #ifdef TCP_CONGESTION
    char available[256];
    FILE *f = fopen("/proc/sys/net/ipv4/tcp_available_congestion_control", "r");
    if (f) {
        fgets(available, sizeof(available), f);
        fclose(f);
        printf("Available congestion control: %s", available);
    }
    
    // BBR 혼잡 제어 설정 (고대역폭-고지연 환경에 최적)
    const char *cc_algo = "bbr";
    if (setsockopt(fd, IPPROTO_TCP, TCP_CONGESTION,
                   cc_algo, strlen(cc_algo)) == 0) {
        printf("Set congestion control to %s\n", cc_algo);
    } else {
        // fallback to cubic
        cc_algo = "cubic";
        setsockopt(fd, IPPROTO_TCP, TCP_CONGESTION,
                   cc_algo, strlen(cc_algo));
    }
    #endif
}

// TCP 윈도우 스케일링 최적화
void optimize_tcp_window_scaling() {
    // 시스템 전역 설정 (root 권한 필요)
    system("echo 1 > /proc/sys/net/ipv4/tcp_window_scaling");
    
    // 자동 튜닝 활성화
    system("echo 1 > /proc/sys/net/ipv4/tcp_moderate_rcvbuf");
    
    // 수신 버퍼 자동 튜닝 범위 설정 (min, default, max)
    system("echo '4096 16384 4194304' > /proc/sys/net/ipv4/tcp_rmem");
    
    // 송신 버퍼 자동 튜닝 범위 설정
    system("echo '4096 65536 4194304' > /proc/sys/net/ipv4/tcp_wmem");
}

// TCP 대기열 최적화
void optimize_tcp_backlog(int listen_fd) {
    // 시스템 최대 백로그 확인
    FILE *f = fopen("/proc/sys/net/core/somaxconn", "r");
    if (f) {
        int max_backlog;
        fscanf(f, "%d", &max_backlog);
        fclose(f);
        
        printf("System max backlog: %d\n", max_backlog);
        
        // listen 백로그를 최대값으로 설정
        listen(listen_fd, max_backlog);
    }
    
    // SYN 백로그 최적화
    system("echo 4096 > /proc/sys/net/ipv4/tcp_max_syn_backlog");
}
```

### 2. SO_REUSEPORT 최적화

```c
// 멀티프로세스 로드 밸런싱
typedef struct multi_process_server {
    int num_processes;
    pid_t *worker_pids;
    int listen_port;
    
    // 공유 메모리 통계
    struct shared_stats *stats;
} multi_process_server_t;

multi_process_server_t *create_multiprocess_server(int port, int num_workers) {
    multi_process_server_t *server = malloc(sizeof(multi_process_server_t));
    server->num_processes = num_workers;
    server->listen_port = port;
    server->worker_pids = calloc(num_workers, sizeof(pid_t));
    
    // 공유 메모리 생성
    int shm_fd = shm_open("/server_stats", O_CREAT | O_RDWR, 0666);
    ftruncate(shm_fd, sizeof(struct shared_stats));
    server->stats = mmap(NULL, sizeof(struct shared_stats),
                        PROT_READ | PROT_WRITE, MAP_SHARED, shm_fd, 0);
    
    // 워커 프로세스 생성
    for (int i = 0; i < num_workers; i++) {
        pid_t pid = fork();
        if (pid == 0) {
            // 자식 프로세스
            run_worker_process(server, i);
            exit(0);
        } else if (pid > 0) {
            server->worker_pids[i] = pid;
        }
    }
    
    return server;
}

void run_worker_process(multi_process_server_t *server, int worker_id) {
    // SO_REUSEPORT로 같은 포트에 바인드
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    
    int reuse = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    
    #ifdef SO_REUSEPORT
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEPORT, &reuse, sizeof(reuse));
    #endif
    
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(server->listen_port);
    addr.sin_addr.s_addr = INADDR_ANY;
    
    bind(listen_fd, (struct sockaddr*)&addr, sizeof(addr));
    listen(listen_fd, 1024);
    
    printf("Worker %d listening on port %d\n", worker_id, server->listen_port);
    
    // 각 워커는 독립적으로 이벤트 루프 실행
    run_epoll_event_loop(listen_fd, server->stats, worker_id);
}

// 워커별 통계 수집
typedef struct shared_stats {
    struct worker_stats {
        volatile uint64_t connections_handled;
        volatile uint64_t bytes_processed;
        volatile uint64_t requests_per_second;
        volatile double cpu_usage;
    } workers[MAX_WORKERS];
    
    volatile uint64_t total_connections;
    volatile time_t last_update;
} shared_stats_t;

void update_worker_stats(shared_stats_t *stats, int worker_id,
                        uint64_t new_connections, uint64_t new_bytes) {
    __atomic_add_fetch(&stats->workers[worker_id].connections_handled,
                       new_connections, __ATOMIC_RELAXED);
    __atomic_add_fetch(&stats->workers[worker_id].bytes_processed,
                       new_bytes, __ATOMIC_RELAXED);
    __atomic_add_fetch(&stats->total_connections,
                       new_connections, __ATOMIC_RELAXED);
}
```

### 3. 네트워크 성능 모니터링

```c
// 실시간 네트워크 성능 모니터링
typedef struct network_monitor {
    // 연결 통계
    uint64_t active_connections;
    uint64_t total_connections;
    uint64_t failed_connections;
    
    // 처리량 통계
    uint64_t bytes_sent;
    uint64_t bytes_received;
    uint64_t packets_sent;
    uint64_t packets_received;
    
    // 지연 시간 히스토그램
    uint32_t latency_histogram[20];  // 1ms, 2ms, 4ms, ... 버킷
    
    // 에러 통계
    uint64_t tcp_retransmits;
    uint64_t tcp_timeouts;
    uint64_t connection_resets;
    
    struct timeval last_update;
} network_monitor_t;

void update_network_statistics(network_monitor_t *monitor) {
    struct timeval now;
    gettimeofday(&now, NULL);
    
    // 1초마다 통계 업데이트
    if (now.tv_sec > monitor->last_update.tv_sec) {
        // TCP 통계 읽기
        FILE *f = fopen("/proc/net/snmp", "r");
        if (f) {
            char line[256];
            while (fgets(line, sizeof(line), f)) {
                if (strncmp(line, "Tcp:", 4) == 0) {
                    // TCP 통계 파싱
                    parse_tcp_statistics(line, monitor);
                }
            }
            fclose(f);
        }
        
        // 네트워크 인터페이스 통계
        f = fopen("/proc/net/dev", "r");
        if (f) {
            char line[256];
            while (fgets(line, sizeof(line), f)) {
                if (strstr(line, "eth0") || strstr(line, "lo")) {
                    parse_interface_statistics(line, monitor);
                }
            }
            fclose(f);
        }
        
        monitor->last_update = now;
        
        // 통계 출력
        print_network_statistics(monitor);
    }
}

void parse_tcp_statistics(const char *line, network_monitor_t *monitor) {
    // TCP 재전송, 타임아웃 등 파싱
    unsigned long retrans_segs, timeout_segs;
    sscanf(line, "%*s %*lu %*lu %*lu %*lu %*lu %*lu %*lu %*lu %lu %*lu %lu",
           &retrans_segs, &timeout_segs);
    
    monitor->tcp_retransmits = retrans_segs;
    monitor->tcp_timeouts = timeout_segs;
}

void print_network_statistics(network_monitor_t *monitor) {
    printf("\n=== Network Statistics ===\n");
    printf("Active Connections: %lu\n", monitor->active_connections);
    printf("Total Connections:  %lu\n", monitor->total_connections);
    printf("Failed Connections: %lu (%.2f%%)\n", 
           monitor->failed_connections,
           (double)monitor->failed_connections * 100 / monitor->total_connections);
    
    printf("Bytes Sent:     %lu MB\n", monitor->bytes_sent / (1024*1024));
    printf("Bytes Received: %lu MB\n", monitor->bytes_received / (1024*1024));
    
    printf("TCP Retransmits: %lu\n", monitor->tcp_retransmits);
    printf("TCP Timeouts:    %lu\n", monitor->tcp_timeouts);
    
    // 지연 시간 히스토그램 출력
    printf("Latency Distribution:\n");
    for (int i = 0; i < 20; i++) {
        if (monitor->latency_histogram[i] > 0) {
            printf("  %d-%dms: %u requests\n",
                   1 << i, 1 << (i+1), monitor->latency_histogram[i]);
        }
    }
}
```

## 실전 배포 최적화

### 1. 시스템 커널 파라미터 튜닝

```bash
#!/bin/bash
# 고성능 네트워크 서버를 위한 커널 파라미터 튜닝

# TCP 메모리 최적화
echo "net.core.rmem_max = 16777216" >> /etc/sysctl.conf
echo "net.core.wmem_max = 16777216" >> /etc/sysctl.conf
echo "net.ipv4.tcp_rmem = 4096 65536 16777216" >> /etc/sysctl.conf
echo "net.ipv4.tcp_wmem = 4096 65536 16777216" >> /etc/sysctl.conf

# 연결 대기열 최적화
echo "net.core.somaxconn = 65536" >> /etc/sysctl.conf
echo "net.ipv4.tcp_max_syn_backlog = 65536" >> /etc/sysctl.conf

# TIME_WAIT 최적화
echo "net.ipv4.tcp_tw_reuse = 1" >> /etc/sysctl.conf
echo "net.ipv4.tcp_fin_timeout = 15" >> /etc/sysctl.conf

# TCP Fast Open 활성화
echo "net.ipv4.tcp_fastopen = 3" >> /etc/sysctl.conf

# 파일 디스크립터 제한
echo "fs.file-max = 2097152" >> /etc/sysctl.conf

# 적용
sysctl -p

echo "Kernel parameters optimized for high-performance networking"
```

### 2. 애플리케이션 레벨 최적화

```c
// 프로덕션 서버 최적화 체크리스트
void production_server_optimization() {
    printf("=== Production Server Optimization Checklist ===\n\n");
    
    // 1. 소켓 옵션 최적화
    printf("1. Socket Options:\n");
    printf("   ✓ TCP_NODELAY for low latency\n");
    printf("   ✓ SO_REUSEADDR for fast restart\n");
    printf("   ✓ SO_REUSEPORT for load balancing\n");
    printf("   ✓ SO_KEEPALIVE for connection health\n\n");
    
    // 2. 버퍼 관리
    printf("2. Buffer Management:\n");
    printf("   ✓ Pre-allocated buffer pools\n");
    printf("   ✓ Zero-copy techniques (sendfile, splice)\n");
    printf("   ✓ Optimized buffer sizes (64KB-256KB)\n\n");
    
    // 3. 멀티프로세싱
    printf("3. Multi-processing:\n");
    printf("   ✓ Worker processes = CPU cores\n");
    printf("   ✓ SO_REUSEPORT for kernel load balancing\n");
    printf("   ✓ CPU affinity for cache efficiency\n\n");
    
    // 4. 모니터링
    printf("4. Monitoring:\n");
    printf("   ✓ Connection statistics\n");
    printf("   ✓ Throughput metrics\n");
    printf("   ✓ Error rates and timeouts\n");
    printf("   ✓ Resource utilization\n\n");
    
    // 5. 에러 처리
    printf("5. Error Handling:\n");
    printf("   ✓ Graceful connection cleanup\n");
    printf("   ✓ Timeout management\n");
    printf("   ✓ Resource leak prevention\n");
    printf("   ✓ Circuit breaker patterns\n\n");
}

// 성능 측정 및 벤치마킹
typedef struct performance_test {
    const char *test_name;
    int num_connections;
    int message_size;
    int duration_seconds;
    
    // 결과
    double requests_per_second;
    double mbps_throughput;
    double avg_latency_ms;
    double p99_latency_ms;
    double cpu_usage_percent;
    double memory_usage_mb;
} performance_test_t;

void run_performance_benchmark() {
    performance_test_t tests[] = {
        {"Small Messages (1KB)", 1000, 1024, 60, 0, 0, 0, 0, 0, 0},
        {"Medium Messages (64KB)", 1000, 65536, 60, 0, 0, 0, 0, 0, 0},
        {"Large Messages (1MB)", 100, 1048576, 60, 0, 0, 0, 0, 0, 0},
        {"High Concurrency", 10000, 1024, 60, 0, 0, 0, 0, 0, 0},
    };
    
    printf("=== Performance Benchmark Results ===\n");
    printf("%-20s %8s %8s %8s %8s %6s %8s\n",
           "Test", "RPS", "Mbps", "AvgLat", "P99Lat", "CPU%", "Memory");
    printf("%-20s %8s %8s %8s %8s %6s %8s\n",
           "----", "---", "----", "------", "------", "----", "------");
    
    for (int i = 0; i < sizeof(tests)/sizeof(tests[0]); i++) {
        // 실제 벤치마크 실행 (구현 생략)
        run_single_benchmark(&tests[i]);
        
        printf("%-20s %8.0f %8.1f %8.2f %8.2f %5.1f%% %7.1fMB\n",
               tests[i].test_name,
               tests[i].requests_per_second,
               tests[i].mbps_throughput,
               tests[i].avg_latency_ms,
               tests[i].p99_latency_ms,
               tests[i].cpu_usage_percent,
               tests[i].memory_usage_mb);
    }
}
```

## 요약

비동기 I/O와 이벤트 기반 프로그래밍은 현대 고성능 시스템의 핵심입니다. select에서 시작하여 poll, epoll을 거쳐 io_uring에 이르기까지, 리눅스의 I/O 멀티플렉싱은 지속적으로 진화해왔습니다.

epoll은 O(1) 복잡도로 수만 개의 연결을 효율적으로 처리할 수 있게 해주었고, io_uring은 시스템 콜 오버헤드를 최소화하면서 진정한 비동기 I/O를 구현했습니다.

리액터 패턴은 이벤트 기반 서버의 표준 아키텍처가 되었으며, Windows의 IOCP는 프로액터 패턴의 대표적 구현입니다. Zero-copy, TCP 최적화 등의 기법을 통해 네트워크 성능을 극대화할 수 있습니다.

## 핵심 요점

### 1. Zero-copy 기법의 활용

- **sendfile**: 파일을 네트워크로 직접 전송
- **splice**: 파이프를 통한 효율적 데이터 이동  
- **mmap**: 메모리 매핑을 통한 대용량 파일 처리

### 2. TCP 성능 최적화

- **소켓 옵션**: TCP_NODELAY, SO_KEEPALIVE, SO_REUSEPORT
- **버퍼 튜닝**: 송수신 버퍼 크기 최적화
- **혼잡 제어**: BBR, CUBIC 알고리즘 선택

### 3. 프로덕션 배포 고려사항  

- **시스템 파라미터**: 커널 네트워크 설정 튜닝
- **모니터링**: 실시간 성능 지표 수집
- **확장성**: 멀티프로세스와 로드밸런싱

다음 장에서는 네트워크 프로그래밍의 더 깊은 측면을 탐구하겠습니다.

## 다음 장 예고

Chapter 7에서는 "네트워크 프로그래밍은 어떻게 동작하는가"를 다룹니다. 소켓 프로그래밍의 기초부터 고급 기법까지, TCP/IP 스택의 내부 구현과 최적화 전략을 살펴보겠습니다.

---

**이전**: [프로액터 패턴과 Windows IOCP](04e-proactor-iocp.md)  
**다음**: [Chapter 7: 네트워크 프로그래밍](../chapter-07-network-programming/01-socket-basics.md)에서 소켓 프로그래밍의 기초를 학습합니다.
