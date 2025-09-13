---
tags:
  - OOM
  - dmesg
  - LogAnalysis
  - SystemDebugging
  - MemoryLeakDetection
---

# 3-8B: dmesg OOM 메시지 분석 - "범인을 찾아라"

OOM이 발생하면 dmesg에 상세한 정보가 기록됩니다. 이 로그를 체계적으로 분석하여 OOM의 근본 원인을 찾고 재발을 방지하는 방법을 알아봅시다. 자동화된 분석 도구를 통해 패턴을 발견하고 예방 조치를 수립할 수 있습니다.

## OOM 로그 메시지 해석

OOM이 발생하면 dmesg에 상세한 정보가 기록됩니다:

```bash
# OOM 메시지 확인
$ dmesg | grep -A 20 -B 5 "Out of memory"

# 예시 출력:
[12345.678901] Out of memory: Kill process 1234 (mysqld) score 987 or sacrifice child
[12345.678902] Killed process 1234 (mysqld) total-vm:4194304kB, anon-rss:2097152kB, file-rss:0kB, shmem-rss:0kB
[12345.678903] oom_reaper: reaped process 1234 (mysqld), now anon-rss:0kB, file-rss:0kB, shmem-rss:0kB
```

## 자동 OOM 분석 도구

```python
#!/usr/bin/env python3
# oom_analyzer.py - dmesg OOM 로그 분석 및 패턴 분석 도구
import re
import subprocess
import datetime
from collections import defaultdict, namedtuple

# OOM 이벤트 정보를 담는 네임드 튜플
# timestamp: OOM 발생 시간 (커널 부팅 이후 초)
# killed_process: 종료된 프로세스명
# pid: 종료된 프로세스 ID
# score: OOM Score (높을수록 종료 우선순위 높음)
# memory_info: 메모리 사용량 상세 정보 (total-vm, anon-rss, file-rss)
OOMEvent = namedtuple('OOMEvent', ['timestamp', 'killed_process', 'pid', 'score', 'memory_info'])

class OOMAnalyzer:
    """dmesg에서 OOM 이벤트를 파싱하고 패턴을 분석하는 클래스"""

    def __init__(self):
        self.oom_events = []  # 파싱된 OOM 이벤트 목록
        self.memory_patterns = defaultdict(int)  # 프로세스별 OOM 발생 횟수

    def parse_dmesg_oom(self):
        """dmesg에서 OOM 이벤트 파싱

        dmesg 출력에서 다음 패턴들을 찾아 파싱:
        1. "Out of memory: Kill process [pid] ([name]) score [score]"
        2. "Killed process [pid] ([name]) total-vm:[total]kB, anon-rss:[anon]kB, file-rss:[file]kB"
        """
        try:
            result = subprocess.run(['dmesg'], capture_output=True, text=True)
            dmesg_output = result.stdout
        except Exception as e:
            print(f"dmesg 실행 실패: {e}")
            return

        lines = dmesg_output.split('\n')
        current_oom = None  # 현재 파싱 중인 OOM 이벤트

        for line in lines:
            # OOM 시작 감지 - "Out of memory: Kill process" 패턴 매칭
            oom_match = re.search(r'\[([\d.]+)\].*Out of memory: Kill process (\d+) \(([^)]+)\) score (\d+)', line)
            if oom_match:
                # 커널 타임스탬프, PID, 프로세스명, OOM 점수 추출
                timestamp = float(oom_match.group(1))
                pid = int(oom_match.group(2))
                process_name = oom_match.group(3)
                score = int(oom_match.group(4))

                # 새로운 OOM 이벤트 시작
                current_oom = {
                    'timestamp': timestamp,
                    'pid': pid,
                    'process_name': process_name,
                    'score': score,
                    'memory_info': {}  # 다음 라인에서 파싱될 메모리 정보
                }
                continue

            # 메모리 정보 파싱 - "Killed process" 라인에서 메모리 사용량 추출
            if current_oom:
                mem_match = re.search(r'Killed process \d+ \([^)]+\) total-vm:(\d+)kB, anon-rss:(\d+)kB, file-rss:(\d+)kB', line)
                if mem_match:
                    # 메모리 사용량 정보 파싱
                    # total-vm: 가상 메모리 총 사용량
                    # anon-rss: 익명 메모리 (힙, 스택 등)
                    # file-rss: 파일 매핑 메모리 (바이너리, 라이브러리 등)
                    current_oom['memory_info'] = {
                        'total_vm': int(mem_match.group(1)),  # KB 단위
                        'anon_rss': int(mem_match.group(2)),  # KB 단위
                        'file_rss': int(mem_match.group(3))   # KB 단위
                    }

                    # 완성된 OOM 이벤트를 객체로 변환하여 저장
                    event = OOMEvent(
                        timestamp=current_oom['timestamp'],
                        killed_process=current_oom['process_name'],
                        pid=current_oom['pid'],
                        score=current_oom['score'],
                        memory_info=current_oom['memory_info']
                    )

                    self.oom_events.append(event)
                    self.memory_patterns[current_oom['process_name']] += 1  # 프로세스별 OOM 카운트 증가
                    current_oom = None  # 현재 이벤트 완료

    def analyze_oom_patterns(self):
        """파싱된 OOM 이벤트들의 패턴 분석 및 보고서 생성"""
        if not self.oom_events:
            print("OOM 이벤트가 발견되지 않았습니다.")
            return

        print(f"=== OOM 분석 결과 ===")
        print(f"총 OOM 이벤트: {len(self.oom_events)}개")

        # 시간별 분석 - 최근 24시간 내 이벤트 필터링
        recent_events = []
        now = datetime.datetime.now().timestamp()

        print(f"\n=== 개별 OOM 이벤트 상세 정보 ===")
        for event in self.oom_events:
            # 커널 타임스탬프를 실제 시간으로 변환
            # 주의: 이 방법은 정확하지 않을 수 있음 (시스템 부팅 시간 고려 필요)
            event_time = datetime.datetime.fromtimestamp(event.timestamp)
            time_diff = now - event.timestamp

            if time_diff < 86400:  # 24시간 이내 이벤트 표시
                recent_events.append(event)

            print(f"\n[{event_time.strftime('%Y-%m-%d %H:%M:%S')}]")
            print(f"  프로세스: {event.killed_process} (PID: {event.pid})")
            print(f"  OOM Score: {event.score} (점수가 높을수록 종료 우선순위 높음)")
            print(f"  메모리 사용량:")
            # KB를 MB로 변환하여 가독성 향상
            print(f"    가상 메모리: {event.memory_info['total_vm'] / 1024:.1f} MB (프로세스가 할당받은 전체 가상 주소 공간)")
            print(f"    익명 RSS: {event.memory_info['anon_rss'] / 1024:.1f} MB (힙, 스택 등 실제 메모리 사용량)")
            print(f"    파일 RSS: {event.memory_info['file_rss'] / 1024:.1f} MB (실행 파일, 라이브러리 매핑 메모리)")

        # 최근 24시간 이벤트 경고
        if recent_events:
            print(f"\n⚠️  최근 24시간 내 {len(recent_events)}개 OOM 이벤트 발생!")
            print(f"    → 시스템 메모리 부족 문제가 지속되고 있습니다")

        # 프로세스별 OOM 발생 빈도 분석
        print(f"\n=== 프로세스별 OOM 빈도 ===")
        for process, count in sorted(self.memory_patterns.items(), key=lambda x: x[1], reverse=True):
            print(f"{process}: {count}회")
            if count > 3:
                print(f"  ⚠️  {process}가 반복적으로 OOM으로 종료됨! (메모리 누수 의심)")

    def generate_recommendations(self):
        """OOM 분석 결과를 바탕으로 구체적인 개선 권장사항 생성"""
        print(f"\n=== 권장사항 ===")

        # 반복적으로 OOM되는 프로세스 분석 (2회 이상)
        frequent_victims = [(proc, count) for proc, count in self.memory_patterns.items() if count > 2]

        if frequent_victims:
            print("1. 메모리 누수 조사 필요:")
            for proc, count in frequent_victims:
                print(f"   - {proc}: {count}회 OOM (메모리 누수 가능성 높음)")
                print(f"     → valgrind, AddressSanitizer 등으로 메모리 누수 검사 필요")
                print(f"     → 애플리케이션 로그에서 메모리 사용 패턴 분석")
                print(f"     → htop, ps 명령어로 해당 프로세스 메모리 사용량 지속 모니터링")

        # 시스템 리소스 부족 분석 (OOM 이벤트가 많은 경우)
        if len(self.oom_events) > 5:
            print("2. 시스템 리소스 부족:")
            print("   - 메모리 증설 고려 (현재 시스템 부하에 비해 메모리 부족)")
            print("   - 스왑 설정 검토 (vm.swappiness, zram/zswap 활용)")
            print("   - 애플리케이션 메모리 제한 설정 (cgroup, Docker memory limits)")
            print("   - 메모리 오버커밋 설정 검토 (vm.overcommit_memory, vm.overcommit_ratio)")

        # 모니터링 시스템 구축 권장사항
        print("3. 모니터링 개선:")
        print("   - OOM Score 실시간 모니터링 설정 (oom_score_monitor.py 활용)")
        print("   - 메모리 사용량 알림 설정 (85% 경고, 95% 위험 임계값)")
        print("   - dmesg 로그 수집 시스템 구축 (rsyslog, fluentd 등)")
        print("   - Prometheus + Grafana로 메모리 사용 패턴 시각화")

        # OOM 예방을 위한 구체적 조치
        print("4. 예방 조치:")
        print("   - 중요 프로세스 oom_score_adj 설정 (SSH: -17, DB: -10, 웹서버: -5)")
        print("   - systemd OOMPolicy 설정 (서비스별 OOM 동작 정의)")
        print("   - 컨테이너 메모리 제한 활용 (Docker --memory, Kubernetes resources.limits)")
        print("   - Early OOM 도구 설치 (earlyoom 패키지 또는 커스텀 스크립트)")

def parse_system_oom_info():
    """시스템의 OOM 관련 커널 파라미터 및 설정 정보 수집 및 해석"""
    print("=== 시스템 OOM 설정 ===")

    # OOM 관련 커널 파라미터 목록
    # vm.panic_on_oom: OOM 발생 시 커널 패닉 여부 (0: 비활성화, 1: 활성화)
    # vm.oom_kill_allocating_task: 메모리를 요청한 태스크를 우선 종료 (0: 비활성화, 1: 활성화)
    # vm.oom_dump_tasks: OOM 발생 시 모든 태스크 정보 덤프 (0: 비활성화, 1: 활성화)
    oom_params = [
        ('vm.panic_on_oom', 'OOM 발생 시 시스템 패닉 여부'),
        ('vm.oom_kill_allocating_task', '메모리 요청 태스크 우선 종료'),
        ('vm.oom_dump_tasks', 'OOM 시 모든 태스크 정보 덤프')
    ]

    for param, description in oom_params:
        try:
            with open(f'/proc/sys/{param.replace(".", "/")}') as f:
                value = f.read().strip()
                status = "활성화" if value == "1" else "비활성화"
                print(f"{param}: {value} ({status}) - {description}")
        except FileNotFoundError:
            print(f"{param}: 설정되지 않음 - {description}")

    print()  # 구분선

    # 메모리 오버커밋 설정 - 시스템이 실제 사용 가능한 메모리보다 더 많은 메모리 할당을 허용하는지 제어
    try:
        with open('/proc/sys/vm/overcommit_memory') as f:
            overcommit = f.read().strip()
        with open('/proc/sys/vm/overcommit_ratio') as f:
            ratio = f.read().strip()

        # 오버커밋 모드 설명
        overcommit_modes = {
            '0': '휴리스틱 오버커밋 (기본값) - 커널이 합리적인 오버커밋만 허용',
            '1': '항상 오버커밋 허용 - 메모리 할당 요청을 항상 성공시킴 (위험)',
            '2': '엄격한 오버커밋 제한 - swap + RAM * overcommit_ratio/100 까지만 허용'
        }

        print(f"Memory Overcommit Mode: {overcommit} ({overcommit_modes.get(overcommit, '알 수 없는 모드')})")
        print(f"Overcommit Ratio: {ratio}% (모드 2에서 사용, 전체 메모리 중 오버커밋 허용 비율)")

        # 실제 커밋된 메모리 정보
        with open('/proc/meminfo') as f:
            meminfo = f.read()
            for line in meminfo.split('\n'):
                if 'Committed_AS' in line:
                    committed = line.split()[1]
                    print(f"현재 커밋된 메모리: {int(committed) / 1024:.1f} MB")
                    break

    except FileNotFoundError:
        print("Overcommit 정보를 읽을 수 없음")

if __name__ == "__main__":
    analyzer = OOMAnalyzer()

    parse_system_oom_info()
    print()

    analyzer.parse_dmesg_oom()
    analyzer.analyze_oom_patterns()
    analyzer.generate_recommendations()
```

## 핵심 요점

### 1. dmesg 로그 해석 포인트

- OOM Score와 메모리 사용량 정보로 종료 이유 파악
- total-vm, anon-rss, file-rss 구분을 통한 메모리 타입별 분석

### 2. 패턴 분석을 통한 근본 원인 발견

- 반복적으로 OOM되는 프로세스 식별로 메모리 누수 의심
- 시간대별 분석으로 특정 시점의 메모리 압박 원인 파악

### 3. 시스템 OOM 설정 최적화

- vm.overcommit_memory 모드별 특성 이해
- 애플리케이션 특성에 맞는 오버커밋 정책 설정

---

**이전**: [OOM Killer 동작 원리](08a-oom-killer-fundamentals.md)  
**다음**: [컨테이너 환경 OOM 디버깅](08c-container-oom-debugging.md)에서 Docker와 Kubernetes 환경에서의 OOM 대응을 학습합니다.
