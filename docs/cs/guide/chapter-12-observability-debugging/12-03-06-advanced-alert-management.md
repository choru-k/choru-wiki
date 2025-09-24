---
tags:
  - alert_management
  - hands-on
  - incident_response
  - intermediate
  - medium-read
  - monitoring_automation
  - notification_routing
  - observability
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 12.3.6: 고급 알림 관리

알림 관리 시스템은 시스템에서 발생하는 비정상적인 상황을**실시간으로 감지**하고, 적절한 담당자에게**자동으로 알림**을 전송하는 시스템입니다. 지능적인 알림 규칙, 중복 방지, 심각도 기반 라우팅 등을 통해 알림 피로도를 방지하고 효율적인 사고 대응을 가능하게 합니다.

## 🚨 지능적인 알림 시스템

### 알림 시스템의 핵심 구성 요소

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
```

### 다양한 알림 채널 지원

```python
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
            print(f"\u274c Email send failed: {e}")
            return False
    
    def _format_email(self, alert: Alert) -> str:
        """이메일 내용 포매팅"""
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
    """슬랙 알림 채널"""
    
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
    
    def send(self, alert: Alert) -> bool:
        """슬랙 알림 전송"""
        try:
            # 실제로는 Slack 웹훅 호출
            print(f"💬 Slack notification: {alert.title}")
            
            slack_message = self._format_slack_message(alert)
            print(f"   Message: {slack_message}")
            
            return True
        except Exception as e:
            print(f"\u274c Slack send failed: {e}")
            return False
    
    def _format_slack_message(self, alert: Alert) -> str:
        """슬랙 메시지 포매팅"""
        emoji_map = {
            AlertSeverity.LOW: "🟢",
            AlertSeverity.MEDIUM: "🟡", 
            AlertSeverity.HIGH: "🟠",
            AlertSeverity.CRITICAL: "🔴"
        }
        
        emoji = emoji_map.get(alert.severity, "\u26a0\ufe0f")
        
        return f"{emoji} *{alert.title}* ({alert.severity.value}), {alert.description}"

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
            print(f"\u274c PagerDuty send failed: {e}")
            return False
```

### 알림 규칙 및 관리자

```python
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
                
                # 같은 레이블 조합의 최근 알림 확인
                for existing_alert in self.alerts.values():
                    if (self._matches_labels(existing_alert.labels, rule.get('match', {})) and
                        (alert.timestamp - existing_alert.timestamp).total_seconds() < suppression_duration):
                        return True
        
        return False
    
    def _matches_labels(self, alert_labels: Dict[str, str], match_criteria: Dict[str, str]) -> bool:
        """레이블 매칭 확인"""
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
            print(f"\u2705 Alert acknowledged: {alert.title} by {acknowledged_by}")
    
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
```

## 👁️ 메트릭 감시기

### 실시간 임계값 모니터링

```python
# 실제 모니터링과 연동하는 메트릭 감시기
class MetricWatcher:
    """메트릭 감시기"""
    
    def __init__(self, metrics_collector: 'MetricsCollector', alert_manager: AlertManager):
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
                    print(f"\u274c Monitoring error: {e}")
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
```

## 📈 알림 피로도 방지 전략

### 1. 억제 규칙 (Suppression Rules)

```python
# 예시: 같은 서비스에서 30분간 동일한 알림 억제
alert_manager.add_suppression_rule({
    'match': {'service': 'payment'},
    'duration': 1800  # 30분
})

# 예시: 타임아웃 에러의 경우 5분간 억제
alert_manager.add_suppression_rule({
    'match': {'error_type': 'TimeoutException'},
    'duration': 300  # 5분
})
```

### 2. 심각도 기반 라우팅

```python
# CRITICAL: PagerDuty + Slack + Email
alert_manager.add_routing_rule({
    'match': {'severity': 'critical'},
    'channels': ['pagerduty', 'slack', 'email']
})

# HIGH: Slack + Email
alert_manager.add_routing_rule({
    'match': {'severity': 'high'},
    'channels': ['slack', 'email']
})

# MEDIUM: Email 만
alert_manager.add_routing_rule({
    'match': {'severity': 'medium'},
    'channels': ['email']
})

# LOW: 로그만 기록 (알림 미전송)
alert_manager.add_routing_rule({
    'match': {'severity': 'low'},
    'channels': []  # 빈 리스트 = 알림 전송 안함
})
```

### 3. 시간대별 알림 규칙

```python
from datetime import datetime, time as dt_time

class TimeBasedRouting:
    """시간대별 라우팅"""
    
    @staticmethod
    def get_channels_for_time(alert: Alert, current_time: datetime = None) -> List[str]:
        if current_time is None:
            current_time = datetime.now()
        
        current_hour = current_time.hour
        is_weekend = current_time.weekday() >= 5  # 0=월요일, 6=일요일
        
        # 업무 시간 (9-18시, 평일)
        is_business_hours = (9 <= current_hour <= 18) and not is_weekend
        
        if alert.severity == AlertSeverity.CRITICAL:
            # 심각한 알림은 언제나 모든 채널
            return ['pagerduty', 'slack', 'email']
        elif alert.severity == AlertSeverity.HIGH:
            if is_business_hours:
                return ['slack', 'email']
            else:
                # 비업무시간에는 대기 가능한 채널만
                return ['email']
        else:
            if is_business_hours:
                return ['email']
            else:
                # 비업무시간 일반 알림은 대기열에 저장
                return []
```

## 📊 알림 효과성 측정

### 알림 성능 메트릭

```python
class AlertMetrics:
    """알림 시스템 성능 메트릭"""
    
    def __init__(self):
        self.alert_response_times = []  # 알림 대응 시간
        self.false_positive_count = 0   # 오탐지 알림
        self.escalation_count = 0       # 에스칼레이션 알림
        self.resolution_times = []      # 문제 해결 시간
    
    def record_alert_acknowledged(self, alert: Alert, response_time_minutes: float):
        """알림 확인 기록"""
        self.alert_response_times.append(response_time_minutes)
        
        # 빠른 응답 (5분 내) 기준으로 효과성 평가
        if response_time_minutes <= 5:
            print(f"\u2705 빠른 응답: {response_time_minutes:.1f}분")
        elif response_time_minutes <= 15:
            print(f"\u26a0\ufe0f 보통 응답: {response_time_minutes:.1f}분")
        else:
            print(f"\u274c 느린 응답: {response_time_minutes:.1f}분")
    
    def record_false_positive(self, alert: Alert):
        """오탐지 알림 기록"""
        self.false_positive_count += 1
        print(f"\ud83d� 오탐지 알림 기록: {alert.title}")
    
    def get_alert_effectiveness_report(self) -> Dict[str, Any]:
        """알림 효과성 리포트"""
        if not self.alert_response_times:
            return {'error': '충분한 데이터가 없습니다'}
        
        avg_response_time = sum(self.alert_response_times) / len(self.alert_response_times)
        total_alerts = len(self.alert_response_times) + self.false_positive_count
        false_positive_rate = self.false_positive_count / total_alerts if total_alerts > 0 else 0
        
        return {
            'avg_response_time_minutes': round(avg_response_time, 2),
            'total_alerts': total_alerts,
            'false_positive_rate': round(false_positive_rate * 100, 2),
            'fast_response_rate': round(len([t for t in self.alert_response_times if t <= 5]) / len(self.alert_response_times) * 100, 2)
        }
```

## 🔧 Alert Management 시스템 테스트

```python
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
    
    print(", --- 알림 규칙 트리거 테스트 ---")
    
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
    
    print(f", --- 알림 상태 관리 테스트 ---")
    
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
    print(f", 📊 Alert Manager 통계:")
    for key, value in stats.items():
        print(f"  {key}: {value}")
    
    print(f", 👀 메트릭 감시기 시작...")
    
    # 메트릭 감시기 테스트 (이전 섹션의 MetricsCollector 사용)
    from unittest.mock import Mock
    metrics_collector = Mock()  # Mock 객체 사용
    watcher = MetricWatcher(metrics_collector, alert_manager)
    watcher.start_monitoring()
    
    print("   10초간 메트릭 감시...")
    time.sleep(10)
    
    watcher.stop_monitoring()
    print("\u2705 Alert Management 시스템 테스트 완료")

# 실행
if __name__ == "__main__":
    import random
    test_alert_system()
```

## 핵심 요점

### 1. 지능적인 알림 라우팅

심각도와 상황에 따라 적절한 채널로 알림을 전송하여 알림 피로도를 방지합니다.

### 2. 중복 알림 방지

억제 규칙을 통해 동일한 문제에 대한 중복 알림을 방지하고 집중력을 향상시킵니다.

### 3. 실시간 모니터링

메트릭 감시기를 통해 실시간으로 임계값을 모니터링하고 문제를 조기에 발견합니다.

### 4. 성능 측정과 개선

알림 시스템 자체의 효과성을 측정하고 지속적으로 개선하여 보다 효율적인 알림 시스템을 운영합니다.

---

**이전**: [13.1C 메트릭 수집](12-03-05-advanced-metrics-collection.md)  
**다음**: [12.6.1 모범 사례와 경험 공유](./12-06-01-best-practices-lessons.md)에서 로깅, 메트릭, 알림을 통합한 베스트 프랙티스를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 인프라스트럭처
-**예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-12-observability-debugging)

- [13.1 로깅 및 모니터링 시스템 - 시스템의 눈과 귀 개요](./12-02-03-logging-monitoring.md)
- [13.1A 관찰 가능성 기초 - 시스템을 보는 눈](./12-01-01-observability-foundations.md)
- [13.1a 구조화된 로깅 - 검색 가능한 로그 시스템](./12-02-01-structured-logging.md)
- [13.1b 메트릭 수집 - 시스템 건강도 측정](./12-02-02-metrics-collection.md)
- [13.1B 구조화된 로깅 - 검색 가능한 로그](./12-03-04-advanced-structured-logging.md)

### 🏷️ 관련 키워드

`alert_management`, `notification_routing`, `observability`, `incident_response`, `monitoring_automation`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
