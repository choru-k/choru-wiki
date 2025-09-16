---
tags:
  - advanced
  - deep-study
  - gitops
  - hands-on
  - helm
  - kubernetes
  - operators
  - service-mesh
  - 인프라스트럭처
difficulty: ADVANCED
learning_time: "15-25시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 12.4 Kubernetes 고급 기능 및 운영

## 2021년 9월, 쿠버네티스 마스터가 되는 길

2021년 9월, 우리는 쿠버네티스를 1년 넘게 운영해왔다. 기본적인 Pod, Service, Deployment는 이제 익숙했지만, 진짜 도전은 이제부터였다.

**새로운 요구사항들이 쏟아져 나왔다:**

- "마이크로서비스 간 통신을 암호화하고 추적할 수 있나요?"
- "특정 애플리케이션에만 적용되는 커스텀 로직을 자동화할 수 있나요?"
- "카나리 배포나 A/B 테스트를 쉽게 할 수 있는 방법이 있나요?"
- "Kubernetes 자체를 코드로 관리할 수 있나요?"

이때 깨달았다. **쿠버네티스는 플랫폼이 아니라 플랫폼을 만들기 위한 플랫폼**이라는 것을.

## Helm: 쿠버네티스의 패키지 매니저

### Helm이란?

Helm은 쿠버네티스 애플리케이션을 **패키지화하고 배포를 관리**하는 도구다. 복잡한 YAML 파일들을 템플릿화하고 버전 관리할 수 있다.

### Helm Chart 생성

```bash
# 새 Chart 생성
$ helm create myapp

# 생성된 구조
myapp/
├── Chart.yaml          # 차트 메타데이터
├── values.yaml         # 기본값 설정
├── templates/          # 템플릿 파일들
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── _helpers.tpl    # 템플릿 헬퍼
└── charts/             # 의존성 차트들
```

### 실전 Helm Chart

```yaml
# Chart.yaml
apiVersion: v2
name: myapp
description: A Helm chart for MyApp
type: application
version: 0.1.0
appVersion: "1.0.0"
dependencies:
- name: postgresql
  version: 11.6.12
  repository: https://charts.bitnami.com/bitnami
- name: redis
  version: 16.9.11
  repository: https://charts.bitnami.com/bitnami
```

```yaml
# values.yaml
replicaCount: 3

image:
  repository: myapp
  pullPolicy: IfNotPresent
  tag: "latest"

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: myapp.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: myapp-tls
      hosts:
        - myapp.example.com

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

# Database configuration
postgresql:
  enabled: true
  auth:
    username: myapp
    password: myapp-password
    database: myapp
  primary:
    persistence:
      enabled: true
      size: 20Gi

redis:
  enabled: true
  auth:
    enabled: false
  master:
    persistence:
      enabled: true
      size: 8Gi

# Application specific config
config:
  database:
    host: "{{ include \"myapp.fullname\" . }}-postgresql"
    port: 5432
    name: myapp
  redis:
    host: "{{ include \"myapp.fullname\" . }}-redis-master"
    port: 6379
  app:
    debug: false
    logLevel: "info"
```

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 30
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          env:
            - name: DATABASE_URL
              value: "postgresql://{{ .Values.postgresql.auth.username }}:{{ .Values.postgresql.auth.password }}@{{ .Values.config.database.host }}:{{ .Values.config.database.port }}/{{ .Values.config.database.name }}"
            - name: REDIS_URL
              value: "redis://{{ .Values.config.redis.host }}:{{ .Values.config.redis.port }}/0"
            - name: DEBUG
              value: "{{ .Values.config.app.debug }}"
            - name: LOG_LEVEL
              value: "{{ .Values.config.app.logLevel }}"
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

### Helm 배포 및 관리

```bash
# 의존성 업데이트
$ helm dependency update

# 차트 검증
$ helm lint myapp/
$ helm template myapp myapp/ --values values-prod.yaml

# 배포 (dry-run)
$ helm install myapp-prod myapp/ --values values-prod.yaml --dry-run

# 실제 배포
$ helm install myapp-prod myapp/ --values values-prod.yaml

# 업그레이드
$ helm upgrade myapp-prod myapp/ --values values-prod.yaml

# 롤백
$ helm rollback myapp-prod 1

# 히스토리 확인
$ helm history myapp-prod

# 제거
$ helm uninstall myapp-prod
```

## Custom Resources와 Operators

### Custom Resource Definition (CRD)

```yaml
# webapp-crd.yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: webapps.example.com
spec:
  group: example.com
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              image:
                type: string
                description: "Docker image for the webapp"
              replicas:
                type: integer
                minimum: 1
                maximum: 10
                description: "Number of replicas"
              database:
                type: object
                properties:
                  enabled:
                    type: boolean
                  type:
                    type: string
                    enum: ["postgresql", "mysql"]
                  size:
                    type: string
                    default: "10Gi"
              ingress:
                type: object
                properties:
                  enabled:
                    type: boolean
                  host:
                    type: string
                  tls:
                    type: boolean
            required:
            - image
            - replicas
          status:
            type: object
            properties:
              conditions:
                type: array
                items:
                  type: object
                  properties:
                    type:
                      type: string
                    status:
                      type: string
                    lastTransitionTime:
                      type: string
                      format: date-time
                    reason:
                      type: string
                    message:
                      type: string
              phase:
                type: string
                enum: ["Pending", "Running", "Failed"]
              readyReplicas:
                type: integer
  scope: Namespaced
  names:
    plural: webapps
    singular: webapp
    kind: WebApp
    shortNames:
    - wa
```

### Custom Resource 사용

```yaml
# my-webapp.yaml
apiVersion: example.com/v1
kind: WebApp
metadata:
  name: my-webapp
  namespace: default
spec:
  image: "myapp:v1.0"
  replicas: 3
  database:
    enabled: true
    type: postgresql
    size: "20Gi"
  ingress:
    enabled: true
    host: "myapp.example.com"
    tls: true
```

### Operator 구현 (Go 기반)

```go
// main.go - Simplified Operator
package main

import (
    "context"
    "fmt"
    "time"
    
    appsv1 "k8s.io/api/apps/v1"
    corev1 "k8s.io/api/core/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/runtime"
    "k8s.io/apimachinery/pkg/util/intstr"
    ctrl "sigs.k8s.io/controller-runtime"
    "sigs.k8s.io/controller-runtime/pkg/client"
    "sigs.k8s.io/controller-runtime/pkg/log"
    
    examplev1 "example.com/webapp-operator/api/v1"
)

type WebAppReconciler struct {
    client.Client
    Scheme *runtime.Scheme
}

func (r *WebAppReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    logger := log.FromContext(ctx)
    
    // WebApp CR 조회
    var webapp examplev1.WebApp
    if err := r.Get(ctx, req.NamespacedName, &webapp); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }
    
    // Deployment 생성/업데이트
    deployment := &appsv1.Deployment{
        ObjectMeta: metav1.ObjectMeta{
            Name:      webapp.Name,
            Namespace: webapp.Namespace,
        },
        Spec: appsv1.DeploymentSpec{
            Replicas: &webapp.Spec.Replicas,
            Selector: &metav1.LabelSelector{
                MatchLabels: map[string]string{
                    "app": webapp.Name,
                },
            },
            Template: corev1.PodTemplateSpec{
                ObjectMeta: metav1.ObjectMeta{
                    Labels: map[string]string{
                        "app": webapp.Name,
                    },
                },
                Spec: corev1.PodSpec{
                    Containers: []corev1.Container{{
                        Name:  "webapp",
                        Image: webapp.Spec.Image,
                        Ports: []corev1.ContainerPort{{
                            ContainerPort: 8080,
                        }},
                    }},
                },
            },
        },
    }
    
    // Deployment 적용
    if err := ctrl.SetControllerReference(&webapp, deployment, r.Scheme); err != nil {
        return ctrl.Result{}, err
    }
    
    if err := r.Create(ctx, deployment); err != nil {
        if !apierrors.IsAlreadyExists(err) {
            logger.Error(err, "Failed to create deployment")
            return ctrl.Result{}, err
        }
        // 업데이트 로직
        if err := r.Update(ctx, deployment); err != nil {
            return ctrl.Result{}, err
        }
    }
    
    // Service 생성
    service := &corev1.Service{
        ObjectMeta: metav1.ObjectMeta{
            Name:      webapp.Name + "-service",
            Namespace: webapp.Namespace,
        },
        Spec: corev1.ServiceSpec{
            Selector: map[string]string{
                "app": webapp.Name,
            },
            Ports: []corev1.ServicePort{{
                Port:       80,
                TargetPort: intstr.FromInt(8080),
            }},
        },
    }
    
    if err := ctrl.SetControllerReference(&webapp, service, r.Scheme); err != nil {
        return ctrl.Result{}, err
    }
    
    if err := r.Create(ctx, service); err != nil && !apierrors.IsAlreadyExists(err) {
        return ctrl.Result{}, err
    }
    
    // 데이터베이스 처리 (필요시)
    if webapp.Spec.Database.Enabled {
        if err := r.createDatabase(ctx, &webapp); err != nil {
            return ctrl.Result{}, err
        }
    }
    
    // Status 업데이트
    webapp.Status.Phase = "Running"
    webapp.Status.ReadyReplicas = webapp.Spec.Replicas
    
    if err := r.Status().Update(ctx, &webapp); err != nil {
        return ctrl.Result{}, err
    }
    
    return ctrl.Result{RequeueAfter: time.Minute * 5}, nil
}

func (r *WebAppReconciler) createDatabase(ctx context.Context, webapp *examplev1.WebApp) error {
    // PostgreSQL StatefulSet 생성 로직
    // PVC, Service 등도 함께 생성
    return nil
}

func (r *WebAppReconciler) SetupWithManager(mgr ctrl.Manager) error {
    return ctrl.NewControllerManagedBy(mgr).
        For(&examplev1.WebApp{}).
        Owns(&appsv1.Deployment{}).
        Owns(&corev1.Service{}).
        Complete(r)
}

func main() {
    mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
        Scheme: scheme,
    })
    if err != nil {
        panic(err)
    }
    
    if err := (&WebAppReconciler{
        Client: mgr.GetClient(),
        Scheme: mgr.GetScheme(),
    }).SetupWithManager(mgr); err != nil {
        panic(err)
    }
    
    if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
        panic(err)
    }
}
```

## Service Mesh: Istio

### Istio 설치 및 설정

```bash
# Istio 설치
$ curl -L https://istio.io/downloadIstio | sh -
$ export PATH=$PWD/istio-1.15.0/bin:$PATH
$ istioctl install --set values.defaultRevision=default

# 네임스페이스에 사이드카 자동 주입 활성화
$ kubectl label namespace default istio-injection=enabled

# 애드온 설치 (Kiali, Jaeger, Grafana, Prometheus)
$ kubectl apply -f istio-1.15.0/samples/addons/
```

### 트래픽 관리

```yaml
# virtualservice.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: myapp-vs
spec:
  hosts:
  - myapp.example.com
  http:
  - match:
    - headers:
        canary:
          exact: "true"
    route:
    - destination:
        host: myapp-service
        subset: canary
      weight: 100
  - route:
    - destination:
        host: myapp-service
        subset: stable
      weight: 90
    - destination:
        host: myapp-service
        subset: canary
      weight: 10

---
# destinationrule.yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: myapp-dr
spec:
  host: myapp-service
  subsets:
  - name: stable
    labels:
      version: stable
  - name: canary
    labels:
      version: canary
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 10
      http:
        http1MaxPendingRequests: 10
        maxRequestsPerConnection: 2
    outlierDetection:
      consecutiveErrors: 3
      interval: 30s
      baseEjectionTime: 30s
```

### 보안 정책

```yaml
# authorizationpolicy.yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: myapp-authz
spec:
  selector:
    matchLabels:
      app: myapp
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/frontend/sa/frontend-sa"]
  - to:
    - operation:
        methods: ["GET", "POST"]
        paths: ["/api/*"]
  - when:
    - key: request.headers[user-role]
      values: ["admin", "user"]

---
# peerauthentication.yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: myapp-pa
spec:
  selector:
    matchLabels:
      app: myapp
  mtls:
    mode: STRICT
```

## GitOps와 ArgoCD

### ArgoCD 설치

```bash
# ArgoCD 네임스페이스 생성
$ kubectl create namespace argocd

# ArgoCD 설치
$ kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# CLI 설치
$ curl -sSL -o argocd-linux-amd64 https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
$ sudo install -m 555 argocd-linux-amd64 /usr/local/bin/argocd

# 초기 패스워드 확인
$ argocd admin initial-password -n argocd

# 포트 포워딩으로 접속
$ kubectl port-forward svc/argocd-server -n argocd 8080:443
```

### GitOps 애플리케이션 정의

```yaml
# argocd-application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-prod
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/mycompany/myapp-k8s-manifests
    targetRevision: HEAD
    path: overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: myapp-prod
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
    - CreateNamespace=true
    - PrunePropagationPolicy=foreground
    - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

### Kustomize 통합

```bash
# 디렉토리 구조
myapp-k8s-manifests/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   └── kustomization.yaml
└── overlays/
    ├── development/
    │   ├── kustomization.yaml
    │   └── patches/
    └── production/
        ├── kustomization.yaml
        ├── patches/
        └── secrets/
```

```yaml
# base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
- deployment.yaml
- service.yaml
- configmap.yaml

commonLabels:
  app: myapp

images:
- name: myapp
  newTag: latest
```

```yaml
# overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: myapp-prod

resources:
- ../../base
- ingress.yaml
- hpa.yaml

patchesStrategicMerge:
- patches/deployment-prod.yaml

images:
- name: myapp
  newTag: v1.2.3

replicas:
- name: myapp
  count: 5

configMapGenerator:
- name: app-config
  files:
  - config/app.properties
  - config/logging.conf

secretGenerator:
- name: app-secrets
  files:
  - secrets/database.password
  - secrets/jwt.key
```

## Horizontal Pod Autoscaler (HPA)

### HPA 설정

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
      - type: Pods
        value: 2
        periodSeconds: 60
      selectPolicy: Max
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

### Vertical Pod Autoscaler (VPA)

```yaml
# vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: myapp-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  updatePolicy:
    updateMode: "Auto"  # Off, Initial, Auto
  resourcePolicy:
    containerPolicies:
    - containerName: myapp
      maxAllowed:
        cpu: 1000m
        memory: 2Gi
      minAllowed:
        cpu: 100m
        memory: 128Mi
      controlledResources: ["cpu", "memory"]
```

## 클러스터 모니터링 및 로깅

### Prometheus Operator

```yaml
# prometheus-operator.yaml
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata:
  name: prometheus
spec:
  serviceAccountName: prometheus
  serviceMonitorSelector:
    matchLabels:
      team: myteam
  ruleSelector:
    matchLabels:
      team: myteam
  resources:
    requests:
      memory: 400Mi
  retention: 30d
  storage:
    volumeClaimTemplate:
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 50Gi

---
# ServiceMonitor for application
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp-metrics
  labels:
    team: myteam
spec:
  selector:
    matchLabels:
      app: myapp
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics

---
# PrometheusRule for alerting
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: myapp-alerts
  labels:
    team: myteam
spec:
  groups:
  - name: myapp.rules
    rules:
    - alert: HighErrorRate
      expr: rate(http_requests_total{job="myapp",status=~"5.."}[5m]) > 0.1
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High error rate detected"
        description: "Error rate is {{ $value }} requests per second"
    
    - alert: HighMemoryUsage
      expr: container_memory_usage_bytes{container="myapp"} / container_spec_memory_limit_bytes > 0.9
      for: 2m
      labels:
        severity: warning
      annotations:
        summary: "High memory usage"
        description: "Memory usage is at {{ $value | humanizePercentage }}"
```

### EFK Stack (Elasticsearch, Fluentd, Kibana)

```yaml
# fluentd-daemonset.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: fluentd
  template:
    metadata:
      labels:
        name: fluentd
    spec:
      serviceAccountName: fluentd
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      containers:
      - name: fluentd
        image: fluent/fluentd-kubernetes-daemonset:v1-debian-elasticsearch
        env:
        - name: FLUENT_ELASTICSEARCH_HOST
          value: "elasticsearch.logging.svc.cluster.local"
        - name: FLUENT_ELASTICSEARCH_PORT
          value: "9200"
        - name: FLUENT_ELASTICSEARCH_SCHEME
          value: "http"
        volumeMounts:
        - name: varlog
          mountPath: /var/log
          readOnly: true
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
        - name: fluentd-config
          mountPath: /fluentd/etc
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
      - name: fluentd-config
        configMap:
          name: fluentd-config
```

## 레슨 런

### 1. 쿠버네티스는 생태계다

단순히 컨테이너 오케스트레이션 도구가 아니라, **거대한 생태계**다. Helm, Istio, ArgoCD 등 각각의 도구들이 유기적으로 연결된다.

### 2. GitOps는 선택이 아닌 필수다

대규모 운영에서는 **모든 것이 Git으로 관리**되어야 한다. Infrastructure as Code의 진정한 의미를 깨닫게 된다.

### 3. 관찰 가능성이 운영의 핵심이다

복잡한 시스템일수록 **무엇이 일어나고 있는지 아는 것**이 더욱 중요해진다. 메트릭, 로그, 추적을 처음부터 설계하자.

### 4. 자동화가 생존의 조건이다

수백 개의 서비스를 **수동으로 관리하는 것은 불가능**하다. Operator, HPA, VPA 등을 통해 자동화를 극대화하자.

### 5. 보안은 처음부터 고려해야 한다

Service Mesh를 통한 mTLS, RBAC, 네트워크 정책 등 **보안을 나중에 추가하려면 고통스럽다**.

---

**다음 장에서는** 쿠버네티스 클러스터 운영의 실전 노하우를 다룬다. 장애 대응, 성능 최적화, 비용 관리 등 현실적인 운영 이슈들을 해결해보자.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 인프라스트럭처
- **예상 시간**: 15-25시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-12-container-kubernetes)

- [12.1 Container 핵심 기술 - 격리의 과학](./13-10-container-internals.md)
- [12.2 Docker 오케스트레이션 및 프로덕션 배포](./13-11-docker-orchestration.md)
- [12.3 Kubernetes 기본 개념 및 아키텍처](./13-01-kubernetes-fundamentals.md)
- [12.5 Kubernetes 운영 및 트러블슈팅](./13-12-kubernetes-operations.md)

### 🏷️ 관련 키워드

`kubernetes`, `helm`, `operators`, `service-mesh`, `gitops`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
