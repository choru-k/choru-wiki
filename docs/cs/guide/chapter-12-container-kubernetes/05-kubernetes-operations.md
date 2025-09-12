---
tags:
  - Kubernetes
  - Operations
  - Production
  - Troubleshooting
  - Performance
  - Security
---

# 12.5 Kubernetes 운영 및 트러블슈팅

## 2022년 2월, 새벽 3시의 클러스터 재난

2022년 2월 14일, 발렌타인데이 새벽 3시. 모니터링 알람이 미친 듯이 울렸다.

"🚨 Kubernetes cluster is down! All services unavailable!"

반년 넘게 안정적으로 운영되던 프로덕션 클러스터가 완전히 마비됐다.

- 모든 Pod가 Pending 상태
- etcd 클러스터 Split-brain 발생
- 마스터 노드 3대 중 2대가 응답 없음
- 워커 노드들은 살아있지만 새로운 Pod 스케줄링 불가

**그날 우리가 배운 교훈**: 쿠버네티스는 강력하지만 **복잡한 분산 시스템**이다. 운영하려면 단순히 YAML 파일만 알아서는 안 된다.

## 클러스터 아키텍처 설계 원칙

### 1. 고가용성 (High Availability) 설계

```bash
# etcd 클러스터 설정 (홀수 개, 최소 3개)
ETCD_CLUSTER="etcd1=https://10.0.1.10:2380,etcd2=https://10.0.1.11:2380,etcd3=https://10.0.1.12:2380"

# API Server 로드밸런서 뒤에 배치
# HAProxy 설정 예시
backend k8s-api
    balance roundrobin
    option httpchk GET /healthz
    server master1 10.0.1.10:6443 check
    server master2 10.0.1.11:6443 check  
    server master3 10.0.1.12:6443 check
```

```yaml
# kube-apiserver.yaml (static pod)
apiVersion: v1
kind: Pod
metadata:
  name: kube-apiserver
  namespace: kube-system
spec:
  containers:
  - name: kube-apiserver
    image: k8s.gcr.io/kube-apiserver:v1.25.0
    command:
    - kube-apiserver
    - --advertise-address=10.0.1.10
    - --etcd-servers=https://10.0.1.10:2379,https://10.0.1.11:2379,https://10.0.1.12:2379
    - --etcd-cafile=/etc/kubernetes/pki/etcd/ca.crt
    - --etcd-certfile=/etc/kubernetes/pki/apiserver-etcd-client.crt
    - --etcd-keyfile=/etc/kubernetes/pki/apiserver-etcd-client.key
    - --audit-log-path=/var/log/audit.log
    - --audit-log-maxage=30
    - --audit-log-maxbackup=10
    - --audit-log-maxsize=100
    - --enable-admission-plugins=NodeRestriction,ResourceQuota,PodSecurity
    - --anonymous-auth=false
    - --request-timeout=300s
    - --max-requests-inflight=400
    - --max-mutating-requests-inflight=200
    livenessProbe:
      httpGet:
        path: /healthz
        port: 6443
        scheme: HTTPS
      initialDelaySeconds: 15
      periodSeconds: 10
      timeoutSeconds: 15
    readinessProbe:
      httpGet:
        path: /readyz
        port: 6443
        scheme: HTTPS
      periodSeconds: 1
      timeoutSeconds: 15
```

### 2. 노드 분산 전략

```yaml
# node-affinity.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: critical-app
spec:
  replicas: 6
  selector:
    matchLabels:
      app: critical-app
  template:
    metadata:
      labels:
        app: critical-app
    spec:
      affinity:
        # 노드 분산
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values:
                - critical-app
            topologyKey: kubernetes.io/hostname
        # 가용 영역 분산
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - critical-app
              topologyKey: topology.kubernetes.io/zone
      containers:
      - name: app
        image: critical-app:v1.0
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## 클러스터 모니터링 및 알림

### Prometheus 기반 종합 모니터링

```yaml
# cluster-monitoring.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: kubernetes-cluster-alerts
spec:
  groups:
  - name: kubernetes-cluster
    rules:
    # etcd 클러스터 상태
    - alert: EtcdClusterDown
      expr: up{job="etcd"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "etcd cluster member is down"
        description: "etcd cluster member {{ $labels.instance }} has been down for more than 1 minute"

    # API Server 응답성
    - alert: KubernetesAPIServerDown
      expr: up{job="apiserver"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Kubernetes API server is down"

    - alert: KubernetesAPIServerLatency
      expr: histogram_quantile(0.99, sum(rate(apiserver_request_duration_seconds_bucket{subresource!="log",verb!~"^(?:CONNECT|WATCH)$"}[5m])) without (instance, pod)) > 1
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "Kubernetes API server high latency"

    # 노드 상태
    - alert: KubernetesNodeNotReady
      expr: kube_node_status_condition{condition="Ready",status="true"} == 0
      for: 10m
      labels:
        severity: critical
      annotations:
        summary: "Node {{ $labels.node }} is not ready"

    - alert: KubernetesNodeDiskPressure
      expr: kube_node_status_condition{condition="DiskPressure",status="true"} == 1
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Node {{ $labels.node }} has disk pressure"

    # Pod 상태
    - alert: KubernetesPodCrashLooping
      expr: rate(kube_pod_container_status_restarts_total[15m]) * 60 * 15 > 0
      for: 1m
      labels:
        severity: warning
      annotations:
        summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} is crash looping"

    - alert: KubernetesPodNotScheduled
      expr: kube_pod_status_phase{phase="Pending"} == 1
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} has been pending for more than 10 minutes"

    # 리소스 사용량
    - alert: KubernetesNodeCpuUsageHigh
      expr: (100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)) > 80
      for: 15m
      labels:
        severity: warning
      annotations:
        summary: "Node {{ $labels.instance }} CPU usage is high"

    - alert: KubernetesNodeMemoryUsageHigh
      expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
      for: 15m
      labels:
        severity: warning
      annotations:
        summary: "Node {{ $labels.instance }} memory usage is high"
```

### 클러스터 대시보드

```json
{
  "dashboard": {
    "title": "Kubernetes Cluster Overview",
    "panels": [
      {
        "title": "Cluster Health",
        "type": "stat",
        "targets": [
          {
            "expr": "up{job=\"apiserver\"}",
            "legendFormat": "API Server"
          },
          {
            "expr": "up{job=\"etcd\"}",
            "legendFormat": "etcd"
          }
        ]
      },
      {
        "title": "Node Status",
        "type": "table",
        "targets": [
          {
            "expr": "kube_node_info",
            "format": "table"
          }
        ]
      },
      {
        "title": "Resource Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(kube_pod_container_resource_requests_cpu_cores)",
            "legendFormat": "CPU Requests"
          },
          {
            "expr": "sum(kube_node_status_allocatable_cpu_cores)",
            "legendFormat": "CPU Allocatable"
          }
        ]
      }
    ]
  }
}
```

## 장애 대응 및 트러블슈팅

### 일반적인 문제 해결 플레이북

#### 1. Pod가 Pending 상태일 때

```bash
# 1단계: Pod 상태 상세 확인
$ kubectl describe pod <pod-name> -n <namespace>

# 주요 확인사항:
# - Events 섹션의 에러 메시지
# - Node-Selectors, Tolerations
# - Resource Requests/Limits

# 2단계: 노드 리소스 확인
$ kubectl top nodes
$ kubectl describe nodes

# 3단계: 스케줄러 로그 확인
$ kubectl logs -n kube-system -l component=kube-scheduler

# 4단계: 수동 스케줄링 시도
$ kubectl patch pod <pod-name> -p '{"spec":{"nodeName":"<target-node>"}}'
```

#### 2. 서비스 접근 불가

```bash
# DNS 해상도 테스트
$ kubectl run -it --rm debug --image=busybox --restart=Never -- sh
> nslookup <service-name>.<namespace>.svc.cluster.local
> wget -qO- <service-name>.<namespace>.svc.cluster.local:<port>

# 서비스 엔드포인트 확인
$ kubectl get endpoints <service-name> -n <namespace>

# kube-proxy 로그 확인
$ kubectl logs -n kube-system -l k8s-app=kube-proxy

# iptables 규칙 확인 (노드에서)
$ sudo iptables -t nat -L | grep <service-name>
```

#### 3. etcd 클러스터 복구

```bash
# etcd 멤버 상태 확인
$ etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  member list

# 손상된 멤버 제거
$ etcdctl member remove <member-id>

# 새 멤버 추가
$ etcdctl member add <new-member-name> --peer-urls=https://<new-ip>:2380

# 백업에서 복구 (최후 수단)
$ etcdctl snapshot restore snapshot.db \
  --name <member-name> \
  --initial-cluster <cluster-definition> \
  --initial-advertise-peer-urls=https://<member-ip>:2380
```

### 실전 트러블슈팅 도구

```bash
#!/bin/bash
# k8s-debug-toolkit.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_section() {
    echo -e "${GREEN}=== $1 ===${NC}"
}

function print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

function print_error() {
    echo -e "${RED}❌ $1${NC}"
}

function check_cluster_health() {
    print_section "Cluster Health Check"
    
    # API Server 응답 확인
    if kubectl version --short > /dev/null 2>&1; then
        echo "✅ API Server responding"
    else
        print_error "API Server not responding"
        return 1
    fi
    
    # 노드 상태 확인
    echo "Node Status:"
    kubectl get nodes -o custom-columns="NAME:.metadata.name,STATUS:.status.conditions[-1].type,READY:.status.conditions[-1].status"
    
    # 중요 시스템 Pod 확인
    echo ""
    echo "System Pods:"
    kubectl get pods -n kube-system -o wide | grep -E "(api-server|etcd|scheduler|controller)"
}

function check_resource_usage() {
    print_section "Resource Usage"
    
    # 노드 리소스 사용률
    echo "Node Resource Usage:"
    kubectl top nodes 2>/dev/null || echo "Metrics server not available"
    
    # 네임스페이스별 Pod 수
    echo ""
    echo "Pods per Namespace:"
    kubectl get pods --all-namespaces --no-headers | awk '{print $1}' | sort | uniq -c | sort -nr
    
    # 리소스 요청이 큰 Pod들
    echo ""
    echo "Top CPU Requesting Pods:"
    kubectl top pods --all-namespaces --sort-by=cpu 2>/dev/null | head -10 || echo "Metrics server not available"
}

function check_network() {
    print_section "Network Check"
    
    # CoreDNS 상태
    echo "CoreDNS Status:"
    kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide
    
    # kube-proxy 상태  
    echo ""
    echo "Kube-proxy Status:"
    kubectl get pods -n kube-system -l k8s-app=kube-proxy -o wide | head -5
    
    # 서비스 없는 엔드포인트 찾기
    echo ""
    echo "Services without endpoints:"
    for ns in $(kubectl get ns -o name | cut -d/ -f2); do
        kubectl get endpoints -n $ns -o json | jq -r '.items[] | select(.subsets | length == 0) | "\(.metadata.namespace)/\(.metadata.name)"' 2>/dev/null
    done
}

function check_storage() {
    print_section "Storage Check"
    
    # PV 상태
    echo "Persistent Volumes:"
    kubectl get pv -o custom-columns="NAME:.metadata.name,STATUS:.status.phase,CLAIM:.spec.claimRef.name,STORAGECLASS:.spec.storageClassName"
    
    # Pending PVC
    echo ""
    echo "Pending PVCs:"
    kubectl get pvc --all-namespaces -o json | jq -r '.items[] | select(.status.phase == "Pending") | "\(.metadata.namespace)/\(.metadata.name)"' 2>/dev/null
}

function check_events() {
    print_section "Recent Events"
    
    # 최근 Warning 이벤트
    kubectl get events --all-namespaces --sort-by=.metadata.creationTimestamp | grep Warning | tail -10
}

function generate_report() {
    local report_file="/tmp/k8s-health-report-$(date +%Y%m%d-%H%M%S).txt"
    
    print_section "Generating Health Report"
    
    {
        echo "Kubernetes Cluster Health Report"
        echo "Generated: $(date)"
        echo "Cluster: $(kubectl config current-context)"
        echo ""
        
        check_cluster_health
        echo ""
        check_resource_usage  
        echo ""
        check_network
        echo ""
        check_storage
        echo ""
        check_events
        
    } > "$report_file"
    
    echo "Report saved to: $report_file"
}

# 메인 실행
case "${1:-all}" in
    "health")
        check_cluster_health
        ;;
    "resources")
        check_resource_usage
        ;;
    "network")
        check_network
        ;;
    "storage")
        check_storage
        ;;
    "events")
        check_events
        ;;
    "report")
        generate_report
        ;;
    "all"|*)
        check_cluster_health
        check_resource_usage
        check_network
        check_storage
        check_events
        ;;
esac
```

## 성능 최적화

### 1. etcd 최적화

```bash
# etcd 성능 설정
ETCD_QUOTA_BACKEND_BYTES=8589934592  # 8GB
ETCD_AUTO_COMPACTION_MODE=periodic
ETCD_AUTO_COMPACTION_RETENTION=5m
ETCD_SNAPSHOT_COUNT=10000
ETCD_HEARTBEAT_INTERVAL=100
ETCD_ELECTION_TIMEOUT=1000

# etcd 압축 수행
$ etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  compact $(etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  endpoint status --write-out="json" | jq -r '.[0].Status.header.revision')

# etcd 조각 모음
$ etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  defrag
```

### 2. kubelet 최적화

```yaml
# kubelet-config.yaml
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
maxPods: 250
podsPerCore: 10
registryPullQPS: 5
registryBurst: 10
eventRecordQPS: 0
eventBurst: 10
kubeAPIQPS: 20
kubeAPIBurst: 30
serializeImagePulls: false
hairpinMode: hairpin-veth
cgroupDriver: systemd
runtimeRequestTimeout: 10m
volumeStatsAggPeriod: 1m
systemReserved:
  cpu: 200m
  memory: 512Mi
  ephemeral-storage: 10Gi
kubeReserved:
  cpu: 200m
  memory: 512Mi
  ephemeral-storage: 10Gi
enforceNodeAllocatable:
- pods
- system-reserved
- kube-reserved
```

### 3. 네트워크 최적화

```yaml
# calico-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: calico-config
  namespace: kube-system
data:
  typha_service_name: "calico-typha"
  calico_backend: "bird"
  cluster_type: "k8s,bgp"
  calico_autodetection_method: "can-reach=8.8.8.8"
  # 성능 최적화 설정
  felix_iptablesrefreshinterval: "60"
  felix_iptableslocktimeoutsecs: "10"
  felix_iptableslockattempts: "3"
  felix_prometheusmetricsEnabled: "true"
  felix_chaininsertmode: "insert"
  felix_defaultendpointtohostaction: "ACCEPT"
```

## 보안 강화

### 1. Pod Security Standards

```yaml
# pod-security-standards.yaml
# 주의: PodSecurityPolicy는 Kubernetes 1.25부터 제거됨
# Pod Security Standards를 사용해야 함
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: v1.28
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/audit-version: v1.28
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/warn-version: v1.28

---
# 보안 정책 준수 Pod 예제
apiVersion: v1
kind: Pod
metadata:
  name: secure-app
  namespace: production
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 2000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: myapp:latest
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      runAsNonRoot: true
      capabilities:
        drop:
        - ALL
```

### 2. Network Policies

```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-egress-dns
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
```

### 3. 감사 로깅 (Audit Logging)

```yaml
# audit-policy.yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
# 중요한 리소스 변경 사항 모두 기록
- level: RequestResponse
  namespaces: ["kube-system", "kube-public", "production"]
  resources:
  - group: ""
    resources: ["secrets", "configmaps", "serviceaccounts"]
  - group: "apps"
    resources: ["deployments", "daemonsets", "statefulsets"]

# 인증/권한 관련 이벤트
- level: Request
  users: ["system:anonymous"]
  namespaces: ["kube-system", "production"]

# exec, portforward 등 위험한 동작
- level: RequestResponse
  resources:
  - group: ""
    resources: ["pods/exec", "pods/portforward", "pods/proxy"]

# 나머지는 메타데이터만
- level: Metadata
  omitStages:
  - RequestReceived
```

## 백업 및 재해 복구

### etcd 백업 자동화

```bash
#!/bin/bash
# etcd-backup.sh

set -euo pipefail

BACKUP_DIR="/var/backups/etcd"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# 백업 디렉토리 생성
mkdir -p "$BACKUP_DIR"

# etcd 스냅샷 생성
ETCDCTL_API=3 etcdctl snapshot save "$BACKUP_DIR/etcd-backup-$TIMESTAMP.db" \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 백업 검증
ETCDCTL_API=3 etcdctl snapshot status "$BACKUP_DIR/etcd-backup-$TIMESTAMP.db" -w table

# 오래된 백업 삭제
find "$BACKUP_DIR" -name "etcd-backup-*.db" -mtime +$RETENTION_DAYS -delete

# 클라우드 스토리지로 업로드 (선택사항)
if command -v aws &> /dev/null; then
    aws s3 cp "$BACKUP_DIR/etcd-backup-$TIMESTAMP.db" s3://k8s-backups/etcd/
fi

echo "Backup completed: $BACKUP_DIR/etcd-backup-$TIMESTAMP.db"
```

### Velero를 이용한 클러스터 백업

```yaml
# velero-backup.yaml
apiVersion: velero.io/v1
kind: Backup
metadata:
  name: production-backup
spec:
  includedNamespaces:
  - production
  - monitoring
  excludedResources:
  - events
  - events.events.k8s.io
  storageLocation: aws-s3
  volumeSnapshotLocations:
  - aws-ebs
  ttl: 720h  # 30일
  
---
# 정기 백업 스케줄
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: daily-backup
spec:
  schedule: "0 2 * * *"  # 매일 새벽 2시
  template:
    includedNamespaces:
    - production
    ttl: 168h  # 7일
```

## 비용 최적화

### 리소스 사용량 분석

```bash
#!/bin/bash
# resource-usage-report.sh

echo "=== Namespace Resource Usage ==="
kubectl top pods --all-namespaces --no-headers | \
  awk '{cpu[$1]+=$2; mem[$1]+=$3} END {for (ns in cpu) printf "%-20s CPU: %s Memory: %s, ", ns, cpu[ns], mem[ns]}' | \
  sort -k3 -nr

echo ""
echo "=== Unused PVs ==="
kubectl get pv -o json | \
  jq -r '.items[] | select(.status.phase == "Available") | "\(.metadata.name) - \(.spec.capacity.storage) - \(.spec.storageClassName)"'

echo ""
echo "=== Over-provisioned Pods (CPU > 80% unused) ==="
kubectl top pods --all-namespaces --no-headers | \
  awk '$3 ~ /m$/ && $3+0 > 100 {print $1"/"$2" - CPU: "$3" Memory: "$4}'

echo ""
echo "=== Pods without resource limits ==="
kubectl get pods --all-namespaces -o json | \
  jq -r '.items[] | select(.spec.containers[].resources.limits == null) | "\(.metadata.namespace)/\(.metadata.name)"'
```

### Cluster Autoscaler 설정

```yaml
# cluster-autoscaler.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-autoscaler
  namespace: kube-system
spec:
  selector:
    matchLabels:
      app: cluster-autoscaler
  template:
    metadata:
      labels:
        app: cluster-autoscaler
    spec:
      serviceAccountName: cluster-autoscaler
      containers:
      - image: k8s.gcr.io/autoscaling/cluster-autoscaler:v1.21.0
        name: cluster-autoscaler
        command:
        - ./cluster-autoscaler
        - --v=4
        - --stderrthreshold=info
        - --cloud-provider=aws
        - --skip-nodes-with-local-storage=false
        - --expander=least-waste
        - --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/production-cluster
        - --balance-similar-node-groups
        - --scale-down-delay-after-add=10m
        - --scale-down-unneeded-time=10m
        - --scale-down-utilization-threshold=0.5
        resources:
          limits:
            cpu: 100m
            memory: 300Mi
          requests:
            cpu: 100m
            memory: 300Mi
```

## 레슨 런

### 1. 장애는 반드시 발생한다

**완벽한 시스템은 없다.** 장애를 예방하는 것보다 빠르게 감지하고 복구하는 능력이 더 중요하다.

### 2. 관찰 가능성이 생명선이다

**메트릭, 로그, 추적이 없으면 장애 상황에서 눈감고 수술하는 것**과 같다. 처음부터 충분한 관찰 가능성을 구축하자.

### 3. 자동화가 안정성의 핵심이다

수동 작업은 **실수의 원인**이다. 백업, 배포, 스케일링, 복구 모든 것을 자동화하자.

### 4. 보안은 선택사항이 아니다

Network Policy, RBAC, Pod Security Policy는 **기본**이다. 보안을 나중에 추가하려면 고통스럽다.

### 5. 비용 관리도 운영의 일부다

리소스를 **과도하게 할당하면 비용이 폭증**한다. 정기적인 사용량 분석과 최적화가 필요하다.

---

**Chapter 12: Container & Kubernetes 완료!** 이제 우리는 컨테이너의 내부 구조부터 대규모 쿠버네티스 클러스터 운영까지 **완전한 컨테이너 여정**을 마스터했습니다.

## 관련 문서

- [12.4 Kubernetes 고급 기능](04-kubernetes-advanced.md) - Helm, Operator, Service Mesh 등 고급 패턴들
- [Chapter 11: Performance Optimization](../chapter-11-performance-optimization/index.md) - Kubernetes 클러스터 성능 최적화
- [Chapter 13: Observability & Debugging](../chapter-13-observability-debugging/index.md) - 프로덕션 모니터링과 장애 대응
- [Chapter 14: Distributed Systems](../chapter-14-distributed-systems/index.md) - 분산 시스템 설계와 운영
- [Chapter 15: Security Engineering](../chapter-15-security-engineering/index.md) - 클러스터 보안 강화

다음으로는 **Chapter 11 (Performance Optimization)** 또는 **Chapter 10 (Syscall & Kernel)**을 진행할 수 있습니다.
