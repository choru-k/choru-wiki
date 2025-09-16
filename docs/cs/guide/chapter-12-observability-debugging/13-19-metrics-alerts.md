---
tags:
  - alerting
  - four_golden_signals
  - hands-on
  - intermediate
  - medium-read
  - metrics
  - observability
  - prometheus
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 13.3 메트릭 수집 및 알림 시스템

## 2024년 1월, 침묵하는 시스템의 비명

2024년 1월 15일 오전 10시, 평화로운 월요일 아침이었다. 커피 한 잔을 마시며 새해 계획을 세우고 있던 나에게 슬랙 메시지 하나가 도착했다.

"김 팀장님, 쇼핑몰 사이트가 굉장히 느려요. 고객들이 불만을 제기하고 있어요."

당황한 마음으로 시스템을 확인해보니, 모든 지표가 정상으로 보였다. CPU는 50%, 메모리는 60%, 응답 시간은... 어라? 응답 시간 데이터가 없었다. 로그를 확인해보니 에러는 없었지만, 실제 사용자 체감 성능은 최악이었다.

**문제는 우리가 잘못된 지표를 보고 있었다는 것이다.**

서버의 기본 시스템 메트릭(CPU, 메모리)만 모니터링하고 있었고, 정작 중요한 비즈니스 메트릭(실제 페이지 로딩 시간, 결제 완료율, 사용자 만족도)은 전혀 측정하지 않고 있었던 것이다.

그날부터 우리는 **진짜 중요한 메트릭**을 정의하고, **의미 있는 알림**을 구축하기 시작했다.

## 메트릭의 4가지 황금 신호

구글 SRE 팀이 제시한 **Four Golden Signals**를 기반으로 메트릭 수집 전략을 세워보자.

### 1. Latency (지연 시간)

```python
import time
import threading
from collections import defaultdict
from typing import Dict, List
import numpy as np  # pip install numpy

class LatencyTracker:
    def __init__(self, name: str):
        self.name = name
        self._measurements: Dict[str, List[float]] = defaultdict(list)
        self._lock = threading.Lock()
    
    def record(self, value: float, labels: Dict[str, str] = None):
        """지연 시간 측정값을 기록"""
        labels_key = self._labels_to_key(labels or {})
        
        with self._lock:
            self._measurements[labels_key].append(value)
    
    def get_percentiles(self, labels: Dict[str, str] = None) -> Dict[str, float]:
        """P50, P95, P99 지연 시간 반환"""
        labels_key = self._labels_to_key(labels or {})
        
        with self._lock:
            measurements = self._measurements[labels_key]
            if not measurements:
                return {}
            
            return {
                'p50': np.percentile(measurements, 50),
                'p95': np.percentile(measurements, 95),
                'p99': np.percentile(measurements, 99),
                'avg': np.mean(measurements),
                'count': len(measurements)
            }
    
    def _labels_to_key(self, labels: Dict[str, str]) -> str:
        return ','.join(f"{k}={v}" for k, v in sorted(labels.items()))

# 사용 예시
latency_tracker = LatencyTracker("api_request_duration")

def track_request_time(func):
    """데코레이터로 함수 실행 시간 추적"""
    def wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            status = 'success'
        except Exception as e:
            status = 'error'
            raise
        finally:
            duration = time.time() - start_time
            latency_tracker.record(duration, {'endpoint': func.__name__, 'status': status})
        return result
    return wrapper

@track_request_time
def get_user_profile(user_id: str):
    # 실제 비즈니스 로직
    time.sleep(0.1)  # DB 조회 시뮬레이션
    return {"user_id": user_id, "name": "John Doe"}
```

### 2. Traffic (트래픽)

```python
import time
import threading
from collections import deque, defaultdict

class TrafficCounter:
    def __init__(self, window_size: int = 300):  # 5분 윈도우
        self.window_size = window_size
        self._counts = defaultdict(deque)
        self._lock = threading.Lock()
    
    def increment(self, metric_name: str, labels: Dict[str, str] = None):
        """트래픽 카운트 증가"""
        labels_key = self._labels_to_key(labels or {})
        key = f"{metric_name}:{labels_key}"
        
        with self._lock:
            current_time = time.time()
            self._counts[key].append(current_time)
            
            # 윈도우 밖의 오래된 데이터 제거
            cutoff_time = current_time - self.window_size
            while self._counts[key] and self._counts[key][0] < cutoff_time:
                self._counts[key].popleft()
    
    def get_rate(self, metric_name: str, labels: Dict[str, str] = None) -> float:
        """초당 요청 수 (RPS) 반환"""
        labels_key = self._labels_to_key(labels or {})
        key = f"{metric_name}:{labels_key}"
        
        with self._lock:
            current_time = time.time()
            cutoff_time = current_time - self.window_size
            
            # 윈도우 내의 요청 수 계산
            valid_requests = sum(1 for timestamp in self._counts[key] if timestamp >= cutoff_time)
            return valid_requests / self.window_size
    
    def _labels_to_key(self, labels: Dict[str, str]) -> str:
        return ','.join(f"{k}={v}" for k, v in sorted(labels.items()))

# 사용 예시
traffic_counter = TrafficCounter()

def count_request(endpoint: str, method: str):
    traffic_counter.increment("http_requests_total", {
        'endpoint': endpoint,
        'method': method
    })

# API 요청마다 호출
count_request('/api/users', 'GET')
count_request('/api/orders', 'POST')
```

### 3. Errors (에러율)

```python
import time
from enum import Enum
from typing import Dict, Optional

class ErrorSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class ErrorTracker:
    def __init__(self):
        self._error_counts = defaultdict(int)
        self._total_counts = defaultdict(int)
        self._recent_errors = deque(maxlen=1000)  # 최근 1000개 에러 보관
        self._lock = threading.Lock()
    
    def record_success(self, operation: str, labels: Dict[str, str] = None):
        """성공한 작업 기록"""
        key = self._make_key(operation, labels)
        with self._lock:
            self._total_counts[key] += 1
    
    def record_error(self, operation: str, error: Exception, 
                    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
                    labels: Dict[str, str] = None):
        """에러 발생 기록"""
        key = self._make_key(operation, labels)
        
        with self._lock:
            self._error_counts[key] += 1
            self._total_counts[key] += 1
            
            # 에러 상세 정보 저장
            self._recent_errors.append({
                'timestamp': time.time(),
                'operation': operation,
                'error_type': type(error).__name__,
                'error_message': str(error),
                'severity': severity.value,
                'labels': labels or {}
            })
    
    def get_error_rate(self, operation: str, labels: Dict[str, str] = None) -> float:
        """에러율 계산 (0.0 ~ 1.0)"""
        key = self._make_key(operation, labels)
        
        with self._lock:
            total = self._total_counts[key]
            errors = self._error_counts[key]
            
            if total == 0:
                return 0.0
            return errors / total
    
    def get_recent_errors(self, limit: int = 10) -> List[Dict]:
        """최근 발생한 에러 목록"""
        with self._lock:
            return list(self._recent_errors)[-limit:]
    
    def _make_key(self, operation: str, labels: Dict[str, str] = None) -> str:
        labels_key = ','.join(f"{k}={v}" for k, v in sorted((labels or {}).items()))
        return f"{operation}:{labels_key}"

# 사용 예시
error_tracker = ErrorTracker()

def safe_database_operation(func):
    """데이터베이스 작업을 안전하게 실행하고 메트릭 수집"""
    def wrapper(*args, **kwargs):
        operation_name = f"db_{func.__name__}"
        try:
            result = func(*args, **kwargs)
            error_tracker.record_success(operation_name)
            return result
        except ConnectionError as e:
            error_tracker.record_error(operation_name, e, ErrorSeverity.HIGH)
            raise
        except TimeoutError as e:
            error_tracker.record_error(operation_name, e, ErrorSeverity.MEDIUM)
            raise
        except Exception as e:
            error_tracker.record_error(operation_name, e, ErrorSeverity.LOW)
            raise
    return wrapper

@safe_database_operation
def get_user_orders(user_id: str):
    # 실제 DB 조회 로직
    pass
```

### 4. Saturation (포화도)

```python
import psutil
import threading
import time
from typing import Dict, List

class SaturationMonitor:
    def __init__(self, sample_interval: int = 10):
        self.sample_interval = sample_interval
        self._metrics_history: Dict[str, List[float]] = defaultdict(list)
        self._running = False
        self._thread = None
        self._lock = threading.Lock()
    
    def start(self):
        """포화도 모니터링 시작"""
        self._running = True
        self._thread = threading.Thread(target=self._collect_metrics, daemon=True)
        self._thread.start()
    
    def stop(self):
        """포화도 모니터링 중지"""
        self._running = False
        if self._thread:
            self._thread.join()
    
    def _collect_metrics(self):
        """시스템 메트릭 주기적 수집"""
        while self._running:
            try:
                # CPU 사용률
                cpu_percent = psutil.cpu_percent(interval=1)
                
                # 메모리 사용률
                memory = psutil.virtual_memory()
                memory_percent = memory.percent
                
                # 디스크 사용률
                disk = psutil.disk_usage('/')
                disk_percent = disk.percent
                
                # 네트워크 I/O
                net_io = psutil.net_io_counters()
                
                with self._lock:
                    current_time = time.time()
                    
                    # 메트릭 기록 (최근 100개 샘플만 유지)
                    for metric_name, value in [
                        ('cpu_usage', cpu_percent),
                        ('memory_usage', memory_percent),
                        ('disk_usage', disk_percent),
                        ('network_bytes_sent', net_io.bytes_sent),
                        ('network_bytes_recv', net_io.bytes_recv)
                    ]:
                        history = self._metrics_history[metric_name]
                        history.append((current_time, value))
                        
                        # 오래된 데이터 제거 (10분 이상)
                        cutoff_time = current_time - 600
                        while history and history[0][0] < cutoff_time:
                            history.pop(0)
                
                time.sleep(self.sample_interval)
                
            except Exception as e:
                print(f"메트릭 수집 중 오류: {e}")
                time.sleep(self.sample_interval)
    
    def get_current_saturation(self) -> Dict[str, float]:
        """현재 시스템 포화도 반환"""
        with self._lock:
            result = {}
            for metric_name, history in self._metrics_history.items():
                if history:
                    latest_value = history[-1][1]
                    result[metric_name] = latest_value
            return result
    
    def get_saturation_trend(self, metric_name: str, minutes: int = 5) -> List[tuple]:
        """특정 메트릭의 시간별 트렌드 반환"""
        with self._lock:
            history = self._metrics_history.get(metric_name, [])
            cutoff_time = time.time() - (minutes * 60)
            return [(timestamp, value) for timestamp, value in history if timestamp >= cutoff_time]

# 사용 예시
saturation_monitor = SaturationMonitor()
saturation_monitor.start()
```

## Prometheus 통합 메트릭 수집기

실제 운영 환경에서는 Prometheus와 같은 검증된 메트릭 수집 시스템을 사용한다.

```python
from prometheus_client import Counter, Histogram, Gauge, start_http_server
import time
import functools

# Prometheus 메트릭 정의
REQUEST_COUNT = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint', 'status'])
REQUEST_DURATION = Histogram('http_request_duration_seconds', 'HTTP request duration', ['method', 'endpoint'])
ACTIVE_CONNECTIONS = Gauge('active_connections', 'Number of active connections')
ERROR_RATE = Gauge('error_rate', 'Current error rate', ['service'])

class PrometheusMetricsCollector:
    def __init__(self, port: int = 8000):
        self.port = port
        self._server_started = False
    
    def start_server(self):
        """Prometheus 메트릭 서버 시작"""
        if not self._server_started:
            start_http_server(self.port)
            self._server_started = True
            print(f"Prometheus 메트릭 서버 시작: http://localhost:{self.port}/metrics")
    
    def track_requests(self, func):
        """HTTP 요청 추적 데코레이터"""
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            method = getattr(func, '__method__', 'unknown')
            endpoint = func.__name__
            
            with REQUEST_DURATION.labels(method=method, endpoint=endpoint).time():
                try:
                    result = func(*args, **kwargs)
                    REQUEST_COUNT.labels(method=method, endpoint=endpoint, status='success').inc()
                    return result
                except Exception as e:
                    REQUEST_COUNT.labels(method=method, endpoint=endpoint, status='error').inc()
                    raise
        return wrapper

# 사용 예시
metrics_collector = PrometheusMetricsCollector()
metrics_collector.start_server()

@metrics_collector.track_requests
def api_get_user(user_id: str):
    # API 로직
    time.sleep(0.1)
    return {"user_id": user_id}

# 활성 연결 수 업데이트
ACTIVE_CONNECTIONS.set(42)

# 에러율 업데이트
ERROR_RATE.labels(service='user-service').set(0.05)
```

## 지능형 알림 시스템

단순히 임계값을 넘었을 때만 알림을 보내는 것이 아니라, **컨텍스트를 이해하는 알림**을 구축해보자.

```python
import asyncio
import aiohttp
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

class AlertSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

class AlertState(Enum):
    FIRING = "firing"
    RESOLVED = "resolved"
    SILENCED = "silenced"

@dataclass
class Alert:
    id: str
    title: str
    description: str
    severity: AlertSeverity
    state: AlertState
    timestamp: datetime
    labels: Dict[str, str]
    annotations: Dict[str, str]
    resolution_time: Optional[datetime] = None

class IntelligentAlertManager:
    def __init__(self):
        self._active_alerts: Dict[str, Alert] = {}
        self._alert_history: List[Alert] = []
        self._notification_channels: List['NotificationChannel'] = []
        self._suppression_rules: List['SuppressionRule'] = []
        
    async def evaluate_alert(self, metric_name: str, current_value: float, 
                           threshold: float, comparison: str = 'greater') -> Optional[Alert]:
        """메트릭 기반 알림 평가"""
        
        # 기본 조건 평가
        should_fire = False
        if comparison == 'greater':
            should_fire = current_value > threshold
        elif comparison == 'less':
            should_fire = current_value < threshold
        
        alert_id = f"{metric_name}_threshold"
        
        if should_fire:
            # 새로운 알림 생성
            if alert_id not in self._active_alerts:
                alert = Alert(
                    id=alert_id,
                    title=f"{metric_name} 임계값 초과",
                    description=f"{metric_name} 값이 {current_value}로 임계값 {threshold}을 초과했습니다",
                    severity=self._calculate_severity(metric_name, current_value, threshold),
                    state=AlertState.FIRING,
                    timestamp=datetime.now(),
                    labels={'metric': metric_name, 'type': 'threshold'},
                    annotations={'current_value': str(current_value), 'threshold': str(threshold)}
                )
                
                # 억제 규칙 확인
                if not self._is_suppressed(alert):
                    self._active_alerts[alert_id] = alert
                    await self._send_notifications(alert)
                    return alert
        else:
            # 알림 해결
            if alert_id in self._active_alerts:
                alert = self._active_alerts[alert_id]
                alert.state = AlertState.RESOLVED
                alert.resolution_time = datetime.now()
                
                del self._active_alerts[alert_id]
                self._alert_history.append(alert)
                
                await self._send_notifications(alert)
                return alert
        
        return None
    
    def _calculate_severity(self, metric_name: str, current_value: float, threshold: float) -> AlertSeverity:
        """동적 심각도 계산"""
        excess_ratio = current_value / threshold
        
        if metric_name.startswith('error_rate'):
            if excess_ratio > 5:
                return AlertSeverity.CRITICAL
            elif excess_ratio > 2:
                return AlertSeverity.WARNING
            else:
                return AlertSeverity.INFO
        
        # CPU, 메모리 등의 경우
        if excess_ratio > 1.5:
            return AlertSeverity.CRITICAL
        elif excess_ratio > 1.2:
            return AlertSeverity.WARNING
        else:
            return AlertSeverity.INFO
    
    def _is_suppressed(self, alert: Alert) -> bool:
        """억제 규칙 확인"""
        for rule in self._suppression_rules:
            if rule.matches(alert):
                return True
        return False
    
    async def _send_notifications(self, alert: Alert):
        """모든 알림 채널로 전송"""
        tasks = []
        for channel in self._notification_channels:
            if channel.should_notify(alert):
                tasks.append(channel.send(alert))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

class SlackNotificationChannel:
    def __init__(self, webhook_url: str, min_severity: AlertSeverity = AlertSeverity.WARNING):
        self.webhook_url = webhook_url
        self.min_severity = min_severity
    
    def should_notify(self, alert: Alert) -> bool:
        """알림 전송 여부 결정"""
        severity_order = {AlertSeverity.INFO: 1, AlertSeverity.WARNING: 2, AlertSeverity.CRITICAL: 3}
        return severity_order[alert.severity] >= severity_order[self.min_severity]
    
    async def send(self, alert: Alert):
        """Slack으로 알림 전송"""
        color_map = {
            AlertSeverity.INFO: "#36a64f",
            AlertSeverity.WARNING: "#ff9500", 
            AlertSeverity.CRITICAL: "#ff0000"
        }
        
        state_emoji = {
            AlertState.FIRING: "🔥",
            AlertState.RESOLVED: "✅"
        }
        
        payload = {
            "attachments": [{
                "color": color_map[alert.severity],
                "title": f"{state_emoji[alert.state]} {alert.title}",
                "text": alert.description,
                "fields": [
                    {"title": "심각도", "value": alert.severity.value, "short": True},
                    {"title": "상태", "value": alert.state.value, "short": True},
                    {"title": "시간", "value": alert.timestamp.strftime("%Y-%m-%d %H:%M:%S"), "short": True}
                ],
                "footer": "System Monitoring",
                "ts": int(alert.timestamp.timestamp())
            }]
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(self.webhook_url, json=payload) as response:
                if response.status != 200:
                    print(f"Slack 알림 전송 실패: {response.status}")

# 사용 예시
async def main():
    # 알림 매니저 설정
    alert_manager = IntelligentAlertManager()
    
    # Slack 채널 추가
    slack_channel = SlackNotificationChannel(
        webhook_url="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
        min_severity=AlertSeverity.WARNING
    )
    alert_manager._notification_channels.append(slack_channel)
    
    # 메트릭 모니터링 루프
    while True:
        # 현재 메트릭 수집
        current_metrics = {
            'cpu_usage': 85.0,
            'memory_usage': 78.5,
            'error_rate': 0.05,
            'response_time_p99': 1.2
        }
        
        # 각 메트릭에 대해 알림 평가
        for metric_name, value in current_metrics.items():
            thresholds = {
                'cpu_usage': 80.0,
                'memory_usage': 75.0,
                'error_rate': 0.02,
                'response_time_p99': 1.0
            }
            
            if metric_name in thresholds:
                await alert_manager.evaluate_alert(
                    metric_name=metric_name,
                    current_value=value,
                    threshold=thresholds[metric_name]
                )
        
        await asyncio.sleep(30)  # 30초마다 평가

# asyncio.run(main())
```

## 비즈니스 메트릭 추적

기술적 메트릭뿐만 아니라 **비즈니스 임팩트**를 측정하는 것이 중요하다.

```python
class BusinessMetricsTracker:
    def __init__(self):
        self._daily_metrics = defaultdict(lambda: defaultdict(float))
        self._hourly_metrics = defaultdict(lambda: defaultdict(float))
    
    def track_conversion(self, user_id: str, event_type: str, value: float = 1.0):
        """전환 이벤트 추적"""
        current_time = datetime.now()
        date_key = current_time.strftime("%Y-%m-%d")
        hour_key = current_time.strftime("%Y-%m-%d-%H")
        
        # 일별 메트릭
        self._daily_metrics[date_key][event_type] += value
        
        # 시간별 메트릭
        self._hourly_metrics[hour_key][event_type] += value
        
        # Prometheus에도 기록
        if event_type == 'purchase':
            BUSINESS_EVENTS.labels(event='purchase').inc(value)
        elif event_type == 'signup':
            BUSINESS_EVENTS.labels(event='signup').inc()
    
    def get_conversion_rate(self, date: str) -> Dict[str, float]:
        """일별 전환율 계산"""
        daily_data = self._daily_metrics[date]
        
        if 'page_views' in daily_data and daily_data['page_views'] > 0:
            return {
                'signup_rate': daily_data.get('signup', 0) / daily_data['page_views'],
                'purchase_rate': daily_data.get('purchase', 0) / daily_data['page_views'],
                'cart_abandonment_rate': 1 - (daily_data.get('purchase', 0) / max(daily_data.get('add_to_cart', 1), 1))
            }
        return {}

# Prometheus 비즈니스 메트릭
BUSINESS_EVENTS = Counter('business_events_total', 'Business events', ['event'])

# 사용 예시
business_tracker = BusinessMetricsTracker()

def track_user_action(action_type: str):
    def decorator(func):
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            
            # 사용자 ID 추출 (예시)
            user_id = kwargs.get('user_id') or getattr(result, 'user_id', 'anonymous')
            
            business_tracker.track_conversion(user_id, action_type)
            return result
        return wrapper
    return decorator

@track_user_action('page_view')
def view_product_page(product_id: str, user_id: str = None):
    return {"product_id": product_id}

@track_user_action('purchase')
def complete_purchase(order_id: str, user_id: str, amount: float):
    business_tracker.track_conversion(user_id, 'purchase', amount)
    return {"order_id": order_id, "amount": amount}
```

## 대시보드와 시각화

```python
import matplotlib.pyplot as plt
import seaborn as sns
from typing import List, Tuple
import pandas as pd

class MetricsDashboard:
    def __init__(self, metrics_collector):
        self.metrics = metrics_collector
        
    def generate_sre_dashboard(self) -> str:
        """SRE 대시보드 HTML 생성"""
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>SRE Dashboard</title>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .metric-card { 
                    border: 1px solid #ddd; 
                    padding: 20px; 
                    margin: 10px;
                    border-radius: 8px;
                    background: #f9f9f9;
                }
                .critical { border-left: 5px solid #ff4444; }
                .warning { border-left: 5px solid #ffaa00; }
                .normal { border-left: 5px solid #44ff44; }
            </style>
        </head>
        <body>
            <h1>🔥 Site Reliability Engineering Dashboard</h1>
            
            <!-- Golden Signals -->
            <div class="golden-signals">
                <h2>📊 Four Golden Signals</h2>
                <div class="metric-card normal">
                    <h3>Latency</h3>
                    <p>P99: 120ms | P95: 80ms | P50: 45ms</p>
                </div>
                <div class="metric-card warning">
                    <h3>Traffic</h3>
                    <p>Current RPS: 1,247 | Peak: 2,100</p>
                </div>
                <div class="metric-card normal">
                    <h3>Errors</h3>
                    <p>Error Rate: 0.12% | Total Errors: 156</p>
                </div>
                <div class="metric-card critical">
                    <h3>Saturation</h3>
                    <p>CPU: 87% | Memory: 76% | Disk: 23%</p>
                </div>
            </div>
            
            <!-- Business Metrics -->
            <div class="business-metrics">
                <h2>💰 Business Impact</h2>
                <div class="metric-card normal">
                    <h3>Revenue</h3>
                    <p>Today: $12,450 | Yesterday: $11,890 (+4.7%)</p>
                </div>
                <div class="metric-card normal">
                    <h3>Conversions</h3>
                    <p>Signup Rate: 2.3% | Purchase Rate: 1.8%</p>
                </div>
            </div>
            
            <div id="latency-chart" style="width:100%;height:400px;"></div>
            
            <script>
                // 지연 시간 차트 생성
                var trace = {
                    x: ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00'],
                    y: [45, 52, 48, 67, 89, 76],
                    type: 'scatter',
                    name: 'P99 Latency'
                };
                
                var layout = {
                    title: 'Response Time Trend',
                    xaxis: { title: 'Time' },
                    yaxis: { title: 'Latency (ms)' }
                };
                
                Plotly.newPlot('latency-chart', [trace], layout);
            </script>
        </body>
        </html>
        """
        return html
```

## 레슨 런

### 1. 메트릭의 계층구조를 이해하라

**기술 메트릭 → 비즈니스 메트릭 → 사용자 경험**의 연결고리를 파악해야 한다.

- CPU 사용률 ↗ → 응답 시간 ↗ → 사용자 이탈률 ↗ → 매출 ↘

### 2. 알림 피로도를 줄여라

너무 많은 알림은 **중요한 알림을 묻어버린다**. 지능형 알림 시스템으로 노이즈를 줄이자.

### 3. 컨텍스트가 있는 메트릭을 수집하라

단순한 수치가 아니라 **왜 그런 값이 나왔는지** 알 수 있는 메타데이터를 함께 수집하자.

### 4. 비즈니스 임팩트를 측정하라

기술적 문제가 비즈니스에 미치는 **실제 영향**을 정량화해야 한다.

---

**다음 장에서는** 성능 프로파일링 기법을 통해 시스템 병목을 정확히 찾아내는 방법을 학습한다. 메트릭으로 문제를 감지했다면, 프로파일링으로 근본 원인을 파악해야 한다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-13-observability-debugging)

- [13.1 로깅 및 모니터링 시스템 - 시스템의 눈과 귀 개요](./12-40-logging-monitoring.md)
- [13.1A 관찰 가능성 기초 - 시스템을 보는 눈](./12-10-observability-foundations.md)
- [13.1a 구조화된 로깅 - 검색 가능한 로그 시스템](./12-11-structured-logging.md)
- [13.1b 메트릭 수집 - 시스템 건강도 측정](./12-12-metrics-collection.md)
- [13.1B 구조화된 로깅 - 검색 가능한 로그](./12-13-structured-logging.md)

### 🏷️ 관련 키워드

`observability`, `metrics`, `alerting`, `prometheus`, `four_golden_signals`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
