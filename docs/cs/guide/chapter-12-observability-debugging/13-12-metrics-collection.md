---
tags:
  - grafana
  - hands-on
  - intermediate
  - medium-read
  - metrics_collection
  - observability
  - prometheus
  - system_monitoring
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "3-5시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 13.1b 메트릭 수집 - 시스템 건강도 측정

## 🔢 Prometheus + Grafana 모니터링 스택

메트릭은 시스템의 상태를 숫자로 추적합니다. 로그가 "무엇이 일어났는가?"를 답한다면, 메트릭은 "시스템이 얼마나 건강한가?"를 답합니다.

### Python으로 구현하는 메트릭 수집기

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

## 🔍 메트릭이 포함된 결제 서비스

### 비즈니스 로직과 메트릭 통합

```python
# 메트릭을 포함한 결제 서비스
class InstrumentedPaymentService:
    """메트릭이 포함된 결제 서비스"""
    
    def __init__(self, metrics_collector: MetricsCollector):
        self.metrics = metrics_collector
        self.logger = ContextualLogger('instrumented_payment_service')
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

## 📋 Grafana 대시보드 설계

### 실제 Prometheus 쿼리 예시

```python
# 대시보드용 메트릭 쿼리 예시
class MetricsDashboard:
    """메트릭 대시보드 (Grafana 쿼리 시뮬레이션)"""
    
    @staticmethod
    def get_sample_queries():
        """실제 Prometheus 쿼리 예시들"""
        return {
            # 결제 성공율 (지난 5분간)
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
        print("\n📊 Grafana 대시보드 설정 가이드")
        print("=" * 50)
        
        queries = MetricsDashboard.get_sample_queries()
        
        for title, query in queries.items():
            print(f"\n📈 {title.replace('_', ' ').title()}:")
            print(f"Query: {query.strip()}")
        
        print(f"\n🎯 알림 규칙 예시:")
        alerts = {
            "High Error Rate": "rate(errors_total{severity='high'}[5m]) > 0.1",
            "Payment Success Rate Low": "payment_success_rate < 95",
            "Database Connection High": "database_connections_active > 18",
            "High Response Time": "avg_response_time_by_gateway > 2.0",
            "Memory Usage High": "memory_usage_ratio > 85"
        }
        
        for alert_name, condition in alerts.items():
            print(f"  • {alert_name}: {condition}")
```

## 🧪 메트릭 시스템 테스트

```python
# 메트릭 시스템 테스트
def test_metrics_system():
    print("=== Metrics Collection 테스트 ===\n")
    
    # 메트릭 수집기 시작
    metrics = MetricsCollector()
    metrics.start_metrics_server(port=8000)
    
    # 메트릭이 포함된 결제 서비스
    payment_service = InstrumentedPaymentService(metrics)
    
    print("--- 결제 요청 시뮬레이션 ---")
    
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
            print(f"✅ {order_id}: ${amount} ({tier}) - {result['status']}")
        except Exception as e:
            print(f"❌ {order_id}: ${amount} ({tier}) - {e}")
        
        time.sleep(0.2)  # 약간의 지연
    
    print(f"\n📊 메트릭 서버 실행 중: http://localhost:8000/metrics")
    print("   Grafana에서 이 엔드포인트를 데이터 소스로 추가하세요")
    
    # 대시보드 정보 출력
    MetricsDashboard.print_dashboard_info()

# 실행
if __name__ == "__main__":
    import uuid
    test_metrics_system()
    
    print("\n⏰ 메트릭 수집을 위해 30초 대기...")
    time.sleep(30)
```

## 핵심 요점

### 1. 메트릭 타입별 활용

- **Counter**: 누적 카운트 (요청 수, 에러 수)
- **Gauge**: 현재 값 (메모리 사용량, 연결 수)
- **Histogram**: 분포 (응답시간, 요청 크기)

### 2. 비즈니스 영향과 직결

시스템 메트릭과 비즈니스 메트릭을 함께 수집하여 기술적 문제를 비즈니스 영향으로 연결합니다.

### 3. 성능 최적화

메트릭 수집 오버헤드를 최소화하고, cardinality를 제한하여 성능 영향을 관리합니다.

---

**이전**: [01a 구조화된 로깅](12-11-structured-logging.md)  
**다음**: [01c 알림 관리](12-14-alert-management.md)에서 지능적인 알림 시스템 구축을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 3-5시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-13-observability-debugging)

- [13.1 로깅 및 모니터링 시스템 - 시스템의 눈과 귀 개요](./12-40-logging-monitoring.md)
- [13.1A 관찰 가능성 기초 - 시스템을 보는 눈](./12-10-observability-foundations.md)
- [13.1a 구조화된 로깅 - 검색 가능한 로그 시스템](./12-11-structured-logging.md)
- [13.1B 구조화된 로깅 - 검색 가능한 로그](./12-13-structured-logging.md)
- [13.1c 알림 관리 - 문제를 미리 감지하기](./12-14-alert-management.md)

### 🏷️ 관련 키워드

`prometheus`, `grafana`, `metrics_collection`, `observability`, `system_monitoring`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
