# 프로세스와 스레드

Linux 커널의 프로세스/스레드 관리와 스케줄링 메커니즘을 다루는 섹션입니다.

## 📚 문서 목록

### Process vs Thread 시리즈
- [Part 1: Linux의 충격적 진실 - 모든 것은 clone이다](process-vs-thread-1.md)
- [Part 2: 메모리 공유와 격리의 실제 구현](process-vs-thread-2.md)
- [Part 3: 스케줄링, 시그널, 그리고 실전 선택 가이드](process-vs-thread-3.md)

### Linux 스케줄링
- [스케줄링 완벽 가이드 1: 스케줄링의 진화와 기본 개념](linux-scheduling-1.md)
- [스케줄링 완벽 가이드 2: CFS(Completely Fair Scheduler) 깊이 파헤치기](linux-scheduling-2.md)

### Linux 인터럽트
- [인터럽트 처리의 모든 것 1: 인터럽트 이해하기 - 기초부터 아키텍처까지](linux-interrupt-1.md)
- [인터럽트 처리의 모든 것 2: Top-half, Bottom-half 그리고 ksoftirqd의 비밀](linux-interrupt-2.md)
- [인터럽트 처리의 모든 것 3: 타이머, 시간 관리, 그리고 CPU Isolation](linux-interrupt-3.md)

## 🏷️ 관련 태그

`#Process` `#Thread` `#Scheduling` `#Interrupt` `#Linux`

## 🔗 연관 주제

- [메모리 관리](../memory/index.md) - 프로세스/스레드의 메모리 구조
- [멀티스레드 스택 메모리](../memory/multithread-stack-memory.md) - 스레드별 스택 할당

## 💡 핵심 개념

### Process vs Thread 결정 가이드

!!! info "언제 무엇을 선택할까?"
    **Process를 선택해야 할 때:**
    - 완벽한 격리가 필요한 경우
    - 장애 전파를 막아야 하는 경우
    - 독립적인 배포/업데이트가 필요한 경우
    
    **Thread를 선택해야 할 때:**
    - 빠른 컨텍스트 스위칭이 필요한 경우
    - 대량의 데이터 공유가 필요한 경우
    - 메모리 사용량을 최소화해야 하는 경우

### 스케줄링 최적화 체크리스트

- [ ] Nice 값 조정 (-20 ~ 19)
- [ ] CPU Affinity 설정
- [ ] Real-time 스케줄링 정책 검토
- [ ] cgroup을 통한 CPU 제한
- [ ] CPU Isolation 설정

## 🎯 학습 목표

1. Linux에서 프로세스와 스레드의 실제 구현 이해
2. CFS 스케줄러의 동작 원리와 튜닝 방법 습득
3. 인터럽트 처리 메커니즘과 성능 영향 이해
4. 실전 애플리케이션 성능 최적화 기법 습득