---
tags:
  - High Performance Networking
  - C Programming
  - Performance Analysis
  - Ring Buffer
  - Batch Processing
---

# 고성능 네트워킹 분석 도구: "마이크로초 단위 최적화"

네트워크 성능을 극한까지 끌어올리기 위한 C 기반 분석 및 최적화 도구입니다.

```c
// high_performance_network.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/epoll.h>
#include <sys/mman.h>
#include <errno.h>
#include <time.h>
#include <pthread.h>
#include <sched.h>
#include <sys/syscall.h>
#include <linux/if_packet.h>
#include <linux/if_ether.h>
#include <sys/ioctl.h>
#include <net/if.h>
#include <fcntl.h>
#include <sys/timerfd.h>
#include <stdatomic.h>

#define MAX_EVENTS 1024
#define BUFFER_SIZE 65536
#define PACKET_SIZE 1500
#define RING_SIZE 1024
#define MAX_BATCH_SIZE 64

// 고성능 링 버퍼 구조체
typedef struct {
    void *data;
    size_t size;
    volatile size_t head;
    volatile size_t tail;
    size_t mask;
} ring_buffer_t;

// 패킷 통계
typedef struct {
    atomic_uint_fast64_t packets_sent;
    atomic_uint_fast64_t packets_received;
    atomic_uint_fast64_t bytes_sent;
    atomic_uint_fast64_t bytes_received;
    atomic_uint_fast64_t errors;
    atomic_uint_fast64_t drops;
    uint64_t min_latency_ns;
    uint64_t max_latency_ns;
    uint64_t total_latency_ns;
    uint64_t latency_samples;
} packet_stats_t;

// 워커 스레드 구조체
typedef struct {
    int thread_id;
    int cpu_core;
    int socket_fd;
    ring_buffer_t *tx_ring;
    ring_buffer_t *rx_ring;
    packet_stats_t *stats;
    volatile int running;
} worker_thread_t;

static packet_stats_t global_stats = {0};

// 타임스탬프 함수 (나노초 단위)
static inline uint64_t get_timestamp_ns() {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000000000ULL + ts.tv_nsec;
}

// CPU 친화성 설정
int set_cpu_affinity(int cpu_core) {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(cpu_core, &cpuset);

    if (sched_setaffinity(0, sizeof(cpuset), &cpuset) != 0) {
        perror("sched_setaffinity");
        return -1;
    }

    // 스케줄링 우선순위 설정
    struct sched_param param;
    param.sched_priority = 99;

    if (sched_setscheduler(0, SCHED_FIFO, &param) != 0) {
        perror("sched_setscheduler");
        // 경고만 출력하고 계속 진행
    }

    return 0;
}

// 링 버퍼 초기화
// Lock-Free Ring Buffer 생성 - 고성능 패킷 처리의 핵심 자료구조
// 실제 사용: DPDK, Intel SPDK, Linux Kernel의 네트워크 스택, Redis의 pub/sub
// 성능 이점: Mutex/Lock 대비 10-100배 빠른 생산자-소비자 큐
ring_buffer_t* create_ring_buffer(size_t size) {
    // ⭐ 1단계: 크기를 2의 거듭제곱으로 정규화
    // 핵심 최적화: modulo 연산 대신 비트 마스킹 사용 (% → &)
    // 성능: modulo는 20-30 사이클, 비트 마스킹은 1 사이클
    size_t ring_size = 1;
    while (ring_size < size) {
        ring_size <<= 1;  // 2배씩 증가하여 다음 2^n 값 찾기
    }

    // ⭐ 2단계: Ring Buffer 메타데이터 구조체 할당
    ring_buffer_t *ring = malloc(sizeof(ring_buffer_t));
    if (!ring) {
        return NULL;
    }

    // ⭐ 3단계: Lock-Free 알고리즘을 위한 핵심 파라미터 설정
    ring->size = ring_size;
    ring->mask = ring_size - 1;  // 2^n - 1 = 비트마스크 (예: 1024 → 1023 = 0x3FF)
    ring->head = 0;  // 생산자 포인터 (write position)
    ring->tail = 0;  // 소비자 포인터 (read position)

    // ⭐ 4단계: 캐시 라인 정렬된 메모리 할당
    // posix_memalign(64): 64바이트(CPU 캐시 라인) 경계에 정렬
    // 중요성: False sharing 방지, 캐시 성능 극대화
    // 실무: Intel/AMD CPU에서 캐시 라인 크기가 64바이트
    if (posix_memalign(&ring->data, 64, ring_size * PACKET_SIZE) != 0) {
        free(ring);
        return NULL;
    }

    // ⭐ 5단계: 메모리 페이지 잠금 (스와핑 방지)
    // mlock(): 물리 메모리에 고정하여 페이지 스왑 방지
    // 실무 중요성: 레이턴시 중요 애플리케이션에서 스왑으로 인한 지연 제거
    // 예시: 고빈도 거래, 실시간 스트리밍에서 필수
    if (mlock(ring->data, ring_size * PACKET_SIZE) != 0) {
        perror("mlock");
        // 경고만 출력하고 계속 진행 - 권한 부족이나 메모리 제한 시 실패 가능
    }

    return ring;
}

// 링 버퍼에 데이터 추가 (락프리)
static inline int ring_buffer_push(ring_buffer_t *ring, const void *data, size_t len) {
    size_t head = ring->head;
    size_t next_head = (head + 1) & ring->mask;

    if (next_head == ring->tail) {
        return -1; // 버퍼 가득 찬 상태
    }

    void *slot = (char*)ring->data + (head * PACKET_SIZE);
    memcpy(slot, data, len < PACKET_SIZE ? len : PACKET_SIZE);

    // 메모리 배리어
    __sync_synchronize();

    ring->head = next_head;
    return 0;
}

// 링 버퍼에서 데이터 꺼내기 (락프리)
static inline int ring_buffer_pop(ring_buffer_t *ring, void *data, size_t *len) {
    size_t tail = ring->tail;

    if (tail == ring->head) {
        return -1; // 버퍼 비어있음
    }

    void *slot = (char*)ring->data + (tail * PACKET_SIZE);
    *len = PACKET_SIZE; // 실제로는 패킷 크기 정보가 필요
    memcpy(data, slot, *len);

    // 메모리 배리어
    __sync_synchronize();

    ring->tail = (tail + 1) & ring->mask;
    return 0;
}

// 고성능 소켓 생성 및 설정
int create_high_performance_socket(int port) {
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) {
        perror("socket");
        return -1;
    }

    // 소켓 옵션 최적화
    int opt = 1;

    // SO_REUSEADDR 설정
    if (setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("setsockopt SO_REUSEADDR");
        close(sock);
        return -1;
    }

    // SO_REUSEPORT 설정 (가능한 경우)
    if (setsockopt(sock, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt)) < 0) {
        perror("setsockopt SO_REUSEPORT");
        // 지원하지 않는 경우 경고만 출력
    }

    // 버퍼 크기 최대화
    int buffer_size = 16 * 1024 * 1024; // 16MB
    if (setsockopt(sock, SOL_SOCKET, SO_RCVBUF, &buffer_size, sizeof(buffer_size)) < 0) {
        perror("setsockopt SO_RCVBUF");
    }

    if (setsockopt(sock, SOL_SOCKET, SO_SNDBUF, &buffer_size, sizeof(buffer_size)) < 0) {
        perror("setsockopt SO_SNDBUF");
    }

    // 논블로킹 모드 설정
    int flags = fcntl(sock, F_GETFL, 0);
    if (fcntl(sock, F_SETFL, flags | O_NONBLOCK) < 0) {
        perror("fcntl O_NONBLOCK");
        close(sock);
        return -1;
    }

    // 주소 바인딩
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(port);

    if (bind(sock, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        perror("bind");
        close(sock);
        return -1;
    }

    return sock;
}

// 배치 송신 함수
int batch_send(int sock, struct sockaddr_in *dest_addr,
               ring_buffer_t *tx_ring, packet_stats_t *stats) {
    char packets[MAX_BATCH_SIZE][PACKET_SIZE];
    struct mmsghdr msgs[MAX_BATCH_SIZE];
    struct iovec iovecs[MAX_BATCH_SIZE];
    int batch_size = 0;

    // 링 버퍼에서 배치로 패킷 수집
    for (int i = 0; i < MAX_BATCH_SIZE; i++) {
        size_t len;
        if (ring_buffer_pop(tx_ring, packets[i], &len) == 0) {
            // 타임스탬프 추가 (성능 측정용)
            uint64_t timestamp = get_timestamp_ns();
            memcpy(packets[i], &timestamp, sizeof(timestamp));

            iovecs[i].iov_base = packets[i];
            iovecs[i].iov_len = len;

            msgs[i].msg_hdr.msg_name = dest_addr;
            msgs[i].msg_hdr.msg_namelen = sizeof(*dest_addr);
            msgs[i].msg_hdr.msg_iov = &iovecs[i];
            msgs[i].msg_hdr.msg_iovlen = 1;
            msgs[i].msg_hdr.msg_control = NULL;
            msgs[i].msg_hdr.msg_controllen = 0;
            msgs[i].msg_hdr.msg_flags = 0;

            batch_size++;
        } else {
            break;
        }
    }

    if (batch_size == 0) {
        return 0;
    }

    // 배치 송신
    int sent = sendmmsg(sock, msgs, batch_size, MSG_DONTWAIT);
    if (sent > 0) {
        atomic_fetch_add(&stats->packets_sent, sent);
        atomic_fetch_add(&stats->bytes_sent, sent * PACKET_SIZE);
    } else if (sent < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
        atomic_fetch_add(&stats->errors, 1);
    }

    return sent > 0 ? sent : 0;
}

// 배치 수신 함수
int batch_receive(int sock, ring_buffer_t *rx_ring, packet_stats_t *stats) {
    char packets[MAX_BATCH_SIZE][PACKET_SIZE];
    struct mmsghdr msgs[MAX_BATCH_SIZE];
    struct iovec iovecs[MAX_BATCH_SIZE];
    struct sockaddr_in src_addrs[MAX_BATCH_SIZE];

    // 배치 수신을 위한 구조체 설정
    for (int i = 0; i < MAX_BATCH_SIZE; i++) {
        iovecs[i].iov_base = packets[i];
        iovecs[i].iov_len = PACKET_SIZE;

        msgs[i].msg_hdr.msg_name = &src_addrs[i];
        msgs[i].msg_hdr.msg_namelen = sizeof(src_addrs[i]);
        msgs[i].msg_hdr.msg_iov = &iovecs[i];
        msgs[i].msg_hdr.msg_iovlen = 1;
        msgs[i].msg_hdr.msg_control = NULL;
        msgs[i].msg_hdr.msg_controllen = 0;
        msgs[i].msg_hdr.msg_flags = 0;
    }

    // 배치 수신
    int received = recvmmsg(sock, msgs, MAX_BATCH_SIZE, MSG_DONTWAIT, NULL);
    if (received > 0) {
        uint64_t now = get_timestamp_ns();

        for (int i = 0; i < received; i++) {
            // 지연시간 계산 (타임스탬프가 있는 경우)
            if (msgs[i].msg_len >= sizeof(uint64_t)) {
                uint64_t send_time;
                memcpy(&send_time, packets[i], sizeof(send_time));

                if (send_time > 0 && send_time < now) {
                    uint64_t latency = now - send_time;

                    stats->total_latency_ns += latency;
                    stats->latency_samples++;

                    if (latency < stats->min_latency_ns || stats->min_latency_ns == 0) {
                        stats->min_latency_ns = latency;
                    }
                    if (latency > stats->max_latency_ns) {
                        stats->max_latency_ns = latency;
                    }
                }
            }

            // 링 버퍼에 저장
            if (ring_buffer_push(rx_ring, packets[i], msgs[i].msg_len) != 0) {
                atomic_fetch_add(&stats->drops, 1);
            }
        }

        atomic_fetch_add(&stats->packets_received, received);
        atomic_fetch_add(&stats->bytes_received, received * PACKET_SIZE);
    } else if (received < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
        atomic_fetch_add(&stats->errors, 1);
    }

    return received > 0 ? received : 0;
}

// 고성능 워커 스레드 - 극한 성능을 위한 Busy Polling 패턴
// 실제 사용: Intel DPDK, Cloudflare의 Pingora, Nginx Plus, HAProxy Enterprise
// 성능 이점: 컨텍스트 스위칭 제거, 인터럽트 오버헤드 제거, 마이크로초 단위 레이턴시 달성
void* high_performance_worker(void *arg) {
    worker_thread_t *worker = (worker_thread_t*)arg;

    // ⭐ 1단계: CPU 친화성 설정 - 캐시 지역성 극대화
    // 핵심: 특정 CPU 코어에 스레드를 고정하여 캐시 미스 최소화
    // 실무 중요성: L1/L2 캐시 히트율이 95% → 99%로 향상 시 레이턴시 50% 감소
    if (set_cpu_affinity(worker->cpu_core) != 0) {
        printf("워커 %d: CPU 친화성 설정 실패\n", worker->thread_id);
    }

    printf("워커 %d: CPU %d에서 시작\n", worker->thread_id, worker->cpu_core);

    // ⭐ 2단계: 목적지 주소 사전 계산
    // 최적화: 반복 계산 제거, 핫 패스에서 메모리 접근 최소화
    struct sockaddr_in dest_addr;
    memset(&dest_addr, 0, sizeof(dest_addr));
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    dest_addr.sin_port = htons(8080);

    // ⭐ 3단계: Busy Polling 메인 루프 - 극한 성능의 핵심
    // 트레이드오프: CPU 사용률 100% vs 마이크로초 단위 레이턴시
    // 적용 분야: 고빈도 거래, 실시간 게임 서버, CDN 에지 서버
    while (worker->running) {
        // ⭐ 4단계: 배치 수신 처리
        // recvmmsg() 시스템콜로 한 번에 여러 패킷 처리
        // 성능 이점: 시스템콜 오버헤드를 패킷 수만큼 분할
        batch_receive(worker->socket_fd, worker->rx_ring, worker->stats);

        // ⭐ 5단계: 배치 송신 처리
        // sendmmsg() 시스템콜로 한 번에 여러 패킷 전송
        // 네트워크 카드의 배치 처리 능력 최대 활용
        batch_send(worker->socket_fd, &dest_addr, worker->tx_ring, worker->stats);

        // ⭐ 6단계: CPU 파이프라인 최적화 힌트
        // __builtin_ia32_pause(): Intel x86의 PAUSE 명령어
        // 효과: Hyper-Threading 환경에서 다른 논리 코어에 CPU 사이클 양보
        // 전력 효율성: Busy waiting 중 전력 소모 약 10-15% 감소
        __builtin_ia32_pause(); // x86에서만 사용 가능
    }

    printf("워커 %d: 종료\n", worker->thread_id);
    return NULL;
}

// 성능 통계 출력
void print_performance_stats(packet_stats_t *stats, int duration_sec) {
    uint64_t packets_sent = atomic_load(&stats->packets_sent);
    uint64_t packets_received = atomic_load(&stats->packets_received);
    uint64_t bytes_sent = atomic_load(&stats->bytes_sent);
    uint64_t bytes_received = atomic_load(&stats->bytes_received);
    uint64_t errors = atomic_load(&stats->errors);
    uint64_t drops = atomic_load(&stats->drops);

    printf("\n=== 성능 통계 (%d초) ===\n", duration_sec);
    printf("송신 패킷: %lu (%.2f pps)\n",
           packets_sent, (double)packets_sent / duration_sec);
    printf("수신 패킷: %lu (%.2f pps)\n",
           packets_received, (double)packets_received / duration_sec);
    printf("송신 대역폭: %.2f Mbps\n",
           (double)bytes_sent * 8 / (duration_sec * 1000000));
    printf("수신 대역폭: %.2f Mbps\n",
           (double)bytes_received * 8 / (duration_sec * 1000000));
    printf("오류: %lu\n", errors);
    printf("드롭: %lu\n", drops);

    if (stats->latency_samples > 0) {
        double avg_latency = (double)stats->total_latency_ns / stats->latency_samples;
        printf("지연시간 - 최소: %lu ns, 평균: %.0f ns, 최대: %lu ns\n",
               stats->min_latency_ns, avg_latency, stats->max_latency_ns);
        printf("지연시간 샘플 수: %lu\n", stats->latency_samples);
    }
}

// 시스템 최적화 권장사항 출력
void print_optimization_recommendations() {
    printf("\n=== 고성능 네트워킹 최적화 권장사항 ===\n");

    // CPU 주파수 거버너 확인
    printf("1. CPU 주파수 설정:\n");
    system("cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo '   설정 정보 없음'");
    printf("   권장: performance 모드\n");
    printf("   명령어: sudo cpupower frequency-set -g performance\n\n");

    // NUMA 설정 확인
    printf("2. NUMA 토폴로지:\n");
    system("numactl --hardware 2>/dev/null | head -5 || echo '   NUMA 정보 없음'");
    printf("   권장: 메모리와 CPU를 같은 NUMA 노드에 바인딩\n\n");

    // 인터럽트 설정
    printf("3. 네트워크 인터럽트 최적화:\n");
    printf("   권장: 네트워크 인터럽트를 전용 CPU 코어에 바인딩\n");
    printf("   명령어: echo 2 > /proc/irq/[IRQ번호]/smp_affinity\n\n");

    // 커널 파라미터
    printf("4. 커널 파라미터 최적화:\n");
    printf("   net.core.busy_read = 50\n");
    printf("   net.core.busy_poll = 50\n");
    printf("   net.core.netdev_max_backlog = 30000\n");
    printf("   kernel.sched_migration_cost_ns = 5000000\n\n");

    // 대안 기술
    printf("5. 고급 기술 고려사항:\n");
    printf("   - DPDK: 커널 우회 패킷 처리\n");
    printf("   - RDMA: 원격 메모리 직접 접근\n");
    printf("   - AF_XDP: eBPF 기반 고속 패킷 처리\n");
    printf("   - io_uring: 차세대 비동기 I/O\n");
}

// 메인 함수
int main(int argc, char *argv[]) {
    int num_workers = 4;
    int duration_sec = 30;
    int base_port = 8080;

    // 명령행 인자 처리
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-w") == 0 && i + 1 < argc) {
            num_workers = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-t") == 0 && i + 1 < argc) {
            duration_sec = atoi(argv[++i]);
        } else if (strcmp(argv[i], "-p") == 0 && i + 1 < argc) {
            base_port = atoi(argv[++i]);
        } else if (strcmp(argv[i], "--help") == 0) {
            printf("고성능 네트워킹 테스트 도구\n");
            printf("사용법: %s [-w workers] [-t duration] [-p port]\n", argv[0]);
            printf("  -w workers   워커 스레드 수 (기본값: 4)\n");
            printf("  -t duration  테스트 시간 (초, 기본값: 30)\n");
            printf("  -p port      기본 포트 (기본값: 8080)\n");
            return 0;
        }
    }

    printf("고성능 네트워킹 성능 테스트 시작\n");
    printf("워커 스레드: %d개\n", num_workers);
    printf("테스트 시간: %d초\n", duration_sec);
    printf("기본 포트: %d\n", base_port);

    // 권한 확인
    if (geteuid() != 0) {
        printf("\n경고: 최적 성능을 위해서는 root 권한이 필요합니다.\n");
        printf("mlock, 스케줄링 우선순위 등의 기능이 제한될 수 있습니다.\n\n");
    }

    // 워커 스레드 배열
    worker_thread_t workers[num_workers];
    pthread_t threads[num_workers];
    packet_stats_t worker_stats[num_workers];

    // 워커 초기화 및 시작
    for (int i = 0; i < num_workers; i++) {
        memset(&worker_stats[i], 0, sizeof(packet_stats_t));

        workers[i].thread_id = i;
        workers[i].cpu_core = i; // 각 워커를 다른 CPU 코어에 바인딩
        workers[i].socket_fd = create_high_performance_socket(base_port + i);
        workers[i].stats = &worker_stats[i];
        workers[i].running = 1;

        if (workers[i].socket_fd < 0) {
            printf("워커 %d: 소켓 생성 실패\n", i);
            continue;
        }

        // 링 버퍼 생성
        workers[i].tx_ring = create_ring_buffer(RING_SIZE);
        workers[i].rx_ring = create_ring_buffer(RING_SIZE);

        if (!workers[i].tx_ring || !workers[i].rx_ring) {
            printf("워커 %d: 링 버퍼 생성 실패\n", i);
            continue;
        }

        // 스레드 시작
        if (pthread_create(&threads[i], NULL, high_performance_worker, &workers[i]) != 0) {
            printf("워커 %d: 스레드 생성 실패\n", i);
            workers[i].running = 0;
        }
    }

    // 테스트 패킷 생성 및 송신
    char test_packet[PACKET_SIZE];
    memset(test_packet, 0xAA, sizeof(test_packet));

    printf("\n테스트 패킷 생성 중...\n");

    // 각 워커의 송신 링에 패킷 추가
    for (int round = 0; round < 1000; round++) {
        for (int i = 0; i < num_workers; i++) {
            if (workers[i].running) {
                ring_buffer_push(workers[i].tx_ring, test_packet, PACKET_SIZE);
            }
        }
    }

    printf("성능 테스트 실행 중... (%d초)\n", duration_sec);

    // 테스트 실행
    sleep(duration_sec);

    // 워커 중지
    for (int i = 0; i < num_workers; i++) {
        workers[i].running = 0;
    }

    // 스레드 종료 대기
    for (int i = 0; i < num_workers; i++) {
        pthread_join(threads[i], NULL);

        if (workers[i].socket_fd >= 0) {
            close(workers[i].socket_fd);
        }

        // 통계 누적
        atomic_fetch_add(&global_stats.packets_sent,
                        atomic_load(&worker_stats[i].packets_sent));
        atomic_fetch_add(&global_stats.packets_received,
                        atomic_load(&worker_stats[i].packets_received));
        atomic_fetch_add(&global_stats.bytes_sent,
                        atomic_load(&worker_stats[i].bytes_sent));
        atomic_fetch_add(&global_stats.bytes_received,
                        atomic_load(&worker_stats[i].bytes_received));
        atomic_fetch_add(&global_stats.errors,
                        atomic_load(&worker_stats[i].errors));
        atomic_fetch_add(&global_stats.drops,
                        atomic_load(&worker_stats[i].drops));

        // 지연시간 통계 누적
        global_stats.total_latency_ns += worker_stats[i].total_latency_ns;
        global_stats.latency_samples += worker_stats[i].latency_samples;

        if (worker_stats[i].min_latency_ns > 0 &&
            (worker_stats[i].min_latency_ns < global_stats.min_latency_ns ||
             global_stats.min_latency_ns == 0)) {
            global_stats.min_latency_ns = worker_stats[i].min_latency_ns;
        }

        if (worker_stats[i].max_latency_ns > global_stats.max_latency_ns) {
            global_stats.max_latency_ns = worker_stats[i].max_latency_ns;
        }
    }

    // 결과 출력
    print_performance_stats(&global_stats, duration_sec);
    print_optimization_recommendations();

    return 0;
}
```

## 핵심 요점

### 1. Lock-Free Ring Buffer

마이크로초 단위 성능을 위한 핵심 자료구조로, Mutex 대비 10-100배 빠른 처리가 가능합니다

### 2. Busy Polling 패턴

CPU 사용률 100%를 감수하고 컨텍스트 스위칭을 제거하여 극한의 레이턴시를 달성합니다

### 3. 배치 처리 최적화

sendmmsg/recvmmsg를 활용하여 시스템콜 오버헤드를 최소화합니다

---

**이전**: [고성능 아키텍처](07a-high-performance-architecture.md)  
**다음**: [DPDK 통합](07c-dpdk-integration.md)에서 커널 바이패스 기술과 DPDK 활용법을 학습합니다.
