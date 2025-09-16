---
tags:
  - advanced
  - balanced
  - causality-tracking
  - conflict-resolution
  - deep-study
  - happens-before
  - logical-time
  - vector-clock
  - 인프라스트럭처
difficulty: ADVANCED
learning_time: "15-25시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 14.3C Vector Clock과 충돌 해결

## 🎯 Vector Clocks: 분산 환경에서의 시간 추적

분산 시스템에서 가장 어려운 문제 중 하나는 "어떤 이벤트가 먼저 일어났는가?"를 판단하는 것입니다. 물리적 시계는 각 노드마다 다르고, 네트워크 지연으로 인해 이벤트 순서를 정확히 파악하기 어렵습니다. Vector Clock은 이 문제를 해결하는 논리적 시계입니다.

```python
class VectorClock:
    """분산 시스템의 논리적 시계"""
    
    def __init__(self, node_id, nodes):
        self.node_id = node_id
        self.nodes = nodes
        self.clock = {node: 0 for node in nodes}  # 각 노드별 시계
    
    def tick(self):
        """로컬 이벤트 발생 시 자신의 시계 증가"""
        self.clock[self.node_id] += 1
    
    def update(self, other_clock):
        """다른 노드의 메시지 받을 때 시계 업데이트"""
        # 각 노드별로 최대값 선택 후 자신의 시계 증가
        for node in self.nodes:
            self.clock[node] = max(self.clock[node], other_clock.get(node, 0))
        
        # 자신의 시계 증가
        self.clock[self.node_id] += 1
    
    def compare(self, other_clock):
        """두 Vector Clock 비교"""
        # self < other: 모든 component가 작거나 같고, 적어도 하나는 작음
        self_less = all(self.clock[node] <= other_clock.get(node, 0) for node in self.nodes)
        any_smaller = any(self.clock[node] < other_clock.get(node, 0) for node in self.nodes)
        
        # other < self: 반대
        other_less = all(other_clock.get(node, 0) <= self.clock[node] for node in self.nodes) 
        any_other_smaller = any(other_clock.get(node, 0) < self.clock[node] for node in self.nodes)
        
        if self_less and any_smaller:
            return -1  # self < other (happens-before)
        elif other_less and any_other_smaller:
            return 1   # self > other  
        else:
            return 0   # concurrent (동시 발생)
```

### 🔄 Vector Clock을 활용한 분산 데이터 버전 관리

```python
class DistributedDataWithVectorClock:
    def __init__(self, node_id, peer_nodes):
        self.node_id = node_id
        self.vector_clock = VectorClock(node_id, [node_id] + peer_nodes)
        self.data_store = {}  # key -> {value, vector_clock}
        
    def write_local(self, key, value):
        """로컬 쓰기"""
        # Vector Clock 증가
        self.vector_clock.tick()
        
        # 데이터 저장
        self.data_store[key] = {
            'value': value,
            'vector_clock': self.vector_clock.clock.copy(),
            'node_id': self.node_id,
            'timestamp': time.time()
        }
        
        print(f"Node {self.node_id}: Write {key}={value}, VC={self.vector_clock.clock}")
    
    def receive_update(self, key, value, sender_clock, sender_node):
        """다른 노드로부터 업데이트 받기"""
        # Vector Clock 업데이트
        self.vector_clock.update(sender_clock)
        
        if key not in self.data_store:
            # 새로운 키: 그대로 저장
            self.data_store[key] = {
                'value': value,
                'vector_clock': sender_clock.copy(),
                'node_id': sender_node,
                'timestamp': time.time()
            }
            print(f"Node {self.node_id}: New key {key}={value}")
            
        else:
            # 기존 키: 충돌 해결 필요
            local_data = self.data_store[key]
            comparison = self.compare_vector_clocks(local_data['vector_clock'], sender_clock)
            
            if comparison == -1:
                # 로컬 < 원격: 원격 데이터가 더 새로움
                print(f"Node {self.node_id}: Updating {key}: {local_data['value']} → {value}")
                self.data_store[key] = {
                    'value': value,
                    'vector_clock': sender_clock.copy(),
                    'node_id': sender_node,
                    'timestamp': time.time()
                }
                
            elif comparison == 1:
                # 로컬 > 원격: 로컬 데이터가 더 새로움  
                print(f"Node {self.node_id}: Ignoring older update for {key}")
                
            else:
                # 동시 발생: 충돌!
                print(f"🔥 Node {self.node_id}: Conflict detected for {key}!")
                self.handle_conflict(key, value, sender_clock, sender_node)
    
    def handle_conflict(self, key, remote_value, remote_clock, sender_node):
        """Vector Clock 충돌 해결"""
        local_data = self.data_store[key]
        
        print(f"Conflict resolution for {key}:")
        print(f"  Local: {local_data['value']} (VC: {local_data['vector_clock']})")
        print(f"  Remote: {remote_value} (VC: {remote_clock})")
        
        # 해결 전략 1: 노드 ID 기준 (deterministic)
        if self.node_id < sender_node:
            # 노드 ID가 작은 쪽 우선
            print(f"  Resolution: Keep local (node {self.node_id} < {sender_node})")
        else:
            # 원격 데이터 채택
            print(f"  Resolution: Accept remote (node {self.node_id} > {sender_node})")
            self.data_store[key] = {
                'value': remote_value,
                'vector_clock': remote_clock.copy(),
                'node_id': sender_node,
                'timestamp': time.time()
            }
        
        # 해결 전략 2: 애플리케이션별 병합
        # 예: Set의 경우 합집합, Counter의 경우 합계 등

    def compare_vector_clocks(self, clock1, clock2):
        """Vector Clock 비교 헬퍼 함수"""
        vc1 = VectorClock(self.node_id, list(clock1.keys()))
        vc1.clock = clock1.copy()
        return vc1.compare(clock2)
```

### 🎭 Vector Clock 충돌 해결 시나리오

```python
# Vector Clock 시뮬레이션
def simulate_vector_clocks():
    print("=== Vector Clock Conflict Resolution 시뮬레이션 ===")
    
    # 3개 노드 네트워크
    nodes = ['A', 'B', 'C']
    node_a = DistributedDataWithVectorClock('A', ['B', 'C'])
    node_b = DistributedDataWithVectorClock('B', ['A', 'C']) 
    node_c = DistributedDataWithVectorClock('C', ['A', 'B'])
    
    print("\n--- 순차적 업데이트 (충돌 없음) ---")
    # 1. A가 쓰기
    node_a.write_local('user:123', 'Alice')
    
    # 2. B가 A의 업데이트를 받음
    node_b.receive_update('user:123', 'Alice', 
                         node_a.data_store['user:123']['vector_clock'], 'A')
    
    # 3. B가 업데이트
    node_b.write_local('user:123', 'Alice Smith')
    
    # 4. A가 B의 업데이트를 받음  
    node_a.receive_update('user:123', 'Alice Smith',
                         node_b.data_store['user:123']['vector_clock'], 'B')
    
    print("\n--- 동시 업데이트 (충돌 발생) ---")
    
    # 5. A와 C가 동시에 다른 값으로 업데이트 (네트워크 분할 상황)
    node_a.write_local('user:456', 'Bob')
    node_c.write_local('user:456', 'Robert')
    
    # 6. 네트워크 복구 후 서로의 업데이트를 받음
    print("\n--- 네트워크 복구: 충돌 감지 및 해결 ---")
    node_a.receive_update('user:456', 'Robert',
                         node_c.data_store['user:456']['vector_clock'], 'C')
    
    node_c.receive_update('user:456', 'Bob', 
                         node_a.data_store['user:456']['vector_clock'], 'A')

# 실행
simulate_vector_clocks()
```

### 🛠️ 실전 Vector Clock 구현 - 분산 카운터

```python
class DistributedCounter:
    """Vector Clock을 사용한 분산 카운터"""
    
    def __init__(self, node_id, peer_nodes):
        self.node_id = node_id
        self.vector_clock = VectorClock(node_id, [node_id] + peer_nodes)
        self.counter_value = 0
        self.operation_log = []  # 연산 히스토리
        
    def increment(self, amount=1):
        """카운터 증가"""
        # Vector Clock 업데이트
        self.vector_clock.tick()
        
        # 연산 기록
        operation = {
            'type': 'increment',
            'amount': amount,
            'vector_clock': self.vector_clock.clock.copy(),
            'node_id': self.node_id
        }
        
        self.operation_log.append(operation)
        self.counter_value += amount
        
        print(f"Node {self.node_id}: Counter += {amount} = {self.counter_value}, VC={self.vector_clock.clock}")
        return operation
    
    def receive_operation(self, operation):
        """다른 노드의 연산 받기"""
        # Vector Clock 업데이트
        self.vector_clock.update(operation['vector_clock'])
        
        # 중복 연산 확인
        if self.is_duplicate_operation(operation):
            print(f"Node {self.node_id}: Ignoring duplicate operation from {operation['node_id']}")
            return
        
        # 연산 적용
        if operation['type'] == 'increment':
            self.counter_value += operation['amount']
            self.operation_log.append(operation)
            print(f"Node {self.node_id}: Received increment {operation['amount']} from {operation['node_id']}, Counter = {self.counter_value}")
    
    def is_duplicate_operation(self, operation):
        """중복 연산 확인"""
        for existing_op in self.operation_log:
            if (existing_op['node_id'] == operation['node_id'] and
                existing_op['vector_clock'] == operation['vector_clock']):
                return True
        return False
    
    def get_consistent_value(self):
        """모든 연산을 적용한 일관된 값 계산"""
        # 연산들을 Vector Clock 순서로 정렬
        sorted_operations = sorted(self.operation_log, 
                                 key=lambda op: self.vector_clock_to_sortable_key(op['vector_clock']))
        
        # 처음부터 다시 계산
        consistent_value = 0
        for op in sorted_operations:
            if op['type'] == 'increment':
                consistent_value += op['amount']
        
        return consistent_value
    
    def vector_clock_to_sortable_key(self, vc):
        """Vector Clock을 정렬 가능한 키로 변환"""
        # 간단한 구현: 각 노드의 시계 값을 이용
        return tuple(vc.get(node, 0) for node in sorted(vc.keys()))

# 분산 카운터 시뮬레이션
def simulate_distributed_counter():
    print("=== 분산 카운터 Vector Clock 시뮬레이션 ===")
    
    # 3개 노드 생성
    counter_a = DistributedCounter('A', ['B', 'C'])
    counter_b = DistributedCounter('B', ['A', 'C'])
    counter_c = DistributedCounter('C', ['A', 'B'])
    
    # 각 노드에서 동시에 증가 연산
    print("\n--- 동시 증가 연산 ---")
    op_a = counter_a.increment(5)
    op_b = counter_b.increment(3)
    op_c = counter_c.increment(7)
    
    # 연산들을 서로 교환
    print("\n--- 연산 동기화 ---")
    counter_a.receive_operation(op_b)
    counter_a.receive_operation(op_c)
    
    counter_b.receive_operation(op_a)
    counter_b.receive_operation(op_c)
    
    counter_c.receive_operation(op_a)
    counter_c.receive_operation(op_b)
    
    # 최종 일관된 값 확인
    print(f"\n--- 최종 카운터 값 ---")
    print(f"Node A: {counter_a.get_consistent_value()}")
    print(f"Node B: {counter_b.get_consistent_value()}")
    print(f"Node C: {counter_c.get_consistent_value()}")
    print("모든 노드가 동일한 값을 가져야 함!")

simulate_distributed_counter()
```

### 🔧 실전 응용 - 분산 객체 버전 관리

```python
class DistributedObjectStore:
    """Vector Clock 기반 분산 객체 저장소"""
    
    def __init__(self, node_id, peer_nodes):
        self.node_id = node_id
        self.vector_clock = VectorClock(node_id, [node_id] + peer_nodes)
        self.objects = {}  # object_id -> list of versions
        
    def update_object(self, object_id, new_data):
        """객체 업데이트"""
        self.vector_clock.tick()
        
        version = {
            'data': new_data,
            'vector_clock': self.vector_clock.clock.copy(),
            'node_id': self.node_id,
            'timestamp': time.time()
        }
        
        if object_id not in self.objects:
            self.objects[object_id] = []
        
        self.objects[object_id].append(version)
        
        print(f"Node {self.node_id}: Updated object {object_id}, VC={self.vector_clock.clock}")
        return version
    
    def receive_object_update(self, object_id, version):
        """다른 노드의 객체 업데이트 받기"""
        self.vector_clock.update(version['vector_clock'])
        
        if object_id not in self.objects:
            self.objects[object_id] = []
        
        # 중복 버전 확인
        for existing_version in self.objects[object_id]:
            if (existing_version['vector_clock'] == version['vector_clock'] and
                existing_version['node_id'] == version['node_id']):
                print(f"Node {self.node_id}: Ignoring duplicate version for {object_id}")
                return
        
        self.objects[object_id].append(version)
        print(f"Node {self.node_id}: Received update for {object_id} from {version['node_id']}")
    
    def get_object_current_version(self, object_id):
        """객체의 현재 버전 조회 (충돌 해결 포함)"""
        if object_id not in self.objects:
            return None
        
        versions = self.objects[object_id]
        if len(versions) == 1:
            return versions[0]
        
        # 여러 버전이 있는 경우 충돌 해결
        return self.resolve_object_conflicts(object_id, versions)
    
    def resolve_object_conflicts(self, object_id, versions):
        """객체 버전 충돌 해결"""
        print(f"🔥 Resolving conflicts for object {object_id} ({len(versions)} versions)")
        
        # 1. Vector Clock 관계로 우선 필터링
        causally_related = []
        concurrent_versions = []
        
        for i, version_a in enumerate(versions):
            is_concurrent = True
            
            for j, version_b in enumerate(versions):
                if i != j:
                    comparison = self.compare_vector_clocks(
                        version_a['vector_clock'], 
                        version_b['vector_clock']
                    )
                    if comparison != 0:  # 인과관계 존재
                        is_concurrent = False
                        if comparison < 0:  # version_a가 더 오래됨
                            break
            
            if is_concurrent:
                concurrent_versions.append(version_a)
            else:
                causally_related.append(version_a)
        
        # 2. 최신 인과관계 버전 선택
        if causally_related:
            latest_causal = max(causally_related, 
                              key=lambda v: sum(v['vector_clock'].values()))
            
            if not concurrent_versions:
                print(f"✅ Resolved by causal ordering: {latest_causal['node_id']}")
                return latest_causal
        
        # 3. 동시 버전들이 있는 경우 애플리케이션 레벨 병합
        if concurrent_versions:
            merged_version = self.merge_concurrent_versions(object_id, concurrent_versions)
            print(f"✅ Resolved by merging {len(concurrent_versions)} concurrent versions")
            return merged_version
        
        # 4. 폴백: 최신 타임스탬프 선택
        latest_version = max(versions, key=lambda v: v['timestamp'])
        print(f"✅ Resolved by timestamp: {latest_version['node_id']}")
        return latest_version
    
    def merge_concurrent_versions(self, object_id, versions):
        """동시 버전들을 병합"""
        # 예시: 사용자 프로필의 경우 각 필드별로 최신 값 선택
        merged_data = {}
        merged_clock = {}
        
        for version in versions:
            data = version['data']
            vc = version['vector_clock']
            
            for field, value in data.items():
                if field not in merged_data:
                    merged_data[field] = value
                    merged_clock[field] = vc.copy()
                else:
                    # 필드별로 Vector Clock 비교
                    if self.compare_vector_clocks(vc, merged_clock[field]) > 0:
                        merged_data[field] = value
                        merged_clock[field] = vc.copy()
        
        # 병합된 버전의 Vector Clock은 모든 버전의 최대값
        final_clock = {}
        for version in versions:
            for node, clock_value in version['vector_clock'].items():
                final_clock[node] = max(final_clock.get(node, 0), clock_value)
        
        return {
            'data': merged_data,
            'vector_clock': final_clock,
            'node_id': f"merged_by_{self.node_id}",
            'timestamp': time.time()
        }
    
    def compare_vector_clocks(self, clock1, clock2):
        """Vector Clock 비교"""
        vc1 = VectorClock(self.node_id, list(clock1.keys()))
        vc1.clock = clock1.copy()
        return vc1.compare(clock2)

# 분산 객체 저장소 시뮬레이션
def simulate_distributed_object_store():
    print("=== 분산 객체 저장소 시뮬레이션 ===")
    
    store_a = DistributedObjectStore('A', ['B', 'C'])
    store_b = DistributedObjectStore('B', ['A', 'C'])
    store_c = DistributedObjectStore('C', ['A', 'B'])
    
    # 사용자 프로필 객체 생성
    print("\n--- 초기 사용자 프로필 생성 ---")
    user_profile = store_a.update_object('user:123', {
        'name': 'John Doe',
        'email': 'john@example.com',
        'age': 30
    })
    
    # 다른 노드로 전파
    store_b.receive_object_update('user:123', user_profile)
    store_c.receive_object_update('user:123', user_profile)
    
    # 동시 업데이트 (충돌 상황)
    print("\n--- 동시 업데이트 (네트워크 분할) ---")
    update_b = store_b.update_object('user:123', {
        'name': 'John Doe',
        'email': 'john.doe@newcompany.com',  # 이메일 변경
        'age': 30
    })
    
    update_c = store_c.update_object('user:123', {
        'name': 'John D. Smith',  # 이름 변경
        'email': 'john@example.com',
        'age': 31  # 나이 변경
    })
    
    # 네트워크 복구 후 동기화
    print("\n--- 네트워크 복구 및 충돌 해결 ---")
    store_b.receive_object_update('user:123', update_c)
    store_c.receive_object_update('user:123', update_b)
    
    # 최종 버전 확인
    print("\n--- 최종 해결된 버전 ---")
    final_version_b = store_b.get_object_current_version('user:123')
    final_version_c = store_c.get_object_current_version('user:123')
    
    print(f"Store B result: {final_version_b['data']}")
    print(f"Store C result: {final_version_c['data']}")

simulate_distributed_object_store()
```

## 핵심 요점

### 1. Vector Clock의 핵심 개념

- **논리적 시간**: 물리적 시계 대신 이벤트 간 인과관계 추적
- **Happens-before 관계**: 이벤트 순서를 논리적으로 결정
- **동시성 감지**: 인과관계가 없는 이벤트들을 정확히 식별

### 2. 충돌 해결 전략

- **Causal ordering**: 인과관계가 있는 경우 순서대로 적용
- **Deterministic resolution**: 동시 이벤트는 일관된 규칙으로 해결
- **Application-level merge**: 비즈니스 로직에 맞는 병합 전략

### 3. 실전 적용 고려사항

- Vector Clock 크기는 노드 수에 비례하여 증가
- 네트워크 메시지마다 Vector Clock 포함 필요
- 장기간 비활성 노드의 Clock 정리 메커니즘 필요

---

**이전**: [Replication 패턴](14-50-replication-patterns.md)  
**다음**: [분산 데이터 실전 설계](14-51-distributed-data-production.md)에서 실제 운영 환경의 고려사항과 베스트 프랙티스를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 인프라스트럭처
- **예상 시간**: 15-25시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-14-distributed-systems)

- [14.1 분산 시스템 기초 이론 - CAP 정리와 일관성의 과학](./14-01-distributed-fundamentals.md)
- [14.2 합의 알고리즘 - 분산된 노드들이 하나가 되는 방법](./14-10-consensus-algorithms.md)
- [14.3 분산 데이터 관리 개요](./14-11-distributed-data.md)
- [14.3A Sharding 전략과 구현](./14-12-sharding-strategies.md)
- [14.3B Replication 패턴과 구현](./14-50-replication-patterns.md)

### 🏷️ 관련 키워드

`vector-clock`, `logical-time`, `happens-before`, `causality-tracking`, `conflict-resolution`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
