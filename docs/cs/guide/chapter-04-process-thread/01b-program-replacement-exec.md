---
tags:
  - Process
  - System Call
  - Operating System
  - Exec
  - Program Loading
---

# Chapter 4-1B: exec() 패밀리와 프로그램 교체 메커니즘

## 완전한 변신의 기술: 나비로 변하는 애벌레

### 쉘이 명령어를 실행하는 비밀

터미널에서 `ls` 명령을 입력하면 무슨 일이 일어날까요? 쉘 구현 중 알게 된 놀라운 사실:

```bash
$ strace -f bash -c "ls"
...
clone(...)  # fork()의 실제 시스템 콜
execve("/bin/ls", ["ls"], ...)  # 변신!
```

**쉘은 자기 자신을 ls로 바꾸지 않습니다!** fork()로 자식을 만들고, 그 자식이 exec()로 ls가 되는 거죠. 그래서 ls가 끝나도 쉘은 살아있는 겁니다.

### 프로그램 교체 메커니즘: 나비로 변하는 애벌레

```mermaid
sequenceDiagram
    participant P as "Process"
    participant K as "Kernel"
    participant L as "Loader"
    participant M as "Memory"    
    P->>K: execve("/bin/ls", argv, envp)
    K->>K: 권한 확인
    K->>L: 새 프로그램 로드 요청
    L->>M: 기존 메모리 해제
    L->>M: 새 프로그램 매핑
    L->>L: ELF 헤더 파싱
    L->>M: 코드/데이터 섹션 로드
    L->>M: 스택 초기화
    L->>K: 로드 완료
    K->>P: 새 프로그램 시작
    Note over P: 이제 완전히 다른 프로그램
```

### exec() 구현: 기억을 지우고 새로운 인격을 심는 과정

실제로 exec()를 디버깅하며 본 놀라운 광경입니다:

```c
// execve() 시스템 콜 내부: 프로세스 변신술의 비밀
int do_execve(const char *filename, 
              const char *const argv[],
              const char *const envp[]) {
    struct linux_binprm bprm;
    int retval;
    
    printf("[exec] %d번 프로세스가 %s로 변신 시작!\n", 
           getpid(), filename);
    
    // 1. 바이너리 파라미터 초기화
    memset(&bprm, 0, sizeof(bprm));
    
    // 2. 실행 파일 열기
    bprm.file = open_exec(filename);
    if (IS_ERR(bprm.file))
        return PTR_ERR(bprm.file);
    
    // 3. 인자와 환경변수 복사
    retval = copy_strings_kernel(argv, &bprm);
    if (retval < 0)
        goto out;
    
    retval = copy_strings_kernel(envp, &bprm);
    if (retval < 0)
        goto out;
    
    // 4. 바이너리 형식 확인 (ELF, script, etc.)
    retval = search_binary_handler(&bprm);
    if (retval < 0)
        goto out;
    
    // 5. 메모리 교체 (이 순간 과거는 사라진다!)
    flush_old_exec(&bprm);  // Point of No Return!
    
    // 6. 새 프로그램 설정
    setup_new_exec(&bprm);
    
    // 7. 엔트리 포인트로 점프 (새로운 삶의 시작)
    start_thread(bprm.entry_point);
    
    // 이 줄은 영원히 실행되지 않음 - exec()의 마법!
    // 이미 다른 프로그램이 되어버렸으니까
    printf("You will never see this!\n");
    return 0;
    
out:
    // 에러 처리
    return retval;
}

// 메모리 교체 과정: 기억을 지우는 순간
void flush_old_exec(struct linux_binprm *bprm) {
    struct mm_struct *old_mm = current->mm;
    
    printf("[exec] 과거를 지우는 중...\n");
    
    // 1. 새 메모리 공간 생성
    struct mm_struct *new_mm = mm_alloc();
    
    // 2. 기존 메모리 매핑 해제
    exit_mmap(old_mm);
    
    // 3. 새 메모리 공간 활성화
    activate_mm(old_mm, new_mm);
    current->mm = new_mm;
    
    // 4. 기존 메모리 구조체 해제
    mmput(old_mm);
    
    // 5. 시그널 초기화
    flush_signal_handlers(current);
    
    // 6. 파일 디스크립터 정리 (close-on-exec)
    flush_old_files(current->files);
}
```

### exec() 패밀리 사용: 6형제의 차이점

exec() 패밀리를 처음 봤을 때 혼란스러웠던 기억이 납니다. 왜 이렇게 많은 버전이?

```c
#include <unistd.h>
#include <stdio.h>

// exec 패밀리 함수들: 각자의 특기가 있다!
void demonstrate_exec_family() {
    printf("\n=== exec() 6형제 소개 ===\n\n");
    
    // execl - List: 인자를 나열 (간단한 경우)
    printf("1. execl: 인자를 직접 나열\n");
    execl("/bin/ls", "ls", "-l", "/home", NULL);
    
    // execlp - List + Path: PATH에서 찾기 (편리!)
    printf("2. execlp: PATH에서 프로그램 찾기\n");
    execlp("ls", "ls", "-l", "/home", NULL);  // /bin/ls 안 써도 됨!
    
    // execle - List + Environment: 깨끗한 환경
    printf("3. execle: 커스텀 환경변수\n");
    char *envp[] = {"PATH=/bin", "USER=test", "LANG=C", NULL};
    execle("/bin/ls", "ls", "-l", NULL, envp);  // 보안에 좋음
    
    // execv - 배열 형태 인자
    char *argv[] = {"ls", "-l", "/home", NULL};
    execv("/bin/ls", argv);
    
    // execvp - PATH 검색 + 배열
    execvp("ls", argv);
    
    // execve - 배열 + 환경변수 (시스템 콜)
    execve("/bin/ls", argv, envp);
    
    // exec 이후 코드는 실행되지 않음
    printf("This will never be printed\n");
}

// fork + exec 패턴: 쉘의 핵심 메커니즘
void spawn_program(const char *program, char *const argv[]) {
    printf("\n=== 쉘처럼 프로그램 실행하기 ===\n");
    
    // 이것이 바로 system() 함수의 내부!
    pid_t pid = fork();
    
    if (pid == 0) {
        // 자식: 새 프로그램 실행
        execvp(program, argv);
        
        // exec 실패 시에만 실행
        perror("exec failed");
        exit(1);
    } else if (pid > 0) {
        // 부모: 자식 대기
        int status;
        waitpid(pid, &status, 0);
        
        if (WIFEXITED(status)) {
            printf("%s exited with %d\n", 
                   program, WEXITSTATUS(status));
        }
    } else {
        perror("fork failed");
    }
}

// 파이프라인 구현: 유닉스 철학의 정수
void create_pipeline() {
    printf("\n=== 파이프라인 마법: ls | grep '.txt' | wc -l ===\n");
    // 이렇게 3개 프로세스가 협력한다!
    int pipe1[2], pipe2[2];
    
    pipe(pipe1);
    pipe(pipe2);
    
    // 첫 번째 명령: ls
    if (fork() == 0) {
        dup2(pipe1[1], STDOUT_FILENO);
        close(pipe1[0]);
        close(pipe1[1]);
        close(pipe2[0]);
        close(pipe2[1]);
        execlp("ls", "ls", NULL);
    }
    
    // 두 번째 명령: grep
    if (fork() == 0) {
        dup2(pipe1[0], STDIN_FILENO);
        dup2(pipe2[1], STDOUT_FILENO);
        close(pipe1[0]);
        close(pipe1[1]);
        close(pipe2[0]);
        close(pipe2[1]);
        execlp("grep", "grep", ".txt", NULL);
    }
    
    // 세 번째 명령: wc
    if (fork() == 0) {
        dup2(pipe2[0], STDIN_FILENO);
        close(pipe1[0]);
        close(pipe1[1]);
        close(pipe2[0]);
        close(pipe2[1]);
        execlp("wc", "wc", "-l", NULL);
    }
    
    // 부모: 파이프 닫고 대기
    close(pipe1[0]);
    close(pipe1[1]);
    close(pipe2[0]);
    close(pipe2[1]);
    
    wait(NULL);
    wait(NULL);
    wait(NULL);
}
```

## exec() 패밀리 함수 비교표

| 함수 | 인자 형태 | PATH 검색 | 환경변수 | 특징 |
|------|-----------|-----------|----------|---------|
| **execl** | List (가변인자) | ❌ | 부모 상속 | 간단한 경우 |
| **execlp** | List + PATH | ✅ | 부모 상속 | 가장 편리 |
| **execle** | List + Env | ❌ | 명시적 전달 | 보안 중시 |
| **execv** | Vector (배열) | ❌ | 부모 상속 | 동적 인자 |
| **execvp** | Vector + PATH | ✅ | 부모 상속 | 유연성 최대 |
| **execve** | Vector + Env | ❌ | 명시적 전달 | **시스템 콜** |

## 실전 활용 시나리오

### 시나리오 1: 웹서버 CGI 실행

```c
// Apache가 PHP 스크립트를 실행하는 방식
if (fork() == 0) {
    // 환경변수 설정
    setenv("REQUEST_METHOD", "GET", 1);
    setenv("QUERY_STRING", "name=value", 1);
    
    // PHP 인터프리터로 변신
    execl("/usr/bin/php", "php", "script.php", NULL);
}
```

### 시나리오 2: 시스템 명령 실행

```c
// system() 함수의 실제 구현
int my_system(const char *command) {
    pid_t pid = fork();
    
    if (pid == 0) {
        execl("/bin/sh", "sh", "-c", command, NULL);
        exit(127);  // exec 실패
    }
    
    int status;
    waitpid(pid, &status, 0);
    return WEXITSTATUS(status);
}
```

### 시나리오 3: 데몬 프로세스 생성

```c
void become_daemon(const char *daemon_program) {
    // 1. 부모에서 분리
    if (fork() != 0) exit(0);
    
    // 2. 세션 리더 되기
    setsid();
    
    // 3. 두 번째 fork로 세션 리더 포기
    if (fork() != 0) exit(0);
    
    // 4. 작업 디렉토리 변경
    chdir("/");
    
    // 5. 파일 모드 마스크 리셋
    umask(0);
    
    // 6. 표준 파일 디스크립터 닫기
    close(STDIN_FILENO);
    close(STDOUT_FILENO);
    close(STDERR_FILENO);
    
    // 7. 데몬 프로그램으로 변신
    execl(daemon_program, daemon_program, NULL);
}
```

## Point of No Return: exec()의 특성

### 1. 메모리 공간 완전 교체

- 기존 코드, 데이터, 힙, 스택 모두 삭제
- 새 프로그램의 메모리 레이아웃으로 완전 교체
- **되돌릴 수 없는 변화**

### 2. PID는 유지, 내용은 완전 변경

- 프로세스 ID는 그대로
- 부모-자식 관계 유지
- 하지만 실행 중인 프로그램은 완전히 다름

### 3. 파일 디스크립터 처리

- 기본: 열린 파일 디스크립터 상속
- close-on-exec 플래그: exec() 시 자동 닫기
- 보안상 중요한 파일들은 close-on-exec 설정 필수

```c
// close-on-exec 설정 예제
int fd = open("sensitive_file.txt", O_RDONLY);
fcntl(fd, F_SETFD, FD_CLOEXEC);  // exec() 시 자동 닫기
```

## 핵심 요점

### 1. exec()의 마법

exec()는 프로세스의 기억을 완전히 지우고 새로운 프로그램으로 변신시킵니다. 되돌릴 수 없는 Point of No Return입니다.

### 2. 6형제의 특징

각 exec() 함수는 인자 전달 방식과 기능에 따라 다른 용도에 최적화되어 있습니다.

### 3. fork + exec 패턴

유닉스의 핵심 철학: fork()로 복제하고 exec()로 변신하는 것이 모든 프로그램 실행의 기본입니다.

### 4. 실전 활용

웹서버, 시스템 도구, 데몬 프로세스 등 모든 곳에서 사용되는 필수 기술입니다.

---

**이전**: [01a-process-creation-fork.md](01a-process-creation-fork.md)  
**다음**: [01c-process-termination-zombies.md](01c-process-termination-zombies.md)에서 프로세스 종료와 좀비 프로세스 처리를 학습합니다.
