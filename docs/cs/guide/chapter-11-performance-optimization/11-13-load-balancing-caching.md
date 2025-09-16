---
tags:
  - deep-study
  - hands-on
  - intermediate
  - load_balancing
  - nginx_optimization
  - performance_monitoring
  - redis_caching
  - system_tuning
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "6-8시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# 11.5d 로드 밸런싱과 캐싱 전략

로드 밸런싱과 캐싱은 대규모 시스템의 성능과 확장성을 보장하는 핵심 기술입니다. 적절한 로드 밸런싱 전략과 캐싱 시스템을 통해 전체적인 시스템 처리량을 극대화할 수 있습니다.

## Nginx 로드 밸런서 최적화

```nginx
# nginx_optimization.conf - Nginx 성능 최적화 설정

# ============ 전역 설정 ============
user nginx;
worker_processes auto;                    # CPU 코어 수만큼 자동 설정
worker_rlimit_nofile 65535;              # 파일 디스크립터 한계

error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 4096;              # worker당 최대 연결 수
    use epoll;                           # Linux에서 가장 효율적
    multi_accept on;                     # 한 번에 여러 연결 수락
    accept_mutex off;                    # 연결 분산을 위해 비활성화
}

http {
    # ============ 기본 설정 ============
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    # ============ 로깅 최적화 ============
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                   '$status $body_bytes_sent "$http_referer" '
                   '"$http_user_agent" $request_time $upstream_response_time';
    
    # 로그 버퍼링으로 I/O 최적화
    access_log /var/log/nginx/access.log main buffer=64k flush=5s;
    
    # ============ 성능 최적화 ============
    sendfile on;                         # 커널에서 직접 파일 전송
    tcp_nopush on;                       # sendfile과 함께 사용
    tcp_nodelay on;                      # keep-alive 연결에서 지연 없애기
    
    keepalive_timeout 30s;               # Keep-alive 연결 유지 시간
    keepalive_requests 1000;             # Keep-alive 연결당 최대 요청 수
    
    # ============ 압축 설정 ============
    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_comp_level 6;
    gzip_types
        application/atom+xml
        application/geo+json
        application/javascript
        application/x-javascript
        application/json
        application/ld+json
        application/manifest+json
        application/rdf+xml
        application/rss+xml
        application/xhtml+xml
        application/xml
        font/eot
        font/otf
        font/ttf
        image/svg+xml
        text/css
        text/javascript
        text/plain
        text/xml;
    
    # ============ 버퍼 크기 최적화 ============
    client_body_buffer_size 16k;
    client_header_buffer_size 1k;
    client_max_body_size 8m;
    large_client_header_buffers 4 16k;
    
    # ============ 타임아웃 설정 ============
    client_body_timeout 12s;
    client_header_timeout 12s;
    send_timeout 10s;
    
    # ============ 업스트림 서버 정의 ============
    upstream app_servers {
        # 로드 밸런싱 방식
        least_conn;                      # 최소 연결 방식
        
        # 백엔드 서버들
        server 192.168.1.10:8080 max_fails=3 fail_timeout=30s weight=3;
        server 192.168.1.11:8080 max_fails=3 fail_timeout=30s weight=3;
        server 192.168.1.12:8080 max_fails=3 fail_timeout=30s weight=2;
        
        # 연결 풀링
        keepalive 32;                    # 업스트림과의 연결 유지
        keepalive_requests 100;
        keepalive_timeout 60s;
    }
    
    # ============ 캐싱 설정 ============
    proxy_cache_path /var/cache/nginx/app
                     levels=1:2
                     keys_zone=app_cache:10m
                     max_size=1g
                     inactive=60m
                     use_temp_path=off;
    
    server {
        listen 80 default_server reuseport;
        server_name _;
        
        # ============ 정적 파일 최적화 ============
        location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            add_header Vary Accept-Encoding;
            
            # 정적 파일은 직접 서빙
            root /var/www/html;
        }
        
        # ============ API 프록시 설정 ============
        location /api/ {
            # 프록시 헤더 설정
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # 연결 재사용
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            
            # 타임아웃 설정
            proxy_connect_timeout 5s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
            
            # 버퍼 설정
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;
            proxy_busy_buffers_size 8k;
            
            # 캐싱 설정 (적절한 경우에만)
            proxy_cache app_cache;
            proxy_cache_valid 200 302 10m;
            proxy_cache_valid 404 1m;
            proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
            proxy_cache_background_update on;
            proxy_cache_lock on;
            
            # 업스트림으로 전달
            proxy_pass http://app_servers;
        }
        
        # ============ 헬스 체크 ============
        location /nginx-health {
            access_log off;
            return 200 "healthy, ";
            add_header Content-Type text/plain;
        }
        
        # ============ 보안 헤더 ============
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;
        
        # 서버 정보 숨기기
        server_tokens off;
    }
}
```

## Redis 캐싱 최적화

```python
# redis_optimization.py - Redis 캐싱 최적화
import redis
import time
import json
import hashlib
from typing import Any, Optional, Callable
import functools
import asyncio
import aioredis
import logging

class OptimizedRedisCache:
    def __init__(self, 
                 host='localhost', 
                 port=6379, 
                 db=0,
                 max_connections=50,
                 connection_pool_class=redis.BlockingConnectionPool):
        
        # 연결 풀 최적화
        self.pool = connection_pool_class(
            host=host,
            port=port,
            db=db,
            max_connections=max_connections,
            retry_on_timeout=True,
            health_check_interval=30,
            socket_keepalive=True,
            socket_keepalive_options={
                1: 1,  # TCP_KEEPIDLE
                2: 3,  # TCP_KEEPINTVL  
                3: 5,  # TCP_KEEPCNT
            }
        )
        
        self.redis_client = redis.Redis(connection_pool=self.pool)
        
        # 캐시 통계
        self.stats = {
            'hits': 0,
            'misses': 0,
            'errors': 0
        }
        
        logging.info(f"Redis 캐시 초기화: {host}:{port}")
    
    def _make_key(self, prefix: str, *args, **kwargs) -> str:
        """캐시 키 생성"""
        key_parts = [prefix]
        key_parts.extend(str(arg) for arg in args)
        key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
        
        key_string = ":".join(key_parts)
        
        # 긴 키는 해시로 축약
        if len(key_string) > 200:
            key_hash = hashlib.md5(key_string.encode()).hexdigest()
            return f"{prefix}:hash:{key_hash}"
        
        return key_string
    
    def cache_result(self, 
                    prefix: str, 
                    ttl: int = 3600,
                    serialize_func: Callable = json.dumps,
                    deserialize_func: Callable = json.loads):
        """결과 캐싱 데코레이터"""
        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                cache_key = self._make_key(prefix, *args, **kwargs)
                
                try:
                    # 캐시에서 조회
                    cached_result = self.redis_client.get(cache_key)
                    
                    if cached_result is not None:
                        self.stats['hits'] += 1
                        logging.debug(f"캐시 히트: {cache_key}")
                        return deserialize_func(cached_result)
                    
                    # 캐시 미스 - 함수 실행
                    self.stats['misses'] += 1
                    result = func(*args, **kwargs)
                    
                    # 결과 캐싱
                    serialized_result = serialize_func(result)
                    self.redis_client.setex(cache_key, ttl, serialized_result)
                    
                    logging.debug(f"캐시 저장: {cache_key}")
                    return result
                    
                except Exception as e:
                    self.stats['errors'] += 1
                    logging.error(f"캐시 오류: {e}")
                    # 캐시 오류 시에도 함수는 정상 실행
                    return func(*args, **kwargs)
            
            return wrapper
        return decorator
    
    def bulk_cache_results(self, items: dict, prefix: str, ttl: int = 3600):
        """대량 캐시 저장 (파이프라인 사용)"""
        pipeline = self.redis_client.pipeline()
        
        for key, value in items.items():
            cache_key = self._make_key(prefix, key)
            serialized_value = json.dumps(value)
            pipeline.setex(cache_key, ttl, serialized_value)
        
        pipeline.execute()
        logging.info(f"대량 캐시 저장: {len(items)}개 아이템")
    
    def get_cache_stats(self):
        """캐시 통계 반환"""
        total_requests = self.stats['hits'] + self.stats['misses']
        hit_rate = (self.stats['hits'] / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'hit_rate': f"{hit_rate:.2f}%",
            'hits': self.stats['hits'],
            'misses': self.stats['misses'],
            'errors': self.stats['errors'],
            'total_requests': total_requests
        }
    
    def warm_up_cache(self, warm_up_func: Callable):
        """캐시 웜업"""
        start_time = time.time()
        warm_up_func()
        duration = time.time() - start_time
        
        logging.info(f"캐시 웜업 완료: {duration:.2f}초")

# 사용 예제
cache = OptimizedRedisCache(max_connections=100)

@cache.cache_result("user_profile", ttl=1800)  # 30분 캐싱
def get_user_profile(user_id: int):
    """사용자 프로필 조회 (DB에서)"""
    # 실제로는 DB 조회
    time.sleep(0.1)  # DB 조회 시뮤레이션
    return {
        'user_id': user_id,
        'name': f'User {user_id}',
        'email': f'user{user_id}@example.com'
    }

@cache.cache_result("expensive_calculation", ttl=7200)  # 2시간 캐싱
def expensive_calculation(n: int):
    """비용이 많이 드는 계산"""
    time.sleep(1)  # 계산 시뮤레이션
    return sum(i * i for i in range(n))

def benchmark_cache_performance():
    """캐시 성능 벤치마크"""
    print("=== 캐시 성능 벤치마크 ===")
    
    # 첫 번째 호출 (캐시 미스)
    start = time.time()
    for i in range(100):
        get_user_profile(i % 10)  # 10명의 사용자를 반복 조회
    first_run = time.time() - start
    
    # 두 번째 호출 (캐시 히트)
    start = time.time()
    for i in range(100):
        get_user_profile(i % 10)
    second_run = time.time() - start
    
    print(f"첫 번째 실행 (캐시 미스): {first_run:.3f}초")
    print(f"두 번째 실행 (캐시 히트): {second_run:.3f}초")
    print(f"성능 향상: {first_run / second_run:.1f}배")
    
    # 캐시 통계 출력
    stats = cache.get_cache_stats()
    print(f"캐시 통계: {stats}")

if __name__ == "__main__":
    benchmark_cache_performance()
```

## 시스템 성능 종합 모니터링

### 통합 성능 대시보드

```python
# performance_dashboard.py - 성능 모니터링 대시보드
import psutil
import time
import json
import threading
from datetime import datetime, timedelta
from collections import deque, defaultdict
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from typing import Dict, List, Deque

class SystemPerformanceMonitor:
    def __init__(self, history_size: int = 300):  # 5분간 데이터 (1초 간격)
        self.history_size = history_size
        
        # 성능 데이터 히스토리
        self.cpu_history: Deque[float] = deque(maxlen=history_size)
        self.memory_history: Deque[float] = deque(maxlen=history_size)
        self.disk_io_history: Deque[Dict] = deque(maxlen=history_size)
        self.network_io_history: Deque[Dict] = deque(maxlen=history_size)
        self.timestamps: Deque[datetime] = deque(maxlen=history_size)
        
        # 프로세스별 리소스 사용량
        self.process_stats: Dict[str, Dict] = {}
        
        # 알림 임계값
        self.thresholds = {
            'cpu': 80.0,
            'memory': 85.0,
            'disk_io': 90.0,
            'network_io': 80.0
        }
        
        # 모니터링 상태
        self.monitoring = False
        self.monitor_thread = None
        
        print("시스템 성능 모니터 초기화 완료")
    
    def start_monitoring(self):
        """모니터링 시작"""
        if not self.monitoring:
            self.monitoring = True
            self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self.monitor_thread.start()
            print("성능 모니터링 시작")
    
    def stop_monitoring(self):
        """모니터링 중지"""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join()
        print("성능 모니터링 중지")
    
    def get_current_stats(self) -> Dict:
        """현재 시스템 통계 반환"""
        if not self.cpu_history:
            return {}
        
        # 최근 1분간 평균
        recent_size = min(60, len(self.cpu_history))
        
        return {
            'timestamp': datetime.now().isoformat(),
            'cpu': {
                'current': self.cpu_history[-1],
                'avg_1min': sum(list(self.cpu_history)[-recent_size:]) / recent_size,
                'cores': psutil.cpu_count()
            },
            'memory': {
                'current': self.memory_history[-1],
                'avg_1min': sum(list(self.memory_history)[-recent_size:]) / recent_size,
                'total_gb': psutil.virtual_memory().total / (1024**3)
            },
            'disk_io': {
                'total_read_mb': sum(io.get('read_bytes', 0) for io in self.disk_io_history) / (1024**2),
                'total_write_mb': sum(io.get('write_bytes', 0) for io in self.disk_io_history) / (1024**2),
            },
            'network_io': {
                'total_sent_mb': sum(io.get('bytes_sent', 0) for io in self.network_io_history) / (1024**2),
                'total_recv_mb': sum(io.get('bytes_recv', 0) for io in self.network_io_history) / (1024**2),
            },
            'top_processes': self.process_stats
        }
    
    def generate_report(self, duration_minutes: int = 5) -> str:
        """성능 리포트 생성"""
        stats = self.get_current_stats()
        if not stats:
            return "데이터 없음"
        
        report = f"""
=== 시스템 성능 리포트 ({duration_minutes}분간) ===
생성 시간: {stats['timestamp']}

🖥️  CPU:
   현재: {stats['cpu']['current']:.1f}%
   평균: {stats['cpu']['avg_1min']:.1f}%
   코어: {stats['cpu']['cores']}개

🧠 메모리:
   현재: {stats['memory']['current']:.1f}%
   평균: {stats['memory']['avg_1min']:.1f}%
   총량: {stats['memory']['total_gb']:.1f}GB

💾 디스크 I/O:
   읽기: {stats['disk_io']['total_read_mb']:.1f}MB
   쓰기: {stats['disk_io']['total_write_mb']:.1f}MB

🌐 네트워크 I/O:
   송신: {stats['network_io']['total_sent_mb']:.1f}MB
   수신: {stats['network_io']['total_recv_mb']:.1f}MB

🔥 리소스 집약적 프로세스:
"""
        
        for process_name, proc_stats in list(stats['top_processes'].items())[:5]:
            report += f"   {process_name}: CPU {proc_stats['cpu_percent']:.1f}%, MEM {proc_stats['memory_percent']:.1f}%, "
        
        return report

def main():
    # 성능 모니터 생성 및 시작
    monitor = SystemPerformanceMonitor()
    monitor.start_monitoring()
    
    try:
        # 5분간 모니터링
        print("5분간 시스템 성능을 모니터링합니다...")
        time.sleep(300)  # 5분
        
        # 리포트 생성
        print(monitor.generate_report())
        
    except KeyboardInterrupt:
        print(", 모니터링을 중단합니다.")
    
    finally:
        monitor.stop_monitoring()

if __name__ == "__main__":
    main()
```

## 핵심 요점

### 1. 로드 밸런싱 전략 최적화

업스트림 서버 간 트래픽 분산, 헬스 체크, 연결 풀링을 통한 전체적인 시스템 안정성 향상

### 2. 다층 캐싱 아키텍처

Nginx 프록시 캐시, Redis 데이터 캐시, 애플리케이션 레벨 캐시를 조합한 종합적 성능 최적화

### 3. 실시간 성능 대시보드

시스템 리소스 사용률, 캐시 히트율, 로드 밸런싱 상태를 통합 모니터링하여 전체적인 시스템 상태 파악

---

**이전**: [11-38-application-optimization.md](11-38-application-optimization.md)  
**다음**: 다음 단계는 전체 시스템 튜닝 가이드의 [11-36-system-tuning.md](11-36-system-tuning.md)에서 종합적인 내용을 확인하세요.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 6-8시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-11-performance-optimization)

- [Chapter 11-1: 성능 분석 방법론](./11-30-performance-methodology.md)
- [11.2 CPU 성능 최적화](./11-31-cpu-optimization.md)
- [11.3 메모리 성능 최적화](./11-32-memory-optimization.md)
- [11.3a 메모리 계층구조와 캐시 최적화](./11-10-memory-hierarchy-cache.md)
- [11.3b 메모리 할당 최적화](./11-11-memory-allocation.md)

### 🏷️ 관련 키워드

`load_balancing`, `nginx_optimization`, `redis_caching`, `performance_monitoring`, `system_tuning`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
