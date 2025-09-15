---
tags:
  - DistributedSystems
  - Async
  - Transactions
  - Saga
  - 2PC
---

# Chapter 8-4A: 분산 트랜잭션의 딜레마와 Saga 패턴

## 🎯 이 섹션에서 배울 내용

분산 트랜잭션의 본질적인 문제점을 이해하고, Saga 패턴을 통한 실용적인 해결책을 배웁니다:

1. **Two-Phase Commit의 한계점** - 왜 2PC가 분산 환경에서 실패하는가
2. **Saga 패턴의 핵심** - 장기 실행 트랜잭션을 안전하게 처리하는 방법
3. **Orchestration vs Choreography** - 두 가지 Saga 구현 방식의 트레이드오프

## 1. Two-Phase Commit의 비극적 한계

제가 2015년에 은행 시스템을 개발할 때, 2PC(Two-Phase Commit)를 사용했습니다. 결과는? 대참사였죠.

```java
// 전통적인 2PC 구현 (문제투성이)
public class TwoPhaseCommitCoordinator {
    private List<XAResource> resources = new ArrayList<>();
    
    public void executeTransaction() throws Exception {
        // Phase 1: Prepare (투표)
        for (XAResource resource : resources) {
            try {
                resource.prepare();  // 각 참여자에게 준비 요청
            } catch (Exception e) {
                // 한 명이라도 실패하면 전체 롤백
                rollbackAll();
                throw e;
            }
        }
        
        // Phase 2: Commit (확정)
        for (XAResource resource : resources) {
            resource.commit();  // 모두 커밋
        }
    }
    
    // 문제점들:
    // 1. Coordinator가 죽으면? -> 전체 블로킹
    // 2. 네트워크 파티션? -> 무한 대기
    // 3. 성능? -> 가장 느린 노드에 맞춰짐
    // 4. 확장성? -> 참여자 증가 = 지수적 성능 저하
}

// 실제 장애 시나리오
/*
시간    Coordinator    Service A    Service B    Service C
00:00   Prepare -----> Ready
00:01   Prepare ----------------> Ready
00:02   Prepare --------------------------> Ready
00:03   Commit ------> OK
00:04   Commit -----------------> OK
00:05   💥 CRASH!
00:06                                          ??? (무한 대기)

Service C는 영원히 락 상태... 😱
*/
```

**2PC가 실패하는 이유들:**

1. **블로킹 특성**: Coordinator 장애시 참여자들이 무한 대기
2. **성능 저하**: 가장 느린 참여자에 맞춰 전체 성능 결정
3. **단일 장애점**: Coordinator가 SPOF(Single Point of Failure)
4. **네트워크 분할 민감**: 파티션 발생시 일관성 보장 불가

## 2. Saga 패턴: 긴 여정의 지혜

Saga는 1987년 논문에서 시작되었지만, 마이크로서비스 시대에 재발견되었습니다:

```typescript
// Choreography 방식 Saga
interface SagaStep<T> {
    execute(context: T): Promise<void>;
    compensate(context: T): Promise<void>;
}

// 주문 처리 Saga
class OrderSaga {
    private steps: SagaStep<OrderContext>[] = [
        new ReserveInventoryStep(),
        new ChargePaymentStep(),
        new CreateShipmentStep(),
        new SendNotificationStep()
    ];
    
    async execute(order: Order): Promise<void> {
        const context = new OrderContext(order);
        const executedSteps: SagaStep<OrderContext>[] = [];
        
        try {
            for (const step of this.steps) {
                await step.execute(context);
                executedSteps.push(step);
                
                // 각 단계마다 이벤트 발행
                await this.publishEvent({
                    type: `${step.constructor.name}.Completed`,
                    orderId: order.id,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            // 보상 트랜잭션 실행 (역순)
            console.error(`Saga failed at step ${executedSteps.length}`);
            
            for (const step of executedSteps.reverse()) {
                try {
                    await step.compensate(context);
                    
                    await this.publishEvent({
                        type: `${step.constructor.name}.Compensated`,
                        orderId: order.id,
                        timestamp: Date.now()
                    });
                } catch (compensationError) {
                    // 보상도 실패! 수동 개입 필요
                    await this.alertOps({
                        severity: 'CRITICAL',
                        message: 'Saga compensation failed',
                        context,
                        error: compensationError
                    });
                }
            }
            
            throw error;
        }
    }
}

// 구체적인 Step 구현
class ChargePaymentStep implements SagaStep<OrderContext> {
    async execute(context: OrderContext): Promise<void> {
        const payment = await paymentService.charge({
            customerId: context.customerId,
            amount: context.totalAmount,
            idempotencyKey: `order-${context.orderId}-payment`
        });
        
        context.paymentId = payment.id;
        
        // 상태 저장 (재시작 가능하도록)
        await stateStore.save(context);
    }
    
    async compensate(context: OrderContext): Promise<void> {
        if (context.paymentId) {
            await paymentService.refund({
                paymentId: context.paymentId,
                reason: 'Order cancelled',
                idempotencyKey: `order-${context.orderId}-refund`
            });
        }
    }
}
```

**Saga의 핵심 원칙:**

1. **분할 가능성**: 복잡한 비즈니스 트랜잭션을 단계별로 분할
2. **보상 가능성**: 각 단계마다 보상(compensation) 로직 제공
3. **순서 보장**: 실행은 순서대로, 보상은 역순으로
4. **멱등성**: 같은 작업을 여러 번 실행해도 안전

## 3. Orchestration vs Choreography: 지휘자 vs 춤

### 3.1 Orchestration 방식: 중앙 지휘자

```python
# Orchestration 방식: 중앙 지휘자
class OrderOrchestrator:
    def __init__(self):
        self.state_machine = OrderStateMachine()
        
    async def process_order(self, order_id: str):
        state = await self.load_state(order_id)
        
        while not state.is_terminal():
            next_action = self.state_machine.get_next_action(state)
            
            try:
                result = await self.execute_action(next_action, state)
                state = self.state_machine.transition(state, result)
            except Exception as e:
                state = self.state_machine.handle_error(state, e)
            
            await self.save_state(order_id, state)
            
    async def execute_action(self, action: Action, state: State):
        if action.type == 'RESERVE_INVENTORY':
            return await inventory_service.reserve(
                items=state.order.items,
                correlation_id=state.correlation_id
            )
        elif action.type == 'CHARGE_PAYMENT':
            return await payment_service.charge(
                amount=state.order.total,
                customer_id=state.order.customer_id
            )
        # ... 더 많은 액션들
```

**Orchestration의 장점:**

- 중앙화된 로직으로 이해하기 쉬움
- 통합 테스트가 간단함
- 전체 플로우 추적 용이

**Orchestration의 단점:**

- 오케스트레이터가 SPOF
- 모든 서비스를 알아야 하는 높은 결합도
- 확장성 제한

### 3.2 Choreography 방식: 이벤트 기반 협업

```python
# Choreography 방식: 이벤트 기반 협업
class InventoryService:
    @event_handler('OrderCreated')
    async def handle_order_created(self, event: OrderCreatedEvent):
        try:
            reservation = await self.reserve_items(event.items)
            
            await self.publish_event(InventoryReservedEvent(
                order_id=event.order_id,
                reservation_id=reservation.id,
                items=event.items
            ))
        except InsufficientInventoryError as e:
            await self.publish_event(InventoryReservationFailedEvent(
                order_id=event.order_id,
                reason=str(e)
            ))

class PaymentService:
    @event_handler('InventoryReserved')
    async def handle_inventory_reserved(self, event: InventoryReservedEvent):
        try:
            payment = await self.process_payment(
                order_id=event.order_id,
                amount=self.calculate_amount(event.items)
            )
            
            await self.publish_event(PaymentProcessedEvent(
                order_id=event.order_id,
                payment_id=payment.id
            ))
        except PaymentFailedError as e:
            await self.publish_event(PaymentFailedEvent(
                order_id=event.order_id,
                reason=str(e)
            ))
            
            # 보상 이벤트 발행
            await self.publish_event(CancelInventoryReservationEvent(
                reservation_id=event.reservation_id
            ))
```

**Choreography의 장점:**

- 느슨한 결합
- 확장성 우수
- 분산된 장애 지점

**Choreography의 단점:**

- 전체 플로우 추적 어려움
- 복잡한 비즈니스 로직 구현 어려움
- 디버깅과 테스트 복잡

## 4. 실전 선택 가이드

| 측면 | Orchestration | Choreography |
|------|---------------|-------------|
| **복잡도 관리** | 중앙화되어 이해하기 쉬움 | 분산되어 추적 어려움 |
| **결합도** | 오케스트레이터가 모든 서비스 알아야 함 | 느슨한 결합 |
| **테스트** | 통합 테스트 쉬움 | 각 서비스 독립 테스트 |
| **성능** | 추가 홉 필요 | 직접 통신 |
| **장애 지점** | 오케스트레이터가 SPOF | 분산되어 있음 |
| **적합한 경우** | 복잡한 비즈니스 로직 | 단순한 이벤트 체인 |

## 핵심 요점

### 1. 2PC는 분산 환경에 부적합

- 블로킹 특성과 성능 문제로 실용성 낮음
- 현대 마이크로서비스에서는 거의 사용하지 않음

### 2. Saga 패턴이 현실적 대안

- Eventual consistency를 받아들이는 실용적 접근
- 각 단계별 보상 로직으로 일관성 보장

### 3. 구현 방식은 상황에 따라 선택

- 복잡한 비즈니스 로직: Orchestration
- 단순한 이벤트 체인: Choreography

---

**다음**: [04b-event-sourcing-cqrs.md](04b-event-sourcing-cqrs.md)에서 Event Sourcing과 CQRS 패턴을 학습합니다.
