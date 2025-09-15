# Document Splitting Tasks

## Status Legend

- **todo**: 작업 대기 중
- **doing**: 현재 진행 중
- **done**: 완료

---

## Priority 1: 최대 크기 문서들 (1000+ lines)

### todo - 새로 발견된 대형 문서들

- [ ] **chapter-15-security-engineering/02d-zero-trust-monitoring.md** (1066 lines)
- [ ] **chapter-09-memory-gc/04a-memory-leak-debugging.md** (1056 lines)
- [ ] **chapter-11-performance-optimization/04c-network-io-optimization.md** (1034 lines)
- [ ] **chapter-06-file-io/07d-monitoring-troubleshooting.md** (1029 lines)
- [ ] **chapter-16-system-design-patterns/01e-monitoring-success-factors.md** (1028 lines)
- [ ] **chapter-14-distributed-systems/05d-practical-implementation-guide.md** (1026 lines)
- [ ] **chapter-10-syscall-kernel/03-system-call-implementation.md** (1015 lines)
- [ ] **chapter-16-system-design-patterns/index.md** (1011 lines)
- [ ] **chapter-09-memory-gc/03d3d-production-monitoring.md** (1008 lines)
- [ ] **chapter-02-memory/04-memory-mapping.md** (1006 lines)
- [ ] **chapter-10-syscall-kernel/04e-ebpf-programming.md** (1002 lines)

### doing (현재 진행 중)

- [ ] **chapter-02-memory/01-process-memory.md** (1119 lines) - 현재 진행 중
- [ ] **chapter-16-system-design-patterns/04-saga-pattern.md** (1542 lines) - 현재 진행 중
- [ ] **chapter-06-file-io/01-file-descriptor.md** (1551 lines) - 현재 진행 중
- [ ] **chapter-13-observability-debugging/01-logging-monitoring.md** (1417 lines) - 현재 진행 중
- [ ] **chapter-14-distributed-systems/05-event-driven-architecture.md** (1333 lines) - 현재 진행 중
- [ ] **chapter-16-system-design-patterns/01c-service-communication.md** (1162 lines)

### done

- [x] **chapter-16-system-design-patterns/01b-design-principles.md** (1151 lines) - 3개 섹션으로 분할 완료 (Single Responsibility Principle, Database per Service, API Contract First)
- [x] **chapter-03-virtual-memory/03-page-fault.md** (1146 lines) - 5개 섹션으로 분할 완료 (Page Fault Types & Handling, Copy-on-Write, Demand Paging, Swap & Memory Pressure, OOM Killer & Optimization) - 개요 문서로 변환됨
- [x] **chapter-04-process-thread/05-process-state-analysis.md** (1410 lines) - 4개 섹션으로 분할 완료 (Process State Fundamentals, D-State Debugging, Zombie Process Handling, Process Accounting) - 개요 문서로 변환됨
- [x] **chapter-03-virtual-memory/08-oom-debugging.md** (1470 lines) - 5개 섹션으로 분할 완료 (OOM Fundamentals, dmesg Log Analysis, Cgroup Container OOM, Early Prevention, Best Practices)
- [x] **chapter-16-system-design-patterns/01d-containerization-orchestration.md** (1189 lines) - 3개 섹션으로 분할 완료 (Docker Containerization, Docker Compose Environment, Kubernetes Production Deployment)
- [x] **chapter-10-syscall-kernel/02-kernel-architecture.md** (1080 lines) - 5개 섹션으로 분할 완료 (Design Philosophy, Core Subsystems, Interrupt/Module System, Sync/Memory/Debug, Practical Module Development)
- [x] **chapter-06-file-io/02-vfs-filesystem.md** (1865 lines) - 6개 섹션으로 분할 완료 (VFS Fundamentals, Path Lookup, Mount System, VFS Cache, Filesystem Implementation, Performance Tuning)
- [x] **chapter-07-network-programming/03-high-performance.md** (1540 lines) - 4개 섹션으로 분할 완료 (C10K Scaling, Zero-Copy NUMA, Connection Pool Load Balancing, Protocol Optimization)
- [x] **chapter-07-network-programming/05-tcp-connection-debugging.md** (1456 lines) - 3개 섹션으로 분할 완료 (TCP Analysis Tools, Connection Pool Optimization, Real-time Monitoring)
- [x] **chapter-03-virtual-memory/07-swap-management.md** (1456 lines) - 5개 섹션으로 분할 완료 (Performance Analysis, Swappiness Optimization, Compressed Swap, Monitoring, Container Management)
- [x] **chapter-05-cpu-interrupt/04-power-management.md** (1384 lines) - 5개 섹션으로 분할 완료 (Power Fundamentals, DVFS Frequency Scaling, C-State Idle Management, Turbo Boost, Optimization Monitoring)
- [x] **chapter-09-memory-gc/03c-python-gc.md** (1201 lines) - 3개 섹션으로 분할 완료 (GC Fundamentals, Optimization Techniques, Production Cases)
- [x] **chapter-06-file-io/06-filesystem-debugging.md** (1175 lines) - 3개 섹션으로 분할 완료 (Diagnostic Flow, Diagnostic Tools Implementation, Automated Recovery System)
- [x] **chapter-05-cpu-interrupt/03-context-switching.md** (1128 lines) - 4개 섹션으로 분할 완료 (Context Switching Fundamentals, Implementation, Overhead Analysis, Optimization)
- [x] **chapter-13-observability-debugging/02-distributed-tracing.md** (1120 lines) - 4개 섹션으로 분할 완료 (Tracing Fundamentals, OpenTelemetry Implementation, Sampling Optimization, Best Practices)
- [x] **chapter-13-observability-debugging/05-debugging-troubleshooting.md** (1020 lines) - 4개 섹션으로 분할 완료 (Systematic Debugging Frameworks, Distributed Debugging, Smart Debugging Tools, Log Analysis & Auto-Debugging)
- [x] **chapter-10-syscall-kernel/06-kernel-debugging-techniques.md** (1038 lines) - 3개 섹션으로 분할 완료 (Comprehensive Diagnostic System, eBPF Advanced Tracing, Practical Cases & Resources)
- [x] **chapter-09-memory-gc/03d3-spa-memory-management.md** (1047 lines) - 4개 섹션으로 분할 완료 (SPA Architecture/Lifecycle, Route Memory Management, Advanced Optimization, Production Monitoring)
- [x] **chapter-13-observability-debugging/02-distributed-tracing.md** (1120 lines) - 4개 섹션으로 분할 완료 (Tracing Fundamentals, OpenTelemetry Implementation, Sampling Optimization, Best Practices)
- [x] **chapter-09-memory-gc/01-memory-allocator.md** (1026 lines) - 4개 섹션으로 분할 완료 (Malloc Fundamentals, Allocator Comparison, Custom Allocators, Production Optimization)
- [x] **chapter-08-async-programming/05-event-loop-debugging.md** (1062 lines) - 3개 섹션으로 분할 완료 (Event Loop Fundamentals, C Monitoring System, JavaScript Analyzer)
- [x] **chapter-06-file-io/05-io-performance-analysis.md** (1139 lines) - 3개 섹션으로 분할 완료 (I/O Performance Monitoring, I/O Optimization Strategies, I/O Performance Testing)
- [x] **chapter-02-memory/03-virtual-memory.md** (1093 lines) - 4개 섹션으로 분할 완료 (Virtual Memory Basics, Paging System, Page Fault & TLB, Swap & Huge Pages)
- [x] **chapter-10-syscall-kernel/04c-shared-memory.md** (1132 lines) - 4개 섹션으로 분할 완료 (Shared Memory Basics, mmap File Communication, High-Performance Patterns, Performance Optimization)
- [x] **chapter-03-virtual-memory/06-memory-mapping-optimization.md** (1131 lines) - 5개 섹션으로 분할 완료 (mmap Performance Comparison, madvise Optimization Patterns, Huge Pages Optimization, NUMA Memory Optimization, Practical Optimization Patterns)
- [x] **chapter-06-file-io/06-filesystem-debugging.md** (1103 lines) - 3개 섹션으로 분할 완료 (Diagnostic Flow, Diagnostic Tools Implementation, Automated Recovery System)
- [x] **chapter-15-security-engineering/02-network-security.md** (1360 lines) - 4개 섹션으로 분할 완료 (Network Fundamentals, TLS/SSL Protocols, DDoS Defense, Zero Trust & Monitoring)
- [x] **chapter-02-memory/02-stack-heap.md** (1155 lines) - 5개 섹션으로 분할 완료 (Stack Fundamentals, Heap Fundamentals, Performance Debugging, Advanced Techniques, Practical Guide)
- [x] **chapter-16-system-design-patterns/02-event-driven-architecture.md** (1236 lines) - 4개 섹션으로 분할 완료 (Event-Driven Fundamentals, Real-time Stream Processing, Event Sourcing Implementation, Best Practices & Success Factors)
- [x] **chapter-06-file-io/07-network-filesystem-optimization.md** (1223 lines) - 4개 섹션으로 분할 완료 (NFS Analysis Tools, Auto-Optimization Scripts, Server Tuning Guide, Monitoring & Troubleshooting)
- [x] **chapter-11-performance-optimization/05-system-tuning.md** (1192 lines) - 4개 섹션으로 분할 완료 (Performance Analysis, OS/Kernel Tuning, Application Optimization, Load Balancing/Caching)
- [x] **chapter-08-async-programming/03-coroutine.md** (1380 lines) - 5개 섹션으로 분할 완료 (Fundamentals, Python asyncio, Go Goroutine, Java Virtual Threads, Synchronization/Debugging)
- [x] **chapter-07-network-programming/07-high-performance-networking.md** (1254 lines) - 3개 섹션으로 분할 완료 (High-Performance Architecture, Analysis Tool Implementation, DPDK Integration)
- [x] **chapter-08-async-programming/06-promise-performance-optimization.md** (1185 lines) - 3개 섹션으로 분할 완료 (C-based Analysis Tools, JavaScript Library, Overview Hub)
- [x] **chapter-09-memory-gc/05-memory-leak-detection.md** (1253 lines) - 2개 섹션으로 분할 완료 (System-level Detection Tool, Node.js V8 Profiling)
- [x] **chapter-09-memory-gc/02-gc-algorithms.md** (1133 lines) - 4개 섹션으로 분할 완료 (GC History & Basics, Generational & Concurrent GC, Modern GC Algorithms, Tuning & Practices)
- [x] **chapter-16-system-design-patterns/01-microservices-architecture.md** (1502 lines) - 5개 섹션으로 분할 완료 (Monolith Migration, Design Principles, Service Communication, Containerization, Monitoring)
- [x] **chapter-03-virtual-memory/07-swap-management.md** (1454 lines) - 5개 섹션으로 분할 완료 (Performance Analysis, Swappiness Optimization, Compressed Swap, Monitoring, Container Management)
- [x] **chapter-06-file-io/04-async-io.md** (1563 lines) - 6개 섹션으로 분할 완료 (Fundamentals, I/O Multiplexing, io_uring, Reactor Pattern, Proactor/IOCP, Network Optimization)
- [x] **chapter-06-file-io/03-block-io.md** (1596 lines) - 5개 섹션으로 분할 완료 (Block Layer, IO Schedulers, MultiQueue, NVMe/io_uring, Performance)
- [x] **chapter-14-distributed-systems/04-distributed-patterns.md** (1659 lines) - 4개 섹션으로 분할 완료 (Circuit Breaker, Bulkhead, Saga, CQRS)
- [x] **chapter-09-memory-gc/03d-javascript-gc.md** (1841 lines)
- [x] **chapter-16-system-design-patterns/05-api-gateway-patterns.md** (1847 lines)
- [x] **chapter-08-async-programming/04-distributed-async.md** (1608 lines) - 5개 섹션으로 분할 완료 (Distributed Transactions, Event Sourcing/CQRS, Message Streaming, Resilience Patterns, Production Case Study)
- [x] **chapter-06-file-io/02-vfs-filesystem.md** (1811 lines) - 6개 섹션으로 분할 완료
- [x] **chapter-07-network-programming/02-tcp-ip-stack.md** (1748 lines) - 4개 섹션으로 분할 완료
- [x] **chapter-15-security-engineering/03-authentication-authorization.md** (1641 lines) - 4개 섹션으로 분할 완료
- [x] **chapter-07-network-programming/04-secure-networking.md** (1675 lines)
- [x] **chapter-07-network-programming/03-high-performance.md** (1460 lines) - 4개 섹션으로 분할 완료 (C10K Scaling, Zero-Copy NUMA, Connection Pool Load Balancing, Protocol Optimization)
- [x] **chapter-04-process-thread/01-process-creation.md** (1518 lines)
- [x] **chapter-16-system-design-patterns/03-cqrs-event-sourcing.md** (1369 lines) - 5개 섹션으로 분할 완료 (CQRS Fundamentals, CQRS Pattern Implementation, Event Sourcing Implementation, Projection Implementation, Success Factors & Best Practices)
- [x] **chapter-04-process-thread/07-cpu-affinity-optimization.md** (1481 lines) - 5개 섹션으로 분할 완료 (Fundamentals, Bash Scripts, Python Advanced Manager, Performance Visualization, Optimization Strategies)
- [x] **chapter-07-network-programming/05-tcp-connection-debugging.md** (1328 lines) - 3개 섹션으로 분할 완료 (TCP Analysis Tools, Connection Pool Optimization, Real-time Monitoring)
- [x] **chapter-15-security-engineering/05-cryptography-key-management.md** (1286 lines) - 5개 섹션으로 분할 완료 (Cryptography Fundamentals, Practical Encryption, Key Management E2E, Performance Security, Monitoring Best Practices)
- [x] **chapter-05-cpu-interrupt/04-power-management.md** (1281 lines) - 5개 섹션으로 분할 완료 (Power Fundamentals, DVFS Frequency Scaling, C-State Idle Management, Turbo Boost, Optimization Monitoring)
- [x] **chapter-11-performance-optimization/04-io-optimization.md** (1216 lines) - 4개 섹션으로 분할 완료 (I/O Fundamentals, Async I/O, Network I/O, Disk Monitoring)
- [x] **chapter-07-network-programming/06-network-latency-optimization.md** (1186 lines) - 2개 섹션으로 분할 완료 (Latency Analysis Tools, Optimization Automation)
- [x] **chapter-09-memory-gc/04-memory-optimization.md** (1123 lines) - 4개 섹션으로 분할 완료 (Memory Leak Debugging, Zero-allocation Programming, Cache Optimization, Production Optimization)

---

## Quality Assurance Tasks

### todo

- [ ] **Markdown Linting**: 모든 새로 분할된 문서에 대해 `npm run lint:check` 실행
- [ ] **Mermaid Validation**: 모든 새로 분할된 문서의 Mermaid 다이어그램 검증 `npm run lint:mermaid`
- [ ] **Cross-reference Check**: 분할된 문서 간 상호 참조 링크 확인
- [ ] **Navigation Update**: 필요시 mkdocs.yml 네비게이션 구조 업데이트

### doing
<!-- 현재 진행 중인 작업들 -->

### done
<!-- 완료된 작업들 -->

---

## 작업 가이드라인

### document-splitter Agent 사용법

```bash
# 특정 문서 분할 작업
# Agent: document-splitter
# 작업: 1000+ 라인 문서를 읽기 쉬운 섹션으로 분할
# 결과: 개별 섹션 파일 + 종합 개요 문서 생성
```

### 검증 명령어

```bash
# 마크다운 린팅
npm run lint:check

# Mermaid 다이어그램 검증
npm run lint:mermaid

# 특정 폴더 검증
node scripts/validate-mermaid.js docs/cs/guide/chapter-XX/
```

### 작업 진행 방식

1. **Agent가 자동으로** todo에서 작업할 문서 선택
2. **작업 시작 즉시** 해당 문서를 doing으로 이동
3. **즉시** document-splitter agent로 문서 분할 작업 수행
4. 작업 완료 후 **done**으로 이동
5. QA 작업도 동일한 방식으로 진행

**중요**: Agent는 작업을 선택하는 즉시 바로 doing 섹션으로 이동시키고 분할 작업을 시작해야 함

### 우선순위

- Priority 1 문서들을 먼저 처리 (크기가 더 크고 긴급함)
- Priority 2 문서들은 Priority 1 완료 후 진행
- QA 작업은 각 Priority 그룹 완료 후 즉시 수행

### 참고 사항

- 각 문서는 보통 3-5개의 하위 섹션으로 분할됨
- 원본 문서는 개요 문서로 변환됨
- 모든 내부 링크와 상호 참조는 자동으로 업데이트됨
- Korean content의 자연스러운 흐름 유지 필수
