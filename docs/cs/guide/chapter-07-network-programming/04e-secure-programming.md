---
tags:
  - advanced
  - buffer_overflow
  - deep-study
  - hands-on
  - memory_security
  - secure_programming
  - sql_injection
  - timing_attack
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "25-35시간"
main_topic: "시스템 프로그래밍"
priority_score: 5
---

# Chapter 7-4E: 보안 프로그래밍 실습

## 🛡️ 보안 코딩의 철칙

제가 보안 감사에서 배운 교훈들:

```python
# 보안 코딩 체크리스트

1. "절대 비밀번호를 평문으로 저장하지 마라"
   → 어느 회사는 DB에 평문 비밀번호 저장... 🤦
   
2. "모든 입력을 검증하라"
   → SQL Injection, XSS, CSRF...
   
3. "타이밍 공격을 고려하라"
   → 비밀번호 비교는 항상 상수 시간!
   
4. "메모리를 안전하게 지워라"
   → 키, 비밀번호는 사용 후 즉시 덮어쓰기
```

## 1. 보안 버퍼 관리

### 1.1 메모리의 비밀을 지키기

#### 🔒 메모리의 비밀을 지키기

Heartbleed 버그(2014)를 기억하시나요? OpenSSL의 메모리 버퍼 오버라이드로 서버 메모리를 훔쳐볼 수 있었던 사건입니다. 그 이후로 보안 버퍼 관리는 필수가 되었습니다:

```c
// 보안 메모리 할당
typedef struct {
    void* ptr;
    size_t size;
    int locked;
    int wiped;
} SecureBuffer;

// 보안 버퍼 할당
// Sony PlayStation 해킹 사건 이후 모든 보안 시스템이 채택한 방식
// 메모리를 잠그고, 사용 후 여러 번 덮어씁니다
SecureBuffer* secure_alloc(size_t size) {
    SecureBuffer* buf = calloc(1, sizeof(SecureBuffer));
    
    // 페이지 정렬된 메모리 할당
    if (posix_memalign(&buf->ptr, getpagesize(), size) != 0) {
        free(buf);
        return NULL;
    }
    
    buf->size = size;
    
    // 메모리 잠금 (스왑 방지)
    if (mlock(buf->ptr, size) == 0) {
        buf->locked = 1;
    }
    
    // 메모리 보호 설정
    if (mprotect(buf->ptr, size, PROT_READ | PROT_WRITE) != 0) {
        munlock(buf->ptr, size);
        free(buf->ptr);
        free(buf);
        return NULL;
    }
    
    return buf;
}

// 보안 버퍼 해제
void secure_free(SecureBuffer* buf) {
    if (!buf) return;
    
    // 메모리 덮어쓰기 (여러 패스)
    if (!buf->wiped) {
        volatile unsigned char* p = (volatile unsigned char*)buf->ptr;
        
        // Pass 1: 0x00
        memset(p, 0x00, buf->size);
        
        // Pass 2: 0xFF
        memset(p, 0xFF, buf->size);
        
        // Pass 3: Random
        RAND_bytes((unsigned char*)p, buf->size);
        
        // Pass 4: 0x00
        memset(p, 0x00, buf->size);
        
        buf->wiped = 1;
    }
    
    // 메모리 잠금 해제
    if (buf->locked) {
        munlock(buf->ptr, buf->size);
    }
    
    free(buf->ptr);
    free(buf);
}

// 상수 시간 비교
// 타이밍 공격을 막기 위한 필수 기법
// bcrypt, scrypt 같은 비밀번호 해싱 라이브러리도 이 방식 사용
int constant_time_compare(const void* a, const void* b, size_t len) {
    const unsigned char* pa = a;
    const unsigned char* pb = b;
    unsigned char result = 0;
    
    for (size_t i = 0; i < len; i++) {
        result |= pa[i] ^ pb[i];
    }
    
    return result == 0;
}

// 타이밍 공격 방지
int timing_safe_auth(const char* input_token, const char* valid_token) {
    size_t input_len = strlen(input_token);
    size_t valid_len = strlen(valid_token);
    
    // 길이가 다르더라도 항상 같은 시간 소요
    unsigned char result = (input_len == valid_len) ? 0 : 1;
    size_t max_len = (input_len > valid_len) ? input_len : valid_len;
    
    for (size_t i = 0; i < max_len; i++) {
        unsigned char a = (i < input_len) ? input_token[i] : 0;
        unsigned char b = (i < valid_len) ? valid_token[i] : 0;
        result |= a ^ b;
    }
    
    return result == 0;
}
```

### 1.2 안전한 문자열 처리

```c
// 보안 문자열 복사
// 버퍼 오버플로우 방지
size_t secure_strlcpy(char* dst, const char* src, size_t dstsize) {
    size_t srclen = strlen(src);
    
    if (dstsize == 0) {
        return srclen;
    }
    
    size_t copy_len = (srclen < dstsize - 1) ? srclen : dstsize - 1;
    memcpy(dst, src, copy_len);
    dst[copy_len] = '\0';
    
    return srclen;
}

// 보안 문자열 연결
size_t secure_strlcat(char* dst, const char* src, size_t dstsize) {
    size_t dstlen = strlen(dst);
    size_t srclen = strlen(src);
    
    if (dstlen >= dstsize) {
        return dstlen + srclen;  // 오류 반환
    }
    
    size_t available = dstsize - dstlen - 1;
    size_t copy_len = (srclen < available) ? srclen : available;
    
    memcpy(dst + dstlen, src, copy_len);
    dst[dstlen + copy_len] = '\0';
    
    return dstlen + srclen;
}

// 안전한 숫자 변환
long secure_strtol(const char* str, int base, int* error) {
    char* endptr;
    long result;
    
    if (!str || !*str) {
        *error = 1;
        return 0;
    }
    
    errno = 0;
    result = strtol(str, &endptr, base);
    
    // 오버플로우 확인
    if (errno == ERANGE) {
        *error = 1;
        return 0;
    }
    
    // 변환되지 않은 문자 확인
    if (*endptr != '\0') {
        *error = 1;
        return 0;
    }
    
    *error = 0;
    return result;
}
```

## 2. 보안 검증과 방어

### 2.1 공격을 막는 방패

#### 😫 공격을 막는 방패

제가 경험한 실제 공격 사례들:

```bash
# SQL Injection 공격 시도 (2015년)
username: admin' OR '1'='1
password: anything
# 결과: 로그인 성공... 😱

# XSS 공격 (2018년)
comment: <script>alert(document.cookie)</script>
# 결과: 사용자 쿠키 탈취

# Rate Limiting 없이 (2020년)
for i in {1..1000000}; do
  curl -X POST https://api.example.com/login
done
# 결과: 서버 다운...
```

```c
// SQL Injection 방지
char* sanitize_sql_input(const char* input) {
    size_t len = strlen(input);
    char* output = malloc(len * 2 + 1);  // 최악의 경우 2배
    size_t j = 0;
    
    for (size_t i = 0; i < len; i++) {
        switch (input[i]) {
            case '\'':
                output[j++] = '\'';
                output[j++] = '\'';
                break;
            case '"':
                output[j++] = '\\';
                output[j++] = '"';
                break;
            case '\\':
                output[j++] = '\\';
                output[j++] = '\\';
                break;
            case '\0':
                output[j++] = '\\';
                output[j++] = '0';
                break;
            default:
                output[j++] = input[i];
        }
    }
    output[j] = '\0';
    
    return output;
}

// XSS 방지
char* escape_html(const char* input) {
    size_t len = strlen(input);
    size_t new_len = 0;
    
    // 필요한 크기 계산
    for (size_t i = 0; i < len; i++) {
        switch (input[i]) {
            case '<': new_len += 4; break;  // &lt;
            case '>': new_len += 4; break;  // &gt;
            case '&': new_len += 5; break;  // &amp;
            case '"': new_len += 6; break;  // &quot;
            case '\'': new_len += 6; break; // &#x27;
            default: new_len++;
        }
    }
    
    char* output = malloc(new_len + 1);
    size_t j = 0;
    
    for (size_t i = 0; i < len; i++) {
        switch (input[i]) {
            case '<':
                strcpy(&output[j], "&lt;");
                j += 4;
                break;
            case '>':
                strcpy(&output[j], "&gt;");
                j += 4;
                break;
            case '&':
                strcpy(&output[j], "&amp;");
                j += 5;
                break;
            case '"':
                strcpy(&output[j], "&quot;");
                j += 6;
                break;
            case '\'':
                strcpy(&output[j], "&#x27;");
                j += 6;
                break;
            default:
                output[j++] = input[i];
        }
    }
    output[j] = '\0';
    
    return output;
}

// Rate Limiting
typedef struct {
    GHashTable* counters;  // IP -> counter
    pthread_mutex_t lock;
    int max_requests;
    int window_seconds;
} RateLimiter;

int check_rate_limit(RateLimiter* limiter, const char* client_ip) {
    pthread_mutex_lock(&limiter->lock);
    
    time_t now = time(NULL);
    
    typedef struct {
        int count;
        time_t window_start;
    } Counter;
    
    Counter* counter = g_hash_table_lookup(limiter->counters, client_ip);
    
    if (!counter) {
        counter = malloc(sizeof(Counter));
        counter->count = 1;
        counter->window_start = now;
        g_hash_table_insert(limiter->counters, strdup(client_ip), counter);
        pthread_mutex_unlock(&limiter->lock);
        return 0;  // 허용
    }
    
    // 윈도우 확인
    if (now - counter->window_start >= limiter->window_seconds) {
        // 새 윈도우
        counter->count = 1;
        counter->window_start = now;
        pthread_mutex_unlock(&limiter->lock);
        return 0;  // 허용
    }
    
    // 같은 윈도우 내
    if (counter->count >= limiter->max_requests) {
        pthread_mutex_unlock(&limiter->lock);
        return -1;  // 거부
    }
    
    counter->count++;
    pthread_mutex_unlock(&limiter->lock);
    return 0;  // 허용
}
```

### 2.2 입력 유효성 검사

```c
// 이메일 주소 검증
int validate_email(const char* email) {
    if (!email || strlen(email) == 0) {
        return 0;
    }
    
    // 기본 이메일 형식 검사
    char* at_pos = strchr(email, '@');
    if (!at_pos || at_pos == email) {
        return 0;  // @ 가 없거나 맨 앞에 있음
    }
    
    char* dot_pos = strchr(at_pos, '.');
    if (!dot_pos || dot_pos == at_pos + 1) {
        return 0;  // . 가 없거나 @ 바로 뒤에 있음
    }
    
    // 길이 검사
    size_t len = strlen(email);
    if (len > 254) {  // RFC 5321 제한
        return 0;
    }
    
    // 특수 문자 검사
    for (size_t i = 0; i < len; i++) {
        char c = email[i];
        if (!isalnum(c) && c != '@' && c != '.' && 
            c != '-' && c != '_' && c != '+') {
            return 0;
        }
    }
    
    return 1;
}

// URL 검증
int validate_url(const char* url) {
    if (!url || strlen(url) == 0) {
        return 0;
    }
    
    // HTTP/HTTPS만 허용
    if (strncmp(url, "http://", 7) != 0 && 
        strncmp(url, "https://", 8) != 0) {
        return 0;
    }
    
    // 길이 제한
    if (strlen(url) > 2048) {
        return 0;
    }
    
    // 위험한 문자 차단
    const char* dangerous[] = {"<", ">", "\"", "'", "javascript:", "data:", NULL};
    for (int i = 0; dangerous[i]; i++) {
        if (strstr(url, dangerous[i])) {
            return 0;
        }
    }
    
    return 1;
}

// 숫자 범위 검사
int validate_integer_range(const char* str, long min, long max, long* result) {
    int error;
    long value = secure_strtol(str, 10, &error);
    
    if (error) {
        return 0;
    }
    
    if (value < min || value > max) {
        return 0;
    }
    
    *result = value;
    return 1;
}
```

## 3. 보안 로깅과 모니터링

### 3.1 실시간 보안 모니터링

#### 🔍 실시간 보안 모니터링

제가 TLS 문제를 디버깅할 때 사용하는 도구들:

```bash
# Wireshark로 TLS 핸드셰이크 분석
$ tshark -i eth0 -f "tcp port 443" -Y "ssl.handshake"

# OpenSSL로 인증서 확인
$ openssl s_client -connect example.com:443 -showcerts

# SSLyze로 보안 스캔
$ sslyze --regular example.com:443

# testssl.sh로 취약점 검사
$ ./testssl.sh https://example.com
```

```c
// TLS 트래픽 모니터
typedef struct {
    atomic_long handshakes_total;
    atomic_long handshakes_failed;
    atomic_long bytes_encrypted;
    atomic_long bytes_decrypted;
    atomic_long sessions_resumed;
    atomic_long early_data_accepted;
    atomic_long early_data_rejected;
    
    // 프로토콜별 카운터
    atomic_long tls10_count;
    atomic_long tls11_count;
    atomic_long tls12_count;
    atomic_long tls13_count;
    
    // 암호 스위트별 카운터
    GHashTable* cipher_stats;
    pthread_rwlock_t lock;
} TLSMonitor;

// 모니터링 콜백
void tls_monitor_callback(const SSL* ssl, int where, int ret) {
    TLSMonitor* monitor = SSL_get_ex_data(ssl, 1);
    if (!monitor) return;
    
    if (where & SSL_CB_HANDSHAKE_START) {
        atomic_fetch_add(&monitor->handshakes_total, 1);
    }
    
    if (where & SSL_CB_HANDSHAKE_DONE) {
        // 프로토콜 버전 카운트
        int version = SSL_version(ssl);
        switch (version) {
            case TLS1_VERSION:
                atomic_fetch_add(&monitor->tls10_count, 1);
                break;
            case TLS1_1_VERSION:
                atomic_fetch_add(&monitor->tls11_count, 1);
                break;
            case TLS1_2_VERSION:
                atomic_fetch_add(&monitor->tls12_count, 1);
                break;
            case TLS1_3_VERSION:
                atomic_fetch_add(&monitor->tls13_count, 1);
                break;
        }
        
        // 암호 스위트 통계
        const char* cipher = SSL_get_cipher(ssl);
        pthread_rwlock_wrlock(&monitor->lock);
        
        gpointer count = g_hash_table_lookup(monitor->cipher_stats, cipher);
        int new_count = GPOINTER_TO_INT(count) + 1;
        g_hash_table_insert(monitor->cipher_stats, 
                           strdup(cipher), 
                           GINT_TO_POINTER(new_count));
        
        pthread_rwlock_unlock(&monitor->lock);
        
        // 세션 재사용 확인
        if (SSL_session_reused((SSL*)ssl)) {
            atomic_fetch_add(&monitor->sessions_resumed, 1);
        }
    }
    
    if (where & SSL_CB_ALERT) {
        if (ret == 0) {
            atomic_fetch_add(&monitor->handshakes_failed, 1);
        }
    }
}

// 통계 출력
void print_tls_stats(TLSMonitor* monitor) {
    printf("TLS Statistics:\n");
    printf("  Total Handshakes: %ld\n", 
           atomic_load(&monitor->handshakes_total));
    printf("  Failed Handshakes: %ld\n", 
           atomic_load(&monitor->handshakes_failed));
    printf("  Sessions Resumed: %ld\n", 
           atomic_load(&monitor->sessions_resumed));
    printf("  Early Data Accepted: %ld\n", 
           atomic_load(&monitor->early_data_accepted));
    
    printf("\nProtocol Distribution:\n");
    printf("  TLS 1.0: %ld\n", atomic_load(&monitor->tls10_count));
    printf("  TLS 1.1: %ld\n", atomic_load(&monitor->tls11_count));
    printf("  TLS 1.2: %ld\n", atomic_load(&monitor->tls12_count));
    printf("  TLS 1.3: %ld\n", atomic_load(&monitor->tls13_count));
    
    printf("\nCipher Suite Usage:\n");
    pthread_rwlock_rdlock(&monitor->lock);
    
    GHashTableIter iter;
    gpointer key, value;
    g_hash_table_iter_init(&iter, monitor->cipher_stats);
    
    while (g_hash_table_iter_next(&iter, &key, &value)) {
        printf("  %s: %d\n", (char*)key, GPOINTER_TO_INT(value));
    }
    
    pthread_rwlock_unlock(&monitor->lock);
    
    double bytes_enc = atomic_load(&monitor->bytes_encrypted) / (1024.0 * 1024.0);
    double bytes_dec = atomic_load(&monitor->bytes_decrypted) / (1024.0 * 1024.0);
    printf("\nData Transfer:\n");
    printf("  Encrypted: %.2f MB\n", bytes_enc);
    printf("  Decrypted: %.2f MB\n", bytes_dec);
}
```

### 3.2 보안 사고 대응

```c
// 보안 사고 대응 시스템
typedef struct {
    time_t timestamp;
    char* event_type;
    char* source_ip;
    char* target;
    char* description;
    int severity;  // 1-5 (높을수록 심각)
    int handled;
} SecurityEvent;

typedef struct {
    SecurityEvent* events;
    size_t event_count;
    size_t max_events;
    pthread_mutex_t lock;
    
    // 자동 처리 규칙
    GHashTable* block_list;  // IP -> 차단 만료시간
    int auto_block_enabled;
    int max_failed_attempts;
    time_t block_duration;
} SecurityLogger;

// 보안 이벤트 로깅
void log_security_event(SecurityLogger* logger, const char* event_type,
                       const char* source_ip, const char* target,
                       const char* description, int severity) {
    pthread_mutex_lock(&logger->lock);
    
    // 버퍼 가득 찬 경우 오래된 이벤트 제거
    if (logger->event_count >= logger->max_events) {
        // 가장 오래된 이벤트 제거 (FIFO)
        free(logger->events[0].event_type);
        free(logger->events[0].source_ip);
        free(logger->events[0].target);
        free(logger->events[0].description);
        
        memmove(&logger->events[0], &logger->events[1], 
                sizeof(SecurityEvent) * (logger->max_events - 1));
        logger->event_count--;
    }
    
    // 새 이벤트 추가
    SecurityEvent* event = &logger->events[logger->event_count];
    event->timestamp = time(NULL);
    event->event_type = strdup(event_type);
    event->source_ip = strdup(source_ip);
    event->target = strdup(target);
    event->description = strdup(description);
    event->severity = severity;
    event->handled = 0;
    
    logger->event_count++;
    
    // 심각도에 따른 자동 처리
    if (severity >= 4 && logger->auto_block_enabled) {
        auto_handle_security_event(logger, event);
    }
    
    // 로그 출력
    char timestamp_str[64];
    strftime(timestamp_str, sizeof(timestamp_str), 
             "%Y-%m-%d %H:%M:%S", localtime(&event->timestamp));
    
    printf("[%s] SECURITY [%d] %s from %s to %s: %s\n",
           timestamp_str, severity, event_type, source_ip, target, description);
    
    pthread_mutex_unlock(&logger->lock);
}

// 자동 보안 사고 처리
void auto_handle_security_event(SecurityLogger* logger, SecurityEvent* event) {
    if (strcmp(event->event_type, "FAILED_LOGIN") == 0 ||
        strcmp(event->event_type, "BRUTE_FORCE") == 0) {
        
        // IP 차단
        time_t block_until = time(NULL) + logger->block_duration;
        g_hash_table_insert(logger->block_list, 
                           strdup(event->source_ip),
                           GINT_TO_POINTER(block_until));
        
        printf("AUTO-BLOCK: %s blocked for %ld seconds\n", 
               event->source_ip, logger->block_duration);
        event->handled = 1;
    }
    
    if (strcmp(event->event_type, "SQL_INJECTION") == 0 ||
        strcmp(event->event_type, "XSS_ATTEMPT") == 0) {
        
        // 즉시 IP 차단
        time_t block_until = time(NULL) + (24 * 60 * 60);  // 24시간
        g_hash_table_insert(logger->block_list,
                           strdup(event->source_ip),
                           GINT_TO_POINTER(block_until));
        
        printf("CRITICAL-BLOCK: %s blocked for 24 hours (attack detected)\n", 
               event->source_ip);
        event->handled = 1;
    }
}

// IP 차단 상태 확인
int is_ip_blocked(SecurityLogger* logger, const char* ip) {
    pthread_mutex_lock(&logger->lock);
    
    gpointer block_time = g_hash_table_lookup(logger->block_list, ip);
    if (!block_time) {
        pthread_mutex_unlock(&logger->lock);
        return 0;  // 차단되지 않음
    }
    
    time_t blocked_until = GPOINTER_TO_INT(block_time);
    time_t now = time(NULL);
    
    if (now >= blocked_until) {
        // 차단 시간 만료
        g_hash_table_remove(logger->block_list, ip);
        pthread_mutex_unlock(&logger->lock);
        return 0;
    }
    
    pthread_mutex_unlock(&logger->lock);
    return 1;  // 아직 차단 중
}
```

## 4. 보안 벤치마크와 테스트

### 4.1 침투 테스트

```c
// 침투 테스트 프레임워크
typedef struct {
    char* name;
    int (*test_func)(void);
    char* description;
    int severity;
} SecurityTest;

// SQL Injection 테스트
int test_sql_injection() {
    const char* malicious_inputs[] = {
        "'; DROP TABLE users; --",
        "admin' OR '1'='1",
        "1' UNION SELECT * FROM passwords --",
        NULL
    };
    
    for (int i = 0; malicious_inputs[i]; i++) {
        char* sanitized = sanitize_sql_input(malicious_inputs[i]);
        
        // 살시 공격 문자열이 제대로 살전되었는지 확인
        if (strstr(sanitized, "DROP") || strstr(sanitized, "UNION") ||
            strstr(sanitized, "OR '1'='1'")) {
            free(sanitized);
            return 0;  // 테스트 실패
        }
        
        free(sanitized);
    }
    
    return 1;  // 테스트 통과
}

// XSS 테스트
int test_xss_protection() {
    const char* xss_inputs[] = {
        "<script>alert('XSS')</script>",
        "<img src=x onerror=alert(1)>",
        "javascript:alert('XSS')",
        NULL
    };
    
    for (int i = 0; xss_inputs[i]; i++) {
        char* escaped = escape_html(xss_inputs[i]);
        
        // 위험한 태그나 스크립트가 남아있는지 확인
        if (strstr(escaped, "<script>") || strstr(escaped, "onerror=") ||
            strstr(escaped, "javascript:")) {
            free(escaped);
            return 0;
        }
        
        free(escaped);
    }
    
    return 1;
}

// 타이밍 공격 테스트
int test_timing_attack_resistance() {
    const char* correct_token = "correct_secret_token_12345";
    const char* wrong_tokens[] = {
        "wrong_token_1",
        "wrong_token_2",
        "completely_different_length_token",
        NULL
    };
    
    struct timespec start, end;
    double times[10];
    
    // 잘못된 토큰들로 여러 번 테스트
    for (int i = 0; wrong_tokens[i]; i++) {
        for (int j = 0; j < 10; j++) {
            clock_gettime(CLOCK_MONOTONIC, &start);
            timing_safe_auth(wrong_tokens[i], correct_token);
            clock_gettime(CLOCK_MONOTONIC, &end);
            
            times[j] = (end.tv_sec - start.tv_sec) * 1000.0 +
                      (end.tv_nsec - start.tv_nsec) / 1000000.0;
        }
        
        // 시간 편차 계산
        double avg = 0, variance = 0;
        for (int j = 0; j < 10; j++) {
            avg += times[j];
        }
        avg /= 10;
        
        for (int j = 0; j < 10; j++) {
            variance += (times[j] - avg) * (times[j] - avg);
        }
        variance /= 10;
        
        // 너무 큰 편차는 타이밍 공격 취약
        if (variance > 0.1) {  // 0.1ms 이상 편차
            return 0;
        }
    }
    
    return 1;
}

// 보안 테스트 실행
void run_security_tests() {
    SecurityTest tests[] = {
        {"SQL Injection", test_sql_injection, "SQL 인젝션 방어 테스트", 5},
        {"XSS Protection", test_xss_protection, "XSS 공격 방어 테스트", 4},
        {"Timing Attack", test_timing_attack_resistance, "타이밍 공격 저항성 테스트", 3},
        {NULL, NULL, NULL, 0}
    };
    
    printf("███ Security Test Suite ███\n\n");
    
    int passed = 0, total = 0;
    for (int i = 0; tests[i].name; i++) {
        total++;
        printf("[테스트] %s: ", tests[i].name);
        
        if (tests[i].test_func()) {
            printf("✅ PASS\n");
            passed++;
        } else {
            printf("❌ FAIL (Severity: %d)\n", tests[i].severity);
        }
    }
    
    printf("\n✨ 결과: %d/%d 테스트 통과\n", passed, total);
    
    if (passed != total) {
        printf("⚠️  보안 취약점이 발견되었습니다!\n");
    } else {
        printf("🎉 모든 보안 테스트를 통과했습니다!\n");
    }
}
```

## 핵심 요점

### 1. 보안 개발 원칙

- **입력 검증**: 모든 외부 입력은 신뢰할 수 없음
- **최소 권한 원칙**: 필요한 최소한의 권한만 부여
- **심층 방어**: 여러 레이어에서 보안 적용

### 2. 메모리 보안 기법

- **보안 버퍼**: 민감 데이터 메모리 잠금
- **상수 시간 비교**: 타이밍 공격 방지
- **안전한 지우기**: 메모리에서 비밀 정보 완전 제거

### 3. 공격 방어 전략

- **입력 살전**: SQL Injection, XSS 등 방지
- **Rate Limiting**: 무차별 공격 차단
- **실시간 모니터링**: 비정상 패턴 감지

### 4. 보안 테스트

- **자동화된 보안 테스트**: CI/CD에 단위 테스트 포함
- **침투 테스트**: 실제 공격 시나리오 테스트
- **성능 벤치마크**: 보안 오버헤드 최소화

---

**이전**: [TLS 성능 튜닝](./07-34-tls-optimization.md)  
**다음**: [비동기 프로그래밍](../chapter-10-async-programming/08-10-promise-future.md)에서 Promise/Future 패턴과 비동기 프로그래밍의 핵심을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 25-35시간

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

`secure_programming`, `memory_security`, `buffer_overflow`, `timing_attack`, `sql_injection`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
