---
tags:
  - TODO
  - Guide
  - Documentation
---

# CS 가이드 - 필요한 세부 문서 TODO List

이 문서는 CS 마스터리 가이드를 완성하기 위해 작성되어야 할 세부 문서들을 정리한 것입니다.

## 📌 우선순위: 높음 (가이드 챕터 직접 연관)

### 기초 시스템 프로그래밍

- [ ] **CPU 아키텍처 완벽 가이드** - x86-64, ARM, 파이프라인, 명령어 세트
- [ ] **캐시 계층 구조** - L1/L2/L3, 캐시 라인, 일관성 프로토콜
- [ ] **System Call 동작 원리** - User/Kernel mode 전환, SYSCALL/SYSENTER
- [ ] **메모리 순서와 베리어** - Memory ordering, fence, happens-before
- [ ] **원자적 연산** - CAS, Compare-and-swap, Memory model

### 프로세스와 동시성

- [ ] **IPC 완벽 가이드** - Pipe, Message Queue, Shared Memory, Socket 비교
- [ ] **Signal 처리 심화** - Signal safety, 실시간 시그널, signalfd
- [ ] **Lock과 동기화 프리미티브** - Mutex, Semaphore, Condition Variable, RWLock
- [ ] **Lock-free 프로그래밍** - 원자적 연산, ABA 문제, Hazard Pointer
- [ ] **Work Stealing 알고리즘** - 스케줄러 구현, Task Queue

### 네트워크와 I/O

- [ ] **TCP/IP 스택 내부 구조** - 패킷 처리 경로, sk_buff, netfilter
- [ ] **TCP 혼잡 제어** - Cubic, BBR, Reno 알고리즘 비교
- [ ] **HTTP/2와 HTTP/3의 진화** - 멀티플렉싱, QUIC 프로토콜
- [ ] **io_uring 완벽 가이드** - 링 버퍼, SQ/CQ, IORING_OP
- [ ] **Zero-copy 기술** - sendfile, splice, tee

### 메모리 관리

- [ ] **메모리 할당자 구현** - ptmalloc, tcmalloc, jemalloc 비교
- [ ] **Buddy System과 Slab Allocator** - 커널 메모리 관리
- [ ] **Huge Pages와 THP** - Transparent Huge Pages, 성능 영향
- [ ] **NUMA 최적화** - 메모리 배치, CPU 친화성, numactl
- [ ] **Memory Compaction과 Fragmentation** - 단편화 해결

## 📌 우선순위: 중간 (실전 활용)

### 파일시스템과 스토리지

- [ ] **파일시스템 내부** - ext4, btrfs, ZFS 구조와 특징
- [ ] **VFS 레이어** - Virtual File System, inode, dentry
- [ ] **블록 I/O 레이어** - I/O 스케줄러, 엘리베이터 알고리즘
- [ ] **SSD 최적화** - Trim, Wear leveling, Write amplification
- [ ] **RAID와 스토리지** - RAID 레벨, mdadm, LVM

### 가상화와 클라우드

- [ ] **하이퍼바이저 구조** - Type 1/2, KVM, Xen
- [ ] **가상화 기술** - Full, Para, Hardware-assisted virtualization
- [ ] **Container Runtime 내부** - runc, containerd, OCI 스펙
- [ ] **Service Mesh 동작 원리** - Envoy, Istio, eBPF 기반 구현
- [ ] **Kubernetes Scheduler 알고리즘** - 스케줄링 정책, 우선순위

### 보안

- [ ] **버퍼 오버플로우와 방어** - Stack/Heap 공격, ROP, JOP
- [ ] **ASLR과 PIE 심화** - 주소 공간 랜덤화 우회와 방어
- [ ] **Spectre/Meltdown** - CPU 추측 실행 취약점
- [ ] **Linux Security Modules** - SELinux, AppArmor, SMACK
- [ ] **seccomp와 샌드박싱** - 시스템 콜 필터링, Chrome 샌드박스

### 데이터베이스 내부

- [ ] **B-Tree와 LSM-Tree** - 인덱스 구조, Write/Read 최적화
- [ ] **WAL과 체크포인트** - Write-Ahead Logging, 내구성 보장
- [ ] **MVCC 구현** - Multi-Version Concurrency Control
- [ ] **Connection Pool 동작 원리** - 연결 재사용, 성능 최적화
- [ ] **Transaction Isolation Level** - Read phenomena, Lock 구현

## 📌 우선순위: 낮음 (고급 주제)

### 분산 시스템

- [ ] **Consensus 알고리즘** - Raft, Paxos, Byzantine 합의
- [ ] **분산 트랜잭션** - 2PC, 3PC, Saga 패턴
- [ ] **CAP 정리와 트레이드오프** - 일관성 모델, Eventually Consistent
- [ ] **분산 추적** - Dapper, Zipkin, Jaeger 구현
- [ ] **Vector Clock과 Lamport Clock** - 분산 시스템 시간 동기화

### 성능 엔지니어링

- [ ] **JIT 컴파일** - HotSpot, V8, Profile-guided optimization
- [ ] **SIMD와 벡터화** - SSE, AVX, NEON, Auto-vectorization
- [ ] **Branch Prediction** - 분기 예측, Pipeline stall
- [ ] **Profile-Guided Optimization** - PGO, AutoFDO
- [ ] **False Sharing과 Cache Line** - 캐시 최적화

### 최신 기술

- [ ] **eBPF 프로그래밍 가이드** - XDP, TC, BCC, bpftrace
- [ ] **DPDK와 커널 우회** - User-space 네트워킹, PMD
- [ ] **RDMA와 InfiniBand** - Remote Direct Memory Access
- [ ] **Persistent Memory** - Intel Optane, DAX, pmem
- [ ] **WebAssembly 시스템 프로그래밍** - WASI, Runtime

### 언어별 특화

- [ ] **Rust의 메모리 안전성** - Ownership, Borrow checker, Lifetime
- [ ] **Go의 스케줄러** - Goroutine, M:N 스케줄링, Work stealing
- [ ] **Java의 GC 알고리즘** - G1GC, ZGC, Shenandoah
- [ ] **Python의 GIL** - Global Interpreter Lock, 멀티코어 활용
- [ ] **Node.js의 Event Loop** - libuv, Phase별 동작

## 📊 작성 우선순위 기준

### 즉시 작성 필요 (Chapter 3-5 지원)

1. CPU 아키텍처 완벽 가이드
2. System Call 동작 원리
3. IPC 완벽 가이드
4. Lock과 동기화 프리미티브

### 단기 작성 필요 (Chapter 6-9 지원)

1. TCP/IP 스택 내부 구조
2. io_uring 완벽 가이드
3. 메모리 할당자 구현
4. VFS 레이어

### 중기 작성 필요 (Chapter 10-12 지원)

1. eBPF 프로그래밍 가이드
2. Container Runtime 내부
3. Linux Security Modules
4. JIT 컴파일

## 📝 문서 작성 가이드라인

각 세부 문서는 다음 구조를 따라야 합니다:

1. **개요** (왜 이 주제가 중요한가?)
2. **이론적 배경** (기본 개념과 원리)
3. **실제 구현** (코드 예제와 설명)
4. **성능 고려사항** (벤치마크, 최적화)
5. **실전 활용** (프로덕션 사례)
6. **트러블슈팅** (흔한 문제와 해결)
7. **추가 리소스** (참고 문헌, 링크)

## 🔄 진행 상황 추적

이 TODO 리스트는 정기적으로 업데이트되며, 완성된 문서는 체크 표시와 함께 링크가 추가됩니다.

마지막 업데이트: 2024년 (가이드 초기 버전 작성 시)

---

*이 TODO 리스트에 추가하고 싶은 주제가 있다면 PR을 보내주세요!*
