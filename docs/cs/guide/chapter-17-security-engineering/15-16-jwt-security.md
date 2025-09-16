---
tags:
  - Authentication
  - Authorization
  - Blacklist
  - JWT
  - Token Security
  - hands-on
  - intermediate
  - medium-read
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# Chapter 15-3C: JWT 보안 - 토큰 기반 인증의 심화

## JWT (JSON Web Token) 심화

### JWT 구조와 보안 고려사항

```python
# jwt_security.py - JWT 보안 구현
import jwt
import json
import base64
import hmac
import hashlib
import time
from datetime import datetime, timedelta
from typing import Dict, Optional, Any

class SecureJWTManager:
    def __init__(self, secret_key: str, issuer: str = "myapp.com"):
        self.secret_key = secret_key
        self.issuer = issuer
        self.algorithm = 'HS256'

        # JWT 보안 설정
        self.max_token_age = timedelta(hours=1)  # 최대 토큰 수명
        self.refresh_token_age = timedelta(days=30)
        self.blacklist = set()  # 취소된 토큰들

    def create_token(self, user_id: str, roles: list = None,
                    additional_claims: dict = None) -> str:
        """안전한 JWT 토큰 생성"""

        now = datetime.utcnow()

        # 표준 클레임들
        payload = {
            'iss': self.issuer,           # Issuer (토큰 발급자)
            'sub': str(user_id),          # Subject (사용자 ID)
            'iat': int(now.timestamp()),  # Issued At (발급 시간)
            'exp': int((now + self.max_token_age).timestamp()),  # Expiration
            'nbf': int(now.timestamp()),  # Not Before (유효 시작 시간)
            'jti': self._generate_jti(),  # JWT ID (고유 식별자)
        }

        # 커스텀 클레임들
        if roles:
            payload['roles'] = roles

        if additional_claims:
            # 예약된 클레임들과 충돌 방지
            reserved_claims = {'iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti'}
            for key, value in additional_claims.items():
                if key not in reserved_claims:
                    payload[key] = value

        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def verify_token(self, token: str, audience: str = None) -> Optional[Dict]:
        """JWT 토큰 검증 (완전한 보안 검사)"""

        try:
            # 1. 블랙리스트 확인
            if self._is_blacklisted(token):
                raise jwt.InvalidTokenError("Token has been revoked")

            # 2. JWT 기본 검증
            options = {
                'verify_signature': True,
                'verify_exp': True,
                'verify_nbf': True,
                'verify_iat': True,
                'verify_aud': audience is not None,
            }

            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                audience=audience,
                issuer=self.issuer,
                options=options
            )

            # 3. 추가 보안 검증들
            self._additional_security_checks(payload, token)

            return payload

        except jwt.ExpiredSignatureError:
            raise Exception("Token has expired")
        except jwt.InvalidTokenError as e:
            raise Exception(f"Invalid token: {str(e)}")
        except Exception as e:
            raise Exception(f"Token verification failed: {str(e)}")

    def _additional_security_checks(self, payload: Dict, token: str):
        """추가 보안 검증"""

        # 1. 토큰 발급 시간이 너무 오래된 경우 (타임스탬프 공격 방지)
        iat = payload.get('iat')
        if iat:
            issued_time = datetime.fromtimestamp(iat)
            max_age = datetime.utcnow() - timedelta(hours=24)  # 24시간 이상 된 토큰 거부

            if issued_time < max_age:
                raise jwt.InvalidTokenError("Token is too old")

        # 2. JTI (JWT ID) 중복 사용 방지 (실제로는 Redis 등에 저장)
        jti = payload.get('jti')
        if jti and self._is_jti_used(jti):
            raise jwt.InvalidTokenError("Token ID already used")

        # 3. 비정상적인 클레임 값 검사
        user_id = payload.get('sub')
        if not user_id or len(str(user_id)) > 100:  # 비정상적인 사용자 ID
            raise jwt.InvalidTokenError("Invalid user ID")

    def _generate_jti(self) -> str:
        """JWT ID 생성 (고유 식별자)"""
        import uuid
        return str(uuid.uuid4())

    def _is_blacklisted(self, token: str) -> bool:
        """블랙리스트 확인"""
        # JWT ID로 확인 (실제로는 데이터베이스나 Redis 사용)
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            jti = payload.get('jti')
            return jti in self.blacklist
        except:
            return False

    def _is_jti_used(self, jti: str) -> bool:
        """JTI 중복 사용 확인 (replay attack 방지)"""
        # 실제로는 Redis 등에서 확인
        return False

    def revoke_token(self, token: str) -> bool:
        """토큰 취소 (로그아웃 시 등)"""
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            jti = payload.get('jti')
            if jti:
                self.blacklist.add(jti)
                return True
        except:
            pass
        return False

    def refresh_token(self, refresh_token: str) -> Optional[str]:
        """리프레시 토큰으로 새 액세스 토큰 발급"""
        try:
            # 리프레시 토큰 검증 (더 긴 만료 시간)
            payload = jwt.decode(
                refresh_token,
                self.secret_key,
                algorithms=[self.algorithm],
                issuer=self.issuer
            )

            # 토큰 타입 확인
            if payload.get('token_type') != 'refresh':
                raise jwt.InvalidTokenError("Not a refresh token")

            # 새 액세스 토큰 발급
            user_id = payload.get('sub')
            roles = payload.get('roles')

            return self.create_token(user_id, roles)

        except Exception as e:
            raise Exception(f"Token refresh failed: {str(e)}")

    def create_refresh_token(self, user_id: str, roles: list = None) -> str:
        """리프레시 토큰 생성"""
        now = datetime.utcnow()

        payload = {
            'iss': self.issuer,
            'sub': str(user_id),
            'iat': int(now.timestamp()),
            'exp': int((now + self.refresh_token_age).timestamp()),
            'jti': self._generate_jti(),
            'token_type': 'refresh',  # 토큰 타입 명시
        }

        if roles:
            payload['roles'] = roles

        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def decode_token_unsafe(self, token: str) -> Optional[Dict]:
        """서명 검증 없이 토큰 디코딩 (디버깅용만)"""
        try:
            return jwt.decode(token, options={"verify_signature": False})
        except:
            return None

# JWT 클레임 검증 미들웨어
class JWTMiddleware:
    def __init__(self, jwt_manager: SecureJWTManager):
        self.jwt_manager = jwt_manager

    def require_jwt(self, required_roles: list = None):
        """JWT 인증 데코레이터"""
        def decorator(func):
            def wrapper(*args, **kwargs):
                # HTTP 헤더에서 토큰 추출
                auth_header = kwargs.get('authorization')
                if not auth_header or not auth_header.startswith('Bearer '):
                    raise Exception("Missing or invalid Authorization header")

                token = auth_header.split(' ')[1]

                try:
                    payload = self.jwt_manager.verify_token(token)

                    # 역할 기반 접근 제어
                    if required_roles:
                        user_roles = payload.get('roles', [])
                        if not any(role in user_roles for role in required_roles):
                            raise Exception(f"Insufficient privileges. Required: {required_roles}")

                    # 사용자 정보를 함수에 주입
                    kwargs['current_user'] = {
                        'user_id': payload.get('sub'),
                        'roles': payload.get('roles', []),
                        'exp': payload.get('exp')
                    }

                    return func(*args, **kwargs)

                except Exception as e:
                    raise Exception(f"Authentication failed: {str(e)}")

            return wrapper
        return decorator

# 사용 예시
def demo_jwt_security():
    jwt_manager = SecureJWTManager("super-secret-jwt-key", "myapp.com")
    middleware = JWTMiddleware(jwt_manager)

    print("=== JWT Security Demo ===")

    # 1. 토큰 생성
    access_token = jwt_manager.create_token(
        user_id="user123",
        roles=['user', 'premium'],
        additional_claims={'dept': 'engineering'}
    )

    refresh_token = jwt_manager.create_refresh_token(
        user_id="user123",
        roles=['user', 'premium']
    )

    print(f"Access Token: {access_token[:50]}...")
    print(f"Refresh Token: {refresh_token[:50]}...")

    # 2. 토큰 검증
    try:
        payload = jwt_manager.verify_token(access_token)
        print(f"Token verified! User: {payload['sub']}, Roles: {payload.get('roles')}")
    except Exception as e:
        print(f"Token verification failed: {e}")

    # 3. 보호된 엔드포인트 예시
    @middleware.require_jwt(['premium'])
    def premium_feature(authorization=None, current_user=None):
        return f"Premium feature accessed by user {current_user['user_id']}"

    try:
        result = premium_feature(authorization=f"Bearer {access_token}")
        print(f"Protected resource: {result}")
    except Exception as e:
        print(f"Access denied: {e}")

    # 4. 토큰 취소
    jwt_manager.revoke_token(access_token)

    try:
        jwt_manager.verify_token(access_token)
    except Exception as e:
        print(f"Revoked token rejected: {e}")

    # 5. 토큰 갱신
    try:
        new_access_token = jwt_manager.refresh_token(refresh_token)
        print(f"New token: {new_access_token[:50]}...")
    except Exception as e:
        print(f"Token refresh failed: {e}")

if __name__ == "__main__":
    demo_jwt_security()
```

## JWT 보안 모범 사례

### 1. 토큰 구조 이해

JWT는 세 부분으로 구성됩니다:

```text
Header.Payload.Signature

# 예시 JWT 토큰 분해
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.  # Header
eyJzdWIiOiJ1c2VyMTIzIiwiaWF0IjoxNjM5NTU3NjAwfQ.  # Payload
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c   # Signature
```

### 2. 보안 고려사항

```python
# ✅ 안전한 JWT 설정
class SecureJWTConfig:
    # 강력한 시크릿 키 (256비트 이상)
    SECRET_KEY = secrets.token_urlsafe(64)

    # 짧은 토큰 수명
    ACCESS_TOKEN_EXPIRE = timedelta(minutes=15)  # 15분
    REFRESH_TOKEN_EXPIRE = timedelta(days=7)     # 7일

    # 안전한 알고리즘만 사용
    ALGORITHM = 'HS256'  # 또는 RS256 (비대칭 키)

    # 필수 클레임 검증
    REQUIRED_CLAIMS = ['iss', 'sub', 'iat', 'exp', 'jti']

    # 토큰 블랙리스트 (Redis 등)
    USE_BLACKLIST = True

# ❌ 위험한 설정들
WEAK_SECRET = "password123"           # 약한 시크릿
LONG_EXPIRY = timedelta(days=365)     # 너무 긴 수명
ALGORITHM_NONE = 'none'               # 서명 없음 (매우 위험!)
```

### 3. 토큰 저장 방식

```javascript
// 클라이언트 측 토큰 저장 보안
class TokenStorage {
    // ✅ 안전한 방식들
    static storeTokenSecure(token, refreshToken) {
        // 1. HTTP-Only 쿠키 (CSRF 보호와 함께)
        document.cookie = `access_token=${token}; HttpOnly; Secure; SameSite=Strict`;

        // 2. 메모리 저장 (새로고침시 재로그인 필요)
        window.tokenStore = { token, refreshToken };

        // 3. Secure localStorage (XSS 방지 조치 후)
        if (this.isXSSProtected()) {
            localStorage.setItem('token', this.encrypt(token));
        }
    }

    // ❌ 위험한 방식들
    static storeTokenUnsafe(token) {
        // 일반 localStorage (XSS 취약)
        localStorage.setItem('token', token);

        // URL 파라미터 (로그에 노출)
        window.location.href = `/dashboard?token=${token}`;

        // 일반 쿠키 (JavaScript로 접근 가능)
        document.cookie = `token=${token}`;
    }
}
```

### 4. 토큰 갱신 패턴

```python
# 자동 토큰 갱신 시스템
class TokenRefreshSystem:
    def __init__(self, jwt_manager):
        self.jwt_manager = jwt_manager
        self.refresh_threshold = timedelta(minutes=5)  # 만료 5분 전 갱신

    def auto_refresh_token(self, access_token: str, refresh_token: str) -> Dict:
        """토큰 자동 갱신"""
        try:
            payload = self.jwt_manager.decode_token_unsafe(access_token)
            exp_timestamp = payload.get('exp')

            if exp_timestamp:
                exp_time = datetime.fromtimestamp(exp_timestamp)
                time_until_expiry = exp_time - datetime.utcnow()

                # 만료 임박 시 갱신
                if time_until_expiry <= self.refresh_threshold:
                    new_access_token = self.jwt_manager.refresh_token(refresh_token)

                    return {
                        'access_token': new_access_token,
                        'refresh_token': refresh_token,  # 재사용 또는 새로 발급
                        'refreshed': True
                    }

            return {
                'access_token': access_token,
                'refresh_token': refresh_token,
                'refreshed': False
            }

        except Exception as e:
            raise Exception(f"Token refresh failed: {e}")
```

## 핵심 요점

### 1. JWT 보안 원칙

- **강력한 서명**: HS256 이상의 알고리즘 사용
- **짧은 수명**: Access Token은 15분~1시간 이내
- **블랙리스트**: 로그아웃 시 토큰 무효화

### 2. 클레임 검증

- **표준 클레임**: iss, sub, iat, exp, nbf 필수 검증
- **커스텀 클레임**: 비즈니스 로직에 필요한 정보만 포함
- **JTI 사용**: Replay Attack 방지

### 3. 토큰 라이프사이클 관리

- **자동 갱신**: 만료 임박 시 Refresh Token으로 갱신
- **안전한 저장**: HTTP-Only 쿠키 또는 메모리 저장
- **적절한 폐기**: 로그아웃 시 서버 측 토큰 무효화

---

**이전**: [OAuth 2.0 구현](chapter-17-security-engineering/17-15-oauth2-implementation.md)
**다음**: [다중 인증 (MFA)](chapter-17-security-engineering/17-17-mfa-implementation.md)에서 TOTP와 백업 코드를 통한 보안 강화 방법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 애플리케이션 개발
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-15-security-engineering)

- [Chapter 15-1: 메모리 보안 - 메모리 공격과 방어의 과학](./17-10-memory-security.md)
- [Chapter 15.2 네트워크 보안 개요](./17-11-network-security.md)
- [Chapter 15-2a: 네트워크 보안 기초와 위협 환경](./17-01-network-fundamentals.md)
- [Chapter 15-2b: TLS/SSL 프로토콜과 암호화 통신](./17-12-tls-protocols.md)
- [Chapter 15-2c: DDoS 공격 탐지와 방어 시스템](./17-13-ddos-defense.md)

### 🏷️ 관련 키워드

`JWT`, `Token Security`, `Authentication`, `Authorization`, `Blacklist`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
