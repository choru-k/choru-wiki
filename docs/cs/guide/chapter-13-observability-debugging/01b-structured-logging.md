---
tags:
  - Observability
  - Logging
  - Structured Logging
  - JSON
  - Guide
---

# 13.1B 구조화된 로깅 - 검색 가능한 로그

구조화된 로깅은 전통적인 텍스트 기반 로그와 달리, **검색하고 분석하기 쉬운 형태**로 로그 데이터를 저장하는 방식입니다. JSON, XML 등의 구조화된 형식을 사용하여 로그의 각 필드를 명확히 구분하고, 자동화된 로그 분석을 가능하게 합니다.

## 🏗️ 구조화된 로그 시스템 구축

### 기본 구조화 로거 구현

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

### 비즈니스 로직에 적용한 예시

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

### 구조화된 로그 출력 예시

구조화된 로깅을 사용하면 다음과 같은 JSON 형태의 로그가 생성됩니다:

```json
{
  "timestamp": "2023-12-24T15:30:45.123456",
  "level": "INFO",
  "logger": "payment_service",
  "message": "Payment processing started",
  "module": "payment_service",
  "function": "process_payment",
  "line": 208,
  "request_id": "req_abc123def456",
  "user_id": "user_789",
  "order_id": "order_12345",
  "amount": 99.99,
  "currency": "USD"
}

{
  "timestamp": "2023-12-24T15:30:45.234567",
  "level": "DEBUG",
  "logger": "payment_service",
  "message": "Database connection status",
  "module": "payment_service",
  "function": "_validate_order",
  "line": 271,
  "request_id": "req_abc123def456",
  "user_id": "user_789",
  "active_connections": 18,
  "total_connections": 20,
  "queue_size": 5
}

{
  "timestamp": "2023-12-24T15:30:46.345678",
  "level": "ERROR",
  "logger": "payment_service",
  "message": "Database connection pool timeout",
  "module": "payment_service",
  "function": "_validate_order",
  "line": 299,
  "request_id": "req_abc123def456",
  "user_id": "user_789",
  "timeout_seconds": 5,
  "pool_status": {
    "active": 20,
    "total": 20,
    "queue_size": 8
  }
}
```

## 🔍 로그 검색 및 분석

### Elasticsearch 쿼리 예시

구조화된 로그는 Elasticsearch에서 강력한 검색이 가능합니다:

```json
// 특정 사용자의 모든 결제 실패 로그
{
  "query": {
    "bool": {
      "must": [
        {"match": {"user_id": "user_789"}},
        {"match": {"logger": "payment_service"}},
        {"match": {"level": "ERROR"}}
      ],
      "filter": {
        "range": {
          "timestamp": {
            "gte": "2023-12-24T00:00:00",
            "lte": "2023-12-24T23:59:59"
          }
        }
      }
    }
  }
}

// 응답시간이 2초 이상인 결제 요청들
{
  "query": {
    "bool": {
      "must": [
        {"match": {"message": "Payment completed successfully"}}
      ],
      "filter": {
        "range": {
          "processing_time_ms": {
            "gte": 2000
          }
        }
      }
    }
  },
  "sort": [
    {
      "processing_time_ms": {
        "order": "desc"
      }
    }
  ]
}

// 데이터베이스 커넥션 풀 경고가 발생한 요청들
{
  "query": {
    "bool": {
      "must": [
        {"match": {"message": "Database connection pool near exhaustion"}}
      ]
    }
  },
  "aggs": {
    "by_hour": {
      "date_histogram": {
        "field": "timestamp",
        "calendar_interval": "hour"
      },
      "aggs": {
        "avg_usage": {
          "avg": {
            "field": "usage_percentage"
          }
        }
      }
    }
  }
}
```

### Kibana 대시보드 구성

```bash
📊 결제 서비스 모니터링 대시보드

1. 전체 요청 현황
   - 시간별 요청 수 (성공/실패)
   - 평균 응답시간 트렌드
   - 에러율 변화

2. 성능 분석
   - 응답시간 히스토그램
   - 데이터베이스 쿼리 성능
   - 외부 서비스 호출 지연시간

3. 에러 분석
   - 에러 타입별 발생 빈도
   - 에러가 가장 많이 발생하는 사용자/주문
   - 게이트웨이별 에러율

4. 리소스 사용량
   - 데이터베이스 커넥션 풀 상태
   - 메모리 사용량 패턴
   - 요청 큐 대기시간
```

## 🎯 구조화된 로깅 모범 사례

### 1. 필드 명명 규칙

```python
# ✅ 좋은 필드 이름
{
    "request_id": "req_123",
    "user_id": "user_456",
    "processing_time_ms": 1234,
    "error_code": "GATEWAY_TIMEOUT",
    "order_amount_cents": 9999  # 정수로 저장하여 정밀도 보장
}

# ❌ 피해야 할 필드 이름
{
    "id": "123",  # 너무 모호함
    "time": 1234,  # 단위 불명확
    "err": "timeout",  # 약어 사용
    "amt": "99.99"  # 타입과 단위 불분명
}
```

### 2. 로그 레벨 가이드라인

```python
# DEBUG: 개발시 디버깅 정보
logger.debug("Database query executed",
            query="SELECT * FROM users",
            query_time_ms=45,
            rows_returned=1)

# INFO: 정상적인 비즈니스 플로우
logger.info("User login successful",
           user_id="user_123",
           login_method="oauth",
           session_id="sess_abc")

# WARNING: 주의가 필요하지만 서비스에 영향 없음
logger.warning("Rate limit approaching",
              user_id="user_456",
              current_requests=95,
              limit=100)

# ERROR: 처리 실패, 즉시 확인 필요
logger.error("Payment processing failed",
            order_id="order_789",
            error_code="CARD_DECLINED",
            gateway_response="insufficient_funds")

# CRITICAL: 서비스 중단 위험
logger.critical("Database connection pool exhausted",
               active_connections=20,
               max_connections=20,
               queue_length=50)
```

### 3. 개인정보 보호

```python
# ✅ 안전한 로깅
logger.info("User profile updated",
           user_id="user_123",  # ID만 기록
           updated_fields=["email", "phone"],
           ip_address_hash="sha256_hash")  # 해시화된 IP

# ❌ 위험한 로깅
logger.info("User profile updated",
           user_email="john@example.com",  # 실제 이메일
           user_phone="555-1234",  # 실제 전화번호
           credit_card="4111-****-****-1234")  # 신용카드 정보
```

### 4. 로그 테스트

```python
# 로깅 시스템 테스트
def test_structured_logging():
    print("=== Structured Logging 테스트 ===")
    
    payment_service = PaymentService()
    
    print(", --- 정상 결제 처리 ---")
    try:
        result = payment_service.process_payment("order_12345", "user_789", 99.99)
        print(f"결제 성공: {result}")
    except Exception as e:
        print(f"결제 실패: {e}")
    
    print(", --- 에러 상황 시뮬레이션 ---")
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

### 1. JSON 구조화 로깅의 장점

구조화된 로깅은 검색, 필터링, 집계가 용이하며 자동화된 모니터링을 가능하게 합니다.

### 2. 컨텍스트 정보 보존

요청 ID, 사용자 ID 등의 컨텍스트를 통해 분산된 로그를 연결하여 전체 흐름을 추적할 수 있습니다.

### 3. 비즈니스 메트릭 통합

로그에 처리 시간, 금액, 상태 등의 비즈니스 정보를 포함하여 운영 인사이트를 제공합니다.

### 4. 개발자 친화적 설계

간단한 API로 개발자가 쉽게 사용할 수 있으면서도, 강력한 분석 기능을 제공합니다.

---

**이전**: [13.1A 관찰 가능성 기초](01a-observability-foundations.md)  
**다음**: [13.1C 메트릭 수집](01c-metrics-collection.md)에서 시스템 상태를 수치로 측정하는 메트릭 시스템을 학습합니다.
