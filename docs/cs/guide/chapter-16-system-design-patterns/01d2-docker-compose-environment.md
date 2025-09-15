---
tags:
  - Microservices
  - Docker Compose
  - DevOps
  - Development Environment
  - Local Development
---

# 16.1D2 Docker Compose를 통한 로컬 개발 환경

## 🏗️ 마이크로서비스 통합 개발 환경

Docker Compose를 활용하여 여러 마이크로서비스, 데이터베이스, 메시지 큐, 캐시 등을 통합한 로컬 개발 환경을 구성합니다. 실제 프로덕션 환경과 유사한 설정으로 개발과 테스트를 효율적으로 진행할 수 있습니다.

## 완전한 마이크로서비스 개발 환경 구성

### 전체 시스템 Docker Compose 설정

```yaml
# docker-compose.yml - 로컬 개발 환경 구성
version: '3.8'

services:
  # API Gateway
  api-gateway:
    build:
      context: ./api-gateway
      dockerfile: Dockerfile.dev
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=local
      - USER_SERVICE_URL=http://user-service:8081
      - PRODUCT_SERVICE_URL=http://product-service:8082
      - ORDER_SERVICE_URL=http://order-service:8083
    depends_on:
      - user-service
      - product-service
      - order-service
    networks:
      - microservices-network
    volumes:
      - ./api-gateway/src:/app/src  # 핫 리로딩
      - ./api-gateway/logs:/app/logs

  # User Service
  user-service:
    build:
      context: ./user-service
      dockerfile: Dockerfile.dev
    ports:
      - "8081:8081"
    environment:
      - SPRING_PROFILES_ACTIVE=local
      - DATABASE_URL=jdbc:postgresql://user-db:5432/userdb
      - DATABASE_USERNAME=userservice
      - DATABASE_PASSWORD=userpass123
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      user-db:
        condition: service_healthy
      redis:
        condition: service_healthy
      kafka:
        condition: service_healthy
    networks:
      - microservices-network
      - user-network
    volumes:
      - ./user-service/src:/app/src
      - ./user-service/logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # User Database
  user-db:
    image: postgres:13-alpine
    environment:
      POSTGRES_DB: userdb
      POSTGRES_USER: userservice
      POSTGRES_PASSWORD: userpass123
    volumes:
      - user_db_data:/var/lib/postgresql/data
      - ./user-service/db/init:/docker-entrypoint-initdb.d/
    networks:
      - user-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U userservice -d userdb"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Product Service
  product-service:
    build:
      context: ./product-service
      dockerfile: Dockerfile.dev
    ports:
      - "8082:8082"
    environment:
      - NODE_ENV=development
      - MONGODB_URL=mongodb://product-db:27017/productdb
      - ELASTICSEARCH_URL=http://elasticsearch:9200
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      product-db:
        condition: service_healthy
      elasticsearch:
        condition: service_healthy
    networks:
      - microservices-network
      - product-network
    volumes:
      - ./product-service/src:/app/src
      - ./product-service/logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8082/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Product Database (MongoDB)
  product-db:
    image: mongo:4.4
    environment:
      MONGO_INITDB_DATABASE: productdb
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: rootpass123
    volumes:
      - product_db_data:/data/db
      - ./product-service/db/init:/docker-entrypoint-initdb.d/
    networks:
      - product-network
    healthcheck:
      test: ["CMD", "mongo", "--eval", "db.adminCommand('ping')"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Order Service
  order-service:
    build:
      context: ./order-service
      dockerfile: Dockerfile.dev
    ports:
      - "8083:8083"
    environment:
      - SPRING_PROFILES_ACTIVE=local
      - DATABASE_URL=jdbc:postgresql://order-db:5432/orderdb
      - DATABASE_USERNAME=orderservice
      - DATABASE_PASSWORD=orderpass123
      - USER_SERVICE_URL=http://user-service:8081
      - PRODUCT_SERVICE_URL=http://product-service:8082
      - INVENTORY_SERVICE_URL=http://inventory-service:8084
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      order-db:
        condition: service_healthy
    networks:
      - microservices-network
      - order-network
    volumes:
      - ./order-service/src:/app/src
      - ./order-service/logs:/app/logs

  # Order Database
  order-db:
    image: postgres:13-alpine
    environment:
      POSTGRES_DB: orderdb
      POSTGRES_USER: orderservice
      POSTGRES_PASSWORD: orderpass123
    volumes:
      - order_db_data:/var/lib/postgresql/data
      - ./order-service/db/init:/docker-entrypoint-initdb.d/
    networks:
      - order-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orderservice -d orderdb"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Inventory Service (Go)
  inventory-service:
    build:
      context: ./inventory-service
      dockerfile: Dockerfile.dev
    ports:
      - "8084:8084"
    environment:
      - ENV=development
      - DATABASE_URL=postgres://inventoryservice:inventorypass123@inventory-db:5432/inventorydb?sslmode=disable
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      inventory-db:
        condition: service_healthy
    networks:
      - microservices-network
      - inventory-network
    volumes:
      - ./inventory-service:/app  # Go 코드 핫 리로딩
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8084/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Inventory Database
  inventory-db:
    image: postgres:13-alpine
    environment:
      POSTGRES_DB: inventorydb
      POSTGRES_USER: inventoryservice
      POSTGRES_PASSWORD: inventorypass123
    volumes:
      - inventory_db_data:/var/lib/postgresql/data
      - ./inventory-service/db/init:/docker-entrypoint-initdb.d/
    networks:
      - inventory-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U inventoryservice -d inventorydb"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Redis (공유 캐시)
  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --requirepass redispass123
    volumes:
      - redis_data:/data
    networks:
      - microservices-network
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Elasticsearch (상품 검색)
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:7.15.2
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    networks:
      - product-network
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Apache Kafka (이벤트 스트리밍)
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    networks:
      - kafka-network

  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    volumes:
      - kafka_data:/var/lib/kafka/data
    networks:
      - microservices-network
      - kafka-network
    healthcheck:
      test: ["CMD", "kafka-topics", "--bootstrap-server", "localhost:9092", "--list"]
      interval: 30s
      timeout: 10s
      retries: 5

  # 개발 도구들
  # pgAdmin (PostgreSQL 관리)
  pgadmin:
    image: dpage/pgadmin4:latest
    environment:
      PGLADMIN_DEFAULT_EMAIL: admin@company.com
      PGLADMIN_DEFAULT_PASSWORD: admin123
    ports:
      - "5050:80"
    networks:
      - user-network
      - order-network
      - inventory-network

  # Kafka UI
  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    depends_on:
      - kafka
    ports:
      - "8090:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092
    networks:
      - kafka-network

volumes:
  user_db_data:
  product_db_data:
  order_db_data:
  inventory_db_data:
  redis_data:
  elasticsearch_data:
  kafka_data:

networks:
  microservices-network:
    driver: bridge
  user-network:
    driver: bridge
  product-network:
    driver: bridge
  order-network:
    driver: bridge
  inventory-network:
    driver: bridge
  kafka-network:
    driver: bridge
```

## 개발용 Dockerfile 설정

### Java Spring Boot 개발용 Dockerfile

```dockerfile
# user-service/Dockerfile.dev
FROM openjdk:11-jdk-slim

# 개발 도구 설치
RUN apt-get update && \
    apt-get install -y curl netcat-openbsd dnsutils procps && \
    apt-get clean

# 개발자 계정 생성
RUN groupadd -r dev && \
    useradd -r -g dev dev && \
    mkdir -p /app/logs && \
    chown -R dev:dev /app

WORKDIR /app

# Maven Wrapper 복사
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x ./mvnw

# 의존성 다운로드 (캐싱 최적화)
RUN ./mvnw dependency:go-offline -B

# 소스 코드 복사 (개발 중에는 볼륨 마운트로 덮어씀)
COPY src src

# 개발용 빌드 (테스트 포함)
RUN ./mvnw compile -B

USER dev

# 개발 모드 실행 (핫 리로딩 지원)
CMD ["./mvnw", "spring-boot:run", "-Dspring-boot.run.profiles=local"]

EXPOSE 8081

# 개발 환경용 라벨
LABEL environment="development" \
      hot-reload="enabled"
```

### Node.js 개발용 Dockerfile

```dockerfile
# product-service/Dockerfile.dev
FROM node:16-alpine

# 개발 도구 설치
RUN apk add --no-cache curl bash git

# 개발자 계정
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# Package files 복사
COPY package*.json yarn.lock ./

# 개발 의존성 포함 설치
RUN yarn install --frozen-lockfile

# 소스 코드 복사 (볼륨 마운트로 덮어씀)
COPY --chown=nextjs:nodejs . .

USER nextjs

# 개발 서버 실행 (핫 리로딩)
CMD ["yarn", "dev"]

EXPOSE 8082

# 개발 환경용 라벨
LABEL environment="development" \
      hot-reload="enabled"
```

### Go 개발용 Dockerfile

```dockerfile
# inventory-service/Dockerfile.dev
FROM golang:1.19-alpine

# 개발 도구 설치
RUN apk add --no-cache git curl bash make

# Air 설치 (Go 핫 리로딩 도구)
RUN go install github.com/cosmtrek/air@latest

WORKDIR /app

# Go 모듈 파일 복사
COPY go.mod go.sum ./
RUN go mod download

# 소스 코드 복사 (볼륨 마운트로 덮어씀)
COPY . .

# Air 설정 파일
COPY .air.toml .

# 개발 서버 실행 (핫 리로딩)
CMD ["air", "-c", ".air.toml"]

EXPOSE 8084

LABEL environment="development" \
      hot-reload="enabled"
```

## 개발 환경 관리 스크립트

### 환경 제어 스크립트

```bash
#!/bin/bash
# scripts/dev-environment.sh

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 환경 시작
start_env() {
    log_info "마이크로서비스 개발 환경 시작 중..."
    
    # 기존 컨테이너 정리
    docker-compose down --remove-orphans
    
    # 볼륨 정리 (선택적)
    if [[ "$1" == "--clean" ]]; then
        log_warning "모든 데이터 볼륨을 정리합니다..."
        docker-compose down -v
        docker system prune -f
    fi
    
    # 서비스별 단계적 시작
    log_info "인프라 서비스 시작 중..."
    docker-compose up -d zookeeper kafka redis elasticsearch
    
    log_info "데이터베이스 서비스 시작 중..."
    docker-compose up -d user-db product-db order-db inventory-db
    
    # 헬스체크 대기
    log_info "데이터베이스 준비 대기 중..."
    wait_for_service "user-db" "5432"
    wait_for_service "product-db" "27017"
    wait_for_service "order-db" "5432"
    wait_for_service "inventory-db" "5432"
    
    log_info "백엔드 서비스 시작 중..."
    docker-compose up -d user-service product-service order-service inventory-service
    
    log_info "API Gateway 시작 중..."
    docker-compose up -d api-gateway
    
    log_info "관리 도구 시작 중..."
    docker-compose up -d pgadmin kafka-ui
    
    log_success "모든 서비스가 시작되었습니다!"
    show_services_status
}

# 서비스 상태 확인
wait_for_service() {
    local service=$1
    local port=$2
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose exec $service nc -z localhost $port >/dev/null 2>&1; then
            log_success "$service 준비 완료"
            return 0
        fi
        
        log_info "$service 대기 중... ($attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    log_error "$service 시작 실패"
    return 1
}

# 서비스 상태 출력
show_services_status() {
    echo "\n=== 서비스 상태 ==="
    docker-compose ps
    
    echo "\n=== 접근 URL ==="
    echo "• API Gateway: http://localhost:8080"
    echo "• User Service: http://localhost:8081"
    echo "• Product Service: http://localhost:8082"
    echo "• Order Service: http://localhost:8083"
    echo "• Inventory Service: http://localhost:8084"
    echo "• pgAdmin: http://localhost:5050"
    echo "• Kafka UI: http://localhost:8090"
    echo "• Elasticsearch: http://localhost:9200"
}

# 로그 확인
show_logs() {
    local service=${1:-""}
    
    if [[ -z $service ]]; then
        log_info "전체 서비스 로그 출력"
        docker-compose logs -f --tail=100
    else
        log_info "$service 로그 출력"
        docker-compose logs -f --tail=100 $service
    fi
}

# 환경 정리
clean_env() {
    log_warning "개발 환경 정리 중..."
    
    docker-compose down --remove-orphans
    docker-compose down -v  # 볼륨 제거
    
    # 미사용 이미지와 컨테이너 정리
    docker system prune -f
    
    log_success "환경 정리 완료"
}

# 특정 서비스 재시작
restart_service() {
    local service=$1
    
    if [[ -z $service ]]; then
        log_error "서비스명을 지정해주세요"
        return 1
    fi
    
    log_info "$service 재시작 중..."
    docker-compose restart $service
    
    log_success "$service 재시작 완료"
}

# 데이터베이스 초기화
reset_database() {
    local db_service=${1:-"all"}
    
    if [[ $db_service == "all" ]]; then
        log_warning "모든 데이터베이스 초기화 중..."
        docker-compose stop user-db product-db order-db inventory-db
        docker volume rm $(docker volume ls -q | grep -E '(user_db|product_db|order_db|inventory_db)')
        docker-compose up -d user-db product-db order-db inventory-db
    else
        log_warning "$db_service 데이터베이스 초기화 중..."
        docker-compose stop $db_service
        docker volume rm "$(docker-compose ps -q $db_service)_data" 2>/dev/null || true
        docker-compose up -d $db_service
    fi
    
    log_success "데이터베이스 초기화 완료"
}

# 사용법 출력
show_usage() {
    echo "마이크로서비스 개발 환경 관리 스크립트"
    echo ""
    echo "사용법: $0 [명령어] [옵션]"
    echo ""
    echo "명령어:"
    echo "  start [--clean]    개발 환경 시작 (--clean: 데이터 초기화)"
    echo "  stop               개발 환경 정지"
    echo "  status             서비스 상태 확인"
    echo "  logs [서비스명]    로그 확인 (서비스명 생략 시 전체 로그)"
    echo "  restart 서비스명   특정 서비스 재시작"
    echo "  clean              환경 완전 정리"
    echo "  reset-db [db명]    데이터베이스 초기화 (db명 생략 시 전체)"
    echo "  help               도움말 출력"
    echo ""
    echo "예시:"
    echo "  $0 start --clean              # 깨끗한 상태로 환경 시작"
    echo "  $0 logs user-service          # User Service 로그 확인"
    echo "  $0 restart api-gateway        # API Gateway 재시작"
    echo "  $0 reset-db user-db           # User Database만 초기화"
}

# 메인 명령어 처리
case "$1" in
    start)
        start_env $2
        ;;
    stop)
        docker-compose down
        log_success "개발 환경 정지 완료"
        ;;
    status)
        show_services_status
        ;;
    logs)
        show_logs $2
        ;;
    restart)
        restart_service $2
        ;;
    clean)
        clean_env
        ;;
    reset-db)
        reset_database $2
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        log_error "알 수 없는 명령어: $1"
        echo ""
        show_usage
        exit 1
        ;;
esac
```

## 개발 환경 최적화 팁

### 1. 볼륨 마운트 최적화

#### 소스 코드 핫 리로딩

```yaml
# 개발 중인 서비스만 소스 코드 마운트
volumes:
  - ./user-service/src:/app/src:cached  # macOS 최적화
  - ./user-service/logs:/app/logs:delegated
```

#### 의존성 캐싱

```yaml
# Node.js 의존성 캐싱 볼륨
volumes:
  - node_modules:/app/node_modules  # 별도 볼륨으로 캐싱
  - ./product-service/src:/app/src:cached
```

### 2. 리소스 제한 설정

```yaml
# 개발 환경에서 리소스 사용량 제한
services:
  user-service:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
        reservations:
          memory: 512M
          cpus: '0.25'
```

### 3. 환경별 설정 분리

```yaml
# docker-compose.override.yml - 로컬 개발자별 설정
version: '3.8'

services:
  user-service:
    environment:
      - DEBUG_MODE=true
      - LOG_LEVEL=debug
    volumes:
      - ./user-service/debug:/app/debug  # 개발자별 디버그 설정
```

## 핵심 요점

### 1. 통합 개발 환경 구성

여러 마이크로서비스와 인프라 컴포넌트를 하나의 Docker Compose로 통합 관리하여 로컬에서 전체 시스템 테스트 가능

### 2. 개발 효율성 향상

핫 리로딩, 볼륨 마운트, 단계적 서비스 시작을 통해 개발과 디버깅 효율성 극대화

### 3. 프로덕션 환경 유사성

실제 프로덕션과 유사한 네트워크 구성과 서비스 간 통신 방식으로 환경 차이로 인한 문제 최소화

---

**이전**: [Docker 컨테이너화 전략](01d1-docker-containerization.md)  
**다음**: [Kubernetes 프로덕션 배포](01d3-kubernetes-production-deployment.md)에서 본격적인 오케스트레이션을 학습합니다.
