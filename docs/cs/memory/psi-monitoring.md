# PSI로 메모리 압력 실시간 모니터링하기

**Tags:** `#memory` `#monitoring` `#psi` `#pressure` `#performance` `#automation`

## 들어가며

"메모리 사용률은 80%인데 왜 애플리케이션이 느려지지?", "CPU는 50%인데 왜 처리량이 안 나오지?" 이런 의문을 가져보셨나요? 전통적인 메트릭은 시스템의 "고통"을 제대로 보여주지 못합니다. PSI(Pressure Stall Information)가 바로 이 문제를 해결합니다.

## PSI란 무엇인가?

PSI는 프로세스가 리소스(CPU, 메모리, I/O)를 기다리느라 **실행되지 못한 시간의 비율**을 측정합니다. 쉽게 말해, "애플리케이션이 얼마나 고통받고 있는가"를 직접 측정하는 지표입니다.

```
기존 메트릭의 한계:
├── Memory Usage: 8GB/10GB     ← 문제인지 아닌지 모름
├── CPU Usage: 50%              ← 왜 100%가 아닌지 모름
└── Load Average: 5.0           ← 원인이 뭔지 모름

PSI가 제공하는 정보:
└── "우리 앱이 30% 시간 동안 메모리 때문에 멈춰있음!"
    이것이 진짜 문제!
```

## PSI가 측정하는 것

```
프로세스 상태와 PSI:
┌─────────────────────────────────────┐
│ Running (CPU)                       │ ← 생산적 (Good!)
├─────────────────────────────────────┤
│ Waiting for Memory (STALLED)        │ ← PSI가 측정! (Bad!)
│ - Page fault 처리 중                │
│ - 메모리 할당 블록됨                 │
│ - 스왑 진행 중                      │
├─────────────────────────────────────┤
│ Waiting for I/O, sleeping 등        │ ← 다른 대기 (정상)
└─────────────────────────────────────┘
```

## PSI 읽는 방법

### 시스템 전체 PSI

```bash
$ cat /proc/pressure/memory
some avg10=12.34 avg60=8.90 avg300=5.67 total=123456789
full avg10=2.34 avg60=1.23 avg300=0.89 total=23456789
```

각 필드의 의미:
- **some**: 최소 하나의 태스크가 메모리 대기 중인 시간 비율
- **full**: 모든 태스크가 메모리 대기 중인 시간 비율
- **avg10/60/300**: 10초, 60초, 300초 평균 (백분율)
- **total**: 누적 대기 시간 (마이크로초)

### cgroup별 PSI

```bash
$ cat /sys/fs/cgroup/my-app/memory.pressure
some avg10=45.67 avg60=38.90 avg300=32.10 total=456789012
full avg10=23.45 avg60=18.90 avg300=15.67 total=234567890
```

## 실제 사례로 보는 PSI 해석

### 사례 1: 동일한 메모리 사용률, 다른 PSI

```bash
# Pod A: 메모리 4GB/5GB (80% 사용)
$ cat /sys/fs/cgroup/pod-a/memory.current
4294967296  # 4GB

$ cat /sys/fs/cgroup/pod-a/memory.pressure
some avg10=2.00 avg60=1.50 avg300=1.00
# → PSI 2%: 정상 동작, 대부분 cache

# Pod B: 메모리 4GB/5GB (80% 사용)
$ cat /sys/fs/cgroup/pod-b/memory.current  
4294967296  # 4GB

$ cat /sys/fs/cgroup/pod-b/memory.pressure
some avg10=45.00 avg60=42.00 avg300=40.00
# → PSI 45%: 심각한 메모리 부족!
```

전통적 모니터링: 둘 다 80% 사용 (구분 안 됨)
PSI 모니터링: Pod B가 고통받고 있음이 명확!

### 사례 2: 데이터베이스 성능 저하

```python
# PSI 모니터링 스크립트
import time

def monitor_database_psi():
    with open('/sys/fs/cgroup/mysql/memory.pressure') as f:
        line = f.readline()
        # some avg10=35.67 형식 파싱
        psi_value = float(line.split()[0].split('=')[1])
        
        if psi_value > 10:
            print(f"WARNING: Database memory pressure: {psi_value}%")
            # 캐시 크기 조정 또는 쿼리 최적화 필요
        elif psi_value > 30:
            print(f"CRITICAL: Database struggling: {psi_value}%")
            # 즉시 조치 필요: 메모리 증설 또는 부하 분산
```

## PSI 기반 자동화

### PSI 트리거 설정

PSI는 임계값 기반 트리거를 지원합니다:

```c
#include <fcntl.h>
#include <poll.h>
#include <stdio.h>

int setup_psi_trigger() {
    // memory.pressure 파일 열기
    int fd = open("/proc/pressure/memory", O_RDWR | O_NONBLOCK);
    
    // 트리거 설정: 1초 동안 150ms 이상 stall
    const char trigger[] = "some 150000 1000000";
    write(fd, trigger, strlen(trigger) + 1);
    
    // 이벤트 대기
    struct pollfd fds = {
        .fd = fd,
        .events = POLLPRI
    };
    
    while (1) {
        if (poll(&fds, 1, -1) > 0) {
            if (fds.revents & POLLPRI) {
                printf("Memory pressure threshold exceeded!\n");
                // 자동 조치 실행
                handle_memory_pressure();
            }
        }
    }
}
```

### systemd를 통한 PSI 모니터링

```ini
# /etc/systemd/system/memory-monitor.service
[Unit]
Description=Memory Pressure Monitor

[Service]
Type=simple
ExecStart=/usr/local/bin/psi-monitor
Restart=always

# /usr/local/bin/psi-monitor
#!/bin/bash
while true; do
    PSI=$(cat /proc/pressure/memory | grep some | awk '{print $2}' | cut -d= -f2)
    if (( $(echo "$PSI > 20" | bc -l) )); then
        systemctl restart heavy-service
        logger "Restarted heavy-service due to memory pressure"
    fi
    sleep 10
done
```

## Kubernetes에서 PSI 활용

### Pod별 PSI 모니터링

```bash
#!/bin/bash
# k8s-psi-monitor.sh

# 모든 Pod의 PSI 확인
for pod in $(kubectl get pods -o name); do
    POD_NAME=$(echo $pod | cut -d/ -f2)
    POD_UID=$(kubectl get $pod -o jsonpath='{.metadata.uid}')
    
    CGROUP_PATH="/sys/fs/cgroup/memory/kubepods/pod${POD_UID}"
    
    if [ -f "$CGROUP_PATH/memory.pressure" ]; then
        PSI=$(cat $CGROUP_PATH/memory.pressure | head -1 | awk '{print $2}' | cut -d= -f2)
        echo "$POD_NAME: $PSI%"
    fi
done | sort -t: -k2 -rn
```

### Prometheus로 PSI 메트릭 수집

```yaml
# Prometheus ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    scrape_configs:
    - job_name: 'node-exporter'
      static_configs:
      - targets: ['node-exporter:9100']
```

```promql
# Prometheus 쿼리
# 메모리 압력 비율
rate(node_pressure_memory_waiting_seconds_total[5m]) * 100

# CPU 압력 비율  
rate(node_pressure_cpu_waiting_seconds_total[5m]) * 100

# Alert 규칙
- alert: HighMemoryPressure
  expr: |
    rate(node_pressure_memory_waiting_seconds_total[5m]) * 100 > 20
  for: 5m
  annotations:
    summary: "Node {{ $labels.instance }} experiencing memory pressure"
```

## 실전 PSI 임계값

### Facebook의 프로덕션 임계값

Facebook은 대규모 프로덕션 환경에서 다음 임계값을 사용합니다:

```json
{
  "web_services": {
    "memory_some": {
      "warning": 15,
      "critical": 30
    }
  },
  "databases": {
    "memory_some": {
      "warning": 10,
      "critical": 25
    }
  },
  "batch_processing": {
    "memory_some": {
      "warning": 50,
      "critical": 70
    },
    "cpu_some": {
      "warning": 80,
      "critical": 90
    }
  }
}
```

### 워크로드별 권장 임계값

```yaml
# 실시간 서비스 (낮은 지연 중요)
realtime:
  memory_pressure_threshold: 5%
  action: scale_out
  
# 웹 애플리케이션 (균형)
web:
  memory_pressure_threshold: 20%
  action: restart_or_scale
  
# 배치 작업 (처리량 중요)
batch:
  memory_pressure_threshold: 50%
  action: log_only
```

## PSI 기반 오토스케일링

### Kubernetes HPA with PSI

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: psi-based-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Pods
    pods:
      metric:
        name: memory_pressure
      target:
        type: AverageValue
        averageValue: "20"  # 20% PSI
```

### 커스텀 메트릭 서버

```go
// PSI 기반 커스텀 메트릭 서버
package main

import (
    "io/ioutil"
    "strings"
    "strconv"
)

func GetMemoryPressure(cgroupPath string) float64 {
    data, _ := ioutil.ReadFile(cgroupPath + "/memory.pressure")
    lines := strings.Split(string(data), "\n")
    
    // "some avg10=12.34" 파싱
    parts := strings.Split(lines[0], " ")
    for _, part := range parts {
        if strings.HasPrefix(part, "avg10=") {
            val, _ := strconv.ParseFloat(strings.TrimPrefix(part, "avg10="), 64)
            return val
        }
    }
    return 0
}

func ScaleDecision(pressure float64) string {
    if pressure > 30 {
        return "SCALE_OUT_IMMEDIATELY"
    } else if pressure > 20 {
        return "SCALE_OUT"
    } else if pressure < 5 {
        return "SCALE_IN"
    }
    return "MAINTAIN"
}
```

## PSI vs 전통적 메트릭

### 비교 실험

```bash
# 동일한 부하 테스트
$ stress-ng --vm 4 --vm-bytes 1G --timeout 60s

# 전통적 메트릭
$ free -h
              total        used        free
Mem:           15Gi        12Gi       3Gi
# → 메모리 80% 사용, 정상처럼 보임

$ top
%CPU: 45.2 us, 12.3 sy, 0.0 ni, 35.5 id, 7.0 wa
# → CPU 여유 있음, 문제 없어 보임

# PSI 메트릭
$ cat /proc/pressure/memory
some avg10=65.43 avg60=58.21 avg300=45.67
# → 65% 시간 동안 메모리 대기! 심각한 문제!
```

### 실제 성능과의 상관관계

```python
# 처리량과 PSI 상관관계 분석
import pandas as pd
import matplotlib.pyplot as plt

data = pd.DataFrame({
    'memory_usage': [50, 60, 70, 80, 90, 95],
    'psi_some': [1, 3, 8, 25, 60, 85],
    'throughput': [1000, 980, 950, 750, 300, 50]
})

# 메모리 사용률 vs 처리량: 약한 상관관계
# PSI vs 처리량: 강한 역상관관계!
correlation_usage = data['memory_usage'].corr(data['throughput'])  # -0.65
correlation_psi = data['psi_some'].corr(data['throughput'])        # -0.98
```

## 실전 PSI 활용 패턴

### 1. 조기 경보 시스템

```bash
#!/bin/bash
# early-warning.sh

THRESHOLD_WARNING=10
THRESHOLD_CRITICAL=25

while true; do
    PSI=$(cat /proc/pressure/memory | grep some | awk '{print $2}' | cut -d= -f2)
    
    if (( $(echo "$PSI > $THRESHOLD_CRITICAL" | bc -l) )); then
        # 긴급 조치
        echo "CRITICAL: Memory pressure at $PSI%"
        # 캐시 비우기, 불필요한 서비스 중단
        sync && echo 1 > /proc/sys/vm/drop_caches
        systemctl stop non-critical-service
        
    elif (( $(echo "$PSI > $THRESHOLD_WARNING" | bc -l) )); then
        # 경고
        echo "WARNING: Memory pressure at $PSI%"
        # 로그 로테이션, 임시 파일 정리
        find /tmp -mtime +1 -delete
    fi
    
    sleep 5
done
```

### 2. 워크로드 스케줄링

```python
def schedule_workload_by_psi():
    nodes = get_all_nodes()
    workload = get_pending_workload()
    
    # PSI가 가장 낮은 노드 선택
    best_node = None
    lowest_psi = 100
    
    for node in nodes:
        psi = get_node_psi(node)
        if psi < lowest_psi:
            lowest_psi = psi
            best_node = node
    
    if lowest_psi > 30:
        # 모든 노드가 압력 상태
        scale_out_cluster()
    else:
        deploy_to_node(workload, best_node)
```

### 3. 데이터베이스 튜닝

```sql
-- PostgreSQL: PSI 기반 work_mem 조정
DO $$
DECLARE
    current_psi FLOAT;
BEGIN
    -- PSI 확인 (외부 스크립트 통해)
    SELECT get_system_psi() INTO current_psi;
    
    IF current_psi > 20 THEN
        -- 메모리 압력 높음: work_mem 감소
        ALTER SYSTEM SET work_mem = '4MB';
    ELSIF current_psi < 5 THEN
        -- 메모리 여유: work_mem 증가
        ALTER SYSTEM SET work_mem = '16MB';
    END IF;
    
    SELECT pg_reload_conf();
END $$;
```

## PSI 모니터링 대시보드

### Grafana 대시보드 설정

```json
{
  "dashboard": {
    "title": "PSI Monitoring",
    "panels": [
      {
        "title": "Memory Pressure",
        "targets": [
          {
            "expr": "rate(node_pressure_memory_waiting_seconds_total[5m]) * 100",
            "legendFormat": "{{instance}}"
          }
        ],
        "alert": {
          "conditions": [
            {
              "evaluator": {
                "params": [20],
                "type": "gt"
              }
            }
          ]
        }
      }
    ]
  }
}
```

## 정리

PSI는 시스템의 실제 "고통"을 측정하는 혁신적인 지표입니다:

1. **전통적 메트릭의 한계 극복**: 사용률이 아닌 실제 성능 영향 측정
2. **조기 경보 가능**: 문제가 심각해지기 전에 감지
3. **자동화 친화적**: 트리거 기반 자동 대응 가능
4. **워크로드별 최적화**: 각 서비스 특성에 맞는 임계값 설정
5. **스케일링 결정 개선**: PSI 기반으로 정확한 스케일링 시점 파악

다음 글에서는 이러한 메모리 관리를 컨테이너 환경에서 구현하는 Cgroup에 대해 알아보겠습니다.

---

## 관련 문서

- [[page-cache]] - Page Cache와 메모리 압력
- [[cgroup-container-memory]] - Cgroup 메모리 제한과 PSI
- [[oom-killer]] - OOM 상황에서의 PSI 변화
- [[process-memory-structure]] - 프로세스 메모리와 압력

---

**관련 태그**: `#system-monitoring` `#pressure-metrics` `#performance-analysis` `#automation`