---
tags:
  - Docker
  - Dockerfile
  - Multi-stage-build
  - fundamentals
  - hands-on
  - medium-read
  - 이미지최적화
  - 인프라스트럭처
  - 컨테이너
difficulty: FUNDAMENTALS
learning_time: "3-5시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 16.1D1 Docker 컨테이너화 기초

## 🐳 마이크로서비스 Docker 패키징 전략

컨테이너 기술은 마이크로서비스 아키텍처의 핵심 구성 요소입니다. 효율적인 Docker 이미지 빌드와 최적화 기법을 통해 배포 가능하고 확장 가능한 마이크로서비스를 구축할 수 있습니다.

## Multi-stage Build를 활용한 최적화된 Dockerfile

### Java Spring Boot 마이크로서비스 최적화

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

## Docker 이미지 최적화 핵심 전략

### 1. 레이어 캐싱 최적화

**의존성 파일 우선 복사**:

- `pom.xml`, `package.json` 등 의존성 정의 파일을 먼저 복사
- 소스 코드 변경 시에도 의존성 레이어는 재사용 가능
- 빌드 시간 대폭 단축

**Layered JAR 활용**:

- Spring Boot 2.3+ 의 Layered JAR 기능 사용
- 의존성, 애플리케이션 코드를 별도 레이어로 분리
- 애플리케이션 코드 변경 시 의존성 레이어 재활용

### 2. 보안 강화

**비루트 사용자 실행**:

```dockerfile
# 전용 사용자 계정 생성
RUN groupadd -r appuser && \
    useradd -r -g appuser appuser

# 파일 권한 설정
RUN chown -R appuser:appuser /app

# 비루트 사용자로 전환
USER appuser
```

**최소 권한 원칙**:

- 애플리케이션 실행에 필요한 최소한의 패키지만 설치
- 불필요한 도구와 라이브러리 제거
- 읽기 전용 파일 시스템 활용

### 3. 이미지 크기 최소화

**Multi-stage Build 패턴**:

```dockerfile
# 빌드 스테이지 - 개발 도구 포함
FROM openjdk:11-jdk-slim AS builder
# ... 빌드 과정 ...

# 런타임 스테이지 - 실행 환경만
FROM openjdk:11-jre-slim
# 빌드 결과물만 복사
COPY --from=builder /app/build /app/
```

**경량 Base 이미지**:

- `alpine` 계열 이미지 사용 (보안 업데이트 고려)
- `distroless` 이미지 고려 (Google)
- `scratch` 이미지 (Go 정적 빌드용)

## 핵심 요점

### 1. Multi-stage Build 활용

Build와 Runtime 환경을 분리하여 이미지 크기 최소화 및 보안 강화

### 2. 레이어 캐싱 최적화

의존성 파일 우선 복사와 Layered JAR를 통한 빌드 시간 단축

### 3. 보안 모범 사례

비루트 사용자 실행, 최소 권한 원칙, 취약점 스캔 통합

---

**이전**: [컨테이너화와 오케스트레이션 개요](chapter-15-microservices-architecture/15-19-containerization-orchestration.md)  
**다음**: [언어별 Dockerfile 최적화 전략](chapter-15-microservices-architecture/01d2-dockerfile-strategies.md)에서 Node.js와 Go 최적화 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: FUNDAMENTALS
- **주제**: 인프라스트럭처
- **예상 시간**: 3-5시간

### 🎯 학습 경로

- [📚 FUNDAMENTALS 레벨 전체 보기](../learning-paths/fundamentals/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-16-system-design-patterns)

- [15.1 마이크로서비스 아키텍처 개요](./15-01-microservices-architecture.md)
- [15.1A 모놀리스 문제점과 전환 전략](./15-10-monolith-to-microservices.md)
- [16.1B 마이크로서비스 설계 원칙과 패턴 개요](../chapter-16-distributed-system-patterns/15-11-design-principles.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](../chapter-16-distributed-system-patterns/15-12-1-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](../chapter-16-distributed-system-patterns/15-13-1-single-responsibility.md)

### 🏷️ 관련 키워드

`Docker`, `컨테이너`, `Dockerfile`, `Multi-stage-build`, `이미지최적화`

### ⏭️ 다음 단계 가이드

- 기초 개념을 충분히 이해한 후 INTERMEDIATE 레벨로 진행하세요
- 실습 위주의 학습을 권장합니다
