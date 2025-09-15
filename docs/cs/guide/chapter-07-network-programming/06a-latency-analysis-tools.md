---
tags:
  - Network Latency
  - Performance Analysis
  - ICMP
  - TCP Measurement
  - Network Diagnostics
---

# Chapter.07.06a 네트워크 지연시간 분석 도구

## 정확한 성능 측정을 위한 전문 도구 개발

네트워크 지연시간 문제를 효과적으로 해결하려면 먼저 정확한 측정이 필요합니다. 이 섹션에서는 ICMP ping, TCP 연결 테스트, traceroute, 대역폭 측정을 통합한 포괄적인 C 기반 네트워크 분석 도구를 구현합니다.

## 네트워크 지연시간 분석 도구 구현

포괄적인 네트워크 성능 분석을 위한 C 기반 도구입니다.

```c
// network_latency_analyzer.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/ip_icmp.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <errno.h>
#include <time.h>
#include <sys/time.h>
#include <signal.h>
#include <pthread.h>
#include <math.h>
#include <fcntl.h>
#include <sys/epoll.h>

#define MAX_PACKET_SIZE 65536
#define MAX_HOPS 30
#define MAX_TARGETS 100
#define DEFAULT_TIMEOUT 5

typedef struct {
    char hostname[256];
    struct in_addr addr;
    double min_rtt;
    double max_rtt;
    double avg_rtt;
    double stddev_rtt;
    int packets_sent;
    int packets_received;
    double packet_loss;
    double jitter;
    int bandwidth_mbps;
} target_stats_t;

typedef struct {
    char target[256];
    int port;
    int count;
    int interval;
    int timeout;
    int packet_size;
    int concurrent;
    int show_hops;
} test_config_t;

typedef struct {
    struct timeval timestamp;
    double rtt;
    int sequence;
    int success;
} measurement_t;

static volatile int running = 1;
static target_stats_t targets[MAX_TARGETS];
static int target_count = 0;

void signal_handler(int sig) {
    running = 0;
}

double get_time_diff(struct timeval *start, struct timeval *end) {
    return (end->tv_sec - start->tv_sec) * 1000.0 +
           (end->tv_usec - start->tv_usec) / 1000.0;
}

unsigned short checksum(void *b, int len) {
    unsigned short *buf = b;
    unsigned int sum = 0;
    unsigned short result;

    while (len > 1) {
        sum += *buf++;
        len -= 2;
    }

    if (len == 1)
        sum += *(unsigned char*)buf << 8;

    while (sum >> 16)
        sum = (sum & 0xFFFF) + (sum >> 16);

    result = ~sum;
    return result;
}

int resolve_hostname(const char *hostname, struct in_addr *addr) {
    struct hostent *he = gethostbyname(hostname);
    if (he == NULL) {
        return -1;
    }

    memcpy(addr, he->h_addr_list[0], sizeof(struct in_addr));
    return 0;
}

int create_icmp_socket() {
    int sock = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP);
    if (sock < 0) {
        if (errno == EPERM) {
            printf("ICMP 소켓을 생성하려면 root 권한이 필요합니다., ");
            printf("sudo로 실행하거나 TCP 연결 테스트를 사용하세요., ");
        }
        return -1;
    }

    // 타임아웃 설정
    struct timeval timeout;
    timeout.tv_sec = DEFAULT_TIMEOUT;
    timeout.tv_usec = 0;

    if (setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) < 0) {
        perror("setsockopt SO_RCVTIMEO");
        close(sock);
        return -1;
    }

    return sock;
}

int send_icmp_ping(int sock, struct in_addr *addr, int sequence, int packet_size) {
    struct icmp *icmp_packet;
    char packet[MAX_PACKET_SIZE];
    struct sockaddr_in dest_addr;
    struct timeval *timestamp;

    // ICMP 패킷 구성
    icmp_packet = (struct icmp*)packet;
    icmp_packet->icmp_type = ICMP_ECHO;
    icmp_packet->icmp_code = 0;
    icmp_packet->icmp_id = getpid();
    icmp_packet->icmp_seq = sequence;
    icmp_packet->icmp_cksum = 0;

    // 타임스탬프 추가
    timestamp = (struct timeval*)(packet + 8);
    gettimeofday(timestamp, NULL);

    // 패킷 크기 맞추기
    memset(packet + 8 + sizeof(struct timeval), 0,
           packet_size - 8 - sizeof(struct timeval));

    // 체크섬 계산
    icmp_packet->icmp_cksum = checksum(packet, packet_size);

    // 대상 주소 설정
    memset(&dest_addr, 0, sizeof(dest_addr));
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_addr = *addr;

    // 패킷 전송
    int bytes_sent = sendto(sock, packet, packet_size, 0,
                           (struct sockaddr*)&dest_addr, sizeof(dest_addr));

    return bytes_sent > 0 ? 0 : -1;
}

double receive_icmp_reply(int sock, int expected_sequence) {
    char packet[MAX_PACKET_SIZE];
    struct sockaddr_in from_addr;
    socklen_t from_len = sizeof(from_addr);
    struct timeval now, *sent_time;
    struct ip *ip_header;
    struct icmp *icmp_header;

    int bytes_received = recvfrom(sock, packet, sizeof(packet), 0,
                                 (struct sockaddr*)&from_addr, &from_len);

    if (bytes_received < 0) {
        return -1;  // 타임아웃 또는 오류
    }

    gettimeofday(&now, NULL);

    // IP 헤더 파싱
    ip_header = (struct ip*)packet;
    int ip_header_len = ip_header->ip_hl * 4;

    // ICMP 헤더 확인
    icmp_header = (struct icmp*)(packet + ip_header_len);

    if (icmp_header->icmp_type == ICMP_ECHOREPLY &&
        icmp_header->icmp_id == getpid() &&
        icmp_header->icmp_seq == expected_sequence) {

        // 전송 시간 추출
        sent_time = (struct timeval*)(packet + ip_header_len + 8);

        return get_time_diff(sent_time, &now);
    }

    return -1;  // 예상하지 못한 패킷
}

int tcp_connect_test(const char *hostname, int port, double *rtt) {
    int sock;
    struct sockaddr_in addr;
    struct timeval start_time, end_time;
    int result;

    // 호스트명 해석
    struct hostent *he = gethostbyname(hostname);
    if (he == NULL) {
        return -1;
    }

    // 소켓 생성
    sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        return -1;
    }

    // 논블로킹 모드 설정
    int flags = fcntl(sock, F_GETFL, 0);
    fcntl(sock, F_SETFL, flags | O_NONBLOCK);

    // 주소 설정
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    memcpy(&addr.sin_addr, he->h_addr_list[0], sizeof(struct in_addr));

    // 연결 시작 시간 기록
    gettimeofday(&start_time, NULL);

    // 연결 시도
    result = connect(sock, (struct sockaddr*)&addr, sizeof(addr));

    if (result < 0 && errno == EINPROGRESS) {
        // 연결 완료 대기
        fd_set write_fds;
        struct timeval timeout;

        FD_ZERO(&write_fds);
        FD_SET(sock, &write_fds);
        timeout.tv_sec = DEFAULT_TIMEOUT;
        timeout.tv_usec = 0;

        result = select(sock + 1, NULL, &write_fds, NULL, &timeout);

        if (result > 0) {
            // 연결 상태 확인
            int error;
            socklen_t len = sizeof(error);

            if (getsockopt(sock, SOL_SOCKET, SO_ERROR, &error, &len) == 0 && error == 0) {
                gettimeofday(&end_time, NULL);
                *rtt = get_time_diff(&start_time, &end_time);
                close(sock);
                return 0;
            }
        }
    }

    close(sock);
    return -1;
}

void calculate_statistics(measurement_t *measurements, int count, target_stats_t *stats) {
    double sum = 0, sum_sq = 0;
    double prev_rtt = -1;
    double jitter_sum = 0;
    int jitter_count = 0;

    stats->packets_sent = count;
    stats->packets_received = 0;
    stats->min_rtt = INFINITY;
    stats->max_rtt = 0;

    for (int i = 0; i < count; i++) {
        if (measurements[i].success) {
            stats->packets_received++;

            double rtt = measurements[i].rtt;
            sum += rtt;
            sum_sq += rtt * rtt;

            if (rtt < stats->min_rtt) stats->min_rtt = rtt;
            if (rtt > stats->max_rtt) stats->max_rtt = rtt;

            // 지터 계산
            if (prev_rtt >= 0) {
                jitter_sum += fabs(rtt - prev_rtt);
                jitter_count++;
            }
            prev_rtt = rtt;
        }
    }

    if (stats->packets_received > 0) {
        stats->avg_rtt = sum / stats->packets_received;

        // 표준편차 계산
        if (stats->packets_received > 1) {
            double variance = (sum_sq - (sum * sum) / stats->packets_received) /
                             (stats->packets_received - 1);
            stats->stddev_rtt = sqrt(variance);
        } else {
            stats->stddev_rtt = 0;
        }

        // 지터 계산
        stats->jitter = jitter_count > 0 ? jitter_sum / jitter_count : 0;
    } else {
        stats->avg_rtt = 0;
        stats->stddev_rtt = 0;
        stats->jitter = 0;
        stats->min_rtt = 0;
    }

    stats->packet_loss = (double)(count - stats->packets_received) / count * 100.0;
}

int ping_test(const char *hostname, test_config_t *config) {
    struct in_addr addr;
    int sock;
    measurement_t measurements[1000];
    target_stats_t stats;

    printf("PING 테스트: %s, ", hostname);

    // 호스트명 해석
    if (resolve_hostname(hostname, &addr) < 0) {
        printf("호스트명 해석 실패: %s, ", hostname);
        return -1;
    }

    strcpy(stats.hostname, hostname);
    stats.addr = addr;

    printf("PING %s (%s): %d 바이트 데이터, ",
           hostname, inet_ntoa(addr), config->packet_size);

    // ICMP 소켓 생성
    sock = create_icmp_socket();
    if (sock < 0) {
        printf("TCP 연결 테스트로 대체합니다., ");

        // TCP 연결 테스트로 대체
        for (int i = 0; i < config->count && running; i++) {
            double rtt;

            measurements[i].sequence = i + 1;
            measurements[i].success = (tcp_connect_test(hostname, config->port, &rtt) == 0);

            if (measurements[i].success) {
                measurements[i].rtt = rtt;
                printf("%d: %s port %d 연결 시간=%.2fms, ",
                       i + 1, hostname, config->port, rtt);
            } else {
                printf("%d: %s port %d 연결 실패, ", i + 1, hostname, config->port);
            }

            if (i < config->count - 1) {
                sleep(config->interval);
            }
        }
    } else {
        // ICMP ping 테스트
        for (int i = 0; i < config->count && running; i++) {
            measurements[i].sequence = i + 1;

            if (send_icmp_ping(sock, &addr, i + 1, config->packet_size) == 0) {
                double rtt = receive_icmp_reply(sock, i + 1);

                if (rtt >= 0) {
                    measurements[i].success = 1;
                    measurements[i].rtt = rtt;
                    printf("%d: %s에서 응답: 시간=%.2fms, ", i + 1, hostname, rtt);
                } else {
                    measurements[i].success = 0;
                    printf("%d: %s 요청 시간 초과, ", i + 1, hostname);
                }
            } else {
                measurements[i].success = 0;
                printf("%d: %s 패킷 전송 실패, ", i + 1, hostname);
            }

            if (i < config->count - 1) {
                sleep(config->interval);
            }
        }

        close(sock);
    }

    // 통계 계산
    calculate_statistics(measurements, config->count, &stats);

    // 결과 출력
    printf(", --- %s ping 통계 ---, ", hostname);
    printf("%d 패킷 전송, %d 패킷 수신, %.1f%% 패킷 손실, ",
           stats.packets_sent, stats.packets_received, stats.packet_loss);

    if (stats.packets_received > 0) {
        printf("왕복 시간 최소/평균/최대/표준편차 = %.2f/%.2f/%.2f/%.2f ms, ",
               stats.min_rtt, stats.avg_rtt, stats.max_rtt, stats.stddev_rtt);
        printf("지터: %.2f ms, ", stats.jitter);
    }

    return 0;
}

int traceroute_test(const char *hostname) {
    printf("경로 추적: %s, ", hostname);

    struct in_addr addr;
    if (resolve_hostname(hostname, &addr) < 0) {
        printf("호스트명 해석 실패: %s, ", hostname);
        return -1;
    }

    printf("traceroute to %s (%s), %d hops max, ",
           hostname, inet_ntoa(addr), MAX_HOPS);

    // 간단한 traceroute 구현 (TCP 기반)
    for (int ttl = 1; ttl <= MAX_HOPS; ttl++) {
        int sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock < 0) continue;

        // TTL 설정
        if (setsockopt(sock, IPPROTO_IP, IP_TTL, &ttl, sizeof(ttl)) < 0) {
            close(sock);
            continue;
        }

        struct sockaddr_in dest_addr;
        memset(&dest_addr, 0, sizeof(dest_addr));
        dest_addr.sin_family = AF_INET;
        dest_addr.sin_addr = addr;
        dest_addr.sin_port = htons(80);  // HTTP 포트 사용

        struct timeval start_time, end_time;
        gettimeofday(&start_time, NULL);

        int result = connect(sock, (struct sockaddr*)&dest_addr, sizeof(dest_addr));
        gettimeofday(&end_time, NULL);

        double rtt = get_time_diff(&start_time, &end_time);

        printf("%2d  ", ttl);

        if (result == 0 || errno == ECONNREFUSED) {
            // 목적지 도달 또는 연결 거부 (정상)
            printf("%s  %.2f ms, ", inet_ntoa(addr), rtt);
            close(sock);
            break;
        } else {
            printf("* * *, ");
        }

        close(sock);
    }

    return 0;
}

void bandwidth_test(const char *hostname, int port) {
    printf("대역폭 테스트: %s:%d, ", hostname, port);

    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        perror("socket");
        return;
    }

    struct hostent *he = gethostbyname(hostname);
    if (he == NULL) {
        printf("호스트명 해석 실패, ");
        close(sock);
        return;
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    memcpy(&addr.sin_addr, he->h_addr_list[0], sizeof(struct in_addr));

    if (connect(sock, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        perror("connect");
        close(sock);
        return;
    }

    // 대용량 데이터 전송 테스트
    char buffer[8192];
    memset(buffer, 'A', sizeof(buffer));

    struct timeval start_time, end_time;
    gettimeofday(&start_time, NULL);

    long total_bytes = 0;
    int test_duration = 10;  // 10초 테스트

    while (running) {
        gettimeofday(&end_time, NULL);
        if (get_time_diff(&start_time, &end_time) >= test_duration * 1000) {
            break;
        }

        int bytes_sent = send(sock, buffer, sizeof(buffer), 0);
        if (bytes_sent > 0) {
            total_bytes += bytes_sent;
        } else {
            break;
        }
    }

    gettimeofday(&end_time, NULL);
    double duration = get_time_diff(&start_time, &end_time) / 1000.0;  // 초로 변환

    double bandwidth_mbps = (total_bytes * 8.0) / (duration * 1000000.0);

    printf("전송 데이터: %ld 바이트, ", total_bytes);
    printf("소요 시간: %.2f 초, ", duration);
    printf("대역폭: %.2f Mbps, ", bandwidth_mbps);

    close(sock);
}

void print_usage(const char *program_name) {
    printf("네트워크 지연시간 분석기, ");
    printf("사용법: %s [옵션] 호스트명, ", program_name);
    printf("옵션:, ");
    printf("  -c COUNT     ping 횟수 (기본값: 4), ");
    printf("  -i INTERVAL  ping 간격 (초, 기본값: 1), ");
    printf("  -s SIZE      패킷 크기 (바이트, 기본값: 64), ");
    printf("  -p PORT      TCP 테스트 포트 (기본값: 80), ");
    printf("  -t           traceroute 실행, ");
    printf("  -b           대역폭 테스트 실행, ");
    printf("  -w TIMEOUT   타임아웃 (초, 기본값: 5), ");
    printf("  --help       이 도움말 출력, ");
}

int main(int argc, char *argv[]) {
    test_config_t config = {
        .count = 4,
        .interval = 1,
        .timeout = DEFAULT_TIMEOUT,
        .packet_size = 64,
        .port = 80,
        .show_hops = 0
    };

    int do_traceroute = 0;
    int do_bandwidth = 0;
    char *target_host = NULL;

    // 명령행 인자 처리
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-c") == 0 && i + 1 < argc) {
            config.count = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-i") == 0 && i + 1 < argc) {
            config.interval = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-s") == 0 && i + 1 < argc) {
            config.packet_size = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-p") == 0 && i + 1 < argc) {
            config.port = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-w") == 0 && i + 1 < argc) {
            config.timeout = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-t") == 0) {
            do_traceroute = 1;
        } else if (strcmp(argv[i], "-b") == 0) {
            do_bandwidth = 1;
        } else if (strcmp(argv[i], "--help") == 0) {
            print_usage(argv[0]);
            return 0;
        } else if (argv[i][0] != '-') {
            target_host = argv[i];
        }
    }

    if (target_host == NULL) {
        printf("오류: 대상 호스트를 지정해야 합니다., ");
        print_usage(argv[0]);
        return 1;
    }

    strcpy(config.target, target_host);

    // 시그널 핸들러 설정
    signal(SIGINT, signal_handler);

    printf("네트워크 지연시간 분석기, ");
    printf("대상: %s, ", target_host);
    printf("==========================, , ");

    // ping 테스트
    ping_test(target_host, &config);

    if (running && do_traceroute) {
        printf(", ");
        traceroute_test(target_host);
    }

    if (running && do_bandwidth) {
        printf(", ");
        bandwidth_test(target_host, config.port);
    }

    return 0;
}
```

## 컴파일 및 사용법

```bash
# 컴파일 (수학 라이브러리 링크 필요)
gcc -o network_analyzer network_latency_analyzer.c -lm

# 기본 ping 테스트
sudo ./network_analyzer google.com

# 옵션을 사용한 상세 테스트
sudo ./network_analyzer -c 10 -i 1 -t -b -p 443 google.com

# TCP 연결 테스트만 (root 권한 불필요)
./network_analyzer -p 80 example.com
```

## 주요 기능과 특징

### 1. 다중 측정 방식

- **ICMP ping**: 표준 ping 프로토콜로 순수 네트워크 지연시간 측정
- **TCP 연결**: 애플리케이션 레벨 연결 지연시간 측정
- **Traceroute**: 네트워크 경로와 중간 지점 지연시간 추적
- **대역폭 테스트**: 실제 처리량 측정

### 2. 정확한 통계 계산

- **RTT 통계**: 최소/최대/평균/표준편차
- **패킷 손실률**: 네트워크 안정성 지표
- **지터 측정**: 지연시간 변동성 분석
- **대역폭 계산**: 실제 전송 속도 측정

### 3. 실용적 설계

- **권한 처리**: ICMP 불가 시 TCP 테스트로 자동 전환
- **시그널 처리**: Ctrl+C로 안전한 종료
- **타임아웃 관리**: 응답 없는 대상에 대한 적절한 처리
- **오류 복구**: 네트워크 문제 상황에서의 견고한 동작

## 핵심 요점

### 1. 정확한 측정의 중요성

네트워크 최적화의 첫 번째 단계는 정확한 현상 파악입니다. 이 도구는 마이크로초 단위의 정밀한 시간 측정을 통해 신뢰할 수 있는 성능 데이터를 제공합니다.

### 2. 다각적 분석 접근

ICMP, TCP, 경로 추적, 대역폭 테스트를 결합하여 네트워크 문제의 근본 원인을 정확히 파악할 수 있습니다.

### 3. 실전 활용성

실제 운영 환경에서 바로 사용할 수 있도록 권한 처리, 오류 복구, 사용자 편의성을 고려하여 설계되었습니다.

---

**이전**: [네트워크 지연시간 최적화 개요](06-network-latency-optimization.md)  
**다음**: [네트워크 최적화 자동화](06b-optimization-automation.md)에서 시스템 레벨 최적화 스크립트를 학습합니다.
