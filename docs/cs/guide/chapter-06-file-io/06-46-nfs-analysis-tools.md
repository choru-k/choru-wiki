---
tags:
  - C_programming
  - NFS
  - deep-study
  - hands-on
  - intermediate
  - network_latency
  - performance_analysis
  - system_programming
  - 인프라스트럭처
difficulty: INTERMEDIATE
learning_time: "6-8시간"
main_topic: "인프라스트럭처"
priority_score: 3
---

# Chapter.06.07A NFS 성능 분석 도구

## 실무 환경에서 정확한 성능 진단의 핵심

NFS 성능 최적화의 첫 번째 단계는 정확한 현황 파악입니다. 이 문서에서는 C 언어로 구현된 종합적인 NFS 성능 분석 도구를 통해 네트워크 지연시간, I/O 처리량, 메타데이터 성능을 체계적으로 측정하고 분석하는 방법을 다룹니다.

## NFS 성능 분석기

NFS 성능을 종합적으로 분석하는 도구입니다.

```c
// nfs_performance_analyzer.c
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <sys/mount.h>
#include <errno.h>
#include <time.h>
#include <dirent.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

typedef struct {
    char server[256];
    char export_path[512];
    char mount_point[512];
    char version[16];
    char protocol[16];
    char options[1024];
    double rtt_min, rtt_avg, rtt_max;
    int is_mounted;
} nfs_mount_info_t;

typedef struct {
    double read_latency;
    double write_latency;
    double metadata_latency;
    double read_throughput;
    double write_throughput;
    int small_file_ops_per_sec;
    int large_file_ops_per_sec;
} nfs_performance_t;

typedef struct {
    unsigned long long ops;
    unsigned long long bytes;
    unsigned long long errors;
    double avg_rtt;
    double avg_exe;
} nfs_stats_t;

// NFS 마운트 정보 파싱
int parse_nfs_mounts(nfs_mount_info_t* mounts, int max_count) {
    FILE* fp = fopen("/proc/mounts", "r");
    if (!fp) return -1;

    char line[2048];
    int count = 0;

    while (fgets(line, sizeof(line), fp) && count < max_count) {
        char device[512], mount_point[512], fs_type[64], options[1024];

        if (sscanf(line, "%s %s %s %s", device, mount_point, fs_type, options) == 4) {
            if (strncmp(fs_type, "nfs", 3) == 0) {
                // NFS 마운트 정보 파싱
                char* colon = strchr(device, ':');
                if (colon) {
                    *colon = '\0';
                    strcpy(mounts[count].server, device);
                    strcpy(mounts[count].export_path, colon + 1);
                    strcpy(mounts[count].mount_point, mount_point);
                    strcpy(mounts[count].options, options);
                    strcpy(mounts[count].version, fs_type);

                    // 프로토콜 확인 (TCP/UDP)
                    if (strstr(options, "proto=udp")) {
                        strcpy(mounts[count].protocol, "UDP");
                    } else {
                        strcpy(mounts[count].protocol, "TCP");
                    }

                    mounts[count].is_mounted = 1;
                    count++;
                }
            }
        }
    }

    fclose(fp);
    return count;
}

// NFS 서버 네트워크 지연시간 측정
void measure_network_latency(const char* server, nfs_mount_info_t* mount_info) {
    printf("=== 네트워크 지연시간 측정: %s ===\n", server);

    char cmd[512];
    snprintf(cmd, sizeof(cmd), "ping -c 10 -q %s 2>/dev/null", server);

    FILE* ping = popen(cmd, "r");
    if (!ping) {
        printf("ping 실행 실패\n");
        return;
    }

    char line[256];
    while (fgets(line, sizeof(line), ping)) {
        if (strstr(line, "min/avg/max")) {
            float min, avg, max;
            if (sscanf(line, "%*s = %f/%f/%f", &min, &avg, &max) == 3) {
                mount_info->rtt_min = min;
                mount_info->rtt_avg = avg;
                mount_info->rtt_max = max;

                printf("RTT: %.1f/%.1f/%.1f ms (min/avg/max)\n", min, avg, max);

                if (avg > 10) {
                    printf("⚠️  높은 네트워크 지연시간이 감지되었습니다.\n");
                } else if (avg > 5) {
                    printf("⚠️  중간 수준의 네트워크 지연시간입니다.\n");
                } else {
                    printf("✅ 네트워크 지연시간이 양호합니다.\n");
                }
            }
            break;
        }
    }

    pclose(ping);
}

// NFS 통계 정보 수집
void collect_nfs_stats(const char* mount_point, nfs_stats_t* read_stats, nfs_stats_t* write_stats) {
    FILE* fp = fopen("/proc/self/mountstats", "r");
    if (!fp) return;

    char line[1024];
    int found_mount = 0;

    while (fgets(line, sizeof(line), fp)) {
        if (strstr(line, mount_point)) {
            found_mount = 1;
            continue;
        }

        if (found_mount) {
            if (strncmp(line, "bytes:", 6) == 0) {
                // 바이트 통계
                unsigned long long read_bytes, write_bytes;
                sscanf(line, "bytes: %llu %llu", &read_bytes, &write_bytes);
                read_stats->bytes = read_bytes;
                write_stats->bytes = write_bytes;

            } else if (strstr(line, "READ")) {
                // READ 작업 통계
                sscanf(line, "%*s %llu %llu %*s %*s %*s %lf %lf",
                       &read_stats->ops, &read_stats->errors,
                       &read_stats->avg_rtt, &read_stats->avg_exe);

            } else if (strstr(line, "WRITE")) {
                // WRITE 작업 통계
                sscanf(line, "%*s %llu %llu %*s %*s %*s %lf %lf",
                       &write_stats->ops, &write_stats->errors,
                       &write_stats->avg_rtt, &write_stats->avg_exe);

            } else if (strncmp(line, "device", 6) == 0) {
                // 다음 마운트 포인트 시작
                break;
            }
        }
    }

    fclose(fp);
}

// I/O 성능 벤치마크
void benchmark_nfs_performance(const char* mount_point, nfs_performance_t* perf) {
    printf("\n=== NFS 성능 벤치마크: %s ===\n", mount_point);

    char test_dir[1024];
    snprintf(test_dir, sizeof(test_dir), "%s/.nfs_benchmark_%d", mount_point, getpid());

    if (mkdir(test_dir, 0755) != 0) {
        perror("테스트 디렉토리 생성 실패");
        return;
    }

    struct timeval start, end;
    double elapsed;

    // 1. 메타데이터 성능 테스트 (1000개 작은 파일 생성/삭제)
    printf("메타데이터 성능 테스트 (1000개 파일)...\n");
    gettimeofday(&start, NULL);

    for (int i = 0; i < 1000; i++) {
        char filename[1024];
        snprintf(filename, sizeof(filename), "%s/small_file_%d", test_dir, i);

        int fd = open(filename, O_CREAT | O_WRONLY, 0644);
        if (fd >= 0) {
            write(fd, "test", 4);
            close(fd);
        }
    }

    gettimeofday(&end, NULL);
    elapsed = (end.tv_sec - start.tv_sec) + (end.tv_usec - start.tv_usec) / 1000000.0;
    perf->small_file_ops_per_sec = 1000 / elapsed;
    perf->metadata_latency = elapsed * 1000 / 1000;  // ms per operation

    printf("메타데이터 성능: %.0f ops/sec, 평균 지연시간: %.2f ms\n",
           perf->small_file_ops_per_sec, perf->metadata_latency);

    // 2. 순차 쓰기 성능 테스트 (10MB 파일)
    printf("순차 쓰기 성능 테스트 (10MB)...\n");
    char large_file[1024];
    snprintf(large_file, sizeof(large_file), "%s/large_write_test", test_dir);

    char* buffer = malloc(1024 * 1024);  // 1MB 버퍼
    memset(buffer, 0xAA, 1024 * 1024);

    gettimeofday(&start, NULL);

    int fd = open(large_file, O_CREAT | O_WRONLY | O_SYNC, 0644);
    if (fd >= 0) {
        for (int i = 0; i < 10; i++) {
            write(fd, buffer, 1024 * 1024);
        }
        close(fd);
    }

    gettimeofday(&end, NULL);
    elapsed = (end.tv_sec - start.tv_sec) + (end.tv_usec - start.tv_usec) / 1000000.0;
    perf->write_throughput = 10.0 / elapsed;  // MB/s
    perf->write_latency = elapsed * 1000;     // ms

    printf("쓰기 성능: %.2f MB/s, 지연시간: %.0f ms\n",
           perf->write_throughput, perf->write_latency);

    // 3. 순차 읽기 성능 테스트
    printf("순차 읽기 성능 테스트 (10MB)...\n");
    gettimeofday(&start, NULL);

    fd = open(large_file, O_RDONLY);
    if (fd >= 0) {
        for (int i = 0; i < 10; i++) {
            read(fd, buffer, 1024 * 1024);
        }
        close(fd);
    }

    gettimeofday(&end, NULL);
    elapsed = (end.tv_sec - start.tv_sec) + (end.tv_usec - start.tv_usec) / 1000000.0;
    perf->read_throughput = 10.0 / elapsed;   // MB/s
    perf->read_latency = elapsed * 1000;      // ms

    printf("읽기 성능: %.2f MB/s, 지연시간: %.0f ms\n",
           perf->read_throughput, perf->read_latency);

    // 4. 랜덤 I/O 성능 테스트
    printf("랜덤 I/O 성능 테스트...\n");
    gettimeofday(&start, NULL);

    fd = open(large_file, O_RDWR);
    if (fd >= 0) {
        srand(time(NULL));
        for (int i = 0; i < 100; i++) {
            off_t offset = (rand() % 10) * 1024 * 1024;
            lseek(fd, offset, SEEK_SET);
            if (i % 2 == 0) {
                read(fd, buffer, 64 * 1024);
            } else {
                write(fd, buffer, 64 * 1024);
            }
        }
        close(fd);
    }

    gettimeofday(&end, NULL);
    elapsed = (end.tv_sec - start.tv_sec) + (end.tv_usec - start.tv_usec) / 1000000.0;
    perf->large_file_ops_per_sec = 100 / elapsed;

    printf("랜덤 I/O 성능: %.0f ops/sec\n", perf->large_file_ops_per_sec);

    // 정리
    char cleanup_cmd[1024];
    snprintf(cleanup_cmd, sizeof(cleanup_cmd), "rm -rf %s", test_dir);
    system(cleanup_cmd);

    free(buffer);
}

// NFS 최적화 권장사항
void suggest_nfs_optimizations(nfs_mount_info_t* mount_info, nfs_performance_t* perf) {
    printf("\n=== NFS 최적화 권장사항 ===\n");

    // 네트워크 지연시간 기반 권장사항
    if (mount_info->rtt_avg > 10) {
        printf("🔧 높은 네트워크 지연시간 최적화:\n");
        printf("   - rsize/wsize 증가: rsize=1048576,wsize=1048576\n");
        printf("   - 읽기 ahead 증가: racache\n");
        printf("   - 비동기 I/O 활성화: async\n");
    }

    // 메타데이터 성능 기반 권장사항
    if (perf->small_file_ops_per_sec < 50) {
        printf("🔧 메타데이터 성능 최적화:\n");
        printf("   - 속성 캐시 시간 증가: ac=60\n");
        printf("   - 디렉토리 캐시 시간 증가: acdirmin=30,acdirmax=60\n");
        printf("   - 파일 캐시 시간 증가: acregmin=30,acregmax=60\n");
    }

    // 처리량 기반 권장사항
    if (perf->read_throughput < 50 || perf->write_throughput < 50) {
        printf("🔧 처리량 최적화:\n");
        printf("   - 대용량 I/O 블록: rsize=1048576,wsize=1048576\n");
        printf("   - TCP 사용: proto=tcp\n");
        printf("   - 다중 연결: nconnect=4\n");
    }

    // 일관성 vs 성능 트레이드오프
    printf("🔧 일관성 vs 성능 옵션:\n");
    printf("   - 엄격한 일관성: sync,cto\n");
    printf("   - 느슨한 일관성 (성능 향상): async,nocto\n");
    printf("   - 읽기 전용: ro,noatime\n");

    // 마운트 옵션 예제
    printf("\n📋 권장 마운트 옵션 예제:\n");

    if (mount_info->rtt_avg < 5 && perf->small_file_ops_per_sec > 100) {
        printf("고성능 LAN 환경:\n");
        printf("   mount -t nfs4 -o rsize=1048576,wsize=1048576,hard,intr,proto=tcp %s:%s %s\n",
               mount_info->server, mount_info->export_path, mount_info->mount_point);
    } else {
        printf("일반적인 환경:\n");
        printf("   mount -t nfs4 -o rsize=262144,wsize=262144,hard,intr,proto=tcp,ac=60 %s:%s %s\n",
               mount_info->server, mount_info->export_path, mount_info->mount_point);
    }

    printf("\nWAN/고지연 환경:\n");
    printf("   mount -t nfs4 -o rsize=1048576,wsize=1048576,hard,intr,proto=tcp,ac=300,async %s:%s %s\n",
           mount_info->server, mount_info->export_path, mount_info->mount_point);
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        printf("사용법: %s <command> [options]\n", argv[0]);
        printf("Commands:\n");
        printf("  scan                    - NFS 마운트 스캔 및 분석\n");
        printf("  benchmark <mount_point> - 성능 벤치마크\n");
        printf("  analyze <mount_point>   - 상세 분석\n");
        return 1;
    }

    const char* command = argv[1];

    if (strcmp(command, "scan") == 0) {
        nfs_mount_info_t mounts[32];
        int count = parse_nfs_mounts(mounts, 32);

        if (count <= 0) {
            printf("NFS 마운트를 찾을 수 없습니다.\n");
            return 1;
        }

        printf("=== NFS 마운트 정보 ===\n");
        printf("%-20s %-30s %-20s %-10s %-10s\n",
               "서버", "내보내기", "마운트포인트", "버전", "프로토콜");
        printf("%-20s %-30s %-20s %-10s %-10s\n",
               "----", "------", "----------", "----", "------");

        for (int i = 0; i < count; i++) {
            printf("%-20s %-30s %-20s %-10s %-10s\n",
                   mounts[i].server, mounts[i].export_path, mounts[i].mount_point,
                   mounts[i].version, mounts[i].protocol);

            // 네트워크 지연시간 측정
            measure_network_latency(mounts[i].server, &mounts[i]);

            // NFS 통계 수집
            nfs_stats_t read_stats = {0}, write_stats = {0};
            collect_nfs_stats(mounts[i].mount_point, &read_stats, &write_stats);

            printf("  읽기: %llu 작업, %llu 바이트, %.1f ms 평균 RTT\n",
                   read_stats.ops, read_stats.bytes, read_stats.avg_rtt);
            printf("  쓰기: %llu 작업, %llu 바이트, %.1f ms 평균 RTT\n",
                   write_stats.ops, write_stats.bytes, write_stats.avg_rtt);

            if (read_stats.errors > 0 || write_stats.errors > 0) {
                printf("  ⚠️ 오류: 읽기 %llu, 쓰기 %llu\n",
                       read_stats.errors, write_stats.errors);
            }
            printf("\n");
        }

    } else if (strcmp(command, "benchmark") == 0 && argc >= 3) {
        const char* mount_point = argv[2];

        nfs_performance_t perf = {0};
        benchmark_nfs_performance(mount_point, &perf);

        // 마운트 정보 찾기
        nfs_mount_info_t mounts[32];
        int count = parse_nfs_mounts(mounts, 32);

        for (int i = 0; i < count; i++) {
            if (strcmp(mounts[i].mount_point, mount_point) == 0) {
                measure_network_latency(mounts[i].server, &mounts[i]);
                suggest_nfs_optimizations(&mounts[i], &perf);
                break;
            }
        }

    } else if (strcmp(command, "analyze") == 0 && argc >= 3) {
        const char* mount_point = argv[2];

        printf("=== NFS 상세 분석: %s ===\n", mount_point);

        // 현재 마운트 옵션 표시
        char cmd[512];
        snprintf(cmd, sizeof(cmd), "mount | grep ' %s '", mount_point);
        printf("현재 마운트 옵션:\n");
        system(cmd);

        // 성능 벤치마크
        nfs_performance_t perf = {0};
        benchmark_nfs_performance(mount_point, &perf);

        // 최적화 권장사항
        nfs_mount_info_t mounts[32];
        int count = parse_nfs_mounts(mounts, 32);

        for (int i = 0; i < count; i++) {
            if (strcmp(mounts[i].mount_point, mount_point) == 0) {
                measure_network_latency(mounts[i].server, &mounts[i]);
                suggest_nfs_optimizations(&mounts[i], &perf);
                break;
            }
        }

    } else {
        printf("알 수 없는 명령어입니다.\n");
        return 1;
    }

    return 0;
}
```

## 컴파일 및 사용 방법

```bash
# 컴파일
gcc -o nfs_analyzer nfs_performance_analyzer.c -lm

# 권한 설정 (ping 명령어 사용을 위해)
sudo setcap cap_net_raw+ep nfs_analyzer

# 사용 예시
./nfs_analyzer scan                          # 모든 NFS 마운트 스캔
./nfs_analyzer benchmark /mnt/nfs            # 특정 마운트포인트 벤치마크
./nfs_analyzer analyze /mnt/nfs              # 상세 분석 및 권장사항
```

## 핵심 요점

### 1. 다층 성능 분석 접근법

- **네트워크 레벨**: RTT 측정을 통한 기본 연결성 확인
- **프로토콜 레벨**: NFS 통계를 통한 작업 단위 성능 분석  
- **애플리케이션 레벨**: 실제 파일 I/O 시나리오별 벤치마킹

### 2. 성능 지표별 임계값 설정

메타데이터 성능 50 ops/sec 미만, 네트워크 지연시간 10ms 초과 등 명확한 기준으로 문제 상황을 판단합니다.

### 3. 환경별 맞춤 권장사항 생성

LAN(< 5ms), WAN(> 10ms), 메타데이터 집약적, 처리량 집약적 등 환경 특성에 따른 구체적인 최적화 옵션을 제시합니다.

---

**이전**: [네트워크 파일시스템 최적화 개요](./06-34-network-filesystem-optimization.md)  
**다음**: [자동 최적화 스크립트](./06-35-auto-optimization-scripts.md)에서 분석 결과를 바탕으로 한 자동 튜닝을 학습합니다.

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

`NFS`, `performance_analysis`, `network_latency`, `C_programming`, `system_programming`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
