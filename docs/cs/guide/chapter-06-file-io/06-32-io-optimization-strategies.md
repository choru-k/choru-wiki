---
tags:
  - advanced
  - database_performance
  - deep-study
  - hands-on
  - hdd_optimization
  - io_optimization
  - kernel_parameters
  - ssd_tuning
  - 인프라스트럭처
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# I/O 최적화 전략

## 디바이스별 최적화와 커널 튜닝 전략

이 섹션에서는 SSD와 HDD의 특성을 이해하고 각각에 최적화된 설정을 적용하는 방법을 다룹니다. 또한 데이터베이스별 특화 최적화와 커널 매개변수 튜닝을 통한 전체적인 I/O 성능 향상 방법을 학습합니다.

## I/O 최적화 스크립트

다양한 I/O 최적화 기법을 자동으로 적용하는 스크립트입니다.

```bash
#!/bin/bash
# io_optimizer.sh

set -euo pipefail

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 현재 I/O 설정 확인
check_current_io_settings() {
    log_info "=== 현재 I/O 설정 확인 ==="

    # I/O 스케줄러 확인
    echo "I/O 스케줄러:"
    for device in /sys/block/*/queue/scheduler; do
        if [[ -f "$device" ]]; then
            device_name=$(echo "$device" | cut -d'/' -f4)
            scheduler=$(cat "$device" | grep -o '\[.*\]' | tr -d '[]')
            echo "  $device_name: $scheduler"
        fi
    done

    # ReadAhead 설정 확인
    echo -e "\nReadAhead 설정:"
    for device in /sys/block/*/queue/read_ahead_kb; do
        if [[ -f "$device" ]]; then
            device_name=$(echo "$device" | cut -d'/' -f4)
            readahead=$(cat "$device")
            echo "  $device_name: ${readahead}KB"
        fi
    done

    # 큐 깊이 확인
    echo -e "\n큐 깊이:"
    for device in /sys/block/*/queue/nr_requests; do
        if [[ -f "$device" ]]; then
            device_name=$(echo "$device" | cut -d'/' -f4)
            queue_depth=$(cat "$device")
            echo "  $device_name: $queue_depth"
        fi
    done

    # 파일시스템 마운트 옵션 확인
    echo -e "\n파일시스템 마운트 옵션:"
    mount | grep -E "ext[234]|xfs|btrfs" | while read -r line; do
        echo "  $line"
    done
}

# SSD 최적화
optimize_ssd() {
    local device=$1
    log_info "SSD 최적화: $device"

    # NOOP 또는 deadline 스케줄러 설정
    if [[ -f "/sys/block/$device/queue/scheduler" ]]; then
        # mq-deadline 사용 가능하면 우선 선택
        if grep -q "mq-deadline" "/sys/block/$device/queue/scheduler"; then
            echo "mq-deadline" > "/sys/block/$device/queue/scheduler"
            log_info "$device에 mq-deadline 스케줄러 적용"
        elif grep -q "deadline" "/sys/block/$device/queue/scheduler"; then
            echo "deadline" > "/sys/block/$device/queue/scheduler"
            log_info "$device에 deadline 스케줄러 적용"
        elif grep -q "noop" "/sys/block/$device/queue/scheduler"; then
            echo "noop" > "/sys/block/$device/queue/scheduler"
            log_info "$device에 noop 스케줄러 적용"
        fi
    fi

    # ReadAhead 감소 (SSD는 순차 읽기 이점이 적음)
    if [[ -f "/sys/block/$device/queue/read_ahead_kb" ]]; then
        echo "8" > "/sys/block/$device/queue/read_ahead_kb"
        log_info "$device ReadAhead를 8KB로 설정"
    fi

    # 큐 깊이 증가 (SSD는 높은 병렬성 지원)
    if [[ -f "/sys/block/$device/queue/nr_requests" ]]; then
        echo "256" > "/sys/block/$device/queue/nr_requests"
        log_info "$device 큐 깊이를 256으로 설정"
    fi

    # TRIM 지원 확인 및 활성화
    if [[ -f "/sys/block/$device/queue/discard_max_bytes" ]]; then
        discard_max=$(cat "/sys/block/$device/queue/discard_max_bytes")
        if [[ "$discard_max" -gt 0 ]]; then
            log_info "$device에서 TRIM 지원됨 (최대 ${discard_max}bytes)"

            # fstrim 실행 (마운트된 파일시스템에 대해)
            mount | grep "/dev/$device" | while read -r line; do
                mount_point=$(echo "$line" | awk '{print $3}')
                if command -v fstrim >/dev/null 2>&1; then
                    log_info "$mount_point에서 fstrim 실행"
                    fstrim -v "$mount_point" || log_warn "fstrim 실패: $mount_point"
                fi
            done
        fi
    fi
}

# HDD 최적화
optimize_hdd() {
    local device=$1
    log_info "HDD 최적화: $device"

    # CFQ 스케줄러 설정 (공정한 큐잉)
    if [[ -f "/sys/block/$device/queue/scheduler" ]]; then
        if grep -q "cfq" "/sys/block/$device/queue/scheduler"; then
            echo "cfq" > "/sys/block/$device/queue/scheduler"
            log_info "$device에 CFQ 스케줄러 적용"
        elif grep -q "deadline" "/sys/block/$device/queue/scheduler"; then
            echo "deadline" > "/sys/block/$device/queue/scheduler"
            log_info "$device에 deadline 스케줄러 적용"
        fi
    fi

    # ReadAhead 증가 (HDD는 순차 읽기에 유리)
    if [[ -f "/sys/block/$device/queue/read_ahead_kb" ]]; then
        echo "256" > "/sys/block/$device/queue/read_ahead_kb"
        log_info "$device ReadAhead를 256KB로 설정"
    fi

    # 큐 깊이 적절히 설정
    if [[ -f "/sys/block/$device/queue/nr_requests" ]]; then
        echo "128" > "/sys/block/$device/queue/nr_requests"
        log_info "$device 큐 깊이를 128로 설정"
    fi
}

# 디바이스 타입 감지
detect_device_type() {
    local device=$1

    # rotational 파일로 회전 디스크 여부 확인
    if [[ -f "/sys/block/$device/queue/rotational" ]]; then
        local rotational=$(cat "/sys/block/$device/queue/rotational")
        if [[ "$rotational" == "0" ]]; then
            echo "SSD"
        else
            echo "HDD"
        fi
    else
        echo "UNKNOWN"
    fi
}

# 파일시스템 최적화
optimize_filesystem() {
    local mount_point=$1
    local fs_type=$2

    log_info "파일시스템 최적화: $mount_point ($fs_type)"

    case "$fs_type" in
        ext4)
            # ext4 최적화 옵션 제안
            echo "ext4 최적화 옵션 (remount 필요):"
            echo "  - noatime: 접근 시간 기록 비활성화"
            echo "  - data=writeback: 성능 향상 (일관성 희생)"
            echo "  - barrier=0: 쓰기 배리어 비활성화 (UPS 있을 때)"
            echo "  예: mount -o remount,noatime,data=writeback $mount_point"
            ;;
        xfs)
            echo "XFS 최적화 옵션:"
            echo "  - noatime: 접근 시간 기록 비활성화"
            echo "  - logbufs=8: 로그 버퍼 증가"
            echo "  - logbsize=256k: 로그 버퍼 크기 증가"
            ;;
        btrfs)
            echo "Btrfs 최적화 옵션:"
            echo "  - noatime: 접근 시간 기록 비활성화"
            echo "  - compress=lzo: 압축 활성화"
            echo "  - ssd: SSD 최적화 (SSD인 경우)"
            ;;
    esac
}

# 커널 I/O 매개변수 튜닝
tune_kernel_io_params() {
    log_info "커널 I/O 매개변수 튜닝"

    # 더티 페이지 비율 조정
    local dirty_ratio=$(sysctl -n vm.dirty_ratio)
    local dirty_background_ratio=$(sysctl -n vm.dirty_background_ratio)

    echo "현재 더티 페이지 설정:"
    echo "  vm.dirty_ratio: $dirty_ratio"
    echo "  vm.dirty_background_ratio: $dirty_background_ratio"

    # 메모리 크기에 따른 권장값
    local mem_gb=$(free -g | awk '/^Mem:/{print $2}')

    if [[ "$mem_gb" -gt 16 ]]; then
        # 대용량 메모리: 더 많은 더티 페이지 허용
        sysctl -w vm.dirty_ratio=40
        sysctl -w vm.dirty_background_ratio=20
        log_info "대용량 메모리 환경: dirty_ratio=40, dirty_background_ratio=20"
    elif [[ "$mem_gb" -gt 8 ]]; then
        # 중간 메모리: 기본값 유지 또는 약간 증가
        sysctl -w vm.dirty_ratio=30
        sysctl -w vm.dirty_background_ratio=15
        log_info "중간 메모리 환경: dirty_ratio=30, dirty_background_ratio=15"
    else
        # 저용량 메모리: 더티 페이지 비율 감소
        sysctl -w vm.dirty_ratio=20
        sysctl -w vm.dirty_background_ratio=10
        log_info "저용량 메모리 환경: dirty_ratio=20, dirty_background_ratio=10"
    fi

    # 더티 페이지 만료 시간 조정
    sysctl -w vm.dirty_expire_centisecs=3000  # 30초
    sysctl -w vm.dirty_writeback_centisecs=500  # 5초
    log_info "더티 페이지 타이밍 조정: expire=30s, writeback=5s"

    # 스왑 사용률 조정
    local swappiness=$(sysctl -n vm.swappiness)
    echo "현재 swappiness: $swappiness"

    if [[ "$swappiness" -gt 10 ]]; then
        sysctl -w vm.swappiness=10
        log_info "swappiness를 10으로 조정 (스왑 사용 최소화)"
    fi
}

# 데이터베이스 최적화
optimize_for_database() {
    local db_type=${1:-"generic"}

    log_info "데이터베이스 최적화: $db_type"

    case "$db_type" in
        mysql|mariadb)
            echo "MySQL/MariaDB 최적화 권장사항:"
            echo "  - innodb_flush_method=O_DIRECT"
            echo "  - innodb_io_capacity=2000 (SSD), 200 (HDD)"
            echo "  - innodb_buffer_pool_size=메모리의 70-80%"
            ;;
        postgresql)
            echo "PostgreSQL 최적화 권장사항:"
            echo "  - shared_buffers=메모리의 25%"
            echo "  - effective_cache_size=메모리의 75%"
            echo "  - random_page_cost=1.1 (SSD), 4.0 (HDD)"
            echo "  - seq_page_cost=1.0"
            ;;
        mongodb)
            echo "MongoDB 최적화 권장사항:"
            echo "  - storage.wiredTiger.engineConfig.cacheSizeGB"
            echo "  - storage.journal.enabled=true"
            echo "  - net.compression.compressors=snappy"
            ;;
        *)
            echo "일반 데이터베이스 최적화:"
            echo "  - O_DIRECT 사용으로 이중 버퍼링 방지"
            echo "  - 적절한 버퍼 풀 크기 설정"
            echo "  - WAL/로그 파일을 별도 디스크에 배치"
            ;;
    esac

    # 공통 최적화
    echo -e "\n공통 최적화 적용:"

    # transparent hugepage 비활성화
    if [[ -f "/sys/kernel/mm/transparent_hugepage/enabled" ]]; then
        echo never > /sys/kernel/mm/transparent_hugepage/enabled
        log_info "Transparent Hugepage 비활성화"
    fi

    # 커널 매개변수 조정
    sysctl -w vm.dirty_ratio=15
    sysctl -w vm.dirty_background_ratio=5
    sysctl -w vm.dirty_expire_centisecs=1500
    log_info "데이터베이스용 커널 매개변수 조정"
}

# I/O 모니터링 설정
setup_io_monitoring() {
    log_info "I/O 모니터링 도구 설정"

    # iostat 사용 가능 확인
    if command -v iostat >/dev/null 2>&1; then
        log_info "iostat 사용 가능"
        echo "실시간 I/O 모니터링: iostat -x 1"
    else
        log_warn "iostat 미설치. sysstat 패키지 설치 권장"
    fi

    # iotop 사용 가능 확인
    if command -v iotop >/dev/null 2>&1; then
        log_info "iotop 사용 가능"
        echo "프로세스별 I/O 모니터링: iotop"
    else
        log_warn "iotop 미설치"
    fi

    # 기본 모니터링 스크립트 생성
    cat > /tmp/io_monitor.sh << 'EOF'
#!/bin/bash
# 간단한 I/O 모니터링 스크립트

while true; do
    echo "=== $(date) ==="

    # 디스크 사용률
    df -h | grep -E "^/dev/"

    # Load average
    cat /proc/loadavg

    # I/O 대기 프로세스
    ps aux | awk '$8 ~ /D/ {print $2, $11}' | head -5

    echo ""
    sleep 5
done
EOF

    chmod +x /tmp/io_monitor.sh
    log_info "기본 모니터링 스크립트 생성: /tmp/io_monitor.sh"
}

# 백업 및 복원
backup_current_settings() {
    local backup_file="/tmp/io_settings_backup_$(date +%Y%m%d_%H%M%S).sh"

    log_info "현재 설정 백업: $backup_file"

    cat > "$backup_file" << 'EOF'
#!/bin/bash
# I/O 설정 백업 및 복원 스크립트

restore_settings() {
    echo "I/O 설정 복원 중..."
EOF

    # 스케줄러 설정 백업
    for device in /sys/block/*/queue/scheduler; do
        if [[ -f "$device" ]]; then
            device_name=$(echo "$device" | cut -d'/' -f4)
            scheduler=$(cat "$device" | grep -o '\[.*\]' | tr -d '[]')
            echo "    echo '$scheduler' > /sys/block/$device_name/queue/scheduler" >> "$backup_file"
        fi
    done

    # ReadAhead 설정 백업
    for device in /sys/block/*/queue/read_ahead_kb; do
        if [[ -f "$device" ]]; then
            device_name=$(echo "$device" | cut -d'/' -f4)
            readahead=$(cat "$device")
            echo "    echo '$readahead' > /sys/block/$device_name/queue/read_ahead_kb" >> "$backup_file"
        fi
    done

    cat >> "$backup_file" << 'EOF'
}

restore_settings
echo "설정 복원 완료"
EOF

    chmod +x "$backup_file"
    echo "백업 파일: $backup_file"
}

# 메인 함수
main() {
    local action=${1:-"help"}

    # root 권한 확인
    if [[ $EUID -ne 0 ]]; then
        log_error "이 스크립트는 root 권한이 필요합니다."
        exit 1
    fi

    case "$action" in
        "check")
            check_current_io_settings
            ;;
        "optimize")
            local device=${2:-}
            if [[ -z "$device" ]]; then
                log_error "디바이스를 지정해주세요. 예: sda, nvme0n1"
                exit 1
            fi

            backup_current_settings

            local device_type=$(detect_device_type "$device")
            log_info "디바이스 타입: $device_type"

            case "$device_type" in
                "SSD")
                    optimize_ssd "$device"
                    ;;
                "HDD")
                    optimize_hdd "$device"
                    ;;
                *)
                    log_warn "디바이스 타입을 확인할 수 없습니다. 기본 최적화 적용"
                    optimize_hdd "$device"
                    ;;
            esac

            tune_kernel_io_params
            ;;
        "database")
            local db_type=${2:-"generic"}
            backup_current_settings
            optimize_for_database "$db_type"
            ;;
        "monitor")
            setup_io_monitoring
            ;;
        "filesystem")
            local mount_point=${2:-}
            local fs_type=${3:-}
            if [[ -z "$mount_point" || -z "$fs_type" ]]; then
                log_error "마운트포인트와 파일시스템 타입을 지정해주세요."
                exit 1
            fi
            optimize_filesystem "$mount_point" "$fs_type"
            ;;
        "help"|*)
            echo "I/O 최적화 도구"
            echo ""
            echo "사용법:"
            echo "  $0 check                          # 현재 I/O 설정 확인"
            echo "  $0 optimize <device>              # 디바이스 최적화"
            echo "  $0 database [mysql|postgresql|mongodb] # 데이터베이스 최적화"
            echo "  $0 filesystem <mount> <type>      # 파일시스템 최적화"
            echo "  $0 monitor                        # 모니터링 도구 설정"
            echo ""
            echo "예시:"
            echo "  $0 check                          # 설정 확인"
            echo "  $0 optimize sda                   # /dev/sda 최적화"
            echo "  $0 database mysql                 # MySQL용 최적화"
            echo "  $0 filesystem / ext4              # root 파일시스템 최적화"
            ;;
    esac
}

# 스크립트 실행
main "$@"
```

## 실행 방법

```bash
# 스크립트에 실행 권한 부여
chmod +x io_optimizer.sh

# 현재 I/O 설정 확인
sudo ./io_optimizer.sh check

# SSD 디바이스 최적화
sudo ./io_optimizer.sh optimize nvme0n1

# HDD 디바이스 최적화
sudo ./io_optimizer.sh optimize sda

# MySQL 데이터베이스 최적화
sudo ./io_optimizer.sh database mysql

# 파일시스템 최적화 옵션 확인
sudo ./io_optimizer.sh filesystem / ext4

# 모니터링 환경 설정
sudo ./io_optimizer.sh monitor
```

## SSD vs HDD 최적화 비교

| 설정 항목 | SSD 최적화 | HDD 최적화 | 이유 |
|-----------|------------|------------|------|
| **I/O 스케줄러** | mq-deadline, noop | CFQ, deadline | SSD는 탐색 시간이 없어 단순한 스케줄러가 효율적 |
| **ReadAhead** | 8KB (낮음) | 256KB (높음) | HDD는 순차 읽기에 유리 |
| **큐 깊이** | 256 (높음) | 128 (중간) | SSD는 높은 병렬 I/O 처리 가능 |
| **TRIM/Discard** | 필수 활성화 | 불필요 | SSD 성능 유지를 위한 가비지 컬렉션 |

## 데이터베이스별 최적화 전략

### MySQL/MariaDB

- **innodb_flush_method=O_DIRECT**: 이중 버퍼링 방지
- **innodb_io_capacity**: SSD 2000, HDD 200
- **innodb_buffer_pool_size**: 메모리의 70-80%

### PostgreSQL

- **shared_buffers**: 메모리의 25%
- **effective_cache_size**: 메모리의 75%
- **random_page_cost**: SSD 1.1, HDD 4.0

### MongoDB

- **storage.wiredTiger.engineConfig.cacheSizeGB**: 적절한 캐시 크기 설정
- **storage.journal.enabled=true**: 저널링 활성화
- **net.compression.compressors=snappy**: 압축 활성화

## 핵심 요점

### 1. 디바이스별 특성 이해

SSD와 HDD의 물리적 특성을 이해하고 각각에 최적화된 설정 적용

### 2. 커널 매개변수 튜닝

메모리 크기에 따른 더티 페이지 비율 조정과 스왑 사용률 최적화

### 3. 데이터베이스 특화 최적화

각 데이터베이스 엔진의 특성에 맞는 I/O 설정과 캐싱 전략 적용

---

**이전**: [I/O 성능 분석 도구](chapter-06-file-io/06-42-io-performance-monitoring.md)  
**다음**: [실전 I/O 성능 테스트](chapter-06-file-io/06-33-io-performance-testing.md)에서 벤치마크와 성능 테스트 도구를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 인프라스트럭처
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-06-file-io)

- [Chapter 6-1: 파일 디스크립터의 내부 구조](./06-10-file-descriptor.md)
- [Chapter 6-1A: 파일 디스크립터 기본 개념과 3단계 구조](./06-01-fd-basics-structure.md)
- [Chapter 6-1B: 파일 디스크립터 할당과 공유 메커니즘](./06-11-fd-allocation-management.md)
- [Chapter 6-1C: 파일 연산과 VFS 다형성](./06-12-file-operations-vfs.md)
- [Chapter 6-2: VFS와 파일 시스템 추상화 개요](./06-13-vfs-filesystem.md)

### 🏷️ 관련 키워드

`io_optimization`, `ssd_tuning`, `hdd_optimization`, `kernel_parameters`, `database_performance`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
