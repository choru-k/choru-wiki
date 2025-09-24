---
tags:
  - advanced
  - deep-study
  - event-driven
  - go-programming
  - hands-on
  - message-queue
  - publisher-subscriber
  - rabbitmq
  - 애플리케이션개발
difficulty: ADVANCED
learning_time: "16-24시간"
main_topic: "애플리케이션 개발"
priority_score: 5
---

# 16.1.7: 비동기 통신 패턴

## 🚀 이벤트 주도 아키텍처의 해답

비동기식 통신은 마이크로서비스 간 느슨한 결합을 제공하며, 시스템 확장성과 장애 배리력을 향상시킵니다. 실제 전자상거래 플랫폼에서 적용한 Go 언어 기반의 견고한 이벤트 시스템을 살펴보겠습니다.

## 도메인 이벤트 설계

### 이벤트 인터페이스와 기본 구조체

```go
// Go언어로 구현한 견고한 이벤트 기반 통신 시스템
package messaging

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "sync"
    "time"
    
    "github.com/streadway/amqp"
    "github.com/google/uuid"
)

// 도메인 이벤트 인터페이스
type DomainEvent interface {
    GetEventType() string
    GetEventID() string
    GetSource() string
    GetTimestamp() time.Time
    GetVersion() string
    GetData() interface{}
}

// 기본 이벤트 구조체
type BaseEvent struct {
    ID        string                 `json:"id"`
    Type      string                 `json:"type"`
    Source    string                 `json:"source"`
    Data      map[string]interface{} `json:"data"`
    Timestamp time.Time              `json:"timestamp"`
    Version   string                 `json:"version"`
    Metadata  map[string]string      `json:"metadata,omitempty"`
}

func (e BaseEvent) GetEventType() string    { return e.Type }
func (e BaseEvent) GetEventID() string      { return e.ID }
func (e BaseEvent) GetSource() string       { return e.Source }
func (e BaseEvent) GetTimestamp() time.Time { return e.Timestamp }
func (e BaseEvent) GetVersion() string      { return e.Version }
func (e BaseEvent) GetData() interface{}    { return e.Data }
```

### 구체적인 비즈니스 이벤트 타입

```go
// 구체적인 이벤트 타입들
type UserCreatedEvent struct {
    BaseEvent
    UserID int64  `json:"userId"`
    Email  string `json:"email"`
    Name   string `json:"name"`
}

type OrderCreatedEvent struct {
    BaseEvent
    OrderID     int64           `json:"orderId"`
    UserID      int64           `json:"userId"`
    TotalAmount float64         `json:"totalAmount"`
    Items       []OrderItem     `json:"items"`
}

type PaymentCompletedEvent struct {
    BaseEvent
    PaymentID     int64   `json:"paymentId"`
    OrderID       int64   `json:"orderId"`
    Amount        float64 `json:"amount"`
    TransactionID string  `json:"transactionId"`
}

type OrderItem struct {
    ProductID int64   `json:"productId"`
    Quantity  int     `json:"quantity"`
    Price     float64 `json:"price"`
}
```

## 이벤트 발행자(Publisher) 구현

### Publisher 설정과 연결 관리

```go
// 이벤트 발행자 구현
type EventPublisher struct {
    connection    *amqp.Connection
    channel       *amqp.Channel
    exchange      string
    confirmations chan amqp.Confirmation
    mutex         sync.RWMutex
    isConnected   bool
    config        PublisherConfig
}

type PublisherConfig struct {
    AMQPURL         string
    Exchange        string
    MaxRetries      int
    RetryDelay      time.Duration
    ConfirmTimeout  time.Duration
    ReconnectDelay  time.Duration
}

func NewEventPublisher(config PublisherConfig) (*EventPublisher, error) {
    publisher := &EventPublisher{
        exchange:      config.Exchange,
        config:        config,
        confirmations: make(chan amqp.Confirmation, 100),
    }
    
    if err := publisher.connect(); err != nil {
        return nil, fmt.Errorf("초기 연결 실패: %v", err)
    }
    
    // 연결 상태 모니터링 시작
    go publisher.monitorConnection()
    
    return publisher, nil
}
```

### 연결 및 Exchange 설정

```go
func (p *EventPublisher) connect() error {
    p.mutex.Lock()
    defer p.mutex.Unlock()
    
    // 기존 연결 정리
    if p.channel != nil {
        p.channel.Close()
    }
    if p.connection != nil {
        p.connection.Close()
    }
    
    // 새 연결 생성
    conn, err := amqp.Dial(p.config.AMQPURL)
    if err != nil {
        return fmt.Errorf("RabbitMQ 연결 실패: %v", err)
    }
    
    ch, err := conn.Channel()
    if err != nil {
        conn.Close()
        return fmt.Errorf("채널 생성 실패: %v", err)
    }
    
    // Publisher Confirm 모드 활성화 (메시지 전송 확인)
    if err := ch.Confirm(false); err != nil {
        ch.Close()
        conn.Close()
        return fmt.Errorf("Confirm 모드 활성화 실패: %v", err)
    }
    
    // Exchange 선언 (멱등성 보장)
    err = ch.ExchangeDeclare(
        p.exchange, // name
        "topic",    // type
        true,       // durable (서버 재시작 후에도 유지)
        false,      // auto-deleted
        false,      // internal
        false,      // no-wait
        amqp.Table{
            "x-message-ttl": int32(3600000), // 메시지 TTL: 1시간
        },
    )
    if err != nil {
        ch.Close()
        conn.Close()
        return fmt.Errorf("Exchange 선언 실패: %v", err)
    }
    
    // Dead Letter Exchange 선언
    dlxName := p.exchange + ".dlx"
    err = ch.ExchangeDeclare(
        dlxName,
        "direct",
        true,
        false,
        false,
        false,
        nil,
    )
    if err != nil {
        ch.Close()
        conn.Close()
        return fmt.Errorf("DLX 선언 실패: %v", err)
    }
    
    p.connection = conn
    p.channel = ch
    p.isConnected = true
    
    // Confirmation 채널 설정
    p.channel.NotifyPublish(p.confirmations)
    
    log.Printf("EventPublisher 연결 성공: %s", p.config.AMQPURL)
    return nil
}
```

### 이벤트 발행 로직

```go
func (p *EventPublisher) PublishEventWithContext(ctx context.Context, routingKey string, event DomainEvent) error {
    // 연결 상태 확인
    p.mutex.RLock()
    if !p.isConnected {
        p.mutex.RUnlock()
        return fmt.Errorf("RabbitMQ 연결이 끄어져 있습니다")
    }
    p.mutex.RUnlock()
    
    // 이벤트 데이터 직렬화
    eventData, err := json.Marshal(event)
    if err != nil {
        return fmt.Errorf("이벤트 직렬화 실패: %v", err)
    }
    
    // 메타데이터 추가
    headers := amqp.Table{
        "event-type":    event.GetEventType(),
        "event-id":      event.GetEventID(),
        "source":        event.GetSource(),
        "version":       event.GetVersion(),
        "published-at":  time.Now().Format(time.RFC3339),
    }
    
    // 트레이싱 정보 추가 (있는 경우)
    if traceID := ctx.Value("trace-id"); traceID != nil {
        headers["trace-id"] = traceID
    }
    if spanID := ctx.Value("span-id"); spanID != nil {
        headers["span-id"] = spanID
    }
    
    publishing := amqp.Publishing{
        ContentType:  "application/json",
        DeliveryMode: amqp.Persistent, // 메시지 영속화
        Timestamp:    event.GetTimestamp(),
        MessageId:    event.GetEventID(),
        Type:         event.GetEventType(),
        AppId:        event.GetSource(),
        Headers:      headers,
        Body:         eventData,
    }
    
    // 재시도 로직을 포함한 발행
    for attempt := 0; attempt <= p.config.MaxRetries; attempt++ {
        err = p.channel.Publish(
            p.exchange,   // exchange
            routingKey,   // routing key
            false,        // mandatory
            false,        // immediate
            publishing,
        )
        
        if err != nil {
            log.Printf("이벤트 발행 실패 (시도 %d/%d): %v", attempt+1, p.config.MaxRetries+1, err)
            
            if attempt < p.config.MaxRetries {
                time.Sleep(p.config.RetryDelay * time.Duration(attempt+1))
                continue
            }
            
            return fmt.Errorf("이벤트 발행 최종 실패: %v", err)
        }
        
        // Publisher Confirm 대기
        select {
        case confirmation := <-p.confirmations:
            if confirmation.Ack {
                log.Printf("이벤트 발행 확인됨: %s -> %s", event.GetEventType(), routingKey)
                return nil
            } else {
                err = fmt.Errorf("이벤트 발행이 Nack됨")
                log.Printf("이벤트 발행 Nack (시도 %d/%d): %s", attempt+1, p.config.MaxRetries+1, event.GetEventType())
            }
        case <-time.After(p.config.ConfirmTimeout):
            err = fmt.Errorf("이벤트 발행 확인 타임아웃")
            log.Printf("이벤트 발행 확인 타임아웃 (시도 %d/%d): %s", attempt+1, p.config.MaxRetries+1, event.GetEventType())
        case <-ctx.Done():
            return fmt.Errorf("컨텍스트 취소: %v", ctx.Err())
        }
        
        if attempt < p.config.MaxRetries {
            time.Sleep(p.config.RetryDelay * time.Duration(attempt+1))
        }
    }
    
    return err
}
```

## 이벤트 구독자(Subscriber) 구현

### Subscriber 설정과 연결

```go
// 이벤트 구독자 구현
type EventSubscriber struct {
    connection     *amqp.Connection
    channel        *amqp.Channel
    exchange       string
    queueName      string
    consumerTag    string
    handlers       map[string]EventHandler
    middleware     []MiddlewareFunc
    config         SubscriberConfig
    mutex          sync.RWMutex
    isConsuming    bool
    stopChan       chan struct{}
}

type EventHandler func(ctx context.Context, event DomainEvent) error
type MiddlewareFunc func(next EventHandler) EventHandler

type SubscriberConfig struct {
    AMQPURL           string
    Exchange          string
    QueueName         string
    ConsumerTag       string
    PrefetchCount     int
    AutoAck           bool
    ReconnectDelay    time.Duration
    MaxRetries        int
    RetryDelay        time.Duration
}

func NewEventSubscriber(config SubscriberConfig) (*EventSubscriber, error) {
    subscriber := &EventSubscriber{
        exchange:    config.Exchange,
        queueName:   config.QueueName,
        consumerTag: config.ConsumerTag,
        handlers:    make(map[string]EventHandler),
        config:      config,
        stopChan:    make(chan struct{}),
    }
    
    if err := subscriber.connect(); err != nil {
        return nil, fmt.Errorf("초기 연결 실패: %v", err)
    }
    
    return subscriber, nil
}
```

### 큐 설정과 핸들러 등록

```go
func (s *EventSubscriber) connect() error {
    s.mutex.Lock()
    defer s.mutex.Unlock()
    
    // 기존 연결 정리
    if s.channel != nil {
        s.channel.Close()
    }
    if s.connection != nil {
        s.connection.Close()
    }
    
    conn, err := amqp.Dial(s.config.AMQPURL)
    if err != nil {
        return fmt.Errorf("RabbitMQ 연결 실패: %v", err)
    }
    
    ch, err := conn.Channel()
    if err != nil {
        conn.Close()
        return fmt.Errorf("채널 생성 실패: %v", err)
    }
    
    // QoS 설정 - 한 번에 처리할 메시지 수 제한
    err = ch.Qos(s.config.PrefetchCount, 0, false)
    if err != nil {
        ch.Close()
        conn.Close()
        return fmt.Errorf("QoS 설정 실패: %v", err)
    }
    
    // 큐 선언
    args := amqp.Table{
        "x-dead-letter-exchange": s.exchange + ".dlx",
        "x-message-ttl":          int32(3600000), // 1시간
        "x-max-retries":          int32(s.config.MaxRetries),
    }
    
    _, err = ch.QueueDeclare(
        s.queueName, // name
        true,        // durable
        false,       // delete when unused
        false,       // exclusive
        false,       // no-wait
        args,        // arguments
    )
    if err != nil {
        ch.Close()
        conn.Close()
        return fmt.Errorf("큐 선언 실패: %v", err)
    }
    
    s.connection = conn
    s.channel = ch
    
    log.Printf("EventSubscriber 연결 성공: %s", s.config.AMQPURL)
    return nil
}

func (s *EventSubscriber) RegisterHandler(routingKey string, handler EventHandler) error {
    s.mutex.Lock()
    defer s.mutex.Unlock()
    
    // 큐를 Exchange에 바인딩
    err := s.channel.QueueBind(
        s.queueName, // queue name
        routingKey,  // routing key
        s.exchange,  // exchange
        false,       // no-wait
        nil,         // arguments
    )
    if err != nil {
        return fmt.Errorf("큐 바인딩 실패: %v", err)
    }
    
    // 미들웨어 적용
    wrappedHandler := handler
    for i := len(s.middleware) - 1; i >= 0; i-- {
        wrappedHandler = s.middleware[i](wrappedHandler)
    }
    
    s.handlers[routingKey] = wrappedHandler
    log.Printf("이벤트 핸들러 등록: %s -> %s", routingKey, s.queueName)
    return nil
}

func (s *EventSubscriber) AddMiddleware(middleware MiddlewareFunc) {
    s.mutex.Lock()
    defer s.mutex.Unlock()
    s.middleware = append(s.middleware, middleware)
}
```

### 메시지 처리와 재시도 로직

```go
func (s *EventSubscriber) StartConsuming() error {
    s.mutex.Lock()
    if s.isConsuming {
        s.mutex.Unlock()
        return fmt.Errorf("이미 구독 중입니다")
    }
    s.isConsuming = true
    s.mutex.Unlock()
    
    msgs, err := s.channel.Consume(
        s.queueName,     // queue
        s.consumerTag,   // consumer
        s.config.AutoAck, // auto-ack
        false,           // exclusive
        false,           // no-local
        false,           // no-wait
        nil,             // args
    )
    if err != nil {
        s.mutex.Lock()
        s.isConsuming = false
        s.mutex.Unlock()
        return fmt.Errorf("메시지 구독 시작 실패: %v", err)
    }
    
    log.Printf("이벤트 구독 시작: %s", s.queueName)
    
    // 메시지 처리 고루틴
    go func() {
        for {
            select {
            case <-s.stopChan:
                log.Printf("이벤트 구독 중단: %s", s.queueName)
                return
                
            case delivery := <-msgs:
                // 메시지 처리
                go s.handleMessage(delivery)
            }
        }
    }()
    
    return nil
}

func (s *EventSubscriber) handleMessage(delivery amqp.Delivery) {
    // 컨텍스트 생성 (트레이싱 정보 포함)
    ctx := context.Background()
    if traceID, ok := delivery.Headers["trace-id"]; ok {
        ctx = context.WithValue(ctx, "trace-id", traceID)
    }
    if spanID, ok := delivery.Headers["span-id"]; ok {
        ctx = context.WithValue(ctx, "span-id", spanID)
    }
    
    // 이벤트 역직렬화
    var baseEvent BaseEvent
    err := json.Unmarshal(delivery.Body, &baseEvent)
    if err != nil {
        log.Printf("이벤트 역직렬화 실패: %v", err)
        delivery.Nack(false, false) // DLQ로 전송
        return
    }
    
    // 라우팅 키로 핸들러 찾기
    s.mutex.RLock()
    handler, exists := s.handlers[delivery.RoutingKey]
    s.mutex.RUnlock()
    
    if !exists {
        log.Printf("핸들러가 없는 라우팅 키: %s", delivery.RoutingKey)
        delivery.Ack(false)
        return
    }
    
    // 구체적인 이벤트 타입으로 변환
    domainEvent := s.deserializeEvent(baseEvent)
    
    // 이벤트 처리
    err = handler(ctx, domainEvent)
    if err != nil {
        log.Printf("이벤트 처리 실패: %v", err)
        
        // 재시도 횟수 확인
        retryCount := s.getRetryCount(delivery.Headers)
        if retryCount < s.config.MaxRetries {
            // 재시도
            s.requeueMessage(delivery, retryCount+1)
        } else {
            // DLQ로 전송
            delivery.Nack(false, false)
        }
    } else {
        log.Printf("이벤트 처리 완료: %s", baseEvent.Type)
        delivery.Ack(false)
    }
}

func (s *EventSubscriber) deserializeEvent(baseEvent BaseEvent) DomainEvent {
    // 이벤트 타입에 따른 구체적인 구조체 생성
    switch baseEvent.Type {
    case "user.created":
        var event UserCreatedEvent
        json.Unmarshal([]byte(fmt.Sprintf("%v", baseEvent.Data)), &event)
        event.BaseEvent = baseEvent
        return event
        
    case "order.created":
        var event OrderCreatedEvent
        json.Unmarshal([]byte(fmt.Sprintf("%v", baseEvent.Data)), &event)
        event.BaseEvent = baseEvent
        return event
        
    case "payment.completed":
        var event PaymentCompletedEvent
        json.Unmarshal([]byte(fmt.Sprintf("%v", baseEvent.Data)), &event)
        event.BaseEvent = baseEvent
        return event
        
    default:
        return baseEvent
    }
}

func (s *EventSubscriber) getRetryCount(headers amqp.Table) int {
    if retryCount, ok := headers["retry-count"]; ok {
        if count, ok := retryCount.(int32); ok {
            return int(count)
        }
    }
    return 0
}

func (s *EventSubscriber) requeueMessage(delivery amqp.Delivery, retryCount int) {
    // 재시도 카운트를 헤더에 추가
    headers := delivery.Headers
    if headers == nil {
        headers = make(amqp.Table)
    }
    headers["retry-count"] = int32(retryCount)
    
    // 지연 후 재큐잉을 위해 별도 큐 사용 (선택적)
    delay := time.Duration(retryCount) * s.config.RetryDelay
    time.Sleep(delay)
    
    delivery.Nack(false, true) // requeue
}
```

## 사용 예제 및 미들웨어 적용

### 전체 시스템 설정

```go
// 사용 예제
func main() {
    // 이벤트 발행자 생성
    publisher, err := NewEventPublisher(PublisherConfig{
        AMQPURL:        "amqp://localhost:5672",
        Exchange:       "ecommerce.events",
        MaxRetries:     3,
        RetryDelay:     time.Second,
        ConfirmTimeout: time.Second * 5,
        ReconnectDelay: time.Second * 10,
    })
    if err != nil {
        log.Fatal("Publisher 생성 실패:", err)
    }
    defer publisher.Close()
    
    // 사용자 생성 이벤트 발행
    userCreatedEvent := UserCreatedEvent{
        BaseEvent: BaseEvent{
            ID:        uuid.New().String(),
            Type:      "user.created",
            Source:    "user-service",
            Timestamp: time.Now(),
            Version:   "1.0",
        },
        UserID: 12345,
        Email:  "john@example.com",
        Name:   "John Doe",
    }
    
    err = publisher.PublishEvent("user.created", userCreatedEvent)
    if err != nil {
        log.Fatal("이벤트 발행 실패:", err)
    }
    
    // 이벤트 구독자 생성
    subscriber, err := NewEventSubscriber(SubscriberConfig{
        AMQPURL:        "amqp://localhost:5672",
        Exchange:       "ecommerce.events",
        QueueName:      "order-service-queue",
        ConsumerTag:    "order-service-consumer",
        PrefetchCount:  10,
        AutoAck:        false,
        ReconnectDelay: time.Second * 10,
        MaxRetries:     3,
        RetryDelay:     time.Second * 2,
    })
    if err != nil {
        log.Fatal("Subscriber 생성 실패:", err)
    }
    defer subscriber.Close()
    
    // 미들웨어 추가 (로깅, 메트릭 등)
    subscriber.AddMiddleware(loggingMiddleware)
    subscriber.AddMiddleware(metricsMiddleware)
    subscriber.AddMiddleware(tracingMiddleware)
    
    // 사용자 생성 이벤트 핸들러 등록
    subscriber.RegisterHandler("user.created", func(ctx context.Context, event DomainEvent) error {
        userEvent, ok := event.(UserCreatedEvent)
        if !ok {
            return fmt.Errorf("잘못된 이벤트 타입")
        }
        
        log.Printf("새 사용자 생성됨: ID=%d, Email=%s", userEvent.UserID, userEvent.Email)
        
        // 비즈니스 로직 실행 (예: 기본 장바구니 생성)
        err := createDefaultCartForUser(userEvent.UserID)
        if err != nil {
            return fmt.Errorf("기본 장바구니 생성 실패: %v", err)
        }
        
        return nil
    })
    
    // 구독 시작
    err = subscriber.StartConsuming()
    if err != nil {
        log.Fatal("구독 시작 실패:", err)
    }
    
    // 프로그램이 종료되지 않도록 대기
    select {}
}
```

## 핵심 요점

### 1. 메시지 전달 보장

Publisher Confirm, 재시도, Dead Letter Queue를 통한 신뢰성 있는 메시지 전달

### 2. 자동 연결 복구

연결 단절 감지와 자동 재연결을 통한 시스템 안정성 확보

### 3. 이벤트 역직렬화 및 미들웨어

타입 안전성과 확장 가능한 이벤트 처리 파이프라인

### 4. 실전 운영 고려사항

트레이싱, 메트릭, 에러 처리, 성능 튜닝 등 프로덕션 환경 대비

---

**이전**: [동기식 통신 - REST API와 Circuit Breaker](./16-01-06-synchronous-communication.md)  
**다음**: [통신 패턴 선택과 실전 최적화](./16-07-02-communication-patterns-best-practices.md)에서 전체 통신 전략을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: ADVANCED
-**주제**: 애플리케이션 개발
-**예상 시간**: 16-24시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-16-distributed-system-patterns)

- [15.1 마이크로서비스 아키텍처 개요](../chapter-15-microservices-architecture/16-01-microservices-architecture.md)
- [15.1A 모놀리스 문제점과 전환 전략](../chapter-15-microservices-architecture/16-10-monolith-to-microservices.md)
- [16.1B 마이크로서비스 설계 원칙과 패턴 개요](./16-01-02-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-01-02-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-01-03-single-responsibility.md)

### 🏷️ 관련 키워드

`event-driven`, `message-queue`, `rabbitmq`, `go-programming`, `publisher-subscriber`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
