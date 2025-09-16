---
tags:
  - API Gateway
  - Circuit Breaker
  - Load Balancing
  - Reverse Proxy
  - Service Discovery
  - advanced
  - deep-study
  - hands-on
  - 인프라스트럭처
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 16.5B API Gateway 고성능 라우팅과 로드 밸런싱

## 🎯 학습 목표

API Gateway에서 가장 핵심적인 기능인 고성능 라우팅과 로드 밸런싱을 실제 Go 코드로 구현하면서 다음을 학습합니다:

- 지능적인 서비스 인스턴스 선택 알고리즘
- 가중치 기반 라운드로빈 로드 밸런싱
- 역방향 프록시와 요청 라우팅
- 응답 집계와 병렬 처리
- 헬스체크와 장애 감지
- 서비스 디스커버리 통합

---

## 🚀 고성능 라우팅과 로드 밸런싱 구현

### 핵심 데이터 구조

```go
// Go언어로 구현한 고성능 API Gateway
package gateway

import (
    "context"
    "fmt"
    "log"
    "net/http"
    "net/http/httputil"
    "net/url"
    "strings"
    "sync"
    "time"
    
    "github.com/gorilla/mux"
    "go.uber.org/zap"
)

// Service represents a backend service
type Service struct {
    Name         string            `json:"name"`
    Instances    []*ServiceInstance `json:"instances"`
    HealthCheck  string            `json:"health_check"`
    CircuitBreaker *CircuitBreaker  `json:"-"`
    mutex        sync.RWMutex
}

type ServiceInstance struct {
    ID       string    `json:"id"`
    Host     string    `json:"host"`
    Port     int       `json:"port"`
    Weight   int       `json:"weight"`
    Healthy  bool      `json:"healthy"`
    LastSeen time.Time `json:"last_seen"`
}

// APIGateway main struct
type APIGateway struct {
    services       map[string]*Service
    router         *mux.Router
    rateLimiter    *RateLimiter
    authenticator  *Authenticator
    cache          *ResponseCache
    logger         *zap.Logger
    middleware     []Middleware
    mutex          sync.RWMutex
}
```

### Gateway 초기화 및 라우팅 설정

```go
func NewAPIGateway(logger *zap.Logger) *APIGateway {
    gateway := &APIGateway{
        services:      make(map[string]*Service),
        router:        mux.NewRouter(),
        rateLimiter:   NewRateLimiter(),
        authenticator: NewAuthenticator(),
        cache:         NewResponseCache(),
        logger:        logger,
    }
    
    gateway.setupRoutes()
    gateway.setupMiddleware()
    
    return gateway
}

func (gw *APIGateway) setupRoutes() {
    // Health check endpoint
    gw.router.HandleFunc("/health", gw.healthCheckHandler).Methods("GET")
    
    // Metrics endpoint
    gw.router.HandleFunc("/metrics", gw.metricsHandler).Methods("GET")
    
    // Main API routes with service discovery
    gw.router.PathPrefix("/api/v1/users").HandlerFunc(gw.proxyHandler("user-service"))
    gw.router.PathPrefix("/api/v1/posts").HandlerFunc(gw.proxyHandler("post-service"))
    gw.router.PathPrefix("/api/v1/media").HandlerFunc(gw.proxyHandler("media-service"))
    gw.router.PathPrefix("/api/v1/notifications").HandlerFunc(gw.proxyHandler("notification-service"))
    gw.router.PathPrefix("/api/v1/analytics").HandlerFunc(gw.proxyHandler("analytics-service"))
    
    // Aggregation endpoints
    gw.router.HandleFunc("/api/v1/feed", gw.aggregatedFeedHandler).Methods("GET")
    gw.router.HandleFunc("/api/v1/dashboard", gw.dashboardAggregationHandler).Methods("GET")
}

func (gw *APIGateway) setupMiddleware() {
    // Request ID middleware
    gw.Use(RequestIDMiddleware)
    
    // Logging middleware
    gw.Use(LoggingMiddleware(gw.logger))
    
    // CORS middleware
    gw.Use(CORSMiddleware)
    
    // Authentication middleware
    gw.Use(AuthenticationMiddleware(gw.authenticator))
    
    // Rate limiting middleware
    gw.Use(RateLimitingMiddleware(gw.rateLimiter))
    
    // Circuit breaker middleware
    gw.Use(CircuitBreakerMiddleware)
    
    // Caching middleware
    gw.Use(CachingMiddleware(gw.cache))
    
    // Metrics middleware
    gw.Use(MetricsMiddleware)
}
```

### 🎯 지능적 로드 밸런싱: 가중치 기반 라운드로빈

```go
// Load balancing with weighted round-robin
func (gw *APIGateway) selectServiceInstance(serviceName string) (*ServiceInstance, error) {
    gw.mutex.RLock()
    service, exists := gw.services[serviceName]
    gw.mutex.RUnlock()
    
    if !exists {
        return nil, fmt.Errorf("service %s not found", serviceName)
    }
    
    service.mutex.RLock()
    defer service.mutex.RUnlock()
    
    // Filter healthy instances
    healthyInstances := make([]*ServiceInstance, 0)
    totalWeight := 0
    
    for _, instance := range service.Instances {
        if instance.Healthy {
            healthyInstances = append(healthyInstances, instance)
            totalWeight += instance.Weight
        }
    }
    
    if len(healthyInstances) == 0 {
        return nil, fmt.Errorf("no healthy instances available for service %s", serviceName)
    }
    
    // Weighted round-robin selection
    if totalWeight == 0 {
        // Equal weight fallback
        return healthyInstances[time.Now().UnixNano()%int64(len(healthyInstances))], nil
    }
    
    // Weighted selection
    target := time.Now().UnixNano() % int64(totalWeight)
    current := int64(0)
    
    for _, instance := range healthyInstances {
        current += int64(instance.Weight)
        if target < current {
            return instance, nil
        }
    }
    
    // Fallback
    return healthyInstances[0], nil
}
```

### 🔄 역방향 프록시와 지능적 라우팅

```go
// Proxy handler with intelligent routing
func (gw *APIGateway) proxyHandler(serviceName string) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()
        
        // Apply middleware chain
        handler := gw.applyMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            gw.handleProxy(w, r, serviceName)
        }))
        
        handler.ServeHTTP(w, r.WithContext(ctx))
    }
}

func (gw *APIGateway) handleProxy(w http.ResponseWriter, r *http.Request, serviceName string) {
    // Select healthy service instance
    instance, err := gw.selectServiceInstance(serviceName)
    if err != nil {
        gw.logger.Error("Failed to select service instance", 
            zap.String("service", serviceName), 
            zap.Error(err))
        http.Error(w, "Service Unavailable", http.StatusServiceUnavailable)
        return
    }
    
    // Create target URL
    target := &url.URL{
        Scheme: "http",
        Host:   fmt.Sprintf("%s:%d", instance.Host, instance.Port),
    }
    
    // Create reverse proxy
    proxy := httputil.NewSingleHostReverseProxy(target)
    
    // Custom proxy director for header manipulation
    originalDirector := proxy.Director
    proxy.Director = func(req *http.Request) {
        originalDirector(req)
        
        // Add custom headers
        req.Header.Set("X-Forwarded-For", r.RemoteAddr)
        req.Header.Set("X-Gateway-Service", serviceName)
        req.Header.Set("X-Request-ID", GetRequestID(r.Context()))
        req.Header.Set("X-User-ID", GetUserID(r.Context()))
    }
    
    // Custom error handler
    proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
        gw.logger.Error("Proxy error", 
            zap.String("service", serviceName),
            zap.String("instance", instance.ID),
            zap.Error(err))
        
        // Mark instance as unhealthy
        instance.Healthy = false
        
        // Try circuit breaker
        service := gw.services[serviceName]
        if service.CircuitBreaker.ShouldTrip() {
            gw.logger.Warn("Circuit breaker tripped", zap.String("service", serviceName))
            http.Error(w, "Service Circuit Breaker Open", http.StatusServiceUnavailable)
            return
        }
        
        // Retry with another instance
        retryInstance, retryErr := gw.selectServiceInstance(serviceName)
        if retryErr != nil {
            http.Error(w, "All service instances unavailable", http.StatusServiceUnavailable)
            return
        }
        
        // Retry proxy
        retryTarget := &url.URL{
            Scheme: "http",
            Host:   fmt.Sprintf("%s:%d", retryInstance.Host, retryInstance.Port),
        }
        retryProxy := httputil.NewSingleHostReverseProxy(retryTarget)
        retryProxy.ServeHTTP(w, r)
    }
    
    // Execute proxy
    proxy.ServeHTTP(w, r)
}
```

### ⚡ 병렬 응답 집계: 복합 요청 처리

```go
// Response aggregation for complex queries
func (gw *APIGateway) aggregatedFeedHandler(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    userID := GetUserID(ctx)
    
    if userID == "" {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }
    
    // Parallel requests to multiple services
    type Result struct {
        Key   string
        Data  interface{}
        Error error
    }
    
    results := make(chan Result, 4)
    
    // Get user profile
    go func() {
        profile, err := gw.fetchUserProfile(ctx, userID)
        results <- Result{"profile", profile, err}
    }()
    
    // Get posts feed
    go func() {
        posts, err := gw.fetchUserFeed(ctx, userID)
        results <- Result{"posts", posts, err}
    }()
    
    // Get notifications count
    go func() {
        count, err := gw.fetchNotificationCount(ctx, userID)
        results <- Result{"notifications", count, err}
    }()
    
    // Get trending topics
    go func() {
        trends, err := gw.fetchTrendingTopics(ctx)
        results <- Result{"trending", trends, err}
    }()
    
    // Collect results with timeout
    aggregatedData := make(map[string]interface{})
    timeout := time.After(2 * time.Second)
    collected := 0
    
    for collected < 4 {
        select {
        case result := <-results:
            if result.Error == nil {
                aggregatedData[result.Key] = result.Data
            } else {
                gw.logger.Warn("Aggregation partial failure", 
                    zap.String("key", result.Key), 
                    zap.Error(result.Error))
                aggregatedData[result.Key] = nil
            }
            collected++
            
        case <-timeout:
            gw.logger.Warn("Aggregation timeout", zap.Int("collected", collected))
            break
        }
    }
    
    // Return aggregated response
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("X-Aggregated", "true")
    
    response := map[string]interface{}{
        "status": "success",
        "data":   aggregatedData,
        "meta": map[string]interface{}{
            "aggregated_at": time.Now().Format(time.RFC3339),
            "services_called": 4,
            "services_succeeded": len(aggregatedData),
        },
    }
    
    if err := json.NewEncoder(w).Encode(response); err != nil {
        gw.logger.Error("Failed to encode aggregated response", zap.Error(err))
    }
}
```

### 🔧 서비스별 요청 처리 함수

```go
// Service-specific fetch functions
func (gw *APIGateway) fetchUserProfile(ctx context.Context, userID string) (interface{}, error) {
    req, err := http.NewRequestWithContext(ctx, "GET", 
        fmt.Sprintf("/api/internal/users/%s/profile", userID), nil)
    if err != nil {
        return nil, err
    }
    
    return gw.makeServiceRequest("user-service", req)
}

func (gw *APIGateway) fetchUserFeed(ctx context.Context, userID string) (interface{}, error) {
    req, err := http.NewRequestWithContext(ctx, "GET", 
        fmt.Sprintf("/api/internal/feed/%s?limit=20", userID), nil)
    if err != nil {
        return nil, err
    }
    
    return gw.makeServiceRequest("post-service", req)
}

func (gw *APIGateway) makeServiceRequest(serviceName string, req *http.Request) (interface{}, error) {
    instance, err := gw.selectServiceInstance(serviceName)
    if err != nil {
        return nil, err
    }
    
    // Create HTTP client with timeout
    client := &http.Client{
        Timeout: 1 * time.Second,
    }
    
    // Update request URL
    req.URL.Scheme = "http"
    req.URL.Host = fmt.Sprintf("%s:%d", instance.Host, instance.Port)
    
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("service returned status %d", resp.StatusCode)
    }
    
    var result interface{}
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, err
    }
    
    return result, nil
}
```

### 🛠️ 미들웨어 시스템

```go
// Middleware support
type Middleware func(http.Handler) http.Handler

func (gw *APIGateway) Use(middleware Middleware) {
    gw.middleware = append(gw.middleware, middleware)
}

func (gw *APIGateway) applyMiddleware(handler http.Handler) http.Handler {
    for i := len(gw.middleware) - 1; i >= 0; i-- {
        handler = gw.middleware[i](handler)
    }
    return handler
}
```

### 💚 헬스체크와 서비스 모니터링

```go
// Health check for the gateway itself
func (gw *APIGateway) healthCheckHandler(w http.ResponseWriter, r *http.Request) {
    health := map[string]interface{}{
        "status": "healthy",
        "timestamp": time.Now().Format(time.RFC3339),
        "services": gw.getServicesHealth(),
        "version": "1.0.0",
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(health)
}

func (gw *APIGateway) getServicesHealth() map[string]interface{} {
    gw.mutex.RLock()
    defer gw.mutex.RUnlock()
    
    servicesHealth := make(map[string]interface{})
    
    for name, service := range gw.services {
        service.mutex.RLock()
        healthyCount := 0
        totalCount := len(service.Instances)
        
        for _, instance := range service.Instances {
            if instance.Healthy {
                healthyCount++
            }
        }
        
        servicesHealth[name] = map[string]interface{}{
            "healthy_instances": healthyCount,
            "total_instances":   totalCount,
            "status":           fmt.Sprintf("%d/%d", healthyCount, totalCount),
        }
        service.mutex.RUnlock()
    }
    
    return servicesHealth
}
```

### 🔍 서비스 디스커버리 통합

```go
// Service discovery integration
func (gw *APIGateway) RegisterService(service *Service) {
    gw.mutex.Lock()
    defer gw.mutex.Unlock()
    
    gw.services[service.Name] = service
    gw.logger.Info("Service registered", 
        zap.String("name", service.Name),
        zap.Int("instances", len(service.Instances)))
}

func (gw *APIGateway) StartHealthChecking() {
    ticker := time.NewTicker(30 * time.Second)
    go func() {
        for range ticker.C {
            gw.checkServicesHealth()
        }
    }()
}

func (gw *APIGateway) checkServicesHealth() {
    gw.mutex.RLock()
    services := make([]*Service, 0, len(gw.services))
    for _, service := range gw.services {
        services = append(services, service)
    }
    gw.mutex.RUnlock()
    
    for _, service := range services {
        go gw.checkServiceHealth(service)
    }
}

func (gw *APIGateway) checkServiceHealth(service *Service) {
    service.mutex.Lock()
    defer service.mutex.Unlock()
    
    for _, instance := range service.Instances {
        go func(inst *ServiceInstance) {
            healthy := gw.pingInstance(inst, service.HealthCheck)
            inst.Healthy = healthy
            inst.LastSeen = time.Now()
            
            if healthy {
                gw.logger.Debug("Instance healthy", 
                    zap.String("service", service.Name),
                    zap.String("instance", inst.ID))
            } else {
                gw.logger.Warn("Instance unhealthy", 
                    zap.String("service", service.Name),
                    zap.String("instance", inst.ID))
            }
        }(instance)
    }
}

func (gw *APIGateway) pingInstance(instance *ServiceInstance, healthPath string) bool {
    client := &http.Client{Timeout: 5 * time.Second}
    
    url := fmt.Sprintf("http://%s:%d%s", instance.Host, instance.Port, healthPath)
    resp, err := client.Get(url)
    
    if err != nil {
        return false
    }
    defer resp.Body.Close()
    
    return resp.StatusCode == http.StatusOK
}
```

### 🚀 Gateway 서버 시작

```go
// Start the gateway server
func (gw *APIGateway) Start(port int) error {
    server := &http.Server{
        Addr:         fmt.Sprintf(":%d", port),
        Handler:      gw.router,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }
    
    gw.logger.Info("API Gateway starting", zap.Int("port", port))
    
    // Start health checking
    gw.StartHealthChecking()
    
    return server.ListenAndServe()
}
```

---

## 💡 핵심 포인트 요약

### ✅ 고성능 설계 원칙

**1. 지능적 로드 밸런싱**

- 가중치 기반 라운드로빈으로 서버 성능 차이 반영
- 건강한 인스턴스만 대상으로 하는 동적 필터링
- 실시간 헬스체크를 통한 장애 인스턴스 자동 제외

**2. 비동기 병렬 처리**

- Goroutine을 활용한 다중 서비스 병렬 호출
- 타임아웃 기반 부분 실패 허용
- 응답 집계를 통한 클라이언트 요청 최적화

**3. 장애 복구 메커니즘**

- 프록시 오류 시 다른 인스턴스로 자동 재시도
- Circuit Breaker 패턴으로 연쇄 장애 방지
- 인스턴스 상태 실시간 모니터링

### 🎯 실무 적용 가이드

```bash
성능 최적화 체크리스트:

✅ Connection Pooling 구현
✅ HTTP/2 지원 고려
✅ 응답 캐싱 전략 수립
✅ 메트릭 수집 및 모니터링
✅ 로드 테스트 및 튜닝
✅ 메모리 사용량 최적화
```

---

## 🔗 연관 학습 자료

- **[16.5A API Gateway 기초](chapter-16-distributed-system-patterns/16-07-api-gateway-fundamentals.md)** - API Gateway 패턴의 기본 개념
- **[16.5C 인증과 인가](chapter-16-distributed-system-patterns/05c-authentication-authorization.md)** - JWT 기반 통합 인증 시스템  
- **[16.5D Rate Limiting](chapter-16-distributed-system-patterns/16-42-rate-limiting-monitoring.md)** - 트래픽 제어와 모니터링
- **[16.5 API Gateway 패턴 종합](chapter-16-distributed-system-patterns/16-55-api-gateway-patterns.md)** - 전체 개요와 학습 로드맵

---

**다음**: [인증과 인가 시스템 구현](chapter-16-distributed-system-patterns/05c-authentication-authorization.md)에서 JWT 기반 통합 인증을 학습해보세요! 🔐

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 인프라스트럭처
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-16-system-design-patterns)

- [15.1 마이크로서비스 아키텍처 개요](../chapter-15-microservices-architecture/16-01-microservices-architecture.md)
- [15.1A 모놀리스 문제점과 전환 전략](../chapter-15-microservices-architecture/16-10-monolith-to-microservices.md)
- [16.1B 마이크로서비스 설계 원칙과 패턴 개요](./16-11-design-principles.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-12-1-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-13-1-single-responsibility.md)

### 🏷️ 관련 키워드

`API Gateway`, `Load Balancing`, `Reverse Proxy`, `Circuit Breaker`, `Service Discovery`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
