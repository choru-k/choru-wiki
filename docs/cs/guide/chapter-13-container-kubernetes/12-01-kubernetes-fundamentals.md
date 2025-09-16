---
tags:
  - balanced
  - container-orchestration
  - deployment
  - fundamentals
  - kubernetes
  - medium-read
  - pod
  - service
  - 인프라스트럭처
difficulty: FUNDAMENTALS
learning_time: "4-6시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 12.3 Kubernetes 기본 개념 및 아키텍처

## 2020년 3월, 쿠버네티스와의 첫 만남

2020년 3월, 코로나로 모든 것이 혼란스러웠던 그 시기에 우리 팀은 새로운 도전에 직면했다. 트래픽이 기하급수적으로 증가했고, Docker Swarm으로는 더 이상 감당할 수 없었다.

"쿠버네티스를 써야 할 때가 온 것 같아."

하지만 첫 만남은 충격이었다.

- YAML 파일만 수십 개
- Pod? Service? Ingress? 새로운 개념들의 향연
- `kubectl` 명령어들의 복잡함
- "Hello World" 하나 배포하는데 왜 이렇게 복잡한지...

**하지만 알고 보니** 쿠버네티스는 복잡한 게 아니라 **정교했다**. 대규모 시스템을 안정적으로 운영하기 위한 모든 기능이 체계적으로 설계되어 있었던 것이다.

## Kubernetes 아키텍처: 마스터와 워커의 조화

### Control Plane (마스터 노드)

```mermaid
graph TB
    subgraph "Control Plane"
        API[API Server, 모든 요청의 중심]
        ETCD[etcd, 클러스터 상태 저장소]
        SCHED[Scheduler, Pod 배치 결정]
        CM[Controller Manager, 상태 관리]
        CCM[Cloud Controller Manager, 클라우드 연동]
    end
    
    subgraph "Worker Node 1"
        KUB1[Kubelet, Pod 생명주기 관리]
        PROXY1[Kube-proxy, 네트워크 규칙 관리]
        RT1[Container Runtime, 컨테이너 실행]
        POD1[Pod 1]
        POD2[Pod 2]
    end
    
    subgraph "Worker Node 2"  
        KUB2[Kubelet, Pod 생명주기 관리]
        PROXY2[Kube-proxy, 네트워크 규칙 관리]
        RT2[Container Runtime, 컨테이너 실행]
        POD3[Pod 3]
        POD4[Pod 4]
    end
    
    API --> KUB1
    API --> KUB2
    API --> ETCD
    SCHED --> API
    CM --> API
    
    KUB1 --> RT1
    KUB2 --> RT2
    RT1 --> POD1
    RT1 --> POD2
    RT2 --> POD3
    RT2 --> POD4
```

### 각 컴포넌트의 역할

#### 1. API Server: 쿠버네티스의 심장

```bash
# API Server가 처리하는 모든 요청들
$ kubectl get pods  # → API Server → etcd 조회
$ kubectl apply -f pod.yaml  # → API Server → etcd 저장 → Scheduler 알림

# API Server 직접 호출
$ kubectl proxy --port=8080 &
$ curl http://localhost:8080/api/v1/namespaces/default/pods
```

#### 2. etcd: 분산 키-값 저장소

```bash
# etcd에 저장된 데이터 확인 (마스터 노드에서)
$ sudo ETCDCTL_API=3 etcdctl --endpoints=127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/pods/default/my-pod

# 결과: Pod의 모든 상태가 JSON으로 저장됨
```

#### 3. Scheduler: 가장 적절한 노드 찾기

```yaml
# scheduler-config.yaml
apiVersion: kubescheduler.config.k8s.io/v1beta2
kind: KubeSchedulerConfiguration
profiles:
- schedulerName: custom-scheduler
  plugins:
    filter:
      enabled:
      - name: NodeResourcesFit
      - name: NodeAffinity
    score:
      enabled:
      - name: NodeResourcesFit
      - name: NodeAffinity
  pluginConfig:
  - name: NodeResourcesFit
    args:
      scoringStrategy:
        type: LeastAllocated
```

#### 4. Controller Manager: 원하는 상태 유지

```go
// 컨트롤러 루프 의사코드
for {
    desired := getDesiredState()
    current := getCurrentState()
    
    if desired != current {
        reconcile(desired, current)
    }
    
    time.Sleep(30 * time.Second)
}
```

## 핵심 오브젝트들: 쿠버네티스의 구성 요소

### Pod: 가장 작은 배포 단위

```yaml
# simple-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app
  labels:
    app: my-app
    version: v1.0
  annotations:
    description: "My first Kubernetes Pod"
spec:
  containers:
  - name: app-container
    image: nginx:1.20
    ports:
    - containerPort: 80
    resources:
      requests:
        memory: "64Mi"
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"
    env:
    - name: ENV
      value: "production"
    - name: DATABASE_URL
      valueFrom:
        secretKeyRef:
          name: db-secret
          key: url
    volumeMounts:
    - name: config-volume
      mountPath: /etc/config
    livenessProbe:
      httpGet:
        path: /health
        port: 80
      initialDelaySeconds: 30
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /ready
        port: 80
      initialDelaySeconds: 5
      periodSeconds: 5
  
  # 사이드카 컨테이너 (로그 수집용)
  - name: log-collector
    image: fluentd:v1.14
    volumeMounts:
    - name: app-logs
      mountPath: /var/log/app
  
  volumes:
  - name: config-volume
    configMap:
      name: app-config
  - name: app-logs
    emptyDir: {}
  
  restartPolicy: Always
  nodeSelector:
    disktype: ssd
  tolerations:
  - key: "key1"
    operator: "Equal"
    value: "value1"
    effect: "NoSchedule"
```

### ReplicaSet: Pod 복제 관리

```yaml
# replicaset.yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: my-app-rs
  labels:
    app: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: app-container
        image: my-app:v1.0
        ports:
        - containerPort: 8080

---
# ReplicaSet 관리 명령어
$ kubectl get replicasets
$ kubectl describe replicaset my-app-rs
$ kubectl scale replicaset my-app-rs --replicas=5
```

### Deployment: 무중단 배포

```yaml
# deployment.yaml  
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-deployment
  labels:
    app: my-app
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: app-container
        image: my-app:v1.0
        ports:
        - containerPort: 8080
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5

---
# 배포 관리 명령어
$ kubectl apply -f deployment.yaml
$ kubectl get deployments
$ kubectl rollout status deployment/my-app-deployment

# 롤링 업데이트
$ kubectl set image deployment/my-app-deployment app-container=my-app:v2.0
$ kubectl rollout history deployment/my-app-deployment
$ kubectl rollout undo deployment/my-app-deployment
```

### Service: Pod 들을 외부에 노출

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-service
spec:
  selector:
    app: my-app
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: ClusterIP

---
# LoadBalancer 타입 (클라우드 환경)
apiVersion: v1
kind: Service
metadata:
  name: my-app-lb
spec:
  selector:
    app: my-app
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer

---
# NodePort 타입 (온프레미스)
apiVersion: v1
kind: Service
metadata:
  name: my-app-nodeport
spec:
  selector:
    app: my-app
  ports:
  - port: 80
    targetPort: 8080
    nodePort: 30080
  type: NodePort
```

### ConfigMap과 Secret: 설정 관리

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  app.properties: |
    server.port=8080
    app.name=MyApp
    log.level=INFO
  database.host: "postgres.default.svc.cluster.local"
  database.port: "5432"

---
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
data:
  database-password: cGFzc3dvcmQxMjM=  # base64 encoded
  api-key: YWJjZGVmZ2hpams=

---
# 사용 예시
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      containers:
      - name: app
        image: my-app:latest
        envFrom:
        - configMapRef:
            name: app-config
        env:
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-password
        volumeMounts:
        - name: config-volume
          mountPath: /etc/config
      volumes:
      - name: config-volume
        configMap:
          name: app-config
```

## 네트워킹: Pod 간 통신의 마법

### 쿠버네티스 네트워킹 모델

```bash
# Pod IP 확인
$ kubectl get pods -o wide
NAME       READY   STATUS    RESTARTS   AGE   IP           NODE
my-app-1   1/1     Running   0          1m    10.244.1.4   worker-1
my-app-2   1/1     Running   0          1m    10.244.2.5   worker-2

# Pod 간 직접 통신 가능
$ kubectl exec -it my-app-1 -- ping 10.244.2.5
PING 10.244.2.5: 56 data bytes
64 bytes from 10.244.2.5: seq=0 ttl=64 time=0.234 ms
```

### DNS 기반 서비스 발견

```bash
# 클러스터 내 DNS
$ kubectl exec -it my-app-1 -- nslookup my-app-service
Name:    my-app-service.default.svc.cluster.local
Address: 10.96.0.100

# FQDN 구성: <service-name>.<namespace>.svc.cluster.local
```

### CNI (Container Network Interface)

```yaml
# Calico CNI 설정 예시
apiVersion: projectcalico.org/v3
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress

---
# 특정 트래픽만 허용
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
```

## 스토리지: 데이터의 영속성

### Persistent Volume과 Persistent Volume Claim

```yaml
# persistent-volume.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-database
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: fast-ssd
  hostPath:  # 실제 운영에서는 사용 금지
    path: /mnt/data

---
# persistent-volume-claim.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: database-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: fast-ssd

---
# Pod에서 PVC 사용
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:13
        env:
        - name: POSTGRES_PASSWORD
          value: "password"
        volumeMounts:
        - mountPath: /var/lib/postgresql/data
          name: postgres-storage
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: database-pvc
```

### StatefulSet: 상태가 있는 애플리케이션

```yaml
# statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres-cluster
spec:
  serviceName: postgres-headless
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:13
        env:
        - name: POSTGRES_PASSWORD
          value: "password"
        - name: POSTGRES_USER
          value: "postgres"
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: postgres-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 10Gi

---
# Headless Service (StatefulSet용)
apiVersion: v1
kind: Service
metadata:
  name: postgres-headless
spec:
  clusterIP: None  # Headless
  selector:
    app: postgres
  ports:
  - port: 5432
```

## 실습: 완전한 웹 애플리케이션 배포

### 전체 스택 배포

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: myapp-prod

---
# database-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-config
  namespace: myapp-prod
data:
  POSTGRES_DB: myapp
  POSTGRES_USER: myapp_user

---
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: myapp-prod
type: Opaque
data:
  POSTGRES_PASSWORD: bXlhcHBfcGFzc3dvcmQ=  # myapp_password

---
# postgres.yaml  
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: myapp-prod
spec:
  serviceName: postgres-headless
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:13
        envFrom:
        - configMapRef:
            name: postgres-config
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: POSTGRES_PASSWORD
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
        readinessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - pg_isready -U myapp_user -d myapp
          initialDelaySeconds: 15
          periodSeconds: 10
  volumeClaimTemplates:
  - metadata:
      name: postgres-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 20Gi

---
apiVersion: v1
kind: Service
metadata:
  name: postgres-headless
  namespace: myapp-prod
spec:
  clusterIP: None
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432

---
# redis.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: myapp-prod
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:6-alpine
        command: ["redis-server", "--appendonly", "yes"]
        ports:
        - containerPort: 6379
        volumeMounts:
        - name: redis-data
          mountPath: /data
        readinessProbe:
          exec:
            command:
            - redis-cli
            - ping
          initialDelaySeconds: 5
          periodSeconds: 10
      volumes:
      - name: redis-data
        emptyDir: {}

---
apiVersion: v1
kind: Service
metadata:
  name: redis-service
  namespace: myapp-prod
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379

---
# web-app.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  namespace: myapp-prod
  labels:
    app: web-app
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
      - name: web-app
        image: my-web-app:v1.0
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          value: "postgresql://myapp_user:myapp_password@postgres-headless:5432/myapp"
        - name: REDIS_URL
          value: "redis://redis-service:6379/0"
        - name: ENV
          value: "production"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: web-app-service
  namespace: myapp-prod
spec:
  selector:
    app: web-app
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP

---
# ingress.yaml (NGINX Ingress Controller 사용)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app-ingress
  namespace: myapp-prod
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - myapp.example.com
    secretName: myapp-tls
  rules:
  - host: myapp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-app-service
            port:
              number: 80
```

### 배포 및 확인

```bash
# 모든 리소스 배포
$ kubectl apply -f namespace.yaml
$ kubectl apply -f database-config.yaml
$ kubectl apply -f postgres.yaml
$ kubectl apply -f redis.yaml
$ kubectl apply -f web-app.yaml
$ kubectl apply -f ingress.yaml

# 배포 상태 확인
$ kubectl get all -n myapp-prod
NAME                           READY   STATUS    RESTARTS   AGE
pod/postgres-0                 1/1     Running   0          2m
pod/redis-5d8f7b6b9c-xyz       1/1     Running   0          1m
pod/web-app-6c4b8f9d4c-abc     1/1     Running   0          1m
pod/web-app-6c4b8f9d4c-def     1/1     Running   0          1m
pod/web-app-6c4b8f9d4c-ghi     1/1     Running   0          1m

# 서비스 상태 확인
$ kubectl get svc -n myapp-prod
NAME                TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
postgres-headless   ClusterIP   None            <none>        5432/TCP   2m
redis-service       ClusterIP   10.96.1.100     <none>        6379/TCP   1m
web-app-service     ClusterIP   10.96.1.200     <none>        80/TCP     1m

# Ingress 확인
$ kubectl get ingress -n myapp-prod
NAME              CLASS   HOSTS               ADDRESS         PORTS     AGE
web-app-ingress   nginx   myapp.example.com   203.0.113.100   80, 443   1m

# 로그 확인
$ kubectl logs -f deployment/web-app -n myapp-prod
$ kubectl logs -f statefulset/postgres -n myapp-prod

# 애플리케이션 테스트
$ curl -H "Host: myapp.example.com" http://203.0.113.100/
```

## 레슨 런

### 1. 쿠버네티스는 복잡하지만 논리적이다

모든 개념과 오브젝트는 **서로 연결된 목적**이 있다. 전체 그림을 이해하면 개별 요소들이 훨씬 명확해진다.

### 2. 라벨과 셀렉터가 핵심이다

쿠버네티스의 모든 연결은 **라벨과 셀렉터**로 이루어진다. 이를 잘 설계하면 유연한 시스템을 만들 수 있다.

### 3. 선언적 구성의 위력

**"어떻게"가 아닌 "무엇을"** 원하는지 선언하면, 쿠버네티스가 알아서 해준다. 이것이 진정한 Infrastructure as Code다.

### 4. 관찰 가능성을 처음부터 고려하라

프로덕션에서 쿠버네티스를 운영하려면 **로그, 메트릭, 추적**이 필수다. 헬스체크와 프로브도 반드시 구현하자.

---

**다음 장에서는** 쿠버네티스의 고급 기능들을 다룬다. Service Mesh, Operator Pattern, Custom Resources 등을 통해 진정한 클라우드 네이티브 아키텍처를 구축해보자.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: FUNDAMENTALS
- **주제**: 인프라스트럭처
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 FUNDAMENTALS 레벨 전체 보기](../learning-paths/fundamentals/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-12-container-kubernetes)

- [12.1 Container 핵심 기술 - 격리의 과학](./13-10-container-internals.md)
- [12.2 Docker 오케스트레이션 및 프로덕션 배포](./13-11-docker-orchestration.md)
- [12.4 Kubernetes 고급 기능 및 운영](./13-20-kubernetes-advanced.md)
- [12.5 Kubernetes 운영 및 트러블슈팅](./13-12-kubernetes-operations.md)

### 🏷️ 관련 키워드

`kubernetes`, `container-orchestration`, `pod`, `service`, `deployment`

### ⏭️ 다음 단계 가이드

- 기초 개념을 충분히 이해한 후 INTERMEDIATE 레벨로 진행하세요
- 실습 위주의 학습을 권장합니다
