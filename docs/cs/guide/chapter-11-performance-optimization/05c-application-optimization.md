---
tags:
  - Performance
  - Application Optimization
  - JVM Tuning
  - Connection Pool
---

# 11.5c 애플리케이션 수준 최적화

애플리케이션 수준의 최적화는 운영체제와 애플리케이션 사이에서 일어나는 중요한 성능 최적화 영역입니다. JVM 튜닝, 데이터베이스 연결 풀 최적화 등을 통해 애플리케이션의 전반적인 성능을 향상시킬 수 있습니다.

## JVM 튜닝 (Java 애플리케이션용)

```bash
#!/bin/bash
# jvm_tuning.sh - JVM 성능 최적화

echo "=== JVM 성능 최적화 설정 ==="

# 시스템 메모리 확인
TOTAL_MEM=$(free -g | awk 'NR==2{print $2}')
echo "시스템 총 메모리: ${TOTAL_MEM}GB"

# JVM 힙 크기 계산 (시스템 메모리의 75%)
HEAP_SIZE=$((TOTAL_MEM * 3 / 4))
if [ $HEAP_SIZE -lt 1 ]; then
    HEAP_SIZE=1
fi

echo "권장 힙 크기: ${HEAP_SIZE}GB"

# JVM 옵션 생성
JVM_OPTS=""

# ============ 메모리 설정 ============
JVM_OPTS="$JVM_OPTS -Xms${HEAP_SIZE}g"           # 초기 힙 크기
JVM_OPTS="$JVM_OPTS -Xmx${HEAP_SIZE}g"           # 최대 힙 크기
JVM_OPTS="$JVM_OPTS -XX:NewRatio=3"              # Old:Young = 3:1
JVM_OPTS="$JVM_OPTS -XX:MaxMetaspaceSize=512m"   # Metaspace 크기

# ============ GC 최적화 ============
# G1 GC 사용 (Java 9+에서 기본값)
JVM_OPTS="$JVM_OPTS -XX:+UseG1GC"
JVM_OPTS="$JVM_OPTS -XX:MaxGCPauseMillis=200"    # 최대 GC 일시정지 시간
JVM_OPTS="$JVM_OPTS -XX:G1HeapRegionSize=16m"    # G1 힙 리전 크기
JVM_OPTS="$JVM_OPTS -XX:+G1UseAdaptiveIHOP"      # 적응형 IHOP

# 또는 ZGC 사용 (Java 11+, 대용량 힙용)
# JVM_OPTS="$JVM_OPTS -XX:+UnlockExperimentalVMOptions -XX:+UseZGC"

# ============ JIT 컴파일러 최적화 ============
JVM_OPTS="$JVM_OPTS -XX:+TieredCompilation"      # 계층형 컴파일레이션
JVM_OPTS="$JVM_OPTS -XX:TieredStopAtLevel=4"     # C2 컴파일러까지 사용
JVM_OPTS="$JVM_OPTS -XX:CompileThreshold=1000"   # 컴파일 임계값

# ============ 성능 모니터링 ============
JVM_OPTS="$JVM_OPTS -XX:+PrintGC"                # GC 로그 출력
JVM_OPTS="$JVM_OPTS -XX:+PrintGCDetails"
JVM_OPTS="$JVM_OPTS -XX:+PrintGCTimeStamps"
JVM_OPTS="$JVM_OPTS -XX:+PrintGCApplicationStoppedTime"
JVM_OPTS="$JVM_OPTS -Xloggc:/var/log/gc.log"
JVM_OPTS="$JVM_OPTS -XX:+UseGCLogFileRotation"
JVM_OPTS="$JVM_OPTS -XX:NumberOfGCLogFiles=10"
JVM_OPTS="$JVM_OPTS -XX:GCLogFileSize=100M"

# ============ JFR (Java Flight Recorder) ============
JVM_OPTS="$JVM_OPTS -XX:+FlightRecorder"
JVM_OPTS="$JVM_OPTS -XX:StartFlightRecording=duration=60s,filename=/tmp/flight.jfr"

# ============ 네트워크 최적화 ============
JVM_OPTS="$JVM_OPTS -Djava.net.preferIPv4Stack=true"
JVM_OPTS="$JVM_OPTS -Djava.awt.headless=true"

# ============ 보안 최적화 (필요시) ============
JVM_OPTS="$JVM_OPTS -Djava.security.egd=file:/dev/urandom"  # 엔트로피 소스

echo "최적화된 JVM 옵션:"
echo "JAVA_OPTS=\"$JVM_OPTS\""

# 설정 파일에 저장
echo "export JAVA_OPTS=\"$JVM_OPTS\"" > /tmp/jvm_optimized.sh
echo "JVM 설정이 /tmp/jvm_optimized.sh에 저장되었습니다."

# 사용법 안내
echo -e ", 사용법:"
echo "source /tmp/jvm_optimized.sh"
echo "java \$JAVA_OPTS -jar your-application.jar"

# GC 로그 분석 도구 추천
echo -e ", GC 로그 분석 도구:"
echo "1. GCViewer: https://github.com/chewiebug/GCViewer"
echo "2. GCPlot: https://gcplot.com/"
echo "3. CRaC (Coordinated Restore at Checkpoint): Java 17+"
```

## 데이터베이스 연결 풀 최적화

```java
// ConnectionPoolOptimizer.java - 데이터베이스 연결 풀 최적화
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.concurrent.TimeUnit;

public class ConnectionPoolOptimizer {
    
    public static HikariDataSource createOptimizedPool(
            String jdbcUrl, 
            String username, 
            String password) {
        
        HikariConfig config = new HikariConfig();
        
        // 기본 연결 정보
        config.setJdbcUrl(jdbcUrl);
        config.setUsername(username);
        config.setPassword(password);
        
        // ============ 연결 풀 크기 최적화 ============
        // 공식: CPU 코어 수 * 2 + 1 (I/O bound 작업의 경우)
        int coreCount = Runtime.getRuntime().availableProcessors();
        int maxPoolSize = coreCount * 2 + 1;
        
        config.setMinimumIdle(5);                    // 최소 유휴 연결 수
        config.setMaximumPoolSize(maxPoolSize);      // 최대 연결 수
        
        // ============ 타임아웃 설정 ============
        config.setConnectionTimeout(30000);         // 연결 대기 시간 (30초)
        config.setIdleTimeout(600000);              // 유휴 연결 타임아웃 (10분)
        config.setMaxLifetime(1800000);             // 연결 최대 수명 (30분)
        config.setLeakDetectionThreshold(60000);    // 연결 누수 탐지 (1분)
        
        // ============ 유효성 검사 ============
        config.setValidationTimeout(5000);          // 유효성 검사 타임아웃
        config.setConnectionTestQuery("SELECT 1");  // 연결 테스트 쿼리
        
        // ============ 성능 최적화 ============
        config.addDataSourceProperty("cachePrepStmts", "true");
        config.addDataSourceProperty("prepStmtCacheSize", "250");
        config.addDataSourceProperty("prepStmtCacheSqlLimit", "2048");
        config.addDataSourceProperty("useServerPrepStmts", "true");
        config.addDataSourceProperty("useLocalSessionState", "true");
        config.addDataSourceProperty("rewriteBatchedStatements", "true");
        config.addDataSourceProperty("cacheResultSetMetadata", "true");
        config.addDataSourceProperty("cacheServerConfiguration", "true");
        config.addDataSourceProperty("elideSetAutoCommits", "true");
        config.addDataSourceProperty("maintainTimeStats", "false");
        
        // ============ 모니터링 설정 ============
        config.setPoolName("OptimizedPool");
        config.setRegisterMbeans(true);             // JMX 모니터링 활성화
        
        System.out.println("데이터베이스 연결 풀 설정:");
        System.out.println("  CPU 코어 수: " + coreCount);
        System.out.println("  최대 연결 수: " + maxPoolSize);
        System.out.println("  최소 유휴 연결 수: " + config.getMinimumIdle());
        
        return new HikariDataSource(config);
    }
    
    // 연결 풀 성능 모니터링
    public static void monitorPool(HikariDataSource dataSource) {
        System.out.println("=== 연결 풀 모니터링 ===");
        System.out.println("활성 연결 수: " + dataSource.getHikariPoolMXBean().getActiveConnections());
        System.out.println("유휴 연결 수: " + dataSource.getHikariPoolMXBean().getIdleConnections());
        System.out.println("대기 중인 스레드 수: " + dataSource.getHikariPoolMXBean().getThreadsAwaitingConnection());
        System.out.println("총 연결 수: " + dataSource.getHikariPoolMXBean().getTotalConnections());
    }
    
    // 연결 풀 성능 테스트
    public static void performanceTest(HikariDataSource dataSource) throws SQLException {
        System.out.println("=== 연결 풀 성능 테스트 ===");
        
        long startTime = System.nanoTime();
        int iterations = 1000;
        
        for (int i = 0; i < iterations; i++) {
            try (Connection conn = dataSource.getConnection()) {
                // 간단한 쿼리 실행
                conn.prepareStatement("SELECT 1").executeQuery();
            }
        }
        
        long endTime = System.nanoTime();
        long duration = TimeUnit.NANOSECONDS.toMillis(endTime - startTime);
        
        System.out.println("총 " + iterations + "회 연결 테스트 완료");
        System.out.println("총 소요 시간: " + duration + "ms");
        System.out.println("평균 연결 시간: " + (duration / (double) iterations) + "ms");
        System.out.println("초당 연결 수: " + (iterations * 1000L / duration));
    }
    
    public static void main(String[] args) throws SQLException {
        // 연결 풀 생성
        HikariDataSource dataSource = createOptimizedPool(
            "jdbc:mysql://localhost:3306/testdb",
            "user",
            "password"
        );
        
        // 성능 테스트 실행
        performanceTest(dataSource);
        
        // 모니터링 정보 출력
        monitorPool(dataSource);
        
        // 정리
        dataSource.close();
    }
}
```

## 핵심 요점

### 1. JVM 메모리 관리 최적화

힙 크기, GC 알고리즘, 세대 비율 등을 애플리케이션 특성에 맞게 조정하여 성능 극대화

### 2. 데이터베이스 연결 효율성

연결 풀 크기, 타임아웃, 캐시 설정 등을 최적화하여 DB 연결 오버헤드 최소화

### 3. 실시간 모니터링

JFR, JMX 등을 활용하여 애플리케이션 성능 지표를 실시간으로 모니터링하고 최적화 방향 결정

---

**이전**: [05b-os-kernel-tuning.md](05b-os-kernel-tuning.md)  
**다음**: [05d-load-balancing-caching.md](05d-load-balancing-caching.md)에서 로드 밸런싱과 캐싱 전략을 학습합니다.
