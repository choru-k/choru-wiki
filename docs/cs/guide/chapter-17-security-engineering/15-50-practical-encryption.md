---
tags:
  - AES-GCM
  - Argon2
  - bcrypt
  - deep-study
  - hands-on
  - intermediate
  - 데이터암호화
  - 비밀번호해시
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "6-10시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 15.5B 실전 암호화 구현 - 비밀번호와 데이터 보호

## 🔐 비밀번호 해시화

### bcrypt vs Argon2 비교

```javascript
// bcrypt vs Argon2 비교 (Node.js)
const bcrypt = require('bcrypt');
const argon2 = require('argon2');

// bcrypt (전통적, 널리 사용됨)
async function hashPasswordBcrypt(password) {
    // 2024년 기준 최소 12라운드 권장 (계산 시간: ~250ms)
    const saltRounds = 12;
    const hash = await bcrypt.hash(password, saltRounds);
    return hash;
}

async function verifyPasswordBcrypt(password, hash) {
    return await bcrypt.compare(password, hash);
}

// Argon2id (최신, OWASP 권장)
async function hashPasswordArgon2(password) {
    try {
        const hash = await argon2.hash(password, {
            type: argon2.argon2id,      // Argon2id 사용
            memoryCost: 65536,          // 64MB 메모리 사용
            timeCost: 3,                // 3번 반복
            parallelism: 4,             // 4개 스레드 병렬 처리
        });
        return hash;
    } catch (err) {
        throw new Error('비밀번호 해시화 실패');
    }
}

async function verifyPasswordArgon2(password, hash) {
    try {
        return await argon2.verify(hash, password);
    } catch (err) {
        return false;
    }
}

// 실제 사용 예제
class UserService {
    static async registerUser(email, password) {
        // 비밀번호 강도 검사
        if (password.length < 12) {
            throw new Error('비밀번호는 최소 12자 이상이어야 합니다');
        }
        
        // Argon2로 해시화 (보안성 최우선)
        const hashedPassword = await hashPasswordArgon2(password);
        
        // 데이터베이스에 저장
        await db.users.create({
            email,
            password: hashedPassword,
            created_at: new Date()
        });
        
        console.log('✅ 사용자 등록 완료 - 비밀번호 안전하게 저장됨');
    }
    
    static async authenticateUser(email, password) {
        const user = await db.users.findOne({ email });
        if (!user) {
            // 타이밍 공격 방지를 위해 가짜 해시 검증
            await argon2.verify('$argon2id$v=19$m=65536,t=3,p=4$dummy', password);
            throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
        }
        
        const isValid = await verifyPasswordArgon2(password, user.password);
        if (!isValid) {
            throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
        }
        
        return user;
    }
}
```

## 🔒 민감한 데이터 암호화

### Go언어로 구현한 종합 암호화 시스템

```go
// Go언어로 구현한 종합 암호화 시스템
package encryption

import (
    "crypto/aes"
    "crypto/cipher"
    "crypto/rand"
    "crypto/sha256"
    "encoding/hex"
    "errors"
    "fmt"
    "io"
    
    "golang.org/x/crypto/pbkdf2"
)

type EncryptionService struct {
    masterKey []byte
}

func NewEncryptionService(password string, salt []byte) *EncryptionService {
    // PBKDF2로 마스터 키 유도
    key := pbkdf2.Key([]byte(password), salt, 100000, 32, sha256.New)
    return &EncryptionService{masterKey: key}
}

// 민감한 데이터 암호화 (PII, 신용카드 등)
func (es *EncryptionService) EncryptSensitiveData(plaintext string) (string, error) {
    block, err := aes.NewCipher(es.masterKey)
    if err != nil {
        return "", fmt.Errorf("cipher 생성 실패: %v", err)
    }
    
    // AES-GCM 모드 사용 (인증된 암호화)
    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return "", fmt.Errorf("GCM 생성 실패: %v", err)
    }
    
    // 랜덤 nonce 생성 (매우 중요!)
    nonce := make([]byte, gcm.NonceSize())
    if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
        return "", fmt.Errorf("nonce 생성 실패: %v", err)
    }
    
    // 암호화
    ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
    
    // hex 인코딩하여 반환
    return hex.EncodeToString(ciphertext), nil
}

func (es *EncryptionService) DecryptSensitiveData(encryptedHex string) (string, error) {
    // hex 디코딩
    ciphertext, err := hex.DecodeString(encryptedHex)
    if err != nil {
        return "", fmt.Errorf("hex 디코딩 실패: %v", err)
    }
    
    block, err := aes.NewCipher(es.masterKey)
    if err != nil {
        return "", fmt.Errorf("cipher 생성 실패: %v", err)
    }
    
    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return "", fmt.Errorf("GCM 생성 실패: %v", err)
    }
    
    if len(ciphertext) < gcm.NonceSize() {
        return "", errors.New("암호문이 너무 짧습니다")
    }
    
    // nonce와 실제 암호문 분리
    nonce, ciphertext := ciphertext[:gcm.NonceSize()], ciphertext[gcm.NonceSize():]
    
    // 복호화 및 인증
    plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
    if err != nil {
        return "", fmt.Errorf("복호화 실패: %v", err)
    }
    
    return string(plaintext), nil
}

// 실제 사용 예제
func main() {
    // 마스터 키 설정 (실제로는 환경변수나 KMS에서 가져옴)
    salt := []byte("your-unique-salt-16-bytes-long")
    encryptionService := NewEncryptionService("master-password-from-env", salt)
    
    // 신용카드 번호 암호화
    cardNumber := "4111-1111-1111-1111"
    encrypted, err := encryptionService.EncryptSensitiveData(cardNumber)
    if err != nil {
        panic(err)
    }
    
    fmt.Printf("암호화된 카드번호: %s\n", encrypted)
    // 출력: 8f5a9b2c3d4e1a7b9c0d2f5g8h1j4k7l...
    
    // 복호화
    decrypted, err := encryptionService.DecryptSensitiveData(encrypted)
    if err != nil {
        panic(err)
    }
    
    fmt.Printf("복호화된 카드번호: %s\n", decrypted)
    // 출력: 4111-1111-1111-1111
}
```

## 🔑 암호화 방식 비교

### 비밀번호 해시 알고리즘 비교

| 알고리즘 | 보안성 | 속도 | 메모리 사용량 | 최적 사용 사례 |
|------------|---------|------|---------------|------------------|
| **bcrypt** | 높음 | 보통 | 낮음 | 기존 시스템 마이그레이션 |
| **Argon2id** | 매우 높음 | 느림 | 높음 | 새로운 시스템 개발 |
| **scrypt** | 높음 | 느림 | 높음 | 비트코인/블록체인 |
| **PBKDF2** | 보통 | 빠름 | 낮음 | 레거시 시스템 |

### 대칭 암호화 알고리즘 성능 비교

| 알고리즘 | 처리속도 (MB/s) | CPU 사용량 | 보안성 | 모바일 친화도 |
|------------|-------------------|------------|---------|---------------|
| **AES-256-GCM** | 850 MB/s | 보통 | 매우 높음 | 보통 |
| **ChaCha20-Poly1305** | 720 MB/s | 낮음 | 매우 높음 | 매우 높음 |
| **AES-256-CBC** | 950 MB/s | 보통 | 높음 | 보통 |

### 실무 전략

**비밀번호 해시 추천 단계:**

```python
# 우선순위 선택 가이드
def choose_password_hash_algorithm(use_case):
    """비밀번호 해시 알고리즘 선택 가이드"""
    
    # 1순위: 새 프로젝트
    if use_case == 'new_project':
        return 'Argon2id'  # 최고 보안성
    
    # 2순위: 기존 시스템 업그레이드
    elif use_case == 'legacy_upgrade':
        return 'bcrypt'    # 안정성과 호환성
    
    # 3순위: 리소스 제약 환경
    elif use_case == 'resource_limited':
        return 'PBKDF2'    # 가벼운 메모리 사용
    
    else:
        return 'bcrypt'    # 기본 추천

# 데이터 암호화 추천 단계
def choose_encryption_algorithm(data_type, performance_priority):
    """데이터 암호화 알고리즘 선택 가이드"""
    
    if data_type == 'sensitive_pii':
        # PII, 신용카드 등 민감한 데이터
        if performance_priority == 'high':
            return 'AES-256-GCM'  # 하드웨어 가속 지원
        else:
            return 'ChaCha20-Poly1305'  # 모바일 친화
    
    elif data_type == 'bulk_data':
        # 대용량 데이터
        return 'AES-256-CBC'  # 빠른 처리 속도
    
    else:
        return 'AES-256-GCM'  # 범용적 선택
```

## 🚀 실제 구현 패턴

### 데이터베이스 레벨 암호화

```sql
-- MySQL 8.0+ 투명한 데이터 암호화 (TDE)
ALTER TABLE user_payments ENCRYPTION='Y';

-- 카럼 레벨 암호화
CREATE TABLE user_accounts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL,
    -- AES 암호화/복호화 함수 사용
    password_hash TEXT NOT NULL,
    -- 민감한 데이터는 어플리케이션 레벨에서 암호화
    encrypted_ssn BLOB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 어플리케이션 레벨 암호화 패턴

```python
class DataProtectionLayer:
    """데이터 보호 계층 - 암호화 및 토큰화"""
    
    def __init__(self, encryption_key: bytes):
        self.cipher_suite = Fernet(encryption_key)
        
    def encrypt_pii(self, pii_data: str) -> str:
        """PII 데이터 암호화"""
        encrypted = self.cipher_suite.encrypt(pii_data.encode())
        return encrypted.decode()
    
    def decrypt_pii(self, encrypted_data: str) -> str:
        """PII 데이터 복호화"""
        decrypted = self.cipher_suite.decrypt(encrypted_data.encode())
        return decrypted.decode()
    
    def tokenize_sensitive_data(self, data: str) -> str:
        """Format Preserving Encryption (FPE) 토큰화"""
        # 신용카드 번호 1234-5678-9012-3456 → 9876-5432-1098-7654
        # 비가역적 토큰화로 원본 데이터 보호
        pass

# 실제 서비스 에서 사용
class UserDataService:
    def __init__(self):
        # 환경변수에서 암호화 키 로드
        encryption_key = os.environ['DATA_ENCRYPTION_KEY'].encode()
        self.protection_layer = DataProtectionLayer(encryption_key)
    
    def create_user(self, email: str, ssn: str, credit_card: str):
        """PII를 포함한 사용자 생성"""
        
        # PII 데이터 암호화
        encrypted_ssn = self.protection_layer.encrypt_pii(ssn)
        tokenized_card = self.protection_layer.tokenize_sensitive_data(credit_card)
        
        # 데이터베이스에 암호화된 데이터 저장
        db.execute("""
            INSERT INTO users (email, encrypted_ssn, tokenized_card) 
            VALUES (%s, %s, %s)
        """, (email, encrypted_ssn, tokenized_card))
        
        print(f"✅ 사용자 데이터 안전하게 저장: {email}")
```

## 핵심 요점

### 1. 비밀번호 보안 방식 진화

- bcrypt: 전통적이지만 여전히 안전한 선택
- Argon2id: 2024년 최신 권장 표준
- 적절한 비용(속도) vs 보안 균형점 찾기

### 2. 데이터 암호화 레벨

- 데이터베이스 레벨: TDE로 전체 데이터 보호
- 어플리케이션 레벨: 민감 필드별 선택적 암호화
- 네트워크 레벨: TLS/HTTPS로 전송 구간 보호

### 3. 성능 vs 보안 고려사항

- AES-GCM: 하드웨어 가속 + 높은 보안성
- ChaCha20: 모바일 친화 + 소프트웨어 최적화
- 데이터 크기와 사용 환경에 따른 선택

---

**이전**: [05A 암호화 기초](./17-03-cryptography-fundamentals.md)  
**다음**: [05C 키 관리 시스템](./05c-key-management-e2e.md)에서 AWS KMS를 활용한 키 관리와 E2E 암호화를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 6-10시간

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

`Argon2`, `bcrypt`, `AES-GCM`, `데이터암호화`, `비밀번호해시`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
