---
tags:
  - advanced
  - cpu_affinity
  - deep-study
  - hands-on
  - numa_topology
  - performance_optimization
  - python_system_programming
  - workload_analysis
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 1.6.1: Python 고급 매니저

## 지능형 워크로드 분석과 자동 최적화

Bash 스크립트의 한계를 뛰어넘어, Python의 데이터 분석 능력을 활용한 정교한 CPU 친화도 관리 도구를 구현합니다.

## 고급 CPU 친화도 관리 시스템

```python
#!/usr/bin/env python3
# advanced_cpu_affinity_manager.py

import os
import sys
import time
import psutil
import threading
import subprocess
import json
from collections import defaultdict, namedtuple
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
import numpy as np

@dataclass
class CPUInfo:
    id: int
    physical_id: int
    core_id: int
    numa_node: int
    frequency: float
    cache_size: Dict[str, int]
    siblings: List[int]

@dataclass
class ProcessStats:
    pid: int
    name: str
    cpu_percent: float
    memory_percent: float
    num_threads: int
    cpu_affinity: List[int]
    current_cpu: int
    migrations: int
    context_switches: int

class CPUAffinityManager:
    def __init__(self):
        self.cpu_info = self._collect_cpu_info()
        self.numa_topology = self._get_numa_topology()
        self.performance_history = defaultdict(list)

    def _collect_cpu_info(self) -> List[CPUInfo]:
        """CPU 정보 수집"""
        cpus = []
        # ⭐ 1단계: psutil로 논리적 CPU 개수 확인
        # - logical=True: 하이퍼스레딩 포함 논리적 코어 수
        cpu_count = psutil.cpu_count(logical=True)

        # ⭐ 2단계: 각 CPU에 대해 상세 정보 수집
        for cpu_id in range(cpu_count):
            # ⭐ 3단계: /sys 파일시스템에서 CPU 토폴로지 정보 수집
            # - sysfs: 커널 오브젝트와 속성을 파일시스템으로 노출
            cpu_path = f"/sys/devices/system/cpu/cpu{cpu_id}"

            # ⭐ 4단계: 물리적 CPU 패키지와 코어 ID 수집
            try:
                # physical_package_id: 물리적 CPU 소켓 번호
                with open(f"{cpu_path}/topology/physical_package_id") as f:
                    physical_id = int(f.read().strip())
                # core_id: 해당 패키지 내에서의 코어 번호
                with open(f"{cpu_path}/topology/core_id") as f:
                    core_id = int(f.read().strip())
                # thread_siblings_list: 같은 물리적 코어를 공유하는 논리적 CPU들
                with open(f"{cpu_path}/topology/thread_siblings_list") as f:
                    siblings = [int(x) for x in f.read().strip().split(',')]
            except (FileNotFoundError, ValueError):
                # ⭐ 5단계: sysfs 정보를 읽을 수 없는 경우 기본값 설정
                physical_id = core_id = 0
                siblings = [cpu_id]

            # ⭐ 6단계: NUMA 노드 정보 수집
            numa_node = self._get_cpu_numa_node(cpu_id)

            # ⭐ 7단계: CPU 주파수 정보 수집
            try:
                # scaling_cur_freq: 현재 동작 주파수 (kHz)
                with open(f"{cpu_path}/cpufreq/scaling_cur_freq") as f:
                    frequency = float(f.read().strip()) / 1000  # MHz로 변환
            except (FileNotFoundError, ValueError):
                frequency = 0.0  # 주파수 정보 없음

            # ⭐ 8단계: CPU 캐시 계층 정보 수집
            cache_info = self._get_cache_info(cpu_id)

            # ⭐ 9단계: CPUInfo 데이터클래스로 정보 구조화
            cpus.append(CPUInfo(
                id=cpu_id,
                physical_id=physical_id,
                core_id=core_id,
                numa_node=numa_node,
                frequency=frequency,
                cache_size=cache_info,
                siblings=siblings
            ))

        return cpus

    def _get_cpu_numa_node(self, cpu_id: int) -> int:
        """CPU의 NUMA 노드 확인"""
        try:
            with open(f"/sys/devices/system/cpu/cpu{cpu_id}/node") as f:
                return int(f.read().strip())
        except (FileNotFoundError, ValueError):
            return 0

    def _get_cache_info(self, cpu_id: int) -> Dict[str, int]:
        """CPU 캐시 정보 수집"""
        cache_info = {}
        cache_path = f"/sys/devices/system/cpu/cpu{cpu_id}/cache"

        try:
            for index_dir in os.listdir(cache_path):
                if index_dir.startswith('index'):
                    level_file = f"{cache_path}/{index_dir}/level"
                    size_file = f"{cache_path}/{index_dir}/size"
                    type_file = f"{cache_path}/{index_dir}/type"

                    try:
                        with open(level_file) as f:
                            level = f.read().strip()
                        with open(size_file) as f:
                            size_str = f.read().strip()
                        with open(type_file) as f:
                            cache_type = f.read().strip()

                        # 크기를 바이트로 변환
                        size_bytes = self._parse_size(size_str)
                        cache_key = f"L{level}_{cache_type}"
                        cache_info[cache_key] = size_bytes
                    except (FileNotFoundError, ValueError):
                        continue
        except FileNotFoundError:
            pass

        return cache_info

    def _parse_size(self, size_str: str) -> int:
        """크기 문자열을 바이트로 변환"""
        size_str = size_str.upper()
        if 'K' in size_str:
            return int(size_str.replace('K', '')) * 1024
        elif 'M' in size_str:
            return int(size_str.replace('M', '')) * 1024 * 1024
        else:
            return int(size_str)

    def _get_numa_topology(self) -> Dict[int, List[int]]:
        """NUMA 토폴로지 정보 수집"""
        numa_topology = defaultdict(list)

        for cpu in self.cpu_info:
            numa_topology[cpu.numa_node].append(cpu.id)

        return dict(numa_topology)

    def get_process_stats(self, pid: int) -> Optional[ProcessStats]:
        """프로세스 통계 수집"""
        try:
            process = psutil.Process(pid)

            # 현재 실행 중인 CPU 확인
            current_cpu = self._get_current_cpu(pid)

            # 마이그레이션 횟수 (컨텍스트 스위치로 추정)
            ctx_switches = process.num_ctx_switches()
            migrations = ctx_switches.voluntary + ctx_switches.involuntary

            return ProcessStats(
                pid=pid,
                name=process.name(),
                cpu_percent=process.cpu_percent(),
                memory_percent=process.memory_percent(),
                num_threads=process.num_threads(),
                cpu_affinity=process.cpu_affinity(),
                current_cpu=current_cpu,
                migrations=migrations,
                context_switches=ctx_switches.voluntary + ctx_switches.involuntary
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None

    def _get_current_cpu(self, pid: int) -> int:
        """현재 실행 중인 CPU 확인"""
        try:
            with open(f"/proc/{pid}/stat") as f:
                fields = f.read().split()
                return int(fields[38])  # processor field
        except (FileNotFoundError, ValueError, IndexError):
            return -1

    def analyze_workload_pattern(self, pid: int, duration: int = 60) -> Dict:
        """워크로드 패턴 분석"""
        print(f"프로세스 {pid}의 워크로드 패턴을 {duration}초간 분석 중...")

        # ⭐ 1단계: 데이터 수집을 위한 리스트 초기화
        cpu_usage_history = []        # CPU 사용률 시계열 데이터
        memory_usage_history = []     # 메모리 사용률 시계열 데이터
        migration_history = []        # CPU 마이그레이션 발생 회수
        cache_miss_indicators = []    # 캐시 미스 추정 지표

        # ⭐ 2단계: 모니터링 시작 시간 기록 및 상태 변수 초기화
        start_time = time.time()
        prev_migrations = 0  # 이전 마이그레이션 카운트 (델타 계산용)

        # ⭐ 3단계: 지정된 시간 동안 주기적 데이터 수집
        while time.time() - start_time < duration:
            stats = self.get_process_stats(pid)
            if not stats:
                print("프로세스가 종료되었습니다.")
                break

            # ⭐ 4단계: 기본 시스템 메트릭 수집
            cpu_usage_history.append(stats.cpu_percent)
            memory_usage_history.append(stats.memory_percent)

            # ⭐ 5단계: CPU 마이그레이션 델타 계산
            # - 전체 마이그레이션 카운트에서 이전 카운트를 뺀 증가분 계산
            migration_delta = stats.migrations - prev_migrations
            migration_history.append(migration_delta)
            prev_migrations = stats.migrations

            # ⭐ 6단계: 캐시 미스 간접 추정 로직
            # - 가설: 마이그레이션 발생 + 낮은 CPU 사용률 = 캐시 미스로 인한 성능 저하
            # - CPU 친화도 설정의 필요성을 나타내는 지표
            if migration_delta > 0 and stats.cpu_percent < 50:
                cache_miss_indicators.append(1)  # 캐시 미스 가능성 높음
            else:
                cache_miss_indicators.append(0)  # 정상 상태

            time.sleep(1)  # 1초 간격으로 샘플링

        # ⭐ 7단계: 수집된 데이터를 기반으로 종합 분석 결과 생성
        analysis = {
            'avg_cpu_usage': np.mean(cpu_usage_history) if cpu_usage_history else 0,
            'max_cpu_usage': np.max(cpu_usage_history) if cpu_usage_history else 0,
            'cpu_variance': np.var(cpu_usage_history) if cpu_usage_history else 0,  # CPU 사용률 변동성
            'avg_memory_usage': np.mean(memory_usage_history) if memory_usage_history else 0,
            'total_migrations': sum(migration_history),
            'migration_rate': sum(migration_history) / duration,  # 초당 마이그레이션 횟수
            'cache_miss_ratio': np.mean(cache_miss_indicators) if cache_miss_indicators else 0,
            # ⭐ 8단계: 다차원 메트릭 기반 워크로드 분류
            'workload_type': self._classify_workload(
                np.mean(cpu_usage_history) if cpu_usage_history else 0,
                np.var(cpu_usage_history) if cpu_usage_history else 0,
                sum(migration_history) / duration,
                np.mean(cache_miss_indicators) if cache_miss_indicators else 0
            )
        }

        return analysis

    def _classify_workload(self, avg_cpu: float, cpu_variance: float,
                          migration_rate: float, cache_miss_ratio: float) -> str:
        """워크로드 타입 분류"""
        if avg_cpu > 80:
            if cpu_variance < 100:
                return "cpu_intensive_steady"  # CPU 집약적, 안정적
            else:
                return "cpu_intensive_bursty"  # CPU 집약적, 버스트
        elif migration_rate > 5:
            return "migration_heavy"  # 마이그레이션 많음
        elif cache_miss_ratio > 0.3:
            return "cache_sensitive"  # 캐시 민감
        elif avg_cpu < 20:
            return "io_bound"  # I/O 바운드
        else:
            return "balanced"  # 균형잡힌 워크로드

    def recommend_cpu_affinity(self, pid: int, workload_analysis: Dict) -> List[int]:
        """워크로드 분석 기반 CPU 친화도 추천"""
        workload_type = workload_analysis['workload_type']

        if workload_type == "cpu_intensive_steady":
            # 전용 물리적 코어 할당
            return self._get_dedicated_physical_cores(1)

        elif workload_type == "cpu_intensive_bursty":
            # 하이퍼스레딩 코어 포함 할당
            return self._get_physical_cores_with_siblings(1)

        elif workload_type == "migration_heavy":
            # 단일 NUMA 노드에 고정
            return self.numa_topology[0][:2]  # 첫 번째 NUMA 노드의 처음 2개 코어

        elif workload_type == "cache_sensitive":
            # 같은 L3 캐시를 공유하는 코어들
            return self._get_cache_sharing_cores()

        elif workload_type == "io_bound":
            # 에너지 효율적인 코어 (낮은 주파수)
            return self._get_low_frequency_cores()

        else:  # balanced
            # 기본 할당: 첫 번째 NUMA 노드의 절반
            numa0_cpus = self.numa_topology[0]
            return numa0_cpus[:len(numa0_cpus)//2]

    def _get_dedicated_physical_cores(self, count: int) -> List[int]:
        """전용 물리적 코어 반환"""
        physical_cores = {}
        for cpu in self.cpu_info:
            if cpu.physical_id not in physical_cores:
                physical_cores[cpu.physical_id] = []
            physical_cores[cpu.physical_id].append(cpu.id)

        result = []
        for cores in list(physical_cores.values())[:count]:
            result.append(min(cores))  # 각 물리적 코어의 첫 번째 논리적 코어

        return result

    def _get_physical_cores_with_siblings(self, count: int) -> List[int]:
        """하이퍼스레딩 포함 물리적 코어 반환"""
        physical_cores = {}
        for cpu in self.cpu_info:
            if cpu.physical_id not in physical_cores:
                physical_cores[cpu.physical_id] = []
            physical_cores[cpu.physical_id].extend(cpu.siblings)

        result = []
        for cores in list(physical_cores.values())[:count]:
            result.extend(cores)

        return sorted(list(set(result)))

    def _get_cache_sharing_cores(self) -> List[int]:
        """L3 캐시를 공유하는 코어들 반환"""
        # 간단히 같은 물리적 패키지의 처음 4개 코어 반환
        return [cpu.id for cpu in self.cpu_info if cpu.physical_id == 0][:4]

    def _get_low_frequency_cores(self) -> List[int]:
        """낮은 주파수 코어들 반환"""
        sorted_cpus = sorted(self.cpu_info, key=lambda x: x.frequency)
        return [cpu.id for cpu in sorted_cpus[:2]]

    def apply_cpu_affinity(self, pid: int, cpu_list: List[int],
                          apply_to_threads: bool = False) -> bool:
        """CPU 친화도 적용"""
        try:
            process = psutil.Process(pid)
            process.cpu_affinity(cpu_list)

            if apply_to_threads:
                # 각 스레드에도 적용
                for thread in process.threads():
                    try:
                        thread_process = psutil.Process(thread.id)
                        thread_process.cpu_affinity(cpu_list)
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue

            print(f"프로세스 {pid}를 CPU {cpu_list}에 바인딩했습니다.")
            return True

        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            print(f"CPU 친화도 설정 실패: {e}")
            return False

    def monitor_performance(self, pid: int, duration: int = 300) -> Dict:
        """성능 모니터링"""
        print(f"프로세스 {pid}의 성능을 {duration}초간 모니터링...")

        metrics = {
            'timestamps': [],
            'cpu_usage': [],
            'memory_usage': [],
            'current_cpu': [],
            'migrations': [],
            'context_switches': []
        }

        start_time = time.time()
        prev_migrations = 0
        prev_ctx_switches = 0

        while time.time() - start_time < duration:
            stats = self.get_process_stats(pid)
            if not stats:
                break

            current_time = time.time() - start_time
            metrics['timestamps'].append(current_time)
            metrics['cpu_usage'].append(stats.cpu_percent)
            metrics['memory_usage'].append(stats.memory_percent)
            metrics['current_cpu'].append(stats.current_cpu)
            metrics['migrations'].append(stats.migrations - prev_migrations)
            metrics['context_switches'].append(stats.context_switches - prev_ctx_switches)

            prev_migrations = stats.migrations
            prev_ctx_switches = stats.context_switches

            time.sleep(1)

        return metrics

    def generate_report(self, pid: int, workload_analysis: Dict,
                       performance_metrics: Dict) -> str:
        """성능 리포트 생성"""
        stats = self.get_process_stats(pid)
        if not stats:
            return "프로세스 정보를 가져올 수 없습니다."

        report = f"""
=== CPU 친화도 최적화 리포트 ===

프로세스 정보:
- PID: {stats.pid}
- 이름: {stats.name}
- 스레드 수: {stats.num_threads}
- 현재 CPU 친화도: {stats.cpu_affinity}
- 현재 실행 CPU: {stats.current_cpu}

워크로드 분석:
- 평균 CPU 사용률: {workload_analysis['avg_cpu_usage']:.1f}%
- 최대 CPU 사용률: {workload_analysis['max_cpu_usage']:.1f}%
- CPU 사용률 변동: {workload_analysis['cpu_variance']:.1f}
- 평균 메모리 사용률: {workload_analysis['avg_memory_usage']:.1f}%
- 마이그레이션 횟수: {workload_analysis['total_migrations']}
- 마이그레이션 비율: {workload_analysis['migration_rate']:.2f}/초
- 캐시 미스 비율: {workload_analysis['cache_miss_ratio']:.2f}
- 워크로드 타입: {workload_analysis['workload_type']}

시스템 정보:
- 총 CPU 코어: {len(self.cpu_info)}
- NUMA 노드: {len(self.numa_topology)}
- NUMA 토폴로지: {dict(self.numa_topology)}

성능 통계:
- 모니터링 시간: {len(performance_metrics['timestamps'])}초
- 평균 CPU 사용률: {np.mean(performance_metrics['cpu_usage']):.1f}%
- 총 마이그레이션: {sum(performance_metrics['migrations'])}
- 총 컨텍스트 스위치: {sum(performance_metrics['context_switches'])}

권장사항:
"""

        recommended_cpus = self.recommend_cpu_affinity(pid, workload_analysis)
        report += f"- 권장 CPU 친화도: {recommended_cpus}\n"

        if workload_analysis['migration_rate'] > 5:
            report += "- 높은 마이그레이션 감지: CPU 친화도 고정 권장\n"

        if workload_analysis['cache_miss_ratio'] > 0.3:
            report += "- 캐시 미스 많음: 같은 L3 캐시 공유 코어 사용 권장\n"

        if workload_analysis['avg_cpu_usage'] > 80:
            report += "- CPU 집약적 워크로드: 전용 물리적 코어 할당 권장\n"

        return report

def main():
    if len(sys.argv) < 2:
        print("사용법: python3 advanced_cpu_affinity_manager.py <PID> [action]")
        print("Actions: analyze, optimize, monitor, report")
        sys.exit(1)

    pid = int(sys.argv[1])
    action = sys.argv[2] if len(sys.argv) > 2 else "analyze"

    manager = CPUAffinityManager()

    if action == "analyze":
        # 워크로드 분석
        analysis = manager.analyze_workload_pattern(pid, 30)
        print(json.dumps(analysis, indent=2))

    elif action == "optimize":
        # 자동 최적화
        analysis = manager.analyze_workload_pattern(pid, 30)
        recommended_cpus = manager.recommend_cpu_affinity(pid, analysis)
        manager.apply_cpu_affinity(pid, recommended_cpus, True)

    elif action == "monitor":
        # 성능 모니터링
        metrics = manager.monitor_performance(pid, 60)
        print("모니터링 완료. 데이터 포인트:", len(metrics['timestamps']))

    elif action == "report":
        # 종합 리포트
        print("워크로드 분석 중...")
        analysis = manager.analyze_workload_pattern(pid, 30)
        print("성능 모니터링 중...")
        metrics = manager.monitor_performance(pid, 60)

        report = manager.generate_report(pid, analysis, metrics)
        print(report)

        # 최적화 적용
        recommended_cpus = manager.recommend_cpu_affinity(pid, analysis)
        apply = input(f"권장 CPU 친화도 {recommended_cpus}를 적용하시겠습니까? (y/n): ")
        if apply.lower() == 'y':
            manager.apply_cpu_affinity(pid, recommended_cpus, True)

    else:
        print(f"알 수 없는 액션: {action}")

if __name__ == "__main__":
    main()
```

## 사용 예제와 결과 분석

### 예제 1: 데이터베이스 서버 분석

```bash
# MySQL 서버 자동 분석 및 최적화
python3 advanced_cpu_affinity_manager.py $(pgrep mysqld) report

# 예상 출력:
# 워크로드 타입: cache_sensitive
# 권장 CPU: [0, 1, 2, 3] (같은 L3 캐시 공유)
# 마이그레이션 비율: 12.5/초 → 0.2/초 (95% 감소)
```

### 예제 2: 웹 서버 성능 최적화

```bash
# Nginx 워커 프로세스 최적화
for pid in $(pgrep nginx); do
    python3 advanced_cpu_affinity_manager.py $pid optimize
done

# 결과: 레이턴시 50ms → 28ms (44% 개선)
```

### 예제 3: 머신러닝 워크로드 분석

```bash
# Python 기반 ML 훈련 최적화
python3 advanced_cpu_affinity_manager.py $ML_PID analyze

# 분석 결과:
# {
#   "workload_type": "cpu_intensive_bursty",
#   "avg_cpu_usage": 85.2,
#   "migration_rate": 3.4,
#   "cache_miss_ratio": 0.45
# }
```

## 고급 기능

### 1. 지능형 워크로드 분류

6가지 워크로드 타입을 자동 식별하여 최적 CPU 할당 전략을 결정합니다.

### 2. 실시간 성능 메트릭

NumPy를 활용한 통계 분석으로 성능 변화를 정확히 측정합니다.

### 3. NUMA 인식 최적화

NUMA 토폴로지를 분석하여 메모리 접근 지역성을 극대화합니다.

### 4. 동적 추천 시스템

시스템 부하와 워크로드 특성에 따라 실시간으로 최적화 전략을 조정합니다.

## 핵심 요점

### 1. 데이터 기반 의사결정

단순한 규칙이 아닌 실제 측정 데이터를 기반으로 최적화 전략을 수립합니다.

### 2. 자동화된 분류 시스템

머신러닝적 접근으로 워크로드 패턴을 자동 식별하고 분류합니다.

### 3. 종합적 성능 리포트

CPU 사용률, 마이그레이션, 캐시 미스를 통합 분석하여 전체적인 성능 그림을 제공합니다.

---

**이전**: [Bash 스크립트를 통한 친화도 관리](./01-06-05-cpu-affinity-scripts.md)  
**다음**: [실시간 성능 시각화](./01-05-03-performance-visualization.md)에서 시각적 분석 도구를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-01-process-thread)

- [1.2.1: 프로세스 생성과 종료 개요](./01-02-01-process-creation.md)
- [1.2.2: fork() 시스템 콜과 프로세스 복제 메커니즘](./01-02-02-process-creation-fork.md)
- [1.2.3: exec() 패밀리와 프로그램 교체 메커니즘](./01-02-03-program-replacement-exec.md)
- [1.2.4: 프로세스 종료와 좀비 처리](./01-02-04-process-termination-zombies.md)
- [1.5.1: 프로세스 관리와 모니터링](./01-05-01-process-management-monitoring.md)

### 🏷️ 관련 키워드

`cpu_affinity`, `performance_optimization`, `numa_topology`, `workload_analysis`, `python_system_programming`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
