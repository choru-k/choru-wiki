---
tags:
  - advanced
  - cqrs
  - deep-study
  - event_sourcing
  - event_store
  - eventual_consistency
  - hands-on
  - projection
  - 분산시스템
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "분산 시스템"
priority_score: 5
---

# Chapter 8-4B: Event Sourcing과 CQRS 패턴

## 🎯 이 섹션에서 배울 내용

Event Sourcing과 CQRS의 핵심 개념과 실제 구현 방법을 마스터합니다:

1. **Event Sourcing 기초** - 모든 상태 변경을 이벤트로 기록하는 패턴
2. **CQRS 구현** - 읽기와 쓰기 모델을 분리하는 아키텍처
3. **Eventual Consistency** - 분산 환경에서의 일관성 관리

## 1. Event Sourcing: 모든 것을 기록하라

Event Sourcing은 애플리케이션의 상태를 저장하는 대신, 상태를 변경하는 모든 이벤트를 순서대로 저장하는 패턴입니다.

```kotlin
// 이벤트 정의
sealed class AccountEvent {
    abstract val accountId: String
    abstract val timestamp: Instant
    abstract val version: Long
}

data class AccountCreated(
    override val accountId: String,
    override val timestamp: Instant,
    override val version: Long,
    val initialBalance: BigDecimal,
    val currency: String
) : AccountEvent()

data class MoneyDeposited(
    override val accountId: String,
    override val timestamp: Instant,
    override val version: Long,
    val amount: BigDecimal,
    val source: String
) : AccountEvent()

data class MoneyWithdrawn(
    override val accountId: String,
    override val timestamp: Instant,
    override val version: Long,
    val amount: BigDecimal,
    val reason: String
) : AccountEvent()

// Aggregate Root
class Account {
    var id: String = ""
    var balance: BigDecimal = BigDecimal.ZERO
    var version: Long = 0
    private val pendingEvents = mutableListOf<AccountEvent>()
    
    // 이벤트에서 상태 재구성
    fun replay(events: List<AccountEvent>) {
        events.forEach { apply(it) }
    }
    
    private fun apply(event: AccountEvent) {
        when (event) {
            is AccountCreated -> {
                id = event.accountId
                balance = event.initialBalance
            }
            is MoneyDeposited -> {
                balance = balance.add(event.amount)
            }
            is MoneyWithdrawn -> {
                balance = balance.subtract(event.amount)
            }
        }
        version = event.version
    }
    
    // 명령 처리
    fun deposit(amount: BigDecimal, source: String): List<AccountEvent> {
        if (amount <= BigDecimal.ZERO) {
            throw IllegalArgumentException("Amount must be positive")
        }
        
        val event = MoneyDeposited(
            accountId = id,
            timestamp = Instant.now(),
            version = version + 1,
            amount = amount,
            source = source
        )
        
        apply(event)
        pendingEvents.add(event)
        return listOf(event)
    }
    
    fun withdraw(amount: BigDecimal, reason: String): List<AccountEvent> {
        if (amount > balance) {
            throw InsufficientFundsException()
        }
        
        val event = MoneyWithdrawn(
            accountId = id,
            timestamp = Instant.now(),
            version = version + 1,
            amount = amount,
            reason = reason
        )
        
        apply(event)
        pendingEvents.add(event)
        return listOf(event)
    }
}
```

### 1.1 Event Store 구현

```kotlin
// Event Store
class EventStore {
    private val events = mutableMapOf<String, MutableList<AccountEvent>>()
    
    suspend fun append(
        streamId: String, 
        events: List<AccountEvent>, 
        expectedVersion: Long
    ) {
        val stream = this.events.getOrPut(streamId) { mutableListOf() }
        
        // Optimistic concurrency control
        if (stream.isNotEmpty() && stream.last().version != expectedVersion) {
            throw ConcurrencyException(
                "Expected version $expectedVersion but was ${stream.last().version}"
            )
        }
        
        stream.addAll(events)
        
        // 이벤트 발행
        events.forEach { event ->
            eventBus.publish(event)
        }
    }
    
    suspend fun load(streamId: String, fromVersion: Long = 0): List<AccountEvent> {
        return events[streamId]
            ?.filter { it.version >= fromVersion }
            ?: emptyList()
    }
    
    // 스냅샷 지원
    suspend fun loadWithSnapshot(streamId: String): Pair<Account?, List<AccountEvent>> {
        val snapshot = snapshotStore.getLatest(streamId)
        val events = if (snapshot != null) {
            load(streamId, snapshot.version + 1)
        } else {
            load(streamId)
        }
        
        return snapshot to events
    }
}
```

**Event Sourcing의 장점:**

1. **완벽한 감사 추적**: 모든 변경사항이 기록됨
2. **시간 여행**: 과거 시점의 상태 재구성 가능
3. **디버깅 용이**: 문제 상황 완전 재현 가능
4. **새로운 요구사항**: 과거 이벤트로부터 새로운 뷰 생성

**Event Sourcing의 단점:**

1. **쿼리 복잡성**: 현재 상태 조회를 위한 이벤트 재생 필요
2. **스토리지 증가**: 모든 이벤트 보관으로 저장 공간 증가
3. **스키마 진화**: 이벤트 구조 변경시 호환성 고려

## 2. CQRS: 읽기와 쓰기의 분리

CQRS(Command Query Responsibility Segregation)는 읽기와 쓰기 모델을 완전히 분리하는 패턴입니다.

### 2.1 Command Side (쓰기 모델)

```typescript
// Command Side (쓰기 모델)
class OrderCommandHandler {
    constructor(
        private eventStore: EventStore,
        private repository: OrderRepository
    ) {}
    
    async handle(command: CreateOrderCommand): Promise<void> {
        // 비즈니스 로직 검증
        const customer = await this.repository.getCustomer(command.customerId);
        if (!customer.isActive) {
            throw new CustomerInactiveError();
        }
        
        // Aggregate 생성
        const order = Order.create(command);
        
        // 이벤트 저장
        await this.eventStore.append(
            order.id,
            order.getUncommittedEvents()
        );
    }
}

// Domain Model (쓰기용)
class Order {
    private id: string;
    private customerId: string;
    private items: OrderItem[];
    private status: OrderStatus;
    private version: number = 0;
    private uncommittedEvents: DomainEvent[] = [];
    
    static create(command: CreateOrderCommand): Order {
        const order = new Order();
        
        // 비즈니스 규칙 검증
        if (command.items.length === 0) {
            throw new EmptyOrderError();
        }
        
        const event = new OrderCreatedEvent(
            command.orderId,
            command.customerId,
            command.items,
            new Date()
        );
        
        order.apply(event);
        order.uncommittedEvents.push(event);
        
        return order;
    }
    
    private apply(event: DomainEvent): void {
        switch (event.constructor) {
            case OrderCreatedEvent:
                const created = event as OrderCreatedEvent;
                this.id = created.orderId;
                this.customerId = created.customerId;
                this.items = created.items;
                this.status = OrderStatus.CREATED;
                break;
            // ... 다른 이벤트들
        }
        this.version++;
    }
    
    getUncommittedEvents(): DomainEvent[] {
        return [...this.uncommittedEvents];
    }
}
```

### 2.2 Query Side (읽기 모델)

```typescript
// Query Side (읽기 모델)
class OrderProjection {
    @EventHandler(OrderCreatedEvent)
    async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
        // 읽기 최적화된 뷰 생성
        await this.db.orders.insert({
            id: event.orderId,
            customerId: event.customerId,
            status: 'CREATED',
            totalAmount: event.items.reduce((sum, item) => 
                sum + item.price * item.quantity, 0
            ),
            createdAt: event.timestamp
        });
        
        // 검색용 Elasticsearch 인덱싱
        await this.elasticsearch.index({
            index: 'orders',
            id: event.orderId,
            body: {
                customerId: event.customerId,
                items: event.items.map(i => i.name),
                timestamp: event.timestamp
            }
        });
        
        // 실시간 대시보드용 Redis 업데이트
        await this.redis.hincrby('stats:orders', 'total', 1);
        await this.redis.zadd(
            'recent_orders',
            Date.now(),
            event.orderId
        );
    }
    
    @EventHandler(OrderShippedEvent)
    async handleOrderShipped(event: OrderShippedEvent): Promise<void> {
        // 여러 읽기 모델 동시 업데이트
        await Promise.all([
            // RDBMS 업데이트
            this.db.orders.update(
                { id: event.orderId },
                { status: 'SHIPPED', shippedAt: event.timestamp }
            ),
            
            // Graph DB 업데이트 (배송 경로)
            this.neo4j.run(`
                MATCH (o:Order {id: $orderId})
                CREATE (s:Shipment {
                    trackingNumber: $trackingNumber,
                    carrier: $carrier
                })
                CREATE (o)-[:SHIPPED_BY]->(s)
            `, event),
            
            // Time-series DB 업데이트 (메트릭)
            this.influxdb.writePoint({
                measurement: 'order_lifecycle',
                tags: { status: 'shipped' },
                fields: { duration: event.processingTime },
                timestamp: event.timestamp
            })
        ]);
    }
}

// 읽기 쿼리 핸들러
class OrderQueryHandler {
    async getOrderDetails(orderId: string): Promise<OrderView> {
        // 읽기 최적화된 뷰에서 직접 조회
        const order = await this.db.orders.findOne({ id: orderId });
        
        // 필요시 여러 소스 조합
        const [shipment, customer, items] = await Promise.all([
            this.db.shipments.findOne({ orderId }),
            this.db.customers.findOne({ id: order.customerId }),
            this.db.orderItems.find({ orderId })
        ]);
        
        return {
            ...order,
            shipment,
            customer,
            items
        };
    }
    
    async searchOrders(criteria: SearchCriteria): Promise<OrderView[]> {
        // Elasticsearch에서 복잡한 검색
        const results = await this.elasticsearch.search({
            index: 'orders',
            body: {
                query: {
                    bool: {
                        must: criteria.toElasticQuery()
                    }
                },
                aggregations: {
                    by_status: {
                        terms: { field: 'status' }
                    }
                }
            }
        });
        
        return results.hits.hits.map(hit => hit._source);
    }
}
```

**CQRS의 장점:**

1. **독립적 최적화**: 읽기와 쓰기를 각각 최적화
2. **확장성**: 읽기와 쓰기 워크로드 독립 스케일링
3. **복잡성 분리**: 복잡한 쿼리와 비즈니스 로직 분리
4. **다중 뷰**: 하나의 데이터로부터 여러 읽기 모델 생성

## 3. Eventual Consistency 처리

분산 환경에서는 모든 읽기 모델이 즉시 업데이트되지 않을 수 있습니다. 이를 관리하는 방법:

```javascript
// Consistency Boundary 관리
class ConsistencyManager {
    constructor() {
        this.pendingUpdates = new Map();
        this.retryPolicy = new ExponentialBackoff();
    }
    
    async ensureConsistency(aggregateId, updateFunc) {
        const key = `${aggregateId}:${Date.now()}`;
        
        try {
            // 1. Command side 업데이트
            const events = await updateFunc();
            
            // 2. 이벤트 발행
            await this.publishEvents(events);
            
            // 3. Read model 업데이트 추적
            this.pendingUpdates.set(key, {
                events,
                status: 'PENDING',
                attempts: 0
            });
            
            // 4. 비동기로 일관성 확인
            this.scheduleConsistencyCheck(key);
            
        } catch (error) {
            await this.handleInconsistency(key, error);
        }
    }
    
    async scheduleConsistencyCheck(key) {
        const update = this.pendingUpdates.get(key);
        
        setTimeout(async () => {
            const isConsistent = await this.checkReadModelConsistency(
                update.events
            );
            
            if (isConsistent) {
                this.pendingUpdates.delete(key);
            } else {
                update.attempts++;
                
                if (update.attempts < this.retryPolicy.maxAttempts) {
                    // 재시도
                    const delay = this.retryPolicy.getDelay(update.attempts);
                    setTimeout(() => this.scheduleConsistencyCheck(key), delay);
                } else {
                    // 수동 개입 필요
                    await this.alertInconsistency(key, update);
                }
            }
        }, 1000);  // 1초 후 확인
    }
    
    async checkReadModelConsistency(events) {
        // 모든 read model이 업데이트되었는지 확인
        const checks = await Promise.all([
            this.checkDatabase(events),
            this.checkElasticsearch(events),
            this.checkCache(events)
        ]);
        
        return checks.every(check => check === true);
    }
    
    async handleInconsistency(key, error) {
        // 일관성 오류 처리
        console.error(`Consistency error for ${key}:`, error);
        
        // 1. 에러 로깅
        await this.logError(key, error);
        
        // 2. 알림 발송
        await this.sendAlert({
            type: 'CONSISTENCY_ERROR',
            key,
            error: error.message,
            timestamp: new Date()
        });
        
        // 3. 복구 시도
        await this.attemptRecovery(key);
    }
}
```

### 3.1 Consistency Patterns

```javascript
// Strong Consistency 패턴
class StrongConsistencyManager {
    async executeWithStrongConsistency(command) {
        const transaction = await this.beginTransaction();
        
        try {
            // 1. Command 실행
            const events = await this.executeCommand(command, transaction);
            
            // 2. 모든 read model 동기 업데이트
            await Promise.all([
                this.updateDatabase(events, transaction),
                this.updateCache(events, transaction),
                this.updateSearchIndex(events, transaction)
            ]);
            
            // 3. 트랜잭션 커밋
            await transaction.commit();
            
            return events;
            
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
}

// Eventual Consistency 패턴 (권장)
class EventualConsistencyManager {
    async executeWithEventualConsistency(command) {
        // 1. Command 실행 (즉시)
        const events = await this.executeCommand(command);
        
        // 2. 이벤트 발행 (비동기)
        await this.publishEvents(events);
        
        // 3. Read model은 이벤트 핸들러에서 비동기 업데이트
        // 사용자는 즉시 응답 받음
        
        return {
            success: true,
            message: "처리가 완료되었습니다. 일부 정보는 잠시 후 반영됩니다."
        };
    }
}

// Causal Consistency 패턴
class CausalConsistencyManager {
    async executeWithCausalConsistency(command, causedBy = null) {
        const events = await this.executeCommand(command);
        
        // Causal relationship 추적
        if (causedBy) {
            events.forEach(event => {
                event.causedBy = causedBy;
                event.causalVector = this.incrementVector(causedBy.causalVector);
            });
        }
        
        await this.publishEvents(events);
        return events;
    }
}
```

## 핵심 요점

### 1. Event Sourcing의 핵심 가치

- 완벽한 감사 추적과 시간 여행 가능
- 도메인 이벤트를 퍼스트 클래스 시티즌으로 취급
- 복잡한 비즈니스 요구사항 모델링에 유리

### 2. CQRS로 읽기/쓰기 최적화

- 각각의 워크로드에 최적화된 모델 사용
- 복잡한 쿼리와 단순한 명령의 분리
- 독립적인 스케일링 가능

### 3. Eventual Consistency는 현실

- 완벽한 일관성보다 가용성을 선택
- 비즈니스 요구사항에 맞는 일관성 수준 선택
- 사용자 경험을 고려한 설계

---

**이전**: [08-19-distributed-transactions.md](./08-19-distributed-transactions.md)
**다음**: [04c-message-streaming.md](./04c-message-streaming.md)에서 메시지 큐와 스트리밍을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 분산 시스템
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-10-async-programming)

- [8.1 Promise/Future 패턴 개요](./08-10-promise-future.md)
- [8.1a Promise/Future 기본 개념과 구현](./08-01-promise-future-basics.md)
- [8.1b 비동기 연산 조합과 병렬 처리](./08-11-async-composition.md)
- [8.1c 취소와 타임아웃 처리](./08-12-cancellation-timeout.md)
- [8.1d 실행 모델과 스케줄링](./08-13-execution-scheduling.md)

### 🏷️ 관련 키워드

`event_sourcing`, `cqrs`, `eventual_consistency`, `event_store`, `projection`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
