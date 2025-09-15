---
tags:
  - Event-Driven
  - Stream Processing
  - Apache Flink
  - Complex Event Processing
  - Guide
---

# 16.2B 실시간 스트림 처리 - Apache Flink와 복합 이벤트 처리

## ⚡ 실시간 스트림 처리

### Apache Flink로 복합 이벤트 처리

```scala
// Scala로 구현한 Flink 실시간 분석 파이프라인
import org.apache.flink.streaming.api.scala._
import org.apache.flink.streaming.api.windowing.time.Time
import org.apache.flink.streaming.connectors.kafka.FlinkKafkaConsumer
import org.apache.flink.cep.scala.CEP
import org.apache.flink.cep.scala.pattern.Pattern

case class UserEvent(
  userId: String,
  eventType: String,
  contentId: String,
  timestamp: Long,
  sessionId: String,
  device: String
)

case class ContentTrendingSignal(
  contentId: String,
  trendingScore: Double,
  timestamp: Long,
  reason: String
)

case class UserEngagementScore(
  userId: String,
  engagementScore: Double,
  sessionDuration: Long,
  contentCount: Int,
  timestamp: Long
)

object RealTimeAnalyticsPipeline {
  
  def main(args: Array[String]): Unit = {
    val env = StreamExecutionEnvironment.getExecutionEnvironment
    env.setParallelism(4)
    env.enableCheckpointing(60000) // 1분마다 체크포인트
    
    // Kafka 소스 설정
    val kafkaProps = new Properties()
    kafkaProps.setProperty("bootstrap.servers", "kafka-cluster:9092")
    kafkaProps.setProperty("group.id", "flink-analytics")
    
    val kafkaConsumer = new FlinkKafkaConsumer[UserEvent](
      "user-events",
      new UserEventDeserializer(),
      kafkaProps
    )
    
    // 이벤트 스트림 생성
    val eventStream = env.addSource(kafkaConsumer)
      .assignTimestampsAndWatermarks(
        WatermarkStrategy
          .forBoundedOutOfOrderness[UserEvent](Duration.ofSeconds(5))
          .withTimestampAssigner((event, _) => event.timestamp)
      )
    
    // 1. 실시간 콘텐츠 트렌딩 분석
    val trendingAnalysis = eventStream
      .filter(_.eventType == "content.watched")
      .keyBy(_.contentId)
      .window(SlidingEventTimeWindows.of(Time.minutes(15), Time.minutes(1)))
      .aggregate(new ContentTrendingAggregator())
      .filter(_.trendingScore > 0.7) // 트렌딩 임계값
    
    // 2. 사용자 참여도 실시간 분석
    val engagementAnalysis = eventStream
      .keyBy(_.userId)
      .window(SessionWindows.withGap(Time.minutes(30)))
      .aggregate(new UserEngagementAggregator())
    
    // 3. 복합 이벤트 패턴 탐지 (CEP - Complex Event Processing)
    val bingeWatchingPattern = Pattern
      .begin[UserEvent]("start")
      .where(_.eventType == "content.watched")
      .next("continue")
      .where(_.eventType == "content.watched")
      .times(3) // 3개 이상의 연속 시청
      .within(Time.hours(2)) // 2시간 이내
    
    val bingeWatchingDetection = CEP
      .pattern(eventStream.keyBy(_.userId), bingeWatchingPattern)
      .select(new BingeWatchingSelector())
    
    // 4. 실시간 이상 탐지 (갑작스러운 트래픽 증가)
    val anomalyDetection = eventStream
      .windowAll(TumblingEventTimeWindows.of(Time.minutes(1)))
      .aggregate(new TrafficAnomalyDetector())
      .filter(_.isAnomaly)
    
    // 결과를 다시 Kafka로 전송
    trendingAnalysis.addSink(new FlinkKafkaProducer[ContentTrendingSignal](
      "trending-signals",
      new TrendingSignalSerializer(),
      kafkaProps
    ))
    
    engagementAnalysis.addSink(new FlinkKafkaProducer[UserEngagementScore](
      "user-engagement",
      new EngagementScoreSerializer(),
      kafkaProps
    ))
    
    bingeWatchingDetection.addSink(new FlinkKafkaProducer[BingeWatchingAlert](
      "user-behavior-alerts",
      new BingeWatchingAlertSerializer(),
      kafkaProps
    ))
    
    anomalyDetection.addSink(new FlinkKafkaProducer[TrafficAnomalyAlert](
      "system-alerts",
      new TrafficAnomalySerializer(),
      kafkaProps
    ))
    
    env.execute("Real-time Analytics Pipeline")
  }
}

// 콘텐츠 트렌딩 점수 계산 Aggregator
class ContentTrendingAggregator extends AggregateFunction[UserEvent, TrendingAccumulator, ContentTrendingSignal] {
  
  override def createAccumulator(): TrendingAccumulator = 
    TrendingAccumulator(0, 0, 0, Set.empty, 0L)
  
  override def add(event: UserEvent, acc: TrendingAccumulator): TrendingAccumulator = {
    val newUniqueUsers = acc.uniqueUsers + event.userId
    val newWatchCount = acc.watchCount + 1
    val newTotalDuration = acc.totalDuration + extractDuration(event)
    val newDeviceCount = acc.deviceTypes + event.device
    
    acc.copy(
      watchCount = newWatchCount,
      uniqueUserCount = newUniqueUsers.size,
      totalDuration = newTotalDuration,
      uniqueUsers = newUniqueUsers,
      deviceTypes = newDeviceCount
    )
  }
  
  override def getResult(acc: TrendingAccumulator): ContentTrendingSignal = {
    // 트렌딩 점수 계산 알고리즘
    val userDiversityScore = math.min(acc.uniqueUserCount / 100.0, 1.0) // 최대 100명 기준
    val watchIntensityScore = math.min(acc.watchCount / 500.0, 1.0) // 최대 500회 기준  
    val deviceDiversityScore = acc.deviceTypes.size / 4.0 // 최대 4개 기기 타입
    val avgWatchTime = if (acc.watchCount > 0) acc.totalDuration / acc.watchCount else 0
    val completionScore = math.min(avgWatchTime / 3600.0, 1.0) // 1시간 기준
    
    val trendingScore = (userDiversityScore * 0.3 + 
                        watchIntensityScore * 0.3 + 
                        deviceDiversityScore * 0.2 + 
                        completionScore * 0.2)
    
    ContentTrendingSignal(
      contentId = acc.contentId,
      trendingScore = trendingScore,
      timestamp = System.currentTimeMillis(),
      reason = s"users:${acc.uniqueUserCount}, watches:${acc.watchCount}, devices:${acc.deviceTypes.size}"
    )
  }
  
  override def merge(acc1: TrendingAccumulator, acc2: TrendingAccumulator): TrendingAccumulator = {
    acc1.copy(
      watchCount = acc1.watchCount + acc2.watchCount,
      uniqueUserCount = (acc1.uniqueUsers ++ acc2.uniqueUsers).size,
      totalDuration = acc1.totalDuration + acc2.totalDuration,
      uniqueUsers = acc1.uniqueUsers ++ acc2.uniqueUsers,
      deviceTypes = acc1.deviceTypes ++ acc2.deviceTypes
    )
  }
  
  private def extractDuration(event: UserEvent): Long = {
    // 이벤트에서 시청 시간 추출 로직
    // 실제로는 event.data에서 duration 필드 파싱
    1800L // 30분 기본값
  }
}

case class TrendingAccumulator(
  watchCount: Int,
  uniqueUserCount: Int,
  totalDuration: Long,
  uniqueUsers: Set[String],
  deviceTypes: Set[String]
) {
  def contentId: String = "" // 실제로는 키에서 가져옴
}

// 사용자 참여도 분석 Aggregator  
class UserEngagementAggregator extends AggregateFunction[UserEvent, EngagementAccumulator, UserEngagementScore] {
  
  override def createAccumulator(): EngagementAccumulator = 
    EngagementAccumulator(0, 0, 0L, 0L, Set.empty)
  
  override def add(event: UserEvent, acc: EngagementAccumulator): EngagementAccumulator = {
    val isWatchEvent = event.eventType == "content.watched"
    val isInteractionEvent = Set("content.liked", "content.shared", "content.rated").contains(event.eventType)
    
    acc.copy(
      contentCount = if (isWatchEvent) acc.contentCount + 1 else acc.contentCount,
      interactionCount = if (isInteractionEvent) acc.interactionCount + 1 else acc.interactionCount,
      sessionStart = if (acc.sessionStart == 0) event.timestamp else math.min(acc.sessionStart, event.timestamp),
      sessionEnd = math.max(acc.sessionEnd, event.timestamp),
      contentTypes = acc.contentTypes + extractContentType(event)
    )
  }
  
  override def getResult(acc: EngagementAccumulator): UserEngagementScore = {
    val sessionDuration = acc.sessionEnd - acc.sessionStart
    val contentDiversity = acc.contentTypes.size
    val interactionRate = if (acc.contentCount > 0) acc.interactionCount.toDouble / acc.contentCount else 0.0
    
    // 참여도 점수 계산
    val engagementScore = math.min(
      (acc.contentCount * 0.3 + 
       contentDiversity * 0.3 + 
       interactionRate * 0.4) / 3.0 * 100, 
      100.0
    )
    
    UserEngagementScore(
      userId = "", // 키에서 추출
      engagementScore = engagementScore,
      sessionDuration = sessionDuration,
      contentCount = acc.contentCount,
      timestamp = acc.sessionEnd
    )
  }
  
  override def merge(acc1: EngagementAccumulator, acc2: EngagementAccumulator): EngagementAccumulator = {
    acc1.copy(
      contentCount = acc1.contentCount + acc2.contentCount,
      interactionCount = acc1.interactionCount + acc2.interactionCount,
      sessionStart = if (acc1.sessionStart == 0) acc2.sessionStart else math.min(acc1.sessionStart, acc2.sessionStart),
      sessionEnd = math.max(acc1.sessionEnd, acc2.sessionEnd),
      contentTypes = acc1.contentTypes ++ acc2.contentTypes
    )
  }
  
  private def extractContentType(event: UserEvent): String = {
    // 실제로는 contentId로 콘텐츠 타입 조회
    "drama" // 기본값
  }
}

case class EngagementAccumulator(
  contentCount: Int,
  interactionCount: Int,
  sessionStart: Long,
  sessionEnd: Long,
  contentTypes: Set[String]
)
```

### 복합 이벤트 처리 (CEP) 고급 패턴

```scala
// 더욱 복잡한 사용자 행동 패턴 탐지
object AdvancedCEPPatterns {
  
  // 1. 사용자 이탈 위험 패턴 탐지
  val churnRiskPattern = Pattern
    .begin[UserEvent]("login")
    .where(_.eventType == "user.login")
    .followedBy("watch")
    .where(_.eventType == "content.watched")
    .times(1, 3) // 1-3개의 시청 이벤트
    .followedBy("exit")
    .where(_.eventType == "user.logout")
    .within(Time.minutes(15)) // 15분 이내에 빠른 이탈
  
  // 2. 프리미엄 전환 가능성 높은 사용자 패턴
  val premiumConversionPattern = Pattern
    .begin[UserEvent]("start")
    .where(_.eventType == "content.watched")
    .next("highEngagement")
    .where(event => 
      Set("content.liked", "content.shared", "content.rated").contains(event.eventType)
    )
    .timesOrMore(3) // 3번 이상의 상호작용
    .followedBy("qualityUpgrade")
    .where(event => 
      event.eventType == "content.watched" && 
      extractQuality(event) == "4K" // 4K 품질로 시청 시도
    )
    .within(Time.hours(24))
  
  // 3. 콘텐츠 바이럴 확산 패턴
  val viralContentPattern = Pattern
    .begin[UserEvent]("watch")
    .where(_.eventType == "content.watched")
    .followedBy("share")
    .where(_.eventType == "content.shared")
    .timesOrMore(5) // 5회 이상 공유
    .within(Time.hours(2)) // 2시간 이내
  
  // 4. 사용자 취향 변화 패턴 탐지
  val tasteChangePattern = Pattern
    .begin[UserEvent]("oldPreference")
    .where(event => extractGenre(event) == "comedy")
    .times(5) // 기존 선호 장르 5회 시청
    .followedBy("newPreference")
    .where(event => extractGenre(event) == "thriller")
    .timesOrMore(3) // 새로운 장르 3회 이상 시청
    .within(Time.days(7)) // 일주일 내
  
  def setupCEPProcessing(eventStream: DataStream[UserEvent]): Unit = {
    // 이탈 위험 사용자 탐지
    val churnRiskAlerts = CEP
      .pattern(eventStream.keyBy(_.userId), churnRiskPattern)
      .select(new ChurnRiskSelector())
    
    // 프리미엄 전환 후보 탐지  
    val conversionCandidates = CEP
      .pattern(eventStream.keyBy(_.userId), premiumConversionPattern)
      .select(new PremiumConversionSelector())
    
    // 바이럴 콘텐츠 탐지
    val viralContent = CEP
      .pattern(eventStream.keyBy(_.contentId), viralContentPattern)
      .select(new ViralContentSelector())
    
    // 취향 변화 사용자 탐지
    val tasteChangeUsers = CEP
      .pattern(eventStream.keyBy(_.userId), tasteChangePattern)
      .select(new TasteChangeSelector())
    
    // 각 결과를 적절한 Kafka 토픽으로 전송
    churnRiskAlerts.addSink(new FlinkKafkaProducer[ChurnRiskAlert](
      "churn-risk-alerts",
      new ChurnRiskAlertSerializer(),
      kafkaProps
    ))
    
    conversionCandidates.addSink(new FlinkKafkaProducer[ConversionCandidate](
      "conversion-candidates",
      new ConversionCandidateSerializer(), 
      kafkaProps
    ))
    
    viralContent.addSink(new FlinkKafkaProducer[ViralContentAlert](
      "viral-content-alerts",
      new ViralContentAlertSerializer(),
      kafkaProps
    ))
    
    tasteChangeUsers.addSink(new FlinkKafkaProducer[TasteChangeAlert](
      "taste-change-alerts",
      new TasteChangeAlertSerializer(),
      kafkaProps
    ))
  }
  
  private def extractQuality(event: UserEvent): String = {
    // 실제로는 event.data에서 품질 정보 추출
    "HD" // 기본값
  }
  
  private def extractGenre(event: UserEvent): String = {
    // 실제로는 contentId로 장르 조회
    "unknown" // 기본값
  }
}

// 패턴 선택자들
class ChurnRiskSelector extends PatternSelectFunction[UserEvent, ChurnRiskAlert] {
  override def select(pattern: util.Map[String, util.List[UserEvent]]): ChurnRiskAlert = {
    val loginEvents = pattern.get("login").asScala
    val watchEvents = pattern.get("watch").asScala
    val exitEvents = pattern.get("exit").asScala
    
    val sessionDuration = exitEvents.head.timestamp - loginEvents.head.timestamp
    val watchCount = watchEvents.size
    
    ChurnRiskAlert(
      userId = loginEvents.head.userId,
      sessionDuration = sessionDuration,
      watchCount = watchCount,
      riskScore = calculateChurnRisk(sessionDuration, watchCount),
      timestamp = System.currentTimeMillis()
    )
  }
  
  private def calculateChurnRisk(sessionDuration: Long, watchCount: Int): Double = {
    // 세션 시간이 짧고 시청 횟수가 적을수록 이탈 위험 증가
    val durationScore = math.max(0, 1.0 - sessionDuration / (15 * 60 * 1000.0)) // 15분 기준
    val watchScore = math.max(0, 1.0 - watchCount / 5.0) // 5회 기준
    (durationScore * 0.6 + watchScore * 0.4) * 100
  }
}

class PremiumConversionSelector extends PatternSelectFunction[UserEvent, ConversionCandidate] {
  override def select(pattern: util.Map[String, util.List[UserEvent]]): ConversionCandidate = {
    val watchEvents = pattern.get("start").asScala
    val engagementEvents = pattern.get("highEngagement").asScala
    val qualityUpgradeEvents = pattern.get("qualityUpgrade").asScala
    
    ConversionCandidate(
      userId = watchEvents.head.userId,
      engagementCount = engagementEvents.size,
      qualityUpgradeAttempts = qualityUpgradeEvents.size,
      conversionScore = calculateConversionProbability(engagementEvents.size, qualityUpgradeEvents.size),
      timestamp = System.currentTimeMillis()
    )
  }
  
  private def calculateConversionProbability(engagementCount: Int, upgradeAttempts: Int): Double = {
    val engagementScore = math.min(engagementCount / 10.0, 1.0) // 최대 10회 기준
    val upgradeScore = math.min(upgradeAttempts / 3.0, 1.0) // 최대 3회 기준
    (engagementScore * 0.7 + upgradeScore * 0.3) * 100
  }
}

// 데이터 클래스들
case class ChurnRiskAlert(
  userId: String,
  sessionDuration: Long,
  watchCount: Int,
  riskScore: Double,
  timestamp: Long
)

case class ConversionCandidate(
  userId: String,
  engagementCount: Int,
  qualityUpgradeAttempts: Int,
  conversionScore: Double,
  timestamp: Long
)

case class ViralContentAlert(
  contentId: String,
  shareCount: Int,
  viralScore: Double,
  timestamp: Long
)

case class TasteChangeAlert(
  userId: String,
  oldGenre: String,
  newGenre: String,
  confidence: Double,
  timestamp: Long
)
```

### 실시간 A/B 테스트와 개인화

```scala
// 실시간 A/B 테스트 결과 분석
object RealTimeABTesting {
  
  case class ABTestEvent(
    userId: String,
    experimentId: String,
    variant: String,
    eventType: String,
    timestamp: Long,
    metadata: Map[String, String]
  )
  
  case class ABTestResult(
    experimentId: String,
    variant: String,
    conversionRate: Double,
    sampleSize: Int,
    confidence: Double,
    timestamp: Long
  )
  
  def setupABTestAnalysis(eventStream: DataStream[UserEvent]): DataStream[ABTestResult] = {
    // A/B 테스트 이벤트 필터링 및 변환
    val abTestEvents = eventStream
      .filter(event => extractExperimentId(event).nonEmpty)
      .map(event => ABTestEvent(
        userId = event.userId,
        experimentId = extractExperimentId(event).get,
        variant = extractVariant(event),
        eventType = event.eventType,
        timestamp = event.timestamp,
        metadata = extractMetadata(event)
      ))
    
    // 실시간 전환율 계산 (15분 윈도우)
    abTestEvents
      .keyBy(event => (event.experimentId, event.variant))
      .window(TumblingEventTimeWindows.of(Time.minutes(15)))
      .aggregate(new ABTestAggregator())
      .filter(_.sampleSize >= 100) // 최소 샘플 사이즈 확보
  }
  
  // A/B 테스트 통계 집계
  class ABTestAggregator extends AggregateFunction[ABTestEvent, ABTestAccumulator, ABTestResult] {
    
    override def createAccumulator(): ABTestAccumulator = 
      ABTestAccumulator("", "", 0, 0, Set.empty)
    
    override def add(event: ABTestEvent, acc: ABTestAccumulator): ABTestAccumulator = {
      val isConversion = isConversionEvent(event.eventType)
      
      acc.copy(
        experimentId = event.experimentId,
        variant = event.variant,
        totalUsers = acc.uniqueUsers.size + (if (acc.uniqueUsers.contains(event.userId)) 0 else 1),
        conversions = acc.conversions + (if (isConversion) 1 else 0),
        uniqueUsers = acc.uniqueUsers + event.userId
      )
    }
    
    override def getResult(acc: ABTestAccumulator): ABTestResult = {
      val conversionRate = if (acc.totalUsers > 0) acc.conversions.toDouble / acc.totalUsers else 0.0
      val confidence = calculateStatisticalConfidence(acc.conversions, acc.totalUsers)
      
      ABTestResult(
        experimentId = acc.experimentId,
        variant = acc.variant,
        conversionRate = conversionRate,
        sampleSize = acc.totalUsers,
        confidence = confidence,
        timestamp = System.currentTimeMillis()
      )
    }
    
    override def merge(acc1: ABTestAccumulator, acc2: ABTestAccumulator): ABTestAccumulator = {
      acc1.copy(
        totalUsers = (acc1.uniqueUsers ++ acc2.uniqueUsers).size,
        conversions = acc1.conversions + acc2.conversions,
        uniqueUsers = acc1.uniqueUsers ++ acc2.uniqueUsers
      )
    }
    
    private def isConversionEvent(eventType: String): Boolean = {
      Set("subscription.purchased", "content.completed", "user.upgraded").contains(eventType)
    }
    
    private def calculateStatisticalConfidence(conversions: Int, totalUsers: Int): Double = {
      // 간단한 통계적 유의성 계산 (실제로는 더 복잡한 통계 검정 필요)
      if (totalUsers < 30) 0.0
      else {
        val p = conversions.toDouble / totalUsers
        val se = math.sqrt(p * (1 - p) / totalUsers)
        val z = p / se
        math.min(math.abs(z) / 1.96 * 100, 99.9) // 95% 신뢰구간 기준
      }
    }
  }
  
  case class ABTestAccumulator(
    experimentId: String,
    variant: String,
    totalUsers: Int,
    conversions: Int,
    uniqueUsers: Set[String]
  )
  
  private def extractExperimentId(event: UserEvent): Option[String] = {
    // 실제로는 event.metadata에서 실험 ID 추출
    Some("exp_001") // 예시
  }
  
  private def extractVariant(event: UserEvent): String = {
    // 실제로는 event.metadata에서 변형 추출
    "control" // 예시
  }
  
  private def extractMetadata(event: UserEvent): Map[String, String] = {
    // 실제로는 event에서 추가 메타데이터 추출
    Map.empty // 예시
  }
}
```

## 핵심 요점

### 1. Apache Flink의 강력한 스트림 처리

Scala 기반의 Flink 파이프라인을 통해 실시간 콘텐츠 트렌딩 분석, 사용자 참여도 측정, 이상 탐지까지 포괄적인 스트림 처리를 구현했습니다.

### 2. 복합 이벤트 처리 (CEP)

사용자 행동 패턴 탐지부터 비즈니스 인사이트 도출까지, CEP를 활용한 고급 패턴 매칭 기법을 학습했습니다.

### 3. 실시간 A/B 테스트 분석

스트림 처리 환경에서 실시간으로 A/B 테스트 결과를 분석하고 통계적 유의성을 검증하는 방법을 익혔습니다.

---

**이전**: [16.2A Event-Driven 아키텍처 기초](02a-event-driven-fundamentals.md)  
**다음**: [16.2C 이벤트 소싱 구현](02c-event-sourcing-implementation.md)에서 이벤트 스토어와 집합체 패턴을 학습합니다.
