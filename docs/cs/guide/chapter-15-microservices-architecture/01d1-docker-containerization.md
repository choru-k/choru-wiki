---
tags:
  - containerization
  - deep-study
  - deployment
  - devops
  - docker
  - dockerfile
  - hands-on
  - intermediate
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "6-8시간"
main_topic: "인프라스트럭처"
priority_score: 5
---

# 16.1D1 Docker를 활용한 마이크로서비스 패키징

## 🐳 컨테이너화 전략 개요

Docker를 통한 마이크로서비스 패키징은 일관된 배포 환경과 격리된 실행 환경을 제공합니다. Multi-stage build 패턴을 활용하여 이미지 크기를 최소화하고 보안을 강화하는 실전 기법들을 소개합니다.

## 1. Multi-stage Build를 활용한 최적화된 Dockerfile

### Java Spring Boot 서비스 컨테이너화

```dockerfile
# User Service의 최적화된 Dockerfile (Java Spring Boot)
# Build stage - 빌드 환경과 런타임 환경 분리
FROM openjdk:11-jdk-slim AS builder

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 파일들 먼저 복사 (Docker 레이어 캐싱 최적화)
COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN chmod +x ./mvnw

# 의존성 다운로드 (소스 코드 변경 시에도 이 레이어는 캐시됨)
RUN ./mvnw dependency:go-offline -B

# 소스 코드 복사 및 빌드
COPY src src
RUN ./mvnw package -DskipTests -B

# 빌드 산출물 압축 해제 (Spring Boot Layered JAR 활용)
RUN mkdir -p target/dependency && \
    cd target/dependency && \
    java -Djarmode=layertools -jar ../user-service-*.jar extract

# Runtime stage - 최소한의 런타임 환경
FROM openjdk:11-jre-slim

# 필수 유틸리티 설치 (헬스체크, 디버깅용)
RUN apt-get update && \
    apt-get install -y curl netcat-openbsd dnsutils && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 비루트 사용자 생성 (보안 강화)
RUN groupadd -r appuser && \
    useradd -r -g appuser appuser && \
    mkdir -p /app/logs && \
    chown -R appuser:appuser /app

WORKDIR /app

# APM 에이전트 추가 (성능 모니터링)
ADD --chown=appuser:appuser https://github.com/elastic/apm-agent-java/releases/download/v1.32.0/elastic-apm-agent-1.32.0.jar /app/elastic-apm-agent.jar

# Spring Boot Layered JAR 복사 (효율적인 레이어 캐싱)
COPY --from=builder --chown=appuser:appuser /app/target/dependency/dependencies/ ./
COPY --from=builder --chown=appuser:appuser /app/target/dependency/spring-boot-loader/ ./
COPY --from=builder --chown=appuser:appuser /app/target/dependency/snapshot-dependencies/ ./
COPY --from=builder --chown=appuser:appuser /app/target/dependency/application/ ./

# 애플리케이션 설정 파일 복사
COPY --chown=appuser:appuser config/ ./config/

# 비루트 사용자로 전환
USER appuser

# 헬스 체크 설정
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/actuator/health/liveness || exit 1

# 환경 변수 기본값 설정
ENV JAVA_OPTS="-Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxGCPauseMillis=200" \
    SPRING_PROFILES_ACTIVE="production" \
    ELASTIC_APM_SERVICE_NAME="user-service" \
    ELASTIC_APM_ENVIRONMENT="production" \
    ELASTIC_APM_APPLICATION_PACKAGES="com.ecommerce.user" \
    ELASTIC_APM_SPAN_FRAMES_MIN_DURATION="5ms" \
    ELASTIC_APM_CAPTURE_BODY="all"

# JVM과 애플리케이션 실행
ENTRYPOINT exec java $JAVA_OPTS \
    -Djava.security.egd=file:/dev/./urandom \
    -Dspring.profiles.active=$SPRING_PROFILES_ACTIVE \
    -javaagent:./elastic-apm-agent.jar \
    org.springframework.boot.loader.JarLauncher

EXPOSE 8080

# 메타데이터 라벨
LABEL maintainer="user-service-team@company.com" \
      version="1.2.0" \
      description="User Management Microservice" \
      org.opencontainers.image.source="https://github.com/company/user-service" \
      org.opencontainers.image.vendor="Company" \
      org.opencontainers.image.licenses="MIT"
```

### Node.js 마이크로서비스 Dockerfile 최적화

```dockerfile
# Payment Service의 Node.js Dockerfile
# Build stage
FROM node:16-alpine AS builder

WORKDIR /app

# Package files 복사 (의존성 캐싱 최적화)
COPY package*.json ./
COPY yarn.lock ./

# 의존성 설치 (프로덕션 의존성만)
RUN yarn install --frozen-lockfile --production=false && \
    yarn cache clean

# 소스 코드 복사 및 빌드
COPY . .
RUN yarn build && \
    yarn install --frozen-lockfile --production --ignore-scripts --prefer-offline

# Runtime stage
FROM node:16-alpine

# 보안 업데이트 및 필수 패키지 설치
RUN apk update && \
    apk add --no-cache dumb-init curl && \
    apk upgrade && \
    rm -rf /var/cache/apk/*

# 비루트 사용자 생성
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# 빌드 산출물 복사
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# 비루트 사용자로 전환
USER nextjs

# 헬스 체크
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 환경 변수
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512" \
    PORT=3000

EXPOSE 3000

# dumb-init으로 PID 1 문제 해결
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]

LABEL maintainer="payment-service-team@company.com" \
      version="2.1.0" \
      description="Payment Processing Microservice"
```

### Go 마이크로서비스 최적화 Dockerfile

```dockerfile
# Inventory Service의 Go Dockerfile (멀티 스테이지 빌드)
# Build stage
FROM golang:1.19-alpine AS builder

# 필수 빌드 도구 설치
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Go 모듈 파일 복사 및 의존성 다운로드
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# 소스 코드 복사
COPY . .

# 정적 링크 바이너리 빌드 (CGO 비활성화)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o inventory-service ./cmd/server

# Runtime stage - scratch 이미지 사용 (최소 크기)
FROM scratch

# 시간대 데이터와 CA 인증서 복사
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# 비루트 사용자 생성 (scratch에서는 직접 파일 생성)
COPY --from=builder /etc/passwd /etc/passwd
COPY --from=builder /etc/group /etc/group

# 애플리케이션 바이너리 복사
COPY --from=builder /app/inventory-service /inventory-service

# 설정 파일 복사
COPY --from=builder /app/config /config

# 비루트 사용자로 실행
USER 1001:1001

EXPOSE 8080

# 바이너리 직접 실행
ENTRYPOINT ["/inventory-service"]

LABEL maintainer="inventory-service-team@company.com" \
      version="1.0.0" \
      description="Inventory Management Microservice" \
      base.image="scratch"
```

## 2. 컨테이너 최적화 베스트 프랙티스

### 이미지 크기 최적화

#### 1. 적절한 Base 이미지 선택

- **Alpine Linux**: 최소 크기, 보안 패치 빠름
- **Distroless**: Google의 최소 이미지, 디버깅 도구 없음
- **Scratch**: 정적 바이너리용 최소 이미지

#### 2. 레이어 캐싱 전략

```dockerfile
# 좋은 예: 자주 변경되지 않는 의존성을 먼저 복사
COPY package*.json ./
RUN npm install

# 소스 코드는 마지막에 복사 (변경 빈도 높음)
COPY . .
```

#### 3. 불필요한 파일 제거

```dockerfile
# 임시 파일과 패키지 매니저 캐시 정리
RUN apt-get update && \
    apt-get install -y required-package && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
```

### 보안 강화 방법

#### 1. 비루트 사용자 실행

```dockerfile
# 전용 사용자 생성 및 권한 설정
RUN groupadd -r appuser && \
    useradd -r -g appuser appuser && \
    mkdir -p /app && \
    chown -R appuser:appuser /app

USER appuser
```

#### 2. 읽기 전용 파일시스템

```dockerfile
# SecurityContext에서 readOnlyRootFilesystem: true 설정
# 필요한 디렉토리만 쓰기 가능하게 마운트
volumeMounts:
- name: tmp-volume
  mountPath: /tmp
- name: logs-volume
  mountPath: /app/logs
```

#### 3. 불필요한 권한 제거

```dockerfile
# 모든 권한 제거 후 필요한 것만 추가
securityContext:
  capabilities:
    drop:
    - ALL
    add:
    - NET_BIND_SERVICE  # 80/443 포트 바인딩 필요 시에만
```

## 핵심 요점

### 1. Multi-stage Build 활용

빌드 환경과 런타임 환경을 분리하여 이미지 크기 최소화와 보안 강화를 동시에 달성

### 2. 레이어 캐싱 최적화

의존성과 소스 코드의 변경 빈도를 고려한 Dockerfile 구성으로 빌드 시간 단축

### 3. 보안 우선 설계

비루트 사용자 실행, 최소 권한 원칙, 읽기 전용 파일시스템을 통한 보안 강화

---

**다음**: [Docker Compose 로컬 개발 환경](./01d2-docker-compose-environment.md)에서 통합 개발 환경 구성을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 6-8시간

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

`docker`, `containerization`, `dockerfile`, `devops`, `deployment`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
