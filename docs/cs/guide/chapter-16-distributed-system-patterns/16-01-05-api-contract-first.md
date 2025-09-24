---
tags:
  - API Contract
  - API Versioning
  - Contract Testing
  - Microservices
  - OpenAPI 3.0
  - deep-study
  - hands-on
  - intermediate
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "6-8시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 16.1.5: API 계약 우선 설계

## 🎯 핵심 개념

API Contract First 설계는 서비스 구현 전에 API 계약을 먼저 정의하는 접근법입니다. 이를 통해 팀 간 독립적인 개발이 가능하고, 명확한 서비스 인터페이스를 통해 안정적인 마이크로서비스 통합을 달성할 수 있습니다.

## OpenAPI 3.0 스펙을 통한 API 계약 정의

### 실제 User Service API 스펙 예시

```yaml
# user-service-api.yaml - 실제 사용했던 User Service API 스펙
openapi: 3.0.0
info:
  title: User Service API
  version: 1.2.0
  description: |
    사용자 관리 마이크로서비스 API
    
    이 API는 사용자의 생성, 조회, 수정, 삭제와 관련된 모든 기능을 제공합니다.
    JWT 기반 인증을 사용하며, 모든 응답은 JSON 형태로 제공됩니다.
    
    ## 인증
    모든 API 호출에는 Authorization 헤더에 Bearer 토큰이 필요합니다.
    ```
    Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    ```
    
    ## 에러 처리
    HTTP 상태 코드와 함께 상세한 에러 정보를 제공합니다.
    
  contact:
    name: User Service Team
    email: user-service-team@company.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT
    
servers:
  - url: https://api.ecommerce.com/users/v1
    description: Production server
  - url: https://staging-api.ecommerce.com/users/v1
    description: Staging server
  - url: https://dev-api.ecommerce.com/users/v1
    description: Development server

paths:
  /users:
    post:
      summary: 새 사용자 생성
      description: |
        새로운 사용자 계정을 생성합니다. 이메일 중복 검사를 수행하며,
        성공적으로 생성된 경우 이메일 인증 링크가 발송됩니다.
      operationId: createUser
      tags:
        - User Management
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
            examples:
              basic:
                summary: 기본 사용자 생성
                value:
                  email: "john@example.com"
                  name: "John Doe"
                  phone: "+82-10-1234-5678"
                  password: "securePassword123!"
              minimal:
                summary: 필수 정보만 포함
                value:
                  email: "jane@example.com"
                  name: "Jane Smith"
                  password: "anotherSecurePass456!"
                  
      responses:
        '201':
          description: 사용자 생성 성공
          headers:
            Location:
              description: 생성된 사용자 리소스 URL
              schema:
                type: string
                example: /users/12345
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
              example:
                id: 12345
                email: "john@example.com"
                name: "John Doe"
                phone: "+82-10-1234-5678"
                emailVerified: false
                createdAt: "2023-10-15T14:30:00Z"
                updatedAt: "2023-10-15T14:30:00Z"
                
        '400':
          description: 잘못된 요청 (유효성 검사 실패)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ValidationError'
              examples:
                emailInvalid:
                  summary: 잘못된 이메일 형식
                  value:
                    error: "VALIDATION_ERROR"
                    message: "요청 데이터가 유효하지 않습니다"
                    details:
                      - field: "email"
                        message: "이메일 형식이 올바르지 않습니다"
                        rejectedValue: "invalid-email"
                passwordWeak:
                  summary: 약한 비밀번호
                  value:
                    error: "VALIDATION_ERROR"
                    message: "비밀번호가 보안 요구사항을 충족하지 않습니다"
                    details:
                      - field: "password"
                        message: "비밀번호는 최소 8자리여야 하며, 대소문자, 숫자, 특수문자를 포함해야 합니다"
                        
        '409':
          description: 이메일 중복
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                error: "EMAIL_ALREADY_EXISTS"
                message: "이미 존재하는 이메일입니다"
                timestamp: "2023-10-15T14:30:00Z"
                path: "/users"
                
        '429':
          description: 요청 한도 초과
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                error: "RATE_LIMIT_EXCEEDED"
                message: "요청 한도를 초과했습니다. 1분 후에 다시 시도해주세요"
                
    get:
      summary: 사용자 목록 조회 (관리자 전용)
      description: 페이지네이션을 지원하는 사용자 목록을 조회합니다.
      operationId: getUsers
      tags:
        - User Management
      security:
        - bearerAuth: []
      parameters:
        - name: page
          in: query
          description: 페이지 번호 (0부터 시작)
          required: false
          schema:
            type: integer
            minimum: 0
            default: 0
        - name: size
          in: query
          description: 페이지 크기
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: sort
          in: query
          description: 정렬 기준 (field,direction 형태)
          required: false
          schema:
            type: string
            enum: ["createdAt,desc", "createdAt,asc", "name,asc", "name,desc"]
            default: "createdAt,desc"
        - name: search
          in: query
          description: 검색어 (이름 또는 이메일)
          required: false
          schema:
            type: string
            maxLength: 100
            
      responses:
        '200':
          description: 사용자 목록 조회 성공
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PagedUsers'
                
        '403':
          description: 관리자 권한 필요
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /users/{userId}:
    get:
      summary: 사용자 정보 조회
      description: 특정 사용자의 상세 정보를 조회합니다.
      operationId: getUserById
      tags:
        - User Management
      security:
        - bearerAuth: []
      parameters:
        - name: userId
          in: path
          required: true
          description: 사용자 ID
          schema:
            type: integer
            format: int64
            minimum: 1
          example: 12345
          
      responses:
        '200':
          description: 사용자 정보 조회 성공
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
                
        '404':
          description: 사용자를 찾을 수 없음
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              example:
                error: "USER_NOT_FOUND"
                message: "사용자를 찾을 수 없습니다"
                
        '403':
          description: 접근 권한 없음
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
                
    put:
      summary: 사용자 정보 수정
      description: 기존 사용자의 정보를 수정합니다.
      operationId: updateUser
      tags:
        - User Management
      security:
        - bearerAuth: []
      parameters:
        - name: userId
          in: path
          required: true
          schema:
            type: integer
            format: int64
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateUserRequest'
              
      responses:
        '200':
          description: 사용자 정보 수정 성공
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
                
        '400':
          $ref: '#/components/responses/ValidationError'
        '404':
          $ref: '#/components/responses/UserNotFound'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      
  schemas:
    User:
      type: object
      required:
        - id
        - email
        - name
        - emailVerified
        - createdAt
        - updatedAt
      properties:
        id:
          type: integer
          format: int64
          description: 사용자 고유 ID
          example: 12345
        email:
          type: string
          format: email
          description: 사용자 이메일 주소
          example: "john@example.com"
        name:
          type: string
          minLength: 2
          maxLength: 100
          description: 사용자 이름
          example: "John Doe"
        phone:
          type: string
          pattern: '^\+82-10-\d{4}-\d{4}$'
          description: 휴대폰 번호 (한국 형식)
          example: "+82-10-1234-5678"
          nullable: true
        emailVerified:
          type: boolean
          description: 이메일 인증 여부
          example: true
        profileImageUrl:
          type: string
          format: uri
          description: 프로필 이미지 URL
          example: "https://cdn.example.com/profiles/12345.jpg"
          nullable: true
        lastLoginAt:
          type: string
          format: date-time
          description: 마지막 로그인 시간
          example: "2023-10-15T08:30:00Z"
          nullable: true
        createdAt:
          type: string
          format: date-time
          description: 계정 생성 시간
          example: "2023-10-15T14:30:00Z"
        updatedAt:
          type: string
          format: date-time
          description: 정보 수정 시간
          example: "2023-10-15T14:30:00Z"
          
    CreateUserRequest:
      type: object
      required:
        - email
        - name
        - password
      properties:
        email:
          type: string
          format: email
          description: 사용자 이메일 주소
          example: "john@example.com"
        name:
          type: string
          minLength: 2
          maxLength: 100
          description: 사용자 이름
          example: "John Doe"
        phone:
          type: string
          pattern: '^\+82-10-\d{4}-\d{4}$'
          description: 휴대폰 번호
          example: "+82-10-1234-5678"
        password:
          type: string
          minLength: 8
          maxLength: 100
          description: |
            비밀번호 (최소 8자리, 대소문자, 숫자, 특수문자 포함)
          example: "securePassword123!"
          format: password
          
    UpdateUserRequest:
      type: object
      properties:
        name:
          type: string
          minLength: 2
          maxLength: 100
        phone:
          type: string
          pattern: '^\+82-10-\d{4}-\d{4}$'
          nullable: true
        profileImageUrl:
          type: string
          format: uri
          nullable: true
          
    PagedUsers:
      type: object
      properties:
        content:
          type: array
          items:
            $ref: '#/components/schemas/User'
        totalElements:
          type: integer
          format: int64
          description: 전체 사용자 수
        totalPages:
          type: integer
          description: 전체 페이지 수
        size:
          type: integer
          description: 페이지 크기
        number:
          type: integer
          description: 현재 페이지 번호
        first:
          type: boolean
          description: 첫 페이지 여부
        last:
          type: boolean
          description: 마지막 페이지 여부
          
    Error:
      type: object
      required:
        - error
        - message
        - timestamp
        - path
      properties:
        error:
          type: string
          description: 에러 코드
          example: "USER_NOT_FOUND"
        message:
          type: string
          description: 사용자 친화적 에러 메시지
          example: "사용자를 찾을 수 없습니다"
        timestamp:
          type: string
          format: date-time
          description: 에러 발생 시간
          example: "2023-10-15T14:30:00Z"
        path:
          type: string
          description: 에러가 발생한 API 경로
          example: "/users/12345"
        traceId:
          type: string
          description: 분산 트레이싱 ID
          example: "abc123def456"
          
    ValidationError:
      allOf:
        - $ref: '#/components/schemas/Error'
        - type: object
          properties:
            details:
              type: array
              items:
                type: object
                properties:
                  field:
                    type: string
                    description: 유효성 검사 실패 필드
                  message:
                    type: string
                    description: 필드별 에러 메시지
                  rejectedValue:
                    description: 거부된 입력값
                    
  responses:
    ValidationError:
      description: 요청 데이터 유효성 검사 실패
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ValidationError'
            
    UserNotFound:
      description: 사용자를 찾을 수 없음
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            error: "USER_NOT_FOUND"
            message: "사용자를 찾을 수 없습니다"
```

## API Contract First 개발 프로세스

### 1. 계약 정의 단계

```yaml
# 팀 간 협업을 위한 계약 정의 프로세스
API_Contract_Development_Process:
  
  # 1단계: 요구사항 수집 및 분석
  requirements_gathering:
    stakeholders:
      - Product Manager: 비즈니스 요구사항 정의
      - Frontend Team: UI/UX 관점의 API 요구사항
      - Mobile Team: 모바일 앱 특화 요구사항
      - Backend Team: 기술적 제약사항 및 가능성
    deliverables:
      - API 요구사항 명세서
      - 사용자 시나리오 정의
      - 데이터 모델 초안
      
  # 2단계: API 계약 설계
  contract_design:
    activities:
      - RESTful API 원칙 적용
      - 리소스 및 엔드포인트 설계
      - 요청/응답 스키마 정의
      - 에러 처리 표준화
    tools:
      - Swagger Editor
      - Postman
      - API Blueprint
    review_process:
      - Peer Review: 팀 내 코드 리뷰
      - Cross-team Review: 다른 팀과의 인터페이스 검토
      - Architecture Review: 전체 시스템 아키텍처 관점 검토
      
  # 3단계: 목 서비스 생성
  mock_service_creation:
    purpose:
      - 프론트엔드 팀의 병렬 개발 지원
      - 통합 테스트 환경 제공
      - API 사용성 검증
    implementation:
      - Prism: OpenAPI 스펙 기반 목 서버
      - JSON Server: 간단한 REST API 목 서버
      - WireMock: 고급 목 서비스 기능
```

### 2. 코드 생성 및 검증

```java
// OpenAPI 스펙에서 자동 생성된 클라이언트 코드 예시
@Component
public class UserServiceClient {
    
    private final UserApi userApi;
    private final RetryTemplate retryTemplate;
    private final CircuitBreaker circuitBreaker;
    
    public UserServiceClient(UserApi userApi, 
                           RetryTemplate retryTemplate,
                           CircuitBreaker circuitBreaker) {
        this.userApi = userApi;
        this.retryTemplate = retryTemplate;
        this.circuitBreaker = circuitBreaker;
    }
    
    // 스펙에서 자동 생성된 메서드를 래핑하여 안정성 추가
    public User getUserById(Long userId) {
        return circuitBreaker.executeSupplier(() -> 
            retryTemplate.execute(context -> {
                try {
                    ApiResponse<User> response = userApi.getUserByIdWithHttpInfo(userId);
                    
                    if (response.getStatusCode() == 200) {
                        return response.getData();
                    } else if (response.getStatusCode() == 404) {
                        throw new UserNotFoundException("사용자를 찾을 수 없습니다: " + userId);
                    } else {
                        throw new UserServiceException("사용자 조회 실패: " + response.getStatusCode());
                    }
                    
                } catch (ApiException e) {
                    if (e.getCode() == 404) {
                        throw new UserNotFoundException("사용자를 찾을 수 없습니다: " + userId);
                    } else {
                        throw new UserServiceException("API 호출 실패", e);
                    }
                }
            })
        );
    }
    
    public User createUser(CreateUserRequest request) {
        return circuitBreaker.executeSupplier(() -> 
            retryTemplate.execute(context -> {
                try {
                    // 요청 검증 (스펙 기반)
                    validateCreateUserRequest(request);
                    
                    ApiResponse<User> response = userApi.createUserWithHttpInfo(request);
                    
                    if (response.getStatusCode() == 201) {
                        return response.getData();
                    } else {
                        throw new UserServiceException("사용자 생성 실패: " + response.getStatusCode());
                    }
                    
                } catch (ApiException e) {
                    handleApiException(e);
                    throw new UserServiceException("사용자 생성 API 호출 실패", e);
                }
            })
        );
    }
    
    private void validateCreateUserRequest(CreateUserRequest request) {
        if (request.getEmail() == null || !isValidEmail(request.getEmail())) {
            throw new InvalidRequestException("유효하지 않은 이메일 주소입니다");
        }
        
        if (request.getName() == null || request.getName().trim().isEmpty()) {
            throw new InvalidRequestException("사용자 이름은 필수입니다");
        }
        
        if (request.getPassword() == null || !isValidPassword(request.getPassword())) {
            throw new InvalidRequestException("비밀번호가 보안 요구사항을 충족하지 않습니다");
        }
    }
    
    private void handleApiException(ApiException e) {
        switch (e.getCode()) {
            case 400:
                throw new InvalidRequestException("잘못된 요청: " + e.getResponseBody());
            case 409:
                throw new UserAlreadyExistsException("이미 존재하는 이메일입니다");
            case 429:
                throw new RateLimitExceededException("요청 한도를 초과했습니다");
            default:
                log.error("예상하지 못한 API 에러: {}", e.getCode(), e);
        }
    }
}
```

### 3. 계약 테스트 (Contract Testing)

```java
// Pact를 사용한 계약 테스트 예시
@ExtendWith(PactConsumerTestExt.class)
@PactTestFor(providerName = "user-service")
public class UserServiceContractTest {
    
    @Pact(consumer = "order-service")
    public RequestResponsePact getUserByIdContract(PactDslWithProvider builder) {
        return builder
            .given("사용자 ID 12345가 존재함")
            .uponReceiving("사용자 정보 조회 요청")
            .path("/users/12345")
            .method("GET")
            .headers("Authorization", "Bearer valid-token")
            .willRespondWith()
            .status(200)
            .headers(Map.of("Content-Type", "application/json"))
            .body(new PactDslJsonBody()
                .integerType("id", 12345)
                .stringType("email", "john@example.com")
                .stringType("name", "John Doe")
                .stringType("phone", "+82-10-1234-5678")
                .booleanType("emailVerified", true)
                .datetime("createdAt", "yyyy-MM-dd'T'HH:mm:ss'Z'")
                .datetime("updatedAt", "yyyy-MM-dd'T'HH:mm:ss'Z'")
            )
            .toPact();
    }
    
    @Test
    @PactTestFor(pactMethod = "getUserByIdContract")
    void testGetUserById(MockServer mockServer) {
        // 목 서버 URL로 클라이언트 설정
        UserServiceClient client = new UserServiceClient(mockServer.getUrl());
        
        // 계약에 정의된 대로 동작하는지 검증
        User user = client.getUserById(12345L);
        
        assertThat(user.getId()).isEqualTo(12345L);
        assertThat(user.getEmail()).isEqualTo("john@example.com");
        assertThat(user.getName()).isEqualTo("John Doe");
        assertThat(user.isEmailVerified()).isTrue();
    }
    
    @Pact(consumer = "order-service")
    public RequestResponsePact getUserNotFoundContract(PactDslWithProvider builder) {
        return builder
            .given("사용자 ID 99999가 존재하지 않음")
            .uponReceiving("존재하지 않는 사용자 조회 요청")
            .path("/users/99999")
            .method("GET")
            .headers("Authorization", "Bearer valid-token")
            .willRespondWith()
            .status(404)
            .headers(Map.of("Content-Type", "application/json"))
            .body(new PactDslJsonBody()
                .stringType("error", "USER_NOT_FOUND")
                .stringType("message", "사용자를 찾을 수 없습니다")
                .datetime("timestamp", "yyyy-MM-dd'T'HH:mm:ss'Z'")
                .stringType("path", "/users/99999")
            )
            .toPact();
    }
    
    @Test
    @PactTestFor(pactMethod = "getUserNotFoundContract")
    void testGetUserByIdNotFound(MockServer mockServer) {
        UserServiceClient client = new UserServiceClient(mockServer.getUrl());
        
        assertThatThrownBy(() -> client.getUserById(99999L))
            .isInstanceOf(UserNotFoundException.class)
            .hasMessageContaining("사용자를 찾을 수 없습니다");
    }
}

// Provider 측 계약 검증 테스트
@ExtendWith(SpringExtension.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Provider("user-service")
@PactFolder("pacts")
public class UserServiceProviderContractTest {
    
    @LocalServerPort
    private int port;
    
    @Autowired
    private UserRepository userRepository;
    
    @TestTemplate
    @ExtendWith(PactVerificationInvocationContextProvider.class)
    void pactVerificationTestTemplate(PactVerificationContext context) {
        context.verifyInteraction();
    }
    
    @BeforeEach
    void before(PactVerificationContext context) {
        context.setTarget(new HttpTestTarget("localhost", port, "/"));
    }
    
    @State("사용자 ID 12345가 존재함")
    void userExists() {
        // 테스트 데이터 설정
        User testUser = User.builder()
            .id(12345L)
            .email("john@example.com")
            .name("John Doe")
            .phone("+82-10-1234-5678")
            .emailVerified(true)
            .createdAt(Instant.parse("2023-10-15T14:30:00Z"))
            .updatedAt(Instant.parse("2023-10-15T14:30:00Z"))
            .build();
            
        userRepository.save(testUser);
    }
    
    @State("사용자 ID 99999가 존재하지 않음")
    void userNotExists() {
        // 해당 사용자가 없는 상태 보장
        userRepository.deleteById(99999L);
    }
}
```

## API 버전 관리 전략

### 1. 의미 있는 버전 관리

```java
// API 버전 관리 전략
@RestController
@RequestMapping("/api/v1/users")
public class UserControllerV1 {
    
    // v1 API 구현
    @GetMapping("/{userId}")
    public ResponseEntity<UserV1> getUserById(@PathVariable Long userId) {
        User user = userService.getUserById(userId);
        UserV1 userV1 = convertToV1(user);
        return ResponseEntity.ok(userV1);
    }
    
    private UserV1 convertToV1(User user) {
        return UserV1.builder()
            .id(user.getId())
            .email(user.getEmail())
            .name(user.getName())
            .createdAt(user.getCreatedAt())
            .build();
        // v1에서는 phone, emailVerified 등 일부 필드 제외
    }
}

@RestController
@RequestMapping("/api/v2/users")
public class UserControllerV2 {
    
    // v2 API 구현 - 확장된 기능
    @GetMapping("/{userId}")
    public ResponseEntity<UserV2> getUserById(@PathVariable Long userId) {
        User user = userService.getUserById(userId);
        UserV2 userV2 = convertToV2(user);
        return ResponseEntity.ok(userV2);
    }
    
    private UserV2 convertToV2(User user) {
        return UserV2.builder()
            .id(user.getId())
            .email(user.getEmail())
            .name(user.getName())
            .phone(user.getPhone())           // v2에서 추가
            .emailVerified(user.isEmailVerified()) // v2에서 추가
            .profileImageUrl(user.getProfileImageUrl()) // v2에서 추가
            .lastLoginAt(user.getLastLoginAt()) // v2에서 추가
            .createdAt(user.getCreatedAt())
            .updatedAt(user.getUpdatedAt())
            .build();
    }
}

// 버전 간 호환성 유지 전략
@Component
public class ApiVersionSupport {
    
    /*
     * 🔄 버전 관리 원칙
     * 
     * 1. 하위 호환성 유지 (Backward Compatibility)
     *    - 기존 필드 제거 금지
     *    - 필수 필드 추가 금지
     *    - 기존 동작 변경 금지
     * 
     * 2. 점진적 마이그레이션 지원
     *    - 구 버전 최소 6개월 지원
     *    - 마이그레이션 가이드 제공
     *    - 실시간 사용량 모니터링
     */
    
    @Value("${api.deprecation.warning-threshold-months:3}")
    private int deprecationWarningThresholdMonths;
    
    public void addDeprecationWarning(HttpServletResponse response, String version) {
        LocalDate deprecationDate = calculateDeprecationDate(version);
        
        if (LocalDate.now().isAfter(deprecationDate.minusMonths(deprecationWarningThresholdMonths))) {
            response.addHeader("Deprecation", "true");
            response.addHeader("Sunset", deprecationDate.toString());
            response.addHeader("Link", "</api/v2/users>; rel=\"successor-version\"");
        }
    }
    
    private LocalDate calculateDeprecationDate(String version) {
        // 버전별 지원 종료 일정 관리
        switch (version) {
            case "v1":
                return LocalDate.of(2024, 12, 31);
            case "v2":
                return LocalDate.of(2025, 12, 31);
            default:
                return LocalDate.now().plusYears(1);
        }
    }
}
```

### 2. API 문서 자동화

```java
// SpringDoc을 사용한 API 문서 자동 생성
@Configuration
@EnableOpenApi
public class ApiDocumentationConfig {
    
    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
            .info(new Info()
                .title("User Service API")
                .version("1.2.0")
                .description("사용자 관리 마이크로서비스 API")
                .contact(new Contact()
                    .name("User Service Team")
                    .email("user-service-team@company.com")
                )
                .license(new License()
                    .name("MIT")
                    .url("https://opensource.org/licenses/MIT")
                )
            )
            .addServersItem(new Server()
                .url("https://api.ecommerce.com/users/v1")
                .description("Production server")
            )
            .addServersItem(new Server()
                .url("https://staging-api.ecommerce.com/users/v1")
                .description("Staging server")
            )
            .components(new Components()
                .addSecuritySchemes("bearerAuth", new SecurityScheme()
                    .type(SecurityScheme.Type.HTTP)
                    .scheme("bearer")
                    .bearerFormat("JWT")
                )
            );
    }
    
    @Bean
    public GroupedOpenApi publicApi() {
        return GroupedOpenApi.builder()
            .group("user-service-public")
            .pathsToMatch("/api/v1/**", "/api/v2/**")
            .build();
    }
    
    @Bean
    public GroupedOpenApi adminApi() {
        return GroupedOpenApi.builder()
            .group("user-service-admin")
            .pathsToMatch("/admin/**")
            .addOpenApiCustomiser(openApi -> {
                openApi.info(openApi.getInfo()
                    .title("User Service Admin API")
                    .description("관리자 전용 사용자 관리 API")
                );
            })
            .build();
    }
}

// API 문서에 예제 데이터 추가
@RestController
@Tag(name = "User Management", description = "사용자 관리 API")
public class UserController {
    
    @PostMapping
    @Operation(
        summary = "새 사용자 생성",
        description = "새로운 사용자 계정을 생성합니다. 이메일 중복 검사를 수행합니다.",
        responses = {
            @ApiResponse(
                responseCode = "201",
                description = "사용자 생성 성공",
                content = @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = User.class),
                    examples = @ExampleObject(
                        name = "성공 예시",
                        value = """
                        {
                          "id": 12345,
                          "email": "john@example.com",
                          "name": "John Doe",
                          "emailVerified": false,
                          "createdAt": "2023-10-15T14:30:00Z"
                        }
                        """
                    )
                )
            ),
            @ApiResponse(
                responseCode = "400",
                description = "잘못된 요청",
                content = @Content(
                    mediaType = "application/json",
                    schema = @Schema(implementation = ValidationError.class)
                )
            )
        }
    )
    public ResponseEntity<User> createUser(
        @RequestBody 
        @Valid 
        @io.swagger.v3.oas.annotations.parameters.RequestBody(
            description = "사용자 생성 요청",
            required = true,
            content = @Content(
                examples = {
                    @ExampleObject(
                        name = "기본 예시",
                        value = """
                        {
                          "email": "john@example.com",
                          "name": "John Doe",
                          "password": "securePassword123!"
                        }
                        """
                    ),
                    @ExampleObject(
                        name = "전화번호 포함",
                        value = """
                        {
                          "email": "jane@example.com",
                          "name": "Jane Smith",
                          "phone": "+82-10-1234-5678",
                          "password": "anotherSecurePass456!"
                        }
                        """
                    )
                }
            )
        )
        CreateUserRequest request) {
        
        User user = userService.createUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(user);
    }
}
```

## 핵심 요점

### 1. 팀 간 독립적 개발 지원

명확한 API 계약을 통해 프론트엔드와 백엔드 팀이 병렬로 개발 가능

### 2. 자동화된 코드 생성

OpenAPI 스펙에서 클라이언트 코드와 서버 스텁을 자동 생성하여 일관성 보장

### 3. 계약 테스트를 통한 안정성

Provider와 Consumer 간의 계약을 자동으로 검증하여 호환성 보장

### 4. 체계적인 버전 관리

하위 호환성을 유지하면서 점진적으로 API를 발전시킬 수 있는 전략 수립

---

**이전**: [Database per Service 패턴](./16-01-04-database-per-service.md)  
**다음**: [마이크로서비스 설계 원칙 개요](./16-01-02-single-responsibility-principle.md)로 돌아가서 전체 설계 원칙을 복습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 애플리케이션 개발
-**예상 시간**: 6-8시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-16-distributed-system-patterns)

- [15.1 마이크로서비스 아키텍처 개요](../chapter-15-microservices-architecture/16-01-microservices-architecture.md)
- [15.1A 모놀리스 문제점과 전환 전략](../chapter-15-microservices-architecture/16-10-monolith-to-microservices.md)
- [16.1B 마이크로서비스 설계 원칙과 패턴 개요](./16-01-02-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-01-02-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-01-03-single-responsibility.md)

### 🏷️ 관련 키워드

`API Contract`, `OpenAPI 3.0`, `Contract Testing`, `Microservices`, `API Versioning`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
