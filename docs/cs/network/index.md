---
tags:
  - Network
  - Linux
  - Performance
---

# Network Programming

네트워크 프로그래밍과 고성능 I/O에 관한 핵심 개념들을 다룹니다.

## 주요 주제

### Socket Programming 기초
- [Socket Programming: 네트워크 통신의 핵심 기술](socket.md)

### I/O 멀티플렉싱
- [epoll: Linux 고성능 I/O 멀티플렉싱의 핵심](epoll.md)

### 추후 추가 예정
- 비동기 I/O와 이벤트 루프
- 네트워크 성능 최적화
- Load Balancing 구현
- WebSocket과 실시간 통신
- HTTP/2와 gRPC 프로토콜

## 학습 순서 권장

1. **기초**: Socket Programming → File Descriptor
2. **멀티플렉싱**: select/poll → epoll → kqueue
3. **고급**: 비동기 I/O → Event Loop → 성능 최적화
4. **실전**: 웹서버 구현 → 로드밸런서 → 마이크로서비스

네트워크 프로그래밍은 시스템 프로그래밍의 핵심이며, 특히 서버 개발에서 필수적인 지식입니다.