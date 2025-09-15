---
tags:
  - Network
  - UDP
  - Raw Socket
  - Broadcast
  - Multicast
---

# Chapter 7-1C: UDP와 Raw 소켓 프로그래밍

## 📮 UDP: 편지 주고받기

UDP는 TCP와 완전히 다른 철학입니다:

**TCP**: "안녕? 잘 들려? 응답해줘!" (핸드셰이크)
**UDP**: "안녕!" (끝)

제가 게임 서버를 만들 때 배운 교훈:

```c
// FPS 게임의 위치 업데이트
// TCP 사용 시: 지연 50ms, 끊김 현상
// UDP 사용 시: 지연 5ms, 가끔 패킷 손실 (보간으로 해결)
```

UDP가 적합한 경우:

- 실시간 게임 (위치 업데이트)
- 동영상 스트리밍 (늦은 프레임보다 건너뛰기가 나음)
- DNS 쿼리 (단순한 요청-응답)
- 로그 전송 (손실 감수 가능)

## UDP 서버와 클라이언트

```c
// UDP 에코 서버
void udp_echo_server(uint16_t port) {
    int sock_fd;
    struct sockaddr_in server_addr, client_addr;
    char buffer[BUFFER_SIZE];
    
    // UDP 소켓 생성
    sock_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock_fd < 0) {
        perror("socket");
        return;
    }
    
    // 주소 재사용
    int opt = 1;
    setsockopt(sock_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    
    // 바인드
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(port);
    
    if (bind(sock_fd, (struct sockaddr *)&server_addr,
             sizeof(server_addr)) < 0) {
        perror("bind");
        close(sock_fd);
        return;
    }
    
    printf("UDP server listening on port %u\n", port);
    
    // 메시지 수신 및 에코
    while (1) {
        socklen_t client_len = sizeof(client_addr);
        
        // recvfrom: 송신자 주소도 함께 수신
        ssize_t n = recvfrom(sock_fd, buffer, sizeof(buffer) - 1, 0,
                            (struct sockaddr *)&client_addr, &client_len);
        
        if (n < 0) {
            if (errno == EINTR)
                continue;
            perror("recvfrom");
            break;
        }
        
        buffer[n] = '\0';
        
        char addr_str[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &client_addr.sin_addr, addr_str, sizeof(addr_str));
        printf("Received %zd bytes from %s:%u: %s\n",
               n, addr_str, ntohs(client_addr.sin_port), buffer);
        
        // 에코백
        if (sendto(sock_fd, buffer, n, 0,
                  (struct sockaddr *)&client_addr, client_len) < 0) {
            perror("sendto");
        }
    }
    
    close(sock_fd);
}

// UDP 클라이언트
void udp_client(const char *server_addr, uint16_t server_port) {
    int sock_fd;
    struct sockaddr_in server;
    char buffer[BUFFER_SIZE];
    
    sock_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock_fd < 0) {
        perror("socket");
        return;
    }
    
    memset(&server, 0, sizeof(server));
    server.sin_family = AF_INET;
    server.sin_port = htons(server_port);
    inet_pton(AF_INET, server_addr, &server.sin_addr);
    
    // Connected UDP 소켓 (선택적)
    // connect를 호출하면 send/recv 사용 가능
    if (connect(sock_fd, (struct sockaddr *)&server, sizeof(server)) < 0) {
        perror("connect");
        close(sock_fd);
        return;
    }
    
    // 메시지 송수신
    const char *message = "Hello, UDP Server!";
    
    // connected 소켓이므로 send 사용 가능
    if (send(sock_fd, message, strlen(message), 0) < 0) {
        perror("send");
        close(sock_fd);
        return;
    }
    
    // 응답 수신
    ssize_t n = recv(sock_fd, buffer, sizeof(buffer) - 1, 0);
    if (n > 0) {
        buffer[n] = '\0';
        printf("Received: %s\n", buffer);
    }
    
    close(sock_fd);
}
```

## 🌐 UDP 브로드캐스트와 멀티캐스트

### UDP 브로드캐스트

브로드캐스트는 같은 네트워크의 모든 호스트에게 메시지를 전송합니다:

```c
// UDP 브로드캐스트
void udp_broadcast(uint16_t port, const char *message) {
    int sock_fd;
    struct sockaddr_in broadcast_addr;
    
    sock_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock_fd < 0) {
        perror("socket");
        return;
    }
    
    // 브로드캐스트 허용
    int broadcast_enable = 1;
    if (setsockopt(sock_fd, SOL_SOCKET, SO_BROADCAST,
                   &broadcast_enable, sizeof(broadcast_enable)) < 0) {
        perror("setsockopt SO_BROADCAST");
        close(sock_fd);
        return;
    }
    
    memset(&broadcast_addr, 0, sizeof(broadcast_addr));
    broadcast_addr.sin_family = AF_INET;
    broadcast_addr.sin_port = htons(port);
    broadcast_addr.sin_addr.s_addr = INADDR_BROADCAST;  // 255.255.255.255
    
    if (sendto(sock_fd, message, strlen(message), 0,
              (struct sockaddr *)&broadcast_addr,
              sizeof(broadcast_addr)) < 0) {
        perror("sendto");
    } else {
        printf("Broadcast sent to port %u\n", port);
    }
    
    close(sock_fd);
}
```

### UDP 멀티캐스트

멀티캐스트는 특정 그룹에 속한 호스트들에게만 메시지를 전송합니다:

```c
// UDP 멀티캐스트 송신자
void udp_multicast_sender(const char *mcast_addr, uint16_t port) {
    int sock_fd;
    struct sockaddr_in mcast_group;
    
    sock_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock_fd < 0) {
        perror("socket");
        return;
    }
    
    // TTL 설정 (멀티캐스트 범위)
    unsigned char ttl = 1;  // 로컬 네트워크만
    setsockopt(sock_fd, IPPROTO_IP, IP_MULTICAST_TTL, &ttl, sizeof(ttl));
    
    // 루프백 비활성화 (자신에게 전송 안 함)
    unsigned char loop = 0;
    setsockopt(sock_fd, IPPROTO_IP, IP_MULTICAST_LOOP, &loop, sizeof(loop));
    
    memset(&mcast_group, 0, sizeof(mcast_group));
    mcast_group.sin_family = AF_INET;
    mcast_group.sin_port = htons(port);
    inet_pton(AF_INET, mcast_addr, &mcast_group.sin_addr);
    
    const char *message = "Multicast message";
    if (sendto(sock_fd, message, strlen(message), 0,
              (struct sockaddr *)&mcast_group,
              sizeof(mcast_group)) < 0) {
        perror("sendto");
    }
    
    close(sock_fd);
}

void udp_multicast_receiver(const char *mcast_addr, uint16_t port) {
    int sock_fd;
    struct sockaddr_in local_addr;
    struct ip_mreq mreq;
    
    sock_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock_fd < 0) {
        perror("socket");
        return;
    }
    
    // 주소 재사용 (여러 프로세스가 같은 멀티캐스트 수신)
    int reuse = 1;
    setsockopt(sock_fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    
    // 로컬 주소 바인드
    memset(&local_addr, 0, sizeof(local_addr));
    local_addr.sin_family = AF_INET;
    local_addr.sin_port = htons(port);
    local_addr.sin_addr.s_addr = INADDR_ANY;
    
    if (bind(sock_fd, (struct sockaddr *)&local_addr,
             sizeof(local_addr)) < 0) {
        perror("bind");
        close(sock_fd);
        return;
    }
    
    // 멀티캐스트 그룹 가입
    inet_pton(AF_INET, mcast_addr, &mreq.imr_multiaddr);
    mreq.imr_interface.s_addr = INADDR_ANY;
    
    if (setsockopt(sock_fd, IPPROTO_IP, IP_ADD_MEMBERSHIP,
                   &mreq, sizeof(mreq)) < 0) {
        perror("setsockopt IP_ADD_MEMBERSHIP");
        close(sock_fd);
        return;
    }
    
    // 멀티캐스트 수신
    char buffer[BUFFER_SIZE];
    struct sockaddr_in sender_addr;
    socklen_t sender_len = sizeof(sender_addr);
    
    ssize_t n = recvfrom(sock_fd, buffer, sizeof(buffer) - 1, 0,
                        (struct sockaddr *)&sender_addr, &sender_len);
    if (n > 0) {
        buffer[n] = '\0';
        printf("Received multicast: %s\n", buffer);
    }
    
    // 멀티캐스트 그룹 탈퇴
    setsockopt(sock_fd, IPPROTO_IP, IP_DROP_MEMBERSHIP,
              &mreq, sizeof(mreq));
    
    close(sock_fd);
}
```

## 🔬 Raw 소켓과 패킷 캡처

### Raw 소켓: 네트워크의 현미경

Raw 소켓은 네트워크의 "해커 모드"입니다. 모든 패킷을 직접 만들고 분석할 수 있죠.

제가 네트워크 문제를 디버깅할 때 만든 도구:

```bash
# "왜 연결이 안 되지?" 할 때
$ sudo ./my_packet_sniffer
SYN sent to 192.168.1.100:80
RST received - 포트가 닫혀있음!
# 아, 방화벽 문제구나!
```

⚠️ 주의: Raw 소켓은 root 권한이 필요합니다. 큰 힘에는 큰 책임이...

### ICMP Ping 구현

```c
// ICMP Ping 구현
#include <netinet/ip_icmp.h>

struct ping_packet {
    struct icmphdr header;
    char data[64 - sizeof(struct icmphdr)];
};

// 체크섬 계산
uint16_t calculate_checksum(void *data, int len) {
    uint16_t *buf = data;
    uint32_t sum = 0;
    
    while (len > 1) {
        sum += *buf++;
        len -= 2;
    }
    
    if (len == 1) {
        sum += *(uint8_t *)buf;
    }
    
    sum = (sum >> 16) + (sum & 0xFFFF);
    sum += (sum >> 16);
    
    return (uint16_t)(~sum);
}

int send_ping(const char *dest_addr) {
    int sock_fd;
    struct sockaddr_in dest;
    struct ping_packet packet;
    
    // Raw 소켓 생성 (루트 권한 필요)
    sock_fd = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP);
    if (sock_fd < 0) {
        perror("socket");
        return -1;
    }
    
    // 목적지 설정
    memset(&dest, 0, sizeof(dest));
    dest.sin_family = AF_INET;
    inet_pton(AF_INET, dest_addr, &dest.sin_addr);
    
    // ICMP 패킷 구성
    memset(&packet, 0, sizeof(packet));
    packet.header.type = ICMP_ECHO;
    packet.header.code = 0;
    packet.header.un.echo.id = getpid();
    packet.header.un.echo.sequence = 1;
    
    // 데이터 채우기
    strcpy(packet.data, "Hello, ICMP!");
    
    // 체크섬 계산
    packet.header.checksum = 0;
    packet.header.checksum = calculate_checksum(&packet, sizeof(packet));
    
    // 패킷 전송
    if (sendto(sock_fd, &packet, sizeof(packet), 0,
              (struct sockaddr *)&dest, sizeof(dest)) < 0) {
        perror("sendto");
        close(sock_fd);
        return -1;
    }
    
    printf("Ping sent to %s\n", dest_addr);
    
    // 응답 수신
    char recv_buffer[1024];
    struct sockaddr_in from;
    socklen_t from_len = sizeof(from);
    
    ssize_t n = recvfrom(sock_fd, recv_buffer, sizeof(recv_buffer), 0,
                        (struct sockaddr *)&from, &from_len);
    
    if (n > 0) {
        struct iphdr *ip_header = (struct iphdr *)recv_buffer;
        int ip_header_len = ip_header->ihl * 4;
        
        struct icmphdr *icmp_header = (struct icmphdr *)(recv_buffer + 
                                                         ip_header_len);
        
        if (icmp_header->type == ICMP_ECHOREPLY) {
            printf("Ping reply received from %s\n", dest_addr);
        }
    }
    
    close(sock_fd);
    return 0;
}
```

### 패킷 스니퍼 구현

```c
// 패킷 스니퍼
void packet_sniffer(void) {
    int sock_fd;
    char buffer[65536];
    
    // 모든 패킷 캡처 (루트 권한 필요)
    sock_fd = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));
    if (sock_fd < 0) {
        perror("socket");
        return;
    }
    
    // Promiscuous 모드 설정
    struct ifreq ifr;
    strcpy(ifr.ifr_name, "eth0");
    ioctl(sock_fd, SIOCGIFFLAGS, &ifr);
    ifr.ifr_flags |= IFF_PROMISC;
    ioctl(sock_fd, SIOCSIFFLAGS, &ifr);
    
    while (1) {
        ssize_t n = recv(sock_fd, buffer, sizeof(buffer), 0);
        if (n < 0) {
            perror("recv");
            break;
        }
        
        // 이더넷 헤더
        struct ethhdr *eth = (struct ethhdr *)buffer;
        
        printf("Ethernet: %.2x:%.2x:%.2x:%.2x:%.2x:%.2x -> "
               "%.2x:%.2x:%.2x:%.2x:%.2x:%.2x\n",
               eth->h_source[0], eth->h_source[1], eth->h_source[2],
               eth->h_source[3], eth->h_source[4], eth->h_source[5],
               eth->h_dest[0], eth->h_dest[1], eth->h_dest[2],
               eth->h_dest[3], eth->h_dest[4], eth->h_dest[5]);
        
        // IP 패킷인 경우
        if (ntohs(eth->h_proto) == ETH_P_IP) {
            struct iphdr *ip = (struct iphdr *)(buffer + sizeof(struct ethhdr));
            
            char src_ip[INET_ADDRSTRLEN], dst_ip[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &ip->saddr, src_ip, sizeof(src_ip));
            inet_ntop(AF_INET, &ip->daddr, dst_ip, sizeof(dst_ip));
            
            printf("IP: %s -> %s, Protocol: %d\n",
                   src_ip, dst_ip, ip->protocol);
            
            // TCP 패킷인 경우
            if (ip->protocol == IPPROTO_TCP) {
                struct tcphdr *tcp = (struct tcphdr *)(buffer + 
                                                       sizeof(struct ethhdr) +
                                                       ip->ihl * 4);
                printf("TCP: Port %u -> %u, Flags: ",
                       ntohs(tcp->source), ntohs(tcp->dest));
                
                if (tcp->syn) printf("SYN ");
                if (tcp->ack) printf("ACK ");
                if (tcp->fin) printf("FIN ");
                if (tcp->rst) printf("RST ");
                if (tcp->psh) printf("PSH ");
                printf("\n");
            }
        }
        
        printf("---\n");
    }
    
    // Promiscuous 모드 해제
    ioctl(sock_fd, SIOCGIFFLAGS, &ifr);
    ifr.ifr_flags &= ~IFF_PROMISC;
    ioctl(sock_fd, SIOCSIFFLAGS, &ifr);
    
    close(sock_fd);
}
```

## 🎮 실시간 게임에서의 UDP 활용

### 게임 패킷 구조 설계

```c
// 게임 패킷 정의
enum packet_type {
    PACKET_PLAYER_MOVE = 1,
    PACKET_PLAYER_SHOOT = 2,
    PACKET_GAME_STATE = 3,
    PACKET_HEARTBEAT = 4
};

struct game_packet {
    uint32_t packet_id;        // 패킷 ID (중복 탐지용)
    uint32_t timestamp;        // 타임스탬프
    uint8_t packet_type;       // 패킷 타입
    uint8_t player_id;         // 플레이어 ID
    uint16_t data_size;        // 데이터 크기
    char data[];               // 가변 길이 데이터
} __attribute__((packed));

struct player_move_data {
    float x, y, z;             // 위치
    float vx, vy, vz;          // 속도
    uint16_t direction;        // 방향
} __attribute__((packed));

// 게임 서버 - 위치 업데이트 처리
void handle_player_move(int sock_fd, struct sockaddr_in *client_addr,
                       struct game_packet *packet) {
    struct player_move_data *move_data = 
        (struct player_move_data *)packet->data;
    
    // 클라이언트 위치 검증 (치트 방지)
    if (!is_valid_position(move_data->x, move_data->y, move_data->z)) {
        printf("Invalid position from player %d\n", packet->player_id);
        return;
    }
    
    // 게임 상태 업데이트
    update_player_position(packet->player_id, move_data);
    
    // 다른 플레이어들에게 브로드캐스트
    broadcast_to_nearby_players(packet->player_id, packet, sizeof(*packet) + 
                               packet->data_size);
}

// 패킷 손실 감지 및 보정
void process_game_packet(struct game_packet *packet) {
    static uint32_t last_packet_id = 0;
    
    // 패킷 순서 확인
    if (packet->packet_id <= last_packet_id) {
        // 중복 또는 구 패킷 - 무시
        return;
    }
    
    // 패킷 손실 감지
    if (packet->packet_id > last_packet_id + 1) {
        uint32_t lost_count = packet->packet_id - last_packet_id - 1;
        printf("Lost %u packets\n", lost_count);
        
        // 손실 패킷 보정 (보간법 사용)
        interpolate_missing_data(last_packet_id + 1, packet->packet_id - 1);
    }
    
    last_packet_id = packet->packet_id;
}
```

### 신뢰성 보장을 위한 하이브리드 접근

```c
// 중요한 이벤트는 TCP로, 위치는 UDP로
struct game_connection {
    int tcp_sock;    // 중요한 명령 (아이템 획득, 채팅)
    int udp_sock;    // 위치 업데이트, 애니메이션
    struct sockaddr_in server_addr;
};

// TCP로 중요한 명령 전송
void send_critical_command(struct game_connection *conn, 
                          const void *data, size_t len) {
    if (send(conn->tcp_sock, data, len, MSG_NOSIGNAL) < 0) {
        perror("TCP send failed");
        // 재연결 로직
        reconnect_tcp(conn);
    }
}

// UDP로 위치 업데이트 전송
void send_position_update(struct game_connection *conn,
                         const struct player_move_data *move) {
    struct game_packet packet = {
        .packet_id = generate_packet_id(),
        .timestamp = get_game_time(),
        .packet_type = PACKET_PLAYER_MOVE,
        .player_id = get_player_id(),
        .data_size = sizeof(*move)
    };
    
    char buffer[sizeof(packet) + sizeof(*move)];
    memcpy(buffer, &packet, sizeof(packet));
    memcpy(buffer + sizeof(packet), move, sizeof(*move));
    
    sendto(conn->udp_sock, buffer, sizeof(buffer), 0,
           (struct sockaddr *)&conn->server_addr,
           sizeof(conn->server_addr));
}
```

## 핵심 요점

### 1. UDP vs TCP 선택 기준

- **UDP**: 속도 중요, 손실 허용 가능 (게임, 스트리밍)
- **TCP**: 신뢰성 중요, 순서 보장 필요 (파일 전송, 웹)
- **하이브리드**: 중요도에 따라 프로토콜 분리 사용

### 2. 브로드캐스트와 멀티캐스트

- 브로드캐스트: 로컬 네트워크 전체 (255.255.255.255)
- 멀티캐스트: 특정 그룹 (224.0.0.0 ~ 239.255.255.255)
- TTL 설정으로 전파 범위 제어

### 3. Raw 소켓 활용

- 패킷 분석과 네트워크 진단에 유용
- Root 권한 필요, 보안에 주의
- ICMP, custom 프로토콜 구현 가능

---

**이전**: [TCP 소켓 프로그래밍](01b-tcp-programming.md)  
**다음**: [소켓 옵션과 Unix 도메인 소켓](01d-socket-options-unix.md)에서 성능 최적화와 로컬 통신을 학습합니다.
