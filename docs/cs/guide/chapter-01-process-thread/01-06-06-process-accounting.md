---
tags:
  - hands-on
  - intermediate
  - medium-read
  - monitoring
  - performance-analysis
  - process-accounting
  - security
  - system-audit
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "3-5시간"
main_topic: "시스템 프로그래밍"
priority_score: 3
---

# 1.6.6: Process Accounting

## 프로세스 실행 기록 추적으로 시스템 감사 마스터하기

Process Accounting은 시스템에서 실행되는 모든 프로세스의 상세한 로그를 기록하는 기능입니다. 보안 감사, 성능 분석, 리소스 사용률 추적에 필수적인 도구입니다.

## 4. Process Accounting 활용

### 4.1 Process Accounting 설정

```bash
#!/bin/bash
# setup_process_accounting.sh

echo "=== Process Accounting 설정 ==="

# 패키지 설치 확인
check_packages() {
    if command -v accton >/dev/null 2>&1; then
        echo "✅ acct 패키지가 설치되어 있습니다."
    else
        echo "acct 패키지를 설치합니다..."
        apt-get update && apt-get install -y acct
    fi
}

# Process Accounting 활성화
enable_accounting() {
    local acct_file="/var/log/account/pacct"

    # 로그 디렉토리 생성
    mkdir -p "$(dirname "$acct_file")"

    # Accounting 활성화
    accton "$acct_file"

    if [ $? -eq 0 ]; then
        echo "✅ Process Accounting 활성화 완료"
        echo "로그 파일: $acct_file"
    else
        echo "❌ Process Accounting 활성화 실패"
        return 1
    fi

    # 자동 시작 설정
    cat > /etc/systemd/system/process-accounting.service << 'EOF'
[Unit]
Description=Process Accounting
DefaultDependencies=no
After=local-fs.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/accton /var/log/account/pacct
RemainAfterExit=yes

[Install]
WantedBy=sysinit.target
EOF

    systemctl enable process-accounting
    echo "✅ 시스템 시작 시 자동 활성화 설정 완료"
}

# Accounting 정보 분석
analyze_accounting() {
    echo "=== Process Accounting 분석 ==="

    if [ ! -f "/var/log/account/pacct" ]; then
        echo "❌ Accounting이 활성화되지 않았습니다."
        return 1
    fi

    echo "1. 명령어 사용 빈도 (상위 10개):"
    lastcomm | awk '{print $1}' | sort | uniq -c | sort -nr | head -10

    echo -e "\n2. 사용자별 프로세스 실행 수:"
    lastcomm | awk '{print $2}' | sort | uniq -c | sort -nr

    echo -e "\n3. 최근 종료된 프로세스들:"
    lastcomm | head -20

    echo -e "\n4. 시스템 리소스 사용량이 높은 프로세스들:"
    sa -a | head -10

    echo -e "\n5. 사용자별 CPU 시간 요약:"
    sa -u | head -10
}

# 특정 프로세스 추적
track_process() {
    local process_name=$1

    if [ -z "$process_name" ]; then
        read -p "추적할 프로세스 이름: " process_name
    fi

    echo "프로세스 '$process_name' 추적 결과:"

    # 실행 빈도
    local count=$(lastcomm "$process_name" | wc -l)
    echo "실행 횟수: $count"

    # 최근 실행 기록
    echo -e "\n최근 실행 기록:"
    lastcomm "$process_name" | head -10

    # 리소스 사용량
    echo -e "\n리소스 사용량 요약:"
    sa -c | grep "$process_name"
}

# 메뉴
echo "1) 패키지 확인 및 설치"
echo "2) Process Accounting 활성화"
echo "3) Accounting 정보 분석"
echo "4) 특정 프로세스 추적"
echo "5) 전체 설정 (1+2)"
echo "6) 종료"

read -p "선택하세요 (1-6): " choice

case $choice in
    1)
        check_packages
        ;;
    2)
        enable_accounting
        ;;
    3)
        analyze_accounting
        ;;
    4)
        read -p "추적할 프로세스 이름: " process_name
        track_process "$process_name"
        ;;
    5)
        check_packages
        enable_accounting
        ;;
    6)
        echo "종료합니다."
        ;;
    *)
        echo "잘못된 선택입니다."
        ;;
esac
```

## Process Accounting 실전 활용법

### 1. 보안 감사에 활용

**비정상적인 프로세스 실행 감지**:

```bash
#!/bin/bash
# security_audit.sh

# 수상한 시스템 명령어 목록
SUSPICIOUS_COMMANDS="nc netcat telnet wget curl python perl ruby base64 xxd"
RECENT_HOURS=24

echo "=== 보안 감사 결과 (최근 ${RECENT_HOURS}시간) ==="

# 최근 실행된 수상한 명령어 찾기
for cmd in $SUSPICIOUS_COMMANDS; do
    echo "\n검사 중: $cmd"
    lastcomm "$cmd" | head -5
done

# root 권한으로 실행된 명령어
echo "\n=== Root 권한 실행 명령어 ==="
lastcomm | awk '$2 == "root" {print $1}' | sort | uniq -c | sort -nr | head -10

# 비정상적인 시간대 활동
echo "\n=== 심야 시간 활동 (22:00-06:00) ==="
lastcomm | awk '
{
    # 시간 추출 및 심야 시간 체크 로직
    time = $4
    hour = substr(time, 1, 2)
    if (hour >= 22 || hour <= 6) {
        print $0
    }
}' | head -10
```

### 2. 성능 분석에 활용

**CPU 집약적 프로세스 식별**:

```bash
#!/bin/bash
# performance_analysis.sh

echo "=== CPU 사용률 분석 ==="

# CPU 시간이 많이 소요된 프로세스
echo "1. CPU 시간 상위 10개 프로세스:"
sa -c | sort -k2 -nr | head -10

# 메모리 사용량이 많은 프로세스
echo "\n2. 메모리 사용량 상위 10개 프로세스:"
sa -k | sort -k3 -nr | head -10

# I/O 집약적 프로세스
echo "\n3. I/O 블록 횟수 상위 10개 프로세스:"
sa -i | sort -k4 -nr | head -10

# 프로세스 실행 빈도 상위 10개
echo "\n4. 실행 빈도 상위 10개 프로세스:"
sa -c | sort -k1 -nr | head -10
```

### 3. 자동화된 모니터링

**주기적 리포트 생성**:

```bash
#!/bin/bash
# accounting_report.sh

REPORT_DIR="/var/log/process_reports"
DATE=$(date +"%Y-%m-%d")
REPORT_FILE="$REPORT_DIR/process_report_$DATE.txt"

# 리포트 디렉토리 생성
mkdir -p "$REPORT_DIR"

generate_daily_report() {
    echo "=== 프로세스 일일 리포트 - $DATE ===" > "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    echo "1. 오늘 가장 많이 실행된 명령어:" >> "$REPORT_FILE"
    lastcomm | head -100 | awk '{print $1}' | sort | uniq -c | sort -nr | head -10 >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    echo "2. 사용자별 프로세스 실행 수:" >> "$REPORT_FILE"
    lastcomm | head -100 | awk '{print $2}' | sort | uniq -c | sort -nr >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    echo "3. CPU 사용량 상위 10개 프로세스:" >> "$REPORT_FILE"
    sa -c | sort -k2 -nr | head -10 >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    echo "4. 비정상적 활동 감지:" >> "$REPORT_FILE"
    # 심야 시간 활동
    lastcomm | awk '
    {
        time = $4
        hour = substr(time, 1, 2)
        if (hour >= 22 || hour <= 6) {
            print "[NIGHT ACTIVITY] " $0
        }
    }' | head -5 >> "$REPORT_FILE"
    
    echo "리포트 생성 완료: $REPORT_FILE"
}

# cron으로 매일 실행: 0 1 * * * /path/to/accounting_report.sh
generate_daily_report

# 일주일 전 리포트 삭제
find "$REPORT_DIR" -name "process_report_*.txt" -mtime +7 -delete
```

### 4. Process Accounting 최적화

**로그 로테이션 설정**:

```bash
# /etc/logrotate.d/psacct
/var/log/account/pacct {
    daily
    rotate 30
    compress
    notifempty
    create 0644 root root
    postrotate
        /usr/sbin/accton /var/log/account/pacct
    endscript
}
```

**디스크 사용률 모니터링**:

```bash
#!/bin/bash
# monitor_accounting_disk.sh

ACCOUNTING_DIR="/var/log/account"
WARN_THRESHOLD=80  # 80% 사용률에서 경고
CRIT_THRESHOLD=90  # 90% 사용률에서 비상

check_disk_usage() {
    local usage=$(df "$ACCOUNTING_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$usage" -gt "$CRIT_THRESHOLD" ]; then
        echo "CRITICAL: Process accounting disk usage at ${usage}%"
        # 작업 로그 압축
        gzip /var/log/account/pacct.1 2>/dev/null
        # 오래된 로그 삭제
        find "$ACCOUNTING_DIR" -name "*.gz" -mtime +14 -delete
    elif [ "$usage" -gt "$WARN_THRESHOLD" ]; then
        echo "WARNING: Process accounting disk usage at ${usage}%"
    fi
}

check_disk_usage
```

---

**이전**: [05c-zombie-process-handling.md](./05c-zombie-process-handling.md)  
**다음**: 다음 단계는 각 장의 고급 주제들을 학습하거나 다른 챕터로 이동하세요.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 3-5시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-01-process-thread)

- [Chapter 4-1: 프로세스 생성과 종료 개요](./04-10-process-creation.md)
- [Chapter 4-1A: fork() 시스템 콜과 프로세스 복제 메커니즘](./04-11-process-creation-fork.md)
- [Chapter 4-1B: exec() 패밀리와 프로그램 교체 메커니즘](./04-12-program-replacement-exec.md)
- [Chapter 4-1C: 프로세스 종료와 좀비 처리](./04-13-process-termination-zombies.md)
- [Chapter 4-1D: 프로세스 관리와 모니터링](./04-40-process-management-monitoring.md)

### 🏷️ 관련 키워드

`process-accounting`, `system-audit`, `monitoring`, `security`, `performance-analysis`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
