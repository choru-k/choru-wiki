---
tags:
  - Network Optimization
  - TCP Tuning
  - Bash Automation
  - System Configuration
  - Performance Tuning
---

# Chapter.07.06b 네트워크 최적화 자동화

## 시스템 레벨 네트워크 성능 튜닝 자동화

네트워크 성능 문제를 발견한 후에는 체계적인 최적화가 필요합니다. 이 섹션에서는 TCP 버퍼 설정, 혼잡 제어 알고리즘, DNS 최적화, 네트워크 큐 튜닝을 자동화하는 포괄적인 Bash 스크립트를 구현합니다.

## 네트워크 최적화 자동화 스크립트

```bash
#!/bin/bash
# network_optimization.sh

set -euo pipefail

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 기본 설정
CONFIG_FILE="network_optimization.conf"
BACKUP_DIR="/etc/network/backup"
SYSCTL_CONF="/etc/sysctl.conf"

# 설정 로드
load_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        source "$CONFIG_FILE"
        log_info "설정 파일 로드: $CONFIG_FILE"
    else
        log_warning "설정 파일이 없습니다. 기본값 사용"
    fi

    # 기본값 설정
    TCP_WINDOW_SCALING=${TCP_WINDOW_SCALING:-1}
    TCP_CONGESTION_CONTROL=${TCP_CONGESTION_CONTROL:-"bbr"}
    TCP_SLOW_START_AFTER_IDLE=${TCP_SLOW_START_AFTER_IDLE:-0}
    NET_CORE_RMEM_MAX=${NET_CORE_RMEM_MAX:-134217728}
    NET_CORE_WMEM_MAX=${NET_CORE_WMEM_MAX:-134217728}
    NET_CORE_NETDEV_MAX_BACKLOG=${NET_CORE_NETDEV_MAX_BACKLOG:-30000}
    TARGET_HOSTS=${TARGET_HOSTS:-"8.8.8.8,1.1.1.1,google.com"}
}

# 백업 생성
create_backup() {
    log_info "시스템 설정 백업 중..."

    sudo mkdir -p "$BACKUP_DIR"

    # 기존 설정 백업
    if [[ -f "$SYSCTL_CONF" ]]; then
        sudo cp "$SYSCTL_CONF" "$BACKUP_DIR/sysctl.conf.backup.$(date +%Y%m%d_%H%M%S)"
        log_success "sysctl.conf 백업 완료"
    fi

    # 네트워크 인터페이스 설정 백업
    if [[ -d "/etc/network" ]]; then
        sudo cp -r /etc/network "$BACKUP_DIR/network.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
    fi

    # 현재 네트워크 설정 정보 저장
    {
        echo "# 백업 시점: $(date)"
        echo "# 네트워크 인터페이스 정보"
        ip addr show
        echo ""
        echo "# 라우팅 테이블"
        ip route show
        echo ""
        echo "# 현재 sysctl 설정"
        sysctl -a 2>/dev/null | grep -E "(net\.|kernel\.)" || true
    } > "$BACKUP_DIR/network_info.$(date +%Y%m%d_%H%M%S).txt"

    log_success "네트워크 설정 백업 완료"
}

# 네트워크 인터페이스 분석
analyze_network_interfaces() {
    log_info "네트워크 인터페이스 분석 중..."

    echo "=== 네트워크 인터페이스 정보 ==="

    # 활성 인터페이스 목록
    local interfaces=$(ip -o link show | awk -F': ' '{print $2}' | grep -v '^lo$')

    for interface in $interfaces; do
        echo ""
        echo "인터페이스: $interface"

        # 인터페이스 상태
        local state=$(ip link show "$interface" | grep -o 'state [A-Z]*' | cut -d' ' -f2)
        echo "  상태: $state"

        # IP 주소
        local ip_addr=$(ip addr show "$interface" | grep 'inet ' | head -1 | awk '{print $2}')
        if [[ -n "$ip_addr" ]]; then
            echo "  IP 주소: $ip_addr"
        fi

        # MTU 크기
        local mtu=$(ip link show "$interface" | grep -o 'mtu [0-9]*' | cut -d' ' -f2)
        echo "  MTU: $mtu"

        # 네트워크 통계
        if [[ -f "/sys/class/net/$interface/statistics/rx_bytes" ]]; then
            local rx_bytes=$(cat "/sys/class/net/$interface/statistics/rx_bytes")
            local tx_bytes=$(cat "/sys/class/net/$interface/statistics/tx_bytes")
            local rx_errors=$(cat "/sys/class/net/$interface/statistics/rx_errors")
            local tx_errors=$(cat "/sys/class/net/$interface/statistics/tx_errors")

            echo "  수신: $(numfmt --to=iec $rx_bytes)B, 오류: $rx_errors"
            echo "  송신: $(numfmt --to=iec $tx_bytes)B, 오류: $tx_errors"
        fi

        # 드라이버 정보
        if command -v ethtool >/dev/null 2>&1; then
            local speed=$(sudo ethtool "$interface" 2>/dev/null | grep "Speed:" | awk '{print $2}' || echo "Unknown")
            local duplex=$(sudo ethtool "$interface" 2>/dev/null | grep "Duplex:" | awk '{print $2}' || echo "Unknown")
            echo "  속도: $speed, 듀플렉스: $duplex"
        fi
    done
}

# TCP 버퍼 크기 최적화
optimize_tcp_buffers() {
    log_info "TCP 버퍼 크기 최적화 중..."

    # 현재 설정 확인
    echo "=== 현재 TCP 버퍼 설정 ==="
    echo "net.core.rmem_default: $(sysctl -n net.core.rmem_default)"
    echo "net.core.rmem_max: $(sysctl -n net.core.rmem_max)"
    echo "net.core.wmem_default: $(sysctl -n net.core.wmem_default)"
    echo "net.core.wmem_max: $(sysctl -n net.core.wmem_max)"
    echo "net.ipv4.tcp_rmem: $(sysctl -n net.ipv4.tcp_rmem)"
    echo "net.ipv4.tcp_wmem: $(sysctl -n net.ipv4.tcp_wmem)"

    # 메모리 기반 최적값 계산
    local total_mem=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local optimal_rmem_max=$((total_mem * 1024 / 8))  # 전체 메모리의 1/8
    local optimal_wmem_max=$optimal_rmem_max

    # 최대값 제한
    if [[ $optimal_rmem_max -gt $NET_CORE_RMEM_MAX ]]; then
        optimal_rmem_max=$NET_CORE_RMEM_MAX
    fi
    if [[ $optimal_wmem_max -gt $NET_CORE_WMEM_MAX ]]; then
        optimal_wmem_max=$NET_CORE_WMEM_MAX
    fi

    echo ""
    echo "=== 최적화된 TCP 버퍼 설정 ==="
    echo "권장 rmem_max: $optimal_rmem_max"
    echo "권장 wmem_max: $optimal_wmem_max"

    # sysctl 설정 적용
    sudo sysctl -w net.core.rmem_default=262144
    sudo sysctl -w net.core.rmem_max=$optimal_rmem_max
    sudo sysctl -w net.core.wmem_default=262144
    sudo sysctl -w net.core.wmem_max=$optimal_wmem_max
    sudo sysctl -w net.ipv4.tcp_rmem="4096 87380 $optimal_rmem_max"
    sudo sysctl -w net.ipv4.tcp_wmem="4096 65536 $optimal_wmem_max"

    log_success "TCP 버퍼 크기 최적화 완료"
}

# 혼잡 제어 알고리즘 최적화
optimize_congestion_control() {
    log_info "TCP 혼잡 제어 최적화 중..."

    # 사용 가능한 혼잡 제어 알고리즘 확인
    echo "=== 사용 가능한 혼잡 제어 알고리즘 ==="
    cat /proc/sys/net/ipv4/tcp_available_congestion_control

    echo ""
    echo "=== 현재 혼잡 제어 알고리즘 ==="
    cat /proc/sys/net/ipv4/tcp_congestion_control

    # BBR 알고리즘 사용 가능 여부 확인
    if grep -q "bbr" /proc/sys/net/ipv4/tcp_available_congestion_control; then
        echo ""
        log_info "BBR 알고리즘으로 변경 중..."
        sudo sysctl -w net.ipv4.tcp_congestion_control=bbr
        sudo sysctl -w net.core.default_qdisc=fq
        log_success "BBR 혼잡 제어 알고리즘 적용 완료"
    elif grep -q "cubic" /proc/sys/net/ipv4/tcp_available_congestion_control; then
        echo ""
        log_info "CUBIC 알고리즘으로 설정 중..."
        sudo sysctl -w net.ipv4.tcp_congestion_control=cubic
        log_success "CUBIC 혼잡 제어 알고리즘 적용 완료"
    else
        log_warning "최적의 혼잡 제어 알고리즘을 찾을 수 없습니다"
    fi

    # 기타 TCP 최적화 설정
    sudo sysctl -w net.ipv4.tcp_window_scaling=$TCP_WINDOW_SCALING
    sudo sysctl -w net.ipv4.tcp_slow_start_after_idle=$TCP_SLOW_START_AFTER_IDLE
    sudo sysctl -w net.ipv4.tcp_no_metrics_save=1
    sudo sysctl -w net.ipv4.tcp_moderate_rcvbuf=1
}

# 네트워크 큐 최적화
optimize_network_queues() {
    log_info "네트워크 큐 최적화 중..."

    # 현재 설정 확인
    echo "=== 현재 네트워크 큐 설정 ==="
    echo "net.core.netdev_max_backlog: $(sysctl -n net.core.netdev_max_backlog)"
    echo "net.core.netdev_budget: $(sysctl -n net.core.netdev_budget)"

    # CPU 코어 수 기반 최적화
    local cpu_count=$(nproc)
    local optimal_backlog=$((cpu_count * 1000))

    if [[ $optimal_backlog -gt $NET_CORE_NETDEV_MAX_BACKLOG ]]; then
        optimal_backlog=$NET_CORE_NETDEV_MAX_BACKLOG
    fi

    echo ""
    echo "=== 최적화된 네트워크 큐 설정 ==="
    echo "권장 netdev_max_backlog: $optimal_backlog (CPU 코어: $cpu_count)"

    # 설정 적용
    sudo sysctl -w net.core.netdev_max_backlog=$optimal_backlog
    sudo sysctl -w net.core.netdev_budget=600
    sudo sysctl -w net.core.dev_weight=64

    # 인터럽트 코어 할당 최적화 (가능한 경우)
    if command -v irqbalance >/dev/null 2>&1; then
        sudo systemctl enable irqbalance
        sudo systemctl start irqbalance
        log_info "IRQ 밸런싱 서비스 활성화"
    fi

    log_success "네트워크 큐 최적화 완료"
}

# DNS 설정 최적화
optimize_dns() {
    log_info "DNS 설정 최적화 중..."

    # 현재 DNS 설정 확인
    echo "=== 현재 DNS 설정 ==="
    if [[ -f "/etc/resolv.conf" ]]; then
        cat /etc/resolv.conf
    fi

    # 빠른 DNS 서버 테스트
    echo ""
    echo "=== DNS 응답 시간 테스트 ==="

    declare -A dns_servers=(
        ["Google"]="8.8.8.8"
        ["Cloudflare"]="1.1.1.1"
        ["Quad9"]="9.9.9.9"
        ["OpenDNS"]="208.67.222.222"
    )

    declare -A dns_times

    for name in "${!dns_servers[@]}"; do
        local server="${dns_servers[$name]}"
        local response_time=$(dig @"$server" google.com +time=2 +tries=1 | grep "Query time:" | awk '{print $4}' 2>/dev/null || echo "timeout")
        dns_times["$name"]="$response_time"
        echo "$name ($server): ${response_time}ms"
    done

    # 가장 빠른 DNS 서버 찾기
    local fastest_dns=""
    local fastest_time=999999

    for name in "${!dns_times[@]}"; do
        local time="${dns_times[$name]}"
        if [[ "$time" != "timeout" ]] && [[ $time -lt $fastest_time ]]; then
            fastest_time=$time
            fastest_dns="${dns_servers[$name]}"
        fi
    done

    if [[ -n "$fastest_dns" ]]; then
        echo ""
        log_info "가장 빠른 DNS: $fastest_dns (${fastest_time}ms)"

        # DNS 캐시 최적화
        sudo sysctl -w net.ipv4.ip_forward=0
        sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0

        # systemd-resolved 설정 (Ubuntu/Debian)
        if command -v systemd-resolve >/dev/null 2>&1; then
            echo ""
            log_info "systemd-resolved DNS 캐시 설정 중..."

            sudo mkdir -p /etc/systemd/resolved.conf.d
            cat << EOF | sudo tee /etc/systemd/resolved.conf.d/dns-optimization.conf > /dev/null
[Resolve]
DNS=$fastest_dns
DNSStubListener=yes
Cache=yes
CacheFromLocalhost=yes
EOF
            sudo systemctl restart systemd-resolved
            log_success "systemd-resolved 최적화 완료"
        fi
    else
        log_warning "빠른 DNS 서버를 찾을 수 없습니다"
    fi
}

# 지연시간 벤치마크
benchmark_latency() {
    local targets="$1"

    log_info "네트워크 지연시간 벤치마크 시작..."

    IFS=',' read -ra TARGET_ARRAY <<< "$targets"

    echo "=== 네트워크 지연시간 테스트 ==="

    for target in "${TARGET_ARRAY[@]}"; do
        echo ""
        echo "대상: $target"
        echo "----------------------------------------"

        # ping 테스트
        if command -v ping >/dev/null 2>&1; then
            local ping_result=$(ping -c 4 -W 3 "$target" 2>/dev/null | tail -1)
            if [[ -n "$ping_result" ]]; then
                echo "PING: $ping_result"
            else
                echo "PING: 실패"
            fi
        fi

        # curl을 이용한 HTTP 응답시간 테스트
        if command -v curl >/dev/null 2>&1; then
            local http_time=$(curl -o /dev/null -s -w "%{time_total}" "http://$target" 2>/dev/null || echo "N/A")
            echo "HTTP 응답시간: ${http_time}초"
        fi

        # traceroute (간단 버전)
        if command -v traceroute >/dev/null 2>&1; then
            echo "경로 추적 (처음 5홉):"
            timeout 30s traceroute -m 5 "$target" 2>/dev/null | head -7 || echo "  경로 추적 실패"
        fi
    done
}

# 대역폭 테스트
bandwidth_test() {
    log_info "대역폭 테스트 시작..."

    # iperf3 사용 가능 시
    if command -v iperf3 >/dev/null 2>&1; then
        echo "=== iperf3 대역폭 테스트 ==="

        # 공개 iperf3 서버들
        declare -a iperf_servers=(
            "iperf.scottlinux.com"
            "iperf.he.net"
            "speedtest.selectel.ru"
        )

        for server in "${iperf_servers[@]}"; do
            echo ""
            echo "서버: $server"
            echo "----------------------------------------"

            # 다운로드 테스트
            timeout 20s iperf3 -c "$server" -t 10 2>/dev/null || echo "테스트 실패: $server"
        done
    else
        log_warning "iperf3가 설치되지 않음. 간단한 다운로드 테스트 실행"

        # wget을 이용한 간단한 대역폭 테스트
        if command -v wget >/dev/null 2>&1; then
            echo ""
            echo "다운로드 속도 테스트 (10MB 파일):"
            timeout 30s wget -O /dev/null --progress=dot:giga \
                "http://speedtest.ftp.otenet.gr/files/test10Mb.db" 2>&1 | \
                tail -2 || echo "다운로드 테스트 실패"
        fi
    fi
}

# 설정 영구 저장
save_optimizations() {
    log_info "최적화 설정을 영구적으로 저장 중..."

    # sysctl 설정 파일에 추가
    cat << EOF | sudo tee -a "$SYSCTL_CONF" > /dev/null

# 네트워크 최적화 설정 ($(date))
# TCP 버퍼 크기 최적화
net.core.rmem_default = 262144
net.core.rmem_max = $NET_CORE_RMEM_MAX
net.core.wmem_default = 262144
net.core.wmem_max = $NET_CORE_WMEM_MAX
net.ipv4.tcp_rmem = 4096 87380 $NET_CORE_RMEM_MAX
net.ipv4.tcp_wmem = 4096 65536 $NET_CORE_WMEM_MAX

# 혼잡 제어 최적화
net.ipv4.tcp_congestion_control = $TCP_CONGESTION_CONTROL
net.core.default_qdisc = fq
net.ipv4.tcp_window_scaling = $TCP_WINDOW_SCALING
net.ipv4.tcp_slow_start_after_idle = $TCP_SLOW_START_AFTER_IDLE
net.ipv4.tcp_no_metrics_save = 1
net.ipv4.tcp_moderate_rcvbuf = 1

# 네트워크 큐 최적화
net.core.netdev_max_backlog = $NET_CORE_NETDEV_MAX_BACKLOG
net.core.netdev_budget = 600
net.core.dev_weight = 64
EOF

    # 설정 적용
    sudo sysctl -p

    log_success "최적화 설정 영구 저장 완료"
}

# 최적화 상태 검증
verify_optimizations() {
    log_info "최적화 설정 검증 중..."

    echo "=== 적용된 최적화 설정 확인 ==="

    declare -a settings=(
        "net.core.rmem_max"
        "net.core.wmem_max"
        "net.ipv4.tcp_congestion_control"
        "net.core.netdev_max_backlog"
        "net.ipv4.tcp_window_scaling"
        "net.ipv4.tcp_slow_start_after_idle"
    )

    for setting in "${settings[@]}"; do
        local value=$(sysctl -n "$setting" 2>/dev/null || echo "N/A")
        echo "$setting: $value"
    done

    echo ""
    echo "=== 네트워크 성능 테스트 ==="

    # 간단한 성능 테스트
    benchmark_latency "$TARGET_HOSTS"
}

# 메인 함수
main() {
    echo "========================================"
    echo "네트워크 지연시간 최적화 도구"
    echo "========================================"
    echo ""

    # 권한 확인
    if [[ $EUID -ne 0 ]] && [[ "$1" != "test" ]] && [[ "$1" != "analyze" ]]; then
        log_error "이 스크립트는 root 권한이 필요합니다."
        echo "sudo $0 $*"
        exit 1
    fi

    # 설정 로드
    load_config

    case "${1:-optimize}" in
        "analyze")
            analyze_network_interfaces
            ;;
        "optimize")
            create_backup
            analyze_network_interfaces
            optimize_tcp_buffers
            optimize_congestion_control
            optimize_network_queues
            optimize_dns
            save_optimizations
            verify_optimizations
            ;;
        "test")
            benchmark_latency "$TARGET_HOSTS"
            bandwidth_test
            ;;
        "restore")
            if [[ -f "$BACKUP_DIR/sysctl.conf.backup"* ]]; then
                local latest_backup=$(ls -t "$BACKUP_DIR"/sysctl.conf.backup* | head -1)
                sudo cp "$latest_backup" "$SYSCTL_CONF"
                sudo sysctl -p
                log_success "설정 복원 완료: $latest_backup"
            else
                log_error "백업 파일을 찾을 수 없습니다"
            fi
            ;;
        *)
            echo "사용법: $0 [analyze|optimize|test|restore]"
            echo ""
            echo "analyze  - 네트워크 인터페이스 분석"
            echo "optimize - 네트워크 설정 최적화"
            echo "test     - 네트워크 성능 테스트"
            echo "restore  - 백업된 설정으로 복원"
            exit 1
            ;;
    esac
}

# 스크립트 실행
main "$@"
```

## 사용법 및 설정

### 기본 사용법

```bash
# 스크립트를 실행 가능하게 만들기
chmod +x network_optimization.sh

# 네트워크 인터페이스 분석
./network_optimization.sh analyze

# 전체 최적화 수행
sudo ./network_optimization.sh optimize

# 네트워크 성능 테스트
./network_optimization.sh test

# 백업된 설정으로 복원
sudo ./network_optimization.sh restore
```

### 설정 파일 사용

```bash
# network_optimization.conf 파일 생성
cat << EOF > network_optimization.conf
# TCP 설정
TCP_WINDOW_SCALING=1
TCP_CONGESTION_CONTROL="bbr"
TCP_SLOW_START_AFTER_IDLE=0

# 버퍼 크기
NET_CORE_RMEM_MAX=134217728
NET_CORE_WMEM_MAX=134217728
NET_CORE_NETDEV_MAX_BACKLOG=30000

# 테스트 대상
TARGET_HOSTS="8.8.8.8,1.1.1.1,google.com,github.com"
EOF
```

## 주요 최적화 기능

### 1. TCP 버퍼 크기 최적화

- **메모리 기반 계산**: 시스템 메모리의 1/8을 최대 버퍼 크기로 설정
- **수신/송신 버퍼**: 비대칭 네트워크에 맞진 옵티말 버퍼 크기
- **동적 조정**: 네트워크 상태에 따른 자동 버퍼 크기 조정

### 2. BBR 혼잡 제어 알고리즘

- **사용 가능 여부 확인**: 커널에서 BBR 지원 여부 자동 감지
- **CUBIC 대체**: BBR 불가 시 CUBIC 알고리즘으로 대체
- **큐 스케줄링**: FQ(Fair Queuing) 스케줄러로 설정

### 3. DNS 성능 최적화

- **응답시간 벤치마크**: Google, Cloudflare, Quad9, OpenDNS 비교 테스트
- **가장 빠른 DNS 서버 선택**: 자동으로 가장 빠른 DNS 서버 설정
- **systemd-resolved 통합**: 캐싱 활성화 및 성능 최적화

### 4. 네트워크 큐 튜닝

- **CPU 코어 기반 최적화**: CPU 코어 수에 따른 백로그 크기 조정
- **IRQ 밸런싱**: 인터럽트 분산 처리로 성능 향상
- **버짓 제한**: 소프트웨어 인터럽트 처리 대역폭 조절

### 5. 안전한 백업 및 복원

- **자동 백업**: 최적화 전 기존 설정 자동 백업
- **시스템 정보 저장**: 네트워크 인터페이스와 라우팅 정보 기록
- **원클릭 복원**: 간단한 명령어로 원래 상태로 복원

## 실전 활용 예시

### 예시 1: 웹 서버 최적화

```bash
# 높은 동시접속을 위한 설정
echo "NET_CORE_NETDEV_MAX_BACKLOG=50000" >> network_optimization.conf
echo "TARGET_HOSTS=\"google.com,amazon.com,cloudflare.com\"" >> network_optimization.conf
sudo ./network_optimization.sh optimize
```

### 예시 2: 데이터베이스 서버 최적화

```bash
# 대용량 데이터 전솥을 위한 설정
echo "NET_CORE_RMEM_MAX=268435456" >> network_optimization.conf
echo "NET_CORE_WMEM_MAX=268435456" >> network_optimization.conf
sudo ./network_optimization.sh optimize
```

### 예시 3: CDN/엣지 서버 최적화

```bash
# 낮은 지연시간을 위한 설정
echo "TCP_SLOW_START_AFTER_IDLE=0" >> network_optimization.conf
echo "TCP_CONGESTION_CONTROL=\"bbr\"" >> network_optimization.conf
sudo ./network_optimization.sh optimize
```

## 모니터링과 검증

### 성능 벤치마크

```bash
# 최적화 전후 비교
./network_optimization.sh test > before_optimization.txt
sudo ./network_optimization.sh optimize
./network_optimization.sh test > after_optimization.txt
diff before_optimization.txt after_optimization.txt
```

### 실시간 모니터링

```bash
# 네트워크 통계 지속 모니터링
watch -n 1 'cat /proc/net/netstat | grep -E "(TcpExt|IpExt)"'

# TCP 연결 상태 모니터링
watch -n 1 'ss -s'
```

## 핵심 요점

### 1. 체계적인 최적화 접근

단순히 매개변수 값만 변경하는 것이 아니라, 시스템 전체의 네트워크 스택을 종합적으로 최적화하는 접근법을 사용합니다.

### 2. 환경별 맞춤 최적화

시스템 자원(CPU 코어, 메모리)과 사용 패턴에 따라 동적으로 최적값을 계산하여 각 환경에 최적화된 설정을 제공합니다.

### 3. 안전한 백업과 복구

최적화로 인한 시스템 문제를 방지하기 위해 모든 변경 사항을 자동 백업하고 쉽게 복구할 수 있도록 설계했습니다.

---

**이전**: [네트워크 지연시간 분석 도구](06a-latency-analysis-tools.md)  
**다음**: [고성능 네트워킹](07-high-performance-networking.md)에서 더욱 전문적인 네트워크 최적화 기법을 학습합니다.
