---
tags:
  - ACME
  - Certificate Pinning
  - OCSP
  - PKI
  - X.509
  - hands-on
  - intermediate
  - medium-read
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# Chapter 7-4B: X.509 인증서와 PKI 시스템

## 🏦 디지털 신원증의 세계

제가 처음 SSL 인증서를 구매했을 때의 충격:

```bash
# 2012년: "인증서가 이렇게 비싸다고?"
비용: $300/년 (Wildcard SSL)
발급 시간: 3-5일 (서류 검토...)

# 2024년: "Let's Encrypt 만세!"
비용: $0 (무료!)
발급 시간: 1분 (자동화!)

$ certbot certonly --standalone -d mysite.com
# 짜잔! SSL 인증서 발급 완료! 🎆
```

X.509 인증서는 마치 여권과 같습니다. 신원을 증명하고, 유효기간이 있으며, 위조가 어렵습니다.

## 1. 인증서 체인 검증

### 1.1 신뢰의 사슬

#### 🔗 신뢰의 사슬

인증서 체인은 "나는 A를 믿고, A는 B를 믿고, B는 C를 믿는다"는 신뢰의 사슬입니다:

```text
Root CA (DigiCert Global Root CA)
  └─> Intermediate CA (DigiCert SHA2 Secure Server CA)
      └─> End Entity Certificate (www.example.com)
```

```c
// X.509 인증서 구조체
typedef struct {
    X509* cert;
    EVP_PKEY* public_key;
    char* subject;
    char* issuer;
    time_t not_before;
    time_t not_after;
    STACK_OF(X509)* chain;
} Certificate;

// 인증서 체인 검증
// 브라우저가 녹색 자물쇠를 표시하기 전에 하는 일!
int verify_certificate_chain(SSL* ssl) {
    X509* peer_cert = SSL_get_peer_certificate(ssl);
    if (!peer_cert) {
        fprintf(stderr, "No peer certificate\n");
        return -1;
    }

    // 인증서 체인 가져오기
    STACK_OF(X509)* chain = SSL_get_peer_cert_chain(ssl);

    // 검증 컨텍스트 생성
    X509_STORE_CTX* verify_ctx = X509_STORE_CTX_new();
    X509_STORE* store = SSL_CTX_get_cert_store(SSL_get_SSL_CTX(ssl));

    if (!X509_STORE_CTX_init(verify_ctx, store, peer_cert, chain)) {
        X509_STORE_CTX_free(verify_ctx);
        X509_free(peer_cert);
        return -1;
    }

    // 검증 수행
    int result = X509_verify_cert(verify_ctx);
    if (result != 1) {
        int err = X509_STORE_CTX_get_error(verify_ctx);
        const char* err_string = X509_verify_cert_error_string(err);
        fprintf(stderr, "Certificate verification failed: %s\n", err_string);

        // 상세 오류 정보
        int depth = X509_STORE_CTX_get_error_depth(verify_ctx);
        X509* err_cert = X509_STORE_CTX_get_current_cert(verify_ctx);

        char subject[256];
        X509_NAME_oneline(X509_get_subject_name(err_cert), subject, sizeof(subject));
        fprintf(stderr, "Error at depth %d: %s\n", depth, subject);
    }

    X509_STORE_CTX_free(verify_ctx);
    X509_free(peer_cert);

    return result == 1 ? 0 : -1;
}

// 인증서 정보 추출
Certificate* parse_certificate(const char* cert_file) {
    Certificate* cert = calloc(1, sizeof(Certificate));

    // PEM 파일 읽기
    FILE* fp = fopen(cert_file, "r");
    if (!fp) {
        free(cert);
        return NULL;
    }

    cert->cert = PEM_read_X509(fp, NULL, NULL, NULL);
    fclose(fp);

    if (!cert->cert) {
        free(cert);
        return NULL;
    }

    // Subject와 Issuer 추출
    char buf[256];
    X509_NAME_oneline(X509_get_subject_name(cert->cert), buf, sizeof(buf));
    cert->subject = strdup(buf);

    X509_NAME_oneline(X509_get_issuer_name(cert->cert), buf, sizeof(buf));
    cert->issuer = strdup(buf);

    // 유효기간 추출
    ASN1_TIME* not_before = X509_get_notBefore(cert->cert);
    ASN1_TIME* not_after = X509_get_notAfter(cert->cert);

    cert->not_before = ASN1_TIME_to_time_t(not_before);
    cert->not_after = ASN1_TIME_to_time_t(not_after);

    // 공개키 추출
    cert->public_key = X509_get_pubkey(cert->cert);

    // 키 타입과 크기
    int key_type = EVP_PKEY_base_id(cert->public_key);
    int key_bits = EVP_PKEY_bits(cert->public_key);

    printf("Certificate Info:\n");
    printf("  Subject: %s\n", cert->subject);
    printf("  Issuer: %s\n", cert->issuer);
    printf("  Valid from: %s", ctime(&cert->not_before));
    printf("  Valid until: %s", ctime(&cert->not_after));
    printf("  Key Type: %s\n",
           key_type == EVP_PKEY_RSA ? "RSA" :
           key_type == EVP_PKEY_EC ? "ECDSA" : "Unknown");
    printf("  Key Size: %d bits\n", key_bits);

    return cert;
}
```

### 1.2 Certificate Pinning

#### 🔐 중간자 공격 방어

Certificate Pinning은 특정 공개키만 신뢰하는 방식입니다. Twitter, GitHub 같은 서비스가 중간자 공격을 막기 위해 사용하는 기법입니다:

```c
// 인증서 핀닝
int verify_certificate_pin(SSL* ssl, const unsigned char* expected_pin) {
    X509* cert = SSL_get_peer_certificate(ssl);
    if (!cert) return -1;

    // 공개키 추출
    EVP_PKEY* pkey = X509_get_pubkey(cert);
    if (!pkey) {
        X509_free(cert);
        return -1;
    }

    // DER 형식으로 인코딩
    unsigned char* der = NULL;
    int der_len = i2d_PUBKEY(pkey, &der);

    // SHA256 해시 계산
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256(der, der_len, hash);

    // Base64 인코딩
    char pin[45];  // SHA256 base64 = 44 chars + null
    EVP_EncodeBlock((unsigned char*)pin, hash, SHA256_DIGEST_LENGTH);

    // 핀 비교
    int result = strcmp(pin, (const char*)expected_pin);

    OPENSSL_free(der);
    EVP_PKEY_free(pkey);
    X509_free(cert);

    return result == 0 ? 0 : -1;
}

// 모바일 앱에서 Certificate Pinning 사용 예제
typedef struct {
    const char* hostname;
    const char* pin_sha256;
    time_t pin_expires;
} CertificatePin;

static const CertificatePin known_pins[] = {
    {"api.myservice.com", "YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=", 1735689600},
    {"cdn.myservice.com", "JSMzqOOrtyOT1kmau6zKhgT676hGgczD5VMdRMyJZFA=", 1735689600},
    {NULL, NULL, 0}
};

int check_certificate_pin(const char* hostname, SSL* ssl) {
    for (int i = 0; known_pins[i].hostname; i++) {
        if (strcmp(hostname, known_pins[i].hostname) == 0) {
            // 핀 만료 확인
            if (time(NULL) > known_pins[i].pin_expires) {
                printf("Warning: Certificate pin expired for %s\n", hostname);
                return 0;  // 만료된 핀은 무시
            }

            return verify_certificate_pin(ssl,
                (const unsigned char*)known_pins[i].pin_sha256);
        }
    }

    return 0;  // 핀이 없으면 기본 검증만
}
```

## 2. OCSP Stapling

### 2.1 실시간 인증서 유횤성 확인

#### 📡 인증서 유효성 실시간 확인

OCSP(Online Certificate Status Protocol)는 인증서가 현재 유효한지 확인합니다. 마치 신용카드를 사용할 때마다 카드가 유효한지 확인하는 것과 같죠.

제가 경험한 OCSP 문제:

```bash
# OCSP 서버가 다운되었을 때...
$ curl https://example.com
curl: (35) error:14094414:SSL routines:ssl3_read_bytes:sslv3 alert certificate revoked
# 인증서가 취소되었는데 몰랐다니! 😱
```

```c
// OCSP 응답 구조체
typedef struct {
    OCSP_RESPONSE* response;
    unsigned char* der_data;
    int der_len;
    time_t produced_at;
    time_t next_update;
} OCSPResponse;

// OCSP Stapling 콜백
static int ocsp_stapling_callback(SSL* ssl, void* arg) {
    OCSPResponse* ocsp = (OCSPResponse*)arg;

    // OCSP 응답이 있고 유효한 경우
    if (ocsp && ocsp->der_data && time(NULL) < ocsp->next_update) {
        unsigned char* p = ocsp->der_data;
        SSL_set_tlsext_status_ocsp_resp(ssl, p, ocsp->der_len);
        return SSL_TLSEXT_ERR_OK;
    }

    return SSL_TLSEXT_ERR_NOACK;
}

// OCSP 응답 가져오기
OCSPResponse* fetch_ocsp_response(X509* cert, X509* issuer) {
    OCSPResponse* resp = calloc(1, sizeof(OCSPResponse));

    // OCSP Request 생성
    OCSP_REQUEST* req = OCSP_REQUEST_new();
    OCSP_CERTID* id = OCSP_cert_to_id(NULL, cert, issuer);
    OCSP_request_add0_id(req, id);

    // OCSP URL 추출
    STACK_OF(OPENSSL_STRING)* urls = X509_get1_ocsp(cert);
    if (!urls || sk_OPENSSL_STRING_num(urls) == 0) {
        OCSP_REQUEST_free(req);
        free(resp);
        return NULL;
    }

    const char* url = sk_OPENSSL_STRING_value(urls, 0);

    // HTTP로 OCSP 요청 전송
    BIO* bio = BIO_new_connect(url);
    if (BIO_do_connect(bio) <= 0) {
        BIO_free(bio);
        OCSP_REQUEST_free(req);
        free(resp);
        return NULL;
    }

    // OCSP 응답 수신
    resp->response = OCSP_sendreq_bio(bio, url, req);
    BIO_free(bio);
    OCSP_REQUEST_free(req);

    if (!resp->response) {
        free(resp);
        return NULL;
    }

    // DER 형식으로 인코딩
    resp->der_len = i2d_OCSP_RESPONSE(resp->response, &resp->der_data);

    // 응답 검증
    OCSP_BASICRESP* basic = OCSP_response_get1_basic(resp->response);
    if (basic) {
        // 생성 시간과 다음 업데이트 시간 추출
        ASN1_GENERALIZEDTIME* produced_at = OCSP_resp_get0_produced_at(basic);
        resp->produced_at = ASN1_TIME_to_time_t(produced_at);

        // 인증서 상태 확인
        int status, reason;
        ASN1_GENERALIZEDTIME *revtime, *thisupd, *nextupd;

        if (OCSP_resp_find_status(basic, id, &status, &reason,
                                  &revtime, &thisupd, &nextupd)) {
            if (nextupd) {
                resp->next_update = ASN1_TIME_to_time_t(nextupd);
            }
        }

        OCSP_BASICRESP_free(basic);
    }

    X509_email_free(urls);
    return resp;
}

// OCSP 스테이플링 서버 설정
void setup_ocsp_stapling(SSL_CTX* ctx, X509* cert, X509* issuer_cert) {
    // OCSP 스테이플링 활성화
    SSL_CTX_set_tlsext_status_type(ctx, TLSEXT_STATUSTYPE_ocsp);

    // OCSP 응답 가져오기
    OCSPResponse* ocsp_resp = fetch_ocsp_response(cert, issuer_cert);
    if (ocsp_resp) {
        // 콜백 설정
        SSL_CTX_set_tlsext_status_cb(ctx, ocsp_stapling_callback);
        SSL_CTX_set_tlsext_status_arg(ctx, ocsp_resp);

        printf("OCSP Stapling enabled\n");
        printf("  Response valid until: %s", ctime(&ocsp_resp->next_update));
    } else {
        printf("Failed to fetch OCSP response\n");
    }
}
```

## 3. Let's Encrypt 자동 인증서 관리

### 3.1 ACME 프로토콜

#### 🤖 인증서 자동 갱신

ACME(Automatic Certificate Management Environment) 프로토콜을 사용하면 인증서 발급과 갱신을 완전히 자동화할 수 있습니다:

```bash
# Certbot을 사용한 자동 갱신 설정

# 1. 초기 인증서 발급
$ certbot certonly --standalone -d example.com -d www.example.com

# 2. 자동 갱신 설정 (crontab)
0 12 * * * /usr/bin/certbot renew --quiet

# 3. 인증서 갱신 후 웹 서버 재시작
0 12 * * * /usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

```c
// ACME 인증서 관리 예제
typedef struct {
    char* domain;
    char* cert_path;
    char* key_path;
    time_t expires;
    int auto_renew;
} ACMECertificate;

typedef struct {
    ACMECertificate* certs;
    size_t cert_count;
    pthread_mutex_t lock;
    int renewal_thread_running;
} ACMEManager;

// ACME 매니저 초기화
ACMEManager* acme_manager_init() {
    ACMEManager* mgr = calloc(1, sizeof(ACMEManager));
    pthread_mutex_init(&mgr->lock, NULL);

    // 기존 인증서 스캔
    load_existing_certificates(mgr);

    // 자동 갱신 스레드 시작
    start_renewal_thread(mgr);

    return mgr;
}

// 인증서 만료 일자 확인
time_t get_certificate_expiry(const char* cert_path) {
    FILE* fp = fopen(cert_path, "r");
    if (!fp) return 0;

    X509* cert = PEM_read_X509(fp, NULL, NULL, NULL);
    fclose(fp);

    if (!cert) return 0;

    ASN1_TIME* not_after = X509_get_notAfter(cert);
    time_t expiry = ASN1_TIME_to_time_t(not_after);

    X509_free(cert);
    return expiry;
}

// 인증서 자동 갱신 스레드
void* certificate_renewal_thread(void* arg) {
    ACMEManager* mgr = (ACMEManager*)arg;

    while (mgr->renewal_thread_running) {
        pthread_mutex_lock(&mgr->lock);

        time_t now = time(NULL);
        time_t renewal_threshold = now + (30 * 24 * 60 * 60);  // 30일 전

        for (size_t i = 0; i < mgr->cert_count; i++) {
            ACMECertificate* cert = &mgr->certs[i];

            if (cert->auto_renew && cert->expires < renewal_threshold) {
                printf("Renewing certificate for %s\n", cert->domain);

                // Certbot 실행
                char cmd[512];
                snprintf(cmd, sizeof(cmd),
                    "certbot renew --cert-name %s --deploy-hook 'touch /tmp/cert_renewed'",
                    cert->domain);

                int result = system(cmd);
                if (result == 0) {
                    // 새 만료 일자 업데이트
                    cert->expires = get_certificate_expiry(cert->cert_path);
                    printf("Certificate renewed successfully for %s\n", cert->domain);
                } else {
                    printf("Failed to renew certificate for %s\n", cert->domain);
                }
            }
        }

        pthread_mutex_unlock(&mgr->lock);

        // 24시간마다 확인
        sleep(24 * 60 * 60);
    }

    return NULL;
}
```

## 4. 보안 모니터링

### 4.1 인증서 모니터링 시스템

```c
// 인증서 모니터링 대시보드
typedef struct {
    atomic_long certs_total;
    atomic_long certs_expired;
    atomic_long certs_expiring_soon;
    atomic_long chain_verification_failures;
    atomic_long ocsp_responses_stale;
    atomic_long pinning_violations;

    GHashTable* cert_stats;  // domain -> CertStats
    pthread_rwlock_t lock;
} CertMonitor;

typedef struct {
    char* domain;
    time_t last_check;
    time_t expires;
    int chain_valid;
    int ocsp_valid;
    int pin_valid;
    char* issuer;
    char* serial;
} CertStats;

// 인증서 상태 확인
void monitor_certificate_health(CertMonitor* monitor) {
    pthread_rwlock_rdlock(&monitor->lock);

    GHashTableIter iter;
    gpointer key, value;
    g_hash_table_iter_init(&iter, monitor->cert_stats);

    time_t now = time(NULL);
    time_t warning_threshold = now + (14 * 24 * 60 * 60);  // 2주 전

    while (g_hash_table_iter_next(&iter, &key, &value)) {
        CertStats* stats = (CertStats*)value;

        // 만료 임박 경고
        if (stats->expires < warning_threshold) {
            printf("WARNING: Certificate for %s expires in %ld days\n",
                   stats->domain, (stats->expires - now) / (24 * 60 * 60));
            atomic_fetch_add(&monitor->certs_expiring_soon, 1);
        }

        // 만료된 인증서
        if (stats->expires < now) {
            printf("ERROR: Certificate for %s has expired!\n", stats->domain);
            atomic_fetch_add(&monitor->certs_expired, 1);
        }

        // 체인 검증 실패
        if (!stats->chain_valid) {
            printf("ERROR: Certificate chain invalid for %s\n", stats->domain);
            atomic_fetch_add(&monitor->chain_verification_failures, 1);
        }

        // OCSP 응답 문제
        if (!stats->ocsp_valid) {
            printf("WARNING: OCSP response invalid for %s\n", stats->domain);
            atomic_fetch_add(&monitor->ocsp_responses_stale, 1);
        }
    }

    pthread_rwlock_unlock(&monitor->lock);
}

// 웹 대시보드를 위한 JSON 출력
char* generate_certificate_report_json(CertMonitor* monitor) {
    cJSON* root = cJSON_CreateObject();
    cJSON* summary = cJSON_CreateObject();

    cJSON_AddNumberToObject(summary, "total_certificates",
                           atomic_load(&monitor->certs_total));
    cJSON_AddNumberToObject(summary, "expired_certificates",
                           atomic_load(&monitor->certs_expired));
    cJSON_AddNumberToObject(summary, "expiring_soon",
                           atomic_load(&monitor->certs_expiring_soon));
    cJSON_AddNumberToObject(summary, "chain_failures",
                           atomic_load(&monitor->chain_verification_failures));

    cJSON_AddItemToObject(root, "summary", summary);

    // 상세 인증서 정보
    cJSON* certificates = cJSON_CreateArray();

    pthread_rwlock_rdlock(&monitor->lock);
    GHashTableIter iter;
    gpointer key, value;
    g_hash_table_iter_init(&iter, monitor->cert_stats);

    while (g_hash_table_iter_next(&iter, &key, &value)) {
        CertStats* stats = (CertStats*)value;
        cJSON* cert = cJSON_CreateObject();

        cJSON_AddStringToObject(cert, "domain", stats->domain);
        cJSON_AddStringToObject(cert, "issuer", stats->issuer);
        cJSON_AddStringToObject(cert, "serial", stats->serial);
        cJSON_AddNumberToObject(cert, "expires", stats->expires);
        cJSON_AddBoolToObject(cert, "chain_valid", stats->chain_valid);
        cJSON_AddBoolToObject(cert, "ocsp_valid", stats->ocsp_valid);

        time_t days_until_expiry = (stats->expires - time(NULL)) / (24 * 60 * 60);
        cJSON_AddNumberToObject(cert, "days_until_expiry", days_until_expiry);

        cJSON_AddItemToArray(certificates, cert);
    }

    pthread_rwlock_unlock(&monitor->lock);
    cJSON_AddItemToObject(root, "certificates", certificates);

    char* json_string = cJSON_Print(root);
    cJSON_Delete(root);

    return json_string;
}
```

## 핵심 요점

### 1. PKI 체계의 핵심

- Root CA부터 End Entity까지의 신뢰 체인
- X.509 인증서 구조와 검증 과정
- 인증서 만료 및 재발급 관리

### 2. 보안 강화 기법

- Certificate Pinning으로 중간자 공격 방지
- OCSP Stapling으로 실시간 인증서 상태 확인
- HSTS와 보안 헤더 설정

### 3. 운영 자동화

- Let's Encrypt를 사용한 무료 인증서 자동 관리
- ACME 프로토콜을 통한 인증서 갱신 자동화
- 모니터링과 알림 시스템 구축

---

**이전**: [TLS 프로토콜 기초](./07-04-tls-protocol-fundamentals.md)
**다음**: [암호화 알고리즘과 성능 최적화](./07-33-crypto-performance.md)에서 암호화 성능 벤치마킹을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 4-6시간

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

`X.509`, `PKI`, `Certificate Pinning`, `OCSP`, `ACME`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
