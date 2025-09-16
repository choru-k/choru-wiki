---
tags:
  - blue-green-deployment
  - canary-deployment
  - deep-study
  - docker-compose
  - docker-swarm
  - hands-on
  - intermediate
  - orchestration
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "8-12시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 12.2 Docker 오케스트레이션 및 프로덕션 배포

## 2019년 5월, 컨테이너 지옥에 빠진 날

2019년 5월 15일, 우리 회사는 마침내 Docker를 도입하기로 결정했다. "컨테이너로 배포하면 모든 게 해결될 거야!"라며 의기양양했던 우리는 곧 현실의 벽에 부딪혔다.

**첫 번째 문제: 무질서한 컨테이너들**

- 개발자마다 다른 방식으로 컨테이너 빌드
- `docker run` 명령어가 100줄 넘어가는 괴물 스크립트들
- 컨테이너가 죽으면 수동으로 재시작
- 로그는 어디에? 모니터링은 어떻게?

**두 번째 문제: 스케일링 악몽**

- 트래픽 급증 → 수동으로 컨테이너 추가
- 메모리 부족 → 어떤 컨테이너가 문제인지 모름
- 배포 중 서비스 다운타임
- 롤백? 그게 뭐죠?

그때 깨달았다. **컨테이너 하나 잘 돌리는 것과 수백 개를 관리하는 것은 완전히 다른 문제**라는 걸.

## Docker Compose: 멀티 컨테이너의 첫 걸음

### Docker Compose란?

Docker Compose는 **멀티 컨테이너 Docker 애플리케이션을 정의하고 실행**하는 도구다. YAML 파일로 서비스를 정의하고, 단일 명령으로 모든 서비스를 시작할 수 있다.

### 실전 예제: 웹 애플리케이션 스택

```yaml
# docker-compose.yml
version: '3.8'

services:
  # 웹 애플리케이션
  web:
    build: 
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/myapp
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - db
      - redis
    volumes:
      - .:/app
      - /app/node_modules  # node_modules는 컨테이너 내부 것 사용
    restart: unless-stopped
    networks:
      - app-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web.rule=Host(`myapp.localhost`)"

  # 데이터베이스
  db:
    image: postgres:13
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped
    networks:
      - app-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 캐시
  redis:
    image: redis:6-alpine
    command: redis-server --appendonly yes --requirepass "redis_password"
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    restart: unless-stopped
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 백그라운드 작업자
  worker:
    build: .
    command: celery -A myapp.celery worker --loglevel=info
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/myapp
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - db
      - redis
    volumes:
      - .:/app
    restart: unless-stopped
    networks:
      - app-network

  # 리버스 프록시 (Nginx)
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - web
    restart: unless-stopped
    networks:
      - app-network

  # 모니터링
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
    restart: unless-stopped
    networks:
      - app-network

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus
    restart: unless-stopped
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:

networks:
  app-network:
    driver: bridge
```

### Docker Compose 고급 기법

#### 1. 환경별 설정 분리

```bash
# 개발 환경
$ docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# 프로덕션 환경  
$ docker-compose -f docker-compose.yml -f docker-compose.prod.yml up
```

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  web:
    environment:
      - DEBUG=True
      - LOG_LEVEL=DEBUG
    volumes:
      - .:/app  # 코드 핫 리로드
    command: python manage.py runserver 0.0.0.0:8000
```

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  web:
    environment:
      - DEBUG=False
      - LOG_LEVEL=INFO
    # 볼륨 마운트 제거 (보안상)
    command: gunicorn --bind 0.0.0.0:8000 --workers 4 myapp.wsgi
    
  db:
    environment:
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

#### 2. 헬스체크와 의존성 관리

```yaml
services:
  web:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  # 의존성 체크 서비스
  wait-for-deps:
    image: dadarek/wait-for-dependencies
    depends_on:
      - db
      - redis
    command: db:5432 redis:6379
```

#### 3. 로깅 구성

```yaml
services:
  web:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
        labels: "service=web"

  # 중앙 로그 수집
  fluentd:
    image: fluent/fluentd:v1.14
    volumes:
      - ./fluentd.conf:/fluentd/etc/fluent.conf
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    ports:
      - "24224:24224"
```

## Docker Swarm: 내장 오케스트레이션

### Docker Swarm이란?

Docker Swarm은 Docker에 내장된 **클러스터링 및 오케스트레이션** 도구다. 여러 Docker 호스트를 하나의 가상 Docker 호스트처럼 관리할 수 있다.

### Swarm 클러스터 구축

```bash
# 매니저 노드 초기화
$ docker swarm init --advertise-addr 192.168.1.100
Swarm initialized: current node (node-1) is now a manager.

To add a worker to this swarm, run the following command:
    docker swarm join --token SWMTKN-1-xxxx 192.168.1.100:2377

To add a manager to this swarm, run 'docker swarm join-token manager'

# 워커 노드 추가
$ docker swarm join --token SWMTKN-1-xxxx 192.168.1.100:2377
This node joined a swarm as a worker.

# 클러스터 상태 확인
$ docker node ls
ID                HOSTNAME   STATUS   AVAILABILITY   MANAGER STATUS
abc123def456      node-1     Ready    Active         Leader
ghi789jkl012      node-2     Ready    Active         
mno345pqr678      node-3     Ready    Active         
```

### Docker Stack으로 서비스 배포

```yaml
# docker-stack.yml
version: '3.8'

services:
  web:
    image: myapp:latest
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/myapp
    networks:
      - app-network
    deploy:
      mode: replicated
      replicas: 3
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
      placement:
        constraints:
          - node.role == worker
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M

  db:
    image: postgres:13
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - db_data:/var/lib/postgresql/data
    networks:
      - app-network
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.hostname == node-1  # 특정 노드에 고정
      restart_policy:
        condition: on-failure
    secrets:
      - db_password

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - type: bind
        source: ./nginx.conf
        target: /etc/nginx/nginx.conf
    networks:
      - app-network
    deploy:
      mode: global  # 모든 노드에 하나씩 배포
      restart_policy:
        condition: on-failure

volumes:
  db_data:
    driver: local

networks:
  app-network:
    driver: overlay
    attachable: true

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### 스택 관리 명령어

```bash
# 스택 배포
$ docker stack deploy -c docker-stack.yml myapp

# 스택 상태 확인
$ docker stack ls
NAME     SERVICES   ORCHESTRATOR
myapp    3          Swarm

$ docker stack services myapp
ID          NAME        MODE        REPLICAS    IMAGE
abc123      myapp_web   replicated  3/3         myapp:latest
def456      myapp_db    replicated  1/1         postgres:13
ghi789      myapp_nginx global      3/3         nginx:alpine

# 서비스 로그 확인
$ docker service logs -f myapp_web

# 서비스 스케일링
$ docker service scale myapp_web=5

# 롤링 업데이트
$ docker service update --image myapp:v2.0 myapp_web

# 스택 제거
$ docker stack rm myapp
```

## 프로덕션 배포 전략

### Blue-Green 배포

```bash
#!/bin/bash
# blue-green-deploy.sh

set -e

APP_NAME="myapp"
NEW_VERSION=$1
CURRENT_VERSION=$(docker service inspect ${APP_NAME}_web --format='{{.Spec.TaskTemplate.ContainerSpec.Image}}' | cut -d':' -f2)

echo "현재 버전: $CURRENT_VERSION"
echo "새 버전: $NEW_VERSION"

# 1단계: Green 환경 배포
echo "🟢 Green 환경 배포 중..."
sed "s|myapp:.*|myapp:$NEW_VERSION|g" docker-stack.yml > docker-stack-green.yml
sed -i "s|${APP_NAME}_|${APP_NAME}_green_|g" docker-stack-green.yml
sed -i "s|80:80|8080:80|g" docker-stack-green.yml  # 다른 포트로 배포

docker stack deploy -c docker-stack-green.yml ${APP_NAME}_green

# 2단계: 헬스 체크
echo "🏥 헬스 체크 중..."
for i in {1..30}; do
    if curl -f http://localhost:8080/health/; then
        echo "✅ Green 환경 정상"
        break
    fi
    echo "대기 중... ($i/30)"
    sleep 10
done

# 3단계: 트래픽 전환 (로드 밸런서 설정 변경)
echo "🔄 트래픽 전환 중..."
# HAProxy/Nginx/CloudFlare 설정을 8080 → 80으로 변경
./update-loadbalancer.sh 8080

# 4단계: Blue 환경 제거
echo "🔵 Blue 환경 제거 중..."
sleep 30  # 안전을 위한 대기
docker stack rm ${APP_NAME}

# 5단계: Green을 Blue로 승격
echo "🔄 Green → Blue 승격 중..."
docker stack rm ${APP_NAME}_green
sed -i "s|${APP_NAME}_green_|${APP_NAME}_|g" docker-stack-green.yml
sed -i "s|8080:80|80:80|g" docker-stack-green.yml
docker stack deploy -c docker-stack-green.yml ${APP_NAME}

echo "✅ 배포 완료!"
```

### Canary 배포

```yaml
# docker-stack-canary.yml
version: '3.8'

services:
  # 기존 stable 버전 (90% 트래픽)
  web-stable:
    image: myapp:v1.5
    networks:
      - app-network
    deploy:
      replicas: 9  # 90% 트래픽
      labels:
        - traefik.http.services.web.loadbalancer.sticky.cookie.name=server_id
        - traefik.http.services.web.loadbalancer.sticky.cookie.secure=true
      update_config:
        parallelism: 1
        delay: 30s

  # 새 canary 버전 (10% 트래픽)
  web-canary:
    image: myapp:v2.0  
    networks:
      - app-network
    deploy:
      replicas: 1  # 10% 트래픽
      labels:
        - traefik.http.services.web-canary.loadbalancer.server.weight=10

  # 트래픽 분산 설정
  traefik:
    image: traefik:v2.8
    command:
      - --api.insecure=true
      - --providers.docker.swarmmode=true
      - --entrypoints.web.address=:80
    ports:
      - "80:80"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - app-network
    deploy:
      placement:
        constraints:
          - node.role == manager

networks:
  app-network:
    driver: overlay
```

### 모니터링 및 로깅 통합

```yaml
# monitoring-stack.yml
version: '3.8'

services:
  # 메트릭 수집
  node-exporter:
    image: prom/node-exporter:latest
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.ignored-mount-points=^/(sys|proc|dev|host|etc)($$|/)'
    networks:
      - monitoring
    deploy:
      mode: global

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:rw
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    networks:
      - monitoring
    deploy:
      mode: global

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=30d'
    networks:
      - monitoring
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/var/lib/grafana/dashboards
      - ./grafana/provisioning:/etc/grafana/provisioning
    networks:
      - monitoring
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

  # 로그 수집
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:7.17.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    networks:
      - logging
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

  logstash:
    image: docker.elastic.co/logstash/logstash:7.17.0
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline
      - ./logstash/config:/usr/share/logstash/config
    networks:
      - logging
    deploy:
      replicas: 1

  kibana:
    image: docker.elastic.co/kibana/kibana:7.17.0
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    networks:
      - logging
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

volumes:
  prometheus_data:
  grafana_data:
  elasticsearch_data:

networks:
  monitoring:
    driver: overlay
  logging:
    driver: overlay
```

### 백업 및 복구 전략

```bash
#!/bin/bash
# backup.sh - 볼륨 백업 스크립트

set -e

BACKUP_DIR="/backups/$(date +%Y-%m-%d)"
mkdir -p $BACKUP_DIR

# 데이터베이스 백업
echo "📦 데이터베이스 백업 중..."
docker exec $(docker ps -q -f name=myapp_db) pg_dump -U postgres myapp > $BACKUP_DIR/database.sql

# 볼륨 백업
echo "💾 볼륨 백업 중..."
docker run --rm \
  -v myapp_db_data:/source:ro \
  -v $BACKUP_DIR:/backup \
  alpine:latest \
  tar czf /backup/db_data.tar.gz -C /source .

docker run --rm \
  -v myapp_redis_data:/source:ro \
  -v $BACKUP_DIR:/backup \
  alpine:latest \
  tar czf /backup/redis_data.tar.gz -C /source .

# 설정 파일 백업
echo "⚙️ 설정 파일 백업 중..."
tar czf $BACKUP_DIR/configs.tar.gz \
  docker-compose.yml \
  docker-stack.yml \
  nginx.conf \
  prometheus.yml

# S3로 업로드 (선택사항)
echo "☁️ 클라우드 업로드 중..."
aws s3 sync $BACKUP_DIR s3://myapp-backups/$(date +%Y-%m-%d)/

# 오래된 백업 정리 (30일 이상)
find /backups -type d -mtime +30 -exec rm -rf {} +

echo "✅ 백업 완료: $BACKUP_DIR"
```

```bash
#!/bin/bash
# restore.sh - 복구 스크립트

set -e

BACKUP_DATE=$1
if [ -z "$BACKUP_DATE" ]; then
  echo "사용법: $0 <YYYY-MM-DD>"
  exit 1
fi

BACKUP_DIR="/backups/$BACKUP_DATE"

# 서비스 중지
echo "🛑 서비스 중지 중..."
docker stack rm myapp

# 볼륨 복구
echo "💾 볼륨 복구 중..."
docker volume rm myapp_db_data myapp_redis_data 2>/dev/null || true
docker volume create myapp_db_data
docker volume create myapp_redis_data

docker run --rm \
  -v myapp_db_data:/target \
  -v $BACKUP_DIR:/backup \
  alpine:latest \
  tar xzf /backup/db_data.tar.gz -C /target

docker run --rm \
  -v myapp_redis_data:/target \
  -v $BACKUP_DIR:/backup \
  alpine:latest \
  tar xzf /backup/redis_data.tar.gz -C /target

# 서비스 재시작
echo "🚀 서비스 재시작 중..."
docker stack deploy -c docker-stack.yml myapp

echo "✅ 복구 완료!"
```

## 성능 최적화 및 보안

### 컨테이너 이미지 최적화

```dockerfile
# 최적화된 Dockerfile
FROM node:16-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 멀티스테이지 빌드로 크기 줄이기
FROM node:16-alpine AS runtime

# 보안: 비 root 사용자 생성
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# 필요한 파일만 복사
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs . .

# 보안: 비 root로 실행
USER nextjs

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

EXPOSE 3000

CMD ["npm", "start"]
```

### 보안 설정

```yaml
# secure-stack.yml
version: '3.8'

services:
  web:
    image: myapp:latest
    networks:
      - app-network
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
      placement:
        constraints:
          - node.role == worker
    # 보안 옵션
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    read_only: true
    tmpfs:
      - /tmp
      - /var/run
    user: "1001:1001"  # 비 root 사용자
    security_opt:
      - no-new-privileges:true
    sysctls:
      - net.core.somaxconn=65535

  db:
    image: postgres:13
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - db_data:/var/lib/postgresql/data
    networks:
      - app-network
    secrets:
      - db_password
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.hostname == secure-node
    # 데이터베이스 보안
    cap_drop:
      - ALL
    cap_add:
      - SETUID
      - SETGID
      - DAC_OVERRIDE
    tmpfs:
      - /tmp
      - /var/run/postgresql

secrets:
  db_password:
    external: true

volumes:
  db_data:
    driver: local

networks:
  app-network:
    driver: overlay
    encrypted: true  # 네트워크 암호화
```

## 레슨 런

### 1. 점진적 도입이 성공의 열쇠다

Docker Compose → Docker Swarm → Kubernetes 순으로 단계적으로 도입하자. 한 번에 모든 걸 바꾸려 하면 실패한다.

### 2. 모니터링과 로깅은 필수다

컨테이너가 많아질수록 **관찰 가능성**이 더욱 중요해진다. 처음부터 모니터링 스택을 구축하자.

### 3. 보안은 기본이다

`--privileged`나 `root` 사용자는 **절대 금물**. 최소 권한 원칙을 철저히 지키자.

### 4. 백업과 복구 계획을 세워라

컨테이너는 **일회용**이지만 데이터는 영구적이어야 한다. 정기 백업과 복구 테스트를 자동화하자.

---

**다음 장에서는** Kubernetes를 통해 대규모 컨테이너 오케스트레이션을 마스터한다. Docker Swarm의 한계를 뛰어넘는 진정한 클라우드 네이티브 환경을 구축해보자.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-12-container-kubernetes)

- [12.1 Container 핵심 기술 - 격리의 과학](./13-10-container-internals.md)
- [12.3 Kubernetes 기본 개념 및 아키텍처](./13-01-kubernetes-fundamentals.md)
- [12.4 Kubernetes 고급 기능 및 운영](./13-20-kubernetes-advanced.md)
- [12.5 Kubernetes 운영 및 트러블슈팅](./13-12-kubernetes-operations.md)

### 🏷️ 관련 키워드

`docker-compose`, `docker-swarm`, `orchestration`, `blue-green-deployment`, `canary-deployment`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
