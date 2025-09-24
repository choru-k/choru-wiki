---
tags:
  - context-switching
  - cpu-scheduling
  - hands-on
  - intermediate
  - medium-read
  - multitasking
  - numa-optimization
  - performance-optimization
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 2.3.3: 컨텍스트 스위칭

## 🎯 멀티태스킹의 핵심 메커니즘

현대 운영체제가 수천 개의 프로세스를 동시에 실행하는 비밀은**컨텍스트 스위칭**에 있습니다. CPU가 프로세스 간을 빠르게 전환하며 마치 모든 것이 동시에 실행되는 것처럼 보이게 만드는 마법입니다.

## 📚 학습 로드맵

이 섹션은 4개의 전문화된 문서로 구성되어 있습니다:

### 1️⃣ [CPU 컨텍스트 기초](./02-03-01-context-fundamentals.md)

- CPU 컨텍스트의 구성 요소
- Task Struct의 내부 구조
- 레지스터와 메모리 상태 저장
- 프로세스 컨텍스트의 블랙박스

### 2️⃣ [컨텍스트 스위칭 메커니즘](./02-03-05-switching-mechanisms.md)

- 스케줄러 호출 시점과 조건
- 컨텍스트 저장 및 복원 과정
- 메모리 관리 컨텍스트 전환
- 어셈블리 레벨 스위칭 코드

### 3️⃣ [성능 오버헤드 분석](./02-04-03-overhead-analysis.md)

- 직접 비용과 간접 비용
- 캐시 미스와 TLB 플러시 영향
- 실제 측정 방법과 도구
- NUMA 시스템에서의 성능 함정

### 4️⃣ [최적화 전략과 실전 사례](./02-04-02-optimization-strategies.md)

- CPU 친화도와 스레드 풀
- Lock-free 프로그래밍 기법
- 사용자 레벨 스레딩 (코루틴)
- 실제 서비스 최적화 사례

## 🎯 핵심 개념 비교표

| 개념 | 전통적 접근 | 최적화된 접근 | 성능 차이 |
|------|-------------|---------------|----------|
|**스레드 생성**| OS 스레드 | 스레드 풀 | 10배 빠름 |
|**동기화**| Mutex/Lock | Lock-free | 100배 빠름 |
|**I/O 처리**| 블로킹 I/O | 이벤트 기반 | 50배 빠름 |
|**메모리 접근**| 랜덤 배치 | NUMA 친화적 | 3배 빠름 |

## 🚀 실전 활용 시나리오

### 고성능 웹 서버 시나리오

-**문제**: 10,000개 동시 연결에서 높은 레이턴시
-**원인**: 과도한 컨텍스트 스위칭 오버헤드
-**해결**: epoll + 이벤트 루프 아키텍처
-**결과**: 레이턴시 90% 감소, 처리량 10배 증가

### 실시간 게임 시나리오

-**문제**: 프레임 드롭과 불안정한 FPS
-**원인**: 게임 스레드의 비정기적 컨텍스트 스위칭
-**해결**: CPU 친화도 설정 + 우선순위 조정
-**결과**: 안정적인 60 FPS 유지

### 금융 거래 시스템 시나리오

-**문제**: 주문 처리 레이턴시 45μs (경쟁사 대비 느림)
-**원인**: Lock 경합으로 인한 컨텍스트 스위칭
-**해결**: Lock-free 데이터 구조 + 전용 CPU 코어
-**결과**: 0.8μs로 단축, 일일 수익 50배 증가

## 🔗 연관 학습

### 선행 학습

- [CPU 아키텍처와 실행 모드](./02-01-01-cpu-architecture.md) - CPU 기초 구조 이해
- [인터럽트와 예외 처리](./02-02-02-interrupt-exception.md) - 인터럽트 메커니즘

### 후속 학습

- [전력 관리](./02-05-02-power-management.md) - CPU 상태 전환과 전력 최적화
- [프로세스와 스레드 관리](../chapter-01-process-thread/) - 스케줄링과 동기화

### 실전 연계

- [비동기 프로그래밍](../chapter-10-async-programming/index.md) - 이벤트 기반 아키텍처
- [성능 최적화](../chapter-12-observability-debugging/) - 모니터링과 튜닝

---

**다음**: 먼저 [CPU 컨텍스트 기초](./02-03-01-context-fundamentals.md)에서 컨텍스트의 구성 요소를 학습하세요.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 시스템 프로그래밍
-**예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-02-cpu-interrupt)

- [Chapter 2-1-1: CPU 아키텍처와 명령어 실행 개요](./02-01-01-cpu-architecture.md)
- [Chapter 2-1-2: CPU 기본 구조와 명령어 실행](./02-01-02-cpu-fundamentals.md)
- [Chapter 2-1-3: 분기 예측과 Out-of-Order 실행](./02-01-03-prediction-ooo.md)
- [Chapter 2-1-4: CPU 캐시와 SIMD 벡터화](./02-01-04-cache-simd.md)
- [Chapter 2-1-5: 성능 측정과 실전 최적화](./02-01-05-performance-optimization.md)

### 🏷️ 관련 키워드

`context-switching`, `cpu-scheduling`, `performance-optimization`, `multitasking`, `numa-optimization`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
