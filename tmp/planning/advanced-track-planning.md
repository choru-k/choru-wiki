# Advanced Track 상세 계획

> "알면 좋지만 필수는 아닌" 최첨단 기술들
> 현재 가이드를 마스터한 엔지니어를 위한 다음 단계

---

## Advanced Track 구성 원칙

### 대상

- 시니어 엔지니어 (7년차 이상)
- 특정 분야 전문가
- 연구개발 담당자
- 오픈소스 컨트리뷰터

### 특징

- **실무 필수 X, 전문가 영역 O**
- **de facto가 아닌 cutting-edge**
- **특정 도메인에 특화**
- **논문 레벨의 깊이**

---

## Track 1: Kernel & System Programming

### 1.1 Kernel Development

#### Linux Kernel Module 개발

**대상**: 커널 레벨 최적화가 필요한 경우

```markdown
- kernel module 작성
- character/block device driver
- kernel debugging (kgdb, crash)
- kernel patch 제출 프로세스
```

#### Custom Scheduler 구현

```markdown
- CFS scheduler 분석
- custom scheduling class
- real-time scheduling
- CPU isolation 고급
```

### 1.2 eBPF Advanced

#### eBPF 컴파일러 이해

**대상**: eBPF 프로그램을 직접 만들고 싶은 경우

```markdown
- BPF bytecode 이해
- verifier 동작 원리
- JIT compilation
- BTF (BPF Type Format)
```

#### XDP 프로그래밍

```markdown
- XDP action types
- hardware offload
- AF_XDP socket
- XDP redirect
```

### 1.3 DPDK & Kernel Bypass

#### DPDK 심화

**대상**: 초고속 패킷 처리가 필요한 경우

```markdown
- PMD (Poll Mode Driver) 작성
- rte_mbuf 구조 최적화
- multi-queue NIC 활용
- NUMA-aware 패킷 처리
```

#### RDMA Programming

```markdown
- InfiniBand verbs
- RoCE vs iWARP
- GPUDirect RDMA
- persistent memory over fabric
```

---

## Track 2: Compiler & Language Runtime

### 2.1 LLVM Backend

#### Custom Backend 개발

**대상**: 새로운 아키텍처 지원이 필요한 경우

```markdown
- TableGen으로 instruction 정의
- SelectionDAG 이해
- register allocation
- instruction scheduling
```

#### Optimization Pass 작성

```markdown
- LLVM IR 변환
- custom optimization pass
- profile-guided optimization
- link-time optimization 구현
```

### 2.2 JIT Compiler

#### Custom JIT 구현

**대상**: 도메인 특화 언어를 만드는 경우

```markdown
- baseline JIT vs optimizing JIT
- inline caching
- deoptimization
- on-stack replacement
```

#### V8/SpiderMonkey 내부

```markdown
- hidden class transition
- inline cache 구현
- generational GC 구현
- concurrent marking
```

### 2.3 GC Algorithm Implementation

#### Concurrent GC 구현

```markdown
- tri-color marking
- write barrier 구현
- concurrent sweeping
- generational hypothesis
```

#### Reference Counting 최적화

```markdown
- cycle detection
- deferred reference counting
- concurrent RC
- weighted reference counting
```

---

## Track 3: Distributed Systems Theory

### 3.1 Consensus Implementation

#### Paxos 구현

**대상**: 분산 합의 시스템을 직접 만드는 경우

```markdown
- Basic Paxos
- Multi-Paxos
- Fast Paxos
- Flexible Paxos
```

#### Byzantine Fault Tolerance

```markdown
- PBFT 구현
- HotStuff 알고리즘
- blockchain consensus
- proof of stake
```

### 3.2 Distributed Database

#### LSM Tree 구현

**대상**: 고성능 스토리지 엔진이 필요한 경우

```markdown
- memtable 구현
- SSTable format
- compaction strategy
- bloom filter 최적화
```

#### B-Tree 변형

```markdown
- B+ tree 구현
- fractal tree
- bw-tree
- ART (Adaptive Radix Tree)
```

### 3.3 Stream Processing

#### Custom Stream Processor

```markdown
- watermark 처리
- exactly-once semantics
- state management
- checkpoint/recovery
```

#### CEP (Complex Event Processing)

```markdown
- pattern matching
- temporal operators
- sliding window join
- out-of-order handling
```

---

## Track 4: Performance Engineering

### 4.1 Lock-free Programming

#### Lock-free Data Structures

**대상**: 극한의 동시성 성능이 필요한 경우

```markdown
- CAS operations
- ABA problem 해결
- hazard pointer
- epoch-based reclamation
```

#### Memory Ordering

```markdown
- memory barrier 종류
- acquire-release semantics
- sequential consistency
- relaxed ordering 활용
```

### 4.2 SIMD Programming

#### Vector Instructions

**대상**: 수치 연산 최적화가 필요한 경우

```markdown
- SSE/AVX/AVX-512
- ARM NEON
- auto-vectorization
- intrinsics 사용법
```

#### GPU Computing

```markdown
- CUDA programming
- OpenCL
- memory coalescing
- warp divergence
```

### 4.3 Cache Optimization

#### Cache-oblivious Algorithms

```markdown
- cache-oblivious B-tree
- matrix multiplication
- FFT 구현
- funnel sort
```

#### NUMA Optimization

```markdown
- memory placement
- thread affinity
- remote memory access
- page migration
```

---

## Track 5: Network Innovation

### 5.1 SDN & Programmable Networks

#### P4 Programming

**대상**: 네트워크 데이터 평면을 프로그래밍하는 경우

```markdown
- P4 language 문법
- match-action table
- stateful processing
- INT (In-band Network Telemetry)
```

#### OpenFlow Controller

```markdown
- flow table 관리
- packet-in/packet-out
- topology discovery
- load balancing 구현
```

### 5.2 Next-gen Protocols

#### QUIC Implementation

**대상**: HTTP/3 스택을 직접 구현하는 경우

```markdown
- connection migration
- 0-RTT handshake
- stream multiplexing
- congestion control (BBR)
```

#### Custom Protocol Design

```markdown
- protocol buffer 설계
- state machine 구현
- flow control 메커니즘
- error recovery
```

### 5.3 Edge Computing

#### Mobile Edge Computing

```markdown
- computation offloading
- edge caching
- mobility management
- energy optimization
```

#### CDN Internals

```markdown
- cache hierarchy
- request routing
- content replication
- anycast routing
```

---

## Track 6: Security Research

### 6.1 Vulnerability Research

#### Fuzzing

**대상**: 보안 취약점을 찾는 연구자

```markdown
- AFL++ 사용과 개선
- libFuzzer 통합
- grammar-based fuzzing
- differential fuzzing
```

#### Symbolic Execution

```markdown
- constraint solving
- path explosion 처리
- concolic execution
- angr framework
```

### 6.2 Exploit Development

#### Modern Exploitation

```markdown
- ROP/JOP chains
- heap exploitation
- kernel exploitation
- browser exploitation
```

#### Mitigation Bypass

```markdown
- ASLR bypass
- CFI bypass
- sandboxing escape
- container escape
```

### 6.3 Cryptography Engineering

#### Post-quantum Cryptography

```markdown
- lattice-based crypto
- hash-based signatures
- code-based crypto
- implementation 보안
```

#### Zero-knowledge Proofs

```markdown
- zk-SNARKs
- zk-STARKs
- bulletproofs
- circuit 설계
```

---

## Track 7: ML Systems

### 7.1 ML Compiler

#### Graph Optimization

**대상**: ML 모델 최적화 연구자

```markdown
- operator fusion
- memory planning
- kernel generation
- quantization
```

#### Hardware Acceleration

```markdown
- TPU programming
- NPU optimization
- mixed precision
- sparsity 활용
```

### 7.2 Distributed Training

#### Parameter Server

```markdown
- gradient aggregation
- asynchronous SGD
- elastic training
- fault tolerance
```

#### Pipeline Parallelism

```markdown
- GPipe 구현
- PipeDream
- memory optimization
- bubble 최소화
```

---

## Track 8: Quantum Computing

### 8.1 Quantum Algorithms

#### Basic Algorithms

**대상**: 양자 컴퓨팅 연구자

```markdown
- Shor's algorithm
- Grover's algorithm
- quantum Fourier transform
- variational algorithms
```

#### Quantum Error Correction

```markdown
- stabilizer codes
- surface codes
- logical qubits
- fault-tolerant gates
```

### 8.2 Quantum Simulators

#### State Vector Simulation

```markdown
- tensor network
- MPS/MPO
- GPU acceleration
- noise modeling
```

---

## 학습 리소스

### 논문 추천

```markdown
- Systems: OSDI, SOSP, NSDI
- Security: USENIX Security, S&P, CCS
- Networking: SIGCOMM, NSDI
- Databases: VLDB, SIGMOD
```

### 오픈소스 프로젝트

```markdown
- Linux Kernel
- LLVM
- DPDK
- Apache Arrow
- etcd/consul
```

### 온라인 코스

```markdown
- MIT 6.824 (Distributed Systems)
- Stanford CS140 (Operating Systems)
- CMU 15-445 (Database Systems)
```

---

## Advanced Track 선택 가이드

### 질문 체크리스트

1. **현재 업무에 필요한가?** → No면 Advanced
2. **대부분의 회사에서 쓰는가?** → No면 Advanced
3. **전문가만 다루는가?** → Yes면 Advanced
4. **논문을 읽어야 이해되는가?** → Yes면 Advanced

### 경력 경로별 추천

- **백엔드 → 시스템**: Track 1, 4
- **DevOps → SRE**: Track 3, 5
- **보안 엔지니어**: Track 6
- **컴파일러 엔지니어**: Track 2
- **ML 엔지니어**: Track 7
- **연구원**: Track 8

---

## 주의사항

### Advanced Track은

- ❌ 이력서를 위한 것이 아님
- ❌ 모두가 배워야 하는 것이 아님
- ✅ 특정 문제를 해결하기 위한 것
- ✅ 깊은 호기심을 충족하기 위한 것
- ✅ 전문가가 되기 위한 것

### 학습 전 고려사항

1. **시간 투자**: 각 트랙 최소 6개월
2. **선수 지식**: Chapter 1-15 완전 이해
3. **실습 환경**: 고성능 하드웨어 필요할 수 있음
4. **커뮤니티**: 혼자 학습하기 어려움
