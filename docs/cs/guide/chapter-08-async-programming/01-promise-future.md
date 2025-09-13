---
tags:
  - Async
  - Promise
  - Future
  - Concurrency
  - Overview
---

# 8.1 Promise/Future 패턴 개요

## 🎁 비동기 프로그래밍의 핵심 패턴

Promise와 Future는 현대 비동기 프로그래밍의 핵심 패턴입니다. 콜백 지옥을 해결하고, 에러 처리를 단순화하며, 비동기 코드를 동기 코드처럼 작성할 수 있게 해주는 강력한 도구입니다.

## 📚 학습 로드맵

이 섹션은 5개의 전문화된 문서로 구성되어 있습니다:

### 1️⃣ [기본 개념과 구현](01a-promise-future-basics.md)

- Promise와 Future의 차이점과 공통점
- C++ SharedState 기반 구현
- JavaScript Promise/A+ 스펙 구현
- 상태 전환과 콜백 체인의 동작 원리

### 2️⃣ [비동기 연산 조합](01b-async-composition.md)

- Promise.all, race, allSettled 활용법
- 순차/병렬/제한적 실행 패턴
- Map-Reduce 패턴과 비동기 파이프라인
- 재시도, 디바운스, 쓰로틀 구현

### 3️⃣ [취소와 타임아웃](01c-cancellation-timeout.md)

- CancellationToken으로 협조적 취소
- AbortController/AbortSignal 활용
- 타임아웃과 재시도 로직 with 백오프
- 사용자 취소와 메모리 누수 방지

### 4️⃣ [실행 모델과 스케줄링](01d-execution-scheduling.md)

- 실행자(Executor) 패턴과 스레드 풀
- 마이크로태스크 vs 매크로태스크
- 이벤트 루프 시뮬레이션
- 우선순위 기반 스케줄링

### 5️⃣ [에러 처리 패턴](01e-error-handling.md)

- Circuit Breaker로 장애 격리
- Bulkhead 패턴으로 리소스 보호
- 에러 분류와 적절한 처리 전략
- 견고한 API 클라이언트 구현

## 🎯 핵심 개념 비교표

| 개념 | Promise (JavaScript) | Future (C++) | 설명 |
|------|---------------------|--------------|------|
| **생성** | `new Promise()` | `std::async()` | 비동기 작업 시작 |
| **체이닝** | `.then()` | `.then()` (커스텀) | 결과 변환과 연결 |
| **에러 처리** | `.catch()` | `try-catch` | 예외 전파와 처리 |
| **조합** | `Promise.all()` | `when_all()` (커스텀) | 여러 작업 동시 대기 |
| **취소** | `AbortController` | `CancellationToken` | 작업 중단 메커니즘 |

## 🚀 실전 활용 시나리오

### Netflix의 마이크로서비스

- 50개 서비스를 병렬 호출
- Promise.allSettled로 부분 실패 허용
- Circuit Breaker로 장애 전파 방지

### Facebook의 Folly 라이브러리

- SharedState로 스레드 안전한 Future
- 실행자 패턴으로 성능 최적화
- 취소 토큰으로 리소스 관리

### Google Chrome의 렌더링 엔진

- 마이크로태스크 우선순위 처리
- AbortController로 네트워크 요청 관리
- 애니메이션 프레임 동기화

## 🎭 학습 전략

### 초보자 (1-2주)

1. [기본 개념](01a-promise-future-basics.md) → Promise/Future 차이 이해
2. [조합 패턴](01b-async-composition.md) → 실전 예제로 연습
3. 간단한 비동기 함수 직접 구현해보기

### 중급자 (2-3주)

1. [취소와 타임아웃](01c-cancellation-timeout.md) → 사용자 경험 개선
2. [실행 모델](01d-execution-scheduling.md) → 성능 최적화 기법
3. 실제 프로젝트에 적용하고 성능 측정

### 고급자 (3-4주)

1. [에러 처리](01e-error-handling.md) → 견고한 시스템 구축
2. 커스텀 Promise/Future 라이브러리 구현
3. 대규모 시스템에서의 패턴 최적화

## 🔗 연관 학습

### 선행 학습

- [4장 스레드와 동기화](../chapter-04-process-thread/) - 동시성 기초
- [7장 네트워킹](../chapter-07-networking/) - 비동기 I/O

### 후속 학습

- [8.2 이벤트 루프](02-event-loop-concurrency.md) - 이벤트 기반 동시성
- [8.3 Generator와 Async/Await](03-generator-async-await.md) - 언어 레벨 지원

---

**다음**: Promise/Future의 기초를 탄탄히 다지고 싶다면 [8.1a 기본 개념과 구현](01a-promise-future-basics.md)부터 시작하세요!
