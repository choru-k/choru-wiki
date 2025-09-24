---
tags:
  - advanced
  - cost-management
  - deep-study
  - distributed-tracing
  - hands-on
  - opentelemetry
  - performance-tuning
  - sampling-optimization
  - 인프라스트럭처
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "인프라스트럭처"
priority_score: 5
---

# 12.4.1: 샘플링 최적화

## 🎯 분산 추적 최적화 전략

### 📊 샘플링 전략

```python
from opentelemetry.sdk.trace.sampling import (
    StaticSampler, 
    TraceIdRatioBasedSampler,
    ParentBased
)
import random
import time
import threading
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta
import hashlib
import json

class AdaptiveSampler:
    """적응형 샘플링"""
    
    def __init__(self, base_rate: float = 0.1):
        self.base_rate = base_rate
        self.error_rate = 1.0  # 에러 발생 시 100% 샘플링
        self.high_latency_threshold = 2.0
        self.high_latency_rate = 0.5
        self.recent_errors = []  # 최근 에러 추적
        self.lock = threading.Lock()
        
    def should_sample(self, trace_context: Dict[str, Any]) -> bool:
        """샘플링 여부 결정"""
        # 에러가 있으면 항상 샘플링
        if trace_context.get("has_error", False):
            self._record_error()
            return True
        
        # 높은 지연시간이면 높은 확률로 샘플링
        duration = trace_context.get("duration", 0)
        if duration > self.high_latency_threshold:
            return random.random() < self.high_latency_rate
        
        # 동적 샘플링률 조정
        current_rate = self._calculate_dynamic_rate()
        return random.random() < current_rate
    
    def _record_error(self):
        """에러 기록"""
        with self.lock:
            now = datetime.now()
            self.recent_errors.append(now)
            
            # 5분 이전 에러 제거
            cutoff = now - timedelta(minutes=5)
            self.recent_errors = [err for err in self.recent_errors if err > cutoff]
    
    def _calculate_dynamic_rate(self) -> float:
        """동적 샘플링률 계산"""
        with self.lock:
            # 최근 5분간 에러 빈도에 따라 샘플링률 조정
            error_count = len(self.recent_errors)
            
            if error_count > 10:  # 에러가 많으면 샘플링률 증가
                return min(1.0, self.base_rate * 3)
            elif error_count > 5:
                return min(1.0, self.base_rate * 2)
            else:
                return self.base_rate

class IntelligentSampler:
    """지능형 샘플링 (비즈니스 로직 기반)"""
    
    def __init__(self):
        self.sampling_rules = {
            # 중요한 엔드포인트는 높은 샘플링률
            "/api/payment": 0.5,
            "/api/order": 0.3,
            "/api/user/login": 0.2,
            
            # 일반적인 엔드포인트는 낮은 샘플링률
            "/api/health": 0.01,
            "/api/metrics": 0.01,
            
            # 기본값
            "default": 0.1
        }
        
        self.user_tier_sampling = {
            "premium": 0.3,  # 프리미엄 사용자는 높은 샘플링
            "standard": 0.1,
            "free": 0.05
        }
        
        # 시간대별 샘플링 (트래픽 피크 시간에 증가)
        self.time_based_multiplier = {
            "peak": 1.5,    # 09:00-18:00
            "normal": 1.0,  # 18:00-23:00
            "low": 0.5      # 23:00-09:00
        }
    
    def get_sampling_rate(self, endpoint: str, user_tier: str = "standard", 
                         current_hour: int = None) -> float:
        """엔드포인트와 사용자 등급에 따른 샘플링률"""
        base_rate = self.sampling_rules.get(endpoint, self.sampling_rules["default"])
        
        # 사용자 등급 조정
        user_multiplier = {
            "premium": 1.5,
            "standard": 1.0,
            "free": 0.5
        }.get(user_tier, 1.0)
        
        # 시간대 조정
        if current_hour is not None:
            if 9 <= current_hour < 18:
                time_multiplier = self.time_based_multiplier["peak"]
            elif 18 <= current_hour < 23:
                time_multiplier = self.time_based_multiplier["normal"]
            else:
                time_multiplier = self.time_based_multiplier["low"]
        else:
            time_multiplier = 1.0
        
        final_rate = base_rate * user_multiplier * time_multiplier
        return min(1.0, final_rate)
    
    def should_force_sample(self, trace_context: Dict[str, Any]) -> bool:
        """강제 샘플링 여부 결정"""
        # 중요한 비즈니스 이벤트는 당세 강제 샘플링
        force_sample_conditions = [
            trace_context.get("is_payment", False),
            trace_context.get("is_order_creation", False),
            trace_context.get("is_user_registration", False),
            trace_context.get("has_security_event", False),
            trace_context.get("amount", 0) > 1000,  # 고액 거래
        ]
        
        return any(force_sample_conditions)

class CostAwareSampler:
    """비용 인지 샘플링"""
    
    def __init__(self, monthly_budget: float, cost_per_span: float = 0.001):
        self.monthly_budget = monthly_budget
        self.cost_per_span = cost_per_span
        self.monthly_span_limit = int(monthly_budget / cost_per_span)
        self.current_span_count = 0
        self.month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        self.lock = threading.Lock()
        
        print(f"💰 Monthly budget: ${monthly_budget}, Span limit: {self.monthly_span_limit:,}")
    
    def should_sample(self) -> bool:
        """예산 기반 샘플링 결정"""
        with self.lock:
            # 월이 바뀐으면 카운터 리셋
            now = datetime.now()
            current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            if current_month_start > self.month_start:
                self.month_start = current_month_start
                self.current_span_count = 0
                print(f"📅 New month started, resetting span count")
            
            # 예산 내에서 샘플링 가능한지 확인
            if self.current_span_count >= self.monthly_span_limit:
                return False
            
            # 남은 예산에 따른 동적 샘플링률 계산
            days_in_month = (current_month_start.replace(month=current_month_start.month + 1) - current_month_start).days
            days_passed = (now - current_month_start).days + 1
            days_remaining = days_in_month - days_passed
            
            expected_usage = (days_passed / days_in_month) * self.monthly_span_limit
            usage_ratio = self.current_span_count / max(expected_usage, 1)
            
            # 예산을 너무 빠르게 소비하고 있으면 샘플링률 감소
            if usage_ratio > 1.2:
                return random.random() < 0.3  # 30% 샘플링
            elif usage_ratio > 1.0:
                return random.random() < 0.7  # 70% 샘플링
            else:
                return True  # 정상 샘플링
    
    def record_span(self):
        """샘플링된 Span 기록"""
        with self.lock:
            self.current_span_count += 1
    
    def get_budget_status(self) -> Dict[str, Any]:
        """예산 사용 현황"""
        with self.lock:
            used_budget = self.current_span_count * self.cost_per_span
            remaining_budget = self.monthly_budget - used_budget
            usage_percentage = (used_budget / self.monthly_budget) * 100
            
            return {
                "monthly_budget": self.monthly_budget,
                "used_budget": used_budget,
                "remaining_budget": remaining_budget,
                "usage_percentage": usage_percentage,
                "spans_used": self.current_span_count,
                "spans_remaining": self.monthly_span_limit - self.current_span_count
            }

# 성능 최적화된 추적기
class OptimizedTracer:
    """성능 최적화된 추적기"""
    
    def __init__(self, service_name: str, monthly_budget: float = 100.0):
        self.service_name = service_name
        self.tracer = setup_tracing(service_name)  # 이전 섹션에서 정의된 함수
        self.intelligent_sampler = IntelligentSampler()
        self.adaptive_sampler = AdaptiveSampler()
        self.cost_sampler = CostAwareSampler(monthly_budget)
        self.span_buffer = []
        self.buffer_size = 100
        self.flush_interval = 10  # 10초마다 플러시
        self.metrics = {
            "spans_created": 0,
            "spans_sampled": 0,
            "spans_dropped": 0
        }
        
        # 비동기 플러시 스레드 시작
        self._start_async_flush()
        
        # 매분 매트릭 출력
        self._start_metrics_reporter()
    
    def start_span_with_sampling(self, operation_name: str, endpoint: str = None, 
                                user_tier: str = "standard", trace_context: Dict[str, Any] = None,
                              **attributes):
        """샘플링을 고려한 Span 시작"""
        self.metrics["spans_created"] += 1
        
        # 다단계 샘플링 결정
        should_sample = self._should_sample(
            operation_name, endpoint, user_tier, trace_context or {}
        )
        
        if not should_sample:
            self.metrics["spans_dropped"] += 1
            return NoOpSpan()
        
        # 비용 기반 샘플링 추가 검사
        if not self.cost_sampler.should_sample():
            self.metrics["spans_dropped"] += 1
            return NoOpSpan()
        
        # 실제 Span 생성
        span = self.tracer.start_span(operation_name)
        self.metrics["spans_sampled"] += 1
        self.cost_sampler.record_span()
        
        # 샘플링 정보 기록
        sampling_rate = self.intelligent_sampler.get_sampling_rate(
            endpoint or operation_name, user_tier, datetime.now().hour
        )
        span.set_attribute("sampling_rate", sampling_rate)
        span.set_attribute("sampled", True)
        span.set_attribute("service.name", self.service_name)
        
        # 기본 속성 설정
        for key, value in attributes.items():
            span.set_attribute(key, str(value))
        
        return span
    
    def _should_sample(self, operation_name: str, endpoint: str, 
                      user_tier: str, trace_context: Dict[str, Any]) -> bool:
        """다단계 샘플링 로직"""
        # 1. 강제 샘플링 검사
        if self.intelligent_sampler.should_force_sample(trace_context):
            return True
        
        # 2. 적응형 샘플링 (에러/지연 기반)
        if self.adaptive_sampler.should_sample(trace_context):
            return True
        
        # 3. 지능형 샘플링 (비즈니스 로직 기반)
        sampling_rate = self.intelligent_sampler.get_sampling_rate(
            endpoint or operation_name, user_tier, datetime.now().hour
        )
        
        return random.random() < sampling_rate
    
    def add_span_to_buffer(self, span_data: Dict[str, Any]):
        """비동기 Span 데이터 버퍼링"""
        # Span 데이터 배치 처리를 위한 버퍼링
        span_hash = hashlib.md5(json.dumps(span_data, sort_keys=True).encode()).hexdigest()
        
        buffered_span = {
            "data": span_data,
            "hash": span_hash,
            "timestamp": datetime.now(),
            "retry_count": 0
        }
        
        self.span_buffer.append(buffered_span)
        
        if len(self.span_buffer) >= self.buffer_size:
            self._flush_buffer()
    
    def _flush_buffer(self):
        """버퍼 플러시 사 중복 제거 및 재시도"""
        if not self.span_buffer:
            return
            
        print(f"🚀 Flushing {len(self.span_buffer)} spans to backend...")
        
        # 중복 Span 제거 (해시 기반)
        unique_spans = {}
        for span in self.span_buffer:
            span_hash = span["hash"]
            if span_hash not in unique_spans:
                unique_spans[span_hash] = span
        
        success_count = 0
        failed_spans = []
        
        for span_hash, span in unique_spans.items():
            try:
                # 실제로는 Jaeger/OTLP 엔드포인트로 전송
                # self._send_to_backend(span["data"])
                success_count += 1
                
            except Exception as e:
                print(f"⚠️ Failed to send span {span_hash[:8]}: {e}")
                
                # 재시도 카운트 증가
                span["retry_count"] += 1
                
                # 3번 시도 후 실패하면 드롭
                if span["retry_count"] < 3:
                    failed_spans.append(span)
                else:
                    print(f"❌ Dropping span {span_hash[:8]} after 3 retries")
        
        print(f"✅ Successfully sent {success_count} spans, {len(failed_spans)} failed")
        
        # 실패한 Span들만 버퍼에 남기기
        self.span_buffer = failed_spans
    
    def _start_async_flush(self):
        """비동기 플러시 스레드"""
        def flush_periodically():
            while True:
                time.sleep(self.flush_interval)
                try:
                    self._flush_buffer()
                except Exception as e:
                    print(f"⚠️ Flush error: {e}")
        
        thread = threading.Thread(target=flush_periodically, daemon=True)
        thread.start()
        print(f"🔄 Started async flush thread (interval: {self.flush_interval}s)")
    
    def _start_metrics_reporter(self):
        """매트릭 리포터 스레드"""
        def report_metrics():
            while True:
                time.sleep(60)  # 1분마다 리포트
                try:
                    self._report_metrics()
                except Exception as e:
                    print(f"⚠️ Metrics reporting error: {e}")
        
        thread = threading.Thread(target=report_metrics, daemon=True)
        thread.start()
    
    def _report_metrics(self):
        """매트릭 리포트"""
        total_spans = self.metrics["spans_created"]
        sampled_spans = self.metrics["spans_sampled"]
        dropped_spans = self.metrics["spans_dropped"]
        
        sampling_rate = (sampled_spans / max(total_spans, 1)) * 100
        drop_rate = (dropped_spans / max(total_spans, 1)) * 100
        
        budget_status = self.cost_sampler.get_budget_status()
        
        print(f"📈 === Tracing Metrics Report ===")
        print(f"  • Total spans created: {total_spans:,}")
        print(f"  • Spans sampled: {sampled_spans:,} ({sampling_rate:.1f}%)")
        print(f"  • Spans dropped: {dropped_spans:,} ({drop_rate:.1f}%)")
        print(f"  • Buffer size: {len(self.span_buffer)}")
        print(f"  • Budget used: ${budget_status['used_budget']:.2f} ({budget_status['usage_percentage']:.1f}%)")
        print(f"  • Budget remaining: ${budget_status['remaining_budget']:.2f}")
        print()
    
    def get_sampling_stats(self) -> Dict[str, Any]:
        """샘플링 통계 반환"""
        return {
            "metrics": self.metrics.copy(),
            "budget_status": self.cost_sampler.get_budget_status(),
            "buffer_size": len(self.span_buffer)
        }

class NoOpSpan:
    """샘플링되지 않은 경우 사용하는 No-Op Span"""
    
    def set_attribute(self, key: str, value: Any):
        pass
    
    def record_exception(self, exception: Exception):
        pass
    
    def set_status(self, status):
        pass
    
    def end(self):
        pass
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass
```

## 성능 최적화 시나리오

### 시나리오 1: 높은 트래픽 상황

```python
def high_traffic_optimization_demo():
    """높은 트래픽 상황에서의 샘플링 최적화"""
    print("=== High Traffic Sampling Optimization ===")
    
    # 예산 제약이 있는 상황 시뮬레이션
    tracer = OptimizedTracer("high-traffic-service", monthly_budget=50.0)  # $50/월
    
    # 다양한 엔드포인트와 사용자 등급 시뮬레이션
    endpoints = [
        {
            "name": "/api/payment",
            "user_tiers": ["premium", "standard", "free"],
            "weight": 0.1  # 전체 트래픽의 10%
        },
        {
            "name": "/api/order",
            "user_tiers": ["premium", "standard", "free"],
            "weight": 0.15  # 15%
        },
        {
            "name": "/api/health",
            "user_tiers": ["premium", "standard", "free"],
            "weight": 0.3  # 30% (헬스체크 비중 높음)
        },
        {
            "name": "/api/search",
            "user_tiers": ["premium", "standard", "free"],
            "weight": 0.45  # 45%
        }
    ]
    
    # 1시간 동안 트래픽 시뮬레이션
    total_requests = 10000
    print(f"🚀 Simulating {total_requests:,} requests over 1 hour...")
    
    for i in range(total_requests):
        # 엔드포인트 선택 (가중치 기반)
        endpoint = random.choices(
            [ep["name"] for ep in endpoints],
            weights=[ep["weight"] for ep in endpoints]
        )[0]
        
        # 사용자 등급 선택
        user_tier = random.choices(
            ["premium", "standard", "free"],
            weights=[0.1, 0.3, 0.6]  # 대부분 free 사용자
        )[0]
        
        # 에러 상황 시뮬레이션 (5% 확률)
        has_error = random.random() < 0.05
        
        # 고액 거래 시뮬레이션 (결제 API에서 10% 확률)
        is_high_value = endpoint == "/api/payment" and random.random() < 0.1
        amount = random.uniform(1000, 5000) if is_high_value else random.uniform(10, 100)
        
        trace_context = {
            "has_error": has_error,
            "is_payment": endpoint == "/api/payment",
            "amount": amount,
            "user_id": f"user_{i % 1000}",
            "duration": random.uniform(0.1, 3.0) if not has_error else random.uniform(2.0, 5.0)
        }
        
        span = tracer.start_span_with_sampling(
            f"handle_{endpoint.split('/')[-1]}",
            endpoint=endpoint,
            user_tier=user_tier,
            trace_context=trace_context,
            user_id=trace_context["user_id"],
            amount=amount
        )
        
        # 실제 Span 사용 시뮬레이션
        if not isinstance(span, NoOpSpan):
            if has_error:
                span.record_exception(Exception("Simulated error"))
                span.set_status(trace.Status(trace.StatusCode.ERROR, "Request failed"))
            
            span.end()
        
        # 진행상황 출력 (1000개마다)
        if (i + 1) % 1000 == 0:
            stats = tracer.get_sampling_stats()
            sampling_rate = (stats["metrics"]["spans_sampled"] / max(stats["metrics"]["spans_created"], 1)) * 100
            print(f"  Progress: {i + 1:,}/{total_requests:,} requests, Sampling rate: {sampling_rate:.1f}%")
    
    # 최종 통계
    final_stats = tracer.get_sampling_stats()
    print(f"
📈 Final Statistics:")
    print(f"  • Total requests: {total_requests:,}")
    print(f"  • Spans created: {final_stats['metrics']['spans_created']:,}")
    print(f"  • Spans sampled: {final_stats['metrics']['spans_sampled']:,}")
    print(f"  • Spans dropped: {final_stats['metrics']['spans_dropped']:,}")
    
    budget = final_stats['budget_status']
    print(f"  • Budget utilization: {budget['usage_percentage']:.1f}%")
    print(f"  • Estimated monthly cost: ${budget['used_budget']:.2f}")
    print(f"  • Cost per request: ${budget['used_budget']/total_requests:.6f}")
```

### 시나리오 2: 에러 상황 대응

```python
def error_scenario_demo():
    """에러 상황에서의 적응형 샘플링"""
    print("\n=== Error Scenario Adaptive Sampling ===")
    
    tracer = OptimizedTracer("error-prone-service", monthly_budget=30.0)
    
    # 정상 운영 상황 (10분)
    print("🟢 Phase 1: Normal operation (10 minutes)...")
    for i in range(1000):
        span = tracer.start_span_with_sampling(
            "normal_operation",
            endpoint="/api/service",
            trace_context={
                "has_error": False,
                "duration": random.uniform(0.1, 0.5)
            }
        )
        if not isinstance(span, NoOpSpan):
            span.end()
    
    # 에러 발생 시작 (5분)
    print("🟡 Phase 2: Errors starting to occur (5 minutes)...")
    for i in range(500):
        has_error = random.random() < 0.2  # 20% 에러률
        span = tracer.start_span_with_sampling(
            "degraded_operation",
            endpoint="/api/service", 
            trace_context={
                "has_error": has_error,
                "duration": random.uniform(0.5, 2.0) if has_error else random.uniform(0.1, 0.5)
            }
        )
        if not isinstance(span, NoOpSpan):
            if has_error:
                span.record_exception(Exception("Service degradation"))
                span.set_status(trace.Status(trace.StatusCode.ERROR, "Degraded performance"))
            span.end()
    
    # 에러 증가 (5분)
    print("🔴 Phase 3: High error rate (5 minutes)...")
    for i in range(500):
        has_error = random.random() < 0.5  # 50% 에러률
        span = tracer.start_span_with_sampling(
            "high_error_operation",
            endpoint="/api/service",
            trace_context={
                "has_error": has_error,
                "duration": random.uniform(1.0, 4.0) if has_error else random.uniform(0.1, 0.5)
            }
        )
        if not isinstance(span, NoOpSpan):
            if has_error:
                span.record_exception(Exception("Critical service error"))
                span.set_status(trace.Status(trace.StatusCode.ERROR, "Service failure"))
            span.end()
    
    # 복구 (10분)
    print("🟢 Phase 4: Recovery (10 minutes)...")
    for i in range(1000):
        has_error = random.random() < 0.05  # 5% 에러률
        span = tracer.start_span_with_sampling(
            "recovery_operation",
            endpoint="/api/service",
            trace_context={
                "has_error": has_error,
                "duration": random.uniform(0.1, 0.8)
            }
        )
        if not isinstance(span, NoOpSpan):
            if has_error:
                span.record_exception(Exception("Residual error"))
                span.set_status(trace.Status(trace.StatusCode.ERROR, "Minor issue"))
            span.end()
    
    final_stats = tracer.get_sampling_stats()
    print(f"
📋 Error Scenario Results:")
    print(f"  • Total operations: 3,000")
    print(f"  • Adaptive sampling captured critical errors")
    print(f"  • Budget efficiency maintained: {final_stats['budget_status']['usage_percentage']:.1f}%")
    print(f"  • Final sampling rate: {(final_stats['metrics']['spans_sampled']/final_stats['metrics']['spans_created'])*100:.1f}%")
```

## 성능 벤치마크

```python
def sampling_performance_benchmark():
    """샘플링 성능 벤치마크"""
    print("\n=== Sampling Performance Benchmark ===")
    
    # 다른 샘플링 전략 비교
    strategies = [
        ("Basic (10%)", lambda: random.random() < 0.1),
        ("Intelligent", IntelligentSampler().get_sampling_rate),
        ("Adaptive", AdaptiveSampler().should_sample),
        ("Cost-Aware", CostAwareSampler(100.0).should_sample)
    ]
    
    test_contexts = [
        {"endpoint": "/api/payment", "user_tier": "premium", "has_error": False, "duration": 0.5},
        {"endpoint": "/api/health", "user_tier": "free", "has_error": False, "duration": 0.1},
        {"endpoint": "/api/order", "user_tier": "standard", "has_error": True, "duration": 3.0},
    ]
    
    iterations = 10000
    
    for strategy_name, strategy_func in strategies:
        print(f"\n📈 Testing {strategy_name}:")
        
        start_time = time.time()
        sample_count = 0
        
        for i in range(iterations):
            context = random.choice(test_contexts)
            
            try:
                if strategy_name == "Intelligent":
                    should_sample = random.random() < strategy_func(
                        context["endpoint"], context["user_tier"]
                    )
                elif strategy_name in ["Adaptive", "Cost-Aware"]:
                    should_sample = strategy_func(context)
                else:
                    should_sample = strategy_func()
                
                if should_sample:
                    sample_count += 1
                    
            except Exception as e:
                print(f"  ⚠️ Error in {strategy_name}: {e}")
        
        duration = time.time() - start_time
        sampling_rate = (sample_count / iterations) * 100
        ops_per_sec = iterations / duration
        
        print(f"  • Duration: {duration:.3f}s")
        print(f"  • Operations/sec: {ops_per_sec:,.0f}")
        print(f"  • Sampling rate: {sampling_rate:.1f}%")
        print(f"  • Samples collected: {sample_count:,}")
```

## 통합 테스트

```python
def comprehensive_sampling_test():
    """포괄적인 샘플링 최적화 테스트"""
    print("=== Comprehensive Sampling Optimization Test ===")
    
    # 각 시나리오 실행
    high_traffic_optimization_demo()
    error_scenario_demo()
    sampling_performance_benchmark()
    
    print("\n🏁 Test completed successfully!")
    print("💡 Key takeaways:")
    print("  • Intelligent sampling reduces costs while maintaining visibility")
    print("  • Adaptive sampling automatically responds to system health")
    print("  • Cost-aware sampling prevents budget overruns")
    print("  • Multi-layered approach provides comprehensive optimization")

if __name__ == "__main__":
    comprehensive_sampling_test()
```

## 핵심 요점

### 1.**다단계 샘플링 전략**

- 강제 샘플링: 중요 비즈니스 이벤트
- 적응형 샘플링: 에러/지연 상황 대응
- 지능형 샘플링: 비즈니스 중요도 반영
- 비용 인지 샘플링: 예산 관리

### 2.**성능 최적화 기법**

- 비동기 배치 처리
- Span 데이터 중복 제거
- 지능적 재시도 메커니즘
- 실시간 메트릭 리포팅

### 3.**비즈니스 가치 강화**

- ROI 기반 샘플링 예산 관리
- 사용자 등급별 차별화
- 시간대별 동적 조정
- SLA 준수를 위한 자동 샘플링

---

**이전**: [12-03-02-opentelemetry-implementation.md](12-03-02-opentelemetry-implementation.md)  
**다음**: [12.4.2 성능 프로파일링](./12-04-02-performance-profiling.md)에서 성능 병목 점 분석 방법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: ADVANCED
-**주제**: 인프라스트럭처
-**예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-12-observability-debugging)

- [13.1 로깅 및 모니터링 시스템 - 시스템의 눈과 귀 개요](./12-02-03-logging-monitoring.md)
- [13.1A 관찰 가능성 기초 - 시스템을 보는 눈](./12-01-01-observability-foundations.md)
- [13.1a 구조화된 로깅 - 검색 가능한 로그 시스템](./12-02-01-structured-logging.md)
- [13.1b 메트릭 수집 - 시스템 건강도 측정](./12-02-02-metrics-collection.md)
- [13.1B 구조화된 로깅 - 검색 가능한 로그](./12-03-04-advanced-structured-logging.md)

### 🏷️ 관련 키워드

`distributed-tracing`, `sampling-optimization`, `cost-management`, `performance-tuning`, `opentelemetry`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
