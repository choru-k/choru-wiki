---
tags:
  - AWS
  - CloudFront
  - CDN
  - EdgeComputing
  - Performance
---

# CloudFront 깊이 들어가기: Disney+가 1분 만에 1000만 스트림을 시작한 CDN 마법 🚀

## 이 문서를 읽고 나면 답할 수 있는 질문들

- Disney+는 어떻게 출시 첫날 1000만 가입자를 처리했는가?
- CloudFront는 어떻게 0.001초 만에 캐시를 결정하는가?
- Edge Location이 어떻게 오리진 서버를 99% 보호하는가?
- Lambda@Edge가 어떻게 콘텐츠를 실시간으로 변환하는가?
- CloudFront는 어떻게 전 세계 450개 PoP를 동기화하는가?

## 시작하며: 2019년 Disney+ 출시의 기적 🎬

### 넷플릭스를 이기기 위한 Disney의 CDN 전략

2019년 11월 12일, Disney+ 출시일:

```python
# Disney+ 출시 첫날 트래픽 폭발
disney_plus_launch = {
    "date": "2019-11-12",
    "first_hour_signups": "1,000,000",
    "first_day_signups": "10,000,000",
    "concurrent_streams": "3,500,000",
    "peak_bandwidth": "15 Tbps",
    "content_library": "500 titles, 7500 episodes",
    "challenge": "Netflix보다 빠른 스트리밍 경험"
}

# CloudFront 처리 결과
cloudfront_performance = {
    "cache_hit_ratio": "99.7%",
    "average_latency": "8ms",
    "origin_offload": "99%",
    "edge_locations_used": 410,
    "downtime": "0 seconds",
    "cost_per_gb": "$0.085"
}

print("어떻게 CloudFront는 오리진을 죽이지 않고 1000만 스트림을 처리했을까?")
```

## Part 1: CloudFront 아키텍처의 비밀 - 3층 캐시 시스템 🏗️

### Netflix가 부러워하는 AWS의 캐시 아키텍처

```python
class CloudFrontArchitectureRevealed:
    """
    CloudFront의 3층 캐시 아키텍처
    """
    
    def the_three_tier_cache(self):
        """
        2020년 AWS가 공개한 3층 캐시 시스템
        """
        print("🏗️ CloudFront 3층 아키텍처:, ")
        
        architecture = """
        사용자 요청
            ↓
        ┌─────────────────────────────────┐
        │   Tier 1: Edge Locations (450+)  │
        │   - 최종 사용자와 가장 가까움     │
        │   - 10TB 캐시 용량               │
        │   - 인기 콘텐츠 캐싱             │
        └──────────────┬──────────────────┘
                       ↓ Cache Miss
        ┌─────────────────────────────────┐
        │   Tier 2: Regional Edge Cache    │
        │   - 13개 리전별 캐시             │
        │   - 100TB 캐시 용량              │
        │   - 중간 인기도 콘텐츠           │
        └──────────────┬──────────────────┘
                       ↓ Cache Miss
        ┌─────────────────────────────────┐
        │   Tier 3: Origin Shield          │
        │   - 오리진 앞 마지막 방어선       │
        │   - 1PB 캐시 용량                │
        │   - 오리진 부하 99% 감소         │
        └──────────────┬──────────────────┘
                       ↓ Cache Miss
            Origin Server (S3, EC2, ALB)
        """
        
        print(architecture)
        print(", 🎯 각 티어의 역할:, ")
        
        self.tier_responsibilities()
    
    def tier_responsibilities(self):
        """
        각 티어의 상세 역할
        """
        tier_details = """
        1️⃣ Edge Locations (사용자와 평균 10ms):
        ```python
        class EdgeLocation:
            def __init__(self):
                self.cache_size = 10 * TB
                self.hot_cache = LRUCache(size=1*TB)  # 매우 인기있는 콘텐츠
                self.warm_cache = LFUCache(size=9*TB)  # 보통 인기 콘텐츠
                
            def handle_request(self, request):
                # 1. Hot Cache 확인 (0.1ms)
                if self.hot_cache.has(request.key):
                    return self.hot_cache.get(request.key)
                
                # 2. Warm Cache 확인 (0.5ms)
                if self.warm_cache.has(request.key):
                    self.promote_to_hot(request.key)
                    return self.warm_cache.get(request.key)
                
                # 3. Regional Cache로 전달 (5ms)
                return self.forward_to_regional(request)
        ```
        
        2️⃣ Regional Edge Cache (대륙별 허브):
        ```python
        class RegionalEdgeCache:
            def __init__(self, region):
                self.region = region
                self.cache_size = 100 * TB
                self.consistent_hash = ConsistentHashRing()
                
                # 머신러닝 기반 프리페칭
                self.predictor = ContentPredictor(
                    model='DeepCache-v3',
                    accuracy=0.92
                )
            
            def handle_miss(self, request):
                # 1. 예측 프리페칭 확인
                predicted = self.predictor.should_prefetch(request)
                if predicted:
                    self.prefetch_related_content(request)
                
                # 2. 이웃 리전 확인 (Anycast)
                neighbor_regions = self.get_nearby_regions()
                for region in neighbor_regions:
                    if region.has_content(request.key):
                        return region.get_content(request.key)
                
                # 3. Origin Shield로 전달
                return self.forward_to_shield(request)
        ```
        
        3️⃣ Origin Shield (오리진 보호막):
        ```python
        class OriginShield:
            def __init__(self):
                self.cache_size = 1 * PB
                self.collapse_forwarding = True  # 중복 요청 합치기
                self.request_queue = {}
                
            def handle_request(self, request):
                # Request Collapsing - 핵심 기능!
                if request.key in self.request_queue:
                    # 이미 오리진에 요청 중
                    # 기다렸다가 결과 공유
                    return self.wait_for_response(request.key)
                
                # 첫 요청만 오리진으로
                self.request_queue[request.key] = []
                response = self.fetch_from_origin(request)
                
                # 대기 중인 모든 요청에 응답
                for waiting_request in self.request_queue[request.key]:
                    waiting_request.respond(response)
                
                return response
        ```
        """
        
        print(tier_details)
        
        # 캐시 키 생성 로직
        self.cache_key_generation()
    
    def cache_key_generation(self):
        """
        캐시 키 생성 로직
        """
        print(", 🔑 캐시 키 생성 메커니즘:, ")
        
        cache_key_logic = """
        CloudFront 캐시 키 결정 요소:
        
        ```python
        class CacheKeyGenerator:
            def generate_cache_key(self, request):
                '''
                캐시 키 = 어떤 요청을 같은 것으로 볼지 결정
                '''
                key_components = []
                
                # 1. 기본 구성요소
                key_components.append(request.host)        # example.com
                key_components.append(request.path)        # /video/movie.mp4
                
                # 2. 쿼리 스트링 (설정 가능)
                if self.include_query_strings:
                    # 특정 파라미터만 포함 가능
                    for param in self.whitelisted_params:
                        if param in request.query:
                            key_components.append(f"{param}={request.query[param]}")
                
                # 3. 헤더 (설정 가능)
                if self.include_headers:
                    for header in self.whitelisted_headers:
                        if header in request.headers:
                            key_components.append(f"{header}:{request.headers[header]}")
                
                # 4. 쿠키 (설정 가능)  
                if self.include_cookies:
                    for cookie in self.whitelisted_cookies:
                        if cookie in request.cookies:
                            key_components.append(f"{cookie}={request.cookies[cookie]}")
                
                # 5. CloudFront 특수 변수
                if self.use_viewer_country:
                    key_components.append(f"country:{request.cloudfront_viewer_country}")
                
                if self.use_device_type:
                    key_components.append(f"device:{request.cloudfront_is_mobile}")
                
                # SHA-256 해시로 최종 키 생성
                cache_key = hashlib.sha256('|'.join(key_components)).hexdigest()
                
                return cache_key
        ```
        
        예시:
        요청: GET https://cdn.example.com/video/movie.mp4?quality=1080p
        헤더: Accept-Language: ko-KR
        
        캐시 키: sha256("cdn.example.com|/video/movie.mp4|quality=1080p|Accept-Language:ko-KR")
               = "a3f5d8e2b9c7..."
        """
        
        print(cache_key_logic)
```

## Part 2: Lambda@Edge - 엣지에서 실행되는 마법 ⚡

### TikTok이 실시간 동영상 변환을 구현한 방법

```python
class TikTokLambdaEdgeStrategy:
    """
    TikTok의 Lambda@Edge 전략
    """
    
    def real_time_video_processing(self):
        """
        TikTok의 실시간 비디오 처리 요구사항
        """
        print("🎵 TikTok Lambda@Edge 도전:, ")
        
        tiktok_requirements = {
            "daily_uploads": "100 million",
            "video_formats": ["mp4", "webm", "m3u8"],
            "device_types": ["iOS", "Android", "Web"],
            "resolutions": ["360p", "480p", "720p", "1080p"],
            "challenge": "디바이스별 최적 포맷 실시간 제공"
        }
        
        print("요구사항:")
        print(f"- 일일 업로드: {tiktok_requirements['daily_uploads']}")
        print(f"- 지원 포맷: {tiktok_requirements['video_formats']}")
        print(f"- 해상도: {tiktok_requirements['resolutions']}, ")
        
        print("⚡ Lambda@Edge 솔루션:, ")
        
        self.lambda_edge_triggers()
    
    def lambda_edge_triggers(self):
        """
        Lambda@Edge 트리거 포인트
        """
        trigger_points = """
        🎬 Lambda@Edge 실행 지점:
        
        사용자 → CloudFront → 오리진
          ↓         ↓           ↓
        Viewer    Origin     Origin
        Request   Request    Response
                              ↓
                          Viewer
                          Response
        
        각 트리거의 역할:
        
        1️⃣ Viewer Request (요청 수정):
        ```python
        def viewer_request_handler(event):
            '''
            사용자 요청이 캐시 확인 전 실행
            실행 위치: 가장 가까운 Edge Location
            시간 제한: 5초
            메모리: 128MB
            '''
            request = event['Records'][0]['cf']['request']
            
            # 디바이스 타입 감지
            user_agent = request['headers'].get('user-agent', [{}])[0].get('value', '')
            device_type = detect_device(user_agent)
            
            # URL 재작성
            if device_type == 'mobile':
                # 모바일은 낮은 해상도로
                request['uri'] = request['uri'].replace('.mp4', '_mobile.mp4')
            elif device_type == 'tablet':
                request['uri'] = request['uri'].replace('.mp4', '_tablet.mp4')
            
            # 위치 기반 라우팅
            country = request['headers'].get('cloudfront-viewer-country', [{}])[0].get('value', '')
            if country in ['CN', 'KR', 'JP']:
                # 아시아는 다른 CDN으로
                request['headers']['host'] = [{'key': 'Host', 'value': 'asia-cdn.tiktok.com'}]
            
            return request
        ```
        
        2️⃣ Origin Request (캐시 미스 처리):
        ```python
        def origin_request_handler(event):
            '''
            캐시 미스 시 오리진 요청 전 실행
            실행 위치: Regional Edge Cache
            시간 제한: 30초
            메모리: 10GB
            '''
            request = event['Records'][0]['cf']['request']
            
            # S3 서명된 URL 생성
            if 'premium' in request['uri']:
                signed_url = generate_s3_signed_url(
                    bucket='premium-content',
                    key=request['uri'],
                    expiry=3600
                )
                request['uri'] = signed_url
            
            # 오리진 선택 (다중 오리진)
            if is_peak_time():
                request['origin']['custom']['domainName'] = 'backup-origin.tiktok.com'
            
            return request
        ```
        
        3️⃣ Origin Response (응답 수정):
        ```python
        def origin_response_handler(event):
            '''
            오리진 응답 후 캐시 저장 전 실행
            실행 위치: Regional Edge Cache
            시간 제한: 30초
            메모리: 10GB
            '''
            response = event['Records'][0]['cf']['response']
            
            # 이미지 최적화
            if 'image' in response['headers'].get('content-type', [{}])[0].get('value', ''):
                # Sharp를 사용한 이미지 리사이징
                body = response.get('body', '')
                optimized = optimize_image(body, format='webp', quality=85)
                response['body'] = base64.b64encode(optimized)
                response['bodyEncoding'] = 'base64'
            
            # 캐시 헤더 조정
            response['headers']['cache-control'] = [{
                'key': 'Cache-Control',
                'value': 'public, max-age=31536000'  # 1년
            }]
            
            return response
        ```
        
        4️⃣ Viewer Response (최종 응답):
        ```python
        def viewer_response_handler(event):
            '''
            사용자에게 응답 전 마지막 실행
            실행 위치: Edge Location
            시간 제한: 5초
            메모리: 128MB
            '''
            response = event['Records'][0]['cf']['response']
            
            # 보안 헤더 추가
            security_headers = {
                'strict-transport-security': 'max-age=63072000; includeSubdomains; preload',
                'content-security-policy': "default-src 'none'; img-src 'self'; script-src 'self'",
                'x-content-type-options': 'nosniff',
                'x-frame-options': 'DENY',
                'x-xss-protection': '1; mode=block'
            }
            
            for header, value in security_headers.items():
                response['headers'][header] = [{'key': header, 'value': value}]
            
            # A/B 테스트 쿠키
            import random
            if random.random() < 0.5:
                response['headers']['set-cookie'] = [{
                    'key': 'Set-Cookie',
                    'value': 'experiment=variant-a; Path=/; Max-Age=86400'
                }]
            
            return response
        ```
        """
        
        print(trigger_points)
        
        # 실제 사용 사례
        self.real_world_examples()
    
    def real_world_examples(self):
        """
        실제 Lambda@Edge 사용 사례
        """
        print(", 🌟 실제 사용 사례:, ")
        
        use_cases = """
        1. 동적 이미지 리사이징 (Pinterest):
        ```python
        def resize_image_on_demand(event):
            request = event['Records'][0]['cf']['request']
            
            # URL: /image.jpg?w=300&h=200
            params = parse_qs(request['querystring'])
            width = int(params.get('w', [0])[0])
            height = int(params.get('h', [0])[0])
            
            if width and height:
                # 캐시 키에 크기 포함
                request['uri'] = f"/resized/{width}x{height}{request['uri']}"
                
                # 이미 리사이즈된 버전이 있는지 확인
                if not exists_in_s3(request['uri']):
                    # 실시간 리사이징
                    original = fetch_from_s3(request['uri'].replace(f'/resized/{width}x{height}', ''))
                    resized = resize_image(original, width, height)
                    upload_to_s3(request['uri'], resized)
            
            return request
        ```
        
        2. 지역별 콘텐츠 차단 (Netflix):
        ```python
        def geo_blocking(event):
            request = event['Records'][0]['cf']['request']
            country = request['headers']['cloudfront-viewer-country'][0]['value']
            
            # 콘텐츠 권리 확인
            content_id = extract_content_id(request['uri'])
            allowed_countries = get_content_rights(content_id)
            
            if country not in allowed_countries:
                return {
                    'status': '403',
                    'statusDescription': 'Forbidden',
                    'body': 'This content is not available in your region'
                }
            
            return request
        ```
        
        3. 봇 감지 및 차단 (Reddit):
        ```python
        def bot_detection(event):
            request = event['Records'][0]['cf']['request']
            
            # 행동 패턴 분석
            ip = request['clientIp']
            user_agent = request['headers'].get('user-agent', [{}])[0].get('value', '')
            
            bot_score = calculate_bot_score(ip, user_agent)
            
            if bot_score > 0.8:
                # CAPTCHA 페이지로 리다이렉트
                return {
                    'status': '302',
                    'statusDescription': 'Found',
                    'headers': {
                        'location': [{'key': 'Location', 'value': '/captcha'}]
                    }
                }
            
            return request
        ```
        """
        
        print(use_cases)
```

## Part 3: CloudFront의 스마트 캐싱 - ML 기반 예측 🤖

### YouTube가 다음 동영상을 미리 아는 방법

```python
class YouTubePredictiveCaching:
    """
    YouTube의 예측 캐싱 전략
    """
    
    def ml_powered_caching(self):
        """
        머신러닝 기반 캐싱 전략
        """
        print("🤖 YouTube의 ML 캐싱 도전:, ")
        
        youtube_stats = {
            "hours_uploaded_per_minute": 500,
            "views_per_day": "5 billion",
            "average_session": "40 minutes",
            "challenge": "다음 동영상 미리 캐싱"
        }
        
        print(f"일일 조회수: {youtube_stats['views_per_day']}")
        print(f"평균 세션: {youtube_stats['average_session']}")
        print("목표: 버퍼링 제로, ")
        
        print("🧠 ML 예측 캐싱:, ")
        
        self.predictive_caching_algorithm()
    
    def predictive_caching_algorithm(self):
        """
        예측 캐싱 알고리즘
        """
        ml_caching = """
        CloudFront의 ML 캐싱 시스템:
        
        ```python
        class PredictiveCacheManager:
            def __init__(self):
                self.model = load_model('cloudfront-cache-predictor-v4')
                self.user_history = UserHistoryDB()
                self.content_graph = ContentSimilarityGraph()
                
            def predict_next_content(self, user_id, current_video):
                '''
                다음 콘텐츠 예측 (정확도 85%)
                '''
                
                # 1. 사용자 임베딩
                user_embedding = self.get_user_embedding(user_id)
                
                # 2. 현재 비디오 임베딩  
                video_embedding = self.get_video_embedding(current_video)
                
                # 3. 컨텍스트 (시간, 위치, 디바이스)
                context = {
                    'time_of_day': get_current_hour(),
                    'day_of_week': get_day_of_week(),
                    'device_type': get_device_type(),
                    'network_speed': measure_bandwidth()
                }
                
                # 4. 예측 모델 실행
                predictions = self.model.predict({
                    'user': user_embedding,
                    'video': video_embedding,
                    'context': context
                })
                
                # 5. 상위 5개 콘텐츠 반환
                return predictions.top_k(5)
            
            def preload_strategy(self, predictions):
                '''
                예측 기반 프리로딩 전략
                '''
                strategies = []
                
                for content, probability in predictions:
                    if probability > 0.8:
                        # 높은 확률: 전체 프리로드
                        strategies.append({
                            'content': content,
                            'action': 'full_preload',
                            'bitrate': 'adaptive',
                            'segments': 'all'
                        })
                    elif probability > 0.5:
                        # 중간 확률: 첫 30초만
                        strategies.append({
                            'content': content,
                            'action': 'partial_preload',
                            'bitrate': '720p',
                            'segments': range(0, 30)
                        })
                    else:
                        # 낮은 확률: 메타데이터만
                        strategies.append({
                            'content': content,
                            'action': 'metadata_only'
                        })
                
                return strategies
        ```
        
        📊 캐싱 효율성 메트릭:
        
        메트릭                  기존 캐싱    ML 캐싱     개선율
        ─────────────────────────────────────────────────
        Cache Hit Ratio         65%         92%        +41%
        Bandwidth Saving        40%         75%        +87%
        Start Time             800ms       50ms       -94%
        Rebuffering Rate        5%         0.3%       -94%
        Storage Efficiency      60%         85%        +42%
        """
        
        print(ml_caching)
        
        # 적응형 비트레이트 스트리밍
        self.adaptive_bitrate_streaming()
    
    def adaptive_bitrate_streaming(self):
        """
        적응형 비트레이트 스트리밍
        """
        print(", 📊 적응형 비트레이트 스트리밍:, ")
        
        abs_strategy = """
        CloudFront의 ABR (Adaptive Bitrate) 전략:
        
        ```python
        class AdaptiveBitrateManager:
            def __init__(self):
                self.bitrate_ladder = [
                    {'resolution': '144p', 'bitrate': 100, 'size_factor': 0.1},
                    {'resolution': '240p', 'bitrate': 300, 'size_factor': 0.2},
                    {'resolution': '360p', 'bitrate': 600, 'size_factor': 0.3},
                    {'resolution': '480p', 'bitrate': 1000, 'size_factor': 0.4},
                    {'resolution': '720p', 'bitrate': 2500, 'size_factor': 0.6},
                    {'resolution': '1080p', 'bitrate': 5000, 'size_factor': 1.0},
                    {'resolution': '4K', 'bitrate': 15000, 'size_factor': 3.0}
                ]
                
            def select_bitrate(self, bandwidth, buffer_level, viewport_size):
                '''
                실시간 비트레이트 선택
                '''
                
                # 1. 대역폭 기반 최대 비트레이트
                max_bitrate = bandwidth * 0.8  # 80% 규칙
                
                # 2. 버퍼 수준 고려
                if buffer_level < 5:
                    # 버퍼 부족: 품질 낮춤
                    max_bitrate *= 0.5
                elif buffer_level > 30:
                    # 버퍼 충분: 품질 높임
                    max_bitrate *= 1.2
                
                # 3. 뷰포트 크기 고려
                if viewport_size < 500:  # 모바일
                    max_resolution = '480p'
                elif viewport_size < 1000:  # 태블릿
                    max_resolution = '720p'
                else:  # 데스크톱/TV
                    max_resolution = '1080p'
                
                # 4. 최적 비트레이트 선택
                for level in reversed(self.bitrate_ladder):
                    if level['bitrate'] <= max_bitrate:
                        if self.resolution_to_pixels(level['resolution']) <= self.resolution_to_pixels(max_resolution):
                            return level
                
                return self.bitrate_ladder[0]  # 최소 품질
            
            def segment_prefetching(self, current_segment, selected_bitrate):
                '''
                세그먼트 프리페칭 전략
                '''
                prefetch_plan = []
                
                # 다음 3개 세그먼트 프리페치
                for i in range(1, 4):
                    next_segment = current_segment + i
                    
                    # 품질 다변화 (폴백 준비)
                    prefetch_plan.append({
                        'segment': next_segment,
                        'bitrate': selected_bitrate,
                        'priority': 'high'
                    })
                    
                    # 한 단계 낮은 품질도 준비
                    lower_bitrate = self.get_lower_bitrate(selected_bitrate)
                    if lower_bitrate:
                        prefetch_plan.append({
                            'segment': next_segment,
                            'bitrate': lower_bitrate,
                            'priority': 'low'
                        })
                
                return prefetch_plan
        ```
        """
        
        print(abs_strategy)
```

## Part 4: Origin Shield - 오리진의 최후 방어선 🛡️

### Instagram이 10억 사진을 보호하는 방법

```python
class InstagramOriginShield:
    """
    Instagram의 Origin Shield 전략
    """
    
    def origin_protection_challenge(self):
        """
        Instagram의 오리진 보호 요구사항
        """
        print("📸 Instagram Origin Shield 도전:, ")
        
        instagram_scale = {
            "daily_uploads": "100 million photos",
            "total_photos": "50 billion",
            "peak_requests": "10 million/sec",
            "s3_api_limit": "5,500 req/sec per prefix",
            "challenge": "S3 API 한계 극복"
        }
        
        print(f"일일 업로드: {instagram_scale['daily_uploads']}")
        print(f"피크 요청: {instagram_scale['peak_requests']}")
        print(f"S3 한계: {instagram_scale['s3_api_limit']}")
        print("문제: S3가 죽지 않게 보호, ")
        
        print("🛡️ Origin Shield 솔루션:, ")
        
        self.origin_shield_mechanics()
    
    def origin_shield_mechanics(self):
        """
        Origin Shield 동작 메커니즘
        """
        shield_architecture = """
        Origin Shield 아키텍처:
        
        ┌─────────────────────────────────────┐
        │         전 세계 사용자 요청           │
        └──────────┬──────────────────────────┘
                   ↓ 10M req/sec
        ┌─────────────────────────────────────┐
        │     450+ Edge Locations              │
        │     (Cache Hit: 85%)                 │
        └──────────┬──────────────────────────┘
                   ↓ 1.5M req/sec
        ┌─────────────────────────────────────┐
        │     13 Regional Edge Caches          │
        │     (Cache Hit: 70%)                 │
        └──────────┬──────────────────────────┘
                   ↓ 450K req/sec
        ┌─────────────────────────────────────┐
        │  ⭐ Origin Shield (단일 진입점) ⭐    │
        │     (Cache Hit: 95%)                 │
        │     Request Collapsing 활성화         │
        └──────────┬──────────────────────────┘
                   ↓ 22.5K req/sec → 2.25K req/sec (Collapsed)
        ┌─────────────────────────────────────┐
        │         S3 Origin (안전!)            │
        │     (실제 부하: 2.25K req/sec)       │
        └─────────────────────────────────────┘
        
        핵심 기능:
        
        ```python
        class OriginShield:
            def __init__(self):
                self.request_collapse_window = 100  # ms
                self.pending_requests = {}
                self.cache = LRUCache(size=1*PB)
                
            def handle_request(self, request):
                cache_key = self.generate_cache_key(request)
                
                # 1. 캐시 확인
                if self.cache.has(cache_key):
                    return self.cache.get(cache_key)
                
                # 2. Request Collapsing - 가장 중요!
                if cache_key in self.pending_requests:
                    # 이미 같은 요청이 진행 중
                    # 새 요청을 대기열에 추가
                    future = asyncio.Future()
                    self.pending_requests[cache_key].append(future)
                    return await future  # 기다림
                
                # 3. 첫 요청만 오리진으로
                self.pending_requests[cache_key] = []
                
                try:
                    # 오리진에서 가져오기
                    response = await self.fetch_from_origin(request)
                    
                    # 캐시 저장
                    self.cache.set(cache_key, response)
                    
                    # 대기 중인 모든 요청에 응답
                    for future in self.pending_requests[cache_key]:
                        future.set_result(response)
                    
                    return response
                    
                finally:
                    del self.pending_requests[cache_key]
            
            def calculate_origin_offload(self):
                '''
                오리진 부하 감소율 계산
                '''
                total_requests = 10_000_000  # 초당
                
                # 각 계층의 캐시 히트율
                edge_hit = 0.85
                regional_hit = 0.70
                shield_hit = 0.95
                
                # Edge Locations 통과
                after_edge = total_requests * (1 - edge_hit)
                # = 1,500,000
                
                # Regional Cache 통과
                after_regional = after_edge * (1 - regional_hit)
                # = 450,000
                
                # Origin Shield 통과
                after_shield = after_regional * (1 - shield_hit)
                # = 22,500
                
                # Request Collapsing (10:1 비율)
                after_collapse = after_shield / 10
                # = 2,250
                
                offload_rate = (1 - after_collapse/total_requests) * 100
                # = 99.98%
                
                return {
                    'original': total_requests,
                    'after_shield': after_collapse,
                    'offload_rate': f"{offload_rate:.2f}%"
                }
        ```
        """
        
        print(shield_architecture)
        
        # 최적 Shield 위치 선택
        self.shield_location_selection()
    
    def shield_location_selection(self):
        """
        최적 Shield 위치 선택
        """
        print(", 📍 Origin Shield 위치 선택:, ")
        
        location_strategy = """
        Shield 위치 선택 알고리즘:
        
        ```python
        class ShieldLocationSelector:
            def select_optimal_location(self, origin_region, traffic_pattern):
                '''
                최적의 Shield 위치 자동 선택
                '''
                
                # AWS 권장 매핑
                shield_locations = {
                    'us-east-1': 'us-east-1',      # 버지니아
                    'us-west-2': 'us-west-2',      # 오레곤
                    'eu-west-1': 'eu-central-1',   # 프랑크푸르트
                    'ap-northeast-1': 'ap-northeast-1',  # 도쿄
                    'ap-southeast-1': 'ap-south-1'  # 뭄바이
                }
                
                # 1. 오리진과 같은 리전 우선
                if origin_region in shield_locations:
                    return shield_locations[origin_region]
                
                # 2. 트래픽 패턴 분석
                top_traffic_regions = self.analyze_traffic(traffic_pattern)
                
                # 3. 가중 중심점 계산
                weighted_center = self.calculate_weighted_center(
                    top_traffic_regions
                )
                
                # 4. 가장 가까운 Shield 위치
                return self.find_nearest_shield(weighted_center)
        ```
        
        예시: Instagram (한국 서비스)
        - Origin: S3 ap-northeast-2 (서울)
        - 트래픽: 70% 한국, 20% 일본, 10% 기타
        - 최적 Shield: ap-northeast-1 (도쿄)
        - 이유: 서울 리전에 Shield 없음, 도쿄가 가장 가까움
        """
        
        print(location_strategy)
```

## Part 5: 실전 트러블슈팅 - HBO Max 출시 대참사 🔧

### 2020년 HBO Max가 겪은 CDN 지옥

```python
class HBOMaxLaunchDisaster:
    """
    HBO Max 출시 장애 분석
    """
    
    def the_launch_day_chaos(self):
        """
        2020년 5월 27일 HBO Max 출시일
        """
        print("💥 HBO Max 출시 장애 타임라인:, ")
        
        timeline = {
            "2020-05-27 06:00": "HBO Max 서비스 오픈",
            "2020-05-27 06:05": "가입자 폭증 (예상의 5배)",
            "2020-05-27 06:15": "CloudFront 캐시 미스율 급증",
            "2020-05-27 06:30": "Origin 서버 과부하",
            "2020-05-27 07:00": "캐시 키 설정 오류 발견",
            "2020-05-27 08:00": "전체 서비스 다운",
            "2020-05-27 10:00": "긴급 패치 배포",
            "2020-05-27 14:00": "서비스 정상화"
        }
        
        for time, event in timeline.items():
            print(f"{time}: {event}")
        
        print(", 🔍 무엇이 잘못되었나?, ")
        
        self.root_cause_analysis()
    
    def root_cause_analysis(self):
        """
        근본 원인 분석
        """
        analysis = """
        ❌ HBO Max의 실수들:
        
        1. 잘못된 캐시 키 설정:
        ```python
        # 문제의 설정
        cache_behavior = {
            'path_pattern': '/video/*',
            'cache_policy': {
                'include_query_strings': True,  # 😱 모든 쿼리 파라미터!
                'include_headers': ['*'],        # 😱 모든 헤더!
                'include_cookies': True          # 😱 모든 쿠키!
            }
        }
        
        # 결과:
        # - 같은 비디오가 수만 번 캐시됨
        # - 각 사용자마다 다른 캐시 키
        # - 캐시 히트율 5% (정상: 95%)
        ```
        
        2. Origin Shield 미사용:
        ```python
        # Shield 없이 직접 오리진 호출
        traffic_flow = {
            'users': 10_000_000,
            'edge_locations': 450,
            'requests_per_edge': 22_222,
            'origin_capacity': 10_000,  # 초당
            'result': 'ORIGIN OVERLOAD!'
        }
        ```
        
        3. 부적절한 에러 페이지 캐싱:
        ```python
        # 503 에러를 300초 캐싱
        error_caching = {
            '503': {
                'ttl': 300,  # 5분간 에러 페이지 표시!
                'result': '복구 후에도 5분간 에러'
            }
        }
        ```
        
        ✅ 올바른 설정:
        
        ```python
        # 1. 스마트한 캐시 키
        optimal_cache_policy = {
            'path_pattern': '/video/*',
            'cache_policy': {
                'include_query_strings': ['quality', 'segment'],  # 필요한 것만
                'include_headers': ['CloudFront-Viewer-Country'],  # 지역별 캐싱
                'include_cookies': False  # 쿠키 제외
            }
        }
        
        # 2. Origin Shield 활성화
        origin_shield = {
            'enabled': True,
            'region': 'us-east-1',
            'fallback': 'us-west-2'
        }
        
        # 3. 에러 페이지 TTL
        error_ttl = {
            '500': 0,   # 캐시 안 함
            '502': 0,   # 캐시 안 함
            '503': 10,  # 10초만
            '504': 10   # 10초만
        }
        
        # 4. 다중 오리진 페일오버
        origin_group = {
            'primary': 's3-bucket-primary',
            'secondary': 's3-bucket-secondary',
            'failover_codes': [500, 502, 503, 504],
            'failover_timeout': 10
        }
        ```
        """
        
        print(analysis)
        
        # 성능 튜닝 체크리스트
        self.performance_checklist()
    
    def performance_checklist(self):
        """
        CloudFront 성능 튜닝 체크리스트
        """
        print(", ✅ CloudFront 최적화 체크리스트:, ")
        
        checklist = """
        📋 필수 확인 사항:
        
        □ 캐시 키 최적화
          - 불필요한 쿼리 파라미터 제외
          - 필수 헤더만 포함
          - 쿠키는 가능한 제외
        
        □ Origin Shield 활성화
          - 오리진과 가까운 리전 선택
          - Request Collapsing 확인
        
        □ 압축 설정
          - Gzip/Brotli 자동 압축
          - 압축 가능 콘텐츠 타입 지정
        
        □ TTL 전략
          - 정적 콘텐츠: 1년 (31536000)
          - 동적 콘텐츠: 상황별 조정
          - 에러 페이지: 최소화
        
        □ 오리진 페일오버
          - Origin Group 구성
          - Health Check 설정
          - 자동 페일오버
        
        □ 보안 설정
          - AWS WAF 연동
          - 서명된 URL/쿠키
          - 지역 차단
        
        □ 모니터링
          - CloudWatch 메트릭
          - Real-time 로그
          - 알람 설정
        
        □ 비용 최적화
          - 사용량 기반 가격 클래스
          - 불필요한 로깅 제거
          - Reserved Capacity
        """
        
        print(checklist)
```

## 마치며: CloudFront 마스터의 길 🎓

### 핵심 교훈 정리

```python
def cloudfront_mastery():
    """
    CloudFront 마스터가 되는 길
    """
    golden_rules = {
        "1️⃣": "3층 캐시는 오리진의 생명줄이다",
        "2️⃣": "Lambda@Edge는 엣지의 두뇌다",
        "3️⃣": "ML 캐싱은 미래를 본다",
        "4️⃣": "Origin Shield는 최후의 방어선이다",
        "5️⃣": "캐시 키가 성능을 결정한다"
    }
    
    mastery_levels = {
        "🥉 Bronze": "기본 Distribution 설정",
        "🥈 Silver": "캐시 동작 최적화",
        "🥇 Gold": "Lambda@Edge 구현",
        "💎 Diamond": "글로벌 CDN 아키텍처"
    }
    
    final_wisdom = """
    💡 Remember:
    
    "CloudFront는 단순한 CDN이 아닙니다.
     
     Disney+가 1000만 스트림을 처리하고,
     TikTok이 실시간 비디오를 변환하고,
     Instagram이 10억 사진을 보호할 수 있는 것은
     CloudFront의 지능형 캐싱 덕분입니다.
     
     엣지는 단순한 캐시가 아니라,
     지능형 컴퓨팅 플랫폼임을 기억하세요."
    
    - AWS CloudFront Team
    """
    
    return golden_rules, mastery_levels, final_wisdom

# 체크리스트
print("🎯 CloudFront Mastery Check:")
print("□ 3층 캐시 아키텍처 이해")
print("□ Lambda@Edge 4가지 트리거 구현")
print("□ 캐시 키 최적화")
print("□ Origin Shield 설정")
print("□ ML 기반 캐싱 이해")
```

---

*"캐시가 왕이고, 지연시간이 적이다"* - Amazon CTO

다음 문서에서는 [Direct Connect의 전용선 마법](04-directconnect.md)을 파헤쳐보겠습니다! 🚀
