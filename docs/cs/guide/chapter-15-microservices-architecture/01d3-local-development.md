---
tags:
  - DevOps
  - Docker Compose
  - hands-on
  - intermediate
  - medium-read
  - 로컬 개발
  - 마이크로서비스
  - 인프라스트럭처
  - 핫 리로딩
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 16.1D3 로컬 개발 환경 구성

## 🛠️ Docker Compose를 통한 마이크로서비스 개발 환경

마이크로서비스 개발에서는 복수의 서비스와 데이터베이스, 캐시, 메시징 시스템을 동시에 실행해야 합니다. Docker Compose를 활용하면 단일 명령어로 전체 시스템을 구동할 수 있습니다.

## 완전한 Docker Compose 개발 환경 설정

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
    image: dpage/pgladmin4:latest
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@company.com
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

## 개발 환경 최적화 전략

### 1. 핫 리로딩 (Hot Reloading) 설정

**Spring Boot 개발용 Dockerfile**:

```dockerfile
# Dockerfile.dev - 개발 환경용
FROM openjdk:11-jdk-slim

# Spring Boot DevTools 지원
RUN apt-get update && apt-get install -y curl

WORKDIR /app

# 의존성 다운로드
COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN chmod +x ./mvnw && ./mvnw dependency:go-offline

# 소스 코드는 볼륨 마운트로 공유
COPY src src

# DevTools 활성화를 위한 환경 설정
ENV SPRING_DEVTOOLS_RESTART_ENABLED=true \
    SPRING_DEVTOOLS_LIVERELOAD_ENABLED=true

# 개발 모드 실행
CMD ["./mvnw", "spring-boot:run"]
```

**Node.js 개발용 Dockerfile**:

```dockerfile
# Dockerfile.dev - Node.js 개발 환경
FROM node:16-alpine

WORKDIR /app

# nodemon 전역 설치
RUN npm install -g nodemon

# 의존성 설치
COPY package*.json ./
RUN npm install

# 소스 코드는 볼륨 마운트로 공유
COPY . .

# nodemon으로 핫 리로딩 활성화
CMD ["nodemon", "--legacy-watch", "src/server.js"]
```

### 2. 네트워크 분리 전략

**마이크로서비스 간 통신**:

```yaml
networks:
  # 모든 서비스가 공유하는 네트워크
  microservices-network:
    driver: bridge
    
  # 각 서비스 전용 데이터베이스 네트워크
  user-network:
    driver: bridge
    internal: true  # 외부 접근 차단
```

**서비스 디스커버리**:

```yaml
# 환경 변수를 통한 서비스 엔드포인트 설정
environment:
  - USER_SERVICE_URL=http://user-service:8081
  - PRODUCT_SERVICE_URL=http://product-service:8082
  - ORDER_SERVICE_URL=http://order-service:8083
```

### 3. 데이터 지속성 및 초기화

**볼륨 마운트**:

```yaml
volumes:
  # 데이터베이스 데이터 지속성
  user_db_data:
  product_db_data:
  
# 초기화 스크립트 마운트
volumes:
  - ./user-service/db/init:/docker-entrypoint-initdb.d/
```

**데이터베이스 초기화 스크립트 예시**:

```sql
-- user-service/db/init/01-init.sql
CREATE DATABASE IF NOT EXISTS userdb;
CREATE USER IF NOT EXISTS 'userservice'@'%' IDENTIFIED BY 'userpass123';
GRANT ALL PRIVILEGES ON userdb.* TO 'userservice'@'%';

-- 테이블 생성
USE userdb;
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 테스트 데이터 삽입
INSERT INTO users (username, email) VALUES 
('testuser1', 'test1@example.com'),
('testuser2', 'test2@example.com');
```

## 개발 도구 통합

### 1. 데이터베이스 관리 도구

**pgAdmin 설정**:

```yaml
pgadmin:
  image: dpage/pgadmin4:latest
  environment:
    PGADMIN_DEFAULT_EMAIL: admin@company.com
    PGLADMIN_DEFAULT_PASSWORD: admin123
  ports:
    - "5050:80"
  networks:
    - user-network
    - order-network
```

**MongoDB Compass 대안**:

```yaml
mongo-express:
  image: mongo-express:latest
  environment:
    ME_CONFIG_MONGODB_SERVER: product-db
    ME_CONFIG_MONGODB_PORT: 27017
    ME_CONFIG_BASICAUTH_USERNAME: admin
    ME_CONFIG_BASICAUTH_PASSWORD: admin123
  ports:
    - "8081:8081"
  networks:
    - product-network
```

### 2. 메시징 시스템 모니터링

**Kafka UI 설정**:

```yaml
kafka-ui:
  image: provectuslabs/kafka-ui:latest
  environment:
    KAFKA_CLUSTERS_0_NAME: local
    KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092
    KAFKA_CLUSTERS_0_ZOOKEEPER: zookeeper:2181
  ports:
    - "8090:8080"
```

### 3. 로깅 및 모니터링

**로그 중앙 집중화**:

```yaml
# ELK Stack 추가
elasticsearch-log:
  image: docker.elastic.co/elasticsearch/elasticsearch:7.15.2
  environment:
    - discovery.type=single-node
    - "ES_JAVA_OPTS=-Xms256m -Xmx256m"
    
logstash:
  image: docker.elastic.co/logstash/logstash:7.15.2
  volumes:
    - ./logstash/pipeline:/usr/share/logstash/pipeline
    
kibana:
  image: docker.elastic.co/kibana/kibana:7.15.2
  ports:
    - "5601:5601"
  environment:
    ELASTICSEARCH_HOSTS: http://elasticsearch-log:9200
```

## 개발 효율성 향상 팁

### 1. 빠른 시작을 위한 Makefile

```makefile
# Makefile - 개발 명령어 단축
.PHONY: up down clean logs build test

# 전체 시스템 시작
up:
 docker-compose up -d
 @echo "🚀 Development environment is starting..."
 @echo "API Gateway: http://localhost:8080"
 @echo "pgAdmin: http://localhost:5050"
 @echo "Kafka UI: http://localhost:8090"

# 전체 시스템 종료
down:
 docker-compose down

# 데이터 완전 삭제
clean:
 docker-compose down -v --remove-orphans
 docker system prune -f

# 로그 보기
logs:
 docker-compose logs -f

# 특정 서비스 로그
logs-user:
 docker-compose logs -f user-service

# 다시 빌드
build:
 docker-compose build --no-cache

# 테스트 실행
test:
 docker-compose exec user-service ./mvnw test
 docker-compose exec product-service npm test
 docker-compose exec inventory-service go test ./...

# 데이터베이스 스키마 마이그레이션
migrate:
 docker-compose exec user-service ./mvnw flyway:migrate
 docker-compose exec order-service ./mvnw flyway:migrate
```

### 2. 헬스 체크 및 의존성 관리

```yaml
# 헬스 체크로 안정적인 시작 보장
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s

# 의존성 대기
depends_on:
  user-db:
    condition: service_healthy
  redis:
    condition: service_healthy
```

## 핵심 요점

### 1. 핫 리로딩 훈에버 환경

벼륨 마운트와 개발 도구로 코드 변경 즉시 반영

### 2. 네트워크 분리로 보안 강화

마이크로서비스와 데이터베이스 간 네트워크 분리로 보안 강화

### 3. 개발 도구 통합

데이터베이스 관리, 메시징 모니터링, 로깅 도구와 통합된 개발 환경

---

**이전**: [언어별 Dockerfile 최적화 전략](./01d2-dockerfile-strategies.md)  
**다음**: [Kubernetes 프로덕션 배포](chapter-15-microservices-architecture/16-52-4-kubernetes-production.md)에서 실제 프로덕션 환경 배포 방법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-16-system-design-patterns)

- [15.1 마이크로서비스 아키텍처 개요](./16-01-microservices-architecture.md)
- [15.1A 모놀리스 문제점과 전환 전략](./16-10-monolith-to-microservices.md)
- [16.1B 마이크로서비스 설계 원칙과 패턴 개요](../chapter-15-microservices-architecture/16-11-design-principles.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](../chapter-15-microservices-architecture/16-12-1-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](../chapter-15-microservices-architecture/16-13-1-single-responsibility.md)

### 🏷️ 관련 키워드

`Docker Compose`, `마이크로서비스`, `로컬 개발`, `DevOps`, `핫 리로딩`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
