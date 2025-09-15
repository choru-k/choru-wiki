---
tags:
  - Performance
  - OS Tuning
  - Kernel Parameters
  - CPU Affinity
---

# 11.5b 운영체제 및 커널 튜닝

운영체제 수준에서의 성능 최적화는 애플리케이션 성능에 직접적인 영향을 미칩니다. 커널 매개변수와 시스템 리소스 관리를 올바르게 설정하여 전체적인 시스템 성능을 향상시킬 수 있습니다.

## 커널 매개변수 최적화

```bash
#!/bin/bash
# kernel_tuning.sh - 커널 매개변수 최적화

echo "=== 커널 매개변수 성능 최적화 ==="

# sysctl 설정 백업
sudo cp /etc/sysctl.conf /etc/sysctl.conf.backup.$(date +%Y%m%d)

cat << 'EOF' > /tmp/performance_tuning.conf
# ============ 네트워크 최적화 ============

# TCP 버퍼 크기 자동 조정 활성화
net.ipv4.tcp_window_scaling = 1

# TCP 송신/수신 버퍼 크기 증가
net.core.rmem_max = 134217728          # 128MB
net.core.wmem_max = 134217728          # 128MB
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728

# TCP 연결 수 증가
net.core.somaxconn = 65535             # Listen 큐 크기
net.core.netdev_max_backlog = 5000     # 네트워크 디바이스 큐

# TIME_WAIT 소켓 재사용 (주의: NAT 환경에서는 문제 가능)
net.ipv4.tcp_tw_reuse = 1

# SYN flood 공격 방어
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 8192

# TCP Keepalive 설정
net.ipv4.tcp_keepalive_time = 600      # 10분
net.ipv4.tcp_keepalive_intvl = 60      # 1분
net.ipv4.tcp_keepalive_probes = 3

# TCP 혼잡 제어 알고리즘 (BBR 권장)
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr

# ============ 메모리 관리 최적화 ============

# 가상 메모리 설정
vm.swappiness = 10                     # 스왈 사용 최소화
vm.dirty_ratio = 15                    # 더티 페이지 비율
vm.dirty_background_ratio = 5
vm.dirty_expire_centisecs = 12000      # 1.2초 후 플러시
vm.dirty_writeback_centisecs = 1500    # 0.15초마다 체크

# 메모리 과할당 허용
vm.overcommit_memory = 1

# OOM killer 조정
vm.oom_kill_allocating_task = 1

# ============ 파일 시스템 최적화 ============

# 파일 디스크립터 한계 증가
fs.file-max = 2097152
fs.nr_open = 2097152

# inotify 한계 증가
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 512

# ============ 프로세스 및 스레드 ============

# 프로세스 ID 범위 확장
kernel.pid_max = 4194303

# Core dump 설정
kernel.core_pattern = /tmp/core-%e-%p-%t

# ============ 보안 설정 ============

# ASLR (Address Space Layout Randomization)
kernel.randomize_va_space = 2

# SysRq 키 비활성화 (보안)
kernel.sysrq = 0

EOF

# 설정 적용
echo "커널 매개변수 적용 중..."
sudo sysctl -p /tmp/performance_tuning.conf

# 영구 적용을 위해 sysctl.conf에 추가
sudo cat /tmp/performance_tuning.conf >> /etc/sysctl.conf

echo "✅ 커널 매개변수 최적화 완료"

# 현재 적용된 주요 설정 확인
echo -e ", 현재 적용된 주요 설정:"
echo "TCP 버퍼 크기: $(sysctl net.ipv4.tcp_rmem)"
echo "최대 연결 수: $(sysctl net.core.somaxconn)"
echo "가상 메모리 스왈: $(sysctl vm.swappiness)"
echo "혼잡 제어: $(sysctl net.ipv4.tcp_congestion_control)"
```

## CPU 친화도 및 프로세스 우선순위

```c
// cpu_affinity.c - CPU 친화도 설정 예제
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <sched.h>
#include <unistd.h>
#include <sys/time.h>
#include <sys/resource.h>
#include <pthread.h>

// CPU 코어에 프로세스/스레드 고정
void set_cpu_affinity(int cpu_id) {
    cpu_set_t mask;
    CPU_ZERO(&mask);
    CPU_SET(cpu_id, &mask);
    
    if (sched_setaffinity(0, sizeof(mask), &mask) == -1) {
        perror("sched_setaffinity 실패");
        return;
    }
    
    printf("프로세스를 CPU %d에 고정했습니다., ", cpu_id);
}

// 프로세스 우선순위 설정
void set_process_priority(int nice_value) {
    if (setpriority(PRIO_PROCESS, 0, nice_value) == -1) {
        perror("setpriority 실패");
        return;
    }
    
    printf("프로세스 우선순위를 %d로 설정했습니다., ", nice_value);
}

// 실시간 스케줄링 설정
void set_realtime_scheduling() {
    struct sched_param param;
    param.sched_priority = 50;  // 1-99 범위
    
    if (sched_setscheduler(0, SCHED_FIFO, &param) == -1) {
        perror("실시간 스케줄링 설정 실패");
        return;
    }
    
    printf("실시간 스케줄링 모드로 설정했습니다., ");
}

// CPU 바인딩 성능 테스트
void* cpu_intensive_task(void* arg) {
    int thread_id = *(int*)arg;
    
    // 현재 실행 중인 CPU 확인
    int current_cpu = sched_getcpu();
    printf("스레드 %d가 CPU %d에서 실행 중, ", thread_id, current_cpu);
    
    // CPU 집약적 작업 시뮤레이션
    volatile long sum = 0;
    for (long i = 0; i < 1000000000L; i++) {
        sum += i;
    }
    
    printf("스레드 %d 완료 (CPU %d), 결과: %ld, ", 
           thread_id, sched_getcpu(), sum);
    
    return NULL;
}

void test_cpu_binding() {
    const int num_threads = 4;
    pthread_t threads[num_threads];
    int thread_ids[num_threads];
    
    printf(", === CPU 바인딩 성능 테스트 ===, ");
    
    struct timeval start, end;
    gettimeofday(&start, NULL);
    
    // 각 스레드를 다른 CPU에 바인딩
    for (int i = 0; i < num_threads; i++) {
        thread_ids[i] = i;
        pthread_create(&threads[i], NULL, cpu_intensive_task, &thread_ids[i]);
        
        // 스레드 CPU 친화도 설정
        cpu_set_t mask;
        CPU_ZERO(&mask);
        CPU_SET(i % sysconf(_SC_NPROCESSORS_ONLN), &mask);
        pthread_setaffinity_np(threads[i], sizeof(mask), &mask);
    }
    
    // 모든 스레드 완료 대기
    for (int i = 0; i < num_threads; i++) {
        pthread_join(threads[i], NULL);
    }
    
    gettimeofday(&end, NULL);
    
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_usec - start.tv_usec) / 1000000.0;
    
    printf("CPU 바인딩 테스트 완료: %.2f초, ", elapsed);
}

int main() {
    printf("시스템 CPU 코어 수: %ld, ", sysconf(_SC_NPROCESSORS_ONLN));
    
    // 1. CPU 친화도 설정 (메인 프로세스를 CPU 0에 고정)
    set_cpu_affinity(0);
    
    // 2. 프로세스 우선순위 설정 (높은 우선순위)
    set_process_priority(-10);
    
    // 3. CPU 바인딩 성능 테스트
    test_cpu_binding();
    
    // 4. 실시간 스케줄링 테스트 (root 권한 필요)
    printf(", 실시간 스케줄링 시도 중..., ");
    set_realtime_scheduling();
    
    return 0;
}
```

## 핵심 요점

### 1. 네트워크 스택 최적화

TCP 버퍼 크기, 연결 수 한계, 혼잡 제어 알고리즘 등을 조정하여 네트워크 성능 극대화

### 2. 메모리 관리 전략

스왈 사용 최소화, 더티 페이지 처리 최적화, OOM 상황 대응을 통한 안정성 향상

### 3. CPU 연산 최적화

CPU 연산 자원을 효율적으로 분배하고, 캐시 마이스를 최소화하여 전반적인 연산 성능 높이기

---

**이전**: [05a-system-performance-analysis.md](05a-system-performance-analysis.md)  
**다음**: [05c-application-optimization.md](05c-application-optimization.md)에서 애플리케이션 수준의 성능 최적화를 학습합니다.
