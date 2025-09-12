---
tags:
  - Filesystem
  - I/O
  - Performance
  - Linux
  - Debugging
---

# I/O 성능 분석: "디스크가 느려서 서비스가 버벅여요"

## 상황: 데이터베이스 서버의 성능 저하

"안녕하세요, PostgreSQL을 운영하고 있는데 최근 들어 쿼리 응답시간이 급격히 늘어났어요. CPU나 메모리는 여유가 있는데 디스크 I/O가 병목인 것 같습니다. 어떻게 분석하고 최적화할 수 있을까요?"

이런 상황은 데이터베이스, 로그 처리, 파일 서버 등에서 흔히 발생하는 문제입니다. I/O 성능을 체계적으로 분석하고 최적화하는 방법을 알아보겠습니다.

## I/O 성능의 이해

```mermaid
graph TD
    A[애플리케이션] --> B[시스템 호출]
    B --> C[VFS 레이어]
    C --> D[파일시스템]
    D --> E[페이지 캐시]
    E --> F[블록 레이어]
    F --> G[I/O 스케줄러]
    G --> H[디바이스 드라이버]
    H --> I[스토리지 디바이스]
    
    E --> E1[Hit: 메모리에서 직접 반환]
    E --> E2[Miss: 디스크에서 읽기]
    
    F --> F1[순차 I/O]
    F --> F2[랜덤 I/O]
    
    G --> G1[CFQ 스케줄러]
    G --> G2[Deadline 스케줄러]
    G --> G3[NOOP 스케줄러]
    G --> G4[mq-deadline]
    
    I --> I1[HDD: 기계식]
    I --> I2[SSD: 플래시]
    I --> I3[NVMe: 고성능]
    
    subgraph "성능 지표"
        J[IOPS - 초당 I/O 횟수]
        K[대역폭 - MB/s]
        L[지연시간 - ms]
        M[큐 깊이 - Queue Depth]
    end
```text

## 1. 종합 I/O 성능 분석기

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
    printf("=== 시스템 I/O 정보 ===, ");
    
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
    printf(", === 블록 디바이스 ===, ");
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
                    printf("%-10s: %.1f GB, 스케줄러: %s, ", 
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
    // 이전 측정 시점과 현재 시점의 완료된 I/O 수 차이를 시간 간격으로 나눠
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
    // 100%에 가까울수록 디스크가 계속 바쁨다는 의미
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
    printf(", === I/O 패턴 분석: %s ===, ", device);
    
    diskstats_t prev_stats, curr_stats;
    io_metrics_t metrics;
    
    // 초기 디스크 통계 수집 (기준점 설정)
    if (parse_diskstats(device, &prev_stats) != 0) {
        printf("디바이스 %s를 찾을 수 없습니다., ", device);
        return;
    }
    
    // 테이블 헤더 출력 - 각 지표의 의미:
    // R_IOPS/W_IOPS: 초당 읽기/쓰기 작업 수
    // R_MB/s/W_MB/s: 초당 읽기/쓰기 대역폭 (MB)
    // R_LAT/W_LAT: 평균 읽기/쓰기 지연시간 (ms)
    // UTIL%: 디스크 사용률 (100%에 가까울수록 의리)
    // QUEUE: 평균 I/O 큐 깊이 (대기 중인 요청 수)
    printf("%-10s %-8s %-8s %-10s %-10s %-8s %-8s %-8s %-8s, ",
           "시간", "R_IOPS", "W_IOPS", "R_MB/s", "W_MB/s", "R_LAT", "W_LAT", "UTIL%", "QUEUE");
    printf("%-10s %-8s %-8s %-10s %-10s %-8s %-8s %-8s %-8s, ",
           "----", "------", "------", "------", "------", "-----", "-----", "-----", "-----");
    
    // 지정된 기간 동안 1초 간격으로 성능 지표 측정
    for (int i = 0; i < duration; i++) {
        sleep(1);  // 1초 대기 (샘플링 간격)
        
        // 현재 시점의 디스크 통계 수집
        if (parse_diskstats(device, &curr_stats) != 0) {
            printf("디스크 통계 읽기 실패, ");
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
        printf("%-10s %-8.0f %-8.0f %-10.1f %-10.1f %-8.1f %-8.1f %-8.1f %-8.1f, ",
               time_str, metrics.read_iops, metrics.write_iops,
               metrics.read_bandwidth, metrics.write_bandwidth,
               metrics.avg_read_latency, metrics.avg_write_latency,
               metrics.utilization, metrics.queue_depth);
        
        // 다음 반복을 위해 현재 값을 이전 값으로 복사
        prev_stats = curr_stats;
    }
}

// 디스크 벤치마크
void run_disk_benchmark(const char* path, size_t file_size, size_t block_size) {
    printf(", === 디스크 벤치마크: %s ===, ", path);
    printf("파일 크기: %zu MB, 블록 크기: %zu KB, ", 
           file_size / (1024 * 1024), block_size / 1024);
    
    char test_file[512];
    snprintf(test_file, sizeof(test_file), "%s/benchmark_test.dat", path);
    
    // 쓰기 테스트
    printf(", --- 순차 쓰기 테스트 ---, ");
    char* buffer = malloc(block_size);
    memset(buffer, 0xAA, block_size);
    
    struct timeval start, end;
    gettimeofday(&start, NULL);
    
    int fd = open(test_file, O_WRONLY | O_CREAT | O_TRUNC | O_SYNC, 0644);
    if (fd == -1) {
        perror("파일 열기 실패");
        free(buffer);
        return;
    }
    
    size_t total_written = 0;
    while (total_written < file_size) {
        size_t to_write = (file_size - total_written) < block_size ? 
                         (file_size - total_written) : block_size;
        
        ssize_t written = write(fd, buffer, to_write);
        if (written <= 0) {
            perror("쓰기 실패");
            break;
        }
        total_written += written;
    }
    
    close(fd);
    gettimeofday(&end, NULL);
    
    double write_time = (end.tv_sec - start.tv_sec) + 
                       (end.tv_usec - start.tv_usec) / 1000000.0;
    double write_speed = (total_written / (1024.0 * 1024.0)) / write_time;
    
    printf("쓰기 속도: %.2f MB/s, ", write_speed);
    
    // 읽기 테스트
    printf(", --- 순차 읽기 테스트 ---, ");
    gettimeofday(&start, NULL);
    
    fd = open(test_file, O_RDONLY);
    if (fd == -1) {
        perror("파일 열기 실패");
        free(buffer);
        return;
    }
    
    size_t total_read = 0;
    while (total_read < file_size) {
        ssize_t read_bytes = read(fd, buffer, block_size);
        if (read_bytes <= 0) break;
        total_read += read_bytes;
    }
    
    close(fd);
    gettimeofday(&end, NULL);
    
    double read_time = (end.tv_sec - start.tv_sec) + 
                      (end.tv_usec - start.tv_usec) / 1000000.0;
    double read_speed = (total_read / (1024.0 * 1024.0)) / read_time;
    
    printf("읽기 속도: %.2f MB/s, ", read_speed);
    
    // 랜덤 I/O 테스트
    printf(", --- 랜덤 I/O 테스트 ---, ");
    fd = open(test_file, O_RDWR);
    if (fd == -1) {
        perror("파일 열기 실패");
        free(buffer);
        return;
    }
    
    int num_operations = 1000;
    gettimeofday(&start, NULL);
    
    srand(time(NULL));
    for (int i = 0; i < num_operations; i++) {
        off_t offset = (rand() % (file_size / block_size)) * block_size;
        lseek(fd, offset, SEEK_SET);
        
        if (i % 2 == 0) {
            read(fd, buffer, block_size);
        } else {
            write(fd, buffer, block_size);
        }
    }
    
    close(fd);
    gettimeofday(&end, NULL);
    
    double random_time = (end.tv_sec - start.tv_sec) + 
                        (end.tv_usec - start.tv_usec) / 1000000.0;
    double random_iops = num_operations / random_time;
    
    printf("랜덤 IOPS: %.2f, ", random_iops);
    
    // 정리
    unlink(test_file);
    free(buffer);
}

// 캐시 효율성 분석
void analyze_cache_efficiency() {
    printf(", === 페이지 캐시 효율성 ===, ");
    
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
    
    printf("페이지 읽기 (pgpgin): %llu, ", pgpgin);
    printf("페이지 쓰기 (pgpgout): %llu, ", pgpgout);
    printf("페이지 폴트: %llu, ", pgfault);
    printf("주요 페이지 폴트: %llu, ", pgmajfault);
    
    if (pgfault > 0) {
        double major_fault_ratio = (double)pgmajfault / pgfault * 100;
        printf("주요 페이지 폴트 비율: %.2f%%, ", major_fault_ratio);
        
        if (major_fault_ratio > 10) {
            printf("⚠️  높은 주요 페이지 폴트 비율 - 메모리 부족 가능성, ");
        }
    }
}

// I/O 대기 프로세스 분석
void analyze_io_wait_processes() {
    printf(", === I/O 대기 프로세스 ===, ");
    
    DIR* proc_dir = opendir("/proc");
    if (!proc_dir) return;
    
    printf("%-8s %-15s %-8s %-8s %-20s, ", 
           "PID", "COMM", "STATE", "IOWAIT", "WCHAN");
    printf("%-8s %-15s %-8s %-8s %-20s, ", 
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
            char* newline = strchr(wchan, ', ');
            if (newline) *newline = '\0';
        }
        
        // I/O 대기 상태이거나 블록 I/O 시간이 있는 프로세스만 출력
        if (state == 'D' || delayacct_blkio_ticks > 0) {
            printf("%-8d %-15s %-8c %-8llu %-20s, ", 
                   pid, comm, state, delayacct_blkio_ticks, wchan);
        }
    }
    
    closedir(proc_dir);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        printf("사용법: %s <command> [options], ", argv[0]);
        printf("Commands:, ");
        printf("  info                    - 시스템 I/O 정보 출력, ");
        printf("  monitor <device> <sec>  - I/O 패턴 모니터링, ");
        printf("  benchmark <path>        - 디스크 벤치마크, ");
        printf("  cache                   - 캐시 효율성 분석, ");
        printf("  processes               - I/O 대기 프로세스 분석, ");
        printf("  all <device>            - 종합 분석, ");
        return 1;
    }
    
    if (strcmp(argv[1], "info") == 0) {
        get_system_info();
        
        filesystem_info_t filesystems[32];
        int fs_count;
        get_filesystem_info(filesystems, &fs_count);
        
        printf(", === 파일시스템 사용량 ===, ");
        printf("%-20s %-10s %-10s %-10s %-10s %-8s, ",
               "마운트포인트", "파일시스템", "전체", "사용", "가용", "사용률");
        printf("%-20s %-10s %-10s %-10s %-10s %-8s, ",
               "----------", "--------", "----", "----", "----", "------");
        
        for (int i = 0; i < fs_count; i++) {
            printf("%-20s %-10s %-10.1fG %-10.1fG %-10.1fG %-8.1f%%, ",
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
        
    } else if (strcmp(argv[1], "benchmark") == 0 && argc >= 3) {
        const char* path = argv[2];
        size_t file_size = 100 * 1024 * 1024;  // 100MB
        size_t block_size = 64 * 1024;         // 64KB
        run_disk_benchmark(path, file_size, block_size);
        
    } else if (strcmp(argv[1], "cache") == 0) {
        analyze_cache_efficiency();
        
    } else if (strcmp(argv[1], "processes") == 0) {
        analyze_io_wait_processes();
        
    } else if (strcmp(argv[1], "all") == 0 && argc >= 3) {
        const char* device = argv[2];
        
        get_system_info();
        analyze_cache_efficiency();
        analyze_io_wait_processes();
        
        printf(", 10초간 I/O 패턴 모니터링을 시작합니다..., ");
        analyze_io_patterns(device, 10);
        
    } else {
        printf("잘못된 명령어입니다. 도움말을 보려면 인수 없이 실행하세요., ");
        return 1;
    }
    
    return 0;
}
```text

## 2. I/O 최적화 스크립트

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
    echo -e ", ReadAhead 설정:"
    for device in /sys/block/*/queue/read_ahead_kb; do
        if [[ -f "$device" ]]; then
            device_name=$(echo "$device" | cut -d'/' -f4)
            readahead=$(cat "$device")
            echo "  $device_name: ${readahead}KB"
        fi
    done
    
    # 큐 깊이 확인
    echo -e ", 큐 깊이:"
    for device in /sys/block/*/queue/nr_requests; do
        if [[ -f "$device" ]]; then
            device_name=$(echo "$device" | cut -d'/' -f4)
            queue_depth=$(cat "$device")
            echo "  $device_name: $queue_depth"
        fi
    done
    
    # 파일시스템 마운트 옵션 확인
    echo -e ", 파일시스템 마운트 옵션:"
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
    echo -e ", 공통 최적화 적용:"
    
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

# 성능 테스트
run_performance_test() {
    local test_dir=${1:-"/tmp"}
    
    log_info "I/O 성능 테스트: $test_dir"
    
    # dd를 이용한 기본 테스트
    echo "순차 쓰기 테스트 (1GB):"
    sync && echo 3 > /proc/sys/vm/drop_caches  # 캐시 클리어
    dd if=/dev/zero of="$test_dir/testfile" bs=1M count=1024 conv=fdatasync 2>&1 | \
        grep -E "(copied|MB/s)"
    
    echo -e ", 순차 읽기 테스트:"
    sync && echo 3 > /proc/sys/vm/drop_caches
    dd if="$test_dir/testfile" of=/dev/null bs=1M 2>&1 | \
        grep -E "(copied|MB/s)"
    
    # 랜덤 I/O 테스트 (fio가 있으면)
    if command -v fio >/dev/null 2>&1; then
        echo -e ", 랜덤 I/O 테스트 (fio):"
        fio --name=random-rw --ioengine=libaio --iodepth=16 --rw=randrw \
            --rwmixread=70 --bs=4k --direct=1 --size=100M --numjobs=1 \
            --filename="$test_dir/fiotest" --time_based --runtime=30 \
            --group_reporting 2>/dev/null || echo "fio 테스트 실패"
    else
        log_warn "fio 미설치 - 고급 I/O 테스트 불가"
    fi
    
    # 정리
    rm -f "$test_dir/testfile" "$test_dir/fiotest"
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
        "test")
            local test_dir=${2:-"/tmp"}
            run_performance_test "$test_dir"
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
            echo "  $0 test [directory]               # 성능 테스트"
            echo ""
            echo "예시:"
            echo "  $0 check                          # 설정 확인"
            echo "  $0 optimize sda                   # /dev/sda 최적화"
            echo "  $0 database mysql                 # MySQL용 최적화"
            echo "  $0 test /var/lib/mysql            # MySQL 데이터 디렉토리 테스트"
            ;;
    esac
}

# 스크립트 실행
main "$@"
```text

이제 계속해서 다음 문서들을 작성하겠습니다. 다음은 파일시스템 디버깅에 관한 문서를 만들어보겠습니다.
