---
tags:
  - CQRS
  - Event Sourcing
  - Projection
  - advanced
  - hands-on
  - medium-read
  - 다중 데이터베이스
  - 비동기 처리
  - 애플리케이션개발
difficulty: ADVANCED
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 16.3d 프로젝션 구현

## 🔄 이벤트로부터 읽기 모델 생성

```python
# Python으로 구현한 프로젝션 시스템
import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from abc import ABC, abstractmethod
import asyncpg
import aioredis
from elasticsearch import AsyncElasticsearch

@dataclass
class DomainEvent:
    event_id: str
    event_type: str
    aggregate_id: str
    version: int
    timestamp: datetime
    data: Dict[str, Any]

class EventProjector(ABC):
    """이벤트 프로젝터 기본 클래스"""
    
    @abstractmethod
    async def project_event(self, event: DomainEvent) -> None:
        """이벤트를 프로젝션에 적용"""
        pass
    
    @abstractmethod
    def can_handle(self, event_type: str) -> bool:
        """해당 이벤트 타입을 처리할 수 있는지 확인"""
        pass

class AccountSummaryProjector(EventProjector):
    """계좌 요약 정보 프로젝션"""
    
    def __init__(self, mongo_client, redis_client):
        self.mongo = mongo_client
        self.redis = redis_client
        self.db = self.mongo.get_database("read_models")
        self.collection = self.db.get_collection("account_summaries")
    
    def can_handle(self, event_type: str) -> bool:
        return event_type in [
            "AccountCreated",
            "MoneyDeposited", 
            "MoneyWithdrawn",
            "MoneyTransferred"
        ]
    
    async def project_event(self, event: DomainEvent) -> None:
        handler_map = {
            "AccountCreated": self._handle_account_created,
            "MoneyDeposited": self._handle_money_deposited,
            "MoneyWithdrawn": self._handle_money_withdrawn,
            "MoneyTransferred": self._handle_money_transferred
        }
        
        handler = handler_map.get(event.event_type)
        if handler:
            await handler(event)
            # 캐시 무효화
            await self._invalidate_cache(event.aggregate_id)
    
    async def _handle_account_created(self, event: DomainEvent) -> None:
        account_summary = {
            "_id": event.aggregate_id,
            "account_id": event.aggregate_id,
            "user_id": event.data["user_id"],
            "account_type": event.data["account_type"],
            "currency": event.data["currency"],
            "current_balance": event.data["initial_deposit"],
            "available_balance": event.data["initial_deposit"],
            "created_at": event.timestamp,
            "last_transaction_at": event.timestamp,
            "transaction_count_30days": 1,
            "total_deposits": event.data["initial_deposit"],
            "total_withdrawals": 0.0,
            "total_transfers_out": 0.0,
            "total_transfers_in": 0.0,
            "is_active": True,
            "last_updated": event.timestamp
        }
        
        await self.collection.insert_one(account_summary)
        print(f"✅ 계좌 요약 생성: {event.aggregate_id}")
    
    async def _handle_money_deposited(self, event: DomainEvent) -> None:
        account_id = event.aggregate_id
        amount = event.data["amount"]
        new_balance = event.data["balance_after"]
        
        # 30일 간의 거래 수 계산
        thirty_days_ago = event.timestamp - timedelta(days=30)
        
        update_data = {
            "$set": {
                "current_balance": new_balance,
                "available_balance": new_balance,
                "last_transaction_at": event.timestamp,
                "last_updated": event.timestamp
            },
            "$inc": {
                "total_deposits": amount,
                "transaction_count_30days": 1
            }
        }
        
        await self.collection.update_one(
            {"_id": account_id},
            update_data
        )
        
        print(f"💰 입금 프로젝션 업데이트: {account_id}, 금액: ${amount}")
    
    async def _handle_money_withdrawn(self, event: DomainEvent) -> None:
        account_id = event.aggregate_id
        amount = event.data["amount"]
        fee = event.data.get("fee", 0)
        new_balance = event.data["balance_after"]
        
        update_data = {
            "$set": {
                "current_balance": new_balance,
                "available_balance": new_balance,
                "last_transaction_at": event.timestamp,
                "last_updated": event.timestamp
            },
            "$inc": {
                "total_withdrawals": amount + fee,
                "transaction_count_30days": 1
            }
        }
        
        await self.collection.update_one(
            {"_id": account_id},
            update_data
        )
        
        print(f"💸 출금 프로젝션 업데이트: {account_id}, 금액: ${amount}")
    
    async def _handle_money_transferred(self, event: DomainEvent) -> None:
        from_account_id = event.aggregate_id
        to_account_id = event.data["to_account_id"]
        amount = event.data["amount"]
        fee = event.data.get("transfer_fee", 0)
        new_balance = event.data["balance_after"]
        
        # 송금 계좌 업데이트
        update_from = {
            "$set": {
                "current_balance": new_balance,
                "available_balance": new_balance,
                "last_transaction_at": event.timestamp,
                "last_updated": event.timestamp
            },
            "$inc": {
                "total_transfers_out": amount + fee,
                "transaction_count_30days": 1
            }
        }
        
        await self.collection.update_one(
            {"_id": from_account_id},
            update_from
        )
        
        # 수신 계좌도 업데이트 (별도 이벤트가 있겠지만 여기서도 처리)
        # 실제로는 수신 계좌에 MoneyReceivedEvent가 따로 발생해야 함
        
        print(f"🔄 이체 프로젝션 업데이트: {from_account_id} → {to_account_id}, 금액: ${amount}")
    
    async def _invalidate_cache(self, account_id: str) -> None:
        """계좌 관련 캐시 무효화"""
        cache_keys = [
            f"account_summary:{account_id}",
            f"account_balance:{account_id}",
            f"account_transactions:{account_id}:*"
        ]
        
        for key in cache_keys:
            if "*" in key:
                # 패턴 매칭으로 여러 키 삭제
                keys_to_delete = await self.redis.keys(key)
                if keys_to_delete:
                    await self.redis.delete(*keys_to_delete)
            else:
                await self.redis.delete(key)

class TransactionHistoryProjector(EventProjector):
    """거래 내역 프로젝션 (Elasticsearch)"""
    
    def __init__(self, elasticsearch_client: AsyncElasticsearch):
        self.es = elasticsearch_client
        self.index_name = "transaction_history"
    
    def can_handle(self, event_type: str) -> bool:
        return event_type in [
            "MoneyDeposited",
            "MoneyWithdrawn", 
            "MoneyTransferred",
            "MoneyReceived"  # 이체 수신
        ]
    
    async def project_event(self, event: DomainEvent) -> None:
        transaction_doc = await self._create_transaction_document(event)
        
        # Elasticsearch에 인덱싱
        await self.es.index(
            index=self.index_name,
            id=f"{event.event_id}",
            body=transaction_doc
        )
        
        print(f"📋 거래 내역 인덱싱: {event.event_type} - {event.aggregate_id}")
    
    async def _create_transaction_document(self, event: DomainEvent) -> Dict[str, Any]:
        """이벤트를 거래 내역 문서로 변환"""
        base_doc = {
            "transaction_id": event.event_id,
            "account_id": event.aggregate_id,
            "timestamp": event.timestamp.isoformat(),
            "event_type": event.event_type,
            "version": event.version
        }
        
        if event.event_type == "MoneyDeposited":
            return {
                **base_doc,
                "type": "CREDIT",
                "amount": event.data["amount"],
                "balance_after": event.data["balance_after"],
                "description": f"Deposit - {event.data.get('reference', 'N/A')}",
                "reference": event.data.get("reference"),
                "counterparty": None,
                "fee": 0.0
            }
        
        elif event.event_type == "MoneyWithdrawn":
            return {
                **base_doc,
                "type": "DEBIT",
                "amount": event.data["amount"],
                "balance_after": event.data["balance_after"],
                "description": f"Withdrawal - {event.data.get('reference', 'N/A')}",
                "reference": event.data.get("reference"),
                "counterparty": None,
                "fee": event.data.get("fee", 0.0)
            }
        
        elif event.event_type == "MoneyTransferred":
            return {
                **base_doc,
                "type": "TRANSFER_OUT",
                "amount": event.data["amount"],
                "balance_after": event.data["balance_after"],
                "description": f"Transfer to {event.data['to_account_id']}",
                "reference": event.data.get("reference"),
                "counterparty": event.data["to_account_id"],
                "fee": event.data.get("transfer_fee", 0.0)
            }
        
        elif event.event_type == "MoneyReceived":
            return {
                **base_doc,
                "type": "TRANSFER_IN",
                "amount": event.data["amount"],
                "balance_after": event.data["balance_after"],
                "description": f"Transfer from {event.data['from_account_id']}",
                "reference": event.data.get("reference"),
                "counterparty": event.data["from_account_id"],
                "fee": 0.0
            }

class AnalyticsProjector(EventProjector):
    """실시간 분석용 프로젝션 (ClickHouse)"""
    
    def __init__(self, clickhouse_client):
        self.ch = clickhouse_client
    
    def can_handle(self, event_type: str) -> bool:
        return True  # 모든 이벤트를 분석 목적으로 저장
    
    async def project_event(self, event: DomainEvent) -> None:
        # ClickHouse에 이벤트 저장 (분석용)
        query = """
        INSERT INTO events_analytics 
        (event_id, event_type, aggregate_id, user_id, timestamp, amount, event_data)
        VALUES
        """
        
        values = {
            "event_id": event.event_id,
            "event_type": event.event_type,
            "aggregate_id": event.aggregate_id,
            "user_id": event.data.get("user_id", ""),
            "timestamp": event.timestamp,
            "amount": self._extract_amount(event),
            "event_data": json.dumps(event.data)
        }
        
        await self.ch.execute(query, [values])
        print(f"📊 분석 데이터 저장: {event.event_type}")
    
    def _extract_amount(self, event: DomainEvent) -> float:
        """이벤트에서 금액 추출"""
        if "amount" in event.data:
            return float(event.data["amount"])
        elif "initial_deposit" in event.data:
            return float(event.data["initial_deposit"])
        return 0.0

# 프로젝션 관리자
class ProjectionManager:
    def __init__(self):
        self.projectors: List[EventProjector] = []
    
    def register_projector(self, projector: EventProjector) -> None:
        self.projectors.append(projector)
        print(f"✅ 프로젝터 등록: {projector.__class__.__name__}")
    
    async def project_event(self, event: DomainEvent) -> None:
        """이벤트를 모든 관련 프로젝터에 전달"""
        tasks = []
        
        for projector in self.projectors:
            if projector.can_handle(event.event_type):
                tasks.append(projector.project_event(event))
        
        if tasks:
            # 병렬로 모든 프로젝션 실행
            await asyncio.gather(*tasks, return_exceptions=True)
            print(f"🔄 프로젝션 완료: {event.event_type} → {len(tasks)}개 프로젝터")
    
    async def rebuild_projections(self, from_event_number: int = 0) -> None:
        """전체 프로젝션 재구성"""
        print("🔄 프로젝션 재구성 시작...")
        
        # 이벤트 스토어에서 모든 이벤트 읽기
        events = await self._read_all_events(from_event_number)
        
        total_events = len(events)
        processed = 0
        
        for event in events:
            await self.project_event(event)
            processed += 1
            
            if processed % 1000 == 0:
                print(f"진행 상황: {processed}/{total_events} ({processed/total_events*100:.1f}%)")
        
        print(f"✅ 프로젝션 재구성 완료: {total_events}개 이벤트 처리")
    
    async def _read_all_events(self, from_event_number: int) -> List[DomainEvent]:
        # 실제로는 이벤트 스토어에서 모든 이벤트 읽기
        # 여기서는 예제를 위해 빈 리스트 반환
        return []

# 사용 예제
async def setup_projections():
    # 데이터베이스 클라이언트 초기화
    mongo_client = motor.motor_asyncio.AsyncIOMotorClient("mongodb://localhost:27017")
    redis_client = aioredis.from_url("redis://localhost:6379")
    es_client = AsyncElasticsearch([{"host": "localhost", "port": 9200}])
    
    # 프로젝션 관리자 초기화
    projection_manager = ProjectionManager()
    
    # 프로젝터들 등록
    projection_manager.register_projector(
        AccountSummaryProjector(mongo_client, redis_client)
    )
    projection_manager.register_projector(
        TransactionHistoryProjector(es_client)
    )
    projection_manager.register_projector(
        AnalyticsProjector(clickhouse_client)
    )
    
    return projection_manager

# 실시간 이벤트 처리
async def handle_real_time_events(projection_manager: ProjectionManager):
    # Kafka 또는 다른 이벤트 스트림에서 이벤트 수신
    while True:
        try:
            # 이벤트 수신 (실제로는 Kafka Consumer 등 사용)
            event = await receive_event_from_stream()
            
            if event:
                await projection_manager.project_event(event)
        
        except Exception as e:
            print(f"❌ 이벤트 처리 오류: {e}")
            # 에러 핸들링, 재시도 로직 등
            await asyncio.sleep(1)
```

## 핵심 요점

### 1. 프로젝션의 명확한 책임 분리

- **AccountSummaryProjector**: MongoDB에 계좌 요약 정보 최신화
- **TransactionHistoryProjector**: Elasticsearch에 검색 가능한 거래 내역 저장
- **AnalyticsProjector**: ClickHouse에 모든 이벤트를 분석용데이터로 저장

### 2. 다중 데이터베이스 활용

- **MongoDB**: 빠른 단순 조회용 도큐먼트 데이터베이스
- **Elasticsearch**: 복잡한 검색 및 분석용 전문 색인 엔진
- **ClickHouse**: 대용량 분석 쿼리용 컸럼널 데이터베이스
- **Redis**: 기본 캐싱과 세션 저장용 인메모리 데이터베이스

### 3. 실시간 업데이트와 내결함성

- **이벤트 기반**: 모든 데이터 변경이 이벤트에서 시작
- **병렬 처리**: 여러 프로젝터가 동시에 작동
- **장애 복구**: 이벤트 스토어로부터 프로젝션 재구성 가능

### 4. 캐시 전략과 성능 최적화

- **적극적 무효화**: 데이터 변경 시 관련 캐시 즐시 삭제
- **레이어드 캐싱**: Redis, MongoDB, 애플리케이션 레벨 캐시 조합
- **비동기 처리**: 모든 프로젝션 작업이 메인 플로우를 방해하지 않음

---

**이전**: [16.3c Event Sourcing 구현](./03c-event-sourcing-implementation.md)  
**다음**: [16.3e 성공 요인과 모범 사례](./16-53-success-factors-best-practices.md)에서 CQRS/Event Sourcing의 성공 비결과 주의사항을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 애플리케이션 개발
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-16-distributed-system-patterns)

- [15.1 마이크로서비스 아키텍처 개요](../chapter-15-microservices-architecture/16-01-microservices-architecture.md)
- [15.1A 모놀리스 문제점과 전환 전략](../chapter-15-microservices-architecture/16-10-monolith-to-microservices.md)
- [16.1B 마이크로서비스 설계 원칙과 패턴 개요](./16-11-design-principles.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-12-1-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-13-1-single-responsibility.md)

### 🏷️ 관련 키워드

`Projection`, `Event Sourcing`, `CQRS`, `다중 데이터베이스`, `비동기 처리`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
