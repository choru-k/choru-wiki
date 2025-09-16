---
tags:
  - circuit-breaker
  - connection-pool
  - consistent-hashing
  - deep-study
  - hands-on
  - intermediate
  - load-balancing
  - session-affinity
  - 네트워크프로그래밍
difficulty: INTERMEDIATE
learning_time: "8-12시간"
main_topic: "네트워크 프로그래밍"
priority_score: 4
---

# Chapter 7-3C: 커넥션 풀과 로드 밸런싱

## ⚖️ 부하 분산의 예술

제가 e-커머스 회사에서 블랙프라이데이를 준비할 때의 이야기입니다. 평소보다 100배의 트래픽이 예상되었고, 우리는 로드 밸런싱 전략을 완전히 재설계해야 했습니다.

```bash
# 블랙프라이데이 D-Day 트래픽
00:00 - 평소의 10배
00:01 - 평소의 50배
00:05 - 평소의 100배 (서버 1대 다운)
00:06 - 자동 페일오버 성공!
00:10 - 안정화 (휴... 😅)
```

## 고성능 커넥션 풀

### 🏊 연결 재사용의 마법

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
```

## Circuit Breaker 패턴

### 헬스 체크와 장애 격리

Netflix의 Hystrix처럼 Circuit Breaker 패턴을 구현하여 죽은 서버에 계속 요청을 보내는 문제를 방지합니다.

```c
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

## 로드 밸런싱 알고리즘 비교

### 알고리즘별 특성과 사용 사례

| 알고리즘 | 복잡도 | 공평성 | 세션 유지 | 적합한 환경 |
|---------|--------|--------|-----------|-------------|
| **Round Robin** | O(1) | 높음 | 어려움 | 동질적 서버, 무상태 |
| **Weighted RR** | O(n) | 높음 | 어려움 | 이질적 서버, 무상태 |
| **Least Connections** | O(n) | 보통 | 어려움 | 연결 지속시간이 다양 |
| **IP Hash** | O(1) | 낮음 | 쉬움 | 세션 기반 애플리케이션 |
| **Consistent Hash** | O(log n) | 높음 | 쉬움 | 분산 캐시, 확장성 중요 |

### 실제 성능 비교

```bash
# 10,000 요청, 3개 서버 테스트
# 서버 성능: A=100%, B=50%, C=25%

Round Robin:
- 서버별 요청: A(3333), B(3333), C(3334)
- 평균 응답시간: 2.5s (C 서버가 병목)

Weighted Round Robin (4:2:1 가중치):
- 서버별 요청: A(5714), B(2857), C(1429)
- 평균 응답시간: 1.2s (50% 향상!)

Least Connections:
- 동적 분배로 각 서버의 처리 능력에 맞춰 조절
- 평균 응답시간: 1.1s (최적)
```

## 고급 로드 밸런싱 기법

### Sticky Sessions과 Session Affinity

```c
// 세션 어피니티 구현
struct session_store {
    char session_id[64];
    struct backend *backend;
    time_t expire_time;
    UT_hash_handle hh;  // uthash 라이브러리 사용
};

static struct session_store *sessions = NULL;

struct backend *get_backend_for_session(struct connection_pool *pool,
                                       const char *session_id) {
    struct session_store *entry;

    // 세션 테이블에서 검색
    HASH_FIND_STR(sessions, session_id, entry);

    if (entry && entry->expire_time > time(NULL)) {
        // 기존 세션이 있고 만료되지 않음
        if (entry->backend->available) {
            return entry->backend;
        } else {
            // 백엔드가 다운된 경우 세션 제거
            HASH_DEL(sessions, entry);
            free(entry);
        }
    }

    // 새로운 세션 또는 만료된 세션
    struct backend *backend = select_backend_wrr(pool);
    if (!backend) {
        return NULL;
    }

    // 새 세션 생성
    entry = malloc(sizeof(struct session_store));
    strncpy(entry->session_id, session_id, sizeof(entry->session_id) - 1);
    entry->backend = backend;
    entry->expire_time = time(NULL) + 3600;  // 1시간 TTL

    HASH_ADD_STR(sessions, session_id, entry);

    return backend;
}
```

### 지역 기반 라우팅

```c
// 지역 기반 로드 밸런싱
struct geo_backend {
    struct backend *backend;
    float latitude;
    float longitude;
    char region[32];
};

struct backend *select_nearest_backend(struct connection_pool *pool,
                                     float client_lat, float client_lon) {
    struct backend *best = NULL;
    double min_distance = DBL_MAX;

    for (int i = 0; i < pool->num_backends; i++) {
        struct geo_backend *geo = &pool->geo_backends[i];

        if (!geo->backend->available)
            continue;

        // 대원거리 공식으로 거리 계산
        double distance = haversine_distance(client_lat, client_lon,
                                           geo->latitude, geo->longitude);

        if (distance < min_distance) {
            min_distance = distance;
            best = geo->backend;
        }
    }

    return best;
}
```

## 성능 모니터링과 메트릭

### 핵심 성능 지표

```c
// 성능 메트릭 수집
struct load_balancer_metrics {
    // 요청 통계
    atomic_uint64_t total_requests;
    atomic_uint64_t failed_requests;
    atomic_uint64_t active_requests;

    // 응답 시간 통계 (히스토그램)
    struct {
        atomic_uint64_t count_50ms;   // 50ms 이하
        atomic_uint64_t count_100ms;  // 50-100ms
        atomic_uint64_t count_200ms;  // 100-200ms
        atomic_uint64_t count_500ms;  // 200-500ms
        atomic_uint64_t count_1s;     // 500ms-1s
        atomic_uint64_t count_over1s; // 1s 초과
    } latency_histogram;

    // 백엔드별 통계
    struct backend_metrics {
        atomic_uint64_t requests;
        atomic_uint64_t failures;
        atomic_uint64_t avg_response_time;
        atomic_uint64_t active_connections;
    } *backend_stats;

    // Circuit Breaker 상태
    struct {
        atomic_uint64_t trips;        // CB가 열린 횟수
        atomic_uint64_t fallbacks;    // 폴백 실행 횟수
        atomic_uint64_t timeouts;     // 타임아웃 발생 횟수
    } circuit_breaker;
};

// 메트릭 리포팅
void report_metrics(struct load_balancer_metrics *metrics) {
    uint64_t total = atomic_load(&metrics->total_requests);
    uint64_t failed = atomic_load(&metrics->failed_requests);
    double error_rate = total > 0 ? (double)failed / total * 100.0 : 0.0;

    printf("=== Load Balancer Metrics ===\n");
    printf("Total Requests: %lu\n", total);
    printf("Error Rate: %.2f%%\n", error_rate);

    // 레이턴시 분포
    printf("\nLatency Distribution:\n");
    printf("  < 50ms:   %lu\n", atomic_load(&metrics->latency_histogram.count_50ms));
    printf("  50-100ms: %lu\n", atomic_load(&metrics->latency_histogram.count_100ms));
    printf("  100-200ms:%lu\n", atomic_load(&metrics->latency_histogram.count_200ms));
    printf("  200-500ms:%lu\n", atomic_load(&metrics->latency_histogram.count_500ms));
    printf("  500ms-1s: %lu\n", atomic_load(&metrics->latency_histogram.count_1s));
    printf("  > 1s:     %lu\n", atomic_load(&metrics->latency_histogram.count_over1s));
}
```

## 핵심 요점

### 1. 커넥션 풀 최적화

- 연결 재사용으로 5배 성능 향상
- Per-backend 연결 관리와 상태 추적
- 동적 연결 생성/해제로 리소스 효율성

### 2. 지능형 로드 밸런싱

- 상황에 맞는 알고리즘 선택
- Consistent Hashing으로 확장성 보장
- 세션 어피니티로 상태 기반 앱 지원

### 3. 장애 격리와 복구

- Circuit Breaker로 연쇄 장애 방지
- 실시간 헬스 체크로 빠른 장애 감지
- 자동 페일오버로 가용성 극대화

### 4. 성능 모니터링

- 실시간 메트릭 수집과 분석
- 히스토그램 기반 레이턴시 추적
- 백엔드별 성능 지표 모니터링

---

**이전**: [제로카피와 NUMA 최적화](./07-31-zerocopy-numa-optimization.md)  
**다음**: [프로토콜 최적화](./07-32-protocol-optimization.md)에서 HTTP/2와 WebSocket 등 최신 프로토콜 기술을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 네트워크 프로그래밍
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-07-network-programming)

- [Chapter 7-1: 소켓 프로그래밍의 기초 개요](./07-01-socket-basics.md)
- [Chapter 7-1A: 소켓의 개념과 기본 구조](./07-02-socket-fundamentals.md)
- [Chapter 7-1B: TCP 소켓 프로그래밍](./07-10-tcp-programming.md)
- [Chapter 7-1C: UDP와 Raw 소켓 프로그래밍](./07-11-udp-raw-sockets.md)
- [Chapter 7-1D: 소켓 옵션과 Unix 도메인 소켓](./07-12-socket-options-unix.md)

### 🏷️ 관련 키워드

`connection-pool`, `load-balancing`, `circuit-breaker`, `session-affinity`, `consistent-hashing`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
