---
tags:
  - NFS
  - Network
  - Filesystem
  - Performance
  - Automation
  - Bash
  - Docker
---

# Chapter.06.07B 네트워크 파일시스템 자동 최적화 스크립트

## 지능형 환경 감지와 자동 튜닝의 실현

다양한 시나리오에 맞는 NFS 설정을 자동으로 적용하는 스크립트입니다. 이 도구는 네트워크 지연시간, 시스템 리소스, 워크로드 패턴을 분석하여 최적의 마운트 옵션을 자동으로 생성하고 적용합니다.

## 네트워크 파일시스템 자동 최적화 스크립트

```bash
#!/bin/bash
# nfs_auto_optimizer.sh

set -euo pipefail

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 설정
CONFIG_FILE="/etc/nfs_optimizer.conf"
LOG_FILE="/var/log/nfs_optimizer.log"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# 네트워크 지연시간 측정
measure_latency() {
    local server=$1
    local avg_rtt

    avg_rtt=$(ping -c 5 -q "$server" 2>/dev/null | awk -F'/' '/^round-trip/ {print $5}' || echo "999")
    echo "$avg_rtt"
}

# 네트워크 대역폭 측정 (iperf3 사용)
measure_bandwidth() {
    local server=$1

    if command -v iperf3 >/dev/null 2>&1; then
        # iperf3 서버가 실행 중인지 확인 (포트 5201)
        if nc -z "$server" 5201 2>/dev/null; then
            local bandwidth
            bandwidth=$(iperf3 -c "$server" -t 5 -f M 2>/dev/null | awk '/receiver/ {print $7}' || echo "0")
            echo "$bandwidth"
        else
            echo "0"
        fi
    else
        echo "0"
    fi
}

# 시스템 리소스 확인
check_system_resources() {
    local memory_gb
    local cpu_cores

    memory_gb=$(free -g | awk '/^Mem:/ {print $2}')
    cpu_cores=$(nproc)

    echo "메모리: ${memory_gb}GB, CPU 코어: $cpu_cores"

    # 리소스 기반 권장사항
    if [[ $memory_gb -lt 4 ]]; then
        log_warn "메모리가 부족합니다 (${memory_gb}GB). 캐시 설정을 보수적으로 조정합니다."
        echo "low_memory"
    elif [[ $memory_gb -gt 16 ]]; then
        log_info "충분한 메모리가 있습니다 (${memory_gb}GB). 적극적인 캐싱을 활성화합니다."
        echo "high_memory"
    else
        echo "normal_memory"
    fi
}

# 워크로드 타입 감지
detect_workload_type() {
    local mount_point=$1

    log_info "워크로드 패턴 분석: $mount_point"

    # 파일 크기 분포 확인
    local small_files
    local large_files
    local total_files

    if [[ ! -d "$mount_point" ]]; then
        echo "unknown"
        return
    fi

    # 샘플링: 상위 디렉토리의 파일들만 확인
    small_files=$(find "$mount_point" -maxdepth 2 -type f -size -1M 2>/dev/null | wc -l)
    large_files=$(find "$mount_point" -maxdepth 2 -type f -size +10M 2>/dev/null | wc -l)
    total_files=$(find "$mount_point" -maxdepth 2 -type f 2>/dev/null | wc -l)

    if [[ $total_files -eq 0 ]]; then
        echo "empty"
        return
    fi

    local small_ratio=$((small_files * 100 / total_files))
    local large_ratio=$((large_files * 100 / total_files))

    log_info "파일 분포: 작은 파일 ${small_ratio}%, 큰 파일 ${large_ratio}%"

    if [[ $small_ratio -gt 70 ]]; then
        echo "small_files"  # 메타데이터 집약적
    elif [[ $large_ratio -gt 30 ]]; then
        echo "large_files"  # 처리량 집약적
    else
        echo "mixed"
    fi
}

# 최적 마운트 옵션 생성
generate_mount_options() {
    local server=$1
    local export_path=$2
    local mount_point=$3
    local workload_type=$4
    local latency=$5
    local memory_profile=$6
    local nfs_version=${7:-"4"}

    local options=()

    # 기본 옵션
    options+=("rw")
    options+=("hard")
    options+=("intr")
    options+=("proto=tcp")

    # 지연시간 기반 최적화
    if (( $(echo "$latency < 2" | bc -l) )); then
        # 매우 낮은 지연시간 (LAN)
        options+=("rsize=1048576")
        options+=("wsize=1048576")
        options+=("timeo=14")
        options+=("retrans=2")
        log_info "낮은 지연시간 환경 최적화 적용"

    elif (( $(echo "$latency < 10" | bc -l) )); then
        # 중간 지연시간
        options+=("rsize=262144")
        options+=("wsize=262144")
        options+=("timeo=30")
        options+=("retrans=3")
        log_info "중간 지연시간 환경 최적화 적용"

    else
        # 높은 지연시간 (WAN)
        options+=("rsize=1048576")
        options+=("wsize=1048576")
        options+=("timeo=600")
        options+=("retrans=2")
        options+=("async")
        log_info "높은 지연시간 환경 최적화 적용"
    fi

    # 워크로드 타입별 최적화
    case "$workload_type" in
        "small_files")
            # 메타데이터 집약적 워크로드
            options+=("ac=300")  # 긴 속성 캐시
            options+=("acdirmin=60")
            options+=("acdirmax=300")
            options+=("acregmin=60")
            options+=("acregmax=300")
            log_info "작은 파일 워크로드 최적화 적용"
            ;;

        "large_files")
            # 처리량 집약적 워크로드
            options+=("ac=30")   # 짧은 속성 캐시
            if [[ "$nfs_version" == "4" ]]; then
                options+=("nconnect=4")  # 다중 연결
            fi
            log_info "큰 파일 워크로드 최적화 적용"
            ;;

        "mixed")
            # 혼합 워크로드
            options+=("ac=60")
            options+=("acdirmin=30")
            options+=("acdirmax=60")
            log_info "혼합 워크로드 최적화 적용"
            ;;
    esac

    # 메모리 프로필별 최적화
    case "$memory_profile" in
        "low_memory")
            options+=("ac=30")
            options+=("rsize=65536")
            options+=("wsize=65536")
            ;;
        "high_memory")
            options+=("ac=600")
            options+=("racache")
            ;;
    esac

    # NFSv4 특화 옵션
    if [[ "$nfs_version" == "4" ]]; then
        options+=("minorversion=2")
        options+=("fsc")  # 로컬 캐싱 활성화 (cachefilesd 필요)
    fi

    # 옵션 문자열 생성
    local option_string
    option_string=$(IFS=','; echo "${options[*]}")

    echo "$option_string"
}

# 클라이언트 최적화
optimize_nfs_client() {
    local server=$1
    local export_path=$2
    local mount_point=$3
    local options=$4
    local nfs_version=${5:-"4"}

    log_info "NFS 클라이언트 최적화: $server:$export_path -> $mount_point"

    # 기존 마운트 해제
    if mountpoint -q "$mount_point" 2>/dev/null; then
        log_info "기존 마운트 해제 중..."
        umount "$mount_point" || {
            log_warn "일반 언마운트 실패, 강제 언마운트 시도"
            umount -l "$mount_point"
        }
    fi

    # 마운트 포인트 생성
    mkdir -p "$mount_point"

    # 최적화된 옵션으로 마운트
    local mount_cmd="mount -t nfs${nfs_version} -o ${options} ${server}:${export_path} ${mount_point}"

    log_info "마운트 명령어: $mount_cmd"

    if eval "$mount_cmd"; then
        log_info "마운트 성공"

        # /etc/fstab 업데이트 (선택사항)
        local fstab_entry="${server}:${export_path} ${mount_point} nfs${nfs_version} ${options} 0 0"

        if ! grep -q "${server}:${export_path}" /etc/fstab; then
            echo "# NFS 자동 최적화에 의해 추가됨 - $(date)" >> /etc/fstab
            echo "$fstab_entry" >> /etc/fstab
            log_info "/etc/fstab에 항목 추가됨"
        else
            log_info "/etc/fstab 항목이 이미 존재함"
        fi

        # 마운트 확인
        if mountpoint -q "$mount_point"; then
            log_info "마운트 확인 완료"
            df -h "$mount_point"
        fi

    else
        log_error "마운트 실패"
        return 1
    fi
}

# 성능 테스트
run_performance_test() {
    local mount_point=$1
    local test_duration=${2:-30}

    log_info "성능 테스트 실행: $mount_point (${test_duration}초)"

    local test_dir="$mount_point/.perf_test_$$"
    mkdir -p "$test_dir"

    # 메타데이터 성능 테스트
    local start_time
    local end_time
    local ops_per_sec

    start_time=$(date +%s.%N)
    for i in {1..100}; do
        touch "$test_dir/file_$i"
        rm "$test_dir/file_$i"
    done
    end_time=$(date +%s.%N)

    ops_per_sec=$(echo "scale=2; 200 / ($end_time - $start_time)" | bc)
    log_info "메타데이터 성능: $ops_per_sec ops/sec"

    # 순차 I/O 성능 테스트
    start_time=$(date +%s.%N)
    dd if=/dev/zero of="$test_dir/seq_test" bs=1M count=10 2>/dev/null
    sync
    end_time=$(date +%s.%N)

    local write_speed
    write_speed=$(echo "scale=2; 10 / ($end_time - $start_time)" | bc)
    log_info "순차 쓰기 성능: $write_speed MB/s"

    start_time=$(date +%s.%N)
    dd if="$test_dir/seq_test" of=/dev/null bs=1M 2>/dev/null
    end_time=$(date +%s.%N)

    local read_speed
    read_speed=$(echo "scale=2; 10 / ($end_time - $start_time)" | bc)
    log_info "순차 읽기 성능: $read_speed MB/s"

    # 정리
    rm -rf "$test_dir"

    # 성능 평가
    if (( $(echo "$ops_per_sec < 10" | bc -l) )); then
        log_warn "메타데이터 성능이 낮습니다. 캐시 설정을 조정하세요."
    fi

    if (( $(echo "$write_speed < 10" | bc -l) )); then
        log_warn "쓰기 성능이 낮습니다. 블록 크기와 비동기 옵션을 확인하세요."
    fi
}

# Docker 환경 최적화
optimize_docker_nfs() {
    local server=$1
    local export_path=$2
    local volume_name=$3
    local options=$4

    log_info "Docker NFS 볼륨 최적화"

    # Docker 볼륨 생성
    docker volume create \
        --driver local \
        --opt type=nfs4 \
        --opt o="addr=$server,$options" \
        --opt device="$export_path" \
        "$volume_name"

    log_info "Docker 볼륨 '$volume_name' 생성 완료"

    # 사용 예제 출력
    echo "Docker Compose에서 사용:"
    cat << EOF
volumes:
  $volume_name:
    external: true

services:
  app:
    volumes:
      - $volume_name:/data
EOF
}

# 사용법
usage() {
    echo "NFS 자동 최적화 도구"
    echo ""
    echo "사용법:"
    echo "  $0 analyze <server> <export_path> <mount_point>     # 환경 분석 및 권장사항"
    echo "  $0 optimize <server> <export_path> <mount_point>    # 자동 최적화 적용"
    echo "  $0 docker <server> <export_path> <volume_name>      # Docker 볼륨 최적화"
    echo "  $0 test <mount_point>                               # 성능 테스트"
    echo ""
    echo "예시:"
    echo "  $0 analyze 192.168.1.100 /export/data /mnt/nfs"
    echo "  $0 optimize 192.168.1.100 /export/data /mnt/nfs"
    echo "  $0 docker 192.168.1.100 /export/data nfs-data"
}

# 메인 함수
main() {
    local command=${1:-"help"}

    case "$command" in
        "analyze")
            if [[ $# -lt 4 ]]; then
                echo "사용법: $0 analyze <server> <export_path> <mount_point>"
                exit 1
            fi

            local server=$2
            local export_path=$3
            local mount_point=$4

            log_info "NFS 환경 분석 시작"

            # 네트워크 지연시간 측정
            local latency
            latency=$(measure_latency "$server")
            log_info "네트워크 지연시간: $latency ms"

            # 시스템 리소스 확인
            local memory_profile
            memory_profile=$(check_system_resources)

            # 워크로드 타입 감지 (기존 마운트가 있는 경우)
            local workload_type="mixed"
            if [[ -d "$mount_point" ]]; then
                workload_type=$(detect_workload_type "$mount_point")
            fi
            log_info "감지된 워크로드 타입: $workload_type"

            # 최적 마운트 옵션 생성
            local options
            options=$(generate_mount_options "$server" "$export_path" "$mount_point" "$workload_type" "$latency" "$memory_profile")

            echo ""
            echo "=== 권장 설정 ==="
            echo "마운트 명령어:"
            echo "mount -t nfs4 -o $options $server:$export_path $mount_point"
            echo ""
            echo "fstab 항목:"
            echo "$server:$export_path $mount_point nfs4 $options 0 0"
            ;;

        "optimize")
            if [[ $# -lt 4 ]]; then
                echo "사용법: $0 optimize <server> <export_path> <mount_point>"
                exit 1
            fi

            local server=$2
            local export_path=$3
            local mount_point=$4

            # 분석 단계와 동일
            local latency
            latency=$(measure_latency "$server")

            local memory_profile
            memory_profile=$(check_system_resources)

            local workload_type="mixed"
            if [[ -d "$mount_point" ]]; then
                workload_type=$(detect_workload_type "$mount_point")
            fi

            local options
            options=$(generate_mount_options "$server" "$export_path" "$mount_point" "$workload_type" "$latency" "$memory_profile")

            # 실제 최적화 적용
            optimize_nfs_client "$server" "$export_path" "$mount_point" "$options"

            # 성능 테스트
            sleep 2
            run_performance_test "$mount_point"
            ;;

        "docker")
            if [[ $# -lt 4 ]]; then
                echo "사용법: $0 docker <server> <export_path> <volume_name>"
                exit 1
            fi

            local server=$2
            local export_path=$3
            local volume_name=$4

            local latency
            latency=$(measure_latency "$server")

            local memory_profile
            memory_profile=$(check_system_resources)

            local options
            options=$(generate_mount_options "$server" "$export_path" "/tmp" "mixed" "$latency" "$memory_profile")

            optimize_docker_nfs "$server" "$export_path" "$volume_name" "$options"
            ;;

        "test")
            if [[ $# -lt 2 ]]; then
                echo "사용법: $0 test <mount_point>"
                exit 1
            fi

            run_performance_test "$2"
            ;;

        "help"|*)
            usage
            ;;
    esac
}

# 의존성 확인
check_dependencies() {
    local missing_deps=()

    if ! command -v bc >/dev/null 2>&1; then
        missing_deps+=("bc")
    fi

    if ! command -v nfsstat >/dev/null 2>&1; then
        log_warn "nfsstat가 설치되지 않음. 상세 통계를 볼 수 없습니다."
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "필수 의존성이 누락됨: ${missing_deps[*]}"
        echo "설치 방법: apt install ${missing_deps[*]} 또는 yum install ${missing_deps[*]}"
        exit 1
    fi
}

# 스크립트 실행
check_dependencies
main "$@"
```

## Docker Compose 통합 예제

NFS 볼륨을 Docker 환경에서 최적화하여 사용하는 방법입니다:

```yaml
# docker-compose.yml
version: '3.8'

services:
  web-app:
    image: nginx:latest
    volumes:
      - nfs-static:/usr/share/nginx/html
      - nfs-logs:/var/log/nginx
    ports:
      - "80:80"
    environment:
      - NGINX_HOST=localhost

  database:
    image: postgres:13
    volumes:
      - nfs-db-data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password

volumes:
  # 정적 파일용 (읽기 중심)
  nfs-static:
    driver: local
    driver_opts:
      type: nfs4
      o: addr=nfs-server,rsize=1048576,wsize=262144,hard,intr,proto=tcp,ro,noatime
      device: ":/export/static"

  # 로그 파일용 (쓰기 중심)  
  nfs-logs:
    driver: local
    driver_opts:
      type: nfs4
      o: addr=nfs-server,rsize=262144,wsize=1048576,hard,intr,proto=tcp,async
      device: ":/export/logs"

  # 데이터베이스용 (일관성 중요)
  nfs-db-data:
    driver: local
    driver_opts:
      type: nfs4
      o: addr=nfs-server,rsize=262144,wsize=262144,hard,intr,proto=tcp,sync
      device: ":/export/database"
```

## 실행 시나리오별 최적화 예제

### 시나리오 1: 개발 환경 (빠른 반복)

```bash
# 개발자 로컬 환경에서 빠른 파일 접근이 필요한 경우
./nfs_auto_optimizer.sh analyze dev-server /export/code /mnt/code

# 예상 출력: 메타데이터 캐시 시간 단축, 낮은 지연시간 최적화
# mount -t nfs4 -o rw,hard,intr,proto=tcp,rsize=1048576,wsize=1048576,timeo=14,retrans=2,ac=30 dev-server:/export/code /mnt/code
```

### 시나리오 2: 프로덕션 환경 (안정성 우선)

```bash
# 프로덕션에서 데이터 일관성이 중요한 경우  
./nfs_auto_optimizer.sh optimize prod-server /export/data /mnt/prod-data

# 예상 출력: sync 옵션, 긴 타임아웃, 에러 복구 강화
# mount -t nfs4 -o rw,hard,intr,proto=tcp,rsize=262144,wsize=262144,timeo=30,retrans=3,sync,ac=60
```

### 시나리오 3: 대용량 파일 처리 (미디어 서버)

```bash
# 비디오/이미지 등 대용량 파일 서빙
./nfs_auto_optimizer.sh docker media-server /export/media media-files

# Docker 볼륨으로 생성되어 컨테이너에서 바로 사용 가능
# 큰 블록 크기, 적극적인 캐싱으로 처리량 최대화
```

## 핵심 요점

### 1. 지능형 환경 감지

스크립트가 자동으로 네트워크 지연시간, 시스템 리소스, 파일 패턴을 분석하여 최적의 설정을 제안합니다.

### 2. 워크로드별 맞춤 최적화

- **Small Files (메타데이터 집약적)**: 긴 속성 캐시, 디렉토리 캐시 최적화
- **Large Files (처리량 집약적)**: 큰 블록 크기, 다중 연결 활용
- **Mixed Workload**: 균형잡힌 캐시 정책

### 3. 프로덕션 환경 고려사항

자동으로 `/etc/fstab` 업데이트, 마운트 상태 확인, 성능 테스트 등 운영 환경에서 필요한 모든 단계를 처리합니다.

---

**이전**: [NFS 성능 분석 도구](07a-nfs-analysis-tools.md)  
**다음**: [서버 튜닝 가이드](07c-server-tuning-guide.md)에서 NFS 서버 측 최적화 전략을 학습합니다.
