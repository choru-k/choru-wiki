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

- 🚀**성능 최적화**: 병목 구간을 정확히 파악하고 해결
- 🐛**디버깅**: 복잡한 시스템 문제의 근본 원인 파악  
- 🔧**아키텍처 설계**: 확장 가능하고 안정적인 시스템 구축
- 📊**모니터링**: 시스템 상태를 정확히 파악하고 예방적 조치

## 학습 로드맵

이 장은 다음과 같은 순서로 학습하는 것을 권장합니다:

1.**기초 개념**파악
2.**핵심 메커니즘**이해  
3.**실무 적용**연습
4.**고급 최적화**기법 습득

## 📚 이 챕터의 구성

### 2.1 CPU 아키텍처 기초

- [02-01-01: CPU 아키텍처 개요](./02-01-01-cpu-architecture.md)
- [02-01-02: CPU 기본 구조와 명령어 실행](./02-01-02-cpu-fundamentals.md)
- [02-01-03: 분기 예측과 Out-of-Order 실행](./02-01-03-prediction-ooo.md)
- [02-01-04: CPU 캐시와 SIMD 벡터화](./02-01-04-cache-simd.md)
- [02-01-05: 성능 측정과 실전 최적화](./02-01-05-performance-optimization.md)

### 2.2 인터럽트 시스템

- [02-02-01: 인터럽트 기초와 개념 이해](./02-02-01-interrupt-basics.md)
- [02-02-02: 인터럽트와 예외 개요](./02-02-02-interrupt-exception.md)
- [02-02-03: 인터럽트 처리 과정과 예외 처리](./02-02-03-interrupt-processing.md)
- [02-02-04: 인터럽트 컨트롤러와 최적화](./02-02-04-interrupt-controllers.md)
- [02-02-05: 소프트 인터럽트와 실시간 처리](./02-02-05-software-interrupts.md)

### 2.3 컨텍스트 스위칭

- [02-03-01: CPU 컨텍스트 기초](./02-03-01-context-fundamentals.md)
- [02-03-02: 컨텍스트 스위칭 기초 - CPU의 저글링](./02-03-02-context-switching-fundamentals.md)
- [02-03-03: 컨텍스트 스위칭은 어떻게 일어나는가 개요](./02-03-03-context-switching.md)
- [02-03-04: 컨텍스트 스위칭 구현 - 0.001초의 예술](./02-03-04-context-switching-implementation.md)
- [02-03-05: 컨텍스트 스위칭 메커니즘](./02-03-05-switching-mechanisms.md)
- [02-03-06: 컨텍스트 스위칭 오버헤드 - 보이지 않는 비용](./02-03-06-context-switching-overhead.md)

### 2.4 성능 최적화

- [02-04-01: 실전 최적화 사례 - 크롬, nginx, 그리고 SQL Server](./02-04-01-context-switching-optimization.md)
- [02-04-02: 최적화 전략과 실전 사례](./02-04-02-optimization-strategies.md)
- [02-04-03: 성능 오버헤드 분석](./02-04-03-overhead-analysis.md)

### 2.5 전력 관리

- [02-05-01: 전력 관리 기본 개념과 아키텍처](./02-05-01-power-fundamentals.md)
- [02-05-02: CPU 전력 관리와 주파수 스케일링 개요](./02-05-02-power-management.md)
- [02-05-03: DVFS와 동적 주파수 조절](./02-05-03-dvfs-frequency-scaling.md)
- [02-05-04: C-State와 절전 모드](./02-05-04-cstate-idle-management.md)

## 🔗 관련 챕터

### 📚 시스템 프로그래밍 기초

- [Chapter 1: 프로세스와 스레드](../chapter-01-process-thread/index.md)
- [Chapter 3: 메모리 시스템](../chapter-03-memory-system/index.md)
- [Chapter 4: 시스템콜과 커널](../chapter-04-syscall-kernel/index.md)

### 🚀 성능 관련  

- [Chapter 11: 성능 최적화](../chapter-11-performance-optimization/index.md)

### 🔧 고급 주제

- [Chapter 17: 보안 엔지니어링](../chapter-17-security-engineering/index.md)
