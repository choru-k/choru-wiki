---
tags:
  - Debugging
  - Troubleshooting
  - Problem Solving
  - Root Cause Analysis
  - Incident Management
---

# 13.5 디버깅 기법 및 문제 해결

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

### 1. OODA Loop 기반 디버깅

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

### 2. 분산 시스템 디버깅

분산 시스템에서는 **인과관계 추적**이 가장 중요하다.

```python
import asyncio
import aiohttp
from typing import Dict, List, Optional
import json
import traceback

class DistributedDebugger:
    def __init__(self):
        self.trace_contexts: Dict[str, Dict] = {}
        self.service_dependencies: Dict[str, List[str]] = {
            'frontend': ['user-service', 'order-service'],
            'order-service': ['payment-service', 'inventory-service'],
            'payment-service': ['external-payment-api'],
            'inventory-service': ['database']
        }
    
    async def debug_distributed_flow(self, trace_id: str, 
                                   failed_service: str) -> Dict[str, Any]:
        """분산 플로우 디버깅"""
        debug_info = {
            'trace_id': trace_id,
            'failed_service': failed_service,
            'cascade_analysis': {},
            'root_cause_candidates': [],
            'service_states': {},
            'recommendations': []
        }
        
        # 1. 실패한 서비스의 의존성 트리 분석
        dependency_chain = self._build_dependency_chain(failed_service)
        debug_info['dependency_chain'] = dependency_chain
        
        # 2. 각 서비스의 상태 확인
        for service in dependency_chain:
            try:
                state = await self._check_service_health(service, trace_id)
                debug_info['service_states'][service] = state
                
                # 잠재적 근본 원인 식별
                if not state.get('healthy', True):
                    debug_info['root_cause_candidates'].append({
                        'service': service,
                        'issues': state.get('issues', []),
                        'impact_score': self._calculate_impact_score(service, dependency_chain)
                    })
                    
            except Exception as e:
                debug_info['service_states'][service] = {
                    'healthy': False,
                    'error': str(e),
                    'issues': [f'서비스 접근 불가: {str(e)}']
                }
        
        # 3. 계단식 실패 분석
        debug_info['cascade_analysis'] = await self._analyze_cascade_failure(
            trace_id, dependency_chain
        )
        
        # 4. 수정 권장사항 생성
        debug_info['recommendations'] = self._generate_recommendations(debug_info)
        
        return debug_info
    
    def _build_dependency_chain(self, service: str) -> List[str]:
        """서비스 의존성 체인 구축"""
        visited = set()
        chain = []
        
        def dfs(current_service):
            if current_service in visited:
                return
            
            visited.add(current_service)
            chain.append(current_service)
            
            dependencies = self.service_dependencies.get(current_service, [])
            for dep in dependencies:
                dfs(dep)
        
        dfs(service)
        return chain
    
    async def _check_service_health(self, service: str, trace_id: str) -> Dict:
        """서비스 헬스 체크"""
        health_info = {
            'healthy': True,
            'response_time': 0,
            'issues': [],
            'metrics': {}
        }
        
        try:
            # 헬스 체크 엔드포인트 호출 (시뮬레이션)
            start_time = time.time()
            
            if service == 'database':
                # 데이터베이스 연결 테스트
                health_info['metrics'] = await self._check_database_health()
            elif service == 'external-payment-api':
                # 외부 API 호출 테스트
                health_info['metrics'] = await self._check_external_api_health()
            else:
                # 내부 마이크로서비스 체크
                health_info['metrics'] = await self._check_microservice_health(service)
            
            health_info['response_time'] = time.time() - start_time
            
            # 메트릭 기반 이슈 감지
            metrics = health_info['metrics']
            if metrics.get('error_rate', 0) > 0.05:
                health_info['issues'].append(f'높은 에러율: {metrics["error_rate"]:.2%}')
                health_info['healthy'] = False
            
            if metrics.get('response_time_p99', 0) > 1.0:
                health_info['issues'].append(f'느린 응답시간: P99 {metrics["response_time_p99"]:.2f}s')
            
            if metrics.get('cpu_usage', 0) > 0.8:
                health_info['issues'].append(f'높은 CPU 사용률: {metrics["cpu_usage"]:.1%}')
                
        except Exception as e:
            health_info['healthy'] = False
            health_info['issues'].append(f'헬스 체크 실패: {str(e)}')
        
        return health_info
    
    async def _check_database_health(self) -> Dict:
        """데이터베이스 헬스 체크"""
        # 시뮬레이션 데이터
        return {
            'connection_count': 45,
            'max_connections': 100,
            'deadlock_count': 12,
            'slow_query_count': 8,
            'error_rate': 0.02,
            'response_time_p99': 0.8
        }
    
    async def _check_external_api_health(self) -> Dict:
        """외부 API 헬스 체크"""
        return {
            'error_rate': 0.15,  # 15% 에러율 - 문제 있음
            'response_time_p99': 2.5,
            'timeout_count': 23,
            'rate_limit_hits': 5
        }
    
    async def _check_microservice_health(self, service: str) -> Dict:
        """마이크로서비스 헬스 체크"""
        # 서비스별 다른 상태 시뮬레이션
        if service == 'payment-service':
            return {
                'error_rate': 0.01,
                'response_time_p99': 0.3,
                'cpu_usage': 0.6,
                'memory_usage': 0.7,
                'queue_depth': 156  # 큐 적체
            }
        else:
            return {
                'error_rate': 0.005,
                'response_time_p99': 0.2,
                'cpu_usage': 0.4,
                'memory_usage': 0.5
            }
    
    def _calculate_impact_score(self, service: str, chain: List[str]) -> float:
        """서비스 영향도 점수 계산"""
        # 의존성 체인에서의 위치와 의존하는 서비스 수를 기반으로 점수 계산
        dependencies_count = len(self.service_dependencies.get(service, []))
        chain_position = chain.index(service) if service in chain else len(chain)
        
        # 상위 서비스일수록, 의존성이 많을수록 영향도가 큼
        return (dependencies_count * 0.3) + ((len(chain) - chain_position) * 0.7)
    
    async def _analyze_cascade_failure(self, trace_id: str, 
                                     chain: List[str]) -> Dict:
        """계단식 실패 분석"""
        cascade_info = {
            'failure_propagation': [],
            'blast_radius': 0,
            'critical_path': []
        }
        
        # 실패 전파 경로 추적
        failed_services = []
        for service in chain:
            service_state = await self._check_service_health(service, trace_id)
            if not service_state['healthy']:
                failed_services.append(service)
                
                # 이 서비스 실패가 다른 서비스에 미치는 영향 분석
                affected_services = [s for s, deps in self.service_dependencies.items() 
                                   if service in deps]
                
                cascade_info['failure_propagation'].append({
                    'failed_service': service,
                    'affected_services': affected_services,
                    'failure_reasons': service_state['issues']
                })
        
        cascade_info['blast_radius'] = len(failed_services)
        cascade_info['critical_path'] = failed_services
        
        return cascade_info
    
    def _generate_recommendations(self, debug_info: Dict) -> List[str]:
        """수정 권장사항 생성"""
        recommendations = []
        
        # 근본 원인 후보들을 영향도 순으로 정렬
        root_causes = sorted(debug_info['root_cause_candidates'], 
                           key=lambda x: x['impact_score'], reverse=True)
        
        for candidate in root_causes[:3]:  # 상위 3개
            service = candidate['service']
            issues = candidate['issues']
            
            for issue in issues:
                if '에러율' in issue:
                    recommendations.append(f"{service}: 에러율 개선을 위한 코드 리뷰 및 예외 처리 강화")
                elif '응답시간' in issue:
                    recommendations.append(f"{service}: 성능 최적화 및 캐싱 도입 검토")
                elif 'CPU' in issue:
                    recommendations.append(f"{service}: 리소스 스케일링 또는 로드 밸런싱 개선")
                elif '접근 불가' in issue:
                    recommendations.append(f"{service}: 서비스 재시작 및 헬스 체크 개선")
        
        # 일반적인 분산 시스템 권장사항
        if debug_info['cascade_analysis']['blast_radius'] > 2:
            recommendations.append("서킷 브레이커 패턴 도입으로 계단식 실패 방지")
            recommendations.append("서비스 간 의존성 감소 및 비동기 처리 도입")
        
        return recommendations

# 실전 사용 예시
async def debug_missing_orders():
    """사라진 주문 문제 디버깅"""
    debugger = DistributedDebugger()
    
    # 분산 플로우 디버깅 실행
    debug_result = await debugger.debug_distributed_flow(
        trace_id="order_issue_20240803_001",
        failed_service="order-service"
    )
    
    print("=== 분산 시스템 디버깅 결과 ===")
    print(f"추적 ID: {debug_result['trace_id']}")
    print(f"실패 서비스: {debug_result['failed_service']}")
    print(f"영향 범위: {debug_result['cascade_analysis']['blast_radius']}개 서비스")
    
    print("\n=== 근본 원인 후보 ===")
    for candidate in debug_result['root_cause_candidates']:
        print(f"- {candidate['service']} (영향도: {candidate['impact_score']:.1f})")
        for issue in candidate['issues']:
            print(f"  • {issue}")
    
    print("\n=== 권장 조치사항 ===")
    for i, rec in enumerate(debug_result['recommendations'], 1):
        print(f"{i}. {rec}")

# asyncio.run(debug_missing_orders())
```

### 3. 생산성 높은 디버깅 도구들

실전에서 자주 사용하는 디버깅 도구들을 활용해보자.

```python
import pdb
import sys
import inspect
from functools import wraps
from contextlib import contextmanager

class SmartDebugger:
    def __init__(self):
        self.debug_sessions: List[Dict] = []
        self.breakpoint_conditions: Dict[str, callable] = {}
    
    def conditional_breakpoint(self, condition_func: callable):
        """조건부 브레이크포인트 데코레이터"""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                # 조건 확인
                if condition_func(*args, **kwargs):
                    print(f"🔍 조건부 브레이크포인트 활성화: {func.__name__}")
                    print(f"인수: args={args}, kwargs={kwargs}")
                    
                    # 현재 스택 정보 출력
                    frame = sys._getframe(1)
                    print(f"호출 위치: {frame.f_code.co_filename}:{frame.f_lineno}")
                    
                    # 지역 변수 출력
                    local_vars = frame.f_locals
                    print("지역 변수:")
                    for name, value in local_vars.items():
                        if not name.startswith('_'):
                            print(f"  {name} = {repr(value)}")
                    
                    # 대화형 디버거 시작
                    pdb.set_trace()
                
                return func(*args, **kwargs)
            return wrapper
        return decorator
    
    def auto_debug_on_exception(self, exception_types: tuple = (Exception,)):
        """예외 발생 시 자동 디버깅 모드"""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                try:
                    return func(*args, **kwargs)
                except exception_types as e:
                    print(f"🚨 예외 발생으로 디버깅 모드 진입")
                    print(f"예외: {type(e).__name__}: {str(e)}")
                    print(f"함수: {func.__name__}")
                    
                    # 스택 트레이스 분석
                    import traceback
                    print("\n스택 트레이스:")
                    traceback.print_exc()
                    
                    # 예외 발생 지점의 변수 상태 출력
                    frame = sys._getframe()
                    self._print_frame_variables(frame)
                    
                    # 디버거 시작
                    pdb.post_mortem()
                    raise
            return wrapper
        return decorator
    
    def _print_frame_variables(self, frame):
        """프레임의 변수들 출력"""
        print("\n현재 프레임 변수들:")
        local_vars = frame.f_locals
        for name, value in local_vars.items():
            if not name.startswith('_') and name != 'self':
                try:
                    print(f"  {name} = {repr(value)[:100]}")
                except:
                    print(f"  {name} = <출력 불가능>")
    
    @contextmanager
    def debug_context(self, context_name: str):
        """디버깅 컨텍스트 매니저"""
        print(f"🔍 디버깅 컨텍스트 시작: {context_name}")
        start_time = time.time()
        
        try:
            yield
        except Exception as e:
            print(f"❌ 컨텍스트 '{context_name}'에서 예외 발생: {e}")
            raise
        finally:
            duration = time.time() - start_time
            print(f"✅ 디버깅 컨텍스트 종료: {context_name} (소요시간: {duration:.3f}초)")
    
    def trace_function_calls(self, target_module: str = None):
        """함수 호출 추적"""
        def trace_calls(frame, event, arg):
            if event == 'call':
                filename = frame.f_code.co_filename
                function_name = frame.f_code.co_name
                
                # 특정 모듈만 추적
                if target_module and target_module not in filename:
                    return
                
                # 내장 함수나 시스템 함수 제외
                if '<' in filename or 'site-packages' in filename:
                    return
                
                print(f"📞 함수 호출: {function_name} ({filename}:{frame.f_lineno})")
                
                # 인수 정보
                arg_info = inspect.getargvalues(frame)
                if arg_info.args:
                    args_str = ', '.join(f"{arg}={frame.f_locals.get(arg, '?')}" 
                                       for arg in arg_info.args[:3])  # 처음 3개만
                    print(f"   인수: {args_str}")
            
            return trace_calls
        
        return trace_calls

# 실전 사용 예시
smart_debugger = SmartDebugger()

# 1. 조건부 브레이크포인트
@smart_debugger.conditional_breakpoint(
    lambda user_id, amount: amount > 10000  # 1만원 이상 결제시만 디버깅
)
def process_payment(user_id: str, amount: float):
    """결제 처리 함수"""
    if amount <= 0:
        raise ValueError("결제 금액은 0보다 커야 합니다")
    
    # 결제 로직 (버그가 있는 코드)
    if amount > 5000 and user_id == "suspicious_user":
        raise Exception("의심스러운 사용자의 고액 결제")
    
    return {"transaction_id": f"tx_{int(time.time())}", "status": "completed"}

# 2. 예외 발생시 자동 디버깅
@smart_debugger.auto_debug_on_exception((ValueError, Exception))
def problematic_function(data: List[int]):
    """문제가 있는 함수"""
    result = []
    for i, value in enumerate(data):
        # 의도적 버그: 0으로 나누기
        processed = value / (i - 2)  # i=2일 때 ZeroDivisionError
        result.append(processed)
    return result

# 3. 디버깅 컨텍스트 사용
def complex_business_logic():
    """복잡한 비즈니스 로직"""
    with smart_debugger.debug_context("사용자 데이터 처리"):
        user_data = {"id": 123, "name": "John"}
        
        with smart_debugger.debug_context("결제 검증"):
            if user_data["id"] < 0:
                raise ValueError("잘못된 사용자 ID")
        
        with smart_debugger.debug_context("주문 생성"):
            order = {"user_id": user_data["id"], "items": []}
            # 주문 처리 로직...
    
    return order

# 테스트 실행
if __name__ == "__main__":
    try:
        # 조건부 브레이크포인트 테스트 (고액 결제)
        result = process_payment("suspicious_user", 15000)
        print(f"결제 성공: {result}")
    except Exception as e:
        print(f"결제 실패: {e}")
    
    try:
        # 예외 자동 디버깅 테스트
        test_data = [1, 2, 3, 4, 5]
        result = problematic_function(test_data)
    except Exception as e:
        print(f"함수 실행 실패: {e}")
```

### 4. 로그 기반 디버깅

효과적인 로그 분석을 통한 디버깅 기법을 살펴보자.

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

## 레슨 런

### 1. 체계적 접근법이 핵심이다

감에 의존하지 말고 **OODA Loop** 같은 프레임워크를 사용하여 체계적으로 문제를 해결하자.

### 2. 분산 시스템에서는 의존성 추적이 필수다

하나의 서비스 문제가 **전체 시스템**에 미치는 영향을 파악하는 것이 중요하다.

### 3. 조건부 디버깅으로 효율성을 높여라

모든 곳에 로그를 남기지 말고, **특정 조건**에서만 상세 디버깅을 활성화하자.

### 4. 로그 분석의 자동화가 필요하다

수만 줄의 로그를 사람이 읽을 수는 없다. **패턴 인식**과 **이상 징후 감지**를 자동화하자.

### 5. 사후 분석(Post-Mortem)을 체계화하라

문제가 해결된 후에도 **근본 원인 분석**과 **재발 방지책**을 문서화해야 한다.

---

**Chapter 13 Observability & Debugging이 완료되었습니다.** 이제 우리는 로깅부터 메트릭, 분산 추적, 성능 프로파일링, 그리고 체계적 디버깅까지 **완전한 관찰 가능성**을 구축할 수 있습니다.

다음 단계에서는 **Chapter 12 (Container & Kubernetes)** 또는 **Chapter 11 (Performance Optimization)** 중 어느 것을 진행할지 알려주세요.
