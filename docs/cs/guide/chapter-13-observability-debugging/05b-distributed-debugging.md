---
tags:
  - Debugging
  - Distributed Systems
  - Microservices
  - Service Dependencies
  - Cascade Failures
---

# 13.5b 분산 시스템 디버깅

## 인과관계 추적이 핵심이다

분산 시스템에서는 **인과관계 추적**이 가장 중요하다. 하나의 서비스 장애가 어떻게 전체 시스템에 파급되는지 이해하고 추적할 수 있어야 한다.

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

## 분산 시스템 디버깅 전략

### 1. 의존성 체인 분석

```python
# 서비스 의존성 그래프 구축
service_dependencies = {
    'frontend': ['user-service', 'order-service'],
    'order-service': ['payment-service', 'inventory-service'],
    'payment-service': ['external-payment-api'],
    'inventory-service': ['database']
}

# 영향도 점수 계산
def calculate_impact_score(service, chain):
    dependencies_count = len(service_dependencies.get(service, []))
    chain_position = chain.index(service) if service in chain else len(chain)
    return (dependencies_count * 0.3) + ((len(chain) - chain_position) * 0.7)
```

### 2. 계단식 실패 분석

실패가 어떻게 전파되는지 추적하여 **blast radius**(영향 범위)를 측정한다.

### 3. 근본 원인 우선순위화

- **영향도 점수**: 서비스의 의존성 수와 체인 위치
- **헬스 메트릭**: 에러율, 응답시간, 리소스 사용률
- **시간적 연관성**: 장애 발생 시점과의 상관관계

## 핵심 요점

### 1. 의존성 추적의 중요성

분산 시스템에서는 서비스 간 의존관계를 명확히 파악하고 추적하는 것이 필수다.

### 2. 계단식 실패 방지

서킷 브레이커, 타임아웃, 재시도 정책 등을 통해 장애 전파를 차단해야 한다.

### 3. 영향도 기반 우선순위

모든 문제를 동시에 해결할 수 없으므로 영향도가 큰 서비스부터 우선 처리한다.

---

**이전**: [13.5a 체계적 디버깅 프레임워크](05a-systematic-debugging-frameworks.md)  
**다음**: [13.5c 스마트 디버깅 도구](05c-smart-debugging-tools.md)에서 생산성 높은 디버깅 도구들을 학습합니다.
