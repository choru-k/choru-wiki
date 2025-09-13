---
tags:
  - Network
  - Socket
  - TCP/IP
  - System Programming
  - Linux
  - Overview
---

# Chapter 7-1: 소켓 프로그래밍의 기초 개요

## 🎯 소켓 프로그래밍: 인터넷을 움직이는 핵심 기술

1983년 UC 버클리에서 Bill Joy가 만든 소켓 API는 40년이 지난 지금도 모든 네트워크 통신의 기초입니다. 파일을 읽듯이 네트워크 통신을 할 수 있게 해주는 이 혁신적인 추상화로 인해 인터넷이 탄생할 수 있었습니다.

```c
// 파일 읽기와 동일한 패턴
int fd = open("file.txt", O_RDONLY);
read(fd, buffer, 1024);
close(fd);

// 네트워크 통신
int sock = socket(AF_INET, SOCK_STREAM, 0);
connect(sock, &addr, sizeof(addr));
read(sock, buffer, 1024);
close(sock);
```

## 📚 학습 로드맵

이 섹션은 4개의 전문화된 문서로 구성되어 있습니다:

### 1️⃣ [소켓의 개념과 기본 구조](01a-socket-fundamentals.md)

- 소켓 도메인과 타입의 분류
- 주소 구조체 시스템 (sockaddr, sockaddr_in, sockaddr_in6)
- 네트워크 바이트 순서 변환 (htons/ntohs)
- 소켓 생성과 바인드 과정

### 2️⃣ [TCP 소켓 프로그래밍](01b-tcp-programming.md)

- TCP 서버 구현의 모든 단계 (socket → bind → listen → accept)
- 클라이언트 연결과 비블로킹 모드
- 실전 에러 처리와 성능 최적화
- 멀티프로세스 서버 구현

### 3️⃣ [UDP와 Raw 소켓 프로그래밍](01c-udp-raw-sockets.md)

- UDP 프로그래밍 (단순하지만 강력한)
- 브로드캐스트와 멀티캐스트 구현
- Raw 소켓으로 패킷 분석 (ICMP ping, 패킷 스니퍼)
- 실시간 통신에서의 UDP 활용

### 4️⃣ [소켓 옵션과 Unix 도메인 소켓](01d-socket-options-unix.md)

- SO_REUSEADDR, TCP_NODELAY 등 성능 최적화 옵션
- 소켓 상태 모니터링과 디버깅
- Unix 도메인 소켓의 고성능 로컬 통신
- 파일 디스크립터 전달 (SCM_RIGHTS)

## 🎯 핵심 개념 비교표

| 소켓 타입 | 프로토콜 | 신뢰성 | 속도 | 적합한 용도 |
|-----------|----------|---------|------|-------------|
| **TCP** | SOCK_STREAM | 높음 | 보통 | 웹서버, API, 파일전송 |
| **UDP** | SOCK_DGRAM | 낮음 | 높음 | 게임, 스트리밍, DNS |
| **Raw Socket** | SOCK_RAW | 직접제어 | 높음 | 패킷분석, 모니터링 |
| **Unix Socket** | SOCK_STREAM | 높음 | 매우높음 | 로컬 IPC, Docker |

## 🚀 실전 활용 시나리오

### 웹 서비스 개발

- TCP 소켓으로 HTTP 서버 구현
- SO_REUSEADDR로 무중단 배포 지원
- Keep-alive로 연결 재사용 최적화

### 게임 서버 개발

- UDP로 실시간 위치 업데이트 (지연 5ms)
- TCP로 중요한 게임 상태 동기화
- 멀티캐스트로 방 단위 브로드캐스트

### 시스템 모니터링

- Raw 소켓으로 패킷 캡처 및 분석
- Unix 소켓으로 고성능 로컬 통신
- 실시간 네트워크 상태 모니터링

## 🎭 학습 전략

### 초보자 (추천 순서)

1. [소켓 기본 개념](01a-socket-fundamentals.md) → 이론적 기초 다지기
2. [TCP 프로그래밍](01b-tcp-programming.md) → 실제 서버/클라이언트 구현
3. 간단한 에코 서버 만들어 보기

### 중급자 (심화 학습)

1. [UDP와 Raw 소켓](01c-udp-raw-sockets.md) → 다양한 프로토콜 활용
2. [소켓 옵션](01d-socket-options-unix.md) → 성능 최적화 기법
3. 실제 프로덕션 환경에 적용

### 고급자 (성능 최적화)

- 비블로킹 I/O와 epoll을 활용한 고성능 서버
- SO_REUSEPORT를 이용한 멀티프로세스 로드밸런싱
- TCP/IP 스택 커널 파라미터 튜닝

## 🔗 연관 학습

### 선행 학습

- [프로세스와 스레드](../chapter-04-process-thread/01-process-creation.md) - fork()와 멀티프로세싱 이해
- [파일 시스템](../chapter-06-file-io/01-file-descriptor.md) - 파일 디스크립터 개념

### 후속 학습  

- [TCP/IP 스택 구현](02-tcp-ip-stack.md) - 커널 레벨 네트워킹의 심화
- [비동기 프로그래밍](../chapter-08-async-programming/01-promise-future.md) - 논블로킹 I/O 패턴

## 🛠️ 실습 환경 준비

```bash
# 필수 개발 도구
sudo apt-get install build-essential netcat tcpdump wireshark

# 소켓 디버깅 도구
sudo apt-get install lsof strace ss

# 네트워크 테스트 도구  
sudo apt-get install telnet nmap
```

### 주요 디버깅 명령어

```bash
# 포트 사용 확인
lsof -i :8080
ss -tlnp | grep 8080

# 패킷 캡처
tcpdump -i any port 8080

# 연결 테스트  
telnet localhost 8080
nc -v localhost 8080
```

## 💪 실전 팁 요약

10년간 네트워크 프로그래밍을 하며 배운 핵심 교훈:

1. **항상 에러 처리**: 네트워크는 실패가 일상
2. **바이트 순서 주의**: htons/ntohs 잊지 말기
3. **타임아웃 설정**: 무한 대기는 재앙의 시작
4. **버퍼 크기 튜닝**: 기본값은 대부분 너무 작음
5. **재연결 로직**: 연결은 언제든 끊어질 수 있음

---

**다음**: 소켓의 기본 개념과 주소 구조체를 이해하기 위해 [소켓의 개념과 기본 구조](01a-socket-fundamentals.md)부터 시작하세요.
