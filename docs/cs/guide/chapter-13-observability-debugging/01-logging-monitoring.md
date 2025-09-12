---
tags:
  - Observability
  - Logging
  - Monitoring
  - ELK Stack
  - Prometheus
  - Guide
---

# 13.1 로깅 및 모니터링 시스템 - 시스템의 눈과 귀

## 서론: 2023년 12월, 새벽 3시의 장애 추적

크리스마스 이브 새벽 3시, 우리 e-커머스 플랫폼에서 갑작스러운 장애가 발생했습니다. 고객들의 주문이 처리되지 않고 있었지만, 정작 어디서 문제가 발생했는지 찾는 데만 2시간이 걸렸습니다.

### 🔥 12월 24일 새벽 3:00 - 침묵하는 시스템

```bash
# 상황: 갑작스러운 주문 처리 중단
📊 주문 성공률: 95% → 12% (급락)
💳 결제 실패율: 5% → 78% (폭증)
📱 고객 컴플레인: 0건 → 247건 (30분 내)

# 하지만 우리가 본 것은...
$ systemctl status payment-service
● payment-service.service - Payment Processing Service
   Loaded: loaded (/etc/systemd/system/payment-service.service; enabled)
   Active: active (running) since Dec 24 02:45:12 2023
   ...

$ curl http://payment-service:8080/health
HTTP/1.1 200 OK
{"status": "healthy", "timestamp": "2023-12-24T03:15:42Z"}

# 😱 모든 서비스가 "정상"이라고 말하고 있었습니다!
```

**새벽 3:30 - 수동 로그 파고들기 시작**

```bash
# Payment Service 로그를 일일이 확인
$ tail -f /var/log/payment-service/app.log
2023-12-24 03:14:23 INFO  PaymentController - Processing payment for order 12345
2023-12-24 03:14:24 INFO  PaymentController - Processing payment for order 12346
2023-12-24 03:14:25 INFO  PaymentController - Processing payment for order 12347
# ... 정상적인 로그만 계속 출력

# Database 연결 로그 확인
$ tail -f /var/log/payment-service/db.log
2023-12-24 03:14:23 DEBUG Connection pool: 18/20 active connections
2023-12-24 03:14:24 DEBUG Connection pool: 19/20 active connections  
2023-12-24 03:14:25 DEBUG Connection pool: 20/20 active connections
2023-12-24 03:14:26 ERROR Connection pool exhausted! Waiting for available connection...
2023-12-24 03:14:46 ERROR Connection timeout after 20 seconds
2023-12-24 03:14:46 ERROR java.sql.SQLException: Connection is not available

# 🎯 발견! 커넥션 풀 고갈이 원인이었습니다!
```

**새벽 5:00 - 문제 해결 후 반성**

문제를 해결한 후, 우리는 중요한 깨달음을 얻었습니다:

- **로그가 분산되어 있어서 전체 상황 파악이 어려웠음**
- **메트릭이 없어서 커넥션 풀 상태를 몰랐음**
- **알림 시스템이 없어서 문제를 늦게 발견했음**
- **디버깅에 필요한 정보가 로그에 부족했음**

이 경험으로 우리는 **체계적인 관찰 가능성(Observability) 시스템**을 구축하게 되었습니다.

## 🔍 관찰 가능성(Observability)의 세 기둥

### 📊 Logs, Metrics, Traces의 황금 삼각형

```mermaid
graph TD
    subgraph "관찰 가능성의 세 기둥"
        L[Logs<br/>로그<br/>"무엇이 일어났나?"]
        M[Metrics<br/>메트릭<br/>"시스템은 얼마나 건강한가?"]
        T[Traces<br/>추적<br/>"요청이 어디를 거쳐갔나?"]
    end
    
    subgraph "각각의 역할"
        L --> L1["이벤트 기록<br/>디버깅 정보<br/>에러 상세"]
        M --> M1["시스템 상태<br/>성능 지표<br/>비즈니스 메트릭"]
        T --> T1["요청 흐름<br/>서비스 의존성<br/>병목 지점"]
    end
    
    subgraph "통합된 관찰"
        O[Observable System<br/>관찰 가능한 시스템<br/>문제의 근본 원인을<br/>빠르게 파악]
    end
    
    L1 --> O
    M1 --> O
    T1 --> O
    
    style L fill:#e3f2fd
    style M fill:#c8e6c9
    style T fill:#fff3e0
    style O fill:#ffcdd2
```

## 📝 Structured Logging: 검색 가능한 로그

### 🏗️ 구조화된 로그 시스템 구축

```python
import logging
import json
import time
import threading
from datetime import datetime
from typing import Dict, Any, Optional
from contextvars import ContextVar
import uuid

# 컨텍스트 변수 (요청별 추적 정보)
request_id_context: ContextVar[str] = ContextVar('request_id', default='')
user_id_context: ContextVar[str] = ContextVar('user_id', default='')

class StructuredFormatter(logging.Formatter):
    """구조화된 JSON 로그 포매터"""
    
    def format(self, record):
        # 기본 로그 정보
        log_entry = {
            'timestamp': datetime.fromtimestamp(record.created).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }
        
        # 컨텍스트 정보 추가
        request_id = request_id_context.get()
        user_id = user_id_context.get()
        
        if request_id:
            log_entry['request_id'] = request_id
        if user_id:
            log_entry['user_id'] = user_id
        
        # 추가 필드들
        if hasattr(record, 'extra_fields'):
            log_entry.update(record.extra_fields)
        
        # 예외 정보
        if record.exc_info:
            log_entry['exception'] = self.formatException(record.exc_info)
        
        return json.dumps(log_entry, ensure_ascii=False)

class ContextualLogger:
    """컨텍스트를 포함한 로거"""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.setup_logger()
    
    def setup_logger(self):
        """로거 설정"""
        # 핸들러 설정
        handler = logging.StreamHandler()
        handler.setFormatter(StructuredFormatter())
        
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.DEBUG)
    
    def info(self, message: str, **extra_fields):
        """정보 로그"""
        self._log(logging.INFO, message, extra_fields)
    
    def error(self, message: str, **extra_fields):
        """에러 로그"""
        self._log(logging.ERROR, message, extra_fields)
    
    def debug(self, message: str, **extra_fields):
        """디버그 로그"""
        self._log(logging.DEBUG, message, extra_fields)
    
    def warning(self, message: str, **extra_fields):
        """경고 로그"""
        self._log(logging.WARNING, message, extra_fields)
    
    def _log(self, level: int, message: str, extra_fields: Dict[str, Any]):
        """실제 로깅 실행"""
        extra = {'extra_fields': extra_fields} if extra_fields else {}
        self.logger.log(level, message, extra=extra)

# 비즈니스 로직에 적용한 예시
class PaymentService:
    """결제 서비스 (로깅 적용)"""
    
    def __init__(self):
        self.logger = ContextualLogger('payment_service')
        self.db_pool = DatabaseConnectionPool()
    
    def process_payment(self, order_id: str, user_id: str, amount: float):
        """결제 처리"""
        # 컨텍스트 설정
        request_id = str(uuid.uuid4())
        request_id_context.set(request_id)
        user_id_context.set(user_id)
        
        self.logger.info("Payment processing started", 
                        order_id=order_id,
                        amount=amount,
                        currency="USD")
        
        start_time = time.time()
        
        try:
            # 1. 주문 검증
            self.logger.debug("Validating order", order_id=order_id)
            order = self._validate_order(order_id)
            
            # 2. 사용자 인증
            self.logger.debug("Authenticating user", user_id=user_id)
            self._authenticate_user(user_id)
            
            # 3. 결제 처리
            self.logger.info("Processing payment gateway request",
                           gateway="stripe",
                           amount=amount)
            
            payment_result = self._call_payment_gateway(user_id, amount)
            
            # 4. 결과 기록
            processing_time = time.time() - start_time
            
            self.logger.info("Payment completed successfully",
                           order_id=order_id,
                           transaction_id=payment_result['transaction_id'],
                           processing_time_ms=round(processing_time * 1000, 2),
                           gateway_response_code=payment_result['response_code'])
            
            return {
                'status': 'success',
                'transaction_id': payment_result['transaction_id']
            }
            
        except PaymentGatewayException as e:
            processing_time = time.time() - start_time
            
            self.logger.error("Payment gateway error",
                            order_id=order_id,
                            error_code=e.error_code,
                            error_message=str(e),
                            processing_time_ms=round(processing_time * 1000, 2),
                            gateway="stripe")
            raise
            
        except Exception as e:
            processing_time = time.time() - start_time
            
            self.logger.error("Unexpected payment error",
                            order_id=order_id,
                            error_type=type(e).__name__,
                            error_message=str(e),
                            processing_time_ms=round(processing_time * 1000, 2))
            raise
    
    def _validate_order(self, order_id: str):
        """주문 검증"""
        # 데이터베이스 연결 상태 로깅
        pool_status = self.db_pool.get_status()
        
        self.logger.debug("Database connection status",
                         active_connections=pool_status['active'],
                         total_connections=pool_status['total'],
                         queue_size=pool_status['queue_size'])
        
        # 커넥션 풀 고갈 상황 감지
        if pool_status['active'] >= pool_status['total'] * 0.9:
            self.logger.warning("Database connection pool near exhaustion",
                              usage_percentage=(pool_status['active'] / pool_status['total']) * 100)
        
        try:
            connection = self.db_pool.get_connection(timeout=5)
            
            query_start = time.time()
            result = connection.execute("SELECT * FROM orders WHERE id = %s", (order_id,))
            query_time = time.time() - query_start
            
            self.logger.debug("Order query executed",
                            query_time_ms=round(query_time * 1000, 2),
                            rows_returned=len(result))
            
            if not result:
                self.logger.warning("Order not found", order_id=order_id)
                raise OrderNotFoundException(f"Order {order_id} not found")
            
            return result[0]
            
        except ConnectionPoolTimeout:
            self.logger.error("Database connection pool timeout",
                            timeout_seconds=5,
                            pool_status=pool_status)
            raise
        finally:
            if 'connection' in locals():
                self.db_pool.return_connection(connection)
    
    def _authenticate_user(self, user_id: str):
        """사용자 인증"""
        auth_start = time.time()
        
        try:
            # 외부 인증 서비스 호출
            response = self._call_auth_service(user_id)
            auth_time = time.time() - auth_start
            
            self.logger.debug("User authentication completed",
                            user_id=user_id,
                            auth_time_ms=round(auth_time * 1000, 2),
                            auth_service_response_time=response.get('response_time'))
            
        except AuthServiceException as e:
            auth_time = time.time() - auth_start
            
            self.logger.error("Authentication service error",
                            user_id=user_id,
                            auth_time_ms=round(auth_time * 1000, 2),
                            error_code=e.error_code,
                            service_status=e.service_status)
            raise
    
    def _call_payment_gateway(self, user_id: str, amount: float):
        """결제 게이트웨이 호출"""
        gateway_start = time.time()
        
        try:
            # 실제 결제 게이트웨이 호출 (시뮬레이션)
            result = {
                'transaction_id': f'txn_{uuid.uuid4()}',
                'response_code': '00',
                'response_time': round((time.time() - gateway_start) * 1000, 2)
            }
            
            gateway_time = time.time() - gateway_start
            
            self.logger.info("Payment gateway call completed",
                           user_id=user_id,
                           amount=amount,
                           gateway_time_ms=round(gateway_time * 1000, 2),
                           transaction_id=result['transaction_id'],
                           response_code=result['response_code'])
            
            return result
            
        except Exception as e:
            gateway_time = time.time() - gateway_start
            
            self.logger.error("Payment gateway call failed",
                            user_id=user_id,
                            amount=amount,
                            gateway_time_ms=round(gateway_time * 1000, 2),
                            error=str(e))
            raise PaymentGatewayException("Gateway call failed", error_code="GATEWAY_ERROR")

# 예외 클래스들
class PaymentGatewayException(Exception):
    def __init__(self, message, error_code=None):
        super().__init__(message)
        self.error_code = error_code

class OrderNotFoundException(Exception):
    pass

class AuthServiceException(Exception):
    def __init__(self, message, error_code=None, service_status=None):
        super().__init__(message)
        self.error_code = error_code
        self.service_status = service_status

class ConnectionPoolTimeout(Exception):
    pass

# Mock 클래스들
class DatabaseConnectionPool:
    def __init__(self):
        self.active = 18
        self.total = 20
        self.queue_size = 5
    
    def get_status(self):
        return {
            'active': self.active,
            'total': self.total,
            'queue_size': self.queue_size
        }
    
    def get_connection(self, timeout=10):
        if self.active >= self.total:
            raise ConnectionPoolTimeout("No connections available")
        return MockConnection()
    
    def return_connection(self, connection):
        pass

class MockConnection:
    def execute(self, query, params=None):
        return [{'id': params[0], 'status': 'active'}] if params else []

# 로깅 시스템 테스트
def test_structured_logging():
    print("=== Structured Logging 테스트 ===")
    
    payment_service = PaymentService()
    
    print("\n--- 정상 결제 처리 ---")
    try:
        result = payment_service.process_payment("order_12345", "user_789", 99.99)
        print(f"결제 성공: {result}")
    except Exception as e:
        print(f"결제 실패: {e}")
    
    print("\n--- 에러 상황 시뮬레이션 ---")
    # 커넥션 풀 고갈 시뮬레이션
    payment_service.db_pool.active = 20
    try:
        result = payment_service.process_payment("order_67890", "user_456", 199.99)
    except Exception as e:
        print(f"예상된 실패: {e}")

# 실행
if __name__ == "__main__":
    test_structured_logging()
```

## 📊 Metrics Collection: 시스템 건강도 측정

### 🔢 Prometheus + Grafana 모니터링 스택

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

# 메트릭 시스템 테스트
def test_metrics_system():
    print("=== Metrics Collection 테스트 ===")
    
    # 메트릭 수집기 시작
    metrics = MetricsCollector()
    metrics.start_metrics_server(port=8000)
    
    # 메트릭이 포함된 결제 서비스
    payment_service = InstrumentedPaymentService(metrics)
    
    print("\n--- 결제 요청 시뮬레이션 ---")
    
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

## 🚨 Alert Management: 문제를 미리 감지하기

### 📬 지능적인 알림 시스템

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Any, Callable, Optional
from datetime import datetime, timedelta
from enum import Enum
import threading
import time
import smtplib
import json
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart

class AlertSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class AlertStatus(Enum):
    TRIGGERED = "triggered"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    SUPPRESSED = "suppressed"

@dataclass
class Alert:
    id: str
    title: str
    description: str
    severity: AlertSeverity
    status: AlertStatus = AlertStatus.TRIGGERED
    timestamp: datetime = field(default_factory=datetime.now)
    labels: Dict[str, str] = field(default_factory=dict)
    annotations: Dict[str, str] = field(default_factory=dict)
    resolved_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None

class NotificationChannel(ABC):
    """알림 채널 추상 클래스"""
    
    @abstractmethod
    def send(self, alert: Alert) -> bool:
        pass

class EmailNotification(NotificationChannel):
    """이메일 알림 채널"""
    
    def __init__(self, smtp_server: str, smtp_port: int, username: str, password: str):
        self.smtp_server = smtp_server
        self.smtp_port = smtp_port
        self.username = username
        self.password = password
    
    def send(self, alert: Alert) -> bool:
        """이메일 알림 전송"""
        try:
            # 실제 구현에서는 SMTP 서버 연결
            print(f"📧 Email sent: {alert.title} ({alert.severity.value})")
            
            # 시뮬레이션을 위한 이메일 내용 출력
            email_content = self._format_email(alert)
            print(f"   Content: {email_content[:100]}...")
            
            return True
        except Exception as e:
            print(f"❌ Email send failed: {e}")
            return False
    
    def _format_email(self, alert: Alert) -> str:
        """이메일 내용 포맷팅"""
        return f"""
Alert: {alert.title}
Severity: {alert.severity.value.upper()}
Time: {alert.timestamp.isoformat()}

Description: {alert.description}

Labels: {json.dumps(alert.labels, indent=2)}
Annotations: {json.dumps(alert.annotations, indent=2)}

Please check the monitoring dashboard for more details.
        """

class SlackNotification(NotificationChannel):
    """Slack 알림 채널"""
    
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
    
    def send(self, alert: Alert) -> bool:
        """Slack 알림 전송"""
        try:
            # 실제로는 Slack 웹훅 호출
            print(f"💬 Slack notification: {alert.title}")
            
            slack_message = self._format_slack_message(alert)
            print(f"   Message: {slack_message}")
            
            return True
        except Exception as e:
            print(f"❌ Slack send failed: {e}")
            return False
    
    def _format_slack_message(self, alert: Alert) -> str:
        """Slack 메시지 포맷팅"""
        emoji_map = {
            AlertSeverity.LOW: "🟢",
            AlertSeverity.MEDIUM: "🟡", 
            AlertSeverity.HIGH: "🟠",
            AlertSeverity.CRITICAL: "🔴"
        }
        
        emoji = emoji_map.get(alert.severity, "⚠️")
        
        return f"{emoji} *{alert.title}* ({alert.severity.value})\n{alert.description}"

class PagerDutyNotification(NotificationChannel):
    """PagerDuty 알림 채널"""
    
    def __init__(self, integration_key: str):
        self.integration_key = integration_key
    
    def send(self, alert: Alert) -> bool:
        """PagerDuty 알림 전송"""
        try:
            # 실제로는 PagerDuty API 호출
            print(f"📟 PagerDuty incident: {alert.title}")
            return True
        except Exception as e:
            print(f"❌ PagerDuty send failed: {e}")
            return False

@dataclass
class AlertRule:
    """알림 규칙"""
    id: str
    name: str
    condition: str  # 실제로는 PromQL 쿼리 등
    severity: AlertSeverity
    for_duration: timedelta = timedelta(minutes=5)  # 지속 시간
    labels: Dict[str, str] = field(default_factory=dict)
    annotations: Dict[str, str] = field(default_factory=dict)
    enabled: bool = True

class AlertManager:
    """알림 관리자"""
    
    def __init__(self):
        self.alerts: Dict[str, Alert] = {}
        self.alert_rules: Dict[str, AlertRule] = {}
        self.notification_channels: List[NotificationChannel] = []
        self.routing_rules: List[Dict] = []
        self.suppression_rules: List[Dict] = []
        self.lock = threading.Lock()
        
        # 알림 통계
        self.stats = {
            'total_alerts': 0,
            'alerts_by_severity': {severity: 0 for severity in AlertSeverity},
            'notification_success_rate': 0.0
        }
    
    def add_notification_channel(self, channel: NotificationChannel):
        """알림 채널 추가"""
        self.notification_channels.append(channel)
    
    def add_routing_rule(self, rule: Dict[str, Any]):
        """라우팅 규칙 추가"""
        # 예: {'match': {'severity': 'critical'}, 'channels': ['pagerduty', 'email']}
        self.routing_rules.append(rule)
    
    def add_suppression_rule(self, rule: Dict[str, Any]):
        """억제 규칙 추가 (중복 알림 방지)"""
        # 예: {'match': {'service': 'payment'}, 'duration': 3600}
        self.suppression_rules.append(rule)
    
    def add_alert_rule(self, rule: AlertRule):
        """알림 규칙 추가"""
        self.alert_rules[rule.id] = rule
    
    def trigger_alert(self, rule_id: str, metric_value: float, context: Dict[str, Any] = None):
        """알림 발생"""
        if rule_id not in self.alert_rules:
            return
        
        rule = self.alert_rules[rule_id]
        
        if not rule.enabled:
            return
        
        # 알림 생성
        alert_id = f"{rule_id}_{int(time.time())}"
        alert = Alert(
            id=alert_id,
            title=rule.name,
            description=rule.annotations.get('description', ''),
            severity=rule.severity,
            labels=rule.labels.copy(),
            annotations=rule.annotations.copy()
        )
        
        # 컨텍스트 정보 추가
        if context:
            alert.annotations.update({
                'metric_value': str(metric_value),
                'context': json.dumps(context)
            })
        
        with self.lock:
            # 억제 규칙 확인
            if self._is_suppressed(alert):
                print(f"🔇 Alert suppressed: {alert.title}")
                return
            
            # 알림 저장
            self.alerts[alert_id] = alert
            self.stats['total_alerts'] += 1
            self.stats['alerts_by_severity'][alert.severity] += 1
        
        print(f"🚨 Alert triggered: {alert.title} (severity: {alert.severity.value})")
        
        # 알림 전송
        self._send_notifications(alert)
    
    def _is_suppressed(self, alert: Alert) -> bool:
        """알림 억제 여부 확인"""
        for rule in self.suppression_rules:
            if self._matches_labels(alert.labels, rule.get('match', {})):
                # 억제 기간 확인
                suppression_duration = rule.get('duration', 3600)  # 기본 1시간
                
                # 같은 라벨 조합의 최근 알림 확인
                for existing_alert in self.alerts.values():
                    if (self._matches_labels(existing_alert.labels, rule.get('match', {})) and
                        (alert.timestamp - existing_alert.timestamp).total_seconds() < suppression_duration):
                        return True
        
        return False
    
    def _matches_labels(self, alert_labels: Dict[str, str], match_criteria: Dict[str, str]) -> bool:
        """라벨 매칭 확인"""
        for key, value in match_criteria.items():
            if alert_labels.get(key) != value:
                return False
        return True
    
    def _send_notifications(self, alert: Alert):
        """알림 전송"""
        # 라우팅 규칙에 따른 채널 선택
        target_channels = self._get_target_channels(alert)
        
        successful_sends = 0
        total_sends = 0
        
        for channel in target_channels:
            total_sends += 1
            if channel.send(alert):
                successful_sends += 1
        
        # 성공률 업데이트
        if total_sends > 0:
            success_rate = successful_sends / total_sends
            self.stats['notification_success_rate'] = (
                self.stats['notification_success_rate'] * 0.9 + success_rate * 0.1
            )
    
    def _get_target_channels(self, alert: Alert) -> List[NotificationChannel]:
        """라우팅 규칙에 따른 타겟 채널 선택"""
        target_channels = []
        
        for rule in self.routing_rules:
            if self._matches_labels(alert.labels, rule.get('match', {})):
                # 채널 타입에 따른 매핑 (실제로는 더 복잡한 로직)
                for channel_type in rule.get('channels', []):
                    if channel_type == 'email' and len(self.notification_channels) > 0:
                        target_channels.append(self.notification_channels[0])
                    elif channel_type == 'slack' and len(self.notification_channels) > 1:
                        target_channels.append(self.notification_channels[1])
                    elif channel_type == 'pagerduty' and len(self.notification_channels) > 2:
                        target_channels.append(self.notification_channels[2])
                break
        
        # 기본 채널 (규칙이 없으면 모든 채널)
        if not target_channels:
            target_channels = self.notification_channels
        
        return target_channels
    
    def acknowledge_alert(self, alert_id: str, acknowledged_by: str):
        """알림 확인"""
        if alert_id in self.alerts:
            alert = self.alerts[alert_id]
            alert.status = AlertStatus.ACKNOWLEDGED
            alert.acknowledged_by = acknowledged_by
            print(f"✅ Alert acknowledged: {alert.title} by {acknowledged_by}")
    
    def resolve_alert(self, alert_id: str):
        """알림 해결"""
        if alert_id in self.alerts:
            alert = self.alerts[alert_id]
            alert.status = AlertStatus.RESOLVED
            alert.resolved_at = datetime.now()
            print(f"🎯 Alert resolved: {alert.title}")
    
    def get_active_alerts(self) -> List[Alert]:
        """활성 알림 목록"""
        return [alert for alert in self.alerts.values() 
                if alert.status == AlertStatus.TRIGGERED]
    
    def get_statistics(self) -> Dict[str, Any]:
        """알림 통계"""
        active_alerts = len(self.get_active_alerts())
        
        return {
            **self.stats,
            'active_alerts': active_alerts,
            'total_rules': len(self.alert_rules),
            'notification_channels': len(self.notification_channels)
        }

# 실제 모니터링과 연동하는 메트릭 감시기
class MetricWatcher:
    """메트릭 감시기"""
    
    def __init__(self, metrics_collector: MetricsCollector, alert_manager: AlertManager):
        self.metrics = metrics_collector
        self.alert_manager = alert_manager
        self.monitoring = True
        self.check_interval = 10  # 10초마다 체크
        
        # 메트릭 임계값들
        self.thresholds = {
            'error_rate_high': 0.05,  # 5% 에러율
            'response_time_high': 2.0,  # 2초 응답시간
            'db_connections_high': 18,  # 데이터베이스 연결 수
            'memory_usage_high': 0.85,  # 85% 메모리 사용률
            'payment_success_rate_low': 0.95  # 95% 결제 성공률
        }
    
    def start_monitoring(self):
        """모니터링 시작"""
        def monitor():
            while self.monitoring:
                try:
                    self._check_metrics()
                    time.sleep(self.check_interval)
                except Exception as e:
                    print(f"❌ Monitoring error: {e}")
                    time.sleep(self.check_interval)
        
        threading.Thread(target=monitor, daemon=True).start()
        print("👀 Metric monitoring started")
    
    def _check_metrics(self):
        """메트릭 체크"""
        # 실제로는 Prometheus에서 메트릭을 쿼리
        # 여기서는 시뮬레이션
        
        # 에러율 체크
        error_rate = random.uniform(0, 0.1)
        if error_rate > self.thresholds['error_rate_high']:
            self.alert_manager.trigger_alert(
                'high_error_rate',
                error_rate,
                {'service': 'payment', 'environment': 'production'}
            )
        
        # 데이터베이스 연결 체크
        db_connections = random.randint(15, 20)
        if db_connections > self.thresholds['db_connections_high']:
            self.alert_manager.trigger_alert(
                'high_db_connections',
                db_connections,
                {'database': 'payment_db', 'pool': 'main'}
            )
    
    def stop_monitoring(self):
        """모니터링 중지"""
        self.monitoring = False

# Alert Management 시스템 테스트
def test_alert_system():
    print("=== Alert Management 시스템 테스트 ===")
    
    # Alert Manager 생성
    alert_manager = AlertManager()
    
    # 알림 채널 설정
    email_channel = EmailNotification("smtp.company.com", 587, "alerts@company.com", "password")
    slack_channel = SlackNotification("https://hooks.slack.com/services/...")
    pagerduty_channel = PagerDutyNotification("integration_key_123")
    
    alert_manager.add_notification_channel(email_channel)
    alert_manager.add_notification_channel(slack_channel)
    alert_manager.add_notification_channel(pagerduty_channel)
    
    # 라우팅 규칙 설정
    alert_manager.add_routing_rule({
        'match': {'severity': 'critical'},
        'channels': ['pagerduty', 'slack', 'email']
    })
    
    alert_manager.add_routing_rule({
        'match': {'severity': 'high'},
        'channels': ['slack', 'email']
    })
    
    alert_manager.add_routing_rule({
        'match': {'severity': 'medium'},
        'channels': ['email']
    })
    
    # 억제 규칙 설정
    alert_manager.add_suppression_rule({
        'match': {'service': 'payment'},
        'duration': 1800  # 30분간 같은 서비스 알림 억제
    })
    
    # 알림 규칙 설정
    rules = [
        AlertRule(
            id="high_error_rate",
            name="High Error Rate Detected",
            condition="rate(errors_total[5m]) > 0.05",
            severity=AlertSeverity.HIGH,
            labels={'service': 'payment', 'team': 'backend'},
            annotations={
                'description': 'Error rate is above 5% threshold',
                'runbook_url': 'https://wiki.company.com/runbooks/high-error-rate'
            }
        ),
        AlertRule(
            id="high_db_connections",
            name="Database Connection Pool Near Exhaustion",
            condition="database_connections_active > 18",
            severity=AlertSeverity.CRITICAL,
            labels={'service': 'payment', 'component': 'database'},
            annotations={
                'description': 'Database connection pool is near exhaustion',
                'runbook_url': 'https://wiki.company.com/runbooks/db-connections'
            }
        ),
        AlertRule(
            id="low_payment_success",
            name="Payment Success Rate Too Low",
            condition="payment_success_rate < 95",
            severity=AlertSeverity.MEDIUM,
            labels={'service': 'payment', 'type': 'business'},
            annotations={'description': 'Payment success rate dropped below 95%'}
        )
    ]
    
    for rule in rules:
        alert_manager.add_alert_rule(rule)
    
    print("\n--- 알림 규칙 트리거 테스트 ---")
    
    # 알림 발생 시뮬레이션
    test_scenarios = [
        ('high_error_rate', 0.08, {'current_rate': '8%'}),
        ('high_db_connections', 19, {'current_connections': 19}),
        ('low_payment_success', 0.92, {'current_rate': '92%'}),
        ('high_error_rate', 0.07, {'current_rate': '7%'})  # 억제되어야 함
    ]
    
    for rule_id, value, context in test_scenarios:
        alert_manager.trigger_alert(rule_id, value, context)
        time.sleep(1)
    
    print(f"\n--- 알림 상태 관리 테스트 ---")
    
    # 활성 알림 확인
    active_alerts = alert_manager.get_active_alerts()
    print(f"활성 알림: {len(active_alerts)}개")
    
    if active_alerts:
        # 첫 번째 알림 확인
        first_alert = active_alerts[0]
        alert_manager.acknowledge_alert(first_alert.id, "john.doe@company.com")
        
        # 두 번째 알림 해결
        if len(active_alerts) > 1:
            second_alert = active_alerts[1]
            alert_manager.resolve_alert(second_alert.id)
    
    # 통계 출력
    stats = alert_manager.get_statistics()
    print(f"\n📊 Alert Manager 통계:")
    for key, value in stats.items():
        print(f"  {key}: {value}")
    
    print(f"\n👀 메트릭 감시기 시작...")
    
    # 메트릭 감시기 테스트
    metrics_collector = MetricsCollector()  # 이전에 만든 클래스 사용
    watcher = MetricWatcher(metrics_collector, alert_manager)
    watcher.start_monitoring()
    
    print("   10초간 메트릭 감시...")
    time.sleep(10)
    
    watcher.stop_monitoring()
    print("✅ Alert Management 시스템 테스트 완료")

# 실행
if __name__ == "__main__":
    import random
    test_alert_system()
```

## 💡 로깅 및 모니터링에서 배운 핵심 교훈

### 1. 관찰 가능성의 층위

```bash
🔍 Level 1: 기본 로깅
- 애플리케이션 로그, 에러 로그
- 문제 발생 후 디버깅에 활용

📊 Level 2: 메트릭 수집  
- 시스템 상태를 숫자로 추적
- 문제를 미리 감지 가능

🚨 Level 3: 지능적 알림
- 임계값 기반 자동 알림
- 문제 발생 즉시 대응 가능

🔬 Level 4: 관찰 기반 최적화
- 메트릭 기반 성능 최적화
- 데이터 기반 의사결정
```

### 2. 구조화된 로깅의 중요성

```bash
✅ 구조화된 로그의 이점:
- 검색과 필터링 용이
- 자동화된 분석 가능  
- 일관된 포맷으로 통합 관리
- 컨텍스트 정보 보존

❌ 비구조화된 로그의 문제:
- 수동 분석에 의존
- 중요 정보 누락
- 다양한 포맷으로 혼재
- 자동화 어려움
```

### 3. 메트릭 설계 원칙

```bash
🎯 좋은 메트릭의 특징:
- 비즈니스 영향과 직결
- 액션 가능한 정보 제공
- 적절한 granularity
- 높은 cardinality 지양

📊 메트릭 타입별 활용:
- Counter: 누적 카운트 (요청 수, 에러 수)
- Gauge: 현재 값 (메모리 사용량, 연결 수)
- Histogram: 분포 (응답시간, 요청 크기)
```

### 4. 알림 피로도 방지

```bash
⚠️ 알림 피로도 원인:
- 너무 많은 알림
- 액션 불가능한 알림
- 중복/스팸성 알림
- 부정확한 임계값

✅ 해결책:
- 억제 규칙 적용
- 심각도 기반 라우팅
- 점진적 알림 확대
- 정기적 규칙 검토
```

## 🎯 다음 단계

로깅과 모니터링 기반을 다졌으니, [13.2 분산 추적](02-distributed-tracing.md)에서는 마이크로서비스 간의 요청 흐름을 추적하는 방법을 배워보겠습니다.

"관찰할 수 없는 시스템은 디버깅할 수 없습니다. 체계적인 관찰 가능성 구축이 안정적인 서비스 운영의 핵심입니다!" 🔍📊

## 관련 문서

- [Chapter 12: Container & Kubernetes](../chapter-12-container-kubernetes/index.md) - 컨테이너 환경에서의 로깅
- [Chapter 07: Network Programming](../chapter-07-network-programming/index.md) - 네트워크 성능 메트릭
- [13.2 분산 추적](02-distributed-tracing.md) - 마이크로서비스 추적
- [13.3 메트릭 및 알림](03-metrics-alerts.md) - 고급 메트릭 수집
