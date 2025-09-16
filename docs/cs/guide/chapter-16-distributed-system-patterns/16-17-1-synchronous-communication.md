---
tags:
  - circuit_breaker
  - fault_tolerance
  - hands-on
  - intermediate
  - medium-read
  - microservices
  - rest_api
  - typescript
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 16.1C1 동기식 통신 - REST API와 Circuit Breaker

## 🚀 안정적인 마이크로서비스 동기식 통신

마이크로서비스 간 동기식 통신에서는 네트워크 장애, 서비스 다운, 응답 지연 등 다양한 문제 상황에 대비해야 합니다. 실제 전자상거래 플랫폼에서 적용했던 Circuit Breaker 패턴과 재시도 로직을 포함한 견고한 REST 클라이언트 구현을 살펴보겠습니다.

## 안정적인 REST 클라이언트 구현

### 클라이언트 아키텍처 설계

```typescript
// TypeScript로 구현한 견고한 서비스 클라이언트
interface ServiceClientConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

interface UserServiceClient {
  createUser(request: CreateUserRequest): Promise<User>;
  getUserById(userId: number): Promise<User>;
  updateUser(userId: number, request: UpdateUserRequest): Promise<User>;
  deleteUser(userId: number): Promise<void>;
  batchGetUsers(userIds: number[]): Promise<User[]>;
}

class RestUserServiceClient implements UserServiceClient {
  private baseUrl: string;
  private httpClient: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private metricsCollector: MetricsCollector;
  
  constructor(config: ServiceClientConfig) {
    this.baseUrl = config.baseUrl;
    this.httpClient = this.createHttpClient(config);
    this.circuitBreaker = this.createCircuitBreaker(config);
    this.metricsCollector = MetricsCollector.getInstance();
    
    // 요청/응답 인터셉터 설정
    this.setupInterceptors();
  }
```

### HTTP 클라이언트 설정과 Circuit Breaker

```typescript
  private createHttpClient(config: ServiceClientConfig): AxiosInstance {
    const client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'order-service/1.0.0',
        'Accept': 'application/json',
      },
    });
    
    // 재시도 로직 설정
    client.defaults.retries = config.retryAttempts;
    client.defaults.retryDelay = config.retryDelay;
    
    return client;
  }
  
  private createCircuitBreaker(config: ServiceClientConfig): CircuitBreaker {
    return new CircuitBreaker({
      timeout: config.timeout,
      errorThresholdPercentage: config.circuitBreakerThreshold,
      resetTimeout: config.circuitBreakerTimeout,
      monitoringPeriod: 10000,
      
      // Circuit Breaker 상태 변경 시 로깅 및 메트릭
      onOpen: (err) => {
        console.error(`User Service Circuit Breaker OPEN: ${err.message}`);
        this.metricsCollector.incrementCounter('circuit_breaker_opened', {
          service: 'user-service',
          reason: err.message
        });
      },
      
      onHalfOpen: () => {
        console.log('User Service Circuit Breaker HALF-OPEN');
        this.metricsCollector.incrementCounter('circuit_breaker_half_opened', {
          service: 'user-service'
        });
      },
      
      onClose: () => {
        console.log('User Service Circuit Breaker CLOSED');
        this.metricsCollector.incrementCounter('circuit_breaker_closed', {
          service: 'user-service'
        });
      },
      
      // Fallback 함수 정의
      fallback: (err) => {
        console.warn(`Fallback triggered for User Service: ${err.message}`);
        return this.getFallbackResponse(err);
      }
    });
  }
```

### 요청/응답 인터셉터 구현

```typescript
  private setupInterceptors() {
    // 요청 인터셉터 - 인증, 추적, 메트릭
    this.httpClient.interceptors.request.use(
      (config) => {
        // 1. JWT 토큰 추가
        const token = AuthService.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // 2. 분산 트레이싱 헤더 추가
        const traceContext = TraceContext.current();
        if (traceContext) {
          config.headers['X-Trace-ID'] = traceContext.traceId;
          config.headers['X-Span-ID'] = traceContext.spanId;
          config.headers['X-Parent-Span-ID'] = traceContext.parentSpanId;
        }
        
        // 3. 요청 ID 생성 (디버깅용)
        config.headers['X-Request-ID'] = generateRequestId();
        
        // 4. 요청 시작 시간 기록
        config.metadata = { startTime: Date.now() };
        
        // 5. 요청 메트릭 수집
        this.metricsCollector.incrementCounter('http_requests_total', {
          method: config.method?.toUpperCase(),
          service: 'user-service',
          endpoint: this.extractEndpoint(config.url || '')
        });
        
        return config;
      },
      (error) => {
        console.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );
    
    // 응답 인터셉터 - 에러 처리, 재시도, 메트릭
    this.httpClient.interceptors.response.use(
      (response) => {
        // 성공 응답 메트릭 수집
        const duration = Date.now() - response.config.metadata.startTime;
        
        this.metricsCollector.recordHistogram('http_request_duration_ms', duration, {
          method: response.config.method?.toUpperCase(),
          service: 'user-service',
          status_code: response.status.toString(),
          endpoint: this.extractEndpoint(response.config.url || '')
        });
        
        this.metricsCollector.incrementCounter('http_responses_total', {
          method: response.config.method?.toUpperCase(),
          service: 'user-service',
          status_code: response.status.toString()
        });
        
        return response;
      },
      
      async (error) => {
        const originalRequest = error.config;
        
        // 응답 시간 메트릭 (에러 포함)
        if (originalRequest.metadata) {
          const duration = Date.now() - originalRequest.metadata.startTime;
          this.metricsCollector.recordHistogram('http_request_duration_ms', duration, {
            method: originalRequest.method?.toUpperCase(),
            service: 'user-service',
            status_code: error.response?.status?.toString() || 'error',
            endpoint: this.extractEndpoint(originalRequest.url || '')
          });
        }
        
        // 1. 401 에러 시 토큰 갱신 시도
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            await AuthService.refreshToken();
            const newToken = AuthService.getAccessToken();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.httpClient(originalRequest);
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            AuthService.logout();
            throw new AuthenticationError('인증에 실패했습니다');
          }
        }
        
        // 2. 재시도 가능한 에러 처리 (5xx, 네트워크 에러)
        if (this.shouldRetry(error) && !originalRequest._retryCount) {
          originalRequest._retryCount = 0;
        }
        
        if (originalRequest._retryCount < originalRequest.retries) {
          originalRequest._retryCount++;
          
          const delay = this.calculateRetryDelay(originalRequest._retryCount);
          console.warn(`Retrying request (${originalRequest._retryCount}/${originalRequest.retries}) after ${delay}ms`);
          
          await this.sleep(delay);
          return this.httpClient(originalRequest);
        }
        
        // 3. 에러 메트릭 수집
        this.metricsCollector.incrementCounter('http_errors_total', {
          method: originalRequest.method?.toUpperCase(),
          service: 'user-service',
          status_code: error.response?.status?.toString() || 'network_error',
          error_type: this.classifyError(error)
        });
        
        return Promise.reject(this.enhanceError(error));
      }
    );
  }
```

### Circuit Breaker가 적용된 핵심 메서드들

```typescript
  // Circuit Breaker가 적용된 핵심 메서드들
  async getUserById(userId: number): Promise<User> {
    return this.circuitBreaker.execute(async () => {
      try {
        const response = await this.httpClient.get<ApiResponse<User>>(`/users/${userId}`);
        
        if (!response.data.success) {
          throw new UserServiceError(response.data.error?.message || '사용자 조회 실패');
        }
        
        return response.data.data;
        
      } catch (error) {
        if (error.response?.status === 404) {
          throw new UserNotFoundError(`사용자 ID ${userId}를 찾을 수 없습니다`);
        }
        
        this.handleError(error, 'getUserById', { userId });
        throw error;
      }
    });
  }
  
  async createUser(request: CreateUserRequest): Promise<User> {
    return this.circuitBreaker.execute(async () => {
      try {
        // 입력 검증
        this.validateCreateUserRequest(request);
        
        const response = await this.httpClient.post<ApiResponse<User>>('/users', request);
        
        if (!response.data.success) {
          throw new UserServiceError(response.data.error?.message || '사용자 생성 실패');
        }
        
        // 생성 성공 메트릭
        this.metricsCollector.incrementCounter('users_created_total', {
          source: 'order-service'
        });
        
        return response.data.data;
        
      } catch (error) {
        if (error.response?.status === 409) {
          throw new UserAlreadyExistsError('이미 존재하는 이메일입니다');
        }
        
        this.handleError(error, 'createUser', { email: request.email });
        throw error;
      }
    });
  }
  
  // 배치 요청 최적화
  async batchGetUsers(userIds: number[]): Promise<User[]> {
    if (userIds.length === 0) return [];
    
    // 배치 크기 제한 (너무 큰 요청 방지)
    const BATCH_SIZE = 100;
    if (userIds.length > BATCH_SIZE) {
      const batches = this.chunkArray(userIds, BATCH_SIZE);
      const results = await Promise.all(
        batches.map(batch => this.batchGetUsers(batch))
      );
      return results.flat();
    }
    
    return this.circuitBreaker.execute(async () => {
      try {
        const response = await this.httpClient.post<ApiResponse<User[]>>(
          '/users/batch',
          { userIds },
          {
            headers: {
              'X-Batch-Size': userIds.length.toString()
            }
          }
        );
        
        if (!response.data.success) {
          throw new UserServiceError(response.data.error?.message || '배치 사용자 조회 실패');
        }
        
        // 캐싱 (선택적)
        const users = response.data.data;
        users.forEach(user => {
          CacheService.set(`user:${user.id}`, user, { ttl: 300 }); // 5분 캐시
        });
        
        return users;
        
      } catch (error) {
        this.handleError(error, 'batchGetUsers', { userIds: userIds.length });
        throw error;
      }
    });
  }
```

### Fallback 처리와 유틸리티 메서드

```typescript
  // Fallback 응답 처리
  private getFallbackResponse(error: any): any {
    // Circuit Breaker가 열렸을 때의 기본 응답
    if (error.code === 'CIRCUIT_BREAKER_OPEN') {
      // 캐시에서 데이터 조회 시도
      const cachedData = CacheService.get(`fallback:user-service:${error.operation}`);
      if (cachedData) {
        console.log(`Using cached fallback data for ${error.operation}`);
        return cachedData;
      }
      
      // 기본값 반환
      switch (error.operation) {
        case 'getUserById':
          return {
            id: 0,
            name: 'Unknown User',
            email: 'unknown@service-unavailable.com',
            status: 'service_unavailable'
          };
        default:
          throw new ServiceUnavailableError('User Service is currently unavailable');
      }
    }
    
    throw error;
  }
  
  private handleError(error: any, operation: string, context?: any) {
    const errorInfo = {
      operation,
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      context,
      timestamp: new Date().toISOString(),
    };
    
    console.error(`UserServiceClient.${operation} 실패:`, errorInfo);
    
    // 구조화된 로그 전송
    Logger.error('UserServiceClient operation failed', errorInfo);
  }
  
  private shouldRetry(error: any): boolean {
    // 네트워크 에러나 5xx 서버 에러만 재시도
    return !error.response || 
           error.response.status >= 500 || 
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT' ||
           error.code === 'ENOTFOUND';
  }
  
  private calculateRetryDelay(attempt: number): number {
    // 지수 백오프 + 지터
    const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s...
    const jitter = Math.random() * 1000; // 0-1초 랜덤
    return Math.min(baseDelay + jitter, 30000); // 최대 30초
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private extractEndpoint(url: string): string {
    // URL에서 엔드포인트 패턴 추출 (메트릭용)
    return url
      .replace(/\/\d+/g, '/{id}') // 숫자 ID를 패턴으로 변경
      .replace(/\/[a-f0-9-]{36}/g, '/{uuid}') // UUID를 패턴으로 변경
      .split('?')[0]; // 쿼리 파라미터 제거
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

### 실제 서비스 적용 예제

```typescript
// 사용 예제
class OrderService {
  private userServiceClient: UserServiceClient;
  
  constructor() {
    this.userServiceClient = new RestUserServiceClient({
      baseUrl: process.env.USER_SERVICE_URL || 'http://user-service:8080',
      timeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
      circuitBreakerThreshold: 50, // 50% 실패율에서 Circuit Breaker 작동
      circuitBreakerTimeout: 30000 // 30초 후 재시도
    });
  }
  
  async createOrder(request: CreateOrderRequest): Promise<Order> {
    try {
      // 1. 사용자 정보 확인 (Circuit Breaker 적용)
      const user = await this.userServiceClient.getUserById(request.userId);
      
      // 2. 주문 생성 로직
      const order = new Order({
        userId: user.id,
        items: request.items,
        shippingAddress: request.shippingAddress
      });
      
      // ... 나머지 주문 처리 로직
      
      return order;
      
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new InvalidOrderError('존재하지 않는 사용자입니다');
      } else if (error instanceof ServiceUnavailableError) {
        throw new TemporaryOrderError('일시적으로 주문을 처리할 수 없습니다. 잠시 후 다시 시도해주세요');
      }
      
      throw error;
    }
  }
}
```

## 핵심 요점

### 1. Circuit Breaker로 장애 격리

서비스 간 장애 전파 방지와 자동 복구를 통한 시스템 안정성 확보

### 2. 지능형 재시도 전략

지수 백오프와 지터를 활용한 효율적인 재시도 메커니즘

### 3. 포괄적인 모니터링

요청/응답 메트릭, 에러 분류, 분산 트레이싱을 통한 운영 가시성 확보

### 4. 우아한 성능 저하 처리

Fallback 메커니즘과 캐싱을 통한 사용자 경험 보장

---

**이전**: [서비스 간 통신과 메시징 개요](chapter-15-microservices-architecture/16-16-service-communication.md)  
**다음**: [비동기식 통신 - 메시지 큐와 이벤트](chapter-16-distributed-system-patterns/16-18-2-asynchronous-communication.md)에서 비동기 패턴을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-16-system-design-patterns)

- [15.1 마이크로서비스 아키텍처 개요](../chapter-15-microservices-architecture/16-01-microservices-architecture.md)
- [15.1A 모놀리스 문제점과 전환 전략](../chapter-15-microservices-architecture/16-10-monolith-to-microservices.md)
- [16.1B 마이크로서비스 설계 원칙과 패턴 개요](./16-11-design-principles.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-12-1-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-13-1-single-responsibility.md)

### 🏷️ 관련 키워드

`circuit_breaker`, `rest_api`, `microservices`, `typescript`, `fault_tolerance`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
