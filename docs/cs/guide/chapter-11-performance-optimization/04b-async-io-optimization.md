---
tags:
  - IO
  - Performance
  - Async
  - AIO
  - io_uring
  - Advanced
---

# 11.4b 고급 비동기 I/O 최적화

## 진정한 비동기 I/O로 성능 벽을 뛰어넘기

동기 I/O의 한계를 넘어서기 위해서는 진정한 비동기 I/O 시스템을 활용해야 합니다. Linux AIO와 최신 io_uring은 높은 성능이 요구되는 시스템에서 필수적인 기술입니다.

## Linux AIO (Asynchronous I/O) 활용

Linux AIO는 커널에서 직접 지원하는 진정한 비동기 I/O 인터페이스입니다. 하지만 설정이 복잡하고 Direct I/O를 사용해야 한다는 제약이 있습니다.

```c
// async_io.c - 비동기 I/O 예제
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <libaio.h>  // -laio 링크 필요
#include <sys/time.h>

#define BUFFER_SIZE 65536
#define MAX_EVENTS 32

typedef struct {
    char* buffer;
    int fd;
    off_t offset;
    size_t size;
} AsyncRequest;

// 비동기 파일 읽기
void async_file_read(const char* filename) {
    int fd = open(filename, O_RDONLY | O_DIRECT);  // Direct I/O 사용
    if (fd == -1) {
        perror("파일 열기 실패");
        return;
    }
    
    // AIO 컨텍스트 초기화
    io_context_t ctx = 0;
    if (io_setup(MAX_EVENTS, &ctx) != 0) {
        perror("io_setup 실패");
        close(fd);
        return;
    }
    
    struct stat st;
    fstat(fd, &st);
    size_t file_size = st.st_size;
    
    printf("파일 크기: %zu bytes\n", file_size);
    
    // 여러 비동기 요청 준비
    struct iocb* iocbs[MAX_EVENTS];
    AsyncRequest requests[MAX_EVENTS];
    
    int num_requests = 0;
    off_t offset = 0;
    
    struct timeval start, end;
    gettimeofday(&start, NULL);
    
    // 비동기 읽기 요청 제출
    while (offset < file_size && num_requests < MAX_EVENTS) {
        size_t read_size = (file_size - offset > BUFFER_SIZE) ? 
                          BUFFER_SIZE : (file_size - offset);
        
        // 정렬된 메모리 할당 (Direct I/O 요구사항)
        if (posix_memalign((void**)&requests[num_requests].buffer, 
                          4096, BUFFER_SIZE) != 0) {
            perror("메모리 정렬 실패");
            break;
        }
        
        requests[num_requests].fd = fd;
        requests[num_requests].offset = offset;
        requests[num_requests].size = read_size;
        
        // iocb 구조체 설정
        iocbs[num_requests] = malloc(sizeof(struct iocb));
        io_prep_pread(iocbs[num_requests], 
                     fd, 
                     requests[num_requests].buffer,
                     read_size, 
                     offset);
        
        offset += read_size;
        num_requests++;
    }
    
    printf("비동기 요청 %d개 제출\n", num_requests);
    
    // 모든 요청 제출
    if (io_submit(ctx, num_requests, iocbs) != num_requests) {
        perror("io_submit 실패");
    }
    
    // 완료된 요청들 처리
    struct io_event events[MAX_EVENTS];
    int completed = 0;
    
    while (completed < num_requests) {
        int ret = io_getevents(ctx, 1, MAX_EVENTS, events, NULL);
        if (ret < 0) {
            perror("io_getevents 실패");
            break;
        }
        
        for (int i = 0; i < ret; i++) {
            struct iocb* iocb = (struct iocb*)events[i].obj;
            long res = events[i].res;
            
            if (res < 0) {
                printf("I/O 에러: %s\n", strerror(-res));
            } else {
                printf("완료: %ld bytes 읽음\n", res);
                // 실제로는 여기서 데이터 처리
            }
            completed++;
        }
    }
    
    gettimeofday(&end, NULL);
    
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_usec - start.tv_usec) / 1000000.0;
    
    printf("비동기 I/O 완료 시간: %.2f초\n", elapsed);
    printf("처리량: %.2f MB/s\n", 
           (file_size / 1024.0 / 1024.0) / elapsed);
    
    // 정리
    for (int i = 0; i < num_requests; i++) {
        free(requests[i].buffer);
        free(iocbs[i]);
    }
    
    io_destroy(ctx);
    close(fd);
}

// 비동기 파일 쓰기 (파이프라인 방식)
void async_pipeline_write(const char* source, const char* dest) {
    int src_fd = open(source, O_RDONLY | O_DIRECT);
    int dst_fd = open(dest, O_WRONLY | O_CREAT | O_TRUNC | O_DIRECT, 0644);
    
    if (src_fd == -1 || dst_fd == -1) {
        perror("파일 열기 실패");
        return;
    }
    
    // 읽기와 쓰기용 별도 컨텍스트
    io_context_t read_ctx = 0, write_ctx = 0;
    io_setup(MAX_EVENTS, &read_ctx);
    io_setup(MAX_EVENTS, &write_ctx);
    
    struct stat st;
    fstat(src_fd, &st);
    size_t file_size = st.st_size;
    
    printf("파이프라인 방식 파일 복사 시작 (%zu bytes)\n", file_size);
    
    struct timeval start, end;
    gettimeofday(&start, NULL);
    
    // 더블 버퍼링으로 읽기/쓰기 파이프라이닝
    char* read_buffers[2];
    posix_memalign((void**)&read_buffers[0], 4096, BUFFER_SIZE);
    posix_memalign((void**)&read_buffers[1], 4096, BUFFER_SIZE);
    
    struct iocb read_iocb[2], write_iocb[2];
    struct io_event events[MAX_EVENTS];
    
    off_t read_offset = 0, write_offset = 0;
    int active_buffer = 0;
    size_t total_copied = 0;
    
    // 첫 번째 읽기 시작
    size_t read_size = (file_size > BUFFER_SIZE) ? BUFFER_SIZE : file_size;
    io_prep_pread(&read_iocb[0], src_fd, read_buffers[0], read_size, 0);
    io_submit(read_ctx, 1, &(&read_iocb[0]));
    read_offset = read_size;
    
    while (total_copied < file_size) {
        // 읽기 완료 대기
        int ret = io_getevents(read_ctx, 1, 1, events, NULL);
        if (ret > 0 && events[0].res > 0) {
            size_t bytes_to_write = events[0].res;
            
            // 현재 버퍼로 쓰기 시작
            io_prep_pwrite(&write_iocb[active_buffer], dst_fd, 
                          read_buffers[active_buffer], 
                          bytes_to_write, write_offset);
            io_submit(write_ctx, 1, &(&write_iocb[active_buffer]));
            
            write_offset += bytes_to_write;
            
            // 다음 버퍼로 읽기 계속
            if (read_offset < file_size) {
                int next_buffer = 1 - active_buffer;
                size_t next_read_size = (file_size - read_offset > BUFFER_SIZE) ? 
                                       BUFFER_SIZE : (file_size - read_offset);
                
                io_prep_pread(&read_iocb[next_buffer], src_fd, 
                             read_buffers[next_buffer], 
                             next_read_size, read_offset);
                io_submit(read_ctx, 1, &(&read_iocb[next_buffer]));
                read_offset += next_read_size;
            }
            
            // 쓰기 완료 대기
            ret = io_getevents(write_ctx, 1, 1, events, NULL);
            if (ret > 0 && events[0].res > 0) {
                total_copied += events[0].res;
                printf("진행률: %.1f%%\r", 
                       (double)total_copied / file_size * 100);
                fflush(stdout);
            }
            
            active_buffer = 1 - active_buffer;
        }
    }
    
    gettimeofday(&end, NULL);
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_usec - start.tv_usec) / 1000000.0;
    
    printf("\n파이프라인 복사 완료: %.2f초, %.2f MB/s\n", 
           elapsed, (file_size / 1024.0 / 1024.0) / elapsed);
    
    // 정리
    free(read_buffers[0]);
    free(read_buffers[1]);
    io_destroy(read_ctx);
    io_destroy(write_ctx);
    close(src_fd);
    close(dst_fd);
}

int main() {
    async_file_read("test_file.bin");
    async_pipeline_write("test_file.bin", "copy_async.bin");
    return 0;
}
```

## io_uring - 차세대 비동기 I/O

io_uring은 Linux 5.1에서 도입된 최신 비동기 I/O 인터페이스로, 기존 AIO의 모든 한계를 극복했습니다.

```c
// io_uring_example.c - io_uring 활용 예제
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>
#include <liburing.h>  // -luring 링크 필요

#define QUEUE_DEPTH 32
#define BUFFER_SIZE 65536

// io_uring을 이용한 고성능 파일 복사
void uring_file_copy(const char* source, const char* dest) {
    struct io_uring ring;
    int src_fd, dst_fd;
    struct stat st;
    
    // 파일 열기
    src_fd = open(source, O_RDONLY);
    dst_fd = open(dest, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    
    if (src_fd < 0 || dst_fd < 0) {
        perror("파일 열기 실패");
        return;
    }
    
    fstat(src_fd, &st);
    size_t file_size = st.st_size;
    
    // io_uring 초기화
    if (io_uring_queue_init(QUEUE_DEPTH, &ring, 0) < 0) {
        perror("io_uring_queue_init 실패");
        return;
    }
    
    printf("io_uring 파일 복사 시작 (크기: %zu bytes)\n", file_size);
    
    struct timeval start, end;
    gettimeofday(&start, NULL);
    
    // 파이프라인 방식으로 읽기/쓰기 동시 처리
    char* buffers[2];
    buffers[0] = malloc(BUFFER_SIZE);
    buffers[1] = malloc(BUFFER_SIZE);
    
    off_t offset = 0;
    int active_buffer = 0;
    int read_pending = 0;
    int write_pending = 0;
    size_t total_copied = 0;
    
    while (offset < file_size || read_pending || write_pending) {
        struct io_uring_sqe *sqe;
        struct io_uring_cqe *cqe;
        
        // 읽기 요청 제출
        if (offset < file_size && !read_pending) {
            size_t read_size = (file_size - offset > BUFFER_SIZE) ? 
                              BUFFER_SIZE : (file_size - offset);
            
            sqe = io_uring_get_sqe(&ring);
            io_uring_prep_read(sqe, src_fd, buffers[active_buffer], 
                              read_size, offset);
            io_uring_sqe_set_data(sqe, (void*)1);  // 읽기 식별자
            
            read_pending = 1;
            offset += read_size;
        }
        
        // 요청 제출
        io_uring_submit(&ring);
        
        // 완료 이벤트 처리
        if (io_uring_wait_cqe(&ring, &cqe) < 0) {
            perror("io_uring_wait_cqe 실패");
            break;
        }
        
        int is_read = (intptr_t)io_uring_cqe_get_data(cqe);
        int result = cqe->res;
        
        if (result < 0) {
            printf("I/O 오류: %s\n", strerror(-result));
            io_uring_cqe_seen(&ring, cqe);
            break;
        }
        
        if (is_read && result > 0) {
            // 읽기 완료 - 쓰기 요청 제출
            read_pending = 0;
            
            sqe = io_uring_get_sqe(&ring);
            io_uring_prep_write(sqe, dst_fd, buffers[active_buffer], 
                               result, total_copied);
            io_uring_sqe_set_data(sqe, (void*)0);  // 쓰기 식별자
            
            write_pending = 1;
            active_buffer = 1 - active_buffer;  // 버퍼 스왑
            
        } else if (!is_read && result > 0) {
            // 쓰기 완료
            write_pending = 0;
            total_copied += result;
        }
        
        io_uring_cqe_seen(&ring, cqe);
    }
    
    gettimeofday(&end, NULL);
    
    double elapsed = (end.tv_sec - start.tv_sec) + 
                    (end.tv_usec - start.tv_usec) / 1000000.0;
    
    printf("io_uring 복사 완료: %.2f초\n", elapsed);
    printf("처리량: %.2f MB/s\n", 
           (file_size / 1024.0 / 1024.0) / elapsed);
    
    // 정리
    free(buffers[0]);
    free(buffers[1]);
    io_uring_queue_exit(&ring);
    close(src_fd);
    close(dst_fd);
}

// io_uring 고급 기능: 벡터 I/O
void uring_vectored_io(const char* filename) {
    struct io_uring ring;
    int fd;
    
    fd = open(filename, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        perror("파일 열기 실패");
        return;
    }
    
    if (io_uring_queue_init(16, &ring, 0) < 0) {
        perror("io_uring 초기화 실패");
        close(fd);
        return;
    }
    
    printf("io_uring 벡터 I/O 테스트\n");
    
    // 여러 버퍼 준비
    struct iovec iovecs[4];
    char* buffers[4];
    
    for (int i = 0; i < 4; i++) {
        buffers[i] = malloc(1024);
        snprintf(buffers[i], 1024, 
                "Buffer %d: This is test data for vectored I/O.\n"
                "Multiple buffers can be written in a single operation.\n"
                "This improves efficiency for scattered data.\n\n", i + 1);
        
        iovecs[i].iov_base = buffers[i];
        iovecs[i].iov_len = strlen(buffers[i]);
    }
    
    // 벡터 쓰기 요청
    struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
    io_uring_prep_writev(sqe, fd, iovecs, 4, 0);
    io_uring_sqe_set_data(sqe, (void*)1);
    
    io_uring_submit(&ring);
    
    // 완료 대기
    struct io_uring_cqe *cqe;
    if (io_uring_wait_cqe(&ring, &cqe) == 0) {
        if (cqe->res < 0) {
            printf("벡터 I/O 오류: %s\n", strerror(-cqe->res));
        } else {
            printf("벡터 I/O 완료: %d bytes 쓰기\n", cqe->res);
        }
        io_uring_cqe_seen(&ring, cqe);
    }
    
    // 정리
    for (int i = 0; i < 4; i++) {
        free(buffers[i]);
    }
    
    io_uring_queue_exit(&ring);
    close(fd);
}

// io_uring의 링크된 작업 (Linked Operations)
void uring_linked_operations() {
    struct io_uring ring;
    int src_fd, dst_fd;
    
    // 파일 준비
    src_fd = open("source.txt", O_WRONLY | O_CREAT | O_TRUNC, 0644);
    write(src_fd, "Hello, io_uring linked operations!", 34);
    close(src_fd);
    
    src_fd = open("source.txt", O_RDONLY);
    dst_fd = open("dest.txt", O_WRONLY | O_CREAT | O_TRUNC, 0644);
    
    if (io_uring_queue_init(16, &ring, 0) < 0) {
        perror("io_uring 초기화 실패");
        return;
    }
    
    printf("io_uring 링크된 작업 테스트\n");
    
    char* buffer = malloc(1024);
    
    // 첫 번째 작업: 읽기 (링크된 작업의 시작)
    struct io_uring_sqe *sqe1 = io_uring_get_sqe(&ring);
    io_uring_prep_read(sqe1, src_fd, buffer, 1024, 0);
    sqe1->flags |= IOSQE_IO_LINK;  // 다음 작업과 링크
    io_uring_sqe_set_data(sqe1, (void*)1);
    
    // 두 번째 작업: 쓰기 (링크된 작업)
    struct io_uring_sqe *sqe2 = io_uring_get_sqe(&ring);
    io_uring_prep_write(sqe2, dst_fd, buffer, 34, 0);  // 읽은 데이터 크기
    io_uring_sqe_set_data(sqe2, (void*)2);
    
    // 모든 작업 제출
    io_uring_submit(&ring);
    
    // 완료 대기 (링크된 작업은 순서대로 실행됨)
    for (int i = 0; i < 2; i++) {
        struct io_uring_cqe *cqe;
        if (io_uring_wait_cqe(&ring, &cqe) == 0) {
            int op_id = (intptr_t)io_uring_cqe_get_data(cqe);
            if (cqe->res < 0) {
                printf("작업 %d 오류: %s\n", op_id, strerror(-cqe->res));
            } else {
                printf("작업 %d 완료: %d bytes\n", op_id, cqe->res);
            }
            io_uring_cqe_seen(&ring, cqe);
        }
    }
    
    printf("링크된 읽기/쓰기 작업 완료\n");
    
    // 정리
    free(buffer);
    io_uring_queue_exit(&ring);
    close(src_fd);
    close(dst_fd);
    unlink("source.txt");
    unlink("dest.txt");
}

int main() {
    // 테스트 파일 생성
    int fd = open("test_uring.bin", O_WRONLY | O_CREAT | O_TRUNC, 0644);
    char data[1024];
    for (int i = 0; i < 1024; i++) data[i] = i % 256;
    
    for (int i = 0; i < 100 * 1024; i++) {  // 100MB
        write(fd, data, 1024);
    }
    close(fd);
    
    // 각 기능 테스트
    uring_file_copy("test_uring.bin", "copy_uring.bin");
    uring_vectored_io("vector_test.txt");
    uring_linked_operations();
    
    // 정리
    unlink("test_uring.bin");
    unlink("copy_uring.bin");
    unlink("vector_test.txt");
    
    return 0;
}
```

## 성능 최적화 패턴

### 배치 처리 최적화

```c
// batch_optimization.c - 배치 처리로 성능 최적화
#include <stdio.h>
#include <stdlib.h>
#include <liburing.h>
#include <fcntl.h>
#include <string.h>
#include <sys/time.h>

#define BATCH_SIZE 32
#define BUFFER_SIZE 4096

// 단일 작업 vs 배치 작업 성능 비교
void batch_vs_single_comparison() {
    const char* test_files[BATCH_SIZE];
    char filename_buffer[BATCH_SIZE][256];
    
    // 테스트 파일들 생성
    for (int i = 0; i < BATCH_SIZE; i++) {
        snprintf(filename_buffer[i], sizeof(filename_buffer[i]), 
                "test_batch_%d.txt", i);
        test_files[i] = filename_buffer[i];
        
        int fd = open(test_files[i], O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (fd >= 0) {
            char data[BUFFER_SIZE];
            memset(data, 'A' + (i % 26), sizeof(data));
            write(fd, data, sizeof(data));
            close(fd);
        }
    }
    
    printf("=== 단일 작업 vs 배치 작업 성능 비교 ===\n");
    
    // 1. 단일 작업 방식
    struct timeval start, end;
    gettimeofday(&start, NULL);
    
    for (int i = 0; i < BATCH_SIZE; i++) {
        char buffer[BUFFER_SIZE];
        int fd = open(test_files[i], O_RDONLY);
        if (fd >= 0) {
            read(fd, buffer, sizeof(buffer));
            close(fd);
        }
    }
    
    gettimeofday(&end, NULL);
    double single_time = (end.tv_sec - start.tv_sec) + 
                        (end.tv_usec - start.tv_usec) / 1000000.0;
    
    // 2. io_uring 배치 방식
    struct io_uring ring;
    io_uring_queue_init(BATCH_SIZE, &ring, 0);
    
    char* buffers[BATCH_SIZE];
    int fds[BATCH_SIZE];
    
    // 파일 열기
    for (int i = 0; i < BATCH_SIZE; i++) {
        fds[i] = open(test_files[i], O_RDONLY);
        buffers[i] = malloc(BUFFER_SIZE);
    }
    
    gettimeofday(&start, NULL);
    
    // 모든 읽기 요청을 한 번에 제출
    for (int i = 0; i < BATCH_SIZE; i++) {
        struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
        io_uring_prep_read(sqe, fds[i], buffers[i], BUFFER_SIZE, 0);
        io_uring_sqe_set_data(sqe, (void*)(intptr_t)i);
    }
    
    // 배치 제출
    io_uring_submit(&ring);
    
    // 모든 완료 대기
    for (int i = 0; i < BATCH_SIZE; i++) {
        struct io_uring_cqe *cqe;
        if (io_uring_wait_cqe(&ring, &cqe) == 0) {
            io_uring_cqe_seen(&ring, cqe);
        }
    }
    
    gettimeofday(&end, NULL);
    double batch_time = (end.tv_sec - start.tv_sec) + 
                       (end.tv_usec - start.tv_usec) / 1000000.0;
    
    printf("단일 작업 시간: %.4f초\n", single_time);
    printf("배치 작업 시간: %.4f초\n", batch_time);
    printf("성능 향상: %.1fx\n", single_time / batch_time);
    
    // 정리
    for (int i = 0; i < BATCH_SIZE; i++) {
        free(buffers[i]);
        close(fds[i]);
        unlink(test_files[i]);
    }
    
    io_uring_queue_exit(&ring);
}

// 적응적 배치 크기 조정
typedef struct {
    struct io_uring ring;
    int current_batch_size;
    int max_batch_size;
    double last_latency;
    int pending_ops;
} AdaptiveBatcher;

AdaptiveBatcher* adaptive_batcher_create(int max_batch) {
    AdaptiveBatcher* batcher = malloc(sizeof(AdaptiveBatcher));
    if (!batcher) return NULL;
    
    if (io_uring_queue_init(max_batch, &batcher->ring, 0) < 0) {
        free(batcher);
        return NULL;
    }
    
    batcher->current_batch_size = 1;
    batcher->max_batch_size = max_batch;
    batcher->last_latency = 0.0;
    batcher->pending_ops = 0;
    
    return batcher;
}

void adaptive_batcher_submit_read(AdaptiveBatcher* batcher, 
                                 int fd, void* buffer, size_t size, off_t offset) {
    struct io_uring_sqe *sqe = io_uring_get_sqe(&batcher->ring);
    io_uring_prep_read(sqe, fd, buffer, size, offset);
    batcher->pending_ops++;
    
    // 현재 배치 크기에 도달하면 제출
    if (batcher->pending_ops >= batcher->current_batch_size) {
        struct timeval start, end;
        gettimeofday(&start, NULL);
        
        io_uring_submit(&batcher->ring);
        
        // 모든 완료 대기
        for (int i = 0; i < batcher->pending_ops; i++) {
            struct io_uring_cqe *cqe;
            if (io_uring_wait_cqe(&batcher->ring, &cqe) == 0) {
                io_uring_cqe_seen(&batcher->ring, cqe);
            }
        }
        
        gettimeofday(&end, NULL);
        double current_latency = (end.tv_sec - start.tv_sec) + 
                                (end.tv_usec - start.tv_usec) / 1000000.0;
        
        // 적응적 배치 크기 조정
        if (batcher->last_latency > 0) {
            if (current_latency < batcher->last_latency * 0.9) {
                // 성능이 향상되었으면 배치 크기 증가
                if (batcher->current_batch_size < batcher->max_batch_size) {
                    batcher->current_batch_size++;
                }
            } else if (current_latency > batcher->last_latency * 1.1) {
                // 성능이 저하되었으면 배치 크기 감소
                if (batcher->current_batch_size > 1) {
                    batcher->current_batch_size--;
                }
            }
        }
        
        batcher->last_latency = current_latency;
        batcher->pending_ops = 0;
        
        printf("배치 크기: %d, 지연시간: %.4f초\n", 
               batcher->current_batch_size, current_latency);
    }
}

void adaptive_batcher_destroy(AdaptiveBatcher* batcher) {
    if (batcher) {
        io_uring_queue_exit(&batcher->ring);
        free(batcher);
    }
}

int main() {
    batch_vs_single_comparison();
    
    // 적응적 배칭 테스트는 실제 워크로드에서 더 유용함
    printf("\n적응적 배칭은 실제 워크로드에서 테스트하세요.\n");
    
    return 0;
}
```

## 핵심 요점

### 1. Linux AIO vs io_uring

Linux AIO는 Direct I/O 제약이 있지만, io_uring은 더 유연하고 높은 성능을 제공합니다.

### 2. 파이프라이닝의 중요성

읽기와 쓰기를 동시에 진행하는 파이프라인 방식으로 처리량을 크게 향상시킬 수 있습니다.

### 3. 배치 처리 최적화

여러 I/O 작업을 배치로 처리하면 시스템 콜 오버헤드를 크게 줄일 수 있습니다.

### 4. 적응적 최적화

워크로드 특성에 따라 배치 크기나 버퍼 크기를 동적으로 조정하는 것이 효과적입니다.

---

**이전**: [I/O 기초 및 동기 vs 비동기](04a-io-fundamentals.md)  
**다음**: [네트워크 I/O 최적화](04c-network-io-optimization.md)에서 epoll과 네트워크 최적화를 학습합니다.
