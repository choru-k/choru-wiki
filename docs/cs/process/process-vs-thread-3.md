---
tags:
  - Process
  - Thread
  - Scheduling
  - Signals
  - Synchronization
  - Performance
---

# Process vs Thread 심화 (3): 스케줄링, 시그널, 그리고 실전 선택 가이드

## 들어가며

앞선 두 편에서 프로세스와 스레드가 커널 레벨에서는 모두 task이며, 메모리 공유 수준만 다르다는 것을 확인했습니다. 이번 편에서는 스케줄링과 시그널 처리의 차이, 그리고 실전에서 언제 무엇을 선택해야 하는지 다루겠습니다.

## Linux 스케줄러: CFS (Completely Fair Scheduler)

```c
// kernel/sched/fair.c
struct sched_entity {
    struct load_weight load;       // 가중치
    struct rb_node run_node;       // 레드블랙 트리 노드
    u64 exec_start;                // 실행 시작 시간
    u64 sum_exec_runtime;          // 총 실행 시간
    u64 vruntime;                  // 가상 실행 시간
    u64 prev_sum_exec_runtime;
};

// 모든 task는 독립적으로 스케줄링
// 프로세스/스레드 구분 없음!
```

### vruntime: 공정성의 핵심

```c
// 실험: 프로세스 vs 스레드 스케줄링
void demonstrate_scheduling() {
    // 케이스 1: 멀티프로세스
    for (int i = 0; i < 4; i++) {
        if (fork() == 0) {
            // 각 프로세스가 CPU 25% 획득
            while (1) { /* CPU 집중 작업 */ }
        }
    }
    
    // 케이스 2: 멀티스레드
    for (int i = 0; i < 4; i++) {
        pthread_create(&thread[i], NULL, [](void*) -> void* {
            // 각 스레드도 CPU 25% 획득
            while (1) { /* CPU 집중 작업 */ }
        }, NULL);
    }
    
    // 커널 관점: 둘 다 4개의 task
    // 동일한 CPU 시간 할당!
}
```

### 스케줄링 정책과 우선순위

```c
// 스케줄링 정책 설정
void set_scheduling_policy() {
    struct sched_param param;
    
    // 실시간 정책 (높은 우선순위)
    param.sched_priority = 50;
    pthread_setschedparam(pthread_self(), SCHED_FIFO, &param);
    
    // 일반 정책
    param.sched_priority = 0;
    pthread_setschedparam(pthread_self(), SCHED_OTHER, &param);
    
    // Nice 값 조정 (일반 정책에서만)
    nice(10);  // 낮은 우선순위
    
    // 특정 TID에 적용
    pid_t tid = syscall(SYS_gettid);
    sched_setscheduler(tid, SCHED_BATCH, &param);
}

// 정책별 특성:
// SCHED_OTHER (CFS): 일반 태스크, nice 값 사용
// SCHED_BATCH: CPU 집중, 낮은 우선순위
// SCHED_IDLE: 매우 낮은 우선순위
// SCHED_FIFO: 실시간, 선입선출
// SCHED_RR: 실시간, 라운드 로빈
// SCHED_DEADLINE: 데드라인 기반
```

## CPU 친화도 (Affinity)

```c
// CPU 친화도 설정
void manage_cpu_affinity() {
    cpu_set_t cpuset;
    
    // 프로세스 전체 설정
    CPU_ZERO(&cpuset);
    CPU_SET(0, &cpuset);
    CPU_SET(1, &cpuset);
    sched_setaffinity(getpid(), sizeof(cpuset), &cpuset);
    
    // 특정 스레드만 설정
    pthread_t thread;
    pthread_create(&thread, NULL, worker, NULL);
    
    CPU_ZERO(&cpuset);
    CPU_SET(2, &cpuset);
    pthread_setaffinity_np(thread, sizeof(cpuset), &cpuset);
    
    // 확인
    sched_getaffinity(0, sizeof(cpuset), &cpuset);
    for (int i = 0; i < CPU_SETSIZE; i++) {
        if (CPU_ISSET(i, &cpuset)) {
            printf("CPU %d is set, ", i);
        }
    }
}
```

### NUMA 인식 스케줄링

```c
// NUMA 노드별 스레드 배치
void numa_aware_threading() {
    int num_nodes = numa_num_configured_nodes();
    
    for (int node = 0; node < num_nodes; node++) {
        pthread_t thread;
        pthread_attr_t attr;
        pthread_attr_init(&attr);
        
        // CPU 세트 생성
        cpu_set_t cpuset;
        CPU_ZERO(&cpuset);
        
        // 해당 노드의 CPU들만 설정
        struct bitmask* cpus = numa_allocate_cpumask();
        numa_node_to_cpus(node, cpus);
        
        for (int cpu = 0; cpu < numa_num_configured_cpus(); cpu++) {
            if (numa_bitmask_isbitset(cpus, cpu)) {
                CPU_SET(cpu, &cpuset);
            }
        }
        
        pthread_attr_setaffinity_np(&attr, sizeof(cpuset), &cpuset);
        pthread_create(&thread, &attr, worker, (void*)(long)node);
    }
}
```

## 시그널: 프로세스 vs 스레드의 진짜 차이

### 시그널 전달 규칙

```c
// 시그널 타입별 전달 대상
void signal_delivery_rules() {
    // 1. 프로세스 전체 시그널 (kill)
    kill(getpid(), SIGUSR1);
    // → 아무 스레드 하나가 받음 (블록 안 한 스레드 중)
    
    // 2. 특정 스레드 시그널 (pthread_kill)
    pthread_kill(thread, SIGUSR1);
    // → 해당 스레드만 받음
    
    // 3. 특정 task 시그널 (tgkill)
    pid_t tid = get_thread_tid();
    tgkill(getpid(), tid, SIGUSR1);
    // → 해당 TID만 받음
}

// 시그널 마스크는 스레드별
void* thread_func(void* arg) {
    sigset_t mask;
    sigemptyset(&mask);
    sigaddset(&mask, SIGUSR1);
    
    // 이 스레드만 SIGUSR1 블록
    pthread_sigmask(SIG_BLOCK, &mask, NULL);
    
    // 다른 스레드는 여전히 받을 수 있음
}
```

### 시그널 핸들러 공유

```c
// 시그널 핸들러는 프로세스 전체 공유
void setup_signal_handlers() {
    struct sigaction sa;
    sa.sa_handler = handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = 0;
    
    // 한 스레드가 설정하면 모든 스레드에 적용
    sigaction(SIGUSR1, &sa, NULL);
    
    // 하지만 시그널 마스크는 스레드별!
    pthread_t thread1, thread2;
    
    // Thread 1: SIGUSR1 블록
    pthread_create(&thread1, NULL, [](void*) -> void* {
        sigset_t mask;
        sigemptyset(&mask);
        sigaddset(&mask, SIGUSR1);
        pthread_sigmask(SIG_BLOCK, &mask, NULL);
        
        pause();  // SIGUSR1 못 받음
        return NULL;
    }, NULL);
    
    // Thread 2: SIGUSR1 허용
    pthread_create(&thread2, NULL, [](void*) -> void* {
        pause();  // SIGUSR1 받을 수 있음
        return NULL;
    }, NULL);
    
    // 프로세스에 시그널 보내기
    kill(getpid(), SIGUSR1);  // Thread 2가 받음
}
```

### 동기 vs 비동기 시그널

```c
// 동기 시그널: 특정 스레드의 행동으로 발생
void sync_signals() {
    // SIGSEGV, SIGFPE, SIGILL 등
    // 항상 원인 스레드가 받음
    
    pthread_create(&thread, NULL, [](void*) -> void* {
        // 이 스레드만 SIGSEGV 받음
        *(int*)0 = 42;  // Segmentation fault
        return NULL;
    }, NULL);
}

// 비동기 시그널: 외부에서 전달
void async_signals() {
    // SIGTERM, SIGINT, SIGUSR1 등
    // 블록 안 한 아무 스레드가 받음
    
    // 전용 시그널 처리 스레드
    pthread_t sig_thread;
    pthread_create(&sig_thread, NULL, [](void*) -> void* {
        sigset_t set;
        int sig;
        
        // 모든 시그널 대기
        sigfillset(&set);
        
        while (1) {
            sigwait(&set, &sig);  // 동기적으로 대기
            printf("Signal %d received, ", sig);
            handle_signal(sig);
        }
        return NULL;
    }, NULL);
    
    // 다른 모든 스레드는 시그널 블록
    sigset_t mask;
    sigfillset(&mask);
    pthread_sigmask(SIG_BLOCK, &mask, NULL);
}
```

## 동기화 메커니즘 비교

### 프로세스 간 동기화

```c
// 1. System V 세마포어
int setup_sysv_sem() {
    int semid = semget(IPC_PRIVATE, 1, IPC_CREAT | 0666);
    
    struct sembuf op;
    op.sem_num = 0;
    op.sem_op = -1;  // P operation
    op.sem_flg = 0;
    semop(semid, &op, 1);
    
    // Critical section
    
    op.sem_op = 1;   // V operation
    semop(semid, &op, 1);
}

// 2. POSIX 세마포어 (named)
sem_t* setup_posix_sem() {
    sem_t* sem = sem_open("/mysem", O_CREAT, 0666, 1);
    
    sem_wait(sem);
    // Critical section
    sem_post(sem);
    
    return sem;
}

// 3. 파일 락
void file_locking() {
    int fd = open("lockfile", O_RDWR | O_CREAT, 0666);
    
    struct flock fl;
    fl.l_type = F_WRLCK;
    fl.l_whence = SEEK_SET;
    fl.l_start = 0;
    fl.l_len = 0;
    
    fcntl(fd, F_SETLKW, &fl);  // 락 획득
    // Critical section
    fl.l_type = F_UNLCK;
    fcntl(fd, F_SETLK, &fl);   // 락 해제
}
```

### 스레드 간 동기화

```c
// 1. Mutex (빠름)
pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;

void mutex_example() {
    pthread_mutex_lock(&mutex);
    // Critical section
    pthread_mutex_unlock(&mutex);
}

// 2. Spinlock (매우 짧은 구간)
pthread_spinlock_t spinlock;

void spinlock_example() {
    pthread_spin_init(&spinlock, PTHREAD_PROCESS_PRIVATE);
    
    pthread_spin_lock(&spinlock);
    // Very short critical section
    pthread_spin_unlock(&spinlock);
}

// 3. RWLock (읽기 많은 경우)
pthread_rwlock_t rwlock = PTHREAD_RWLOCK_INITIALIZER;

void rwlock_example() {
    // 여러 reader 동시 가능
    pthread_rwlock_rdlock(&rwlock);
    // Read data
    pthread_rwlock_unlock(&rwlock);
    
    // Writer는 독점
    pthread_rwlock_wrlock(&rwlock);
    // Write data
    pthread_rwlock_unlock(&rwlock);
}
```

### 성능 비교

```c
// 벤치마크: 동기화 오버헤드
void benchmark_sync() {
    const int iterations = 1000000;
    struct timespec start, end;
    
    // 1. 프로세스 + System V 세마포어
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int i = 0; i < iterations; i++) {
        sem_wait(sysv_sem);
        counter++;
        sem_post(sysv_sem);
    }
    clock_gettime(CLOCK_MONOTONIC, &end);
    printf("Process + SysV: %ld ns/op, ", 
           time_diff(start, end) / iterations);
    
    // 2. 스레드 + Mutex
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int i = 0; i < iterations; i++) {
        pthread_mutex_lock(&mutex);
        counter++;
        pthread_mutex_unlock(&mutex);
    }
    clock_gettime(CLOCK_MONOTONIC, &end);
    printf("Thread + Mutex: %ld ns/op, ",
           time_diff(start, end) / iterations);
    
    // 결과:
    // Process + SysV: ~500 ns/op
    // Thread + Mutex: ~30 ns/op
    // Thread + Spinlock: ~20 ns/op (no contention)
}
```

## 컨텍스트 스위칭 비용

```c
// 컨텍스트 스위칭 측정
void measure_context_switch() {
    int pipe1[2], pipe2[2];
    pipe(pipe1); pipe(pipe2);
    
    struct timespec start, end;
    const int iterations = 100000;
    
    if (fork() == 0) {
        // Child
        char buf;
        for (int i = 0; i < iterations; i++) {
            read(pipe1[0], &buf, 1);
            write(pipe2[1], "x", 1);
        }
        exit(0);
    }
    
    // Parent
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (int i = 0; i < iterations; i++) {
        write(pipe1[1], "x", 1);
        char buf;
        read(pipe2[0], &buf, 1);
    }
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    printf("Process switch: %ld ns, ",
           time_diff(start, end) / (iterations * 2));
    
    // 스레드 버전도 유사하게 측정
    // 결과:
    // Process switch: ~2000 ns
    // Thread switch: ~1500 ns
    // 차이는 TLB 플러시 여부
}
```

## 실전 선택 가이드

### 언제 프로세스를 선택하는가?

```python
# 1. 격리가 중요한 경우
def process_untrusted_code():
    # 프로세스 격리로 안전성 확보
    p = subprocess.Popen(['python', 'untrusted.py'],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE)
    # 크래시해도 메인 프로세스 안전
    
# 2. 언어/런타임이 다른 경우
def multi_language_pipeline():
    # Python → Go → C++
    p1 = subprocess.Popen(['python', 'preprocess.py'])
    p2 = subprocess.Popen(['./go-analyzer'])
    p3 = subprocess.Popen(['./cpp-renderer'])

# 3. 독립적 스케일링이 필요한 경우
def scalable_workers():
    # 워커 프로세스 수 동적 조정
    workers = []
    for i in range(cpu_count()):
        w = Process(target=worker_func)
        w.start()
        workers.append(w)
```

### 언제 스레드를 선택하는가?

```c
// 1. 대량 데이터 공유
void* process_shared_data(void* arg) {
    // 100GB 데이터셋 - 복사 불가능
    shared_dataset* data = (shared_dataset*)arg;
    process_chunk(data->chunk[thread_id]);
}

// 2. 빈번한 통신
void high_frequency_communication() {
    // 마이크로초 단위 통신
    for (int i = 0; i < 1000000; i++) {
        pthread_mutex_lock(&mutex);
        shared_queue.push(data);
        pthread_cond_signal(&cond);
        pthread_mutex_unlock(&mutex);
    }
}

// 3. 세밀한 동기화
void fine_grained_sync() {
    // Reader-Writer 패턴
    pthread_rwlock_rdlock(&rwlock);
    read_data();
    pthread_rwlock_unlock(&rwlock);
}
```

### 하이브리드 접근

```c
// 프로세스 + 스레드 조합
void hybrid_architecture() {
    // Level 1: 프로세스로 격리
    for (int i = 0; i < num_services; i++) {
        if (fork() == 0) {
            // Level 2: 스레드로 병렬화
            for (int j = 0; j < threads_per_service; j++) {
                pthread_create(&threads[j], NULL, 
                              service_worker, NULL);
            }
            // 서비스 실행
            run_service(i);
            exit(0);
        }
    }
}

// 예: Nginx
// - Master 프로세스: 관리
// - Worker 프로세스: 격리
// - Worker 내 이벤트 루프: 동시성

// 예: Chrome
// - Browser 프로세스: UI
// - Renderer 프로세스: 탭별 격리  
// - Renderer 내 스레드: JS, Layout, Paint
```

## 모니터링과 디버깅

### 프로세스/스레드 추적

```bash
# 프로세스 트리
$ pstree -p <pid>
nginx(1234)─┬─nginx(1235)
            ├─nginx(1236)
            └─nginx(1237)

# 스레드 포함
$ pstree -p -t <pid>
java(1234)─┬─{java}(1235)
           ├─{java}(1236)
           ├─{GC}(1237)
           └─{Compiler}(1238)

# CPU 사용률 (스레드별)
$ top -H -p <pid>

# 시스템 콜 추적
$ strace -f -p <pid>  # 모든 자식 포함
$ strace -f -e clone  # clone 호출만

# 스케줄링 추적
$ perf sched record -p <pid>
$ perf sched latency
```

### 성능 프로파일링

```bash
# 컨텍스트 스위치 측정
$ perf stat -e context-switches,cpu-migrations ./app

# 캐시 미스 비교
$ perf stat -e cache-misses,cache-references ./multiprocess
$ perf stat -e cache-misses,cache-references ./multithread

# 스케줄링 지연
$ perf sched timehist
```

## 정리: 선택 체크리스트

### 프로세스 선택

✅**격리 필요**: 크래시, 메모리 누수 영향 최소화
✅**보안 중요**: 권한 분리, 샌드박싱
✅**다른 언어**: Python + Go + Rust
✅**독립 배포**: 마이크로서비스
✅**리소스 제한**: cgroup 개별 적용

### 스레드 선택

✅**메모리 공유**: 대용량 데이터 처리
✅**빈번한 통신**: 마이크로초 단위 동기화
✅**동일 코드베이스**: 같은 언어/런타임
✅**낮은 지연**: 컨텍스트 스위치 최소화
✅**리소스 효율**: 메모리 footprint 최소화

### 하이브리드 선택

✅**계층적 격리**: 서비스별 프로세스 + 내부 스레드
✅**탄력적 확장**: 프로세스 수 조정 + 스레드 풀
✅**장애 격리**: 핵심 기능 프로세스 분리

## 마치며

Linux에서 프로세스와 스레드는 근본적으로 같은 존재입니다. 차이는 공유하는 리소스의 종류와 양뿐입니다. 이 이해를 바탕으로:

1.**커널 메커니즘 이해**: clone(), task_struct, 스케줄링
2.**메모리 모델 파악**: mm_struct, VMA, 페이지 테이블
3.**동기화 비용 인식**: futex vs 세마포어
4.**적절한 도구 선택**: 격리 vs 공유의 트레이드오프

"은총알은 없다" - 상황에 맞는 최적의 선택이 있을 뿐입니다.

## 관련 문서

- [Process vs Thread 심화 1: Linux의 충격적 진실 - 모든 것은 clone()이다](process-vs-thread-1.md)
- [Process vs Thread 심화 2: 메모리 공유와 격리의 실제 구현](process-vs-thread-2.md)
- [Linux 스케줄링 완벽 가이드 1: 스케줄링의 진화와 기본 개념](linux-scheduling-1.md)
- [Linux 인터럽트 처리의 모든 것 1: 인터럽트 이해하기](linux-interrupt-1.md)
