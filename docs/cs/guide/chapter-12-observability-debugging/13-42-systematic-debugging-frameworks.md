---
tags:
  - deep-study
  - hands-on
  - incident-management
  - intermediate
  - ooda-loop
  - problem-solving
  - systematic-debugging
  - troubleshooting
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "6-10시간"
main_topic: "인프라스트럭처"
priority_score: 5
---

# 13.5a 체계적 디버깅 프레임워크

## 2024년 8월, 사라진 주문의 미스터리

2024년 8월 3일 금요일 오후 7시, 주말을 앞둔 평온한 오후였다. 갑자기 고객 서비스팀에서 연락이 왔다.

"개발팀! 고객들이 주문을 했는데 주문 내역이 보이지 않는다고 해요. 결제는 되었는데 주문이 사라졌어요!"

당황한 마음으로 시스템을 확인해보니:

- 결제 서비스: 정상 작동 ✅
- 주문 서비스: 정상 작동 ✅  
- 재고 서비스: 정상 작동 ✅
- 알림 서비스: 정상 작동 ✅

**모든 서비스가 정상인데 주문이 사라지고 있었다.**

로그를 뒤지고, 메트릭을 확인하고, 데이터베이스를 조사했지만 명확한 원인을 찾을 수 없었다. 문제는 **산발적**이었고, **재현도 어려웠다**.

그때 깨달았다. 우리에게 필요한 것은 **체계적인 디버깅 방법론**이었다.

## 체계적 문제 해결 프레임워크

### OODA Loop 기반 디버깅

군사 전략에서 사용하는 OODA Loop(Observe-Orient-Decide-Act)을 디버깅에 적용해보자.

```python
import time
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from datetime import datetime

class IncidentSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium" 
    HIGH = "high"
    CRITICAL = "critical"

class IncidentStatus(Enum):
    REPORTED = "reported"
    INVESTIGATING = "investigating"
    ROOT_CAUSE_FOUND = "root_cause_found"
    MITIGATING = "mitigating"
    RESOLVED = "resolved"
    CLOSED = "closed"

@dataclass
class Evidence:
    timestamp: datetime
    source: str
    data: Dict[str, Any]
    confidence: float  # 0.0 ~ 1.0
    description: str

@dataclass
class Hypothesis:
    id: str
    description: str
    confidence: float
    evidence_supporting: List[Evidence] = field(default_factory=list)
    evidence_contradicting: List[Evidence] = field(default_factory=list)
    tested: bool = False
    test_result: Optional[bool] = None

@dataclass
class Action:
    id: str
    description: str
    action_type: str  # investigate, mitigate, fix
    executed: bool = False
    result: Optional[str] = None
    execution_time: Optional[datetime] = None

class SystematicDebugger:
    def __init__(self, incident_description: str):
        self.incident_description = incident_description
        self.start_time = datetime.now()
        self.status = IncidentStatus.REPORTED
        self.severity = IncidentSeverity.MEDIUM
        
        # OODA Loop 컴포넌트들
        self.observations: List[Evidence] = []
        self.hypotheses: List[Hypothesis] = []
        self.actions_taken: List[Action] = []
        self.decisions_log: List[Dict] = []
        
        # 디버깅 컨텍스트
        self.affected_systems: List[str] = []
        self.timeline: List[Dict] = []
        self.root_cause: Optional[str] = None
        
        logging.info(f"새로운 사건 조사 시작: {incident_description}")
    
    def observe(self, evidence: Evidence):
        """관찰: 증거 수집"""
        self.observations.append(evidence)
        self.timeline.append({
            'timestamp': evidence.timestamp,
            'event_type': 'observation',
            'description': evidence.description,
            'source': evidence.source
        })
        
        logging.info(f"새로운 증거 수집: {evidence.description} (신뢰도: {evidence.confidence})")
    
    def orient(self) -> List[Hypothesis]:
        """방향설정: 가설 생성 및 우선순위 결정"""
        # 증거를 바탕으로 가설들을 생성/업데이트
        self._update_hypotheses()
        
        # 가설들을 신뢰도 순으로 정렬
        sorted_hypotheses = sorted(self.hypotheses, 
                                 key=lambda h: h.confidence, 
                                 reverse=True)
        
        self.decisions_log.append({
            'timestamp': datetime.now(),
            'decision_type': 'hypothesis_prioritization',
            'details': [{'hypothesis': h.description, 'confidence': h.confidence} 
                       for h in sorted_hypotheses[:3]]
        })
        
        return sorted_hypotheses
    
    def decide(self, top_hypothesis: Hypothesis) -> List[Action]:
        """결정: 다음 행동 결정"""
        if not top_hypothesis.tested:
            # 가설 검증 액션
            test_action = Action(
                id=f"test_hypothesis_{top_hypothesis.id}",
                description=f"가설 '{top_hypothesis.description}' 검증",
                action_type="investigate"
            )
            self.actions_taken.append(test_action)
            
        elif top_hypothesis.test_result:
            # 가설이 참이면 완화/수정 액션
            fix_action = Action(
                id=f"fix_{top_hypothesis.id}",
                description=f"근본 원인 '{top_hypothesis.description}' 해결",
                action_type="fix"
            )
            self.actions_taken.append(fix_action)
        
        self.decisions_log.append({
            'timestamp': datetime.now(),
            'decision_type': 'action_planning',
            'selected_hypothesis': top_hypothesis.description,
            'planned_actions': [a.description for a in self.actions_taken if not a.executed]
        })
        
        return [a for a in self.actions_taken if not a.executed]
    
    def act(self, action: Action, result: str):
        """행동: 액션 실행 및 결과 기록"""
        action.executed = True
        action.result = result
        action.execution_time = datetime.now()
        
        self.timeline.append({
            'timestamp': action.execution_time,
            'event_type': 'action',
            'description': action.description,
            'result': result
        })
        
        logging.info(f"액션 실행: {action.description} → {result}")
        
        # 가설 검증 결과 업데이트
        if action.action_type == "investigate":
            for hypothesis in self.hypotheses:
                if f"test_hypothesis_{hypothesis.id}" == action.id:
                    hypothesis.tested = True
                    hypothesis.test_result = "confirmed" in result.lower()
                    break
    
    def _update_hypotheses(self):
        """증거를 바탕으로 가설들 업데이트"""
        # 간단한 패턴 매칭으로 가설 생성 (실제로는 더 정교한 로직 필요)
        error_evidence = [e for e in self.observations if "error" in e.description.lower()]
        network_evidence = [e for e in self.observations if "network" in e.description.lower()]
        database_evidence = [e for e in self.observations if "database" in e.description.lower()]
        
        if error_evidence and not any(h.id == "application_bug" for h in self.hypotheses):
            self.hypotheses.append(Hypothesis(
                id="application_bug",
                description="애플리케이션 코드의 버그",
                confidence=0.7,
                evidence_supporting=error_evidence
            ))
        
        if network_evidence and not any(h.id == "network_issue" for h in self.hypotheses):
            self.hypotheses.append(Hypothesis(
                id="network_issue", 
                description="네트워크 연결 문제",
                confidence=0.6,
                evidence_supporting=network_evidence
            ))
        
        if database_evidence and not any(h.id == "database_issue" for h in self.hypotheses):
            self.hypotheses.append(Hypothesis(
                id="database_issue",
                description="데이터베이스 관련 문제",
                confidence=0.8,
                evidence_supporting=database_evidence
            ))
    
    def get_debug_report(self) -> Dict:
        """현재 디버깅 상황 리포트"""
        return {
            'incident': self.incident_description,
            'status': self.status.value,
            'severity': self.severity.value,
            'duration': str(datetime.now() - self.start_time),
            'observations_count': len(self.observations),
            'active_hypotheses': len([h for h in self.hypotheses if not h.tested]),
            'confirmed_hypotheses': len([h for h in self.hypotheses if h.test_result]),
            'actions_taken': len([a for a in self.actions_taken if a.executed]),
            'root_cause': self.root_cause,
            'timeline': self.timeline[-5:]  # 최근 5개 이벤트
        }

# 실전 디버깅 시나리오
debugger = SystematicDebugger("주문이 사라지는 문제")

# 1. Observe - 증거 수집
debugger.observe(Evidence(
    timestamp=datetime.now(),
    source="customer_service",
    data={"affected_orders": 23, "time_range": "14:00-19:00"},
    confidence=0.9,
    description="고객 서비스팀에서 보고된 주문 누락 사례 23건"
))

debugger.observe(Evidence(
    timestamp=datetime.now(),
    source="application_logs",
    data={"error_count": 0, "warning_count": 5},
    confidence=0.8,
    description="애플리케이션 로그에서 관련 에러 없음, 경고 5건"
))

debugger.observe(Evidence(
    timestamp=datetime.now(),
    source="database_logs",
    data={"deadlock_count": 12, "timeout_count": 8},
    confidence=0.9,
    description="데이터베이스에서 교착상태 12건, 타임아웃 8건 발생"
))

# 2. Orient - 가설 생성
top_hypotheses = debugger.orient()

# 3. Decide - 액션 결정  
if top_hypotheses:
    planned_actions = debugger.decide(top_hypotheses[0])
    
    # 4. Act - 액션 실행
    for action in planned_actions:
        if action.action_type == "investigate":
            # 가설 검증 시뮬레이션
            if "database" in action.description:
                debugger.act(action, "confirmed: 데이터베이스 트랜잭션 교착상태로 인한 주문 롤백")
                debugger.root_cause = "데이터베이스 트랜잭션 교착상태"
                debugger.status = IncidentStatus.ROOT_CAUSE_FOUND

print("=== 디버깅 리포트 ===")
report = debugger.get_debug_report()
for key, value in report.items():
    print(f"{key}: {value}")
```

## 핵심 요점

### 1. 체계적 접근법의 중요성

감에 의존하지 말고 OODA Loop 같은 프레임워크를 사용하여 체계적으로 문제를 해결하자.

### 2. 증거 기반 디버깅

모든 관찰과 가설을 명확히 기록하고, 신뢰도를 측정하여 우선순위를 결정한다.

### 3. 가설-검증 사이클

가설을 세우고 검증하는 과정을 반복하여 근본 원인에 점진적으로 접근한다.

---

**이전**: [13.4 성능 프로파일링](../12-31-performance-profiling.md)  
**다음**: [13.5b 분산 시스템 디버깅](12-43-distributed-debugging.md)에서 복잡한 분산 환경에서의 디버깅 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 6-10시간

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

`systematic-debugging`, `ooda-loop`, `problem-solving`, `incident-management`, `troubleshooting`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
