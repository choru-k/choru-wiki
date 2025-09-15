---
tags:
  - Event-Driven
  - Best Practices
  - Anti-patterns
  - Success Factors
  - Guide
---

# 16.2D Event-Driven Architecture 베스트 프랙티스 - 성공 요인과 안티패턴

## 🎯 이벤트 드리븐 아키텍처 성공 요인

### ✅ 핵심 성공 요인들

```bash
1. 이벤트 설계 원칙
   ✅ 과거 시제 사용 (UserRegistered, OrderCreated)
   ✅ 불변성 보장 (이벤트는 수정되지 않음)
   ✅ 비즈니스 의미 있는 이벤트
   ✅ 적절한 이벤트 크기 (너무 크지도 작지도 않게)

2. 이벤트 스키마 관리
   ✅ 스키마 진화 전략 (버전 관리)
   ✅ 하위 호환성 보장
   ✅ Schema Registry 활용
   ✅ 이벤트 검증 자동화

3. 내결함성 설계
   ✅ At-least-once 전송 보장
   ✅ 멱등성 처리
   ✅ 재시도 메커니즘
   ✅ Circuit Breaker 패턴

4. 모니터링과 디버깅
   ✅ 분산 트레이싱
   ✅ 이벤트 플로우 시각화
   ✅ 지연 시간 모니터링
   ✅ 오류율 추적
```

### ❌ 주의해야 할 안티패턴들

```bash
1. 이벤트 설계 실수
   ❌ 데이터 변경이 아닌 단순 알림용 이벤트
   ❌ 너무 큰 이벤트 페이로드
   ❌ 기술적 세부사항이 노출된 이벤트
   ❌ 일관성 없는 이벤트 네이밍

2. 아키텍처 실수
   ❌ 동기식 처리에 이벤트 억지로 적용
   ❌ 이벤트로 모든 서비스 간 통신 대체
   ❌ 순환 이벤트 의존성
   ❌ 이벤트 순서에 대한 과도한 의존

3. 운영상 실수
   ❌ 백프레셔 처리 미흡
   ❌ 파독 큐 관리 소홀
   ❌ 이벤트 스키마 검증 생략
   ❌ 모니터링 부족
```

### 🛠️ 실무 구현 체크리스트

```yaml
# 이벤트 드리븐 시스템 구축 체크리스트

이벤트 설계:
  - [ ] 도메인 이벤트 식별 완료
  - [ ] 이벤트 스키마 정의
  - [ ] 이벤트 버전 관리 전략 수립
  - [ ] 이벤트 생명주기 정의

인프라스트럭처:
  - [ ] 메시지 브로커 선택 (Kafka/RabbitMQ/Pulsar)
  - [ ] 스키마 레지스트리 구축
  - [ ] 이벤트 스토어 구현
  - [ ] 백업/복구 전략 수립

서비스 구현:
  - [ ] 이벤트 프로듀서 구현
  - [ ] 이벤트 컨슈머 구현
  - [ ] 멱등성 처리 구현
  - [ ] 재시도 로직 구현

모니터링:
  - [ ] 이벤트 플로우 추적
  - [ ] 지연 시간 모니터링
  - [ ] 오류율 알림 설정
  - [ ] 처리량 메트릭 수집

테스팅:
  - [ ] 이벤트 기반 테스트 작성
  - [ ] 통합 테스트 자동화
  - [ ] 카오스 엔지니어링 적용
  - [ ] 성능 테스트 실시
```

### 실전 구현 패턴들

#### 1. 이벤트 스키마 진화 전략

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "UserRegisteredEvent",
  "type": "object",
  "properties": {
    "eventId": { "type": "string" },
    "eventType": { "const": "user.registered" },
    "eventVersion": { "enum": ["1.0", "1.1", "2.0"] },
    "timestamp": { "type": "string", "format": "date-time" },
    "data": {
      "type": "object",
      "properties": {
        "userId": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "name": { "type": "string" },
        "registrationMethod": {
          "type": "string",
          "enum": ["email", "social", "mobile"]
        },
        "referralSource": { "type": "string" },
        "initialPreferences": {
          "type": "array",
          "items": { "type": "string" }
        },
        "consentGiven": { "type": "boolean" },
        "marketingOptIn": { "type": "boolean" }
      },
      "required": ["userId", "email", "name", "registrationMethod"]
    }
  },
  "required": ["eventId", "eventType", "eventVersion", "timestamp", "data"]
}
```

#### 2. 이벤트 버전 관리

```python
class EventVersioningStrategy:
    """이벤트 스키마 버전링 전략"""
    
    def __init__(self):
        self.version_handlers = {
            "user.registered": {
                "1.0": self._handle_user_registered_v1,
                "1.1": self._handle_user_registered_v1_1,
                "2.0": self._handle_user_registered_v2
            }
        }
    
    def handle_event(self, event: StoredEvent) -> Dict[str, Any]:
        """Legacy 이벤트를 최신 버전으로 마이그레이션"""
        event_type = event.event_type
        event_version = event.metadata.event_version
        
        if event_type not in self.version_handlers:
            return event.event_data  # 알려지지 않은 이벤트
        
        version_handler = self.version_handlers[event_type].get(event_version)
        if not version_handler:
            raise UnsupportedEventVersionException(f"지원되지 않는 이벤트 버전: {event_type}:{event_version}")
        
        return version_handler(event.event_data)
    
    def _handle_user_registered_v1(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """v1.0 -> v2.0 마이그레이션"""
        # v1.0에는 consentGiven, marketingOptIn 필드가 없음
        migrated_data = data.copy()
        migrated_data['consentGiven'] = True  # 레거시 사용자는 자동 동의
        migrated_data['marketingOptIn'] = False  # 기본값
        return migrated_data
    
    def _handle_user_registered_v1_1(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """v1.1 -> v2.0 마이그레이션"""
        # v1.1에는 marketingOptIn 필드가 없음
        migrated_data = data.copy()
        if 'marketingOptIn' not in migrated_data:
            migrated_data['marketingOptIn'] = False
        return migrated_data
    
    def _handle_user_registered_v2(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """v2.0은 최신 버전이므로 변경 없음"""
        return data
```

#### 3. 이벤트 데드레터 큐 (DLQ) 관리

```python
class DeadLetterQueueManager:
    """실패한 이벤트 처리 및 복구 관리"""
    
    def __init__(self, dlq_store, retry_policy):
        self.dlq_store = dlq_store
        self.retry_policy = retry_policy
    
    async def handle_failed_event(self, event: StoredEvent, error: Exception) -> None:
        """Poison Message 처리"""
        failed_event = FailedEvent(
            original_event=event,
            error_message=str(error),
            error_type=type(error).__name__,
            failure_timestamp=datetime.utcnow(),
            retry_count=0,
            max_retry_count=self.retry_policy.max_retries
        )
        
        await self.dlq_store.store_failed_event(failed_event)
        
        # 알림 발송
        await self._notify_failed_event(failed_event)
    
    async def retry_failed_events(self) -> None:
        """실패한 이벤트들 재시도"""
        retryable_events = await self.dlq_store.get_retryable_events()
        
        for failed_event in retryable_events:
            try:
                # 재시도 지연 계산 (Exponential Backoff)
                delay = self.retry_policy.calculate_delay(failed_event.retry_count)
                
                if failed_event.next_retry_time > datetime.utcnow():
                    continue  # 아직 재시도 시간이 아님
                
                # 이벤트 재처리 시도
                await self._retry_event_processing(failed_event)
                
                # 성공 시 DLQ에서 제거
                await self.dlq_store.remove_failed_event(failed_event.id)
                
            except Exception as e:
                # 재시도 실패
                failed_event.retry_count += 1
                failed_event.last_error = str(e)
                failed_event.next_retry_time = datetime.utcnow() + timedelta(
                    seconds=self.retry_policy.calculate_delay(failed_event.retry_count)
                )
                
                if failed_event.retry_count >= failed_event.max_retry_count:
                    # 최대 재시도 횟수 초과 - Poison Message로 전환
                    await self._move_to_poison_queue(failed_event)
                else:
                    await self.dlq_store.update_failed_event(failed_event)
    
    async def _retry_event_processing(self, failed_event: FailedEvent) -> None:
        """DLQ에서 이벤트 재처리"""
        # 원래 이벤트 처리 로직 재실행
        event_processor = self._get_event_processor(failed_event.original_event.event_type)
        await event_processor.handle_event(failed_event.original_event)
    
    async def _move_to_poison_queue(self, failed_event: FailedEvent) -> None:
        """Poison Message Queue로 이동 (수동 처리 용)"""
        poison_event = PoisonEvent(
            original_event=failed_event.original_event,
            failure_history=failed_event,
            requires_manual_intervention=True
        )
        
        await self.dlq_store.store_poison_event(poison_event)
        await self.dlq_store.remove_failed_event(failed_event.id)
        
        # 고위 알림 발송
        await self._notify_poison_event(poison_event)
    
    async def _notify_failed_event(self, failed_event: FailedEvent) -> None:
        # Slack/Teams 등으로 알림 발송
        pass
    
    async def _notify_poison_event(self, poison_event: PoisonEvent) -> None:
        # 긴급 알림 - 수동 개입 필요
        pass

class RetryPolicy:
    def __init__(self, max_retries: int = 3, base_delay: float = 1.0, max_delay: float = 300.0):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
    
    def calculate_delay(self, retry_count: int) -> float:
        """Exponential Backoff with Jitter"""
        delay = min(self.base_delay * (2 ** retry_count), self.max_delay)
        # Jitter 추가 (동시 재시도 방지)
        jitter = random.uniform(0, delay * 0.1)
        return delay + jitter
```

#### 4. 이벤트 드리븐 사가 패턴

```python
class EventDrivenSaga:
    """이벤트 기반 사가 패턴 구현"""
    
    def __init__(self, saga_id: str):
        self.saga_id = saga_id
        self.current_step = 0
        self.saga_data = {}
        self.compensation_stack = []  # 보상 동작 스택
        self.is_completed = False
        self.is_compensated = False
    
    async def handle_event(self, event: StoredEvent) -> None:
        """Saga 이벤트 처리"""
        try:
            if event.event_type == "order.created":
                await self._handle_order_created(event)
            elif event.event_type == "payment.processed":
                await self._handle_payment_processed(event)
            elif event.event_type == "inventory.reserved":
                await self._handle_inventory_reserved(event)
            elif event.event_type == "shipping.scheduled":
                await self._handle_shipping_scheduled(event)
            
            # 실패 이벤트 처리
            elif event.event_type in ["payment.failed", "inventory.insufficient", "shipping.failed"]:
                await self._start_compensation(event)
                
        except Exception as e:
            await self._start_compensation(event, str(e))
    
    async def _handle_order_created(self, event: StoredEvent) -> None:
        """Step 1: 주문 생성 처리"""
        order_data = event.event_data
        self.saga_data.update(order_data)
        
        # 다음 단계: 결제 요청
        payment_command = {
            "command_type": "process_payment",
            "order_id": order_data["order_id"],
            "amount": order_data["total_amount"],
            "payment_method": order_data["payment_method"]
        }
        
        await self._send_command("payment-service", payment_command)
        
        # 보상 동작 등록
        self.compensation_stack.append({
            "action": "cancel_order",
            "data": {"order_id": order_data["order_id"]}
        })
        
        self.current_step = 1
    
    async def _handle_payment_processed(self, event: StoredEvent) -> None:
        """Step 2: 결제 완료 처리"""
        payment_data = event.event_data
        self.saga_data.update(payment_data)
        
        # 다음 단계: 재고 예약
        inventory_command = {
            "command_type": "reserve_inventory",
            "order_id": self.saga_data["order_id"],
            "items": self.saga_data["order_items"]
        }
        
        await self._send_command("inventory-service", inventory_command)
        
        # 보상 동작 등록
        self.compensation_stack.append({
            "action": "refund_payment",
            "data": {
                "payment_id": payment_data["payment_id"],
                "amount": payment_data["amount"]
            }
        })
        
        self.current_step = 2
    
    async def _handle_inventory_reserved(self, event: StoredEvent) -> None:
        """Step 3: 재고 예약 완료 처리"""
        inventory_data = event.event_data
        self.saga_data.update(inventory_data)
        
        # 다음 단계: 배송 예약
        shipping_command = {
            "command_type": "schedule_shipping",
            "order_id": self.saga_data["order_id"],
            "shipping_address": self.saga_data["shipping_address"],
            "items": self.saga_data["order_items"]
        }
        
        await self._send_command("shipping-service", shipping_command)
        
        # 보상 동작 등록
        self.compensation_stack.append({
            "action": "release_inventory",
            "data": {
                "reservation_id": inventory_data["reservation_id"]
            }
        })
        
        self.current_step = 3
    
    async def _handle_shipping_scheduled(self, event: StoredEvent) -> None:
        """Step 4: 배송 예약 완료 - Saga 성공"""
        shipping_data = event.event_data
        self.saga_data.update(shipping_data)
        
        self.is_completed = True
        self.current_step = 4
        
        # Saga 성공 이벤트 발행
        await self._publish_saga_completed_event()
    
    async def _start_compensation(self, trigger_event: StoredEvent, error_message: str = None) -> None:
        """Saga 보상 시작"""
        self.is_compensated = True
        
        # 보상 동작들을 역순으로 실행
        while self.compensation_stack:
            compensation = self.compensation_stack.pop()
            
            try:
                await self._execute_compensation(compensation)
            except Exception as e:
                # 보상 동작 실패 - 수동 개입 필요
                await self._handle_compensation_failure(compensation, str(e))
        
        # Saga 실패 이벤트 발행
        await self._publish_saga_failed_event(trigger_event, error_message)
    
    async def _execute_compensation(self, compensation: Dict[str, Any]) -> None:
        """Individual 보상 동작 실행"""
        action = compensation["action"]
        data = compensation["data"]
        
        if action == "cancel_order":
            command = {
                "command_type": "cancel_order",
                "order_id": data["order_id"],
                "reason": "saga_compensation"
            }
            await self._send_command("order-service", command)
            
        elif action == "refund_payment":
            command = {
                "command_type": "refund_payment",
                "payment_id": data["payment_id"],
                "amount": data["amount"],
                "reason": "saga_compensation"
            }
            await self._send_command("payment-service", command)
            
        elif action == "release_inventory":
            command = {
                "command_type": "release_inventory",
                "reservation_id": data["reservation_id"],
                "reason": "saga_compensation"
            }
            await self._send_command("inventory-service", command)
    
    async def _send_command(self, service: str, command: Dict[str, Any]) -> None:
        # 실제 서비스에 명령 전송
        pass
    
    async def _publish_saga_completed_event(self) -> None:
        # Saga 성공 이벤트 발행
        pass
    
    async def _publish_saga_failed_event(self, trigger_event: StoredEvent, error_message: str) -> None:
        # Saga 실패 이벤트 발행
        pass
    
    async def _handle_compensation_failure(self, compensation: Dict[str, Any], error: str) -> None:
        # 보상 동작 실패 알림
        pass
```

### 실전 모니터링 전략

```python
class EventDrivenMetrics:
    """이벤트 드리븐 시스템 메트릭 수집"""
    
    def __init__(self, metrics_collector):
        self.metrics = metrics_collector
    
    def record_event_published(self, event_type: str, success: bool) -> None:
        """Event 발행 메트릭"""
        self.metrics.counter(
            "events_published_total",
            tags={
                "event_type": event_type,
                "status": "success" if success else "failure"
            }
        ).increment()
    
    def record_event_processing_time(self, event_type: str, processing_time_ms: float) -> None:
        """Event 처리 시간 메트릭"""
        self.metrics.histogram(
            "event_processing_duration_ms",
            tags={"event_type": event_type}
        ).record(processing_time_ms)
    
    def record_event_lag(self, consumer_group: str, topic: str, lag_ms: float) -> None:
        """Event 지연 시간 메트릭"""
        self.metrics.gauge(
            "event_consumer_lag_ms",
            tags={
                "consumer_group": consumer_group,
                "topic": topic
            }
        ).set(lag_ms)
    
    def record_dlq_event(self, event_type: str, error_type: str) -> None:
        """DLQ 이벤트 메트릭"""
        self.metrics.counter(
            "dlq_events_total",
            tags={
                "event_type": event_type,
                "error_type": error_type
            }
        ).increment()
    
    def record_saga_completion(self, saga_type: str, success: bool, duration_ms: float) -> None:
        """Saga 완료 메트릭"""
        self.metrics.counter(
            "saga_completions_total",
            tags={
                "saga_type": saga_type,
                "status": "success" if success else "failure"
            }
        ).increment()
        
        self.metrics.histogram(
            "saga_duration_ms",
            tags={"saga_type": saga_type}
        ).record(duration_ms)
```

### 성능 최적화 가이드

```python
class EventPerformanceOptimizer:
    """이벤트 성능 최적화 가이드"""
    
    @staticmethod
    def optimize_kafka_producer():
        """
Kafka Producer 최적화 설정
        
        프로듀션 환경:
        - acks=all: 모든 replica가 메시지를 받을 때까지 대기
        - retries=Integer.MAX_VALUE: 무제한 재시도
        - max.in.flight.requests.per.connection=5: 성능과 순서 보장 균형
        - enable.idempotence=true: 중복 메시지 방지
        - linger.ms=100: 배치 처리를 위한 대기 시간
        - batch.size=65536: 배치 크기 (64KB)
        - compression.type=snappy: 빠른 압축
        - buffer.memory=134217728: 메모리 버퍼 (128MB)
        """
        return {
            'acks': 'all',
            'retries': 2147483647,  # Integer.MAX_VALUE
            'max.in.flight.requests.per.connection': 5,
            'enable.idempotence': True,
            'linger.ms': 100,
            'batch.size': 65536,
            'compression.type': 'snappy',
            'buffer.memory': 134217728
        }
    
    @staticmethod
    def optimize_kafka_consumer():
        """
Kafka Consumer 최적화 설정
        
        소비자 환경:
        - fetch.min.bytes=50000: 배치 처리를 위한 최소 크기 (50KB)
        - fetch.max.wait.ms=500: 최대 대기 시간
        - max.partition.fetch.bytes=1048576: 파티션별 최대 크기 (1MB)
        - session.timeout.ms=30000: 세션 타임아웃 (30s)
        - heartbeat.interval.ms=10000: 하트비트 간격 (10s)
        - max.poll.records=1000: 한 번에 가져올 레코드 수
        """
        return {
            'fetch.min.bytes': 50000,
            'fetch.max.wait.ms': 500,
            'max.partition.fetch.bytes': 1048576,
            'session.timeout.ms': 30000,
            'heartbeat.interval.ms': 10000,
            'max.poll.records': 1000,
            'auto.offset.reset': 'latest',
            'enable.auto.commit': False  # 수동 커밋 구현
        }
    
    @staticmethod
    def calculate_optimal_partition_count(throughput_per_partition_mb: float, 
                                        total_throughput_mb: float,
                                        consumer_count: int) -> int:
        """
최적 파티션 수 계산
        
        고려 사항:
        - 각 파티션의 처리량 한계
        - 컨슈머 수와 파티션 수의 비례
        - 미래 스케일 아웃 예상
        """
        # 처리량 기반 계산
        throughput_based = math.ceil(total_throughput_mb / throughput_per_partition_mb)
        
        # 컨슈머 수 기반 계산 (컨슈머보다 2배 많도록)
        consumer_based = consumer_count * 2
        
        # 더 큰 값 선택
        optimal_partitions = max(throughput_based, consumer_based)
        
        # 최소 3개, 최대 100개로 제한
        return max(3, min(optimal_partitions, 100))
```

---

## 🚀 다음 단계

Event-Driven Architecture의 기초를 탄탄히 다졌으니, 이제 더 고급 패턴들을 학습할 시간입니다.

**추천 학습 순서:**

- [16.3 CQRS와 이벤트 소싱](../03-cqrs-event-sourcing.md): 명령과 조회를 분리하고 이벤트로 상태를 관리하는 고급 아키텍처
- [16.4 Saga 패턴](../04-saga-pattern.md): 분산 트랜잭션 관리와 배상 처리
- [16.5 API Gateway 패턴](../05-api-gateway-patterns.md): 마이크로서비스 처리단과 라우팅

"이벤트는 과거에 일어난 사실입니다. 그 사실을 바탕으로 현재와 미래를 결정하는 것이 Event-Driven Architecture의 핵심입니다."

실시간으로 반응하는 시스템을 통해 사용자에게 더 나은 경험을 제공해봅시다! 🎯⚡

---

**이전**: [16.2C 이벤트 소싱 구현](02c-event-sourcing-implementation.md)
