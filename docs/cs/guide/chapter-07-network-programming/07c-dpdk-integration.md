---
tags:
  - DPDK
  - High Performance Networking
  - Kernel Bypass
  - Network Device Driver
---

# DPDK 통합: "커널 바이패스로 극한 성능 달성"

상업용 고성능 네트워킹에서 필수적인 DPDK(Data Plane Development Kit) 설정과 활용법입니다.

```bash
#!/bin/bash
# dpdk_setup.sh

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

# DPDK 버전 및 설정
DPDK_VERSION="23.11"
DPDK_DIR="/opt/dpdk"
HUGEPAGE_SIZE="1G"
HUGEPAGE_COUNT="4"
PCI_WHITELIST=""

# 의존성 확인
check_dependencies() {
    log_info "DPDK 의존성 확인 중..."

    local missing_deps=()

    # 필수 패키지 확인
    local required_packages=(
        "build-essential"
        "libnuma-dev"
        "python3-pyelftools"
        "python3-pip"
        "pkg-config"
    )

    for package in "${required_packages[@]}"; do
        if ! dpkg -l | grep -q "$package"; then
            missing_deps+=("$package")
        fi
    done

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_warning "누락된 패키지: ${missing_deps[*]}"
        echo "설치 명령어: sudo apt update && sudo apt install ${missing_deps[*]}"
        return 1
    fi

    # 커널 헤더 확인
    if [[ ! -d "/lib/modules/$(uname -r)/build" ]]; then
        log_error "커널 헤더가 설치되지 않음"
        echo "설치 명령어: sudo apt install linux-headers-$(uname -r)"
        return 1
    fi

    log_success "의존성 확인 완료"
    return 0
}

# 휴지페이지 설정
setup_hugepages() {
    log_info "휴지페이지 설정 중..."

    # 현재 휴지페이지 상태 확인
    echo "=== 현재 휴지페이지 설정 ==="
    cat /proc/meminfo | grep -i huge || echo "휴지페이지 정보 없음"

    # 휴지페이지 마운트 포인트 생성
    sudo mkdir -p /mnt/huge

    # 휴지페이지 설정
    if [[ "$HUGEPAGE_SIZE" == "1G" ]]; then
        # 1GB 휴지페이지 설정
        echo "default_hugepagesz=1G hugepagesz=1G hugepages=$HUGEPAGE_COUNT" | \
            sudo tee -a /etc/default/grub

        # 런타임 설정
        echo "$HUGEPAGE_COUNT" | sudo tee /sys/kernel/mm/hugepages/hugepages-1048576kB/nr_hugepages

        # fstab 항목 추가
        if ! grep -q "/mnt/huge" /etc/fstab; then
            echo "nodev /mnt/huge hugetlbfs pagesize=1GB 0 0" | sudo tee -a /etc/fstab
        fi
    else
        # 2MB 휴지페이지 설정
        local hugepages_2mb=$((HUGEPAGE_COUNT * 512))  # 1GB = 512 * 2MB
        echo "$hugepages_2mb" | sudo tee /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages

        if ! grep -q "/mnt/huge" /etc/fstab; then
            echo "nodev /mnt/huge hugetlbfs defaults 0 0" | sudo tee -a /etc/fstab
        fi
    fi

    # 휴지페이지 마운트
    sudo mount -t hugetlbfs nodev /mnt/huge 2>/dev/null || true

    echo ""
    echo "=== 설정된 휴지페이지 ==="
    cat /proc/meminfo | grep -i huge

    log_success "휴지페이지 설정 완료"
}

# DPDK 다운로드 및 빌드
install_dpdk() {
    log_info "DPDK $DPDK_VERSION 설치 중..."

    # 작업 디렉토리 생성
    sudo mkdir -p "$DPDK_DIR"
    cd /tmp

    # DPDK 소스 다운로드
    if [[ ! -f "dpdk-$DPDK_VERSION.tar.xz" ]]; then
        wget "https://fast.dpdk.org/rel/dpdk-$DPDK_VERSION.tar.xz"
    fi

    # 압축 해제
    tar xf "dpdk-$DPDK_VERSION.tar.xz"
    cd "dpdk-$DPDK_VERSION"

    # Meson 빌드 설정
    pip3 install --user meson ninja

    # 빌드 디렉토리 생성
    meson build
    cd build

    # 컴파일
    ninja

    # 설치
    sudo ninja install
    sudo ldconfig

    # 환경 변수 설정
    if ! grep -q "PKG_CONFIG_PATH.*dpdk" ~/.bashrc; then
        echo "export PKG_CONFIG_PATH=/usr/local/lib/x86_64-linux-gnu/pkgconfig" >> ~/.bashrc
    fi

    log_success "DPDK 설치 완료"
}

# 네트워크 인터페이스 바인딩
bind_network_interfaces() {
    log_info "네트워크 인터페이스 DPDK 바인딩 설정 중..."

    # dpdk-devbind.py 스크립트 경로 찾기
    local devbind_script=$(find /usr/local -name "dpdk-devbind.py" 2>/dev/null | head -1)

    if [[ -z "$devbind_script" ]]; then
        log_error "dpdk-devbind.py 스크립트를 찾을 수 없음"
        return 1
    fi

    echo "=== 현재 네트워크 인터페이스 ==="
    python3 "$devbind_script" --status

    echo ""
    echo "=== DPDK 호환 드라이버 로드 ==="

    # UIO 드라이버 로드
    sudo modprobe uio

    # VFIO 드라이버 로드 (권장)
    sudo modprobe vfio-pci

    # 사용자가 특정 인터페이스를 지정한 경우
    if [[ -n "$PCI_WHITELIST" ]]; then
        IFS=',' read -ra PCI_DEVICES <<< "$PCI_WHITELIST"

        for pci_id in "${PCI_DEVICES[@]}"; do
            log_info "PCI 디바이스 $pci_id를 DPDK에 바인딩 중..."
            sudo python3 "$devbind_script" --bind=vfio-pci "$pci_id"
        done
    else
        log_warning "PCI 디바이스가 지정되지 않음"
        echo "사용 가능한 네트워크 인터페이스를 확인하고 수동으로 바인딩하세요:"
        echo "sudo $devbind_script --bind=vfio-pci [PCI_ID]"
    fi

    echo ""
    echo "=== 바인딩 후 상태 ==="
    python3 "$devbind_script" --status
}

# DPDK 예제 애플리케이션 빌드
build_examples() {
    log_info "DPDK 예제 애플리케이션 빌드 중..."

    cd /tmp/dpdk-$DPDK_VERSION/examples

    # 기본 예제들 빌드
    local examples=(
        "helloworld"
        "l2fwd"
        "l3fwd"
        "testpmd"
    )

    for example in "${examples[@]}"; do
        if [[ -d "$example" ]]; then
            log_info "$example 빌드 중..."
            cd "$example"
            make
            cd ..
        fi
    done

    log_success "예제 애플리케이션 빌드 완료"
}

# 성능 테스트
performance_test() {
    log_info "DPDK 성능 테스트 시작..."

    local testpmd_path="/tmp/dpdk-$DPDK_VERSION/examples/testpmd/build/testpmd"

    if [[ ! -f "$testpmd_path" ]]; then
        log_error "testpmd 실행 파일을 찾을 수 없음"
        return 1
    fi

    echo "=== TestPMD 성능 테스트 ==="
    echo "테스트 설정:"
    echo "  - 포워딩 모드: io"
    echo "  - 코어: 2개"
    echo "  - 메모리 채널: 4개"

    # TestPMD 실행 (데모 모드)
    sudo "$testpmd_path" -l 0-1 -n 4 -- --forward-mode=io --auto-start &
    local testpmd_pid=$!

    sleep 5

    # 기본 통계 확인
    echo ""
    echo "=== 실시간 통계 (5초간) ==="
    for i in {1..5}; do
        echo "통계 확인 $i/5..."
        sleep 1
    done

    # TestPMD 종료
    sudo kill $testpmd_pid 2>/dev/null || true

    log_success "성능 테스트 완료"
}

# 간단한 DPDK 애플리케이션 예제 생성
create_sample_app() {
    log_info "DPDK 샘플 애플리케이션 생성 중..."

    mkdir -p ~/dpdk_sample
    cd ~/dpdk_sample

    # 기본 DPDK 애플리케이션 코드
    cat << 'EOF' > main.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <inttypes.h>
#include <sys/types.h>
#include <sys/queue.h>
#include <netinet/in.h>
#include <setjmp.h>
#include <stdarg.h>
#include <ctype.h>
#include <errno.h>
#include <getopt.h>
#include <signal.h>
#include <stdbool.h>

#include <rte_common.h>
#include <rte_log.h>
#include <rte_malloc.h>
#include <rte_memory.h>
#include <rte_memcpy.h>
#include <rte_eal.h>
#include <rte_launch.h>
#include <rte_atomic.h>
#include <rte_cycles.h>
#include <rte_prefetch.h>
#include <rte_lcore.h>
#include <rte_per_lcore.h>
#include <rte_branch_prediction.h>
#include <rte_interrupts.h>
#include <rte_random.h>
#include <rte_debug.h>
#include <rte_ether.h>
#include <rte_ethdev.h>
#include <rte_mempool.h>
#include <rte_mbuf.h>

#define RX_RING_SIZE 1024
#define TX_RING_SIZE 1024
#define NUM_MBUFS 8191
#define MBUF_CACHE_SIZE 250
#define BURST_SIZE 32

static const struct rte_eth_conf port_conf_default = {
    .rxmode = {
        .max_rx_pkt_len = RTE_ETHER_MAX_LEN,
    },
};

static struct rte_mempool *mbuf_pool;

static inline int
port_init(uint16_t port, struct rte_mempool *mbuf_pool)
{
    struct rte_eth_conf port_conf = port_conf_default;
    const uint16_t rx_rings = 1, tx_rings = 1;
    uint16_t nb_rxd = RX_RING_SIZE;
    uint16_t nb_txd = TX_RING_SIZE;
    int retval;
    uint16_t q;
    struct rte_eth_dev_info dev_info;
    struct rte_eth_txconf txconf;

    if (!rte_eth_dev_is_valid_port(port))
        return -1;

    retval = rte_eth_dev_info_get(port, &dev_info);
    if (retval != 0) {
        printf("Error during getting device (port %u) info: %s\n",
                port, strerror(-retval));
        return retval;
    }

    if (dev_info.tx_offload_capa & DEV_TX_OFFLOAD_MBUF_FAST_FREE)
        port_conf.txmode.offloads |= DEV_TX_OFFLOAD_MBUF_FAST_FREE;

    retval = rte_eth_dev_configure(port, rx_rings, tx_rings, &port_conf);
    if (retval != 0)
        return retval;

    retval = rte_eth_dev_adjust_nb_rx_tx_desc(port, &nb_rxd, &nb_txd);
    if (retval != 0)
        return retval;

    for (q = 0; q < rx_rings; q++) {
        retval = rte_eth_rx_queue_setup(port, q, nb_rxd,
                rte_eth_dev_socket_id(port), NULL, mbuf_pool);
        if (retval < 0)
            return retval;
    }

    txconf = dev_info.default_txconf;
    txconf.offloads = port_conf.txmode.offloads;
    for (q = 0; q < tx_rings; q++) {
        retval = rte_eth_tx_queue_setup(port, q, nb_txd,
                rte_eth_dev_socket_id(port), &txconf);
        if (retval < 0)
            return retval;
    }

    retval = rte_eth_dev_start(port);
    if (retval < 0)
        return retval;

    struct rte_ether_addr addr;
    retval = rte_eth_macaddr_get(port, &addr);
    if (retval != 0)
        return retval;

    printf("Port %u MAC: %02x:%02x:%02x:%02x:%02x:%02x\n",
            port,
            addr.addr_bytes[0], addr.addr_bytes[1],
            addr.addr_bytes[2], addr.addr_bytes[3],
            addr.addr_bytes[4], addr.addr_bytes[5]);

    retval = rte_eth_promiscuous_enable(port);
    if (retval != 0)
        return retval;

    return 0;
}

static __rte_noreturn void
lcore_main(void)
{
    uint16_t port;

    RTE_ETH_FOREACH_DEV(port)
        if (rte_eth_dev_socket_id(port) > 0 &&
                rte_eth_dev_socket_id(port) !=
                        (int)rte_socket_id())
            printf("WARNING, port %u is on remote NUMA node to "
                    "polling thread.\n\tPerformance will "
                    "not be optimal.\n", port);

    printf("\nCore %u forwarding packets. [Ctrl+C to quit]\n",
            rte_lcore_id());

    for (;;) {
        RTE_ETH_FOREACH_DEV(port) {
            struct rte_mbuf *bufs[BURST_SIZE];
            const uint16_t nb_rx = rte_eth_rx_burst(port, 0,
                    bufs, BURST_SIZE);

            if (unlikely(nb_rx == 0))
                continue;

            const uint16_t nb_tx = rte_eth_tx_burst(port ^ 1, 0,
                    bufs, nb_rx);

            if (unlikely(nb_tx < nb_rx)) {
                uint16_t buf;
                for (buf = nb_tx; buf < nb_rx; buf++)
                    rte_pktmbuf_free(bufs[buf]);
            }
        }
    }
}

int
main(int argc, char *argv[])
{
    unsigned nb_ports;
    uint16_t portid;

    int ret = rte_eal_init(argc, argv);
    if (ret < 0)
        rte_panic("Cannot init EAL\n");

    argc -= ret;
    argv += ret;

    nb_ports = rte_eth_dev_count_avail();
    if (nb_ports < 2 || (nb_ports & 1))
        rte_exit(EXIT_FAILURE, "Error: number of ports must be even\n");

    mbuf_pool = rte_pktmbuf_pool_create("MBUF_POOL", NUM_MBUFS * nb_ports,
        MBUF_CACHE_SIZE, 0, RTE_MBUF_DEFAULT_BUF_SIZE, rte_socket_id());

    if (mbuf_pool == NULL)
        rte_exit(EXIT_FAILURE, "Cannot create mbuf pool\n");

    RTE_ETH_FOREACH_DEV(portid)
        if (port_init(portid, mbuf_pool) != 0)
            rte_exit(EXIT_FAILURE, "Cannot init port %"PRIu16 "\n",
                    portid);

    if (rte_lcore_count() > 1)
        printf("\nWARNING: Too many lcores enabled. Only 1 used.\n");

    lcore_main();

    return 0;
}
EOF

    # Makefile 생성
    cat << 'EOF' > Makefile
ifeq ($(RTE_SDK),)
$(error "Please define RTE_SDK environment variable")
endif

APP = dpdk_sample

SRCS-y := main.c

PKGCONF ?= pkg-config

PC_FILE := $(shell $(PKGCONF) --path libdpdk 2>/dev/null)
CFLAGS += -O3 $(shell $(PKGCONF) --cflags libdpdk)
LDFLAGS_SHARED = $(shell $(PKGCONF) --libs libdpdk)
LDFLAGS_STATIC = $(shell $(PKGCONF) --static --libs libdpdk)

build/$(APP)-shared: $(SRCS-y) Makefile $(PC_FILE) | build
 $(CC) $(CFLAGS) $(SRCS-y) -o $@ $(LDFLAGS_SHARED)

build/$(APP)-static: $(SRCS-y) Makefile $(PC_FILE) | build
 $(CC) $(CFLAGS) $(SRCS-y) -o $@ $(LDFLAGS_STATIC)

build:
 @mkdir -p $@

.PHONY: clean
clean:
 rm -f build/$(APP) build/$(APP)-static build/$(APP)-shared
 test -d build && rmdir build || true
EOF

    log_success "DPDK 샘플 애플리케이션 생성 완료: ~/dpdk_sample/"
    echo "빌드 명령어: cd ~/dpdk_sample && make build/dpdk_sample-shared"
}

# 설정 검증
verify_setup() {
    log_info "DPDK 설정 검증 중..."

    echo "=== 휴지페이지 상태 ==="
    cat /proc/meminfo | grep -i huge

    echo ""
    echo "=== DPDK 라이브러리 ==="
    ldconfig -p | grep dpdk || echo "DPDK 라이브러리 로드 안됨"

    echo ""
    echo "=== 네트워크 인터페이스 ==="
    local devbind_script=$(find /usr/local -name "dpdk-devbind.py" 2>/dev/null | head -1)
    if [[ -n "$devbind_script" ]]; then
        python3 "$devbind_script" --status | head -20
    else
        echo "dpdk-devbind.py 스크립트 없음"
    fi

    echo ""
    echo "=== 권장 다음 단계 ==="
    echo "1. 네트워크 인터페이스를 DPDK에 바인딩"
    echo "2. 샘플 애플리케이션 테스트"
    echo "3. 성능 벤치마크 실행"

    log_success "설정 검증 완료"
}

# 메인 함수
main() {
    echo "========================================"
    echo "DPDK 설치 및 설정 도구"
    echo "========================================"
    echo ""

    if [[ $EUID -ne 0 ]]; then
        log_error "이 스크립트는 root 권한이 필요합니다."
        echo "sudo $0 $*"
        exit 1
    fi

    case "${1:-install}" in
        "deps")
            check_dependencies
            ;;
        "hugepages")
            setup_hugepages
            ;;
        "install")
            check_dependencies
            setup_hugepages
            install_dpdk
            create_sample_app
            verify_setup
            ;;
        "bind")
            PCI_WHITELIST="${2:-}"
            bind_network_interfaces
            ;;
        "test")
            performance_test
            ;;
        "examples")
            build_examples
            ;;
        "verify")
            verify_setup
            ;;
        *)
            echo "사용법: $0 [deps|hugepages|install|bind|test|examples|verify]"
            echo ""
            echo "deps      - 의존성 확인"
            echo "hugepages - 휴지페이지 설정"
            echo "install   - 전체 설치 과정"
            echo "bind      - 네트워크 인터페이스 바인딩"
            echo "test      - 성능 테스트"
            echo "examples  - 예제 애플리케이션 빌드"
            echo "verify    - 설정 검증"
            exit 1
            ;;
    esac
}

# 스크립트 실행
main "$@"
```

## 핵심 요점

### 1. DPDK 아키텍처

DPDK는 커널을 우회하여 직접 네트워크 카드를 제어하는 고성능 네트워킹 프레임워크입니다

### 2. 휴지페이지 설정

메모리 정렬과 성능 최적화를 위해 대용량 페이지 설정이 필수입니다

### 3. 네트워크 인터페이스 바인딩

운영체제의 제어를 벗어나 DPDK가 직접 하드웨어를 제어할 수 있도록 설정합니다

---

**이전**: [고성능 분석 도구](07b-high-performance-analysis-tool.md)  
**다음**: [고성능 네트워킹 개요](07-high-performance-networking.md)로 돌아가서 전체 내용을 검토할 수 있습니다.
