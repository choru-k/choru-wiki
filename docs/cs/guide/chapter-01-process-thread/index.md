---
tags:
  - SystemProgramming
  - Linux
  - Performance
difficulty: INTERMEDIATE
learning_time: "15-25시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# Chapter 01: 프로세스와 스레드 - 동시성의 기초

## 이 장에서 다루는 내용

프로세스와 스레드의 생성, 관리, 동기화부터 성능 최적화와 디버깅까지 동시성 프로그래밍의 핵심을 다룹니다.

## 왜 이것을 알아야 하는가?

### 실무에서 마주치는 문제들

현대 소프트웨어 개발에서 이러한 지식은 필수입니다:

- 🚀 **성능 최적화**: 병목 구간을 정확히 파악하고 해결
- 🐛 **디버깅**: 복잡한 시스템 문제의 근본 원인 파악  
- 🔧 **아키텍처 설계**: 확장 가능하고 안정적인 시스템 구축
- 📊 **모니터링**: 시스템 상태를 정확히 파악하고 예방적 조치

## 학습 로드맵

이 장은 다음과 같은 순서로 학습하는 것을 권장합니다:

1. **기초 개념** 파악
2. **핵심 메커니즘** 이해  
3. **실무 적용** 연습
4. **고급 최적화** 기법 습득

## 📚 이 챕터의 구성

### 1.1 프로세스와 스레드 기초

- [01-01-01: 스레드 기본 개념](./01-01-01-thread-fundamentals.md)
- [01-01-02: 프로세스 상태와 라이프사이클](./01-01-02-process-state-fundamentals.md)
- [01-01-03: 기본 스케줄링 원리](./01-01-03-scheduling-fundamentals.md)
- [01-01-04: 시그널 기초](./01-01-04-signals-basics.md)

### 1.2 프로세스 생성과 관리

- [01-02-01: 프로세스 생성 개요](./01-02-01-process-creation.md)
- [01-02-02: fork() 시스템 콜](./01-02-02-process-creation-fork.md)
- [01-02-03: exec() 프로그램 교체](./01-02-03-program-replacement-exec.md)
- [01-02-04: 프로세스 종료와 좀비](./01-02-04-process-termination-zombies.md)

### 1.3 스레드 동기화와 통신

- [01-03-01: 뮤텍스 기초](./01-03-01-mutex-basics.md)
- [01-03-02: 스레드 동기화](./01-03-02-thread-synchronization.md)
- [01-03-03: 세마포어와 조건변수](./01-03-03-semaphore-condvar.md)
- [01-03-04: 고급 락킹 기법](./01-03-04-advanced-locking.md)
- [01-03-05: 시그널 IPC](./01-03-05-signal-ipc.md)
- [01-03-06: 소켓 고급 IPC](./01-03-06-sockets-advanced-ipc.md)

### 1.4 고급 스케줄링과 성능

- [01-04-01: 스케줄링 심화](./01-04-01-scheduling.md)
- [01-04-02: CFS 구현](./01-04-02-cfs-implementation.md)
- [01-04-03: 실시간 스케줄링](./01-04-03-realtime-scheduling.md)
- [01-04-04: CPU 친화성](./01-04-04-cpu-affinity.md)

### 1.5 디버깅과 모니터링

- [01-05-01: 프로세스 관리 모니터링](./01-05-01-process-management-monitoring.md)
- [01-05-02: 실용적 디버깅](./01-05-02-practical-debugging.md)
- [01-05-03: 성능 시각화](./01-05-03-performance-visualization.md)
- [01-05-04: 최적화 전략](./01-05-04-optimization-strategies.md)
- [01-05-05: 프로세스 상태 분석](./01-05-05-process-state-analysis.md)
- [01-05-06: D-state 디버깅](./01-05-06-dstate-debugging.md)
- [01-05-07: 스레드 동기화 디버깅](./01-05-07-thread-synchronization-debugging.md)
- [01-05-08: 시그널 처리 디버깅](./01-05-08-signal-handling-debugging.md)

### 1.6 고급 IPC와 추가 기능

- [01-06-01: Python 고급 매니저](./01-06-01-python-advanced-manager.md)
- [01-06-02: 파이프와 FIFO](./01-06-02-pipes-fifos.md)
- [01-06-03: 메시지 큐와 공유 메모리](./01-06-03-message-queues-shared-memory.md)
- [01-06-04: 좀비 프로세스 처리](./01-06-04-zombie-process-handling.md)
- [01-06-05: CPU 친화성 스크립트](./01-06-05-cpu-affinity-scripts.md)
- [01-06-06: 프로세스 회계](./01-06-06-process-accounting.md)
- [01-06-07: CPU 친화성 기초](./01-06-07-cpu-affinity-fundamentals.md)

## 🔗 관련 챕터

### 📚 시스템 프로그래밍 기초

- [Chapter 02: CPU와 인터럽트](../chapter-02-cpu-interrupt/index.md)
- [Chapter 03: 메모리 시스템](../chapter-03-memory-system/index.md)
- [Chapter 04: 시스템콜과 커널](../chapter-04-syscall-kernel/index.md)
- [Chapter 05: 컴파일러와 링커](../chapter-05-compiler-linker/index.md)

### 🚀 성능 관련  

- [Chapter 11: 성능 최적화](../chapter-11-performance-optimization/index.md)

### 🔧 고급 주제

- [Chapter 17: 보안 엔지니어링](../chapter-17-security-engineering/index.md)
