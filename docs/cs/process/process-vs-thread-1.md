# Process vs Thread 심화 (1): Linux의 충격적 진실 - 모든 것은 clone()이다

---
tags: [linux, process, thread, kernel, clone, task_struct, operating-system, system-programming]
---

## 들어가며

"프로세스는 독립적이고 스레드는 메모리를 공유한다" - 이것이 교과서적 설명입니다. 하지만 Linux 커널 소스를 열어보면 충격적인 사실을 발견합니다: **커널은 프로세스와 스레드를 구분하지 않습니다.** 모든 것은 `task_struct`이고, 차이는 단지 공유하는 리소스의 종류뿐입니다.

## Linux 커널의 관점: task_struct

```c
// linux/include/linux/sched.h
struct task_struct {
    volatile long state;    // TASK_RUNNING, TASK_STOPPED 등
    void *stack;           // 커널 스택
    pid_t pid;             // Process ID (실제로는 Task ID)
    pid_t tgid;            // Thread Group ID (우리가 아는 PID)
    
    struct mm_struct *mm;           // 메모리 디스크립터
    struct files_struct *files;     // 열린 파일들
    struct signal_struct *signal;   // 시그널 핸들러
    struct sighand_struct *sighand; // 시그널 핸들링
    
    struct task_struct *parent;     // 부모 task
    struct list_head children;      // 자식 tasks
    
    // 수백 개의 필드 더...
};
```

**커널에는 "스레드"라는 개념이 없습니다.** 모든 실행 단위는 `task_struct`입니다.

## clone() 시스템 콜: 모든 것의 시작

```c
// fork()는 사실 clone()의 wrapper
pid_t fork(void) {
    return clone(SIGCHLD, 0);
}

// pthread_create()도 clone()의 wrapper
int pthread_create(...) {
    return clone(
        CLONE_VM |      // 가상 메모리 공유
        CLONE_FILES |   // 파일 디스크립터 테이블 공유
        CLONE_FS |      // 파일시스템 정보 공유
        CLONE_SIGHAND | // 시그널 핸들러 공유
        CLONE_THREAD |  // 같은 thread group
        CLONE_SYSVSEM | // System V 세마포어 공유
        CLONE_SETTLS |  // TLS 설정
        CLONE_PARENT_SETTID |
        CLONE_CHILD_CLEARTID,
        child_stack, ...
    );
}
```

### clone() 플래그 상세 분석

```c
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

// 1. 완전한 프로세스 생성 (fork와 동일)
pid_t create_process() {
    return clone(child_func, 
                child_stack + STACK_SIZE,
                SIGCHLD,  // 최소한의 플래그
                NULL);
}

// 2. 메모리만 공유하는 task (vfork 스타일)
pid_t create_vfork_style() {
    return clone(child_func,
                child_stack + STACK_SIZE,
                CLONE_VM | CLONE_VFORK | SIGCHLD,
                NULL);
}

// 3. 일부만 공유하는 하이브리드
pid_t create_hybrid() {
    return clone(child_func,
                child_stack + STACK_SIZE,
                CLONE_FILES |  // 파일만 공유
                SIGCHLD,
                NULL);
}

// 4. 완전한 스레드
pid_t create_thread() {
    return clone(child_func,
                child_stack + STACK_SIZE,
                CLONE_VM | CLONE_FILES | CLONE_FS |
                CLONE_SIGHAND | CLONE_THREAD | ...
                NULL);
}
```

## PID vs TID vs TGID: 혼란의 삼위일체

```c
#include <sys/syscall.h>

void show_all_ids() {
    printf("getpid(): %d\n", getpid());           // TGID 반환
    printf("gettid(): %ld\n", syscall(SYS_gettid)); // 실제 TID
    printf("getppid(): %d\n", getppid());         // 부모의 TGID
    
    // /proc/self/status 확인
    system("grep -E 'Pid:|Tgid:|PPid:' /proc/self/status");
}

// 메인 스레드: PID = TID = TGID = 1234
// 자식 스레드: PID(TGID) = 1234, TID = 1235
```

### 실험: PID의 진실

```c
#include <pthread.h>
#include <sys/syscall.h>

pid_t main_tid, child_tid;

void* thread_func(void* arg) {
    child_tid = syscall(SYS_gettid);
    printf("Thread: getpid()=%d, gettid()=%ld\n", 
           getpid(), child_tid);
    
    // /proc에서 확인
    char path[64];
    sprintf(path, "/proc/%ld/comm", child_tid);
    system(path);  // 실제로 존재!
    
    return NULL;
}

int main() {
    main_tid = syscall(SYS_gettid);
    printf("Main: getpid()=%d, gettid()=%ld\n", 
           getpid(), main_tid);
    
    pthread_t thread;
    pthread_create(&thread, NULL, thread_func, NULL);
    pthread_join(thread, NULL);
    
    // 놀라운 사실: /proc에 두 개의 "프로세스"가 보임
    printf("\n/proc entries:\n");
    printf("/proc/%ld exists\n", main_tid);
    printf("/proc/%ld exists\n", child_tid);
}
```

## /proc 파일시스템의 이중성

```bash
# 프로세스 1234가 3개 스레드를 가진 경우

# 1. 전통적 프로세스 view
$ ls /proc/ | grep 1234
1234/   # 메인 스레드만 보임

# 2. 실제 task view
$ ls /proc/1234/task/
1234/  1235/  1236/  # 모든 스레드가 보임

# 3. 각 스레드도 독립적 항목 존재 (숨겨짐)
$ ls -la /proc/ | grep 1235
# 안 보임! 하지만...
$ cat /proc/1235/status  # 동작함!

# 4. ps의 속임수
$ ps aux | grep myapp
user  1234  # 프로세스만 표시

$ ps -eLf | grep myapp  
user  1234  1234  # PID = TID (메인)
user  1234  1235  # PID ≠ TID (스레드)
user  1234  1236  # PID ≠ TID (스레드)
```

## 리소스 공유의 스펙트럼

```c
// 커널 내부: 리소스별 참조 카운트
struct mm_struct {
    atomic_t mm_users;   // 이 메모리 공간 사용자 수
    atomic_t mm_count;   // 참조 카운트
    // ...
};

struct files_struct {
    atomic_t count;      // 이 파일 테이블 사용자 수
    // ...
};

// clone() 플래그에 따른 동작
if (flags & CLONE_VM) {
    // 메모리 공유
    atomic_inc(&current->mm->mm_users);
    new_task->mm = current->mm;
} else {
    // 메모리 복사 (COW)
    new_task->mm = dup_mm(current);
}

if (flags & CLONE_FILES) {
    // 파일 디스크립터 공유
    atomic_inc(&current->files->count);
    new_task->files = current->files;
} else {
    // 파일 디스크립터 복사
    new_task->files = dup_fd(current->files);
}
```

### 실험: 선택적 공유

```c
#define _GNU_SOURCE
#include <sched.h>
#include <stdio.h>
#include <fcntl.h>

int shared_var = 100;
char child_stack[8192];

int child_func(void* arg) {
    // 파일 열기
    int fd = open("test.txt", O_RDONLY);
    
    // 전역 변수 수정
    shared_var = 200;
    
    printf("Child: fd=%d, var=%d\n", fd, shared_var);
    return 0;
}

void test_sharing() {
    // 1. 메모리만 공유
    clone(child_func, child_stack + 8192,
          CLONE_VM | SIGCHLD, NULL);
    sleep(1);
    printf("After VM share: var=%d\n", shared_var);  // 200
    
    // 2. 파일만 공유
    shared_var = 100;
    int fd = open("parent.txt", O_RDONLY);
    clone(child_func, child_stack + 8192,
          CLONE_FILES | SIGCHLD, NULL);
    sleep(1);
    printf("After FILES share: var=%d\n", shared_var);  // 100
    // 하지만 child가 연 파일이 parent에도 보임!
}
```

## 네임스페이스: 격리의 차원

```c
// 더 깊은 격리: 네임스페이스
pid_t create_container() {
    return clone(child_func,
                child_stack + STACK_SIZE,
                CLONE_NEWNS |   // Mount 네임스페이스
                CLONE_NEWUTS |  // Hostname 네임스페이스
                CLONE_NEWIPC |  // IPC 네임스페이스
                CLONE_NEWPID |  // PID 네임스페이스
                CLONE_NEWNET |  // Network 네임스페이스
                CLONE_NEWUSER | // User 네임스페이스
                SIGCHLD,
                NULL);
}

// 이것이 바로 컨테이너의 기초!
// Docker = clone() + namespaces + cgroups
```

## COW (Copy-on-Write)의 실체

```c
// fork() 직후 메모리 상태
void demonstrate_cow() {
    int huge_array[1000000] = {0};  // 4MB
    
    pid_t pid = fork();
    
    if (pid == 0) {
        // 자식: 아직 복사 안 됨
        printf("Child RSS before write: ");
        system("grep VmRSS /proc/self/status");
        
        // 쓰기 시도 → COW 발동
        huge_array[0] = 1;
        
        printf("Child RSS after write: ");
        system("grep VmRSS /proc/self/status");
        // RSS 증가!
    }
}

// 페이지 테이블 레벨에서:
// 1. fork() 시 페이지 테이블 항목 복사 (읽기 전용)
// 2. 쓰기 시도 → Page Fault
// 3. 커널이 페이지 복사 후 쓰기 가능으로 변경
```

## 스케줄링 관점: 모두 평등하다

```c
// 커널 스케줄러는 task_struct만 봄
// 프로세스/스레드 구분 없음

void check_scheduling() {
    // 모든 task는 독립적으로 스케줄링
    system("cat /proc/sched_debug | grep myapp");
    
    // 각 task별 CPU 시간
    for (int tid : all_tids) {
        char path[64];
        sprintf(path, "/proc/%d/stat", tid);
        // 14번째 필드: utime
        // 15번째 필드: stime
    }
}

// nice 값도 task별
renice(10, tid1);  // 스레드 1만 낮은 우선순위
renice(-5, tid2);  // 스레드 2는 높은 우선순위
```

## LWP (Light Weight Process)의 유래

```
역사적 배경:
1. 초기 Unix: 프로세스만 존재
2. System V: 프로세스 생성 비용 문제
3. Sun Solaris: LWP 개념 도입
4. Linux: clone() 시스템 콜로 일반화

Linux의 혁신:
- 프로세스/스레드 이분법 거부
- 리소스 공유의 연속 스펙트럼
- 단일 task_struct로 통합
```

## 실전: htop vs top

```bash
# top: 프로세스 중심 view
$ top
  PID COMMAND
 1234 myapp      # 하나로 보임

# htop with H: task 중심 view  
$ htop -H
  PID COMMAND
 1234 myapp      # 메인
 1235 ├─worker1  # 스레드
 1236 └─worker2  # 스레드

# 커널의 진실
$ ls /sys/kernel/debug/sched/
# 모든 task가 동등하게 나열
```

## 정리: 환상과 실체

**환상 (User Space)**
- 프로세스: 독립적 실행 단위
- 스레드: 프로세스 내 실행 흐름
- 명확한 계층 구조

**실체 (Kernel Space)**
- 모든 것은 task_struct
- clone() 플래그로 공유 수준 결정
- 프로세스/스레드는 편의상 구분

이 이해가 왜 중요한가?
1. **디버깅**: /proc, /sys 정보 올바른 해석
2. **성능**: 스케줄링, CPU 친화도 최적화
3. **보안**: 격리 수준 정확한 이해
4. **컨테이너**: Docker/K8s의 동작 원리

다음 편에서는 이 지식을 바탕으로 메모리 공유와 격리의 실제 구현을 파헤쳐보겠습니다.

## 관련 문서

- [Process vs Thread 심화 2: 메모리 공유와 격리의 실제 구현](process-vs-thread-2.md)
- [Process vs Thread 심화 3: 스케줄링, 시그널, 그리고 실전 선택 가이드](process-vs-thread-3.md)
- [Linux 스케줄링 완벽 가이드 1: 스케줄링의 진화와 기본 개념](linux-scheduling-1.md)