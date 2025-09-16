---
tags:
  - balanced
  - distributed-systems
  - event-driven-architecture
  - event-streaming
  - intermediate
  - medium-read
  - message-queue
  - microservices
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "2-3시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 14.5 Event-Driven Architecture 개요

## 🎯 이벤트로 연결되는 느슨한 결합 시스템

우리가 경험한 실시간 추천 시스템 구축 과정을 통해 Event-Driven Architecture의 핵심 개념과 실제 구현 방법을 배워보겠습니다.

## 📚 학습 로드맵

이 섹션은 4개의 전문화된 문서로 구성되어 있습니다:

### 1️⃣ [기초 개념과 패러다임](14-03-event-driven-fundamentals.md)

- 기존 동기 방식의 한계와 문제점
- Event-Driven Architecture의 핵심 개념
- 이벤트 기반 통신 패러다임의 장점
- 실제 시스템 마비 사례와 해결 과정

### 2️⃣ [Message Queue 구현](14-18-message-queue-implementation.md)

- RabbitMQ 기반 이벤트 버스 구현
- 점대점 통신과 메시지 보장
- 실제 스트리밍 서비스 구현 예제
- 장애 내성과 복구 메커니즘

### 3️⃣ [Event Streaming과 Event Sourcing](14-19-event-streaming-sourcing.md)

- Kafka 기반 이벤트 스트리밍
- Event Sourcing 패턴 완전 구현
- 실시간 분석과 개인화 서비스
- 은행 계좌 도메인 Event Sourcing 실습

### 4️⃣ [실무 적용과 성숙도 모델](14-04-practical-implementation-guide.md)

- Event-Driven Architecture에서 배운 핵심 교훈
- 기술 선택 가이드라인 (Message Queue vs Streaming)
- 성숙도 모델과 단계별 적용 방법
- 실무 도입 시 주의사항과 베스트 프랙티스

## 🎯 핵심 개념 비교표

| 방식 | 동기 처리 | Message Queue | Event Streaming | Event Sourcing |
|------|-----------|---------------|-----------------|----------------|
| **결합도** | 강한 결합 | 느슨한 결합 | 완전 분리 | 도메인 중심 |
| **처리량** | 순차 처리 | 중간 | 매우 높음 | 높음 |
| **장애 내성** | 전파 위험 | 격리 보장 | 완전 격리 | 완전 복구 |
| **일관성** | 강한 일관성 | 최종 일관성 | 최종 일관성 | 이벤트 일관성 |
| **복잡도** | 낮음 | 중간 | 높음 | 매우 높음 |

## 🚀 실전 활용 시나리오

### 스트리밍 플랫폼 시나리오

- 사용자 시청 이벤트 발생 시 7개 서비스가 독립적으로 처리
- 응답 시간: 2.3초 → 0.1초 (95% 성능 향상)
- 장애 격리: 개별 서비스 장애가 전체에 영향 없음

### 은행 시스템 시나리오

- 모든 거래를 이벤트로 저장하여 완전한 감사 추적
- 언제든 과거 시점의 계좌 잔고 복원 가능
- 동시성 충돌 감지와 처리

## 🎭 학습 전략

### 초보자 (추천 순서)

1. [기초 개념](14-03-event-driven-fundamentals.md) → 패러다임 이해
2. [Message Queue](14-18-message-queue-implementation.md) → 기본 구현
3. 간단한 이벤트 시스템 구현 연습

### 중급자 (심화 학습)

1. [Event Streaming](14-19-event-streaming-sourcing.md) → 고급 패턴
2. [실무 가이드](14-04-practical-implementation-guide.md) → 실전 적용
3. 실제 프로덕션 시스템 설계

### 고급자 (아키텍처 설계)

1. 전체 문서 통합 학습
2. 복합 패턴 설계 (CQRS + Event Sourcing)
3. 대규모 시스템 아키텍처 설계

## 🔗 연관 학습

### 선행 학습

- [14.1 Microservices Architecture](chapter-15-microservices-architecture/16-01-microservices-architecture.md) - 서비스 분리 기초
- [14.4 Distributed Patterns](14-52-distributed-patterns.md) - 분산 시스템 패턴

### 후속 학습

- [Chapter 15 Security Engineering](../chapter-17-security-engineering/index.md) - 이벤트 보안
- [Chapter 16 System Design Patterns](../chapter-16-system-design-patterns/index.md) - 시스템 설계 통합

## 💡 핵심 메시지

> "이벤트는 시스템을 연결하는 혈관입니다. 적절한 이벤트 설계로 확장 가능하고 유지보수 가능한 시스템을 만들 수 있습니다!" 🌊⚡

---

**다음**: [기초 개념과 패러다임](14-03-event-driven-fundamentals.md)에서 Event-Driven Architecture의 핵심 개념을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 2-3시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-14-distributed-systems)

- [14.1 분산 시스템 기초 이론 - CAP 정리와 일관성의 과학](./14-01-distributed-fundamentals.md)
- [14.2 합의 알고리즘 - 분산된 노드들이 하나가 되는 방법](./14-10-consensus-algorithms.md)
- [14.3 분산 데이터 관리 개요](./14-11-distributed-data.md)
- [14.3A Sharding 전략과 구현](./14-12-sharding-strategies.md)
- [14.3B Replication 패턴과 구현](./14-50-replication-patterns.md)

### 🏷️ 관련 키워드

`event-driven-architecture`, `message-queue`, `event-streaming`, `microservices`, `distributed-systems`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
