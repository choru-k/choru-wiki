---
tags:
  - choreography
  - compensation
  - distributed-transactions
  - hands-on
  - intermediate
  - medium-read
  - orchestration
  - saga-pattern
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 14.3.3: Saga 패턴

## 📋 분산 환경의 ACID 트랜잭션 도전

분산 환경에서는 ACID 트랜잭션이 불가능합니다. Saga는**보상 트랜잭션(Compensation)**을 통해 일관성을 달성합니다.

## 🎭 Saga Pattern의 두 가지 방식

### 1. Orchestration-based Saga

중앙 조정자(Orchestrator)가 모든 단계를 관리:

```python
from enum import Enum
from dataclasses import dataclass
from typing import List, Dict, Any, Callable
import uuid
import time
import random

class SagaStepStatus(Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    COMPENSATED = "compensated"

@dataclass
class SagaStep:
    name: str
    action: Callable
    compensation: Callable
    status: SagaStepStatus = SagaStepStatus.PENDING
    result: Any = None
    error: str = None

class SagaOrchestrator:
    """중앙 집중식 Saga 패턴 구현"""
    
    def __init__(self):
        self.saga_instances: Dict[str, 'SagaExecution'] = {}
    
    def create_saga(self, saga_id: str, steps: List[SagaStep]) -> str:
        """새로운 Saga 생성"""
        if not saga_id:
            saga_id = str(uuid.uuid4())
        
        saga_execution = SagaExecution(saga_id, steps)
        self.saga_instances[saga_id] = saga_execution
        
        return saga_id
    
    def execute_saga(self, saga_id: str) -> Dict[str, Any]:
        """Saga 실행"""
        if saga_id not in self.saga_instances:
            raise ValueError(f"Saga {saga_id} not found")
        
        saga = self.saga_instances[saga_id]
        return saga.execute()

class SagaExecution:
    def __init__(self, saga_id: str, steps: List[SagaStep]):
        self.saga_id = saga_id
        self.steps = steps
        self.completed_steps: List[int] = []
        self.current_step = 0
    
    def execute(self) -> Dict[str, Any]:
        """Saga 단계별 실행"""
        print(f"🎭 Starting Saga {self.saga_id}")
        
        try:
            # Forward execution (정방향 실행)
            for i, step in enumerate(self.steps):
                self.current_step = i
                print(f"📋 Executing step {i+1}: {step.name}")
                
                try:
                    # 단계 실행
                    step.result = step.action()
                    step.status = SagaStepStatus.SUCCESS
                    self.completed_steps.append(i)
                    
                    print(f"✅ Step {i+1} ({step.name}): {step.result}")
                    
                except Exception as e:
                    # 단계 실패 시 보상 트랜잭션 실행
                    step.error = str(e)
                    step.status = SagaStepStatus.FAILED
                    
                    print(f"❌ Step {i+1} ({step.name}) failed: {e}")
                    print(f"🔄 Starting compensation...")
                    
                    self._compensate()
                    
                    return {
                        'saga_id': self.saga_id,
                        'status': 'FAILED', 
                        'failed_step': step.name,
                        'error': str(e)
                    }
            
            # 모든 단계 성공
            print(f"🎉 Saga {self.saga_id} completed successfully")
            return {
                'saga_id': self.saga_id,
                'status': 'SUCCESS',
                'completed_steps': len(self.completed_steps)
            }
            
        except Exception as e:
            print(f"💥 Saga {self.saga_id} failed unexpectedly: {e}")
            self._compensate()
            return {'saga_id': self.saga_id, 'status': 'FAILED', 'error': str(e)}
    
    def _compensate(self):
        """보상 트랜잭션 실행 (역순으로)"""
        print(f"🔙 Starting compensation for Saga {self.saga_id}")
        
        # 완료된 단계들을 역순으로 보상
        for step_index in reversed(self.completed_steps):
            step = self.steps[step_index]
            
            try:
                print(f"🔄 Compensating step {step_index+1}: {step.name}")
                compensation_result = step.compensation()
                step.status = SagaStepStatus.COMPENSATED
                
                print(f"✅ Compensation {step_index+1}: {compensation_result}")
                
            except Exception as e:
                print(f"💥 Compensation failed for step {step_index+1}: {e}")
                # 보상 실패는 심각한 문제 - 수동 개입 필요
                raise Exception(f"CRITICAL: Compensation failed for {step.name}: {e}")
        
        print(f"🔙 Compensation completed for Saga {self.saga_id}")

# 실제 E-commerce Order Saga 구현
class ECommerceOrderSaga:
    def __init__(self):
        self.orchestrator = SagaOrchestrator()
        
        # 외부 서비스 클라이언트들
        self.payment_service = PaymentServiceClient()
        self.inventory_service = InventoryServiceClient()
        self.shipping_service = ShippingServiceClient()
        self.loyalty_service = LoyaltyServiceClient()
    
    def create_order_saga(self, order_data: Dict[str, Any]) -> str:
        """주문 처리 Saga 생성"""
        order_id = order_data['order_id']
        
        # Saga 단계 정의
        steps = [
            # 1. 재고 예약
            SagaStep(
                name="reserve_inventory",
                action=lambda: self.inventory_service.reserve_items(
                    order_data['items']
                ),
                compensation=lambda: self.inventory_service.release_reservation(
                    order_data['items']
                )
            ),
            
            # 2. 결제 처리
            SagaStep(
                name="process_payment", 
                action=lambda: self.payment_service.charge_payment(
                    order_data['user_id'],
                    order_data['total_amount']
                ),
                compensation=lambda: self.payment_service.refund_payment(
                    order_data['user_id'],
                    order_data['total_amount']
                )
            ),
            
            # 3. 배송 준비
            SagaStep(
                name="prepare_shipping",
                action=lambda: self.shipping_service.create_shipment(
                    order_data['user_id'],
                    order_data['shipping_address']
                ),
                compensation=lambda: self.shipping_service.cancel_shipment(
                    order_data['order_id']
                )
            ),
            
            # 4. 포인트 지급
            SagaStep(
                name="award_loyalty_points",
                action=lambda: self.loyalty_service.award_points(
                    order_data['user_id'],
                    order_data['total_amount'] * 0.01  # 1% 적립
                ),
                compensation=lambda: self.loyalty_service.deduct_points(
                    order_data['user_id'],
                    order_data['total_amount'] * 0.01
                )
            )
        ]
        
        saga_id = f"order_saga_{order_id}"
        return self.orchestrator.create_saga(saga_id, steps)
    
    def process_order(self, order_data: Dict[str, Any]) -> Dict[str, Any]:
        """주문 처리 (Saga 패턴 적용)"""
        saga_id = self.create_order_saga(order_data)
        result = self.orchestrator.execute_saga(saga_id)
        
        return result

# 외부 서비스 클라이언트들 (Mock)
class PaymentServiceClient:
    def charge_payment(self, user_id: str, amount: float):
        # 실제로는 외부 결제 API 호출
        print(f"💳 Charging ${amount} to user {user_id}")
        
        # 30% 확률로 결제 실패 시뮬레이션
        if random.random() < 0.3:
            raise Exception("Payment declined by bank")
        
        return {'transaction_id': f'txn_{uuid.uuid4()}', 'status': 'charged'}
    
    def refund_payment(self, user_id: str, amount: float):
        print(f"🔙 Refunding ${amount} to user {user_id}")
        return {'status': 'refunded'}

class InventoryServiceClient:
    def reserve_items(self, items: List[Dict]):
        print(f"📦 Reserving {len(items)} items")
        
        # 10% 확률로 재고 부족
        if random.random() < 0.1:
            raise Exception("Insufficient inventory")
        
        return {'reservation_id': f'res_{uuid.uuid4()}', 'status': 'reserved'}
    
    def release_reservation(self, items: List[Dict]):
        print(f"🔙 Releasing reservation for {len(items)} items")
        return {'status': 'released'}

class ShippingServiceClient:
    def create_shipment(self, user_id: str, address: str):
        print(f"🚚 Creating shipment to {address}")
        return {'shipment_id': f'ship_{uuid.uuid4()}', 'status': 'preparing'}
    
    def cancel_shipment(self, order_id: str):
        print(f"🔙 Cancelling shipment for order {order_id}")
        return {'status': 'cancelled'}

class LoyaltyServiceClient:
    def award_points(self, user_id: str, points: float):
        print(f"⭐ Awarding {points:.0f} points to user {user_id}")
        return {'points_awarded': points}
    
    def deduct_points(self, user_id: str, points: float):
        print(f"🔙 Deducting {points:.0f} points from user {user_id}")
        return {'points_deducted': points}

# Saga Pattern 시뮬레이션
def simulate_saga_pattern():
    print("=== Saga Pattern 시뮬레이션 ===")
    
    order_saga = ECommerceOrderSaga()
    
    # 주문 데이터
    order_data = {
        'order_id': 'order_12345',
        'user_id': 'user_789',
        'items': [
            {'id': 'item_1', 'quantity': 2, 'price': 50.0},
            {'id': 'item_2', 'quantity': 1, 'price': 100.0}
        ],
        'total_amount': 200.0,
        'shipping_address': '123 Main St, City, State'
    }
    
    print(", --- 성공 케이스 ---")
    result1 = order_saga.process_order(order_data)
    print(f"Order Result: {result1}")
    
    print(", --- 실패 케이스 (보상 트랜잭션 실행) ---")
    order_data_2 = order_data.copy()
    order_data_2['order_id'] = 'order_67890'
    
    # 실패 확률을 높여서 보상 트랜잭션 시뮬레이션
    for _ in range(3):  # 여러 번 시도해서 실패 케이스 확인
        result2 = order_saga.process_order(order_data_2)
        print(f"Order Result: {result2}")
        
        if result2['status'] == 'FAILED':
            print("💡 보상 트랜잭션이 실행되어 시스템 일관성이 유지됨")
            break

# 실행
simulate_saga_pattern()
```

### 2. Choreography-based Saga

각 서비스가 이벤트를 발행하고 구독하여 자율적으로 동작:

```python
from typing import List, Dict, Any, Callable
import threading
import queue
import time

class Event:
    def __init__(self, event_type: str, data: Dict[str, Any], correlation_id: str):
        self.event_type = event_type
        self.data = data
        self.correlation_id = correlation_id
        self.timestamp = time.time()

class EventBus:
    """간단한 인메모리 이벤트 버스"""
    
    def __init__(self):
        self.subscribers: Dict[str, List[Callable]] = {}
        self.lock = threading.Lock()
    
    def subscribe(self, event_type: str, handler: Callable):
        """이벤트 구독"""
        with self.lock:
            if event_type not in self.subscribers:
                self.subscribers[event_type] = []
            self.subscribers[event_type].append(handler)
    
    def publish(self, event: Event):
        """이벤트 발행"""
        print(f"📢 Event published: {event.event_type} (correlation_id: {event.correlation_id})")
        
        with self.lock:
            handlers = self.subscribers.get(event.event_type, [])
        
        for handler in handlers:
            try:
                # 비동기로 처리 (실제로는 메시지큐 사용)
                threading.Thread(
                    target=handler, 
                    args=(event,),
                    daemon=True
                ).start()
            except Exception as e:
                print(f"❌ Event handler failed: {e}")

# 이벤트 기반 서비스들
class OrderService:
    """주문 서비스 (Saga 시작점)"""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.orders = {}  # 주문 상태 저장
        
        # 보상 이벤트 구독
        self.event_bus.subscribe('PaymentFailed', self._handle_payment_failed)
        self.event_bus.subscribe('InventoryReservationFailed', self._handle_inventory_failed)
    
    def create_order(self, order_data: Dict[str, Any]) -> str:
        """주문 생성 (Saga 시작)"""
        order_id = order_data['order_id']
        correlation_id = f"saga_{order_id}"
        
        # 주문 상태 저장
        self.orders[order_id] = {
            'status': 'created',
            'data': order_data,
            'correlation_id': correlation_id
        }
        
        print(f"🛍️ Order created: {order_id}")
        
        # OrderCreated 이벤트 발행
        self.event_bus.publish(Event(
            'OrderCreated',
            order_data,
            correlation_id
        ))
        
        return correlation_id
    
    def _handle_payment_failed(self, event: Event):
        """결제 실패 시 주문 취소"""
        order_id = event.data.get('order_id')
        print(f"💳❌ Payment failed for order {order_id} - cancelling order")
        
        if order_id in self.orders:
            self.orders[order_id]['status'] = 'cancelled'
            
            # 주문 취소 이벤트 발행
            self.event_bus.publish(Event(
                'OrderCancelled',
                {'order_id': order_id, 'reason': 'payment_failed'},
                event.correlation_id
            ))
    
    def _handle_inventory_failed(self, event: Event):
        """재고 부족 시 주문 취소"""
        order_id = event.data.get('order_id')
        print(f"📦❌ Inventory failed for order {order_id} - cancelling order")
        
        if order_id in self.orders:
            self.orders[order_id]['status'] = 'cancelled'
            
            self.event_bus.publish(Event(
                'OrderCancelled',
                {'order_id': order_id, 'reason': 'inventory_failed'},
                event.correlation_id
            ))

class InventoryService:
    """재고 서비스"""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.reservations = {}
        
        # 이벤트 구독
        self.event_bus.subscribe('OrderCreated', self._handle_order_created)
        self.event_bus.subscribe('PaymentFailed', self._handle_payment_failed)
        self.event_bus.subscribe('OrderCancelled', self._handle_order_cancelled)
    
    def _handle_order_created(self, event: Event):
        """주문 생성 시 재고 예약"""
        order_data = event.data
        order_id = order_data['order_id']
        
        try:
            print(f"📦 Reserving inventory for order {order_id}")
            
            # 재고 예약 로직 (시뮬레이션)
            if random.random() < 0.2:  # 20% 확률로 재고 부족
                raise Exception("Insufficient inventory")
            
            # 예약 성공
            self.reservations[order_id] = {
                'items': order_data['items'],
                'status': 'reserved'
            }
            
            # 재고 예약 성공 이벤트
            self.event_bus.publish(Event(
                'InventoryReserved',
                {'order_id': order_id, 'items': order_data['items']},
                event.correlation_id
            ))
            
        except Exception as e:
            print(f"📦❌ Inventory reservation failed: {e}")
            
            # 재고 예약 실패 이벤트
            self.event_bus.publish(Event(
                'InventoryReservationFailed',
                {'order_id': order_id, 'error': str(e)},
                event.correlation_id
            ))
    
    def _handle_payment_failed(self, event: Event):
        """결제 실패 시 재고 예약 취소 (보상)"""
        order_id = event.data.get('order_id')
        
        if order_id in self.reservations:
            print(f"🔙 Releasing inventory reservation for order {order_id}")
            del self.reservations[order_id]
    
    def _handle_order_cancelled(self, event: Event):
        """주문 취소 시 재고 예약 취소"""
        order_id = event.data.get('order_id')
        
        if order_id in self.reservations:
            print(f"🔙 Releasing inventory for cancelled order {order_id}")
            del self.reservations[order_id]

class PaymentService:
    """결제 서비스"""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.payments = {}
        
        # 이벤트 구독
        self.event_bus.subscribe('InventoryReserved', self._handle_inventory_reserved)
        self.event_bus.subscribe('OrderCancelled', self._handle_order_cancelled)
    
    def _handle_inventory_reserved(self, event: Event):
        """재고 예약 성공 시 결제 처리"""
        order_id = event.data['order_id']
        
        try:
            print(f"💳 Processing payment for order {order_id}")
            
            # 결제 처리 로직 (시뮬레이션)
            if random.random() < 0.3:  # 30% 확률로 결제 실패
                raise Exception("Payment declined")
            
            # 결제 성공
            self.payments[order_id] = {
                'status': 'charged',
                'amount': 200.0  # 임시 금액
            }
            
            # 결제 성공 이벤트
            self.event_bus.publish(Event(
                'PaymentSucceeded',
                {'order_id': order_id, 'amount': 200.0},
                event.correlation_id
            ))
            
        except Exception as e:
            print(f"💳❌ Payment failed: {e}")
            
            # 결제 실패 이벤트
            self.event_bus.publish(Event(
                'PaymentFailed', 
                {'order_id': order_id, 'error': str(e)},
                event.correlation_id
            ))
    
    def _handle_order_cancelled(self, event: Event):
        """주문 취소 시 결제 환불 (보상)"""
        order_id = event.data.get('order_id')
        
        if order_id in self.payments:
            print(f"🔙 Refunding payment for cancelled order {order_id}")
            self.payments[order_id]['status'] = 'refunded'

class ShippingService:
    """배송 서비스"""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.shipments = {}
        
        # 이벤트 구독
        self.event_bus.subscribe('PaymentSucceeded', self._handle_payment_succeeded)
        self.event_bus.subscribe('OrderCancelled', self._handle_order_cancelled)
    
    def _handle_payment_succeeded(self, event: Event):
        """결제 성공 시 배송 준비"""
        order_id = event.data['order_id']
        
        print(f"🚚 Preparing shipment for order {order_id}")
        
        self.shipments[order_id] = {
            'status': 'preparing',
            'tracking_number': f'TRACK_{order_id}'
        }
        
        # 배송 준비 완료 이벤트 (Saga 성공 종료)
        self.event_bus.publish(Event(
            'ShipmentPrepared',
            {'order_id': order_id, 'tracking_number': f'TRACK_{order_id}'},
            event.correlation_id
        ))
    
    def _handle_order_cancelled(self, event: Event):
        """주문 취소 시 배송 취소"""
        order_id = event.data.get('order_id')
        
        if order_id in self.shipments:
            print(f"🔙 Cancelling shipment for order {order_id}")
            self.shipments[order_id]['status'] = 'cancelled'

# Choreography Saga 시뮬레이션
def simulate_choreography_saga():
    print("=== Choreography-based Saga 시뮬레이션 ===")
    
    # 이벤트 버스 생성
    event_bus = EventBus()
    
    # 서비스들 생성 (이벤트 구독 자동 설정)
    order_service = OrderService(event_bus)
    inventory_service = InventoryService(event_bus)
    payment_service = PaymentService(event_bus)
    shipping_service = ShippingService(event_bus)
    
    # 주문 데이터
    order_data = {
        'order_id': 'choreography_order_123',
        'user_id': 'user_456',
        'items': [{'id': 'item_1', 'quantity': 1}],
        'total_amount': 200.0
    }
    
    print(", --- 주문 처리 시작 (이벤트 체인 시작) ---")
    correlation_id = order_service.create_order(order_data)
    
    # 이벤트 처리 시간 대기
    print(", --- 이벤트 처리 대기 중... ---")
    time.sleep(2)
    
    print(f", --- Saga 결과 확인 ---")
    print(f"Order status: {order_service.orders.get(order_data['order_id'], {}).get('status', 'unknown')}")
    print(f"Inventory reservations: {len(inventory_service.reservations)}")
    print(f"Payments: {len(payment_service.payments)}")
    print(f"Shipments: {len(shipping_service.shipments)}")

# 실행
simulate_choreography_saga()
```

## 핵심 요점

### 1. 보상 트랜잭션 설계

각 단계마다 실행 취소를 위한 보상 로직을 반드시 구현해야 합니다.

### 2. 최종 일관성 (Eventual Consistency)

Saga는 즉시 일관성이 아닌 최종 일관성을 보장합니다.

### 3. 비즈니스 로직 중심 설계

기술적 트랜잭션이 아닌 비즈니스 의미의 트랜잭션을 중심으로 설계합니다.

---

**이전**: [Bulkhead Pattern](14-03-02-bulkhead-pattern.md)  
**다음**: [CQRS Pattern](14-03-04-cqrs-pattern.md)에서 읽기/쓰기 모델 분리를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 애플리케이션 개발
-**예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-14-distributed-systems)

- [14.1 분산 시스템 기초 이론 - CAP 정리와 일관성의 과학](./14-01-01-distributed-fundamentals.md)
- [14.2 합의 알고리즘 - 분산된 노드들이 하나가 되는 방법](./14-02-01-consensus-algorithms.md)
- [14.3 분산 데이터 관리 개요](./14-02-02-distributed-data.md)
- [14.3A Sharding 전략과 구현](./14-02-03-sharding-strategies.md)
- [14.3B Replication 패턴과 구현](./14-05-01-replication-patterns.md)

### 🏷️ 관련 키워드

`saga-pattern`, `distributed-transactions`, `compensation`, `orchestration`, `choreography`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
