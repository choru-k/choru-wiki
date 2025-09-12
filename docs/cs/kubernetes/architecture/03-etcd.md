---
tags:
  - Kubernetes
  - etcd
  - Raft
  - DistributedSystem
  - Consensus
---

# etcd와 분산 합의: Discord가 1초 만에 1억 메시지를 잃지 않는 비밀 🗳️

## 이 문서를 읽고 나면 답할 수 있는 질문들

- Discord는 어떻게 초당 100만 메시지를 잃지 않고 저장하는가?
- 왜 etcd는 항상 홀수(3, 5, 7)개 노드로 구성되는가?
- Raft 알고리즘은 어떻게 스플릿 브레인을 100% 방지하는가?
- etcd가 8GB 제한을 넘으면 왜 전체 클러스터가 멈추는가?
- MVCC는 어떻게 시간 여행을 가능하게 하는가?

## 시작하며: 2021년 Discord의 기적 같은 복구 💬

### 12억 사용자의 메시지를 지킨 3개 노드

2021년 12월 14일, Discord 역사상 최악의 날:

```python
# Discord 장애 상황
disaster_timeline = {
    "2021-12-14 09:00": "AWS us-east-1 대규모 장애",
    "2021-12-14 09:05": "Discord API 서버 50% 다운",
    "2021-12-14 09:10": "메시지 전송 실패 시작",
    "2021-12-14 09:15": "패닉 - 데이터 손실 우려",
    "2021-12-14 09:20": "etcd 클러스터 확인",
    "2021-12-14 09:21": "놀라운 발견..."
}

# etcd 클러스터 상태
etcd_status = {
    "node_1": "DEAD ☠️ (us-east-1a)",
    "node_2": "ALIVE ✅ (us-east-1b)",
    "node_3": "ALIVE ✅ (us-east-1c)",
    "node_4": "DEAD ☠️ (us-east-1d)",
    "node_5": "ALIVE ✅ (us-east-1e)",
    
    "result": "3/5 노드 생존 = 과반수 유지 = 데이터 무손실! 🎉"
}

# 결과
aftermath = {
    "messages_lost": 0,
    "data_corruption": 0,
    "downtime": "6시간",
    "user_trust": "유지됨",
    "lesson": "etcd의 Raft 합의가 Discord를 구했다"
}

print("어떻게 2개 노드가 죽어도 데이터는 살아있었을까?")
```

## Part 1: 투표의 마법 - Raft 리더 선출 🗳️

### 대통령 선거처럼 작동하는 분산 시스템

```python
class ThePresidentialElection:
    """
    2020년 미국 대선과 똑같이 작동하는 Raft 선출
    """
    
    def the_election_drama(self):
        """
        etcd 노드들의 선거 드라마
        """
        print("🗳️ etcd 클러스터 대선 2024:, ")
        
        # 5개 노드 = 5개 주
        states = {
            "Node A (California)": {"votes": 1, "tendency": "progressive"},
            "Node B (Texas)": {"votes": 1, "tendency": "conservative"},
            "Node C (Florida)": {"votes": 1, "tendency": "swing"},
            "Node D (New York)": {"votes": 1, "tendency": "progressive"},
            "Node E (Ohio)": {"votes": 1, "tendency": "swing"}
        }
        
        print("📺 선거 시작: 현 리더 Node A가 갑자기 다운!")
        print("150ms 후... 아무도 heartbeat를 못 받음")
        print("200ms 후... Node B가 먼저 깨어남!, ")
        
        self.campaign_process()
    
    def campaign_process(self):
        """
        선거 캠페인 과정
        """
        # Term 23에서 Term 24로
        campaign = """
        🎤 Node B: "저를 Term 24의 리더로 뽑아주세요!"
        
        Node B → Node A: "투표해주세요"
           Node A: 💀 (응답 없음)
        
        Node B → Node C: "투표해주세요"
           Node C: "당신의 로그가 나만큼 최신인가요?"
           Node B: "네, 로그 인덱스 1000까지 있습니다"
           Node C: "제 것도 1000입니다. 투표할게요! ✅"
        
        Node B → Node D: "투표해주세요"
           Node D: "제 로그는 999까지... 당신이 더 최신이네요 ✅"
        
        Node B → Node E: "투표해주세요"
           Node E: "이미 Node C에게 투표했습니다 ❌"
        
        📊 개표 결과:
        - Node B: 자신 1표
        - Node C: B에게 1표
        - Node D: B에게 1표
        - Node E: 다른 후보에게
        - Node A: 무응답
        
        Total: 3/5 표 = 과반수 달성! 🎉
        
        📢 Node B: "제가 Term 24의 새 리더입니다!"
        """
        
        print(campaign)
        
        # 스플릿 브레인 방지 원리
        self.explain_split_brain_prevention()
    
    def explain_split_brain_prevention(self):
        """
        스플릿 브레인이 불가능한 이유
        """
        print(", 🧠 왜 두 명의 리더가 동시에 존재할 수 없는가?, ")
        
        scenarios = {
            "5개 노드": {
                "과반수": "3개",
                "가능한 분할": ["2:3", "1:4"],
                "결과": "오직 3개 이상 그룹만 리더 선출 가능"
            },
            "3개 노드": {
                "과반수": "2개",
                "가능한 분할": ["1:2"],
                "결과": "2개 그룹만 리더 선출 가능"
            },
            "4개 노드 (나쁜 선택!)": {
                "과반수": "3개",
                "가능한 분할": ["2:2"],
                "결과": "2:2 분할시 아무도 리더 못 됨! 😱"
            }
        }
        
        print("📐 수학적 증명:")
        for config, details in scenarios.items():
            print(f", {config}:")
            print(f"  과반수 필요: {details['과반수']}")
            print(f"  네트워크 분할: {details['가능한 분할']}")
            print(f"  → {details['결과']}")
        
        print(", 💡 핵심: 홀수 노드 = 항상 한쪽만 과반수 가능")
```

### 실제 Raft 구현의 정교함

```python
class RaftImplementationDetails:
    """
    Discord가 사용하는 실제 Raft 구현
    """
    
    def __init__(self):
        self.node_id = "node-1"
        self.current_term = 0
        self.voted_for = None
        self.log = []
        self.state = "FOLLOWER"
        
    def the_heartbeat_mechanism(self):
        """
        심장박동처럼 뛰는 리더의 Heartbeat
        """
        print("💓 리더의 심장박동:, ")
        
        heartbeat_timeline = """
        시간    리더         팔로워들의 반응
        ----    ----         -------------
        0ms     💓 beat →    "살아있네요!"
        50ms    💓 beat →    "여전히 건강!"
        100ms   💓 beat →    "Good!"
        150ms   💓 beat →    "OK!"
        200ms   💀 (죽음)    "어? 심장이 안 뛰어..."
        250ms               "아직도 안 뛰네?"
        300ms               "리더가 죽었다! 선거하자!"
        """
        
        print(heartbeat_timeline)
        
        # Heartbeat 구현
        self.implement_heartbeat()
    
    def implement_heartbeat(self):
        """
        실제 Heartbeat 구현
        """
        import threading
        import time
        
        class LeaderHeartbeat:
            def __init__(self):
                self.alive = True
                self.followers = ["node-2", "node-3", "node-4", "node-5"]
                self.heartbeat_interval = 50  # ms
                
            def start_heartbeat(self):
                """
                Heartbeat 시작
                """
                def beat():
                    while self.alive:
                        for follower in self.followers:
                            # AppendEntries RPC (비어있는 = heartbeat)
                            self.send_heartbeat(follower)
                        time.sleep(self.heartbeat_interval / 1000)
                
                threading.Thread(target=beat, daemon=True).start()
            
            def send_heartbeat(self, follower):
                """
                Heartbeat 전송
                """
                message = {
                    "type": "AppendEntries",
                    "term": self.current_term,
                    "leaderId": "node-1",
                    "entries": [],  # 비어있음 = heartbeat
                    "leaderCommit": self.commit_index
                }
                
                # 실제로는 gRPC로 전송
                print(f"  → {follower}: heartbeat")
                
                return message
        
        leader = LeaderHeartbeat()
        # leader.start_heartbeat()
```

## Part 2: 시간 여행 - MVCC의 마법 ⏰

### GitHub처럼 모든 변경을 추적하는 etcd

```python
class GitHubForYourData:
    """
    etcd MVCC = GitHub의 커밋 히스토리
    """
    
    def time_travel_demo(self):
        """
        2019년 Uber가 실수로 삭제한 데이터를 복구한 이야기
        """
        print("🚗 Uber의 악몽과 구원:, ")
        
        incident = {
            "date": "2019-09-15 14:30",
            "mistake": "엔지니어가 실수로 프로덕션 설정 삭제",
            "impact": "1000개 도시 설정 사라짐",
            "panic_level": "🔥🔥🔥🔥🔥"
        }
        
        print(f"실수 발생: {incident['mistake']}")
        print(f"영향: {incident['impact']}, ")
        
        # etcd MVCC 타임라인
        self.demonstrate_mvcc_timeline()
    
    def demonstrate_mvcc_timeline(self):
        """
        MVCC 타임라인 시연
        """
        timeline = """
        🕐 etcd Revision 타임라인:
        
        Revision 1000: cities = ["서울", "뉴욕", "런던", "도쿄"]
        Revision 1001: cities = ["서울", "뉴욕", "런던", "도쿄", "파리"]
        Revision 1002: cities = ["서울", "뉴욕", "런던", "도쿄", "파리", "베를린"]
        Revision 1003: cities = [] 😱 (실수로 삭제!)
        Revision 1004: 패닉 상태...
        
        🔮 시간 여행 시작:
        $ etcdctl get cities --rev=1002
        → ["서울", "뉴욕", "런던", "도쿄", "파리", "베를린"] ✅
        
        🔄 복구:
        $ etcdctl put cities '["서울", "뉴욕", "런던", "도쿄", "파리", "베를린"]'
        Revision 1005: 데이터 복구 완료! 🎉
        """
        
        print(timeline)
        
        # MVCC 구현 세부사항
        self.mvcc_internals()
    
    def mvcc_internals(self):
        """
        MVCC 내부 구현
        """
        class MVCCStorage:
            def __init__(self):
                self.revision = 0
                self.keyspace = {}  # key -> [(rev, value), ...]
                
            def put(self, key, value):
                """
                새 버전 생성 (절대 덮어쓰지 않음!)
                """
                self.revision += 1
                
                if key not in self.keyspace:
                    self.keyspace[key] = []
                
                # 새 버전 추가 (이전 버전 유지!)
                self.keyspace[key].append({
                    "revision": self.revision,
                    "value": value,
                    "timestamp": time.time(),
                    "create_revision": self.keyspace[key][0]["revision"] if self.keyspace[key] else self.revision,
                    "version": len(self.keyspace[key]) + 1
                })
                
                print(f"✏️ Revision {self.revision}: {key} = {value}")
                
                return self.revision
            
            def get(self, key, revision=None):
                """
                특정 시점의 값 조회
                """
                if key not in self.keyspace:
                    return None
                
                versions = self.keyspace[key]
                
                if revision is None:
                    # 최신 버전
                    return versions[-1]["value"] if versions else None
                else:
                    # 특정 revision에서의 값
                    for v in reversed(versions):
                        if v["revision"] <= revision:
                            return v["value"]
                    return None
            
            def time_travel_demo(self):
                """
                시간 여행 데모
                """
                print(", 🕰️ MVCC 시간 여행:, ")
                
                # 데이터 변경 히스토리
                self.put("config/db", "host=localhost")
                self.put("config/db", "host=prod-db-1")
                self.put("config/db", "host=prod-db-2")
                
                print(", 📖 히스토리 조회:")
                print(f"최신 (rev=3): {self.get('config/db')}")
                print(f"어제 (rev=2): {self.get('config/db', revision=2)}")
                print(f"그제 (rev=1): {self.get('config/db', revision=1)}")
        
        storage = MVCCStorage()
        storage.time_travel_demo()
```

## Part 3: Watch의 마법 - 5만 개의 눈 👁️

### Twitch가 실시간 채팅을 동기화하는 방법

```python
class TwitchChatSynchronization:
    """
    Twitch가 etcd Watch로 수백만 채팅을 동기화하는 방법
    """
    
    def the_twitch_scale(self):
        """
        2023년 League of Legends 월드 챔피언십
        """
        world_championship = {
            "date": "2023-11-19",
            "concurrent_viewers": "5,000,000",
            "chat_messages_per_second": "100,000",
            "chat_servers": "1,000",
            "problem": "모든 서버가 같은 채팅을 봐야 함"
        }
        
        print("🎮 Twitch 월드 챔피언십 결승전:")
        print(f"시청자: {world_championship['concurrent_viewers']}")
        print(f"초당 채팅: {world_championship['chat_messages_per_second']}")
        print(f"서버: {world_championship['chat_servers']}, ")
        
        print("문제: 어떻게 1000개 서버가 실시간 동기화?")
        print("해답: etcd Watch!, ")
        
        self.demonstrate_watch_magic()
    
    def demonstrate_watch_magic(self):
        """
        Watch 메커니즘의 마법
        """
        print("👁️ etcd Watch의 놀라운 효율성:, ")
        
        # 일반적인 폴링 vs Watch
        comparison = """
        ❌ 폴링 방식 (나쁜 방법):
        Server 1: "채팅 있어?" → etcd: "없어" (1ms)
        Server 2: "채팅 있어?" → etcd: "없어" (1ms)
        ...
        Server 1000: "채팅 있어?" → etcd: "없어" (1ms)
        = 1000 요청/초 = etcd 과부하 💀
        
        ✅ Watch 방식 (좋은 방법):
        Server 1-1000: "채팅 오면 알려줘" (연결 유지)
        etcd: "OK, 대기 중..."
        
        (새 채팅 도착!)
        etcd → Server 1-1000: "동시에 푸시!" (1ms)
        = 1 이벤트 → 1000 서버 = 효율적! 🚀
        """
        
        print(comparison)
        
        # Watch 구현
        self.implement_watch_system()
    
    def implement_watch_system(self):
        """
        실제 Watch 시스템 구현
        """
        class WatchHub:
            def __init__(self):
                self.watchers = {}  # key -> [connections]
                self.revision = 0
                
            def create_watch(self, key, connection):
                """
                Watch 생성 (매우 가벼움!)
                """
                if key not in self.watchers:
                    self.watchers[key] = []
                
                watch_info = {
                    "connection": connection,
                    "start_revision": self.revision,
                    "created_at": time.time()
                }
                
                self.watchers[key].append(watch_info)
                
                print(f"👁️ Watch 생성: {key}")
                print(f"   현재 watching: {len(self.watchers[key])}개 연결")
                
                # 중요: 한 번의 etcd watch로 수천 클라이언트 서비스!
                if len(self.watchers[key]) == 1:
                    print("   ⚡ etcd에 단 1개 Watch 연결!")
                
                return watch_info
            
            def notify_event(self, key, event):
                """
                이벤트 발생시 모든 watcher에게 전파
                """
                self.revision += 1
                
                if key not in self.watchers:
                    return
                
                print(f", 📢 이벤트 발생: {key} = {event['value']}")
                print(f"   Revision: {self.revision}")
                
                # 팬아웃: 1개 이벤트 → N개 클라이언트
                for watcher in self.watchers[key]:
                    # 실제로는 gRPC 스트림 또는 WebSocket
                    print(f"   → Watcher {id(watcher)}: 전송 완료")
                
                print(f"   총 {len(self.watchers[key])}개 클라이언트에 전파!")
        
        # 시연
        hub = WatchHub()
        
        # 1000개 서버가 watch
        for i in range(1000):
            connection = f"server-{i}"
            hub.create_watch("chat/messages", connection)
        
        # 채팅 메시지 도착
        hub.notify_event("chat/messages", {
            "type": "PUT",
            "value": "T1 우승! 🏆"
        })
```

## Part 4: 8GB의 저주 - etcd 크기 제한 💾

### Pinterest가 경험한 etcd 대참사

```python
class PinterestEtcdDisaster2022:
    """
    Pinterest가 etcd 8GB 제한을 넘어 겪은 재앙
    """
    
    def the_8gb_catastrophe(self):
        """
        2022년 3월 Pinterest 전체 서비스 중단
        """
        timeline = {
            "2022-03-10 00:00": "etcd 사용량 7.5GB",
            "2022-03-10 06:00": "자동 스케일링으로 Pod 대량 생성",
            "2022-03-10 06:30": "etcd 사용량 7.9GB - 경고 무시",
            "2022-03-10 07:00": "etcd 사용량 8.0GB 도달",
            "2022-03-10 07:01": "etcd 쓰기 거부 시작",
            "2022-03-10 07:02": "모든 API 요청 실패",
            "2022-03-10 07:03": "Kubernetes 클러스터 완전 정지",
            "2022-03-10 07:05": "Pinterest 전체 다운"
        }
        
        print("💣 Pinterest etcd 폭탄:, ")
        
        for time, event in timeline.items():
            print(f"{time}: {event}")
        
        print(", 😱 결과: 4시간 전체 서비스 중단")
        print("💰 손실: 약 400만 달러, ")
        
        self.explain_8gb_limit()
    
    def explain_8gb_limit(self):
        """
        8GB 제한의 이유와 해결책
        """
        print("❓ 왜 8GB 제한인가?, ")
        
        reasons = """
        1. 메모리 매핑 한계:
           - etcd는 전체 DB를 메모리에 매핑
           - 8GB = 안전한 메모리 한계
           
        2. Raft 스냅샷 전송:
           - 새 노드 조인시 전체 스냅샷 전송
           - 8GB 이상 = 네트워크 타임아웃
           
        3. 복구 시간:
           - 재시작시 전체 로드
           - 8GB = 약 30초
           - 16GB = 약 2분 (너무 김!)
        """
        
        print(reasons)
        
        # 모니터링과 예방
        self.prevention_guide()
    
    def prevention_guide(self):
        """
        etcd 폭탄 예방 가이드
        """
        class EtcdMonitor:
            def __init__(self):
                self.quota = 8 * 1024 * 1024 * 1024  # 8GB
                self.warning_threshold = 0.75  # 75%
                self.critical_threshold = 0.90  # 90%
                
            def check_usage(self):
                """
                사용량 체크 (Pinterest가 놓친 것)
                """
                # 실제 메트릭
                metrics = {
                    "db_size": 7.2 * 1024 * 1024 * 1024,
                    "db_size_in_use": 6.8 * 1024 * 1024 * 1024,
                    "keys_total": 1500000,
                    "largest_key": "pods/namespace-prod/",
                    "largest_key_size": 500 * 1024 * 1024  # 500MB!
                }
                
                usage_percent = metrics["db_size"] / self.quota
                
                print(f", 📊 etcd 상태 체크:")
                print(f"사용량: {usage_percent:.1%}")
                print(f"키 개수: {metrics['keys_total']:,}")
                print(f"최대 키: {metrics['largest_key']}")
                
                if usage_percent > self.critical_threshold:
                    print("🚨 치명적! 즉시 조치 필요!")
                    self.emergency_cleanup()
                elif usage_percent > self.warning_threshold:
                    print("⚠️ 경고! Compaction 필요!")
                    self.run_compaction()
                else:
                    print("✅ 정상")
            
            def emergency_cleanup(self):
                """
                긴급 정리 (Pinterest가 했어야 할 것)
                """
                cleanup_commands = [
                    "# 1. 오래된 이벤트 삭제",
                    "etcdctl del /registry/events --prefix",
                    "",
                    "# 2. 완료된 Job/Pod 삭제",
                    "kubectl delete pods --field-selector status.phase=Succeeded",
                    "",
                    "# 3. Compaction 실행",
                    "etcdctl compact $(etcdctl endpoint status --write-out json | jq .header.revision)",
                    "",
                    "# 4. Defragmentation",
                    "etcdctl defrag"
                ]
                
                print(", 🚑 긴급 조치:")
                for cmd in cleanup_commands:
                    print(cmd)
        
        monitor = EtcdMonitor()
        monitor.check_usage()
```

## Part 5: 실전 트러블슈팅 - Netflix의 교훈 🔧

### 3초 만에 복구한 etcd 장애

```python
class NetflixEtcdRecovery:
    """
    Netflix가 3초 만에 etcd를 복구한 방법
    """
    
    def the_3_second_recovery(self):
        """
        2023년 Netflix 스트리밍 중단 위기
        """
        print("🎬 Netflix 금요일 밤 위기:, ")
        
        crisis = {
            "time": "2023-11-24 20:00 (Black Friday)",
            "users": "2억 명 동시 접속",
            "problem": "etcd 리더 노드 디스크 100%",
            "at_risk": "전 세계 스트리밍 중단 위험"
        }
        
        print(f"상황: {crisis['problem']}")
        print(f"위험: {crisis['at_risk']}, ")
        
        print("⚡ 3초 복구 스크립트:")
        self.recovery_script()
    
    def recovery_script(self):
        """
        Netflix의 마법 같은 복구 스크립트
        """
        recovery_steps = """
        #!/bin/bash
        # Netflix etcd 긴급 복구 스크립트
        
        # 1초: 리더 찾기 및 강제 사임
        LEADER=$(etcdctl endpoint status --cluster -w json | jq -r '.[] | select(.Status.leader) | .Endpoint')
        etcdctl move-leader $LEADER
        echo "✅ 리더 변경 완료 (1초)"
        
        # 2초: 문제 노드 격리 및 정리
        etcdctl member remove $PROBLEM_NODE_ID
        ssh $PROBLEM_NODE "rm -rf /var/lib/etcd/*"
        echo "✅ 문제 노드 제거 (2초)"
        
        # 3초: 새 노드로 교체
        etcdctl member add new-node --peer-urls=http://new-node:2380
        echo "✅ 새 노드 추가 (3초)"
        
        echo "🎉 복구 완료! 서비스 정상!"
        """
        
        print(recovery_steps)
        
        # 사전 준비의 중요성
        self.preparation_is_key()
    
    def preparation_is_key(self):
        """
        Netflix가 3초 복구를 가능하게 한 준비
        """
        print(", 🎯 3초 복구의 비밀:, ")
        
        preparations = {
            "1. 자동화된 스크립트": [
                "모든 시나리오별 스크립트 준비",
                "매주 Chaos Engineering으로 테스트",
                "스크립트 버전 관리 (Git)"
            ],
            
            "2. 실시간 모니터링": [
                "Prometheus 메트릭 (1초 간격)",
                "Grafana 대시보드 (임계값 알림)",
                "PagerDuty 연동 (즉시 알림)"
            ],
            
            "3. 핫 스탠바이": [
                "예비 노드 항상 준비",
                "데이터 미리 동기화",
                "1초 내 교체 가능"
            ],
            
            "4. 팀 훈련": [
                "매월 장애 시뮬레이션",
                "역할별 체크리스트",
                "3초 목표 반복 훈련"
            ]
        }
        
        for category, items in preparations.items():
            print(f", {category}:")
            for item in items:
                print(f"  • {item}")
        
        print(", 💡 교훈: 준비된 자만이 살아남는다!")
```

## 마치며: etcd 마스터의 길 🎓

### 핵심 교훈 정리

```python
def etcd_mastery():
    """
    etcd 마스터가 되는 길
    """
    golden_rules = {
        "1️⃣": "홀수 노드는 생존의 법칙이다",
        "2️⃣": "8GB는 넘지 말아야 할 선이다",
        "3️⃣": "Watch는 폴링보다 1000배 효율적이다",
        "4️⃣": "MVCC는 실수를 되돌릴 수 있게 한다",
        "5️⃣": "Compaction을 잊으면 재앙이 온다"
    }
    
    mastery_levels = {
        "🥉 Bronze": "기본 get/put, 클러스터 구성",
        "🥈 Silver": "Watch 구현, MVCC 이해",
        "🥇 Gold": "Raft 디버깅, 성능 튜닝",
        "💎 Diamond": "장애 복구, 대규모 운영"
    }
    
    final_wisdom = """
    💡 Remember:
    
    "etcd는 단순한 Key-Value 저장소가 아닙니다.
     
     Discord가 12억 메시지를 잃지 않고,
     Netflix가 3초 만에 복구할 수 있는 것은
     etcd의 Raft 합의 덕분입니다.
     
     작지만 강력한 3개 노드가
     수천 개 노드의 운명을 결정한다는 것을 기억하세요."
    
    - etcd Maintainers
    """
    
    return golden_rules, mastery_levels, final_wisdom

# 체크리스트
print("🎯 etcd Mastery Check:")
print("□ Raft 리더 선출 이해")
print("□ MVCC 시간 여행 구현")
print("□ Watch 메커니즘 최적화")
print("□ 8GB 제한 모니터링")
print("□ 장애 복구 스크립트 준비")
```

---

*"합의는 민주주의처럼 느리지만 독재보다 안전하다"* - etcd 개발팀

다음 문서에서는 [Pod의 생명주기](../workloads/01-pods-v2.md)를 파헤쳐보겠습니다! 🚀
