---
tags:
  - Choreography
  - Distributed Transactions
  - Event-Driven Architecture
  - Python Asyncio
  - Saga Pattern
  - advanced
  - deep-study
  - hands-on
  - 애플리케이션개발
difficulty: ADVANCED
learning_time: "10-15시간"
main_topic: "애플리케이션 개발"
priority_score: 5
---

# 16.4c Saga 패턴 - 코레오그래피 구현

## 🎭 Choreography 기반 Saga 구현

이벤트 기반 분산 트랜잭션 처리를 통한 탈중앙화된 Saga 패턴 구현을 다룹니다.

### 이벤트 기반 분산 트랜잭션

```python
# Python으로 구현한 코레오그래피 Saga
import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
import uuid
from abc import ABC, abstractmethod

@dataclass
class SagaEvent:
    event_id: str
    event_type: str
    saga_id: str
    correlation_id: str
    timestamp: datetime
    data: Dict[str, Any]
    retry_count: int = 0
    max_retries: int = 3

class SagaEventHandler(ABC):
    @abstractmethod
    async def handle_event(self, event: SagaEvent) -> None:
        pass
    
    @abstractmethod
    def can_handle(self, event_type: str) -> bool:
        pass

class InventoryService(SagaEventHandler):
    def __init__(self, event_publisher, inventory_repository):
        self.event_publisher = event_publisher
        self.inventory_repo = inventory_repository
        
    def can_handle(self, event_type: str) -> bool:
        return event_type in [
            "OrderCreated",
            "PaymentFailed", 
            "PointDeductionFailed",
            "ShipmentFailed"
        ]
    
    async def handle_event(self, event: SagaEvent) -> None:
        if event.event_type == "OrderCreated":
            await self._reserve_inventory(event)
        elif event.event_type in ["PaymentFailed", "PointDeductionFailed", "ShipmentFailed"]:
            await self._release_inventory(event)
    
    async def _reserve_inventory(self, event: SagaEvent) -> None:
        """재고 예약 처리"""
        try:
            order_data = event.data
            order_id = order_data["order_id"]
            items = order_data["items"]
            
            print(f"🏪 재고 예약 시작: order_id={order_id}")
            
            # 재고 확인
            for item in items:
                available = await self.inventory_repo.get_available_quantity(
                    item["product_id"]
                )
                if available < item["quantity"]:
                    # 재고 부족 - 실패 이벤트 발행
                    await self._publish_inventory_failed(event, f"상품 {item['product_id']} 재고 부족")
                    return
            
            # 재고 예약
            reservation_id = str(uuid.uuid4())
            for item in items:
                await self.inventory_repo.reserve_quantity(
                    item["product_id"],
                    item["quantity"],
                    reservation_id,
                    order_id
                )
            
            # 재고 예약 성공 이벤트 발행
            success_event = SagaEvent(
                event_id=str(uuid.uuid4()),
                event_type="InventoryReserved",
                saga_id=event.saga_id,
                correlation_id=event.correlation_id,
                timestamp=datetime.utcnow(),
                data={
                    "order_id": order_id,
                    "reservation_id": reservation_id,
                    "items": items
                }
            )
            
            await self.event_publisher.publish(success_event)
            print(f"✅ 재고 예약 완료: order_id={order_id}, reservation_id={reservation_id}")
            
        except Exception as e:
            print(f"❌ 재고 예약 실패: {str(e)}")
            await self._publish_inventory_failed(event, str(e))
    
    async def _release_inventory(self, event: SagaEvent) -> None:
        """재고 해제 (보상 트랜잭션)"""
        try:
            order_id = event.data["order_id"]
            
            print(f"🔄 재고 해제 시작: order_id={order_id}")
            
            # 해당 주문의 재고 예약을 찾아서 해제
            reservations = await self.inventory_repo.find_reservations_by_order(order_id)
            
            for reservation in reservations:
                await self.inventory_repo.release_reservation(reservation.id)
            
            # 재고 해제 완료 이벤트 발행
            release_event = SagaEvent(
                event_id=str(uuid.uuid4()),
                event_type="InventoryReleased",
                saga_id=event.saga_id,
                correlation_id=event.correlation_id,
                timestamp=datetime.utcnow(),
                data={
                    "order_id": order_id,
                    "released_reservations": [r.id for r in reservations]
                }
            )
            
            await self.event_publisher.publish(release_event)
            print(f"✅ 재고 해제 완료: order_id={order_id}")
            
        except Exception as e:
            print(f"❌ 재고 해제 실패: {str(e)}")
            # 보상 실패는 수동 개입 알림
            await self._alert_manual_intervention("inventory_release_failed", event, str(e))
    
    async def _publish_inventory_failed(self, original_event: SagaEvent, error_message: str):
        """재고 처리 실패 이벤트 발행"""
        failed_event = SagaEvent(
            event_id=str(uuid.uuid4()),
            event_type="InventoryFailed",
            saga_id=original_event.saga_id,
            correlation_id=original_event.correlation_id,
            timestamp=datetime.utcnow(),
            data={
                "order_id": original_event.data["order_id"],
                "error": error_message
            }
        )
        
        await self.event_publisher.publish(failed_event)

class PaymentService(SagaEventHandler):
    def __init__(self, event_publisher, payment_gateway):
        self.event_publisher = event_publisher
        self.payment_gateway = payment_gateway
    
    def can_handle(self, event_type: str) -> bool:
        return event_type in [
            "InventoryReserved",
            "InventoryFailed",
            "PointDeductionFailed",
            "ShipmentFailed"
        ]
    
    async def handle_event(self, event: SagaEvent) -> None:
        if event.event_type == "InventoryReserved":
            await self._process_payment(event)
        elif event.event_type in ["InventoryFailed", "PointDeductionFailed", "ShipmentFailed"]:
            await self._refund_payment(event)
    
    async def _process_payment(self, event: SagaEvent) -> None:
        """결제 처리"""
        try:
            order_data = event.data
            order_id = order_data["order_id"]
            
            # 원본 주문 정보 조회 (이벤트 체인에서)
            original_order = await self._get_original_order_data(event.saga_id)
            
            print(f"💳 결제 처리 시작: order_id={order_id}")
            
            # 결제 게이트웨이 호출
            payment_result = await self.payment_gateway.process_payment(
                customer_id=original_order["customer_id"],
                amount=original_order["total_amount"],
                payment_method=original_order["payment_method"],
                order_id=order_id
            )
            
            if payment_result.success:
                # 결제 성공 이벤트 발행
                success_event = SagaEvent(
                    event_id=str(uuid.uuid4()),
                    event_type="PaymentProcessed",
                    saga_id=event.saga_id,
                    correlation_id=event.correlation_id,
                    timestamp=datetime.utcnow(),
                    data={
                        "order_id": order_id,
                        "transaction_id": payment_result.transaction_id,
                        "amount": original_order["total_amount"],
                        "customer_id": original_order["customer_id"]
                    }
                )
                
                await self.event_publisher.publish(success_event)
                print(f"✅ 결제 완료: order_id={order_id}, transaction_id={payment_result.transaction_id}")
            else:
                await self._publish_payment_failed(event, payment_result.error_message)
                
        except Exception as e:
            print(f"❌ 결제 처리 실패: {str(e)}")
            await self._publish_payment_failed(event, str(e))
    
    async def _refund_payment(self, event: SagaEvent) -> None:
        """결제 환불 (보상 트랜잭션)"""
        try:
            order_id = event.data["order_id"]
            
            # 해당 주문의 결제 트랜잭션 조회
            payment_transaction = await self._find_payment_transaction(event.saga_id)
            
            if not payment_transaction:
                print(f"ℹ️ 환불할 결제 트랜잭션 없음: order_id={order_id}")
                return
            
            print(f"💰 결제 환불 시작: order_id={order_id}, transaction_id={payment_transaction.id}")
            
            # 결제 게이트웨이 환불 호출
            refund_result = await self.payment_gateway.refund_payment(
                transaction_id=payment_transaction.id,
                amount=payment_transaction.amount,
                reason="주문 취소"
            )
            
            if refund_result.success:
                # 환불 완료 이벤트 발행
                refund_event = SagaEvent(
                    event_id=str(uuid.uuid4()),
                    event_type="PaymentRefunded",
                    saga_id=event.saga_id,
                    correlation_id=event.correlation_id,
                    timestamp=datetime.utcnow(),
                    data={
                        "order_id": order_id,
                        "original_transaction_id": payment_transaction.id,
                        "refund_transaction_id": refund_result.refund_transaction_id,
                        "refund_amount": payment_transaction.amount
                    }
                )
                
                await self.event_publisher.publish(refund_event)
                print(f"✅ 결제 환불 완료: order_id={order_id}")
            else:
                print(f"❌ 결제 환불 실패: {refund_result.error_message}")
                await self._alert_manual_intervention("payment_refund_failed", event, refund_result.error_message)
                
        except Exception as e:
            print(f"❌ 결제 환불 오류: {str(e)}")
            await self._alert_manual_intervention("payment_refund_error", event, str(e))

class PointService(SagaEventHandler):
    def __init__(self, event_publisher, point_repository):
        self.event_publisher = event_publisher
        self.point_repo = point_repository
    
    def can_handle(self, event_type: str) -> bool:
        return event_type in [
            "PaymentProcessed",
            "PaymentFailed",
            "ShipmentFailed"
        ]
    
    async def handle_event(self, event: SagaEvent) -> None:
        if event.event_type == "PaymentProcessed":
            await self._deduct_points(event)
        elif event.event_type in ["PaymentFailed", "ShipmentFailed"]:
            await self._restore_points(event)
    
    async def _deduct_points(self, event: SagaEvent) -> None:
        """포인트 차감"""
        try:
            order_data = event.data
            order_id = order_data["order_id"]
            customer_id = order_data["customer_id"]
            
            # 원본 주문에서 포인트 사용량 조회
            original_order = await self._get_original_order_data(event.saga_id)
            points_to_deduct = original_order.get("points_to_use", 0)
            
            if points_to_deduct <= 0:
                # 포인트 사용이 없으면 바로 성공 이벤트 발행
                success_event = SagaEvent(
                    event_id=str(uuid.uuid4()),
                    event_type="PointDeductionSkipped",
                    saga_id=event.saga_id,
                    correlation_id=event.correlation_id,
                    timestamp=datetime.utcnow(),
                    data={
                        "order_id": order_id,
                        "customer_id": customer_id,
                        "reason": "no_points_to_deduct"
                    }
                )
                await self.event_publisher.publish(success_event)
                return
            
            print(f"🎯 포인트 차감 시작: customer_id={customer_id}, points={points_to_deduct}")
            
            # 포인트 잔액 확인
            current_points = await self.point_repo.get_customer_points(customer_id)
            if current_points < points_to_deduct:
                await self._publish_point_failed(event, "포인트 잔액 부족")
                return
            
            # 포인트 차감
            transaction_id = await self.point_repo.deduct_points(
                customer_id=customer_id,
                points=points_to_deduct,
                reason=f"주문 결제 사용: {order_id}",
                reference_id=order_id
            )
            
            # 포인트 차감 성공 이벤트 발행
            success_event = SagaEvent(
                event_id=str(uuid.uuid4()),
                event_type="PointsDeducted",
                saga_id=event.saga_id,
                correlation_id=event.correlation_id,
                timestamp=datetime.utcnow(),
                data={
                    "order_id": order_id,
                    "customer_id": customer_id,
                    "points_deducted": points_to_deduct,
                    "transaction_id": transaction_id
                }
            )
            
            await self.event_publisher.publish(success_event)
            print(f"✅ 포인트 차감 완료: customer_id={customer_id}, transaction_id={transaction_id}")
            
        except Exception as e:
            print(f"❌ 포인트 차감 실패: {str(e)}")
            await self._publish_point_failed(event, str(e))

# Saga 오케스트레이터 (코레오그래피에서는 상태 추적용)
class SagaStateTracker:
    def __init__(self, event_publisher, state_repository):
        self.event_publisher = event_publisher
        self.state_repo = state_repository
    
    async def track_saga_progress(self, event: SagaEvent) -> None:
        """Saga 진행 상태 추적"""
        saga_state = await self.state_repo.get_or_create_saga_state(event.saga_id)
        
        # 이벤트 타입에 따른 상태 업데이트
        await self._update_saga_state(saga_state, event)
        
        # 완료 조건 체크
        if await self._is_saga_completed(saga_state):
            await self._complete_saga(saga_state)
        elif await self._is_saga_failed(saga_state):
            await self._fail_saga(saga_state)
    
    async def _update_saga_state(self, saga_state, event: SagaEvent):
        """이벤트 기반 상태 업데이트"""
        event_type = event.event_type
        
        if event_type == "OrderCreated":
            saga_state.status = "STARTED"
            saga_state.steps["order"] = "completed"
        elif event_type == "InventoryReserved":
            saga_state.steps["inventory"] = "completed"
        elif event_type == "InventoryFailed":
            saga_state.steps["inventory"] = "failed"
        elif event_type == "PaymentProcessed":
            saga_state.steps["payment"] = "completed"
        elif event_type == "PaymentFailed":
            saga_state.steps["payment"] = "failed"
        elif event_type == "PointsDeducted" or event_type == "PointDeductionSkipped":
            saga_state.steps["points"] = "completed"
        elif event_type == "PointDeductionFailed":
            saga_state.steps["points"] = "failed"
        elif event_type == "ShipmentCreated":
            saga_state.steps["shipping"] = "completed"
        elif event_type == "ShipmentFailed":
            saga_state.steps["shipping"] = "failed"
        
        saga_state.last_updated = datetime.utcnow()
        await self.state_repo.save_saga_state(saga_state)
    
    async def _is_saga_completed(self, saga_state) -> bool:
        """Saga 완료 조건 체크"""
        required_steps = ["order", "inventory", "payment", "points", "shipping"]
        return all(saga_state.steps.get(step) == "completed" for step in required_steps)
    
    async def _is_saga_failed(self, saga_state) -> bool:
        """Saga 실패 조건 체크"""
        failed_steps = ["inventory", "payment", "points", "shipping"]
        return any(saga_state.steps.get(step) == "failed" for step in failed_steps)

# 이벤트 기반 Saga 실행 엔진
class ChoreographySagaEngine:
    def __init__(self):
        self.handlers: List[SagaEventHandler] = []
        self.state_tracker: Optional[SagaStateTracker] = None
    
    def register_handler(self, handler: SagaEventHandler):
        self.handlers.append(handler)
    
    def set_state_tracker(self, tracker: SagaStateTracker):
        self.state_tracker = tracker
    
    async def process_event(self, event: SagaEvent):
        """이벤트 처리"""
        print(f"📨 이벤트 수신: {event.event_type} (saga_id: {event.saga_id})")
        
        # 상태 추적
        if self.state_tracker:
            await self.state_tracker.track_saga_progress(event)
        
        # 해당 이벤트를 처리할 수 있는 핸들러들 찾기
        applicable_handlers = [
            handler for handler in self.handlers 
            if handler.can_handle(event.event_type)
        ]
        
        # 병렬로 모든 핸들러 실행
        if applicable_handlers:
            tasks = [handler.handle_event(event) for handler in applicable_handlers]
            await asyncio.gather(*tasks, return_exceptions=True)

# 사용 예제
async def main():
    # 이벤트 발행자 및 저장소 초기화
    event_publisher = EventPublisher()
    inventory_repo = InventoryRepository()
    payment_gateway = PaymentGateway()
    point_repo = PointRepository()
    state_repo = SagaStateRepository()
    
    # Saga 엔진 초기화
    saga_engine = ChoreographySagaEngine()
    
    # 서비스 핸들러들 등록
    saga_engine.register_handler(InventoryService(event_publisher, inventory_repo))
    saga_engine.register_handler(PaymentService(event_publisher, payment_gateway))
    saga_engine.register_handler(PointService(event_publisher, point_repo))
    # ... 다른 서비스들
    
    # 상태 추적기 설정
    state_tracker = SagaStateTracker(event_publisher, state_repo)
    saga_engine.set_state_tracker(state_tracker)
    
    # 주문 생성 이벤트로 Saga 시작
    order_created_event = SagaEvent(
        event_id=str(uuid.uuid4()),
        event_type="OrderCreated",
        saga_id=str(uuid.uuid4()),
        correlation_id=str(uuid.uuid4()),
        timestamp=datetime.utcnow(),
        data={
            "order_id": "ORD-123",
            "customer_id": "CUST-456",
            "items": [
                {"product_id": "PROD-789", "quantity": 2, "price": 50.0}
            ],
            "total_amount": 100.0,
            "payment_method": "credit_card",
            "points_to_use": 10
        }
    )
    
    # Saga 실행
    await saga_engine.process_event(order_created_event)
    
    print("🎭 코레오그래피 Saga 시작 완료")

if __name__ == "__main__":
    asyncio.run(main())
```

## 핵심 요점

### 1. 이벤트 기반 분산 처리

각 서비스가 독립적으로 이벤트를 구독하고 발행하여 분산 트랜잭션을 처리

### 2. 탈중앙화된 제어

중앙 오케스트레이터 없이 서비스 간 이벤트 체인으로 Saga 진행

### 3. 높은 확장성과 유연성

새로운 서비스 추가 시 이벤트 핸들러만 등록하면 되는 유연한 구조

### 4. 복원력 있는 보상 처리

각 서비스별 독립적인 보상 트랜잭션 처리로 높은 복원력 제공

---

**이전**: [Saga Orchestration 구현](./04b-saga-orchestration.md)  
**다음**: [Saga 모니터링 시스템](./16-41-saga-monitoring.md)에서 실시간 Saga 상태 추적과 대시보드를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 애플리케이션 개발
- **예상 시간**: 10-15시간

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

`Saga Pattern`, `Choreography`, `Event-Driven Architecture`, `Python Asyncio`, `Distributed Transactions`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
