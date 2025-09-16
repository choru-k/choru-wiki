---
tags:
  - bash-scripting
  - cpu-affinity
  - hands-on
  - intermediate
  - medium-read
  - numa
  - performance-optimization
  - taskset
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "3-5시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 1.3b: Bash 스크립트를 통한 CPU 친화도 관리

## 시스템 관리자를 위한 실용적 도구

CPU 친화도 최적화는 단순한 명령어 실행을 넘어 전략적 접근이 필요합니다. 이 섹션에서는 다양한 시나리오에 대응하는 포괄적인 Bash 스크립트를 제공합니다.

## 완전한 CPU 친화도 관리 스크립트

```bash
#!/bin/bash
# cpu_affinity_optimizer.sh

set -euo pipefail

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로깅 함수
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# CPU 토폴로지 정보 표시
show_cpu_topology() {
    log_info "=== CPU 토폴로지 정보 ==="

    # CPU 정보
    echo "총 CPU 코어 수: $(nproc)"
    echo "온라인 CPU: $(cat /sys/devices/system/cpu/online)"
    echo "오프라인 CPU: $(cat /sys/devices/system/cpu/offline 2>/dev/null || echo 'None')"

    # NUMA 정보
    if command -v numactl &> /dev/null; then
        echo -e "\n=== NUMA 토폴로지 ==="
        numactl --hardware
    fi

    # CPU 캐시 정보
    echo -e "\n=== CPU 캐시 정보 ==="
    for cpu in /sys/devices/system/cpu/cpu*/cache/index*; do
        if [[ -d "$cpu" ]]; then
            cpu_num=$(echo "$cpu" | grep -o 'cpu[0-9]*' | head -1)
            cache_level=$(basename "$cpu" | grep -o '[0-9]*')
            cache_type=$(cat "$cpu/type" 2>/dev/null || echo "Unknown")
            cache_size=$(cat "$cpu/size" 2>/dev/null || echo "Unknown")

            echo "$cpu_num Cache L$cache_level ($cache_type): $cache_size"
        fi
    done | sort -u
}

# 현재 프로세스의 CPU 친화도 확인
check_current_affinity() {
    local pid=$1

    if [[ ! -d "/proc/$pid" ]]; then
        log_error "프로세스 $pid가 존재하지 않습니다."
        return 1
    fi

    log_info "=== 프로세스 $pid CPU 친화도 정보 ==="

    # taskset으로 현재 친화도 확인
    local current_affinity
    current_affinity=$(taskset -p "$pid" 2>/dev/null | awk '{print $NF}')
    echo "현재 CPU 마스크: $current_affinity"

    # 실제 실행 중인 CPU 확인
    local current_cpu
    current_cpu=$(awk '{print $39}' "/proc/$pid/stat" 2>/dev/null || echo "Unknown")
    echo "현재 실행 CPU: $current_cpu"

    # 프로세스 통계
    if [[ -f "/proc/$pid/status" ]]; then
        echo -e "\n=== 프로세스 통계 ==="
        grep -E "(voluntary_ctxt_switches|nonvoluntary_ctxt_switches)" "/proc/$pid/status"
    fi

    # 스레드별 친화도 (멀티스레드 프로세스의 경우)
    if [[ -d "/proc/$pid/task" ]]; then
        echo -e "\n=== 스레드별 CPU 친화도 ==="
        for task in /proc/"$pid"/task/*; do
            local tid
            tid=$(basename "$task")
            if [[ "$tid" != "$pid" ]]; then
                local thread_affinity
                thread_affinity=$(taskset -p "$tid" 2>/dev/null | awk '{print $NF}' || echo "Error")
                echo "스레드 $tid: $thread_affinity"
            fi
        done
    fi
}

# CPU 친화도 설정
set_cpu_affinity() {
    local pid=$1
    local cpu_list=$2
    local apply_to_threads=${3:-false}

    log_info "프로세스 $pid를 CPU $cpu_list에 바인딩 중..."

    # ⭐ 1단계: 메인 프로세스에 CPU 친화도 적용
    # - taskset -p: 이미 실행 중인 프로세스에 친화도 설정
    # - -c: CPU 리스트를 쉽게 읽을 수 있는 형태로 지정 (0,1,2 또는 0-2)
    if taskset -p -c "$cpu_list" "$pid"; then
        log_info "프로세스 $pid 바인딩 완료"
    else
        log_error "프로세스 $pid 바인딩 실패"
        return 1
    fi

    # ⭐ 2단계: 멀티스레드 프로세스에서 모든 스레드에 친화도 적용
    # - /proc/[pid]/task: 해당 프로세스의 모든 스레드(task) 디렉토리
    # - 각 스레드도 독립적인 친화도 설정 가능
    if [[ "$apply_to_threads" == "true" && -d "/proc/$pid/task" ]]; then
        log_info "스레드들도 바인딩 중..."
        for task in /proc/"$pid"/task/*; do
            local tid
            tid=$(basename "$task")  # 스레드 ID 추출
            # ⭐ 3단계: 메인 프로세스 ID와 다른 스레드들만 처리
            if [[ "$tid" != "$pid" ]]; then
                # ⭐ 4단계: 각 스레드에 동일한 CPU 친화도 적용
                # - 2>/dev/null: 종료된 스레드에 대한 에러 메시지 숨기기
                if taskset -p -c "$cpu_list" "$tid" 2>/dev/null; then
                    echo "스레드 $tid 바인딩 완료"
                else
                    log_warn "스레드 $tid 바인딩 실패"
                fi
            fi
        done
    fi
}

# 성능 기반 최적 CPU 찾기
find_optimal_cpu() {
    local workload_type=${1:-"general"}

    log_info "워크로드 타입 '$workload_type'에 최적화된 CPU 찾는 중..."

    # ⭐ 워크로드 타입별 CPU 친화도 전략 선택
    case "$workload_type" in
        "latency")
            # ⭐ 레이턴시 최적화 전략
            # - 높은 클럭 주파수: 더 빠른 명령어 실행
            # - 적은 공유 자원: 캐시 경합 및 참조 지역성 간섭 최소화
            # - 실시간 시스템, 게임 서버에 적합
            log_info "레이턴시 최적화: CPU 0-1 (물리적 첫 번째 코어) 추천"
            echo "0-1"
            ;;
        "throughput")
            # ⭐ 처리량 최적화 전략
            # - 모든 코어 활용: 동시 실행으로 총 연산 능력 극대화
            # - 병렬 처리, 배치 작업, 컴파일에 적합
            local max_cpu=$(($(nproc) - 1))  # 0부터 시작하므로 -1
            log_info "처리량 최적화: 모든 CPU 0-$max_cpu 추천"
            echo "0-$max_cpu"
            ;;
        "cache")
            # ⭐ 캐시 친화도 최적화 전략
            # - 같은 L3 캐시 공유: 데이터 국지성 활용
            # - NUMA 지역성: 메모리 접근 속도 최적화
            # - 데이터베이스, 인메모리 캐시에 적합
            if command -v numactl &> /dev/null; then
                local numa_cpus
                numa_cpus=$(numactl --hardware | grep "node 0 cpus" | cut -d: -f2 | tr -d ' ')
                log_info "캐시 최적화: NUMA 노드 0의 CPU $numa_cpus 추천"
                echo "$numa_cpus"
            else
                log_info "캐시 최적화: CPU 0-3 (첫 번째 NUMA 노드 추정) 추천"
                echo "0-3"
            fi
            ;;
        "isolation")
            # ⭐ CPU 격리 전략
            # - 시스템 프로세스와 분리: 인터럽트 및 OS 오버헤드 최소화
            # - 예측 가능한 성능: 전용 CPU로 인한 일정한 성능
            # - HPC, 금융 거래 시스템에 적합
            local max_cpu=$(($(nproc) - 1))
            local isolated_start=$((max_cpu - 1))
            log_info "CPU 격리: CPU $isolated_start-$max_cpu 추천"
            echo "$isolated_start-$max_cpu"
            ;;
        *)
            # ⭐ 일반적 균형 전략
            # - 절반 코어 사용: 로드밸랜싱과 성능의 균형
            # - 다양한 워크로드가 혼재된 환경에 적합
            local half_cpu=$(($(nproc) / 2 - 1))
            log_info "일반 워크로드: CPU 0-$half_cpu 추천"
            echo "0-$half_cpu"
            ;;
    esac
}

# 실시간 CPU 마이그레이션 모니터링
monitor_cpu_migration() {
    local pid=$1
    local duration=${2:-30}    # 기본 30초 모니터링
    local interval=${3:-1}     # 기본 1초 간격

    log_info "프로세스 $pid의 CPU 마이그레이션을 ${duration}초간 모니터링..."

    # ⭐ 1단계: 모니터링 상태 변수 초기화
    local prev_cpu=""          # 이전 CPU 번호 저장
    local migration_count=0    # 마이그레이션 횟수 카운터
    local start_time
    start_time=$(date +%s)     # Unix 타임스탬프

    # ⭐ 2단계: CSV 헤더 출력 (데이터 분석용)
    echo "시간,CPU,마이그레이션수"

    # ⭐ 3단계: 지정된 시간 동안 모니터링 루프
    for ((i=0; i<duration; i++)); do
        # ⭐ 4단계: 프로세스 종료 감지
        if [[ ! -d "/proc/$pid" ]]; then
            log_warn "프로세스 $pid가 종료되었습니다."
            break
        fi

        # ⭐ 5단계: 현재 실행 CPU와 시간 정보 수집
        local current_cpu
        current_cpu=$(awk '{print $39}' "/proc/$pid/stat" 2>/dev/null || echo "-1")
        local current_time
        current_time=$(date '+%H:%M:%S')  # HH:MM:SS 형식

        # ⭐ 6단계: CPU 마이그레이션 감지 및 카운터 증가
        # - 이전 CPU와 현재 CPU가 다른 경우 = 마이그레이션 발생
        if [[ -n "$prev_cpu" && "$prev_cpu" != "$current_cpu" ]]; then
            ((migration_count++))  # Bash 산술 연산으로 카운터 증가
        fi

        # ⭐ 7단계: CSV 형태로 데이터 출력
        echo "$current_time,$current_cpu,$migration_count"
        prev_cpu=$current_cpu  # 다음 반복을 위한 이전 CPU 업데이트

        # ⭐ 8단계: 지정된 간격만큼 대기
        sleep "$interval"
    done

    # ⭐ 9단계: 모니터링 종료 후 통계 계산
    local end_time
    end_time=$(date +%s)
    local total_time=$((end_time - start_time))

    # ⭐ 10단계: 마이그레이션 통계 요약 출력
    echo -e "\n=== 마이그레이션 통계 ==="
    echo "총 모니터링 시간: ${total_time}초"
    echo "총 마이그레이션 횟수: $migration_count"
    # bc 계산기로 소수점 둘째 자리까지 평균 계산
    echo "평균 마이그레이션/초: $(echo "scale=2; $migration_count / $total_time" | bc -l 2>/dev/null || echo "N/A")"
}

# 성능 테스트
run_performance_test() {
    local cpu_list=$1
    local test_type=${2:-"memory"}
    local iterations=${3:-1000000}

    log_info "CPU $cpu_list에서 성능 테스트 실행 중..."

    case "$test_type" in
        "memory")
            # 메모리 집약적 테스트
            taskset -c "$cpu_list" dd if=/dev/zero of=/dev/null bs=1M count=1000 2>&1 | \
                grep -E "(copied|MB/s)"
            ;;
        "cpu")
            # CPU 집약적 테스트
            taskset -c "$cpu_list" timeout 10s yes > /dev/null
            echo "CPU 테스트 완료 (10초)"
            ;;
        "cache")
            # 캐시 테스트 (간단한 배열 접근)
            taskset -c "$cpu_list" bash -c "
                declare -a arr
                for ((i=0; i<$iterations; i++)); do
                    arr[\$((i % 10000))]=\"\$i\"
                done
                echo '캐시 테스트 완료: $iterations 반복'
            "
            ;;
    esac
}

# 시스템 권장사항 생성
generate_recommendations() {
    local pid=$1

    log_info "=== 시스템 권장사항 ==="

    # 프로세스 타입 추정
    local comm
    comm=$(cat "/proc/$pid/comm" 2>/dev/null || echo "unknown")

    echo "프로세스: $comm (PID: $pid)"

    # 메모리 사용량 확인
    local mem_kb
    mem_kb=$(awk '/VmRSS/ {print $2}' "/proc/$pid/status" 2>/dev/null || echo "0")
    local mem_mb=$((mem_kb / 1024))

    echo "메모리 사용량: ${mem_mb}MB"

    # 권장사항 생성
    if [[ $mem_mb -gt 1000 ]]; then
        echo "🔍 대용량 메모리 사용: NUMA 노드별 바인딩 권장"
        echo "   numactl --membind=0 --cpunodebind=0 your_program"
    fi

    if [[ "$comm" =~ (nginx|apache|httpd) ]]; then
        echo "🌐 웹 서버 감지: 레이턴시 최적화 권장"
        echo "   권장 CPU: $(find_optimal_cpu "latency")"
    elif [[ "$comm" =~ (mysql|postgres|mongo) ]]; then
        echo "🗄️ 데이터베이스 감지: 캐시 친화도 최적화 권장"
        echo "   권장 CPU: $(find_optimal_cpu "cache")"
    elif [[ "$comm" =~ (java|python|node) ]]; then
        echo "⚡ 고급 언어 런타임 감지: 처리량 최적화 권장"
        echo "   권장 CPU: $(find_optimal_cpu "throughput")"
    else
        echo "📊 일반 프로세스: 기본 최적화 적용"
        echo "   권장 CPU: $(find_optimal_cpu "general")"
    fi

    # IRQ 밸런싱 확인
    echo -e "\n🔧 추가 최적화 옵션:"
    echo "- IRQ 밸런싱 비활성화: echo 0 > /proc/sys/kernel/numa_balancing"
    echo "- CPU 거버너 변경: cpupower frequency-set -g performance"
    echo "- 스케줄러 튜닝: echo 1 > /proc/sys/kernel/sched_migration_cost_ns"
}

# 메인 함수
main() {
    local action=${1:-"help"}

    case "$action" in
        "show")
            show_cpu_topology
            ;;
        "check")
            if [[ -z ${2:-} ]]; then
                log_error "PID를 입력해주세요."
                exit 1
            fi
            check_current_affinity "$2"
            ;;
        "set")
            if [[ -z ${2:-} || -z ${3:-} ]]; then
                log_error "PID와 CPU 리스트를 입력해주세요."
                exit 1
            fi
            set_cpu_affinity "$2" "$3" "${4:-false}"
            ;;
        "optimize")
            if [[ -z ${2:-} ]]; then
                log_error "PID를 입력해주세요."
                exit 1
            fi
            local optimal_cpus
            optimal_cpus=$(find_optimal_cpu "${3:-general}")
            set_cpu_affinity "$2" "$optimal_cpus"
            ;;
        "monitor")
            if [[ -z ${2:-} ]]; then
                log_error "PID를 입력해주세요."
                exit 1
            fi
            monitor_cpu_migration "$2" "${3:-30}" "${4:-1}"
            ;;
        "test")
            if [[ -z ${2:-} ]]; then
                log_error "CPU 리스트를 입력해주세요."
                exit 1
            fi
            run_performance_test "$2" "${3:-memory}" "${4:-1000000}"
            ;;
        "recommend")
            if [[ -z ${2:-} ]]; then
                log_error "PID를 입력해주세요."
                exit 1
            fi
            generate_recommendations "$2"
            ;;
        "help"|*)
            echo "CPU 친화도 최적화 도구"
            echo ""
            echo "사용법:"
            echo "  $0 show                          # CPU 토폴로지 표시"
            echo "  $0 check <PID>                   # 현재 친화도 확인"
            echo "  $0 set <PID> <CPU_LIST> [threads] # CPU 친화도 설정"
            echo "  $0 optimize <PID> [workload_type] # 자동 최적화"
            echo "  $0 monitor <PID> [duration] [interval] # 마이그레이션 모니터링"
            echo "  $0 test <CPU_LIST> [test_type]   # 성능 테스트"
            echo "  $0 recommend <PID>               # 권장사항 생성"
            echo ""
            echo "워크로드 타입: latency, throughput, cache, isolation, general"
            echo "테스트 타입: memory, cpu, cache"
            echo ""
            echo "예시:"
            echo "  $0 check 1234                    # PID 1234의 친화도 확인"
            echo "  $0 set 1234 0-3                  # CPU 0-3에 바인딩"
            echo "  $0 optimize 1234 latency         # 레이턴시 최적화"
            echo "  $0 monitor 1234 60 2             # 60초간 2초 간격으로 모니터링"
            ;;
    esac
}

# 스크립트 실행
main "$@"
```

## 실사용 예제

### 예제 1: 웹 서버 최적화

```bash
# Nginx 프로세스 최적화
./cpu_affinity_optimizer.sh check $(pgrep nginx | head -1)
./cpu_affinity_optimizer.sh optimize $(pgrep nginx | head -1) latency

# 모니터링으로 효과 확인
./cpu_affinity_optimizer.sh monitor $(pgrep nginx | head -1) 60 1
```

### 예제 2: 데이터베이스 성능 튜닝

```bash
# MySQL 프로세스 분석 및 최적화
./cpu_affinity_optimizer.sh recommend $(pgrep mysqld)
./cpu_affinity_optimizer.sh set $(pgrep mysqld) 0-7 true  # 스레드까지 포함
```

### 예제 3: 배치 작업 최적화

```bash
# 대용량 데이터 처리 작업
./cpu_affinity_optimizer.sh optimize $BATCH_PID throughput
./cpu_affinity_optimizer.sh test 0-15 memory  # 성능 확인
```

## 핵심 요점

### 1. 워크로드별 전략 차별화

각 워크로드 특성에 맞는 CPU 할당 전략을 자동으로 선택합니다.

### 2. 실시간 모니터링

마이그레이션 패턴을 실시간으로 추적하여 최적화 효과를 검증합니다.

### 3. 스레드 레벨 지원

멀티스레드 애플리케이션의 모든 스레드에 일관된 친화도를 적용할 수 있습니다.

---

**이전**: [CPU 친화도 기초와 분석](chapter-01-process-thread/04-06-cpu-affinity-fundamentals.md)  
**다음**: [Python 기반 고급 관리 도구](chapter-01-process-thread/04-22-python-advanced-manager.md)에서 정교한 분석과 자동화를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 3-5시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-04-process-thread)

- [Chapter 4-1: 프로세스 생성과 종료 개요](./04-10-process-creation.md)
- [Chapter 4-1A: fork() 시스템 콜과 프로세스 복제 메커니즘](./04-11-process-creation-fork.md)
- [Chapter 4-1B: exec() 패밀리와 프로그램 교체 메커니즘](./04-12-program-replacement-exec.md)
- [Chapter 4-1C: 프로세스 종료와 좀비 처리](./04-13-process-termination-zombies.md)
- [Chapter 4-1D: 프로세스 관리와 모니터링](./04-40-process-management-monitoring.md)

### 🏷️ 관련 키워드

`cpu-affinity`, `bash-scripting`, `performance-optimization`, `numa`, `taskset`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
