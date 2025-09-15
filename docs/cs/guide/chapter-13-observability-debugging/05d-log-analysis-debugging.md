---
tags:
  - Debugging
  - Log Analysis
  - Automation
  - Pattern Recognition
  - Anomaly Detection
---

# 13.5d 로그 분석과 자동 디버깅

## 로그 기반 디버깅의 힘

수만 줄의 로그를 사람이 읽을 수는 없다. **패턴 인식**과 **이상 징후 감지**를 자동화하여 효과적인 로그 분석을 통한 디버깅 기법을 살펴보자.

```python
import re
import json
from collections import defaultdict, Counter
from typing import Dict, List, Pattern
import matplotlib.pyplot as plt
from datetime import datetime, timedelta

class LogAnalyzer:
    def __init__(self):
        self.log_entries: List[Dict] = []
        self.patterns: Dict[str, Pattern] = {
            'error': re.compile(r'ERROR|FATAL|Exception|Error'),
            'warning': re.compile(r'WARN|WARNING'),
            'slow_query': re.compile(r'slow.*query|query.*took.*(\d+)ms'),
            'timeout': re.compile(r'timeout|timed.*out'),
            'memory_issue': re.compile(r'OutOfMemory|MemoryError|memory.*exceeded'),
            'connection_issue': re.compile(r'connection.*refused|connection.*lost|connection.*timeout')
        }
    
    def parse_log_file(self, log_file_path: str):
        """로그 파일 파싱"""
        with open(log_file_path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    # JSON 형태의 구조화된 로그 파싱
                    if line.strip().startswith('{'):
                        entry = json.loads(line.strip())
                    else:
                        # 일반 텍스트 로그 파싱
                        entry = self._parse_text_log(line)
                    
                    self.log_entries.append(entry)
                except Exception as e:
                    print(f"로그 파싱 오류: {e}")
    
    def _parse_text_log(self, log_line: str) -> Dict:
        """텍스트 로그 파싱"""
        # 간단한 로그 형식: [2024-08-03 19:30:15] ERROR [service-name] 메시지
        log_pattern = re.compile(
            r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] (\w+) \[([^\]]+)\] (.+)'
        )
        
        match = log_pattern.match(log_line.strip())
        if match:
            timestamp, level, service, message = match.groups()
            return {
                'timestamp': timestamp,
                'level': level,
                'service': service,
                'message': message,
                'raw_line': log_line.strip()
            }
        else:
            return {
                'timestamp': datetime.now().isoformat(),
                'level': 'UNKNOWN',
                'service': 'unknown',
                'message': log_line.strip(),
                'raw_line': log_line.strip()
            }
    
    def detect_anomalies(self, time_window_minutes: int = 30) -> Dict[str, List]:
        """로그 패턴 기반 이상 징후 감지"""
        anomalies = defaultdict(list)
        
        # 시간 윈도우별 로그 분석
        time_buckets = defaultdict(list)
        for entry in self.log_entries:
            try:
                timestamp = datetime.fromisoformat(entry['timestamp'].replace('T', ' '))
                bucket = timestamp.replace(minute=(timestamp.minute // time_window_minutes) * time_window_minutes, 
                                         second=0, microsecond=0)
                time_buckets[bucket].append(entry)
            except:
                continue
        
        for time_bucket, entries in time_buckets.items():
            # 1. 급격한 에러 증가
            error_count = sum(1 for e in entries if self.patterns['error'].search(e.get('message', '')))
            total_count = len(entries)
            
            if total_count > 0:
                error_rate = error_count / total_count
                if error_rate > 0.1:  # 10% 이상 에러
                    anomalies['high_error_rate'].append({
                        'timestamp': time_bucket.isoformat(),
                        'error_rate': error_rate,
                        'error_count': error_count,
                        'total_count': total_count
                    })
            
            # 2. 특정 패턴의 급증
            for pattern_name, pattern in self.patterns.items():
                pattern_count = sum(1 for e in entries if pattern.search(e.get('message', '')))
                if pattern_count > 10:  # 임계값
                    anomalies[f'pattern_spike_{pattern_name}'].append({
                        'timestamp': time_bucket.isoformat(),
                        'count': pattern_count,
                        'pattern': pattern_name
                    })
            
            # 3. 서비스별 로그 볼륨 분석
            service_counts = Counter(e.get('service', 'unknown') for e in entries)
            for service, count in service_counts.items():
                if count > 100:  # 30분에 100개 이상 로그
                    anomalies['high_volume_service'].append({
                        'timestamp': time_bucket.isoformat(),
                        'service': service,
                        'count': count
                    })
        
        return dict(anomalies)
    
    def find_error_correlations(self) -> Dict[str, Any]:
        """에러 간의 상관관계 분석"""
        correlations = {
            'error_sequences': [],
            'common_error_patterns': [],
            'service_error_propagation': {}
        }
        
        # 에러 시퀀스 분석 (5분 내에 발생한 연관된 에러들)
        error_entries = [e for e in self.log_entries 
                        if self.patterns['error'].search(e.get('message', ''))]
        
        for i, error1 in enumerate(error_entries):
            try:
                timestamp1 = datetime.fromisoformat(error1['timestamp'].replace('T', ' '))
                
                related_errors = []
                for j, error2 in enumerate(error_entries[i+1:], i+1):
                    timestamp2 = datetime.fromisoformat(error2['timestamp'].replace('T', ' '))
                    
                    # 5분 이내 발생한 에러들
                    if (timestamp2 - timestamp1).total_seconds() <= 300:
                        related_errors.append({
                            'service': error2.get('service'),
                            'message': error2.get('message'),
                            'time_diff_seconds': (timestamp2 - timestamp1).total_seconds()
                        })
                
                if len(related_errors) >= 2:  # 2개 이상의 연관 에러
                    correlations['error_sequences'].append({
                        'trigger_error': {
                            'service': error1.get('service'),
                            'message': error1.get('message'),
                            'timestamp': error1.get('timestamp')
                        },
                        'related_errors': related_errors
                    })
            except:
                continue
        
        return correlations
    
    def generate_debug_report(self) -> str:
        """종합 디버깅 리포트 생성"""
        total_entries = len(self.log_entries)
        if total_entries == 0:
            return "분석할 로그 데이터가 없습니다."
        
        # 기본 통계
        level_counts = Counter(e.get('level', 'UNKNOWN') for e in self.log_entries)
        service_counts = Counter(e.get('service', 'unknown') for e in self.log_entries)
        
        # 이상 징후 감지
        anomalies = self.detect_anomalies()
        correlations = self.find_error_correlations()
        
        report = f"""
=== 로그 분석 디버깅 리포트 ===

📊 기본 통계:
- 총 로그 엔트리: {total_entries:,}개
- 로그 레벨 분포:
"""
        
        for level, count in level_counts.most_common():
            percentage = (count / total_entries) * 100
            report += f"  • {level}: {count:,}개 ({percentage:.1f}%)\n"
        
        report += f"\n🏢 서비스별 로그 분포:\n"
        for service, count in service_counts.most_common(10):
            percentage = (count / total_entries) * 100
            report += f"  • {service}: {count:,}개 ({percentage:.1f}%)\n"
        
        report += f"\n🚨 감지된 이상 징후:\n"
        if not anomalies:
            report += "  • 특별한 이상 징후 없음\n"
        else:
            for anomaly_type, incidents in anomalies.items():
                report += f"  • {anomaly_type}: {len(incidents)}건\n"
                for incident in incidents[:3]:  # 최대 3개만 표시
                    report += f"    - {incident}\n"
        
        report += f"\n🔗 에러 상관관계 분석:\n"
        error_sequences = correlations.get('error_sequences', [])
        if not error_sequences:
            report += "  • 명확한 에러 연쇄 패턴 없음\n"
        else:
            report += f"  • {len(error_sequences)}개의 에러 연쇄 패턴 발견\n"
            for seq in error_sequences[:3]:
                trigger = seq['trigger_error']
                report += f"    - {trigger['service']}: {trigger['message'][:50]}...\n"
                report += f"      → {len(seq['related_errors'])}개의 후속 에러 발생\n"
        
        # 권장 조치사항
        report += f"\n💡 권장 조치사항:\n"
        
        error_rate = level_counts.get('ERROR', 0) / total_entries
        if error_rate > 0.05:
            report += f"  • 높은 에러율({error_rate:.1%}) - 에러 로그 상세 분석 필요\n"
        
        if anomalies.get('high_error_rate'):
            report += f"  • 특정 시간대 에러 급증 - 해당 시간 배포/변경사항 확인\n"
        
        if error_sequences:
            report += f"  • 에러 연쇄 패턴 발견 - 서비스 간 의존성 및 타임아웃 설정 검토\n"
        
        return report

# 사용 예시 (시뮬레이션 데이터 생성)
def simulate_log_data():
    """시뮬레이션용 로그 데이터 생성"""
    log_analyzer = LogAnalyzer()
    
    # 샘플 로그 데이터
    sample_logs = [
        {"timestamp": "2024-08-03T19:30:15", "level": "INFO", "service": "user-service", 
         "message": "User login successful for user_id=12345"},
        {"timestamp": "2024-08-03T19:30:16", "level": "ERROR", "service": "payment-service", 
         "message": "Connection timeout to external payment API"},
        {"timestamp": "2024-08-03T19:30:17", "level": "ERROR", "service": "order-service", 
         "message": "Failed to create order: Payment service unavailable"},
        {"timestamp": "2024-08-03T19:30:18", "level": "WARN", "service": "inventory-service", 
         "message": "Low stock alert for product_id=67890"},
        {"timestamp": "2024-08-03T19:30:20", "level": "ERROR", "service": "notification-service", 
         "message": "Failed to send order confirmation: Order not found"}
    ] * 50  # 50번 반복하여 패턴 생성
    
    log_analyzer.log_entries = sample_logs
    
    # 디버깅 리포트 생성
    report = log_analyzer.generate_debug_report()
    print(report)

# simulate_log_data()
```

## 고급 로그 분석 기법

### 1. 실시간 로그 스트리밍 분석

```python
import asyncio
import aiofiles
from datetime import datetime, timedelta

class RealTimeLogAnalyzer:
    def __init__(self):
        self.alert_threshold = {
            'error_rate': 0.1,  # 10% 에러율
            'response_time': 2.0,  # 2초 응답시간
            'memory_usage': 0.8  # 80% 메모리 사용률
        }
        self.recent_entries = []
        self.max_recent_size = 1000
    
    async def monitor_log_stream(self, log_file_path: str):
        """실시간 로그 모니터링"""
        async with aiofiles.open(log_file_path, 'r') as f:
            # 파일 끝으로 이동
            await f.seek(0, 2)
            
            while True:
                line = await f.readline()
                if line:
                    await self._process_log_line(line.strip())
                else:
                    # 새로운 라인이 없으면 잠시 대기
                    await asyncio.sleep(0.1)
    
    async def _process_log_line(self, line: str):
        """로그 라인 실시간 처리"""
        try:
            # JSON 로그 파싱
            if line.startswith('{'):
                entry = json.loads(line)
                
                # 최근 엔트리 버퍼 관리
                self.recent_entries.append(entry)
                if len(self.recent_entries) > self.max_recent_size:
                    self.recent_entries.pop(0)
                
                # 실시간 알림 조건 확인
                await self._check_alert_conditions(entry)
        except Exception as e:
            print(f"로그 처리 오류: {e}")
    
    async def _check_alert_conditions(self, entry: Dict):
        """실시간 알림 조건 확인"""
        # 에러율 체크
        recent_errors = sum(1 for e in self.recent_entries[-100:] 
                          if e.get('level') == 'ERROR')
        error_rate = recent_errors / min(100, len(self.recent_entries))
        
        if error_rate > self.alert_threshold['error_rate']:
            await self._send_alert(f"높은 에러율 감지: {error_rate:.1%}")
        
        # 응답시간 체크
        if 'response_time' in entry:
            response_time = float(entry['response_time'])
            if response_time > self.alert_threshold['response_time']:
                await self._send_alert(
                    f"느린 응답시간: {response_time:.2f}s in {entry.get('service', 'unknown')}"
                )
    
    async def _send_alert(self, message: str):
        """알림 발송"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"🚨 [{timestamp}] ALERT: {message}")
        # 실제로는 Slack, 이메일, Webhook 등으로 알림 발송
```

### 2. 머신러닝 기반 이상 징후 감지

```python
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from typing import List, Dict, Tuple

class MLLogAnalyzer:
    def __init__(self):
        self.scaler = StandardScaler()
        self.anomaly_detector = IsolationForest(
            contamination=0.1,  # 10% 정도를 이상치로 가정
            random_state=42
        )
        self.is_trained = False
    
    def extract_features(self, log_entries: List[Dict]) -> np.ndarray:
        """로그 엔트리에서 특성 추출"""
        features = []
        
        for entry in log_entries:
            feature_vector = [
                # 시간 기반 특성
                datetime.fromisoformat(entry['timestamp'].replace('T', ' ')).hour,
                datetime.fromisoformat(entry['timestamp'].replace('T', ' ')).minute,
                
                # 로그 레벨 원핫 인코딩
                1 if entry.get('level') == 'ERROR' else 0,
                1 if entry.get('level') == 'WARN' else 0,
                1 if entry.get('level') == 'INFO' else 0,
                
                # 메시지 길이
                len(entry.get('message', '')),
                
                # 서비스별 원핫 인코딩 (주요 서비스만)
                1 if entry.get('service') == 'payment-service' else 0,
                1 if entry.get('service') == 'order-service' else 0,
                1 if entry.get('service') == 'user-service' else 0,
                
                # 응답시간 (있는 경우)
                float(entry.get('response_time', 0)),
                
                # 특정 키워드 존재 여부
                1 if 'timeout' in entry.get('message', '').lower() else 0,
                1 if 'connection' in entry.get('message', '').lower() else 0,
                1 if 'memory' in entry.get('message', '').lower() else 0,
            ]
            
            features.append(feature_vector)
        
        return np.array(features)
    
    def train_anomaly_detector(self, normal_logs: List[Dict]):
        """정상 로그로 이상 감지 모델 훈련"""
        features = self.extract_features(normal_logs)
        features_scaled = self.scaler.fit_transform(features)
        
        self.anomaly_detector.fit(features_scaled)
        self.is_trained = True
        
        print(f"이상 감지 모델 훈련 완료: {len(normal_logs)}개 샘플 사용")
    
    def detect_anomalies(self, log_entries: List[Dict]) -> List[Tuple[int, float]]:
        """이상 징후 감지"""
        if not self.is_trained:
            raise ValueError("모델이 훈련되지 않았습니다.")
        
        features = self.extract_features(log_entries)
        features_scaled = self.scaler.transform(features)
        
        # 이상치 예측 (-1: 이상치, 1: 정상)
        predictions = self.anomaly_detector.predict(features_scaled)
        
        # 이상치 점수 계산 (더 낮을수록 이상치)
        scores = self.anomaly_detector.score_samples(features_scaled)
        
        # 이상치로 분류된 인덱스와 점수 반환
        anomalies = [(i, scores[i]) for i, pred in enumerate(predictions) if pred == -1]
        
        return sorted(anomalies, key=lambda x: x[1])  # 점수 순으로 정렬

# 사용 예시
ml_analyzer = MLLogAnalyzer()

# 정상 로그로 훈련 (실제로는 과거 정상 기간의 로그 사용)
normal_logs = [
    {"timestamp": "2024-08-03T10:30:15", "level": "INFO", "service": "user-service", 
     "message": "User login successful", "response_time": "0.2"},
    {"timestamp": "2024-08-03T10:30:16", "level": "INFO", "service": "payment-service", 
     "message": "Payment processed", "response_time": "0.5"},
    # ... 더 많은 정상 로그
] * 100

ml_analyzer.train_anomaly_detector(normal_logs)

# 현재 로그에서 이상 징후 감지
current_logs = [
    {"timestamp": "2024-08-03T19:30:15", "level": "ERROR", "service": "payment-service", 
     "message": "Connection timeout to external payment API", "response_time": "5.0"},
    {"timestamp": "2024-08-03T19:30:16", "level": "INFO", "service": "user-service", 
     "message": "User login successful", "response_time": "0.3"},
]

anomalies = ml_analyzer.detect_anomalies(current_logs)
for index, score in anomalies:
    print(f"이상 로그 감지 (인덱스 {index}, 점수: {score:.3f}): {current_logs[index]}")
```

## 핵심 요점

### 1. 자동화된 로그 분석의 필요성

수만 줄의 로그를 사람이 읽을 수는 없다. 패턴 인식과 이상 징후 감지를 자동화해야 한다.

### 2. 실시간 모니터링과 알림

문제가 발생한 후 분석하는 것보다 실시간으로 감지하고 즉시 알림을 받는 것이 중요하다.

### 3. 머신러닝을 활용한 고도화

정상 패턴을 학습하여 예상치 못한 이상 징후를 자동으로 감지할 수 있다.

### 4. 상관관계 분석

단일 에러보다는 에러 간의 연관성과 전파 패턴을 분석하여 근본 원인을 찾아야 한다.

---

**이전**: [13.5c 스마트 디버깅 도구](05c-smart-debugging-tools.md)  
**다음**: [13.5 디버깅 기법 및 문제 해결](05-debugging-troubleshooting.md) 개요로 돌아갑니다.
