---
tags:
  - DistributedSystems
  - CQRS
  - EventSourcing
  - Performance
  - Guide
---

# 14.4D CQRS Pattern - 읽기/쓰기 모델 분리

## 📈 읽기와 쓰기의 서로 다른 요구사항

CQRS(Command Query Responsibility Segregation)는 읽기와 쓰기를 완전히 분리하여 각각 최적화하는 패턴입니다.

## 🔄 CQRS (Command Query Responsibility Segregation)

### 📊 CQRS Pattern 구현

읽기와 쓰기를 완전히 분리하여 각각 최적화:

```python
from abc import ABC, abstractmethod
from typing import Dict, List, Any
import json
import threading
from dataclasses import dataclass
from datetime import datetime
import time
import uuid

# Command 측 (쓰기)
class Command(ABC):
    pass

@dataclass 
class CreateUserCommand(Command):
    user_id: str
    email: str
    name: str

@dataclass
class UpdateUserEmailCommand(Command):
    user_id: str
    new_email: str

class CommandHandler(ABC):
    @abstractmethod
    def handle(self, command: Command) -> Dict[str, Any]:
        pass

class UserCommandHandler(CommandHandler):
    """사용자 도메인 Command Handler"""
    
    def __init__(self, event_store: 'EventStore'):
        self.event_store = event_store
        self.users = {}  # 실제로는 데이터베이스
    
    def handle(self, command: Command) -> Dict[str, Any]:
        if isinstance(command, CreateUserCommand):
            return self._create_user(command)
        elif isinstance(command, UpdateUserEmailCommand):
            return self._update_user_email(command)
        else:
            raise ValueError(f"Unsupported command: {type(command)}")
    
    def _create_user(self, command: CreateUserCommand) -> Dict[str, Any]:
        # 비즈니스 로직 검증
        if command.user_id in self.users:
            raise ValueError(f"User {command.user_id} already exists")
        
        # 도메인 이벤트 생성
        event = UserCreatedEvent(
            user_id=command.user_id,
            email=command.email,
            name=command.name,
            timestamp=datetime.now()
        )
        
        # 이벤트 저장 (Event Sourcing)
        self.event_store.append(command.user_id, event)
        
        # 상태 업데이트
        self.users[command.user_id] = {
            'email': command.email,
            'name': command.name,
            'created_at': event.timestamp
        }
        
        return {'status': 'success', 'user_id': command.user_id}
    
    def _update_user_email(self, command: UpdateUserEmailCommand) -> Dict[str, Any]:
        if command.user_id not in self.users:
            raise ValueError(f"User {command.user_id} not found")
        
        old_email = self.users[command.user_id]['email']
        
        # 도메인 이벤트 생성
        event = UserEmailUpdatedEvent(
            user_id=command.user_id,
            old_email=old_email,
            new_email=command.new_email,
            timestamp=datetime.now()
        )
        
        # 이벤트 저장
        self.event_store.append(command.user_id, event)
        
        # 상태 업데이트
        self.users[command.user_id]['email'] = command.new_email
        
        return {'status': 'success', 'old_email': old_email, 'new_email': command.new_email}

# Query 측 (읽기)
class Query(ABC):
    pass

@dataclass
class GetUserQuery(Query):
    user_id: str

@dataclass  
class GetUsersByEmailDomainQuery(Query):
    domain: str

class QueryHandler(ABC):
    @abstractmethod
    def handle(self, query: Query) -> Any:
        pass

class UserQueryHandler(QueryHandler):
    """사용자 도메인 Query Handler (읽기 최적화)"""
    
    def __init__(self):
        # 읽기 최적화된 데이터 저장소 (Materialized Views)
        self.user_profiles = {}           # 기본 프로필 정보
        self.users_by_email_domain = {}   # 이메일 도메인별 인덱스
        self.user_activity_summary = {}   # 활동 요약 정보
    
    def handle(self, query: Query) -> Any:
        if isinstance(query, GetUserQuery):
            return self._get_user(query)
        elif isinstance(query, GetUsersByEmailDomainQuery):
            return self._get_users_by_email_domain(query)
        else:
            raise ValueError(f"Unsupported query: {type(query)}")
    
    def _get_user(self, query: GetUserQuery) -> Dict[str, Any]:
        """개별 사용자 조회 (캐시된 데이터)"""
        user_data = self.user_profiles.get(query.user_id)
        if not user_data:
            return None
        
        # 여러 View에서 데이터 조합
        result = user_data.copy()
        result['activity'] = self.user_activity_summary.get(query.user_id, {})
        
        return result
    
    def _get_users_by_email_domain(self, query: GetUsersByEmailDomainQuery) -> List[Dict[str, Any]]:
        """도메인별 사용자 목록 (인덱스 활용)"""
        user_ids = self.users_by_email_domain.get(query.domain, [])
        
        users = []
        for user_id in user_ids:
            user_data = self.user_profiles.get(user_id)
            if user_data:
                users.append(user_data)
        
        return users
    
    def update_read_model(self, event: 'DomainEvent'):
        """이벤트를 받아서 읽기 모델 업데이트"""
        if isinstance(event, UserCreatedEvent):
            self._handle_user_created(event)
        elif isinstance(event, UserEmailUpdatedEvent):
            self._handle_user_email_updated(event)
    
    def _handle_user_created(self, event: 'UserCreatedEvent'):
        """사용자 생성 이벤트 처리"""
        # 기본 프로필 저장
        self.user_profiles[event.user_id] = {
            'user_id': event.user_id,
            'email': event.email,
            'name': event.name,
            'created_at': event.timestamp,
            'updated_at': event.timestamp
        }
        
        # 이메일 도메인별 인덱스 업데이트
        domain = event.email.split('@')[1]
        if domain not in self.users_by_email_domain:
            self.users_by_email_domain[domain] = []
        self.users_by_email_domain[domain].append(event.user_id)
        
        # 활동 요약 초기화
        self.user_activity_summary[event.user_id] = {
            'login_count': 0,
            'last_login': None,
            'orders_count': 0
        }
    
    def _handle_user_email_updated(self, event: 'UserEmailUpdatedEvent'):
        """이메일 업데이트 이벤트 처리"""
        # 프로필 업데이트
        if event.user_id in self.user_profiles:
            self.user_profiles[event.user_id]['email'] = event.new_email
            self.user_profiles[event.user_id]['updated_at'] = event.timestamp
        
        # 도메인 인덱스 재구성
        old_domain = event.old_email.split('@')[1]
        new_domain = event.new_email.split('@')[1]
        
        if old_domain in self.users_by_email_domain:
            self.users_by_email_domain[old_domain].remove(event.user_id)
        
        if new_domain not in self.users_by_email_domain:
            self.users_by_email_domain[new_domain] = []
        self.users_by_email_domain[new_domain].append(event.user_id)

# Event Sourcing
class DomainEvent:
    def __init__(self, timestamp: datetime = None):
        self.timestamp = timestamp or datetime.now()

@dataclass
class UserCreatedEvent(DomainEvent):
    user_id: str
    email: str
    name: str

@dataclass
class UserEmailUpdatedEvent(DomainEvent):
    user_id: str
    old_email: str
    new_email: str

class EventStore:
    """이벤트 저장소"""
    
    def __init__(self):
        self.events: Dict[str, List[DomainEvent]] = {}
        self.global_events: List[DomainEvent] = []
        self.subscribers: List[Callable] = []
        self.lock = threading.Lock()
    
    def append(self, aggregate_id: str, event: DomainEvent):
        """이벤트 추가"""
        with self.lock:
            if aggregate_id not in self.events:
                self.events[aggregate_id] = []
            
            self.events[aggregate_id].append(event)
            self.global_events.append(event)
            
            print(f"📝 Event stored: {type(event).__name__} for {aggregate_id}")
        
        # 구독자들에게 알림 (비동기)
        for subscriber in self.subscribers:
            threading.Thread(target=subscriber, args=(event,), daemon=True).start()
    
    def get_events(self, aggregate_id: str) -> List[DomainEvent]:
        """특정 Aggregate의 모든 이벤트 조회"""
        return self.events.get(aggregate_id, [])
    
    def subscribe(self, handler: 'Callable[[DomainEvent], None]'):
        """이벤트 구독"""
        self.subscribers.append(handler)

# CQRS 시스템 통합
class CQRSSystem:
    def __init__(self):
        self.event_store = EventStore()
        
        # Command 측
        self.command_handlers = {
            CreateUserCommand: UserCommandHandler(self.event_store),
            UpdateUserEmailCommand: UserCommandHandler(self.event_store)
        }
        
        # Query 측  
        self.query_handler = UserQueryHandler()
        
        # 이벤트 구독 (Query 모델 업데이트)
        self.event_store.subscribe(self.query_handler.update_read_model)
    
    def execute_command(self, command: Command) -> Dict[str, Any]:
        """커맨드 실행"""
        handler_class = type(command)
        if handler_class not in self.command_handlers:
            raise ValueError(f"No handler for command: {handler_class}")
        
        handler = self.command_handlers[handler_class]
        return handler.handle(command)
    
    def execute_query(self, query: Query) -> Any:
        """쿼리 실행"""
        return self.query_handler.handle(query)

# CQRS 패턴 시뮬레이션
def simulate_cqrs_pattern():
    print("=== CQRS Pattern 시뮬레이션 ===")
    
    cqrs = CQRSSystem()
    
    print(", --- Command 실행 (쓰기) ---")
    
    # 사용자 생성
    create_cmd = CreateUserCommand(
        user_id="user123",
        email="john@example.com", 
        name="John Doe"
    )
    result1 = cqrs.execute_command(create_cmd)
    print(f"Create User: {result1}")
    
    # 또 다른 사용자 생성
    create_cmd2 = CreateUserCommand(
        user_id="user456",
        email="jane@example.com",
        name="Jane Smith"  
    )
    result2 = cqrs.execute_command(create_cmd2)
    print(f"Create User 2: {result2}")
    
    # 이메일 업데이트
    update_cmd = UpdateUserEmailCommand(
        user_id="user123",
        new_email="john.doe@company.com"
    )
    result3 = cqrs.execute_command(update_cmd)
    print(f"Update Email: {result3}")
    
    print(", --- 이벤트 처리 대기 ---")
    time.sleep(0.1)  # 비동기 이벤트 처리 대기
    
    print(", --- Query 실행 (읽기) ---")
    
    # 개별 사용자 조회
    get_user_query = GetUserQuery(user_id="user123")
    user_data = cqrs.execute_query(get_user_query)
    print(f"Get User: {user_data}")
    
    # 도메인별 사용자 조회  
    domain_query = GetUsersByEmailDomainQuery(domain="company.com")
    company_users = cqrs.execute_query(domain_query)
    print(f"Company Users: {len(company_users)} users")
    
    example_domain_query = GetUsersByEmailDomainQuery(domain="example.com")
    example_users = cqrs.execute_query(example_domain_query)
    print(f"Example.com Users: {len(example_users)} users")
    
    print(", --- Event Store 확인 ---")
    events = cqrs.event_store.get_events("user123")
    print(f"User123 Events: {[type(e).__name__ for e in events]}")

# 실행
from typing import Callable
simulate_cqrs_pattern()
```

## 핵심 요점

### 1. 읽기와 쓰기 모델 분리

Command 측은 비즈니스 로직과 데이터 무결성에, Query 측은 성능과 사용자 경험에 최적화됩니다.

### 2. Event Sourcing 통합

모든 상태 변화를 이벤트로 저장하여 완전한 감사 추적과 디버깅을 가능하게 합니다.

### 3. 비동기 읽기 모델 업데이트

이벤트를 통해 읽기 모델이 비동기적으로 업데이트되어 쓰기 성능에 영향을 주지 않습니다.

---

**이전**: [Saga Pattern](04c-saga-pattern.md)  
**다음**: [분산 패턴 개요](04-distributed-patterns.md)로 돌아가서 다른 패턴들과의 연결점을 확인하세요.
