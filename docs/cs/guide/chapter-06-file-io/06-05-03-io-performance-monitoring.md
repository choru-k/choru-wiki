---
tags:
  - I/O metrics
  - IOPS
  - diskstats
  - hands-on
  - intermediate
  - iostat
  - medium-read
  - performance monitoring
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 6.5.3: I/O 성능 모니터링 시스템

## 실시간 I/O 성능 모니터링과 분석 도구 구현

이 섹션에서는 iostat과 유사한 기능을 제공하는 종합적인 I/O 성능 분석 도구를 직접 구현해보겠습니다. 이 도구는 /proc/diskstats를 활용하여 실시간으로 IOPS, 대역폭, 지연시간, 큐 깊이 등의 핵심 지표를 측정합니다.

## 종합 I/O 성능 분석기 구현

시스템의 I/O 성능을 종합적으로 분석하는 도구입니다.

```c
// io_performance_analyzer.c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <sys/resource.h>
#include <dirent.h>
#include <errno.h>
#include <pthread.h>
#include <time.h>
#include <math.h>

typedef struct {
    char device[32];
    unsigned long long reads_completed;
    unsigned long long reads_merged;
    unsigned long long sectors_read;
    unsigned long long time_reading;
    unsigned long long writes_completed;
    unsigned long long writes_merged;
    unsigned long long sectors_written;
    unsigned long long time_writing;
    unsigned long long io_in_progress;
    unsigned long long time_io;
    unsigned long long weighted_time_io;
} diskstats_t;

typedef struct {
    double read_iops;
    double write_iops;
    double read_bandwidth;  // MB/s
    double write_bandwidth;
    double avg_read_latency;
    double avg_write_latency;
    double utilization;
    double queue_depth;
} io_metrics_t;

typedef struct {
    char mount_point[256];
    char filesystem[64];
    unsigned long long total_size;
    unsigned long long used_size;
    unsigned long long available_size;
    double usage_percent;
} filesystem_info_t;

// get_system_info - 시스템 I/O 환경에 대한 종합적인 정보를 수집
// I/O 성능 분석의 기초가 되는 메모리 상태와 디스크 설정을 파악
void get_system_info() {
    printf("=== 시스템 I/O 정보 ===\n");

    // 메모리 정보 수집 - I/O 성능에 직접적 영향을 미치는 메모리 상태 확인
    FILE* meminfo = fopen("/proc/meminfo", "r");
    if (meminfo) {
        char line[256];
        while (fgets(line, sizeof(line), meminfo)) {
            // I/O 성능과 직결되는 메모리 정보만 선별적으로 출력
            if (strncmp(line, "MemTotal:", 9) == 0 ||       // 전체 메모리량
                strncmp(line, "MemAvailable:", 13) == 0 ||  // 실제 사용 가능 메모리
                strncmp(line, "Buffers:", 8) == 0 ||        // 블록 디바이스 버퍼 캐시
                strncmp(line, "Cached:", 7) == 0) {         // 페이지 캐시 (파일 캐시)
                printf("%s", line);
            }
        }
        fclose(meminfo);
    }

    // 블록 디바이스 정보 수집 - 각 디스크의 용량과 I/O 스케줄러 확인
    printf("\n=== 블록 디바이스 ===\n");
    DIR* block_dir = opendir("/sys/block");
    if (block_dir) {
        struct dirent* entry;
        while ((entry = readdir(block_dir)) != NULL) {
            if (entry->d_name[0] == '.') continue;  // 숨김 파일 제외

            char path[512];
            char size_str[64];

            // 디바이스 크기 확인 - /sys/block/[device]/size에서 섹터 수 읽기
            snprintf(path, sizeof(path), "/sys/block/%s/size", entry->d_name);
            FILE* size_file = fopen(path, "r");
            if (size_file) {
                if (fgets(size_str, sizeof(size_str), size_file)) {
                    // 섹터 수를 GB로 변환 (1 섹터 = 512 바이트)
                    unsigned long long sectors = strtoull(size_str, NULL, 10);
                    double size_gb = (sectors * 512.0) / (1024 * 1024 * 1024);

                    // I/O 스케줄러 정보 확인 - I/O 성능에 큰 영향을 미침
                    char scheduler[256] = {0};
                    snprintf(path, sizeof(path), "/sys/block/%s/queue/scheduler", entry->d_name);
                    FILE* sched_file = fopen(path, "r");
                    if (sched_file) {
                        fgets(scheduler, sizeof(scheduler), sched_file);
                        fclose(sched_file);
                        // "[mq-deadline] noop" 형태에서 현재 스케줄러 [current] 추출
                        char* start = strchr(scheduler, '[');
                        char* end = strchr(scheduler, ']');
                        if (start && end) {
                            *end = '\0';
                            strcpy(scheduler, start + 1);
                        }
                    }

                    // 디바이스명, 용량, 사용 중인 I/O 스케줄러 출력
                    printf("%-10s: %.1f GB, 스케줄러: %s\n",
                           entry->d_name, size_gb, scheduler);
                }
                fclose(size_file);
            }
        }
        closedir(block_dir);
    }
}

// parse_diskstats - /proc/diskstats에서 특정 디바이스의 I/O 통계 정보를 파싱
// /proc/diskstats 형식: major minor device_name read_io read_merges read_sectors read_ticks
//                     write_io write_merges write_sectors write_ticks io_in_progress io_ticks weighted_io_ticks
int parse_diskstats(const char* device, diskstats_t* stats) {
    FILE* fp = fopen("/proc/diskstats", "r");
    if (!fp) return -1;

    char line[512];
    while (fgets(line, sizeof(line), fp)) {
        char dev_name[32];
        unsigned int major, minor;  // 디바이스 메이져/마이너 번호

        // /proc/diskstats의 14개 필드를 모두 파싱
        // 읽기: 완료된 I/O 수, 병합된 요청 수, 읽은 섹터 수, 읽기에 소요된 시간(ms)
        // 쓰기: 완료된 I/O 수, 병합된 요청 수, 쓴 섹터 수, 쓰기에 소요된 시간(ms)
        // 전체: 진행 중인 I/O 수, I/O에 소요된 전체 시간, 가중 I/O 시간
        int parsed = sscanf(line, "%u %u %s %llu %llu %llu %llu %llu %llu %llu %llu %llu %llu %llu",
                           &major, &minor, dev_name,
                           &stats->reads_completed, &stats->reads_merged, &stats->sectors_read, &stats->time_reading,
                           &stats->writes_completed, &stats->writes_merged, &stats->sectors_written, &stats->time_writing,
                           &stats->io_in_progress, &stats->time_io, &stats->weighted_time_io);

        // 모든 필드가 성공적으로 파싱되고 디바이스명이 일치하는 경우
        if (parsed >= 14 && strcmp(dev_name, device) == 0) {
            strcpy(stats->device, device);
            fclose(fp);
            return 0;  // 성공
        }
    }

    fclose(fp);
    return -1;  // 디바이스를 찾을 수 없음
}

// calculate_io_metrics - 두 시점 간의 diskstats 데이터를 비교하여 성능 지표 계산
// 이 함수는 실시간 I/O 모니터링의 핵심 - iostat 도구와 동일한 계산 방식 사용
void calculate_io_metrics(diskstats_t* prev, diskstats_t* curr, double interval, io_metrics_t* metrics) {
    // IOPS (Input/Output Operations Per Second) 계산
    // 이전 측정 시점과 현재 시점의 완료된 I/O 수 차이를 시간 간격으로 나눔
    metrics->read_iops = (curr->reads_completed - prev->reads_completed) / interval;
    metrics->write_iops = (curr->writes_completed - prev->writes_completed) / interval;

    // 대역폭 (MB/s) 계산
    // 섹터 단위를 바이트로 변환 (1 섹터 = 512 바이트), 그 후 MB/s로 변환
    metrics->read_bandwidth = (curr->sectors_read - prev->sectors_read) * 512.0 / (1024 * 1024) / interval;
    metrics->write_bandwidth = (curr->sectors_written - prev->sectors_written) * 512.0 / (1024 * 1024) / interval;

    // 평균 응답 시간 (Latency) 계산 (ms)
    // 각 I/O 작업에 소요된 평균 시간 = 전체 소요 시간 / I/O 작업 수
    unsigned long long read_ops = curr->reads_completed - prev->reads_completed;
    unsigned long long write_ops = curr->writes_completed - prev->writes_completed;
    unsigned long long read_time = curr->time_reading - prev->time_reading;  // ms 단위
    unsigned long long write_time = curr->time_writing - prev->time_writing;  // ms 단위

    // 0으로 나누기를 방지하기 위한 안전 장치
    metrics->avg_read_latency = read_ops > 0 ? (double)read_time / read_ops : 0.0;
    metrics->avg_write_latency = write_ops > 0 ? (double)write_time / write_ops : 0.0;

    // 디스크 사용률 (Utilization) 계산 (%)
    // I/O에 소요된 시간 / 전체 측정 시간 * 100
    // 100%에 가까울수록 디스크가 계속 바쁘다는 의미
    unsigned long long io_time = curr->time_io - prev->time_io;
    metrics->utilization = (double)io_time / (interval * 1000) * 100;  // interval을 ms로 변환

    // 평균 큐 깊이 (Average Queue Depth) 계산
    // 가중 I/O 시간을 전체 시간으로 나눠서 평균적으로 대기 중인 I/O 요청 수 계산
    // 높을수록 디스크에 부하가 많이 걸려있다는 의미
    unsigned long long weighted_time = curr->weighted_time_io - prev->weighted_time_io;
    metrics->queue_depth = (double)weighted_time / (interval * 1000);
}

// get_filesystem_info - 시스템에 마운트된 파일시스템의 용량 정보를 수집
// I/O 성능에 영향을 미칠 수 있는 디스크 공간 사용률을 모니터링
void get_filesystem_info(filesystem_info_t* filesystems, int* count) {
    FILE* fp = fopen("/proc/mounts", "r");  // 현재 마운트된 파일시스템 목록 읽기
    if (!fp) return;

    char line[1024];
    *count = 0;

    // 각 마운트 지점에 대해 처리 (32개 한계)
    while (fgets(line, sizeof(line), fp) && *count < 32) {
        char device[256], mount_point[256], fs_type[64];

        // /proc/mounts 형식: 디바이스 마운트포인트 파일시스템타입 옵션...
        if (sscanf(line, "%s %s %s", device, mount_point, fs_type) == 3) {
            // 실제 스토리지 디바이스만 선별 (가상 파일시스템 제외)
            // /dev/로 시작하는 블록 디바이스 또는 주요 파일시스템 타입
            if (strncmp(device, "/dev/", 5) == 0 || strncmp(fs_type, "ext", 3) == 0 ||
                strcmp(fs_type, "xfs") == 0 || strcmp(fs_type, "btrfs") == 0) {

                struct statvfs vfs;  // 파일시스템 통계 구조체
                if (statvfs(mount_point, &vfs) == 0) {  // 파일시스템 정보 가져오기
                    strcpy(filesystems[*count].mount_point, mount_point);
                    strcpy(filesystems[*count].filesystem, fs_type);

                    // 용량 계산: 블록 수 * 블록 크기
                    filesystems[*count].total_size = vfs.f_blocks * vfs.f_frsize;     // 전체 용량
                    filesystems[*count].available_size = vfs.f_bavail * vfs.f_frsize; // 사용자가 사용 가능한 용량
                    // 사용 중인 용량 = 전체 - 비어있는 블록
                    filesystems[*count].used_size = filesystems[*count].total_size -
                                                   (vfs.f_bfree * vfs.f_frsize);

                    // 사용률 계산 (백분율)
                    if (filesystems[*count].total_size > 0) {
                        filesystems[*count].usage_percent =
                            (double)filesystems[*count].used_size / filesystems[*count].total_size * 100;
                    }

                    (*count)++;  // 다음 인덱스로 이동
                }
            }
        }
    }

    fclose(fp);
}

// analyze_io_patterns - 실시간 I/O 성능 모니터링 및 분석
// iostat 명령과 유사한 기능을 제공하여 I/O 병목 지점을 실시간으로 파악
void analyze_io_patterns(const char* device, int duration) {
    printf("\n=== I/O 패턴 분석: %s ===\n", device);

    diskstats_t prev_stats, curr_stats;
    io_metrics_t metrics;

    // 초기 디스크 통계 수집 (기준점 설정)
    if (parse_diskstats(device, &prev_stats) != 0) {
        printf("디바이스 %s를 찾을 수 없습니다.\n", device);
        return;
    }

    // 테이블 헤더 출력 - 각 지표의 의미:
    // R_IOPS/W_IOPS: 초당 읽기/쓰기 작업 수
    // R_MB/s/W_MB/s: 초당 읽기/쓰기 대역폭 (MB)
    // R_LAT/W_LAT: 평균 읽기/쓰기 지연시간 (ms)
    // UTIL%: 디스크 사용률 (100%에 가까울수록 바쁨)
    // QUEUE: 평균 I/O 큐 깊이 (대기 중인 요청 수)
    printf("%-10s %-8s %-8s %-10s %-10s %-8s %-8s %-8s %-8s\n",
           "시간", "R_IOPS", "W_IOPS", "R_MB/s", "W_MB/s", "R_LAT", "W_LAT", "UTIL%", "QUEUE");
    printf("%-10s %-8s %-8s %-10s %-10s %-8s %-8s %-8s %-8s\n",
           "----", "------", "------", "------", "------", "-----", "-----", "-----", "-----");

    // 지정된 기간 동안 1초 간격으로 성능 지표 측정
    for (int i = 0; i < duration; i++) {
        sleep(1);  // 1초 대기 (샘플링 간격)

        // 현재 시점의 디스크 통계 수집
        if (parse_diskstats(device, &curr_stats) != 0) {
            printf("디스크 통계 읽기 실패\n");
            break;
        }

        // 이전 측정과 현재 측정값을 비교하여 성능 지표 계산
        calculate_io_metrics(&prev_stats, &curr_stats, 1.0, &metrics);

        // 현재 시간을 포매팅하여 출력
        time_t now = time(NULL);
        struct tm* tm_info = localtime(&now);
        char time_str[16];
        strftime(time_str, sizeof(time_str), "%H:%M:%S", tm_info);

        // 모든 성능 지표를 표 형태로 출력
        // 높은 IOPS나 높은 대역폭, 높은 지연시간, 100% 근접한 사용률 등을 모니터링
        printf("%-10s %-8.0f %-8.0f %-10.1f %-10.1f %-8.1f %-8.1f %-8.1f %-8.1f\n",
               time_str, metrics.read_iops, metrics.write_iops,
               metrics.read_bandwidth, metrics.write_bandwidth,
               metrics.avg_read_latency, metrics.avg_write_latency,
               metrics.utilization, metrics.queue_depth);

        // 다음 반복을 위해 현재 값을 이전 값으로 복사
        prev_stats = curr_stats;
    }
}

// 캐시 효율성 분석
void analyze_cache_efficiency() {
    printf("\n=== 페이지 캐시 효율성 ===\n");

    FILE* vmstat = fopen("/proc/vmstat", "r");
    if (!vmstat) {
        perror("vmstat 열기 실패");
        return;
    }

    char line[256];
    unsigned long long pgpgin = 0, pgpgout = 0;
    unsigned long long pgfault = 0, pgmajfault = 0;

    while (fgets(line, sizeof(line), vmstat)) {
        if (strncmp(line, "pgpgin ", 7) == 0) {
            sscanf(line + 7, "%llu", &pgpgin);
        } else if (strncmp(line, "pgpgout ", 8) == 0) {
            sscanf(line + 8, "%llu", &pgpgout);
        } else if (strncmp(line, "pgfault ", 8) == 0) {
            sscanf(line + 8, "%llu", &pgfault);
        } else if (strncmp(line, "pgmajfault ", 11) == 0) {
            sscanf(line + 11, "%llu", &pgmajfault);
        }
    }
    fclose(vmstat);

    printf("페이지 읽기 (pgpgin): %llu\n", pgpgin);
    printf("페이지 쓰기 (pgpgout): %llu\n", pgpgout);
    printf("페이지 폴트: %llu\n", pgfault);
    printf("주요 페이지 폴트: %llu\n", pgmajfault);

    if (pgfault > 0) {
        double major_fault_ratio = (double)pgmajfault / pgfault * 100;
        printf("주요 페이지 폴트 비율: %.2f%%\n", major_fault_ratio);

        if (major_fault_ratio > 10) {
            printf("⚠️  높은 주요 페이지 폴트 비율 - 메모리 부족 가능성\n");
        }
    }
}

// I/O 대기 프로세스 분석
void analyze_io_wait_processes() {
    printf("\n=== I/O 대기 프로세스 ===\n");

    DIR* proc_dir = opendir("/proc");
    if (!proc_dir) return;

    printf("%-8s %-15s %-8s %-8s %-20s\n",
           "PID", "COMM", "STATE", "IOWAIT", "WCHAN");
    printf("%-8s %-15s %-8s %-8s %-20s\n",
           "---", "----", "-----", "------", "-----");

    struct dirent* entry;
    while ((entry = readdir(proc_dir)) != NULL) {
        if (!isdigit(entry->d_name[0])) continue;

        char stat_path[256], wchan_path[256];
        snprintf(stat_path, sizeof(stat_path), "/proc/%s/stat", entry->d_name);
        snprintf(wchan_path, sizeof(wchan_path), "/proc/%s/wchan", entry->d_name);

        FILE* stat_file = fopen(stat_path, "r");
        if (!stat_file) continue;

        char comm[64], state;
        unsigned long long delayacct_blkio_ticks;
        int pid;

        // stat 파일에서 필요한 정보 파싱 (간소화)
        fscanf(stat_file, "%d %s %c", &pid, comm, &state);

        // 42번째 필드까지 스킵하여 delayacct_blkio_ticks 읽기
        for (int i = 0; i < 39; i++) {
            fscanf(stat_file, "%*s");
        }
        fscanf(stat_file, "%llu", &delayacct_blkio_ticks);

        fclose(stat_file);

        // wchan 정보 읽기
        char wchan[64] = {0};
        FILE* wchan_file = fopen(wchan_path, "r");
        if (wchan_file) {
            fgets(wchan, sizeof(wchan), wchan_file);
            fclose(wchan_file);

            // 개행 문자 제거
            char* newline = strchr(wchan, '\n');
            if (newline) *newline = '\0';
        }

        // I/O 대기 상태이거나 블록 I/O 시간이 있는 프로세스만 출력
        if (state == 'D' || delayacct_blkio_ticks > 0) {
            printf("%-8d %-15s %-8c %-8llu %-20s\n",
                   pid, comm, state, delayacct_blkio_ticks, wchan);
        }
    }

    closedir(proc_dir);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        printf("사용법: %s <command> [options]\n", argv[0]);
        printf("Commands:\n");
        printf("  info                    - 시스템 I/O 정보 출력\n");
        printf("  monitor <device> <sec>  - I/O 패턴 모니터링\n");
        printf("  cache                   - 캐시 효율성 분석\n");
        printf("  processes               - I/O 대기 프로세스 분석\n");
        printf("  all <device>            - 종합 분석\n");
        return 1;
    }

    if (strcmp(argv[1], "info") == 0) {
        get_system_info();

        filesystem_info_t filesystems[32];
        int fs_count;
        get_filesystem_info(filesystems, &fs_count);

        printf("\n=== 파일시스템 사용량 ===\n");
        printf("%-20s %-10s %-10s %-10s %-10s %-8s\n",
               "마운트포인트", "파일시스템", "전체", "사용", "가용", "사용률");
        printf("%-20s %-10s %-10s %-10s %-10s %-8s\n",
               "----------", "--------", "----", "----", "----", "------");

        for (int i = 0; i < fs_count; i++) {
            printf("%-20s %-10s %-10.1fG %-10.1fG %-10.1fG %-8.1f%%\n",
                   filesystems[i].mount_point,
                   filesystems[i].filesystem,
                   filesystems[i].total_size / (1024.0 * 1024.0 * 1024.0),
                   filesystems[i].used_size / (1024.0 * 1024.0 * 1024.0),
                   filesystems[i].available_size / (1024.0 * 1024.0 * 1024.0),
                   filesystems[i].usage_percent);
        }

    } else if (strcmp(argv[1], "monitor") == 0 && argc >= 4) {
        const char* device = argv[2];
        int duration = atoi(argv[3]);
        analyze_io_patterns(device, duration);

    } else if (strcmp(argv[1], "cache") == 0) {
        analyze_cache_efficiency();

    } else if (strcmp(argv[1], "processes") == 0) {
        analyze_io_wait_processes();

    } else if (strcmp(argv[1], "all") == 0 && argc >= 3) {
        const char* device = argv[2];

        get_system_info();
        analyze_cache_efficiency();
        analyze_io_wait_processes();

        printf("\n10초간 I/O 패턴 모니터링을 시작합니다...\n");
        analyze_io_patterns(device, 10);

    } else {
        printf("잘못된 명령어입니다. 도움말을 보려면 인수 없이 실행하세요.\n");
        return 1;
    }

    return 0;
}
```

## 컴파일 및 실행 방법

```bash
# 컴파일
gcc -o io_analyzer io_performance_analyzer.c -lm

# 기본 정보 확인
sudo ./io_analyzer info

# 특정 디바이스 모니터링 (10초간)
sudo ./io_analyzer monitor sda 10

# 캐시 효율성 분석
sudo ./io_analyzer cache

# I/O 대기 프로세스 확인
sudo ./io_analyzer processes

# 종합 분석
sudo ./io_analyzer all sda
```

## 핵심 요점

### 1. 실시간 성능 지표 측정

iostat과 동일한 계산 방식으로 IOPS, 대역폭, 지연시간, 디스크 사용률, 큐 깊이를 실시간 측정

### 2. /proc/diskstats 활용

커널이 제공하는 I/O 통계를 직접 파싱하여 정확한 성능 데이터 수집

### 3. 페이지 캐시 효율성 분석

메이져 페이지 폴트 비율을 통해 메모리 부족 상황을 조기에 감지

---

**이전**: [I/O 성능 분석 개요](./06-05-02-io-performance.md)  
**다음**: [I/O 최적화 전략](./06-04-03-io-optimization-strategies.md)에서 SSD/HDD별 최적화 기법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 시스템 프로그래밍
-**예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-06-file-io)

- [6.2.1: 파일 디스크립터의 내부 구조](./06-02-01-file-descriptor.md)
- [6.1.1: 파일 디스크립터 기본 개념과 3단계 구조](./06-01-01-fd-basics-structure.md)
- [6.2.2: 파일 디스크립터 할당과 공유 메커니즘](./06-02-02-fd-allocation-management.md)
- [6.2.3: 파일 연산과 VFS 다형성](./06-02-03-file-operations-vfs.md)
- [6.2.4: VFS와 파일 시스템 추상화 개요](./06-02-04-vfs-filesystem.md)

### 🏷️ 관련 키워드

`iostat`, `diskstats`, `performance monitoring`, `I/O metrics`, `IOPS`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
