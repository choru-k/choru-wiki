---
tags:
  - Docker
  - Container
  - DevOps
  - Security
  - Performance
  - Multi-stage
  - Best-Practices
---

# Dockerfile Best Practices: Production-Ready 컨테이너 이미지 구축 완벽 가이드

## 들어가며

"Dockerfile 작성은 쉽다"고 생각하다가 production에서 고통받은 경험이 있나요? **1GB 넘는 이미지 크기**, **보안 취약점 가득한 base image**, **빌드 시간 30분**과 같은 문제들 말입니다. 

Production-grade 컨테이너 이미지를 구축하려면 단순히 동작하는 것을 넘어서 보안, 성능, 유지보수성을 모두 고려해야 합니다. 실제 DevOps 팀에서 사용하는 enterprise-level Dockerfile 작성 노하우를 완전히 공개합니다.

## 핵심 원칙과 실전 전략

### 1. Multi-Stage Build: 이미지 크기 혁단적 개선

**문제**: 모든 빌드 도구와 의존성이 최종 이미지에 포함되어 비효율적

**해결**: Build stage와 runtime stage 분리

```dockerfile
# syntax=docker/dockerfile:1.4
# ===== BUILD STAGE =====
FROM golang:1.20-alpine AS builder

# 보안 강화: non-root user 생성
RUN adduser -D -s /bin/sh builder
USER builder

WORKDIR /app

# 의존성 캐시 최적화를 위한 레이어 분리
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# 최적화된 빌드
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s -X main.version=${VERSION}" \
    -a -installsuffix cgo \
    -o app .

# ===== RUNTIME STAGE =====
FROM scratch AS runtime

# CA certificates 추가 (HTTPS 통신용)
COPY --from=alpine:latest /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# timezone 정보 복사
COPY --from=alpine:latest /usr/share/zoneinfo /usr/share/zoneinfo

# 실행 파일만 복사
COPY --from=builder /app/app /app

# metadata 추가
LABEL maintainer="devops@company.com" \
      version="${VERSION}" \
      description="Production web service"

EXPOSE 8080
ENTRYPOINT ["/app"]
```

**효과:**
- 이미지 크기: 500MB → 15MB (97% 감소)
- 공격 표면 최소화 (scratch base)
- 빌드 도구 유출 방지

### 2. Advanced Multi-Stage with Dependency Optimization

복잡한 Python 애플리케이션의 최적화된 Dockerfile:

```dockerfile
# syntax=docker/dockerfile:1.4
ARG PYTHON_VERSION=3.11-slim
ARG ALPINE_VERSION=3.18

# ===== DEPENDENCY BUILDER =====
FROM python:${PYTHON_VERSION} AS deps-builder

# 시스템 의존성 최소화 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# pip 최적화
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_COMPILE_QUIET=2

WORKDIR /wheels

# requirements를 레이어별로 분리하여 캐시 최적화
COPY requirements/base.txt requirements/production.txt ./
RUN pip wheel --no-deps --wheel-dir . -r production.txt

# ===== APPLICATION BUILDER =====
FROM python:${PYTHON_VERSION} AS app-builder

# 보안: non-root 유저 생성
RUN groupadd -r appuser && useradd -r -g appuser appuser

# 미리 빌드된 wheels 사용
COPY --from=deps-builder /wheels /wheels
RUN pip install --no-index --find-links /wheels -r /wheels/production.txt

COPY . /app
WORKDIR /app

# 정적 자산 빌드 (Django 예시)
RUN python manage.py collectstatic --noinput

# ===== RUNTIME STAGE =====
FROM python:${PYTHON_VERSION} AS runtime

# 보안 강화
RUN groupadd -r -g 1000 appuser && \
    useradd -r -u 1000 -g appuser appuser && \
    mkdir -p /app && \
    chown appuser:appuser /app

# 런타임 의존성만 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get purge -y --auto-remove

# Python 설치된 패키지 복사
COPY --from=app-builder --chown=appuser:appuser /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=app-builder --chown=appuser:appuser /usr/local/bin /usr/local/bin

# 애플리케이션 코드 복사
COPY --from=app-builder --chown=appuser:appuser /app /app

WORKDIR /app
USER appuser

# Health check 설정
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python manage.py check --deploy || exit 1

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", "myapp.wsgi:application"]
```

### 3. Enterprise Python Application with Security Hardening

실제 production에서 사용하는 고도화된 Python Dockerfile:

```dockerfile
# syntax=docker/dockerfile:1.4
ARG PYTHON_VERSION=3.11.7
ARG ALPINE_VERSION=3.18
ARG IMAGEMAGICK_VERSION=7.0.10-6
ARG LIBRDKAFKA_VERSION=1.9.0

# ===== SECURITY BASE =====
FROM python:${PYTHON_VERSION}-slim AS security-base

# 보안 업데이트 먼저 적용
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        && rm -rf /var/lib/apt/lists/*

# 보안: 시스템 사용자 생성
RUN groupadd -r -g 1000 appgroup && \
    useradd -r -u 1000 -g appgroup -m -d /home/appuser -s /bin/bash appuser

# ===== BUILD DEPENDENCIES =====
FROM security-base AS build-deps

# 빌드 타임 의존성
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    curl \
    git \
    gnupg \
    pkg-config \
    # ImageMagick 의존성
    libde265-dev \
    libheif-dev \
    libmagickcore-dev \
    # Database 의존성
    libmysqlclient-dev \
    libpq-dev \
    libsqlite3-dev \
    # SSL/TLS
    libssl-dev \
    # 압축
    libbz2-dev \
    # XML/XSLT
    libxml2-dev \
    libxslt1-dev \
    # 기타
    libffi-dev \
    libre2-dev \
    && rm -rf /var/lib/apt/lists/*

# ===== IMAGEMAGICK BUILDER =====
FROM build-deps AS imagemagick-builder

WORKDIR /usr/src

# ImageMagick 소스 빌드 (보안상 최신 버전 사용)
RUN curl -LO https://github.com/ImageMagick/ImageMagick/archive/refs/tags/${IMAGEMAGICK_VERSION}.tar.gz && \
    tar xf ${IMAGEMAGICK_VERSION}.tar.gz && \
    cd ImageMagick-${IMAGEMAGICK_VERSION} && \
    ./configure --with-heic=yes --with-security-policy=open && \
    make -j$(nproc) && \
    make install && \
    ldconfig && \
    rm -rf /usr/src/${IMAGEMAGICK_VERSION}.tar.gz

# ===== KAFKA LIBRARY BUILDER =====
FROM build-deps AS kafka-builder

WORKDIR /usr/src

RUN curl -LO https://github.com/edenhill/librdkafka/archive/v${LIBRDKAFKA_VERSION}.tar.gz && \
    tar -xzf v${LIBRDKAFKA_VERSION}.tar.gz && \
    cd librdkafka-${LIBRDKAFKA_VERSION} && \
    ./configure --install-deps --disable-lz4-ext && \
    make -j$(nproc) && \
    make install && \
    ldconfig

# ===== PYTHON DEPENDENCIES =====
FROM build-deps AS python-builder

# pip 최적화 설정
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_COMPILE_QUIET=2 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# ImageMagick 라이브러리 복사
COPY --from=imagemagick-builder /usr/local/lib /usr/local/lib
COPY --from=kafka-builder /usr/local/lib /usr/local/lib

ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

# Python 패키지 wheel 빌드
WORKDIR /wheels

COPY requirements.txt ./

# 컴파일 옵션 최적화
ENV CPPFLAGS="-I/usr/include/openssl" \
    LDFLAGS="-L/usr/lib/ssl" \
    UWSGI_PROFILE_OVERRIDE="ssl=true"

RUN pip install --upgrade pip setuptools wheel && \
    pip wheel --wheel-dir . -r requirements.txt

# ===== RUNTIME STAGE =====
FROM security-base AS runtime

# 런타임 라이브러리만 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    # ImageMagick 런타임
    libde265-0 \
    libheif1 \
    # Database clients
    libmysqlclient21 \
    libpq5 \
    libsqlite3-0 \
    # Compression
    libbz2-1.0 \
    # XML
    libxml2 \
    libxslt1.1 \
    # 기타 런타임
    libffi8 \
    libre2-9 \
    && rm -rf /var/lib/apt/lists/*

# 컴파일된 라이브러리 복사
COPY --from=imagemagick-builder /usr/local/lib /usr/local/lib
COPY --from=imagemagick-builder /usr/local/bin /usr/local/bin
COPY --from=kafka-builder /usr/local/lib /usr/local/lib

ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

# Python 패키지 설치
COPY --from=python-builder /wheels /wheels
COPY requirements.txt ./

RUN pip install --no-index --find-links /wheels -r requirements.txt && \
    rm -rf /wheels requirements.txt

# 보안: 파일 시스템 권한 강화
RUN mkdir -p /app/static /app/media /app/logs && \
    chown -R appuser:appgroup /app && \
    chmod -R 755 /app

# 애플리케이션 코드 복사
COPY --chown=appuser:appgroup . /app/

WORKDIR /app

# 보안: non-root 실행
USER appuser

# 환경 변수 설정
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=myapp.settings.production

# Health check with timeout
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health/ || exit 1

EXPOSE 8000

# 시그널 처리를 위한 exec form 사용
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", \
     "--worker-class", "sync", "--worker-connections", "1000", \
     "--max-requests", "10000", "--max-requests-jitter", "1000", \
     "--preload-app", "--access-logfile", "-", \
     "myapp.wsgi:application"]
```

## 보안 강화 전략

### 1. Distroless Images 활용

```dockerfile
FROM gcr.io/distroless/java17-debian11:latest

# 최소한의 런타임만 포함
# - libc
# - 애플리케이션 실행에 필요한 최소 라이브러리
# - 패키지 매니저, 쉘 없음

COPY app.jar /app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

**장점:**
- CVE 0개에 가까운 보안
- 이미지 크기 최소화
- 쉘 접근 불가로 공격 벡터 차단

### 2. Security Scanning Integration

```dockerfile
# syntax=docker/dockerfile:1.4

# 보안 스캔을 위한 metadata
LABEL org.opencontainers.image.source="https://github.com/company/myapp" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.created="${BUILD_DATE}"

# Trivy 보안 스캔 호환성
FROM alpine:3.18 AS security-scan

RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache \
    ca-certificates \
    && update-ca-certificates
```

```bash
# CI/CD 파이프라인에서 실행
trivy image --exit-code 1 --severity HIGH,CRITICAL myapp:latest

# 취약점 리포트 생성
trivy image --format json --output report.json myapp:latest
```

### 3. Supply Chain Security

```dockerfile
# syntax=docker/dockerfile:1.4

# 재현 가능한 빌드를 위한 정확한 버전 지정
ARG BASE_IMAGE_DIGEST=sha256:abc123...

FROM python:3.11-slim@${BASE_IMAGE_DIGEST} AS base

# SBOM (Software Bill of Materials) 생성을 위한 의존성 명시
COPY requirements.lock ./

# 보안: pip hash checking 활성화
RUN pip install --require-hashes -r requirements.lock
```

```bash
# 의존성 해시 생성
pip-compile --generate-hashes requirements.in

# SBOM 생성
syft packages dir:. -o spdx-json > sbom.spdx.json
```

## 성능 최적화 기법

### 1. BuildKit Advanced Features

```dockerfile
# syntax=docker/dockerfile:1.4

FROM alpine AS downloader

# 병렬 다운로드를 위한 cache mount
RUN --mount=type=cache,target=/var/cache/apk \
    apk add --update curl git

# 의존성 병렬 처리
FROM node:18-alpine AS npm-deps

WORKDIR /app

# cache mount로 npm cache 재사용
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci --only=production

# 병렬 빌드 최적화
FROM golang:1.20-alpine AS go-build

WORKDIR /app

# 모듈 다운로드 캐시
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=bind,source=go.mod,target=go.mod \
    --mount=type=bind,source=go.sum,target=go.sum \
    go mod download

# 빌드 캐시 활용
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=bind,source=.,target=. \
    CGO_ENABLED=0 go build -o /app/main .
```

### 2. Layer Optimization Strategy

```dockerfile
# 잘못된 예 - 레이어 최적화 없음
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y git
RUN rm -rf /var/lib/apt/lists/*  # 효과 없음!

# 올바른 예 - 레이어 최적화
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        git \
        && rm -rf /var/lib/apt/lists/* \
        && apt-get clean
```

### 3. Build Context 최적화

`.dockerignore`:
```gitignore
# 빌드 성능 향상을 위한 제외 파일
**/.git
**/node_modules
**/.vscode
**/*.md
**/test
**/docs

# 큰 파일들 제외
**/*.log
**/*.dump
**/*.backup

# 환경별 설정 파일
.env.*
!.env.example
```

## 모니터링 및 Observability

### 1. Container 메트릭 수집

```dockerfile
# Prometheus 메트릭 엔드포인트
EXPOSE 8080 9090

# 메트릭 수집용 헬스체크
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:9090/metrics || exit 1

# 구조화된 로깅 설정
ENV LOG_LEVEL=info \
    LOG_FORMAT=json
```

### 2. Distributed Tracing 준비

```dockerfile
# OpenTelemetry 설정
ENV OTEL_SERVICE_NAME=myapp \
    OTEL_RESOURCE_ATTRIBUTES="service.version=${VERSION}" \
    OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:14268/api/traces
```

### 3. Runtime 메트릭 최적화

```dockerfile
# JVM 튜닝 (Java 애플리케이션)
ENV JAVA_OPTS="-XX:+UseContainerSupport \
               -XX:MaxRAMPercentage=75.0 \
               -XX:+UseG1GC \
               -XX:+UseStringDeduplication \
               -XX:+PrintGCDetails \
               -XX:+PrintGCTimeStamps"

# Python GC 튜닝
ENV PYTHONMALLOC=malloc \
    MALLOC_ARENA_MAX=2
```

## CI/CD Integration Pattern

### 1. Automated Build Pipeline

```yaml
# .github/workflows/docker-build.yml
name: Docker Build and Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  docker-build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Build and cache
      uses: docker/build-push-action@v4
      with:
        context: .
        file: ./Dockerfile
        platforms: linux/amd64,linux/arm64
        cache-from: type=gha
        cache-to: type=gha,mode=max
        tags: myapp:${{ github.sha }}
    
    - name: Security scan
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: myapp:${{ github.sha }}
        format: 'sarif'
        output: 'trivy-results.sarif'
    
    - name: Upload scan results
      uses: github/codeql-action/upload-sarif@v2
      with:
        sarif_file: 'trivy-results.sarif'
```

### 2. Multi-Environment Configuration

```dockerfile
# 환경별 설정을 위한 ARG 활용
ARG ENVIRONMENT=production
ARG DEBUG=false

# 환경별 의존성 설치
RUN if [ "$ENVIRONMENT" = "development" ] ; then \
      pip install -r requirements-dev.txt ; \
    else \
      pip install -r requirements-prod.txt ; \
    fi

# 환경 변수 설정
ENV APP_ENV=${ENVIRONMENT} \
    DEBUG=${DEBUG}
```

## 트러블슈팅 가이드

### 1. 빌드 시간 최적화 체크리스트

```bash
# 빌드 시간 분석
docker build --no-cache --progress=plain . 2>&1 | ts

# BuildKit 캐시 분석
docker buildx build --progress=plain --cache-from=type=registry,ref=myapp:cache .

# 레이어 크기 분석
docker history myapp:latest --human --format "table {{.Size}}\t{{.CreatedBy}}"
```

### 2. 런타임 성능 진단

```bash
# 컨테이너 리소스 사용량
docker stats myapp-container

# 메모리 사용 패턴 분석
docker exec myapp-container cat /proc/meminfo

# 파일 시스템 사용량
docker exec myapp-container df -h
```

### 3. 보안 이슈 해결

```bash
# 컨테이너 내부 CVE 확인
trivy fs --security-checks vuln /

# 권한 분석
docker exec myapp-container ls -la /app

# 프로세스 권한 확인
docker exec myapp-container ps aux
```

## Production Checklist

### 배포 전 필수 체크포인트

- [ ] **이미지 크기 < 500MB** (언어별 기준 적용)
- [ ] **CVE HIGH/CRITICAL = 0**
- [ ] **Non-root 사용자로 실행**
- [ ] **Health check 구현**
- [ ] **Graceful shutdown 지원**
- [ ] **리소스 제한 설정**
- [ ] **로그 구조화** (JSON format)
- [ ] **메트릭 엔드포인트 제공**
- [ ] **Secrets를 환경변수로 주입**
- [ ] **빌드 재현성 보장** (lock files)

### Runtime Configuration

```yaml
# kubernetes deployment example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      containers:
      - name: myapp
        image: myapp:v1.2.3
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        securityContext:
          runAsNonRoot: true
          runAsUser: 1000
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

## 정리

Production-ready Dockerfile 작성의 핵심은 다음 요소들의 균형입니다:

1. **Multi-stage builds**: 이미지 크기 최적화와 보안 강화
2. **Layer caching**: 빌드 시간 단축과 CI/CD 효율성
3. **Security hardening**: 최소 권한 원칙과 공격 범위 최소화
4. **Performance optimization**: 런타임 리소스 사용 최적화
5. **Observability**: 모니터링과 디버깅 지원

**Enterprise 환경에서 추가로 고려할 사항**:
- **Supply chain security**: SBOM 관리와 의존성 추적
- **Compliance**: 보안 스캔과 정책 준수
- **Multi-platform builds**: AMD64/ARM64 크로스 플랫폼 지원
- **Registry security**: 이미지 서명과 접근 제어

이러한 모범 사례를 따르면 안전하고 효율적이며 유지보수가 용이한 컨테이너 이미지를 구축할 수 있습니다.

## 관련 문서

- [Istio Traffic Interception](istio-traffic-interception.md)
- [Container Memory Management](../cs/memory/cgroup-container-memory.md)
- [Process vs Thread](../cs/process/process-vs-thread-1.md)