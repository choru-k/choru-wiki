---
tags:
  - DistributedSystems
  - Async
  - Microservices
  - EventSourcing
  - Saga
---

# Chapter 8-4: 분산 시스템의 비동기 패턴

## 🎯 이 문서를 읽고 나면 얻을 수 있는 것들

이 문서를 완독하면 여러분은:

1. **"분산 트랜잭션 없이 어떻게 일관성을 보장하죠?"** - Saga 패턴으로 eventual consistency를 구현할 수 있습니다
2. **"마이크로서비스 간 통신이 너무 복잡해요"** - Event-driven architecture로 느슨한 결합을 달성합니다
3. **"메시지가 중복 처리되면 어떻게 하죠?"** - Idempotency와 exactly-once delivery를 보장하는 방법을 배웁니다
4. **"서비스 하나가 죽으면 전체가 멈춰요"** - Circuit breaker와 bulkhead로 장애를 격리합니다

## 1. 분산 트랜잭션의 딜레마: 2PC의 몰락과 Saga의 부상

### 1.1 Two-Phase Commit의 비극적 한계

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
```text

### 1.2 Saga 패턴: 긴 여정의 지혜

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
```text

### 1.3 Orchestration vs Choreography: 지휘자 vs 춤

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
```text

**두 방식의 트레이드오프:**

| 측면 | Orchestration | Choreography |
|------|---------------|--------------|
| 복잡도 관리 | 중앙화되어 이해하기 쉬움 | 분산되어 추적 어려움 |
| 결합도 | 오케스트레이터가 모든 서비스 알아야 함 | 느슨한 결합 |
| 테스트 | 통합 테스트 쉬움 | 각 서비스 독립 테스트 |
| 성능 | 추가 홉 필요 | 직접 통신 |
| 장애 지점 | 오케스트레이터가 SPOF | 분산되어 있음 |

## 2. Event Sourcing과 CQRS: 시간을 되돌리는 마법

### 2.1 Event Sourcing: 모든 것을 기록하라

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
```text

### 2.2 CQRS: 읽기와 쓰기의 분리

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
```text

### 2.3 Eventual Consistency 처리

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
}
```text

## 3. 메시지 큐와 스트리밍: 비동기 통신의 중추

### 3.1 Kafka를 이용한 Event Streaming

```java
// Kafka Producer with 완벽한 설정
@Component
public class ReliableKafkaProducer {
    private final KafkaProducer<String, byte[]> producer;
    private final ObjectMapper objectMapper;
    
    public ReliableKafkaProducer() {
        Properties props = new Properties();
        
        // 신뢰성 설정
        props.put(ProducerConfig.ACKS_CONFIG, "all");  // 모든 replica 확인
        props.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
        props.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5);
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);  // 중복 방지
        
        // 성능 설정
        props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "snappy");
        props.put(ProducerConfig.LINGER_MS_CONFIG, 20);  // 배치 처리
        props.put(ProducerConfig.BATCH_SIZE_CONFIG, 32768);
        
        // 에러 처리
        props.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 30000);
        props.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 120000);
        
        this.producer = new KafkaProducer<>(props);
    }
    
    public CompletableFuture<RecordMetadata> sendEvent(
        String topic,
        String key,
        Object event,
        Map<String, String> headers
    ) {
        CompletableFuture<RecordMetadata> future = new CompletableFuture<>();
        
        try {
            // 이벤트 직렬화
            byte[] value = objectMapper.writeValueAsBytes(event);
            
            // 헤더 추가
            ProducerRecord<String, byte[]> record = 
                new ProducerRecord<>(topic, key, value);
            
            headers.forEach((k, v) -> 
                record.headers().add(k, v.getBytes())
            );
            
            // 트레이싱 정보
            record.headers().add("trace-id", 
                MDC.get("traceId").getBytes());
            record.headers().add("timestamp", 
                String.valueOf(System.currentTimeMillis()).getBytes());
            
            // 비동기 전송
            producer.send(record, (metadata, exception) -> {
                if (exception != null) {
                    // Dead Letter Queue로 전송
                    sendToDeadLetter(record, exception);
                    future.completeExceptionally(exception);
                } else {
                    // 메트릭 기록
                    recordMetrics(metadata);
                    future.complete(metadata);
                }
            });
            
        } catch (Exception e) {
            future.completeExceptionally(e);
        }
        
        return future;
    }
    
    private void sendToDeadLetter(ProducerRecord<String, byte[]> record, 
                                  Exception exception) {
        String dlqTopic = record.topic() + ".dlq";
        
        ProducerRecord<String, byte[]> dlqRecord = 
            new ProducerRecord<>(dlqTopic, record.key(), record.value());
        
        // 에러 정보 추가
        dlqRecord.headers().add("original-topic", 
            record.topic().getBytes());
        dlqRecord.headers().add("error-message", 
            exception.getMessage().getBytes());
        dlqRecord.headers().add("error-timestamp", 
            String.valueOf(System.currentTimeMillis()).getBytes());
        
        producer.send(dlqRecord);
    }
}

// Kafka Consumer with exactly-once semantics
@Component
public class ExactlyOnceKafkaConsumer {
    private final KafkaConsumer<String, byte[]> consumer;
    private final TransactionManager txManager;
    
    public ExactlyOnceKafkaConsumer() {
        Properties props = new Properties();
        
        // Exactly-once 설정
        props.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        
        // 성능과 신뢰성 균형
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 100);
        props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, 300000);
        props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, 30000);
        
        this.consumer = new KafkaConsumer<>(props);
    }
    
    public void consume(List<String> topics) {
        consumer.subscribe(topics);
        
        while (true) {
            ConsumerRecords<String, byte[]> records = 
                consumer.poll(Duration.ofMillis(100));
            
            if (!records.isEmpty()) {
                processRecords(records);
            }
        }
    }
    
    private void processRecords(ConsumerRecords<String, byte[]> records) {
        Map<TopicPartition, OffsetAndMetadata> offsetsToCommit = 
            new HashMap<>();
        
        for (ConsumerRecord<String, byte[]> record : records) {
            try {
                // 트랜잭션 시작
                txManager.begin();
                
                // Idempotency 체크
                if (!isAlreadyProcessed(record)) {
                    // 비즈니스 로직 처리
                    processRecord(record);
                    
                    // 처리 완료 마킹
                    markAsProcessed(record);
                }
                
                // 트랜잭션 커밋
                txManager.commit();
                
                // 오프셋 저장
                offsetsToCommit.put(
                    new TopicPartition(record.topic(), record.partition()),
                    new OffsetAndMetadata(record.offset() + 1)
                );
                
            } catch (Exception e) {
                // 트랜잭션 롤백
                txManager.rollback();
                
                // 재시도 또는 DLQ
                handleError(record, e);
            }
        }
        
        // 배치 커밋
        consumer.commitSync(offsetsToCommit);
    }
    
    private boolean isAlreadyProcessed(ConsumerRecord<String, byte[]> record) {
        String idempotencyKey = new String(
            record.headers().lastHeader("idempotency-key").value()
        );
        
        return idempotencyStore.exists(idempotencyKey);
    }
}
```text

### 3.2 Back-pressure와 Flow Control

```scala
// Akka Streams를 이용한 Back-pressure 구현
import akka.stream._
import akka.stream.scaladsl._

class BackPressureStream(implicit system: ActorSystem) {
  implicit val materializer: Materializer = Materializer(system)
  
  // Source: 데이터 생산자
  val fastProducer = Source
    .tick(10.milliseconds, 10.milliseconds, 1)
    .map { i =>
      println(s"Producing: $i")
      Event(s"event-$i", System.currentTimeMillis())
    }
  
  // Flow: 느린 처리기
  val slowProcessor = Flow[Event]
    .buffer(10, OverflowStrategy.backpressure)  // 버퍼 초과시 back-pressure
    .mapAsync(2) { event =>
      Future {
        Thread.sleep(100)  // 느린 처리 시뮬레이션
        println(s"Processing: ${event.id}")
        ProcessedEvent(event.id, event.timestamp, "processed")
      }
    }
  
  // Sink: 최종 소비자
  val sink = Sink.foreach[ProcessedEvent] { processed =>
    println(s"Consumed: ${processed.id}")
  }
  
  // Stream 실행
  val runnableGraph = fastProducer
    .via(slowProcessor)
    .to(sink)
  
  val result = runnableGraph.run()
  
  // Dynamic throttling
  val dynamicThrottle = Source
    .tick(1.second, 1.second, 1)
    .conflate((_, _) => 1)  // 압력 상황에서 메시지 병합
    .zip(fastProducer)
    .map(_._2)
    .throttle(
      elements = 100,
      per = 1.second,
      maximumBurst = 20,
      mode = ThrottleMode.Shaping
    )
}

// Reactive Streams 구현
class ReactiveStreamProcessor extends Processor[Event, ProcessedEvent] {
  private var subscription: Subscription = _
  private var subscriber: Subscriber[_ >: ProcessedEvent] = _
  private val buffer = new LinkedBlockingQueue[Event](100)
  private val requested = new AtomicLong(0)
  
  override def onSubscribe(s: Subscription): Unit = {
    this.subscription = s
    s.request(10)  // 초기 요청
  }
  
  override def onNext(event: Event): Unit = {
    if (!buffer.offer(event)) {
      // 버퍼 가득 참 - back-pressure 신호
      subscription.cancel()
      onError(new BufferOverflowException())
    } else {
      processIfPossible()
    }
  }
  
  private def processIfPossible(): Unit = {
    while (requested.get() > 0 && !buffer.isEmpty) {
      val event = buffer.poll()
      val processed = process(event)
      
      subscriber.onNext(processed)
      requested.decrementAndGet()
      
      // 버퍼에 여유가 생기면 더 요청
      if (buffer.size() < 50) {
        subscription.request(10)
      }
    }
  }
  
  override def subscribe(s: Subscriber[_ >: ProcessedEvent]): Unit = {
    this.subscriber = s
    s.onSubscribe(new Subscription {
      override def request(n: Long): Unit = {
        requested.addAndGet(n)
        processIfPossible()
      }
      
      override def cancel(): Unit = {
        subscription.cancel()
      }
    })
  }
}
```text

## 4. Circuit Breaker와 Resilience Patterns

### 4.1 Circuit Breaker 구현

```python
from enum import Enum
from datetime import datetime, timedelta
import asyncio
from typing import Callable, Any, Optional
import logging

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: type = Exception
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        
        self.failure_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.state = CircuitState.CLOSED
        
        # 메트릭
        self.total_calls = 0
        self.successful_calls = 0
        self.failed_calls = 0
        
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        self.total_calls += 1
        
        # Circuit이 열려있는지 확인
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitState.HALF_OPEN
            else:
                self.failed_calls += 1
                raise CircuitOpenError(
                    f"Circuit breaker is OPEN. "
                    f"Retry after {self._time_until_reset()} seconds"
                )
        
        try:
            # 실제 함수 호출
            result = await func(*args, **kwargs)
            self._on_success()
            return result
            
        except self.expected_exception as e:
            self._on_failure()
            raise e
    
    def _should_attempt_reset(self) -> bool:
        return (
            self.last_failure_time and
            datetime.now() >= self.last_failure_time + 
            timedelta(seconds=self.recovery_timeout)
        )
    
    def _time_until_reset(self) -> int:
        if not self.last_failure_time:
            return 0
        
        elapsed = datetime.now() - self.last_failure_time
        remaining = self.recovery_timeout - elapsed.total_seconds()
        return max(0, int(remaining))
    
    def _on_success(self):
        self.successful_calls += 1
        
        if self.state == CircuitState.HALF_OPEN:
            # Half-open에서 성공 -> Circuit 닫기
            self.state = CircuitState.CLOSED
            self.failure_count = 0
            logging.info("Circuit breaker closed after successful call")
    
    def _on_failure(self):
        self.failed_calls += 1
        self.failure_count += 1
        self.last_failure_time = datetime.now()
        
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logging.error(
                f"Circuit breaker opened after {self.failure_count} failures"
            )
        
        if self.state == CircuitState.HALF_OPEN:
            # Half-open에서 실패 -> 다시 열기
            self.state = CircuitState.OPEN
            logging.warning("Circuit breaker reopened after failure in half-open")
    
    def get_state(self) -> dict:
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "total_calls": self.total_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "success_rate": (
                self.successful_calls / self.total_calls 
                if self.total_calls > 0 else 0
            )
        }

# 사용 예제
class PaymentService:
    def __init__(self):
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=3,
            recovery_timeout=30,
            expected_exception=PaymentGatewayError
        )
    
    async def process_payment(self, amount: float, card: str) -> str:
        return await self.circuit_breaker.call(
            self._call_payment_gateway,
            amount,
            card
        )
    
    async def _call_payment_gateway(self, amount: float, card: str) -> str:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://payment-gateway.com/charge",
                json={"amount": amount, "card": card},
                timeout=aiohttp.ClientTimeout(total=5)
            ) as response:
                if response.status != 200:
                    raise PaymentGatewayError(f"Status: {response.status}")
                
                return await response.json()
```text

### 4.2 Bulkhead Pattern: 격리의 미학

```java
// Thread Pool Bulkhead
@Component
public class BulkheadManager {
    private final Map<String, ThreadPoolExecutor> bulkheads = 
        new ConcurrentHashMap<>();
    
    public BulkheadManager() {
        // 서비스별 격리된 스레드 풀
        bulkheads.put("payment", createBulkhead(10, 20, 100));
        bulkheads.put("inventory", createBulkhead(5, 10, 50));
        bulkheads.put("shipping", createBulkhead(5, 10, 50));
        bulkheads.put("notification", createBulkhead(2, 5, 20));
    }
    
    private ThreadPoolExecutor createBulkhead(
        int coreSize, 
        int maxSize, 
        int queueCapacity
    ) {
        return new ThreadPoolExecutor(
            coreSize,
            maxSize,
            60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(queueCapacity),
            new ThreadPoolExecutor.CallerRunsPolicy()  // Back-pressure
        );
    }
    
    public <T> CompletableFuture<T> execute(
        String bulkheadName,
        Callable<T> task
    ) {
        ThreadPoolExecutor executor = bulkheads.get(bulkheadName);
        
        if (executor == null) {
            throw new IllegalArgumentException(
                "Unknown bulkhead: " + bulkheadName
            );
        }
        
        // 메트릭 수집
        recordMetrics(bulkheadName, executor);
        
        // 격리된 실행
        CompletableFuture<T> future = new CompletableFuture<>();
        
        executor.submit(() -> {
            try {
                T result = task.call();
                future.complete(result);
            } catch (Exception e) {
                future.completeExceptionally(e);
            }
        });
        
        return future;
    }
    
    private void recordMetrics(String name, ThreadPoolExecutor executor) {
        Metrics.gauge("bulkhead.active", executor.getActiveCount())
            .tag("bulkhead", name);
        
        Metrics.gauge("bulkhead.queue.size", executor.getQueue().size())
            .tag("bulkhead", name);
        
        Metrics.gauge("bulkhead.pool.size", executor.getPoolSize())
            .tag("bulkhead", name);
        
        // 포화 상태 감지
        if (executor.getQueue().remainingCapacity() == 0) {
            Metrics.counter("bulkhead.saturated")
                .tag("bulkhead", name)
                .increment();
        }
    }
}

// Semaphore Bulkhead (더 가벼운 격리)
public class SemaphoreBulkhead {
    private final Semaphore semaphore;
    private final String name;
    private final AtomicInteger activeCount = new AtomicInteger(0);
    
    public SemaphoreBulkhead(String name, int maxConcurrency) {
        this.name = name;
        this.semaphore = new Semaphore(maxConcurrency);
    }
    
    public <T> T execute(Supplier<T> supplier) throws BulkheadFullException {
        boolean acquired = false;
        
        try {
            acquired = semaphore.tryAcquire(100, TimeUnit.MILLISECONDS);
            
            if (!acquired) {
                throw new BulkheadFullException(
                    "Bulkhead " + name + " is full"
                );
            }
            
            activeCount.incrementAndGet();
            return supplier.get();
            
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(e);
        } finally {
            if (acquired) {
                activeCount.decrementAndGet();
                semaphore.release();
            }
        }
    }
}
```text

### 4.3 Retry와 Timeout 전략

```kotlin
// 스마트한 Retry 전략
class SmartRetryPolicy {
    private val logger = LoggerFactory.getLogger(javaClass)
    
    suspend fun <T> executeWithRetry(
        maxAttempts: Int = 3,
        initialDelay: Duration = Duration.ofMillis(100),
        maxDelay: Duration = Duration.ofSeconds(10),
        backoffMultiplier: Double = 2.0,
        jitterFactor: Double = 0.1,
        retryableExceptions: Set<Class<out Exception>> = setOf(
            IOException::class.java,
            TimeoutException::class.java
        ),
        operation: suspend () -> T
    ): T {
        var currentDelay = initialDelay
        var lastException: Exception? = null
        
        repeat(maxAttempts) { attempt ->
            try {
                // Circuit breaker 통합
                if (shouldCircuitBreak(attempt)) {
                    throw CircuitOpenException()
                }
                
                // Timeout 적용
                return withTimeout(calculateTimeout(attempt)) {
                    operation()
                }
                
            } catch (e: Exception) {
                lastException = e
                
                // 재시도 가능한 예외인지 확인
                if (!isRetryable(e, retryableExceptions)) {
                    throw e
                }
                
                // 마지막 시도였다면 예외 발생
                if (attempt == maxAttempts - 1) {
                    throw RetryExhaustedException(
                        "Failed after $maxAttempts attempts",
                        e
                    )
                }
                
                // 지수 백오프 + 지터
                val jitter = (Random.nextDouble() * 2 - 1) * jitterFactor
                val delayMillis = (currentDelay.toMillis() * (1 + jitter)).toLong()
                
                logger.warn(
                    "Attempt ${attempt + 1} failed: ${e.message}. " +
                    "Retrying in ${delayMillis}ms..."
                )
                
                delay(delayMillis)
                
                // 다음 지연 시간 계산
                currentDelay = Duration.ofMillis(
                    min(
                        (currentDelay.toMillis() * backoffMultiplier).toLong(),
                        maxDelay.toMillis()
                    )
                )
            }
        }
        
        throw lastException!!
    }
    
    private fun isRetryable(
        exception: Exception,
        retryableExceptions: Set<Class<out Exception>>
    ): Boolean {
        // 특정 에러 코드는 재시도 불가
        if (exception is HttpException) {
            return exception.code() !in listOf(400, 401, 403, 404)
        }
        
        return retryableExceptions.any { it.isInstance(exception) }
    }
    
    private fun calculateTimeout(attempt: Int): Duration {
        // 시도 횟수에 따라 타임아웃 증가
        return Duration.ofSeconds(5L * (attempt + 1))
    }
    
    private fun shouldCircuitBreak(attempt: Int): Boolean {
        // 연속 실패가 많으면 circuit break
        return getRecentFailureRate() > 0.8 && attempt > 1
    }
}

// Hedged Requests (여러 요청 동시 실행)
class HedgedRequestExecutor {
    suspend fun <T> executeHedged(
        primaryOperation: suspend () -> T,
        fallbackOperations: List<suspend () -> T>,
        hedgeDelay: Duration = Duration.ofMillis(200)
    ): T = coroutineScope {
        val results = Channel<Result<T>>()
        
        // Primary 요청
        launch {
            try {
                val result = primaryOperation()
                results.send(Result.success(result))
            } catch (e: Exception) {
                results.send(Result.failure(e))
            }
        }
        
        // Hedge 요청들
        fallbackOperations.forEach { operation ->
            launch {
                delay(hedgeDelay.toMillis())
                
                // 이미 성공했으면 실행 안 함
                if (!results.isClosedForSend) {
                    try {
                        val result = operation()
                        results.send(Result.success(result))
                    } catch (e: Exception) {
                        results.send(Result.failure(e))
                    }
                }
            }
        }
        
        // 첫 번째 성공 반환
        var failures = 0
        for (result in results) {
            if (result.isSuccess) {
                results.close()
                return@coroutineScope result.getOrThrow()
            }
            
            failures++
            if (failures == fallbackOperations.size + 1) {
                throw AllRequestsFailedException()
            }
        }
        
        throw IllegalStateException("No results received")
    }
}
```text

## 5. 실전 사례: 대규모 이커머스 시스템

### 5.1 주문 처리 시스템 전체 구조

```yaml
# docker-compose.yml로 보는 전체 아키텍처
version: '3.8'

services:
  # API Gateway
  api-gateway:
    image: kong:latest
    environment:
      - KONG_DATABASE=postgres
      - KONG_PG_HOST=kong-db
    ports:
      - "8000:8000"
    depends_on:
      - kong-db
  
  # Order Service (Orchestrator)
  order-service:
    build: ./order-service
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - KAFKA_BOOTSTRAP_SERVERS=kafka:9092
    depends_on:
      - kafka
      - postgres
  
  # Inventory Service
  inventory-service:
    build: ./inventory-service
    environment:
      - DB_HOST=inventory-db
      - REDIS_HOST=redis
    depends_on:
      - inventory-db
      - redis
  
  # Payment Service
  payment-service:
    build: ./payment-service
    environment:
      - STRIPE_API_KEY=${STRIPE_API_KEY}
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 512M
  
  # Kafka
  kafka:
    image: confluentinc/cp-kafka:latest
    environment:
      - KAFKA_BROKER_ID=1
      - KAFKA_ZOOKEEPER_CONNECT=zookeeper:2181
      - KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=3
    depends_on:
      - zookeeper
  
  # Event Store
  eventstore:
    image: eventstore/eventstore:latest
    environment:
      - EVENTSTORE_CLUSTER_SIZE=3
      - EVENTSTORE_RUN_PROJECTIONS=All
    ports:
      - "2113:2113"
  
  # Monitoring
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
  
  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    ports:
      - "3000:3000"
```text

### 5.2 Production 장애 대응 사례

```python
# 실제 장애 상황과 해결
class ProductionIncidentHandler:
    """
    2023년 블랙프라이데이 실제 장애 대응 코드
    - 트래픽: 평소 대비 50배 (초당 10만 요청)
    - 장애: Payment 서비스 응답 지연으로 전체 시스템 마비
    """
    
    def __init__(self):
        # 1. Circuit Breaker 즉시 적용
        self.payment_circuit = CircuitBreaker(
            failure_threshold=10,  # 10번 실패시 open
            recovery_timeout=30,    # 30초 후 재시도
            expected_exception=PaymentTimeoutError
        )
        
        # 2. Bulkhead로 격리
        self.payment_semaphore = asyncio.Semaphore(20)  # 동시 20개만
        
        # 3. Cache 적극 활용
        self.cache = Redis(
            host='redis-cluster',
            decode_responses=True,
            socket_keepalive=True,
            socket_keepalive_options={
                1: 1,  # TCP_KEEPIDLE
                2: 1,  # TCP_KEEPINTVL
                3: 3,  # TCP_KEEPCNT
            }
        )
        
        # 4. Rate Limiting
        self.rate_limiter = SlidingWindowRateLimiter(
            max_requests=1000,
            window_seconds=1
        )
    
    async def handle_order(self, order: Order) -> OrderResult:
        # Step 1: Rate Limiting
        if not await self.rate_limiter.allow(order.customer_id):
            # 429 Too Many Requests
            return OrderResult(
                status="RATE_LIMITED",
                message="Please try again later"
            )
        
        # Step 2: Cache Hit 확인
        cached = await self.cache.get(f"order:{order.id}")
        if cached:
            return OrderResult.from_json(cached)
        
        # Step 3: Inventory 확인 (빠른 실패)
        if not await self.check_inventory_fast(order):
            return OrderResult(
                status="OUT_OF_STOCK",
                message="Some items are out of stock"
            )
        
        # Step 4: Payment 처리 (Circuit Breaker + Bulkhead)
        try:
            async with self.payment_semaphore:
                payment_result = await self.payment_circuit.call(
                    self.process_payment_with_timeout,
                    order
                )
        except CircuitOpenError:
            # Circuit이 열림 - Fallback
            return await self.fallback_payment_queue(order)
        except asyncio.TimeoutError:
            # Timeout - 비동기 큐로 전환
            return await self.async_payment_queue(order)
        
        # Step 5: 결과 캐싱
        result = OrderResult(
            status="SUCCESS",
            order_id=order.id,
            payment_id=payment_result.id
        )
        
        await self.cache.setex(
            f"order:{order.id}",
            300,  # 5분 캐시
            result.to_json()
        )
        
        return result
    
    async def process_payment_with_timeout(self, order: Order):
        # Adaptive timeout
        timeout = self.calculate_adaptive_timeout()
        
        async with async_timeout.timeout(timeout):
            return await self.payment_service.charge(order)
    
    def calculate_adaptive_timeout(self) -> float:
        # 최근 응답 시간 기반 동적 타임아웃
        p99_latency = self.metrics.get_p99_latency("payment")
        
        if p99_latency < 1.0:
            return 2.0  # 정상: 2초
        elif p99_latency < 3.0:
            return 5.0  # 약간 느림: 5초
        else:
            return 10.0  # 매우 느림: 10초
    
    async def fallback_payment_queue(self, order: Order) -> OrderResult:
        """
        Payment 서비스 장애시 Fallback
        주문을 큐에 넣고 나중에 처리
        """
        await self.kafka_producer.send(
            topic="payment.retry.queue",
            key=order.customer_id,
            value={
                "order": order.to_dict(),
                "timestamp": datetime.now().isoformat(),
                "retry_count": 0
            }
        )
        
        return OrderResult(
            status="PENDING_PAYMENT",
            message="Your order is being processed. You'll receive confirmation soon."
        )
    
    async def check_inventory_fast(self, order: Order) -> bool:
        """
        빠른 재고 확인 (캐시 우선)
        """
        for item in order.items:
            # 1. 로컬 캐시 확인
            cached_stock = await self.cache.get(f"stock:{item.sku}")
            
            if cached_stock is not None:
                if int(cached_stock) < item.quantity:
                    return False
            else:
                # 2. 캐시 미스시 비동기 업데이트
                asyncio.create_task(
                    self.update_stock_cache(item.sku)
                )
                
                # 3. 일단 통과 (optimistic)
                continue
        
        return True
    
    async def monitor_health(self):
        """
        시스템 헬스 모니터링
        """
        while True:
            metrics = {
                "circuit_state": self.payment_circuit.state.value,
                "circuit_failure_count": self.payment_circuit.failure_count,
                "semaphore_available": self.payment_semaphore._value,
                "cache_hit_rate": await self.calculate_cache_hit_rate(),
                "rate_limit_rejections": self.rate_limiter.rejection_count,
                "queue_depth": await self.get_queue_depth()
            }
            
            # Prometheus에 메트릭 전송
            for key, value in metrics.items():
                prometheus_client.Gauge(key).set(value)
            
            # 임계치 초과시 알림
            if metrics["circuit_failure_count"] > 50:
                await self.send_alert(
                    "Payment service experiencing high failure rate",
                    severity="HIGH"
                )
            
            await asyncio.sleep(10)
```text

## 6. 마무리: 분산 비동기의 미래

분산 시스템의 비동기 패턴을 마스터한다는 것은:

1. **Trade-off 이해**: CAP 정리, 일관성 vs 가용성
2. **장애 예상**: Everything fails, all the time
3. **관찰 가능성**: 분산 트레이싱, 메트릭, 로그 통합
4. **자동화**: Self-healing, auto-scaling

제가 10년간 분산 시스템을 구축하며 배운 교훈:

> "분산 시스템에서 가장 어려운 것은 기술이 아니라 복잡성 관리다.
> 단순함을 유지하되, 필요한 복잡성은 받아들여라."

**실전 체크리스트:**

- [ ] Idempotency 보장
- [ ] Circuit Breaker 구현
- [ ] Retry with backoff
- [ ] Distributed tracing
- [ ] Graceful degradation
- [ ] Chaos engineering

이제 여러분은 Netflix, Uber, Airbnb 같은 회사들이 사용하는 패턴들을 이해하고 구현할 수 있습니다. 다음 챕터에서는 이런 시스템들의 메모리 관리와 GC 최적화를 다루겠습니다!

## 참고 자료

- [Saga Pattern](https://microservices.io/patterns/data/saga.html) - Chris Richardson
- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) - Martin Fowler
- [Reactive Manifesto](https://www.reactivemanifesto.org/)
- [Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html) - Martin Fowler
- [Building Event-Driven Microservices](https://www.confluent.io/resources/ebook/building-event-driven-microservices/) - Adam Bellemare
