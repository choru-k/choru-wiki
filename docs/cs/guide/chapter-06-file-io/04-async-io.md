---
tags:
  - Async I/O
  - Event-driven
  - epoll
  - io_uring
  - Reactor Pattern
  - Overview
---

# Chapter 6-4: 비동기 I/O와 이벤트 기반 프로그래밍 개요

## 🎯 C10K 문제에서 io_uring까지: 비동기 I/O의 진화

비동기 I/O와 이벤트 기반 프로그래밍은 현대 고성능 서버 개발의 핵심입니다. 수천, 수만 개의 동시 연결을 효율적으로 처리하기 위한 기술들의 진화 과정과 실제 구현 방법을 다룹니다.

## 📚 학습 로드맵

이 섹션은 6개의 전문화된 문서로 구성되어 있습니다:

### 1️⃣ [기본 개념과 C10K 문제](04a-async-io-fundamentals.md)

- 동기 vs 비동기 I/O의 근본적 차이점
- C10K 문제의 배경과 해결 필요성  
- nginx vs Apache 성능 비교 실례
- 이벤트 기반 아키텍처의 등장 배경

### 2️⃣ [I/O 멀티플렉싱: select, poll, epoll](04b-io-multiplexing-evolution.md)

- select: 1983년 BSD의 혁명적 아이디어
- poll: System V의 select 개선점
- epoll: 리눅스의 O(1) 혁신
- Edge-Triggered vs Level-Triggered 모드
- 실제 성능 벤치마크와 구현 예제

### 3️⃣ [io_uring: 차세대 비동기 I/O](04c-io-uring-implementation.md)

- io_uring 아키텍처와 설계 철학
- Submission Queue와 Completion Queue 메커니즘
- 링크된 연산과 멀티샷 기능
- 버퍼 선택과 zero-copy 구현
- 고성능 서버 구현 실예

### 4️⃣ [리액터 패턴 구현](04d-reactor-pattern.md)

- 리액터 패턴의 핵심 아키텍처
- 이벤트 핸들러와 Demultiplexer 설계
- 타이머와 스레드 풀 통합
- HTTP 서버 구현 예제
- 실제 프로덕션 최적화 기법

### 5️⃣ [프로액터 패턴과 Windows IOCP](04e-proactor-iocp.md)

- 프로액터 vs 리액터 패턴 비교
- Windows I/O Completion Port 구현
- AcceptEx와 오버랩 I/O
- 워커 스레드 관리 전략
- 크로스 플랫폼 비동기 I/O 설계

### 6️⃣ [고성능 네트워크 최적화](04f-network-optimization.md)

- Zero-copy 기법: sendfile, splice
- TCP 최적화와 소켓 튜닝
- TCP Fast Open과 최신 기법
- 네트워크 성능 프로파일링
- 실전 배포 시 고려사항

## 🎯 핵심 개념 비교표

| 기술 | 복잡도 | 최대 연결 | 메모리 사용 | 시스템콜 오버헤드 |
|------|--------|-----------|-------------|-----------------|
| **select** | O(n) | ~1024 | 고정 | 높음 |
| **poll** | O(n) | 무제한 | 동적 | 높음 |
| **epoll** | O(1) | 수만 개 | 최적화 | 낮음 |
| **io_uring** | O(1) | 수십만 개 | 최소 | 최소 |

## 🚀 실전 활용 시나리오

### 웹 서버 개발

- nginx: epoll 기반 이벤트 루프
- Apache: select/poll에서 epoll로 진화
- 성능 차이: 17배 처리량, 1/166 메모리 사용

### 데이터베이스 엔진

- PostgreSQL: io_uring 도입으로 I/O 성능 향상
- ScyllaDB: seastar 프레임워크의 고급 비동기 패턴

### 실시간 서비스

- 게임 서버: 수만 동시 접속자 처리
- 채팅 서버: WebSocket 연결 최적화
- IoT 플랫폼: 대규모 센서 데이터 수집

## 🎭 학습 전략

### 초보자 (추천 순서)

1. [기본 개념](04a-async-io-fundamentals.md) → 동기/비동기 차이 이해
2. [select/poll/epoll](04b-io-multiplexing-evolution.md) → 기본적 이벤트 루프 구현
3. [리액터 패턴](04d-reactor-pattern.md) → 실용적 서버 아키텍처

### 중급자 (심화 학습)

1. [io_uring](04c-io-uring-implementation.md) → 최신 비동기 I/O 기법
2. [프로액터 패턴](04e-proactor-iocp.md) → 고급 비동기 아키텍처
3. [네트워크 최적화](04f-network-optimization.md) → 성능 튜닝 기법

### 전문가 (마스터리)

- 모든 문서를 순차적으로 학습
- 각 기법의 trade-off와 적용 시나리오 비교
- 실제 프로덕션 환경에서의 성능 최적화

## 🔗 연관 학습

### 선행 학습

- [Chapter 6-1: 파일 디스크립터와 I/O](01-file-descriptor.md)
- [Chapter 6-2: VFS와 파일시스템](02-vfs-filesystem.md)

### 후속 학습  

- [Chapter 7: 네트워크 프로그래밍](../chapter-07-network-programming/01-socket-basics.md)
- [Chapter 8: 비동기 프로그래밍](../chapter-08-async-programming/01-promise-future.md)

---

**다음**: [기본 개념과 C10K 문제](04a-async-io-fundamentals.md)에서 비동기 I/O의 기초를 학습합니다.
