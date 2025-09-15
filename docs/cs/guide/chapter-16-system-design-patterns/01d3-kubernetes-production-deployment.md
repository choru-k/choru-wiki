---
tags:
  - Microservices
  - Kubernetes
  - Production
  - Orchestration
  - DevOps
---

# 16.1D3 Kubernetes에서 마이크로서비스 프로덕션 배포

## ⚙️ 프로덕션 급 컨테이너 오케스트레이션

Kubernetes에서 마이크로서비스를 프로덕션 환경에 배포하기 위한 완전한 매니페스트 설정과 보안, 성능, 가용성을 고려한 베스트 프랙티스를 소개합니다.

## 완전한 User Service Kubernetes 매니페스트

### 주요 컴포넌트 배포 설정

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

### ConfigMap과 Secret 관리

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

### RBAC 및 ServiceAccount 설정

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

## Kubernetes 운영 베스트 프랙티스

### 1. 리소스 관리 및 제한

#### CPU와 메모리 설정

```yaml
# 적절한 리소스 요구사항과 제한
resources:
  requests:
    memory: "512Mi"    # 초기 요구량
    cpu: "500m"        # 0.5 CPU 코어
  limits:
    memory: "1024Mi"   # 최대 메모리 제한
    cpu: "1000m"       # 최대 CPU 제한
```

#### 저장 공간 관리

```yaml
# 임시 저장 공간 제한
resources:
  requests:
    ephemeral-storage: "1Gi"
  limits:
    ephemeral-storage: "2Gi"

# 영구 볼륨 예시
volumes:
- name: data-volume
  persistentVolumeClaim:
    claimName: user-service-pvc
```

### 2. 헬스체크 구성

#### 세 종류의 Probe 활용

```yaml
# Startup Probe - 컨테이너 초기 시작 확인
startupProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8081
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 18  # 3분 간 시도

# Liveness Probe - 컨테이너 생존 여부 확인
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8081
  initialDelaySeconds: 90
  periodSeconds: 30
  failureThreshold: 3

# Readiness Probe - 트래픽 수용 준비 여부 확인
readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8081
  initialDelaySeconds: 30
  periodSeconds: 15
  failureThreshold: 3
```

### 3. 보안 강화

#### Pod Security Context

```yaml
# Pod 레벨 보안 설정
securityContext:
  runAsNonRoot: true        # 비루트 실행 강제
  runAsUser: 1001          # 전용 사용자 ID
  fsGroup: 1001            # 파일시스템 그룹

# 컨테이너 레벨 보안
containers:
- name: user-service
  securityContext:
    allowPrivilegeEscalation: false  # 권한 상승 차단
    readOnlyRootFilesystem: true     # 읽기 전용 루트 파일시스템
    runAsNonRoot: true
    capabilities:
      drop:
      - ALL                          # 모든 권한 제거
```

#### Network Policy

```yaml
# 네트워크 보안 정책
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: user-service-netpol
spec:
  podSelector:
    matchLabels:
      app: user-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway  # API Gateway만 접근 허용
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres     # 데이터베이스만 접근 허용
```

### 4. 자동 스케일링

#### HPA (Horizontal Pod Autoscaler)

```yaml
# 다중 메트릭 기반 자동 확장
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
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
```

#### VPA (Vertical Pod Autoscaler)

```yaml
# 리소스 자동 조정 (옵션)
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: user-service-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  updatePolicy:
    updateMode: "Auto"  # Off, Initial, Recreation, Auto
  resourcePolicy:
    containerPolicies:
    - containerName: user-service
      maxAllowed:
        cpu: 2
        memory: 2Gi
      minAllowed:
        cpu: 100m
        memory: 128Mi
```

## 핵심 요점

### 1. 프로덕션 준비 배포 설정

Pod 스케줄링, 리소스 관리, 보안 정책, 자동 확장을 포함한 완전한 배포 설정

### 2. 가용성과 내결함성

여러 가용 영역 배포, Pod Disruption Budget, Graceful Shutdown을 통한 높은 가용성 확보

### 3. 보안 우선 설계

최소 권한 원칙, 네트워크 격리, 사용자 및 루트 파일시스템 보안을 통한 보안 강화

---

**이전**: [Docker Compose 로컬 개발 환경](01d2-docker-compose-environment.md)  
**다음**: [모니터링과 성공/실패 요인](01e-monitoring-success-factors.md)에서 운영과 관리 방법을 학습합니다.
