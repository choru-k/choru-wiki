---
tags:
  - Cryptography
  - Key Management
  - AWS KMS
  - E2E Encryption
  - Signal Protocol
  - Security
  - Guide
---

# 15.5C 키 관리 시스템 및 E2E 암호화

## 🗝️ AWS KMS를 활용한 키 관리

### 전문적인 키 관리 서비스

```python
import boto3
import base64
from typing import Dict, Any

class AWSKeyManagementService:
    def __init__(self, region_name: str):
        self.kms_client = boto3.client('kms', region_name=region_name)
        
    def create_customer_master_key(self, description: str) -> str:
        """고객 마스터 키 생성"""
        response = self.kms_client.create_key(
            Description=description,
            KeyUsage='ENCRYPT_DECRYPT',
            Origin='AWS_KMS',
            KeySpec='SYMMETRIC_DEFAULT'
        )
        return response['KeyMetadata']['KeyId']
    
    def encrypt_data_key(self, key_id: str, plaintext: bytes) -> Dict[str, Any]:
        """데이터 키 암호화"""
        response = self.kms_client.encrypt(
            KeyId=key_id,
            Plaintext=plaintext
        )
        return {
            'encrypted_key': base64.b64encode(response['CiphertextBlob']).decode(),
            'key_id': response['KeyId']
        }
    
    def decrypt_data_key(self, encrypted_key: str) -> bytes:
        """데이터 키 복호화"""
        response = self.kms_client.decrypt(
            CiphertextBlob=base64.b64decode(encrypted_key)
        )
        return response['Plaintext']

# 실제 사용 패턴: Envelope Encryption
class SecureDataManager:
    def __init__(self, kms_key_id: str):
        self.kms = AWSKeyManagementService('us-west-2')
        self.kms_key_id = kms_key_id
        
    def encrypt_large_data(self, data: bytes) -> Dict[str, str]:
        """대용량 데이터 암호화 (Envelope Encryption 패턴)"""
        # 1. 데이터 암호화 키 생성
        data_key = os.urandom(32)  # 256비트 AES 키
        
        # 2. 데이터를 데이터 키로 암호화
        encrypted_data = self._aes_encrypt(data, data_key)
        
        # 3. 데이터 키를 KMS로 암호화
        encrypted_data_key = self.kms.encrypt_data_key(
            self.kms_key_id, 
            data_key
        )
        
        return {
            'encrypted_data': base64.b64encode(encrypted_data).decode(),
            'encrypted_data_key': encrypted_data_key['encrypted_key'],
            'kms_key_id': encrypted_data_key['key_id']
        }
    
    def decrypt_large_data(self, envelope: Dict[str, str]) -> bytes:
        """대용량 데이터 복호화"""
        # 1. KMS로 데이터 키 복호화
        data_key = self.kms.decrypt_data_key(envelope['encrypted_data_key'])
        
        # 2. 데이터 키로 실제 데이터 복호화
        encrypted_data = base64.b64decode(envelope['encrypted_data'])
        plaintext = self._aes_decrypt(encrypted_data, data_key)
        
        # 3. 메모리에서 키 제거
        data_key = b'\x00' * len(data_key)
        
        return plaintext
```

### 키 로테이션과 라이프사이클 관리

```yaml
# Kubernetes Secret과 External Secrets Operator
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-kms-secret-store
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-west-2
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: database-credentials
spec:
  refreshInterval: 1h  # 1시간마다 자동 갱신
  secretStoreRef:
    name: aws-kms-secret-store
    kind: SecretStore
  target:
    name: db-secret
    creationPolicy: Owner
  data:
  - secretKey: password
    remoteRef:
      key: prod/database/password
      version: AWSCURRENT  # 자동으로 최신 버전 사용
```

---

## 🔒 End-to-End 암호화 구현

### Signal Protocol 기반 메시징 암호화

```typescript
// TypeScript로 구현한 E2E 암호화 메시징
import { SignalProtocolStore, SessionBuilder, SessionCipher } from 'libsignal-protocol';
import * as crypto from 'crypto';

class E2EMessagingService {
    private store: SignalProtocolStore;
    private deviceId: number;
    
    constructor(userId: string, deviceId: number) {
        this.deviceId = deviceId;
        this.store = new SignalProtocolStore(userId);
    }
    
    async initializeSession(recipientId: string, recipientDeviceId: number) {
        // 1. 상대방의 Identity Key와 Signed PreKey 가져오기
        const recipientBundle = await this.getPreKeyBundle(recipientId, recipientDeviceId);
        
        // 2. 세션 빌더로 암호화 세션 생성
        const sessionBuilder = new SessionBuilder(
            this.store, 
            recipientId, 
            recipientDeviceId
        );
        
        // 3. X3DH 키 교환 프로토콜 실행
        await sessionBuilder.processPreKey(recipientBundle);
        
        console.log(`\u2705 E2E 암호화 세션 생성 완료: ${recipientId}`);
    }
    
    async sendEncryptedMessage(recipientId: string, message: string): Promise<string> {
        // 1. 세션 암호화기 생성
        const sessionCipher = new SessionCipher(
            this.store,
            recipientId,
            this.deviceId
        );
        
        // 2. 메시지 암호화
        const encryptedMessage = await sessionCipher.encrypt(
            Buffer.from(message, 'utf8')
        );
        
        // 3. Double Ratchet으로 키 갱신
        return JSON.stringify({
            type: encryptedMessage.type,
            body: encryptedMessage.body.toString('base64'),
            timestamp: Date.now()
        });
    }
    
    async receiveEncryptedMessage(senderId: string, encryptedData: string): Promise<string> {
        const sessionCipher = new SessionCipher(
            this.store,
            senderId,
            this.deviceId
        );
        
        const messageData = JSON.parse(encryptedData);
        
        // 복호화
        const decryptedBuffer = await sessionCipher.decryptPreKeyWhisperMessage(
            Buffer.from(messageData.body, 'base64'),
            'binary'
        );
        
        return decryptedBuffer.toString('utf8');
    }
    
    // Forward Secrecy 보장 - 이전 메시지들은 복호화 불가
    async generateNewRatchetKey() {
        // Double Ratchet의 핵심: 매 메시지마다 새로운 키 생성
        const newKeyPair = crypto.generateKeyPairSync('x25519');
        await this.store.storeSignedPreKey(
            this.getNextSignedPreKeyId(),
            KeyHelper.generateSignedPreKey(this.store.getIdentityKeyPair(), newKeyPair)
        );
    }
}

// 실제 사용 예제
async function demonstrateE2EMessaging() {
    // Alice와 Bob의 메시징 서비스 초기화
    const alice = new E2EMessagingService('alice@secure.com', 1);
    const bob = new E2EMessagingService('bob@secure.com', 1);
    
    // 서로 세션 초기화
    await alice.initializeSession('bob@secure.com', 1);
    await bob.initializeSession('alice@secure.com', 1);
    
    // Alice가 Bob에게 암호화된 메시지 전송
    const message = "기밀 정보: 내일 오후 2시 회의실 A에서 만나자";
    const encryptedMessage = await alice.sendEncryptedMessage(
        'bob@secure.com', 
        message
    );
    
    console.log('암호화된 메시지:', encryptedMessage);
    // 출력: {"type":3,"body":"MwohBXXX...","timestamp":1640995200000}
    
    // Bob이 메시지 복호화
    const decryptedMessage = await bob.receiveEncryptedMessage(
        'alice@secure.com',
        encryptedMessage
    );
    
    console.log('복호화된 메시지:', decryptedMessage);
    // 출력: "기밀 정보: 내일 오후 2시 회의실 A에서 만나자"
}
```

## 📊 E2E 암호화 프로토콜 비교

### 주요 E2E 암호화 솔루션 비교

| 프로토콜 | 보안성 | 성능 | 구현 복잡도 | 주요 사용 사례 |
|----------|---------|------|-------------|------------------|
| **Signal Protocol** | 매우 높음 | 보통 | 높음 | Signal, WhatsApp |
| **Matrix/Olm** | 높음 | 보통 | 높음 | Element, Matrix |
| **OTR** | 높음 | 빠름 | 보통 | XMPP 기반 대화 |
| **PGP** | 높음 | 느림 | 낮음 | 이메일 암호화 |

### 프로토콜 별 특징

**Signal Protocol 장점:**

- Perfect Forward Secrecy (완벽한 전방향 비밀성)
- Post-Compromise Security (후방향 보안성)
- Asynchronous messaging 지원
- 대중적인 인식과 검증

**고려사항:**

```python
def choose_e2e_protocol(use_case):
    """사용 사례에 따른 E2E 프로토콜 선택 가이드"""
    
    if use_case == 'instant_messaging':
        return 'Signal Protocol'  # 최고 보안성
    
    elif use_case == 'email_encryption':
        return 'PGP/GPG'  # 표준 이메일 암호화
    
    elif use_case == 'group_collaboration':
        return 'Matrix/Olm'  # 그룹 환경 최적화
    
    elif use_case == 'legacy_chat':
        return 'OTR'  # XMPP 호환성
    
    else:
        return 'Signal Protocol'  # 기본 추천
```

## 🔐 키 관리 모범 사례

### 1. 키 라이프사이클 관리

```python
class KeyLifecycleManager:
    """키 라이프사이클 관리 시스템"""
    
    def __init__(self):
        self.key_store = {}  # 실제로는 HSM이나 KMS 사용
        self.rotation_schedule = {}
        
    def generate_key(self, key_id: str, key_type: str = 'AES-256') -> bytes:
        """암호화 키 생성"""
        if key_type == 'AES-256':
            key = os.urandom(32)
        elif key_type == 'RSA-4096':
            key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=4096
            )
        else:
            raise ValueError(f"지원하지 않는 키 타입: {key_type}")
        
        # 키 저장 및 메타데이터 설정
        self.key_store[key_id] = {
            'key': key,
            'created_at': datetime.now(),
            'key_type': key_type,
            'status': 'active',
            'usage_count': 0
        }
        
        # 로테이션 스케줄 설정
        self.schedule_rotation(key_id, days=90)  # 90일 마다 로테이션
        
        return key
    
    def rotate_key(self, key_id: str) -> bytes:
        """키 로테이션 수행"""
        old_key_info = self.key_store.get(key_id)
        if not old_key_info:
            raise ValueError(f"키를 찾을 수 없음: {key_id}")
        
        # 기존 키를 비활성화
        old_key_info['status'] = 'deprecated'
        old_key_info['deprecated_at'] = datetime.now()
        
        # 새로운 키 생성
        new_key_id = f"{key_id}_v{int(time.time())}"
        new_key = self.generate_key(new_key_id, old_key_info['key_type'])
        
        # 기존 키 삭제 예약 (30일 후)
        self.schedule_key_deletion(key_id, days=30)
        
        print(f"✅ 키 로테이션 완료: {key_id} -> {new_key_id}")
        return new_key
    
    def schedule_rotation(self, key_id: str, days: int):
        """키 로테이션 스케줄 설정"""
        rotation_date = datetime.now() + timedelta(days=days)
        self.rotation_schedule[key_id] = rotation_date
        
        # 실제 프로덕션에서는 cron job이나 스케줄러 사용
        print(f"🗺️ {key_id} 로테이션 예약: {rotation_date}")
```

### 2. 다중 레이어 키 보안

```python
class MultiLayerKeySecurity:
    """다중 레이어 키 보안 시스템"""
    
    def __init__(self):
        # Hardware Security Module (HSM) 연결
        self.hsm = HSMClient()
        # Key Management Service (KMS) 연결
        self.kms = AWSKeyManagementService('us-west-2')
        
    def create_master_key_hierarchy(self):
        """마스터 키 계층 구조 생성"""
        
        # Level 1: HSM 루트 키 (Hardware에 저장, 절대 추출 불가)
        hsm_root_key_id = self.hsm.generate_master_key(
            key_type='AES-256',
            extractable=False  # HSM 내부에서만 사용 가능
        )
        
        # Level 2: KMS 커스터머 키 (암호화/복호화 전용)
        kms_cmk_id = self.kms.create_customer_master_key(
            description="Application Master Key"
        )
        
        # Level 3: 데이터 암호화 키 (DEK)
        data_encryption_keys = {
            'user_data': self.generate_dek('user-data-encryption'),
            'payment_data': self.generate_dek('payment-data-encryption'),
            'logs_data': self.generate_dek('logs-data-encryption')
        }
        
        return {
            'hsm_root': hsm_root_key_id,
            'kms_cmk': kms_cmk_id,
            'deks': data_encryption_keys
        }
    
    def secure_key_derivation(self, master_key: bytes, context: str) -> bytes:
        """안전한 키 유도 (HKDF 사용)"""
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF
        from cryptography.hazmat.primitives import hashes
        
        # HKDF로 안전하게 키 유도
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,  # 256비트 키
            salt=None,
            info=context.encode(),  # 컨텍스트 정보
        )
        
        derived_key = hkdf.derive(master_key)
        return derived_key
```

## 핵심 요점

### 1. 전문적 키 관리 서비스 활용

AWS KMS와 같은 관리형 서비스를 통해 Envelope Encryption 패턴으로 안전하고 효율적인 키 관리 구현

### 2. E2E 암호화의 핵심 원리

Signal Protocol의 Double Ratchet 알고리즘을 통해 Perfect Forward Secrecy와 Post-Compromise Security 보장

### 3. 키 라이프사이클 관리

자동화된 키 로테이션과 다중 레이어 보안 아키텍처로 키 노출 위험 최소화

---

**이전**: [05B 실전 암호화 구현](05b-practical-encryption.md)  
**다음**: [05D 성능 최적화와 보안](05d-performance-security.md)에서 하드웨어 가속과 보안 모범 사례를 학습합니다.
