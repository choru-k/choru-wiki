---
tags:
  - AWS
  - CloudFront
  - Performance
  - Optimization
---

# CloudFront 최적화: 캐싱 전략과 성능 극대화

## 🎯 TikTok의 바이럴 동영상 챌린지

### 2021년 Sea Shanty 열풍

```text
📅 2021년 1월, #SeaShanty 챌린지
🎵 Nathan Evans의 Wellerman
📈 24시간 만에 1억 뷰
🌍 190개국 동시 접속
📱 초당 업로드: 10,000개 영상
```

TikTok의 인프라 팀은 예상치 못한 트래픽 폭증에 직면했습니다:

-**1시간**: 평소 대비 100배 트래픽
-**2시간**: CDN 캐시 미스율 급증
-**3시간**: Origin 서버 CPU 90%
-**4시간**: 긴급 CloudFront 최적화 적용

**"올바른 캐싱 전략 없이는 바이럴 콘텐츠가 서비스를 죽일 수 있다."**

## 🎨 캐싱 전략 마스터하기

### Cache Behavior 최적화

```python
class CacheBehaviorOptimization:
    def __init__(self):
        self.behaviors = []

    def create_optimized_behaviors(self):
        """
        콘텐츠 타입별 최적화된 Cache Behavior
        """
        return [
            {
                "path_pattern": "/api/*",
                "target_origin": "api-origin",
                "cache_policy": {
                    "min_ttl": 0,
                    "default_ttl": 0,
                    "max_ttl": 0,
                    "forward_headers": ["Authorization", "Accept", "Content-Type"],
                    "forward_cookies": "all",
                    "forward_query_strings": True
                },
                "compress": True,
                "viewer_protocol": "https-only"
            },

            {
                "path_pattern": "/static/*",
                "target_origin": "s3-origin",
                "cache_policy": {
                    "min_ttl": 86400,      # 1 day
                    "default_ttl": 604800,   # 7 days
                    "max_ttl": 31536000,    # 1 year
                    "forward_headers": [],
                    "forward_cookies": "none",
                    "forward_query_strings": False
                },
                "compress": True,
                "viewer_protocol": "redirect-to-https"
            },

            {
                "path_pattern": "/media/videos/*",
                "target_origin": "media-origin",
                "cache_policy": {
                    "min_ttl": 3600,        # 1 hour
                    "default_ttl": 86400,    # 1 day
                    "max_ttl": 604800,      # 7 days
                    "forward_headers": ["Range", "If-Range"],
                    "forward_cookies": "none",
                    "forward_query_strings": ["quality", "format"]
                },
                "compress": False,  # 비디오는 이미 압축됨
                "smooth_streaming": True,
                "trusted_signers": ["self"]
            },

            {
                "path_pattern": "/live/*",
                "target_origin": "live-origin",
                "cache_policy": {
                    "min_ttl": 0,
                    "default_ttl": 2,        # 2초 (라이브 스트리밍)
                    "max_ttl": 10,
                    "forward_headers": ["Origin", "Access-Control-Request-Method"],
                    "forward_cookies": "none",
                    "forward_query_strings": True
                },
                "compress": False,
                "smooth_streaming": True
            }
        ]
```

### Cache Key 최적화

```python
class CacheKeyOptimization:
    def __init__(self):
        self.metrics = {
            "before": {"unique_keys": 1000000, "hit_rate": 0.45},
            "after": {"unique_keys": 10000, "hit_rate": 0.95}
        }

    def optimize_cache_key(self, request):
        """
        Cache Key 최소화로 히트율 극대화
        """
        # 나쁜 예: 모든 파라미터 포함
        bad_cache_key = {
            "url": "/video.mp4",
            "query_params": {
                "user_id": "12345",        # 불필요
                "timestamp": "1640000000",  # 불필요
                "session": "abc123",        # 불필요
                "quality": "720p",          # 필요
                "format": "mp4"             # 필요
            },
            "headers": {
                "User-Agent": "Mozilla/5.0...",  # 불필요
                "Accept-Language": "en-US",      # 상황에 따라
                "Cookie": "session=xyz"          # 불필요
            }
        }

        # 좋은 예: 필수 파라미터만
        good_cache_key = {
            "url": "/video.mp4",
            "query_params": {
                "quality": "720p",
                "format": "mp4"
            },
            "headers": {}  # 헤더 제외
        }

        return {
            "bad_key_variations": 1000000,  # 사용자 × 타임스탬프 × 세션
            "good_key_variations": 10,      # 품질(5) × 포맷(2)
            "cache_hit_improvement": "95%"
        }
```

## 🚀 성능 최적화 기법

### HTTP/2와 HTTP/3 활용

```python
class ProtocolOptimization:
    def __init__(self):
        self.protocols = {
            "http1.1": {
                "multiplexing": False,
                "header_compression": False,
                "server_push": False,
                "connection_limit": 6
            },
            "http2": {
                "multiplexing": True,
                "header_compression": "HPACK",
                "server_push": True,
                "stream_limit": 128,
                "benefits": [
                    "단일 연결로 다중 요청",
                    "헤더 압축으로 오버헤드 감소",
                    "우선순위 지정 가능"
                ]
            },
            "http3": {
                "transport": "QUIC (UDP)",
                "multiplexing": True,
                "header_compression": "QPACK",
                "0rtt": True,
                "benefits": [
                    "연결 설정 시간 단축",
                    "패킷 손실에 강함",
                    "모바일 네트워크 최적화"
                ]
            }
        }

    def connection_optimization(self):
        """
        프로토콜별 연결 최적화
        """
        return {
            "http2_settings": {
                "initial_window_size": 65535,
                "max_concurrent_streams": 128,
                "max_frame_size": 16384,
                "header_table_size": 4096
            },

            "http3_settings": {
                "max_idle_timeout": 30000,  # 30초
                "max_udp_payload_size": 1200,
                "initial_max_data": 10485760,  # 10MB
                "initial_max_stream_data": 1048576  # 1MB
            },

            "performance_gains": {
                "http1_to_http2": "15-30% 개선",
                "http2_to_http3": "10-20% 추가 개선",
                "mobile_improvement": "30-50% (HTTP/3)"
            }
        }
```

### 압축 최적화

```python
class CompressionOptimization:
    def __init__(self):
        self.compression_types = ["gzip", "br"]  # Brotli

    def configure_compression(self):
        """
        콘텐츠별 압축 설정
        """
        compression_rules = {
            "text_content": {
                "mime_types": [
                    "text/html",
                    "text/css",
                    "text/javascript",
                    "application/json",
                    "application/xml"
                ],
                "algorithm": "br",  # Brotli
                "level": 11,  # 최대 압축
                "avg_reduction": "70-80%"
            },

            "javascript": {
                "mime_types": ["application/javascript"],
                "algorithm": "br",
                "level": 11,
                "avg_reduction": "60-70%"
            },

            "images": {
                "mime_types": ["image/svg+xml"],
                "algorithm": "gzip",
                "level": 9,
                "avg_reduction": "50-60%",
                "note": "JPEG/PNG는 이미 압축됨"
            },

            "fonts": {
                "mime_types": ["font/woff", "font/woff2"],
                "algorithm": "none",
                "reason": "WOFF2는 이미 Brotli 압축"
            },

            "video_audio": {
                "mime_types": ["video/*", "audio/*"],
                "algorithm": "none",
                "reason": "미디어 코덱이 이미 압축"
            }
        }

        return compression_rules

    def measure_compression_benefit(self, content_type, size_bytes):
        """
        압축 효과 측정
        """
        compression_ratios = {
            "html": 0.25,      # 75% 감소
            "css": 0.20,       # 80% 감소
            "javascript": 0.30, # 70% 감소
            "json": 0.15,      # 85% 감소
            "xml": 0.20        # 80% 감소
        }

        if content_type in compression_ratios:
            compressed_size = size_bytes * compression_ratios[content_type]
            savings = size_bytes - compressed_size

            return {
                "original_size": size_bytes,
                "compressed_size": compressed_size,
                "savings": savings,
                "reduction_percent": (savings / size_bytes) * 100
            }
```

## 🎯 Lambda@Edge 최적화

### 동적 콘텐츠 처리

```python
class LambdaEdgeOptimization:
    def __init__(self):
        self.edge_locations = 450
        self.execution_limit = "5 seconds (viewer), 30 seconds (origin)"

    def viewer_request_handler(self, event):
        """
        Viewer Request에서 실행되는 Lambda@Edge
        """
        request = event['Records'][0]['cf']['request']

        # 1. 디바이스 감지 및 리다이렉트
        headers = request['headers']
        user_agent = headers.get('user-agent', [{}])[0].get('value', '')

        if self.is_mobile(user_agent):
            request['uri'] = '/mobile' + request['uri']

        # 2. A/B 테스트
        cookie = headers.get('cookie', [{}])[0].get('value', '')
        if 'experiment=B' in cookie:
            request['headers']['x-experiment'] = [{'key': 'X-Experiment', 'value': 'B'}]

        # 3. 지역별 콘텐츠
        country = headers.get('cloudfront-viewer-country', [{}])[0].get('value', '')
        if country == 'KR':
            request['uri'] = '/kr' + request['uri']

        # 4. 보안 헤더 추가
        request['headers']['x-frame-options'] = [{'key': 'X-Frame-Options', 'value': 'DENY'}]

        return request

    def origin_response_handler(self, event):
        """
        Origin Response에서 실행되는 Lambda@Edge
        """
        response = event['Records'][0]['cf']['response']

        # 1. 보안 헤더 추가
        response['headers']['strict-transport-security'] = [{
            'key': 'Strict-Transport-Security',
            'value': 'max-age=31536000; includeSubDomains'
        }]

        response['headers']['content-security-policy'] = [{
            'key': 'Content-Security-Policy',
            'value': "default-src 'self'"
        }]

        # 2. 이미지 최적화
        request = event['Records'][0]['cf']['request']
        if request['uri'].endswith(('.jpg', '.jpeg', '.png')):
            # WebP 지원 브라우저 확인
            accept = request['headers'].get('accept', [{}])[0].get('value', '')
            if 'image/webp' in accept:
                response['headers']['vary'] = [{'key': 'Vary', 'value': 'Accept'}]
                # Origin에서 WebP 버전 제공하도록 수정

        # 3. 동적 캐싱 TTL
        if response['status'] == '200':
            content_type = response['headers'].get('content-type', [{}])[0].get('value', '')
            if 'application/json' in content_type:
                response['headers']['cache-control'] = [{
                    'key': 'Cache-Control',
                    'value': 'max-age=60, stale-while-revalidate=3600'
                }]

        return response
```

### 엣지 컴퓨팅 패턴

```python
class EdgeComputingPatterns:
    def __init__(self):
        self.patterns = {
            "api_gateway": self.api_gateway_at_edge,
            "auth": self.authentication_at_edge,
            "personalization": self.content_personalization,
            "optimization": self.resource_optimization
        }

    def api_gateway_at_edge(self, event):
        """
        엣지에서 API Gateway 구현
        """
        request = event['Records'][0]['cf']['request']
        uri = request['uri']
        method = request['method']

        # API 라우팅
        routes = {
            ('GET', '/api/users'): 'user-service.example.com',
            ('POST', '/api/orders'): 'order-service.example.com',
            ('GET', '/api/products'): 'product-service.example.com'
        }

        route_key = (method, uri.split('?')[0])
        if route_key in routes:
            # Origin 변경
            request['origin'] = {
                'custom': {
                    'domainName': routes[route_key],
                    'port': 443,
                    'protocol': 'https'
                }
            }

            # Rate Limiting
            client_ip = request['clientIp']
            if self.check_rate_limit(client_ip):
                return {
                    'status': '429',
                    'statusDescription': 'Too Many Requests',
                    'body': 'Rate limit exceeded'
                }

        return request

    def authentication_at_edge(self, event):
        """
        엣지에서 인증 처리
        """
        import jwt
        import time

        request = event['Records'][0]['cf']['request']
        headers = request['headers']

        # JWT 토큰 확인
        auth_header = headers.get('authorization', [{}])[0].get('value', '')

        if not auth_header.startswith('Bearer '):
            return {
                'status': '401',
                'statusDescription': 'Unauthorized',
                'body': 'Missing authentication token'
            }

        token = auth_header[7:]  # Remove 'Bearer '

        try:
            # JWT 검증
            payload = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=['HS256']
            )

            # 만료 시간 확인
            if payload['exp'] < time.time():
                return {
                    'status': '401',
                    'statusDescription': 'Unauthorized',
                    'body': 'Token expired'
                }

            # 사용자 정보를 헤더에 추가
            request['headers']['x-user-id'] = [{'key': 'X-User-Id', 'value': str(payload['user_id'])}]
            request['headers']['x-user-role'] = [{'key': 'X-User-Role', 'value': payload['role']}]

        except jwt.InvalidTokenError:
            return {
                'status': '401',
                'statusDescription': 'Unauthorized',
                'body': 'Invalid token'
            }

        return request
```

## 📊 캐시 분석과 모니터링

### 캐시 효율성 메트릭

```python
class CacheAnalytics:
    def __init__(self):
        self.metrics = {
            "hit_rate": 0,
            "byte_hit_rate": 0,
            "origin_bandwidth": 0,
            "edge_requests": 0
        }

    def analyze_cache_performance(self, logs):
        """
        캐시 성능 분석
        """
        total_requests = len(logs)
        cache_hits = 0
        cache_misses = 0
        bytes_from_cache = 0
        bytes_from_origin = 0

        for log in logs:
            result_type = log['x-edge-result-type']
            bytes_sent = int(log['sc-bytes'])

            if result_type in ['Hit', 'RefreshHit', 'OriginShieldHit']:
                cache_hits += 1
                bytes_from_cache += bytes_sent
            else:
                cache_misses += 1
                bytes_from_origin += bytes_sent

        # 캐시 히트율 계산
        hit_rate = (cache_hits / total_requests) * 100
        byte_hit_rate = (bytes_from_cache / (bytes_from_cache + bytes_from_origin)) * 100

        # Popular Objects 분석
        popular_objects = self.find_popular_objects(logs)

        # 캐시 미스 원인 분석
        miss_reasons = self.analyze_cache_misses(logs)

        return {
            "hit_rate": f"{hit_rate:.2f}%",
            "byte_hit_rate": f"{byte_hit_rate:.2f}%",
            "origin_bandwidth_saved": bytes_from_cache,
            "popular_objects": popular_objects[:10],
            "miss_reasons": miss_reasons,
            "recommendations": self.generate_recommendations(hit_rate, miss_reasons)
        }

    def generate_recommendations(self, hit_rate, miss_reasons):
        """
        최적화 권장사항 생성
        """
        recommendations = []

        if hit_rate < 80:
            recommendations.append("캐시 TTL 증가 검토")

        if miss_reasons.get('expired', 0) > 30:
            recommendations.append("Stale-while-revalidate 헤더 사용")

        if miss_reasons.get('no_cache', 0) > 20:
            recommendations.append("Cache-Control 헤더 재검토")

        if miss_reasons.get('vary_header', 0) > 10:
            recommendations.append("Vary 헤더 최소화")

        return recommendations
```

## 💰 비용 최적화

### Price Class 전략

```python
class PriceClassOptimization:
    def __init__(self):
        self.price_classes = {
            "PriceClass_All": {
                "edges": 450,
                "regions": "All",
                "cost": 1.0,
                "performance": "Best globally"
            },
            "PriceClass_200": {
                "edges": 400,
                "regions": "Excludes South America, Australia",
                "cost": 0.85,
                "performance": "Good for most users"
            },
            "PriceClass_100": {
                "edges": 100,
                "regions": "US, Canada, Europe only",
                "cost": 0.70,
                "performance": "Best for US/EU audience"
            }
        }

    def recommend_price_class(self, user_distribution):
        """
        사용자 분포에 따른 Price Class 추천
        """
        # 지역별 사용자 비율
        us_eu_percentage = (
            user_distribution.get('US', 0) +
            user_distribution.get('CA', 0) +
            user_distribution.get('EU', 0)
        )

        if us_eu_percentage > 90:
            return {
                "recommendation": "PriceClass_100",
                "reason": "90% 이상이 US/EU 사용자",
                "cost_saving": "30%",
                "performance_impact": "Minimal"
            }
        elif us_eu_percentage > 70:
            return {
                "recommendation": "PriceClass_200",
                "reason": "주요 사용자가 US/EU/Asia",
                "cost_saving": "15%",
                "performance_impact": "Low"
            }
        else:
            return {
                "recommendation": "PriceClass_All",
                "reason": "글로벌 사용자 분포",
                "cost_saving": "0%",
                "performance_impact": "None"
            }
```

### Origin Request 최소화

```python
class OriginRequestOptimization:
    def reduce_origin_requests(self):
        """
        Origin 요청 감소 전략
        """
        strategies = {
            "increase_ttl": {
                "static_content": {
                    "before": "max-age=3600",  # 1시간
                    "after": "max-age=31536000, immutable",  # 1년
                    "impact": "99% Origin 요청 감소"
                },

                "api_responses": {
                    "before": "no-cache",
                    "after": "max-age=60, stale-while-revalidate=300",
                    "impact": "80% Origin 요청 감소"
                }
            },

            "origin_shield": {
                "enabled": True,
                "location": "us-east-1",
                "cache_hit_rate": "99%",
                "cost": "$0.01 per 10,000 requests",
                "savings": "95% Origin 대역폭 절감"
            },

            "error_caching": {
                "4xx_errors": {
                    "ttl": 300,  # 5분
                    "benefit": "잘못된 요청 반복 방지"
                },
                "5xx_errors": {
                    "ttl": 60,   # 1분
                    "benefit": "Origin 과부하 방지"
                }
            }
        }

        return strategies
```

## 🚨 실전 트러블슈팅

### Case 1: 동영상 버퍼링

```python
def troubleshoot_video_buffering():
    """
    동영상 스트리밍 최적화
    """
    solutions = {
        "range_requests": {
            "enable": True,
            "forward_headers": ["Range", "If-Range"],
            "benefit": "부분 콘텐츠 요청 지원"
        },

        "segment_size": {
            "hls": "10 seconds per segment",
            "dash": "4 seconds per segment",
            "optimization": "작은 세그먼트로 빠른 시작"
        },

        "adaptive_bitrate": {
            "qualities": ["360p", "480p", "720p", "1080p", "4K"],
            "manifest": "Dynamic based on bandwidth",
            "cdn_behavior": "Cache each quality separately"
        },

        "prefetching": {
            "next_segments": 3,
            "implementation": "Client-side prefetch",
            "cache_warming": "Popular content pre-load"
        }
    }

    return solutions
```

### Case 2: 모바일 성능 저하

```python
class MobileOptimization:
    def optimize_for_mobile(self):
        """
        모바일 최적화 전략
        """
        return {
            "image_optimization": {
                "responsive_images": {
                    "srcset": "Multiple resolutions",
                    "webp_conversion": "40% smaller",
                    "lazy_loading": "Intersection Observer"
                }
            },

            "connection_optimization": {
                "http3_quic": {
                    "benefit": "Better on cellular",
                    "0rtt": "Instant reconnection",
                    "packet_loss_resilience": "No head-of-line blocking"
                }
            },

            "bandwidth_detection": {
                "network_information_api": True,
                "adaptive_quality": {
                    "4g": "High quality",
                    "3g": "Medium quality",
                    "2g": "Low quality"
                }
            },

            "service_worker_cache": {
                "strategy": "Cache first, network fallback",
                "offline_support": True,
                "background_sync": True
            }
        }
```

### Case 3: CORS 에러

```python
def handle_cors_issues():
    """
    CORS 문제 해결
    """
    cors_configuration = {
        "allowed_origins": [
            "https://example.com",
            "https://app.example.com"
        ],

        "allowed_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],

        "allowed_headers": [
            "Content-Type",
            "Authorization",
            "X-Requested-With"
        ],

        "exposed_headers": [
            "Content-Length",
            "X-Request-Id"
        ],

        "max_age": 86400,  # 24시간

        "cloudfront_config": {
            "forward_headers": [
                "Origin",
                "Access-Control-Request-Method",
                "Access-Control-Request-Headers"
            ],

            "cache_based_on_headers": True,

            "response_headers_policy": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Max-Age": "86400"
            }
        }
    }

    return cors_configuration
```

## 🎯 실시간 스트리밍 최적화

### Live Streaming 설정

```python
class LiveStreamingOptimization:
    def __init__(self):
        self.protocols = ["HLS", "DASH", "CMAF"]

    def optimize_live_streaming(self):
        """
        라이브 스트리밍 최적화
        """
        return {
            "hls_configuration": {
                "segment_duration": 6,  # 초
                "playlist_length": 3,   # 세그먼트 수
                "ttl": {
                    "manifest": 2,       # 초
                    "segments": 3600     # 1시간
                }
            },

            "low_latency_hls": {
                "part_duration": 0.33,   # 초
                "part_hold_back": 3,     # 파트 수
                "can_skip_until": 6,     # 초
                "latency": "2-5 seconds"
            },

            "origin_shield": {
                "benefit": "Single origin request per segment",
                "location": "Closest to encoder",
                "failover": "Multi-origin configuration"
            },

            "edge_optimization": {
                "request_collapsing": True,
                "negative_caching": {
                    "404_ttl": 5,  # 초
                    "503_ttl": 1   # 초
                }
            }
        }
```

## 📈 A/B 테스팅

### CloudFront를 통한 A/B 테스트

```python
class ABTesting:
    def implement_ab_test(self, event):
        """
        Lambda@Edge를 사용한 A/B 테스팅
        """
        import hashlib
        import json

        request = event['Records'][0]['cf']['request']

        # 사용자 식별
        client_ip = request['clientIp']
        user_id = hashlib.md5(client_ip.encode()).hexdigest()

        # 버킷 할당 (50/50 split)
        bucket = 'A' if int(user_id, 16) % 2 == 0 else 'B'

        # 쿠키 설정
        cookie_header = request['headers'].get('cookie', [{}])[0].get('value', '')

        if 'experiment=' not in cookie_header:
            # 새 사용자 - 버킷 할당
            request['headers']['cookie'] = [{
                'key': 'Cookie',
                'value': f'{cookie_header}; experiment={bucket}'
            }]
        else:
            # 기존 사용자 - 버킷 유지
            import re
            match = re.search(r'experiment=([AB])', cookie_header)
            if match:
                bucket = match.group(1)

        # 버킷에 따른 Origin 선택
        if bucket == 'B':
            request['origin'] = {
                's3': {
                    'domainName': 'experiment-b.s3.amazonaws.com',
                    'region': 'us-east-1',
                    'path': '/variant-b'
                }
            }

        # 메트릭 수집
        request['headers']['x-experiment-bucket'] = [{
            'key': 'X-Experiment-Bucket',
            'value': bucket
        }]

        return request
```

## 🎬 마무리: TikTok의 스케일링 성공

2024년 현재, TikTok은 CloudFront 최적화를 통해:

-**캐시 히트율**: 45% → 95% 개선
-**Origin 비용**: 80% 절감
-**글로벌 레이턴시**: 평균 50ms 미만
-**동영상 시작 시간**: 0.5초 미만
-**월간 대역폭 절감**: $2M

**"최적화는 한 번이 아니라 지속적인 과정이다. 모든 바이트와 밀리초가 중요하다."**

---

## 🔗 CloudFront 완벽 가이드 요약

### 핵심 최적화 체크리스트

- [ ] Cache Behavior를 콘텐츠 타입별로 세분화
- [ ] Cache Key 최소화로 히트율 극대화
- [ ] HTTP/3 활성화로 모바일 성능 개선
- [ ] Brotli 압축으로 대역폭 70% 절감
- [ ] Origin Shield로 Origin 보호
- [ ] Lambda@Edge로 동적 처리 엣지 이동
- [ ] 실시간 로그로 지속적 모니터링
- [ ] Price Class 최적화로 비용 절감

AWS CloudFront 섹션이 완성되었습니다!
