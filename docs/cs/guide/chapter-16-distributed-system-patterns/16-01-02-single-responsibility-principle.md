---
tags:
  - domain-driven-design
  - event-driven-architecture
  - hands-on
  - intermediate
  - medium-read
  - microservices
  - service-decomposition
  - srp
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 16.1.2: 단일 책임 원칙

## 🎯 마이크로서비스에서의 SRP 적용

단일 책임 원칙은 마이크로서비스 아키텍처의 핵심 설계 원칙입니다. 각 서비스는 하나의 비즈니스 도메인에만 집중하여 높은 응집력과 낮은 결합도를 달성해야 합니다.

## 1. 잘못된 설계 패턴

### 다중 책임을 가진 서비스의 문제점

```java
// ❌ 잘못된 설계 - 하나의 서비스가 너무 많은 책임
@Service
public class UserOrderPaymentService {
    
    // 사용자 관리 책임
    public User createUser(UserRequest request) {
        // 사용자 생성 로직
        User user = new User(request);
        user = userRepository.save(user);
        
        // 이메일 검증
        emailService.sendVerificationEmail(user);
        
        // 사용자 통계 업데이트
        updateUserStatistics(user);
        
        return user;
    }
    
    public User updateUser(Long userId, UserRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException());
            
        user.updateProfile(request);
        user = userRepository.save(user);
        
        // 프로필 변경 알림
        notificationService.notifyProfileChange(user);
        
        return user;
    }
    
    // 주문 처리 책임 - 🚨 다른 도메인!
    public Order createOrder(OrderRequest request) {
        // 복잡한 주문 로직
        User user = userRepository.findById(request.getUserId())
            .orElseThrow(() -> new UserNotFoundException());
            
        // 상품 정보 조회
        List<Product> products = productRepository.findByIds(request.getProductIds());
        
        // 재고 확인
        if (!inventoryService.checkStock(request.getItems())) {
            throw new InsufficientStockException();
        }
        
        Order order = new Order(user, products, request.getItems());
        order = orderRepository.save(order);
        
        return order;
    }
    
    // 결제 처리 책임 - 🚨 또 다른 도메인!
    public Payment processPayment(PaymentRequest request) {
        // 결제 로직
        Order order = orderRepository.findById(request.getOrderId())
            .orElseThrow(() -> new OrderNotFoundException());
            
        // 결제 처리
        PaymentResult result = paymentGateway.charge(request);
        
        Payment payment = new Payment(order, result);
        payment = paymentRepository.save(payment);
        
        // 주문 상태 업데이트
        order.markAsPaid();
        orderRepository.save(order);
        
        return payment;
    }
    
    // 🚨 문제점들:
    // 1. 서로 다른 비즈니스 도메인이 하나의 서비스에!
    // 2. 하나의 도메인 변경이 다른 도메인에 영향
    // 3. 테스트의 복잡성 증가
    // 4. 팀 간 협업 충돌
    // 5. 배포 시 전체 기능에 영향
}
```

### 문제점 분석

이러한 설계는 다음과 같은 심각한 문제를 야기합니다:

#### 1. 높은 결합도

- 사용자 로직 변경 시 주문, 결제 기능에도 영향
- 하나의 버그가 전체 서비스에 전파
- 독립적인 배포 불가능

#### 2. 팀 간 협업 충돌

- 여러 팀이 같은 코드베이스 수정
- 배포 일정 조율의 복잡성
- 책임 소재 불분명

#### 3. 확장성 제약

- 부분적인 스케일링 불가능
- 전체 서비스 재시작 필요
- 리소스 낭비 발생

## 2. 올바른 설계 패턴

### 도메인별 서비스 분리

```java
// ✅ 올바른 설계 - 각 서비스는 하나의 비즈니스 기능에만 집중

@Service
public class UserService {
    
    private final UserRepository userRepository;
    private final EventPublisher eventPublisher;
    private final UserValidator userValidator;
    
    public UserService(UserRepository userRepository, 
                      EventPublisher eventPublisher,
                      UserValidator userValidator) {
        this.userRepository = userRepository;
        this.eventPublisher = eventPublisher;
        this.userValidator = userValidator;
    }
    
    public User createUser(UserRequest request) {
        // 1. 입력 검증
        userValidator.validate(request);
        
        // 2. 비즈니스 로직 실행
        User user = new User(request.getEmail(), request.getName());
        user = userRepository.save(user);
        
        // 3. 도메인 이벤트 발행 (다른 서비스에 알림)
        UserCreatedEvent event = new UserCreatedEvent(
            user.getId(), 
            user.getEmail(), 
            user.getName(),
            Instant.now()
        );
        eventPublisher.publishEvent(event);
        
        return user;
    }
    
    public User getUserById(Long userId) {
        return userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("사용자를 찾을 수 없습니다: " + userId));
    }
    
    public User updateUserProfile(Long userId, UpdateProfileRequest request) {
        User user = getUserById(userId);
        
        // 비즈니스 규칙 검증
        if (!user.canUpdateProfile()) {
            throw new ProfileUpdateNotAllowedException("프로필 업데이트가 허용되지 않습니다");
        }
        
        user.updateProfile(request.getName(), request.getPhone());
        user = userRepository.save(user);
        
        // 프로필 업데이트 이벤트 발행
        UserProfileUpdatedEvent event = new UserProfileUpdatedEvent(
            user.getId(),
            user.getName(),
            user.getPhone(),
            Instant.now()
        );
        eventPublisher.publishEvent(event);
        
        return user;
    }
    
    // 🎯 이 서비스는 오직 사용자 도메인만 담당
    // - 사용자 생성/수정/조회
    // - 사용자 검증 로직
    // - 사용자 관련 이벤트 발행
}

@Service  
public class OrderService {
    
    private final OrderRepository orderRepository;
    private final UserServiceClient userServiceClient;
    private final ProductServiceClient productServiceClient;
    private final InventoryServiceClient inventoryServiceClient;
    private final EventPublisher eventPublisher;
    
    public Order createOrder(OrderRequest request) {
        // 1. 외부 서비스 호출을 통한 데이터 조회
        User user = userServiceClient.getUserById(request.getUserId());
        if (user == null) {
            throw new UserNotFoundException("유효하지 않은 사용자 ID: " + request.getUserId());
        }
        
        // 2. 상품 정보 확인
        List<Product> products = productServiceClient.getProductsByIds(request.getProductIds());
        if (products.size() != request.getProductIds().size()) {
            throw new ProductNotFoundException("일부 상품을 찾을 수 없습니다");
        }
        
        // 3. 재고 확인 및 예약
        ReservationRequest reservationRequest = new ReservationRequest(request.getItems());
        ReservationResult reservation = inventoryServiceClient.reserveProducts(reservationRequest);
        
        if (!reservation.isSuccess()) {
            throw new InsufficientInventoryException("재고가 부족합니다: " + reservation.getFailedItems());
        }
        
        try {
            // 4. 주문 생성 - 이것만이 이 서비스의 핵심 책임
            Order order = Order.builder()
                .userId(user.getId())
                .items(request.getItems())
                .totalAmount(calculateTotalAmount(products, request.getItems()))
                .status(OrderStatus.CREATED)
                .reservationId(reservation.getReservationId())
                .build();
                
            order = orderRepository.save(order);
            
            // 5. 주문 생성 이벤트 발행
            OrderCreatedEvent event = new OrderCreatedEvent(
                order.getId(),
                order.getUserId(),
                order.getItems(),
                order.getTotalAmount(),
                Instant.now()
            );
            eventPublisher.publishEvent(event);
            
            return order;
            
        } catch (Exception e) {
            // 실패 시 재고 예약 해제
            inventoryServiceClient.releaseReservation(reservation.getReservationId());
            throw new OrderCreationException("주문 생성에 실패했습니다", e);
        }
    }
    
    private BigDecimal calculateTotalAmount(List<Product> products, List<OrderItem> items) {
        // 총 금액 계산 로직
        Map<Long, Product> productMap = products.stream()
            .collect(Collectors.toMap(Product::getId, Function.identity()));
            
        return items.stream()
            .map(item -> {
                Product product = productMap.get(item.getProductId());
                return product.getPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
            })
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    
    // 🎯 이 서비스는 오직 주문 도메인만 담당
    // - 주문 생성/수정/취소
    // - 주문 상태 관리
    // - 주문 관련 비즈니스 규칙
}

@Service
public class PaymentService {
    
    private final PaymentRepository paymentRepository;
    private final PaymentGateway paymentGateway;
    private final OrderServiceClient orderServiceClient;
    private final EventPublisher eventPublisher;
    
    public Payment processPayment(PaymentRequest request) {
        // 1. 주문 정보 확인
        Order order = orderServiceClient.getOrderById(request.getOrderId());
        if (order == null || !order.canBeProcessedForPayment()) {
            throw new InvalidOrderStateException("결제할 수 없는 주문 상태입니다");
        }
        
        // 2. 결제 정보 검증
        validatePaymentRequest(request);
        
        // 3. 외부 결제 게이트웨이 호출
        PaymentGatewayRequest gatewayRequest = PaymentGatewayRequest.builder()
            .orderId(order.getId())
            .amount(order.getTotalAmount())
            .paymentMethod(request.getPaymentMethod())
            .customerInfo(request.getCustomerInfo())
            .build();
            
        PaymentGatewayResult gatewayResult = paymentGateway.processPayment(gatewayRequest);
        
        // 4. 결제 결과 저장
        Payment payment = Payment.builder()
            .orderId(order.getId())
            .amount(order.getTotalAmount())
            .paymentMethod(request.getPaymentMethod())
            .transactionId(gatewayResult.getTransactionId())
            .status(mapGatewayStatus(gatewayResult.getStatus()))
            .processedAt(Instant.now())
            .build();
            
        payment = paymentRepository.save(payment);
        
        // 5. 결제 완료 이벤트 발행
        if (payment.isSuccessful()) {
            PaymentCompletedEvent event = new PaymentCompletedEvent(
                payment.getId(),
                payment.getOrderId(),
                payment.getAmount(),
                payment.getTransactionId(),
                Instant.now()
            );
            eventPublisher.publishEvent(event);
        }
        
        return payment;
    }
    
    private void validatePaymentRequest(PaymentRequest request) {
        if (request.getAmount() == null || request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new InvalidPaymentAmountException("결제 금액이 유효하지 않습니다");
        }
        
        if (request.getPaymentMethod() == null || !isValidPaymentMethod(request.getPaymentMethod())) {
            throw new InvalidPaymentMethodException("지원하지 않는 결제 수단입니다");
        }
    }
    
    // 🎯 이 서비스는 오직 결제 도메인만 담당
    // - 결제 처리/환불
    // - 결제 수단 관리
    // - 결제 게이트웨이 연동
}
```

## 3. 도메인 이벤트를 통한 서비스 통신

### 이벤트 기반 아키텍처 패턴

```java
// 도메인 이벤트 정의
public abstract class DomainEvent {
    private final String eventId;
    private final Instant occurredOn;
    private final String aggregateId;
    
    protected DomainEvent(String aggregateId) {
        this.eventId = UUID.randomUUID().toString();
        this.occurredOn = Instant.now();
        this.aggregateId = aggregateId;
    }
    
    // getters...
}

public class UserCreatedEvent extends DomainEvent {
    private final Long userId;
    private final String email;
    private final String name;
    
    public UserCreatedEvent(Long userId, String email, String name, Instant occurredOn) {
        super(userId.toString());
        this.userId = userId;
        this.email = email;
        this.name = name;
    }
    
    // getters...
}

// 이벤트 리스너 - 다른 서비스에서 처리
@Component
public class NotificationEventHandler {
    
    private final EmailService emailService;
    private final SmsService smsService;
    
    @EventListener
    @Async
    public void handleUserCreated(UserCreatedEvent event) {
        try {
            // 환영 이메일 발송
            emailService.sendWelcomeEmail(
                event.getEmail(), 
                event.getName()
            );
            
            // 사용자 통계 업데이트
            userStatisticsService.incrementUserCount();
            
            log.info("Welcome email sent to user: {}", event.getUserId());
            
        } catch (Exception e) {
            log.error("Failed to handle user created event: {}", event.getUserId(), e);
            // Dead Letter Queue로 이벤트 전송하여 재처리
            deadLetterPublisher.publish(event, e.getMessage());
        }
    }
    
    @EventListener
    @Async
    public void handleOrderCreated(OrderCreatedEvent event) {
        try {
            // 주문 확인 이메일 발송
            User user = userServiceClient.getUserById(event.getUserId());
            
            emailService.sendOrderConfirmation(
                user.getEmail(),
                event.getOrderId(),
                event.getItems(),
                event.getTotalAmount()
            );
            
        } catch (Exception e) {
            log.error("Failed to send order confirmation: {}", event.getOrderId(), e);
        }
    }
}
```

## 4. 서비스 경계 설정 가이드라인

### 도메인 식별 기준

#### 1. 비즈니스 능력 기반 분할

```markdown
# 전자상거래 도메인 예시

## 사용자 관리 (User Management)
- 사용자 등록/로그인
- 프로필 관리
- 권한 관리

## 상품 관리 (Product Management)
- 상품 카탈로그
- 카테고리 관리
- 상품 검색

## 주문 관리 (Order Management)
- 주문 생성/취소
- 주문 상태 추적
- 주문 이력 관리

## 결제 관리 (Payment Management)
- 결제 처리
- 환불 처리
- 결제 수단 관리

## 재고 관리 (Inventory Management)
- 재고 추적
- 재고 예약/해제
- 재고 알림
```

#### 2. 데이터 응집도 기준

```java
// 높은 데이터 응집도 - 같은 서비스
public class User {
    private Long id;
    private String email;
    private String name;
    private String phone;
    private UserProfile profile;  // 사용자와 밀접한 관계
    private UserPreferences preferences;  // 사용자 설정
}

// 낮은 데이터 응집도 - 다른 서비스
public class Order {
    private Long id;
    private Long userId;  // 외부 참조
    private List<OrderItem> items;
    private OrderStatus status;
}
```

#### 3. 변경 빈도 기준

```java
// 변경이 자주 발생하는 부분은 별도 서비스로 분리
@Service
public class PricingService {  // 가격 정책은 자주 변경
    
    public BigDecimal calculatePrice(Long productId, int quantity, String customerType) {
        Product product = productServiceClient.getProduct(productId);
        
        // 복잡한 가격 계산 로직
        BigDecimal basePrice = product.getBasePrice();
        BigDecimal discount = calculateDiscount(customerType, quantity);
        BigDecimal tax = calculateTax(basePrice, customerType);
        
        return basePrice.subtract(discount).add(tax);
    }
}
```

#### 4. 도메인 경계 식별 실전 가이드

```java
// 🎯 도메인 경계를 식별하는 질문들
public class DomainBoundaryAnalysis {
    
    /*
     * 1. 데이터 관리 책임
     * - 이 데이터의 생명주기를 누가 관리하는가?
     * - 이 데이터의 일관성 규칙은 무엇인가?
     * 
     * 2. 비즈니스 규칙 책임
     * - 이 비즈니스 규칙의 변경 주체는 누구인가?
     * - 이 규칙이 변경될 때 영향받는 다른 영역은?
     * 
     * 3. 변경 빈도 분석
     * - 이 기능은 얼마나 자주 변경되는가?
     * - 변경 이유가 다른 기능과 같은가?
     */
    
    // 예: 사용자 도메인의 명확한 책임
    public class UserDomainResponsibilities {
        // ✅ 사용자 도메인이 담당해야 할 것들
        private UserProfileManagement profileManagement;     // 프로필 관리
        private UserAuthenticationData authData;             // 인증 정보
        private UserPreferences preferences;                 // 사용자 설정
        private UserActivityTracking activityTracking;      // 활동 기록
        
        // ❌ 사용자 도메인이 담당하지 말아야 할 것들
        // private OrderHistory orderHistory;               // 주문 이력 -> Order 도메인
        // private PaymentMethods paymentMethods;           // 결제 수단 -> Payment 도메인
        // private ProductReviews productReviews;           // 상품 리뷰 -> Product 도메인
    }
}
```

#### 5. 서비스 크기 결정 기준

```java
// 적절한 서비스 크기를 판단하는 기준
public class ServiceSizingGuidelines {
    
    /*
     * 🎯 Two Pizza Team Rule
     * - 한 팀이 2개의 피자로 식사할 수 있는 크기 (6-8명)
     * - 하나의 서비스는 한 팀이 완전히 소유할 수 있어야 함
     */
    
    /*
     * 📊 메트릭 기반 판단
     * - 코드 라인: 10,000 라인 미만 권장
     * - 배포 주기: 독립적인 배포가 가능한가?
     * - 테스트 시간: 전체 테스트가 10분 이내에 완료되는가?
     */
    
    /*
     * 🔄 변경 영향도 분석
     * - 한 기능의 변경이 다른 기능에 영향을 주는가?
     * - 배포 시 전체 시스템 재시작이 필요한가?
     * - 한 부분의 장애가 전체 시스템에 영향을 주는가?
     */
    
    // 서비스 분리 신호들
    public boolean shouldSplitService() {
        return hasMultipleDataModels() ||
               hasDifferentChangeFrequencies() ||
               hasDistinctBusinessCapabilities() ||
               requiresDifferentScalingPatterns() ||
               hasDifferentTeamOwnership();
    }
}
```

## 5. 실전 적용 체크리스트

### ✅ SRP 준수 체크리스트

1.**단일 책임 확인**

- [ ] 서비스가 하나의 비즈니스 도메인만 담당하는가?
- [ ] 서비스 내 모든 클래스가 같은 변경 이유를 가지는가?
- [ ] 서비스 API가 하나의 응집된 기능 집합인가?

2.**의존성 확인**

- [ ] 다른 도메인 데이터에 직접 접근하지 않는가?
- [ ] 외부 서비스와는 이벤트나 API를 통해서만 통신하는가?
- [ ] 데이터베이스를 다른 서비스와 공유하지 않는가?

3.**확장성 확인**

- [ ] 서비스를 독립적으로 배포할 수 있는가?
- [ ] 서비스를 독립적으로 스케일링할 수 있는가?
- [ ] 하나의 서비스 장애가 다른 서비스에 영향을 주지 않는가?

## 핵심 요점

### 1. 도메인 중심 설계

각 서비스는 명확한 비즈니스 도메인 하나만 담당하여 높은 응집력을 달성합니다.

### 2. 이벤트 기반 통신

서비스 간 직접 호출 대신 도메인 이벤트를 통한 느슨한 결합을 유지합니다.

### 3. 독립적인 배포와 확장

각 서비스가 독립적으로 개발, 배포, 확장될 수 있는 구조를 만듭니다.

### 4. 팀 소유권 명확화

한 팀이 완전히 소유하고 관리할 수 있는 크기로 서비스를 설계합니다.
각 서비스가 독립적으로 개발, 배포, 확장될 수 있는 구조를 만듭니다.

---

**이전**: [설계 원칙 개요](./16-01-02-single-responsibility-principle.md)  
**다음**: [Database per Service 패턴](./16-01-04-database-per-service.md)에서 서비스별 데이터베이스 분리 전략을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 애플리케이션 개발
-**예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-16-distributed-system-patterns)

- [15.1 마이크로서비스 아키텍처 개요](../chapter-15-microservices-architecture/16-01-microservices-architecture.md)
- [15.1A 모놀리스 문제점과 전환 전략](../chapter-15-microservices-architecture/16-10-monolith-to-microservices.md)
- [16.1B 마이크로서비스 설계 원칙과 패턴 개요](./16-01-02-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-01-03-single-responsibility.md)
- [16.1B2 Database per Service 패턴](./16-01-04-database-per-service.md)

### 🏷️ 관련 키워드

`microservices`, `srp`, `domain-driven-design`, `service-decomposition`, `event-driven-architecture`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
