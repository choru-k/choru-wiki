---
tags:
  - balanced
  - cycle-detection
  - fundamentals
  - garbage-collection
  - medium-read
  - memory-profiling
  - python-gc
  - reference-counting
  - 애플리케이션개발
difficulty: FUNDAMENTALS
learning_time: "3-4시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 8.3.3: Python GC 기초

## 🎯 이 문서에서 배울 핵심 내용

Python의 독특한 이중 가비지 컬렉션 시스템을 완전히 이해하고, 메모리 프로파일링을 통해 실제 동작을 관찰해보겠습니다:

1.**Reference Counting의 즉시 해제**- Python 객체 대부분이 해제되는 핵심 메커니즘
2.**Cycle Detection의 순환 참조 해결**- 복잡한 객체 관계에서의 메모리 정리
3.**Generational GC의 3세대 시스템**- 객체 수명에 따른 효율적 메모리 관리
4.**메모리 프로파일링 실전 기법**- tracemalloc과 objgraph를 활용한 실제 분석

## 1. Python GC의 이중 구조: Reference Counting + Cycle Detection

### 1.1 Python GC의 독특한 설계

```python
import gc
import sys
import weakref
import tracemalloc
from collections import defaultdict

# Python GC = Reference Counting (기본) + Generational GC (순환 참조 해결)
"""
Python 메모리 관리의 두 축:

1. Reference Counting (즉시 해제)
   - 참조 카운트가 0이 되면 즉시 __del__ 호출
   - 대부분의 객체가 이 방식으로 해제됨
   - 빠르고 예측 가능하지만 순환 참조 해결 불가

2. Cycle Detection (주기적 실행)
   - 3세대 generational GC
   - 순환 참조된 객체들만 별도로 수집
   - 상대적으로 무거운 작업
"""

class PythonGCDemo:
    """Python GC 동작 방식을 이해하기 위한 예제 클래스"""

    def __init__(self, name):
        self.name = name
        self.data = [0] * 1000000  # 1M integers (~4MB)
        print(f"객체 생성: {self.name} (id: {id(self)})")

    def __del__(self):
        """소멸자 - Reference Count가 0이 될 때 즉시 호출"""
        print(f"객체 소멸: {self.name} (id: {id(self)})")

def demonstrate_reference_counting():
    """Python의 기본 메커니즘: Reference Counting"""

    print("=== Reference Counting 데모 ===")

    # 객체 생성과 참조 카운트 추적
    obj = PythonGCDemo("test_object")
    print(f"초기 참조 카운트: {sys.getrefcount(obj) - 1}")  # -1: getrefcount 자체 참조 제외

    # 참조 증가
    ref1 = obj
    print(f"ref1 추가 후: {sys.getrefcount(obj) - 1}")  # 2

    ref2 = obj
    print(f"ref2 추가 후: {sys.getrefcount(obj) - 1}")  # 3

    # 참조 감소
    del ref1
    print(f"ref1 삭제 후: {sys.getrefcount(obj) - 1}")  # 2

    del ref2
    print(f"ref2 삭제 후: {sys.getrefcount(obj) - 1}")  # 1

    # 마지막 참조 제거 - 즉시 __del__ 호출됨
    del obj
    print("obj 삭제 완료 - __del__ 즉시 호출됨")

    """
    출력 예시:
    객체 생성: test_object (id: 140234567890123)
    초기 참조 카운트: 1
    ref1 추가 후: 2
    ref2 추가 후: 3
    ref1 삭제 후: 2
    ref2 삭제 후: 1
    객체 소멸: test_object (id: 140234567890123)
    obj 삭제 완료 - __del__ 즉시 호출됨
    """

def demonstrate_circular_reference():
    """순환 참조 문제와 Cycle Detector의 역할"""

    print("\n=== 순환 참조 데모 ===")

    class Node:
        def __init__(self, value):
            self.value = value
            self.ref = None
            print(f"Node 생성: {value}")

        def __del__(self):
            print(f"Node 소멸: {self.value}")

    # GC 통계 초기값
    initial_objects = len(gc.get_objects())
    print(f"초기 객체 수: {initial_objects}")

    # 순환 참조 생성
    print("\n순환 참조 생성...")
    a = Node(1)
    b = Node(2)
    a.ref = b
    b.ref = a  # 순환 참조 완성!

    print(f"순환 참조 생성 후 객체 수: {len(gc.get_objects())}")

    # 로컬 참조 제거 - 하지만 순환 참조로 인해 해제되지 않음
    print("\n로컬 참조 제거...")
    del a
    del b
    print("del a, b 완료 - 하지만 __del__ 호출되지 않음 (순환 참조)")

    print(f"로컬 참조 제거 후 객체 수: {len(gc.get_objects())}")

    # Cycle Detector 수동 실행
    print("\n수동 GC 실행...")
    collected = gc.collect()  # 순환 참조 해결
    print(f"수집된 객체 수: {collected}")
    print(f"GC 후 객체 수: {len(gc.get_objects())}")

    """
    핵심 포인트:
    - Reference Counting만으로는 순환 참조 해결 불가
    - Cycle Detector가 주기적으로 실행되어 순환 참조 탐지
    - 실제 서비스에서는 이런 패턴이 메모리 누수의 주요 원인
    """

def analyze_gc_generations():
    """Python의 3세대 Generational GC 분석"""

    print("\n=== Generational GC 분석 ===")

    # 현재 GC 설정 확인
    thresholds = gc.get_threshold()
    print(f"GC 임계값: {thresholds}")
    """
    기본값: (700, 10, 10)
    - Gen0: 700개 객체 할당 시 GC 실행
    - Gen1: Gen0 GC가 10번 실행되면 Gen1 GC 실행
    - Gen2: Gen1 GC가 10번 실행되면 Gen2 GC 실행 (전체)
    """

    # 각 세대별 현재 객체 수와 임계값 상태
    counts = gc.get_count()
    print(f"현재 카운트: {counts}")
    print(f"Gen0: {counts[0]}/{thresholds[0]} (다음 GC까지 {thresholds[0] - counts[0]})")
    print(f"Gen1: {counts[1]}/{thresholds[1]}")
    print(f"Gen2: {counts[2]}/{thresholds[2]}")

    # 각 세대별 객체 수 확인
    for generation in range(3):
        objects = gc.get_objects(generation)
        print(f"Generation {generation}: {len(objects)} objects")

        # 객체 타입별 분류 (상위 5개)
        type_count = defaultdict(int)
        for obj in objects:
            type_count[type(obj).__name__] += 1

        print(f"  주요 타입: {dict(sorted(type_count.items(), key=lambda x: x[1], reverse=True)[:5])}")

    # GC 통계 확인
    stats = gc.get_stats()
    for i, stat in enumerate(stats):
        print(f"Generation {i} 통계: collections={stat['collections']}, "
              f"collected={stat['collected']}, uncollectable={stat['uncollectable']}")

def customize_gc_behavior():
    """GC 동작 커스터마이징"""

    print("\n=== GC 동작 커스터마이징 ===")

    # 원래 설정 백업
    original_threshold = gc.get_threshold()
    original_enabled = gc.isenabled()

    # GC 임계값 조정 - 더 자주 실행
    gc.set_threshold(500, 5, 5)  # 기본값보다 더 적극적
    print(f"새로운 임계값 설정: {gc.get_threshold()}")

    # 특정 세대만 수집
    print("\n세대별 개별 수집:")
    before_gen0 = gc.collect(0)  # Gen0만 수집
    print(f"Gen0 수집 결과: {before_gen0}개 객체")

    before_gen1 = gc.collect(1)  # Gen0, Gen1 수집
    print(f"Gen0+1 수집 결과: {before_gen1}개 객체")

    before_gen2 = gc.collect(2)  # 전체 수집
    print(f"전체 수집 결과: {before_gen2}개 객체")

    # 원래 설정 복구
    gc.set_threshold(*original_threshold)
    if not original_enabled:
        gc.disable()

    print(f"설정 복구 완료: {gc.get_threshold()}")
```

## 2. 메모리 프로파일링과 누수 탐지

### 2.1 종합적인 메모리 분석 도구

```python
import tracemalloc
import psutil
import os
import time
from memory_profiler import profile  # pip install memory-profiler
import objgraph  # pip install objgraph

class MemoryProfiler:
    """종합적인 메모리 프로파일링 도구"""

    def __init__(self):
        self.initial_memory = None
        self.snapshots = []

    def start_tracing(self):
        """메모리 추적 시작"""
        tracemalloc.start(10)  # 최대 10 프레임까지 스택 추적
        self.initial_memory = self.get_memory_usage()
        print(f"메모리 추적 시작: {self.initial_memory:.2f} MB")

    def get_memory_usage(self):
        """현재 프로세스의 메모리 사용량 (MB)"""
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / 1024 / 1024

    def take_snapshot(self, label):
        """현재 메모리 상태 스냅샷"""
        if not tracemalloc.is_tracing():
            print("tracemalloc이 시작되지 않았습니다.")
            return

        snapshot = tracemalloc.take_snapshot()
        current_memory = self.get_memory_usage()

        self.snapshots.append({
            'label': label,
            'snapshot': snapshot,
            'memory': current_memory,
            'time': time.time()
        })

        print(f"스냅샷 '{label}': {current_memory:.2f} MB "
              f"(+{current_memory - self.initial_memory:.2f} MB)")

    def analyze_top_allocations(self, snapshot_label, top_n=10):
        """특정 스냅샷의 상위 메모리 할당 분석"""
        snapshot_data = None
        for snap in self.snapshots:
            if snap['label'] == snapshot_label:
                snapshot_data = snap
                break

        if not snapshot_data:
            print(f"스냅샷 '{snapshot_label}'을 찾을 수 없습니다.")
            return

        print(f"\n=== '{snapshot_label}' 상위 {top_n}개 메모리 할당 ===")
        top_stats = snapshot_data['snapshot'].statistics('lineno')

        for index, stat in enumerate(top_stats[:top_n]):
            print(f"{index + 1:2d}. {stat.size / 1024 / 1024:.2f} MB: {stat.traceback}")

    def compare_snapshots(self, label1, label2):
        """두 스냅샷 간 메모리 사용량 변화 비교"""
        snap1 = snap2 = None

        for snap in self.snapshots:
            if snap['label'] == label1:
                snap1 = snap
            elif snap['label'] == label2:
                snap2 = snap

        if not snap1 or not snap2:
            print("스냅샷을 찾을 수 없습니다.")
            return

        print(f"\n=== '{label1}' vs '{label2}' 메모리 변화 ===")

        # 전체 메모리 변화
        memory_diff = snap2['memory'] - snap1['memory']
        print(f"전체 메모리 변화: {memory_diff:+.2f} MB")

        # 세부 할당 변화 (tracemalloc)
        top_stats = snap2['snapshot'].compare_to(snap1['snapshot'], 'lineno')

        print("주요 메모리 증가 지점:")
        for stat in top_stats[:5]:
            if stat.size_diff > 0:
                print(f"  +{stat.size_diff / 1024 / 1024:.2f} MB "
                      f"({stat.count_diff:+} allocations): {stat.traceback}")

        print("주요 메모리 감소 지점:")
        for stat in reversed(top_stats[-5:]):
            if stat.size_diff < 0:
                print(f"  {stat.size_diff / 1024 / 1024:.2f} MB "
                      f"({stat.count_diff:+} allocations): {stat.traceback}")

def demonstrate_memory_profiling():
    """실제 메모리 프로파일링 예제"""

    profiler = MemoryProfiler()
    profiler.start_tracing()

    # 기준점
    profiler.take_snapshot("baseline")

    # 대량 데이터 할당
    print("\n대량 데이터 할당 중...")
    large_data = []
    for i in range(100000):
        large_data.append({
            "id": i,
            "data": f"item_{i}" * 10,  # 문자열 데이터
            "nested": {"value": i, "metadata": [i, i*2, i*3]}
        })

    profiler.take_snapshot("after_allocation")

    # 일부 데이터 해제
    print("일부 데이터 해제 중...")
    large_data = large_data[::2]  # 절반만 유지
    gc.collect()  # 명시적 GC 실행

    profiler.take_snapshot("after_partial_cleanup")

    # 전체 해제
    print("전체 데이터 해제 중...")
    del large_data
    gc.collect()

    profiler.take_snapshot("after_full_cleanup")

    # 분석 결과 출력
    profiler.analyze_top_allocations("after_allocation")
    profiler.compare_snapshots("baseline", "after_allocation")
    profiler.compare_snapshots("after_allocation", "after_full_cleanup")
```

### 2.2 메모리 누수 패턴 시뮬레이션

```python
# 메모리 누수 패턴 시뮬레이션
def simulate_memory_leak():
    """일반적인 메모리 누수 패턴들"""

    print("\n=== 메모리 누수 패턴 시뮬레이션 ===")

    # 패턴 1: 전역 컨테이너에 계속 추가
    global_cache = {}

    def leaky_cache_pattern():
        """캐시에서 제거하지 않는 패턴"""
        for i in range(10000):
            key = f"key_{i}"
            global_cache[key] = {
                "data": [0] * 1000,
                "timestamp": time.time()
            }
        print(f"전역 캐시 크기: {len(global_cache)}")

    # 패턴 2: 순환 참조 + __del__ 메서드
    class ProblematicClass:
        def __init__(self, name):
            self.name = name
            self.circular_ref = self

        def __del__(self):
            # __del__이 있는 객체의 순환 참조는 해제가 어려움
            print(f"ProblematicClass {self.name} __del__ 호출")

    def problematic_circular_refs():
        """문제가 되는 순환 참조 패턴"""
        objects = []
        for i in range(1000):
            obj = ProblematicClass(f"obj_{i}")
            objects.append(obj)
        return objects

    # 패턴 3: 클로저에 의한 의도치 않은 참조 유지
    def closure_leak_pattern():
        """클로저로 인한 메모리 누수"""
        large_data = [0] * 1000000  # 4MB 데이터

        def inner_function(x):
            # large_data를 직접 사용하지 않지만 클로저로 캡처됨
            return x + 1

        return inner_function  # large_data가 함께 유지됨!

    # 각 패턴 실행
    print("1. 캐시 누수 패턴 실행...")
    leaky_cache_pattern()

    print("2. 순환 참조 패턴 실행...")
    problematic_objects = problematic_circular_refs()

    print("3. 클로저 누수 패턴 실행...")
    leaked_functions = [closure_leak_pattern() for _ in range(100)]

    # 객체 그래프 분석 (objgraph 사용)
    print("\n=== 객체 그래프 분석 ===")
    print("가장 많은 객체 타입들:")
    objgraph.show_most_common_types(limit=10)

    # 메모리 정리 시도
    print("\n메모리 정리 시도...")
    del problematic_objects
    del leaked_functions
    global_cache.clear()

    collected = gc.collect()
    print(f"GC로 수집된 객체: {collected}개")

    print("정리 후 객체 타입들:")
    objgraph.show_most_common_types(limit=10)
```

## 3. 실전 연습과 분석

### 3.1 Python GC 동작 관찰 실습

```python
def hands_on_gc_observation():
    """Python GC 동작을 직접 관찰하는 실습"""
    
    print("=== Python GC 실전 관찰 실습 ===")
    
    # 1. 기본 Reference Counting 확인
    print("\n1. Reference Counting 기본 동작")
    demonstrate_reference_counting()
    
    # 2. 순환 참조 문제 체험
    print("\n2. 순환 참조와 Cycle Detection")
    demonstrate_circular_reference()
    
    # 3. Generational GC 분석
    print("\n3. 세대별 GC 시스템 이해")
    analyze_gc_generations()
    
    # 4. 메모리 프로파일링 실전
    print("\n4. 실제 메모리 사용량 추적")
    demonstrate_memory_profiling()
    
    # 5. 메모리 누수 패턴 체험
    print("\n5. 일반적인 메모리 누수 시나리오")
    simulate_memory_leak()

if __name__ == "__main__":
    hands_on_gc_observation()
```

## 핵심 요점

### 1. Python GC의 이중 구조 이해

-**Reference Counting**: 대부분 객체의 즉시 해제 담당 (90%+)
-**Cycle Detection**: 순환 참조 해결 전담 (주기적 실행)

### 2. Generational GC의 효율성

-**Gen0**: 신생 객체, 자주 수집 (700개마다)
-**Gen1/Gen2**: 오래된 객체, 덜 자주 수집 (10배 주기)

### 3. 메모리 누수의 주요 패턴

-**전역 컨테이너 누적**: 캐시, 싱글톤 패턴에서 자주 발생
-**순환 참조**: 특히**del**메서드가 있는 경우 해제 어려움
-**클로저 캡처**: 의도치 않은 대용량 데이터 참조 유지

---

**다음**: [Python GC 최적화 전략과 기법](./08-03-05-python-gc-optimization.md)에서 실전 메모리 최적화 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: FUNDAMENTALS
-**주제**: 애플리케이션 개발
-**예상 시간**: 3-4시간

### 🎯 학습 경로

- [📚 FUNDAMENTALS 레벨 전체 보기](../learning-paths/fundamentals/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-08-memory-allocator-gc)

- [8.1.2: 메모리 할당자의 내부 구현 개요](./08-01-02-memory-allocator.md)
- [8.1.1: malloc 내부 동작의 진실](./08-01-01-malloc-fundamentals.md)
- [8.1.3: 메모리 할당자 대전: tcmalloc vs jemalloc vs mimalloc](./08-01-03-allocator-comparison.md)
- [8.1.4: 커스텀 메모리 할당자 구현](./08-01-04-custom-allocators.md)
- [Production: 실전 메모리 최적화 사례](../chapter-09-advanced-memory-management/08-30-production-optimization.md)

### 🏷️ 관련 키워드

`python-gc`, `reference-counting`, `cycle-detection`, `memory-profiling`, `garbage-collection`

### ⏭️ 다음 단계 가이드

- 기초 개념을 충분히 이해한 후 INTERMEDIATE 레벨로 진행하세요
- 실습 위주의 학습을 권장합니다
