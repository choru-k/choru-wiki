---
tags:
  - DistributedSystems
  - Kafka
  - MessageQueue
  - Streaming
  - BackPressure
---

# Chapter 8-4C: 메시지 큐와 스트리밍: 비동기 통신의 중추

## 🎯 이 섹션에서 배울 내용

대용량 메시지 처리와 스트리밍 시스템의 핵심 기술들을 마스터합니다:

1. **Kafka Event Streaming** - 대용량 이벤트 스트리밍 플랫폼
2. **Back-pressure 및 Flow Control** - 시스템 과부하 방지
3. **Exactly-Once Semantics** - 중복 및 손실 없는 메시지 처리

## 1. Kafka를 이용한 Event Streaming

Kafka는 대용량 실시간 데이터 스트리밍을 위한 분산 스트리밍 플랫폼입니다.

### 1.1 신뢰성 높은 Producer 구현

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
    
    private void recordMetrics(RecordMetadata metadata) {
        // 메트릭 기록
        Metrics.counter("kafka.messages.sent")
            .tag("topic", metadata.topic())
            .increment();
        
        Metrics.timer("kafka.send.duration")
            .tag("topic", metadata.topic())
            .record(Duration.ofMillis(System.currentTimeMillis()));
    }
}
```

### 1.2 Exactly-Once Consumer 구현

```java
// Kafka Consumer with exactly-once semantics
@Component
public class ExactlyOnceKafkaConsumer {
    private final KafkaConsumer<String, byte[]> consumer;
    private final TransactionManager txManager;
    private final IdempotencyStore idempotencyStore;
    
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
    
    private void markAsProcessed(ConsumerRecord<String, byte[]> record) {
        String idempotencyKey = new String(
            record.headers().lastHeader("idempotency-key").value()
        );
        
        idempotencyStore.store(idempotencyKey, {
            "processed_at": System.currentTimeMillis(),
            "topic": record.topic(),
            "partition": record.partition(),
            "offset": record.offset()
        });
    }
    
    private void processRecord(ConsumerRecord<String, byte[]> record) {
        try {
            // 메시지 역직렬화
            Object event = objectMapper.readValue(record.value(), Object.class);
            
            // 이벤트 타입에 따른 처리
            EventHandler handler = eventHandlerRegistry.getHandler(
                event.getClass()
            );
            
            handler.handle(event);
            
            // 메트릭 기록
            Metrics.counter("kafka.messages.processed")
                .tag("topic", record.topic())
                .tag("event_type", event.getClass().getSimpleName())
                .increment();
                
        } catch (Exception e) {
            logger.error("Failed to process record: {}", record, e);
            throw e;
        }
    }
    
    private void handleError(ConsumerRecord<String, byte[]> record, Exception e) {
        // 1. 재시도 로직
        if (isRetryable(e)) {
            int retryCount = getRetryCount(record);
            if (retryCount < MAX_RETRIES) {
                sendToRetryTopic(record, retryCount + 1);
                return;
            }
        }
        
        // 2. Dead Letter Queue
        sendToDeadLetterQueue(record, e);
        
        // 3. 알림
        sendAlert("Message processing failed", record, e);
    }
}
```

**Kafka의 핵심 장점:**

1. **높은 처리량**: 초당 수백만 메시지 처리
2. **내결함성**: 복제와 분산으로 장애 대응
3. **순서 보장**: 파티션 단위로 메시지 순서 보장
4. **영속성**: 디스크에 메시지 영구 저장

## 2. Back-pressure와 Flow Control

시스템 과부하를 방지하기 위한 Back-pressure 메커니즘 구현:

### 2.1 Akka Streams를 이용한 Back-pressure

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
        Thread.sleep(100)  // 느린 처리 시뮤레이션
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
```

### 2.2 Reactive Streams 구현

```scala
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
  
  override def onError(t: Throwable): Unit = {
    subscriber.onError(t)
  }
  
  override def onComplete(): Unit = {
    // 남은 버퍼 처리
    while (!buffer.isEmpty && requested.get() > 0) {
      val event = buffer.poll()
      val processed = process(event)
      subscriber.onNext(processed)
      requested.decrementAndGet()
    }
    
    subscriber.onComplete()
  }
  
  private def process(event: Event): ProcessedEvent = {
    // 비즈니스 로직 처리
    Thread.sleep(100)  // 시뮤레이션
    ProcessedEvent(event.id, event.timestamp, "processed")
  }
}
```

### 2.3 동적 Flow Control

```java
// 동적 Flow Control 구현
public class DynamicFlowController {
    private final AtomicInteger currentLoad = new AtomicInteger(0);
    private final AtomicInteger maxCapacity = new AtomicInteger(100);
    private final CircularBuffer<Long> responseTimeHistory = 
        new CircularBuffer<>(100);
    
    public boolean shouldThrottle(Message message) {
        // 1. 현재 부하 체크
        int load = currentLoad.get();
        int capacity = maxCapacity.get();
        
        if (load >= capacity) {
            return true;
        }
        
        // 2. 응답 시간 기반 동적 조절
        long avgResponseTime = responseTimeHistory.average();
        
        if (avgResponseTime > 1000) {  // 1초 이상이면
            // 용량 감소
            maxCapacity.set(Math.max(10, capacity - 10));
            return load >= maxCapacity.get();
        } else if (avgResponseTime < 100) {  // 100ms 미만이면
            // 용량 증가
            maxCapacity.set(Math.min(200, capacity + 5));
        }
        
        return false;
    }
    
    public void processMessage(Message message) {
        long startTime = System.currentTimeMillis();
        currentLoad.incrementAndGet();
        
        try {
            // 메시지 처리
            handleMessage(message);
            
        } finally {
            currentLoad.decrementAndGet();
            
            // 응답 시간 기록
            long responseTime = System.currentTimeMillis() - startTime;
            responseTimeHistory.add(responseTime);
        }
    }
    
    // Circuit Breaker와 통합
    public void handleOverload() {
        if (currentLoad.get() > maxCapacity.get() * 1.5) {
            // 오버로드 상태 - Circuit 열기
            circuitBreaker.open();
            
            // 긴급 조치
            emergencyThrottle();
        }
    }
    
    private void emergencyThrottle() {
        // 최우선 메시지만 처리
        messageQueue.retainOnly(msg -> msg.getPriority() == Priority.HIGH);
        
        // 용량 대폭 감소
        maxCapacity.set(10);
        
        // 알림 발송
        alertService.sendAlert("System overload detected");
    }
}
```

## 3. 실전 틴닝 전략

### 3.1 Producer Back-pressure

```python
# Producer 측 Back-pressure 처리
class BackPressureAwareProducer:
    def __init__(self):
        self.send_buffer = asyncio.Queue(maxsize=1000)
        self.metrics = ProducerMetrics()
        self.circuit_breaker = CircuitBreaker()
        
    async def send_with_backpressure(self, message: Message) -> bool:
        # 1. Circuit Breaker 체크
        if self.circuit_breaker.is_open():
            raise CircuitOpenError("Producer circuit is open")
        
        # 2. 버퍼 용량 체크
        if self.send_buffer.full():
            # Back-pressure 신호
            await self.handle_backpressure(message)
            return False
        
        # 3. 비동기 전송
        await self.send_buffer.put(message)
        asyncio.create_task(self.process_send_queue())
        
        return True
    
    async def handle_backpressure(self, message: Message):
        # 전략 1: Drop oldest messages
        if message.priority == Priority.HIGH:
            # 최우선 메시지는 가장 오래된 것 제거
            try:
                self.send_buffer.get_nowait()
                await self.send_buffer.put(message)
                self.metrics.record_drop('old_message_dropped')
            except asyncio.QueueEmpty:
                pass
        
        # 전략 2: 대기 (제한된 시간)
        elif message.priority == Priority.MEDIUM:
            try:
                await asyncio.wait_for(
                    self.send_buffer.put(message),
                    timeout=1.0  # 1초 대기
                )
            except asyncio.TimeoutError:
                self.metrics.record_drop('timeout_drop')
                raise BackPressureError()
        
        # 전략 3: 즉시 Drop
        else:
            self.metrics.record_drop('low_priority_drop')
            raise BackPressureError()
    
    async def process_send_queue(self):
        while not self.send_buffer.empty():
            try:
                message = await self.send_buffer.get()
                await self.kafka_producer.send(message)
                
                self.metrics.record_success()
                self.circuit_breaker.record_success()
                
            except Exception as e:
                self.circuit_breaker.record_failure()
                
                # 재시도 전략
                if self.should_retry(e):
                    await self.retry_queue.put(message)
                else:
                    await self.dead_letter_queue.put(message)
```

### 3.2 Consumer Back-pressure

```python
# Consumer 측 Back-pressure 처리
class BackPressureAwareConsumer:
    def __init__(self):
        self.processing_semaphore = asyncio.Semaphore(10)
        self.metrics = ConsumerMetrics()
        self.adaptive_batch_size = AdaptiveBatchSize()
        
    async def consume_with_backpressure(self):
        while True:
            # 동적 배치 크기 조정
            batch_size = self.adaptive_batch_size.get_current_size()
            
            messages = await self.kafka_consumer.poll(
                max_records=batch_size,
                timeout=Duration.seconds(1)
            )
            
            if not messages:
                continue
            
            # Back-pressure 여부 확인
            if self.is_under_pressure():
                await self.handle_consumer_backpressure(messages)
            else:
                await self.process_messages_parallel(messages)
    
    async def is_under_pressure(self) -> bool:
        # 여러 지표로 Back-pressure 감지
        conditions = [
            self.processing_semaphore._value < 2,  # 가용 슬롯 적음
            self.metrics.get_avg_processing_time() > 5000,  # 처리 시간 깁
            self.get_memory_usage() > 0.8,  # 메모리 사용량 높음
            self.get_cpu_usage() > 0.9  # CPU 사용량 높음
        ]
        
        return any(conditions)
    
    async def handle_consumer_backpressure(self, messages):
        # 전략 1: 배치 크기 감소
        self.adaptive_batch_size.decrease()
        
        # 전략 2: 우선순위 기반 처리
        high_priority = [msg for msg in messages 
                        if msg.priority == Priority.HIGH]
        low_priority = [msg for msg in messages 
                       if msg.priority == Priority.LOW]
        
        # 고우선 메시지 먼저 처리
        if high_priority:
            await self.process_messages_sequential(high_priority)
        
        # 저우선 메시지는 지연 처리
        if low_priority:
            await self.defer_messages(low_priority)
    
    async def process_messages_parallel(self, messages):
        tasks = []
        for message in messages:
            async with self.processing_semaphore:
                task = asyncio.create_task(
                    self.process_single_message(message)
                )
                tasks.append(task)
        
        # 모든 메시지 처리 대기
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 결과 처리
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                await self.handle_processing_error(messages[i], result)
            else:
                self.metrics.record_success()
    
    async def defer_messages(self, messages):
        # 메시지를 다음 배치로 연기
        for message in messages:
            await self.deferred_queue.put(message)
        
        # 지연된 메시지 메트릭
        self.metrics.record_deferred(len(messages))
```

## 핵심 요점

### 1. Kafka의 전략적 활용

- **Exactly-once semantics**로 메시지 중복 및 손실 방지
- **Partitioning**으로 확장성과 성능 향상
- **Dead Letter Queue**로 장애 메시지 안전 처리

### 2. Back-pressure로 시스템 안정성 보장

- **동적 Flow Control**로 시스템 부하에 적응
- **Buffering 전략**으로 트래픽 스파이크 완주
- **Priority-based Processing**으로 중요 메시지 우선 처리

### 3. 모니터링과 메트릭

- **실시간 성능 모니터링**으로 문제 조기 발견
- **Adaptive 설정**으로 시스템 자동 연니
- **알림 및 자동 복구**로 운영 비용 절감

---

**이전**: [04b-event-sourcing-cqrs.md](04b-event-sourcing-cqrs.md)
**다음**: [04d-resilience-patterns.md](04d-resilience-patterns.md)에서 Circuit Breaker와 복원력 패턴을 학습합니다.
