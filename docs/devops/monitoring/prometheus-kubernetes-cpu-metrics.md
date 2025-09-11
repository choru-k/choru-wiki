---
tags:
  - Prometheus
  - Kubernetes
  - Monitoring
  - CPU
  - Metrics
  - cAdvisor
  - Performance
---

# Prometheus Kubernetes CPU 메트릭: 정확한 모니터링을 위한 완벽 가이드

## 들어가며

"Grafana 대시보드에서 CPU 사용량이 실제보다 2배로 나오는데 뭐가 잘못된 거야?" Kubernetes 환경에서 Prometheus로 CPU 모니터링을 하다 보면 이런 의문을 가져본 적이 있을 것입니다. **container_cpu_usage_seconds_total** 메트릭의 함정과 정확한 CPU 모니터링 방법을 kernel 수준에서 완전히 분석해보겠습니다.

## Container CPU 메트릭의 이해

### cAdvisor가 수집하는 CPU 메트릭

Kubernetes에서 CPU 메트릭은 kubelet에 내장된 cAdvisor가 cgroup 파일시스템을 통해 수집합니다

```
cgroup CPU Accounting:
┌─────────────────────────────────┐
│  /sys/fs/cgroup/cpu,cpuacct/    │
├─────────────────────────────────┤
│  kubepods.slice/                │ ← QoS 기반 slice
│  ├─ burstable/                  │
│  ├─ besteffort/                 │
│  └─ guaranteed/                 │
│     └─ pod-abc123.slice/        │ ← 개별 Pod
│        ├─ container1/           │ ← 개별 Container
│        │  └─ cpuacct.usage      │ ← 실제 데이터 소스
│        └─ container2/           │
└─────────────────────────────────┘
```

### container_cpu_usage_seconds_total 메트릭 구조

```bash
# Prometheus에서 확인
curl -s http://prometheus:9090/api/v1/label/__name__/values | jq '.data[]' | grep container_cpu

# 실제 메트릭 형태
container_cpu_usage_seconds_total{
  container="application",    # 컨테이너 이름
  pod="app-abc123",          # Pod 이름  
  namespace="production",     # 네임스페이스
  cpu="total",               # CPU 식별자
  id="/kubepods.slice/...",  # cgroup 경로
  instance="node1:10250",    # kubelet 엔드포인트
  job="kubernetes-nodes-cadvisor"
}
```

## CPU 메트릭 중복 계산 문제

### 문제 상황: container="" 레이블

가장 흔한 실수는 다음과 같은 쿼리입니다:

```promql
# 잘못된 쿼리 - 2배로 계산됨
sum(rate(container_cpu_usage_seconds_total{
  product=~"application",
  pod=~"proxysql-.*", 
  cpu="total"
}[5m])) by (pod)
```

이 쿼리의 문제점:

```bash
```text
# container="" (빈 값)인 메트릭도 포함됨
container_cpu_usage_seconds_total{container="",pod="app-123",cpu="total"} 1.5
container_cpu_usage_seconds_total{container="app",pod="app-123",cpu="total"} 1.5
```

```

### 정확한 쿼리 방법

```promql
# 정확한 쿼리 - 실제 컨테이너만
sum(rate(container_cpu_usage_seconds_total{
  product=~"application",
  pod=~"proxysql-.*", 
  cpu="total",
  container!="",      # 빈 컨테이너 제외
  container!="POD"    # pause 컨테이너 제외
}[5m])) by (pod)
```

## cAdvisor CPU 데이터 수집 메커니즘

### Kernel cgroup CPU Accounting

cAdvisor는 다음 커널 파일에서 데이터를 읽습니다:

```c
// kernel/cgroup/cpuacct.c (simplified)
static u64 cpuacct_cpuusage_read(struct cgroup_subsys_state *css, 
                                  struct cftype *cft)
{
    struct cpuacct *ca = css_ca(css);
    u64 totalcpuusage = 0;
    int i;

    for_each_possible_cpu(i) {
        totalcpuusage += ca->cpuusage[i];  // 누적된 CPU 사용시간
    }
    
    return totalcpuusage;  // nanoseconds 단위
}
```

실제 파일 경로:

```bash
# Pod의 총 CPU 사용량
cat /sys/fs/cgroup/cpu,cpuacct/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod12345.slice/cpuacct.usage
1234567890123  # nanoseconds

# 개별 컨테이너 CPU 사용량
cat /sys/fs/cgroup/cpu,cpuacct/kubepods.slice/.../container-abc.scope/cpuacct.usage
567890123456   # nanoseconds
```

### cAdvisor 수집 로직

```go
// github.com/google/cadvisor (simplified)
func (c *containerHandler) GetStats() (*info.ContainerStats, error) {
    stats := &info.ContainerStats{}
    
    // cgroup에서 CPU 사용량 읽기
    cpuUsage, err := c.cgroupManager.GetCpuUsage()
    if err != nil {
        return nil, err
    }
    
    stats.Cpu.Usage = info.CpuUsage{
        Total:  cpuUsage.Total,           // container_cpu_usage_seconds_total
        PerCpu: cpuUsage.PerCpu,         // 개별 CPU 코어별
        User:   cpuUsage.User,           // user space 시간
        System: cpuUsage.System,         // kernel space 시간
    }
    
    return stats, nil
}
```

## Container와 Pod 레벨 메트릭 구분

### Container="" 메트릭의 의미

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp-pod
spec:
  containers:
  - name: application     # container="application" 메트릭
    image: myapp:latest
  - name: sidecar        # container="sidecar" 메트릭  
    image: proxy:latest
# 추가로 container="" 메트릭 - Pod 전체 사용량
# 그리고 container="POD" 메트릭 - pause 컨테이너
```

메트릭 예시:

```bash
# Pod 전체 사용량 (모든 컨테이너 합계)
container_cpu_usage_seconds_total{container="",pod="myapp-pod"} 2.5

# 개별 컨테이너
container_cpu_usage_seconds_total{container="application",pod="myapp-pod"} 2.0
container_cpu_usage_seconds_total{container="sidecar",pod="myapp-pod"} 0.4

# pause 컨테이너 (거의 CPU 사용하지 않음)
container_cpu_usage_seconds_total{container="POD",pod="myapp-pod"} 0.1
```

### 정확한 모니터링 쿼리 패턴

#### 1. Pod별 총 CPU 사용량

```promql
# 방법 1: container="" 사용 (Pod 전체)
sum(rate(container_cpu_usage_seconds_total{
  namespace="production",
  pod=~"myapp-.*",
  container=""
}[5m])) by (pod)

# 방법 2: 개별 컨테이너 합계 (더 정확)
sum(rate(container_cpu_usage_seconds_total{
  namespace="production", 
  pod=~"myapp-.*",
  container!="",
  container!="POD"
}[5m])) by (pod)
```

#### 2. 컨테이너별 상세 분석

```promql
# 컨테이너별 CPU 사용량
sum(rate(container_cpu_usage_seconds_total{
  namespace="production",
  pod=~"myapp-.*", 
  container!="",
  container!="POD"
}[5m])) by (pod, container)

# 사이드카 오버헤드 분석
sum(rate(container_cpu_usage_seconds_total{
  namespace="production",
  container=~"istio-proxy|envoy"
}[5m])) by (pod)
```

#### 3. 노드별 집계

```promql
# 노드별 총 CPU 사용량
sum(rate(container_cpu_usage_seconds_total{
  container!="",
  container!="POD"  
}[5m])) by (instance)

# 노드 CPU 사용률 (전체 코어 대비)
sum(rate(container_cpu_usage_seconds_total{
  container!="",
  container!="POD"
}[5m])) by (instance) 
/ 
on(instance) machine_cpu_cores * 100
```

## CPU Throttling 모니터링

### Throttling 메트릭 활용

```promql
# CPU throttling 발생률
sum(rate(container_cpu_cfs_throttled_seconds_total{
  namespace="production",
  container!="",
  container!="POD"
}[5m])) by (pod, container)

# Throttling 비율 (%)
(
  rate(container_cpu_cfs_throttled_seconds_total{
    namespace="production",
    container!="",
    container!="POD"
  }[5m])
  /
  rate(container_cpu_cfs_periods_total{
    namespace="production", 
    container!="",
    container!="POD"
  }[5m])
) * 100
```

### CFS Quota 설정과 모니터링

```yaml
# Pod 리소스 제한
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    resources:
      limits:
        cpu: "500m"    # 0.5 core limit
      requests:
        cpu: "200m"    # 0.2 core request
```

이는 다음 cgroup 설정으로 변환됩니다:

```bash
# CFS quota 확인
cat /sys/fs/cgroup/cpu/kubepods.slice/.../cpu.cfs_quota_us
50000   # 50000μs per 100000μs = 0.5 core

cat /sys/fs/cgroup/cpu/kubepods.slice/.../cpu.cfs_period_us  
100000  # 100ms period

# Throttling 통계
cat /sys/fs/cgroup/cpu/kubepods.slice/.../cpu.stat
nr_periods 12345
nr_throttled 1234      # throttling이 발생한 period 수
throttled_time 567890  # 총 throttling 시간 (ns)
```

## Production 모니터링 대시보드

### Grafana Panel 설정

```json
{
  "title": "Container CPU Usage (Accurate)",
  "type": "graph",
  "targets": [
    {
      "expr": "sum(rate(container_cpu_usage_seconds_total{namespace=~\"$namespace\",pod=~\"$pod\",container!=\"\",container!=\"POD\"}[5m])) by (pod, container)",
      "legendFormat": "{{pod}}/{{container}}"
    }
  ],
  "yAxes": [
    {
      "label": "CPU Cores",
      "max": null,
      "min": 0
    }
  ]
}
```

### 알람 규칙 설정

```yaml
# prometheus-rules.yml
groups:
- name: kubernetes-cpu
  rules:
  - alert: HighCPUUsage
    expr: |
      sum(rate(container_cpu_usage_seconds_total{
        container!="",
        container!="POD"
      }[5m])) by (pod, namespace) > 0.8
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High CPU usage detected"
      description: "Pod {{$labels.namespace}}/{{$labels.pod}} is using {{$value}} CPU cores"

  - alert: CPUThrottling
    expr: |
      rate(container_cpu_cfs_throttled_seconds_total{
        container!="",
        container!="POD"
      }[5m]) > 0.1
    for: 2m
    labels:
      severity: warning  
    annotations:
      summary: "CPU throttling detected"
      description: "Container {{$labels.namespace}}/{{$labels.pod}}/{{$labels.container}} is being throttled"
```

## 고급 CPU 분석 기법

### Per-CPU 코어 분석

```promql
# CPU 코어별 사용량 불균형 검사
stddev_over_time(
  rate(container_cpu_usage_seconds_total{
    namespace="production",
    container!="",
    container!="POD"
  }[5m])[10m:]
) by (pod)
```

### CPU 사용 패턴 분석

```promql
# CPU burst 패턴 감지 (급격한 증가)
delta(
  container_cpu_usage_seconds_total{
    namespace="production",
    container!="", 
    container!="POD"
  }[1m]
) > 10  # 1분에 10초 이상 CPU 사용
```

## 트러블슈팅 가이드

### 1. 메트릭이 2배로 나오는 경우

```bash
# 문제 확인
curl -s "http://prometheus:9090/api/v1/query?query=container_cpu_usage_seconds_total{pod=\"myapp-123\"}" | \
  jq '.data.result[] | {container: .metric.container, value: .value[1]}'

# 출력:
{"container": "", "value": "1.5"}        # Pod 전체
{"container": "app", "value": "1.2"}     # 메인 컨테이너  
{"container": "POD", "value": "0.3"}     # pause 컨테이너

# 해결책: container 필터링
```

### 2. CPU 사용량이 음수로 나오는 경우

```promql
# Counter reset 처리
increase(container_cpu_usage_seconds_total{
  container!="",
  container!="POD"
}[5m]) < 0
```

이는 컨테이너 재시작으로 인한 counter reset이 원인입니다.

### 3. 메트릭이 수집되지 않는 경우

```bash
# cAdvisor 상태 확인
kubectl get --raw "/api/v1/nodes/node1/proxy/metrics/cadvisor" | grep container_cpu

# kubelet 로그 확인  
kubectl logs -n kube-system kubelet-node1

# cgroup 마운트 확인
mount | grep cgroup
```

## 성능 최적화

### 메트릭 수집 최적화

```yaml
# kubelet configuration
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
eventRecordQPS: 5
enableControllerAttachDetach: true
housekeepingInterval: 10s      # cAdvisor 수집 주기
maxPods: 110
metricsBindAddress: "0.0.0.0"  # 메트릭 엔드포인트
```

### Prometheus 저장소 최적화

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
- job_name: 'kubernetes-nodes-cadvisor'
  kubernetes_sd_configs:
  - role: node
  scrape_interval: 30s     # CPU 메트릭은 자주 수집할 필요 없음
  metrics_path: /metrics/cadvisor
  metric_relabel_configs:
  - source_labels: [__name__]
    regex: 'container_cpu_usage_seconds_total'
    target_label: __name__
    replacement: ${1}
  # 불필요한 메트릭 드롭
  - source_labels: [container]
    regex: '^$'
    action: drop          # container="" 메트릭 제외 옵션
```

## 정리

Kubernetes CPU 모니터링의 핵심 원칙:

1. **container!=""**: 빈 컨테이너 레이블 제외로 중복 계산 방지
2. **container!="POD"**: pause 컨테이너 제외로 정확한 애플리케이션 메트릭
3. **rate() 함수**: Counter 메트릭의 초당 변화율 계산
4. **CPU throttling**: 리소스 제한으로 인한 성능 저하 모니터링

**주의사항:**

- container="" 메트릭은 Pod 전체 합계이므로 개별 컨테이너와 중복
- cAdvisor는 cgroup을 통해 커널에서 직접 수집하므로 정확도가 높음
- Counter reset은 컨테이너 재시작 시 발생하므로 increase() 사용 시 주의
- CPU throttling은 성능에 직접 영향을 주므로 반드시 모니터링

## 관련 문서

- [Kubernetes Resource Management](../kubernetes/resource-management.md)
- [Container Performance Tuning](../performance/container-performance.md)
- [Prometheus 메트릭 최적화](prometheus-optimization.md)
