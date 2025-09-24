---
tags:
  - advanced
  - deep-study
  - deployment
  - hands-on
  - kubernetes
  - production
  - scaling
  - security
  - 인프라스트럭처
difficulty: ADVANCED
learning_time: "12-16시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 16.7.4: Kubernetes 프로덕션 운영

## ☘️ 프로덕션 그레이드 Kubernetes 배포 전략

Kubernetes에서 마이크로서비스를 프로덕션 환경에 배포하려면 고가용성, 확장성, 보안, 모니터링 등 다양한 요소를 고려해야 합니다. 실제 운영 환경에서 사용할 수 있는 완전한 Kubernetes 매니페스트를 살펴보겠습니다.

## 완전한 User Service Kubernetes 매니페스트

### Deployment, Service, HPA 설정

```yaml
# user-service.yaml - 프로덕션 환경 배포 설정
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: ecommerce
  labels:
    app: user-service
    version: v1.2.0
    component: backend
    tier: service
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: user-service
      version: v1.2.0
  template:
    metadata:
      labels:
        app: user-service
        version: v1.2.0
        component: backend
        tier: service
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/path: "/actuator/prometheus"
        prometheus.io/port: "8080"
        co.elastic.logs/module: "user-service"
    spec:
      # 보안 설정
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      
      # Pod 스케줄링 규칙
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - user-service
              topologyKey: kubernetes.io/hostname
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: node-type
                operator: In
                values:
                - compute
      
      # 초기화 컨테이너 (데이터베이스 마이그레이션)
      initContainers:
      - name: db-migration
        image: ecommerce/user-service-migration:v1.2.0
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: user-db-secret
              key: url
        - name: DATABASE_USERNAME
          valueFrom:
            secretKeyRef:
              name: user-db-secret
              key: username
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: user-db-secret
              key: password
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
            
      containers:
      - name: user-service
        image: ecommerce/user-service:v1.2.0
        imagePullPolicy: IfNotPresent
        
        ports:
        - containerPort: 8080
          name: http
          protocol: TCP
        - containerPort: 8081
          name: management
          protocol: TCP
          
        env:
        # 애플리케이션 설정
        - name: SPRING_PROFILES_ACTIVE
          value: "kubernetes"
        - name: SERVER_PORT
          value: "8080"
        - name: MANAGEMENT_SERVER_PORT
          value: "8081"
          
        # 데이터베이스 연결 설정
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: user-db-secret
              key: url
        - name: DATABASE_USERNAME
          valueFrom:
            secretKeyRef:
              name: user-db-secret
              key: username
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: user-db-secret
              key: password
        - name: DATABASE_POOL_SIZE
          value: "20"
        - name: DATABASE_POOL_TIMEOUT
          value: "30000"
          
        # Redis 설정
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: user-service-config
              key: redis.url
        - name: REDIS_TIMEOUT
          value: "3000"
        - name: REDIS_POOL_SIZE
          value: "10"
          
        # Kafka 설정
        - name: KAFKA_BROKERS
          valueFrom:
            configMapKeyRef:
              name: user-service-config
              key: kafka.brokers
        - name: KAFKA_CONSUMER_GROUP
          value: "user-service-group"
        - name: KAFKA_RETRY_ATTEMPTS
          value: "3"
          
        # APM 설정
        - name: ELASTIC_APM_SERVER_URLS
          valueFrom:
            configMapKeyRef:
              name: apm-config
              key: server.urls
        - name: ELASTIC_APM_SERVICE_NAME
          value: "user-service"
        - name: ELASTIC_APM_ENVIRONMENT
          value: "production"
        - name: ELASTIC_APM_APPLICATION_PACKAGES
          value: "com.ecommerce.user"
        - name: ELASTIC_APM_SAMPLE_RATE
          value: "1.0"
          
        # JVM 설정
        - name: JAVA_OPTS
          value: >-
            -Xms512m -Xmx1024m
            -XX:+UseG1GC
            -XX:MaxGCPauseMillis=200
            -XX:+HeapDumpOnOutOfMemoryError
            -XX:HeapDumpPath=/tmp/heapdump.hprof
            -Dfile.encoding=UTF-8
            -Duser.timezone=Asia/Seoul
            
        # Kubernetes 관련 설정
        - name: KUBERNETES_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: POD_IP
          valueFrom:
            fieldRef:
              fieldPath: status.podIP
        - name: NODE_NAME
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
              
        # 리소스 요구사항 및 제한
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
            ephemeral-storage: "1Gi"
          limits:
            memory: "1024Mi"
            cpu: "1000m"
            ephemeral-storage: "2Gi"
            
        # 헬스체크 설정
        livenessProbe:
          httpGet:
            path: /actuator/health/liveness
            port: 8081
            scheme: HTTP
          initialDelaySeconds: 90
          periodSeconds: 30
          timeoutSeconds: 10
          failureThreshold: 3
          successThreshold: 1
          
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8081
            scheme: HTTP
          initialDelaySeconds: 30
          periodSeconds: 15
          timeoutSeconds: 5
          failureThreshold: 3
          successThreshold: 1
          
        startupProbe:
          httpGet:
            path: /actuator/health/liveness
            port: 8081
            scheme: HTTP
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 18  # 3분 내 시작되어야 함
          successThreshold: 1
          
        # 컨테이너 생명주기 훅
        lifecycle:
          preStop:
            exec:
              command:
              - /bin/sh
              - -c
              - >
                echo "Graceful shutdown initiated";
                sleep 20;
                echo "Graceful shutdown completed";
                
        # 볼륨 마운트
        volumeMounts:
        - name: config-volume
          mountPath: /app/config
          readOnly: true
        - name: logs-volume
          mountPath: /app/logs
        - name: tmp-volume
          mountPath: /tmp
          
        # 보안 컨텍스트
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 1001
          runAsGroup: 1001
          capabilities:
            drop:
            - ALL
            
      # 사이드카 컨테이너 (로그 수집)
      - name: log-collector
        image: fluent/fluent-bit:2.0
        volumeMounts:
        - name: logs-volume
          mountPath: /app/logs
          readOnly: true
        - name: fluent-bit-config
          mountPath: /fluent-bit/etc
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
            
      # 볼륨 정의
      volumes:
      - name: config-volume
        configMap:
          name: user-service-config
      - name: logs-volume
        emptyDir: {}
      - name: tmp-volume
        emptyDir: {}
      - name: fluent-bit-config
        configMap:
          name: fluent-bit-config
          
      # Graceful shutdown을 위한 종료 대기 시간
      terminationGracePeriodSeconds: 60
      
      # DNS 설정
      dnsPolicy: ClusterFirst
      
      # Service Account
      serviceAccountName: user-service-sa

---
# Service 정의
apiVersion: v1
kind: Service
metadata:
  name: user-service
  namespace: ecommerce
  labels:
    app: user-service
    component: backend
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: nlb
    service.beta.kubernetes.io/aws-load-balancer-internal: "true"
spec:
  type: ClusterIP
  selector:
    app: user-service
  ports:
  - name: http
    port: 80
    targetPort: 8080
    protocol: TCP
  - name: management
    port: 8081
    targetPort: 8081
    protocol: TCP
  sessionAffinity: None

---
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: user-service-hpa
  namespace: ecommerce
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  minReplicas: 3
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
        averageValue: "100"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
      - type: Pods
        value: 2
        periodSeconds: 60
      selectPolicy: Max
    scaleDown:
      stabilizationWindowSeconds: 600
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
      selectPolicy: Min
```

### 보안 및 네트워크 정책

```yaml
---
# Pod Disruption Budget
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: user-service-pdb
  namespace: ecommerce
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: user-service

---
# NetworkPolicy (보안)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: user-service-netpol
  namespace: ecommerce
spec:
  podSelector:
    matchLabels:
      app: user-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  # API Gateway에서의 접근 허용
  - from:
    - namespaceSelector:
        matchLabels:
          name: ecommerce
      podSelector:
        matchLabels:
          app: api-gateway
    ports:
    - protocol: TCP
      port: 8080
  # 다른 마이크로서비스에서의 접근 허용
  - from:
    - namespaceSelector:
        matchLabels:
          name: ecommerce
      podSelector:
        matchLabels:
          tier: service
    ports:
    - protocol: TCP
      port: 8080
  # Prometheus 모니터링 허용
  - from:
    - namespaceSelector:
        matchLabels:
          name: monitoring
    ports:
    - protocol: TCP
      port: 8081
  egress:
  # 데이터베이스 접근 허용
  - to:
    - namespaceSelector:
        matchLabels:
          name: database
    ports:
    - protocol: TCP
      port: 5432
  # Redis 접근 허용
  - to:
    - namespaceSelector:
        matchLabels:
          name: cache
    ports:
    - protocol: TCP
      port: 6379
  # Kafka 접근 허용
  - to:
    - namespaceSelector:
        matchLabels:
          name: messaging
    ports:
    - protocol: TCP
      port: 9092
  # DNS 조회 허용
  - to: []
    ports:
    - protocol: UDP
      port: 53
```

### 설정 및 비밀 관리

```yaml
---
# ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: user-service-config
  namespace: ecommerce
data:
  application.yml: |
    spring:
      application:
        name: user-service
      datasource:
        hikari:
          maximum-pool-size: 20
          minimum-idle: 5
          idle-timeout: 300000
          max-lifetime: 1800000
          connection-timeout: 30000
      jpa:
        hibernate:
          ddl-auto: validate
        show-sql: false
        properties:
          hibernate:
            format_sql: false
            use_sql_comments: false
            jdbc:
              batch_size: 20
              order_inserts: true
              order_updates: true
    
    management:
      endpoints:
        web:
          exposure:
            include: health,info,metrics,prometheus
          base-path: /actuator
      endpoint:
        health:
          show-details: when-authorized
          probes:
            enabled: true
    
    logging:
      level:
        com.ecommerce.user: INFO
        org.springframework.web: WARN
        org.hibernate: WARN
      pattern:
        console: "%d{HH:mm:ss.SSS} [%thread] %-5level [%X{traceId},%X{spanId}] %logger{36} - %msg%n"
        file: "%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level [%X{traceId},%X{spanId}] %logger{36} - %msg%n"
      file:
        name: /app/logs/user-service.log
        max-size: 100MB
        max-history: 7
  
  redis.url: "redis://redis-cluster.cache.svc.cluster.local:6379"
  kafka.brokers: "kafka-cluster.messaging.svc.cluster.local:9092"

---
# Secret (실제 환경에서는 별도로 관리)
apiVersion: v1
kind: Secret
metadata:
  name: user-db-secret
  namespace: ecommerce
type: Opaque
data:
  url: cG9zdGdyZXNxbDovL3VzZXItZGIuZGF0YWJhc2Uuc3ZjLmNsdXN0ZXIubG9jYWw6NTQzMi91c2VyZGI=
  username: dXNlcnNlcnZpY2U=
  password: c2VjdXJlUGFzc3dvcmQxMjMh
```

### RBAC 및 서비스 계정

```yaml
---
# ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: user-service-sa
  namespace: ecommerce
automountServiceAccountToken: false

---
# RBAC Role (필요한 최소 권한만)
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: user-service-role
  namespace: ecommerce
rules:
- apiGroups: [""]
  resources: ["configmaps", "secrets"]
  verbs: ["get", "list"]
- apiGroups: [""]
  resources: ["events"]
  verbs: ["create"]

---
# RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: user-service-binding
  namespace: ecommerce
subjects:
- kind: ServiceAccount
  name: user-service-sa
  namespace: ecommerce
roleRef:
  kind: Role
  name: user-service-role
  apiGroup: rbac.authorization.k8s.io
```

## Kubernetes 고급 기능 활용

### 1. 파드 스케줄링 최적화

**Anti-Affinity 규칙**:

```yaml
affinity:
  podAntiAffinity:
    # 강제 규칙: 같은 노드에 파드 배치 금지
    requiredDuringSchedulingIgnoredDuringExecution:
    - labelSelector:
        matchExpressions:
        - key: app
          operator: In
          values:
          - user-service
      topologyKey: kubernetes.io/hostname
    
    # 선호 규칙: 가능하면 다른 노드에 배치
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values:
            - user-service
        topologyKey: kubernetes.io/hostname
```

**노드 선택 규칙**:

```yaml
nodeAffinity:
  requiredDuringSchedulingIgnoredDuringExecution:
    nodeSelectorTerms:
    - matchExpressions:
      - key: node-type
        operator: In
        values:
        - compute
      - key: instance-type
        operator: NotIn
        values:
        - spot  # Spot 인스턴스 피하기
```

### 2. 자동 스케일링 고도화

**HPA v2 고급 설정**:

```yaml
spec:
  metrics:
  # CPU 기반 스케일링
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  
  # 메모리 기반 스케일링
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  
  # 커스텀 메트릭 기반 스케일링
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
  
  # 스케일링 동작 제어
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 300  # 5분 안정화 기간
      policies:
      - type: Percent
        value: 100  # 최대 100% 증가
        periodSeconds: 60
      - type: Pods
        value: 2    # 최대 2개 팍 증가
        periodSeconds: 60
      selectPolicy: Max
    
    scaleDown:
      stabilizationWindowSeconds: 600  # 10분 안정화 기간
      policies:
      - type: Percent
        value: 10   # 최대 10% 감소
        periodSeconds: 60
      selectPolicy: Min
```

### 3. 로링 업데이트 전략

**RollingUpdate 세밀 제어**:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 25%     # 최대 25% 파드 비활성화
    maxSurge: 25%          # 최대 25% 추가 파드

# 생명주기 훅 설정
lifecycle:
  preStop:
    exec:
      command:
      - /bin/sh
      - -c
      - >
        echo "Graceful shutdown initiated";
        # 비지니스 로직 정리
        curl -X POST http://localhost:8080/actuator/shutdown;
        sleep 20;
        echo "Graceful shutdown completed";

# 종료 대기 시간
terminationGracePeriodSeconds: 60
```

## 보안 모범 사례

### 1. Pod Security Standards

```yaml
# Pod 보안 설정
securityContext:
  # 컨테이너 레벨 보안
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  capabilities:
    drop:
    - ALL
    add:
    - NET_BIND_SERVICE  # 필요시만 추가

# Pod 레벨 보안
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  fsGroup: 1001
  seccompProfile:
    type: RuntimeDefault
```

### 2. 네트워크 보안 정책

```yaml
# 마이크로서비스 간 통신 제어
policyTypes:
- Ingress
- Egress

ingress:
# 지정된 서비스에서만 접근 허용
- from:
  - namespaceSelector:
      matchLabels:
        name: ecommerce
    podSelector:
      matchLabels:
        app: api-gateway
  ports:
  - protocol: TCP
    port: 8080

egress:
# 필요한 외부 서비스에만 접근 허용
- to:
  - namespaceSelector:
      matchLabels:
        name: database
  ports:
  - protocol: TCP
    port: 5432
```

### 3. 비밀 및 설정 관리

```yaml
# External Secrets Operator 사용 예시
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: user-db-secret
  namespace: ecommerce
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: user-db-secret
    creationPolicy: Owner
  data:
  - secretKey: url
    remoteRef:
      key: secret/data/database/user-service
      property: url
  - secretKey: username
    remoteRef:
      key: secret/data/database/user-service
      property: username
  - secretKey: password
    remoteRef:
      key: secret/data/database/user-service
      property: password
```

## 핵심 요점

### 1. 프로덕션 그레이드 보안

Pod Security Standards, Network Policies, RBAC로 다층 보안 구성

### 2. 고가용성 설계

Pod Anti-Affinity, PDB, Rolling Update로 서비스 연속성 보장

### 3. 자동 운영 최적화

HPA, VPA, Cluster Autoscaler로 리소스 효율적 활용

### 4. 관찰 가능성 통합

Prometheus, Jaeger, ELK Stack과 통합된 전체 시스템 모니터링

---

**이전**: [로컬 개발 환경 구성](chapter-15-microservices-architecture/01d3-local-development.md)  
**다음**: [모니터링과 성공/실패 요인](./16-06-01-monitoring-success-factors.md)에서 운영과 관리 방법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: ADVANCED
-**주제**: 인프라스트럭처
-**예상 시간**: 12-16시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-16-distributed-system-patterns)

- [15.1 마이크로서비스 아키텍처 개요](../chapter-15-microservices-architecture/16-01-microservices-architecture.md)
- [15.1A 모놀리스 문제점과 전환 전략](../chapter-15-microservices-architecture/16-10-monolith-to-microservices.md)
- [16.1B 마이크로서비스 설계 원칙과 패턴 개요](./16-01-02-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-01-02-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-01-03-single-responsibility.md)

### 🏷️ 관련 키워드

`kubernetes`, `production`, `deployment`, `security`, `scaling`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
