---
tags:
  - cpu_affinity
  - hands-on
  - intermediate
  - matplotlib
  - medium-read
  - performance_visualization
  - psutil
  - realtime_monitoring
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 0
---

# 1.5.3: 성능 시각화

## CPU 친화도 최적화 효과의 시각적 검증

최적화 전후의 성능 변화를 실시간으로 확인할 수 있는 시각화 도구로, CPU 친화도 설정의 효과를 직관적으로 파악할 수 있습니다.

## 실시간 성능 모니터링 시각화 도구

```python
#!/usr/bin/env python3
# cpu_affinity_visualizer.py

import matplotlib.pyplot as plt
import matplotlib.animation as animation
import psutil
import numpy as np
from collections import deque
import time
import threading
import argparse

class CPUAffinityVisualizer:
    def __init__(self, pid, window_size=60):
        self.pid = pid
        self.window_size = window_size  # 시각화에서 보여줄 데이터 포인트 수

        # ⭐ 1단계: 실시간 데이터 저장을 위한 순환 버퍼 (deque)
        # - deque: 최대 길이 제한을 가진 양방향 큐
        # - maxlen: 지정된 길이를 초과하면 자동으로 가장 오래된 요소 제거
        self.timestamps = deque(maxlen=window_size)     # 시간 스탬프
        self.cpu_usage = deque(maxlen=window_size)      # CPU 사용률 변화
        self.memory_usage = deque(maxlen=window_size)   # 메모리 사용률 변화
        self.current_cpu = deque(maxlen=window_size)    # 현재 실행 CPU 변화
        self.migrations = deque(maxlen=window_size)     # 마이그레이션 발생 회수

        # ⭐ 2단계: 마이그레이션 통계 변수 초기화
        self.total_migrations = 0    # 전체 마이그레이션 누적
        self.prev_migrations = 0     # 이전 측정에서의 마이그레이션 카운트

        # ⭐ 3단계: 모니터링 대상 프로세스 유효성 확인
        try:
            self.process = psutil.Process(pid)
            self.process_name = self.process.name()  # 프로세스 이름 기록
        except psutil.NoSuchProcess:
            raise ValueError(f"프로세스 {pid}를 찾을 수 없습니다.")

        # ⭐ 4단계: 비동기 데이터 수집 스레드 설정
        self.data_thread = None      # 데이터 수집 담당 스레드
        self.running = False         # 모니터링 상태 플래그

        # ⭐ 5단계: matplotlib 시각화 오브젝트 설정
        # - dark_background: 다크 테마로 설정
        # - 2x2 서브플롯: CPU, 메모리, CPU 분포, 마이그레이션
        plt.style.use('dark_background')
        self.fig, ((self.ax1, self.ax2), (self.ax3, self.ax4)) = plt.subplots(2, 2, figsize=(15, 10))
        self.fig.suptitle(f'CPU 친화도 모니터링 - PID {pid} ({self.process_name})',
                         fontsize=16, color='white')

    def collect_data(self):
        """데이터 수집 스레드"""
        start_time = time.time()

        while self.running:
            try:
                current_time = time.time() - start_time

                # 프로세스 통계 수집
                cpu_percent = self.process.cpu_percent(interval=0.1)
                memory_percent = self.process.memory_percent()

                # 현재 실행 중인 CPU
                try:
                    with open(f"/proc/{self.pid}/stat") as f:
                        fields = f.read().split()
                        current_cpu_id = int(fields[38])
                except (FileNotFoundError, ValueError, IndexError):
                    current_cpu_id = -1

                # 컨텍스트 스위치 (마이그레이션 추정)
                ctx_switches = self.process.num_ctx_switches()
                total_switches = ctx_switches.voluntary + ctx_switches.involuntary
                migration_delta = total_switches - self.prev_migrations
                self.prev_migrations = total_switches

                # 데이터 저장
                self.timestamps.append(current_time)
                self.cpu_usage.append(cpu_percent)
                self.memory_usage.append(memory_percent)
                self.current_cpu.append(current_cpu_id)
                self.migrations.append(migration_delta)

                time.sleep(1)

            except psutil.NoSuchProcess:
                print("프로세스가 종료되었습니다.")
                self.running = False
                break
            except Exception as e:
                print(f"데이터 수집 오류: {e}")
                time.sleep(1)

    def animate(self, frame):
        """애니메이션 업데이트 함수"""
        # ⭐ 1단계: 데이터 유효성 검사
        if len(self.timestamps) == 0:
            return  # 아직 데이터가 없으면 시각화 업데이트 생략

        # ⭐ 2단계: X축 데이터 (시간) 준비
        x = list(self.timestamps)  # deque를 리스트로 변환 (matplotlib 호환성)

        # ⭐ 3단계: CPU 사용률 시계열 그래프 생성
        self.ax1.clear()  # 이전 그래프 내용 지우기
        if len(self.cpu_usage) > 0:
            # 선 그래프: 시간에 따른 CPU 사용률 변화 추이
            self.ax1.plot(x, list(self.cpu_usage), 'g-', linewidth=2, label='CPU 사용률')
            # 면적 채우기: 그래프 아래 영역을 반투명하게 채움
            self.ax1.fill_between(x, list(self.cpu_usage), alpha=0.3, color='green')

        self.ax1.set_title('CPU 사용률 (%)', color='white')
        self.ax1.set_ylim(0, 100)  # Y축 범위 고정 (0-100%)
        self.ax1.grid(True, alpha=0.3)  # 반투명 격자 표시
        self.ax1.set_ylabel('사용률 (%)', color='white')

        # ⭐ 4단계: 메모리 사용률 시계열 그래프 생성
        self.ax2.clear()
        if len(self.memory_usage) > 0:
            self.ax2.plot(x, list(self.memory_usage), 'b-', linewidth=2, label='메모리 사용률')
            self.ax2.fill_between(x, list(self.memory_usage), alpha=0.3, color='blue')

        self.ax2.set_title('메모리 사용률 (%)', color='white')
        # Y축 범위: 100% 또는 최대값 중 큰 값으로 동적 조정
        self.ax2.set_ylim(0, max(100, max(self.memory_usage) if self.memory_usage else 100))
        self.ax2.grid(True, alpha=0.3)
        self.ax2.set_ylabel('사용률 (%)', color='white')

        # ⭐ 5단계: CPU 사용 분포 히스토그램 생성
        self.ax3.clear()
        if len(self.current_cpu) > 0:
            cpu_counts = {}  # CPU ID별 사용 횟수 카운터
            cpu_list = list(self.current_cpu)

            # ⭐ 6단계: 윈도우 내에서 각 CPU ID별 사용 빈도 계산
            for cpu_id in cpu_list:
                if cpu_id >= 0:  # 유효한 CPU ID만 카운트
                    cpu_counts[cpu_id] = cpu_counts.get(cpu_id, 0) + 1

            # ⭐ 7단계: 막대 그래프로 CPU 사용 패턴 시각화
            if cpu_counts:
                cpus = list(cpu_counts.keys())    # CPU ID 목록
                counts = list(cpu_counts.values())  # 각 CPU의 사용 횟수
                # viridis 컨러맵: 시각적으로 구별하기 쉬운 다양한 색상
                colors = plt.cm.viridis(np.linspace(0, 1, len(cpus)))

                bars = self.ax3.bar(cpus, counts, color=colors)
                self.ax3.set_title('CPU 사용 분포', color='white')
                self.ax3.set_xlabel('CPU ID', color='white')
                self.ax3.set_ylabel('사용 횟수', color='white')

                # ⭐ 8단계: 현재 실행 중인 CPU를 빨간색으로 강조 표시
                if cpu_list:
                    current = cpu_list[-1]  # 가장 최근에 사용된 CPU
                    if current in cpus:
                        idx = cpus.index(current)
                        bars[idx].set_color('red')    # 빨간색으로 변경
                        bars[idx].set_alpha(0.8)      # 불투명도 조정

        # ⭐ 9단계: 마이그레이션 횟수 시각화
        self.ax4.clear()
        if len(self.migrations) > 0:
            # 누적 마이그레이션
            cumulative_migrations = np.cumsum(list(self.migrations))
            self.ax4.plot(x, cumulative_migrations, 'r-', linewidth=2, label='누적 마이그레이션')

            # 최근 마이그레이션 (막대 그래프)
            recent_migrations = list(self.migrations)[-20:]  # 최근 20개
            recent_x = x[-20:] if len(x) >= 20 else x

            if len(recent_migrations) == len(recent_x):
                self.ax4.bar(recent_x, recent_migrations, alpha=0.5, color='orange',
                           width=0.8, label='최근 마이그레이션')

        self.ax4.set_title('CPU 마이그레이션', color='white')
        self.ax4.set_xlabel('시간 (초)', color='white')
        self.ax4.set_ylabel('횟수', color='white')
        self.ax4.legend()
        self.ax4.grid(True, alpha=0.3)

        # ⭐ 10단계: 공통 축 스타일 설정
        for ax in [self.ax1, self.ax2, self.ax3, self.ax4]:
            ax.tick_params(colors='white')
            for spine in ax.spines.values():
                spine.set_color('white')

        # ⭐ 11단계: 현재 통계 텍스트 표시
        if len(self.timestamps) > 0:
            stats_text = f"""
현재 통계:
• CPU 사용률: {self.cpu_usage[-1]:.1f}% (평균: {np.mean(self.cpu_usage):.1f}%)
• 메모리 사용률: {self.memory_usage[-1]:.1f}%
• 현재 CPU: {self.current_cpu[-1]}
• 총 마이그레이션: {sum(self.migrations)}
• 마이그레이션 비율: {sum(self.migrations)/len(self.timestamps):.2f}/초
"""
            self.fig.text(0.02, 0.02, stats_text, fontsize=10, color='white',
                         verticalalignment='bottom', bbox=dict(boxstyle="round,pad=0.3",
                         facecolor='black', alpha=0.7))

    def start_monitoring(self):
        """모니터링 시작"""
        self.running = True

        # 데이터 수집 스레드 시작
        self.data_thread = threading.Thread(target=self.collect_data)
        self.data_thread.daemon = True
        self.data_thread.start()

        # 애니메이션 시작
        ani = animation.FuncAnimation(self.fig, self.animate, interval=1000,
                                    cache_frame_data=False)

        plt.tight_layout()
        plt.show()

        # 종료 처리
        self.running = False
        if self.data_thread and self.data_thread.is_alive():
            self.data_thread.join(timeout=2)

def main():
    parser = argparse.ArgumentParser(description='CPU 친화도 실시간 시각화')
    parser.add_argument('pid', type=int, help='모니터링할 프로세스 PID')
    parser.add_argument('--window', type=int, default=60,
                       help='데이터 윈도우 크기 (기본: 60초)')

    args = parser.parse_args()

    try:
        visualizer = CPUAffinityVisualizer(args.pid, args.window)
        print(f"프로세스 {args.pid} 모니터링 시작...")
        print("그래프 창을 닫으면 모니터링이 종료됩니다.")

        visualizer.start_monitoring()

    except ValueError as e:
        print(f"오류: {e}")
    except KeyboardInterrupt:
        print("\n모니터링을 중단합니다.")

if __name__ == "__main__":
    main()
```

## 시각화 대시보드 활용 방법

### 1. 기본 모니터링

```bash
# 웹서버 프로세스 모니터링
python3 cpu_affinity_visualizer.py $(pgrep nginx | head -1)

# 데이터베이스 프로세스 모니터링 (2분간)
python3 cpu_affinity_visualizer.py $(pgrep mysqld) --window 120
```

### 2. 최적화 전후 비교

```bash
# 1단계: 최적화 전 상태 모니터링
python3 cpu_affinity_visualizer.py $PID &

# 2단계: CPU 친화도 적용
taskset -c 0-3 -p $PID

# 3단계: 시각적으로 변화 관찰
# - 마이그레이션 급감
# - CPU 분포 집중
# - 성능 안정화
```

## 시각화 결과 해석 가이드

### CPU 사용률 그래프 (좌상단)

- **안정적 패턴**: 친화도 설정 효과가 좋음
- **변동이 큰 패턴**: 워크로드 최적화 필요
- **급격한 하락**: 캐시 미스로 인한 성능 저하

### CPU 사용 분포 (우하단)

- **집중된 분포**: 친화도 설정이 효과적
- **분산된 분포**: 마이그레이션 발생 중
- **빨간색 바**: 현재 실행 중인 CPU

### 마이그레이션 추이 (우하단)

- **누적 곡선 평평**: 안정적인 실행
- **급격한 증가**: 친화도 재설정 필요
- **막대 그래프**: 최근 마이그레이션 빈도

## 고급 분석 기능

### 실시간 통계 패널

화면 하단에 표시되는 실시간 통계:

- 현재/평균 CPU 사용률
- 메모리 사용률
- 마이그레이션 비율
- 현재 실행 CPU

### 성능 임계점 감지

```python
# 성능 경고 조건
if migration_rate > 10:  # 초당 10회 이상 마이그레이션
    print("⚠️ 높은 마이그레이션 감지 - CPU 친화도 재설정 권장")

if cpu_variance > 50:    # CPU 사용률 변동성 높음
    print("⚠️ 불안정한 성능 패턴 - 워크로드 분석 필요")
```

## 시각화 도구의 장점

### 1. 실시간 피드백

최적화 적용 즉시 효과를 시각적으로 확인할 수 있습니다.

### 2. 다차원 분석

CPU, 메모리, 마이그레이션을 통합적으로 모니터링합니다.

### 3. 직관적 인터페이스

기술적 배경 없이도 성능 변화를 쉽게 이해할 수 있습니다.

### 4. 트러블슈팅 지원

성능 저하 구간을 시각적으로 식별하여 원인 분석을 돕습니다.

## 핵심 요점

### 1. 실시간 검증의 중요성

최적화 설정이 실제로 효과가 있는지 즉시 확인할 수 있습니다.

### 2. 패턴 인식을 통한 최적화

시각적 패턴을 통해 더 나은 최적화 전략을 수립할 수 있습니다.

### 3. 데이터 기반 의사결정

감에 의존하지 않고 실제 측정 데이터로 최적화 효과를 판단합니다.

---

**이전**: [Python 기반 고급 관리 도구](./01-06-01-python-advanced-manager.md)  
**다음**: [최적화 전략과 실전 시나리오](./01-05-04-optimization-strategies.md)에서 종합적인 활용 전략을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-01-process-thread)

- [1.2.1: 프로세스 생성과 종료 개요](./01-02-01-process-creation.md)
- [1.2.2: fork() 시스템 콜과 프로세스 복제 메커니즘](./01-02-02-process-creation-fork.md)
- [1.2.3: exec() 패밀리와 프로그램 교체 메커니즘](./01-02-03-program-replacement-exec.md)
- [1.2.4: 프로세스 종료와 좀비 처리](./01-02-04-process-termination-zombies.md)
- [1.5.1: 프로세스 관리와 모니터링](./01-05-01-process-management-monitoring.md)

### 🏷️ 관련 키워드

`performance_visualization`, `cpu_affinity`, `realtime_monitoring`, `matplotlib`, `psutil`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
