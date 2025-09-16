---
tags:
  - NFS
  - deep-study
  - filesystem-optimization
  - hands-on
  - intermediate
  - network-tuning
  - performance-optimization
  - server-tuning
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "6-8시간"
main_topic: "인프라스트럭처"
priority_score: 4
---

# Chapter.06.07C NFS 서버 튜닝 가이드

## 서버 측 성능 최적화의 핵심 전략

NFS 클라이언트 최적화만으론 충분하지 않습니다. 진정한 성능 개선을 위해서는 서버 측 튜닝이 필수적입니다. 이 문서에서는 NFS 서버의 데몬 설정, 커널 매개변수, 내보내기 옵션, 파일시스템별 최적화 방법을 체계적으로 다룹니다.

## NFS 서버 성능 최적화 전략

### 1. NFS 데몬 스레드 수 최적화

```bash
#!/bin/bash
# nfs_server_tuner.sh

# CPU 코어 기반 스레드 수 계산
optimize_nfsd_threads() {
    local cpu_cores=$(nproc)
    local nfsd_threads=$((cpu_cores * 8))

    # 최소/최대 제한
    if [[ $nfsd_threads -gt 256 ]]; then
        nfsd_threads=256
    elif [[ $nfsd_threads -lt 8 ]]; then
        nfsd_threads=8
    fi

    echo "NFS 데몬 스레드 수를 $nfsd_threads로 설정"

    # /etc/nfs.conf 설정
    if [[ -f /etc/nfs.conf ]]; then
        sed -i "s/^# threads=.*/threads=$nfsd_threads/" /etc/nfs.conf
        sed -i "s/^threads=.*/threads=$nfsd_threads/" /etc/nfs.conf

        if ! grep -q "^threads=" /etc/nfs.conf; then
            echo "threads=$nfsd_threads" >> /etc/nfs.conf
        fi
    fi

    # systemd 환경에서 직접 설정
    if systemctl is-active nfs-server >/dev/null 2>&1; then
        # Ubuntu/Debian
        if [[ -f /etc/default/nfs-kernel-server ]]; then
            echo "RPCNFSDCOUNT=$nfsd_threads" > /etc/default/nfs-kernel-server
        fi

        # CentOS/RHEL
        if [[ -f /etc/sysconfig/nfs ]]; then
            echo "RPCNFSDCOUNT=$nfsd_threads" >> /etc/sysconfig/nfs
        fi

        systemctl restart nfs-server
        echo "NFS 서버 재시작 완료"
    fi
}

# 현재 스레드 수 확인
check_current_threads() {
    echo "=== 현재 NFS 데몬 상태 ==="
    
    local running_threads
    running_threads=$(ps aux | grep -c '[n]fsd')
    echo "실행 중인 nfsd 프로세스: $running_threads"

    if [[ -f /proc/fs/nfsd/threads ]]; then
        local configured_threads
        configured_threads=$(cat /proc/fs/nfsd/threads)
        echo "설정된 스레드 수: $configured_threads"
    fi

    # 부하 확인
    if command -v nfsstat >/dev/null 2>&1; then
        echo ""
        echo "=== NFS 서버 통계 ==="
        nfsstat -s | head -10
    fi
}

optimize_nfsd_threads
check_current_threads
```

### 2. 커널 네트워크 버퍼 최적화

```bash
#!/bin/bash
# optimize_kernel_buffers.sh

optimize_network_buffers() {
    local memory_gb=$(free -g | awk '/^Mem:/ {print $2}')
    
    echo "시스템 메모리: ${memory_gb}GB"

    # 메모리 기반 버퍼 크기 계산
    local rmem_max=$((memory_gb * 1024 * 1024))
    local wmem_max=$((memory_gb * 1024 * 1024))

    # 최대값 제한 (128MB)
    if [[ $rmem_max -gt 134217728 ]]; then rmem_max=134217728; fi
    if [[ $wmem_max -gt 134217728 ]]; then wmem_max=134217728; fi

    echo "네트워크 버퍼 최적화 적용..."

    # 즉시 적용
    sysctl -w net.core.rmem_max="$rmem_max"
    sysctl -w net.core.wmem_max="$wmem_max"
    sysctl -w net.core.rmem_default=262144
    sysctl -w net.core.wmem_default=262144
    sysctl -w net.core.netdev_max_backlog=5000
    sysctl -w net.ipv4.tcp_rmem="4096 87380 $rmem_max"
    sysctl -w net.ipv4.tcp_wmem="4096 65536 $wmem_max"

    # 영구 설정
    cat >> /etc/sysctl.conf << EOF
# NFS 서버 네트워크 최적화
net.core.rmem_max = $rmem_max
net.core.wmem_max = $wmem_max
net.core.rmem_default = 262144
net.core.wmem_default = 262144
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_rmem = 4096 87380 $rmem_max
net.ipv4.tcp_wmem = 4096 65536 $wmem_max

# TCP 최적화
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_timestamps = 1
net.ipv4.tcp_sack = 1
net.ipv4.tcp_congestion_control = bbr

# NFS 특화 설정
sunrpc.tcp_slot_table_entries = 128
sunrpc.udp_slot_table_entries = 128
EOF

    sysctl -p
    echo "커널 매개변수 최적화 완료"
}

# 성능 모니터링 함수
monitor_network_performance() {
    echo "=== 네트워크 성능 모니터링 ==="
    
    # 네트워크 통계
    echo "현재 네트워크 버퍼 설정:"
    sysctl net.core.rmem_max net.core.wmem_max net.core.rmem_default net.core.wmem_default

    # TCP 연결 상태
    echo ""
    echo "TCP 연결 상태:"
    ss -tuln | grep :2049

    # RPC 통계
    if [[ -f /proc/net/rpc/nfsd ]]; then
        echo ""
        echo "NFS RPC 통계:"
        head -5 /proc/net/rpc/nfsd
    fi
}

optimize_network_buffers
monitor_network_performance
```

### 3. 내보내기 옵션 최적화

```bash
#!/bin/bash
# optimize_exports.sh

# 다양한 시나리오별 exports 설정 생성
generate_export_configs() {
    local export_path=${1:-"/export"}
    local client_network=${2:-"*"}

    echo "=== NFS 내보내기 최적화 설정 ==="
    echo "경로: $export_path"
    echo "클라이언트: $client_network"
    echo ""

    echo "# /etc/exports 최적화 설정 예제" > /tmp/exports_optimized.conf
    echo "" >> /tmp/exports_optimized.conf

    # 1. 고성능 설정 (일관성 희생)
    cat >> /tmp/exports_optimized.conf << EOF
# 고성능 설정 - 처리량 우선
# 주의: 데이터 일관성이 중요한 환경에서는 사용 금지
$export_path $client_network(rw,async,no_subtree_check,no_wdelay,no_root_squash,fsid=1)

EOF

    # 2. 안정성 우선 설정
    cat >> /tmp/exports_optimized.conf << EOF
# 안정성 우선 설정 - 데이터 무결성 보장
# 프로덕션 환경에서 권장
$export_path $client_network(rw,sync,subtree_check,wdelay,root_squash,fsid=2)

EOF

    # 3. 균형 설정 (권장)
    cat >> /tmp/exports_optimized.conf << EOF
# 균형잡힌 설정 - 성능과 안정성의 절충점
# 대부분의 환경에서 권장
$export_path $client_network(rw,sync,no_subtree_check,wdelay,no_root_squash,fsid=3)

EOF

    # 4. 읽기 전용 최적화
    cat >> /tmp/exports_optimized.conf << EOF
# 읽기 전용 최적화 - CDN, 정적 콘텐츠
$export_path $client_network(ro,async,no_subtree_check,no_wdelay,all_squash,fsid=4)

EOF

    # 5. 개발 환경 설정
    cat >> /tmp/exports_optimized.conf << EOF
# 개발 환경 - 빠른 반복과 편의성
$export_path $client_network(rw,async,no_subtree_check,no_wdelay,no_root_squash,insecure,fsid=5)

EOF

    echo "최적화된 설정이 /tmp/exports_optimized.conf에 생성되었습니다."
    echo ""
    echo "설정 적용 방법:"
    echo "1. 기존 설정 백업: cp /etc/exports /etc/exports.backup"
    echo "2. 새 설정 복사: cp /tmp/exports_optimized.conf /etc/exports"  
    echo "3. NFS 재시작: exportfs -ra && systemctl restart nfs-server"

    # 현재 내보내기 상태 확인
    echo ""
    echo "=== 현재 내보내기 상태 ==="
    if command -v exportfs >/dev/null 2>&1; then
        exportfs -v
    fi
}

# 내보내기 옵션별 성능 영향 분석
analyze_export_options() {
    cat << 'EOF'
=== 내보내기 옵션 성능 영향 분석 ===

1. 동기화 옵션:
   - sync: 쓰기 작업을 디스크에 즉시 반영 (안정성 ↑, 성능 ↓)
   - async: 쓰기 작업을 메모리에서 버퍼링 (성능 ↑, 일관성 ↓)
   
2. 지연 옵션:
   - wdelay: 연관된 쓰기 작업을 그룹화하여 처리 (처리량 ↑)
   - no_wdelay: 쓰기 작업을 즉시 처리 (지연시간 ↓)

3. 서브트리 검사:
   - subtree_check: 파일 핸들 검증 강화 (보안 ↑, 성능 ↓)
   - no_subtree_check: 검증 생략 (성능 ↑, 보안 ↓)

4. 루트 권한:
   - root_squash: root를 nobody로 매핑 (보안 ↑)
   - no_root_squash: root 권한 유지 (편의성 ↑)

5. FSID 설정:
   - fsid=N: 파일시스템 고유 식별자 지정 (필수)
   
권장사항:
- 프로덕션: sync,no_subtree_check,wdelay,root_squash
- 개발환경: async,no_subtree_check,no_wdelay,no_root_squash
- 정적콘텐츠: ro,async,no_subtree_check,no_wdelay,all_squash
EOF
}

# 사용 예시
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    generate_export_configs "/export/data" "192.168.1.0/24"
    echo ""
    analyze_export_options
fi
```

### 4. 파일시스템별 최적화

```bash
#!/bin/bash
# filesystem_optimization.sh

# 파일시스템별 마운트 옵션 최적화
optimize_filesystem_for_nfs() {
    local filesystem_type=$1
    local device=$2
    local mount_point=$3

    echo "=== $filesystem_type 파일시스템 NFS 최적화 ==="

    case "$filesystem_type" in
        "ext4")
            echo "EXT4 최적화 설정 적용..."
            local mount_options="noatime,data=writeback,barrier=0,journal_async_commit,commit=60"
            
            echo "권장 마운트 옵션: $mount_options"
            echo "$device $mount_point ext4 $mount_options 0 2" >> /tmp/fstab_optimized
            
            # 런타임 최적화
            if mountpoint -q "$mount_point"; then
                tune2fs -o journal_data_writeback "$device"
                echo "EXT4 저널링 최적화 완료"
            fi
            ;;

        "xfs")
            echo "XFS 최적화 설정 적용..."
            local mount_options="noatime,largeio,swalloc,allocsize=16m,logbsize=256k"
            
            echo "권장 마운트 옵션: $mount_options"
            echo "$device $mount_point xfs $mount_options 0 2" >> /tmp/fstab_optimized

            # XFS 특화 설정
            echo "XFS는 대용량 파일 처리에 최적화됨"
            ;;

        "zfs")
            echo "ZFS 최적화 설정 적용..."
            
            # ZFS 데이터셋 최적화
            zfs set recordsize=1M "$device"
            zfs set compression=lz4 "$device"
            zfs set atime=off "$device"
            zfs set sync=standard "$device"
            zfs set primarycache=all "$device"
            zfs set secondarycache=all "$device"
            
            echo "ZFS 최적화 설정 완료:"
            echo "- recordsize=1M (대용량 파일 최적화)"
            echo "- compression=lz4 (빠른 압축)"
            echo "- atime=off (메타데이터 최적화)"
            ;;

        "btrfs")
            echo "Btrfs 최적화 설정 적용..."
            local mount_options="noatime,compress=lzo,space_cache=v2,commit=60"
            
            echo "권장 마운트 옵션: $mount_options"
            echo "$device $mount_point btrfs $mount_options 0 2" >> /tmp/fstab_optimized
            ;;

        *)
            echo "지원하지 않는 파일시스템: $filesystem_type"
            return 1
            ;;
    esac

    echo ""
}

# I/O 스케줄러 최적화
optimize_io_scheduler() {
    local device_name=$1
    local storage_type=$2  # ssd, nvme, hdd

    echo "=== I/O 스케줄러 최적화: $device_name ($storage_type) ==="

    local scheduler
    case "$storage_type" in
        "nvme"|"ssd")
            scheduler="none"  # 또는 mq-deadline
            echo "$scheduler" > "/sys/block/$device_name/queue/scheduler"
            echo "256" > "/sys/block/$device_name/queue/nr_requests"
            echo "SSD/NVMe 최적화: 스케줄러=$scheduler, 큐 깊이=256"
            ;;

        "hdd")
            scheduler="mq-deadline"
            echo "$scheduler" > "/sys/block/$device_name/queue/scheduler" 
            echo "128" > "/sys/block/$device_name/queue/nr_requests"
            echo "HDD 최적화: 스케줄러=$scheduler, 큐 깊이=128"
            ;;

        *)
            echo "알 수 없는 스토리지 타입: $storage_type"
            return 1
            ;;
    esac

    # 큐 최적화
    echo "4096" > "/sys/block/$device_name/queue/read_ahead_kb"
    echo "NFS 서버용 read-ahead 최적화 완료"
}

# 종합 최적화 스크립트
comprehensive_filesystem_optimization() {
    echo "=== NFS 서버 파일시스템 종합 최적화 ==="

    # 현재 마운트 정보 수집
    while read -r device mountpoint fstype _; do
        if [[ "$mountpoint" =~ ^/export ]] || [[ "$mountpoint" =~ ^/srv ]] || [[ "$mountpoint" =~ ^/data ]]; then
            echo "최적화 대상 발견: $device -> $mountpoint ($fstype)"
            optimize_filesystem_for_nfs "$fstype" "$device" "$mountpoint"
            
            # 장치명 추출하여 I/O 스케줄러 최적화
            local device_name
            device_name=$(basename "$device")
            if [[ -d "/sys/block/$device_name" ]]; then
                # 스토리지 타입 자동 감지
                if [[ "$device_name" =~ ^nvme ]]; then
                    optimize_io_scheduler "$device_name" "nvme"
                elif grep -q "0" "/sys/block/$device_name/queue/rotational" 2>/dev/null; then
                    optimize_io_scheduler "$device_name" "ssd"
                else
                    optimize_io_scheduler "$device_name" "hdd"
                fi
            fi
            echo ""
        fi
    done < /proc/mounts

    echo "최적화된 fstab 설정이 /tmp/fstab_optimized에 저장되었습니다."
}

# 스크립트 실행
comprehensive_filesystem_optimization
```

### 5. Docker 컨테이너 NFS 서버 최적화

```yaml
# docker-compose.yml - 최적화된 NFS 서버
version: '3.8'

services:
  nfs-server:
    image: itsthenetwork/nfs-server-alpine:latest
    container_name: nfs-server-optimized
    restart: unless-stopped
    privileged: true
    
    environment:
      SHARED_DIRECTORY: /data
      
    volumes:
      # 데이터 볼륨 - 성능 최적화된 마운트
      - type: bind
        source: /srv/nfs-data
        target: /data
        bind:
          propagation: rshared
      
      # NFS 설정 볼륨
      - ./nfs-config:/etc/exports:ro
      
    ports:
      - "2049:2049"
      - "20048:20048"
      - "111:111"
      - "32765:32765"
      - "32766:32766"
      - "32767:32767"
      
    # 성능 최적화 설정
    sysctls:
      - net.core.rmem_max=134217728
      - net.core.wmem_max=134217728
      - net.core.rmem_default=262144
      - net.core.wmem_default=262144
      
    # 리소스 제한
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2.0'
        reservations:
          memory: 2G
          cpus: '1.0'

    # 컨테이너 최적화
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
      nproc:
        soft: 65536
        hard: 65536

    # 헬스체크
    healthcheck:
      test: ["CMD", "rpcinfo", "-p", "localhost"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

# 별도의 볼륨 정의
volumes:
  nfs-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /srv/nfs-data
```

### 6. 성능 모니터링 및 문제 해결

```bash
#!/bin/bash
# nfs_server_monitor.sh

# NFS 서버 성능 모니터링
monitor_nfs_server() {
    echo "=== NFS 서버 성능 모니터링 ===" 
    echo "시간: $(date)"

    # 1. NFS 데몬 상태
    echo ""
    echo "📊 NFS 데몬 상태:"
    local nfsd_count
    nfsd_count=$(ps aux | grep -c '[n]fsd')
    echo "  실행 중인 nfsd: $nfsd_count"

    if [[ -f /proc/fs/nfsd/threads ]]; then
        local configured_threads
        configured_threads=$(cat /proc/fs/nfsd/threads)
        echo "  설정된 스레드: $configured_threads"
    fi

    # 2. RPC 통계
    echo ""
    echo "📈 RPC 성능 통계:"
    if [[ -f /proc/net/rpc/nfsd ]]; then
        local line
        line=$(head -1 /proc/net/rpc/nfsd)
        echo "  $line"
    fi

    # 3. 클라이언트 연결 현황
    echo ""
    echo "🔗 클라이언트 연결:"
    ss -tuln | grep :2049 | wc -l | xargs echo "  활성 연결 수:"

    # 4. 메모리 사용량
    echo ""
    echo "💾 메모리 사용량:"
    free -h | grep -E "(Mem|Swap):" | while read -r line; do
        echo "  $line"
    done

    # 5. 디스크 I/O 통계
    echo ""
    echo "💿 디스크 I/O (최근 1초):"
    if command -v iostat >/dev/null 2>&1; then
        iostat -x 1 1 | grep -E "(Device|sd|nvme)" | tail -n +2
    fi

    # 6. 네트워크 통계
    echo ""
    echo "🌐 네트워크 통계:"
    local rx_bytes tx_bytes
    rx_bytes=$(cat /sys/class/net/eth0/statistics/rx_bytes 2>/dev/null || echo "N/A")
    tx_bytes=$(cat /sys/class/net/eth0/statistics/tx_bytes 2>/dev/null || echo "N/A")
    echo "  RX: $rx_bytes bytes, TX: $tx_bytes bytes"
}

# 성능 문제 자동 진단
diagnose_performance_issues() {
    echo ""
    echo "=== 성능 문제 자동 진단 ==="

    # CPU 사용률 확인
    local cpu_usage
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    echo "CPU 사용률: $cpu_usage%"
    
    if (( $(echo "$cpu_usage > 80" | bc -l) )); then
        echo "⚠️  높은 CPU 사용률 감지 - nfsd 스레드 수 증가 고려"
    fi

    # 메모리 확인
    local mem_usage
    mem_usage=$(free | grep Mem | awk '{printf("%.1f"), $3/$2 * 100.0}')
    echo "메모리 사용률: $mem_usage%"
    
    if (( $(echo "$mem_usage > 90" | bc -l) )); then
        echo "⚠️  높은 메모리 사용률 - 캐시 설정 조정 필요"
    fi

    # 네트워크 에러 확인
    local net_errors
    net_errors=$(cat /sys/class/net/eth0/statistics/rx_errors 2>/dev/null || echo "0")
    if [[ $net_errors -gt 0 ]]; then
        echo "⚠️  네트워크 에러 감지: $net_errors errors"
    fi

    # NFS 에러 확인
    if command -v nfsstat >/dev/null 2>&1; then
        local nfs_errors
        nfs_errors=$(nfsstat -s | grep -i error | wc -l)
        if [[ $nfs_errors -gt 0 ]]; then
            echo "⚠️  NFS 에러 발견 - 상세 확인 필요"
            nfsstat -s | grep -i error
        fi
    fi
}

# 실시간 모니터링 루프
continuous_monitoring() {
    while true; do
        clear
        monitor_nfs_server
        diagnose_performance_issues
        
        echo ""
        echo "다음 업데이트까지 30초... (Ctrl+C로 종료)"
        sleep 30
    done
}

# 스크립트 사용법
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-monitor}" in
        "monitor")
            monitor_nfs_server
            diagnose_performance_issues
            ;;
        "continuous")
            continuous_monitoring
            ;;
        *)
            echo "사용법: $0 [monitor|continuous]"
            ;;
    esac
fi
```

## 핵심 요점

### 1. 계층적 최적화 접근법

- **시스템 레벨**: 커널 매개변수, I/O 스케줄러
- **데몬 레벨**: NFS 스레드 수, RPC 설정  
- **파일시스템 레벨**: 마운트 옵션, 저널링 설정
- **애플리케이션 레벨**: 내보내기 옵션, 캐시 정책

### 2. 환경별 맞춤 설정

서버의 하드웨어 사양, 예상 부하, 안정성 요구사항에 따라 다른 최적화 전략을 적용해야 합니다.

### 3. 지속적인 모니터링의 중요성

최적화 이후에도 지속적인 성능 모니터링을 통해 환경 변화에 대응하고 추가 튜닝을 수행해야 합니다.

---

**이전**: [자동 최적화 스크립트](./06-35-auto-optimization-scripts.md)  
**다음**: [모니터링 및 트러블슈팅](./06-47-monitoring-troubleshooting.md)에서 운영 환경에서의 실시간 관리 방법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 인프라스트럭처
- **예상 시간**: 6-8시간

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

`NFS`, `server-tuning`, `performance-optimization`, `filesystem-optimization`, `network-tuning`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
