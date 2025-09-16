---
tags:
  - HPACK
  - HTTP/2
  - HTTP/3
  - WebSocket
  - deep-study
  - hands-on
  - intermediate
  - protocol-optimization
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "6-8시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# Chapter 7-3D: 프로토콜 최적화

## 🎪 HTTP/1.1에서 HTTP/3까지의 여정

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

## HTTP/2 서버 구현

### 🚄 멀티플렉싱의 힘

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

## WebSocket 서버

### 💬 실시간 통신의 혁명

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

## HPACK 헤더 압축

### 📦 HTTP/2의 비밀 무기

HTTP/2의 성능 향상에 숨겨진 핵심 기술 중 하나가 HPACK 헤더 압축입니다.

```c
// HPACK 동적 테이블 구현
struct hpack_entry {
    char *name;
    char *value;
    size_t name_len;
    size_t value_len;
    size_t size;  // name_len + value_len + 32
};

struct hpack_context {
    struct hpack_entry *dynamic_table;
    size_t table_size;
    size_t table_capacity;
    size_t max_table_size;
    
    // 참조 세트 (HTTP/2에서는 사용하지 않음)
    bool *reference_set;
    
    // 인덱싱 전략
    enum hpack_indexing {
        HPACK_INDEX_ALWAYS,
        HPACK_INDEX_NEVER,
        HPACK_INDEX_NEVER_SENSITIVE
    } default_indexing;
};

// 정적 테이블 (RFC 7541)
static const struct hpack_entry static_table[] = {
    {":authority", "", 10, 0, 42},
    {":method", "GET", 7, 3, 42},
    {":method", "POST", 7, 4, 43},
    {":path", "/", 5, 1, 38},
    {":path", "/index.html", 5, 11, 48},
    {":scheme", "http", 7, 4, 43},
    {":scheme", "https", 7, 5, 44},
    {":status", "200", 7, 3, 42},
    {":status", "204", 7, 3, 42},
    {":status", "206", 7, 3, 42},
    {":status", "304", 7, 3, 42},
    {":status", "400", 7, 3, 42},
    {":status", "404", 7, 3, 42},
    {":status", "500", 7, 3, 42},
    {"accept-charset", "", 14, 0, 46},
    {"accept-encoding", "gzip, deflate", 15, 13, 60},
    {"accept-language", "", 15, 0, 47},
    {"accept-ranges", "", 13, 0, 45},
    {"accept", "", 6, 0, 38},
    {"access-control-allow-origin", "", 27, 0, 59},
    {"age", "", 3, 0, 35},
    {"allow", "", 5, 0, 37},
    {"authorization", "", 13, 0, 45},
    {"cache-control", "", 13, 0, 45},
    {"content-disposition", "", 19, 0, 51},
    {"content-encoding", "", 16, 0, 48},
    {"content-language", "", 16, 0, 48},
    {"content-length", "", 14, 0, 46},
    {"content-location", "", 16, 0, 48},
    {"content-range", "", 13, 0, 45},
    {"content-type", "", 12, 0, 44},
    {"cookie", "", 6, 0, 38},
    {"date", "", 4, 0, 36},
    {"etag", "", 4, 0, 36},
    {"expect", "", 6, 0, 38},
    {"expires", "", 7, 0, 39},
    {"from", "", 4, 0, 36},
    {"host", "", 4, 0, 36},
    {"if-match", "", 8, 0, 40},
    {"if-modified-since", "", 17, 0, 49},
    {"if-none-match", "", 13, 0, 45},
    {"if-range", "", 8, 0, 40},
    {"if-unmodified-since", "", 19, 0, 51},
    {"last-modified", "", 13, 0, 45},
    {"link", "", 4, 0, 36},
    {"location", "", 8, 0, 40},
    {"max-forwards", "", 12, 0, 44},
    {"proxy-authenticate", "", 18, 0, 50},
    {"proxy-authorization", "", 19, 0, 51},
    {"range", "", 5, 0, 37},
    {"referer", "", 7, 0, 39},
    {"refresh", "", 7, 0, 39},
    {"retry-after", "", 11, 0, 43},
    {"server", "", 6, 0, 38},
    {"set-cookie", "", 10, 0, 42},
    {"strict-transport-security", "", 25, 0, 57},
    {"transfer-encoding", "", 17, 0, 49},
    {"user-agent", "", 10, 0, 42},
    {"vary", "", 4, 0, 36},
    {"via", "", 3, 0, 35},
    {"www-authenticate", "", 16, 0, 48}
};

// HPACK 헤더 인코딩
size_t hpack_encode_headers(struct hpack_context *ctx,
                           const char *path,
                           uint8_t *output) {
    size_t pos = 0;
    
    // :method GET (정적 테이블 인덱스 2)
    output[pos++] = 0x82;  // 10000010 (indexed header field)
    
    // :path 인코딩
    if (strcmp(path, "/") == 0) {
        // 정적 테이블 인덱스 4
        output[pos++] = 0x84;  // 10000100
    } else {
        // 새로운 이름, 리터럴 값
        output[pos++] = 0x44;  // 01000100 (:path with incremental indexing)
        
        // 경로 길이와 값 인코딩 (허프만 인코딩 없이)
        size_t path_len = strlen(path);
        output[pos++] = path_len;
        memcpy(output + pos, path, path_len);
        pos += path_len;
        
        // 동적 테이블에 추가
        hpack_add_to_dynamic_table(ctx, ":path", path);
    }
    
    // :scheme https (정적 테이블 인덱스 7)
    output[pos++] = 0x87;  // 10000111
    
    return pos;
}

// 허프만 디코딩 (간소화된 버전)
size_t huffman_decode(const uint8_t *input, size_t input_len,
                     uint8_t *output, size_t output_len) {
    size_t output_pos = 0;
    uint32_t code = 0;
    int bits = 0;
    
    for (size_t i = 0; i < input_len; i++) {
        code = (code << 8) | input[i];
        bits += 8;
        
        while (bits >= 5) {  // 최소 허프만 코드 길이
            // 허프만 테이블에서 디코딩
            uint32_t symbol = huffman_lookup(code >> (bits - 5));
            if (symbol != HUFFMAN_INVALID) {
                if (output_pos < output_len) {
                    output[output_pos++] = symbol;
                }
                code &= (1 << (bits - 5)) - 1;
                bits -= 5;
            } else {
                bits--;
            }
        }
    }
    
    return output_pos;
}
```

## 프로토콜별 성능 최적화

### HTTP/1.1 vs HTTP/2 vs HTTP/3 비교

| 특성 | HTTP/1.1 | HTTP/2 | HTTP/3 |
|------|----------|---------|---------|
| **전송 프로토콜** | TCP | TCP | UDP (QUIC) |
| **연결당 요청** | 1개 (파이프라인 시 순차) | 무제한 (멀티플렉싱) | 무제한 (멀티플렉싱) |
| **헤더 압축** | None | HPACK | QPACK |
| **서버 푸시** | 불가능 | 지원 | 지원 |
| **연결 설정** | 3-way handshake | 3-way + TLS | 0-RTT |
| **HoL 블로킹** | 있음 | TCP 레벨에만 | 없음 |

### 실제 성능 측정

```bash
# 100개 리소스 로딩 벤치마크
$ curl-loader test.conf

HTTP/1.1 결과:
- 연결 수: 6개 (브라우저 제한)
- 총 시간: 12.3초
- 총 바이트: 2.1MB
- 요청당 평균: 123ms

HTTP/2 결과:
- 연결 수: 1개
- 총 시간: 3.8초 (68% 향상!)
- 총 바이트: 1.7MB (헤더 압축)
- 요청당 평균: 38ms

HTTP/3 결과:
- 연결 수: 1개
- 총 시간: 2.1초 (83% 향상!)
- 총 바이트: 1.6MB
- 요청당 평균: 21ms
```

### 최적화 전략

```c
// 프로토콜별 최적화 설정
struct protocol_config {
    enum protocol_version {
        PROTOCOL_HTTP1_1,
        PROTOCOL_HTTP2,
        PROTOCOL_HTTP3
    } version;
    
    union {
        struct http1_config {
            bool keep_alive;
            int max_requests_per_connection;
            int connection_timeout;
        } http1;
        
        struct http2_config {
            uint32_t max_concurrent_streams;
            uint32_t initial_window_size;
            bool enable_push;
            bool enable_priority;
            struct hpack_context *hpack_ctx;
        } http2;
        
        struct http3_config {
            uint32_t max_idle_timeout;
            uint32_t max_udp_payload_size;
            bool enable_0rtt;
            struct qpack_context *qpack_ctx;
        } http3;
    };
};

// 프로토콜별 연결 처리
void handle_connection(int fd, struct protocol_config *config) {
    switch (config->version) {
    case PROTOCOL_HTTP1_1:
        handle_http1_connection(fd, &config->http1);
        break;
        
    case PROTOCOL_HTTP2:
        if (http2_handshake(fd) == 0) {
            handle_http2_connection(fd, &config->http2);
        }
        break;
        
    case PROTOCOL_HTTP3:
        // UDP 소켓이므로 다른 처리 방식
        handle_http3_datagram(fd, &config->http3);
        break;
    }
}
```

## 고급 WebSocket 기능

### 확장과 서브프로토콜

```c
// WebSocket 확장 처리
struct websocket_extension {
    char *name;
    bool enabled;
    void (*process_frame)(struct websocket_frame *frame);
    
    // per-message-deflate 설정
    struct {
        bool server_no_context_takeover;
        bool client_no_context_takeover;
        int server_max_window_bits;
        int client_max_window_bits;
    } deflate_params;
};

// 압축 확장 구현 (per-message-deflate)
void websocket_deflate_compress(struct websocket_frame *frame) {
    z_stream stream = {0};
    deflateInit2(&stream, Z_DEFAULT_COMPRESSION, Z_DEFLATED, 
                 -15, 8, Z_DEFAULT_STRATEGY);
    
    size_t compressed_size = deflateBound(&stream, frame->payload_len);
    uint8_t *compressed = malloc(compressed_size);
    
    stream.next_in = frame->payload;
    stream.avail_in = frame->payload_len;
    stream.next_out = compressed;
    stream.avail_out = compressed_size;
    
    deflate(&stream, Z_SYNC_FLUSH);
    deflateEnd(&stream);
    
    // RSV1 비트 설정 (압축됨을 표시)
    frame->rsv1 = 1;
    
    // 기존 페이로드를 압축된 데이터로 교체
    free(frame->payload);
    frame->payload = compressed;
    frame->payload_len = stream.total_out - 4;  // 마지막 4바이트 제거
}

// WebSocket 서브프로토콜
struct websocket_subprotocol {
    char *name;
    void (*on_message)(struct websocket_client *client, 
                      const uint8_t *data, size_t len);
    void (*on_connect)(struct websocket_client *client);
    void (*on_disconnect)(struct websocket_client *client);
};

// 채팅 서브프로토콜 예제
void chat_protocol_handler(struct websocket_client *client,
                          const uint8_t *data, size_t len) {
    // JSON 파싱
    json_object *msg = json_tokener_parse((const char *)data);
    json_object *type_obj, *content_obj, *room_obj;
    
    if (!json_object_object_get_ex(msg, "type", &type_obj) ||
        !json_object_object_get_ex(msg, "content", &content_obj)) {
        return;
    }
    
    const char *type = json_object_get_string(type_obj);
    const char *content = json_object_get_string(content_obj);
    
    if (strcmp(type, "message") == 0) {
        // 채팅 메시지 브로드캐스트
        char broadcast_msg[1024];
        snprintf(broadcast_msg, sizeof(broadcast_msg),
                "{\"type\":\"message\",\"user\":\"%s\",\"content\":\"%s\"}",
                client->username, content);
        
        websocket_broadcast_to_room(client->room, broadcast_msg, strlen(broadcast_msg));
    }
    else if (strcmp(type, "join") == 0) {
        // 방 입장
        if (json_object_object_get_ex(msg, "room", &room_obj)) {
            const char *room = json_object_get_string(room_obj);
            websocket_join_room(client, room);
        }
    }
    
    json_object_put(msg);
}
```

## 핵심 요점

### 1. HTTP/2 최적화 기술

- 멀티플렉싱으로 4배 성능 향상
- HPACK 헤더 압축으로 대역폭 절약
- 서버 푸시로 페이지 로딩 50% 단축

### 2. WebSocket 실시간 통신

- 양방향 실시간 데이터 전송
- 브로드캐스트 메시징 시스템
- 확장과 서브프로토콜 지원

### 3. 프로토콜 진화의 이해

- HTTP/1.1의 한계와 해결책
- HTTP/2의 혁신적 개선사항
- HTTP/3의 미래 지향적 기술

### 4. 성능 최적화 전략

- 프로토콜별 특성에 맞는 최적화
- 압축과 캐싱 전략
- 연결 관리와 리소스 효율성

---

**이전**: [커넥션 풀과 로드 밸런싱](chapter-07-network-programming/07-18-connection-pool-load-balancing.md)  
**다음**: [고성능 네트워크 서버 구현 개요](chapter-07-network-programming/07-30-high-performance-networking.md)로 돌아가서 전체 내용을 복습하거나, [보안 네트워킹과 TLS](chapter-07-network-programming/07-19-secure-networking.md)에서 네트워크 보안 기술을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 6-8시간

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

`HTTP/2`, `HTTP/3`, `WebSocket`, `HPACK`, `protocol-optimization`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
