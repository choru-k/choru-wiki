---
tags:
  - Observability
  - Metrics
  - Prometheus
  - Grafana
  - Guide
---

# 13.1C 메트릭 수집 - 시스템 건강도 측정

메트릭 수집은 시스템의 **수치화된 상태 정보**를 수집하고 추적하여, 시스템의 성능과 건강 상태를 실시간으로 모니터링하는 기술입니다. Prometheus와 Grafana를 이용한 대표적인 메트릭 스택을 중심으로 실제 비즈니스 환경에서 활용할 수 있는 메트릭 수집 시스템을 구축해보겠습니다.

## 🔢 Prometheus + Grafana 모니터링 스택

### 메트릭 수집기 구현

```python
from prometheus_client import Counter, Histogram, Gauge, start_http_server, CollectorRegistry
import time
import threading
import random
from typing import Dict, Any
import psutil

class MetricsCollector:
    """메트릭 수집기"""
    
    def __init__(self):
        # 커스텀 레지스트리 (독립적인 메트릭 관리)
        self.registry = CollectorRegistry()
        
        # 비즈니스 메트릭들
        self.payment_requests_total = Counter(
            'payment_requests_total',
            'Total number of payment requests',
            ['status', 'gateway', 'user_tier'],
            registry=self.registry
        )
        
        self.payment_duration_seconds = Histogram(
            'payment_duration_seconds',
            'Payment processing duration',
            ['gateway', 'payment_method'],
            buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
            registry=self.registry
        )
        
        self.payment_amount = Histogram(
            'payment_amount_usd',
            'Payment amounts in USD',
            ['currency', 'user_tier'],
            buckets=[1, 10, 50, 100, 500, 1000, 5000],
            registry=self.registry
        )
        
        # 시스템 메트릭들
        self.database_connections_active = Gauge(
            'database_connections_active',
            'Number of active database connections',
            ['database', 'pool'],
            registry=self.registry
        )
        
        self.memory_usage_bytes = Gauge(
            'memory_usage_bytes',
            'Memory usage in bytes',
            ['type'],
            registry=self.registry
        )
        
        self.cpu_usage_percent = Gauge(
            'cpu_usage_percent',
            'CPU usage percentage',
            ['core'],
            registry=self.registry
        )
        
        # 에러 메트릭들
        self.error_count = Counter(
            'errors_total',
            'Total number of errors',
            ['service', 'error_type', 'severity'],
            registry=self.registry
        )
        
        # 시스템 메트릭 수집 시작
        self.start_system_metrics_collection()
    
    def record_payment_request(self, status: str, gateway: str, user_tier: str, 
                             duration: float, amount: float, currency: str, 
                             payment_method: str):
        """결제 요청 메트릭 기록"""
        # 요청 카운트
        self.payment_requests_total.labels(
            status=status,
            gateway=gateway, 
            user_tier=user_tier
        ).inc()
        
        # 처리 시간
        self.payment_duration_seconds.labels(
            gateway=gateway,
            payment_method=payment_method
        ).observe(duration)
        
        # 결제 금액
        self.payment_amount.labels(
            currency=currency,
            user_tier=user_tier
        ).observe(amount)
    
    def record_database_connection(self, database: str, pool: str, active_connections: int):
        """데이터베이스 연결 메트릭"""
        self.database_connections_active.labels(
            database=database,
            pool=pool
        ).set(active_connections)
    
    def record_error(self, service: str, error_type: str, severity: str):
        """에러 메트릭 기록"""
        self.error_count.labels(
            service=service,
            error_type=error_type,
            severity=severity
        ).inc()
    
    def start_system_metrics_collection(self):
        """시스템 메트릭 수집 시작"""
        def collect_system_metrics():
            while True:
                try:
                    # 메모리 사용량
                    memory = psutil.virtual_memory()
                    self.memory_usage_bytes.labels(type='used').set(memory.used)
                    self.memory_usage_bytes.labels(type='available').set(memory.available)
                    self.memory_usage_bytes.labels(type='total').set(memory.total)
                    
                    # CPU 사용량
                    cpu_percents = psutil.cpu_percent(percpu=True)
                    for i, cpu_percent in enumerate(cpu_percents):
                        self.cpu_usage_percent.labels(core=f'cpu{i}').set(cpu_percent)
                    
                    time.sleep(5)  # 5초마다 수집
                    
                except Exception as e:
                    print(f"시스템 메트릭 수집 오류: {e}")
                    time.sleep(5)
        
        # 별도 스레드에서 시스템 메트릭 수집
        threading.Thread(target=collect_system_metrics, daemon=True).start()
    
    def start_metrics_server(self, port: int = 8000):
        """메트릭 서버 시작"""
        start_http_server(port, registry=self.registry)
        print(f"📊 Metrics server started on port {port}")
        print(f"    http://localhost:{port}/metrics")
```

### 메트릭이 포함된 결제 서비스

```python
# 메트릭을 포함한 결제 서비스
class InstrumentedPaymentService:
    """메트릭이 포함된 결제 서비스"""
    
    def __init__(self, metrics_collector: MetricsCollector):
        self.metrics = metrics_collector
        self.logger = ContextualLogger('instrumented_payment_service')  # 이전 섹션에서 정의
        self.db_connection_count = 15  # 시뮬레이션
    
    def process_payment(self, order_id: str, user_id: str, amount: float, 
                       user_tier: str = "standard", payment_method: str = "credit_card"):
        """메트릭 수집이 포함된 결제 처리"""
        start_time = time.time()
        gateway = "stripe"
        currency = "USD"
        
        # 컨텍스트 설정
        request_id = str(uuid.uuid4())
        request_id_context.set(request_id)
        user_id_context.set(user_id)
        
        self.logger.info("Payment processing started",
                        order_id=order_id,
                        amount=amount,
                        user_tier=user_tier,
                        payment_method=payment_method)
        
        try:
            # 데이터베이스 연결 상태 기록
            self.metrics.record_database_connection(
                database="payment_db",
                pool="main_pool", 
                active_connections=self.db_connection_count
            )
            
            # 비즈니스 로직 시뮬레이션
            self._simulate_payment_processing(amount, user_tier)
            
            duration = time.time() - start_time
            
            # 성공 메트릭 기록
            self.metrics.record_payment_request(
                status="success",
                gateway=gateway,
                user_tier=user_tier,
                duration=duration,
                amount=amount,
                currency=currency,
                payment_method=payment_method
            )
            
            self.logger.info("Payment completed successfully",
                           order_id=order_id,
                           duration_seconds=round(duration, 3),
                           amount=amount)
            
            return {
                'status': 'success',
                'transaction_id': f'txn_{uuid.uuid4()}',
                'duration': duration
            }
            
        except PaymentException as e:
            duration = time.time() - start_time
            
            # 실패 메트릭 기록
            self.metrics.record_payment_request(
                status="failed",
                gateway=gateway,
                user_tier=user_tier,
                duration=duration,
                amount=amount,
                currency=currency,
                payment_method=payment_method
            )
            
            # 에러 메트릭 기록
            self.metrics.record_error(
                service="payment",
                error_type=type(e).__name__,
                severity="high" if amount > 1000 else "medium"
            )
            
            self.logger.error("Payment failed",
                            order_id=order_id,
                            error=str(e),
                            duration_seconds=round(duration, 3))
            
            raise
    
    def _simulate_payment_processing(self, amount: float, user_tier: str):
        """결제 처리 시뮬레이션"""
        # 처리 시간 시뮬레이션
        base_time = 0.1
        if user_tier == "premium":
            base_time *= 0.8  # 프리미엄 사용자는 더 빠르게
        elif amount > 1000:
            base_time *= 1.5  # 고액 결제는 더 오래
        
        time.sleep(base_time + random.uniform(0, 0.3))
        
        # 간헐적 실패 시뮬레이션
        failure_rate = 0.1  # 10% 실패율
        if user_tier == "premium":
            failure_rate = 0.05  # 프리미엄 사용자는 실패율 낮음
        
        if random.random() < failure_rate:
            if random.random() < 0.3:
                raise PaymentGatewayException("Gateway timeout")
            else:
                raise PaymentValidationException("Invalid payment method")
        
        # 데이터베이스 커넥션 증가 시뮬레이션
        self.db_connection_count = min(20, self.db_connection_count + 1)

class PaymentException(Exception):
    pass

class PaymentGatewayException(PaymentException):
    pass

class PaymentValidationException(PaymentException):
    pass
```

## 📊 대시보드용 메트릭 쿼리

### Prometheus 쿼리 예시들

```python
# 대시보드용 메트릭 쿼리 예시
class MetricsDashboard:
    """메트릭 대시보드 (Grafana 쿼리 시뮬레이션)"""
    
    @staticmethod
    def get_sample_queries():
        """실제 Prometheus 쿼리 예시들"""
        return {
            # 결제 성공률 (지난 5분간)
            "payment_success_rate": '''
                sum(rate(payment_requests_total{status="success"}[5m])) / 
                sum(rate(payment_requests_total[5m])) * 100
            ''',
            
            # 평균 응답 시간 (게이트웨이별)
            "avg_response_time_by_gateway": '''
                avg(rate(payment_duration_seconds_sum[5m])) by (gateway) / 
                avg(rate(payment_duration_seconds_count[5m])) by (gateway)
            ''',
            
            # 에러율 (심각도별)
            "error_rate_by_severity": '''
                sum(rate(errors_total[5m])) by (severity)
            ''',
            
            # 데이터베이스 연결 사용률
            "db_connection_usage": '''
                database_connections_active / 20 * 100
            ''',
            
            # 고액 결제 비율
            "high_value_payment_ratio": '''
                sum(payment_amount_usd_bucket{le="1000"}) / 
                sum(payment_amount_usd_count) * 100
            ''',
            
            # CPU 사용률 (전체 평균)
            "avg_cpu_usage": '''
                avg(cpu_usage_percent)
            ''',
            
            # 메모리 사용률
            "memory_usage_ratio": '''
                memory_usage_bytes{type="used"} / 
                memory_usage_bytes{type="total"} * 100
            '''
        }
    
    @staticmethod
    def print_dashboard_info():
        print(", 📊 Grafana 대시보드 설정 가이드")
        print("=" * 50)
        
        queries = MetricsDashboard.get_sample_queries()
        
        for title, query in queries.items():
            print(f", 📈 {title.replace('_', ' ').title()}:")
            print(f"Query: {query.strip()}")
        
        print(f", 🎯 알림 규칙 예시:")
        alerts = {
            "High Error Rate": "rate(errors_total{severity='high'}[5m]) > 0.1",
            "Payment Success Rate Low": "payment_success_rate < 95",
            "Database Connection High": "database_connections_active > 18",
            "High Response Time": "avg_response_time_by_gateway > 2.0",
            "Memory Usage High": "memory_usage_ratio > 85"
        }
        
        for alert_name, condition in alerts.items():
            print(f"  \u2022 {alert_name}: {condition}")
```

### 주요 메트릭 타입 이해

#### 1. Counter - 누적 카운터

```python
# 사용 예시
payment_requests_total.labels(status="success", gateway="stripe").inc()
payment_requests_total.labels(status="failed", gateway="paypal").inc(2)

# Prometheus 쿼리
# 전체 요청 수: sum(payment_requests_total)
# 5분 간 요청률: rate(payment_requests_total[5m])
# 성공률: sum(rate(payment_requests_total{status="success"}[5m])) / sum(rate(payment_requests_total[5m]))
```

#### 2. Histogram - 분포 측정

```python
# 사용 예시
payment_duration_seconds.labels(gateway="stripe").observe(0.234)
payment_amount.labels(currency="USD").observe(99.99)

# Prometheus 쿼리
# 95백분위수: histogram_quantile(0.95, payment_duration_seconds)
# 평균 처리시간: rate(payment_duration_seconds_sum[5m]) / rate(payment_duration_seconds_count[5m])
# 2초 이상 요청 비율: payment_duration_seconds_bucket{le="2.0"}
```

#### 3. Gauge - 현재 상태 값

```python
# 사용 예시
database_connections_active.labels(database="payment_db").set(18)
memory_usage_bytes.labels(type="used").set(8589934592)  # 8GB

# Prometheus 쿼리
# 현재 연결 수: database_connections_active
# 메모리 사용률: memory_usage_bytes{type="used"} / memory_usage_bytes{type="total"} * 100
```

## 📈 성능 최적화 전략

### 1. 메트릭 카디널리티 관리

```python
# ✅ 낮은 카디널리티 (권장)
user_requests_total = Counter(
    'user_requests_total',
    'Total user requests', 
    ['endpoint', 'method', 'status']  # 3개 레이블
)

# ⚠️ 높은 카디널리티 (주의)
user_requests_total = Counter(
    'user_requests_total',
    'Total user requests',
    ['user_id', 'endpoint', 'method', 'status', 'region', 'version']  # 6개 레이블
)
# 카디널리티가 너무 높으면 메모리 사용량과 성능이 악화됨
```

### 2. 샘플링 전략

```python
import random

def should_record_metric(sample_rate: float = 0.1) -> bool:
    """샘플링 기반 메트릭 기록 결정"""
    return random.random() < sample_rate

# 높은 빈도의 메트릭은 샘플링 적용
def record_low_level_metric(operation: str, duration: float):
    if should_record_metric(0.01):  # 1%만 기록
        low_level_operations.labels(operation=operation).observe(duration)

# 중요한 비즈니스 메트릭은 모두 기록
def record_business_metric(event: str, amount: float):
    business_events.labels(event=event).observe(amount)  # 전체 기록
```

### 3. 비동기 메트릭 전송

```python
import asyncio
from collections import deque
import threading

class AsyncMetricsCollector:
    """비동기 메트릭 수집기"""
    
    def __init__(self, batch_size: int = 100, flush_interval: float = 5.0):
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.metrics_queue = deque()
        self.lock = threading.Lock()
        self.start_background_flusher()
    
    def record_metric_async(self, metric_data: dict):
        """비동기로 메트릭 기록"""
        with self.lock:
            self.metrics_queue.append(metric_data)
            
            # 배치 크기 도달 시 즉시 플러시
            if len(self.metrics_queue) >= self.batch_size:
                self._flush_metrics()
    
    def _flush_metrics(self):
        """메트릭 배치 전송"""
        if not self.metrics_queue:
            return
            
        # 배치로 메트릭 처리
        batch = list(self.metrics_queue)
        self.metrics_queue.clear()
        
        # 실제로는 여기서 Prometheus나 다른 저장소로 전솤
        for metric in batch:
            self._process_metric(metric)
    
    def start_background_flusher(self):
        """백그라운드 플러시 시작"""
        def flush_periodically():
            while True:
                time.sleep(self.flush_interval)
                with self.lock:
                    self._flush_metrics()
        
        threading.Thread(target=flush_periodically, daemon=True).start()
```

## 🔧 메트릭 시스템 테스트

```python
# 메트릭 시스템 테스트
def test_metrics_system():
    print("=== Metrics Collection 테스트 ===")
    
    # 메트릭 수집기 시작
    metrics = MetricsCollector()
    metrics.start_metrics_server(port=8000)
    
    # 메트릭이 포함된 결제 서비스
    payment_service = InstrumentedPaymentService(metrics)
    
    print(", --- 결제 요청 시뮬레이션 ---")
    
    # 다양한 결제 시나리오 시뮬레이션
    test_scenarios = [
        ("order_1", "user_123", 50.0, "standard", "credit_card"),
        ("order_2", "user_456", 150.0, "premium", "paypal"),
        ("order_3", "user_789", 1200.0, "standard", "credit_card"),
        ("order_4", "user_321", 25.0, "basic", "debit_card"),
        ("order_5", "user_654", 500.0, "premium", "apple_pay"),
    ]
    
    for order_id, user_id, amount, tier, method in test_scenarios:
        try:
            result = payment_service.process_payment(
                order_id, user_id, amount, tier, method
            )
            print(f"\u2705 {order_id}: ${amount} ({tier}) - {result['status']}")
        except Exception as e:
            print(f"\u274c {order_id}: ${amount} ({tier}) - {e}")
        
        time.sleep(0.2)  # 약간의 지연
    
    print(f", 📊 메트릭 서버 실행 중: http://localhost:8000/metrics")
    print("   Grafana에서 이 엔드포인트를 데이터 소스로 추가하세요")
    
    # 대시보드 정보 출력
    MetricsDashboard.print_dashboard_info()

# 실행
if __name__ == "__main__":
    import uuid
    from contextvars import ContextVar
    
    # 이전 섹션의 ContextVar 사용
    request_id_context = ContextVar('request_id', default='')
    user_id_context = ContextVar('user_id', default='')
    
    test_metrics_system()
    
    print(", \u23f0 메트릭 수집을 위해 30초 대기...")
    time.sleep(30)
```

## 핵심 요점

### 1. 성능 중심의 메트릭 설계

메트릭 수집 자체가 시스템 성능에 미치는 영향을 최소화하면서 의미 있는 인사이트를 제공해야 합니다.

### 2. 비즈니스 영향 중심의 메트릭

기술적 메트릭뿐만 아니라 비즈니스 KPI와 직결되는 메트릭을 수집해야 합니다.

### 3. 대시보드를 통한 시각화

Grafana 같은 대시보드 도구를 통해 메트릭을 시각적으로 표현하고 트렌드를 쉽게 파악할 수 있습니다.

### 4. 알림과의 연동

메트릭에 임계값을 설정하여 자동으로 문제를 감지하고 알림을 발송할 수 있습니다.

---

**이전**: [13.1B 구조화된 로깅](01b-structured-logging.md)  
**다음**: [13.1D 알림 관리](01d-alert-management.md)에서 지능적인 알림 시스템으로 문제를 사전에 감지하는 방법을 학습합니다.
