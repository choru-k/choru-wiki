---
tags:
  - authentication
  - authorization
  - deep-study
  - hands-on
  - intermediate
  - jwt
  - mfa
  - oauth2
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "12-16시간"
main_topic: "애플리케이션 개발"
priority_score: 5
---

# Chapter 15-3: 인증과 인가 개요

## 🎯 신원 확인과 권한 관리의 과학

현대 디지털 환경에서 인증(Authentication)과 인가(Authorization)는 보안의 핵심 기둥입니다. 2012년 LinkedIn 해킹 사건에서 6,500만 개 패스워드가 유출된 사례처럼, 약한 인증 시스템은 치명적 결과를 가져올 수 있습니다.

## 📚 학습 로드맵

이 섹션은 4개의 전문화된 문서로 구성되어 있습니다:

### 1️⃣ [기본 개념과 구현](./17-02-authentication-basics.md)

- Authentication vs Authorization 차이점
- LinkedIn 해킹 사건 분석
- 완전한 인증/인가 시스템 구현
- 패스워드 보안과 Rate Limiting
- 현대적 다층 보안 아키텍처

### 2️⃣ [OAuth 2.0 구현](./17-15-oauth2-implementation.md)

- OAuth 2.0 Authorization Code Flow
- 완전한 OAuth 2.0 서버 구현
- PKCE (Proof Key for Code Exchange)
- 클라이언트 구현과 토큰 관리
- 실제 프로덕션 고려사항

### 3️⃣ [JWT 보안](./17-16-jwt-security.md)

- JWT 구조와 서명 검증
- 토큰 블랙리스트와 취소
- 리프레시 토큰 패턴
- 보안 헤더와 클레임 검증
- JWT 미들웨어 구현

### 4️⃣ [다중 인증 (MFA)](./17-17-mfa-implementation.md)

- TOTP (Time-based OTP) 구현
- QR 코드와 백업 코드 관리
- WebAuthn과 생체 인증
- 복구 토큰과 관리자 권한
- 통합 인증 시스템

## 🎯 핵심 개념 비교표

| 개념 | Authentication | Authorization | 설명 |
|------|----------------|---------------|------|
| **목적** | 누구인가? (Who) | 무엇을 할 수 있는가? (What) | 신원 확인 vs 권한 확인 |
| **시점** | 로그인 시 | 리소스 접근 시 | 인증 후 인가 진행 |
| **기술** | 패스워드, MFA, 생체인식 | RBAC, ABAC, ACL | 다른 기술과 메커니즘 |
| **결과** | 토큰/세션 발급 | 접근 허용/거부 | 각기 다른 결과물 |

## 🚀 실전 활용 시나리오

### 엔터프라이즈 환경

- **SSO (Single Sign-On)**: OAuth 2.0 + OIDC로 통합 로그인
- **API 보안**: JWT 기반 마이크로서비스 인증
- **내부 시스템**: RBAC 기반 세밀한 권한 관리

### 웹/모바일 애플리케이션

- **소셜 로그인**: OAuth 2.0으로 Google, Facebook 연동
- **보안 강화**: MFA로 계정 보호
- **세션 관리**: JWT + 리프레시 토큰 패턴

## 🎭 학습 전략

### 초보자 (추천 순서)

1. [기본 개념과 구현](./17-02-authentication-basics.md) → 인증/인가 차이점 이해
2. [OAuth 2.0 구현](./17-15-oauth2-implementation.md) → 표준 프로토콜 학습
3. 간단한 로그인 시스템 구현 연습

### 중급자 (심화 학습)

1. [JWT 보안](./17-16-jwt-security.md) → 토큰 기반 인증 마스터
2. [다중 인증 (MFA)](./17-17-mfa-implementation.md) → 보안 강화 기법
3. 실제 프로덕션 환경에 적용

### 고급자 (전문가 수준)

- 모든 문서 통합 학습
- 대규모 분산 시스템 인증 아키텍처 설계
- 보안 감사와 컴플라이언스 적용

## 🔗 연관 학습

### 선행 학습

- [Chapter 15-1: 보안 기초](01-security-fundamentals.md) - 암호학 기초
- [Chapter 15-2: 네트워크 보안](./17-11-network-security.md) - TLS/HTTPS

### 후속 학습

- [Chapter 15-4: 컨테이너 보안](./17-18-container-security.md) - 인증 시스템 배포
- [Chapter 14: 분산 시스템](../chapter-14-distributed-systems/) - 분산 인증

## 핵심 학습 성과

이 섹션을 완료하면 다음과 같은 전문 역량을 갖추게 됩니다:

### 🎯 기술적 역량

1. **완전한 인증 시스템 구현**: 패스워드 해싱부터 MFA까지
2. **OAuth 2.0 프로토콜 마스터**: Authorization Server와 Client 구현
3. **JWT 보안 전문성**: 토큰 생성, 검증, 갱신 메커니즘
4. **다중 인증 구축**: TOTP, 백업 코드, WebAuthn 통합
5. **보안 취약점 분석**: LinkedIn 사례로 학습한 위험 요소들

### 🛡️ 실무 적용

- **엔터프라이즈 SSO 구축**: 대규모 조직의 통합 로그인 시스템
- **API 보안 설계**: 마이크로서비스 간 안전한 통신
- **모바일 앱 인증**: PKCE를 활용한 Public Client 보안
- **컴플라이언스 준수**: GDPR, SOC 2 등 보안 표준 적용

### ⚖️ 보안 의사결정

각 기술의 **트레이드오프**를 이해하고 상황에 맞는 **최적의 선택**을 할 수 있는 능력을 기르게 됩니다.

---

**다음**: [기본 개념과 구현](./17-02-authentication-basics.md)에서 Authentication과 Authorization의 차이점과 LinkedIn 사건 분석부터 시작합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 12-16시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-17-security-engineering)

- [Chapter 15-1: 메모리 보안 - 메모리 공격과 방어의 과학](./17-10-memory-security.md)
- [Chapter 15.2 네트워크 보안 개요](./17-11-network-security.md)
- [Chapter 15-2a: 네트워크 보안 기초와 위협 환경](./17-01-network-fundamentals.md)
- [Chapter 15-2b: TLS/SSL 프로토콜과 암호화 통신](./17-12-tls-protocols.md)
- [Chapter 15-2c: DDoS 공격 탐지와 방어 시스템](./17-13-ddos-defense.md)

### 🏷️ 관련 키워드

`authentication`, `authorization`, `oauth2`, `jwt`, `mfa`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
