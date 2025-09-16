---
tags:
  - balanced
  - circuit-breaker
  - cqrs
  - distributed-patterns
  - intermediate
  - medium-read
  - microservices
  - saga
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "2-3시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 14.4 분산 시스템 패턴 - 현실 세계의 검증된 해결책들

## 서론: 2022년 2월, 마이크로서비스 지옥에서 탈출한 날

우리 회사가 모놀리스에서 마이크로서비스로 전환한 지 6개월이 지났을 때입니다. 처음엔 "이제 서비스별로 독립 배포할 수 있다!"고 기뻐했지만, 곧 새로운 지옥이 시작되었습니다.

### 🔥 2월 14일 밸런타인데이: 연쇄 장애의 악몽

```bash
# 우리의 마이크로서비스 아키텍처
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ User Service│◄───┤Order Service├───►│Payment Svc  │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│Profile Svc  │    │Inventory Svc│    │ Email Svc   │
└─────────────┘    └─────────────┘    └─────────────┘

# 밸런타인데이 오후 2시: 트래픽 폭증
Normal Load: 1,000 RPS
Valentine Load: 15,000 RPS (15배!)
```

**오후 2:15 - 첫 번째 도미노: Payment Service 다운**

```python
# Payment Service 로그
[14:15:23] INFO: Processing payment request user_123
[14:15:25] INFO: Processing payment request user_456  
[14:15:27] INFO: Processing payment request user_789
...
[14:15:45] ERROR: Connection pool exhausted! (200/200 connections)
[14:15:46] ERROR: Database connection timeout after 30s
[14:15:47] FATAL: OutOfMemoryError - GC overhead limit exceeded
[14:15:48] SYSTEM: Payment Service CRASHED 💥
```

**오후 2:16 - 두 번째 도미노: 연쇄 장애 시작**

```python
# Order Service가 Payment Service를 계속 호출
def process_order(order_data):
    try:
        # Payment Service 호출 (이미 죽음)
        payment_result = payment_service.charge(
            user_id=order_data['user_id'],
            amount=order_data['amount']
        )
        # 30초 타임아웃까지 대기... 😱
        
    except TimeoutException:
        # 재시도 로직 (더 나쁘게 만듦)
        for i in range(5):
            try:
                payment_result = payment_service.charge(...)
                break
            except:
                time.sleep(2 ** i)  # 지수 백오프
        
        raise PaymentServiceUnavailableException()

# 결과: Order Service도 응답 불가
# 모든 스레드가 Payment Service 호출에서 블록됨
```

**오후 2:20 - 전체 시스템 마비**

```bash
📊 시스템 상태:
- Payment Service: 💀 DEAD
- Order Service: 🐌 99% threads blocked  
- User Service: 🐌 90% threads blocked (Order Service 호출 중)
- Inventory Service: 🐌 85% threads blocked
- Email Service: 🐌 75% threads blocked

💔 사용자 경험:
"주문 버튼을 눌렀는데 30초째 로딩 중..."
"회원가입도 안 돼요!"  
"상품 검색도 안 되네요..."

😭 CEO: "단일 서버였을 땐 이런 일이 없었는데!"
```

이 날 우리는 **분산 시스템의 냉혹한 현실**을 배웠습니다. 그리고 **Circuit Breaker, Bulkhead, Saga 패턴** 등을 도입하게 되었습니다.

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

`distributed-patterns`, `circuit-breaker`, `saga`, `cqrs`, `microservices`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
