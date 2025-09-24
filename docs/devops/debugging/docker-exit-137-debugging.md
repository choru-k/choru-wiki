---
tags:
  - Docker
  - Debugging
  - Exit-Code
  - Signal
  - OOM
  - SystemD
  - Production
---

# Docker Exit Code 137: SIGKILL 신호와 진짜 원인 찾기

## 들어가며

"새로운 서비스를 배포했는데 계속 Exit Code 137로 죽네? OOM이 발생한 건가?" Production 환경에서 가장 빈번하게 만나는 미스터리 중 하나가 바로 Docker Exit Code 137입니다.**대부분 OOM으로 알려져 있지만, 실제로는 SIGKILL 신호의 다양한 원인들이 숨어있습니다.**진짜 원인을 찾는 체계적인 디버깅 방법을 살펴보겠습니다.

## Docker Exit Code의 이해

### Exit Code 체계

Docker 컨테이너의 종료 상태는 다음과 같이 정의됩니다:

```text
# Docker Exit Codes
Exit Code 0   : 정상 종료
Exit Code 1   : 일반적인 애플리케이션 오류
Exit Code 125 : Docker daemon 오류
Exit Code 126 : 실행 권한 없음
Exit Code 127 : 명령어/파일을 찾을 수 없음
Exit Code 137 : SIGKILL (9) 신호로 인한 강제 종료  ← 주목!
Exit Code 139 : SIGSEGV (11) Segmentation fault
Exit Code 143 : SIGTERM (15) 정상적인 종료 요청
```

### SIGKILL과 Exit Code 137의 관계

```c
// Linux kernel signal handling
#define SIGKILL 9

// Exit code calculation in Docker
exit_code = 128 + signal_number
// SIGKILL(9) → 128 + 9 = 137
```

**중요한 사실**: Exit Code 137 = SIGKILL 신호 = 누군가가 프로세스를 강제로 죽였다는 의미

## SIGKILL의 다양한 원인들

### 1. OOM Killer (가장 흔한 경우)

```bash
# OOM 발생 확인
journalctl -k | grep -i -E "memory|oom|killed"
```

```text
# 출력 예시:
kernel: Out of memory: Killed process 12345 (myapp) total-vm:2048000kB, anon-rss:1024000kB, file-rss:0kB
kernel: oom-kill:constraint=CONSTRAINT_MEMCG,nodemask=(null),cpuset=docker-abc123.scope,mems_allowed=0,oom_memcg=/docker/abc123,task_memcg=/docker/abc123
```

메모리 사용량 추적:

```bash
# 컨테이너 메모리 사용량 실시간 모니터링
docker stats container_name --no-stream

# cgroup 메모리 제한 확인
cat /sys/fs/cgroup/memory/docker/container_id/memory.limit_in_bytes
cat /sys/fs/cgroup/memory/docker/container_id/memory.usage_in_bytes

# OOM 발생 카운터
cat /sys/fs/cgroup/memory/docker/container_id/memory.oom_control
```

### 2. SystemD 의존성 문제

실제 Production 환경에서 경험한 복잡한 시나리오입니다:

```bash
# systemd 서비스 의존성 확인
systemctl show myapp.service | grep -E "(After|Requires|Wants|PartOf)"
```

```text
# 출력 예시:
After=nginx.service
PartOf=nginx.service    # 위험! nginx가 죽으면 myapp도 죽음
```

# nginx 서비스 상태 확인

systemctl status nginx.service

# Active: failed (Result: exit-code)

**문제 상황 재현:**

```yaml
# /etc/systemd/system/myapp.service
[Unit]
Description=My Application
After=nginx.service
PartOf=nginx.service    # 이 설정이 문제

[Service]
Type=simple
ExecStart=/usr/bin/docker run --name myapp myapp:latest
Restart=always

[Install]
WantedBy=multi-user.target
```

nginx가 실패하면 systemd가 myapp에 SIGKILL을 전송합니다:

```bash
# systemd 로그 확인
journalctl -u myapp.service -f
```

```text
# 출력:
systemd[1]: nginx.service failed
systemd[1]: Stopping myapp.service (PartOf dependency)
systemd[1]: Sent signal KILL to main process 12345 (myapp)
```

## 3. Docker 리소스 제한

```bash
# Docker 컨테이너 리소스 제한 확인
docker inspect container_name | jq '.HostConfig.Memory'
docker inspect container_name | jq '.HostConfig.CpuShares'

# cgroup 제한 확인
cat /sys/fs/cgroup/memory/docker/container_id/memory.limit_in_bytes
echo $(($(cat /sys/fs/cgroup/memory/docker/container_id/memory.limit_in_bytes) / 1024 / 1024))MB
```

## 4. 사용자 수동 종료

```bash
# 프로세스 종료 로그 추적
ausearch -x docker | grep -i kill
ausearch -x systemd | grep -i kill

# 사용자 activity 확인
last | grep -E "(root|ubuntu|admin)"
history | grep -E "(docker.*kill|docker.*stop|systemctl.*stop)"
```

### 5. 디스크 공간 부족

```bash
# 디스크 사용량 확인
df -h
docker system df

# Docker 로그 공간 확인
du -sh /var/lib/docker/containers/*/
find /var/lib/docker/containers/ -name "*.log" -exec ls -lh {} \;
```

## 체계적 디버깅 접근법

### 1단계: 기본 정보 수집

```bash
#!/bin/bash
# debug_exit_137.sh

CONTAINER_NAME="$1"
if [[ -z "$CONTAINER_NAME" ]]; then
    echo "Usage: $0 <container_name>"
    exit 1
fi

echo "=== Docker Exit 137 Debugging Report ==="
echo "Container: $CONTAINER_NAME"
echo "Timestamp: $(date)"
echo

echo "1. Container Exit Status:"
docker ps -a | grep "$CONTAINER_NAME"
echo

echo "2. Container Resource Limits:"
docker inspect "$CONTAINER_NAME" | jq '.HostConfig | {Memory, CpuShares, PidsLimit}'
echo

echo "3. Recent Container Logs:"
docker logs --tail 50 "$CONTAINER_NAME"
echo

echo "4. System Memory Status:"
free -h
cat /proc/meminfo | grep -E "(MemTotal|MemAvailable|MemFree)"
echo

echo "5. Kernel OOM Messages (last 1 hour):"
journalctl --since "1 hour ago" -k | grep -i -E "memory|oom|killed" | tail -10
echo

echo "6. SystemD Service Status (if applicable):"
# 컨테이너와 연관된 systemd 서비스 찾기
SERVICE_NAME=$(systemctl list-units --type=service | grep -i "$CONTAINER_NAME" | awk '{print $1}' | head -1)
if [[ -n "$SERVICE_NAME" ]]; then
    echo "Found service: $SERVICE_NAME"
    systemctl status "$SERVICE_NAME" --no-pager -l
    echo
    echo "Service Dependencies:"
    systemctl show "$SERVICE_NAME" | grep -E "(After|Requires|Wants|PartOf)"
else
    echo "No associated systemd service found"
fi
echo

echo "7. Recent System Activity:"
last | head -5
echo

echo "=== End of Report ==="
```

### 2단계: 메모리 프로파일링

```bash
# 메모리 사용 패턴 분석
#!/bin/bash
# memory_profile.sh

CONTAINER_NAME="$1"
DURATION=${2:-300}  # 5분 기본

echo "Profiling memory usage for $CONTAINER_NAME over ${DURATION}s"

# 실시간 메모리 모니터링
while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    MEMORY_USAGE=$(docker stats "$CONTAINER_NAME" --no-stream --format "{{.MemUsage}}")
    MEMORY_PERCENT=$(docker stats "$CONTAINER_NAME" --no-stream --format "{{.MemPerc}}")

    echo "$TIMESTAMP - Memory: $MEMORY_USAGE ($MEMORY_PERCENT)"

    # 메모리 사용량이 임계치 초과시 상세 분석
    PERCENT_NUM=$(echo "$MEMORY_PERCENT" | sed 's/%//')
    if (( $(echo "$PERCENT_NUM > 80" | bc -l) )); then
        echo "HIGH MEMORY USAGE DETECTED!"
        docker exec "$CONTAINER_NAME" ps aux --sort=-%mem | head -10
    fi

    sleep 10
done
```

### 3단계: 종합 분석

```python
#!/usr/bin/env python3
"""
exit_137_analyzer.py - Docker Exit 137 종합 분석 도구
"""

import subprocess
import json
import re
from datetime import datetime, timedelta

class Exit137Analyzer:
    def __init__(self, container_name):
        self.container_name = container_name
        self.findings = []

    def analyze_container(self):
        """컨테이너 기본 정보 분석"""
        try:
            result = subprocess.run(['docker', 'inspect', self.container_name],
                                  capture_output=True, text=True)
            if result.returncode == 0:
                container_info = json.loads(result.stdout)[0]

                # Exit code 확인
                exit_code = container_info['State']['ExitCode']
                if exit_code == 137:
                    self.findings.append("✓ Confirmed Exit Code 137 (SIGKILL)")

                # 메모리 제한 확인
                memory_limit = container_info['HostConfig']['Memory']
                if memory_limit > 0:
                    self.findings.append(f"Memory limit: {memory_limit // 1024 // 1024}MB")
                else:
                    self.findings.append("⚠ No memory limit set - potential OOM risk")

                # 재시작 정책 확인
                restart_policy = container_info['HostConfig']['RestartPolicy']['Name']
                self.findings.append(f"Restart policy: {restart_policy}")

        except Exception as e:
            self.findings.append(f"❌ Container analysis failed: {e}")

    def check_oom_killer(self):
        """OOM Killer 활동 확인"""
        try:
            result = subprocess.run(['journalctl', '-k', '--since', '1 hour ago'],
                                  capture_output=True, text=True)

            oom_messages = [line for line in result.stdout.split(', ')
                           if re.search(r'oom.*kill|killed.*process', line, re.IGNORECASE)]

            if oom_messages:
                self.findings.append("🔥 OOM Killer activity detected:")
                for msg in oom_messages[-3:]:  # 최근 3개만
                    self.findings.append(f"   {msg.strip()}")
            else:
                self.findings.append("✓ No OOM Killer activity in last hour")

        except Exception as e:
            self.findings.append(f"⚠ Could not check OOM logs: {e}")

    def check_systemd_dependencies(self):
        """SystemD 의존성 문제 확인"""
        try:
            # 컨테이너 이름과 유사한 서비스 찾기
            result = subprocess.run(['systemctl', 'list-units', '--type=service'],
                                  capture_output=True, text=True)

            services = [line for line in result.stdout.split(', ')
                       if self.container_name.lower() in line.lower()]

            if services:
                service_name = services[0].split()[0]
                self.findings.append(f"Found related service: {service_name}")

                # 의존성 확인
                dep_result = subprocess.run(['systemctl', 'show', service_name],
                                          capture_output=True, text=True)

                dangerous_deps = []
                for line in dep_result.stdout.split(', '):
                    if re.match(r'(After|PartOf|Requires)=', line) and line.strip() != '':
                        dangerous_deps.append(line.strip())

                if dangerous_deps:
                    self.findings.append("⚠ SystemD dependencies found:")
                    for dep in dangerous_deps:
                        self.findings.append(f"   {dep}")
                        if 'PartOf=' in dep:
                            self.findings.append("   🔥 PartOf dependency can cause cascade failures!")
            else:
                self.findings.append("✓ No related systemd services found")

        except Exception as e:
            self.findings.append(f"⚠ SystemD analysis failed: {e}")

    def check_disk_space(self):
        """디스크 공간 확인"""
        try:
            result = subprocess.run(['df', '-h'], capture_output=True, text=True)

            for line in result.stdout.split(', ')[1:]:  # 헤더 제외
                if line.strip():
                    fields = line.split()
                    if len(fields) >= 5:
                        usage_percent = int(fields[4].rstrip('%'))
                        if usage_percent > 90:
                            self.findings.append(f"🔥 High disk usage: {fields[5]} at {usage_percent}%")
                        elif usage_percent > 80:
                            self.findings.append(f"⚠ Moderate disk usage: {fields[5]} at {usage_percent}%")

            # Docker 디스크 사용량
            docker_result = subprocess.run(['docker', 'system', 'df'],
                                         capture_output=True, text=True)
            self.findings.append("Docker disk usage:")
            for line in docker_result.stdout.split(', ')[1:4]:  # TYPE, TOTAL, ACTIVE 라인만
                if line.strip():
                    self.findings.append(f"   {line.strip()}")

        except Exception as e:
            self.findings.append(f"⚠ Disk space check failed: {e}")

    def generate_report(self):
        """최종 보고서 생성"""
        print(f", === Exit 137 Analysis Report for {self.container_name} ===")
        print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(", Findings:")

        for i, finding in enumerate(self.findings, 1):
            print(f"{i:2d}. {finding}")

        print(", === Recommended Actions ===")

        # 권장사항 생성
        if any("OOM" in finding for finding in self.findings):
            print("• Increase memory limits or optimize application memory usage")

        if any("PartOf" in finding for finding in self.findings):
            print("• Review systemd service dependencies - remove PartOf if not necessary")

        if any("No memory limit" in finding for finding in self.findings):
            print("• Set appropriate memory limits to prevent system-wide OOM")

        if any("High disk usage" in finding for finding in self.findings):
            print("• Clean up disk space and implement log rotation")

if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("Usage: python3 exit_137_analyzer.py <container_name>")
        sys.exit(1)

    analyzer = Exit137Analyzer(sys.argv[1])
    analyzer.analyze_container()
    analyzer.check_oom_killer()
    analyzer.check_systemd_dependencies()
    analyzer.check_disk_space()
    analyzer.generate_report()
```

## 예방 및 모니터링 전략

### 1. 메모리 모니터링 설정

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    image: myapp:latest
    deploy:
      resources:
        limits:
          memory: 512M      # 명시적 메모리 제한
        reservations:
          memory: 256M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"     # 로그 크기 제한
        max-file: "3"
    restart: unless-stopped # 무한 재시작 방지
```

### 2. 헬스체크 구현

```dockerfile
FROM node:16-alpine

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# 헬스체크로 메모리 사용량 모니터링
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

CMD ["node", "server.js"]
```

```javascript
// healthcheck.js
const process = require('process');

const memUsage = process.memoryUsage();
const memUsageMB = memUsage.rss / 1024 / 1024;

// 400MB 이상 사용 시 경고
if (memUsageMB > 400) {
  console.warn(`High memory usage: ${memUsageMB.toFixed(2)}MB`);
  process.exit(1);
}

console.log(`Memory OK: ${memUsageMB.toFixed(2)}MB`);
process.exit(0);
```

### 3. SystemD 서비스 최적화

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Application
After=docker.service
Requires=docker.service
# PartOf 제거 - 다른 서비스 실패 시 연쇄 실패 방지

[Service]
Type=forking
ExecStartPre=/usr/bin/docker stop myapp || true
ExecStartPre=/usr/bin/docker rm myapp || true
ExecStart=/usr/bin/docker run -d --name myapp \
  --memory=512m \
  --memory-swap=512m \
  myapp:latest

ExecStop=/usr/bin/docker stop myapp
ExecReload=/usr/bin/docker restart myapp

# 재시작 정책 개선
Restart=on-failure
RestartSec=5s
StartLimitInterval=60s
StartLimitBurst=3

[Install]
WantedBy=multi-user.target
```

### 4. 모니터링 알람

```bash
#!/bin/bash
# exit_137_monitor.sh - cron으로 5분마다 실행

ALERT_EMAIL="admin@company.com"
LOG_FILE="/var/log/exit_137_monitor.log"

# Exit 137로 종료된 컨테이너 찾기
EXITED_137=$(docker ps -a --filter "exited=137" --format "{{.Names}}" | head -5)

if [[ -n "$EXITED_137" ]]; then
    echo "$(date): Found containers with Exit 137:" >> "$LOG_FILE"
    echo "$EXITED_137" >> "$LOG_FILE"

    # 이메일 알림
    echo "Containers exited with code 137: $EXITED_137" | \
        mail -s "Docker Exit 137 Alert" "$ALERT_EMAIL"

    # 자동 분석 실행
    for container in $EXITED_137; do
        python3 /opt/scripts/exit_137_analyzer.py "$container" >> "$LOG_FILE"
        echo "---" >> "$LOG_FILE"
    done
fi
```

## Kubernetes 환경에서의 Exit 137

### Pod 수준에서의 분석

```bash
# Pod의 Exit Code 확인
kubectl describe pod problematic-pod

# Events 섹션에서 원인 확인:
# Normal   Killing  Pod  Stopping container myapp
# Warning  Failed   Pod  Error: failed to start container: OOMKilled

# 컨테이너별 종료 원인
kubectl get pod problematic-pod -o jsonpath='{.status.containerStatuses[*].lastState.terminated}'
```

### OOMKilled vs Evicted 구분

```bash
# OOMKilled: 메모리 부족으로 컨테이너 내부에서 프로세스 kill
# Evicted: 노드 리소스 부족으로 Pod 전체 제거

kubectl get events --sort-by='.lastTimestamp' | grep -E "(OOMKilled|Evicted)"
```

## 정리

Docker Exit Code 137의 진단 우선순위:

1.**OOM Killer 확인**: `journalctl -k | grep oom` (가장 흔한 원인)
2.**SystemD 의존성**: `systemctl show service | grep PartOf` (연쇄 실패)
3.**리소스 제한**: `docker inspect | jq .HostConfig.Memory`
4.**디스크 공간**: `df -h` (로그 파일 급증)
5.**사용자 개입**: `history | grep kill`

**예방 전략:**

- 적절한 메모리 제한 설정과 모니터링
- SystemD 의존성 최소화 (PartOf 사용 주의)
- 헬스체크를 통한 사전 감지
- 로그 로테이션으로 디스크 공간 관리
- 자동화된 모니터링과 알람

**Production에서 기억할 점:**

- Exit 137 ≠ 항상 OOM (SIGKILL의 다양한 원인 존재)
- SystemD + Docker 조합에서 의존성 연쇄 실패 주의
- Monolithic 배포보다 Kubernetes Pod가 격리성 측면에서 유리

## 관련 문서

- [Kubernetes OOM 디버깅](../kubernetes/oom-debugging.md)
- [Container 메모리 최적화](../performance/container-memory-optimization.md)
- [SystemD 서비스 관리](../system/systemd-service-management.md)
