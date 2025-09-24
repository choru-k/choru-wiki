# 메모리 관리

시스템 메모리의 동작 원리와 관리 기법을 다루는 섹션입니다.

## 📚 문서 목록

### 기초 개념

- [프로세스 메모리 구조 완벽 이해](process-memory-structure.md) - Stack, Heap, Data, Text 영역의 이해
- [가상 메모리와 페이지 테이블](virtual-memory-page-table.md) - 가상 메모리 시스템의 동작 원리
- [가비지 컬렉션 기초](garbage-collection-basics.md) - 자동 메모리 관리의 원리

### 심화 주제

- [멀티스레드 스택 메모리의 진실](multithread-stack-memory.md) - 800MB의 함정과 실제 메모리 사용
- [Page Cache 동작 원리](page-cache.md) - Kubernetes 환경에서의 Page Cache 이슈
- [PSI로 메모리 압력 실시간 모니터링](psi-monitoring.md) - Pressure Stall Information 활용법

### 언어별 메모리 관리

- [JVM 메모리 구조와 GC 튜닝 실전](jvm-memory-gc.md) - Java 애플리케이션 최적화
- [언어별 메모리 관리 전략](language-memory-management.md) - Go, Python, Rust 등의 메모리 관리

### 컨테이너와 클라우드

- [Cgroup과 컨테이너 메모리 격리의 비밀](cgroup-container-memory.md) - Docker/Kubernetes 메모리 격리
- [OOM Killer와 Cgroup 메모리 제한의 진실](oom-killer.md) - 메모리 부족 상황 처리

## 🏷️ 관련 태그

`#Memory` `#GC` `#JVM` `#Kubernetes` `#Linux` `#Cgroup`

## 🔗 연관 주제

- [프로세스와 스레드](../process/index.md) - 프로세스/스레드의 메모리 관리
- [Linux 스케줄링](../process/linux-scheduling-1.md) - 메모리와 스케줄링의 상관관계

## 💡 학습 팁

!!! tip "메모리 학습 순서"
    1. 먼저**프로세스 메모리 구조**를 이해하세요
    2. 그 다음**가비지 컬렉션 기초**를 학습하세요
    3. 사용하는 언어에 따라**언어별 메모리 관리**를 선택적으로 학습하세요
    4. 컨테이너 환경을 사용한다면**Cgroup 관련 문서**를 꼭 읽어보세요
