---
tags:
  - Filesystem
  - I/O
  - Performance
  - Testing
  - Benchmark
  - Linux
---

# 실전 I/O 성능 테스트

## 디스크 벤치마크와 성능 회귀 테스트 자동화

이 섹션에서는 실제 운영 환경에서 사용할 수 있는 디스크 벤치마크 도구를 구현하고, I/O 성능 회귀 테스트를 자동화하는 방법을 다룹니다. 또한 모니터링 시스템 구축과 백업/복원 전략까지 포괄적으로 학습합니다.

## 디스크 벤치마크 도구 구현

실제 운영 환경에서 안전하게 사용할 수 있는 벤치마크 도구입니다.

```c
// disk_benchmark.c - 추가 구현
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
#include <math.h>

// 디스크 벤치마크 - 운영 환경에서 안전하게 사용 가능한 성능 테스트
void run_disk_benchmark(const char* path, size_t file_size, size_t block_size) {
    printf("\n=== 디스크 벤치마크: %s ===\n", path);
    printf("파일 크기: %zu MB, 블록 크기: %zu KB\n",
           file_size / (1024 * 1024), block_size / 1024);

    char test_file[512];
    snprintf(test_file, sizeof(test_file), "%s/benchmark_test.dat", path);

    // 쓰기 테스트 - O_SYNC로 실제 디스크 쓰기 성능 측정
    printf("\n--- 순차 쓰기 테스트 ---\n");
    char* buffer = malloc(block_size);
    if (!buffer) {
        perror("메모리 할당 실패");
        return;
    }
    
    // 랜덤 데이터로 버퍼 채우기 (압축 효과 방지)
    srand(time(NULL));
    for (size_t i = 0; i < block_size; i++) {
        buffer[i] = rand() % 256;
    }

    struct timeval start, end;
    gettimeofday(&start, NULL);

    // O_SYNC: 각 write() 호출이 실제로 디스크에 쓰여질 때까지 대기
    // O_DIRECT: 페이지 캐시를 우회하여 실제 디스크 성능 측정
    int fd = open(test_file, O_WRONLY | O_CREAT | O_TRUNC | O_SYNC, 0644);
    if (fd == -1) {
        perror("파일 열기 실패");
        free(buffer);
        return;
    }

    size_t total_written = 0;
    size_t write_operations = 0;
    
    while (total_written < file_size) {
        size_t to_write = (file_size - total_written) < block_size ?
                         (file_size - total_written) : block_size;

        ssize_t written = write(fd, buffer, to_write);
        if (written <= 0) {
            perror("쓰기 실패");
            break;
        }
        total_written += written;
        write_operations++;
        
        // 진행 상황 표시 (매 10MB마다)
        if (total_written % (10 * 1024 * 1024) == 0) {
            printf("진행: %zu/%zu MB (%.1f%%)\n", 
                   total_written / (1024 * 1024), 
                   file_size / (1024 * 1024),
                   100.0 * total_written / file_size);
        }
    }

    close(fd);
    gettimeofday(&end, NULL);

    double write_time = (end.tv_sec - start.tv_sec) +
                       (end.tv_usec - start.tv_usec) / 1000000.0;
    double write_speed = (total_written / (1024.0 * 1024.0)) / write_time;
    double write_iops = write_operations / write_time;

    printf("쓰기 속도: %.2f MB/s, IOPS: %.0f, 소요시간: %.2fs\n", 
           write_speed, write_iops, write_time);

    // 읽기 테스트 - 캐시 무효화 후 실제 디스크 읽기 성능 측정
    printf("\n--- 순차 읽기 테스트 ---\n");
    
    // 페이지 캐시 무효화 (실제 디스크 읽기 성능 측정을 위해)
    system("sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null");
    
    gettimeofday(&start, NULL);

    fd = open(test_file, O_RDONLY);
    if (fd == -1) {
        perror("파일 열기 실패");
        free(buffer);
        return;
    }

    size_t total_read = 0;
    size_t read_operations = 0;
    
    while (total_read < file_size) {
        ssize_t read_bytes = read(fd, buffer, block_size);
        if (read_bytes <= 0) break;
        total_read += read_bytes;
        read_operations++;
        
        // 진행 상황 표시
        if (total_read % (10 * 1024 * 1024) == 0) {
            printf("진행: %zu/%zu MB (%.1f%%)\n", 
                   total_read / (1024 * 1024), 
                   file_size / (1024 * 1024),
                   100.0 * total_read / file_size);
        }
    }

    close(fd);
    gettimeofday(&end, NULL);

    double read_time = (end.tv_sec - start.tv_sec) +
                      (end.tv_usec - start.tv_usec) / 1000000.0;
    double read_speed = (total_read / (1024.0 * 1024.0)) / read_time;
    double read_iops = read_operations / read_time;

    printf("읽기 속도: %.2f MB/s, IOPS: %.0f, 소요시간: %.2fs\n", 
           read_speed, read_iops, read_time);

    // 랜덤 I/O 테스트 - 실제 데이터베이스 워크로드 시뮬레이션
    printf("\n--- 랜덤 I/O 테스트 ---\n");
    fd = open(test_file, O_RDWR);
    if (fd == -1) {
        perror("파일 열기 실패");
        free(buffer);
        return;
    }

    int num_operations = 1000;  // 랜덤 I/O 작업 수
    size_t file_blocks = file_size / block_size;
    
    gettimeofday(&start, NULL);

    for (int i = 0; i < num_operations; i++) {
        // 파일 내 랜덤 위치 선택
        off_t offset = (rand() % file_blocks) * block_size;
        
        if (lseek(fd, offset, SEEK_SET) == -1) {
            perror("lseek 실패");
            break;
        }

        // 70% 읽기, 30% 쓰기 (일반적인 데이터베이스 워크로드)
        if (i % 10 < 7) {
            read(fd, buffer, block_size);
        } else {
            write(fd, buffer, block_size);
        }
        
        // 진행 상황 표시 (매 100 작업마다)
        if ((i + 1) % 100 == 0) {
            printf("진행: %d/%d 작업 (%.1f%%)\n", 
                   i + 1, num_operations, 100.0 * (i + 1) / num_operations);
        }
    }

    close(fd);
    gettimeofday(&end, NULL);

    double random_time = (end.tv_sec - start.tv_sec) +
                        (end.tv_usec - start.tv_usec) / 1000000.0;
    double random_iops = num_operations / random_time;
    double avg_latency = (random_time * 1000.0) / num_operations;  // ms

    printf("랜덤 IOPS: %.0f, 평균 지연시간: %.2f ms\n", random_iops, avg_latency);

    // 정리
    unlink(test_file);
    free(buffer);
    
    printf("\n=== 벤치마크 요약 ===\n");
    printf("순차 쓰기: %.2f MB/s\n", write_speed);
    printf("순차 읽기: %.2f MB/s\n", read_speed);
    printf("랜덤 I/O: %.0f IOPS (평균 %.2fms)\n", random_iops, avg_latency);
}

// 성능 회귀 테스트 - 시간에 따른 성능 변화 추적
void performance_regression_test(const char* device, const char* log_file) {
    printf("\n=== 성능 회귀 테스트 시작 ===\n");
    
    FILE* log = fopen(log_file, "a");
    if (!log) {
        perror("로그 파일 열기 실패");
        return;
    }

    time_t now = time(NULL);
    struct tm* tm_info = localtime(&now);
    char timestamp[64];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", tm_info);

    fprintf(log, "\n=== %s ===\n", timestamp);
    printf("로그 파일: %s\n", log_file);

    // 간단한 읽기/쓰기 테스트 수행
    char test_path[256];
    snprintf(test_path, sizeof(test_path), "/tmp");

    // 작은 크기로 빠른 테스트 수행
    size_t test_size = 50 * 1024 * 1024;  // 50MB
    size_t block_size = 64 * 1024;        // 64KB

    printf("빠른 성능 테스트 수행 중...\n");
    
    // 기본 벤치마크 실행하고 결과를 로그에 기록
    // (실제로는 run_disk_benchmark의 결과를 캡처해서 로그에 기록해야 함)
    fprintf(log, "디바이스: %s\n", device);
    fprintf(log, "테스트 크기: %zu MB\n", test_size / (1024 * 1024));
    
    fclose(log);
    
    printf("성능 테스트 완료. 로그 확인: tail -f %s\n", log_file);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        printf("사용법: %s <command> [options]\n", argv[0]);
        printf("Commands:\n");
        printf("  benchmark <path>        - 디스크 벤치마크\n");
        printf("  regression <device>     - 성능 회귀 테스트\n");
        return 1;
    }

    if (strcmp(argv[1], "benchmark") == 0 && argc >= 3) {
        const char* path = argv[2];
        size_t file_size = 100 * 1024 * 1024;  // 100MB
        size_t block_size = 64 * 1024;         // 64KB
        
        // 옵션 파라미터 처리
        if (argc >= 4) file_size = atoi(argv[3]) * 1024 * 1024;  // MB 단위
        if (argc >= 5) block_size = atoi(argv[4]) * 1024;        // KB 단위
        
        run_disk_benchmark(path, file_size, block_size);

    } else if (strcmp(argv[1], "regression") == 0 && argc >= 3) {
        const char* device = argv[2];
        char log_file[256];
        snprintf(log_file, sizeof(log_file), "/tmp/perf_regression_%s.log", device);
        
        performance_regression_test(device, log_file);

    } else {
        printf("잘못된 명령어입니다.\n");
        return 1;
    }

    return 0;
}
```

## 성능 테스트 자동화 스크립트

정기적인 성능 모니터링과 회귀 테스트를 위한 스크립트입니다.

```bash
#!/bin/bash
# io_performance_test.sh

set -euo pipefail

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# 성능 테스트
run_performance_test() {
    local test_dir=${1:-"/tmp"}
    local file_size_mb=${2:-100}
    local block_size_kb=${3:-64}

    log_info "I/O 성능 테스트: $test_dir"
    log_info "파일 크기: ${file_size_mb}MB, 블록 크기: ${block_size_kb}KB"

    # 테스트 파일명 생성 (타임스탬프 포함)
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local test_file="$test_dir/iotest_${timestamp}.dat"
    local log_file="$test_dir/iotest_${timestamp}.log"

    # 테스트 결과 로그 헤더
    cat > "$log_file" << EOF
=== I/O 성능 테스트 결과 ===
테스트 시간: $(date)
테스트 디렉토리: $test_dir
파일 크기: ${file_size_mb}MB
블록 크기: ${block_size_kb}KB
시스템 정보: $(uname -a)
메모리 정보: $(free -h | head -2 | tail -1)
디스크 정보: $(df -h "$test_dir" | tail -1)

EOF

    # dd를 이용한 기본 테스트
    echo "=== 순차 쓰기 테스트 ===" | tee -a "$log_file"
    
    # 캐시 클리어
    sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
    
    local start_time=$(date +%s.%N)
    dd if=/dev/zero of="$test_file" bs="${block_size_kb}K" count="$file_size_mb" conv=fdatasync 2>&1 | \
        tee -a "$log_file" | grep -E "(copied|MB/s)"
    local end_time=$(date +%s.%N)
    local write_time=$(echo "$end_time - $start_time" | bc)
    
    echo "실제 소요 시간: ${write_time}초" | tee -a "$log_file"

    echo -e "\n=== 순차 읽기 테스트 ===" | tee -a "$log_file"
    sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
    
    start_time=$(date +%s.%N)
    dd if="$test_file" of=/dev/null bs="${block_size_kb}K" 2>&1 | \
        tee -a "$log_file" | grep -E "(copied|MB/s)"
    end_time=$(date +%s.%N)
    local read_time=$(echo "$end_time - $start_time" | bc)
    
    echo "실제 소요 시간: ${read_time}초" | tee -a "$log_file"

    # fio를 이용한 고급 테스트 (설치되어 있는 경우)
    if command -v fio >/dev/null 2>&1; then
        echo -e "\n=== FIO 랜덤 I/O 테스트 ===" | tee -a "$log_file"
        
        # 랜덤 읽기/쓰기 혼합 테스트 (70% 읽기, 30% 쓰기)
        fio --name=random-rw \
            --ioengine=libaio \
            --iodepth=16 \
            --rw=randrw \
            --rwmixread=70 \
            --bs=4k \
            --direct=1 \
            --size="${file_size_mb}M" \
            --numjobs=1 \
            --filename="$test_file" \
            --time_based \
            --runtime=30 \
            --group_reporting \
            --output-format=normal 2>/dev/null | tee -a "$log_file" || {
            log_warn "FIO 테스트 실패"
        }
    else
        echo -e "\n=== FIO 미설치 ===" | tee -a "$log_file"
        log_warn "fio 미설치 - 고급 I/O 테스트 불가"
        echo "설치: sudo apt install fio  # Ubuntu/Debian" | tee -a "$log_file"
        echo "설치: sudo yum install fio   # RHEL/CentOS" | tee -a "$log_file"
    fi

    # 정리
    rm -f "$test_file"
    
    log_info "테스트 완료. 로그 파일: $log_file"
    
    # 요약 출력
    echo -e "\n=== 테스트 요약 ==="
    echo "로그 파일: $log_file"
    echo "쓰기 시간: ${write_time}초"
    echo "읽기 시간: ${read_time}초"
}

# 시스템 I/O 상태 수집
collect_io_status() {
    local output_file=${1:-"/tmp/io_status_$(date +%Y%m%d_%H%M%S).txt"}
    
    log_info "시스템 I/O 상태 수집: $output_file"
    
    cat > "$output_file" << EOF
=== 시스템 I/O 상태 보고서 ===
생성 시간: $(date)
시스템: $(uname -a)

=== 메모리 상태 ===
$(free -h)

=== 디스크 사용량 ===
$(df -h)

=== 마운트 정보 ===
$(mount | grep -E "ext[234]|xfs|btrfs")

=== I/O 스케줄러 ===
EOF
    
    for device in /sys/block/*/queue/scheduler; do
        if [[ -f "$device" ]]; then
            device_name=$(echo "$device" | cut -d'/' -f4)
            scheduler=$(cat "$device" | grep -o '\[.*\]' | tr -d '[]' 2>/dev/null || echo "unknown")
            echo "$device_name: $scheduler" >> "$output_file"
        fi
    done

    cat >> "$output_file" << EOF

=== ReadAhead 설정 ===
EOF
    
    for device in /sys/block/*/queue/read_ahead_kb; do
        if [[ -f "$device" ]]; then
            device_name=$(echo "$device" | cut -d'/' -f4)
            readahead=$(cat "$device" 2>/dev/null || echo "unknown")
            echo "$device_name: ${readahead}KB" >> "$output_file"
        fi
    done

    cat >> "$output_file" << EOF

=== 커널 매개변수 ===
vm.dirty_ratio: $(sysctl -n vm.dirty_ratio)
vm.dirty_background_ratio: $(sysctl -n vm.dirty_background_ratio)
vm.swappiness: $(sysctl -n vm.swappiness)

=== 현재 I/O 통계 ===
$(cat /proc/diskstats | head -10)

=== Load Average ===
$(cat /proc/loadavg)

=== I/O 대기 프로세스 ===
$(ps aux | awk '$8 ~ /D/ {print $2, $11}' | head -10)

EOF

    if command -v iostat >/dev/null 2>&1; then
        echo "=== iostat 스냅샷 ===" >> "$output_file"
        iostat -x 1 1 >> "$output_file" 2>/dev/null || echo "iostat 실행 실패" >> "$output_file"
    fi

    log_info "I/O 상태 수집 완료: $output_file"
}

# 성능 비교 분석
compare_performance() {
    local log_dir=${1:-"/tmp"}
    local pattern=${2:-"iotest_*.log"}
    
    log_info "성능 비교 분석: $log_dir/$pattern"
    
    local comparison_file="$log_dir/performance_comparison_$(date +%Y%m%d_%H%M%S).txt"
    
    echo "=== 성능 비교 분석 ===" > "$comparison_file"
    echo "분석 시간: $(date)" >> "$comparison_file"
    echo "" >> "$comparison_file"
    
    local log_files=($(find "$log_dir" -name "$pattern" -type f | sort))
    
    if [[ ${#log_files[@]} -lt 2 ]]; then
        log_warn "비교할 로그 파일이 충분하지 않습니다 (최소 2개 필요)"
        return
    fi
    
    echo "발견된 로그 파일: ${#log_files[@]}개" >> "$comparison_file"
    
    for log_file in "${log_files[@]}"; do
        echo "" >> "$comparison_file"
        echo "=== $(basename "$log_file") ===" >> "$comparison_file"
        
        # 쓰기 성능 추출
        write_speed=$(grep "copied" "$log_file" | head -1 | grep -o '[0-9.]\+ MB/s' | head -1 || echo "N/A")
        echo "쓰기 성능: $write_speed" >> "$comparison_file"
        
        # 읽기 성능 추출
        read_speed=$(grep "copied" "$log_file" | tail -1 | grep -o '[0-9.]\+ MB/s' | head -1 || echo "N/A")
        echo "읽기 성능: $read_speed" >> "$comparison_file"
        
        # FIO 결과 추출 (있는 경우)
        if grep -q "fio" "$log_file"; then
            fio_iops=$(grep "IOPS=" "$log_file" | grep -o 'IOPS=[0-9.]\+' | head -1 || echo "N/A")
            echo "랜덤 I/O: $fio_iops" >> "$comparison_file"
        fi
    done
    
    log_info "성능 비교 완료: $comparison_file"
}

# 자동화된 모니터링 설정
setup_automated_monitoring() {
    local interval=${1:-"daily"}
    local test_dir=${2:-"/tmp"}
    
    log_info "자동화된 모니터링 설정: $interval"
    
    local script_path="/usr/local/bin/io_monitor_automated.sh"
    
    # 모니터링 스크립트 생성
    cat > "$script_path" << EOF
#!/bin/bash
# 자동화된 I/O 성능 모니터링

LOG_DIR="/var/log/io_performance"
mkdir -p "\$LOG_DIR"

# 시스템 I/O 상태 수집
$(declare -f collect_io_status)
collect_io_status "\$LOG_DIR/io_status_\$(date +%Y%m%d_%H%M).txt"

# 간단한 성능 테스트 (작은 크기)
TEST_DIR="$test_dir"
if [[ -w "\$TEST_DIR" ]]; then
    $(declare -f run_performance_test)
    run_performance_test "\$TEST_DIR" 10 64  # 10MB, 64KB 블록
fi

# 오래된 로그 파일 정리 (30일 이상)
find "\$LOG_DIR" -name "*.txt" -mtime +30 -delete 2>/dev/null || true
find "\$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true

echo "I/O 모니터링 완료: \$(date)" >> "\$LOG_DIR/monitor.log"
EOF

    chmod +x "$script_path"
    
    # crontab 설정
    local cron_schedule
    case "$interval" in
        "hourly")
            cron_schedule="0 * * * *"
            ;;
        "daily")
            cron_schedule="0 2 * * *"  # 매일 새벽 2시
            ;;
        "weekly")
            cron_schedule="0 2 * * 0"  # 매주 일요일 새벽 2시
            ;;
        *)
            log_error "지원하지 않는 간격: $interval (hourly, daily, weekly 중 선택)"
            return 1
            ;;
    esac
    
    # 기존 cron job 제거 후 새로 추가
    (crontab -l 2>/dev/null | grep -v "$script_path"; echo "$cron_schedule $script_path") | crontab -
    
    log_info "cron job 설정 완료: $cron_schedule $script_path"
    log_info "로그 디렉토리: /var/log/io_performance"
    
    echo "설정 확인:"
    echo "  스크립트: $script_path"
    echo "  스케줄: $cron_schedule"
    echo "  로그: /var/log/io_performance/"
    echo ""
    echo "수동 실행: sudo $script_path"
    echo "cron 확인: crontab -l | grep io_monitor"
}

# 메인 함수
main() {
    local action=${1:-"help"}

    case "$action" in
        "test")
            local test_dir=${2:-"/tmp"}
            local file_size=${3:-100}
            local block_size=${4:-64}
            run_performance_test "$test_dir" "$file_size" "$block_size"
            ;;
        "status")
            local output_file=${2:-}
            collect_io_status "$output_file"
            ;;
        "compare")
            local log_dir=${2:-"/tmp"}
            local pattern=${3:-"iotest_*.log"}
            compare_performance "$log_dir" "$pattern"
            ;;
        "monitor")
            local interval=${2:-"daily"}
            local test_dir=${3:-"/tmp"}
            setup_automated_monitoring "$interval" "$test_dir"
            ;;
        "help"|*)
            echo "I/O 성능 테스트 도구"
            echo ""
            echo "사용법:"
            echo "  $0 test [dir] [size_mb] [block_kb]  # 성능 테스트"
            echo "  $0 status [output_file]             # 시스템 상태 수집"
            echo "  $0 compare [log_dir] [pattern]      # 성능 비교"
            echo "  $0 monitor [interval] [test_dir]    # 자동 모니터링 설정"
            echo ""
            echo "예시:"
            echo "  $0 test /tmp 100 64                 # /tmp에서 100MB, 64KB 블록 테스트"
            echo "  $0 status                           # 현재 I/O 상태 수집"
            echo "  $0 compare /tmp                     # /tmp의 테스트 결과 비교"
            echo "  $0 monitor daily /tmp               # 일일 모니터링 설정"
            echo ""
            echo "모니터링 간격: hourly, daily, weekly"
            ;;
    esac
}

# 스크립트 실행
main "$@"
```

## 사용 방법

### 1. 디스크 벤치마크 도구 컴파일 및 실행

```bash
# C 프로그램 컴파일
gcc -o disk_benchmark disk_benchmark.c -lm

# 기본 벤치마크 (100MB, 64KB 블록)
./disk_benchmark benchmark /tmp

# 큰 파일로 테스트 (500MB, 128KB 블록)
./disk_benchmark benchmark /tmp 500 128

# 성능 회귀 테스트
./disk_benchmark regression sda
```

### 2. 성능 테스트 자동화

```bash
# 스크립트에 실행 권한 부여
chmod +x io_performance_test.sh

# 기본 성능 테스트
./io_performance_test.sh test /tmp 100 64

# 시스템 I/O 상태 수집
./io_performance_test.sh status

# 성능 결과 비교
./io_performance_test.sh compare /tmp

# 일일 자동 모니터링 설정
sudo ./io_performance_test.sh monitor daily /tmp
```

### 3. FIO를 활용한 고급 테스트

```bash
# fio 설치 (Ubuntu/Debian)
sudo apt install fio

# fio 설치 (RHEL/CentOS)
sudo yum install fio

# 설치 후 테스트 재실행
./io_performance_test.sh test /tmp
```

## 핵심 요점

### 1. 실제 디스크 성능 측정

O_SYNC와 캐시 무효화를 통해 실제 디스크 성능을 정확하게 측정

### 2. 자동화된 회귀 테스트

정기적인 성능 모니터링으로 성능 저하를 조기에 감지

### 3. 운영 환경 친화적

작은 테스트 파일과 안전한 정리 과정으로 운영 환경에서도 안전하게 사용

---

**이전**: [I/O 최적화 전략](05b-io-optimization-strategies.md)  
**다음**: [I/O 성능 분석 개요](05-io-performance-analysis.md)로 돌아가서 전체 가이드를 검토합니다.
