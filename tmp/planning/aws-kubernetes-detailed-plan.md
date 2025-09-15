# AWS Internals & Kubernetes 상세 작성 계획

## 📋 개요

AWS 메이저 서비스들과 Kubernetes에 대한 깊이 있는 기술 문서를 작성합니다. 단순 사용법이 아닌 **내부 동작 원리**와 **디버깅을 위한 이해**에 중점을 둡니다.

## 🎯 목표

- **AWS 서비스**: S3, ELB/ALB, VPC, EC2, RDS/Aurora, CloudFront 등의 내부 구현 원리
- **Kubernetes**: 아키텍처, 컴포넌트, 네트워킹, 스토리지, 스케일링 등의 깊은 이해
- **실전 중심**: 실제 장애 사례, 디버깅 방법, 성능 최적화
- **AWS 기반**: EKS와 AWS 서비스 통합 관점

## 📁 전체 디렉토리 구조

```text
docs/cs/
├── aws-internals/                  # AWS 서비스 내부 동작 원리
│   ├── index.md                    # AWS 전체 개요와 아키텍처
│   │
│   ├── s3/                         # S3 심화 (4개 문서)
│   │   ├── 01-architecture.md     # S3 아키텍처와 일관성 모델
│   │   ├── 02-storage-classes.md  # Storage Classes와 수명주기
│   │   ├── 03-performance.md      # 성능 최적화와 Request Rate
│   │   └── 04-debugging.md        # 트러블슈팅과 모니터링
│   │
│   ├── load-balancing/             # 로드밸런싱 (3개 문서)
│   │   ├── 01-elb-alb-basics.md  # ELB/ALB 기본 동작 원리
│   │   ├── 02-nlb-gwlb.md        # NLB/GWLB 특징과 사용 사례
│   │   └── 03-algorithms.md      # 라우팅 알고리즘과 헬스체크
│   │
│   ├── networking/                 # VPC 네트워킹 (4개 문서)
│   │   ├── 01-vpc-basics.md      # VPC 기본 구조와 CIDR
│   │   ├── 02-subnets-routing.md # 서브넷과 라우팅 테이블
│   │   ├── 03-security.md        # Security Groups와 NACLs
│   │   └── 04-advanced.md        # Peering, Transit Gateway, PrivateLink
│   │
│   ├── compute/                    # EC2 컴퓨팅 (3개 문서)
│   │   ├── 01-ec2-basics.md      # 인스턴스 타입과 선택 가이드
│   │   ├── 02-nitro-system.md    # Nitro System 아키텍처
│   │   └── 03-placement.md       # Placement Groups와 최적화
│   │
│   ├── database/                   # 데이터베이스 (3개 문서)
│   │   ├── 01-rds-architecture.md # RDS Multi-AZ와 Read Replica
│   │   ├── 02-aurora-storage.md   # Aurora 스토리지 엔진
│   │   └── 03-dynamodb.md        # DynamoDB 파티셔닝과 GSI
│   │
│   └── cloudfront/                 # CDN (2개 문서)
│       ├── 01-architecture.md     # CloudFront 글로벌 아키텍처
│       └── 02-optimization.md     # 캐싱 전략과 최적화
│
└── kubernetes/                      # Kubernetes 심화
    ├── index.md                    # Kubernetes 전체 개요
    │
    ├── architecture/               # 핵심 아키텍처 (3개 문서)
    │   ├── 01-overview.md         # 전체 아키텍처와 컴포넌트
    │   ├── 02-api-server.md       # API Server 내부 동작
    │   └── 03-etcd.md             # etcd 데이터 저장과 Watch
    │
    ├── workloads/                  # 워크로드 관리 (4개 문서)
    │   ├── 01-pods.md             # Pod 개념과 생명주기
    │   ├── 02-controllers.md      # ReplicaSet, Deployment 동작
    │   ├── 03-statefulsets.md     # StatefulSet과 상태 관리
    │   └── 04-jobs-cronjobs.md    # Job과 CronJob 스케줄링
    │
    ├── networking/                 # 네트워킹 (4개 문서)
    │   ├── 01-cluster-networking.md # 클러스터 네트워킹 모델
    │   ├── 02-services.md         # Service 타입별 동작 원리
    │   ├── 03-ingress.md          # Ingress와 Controller
    │   └── 04-cni-plugins.md      # CNI 플러그인 비교
    │
    ├── storage/                    # 스토리지 (3개 문서)
    │   ├── 01-volumes.md          # Volume 타입과 마운트
    │   ├── 02-persistent-volumes.md # PV/PVC 바인딩
    │   └── 03-csi-drivers.md      # CSI 드라이버 구현
    │
    ├── scheduling/                 # 스케줄링 (3개 문서)
    │   ├── 01-scheduler.md        # 스케줄러 알고리즘
    │   ├── 02-affinity.md         # Node/Pod Affinity
    │   └── 03-taints-tolerations.md # Taints와 Tolerations
    │
    ├── scaling/                    # 오토스케일링 (3개 문서)
    │   ├── 01-hpa.md              # HPA 메트릭과 동작
    │   ├── 02-vpa.md              # VPA 추천 엔진
    │   └── 03-cluster-autoscaler.md # 노드 스케일링
    │
    ├── security/                   # 보안 (3개 문서)
    │   ├── 01-rbac.md             # RBAC 상세 구현
    │   ├── 02-network-policies.md # Network Policy 적용
    │   └── 03-pod-security.md     # Pod Security Standards
    │
    └── eks/                        # AWS EKS 특화 (3개 문서)
        ├── 01-eks-architecture.md # EKS 관리형 아키텍처
        ├── 02-irsa.md             # IRSA 동작 원리
        └── 03-vpc-cni.md          # AWS VPC CNI 플러그인
```

## 📝 AWS Internals 상세 계획

### 1. S3 Deep Dive (s3/)

#### 1.1 `01-architecture.md` - S3 아키텍처와 일관성 모델

```markdown
# 주요 내용
- S3의 분산 아키텍처
  - Region과 AZ 구조
  - 파티션 서비스와 인덱스 서비스
  - 객체 저장 레이어
  
- 일관성 모델의 진화
  - Eventual Consistency (2020년 이전)
  - Strong Read-After-Write Consistency (현재)
  - List Consistency 보장
  
- 파티셔닝과 샤딩
  - Consistent Hashing (Ring)
  - 파티션 키 설계
  - 핫 파티션 방지
  
- 복제와 내구성
  - Cross-AZ 자동 복제
  - Erasure Coding (Reed-Solomon)
  - 99.999999999% 내구성 메커니즘

# 실전 내용
- 2017년 S3 대규모 장애 분석
- 파티션 오류 디버깅
- CloudWatch 메트릭 해석
```

#### 1.2 `02-storage-classes.md` - Storage Classes와 수명주기

```markdown
# 주요 내용
- Storage Class별 내부 구조
  - Standard: 3개 AZ 동기 복제
  - Standard-IA: 접근 패턴 추적
  - Intelligent-Tiering: 자동 계층화 알고리즘
  - Glacier: 아카이브 스토리지 구조
  - Deep Archive: 테이프 스토리지 활용
  
- 수명주기 정책 엔진
  - 규칙 평가 주기
  - 전환 비용 계산
  - 객체 태깅과 필터링
  
- 비용 최적화 전략
  - 접근 패턴 분석
  - Storage Class 선택 기준
  - 수명주기 정책 설계

# 실전 내용
- Glacier 복원 시간 예측
- Intelligent-Tiering 모니터링
- 비용 절감 사례
```

#### 1.3 `03-performance.md` - 성능 최적화와 Request Rate

```markdown
# 주요 내용
- Request Rate Guidelines
  - 프리픽스당 3,500 PUT/COPY/POST/DELETE
  - 프리픽스당 5,500 GET/HEAD
  - 자동 스케일링 메커니즘
  
- 프리픽스 샤딩 전략
  - 키 네이밍 패턴
  - 병렬 업로드 최적화
  - 랜덤 프리픽스 vs 계층적 프리픽스
  
- Transfer Acceleration
  - CloudFront 엣지 활용
  - 최적 경로 라우팅
  - 성능 비교 도구
  
- Multipart Upload
  - 청크 크기 최적화
  - 병렬 파트 업로드
  - 실패 처리와 재시도

# 실전 내용
- 대용량 데이터 마이그레이션
- 실시간 스트리밍 데이터 저장
- 성능 벤치마크 결과
```

#### 1.4 `04-debugging.md` - 트러블슈팅과 모니터링

```markdown
# 주요 내용
- 일반적인 에러와 해결
  - 403 Forbidden 원인 분석
  - 503 Service Unavailable 대응
  - RequestTimeout 해결
  
- CloudWatch 메트릭 활용
  - BucketSizeBytes 추적
  - NumberOfObjects 모니터링
  - AllRequests 분석
  
- S3 Access Logs 분석
  - 로그 포맷 해석
  - Athena를 통한 쿼리
  - 비정상 패턴 탐지
  
- AWS Support 도구
  - S3 Inventory
  - Storage Lens
  - Trusted Advisor

# 실전 내용
- 실제 장애 대응 사례
- 성능 저하 원인 분석
- 비용 이상 증가 디버깅
```

### 2. Load Balancing (load-balancing/)

#### 2.1 `01-elb-alb-basics.md` - ELB/ALB 기본 동작 원리

```markdown
# 주요 내용
- Classic ELB 아키텍처
  - Connection 처리 방식
  - Health Check 메커니즘
  - Cross-Zone 로드밸런싱
  
- Application Load Balancer (ALB)
  - Layer 7 라우팅
  - Target Group 개념
  - Connection Multiplexing
  - WebSocket 지원
  
- 내부 컴포넌트
  - Load Balancer 노드
  - ENI와 IP 할당
  - DNS 기반 스케일링
  
- 요청 라우팅 플로우
  - 리스너 규칙 평가
  - 타겟 선택 알고리즘
  - Connection Draining

# 실전 내용
- 502/503/504 에러 원인
- 지연시간 최적화
- 크로스존 비용 관리
```

#### 2.2 `02-nlb-gwlb.md` - NLB/GWLB 특징과 사용 사례

```markdown
# 주요 내용
- Network Load Balancer (NLB)
  - Layer 4 처리
  - Flow Hash 알고리즘
  - Static IP 지원
  - 초저지연 특성
  
- Gateway Load Balancer (GWLB)
  - GENEVE 프로토콜
  - 투명 네트워크 게이트웨이
  - 보안 어플라이언스 통합
  
- NLB vs ALB 선택 기준
  - 프로토콜 요구사항
  - 성능 요구사항
  - 비용 비교
  
- GWLB 아키텍처
  - Endpoint 서비스
  - Flow State 관리
  - Health Check 전파

# 실전 내용
- NLB로 게임 서버 구축
- GWLB로 보안 체인 구성
- 하이브리드 로드밸런싱
```

#### 2.3 `03-algorithms.md` - 라우팅 알고리즘과 헬스체크

```markdown
# 주요 내용
- 로드밸런싱 알고리즘
  - Round Robin (ALB)
  - Flow Hash (NLB)
  - Least Outstanding Requests
  - 가중치 기반 라우팅
  
- Health Check 상세
  - 체크 인터벌과 임계값
  - HTTP/HTTPS/TCP 체크
  - 커스텀 헬스체크 경로
  - 연속 실패 처리
  
- Connection 관리
  - Keep-Alive 타임아웃
  - Idle Timeout 설정
  - Connection Draining
  - Deregistration Delay
  
- 고급 라우팅 기능
  - 호스트 기반 라우팅
  - 경로 기반 라우팅
  - HTTP 헤더 라우팅
  - 쿼리 파라미터 라우팅

# 실전 내용
- 불균등 트래픽 분산 해결
- 헬스체크 튜닝
- Zero-Downtime 배포
```

### 3. VPC Networking (networking/)

#### 3.1 `01-vpc-basics.md` - VPC 기본 구조와 CIDR

```markdown
# 주요 내용
- VPC 내부 아키텍처
  - Virtual Router
  - Mapping Service
  - Blackfoot (네트워크 가상화)
  
- CIDR 블록 설계
  - Primary CIDR
  - Secondary CIDR
  - IPv6 CIDR
  - 서브넷 계산
  
- VPC 컴포넌트
  - Internet Gateway
  - NAT Gateway/Instance
  - VPC Endpoints
  - Route Tables
  
- 트래픽 플로우
  - Ingress 라우팅
  - Egress 라우팅
  - Local 라우팅

# 실전 내용
- CIDR 충돌 해결
- 네트워크 설계 패턴
- 멀티 VPC 아키텍처
```

#### 3.2 `02-subnets-routing.md` - 서브넷과 라우팅 테이블

```markdown
# 주요 내용
- 서브넷 타입과 특성
  - Public Subnet
  - Private Subnet
  - Database Subnet
  - AZ별 분산
  
- 라우팅 테이블 동작
  - 라우팅 우선순위
  - Longest Prefix Match
  - 명시적 vs 암시적 라우팅
  
- NAT Gateway 내부
  - 소스 NAT 처리
  - 포트 할당 풀
  - 고가용성 구성
  - 대역폭 스케일링
  
- VPC Endpoints
  - Gateway Endpoints (S3, DynamoDB)
  - Interface Endpoints (PrivateLink)
  - Endpoint Policy

# 실전 내용
- 라우팅 루프 방지
- NAT Gateway 비용 최적화
- Endpoint 성능 측정
```

#### 3.3 `03-security.md` - Security Groups와 NACLs

```markdown
# 주요 내용
- Security Groups
  - Stateful 방화벽
  - Connection Tracking
  - 규칙 평가 순서
  - 규칙 제한과 한계
  
- Network ACLs
  - Stateless 방화벽
  - 규칙 번호와 우선순위
  - 인바운드/아웃바운드 규칙
  - 서브넷 레벨 적용
  
- 보안 계층화
  - Defense in Depth
  - SG + NACL 조합
  - 규칙 최적화
  
- VPC Flow Logs
  - 로그 포맷 분석
  - 트래픽 패턴 분석
  - 보안 이벤트 탐지

# 실전 내용
- 보안 그룹 체인
- NACL 트러블슈팅
- Flow Logs로 공격 탐지
```

#### 3.4 `04-advanced.md` - Peering, Transit Gateway, PrivateLink

```markdown
# 주요 내용
- VPC Peering
  - Peering 연결 설정
  - 라우팅 구성
  - 제한사항과 한계
  - Cross-Region Peering
  
- Transit Gateway
  - Hub-and-Spoke 토폴로지
  - Route Table Association
  - Route Propagation
  - Multicast 지원
  
- AWS PrivateLink
  - Endpoint Service 생성
  - NLB 통합
  - Cross-Account 액세스
  - 가용성과 확장성
  
- Direct Connect
  - Virtual Interface (VIF)
  - BGP 라우팅
  - VLAN 태깅
  - 이중화 구성

# 실전 내용
- 복잡한 네트워크 토폴로지
- Transit Gateway 마이그레이션
- PrivateLink 보안 패턴
```

### 4. EC2 Compute (compute/)

#### 4.1 `01-ec2-basics.md` - 인스턴스 타입과 선택 가이드

```markdown
# 주요 내용
- 인스턴스 패밀리 상세
  - General Purpose (M, T)
  - Compute Optimized (C)
  - Memory Optimized (R, X, Z)
  - Storage Optimized (D, I)
  - Accelerated Computing (P, G, F)
  
- vCPU와 물리 코어
  - 하이퍼스레딩
  - CPU 크레딧 (T 인스턴스)
  - 버스트 성능
  
- 메모리와 네트워크
  - 네트워크 대역폭 할당
  - EBS 최적화
  - Enhanced Networking (SR-IOV)
  
- 인스턴스 선택 기준
  - 워크로드 프로파일링
  - 비용 최적화
  - 예약 인스턴스 vs 스팟

# 실전 내용
- 인스턴스 타입 마이그레이션
- 성능 벤치마킹
- 비용 분석 도구
```

#### 4.2 `02-nitro-system.md` - Nitro System 아키텍처

```markdown
# 주요 내용
- Nitro 하이퍼바이저
  - KVM 기반 경량 하이퍼바이저
  - 거의 베어메탈 성능
  - 메모리와 CPU 격리
  
- Nitro 카드
  - Nitro Card for VPC
  - Nitro Card for EBS
  - Nitro Card for Instance Storage
  - Nitro Security Chip
  
- 성능 이점
  - 하이퍼바이저 오버헤드 제거
  - 전용 하드웨어 오프로드
  - 일관된 성능 제공
  
- 보안 향상
  - 하드웨어 기반 보안
  - 암호화 가속
  - Secure Boot

# 실전 내용
- Nitro vs Xen 성능 비교
- Nitro 인스턴스 최적화
- 트러블슈팅 가이드
```

#### 4.3 `03-placement.md` - Placement Groups와 최적화

```markdown
# 주요 내용
- Placement Group 타입
  - Cluster: 저지연, 높은 처리량
  - Partition: 장애 격리
  - Spread: 가용성 극대화
  
- Cluster Placement
  - 10 Gbps 네트워크
  - 같은 랙 배치
  - HPC 워크로드
  
- 네트워크 최적화
  - Jumbo Frames (9000 MTU)
  - SR-IOV
  - Elastic Fabric Adapter (EFA)
  
- CPU 최적화
  - CPU Affinity
  - NUMA 노드 바인딩
  - 하이퍼스레딩 제어

# 실전 내용
- HPC 클러스터 구축
- 게임 서버 최적화
- 대규모 분산 처리
```

### 5. Database Services (database/)

#### 5.1 `01-rds-architecture.md` - RDS Multi-AZ와 Read Replica

```markdown
# 주요 내용
- Multi-AZ 구현
  - 동기식 복제
  - 자동 장애 조치
  - DNS 페일오버
  - 백업과 스냅샷
  
- Read Replica
  - 비동기 복제
  - 복제 지연 모니터링
  - Cross-Region 복제
  - 승격 프로세스
  
- 스토리지 엔진
  - General Purpose SSD (gp3)
  - Provisioned IOPS (io1/io2)
  - 자동 스토리지 스케일링
  
- 백업과 복원
  - 자동 백업 윈도우
  - 스냅샷 생성 프로세스
  - Point-in-Time Recovery
  - 백업 보존 정책

# 실전 내용
- 복제 지연 해결
- 페일오버 시간 단축
- 스토리지 성능 튜닝
```

#### 5.2 `02-aurora-storage.md` - Aurora 스토리지 엔진

```markdown
# 주요 내용
- Aurora 스토리지 아키텍처
  - 6-way 복제
  - 10GB 세그먼트
  - Quorum 기반 읽기/쓰기
  - 자가 치유 스토리지
  
- 로그 기반 스토리지
  - Redo 로그만 전송
  - 스토리지 노드에서 페이지 생성
  - 백그라운드 가비지 컬렉션
  
- 빠른 복제와 백트랙
  - Copy-on-Write 복제
  - 백트랙 윈도우
  - 스냅샷 없는 복원
  
- Global Database
  - 스토리지 레벨 복제
  - 1초 미만 복제 지연
  - Write Forwarding

# 실전 내용
- Aurora 마이그레이션
- 성능 벤치마킹
- 비용 최적화
```

#### 5.3 `03-dynamodb.md` - DynamoDB 파티셔닝과 GSI

```markdown
# 주요 내용
- 파티셔닝 전략
  - Consistent Hashing
  - 파티션 키 설계
  - 핫 파티션 방지
  - 자동 파티션 분할
  
- Global Secondary Index
  - 프로젝션 타입
  - GSI 파티셔닝
  - Eventually Consistent
  - GSI 오버로딩
  
- 용량 모드
  - Provisioned Capacity
  - On-Demand
  - Auto Scaling
  - Burst Capacity
  
- Streams와 Global Tables
  - Change Data Capture
  - Cross-Region 복제
  - Conflict Resolution
  - 글로벌 일관성

# 실전 내용
- 파티션 키 설계 패턴
- GSI 비용 최적화
- 글로벌 테이블 구축
```

### 6. CloudFront CDN (cloudfront/)

#### 6.1 `01-architecture.md` - CloudFront 글로벌 아키텍처

```markdown
# 주요 내용
- Edge Location 네트워크
  - 전 세계 450+ PoP
  - Regional Edge Cache
  - Origin Shield
  - 엣지 서버 선택 알고리즘
  
- 요청 라우팅
  - DNS 기반 라우팅
  - Anycast IP
  - 최적 엣지 선택
  - 장애 감지와 우회
  
- 오리진 연결
  - Origin Connection Pooling
  - Keep-Alive 최적화
  - Origin Failover
  - Custom Origin Headers
  
- SSL/TLS 처리
  - SNI 지원
  - SSL 인증서 관리
  - OCSP Stapling
  - TLS 1.3 지원

# 실전 내용
- 글로벌 배포 전략
- 엣지 최적화
- 오리진 보호
```

#### 6.2 `02-optimization.md` - 캐싱 전략과 최적화

```markdown
# 주요 내용
- 캐싱 동작
  - Cache Key 구성
  - TTL 설정
  - Cache Behaviors
  - Invalidation
  
- 성능 최적화
  - Compression
  - HTTP/2와 HTTP/3
  - Persistent Connections
  - Range Requests
  
- 동적 콘텐츠 가속
  - Dynamic Content Caching
  - Personalized Content
  - API Acceleration
  - WebSocket 지원
  
- 비용 최적화
  - Price Class 선택
  - Origin Request 최소화
  - CloudFront 보고서 분석
  - Reserved Capacity

# 실전 내용
- 캐시 히트율 개선
- 실시간 스트리밍 설정
- A/B 테스팅 구현
```

## 📝 Kubernetes 상세 계획

### 1. Architecture (architecture/)

#### 1.1 `01-overview.md` - 전체 아키텍처와 컴포넌트

```markdown
# 주요 내용
- Kubernetes 아키텍처
  - Control Plane 구성요소
  - Worker Node 구성요소
  - 애드온 컴포넌트
  - 클러스터 네트워킹
  
- 컴포넌트 간 통신
  - API Server 중심 아키텍처
  - gRPC 통신
  - Watch 메커니즘
  - 이벤트 전파
  
- 클러스터 부트스트랩
  - kubeadm 프로세스
  - 인증서 생성
  - 정적 Pod 매니페스트
  - 클러스터 조인
  
- 고가용성 구성
  - Control Plane HA
  - etcd 클러스터링
  - 로드밸런서 구성

# 실전 내용
- 클러스터 구축 자동화
- 컴포넌트 장애 대응
- 업그레이드 전략
```

#### 1.2 `02-api-server.md` - API Server 내부 동작

```markdown
# 주요 내용
- HTTP 요청 처리 파이프라인
  - Authentication (인증)
  - Authorization (인가)
  - Admission Control
  - Validation
  - etcd 저장
  
- 인증 메커니즘
  - X.509 클라이언트 인증서
  - Bearer 토큰
  - ServiceAccount 토큰
  - OIDC 토큰
  
- 인가 모드
  - RBAC
  - ABAC
  - Node Authorization
  - Webhook
  
- Admission Controllers
  - Mutating Admission
  - Validating Admission
  - Dynamic Admission
  - 주요 컨트롤러 동작

# 실전 내용
- API Server 성능 튜닝
- 커스텀 Admission Webhook
- 감사(Audit) 로깅
```

#### 1.3 `03-etcd.md` - etcd 데이터 저장과 Watch

```markdown
# 주요 내용
- etcd 아키텍처
  - Raft 합의 알고리즘
  - Leader Election
  - 로그 복제
  - 스냅샷
  
- 데이터 모델
  - Key-Value 저장
  - 리비전과 버전
  - 트랜잭션
  - 리스/TTL
  
- Watch 메커니즘
  - Watch 이벤트 스트림
  - 리소스 버전
  - Bookmark
  - 이벤트 압축
  
- 운영과 관리
  - 백업과 복원
  - Compaction
  - Defragmentation
  - 성능 모니터링

# 실전 내용
- etcd 장애 복구
- 대규모 클러스터 스케일링
- etcd 성능 최적화
```

### 2. Workloads (workloads/)

#### 2.1 `01-pods.md` - Pod 개념과 생명주기

```markdown
# 주요 내용
- Pod 아키텍처
  - 공유 네트워크 네임스페이스
  - 공유 스토리지
  - Pause 컨테이너
  - 컨테이너 간 통신
  
- Pod 생명주기
  - Pending → Running → Succeeded/Failed
  - Init Containers
  - Container Lifecycle Hooks
  - 종료 과정
  
- Pod 스펙
  - 리소스 요청과 제한
  - QoS 클래스
  - Security Context
  - Pod Disruption Budget
  
- 상태 체크
  - Liveness Probe
  - Readiness Probe
  - Startup Probe
  - 프로브 설정 최적화

# 실전 내용
- Pod 디버깅 기법
- 리소스 최적화
- 안정적인 종료 구현
```

#### 2.2 `02-controllers.md` - ReplicaSet, Deployment 동작

```markdown
# 주요 내용
- ReplicaSet 컨트롤러
  - Reconciliation Loop
  - 레플리카 관리
  - Pod 템플릿
  - 오너 레퍼런스
  
- Deployment 컨트롤러
  - 롤링 업데이트
  - Recreate 전략
  - 롤백 메커니즘
  - 리비전 히스토리
  
- 업데이트 전략 상세
  - maxSurge/maxUnavailable
  - 프로그레시브 롤아웃
  - 카나리 배포
  - 블루/그린 배포
  
- 스케일링
  - 수동 스케일링
  - HPA 통합
  - 스케일링 이벤트

# 실전 내용
- Zero-downtime 배포
- 롤백 자동화
- 배포 모니터링
```

#### 2.3 `03-statefulsets.md` - StatefulSet과 상태 관리

```markdown
# 주요 내용
- StatefulSet 특징
  - 순서 보장 배포
  - 안정적인 네트워크 식별자
  - 영속적 스토리지
  - 순차적 스케일링
  
- Pod 식별자
  - Ordinal Index
  - 안정적인 호스트명
  - Headless Service
  - DNS 레코드
  
- 스토리지 관리
  - VolumeClaimTemplate
  - PVC 바인딩
  - 데이터 영속성
  - 스토리지 스케일링
  
- 업데이트 전략
  - RollingUpdate
  - OnDelete
  - Partition
  - 병렬 vs 순차

# 실전 내용
- 데이터베이스 클러스터 구축
- 분산 시스템 배포
- 데이터 마이그레이션
```

#### 2.4 `04-jobs-cronjobs.md` - Job과 CronJob 스케줄링

```markdown
# 주요 내용
- Job 컨트롤러
  - 완료 보장
  - 병렬 처리
  - 재시도 정책
  - TTL 메커니즘
  
- 병렬 처리 패턴
  - Fixed Completion Count
  - Work Queue
  - Indexed Job
  - 병렬도 제어
  
- CronJob 스케줄링
  - Cron 표현식
  - 시간대 처리
  - Concurrency Policy
  - 실패 처리
  
- Job 패턴
  - 배치 처리
  - 데이터 파이프라인
  - 백업 작업
  - 정리 작업

# 실전 내용
- 대규모 배치 처리
- 작업 큐 구현
- 스케줄링 최적화
```

### 3. Networking (networking/)

#### 3.1 `01-cluster-networking.md` - 클러스터 네트워킹 모델

```markdown
# 주요 내용
- Kubernetes 네트워킹 원칙
  - 모든 Pod 간 NAT 없는 통신
  - Node와 Pod 간 NAT 없는 통신
  - Pod가 보는 IP = 외부에서 보는 IP
  
- 네트워크 구현
  - Overlay 네트워크
  - 라우팅 기반 네트워크
  - 클라우드 프로바이더 통합
  
- Pod 네트워킹
  - veth pair
  - 브리지 네트워크
  - 네임스페이스
  - iptables 규칙
  
- 클러스터 DNS
  - CoreDNS 아키텍처
  - 서비스 디스커버리
  - DNS 정책
  - 성능 최적화

# 실전 내용
- 네트워크 트러블슈팅
- DNS 디버깅
- 네트워크 정책 설계
```

#### 3.2 `02-services.md` - Service 타입별 동작 원리

```markdown
# 주요 내용
- ClusterIP Service
  - 가상 IP 할당
  - iptables/IPVS 규칙
  - 엔드포인트 관리
  - 세션 어피니티
  
- NodePort Service
  - 포트 할당 범위
  - 노드 프록시
  - 외부 트래픽 정책
  - 소스 IP 보존
  
- LoadBalancer Service
  - 클라우드 프로바이더 통합
  - 로드밸런서 프로비저닝
  - 헬스체크 설정
  - 비용 고려사항
  
- ExternalName Service
  - CNAME 레코드
  - 외부 서비스 통합
  - 사용 사례

# 실전 내용
- 서비스 메시 통합
- 로드밸런싱 최적화
- 트래픽 분산 전략
```

#### 3.3 `03-ingress.md` - Ingress와 Controller

```markdown
# 주요 내용
- Ingress 리소스
  - 라우팅 규칙
  - TLS 종료
  - 호스트/경로 기반 라우팅
  - 리다이렉트/리라이트
  
- Ingress Controller
  - NGINX Controller
  - AWS ALB Controller
  - Traefik
  - HAProxy
  
- TLS/SSL 관리
  - 인증서 관리
  - cert-manager 통합
  - Let's Encrypt
  - 인증서 로테이션
  
- 고급 기능
  - Rate Limiting
  - 인증/인가
  - 카나리 배포
  - A/B 테스팅

# 실전 내용
- 멀티 도메인 구성
- Zero-downtime 인증서 갱신
- 성능 최적화
```

#### 3.4 `04-cni-plugins.md` - CNI 플러그인 비교

```markdown
# 주요 내용
- CNI 인터페이스
  - CNI 스펙
  - 플러그인 체인
  - IPAM
  - 플러그인 구성
  
- 주요 CNI 플러그인
  - Flannel: 심플한 오버레이
  - Calico: 정책 기반 네트워킹
  - Weave: 메시 네트워크
  - Cilium: eBPF 기반
  
- AWS VPC CNI (EKS)
  - ENI 할당
  - Secondary IP
  - Pod 당 실제 VPC IP
  - 제한사항과 최적화
  
- 성능 비교
  - 레이턴시
  - 처리량
  - CPU 오버헤드
  - 확장성

# 실전 내용
- CNI 마이그레이션
- 네트워크 정책 구현
- 성능 벤치마킹
```

### 4. Storage (storage/)

#### 4.1 `01-volumes.md` - Volume 타입과 마운트

```markdown
# 주요 내용
- Volume 기본 개념
  - 임시 vs 영구 스토리지
  - Volume 수명주기
  - 마운트 전파
  
- Volume 타입
  - emptyDir
  - hostPath
  - configMap/secret
  - downwardAPI
  - projected
  
- 클라우드 볼륨
  - AWS EBS
  - Azure Disk
  - GCP Persistent Disk
  
- 마운트 옵션
  - ReadWriteOnce/Many
  - 파일시스템 vs 블록
  - 마운트 옵션
  - 서브패스

# 실전 내용
- 볼륨 성능 최적화
- 데이터 공유 패턴
- 백업 전략
```

#### 4.2 `02-persistent-volumes.md` - PV와 PVC 바인딩

```markdown
# 주요 내용
- PV/PVC 아키텍처
  - 정적 vs 동적 프로비저닝
  - 바인딩 메커니즘
  - 스토리지 클래스
  - 리클레임 정책
  
- 동적 프로비저닝
  - 프로비저너 동작
  - 파라미터 전달
  - 볼륨 생성 흐름
  
- PVC 바인딩
  - 셀렉터와 매칭
  - 용량 요청
  - 액세스 모드
  - 바인딩 지연
  
- 볼륨 확장
  - 온라인 확장
  - 파일시스템 리사이즈
  - 제한사항

# 실전 내용
- 스토리지 마이그레이션
- 스냅샷과 복원
- 멀티 테넌시
```

#### 4.3 `03-csi-drivers.md` - CSI 드라이버 구현

```markdown
# 주요 내용
- CSI 아키텍처
  - Controller Service
  - Node Service
  - Identity Service
  - gRPC 인터페이스
  
- CSI 드라이버 컴포넌트
  - External Provisioner
  - External Attacher
  - External Snapshotter
  - External Resizer
  
- 주요 CSI 드라이버
  - AWS EBS CSI
  - AWS EFS CSI
  - Azure Disk CSI
  - 오픈소스 드라이버
  
- 볼륨 작업
  - 생성/삭제
  - 연결/분리
  - 마운트/언마운트
  - 스냅샷

# 실전 내용
- CSI 드라이버 선택
- 성능 튜닝
- 장애 처리
```

### 5. Scheduling (scheduling/)

#### 5.1 `01-scheduler.md` - 스케줄러 알고리즘

```markdown
# 주요 내용
- 스케줄링 프로세스
  - 필터링 (Predicates)
  - 스코어링 (Priorities)
  - 바인딩
  - 프리엠션
  
- 필터링 단계
  - 노드 리소스
  - 노드 셀렉터
  - 어피니티 규칙
  - Taints/Tolerations
  
- 스코어링 단계
  - 리소스 균형
  - 이미지 로컬리티
  - 스프레딩
  - 커스텀 우선순위
  
- 스케줄링 프레임워크
  - 확장 포인트
  - 플러그인 시스템
  - 커스텀 스케줄러

# 실전 내용
- 스케줄링 성능 최적화
- 커스텀 스케줄러 구현
- 스케줄링 문제 디버깅
```

#### 5.2 `02-affinity.md` - Node/Pod Affinity

```markdown
# 주요 내용
- Node Affinity
  - Required vs Preferred
  - 노드 라벨 셀렉터
  - 표현식 연산자
  - 스케줄링 시 vs 실행 시
  
- Pod Affinity
  - Pod 간 배치 규칙
  - 토폴로지 키
  - 동일 노드/존/리전
  
- Pod Anti-Affinity
  - 분산 배치
  - 고가용성 보장
  - 장애 도메인 분리
  
- 토폴로지 스프레드
  - maxSkew
  - 균등 분산
  - 존 인식 배치

# 실전 내용
- HA 워크로드 배치
- 데이터 로컬리티 최적화
- 멀티 테넌시 격리
```

#### 5.3 `03-taints-tolerations.md` - Taints와 Tolerations

```markdown
# 주요 내용
- Taint 메커니즘
  - NoSchedule
  - PreferNoSchedule
  - NoExecute
  - Taint 이펙트
  
- Toleration 매칭
  - Equal 연산자
  - Exists 연산자
  - 와일드카드
  - TolerationSeconds
  
- 사용 사례
  - 전용 노드
  - GPU 노드
  - 노드 유지보수
  - 스팟 인스턴스
  
- 노드 상태와 Taint
  - 노드 압력
  - 네트워크 불가
  - 디스크 압력
  - PID 압력

# 실전 내용
- 노드 풀 관리
- 점진적 노드 교체
- 워크로드 격리
```

### 6. Scaling (scaling/)

#### 6.1 `01-hpa.md` - HPA 메트릭과 동작

```markdown
# 주요 내용
- HPA 아키텍처
  - 컨트롤 루프
  - 메트릭 수집
  - 스케일링 결정
  - 쿨다운 기간
  
- 메트릭 타입
  - Resource 메트릭 (CPU/Memory)
  - Custom 메트릭
  - External 메트릭
  - ContainerResource
  
- 스케일링 알고리즘
  - 목표값 계산
  - 레플리카 수 결정
  - 스케일링 속도 제어
  - 플래핑 방지
  
- 고급 설정
  - 스케일링 정책
  - Behavior 설정
  - 다중 메트릭
  - 조건부 스케일링

# 실전 내용
- 메트릭 서버 구성
- 커스텀 메트릭 구현
- 스케일링 튜닝
```

#### 6.2 `02-vpa.md` - VPA 추천 엔진

```markdown
# 주요 내용
- VPA 컴포넌트
  - Recommender
  - Updater
  - Admission Controller
  - 히스토리 저장
  
- 추천 알고리즘
  - 히스토그램 기반
  - 백분위수 계산
  - 안전 마진
  - 경계값 설정
  
- 업데이트 모드
  - Off: 추천만
  - Initial: 생성 시만
  - Auto: 자동 업데이트
  - Recreate vs In-place
  
- HPA와 통합
  - 상호 배타적 메트릭
  - 조합 전략
  - 우선순위

# 실전 내용
- 리소스 최적화
- 비용 절감
- 안정성 보장
```

#### 6.3 `03-cluster-autoscaler.md` - 노드 스케일링

```markdown
# 주요 내용
- Cluster Autoscaler 동작
  - 스케일 업 트리거
  - 스케일 다운 조건
  - 노드 그룹 관리
  - 클라우드 프로바이더 통합
  
- 스케일 업 프로세스
  - Pending Pod 감지
  - 노드 그룹 선택
  - 시뮬레이션
  - 노드 프로비저닝
  
- 스케일 다운 프로세스
  - 노드 활용도 체크
  - 이동 가능성 확인
  - 그레이스풀 종료
  - 노드 제거
  
- 최적화 설정
  - 스케일 다운 지연
  - 노드 그룹 우선순위
  - 비용 최적화
  - 가용성 보장

# 실전 내용
- 멀티 노드 그룹 전략
- 스팟 인스턴스 활용
- 스케일링 이벤트 모니터링
```

### 7. Security (security/)

#### 7.1 `01-rbac.md` - RBAC 상세 구현

```markdown
# 주요 내용
- RBAC 모델
  - Role/ClusterRole
  - RoleBinding/ClusterRoleBinding
  - ServiceAccount
  - 권한 상속
  
- 규칙 정의
  - API 그룹
  - 리소스
  - 동사 (Verbs)
  - 리소스 이름
  
- 권한 집계
  - ClusterRole 집계
  - 라벨 셀렉터
  - 기본 역할
  
- 베스트 프랙티스
  - 최소 권한 원칙
  - 네임스페이스 격리
  - 감사 로깅
  - 정기 검토

# 실전 내용
- 멀티 테넌시 구현
- CI/CD 권한 설정
- 권한 에스컬레이션 방지
```

#### 7.2 `02-network-policies.md` - Network Policy 적용

```markdown
# 주요 내용
- NetworkPolicy 스펙
  - Pod 셀렉터
  - 정책 타입
  - Ingress/Egress 규칙
  - 포트와 프로토콜
  
- 셀렉터 메커니즘
  - 라벨 셀렉터
  - 네임스페이스 셀렉터
  - IP 블록
  - 조합 규칙
  
- CNI 플러그인 지원
  - Calico
  - Cilium
  - Weave
  - 구현 차이
  
- 정책 패턴
  - 기본 거부
  - 화이트리스트
  - 네임스페이스 격리
  - 외부 트래픽 제어

# 실전 내용
- 제로 트러스트 네트워크
- 마이크로세그멘테이션
- 정책 테스팅
```

#### 7.3 `03-pod-security.md` - Pod Security Standards

```markdown
# 주요 내용
- Pod Security Standards
  - Privileged
  - Baseline
  - Restricted
  - 정책 레벨
  
- Security Context
  - runAsUser/Group
  - fsGroup
  - SELinux
  - Capabilities
  - Seccomp
  - AppArmor
  
- Pod Security Admission
  - 네임스페이스 라벨
  - 정책 모드
  - 버전 고정
  - 예외 처리
  
- 컨테이너 보안
  - 읽기 전용 루트
  - 비특권 실행
  - 리소스 제한
  - 이미지 스캔

# 실전 내용
- 보안 강화 마이그레이션
- 컴플라이언스 구현
- 런타임 보안
```

### 8. EKS Specific (eks/)

#### 8.1 `01-eks-architecture.md` - EKS 관리형 아키텍처

```markdown
# 주요 내용
- EKS Control Plane
  - 관리형 마스터 노드
  - 멀티 AZ 배포
  - 자동 스케일링
  - 버전 업그레이드
  
- 데이터 플레인
  - 관리형 노드 그룹
  - 자체 관리 노드
  - Fargate 프로파일
  - Bottlerocket OS
  
- 네트워킹 통합
  - VPC 통합
  - 서브넷 태깅
  - 보안 그룹
  - 엔드포인트
  
- EKS 애드온
  - VPC CNI
  - CoreDNS
  - kube-proxy
  - EBS CSI Driver

# 실전 내용
- EKS 클러스터 구축
- 업그레이드 전략
- 비용 최적화
```

#### 8.2 `02-irsa.md` - IRSA 동작 원리

```markdown
# 주요 내용
- IRSA 아키텍처
  - OIDC Provider
  - ServiceAccount 어노테이션
  - Pod Identity Webhook
  - STS AssumeRole
  
- 토큰 교환 플로우
  - ServiceAccount 토큰
  - OIDC 검증
  - IAM Role 가정
  - 임시 자격 증명
  
- 구성 요소
  - OIDC Provider 생성
  - IAM Role 신뢰 정책
  - ServiceAccount 설정
  - Pod 환경 변수
  
- SDK 통합
  - AWS SDK 자동 감지
  - 토큰 갱신
  - 폴백 체인

# 실전 내용
- IRSA 마이그레이션
- 권한 최소화
- 트러블슈팅
```

#### 8.3 `03-vpc-cni.md` - AWS VPC CNI 플러그인

```markdown
# 주요 내용
- VPC CNI 아키텍처
  - L-IPAM 데몬
  - CNI 바이너리
  - ipamd
  - aws-node DaemonSet
  
- ENI 관리
  - ENI 할당
  - Secondary IP 관리
  - Warm Pool
  - IP 재사용
  
- 네트워킹 모드
  - Bridge 모드
  - ENI 트렁킹 (Fargate)
  - Security Group per Pod
  - 사용자 정의 네트워킹
  
- 제한사항과 최적화
  - 인스턴스별 ENI 제한
  - IP 고갈
  - 서브넷 설계
  - SNAT 설정

# 실전 내용
- 대규모 클러스터 IP 관리
- 네트워크 성능 최적화
- IPv6 마이그레이션
```

## 📅 작성 일정

### Week 1: 기초 구조 수립

- AWS Internals index.md 작성
- Kubernetes index.md 작성
- S3 아키텍처 문서 (01-architecture.md)
- Kubernetes 전체 아키텍처 (01-overview.md)

### Week 2: 핵심 서비스

- ELB/ALB 기본 동작 (01-elb-alb-basics.md)
- VPC 기본 구조 (01-vpc-basics.md)
- Pod 생명주기 (01-pods.md)
- Service 타입별 동작 (02-services.md)

### Week 3: 심화 내용

- S3 성능 최적화 (03-performance.md)
- Nitro System (02-nitro-system.md)
- API Server 내부 (02-api-server.md)
- HPA 동작 원리 (01-hpa.md)

### Week 4: 고급 주제

- Aurora 스토리지 엔진 (02-aurora-storage.md)
- CloudFront 최적화 (02-optimization.md)
- EKS 아키텍처 (01-eks-architecture.md)
- IRSA 구현 (02-irsa.md)

### Week 5-6: 나머지 문서 완성

- 모든 디렉토리의 나머지 문서들
- 크로스 레퍼런스 추가
- 실전 예제 보강

## 🎯 품질 기준

### 각 문서마다 포함되어야 할 요소

1. **개요** (왜 중요한가?)
2. **아키텍처 다이어그램** (Mermaid)
3. **내부 동작 원리** (의사 코드 포함)
4. **실제 설정 예제** (YAML, JSON)
5. **성능 고려사항** (벤치마크 데이터)
6. **트러블슈팅 가이드** (일반적인 문제)
7. **실전 경험** (장애 사례, 해결 방법)
8. **추가 리소스** (공식 문서, 논문)

### 코드 예제 기준

- 실행 가능한 완전한 코드
- 주석으로 설명 추가
- 에러 처리 포함
- 프로덕션 레벨 품질

### 다이어그램 기준

- Mermaid 다이어그램 적극 활용
- 복잡한 플로우는 시퀀스 다이어그램
- 아키텍처는 그래프 다이어그램
- 상태 변화는 상태 다이어그램

## 📊 예상 결과

- **총 문서 수**: 약 50-60개
- **문서당 분량**: 1,500-2,000줄
- **총 분량**: 80,000-100,000줄
- **다이어그램**: 200개 이상
- **코드 예제**: 500개 이상
- **완독 시간**: 약 30-40시간

## 🔗 연관 문서 참조

### AWS 문서 간 참조

- S3 → CloudFront (오리진)
- VPC → ELB/ALB (네트워킹)
- EC2 → Auto Scaling (컴퓨팅)
- RDS → VPC (보안)

### Kubernetes 문서 간 참조

- Pod → Service (네트워킹)
- Deployment → HPA (스케일링)
- PV/PVC → StatefulSet (스토리지)
- RBAC → ServiceAccount (보안)

### AWS-Kubernetes 통합

- EKS → VPC CNI
- IRSA → IAM
- ALB Controller → ELB/ALB
- EBS CSI → EBS

## ✅ 완료 기준

1. 모든 문서가 1,500줄 이상
2. 각 주제별로 실전 사례 포함
3. 프로덕션 레벨의 코드 예제
4. 명확한 트러블슈팅 가이드
5. 성능 최적화 방법 제시
6. mkdocs.yml에 통합 완료

---

*이 계획은 실제 작성 과정에서 조정될 수 있습니다.*
*우선순위는 사용 빈도와 중요도에 따라 결정됩니다.*
