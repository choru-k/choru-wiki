---
tags:
  - Event-Driven
  - Event Sourcing
  - CQRS
  - Aggregate Pattern
  - Guide
---

# 16.2C 이벤트 소싱 구현 - 이벤트 스토어와 집합체 패턴

## 🔄 이벤트 소싱 (Event Sourcing) 심화

### 이벤트 스토어 구현

```python
# Python으로 구현한 이벤트 스토어
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Iterator
from datetime import datetime
import json
import uuid
from abc import ABC, abstractmethod

@dataclass
class EventMetadata:
    event_id: str
    event_type: str
    event_version: str
    timestamp: datetime
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None
    user_id: Optional[str] = None

@dataclass
class StoredEvent:
    """저장된 이벤트 표현"""
    stream_id: str
    stream_version: int
    event_id: str
    event_type: str
    event_data: Dict[str, Any]
    metadata: EventMetadata
    timestamp: datetime

class EventStore(ABC):
    """이벤트 스토어 추상 인터페이스"""
    
    @abstractmethod
    async def append_to_stream(
        self, 
        stream_id: str, 
        expected_version: int,
        events: List[Dict[str, Any]]
    ) -> None:
        """스트림에 이벤트 추가"""
        pass
    
    @abstractmethod
    async def read_stream(
        self, 
        stream_id: str, 
        from_version: int = 0,
        max_count: Optional[int] = None
    ) -> List[StoredEvent]:
        """스트림에서 이벤트 읽기"""
        pass
    
    @abstractmethod
    async def read_all_events(
        self,
        from_position: int = 0,
        max_count: Optional[int] = None
    ) -> List[StoredEvent]:
        """모든 이벤트 읽기 (글로벌 순서)"""
        pass

class PostgreSQLEventStore(EventStore):
    """PostgreSQL 기반 이벤트 스토어 구현"""
    
    def __init__(self, connection_pool):
        self.pool = connection_pool
        
    async def append_to_stream(
        self, 
        stream_id: str, 
        expected_version: int,
        events: List[Dict[str, Any]]
    ) -> None:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # 동시성 제어: 현재 스트림 버전 확인
                current_version = await self._get_stream_version(conn, stream_id)
                
                if current_version != expected_version:
                    raise ConcurrencyException(
                        f"예상 버전 {expected_version}, 실제 버전 {current_version}"
                    )
                
                # 이벤트 저장
                for i, event in enumerate(events):
                    next_version = expected_version + i + 1
                    
                    await conn.execute("""
                        INSERT INTO events (
                            event_id, stream_id, stream_version, event_type,
                            event_data, metadata, timestamp
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """, 
                        event['event_id'],
                        stream_id,
                        next_version,
                        event['event_type'],
                        json.dumps(event['data']),
                        json.dumps(event['metadata'].__dict__),
                        event['timestamp']
                    )
                
                # 스트림 버전 업데이트
                final_version = expected_version + len(events)
                await conn.execute("""
                    INSERT INTO streams (stream_id, version, last_updated)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (stream_id)
                    DO UPDATE SET version = $2, last_updated = $3
                """, stream_id, final_version, datetime.utcnow())
    
    async def read_stream(
        self, 
        stream_id: str, 
        from_version: int = 0,
        max_count: Optional[int] = None
    ) -> List[StoredEvent]:
        async with self.pool.acquire() as conn:
            query = """
                SELECT event_id, stream_id, stream_version, event_type,
                       event_data, metadata, timestamp
                FROM events 
                WHERE stream_id = $1 AND stream_version > $2
                ORDER BY stream_version
            """
            params = [stream_id, from_version]
            
            if max_count:
                query += " LIMIT $3"
                params.append(max_count)
            
            rows = await conn.fetch(query, *params)
            return [self._row_to_stored_event(row) for row in rows]
    
    async def read_all_events(
        self,
        from_position: int = 0,
        max_count: Optional[int] = None
    ) -> List[StoredEvent]:
        async with self.pool.acquire() as conn:
            query = """
                SELECT event_id, stream_id, stream_version, event_type,
                       event_data, metadata, timestamp, global_position
                FROM events 
                WHERE global_position > $1
                ORDER BY global_position
            """
            params = [from_position]
            
            if max_count:
                query += " LIMIT $2"
                params.append(max_count)
            
            rows = await conn.fetch(query, *params)
            return [self._row_to_stored_event(row) for row in rows]
    
    async def _get_stream_version(self, conn, stream_id: str) -> int:
        row = await conn.fetchrow(
            "SELECT version FROM streams WHERE stream_id = $1", 
            stream_id
        )
        return row['version'] if row else 0
    
    def _row_to_stored_event(self, row) -> StoredEvent:
        metadata_dict = json.loads(row['metadata'])
        
        return StoredEvent(
            stream_id=row['stream_id'],
            stream_version=row['stream_version'],
            event_id=row['event_id'],
            event_type=row['event_type'],
            event_data=json.loads(row['event_data']),
            metadata=EventMetadata(**metadata_dict),
            timestamp=row['timestamp']
        )

# 집합체 루트 기반 클래스
class AggregateRoot:
    """이벤트 소싱 기반 집합체 루트"""
    
    def __init__(self, aggregate_id: str):
        self.aggregate_id = aggregate_id
        self.version = 0
        self.uncommitted_events: List[Dict[str, Any]] = []
        
    def apply_event(self, event_data: Dict[str, Any], metadata: EventMetadata) -> None:
        """이벤트를 집합체에 적용"""
        event_handler_name = f"_handle_{metadata.event_type.replace('.', '_')}"
        event_handler = getattr(self, event_handler_name, None)
        
        if event_handler:
            event_handler(event_data)
        
        self.version += 1
    
    def raise_event(self, event_type: str, event_data: Dict[str, Any]) -> None:
        """새 이벤트 발생"""
        metadata = EventMetadata(
            event_id=str(uuid.uuid4()),
            event_type=event_type,
            event_version="1.0",
            timestamp=datetime.utcnow(),
            correlation_id=self._get_current_correlation_id()
        )
        
        # 먼저 이벤트를 집합체에 적용
        self.apply_event(event_data, metadata)
        
        # 커밋되지 않은 이벤트 목록에 추가
        self.uncommitted_events.append({
            'event_id': metadata.event_id,
            'event_type': event_type,
            'data': event_data,
            'metadata': metadata,
            'timestamp': metadata.timestamp
        })
    
    def mark_events_as_committed(self) -> None:
        """이벤트들을 커밋된 것으로 표시"""
        self.uncommitted_events.clear()
    
    def get_uncommitted_events(self) -> List[Dict[str, Any]]:
        """커밋되지 않은 이벤트 목록 반환"""
        return self.uncommitted_events.copy()
    
    def _get_current_correlation_id(self) -> Optional[str]:
        # 현재 요청 컨텍스트에서 correlation ID 추출
        # 실제로는 ThreadLocal이나 AsyncLocal 사용
        return getattr(self, '_correlation_id', None)

# 사용자 집합체 예제
class User(AggregateRoot):
    def __init__(self, user_id: str):
        super().__init__(user_id)
        self.email: Optional[str] = None
        self.name: Optional[str] = None
        self.subscription_plan: Optional[str] = None
        self.preferences: List[str] = []
        self.is_active: bool = True
    
    def register(self, email: str, name: str, initial_preferences: List[str]) -> None:
        """사용자 등록"""
        if self.email is not None:
            raise DomainException("이미 등록된 사용자입니다")
        
        self.raise_event("user.registered", {
            "user_id": self.aggregate_id,
            "email": email,
            "name": name,
            "initial_preferences": initial_preferences,
            "registration_timestamp": datetime.utcnow().isoformat()
        })
    
    def subscribe_to_plan(self, plan: str, payment_method: str) -> None:
        """구독 플랜 가입"""
        if not self.is_active:
            raise DomainException("비활성 사용자는 구독할 수 없습니다")
        
        self.raise_event("user.subscribed", {
            "user_id": self.aggregate_id,
            "plan": plan,
            "payment_method": payment_method,
            "subscription_timestamp": datetime.utcnow().isoformat()
        })
    
    def update_preferences(self, new_preferences: List[str]) -> None:
        """사용자 선호도 업데이트"""
        if not self.is_active:
            raise DomainException("비활성 사용자는 선호도를 변경할 수 없습니다")
        
        self.raise_event("user.preferences_updated", {
            "user_id": self.aggregate_id,
            "old_preferences": self.preferences.copy(),
            "new_preferences": new_preferences,
            "update_timestamp": datetime.utcnow().isoformat()
        })
    
    # 이벤트 핸들러들
    def _handle_user_registered(self, event_data: Dict[str, Any]) -> None:
        self.email = event_data["email"]
        self.name = event_data["name"]
        self.preferences = event_data["initial_preferences"]
    
    def _handle_user_subscribed(self, event_data: Dict[str, Any]) -> None:
        self.subscription_plan = event_data["plan"]
    
    def _handle_user_preferences_updated(self, event_data: Dict[str, Any]) -> None:
        self.preferences = event_data["new_preferences"]

# 리포지토리 패턴으로 집합체 저장/로드
class UserRepository:
    def __init__(self, event_store: EventStore):
        self.event_store = event_store
    
    async def save(self, user: User) -> None:
        """사용자 집합체 저장"""
        uncommitted_events = user.get_uncommitted_events()
        
        if uncommitted_events:
            await self.event_store.append_to_stream(
                stream_id=f"user-{user.aggregate_id}",
                expected_version=user.version - len(uncommitted_events),
                events=uncommitted_events
            )
            
            user.mark_events_as_committed()
    
    async def load(self, user_id: str) -> Optional[User]:
        """사용자 집합체 로드"""
        stream_id = f"user-{user_id}"
        events = await self.event_store.read_stream(stream_id)
        
        if not events:
            return None
        
        user = User(user_id)
        
        for event in events:
            user.apply_event(event.event_data, event.metadata)
        
        return user

# 사용 예제
async def example_usage():
    # 이벤트 스토어 초기화
    event_store = PostgreSQLEventStore(connection_pool)
    user_repo = UserRepository(event_store)
    
    # 새 사용자 등록
    user = User("user-123")
    user.register(
        email="john@example.com",
        name="John Doe",
        initial_preferences=["drama", "comedy", "action"]
    )
    
    # 구독 가입
    user.subscribe_to_plan("premium", "credit_card")
    
    # 선호도 변경
    user.update_preferences(["drama", "thriller", "documentary"])
    
    # 집합체 저장 (모든 이벤트가 원자적으로 저장됨)
    await user_repo.save(user)
    
    # 나중에 사용자 로드 (이벤트 재생으로 상태 복원)
    loaded_user = await user_repo.load("user-123")
    print(f"로드된 사용자: {loaded_user.name}, 선호도: {loaded_user.preferences}")
```

### 스냅샷 기반 읽기 모델 (CQRS)

```python
# CQRS를 활용한 읽기 모델 구현
from dataclasses import dataclass
from typing import List, Dict, Any
import asyncio
from datetime import datetime

# 읽기 모델 인터페이스
class ReadModelUpdater(ABC):
    @abstractmethod
    async def handle_event(self, event: StoredEvent) -> None:
        pass

# 사용자 프로필 읽기 모델
@dataclass
class UserProfileReadModel:
    user_id: str
    email: str
    name: str
    subscription_plan: str
    preferences: List[str]
    total_watch_time: int  # 초 단위
    favorite_genres: List[str]
    last_active: datetime
    registration_date: datetime
    is_premium: bool
    
class UserProfileUpdater(ReadModelUpdater):
    def __init__(self, database_connection):
        self.db = database_connection
    
    async def handle_event(self, event: StoredEvent) -> None:
        if event.event_type == "user.registered":
            await self._handle_user_registered(event)
        elif event.event_type == "user.subscribed":
            await self._handle_user_subscribed(event)
        elif event.event_type == "user.preferences_updated":
            await self._handle_preferences_updated(event)
        elif event.event_type == "content.watched":
            await self._handle_content_watched(event)
    
    async def _handle_user_registered(self, event: StoredEvent) -> None:
        data = event.event_data
        profile = UserProfileReadModel(
            user_id=data["user_id"],
            email=data["email"],
            name=data["name"],
            subscription_plan="free",
            preferences=data["initial_preferences"],
            total_watch_time=0,
            favorite_genres=data["initial_preferences"],
            last_active=event.timestamp,
            registration_date=event.timestamp,
            is_premium=False
        )
        
        await self._upsert_user_profile(profile)
    
    async def _handle_user_subscribed(self, event: StoredEvent) -> None:
        data = event.event_data
        
        await self.db.execute("""
            UPDATE user_profiles 
            SET subscription_plan = $1, is_premium = $2, last_active = $3
            WHERE user_id = $4
        """, data["plan"], data["plan"] != "free", event.timestamp, data["user_id"])
    
    async def _handle_preferences_updated(self, event: StoredEvent) -> None:
        data = event.event_data
        
        await self.db.execute("""
            UPDATE user_profiles 
            SET preferences = $1, last_active = $2
            WHERE user_id = $3
        """, json.dumps(data["new_preferences"]), event.timestamp, data["user_id"])
    
    async def _handle_content_watched(self, event: StoredEvent) -> None:
        # 시청 이벤트는 다른 서비스에서 발생하지만 사용자 프로필 업데이트
        data = event.event_data
        
        # 시청 시간 및 선호 장르 업데이트
        await self.db.execute("""
            UPDATE user_profiles 
            SET 
                total_watch_time = total_watch_time + $1,
                last_active = $2,
                favorite_genres = (
                    SELECT array_agg(DISTINCT genre)
                    FROM (
                        SELECT unnest(favorite_genres) as genre
                        UNION ALL
                        SELECT $3 as genre
                    ) t
                )
            WHERE user_id = $4
        """, 
            data["watch_duration_seconds"], 
            event.timestamp, 
            data.get("genre", "unknown"),
            data["user_id"]
        )
    
    async def _upsert_user_profile(self, profile: UserProfileReadModel) -> None:
        await self.db.execute("""
            INSERT INTO user_profiles (
                user_id, email, name, subscription_plan, preferences,
                total_watch_time, favorite_genres, last_active, 
                registration_date, is_premium
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (user_id) DO UPDATE SET
                email = EXCLUDED.email,
                name = EXCLUDED.name,
                subscription_plan = EXCLUDED.subscription_plan,
                preferences = EXCLUDED.preferences,
                total_watch_time = EXCLUDED.total_watch_time,
                favorite_genres = EXCLUDED.favorite_genres,
                last_active = EXCLUDED.last_active,
                is_premium = EXCLUDED.is_premium
        """, 
            profile.user_id, profile.email, profile.name, 
            profile.subscription_plan, json.dumps(profile.preferences),
            profile.total_watch_time, json.dumps(profile.favorite_genres),
            profile.last_active, profile.registration_date, profile.is_premium
        )

# 콘텐츠 인기도 읽기 모델
@dataclass
class ContentPopularityReadModel:
    content_id: str
    title: str
    genre: str
    total_views: int
    total_watch_time: int
    average_completion_rate: float
    unique_viewers: int
    rating_average: float
    rating_count: int
    trending_score: float
    last_updated: datetime

class ContentPopularityUpdater(ReadModelUpdater):
    def __init__(self, database_connection):
        self.db = database_connection
    
    async def handle_event(self, event: StoredEvent) -> None:
        if event.event_type == "content.watched":
            await self._handle_content_watched(event)
        elif event.event_type == "content.rated":
            await self._handle_content_rated(event)
    
    async def _handle_content_watched(self, event: StoredEvent) -> None:
        data = event.event_data
        
        # 조회수, 시청 시간, 완주율 업데이트
        await self.db.execute("""
            INSERT INTO content_popularity (
                content_id, total_views, total_watch_time, 
                completion_rates, unique_viewers, last_updated
            ) VALUES (
                $1, 1, $2, ARRAY[$3], 1, $4
            )
            ON CONFLICT (content_id) DO UPDATE SET
                total_views = content_popularity.total_views + 1,
                total_watch_time = content_popularity.total_watch_time + $2,
                completion_rates = array_append(content_popularity.completion_rates, $3),
                unique_viewers = (
                    SELECT COUNT(DISTINCT user_id) 
                    FROM content_watch_history 
                    WHERE content_id = $1
                ),
                average_completion_rate = (
                    SELECT AVG(rate) 
                    FROM unnest(array_append(content_popularity.completion_rates, $3)) as rate
                ),
                trending_score = calculate_trending_score(
                    content_popularity.total_views + 1,
                    content_popularity.total_watch_time + $2,
                    $4
                ),
                last_updated = $4
        """, data["content_id"], data["watch_duration_seconds"], 
             data["completion_percentage"], event.timestamp)
    
    async def _handle_content_rated(self, event: StoredEvent) -> None:
        data = event.event_data
        
        # 평점 업데이트
        await self.db.execute("""
            UPDATE content_popularity 
            SET 
                rating_count = rating_count + 1,
                rating_average = (
                    (rating_average * rating_count + $2) / (rating_count + 1)
                ),
                last_updated = $3
            WHERE content_id = $1
        """, data["content_id"], data["rating"], event.timestamp)

# 이벤트 프로젝션 서비스
class EventProjectionService:
    def __init__(self, event_store: EventStore):
        self.event_store = event_store
        self.updaters: List[ReadModelUpdater] = []
        self.last_processed_position = 0
    
    def register_updater(self, updater: ReadModelUpdater) -> None:
        self.updaters.append(updater)
    
    async def start_projection(self) -> None:
        """이벤트 프로젝션 시작"""
        while True:
            try:
                # 새로운 이벤트들을 배치로 처리
                events = await self.event_store.read_all_events(
                    from_position=self.last_processed_position,
                    max_count=100  # 배치 사이즈
                )
                
                if not events:
                    await asyncio.sleep(1)  # 새 이벤트 대기
                    continue
                
                for event in events:
                    # 모든 등록된 업데이터에 이벤트 전송
                    for updater in self.updaters:
                        try:
                            await updater.handle_event(event)
                        except Exception as e:
                            print(f"이벤트 처리 오류: {e}")
                    
                    self.last_processed_position = event.global_position
                
                # 체크포인트 저장
                await self._save_checkpoint(self.last_processed_position)
                
            except Exception as e:
                print(f"프로젝션 오류: {e}")
                await asyncio.sleep(5)  # 오류 시 지연
    
    async def _save_checkpoint(self, position: int) -> None:
        # 체크포인트를 데이터베이스에 저장
        pass

# 사용 예제
async def setup_cqrs_example():
    # 이벤트 스토어 초기화
    event_store = PostgreSQLEventStore(connection_pool)
    
    # 프로젝션 서비스 설정
    projection_service = EventProjectionService(event_store)
    
    # 등록된 업데이터들
    user_profile_updater = UserProfileUpdater(database_connection)
    content_popularity_updater = ContentPopularityUpdater(database_connection)
    
    projection_service.register_updater(user_profile_updater)
    projection_service.register_updater(content_popularity_updater)
    
    # 백그라운드로 프로젝션 시작
    asyncio.create_task(projection_service.start_projection())
    
    print("이벤트 프로젝션 서비스 시작 완료")
```

### 동시성 제어와 충돌 해결

```python
# 낙관적 동시성 제어 (Optimistic Concurrency Control)
class OptimisticConcurrencyException(Exception):
    def __init__(self, expected_version: int, actual_version: int):
        self.expected_version = expected_version
        self.actual_version = actual_version
        super().__init__(f"동시성 충돌: 예상 버전 {expected_version}, 실제 버전 {actual_version}")

class ConcurrencyManager:
    """Aggregate 레벨에서의 동시성 제어"""
    
    def __init__(self, event_store: EventStore):
        self.event_store = event_store
        self.retry_config = RetryConfig(max_attempts=3, base_delay=0.1)
    
    async def save_with_retry(self, aggregate: AggregateRoot) -> None:
        """Retry 로직을 포함한 안전한 저장"""
        for attempt in range(self.retry_config.max_attempts):
            try:
                uncommitted_events = aggregate.get_uncommitted_events()
                
                if not uncommitted_events:
                    return  # 저장할 이벤트가 없음
                
                expected_version = aggregate.version - len(uncommitted_events)
                stream_id = f"{aggregate.__class__.__name__.lower()}-{aggregate.aggregate_id}"
                
                await self.event_store.append_to_stream(
                    stream_id=stream_id,
                    expected_version=expected_version,
                    events=uncommitted_events
                )
                
                aggregate.mark_events_as_committed()
                return  # 성공
                
            except ConcurrencyException as e:
                if attempt == self.retry_config.max_attempts - 1:
                    raise OptimisticConcurrencyException(e.expected_version, e.actual_version)
                
                # Aggregate 재로드 및 재시도
                await self._reload_and_retry(aggregate)
                await asyncio.sleep(self.retry_config.base_delay * (2 ** attempt))
    
    async def _reload_and_retry(self, aggregate: AggregateRoot) -> None:
        """충돌 시 Aggregate 재로드"""
        # 현재 상태를 백업
        pending_events = aggregate.get_uncommitted_events()
        
        # 새로운 상태로 재로드
        stream_id = f"{aggregate.__class__.__name__.lower()}-{aggregate.aggregate_id}"
        events = await self.event_store.read_stream(stream_id)
        
        # Aggregate 상태 초기화 후 재구성
        aggregate.__init__(aggregate.aggregate_id)
        for event in events:
            aggregate.apply_event(event.event_data, event.metadata)
        
        # 보류중이던 이벤트들을 새 상태에 다시 적용
        await self._reapply_pending_events(aggregate, pending_events)
    
    async def _reapply_pending_events(self, aggregate: AggregateRoot, pending_events: List[Dict[str, Any]]) -> None:
        """보류중이던 이벤트들을 다시 적용 (비즈니스 로직 재실행)"""
        # 이 부분은 비즈니스 로직에 따라 달라짐니다.
        # 예: 사용자 선호도 업데이트의 경우 최신 상태에서 다시 실행
        for event_data in pending_events:
            # 비즈니스 메소드 다시 호출
            method_name = self._extract_business_method(event_data['event_type'])
            if hasattr(aggregate, method_name):
                # 원래 메소드 매개변수를 이벤트데이터에서 복원
                await self._invoke_business_method(aggregate, method_name, event_data['data'])
    
    def _extract_business_method(self, event_type: str) -> str:
        # 이벤트 타입에서 비즈니스 메소드 이름 추출
        # 예: "user.preferences_updated" -> "update_preferences"
        if event_type == "user.preferences_updated":
            return "update_preferences"
        elif event_type == "user.subscribed":
            return "subscribe_to_plan"
        return None
    
    async def _invoke_business_method(self, aggregate: AggregateRoot, method_name: str, event_data: Dict[str, Any]) -> None:
        # 비즈니스 로직 재실행
        if method_name == "update_preferences":
            aggregate.update_preferences(event_data["new_preferences"])
        elif method_name == "subscribe_to_plan":
            aggregate.subscribe_to_plan(event_data["plan"], event_data["payment_method"])

@dataclass
class RetryConfig:
    max_attempts: int
    base_delay: float
```

## 핵심 요점

### 1. PostgreSQL 기반 이벤트 스토어

Python으로 구현한 완전한 이벤트 스토어로, 동시성 제어와 트랜잭션 처리를 포함합니다.

### 2. 집합체 루트 패턴

비즈니스 로직과 이벤트 소싱을 결합한 완전한 도메인 모델 구현을 통해 일관성을 보장합니다.

### 3. CQRS와 읽기 모델

이벤트로부터 다양한 읽기 모델을 생성하는 프로젝션 패턴과 실시간 데이터 동기화 방법을 구현했습니다.

### 4. 동시성 충돌 해결

낙관적 동시성 제어와 재시도 로직을 통해 동시 접근 상황에서도 데이터 일관성을 유지합니다.

---

**이전**: [16.2B 실시간 스트림 처리](02b-real-time-stream-processing.md)  
**다음**: [16.2D 베스트 프랙티스](02d-best-practices-success-factors.md)에서 성공 요인과 안티패턴을 학습합니다.
