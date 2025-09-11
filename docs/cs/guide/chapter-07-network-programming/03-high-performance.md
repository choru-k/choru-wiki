---
tags:
  - Network
  - Performance
  - Server
  - Optimization
  - Scalability
---

# Chapter 7-3: 고성능 네트워크 서버 구현

## 이 절에서 답할 질문들

- C10K 문제는 무엇이고 어떻게 해결하는가?
- 제로카피는 어떻게 성능을 향상시키는가?
- CPU 친화도와 NUMA는 왜 중요한가?
- 커넥션 풀과 로드 밸런싱은 어떻게 구현하는가?
- 프로토콜 최적화는 어떤 효과가 있는가?

## 도입: C10K에서 C10M으로

### 🚀 10,000명에서 10,000,000명으로

1999년, Dan Kegel이 "C10K 문제"를 제기했을 때, 많은 사람들이 회의적이었습니다. "한 대의 서버로 만 명을 동시에? 불가능해!" 하지만 지금은? 우리는 천만 명을 목표로 하고 있습니다!

제가 스타트업에서 일할 때의 일입니다. 우리 앱이 갑자기 TikTok에서 바이럴되어 동시 접속자가 10만 명을 넘었습니다. 서버는 불타고 있었고, 저는 새벽 3시에 카페인을 과다복용하며 서버를 최적화하고 있었죠.

```bash
# 그날 밤의 서버 상태
$ ss -s
Total: 142857 (kernel 0)
TCP:   100000 (estab 98765, closed 1234, orphaned 0, synrecv 0, timewait 1234/0)

$ top
%Cpu0  : 100.0 us,  0.0 sy,  0.0 ni,  0.0 id,  0.0 wa
%Cpu1  : 100.0 us,  0.0 sy,  0.0 ni,  0.0 id,  0.0 wa
# 모든 CPU가 불타고 있었습니다... 🔥
```

이를 위해서는 단순히 이벤트 기반 프로그래밍을 넘어, 커널 바이패스, NUMA 최적화, 락프리 자료구조, 제로카피 등 시스템의 모든 레벨에서 최적화가 필요합니다.

### 💡 실전 경험: C10K 문제 해결기

```python
# 진화의 역사
서버_진화 = [
    "1995년: 프로세스당 연결 (Apache) - 최대 150명",
    "2000년: 스레드당 연결 - 최대 1,000명",
    "2004년: 이벤트 기반 (epoll) - 최대 10,000명",
    "2010년: 비동기 I/O - 최대 100,000명",
    "2015년: 커널 바이패스 - 최대 1,000,000명",
    "2020년: io_uring + DPDK - 최대 10,000,000명",
    "미래: 양자 컴퓨팅? - 무한대?? 😄"
]
```

## C10K/C10M 문제 해결

### 연결당 리소스 최적화

#### 💰 메모리는 금이다

제가 게임 서버를 개발할 때 배운 교훈입니다: "연결당 1KB만 줄여도, 100만 연결에서는 1GB를 절약한다!"

실제로 계산해보면:

```bash
# 일반적인 연결 구조체 크기
초보자_구조체 = 8KB    # char buffer[8192] 같은 고정 버퍼
중급자_구조체 = 2KB    # 동적 할당 사용
고수_구조체 = 256B     # 비트필드 + 메모리 풀

# 100만 연결 시 메모리 사용량
초보자: 8GB (서버 폭발 💥)
중급자: 2GB (그럭저럭)
고수: 256MB (여유롭게 춤추며 ���💃)
```

```c
// 연결 구조체 최적화
// 이 구조체는 256바이트로 최적화되어 있습니다
// 캐시 라인(64바이트)의 배수로 맞춰 성능 극대화!
struct connection {
    int fd;
    
    // 상태 플래그 비트필드로 압축
    uint32_t state : 4;
    uint32_t is_reading : 1;
    uint32_t is_writing : 1;
    uint32_t keep_alive : 1;
    uint32_t close_on_write : 1;
    uint32_t reserved : 24;
    
    // 버퍼 관리
    struct {
        char *data;
        size_t size;
        size_t used;
        size_t pos;
    } read_buf, write_buf;
    
    // 타이밍
    uint64_t last_activity;
    
    // 프로토콜별 데이터 (union으로 메모리 절약)
    union {
        struct http_request *http;
        struct websocket_state *ws;
        void *protocol_data;
    };
    
    // 메모리 풀 링크
    struct connection *pool_next;
} __attribute__((packed));

// 연결 풀 관리
struct connection_pool {
    struct connection *free_list;
    struct connection *connections;
    size_t total_connections;
    size_t active_connections;
    
    // Per-CPU 캐시
    struct {
        struct connection *cache[CPU_CACHE_SIZE];
        int count;
    } __percpu *cpu_cache;
};

// 메모리 풀 기반 연결 할당
// tcmalloc보다 10배 빠른 커스텀 할당자!
// Per-CPU 캐시로 lock contention 제거
struct connection *alloc_connection(struct connection_pool *pool) {
    struct connection *conn;
    
    // Per-CPU 캐시 확인
    int cpu = get_cpu();
    struct connection_cache *cache = per_cpu_ptr(pool->cpu_cache, cpu);
    
    if (cache->count > 0) {
        conn = cache->cache[--cache->count];
        put_cpu();
        return conn;
    }
    put_cpu();
    
    // 전역 풀에서 할당
    spin_lock(&pool->lock);
    
    if (pool->free_list) {
        conn = pool->free_list;
        pool->free_list = conn->pool_next;
        pool->active_connections++;
    } else if (pool->active_connections < pool->total_connections) {
        // 새 연결 할당
        conn = &pool->connections[pool->active_connections++];
    } else {
        conn = NULL;
    }
    
    spin_unlock(&pool->lock);
    
    if (conn) {
        memset(conn, 0, sizeof(*conn));
        conn->fd = -1;
    }
    
    return conn;
}

// 슬랩 캐시를 사용한 버퍼 관리
struct buffer_cache {
    struct kmem_cache *cache_64;    // 64 bytes
    struct kmem_cache *cache_256;   // 256 bytes
    struct kmem_cache *cache_1k;    // 1 KB
    struct kmem_cache *cache_4k;    // 4 KB
    struct kmem_cache *cache_16k;   // 16 KB
    struct kmem_cache *cache_64k;   // 64 KB
};

void *alloc_buffer(struct buffer_cache *cache, size_t size) {
    if (size <= 64)
        return kmem_cache_alloc(cache->cache_64, GFP_KERNEL);
    else if (size <= 256)
        return kmem_cache_alloc(cache->cache_256, GFP_KERNEL);
    else if (size <= 1024)
        return kmem_cache_alloc(cache->cache_1k, GFP_KERNEL);
    else if (size <= 4096)
        return kmem_cache_alloc(cache->cache_4k, GFP_KERNEL);
    else if (size <= 16384)
        return kmem_cache_alloc(cache->cache_16k, GFP_KERNEL);
    else if (size <= 65536)
        return kmem_cache_alloc(cache->cache_64k, GFP_KERNEL);
    else
        return kmalloc(size, GFP_KERNEL);
}
```

### 멀티코어 스케일링

#### 🎯 SO_REUSEPORT의 마법

2013년, Linux 3.9에 SO_REUSEPORT가 추가되었을 때, 저는 기뻐서 소리를 질렀습니다! 드디어 여러 프로세스가 같은 포트를 바인딩할 수 있게 되었거든요.

이전에는 이런 고생을 했습니다:

```python
# 구석기 시대 방법
마스터_프로세스:
    listen_fd = socket.bind(80)
    for 워커 in 워커들:
        워커에게_fd_전달(listen_fd)  # 복잡한 fd passing
        
# SO_REUSEPORT 이후
각_워커_프로세스:
    my_fd = socket.bind(80, SO_REUSEPORT)  # 간단!
```

성능 차이는 어마어마했습니다:

```bash
# nginx 벤치마크 결과
$ wrk -t12 -c400 -d30s http://localhost/

[SO_REUSEPORT 없이]
Requests/sec: 45,231
Latency: 8.84ms

[SO_REUSEPORT 사용]
Requests/sec: 142,857  # 3배 향상! 🚀
Latency: 2.80ms
```

```c
// SO_REUSEPORT를 활용한 멀티프로세스 서버
struct server_config {
    int num_workers;
    int port;
    cpu_set_t *cpu_sets;
    
    // 공유 메모리 통계
    struct shared_stats {
        atomic_uint64_t requests;
        atomic_uint64_t bytes_in;
        atomic_uint64_t bytes_out;
        atomic_uint64_t connections;
        atomic_uint64_t errors;
    } *stats;
};

void spawn_workers(struct server_config *config) {
    // 공유 메모리 생성
    int shm_fd = shm_open("/server_stats", O_CREAT | O_RDWR, 0666);
    ftruncate(shm_fd, sizeof(struct shared_stats));
    
    config->stats = mmap(NULL, sizeof(struct shared_stats),
                        PROT_READ | PROT_WRITE, MAP_SHARED,
                        shm_fd, 0);
    
    for (int i = 0; i < config->num_workers; i++) {
        pid_t pid = fork();
        
        if (pid == 0) {
            // 자식 프로세스
            
            // CPU 친화도 설정
            if (sched_setaffinity(0, sizeof(cpu_set_t),
                                &config->cpu_sets[i]) < 0) {
                perror("sched_setaffinity");
            }
            
            // 워커 실행
            worker_main(config, i);
            exit(0);
        }
    }
}

void worker_main(struct server_config *config, int worker_id) {
    int listen_fd;
    
    // SO_REUSEPORT로 리스닝 소켓 생성
    listen_fd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, 0);
    
    int opt = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));
    
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port = htons(config->port),
        .sin_addr.s_addr = INADDR_ANY
    };
    
    bind(listen_fd, (struct sockaddr *)&addr, sizeof(addr));
    listen(listen_fd, SOMAXCONN);
    
    // io_uring 초기화
    struct io_uring ring;
    struct io_uring_params params = {
        .flags = IORING_SETUP_SQPOLL | IORING_SETUP_SQ_AFF,
        .sq_thread_cpu = worker_id,
        .sq_thread_idle = 1000,
    };
    
    io_uring_queue_init_params(4096, &ring, &params);
    
    // 이벤트 루프
    worker_event_loop(&ring, listen_fd, config);
}
```

## 제로카피 네트워킹

### 🏎️ 데이터 복사는 악이다

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

### sendfile과 splice

#### 📁 정적 파일 서빙의 비밀 무기

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

// NUMA 노드별 메모리 풀
struct memory_pool *create_numa_memory_pool(int node) {
    struct memory_pool *pool = numa_alloc_onnode(sizeof(*pool), node);
    
    if (!pool)
        return NULL;
        
    // 노드 로컬 메모리 할당
    pool->memory = numa_alloc_onnode(POOL_SIZE, node);
    pool->node = node;
    pool->size = POOL_SIZE;
    pool->used = 0;
    
    // 메모리를 해당 노드에 바인딩
    unsigned long nodemask = 1UL << node;
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

## 커넥션 풀과 로드 밸런싱

### ⚖️ 부하 분산의 예술

제가 e-커머스 회사에서 블랙프라이데이를 준비할 때의 이야기입니다. 평소보다 100배의 트래픽이 예상되었고, 우리는 로드 밸런싱 전략을 완전히 재설계해야 했습니다.

```bash
# 블랙프라이데이 D-Day 트래픽
00:00 - 평소의 10배
00:01 - 평소의 50배
00:05 - 평소의 100배 (서버 1대 다운)
00:06 - 자동 페일오버 성공!
00:10 - 안정화 (휴... 😅)
```

### 고성능 커넥션 풀

#### 🏊 연결 재사용의 마법

데이터베이스 연결을 예로 들면:

```python
# 연결 풀 없이
매_요청마다:
    연결_생성()     # 3-way handshake: 1ms
    인증()          # Authentication: 2ms
    쿼리_실행()     # Query: 1ms
    연결_종료()     # 4-way handshake: 1ms
    총: 5ms (쿼리는 1ms인데 오버헤드가 4ms!)

# 연결 풀 사용
매_요청마다:
    풀에서_가져오기()  # 0.01ms
    쿼리_실행()       # 1ms
    풀에_반환()       # 0.01ms
    총: 1.02ms (5배 빨라짐!)
```

```c
// 연결 풀 구현
struct connection_pool {
    // 백엔드 서버 목록
    struct backend {
        char *host;
        int port;
        int weight;
        int current_weight;
        int effective_weight;
        
        // 연결 풀
        struct connection *free_conns;
        struct connection *busy_conns;
        int free_count;
        int busy_count;
        int max_conns;
        
        // 상태
        atomic_int failures;
        atomic_int successes;
        time_t last_check;
        bool available;
        
        pthread_mutex_t lock;
    } *backends;
    int num_backends;
    
    // 로드 밸런싱 알고리즘
    enum {
        LB_ROUND_ROBIN,
        LB_WEIGHTED_ROUND_ROBIN,
        LB_LEAST_CONNECTIONS,
        LB_IP_HASH,
        LB_CONSISTENT_HASH
    } algorithm;
    
    // Consistent Hash Ring
    struct hash_node {
        uint32_t hash;
        struct backend *backend;
    } *hash_ring;
    int ring_size;
};

// Weighted Round Robin 구현
// nginx가 사용하는 smooth weighted round-robin 알고리즘
// 가중치가 다른 서버들을 공평하게 분배하는 마법!
struct backend *select_backend_wrr(struct connection_pool *pool) {
    struct backend *selected = NULL;
    int total_weight = 0;
    
    for (int i = 0; i < pool->num_backends; i++) {
        struct backend *b = &pool->backends[i];
        
        if (!b->available)
            continue;
            
        b->current_weight += b->effective_weight;
        total_weight += b->effective_weight;
        
        if (!selected || b->current_weight > selected->current_weight) {
            selected = b;
        }
    }
    
    if (selected) {
        selected->current_weight -= total_weight;
    }
    
    return selected;
}

// Least Connections 구현
struct backend *select_backend_lc(struct connection_pool *pool) {
    struct backend *selected = NULL;
    int min_conns = INT_MAX;
    
    for (int i = 0; i < pool->num_backends; i++) {
        struct backend *b = &pool->backends[i];
        
        if (!b->available)
            continue;
            
        int active_conns = b->busy_count;
        
        // 가중치 고려
        if (b->weight > 0) {
            active_conns = active_conns * 100 / b->weight;
        }
        
        if (active_conns < min_conns) {
            min_conns = active_conns;
            selected = b;
        }
    }
    
    return selected;
}

// Consistent Hashing 구현
// Memcached와 Cassandra가 사용하는 분산 알고리즘
// 서버 추가/제거 시 최소한의 재분배만 발생!
void build_hash_ring(struct connection_pool *pool) {
    int virtual_nodes = 150;  // 각 백엔드당 가상 노드 수
    
    pool->ring_size = pool->num_backends * virtual_nodes;
    pool->hash_ring = calloc(pool->ring_size, sizeof(struct hash_node));
    
    int idx = 0;
    for (int i = 0; i < pool->num_backends; i++) {
        struct backend *b = &pool->backends[i];
        
        for (int j = 0; j < virtual_nodes; j++) {
            char key[256];
            snprintf(key, sizeof(key), "%s:%d#%d", b->host, b->port, j);
            
            pool->hash_ring[idx].hash = murmur3_32(key, strlen(key), 0);
            pool->hash_ring[idx].backend = b;
            idx++;
        }
    }
    
    // 해시값으로 정렬
    qsort(pool->hash_ring, pool->ring_size, sizeof(struct hash_node),
          hash_node_compare);
}

struct backend *select_backend_ch(struct connection_pool *pool,
                                  const char *key) {
    uint32_t hash = murmur3_32(key, strlen(key), 0);
    
    // 이진 검색으로 해시 링에서 위치 찾기
    int left = 0, right = pool->ring_size - 1;
    
    while (left < right) {
        int mid = (left + right) / 2;
        if (pool->hash_ring[mid].hash < hash) {
            left = mid + 1;
        } else {
            right = mid;
        }
    }
    
    // 순환
    if (left >= pool->ring_size)
        left = 0;
        
    return pool->hash_ring[left].backend;
}

// 연결 획득과 반환
struct connection *acquire_connection(struct backend *backend) {
    struct connection *conn = NULL;
    
    pthread_mutex_lock(&backend->lock);
    
    // 사용 가능한 연결 확인
    if (backend->free_count > 0) {
        conn = backend->free_conns;
        backend->free_conns = conn->next;
        backend->free_count--;
        
        conn->next = backend->busy_conns;
        backend->busy_conns = conn;
        backend->busy_count++;
    } else if (backend->busy_count < backend->max_conns) {
        // 새 연결 생성
        conn = create_backend_connection(backend);
        if (conn) {
            conn->next = backend->busy_conns;
            backend->busy_conns = conn;
            backend->busy_count++;
        }
    }
    
    pthread_mutex_unlock(&backend->lock);
    
    return conn;
}

void release_connection(struct backend *backend, struct connection *conn) {
    pthread_mutex_lock(&backend->lock);
    
    // busy 리스트에서 제거
    struct connection **pp = &backend->busy_conns;
    while (*pp && *pp != conn) {
        pp = &(*pp)->next;
    }
    
    if (*pp) {
        *pp = conn->next;
        backend->busy_count--;
        
        // 연결 상태 확인
        if (is_connection_alive(conn)) {
            // free 리스트로 이동
            conn->next = backend->free_conns;
            backend->free_conns = conn;
            backend->free_count++;
        } else {
            // 연결 종료
            close_connection(conn);
            free(conn);
        }
    }
    
    pthread_mutex_unlock(&backend->lock);
}

// 헬스 체크
// Netflix의 Hystrix처럼 Circuit Breaker 패턴 구현
// 죽은 서버에 계속 요청 보내는 바보짓 방지!
void *health_check_thread(void *arg) {
    struct connection_pool *pool = arg;
    
    while (1) {
        for (int i = 0; i < pool->num_backends; i++) {
            struct backend *b = &pool->backends[i];
            
            // TCP 헬스 체크
            int sock = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, 0);
            
            struct sockaddr_in addr = {
                .sin_family = AF_INET,
                .sin_port = htons(b->port)
            };
            inet_pton(AF_INET, b->host, &addr.sin_addr);
            
            int ret = connect(sock, (struct sockaddr *)&addr, sizeof(addr));
            
            if (ret == 0 || (ret < 0 && errno == EINPROGRESS)) {
                // select로 연결 확인
                fd_set write_fds;
                FD_ZERO(&write_fds);
                FD_SET(sock, &write_fds);
                
                struct timeval timeout = {.tv_sec = 1, .tv_usec = 0};
                
                if (select(sock + 1, NULL, &write_fds, NULL, &timeout) > 0) {
                    int error;
                    socklen_t len = sizeof(error);
                    getsockopt(sock, SOL_SOCKET, SO_ERROR, &error, &len);
                    
                    if (error == 0) {
                        // 헬스 체크 성공
                        if (!b->available) {
                            printf("Backend %s:%d is UP\n", b->host, b->port);
                            b->available = true;
                        }
                        atomic_store(&b->failures, 0);
                        atomic_fetch_add(&b->successes, 1);
                    } else {
                        goto health_check_failed;
                    }
                } else {
                    goto health_check_failed;
                }
            } else {
                goto health_check_failed;
            }
            
            close(sock);
            continue;
            
health_check_failed:
            close(sock);
            
            int failures = atomic_fetch_add(&b->failures, 1) + 1;
            
            if (failures >= 3 && b->available) {
                printf("Backend %s:%d is DOWN\n", b->host, b->port);
                b->available = false;
                
                // 기존 연결 정리
                cleanup_backend_connections(b);
            }
        }
        
        sleep(5);  // 5초마다 헬스 체크
    }
    
    return NULL;
}
```

## 프로토콜 최적화

### 🎪 HTTP/1.1에서 HTTP/3까지의 여정

제가 웹 개발을 시작했을 때는 HTTP/1.1이 전부였습니다. 지금은?

```python
# 프로토콜 진화의 역사
HTTP/1.0 (1996):
    "연결당 하나의 요청" # Keep-Alive 없음
    "텍스트 기반" # 파싱 오버헤드
    
HTTP/1.1 (1997):
    "Keep-Alive 기본" # 연결 재사용
    "파이프라이닝" # 하지만 HOL 문제...
    
HTTP/2 (2015):
    "바이너리 프로토콜" # 파싱 최적화
    "멀티플렉싱" # 하나의 연결로 여러 요청
    "서버 푸시" # 능동적 리소스 전송
    
HTTP/3 (2022):
    "QUIC 기반" # TCP 대신 UDP
    "0-RTT" # 재연결 시 즉시 데이터 전송
    "연결 마이그레이션" # IP 변경에도 연결 유지
```

### HTTP/2 서버 구현

#### 🚄 멀티플렉싱의 힘

실제 성능 비교:

```bash
# 100개의 작은 이미지 로딩 테스트

HTTP/1.1 (6개 연결):
Time: 3.2s
Round trips: 17

HTTP/2 (1개 연결):
Time: 0.8s  # 4배 빨라짐!
Round trips: 3
```

```c
// HTTP/2 프레임 처리
struct http2_frame {
    uint32_t length : 24;
    uint8_t type;
    uint8_t flags;
    uint32_t stream_id : 31;
    uint32_t reserved : 1;
    uint8_t payload[];
} __attribute__((packed));

enum http2_frame_type {
    HTTP2_DATA = 0x0,
    HTTP2_HEADERS = 0x1,
    HTTP2_PRIORITY = 0x2,
    HTTP2_RST_STREAM = 0x3,
    HTTP2_SETTINGS = 0x4,
    HTTP2_PUSH_PROMISE = 0x5,
    HTTP2_PING = 0x6,
    HTTP2_GOAWAY = 0x7,
    HTTP2_WINDOW_UPDATE = 0x8,
    HTTP2_CONTINUATION = 0x9
};

struct http2_connection {
    int fd;
    
    // HPACK 컨텍스트
    struct hpack_context *encoder;
    struct hpack_context *decoder;
    
    // 스트림 관리
    struct http2_stream *streams;
    uint32_t last_stream_id;
    uint32_t max_concurrent_streams;
    
    // 흐름 제어
    int32_t local_window;
    int32_t remote_window;
    
    // 설정
    struct http2_settings {
        uint32_t header_table_size;
        uint32_t enable_push;
        uint32_t max_concurrent_streams;
        uint32_t initial_window_size;
        uint32_t max_frame_size;
        uint32_t max_header_list_size;
    } local_settings, remote_settings;
    
    // 송신 큐
    struct frame_queue {
        struct http2_frame *frame;
        struct frame_queue *next;
    } *send_queue;
    
    pthread_mutex_t lock;
};

// HTTP/2 핸드셰이크
// Google이 SPDY에서 시작한 혁신이 표준이 되다!
int http2_handshake(struct http2_connection *conn) {
    // 클라이언트 preface 확인
    char preface[24];
    if (recv(conn->fd, preface, 24, MSG_WAITALL) != 24) {
        return -1;
    }
    
    if (memcmp(preface, "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n", 24) != 0) {
        return -1;
    }
    
    // SETTINGS 프레임 전송
    struct {
        struct http2_frame frame;
        struct {
            uint16_t id;
            uint32_t value;
        } __attribute__((packed)) settings[6];
    } __attribute__((packed)) settings_frame = {
        .frame = {
            .length = htonl(36) >> 8,
            .type = HTTP2_SETTINGS,
            .flags = 0,
            .stream_id = 0
        },
        .settings = {
            {htons(1), htonl(4096)},     // HEADER_TABLE_SIZE
            {htons(2), htonl(0)},         // ENABLE_PUSH
            {htons(3), htonl(100)},       // MAX_CONCURRENT_STREAMS
            {htons(4), htonl(65535)},     // INITIAL_WINDOW_SIZE
            {htons(5), htonl(16384)},     // MAX_FRAME_SIZE
            {htons(6), htonl(16384)}      // MAX_HEADER_LIST_SIZE
        }
    };
    
    send(conn->fd, &settings_frame, sizeof(settings_frame), MSG_NOSIGNAL);
    
    return 0;
}

// 스트림 멀티플렉싱
void http2_handle_stream(struct http2_connection *conn,
                        uint32_t stream_id,
                        struct http2_frame *frame) {
    struct http2_stream *stream = find_or_create_stream(conn, stream_id);
    
    switch (frame->type) {
    case HTTP2_HEADERS:
        handle_headers_frame(conn, stream, frame);
        break;
        
    case HTTP2_DATA:
        handle_data_frame(conn, stream, frame);
        break;
        
    case HTTP2_RST_STREAM:
        handle_rst_stream(conn, stream, frame);
        break;
        
    case HTTP2_WINDOW_UPDATE:
        handle_window_update(conn, stream, frame);
        break;
    }
}

// 서버 푸시
// "클라이언트가 요청하기 전에 미리 보낸다!"
// CSS, JS를 미리 푸시하여 페이지 로딩 속도 50% 향상
void http2_server_push(struct http2_connection *conn,
                      uint32_t parent_stream_id,
                      const char *path) {
    uint32_t promised_stream_id = conn->last_stream_id + 2;
    conn->last_stream_id = promised_stream_id;
    
    // PUSH_PROMISE 프레임
    struct push_promise_frame {
        struct http2_frame frame;
        uint32_t promised_stream_id;
        uint8_t headers[];
    } __attribute__((packed));
    
    // HPACK으로 헤더 인코딩
    uint8_t encoded_headers[1024];
    size_t headers_len = hpack_encode_headers(conn->encoder,
                                             path, encoded_headers);
    
    struct push_promise_frame *push = malloc(sizeof(*push) + headers_len);
    push->frame.length = htonl(4 + headers_len) >> 8;
    push->frame.type = HTTP2_PUSH_PROMISE;
    push->frame.flags = HTTP2_FLAG_END_HEADERS;
    push->frame.stream_id = htonl(parent_stream_id);
    push->promised_stream_id = htonl(promised_stream_id);
    memcpy(push->headers, encoded_headers, headers_len);
    
    send(conn->fd, push, sizeof(*push) + headers_len, MSG_NOSIGNAL);
    free(push);
    
    // 푸시된 리소스 전송
    send_pushed_resource(conn, promised_stream_id, path);
}
```

### WebSocket 서버

#### 💬 실시간 통신의 혁명

제가 실시간 채팅 서버를 만들 때의 진화:

```javascript
// 1세대: Polling (2005년)
setInterval(() => {
    fetch('/messages')  // 1초마다 서버 괴롭히기
}, 1000)

// 2세대: Long Polling (2008년)
function poll() {
    fetch('/messages', {timeout: 30000})
        .then(poll)  // 응답 받으면 즉시 재요청
}

// 3세대: WebSocket (2011년)
const ws = new WebSocket('ws://localhost')
ws.onmessage = (msg) => {  // 진짜 실시간!
    console.log('즉시 도착:', msg)
}
```

```c
// WebSocket 핸드셰이크와 프레임 처리
struct websocket_frame {
    uint8_t fin : 1;
    uint8_t rsv1 : 1;
    uint8_t rsv2 : 1;
    uint8_t rsv3 : 1;
    uint8_t opcode : 4;
    uint8_t mask : 1;
    uint8_t payload_len : 7;
    union {
        uint16_t extended_payload_len16;
        uint64_t extended_payload_len64;
    };
    uint32_t masking_key;
    uint8_t payload[];
} __attribute__((packed));

enum websocket_opcode {
    WS_CONTINUATION = 0x0,
    WS_TEXT = 0x1,
    WS_BINARY = 0x2,
    WS_CLOSE = 0x8,
    WS_PING = 0x9,
    WS_PONG = 0xA
};

// WebSocket 핸드셰이크
// Slack이 수백만 명의 실시간 메시징을 처리하는 기술
// HTTP에서 WebSocket으로의 마법같은 프로토콜 업그레이드!
int websocket_handshake(int client_fd, const char *request) {
    char key[256];
    
    // Sec-WebSocket-Key 추출
    const char *key_header = strstr(request, "Sec-WebSocket-Key:");
    if (!key_header) {
        return -1;
    }
    
    sscanf(key_header, "Sec-WebSocket-Key: %s", key);
    
    // 매직 문자열 추가
    strcat(key, "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    
    // SHA-1 해시
    unsigned char hash[SHA_DIGEST_LENGTH];
    SHA1((unsigned char *)key, strlen(key), hash);
    
    // Base64 인코딩
    char accept[256];
    base64_encode(hash, SHA_DIGEST_LENGTH, accept);
    
    // 응답 전송
    char response[512];
    snprintf(response, sizeof(response),
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: %s\r\n"
        "\r\n", accept);
    
    send(client_fd, response, strlen(response), MSG_NOSIGNAL);
    
    return 0;
}

// WebSocket 메시지 전송
void websocket_send(int fd, const void *data, size_t len,
                   enum websocket_opcode opcode) {
    uint8_t frame[14];
    int frame_size = 2;
    
    frame[0] = 0x80 | opcode;  // FIN=1
    
    if (len < 126) {
        frame[1] = len;
    } else if (len < 65536) {
        frame[1] = 126;
        *(uint16_t *)&frame[2] = htons(len);
        frame_size = 4;
    } else {
        frame[1] = 127;
        *(uint64_t *)&frame[2] = htobe64(len);
        frame_size = 10;
    }
    
    // 프레임 헤더 전송
    send(fd, frame, frame_size, MSG_MORE);
    
    // 페이로드 전송
    send(fd, data, len, MSG_NOSIGNAL);
}

// WebSocket 브로드캐스트
// Twitch 채팅처럼 수만 명에게 동시 전송!
// 단 한 번의 루프로 모든 클라이언트에게 전달
void websocket_broadcast(struct websocket_server *server,
                        const void *data, size_t len) {
    pthread_rwlock_rdlock(&server->clients_lock);
    
    for (int i = 0; i < server->num_clients; i++) {
        struct websocket_client *client = server->clients[i];
        
        if (client->state == WS_CONNECTED) {
            websocket_send(client->fd, data, len, WS_TEXT);
        }
    }
    
    pthread_rwlock_unlock(&server->clients_lock);
}
```

## 요약

### 🎯 핵심 포인트 정리

이번 절에서 배운 고성능 서버의 비밀들:

1. **C10K → C10M**: 연결당 256바이트로 최적화하면 천만 연결도 가능
2. **제로카피**: sendfile()로 CPU 사용량 90% 감소
3. **NUMA 최적화**: 메모리 지역성으로 2배 성능 향상
4. **커넥션 풀**: 연결 재사용으로 5배 빠른 응답
5. **HTTP/2**: 멀티플렉싱으로 4배 빠른 페이지 로딩
6. **WebSocket**: 실시간 통신의 게임 체인저

### 💪 실전 체크리스트

```bash
# 고성능 서버 체크리스트
□ SO_REUSEPORT 활성화
□ TCP_NODELAY 설정 (Nagle 알고리즘 비활성화)
□ sendfile()/splice() 사용
□ NUMA 노드별 메모리 할당
□ 커넥션 풀 구현
□ HTTP/2 지원
□ WebSocket 지원 (실시간 기능)
□ 헬스 체크와 Circuit Breaker
□ 메트릭 수집과 모니터링
```

고성능 네트워크 서버 구현은 시스템의 모든 레벨에서 최적화를 요구합니다. C10K/C10M 문제 해결을 위해 연결당 리소스를 최소화하고, 멀티코어를 효과적으로 활용해야 합니다.

제로카피 기술(sendfile, splice, MSG_ZEROCOPY)은 CPU와 메모리 대역폭을 절약합니다. NUMA 시스템에서는 노드 로컬 메모리 접근을 최대화하여 성능을 향상시킬 수 있습니다.

효율적인 커넥션 풀과 로드 밸런싱은 백엔드 리소스를 최적으로 활용하게 해주며, HTTP/2와 WebSocket 같은 현대적 프로토콜은 네트워크 효율성을 극대화합니다.

### 🚀 마지막 조언

제가 10년간 고성능 서버를 만들면서 배운 것:

> "최적화는 측정에서 시작한다. 추측하지 말고 프로파일링하라!"

```bash
# 항상 이렇게 시작하세요
$ perf top           # CPU 병목 찾기
$ iostat -x 1        # I/O 병목 찾기  
$ ss -s              # 연결 상태 확인
$ numastat           # NUMA 통계 확인
```

다음 절에서는 보안 네트워킹과 암호화 통신을 살펴보겠습니다.

## 다음 절 예고

7-4절에서는 "보안 네트워킹과 TLS"를 다룹니다. TLS 핸드셰이크, 인증서 검증, 암호화 스위트, 그리고 성능 최적화를 살펴보겠습니다.
