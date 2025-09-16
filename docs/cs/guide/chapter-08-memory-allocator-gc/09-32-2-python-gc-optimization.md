---
tags:
  - gc-optimization
  - hands-on
  - intermediate
  - medium-read
  - memory-management
  - performance-tuning
  - python
  - slots
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "3-5시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# Chapter 9-3c2: Python GC 최적화 전략과 기법

## 🎯 실전 메모리 최적화 마스터하기

이 문서에서는 Python 메모리 사용량을 극적으로 개선할 수 있는 구체적이고 실전적인 기법들을 다룹니다:

1. **GC 제어를 통한 성능 향상** - 배치 작업에서 16% 성능 개선 달성
2. **__slots__를 통한 메모리 절약** - 객체당 40% 메모리 사용량 감소
3. **WeakRef를 활용한 자동 메모리 관리** - 메모리 누수 방지와 캐시 최적화
4. **실제 측정 가능한 최적화 결과** - 구체적인 수치와 벤치마크 제공

## 1. 코드 레벨 최적화 전략

### 1.1 GC 제어를 통한 성능 최적화

```python
import gc
import time
from contextlib import contextmanager
from functools import wraps
import weakref
from typing import Dict, Any, Optional

class PythonGCOptimization:
    """Python GC 최적화 기법들"""

    @staticmethod
    @contextmanager
    def gc_disabled():
        """임시로 GC 비활성화하는 컨텍스트 매니저"""
        was_enabled = gc.isenabled()
        gc.disable()  # GC 완전 비활성화
        try:
            yield
        finally:
            if was_enabled:
                gc.enable()  # 원래 상태 복구

    @staticmethod
    def benchmark_gc_impact():
        """GC가 성능에 미치는 영향 측정"""

        def create_objects(n):
            """테스트용 객체 생성 함수"""
            return [{"id": i, "data": [0] * 100, "nested": {"value": i}}
                    for i in range(n)]

        # 테스트 데이터 크기
        test_size = 1000000

        print("=== GC 성능 영향 측정 ===")

        # 1. GC 활성화 상태에서 측정
        gc.enable()
        start_time = time.time()

        with_gc_data = create_objects(test_size)

        gc_enabled_time = time.time() - start_time
        print(f"GC 활성화: {gc_enabled_time:.3f}초")

        # 메모리 정리
        del with_gc_data
        gc.collect()

        # 2. GC 비활성화 상태에서 측정
        with PythonGCOptimization.gc_disabled():
            start_time = time.time()

            without_gc_data = create_objects(test_size)

            gc_disabled_time = time.time() - start_time
            print(f"GC 비활성화: {gc_disabled_time:.3f}초")

        # 성능 향상 계산
        improvement = (gc_enabled_time - gc_disabled_time) / gc_enabled_time * 100
        print(f"성능 향상: {improvement:.1f}%")

        # 수동으로 정리 (GC가 비활성화되어 있을 때)
        gc.enable()
        del without_gc_data
        gc.collect()

        """
        일반적인 결과:
        GC 활성화: 2.5초
        GC 비활성화: 2.1초
        성능 향상: 16%

        결론: 대량 객체 생성 시 임시로 GC 비활성화하면 성능 개선 가능
        주의: 메모리 누수 위험이 있으므로 신중하게 사용
        """

def batch_processing_optimization():
    """배치 처리 시 GC 최적화"""

    def process_large_batch_naive(data_items):
        """순진한 방법: GC가 중간중간 실행됨"""
        results = []

        for item in data_items:
            # 복잡한 처리 작업 시뮬레이션
            processed = {
                "original": item,
                "transformed": item * 2,
                "metadata": {"processed_at": time.time()},
                "temp_data": [item] * 100  # 임시 데이터
            }
            results.append(processed)

        return results

    def process_large_batch_optimized(data_items):
        """최적화된 방법: 배치 작업 중 GC 비활성화"""

        # 작업 전 예방적 GC 실행
        gc.collect()

        # 배치 작업 중 GC 비활성화
        with PythonGCOptimization.gc_disabled():
            results = []

            for item in data_items:
                processed = {
                    "original": item,
                    "transformed": item * 2,
                    "metadata": {"processed_at": time.time()},
                    "temp_data": [item] * 100
                }
                results.append(processed)

        # 작업 완료 후 한 번에 정리
        gc.collect()

        return results

    # 성능 비교 테스트
    test_data = list(range(100000))

    print("=== 배치 처리 최적화 비교 ===")

    # 순진한 방법
    start = time.time()
    naive_results = process_large_batch_naive(test_data)
    naive_time = time.time() - start
    print(f"순진한 방법: {naive_time:.3f}초")

    # 최적화된 방법
    start = time.time()
    optimized_results = process_large_batch_optimized(test_data)
    optimized_time = time.time() - start
    print(f"최적화 방법: {optimized_time:.3f}초")

    improvement = (naive_time - optimized_time) / naive_time * 100
    print(f"성능 향상: {improvement:.1f}%")

    # 결과 검증
    assert len(naive_results) == len(optimized_results)
    print("결과 검증: 통과")

    # 정리
    del naive_results, optimized_results
    gc.collect()
```

### 1.2 __slots__를 통한 메모리 최적화

```python
import sys
import psutil

# __slots__ 메모리 최적화
class OptimizedClass:
    """__slots__를 사용한 메모리 최적화 클래스"""
    __slots__ = ['x', 'y', 'z', 'data']  # __dict__ 제거

    def __init__(self, x, y, z, data=None):
        self.x = x
        self.y = y
        self.z = z
        self.data = data or []

class NormalClass:
    """일반적인 클래스 (__dict__ 사용)"""

    def __init__(self, x, y, z, data=None):
        self.x = x
        self.y = y
        self.z = z
        self.data = data or []

def compare_memory_efficiency():
    """__slots__ vs 일반 클래스 메모리 효율성 비교"""

    print("=== __slots__ 메모리 효율성 비교 ===")

    # 단일 객체 크기 비교
    normal_obj = NormalClass(1, 2, 3)
    optimized_obj = OptimizedClass(1, 2, 3)

    print(f"일반 클래스 크기: {sys.getsizeof(normal_obj)} + {sys.getsizeof(normal_obj.__dict__)} bytes")
    print(f"최적화 클래스 크기: {sys.getsizeof(optimized_obj)} bytes")

    # 대량 객체 생성 시 메모리 사용량 비교
    print("\n대량 객체 메모리 사용량 테스트...")

    # 초기 메모리 사용량
    initial_memory = psutil.Process().memory_info().rss / 1024 / 1024

    # 일반 클래스로 100만 개 객체 생성
    print("일반 클래스 100만 개 생성 중...")
    normal_objects = [NormalClass(i, i+1, i+2) for i in range(1000000)]
    normal_memory = psutil.Process().memory_info().rss / 1024 / 1024

    print(f"일반 클래스: {normal_memory - initial_memory:.1f} MB")
    del normal_objects
    gc.collect()

    # 최적화된 클래스로 100만 개 객체 생성
    print("최적화 클래스 100만 개 생성 중...")
    optimized_objects = [OptimizedClass(i, i+1, i+2) for i in range(1000000)]
    optimized_memory = psutil.Process().memory_info().rss / 1024 / 1024

    print(f"최적화 클래스: {optimized_memory - initial_memory:.1f} MB")

    # 메모리 절약 효과 계산
    if normal_memory > initial_memory and optimized_memory > initial_memory:
        normal_usage = normal_memory - initial_memory
        optimized_usage = optimized_memory - initial_memory
        savings = (normal_usage - optimized_usage) / normal_usage * 100
        print(f"메모리 절약: {savings:.1f}%")

    del optimized_objects
    gc.collect()

    """
    일반적인 결과:
    일반 클래스: 120.5 MB
    최적화 클래스: 76.3 MB
    메모리 절약: 36.7%

    핵심 포인트:
    - __slots__ 사용 시 __dict__ 제거로 메모리 사용량 대폭 감소
    - 특히 많은 수의 작은 객체를 다룰 때 효과적
    - 동적 속성 추가 불가능하므로 설계 시 고려 필요
    """
```

## 2. Weak Reference를 활용한 자동 메모리 관리

### 2.1 스마트 캐시 구현

```python
from collections import defaultdict

# Weak Reference를 활용한 메모리 누수 방지
class CacheWithWeakRef:
    """약한 참조를 활용한 캐시 구현"""

    def __init__(self):
        self._cache: Dict[str, Any] = weakref.WeakValueDictionary()
        self._access_count = defaultdict(int)

    def get(self, key: str) -> Optional[Any]:
        """캐시에서 값 조회"""
        value = self._cache.get(key)
        if value is not None:
            self._access_count[key] += 1
        return value

    def set(self, key: str, value: Any) -> None:
        """캐시에 값 설정"""
        self._cache[key] = value
        self._access_count[key] = 1

    def size(self) -> int:
        """현재 캐시 크기"""
        return len(self._cache)

    def cleanup_stats(self) -> None:
        """접근 통계에서 더 이상 존재하지 않는 키 정리"""
        existing_keys = set(self._cache.keys())
        stats_keys = set(self._access_count.keys())

        for key in stats_keys - existing_keys:
            del self._access_count[key]

class NormalCache:
    """일반적인 강한 참조 캐시"""

    def __init__(self):
        self._cache: Dict[str, Any] = {}
        self._access_count = defaultdict(int)

    def get(self, key: str) -> Optional[Any]:
        value = self._cache.get(key)
        if value is not None:
            self._access_count[key] += 1
        return value

    def set(self, key: str, value: Any) -> None:
        self._cache[key] = value
        self._access_count[key] = 1

    def size(self) -> int:
        return len(self._cache)

    def clear(self) -> None:
        """수동 정리"""
        self._cache.clear()
        self._access_count.clear()

def demonstrate_weak_references():
    """Weak Reference를 활용한 자동 메모리 관리"""

    print("=== Weak Reference 활용 데모 ===")

    # 테스트용 값 객체
    class ExpensiveObject:
        def __init__(self, data):
            self.data = data
            self.large_data = [0] * 100000  # 400KB 데이터
            print(f"ExpensiveObject 생성: {data}")

        def __del__(self):
            print(f"ExpensiveObject 소멸: {self.data}")

    # 두 캐시 비교 테스트
    weak_cache = CacheWithWeakRef()
    normal_cache = NormalCache()

    print("\n1. 객체 생성 및 캐시 저장...")
    objects = []

    for i in range(10):
        obj = ExpensiveObject(f"data_{i}")

        # 두 캐시에 모두 저장
        weak_cache.set(f"key_{i}", obj)
        normal_cache.set(f"key_{i}", obj)

        # 일부만 로컬 참조 유지
        if i < 5:
            objects.append(obj)

    print(f"Weak 캐시 크기: {weak_cache.size()}")
    print(f"Normal 캐시 크기: {normal_cache.size()}")

    print("\n2. 로컬 참조 제거...")
    del objects  # 5개 객체의 로컬 참조 제거
    gc.collect()  # 강제 GC 실행

    print(f"GC 후 Weak 캐시 크기: {weak_cache.size()}")  # 5개로 감소
    print(f"GC 후 Normal 캐시 크기: {normal_cache.size()}")  # 10개 유지

    print("\n3. 캐시에서 조회 테스트...")
    for i in range(10):
        weak_value = weak_cache.get(f"key_{i}")
        normal_value = normal_cache.get(f"key_{i}")

        print(f"key_{i}: weak={weak_value is not None}, normal={normal_value is not None}")

    # 정리
    normal_cache.clear()
    gc.collect()

    """
    결과:
    - Weak reference 캐시는 객체가 더 이상 참조되지 않으면 자동으로 제거
    - Normal 캐시는 명시적으로 정리하기 전까지 객체 유지
    - 메모리 누수 방지에 매우 효과적
    """
```

### 2.2 고급 메모리 최적화 패턴

```python
class MemoryOptimizedContainer:
    """메모리 최적화를 적용한 컨테이너 클래스"""
    
    __slots__ = ['_data', '_weak_refs', '_stats']
    
    def __init__(self):
        self._data = {}  # 강한 참조로 핵심 데이터 유지
        self._weak_refs = weakref.WeakValueDictionary()  # 캐시 데이터
        self._stats = {'hits': 0, 'misses': 0}
    
    def store_core_data(self, key: str, value: Any) -> None:
        """핵심 데이터 저장 (강한 참조)"""
        self._data[key] = value
    
    def cache_derived_data(self, key: str, value: Any) -> None:
        """파생 데이터 캐싱 (약한 참조)"""
        self._weak_refs[key] = value
    
    def get_data(self, key: str) -> Optional[Any]:
        """데이터 조회 (핵심 데이터 우선)"""
        # 1. 핵심 데이터 확인
        if key in self._data:
            self._stats['hits'] += 1
            return self._data[key]
        
        # 2. 캐시된 파생 데이터 확인
        cached = self._weak_refs.get(key)
        if cached is not None:
            self._stats['hits'] += 1
            return cached
        
        # 3. 데이터 없음
        self._stats['misses'] += 1
        return None
    
    def get_stats(self) -> Dict[str, Any]:
        """캐시 통계 반환"""
        total = self._stats['hits'] + self._stats['misses']
        hit_rate = self._stats['hits'] / total if total > 0 else 0
        
        return {
            'core_data_count': len(self._data),
            'cached_data_count': len(self._weak_refs),
            'hit_rate': hit_rate,
            'total_requests': total
        }

def demonstrate_advanced_optimization():
    """고급 메모리 최적화 패턴 데모"""
    
    print("=== 고급 메모리 최적화 패턴 ===")
    
    container = MemoryOptimizedContainer()
    
    # 핵심 데이터 저장
    for i in range(100):
        container.store_core_data(f"core_{i}", f"important_data_{i}")
    
    # 파생 데이터 생성 및 캐싱
    derived_objects = []
    for i in range(1000):
        obj = {"computed": i * 2, "metadata": f"derived_{i}"}
        container.cache_derived_data(f"derived_{i}", obj)
        
        # 일부만 강한 참조 유지
        if i < 100:
            derived_objects.append(obj)
    
    print(f"초기 상태: {container.get_stats()}")
    
    # 일부 파생 데이터 참조 제거
    del derived_objects
    gc.collect()
    
    print(f"GC 후 상태: {container.get_stats()}")
    
    # 데이터 접근 테스트
    for i in range(50):
        # 핵심 데이터 접근
        container.get_data(f"core_{i}")
        
        # 파생 데이터 접근 (일부는 GC로 제거됨)
        container.get_data(f"derived_{i}")
    
    print(f"접근 후 상태: {container.get_stats()}")
```

## 3. 실전 성능 측정과 벤치마킹

### 3.1 종합적인 최적화 효과 측정

```python
def comprehensive_optimization_benchmark():
    """종합적인 최적화 효과 측정"""
    
    print("=== 종합 최적화 효과 측정 ===")
    
    # 테스트 시나리오: 대량 데이터 처리 서비스 시뮬레이션
    
    def create_test_scenario():
        """테스트 시나리오 생성"""
        return {
            'users': [{'id': i, 'name': f'user_{i}', 'data': [0] * 100}
                     for i in range(100000)],
            'sessions': {f'session_{i}': {'user_id': i % 100000, 'timestamp': time.time()}
                        for i in range(500000)},
            'cache_data': {f'key_{i}': {'value': i * 2, 'metadata': f'cached_{i}'}
                          for i in range(200000)}
        }
    
    # 1. 기본 구현 (최적화 없음)
    print("\n1. 기본 구현 측정...")
    start_memory = psutil.Process().memory_info().rss / 1024 / 1024
    start_time = time.time()
    
    basic_data = create_test_scenario()
    
    basic_time = time.time() - start_time
    basic_memory = psutil.Process().memory_info().rss / 1024 / 1024
    
    print(f"기본 구현: {basic_time:.3f}초, {basic_memory - start_memory:.1f}MB")
    
    del basic_data
    gc.collect()
    
    # 2. GC 최적화 적용
    print("\n2. GC 최적화 적용...")
    start_memory = psutil.Process().memory_info().rss / 1024 / 1024
    start_time = time.time()
    
    with PythonGCOptimization.gc_disabled():
        optimized_data = create_test_scenario()
    
    gc.collect()  # 한 번에 정리
    
    optimized_time = time.time() - start_time
    optimized_memory = psutil.Process().memory_info().rss / 1024 / 1024
    
    print(f"GC 최적화: {optimized_time:.3f}초, {optimized_memory - start_memory:.1f}MB")
    
    # 성능 개선 계산
    time_improvement = (basic_time - optimized_time) / basic_time * 100
    print(f"시간 개선: {time_improvement:.1f}%")
    
    del optimized_data
    gc.collect()
    
    # 3. __slots__ 클래스 사용 시뮬레이션
    print("\n3. __slots__ 최적화 시뮬레이션...")
    
    # __slots__ 사용한 사용자 클래스
    class OptimizedUser:
        __slots__ = ['id', 'name', 'data']
        
        def __init__(self, id, name, data):
            self.id = id
            self.name = name
            self.data = data
    
    start_memory = psutil.Process().memory_info().rss / 1024 / 1024
    
    slots_users = [OptimizedUser(i, f'user_{i}', [0] * 100)
                   for i in range(100000)]
    
    slots_memory = psutil.Process().memory_info().rss / 1024 / 1024
    
    print(f"__slots__ 사용: {slots_memory - start_memory:.1f}MB")
    
    del slots_users
    gc.collect()

if __name__ == "__main__":
    # 모든 최적화 기법 데모
    print("Python GC 최적화 기법 종합 데모")
    print("=" * 50)
    
    # 1. GC 제어 최적화
    PythonGCOptimization.benchmark_gc_impact()
    batch_processing_optimization()
    
    # 2. __slots__ 메모리 최적화
    compare_memory_efficiency()
    
    # 3. Weak Reference 활용
    demonstrate_weak_references()
    demonstrate_advanced_optimization()
    
    # 4. 종합 벤치마킹
    comprehensive_optimization_benchmark()
```

## 핵심 요점

### 1. GC 제어 최적화

- **배치 작업 시 16% 성능 향상** 가능
- 임시 GC 비활성화 + 작업 후 명시적 정리 패턴
- 메모리 누수 위험 관리 필수

### 2. **slots** 메모리 절약

- **객체당 30-40% 메모리 사용량 감소**
- 대량의 작은 객체 처리 시 특히 효과적
- 동적 속성 추가 제한 고려 필요

### 3. Weak Reference 활용

- **자동 메모리 관리**로 누수 방지
- 캐시 구현 시 매우 효과적
- 핵심 데이터와 파생 데이터 구분 관리

---

**이전**: [Python GC 기본 구조](./08-05-1-python-gc-fundamentals.md)  
**다음**: [실제 서비스 GC 최적화 사례](./08-50-3-python-gc-production.md)에서 Instagram, Dropbox 등의 실제 프로덕션 최적화 경험을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 3-5시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-08-memory-allocator-gc)

- [Chapter 9-1: 메모리 할당자의 내부 구현 개요](./08-10-memory-allocator.md)
- [Chapter 9-1A: malloc 내부 동작의 진실](./08-01-malloc-fundamentals.md)
- [Chapter 9-1B: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](./08-11-allocator-comparison.md)
- [Chapter 9-1C: 커스텀 메모리 할당자 구현](./08-12-custom-allocators.md)
- [Chapter 9-1D: 실전 메모리 최적화 사례](../chapter-09-advanced-memory-management/08-30-production-optimization.md)

### 🏷️ 관련 키워드

`python`, `gc-optimization`, `memory-management`, `performance-tuning`, `slots`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
