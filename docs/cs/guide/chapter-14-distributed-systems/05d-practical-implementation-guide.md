---
tags:
  - DistributedSystems
  - EventDriven
  - BestPractices
  - Architecture
  - Guide
---

# 14.5D 실무 적용과 성숙도 모델 - Event-Driven Architecture 도입 전략

## 💡 Event-Driven Architecture에서 배운 핵심 교훈

### 1. 동기 vs 비동기의 트레이드오프

```bash
🚀 비동기 이벤트 처리의 장점:
- 높은 처리량과 확장성
- 서비스 간 느슨한 결합
- 장애 격리와 내성
- 새로운 기능 추가 용이

⚠️ 비동기의 복잡성:
- 최종 일관성 (Eventual Consistency)
- 이벤트 순서 보장 어려움
- 디버깅과 추적의 복잡성
- 중복 처리 가능성
```

### 🔄 최종 일관성 처리 전략

```python
class EventualConsistencyHandler:
    """최종 일관성 처리를 위한 패턴들"""
    
    def __init__(self):
        self.compensation_handlers = {}
        self.retry_policies = {}
    
    def idempotent_handler_pattern(self):
        """멱등성 보장 패턴"""
        def process_user_creation(event):
            user_id = event['payload']['user_id']
            
            # 중복 처리 방지: 이벤트 ID 기반 중복 체크
            if self.is_already_processed(event['event_id']):
                print(f"⚠️  Event {event['event_id']} already processed, skipping")
                return
            
            try:
                # 사용자 생성 처리
                self.create_user_account(user_id, event['payload'])
                
                # 처리 완료 기록
                self.mark_as_processed(event['event_id'])
                print(f"✅ User {user_id} created successfully")
                
            except UserAlreadyExistsException:
                # 이미 존재하는 경우도 정상 처리 (멱등성)
                self.mark_as_processed(event['event_id'])
                print(f"✅ User {user_id} already exists, marked as processed")
    
    def saga_pattern_compensation(self):
        """Saga 패턴: 보상 트랜잭션"""
        
        # 주문 처리 사가 (Order Processing Saga)
        saga_steps = [
            ('reserve_inventory', 'release_inventory'),
            ('charge_payment', 'refund_payment'),
            ('create_shipment', 'cancel_shipment'),
            ('send_confirmation', 'send_cancellation')
        ]
        
        def execute_saga(order_data):
            completed_steps = []
            
            try:
                for step, compensation in saga_steps:
                    print(f"🔄 Executing: {step}")
                    self.execute_step(step, order_data)
                    completed_steps.append((step, compensation))
                    
                print("✅ Saga completed successfully")
                
            except Exception as e:
                print(f"❌ Saga failed at {step}: {e}")
                
                # 보상 트랜잭션 실행 (역순)
                for step, compensation in reversed(completed_steps):
                    try:
                        print(f"↩️  Compensating: {compensation}")
                        self.execute_step(compensation, order_data)
                    except Exception as comp_error:
                        print(f"💥 Compensation failed for {compensation}: {comp_error}")
                        # 수동 개입 필요
                        self.send_manual_intervention_alert(step, compensation, comp_error)
    
    def circuit_breaker_pattern(self):
        """Circuit Breaker 패턴: 장애 전파 방지"""
        
        class CircuitBreaker:
            def __init__(self, failure_threshold=5, timeout=60):
                self.failure_count = 0
                self.failure_threshold = failure_threshold
                self.timeout = timeout
                self.last_failure_time = None
                self.state = 'CLOSED'  # CLOSED, OPEN, HALF_OPEN
            
            def call(self, func, *args, **kwargs):
                if self.state == 'OPEN':
                    if time.time() - self.last_failure_time > self.timeout:
                        self.state = 'HALF_OPEN'
                        print("🔄 Circuit breaker: HALF_OPEN")
                    else:
                        raise Exception("Circuit breaker is OPEN")
                
                try:
                    result = func(*args, **kwargs)
                    
                    if self.state == 'HALF_OPEN':
                        self.state = 'CLOSED'
                        self.failure_count = 0
                        print("✅ Circuit breaker: CLOSED (recovered)")
                    
                    return result
                    
                except Exception as e:
                    self.failure_count += 1
                    self.last_failure_time = time.time()
                    
                    if self.failure_count >= self.failure_threshold:
                        self.state = 'OPEN'
                        print(f"⚡ Circuit breaker: OPEN (failures: {self.failure_count})")
                    
                    raise e
        
        # 외부 서비스 호출 시 Circuit Breaker 사용
        recommendation_breaker = CircuitBreaker(failure_threshold=3, timeout=30)
        
        def call_recommendation_service(user_id):
            return recommendation_breaker.call(
                self.external_recommendation_api, 
                user_id
            )
```

### 2. Message Queue vs Event Streaming 선택

```bash
📮 Message Queue (RabbitMQ):
✅ 적합한 경우: 작업 큐, 트랜잭션 처리, 순서 보장 필요
✅ 장점: 메시지 보장, 라우팅 유연성, 백프레셔 처리
❌ 단점: 메시지 소모 후 사라짐, 재처리 어려움

🌊 Event Streaming (Kafka):  
✅ 적합한 경우: 실시간 분석, 이벤트 소싱, 다중 소비자
✅ 장점: 이벤트 보존, 재처리 가능, 높은 처리량
❌ 단점: 복잡한 설정, 저장소 용량 필요
```

### 🎯 기술 선택 의사결정 트리

```python
class TechnologyDecisionTree:
    """기술 선택을 위한 의사결정 가이드"""
    
    def choose_messaging_technology(self, requirements):
        """메시징 기술 선택 가이드"""
        
        decision_tree = {
            'questions': [
                {
                    'question': '이벤트 재처리가 필요한가?',
                    'yes': 'kafka',
                    'no': 'continue_to_q2'
                },
                {
                    'question': '실시간 스트림 분석이 필요한가?', 
                    'yes': 'kafka',
                    'no': 'continue_to_q3'
                },
                {
                    'question': '여러 소비자가 같은 이벤트를 독립 처리해야 하는가?',
                    'yes': 'kafka', 
                    'no': 'continue_to_q4'
                },
                {
                    'question': '복잡한 라우팅이 필요한가?',
                    'yes': 'rabbitmq',
                    'no': 'continue_to_q5'
                },
                {
                    'question': '메시지 순서가 중요한가?',
                    'yes': 'rabbitmq_single_consumer',
                    'no': 'rabbitmq'
                }
            ]
        }
        
        recommendations = {
            'kafka': {
                'technology': 'Apache Kafka',
                'use_cases': ['이벤트 소싱', '실시간 분석', 'CDC', '로그 수집'],
                'pros': ['높은 처리량', '이벤트 보존', '수평 확장'],
                'cons': ['복잡한 운영', '높은 리소스 사용']
            },
            'rabbitmq': {
                'technology': 'RabbitMQ',
                'use_cases': ['작업 큐', '마이크로서비스 통신', 'RPC'],
                'pros': ['유연한 라우팅', '메시지 보장', '쉬운 설정'],
                'cons': ['메시지 소모', '제한된 처리량']
            }
        }
        
        print("🤔 기술 선택 가이드:")
        for req, value in requirements.items():
            print(f"  - {req}: {value}")
        
        # 간단한 선택 로직 (실제로는 더 복잡한 알고리즘 필요)
        if requirements.get('event_replay', False) or requirements.get('stream_analytics', False):
            choice = 'kafka'
        elif requirements.get('complex_routing', False):
            choice = 'rabbitmq'
        else:
            choice = 'rabbitmq'  # 기본 선택
        
        recommendation = recommendations[choice]
        print(f"\n💡 추천: {recommendation['technology']}")
        print(f"적합한 사용 사례: {', '.join(recommendation['use_cases'])}")
        print(f"장점: {', '.join(recommendation['pros'])}")
        print(f"단점: {', '.join(recommendation['cons'])}")
        
        return choice

# 사용 예시
decision_tree = TechnologyDecisionTree()

# 요구사항 예시 1: 전자상거래 주문 처리
ecommerce_requirements = {
    'event_replay': True,           # 주문 이벤트 재처리 필요
    'stream_analytics': True,       # 실시간 주문 분석
    'multiple_consumers': True,     # 재고, 결제, 배송 서비스가 각각 처리
    'complex_routing': False,
    'message_ordering': False
}

print("=== 전자상거래 주문 처리 시스템 ===")
decision_tree.choose_messaging_technology(ecommerce_requirements)

# 요구사항 예시 2: 이메일 발송 시스템
email_requirements = {
    'event_replay': False,          # 재처리 불필요
    'stream_analytics': False,      # 분석 불필요
    'multiple_consumers': False,    # 단일 이메일 서비스
    'complex_routing': True,        # 이메일 타입별 라우팅
    'message_ordering': False
}

print("\n=== 이메일 발송 시스템 ===")
decision_tree.choose_messaging_technology(email_requirements)
```

### 3. Event Sourcing의 강력함과 복잡성

```bash
💪 Event Sourcing 장점:
- 완전한 감사 추적
- 시점별 상태 복원 가능
- 비즈니스 로직의 명확한 표현
- 확장 가능한 읽기 모델

⚠️ Event Sourcing 도전과제:
- 이벤트 스키마 진화
- 스냅샷 관리
- 쿼리의 복잡성
- 개발자 학습 곡선
```

### 📊 Event Sourcing 적용 가이드라인

```python
class EventSourcingGuidelines:
    """Event Sourcing 적용 가이드라인"""
    
    def when_to_use_event_sourcing(self):
        """Event Sourcing 사용 적합성 평가"""
        
        criteria = {
            'audit_requirements': {
                'weight': 9,  # 1-10 중요도
                'description': '완전한 감사 추적이 필요한가?',
                'examples': ['금융 거래', '의료 기록', '법적 문서']
            },
            'time_travel_queries': {
                'weight': 8,
                'description': '과거 시점의 상태 조회가 필요한가?',
                'examples': ['과거 잔고 조회', '이력 분석', '규정 준수']
            },
            'business_event_focus': {
                'weight': 7, 
                'description': '비즈니스 이벤트가 도메인의 핵심인가?',
                'examples': ['주문 처리', '게임 진행', '워크플로우']
            },
            'complex_state_transitions': {
                'weight': 6,
                'description': '복잡한 상태 변경 로직이 있는가?',
                'examples': ['상태 기계', '승인 프로세스', '계산 엔진']
            }
        }
        
        red_flags = {
            'simple_crud': {
                'weight': -8,
                'description': '단순한 CRUD 조작만 있는가?',
                'examples': ['사용자 프로필', '설정 관리']
            },
            'performance_critical': {
                'weight': -7,
                'description': '극도로 빠른 읽기 성능이 필요한가?',
                'examples': ['실시간 대시보드', '고빈도 거래']
            },
            'team_expertise': {
                'weight': -6,
                'description': '팀의 Event Sourcing 경험이 부족한가?',
                'examples': ['신규 팀', '단기 프로젝트']
            }
        }
        
        print("🎯 Event Sourcing 적용 평가:")
        
        total_score = 0
        for key, criterion in criteria.items():
            print(f"✅ {criterion['description']} (가중치: {criterion['weight']})")
            print(f"   예시: {', '.join(criterion['examples'])}")
            total_score += criterion['weight']
        
        print(f"\n⚠️  주의사항:")
        for key, flag in red_flags.items():
            print(f"❌ {flag['description']} (가중치: {flag['weight']})")
            print(f"   예시: {', '.join(flag['examples'])}")
        
        print(f"\n📊 평가 가이드:")
        print("- 70+ 점: Event Sourcing 강력 추천")
        print("- 40-69 점: 신중한 검토 후 적용")
        print("- 40 미만: 전통적인 접근 방식 권장")
    
    def event_schema_evolution_strategy(self):
        """이벤트 스키마 진화 전략"""
        
        strategies = {
            'additive_changes': {
                'description': '필드 추가 (하위 호환성 유지)',
                'example': '''
                # V1 이벤트
                {
                  "event_type": "UserCreated",
                  "user_id": "123",
                  "email": "user@example.com"
                }
                
                # V2 이벤트 (필드 추가)
                {
                  "event_type": "UserCreated",
                  "user_id": "123", 
                  "email": "user@example.com",
                  "phone": "+1-555-0123"  # 새 필드
                }
                ''',
                'implementation': '''
                def handle_user_created(event):
                    # 기존 필드
                    user_id = event['user_id']
                    email = event['email']
                    
                    # 새 필드 (기본값 처리)
                    phone = event.get('phone', None)
                '''
            },
            'event_versioning': {
                'description': '이벤트 버전 관리',
                'example': '''
                # 버전 정보 포함
                {
                  "event_type": "UserCreated",
                  "event_version": "2.0",
                  "user_id": "123",
                  "profile": {
                    "email": "user@example.com",
                    "phone": "+1-555-0123"
                  }
                }
                ''',
                'implementation': '''
                def handle_user_created(event):
                    version = event.get('event_version', '1.0')
                    
                    if version.startswith('1.'):
                        # V1 처리 로직
                        return self._handle_v1_user_created(event)
                    elif version.startswith('2.'):
                        # V2 처리 로직
                        return self._handle_v2_user_created(event)
                '''
            },
            'event_upcasting': {
                'description': '구 이벤트를 신 형식으로 변환',
                'implementation': '''
                class EventUpcaster:
                    def upcast_event(self, event):
                        event_type = event['event_type']
                        version = event.get('event_version', '1.0')
                        
                        if event_type == 'UserCreated' and version == '1.0':
                            # V1 → V2 변환
                            return {
                                **event,
                                'event_version': '2.0',
                                'profile': {
                                    'email': event['email'],
                                    'phone': None
                                }
                            }
                        
                        return event
                '''
            }
        }
        
        print("🔄 이벤트 스키마 진화 전략:")
        for strategy_name, strategy in strategies.items():
            print(f"\n📋 {strategy_name.replace('_', ' ').title()}")
            print(f"설명: {strategy['description']}")
            if 'example' in strategy:
                print(f"예시:{strategy['example']}")
            if 'implementation' in strategy:
                print(f"구현:{strategy['implementation']}")

# 가이드라인 실행
guidelines = EventSourcingGuidelines()
guidelines.when_to_use_event_sourcing()
print("\n" + "="*50 + "\n")
guidelines.event_schema_evolution_strategy()
```

### 4. 실무 적용 가이드라인

```python
# 언제 Event-Driven을 사용할까?
✅ 사용하기 좋은 경우:
- 마이크로서비스 간 통신
- 실시간 알림 시스템
- 데이터 파이프라인
- 감사와 로깅
- 비즈니스 이벤트 추적

❌ 피해야 할 경우:
- 단순한 CRUD 애플리케이션
- 강한 일관성이 필수인 시스템
- 실시간 응답이 중요한 인터페이스
- 팀의 기술 역량이 부족한 경우
```

## 🎯 Event-Driven Architecture 성숙도 모델

### Level 1: Event Notification

```bash
📢 기본 레벨: 단순 이벤트 알림
특징:
- 서비스 간 상태 변경 알림
- 동기 호출 대신 비동기 이벤트
- 기본적인 디커플링

예시:
UserService → UserCreated 이벤트 → EmailService가 환영 이메일 발송
```

```python
class Level1EventNotification:
    """Level 1: 기본 이벤트 알림"""
    
    def __init__(self, event_bus):
        self.event_bus = event_bus
    
    def create_user(self, user_data):
        # 1. 사용자 생성
        user_id = self._save_user_to_database(user_data)
        
        # 2. 이벤트 발행 (최소한의 정보)
        self.event_bus.publish('UserCreated', {
            'user_id': user_id,
            'email': user_data['email']
        })
        
        return user_id
    
    def handle_user_created(self, event):
        """다른 서비스에서 이벤트 처리"""
        user_id = event['user_id']
        email = event['email']
        
        # 추가 데이터가 필요하면 API 호출
        user_details = self._fetch_user_details(user_id)
        self._send_welcome_email(email, user_details)
```

### Level 2: Event-Carried State Transfer

```bash
📦 중급 레벨: 이벤트에 상태 정보 포함
특징:
- 이벤트에 필요한 모든 데이터 포함
- 수신 서비스가 외부 호출 없이 처리 가능
- 네트워크 트래픽 감소

예시:
OrderCreated 이벤트에 사용자 정보, 상품 정보 모두 포함
```

```python
class Level2EventCarriedStateTransfer:
    """Level 2: 이벤트에 상태 정보 포함"""
    
    def create_order(self, order_data):
        # 1. 주문 생성
        order_id = self._save_order(order_data)
        
        # 2. 풍부한 이벤트 발행 (모든 필요 정보 포함)
        self.event_bus.publish('OrderCreated', {
            'order_id': order_id,
            'customer': {
                'id': order_data['customer_id'],
                'name': order_data['customer_name'],
                'email': order_data['customer_email'],
                'address': order_data['shipping_address']
            },
            'items': [
                {
                    'product_id': item['product_id'],
                    'product_name': item['product_name'],
                    'quantity': item['quantity'],
                    'price': item['price']
                } for item in order_data['items']
            ],
            'total_amount': order_data['total_amount'],
            'payment_method': order_data['payment_method']
        })
        
        return order_id
    
    def handle_order_created(self, event):
        """배송 서비스에서 이벤트 처리 - 외부 API 호출 불필요"""
        order_id = event['order_id']
        customer = event['customer']
        items = event['items']
        
        # 모든 필요한 정보가 이벤트에 포함되어 있음
        self._create_shipment(order_id, customer['address'], items)
        self._send_tracking_email(customer['email'], order_id)
```

### Level 3: Event Sourcing

```bash
🗄️ 고급 레벨: 이벤트가 유일한 진실의 원천
특징:
- 모든 상태 변경을 이벤트로 저장
- 언제든 과거 상태 복원 가능
- 완벽한 감사 추적

예시:
AccountCreated, MoneyDeposited, MoneyWithdrawn 이벤트로 계좌 잔고 관리
```

```python
class Level3EventSourcing:
    """Level 3: Event Sourcing 완전 구현"""
    
    def __init__(self, event_store):
        self.event_store = event_store
    
    def transfer_money(self, from_account, to_account, amount):
        """계좌 이체 (Event Sourcing)"""
        
        # 1. 현재 계좌 상태 조회 (이벤트로부터 재구성)
        from_acc = self._rebuild_account_from_events(from_account)
        to_acc = self._rebuild_account_from_events(to_account)
        
        # 2. 비즈니스 로직 검증
        if from_acc.balance < amount:
            raise InsufficientFundsError()
        
        # 3. 이벤트 생성 및 저장
        events = [
            DomainEvent(
                aggregate_id=from_account,
                event_type='MoneyWithdrawn',
                event_data={'amount': amount, 'reason': f'Transfer to {to_account}'}
            ),
            DomainEvent(
                aggregate_id=to_account,
                event_type='MoneyDeposited', 
                event_data={'amount': amount, 'reason': f'Transfer from {from_account}'}
            )
        ]
        
        self.event_store.save_events(events)
        
        return events
    
    def _rebuild_account_from_events(self, account_id):
        """이벤트로부터 계좌 상태 재구성"""
        events = self.event_store.get_events(account_id)
        
        account = BankAccount(account_id)
        for event in events:
            account.apply_event(event)
        
        return account
    
    def get_balance_at_time(self, account_id, target_time):
        """특정 시점의 잔고 조회"""
        events = self.event_store.get_events_until(account_id, target_time)
        
        account = BankAccount(account_id)
        for event in events:
            account.apply_event(event)
        
        return account.balance
```

## 🚀 실전 도입 전략

### 📈 단계별 도입 로드맵

```python
class EventDrivenAdoptionRoadmap:
    """Event-Driven Architecture 단계별 도입 전략"""
    
    def phase_1_foundation(self):
        """1단계: 기반 구축 (3-6개월)"""
        
        tasks = [
            "✅ 팀 교육 및 개념 정립",
            "✅ 메시징 인프라 선택 (RabbitMQ vs Kafka)",
            "✅ 개발/테스트 환경 구축",
            "✅ 기본 이벤트 버스 구현",
            "✅ 모니터링 및 로깅 설정",
            "✅ 파일럿 프로젝트 선정"
        ]
        
        success_criteria = {
            'technical': [
                '안정적인 메시지 전달 (99.9% 가용성)',
                '기본 이벤트 발행/구독 동작',
                '개발자 도구 및 대시보드 구축'
            ],
            'team': [
                '핵심 개발자 3명 이상 Event-Driven 패턴 숙지',
                '코드 리뷰 및 베스트 프랙티스 수립',
                '문서화 및 가이드라인 완성'
            ]
        }
        
        print("🚀 1단계: 기반 구축")
        print("주요 작업:")
        for task in tasks:
            print(f"  {task}")
        
        print(f"\n성공 기준:")
        for category, criteria in success_criteria.items():
            print(f"  {category.title()}:")
            for criterion in criteria:
                print(f"    - {criterion}")
    
    def phase_2_pilot_implementation(self):
        """2단계: 파일럿 구현 (6-9개월)"""
        
        pilot_candidates = {
            'notification_service': {
                'complexity': 'Low',
                'risk': 'Low', 
                'business_impact': 'Medium',
                'description': '사용자 알림 발송 서비스'
            },
            'audit_logging': {
                'complexity': 'Low',
                'risk': 'Low',
                'business_impact': 'Low',
                'description': '시스템 감사 로그 수집'
            },
            'recommendation_engine': {
                'complexity': 'Medium',
                'risk': 'Medium',
                'business_impact': 'High',
                'description': '실시간 추천 시스템'
            },
            'order_processing': {
                'complexity': 'High',
                'risk': 'High',
                'business_impact': 'High',
                'description': '주문 처리 워크플로우'
            }
        }
        
        print("🎯 2단계: 파일럿 구현")
        print("파일럿 후보 서비스:")
        
        for service, details in pilot_candidates.items():
            print(f"\n📋 {service.replace('_', ' ').title()}")
            print(f"   복잡성: {details['complexity']}")
            print(f"   위험도: {details['risk']}")
            print(f"   비즈니스 영향: {details['business_impact']}")
            print(f"   설명: {details['description']}")
        
        print(f"\n💡 추천 순서: notification_service → audit_logging → recommendation_engine")
    
    def phase_3_scaling_out(self):
        """3단계: 확산 (9-18개월)"""
        
        scaling_strategies = {
            'horizontal_scaling': {
                'description': '더 많은 서비스에 패턴 적용',
                'activities': [
                    '성공한 패턴을 다른 서비스로 확장',
                    '팀 간 지식 공유 세션',
                    '표준 라이브러리 및 템플릿 개발'
                ]
            },
            'advanced_patterns': {
                'description': '고급 패턴 도입',
                'activities': [
                    'Event Sourcing 적용 (적절한 도메인)',
                    'CQRS 패턴 구현',
                    'Saga 패턴으로 분산 트랜잭션 관리'
                ]
            },
            'operational_excellence': {
                'description': '운영 성숙도 향상',
                'activities': [
                    '분산 추적 및 디버깅 도구',
                    '자동화된 이벤트 스키마 관리',
                    '성능 모니터링 및 알람'
                ]
            }
        }
        
        print("📈 3단계: 확산")
        for strategy, details in scaling_strategies.items():
            print(f"\n🎯 {strategy.replace('_', ' ').title()}")
            print(f"   {details['description']}")
            for activity in details['activities']:
                print(f"   - {activity}")

# 로드맵 실행
roadmap = EventDrivenAdoptionRoadmap()
roadmap.phase_1_foundation()
print("\n" + "="*50)
roadmap.phase_2_pilot_implementation()
print("\n" + "="*50)
roadmap.phase_3_scaling_out()
```

### ⚠️ 일반적인 함정과 해결책

```python
class CommonPitfallsAndSolutions:
    """일반적인 함정과 해결책"""
    
    def pitfall_1_event_storms(self):
        """함정 1: 이벤트 폭풍 (Event Storm)"""
        
        problem = """
        📢 문제: 하나의 이벤트가 연쇄적으로 다른 이벤트들을 발생시켜 시스템 부하
        
        예시:
        UserCreated → ProfileCreated → WelcomeEmailSent → EmailDelivered → 
        UserEngagementTracked → RecommendationUpdated → ...
        """
        
        solutions = {
            'rate_limiting': '''
            # 해결책 1: 속도 제한
            class RateLimitedEventPublisher:
                def __init__(self, max_events_per_second=100):
                    self.rate_limiter = TokenBucket(max_events_per_second)
                
                def publish(self, event):
                    if self.rate_limiter.consume():
                        self._actual_publish(event)
                    else:
                        self._queue_for_later(event)
            ''',
            'event_batching': '''
            # 해결책 2: 이벤트 배치 처리
            class BatchEventProcessor:
                def __init__(self, batch_size=50, batch_timeout=5):
                    self.batch = []
                    self.batch_size = batch_size
                    self.batch_timeout = batch_timeout
                
                def add_event(self, event):
                    self.batch.append(event)
                    
                    if len(self.batch) >= self.batch_size:
                        self.process_batch()
            ''',
            'circuit_breaking': '''
            # 해결책 3: 이벤트 체인 차단
            def handle_user_created(event):
                # 무한 루프 방지
                if event.get('depth', 0) > 5:
                    logger.warning("Event depth limit exceeded")
                    return
                
                # 처리 후 depth 증가
                next_event = create_profile_event(event)
                next_event['depth'] = event.get('depth', 0) + 1
                event_bus.publish(next_event)
            '''
        }
        
        print("⚡ 함정 1: 이벤트 폭풍")
        print(problem)
        
        for solution_name, solution_code in solutions.items():
            print(f"\n💡 {solution_name.replace('_', ' ').title()}:")
            print(solution_code)
    
    def pitfall_2_message_ordering(self):
        """함정 2: 메시지 순서 문제"""
        
        problem = """
        📦 문제: 이벤트가 발생 순서와 다르게 처리되어 데이터 불일치 발생
        
        예시:
        1. UserCreated (age: 25) 
        2. UserUpdated (age: 26)
        
        처리 순서: 2 → 1 (결과: age = 25, 잘못된 상태)
        """
        
        solutions = {
            'message_keys': '''
            # 해결책 1: 메시지 키 사용 (Kafka 파티셔닝)
            def publish_user_event(event):
                user_id = event['user_id']
                
                # 같은 user_id는 같은 파티션으로
                kafka_producer.send(
                    topic='user_events',
                    key=user_id,  # 키 기반 파티셔닝
                    value=event
                )
            ''',
            'version_vectors': '''
            # 해결책 2: 버전 벡터 사용
            class VersionedEvent:
                def __init__(self, event_data, version):
                    self.data = event_data
                    self.version = version
                
                def is_newer_than(self, other_version):
                    return self.version > other_version
            
            def handle_user_update(event):
                current_version = get_user_version(event['user_id'])
                
                if event.version <= current_version:
                    print("Ignoring outdated event")
                    return
                
                apply_user_update(event)
            ''',
            'idempotent_operations': '''
            # 해결책 3: 멱등적 연산 설계
            def update_user_balance(user_id, operation, amount, operation_id):
                # 이미 처리된 연산인지 확인
                if is_operation_processed(operation_id):
                    return get_current_balance(user_id)
                
                if operation == 'SET':
                    # 절대값 설정 (순서 무관)
                    set_balance(user_id, amount)
                elif operation == 'ADD':
                    # 상대값 변경 (중복 방지 필요)
                    add_to_balance(user_id, amount)
                
                mark_operation_processed(operation_id)
            '''
        }
        
        print("🔄 함정 2: 메시지 순서 문제")
        print(problem)
        
        for solution_name, solution_code in solutions.items():
            print(f"\n💡 {solution_name.replace('_', ' ').title()}:")
            print(solution_code)
    
    def pitfall_3_debugging_complexity(self):
        """함정 3: 디버깅 복잡성"""
        
        problem = """
        🔍 문제: 비동기 이벤트 체인으로 인한 디버깅 어려움
        
        예시:
        사용자 불만: "주문했는데 이메일이 안 왔어요"
        → 어느 서비스에서 실패했는지 추적 어려움
        """
        
        solutions = {
            'correlation_ids': '''
            # 해결책 1: 상관관계 ID 추적
            class CorrelationTracker:
                def __init__(self):
                    self.current_correlation_id = None
                
                def start_trace(self, correlation_id=None):
                    self.current_correlation_id = correlation_id or str(uuid.uuid4())
                    return self.current_correlation_id
                
                def publish_event(self, event_type, payload):
                    event = {
                        'event_type': event_type,
                        'payload': payload,
                        'correlation_id': self.current_correlation_id,
                        'timestamp': time.time()
                    }
                    
                    logger.info(f"Publishing event {event_type} with correlation_id {self.current_correlation_id}")
                    event_bus.publish(event)
            ''',
            'distributed_tracing': '''
            # 해결책 2: 분산 추적 (OpenTelemetry)
            from opentelemetry import trace
            from opentelemetry.exporter.jaeger.thrift import JaegerExporter
            
            tracer = trace.get_tracer(__name__)
            
            def handle_order_created(event):
                # 상위 트레이스 컨텍스트 복원
                parent_context = extract_trace_context(event)
                
                with tracer.start_as_current_span(
                    "process_order_created", 
                    context=parent_context
                ) as span:
                    span.set_attribute("order_id", event['order_id'])
                    
                    # 비즈니스 로직 실행
                    process_order(event)
                    
                    # 다음 이벤트에 트레이스 컨텍스트 전파
                    next_event = create_payment_event(event)
                    inject_trace_context(next_event)
                    event_bus.publish(next_event)
            ''',
            'event_flow_visualization': '''
            # 해결책 3: 이벤트 플로우 시각화
            class EventFlowTracker:
                def __init__(self):
                    self.event_flows = {}  # correlation_id -> [events]
                
                def track_event(self, event):
                    correlation_id = event.get('correlation_id')
                    if correlation_id:
                        if correlation_id not in self.event_flows:
                            self.event_flows[correlation_id] = []
                        
                        self.event_flows[correlation_id].append({
                            'event_type': event['event_type'],
                            'service': os.environ.get('SERVICE_NAME'),
                            'timestamp': event['timestamp'],
                            'status': 'processed'
                        })
                
                def get_flow_diagram(self, correlation_id):
                    events = self.event_flows.get(correlation_id, [])
                    
                    # Mermaid 다이어그램 생성
                    diagram = "graph TD\\n"
                    for i, event in enumerate(events):
                        diagram += f"  {i}[{event['event_type']}] --> "
                    
                    return diagram.rstrip(" --> ")
            '''
        }
        
        print("🐛 함정 3: 디버깅 복잡성")
        print(problem)
        
        for solution_name, solution_code in solutions.items():
            print(f"\n💡 {solution_name.replace('_', ' ').title()}:")
            print(solution_code)

# 함정과 해결책 가이드 실행
pitfalls = CommonPitfallsAndSolutions()
pitfalls.pitfall_1_event_storms()
print("\n" + "="*70)
pitfalls.pitfall_2_message_ordering()
print("\n" + "="*70)
pitfalls.pitfall_3_debugging_complexity()
```

## 핵심 요점

### 1. 단계적 접근의 중요성

Event-Driven Architecture는 한 번에 도입하기보다는 성숙도 모델을 따라 점진적으로 적용하는 것이 성공 확률을 높입니다.

### 2. 기술 선택의 맥락 의존성

RabbitMQ와 Kafka는 각각의 장단점이 있으므로, 프로젝트의 요구사항과 팀 상황을 종합적으로 고려해야 합니다.

### 3. 운영상의 복잡성 관리

Event-Driven Architecture의 이점을 누리려면 분산 추적, 모니터링, 디버깅 도구에 대한 투자가 필수적입니다.

### 4. 팀 역량과 조직 문화

기술적 구현뿐만 아니라 팀의 학습 역량과 조직의 변화 관리가 성공의 핵심 요소입니다.

---

**이전**: [Event Streaming과 Event Sourcing](05c-event-streaming-sourcing.md)  
**다음**: [14장 Distributed Systems 전체 개요](index.md)에서 분산 시스템의 모든 패턴을 통합 학습합니다.
