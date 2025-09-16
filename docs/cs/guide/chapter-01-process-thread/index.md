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

- [04-01: Thread Fundamentals](./04-01-thread-fundamentals.md)
- [04-02: Mutex Basics](./04-02-mutex-basics.md)
- [04-03: Scheduling Fundamentals](./04-03-scheduling-fundamentals.md)
- [04-04: Signals Basics](./04-04-signals-basics.md)
- [04-05: Process State Fundamentals](./04-05-process-state-fundamentals.md)
- [04-06: Cpu Affinity Fundamentals](./04-06-cpu-affinity-fundamentals.md)

### 1.2 프로세스 생성과 동기화

- [04-10: Process Creation](./04-10-process-creation.md)
- [04-11: Process Creation Fork](./04-11-process-creation-fork.md)
- [04-12: Program Replacement Exec](./04-12-program-replacement-exec.md)
- [04-13: Process Termination Zombies](./04-13-process-termination-zombies.md)
- [04-14: Thread Synchronization](./04-14-thread-synchronization.md)
- [04-15: Semaphore Condvar](./04-15-semaphore-condvar.md)
- [04-16: Scheduling](./04-16-scheduling.md)
- [04-17: Cfs Implementation](./04-17-cfs-implementation.md)
- [04-18: Realtime Scheduling](./04-18-realtime-scheduling.md)
- [04-19: Signal Ipc](./04-19-signal-ipc.md)
- [04-20: Advanced Locking](./04-20-advanced-locking.md)
- [04-21: Sockets Advanced Ipc](./04-21-sockets-advanced-ipc.md)
- [04-22: Python Advanced Manager](./04-22-python-advanced-manager.md)
- [04-44: Thread Synchronization Debugging](./04-44-thread-synchronization-debugging.md)

### 1.3 CPU 관리와 최적화

- [04-06: Cpu Affinity Fundamentals](./04-06-cpu-affinity-fundamentals.md)
- [04-30: Cpu Affinity](./04-30-cpu-affinity.md)
- [04-31: Performance Visualization](./04-31-performance-visualization.md)
- [04-32: Optimization Strategies](./04-32-optimization-strategies.md)
- [07b-cpu: Affinity Scripts](./07b-cpu-affinity-scripts.md)

### 1.4 프로세스 모니터링과 디버깅

- [04-40: Process Management Monitoring](./04-40-process-management-monitoring.md)
- [04-41: Practical Debugging](./04-41-practical-debugging.md)
- [04-42: Process State Analysis](./04-42-process-state-analysis.md)
- [04-43: Dstate Debugging](./04-43-dstate-debugging.md)
- [04-44: Thread Synchronization Debugging](./04-44-thread-synchronization-debugging.md)
- [04-45: Signal Handling Debugging](./04-45-signal-handling-debugging.md)

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
