---
tags:
  - Linux
  - System
  - FileDescriptor
  - Unix
  - IO
  - Process
---

# File Descriptor: Unix/Linux I/O의 핵심 개념

**Tags:** `#linux` `#system` `#io` `#process` `#unix`

## 들어가며

"왜 서버에서 'too many open files' 에러가 계속 발생할까?"

프로덕션 환경에서 갑작스럽게 발생하는 이 에러는 대부분 file descriptor 고갈이 원인입니다. File descriptor는 Unix/Linux 시스템에서 모든 I/O 작업의 기반이 되는 핵심 개념이지만, 많은 개발자들이 그 내부 동작을 제대로 이해하지 못해 예상치 못한 문제에 직면합니다.

## File Descriptor란?

File descriptor(FD)는 **열린 파일이나 I/O 리소스를 식별하는 음이 아닌 정수**입니다. Unix의 "everything is a file" 철학에 따라, 일반 파일부터 소켓, 파이프, 디바이스까지 모든 것이 file descriptor를 통해 접근됩니다.

### 커널 내부 구조

```text
프로세스 A
┌─────────────────────────┐
│   File Descriptor       │
│   Table                 │
│  ┌─────┬──────────────┐ │
│  │  0  │ stdin        │ │
│  ├─────┼──────────────┤ │
│  │  1  │ stdout       │ │
│  ├─────┼──────────────┤ │
│  │  2  │ stderr       │ │
│  ├─────┼──────────────┤ │
│  │  3  │ file.txt     │ │
│  └─────┴──────────────┘ │
└─────────────────────────┘
           │
           ▼
    System-wide
    Open File Table
┌─────────────────────────┐
│ File Object 1           │
│ ├─ file offset         │
│ ├─ access mode         │
│ └─ inode pointer ──────┼─────┐
├─────────────────────────┤     │
│ File Object 2           │     │
└─────────────────────────┘     │
           │                     │
           ▼                     ▼
      Inode Table         Inode Table
   ┌─────────────────┐ ┌─────────────────┐
   │ Metadata        │ │ Metadata        │
   │ ├─ file size    │ │ ├─ file size    │
   │ ├─ permissions  │ │ ├─ permissions  │
   │ └─ data blocks  │ │ └─ data blocks  │
   └─────────────────┘ └─────────────────┘
```text

## 표준 File Descriptor

모든 프로세스는 시작할 때 세 개의 표준 file descriptor를 상속받습니다:

| FD | 이름   | 설명                        |
|----|--------|----------------------------|
| 0  | stdin  | 표준 입력 (키보드)           |
| 1  | stdout | 표준 출력 (터미널 화면)      |
| 2  | stderr | 표준 에러 출력 (터미널 화면) |

### 표준 FD 확인하기

```bash
# 현재 프로세스의 file descriptor 확인
$ ls -la /proc/self/fd/
total 0
dr-x------ 2 user user  0 Jan  1 12:00 .
dr-xr-xr-x 9 user user  0 Jan  1 12:00 ..
lrwx------ 1 user user 64 Jan  1 12:00 0 -> /dev/pts/0
lrwx------ 1 user user 64 Jan  1 12:00 1 -> /dev/pts/0
lrwx------ 1 user user 64 Jan  1 12:00 2 -> /dev/pts/0
```text

## File Descriptor Table과 제한

### 프로세스별 제한

각 프로세스는 고유한 file descriptor table을 가지며, 이 테이블의 크기에는 제한이 있습니다:

```bash
# 현재 프로세스의 FD 제한 확인
$ ulimit -n
1024

# 시스템 전체 FD 제한 확인
$ cat /proc/sys/fs/file-max
1048576

# 현재 할당된 FD 수 확인
$ cat /proc/sys/fs/file-nr
1440 0 1048576
# 사용중  사용가능  최대값
```text

### 제한 변경하기

```bash
# 임시 변경 (현재 세션만)
$ ulimit -n 4096

# 영구 변경 (/etc/security/limits.conf)
username soft nofile 4096
username hard nofile 8192

# systemd 서비스의 경우
[Service]
LimitNOFILE=8192
```text

## 주요 File Descriptor 연산

### open() 시스템 콜

```c
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/types.h>

int main() {
    // 파일 열기 - 가장 작은 번호의 FD 반환
    int fd = open("/tmp/example.txt", O_CREAT | O_WRONLY, 0644);
    if (fd == -1) {
        perror("open failed");
        return 1;
    }

    printf("Opened file with FD: %d, ", fd);

    // 파일에 데이터 쓰기
    const char *data = "Hello, File Descriptor!, ";
    ssize_t bytes_written = write(fd, data, strlen(data));

    if (bytes_written == -1) {
        perror("write failed");
        close(fd);
        return 1;
    }

    // 파일 닫기 - 중요! 리소스 해제
    close(fd);
    return 0;
}
```text

### dup()과 dup2() - File Descriptor 복제

```c
#include <unistd.h>
#include <fcntl.h>

int main() {
    int fd1 = open("/tmp/output.txt", O_CREAT | O_WRONLY, 0644);

    // dup(): 가장 작은 FD 번호로 복제
    int fd2 = dup(fd1);

    // dup2(): 지정된 FD 번호로 복제
    int fd3 = dup2(fd1, 10);  // fd1을 FD 10번으로 복제

    // 모든 FD가 같은 파일을 가리킴
    write(fd1, "Hello ", 6);
    write(fd2, "from ", 5);
    write(fd3, "FD!, ", 4);

    close(fd1);
    close(fd2);
    close(fd3);

    return 0;
}
```text

### fcntl() - File Descriptor 제어

```c
#include <fcntl.h>

int main() {
    int fd = open("/tmp/test.txt", O_RDWR | O_CREAT, 0644);

    // 현재 플래그 확인
    int flags = fcntl(fd, F_GETFL);
    if (flags == -1) {
        perror("fcntl F_GETFL");
        return 1;
    }

    // Non-blocking 모드 설정
    if (fcntl(fd, F_SETFL, flags | O_NONBLOCK) == -1) {
        perror("fcntl F_SETFL");
        return 1;
    }

    // Close-on-exec 플래그 설정
    if (fcntl(fd, F_SETFD, FD_CLOEXEC) == -1) {
        perror("fcntl F_SETFD");
        return 1;
    }

    close(fd);
    return 0;
}
```text

## File Descriptor 상속과 exec

### fork()에서의 상속

```c
#include <unistd.h>
#include <sys/wait.h>

int main() {
    int fd = open("/tmp/shared.txt", O_CREAT | O_WRONLY, 0644);

    pid_t pid = fork();

    if (pid == 0) {
        // 자식 프로세스 - 부모의 FD 상속
        write(fd, "Child process, ", 14);
        close(fd);
        exit(0);
    } else {
        // 부모 프로세스
        write(fd, "Parent process, ", 15);
        wait(NULL);  // 자식 프로세스 종료 대기
        close(fd);
    }

    return 0;
}
```text

### exec()와 FD_CLOEXEC

```c
#include <unistd.h>
#include <fcntl.h>

int main() {
    int fd1 = open("/tmp/inherit.txt", O_CREAT | O_WRONLY, 0644);
    int fd2 = open("/tmp/no_inherit.txt", O_CREAT | O_WRONLY, 0644);

    // fd2는 exec 시 자동으로 닫힘
    fcntl(fd2, F_SETFD, FD_CLOEXEC);

    if (fork() == 0) {
        // exec 실행 - fd1은 유지, fd2는 닫힘
        execl("/bin/ls", "ls", "-la", "/proc/self/fd/", NULL);
    }

    close(fd1);
    close(fd2);
    return 0;
}
```text

## Non-blocking I/O와 O_NONBLOCK

### Blocking vs Non-blocking

```c
#include <fcntl.h>
#include <errno.h>

void demonstrate_nonblocking_io() {
    int fd = open("/dev/stdin", O_RDONLY | O_NONBLOCK);
    char buffer[1024];

    while (1) {
        ssize_t bytes_read = read(fd, buffer, sizeof(buffer));

        if (bytes_read > 0) {
            printf("Read %zd bytes: %.*s", bytes_read, (int)bytes_read, buffer);
        } else if (bytes_read == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                printf("No data available, continuing..., ");
                usleep(100000);  // 100ms 대기
                continue;
            } else {
                perror("read error");
                break;
            }
        } else {
            printf("EOF reached, ");
            break;
        }
    }

    close(fd);
}
```text

### 소켓에서의 Non-blocking I/O

```c
#include <sys/socket.h>
#include <netinet/in.h>

int setup_nonblocking_server(int port) {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);

    // Non-blocking 설정
    int flags = fcntl(server_fd, F_GETFL);
    fcntl(server_fd, F_SETFL, flags | O_NONBLOCK);

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(port);

    bind(server_fd, (struct sockaddr*)&addr, sizeof(addr));
    listen(server_fd, 128);

    return server_fd;
}

void handle_connections(int server_fd) {
    while (1) {
        int client_fd = accept(server_fd, NULL, NULL);

        if (client_fd == -1) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // 새 연결이 없음
                usleep(1000);
                continue;
            } else {
                perror("accept failed");
                break;
            }
        }

        // 클라이언트 처리
        printf("New client connected: FD %d, ", client_fd);
        // ... 처리 로직
        close(client_fd);
    }
}
```text

## File Descriptor 누수 문제

### 일반적인 누수 패턴

```c
// ❌ 잘못된 예 - FD 누수 발생
int bad_function() {
    int fd = open("/tmp/file.txt", O_RDONLY);

    if (some_condition) {
        return -1;  // fd를 닫지 않고 반환!
    }

    // 다른 처리...
    close(fd);
    return 0;
}

// ✅ 올바른 예 - RAII 스타일
int good_function() {
    int fd = open("/tmp/file.txt", O_RDONLY);
    int result = 0;

    if (fd == -1) {
        return -1;
    }

    if (some_condition) {
        result = -1;
        goto cleanup;  // 정리 코드로 이동
    }

    // 다른 처리...

cleanup:
    close(fd);
    return result;
}
```text

### C++에서의 RAII 패턴

```cpp
#include <memory>
#include <fcntl.h>

class FileDescriptor {
private:
    int fd_;

public:
    FileDescriptor(const char* path, int flags, mode_t mode = 0)
        : fd_(open(path, flags, mode)) {
        if (fd_ == -1) {
            throw std::runtime_error("Failed to open file");
        }
    }

    ~FileDescriptor() {
        if (fd_ != -1) {
            close(fd_);
        }
    }

    // 복사 방지
    FileDescriptor(const FileDescriptor&) = delete;
    FileDescriptor& operator=(const FileDescriptor&) = delete;

    // 이동 생성자
    FileDescriptor(FileDescriptor&& other) noexcept : fd_(other.fd_) {
        other.fd_ = -1;
    }

    int get() const { return fd_; }
};

// 사용 예
void safe_file_operation() {
    FileDescriptor fd("/tmp/safe.txt", O_RDWR | O_CREAT, 0644);

    // 자동으로 파일이 닫힘 (소멸자에서)
    write(fd.get(), "Safe operation, ", 15);
}
```text

## File Descriptor 디버깅

### 현재 열린 FD 확인

```bash
# 특정 프로세스의 열린 FD 목록
$ ls -la /proc/[pid]/fd/

# 프로세스별 FD 사용량
$ lsof -p [pid]

# 시스템 전체에서 특정 파일을 열고 있는 프로세스 찾기
$ lsof /path/to/file

# 네트워크 소켓 FD 확인
$ lsof -i :8080

# FD 사용량 모니터링
$ watch -n 1 'cat /proc/sys/fs/file-nr'
```text

### FD 누수 탐지 도구

```c
// 간단한 FD 추적기
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <dirent.h>

int count_open_fds() {
    DIR *d = opendir("/proc/self/fd");
    if (!d) return -1;

    int count = 0;
    struct dirent *entry;

    while ((entry = readdir(d)) != NULL) {
        if (entry->d_name[0] != '.') {
            count++;
        }
    }

    closedir(d);
    return count;
}

void monitor_fd_usage(const char* operation) {
    static int last_count = 0;
    int current_count = count_open_fds();

    printf("[FD Monitor] %s: %d FDs (변화: %+d), ",
           operation, current_count, current_count - last_count);

    last_count = current_count;
}

// 사용 예
int main() {
    monitor_fd_usage("Start");

    int fd = open("/tmp/test.txt", O_CREAT | O_WRONLY, 0644);
    monitor_fd_usage("After open");

    close(fd);
    monitor_fd_usage("After close");

    return 0;
}
```text

## 고급 File Descriptor 사용

### epoll과 File Descriptor

```c
#include <sys/epoll.h>

int setup_epoll_monitoring() {
    int epoll_fd = epoll_create1(EPOLL_CLOEXEC);
    if (epoll_fd == -1) {
        perror("epoll_create1");
        return -1;
    }

    // 서버 소켓 설정
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    fcntl(server_fd, F_SETFL, O_NONBLOCK);

    // epoll에 서버 소켓 추가
    struct epoll_event ev = {0};
    ev.events = EPOLLIN | EPOLLET;  // Edge Triggered
    ev.data.fd = server_fd;

    if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, server_fd, &ev) == -1) {
        perror("epoll_ctl");
        close(epoll_fd);
        close(server_fd);
        return -1;
    }

    return epoll_fd;
}

void event_loop(int epoll_fd) {
    struct epoll_event events[MAX_EVENTS];

    while (1) {
        int nfds = epoll_wait(epoll_fd, events, MAX_EVENTS, -1);

        for (int i = 0; i < nfds; i++) {
            int fd = events[i].data.fd;

            if (events[i].events & EPOLLIN) {
                // 읽기 가능한 데이터 있음
                handle_read(fd);
            }

            if (events[i].events & EPOLLOUT) {
                // 쓰기 가능
                handle_write(fd);
            }

            if (events[i].events & (EPOLLHUP | EPOLLERR)) {
                // 연결 종료 또는 에러
                close(fd);
                printf("Connection closed: FD %d, ", fd);
            }
        }
    }
}
```text

### 파이프와 File Descriptor

```c
#include <unistd.h>

void pipe_communication_example() {
    int pipefd[2];

    if (pipe(pipefd) == -1) {
        perror("pipe");
        return;
    }

    printf("Created pipe: read_fd=%d, write_fd=%d, ",
           pipefd[0], pipefd[1]);

    pid_t pid = fork();

    if (pid == 0) {
        // 자식 프로세스 - 파이프에서 읽기
        close(pipefd[1]);  // 쓰기 끝 닫기

        char buffer[1024];
        ssize_t bytes_read = read(pipefd[0], buffer, sizeof(buffer));

        printf("Child read: %.*s", (int)bytes_read, buffer);

        close(pipefd[0]);
        exit(0);
    } else {
        // 부모 프로세스 - 파이프에 쓰기
        close(pipefd[0]);  // 읽기 끝 닫기

        const char *message = "Hello from parent!, ";
        write(pipefd[1], message, strlen(message));

        close(pipefd[1]);
        wait(NULL);
    }
}
```text

## 실제 프로덕션 시나리오

### Real Production Incident Example

2024년 2월, 웹 서버에서 다음과 같은 현상이 발생했습니다:

1. **증상**: "accept: too many open files" 에러 발생
2. **초기 분석**: 동시 연결 수 증가로 의심
3. **실제 원인**: 연결 종료 시 file descriptor를 제대로 닫지 않는 버그
4. **해결책**:

   ```c
   // 기존 코드 (버그 있음)
   void handle_client(int client_fd) {
       // ... 처리 로직
       if (error_occurred) {
           return;  // FD 누수!
       }
       close(client_fd);
   }

   // 수정된 코드
   void handle_client(int client_fd) {
       int result = 0;

       // ... 처리 로직
       if (error_occurred) {
           result = -1;
       }

       close(client_fd);  // 항상 닫기
       return result;
   }
   ```

### 문제 해결 체크리스트

**FD 고갈 문제 발생 시:**

- [ ] 현재 FD 사용량 확인

  ```bash
  lsof -p [pid] | wc -l
  ```

- [ ] FD 제한 확인

  ```bash
  cat /proc/[pid]/limits | grep "open files"
  ```

- [ ] 시간별 FD 사용량 모니터링

  ```bash
  while true; do echo "$(date): $(ls /proc/[pid]/fd | wc -l)"; sleep 1; done
  ```

- [ ] 코드에서 close() 누락 지점 검토
- [ ] 예외 처리 경로에서 FD 정리 확인

## 성능 고려사항

### FD 할당과 성능

```c
// FD 번호 재사용 최적화
void optimize_fd_allocation() {
    // 낮은 번호의 FD를 선호하는 커널의 특성 활용
    int fds[1000];

    // 연속적으로 열기
    for (int i = 0; i < 1000; i++) {
        fds[i] = open("/dev/null", O_RDONLY);
    }

    // 중간부터 닫기 (FD 번호에 구멍 생성)
    for (int i = 500; i < 600; i++) {
        close(fds[i]);
    }

    // 새로 열면 500번대 FD가 재사용됨
    int new_fd = open("/dev/null", O_RDONLY);
    printf("New FD: %d (재사용된 번호), ", new_fd);

    // 정리
    for (int i = 0; i < 1000; i++) {
        if (i < 500 || i >= 600) {
            close(fds[i]);
        }
    }
    close(new_fd);
}
```text

### 대용량 FD 처리

```c
// 대용량 서버에서의 FD 관리
struct connection_pool {
    int *fds;
    int capacity;
    int count;
    int next_slot;
};

struct connection_pool* create_pool(int max_connections) {
    struct connection_pool *pool = malloc(sizeof(*pool));
    pool->fds = calloc(max_connections, sizeof(int));
    pool->capacity = max_connections;
    pool->count = 0;
    pool->next_slot = 0;
    return pool;
}

int add_connection(struct connection_pool *pool, int fd) {
    if (pool->count >= pool->capacity) {
        return -1;  // Pool full
    }

    // 빈 슬롯 찾기 (라운드 로빈)
    for (int i = 0; i < pool->capacity; i++) {
        int slot = (pool->next_slot + i) % pool->capacity;
        if (pool->fds[slot] == 0) {
            pool->fds[slot] = fd;
            pool->count++;
            pool->next_slot = (slot + 1) % pool->capacity;
            return slot;
        }
    }

    return -1;
}
```text

## 정리

File descriptor는 Unix/Linux 시스템에서 I/O 작업의 핵심입니다:

### 핵심 포인트

**기본 개념:**

- FD는 열린 파일/리소스를 식별하는 정수 인덱스
- 프로세스별로 독립적인 FD 테이블 유지
- 가장 작은 번호부터 할당

**중요한 연산:**

- `open()`: 파일 열기, FD 할당
- `close()`: FD 해제 (필수!)
- `dup()/dup2()`: FD 복제
- `fcntl()`: FD 속성 제어

**실무 고려사항:**

- FD 제한 설정과 모니터링
- 예외 상황에서의 FD 정리
- Non-blocking I/O 활용
- epoll/kqueue와의 연계

**디버깅:**

- `/proc/[pid]/fd/` 디렉토리 활용
- `lsof` 명령어 사용
- FD 누수 탐지 및 방지

File descriptor를 제대로 이해하고 관리하는 것은 안정적이고 확장 가능한 시스템 소프트웨어 개발의 기초입니다.

## 관련 문서

- [Socket 프로그래밍](../network/socket.md) - 소켓에서의 파일 디스크립터 활용
- [epoll 심화 분석](../network/epoll.md) - I/O 멀티플렉싱과 파일 디스크립터
- [Event Loop 완벽 가이드](../programming/event-loop.md) - 비동기 I/O와 파일 디스크립터
- [Callback 함수 심화 분석](../programming/callback.md) - 시스템 레벨 I/O 콜백
- [Virtual Memory와 Page Table](../memory/virtual-memory-page-table.md) - 메모리 매핑과 파일 I/O
