---
tags:
  - Debugging
  - Tools
  - Productivity
  - Automation
  - Conditional Breakpoints
---

# 13.5c 스마트 디버깅 도구

## 생산성 높은 디버깅 도구들

실전에서 자주 사용하는 디버깅 도구들을 활용해보자. 단순히 print문을 사용하는 대신 **조건부 브레이크포인트**와 **자동 디버깅** 기능을 구현하여 효율성을 높일 수 있다.

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

## 고급 디버깅 기법

### 1. 메모리 사용량 추적 디버거

```python
import tracemalloc
import resource
from typing import Dict, List, Tuple

class MemoryDebugger:
    def __init__(self):
        self.snapshots: List[Tuple[str, tracemalloc.Snapshot]] = []
        self.memory_threshold = 100 * 1024 * 1024  # 100MB
    
    def start_memory_tracking(self):
        """메모리 추적 시작"""
        tracemalloc.start()
        self._take_snapshot("시작")
    
    def take_checkpoint(self, name: str):
        """메모리 체크포인트"""
        self._take_snapshot(name)
        current_memory = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        
        if current_memory > self.memory_threshold:
            print(f"⚠️ 메모리 임계값 초과: {current_memory / 1024 / 1024:.1f}MB")
            self._analyze_memory_growth()
    
    def _take_snapshot(self, name: str):
        """메모리 스냅샷 저장"""
        snapshot = tracemalloc.take_snapshot()
        self.snapshots.append((name, snapshot))
    
    def _analyze_memory_growth(self):
        """메모리 증가 분석"""
        if len(self.snapshots) < 2:
            return
        
        current_name, current = self.snapshots[-1]
        prev_name, previous = self.snapshots[-2]
        
        top_stats = current.compare_to(previous, 'lineno')
        
        print(f"\n=== 메모리 증가 분석: {prev_name} → {current_name} ===")
        for stat in top_stats[:10]:
            print(stat)

# 사용 예시
memory_debugger = MemoryDebugger()
memory_debugger.start_memory_tracking()

# 메모리 집약적 작업
large_data = []
for i in range(1000000):
    large_data.append(f"data_{i}")

memory_debugger.take_checkpoint("대량 데이터 생성 후")
```

### 2. 성능 병목 자동 감지

```python
import time
import cProfile
import pstats
from functools import wraps

class PerformanceDebugger:
    def __init__(self, threshold_seconds: float = 1.0):
        self.threshold = threshold_seconds
        self.slow_functions: List[Dict] = []
    
    def profile_slow_functions(self, func):
        """느린 함수 자동 프로파일링"""
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            
            # 프로파일러 시작
            profiler = cProfile.Profile()
            profiler.enable()
            
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                profiler.disable()
                execution_time = time.time() - start_time
                
                # 임계값을 초과한 경우에만 분석
                if execution_time > self.threshold:
                    print(f"🐌 느린 함수 감지: {func.__name__} ({execution_time:.2f}초)")
                    
                    # 상세 프로파일링 결과
                    stats = pstats.Stats(profiler)
                    stats.sort_stats('cumulative')
                    print("상위 10개 함수:")
                    stats.print_stats(10)
                    
                    self.slow_functions.append({
                        'function': func.__name__,
                        'execution_time': execution_time,
                        'timestamp': time.time()
                    })
        
        return wrapper

# 사용 예시
perf_debugger = PerformanceDebugger(threshold_seconds=0.1)

@perf_debugger.profile_slow_functions
def slow_database_query():
    """의도적으로 느린 함수"""
    time.sleep(0.2)  # 느린 DB 쿼리 시뮬레이션
    return "query_result"
```

## 핵심 요점

### 1. 조건부 디버깅으로 효율성 극대화

모든 곳에 로그를 남기지 말고, 특정 조건에서만 상세 디버깅을 활성화하자.

### 2. 자동화된 예외 처리

예외 발생 시 자동으로 디버깅 모드로 진입하여 현재 상태를 분석할 수 있다.

### 3. 컨텍스트 기반 디버깅

비즈니스 로직의 각 단계별로 디버깅 컨텍스트를 분리하여 문제 지점을 명확히 파악한다.

### 4. 성능과 메모리 자동 모니터링

임계값을 설정하여 성능 저하나 메모리 누수를 자동으로 감지하고 분석한다.

---

**이전**: [13.5b 분산 시스템 디버깅](05b-distributed-debugging.md)  
**다음**: [13.5d 로그 분석과 자동 디버깅](05d-log-analysis-debugging.md)에서 로그 기반 디버깅 기법을 학습합니다.
