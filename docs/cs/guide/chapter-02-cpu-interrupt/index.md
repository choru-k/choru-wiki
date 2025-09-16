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

- [02-01: CPU 아키텍처 개요](./05-01-cpu-architecture.md)
- [02-02: CPU 기본 원리](./05-02-cpu-fundamentals.md)
- [02-03: 캐시와 SIMD](./05-11-cache-simd.md)
- [02-04: 분기 예측과 비순차 실행](./05-10-prediction-ooo.md)

### 2.2 인터럽트 시스템

- [02-10: 인터럽트 기초](./05-03-interrupt-basics.md)
- [02-11: 인터럽트와 예외](./05-12-interrupt-exception.md)
- [02-12: 인터럽트 처리 과정](./05-13-interrupt-processing.md)
- [02-13: 인터럽트 컨트롤러](./05-14-interrupt-controllers.md)
- [02-14: 소프트웨어 인터럽트](./05-15-software-interrupts.md)

### 2.3 컨텍스트 스위칭

- [02-20: 컨텍스트 기초 개념](./05-04-context-fundamentals.md)
- [02-21: 컨텍스트 스위칭 기본](./05-05-context-switching-fundamentals.md)
- [02-22: 컨텍스트 스위칭 심화](./05-16-context-switching.md)
- [02-23: 컨텍스트 스위칭 구현](./05-17-context-switching-implementation.md)
- [02-24: 스위칭 메커니즘](./05-18-switching-mechanisms.md)
- [02-25: 스위칭 오버헤드](./05-19-context-switching-overhead.md)
- [02-26: 오버헤드 분석](./05-40-overhead-analysis.md)

### 2.4 성능 최적화

- [02-30: 전반적 성능 최적화](./05-30-performance-optimization.md)
- [02-31: 컨텍스트 스위칭 최적화](./05-31-context-switching-optimization.md)
- [02-32: 최적화 전략](./05-32-optimization-strategies.md)

### 2.5 전력 관리

- [02-40: 전력 관리 기초](./05-06-power-fundamentals.md)
- [02-41: 전력 관리 시스템](./04-power-management.md)
- [02-42: DVFS 주파수 스케일링](./04b-dvfs-frequency-scaling.md)
- [02-43: C-State 유휴 관리](./04c-cstate-idle-management.md)

## 🔗 관련 챕터

### 📚 시스템 프로그래밍 기초

- [Chapter 1: 프로세스와 스레드](../chapter-01-process-thread/index.md)
- [Chapter 3: 메모리 시스템](../chapter-03-memory-system/index.md)
- [Chapter 10: 시스템콜과 커널](../chapter-10-syscall-kernel/index.md)

### 🚀 성능 관련  

- [Chapter 11: 성능 최적화](../chapter-11-performance-optimization/index.md)

### 🔧 고급 주제

- [Chapter 17: 보안 엔지니어링](../chapter-17-security-engineering/index.md)
