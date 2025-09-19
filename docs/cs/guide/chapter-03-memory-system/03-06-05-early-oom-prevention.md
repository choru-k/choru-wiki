---
tags:
  - early-warning
  - hands-on
  - intermediate
  - medium-read
  - memory-monitoring
  - oom-prevention
  - process-management
  - system-automation
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "3-5시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 3.6.5: 조기 OOM 방지

## Early OOM 설정

시스템 OOM보다 먼저 작동하는 조기 경고 시스템을 구축할 수 있습니다:

```bash
#!/bin/bash
# early_oom_setup.sh

echo "=== Early OOM 설정 ==="

# earlyoom 패키지 설치 및 설정
install_earlyoom() {
    if command -v earlyoom &> /dev/null; then
        echo "earlyoom이 이미 설치되어 있습니다."
    else
        echo "earlyoom 설치 중..."
        apt-get update && apt-get install -y earlyoom
    fi

    # earlyoom 설정
    cat > /etc/default/earlyoom << 'EOF'
# earlyoom 설정
EARLYOOM_ARGS="--memory 10 --swap 5 --kill-process-group --prefer '(^|/)Web Content|chromium|firefox' --avoid '(^|/)init|systemd|kernel|ssh'"

# 메모리 사용량이 90%를 넘으면 경고, 95%를 넘으면 프로세스 종료
EARLYOOM_ARGS="$EARLYOOM_ARGS --memory-report-interval 60"
EOF

    # 서비스 활성화
    systemctl enable earlyoom
    systemctl start earlyoom

    echo "earlyoom 설정 완료"
    systemctl status earlyoom
}

# 커스텀 Early OOM 스크립트
create_custom_early_oom() {
    cat > /usr/local/bin/custom_early_oom.sh << 'EOF'
#!/bin/bash
# custom_early_oom.sh - 커스텀 Early OOM 구현

# 임계값 설정
MEMORY_WARNING_THRESHOLD=85    # 85% 사용시 경고
MEMORY_CRITICAL_THRESHOLD=95   # 95% 사용시 프로세스 종료

# 로그 파일
LOG_FILE="/var/log/early_oom.log"

log_message() {
    echo "[$(date)] $1" | tee -a $LOG_FILE
}

get_memory_usage() {
    local mem_info=$(cat /proc/meminfo)
    local total_kb=$(echo "$mem_info" | grep MemTotal | awk '{print $2}')
    local available_kb=$(echo "$mem_info" | grep MemAvailable | awk '{print $2}')
    local used_kb=$((total_kb - available_kb))

    echo $((used_kb * 100 / total_kb))
}

send_alert() {
    local message=$1
    log_message "ALERT: $message"

    # 시스템 알림 (선택적)
    # curl -X POST "https://hooks.slack.com/..." -d "{\"text\":\"$message\"}"

    # 이메일 알림 (선택적)
    # echo "$message" | mail -s "메모리 경고" admin@company.com
}

kill_memory_hog() {
    local exclude_processes="init|kernel|systemd|sshd|mysqld"

    # 높은 OOM Score를 가진 프로세스 중에서 선택
    local target_pid=$(ps -eo pid,oom_score,comm --sort=-oom_score |
        grep -vE "$exclude_processes" |
        head -2 | tail -1 | awk '{print $1}')

    if [ -n "$target_pid" ] && [ "$target_pid" != "PID" ]; then
        local process_name=$(ps -p $target_pid -o comm --no-headers)
        log_message "메모리 부족으로 프로세스 종료: $process_name (PID: $target_pid)"
        kill -TERM $target_pid
        sleep 5
        kill -KILL $target_pid 2>/dev/null
        return 0
    fi

    return 1
}

# 메인 모니터링 루프
monitor_memory() {
    local check_interval=${1:-5}
    log_message "Early OOM 모니터링 시작 (간격: ${check_interval}초)"

    while true; do
        local memory_usage=$(get_memory_usage)

        if [ $memory_usage -ge $MEMORY_CRITICAL_THRESHOLD ]; then
            log_message "위험: 메모리 사용률 ${memory_usage}%"
            send_alert "메모리 사용률이 위험 수준입니다: ${memory_usage}%"

            if kill_memory_hog; then
                log_message "메모리 확보를 위해 프로세스를 종료했습니다"
            else
                log_message "종료할 적절한 프로세스를 찾지 못했습니다"
            fi

        elif [ $memory_usage -ge $MEMORY_WARNING_THRESHOLD ]; then
            log_message "경고: 메모리 사용률 ${memory_usage}%"
            send_alert "메모리 사용률이 경고 수준입니다: ${memory_usage}%"
        fi

        sleep $check_interval
    done
}

case "${1:-monitor}" in
    monitor)
        monitor_memory ${2:-5}
        ;;
    status)
        echo "메모리 사용률: $(get_memory_usage)%"
        ;;
    *)
        echo "사용법: $0 [monitor|status] [interval]"
        exit 1
        ;;
esac
EOF

    chmod +x /usr/local/bin/custom_early_oom.sh

    # systemd 서비스 생성
    cat > /etc/systemd/system/custom-early-oom.service << 'EOF'
[Unit]
Description=Custom Early OOM Monitor
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/custom_early_oom.sh monitor 10
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable custom-early-oom
    systemctl start custom-early-oom

    echo "커스텀 Early OOM 서비스 설정 완료"
}

# 메뉴
echo "1) earlyoom 패키지 설치/설정"
echo "2) 커스텀 Early OOM 스크립트 생성"
echo "3) 모두 설정"
echo "4) 종료"

read -p "선택하세요 (1-4): " choice

case $choice in
    1) install_earlyoom ;;
    2) create_custom_early_oom ;;
    3)
        install_earlyoom
        create_custom_early_oom
        ;;
    4) echo "종료합니다." ;;
    *) echo "잘못된 선택입니다." ;;
esac
```

## 메모리 압박 감지 시스템

```python
#!/usr/bin/env python3
# memory_pressure_detector.py
import time
import psutil
import subprocess
import threading
from queue import Queue
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class MemoryPressureEvent:
    timestamp: float
    pressure_level: str  # 'low', 'medium', 'critical'
    memory_percent: float
    swap_percent: float
    available_gb: float
    top_processes: List[dict]

class MemoryPressureDetector:
    def __init__(self):
        self.pressure_thresholds = {
            'low': 70,      # 70% 사용
            'medium': 85,   # 85% 사용
            'critical': 95  # 95% 사용
        }
        self.event_queue = Queue()
        self.monitoring = False
        self.handlers = []

    def add_handler(self, handler_func):
        """압박 이벤트 핸들러 추가"""
        self.handlers.append(handler_func)

    def get_current_pressure(self):
        """현재 메모리 압박 수준 계산"""
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()

        # 상위 메모리 사용 프로세스
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'memory_percent']):
            try:
                if proc.info['memory_percent'] > 1.0:  # 1% 이상 사용하는 프로세스
                    processes.append({
                        'pid': proc.info['pid'],
                        'name': proc.info['name'],
                        'memory_percent': proc.info['memory_percent']
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        processes.sort(key=lambda x: x['memory_percent'], reverse=True)

        # 압박 수준 결정
        pressure_level = 'normal'
        if mem.percent >= self.pressure_thresholds['critical']:
            pressure_level = 'critical'
        elif mem.percent >= self.pressure_thresholds['medium']:
            pressure_level = 'medium'
        elif mem.percent >= self.pressure_thresholds['low']:
            pressure_level = 'low'

        return MemoryPressureEvent(
            timestamp=time.time(),
            pressure_level=pressure_level,
            memory_percent=mem.percent,
            swap_percent=swap.percent,
            available_gb=mem.available / 1024 / 1024 / 1024,
            top_processes=processes[:5]
        )

    def handle_pressure_event(self, event: MemoryPressureEvent):
        """압박 이벤트 처리"""
        for handler in self.handlers:
            try:
                handler(event)
            except Exception as e:
                print(f"Handler 오류: {e}")

    def monitor(self, interval=5):
        """메모리 압박 모니터링"""
        self.monitoring = True
        last_pressure_level = 'normal'

        print(f"메모리 압박 모니터링 시작 (간격: {interval}초)")

        while self.monitoring:
            event = self.get_current_pressure()

            # 압박 수준이 변화했거나 critical인 경우 이벤트 발생
            if (event.pressure_level != last_pressure_level or
                event.pressure_level == 'critical'):

                self.event_queue.put(event)
                self.handle_pressure_event(event)
                last_pressure_level = event.pressure_level

            time.sleep(interval)

    def stop_monitoring(self):
        """모니터링 중단"""
        self.monitoring = False

# 압박 이벤트 핸들러들
def log_pressure_event(event: MemoryPressureEvent):
    """압박 이벤트 로그 기록"""
    timestamp_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(event.timestamp))

    print(f", [{timestamp_str}] 메모리 압박 감지: {event.pressure_level.upper()}")
    print(f"메모리 사용률: {event.memory_percent:.1f}%")
    print(f"사용 가능: {event.available_gb:.1f}GB")
    print(f"스왈 사용률: {event.swap_percent:.1f}%")

    print("상위 메모리 사용 프로세스:")
    for proc in event.top_processes:
        print(f"  PID {proc['pid']:5d} {proc['name']:15s} {proc['memory_percent']:5.1f}%")

def alert_critical_pressure(event: MemoryPressureEvent):
    """위헙 수준 압박 시 알림"""
    if event.pressure_level == 'critical':
        message = f"🚨 메모리 위헙 수준! 사용률: {event.memory_percent:.1f}%"
        print(message)

        # 여기에 실제 알림 로직 추가
        # send_slack_alert(message)
        # send_email_alert(message)

def auto_cleanup_on_pressure(event: MemoryPressureEvent):
    """압박 시 자동 정리 작업"""
    if event.pressure_level in ['medium', 'critical']:
        print(f"메모리 정리 작업 실행...")

        # 페이지 캐시 정리
        try:
            subprocess.run(['sync'], check=True)
            subprocess.run(['echo', '1'],
                         stdout=open('/proc/sys/vm/drop_caches', 'w'),
                         check=True)
            print("페이지 캐시 정리 완료")
        except subprocess.CalledProcessError as e:
            print(f"캐시 정리 실패: {e}")

        # 스왈 사용량이 높으면 스왈 정리 시도
        if event.swap_percent > 50:
            try:
                subprocess.run(['swapoff', '-a'], check=True)
                subprocess.run(['swapon', '-a'], check=True)
                print("스왈 정리 완료")
            except subprocess.CalledProcessError as e:
                print(f"스왈 정리 실패: {e}")

def suggest_process_termination(event: MemoryPressureEvent):
    """프로세스 종료 제안"""
    if event.pressure_level == 'critical' and event.top_processes:
        print(", 프로세스 종료 제안:")

        for proc in event.top_processes[:3]:  # 상위 3개 프로세스
            # 중요한 시스템 프로세스는 제외
            if proc['name'] not in ['systemd', 'kernel', 'init', 'sshd']:
                print(f"  제안: {proc['name']} (PID {proc['pid']}) 종료 고려")
                print(f"        메모리 사용률: {proc['memory_percent']:.1f}%")
                print(f"        명령어: kill {proc['pid']}")

if __name__ == "__main__":
    detector = MemoryPressureDetector()

    # 핸들러 등록
    detector.add_handler(log_pressure_event)
    detector.add_handler(alert_critical_pressure)
    detector.add_handler(auto_cleanup_on_pressure)
    detector.add_handler(suggest_process_termination)

    try:
        # 모니터링 스레드 시작
        monitor_thread = threading.Thread(
            target=detector.monitor,
            args=(10,)  # 10초 간격
        )
        monitor_thread.daemon = True
        monitor_thread.start()

        print("메모리 압박 감지기 실행 중...")
        print("Ctrl+C로 중단")

        # 메인 스레드에서 대기
        monitor_thread.join()

    except KeyboardInterrupt:
        print(", 모니터링 중단 중...")
        detector.stop_monitoring()
```

## 핵심 요점

### 1. Early OOM 시스템

시스템 OOM이 발생하기 전에 메모리 부족을 감지하고 조치를 취할 수 있습니다.

### 2. 자동 정리 작업

메모리 압박이 감지되면 페이지 캐시 정리, 스왈 정리 등을 자동으로 수행합니다.

### 3. 예방적 모니터링

실시간 메모리 사용량 모니터링과 알림 시스템을 구축하여 문제를 사전에 예방할 수 있습니다.

---

**이전**: [08c-cgroup-container-oom.md](./03-06-04-cgroup-container-oom.md)  
**다음**: [03-50-oom-best-practices.md](./03-08-01-oom-best-practices.md)에서 OOM 방지 모범 사례와 전략을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 3-5시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-03-memory-system)

- [Chapter 3-2-1: 주소 변환은 어떻게 동작하는가](./03-02-01-address-translation.md)
- [Chapter 3-2-2: TLB와 캐싱은 어떻게 동작하는가](./03-02-02-tlb-caching.md)
- [Chapter 3-2-3: 페이지 폴트와 메모리 관리 개요](./03-02-03-page-fault.md)
- [Chapter 3-2-4: 페이지 폴트 종류와 처리 메커니즘](./03-02-04-page-fault-handling.md)
- [Chapter 3-2-5: Copy-on-Write (CoW) - fork()가 빠른 이유](./03-02-05-copy-on-write.md)

### 🏷️ 관련 키워드

`oom-prevention`, `memory-monitoring`, `early-warning`, `system-automation`, `process-management`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
