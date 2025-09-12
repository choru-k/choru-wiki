---
tags:
  - DistributedSystems
  - Raft
  - Consensus
  - Leadership
  - Guide
---

# 14.2 합의 알고리즘 - 분산된 노드들이 하나가 되는 방법

## 서론: 2020년 3월 코로나와 함께 온 분산 시스템의 현실

코로나19가 터지고 재택근무가 시작된 첫 주, 우리 회사의 마이크로서비스들이 이상하게 동작하기 시작했습니다. 집에서 VPN으로 접속하다 보니 네트워크가 불안정해졌고, 서비스들 간의 통신에 문제가 생겼던 것입니다.

### 🔥 3월 16일 월요일 오전 9시: 리더가 사라진 클러스터

```bash
# 평소 우리 Redis Cluster (3대)
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Node 1    │  │   Node 2    │  │   Node 3    │  
│  (Master)   │  │  (Replica)  │  │  (Replica)  │
│   Seoul     │  │   Busan     │  │   Gwangju   │
└─────────────┘  └─────────────┘  └─────────────┘
      │                 │                 │
      └─────── Stable Network ──────────┘

# 재택근무 시작 후 - 네트워크 불안정
┌─────────────┐      X      ┌─────────────┐      X      ┌─────────────┐
│   Node 1    │ <─ 지연 ─> │   Node 2    │ <─ 끊김 ─> │   Node 3    │  
│  (Master?)  │             │ (Master?)   │             │ (Master?)   │
│   Seoul     │             │   Busan     │             │   Gwangju   │
└─────────────┘             └─────────────┘             └─────────────┘

# 로그에서 발견된 참사
[ERROR] Multiple masters detected!
[ERROR] Split-brain scenario occurred!
[ERROR] Data inconsistency detected!
```

**오전 9:30 - 개발팀 패닉 상황**

```python
# 각 노드가 스스로를 마스터라고 주장
def check_cluster_status():
    nodes = ['seoul', 'busan', 'gwangju']
    
    for node in nodes:
        response = redis.execute_command(f"{node}:6379", "INFO replication")
        print(f"{node}: {response['role']}")

# 출력 결과 - 대참사
# seoul: role=master, connected_slaves=0
# busan: role=master, connected_slaves=0  
# gwangju: role=master, connected_slaves=0

# 😱 3개의 마스터가 동시에 존재!
# 😱 각자 다른 데이터를 쓰고 있음!
# 😱 클라이언트는 어디에 연결해야 할지 모름!
```

**문제의 근본 원인**: **합의 알고리즘의 부재**

우리는 단순한 마스터-슬레이브 구조를 썼는데, 네트워크 분할이 발생했을 때 "누가 진짜 리더인가?"를 결정할 방법이 없었던 것입니다.

이때 저는 **Raft 합의 알고리즘**을 처음 접하게 되었습니다.

## Raft 알고리즘: "이해할 수 있는" 합의 알고리즘

### 🎯 Raft의 핵심 아이디어

**Diego Ongaro & John Ousterhout (Stanford, 2014)**:
> "합의 알고리즘은 복잡하지만, 이해할 수 있어야 한다"

Raft는 복잡한 Paxos 알고리즘을 대체하기 위해 **이해하기 쉽게** 설계된 합의 알고리즘입니다.

```mermaid
graph TD
    subgraph "Raft의 3가지 핵심 요소"
        LE[Leader Election<br/>리더 선출<br/>"누가 보스인가?"]
        LR[Log Replication<br/>로그 복제<br/>"명령어를 어떻게 동기화?"]
        S[Safety<br/>안전성<br/>"일관성을 어떻게 보장?"]
    end
    
    subgraph "노드 상태"
        F[Follower<br/>팔로워<br/>"명령어 수신"]
        C[Candidate<br/>후보자<br/>"선거 진행"]  
        L[Leader<br/>리더<br/>"명령어 발행"]
    end
    
    LE --> F
    LE --> C
    LE --> L
    
    LR --> L
    S --> L
    
    style F fill:#e3f2fd
    style C fill:#fff3e0
    style L fill:#c8e6c9
```

### 🗳️ Phase 1: Leader Election (리더 선출)

#### 상황 1: 정상적인 리더 선출

```python
class RaftNode:
    def __init__(self, node_id, peers):
        self.node_id = node_id
        self.peers = peers  # 다른 노드들의 주소
        self.state = "follower"  # 초기 상태
        self.current_term = 0    # 현재 임기
        self.voted_for = None    # 이번 임기에 누구를 찍었는가
        self.log = []           # 명령어 로그
        self.last_heartbeat = time.time()
        
    def start_election(self):
        """선거 시작!"""
        print(f"Node {self.node_id}: 선거를 시작합니다!")
        
        # 1. 후보자가 됨
        self.state = "candidate"  
        self.current_term += 1    # 임기 증가
        self.voted_for = self.node_id  # 자기 자신에게 투표
        
        votes_received = 1  # 자기 표 1개
        
        # 2. 다른 노드들에게 투표 요청
        for peer in self.peers:
            try:
                response = self.request_vote(peer)
                if response.get('vote_granted'):
                    votes_received += 1
                    print(f"Node {peer}: {self.node_id}에게 투표!")
                    
            except NetworkException:
                print(f"Node {peer}: 네트워크 오류로 투표 불가")
        
        # 3. 과반수 득표 확인
        required_votes = len(self.peers) // 2 + 1
        
        if votes_received >= required_votes:
            print(f"Node {self.node_id}: 리더가 되었습니다! ({votes_received}표)")
            self.become_leader()
        else:
            print(f"Node {self.node_id}: 선거 실패 ({votes_received}표)")
            self.state = "follower"
    
    def request_vote(self, peer_id):
        """다른 노드에게 투표 요청"""
        request = {
            'term': self.current_term,
            'candidate_id': self.node_id,
            'last_log_index': len(self.log) - 1,
            'last_log_term': self.log[-1]['term'] if self.log else 0
        }
        
        return self.send_rpc(peer_id, "vote_request", request)
    
    def handle_vote_request(self, request):
        """투표 요청 처리"""
        candidate_term = request['term']
        candidate_id = request['candidate_id']
        
        # 투표 조건 검사
        should_vote = (
            candidate_term > self.current_term and  # 더 높은 임기
            (self.voted_for is None or self.voted_for == candidate_id) and  # 아직 투표 안함
            self.is_candidate_up_to_date(request)  # 후보자의 로그가 최신
        )
        
        if should_vote:
            self.current_term = candidate_term
            self.voted_for = candidate_id
            self.state = "follower"  # 더 높은 임기 발견 시 팔로워로
            
            print(f"Node {self.node_id}: {candidate_id}에게 투표합니다!")
            return {'vote_granted': True, 'term': self.current_term}
        else:
            print(f"Node {self.node_id}: {candidate_id}에게 투표 거부")
            return {'vote_granted': False, 'term': self.current_term}

# 실제 선거 시뮬레이션
def simulate_election():
    # 5개 노드 클러스터
    nodes = {
        'A': RaftNode('A', ['B', 'C', 'D', 'E']),
        'B': RaftNode('B', ['A', 'C', 'D', 'E']), 
        'C': RaftNode('C', ['A', 'B', 'D', 'E']),
        'D': RaftNode('D', ['A', 'B', 'C', 'E']),
        'E': RaftNode('E', ['A', 'B', 'C', 'D'])
    }
    
    # 노드 A가 선거 시작
    nodes['A'].start_election()
    
    # 결과 예시:
    # Node A: 선거를 시작합니다!
    # Node B: A에게 투표!
    # Node C: A에게 투표!  
    # Node D: 네트워크 오류로 투표 불가
    # Node E: A에게 투표!
    # Node A: 리더가 되었습니다! (4표)
```

#### 상황 2: Split Vote (분할 투표) 해결

```python
def simulate_split_vote():
    """동시에 여러 후보가 나타날 때"""
    
    # Term 5에서 A와 C가 동시에 선거 시작
    print("=== Term 5 Split Vote 시나리오 ===")
    
    # A의 선거 (B, D로부터 득표)
    print("Node A: 선거 시작! (term=5)")
    print("Node B: A에게 투표!")
    print("Node D: A에게 투표!")  
    print("Node A: 2표 획득")
    
    # C의 선거 (동시 진행, E로부터 득표)  
    print("Node C: 선거 시작! (term=5)")
    print("Node E: C에게 투표!")
    print("Node C: 1표 획득")
    
    # 아무도 과반수 획득 못함 (5개 중 3표 필요)
    print("결과: 과반수 획득자 없음 - 선거 무효!")
    
    # 랜덤 타임아웃 후 재선거
    time.sleep(random.uniform(1, 3))  # 랜덤 대기로 동시 선거 방지
    
    print("=== Term 6 재선거 ===")
    print("Node C: 재선거 시작! (term=6)")
    print("Node A: C에게 투표! (더 높은 term)")
    print("Node B: C에게 투표!")
    print("Node D: C에게 투표!")
    print("Node E: 이미 C에게 투표함!")
    print("Node C: 리더가 되었습니다! (4표)")

# Raft의 핵심: 랜덤 타임아웃으로 Split Vote 방지
ELECTION_TIMEOUT = random.uniform(150, 300)  # 150~300ms
```

### 📝 Phase 2: Log Replication (로그 복제)

리더가 선출되면, 모든 명령어(write 요청)를 로그에 기록하고 팔로워들에게 복제합니다.

```python
class RaftLog:
    def __init__(self):
        self.entries = []  # 로그 엔트리들
        self.commit_index = 0  # 커밋된 인덱스
        
    def append_entry(self, term, command):
        """새 엔트리 추가"""
        entry = {
            'term': term,
            'index': len(self.entries),
            'command': command,
            'committed': False
        }
        self.entries.append(entry)
        return entry['index']

class RaftLeader(RaftNode):
    def __init__(self, node_id, peers):
        super().__init__(node_id, peers)
        self.state = "leader"
        self.next_index = {}  # 각 팔로워의 다음 로그 인덱스
        self.match_index = {} # 각 팔로워의 복제된 최대 인덱스
        
        # 초기화
        for peer in peers:
            self.next_index[peer] = len(self.log)
            self.match_index[peer] = 0
    
    def client_request(self, command):
        """클라이언트 요청 처리"""
        print(f"Leader {self.node_id}: 새 명령어 '{command}' 수신")
        
        # 1. 로컬 로그에 추가
        entry_index = self.log_append(self.current_term, command)
        print(f"Leader {self.node_id}: 로그[{entry_index}] = '{command}'")
        
        # 2. 팔로워들에게 복제 요청
        replicas_confirmed = 0
        
        for peer in self.peers:
            try:
                success = self.replicate_to_peer(peer, entry_index)
                if success:
                    replicas_confirmed += 1
                    print(f"Peer {peer}: 로그[{entry_index}] 복제 완료")
                    
            except NetworkException:
                print(f"Peer {peer}: 네트워크 오류로 복제 실패")
        
        # 3. 과반수 복제 확인 후 커밋
        required_replicas = len(self.peers) // 2
        
        if replicas_confirmed >= required_replicas:
            self.commit_entry(entry_index)
            print(f"Leader {self.node_id}: 로그[{entry_index}] 커밋됨!")
            return "SUCCESS"
        else:
            print(f"Leader {self.node_id}: 복제 실패 - 롤백 필요")
            return "FAILED"
    
    def replicate_to_peer(self, peer_id, entry_index):
        """특정 피어에게 로그 엔트리 복제"""
        prev_log_index = self.next_index[peer_id] - 1
        prev_log_term = self.log[prev_log_index]['term'] if prev_log_index >= 0 else 0
        
        request = {
            'term': self.current_term,
            'leader_id': self.node_id,
            'prev_log_index': prev_log_index,
            'prev_log_term': prev_log_term,
            'entries': self.log[self.next_index[peer_id]:entry_index+1],
            'leader_commit': self.commit_index
        }
        
        response = self.send_append_entries(peer_id, request)
        
        if response.get('success'):
            # 성공: 인덱스 업데이트
            self.next_index[peer_id] = entry_index + 1
            self.match_index[peer_id] = entry_index
            return True
        else:
            # 실패: 로그 불일치 - 백트래킹
            self.next_index[peer_id] = max(0, self.next_index[peer_id] - 1)
            return False
    
    def send_heartbeat(self):
        """하트비트 전송 (리더십 유지)"""
        for peer in self.peers:
            try:
                request = {
                    'term': self.current_term,
                    'leader_id': self.node_id,
                    'prev_log_index': len(self.log) - 1,
                    'prev_log_term': self.log[-1]['term'] if self.log else 0,
                    'entries': [],  # 빈 엔트리 = 하트비트
                    'leader_commit': self.commit_index
                }
                
                self.send_append_entries(peer, request)
                
            except NetworkException:
                print(f"Peer {peer}: 하트비트 전송 실패")

# 실제 로그 복제 시뮬레이션  
def simulate_log_replication():
    leader = RaftLeader('A', ['B', 'C', 'D', 'E'])
    
    # 클라이언트 요청들
    commands = ['SET x=1', 'SET y=2', 'DELETE z', 'SET x=5']
    
    for cmd in commands:
        print(f"\n=== 클라이언트 요청: {cmd} ===")
        result = leader.client_request(cmd)
        print(f"결과: {result}")
        time.sleep(0.1)  # 네트워크 지연 시뮬레이션
    
    # 최종 로그 상태 출력
    print(f"\n=== 최종 로그 상태 ===")
    for i, entry in enumerate(leader.log):
        status = "✅ COMMITTED" if entry['committed'] else "⏳ PENDING"  
        print(f"Log[{i}]: {entry['command']} (term={entry['term']}) {status}")

# 예상 출력:
# === 클라이언트 요청: SET x=1 ===
# Leader A: 새 명령어 'SET x=1' 수신
# Leader A: 로그[0] = 'SET x=1'
# Peer B: 로그[0] 복제 완료
# Peer C: 로그[0] 복제 완료  
# Peer D: 네트워크 오류로 복제 실패
# Peer E: 로그[0] 복제 완료
# Leader A: 로그[0] 커밋됨!
# 결과: SUCCESS
```

### 🛡️ Phase 3: Safety (안전성 보장)

Raft의 핵심은 **"커밋된 로그 엔트리는 절대 변경되지 않는다"**는 보장입니다.

#### Log Matching Property

```python
def verify_log_matching_property():
    """로그 매칭 속성 검증"""
    
    # 속성 1: 같은 인덱스와 텀을 가진 엔트리는 같은 명령어를 저장한다
    def check_same_entry(node1_log, node2_log, index, term):
        entry1 = node1_log[index]
        entry2 = node2_log[index]
        
        if entry1['term'] == term and entry2['term'] == term:
            assert entry1['command'] == entry2['command'], \
                f"Same index/term but different commands: {entry1} vs {entry2}"
            return True
    
    # 속성 2: 같은 인덱스와 텀을 가진 엔트리는 이전 모든 엔트리도 같다
    def check_prefix_property(node1_log, node2_log, index, term):
        entry1 = node1_log[index]
        entry2 = node2_log[index]
        
        if entry1['term'] == term and entry2['term'] == term:
            # 이전 모든 엔트리들도 일치해야 함
            for i in range(index):
                assert node1_log[i] == node2_log[i], \
                    f"Prefix mismatch at index {i}: {node1_log[i]} vs {node2_log[i]}"
            return True

# 실제 시나리오: 로그 불일치 해결
def simulate_log_inconsistency_resolution():
    """네트워크 분할 후 로그 불일치 해결"""
    
    print("=== 네트워크 분할 상황 시뮬레이션 ===")
    
    # 초기 상태: 모든 노드가 동일한 로그
    initial_log = [
        {'index': 0, 'term': 1, 'command': 'SET x=1'},
        {'index': 1, 'term': 1, 'command': 'SET y=2'}
    ]
    
    # 분할 발생: A, B vs C, D, E
    partition1_leader = 'A'
    partition1_nodes = ['A', 'B']
    
    partition2_leader = 'C'  # 새 리더 선출됨 (term=2)
    partition2_nodes = ['C', 'D', 'E']
    
    # 각 분할에서 독립적으로 로그 추가
    partition1_log = initial_log + [
        {'index': 2, 'term': 1, 'command': 'SET x=10'},  # A가 혼자 추가
    ]
    
    partition2_log = initial_log + [  
        {'index': 2, 'term': 2, 'command': 'SET z=3'},   # C가 새 term에서 추가
        {'index': 3, 'term': 2, 'command': 'DELETE y'}   # C가 또 추가
    ]
    
    print("분할 중 로그 상태:")
    print(f"Partition 1 (A,B): {[e['command'] for e in partition1_log]}")
    print(f"Partition 2 (C,D,E): {[e['command'] for e in partition2_log]}")
    
    # 분할 해결: C가 더 높은 term이므로 새 리더
    print("\n=== 분할 해결: C가 새 리더 ===")
    
    # A와 B는 C의 로그를 받아들여야 함
    def resolve_conflict(follower_log, leader_log):
        print(f"충돌 해결 중...")
        
        # 공통 접두사 찾기
        common_index = 0
        for i in range(min(len(follower_log), len(leader_log))):
            if follower_log[i] == leader_log[i]:
                common_index = i + 1
            else:
                break
        
        print(f"공통 로그: index 0~{common_index-1}")
        print(f"충돌 지점: index {common_index}")
        
        # 충돌 지점 이후 로그 삭제 후 리더 로그로 교체
        resolved_log = leader_log.copy()
        
        print(f"해결된 로그: {[e['command'] for e in resolved_log]}")
        return resolved_log
    
    # A와 B의 로그를 C의 로그로 수정
    final_log = resolve_conflict(partition1_log, partition2_log)
    
    print(f"\n=== 최종 일치된 로그 ===")
    for entry in final_log:
        print(f"Log[{entry['index']}]: {entry['command']} (term={entry['term']})")

# 예상 출력:
# 분할 중 로그 상태:
# Partition 1 (A,B): ['SET x=1', 'SET y=2', 'SET x=10']
# Partition 2 (C,D,E): ['SET x=1', 'SET y=2', 'SET z=3', 'DELETE y']
# 
# === 분할 해결: C가 새 리더 ===
# 충돌 해결 중...
# 공통 로그: index 0~1
# 충돌 지점: index 2  
# 해결된 로그: ['SET x=1', 'SET y=2', 'SET z=3', 'DELETE y']
```

## 🏛️ Byzantine Fault Tolerance (비잔틴 장애 허용)

Raft는 **Crash Fault**만 고려합니다. 하지만 악의적인 노드나 임의 동작 노드가 있다면?

### 🎭 비잔틴 장군 문제

```mermaid
graph TD
    subgraph "비잔틴 장군 문제"
        G1[장군 A<br/>"공격하자"]
        G2[장군 B<br/>"공격하자"]  
        G3[장군 C<br/>"후퇴하자"<br/>(배신자)]
        G4[장군 D<br/>"공격하자"]
    end
    
    subgraph "메시지 전달"
        G1 --> |공격| G2
        G1 --> |공격| G3
        G1 --> |공격| G4
        
        G3 --> |후퇴| G2
        G3 --> |후퇴| G4
        G3 --> |공격| G1
    end
    
    subgraph "문제점"
        P1[배신자가 다른 말을<br/>각 장군에게 전달]
        P2[어떤 메시지가<br/>진실인지 알 수 없음]
        P3[합의 불가능]
    end
    
    style G3 fill:#ffcdd2
    style P1 fill:#ffcdd2
    style P2 fill:#ffcdd2  
    style P3 fill:#ffcdd2
```

### ⚔️ PBFT (Practical Byzantine Fault Tolerance) 구현

```python
class PBFTNode:
    """PBFT 알고리즘 구현"""
    
    def __init__(self, node_id, total_nodes):
        self.node_id = node_id
        self.total_nodes = total_nodes
        self.f = (total_nodes - 1) // 3  # 최대 허용 비잔틴 노드 수
        self.view = 0  # 현재 뷰 (리더 임기 같은 개념)
        self.sequence_number = 0
        
        # PBFT 3단계
        self.pre_prepare_msgs = {}
        self.prepare_msgs = {}  
        self.commit_msgs = {}
        
    def client_request(self, request):
        """클라이언트 요청 처리 (Primary만)"""
        if not self.is_primary():
            return "Not primary"
            
        self.sequence_number += 1
        
        # 1단계: Pre-prepare 단계
        pre_prepare_msg = {
            'view': self.view,
            'sequence': self.sequence_number,
            'request': request,
            'digest': self.hash(request)
        }
        
        print(f"Primary {self.node_id}: Pre-prepare for '{request}'")
        
        # 모든 백업 노드에게 Pre-prepare 전송
        for node_id in range(self.total_nodes):
            if node_id != self.node_id:
                self.send_pre_prepare(node_id, pre_prepare_msg)
        
        return self.execute_pbft_consensus(pre_prepare_msg)
    
    def handle_pre_prepare(self, msg):
        """Pre-prepare 메시지 처리 (Backup 노드)"""
        view = msg['view']
        sequence = msg['sequence']
        request = msg['request']
        digest = msg['digest']
        
        # 검증: 같은 뷰/시퀀스에서 다른 요청이 오지 않았는가?
        key = (view, sequence)
        if key in self.pre_prepare_msgs:
            existing_digest = self.pre_prepare_msgs[key]['digest']
            if existing_digest != digest:
                print(f"Node {self.node_id}: Pre-prepare 충돌 감지! 무시함")
                return
        
        # Pre-prepare 저장
        self.pre_prepare_msgs[key] = msg
        
        print(f"Node {self.node_id}: Pre-prepare 수락 - '{request}'")
        
        # 2단계: Prepare 단계 시작
        prepare_msg = {
            'view': view,
            'sequence': sequence,
            'digest': digest,
            'node_id': self.node_id
        }
        
        # 모든 다른 노드에게 Prepare 전송
        for node_id in range(self.total_nodes):
            if node_id != self.node_id:
                self.send_prepare(node_id, prepare_msg)
        
        self.check_prepare_phase(view, sequence, digest)
    
    def handle_prepare(self, msg):
        """Prepare 메시지 처리"""
        view = msg['view']
        sequence = msg['sequence'] 
        digest = msg['digest']
        sender = msg['node_id']
        
        key = (view, sequence, digest)
        
        if key not in self.prepare_msgs:
            self.prepare_msgs[key] = set()
        
        self.prepare_msgs[key].add(sender)
        
        print(f"Node {self.node_id}: Prepare from {sender}")
        
        self.check_prepare_phase(view, sequence, digest)
    
    def check_prepare_phase(self, view, sequence, digest):
        """Prepare 단계 완료 확인"""
        key = (view, sequence, digest)
        
        # 2f개 이상의 Prepare 메시지 수집 (자신 포함하면 2f+1)
        prepare_count = len(self.prepare_msgs.get(key, set()))
        
        if prepare_count >= 2 * self.f:
            print(f"Node {self.node_id}: Prepare 단계 완료 ({prepare_count}개 수집)")
            
            # 3단계: Commit 단계 시작
            commit_msg = {
                'view': view,
                'sequence': sequence,
                'digest': digest, 
                'node_id': self.node_id
            }
            
            for node_id in range(self.total_nodes):
                if node_id != self.node_id:
                    self.send_commit(node_id, commit_msg)
            
            self.check_commit_phase(view, sequence, digest)
    
    def handle_commit(self, msg):
        """Commit 메시지 처리""" 
        view = msg['view']
        sequence = msg['sequence']
        digest = msg['digest']
        sender = msg['node_id']
        
        key = (view, sequence, digest)
        
        if key not in self.commit_msgs:
            self.commit_msgs[key] = set()
        
        self.commit_msgs[key].add(sender)
        
        print(f"Node {self.node_id}: Commit from {sender}")
        
        self.check_commit_phase(view, sequence, digest)
    
    def check_commit_phase(self, view, sequence, digest):
        """Commit 단계 완료 확인"""
        key = (view, sequence, digest)
        
        # 2f+1개 이상의 Commit 메시지 수집
        commit_count = len(self.commit_msgs.get(key, set())) + 1  # 자신 포함
        
        if commit_count >= 2 * self.f + 1:
            print(f"Node {self.node_id}: Commit 단계 완료! 요청 실행")
            
            # 실제 요청 실행
            pre_prepare = self.pre_prepare_msgs[(view, sequence)]
            request = pre_prepare['request']
            
            result = self.execute_request(request)
            print(f"Node {self.node_id}: '{request}' 실행 완료 → {result}")
            
            return result
    
    def is_primary(self):
        """현재 노드가 Primary인가?"""
        return self.node_id == (self.view % self.total_nodes)

# PBFT 시뮬레이션: 비잔틴 노드가 있어도 합의 달성
def simulate_pbft_with_byzantine():
    """비잔틴 노드 포함 PBFT 시뮬레이션"""
    
    print("=== PBFT with Byzantine Node ===")
    print("총 7개 노드, 최대 2개 비잔틴 노드 허용")
    
    # 7개 노드 네트워크 (f=2, 2개까지 비잔틴 노드 허용)
    nodes = []
    for i in range(7):
        nodes.append(PBFTNode(i, 7))
    
    # 노드 2, 5를 비잔틴 노드로 설정 (악의적 행동)
    byzantine_nodes = {2, 5}
    
    # Primary 노드 0이 클라이언트 요청 처리
    print("\n--- 클라이언트 요청: 'TRANSFER $100 Alice->Bob' ---")
    
    request = "TRANSFER $100 Alice->Bob"
    primary = nodes[0]
    
    # 정상 시뮬레이션 (비잔틴 노드들이 다른 메시지 전송)
    for i, node in enumerate(nodes):
        if i == 0:  # Primary
            continue
        elif i in byzantine_nodes:
            # 비잔틴 노드: 다른 요청을 주장
            print(f"👹 Byzantine Node {i}: 가짜 메시지 전송 'TRANSFER $1000 Alice->Malicious'")
            # 실제로는 다른 digest를 가진 메시지를 보냄
        else:
            # 정상 노드: 올바른 처리
            print(f"✅ Honest Node {i}: 정상 처리")
    
    print(f"\n--- 결과 분석 ---")
    print(f"정상 노드 5개 >= 2f+1=5 → 합의 달성!")
    print(f"비잔틴 노드 2개 <= f=2 → 공격 실패!")
    print(f"최종 합의: '{request}' 실행")

# 실행
simulate_pbft_with_byzantine()
```

## ⚡ 성능 최적화: MultiRaft & Parallel Raft

실제 시스템에서는 단일 Raft 그룹의 성능 한계가 있습니다.

### 📊 MultiRaft 아키텍처

```python
class MultiRaftSystem:
    """여러 Raft 그룹을 관리하는 시스템"""
    
    def __init__(self):
        self.raft_groups = {}  # shard_id -> RaftGroup
        self.shard_config = ShardingConfig()
        
    def get_raft_group(self, key):
        """키에 해당하는 Raft 그룹 찾기"""
        shard_id = self.shard_config.get_shard(key)
        
        if shard_id not in self.raft_groups:
            # 새 Raft 그룹 생성
            self.raft_groups[shard_id] = RaftGroup(
                shard_id=shard_id,
                nodes=self.get_nodes_for_shard(shard_id)
            )
        
        return self.raft_groups[shard_id]
    
    def write(self, key, value):
        """분산 쓰기 (적절한 Raft 그룹에 전달)"""
        raft_group = self.get_raft_group(key)
        return raft_group.write(key, value)
    
    def read(self, key):
        """분산 읽기"""
        raft_group = self.get_raft_group(key)
        return raft_group.read(key)

# 실제 사용 예시
multi_raft = MultiRaftSystem()

# 다른 샤드의 키들이 병렬로 처리됨
multi_raft.write("user:123", "Alice")    # Shard 1
multi_raft.write("user:456", "Bob")      # Shard 2  
multi_raft.write("order:789", "Order1")  # Shard 3

# 각 샤드가 독립적으로 Raft 합의 진행
# 전체 처리량 = 단일 Raft의 N배 (N = 샤드 수)
```

## 🎯 실전 적용: 우리가 선택한 합의 시스템

### etcd를 활용한 서비스 디스커버리

```yaml
# etcd 클러스터 구성 (3개 노드)
apiVersion: v1
kind: Pod
metadata:
  name: etcd
spec:
  containers:
  - name: etcd
    image: quay.io/coreos/etcd:v3.4.18
    command:
    - etcd
    - --name=node1
    - --data-dir=/etcd-data
    - --listen-client-urls=http://0.0.0.0:2379
    - --advertise-client-urls=http://node1:2379
    - --listen-peer-urls=http://0.0.0.0:2380
    - --initial-advertise-peer-urls=http://node1:2380
    - --initial-cluster=node1=http://node1:2380,node2=http://node2:2380,node3=http://node3:2380
    - --initial-cluster-state=new
```

```python
# etcd 클라이언트 활용
import etcd3

class ServiceRegistry:
    def __init__(self):
        self.etcd = etcd3.client(host='localhost', port=2379)
        
    def register_service(self, service_name, instance_id, address):
        """서비스 인스턴스 등록"""
        key = f"/services/{service_name}/{instance_id}"
        value = json.dumps({
            'address': address,
            'registered_at': time.time(),
            'health': 'healthy'
        })
        
        # TTL과 함께 등록 (자동 만료)
        lease = self.etcd.lease(30)  # 30초 TTL
        self.etcd.put(key, value, lease=lease)
        
        # 주기적 갱신으로 연결 유지
        self.keep_alive(lease)
        
    def discover_services(self, service_name):
        """서비스 인스턴스 목록 조회"""
        prefix = f"/services/{service_name}/"
        
        instances = []
        for value, metadata in self.etcd.get_prefix(prefix):
            instance_data = json.loads(value.decode())
            instances.append(instance_data)
        
        return instances
    
    def watch_service_changes(self, service_name):
        """서비스 변경사항 실시간 감지"""
        prefix = f"/services/{service_name}/"
        
        events_iterator, cancel = self.etcd.watch_prefix(prefix)
        
        for event in events_iterator:
            if event.type == etcd3.events.EventType.PUT:
                print(f"Service added: {event.key}")
            elif event.type == etcd3.events.EventType.DELETE:
                print(f"Service removed: {event.key}")

# 사용 예시
registry = ServiceRegistry()

# 서비스 등록
registry.register_service("user-service", "instance-1", "10.0.1.100:8080")
registry.register_service("user-service", "instance-2", "10.0.1.101:8080")

# 서비스 발견
instances = registry.discover_services("user-service") 
print(f"Available instances: {len(instances)}")

# 변경사항 모니터링
registry.watch_service_changes("user-service")
```

## 💡 합의 알고리즘에서 배운 핵심 교훈

### 1. 완벽한 네트워크는 없다

```bash
✅ 받아들여야 할 현실:
- 네트워크 분할은 발생한다
- 메시지 손실과 지연은 정상이다  
- 노드 장애는 언제든 일어날 수 있다
- 시계 동기화는 불완전하다
```

### 2. 과반수의 힘

```bash
🗳️ Raft의 핵심 원리:
- 과반수 동의 = 안전한 진행
- 분할 상황에서도 최대 1개 그룹만 진행 가능
- "Split-brain" 문제 원천 차단
```

### 3. 성능 vs 일관성 트레이드오프

```python
# 강한 일관성 (Raft)
- 모든 읽기/쓰기가 리더를 거침
- 높은 일관성, 낮은 성능

# 약한 일관성 (읽기 최적화)  
- 팔로워에서도 읽기 허용
- 높은 성능, 약간의 지연된 데이터 가능

# 선택은 비즈니스 요구사항에 따라
```

### 4. 관찰 가능성의 중요성

```bash
📊 Raft 시스템 모니터링 필수 지표:
- Term 변화 빈도 (리더 선출 빈도)
- Log replication 지연시간
- Commit index 진행률  
- 네트워크 파티션 감지
```

## 🎯 다음 단계

합의 알고리즘을 마스터했으니, [14.3 분산 데이터 관리](03-distributed-data.md)에서는 실제로 데이터를 어떻게 분산 저장하고 관리하는지, 샤딩과 복제 전략을 배워보겠습니다.

"합의는 분산 시스템의 심장입니다. 심장이 건강해야 시스템이 살아 움직일 수 있습니다!" 💖⚡
