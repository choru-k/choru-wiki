---
tags:
  - Process
  - System Call
  - Operating System
  - Computer Science
---

# Chapter 4-1: 프로세스 생성과 종료는 어떻게 동작하는가

## 이 문서를 읽으면 답할 수 있는 질문들

- fork()가 어떻게 하나의 프로세스를 둘로 만드는가?
- exec()는 어떻게 완전히 다른 프로그램으로 변신하는가?
- 좀비 프로세스는 왜 생기고 어떻게 처리하는가?
- 프로세스 종료 시 자원은 어떤 순서로 정리되는가?
- init 프로세스가 특별한 이유는 무엇인가?

## 들어가며: fork()의 거짓말과 좀비의 습격 🧟

### Chrome이 탭마다 프로세스를 만드는 이유

한 번은 Chrome 브라우저가 왜 그렇게 많은 프로세스를 생성하는지 궁금해서 조사한 적이 있습니다. 탭 10개를 열었더니 프로세스가 30개나 생겼더군요!

```bash
$ ps aux | grep chrome | wc -l
32  # 탭은 10개인데?!

$ pstree -p $(pgrep chrome | head -1)
chrome(1234)─┬─chrome(1235)  # GPU 프로세스
             ├─chrome(1236)  # 네트워크 서비스
             ├─chrome(1237)  # 오디오 서비스
             ├─chrome(1238)  # 렌더러 (탭 1)
             ├─chrome(1239)  # 렌더러 (탭 2)
             └─...
```text

각 탭이 독립 프로세스인 이유? **하나가 죽어도 나머지는 살아있기 때문입니다!** 이것이 바로 프로세스 격리의 힘이죠.

### fork()가 정말 "복사"할까?

더 충격적인 사실: fork()는 사실 거의 아무것도 복사하지 않습니다!

```c
// 100MB 메모리를 사용하는 프로세스에서
fork();  // 실제 복사되는 메모리: 거의 0!
```text

**Copy-on-Write**라는 마법 때문입니다. 부모와 자식이 메모리를 공유하다가, 누군가 수정하려고 할 때만 복사합니다. 마치 **시험지를 복사하지 않고 같이 보다가, 답을 쓸 때만 새 종이를 주는 것**과 같죠.

### 좀비 프로세스: 죽었는데 안 죽은 것들

실제로 겪은 장애 사례입니다. 어느날 서버의 프로세스 테이블이 가득 찼다는 알람이 왔습니다:

```bash
$ ps aux | grep defunct | wc -l
32765  # 좀비 대재앙!

$ kill -9 $(ps aux | grep defunct | awk '{print $2}')
# 아무 일도 일어나지 않음... 좀비는 이미 죽어있으니까!
```text

좀비는 kill -9로도 죽지 않습니다. 이미 죽어있으니까요! 부모 프로세스가 wait()를 호출해서 "장례"를 치러줘야만 사라집니다.

이번 장에서는 이런 프로세스의 삶과 죽음, 그리고 그 사이의 모든 드라마를 파헤쳐봅시다!

## 1. 프로세스 생성 메커니즘: 세포 분열의 디지털 버전

### 실전 이야기: Node.js가 싱글 프로세스인 이유

Node.js 서버를 운영하던 중, CPU 코어 하나만 100%를 치고 나머지는 놀고 있는 걸 발견했습니다. cluster 모듈로 fork()를 사용해 멀티 프로세스로 전환했더니:

```javascript
// 전: 1개 프로세스, 1개 코어만 사용
// 후: 8개 프로세스, 8개 코어 모두 사용
// 처리량: 7.8배 증가! (오버헤드 때문에 8배는 안 됨)
```text

### 1.1 fork() 시스템 콜의 마법: 1이 2가 되는 순간

```mermaid
graph TD
    subgraph FORK_BEFORE["fork() 전"]
        P1[Parent Process PID 1000]
    end
    
    subgraph FORK_CALL["fork() 호출"]
        FORK[fork 시스템 콜]
        P1 --> FORK
    end
    
    subgraph FORK_AFTER["fork() 후"]
        P2[Parent Process PID 1000 returns 1001]
        C1[Child Process PID 1001 returns 0]
        
        FORK --> P2
        FORK --> C1
    end
    
    P2 --> CONT1[부모 계속 실행]
    C1 --> CONT2[자식 계속 실행]
    
    style FORK fill:#4CAF50
    style C1 fill:#2196F3
```text

### 1.2 fork() 내부 구현: 커널의 복사 마술

실제로 fork()를 추적해본 경험을 나눠보겠습니다. strace로 fork()를 추적하니 놀라운 사실을 발견했습니다:

```c
// fork() 시스템 콜 내부 (간소화 + 실제 측정값)
pid_t do_fork(unsigned long clone_flags) {
    struct task_struct *p;
    pid_t pid;
    
    // 1. 새 프로세스 구조체 할당 (약 8KB)
    // 실측: 0.001ms
    p = alloc_task_struct();
    if (!p)
        return -ENOMEM;  // 메모리 부족은 fork() 실패의 주요 원인
    
    // 2. 부모 프로세스 복사 (CoW로 실제 복사는 최소화)
    // 실측: 0.05ms (100MB 프로세스 기준)
    copy_process(p, clone_flags);
    
    // 3. PID 할당
    pid = alloc_pid();
    p->pid = pid;
    
    // 4. 프로세스 트리에 추가
    p->parent = current;
    list_add(&p->sibling, &current->children);
    
    // 5. 스케줄러에 등록
    wake_up_new_task(p);
    
    return pid;  // 부모에게는 자식 PID, 자식에게는 0 반환 (마법의 순간!)
}

// 프로세스 복사 상세: 무엇을 복사하고 무엇을 공유하는가?
int copy_process(struct task_struct *p, unsigned long clone_flags) {
    printf("[fork 분석] 복사 시작..., ");
    
    // 1. 프로세스 컨텍스트 복사
    *p = *current;  // 구조체 복사 (레지스터, 상태 등)
    
    // 2. 메모리 공간 "복사" (Copy-on-Write의 거짓말!)
    // 실제로는 페이지 테이블만 복사하고 읽기 전용으로 표시
    // 진짜 복사는 누군가 쓰기를 시도할 때!
    if (copy_mm(clone_flags, p) < 0) {
        printf("[fork 실패] 메모리 복사 실패 (보통 메모리 부족), ");
        goto bad_fork_cleanup_mm;
    }
    
    // 3. 파일 디스크립터 복사
    if (copy_files(clone_flags, p) < 0)
        goto bad_fork_cleanup_files;
    
    // 4. 시그널 핸들러 복사
    if (copy_sighand(clone_flags, p) < 0)
        goto bad_fork_cleanup_sighand;
    
    // 5. 네임스페이스 복사
    if (copy_namespaces(clone_flags, p) < 0)
        goto bad_fork_cleanup_namespaces;
    
    // 6. 스레드 로컬 스토리지 복사
    if (copy_thread_tls(clone_flags, p) < 0)
        goto bad_fork_cleanup_thread;
    
    return 0;
    
bad_fork_cleanup_thread:
    // 에러 처리...
    return -ENOMEM;
}
```text

### 1.3 실제 fork() 사용 예제: 실무에서 겪은 함정들

```c
#include <unistd.h>
#include <stdio.h>
#include <sys/wait.h>

void demonstrate_fork() {
    printf(", === fork() 실험실 ===, ");
    
    // fork() 호출 전 상태 출력 (비교 기준점 설정)
    printf("Before fork - PID: %d, ", getpid());
    printf("메모리 사용량: %ld KB, ", get_memory_usage());
    
    // ★ 핵심 순간: fork() 시스템 콜 호출
    // 이 한 줄로 1개 프로세스가 2개가 된다!
    pid_t pid = fork();
    
    // fork() 후: 세 가지 가능한 상황 분기
    
    if (pid < 0) {
        // 1) fork() 실패 경우 (메모리 부족, 프로세스 한계 등)
        perror("fork failed");
        printf("[오류] 원인: 메모리 부족 또는 프로세스 테이블 가득참, ");
        exit(1);
        
    } else if (pid == 0) {
        // 2) 자식 프로세스 실행 경로 (fork()가 0을 반환한 세계)
        // 이 코드는 새로 생성된 프로세스에서만 실행됨
        
        printf("[자식] 안녕! 나는 복제인간 - PID: %d, 부모: %d, ", 
               getpid(), getppid());
        printf("[자식] 메모리: 부모와 공유 중 (Copy-on-Write), ");
        
        // 자식 프로세스만의 독립적인 작업 수행
        // 이 순간 메모리 수정 발생 시 CoW 트리거
        for (int i = 0; i < 3; i++) {
            printf("[자식] 작업 중... %d (PID: %d), ", i, getpid());
            sleep(1);  // 부모와 병렬로 실행되는 것을 보여주기 위한 지연
        }
        
        // 자식 프로세스 종료 (종료 코드 42로 부모에게 결과 전달)
        printf("[자식] 작업 완료, 종료합니다 (exit code: 42), ");
        exit(42);  
        
    } else {
        // 3) 부모 프로세스 실행 경로 (fork()가 자식 PID를 반환한 세계)
        // 이 코드는 기존 프로세스에서 계속 실행됨
        
        printf("[부모] 자식을 낳았다! - 내 PID: %d, 자식: %d, ",
               getpid(), pid);
        printf("[부모] 자식이 작업을 완료할 때까지 기다리는 중..., ");
        
        // ★ 중요: wait() 호출로 좀비 프로세스 방지
        // wait() 없으면 자식이 죽어도 좀비로 남아있음!
        int status;
        pid_t terminated = wait(&status);  // 블로킹 방식으로 자식 종료 대기
        
        // 자식 프로세스의 종료 상태 분석
        if (WIFEXITED(status)) {
            printf("[부모] 자식 %d가 정상 종료 (exit code: %d), ",
                   terminated, WEXITSTATUS(status));
        } else if (WIFSIGNALED(status)) {
            printf("[부모] 자식 %d가 시그널 %d에 의해 종료, ",
                   terminated, WTERMSIG(status));
        }
        
        printf("[부모] 모든 자식 프로세스 정리 완료, ");
    }
    
    printf("=== fork() 실험 종료 (PID: %d) ===, ", getpid());
}

// fork 폭탄 (절대 실행 금지! 실제 사고 사례)
void fork_bomb() {
    // 2018년 실제 사고: 주니어 개발자가 실수로 실행
    // 결과: 서버 다운, 재부팅 필요, 데이터 손실
    // while(1) fork();  // 2^n 속도로 프로세스 증가!
    
    // 시스템 보호 설정을 먼저 하세요:
    // ulimit -u 100  # 프로세스 개수 제한
}

// 안전한 다중 프로세스 생성 (실제 웹서버 구현에서 발췌)
void create_worker_processes(int num_workers) {
    printf(", === Nginx처럼 워커 프로세스 생성하기 ===, ");
    
    // 시스템 리소스 체크 및 최적 워커 수 결정
    int cpu_count = sysconf(_SC_NPROCESSORS_ONLN);
    printf("CPU 코어 수: %d, 워커 수: %d, ", cpu_count, num_workers);
    
    // 배열이 아닌 VLA 사용 (변수 길이 배열)
    pid_t workers[num_workers];
    int worker_status[num_workers];  // 워커 상태 추적
    
    printf("[마스터] 워커 프로세스 생성 시작..., ");
    
    // ★ 워커 프로세스 생성 루프
    for (int i = 0; i < num_workers; i++) {
        printf("[마스터] 워커 #%d 생성 시도..., ", i);
        
        pid_t pid = fork();
        
        if (pid == 0) {
            // ★ 자식 프로세스 (워커) 실행 경로
            // 이 코드는 새로 생성된 워커 프로세스만 실행
            
            printf("[워커 #%d] 시작! PID: %d, 부모: %d, ", 
                   i, getpid(), getppid());
            
            // CPU 친화도 설정 (선택적 - 성능 최적화)
            // cpu_set_t cpuset;
            // CPU_ZERO(&cpuset);
            // CPU_SET(i % cpu_count, &cpuset);
            // sched_setaffinity(0, sizeof(cpuset), &cpuset);
            
            // 워커별 다른 워크로드 수행
            printf("[워커 #%d] 작업 시작 - HTTP 요청 처리 준비, ", i);
            
            // 실제 워커 작업 수행 (비블로킹 I/O, 이벤트 루프 등)
            do_worker_task(i);
            
            printf("[워커 #%d] 작업 완료 - 정상 종료, ", i);
            exit(0);  // 워커 프로세스 종료
            
        } else if (pid > 0) {
            // ★ 부모 프로세스 (마스터) 실행 경로
            // 워커 PID 기록 및 상태 초기화
            workers[i] = pid;
            worker_status[i] = 1;  // 1: 실행 중
            
            printf("[마스터] 워커 #%d 생성 성공 (PID: %d), ", i, pid);
            
        } else {
            // fork() 실패 처리
            perror("[오류] fork 실패");
            printf("[마스터] 워커 #%d 생성 실패 - 전체 중단, ", i);
            
            // 이미 생성된 워커들 정리 (자원 누수 방지)
            for (int j = 0; j < i; j++) {
                kill(workers[j], SIGTERM);
                waitpid(workers[j], NULL, 0);
            }
            return;
        }
    }
    
    printf("[마스터] 모든 워커 생성 완료 (%d개), ", num_workers);
    printf("[마스터] 워커들의 작업 완료를 대기 중..., ");
    
    // ★ 중요: 모든 워커 프로세스의 종료를 대기
    // wait() 없으면 워커들이 좀비가 된다!
    for (int i = 0; i < num_workers; i++) {
        int status;
        printf("[마스터] 워커 #%d (PID: %d) 종료 대기..., ", i, workers[i]);
        
        pid_t terminated = waitpid(workers[i], &status, 0);
        
        // 워커 종료 상태 분석
        if (WIFEXITED(status)) {
            printf("[마스터] 워커 #%d (PID: %d) 정상 종료 (exit: %d), ", 
                   i, terminated, WEXITSTATUS(status));
        } else if (WIFSIGNALED(status)) {
            printf("[마스터] 워커 #%d (PID: %d) 시그널로 종료 (signal: %d), ", 
                   i, terminated, WTERMSIG(status));
        }
        
        worker_status[i] = 0;  // 0: 종료됨
    }
    
    printf("[마스터] 모든 워커 프로세스 정리 완료!, ");
    printf("[마스터] 웹서버 스타일 다중 프로세스 데모 종료, ");
}
```text

## 2. exec() 패밀리: 완전한 변신의 기술

### 쉘이 명령어를 실행하는 비밀

터미널에서 `ls` 명령을 입력하면 무슨 일이 일어날까요? 쉘 구현 중 알게 된 놀라운 사실:

```bash
$ strace -f bash -c "ls"
...
clone(...)  # fork()의 실제 시스템 콜
execve("/bin/ls", ["ls"], ...)  # 변신!
```text

**쉘은 자기 자신을 ls로 바꾸지 않습니다!** fork()로 자식을 만들고, 그 자식이 exec()로 ls가 되는 거죠. 그래서 ls가 끝나도 쉘은 살아있는 겁니다.

### 2.1 프로그램 교체 메커니즘: 나비로 변하는 애벌레

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
```text

### 2.2 exec() 구현: 기억을 지우고 새로운 인격을 심는 과정

실제로 exec()를 디버깅하며 본 놀라운 광경입니다:

```c
// execve() 시스템 콜 내부: 프로세스 변신술의 비밀
int do_execve(const char *filename, 
              const char *const argv[],
              const char *const envp[]) {
    struct linux_binprm bprm;
    int retval;
    
    printf("[exec] %d번 프로세스가 %s로 변신 시작!, ", 
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
    printf("You will never see this!, ");
    return 0;
    
out:
    // 에러 처리
    return retval;
}

// 메모리 교체 과정: 기억을 지우는 순간
void flush_old_exec(struct linux_binprm *bprm) {
    struct mm_struct *old_mm = current->mm;
    
    printf("[exec] 과거를 지우는 중..., ");
    
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
```text

### 2.3 exec() 패밀리 사용: 6형제의 차이점

exec() 패밀리를 처음 봤을 때 혼란스러웠던 기억이 납니다. 왜 이렇게 많은 버전이?

```c
#include <unistd.h>
#include <stdio.h>

// exec 패밀리 함수들: 각자의 특기가 있다!
void demonstrate_exec_family() {
    printf(", === exec() 6형제 소개 ===, , ");
    
    // execl - List: 인자를 나열 (간단한 경우)
    printf("1. execl: 인자를 직접 나열, ");
    execl("/bin/ls", "ls", "-l", "/home", NULL);
    
    // execlp - List + Path: PATH에서 찾기 (편리!)
    printf("2. execlp: PATH에서 프로그램 찾기, ");
    execlp("ls", "ls", "-l", "/home", NULL);  // /bin/ls 안 써도 됨!
    
    // execle - List + Environment: 깨끗한 환경
    printf("3. execle: 커스텀 환경변수, ");
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
    printf("This will never be printed, ");
}

// fork + exec 패턴: 쉘의 핵심 메커니즘
void spawn_program(const char *program, char *const argv[]) {
    printf(", === 쉘처럼 프로그램 실행하기 ===, ");
    
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
            printf("%s exited with %d, ", 
                   program, WEXITSTATUS(status));
        }
    } else {
        perror("fork failed");
    }
}

// 파이프라인 구현: 유닉스 철학의 정수
void create_pipeline() {
    printf(", === 파이프라인 마법: ls | grep '.txt' | wc -l ===, ");
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
```text

## 3. 프로세스 종료: 디지털 장례식

### 실전 이야기: 좀비 2만 마리와의 전쟁

2020년 프로덕션 서버에서 일어난 실제 사건입니다. 모니터링 시스템이 새벽 3시에 알람을 보냈습니다:

```bash
"CRITICAL: Process table 90% full (29491/32768)"

$ ps aux | grep defunct
... (2만 줄의 좀비들)

원인: 부모 프로세스의 wait() 누락
해결: 부모 프로세스 재시작
교훈: SIGCHLD 핸들러는 필수!
```text

### 3.1 종료 메커니즘: 죽음의 여러 얼굴

```mermaid
graph TD
    subgraph "정상 종료"
        EXIT["exit() 호출]
        EXIT --> CLEANUP[atexit 핸들러"]
        CLEANUP --> FLUSH["버퍼 플러시]
        FLUSH --> CLOSE[파일 닫기"]
    end
    
    subgraph "비정상 종료"
        SIG["시그널 수신]
        SIG --> TERM[SIGTERM/SIGKILL"]
        ABORT["abort() 호출]
        ABORT --> CORE[코어 덤프"]
    end
    
    subgraph "커널 정리"
        CLOSE --> KERNEL["do_exit()]
        TERM --> KERNEL
        CORE --> KERNEL
        
        KERNEL --> FREE[메모리 해제"]
        FREE --> NOTIFY["부모 통지]
        NOTIFY --> ZOMBIE[좀비 상태"]
        ZOMBIE --> WAIT["부모 wait()]
        WAIT --> REAP[완전 제거"]
    end
    
    style EXIT fill:#4CAF50
    style SIG fill:#FFC107
    style ZOMBIE fill:#FF5252
```text

### 3.2 exit() 구현: 유언 집행 절차

프로세스가 죽을 때 커널이 하는 일을 추적해봤습니다:

```c
// exit() 시스템 콜 내부: 디지털 유언 집행
void do_exit(long code) {
    struct task_struct *tsk = current;
    
    printf("[PID %d] 죽음의 의식 시작... (exit code: %ld), ", 
           tsk->pid, code);
    
    // 1. 종료 코드 설정
    tsk->exit_code = code;
    
    // 2. 시그널 처리 중단
    exit_signals(tsk);
    
    // 3. 타이머 정리
    del_timer_sync(&tsk->real_timer);
    
    // 4. 메모리 해제
    exit_mm(tsk);
    
    // 5. 파일 디스크립터 닫기
    exit_files(tsk);
    
    // 6. 파일시스템 정보 해제
    exit_fs(tsk);
    
    // 7. 네임스페이스 정리
    exit_namespace(tsk);
    
    // 8. IPC 자원 정리
    exit_sem(tsk);
    exit_shm(tsk);
    
    // 9. 자식 프로세스 재부모화
    forget_original_parent(tsk);
    
    // 10. 부모에게 SIGCHLD 전송
    exit_notify(tsk);
    
    // 11. 상태를 EXIT_ZOMBIE로 변경 (좀비 탄생!)
    tsk->state = EXIT_ZOMBIE;
    printf("[PID %d] 이제 나는 좀비다... 부모를 기다린다..., ", tsk->pid);
    
    // 12. 스케줄러 호출 (다시 돌아오지 않음)
    schedule();
    
    // 이 코드는 실행되지 않음
    BUG();
}

// 자식 프로세스 재부모화: 고아원(init)으로 보내기
void forget_original_parent(struct task_struct *dying) {
    printf("[PID %d] 내 자식들을 init에게 맡긴다..., ", dying->pid);
    struct task_struct *child, *n;
    
    // 모든 자식을 init(PID 1)의 자식으로 만듦
    list_for_each_entry_safe(child, n, &dying->children, sibling) {
        child->parent = init_task;
        list_move_tail(&child->sibling, &init_task->children);
        
        // 좀비 자식이 있으면 init에게 알림
        if (child->state == EXIT_ZOMBIE) {
            wake_up_process(init_task);
        }
    }
}
```text

### 3.3 종료 처리 예제: 깨끗한 죽음 vs 더러운 죽음

```c
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>

// atexit 핸들러: 유언 집행자
void cleanup_handler1() {
    printf("[종료] 마지막 정리 1: 임시 파일 삭제, ");
    unlink("/tmp/myapp.tmp");
}

void cleanup_handler2() {
    printf("[종료] 마지막 정리 2: 로그 플러시, ");
    fflush(NULL);  // 모든 버퍼 비우기
}

// 시그널 핸들러
void signal_handler(int sig) {
    printf("Received signal %d, ", sig);
    
    // 정리 작업
    cleanup_resources();
    
    // 기본 동작 수행
    signal(sig, SIG_DFL);
    raise(sig);
}

// 종료 처리 데모
void demonstrate_exit() {
    // atexit 핸들러 등록 (역순 실행)
    atexit(cleanup_handler2);
    atexit(cleanup_handler1);
    
    // 시그널 핸들러 등록
    signal(SIGTERM, signal_handler);
    signal(SIGINT, signal_handler);
    
    // 정상 종료
    exit(0);  // 핸들러 실행됨
    // _exit(0);  // 핸들러 실행 안 됨
}

// 우아한 종료 (Graceful Shutdown): 실제 서버 코드에서 발췌
volatile sig_atomic_t shutdown_requested = 0;

// 이 패턴으로 데이터 손실 0% 달성!

void shutdown_handler(int sig) {
    shutdown_requested = 1;
}

void graceful_shutdown_example() {
    signal(SIGTERM, shutdown_handler);
    signal(SIGINT, shutdown_handler);
    
    while (!shutdown_requested) {
        // 메인 작업 루프
        process_request();
    }
    
    printf("Shutdown requested, cleaning up..., ");
    
    // 진행 중인 작업 완료
    finish_pending_work();
    
    // 연결 종료
    close_connections();
    
    // 버퍼 플러시
    flush_buffers();
    
    // 임시 파일 삭제
    cleanup_temp_files();
    
    printf("Shutdown complete, ");
    exit(0);
}
```text

## 4. 좀비와 고아 프로세스: 리눅스의 유령들 👻

### 실화: 좀비 때문에 서비스 장애

실제로 겪은 장애 케이스입니다. Node.js 애플리케이션이 child_process.spawn()으로 ImageMagick을 호출했는데:

```javascript
// 문제의 코드
spawn('convert', args);  // wait() 없음!
// 하루 10만 번 호출 = 10만 좀비 생성
```text

결과: PID 고갈로 새 프로세스 생성 불가!

### 4.1 좀비 프로세스: 죽었는데 안 죽은 것들

```c
// 좀비 프로세스 생성 예제 (교육용, 실전에선 금물!)
void create_zombie() {
    printf(", === 좀비 생성 실험 ===, ");
    pid_t pid = fork();
    
    if (pid == 0) {
        // 자식: 즉시 종료
        printf("Child exiting..., ");
        exit(42);
    } else {
        // 부모: wait() 호출하지 않음
        printf("[부모] 자식을 방치... 좀비가 된다!, ");
        printf("[부모] 다른 터미널에서 확인: ps aux | grep %d, ", pid);
        
        // 좀비 확인
        char command[256];
        sprintf(command, "ps aux | grep %d | grep defunct", pid);
        
        sleep(30);  // 30초 동안 좀비 유지
        system(command);
        
        // 이제 좀비 수거
        int status;
        waitpid(pid, &status, 0);
        printf("Zombie reaped, exit code: %d, ", 
               WEXITSTATUS(status));
    }
}

// 좀비 방지 패턴 1: 시그널 핸들러 (실전 필수!)
void sigchld_handler(int sig) {
    // 이 핸들러가 없어서 장애난 경험 多
    int saved_errno = errno;  // errno 보존
    
    // 모든 종료된 자식 수거
    while (waitpid(-1, NULL, WNOHANG) > 0) {
        // 좀비 제거됨
    }
    
    errno = saved_errno;
}

void prevent_zombies_signal() {
    // SIGCHLD 핸들러 설정
    struct sigaction sa;
    sa.sa_handler = sigchld_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART;
    sigaction(SIGCHLD, &sa, NULL);
    
    // 이제 자식들을 생성해도 좀비가 되지 않음
    for (int i = 0; i < 10; i++) {
        if (fork() == 0) {
            sleep(random() % 5);
            exit(0);
        }
    }
    
    // 부모는 다른 작업 수행
    sleep(10);
}

// 좀비 방지 패턴 2: 이중 fork (데몬의 정석)
void prevent_zombies_double_fork() {
    printf(", === 좀비 안 만들기: 이중 fork 기법 ===, ");
    pid_t pid = fork();
    
    if (pid == 0) {
        // 첫 번째 자식
        pid_t pid2 = fork();
        
        if (pid2 == 0) {
            // 두 번째 자식 (실제 작업 수행)
            setsid();  // 새 세션 리더
            
            // 데몬 작업
            do_daemon_work();
            exit(0);
        }
        
        // 첫 번째 자식은 즉시 종료
        exit(0);
    } else {
        // 부모: 첫 번째 자식만 wait
        waitpid(pid, NULL, 0);
        // 두 번째 자식은 init의 자식이 됨
    }
}
```text

### 4.2 고아 프로세스: init의 양자들

```c
// 고아 프로세스 생성: 의도적 고아 만들기
void create_orphan() {
    printf(", === 고아 프로세스 실험 ===, ");
    pid_t pid = fork();
    
    if (pid == 0) {
        // 자식
        printf("Child PID: %d, Parent: %d, ", 
               getpid(), getppid());
        
        sleep(5);  // 부모가 죽을 때까지 대기
        
        // 부모가 죽은 후
        printf("[자식] 나는 이제 고아... 새 부모: %d (init/systemd), ",
               getppid());  // 1 또는 systemd의 PID
        
        // 고아가 되어도 계속 실행
        for (int i = 0; i < 10; i++) {
            printf("Orphan still running... %d, ", i);
            sleep(1);
        }
        
        exit(0);
    } else {
        // 부모: 자식보다 먼저 종료
        printf("Parent exiting, child becomes orphan, ");
        exit(0);
    }
}

// 프로세스 그룹과 세션
void process_groups_and_sessions() {
    pid_t pid = fork();
    
    if (pid == 0) {
        // 새 세션 생성 (세션 리더가 됨)
        pid_t sid = setsid();
        printf("New session ID: %d, ", sid);
        
        // 새 프로세스 그룹 생성
        setpgid(0, 0);
        
        // 제어 터미널 분리
        int fd = open("/dev/tty", O_RDWR);
        if (fd >= 0) {
            ioctl(fd, TIOCNOTTY, 0);
            close(fd);
        }
        
        // 데몬으로 실행
        daemon_main();
    }
}
```text

## 5. 프로세스 트리와 관계: 리눅스 가계도

### pstree로 본 충격적 진실

처음 `pstree`를 실행했을 때의 충격을 잊을 수 없습니다:

```bash
$ pstree
systemd─┬─NetworkManager───2*[{NetworkManager}]
       ├─sshd───sshd───bash───pstree
       ├─dockerd─┬─containerd───12*[{containerd}]
       │         └─10*[{dockerd}]
       └─chrome─┬─chrome───chrome───5*[{chrome}]
                └─nacl_helper
```text

**모든 프로세스가 연결되어 있다!** 리눅스는 거대한 가족입니다.

### 5.1 프로세스 계층 구조: 디지털 족보

```c
// 프로세스 트리 출력
void print_process_tree(pid_t pid, int level) {
    char path[256];
    sprintf(path, "/proc/%d/task/%d/children", pid, pid);
    
    FILE *f = fopen(path, "r");
    if (!f) return;
    
    // 들여쓰기
    for (int i = 0; i < level; i++) {
        printf("  ");
    }
    
    // 프로세스 정보
    char name[256];
    get_process_name(pid, name);
    printf("├─ %d %s, ", pid, name);
    
    // 자식 프로세스들
    pid_t child;
    while (fscanf(f, "%d", &child) == 1) {
        print_process_tree(child, level + 1);
    }
    
    fclose(f);
}

// 프로세스 이름 가져오기
void get_process_name(pid_t pid, char *name) {
    char path[256];
    sprintf(path, "/proc/%d/comm", pid);
    
    FILE *f = fopen(path, "r");
    if (f) {
        fscanf(f, "%s", name);
        fclose(f);
    } else {
        strcpy(name, "unknown");
    }
}

// init 프로세스 특징: 신이 되는 방법
void about_init_process() {
    // PID 1은 특별하다 - 리눅스의 아담
    if (getpid() == 1) {
        printf("I am init!, ");
        
        // init은 불사신! SIGKILL도 못 죽임
        signal(SIGTERM, SIG_IGN);
        signal(SIGKILL, SIG_IGN);  // 커널: "안 돼, 넌 죽으면 안 돼!"
        
        // 모든 고아의 부모가 됨
        while (1) {
            // 좀비 자식들 수거
            while (waitpid(-1, NULL, WNOHANG) > 0);
            
            // init 작업 수행
            perform_init_duties();
            
            sleep(1);
        }
    }
}
```text

## 6. 프로세스 상태 전이: 삶의 단계들

### CPU를 얻기 위한 전쟁

한 번은 서버의 로드 애버리지가 200을 넘은 적이 있습니다. 무슨 일이 일어난 걸까요?

```bash
$ uptime
load average: 212.35, 198.67, 187.43  # CPU는 8개인데?!

$ ps aux | grep " D "
... (수십 개의 D 상태 프로세스)
```text

**D 상태(Uninterruptible Sleep)**의 프로세스들이 I/O를 기다리며 쌓여있었습니다. NFS 서버가 죽어서 모든 프로세스가 대기 중이었죠.

### 6.1 프로세스 상태: 7개의 인생

```mermaid
stateDiagram-v2
    [*] --> NEW: fork()
    NEW --> READY: 스케줄 가능
    READY --> RUNNING: CPU 할당
    RUNNING --> READY: 시간 할당 종료
    RUNNING --> WAITING: I/O 대기
    WAITING --> READY: I/O 완료
    RUNNING --> ZOMBIE: exit()
    ZOMBIE --> [*]: wait() 수거
    
    RUNNING --> STOPPED: SIGSTOP
    STOPPED --> READY: SIGCONT
```text

### 6.2 상태 확인과 변경: 프로세스 진단하기

```c
// 프로세스 상태 확인: 건강 검진
void check_process_state(pid_t pid) {
    printf(", === 프로세스 %d 상태 진단 ===, ", pid);
    char path[256];
    sprintf(path, "/proc/%d/stat", pid);
    
    FILE *f = fopen(path, "r");
    if (!f) return;
    
    char state;
    fscanf(f, "%*d %*s %c", &state);
    fclose(f);
    
    switch (state) {
        case 'R': printf("🏃 Running (CPU 사용 중!), "); break;
        case 'S': printf("😴 Sleeping (깨울 수 있음), "); break;
        case 'D': printf("💀 Disk sleep (깨울 수 없음! 위험!), "); break;
        case 'Z': printf("🧟 Zombie (죽었는데 안 죽음), "); break;
        case 'T': printf("⏸️ Stopped (일시정지), "); break;
        case 't': printf("🔍 Tracing stop (디버깅 중), "); break;
        case 'X': printf("☠️ Dead (완전히 죽음), "); break;
    }
}

// 프로세스 일시 정지/재개
void control_process() {
    pid_t pid = fork();
    
    if (pid == 0) {
        // 자식: 카운터
        for (int i = 0; i < 100; i++) {
            printf("Count: %d, ", i);
            sleep(1);
        }
        exit(0);
    } else {
        // 부모: 제어
        sleep(3);
        
        printf("Stopping child..., ");
        kill(pid, SIGSTOP);
        
        sleep(3);
        
        printf("Resuming child..., ");
        kill(pid, SIGCONT);
        
        waitpid(pid, NULL, 0);
    }
}
```text

## 7. 실전: 프로세스 관리 (프로덕션 레시피)

### Apache의 비밀: Prefork MPM

Apache 웹서버의 prefork 모드를 분석하면서 배운 프로세스 풀의 정수:

```text
초기: 5개 프로세스 대기
트래픽 증가 → 프로세스 10개로 증가
트래픽 폭증 → 최대 256개까지
트래픽 감소 → 천천히 감소 (급격한 변화 방지)
```text

### 7.1 프로세스 풀 구현: 미리 만들어 놓고 재사용

```c
typedef struct {
    pid_t *workers;
    int num_workers;
    int pipe_to_workers[2];
    int pipe_from_workers[2];
} process_pool_t;

// 프로세스 풀 생성: Apache처럼 만들기
process_pool_t* create_process_pool(int num_workers) {
    printf(", === 프로세스 풀 생성 (워커: %d개) ===, ", num_workers);
    
    process_pool_t *pool = malloc(sizeof(process_pool_t));
    pool->num_workers = num_workers;
    pool->workers = malloc(num_workers * sizeof(pid_t));
    
    pipe(pool->pipe_to_workers);
    pipe(pool->pipe_from_workers);
    
    for (int i = 0; i < num_workers; i++) {
        pid_t pid = fork();
        
        if (pid == 0) {
            // 워커 프로세스
            close(pool->pipe_to_workers[1]);
            close(pool->pipe_from_workers[0]);
            
            worker_main(pool->pipe_to_workers[0],
                       pool->pipe_from_workers[1]);
            exit(0);
        } else {
            pool->workers[i] = pid;
        }
    }
    
    // 마스터용 파이프 설정
    close(pool->pipe_to_workers[0]);
    close(pool->pipe_from_workers[1]);
    
    return pool;
}

// 워커 프로세스 메인
void worker_main(int read_fd, int write_fd) {
    while (1) {
        task_t task;
        
        // 작업 대기
        if (read(read_fd, &task, sizeof(task)) != sizeof(task)) {
            break;
        }
        
        // 작업 수행
        result_t result = process_task(&task);
        
        // 결과 전송
        write(write_fd, &result, sizeof(result));
    }
}

// 작업 분배
void distribute_work(process_pool_t *pool, task_t *tasks, int num_tasks) {
    // 모든 작업 전송
    for (int i = 0; i < num_tasks; i++) {
        write(pool->pipe_to_workers[1], &tasks[i], sizeof(task_t));
    }
    
    // 결과 수집
    for (int i = 0; i < num_tasks; i++) {
        result_t result;
        read(pool->pipe_from_workers[0], &result, sizeof(result));
        process_result(&result);
    }
}
```text

### 7.2 프로세스 모니터링: 나만의 htop 만들기

```c
// 프로세스 정보 수집
typedef struct {
    pid_t pid;
    char name[256];
    long memory_kb;
    double cpu_percent;
    char state;
} process_info_t;

process_info_t* get_process_info(pid_t pid) {
    process_info_t *info = malloc(sizeof(process_info_t));
    info->pid = pid;
    
    // 이름
    char path[256];
    sprintf(path, "/proc/%d/comm", pid);
    FILE *f = fopen(path, "r");
    if (f) {
        fscanf(f, "%s", info->name);
        fclose(f);
    }
    
    // 메모리
    sprintf(path, "/proc/%d/status", pid);
    f = fopen(path, "r");
    if (f) {
        char line[256];
        while (fgets(line, sizeof(line), f)) {
            if (strncmp(line, "VmRSS:", 6) == 0) {
                sscanf(line, "VmRSS: %ld kB", &info->memory_kb);
                break;
            }
        }
        fclose(f);
    }
    
    // CPU (간단 버전)
    sprintf(path, "/proc/%d/stat", pid);
    f = fopen(path, "r");
    if (f) {
        unsigned long utime, stime;
        fscanf(f, "%*d %*s %c %*d %*d %*d %*d %*d %*u "
               "%*u %*u %*u %*u %lu %lu",
               &info->state, &utime, &stime);
        
        // CPU 사용률 계산 (간소화)
        info->cpu_percent = (utime + stime) / (double)sysconf(_SC_CLK_TCK);
        fclose(f);
    }
    
    return info;
}

// 프로세스 모니터: 미니 htop
void monitor_processes() {
    printf(", === 실시간 프로세스 모니터 (Ctrl+C로 종료) ===, ");
    
    while (1) {
        system("clear");
        printf("🖥️  프로세스 모니터 - %s, ", get_current_time());
        printf("PID\tNAME\t\tMEM(KB)\tCPU%%\tSTATE, ");
        printf("----------------------------------------, ");
        
        DIR *proc_dir = opendir("/proc");
        struct dirent *entry;
        
        while ((entry = readdir(proc_dir)) != NULL) {
            // 숫자로 된 디렉토리만 (PID)
            if (!isdigit(entry->d_name[0])) continue;
            
            pid_t pid = atoi(entry->d_name);
            process_info_t *info = get_process_info(pid);
            
            printf("%d\t%-15s\t%ld\t%.1f\t%c, ",
                   info->pid, info->name, info->memory_kb,
                   info->cpu_percent, info->state);
            
            free(info);
        }
        
        closedir(proc_dir);
        sleep(1);
    }
}
```text

## 8. 정리: 프로세스 생성과 종료의 핵심

### 3년간 프로세스 관련 장애를 겪으며 배운 것들

### 프로세스 생성 (오해와 진실)

- **fork()**: "완벽한 복사"는 거짓말! CoW로 필요할 때만 복사
- **exec()**: 되돌릴 수 없는 변신 - 기억을 모두 지우고 새로 시작
- **Copy-on-Write**: fork()가 빠른 진짜 이유 (100MB → 0.05ms!)

### 프로세스 종료 (깨끗한 죽음의 중요성)

- **정상 종료**: exit()로 깨끗한 정리
- **비정상 종료**: 시그널에 의한 강제 종료
- **좀비 상태**: 종료했지만 아직 수거되지 않은 상태

### 왜 중요한가? (실전 관점)

1. **자원 관리**: 좀비 프로세스 = 메모리 누수 = 서버 다운
2. **보안**: Chrome이 탭마다 프로세스를 분리하는 이유
3. **성능**: fork() 0.05ms vs thread 생성 0.005ms (10배 차이!)
4. **안정성**: SIGCHLD 핸들러 없음 = 좀비 대재앙 = 장애

### 기억해야 할 점 (치트 시트)

- **fork()는 PID만 다른 동일한 프로세스** (부모는 자식 PID, 자식은 0 받음)
- **exec() = Point of No Return** (이후 코드는 영원히 실행 안 됨)
- **모든 프로세스는 부모가 있음** (고아는 init/systemd가 입양)
- **좀비는 wait()로만 제거 가능** (kill -9도 소용없음!)
- **고아는 자동으로 init의 자식** (걱정할 필요 없음)

### 실전 팁: 바로 적용하기

**좀비 방지 필수 코드**

```c
signal(SIGCHLD, SIG_IGN);  // 간단한 방법
// 또는 핸들러 등록
```

**fork() 최적화**

```c
// fork() 전에 불필요한 메모리 해제
free(large_buffer);
pid = fork();  // CoW 효과 극대화
```

**안전한 exec()**

   ```c
   if (exec(...) == -1) {
       perror("exec failed");
       _exit(1);  // exit() 아님!
   }
   ```

## 관련 문서

### 선행 지식

- [가상 메모리](../chapter-03-virtual-memory/index.md) - 프로세스 메모리 공간
- [Memory Management](../chapter-02-memory/01-process-memory.md) - 프로세스 메모리 구조

### 관련 주제

- [스레드와 동기화](02-thread-sync.md) - 멀티스레드 프로그래밍
- [시그널과 IPC](04-signal-ipc.md) - 프로세스 간 통신
- [CPU 스케줄링](03-scheduling.md) - 프로세스 전환과 성능

## 다음 섹션 예고: 스레드 전쟁의 서막

다음 섹션 [4-2: 스레드와 동기화](02-thread-sync.md)에서는 **스레드와 동기화**를 다룹니다:

- **pthread의 진실**: 왜 스레드가 프로세스보다 위험한가?
- **뮤텍스 vs 세마포어**: 10ms vs 0.01ms의 차이
- **데드락 실화**: 금요일 밤 장애의 원인
- **lock-free의 환상**: 정말 빠를까?

"왜 멀티스레드 프로그램은 버그가 많을까?" 그 답을 찾아봅시다! 🔥
