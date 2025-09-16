---
tags:
  - Consistency_Levels
  - Master_Master
  - Master_Slave
  - Multi_Region
  - Replication
  - advanced
  - deep-study
  - hands-on
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "시스템 프로그래밍"
priority_score: 5
---

# 14.3B Replication 패턴과 구현

## 🔄 Replication: 데이터를 복제하는 전략

데이터 샤딩으로 부하를 분산했다면, 이제는 각 샤드의 가용성을 높여야 합니다. 하나의 서버가 장애를 일으켜도 서비스가 계속될 수 있도록 데이터를 복제하는 전략들을 살펴보겠습니다.

### 📈 Master-Slave Replication

```python
class MasterSlaveReplication:
    def __init__(self, master_address, slave_addresses):
        self.master = DatabaseConnection(master_address)
        self.slaves = [DatabaseConnection(addr) for addr in slave_addresses]
        self.slave_lag_info = {}  # 복제 지연 정보
        
    def write(self, query, params):
        """쓰기는 Master에만"""
        try:
            result = self.master.execute(query, params)
            
            # 복제 지연 시간 추적
            self.track_replication_lag()
            
            return result
        except Exception as e:
            raise MasterFailureException(f"Master write failed: {e}")
    
    def read(self, query, params, consistency_level='eventual'):
        """읽기 전략 선택"""
        if consistency_level == 'strong':
            # 강한 일관성: Master에서만 읽기
            return self.master.execute(query, params)
        
        elif consistency_level == 'eventual':
            # 최종 일관성: 부하 분산된 읽기
            return self.read_from_slave_with_load_balancing(query, params)
        
        elif consistency_level == 'read_your_writes':
            # Read-your-writes: 최근 쓴 사용자는 Master에서 읽기
            return self.read_with_session_consistency(query, params)
    
    def read_from_slave_with_load_balancing(self, query, params):
        """슬레이브 로드밸런싱 읽기"""
        # 건강한 슬레이브들 중에서 선택
        healthy_slaves = self.get_healthy_slaves()
        
        if not healthy_slaves:
            # 모든 슬레이브가 죽었으면 Master에서 읽기
            print("⚠️  All slaves down, reading from master")
            return self.master.execute(query, params)
        
        # Round-robin 방식으로 슬레이브 선택
        selected_slave = self.select_slave_round_robin(healthy_slaves)
        
        try:
            return selected_slave.execute(query, params)
        except Exception as e:
            # 슬레이브 실패 시 다른 슬레이브나 Master로 폴백
            print(f"⚠️  Slave failed, trying fallback: {e}")
            return self.read_fallback(query, params, failed_slave=selected_slave)
    
    def track_replication_lag(self):
        """복제 지연 모니터링"""
        master_position = self.master.execute("SHOW MASTER STATUS")[0]['Position']
        
        for i, slave in enumerate(self.slaves):
            try:
                slave_status = slave.execute("SHOW SLAVE STATUS")[0]
                slave_position = slave_status['Exec_Master_Log_Pos']
                
                lag = master_position - slave_position
                self.slave_lag_info[f"slave_{i}"] = {
                    'lag_bytes': lag,
                    'seconds_behind_master': slave_status['Seconds_Behind_Master'],
                    'last_checked': time.time()
                }
                
            except Exception as e:
                print(f"⚠️  Slave {i} health check failed: {e}")
                self.slave_lag_info[f"slave_{i}"] = {
                    'status': 'unhealthy',
                    'error': str(e),
                    'last_checked': time.time()
                }
    
    def get_healthy_slaves(self):
        """건강한 슬레이브 목록 반환"""
        healthy = []
        
        for i, slave in enumerate(self.slaves):
            slave_key = f"slave_{i}"
            if slave_key in self.slave_lag_info:
                lag_info = self.slave_lag_info[slave_key]
                
                # 복제 지연이 5초 이내이고 에러가 없으면 건강함
                if (lag_info.get('seconds_behind_master', 0) < 5 and 
                    'error' not in lag_info):
                    healthy.append(slave)
        
        return healthy

# 실제 사용 예시
replication = MasterSlaveReplication(
    master_address="master-db.company.com:3306",
    slave_addresses=[
        "slave1-db.company.com:3306", 
        "slave2-db.company.com:3306",
        "slave3-db.company.com:3306"
    ]
)

# 쓰기 (Master에만)
replication.write("""
    INSERT INTO posts (user_id, content, created_at) 
    VALUES (%s, %s, %s)
""", (12345, "Hello World", time.time()))

# 읽기 (최종 일관성 - 빠름)
posts = replication.read("""
    SELECT * FROM posts WHERE user_id = %s ORDER BY created_at DESC LIMIT 10
""", (12345,), consistency_level='eventual')

# 읽기 (강한 일관성 - 느림)
latest_post = replication.read("""
    SELECT * FROM posts WHERE user_id = %s ORDER BY created_at DESC LIMIT 1  
""", (12345,), consistency_level='strong')
```

### 🔄 Master-Master Replication

```python
class MasterMasterReplication:
    def __init__(self, node_addresses):
        self.nodes = [DatabaseConnection(addr) for addr in node_addresses]
        self.current_node = 0  # 현재 활성 노드
        self.conflict_resolver = ConflictResolver()
        
    def write(self, query, params, node_preference=None):
        """양방향 복제 쓰기"""
        target_node = node_preference or self.current_node
        
        try:
            # 선택된 노드에 쓰기
            result = self.nodes[target_node].execute(query, params)
            
            # 다른 노드들로 비동기 복제 (MySQL의 경우 자동)
            self.verify_replication_health()
            
            return result
            
        except Exception as e:
            # 현재 노드 실패 시 다른 노드로 자동 전환
            return self.failover_write(query, params, failed_node=target_node)
    
    def failover_write(self, query, params, failed_node):
        """장애조치 쓰기"""
        print(f"⚠️  Node {failed_node} failed, attempting failover")
        
        for i, node in enumerate(self.nodes):
            if i == failed_node:
                continue
                
            try:
                result = node.execute(query, params)
                self.current_node = i  # 활성 노드 변경
                print(f"✅ Failover successful to node {i}")
                return result
                
            except Exception as e:
                print(f"⚠️  Failover to node {i} also failed: {e}")
                continue
        
        raise AllNodesFailed("All master nodes are down")
    
    def read(self, query, params):
        """읽기 (아무 노드에서나)"""
        # 라운드 로빈으로 부하 분산
        node_index = self.get_next_read_node()
        
        try:
            return self.nodes[node_index].execute(query, params)
        except Exception:
            # 해당 노드 실패 시 다른 노드에서 재시도
            return self.read_with_fallback(query, params, failed_node=node_index)
    
    def handle_write_conflict(self, table, record_id):
        """쓰기 충돌 해결"""
        print(f"🔥 Write conflict detected on {table}:{record_id}")
        
        # 각 노드에서 해당 레코드 버전 수집
        versions = {}
        for i, node in enumerate(self.nodes):
            try:
                record = node.execute(f"""
                    SELECT *, last_modified FROM {table} WHERE id = %s
                """, (record_id,))
                
                if record:
                    versions[f"node_{i}"] = record[0]
                    
            except Exception as e:
                print(f"Failed to get version from node {i}: {e}")
        
        if len(versions) > 1:
            # 여러 버전이 존재 → 충돌!
            resolved_version = self.conflict_resolver.resolve(versions)
            
            # 해결된 버전을 모든 노드에 적용
            self.apply_resolved_version(table, record_id, resolved_version)
            
            return resolved_version
        else:
            return list(versions.values())[0] if versions else None

class ConflictResolver:
    """충돌 해결 전략들"""
    
    def resolve(self, versions):
        """충돌 해결 (여러 전략 중 선택)"""
        # 전략 1: Last-Write-Wins (마지막 쓰기 승리)
        return self.last_write_wins(versions)
    
    def last_write_wins(self, versions):
        """마지막 수정 시간 기준으로 선택"""
        latest_version = None
        latest_timestamp = 0
        
        for node_id, version in versions.items():
            timestamp = version.get('last_modified', 0)
            if timestamp > latest_timestamp:
                latest_timestamp = timestamp
                latest_version = version
        
        print(f"✅ Conflict resolved by Last-Write-Wins: {latest_timestamp}")
        return latest_version
    
    def vector_clock_resolution(self, versions):
        """Vector Clock 기반 충돌 해결"""
        # Vector Clock 구현 (복잡하므로 개념만)
        # 각 노드별로 논리적 시계를 유지하여 인과관계 파악
        pass
    
    def application_level_merge(self, versions):
        """애플리케이션 레벨에서 병합"""
        # 예: 사용자 프로필 정보의 경우 각 필드별로 최신 값 선택
        merged = {}
        
        for node_id, version in versions.items():
            for field, value in version.items():
                if field not in merged or version['last_modified'] > merged.get('last_modified', 0):
                    merged[field] = value
        
        return merged

# 사용 예시
mm_replication = MasterMasterReplication([
    "master1-db.company.com:3306",
    "master2-db.company.com:3306"  
])

# 양방향 복제 쓰기
mm_replication.write("""
    UPDATE users SET last_login = %s WHERE id = %s
""", (time.time(), 12345))

# 충돌 상황 시뮬레이션
# Node 1: UPDATE users SET name = 'John' WHERE id = 12345 at 10:00:00
# Node 2: UPDATE users SET name = 'Johnny' WHERE id = 12345 at 10:00:05
# → 충돌 감지 및 해결 (Last-Write-Wins: 'Johnny')
```

### 📊 Read-your-writes 일관성 구현

```python
class ReadYourWritesReplication:
    """사용자가 자신이 쓴 데이터는 즉시 읽을 수 있도록 보장"""
    
    def __init__(self, master_address, slave_addresses):
        self.master = DatabaseConnection(master_address)
        self.slaves = [DatabaseConnection(addr) for addr in slave_addresses]
        self.user_write_timestamps = {}  # 사용자별 마지막 쓰기 시간
        
    def write(self, query, params, user_id):
        """사용자 쓰기 (타임스탬프 기록)"""
        result = self.master.execute(query, params)
        
        # 사용자별 마지막 쓰기 시간 기록
        self.user_write_timestamps[user_id] = time.time()
        
        return result
    
    def read(self, query, params, user_id):
        """Read-your-writes 일관성 읽기"""
        user_write_time = self.user_write_timestamps.get(user_id, 0)
        current_time = time.time()
        
        # 최근 5초 내에 쓴 사용자는 Master에서 읽기
        if current_time - user_write_time < 5.0:
            print(f"Reading from master for user {user_id} (recent write)")
            return self.master.execute(query, params)
        else:
            # 오래된 쓰기의 경우 Slave에서 읽기 가능
            return self.read_from_any_slave(query, params)
    
    def read_from_any_slave(self, query, params):
        """부하 분산된 Slave 읽기"""
        for slave in self.slaves:
            try:
                return slave.execute(query, params)
            except Exception:
                continue
        
        # 모든 Slave 실패 시 Master에서 읽기
        return self.master.execute(query, params)

# 사용 예시
ryw_replication = ReadYourWritesReplication(
    master_address="master-db.company.com:3306",
    slave_addresses=["slave1-db.company.com:3306", "slave2-db.company.com:3306"]
)

# 사용자가 포스트 작성
ryw_replication.write("""
    INSERT INTO posts (user_id, content) VALUES (%s, %s)
""", (12345, "My new post"), user_id=12345)

# 같은 사용자가 즉시 조회 → Master에서 읽기 (강한 일관성)
posts = ryw_replication.read("""
    SELECT * FROM posts WHERE user_id = %s ORDER BY created_at DESC
""", (12345,), user_id=12345)

# 다른 사용자가 조회 → Slave에서 읽기 (부하 분산)
posts = ryw_replication.read("""
    SELECT * FROM posts WHERE user_id = %s ORDER BY created_at DESC  
""", (12345,), user_id=67890)
```

### 🔄 Multi-Region Replication

```python
class MultiRegionReplication:
    """지역 간 복제를 통한 글로벌 서비스"""
    
    def __init__(self):
        self.regions = {
            'us-east': DatabaseConnection('us-east-db.company.com:3306'),
            'us-west': DatabaseConnection('us-west-db.company.com:3306'),
            'eu-west': DatabaseConnection('eu-west-db.company.com:3306'),
            'ap-northeast': DatabaseConnection('ap-northeast-db.company.com:3306')
        }
        self.user_regions = {}  # 사용자별 홈 리전
        
    def write(self, query, params, user_id):
        """사용자의 홈 리전에 쓰기"""
        home_region = self.get_user_home_region(user_id)
        home_db = self.regions[home_region]
        
        try:
            # 홈 리전에 쓰기
            result = home_db.execute(query, params)
            
            # 다른 리전들로 비동기 복제
            self.async_replicate_to_other_regions(query, params, home_region)
            
            return result
            
        except Exception as e:
            # 홈 리전 실패 시 가장 가까운 리전으로 Failover
            return self.failover_write_to_nearest_region(query, params, home_region)
    
    def read(self, query, params, user_id, consistency_level='eventual'):
        """지역 최적화된 읽기"""
        if consistency_level == 'strong':
            # 강한 일관성: 홈 리전에서만 읽기
            home_region = self.get_user_home_region(user_id)
            return self.regions[home_region].execute(query, params)
            
        elif consistency_level == 'eventual':
            # 최종 일관성: 가장 가까운 리전에서 읽기
            nearest_region = self.get_nearest_region(user_id)
            
            try:
                return self.regions[nearest_region].execute(query, params)
            except Exception:
                # 가장 가까운 리전 실패 시 다른 리전으로 Fallback
                return self.read_from_any_healthy_region(query, params)
    
    def get_user_home_region(self, user_id):
        """사용자의 홈 리전 결정"""
        if user_id in self.user_regions:
            return self.user_regions[user_id]
        
        # 새 사용자: 사용자 ID 해시 기반으로 홈 리전 결정
        hash_value = hash(user_id) % len(self.regions)
        region_names = list(self.regions.keys())
        home_region = region_names[hash_value]
        
        self.user_regions[user_id] = home_region
        return home_region
    
    def async_replicate_to_other_regions(self, query, params, exclude_region):
        """다른 리전들로 비동기 복제"""
        import asyncio
        
        async def replicate_to_region(region_name, db_connection):
            try:
                await asyncio.sleep(0)  # 비동기 처리 시뮬레이션
                db_connection.execute(query, params)
                print(f"✅ Replicated to {region_name}")
            except Exception as e:
                print(f"⚠️  Replication failed to {region_name}: {e}")
        
        # 홈 리전을 제외한 모든 리전으로 복제
        replication_tasks = []
        for region_name, db_connection in self.regions.items():
            if region_name != exclude_region:
                task = replicate_to_region(region_name, db_connection)
                replication_tasks.append(task)
        
        # 백그라운드에서 실행
        asyncio.create_task(asyncio.gather(*replication_tasks))

# 사용 예시
multi_region = MultiRegionReplication()

# 미국 사용자의 쓰기 → us-east가 홈 리전이 됨
multi_region.write("""
    INSERT INTO posts (user_id, content) VALUES (%s, %s)
""", (12345, "Hello from New York"), user_id=12345)

# 같은 사용자가 강한 일관성으로 읽기 → us-east에서 읽기
posts = multi_region.read("""
    SELECT * FROM posts WHERE user_id = %s
""", (12345,), user_id=12345, consistency_level='strong')

# 유럽 사용자가 최종 일관성으로 읽기 → eu-west에서 읽기 (빠른 응답)
posts = multi_region.read("""
    SELECT * FROM posts WHERE user_id = %s
""", (12345,), user_id=67890, consistency_level='eventual')
```

## 핵심 요점

### 1. 복제 패턴별 특성 이해

- **Master-Slave**: 읽기 확장성 좋음, 쓰기는 단일 지점
- **Master-Master**: 쓰기 분산 가능, 충돌 해결 필요
- **Multi-Region**: 지역 최적화, 복제 지연 존재

### 2. 일관성 레벨 선택 전략

- **Strong**: 중요한 데이터, 느린 성능 감수
- **Eventual**: 일반적 읽기, 빠른 성능 우선
- **Read-your-writes**: UX 고려, 사용자별 차별화

### 3. 실전 운영 고려사항

- 복제 지연 모니터링과 임계값 관리
- 자동 Failover와 장애 복구 메커니즘
- 지역별 부하 분산과 성능 최적화

---

**이전**: [Sharding 전략과 구현](14-12-sharding-strategies.md)  
**다음**: [Vector Clock과 충돌 해결](14-13-vector-clocks.md)에서 분산 환경의 논리적 시간 추적을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-14-distributed-systems)

- [14.1 분산 시스템 기초 이론 - CAP 정리와 일관성의 과학](./14-01-distributed-fundamentals.md)
- [14.2 합의 알고리즘 - 분산된 노드들이 하나가 되는 방법](./14-10-consensus-algorithms.md)
- [14.3 분산 데이터 관리 개요](./14-11-distributed-data.md)
- [14.3A Sharding 전략과 구현](./14-12-sharding-strategies.md)
- [14.3C Vector Clock과 충돌 해결](./14-13-vector-clocks.md)

### 🏷️ 관련 키워드

`Replication`, `Master_Slave`, `Master_Master`, `Multi_Region`, `Consistency_Levels`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
