---
tags:
  - IO
  - Performance
  - Disk
  - Monitoring
  - Direct-IO
  - Memory-Mapping
---

# 11.4d 디스크 I/O 및 모니터링

## 디스크 I/O 최적화의 완성판

디스크 I/O 성능을 극대화하려면 파일 시스템 레벨의 최적화와 실시간 모니터링이 필요합니다. Direct I/O, 메모리 매핑, 그리고 체계적인 모니터링을 통해 디스크 성능의 한계를 뛰어넘을 수 있습니다.

## 파일 시스템 최적화

### 마운트 옵션과 I/O 스케줄러 튜닝

```bash
#!/bin/bash
# filesystem_optimization.sh - 파일 시스템 최적화

echo "=== 파일 시스템 성능 최적화 ==="

# 1. 마운트 옵션 최적화
echo "1. 추천 마운트 옵션:"
echo "   - noatime: 접근 시간 업데이트 비활성화"
echo "   - barrier=0: 쓰기 배리어 비활성화 (위험하지만 빠름)"
echo "   - data=writeback: 저널링 모드 변경"

# 현재 마운트 옵션 확인
echo "현재 마운트 상태:"
mount | grep -E "ext[34]|xfs|btrfs"

# 2. 파일 시스템별 최적화
echo -e "\n2. 파일 시스템별 최적화:"

# ext4 최적화
echo "ext4 최적화:"
echo "  sudo tune2fs -o journal_data_writeback /dev/sdX"
echo "  sudo mount -o remount,noatime,barrier=0,data=writeback /"

# XFS 최적화  
echo "XFS 최적화:"
echo "  sudo mount -o remount,noatime,nobarrier,logbufs=8,logbsize=256k /"

# 3. I/O 스케줄러 최적화
echo -e "\n3. I/O 스케줄러 확인 및 변경:"
for disk in $(lsblk -d -n -o NAME | grep -v loop 2>/dev/null || echo "sda"); do
    if [ -f "/sys/block/$disk/queue/scheduler" ]; then
        scheduler=$(cat /sys/block/$disk/queue/scheduler)
        echo "$disk: $scheduler"
        
        # SSD의 경우 noop 또는 deadline 권장
        # HDD의 경우 cfq 권장
        echo "SSD라면: echo noop > /sys/block/$disk/queue/scheduler"
        echo "HDD라면: echo cfq > /sys/block/$disk/queue/scheduler"
    fi
done

# 4. 파일 시스템 캐시 조정
echo -e "\n4. 시스템 캐시 설정:"
echo "현재 설정:"
if [ -f "/proc/sys/vm/dirty_ratio" ]; then
    echo "dirty_ratio: $(cat /proc/sys/vm/dirty_ratio)"
    echo "dirty_background_ratio: $(cat /proc/sys/vm/dirty_background_ratio)"
    echo "dirty_writeback_centisecs: $(cat /proc/sys/vm/dirty_writeback_centisecs)"
fi

echo "성능 최적화 설정:"
echo "echo 40 > /proc/sys/vm/dirty_ratio"          # 더 많은 더티 페이지 허용
echo "echo 10 > /proc/sys/vm/dirty_background_ratio"
echo "echo 500 > /proc/sys/vm/dirty_writeback_centisecs"  # 더 자주 플러시

# 5. 대용량 파일 처리를 위한 readahead 조정
echo -e "\n5. readahead 설정:"
for disk in $(lsblk -d -n -o NAME | grep -v loop 2>/dev/null || echo "sda"); do
    if [ -f "/sys/block/$disk/queue/read_ahead_kb" ]; then
        current_readahead=$(cat /sys/block/$disk/queue/read_ahead_kb)
        echo "/dev/$disk 현재 readahead: ${current_readahead}KB"
        echo "대용량 순차 읽기 최적화: echo 4096 > /sys/block/$disk/queue/read_ahead_kb"
    fi
done

# 6. 파일 시스템 성능 벤치마크
echo -e "\n6. 성능 벤치마크 (옵션):"
echo "순차 쓰기 테스트: dd if=/dev/zero of=test bs=1M count=1024 oflag=direct"
echo "순차 읽기 테스트: dd if=test of=/dev/null bs=1M count=1024 iflag=direct"
echo "랜덤 I/O 테스트: fio --name=random --ioengine=libaio --rw=randrw --bs=4k --numjobs=4 --size=1G --runtime=30"
```

### Direct I/O와 메모리 매핑

```c
// high_performance_io.c - 고성능 파일 I/O
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <errno.h>
#include <time.h>

// 메모리 매핑을 이용한 파일 처리
void* mmap_file_read(const char* filename, size_t* file_size) {
    int fd = open(filename, O_RDONLY);
    if (fd == -1) {
        perror("파일 열기 실패");
        return NULL;
    }
    
    struct stat st;
    if (fstat(fd, &st) == -1) {
        perror("fstat 실패");
        close(fd);
        return NULL;
    }
    
    *file_size = st.st_size;
    
    // 파일을 메모리에 매핑
    void* mapped = mmap(NULL, *file_size, PROT_READ, MAP_PRIVATE, fd, 0);
    close(fd);
    
    if (mapped == MAP_FAILED) {
        perror("mmap 실패");
        return NULL;
    }
    
    // 순차 접근 힌트 제공
    if (madvise(mapped, *file_size, MADV_SEQUENTIAL) == -1) {
        perror("madvise 실패");
    }
    
    printf("메모리 맵 성공: %zu bytes\n", *file_size);
    return mapped;
}

// Direct I/O를 이용한 버퍼 캐시 우회
void direct_io_example(const char* filename) {
    // O_DIRECT 플래그로 버퍼 캐시 우회
    int fd = open(filename, O_RDONLY | O_DIRECT);
    if (fd == -1) {
        perror("Direct I/O 파일 열기 실패");
        return;
    }
    
    // Direct I/O는 정렬된 메모리 버퍼 필요
    void* buffer;
    size_t buffer_size = 65536;  // 64KB (4KB 정렬)
    
    if (posix_memalign(&buffer, 4096, buffer_size) != 0) {
        perror("정렬된 메모리 할당 실패");
        close(fd);
        return;
    }
    
    printf("Direct I/O 읽기 시작 (버퍼 크기: %zu bytes)\n", buffer_size);
    
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    
    ssize_t total_read = 0;
    ssize_t bytes_read;
    int read_count = 0;
    
    while ((bytes_read = read(fd, buffer, buffer_size)) > 0) {
        total_read += bytes_read;
        read_count++;
        
        // 진행률 표시 (1MB마다)
        if (read_count % 16 == 0) {  // 64KB * 16 = 1MB
            printf("읽기 진행: %zd MB\r", total_read / 1024 / 1024);
            fflush(stdout);
        }
        
        // 실제로는 여기서 데이터 처리
        // process_data(buffer, bytes_read);
    }
    
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_nsec - start.tv_nsec) / 1e9;
    
    printf("\nDirect I/O 완료: %zd bytes, %.2f초\n", total_read, elapsed);
    printf("처리량: %.2f MB/s\n", 
           (total_read / 1024.0 / 1024.0) / elapsed);
    printf("시스템 콜 횟수: %d\n", read_count);
    
    free(buffer);
    close(fd);
}

// 스트리밍 vs 메모리 맵 성능 비교
void compare_access_patterns(const char* filename) {
    printf("=== 접근 패턴별 성능 비교 ===\n");
    
    // 1. 순차 스트리밍 읽기
    printf("1. 순차 스트리밍 읽기:\n");
    
    int fd = open(filename, O_RDONLY);
    if (fd >= 0) {
        char buffer[65536];
        struct timespec start, end;
        clock_gettime(CLOCK_MONOTONIC, &start);
        
        ssize_t total = 0;
        ssize_t bytes;
        while ((bytes = read(fd, buffer, sizeof(buffer))) > 0) {
            total += bytes;
        }
        
        clock_gettime(CLOCK_MONOTONIC, &end);
        double elapsed = (end.tv_sec - start.tv_sec) + 
                        (end.tv_nsec - start.tv_nsec) / 1e9;
        
        printf("  스트리밍: %.2f초, %.2f MB/s\n", 
               elapsed, (total / 1024.0 / 1024.0) / elapsed);
        close(fd);
    }
    
    // 2. 메모리 맵 순차 읽기
    printf("2. 메모리 맵 순차 읽기:\n");
    
    size_t file_size;
    void* mapped = mmap_file_read(filename, &file_size);
    if (mapped) {
        struct timespec start, end;
        clock_gettime(CLOCK_MONOTONIC, &start);
        
        // 메모리 맵 데이터 순차 접근
        volatile char* ptr = (char*)mapped;
        size_t checksum = 0;
        for (size_t i = 0; i < file_size; i += 4096) {  // 페이지 단위 접근
            checksum += ptr[i];
        }
        
        clock_gettime(CLOCK_MONOTONIC, &end);
        double elapsed = (end.tv_sec - start.tv_sec) + 
                        (end.tv_nsec - start.tv_nsec) / 1e9;
        
        printf("  메모리 맵: %.2f초, %.2f MB/s (체크섬: %zu)\n", 
               elapsed, (file_size / 1024.0 / 1024.0) / elapsed, checksum);
        
        munmap(mapped, file_size);
    }
    
    // 3. 랜덤 접근 비교
    printf("3. 랜덤 접근 비교:\n");
    
    // 스트리밍 랜덤 접근
    fd = open(filename, O_RDONLY);
    if (fd >= 0) {
        struct stat st;
        fstat(fd, &st);
        size_t file_size = st.st_size;
        
        char buffer[4096];
        struct timespec start, end;
        clock_gettime(CLOCK_MONOTONIC, &start);
        
        srand(time(NULL));
        for (int i = 0; i < 1000; i++) {  // 1000번 랜덤 읽기
            off_t offset = (rand() % (file_size / 4096)) * 4096;
            if (pread(fd, buffer, 4096, offset) < 0) {
                perror("pread 실패");
                break;
            }
        }
        
        clock_gettime(CLOCK_MONOTONIC, &end);
        double elapsed = (end.tv_sec - start.tv_sec) + 
                        (end.tv_nsec - start.tv_nsec) / 1e9;
        
        printf("  스트리밍 랜덤: %.2f초, %.1f IOPS\n", 
               elapsed, 1000.0 / elapsed);
        close(fd);
    }
    
    // 메모리 맵 랜덤 접근
    mapped = mmap_file_read(filename, &file_size);
    if (mapped) {
        struct timespec start, end;
        clock_gettime(CLOCK_MONOTONIC, &start);
        
        volatile char* ptr = (char*)mapped;
        size_t checksum = 0;
        srand(time(NULL));
        
        for (int i = 0; i < 1000; i++) {  // 1000번 랜덤 읽기
            size_t offset = (rand() % (file_size / 4096)) * 4096;
            checksum += ptr[offset];
        }
        
        clock_gettime(CLOCK_MONOTONIC, &end);
        double elapsed = (end.tv_sec - start.tv_sec) + 
                        (end.tv_nsec - start.tv_nsec) / 1e9;
        
        printf("  메모리 맵 랜덤: %.2f초, %.1f IOPS (체크섬: %zu)\n", 
               elapsed, 1000.0 / elapsed, checksum);
        
        munmap(mapped, file_size);
    }
}

// 대용량 파일 스트리밍 처리
typedef struct {
    int fd;
    char* buffer;
    size_t buffer_size;
    size_t buffer_pos;
    size_t buffer_end;
    off_t file_pos;
    size_t total_read;
} StreamReader;

StreamReader* stream_reader_create(const char* filename, size_t buffer_size) {
    StreamReader* reader = malloc(sizeof(StreamReader));
    if (!reader) return NULL;
    
    reader->fd = open(filename, O_RDONLY);
    if (reader->fd == -1) {
        free(reader);
        return NULL;
    }
    
    reader->buffer = malloc(buffer_size);
    if (!reader->buffer) {
        close(reader->fd);
        free(reader);
        return NULL;
    }
    
    reader->buffer_size = buffer_size;
    reader->buffer_pos = 0;
    reader->buffer_end = 0;
    reader->file_pos = 0;
    reader->total_read = 0;
    
    printf("스트림 리더 생성: 버퍼 크기 %zu bytes\n", buffer_size);
    return reader;
}

int stream_reader_read_line(StreamReader* reader, char* line, size_t max_len) {
    size_t line_pos = 0;
    
    while (line_pos < max_len - 1) {
        // 버퍼가 비어있으면 새로 읽기
        if (reader->buffer_pos >= reader->buffer_end) {
            ssize_t bytes_read = read(reader->fd, reader->buffer, reader->buffer_size);
            if (bytes_read <= 0) {
                break;  // EOF 또는 에러
            }
            
            reader->buffer_pos = 0;
            reader->buffer_end = bytes_read;
            reader->file_pos += bytes_read;
            reader->total_read += bytes_read;
        }
        
        char c = reader->buffer[reader->buffer_pos++];
        
        if (c == '\n') {
            break;
        }
        
        line[line_pos++] = c;
    }
    
    line[line_pos] = '\0';
    return line_pos;
}

void stream_reader_destroy(StreamReader* reader) {
    if (reader) {
        printf("스트림 리더 해제: 총 %zu bytes 읽음\n", reader->total_read);
        close(reader->fd);
        free(reader->buffer);
        free(reader);
    }
}

// 대용량 텍스트 파일 처리 예제
void process_large_text_file(const char* filename) {
    StreamReader* reader = stream_reader_create(filename, 1024 * 1024);  // 1MB 버퍼
    if (!reader) {
        printf("스트림 리더 생성 실패\n");
        return;
    }
    
    char line[4096];
    int line_count = 0;
    int word_count = 0;
    
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    
    while (stream_reader_read_line(reader, line, sizeof(line)) > 0) {
        line_count++;
        
        // 단어 개수 세기 (간단한 예제)
        char* token = strtok(line, " \t\r\n");
        while (token != NULL) {
            word_count++;
            token = strtok(NULL, " \t\r\n");
        }
        
        if (line_count % 100000 == 0) {
            printf("처리된 라인: %d, 단어: %d\r", line_count, word_count);
            fflush(stdout);
        }
    }
    
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_nsec - start.tv_nsec) / 1e9;
    
    printf("\n총 %d 라인, %d 단어 처리 완료: %.2f초\n", 
           line_count, word_count, elapsed);
    printf("처리 속도: %.0f 라인/초, %.0f 단어/초\n", 
           line_count / elapsed, word_count / elapsed);
    
    stream_reader_destroy(reader);
}

int main(int argc, char* argv[]) {
    const char* test_file = (argc > 1) ? argv[1] : "test_file.bin";
    
    // 테스트 파일이 없으면 생성
    struct stat st;
    if (stat(test_file, &st) == -1) {
        printf("테스트 파일 생성 중...\n");
        int fd = open(test_file, O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (fd >= 0) {
            char buffer[1024];
            memset(buffer, 'A', sizeof(buffer));
            
            // 10MB 파일 생성
            for (int i = 0; i < 10240; i++) {
                write(fd, buffer, sizeof(buffer));
            }
            close(fd);
            printf("10MB 테스트 파일 생성 완료\n");
        }
    }
    
    // 각 기능 테스트
    printf("\n=== Direct I/O 테스트 ===\n");
    direct_io_example(test_file);
    
    printf("\n=== 접근 패턴 비교 ===\n");
    compare_access_patterns(test_file);
    
    // 텍스트 파일 처리 테스트
    const char* text_file = "large_text.txt";
    if (stat(text_file, &st) == 0) {
        printf("\n=== 대용량 텍스트 처리 ===\n");
        process_large_text_file(text_file);
    }
    
    return 0;
}
```

## 실시간 I/O 모니터링

### 종합 모니터링 시스템

```bash
#!/bin/bash
# io_monitoring.sh - I/O 성능 모니터링

echo "=== I/O 성능 실시간 모니터링 ==="

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 시스템 정보 수집
echo -e "${BLUE}=== 시스템 정보 ===${NC}"
echo "날짜: $(date)"
echo "가동 시간: $(uptime)"
echo "커널: $(uname -r)"

# 2. 디스크 사용률 체크
echo -e "\n${BLUE}=== 디스크 사용률 ===${NC}"
df -h | grep -E "^/dev" | while read filesystem size used available percent mountpoint; do
    usage_num=$(echo $percent | sed 's/%//')
    if [ "$usage_num" -gt 90 ]; then
        echo -e "${RED}⚠️  $filesystem: $percent 사용 (위험)${NC}"
    elif [ "$usage_num" -gt 80 ]; then
        echo -e "${YELLOW}🟡 $filesystem: $percent 사용 (주의)${NC}"
    else
        echo -e "${GREEN}✅ $filesystem: $percent 사용 (양호)${NC}"
    fi
done

# 3. iostat으로 전체 디스크 I/O 상태 (5초 평균)
echo -e "\n${BLUE}=== 디스크 I/O 통계 (5초 평균) ===${NC}"
if command -v iostat &> /dev/null; then
    iostat -x 1 5 | tail -n +4 | grep -E "^[sv]d"
else
    echo "iostat이 설치되지 않음 (sudo apt install sysstat)"
fi

# 4. iotop으로 프로세스별 I/O 사용량
echo -e "\n${BLUE}=== 프로세스별 I/O 사용량 (상위 10개) ===${NC}"
if command -v iotop &> /dev/null; then
    iotop -a -o -n 1 | head -20
else
    echo "iotop이 설치되지 않음 (sudo apt install iotop)"
    # 대안: /proc/*/io 활용
    echo "대안: 프로세스별 I/O 통계"
    ps aux --sort=-%cpu | head -10 | while read line; do
        pid=$(echo $line | awk '{print $2}')
        if [ "$pid" != "PID" ] && [ -r "/proc/$pid/io" ] 2>/dev/null; then
            echo "PID $pid: $(echo $line | awk '{print $11}')"
            cat "/proc/$pid/io" 2>/dev/null | head -4 | sed 's/^/  /'
        fi
    done
fi

# 5. 각 디스크별 상세 상태
echo -e "\n${BLUE}=== 디스크별 상세 상태 ===${NC}"
for disk in $(lsblk -d -n -o NAME 2>/dev/null | grep -v loop | head -5); do
    echo -e "\n${YELLOW}=== /dev/$disk ===${NC}"
    
    if [ -d "/sys/block/$disk" ]; then
        # 큐 깊이 확인
        if [ -f "/sys/block/$disk/queue/nr_requests" ]; then
            queue_depth=$(cat /sys/block/$disk/queue/nr_requests 2>/dev/null || echo "N/A")
            echo "큐 깊이: $queue_depth"
        fi
        
        # 스케줄러 확인
        if [ -f "/sys/block/$disk/queue/scheduler" ]; then
            scheduler=$(cat /sys/block/$disk/queue/scheduler 2>/dev/null || echo "N/A")
            echo "I/O 스케줄러: $scheduler"
        fi
        
        # readahead 설정
        if [ -f "/sys/block/$disk/queue/read_ahead_kb" ]; then
            readahead=$(cat /sys/block/$disk/queue/read_ahead_kb 2>/dev/null || echo "N/A")
            echo "Read-ahead: ${readahead}KB"
        fi
        
        # I/O 통계
        if [ -f "/sys/block/$disk/stat" ]; then
            echo "I/O 통계:"
            read -r reads reads_merged sectors_read read_time \
                    writes writes_merged sectors_written write_time \
                    io_in_progress total_time weighted_time < "/sys/block/$disk/stat" 2>/dev/null
            
            if [ -n "$reads" ]; then
                echo "  읽기: $reads 회, $(($sectors_read * 512 / 1024 / 1024))MB, ${read_time}ms"
                echo "  쓰기: $writes 회, $(($sectors_written * 512 / 1024 / 1024))MB, ${write_time}ms"
                echo "  진행 중인 I/O: $io_in_progress"
                echo "  총 I/O 시간: ${total_time}ms"
            fi
        fi
    fi
done

# 6. 파일 시스템 캐시 상태
echo -e "\n${BLUE}=== 파일 시스템 캐시 상태 ===${NC}"
echo "메모리 사용량:"
free -h | head -2

echo -e "\n캐시 상세 정보:"
if [ -f "/proc/meminfo" ]; then
    grep -E "Cached|Buffers|Dirty|Writeback" /proc/meminfo | while read line; do
        key=$(echo $line | awk '{print $1}')
        value=$(echo $line | awk '{print $2}')
        unit=$(echo $line | awk '{print $3}')
        
        # MB로 변환
        mb_value=$((value / 1024))
        
        case $key in
            "Cached:")
                echo "  페이지 캐시: ${mb_value}MB"
                ;;
            "Buffers:")
                echo "  버퍼 캐시: ${mb_value}MB"
                ;;
            "Dirty:")
                echo "  더티 페이지: ${mb_value}MB"
                if [ $mb_value -gt 100 ]; then
                    echo -e "    ${YELLOW}⚠️  더티 페이지가 많음 (디스크 쓰기 지연 가능)${NC}"
                fi
                ;;
            "Writeback:")
                echo "  쓰기 중인 페이지: ${mb_value}MB"
                ;;
        esac
    done
fi

# 7. I/O 압박 상황 확인
echo -e "\n${BLUE}=== I/O 대기 및 압박 상태 ===${NC}"
if command -v vmstat &> /dev/null; then
    vmstat 1 3 | tail -1 | while read r b swpd free buff cache si so bi bo in cs us sy id wa st; do
        echo "I/O 대기: ${wa}%"
        echo "시스템: ${sy}%"
        echo "사용자: ${us}%"
        echo "유휴: ${id}%"
        
        if [ "$wa" -gt 20 ]; then
            echo -e "${RED}⚠️  I/O 대기 시간이 높음 (${wa}%) - I/O 병목 가능성${NC}"
        elif [ "$wa" -gt 10 ]; then
            echo -e "${YELLOW}🟡 I/O 대기 시간 주의 (${wa}%)${NC}"
        else
            echo -e "${GREEN}✅ I/O 대기 시간 양호 (${wa}%)${NC}"
        fi
        
        echo "블록 입력: ${bi} blocks/s"
        echo "블록 출력: ${bo} blocks/s"
    done
fi

# 8. 파일 디스크립터 사용량
echo -e "\n${BLUE}=== 파일 디스크립터 사용량 ===${NC}"
if [ -f "/proc/sys/fs/file-nr" ]; then
    read allocated free max < /proc/sys/fs/file-nr
    echo "할당된 fd: $allocated"
    echo "여유 fd: $free"
    echo "최대 fd: $max"
    
    usage_percent=$((allocated * 100 / max))
    if [ $usage_percent -gt 80 ]; then
        echo -e "${RED}⚠️  파일 디스크립터 사용률 높음 (${usage_percent}%)${NC}"
    elif [ $usage_percent -gt 60 ]; then
        echo -e "${YELLOW}🟡 파일 디스크립터 사용률 주의 (${usage_percent}%)${NC}"
    else
        echo -e "${GREEN}✅ 파일 디스크립터 사용률 양호 (${usage_percent}%)${NC}"
    fi
fi

# 9. 네트워크 I/O 상태
echo -e "\n${BLUE}=== 네트워크 I/O 상태 ===${NC}"
if command -v ss &> /dev/null; then
    echo "소켓 통계:"
    ss -s
else
    echo "netstat 통계:"
    netstat -s | grep -E "packets|segments|connections"
fi

echo -e "\n인터페이스별 통계:"
if [ -f "/proc/net/dev" ]; then
    cat /proc/net/dev | tail -n +3 | while read iface stats; do
        iface_clean=$(echo $iface | sed 's/://')
        if [ "$iface_clean" != "lo" ]; then
            rx_bytes=$(echo $stats | awk '{print $1}')
            tx_bytes=$(echo $stats | awk '{print $9}')
            rx_mb=$((rx_bytes / 1024 / 1024))
            tx_mb=$((tx_bytes / 1024 / 1024))
            echo "  $iface_clean: RX ${rx_mb}MB, TX ${tx_mb}MB"
        fi
    done
fi

# 10. 최종 I/O 병목 진단
echo -e "\n${BLUE}=== I/O 병목 종합 진단 ===${NC}"

# 평균 디스크 사용률 계산
if command -v iostat &> /dev/null; then
    avg_util=$(iostat -x 1 2 | awk '/^[sv]d/ && NF>=10 {sum+=$10; count++} END {if(count>0) print sum/count; else print 0}')
    
    if [ -n "$avg_util" ]; then
        echo "평균 디스크 사용률: $(printf "%.1f" $avg_util)%"
        
        # bc가 없을 경우를 대비한 정수 비교
        avg_util_int=$(printf "%.0f" $avg_util)
        
        if [ $avg_util_int -gt 90 ]; then
            echo -e "${RED}🚨 디스크 I/O 심각한 병목 발생${NC}"
            echo "권장사항:"
            echo "  - 즉시 I/O 최적화 필요"
            echo "  - 더 빠른 스토리지(NVMe SSD) 고려"
            echo "  - 애플리케이션 레벨 최적화 검토"
        elif [ $avg_util_int -gt 80 ]; then
            echo -e "${YELLOW}⚠️  디스크 I/O 병목 주의 필요${NC}"
            echo "권장사항:"
            echo "  - 비동기 I/O 사용 검토"
            echo "  - I/O 패턴 최적화 (순차 vs 랜덤)"
            echo "  - 캐시 히트율 개선"
        else
            echo -e "${GREEN}✅ 디스크 I/O 상태 양호${NC}"
            echo "현재 I/O 성능이 정상 범위 내에 있습니다."
        fi
    fi
fi

echo -e "\n${BLUE}=== 모니터링 완료 ===${NC}"
echo "모니터링 시점: $(date)"
echo "이 스크립트를 주기적으로 실행하여 I/O 성능을 추적하세요."
```

### I/O 성능 벤치마킹

```bash
#!/bin/bash
# io_benchmark.sh - I/O 성능 벤치마크

echo "=== I/O 성능 벤치마크 ==="

# 설정
TEST_DIR="/tmp/io_benchmark"
TEST_SIZE="1G"
BLOCK_SIZE="64k"

# 임시 디렉토리 생성
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "테스트 디렉토리: $TEST_DIR"
echo "테스트 크기: $TEST_SIZE"
echo "블록 크기: $BLOCK_SIZE"
echo ""

# 1. 순차 쓰기 테스트
echo "=== 1. 순차 쓰기 성능 ==="
echo "일반 쓰기:"
time dd if=/dev/zero of=test_write bs=$BLOCK_SIZE count=16384 2>&1 | tail -3

echo -e "\nDirect I/O 쓰기:"
time dd if=/dev/zero of=test_write_direct bs=$BLOCK_SIZE count=16384 oflag=direct 2>&1 | tail -3

echo -e "\nSync 쓰기:"
time dd if=/dev/zero of=test_write_sync bs=$BLOCK_SIZE count=16384 oflag=sync 2>&1 | tail -3

# 2. 순차 읽기 테스트
echo -e "\n=== 2. 순차 읽기 성능 ==="

# 캐시 지우기
echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null 2>&1

echo "일반 읽기:"
time dd if=test_write of=/dev/null bs=$BLOCK_SIZE 2>&1 | tail -3

echo -e "\nDirect I/O 읽기:"
time dd if=test_write_direct of=/dev/null bs=$BLOCK_SIZE iflag=direct 2>&1 | tail -3

# 3. fio를 이용한 상세 벤치마크
if command -v fio &> /dev/null; then
    echo -e "\n=== 3. fio 상세 벤치마크 ==="
    
    # 순차 읽기/쓰기
    echo "순차 읽기/쓰기 (4스레드):"
    fio --name=seqrw --ioengine=libaio --rw=rw --bs=64k --numjobs=4 --size=256M --runtime=30 --group_reporting --time_based

    # 랜덤 읽기/쓰기
    echo -e "\n랜덤 읽기/쓰기 (4KB):"
    fio --name=randrw --ioengine=libaio --rw=randrw --bs=4k --numjobs=4 --size=256M --runtime=30 --group_reporting --time_based

    # IOPS 테스트
    echo -e "\n랜덤 읽기 IOPS:"
    fio --name=randread --ioengine=libaio --rw=randread --bs=4k --numjobs=8 --size=256M --runtime=30 --group_reporting --time_based
else
    echo -e "\n=== 3. fio 미설치 ==="
    echo "더 정확한 벤치마크를 위해 fio 설치 권장:"
    echo "sudo apt install fio  # Ubuntu/Debian"
    echo "sudo yum install fio  # CentOS/RHEL"
fi

# 4. 파일 시스템별 성능 비교
echo -e "\n=== 4. 다양한 I/O 패턴 테스트 ==="

# 작은 파일 많이 생성
echo "작은 파일 대량 생성 (10,000개):"
time (
    for i in {1..10000}; do
        echo "test data $i" > "small_file_$i.txt"
    done
) 2>&1 | grep real

# 파일 삭제
echo -e "\n작은 파일 대량 삭제:"
time rm -f small_file_*.txt 2>&1 | grep real

# 메타데이터 연산 테스트
echo -e "\n메타데이터 연산 (stat 10,000회):"
touch test_stat_file
time (
    for i in {1..10000}; do
        stat test_stat_file > /dev/null
    done
) 2>&1 | grep real

# 5. 메모리 매핑 성능
echo -e "\n=== 5. 메모리 매핑 성능 ==="
if [ -f "../04d-disk-io-monitoring.md" ]; then
    echo "C 프로그램 컴파일 및 실행:"
    gcc -o io_test ../high_performance_io.c -O2 2>/dev/null
    if [ $? -eq 0 ]; then
        ./io_test test_write
    else
        echo "C 컴파일러가 없거나 컴파일 실패"
    fi
fi

# 6. 시스템 정보 수집
echo -e "\n=== 6. 시스템 정보 ==="
echo "파일 시스템:"
df -T "$TEST_DIR"

echo -e "\n디스크 정보:"
lsblk | grep -v loop

echo -e "\n메모리 정보:"
free -h

echo -e "\nCPU 정보:"
grep "model name" /proc/cpuinfo | head -1

# 7. 결과 요약
echo -e "\n=== 성능 벤치마크 완료 ==="
echo "테스트 일시: $(date)"
echo "테스트 위치: $TEST_DIR"

# 임시 파일 정리 (옵션)
read -p "테스트 파일을 삭제하시겠습니까? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$TEST_DIR"
    echo "테스트 파일 삭제 완료"
else
    echo "테스트 파일 유지: $TEST_DIR"
fi
```

## 핵심 요점

### 1. 파일 시스템 튜닝의 중요성

마운트 옵션, I/O 스케줄러, readahead 설정 등을 통해 워크로드에 최적화된 파일 시스템을 구성할 수 있습니다.

### 2. Direct I/O vs 메모리 맵

Direct I/O는 캐시를 우회하여 예측 가능한 성능을 제공하고, 메모리 맵은 OS의 가상 메모리 시스템을 활용합니다.

### 3. 실시간 모니터링의 필요성

iostat, iotop, vmstat 등을 통해 I/O 성능을 지속적으로 모니터링하고 병목 지점을 조기에 발견해야 합니다.

### 4. 성능 벤치마킹

다양한 I/O 패턴(순차/랜덤, 읽기/쓰기)에 대한 벤치마킹을 통해 시스템의 성능 특성을 파악할 수 있습니다.

---

**이전**: [네트워크 I/O 최적화](04c-network-io-optimization.md)  
**다음**: [I/O 성능 최적화 개요](04-io-optimization.md)로 돌아가서 전체 내용을 복습하세요.
