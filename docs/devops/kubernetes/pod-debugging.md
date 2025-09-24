---
tags:
  - Kubernetes
  - Debugging
  - Pod
  - Troubleshooting
  - Production
  - kubectl
  - nsenter
---

# Kubernetes Pod 디버깅: Production 환경에서 완벽한 문제 해결

## 들어가며

"Production Pod가 이상하게 동작하는데 어떻게 내부로 들어가서 디버깅하지?" Kubernetes 환경에서 가장 골치 아픈 문제 중 하나가 바로**실행 중인 Pod의 내부 상태를 디버깅**하는 것입니다. 보안 정책으로 인해 제한된 권한, 최소한의 도구만 설치된 컨테이너 이미지 등으로 인해 전통적인 디버깅 방법이 통하지 않는 경우가 많습니다. 실제 Production 환경에서 사용할 수 있는 체계적인 Pod 디버깅 기법을 살펴보겠습니다.

## Kubernetes Pod 디버깅의 어려움

### Production 환경의 제약사항

```yaml
# 일반적인 Production Pod 설정
apiVersion: v1
kind: Pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 65534
    fsGroup: 65534
  containers:
  - name: app
    image: myapp:minimal  # 디버깅 도구 없는 최소 이미지
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop:
        - ALL         # 모든 Linux capabilities 제거
      runAsNonRoot: true
```

**주요 제약사항:**

- `ptrace` 등 디버깅 권한 없음
- `ps`, `netstat`, `strace` 등 도구 없음
- Root 권한 없음
- 읽기 전용 파일시스템

## kubectl debug: 기본 접근법

### kubectl debug의 한계와 활용

```bash
# 기본 kubectl debug 사용법
kubectl debug problem-pod -it --image=ubuntu --profile=general --target=app-container

# 다양한 프로필 옵션
kubectl debug problem-pod -it --image=nicolaka/netshoot --profile=netadmin --target=app-container
kubectl debug problem-pod -it --image=busybox --profile=baseline --target=app-container
```

**kubectl debug 프로필 비교:**

| Profile | Capabilities | 용도 |
|---------|-------------|------|
| `general` | 기본 도구 | 일반적인 디버깅 |
| `netadmin` | NET_ADMIN | 네트워크 디버깅 |
| `sysadmin` | SYS_ADMIN, SYS_PTRACE | 시스템 레벨 디버깅 |
| `baseline` | 최소 권한 | 보안 제약이 엄격한 환경 |

### kubectl debug의 한계점

```yaml
# kubectl debug로 생성되는 임시 컨테이너의 한계
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: debug-container
    image: ubuntu
    securityContext:
      # Production Pod의 보안 정책이 적용됨
      capabilities:
        drop:
        - ALL
    # 기존 Pod의 보안 제약사항 상속
```

**한계점:**

1. 기존 Pod의 보안 정책 제약을 받음
2. 실행 중인 프로세스에 `ptrace` 불가
3. 파일시스템 권한 제한
4. 현재 실행 중인 Pod에는 적용 불가 (새 Pod 필요)

## 고급 디버깅: Host 노드 접근법

### 노드 레벨에서의 접근

Production 환경에서 가장 강력한 디버깅 방법은**호스트 노드에서 직접 접근**하는 것입니다:

```bash
# 문제가 되는 Pod가 실행 중인 노드 찾기
kubectl get pod problem-pod -o wide
# NAME          READY   STATUS    NODE
# problem-pod   1/1     Running   worker-node-1

# 해당 노드에 SSH 접속 또는 노드 쉘 Pod 생성
```

### 컨테이너 프로세스 식별

Host 노드에서 컨테이너는 단순한 namespace가 분리된 프로세스입니다:

```bash
# 모든 프로세스에서 특정 Pod의 프로세스 찾기
ps aux | grep -E "(java|node|python|nginx)" | head -10

# 하지만 어떤 프로세스가 어느 Pod인지 알기 어려움
# 해결책: /proc/PID/root를 통한 식별
```

### /proc/PID/root를 이용한 Pod 식별

각 프로세스의 `/proc/PID/root`는 해당 프로세스의 root 파일시스템을 가리킵니다:

```bash
#!/bin/bash
# find_pod_process.sh - Pod 이름으로 프로세스 찾기

POD_NAME="$1"
if [[ -z "$POD_NAME" ]]; then
    echo "Usage: $0 <pod_name>"
    exit 1
fi

echo "Searching for processes belonging to pod: $POD_NAME"
echo

# 모든 프로세스를 순회하면서 해당 Pod의 hostname 확인
for pid in $(ps -eo pid --no-headers); do
    # /proc/PID/root/etc/hostname 확인
    if [[ -r "/proc/$pid/root/etc/hostname" ]]; then
        hostname=$(cat "/proc/$pid/root/etc/hostname" 2>/dev/null)
        
        if [[ "$hostname" == "$POD_NAME" ]]; then
            cmd=$(ps -p $pid -o cmd --no-headers)
            echo "Found PID $pid: $cmd"
            echo "  Container root: /proc/$pid/root"
            
            # 컨테이너 정보 추가 확인
            if [[ -r "/proc/$pid/root/etc/os-release" ]]; then
                os_info=$(grep "PRETTY_NAME" "/proc/$pid/root/etc/os-release" | cut -d'"' -f2)
                echo "  OS: $os_info"
            fi
            echo
        fi
    fi
done
```

### nsenter를 이용한 완전한 컨테이너 접근

`nsenter`는 다른 프로세스의 namespace에 진입할 수 있게 해주는 강력한 도구입니다:

```bash
# 특정 PID의 모든 namespace에 진입
nsenter --target $PID --mount --uts --ipc --net --pid

# 예시: nginx Pod (PID 12345)에 진입
nsenter --target 12345 --mount --uts --ipc --net --pid

# 이제 컨테이너 내부에 있는 것처럼 모든 명령 실행 가능
ps aux              # 컨테이너 내부 프로세스
ls /                # 컨테이너 파일시스템
netstat -tulpn      # 컨테이너 네트워크 상태
```

**nsenter 옵션 설명:**

- `--mount`: 마운트 namespace (파일시스템 뷰)
- `--uts`: UTS namespace (hostname)
- `--ipc`: IPC namespace (세마포어, 공유메모리)
- `--net`: 네트워크 namespace (네트워크 스택)
- `--pid`: PID namespace (프로세스 트리)

## 특권 Pod를 이용한 노드 디버깅

### 디버깅 전용 특권 Pod 생성

```yaml
# debug-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: debug-privileged
spec:
  hostNetwork: true        # 호스트 네트워크 사용
  hostPID: true           # 호스트 PID namespace 사용
  containers:
  - name: debug
    image: nicolaka/netshoot  # 풍부한 디버깅 도구
    stdin: true
    tty: true
    command: ["/bin/bash"]
    securityContext:
      privileged: true      # 모든 권한
      capabilities:
        add:
        - NET_ADMIN
        - SYS_ADMIN
        - SYS_PTRACE
    env:
    - name: BPFTRACE_STRLEN
      value: "32"
    volumeMounts:
    - name: host-root
      mountPath: /host
    - name: sys
      mountPath: /sys
    - name: proc
      mountPath: /host/proc
    - name: boot
      mountPath: /boot
      readOnly: true
  volumes:
  - name: host-root
    hostPath:
      path: /
      type: Directory
  - name: sys
    hostPath:
      path: /sys
      type: Directory
  - name: proc
    hostPath:
      path: /proc
      type: Directory
  - name: boot
    hostPath:
      path: /boot
      type: Directory
  nodeSelector:
    kubernetes.io/hostname: worker-node-1  # 특정 노드에 스케줄
```

### 자동화된 노드 셸 스크립트

```bash
#!/bin/bash
# node-shell.sh - 특정 노드에 디버깅 Pod 생성

function node-shell() {
    local node_name="$1"
    
    if [[ -z "$node_name" ]]; then
        echo "Available nodes:"
        kubectl get nodes -o custom-columns=NAME:.metadata.name --no-headers
        echo
        read -p "Enter node name: " node_name
    fi
    
    local image="nicolaka/netshoot"
    local name="debug-shell-$(date +%s)"
    
    echo "Creating privileged debug pod on node: $node_name"
    
    kubectl run "$name" \
        --image="$image" \
        --overrides='{
            "apiVersion": "v1",
            "kind": "Pod",
            "spec": {
                "containers": [{
                    "name": "'$name'",
                    "image": "'$image'",
                    "stdin": true,
                    "tty": true,
                    "command": ["/bin/bash"],
                    "env": [{"name": "BPFTRACE_STRLEN", "value": "32"}],
                    "securityContext": {
                        "privileged": true,
                        "capabilities": {
                            "add": ["NET_ADMIN", "SYS_ADMIN", "SYS_PTRACE"]
                        }
                    },
                    "volumeMounts": [
                        {"mountPath": "/host", "name": "host-root"},
                        {"mountPath": "/sys", "name": "sys"},
                        {"mountPath": "/host/proc", "name": "proc"},
                        {"mountPath": "/boot", "name": "boot", "readOnly": true}
                    ]
                }],
                "hostNetwork": true,
                "hostPID": true,
                "volumes": [
                    {"name": "host-root", "hostPath": {"path": "/", "type": "Directory"}},
                    {"name": "sys", "hostPath": {"path": "/sys", "type": "Directory"}},
                    {"name": "proc", "hostPath": {"path": "/proc", "type": "Directory"}},
                    {"name": "boot", "hostPath": {"path": "/boot", "type": "Directory"}}
                ],
                "nodeSelector": {
                    "kubernetes.io/hostname": "'$node_name'"
                }
            }
        }'
    
    echo "Waiting for pod to be ready..."
    kubectl wait --for=condition=Ready pod/"$name" --timeout=60s
    
    echo "Attaching to debug pod..."
    kubectl attach pod/"$name" -ti
    
    # Clean up on exit
    echo "Cleaning up debug pod..."
    kubectl delete pod "$name" --ignore-not-found
}

# 사용법
node-shell worker-node-1
```

## 실전 디버깅 시나리오

### 시나리오 1: 메모리 누수 의심

```bash
# 1. Pod와 노드 식별
kubectl get pod memory-leak-app -o wide
# NODE: worker-node-2

# 2. 노드에서 프로세스 찾기
./find_pod_process.sh memory-leak-app
# Found PID 15432: java -jar app.jar

# 3. 프로세스 메모리 상세 분석
cat /proc/15432/status | grep -E "(VmRSS|VmSize|VmData|VmStk)"
cat /proc/15432/smaps | grep -E "(Size|Rss|Shared_Clean|Shared_Dirty|Private_Clean|Private_Dirty)" | awk '{sum+=$2} END {print "Total:", sum, "kB"}'

# 4. nsenter로 컨테이너 내부 진입
nsenter --target 15432 --mount --uts --ipc --net --pid

# 5. Java heap dump 생성 (컨테이너 내부에서)
jmap -dump:live,format=b,file=/tmp/heapdump.hprof $(pidof java)
```

### 시나리오 2: 네트워크 연결 문제

```bash
# 1. 특권 디버깅 Pod에서 네트워크 분석
kubectl exec -it debug-privileged -- /bin/bash

# 2. 문제 Pod의 프로세스 찾기
for pid in $(pgrep -f "problematic-app"); do
    echo "Checking PID $pid"
    nsenter --target $pid --net netstat -tulpn
    nsenter --target $pid --net ss -tuln
done

# 3. 패킷 캡처 (Pod의 network namespace에서)
nsenter --target $PID --net tcpdump -i any -w /tmp/capture.pcap

# 4. DNS 문제 확인
nsenter --target $PID --net --mount dig service-name.namespace.svc.cluster.local
nsenter --target $PID --net --mount cat /etc/resolv.conf
```

### 시나리오 3: 파일시스템 문제

```bash
# 1. 컨테이너 파일시스템 접근
nsenter --target $PID --mount --pid

# 2. 디스크 사용량 확인
du -sh /* 2>/dev/null | sort -hr | head -10

# 3. 파일 디스크립터 확인
ls -la /proc/$PID/fd/ | wc -l  # 열린 파일 수
lsof -p $PID | head -20        # 열린 파일 목록

# 4. 마운트 포인트 확인
cat /proc/$PID/mountinfo | grep -E "(tmpfs|overlay)"
```

## 고급 디버깅 도구 활용

### strace를 이용한 시스템 호출 추적

```bash
# 특권 Pod에서 다른 컨테이너의 프로세스 추적
strace -p $PID -f -e trace=network,file -o /tmp/strace.log

# 실시간 시스템 호출 모니터링
strace -p $PID -f -e trace=all -c  # 호출 빈도 통계
```

### lsof를 이용한 파일/네트워크 분석

```bash
# 프로세스가 연 모든 파일과 소켓
lsof -p $PID

# 네트워크 연결만
lsof -p $PID -i

# 특정 포트 사용 프로세스
lsof -i :8080
```

### 프로세스 트리 분석

```bash
# 컨테이너 내부 프로세스 트리
nsenter --target $PID --pid ps auxf

# 부모-자식 관계 확인
nsenter --target $PID --pid pstree -p
```

## 보안 고려사항

### 특권 Pod 사용 시 주의사항

```yaml
# 보안을 고려한 디버깅 Pod
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: debug
    securityContext:
      # 필요한 최소 권한만 부여
      capabilities:
        add:
        - SYS_PTRACE    # 프로세스 디버깅
        - NET_ADMIN     # 네트워크 디버깅
        drop:
        - ALL
      # 완전한 특권은 피하고 필요한 권한만
      # privileged: false
```

### 감사 로그 활용

```bash
# kubectl 명령어 감사 로그 확인
kubectl get events --sort-by='.lastTimestamp' | grep debug

# API 서버 감사 로그에서 디버깅 활동 추적
grep "pods/exec" /var/log/audit/audit.log
```

## 자동화된 디버깅 도구

### Pod 문제 진단 스크립트

```python
#!/usr/bin/env python3
"""
pod_diagnostic.py - Pod 자동 진단 도구
"""

import subprocess
import json
import sys
from datetime import datetime

class PodDiagnostic:
    def __init__(self, pod_name, namespace="default"):
        self.pod_name = pod_name
        self.namespace = namespace
        self.findings = []
    
    def get_pod_info(self):
        """Pod 기본 정보 수집"""
        try:
            result = subprocess.run([
                'kubectl', 'get', 'pod', self.pod_name, 
                '-n', self.namespace, '-o', 'json'
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                return json.loads(result.stdout)
            else:
                self.findings.append(f"❌ Pod not found: {self.pod_name}")
                return None
        except Exception as e:
            self.findings.append(f"❌ Failed to get pod info: {e}")
            return None
    
    def analyze_pod_status(self, pod_info):
        """Pod 상태 분석"""
        if not pod_info:
            return
        
        status = pod_info['status']
        phase = status.get('phase', 'Unknown')
        
        self.findings.append(f"Pod phase: {phase}")
        
        # 컨테이너 상태 확인
        container_statuses = status.get('containerStatuses', [])
        for container in container_statuses:
            name = container['name']
            ready = container['ready']
            restart_count = container['restartCount']
            
            self.findings.append(f"Container {name}: ready={ready}, restarts={restart_count}")
            
            # 종료 상태 확인
            if 'lastState' in container and 'terminated' in container['lastState']:
                terminated = container['lastState']['terminated']
                exit_code = terminated.get('exitCode', 'unknown')
                reason = terminated.get('reason', 'unknown')
                self.findings.append(f"  Last exit: code={exit_code}, reason={reason}")
    
    def check_events(self):
        """Pod 관련 이벤트 확인"""
        try:
            result = subprocess.run([
                'kubectl', 'get', 'events', '-n', self.namespace,
                '--field-selector', f'involvedObject.name={self.pod_name}',
                '--sort-by', '.lastTimestamp'
            ], capture_output=True, text=True)
            
            if result.returncode == 0 and result.stdout.strip():
                self.findings.append("Recent events:")
                for line in result.stdout.strip().split(', ')[1:]:  # 헤더 제외
                    self.findings.append(f"  {line}")
        except Exception as e:
            self.findings.append(f"⚠ Could not get events: {e}")
    
    def suggest_debug_commands(self, pod_info):
        """디버깅 명령어 추천"""
        if not pod_info:
            return
        
        node_name = pod_info['spec'].get('nodeName', 'unknown')
        
        self.findings.append(f", 🔧 Suggested debug commands:")
        self.findings.append(f"1. Check logs: kubectl logs {self.pod_name} -n {self.namespace}")
        self.findings.append(f"2. Describe pod: kubectl describe pod {self.pod_name} -n {self.namespace}")
        self.findings.append(f"3. Debug with ephemeral container: kubectl debug {self.pod_name} -n {self.namespace} -it --image=nicolaka/netshoot")
        
        if node_name != 'unknown':
            self.findings.append(f"4. Node shell access: node-shell.sh {node_name}")
            self.findings.append(f"5. Find process: ./find_pod_process.sh {self.pod_name}")
    
    def run_diagnosis(self):
        """전체 진단 실행"""
        print(f"=== Pod Diagnostic Report ===")
        print(f"Pod: {self.namespace}/{self.pod_name}")
        print(f"Time: {datetime.now().isoformat()}")
        print()
        
        pod_info = self.get_pod_info()
        self.analyze_pod_status(pod_info)
        self.check_events()
        self.suggest_debug_commands(pod_info)
        
        print("Findings:")
        for i, finding in enumerate(self.findings, 1):
            print(f"{i:2d}. {finding}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 pod_diagnostic.py <pod_name> [namespace]")
        sys.exit(1)
    
    pod_name = sys.argv[1]
    namespace = sys.argv[2] if len(sys.argv) > 2 else "default"
    
    diagnostic = PodDiagnostic(pod_name, namespace)
    diagnostic.run_diagnosis()
```

## 정리

Kubernetes Pod 디버깅의 단계별 접근법:

### Level 1: Basic Debugging

- `kubectl logs`, `kubectl describe`
- `kubectl debug` with ephemeral containers

### Level 2: Advanced Debugging  

- Host 노드 접근
- `/proc/PID/root`를 통한 Pod 식별
- `nsenter`를 이용한 namespace 진입

### Level 3: Deep Debugging

- 특권 Pod를 이용한 완전한 시스템 접근
- `strace`, `lsof`, `tcpdump` 등 고급 도구 활용
- 실시간 시스템 호출 및 네트워크 분석

**Production 환경에서 고려사항:**

1.**보안**: 특권 Pod 사용 시 최소 권한 원칙 적용
2.**성능**: 디버깅 도구 사용이 운영 Pod에 영향 최소화
3.**감사**: 모든 디버깅 활동 로그 기록
4.**자동화**: 반복적인 디버깅 작업은 스크립트로 자동화

**유용한 도구들:**

-**nicolaka/netshoot**: 네트워크 디버깅 전문 이미지
-**busybox**: 가벼운 기본 도구 제공
-**ubuntu/debian**: 풍부한 패키지 생태계
-**nsenter**: 네임스페이스 진입의 핵심 도구

## 관련 문서

- [Docker Exit Code 137 디버깅](../debugging/docker-exit-137-debugging.md)
- [strace를 이용한 시스템 호출 분석](../debugging/strace-debugging.md)
- [Kubernetes 네트워크 트러블슈팅](kubernetes-network-troubleshooting.md)
