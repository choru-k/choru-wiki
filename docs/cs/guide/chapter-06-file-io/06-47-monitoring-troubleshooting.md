---
tags:
  - NFS
  - hands-on
  - intermediate
  - medium-read
  - 모니터링
  - 보안
  - 인프라스트럭처
  - 트러블슈팅
  - 프로덕션
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# Chapter.06.07D 모니터링 및 트러블슈팅

## 프로덕션 환경에서의 실전 운영 지침

네트워크 파일시스템의 안정적인 운영을 위해서는 체계적인 모니터링과 신속한 문제 해결 능력이 필수입니다. 이 문서에서는 실시간 성능 모니터링 시스템 구축, 일반적인 문제들의 진단 및 해결 방법, 그리고 프로덕션 환경에서의 베스트 프랙티스를 다룹니다.

## 실시간 성능 모니터링 시스템

### 종합 모니터링 스크립트

```bash
#!/bin/bash
# nfs_comprehensive_monitor.sh

set -euo pipefail

# 설정
MONITOR_INTERVAL=60
LOG_FILE="/var/log/nfs_monitor.log"
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEM=85
ALERT_THRESHOLD_LATENCY=100

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_message() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# NFS 서버 상태 모니터링
monitor_nfs_server() {
    echo "=== NFS 서버 상태 모니터링 ==="
    
    # 1. NFS 데몬 상태
    local nfsd_count
    nfsd_count=$(pgrep -c nfsd || echo "0")
    
    if [[ $nfsd_count -eq 0 ]]; then
        log_message "${RED}❌ NFS 데몬이 실행되지 않고 있습니다${NC}"
        return 1
    else
        log_message "${GREEN}✅ NFS 데몬: $nfsd_count 개 실행 중${NC}"
    fi

    # 2. NFS 포트 상태 확인
    local nfs_ports=(111 2049 20048)
    for port in "${nfs_ports[@]}"; do
        if ss -tuln | grep -q ":$port "; then
            log_message "${GREEN}✅ 포트 $port: 정상${NC}"
        else
            log_message "${RED}❌ 포트 $port: 비정상${NC}"
        fi
    done

    # 3. 마운트 포인트 상태
    if command -v exportfs >/dev/null 2>&1; then
        local export_count
        export_count=$(exportfs | wc -l)
        log_message "${BLUE}📊 내보내기 개수: $export_count${NC}"
        
        if [[ $export_count -eq 0 ]]; then
            log_message "${YELLOW}⚠️ 내보내기가 설정되지 않았습니다${NC}"
        fi
    fi
}

# 클라이언트 연결 모니터링
monitor_client_connections() {
    echo ""
    echo "=== 클라이언트 연결 모니터링 ==="
    
    # 현재 연결된 클라이언트 수
    local active_connections
    active_connections=$(ss -tuln | grep ":2049" | wc -l)
    log_message "${BLUE}🔗 활성 NFS 연결: $active_connections${NC}"

    # 클라이언트 IP별 연결 통계
    if [[ $active_connections -gt 0 ]]; then
        echo "클라이언트별 연결 현황:"
        ss -tun | grep ":2049" | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -10
    fi

    # 연결 상태별 통계
    local established=$(ss -tun state established sport = :2049 | wc -l)
    local time_wait=$(ss -tun state time-wait sport = :2049 | wc -l)
    
    log_message "${BLUE}📈 연결 상태 - ESTABLISHED: $established, TIME_WAIT: $time_wait${NC}"
}

# 시스템 리소스 모니터링
monitor_system_resources() {
    echo ""
    echo "=== 시스템 리소스 모니터링 ==="

    # CPU 사용률
    local cpu_usage
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    
    if (( $(echo "$cpu_usage > $ALERT_THRESHOLD_CPU" | bc -l) )); then
        log_message "${RED}🚨 높은 CPU 사용률: ${cpu_usage}%${NC}"
    else
        log_message "${GREEN}💻 CPU 사용률: ${cpu_usage}%${NC}"
    fi

    # 메모리 사용률
    local mem_info
    mem_info=$(free | awk '/^Mem:/ {printf "%.1f %.1f", $3/1024/1024, ($3/$2)*100}')
    read -r mem_used mem_percent <<< "$mem_info"
    
    if (( $(echo "$mem_percent > $ALERT_THRESHOLD_MEM" | bc -l) )); then
        log_message "${RED}🚨 높은 메모리 사용률: ${mem_used}GB (${mem_percent}%)${NC}"
    else
        log_message "${GREEN}💾 메모리 사용률: ${mem_used}GB (${mem_percent}%)${NC}"
    fi

    # 디스크 사용률 (NFS 내보내기 경로)
    while read -r filesystem size used avail percent mountpoint; do
        if [[ "$mountpoint" =~ ^/export ]] || [[ "$mountpoint" =~ ^/srv ]] || [[ "$mountpoint" =~ ^/data ]]; then
            local disk_percent=${percent%\%}
            if [[ $disk_percent -gt 85 ]]; then
                log_message "${RED}🚨 디스크 사용률 높음: $mountpoint ($percent)${NC}"
            else
                log_message "${GREEN}💿 디스크 사용률: $mountpoint ($percent)${NC}"
            fi
        fi
    done < <(df -h | tail -n +2)
}

# NFS 성능 메트릭 수집
collect_performance_metrics() {
    echo ""
    echo "=== NFS 성능 메트릭 ==="

    if command -v nfsstat >/dev/null 2>&1; then
        # NFS 서버 통계
        local nfs_calls
        nfs_calls=$(nfsstat -s | grep "calls" | awk '{print $1}')
        log_message "${BLUE}📊 총 NFS 호출: $nfs_calls${NC}"

        # 에러율 확인
        local error_count
        error_count=$(nfsstat -s | grep -i "error\|bad" | wc -l)
        if [[ $error_count -gt 0 ]]; then
            log_message "${YELLOW}⚠️ NFS 에러 발견 - 상세 확인 필요${NC}"
            nfsstat -s | grep -i "error\|bad"
        fi
    fi

    # I/O 통계 (iostat 사용)
    if command -v iostat >/dev/null 2>&1; then
        echo ""
        echo "📈 I/O 성능 통계:"
        iostat -x 1 1 | grep -E "(Device|sd|nvme)" | tail -n +2 | while read -r line; do
            echo "   $line"
        done
    fi
}

# 네트워크 성능 모니터링
monitor_network_performance() {
    echo ""
    echo "=== 네트워크 성능 모니터링 ==="

    # 네트워크 인터페이스 통계
    local interface="eth0"  # 주요 네트워크 인터페이스
    
    if [[ -d "/sys/class/net/$interface" ]]; then
        local rx_bytes=$(cat "/sys/class/net/$interface/statistics/rx_bytes")
        local tx_bytes=$(cat "/sys/class/net/$interface/statistics/tx_bytes")
        local rx_errors=$(cat "/sys/class/net/$interface/statistics/rx_errors")
        local tx_errors=$(cat "/sys/class/net/$interface/statistics/tx_errors")

        log_message "${BLUE}🌐 네트워크 $interface: RX ${rx_bytes} bytes, TX ${tx_bytes} bytes${NC}"
        
        if [[ $rx_errors -gt 0 ]] || [[ $tx_errors -gt 0 ]]; then
            log_message "${RED}🚨 네트워크 에러: RX $rx_errors, TX $tx_errors${NC}"
        fi
    fi

    # TCP 연결 상태
    local tcp_connections
    tcp_connections=$(ss -s | grep "TCP:" | awk '{print $2}')
    log_message "${BLUE}🔌 총 TCP 연결: $tcp_connections${NC}"
}

# 알림 시스템
send_alert() {
    local severity=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # 로그에 기록
    echo "[$timestamp] ALERT[$severity]: $message" >> "$LOG_FILE.alerts"
    
    # 이메일 알림 (sendmail 설치 시)
    if command -v sendmail >/dev/null 2>&1; then
        {
            echo "Subject: NFS Server Alert - $severity"
            echo "From: nfs-monitor@$(hostname)"
            echo "To: admin@company.com"
            echo ""
            echo "NFS Server Alert"
            echo "Time: $timestamp"
            echo "Severity: $severity"
            echo "Message: $message"
            echo ""
            echo "Server: $(hostname)"
        } | sendmail admin@company.com
    fi

    # Slack 알림 (webhook URL 설정 시)
    local slack_webhook="${SLACK_WEBHOOK_URL:-}"
    if [[ -n "$slack_webhook" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 NFS Alert [$severity]: $message\"}" \
            "$slack_webhook" &>/dev/null
    fi
}

# 자동 복구 시도
attempt_auto_recovery() {
    local issue_type=$1
    
    log_message "${YELLOW}🔧 자동 복구 시도: $issue_type${NC}"
    
    case "$issue_type" in
        "nfs_daemon_down")
            systemctl restart nfs-server
            sleep 5
            if systemctl is-active nfs-server >/dev/null; then
                log_message "${GREEN}✅ NFS 서버 자동 복구 성공${NC}"
                send_alert "INFO" "NFS 서버가 자동으로 복구되었습니다"
            else
                send_alert "CRITICAL" "NFS 서버 자동 복구 실패"
            fi
            ;;
            
        "high_memory")
            # 메모리 정리
            sync
            echo 3 > /proc/sys/vm/drop_caches
            log_message "${BLUE}💧 시스템 캐시 정리 완료${NC}"
            ;;
            
        "export_missing")
            exportfs -ra
            log_message "${BLUE}🔄 NFS 내보내기 새로고침 완료${NC}"
            ;;
    esac
}

# 상세 진단 모드
detailed_diagnostics() {
    echo ""
    echo "=== 상세 진단 모드 ==="

    # 1. NFS 버전 및 설정 확인
    echo ""
    echo "🔍 NFS 설정 진단:"
    
    if [[ -f /proc/fs/nfsd/versions ]]; then
        local nfs_versions
        nfs_versions=$(cat /proc/fs/nfsd/versions)
        echo "   지원 NFS 버전: $nfs_versions"
    fi

    if [[ -f /proc/fs/nfsd/threads ]]; then
        local nfsd_threads
        nfsd_threads=$(cat /proc/fs/nfsd/threads)
        echo "   NFS 데몬 스레드: $nfsd_threads"
    fi

    # 2. 네트워크 설정 진단
    echo ""
    echo "🌐 네트워크 설정 진단:"
    
    local rmem_max=$(sysctl -n net.core.rmem_max)
    local wmem_max=$(sysctl -n net.core.wmem_max)
    echo "   수신 버퍼 최대: $rmem_max bytes"
    echo "   송신 버퍼 최대: $wmem_max bytes"

    if [[ $rmem_max -lt 16777216 ]] || [[ $wmem_max -lt 16777216 ]]; then
        echo "   ⚠️ 네트워크 버퍼가 작을 수 있습니다 (권장: 16MB)"
    fi

    # 3. 스토리지 성능 진단
    echo ""
    echo "💿 스토리지 성능 진단:"
    
    # 간단한 I/O 테스트
    for mount_point in /export/* /srv/* /data/*; do
        if [[ -d "$mount_point" ]]; then
            echo "   테스트: $mount_point"
            local test_file="$mount_point/.nfs_monitor_test"
            
            # 쓰기 테스트
            local write_start=$(date +%s.%N)
            dd if=/dev/zero of="$test_file" bs=1M count=10 oflag=direct 2>/dev/null || true
            local write_end=$(date +%s.%N)
            
            # 읽기 테스트
            local read_start=$(date +%s.%N)
            dd if="$test_file" of=/dev/null bs=1M iflag=direct 2>/dev/null || true
            local read_end=$(date +%s.%N)
            
            local write_speed=$(echo "scale=2; 10 / ($write_end - $write_start)" | bc)
            local read_speed=$(echo "scale=2; 10 / ($read_end - $read_start)" | bc)
            
            echo "      쓰기: ${write_speed} MB/s, 읽기: ${read_speed} MB/s"
            
            rm -f "$test_file"
        fi
    done
}

# 메인 모니터링 루프
main_monitoring_loop() {
    local detailed=${1:-false}
    
    log_message "${GREEN}🚀 NFS 모니터링 시작${NC}"
    
    while true; do
        {
            monitor_nfs_server
            monitor_client_connections  
            monitor_system_resources
            collect_performance_metrics
            monitor_network_performance
            
            if [[ "$detailed" == "true" ]]; then
                detailed_diagnostics
            fi
            
        } 2>&1 | while IFS= read -r line; do
            echo "$line"
            
            # 알림 조건 확인
            if [[ "$line" =~ 🚨 ]]; then
                send_alert "CRITICAL" "$line"
                
                # 자동 복구 시도
                if [[ "$line" =~ "NFS 데몬" ]]; then
                    attempt_auto_recovery "nfs_daemon_down"
                elif [[ "$line" =~ "메모리" ]]; then
                    attempt_auto_recovery "high_memory"
                fi
            elif [[ "$line" =~ ⚠️ ]]; then
                send_alert "WARNING" "$line"
            fi
        done
        
        echo ""
        log_message "${BLUE}⏱️ 다음 모니터링까지 ${MONITOR_INTERVAL}초 대기${NC}"
        sleep "$MONITOR_INTERVAL"
    done
}

# 사용법
usage() {
    echo "NFS 종합 모니터링 도구"
    echo ""
    echo "사용법:"
    echo "  $0 [start|detailed|once|status]"
    echo ""
    echo "옵션:"
    echo "  start     - 연속 모니터링 시작"
    echo "  detailed  - 상세 진단과 함께 연속 모니터링"
    echo "  once      - 1회만 모니터링 실행"
    echo "  status    - 현재 상태 확인"
}

# 스크립트 실행
case "${1:-once}" in
    "start")
        main_monitoring_loop false
        ;;
    "detailed")
        main_monitoring_loop true
        ;;
    "once")
        monitor_nfs_server
        monitor_client_connections
        monitor_system_resources
        collect_performance_metrics
        monitor_network_performance
        ;;
    "status")
        tail -n 20 "$LOG_FILE"
        ;;
    *)
        usage
        exit 1
        ;;
esac
```

## 일반적인 문제 진단 및 해결

### 문제별 트러블슈팅 가이드

```bash
#!/bin/bash
# nfs_troubleshooter.sh

# 문제 진단 및 해결 스크립트

troubleshoot_mount_issues() {
    echo "=== NFS 마운트 문제 진단 ==="
    
    local server=$1
    local export_path=$2
    local mount_point=$3
    
    echo "서버: $server"
    echo "내보내기: $export_path"
    echo "마운트포인트: $mount_point"
    echo ""

    # 1. 기본 연결성 확인
    echo "🔍 1단계: 네트워크 연결성 확인"
    if ping -c 3 -W 3 "$server" >/dev/null 2>&1; then
        echo "✅ 서버 $server 접근 가능"
    else
        echo "❌ 서버 $server 접근 불가"
        echo "🔧 해결방법:"
        echo "   - 네트워크 연결 상태 확인"
        echo "   - 방화벽 설정 확인"
        echo "   - DNS 해상도 확인"
        return 1
    fi

    # 2. NFS 포트 확인
    echo ""
    echo "🔍 2단계: NFS 서비스 포트 확인"
    local nfs_ports=(111 2049 20048)
    for port in "${nfs_ports[@]}"; do
        if nc -z -w 5 "$server" "$port" 2>/dev/null; then
            echo "✅ 포트 $port 접근 가능"
        else
            echo "❌ 포트 $port 접근 불가"
            case $port in
                111) echo "   - portmapper(rpcbind) 서비스 확인 필요" ;;
                2049) echo "   - nfsd 서비스 확인 필요" ;;
                20048) echo "   - nfs-mountd 서비스 확인 필요" ;;
            esac
        fi
    done

    # 3. RPC 서비스 확인
    echo ""
    echo "🔍 3단계: RPC 서비스 확인"
    if command -v rpcinfo >/dev/null 2>&1; then
        echo "RPC 서비스 목록:"
        rpcinfo -p "$server" 2>/dev/null | grep -E "(nfs|mount)" || {
            echo "❌ NFS RPC 서비스를 찾을 수 없음"
            echo "🔧 서버에서 다음 명령으로 확인:"
            echo "   systemctl status nfs-server"
            echo "   exportfs -v"
        }
    fi

    # 4. 내보내기 확인
    echo ""
    echo "🔍 4단계: 내보내기 설정 확인"
    if command -v showmount >/dev/null 2>&1; then
        local exports
        exports=$(showmount -e "$server" 2>/dev/null)
        if [[ -n "$exports" ]]; then
            echo "사용 가능한 내보내기:"
            echo "$exports"
            
            if echo "$exports" | grep -q "$export_path"; then
                echo "✅ 요청한 내보내기 경로 발견"
            else
                echo "❌ 요청한 내보내기 경로를 찾을 수 없음"
                echo "🔧 서버의 /etc/exports 확인 필요"
            fi
        else
            echo "❌ 내보내기 정보를 가져올 수 없음"
        fi
    fi

    # 5. 권한 확인
    echo ""
    echo "🔍 5단계: 마운트 권한 확인"
    local client_ip
    client_ip=$(ip route get "$server" | awk '{print $7; exit}')
    echo "클라이언트 IP: $client_ip"
    echo "🔧 서버에서 다음 사항 확인:"
    echo "   - /etc/exports에서 $client_ip 또는 해당 네트워크 허용"
    echo "   - exportfs -v로 현재 설정 확인"
    echo "   - /var/log/syslog에서 NFS 관련 에러 확인"

    # 6. 실제 마운트 시도
    echo ""
    echo "🔍 6단계: 테스트 마운트 시도"
    local test_mount="/tmp/nfs_test_$$"
    mkdir -p "$test_mount"
    
    if mount -t nfs -o ro,soft,timeo=10,retrans=1 "$server:$export_path" "$test_mount" 2>/tmp/mount_error; then
        echo "✅ 테스트 마운트 성공"
        umount "$test_mount"
        rmdir "$test_mount"
        
        echo ""
        echo "🎉 마운트 가능! 권장 명령어:"
        echo "mount -t nfs4 -o rsize=262144,wsize=262144,hard,intr,proto=tcp $server:$export_path $mount_point"
    else
        echo "❌ 테스트 마운트 실패"
        echo "에러 메시지:"
        cat /tmp/mount_error
        rm -f /tmp/mount_error
        rmdir "$test_mount"
    fi
}

# 성능 문제 진단
troubleshoot_performance_issues() {
    local mount_point=$1
    
    echo "=== NFS 성능 문제 진단: $mount_point ==="
    
    if ! mountpoint -q "$mount_point"; then
        echo "❌ $mount_point는 마운트되지 않았습니다"
        return 1
    fi

    # 현재 마운트 옵션 확인
    echo "🔍 현재 마운트 옵션:"
    mount | grep " $mount_point " | sed 's/.*(\(.*\))/\1/' | tr ',' '\n' | sed 's/^/   - /'

    echo ""
    echo "🔍 성능 영향 요소 분석:"

    # 1. 네트워크 지연시간
    local server
    server=$(mount | grep " $mount_point " | awk '{print $1}' | cut -d: -f1)
    
    if [[ -n "$server" ]]; then
        local latency
        latency=$(ping -c 5 -q "$server" 2>/dev/null | awk -F'/' '/^round-trip/ {print $5}' || echo "N/A")
        echo "   네트워크 지연시간: $latency ms"
        
        if [[ "$latency" != "N/A" ]] && (( $(echo "$latency > 10" | bc -l) )); then
            echo "   ⚠️ 높은 네트워크 지연시간 - WAN 최적화 필요"
            echo "      권장: rsize=1048576,wsize=1048576,async"
        fi
    fi

    # 2. I/O 크기 확인
    local mount_options
    mount_options=$(mount | grep " $mount_point " | sed 's/.*(\(.*\))/\1/')
    
    local rsize=$(echo "$mount_options" | grep -o 'rsize=[0-9]*' | cut -d= -f2)
    local wsize=$(echo "$mount_options" | grep -o 'wsize=[0-9]*' | cut -d= -f2)
    
    echo "   읽기 블록 크기: ${rsize:-기본값} bytes"
    echo "   쓰기 블록 크기: ${wsize:-기본값} bytes"
    
    if [[ -z "$rsize" ]] || [[ $rsize -lt 262144 ]]; then
        echo "   ⚠️ 작은 읽기 블록 크기 - rsize=1048576 권장"
    fi
    if [[ -z "$wsize" ]] || [[ $wsize -lt 262144 ]]; then
        echo "   ⚠️ 작은 쓰기 블록 크기 - wsize=1048576 권장"
    fi

    # 3. 간단한 성능 테스트
    echo ""
    echo "🔍 간단한 성능 테스트:"
    
    local test_file="$mount_point/.perf_test_$$"
    
    # 메타데이터 테스트
    echo "   메타데이터 성능 테스트..."
    local start_time=$(date +%s.%N)
    for i in {1..100}; do
        touch "$test_file.$i" && rm "$test_file.$i"
    done
    local end_time=$(date +%s.%N)
    local metadata_ops=$(echo "scale=1; 100 / ($end_time - $start_time)" | bc)
    echo "      메타데이터: $metadata_ops ops/sec"
    
    if (( $(echo "$metadata_ops < 20" | bc -l) )); then
        echo "      ⚠️ 낮은 메타데이터 성능 - 캐시 설정 조정 필요"
        echo "         권장: ac=300,acdirmin=60,acdirmax=300"
    fi

    # 순차 I/O 테스트  
    echo "   순차 I/O 성능 테스트..."
    start_time=$(date +%s.%N)
    dd if=/dev/zero of="$test_file" bs=1M count=5 2>/dev/null
    sync
    end_time=$(date +%s.%N)
    local write_speed=$(echo "scale=1; 5 / ($end_time - $start_time)" | bc)
    echo "      순차 쓰기: $write_speed MB/s"
    
    start_time=$(date +%s.%N)
    dd if="$test_file" of=/dev/null bs=1M 2>/dev/null
    end_time=$(date +%s.%N)
    local read_speed=$(echo "scale=1; 5 / ($end_time - $start_time)" | bc)
    echo "      순차 읽기: $read_speed MB/s"
    
    rm -f "$test_file"
    
    # 성능 권장사항
    echo ""
    echo "🔧 성능 최적화 권장사항:"
    
    if (( $(echo "$write_speed < 10" | bc -l) )) || (( $(echo "$read_speed < 20" | bc -l) )); then
        echo "   - 더 큰 I/O 블록 크기 사용"
        echo "   - 비동기 I/O 옵션 고려 (async)"  
        echo "   - NFSv4 사용 확인"
        echo "   - 다중 연결 옵션 (nconnect=4)"
    fi
}

# 연결 안정성 진단
troubleshoot_connection_stability() {
    local mount_point=$1
    
    echo "=== NFS 연결 안정성 진단: $mount_point ==="
    
    # 1. 마운트 상태 확인
    if ! mountpoint -q "$mount_point"; then
        echo "❌ $mount_point는 마운트되지 않았습니다"
        return 1
    fi

    # 2. NFS 통계에서 에러 확인
    if command -v nfsstat >/dev/null 2>&1; then
        echo "🔍 NFS 클라이언트 에러 통계:"
        local error_output
        error_output=$(nfsstat -c | grep -i -E "error|timeout|retry|bad")
        
        if [[ -n "$error_output" ]]; then
            echo "$error_output"
            echo ""
            echo "🔧 연결 안정성 개선 방법:"
            echo "   - hard 마운트 옵션 사용"
            echo "   - timeo 값 증가 (timeo=600)"
            echo "   - retrans 값 조정 (retrans=3)"
        else
            echo "✅ NFS 에러 없음"
        fi
    fi

    # 3. 시스템 로그에서 NFS 관련 에러 확인
    echo ""
    echo "🔍 최근 시스템 로그 확인:"
    if journalctl --no-pager -u nfs-client -n 10 2>/dev/null | grep -i error; then
        echo "❌ NFS 클라이언트 에러 발견 - 상세 확인 필요"
    else
        echo "✅ 최근 NFS 에러 없음"
    fi
}

# 사용법
usage() {
    echo "NFS 문제 진단 도구"
    echo ""
    echo "사용법:"
    echo "  $0 mount <server> <export_path> <mount_point>    # 마운트 문제 진단"
    echo "  $0 performance <mount_point>                     # 성능 문제 진단"  
    echo "  $0 stability <mount_point>                       # 연결 안정성 진단"
    echo ""
    echo "예시:"
    echo "  $0 mount 192.168.1.100 /export/data /mnt/nfs"
    echo "  $0 performance /mnt/nfs"
    echo "  $0 stability /mnt/nfs"
}

# 스크립트 실행
case "${1:-help}" in
    "mount")
        if [[ $# -eq 4 ]]; then
            troubleshoot_mount_issues "$2" "$3" "$4"
        else
            echo "사용법: $0 mount <server> <export_path> <mount_point>"
            exit 1
        fi
        ;;
    "performance")
        if [[ $# -eq 2 ]]; then
            troubleshoot_performance_issues "$2"
        else
            echo "사용법: $0 performance <mount_point>"
            exit 1
        fi
        ;;
    "stability")
        if [[ $# -eq 2 ]]; then
            troubleshoot_connection_stability "$2"
        else
            echo "사용법: $0 stability <mount_point>"
            exit 1
        fi
        ;;
    *)
        usage
        exit 1
        ;;
esac
```

## 프로덕션 환경 베스트 프랙티스

### 보안 고려사항

```bash
#!/bin/bash
# nfs_security_hardening.sh

# NFS 보안 강화 스크립트

harden_nfs_security() {
    echo "=== NFS 보안 강화 적용 ==="
    
    # 1. 방화벽 설정
    echo "🔥 방화벽 규칙 적용..."
    
    # UFW 사용 시
    if command -v ufw >/dev/null 2>&1; then
        ufw allow from 192.168.1.0/24 to any port 111
        ufw allow from 192.168.1.0/24 to any port 2049  
        ufw allow from 192.168.1.0/24 to any port 20048
        echo "   ✅ UFW 규칙 적용 완료"
    fi
    
    # iptables 직접 사용 시
    cat << 'EOF' > /tmp/nfs_iptables_rules.sh
#!/bin/bash
# NFS 서비스용 iptables 규칙

# 허용할 클라이언트 네트워크 대역
ALLOWED_NETWORK="192.168.1.0/24"

# NFS 포트 허용
iptables -A INPUT -s $ALLOWED_NETWORK -p tcp --dport 111 -j ACCEPT
iptables -A INPUT -s $ALLOWED_NETWORK -p udp --dport 111 -j ACCEPT
iptables -A INPUT -s $ALLOWED_NETWORK -p tcp --dport 2049 -j ACCEPT
iptables -A INPUT -s $ALLOWED_NETWORK -p tcp --dport 20048 -j ACCEPT

# 기본 정책: 다른 모든 연결 차단
iptables -A INPUT -p tcp --dport 111 -j DROP
iptables -A INPUT -p udp --dport 111 -j DROP
iptables -A INPUT -p tcp --dport 2049 -j DROP
iptables -A INPUT -p tcp --dport 20048 -j DROP

echo "NFS iptables 규칙 적용 완료"
EOF
    
    chmod +x /tmp/nfs_iptables_rules.sh
    echo "   📋 iptables 규칙 스크립트: /tmp/nfs_iptables_rules.sh"
    
    # 2. /etc/exports 보안 강화
    echo ""
    echo "📝 /etc/exports 보안 설정 예제:"
    
    cat << 'EOF'
# 보안 강화된 exports 설정 예제

# 특정 네트워크만 허용, root 권한 차단
/export/data    192.168.1.0/24(rw,sync,no_subtree_check,root_squash,all_squash,anonuid=65534,anongid=65534)

# 읽기 전용, 더 엄격한 제한
/export/public  192.168.1.0/24(ro,sync,no_subtree_check,all_squash,anonuid=65534,anongid=65534,hide)

# 개별 호스트만 허용
/export/secure  192.168.1.100(rw,sync,no_subtree_check,root_squash)

# 보안 옵션 설명:
# - root_squash: root 사용자를 nobody로 매핑
# - all_squash: 모든 사용자를 nobody로 매핑  
# - anonuid/anongid: 익명 사용자 UID/GID 지정
# - hide: 상위 디렉토리에서 숨김
# - secure: 특권 포트(< 1024)에서만 접근 허용
EOF
    
    # 3. NFS 버전 제한
    echo ""
    echo "🔒 NFS 버전 보안 설정:"
    
    echo "# /etc/nfs.conf에 추가할 설정:" > /tmp/nfs_version_security.conf
    echo "[nfsd]" >> /tmp/nfs_version_security.conf
    echo "# NFSv2는 보안상 위험하므로 비활성화" >> /tmp/nfs_version_security.conf  
    echo "vers2=no" >> /tmp/nfs_version_security.conf
    echo "# NFSv4만 사용 (권장)" >> /tmp/nfs_version_security.conf
    echo "vers3=no" >> /tmp/nfs_version_security.conf
    echo "vers4=yes" >> /tmp/nfs_version_security.conf
    echo "vers4.0=yes" >> /tmp/nfs_version_security.conf
    echo "vers4.1=yes" >> /tmp/nfs_version_security.conf
    echo "vers4.2=yes" >> /tmp/nfs_version_security.conf
    
    echo "   📋 NFS 버전 설정: /tmp/nfs_version_security.conf"
    
    # 4. 로깅 강화
    echo ""
    echo "📊 로깅 설정 강화:"
    
    cat << 'EOF' > /tmp/rsyslog_nfs.conf
# NFS 상세 로깅 설정
# /etc/rsyslog.d/50-nfs.conf에 추가

# NFS 서버 로그
daemon.* /var/log/nfs-server.log

# RPC 로그  
local0.* /var/log/rpc.log

# 보안 이벤트
auth,authpriv.* /var/log/auth.log
EOF
    
    echo "   📋 rsyslog 설정: /tmp/rsyslog_nfs.conf"
    
    # 5. 파일 권한 확인
    echo ""
    echo "🔐 중요 파일 권한 확인:"
    
    local files_to_check=(
        "/etc/exports:644:root:root"
        "/etc/fstab:644:root:root"
        "/etc/nfs.conf:644:root:root"
    )
    
    for file_info in "${files_to_check[@]}"; do
        IFS=':' read -r file perm owner group <<< "$file_info"
        if [[ -f "$file" ]]; then
            local current_perm=$(stat -c "%a" "$file")
            local current_owner=$(stat -c "%U:%G" "$file")
            
            echo "   $file: $current_perm ($current_owner)"
            
            if [[ "$current_perm" != "$perm" ]]; then
                echo "      ⚠️ 권한 수정 필요: chmod $perm $file"
            fi
            
            if [[ "$current_owner" != "$owner:$group" ]]; then
                echo "      ⚠️ 소유자 수정 필요: chown $owner:$group $file"
            fi
        fi
    done
}

# Kerberos 인증 설정 (선택사항)
setup_kerberos_nfs() {
    echo ""
    echo "=== Kerberos NFS 설정 (고급 보안) ==="
    
    cat << 'EOF'
Kerberos를 이용한 NFS 보안 강화:

1. 필요 패키지 설치:
   apt install krb5-user nfs-common

2. /etc/krb5.conf 설정:
   [libdefaults]
       default_realm = EXAMPLE.COM
       
   [realms]
       EXAMPLE.COM = {
           kdc = kdc.example.com
           admin_server = kdc.example.com
       }

3. NFS 서비스 주체 생성:
   kadmin: addprinc -randkey nfs/nfs-server.example.com

4. keytab 파일 생성:
   kadmin: ktadd -k /etc/krb5.keytab nfs/nfs-server.example.com

5. /etc/exports에 sec 옵션 추가:
   /export/secure *(rw,sync,sec=krb5p)

6. 클라이언트 마운트:
   mount -t nfs4 -o sec=krb5p server:/export/secure /mnt/secure
EOF
}

# 실행
harden_nfs_security
setup_kerberos_nfs
```

### 고가용성 및 백업 전략

```yaml
# docker-compose.yml - 고가용성 NFS 클러스터
version: '3.8'

services:
  # 주 NFS 서버
  nfs-primary:
    image: itsthenetwork/nfs-server-alpine:latest
    hostname: nfs-primary
    restart: unless-stopped
    privileged: true
    
    environment:
      SHARED_DIRECTORY: /data
      
    volumes:
      - /srv/nfs-primary:/data:rshared
      - ./exports-primary:/etc/exports:ro
      
    networks:
      - nfs-cluster
      
    # 헬스체크
    healthcheck:
      test: ["CMD", "rpcinfo", "-p", "localhost"]
      interval: 30s
      timeout: 10s
      retries: 3
      
    # 주 서버 포트
    ports:
      - "2049:2049"
      - "111:111"
      - "20048:20048"

  # 백업 NFS 서버  
  nfs-secondary:
    image: itsthenetwork/nfs-server-alpine:latest
    hostname: nfs-secondary
    restart: unless-stopped
    privileged: true
    
    environment:
      SHARED_DIRECTORY: /data
      
    volumes:
      - /srv/nfs-secondary:/data:rshared
      - ./exports-secondary:/etc/exports:ro
      
    networks:
      - nfs-cluster
      
    healthcheck:
      test: ["CMD", "rpcinfo", "-p", "localhost"]
      interval: 30s
      timeout: 10s
      retries: 3
      
    # 백업 서버 포트 (다른 포트 사용)
    ports:
      - "12049:2049"
      - "1111:111" 
      - "120048:20048"

  # 로드 밸런서 (HAProxy)
  nfs-loadbalancer:
    image: haproxy:latest
    restart: unless-stopped
    
    volumes:
      - ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro
      
    networks:
      - nfs-cluster
      
    ports:
      - "22049:2049"
      
    depends_on:
      - nfs-primary
      - nfs-secondary

  # 데이터 동기화 (rsync 기반)
  data-sync:
    image: alpine:latest
    restart: unless-stopped
    
    command: >
      sh -c "
        apk add --no-cache rsync openssh-client &&
        while true; do
          rsync -avz --delete /src/ /dst/
          sleep 300
        done
      "
      
    volumes:
      - /srv/nfs-primary:/src:ro
      - /srv/nfs-secondary:/dst
      
    depends_on:
      - nfs-primary
      - nfs-secondary

networks:
  nfs-cluster:
    driver: bridge
```

## 핵심 요점

### 1. 예방적 모니터링의 중요성

문제가 발생한 후 대응하는 것보다 미리 감지하고 예방하는 것이 훨씬 효율적입니다. 종합적인 모니터링 시스템을 구축하여 임계값 기반 알림을 설정하세요.

### 2. 계층적 문제 해결 접근법

네트워크 → RPC → NFS → 파일시스템 순으로 체계적으로 문제를 진단하면 근본 원인을 빠르게 찾을 수 있습니다.

### 3. 보안과 성능의 균형

높은 보안을 위해서는 성능을 일부 희생해야 할 수 있습니다. 환경의 보안 요구사항과 성능 목표 사이에서 적절한 균형점을 찾아야 합니다.

---

**이전**: [서버 튜닝 가이드](chapter-06-file-io/06-36-server-tuning-guide.md)  
**다음**: 다른 I/O 최적화 주제나 네트워크 프로그래밍으로 학습을 확장해보세요.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-06-file-io)

- [Chapter 6-1: 파일 디스크립터의 내부 구조](./06-10-file-descriptor.md)
- [Chapter 6-1A: 파일 디스크립터 기본 개념과 3단계 구조](./06-01-fd-basics-structure.md)
- [Chapter 6-1B: 파일 디스크립터 할당과 공유 메커니즘](./06-11-fd-allocation-management.md)
- [Chapter 6-1C: 파일 연산과 VFS 다형성](./06-12-file-operations-vfs.md)
- [Chapter 6-2: VFS와 파일 시스템 추상화 개요](./06-13-vfs-filesystem.md)

### 🏷️ 관련 키워드

`NFS`, `모니터링`, `트러블슈팅`, `프로덕션`, `보안`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
