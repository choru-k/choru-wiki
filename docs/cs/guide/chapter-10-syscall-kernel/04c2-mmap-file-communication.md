---
tags:
  - Kernel
  - UserSpace
  - mmap
  - FileMapping
  - IPC
---

# Chapter 10-4c2: mmap과 파일 기반 통신

## 🎯 무엇을 배우게 될까요?

이 문서를 마스터하면:

1. **"mmap은 어떻게 동작하나요?"** - 메모리 매핑의 원리와 활용법을 배웁니다
2. **"파일 기반 공유가 어떻게 될까요?"** - 파일을 통한 프로세스 간 데이터 교환을 이해합니다
3. **"익명 메모리 매핑은 언제 사용하나요?"** - 부모-자식 프로세스 간 통신을 배웁니다

## 2. mmap을 통한 파일 기반 통신

### 2.1 메모리 매핑의 원리

mmap은 파일을 메모리 주소 공간에 직접 매핑하여, 파일 I/O를 메모리 접근처럼 수행할 수 있게 해줍니다.

```c
// mmap_communication.c - mmap을 통한 파일 기반 통신
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>

#define SHARED_FILE "/tmp/mmap_shared"
#define SHARED_SIZE 4096

struct message_buffer {
    int message_count;
    int read_index;
    int write_index;
    char messages[100][64];
};

// 메시지 송신자
void sender() {
    int fd = open(SHARED_FILE, O_CREAT | O_RDWR, 0666);
    if (fd < 0) {
        perror("open");
        return;
    }
    
    // 파일 크기 설정
    if (ftruncate(fd, SHARED_SIZE) < 0) {
        perror("ftruncate");
        close(fd);
        return;
    }
    
    // 메모리 매핑
    struct message_buffer *buf = mmap(NULL, SHARED_SIZE, PROT_READ | PROT_WRITE,
                                     MAP_SHARED, fd, 0);
    if (buf == MAP_FAILED) {
        perror("mmap");
        close(fd);
        return;
    }
    
    // 초기화
    memset(buf, 0, sizeof(struct message_buffer));
    
    printf("송신자: 메시지 전송 시작\n");
    
    for (int i = 0; i < 20; i++) {
        while (buf->message_count >= 100) {
            usleep(1000);  // 버퍼가 가득 찰 때까지 대기
        }
        
        snprintf(buf->messages[buf->write_index], 64, "메시지 #%d: Hello!", i);
        buf->write_index = (buf->write_index + 1) % 100;
        buf->message_count++;
        
        printf("전송: 메시지 #%d (버퍼: %d/100)\n", i, buf->message_count);
        
        usleep(100000);  // 100ms 지연
    }
    
    munmap(buf, SHARED_SIZE);
    close(fd);
    printf("송신자 완료\n");
}

// 메시지 수신자
void receiver() {
    sleep(1);  // 송신자가 먼저 시작하도록 대기
    
    int fd = open(SHARED_FILE, O_RDWR);
    if (fd < 0) {
        perror("open");
        return;
    }
    
    struct message_buffer *buf = mmap(NULL, SHARED_SIZE, PROT_READ | PROT_WRITE,
                                     MAP_SHARED, fd, 0);
    if (buf == MAP_FAILED) {
        perror("mmap");
        close(fd);
        return;
    }
    
    printf("수신자: 메시지 수신 시작\n");
    
    int received = 0;
    while (received < 20) {
        while (buf->message_count == 0) {
            usleep(1000);  // 메시지가 올 때까지 대기
        }
        
        printf("수신: %s (버퍼: %d/100)\n", 
               buf->messages[buf->read_index], buf->message_count - 1);
        
        buf->read_index = (buf->read_index + 1) % 100;
        buf->message_count--;
        received++;
        
        usleep(150000);  // 150ms 지연 (송신자보다 느림)
    }
    
    munmap(buf, SHARED_SIZE);
    close(fd);
    printf("수신자 완료\n");
}

int main(int argc, char *argv[]) {
    if (argc != 2) {
        printf("사용법: %s [sender|receiver]\n", argv[0]);
        return 1;
    }
    
    if (strcmp(argv[1], "sender") == 0) {
        sender();
    } else if (strcmp(argv[1], "receiver") == 0) {
        receiver();
    } else {
        printf("잘못된 인자: %s\n", argv[1]);
        return 1;
    }
    
    return 0;
}
```

### 2.2 익명 메모리 매핑과 프로세스 간 공유

익명 mmap은 파일 없이도 부모-자식 프로세스 간에 메모리를 공유할 수 있게 해줍니다.

```c
// anonymous_mmap.c - 익명 메모리 매핑을 통한 부모-자식 프로세스 통신
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/wait.h>
#include <semaphore.h>

struct shared_counter {
    sem_t mutex;
    int counter;
    int max_count;
    char log[1000][64];
};

void child_process(struct shared_counter *shared) {
    printf("자식 프로세스: PID %d 시작\n", getpid());
    
    for (int i = 0; i < 10; i++) {
        // 뮤텍스로 임계 영역 보호
        sem_wait(&shared->mutex);
        
        // 공유 카운터 증가
        int old_value = shared->counter;
        shared->counter++;
        
        // 로그 기록
        snprintf(shared->log[shared->counter], 64, 
                "Child PID %d: %d -> %d", getpid(), old_value, shared->counter);
        
        printf("자식: 카운터 %d -> %d\n", old_value, shared->counter);
        
        sem_post(&shared->mutex);
        
        usleep(50000);  // 50ms 지연
    }
    
    printf("자식 프로세스 종료\n");
}

void parent_process(struct shared_counter *shared) {
    printf("부모 프로세스: PID %d 시작\n", getpid());
    
    for (int i = 0; i < 15; i++) {
        sem_wait(&shared->mutex);
        
        int old_value = shared->counter;
        shared->counter += 2;  // 부모는 2씩 증가
        
        snprintf(shared->log[shared->counter], 64,
                "Parent PID %d: %d -> %d", getpid(), old_value, shared->counter);
        
        printf("부모: 카운터 %d -> %d\n", old_value, shared->counter);
        
        sem_post(&shared->mutex);
        
        usleep(70000);  // 70ms 지연
    }
    
    printf("부모 프로세스 작업 완료\n");
}

int main() {
    // 익명 공유 메모리 생성
    struct shared_counter *shared = mmap(NULL, sizeof(struct shared_counter),
                                        PROT_READ | PROT_WRITE,
                                        MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    
    if (shared == MAP_FAILED) {
        perror("mmap");
        return 1;
    }
    
    // 공유 데이터 초기화
    sem_init(&shared->mutex, 1, 1);  // 프로세스 간 공유 뮤텍스
    shared->counter = 0;
    shared->max_count = 100;
    memset(shared->log, 0, sizeof(shared->log));
    
    printf("익명 mmap 공유 메모리 통신 시작\n");
    printf("===================================\n");
    
    pid_t pid = fork();
    
    if (pid == 0) {
        // 자식 프로세스
        child_process(shared);
    } else if (pid > 0) {
        // 부모 프로세스
        parent_process(shared);
        
        // 자식 프로세스 종료 대기
        wait(NULL);
        
        // 최종 결과 출력
        printf("\n=== 최종 결과 ===\n");
        printf("최종 카운터 값: %d\n", shared->counter);
        
        printf("\n=== 실행 로그 ===\n");
        for (int i = 1; i <= shared->counter && i < 100; i++) {
            if (strlen(shared->log[i]) > 0) {
                printf("%s\n", shared->log[i]);
            }
        }
        
        // 정리
        sem_destroy(&shared->mutex);
        munmap(shared, sizeof(struct shared_counter));
        
    } else {
        perror("fork");
        munmap(shared, sizeof(struct shared_counter));
        return 1;
    }
    
    return 0;
}
```

## 핵심 요점

### 1. mmap의 장점

- **영속성**: 파일 기반 공유로 데이터가 디스크에 저장됨
- **유연성**: 다양한 크기와 구조의 데이터 공유 가능
- **설정 용이**: System V IPC보다 간단한 설정

### 2. 익명 mmap의 활용

- **부모-자식**: fork() 전에 설정하면 자동으로 공유
- **시스템 설정**: 파일 생성 없이 메모리만 공유
- **이식 없음**: fork()로 생성된 프로세스에서만 접근 가능

### 3. mmap vs System V 비교

- **메모리 관리**: mmap은 더 직관적인 주소 공간 관리
- **파일 시스템**: mmap은 파일 시스템과 더 잘 통합
- **포트빌리티**: mmap은 POSIX 표준으로 더 널리 지원

---

**이전**: [공유 메모리 기초](04c1-shared-memory-basics.md)  
**다음**: [고성능 데이터 교환](04c3-high-performance-patterns.md)에서 무잠금 링 버퍼와 최적화 기법을 학습합니다.
