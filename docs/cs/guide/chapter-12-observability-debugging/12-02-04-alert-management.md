---
tags:
  - alerting
  - hands-on
  - incident-response
  - intermediate
  - medium-read
  - monitoring
  - notification
  - observability
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 12.2.4: 알림 관리

## 🚨 지능적인 알림 시스템

알림 시스템은 단순히 임계값을 넘기면 알림을 보내는 것이 아닙니다. 심각도에 따른 라우팅, 중복 알림 방지, 컨텍스트 정보 제공 등을 통해 효과적인 사고 대응을 지원합니다.

### 알림 데이터 모델

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
```

## 📬 다양한 알림 채널 구현

### 알림 채널 추상화

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
    """슬랙 알림 채널"""
    
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
    
    def send(self, alert: Alert) -> bool:
        """슬랙 알림 전송"""
        try:
            # 실제로는 슬랙 웹훅 호출
            print(f"💬 Slack notification: {alert.title}")
            
            slack_message = self._format_slack_message(alert)
            print(f"   Message: {slack_message}")
            
            return True
        except Exception as e:
            print(f"❌ Slack send failed: {e}")
            return False
    
    def _format_slack_message(self, alert: Alert) -> str:
        """슬랙 메시지 포맷팅"""
        emoji_map = {
            AlertSeverity.LOW: "🟢",
            AlertSeverity.MEDIUM: "🟡", 
            AlertSeverity.HIGH: "🟠",
            AlertSeverity.CRITICAL: "🔴"
        }
        
        emoji = emoji_map.get(alert.severity, "⚠️")
        
        return f"{emoji} *{alert.title}* ({alert.severity.value}), {alert.description}"

class PagerDutyNotification(NotificationChannel):
    """페이저듀티 알림 채널"""
    
    def __init__(self, integration_key: str):
        self.integration_key = integration_key
    
    def send(self, alert: Alert) -> bool:
        """페이저듀티 알림 전송"""
        try:
            # 실제로는 PagerDuty API 호출
            print(f"📟 PagerDuty incident: {alert.title}")
            return True
        except Exception as e:
            print(f"❌ PagerDuty send failed: {e}")
            return False
```

## 🧠 지능적인 알림 관리자

### 라우팅과 억제 규칙

```python
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
```

## 🔎 메트릭 감시기 구현

### 실시간 메트릭 모니터링

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
```

## 🧪 알림 시스템 테스트

```python
# Alert Management 시스템 테스트
def test_alert_system():
    print("=== Alert Management 시스템 테스트 ===\n")
    
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
    
    print("--- 알림 규칙 트리거 테스트 ---")
    
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
    from collections import namedtuple
    MockMetricsCollector = namedtuple('MockMetricsCollector', [])
    metrics_collector = MockMetricsCollector()
    
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

## 핵심 요점

### 1. 심각도 기반 라우팅

CRITICAL 알림은 PagerDuty로, HIGH 알림은 Slack으로, MEDIUM 알림은 이메일로 분배하여 적절한 대응을 유도합니다.

### 2. 중복 알림 방지

억제 규칙을 통해 같은 서비스에서 발생하는 유사한 알림들을 일정 시간 동안 억제합니다.

### 3. 컨텍스트 정보 제공

알림에 메트릭 값, 서비스 상태, runbook URL 등을 포함하여 빠른 문제 해결을 지원합니다.

---

**이전**: [01b 메트릭 수집](12-02-02-metrics-collection.md)  
**다음**: [01d 모범 사례와 교훈](12-06-01-best-practices-lessons.md)에서 관찰 가능성 구축의 모범 사례와 핵심 교훈을 학습합니다.

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

`alerting`, `notification`, `incident-response`, `monitoring`, `observability`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
