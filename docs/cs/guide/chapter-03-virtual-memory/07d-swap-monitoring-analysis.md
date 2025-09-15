---
tags:
  - Swap
  - Monitoring
  - Performance
  - SystemAnalysis
---

# 3-7D: 스왑 모니터링과 패턴 분석 - "데이터로 말하는 스왑 사용 현황"

## 스왑 모니터링의 중요성

스왑은 **보이지 않는 성능 저하의 원인**이 될 수 있습니다. 적절한 모니터링을 통해 스왑 사용 패턴을 분석하고, 성능 영향을 사전에 파악하여 최적화할 수 있습니다.

## 실시간 스왑 모니터링 시스템

### 종합 모니터링 도구

다음은 스왑 사용 패턴을 실시간으로 분석하는 고급 모니터링 시스템입니다:

```python
#!/usr/bin/env python3
# swap_monitor.py - 스왑 사용량 실시간 모니터링 및 분석 도구
# 시스템 스왑 사용 패턴을 실시간으로 추적하고 성능 영향을 분석
import time
import psutil
from collections import deque

class SwapMonitor:
    """스왑 사용량 실시간 모니터링 클래스

    이 클래스는 시스템의 스왑 사용량을 지속적으로 모니터링하고,
    프로세스별 스왑 사용량, I/O 패턴, 사용 추세를 분석합니다.
    """

    def __init__(self, history_minutes=5):
        """모니터링 클래스 초기화

        Args:
            history_minutes (int): 히스토리 데이터를 저장할 분 수 (기본: 5분)
        """
        # 지정된 분수만큼 데이터 포인트 저장 (30초 간격 기준)
        max_history = history_minutes * 2  # 30초 간격으로 5분 = 10개
        self.history = deque(maxlen=max_history)
        self.start_time = time.time()

    def get_swap_stats(self):
        """시스템 스왑 사용량 및 프로세스별 정보 수집

        Returns:
            dict: 스왑 통계 정보
                - percent: 스왑 사용률 (0-100%)
                - used_mb: 사용중인 스왑 크기 (MB)
                - total_mb: 전체 스왑 크기 (MB)
                - top_processes: 상위 스왑 사용 프로세스 목록
                - io: 스왑 I/O 통계 (페이지 in/out)
        """
        # 1. 전체 시스템 스왑 정보 수집
        swap = psutil.swap_memory()

        # 2. 프로세스별 스왑 사용량 분석 (VmSwap 값 확인)
        # /proc/PID/status 파일에서 VmSwap 라인을 파싱하여 각 프로세스의 스왑 사용량 추출
        top_processes = []
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                pid = proc.info['pid']
                # /proc/<pid>/status 파일에서 VmSwap 정보 읽기
                with open(f'/proc/{pid}/status') as f:
                    for line in f:
                        if line.startswith('VmSwap:'):
                            # 형식: "VmSwap:    1024 kB"
                            swap_kb = int(line.split()[1])
                            if swap_kb > 1024:  # 1MB 이상 사용하는 프로세스만 추적
                                top_processes.append((
                                    pid,
                                    proc.info['name'],
                                    swap_kb
                                ))
                            break
            except (FileNotFoundError, ProcessLookupError, PermissionError, ValueError):
                # 프로세스가 종료되었거나 접근 권한이 없는 경우 무시
                continue

        # 3. 시스템 전체 스왑 I/O 활동 수집 (/proc/vmstat에서)
        # pswpin: 스왑에서 메모리로 읽어온 페이지 수 (swap-in)
        # pswpout: 메모리에서 스왑으로 쓴 페이지 수 (swap-out)
        swap_io = {'in': 0, 'out': 0}
        try:
            with open('/proc/vmstat') as f:
                for line in f:
                    if line.startswith('pswpin '):
                        swap_io['in'] = int(line.split()[1])
                    elif line.startswith('pswpout '):
                        swap_io['out'] = int(line.split()[1])
                        # 두 값을 모두 찾았으면 루프 종료 (효율성)
                        if swap_io['in'] > 0:
                            break
        except (FileNotFoundError, PermissionError):
            # /proc/vmstat 접근 실패 시 기본값 유지
            pass

        return {
            'percent': swap.percent,
            'used_mb': swap.used // 1024 // 1024,
            'total_mb': swap.total // 1024 // 1024,
            'free_mb': (swap.total - swap.used) // 1024 // 1024,
            # 상위 3개 프로세스만 반환 (사용량 기준 내림차순 정렬)
            'top_processes': sorted(top_processes, key=lambda x: x[2], reverse=True)[:3],
            'io': swap_io,
            'timestamp': time.time()
        }

    def analyze_trend(self):
        """스왑 사용량 추세 분석

        최근 5개 데이터 포인트를 분석하여 사용량 증가/감소/안정 추세를 판단

        Returns:
            str: 추세 분석 결과
                - "increasing": 10% 이상 증가 (경고 필요)
                - "decreasing": 10% 이상 감소 (개선됨)
                - "stable": 안정적 상태
                - "insufficient_data": 데이터 부족
        """
        if len(self.history) < 5:
            return "insufficient_data"

        # 최근 5개 데이터 포인트에서 사용률 추출
        recent = [entry['percent'] for entry in list(self.history)[-5:]]
        trend_change = recent[-1] - recent[0]  # 첫 번째와 마지막 값 비교

        # 변화량에 따른 추세 판단 (임계값: 10%)
        if trend_change > 10:
            return "increasing"
        elif trend_change < -10:
            return "decreasing"
        else:
            return "stable"

    def get_performance_impact(self, current_stats, prev_io):
        """스왑 I/O 기반 성능 영향도 평가

        Args:
            current_stats (dict): 현재 스왑 통계
            prev_io (dict): 이전 I/O 통계

        Returns:
            dict: 성능 영향 분석 결과
        """
        if not prev_io:
            return {'impact_level': 'unknown', 'io_rate': {'in': 0, 'out': 0}}

        # I/O 비율 계산 (초당 페이지 수)
        io_rate = {
            'in': max(0, current_stats['io']['in'] - prev_io['in']),
            'out': max(0, current_stats['io']['out'] - prev_io['out'])
        }

        total_io = io_rate['in'] + io_rate['out']

        # I/O 활동량에 따른 성능 영향도 분류
        if total_io > 1000:  # 초당 1000페이지(~4MB) 이상
            impact_level = 'severe'  # 심각한 성능 영향
        elif total_io > 100:  # 초당 100페이지(~400KB) 이상
            impact_level = 'moderate'  # 중간 정도 영향
        elif total_io > 10:  # 초당 10페이지(~40KB) 이상
            impact_level = 'low'  # 낮은 영향
        else:
            impact_level = 'minimal'  # 최소 영향

        return {
            'impact_level': impact_level,
            'io_rate': io_rate,
            'total_io_pages': total_io,
            'estimated_mb_per_sec': total_io * 4 / 1024  # 4KB 페이지 가정
        }

    def monitor(self, duration=300, interval=3):
        """지정된 기간 동안 스왑 모니터링 수행

        Args:
            duration (int): 모니터링 지속 시간 (초, 기본: 5분)
            interval (int): 모니터링 간격 (초, 기본: 3초)
        """
        print(f"=== 스왑 사용량 실시간 모니터링 시작 ===\n")
        print(f"모니터링 기간: {duration}초 ({duration//60}분 {duration%60}초)")
        print(f"수집 간격: {interval}초")
        print(f"예상 데이터 포인트: {duration//interval}개\n")

        start_time = time.time()
        prev_io = None
        sample_count = 0

        try:
            while time.time() - start_time < duration:
                # 현재 스왑 통계 수집
                stats = self.get_swap_stats()
                sample_count += 1

                # 성능 영향도 분석
                performance = self.get_performance_impact(stats, prev_io)

                # 히스토리에 데이터 추가
                self.history.append({
                    'time': time.time(),
                    'percent': stats['percent'],
                    'used_mb': stats['used_mb'],
                    'io_activity': performance['total_io_pages']
                })

                # 실시간 상태 출력
                elapsed = time.time() - start_time
                print(f"[{time.strftime('%H:%M:%S')}] ({sample_count:3d}) "
                      f"스왑: {stats['percent']:5.1f}% "
                      f"({stats['used_mb']:4d}/{stats['total_mb']:4d}MB) "
                      f"여유: {stats['free_mb']:4d}MB")

                # I/O 활동이 있는 경우 상세 정보 출력
                if performance['io_rate']['in'] > 0 or performance['io_rate']['out'] > 0:
                    print(f"    I/O: {performance['io_rate']['in']:4d} in/s, "
                          f"{performance['io_rate']['out']:4d} out/s "
                          f"({performance['estimated_mb_per_sec']:.1f} MB/s) "
                          f"[{performance['impact_level'].upper()}]")

                # 추세 분석 및 경고
                trend = self.analyze_trend()
                if trend == "increasing":
                    print("    ⚠️  경고: 스왑 사용량이 지속적으로 증가하고 있습니다!")
                elif trend == "decreasing":
                    print("    ✅ 정보: 스왑 사용량이 감소하고 있습니다.")

                # 상위 스왑 사용 프로세스 정보 (사용량이 많은 경우만)
                if stats['top_processes'] and stats['percent'] > 5:
                    print("    상위 스왑 사용 프로세스:")
                    for pid, name, swap_kb in stats['top_processes']:
                        swap_mb = swap_kb // 1024
                        print(f"      {name:20s} (PID {pid:5d}): {swap_mb:4d} MB")

                prev_io = stats['io']
                time.sleep(interval)

        except KeyboardInterrupt:
            print("\n사용자에 의해 모니터링이 중단되었습니다.")

        # 최종 분석 리포트 출력
        self.print_comprehensive_summary()

    def print_comprehensive_summary(self):
        """포괄적인 모니터링 결과 요약 리포트 생성"""
        if not self.history:
            print("분석할 데이터가 없습니다.")
            return

        usage_data = [entry['percent'] for entry in self.history]
        io_data = [entry['io_activity'] for entry in self.history]

        # 기본 통계 계산
        avg_usage = sum(usage_data) / len(usage_data)
        max_usage = max(usage_data)
        min_usage = min(usage_data)
        volatility = max_usage - min_usage

        total_runtime = time.time() - self.start_time

        print(f"\n{'='*60}")
        print(f"스왑 모니터링 최종 분석 리포트")
        print(f"{'='*60}")

        print(f"\n📊 모니터링 개요:")
        print(f"  • 총 수집 시간:     {total_runtime/60:.1f}분")
        print(f"  • 데이터 포인트:    {len(self.history)}개")
        print(f"  • 평균 수집 간격:   {total_runtime/len(self.history):.1f}초")

        print(f"\n📈 스왑 사용량 통계:")
        print(f"  • 평균 사용률:      {avg_usage:5.1f}%")
        print(f"  • 최대 사용률:      {max_usage:5.1f}%")
        print(f"  • 최소 사용률:      {min_usage:5.1f}%")
        print(f"  • 변동성 (범위):    {volatility:5.1f}%")

        print(f"\n⚡ I/O 활동 분석:")
        total_io_activity = sum(io_data)
        avg_io_activity = total_io_activity / len(io_data) if io_data else 0
        max_io_activity = max(io_data) if io_data else 0

        print(f"  • 평균 I/O 활동:    {avg_io_activity:5.0f} 페이지/초")
        print(f"  • 최대 I/O 활동:    {max_io_activity:5.0f} 페이지/초")
        print(f"  • 총 I/O 활동:      {total_io_activity:8.0f} 페이지")

        # 성능 영향 평가 및 권장사항
        print(f"\n💡 성능 영향 평가:")
        if max_usage > 80:
            print(f"  🔴 심각: 스왑 사용률이 80%를 초과했습니다!")
            print(f"     권장사항: 즉시 메모리 증설 또는 프로세스 최적화 필요")
        elif max_usage > 50:
            print(f"  🟡 경고: 스왑 사용률이 50%를 초과했습니다.")
            print(f"     권장사항: 메모리 사용량 모니터링 강화 및 증설 검토")
        elif max_usage > 20:
            print(f"  🟠 주의: 스왑 사용률이 20%를 초과했습니다.")
            print(f"     권장사항: 주기적인 모니터링과 swappiness 조정 고려")
        else:
            print(f"  🟢 양호: 스왑 사용률이 안정적입니다.")
            print(f"     현재 상태를 유지하세요.")

        # 추가 최적화 제안
        if avg_io_activity > 100:
            print(f"\n🔧 최적화 제안:")
            print(f"  • 높은 I/O 활동이 감지되었습니다 ({avg_io_activity:.0f} 페이지/초)")
            print(f"  • zram 또는 zswap 사용을 고려해보세요")
            print(f"  • swappiness 값을 낮춰보세요 (현재 확인: cat /proc/sys/vm/swappiness)")
            print(f"  • 메모리 집약적 프로세스 최적화를 검토하세요")

if __name__ == "__main__":
    # 스왑이 설정되어 있는지 확인
    if not psutil.swap_memory().total:
        print("❌ 오류: 시스템에 스왑이 설정되지 않았습니다.")
        print("스왑을 설정한 후 다시 실행해주세요.")
        exit(1)

    # 모니터링 클래스 인스턴스 생성
    monitor = SwapMonitor(history_minutes=5)

    print("🔍 스왑 모니터링 도구 v2.0")
    print(f"현재 시스템 스왑 정보:")
    initial_stats = monitor.get_swap_stats()
    print(f"  총 스왑 크기: {initial_stats['total_mb']:,} MB")
    print(f"  현재 사용량: {initial_stats['used_mb']:,} MB ({initial_stats['percent']:.1f}%)")
    print()

    try:
        # 5분간 3초 간격으로 모니터링 (사용자 설정 가능)
        monitor.monitor(duration=300, interval=3)
    except KeyboardInterrupt:
        print("\n🛑 사용자에 의해 모니터링이 중단되었습니다.")
        monitor.print_comprehensive_summary()
```

## 간단한 스왑 모니터링 명령어

### 기본 모니터링 명령어

```bash
# 실시간 스왑 사용량 모니터링
watch -n 1 'free -h; echo "---"; swapon -s'

# 프로세스별 스왑 사용량 확인
for pid in $(ps -eo pid --no-headers); do
    if [ -f /proc/$pid/status ]; then
        swap=$(grep VmSwap /proc/$pid/status 2>/dev/null | awk '{print $2}')
        if [ "$swap" ] && [ "$swap" -gt 1024 ]; then
            name=$(ps -p $pid -o comm= 2>/dev/null)
            echo "PID: $pid, Process: $name, Swap: ${swap}KB"
        fi
    fi
done | sort -k6 -nr | head -10

# 스왑 I/O 활동 모니터링
watch -n 2 'grep -E "pswp" /proc/vmstat'
```

### 스왑 경고 시스템

```bash
#!/bin/bash
# swap_alert.sh - 스왑 사용률 임계값 경고 시스템

SWAP_THRESHOLD=80  # 경고 임계값 (%)
LOG_FILE="/var/log/swap_monitor.log"

check_swap_usage() {
    local swap_info=$(free | grep Swap)
    local total=$(echo $swap_info | awk '{print $2}')
    local used=$(echo $swap_info | awk '{print $3}')
    
    if [ "$total" -gt 0 ]; then
        local usage=$((used * 100 / total))
        echo $usage
    else
        echo 0
    fi
}

log_alert() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message" >> $LOG_FILE
    echo "[$timestamp] $message"
}

# 메인 로직
current_usage=$(check_swap_usage)

if [ "$current_usage" -ge "$SWAP_THRESHOLD" ]; then
    log_alert "WARNING: Swap usage is ${current_usage}% (threshold: ${SWAP_THRESHOLD}%)"
    
    # 상위 스왑 사용 프로세스 로그
    echo "Top swap users:" >> $LOG_FILE
    ps -eo pid,ppid,cmd,%mem,stat --sort=-%mem | head -10 >> $LOG_FILE
    
    # 시스템 관리자에게 알림 (예: mail, slack webhook 등)
    # mail -s "High Swap Usage Alert" admin@company.com < $LOG_FILE
fi
```

## 스왑 패턴 분석

### 일반적인 스왑 사용 패턴

1. **점진적 증가**: 메모리 누수나 지속적인 메모리 압박
2. **급작스러운 증가**: 대용량 작업이나 메모리 집약적 프로세스 실행
3. **주기적 변동**: 배치 작업이나 예측 가능한 워크로드
4. **지속적 높은 사용**: 시스템 메모리 부족 상태

### 패턴별 대응 전략

| 패턴 | 원인 | 대응 방안 |
|------|------|-----------|
| **점진적 증가** | 메모리 누수, 캐시 누적 | 프로세스 재시작, 메모리 프로파일링 |
| **급작스러운 증가** | 대용량 작업 | 작업 스케줄링, 메모리 증설 |
| **주기적 변동** | 배치 작업 | 스케줄 조정, 리소스 분산 |
| **지속적 높은 사용** | 시스템 용량 부족 | 메모리 증설, 아키텍처 재검토 |

## 핵심 요점

### 1. 모니터링의 3대 요소

- **사용률 추적**: 전체적인 스왑 사용 현황
- **I/O 패턴 분석**: 성능 영향도 평가
- **프로세스별 분석**: 문제 원인 식별

### 2. 경고 임계값 설정

- **20% 이상**: 주의 깊은 모니터링 필요
- **50% 이상**: 메모리 증설 검토 시점
- **80% 이상**: 즉시 조치 필요

### 3. 자동화된 모니터링

정기적인 모니터링과 임계값 기반 알림 시스템으로 **사전 예방적 관리** 구현

---

**이전**: [압축 스왑 기술](07c-compressed-swap-technologies.md)  
**다음**: [컨테이너 스왑 관리 실무](07e-container-swap-management.md)에서 Docker와 Kubernetes 환경에서의 스왑 관리 전략을 학습합니다.
