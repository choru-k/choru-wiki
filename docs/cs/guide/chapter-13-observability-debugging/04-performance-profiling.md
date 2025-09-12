---
tags:
  - Performance
  - Profiling
  - Optimization
  - Debugging
  - Python
---

# 13.4 성능 프로파일링

## 2024년 5월, 빨간 불이 켜진 서버실

2024년 5월 23일 오후 2시, 대규모 마케팅 캠페인이 시작되었다. 예상 트래픽의 3배가 몰려들었고, 응답 시간이 300ms에서 5초로 급증했다.

"CPU 사용률은 30%인데 왜 이렇게 느리지?"
"메모리도 충분히 남아있는데..."
"디스크 I/O도 정상이야."

모든 기본 메트릭은 정상이었지만, 사용자들은 떠나가고 있었다. **진짜 병목이 어디에 있는지 찾아야 했다.**

그때 깨달았다. 우리에게는 **딥 다이빙**할 수 있는 프로파일링 도구가 없었던 것이다. 시스템 메트릭은 '무엇이' 일어나고 있는지 알려주지만, 프로파일링은 '왜' 그런 일이 일어나는지 알려준다.

## cProfile과 Line Profiler

가장 기본적이면서도 강력한 Python 프로파일링 도구들부터 살펴보자.

### cProfile로 함수별 성능 측정

```python
import cProfile
import pstats
import io
from functools import wraps
from typing import Dict, List, Any
import time

class ProfileAnalyzer:
    def __init__(self):
        self.profiles: Dict[str, pstats.Stats] = {}
    
    def profile_function(self, name: str):
        """함수 프로파일링 데코레이터"""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                # 프로파일러 생성
                pr = cProfile.Profile()
                
                # 프로파일링 시작
                pr.enable()
                try:
                    result = func(*args, **kwargs)
                    return result
                finally:
                    pr.disable()
                    
                    # 결과 저장
                    s = io.StringIO()
                    ps = pstats.Stats(pr, stream=s)
                    ps.sort_stats('cumulative')
                    
                    self.profiles[f"{name}_{int(time.time())}"] = ps
            
            return wrapper
        return decorator
    
    def analyze_bottlenecks(self, profile_name: str) -> Dict[str, Any]:
        """병목 지점 분석"""
        if profile_name not in self.profiles:
            return {}
        
        stats = self.profiles[profile_name]
        
        # 통계 수집
        analysis = {
            'total_calls': stats.total_calls,
            'total_time': stats.total_tt,
            'top_functions': [],
            'hotspots': []
        }
        
        # 가장 시간을 많이 소모하는 함수들
        stats.sort_stats('cumulative')
        for func, (cc, nc, tt, ct, callers) in list(stats.stats.items())[:10]:
            analysis['top_functions'].append({
                'function': f"{func[0]}:{func[1]}({func[2]})",
                'calls': cc,
                'total_time': tt,
                'cumulative_time': ct,
                'per_call': ct/cc if cc > 0 else 0
            })
        
        # 호출 횟수가 많은 핫스팟들
        stats.sort_stats('ncalls')
        for func, (cc, nc, tt, ct, callers) in list(stats.stats.items())[:5]:
            if cc > 1000:  # 1000번 이상 호출된 함수들
                analysis['hotspots'].append({
                    'function': f"{func[0]}:{func[1]}({func[2]})",
                    'calls': cc,
                    'total_time': tt,
                    'avg_time': tt/cc if cc > 0 else 0
                })
        
        return analysis
    
    def compare_profiles(self, profile1: str, profile2: str) -> Dict[str, Any]:
        """두 프로파일 결과 비교"""
        if profile1 not in self.profiles or profile2 not in self.profiles:
            return {}
        
        stats1 = self.profiles[profile1]
        stats2 = self.profiles[profile2]
        
        comparison = {
            'time_diff': stats2.total_tt - stats1.total_tt,
            'calls_diff': stats2.total_calls - stats1.total_calls,
            'regression_functions': [],
            'improved_functions': []
        }
        
        # 함수별 성능 변화 분석
        for func in set(stats1.stats.keys()) & set(stats2.stats.keys()):
            time1 = stats1.stats[func][3]  # cumulative time
            time2 = stats2.stats[func][3]
            
            if time2 > time1 * 1.1:  # 10% 이상 느려진 함수
                comparison['regression_functions'].append({
                    'function': f"{func[0]}:{func[1]}({func[2]})",
                    'before': time1,
                    'after': time2,
                    'degradation': ((time2 - time1) / time1) * 100
                })
            elif time2 < time1 * 0.9:  # 10% 이상 빨라진 함수
                comparison['improved_functions'].append({
                    'function': f"{func[0]}:{func[1]}({func[2]})",
                    'before': time1,
                    'after': time2,
                    'improvement': ((time1 - time2) / time1) * 100
                })
        
        return comparison

# 사용 예시
profiler = ProfileAnalyzer()

@profiler.profile_function("database_query")
def get_user_recommendations(user_id: str) -> List[Dict]:
    """사용자 추천 목록 조회 (성능 문제가 있는 버전)"""
    # 비효율적인 N+1 쿼리 패턴
    recommendations = []
    
    # 1. 사용자 기본 정보 조회
    user = query_database(f"SELECT * FROM users WHERE id = '{user_id}'")
    
    # 2. 사용자의 관심사 조회 (N+1 문제 발생)
    interests = []
    for interest_id in user.get('interest_ids', []):
        interest = query_database(f"SELECT * FROM interests WHERE id = '{interest_id}'")
        interests.append(interest)
    
    # 3. 각 관심사별 추천 상품 조회 (또 다른 N+1 문제)
    for interest in interests:
        products = []
        product_ids = get_products_by_interest(interest['id'])
        for product_id in product_ids:
            product = query_database(f"SELECT * FROM products WHERE id = '{product_id}'")
            products.append(product)
        
        recommendations.extend(products[:5])  # 관심사별 상위 5개
    
    return recommendations[:20]  # 최종 20개 반환

def query_database(query: str) -> Dict:
    """DB 쿼리 시뮬레이션 (0.01초 소요)"""
    time.sleep(0.01)
    return {"id": 1, "name": "Sample", "interest_ids": [1, 2, 3, 4, 5]}

def get_products_by_interest(interest_id: int) -> List[int]:
    """관심사별 상품 ID 목록"""
    return list(range(1, 11))  # 10개 상품

# 프로파일링 실행
result = get_user_recommendations("user123")
analysis = profiler.analyze_bottlenecks(list(profiler.profiles.keys())[-1])

print("=== 성능 분석 결과 ===")
print(f"총 실행 시간: {analysis['total_time']:.3f}초")
print(f"총 함수 호출: {analysis['total_calls']}회")
print("\n=== 가장 시간을 많이 소모하는 함수들 ===")
for func in analysis['top_functions']:
    print(f"- {func['function']}: {func['cumulative_time']:.3f}초 ({func['calls']}회 호출)")
```

### Line Profiler로 라인별 분석

```python
import time
import sys
from line_profiler import LineProfiler

class LineByLineProfiler:
    def __init__(self):
        self.profiler = LineProfiler()
    
    def profile_lines(self, func):
        """라인별 프로파일링 데코레이터"""
        self.profiler.add_function(func)
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            self.profiler.enable_by_count()
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                self.profiler.disable_by_count()
        
        return wrapper
    
    def show_results(self):
        """프로파일링 결과 출력"""
        self.profiler.print_stats()
    
    def get_line_analysis(self, filename: str) -> Dict[int, Dict]:
        """라인별 성능 분석"""
        stats = self.profiler.get_stats()
        if not stats or filename not in stats.timings:
            return {}
        
        timings = stats.timings[filename]
        analysis = {}
        
        for line_no, hits, time_per_hit in timings:
            if hits > 0:
                analysis[line_no] = {
                    'hits': hits,
                    'time_per_hit': time_per_hit,
                    'total_time': hits * time_per_hit,
                    'percentage': (hits * time_per_hit / stats.total_time) * 100 if stats.total_time > 0 else 0
                }
        
        return analysis

# 사용 예시
line_profiler = LineByLineProfiler()

@line_profiler.profile_lines
def slow_string_processing(data: List[str]) -> List[str]:
    """문자열 처리 함수 (성능 문제가 있는 버전)"""
    result = []                           # Line 1
    
    for item in data:                     # Line 2 - 반복문
        processed = ""                    # Line 3 - 비효율적 문자열 연결
        
        for char in item:                 # Line 4 - 중첩 반복문
            if char.isalnum():           # Line 5 - 문자 검사
                processed += char.upper() # Line 6 - 비효율적 문자열 연결
            else:                        # Line 7
                processed += "_"         # Line 8 - 비효율적 문자열 연결
        
        # 비효율적인 중복 제거
        final_processed = ""             # Line 9
        seen_chars = set()               # Line 10
        for char in processed:           # Line 11
            if char not in seen_chars:   # Line 12
                final_processed += char  # Line 13 - 비효율적 문자열 연결
                seen_chars.add(char)     # Line 14
        
        result.append(final_processed)   # Line 15
    
    return result                        # Line 16

# 테스트 데이터
test_data = ["hello@world#123", "python@programming!", "performance#testing"] * 100

# 프로파일링 실행
result = slow_string_processing(test_data)
line_profiler.show_results()
```

## 메모리 프로파일링

메모리 사용량과 메모리 누수를 추적하는 것도 중요하다.

```python
import psutil
import gc
import sys
import tracemalloc
from typing import List, Tuple, Dict
from dataclasses import dataclass
from collections import defaultdict

@dataclass
class MemorySnapshot:
    timestamp: float
    total_memory: int
    available_memory: int
    process_memory: int
    object_counts: Dict[str, int]
    top_allocations: List[Tuple[str, int]]

class MemoryProfiler:
    def __init__(self):
        self.snapshots: List[MemorySnapshot] = []
        self.process = psutil.Process()
        tracemalloc.start()
    
    def take_snapshot(self) -> MemorySnapshot:
        """메모리 스냅샷 촬영"""
        # 시스템 메모리 정보
        memory_info = psutil.virtual_memory()
        process_memory = self.process.memory_info()
        
        # 객체 타입별 개수
        object_counts = defaultdict(int)
        for obj in gc.get_objects():
            object_counts[type(obj).__name__] += 1
        
        # 메모리 할당 추적
        snapshot = tracemalloc.take_snapshot()
        top_stats = snapshot.statistics('lineno')[:10]
        
        top_allocations = []
        for stat in top_stats:
            top_allocations.append((str(stat.traceback), stat.size))
        
        snapshot_obj = MemorySnapshot(
            timestamp=time.time(),
            total_memory=memory_info.total,
            available_memory=memory_info.available,
            process_memory=process_memory.rss,
            object_counts=dict(object_counts),
            top_allocations=top_allocations
        )
        
        self.snapshots.append(snapshot_obj)
        return snapshot_obj
    
    def detect_memory_leaks(self) -> List[Dict]:
        """메모리 누수 감지"""
        if len(self.snapshots) < 2:
            return []
        
        first_snapshot = self.snapshots[0]
        latest_snapshot = self.snapshots[-1]
        
        leaks = []
        
        # 객체 개수 증가 추이 분석
        for obj_type, latest_count in latest_snapshot.object_counts.items():
            initial_count = first_snapshot.object_counts.get(obj_type, 0)
            
            if latest_count > initial_count * 2 and latest_count > 1000:
                growth_rate = (latest_count - initial_count) / (latest_snapshot.timestamp - first_snapshot.timestamp)
                
                leaks.append({
                    'object_type': obj_type,
                    'initial_count': initial_count,
                    'current_count': latest_count,
                    'growth_rate': growth_rate,
                    'severity': 'high' if growth_rate > 100 else 'medium'
                })
        
        return sorted(leaks, key=lambda x: x['growth_rate'], reverse=True)
    
    def analyze_memory_usage_pattern(self) -> Dict:
        """메모리 사용 패턴 분석"""
        if len(self.snapshots) < 3:
            return {}
        
        memory_values = [s.process_memory for s in self.snapshots]
        timestamps = [s.timestamp for s in self.snapshots]
        
        # 메모리 증가 추세 계산
        memory_growth = []
        for i in range(1, len(memory_values)):
            growth = memory_values[i] - memory_values[i-1]
            time_diff = timestamps[i] - timestamps[i-1]
            memory_growth.append(growth / time_diff if time_diff > 0 else 0)
        
        avg_growth = sum(memory_growth) / len(memory_growth)
        max_memory = max(memory_values)
        min_memory = min(memory_values)
        
        return {
            'average_memory_growth_rate': avg_growth,
            'peak_memory_usage': max_memory,
            'baseline_memory_usage': min_memory,
            'memory_volatility': max_memory - min_memory,
            'trend': 'increasing' if avg_growth > 0 else 'stable' if abs(avg_growth) < 1000 else 'decreasing'
        }

# 메모리 누수가 있는 예시 코드
class LeakyCache:
    def __init__(self):
        self._cache = {}  # 이 캐시가 계속 증가만 함
    
    def get_data(self, key: str) -> str:
        if key not in self._cache:
            # 캐시에 데이터 저장 (삭제 로직 없음)
            self._cache[key] = f"data_for_{key}" * 1000  # 큰 데이터
        
        return self._cache[key]
    
    def process_requests(self, num_requests: int):
        for i in range(num_requests):
            # 매번 새로운 키로 데이터 요청 (캐시 무한 증가)
            self.get_data(f"request_{i}")

# 메모리 프로파일링 실행
memory_profiler = MemoryProfiler()
leaky_cache = LeakyCache()

# 초기 스냅샷
memory_profiler.take_snapshot()

# 메모리 누수를 유발하는 작업
for batch in range(5):
    leaky_cache.process_requests(1000)
    memory_profiler.take_snapshot()
    time.sleep(1)

# 메모리 누수 분석
leaks = memory_profiler.detect_memory_leaks()
pattern = memory_profiler.analyze_memory_usage_pattern()

print("=== 메모리 누수 감지 결과 ===")
for leak in leaks:
    print(f"객체 타입: {leak['object_type']}")
    print(f"초기 개수: {leak['initial_count']} → 현재 개수: {leak['current_count']}")
    print(f"증가율: {leak['growth_rate']:.1f} 객체/초")
    print(f"심각도: {leak['severity']}")
    print("-" * 40)

print(f"\n=== 메모리 사용 패턴 ===")
print(f"평균 메모리 증가율: {pattern['average_memory_growth_rate']:.1f} bytes/초")
print(f"메모리 사용 추세: {pattern['trend']}")
print(f"피크 메모리 사용량: {pattern['peak_memory_usage'] / 1024 / 1024:.1f} MB")
```

## 비동기 코드 프로파일링

현대적인 Python 애플리케이션은 대부분 비동기 패턴을 사용한다. asyncio 코드를 프로파일링하는 방법을 알아보자.

```python
import asyncio
import time
import aiohttp
from contextlib import asynccontextmanager
from typing import Dict, List, Callable, Any
import functools

class AsyncProfiler:
    def __init__(self):
        self.function_times: Dict[str, List[float]] = defaultdict(list)
        self.concurrent_operations: Dict[float, List[str]] = defaultdict(list)
        self.start_time = time.time()
    
    def profile_async(self, name: str = None):
        """비동기 함수 프로파일링 데코레이터"""
        def decorator(func: Callable):
            func_name = name or f"{func.__module__}.{func.__name__}"
            
            @functools.wraps(func)
            async def wrapper(*args, **kwargs):
                start_time = time.time()
                operation_id = f"{func_name}_{id(asyncio.current_task())}"
                
                # 동시 실행 추적
                relative_time = start_time - self.start_time
                self.concurrent_operations[relative_time].append(operation_id)
                
                try:
                    result = await func(*args, **kwargs)
                    return result
                finally:
                    end_time = time.time()
                    duration = end_time - start_time
                    self.function_times[func_name].append(duration)
                    
                    # 완료 시점 기록
                    relative_end_time = end_time - self.start_time
                    if operation_id in self.concurrent_operations[relative_time]:
                        self.concurrent_operations[relative_time].remove(operation_id)
            
            return wrapper
        return decorator
    
    @asynccontextmanager
    async def profile_context(self, operation_name: str):
        """컨텍스트 매니저로 코드 블록 프로파일링"""
        start_time = time.time()
        try:
            yield
        finally:
            duration = time.time() - start_time
            self.function_times[operation_name].append(duration)
    
    def get_async_bottlenecks(self) -> Dict[str, Any]:
        """비동기 병목 분석"""
        analysis = {}
        
        for func_name, times in self.function_times.items():
            if not times:
                continue
            
            analysis[func_name] = {
                'call_count': len(times),
                'total_time': sum(times),
                'avg_time': sum(times) / len(times),
                'min_time': min(times),
                'max_time': max(times),
                'std_dev': np.std(times) if len(times) > 1 else 0
            }
        
        # 가장 느린 함수들 정렬
        sorted_analysis = dict(sorted(analysis.items(), 
                                    key=lambda x: x[1]['total_time'], 
                                    reverse=True))
        
        return sorted_analysis
    
    def detect_blocking_operations(self, threshold: float = 0.1) -> List[Dict]:
        """블로킹 작업 감지 (0.1초 이상 걸리는 작업)"""
        blocking_ops = []
        
        for func_name, times in self.function_times.items():
            for duration in times:
                if duration > threshold:
                    blocking_ops.append({
                        'function': func_name,
                        'duration': duration,
                        'severity': 'critical' if duration > 1.0 else 'warning'
                    })
        
        return sorted(blocking_ops, key=lambda x: x['duration'], reverse=True)

# 사용 예시
async_profiler = AsyncProfiler()

@async_profiler.profile_async("api_call")
async def fetch_user_data(user_id: str) -> Dict:
    """사용자 데이터 API 호출 (외부 API)"""
    async with aiohttp.ClientSession() as session:
        # 실제로는 외부 API 호출, 여기서는 시뮬레이션
        await asyncio.sleep(0.2)  # 네트워크 지연 시뮬레이션
        return {"user_id": user_id, "name": f"User {user_id}"}

@async_profiler.profile_async("database_query")
async def get_user_preferences(user_id: str) -> Dict:
    """데이터베이스에서 사용자 선호도 조회"""
    # DB 쿼리 시뮬레이션
    await asyncio.sleep(0.05)
    return {"theme": "dark", "language": "ko"}

@async_profiler.profile_async("recommendation_engine")
async def generate_recommendations(user_data: Dict, preferences: Dict) -> List[Dict]:
    """추천 알고리즘 실행 (CPU 집약적 작업)"""
    # CPU 집약적 작업 시뮬레이션 (블로킹 작업의 예)
    start = time.time()
    while time.time() - start < 0.3:  # 0.3초 동안 CPU 작업
        pass
    
    return [{"item_id": i, "score": 0.8} for i in range(10)]

async def process_user_request(user_id: str) -> Dict:
    """사용자 요청 처리 (여러 비동기 작업 조합)"""
    
    # 병렬 실행 가능한 작업들
    async with async_profiler.profile_context("parallel_data_fetch"):
        user_data_task = fetch_user_data(user_id)
        preferences_task = get_user_preferences(user_id)
        
        user_data, preferences = await asyncio.gather(
            user_data_task, 
            preferences_task
        )
    
    # 순차 실행이 필요한 작업
    async with async_profiler.profile_context("sequential_processing"):
        recommendations = await generate_recommendations(user_data, preferences)
    
    return {
        "user_data": user_data,
        "preferences": preferences,
        "recommendations": recommendations
    }

async def simulate_concurrent_requests():
    """동시 요청 시뮬레이션"""
    tasks = []
    for i in range(5):
        tasks.append(process_user_request(f"user_{i}"))
    
    results = await asyncio.gather(*tasks)
    return results

# 프로파일링 실행
async def main():
    print("비동기 프로파일링 시작...")
    
    start_time = time.time()
    await simulate_concurrent_requests()
    total_time = time.time() - start_time
    
    print(f"총 실행 시간: {total_time:.3f}초")
    
    # 분석 결과 출력
    bottlenecks = async_profiler.get_async_bottlenecks()
    blocking_ops = async_profiler.detect_blocking_operations()
    
    print("\n=== 비동기 성능 분석 ===")
    for func_name, stats in list(bottlenecks.items())[:5]:
        print(f"{func_name}:")
        print(f"  호출 횟수: {stats['call_count']}")
        print(f"  총 시간: {stats['total_time']:.3f}초")
        print(f"  평균 시간: {stats['avg_time']:.3f}초")
        print(f"  최대 시간: {stats['max_time']:.3f}초")
        print()
    
    print("=== 블로킹 작업 감지 ===")
    for op in blocking_ops:
        print(f"⚠️ {op['function']}: {op['duration']:.3f}초 ({op['severity']})")

# asyncio.run(main())
```

## 실시간 성능 모니터링

프로덕션 환경에서는 실시간으로 성능을 모니터링해야 한다.

```python
import threading
import queue
import json
from datetime import datetime, timedelta
from typing import Optional

class RealTimeProfiler:
    def __init__(self, sample_interval: float = 1.0, max_samples: int = 1000):
        self.sample_interval = sample_interval
        self.max_samples = max_samples
        self.samples_queue = queue.Queue(maxsize=max_samples)
        self.is_running = False
        self.sampling_thread: Optional[threading.Thread] = None
        
        # 성능 지표
        self.request_counter = 0
        self.error_counter = 0
        self.total_response_time = 0.0
        self.active_requests = 0
        
        # 임계값 설정
        self.thresholds = {
            'response_time_p95': 1.0,  # 95%ile 응답시간 1초
            'error_rate': 0.05,        # 에러율 5%
            'memory_usage': 0.8,       # 메모리 사용률 80%
            'cpu_usage': 0.8           # CPU 사용률 80%
        }
    
    def start_monitoring(self):
        """실시간 모니터링 시작"""
        if self.is_running:
            return
        
        self.is_running = True
        self.sampling_thread = threading.Thread(target=self._sampling_loop, daemon=True)
        self.sampling_thread.start()
        print("실시간 성능 모니터링 시작")
    
    def stop_monitoring(self):
        """실시간 모니터링 중지"""
        self.is_running = False
        if self.sampling_thread:
            self.sampling_thread.join()
        print("실시간 성능 모니터링 중지")
    
    def _sampling_loop(self):
        """주기적 샘플링 루프"""
        while self.is_running:
            try:
                sample = self._collect_sample()
                
                # 큐가 가득 차면 오래된 샘플 제거
                if self.samples_queue.full():
                    try:
                        self.samples_queue.get_nowait()
                    except queue.Empty:
                        pass
                
                self.samples_queue.put(sample)
                
                # 임계값 체크 및 알림
                self._check_thresholds(sample)
                
            except Exception as e:
                print(f"샘플링 중 오류: {e}")
            
            time.sleep(self.sample_interval)
    
    def _collect_sample(self) -> Dict:
        """현재 성능 샘플 수집"""
        # 시스템 메트릭
        process = psutil.Process()
        memory_info = process.memory_info()
        cpu_percent = process.cpu_percent()
        
        # 애플리케이션 메트릭
        error_rate = (self.error_counter / max(self.request_counter, 1))
        avg_response_time = (self.total_response_time / max(self.request_counter, 1))
        
        # 최근 응답시간 분포 계산 (간단한 예시)
        response_times = self._get_recent_response_times()
        p95_response_time = np.percentile(response_times, 95) if response_times else 0
        
        sample = {
            'timestamp': datetime.now().isoformat(),
            'memory_usage': memory_info.rss / (1024 ** 3),  # GB
            'cpu_usage': cpu_percent / 100.0,
            'active_requests': self.active_requests,
            'total_requests': self.request_counter,
            'error_rate': error_rate,
            'avg_response_time': avg_response_time,
            'p95_response_time': p95_response_time,
            'requests_per_second': self._calculate_rps()
        }
        
        return sample
    
    def _get_recent_response_times(self) -> List[float]:
        """최근 응답시간 목록 (실제 구현에서는 sliding window 사용)"""
        # 간단한 구현 예시
        return [0.1, 0.2, 0.15, 0.3, 0.8, 1.2, 0.5]
    
    def _calculate_rps(self) -> float:
        """초당 요청 수 계산"""
        # 최근 1분간의 요청 수를 기반으로 계산
        # 실제 구현에서는 시간 윈도우 기반 계산 필요
        return self.request_counter / 60.0  # 간단한 예시
    
    def _check_thresholds(self, sample: Dict):
        """임계값 체크 및 알림"""
        alerts = []
        
        for metric, threshold in self.thresholds.items():
            if metric in sample and sample[metric] > threshold:
                alerts.append({
                    'metric': metric,
                    'current_value': sample[metric],
                    'threshold': threshold,
                    'severity': 'critical' if sample[metric] > threshold * 1.5 else 'warning'
                })
        
        if alerts:
            self._send_alerts(alerts)
    
    def _send_alerts(self, alerts: List[Dict]):
        """알림 전송"""
        for alert in alerts:
            print(f"🚨 ALERT: {alert['metric']} = {alert['current_value']:.3f} "
                  f"(임계값: {alert['threshold']:.3f}) - {alert['severity']}")
    
    def get_performance_summary(self) -> Dict:
        """성능 요약 정보"""
        samples = []
        while not self.samples_queue.empty():
            try:
                samples.append(self.samples_queue.get_nowait())
            except queue.Empty:
                break
        
        if not samples:
            return {}
        
        # 최근 샘플들을 다시 큐에 넣기
        for sample in samples:
            if not self.samples_queue.full():
                self.samples_queue.put(sample)
        
        # 통계 계산
        cpu_values = [s['cpu_usage'] for s in samples]
        memory_values = [s['memory_usage'] for s in samples]
        response_times = [s['avg_response_time'] for s in samples]
        
        return {
            'sample_count': len(samples),
            'time_range': f"{samples[0]['timestamp']} ~ {samples[-1]['timestamp']}",
            'avg_cpu': np.mean(cpu_values),
            'peak_cpu': np.max(cpu_values),
            'avg_memory': np.mean(memory_values),
            'peak_memory': np.max(memory_values),
            'avg_response_time': np.mean(response_times),
            'max_response_time': np.max(response_times),
            'current_error_rate': self.error_counter / max(self.request_counter, 1)
        }

# 성능 추적 데코레이터
def track_performance(profiler: RealTimeProfiler):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            profiler.active_requests += 1
            profiler.request_counter += 1
            start_time = time.time()
            
            try:
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                profiler.error_counter += 1
                raise
            finally:
                duration = time.time() - start_time
                profiler.total_response_time += duration
                profiler.active_requests -= 1
        
        return wrapper
    return decorator

# 사용 예시
real_time_profiler = RealTimeProfiler()

@track_performance(real_time_profiler)
def api_endpoint(request_id: str):
    """API 엔드포인트 시뮬레이션"""
    # 랜덤 응답 시간 시뮬레이션
    import random
    sleep_time = random.uniform(0.1, 0.8)
    time.sleep(sleep_time)
    
    # 가끔 에러 발생 시뮬레이션
    if random.random() < 0.02:  # 2% 에러율
        raise Exception("Simulated error")
    
    return {"request_id": request_id, "response": "success"}

# 모니터링 시작
real_time_profiler.start_monitoring()

# 트래픽 시뮬레이션
print("트래픽 시뮬레이션 시작...")
for i in range(100):
    try:
        api_endpoint(f"req_{i}")
    except Exception:
        pass  # 에러는 이미 카운트됨
    
    time.sleep(0.1)

# 성능 요약
summary = real_time_profiler.get_performance_summary()
print("\n=== 성능 모니터링 요약 ===")
for key, value in summary.items():
    print(f"{key}: {value}")

real_time_profiler.stop_monitoring()
```

## 레슨 런

### 1. 올바른 프로파일링 도구를 선택하라

- **함수 단위**: cProfile
- **라인 단위**: line_profiler  
- **메모리**: tracemalloc, memory_profiler
- **비동기**: 커스텀 async profiler

### 2. 프로덕션에서 가벼운 프로파일링을 하라

실시간 모니터링은 **성능에 미치는 영향을 최소화**해야 한다. 샘플링 기반 접근법을 사용하자.

### 3. 메트릭과 프로파일링을 연결하라

메트릭으로 **문제를 감지**하고, 프로파일링으로 **근본 원인을 찾는다**.

### 4. 병목의 진짜 원인을 찾아라

겉으로 보기에는 CPU 문제같아도, 실제로는 **I/O 대기**나 **비효율적인 알고리즘**이 원인일 수 있다.

---

**다음 장에서는** 실전 디버깅 기법을 통해 복잡한 시스템 문제를 체계적으로 해결하는 방법을 학습한다. 프로파일링으로 병목을 찾았다면, 이제 그것을 어떻게 수정할지 알아야 한다.
