---
tags:
  - Microservices
  - Database per Service
  - Data Consistency
  - Saga Pattern
  - Event Sourcing
---

# 16.1B2 Database per Service 패턴

## 🎯 핵심 개념

Database per Service 패턴은 각 마이크로서비스가 자신만의 전용 데이터베이스를 소유하는 설계 원칙입니다. 이 패턴을 통해 서비스 간 데이터 격리를 보장하고 독립적인 확장과 기술 선택이 가능해집니다.

## 서비스별 전용 데이터베이스 구성

### Docker Compose를 통한 멀티 데이터베이스 환경

```yaml
# 각 서비스가 자신만의 데이터베이스를 소유하는 Docker Compose 구성
version: '3.8'

services:
  # User Service with PostgreSQL
  user-service:
    image: microservices/user-service:latest
    environment:
      - DATABASE_URL=postgresql://user-db:5432/userdb
      - DATABASE_USERNAME=userservice
      - DATABASE_PASSWORD=${USER_DB_PASSWORD}
      - REDIS_URL=redis://redis-cluster:6379
    depends_on:
      - user-db
    networks:
      - user-network
      - shared-network
      
  user-db:
    image: postgres:13
    environment:
      POSTGRES_DB: userdb
      POSTGRES_USER: userservice
      POSTGRES_PASSWORD: ${USER_DB_PASSWORD}
    volumes:
      - user_data:/var/lib/postgresql/data
      - ./db-init/user-service:/docker-entrypoint-initdb.d/
    networks:
      - user-network
    # 🔒 보안: 다른 서비스에서 직접 접근 불가

  # Product Service with MongoDB (문서 지향 데이터에 적합)
  product-service:
    image: microservices/product-service:latest
    environment:
      - MONGO_URL=mongodb://product-db:27017/productdb
      - ELASTICSEARCH_URL=http://elasticsearch:9200
    depends_on:
      - product-db
      - elasticsearch
    networks:
      - product-network
      - shared-network
      
  product-db:
    image: mongo:4.4
    environment:
      MONGO_INITDB_DATABASE: productdb
      MONGO_INITDB_ROOT_USERNAME: productservice
      MONGO_INITDB_ROOT_PASSWORD: ${PRODUCT_DB_PASSWORD}
    volumes:
      - product_data:/data/db
      - ./db-init/product-service:/docker-entrypoint-initdb.d/
    networks:
      - product-network

  # Order Service with PostgreSQL (ACID 트랜잭션 필요)
  order-service:
    image: microservices/order-service:latest
    environment:
      - DATABASE_URL=postgresql://order-db:5432/orderdb
      - DATABASE_USERNAME=orderservice
      - DATABASE_PASSWORD=${ORDER_DB_PASSWORD}
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
    depends_on:
      - order-db
      - kafka-cluster
    networks:
      - order-network
      - shared-network
      
  order-db:
    image: postgres:13
    environment:
      POSTGRES_DB: orderdb
      POSTGRES_USER: orderservice
      POSTGRES_PASSWORD: ${ORDER_DB_PASSWORD}
    volumes:
      - order_data:/var/lib/postgresql/data
      - ./db-init/order-service:/docker-entrypoint-initdb.d/
    networks:
      - order-network

  # Payment Service with PostgreSQL (금융 데이터는 ACID 필수)
  payment-service:
    image: microservices/payment-service:latest
    environment:
      - DATABASE_URL=postgresql://payment-db:5432/paymentdb
      - DATABASE_USERNAME=paymentservice
      - DATABASE_PASSWORD=${PAYMENT_DB_PASSWORD}
      # 🔐 PCI DSS 컴플라이언스를 위한 추가 보안 설정
      - ENCRYPTION_KEY=${PAYMENT_ENCRYPTION_KEY}
      - HSM_ENDPOINT=${HSM_ENDPOINT}
    depends_on:
      - payment-db
    networks:
      - payment-network
      - shared-network
      
  payment-db:
    image: postgres:13
    environment:
      POSTGRES_DB: paymentdb
      POSTGRES_USER: paymentservice
      POSTGRES_PASSWORD: ${PAYMENT_DB_PASSWORD}
    volumes:
      - payment_data:/var/lib/postgresql/data
      - ./db-init/payment-service:/docker-entrypoint-initdb.d/
    # 🔐 금융 데이터 추가 보안
    security_opt:
      - no-new-privileges:true
    networks:
      - payment-network

  # Inventory Service with Redis + PostgreSQL (실시간 + 영속성)
  inventory-service:
    image: microservices/inventory-service:latest
    environment:
      - DATABASE_URL=postgresql://inventory-db:5432/inventorydb
      - REDIS_URL=redis://inventory-redis:6379
      - DATABASE_USERNAME=inventoryservice
      - DATABASE_PASSWORD=${INVENTORY_DB_PASSWORD}
    depends_on:
      - inventory-db
      - inventory-redis
    networks:
      - inventory-network
      - shared-network
      
  inventory-db:
    image: postgres:13
    environment:
      POSTGRES_DB: inventorydb
      POSTGRES_USER: inventoryservice
      POSTGRES_PASSWORD: ${INVENTORY_DB_PASSWORD}
    volumes:
      - inventory_data:/var/lib/postgresql/data
    networks:
      - inventory-network
      
  inventory-redis:
    image: redis:6-alpine
    volumes:
      - inventory_redis_data:/data
    networks:
      - inventory-network

volumes:
  user_data:
  product_data:
  order_data:
  payment_data:
  inventory_data:
  inventory_redis_data:

networks:
  user-network:
    driver: bridge
  product-network:
    driver: bridge
  order-network:
    driver: bridge
  payment-network:
    driver: bridge
  inventory-network:
    driver: bridge
  shared-network:
    driver: bridge
```

### 서비스별 데이터베이스 선택 전략

```java
// 각 서비스에 최적화된 데이터베이스 기술 선택
public class DatabaseSelectionStrategy {
    
    /*
     * 🗄️ User Service - PostgreSQL
     * - 이유: ACID 트랜잭션, 사용자 데이터 일관성 중요
     * - 특징: 관계형 데이터, 복잡한 쿼리 지원
     */
    @Entity
    @Table(name = "users")
    public class User {
        @Id
        @GeneratedValue(strategy = GenerationType.IDENTITY)
        private Long id;
        
        @Column(unique = true, nullable = false)
        private String email;
        
        @Column(nullable = false)
        private String name;
        
        // 정규화된 관계형 설계
        @OneToMany(mappedBy = "user", cascade = CascadeType.ALL)
        private List<UserPreference> preferences;
    }
    
    /*
     * 📄 Product Service - MongoDB
     * - 이유: 상품 정보는 비정형 데이터, 스키마 유연성 필요
     * - 특징: JSON 형태 저장, 빠른 읽기 성능
     */
    @Document(collection = "products")
    public class Product {
        @Id
        private String id;
        
        private String name;
        private String description;
        private BigDecimal price;
        
        // 유연한 스키마 - 카테고리별로 다른 속성
        private Map<String, Object> attributes;
        
        // 중첩 문서 - MongoDB 장점 활용
        private List<ProductImage> images;
        private List<ProductVariant> variants;
        private ProductSEO seo;
    }
    
    /*
     * 💰 Payment Service - PostgreSQL + 암호화
     * - 이유: 금융 데이터, 최고 수준의 일관성과 보안 필요
     * - 특징: ACID 보장, 감사 로그, 암호화
     */
    @Entity
    @Table(name = "payments")
    public class Payment {
        @Id
        @GeneratedValue(strategy = GenerationType.IDENTITY)
        private Long id;
        
        @Column(nullable = false)
        private String orderId;
        
        @Column(nullable = false)
        private BigDecimal amount;
        
        // 🔐 민감한 데이터 암호화
        @Convert(converter = EncryptedStringConverter.class)
        private String cardToken;
        
        // 감사 로그를 위한 불변 필드들
        @Column(nullable = false, updatable = false)
        private Instant createdAt;
        
        @Column(nullable = false, updatable = false)
        private String transactionId;
    }
    
    /*
     * 📦 Inventory Service - Redis + PostgreSQL
     * - 이유: 실시간 재고 조회 + 영속성 보장
     * - 특징: Redis(캐시), PostgreSQL(영속성)
     */
    
    // Redis에서 실시간 재고 관리
    @RedisHash("inventory")
    public class InventoryCache {
        @Id
        private String productId;
        private Integer availableQuantity;
        private Integer reservedQuantity;
        private Instant lastUpdated;
    }
    
    // PostgreSQL에서 영속성 보장
    @Entity
    @Table(name = "inventory_transactions")
    public class InventoryTransaction {
        @Id
        @GeneratedValue(strategy = GenerationType.IDENTITY)
        private Long id;
        
        private String productId;
        private Integer quantityChange;
        private TransactionType type;
        private Instant timestamp;
    }
}
```

## 데이터 일관성 보장 전략

### 1. Saga Pattern을 통한 분산 트랜잭션

```java
// 분산 환경에서의 데이터 일관성 보장 패턴

@Service
public class OrderConsistencyService {
    
    private final OrderRepository orderRepository;
    private final SagaManager sagaManager;
    private final EventStore eventStore;
    
    // Saga Pattern을 사용한 분산 트랜잭션 관리
    @Transactional
    public Order createOrderWithConsistency(CreateOrderRequest request) {
        
        // 1. 로컬 트랜잭션으로 주문 생성 (Tentative 상태)
        Order order = Order.builder()
            .userId(request.getUserId())
            .items(request.getItems())
            .status(OrderStatus.PENDING)
            .sagaId(UUID.randomUUID().toString())
            .build();
            
        order = orderRepository.save(order);
        
        // 2. Saga 시작 - 여러 서비스에 걸친 분산 트랜잭션
        CreateOrderSaga saga = CreateOrderSaga.builder()
            .orderId(order.getId())
            .userId(order.getUserId())
            .items(order.getItems())
            .totalAmount(order.getTotalAmount())
            .build();
            
        sagaManager.startSaga(saga);
        
        return order;
    }
    
    // 보상 트랜잭션 (Compensating Transaction)
    @EventHandler
    public void handleOrderCreationFailed(OrderCreationFailedEvent event) {
        try {
            Order order = orderRepository.findById(event.getOrderId())
                .orElseThrow(() -> new OrderNotFoundException());
                
            // 주문 상태를 실패로 변경
            order.markAsFailed(event.getFailureReason());
            orderRepository.save(order);
            
            // 관련 리소스 정리
            cleanupOrderResources(order);
            
            // 실패 이벤트 기록
            OrderFailureEvent failureEvent = new OrderFailureEvent(
                order.getId(),
                event.getFailureReason(),
                Instant.now()
            );
            eventStore.append(failureEvent);
            
        } catch (Exception e) {
            // 보상 트랜잭션 실패 시 알림 및 수동 처리 필요
            alertService.sendAlert("Order compensation failed", order.getId(), e);
        }
    }
    
    private void cleanupOrderResources(Order order) {
        // 예약된 재고 해제
        inventoryService.releaseReservation(order.getReservationId());
        
        // 할당된 쿠폰 복원
        couponService.restoreCoupon(order.getCouponId());
        
        // 기타 리소스 정리...
    }
}

// Saga 관리자
@Component
public class SagaManager {
    
    private final SagaRepository sagaRepository;
    private final EventPublisher eventPublisher;
    
    public void startSaga(CreateOrderSaga saga) {
        // 1. Saga 상태 저장
        sagaRepository.save(saga);
        
        // 2. 첫 번째 단계 실행: 재고 예약
        ReserveInventoryCommand command = new ReserveInventoryCommand(
            saga.getOrderId(),
            saga.getItems(),
            saga.getSagaId()
        );
        
        eventPublisher.publishCommand("inventory-service", command);
    }
    
    @EventHandler
    public void handleInventoryReserved(InventoryReservedEvent event) {
        CreateOrderSaga saga = sagaRepository.findBySagaId(event.getSagaId());
        
        if (saga != null) {
            // 다음 단계: 결제 처리
            ProcessPaymentCommand command = new ProcessPaymentCommand(
                saga.getOrderId(),
                saga.getTotalAmount(),
                saga.getSagaId()
            );
            
            eventPublisher.publishCommand("payment-service", command);
        }
    }
    
    @EventHandler
    public void handlePaymentProcessed(PaymentProcessedEvent event) {
        CreateOrderSaga saga = sagaRepository.findBySagaId(event.getSagaId());
        
        if (saga != null && event.isSuccessful()) {
            // 마지막 단계: 주문 확정
            ConfirmOrderCommand command = new ConfirmOrderCommand(
                saga.getOrderId(),
                event.getPaymentId(),
                saga.getSagaId()
            );
            
            eventPublisher.publishCommand("order-service", command);
        } else {
            // 결제 실패 시 보상 트랜잭션 시작
            startCompensation(saga, "결제 처리 실패");
        }
    }
    
    private void startCompensation(CreateOrderSaga saga, String reason) {
        // 역순으로 보상 작업 실행
        ReleaseInventoryCommand command = new ReleaseInventoryCommand(
            saga.getOrderId(),
            saga.getItems(),
            saga.getSagaId()
        );
        
        eventPublisher.publishCommand("inventory-service", command);
    }
}
```

### 2. Event Sourcing을 통한 데이터 일관성

```java
// Event Sourcing을 통한 데이터 일관성 보장
@Entity
public class OrderAggregate {
    
    @Id
    private String id;
    private Long userId;
    private OrderStatus status;
    private List<OrderItem> items;
    private BigDecimal totalAmount;
    private List<DomainEvent> uncommittedEvents;
    
    // 이벤트 스트림에서 Aggregate 재구성
    public static OrderAggregate fromHistory(List<DomainEvent> history) {
        OrderAggregate order = new OrderAggregate();
        history.forEach(event -> order.apply(event));
        order.uncommittedEvents.clear(); // 기존 이벤트는 커밋된 것으로 처리
        return order;
    }
    
    // 비즈니스 로직 실행 후 이벤트 생성
    public void createOrder(CreateOrderCommand command) {
        validateOrderCreation(command);
        
        OrderCreatedEvent event = new OrderCreatedEvent(
            command.getOrderId(),
            command.getUserId(),
            command.getItems(),
            command.getTotalAmount(),
            Instant.now()
        );
        
        apply(event);
        uncommittedEvents.add(event);
    }
    
    public void confirmPayment(String paymentId, String transactionId) {
        if (!status.canConfirmPayment()) {
            throw new InvalidOrderStateException("결제 확인할 수 없는 주문 상태: " + status);
        }
        
        PaymentConfirmedEvent event = new PaymentConfirmedEvent(
            this.id,
            paymentId,
            transactionId,
            Instant.now()
        );
        
        apply(event);
        uncommittedEvents.add(event);
    }
    
    public void shipOrder(String trackingNumber, String carrier) {
        if (!status.canShip()) {
            throw new InvalidOrderStateException("배송할 수 없는 주문 상태: " + status);
        }
        
        OrderShippedEvent event = new OrderShippedEvent(
            this.id,
            trackingNumber,
            carrier,
            Instant.now()
        );
        
        apply(event);
        uncommittedEvents.add(event);
    }
    
    // 이벤트 적용하여 상태 변경
    private void apply(DomainEvent event) {
        if (event instanceof OrderCreatedEvent) {
            OrderCreatedEvent e = (OrderCreatedEvent) event;
            this.id = e.getOrderId();
            this.userId = e.getUserId();
            this.items = e.getItems();
            this.totalAmount = e.getTotalAmount();
            this.status = OrderStatus.CREATED;
            
        } else if (event instanceof PaymentConfirmedEvent) {
            this.status = OrderStatus.PAID;
            
        } else if (event instanceof OrderShippedEvent) {
            OrderShippedEvent e = (OrderShippedEvent) event;
            this.status = OrderStatus.SHIPPED;
            
        } else if (event instanceof OrderCancelledEvent) {
            this.status = OrderStatus.CANCELLED;
        }
        // ... 다른 이벤트 처리
    }
    
    private void validateOrderCreation(CreateOrderCommand command) {
        if (command.getItems() == null || command.getItems().isEmpty()) {
            throw new InvalidOrderException("주문 항목이 없습니다");
        }
        
        if (command.getTotalAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new InvalidOrderException("주문 금액이 유효하지 않습니다");
        }
    }
    
    public List<DomainEvent> getUncommittedEvents() {
        return new ArrayList<>(uncommittedEvents);
    }
    
    public void markEventsAsCommitted() {
        uncommittedEvents.clear();
    }
}

// Event Store 구현
@Repository
public class EventStore {
    
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    
    public void append(String aggregateId, List<DomainEvent> events) {
        String sql = """
            INSERT INTO event_store (aggregate_id, event_type, event_data, version, created_at)
            VALUES (?, ?, ?, ?, ?)
            """;
            
        for (DomainEvent event : events) {
            try {
                String eventData = objectMapper.writeValueAsString(event);
                
                jdbcTemplate.update(sql,
                    aggregateId,
                    event.getClass().getSimpleName(),
                    eventData,
                    getNextVersion(aggregateId),
                    event.getOccurredAt()
                );
                
            } catch (Exception e) {
                throw new EventStoreException("이벤트 저장 실패", e);
            }
        }
    }
    
    public List<DomainEvent> getEvents(String aggregateId) {
        String sql = """
            SELECT event_type, event_data FROM event_store 
            WHERE aggregate_id = ? 
            ORDER BY version ASC
            """;
            
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            try {
                String eventType = rs.getString("event_type");
                String eventData = rs.getString("event_data");
                
                Class<?> eventClass = Class.forName("com.example.events." + eventType);
                return (DomainEvent) objectMapper.readValue(eventData, eventClass);
                
            } catch (Exception e) {
                throw new EventStoreException("이벤트 역직렬화 실패", e);
            }
        }, aggregateId);
    }
    
    private int getNextVersion(String aggregateId) {
        String sql = "SELECT COALESCE(MAX(version), 0) + 1 FROM event_store WHERE aggregate_id = ?";
        return jdbcTemplate.queryForObject(sql, Integer.class, aggregateId);
    }
}
```

### 3. 최종 일관성 (Eventual Consistency) 구현

```java
// 최종 일관성을 통한 데이터 동기화
@Component
public class EventualConsistencyHandler {
    
    private final RetryTemplate retryTemplate;
    private final DeadLetterQueueService dlqService;
    
    @KafkaListener(topics = "order.events")
    public void handleOrderEvents(String eventData) {
        retryTemplate.execute(context -> {
            try {
                processOrderEvent(eventData);
                return null;
                
            } catch (TransientException e) {
                // 일시적 오류는 재시도
                log.warn("일시적 오류 발생, 재시도 중: {}", e.getMessage());
                throw e;
                
            } catch (PermanentException e) {
                // 영구적 오류는 DLQ로 이동
                dlqService.sendToDeadLetterQueue(eventData, e);
                return null;
            }
        });
    }
    
    private void processOrderEvent(String eventData) {
        // 주문 이벤트 처리 로직
        OrderEvent event = parseEvent(eventData);
        
        switch (event.getType()) {
            case ORDER_CREATED:
                updateUserOrderHistory(event);
                updateProductStatistics(event);
                break;
                
            case ORDER_CANCELLED:
                restoreInventory(event);
                updateCancellationMetrics(event);
                break;
                
            case ORDER_COMPLETED:
                updateLoyaltyPoints(event);
                triggerRecommendations(event);
                break;
        }
    }
    
    // 보상 작업을 통한 일관성 복구
    @Scheduled(fixedDelay = 300000) // 5분마다 실행
    public void reconcileInconsistencies() {
        // 1. 데이터 불일치 탐지
        List<InconsistencyRecord> inconsistencies = detectInconsistencies();
        
        for (InconsistencyRecord record : inconsistencies) {
            try {
                // 2. 보상 작업 실행
                executeCompensation(record);
                
            } catch (Exception e) {
                log.error("보상 작업 실패: {}", record.getId(), e);
                // 수동 처리를 위한 알림
                alertService.sendAlert("Data inconsistency detected", record);
            }
        }
    }
    
    private List<InconsistencyRecord> detectInconsistencies() {
        // 서비스 간 데이터 일관성 검사
        // 예: 주문 서비스의 주문 상태와 재고 서비스의 예약 상태 비교
        return consistencyChecker.checkOrderInventoryConsistency();
    }
}
```

## 데이터베이스 마이그레이션 전략

### 점진적 마이그레이션 접근법

```java
// 모놀리식에서 마이크로서비스로의 점진적 데이터 분리
@Component
public class DatabaseMigrationStrategy {
    
    /*
     * 🔄 단계별 마이그레이션 전략
     * 
     * 1단계: 데이터베이스 복제 및 동기화
     * 2단계: 읽기 요청을 새 서비스로 라우팅
     * 3단계: 쓰기 요청을 새 서비스로 라우팅
     * 4단계: 기존 데이터베이스 정리
     */
    
    // 1단계: 데이터 복제
    @Scheduled(fixedDelay = 60000) // 1분마다 실행
    public void syncUserData() {
        try {
            // 기존 모놀리스 DB에서 변경된 사용자 데이터 조회
            List<User> changedUsers = monolithRepository.findChangedUsersSince(lastSyncTime);
            
            // 새로운 User Service DB로 동기화
            for (User user : changedUsers) {
                userServiceRepository.upsert(user);
            }
            
            lastSyncTime = Instant.now();
            
        } catch (Exception e) {
            log.error("사용자 데이터 동기화 실패", e);
            alertService.sendAlert("User data sync failed", e);
        }
    }
    
    // 2단계: 읽기 요청 라우팅
    @Component
    public class UserDataRouter {
        
        @Value("${migration.user-service.read-percentage:0}")
        private int readPercentage;
        
        public User getUserById(Long userId) {
            if (shouldRouteToNewService()) {
                try {
                    return userServiceClient.getUserById(userId);
                } catch (Exception e) {
                    // 장애 시 기존 시스템으로 폴백
                    log.warn("User service 호출 실패, 기존 시스템으로 폴백", e);
                    return monolithService.getUserById(userId);
                }
            } else {
                return monolithService.getUserById(userId);
            }
        }
        
        private boolean shouldRouteToNewService() {
            return ThreadLocalRandom.current().nextInt(100) < readPercentage;
        }
    }
    
    // 3단계: 쓰기 요청 이중화
    public User createUser(CreateUserRequest request) {
        // 기존 시스템에 저장 (안전성 보장)
        User monolithUser = monolithService.createUser(request);
        
        try {
            // 새 시스템에도 저장 (점진적 전환)
            User microserviceUser = userServiceClient.createUser(request);
            
            // 데이터 일관성 검증
            validateUserConsistency(monolithUser, microserviceUser);
            
        } catch (Exception e) {
            log.error("User Service 저장 실패, 모놀리스만 저장됨", e);
            // 비동기로 재시도
            retryUserCreation(request, monolithUser.getId());
        }
        
        return monolithUser;
    }
}
```

## 핵심 요점

### 1. 서비스별 최적화된 데이터베이스 선택

각 서비스의 데이터 특성과 요구사항에 맞는 데이터베이스 기술 선택

### 2. Saga Pattern을 통한 분산 트랜잭션

여러 서비스에 걸친 비즈니스 트랜잭션을 보상 트랜잭션과 함께 관리

### 3. Event Sourcing으로 상태 추적

모든 상태 변경을 이벤트로 기록하여 완전한 감사 추적과 복구 가능

### 4. 최종 일관성 수용

즉시 일관성 대신 최종 일관성을 통해 시스템 가용성과 확장성 확보

---

**이전**: [단일 책임 원칙](01b1-single-responsibility-principle.md)  
**다음**: [API Contract First 설계](01b3-api-contract-first.md)에서 서비스 간 계약 기반 개발을 학습합니다.
