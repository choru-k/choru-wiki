---
tags:
  - blktrace
  - hands-on
  - intermediate
  - io-tuning
  - iostat
  - medium-read
  - performance-monitoring
  - scheduler-tuning
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "인프라스트럭처"
priority_score: 5
---

# Chapter 6-3E: 성능 모니터링과 튜닝

## I/O 통계: 성능의 비밀을 밝히다

제가 사용하는 모니터링 도구들:

```bash
# 1. iostat: 실시간 I/O 통계
$ iostat -x 1
Device  r/s   w/s  rMB/s  wMB/s  await  %util
nvme0n1 1250  450  125.5   45.2   0.12   35.2

# 2. iotop: 프로세스별 I/O
$ iotop -o
PID   USER  DISK READ  DISK WRITE  COMMAND
1234  mysql 125 MB/s   45 MB/s     mysqld
5678  redis 2 MB/s     15 MB/s     redis-server

# 3. blktrace: 상세 I/O 추적
$ blktrace -d /dev/nvme0n1
  8,0   1   1     0.000000000  1234  Q   R 1234567+8 [mysqld]
  8,0   1   2     0.000001234  1234  C   R 1234567+8 [0]
# Q: 큐에 등록, C: 완료
```

## I/O 통계 수집 시스템

### 커널 레벨 통계 구조체

```c
// 블록 I/O 통계
struct disk_stats {
    u64 nsecs[NR_STAT_GROUPS];
    unsigned long sectors[NR_STAT_GROUPS];
    unsigned long ios[NR_STAT_GROUPS];
    unsigned long merges[NR_STAT_GROUPS];
    unsigned long io_ticks;
    local_t in_flight[2];
};

// I/O 통계 업데이트
static inline void blk_account_io_completion(struct request *req,
                                            unsigned int bytes) {
    if (req->part && blk_do_io_stat(req)) {
        const int sgrp = op_stat_group(req_op(req));
        struct hd_struct *part = req->part;
        
        part_stat_lock();
        part_stat_add(part, sectors[sgrp], bytes >> 9);
        part_stat_unlock();
    }
}

static inline void blk_account_io_done(struct request *req, u64 now) {
    if (req->part && blk_do_io_stat(req) &&
        !(req->rq_flags & RQF_FLUSH_SEQ)) {
        const int sgrp = op_stat_group(req_op(req));
        struct hd_struct *part = req->part;
        
        update_io_ticks(part, jiffies, true);
        part_stat_lock();
        part_stat_inc(part, ios[sgrp]);
        part_stat_add(part, nsecs[sgrp], now - req->start_time_ns);
        part_dec_in_flight(req->q, part, rq_data_dir(req));
        part_stat_unlock();
    }
}

// iostat 형식 출력
static int diskstats_show(struct seq_file *seqf, void *v) {
    struct gendisk *gp = v;
    struct disk_stats stat;
    unsigned int inflight;
    
    if (gp->queue)
        inflight = part_in_flight(gp);
    else
        inflight = 0;
        
    seq_printf(seqf, "%4d %7d %s "
              "%lu %lu %lu %lu "
              "%lu %lu %lu %lu "
              "%u %u %u "
              "%lu %lu %lu %lu %lu, ",
              MAJOR(gp->part0.bd_dev), MINOR(gp->part0.bd_dev),
              disk_name(gp, 0, buf),
              stat.ios[STAT_READ],
              stat.merges[STAT_READ],
              stat.sectors[STAT_READ],
              (unsigned int)div_u64(stat.nsecs[STAT_READ], NSEC_PER_MSEC),
              stat.ios[STAT_WRITE],
              stat.merges[STAT_WRITE],
              stat.sectors[STAT_WRITE],
              (unsigned int)div_u64(stat.nsecs[STAT_WRITE], NSEC_PER_MSEC),
              inflight,
              jiffies_to_msecs(stat.io_ticks),
              (unsigned int)div_u64(stat.nsecs[STAT_READ] +
                                   stat.nsecs[STAT_WRITE] +
                                   stat.nsecs[STAT_DISCARD] +
                                   stat.nsecs[STAT_FLUSH],
                                   NSEC_PER_MSEC),
              stat.ios[STAT_DISCARD],
              stat.merges[STAT_DISCARD],
              stat.sectors[STAT_DISCARD],
              (unsigned int)div_u64(stat.nsecs[STAT_DISCARD], NSEC_PER_MSEC),
              stat.ios[STAT_FLUSH],
              (unsigned int)div_u64(stat.nsecs[STAT_FLUSH], NSEC_PER_MSEC));
              
    return 0;
}
```

## 실전 모니터링 도구 활용

### iostat으로 성능 분석

```bash
# 기본 사용법
$ iostat -x 1 5  # 1초마다 5번 출력

# 주요 지표 해석
Device    r/s   w/s  rMB/s  wMB/s  await  %util
nvme0n1   850   200   85.0   20.0   1.2    65.0

# 해석:
# r/s, w/s: 초당 읽기/쓰기 요청 수
# rMB/s, wMB/s: 초당 읽기/쓰기 MB
# await: 평균 응답 시간 (ms)
# %util: 디바이스 사용률

# 고급 옵션
$ iostat -x -d 1  # 디바이스만 표시
$ iostat -x -p ALL 1  # 모든 파티션 포함
```

### iotop으로 프로세스 추적

```bash
# 실시간 I/O 모니터링
$ iotop -o  # I/O가 발생하는 프로세스만 표시

# 누적 I/O 통계
$ iotop -a  # 시작부터의 누적 통계

# 특정 프로세스 추적
$ iotop -p 1234  # PID 1234 프로세스만 모니터링
```

### blktrace로 상세 분석

```bash
# 기본 추적
$ blktrace -d /dev/nvme0n1 -o trace

# 실시간 분석
$ blktrace -d /dev/nvme0n1 | blkparse -i -

# 추적 결과 분석
$ blkparse trace.blktrace.0
  8,0    1        1     0.000000000  1234  Q   R 12345678+8 [process]
  8,0    1        2     0.000001000  1234  G   R 12345678+8 [process]
  8,0    1        3     0.000002000  1234  D   R 12345678+8 [process]
  8,0    1        4     0.001234000     0  C   R 12345678+8 [0]

# 이벤트 해석:
# Q: Queue - 요청이 큐에 추가됨
# G: Get request - request 구조체 할당
# D: Dispatch - 디바이스로 전송
# C: Complete - 요청 완료
```

## I/O 스케줄러 튜닝: 워크로드별 최적화

제가 실전에서 사용하는 튜닝 가이드:

### 디바이스별 기본 설정

```bash
#!/bin/bash
# I/O 스케줄러 자동 설정 스크립트

for device in /sys/block/sd* /sys/block/nvme*; do
    device_name=$(basename $device)
    
    # 디바이스 타입 확인
    if [[ $device_name == nvme* ]]; then
        echo "Setting up NVMe device: $device_name"
        echo none > $device/queue/scheduler
        echo 0 > $device/queue/io_poll
        echo 0 > $device/queue/io_poll_delay
        echo 512 > $device/queue/nr_requests
    elif cat $device/queue/rotational | grep -q "0"; then
        echo "Setting up SSD device: $device_name"
        echo mq-deadline > $device/queue/scheduler
        echo 256 > $device/queue/nr_requests
        echo 128 > $device/queue/read_ahead_kb
    else
        echo "Setting up HDD device: $device_name"
        echo deadline > $device/queue/scheduler
        echo 128 > $device/queue/nr_requests
        echo 256 > $device/queue/read_ahead_kb
    fi
done
```

### 워크로드별 세부 튜닝

#### 데이터베이스 서버 (HDD)

```bash
DEVICE="sda"

# Deadline 스케줄러 파라미터
echo deadline > /sys/block/$DEVICE/queue/scheduler
echo 100 > /sys/block/$DEVICE/queue/iosched/read_expire    # 읽기 만료 100ms
echo 3000 > /sys/block/$DEVICE/queue/iosched/write_expire  # 쓰기 만료 3초
echo 16 > /sys/block/$DEVICE/queue/iosched/fifo_batch      # 배치 크기

# 큐 설정
echo 128 > /sys/block/$DEVICE/queue/nr_requests
echo 0 > /sys/block/$DEVICE/queue/nomerges  # 병합 활성화
echo 256 > /sys/block/$DEVICE/queue/read_ahead_kb

# 성능 측정
echo "Before tuning:"
fio --name=db-sim --rw=randrw --rwmixread=70 --bs=8k --iodepth=16 --runtime=60 --numjobs=4

echo "After tuning:"
# 재측정...
```

#### 웹서버 (SSD)

```bash
DEVICE="sdb"

# mq-deadline 최적화
echo mq-deadline > /sys/block/$DEVICE/queue/scheduler
echo 50 > /sys/block/$DEVICE/queue/iosched/read_expire
echo 500 > /sys/block/$DEVICE/queue/iosched/write_expire

# 큐 최적화
echo 256 > /sys/block/$DEVICE/queue/nr_requests
echo 128 > /sys/block/$DEVICE/queue/read_ahead_kb

# 성능 검증
echo "Web server I/O pattern test:"
fio --name=web-sim --rw=randread --bs=4k --iodepth=32 --runtime=60 --numjobs=8
```

#### 파일서버 (NVMe)

```bash
DEVICE="nvme0n1"

# 최소 오버헤드 설정
echo none > /sys/block/$DEVICE/queue/scheduler
echo 1024 > /sys/block/$DEVICE/queue/nr_requests

# 폴링 모드 (저지연 우선 시)
echo 1 > /sys/block/$DEVICE/queue/io_poll
echo 0 > /sys/block/$DEVICE/queue/io_poll_delay

# 처리량 우선 시
echo 0 > /sys/block/$DEVICE/queue/io_poll
echo 64 > /sys/block/$DEVICE/queue/read_ahead_kb

# 성능 비교
echo "Throughput test:"
fio --name=fileserver --rw=read --bs=1M --iodepth=64 --runtime=60 --numjobs=4
```

## 고급 성능 분석 기법

### 지연시간 분포 분석

```bash
#!/bin/bash
# I/O 지연시간 히스토그램 생성

# blktrace로 데이터 수집
blktrace -d /dev/nvme0n1 -w 60 -o latency_trace

# 지연시간 분석 스크립트
awk '
/C/ {
    if (start_time[$7] != 0) {
        latency = ($4 - start_time[$7]) * 1000000  # 마이크로초 변환
        hist[int(latency/10)]++  # 10μs 단위로 그룹화
        total++
    }
}
/Q/ {
    start_time[$7] = $4
}
END {
    print "Latency Distribution:"
    for (i in hist) {
        printf "%d-%dμs: %d (%.2f%%)\n", i*10, (i+1)*10, hist[i], hist[i]/total*100
    }
}' latency_trace.blktrace.0.parsed
```

### CPU 사용률과 I/O 상관관계

```bash
# I/O와 CPU 사용률 동시 모니터링
#!/bin/bash

while true; do
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # CPU 사용률
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    
    # I/O 통계
    io_stats=$(iostat -d 1 1 | grep nvme0n1 | awk '{print $4, $5, $10}')
    
    echo "$timestamp,$cpu_usage,$io_stats" >> io_cpu_correlation.csv
    
    sleep 1
done
```

### 메모리와 I/O 압박 상황 분석

```bash
# 시스템 전체 I/O 압박 상황 모니터링
watch -n 1 '
echo "=== Memory Pressure ==="
free -h
echo
echo "=== I/O Pressure ==="
iostat -x 1 1 | tail -n +4
echo  
echo "=== Page Cache Hit Ratio ==="
sar -B 1 1 | tail -1 | awk "{printf \"Cache efficiency: %.2f%%\n\", 100-(\$5/(\$3+\$4)*100)}"
echo
echo "=== I/O Wait ==="
sar -u 1 1 | tail -1 | awk "{print \"iowait: \" \$6 \"%\"}"
'
```

## 실전 성능 문제 해결 사례

### 사례 1: 데이터베이스 느려짐

**증상**: MySQL 쿼리 응답 시간 급증

```bash
# 1단계: 현재 상황 파악
$ iostat -x 1 5
Device    await   %util
sda       45.2    98.0   # 매우 높은 지연시간과 사용률

# 2단계: 스케줄러 확인
$ cat /sys/block/sda/queue/scheduler
[cfq] deadline noop   # CFQ 스케줄러 사용 중

# 3단계: 스케줄러 변경
$ echo deadline > /sys/block/sda/queue/scheduler

# 4단계: 결과 확인
$ iostat -x 1 5
Device    await   %util  
sda       12.1    85.0   # 지연시간 73% 감소!
```

### 사례 2: SSD 성능 최적화

**증상**: NVMe SSD임에도 기대치보다 낮은 성능

```bash
# 현재 설정 확인
$ cat /sys/block/nvme0n1/queue/scheduler
[mq-deadline] none

$ cat /sys/block/nvme0n1/queue/nr_requests  
128

# 최적화 적용
$ echo none > /sys/block/nvme0n1/queue/scheduler
$ echo 512 > /sys/block/nvme0n1/queue/nr_requests
$ echo 0 > /sys/block/nvme0n1/queue/io_poll_delay

# 성능 테스트
$ fio --name=test --rw=randread --bs=4k --iodepth=32 --runtime=30
# Before: 180K IOPS
# After:  450K IOPS (2.5배 향상!)
```

### 사례 3: 멀티 워크로드 환경

**증상**: 백업 작업 중 서비스 응답 지연

```bash
# BFQ 스케줄러로 공정성 확보
$ echo bfq > /sys/block/sda/queue/scheduler

# BFQ 파라미터 조정
$ echo 100 > /sys/block/sda/queue/iosched/slice_idle
$ echo 6 > /sys/block/sda/queue/iosched/quantum

# 백그라운드 작업 I/O 우선순위 낮추기
$ ionice -c 3 -p $(pgrep backup_process)

# 결과: 백업 중에도 서비스 응답성 유지
```

## 자동화된 성능 모니터링

### 성능 임계값 알림 시스템

```bash
#!/bin/bash
# I/O 성능 알림 스크립트

THRESHOLD_UTIL=90      # 디바이스 사용률 임계값
THRESHOLD_AWAIT=50     # 응답 시간 임계값 (ms)
THRESHOLD_IOWAIT=20    # iowait 임계값 (%)

check_io_performance() {
    iostat -x 1 1 | while read line; do
        if [[ $line =~ ^[a-z] ]]; then
            device=$(echo $line | awk '{print $1}')
            util=$(echo $line | awk '{print $NF}' | cut -d. -f1)
            await=$(echo $line | awk '{print $(NF-4)}' | cut -d. -f1)
            
            if [ "$util" -gt "$THRESHOLD_UTIL" ]; then
                echo "WARNING: Device $device utilization is ${util}%" | \
                    mail -s "High I/O Utilization Alert" admin@company.com
            fi
            
            if [ "$await" -gt "$THRESHOLD_AWAIT" ]; then
                echo "WARNING: Device $device await time is ${await}ms" | \
                    mail -s "High I/O Latency Alert" admin@company.com
            fi
        fi
    done
}

check_cpu_iowait() {
    iowait=$(sar -u 1 1 | tail -1 | awk '{print $6}' | cut -d. -f1)
    
    if [ "$iowait" -gt "$THRESHOLD_IOWAIT" ]; then
        echo "WARNING: System iowait is ${iowait}%" | \
            mail -s "High iowait Alert" admin@company.com
    fi
}

# 5분마다 실행
while true; do
    check_io_performance
    check_cpu_iowait
    sleep 300
done
```

### 성능 트렌드 수집

```bash
#!/bin/bash
# I/O 성능 메트릭 수집 및 저장

LOG_DIR="/var/log/io-metrics"
mkdir -p $LOG_DIR

collect_metrics() {
    date_str=$(date '+%Y%m%d_%H%M%S')
    
    # iostat 데이터
    iostat -x 1 5 > "$LOG_DIR/iostat_$date_str.log"
    
    # 프로세스별 I/O
    iotop -b -n 5 -d 1 > "$LOG_DIR/iotop_$date_str.log"
    
    # 시스템 전체 통계
    sar -b -u -r 1 5 > "$LOG_DIR/sar_$date_str.log"
    
    # 디스크 공간 사용률
    df -h > "$LOG_DIR/disk_usage_$date_str.log"
    
    # 주요 메트릭 요약
    echo "$(date): $(iostat -d 1 1 | grep -E "(nvme|sda)" | head -1 | awk '{print $1 ": " $4 " r/s, " $5 " w/s"}')" \
        >> "$LOG_DIR/summary.log"
}

# cron으로 정기 실행
# */15 * * * * /path/to/collect_metrics.sh
```

## 핵심 요점

### 1. 모니터링의 중요성

- **예방적 관리**: 문제 발생 전 조기 발견
- **성능 기준선**: 정상 상태 대비 이상 징후 감지
- **최적화 근거**: 데이터 기반 튜닝 결정

### 2. 도구별 활용 포인트

- **iostat**: 전체적인 I/O 성능 개요
- **iotop**: 프로세스별 I/O 사용량 추적
- **blktrace**: 세부적인 I/O 경로 분석

### 3. 튜닝 우선순위

- **스케줄러 선택**: 가장 큰 성능 영향
- **큐 깊이**: 워크로드에 맞는 조정
- **폴링/인터럽트**: 지연시간 vs 처리량 트레이드오프

### 4. 지속적인 관리

- **자동화**: 수동 모니터링의 한계 극복
- **트렌드 분석**: 장기적 성능 패턴 파악
- **알림 시스템**: 신속한 대응을 위한 임계값 설정

---

**이전**: [NVMe 최적화와 io_uring](chapter-06-file-io/03d-nvme-io-uring.md)  
**다음**: [블록 I/O와 디스크 스케줄링 개요](chapter-06-file-io/06-18-block-io.md)로 돌아가서 전체 내용을 복습합니다.

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

`performance-monitoring`, `io-tuning`, `iostat`, `blktrace`, `scheduler-tuning`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
