---
tags:
  - Kubernetes
  - Istio
  - Graceful-Shutdown
  - Service-Mesh
  - Production
  - Load-Balancer
  - Zero-Downtime
---

# Kubernetes에서 완벽한 Graceful Shutdown: Istio와 함께하는 무중단 배포

## 들어가며

"배포할 때마다 일부 요청이 실패한대?" Production 환경에서 가장 중요한 것 중 하나가 바로 **무중단 배포**입니다. 하지만 Kubernetes, Istio, Load Balancer가 복합적으로 얽힌 환경에서는 완벽한 Graceful Shutdown이 생각보다 복잡합니다. **"정말로 트래픽이 안 들어올까?"**라는 의구심이 생기는 이유와 이를 확실하게 검증하는 방법을 살펴보겠습니다.

## Graceful Shutdown의 복잡성

### 다층 구조에서의 종료 과정

일반적인 Production 환경의 트래픽 경로:

```text
Internet → NLB/ALB → Istio Gateway → Envoy Sidecar → App Container
```

각 레이어마다 서로 다른 종료 타이밍과 메커니즘을 가져서 복잡도가 증가합니다:

```text
Timeline of Graceful Shutdown:
┌─────────────────────────────────────────────────────────┐
│ T=0s    Pod Deletion Started                            │
│ T=0.1s  SIGTERM sent to containers                      │
│ T=0.1s  Pod removed from Endpoints                      │
│ T=0.2s  Istio updates Envoy configuration              │
│ T=0.3s  Application starts graceful shutdown           │
│ T=???   NLB health check detects failure               │ ← 불확실!
│ T=30s   SIGKILL (if still running)                     │
└─────────────────────────────────────────────────────────┘
```

## 왜 Kubernetes와 NLB를 믿을 수 없나?

### 1. Endpoint Propagation 지연

```bash
# Pod 삭제 시 Endpoint 업데이트 추적
kubectl get endpoints myservice -w

```text
# 예상: 즉시 Pod IP 제거
# 실제: 수 초의 지연 발생 가능
NAME        ENDPOINTS                           AGE
myservice   10.0.1.100:8080,10.0.1.101:8080   5m
myservice   10.0.1.101:8080                    5m    # 지연 후 업데이트
```


이는 다음과 같은 이유 때문입니다:

```yaml
# kube-controller-manager 설정
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: kube-controller-manager
    command:
    - kube-controller-manager
    - --node-monitor-period=5s          # 노드 상태 체크 주기
    - --node-monitor-grace-period=40s    # 노드 장애 감지 시간
    - --pod-eviction-timeout=5m0s        # Pod eviction 타임아웃
```

### 2. NLB Health Check 비동기성

```yaml
# NLB Target Group Health Check 설정
HealthCheckEnabled: true
HealthCheckIntervalSeconds: 30        # 30초마다 체크
HealthCheckPath: '/health'
HealthCheckPort: 'traffic-port'
HealthCheckProtocol: 'HTTP'
HealthCheckTimeoutSeconds: 5          # 5초 타임아웃
HealthyThresholdCount: 3              # 3회 성공시 healthy
UnhealthyThresholdCount: 3            # 3회 실패시 unhealthy
```

**문제점**: Pod가 종료되어도 NLB가 인식하기까지 **최대 90초** 소요 가능!

```text
Pod Deletion (T=0) → ... → NLB Detection (T=90s)
└─ 이 사이에 들어오는 요청들이 실패!
```

### 3. Istio Envoy Configuration 업데이트 지연

```bash
# Istio pilot이 Envoy에게 설정 업데이트 전송 시간 확인
istioctl proxy-config cluster myapp-pod | grep myservice

# 실시간 configuration 변경 모니터링
kubectl logs -f deployment/istiod -n istio-system | grep "Push debounce stable"
```

## 확실한 트래픽 차단 검증 방법

### 실시간 트래픽 모니터링

가장 확실한 방법은 **실제 트래픽이 들어오는지 실시간으로 확인**하는 것입니다:

```bash
#!/bin/bash
# traffic_monitor.sh - 실시간 트래픽 모니터링

POD_NAME="$1"
if [[ -z "$POD_NAME" ]]; then
    echo "Usage: $0 <pod_name>"
    exit 1
fi

echo "Monitoring traffic to pod: $POD_NAME"
echo "Press Ctrl+C to stop"

# Pod IP 확인
POD_IP=$(kubectl get pod "$POD_NAME" -o jsonpath='{.status.podIP}')
echo "Pod IP: $POD_IP"

# 실시간 네트워크 연결 모니터링
while true; do
    TIMESTAMP=$(date '+%H:%M:%S')
    
    # TCP 연결 수 확인 (Pod 내부에서)
    CONN_COUNT=$(kubectl exec "$POD_NAME" -- netstat -an | grep ":8080.*ESTABLISHED" | wc -l 2>/dev/null || echo "0")
    
    # 초당 요청 수 추정 (nginx access log 기준)
    if kubectl exec "$POD_NAME" -- test -f /var/log/nginx/access.log 2>/dev/null; then
        REQ_COUNT=$(kubectl exec "$POD_NAME" -- tail -100 /var/log/nginx/access.log | grep "$(date '+%d/%b/%Y:%H:%M')" | wc -l)
    else
        REQ_COUNT="N/A"
    fi
    
    echo "[$TIMESTAMP] Active connections: $CONN_COUNT, Recent requests: $REQ_COUNT"
    
    sleep 1
done
```

### PreStop Hook을 이용한 능동적 트래픽 차단

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      containers:
      - name: app
        image: myapp:latest
        lifecycle:
          preStop:
            exec:
              command:
              - /bin/sh
              - -c
              - |
                echo "Starting graceful shutdown..."
                
                # 1. Health check endpoint 비활성화
                touch /app/shutdown
                
                # 2. 현재 활성 연결 확인
                echo "Active connections:"
                netstat -an | grep ":8080.*ESTABLISHED" | wc -l
                
                # 3. 트래픽이 완전히 멈출 때까지 대기
                for i in $(seq 1 30); do
                    CONN=$(netstat -an | grep ":8080.*ESTABLISHED" | wc -l)
                    echo "Waiting... connections: $CONN"
                    
                    if [ "$CONN" -eq "0" ]; then
                        echo "No active connections. Safe to shutdown."
                        break
                    fi
                    
                    sleep 2
                done
                
                echo "PreStop hook completed"
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health  
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
```

### Health Check Endpoint 개선

애플리케이션 레벨에서 graceful shutdown을 구현:

```javascript
// Node.js 예시
const express = require('express');
const app = express();
const fs = require('fs');

let isShuttingDown = false;

// Health check endpoint
app.get('/health', (req, res) => {
    // shutdown 파일이 존재하거나 종료 중이면 unhealthy
    if (fs.existsSync('/app/shutdown') || isShuttingDown) {
        return res.status(503).json({ status: 'shutting down' });
    }
    
    res.json({ status: 'healthy' });
});

// Graceful shutdown 처리
process.on('SIGTERM', () => {
    console.log('SIGTERM received, starting graceful shutdown...');
    isShuttingDown = true;
    
    // 새로운 요청 차단
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
    
    // 강제 종료 방지 (30초 타임아웃)
    setTimeout(() => {
        console.log('Force shutdown');
        process.exit(1);
    }, 30000);
});

const server = app.listen(8080, () => {
    console.log('Server started on port 8080');
});
```

## Istio에서의 고급 설정

### DestinationRule로 Connection Pool 최적화

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: myapp-destination
spec:
  host: myapp.default.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
        connectTimeout: 30s
        tcpKeepalive:
          time: 7200s      # 2시간
          interval: 75s
          probes: 9
      http:
        http1MaxPendingRequests: 64
        http2MaxRequests: 100
        maxRequestsPerConnection: 2    # 연결 재사용 제한
        maxRetries: 3
        consecutiveGatewayErrors: 5
        interval: 30s
        baseEjectionTime: 30s
        maxEjectionPercent: 50
        minHealthPercent: 50
    outlierDetection:
      consecutiveGatewayErrors: 3      # 연속 3회 실패시 제외
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
```

### VirtualService로 트래픽 제어

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: myapp-vs
spec:
  hosts:
  - myapp.default.svc.cluster.local
  http:
  - fault:
      abort:
        percentage:
          value: 0.1           # 0.1% 요청을 의도적으로 실패
        httpStatus: 503
    route:
    - destination:
        host: myapp.default.svc.cluster.local
    retries:
      attempts: 3            # 재시도 횟수
      perTryTimeout: 10s     # 재시도당 타임아웃
      retryOn: 5xx,reset,connect-failure,refused-stream
```

## 완벽한 Graceful Shutdown 검증 절차

### 1. 종합 테스트 스크립트

```bash
#!/bin/bash
# graceful_shutdown_test.sh

APP_NAME="$1"
NAMESPACE="${2:-default}"

if [[ -z "$APP_NAME" ]]; then
    echo "Usage: $0 <app_name> [namespace]"
    exit 1
fi

echo "=== Graceful Shutdown Test for $APP_NAME ==="
echo

# 현재 Pod 목록
PODS=$(kubectl get pods -l app="$APP_NAME" -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}')
echo "Current pods: $PODS"
echo

# 테스트용 트래픽 생성
echo "Starting background traffic..."
kubectl run traffic-generator --rm -i --tty --image=curlimages/curl -- /bin/sh -c "
while true; do
  curl -s http://$APP_NAME.$NAMESPACE.svc.cluster.local:8080/health || echo 'FAILED'
  sleep 0.1
done
" &

TRAFFIC_PID=$!
echo "Traffic generator PID: $TRAFFIC_PID"

sleep 5

# Pod 하나씩 삭제하면서 모니터링
for POD in $PODS; do
    echo
    echo "Testing graceful shutdown of pod: $POD"
    
    # 삭제 전 연결 수 확인
    echo "Connections before deletion:"
    kubectl exec "$POD" -n "$NAMESPACE" -- netstat -an | grep ":8080.*ESTABLISHED" | wc -l 2>/dev/null || echo "N/A"
    
    # Pod 삭제
    kubectl delete pod "$POD" -n "$NAMESPACE" &
    DELETE_PID=$!
    
    # 삭제 과정 모니터링
    for i in $(seq 1 60); do
        STATUS=$(kubectl get pod "$POD" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "NotFound")
        
        if [[ "$STATUS" == "NotFound" ]]; then
            echo "Pod $POD terminated after ${i} seconds"
            break
        fi
        
        echo "[$i] Pod status: $STATUS"
        sleep 1
    done
    
    # 새 Pod가 Ready 상태가 될 때까지 대기
    kubectl wait --for=condition=Ready pod -l app="$APP_NAME" -n "$NAMESPACE" --timeout=60s
    
    echo "Graceful shutdown test for $POD completed"
    echo "---"
done

# 트래픽 생성기 종료
kill $TRAFFIC_PID 2>/dev/null
kubectl delete pod traffic-generator --ignore-not-found

echo "All graceful shutdown tests completed"
```

### 2. 실시간 Metrics 모니터링

```bash
# Prometheus 쿼리로 실시간 모니터링
#!/bin/bash
# monitor_graceful_shutdown.sh

PROMETHEUS_URL="http://prometheus:9090"
APP_NAME="$1"

echo "Monitoring graceful shutdown metrics for: $APP_NAME"

while true; do
    TIMESTAMP=$(date '+%H:%M:%S')
    
    # 활성 연결 수
    ACTIVE_CONN=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(envoy_http_downstream_cx_active{app=\"$APP_NAME\"})" | jq -r '.data.result[0].value[1] // "0"')
    
    # 초당 요청 수
    RPS=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(envoy_cluster_upstream_rq_total{app=\"$APP_NAME\"}[1m]))" | jq -r '.data.result[0].value[1] // "0"')
    
    # 에러율
    ERROR_RATE=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(rate(envoy_cluster_upstream_rq_xx{envoy_response_code=~\"5..\",app=\"$APP_NAME\"}[1m]))" | jq -r '.data.result[0].value[1] // "0"')
    
    printf "[%s] Connections: %s, RPS: %.2f, Errors/s: %.2f, " "$TIMESTAMP" "$ACTIVE_CONN" "$RPS" "$ERROR_RATE"
    
    sleep 5
done
```

## Production 환경 모범 사례

### 1. 다단계 Health Check

```yaml
# 애플리케이션 배포 시 권장 설정
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 60    # 충분한 종료 시간
      containers:
      - name: app
        readinessProbe:
          httpGet:
            path: /ready     # 애플리케이션 준비 상태
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
          failureThreshold: 3
        livenessProbe:
          httpGet:
            path: /alive     # 애플리케이션 생존 상태  
            port: 8080
          initialDelaySeconds: 60
          periodSeconds: 10
          failureThreshold: 5
        lifecycle:
          preStop:
            exec:
              command: ["/app/graceful-shutdown.sh"]
```

### 2. Load Balancer 설정 최적화

```yaml
# AWS Load Balancer Controller 설정
apiVersion: v1
kind: Service
metadata:
  name: myapp-service
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: nlb
    service.beta.kubernetes.io/aws-load-balancer-connection-draining-enabled: "true"
    service.beta.kubernetes.io/aws-load-balancer-connection-draining-timeout: "60"
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-interval: "10"      # 빠른 감지
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-timeout: "5"
    service.beta.kubernetes.io/aws-load-balancer-healthy-threshold: "2"         # 빠른 복구
    service.beta.kubernetes.io/aws-load-balancer-unhealthy-threshold: "2"       # 빠른 제외
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 8080
  selector:
    app: myapp
```

### 3. 모니터링 및 알림

```yaml
# Prometheus Alert Rules
groups:
- name: graceful-shutdown
  rules:
  - alert: HighErrorRateDuringDeployment
    expr: |
      sum(rate(envoy_cluster_upstream_rq_xx{envoy_response_code=~"5.."}[1m])) by (app)
      /
      sum(rate(envoy_cluster_upstream_rq_total[1m])) by (app)
      > 0.01
    for: 1m
    labels:
      severity: warning
    annotations:
      summary: "High error rate during deployment"
      description: "App {{ $labels.app }} has error rate > 1% during deployment"

  - alert: FailedGracefulShutdown
    expr: |
      increase(kube_pod_container_status_terminated_reason{reason="Error"}[5m]) > 0
    for: 0m
    labels:
      severity: critical
    annotations:
      summary: "Pod failed to shutdown gracefully"
      description: "Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} failed graceful shutdown"
```

## 정리

완벽한 Graceful Shutdown을 위한 핵심 원칙:

### 1. 신뢰하지 말고 검증하라

- Kubernetes endpoint 업데이트 지연 가능성
- NLB health check는 비동기적
- Istio configuration 전파에 시간 소요

### 2. 다층 방어 전략

- **Application 레벨**: PreStop hook + Health check endpoint
- **Service Mesh 레벨**: Connection pool + Outlier detection  
- **Load Balancer 레벨**: Connection draining + 빠른 health check

### 3. 실시간 검증

- 트래픽 모니터링으로 실제 연결 상태 확인
- Metrics 기반 자동화된 검증
- 장애 시 즉시 롤백 가능한 체계

### 4. Production 체크리스트

- [ ] `terminationGracePeriodSeconds` 충분히 설정 (60s+)
- [ ] PreStop hook에서 활성 연결 대기
- [ ] Health check endpoint 구현
- [ ] Load balancer connection draining 활성화
- [ ] 실시간 에러율 모니터링
- [ ] 자동화된 graceful shutdown 테스트

**기억할 점**: "완벽한 무중단 배포는 기술적 구현뿐만 아니라 지속적인 검증과 모니터링이 필요하다."

## 관련 문서

- [Istio Traffic Interception](../devops/istio-traffic-interception.md)
- [Kubernetes Pod Debugging](pod-debugging.md)
- [Prometheus 모니터링 설계](../monitoring/prometheus-monitoring-design.md)
