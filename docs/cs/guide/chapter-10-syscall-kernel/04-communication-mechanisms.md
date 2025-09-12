---
tags:
  - Kernel
  - UserSpace
  - Communication
  - procfs
  - sysfs
  - netlink
  - BPF
---

# Chapter 10-4: 커널-사용자공간 통신 메커니즘 개요

## 이 문서 시리즈에서 다루는 내용

시스템 호출 외에도 커널과 사용자 공간 간에는 다양한 통신 메커니즘이 존재합니다. 각각의 메커니즘은 서로 다른 특성과 용도를 가지고 있어 상황에 맞게 선택하여 사용해야 합니다.

## 통신 메커니즘 분류

다음 5개의 전문 문서에서 각 메커니즘을 상세히 다룹니다:

### 1. [파일시스템 기반 통신 (procfs, sysfs)](04a-procfs-sysfs.md)

**특징**: 파일 읽기/쓰기 방식으로 커널 정보 접근
**용도**: 시스템 상태 조회, 프로세스 정보 확인, 커널 매개변수 설정
**장점**: 표준 파일 I/O 도구 사용 가능, 직관적인 인터페이스

### 2. [netlink 소켓 실시간 통신](04b-netlink-socket.md)

**특징**: 양방향 비동기 통신, 이벤트 기반
**용도**: 네트워크 변화 모니터링, 실시간 커널 이벤트 수신
**장점**: 효율적인 이벤트 전달, 다중 프로세스 브로드캐스트

### 3. [공유 메모리와 mmap 고성능 통신](04c-shared-memory.md)

**특징**: 메모리 공유를 통한 고속 데이터 교환
**용도**: 대용량 데이터 전송, 고성능 애플리케이션
**장점**: 최고 성능, 낮은 오버헤드

### 4. [신호와 eventfd 가벼운 이벤트 통신](04d-signal-eventfd.md)

**특징**: 간단한 이벤트 알림, 비동기 처리
**용도**: 프로세스 간 신호 전달, 이벤트 루프 통합
**장점**: 가볍고 빠른 알림, 표준화된 인터페이스

### 5. [eBPF 커널 프로그래밍](04e-ebpf-programming.md)

**특징**: 커널 내부에서 사용자 프로그램 실행
**용도**: 성능 모니터링, 보안 필터링, 네트워크 패킷 처리
**장점**: 안전한 커널 확장성, 실시간 데이터 처리

## 통신 메커니즘 특성 비교

| 메커니즘 | 방향성 | 성능 | 복잡성 | 주요 용도 |
|----------|--------|------|--------|-----------
| procfs | 단방향 (읽기) | 보통 | 낮음 | 시스템 정보 조회 |
| sysfs | 양방향 | 보통 | 낮음 | 디바이스 제어 |
| netlink | 양방향 | 높음 | 중간 | 실시간 이벤트 |
| 공유메모리 | 양방향 | 최고 | 높음 | 대용량 데이터 |
| 신호/eventfd | 단방향 | 높음 | 낮음 | 이벤트 알림 |
| eBPF | 특수 | 최고 | 최고 | 커널 확장 |

## 선택 가이드

각 통신 메커니즘을 언제 사용해야 하는지에 대한 가이드입니다:

### 정보 조회가 목적일 때

- **단순한 시스템 정보**: procfs 사용 (`/proc/cpuinfo`, `/proc/meminfo` 등)
- **디바이스 상태 확인**: sysfs 사용 (`/sys/class/net/*/statistics` 등)

### 실시간 이벤트 처리가 필요할 때  

- **네트워크 변화 감지**: netlink 소켓 사용
- **단순한 알림**: signal 또는 eventfd 사용

### 고성능 데이터 처리가 필요할 때

- **대용량 데이터 교환**: 공유메모리 + mmap 사용
- **커널 레벨 최적화**: eBPF 프로그램 사용

### 설정 변경이 목적일 때

- **시스템 매개변수**: sysfs 또는 procfs 사용
- **동적 커널 동작**: eBPF 사용

## 실습 환경 준비

각 통신 메커니즘을 실습하려면 다음과 같은 도구들이 필요합니다:

```bash
# 개발 도구 설치 (Ubuntu/Debian)
sudo apt install build-essential linux-headers-$(uname -r)
sudo apt install libbpf-dev bpftrace

# 개발 도구 설치 (CentOS/RHEL)
sudo yum groupinstall "Development Tools"
sudo yum install kernel-devel-$(uname -r)
sudo yum install libbpf-devel bpftrace

# Python 환경 (분석 도구용)
pip install psutil pandas numpy
```

## 더 깊이 있는 학습을 위한 자료

- **Linux Kernel Documentation**: 공식 커널 문서에서 각 서브시스템별 상세 설명
- **"Linux System Programming" (Robert Love)**: 시스템 프로그래밍 전반에 대한 심화 내용
- **"BPF Performance Tools" (Brendan Gregg)**: eBPF를 활용한 성능 분석 기법
- **"The Linux Programming Interface" (Michael Kerrisk)**: 리눅스 API 완전 가이드
