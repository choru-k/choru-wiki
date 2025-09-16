---
tags:
  - SystemProgramming
  - Memory
  - Architecture
difficulty: INTERMEDIATE
learning_time: "15-25시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# Chapter 08: 메모리 할당자와 가비지 컬렉션 - 자동 메모리 관리의 기초

## 이 장에서 다루는 내용

메모리 할당자의 동작 원리부터 각 언어별 가비지 컬렉션 구현까지, 자동 메모리 관리의 모든 것을 학습합니다.

## 왜 이것을 알아야 하는가?

### 실무에서 마주치는 문제들

현대 소프트웨어 개발에서 이러한 지식은 필수입니다:

- 🚀 **성능 최적화**: 메모리 할당 패턴 이해를 통한 성능 개선
- 🐛 **메모리 누수 해결**: GC 동작 원리를 알아야 근본 원인 파악 가능  
- 🔧 **언어별 최적화**: Java, Python, Go 등 각 언어의 GC 특성 이해
- 📊 **모니터링**: GC 튜닝과 메모리 사용량 분석

## 학습 로드맵

이 장은 다음과 같은 순서로 학습하는 것을 권장합니다:

1. **메모리 할당자 기초** 파악
2. **GC 알고리즘 이해**  
3. **언어별 구현** 학습
4. **실전 튜닝** 기법 습득

## 📚 이 챕터의 구성

### 8.1 메모리 할당자

- [09-01: Malloc Fundamentals](./09-01-malloc-fundamentals.md)
- [09-10: Memory Allocator](./09-10-memory-allocator.md)
- [09-11: Allocator Comparison](./09-11-allocator-comparison.md)
- [09-12: Custom Allocators](./09-12-custom-allocators.md)

### 8.2 가비지 컬렉션 기초

- [09-02: Basic GC Algorithms](./09-02-basic-gc-algorithms.md)
- [09-03: GC History Basics](./09-03-gc-history-basics.md)
- [09-04: Advanced GC Concepts](./09-04-advanced-gc-concepts.md)
- [09-13: GC Algorithms](./09-13-gc-algorithms.md)
- [09-16: Modern GC Algorithms](./09-16-modern-gc-algorithms.md)
- [09-17: Modern GC Implementations](./09-17-modern-gc-implementations.md)

### 8.3 언어별 GC 구현

- [09-19: Java GC](./09-19-java-gc.md)
- [03b-go: GC](./03b-go-gc.md)
- [03c-python: GC](./03c-python-gc.md)
- [09-05: Python GC Fundamentals](./09-05-1-python-gc-fundamentals.md)
- [09-32: Python GC Optimization](./09-32-2-python-gc-optimization.md)
- [09-50: Python GC Production](./09-50-3-python-gc-production.md)
- [09-06: V8 GC Architecture](./09-06-1-v8-gc-architecture.md)

### 8.4 실전 튜닝

- [09-31: GC Tuning Practices](./09-31-gc-tuning-practices.md)

## 🔗 관련 챕터

### 📚 시스템 프로그래밍 기초

- [Chapter 3: 메모리 시스템](../chapter-03-memory-system/index.md)
- [Chapter 1: 프로세스와 스레드](../chapter-01-process-thread/index.md)

### 🚀 성능 관련  

- [Chapter 11: 성능 최적화](../chapter-11-performance-optimization/index.md)

### 🔧 고급 주제

- [Chapter 4: 시스템콜과 커널](../chapter-04-syscall-kernel/index.md)
- [Chapter 9: 고급 메모리 관리](../chapter-09-advanced-memory-management/index.md)
