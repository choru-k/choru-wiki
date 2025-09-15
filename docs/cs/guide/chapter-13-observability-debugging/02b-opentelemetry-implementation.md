---
tags:
  - Observability
  - DistributedTracing
  - OpenTelemetry
  - Implementation
  - Microservices
  - Guide
---

# 13.2b OpenTelemetry 분산 추적 구현 - 실제 시스템에서의 적용

## 🏗️ OpenTelemetry 기반 분산 추적 구현

### 기본 설정과 초기화

```python
from opentelemetry import trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.propagate import inject, extract
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

import requests
import time
import uuid
import threading
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime

# OpenTelemetry 설정
def setup_tracing(service_name: str, jaeger_endpoint: str = "http://localhost:14268/api/traces"):
    """분산 추적 설정"""
    # Trace Provider 설정
    trace.set_tracer_provider(TracerProvider())
    tracer_provider = trace.get_tracer_provider()
    
    # Jaeger Exporter 설정
    jaeger_exporter = JaegerExporter(
        agent_host_name="localhost",
        agent_port=6831,
        collector_endpoint=jaeger_endpoint,
    )
    
    # Span Processor 추가
    span_processor = BatchSpanProcessor(jaeger_exporter)
    tracer_provider.add_span_processor(span_processor)
    
    # HTTP 요청 자동 계측
    RequestsInstrumentor().instrument()
    
    # Tracer 반환
    return trace.get_tracer(service_name)

@dataclass
class TraceContext:
    """추적 컨텍스트"""
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    baggage: Dict[str, str] = None

class DistributedTracer:
    """분산 추적기"""
    
    def __init__(self, service_name: str):
        self.service_name = service_name
        self.tracer = setup_tracing(service_name)
        self.propagator = TraceContextTextMapPropagator()
    
    def start_trace(self, operation_name: str, **attributes):
        """새로운 추적 시작"""
        span = self.tracer.start_span(operation_name)
        
        # 기본 속성 설정
        span.set_attribute("service.name", self.service_name)
        span.set_attribute("service.version", "1.0.0")
        
        # 커스텀 속성 추가
        for key, value in attributes.items():
            span.set_attribute(key, str(value))
        
        return span
    
    def create_child_span(self, parent_span, operation_name: str, **attributes):
        """자식 Span 생성"""
        with trace.use_span(parent_span):
            child_span = self.tracer.start_span(operation_name)
            
            # 속성 설정
            for key, value in attributes.items():
                child_span.set_attribute(key, str(value))
            
            return child_span
    
    def inject_context(self, span, carrier: Dict[str, str]):
        """컨텍스트를 HTTP 헤더에 주입"""
        with trace.use_span(span):
            inject(carrier)
        return carrier
    
    def extract_context(self, carrier: Dict[str, str]):
        """HTTP 헤더에서 컨텍스트 추출"""
        return extract(carrier)
```

### 마이크로서비스별 구현

#### Frontend Service (요청 시작점)

```python
class FrontendService:
    """프론트엔드 서비스"""
    
    def __init__(self):
        self.tracer = DistributedTracer("frontend-service")
        self.payment_service_url = "http://payment-service:8080"
        self.session = requests.Session()
    
    def process_order(self, user_id: str, items: list, payment_method: str):
        """주문 처리 (추적 시작점)"""
        # 루트 Span 시작
        root_span = self.tracer.start_trace(
            "process_order",
            user_id=user_id,
            items_count=len(items),
            payment_method=payment_method,
            http_method="POST",
            http_url="/api/orders"
        )
        
        try:
            with trace.use_span(root_span):
                print(f"🌟 [FRONTEND] Starting order processing for user {user_id}")
                
                # 1. 주문 유효성 검사
                validation_span = self.tracer.create_child_span(
                    root_span, 
                    "validate_order",
                    validation_type="order_items"
                )
                
                with trace.use_span(validation_span):
                    self._validate_order(items)
                    validation_span.set_attribute("validation_result", "success")
                validation_span.end()
                
                # 2. 결제 서비스 호출
                payment_span = self.tracer.create_child_span(
                    root_span,
                    "call_payment_service",
                    downstream_service="payment-service",
                    payment_method=payment_method
                )
                
                with trace.use_span(payment_span):
                    payment_result = self._call_payment_service(
                        user_id, items, payment_method, payment_span
                    )
                    payment_span.set_attribute("payment_result", payment_result["status"])
                payment_span.end()
                
                if payment_result["status"] != "success":
                    root_span.set_attribute("error", True)
                    root_span.set_attribute("error_message", payment_result.get("error"))
                    raise PaymentException(payment_result.get("error", "Payment failed"))
                
                # 3. 주문 완료 처리
                completion_span = self.tracer.create_child_span(
                    root_span,
                    "complete_order",
                    order_id=payment_result["order_id"]
                )
                
                with trace.use_span(completion_span):
                    order_result = self._complete_order(payment_result["order_id"])
                    completion_span.set_attribute("completion_result", "success")
                completion_span.end()
                
                root_span.set_attribute("order_id", order_result["order_id"])
                root_span.set_attribute("total_amount", sum(item["price"] for item in items))
                
                print(f"✅ [FRONTEND] Order completed: {order_result['order_id']}")
                
                return {
                    "status": "success",
                    "order_id": order_result["order_id"],
                    "trace_id": trace.get_current_span().get_span_context().trace_id
                }
                
        except Exception as e:
            root_span.record_exception(e)
            root_span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
            print(f"❌ [FRONTEND] Order failed: {e}")
            raise
        finally:
            root_span.end()
    
    def _validate_order(self, items: list):
        """주문 유효성 검사"""
        time.sleep(0.1)  # 검사 시간 시뮬레이션
        
        if not items:
            raise ValueError("Empty order")
        
        for item in items:
            if item.get("price", 0) <= 0:
                raise ValueError(f"Invalid price for item {item.get('id')}")
    
    def _call_payment_service(self, user_id: str, items: list, payment_method: str, span):
        """결제 서비스 호출"""
        # 컨텍스트를 HTTP 헤더에 주입
        headers = {"Content-Type": "application/json"}
        self.tracer.inject_context(span, headers)
        
        payload = {
            "user_id": user_id,
            "items": items,
            "payment_method": payment_method,
            "total_amount": sum(item["price"] for item in items)
        }
        
        try:
            print(f"💳 [FRONTEND] Calling payment service...")
            
            # 실제로는 HTTP 요청을 보냄
            # response = self.session.post(f"{self.payment_service_url}/process", 
            #                            json=payload, headers=headers, timeout=30)
            
            # 시뮬레이션을 위한 결제 서비스 직접 호출
            payment_service = PaymentService()
            return payment_service.process_payment_request(headers, payload)
            
        except requests.exceptions.Timeout:
            span.set_attribute("error", True)
            span.set_attribute("error_type", "timeout")
            raise PaymentException("Payment service timeout")
        except Exception as e:
            span.set_attribute("error", True)
            span.set_attribute("error_type", type(e).__name__)
            raise PaymentException(f"Payment service error: {e}")
    
    def _complete_order(self, order_id: str):
        """주문 완료 처리"""
        time.sleep(0.05)  # 완료 처리 시간
        return {"order_id": order_id, "status": "completed"}
```

#### Payment Service (중간 서비스)

```python
class PaymentService:
    """결제 서비스"""
    
    def __init__(self):
        self.tracer = DistributedTracer("payment-service")
        self.inventory_service_url = "http://inventory-service:8080"
        self.session = requests.Session()
    
    def process_payment_request(self, headers: Dict[str, str], payload: Dict[str, Any]):
        """결제 요청 처리"""
        # 상위 컨텍스트 추출
        context = self.tracer.extract_context(headers)
        
        # 새 Span 시작 (상위 컨텍스트 연결)
        with trace.use_span(context):
            payment_span = self.tracer.tracer.start_span(
                "process_payment",
                attributes={
                    "user_id": payload["user_id"],
                    "payment_method": payload["payment_method"],
                    "amount": payload["total_amount"]
                }
            )
        
        try:
            with trace.use_span(payment_span):
                print(f"💰 [PAYMENT] Processing payment for user {payload['user_id']}")
                
                # 1. 결제 정보 검증
                validation_span = self.tracer.create_child_span(
                    payment_span,
                    "validate_payment_info",
                    payment_method=payload["payment_method"]
                )
                
                with trace.use_span(validation_span):
                    self._validate_payment_info(payload)
                validation_span.end()
                
                # 2. 결제 게이트웨이 호출
                gateway_span = self.tracer.create_child_span(
                    payment_span,
                    "call_payment_gateway",
                    gateway="stripe",
                    amount=payload["total_amount"]
                )
                
                with trace.use_span(gateway_span):
                    transaction_id = self._call_payment_gateway(payload)
                    gateway_span.set_attribute("transaction_id", transaction_id)
                gateway_span.end()
                
                # 3. 재고 업데이트 요청
                inventory_span = self.tracer.create_child_span(
                    payment_span,
                    "update_inventory",
                    downstream_service="inventory-service"
                )
                
                order_id = f"ORD-{uuid.uuid4().hex[:8].upper()}"
                
                with trace.use_span(inventory_span):
                    inventory_result = self._update_inventory(
                        payload["items"], order_id, inventory_span
                    )
                    inventory_span.set_attribute("inventory_result", inventory_result["status"])
                inventory_span.end()
                
                payment_span.set_attribute("transaction_id", transaction_id)
                payment_span.set_attribute("order_id", order_id)
                
                print(f"✅ [PAYMENT] Payment completed: {transaction_id}")
                
                return {
                    "status": "success",
                    "order_id": order_id,
                    "transaction_id": transaction_id
                }
                
        except Exception as e:
            payment_span.record_exception(e)
            payment_span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
            print(f"❌ [PAYMENT] Payment failed: {e}")
            return {"status": "failed", "error": str(e)}
        finally:
            payment_span.end()
    
    def _validate_payment_info(self, payload: Dict[str, Any]):
        """결제 정보 검증"""
        time.sleep(0.05)
        
        if not payload.get("payment_method"):
            raise ValueError("Payment method required")
        
        if payload.get("total_amount", 0) <= 0:
            raise ValueError("Invalid payment amount")
    
    def _call_payment_gateway(self, payload: Dict[str, Any]):
        """결제 게이트웨이 호출"""
        time.sleep(0.3)  # 게이트웨이 호출 시간 시뮬레이션
        
        # 5% 확률로 결제 실패
        import random
        if random.random() < 0.05:
            raise PaymentGatewayException("Payment declined by gateway")
        
        return f"TXN-{uuid.uuid4().hex[:12].upper()}"
    
    def _update_inventory(self, items: list, order_id: str, span):
        """재고 업데이트 요청"""
        headers = {"Content-Type": "application/json"}
        self.tracer.inject_context(span, headers)
        
        payload = {
            "order_id": order_id,
            "items": items
        }
        
        # 시뮬레이션을 위한 재고 서비스 직접 호출
        inventory_service = InventoryService()
        return inventory_service.update_inventory_request(headers, payload)
```

#### Inventory Service (중간 서비스)

```python
class InventoryService:
    """재고 서비스"""
    
    def __init__(self):
        self.tracer = DistributedTracer("inventory-service")
        self.order_service_url = "http://order-service:8080"
        self.session = requests.Session()
    
    def update_inventory_request(self, headers: Dict[str, str], payload: Dict[str, Any]):
        """재고 업데이트 요청 처리"""
        context = self.tracer.extract_context(headers)
        
        with trace.use_span(context):
            inventory_span = self.tracer.tracer.start_span(
                "update_inventory",
                attributes={
                    "order_id": payload["order_id"],
                    "items_count": len(payload["items"])
                }
            )
        
        try:
            with trace.use_span(inventory_span):
                print(f"📦 [INVENTORY] Updating inventory for order {payload['order_id']}")
                
                # 1. 재고 확인
                check_span = self.tracer.create_child_span(
                    inventory_span,
                    "check_inventory",
                    items_count=len(payload["items"])
                )
                
                with trace.use_span(check_span):
                    self._check_inventory_availability(payload["items"])
                    check_span.set_attribute("availability_check", "passed")
                check_span.end()
                
                # 2. 재고 차감
                update_span = self.tracer.create_child_span(
                    inventory_span,
                    "deduct_inventory"
                )
                
                with trace.use_span(update_span):
                    self._deduct_inventory(payload["items"])
                update_span.end()
                
                # 3. 주문 서비스에 알림
                notification_span = self.tracer.create_child_span(
                    inventory_span,
                    "notify_order_service",
                    downstream_service="order-service"
                )
                
                with trace.use_span(notification_span):
                    order_result = self._notify_order_service(payload, notification_span)
                    notification_span.set_attribute("notification_result", order_result["status"])
                notification_span.end()
                
                print(f"✅ [INVENTORY] Inventory updated for order {payload['order_id']}")
                
                return {"status": "success"}
                
        except Exception as e:
            inventory_span.record_exception(e)
            inventory_span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
            print(f"❌ [INVENTORY] Inventory update failed: {e}")
            return {"status": "failed", "error": str(e)}
        finally:
            inventory_span.end()
    
    def _check_inventory_availability(self, items: list):
        """재고 가용성 확인"""
        time.sleep(0.1)
        
        # 10% 확률로 재고 부족
        import random
        if random.random() < 0.1:
            raise InventoryException("Insufficient inventory")
    
    def _deduct_inventory(self, items: list):
        """재고 차감"""
        time.sleep(0.05)
        # 재고 차감 로직 시뮬레이션
    
    def _notify_order_service(self, payload: Dict[str, Any], span):
        """주문 서비스에 알림"""
        headers = {"Content-Type": "application/json"}
        self.tracer.inject_context(span, headers)
        
        # 시뮬레이션을 위한 주문 서비스 직접 호출
        order_service = OrderService()
        return order_service.finalize_order_request(headers, payload)
```

#### Order Service (최종 서비스 - 문제 발생 지점)

```python
class OrderService:
    """주문 서비스"""
    
    def __init__(self):
        self.tracer = DistributedTracer("order-service")
    
    def finalize_order_request(self, headers: Dict[str, str], payload: Dict[str, Any]):
        """주문 최종 처리"""
        context = self.tracer.extract_context(headers)
        
        with trace.use_span(context):
            order_span = self.tracer.tracer.start_span(
                "finalize_order",
                attributes={
                    "order_id": payload["order_id"],
                    "items_count": len(payload["items"])
                }
            )
        
        try:
            with trace.use_span(order_span):
                print(f"📝 [ORDER] Finalizing order {payload['order_id']}")
                
                # 1. 데이터베이스 연결
                db_span = self.tracer.create_child_span(
                    order_span,
                    "database_connection",
                    database="order_db"
                )
                
                with trace.use_span(db_span):
                    self._connect_to_database(db_span)
                db_span.end()
                
                # 2. 주문 저장 (문제 발생 지점)
                save_span = self.tracer.create_child_span(
                    order_span,
                    "save_order_to_db",
                    operation="INSERT"
                )
                
                with trace.use_span(save_span):
                    self._save_order_to_database(payload, save_span)
                    save_span.set_attribute("save_result", "success")
                save_span.end()
                
                # 3. 주문 확인 이메일 발송
                email_span = self.tracer.create_child_span(
                    order_span,
                    "send_confirmation_email"
                )
                
                with trace.use_span(email_span):
                    self._send_confirmation_email(payload["order_id"])
                email_span.end()
                
                print(f"✅ [ORDER] Order finalized: {payload['order_id']}")
                
                return {"status": "success", "order_id": payload["order_id"]}
                
        except Exception as e:
            order_span.record_exception(e)
            order_span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
            print(f"❌ [ORDER] Order finalization failed: {e}")
            return {"status": "failed", "error": str(e)}
        finally:
            order_span.end()
    
    def _connect_to_database(self, span):
        """데이터베이스 연결"""
        time.sleep(0.02)
        span.set_attribute("connection_pool", "active")
        span.set_attribute("connection_timeout", "30s")
    
    def _save_order_to_database(self, payload: Dict[str, Any], span):
        """주문 데이터베이스 저장"""
        # 여기서 간헐적으로 타임아웃 발생 (30% 확률)
        import random
        
        span.set_attribute("table", "orders")
        span.set_attribute("operation", "INSERT")
        
        # 데이터베이스 저장 시뮬레이션
        save_duration = random.uniform(0.1, 3.5)
        time.sleep(save_duration)
        
        span.set_attribute("query_duration_ms", round(save_duration * 1000, 2))
        
        if save_duration > 3.0:  # 3초 이상이면 타임아웃
            span.set_attribute("error", True)
            span.set_attribute("error_type", "database_timeout")
            span.set_attribute("timeout_threshold_ms", 3000)
            raise DatabaseTimeoutException(f"Database save timed out after {save_duration:.2f}s")
    
    def _send_confirmation_email(self, order_id: str):
        """확인 이메일 발송"""
        time.sleep(0.1)
        print(f"📧 [ORDER] Confirmation email sent for {order_id}")
```

### 예외 클래스와 추적 분석기

```python
# 예외 클래스들
class PaymentException(Exception):
    pass

class PaymentGatewayException(PaymentException):
    pass

class InventoryException(Exception):
    pass

class DatabaseTimeoutException(Exception):
    pass

# 분산 추적 분석기
class TraceAnalyzer:
    """추적 데이터 분석기"""
    
    def __init__(self):
        self.traces = []
    
    def analyze_trace(self, trace_data: Dict[str, Any]):
        """추적 데이터 분석"""
        print(f"🔍 Trace Analysis Report")
        print("=" * 50)
        
        # 전체 요청 시간
        total_duration = trace_data.get("total_duration", 0)
        print(f"📊 Total Request Duration: {total_duration:.2f}s")
        
        # 서비스별 시간 분석
        service_durations = trace_data.get("service_durations", {})
        print(f"⏱️  Service Performance:")
        for service, duration in service_durations.items():
            percentage = (duration / total_duration) * 100 if total_duration > 0 else 0
            print(f"  • {service}: {duration:.2f}s ({percentage:.1f}%)")
        
        # 에러 분석
        errors = trace_data.get("errors", [])
        if errors:
            print(f"❌ Errors Detected:")
            for error in errors:
                print(f"  • {error['service']}: {error['error_type']} - {error['message']}")
        
        # 병목 지점 식별
        bottleneck = self._identify_bottleneck(service_durations)
        if bottleneck:
            print(f"🚫 Bottleneck Identified:")
            print(f"  • Service: {bottleneck['service']}")
            print(f"  • Duration: {bottleneck['duration']:.2f}s")
            print(f"  • Impact: {bottleneck['percentage']:.1f}% of total time")
        
        # 추천 사항
        recommendations = self._generate_recommendations(trace_data)
        if recommendations:
            print(f"💡 Recommendations:")
            for i, rec in enumerate(recommendations, 1):
                print(f"  {i}. {rec}")
    
    def _identify_bottleneck(self, service_durations: Dict[str, float]):
        """병목 지점 식별"""
        if not service_durations:
            return None
        
        total_duration = sum(service_durations.values())
        max_service = max(service_durations.items(), key=lambda x: x[1])
        
        percentage = (max_service[1] / total_duration) * 100 if total_duration > 0 else 0
        
        if percentage > 50:  # 전체 시간의 50% 이상을 차지하면 병목
            return {
                "service": max_service[0],
                "duration": max_service[1],
                "percentage": percentage
            }
        
        return None
    
    def _generate_recommendations(self, trace_data: Dict[str, Any]):
        """개선 추천 사항 생성"""
        recommendations = []
        
        # 긴 응답 시간
        if trace_data.get("total_duration", 0) > 2.0:
            recommendations.append("Consider optimizing slow operations (>2s total)")
        
        # 데이터베이스 타임아웃
        errors = trace_data.get("errors", [])
        for error in errors:
            if "timeout" in error.get("error_type", "").lower():
                recommendations.append(f"Investigate {error['service']} timeout issues")
                recommendations.append("Consider increasing connection pool size")
                recommendations.append("Add circuit breaker pattern")
        
        # 서비스별 최적화
        service_durations = trace_data.get("service_durations", {})
        for service, duration in service_durations.items():
            if duration > 1.0:
                recommendations.append(f"Optimize {service} performance (>{duration:.1f}s)")
        
        return recommendations
```

## 통합 테스트와 실행

```python
def test_distributed_tracing():
    print("=== Distributed Tracing 테스트 ===")
    
    frontend = FrontendService()
    analyzer = TraceAnalyzer()
    
    # 테스트 주문 데이터
    test_orders = [
        {
            "user_id": "user_12345",
            "items": [
                {"id": "laptop_x", "name": "Gaming Laptop", "price": 1299.99}
            ],
            "payment_method": "credit_card"
        },
        {
            "user_id": "user_67890", 
            "items": [
                {"id": "mouse_y", "name": "Wireless Mouse", "price": 49.99},
                {"id": "keyboard_z", "name": "Mechanical Keyboard", "price": 129.99}
            ],
            "payment_method": "paypal"
        },
        {
            "user_id": "user_11111",
            "items": [
                {"id": "monitor_a", "name": "4K Monitor", "price": 599.99}
            ],
            "payment_method": "debit_card"
        }
    ]
    
    print(f"--- 주문 처리 시뮬레이션 ---")
    
    results = []
    for i, order in enumerate(test_orders, 1):
        print(f"🛒 주문 {i} 처리 중...")
        print(f"   사용자: {order['user_id']}")
        print(f"   상품 수: {len(order['items'])}")
        print(f"   결제 방법: {order['payment_method']}")
        
        start_time = time.time()
        
        try:
            result = frontend.process_order(
                order["user_id"],
                order["items"],
                order["payment_method"]
            )
            
            total_duration = time.time() - start_time
            
            # 추적 데이터 시뮬레이션 (실제로는 Jaeger에서 수집)
            trace_data = {
                "total_duration": total_duration,
                "service_durations": {
                    "frontend-service": 0.2,
                    "payment-service": 0.4,
                    "inventory-service": 0.15,
                    "order-service": total_duration - 0.75
                },
                "errors": [],
                "trace_id": result.get("trace_id", "unknown")
            }
            
            results.append(trace_data)
            
            print(f"   ✅ 성공: {result['order_id']}")
            print(f"   ⏱️  총 소요시간: {total_duration:.2f}초")
            
        except Exception as e:
            total_duration = time.time() - start_time
            
            error_info = {
                "service": "unknown",
                "error_type": type(e).__name__,
                "message": str(e)
            }
            
            if "timeout" in str(e).lower():
                error_info["service"] = "order-service"
                error_info["error_type"] = "database_timeout"
            
            trace_data = {
                "total_duration": total_duration,
                "service_durations": {
                    "frontend-service": 0.2,
                    "payment-service": 0.4,
                    "inventory-service": 0.15,
                    "order-service": total_duration - 0.75
                },
                "errors": [error_info],
                "trace_id": "error_trace"
            }
            
            results.append(trace_data)
            
            print(f"   ❌ 실패: {e}")
            print(f"   ⏱️  소요시간: {total_duration:.2f}초")
    
    print(f"--- 추적 데이터 분석 ---")
    
    # 각 주문의 추적 데이터 분석
    for i, trace_data in enumerate(results, 1):
        print(f"📊 주문 {i} 분석:")
        analyzer.analyze_trace(trace_data)
    
    # 전체 통계
    print(f"📈 전체 통계:")
    successful_orders = len([r for r in results if not r.get("errors")])
    failed_orders = len(results) - successful_orders
    avg_duration = sum(r["total_duration"] for r in results) / len(results)
    
    print(f"  • 성공한 주문: {successful_orders}/{len(results)}")
    print(f"  • 실패한 주문: {failed_orders}/{len(results)}")
    print(f"  • 평균 처리 시간: {avg_duration:.2f}초")
    
    # Jaeger UI 정보
    print(f"🎯 Jaeger UI 접속 정보:")
    print(f"  • URL: http://localhost:16686")
    print(f"  • 서비스별 추적 데이터 확인 가능")
    print(f"  • 에러 발생 지점과 병목 구간 시각화")

if __name__ == "__main__":
    test_distributed_tracing()
```

## 핵심 요점

### 1. **OpenTelemetry 설정과 초기화**

- Tracer Provider와 Exporter 구성
- 자동 계측을 통한 HTTP 요청 추적
- Jaeger 백엔드와의 연동

### 2. **컨텍스트 전파 메커니즘**

- HTTP 헤더를 통한 추적 컨텍스트 전달
- 서비스 간 Span 계층 구조 유지
- 부모-자식 관계 설정

### 3. **실제 마이크로서비스 구현**

- 각 서비스별 추적 로직 구현
- 에러 처리와 예외 기록
- 성능 메트릭과 비즈니스 컨텍스트 추가

### 4. **분석과 최적화 도구**

- 자동화된 성능 분석
- 병목 지점 식별
- 개선 사항 추천

---

**이전**: [02a-tracing-fundamentals.md](02a-tracing-fundamentals.md)  
**다음**: [02c-sampling-optimization.md](02c-sampling-optimization.md)에서 성능 최적화된 샘플링 전략을 학습합니다.
