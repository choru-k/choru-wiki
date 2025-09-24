---
tags:
  - bulkhead_pattern
  - circuit_breaker
  - fault_tolerance
  - hands-on
  - intermediate
  - medium-read
  - resource_isolation
  - thread_pool
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 14.3.2: Bulkhead 패턴

## 😢 타이타닉호의 성찰

전설적인 타이타닉호는 한 곳에서 빙산에 부딴혀도 전체가 가라앉지 않도록 격벽(Bulkhead)으로 나눠어져 있었습니다. 같은 원리를 분산 시스템에 적용한 것이 Bulkhead Pattern입니다.

## 🛡️ Bulkhead의 개념

타이타닉호의 격벽에서 영감을 받은 패턴입니다. 한 부분의 장애가 전체로 퍼지지 않도록 격리합니다.

```python
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Queue, Full
from typing import Dict, Any, Callable

class BulkheadExecutor:
    """서비스별로 격리된 스레드 풀을 제공하는 Bulkhead"""
    
    def __init__(self):
        self.executors: Dict[str, ThreadPoolExecutor] = {}
        self.configs = {}
        self.metrics = {}
    
    def register_service(self, service_name: str, max_workers: int = 10, queue_size: int = 100):
        """서비스별 전용 스레드 풀 등록"""
        self.executors[service_name] = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix=f"{service_name}-pool"
        )
        
        self.configs[service_name] = {
            'max_workers': max_workers,
            'queue_size': queue_size
        }
        
        self.metrics[service_name] = {
            'submitted_tasks': 0,
            'completed_tasks': 0, 
            'failed_tasks': 0,
            'rejected_tasks': 0
        }
        
        print(f"😢 Bulkhead registered for {service_name}: {max_workers} workers, queue={queue_size}")
    
    def submit(self, service_name: str, func: Callable, *args,**kwargs):
        """격리된 스레드 풀에서 작업 실행"""
        if service_name not in self.executors:
            raise ValueError(f"Service {service_name} not registered")
        
        executor = self.executors[service_name]
        
        try:
            # 큐가 가득차면 즉시 거부 (추가 격리)
            if self._is_queue_full(service_name):
                self.metrics[service_name]['rejected_tasks'] += 1
                raise Exception(f"Service {service_name} bulkhead queue is full")
            
            self.metrics[service_name]['submitted_tasks'] += 1
            future = executor.submit(self._wrapped_call, service_name, func, *args,**kwargs)
            return future
            
        except Exception as e:
            self.metrics[service_name]['rejected_tasks'] += 1
            raise e
    
    def _wrapped_call(self, service_name: str, func: Callable, *args,**kwargs):
        """실행 래퍼 (메트릭 수집)"""
        try:
            result = func(*args,**kwargs)
            self.metrics[service_name]['completed_tasks'] += 1
            return result
        except Exception as e:
            self.metrics[service_name]['failed_tasks'] += 1
            raise e
    
    def _is_queue_full(self, service_name: str) -> bool:
        """플 포화 상태 확인"""
        executor = self.executors[service_name]
        queue_size = self.configs[service_name]['queue_size']
        
        # ThreadPoolExecutor의 내부 큐 크기 확인 (근사치)
        return executor._work_queue.qsize() >= queue_size
    
    def get_metrics(self, service_name: str) -> Dict[str, Any]:
        """서비스별 메트릭 반환"""
        if service_name not in self.metrics:
            return {}
        
        metrics = self.metrics[service_name].copy()
        executor = self.executors[service_name]
        
        # 스레드 풀 상태 추가
        metrics.update({
            'active_threads': executor._threads and len(executor._threads) or 0,
            'queue_size': executor._work_queue.qsize(),
            'max_workers': self.configs[service_name]['max_workers']
        })
        
        return metrics

# 실제 적용: Order Service with Bulkhead
class OrderService:
    def __init__(self):
        self.bulkhead = BulkheadExecutor()
        
        # 각 외부 서비스별로 격리된 리소스 할당
        self.bulkhead.register_service('payment', max_workers=5, queue_size=50)
        self.bulkhead.register_service('inventory', max_workers=3, queue_size=30)  
        self.bulkhead.register_service('email', max_workers=2, queue_size=20)
        self.bulkhead.register_service('analytics', max_workers=1, queue_size=10)  # 낮은 우선순위
    
    def process_order(self, order_data):
        """주문 처리 (Bulkhead 적용)"""
        order_id = order_data['id']
        print(f"🛍️ Processing order {order_id}")
        
        try:
            # 각 서비스 호출을 격리된 스레드 풀에서 실행
            futures = {}
            
            # Payment Service 호출 (가장 중요)
            futures['payment'] = self.bulkhead.submit(
                'payment', 
                self._charge_payment,
                order_data['user_id'], 
                order_data['amount']
            )
            
            # Inventory Service 호출
            futures['inventory'] = self.bulkhead.submit(
                'inventory',
                self._reserve_inventory,
                order_data['items']
            )
            
            # Email Service 호출 (덜 중요)
            futures['email'] = self.bulkhead.submit(
                'email',
                self._send_confirmation_email,
                order_data['user_id'],
                order_id
            )
            
            # Analytics Service 호출 (선택사항)
            futures['analytics'] = self.bulkhead.submit(
                'analytics', 
                self._track_order_event,
                order_data
            )
            
            # 핵심 서비스들의 완료를 기다림 (Payment, Inventory)
            critical_services = ['payment', 'inventory']
            for service in critical_services:
                try:
                    result = futures[service].result(timeout=10)  # 10초 타임아웃
                    print(f"✅ {service}: {result['status']}")
                except Exception as e:
                    print(f"❌ {service} failed: {e}")
                    # 핵심 서비스 실패 시 주문 실패
                    raise Exception(f"Order failed due to {service} failure")
            
            # 비핵심 서비스들은 실패해도 주문 성공
            optional_services = ['email', 'analytics']
            for service in optional_services:
                try:
                    result = futures[service].result(timeout=5)  # 더 짧은 타임아웃
                    print(f"✅ {service}: {result['status']}")
                except Exception as e:
                    print(f"⚠️  {service} failed (non-critical): {e}")
                    # 비핵심 서비스 실패는 무시
            
            return {'status': 'success', 'order_id': order_id}
            
        except Exception as e:
            return {'status': 'failed', 'error': str(e)}
    
    def _charge_payment(self, user_id: str, amount: float):
        """결제 처리 (시뮬레이션)"""
        time.sleep(0.5)  # 외부 API 호출 시뮬레이션
        
        # 10% 확률로 실패 시뮬레이션
        if random.random() < 0.1:
            raise Exception("Payment gateway timeout")
        
        return {'status': 'charged', 'amount': amount}
    
    def _reserve_inventory(self, items: list):
        """재고 예약 (시뮬레이션)"""
        time.sleep(0.3)
        
        # 5% 확률로 재고 부족
        if random.random() < 0.05:
            raise Exception("Insufficient inventory")
        
        return {'status': 'reserved', 'items': len(items)}
    
    def _send_confirmation_email(self, user_id: str, order_id: str):
        """확인 이메일 발송 (시뮬레이션)"""  
        time.sleep(1.0)  # 이메일 서비스는 느림
        
        # 20% 확률로 실패 (이메일 서비스는 불안정)
        if random.random() < 0.2:
            raise Exception("Email service unavailable")
        
        return {'status': 'sent', 'order_id': order_id}
    
    def _track_order_event(self, order_data):
        """주문 이벤트 추적 (시뮬레이션)"""
        time.sleep(0.1)
        return {'status': 'tracked', 'event': 'order_created'}

# Bulkhead Pattern 시뮬레이션
def simulate_bulkhead_pattern():
    print("=== Bulkhead Pattern 시뮬레이션 ===")
    
    order_service = OrderService()
    
    # 정상 주문들
    print(", --- 정상 주문 처리 ---")
    for i in range(3):
        order = {
            'id': f'order_{i}',
            'user_id': f'user_{i}',
            'amount': 100.0,
            'items': [{'id': 'item1', 'quantity': 1}]
        }
        
        result = order_service.process_order(order)
        print(f"Order {i}: {result['status']}")
    
    # 메트릭 확인
    print(", --- Bulkhead 메트릭 ---")
    for service in ['payment', 'inventory', 'email', 'analytics']:
        metrics = order_service.bulkhead.get_metrics(service)
        print(f"{service}: {metrics}")
    
    print(", --- 장애 상황: Email Service 다운 ---")
    # Email Service가 모든 요청에 실패한다고 가정
    original_email = order_service._send_confirmation_email
    order_service._send_confirmation_email = lambda user_id, order_id: exec('raise Exception("Email service completely down")')
    
    # Email 서비스가 죽어도 다른 서비스는 정상 동작
    for i in range(2):
        order = {
            'id': f'order_email_down_{i}',
            'user_id': f'user_{i}',
            'amount': 150.0,
            'items': [{'id': 'item2', 'quantity': 2}]
        }
        
        result = order_service.process_order(order)
        print(f"Order during email outage {i}: {result['status']} (주문은 성공)")
    
    print(", --- 최종 Bulkhead 메트릭 ---")
    for service in ['payment', 'inventory', 'email', 'analytics']:
        metrics = order_service.bulkhead.get_metrics(service)
        success_rate = (metrics['completed_tasks'] / max(metrics['submitted_tasks'], 1)) * 100
        print(f"{service}: Success Rate = {success_rate:.1f}%, Queue = {metrics['queue_size']}")

# 실행
import random
import time
simulate_bulkhead_pattern()
```

## 핵심 요점

### 1. 리소스 격리

각 서비스마다 독립적인 스레드 풀을 할당하여 한 서비스의 장애가 다른 서비스에 영향을 주지 않습니다.

### 2. 우선순위 기반 할당

중요한 서비스에는 더 많은 리소스를, 덜 중요한 서비스에는 제한적 리소스를 할당합니다.

### 3. 장애 격리

Bulkhead는 장애의 범위를 제한하여 전체 시스템의 안정성을 보장합니다.

---

**이전**: [Circuit Breaker Pattern](14-03-01-circuit-breaker.md)  
**다음**: [Saga Pattern](14-03-03-saga-pattern.md)에서 분산 트랜잭션의 구세주를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 인프라스트럭처
-**예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-14-distributed-systems)

- [14.1 분산 시스템 기초 이론 - CAP 정리와 일관성의 과학](./14-01-01-distributed-fundamentals.md)
- [14.2 합의 알고리즘 - 분산된 노드들이 하나가 되는 방법](./14-02-01-consensus-algorithms.md)
- [14.3 분산 데이터 관리 개요](./14-02-02-distributed-data.md)
- [14.3A Sharding 전략과 구현](./14-02-03-sharding-strategies.md)
- [14.3B Replication 패턴과 구현](./14-05-01-replication-patterns.md)

### 🏷️ 관련 키워드

`bulkhead_pattern`, `resource_isolation`, `fault_tolerance`, `thread_pool`, `circuit_breaker`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
