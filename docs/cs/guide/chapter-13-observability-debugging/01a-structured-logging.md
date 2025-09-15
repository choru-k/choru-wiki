---
tags:
  - Observability
  - Logging
  - Structured Logging
  - JSON Logging
  - Guide
---

# 13.1a 구조화된 로깅 - 검색 가능한 로그 시스템

## 🏗️ 구조화된 로그 시스템 구축

전통적인 텍스트 로그는 사람이 읽기에는 좋지만, 대규모 시스템에서 분석하기는 어렵습니다. 구조화된 로깅은 JSON 형태로 로그를 기록하여 자동화된 분석과 검색을 가능하게 합니다.

### Python으로 구현하는 구조화된 로깅 시스템

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
```

## 📊 비즈니스 로직에 적용한 실제 예시

### 결제 서비스에서의 구조화된 로깅

```python
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
```

## 🧪 로깅 시스템 테스트

```python
# 로깅 시스템 테스트
def test_structured_logging():
    print("=== Structured Logging 테스트 ===\n")
    
    payment_service = PaymentService()
    
    print("--- 정상 결제 처리 ---")
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

## 핵심 요점

### 1. 컨텍스트 정보 보존

ContextVar를 사용하여 요청별 추적 정보(request_id, user_id)를 자동으로 모든 로그에 포함시킵니다.

### 2. 구조화된 메타데이터

처리 시간, 에러 코드, 서비스 상태 등을 구조화된 필드로 기록하여 자동화된 분석을 가능하게 합니다.

### 3. 성능 영향 최소화

JSON 직렬화 오버헤드를 최소화하고, 개발/운영 환경별로 로그 레벨을 조절하여 성능 영향을 관리합니다.

---

**이전**: [로깅 및 모니터링 개요](01-logging-monitoring.md)  
**다음**: [01b 메트릭 수집](01b-metrics-collection.md)에서 Prometheus와 Grafana를 활용한 시스템 메트릭 수집을 학습합니다.
