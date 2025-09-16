---
tags:
  - NUMA
  - advanced
  - deep-study
  - hands-on
  - performance-optimization
  - sendfile
  - splice
  - zero-copy
  - 인프라스트럭처
difficulty: ADVANCED
learning_time: "12-20시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# Chapter 7-3B: 제로카피와 NUMA 최적화

## 🏎️ 데이터 복사는 악이다

일반적인 파일 전송에서는 데이터가 4번이나 복사됩니다:

1. 디스크 → 커널 버퍼 (DMA)
2. 커널 버퍼 → 사용자 버퍼 (CPU)
3. 사용자 버퍼 → 소켓 버퍼 (CPU)
4. 소켓 버퍼 → NIC (DMA)

제로카피를 사용하면? 단 2번!

1. 디스크 → 커널 버퍼 (DMA)
2. 커널 버퍼 → NIC (DMA)

실제 성능 차이:

```bash
# 10GB 파일 전송 테스트
$ time ./normal_copy large_file.bin
real    0m12.483s
user    0m2.140s
sys     0m10.343s  # CPU가 10초나 복사에 사용!

$ time ./zero_copy large_file.bin
real    0m3.127s   # 4배 빨라짐!
user    0m0.004s
sys     0m0.128s   # CPU는 거의 놀고 있음
```

## sendfile과 splice

### 📁 정적 파일 서빙의 비밀 무기

제가 CDN 회사에서 일할 때, sendfile() 하나로 처리량을 5배 늘린 경험이 있습니다. nginx가 빠른 이유도 바로 이것입니다!

```c
// 제로카피 파일 서빙
struct file_server {
    int listen_fd;
    struct file_cache *cache;
};

struct file_cache_entry {
    int fd;
    off_t size;
    time_t mtime;
    char *path;

    // 메타데이터 캐싱
    char *etag;
    char *content_type;
    char *last_modified;

    // LRU 링크
    struct list_head lru;

    // 참조 카운트
    atomic_t refcount;
};

// sendfile을 사용한 정적 파일 서빙
// Netflix가 영상 스트리밍에 사용하는 기술!
void serve_static_file(int client_fd, const char *filepath) {
    struct stat st;
    int file_fd;

    file_fd = open(filepath, O_RDONLY);
    if (file_fd < 0) {
        send_404(client_fd);
        return;
    }

    if (fstat(file_fd, &st) < 0) {
        close(file_fd);
        send_500(client_fd);
        return;
    }

    // HTTP 헤더 전송
    char header[512];
    int header_len = snprintf(header, sizeof(header),
        "HTTP/1.1 200 OK\r\n"
        "Content-Length: %ld\r\n"
        "Content-Type: %s\r\n"
        "Cache-Control: public, max-age=3600\r\n"
        "\r\n",
        st.st_size, get_content_type(filepath));

    send(client_fd, header, header_len, MSG_MORE);

    // sendfile로 제로카피 전송
    off_t offset = 0;
    size_t remaining = st.st_size;

    while (remaining > 0) {
        ssize_t sent = sendfile(client_fd, file_fd, &offset, remaining);

        if (sent < 0) {
            if (errno == EAGAIN || errno == EINTR)
                continue;
            break;
        }

        remaining -= sent;
    }

    close(file_fd);
}

// splice를 사용한 프록시
// HAProxy가 초당 100만 요청을 처리하는 비결!
// CPU를 거치지 않고 커널 내에서 직접 데이터 이동
void proxy_connection(int client_fd, int upstream_fd) {
    int pipefd[2];

    if (pipe2(pipefd, O_NONBLOCK) < 0) {
        return;
    }

    // 양방향 프록시
    while (1) {
        fd_set read_fds;
        FD_ZERO(&read_fds);
        FD_SET(client_fd, &read_fds);
        FD_SET(upstream_fd, &read_fds);

        int max_fd = (client_fd > upstream_fd) ? client_fd : upstream_fd;

        if (select(max_fd + 1, &read_fds, NULL, NULL, NULL) <= 0)
            break;

        // 클라이언트 -> 업스트림
        if (FD_ISSET(client_fd, &read_fds)) {
            ssize_t n = splice(client_fd, NULL, pipefd[1], NULL,
                             65536, SPLICE_F_MOVE | SPLICE_F_NONBLOCK);
            if (n > 0) {
                splice(pipefd[0], NULL, upstream_fd, NULL,
                      n, SPLICE_F_MOVE | SPLICE_F_NONBLOCK);
            } else if (n == 0 || (n < 0 && errno != EAGAIN)) {
                break;
            }
        }

        // 업스트림 -> 클라이언트
        if (FD_ISSET(upstream_fd, &read_fds)) {
            ssize_t n = splice(upstream_fd, NULL, pipefd[1], NULL,
                             65536, SPLICE_F_MOVE | SPLICE_F_NONBLOCK);
            if (n > 0) {
                splice(pipefd[0], NULL, client_fd, NULL,
                      n, SPLICE_F_MOVE | SPLICE_F_NONBLOCK);
            } else if (n == 0 || (n < 0 && errno != EAGAIN)) {
                break;
            }
        }
    }

    close(pipefd[0]);
    close(pipefd[1]);
}

// MSG_ZEROCOPY (Linux 4.14+)
// Google이 YouTube 스트리밍에 사용하는 최신 기술!
// 주의: 작은 패킷에는 오히려 오버헤드가 있음 (최소 10KB 이상 권장)
void send_with_zerocopy(int fd, const void *buf, size_t len) {
    // MSG_ZEROCOPY 플래그 사용
    ssize_t ret = send(fd, buf, len, MSG_ZEROCOPY);

    if (ret < 0) {
        perror("send");
        return;
    }

    // 완료 통지 수신
    struct msghdr msg = {0};
    struct sock_extended_err *serr;
    struct cmsghdr *cmsg;
    char control[100];

    msg.msg_control = control;
    msg.msg_controllen = sizeof(control);

    ret = recvmsg(fd, &msg, MSG_ERRQUEUE);
    if (ret < 0) {
        perror("recvmsg");
        return;
    }

    cmsg = CMSG_FIRSTHDR(&msg);
    if (!cmsg || cmsg->cmsg_level != SOL_IP ||
        cmsg->cmsg_type != IP_RECVERR) {
        return;
    }

    serr = (struct sock_extended_err *)CMSG_DATA(cmsg);
    if (serr->ee_errno != 0 || serr->ee_origin != SO_EE_ORIGIN_ZEROCOPY) {
        printf("zerocopy failed\n");
    }
}
```

## NUMA 최적화

### 🏗️ 현대 서버의 숨겨진 복잡성

제가 처음 NUMA를 접했을 때의 충격을 아직도 기억합니다. "뭐? 모든 메모리가 똑같이 빠른 게 아니라고?"

```bash
# NUMA 노드 간 메모리 접근 속도 차이
$ numactl --hardware
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3 4 5 6 7
node 1 cpus: 8 9 10 11 12 13 14 15
node distances:
node   0   1
  0:  10  21   # 로컬: 10, 원격: 21 (2.1배 느림!)
  1:  21  10
```

실제 성능 차이:

```python
# 잘못된 NUMA 배치
CPU 0에서 실행 + Node 1 메모리 사용 = 100ms

# 올바른 NUMA 배치
CPU 0에서 실행 + Node 0 메모리 사용 = 47ms

# 무려 2배 이상 차이! 😱
```

### NUMA 인식 메모리 할당

#### 🎯 메모리 지역성의 중요성

대규모 데이터베이스 서버를 운영하면서 배운 교훈: "NUMA를 무시하면 성능의 절반을 버리는 것이다!"

```c
#include <numa.h>
#include <numaif.h>

struct numa_server {
    int num_nodes;
    int *cpus_per_node;

    // 노드별 메모리 풀
    struct memory_pool **node_pools;

    // 노드별 워커 스레드
    pthread_t **node_workers;
};

// NUMA 토폴로지 초기화
// Facebook이 memcached에서 사용하는 NUMA 최적화 기법
struct numa_server *numa_server_init(void) {
    if (numa_available() < 0) {
        printf("NUMA not available\n");
        return NULL;
    }

    struct numa_server *server = calloc(1, sizeof(*server));
    server->num_nodes = numa_num_configured_nodes();

    printf("NUMA nodes: %d\n", server->num_nodes);

    server->cpus_per_node = calloc(server->num_nodes, sizeof(int));
    server->node_pools = calloc(server->num_nodes, sizeof(void *));
    server->node_workers = calloc(server->num_nodes, sizeof(pthread_t *));

    // 각 노드의 CPU 수 계산
    for (int node = 0; node < server->num_nodes; node++) {
        struct bitmask *cpus = numa_allocate_cpumask();
        numa_node_to_cpus(node, cpus);

        server->cpus_per_node[node] = numa_bitmask_weight(cpus);
        printf("Node %d: %d CPUs\n", node, server->cpus_per_node[node]);

        // 노드별 메모리 풀 생성
        server->node_pools[node] = create_numa_memory_pool(node);

        // 노드별 워커 스레드 생성
        server->node_workers[node] = calloc(server->cpus_per_node[node],
                                           sizeof(pthread_t));

        spawn_numa_workers(server, node, cpus);

        numa_free_cpumask(cpus);
    }

    return server;
}

// NUMA 최적화 메모리 풀 생성 - 대용량 서버의 성능 핵심
// 실제 사용: Facebook의 TAO, Netflix의 EVCache, Redis Cluster의 노드별 분산
// 성능 이득: 원격 메모리 접근 비용 50-70% 감소, 메모리 대역폭 2-3배 향상
struct memory_pool *create_numa_memory_pool(int node) {
    struct memory_pool *pool;

    // ⭐ 1단계: 풀 구조체를 지정된 NUMA 노드에 할당
    // numa_alloc_onnode(): 특정 NUMA 노드의 로컬 메모리에 할당
    // 중요: 풀 구조체 자체도 해당 노드에 두어야 메타데이터 접근도 최적화
    pool = numa_alloc_onnode(sizeof(*pool), node);

    if (!pool)
        return NULL;

    // ⭐ 2단계: 실제 메모리 풀을 노드 로컬 메모리에 할당
    // 핵심: 이 메모리 영역에서 네트워크 버퍼, 연결 구조체 등이 할당됨
    // 실무 예시: 64GB RAM에서 노드당 16GB씩 분할하여 캐시 지역성 극대화
    pool->memory = numa_alloc_onnode(POOL_SIZE, node);
    pool->node = node;
    pool->size = POOL_SIZE;
    pool->used = 0;

    // ⭐ 3단계: 메모리 정책 설정 - 엄격한 노드 바인딩
    // MPOL_BIND: 해당 노드에서만 메모리 할당 (다른 노드 사용 금지)
    // MPOL_MF_MOVE: 이미 다른 노드에 있는 페이지도 강제로 이동
    // 실무 중요성: 메모리 압박 상황에서도 원격 노드 접근 방지
    unsigned long nodemask = 1UL << node;  // 비트마스크로 노드 지정
    mbind(pool->memory, POOL_SIZE, MPOL_BIND, &nodemask,
          numa_max_node() + 1, MPOL_MF_MOVE);

    return pool;
}

// NUMA 인식 워커 스레드
// Redis가 단일 스레드임에도 NUMA를 고려하는 이유!
void spawn_numa_workers(struct numa_server *server, int node,
                       struct bitmask *cpus) {
    int worker_id = 0;

    for (int cpu = 0; cpu < numa_num_configured_cpus(); cpu++) {
        if (!numa_bitmask_isbitset(cpus, cpu))
            continue;

        struct worker_config *config = calloc(1, sizeof(*config));
        config->server = server;
        config->node = node;
        config->cpu = cpu;
        config->pool = server->node_pools[node];

        pthread_attr_t attr;
        pthread_attr_init(&attr);

        // CPU 친화도 설정
        cpu_set_t cpuset;
        CPU_ZERO(&cpuset);
        CPU_SET(cpu, &cpuset);
        pthread_attr_setaffinity_np(&attr, sizeof(cpuset), &cpuset);

        pthread_create(&server->node_workers[node][worker_id++],
                      &attr, numa_worker_thread, config);

        pthread_attr_destroy(&attr);
    }
}

// NUMA 로컬 연결 처리
void *numa_worker_thread(void *arg) {
    struct worker_config *config = arg;

    // 현재 스레드를 NUMA 노드에 바인딩
    numa_run_on_node(config->node);
    numa_set_preferred(config->node);

    // 노드 로컬 메모리만 사용
    numa_set_localalloc();

    // io_uring 인스턴스 (노드 로컬)
    struct io_uring *ring = numa_alloc_onnode(sizeof(*ring), config->node);
    io_uring_queue_init(4096, ring, 0);

    // 이벤트 루프
    while (1) {
        struct io_uring_cqe *cqe;

        io_uring_wait_cqe(ring, &cqe);

        // 노드 로컬 메모리에서 버퍼 할당
        void *buffer = allocate_from_pool(config->pool, BUFFER_SIZE);

        // 요청 처리
        process_request(cqe, buffer);

        // 버퍼 반환
        return_to_pool(config->pool, buffer);

        io_uring_cqe_seen(ring, cqe);
    }

    return NULL;
}
```

## 제로카피 기술 비교

### 기술별 특성과 사용 사례

| 기술 | 적용 영역 | 성능 향상 | 제한사항 | 실제 사용 예 |
|------|----------|-----------|----------|-------------|
| **sendfile** | 파일→소켓 | 5-10배 | 파일에서 소켓으로만 | nginx, Apache |
| **splice** | 소켓↔파이프↔소켓 | 3-5배 | 파이프 버퍼 크기 제한 | HAProxy, Squid |
| **MSG_ZEROCOPY** | 소켓 송신 | 20-50% | 10KB 이상에서만 효과적 | Google gRPC |

### 제로카피 선택 가이드

```c
// 파일 서빙: sendfile 사용
if (sending_file_to_socket) {
    use_sendfile();
}

// 프록시/리버스 프록시: splice 사용
else if (forwarding_between_sockets) {
    use_splice_with_pipe();
}

// 대용량 버퍼 송신: MSG_ZEROCOPY 사용
else if (buffer_size >= 10240) {
    use_msg_zerocopy();
}

// 소용량 데이터: 일반 send 사용
else {
    use_regular_send();
}
```

## NUMA 성능 최적화 전략

### 메모리 배치 최적화

```bash
# NUMA 성능 분석 도구들
$ numastat -p [pid]        # 프로세스별 메모리 사용 현황
$ numactl --show           # 현재 NUMA 정책 확인
$ numactl --cpubind=0 --membind=0 ./server  # 특정 노드에 바인딩

# 성능 측정
$ perf stat -e node-loads,node-load-misses ./server
```

### 최적화 체크리스트

```c
// NUMA 최적화 체크리스트
□ CPU와 메모리를 같은 노드에 배치
□ 노드별 워커 스레드 분리
□ 노드 로컬 메모리 풀 사용
□ 원격 노드 접근 최소화
□ 메모리 정책 (MPOL_BIND) 설정
□ 프로세스 CPU 친화도 고정
□ NUMA 밸런싱 비활성화 (필요시)
```

## 핵심 요점

### 1. 제로카피 기술 마스터

- sendfile로 파일 서빙 성능 5-10배 향상
- splice로 프록시 성능 3-5배 향상
- MSG_ZEROCOPY로 대용량 전송 최적화

### 2. NUMA 지역성 최적화

- 메모리 접근 속도 2배 이상 차이
- 노드별 메모리 풀과 워커 스레드 분리
- 엄격한 메모리 정책으로 원격 접근 방지

### 3. 시스템 레벨 최적화

- CPU 친화도로 캐시 효율성 극대화
- 메모리 대역폭 분산으로 병목 해소
- 커널 바이패스 기술 활용

---

**이전**: [C10K/C10M 문제 해결](chapter-07-network-programming/07-17-c10k-scaling-solutions.md)  
**다음**: [커넥션 풀과 로드 밸런싱](chapter-07-network-programming/07-18-connection-pool-load-balancing.md)에서 분산 시스템의 핵심 기술을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 인프라스트럭처
- **예상 시간**: 12-20시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-07-network-programming)

- [Chapter 7-1: 소켓 프로그래밍의 기초 개요](./07-01-socket-basics.md)
- [Chapter 7-1A: 소켓의 개념과 기본 구조](./07-02-socket-fundamentals.md)
- [Chapter 7-1B: TCP 소켓 프로그래밍](./07-10-tcp-programming.md)
- [Chapter 7-1C: UDP와 Raw 소켓 프로그래밍](./07-11-udp-raw-sockets.md)
- [Chapter 7-1D: 소켓 옵션과 Unix 도메인 소켓](./07-12-socket-options-unix.md)

### 🏷️ 관련 키워드

`zero-copy`, `NUMA`, `sendfile`, `splice`, `performance-optimization`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
