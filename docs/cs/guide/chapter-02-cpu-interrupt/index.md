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

# Chapter 02: CPU와 인터럽트 - 하드웨어와 소프트웨어의 만남

## 이 장에서 다루는 내용

CPU 아키텍처, 인터럽트 처리, 컨텍스트 스위칭부터 전력 관리까지 시스템의 핵심 메커니즘을 학습합니다.

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

### 2.1 CPU 아키텍처 기초

- [05-01: CPU Architecture](./05-01-cpu-architecture.md)
- [05-02: CPU Fundamentals](./05-02-cpu-fundamentals.md)
- [05-06: Power Fundamentals](./05-06-power-fundamentals.md)
- [05-10: Prediction OOO](./05-10-prediction-ooo.md)
- [05-11: Cache SIMD](./05-11-cache-simd.md)

### 2.2 인터럽트 처리 메커니즘

- [05-03: Interrupt Basics](./05-03-interrupt-basics.md)
- [05-12: Interrupt Exception](./05-12-interrupt-exception.md)
- [05-13: Interrupt Processing](./05-13-interrupt-processing.md)
- [05-14: Interrupt Controllers](./05-14-interrupt-controllers.md)
- [05-15: Software Interrupts](./05-15-software-interrupts.md)

### 2.3 컨텍스트 스위칭

- [05-04: Context Fundamentals](./05-04-context-fundamentals.md)
- [05-05: Context Switching Fundamentals](./05-05-context-switching-fundamentals.md)
- [05-16: Context Switching](./05-16-context-switching.md)
- [05-17: Context Switching Implementation](./05-17-context-switching-implementation.md)
- [05-18: Switching Mechanisms](./05-18-switching-mechanisms.md)
- [05-19: Context Switching Overhead](./05-19-context-switching-overhead.md)
- [05-40: Overhead Analysis](./05-40-overhead-analysis.md)

### 2.4 성능 최적화

- [05-30: Performance Optimization](./05-30-performance-optimization.md)
- [05-31: Context Switching Optimization](./05-31-context-switching-optimization.md)
- [05-32: Optimization Strategies](./05-32-optimization-strategies.md)

### 2.5 전력 관리

- [04-power: Management](./04-power-management.md)
- [04b-dvfs: Frequency Scaling](./04b-dvfs-frequency-scaling.md)
- [04c-cstate: Idle Management](./04c-cstate-idle-management.md)

## 🔗 관련 챕터

### 📚 시스템 프로그래밍 기초

- [Chapter 1: 프로세스와 스레드](../chapter-01-process-thread/index.md)
- [Chapter 3: 메모리 시스템](../chapter-03-memory-system/index.md)
- [Chapter 10: 시스템콜과 커널](../chapter-10-syscall-kernel/index.md)

### 🚀 성능 관련  

- [Chapter 11: 성능 최적화](../chapter-11-performance-optimization/index.md)

### 🔧 고급 주제

- [Chapter 15: 보안 엔지니어링](../chapter-15-security-engineering/index.md)
