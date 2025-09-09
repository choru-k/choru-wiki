---
tags:
  - Process
  - Thread
  - Memory
  - Virtual-Memory
  - Shared-Memory
  - Linux
---

# Process vs Thread 심화 (2): 메모리 공유와 격리의 실제 구현

---
tags: [linux, memory-management, virtual-memory, page-table, cow, mmap, tls, shared-memory, operating-system]
---

## 들어가며

"스레드는 메모리를 공유하고 프로세스는 격리된다" - 이 간단한 문장 뒤에는 복잡한 메커니즘이 숨어있습니다. 어떻게 같은 물리 메모리를 여러 task가 다르게 보는 걸까요? 왜 스레드는 포인터를 그대로 공유할 수 있을까요? 이번 편에서는 Linux의 메모리 관리 구조를 파헤쳐봅니다.

## mm_struct: 메모리의 설계도

```c
// include/linux/mm_types.h
struct mm_struct {
    struct vm_area_struct *mmap;      // VMA 연결 리스트
    struct rb_root mm_rb;              // VMA 레드블랙 트리
    
    pgd_t *pgd;                        // Page Global Directory
    
    atomic_t mm_users;                 // 사용자 수 (스레드)
    atomic_t mm_count;                 // 참조 카운트
    
    unsigned long start_code, end_code;   // 코드 영역
    unsigned long start_data, end_data;   // 데이터 영역
    unsigned long start_brk, brk;         // 힙 영역
    unsigned long start_stack;            // 스택 시작
    
    unsigned long total_vm;            // 전체 가상 메모리
    unsigned long locked_vm;           // mlock된 페이지
    unsigned long pinned_vm;           // pinned 페이지
    unsigned long data_vm;             // 데이터 페이지
    unsigned long exec_vm;             // 실행 가능 페이지
    unsigned long stack_vm;            // 스택 페이지
    
    struct rw_semaphore mmap_sem;      // VMA 보호
    spinlock_t page_table_lock;        // 페이지 테이블 보호
};
```

### 프로세스 vs 스레드의 mm_struct

```c
// 프로세스 생성 (fork)
if (!(clone_flags & CLONE_VM)) {
    // 새로운 mm_struct 할당
    mm = dup_mm(current);
    
    // 모든 VMA 복사 (COW 설정)
    for (vma = current->mm->mmap; vma; vma = vma->vm_next) {
        new_vma = copy_vma(vma);
        // 페이지 테이블 항목 복사 (읽기 전용)
        copy_page_range(mm, current->mm, vma);
    }
    
    new_task->mm = mm;
    atomic_inc(&mm->mm_users);
}

// 스레드 생성 (pthread_create)  
if (clone_flags & CLONE_VM) {
    // 같은 mm_struct 공유
    atomic_inc(&current->mm->mm_users);
    new_task->mm = current->mm;
    
    // 단, 스택은 새로 할당
    stack_vma = allocate_stack(PTHREAD_STACK_SIZE);
    insert_vm_struct(current->mm, stack_vma);
}
```

## VMA (Virtual Memory Area): 메모리 구획

```c
struct vm_area_struct {
    unsigned long vm_start;        // 시작 주소
    unsigned long vm_end;          // 끝 주소
    
    struct vm_area_struct *vm_next, *vm_prev;  // 리스트
    struct rb_node vm_rb;          // RB 트리 노드
    
    unsigned long vm_flags;        // 권한 플래그
    
    struct file *vm_file;          // 매핑된 파일
    unsigned long vm_pgoff;        // 파일 오프셋
    
    struct mm_struct *vm_mm;       // 소속 mm
    
    const struct vm_operations_struct *vm_ops;  // 연산
};

// VMA 플래그
#define VM_READ     0x00000001
#define VM_WRITE    0x00000002  
#define VM_EXEC     0x00000004
#define VM_SHARED   0x00000008
#define VM_MAYSHARE 0x00000080
```

### 실제 메모리 맵 확인

```c
void print_memory_layout(pid_t pid) {
    char path[64];
    sprintf(path, "/proc/%d/maps", pid);
    
    FILE* f = fopen(path, "r");
    char line[256];
    
    while (fgets(line, sizeof(line), f)) {
        unsigned long start, end;
        char perms[5];
        unsigned long offset;
        int major, minor;
        unsigned long inode;
        char pathname[128];
        
        sscanf(line, "%lx-%lx %4s %lx %x:%x %lu %s",
               &start, &end, perms, &offset,
               &major, &minor, &inode, pathname);
        
        printf("VMA: 0x%lx-0x%lx %s %s\n",
               start, end, perms, pathname);
    }
}

// 출력 예시:
// VMA: 0x400000-0x401000 r-xp /usr/bin/app     (코드)
// VMA: 0x601000-0x602000 rw-p /usr/bin/app     (데이터)
// VMA: 0x7f8a2c000000-0x7f8a2c800000 rw-p [stack:1235]
```

## 페이지 테이블: 가상→물리 변환

```
4-Level Page Table (x86_64):
┌──────────────────────────────────────────┐
│   Virtual Address (48 bits used)         │
│ ┌────┬────┬────┬────┬────┬──────────┐   │
│ │PGD │PUD │PMD │PTE │Off │          │   │
│ │9bit│9bit│9bit│9bit│12bit│          │   │
│ └────┴────┴────┴────┴────┴──────────┘   │
└──────────────────────────────────────────┘
         ↓     ↓     ↓     ↓
    ┌────────────────────────┐
    │  Page Global Directory  │ → mm->pgd
    └────────────────────────┘
              ↓
    ┌────────────────────────┐
    │  Page Upper Directory   │
    └────────────────────────┘
              ↓
    ┌────────────────────────┐
    │  Page Middle Directory  │
    └────────────────────────┘
              ↓
    ┌────────────────────────┐
    │  Page Table Entry       │
    │  ┌──────────────────┐  │
    │  │ Physical Address │  │ → 실제 메모리
    │  │ Flags (R/W/X/D) │  │
    │  └──────────────────┘  │
    └────────────────────────┘
```

### 프로세스별 독립 vs 스레드 공유

```c
// 실험: 페이지 테이블 공유 확인
void* shared_memory;

void demonstrate_page_tables() {
    // 공유 메모리 할당
    shared_memory = mmap(NULL, 4096,
                        PROT_READ | PROT_WRITE,
                        MAP_SHARED | MAP_ANONYMOUS,
                        -1, 0);
    *(int*)shared_memory = 42;
    
    pid_t pid = fork();
    if (pid == 0) {
        // 자식 프로세스: 다른 페이지 테이블
        printf("Child: value=%d at %p\n",
               *(int*)shared_memory, shared_memory);
        
        // 페이지 테이블 엔트리 확인
        unsigned long pte = get_pte(shared_memory);
        printf("Child PTE: 0x%lx\n", pte);
        
        *(int*)shared_memory = 100;
        exit(0);
    }
    
    // 부모: 스레드 생성
    pthread_t thread;
    pthread_create(&thread, NULL, [](void* arg) -> void* {
        // 같은 페이지 테이블 사용!
        printf("Thread: value=%d at %p\n",
               *(int*)shared_memory, shared_memory);
        
        unsigned long pte = get_pte(shared_memory);
        printf("Thread PTE: 0x%lx\n", pte);  // 부모와 동일!
        
        *(int*)shared_memory = 200;
        return NULL;
    }, NULL);
}
```

## TLS (Thread Local Storage): 공유 속의 격리

스레드는 메모리를 공유하지만, TLS는 예외입니다:

```c
// TLS 변수 선언
__thread int tls_var = 0;
thread_local int cpp_tls = 0;  // C++11

void* thread_func(void* arg) {
    int thread_num = *(int*)arg;
    tls_var = thread_num;
    
    printf("Thread %d: TLS at %p = %d\n",
           thread_num, &tls_var, tls_var);
    
    sleep(1);
    
    // 다른 스레드가 바꿔도 내 값은 유지
    printf("Thread %d: TLS still %d\n",
           thread_num, tls_var);
    
    return NULL;
}

// TLS 구현 원리
struct pthread {
    void* tcb;           // Thread Control Block
    void* tls_area;      // TLS 데이터 영역
    // ...
};

// 각 스레드는 %fs (x86_64) 레지스터가 자신의 TLS를 가리킴
// mov %fs:0x10, %rax  // TLS 변수 접근
```

### TLS 메모리 레이아웃

```
Process Virtual Memory:
┌─────────────────────────────┐
│        Shared Code          │
├─────────────────────────────┤
│        Shared Data          │
├─────────────────────────────┤
│        Shared Heap          │
├─────────────────────────────┤
│   Thread 1 Stack            │
│   ┌───────────────┐         │
│   │ TLS Block 1   │ ← %fs:0 │
│   └───────────────┘         │
├─────────────────────────────┤
│   Thread 2 Stack            │
│   ┌───────────────┐         │
│   │ TLS Block 2   │ ← %fs:0 │
│   └───────────────┘         │
└─────────────────────────────┘
```

## COW 페이지와 실제 공유

```c
// COW 동작 확인
void demonstrate_cow() {
    // 1MB 배열
    static char big_array[1024*1024] = {0};
    
    printf("Before fork - RSS: ");
    system("grep VmRSS /proc/self/status");
    
    pid_t pid = fork();
    
    if (pid == 0) {
        // 자식: 읽기만 하면 물리 메모리 공유
        printf("Child after fork - RSS: ");
        system("grep VmRSS /proc/self/status");
        
        int sum = 0;
        for (int i = 0; i < sizeof(big_array); i++) {
            sum += big_array[i];  // 읽기: COW 유지
        }
        
        printf("Child after read - RSS: ");
        system("grep VmRSS /proc/self/status");
        
        // 쓰기: COW 깨짐
        big_array[0] = 1;
        
        printf("Child after write - RSS: ");
        system("grep VmRSS /proc/self/status");
        // RSS 증가!
        
        exit(0);
    }
    
    wait(NULL);
}
```

### 페이지 폴트 추적

```c
// perf로 페이지 폴트 모니터링
void monitor_page_faults() {
    system("perf stat -e page-faults,minor-faults,major-faults ./test_program");
}

// 커널 내부: 페이지 폴트 핸들러
static int do_cow_fault(struct vm_fault *vmf) {
    // 1. 새 페이지 할당
    new_page = alloc_page();
    
    // 2. 기존 페이지 내용 복사
    copy_user_page(new_page, old_page);
    
    // 3. 페이지 테이블 업데이트
    set_pte(vmf->pte, new_page | VM_WRITE);
    
    // 4. TLB 플러시
    flush_tlb_page(vmf->vma, vmf->address);
}
```

## 공유 메모리: 명시적 공유

### System V 공유 메모리

```c
// 프로세스 간 명시적 메모리 공유
int setup_sysv_shm() {
    // 1. 공유 메모리 생성
    int shmid = shmget(IPC_PRIVATE, 1024*1024, 
                       IPC_CREAT | 0666);
    
    // 2. 프로세스 1: attach
    void* addr1 = shmat(shmid, NULL, 0);
    
    pid_t pid = fork();
    if (pid == 0) {
        // 3. 프로세스 2: 같은 물리 메모리 매핑
        void* addr2 = shmat(shmid, NULL, 0);
        
        // addr1과 addr2는 다른 가상 주소
        // 하지만 같은 물리 메모리!
        *(int*)addr2 = 42;
        exit(0);
    }
    
    wait(NULL);
    printf("Parent sees: %d\n", *(int*)addr1);  // 42
    
    // 정리
    shmdt(addr1);
    shmctl(shmid, IPC_RMID, NULL);
}
```

### POSIX 공유 메모리

```c
// 더 현대적인 방식
int setup_posix_shm() {
    // 1. 공유 메모리 객체 생성
    int fd = shm_open("/myshm", O_CREAT | O_RDWR, 0666);
    ftruncate(fd, 1024*1024);
    
    // 2. 메모리 매핑
    void* addr = mmap(NULL, 1024*1024,
                     PROT_READ | PROT_WRITE,
                     MAP_SHARED, fd, 0);
    
    // 이제 다른 프로세스도 같은 이름으로 접근 가능
    // shm_open("/myshm", O_RDWR, 0666);
}
```

## mmap: 파일과 메모리의 융합

```c
// 파일 매핑: 같은 파일 = 자동 공유
void demonstrate_file_mapping() {
    int fd = open("shared.dat", O_RDWR | O_CREAT, 0666);
    ftruncate(fd, 4096);
    
    // 프로세스 1: 파일 매핑
    void* map1 = mmap(NULL, 4096,
                     PROT_READ | PROT_WRITE,
                     MAP_SHARED, fd, 0);
    
    pid_t pid = fork();
    if (pid == 0) {
        // 프로세스 2: 같은 파일 매핑
        void* map2 = mmap(NULL, 4096,
                         PROT_READ | PROT_WRITE,
                         MAP_SHARED, fd, 0);
        
        // 자동으로 같은 물리 메모리 (Page Cache)
        strcpy((char*)map2, "Hello from child");
        
        msync(map2, 4096, MS_SYNC);  // 디스크 동기화
        exit(0);
    }
    
    wait(NULL);
    printf("Parent sees: %s\n", (char*)map1);
    
    munmap(map1, 4096);
    close(fd);
}
```

## futex: 공유 메모리 기반 동기화

```c
// futex = Fast Userspace muTEX
// 공유 메모리에서만 의미 있음

int futex_var = 0;  // 공유 메모리에 위치

void futex_wait(int* addr, int expected) {
    // 커널에 진입하기 전 사용자 공간에서 체크
    if (*addr != expected) return;
    
    // 값이 expected면 대기
    syscall(SYS_futex, addr, FUTEX_WAIT, expected, NULL, NULL, 0);
}

void futex_wake(int* addr) {
    // 대기 중인 스레드 깨우기
    syscall(SYS_futex, addr, FUTEX_WAKE, 1, NULL, NULL, 0);
}

// pthread_mutex는 내부적으로 futex 사용
struct pthread_mutex {
    int __lock;      // futex 변수
    // ...
};
```

## NUMA와 메모리 친화도

```c
// NUMA 시스템에서 메모리 할당 위치 제어
void numa_aware_allocation() {
    // CPU 0-7: Node 0
    // CPU 8-15: Node 1
    
    // 현재 CPU 확인
    int cpu = sched_getcpu();
    int node = cpu / 8;
    
    // Node별 메모리 할당
    void* local_mem = numa_alloc_onnode(1024*1024, node);
    void* remote_mem = numa_alloc_onnode(1024*1024, !node);
    
    // 접근 시간 측정
    clock_t start = clock();
    memset(local_mem, 0, 1024*1024);
    clock_t local_time = clock() - start;
    
    start = clock();
    memset(remote_mem, 0, 1024*1024);
    clock_t remote_time = clock() - start;
    
    printf("Local: %ld, Remote: %ld\n", 
           local_time, remote_time);
    // Remote가 약 20-30% 느림
}
```

## Huge Pages: 대용량 메모리 최적화

```c
// 2MB/1GB Huge Pages 사용
void* allocate_huge_pages() {
    // 명시적 Huge Page
    void* addr = mmap(NULL, 2*1024*1024,
                     PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB,
                     -1, 0);
    
    // THP (Transparent Huge Pages)
    void* normal = mmap(NULL, 2*1024*1024,
                       PROT_READ | PROT_WRITE,
                       MAP_PRIVATE | MAP_ANONYMOUS,
                       -1, 0);
    
    // 힌트: 병합 권장
    madvise(normal, 2*1024*1024, MADV_HUGEPAGE);
    
    return addr;
}

// 페이지 테이블 항목 감소:
// 일반: 512개 (4KB * 512 = 2MB)
// Huge: 1개 (2MB * 1)
```

## 메모리 보호와 시그널

```c
// 메모리 보호 위반 처리
void setup_memory_protection() {
    // SIGSEGV 핸들러 등록
    struct sigaction sa;
    sa.sa_sigaction = segv_handler;
    sa.sa_flags = SA_SIGINFO;
    sigaction(SIGSEGV, &sa, NULL);
    
    // 읽기 전용 페이지
    void* readonly = mmap(NULL, 4096,
                         PROT_READ,
                         MAP_PRIVATE | MAP_ANONYMOUS,
                         -1, 0);
    
    // 쓰기 시도 → SIGSEGV
    *(int*)readonly = 42;
}

void segv_handler(int sig, siginfo_t* info, void* context) {
    printf("Segfault at %p\n", info->si_addr);
    
    // 접근 타입
    if (info->si_code == SEGV_MAPERR) {
        printf("Address not mapped\n");
    } else if (info->si_code == SEGV_ACCERR) {
        printf("Permission denied\n");
    }
    
    // 페이지 권한 변경으로 복구 가능
    mprotect(info->si_addr, 4096, PROT_READ | PROT_WRITE);
}
```

## 실전: 메모리 공유 디버깅

```bash
# 공유 메모리 세그먼트 확인
$ ipcs -m
------ Shared Memory Segments --------
key        shmid      owner      perms      bytes
0x00000000 32768      user       666        1048576

# 프로세스의 메모리 매핑 확인
$ pmap -X <pid>
Address           Perm   Offset Device    Inode    Size    Rss   Pss Referenced
7f8a2c000000      rw-p 00000000  00:00        0    8192      8     4          8

# 공유 페이지 확인 (Pss < Rss면 공유 중)
```

## 정리: 공유와 격리의 스펙트럼

**완전 격리 (별도 프로세스)**
- 독립 mm_struct
- 독립 페이지 테이블
- COW로 초기 복사

**부분 공유 (공유 메모리)**
- 독립 mm_struct
- 특정 VMA만 공유
- 명시적 동기화 필요

**완전 공유 (스레드)**
- 같은 mm_struct
- 같은 페이지 테이블
- 스택과 TLS만 분리

이 이해가 중요한 이유:
1. **성능 최적화**: 공유 수준에 따른 오버헤드
2. **동기화 전략**: futex vs 세마포어
3. **보안**: 격리 수준 선택
4. **디버깅**: 메모리 문제 추적

다음 편에서는 스케줄링, 시그널, 동기화의 차이를 살펴보겠습니다.

## 관련 문서

- [Process vs Thread 심화 1: Linux의 충격적 진실 - 모든 것은 clone()이다](process-vs-thread-1.md)
- [Process vs Thread 심화 3: 스케줄링, 시그널, 그리고 실전 선택 가이드](process-vs-thread-3.md)
- [Linux 스케줄링 완벽 가이드 1: 스케줄링의 진화와 기본 개념](linux-scheduling-1.md)