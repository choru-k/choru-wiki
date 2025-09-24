---
tags:
  - 0-rtt
  - advanced
  - anti-replay
  - deep-study
  - early-data
  - hands-on
  - session-resumption
  - tls-optimization
  - 인프라스트럭처
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "인프라스트럭처"
priority_score: 5
---

# 7.4.8: TLS 성능 튜닝

## 🚀 TLS를 빠르게 만드는 비법들

제가 CDN 회사에서 일할 때, TLS 최적화로 응답 시간을 40% 줄인 경험:

```bash
# TLS 최적화 전후 비교

[최적화 전]
- 핸드셰이크: 200ms
- 세션 재사용: 0%
- CPU 사용률: 60%

[최적화 후]
- 핸드셰이크: 50ms (Session Resumption)
- 세션 재사용: 80%
- CPU 사용률: 30% (AES-NI 활용)
- 0-RTT: 10% 트래픽에서 활용
```

## 1. Session Resumption

### 1.1 세션 티켓: TLS의 패스트트랙

#### 🎫 세션 티켓: TLS의 패스트트랙

Session Resumption은 마치 놀이공원의 패스트트랙과 같습니다. 한 번 티켓을 발급받으면 다시 줄을 서지 않아도 됩니다!

```python
# Session Resumption 효과

처번째 연결:
    풀 핸드셰이크 (100ms)
    인증서 검증 (20ms)
    키 교환 (30ms)
    총: 150ms
    
두 번째 연결 (Session Ticket 사용):
    티켓 제시 (5ms)
    키 협상 (10ms)
    총: 15ms (10배 빨라짐!)
```

```c
// 세션 캐시
typedef struct {
    pthread_rwlock_t lock;
    GHashTable* sessions;  // session_id -> SSL_SESSION
    GHashTable* tickets;   // ticket -> SSL_SESSION
    size_t max_entries;
    time_t default_timeout;
} SessionCache;

// 세션 캐시 생성
SessionCache* session_cache_new(size_t max_entries) {
    SessionCache* cache = calloc(1, sizeof(SessionCache));
    
    pthread_rwlock_init(&cache->lock, NULL);
    cache->sessions = g_hash_table_new_full(g_str_hash, g_str_equal, 
                                            free, (GDestroyNotify)SSL_SESSION_free);
    cache->tickets = g_hash_table_new_full(g_str_hash, g_str_equal,
                                           free, (GDestroyNotify)SSL_SESSION_free);
    cache->max_entries = max_entries;
    cache->default_timeout = 7200;  // 2시간
    
    return cache;
}

// 세션 저장 콜백
static int session_new_callback(SSL* ssl, SSL_SESSION* session) {
    SessionCache* cache = SSL_get_ex_data(ssl, 0);
    if (!cache) return 0;
    
    unsigned char* session_id = SSL_SESSION_get_id(session, NULL);
    char id_hex[65];
    
    // Session ID를 16진수 문자열로 변환
    for (int i = 0; i < 32; i++) {
        sprintf(&id_hex[i*2], "%02x", session_id[i]);
    }
    
    pthread_rwlock_wrlock(&cache->lock);
    
    // 캐시 크기 제한
    if (g_hash_table_size(cache->sessions) >= cache->max_entries) {
        // LRU 제거 (간단한 구현)
        GHashTableIter iter;
        gpointer key, value;
        g_hash_table_iter_init(&iter, cache->sessions);
        if (g_hash_table_iter_next(&iter, &key, &value)) {
            g_hash_table_iter_remove(&iter);
        }
    }
    
    // 세션 저장
    SSL_SESSION_up_ref(session);
    g_hash_table_insert(cache->sessions, strdup(id_hex), session);
    
    pthread_rwlock_unlock(&cache->lock);
    
    return 1;
}

// 세션 조회 콜백
static SSL_SESSION* session_get_callback(SSL* ssl, 
                                         const unsigned char* session_id,
                                         int len, int* copy) {
    SessionCache* cache = SSL_get_ex_data(ssl, 0);
    if (!cache) return NULL;
    
    char id_hex[65];
    for (int i = 0; i < len && i < 32; i++) {
        sprintf(&id_hex[i*2], "%02x", session_id[i]);
    }
    id_hex[len*2] = '\0';
    
    pthread_rwlock_rdlock(&cache->lock);
    SSL_SESSION* session = g_hash_table_lookup(cache->sessions, id_hex);
    if (session) {
        SSL_SESSION_up_ref(session);
    }
    pthread_rwlock_unlock(&cache->lock);
    
    *copy = 0;  // 참조 카운트 사용
    return session;
}
```

### 1.2 TLS 1.3 Session Tickets

```c
// TLS 1.3 Session Ticket 처리
typedef struct {
    unsigned char ticket_key[32];
    unsigned char ticket_iv[16];
    time_t created;
    time_t expires;
    SSL_SESSION* session;
} SessionTicket;

// Session Ticket 생성 콜백
static int generate_session_ticket_cb(SSL* ssl, void* arg) {
    SessionCache* cache = (SessionCache*)arg;
    SSL_SESSION* session = SSL_get_session(ssl);
    
    if (!session) return 0;
    
    // 티켓 키 생성
    unsigned char ticket_key[32];
    RAND_bytes(ticket_key, sizeof(ticket_key));
    
    // 티켓 데이터 암호화
    unsigned char* session_data;
    int session_len = i2d_SSL_SESSION(session, &session_data);
    
    // AES-GCM으로 세션 데이터 암호화
    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    unsigned char iv[12], tag[16];
    unsigned char* encrypted_ticket = malloc(session_len + 16);
    
    RAND_bytes(iv, sizeof(iv));
    
    EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), NULL, NULL, NULL);
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, sizeof(iv), NULL);
    EVP_EncryptInit_ex(ctx, NULL, NULL, ticket_key, iv);
    
    int len, encrypted_len;
    EVP_EncryptUpdate(ctx, encrypted_ticket, &len, session_data, session_len);
    encrypted_len = len;
    EVP_EncryptFinal_ex(ctx, encrypted_ticket + len, &len);
    encrypted_len += len;
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, sizeof(tag), tag);
    
    // 티켓 저장
    char ticket_hex[129];  // 32*2 + 16*2 + 12*2 + 16*2 + 1
    sprintf(ticket_hex, "%s", "...");  // Base64 인코딩
    
    pthread_rwlock_wrlock(&cache->lock);
    SessionTicket* ticket = malloc(sizeof(SessionTicket));
    memcpy(ticket->ticket_key, ticket_key, sizeof(ticket_key));
    memcpy(ticket->ticket_iv, iv, sizeof(iv));
    ticket->created = time(NULL);
    ticket->expires = ticket->created + 7200;  // 2시간
    ticket->session = session;
    SSL_SESSION_up_ref(session);
    
    g_hash_table_insert(cache->tickets, strdup(ticket_hex), ticket);
    pthread_rwlock_unlock(&cache->lock);
    
    // 티켓 전송
    SSL_set_session_id(ssl, (unsigned char*)ticket_hex, strlen(ticket_hex));
    
    EVP_CIPHER_CTX_free(ctx);
    OPENSSL_free(session_data);
    free(encrypted_ticket);
    
    return 1;
}
```

## 2. TLS 1.3 0-RTT (Early Data)

### 2.1 즉시 데이터 전송

#### ⚡ 0-RTT: 즉시 데이터 전송

TLS 1.3의 0-RTT는 CloudFlare가 API 요청에 사용하는 기술입니다. 주의: Replay 공격 가능성 때문에 GET 요청에만 사용!

```c
// TLS 1.3 0-RTT (Early Data)
int enable_early_data(SSL_CTX* ctx) {
    // Early Data 크기 설정 (최대 16KB)
    SSL_CTX_set_max_early_data(ctx, 16384);
    
    // Early Data 콜백
    SSL_CTX_set_early_data_enabled(ctx, 1);
    
    // Anti-replay 설정
    SSL_CTX_set_recv_max_early_data(ctx, 16384);
    
    return 0;
}

// Early Data 전송
int send_early_data(SSL* ssl, const void* data, size_t len) {
    size_t written;
    
    int ret = SSL_write_early_data(ssl, data, len, &written);
    if (ret <= 0) {
        int err = SSL_get_error(ssl, ret);
        if (err == SSL_ERROR_WANT_WRITE || err == SSL_ERROR_WANT_READ) {
            return 0;  // 재시도 필요
        }
        return -1;
    }
    
    return written;
}

// Early Data 수신
int receive_early_data(SSL* ssl, void* buf, size_t buf_len) {
    size_t read_bytes;
    
    int ret = SSL_read_early_data(ssl, buf, buf_len, &read_bytes);
    
    switch (ret) {
        case SSL_READ_EARLY_DATA_SUCCESS:
            return read_bytes;
            
        case SSL_READ_EARLY_DATA_ERROR:
            return -1;
            
        case SSL_READ_EARLY_DATA_FINISH:
            // Early Data 완료, 일반 핸드셰이크 계속
            return 0;
    }
    
    return -1;
}

// Early Data 안전 검사
int is_safe_for_early_data(const char* request) {
    // GET 요청만 허용
    if (strncmp(request, "GET ", 4) != 0) {
        return 0;
    }
    
    // 인증 정보가 있는지 확인
    if (strstr(request, "Authorization:") != NULL) {
        return 0;  // 인증 요청은 안전하지 않을 수 있음
    }
    
    // 상태 변경 파라미터 확인
    if (strstr(request, "action=") != NULL || 
        strstr(request, "delete=") != NULL ||
        strstr(request, "update=") != NULL) {
        return 0;
    }
    
    return 1;  // 안전
}
```

### 2.2 Anti-Replay 보호

```c
// Replay 공격 방지
typedef struct {
    GHashTable* seen_requests;  // request_hash -> timestamp
    pthread_mutex_t lock;
    time_t window_seconds;
} AntiReplayCache;

// Anti-replay 캐시 초기화
AntiReplayCache* anti_replay_init(time_t window_seconds) {
    AntiReplayCache* cache = calloc(1, sizeof(AntiReplayCache));
    
    cache->seen_requests = g_hash_table_new_full(g_str_hash, g_str_equal, free, NULL);
    pthread_mutex_init(&cache->lock, NULL);
    cache->window_seconds = window_seconds;
    
    return cache;
}

// Early Data Replay 검사
int check_early_data_replay(AntiReplayCache* cache, const char* request_data, size_t len) {
    // 요청 데이터 해시 계산
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256((unsigned char*)request_data, len, hash);
    
    char hash_hex[65];
    for (int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        sprintf(&hash_hex[i*2], "%02x", hash[i]);
    }
    
    time_t now = time(NULL);
    
    pthread_mutex_lock(&cache->lock);
    
    // 이전에 본 요청인지 확인
    gpointer prev_time = g_hash_table_lookup(cache->seen_requests, hash_hex);
    if (prev_time) {
        time_t seen_time = GPOINTER_TO_INT(prev_time);
        if (now - seen_time < cache->window_seconds) {
            pthread_mutex_unlock(&cache->lock);
            return -1;  // Replay 공격
        }
    }
    
    // 새로운 요청 등록
    g_hash_table_insert(cache->seen_requests, 
                       strdup(hash_hex), 
                       GINT_TO_POINTER(now));
    
    // 오래된 엔트리 정리
    GHashTableIter iter;
    gpointer key, value;
    g_hash_table_iter_init(&iter, cache->seen_requests);
    
    while (g_hash_table_iter_next(&iter, &key, &value)) {
        time_t seen_time = GPOINTER_TO_INT(value);
        if (now - seen_time >= cache->window_seconds) {
            g_hash_table_iter_remove(&iter);
        }
    }
    
    pthread_mutex_unlock(&cache->lock);
    return 0;  // 정상
}
```

## 3. 연결 풀링과 Keep-Alive

### 3.1 연결 재사용 최적화

```c
// TLS 연결 풀
typedef struct {
    SSL* ssl;
    int socket_fd;
    char* hostname;
    time_t last_used;
    time_t created;
    int in_use;
    pthread_mutex_t lock;
} TLSConnection;

typedef struct {
    TLSConnection* connections;
    size_t pool_size;
    size_t active_connections;
    pthread_mutex_t pool_lock;
    pthread_cond_t connection_available;
    time_t max_idle_time;
    time_t max_connection_age;
} TLSConnectionPool;

// 연결 풀 초기화
TLSConnectionPool* tls_pool_init(size_t pool_size) {
    TLSConnectionPool* pool = calloc(1, sizeof(TLSConnectionPool));
    
    pool->connections = calloc(pool_size, sizeof(TLSConnection));
    pool->pool_size = pool_size;
    pool->active_connections = 0;
    pool->max_idle_time = 300;    // 5분
    pool->max_connection_age = 3600;  // 1시간
    
    pthread_mutex_init(&pool->pool_lock, NULL);
    pthread_cond_init(&pool->connection_available, NULL);
    
    // 각 연결 초기화
    for (size_t i = 0; i < pool_size; i++) {
        pthread_mutex_init(&pool->connections[i].lock, NULL);
    }
    
    return pool;
}

// 연결 가져오기
TLSConnection* tls_pool_get_connection(TLSConnectionPool* pool, const char* hostname) {
    pthread_mutex_lock(&pool->pool_lock);
    
    time_t now = time(NULL);
    
    // 기존 연결 찾기
    for (size_t i = 0; i < pool->pool_size; i++) {
        TLSConnection* conn = &pool->connections[i];
        
        if (!conn->in_use && conn->ssl && 
            conn->hostname && strcmp(conn->hostname, hostname) == 0) {
            
            // 연결 상태 확인
            if (now - conn->last_used > pool->max_idle_time ||
                now - conn->created > pool->max_connection_age) {
                // 오래된 연결 정리
                SSL_free(conn->ssl);
                close(conn->socket_fd);
                free(conn->hostname);
                memset(conn, 0, sizeof(TLSConnection));
                continue;
            }
            
            // SSL 연결 상태 확인
            if (SSL_get_shutdown(conn->ssl) != 0) {
                // 연결이 닫힘
                SSL_free(conn->ssl);
                close(conn->socket_fd);
                free(conn->hostname);
                memset(conn, 0, sizeof(TLSConnection));
                continue;
            }
            
            conn->in_use = 1;
            conn->last_used = now;
            pthread_mutex_unlock(&pool->pool_lock);
            return conn;
        }
    }
    
    // 새 연결 슬롯 찾기
    for (size_t i = 0; i < pool->pool_size; i++) {
        TLSConnection* conn = &pool->connections[i];
        
        if (!conn->in_use && !conn->ssl) {
            conn->in_use = 1;
            pthread_mutex_unlock(&pool->pool_lock);
            
            // 새 TLS 연결 설정
            if (create_tls_connection(conn, hostname) == 0) {
                return conn;
            } else {
                conn->in_use = 0;
                return NULL;
            }
        }
    }
    
    // 풀이 가득 찬 경우 대기
    pthread_cond_wait(&pool->connection_available, &pool->pool_lock);
    pthread_mutex_unlock(&pool->pool_lock);
    
    return NULL;
}

// 연결 반납
void tls_pool_return_connection(TLSConnectionPool* pool, TLSConnection* conn) {
    if (!conn) return;
    
    pthread_mutex_lock(&pool->pool_lock);
    
    conn->in_use = 0;
    conn->last_used = time(NULL);
    
    pthread_cond_signal(&pool->connection_available);
    pthread_mutex_unlock(&pool->pool_lock);
}
```

### 3.2 HTTP Keep-Alive 최적화

```c
// HTTP Keep-Alive 설정
typedef struct {
    int max_requests_per_connection;
    int keep_alive_timeout;
    int connection_timeout;
    int tcp_keepalive_enabled;
} KeepAliveConfig;

// Keep-Alive 최적화 설정
void configure_keep_alive(int socket_fd, KeepAliveConfig* config) {
    // TCP Keep-Alive 활성화
    if (config->tcp_keepalive_enabled) {
        int enable = 1;
        setsockopt(socket_fd, SOL_SOCKET, SO_KEEPALIVE, &enable, sizeof(enable));
        
        // Keep-Alive 매개변수 설정
        int idle = 600;      // 10분 후 첫 번째 probe
        int interval = 60;   // probe 간격 1분
        int count = 3;       // 최대 probe 횟수
        
        setsockopt(socket_fd, IPPROTO_TCP, TCP_KEEPIDLE, &idle, sizeof(idle));
        setsockopt(socket_fd, IPPROTO_TCP, TCP_KEEPINTVL, &interval, sizeof(interval));
        setsockopt(socket_fd, IPPROTO_TCP, TCP_KEEPCNT, &count, sizeof(count));
    }
    
    // TCP No Delay (지연 없이 전송)
    int nodelay = 1;
    setsockopt(socket_fd, IPPROTO_TCP, TCP_NODELAY, &nodelay, sizeof(nodelay));
    
    // 송수신 버퍼 사이즈 최적화
    int send_buf = 64 * 1024;  // 64KB
    int recv_buf = 64 * 1024;
    setsockopt(socket_fd, SOL_SOCKET, SO_SNDBUF, &send_buf, sizeof(send_buf));
    setsockopt(socket_fd, SOL_SOCKET, SO_RCVBUF, &recv_buf, sizeof(recv_buf));
}

// 연결 상태 모니터링
int monitor_connection_health(TLSConnection* conn) {
    if (!conn->ssl) return -1;
    
    // SSL 연결 상태 확인
    if (SSL_get_shutdown(conn->ssl) != 0) {
        return -1;  // 연결 닫힘
    }
    
    // TCP 연결 상태 확인
    int error = 0;
    socklen_t len = sizeof(error);
    if (getsockopt(conn->socket_fd, SOL_SOCKET, SO_ERROR, &error, &len) < 0) {
        return -1;
    }
    
    if (error != 0) {
        return -1;  // 소켓 오류
    }
    
    // SSL heartbeat
    char heartbeat_data[] = "ping";
    if (SSL_write(conn->ssl, heartbeat_data, sizeof(heartbeat_data)) <= 0) {
        return -1;  // 쓰기 실패
    }
    
    return 0;  // 정상
}
```

## 4. CDN과 로드밸런서 최적화

### 4.1 TLS 종료 최적화

```c
// TLS termination 로드밸런서
typedef struct {
    SSL_CTX* ssl_ctx;
    X509* certificate;
    EVP_PKEY* private_key;
    SessionCache* session_cache;
    struct {
        atomic_long total_connections;
        atomic_long active_connections;
        atomic_long handshakes_per_second;
        atomic_long bytes_transferred;
        double cpu_usage;
        double memory_usage;
    } stats;
} TLSTerminator;

// TLS termination 초기화
TLSTerminator* tls_terminator_init(const char* cert_file, const char* key_file) {
    TLSTerminator* terminator = calloc(1, sizeof(TLSTerminator));
    
    // SSL 컨텍스트 생성
    terminator->ssl_ctx = SSL_CTX_new(TLS_server_method());
    
    // 최적화 설정
    SSL_CTX_set_options(terminator->ssl_ctx, 
        SSL_OP_NO_SSLv2 | SSL_OP_NO_SSLv3 | 
        SSL_OP_NO_TLSv1 | SSL_OP_NO_TLSv1_1 |
        SSL_OP_SINGLE_DH_USE | SSL_OP_SINGLE_ECDH_USE);
    
    // 암호 스위트 최적화
    SSL_CTX_set_cipher_list(terminator->ssl_ctx,
        "ECDHE-RSA-AES256-GCM-SHA384:"
        "ECDHE-RSA-AES128-GCM-SHA256:"
        "ECDHE-RSA-CHACHA20-POLY1305");
    
    // 세션 캐시 설정
    terminator->session_cache = session_cache_new(10000);
    SSL_CTX_set_session_cache_mode(terminator->ssl_ctx, 
        SSL_SESS_CACHE_SERVER | SSL_SESS_CACHE_NO_INTERNAL);
    SSL_CTX_sess_set_new_cb(terminator->ssl_ctx, session_new_callback);
    SSL_CTX_sess_set_get_cb(terminator->ssl_ctx, session_get_callback);
    
    // 인증서 로드
    SSL_CTX_use_certificate_file(terminator->ssl_ctx, cert_file, SSL_FILETYPE_PEM);
    SSL_CTX_use_PrivateKey_file(terminator->ssl_ctx, key_file, SSL_FILETYPE_PEM);
    
    // OCSP Stapling 설정
    SSL_CTX_set_tlsext_status_type(terminator->ssl_ctx, TLSEXT_STATUSTYPE_ocsp);
    
    return terminator;
}

// 다중 인증서 지원 (SNI)
int sni_callback(SSL* ssl, int* ad, void* arg) {
    TLSTerminator* terminator = (TLSTerminator*)arg;
    const char* hostname = SSL_get_servername(ssl, TLSEXT_NAMETYPE_host_name);
    
    if (!hostname) {
        return SSL_TLSEXT_ERR_NOACK;
    }
    
    // 도메인별 인증서 선택
    if (strcmp(hostname, "api.example.com") == 0) {
        SSL_use_certificate_file(ssl, "/etc/ssl/api.example.com.crt", SSL_FILETYPE_PEM);
        SSL_use_PrivateKey_file(ssl, "/etc/ssl/api.example.com.key", SSL_FILETYPE_PEM);
    } else if (strcmp(hostname, "www.example.com") == 0) {
        SSL_use_certificate_file(ssl, "/etc/ssl/www.example.com.crt", SSL_FILETYPE_PEM);
        SSL_use_PrivateKey_file(ssl, "/etc/ssl/www.example.com.key", SSL_FILETYPE_PEM);
    } else {
        // 기본 인증서
        return SSL_TLSEXT_ERR_NOACK;
    }
    
    return SSL_TLSEXT_ERR_OK;
}
```

## 핵심 요점

### 1. Session Resumption 효과

- 핸드셰이크 시간 90% 단축 가능
- CPU 사용률 50% 이상 감소
- 전체 연결 성능 2-3배 향상

### 2. 0-RTT Early Data 주의사항

-**안전한 요청에만 사용**: GET, HEAD 등
-**Replay 공격 방지**: Anti-replay 캐시 필수
-**상태 변경 금지**: POST, PUT, DELETE 요청 제외

### 3. 연결 재사용 전략

-**연결 풀링**: 연결 생성 비용 절약
-**Keep-Alive**: TCP 연결 지속성 향상
-**상태 모니터링**: 비정상 연결 조기 감지

---

**이전**: [암호화 알고리즘과 성능 최적화](./07-33-crypto-performance.md)  
**다음**: [보안 프로그래밍 실습](./04e-secure-programming.md)에서 보안 취약점 방어 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: ADVANCED
-**주제**: 인프라스트럭처
-**예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-07-network-programming)

- [7.1.1: 소켓 프로그래밍의 기초 개요](./07-01-socket-basics.md)
- [7.1.2: 소켓의 개념과 기본 구조](./07-02-socket-fundamentals.md)
- [7.1.3: TCP 소켓 프로그래밍](./07-10-tcp-programming.md)
- [7.1.4: UDP와 Raw 소켓 프로그래밍](./07-11-udp-raw-sockets.md)
- [7.1.5: 소켓 옵션과 Unix 도메인 소켓](./07-12-socket-options-unix.md)

### 🏷️ 관련 키워드

`tls-optimization`, `session-resumption`, `0-rtt`, `early-data`, `anti-replay`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
