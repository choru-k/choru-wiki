---
tags:
  - EventLoop
  - Concurrency
  - Async
  - Performance
  - libuv
  - epoll
---

# Chapter 8-2: 이벤트 루프와 동시성 모델

## 🎯 이 문서를 읽고 나면 얻을 수 있는 것들

이 문서를 다 읽고 나면, 여러분은 다음과 같은 능력을 갖추게 됩니다:

1. **"우리 서버가 갑자기 느려졌어요!"** - Event loop blocking을 찾아내고 해결할 수 있습니다
2. **"Node.js는 싱글 스레드인데 어떻게 동시에 처리하죠?"** - 이벤트 기반 동시성의 마법을 설명할 수 있습니다
3. **"epoll이 뭔가요? select랑 뭐가 다른가요?"** - OS 레벨 I/O 멀티플렉싱의 진화를 이해합니다
4. **"Nginx가 Apache보다 빠른 이유가 뭔가요?"** - 아키텍처 차이와 트레이드오프를 분석할 수 있습니다

## 1. 이벤트 루프의 탄생: C10K Problem의 해결사

### 1.1 The C10K Problem: 인터넷 성장의 병목

```text
때는 1999년... 닷컴 버블의 정점...
```

Dan Kegel이 "The C10K Problem"이라는 논문을 발표합니다. 당시 웹 서버들은 동시 연결 10,000개(C10K)를 처리하는 데 심각한 어려움을 겪고 있었죠.

**전통적인 접근법의 문제점:**

```c
// Apache의 전통적인 prefork 모델
void handle_client(int client_fd) {
    // 각 연결마다 프로세스 fork!
    pid_t pid = fork();
    if (pid == 0) {
        // 자식 프로세스: 클라이언트 처리
        char buffer[1024];
        read(client_fd, buffer, sizeof(buffer));  // 블로킹!
        process_request(buffer);
        write(client_fd, response, response_len);
        exit(0);
    }
}

// 문제점:
// - 프로세스당 메모리: ~2MB
// - 10,000 연결 = 20GB RAM!
// - Context switching 지옥
// - Fork 오버헤드
```

실제로 제가 2010년에 스타트업에서 일할 때, Apache 서버가 동시 접속자 500명만 넘어도 서버가 죽는 경험을 했습니다. RAM은 충분했는데도요! 문제는 프로세스 컨텍스트 스위칭이었습니다.

### 1.2 Event-Driven의 등장: Nginx의 혁명

```c
// Nginx의 이벤트 기반 모델 (단순화)
void event_loop() {
    int epoll_fd = epoll_create1(0);
    struct epoll_event events[MAX_EVENTS];

    while (1) {
        // 모든 이벤트를 한 번에 기다림!
        int n = epoll_wait(epoll_fd, events, MAX_EVENTS, -1);

        for (int i = 0; i < n; i++) {
            if (events[i].data.fd == listen_sock) {
                // 새 연결
                accept_connection();
            } else if (events[i].events & EPOLLIN) {
                // 읽을 데이터 있음
                handle_read(events[i].data.fd);
            } else if (events[i].events & EPOLLOUT) {
                // 쓸 준비 됨
                handle_write(events[i].data.fd);
            }
        }
    }
}

// 장점:
// - 스레드 1개로 수만 개 연결 처리
// - 연결당 메모리: ~10KB (200배 절약!)
// - Context switching 최소화
```

## 2. 이벤트 루프 내부 구조: libuv의 마법

### 2.1 Node.js와 libuv: 6단계의 정교한 춤

Node.js의 이벤트 루프는 사실 6개의 phase로 구성된 정교한 시스템입니다. 마치 6막으로 구성된 연극처럼요:

```javascript
// 이벤트 루프의 6단계
   ┌───────────────────────────┐
┌─>│           timers          │ <-- setTimeout, setInterval
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │ <-- I/O 콜백 (일부 시스템 작업)
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │       idle, prepare       │ <-- 내부용
│  └─────────────┬─────────────┘      ┌───────────────┐
│  ┌─────────────┴─────────────┐      │   incoming:   │
│  │           poll            │<─────┤  connections, │
│  └─────────────┬─────────────┘      │   data, etc.  │
│  ┌─────────────┴─────────────┐      └───────────────┘
│  │           check           │ <-- setImmediate
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──┤      close callbacks      │ <-- socket.on('close', ...)
   └───────────────────────────┘
```

**각 Phase의 실제 동작을 코드로 보기:**

```javascript
// Phase 1: Timers
console.log('Start');
setTimeout(() => console.log('Timer 1'), 0);
setTimeout(() => console.log('Timer 2'), 0);

// Phase 4: Poll (I/O)
fs.readFile('file.txt', () => {
    console.log('File read');

    // Microtask (즉시 실행)
    Promise.resolve().then(() => console.log('Promise in I/O'));

    // Next tick (현재 phase 끝나고 즉시)
    process.nextTick(() => console.log('NextTick in I/O'));

    // Phase 5: Check
    setImmediate(() => console.log('Immediate in I/O'));

    // Phase 1: Timer (다음 루프)
    setTimeout(() => console.log('Timer in I/O'), 0);
});

// Phase 5: Check
setImmediate(() => console.log('Immediate'));

// 실행 순서:
// Start
// Timer 1
// Timer 2
// Immediate
// File read
// NextTick in I/O    <-- nextTick이 최우선!
// Promise in I/O     <-- Promise가 그 다음
// Immediate in I/O   <-- 같은 phase
// Timer in I/O       <-- 다음 루프의 timer phase
```

### 2.2 Microtask vs Macrotask: 우선순위 전쟁

제가 처음 이 개념을 접했을 때, "도대체 왜 이렇게 복잡하게 만들었을까?"라고 생각했습니다. 하지만 실제 버그를 디버깅하면서 깨달았죠. 이 복잡성이 성능과 예측 가능성 사이의 절묘한 균형이라는 것을!

```javascript
// 실제 프로덕션 버그 사례
class EventEmitter {
    emit(event, data) {
        const handlers = this.handlers[event];

        // 버그가 있는 코드
        handlers.forEach(handler => {
            setTimeout(() => handler(data), 0);  // "비동기"로 만들기
        });
    }
}

// 문제: setTimeout은 macrotask라서 다른 I/O보다 늦게 실행될 수 있음!
// 해결책:
class BetterEventEmitter {
    emit(event, data) {
        const handlers = this.handlers[event];

        handlers.forEach(handler => {
            // Microtask 사용 - 현재 작업 직후 실행 보장
            queueMicrotask(() => handler(data));
            // 또는 Promise.resolve().then(() => handler(data));
        });
    }
}
```

### 2.3 Event Loop Blocking 탐지하기

**실전 모니터링 코드:**

```javascript
// Event Loop Lag 측정
let lastCheck = Date.now();

setInterval(() => {
    const now = Date.now();
    const delay = now - lastCheck - 1000;  // 1초마다 체크

    if (delay > 50) {  // 50ms 이상 지연?
        console.warn(`Event loop blocked for ${delay}ms`);

        // 어떤 작업이 블로킹했는지 추적
        if (global.currentOperation) {
            console.warn(`Blocked by: ${global.currentOperation}`);
        }
    }

    lastCheck = now;
}, 1000);

// 느린 작업 추적
function trackSlowOperation(name, fn) {
    return async function(...args) {
        global.currentOperation = name;
        const start = Date.now();

        try {
            return await fn.apply(this, args);
        } finally {
            const duration = Date.now() - start;
            if (duration > 100) {
                console.warn(`Slow operation ${name}: ${duration}ms`);
            }
            global.currentOperation = null;
        }
    };
}

// 사용 예
const processData = trackSlowOperation('processData', async (data) => {
    // CPU 집약적 작업
    for (let i = 0; i < 1000000; i++) {
        // 복잡한 계산
    }
});
```

## 3. I/O Multiplexing의 진화: select에서 io_uring까지

### 3.1 select: 할아버지의 방식

```c
// select의 한계 (1983년~)
fd_set readfds;
FD_ZERO(&readfds);

// 문제 1: FD_SETSIZE 제한 (보통 1024)
for (int fd = 0; fd < num_clients; fd++) {
    FD_SET(client_fds[fd], &readfds);
}

// 문제 2: O(n) 스캔
select(max_fd + 1, &readfds, NULL, NULL, NULL);

// 문제 3: 매번 다시 설정
for (int fd = 0; fd < num_clients; fd++) {
    if (FD_ISSET(client_fds[fd], &readfds)) {
        handle_client(client_fds[fd]);
    }
}

// 성능: 1000개 연결에서 CPU 90% 사용!
```

### 3.2 epoll: Linux의 게임 체인저

```c
// epoll의 혁신 (2002년~)
int epoll_fd = epoll_create1(0);

// Level-triggered vs Edge-triggered
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLET;  // Edge-triggered
ev.data.fd = client_fd;

// O(1) 등록
epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &ev);

// O(1) 대기, 준비된 것만 반환!
struct epoll_event events[MAX_EVENTS];
int n = epoll_wait(epoll_fd, events, MAX_EVENTS, -1);

// 성능: 100,000개 연결에서도 CPU 10% 사용!
```

**실제 벤치마크 결과 (제 경험):**

```python
# 10,000 동시 연결 처리 테스트
# AWS c5.xlarge 인스턴스 (4 vCPU, 8GB RAM)

# select 기반 서버
CPU: 95%
Memory: 2GB
Latency p99: 500ms
Throughput: 5,000 req/s

# epoll 기반 서버
CPU: 15%
Memory: 500MB
Latency p99: 50ms
Throughput: 50,000 req/s

# 10배 성능 향상!
```

### 3.3 io_uring: 미래의 I/O (2019년~)

Linux 5.1에서 도입된 io_uring은 완전히 새로운 패러다임입니다:

```c
// io_uring: 진정한 비동기 I/O
struct io_uring ring;
io_uring_queue_init(256, &ring, 0);

// Submission Queue Entry
struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
io_uring_prep_read(sqe, fd, buffer, sizeof(buffer), 0);
sqe->user_data = (uint64_t)connection;  // 컨텍스트 저장

// 배치 제출 (시스템 콜 1번!)
io_uring_submit(&ring);

// Completion Queue Entry
struct io_uring_cqe *cqe;
io_uring_wait_cqe(&ring, &cqe);

// Zero-copy, zero-syscall in fast path!
connection = (Connection*)cqe->user_data;
process_data(connection, cqe->res);

// 성능: epoll 대비 2-3배 향상!
```

## 4. Reactor vs Proactor: 두 가지 패턴의 대결

### 4.1 Reactor 패턴: "준비되면 알려줘"

Node.js, Nginx, Redis가 사용하는 패턴:

```javascript
// Reactor 패턴 구현 - "I/O 준비되면 알려주는" 비동기 이벤트 처리 모델
// Node.js, Nginx, Redis 등의 핵심 아키텍처로 epoll/kqueue 기반으로 고성능 달성
class Reactor {
    constructor() {
        // 파일 디스크립터별 이벤트 핸들러 매핑 테이블
        this.handlers = new Map();  // fd -> handler 매핑
        // Linux epoll 인터페이스 - O(1) 성능으로 대량 동시 연결 처리 가능
        this.epoll = new Epoll();   // epoll 인스턴스 생성
    }

    // 이벤트 핸들러 등록 - 특정 파일 디스크립터에 대한 이벤트 모니터링 시작
    registerHandler(fd, events, handler) {
        // 1. 핸들러를 내부 맅에 저장 - O(1) 룩업 속도
        this.handlers.set(fd, handler);

        // 2. epoll에 파일 디스크립터와 관심 이벤트 등록
        // 예: EPOLLIN (읽기 가능), EPOLLOUT (쓰기 가능), EPOLLET (Edge-triggered)
        this.epoll.add(fd, events);
    }

    // 메인 이벤트 루프 - 이곳이 모든 비동기 이벤트 처리의 중심
    run() {
        while (true) {  // 무한 루프 - 서버 종료시까지 계속 실행
            // epoll_wait() 호출 - I/O 이벤트가 준비될 때까지 블로킹
            // 이 한 줄이 대량 동시 연결의 핵심 - select()의 O(n) 한계를 O(1)로 해결
            const events = this.epoll.wait();

            // 준비된 이벤트 순차적 처리 - 각 이벤트는 비동기로 바로 처리 가능
            for (const event of events) {
                // 해당 파일 디스크립터에 대한 핸들러 찾기
                const handler = this.handlers.get(event.fd);

                // 읽기 가능 이벤트 처리 - 데이터가 도착했다는 신호
                if (event.readable) {
                    // 실제 I/O 작업 수행 - 비동기이지만 데이터가 준비된 상태라 빠름
                    const data = fs.readSync(event.fd);  // 여기서 데이터 읽기!
                    // 사용자 정의 비즈니스 로직 실행
                    handler.handleRead(data);
                }

                // 쓰기 가능 이벤트 처리 - 소켓 버퍼에 공간이 생겼다는 신호
                if (event.writable) {
                    // 예비된 데이터를 전송하거나 연결 완료 처리
                    handler.handleWrite();
                }
            }
        }
    }
}
```

### 4.2 Proactor 패턴: "완료되면 알려줘"

Windows IOCP, io_uring이 지원하는 패턴:

```c++
// Proactor 패턴 구현 - "완료되면 알려주는" 진정한 비동기 I/O 모델
// Windows IOCP, Linux io_uring이 지원하는 최고 성능 패턴
// 핵심: OS 커널이 I/O 작업을 대신 수행하여 CPU 사용률 최소화
class Proactor {
    // 비동기 읽기 작업 요청 - I/O 작업을 OS에게 위임하고 즉시 리턴
    void asyncRead(int fd, Buffer* buffer, CompletionHandler handler) {
        // io_uring submission queue entry 준비 - 커널에게 I/O 작업 지시
        // 이 한 줄이 핵심: 애플리케이션은 I/O를 기다리지 않고 다른 작업 수행 가능
        io_uring_prep_read(sqe, fd, buffer->data, buffer->size, 0);

        // 작업 완료 시 호출될 컨텍스트 정보 저장
        // 커널이 I/O 완료 후 이 데이터를 통해 원래 컨텍스트 복구
        sqe->user_data = new Context{handler, buffer};

        // 작업을 커널에 제출 - 이제 OS가 대신 I/O 수행
        io_uring_submit(&ring);
    }

    // 메인 이벤트 루프 - 완료된 I/O 작업에 대한 결과 처리
    void run() {
        while (true) {  // 서버 수명주기 동안 계속 실행
            // 완료된 작업 대기 - completion queue에서 결과 받기
            // 중요: 여기서 블로킹되는 동안 OS가 백그라운드에서 I/O 작업 수행
            io_uring_cqe* cqe;
            io_uring_wait_cqe(&ring, &cqe);  // 완료된 I/O 작업이 있을 때까지 대기

            // 이전에 저장한 컨텍스트 정보 복구
            auto* ctx = (Context*)cqe->user_data;

            // 핵심 포인트: I/O 작업은 이미 OS가 완료! 데이터가 버퍼에 준비됨
            // Reactor와 달리 여기서는 I/O 작업 없이 바로 비즈니스 로직 처리 가능
            ctx->handler(ctx->buffer, cqe->res);  // 사용자 콜백 호출

            // 자원 정리 - 메모리 리크 방지
            delete ctx;

            // completion queue entry를 처리 완료로 표시
            io_uring_cqe_seen(&ring, cqe);
        }
    }
};
```

**두 패턴의 트레이드오프:**

| 측면 | Reactor | Proactor |
|------|---------|----------|
| 복잡도 | 단순함 | 복잡함 |
| 이식성 | 좋음 (POSIX) | 나쁨 (OS 특화) |
| 성능 | 좋음 | 최고 |
| CPU 사용 | 약간 높음 | 최소 |
| 적합한 경우 | 대부분의 웹 서버 | 고성능 DB, 게임 서버 |

## 5. Work Stealing과 M:N 스레드 모델

### 5.1 Work Stealing: 일 훔치기의 미학

Go와 Java의 ForkJoinPool이 사용하는 기법:

```go
// Go의 work stealing 스케줄러 - 수백만 goroutine을 소수 OS 스레드에서 처리하는 비밀
// 핵심 아이디어: 각 CPU 코어별로 전용 큐를 두고, 비어있으면 다른 코어에서 일을 '훔쳐온다'
type P struct {  // Processor - CPU 코어당 1개씩 존재 (보통 GOMAXPROCS = CPU 코어 수)
    runq     [256]*G  // 로컬 실행 대기열 - 각 P마다 독립적인 goroutine 큐
    runqhead uint32   // 큐 머리 인덱스 - 다음에 가져올 goroutine 위치
    runqtail uint32   // 큐 꼬리 인덱스 - 새로운 goroutine을 추가할 위치
}

// 스케줄링 심장부 - 실행할 다음 goroutine을 결정하는 핵심 알고리즘
// 성능 우선순위: 로컬 > 글로벌 > 다른 P에서 훔치기 > 네트워크 I/O
func schedule() *G {
    // 1단계: 로컬 큐에서 가져오기 - 가장 빠른 경로 (cache-local, lock-free)
    // 로컬 큐는 해당 P에서만 접근하므로 동기화 오버헤드 없음
    if g := runqget(); g != nil {
        return g  // 90% 이상의 경우가 여기서 해결됨
    }

    // 2단계: 글로벌 큐 확인 - 모든 P가 공유하는 대기열
    // 주로 새로 생성된 goroutine이나 시스템 작업들이 대기 중
    if g := globrunqget(); g != nil {
        return g
    }

    // 3단계: Work Stealing - 다른 P의 플을 배어하는 핵심 전략!
    // 전체 시스템 로드 밸런싱을 위해 바쁜 P의 작업을 유휴 P가 가져옴
    for i := 0; i < 4; i++ {  // 최대 4번만 시도 - 과도한 검색 방지
        p := allp[fastrand()%uint32(len(allp))]  // 랜덤하게 P 선택
        if g := runqsteal(p); g != nil {
            return g  // 훔치기 성공! 다른 P에서 일을 가져옴
        }
    }

    // 4단계: 네트워크 I/O 폴링 - I/O 대기 중인 goroutine 찾기
    // 비동기 I/O 작업이 완료된 goroutine이 있으면 깨우기
    if g := netpoll(); g != nil {
        return g
    }

    // 모든 경로에서 일을 찾지 못한 경우 nil 반환 (유휴 상태로 전환)
}

// runqsteal - 진짜 'Work Stealing' 실행 함수
// 다른 P의 로컬 큐에서 절반의 goroutine을 배치로 가져오는 전략
func runqsteal(p *P) *G {
    n := p.runqsize() / 2  // 절반만 훔치기 - 공정성과 캐시 효율성의 균형
    if n == 0 {
        return nil  // 빈 큐에서는 훔칠 것이 없음
    }

    // 배치 전송 전략 - 개별 전송의 오버헤드를 피하고 캐시 효율성 극대화
    batch := make([]*G, n)  // 훔쳐올 goroutine 배열 준비
    for i := 0; i < n; i++ {
        batch[i] = p.runqget()  // 대상 P에서 goroutine 하나씩 가져오기
    }

    // 내 로컬 큐에 추가 - 첨 번째를 제외한 나머지를 저장
    for _, g := range batch[1:] {
        runqput(g)  // 훔쳐온 goroutine을 내 P에 배치
    }

    return batch[0]  // 첫 번째 goroutine은 즉시 실행용으로 반환
}
```

### 5.2 M:N 모델의 실제 구현

```go
// Go의 GPM 모델 - 수백만 goroutine을 수십 OS 스레드에서 처리하는 M:N 스케줄링
// G: Goroutine (수백만 개 가능) - 경량 사용자 레벨 스레드
// P: Processor (GOMAXPROCS개, 보통 CPU 코어 수) - 논리적 스케줄링 컨텍스트
// M: Machine thread (OS 스레드) - 실제 시스템 에서 실행되는 스레드

// G 구조체 - 각 goroutine의 실행 컨텍스트 보전
type G struct {
    stack       stack   // 2KB로 시작하여 동적 증가 (최대 1GB)
                        // 일반 OS 스레드 8MB에 비해 극도로 경량
    sched       gobuf   // 레지스터 및 스택 포인터 저장 - 컨텍스트 스위칭용
    atomicstatus uint32 // goroutine 상태 (Runnable, Running, Blocked 등)
    waitreason  string  // 대기 중인 이유 (네트워크 I/O, 뮤텍스 등)
}

// M 구조체 - 실제 OS 스레드와 P 사이의 연결 개체
type M struct {
    g0      *G   // 스케줄링 전용 goroutine - 사용자 goroutine 전환용
    curg    *G   // 현재 실행 중인 사용자 goroutine
    p       *P   // 연결된 P (없으면 이 M은 유휴 상태)
    spinning bool // work stealing 중인지 표시 - 다른 P에서 일을 찾고 있는 중
    blocked  bool // 시스템 콜로 블록된 상태인지 표시
}

// P 구조체 - 논리적 프로세서, 스케줄링의 핵심 단위
type P struct {
    m       *M      // 연결된 Machine thread
    runq    [256]*G // 로컬 실행 대기열 - lock-free LIFO queue
    runqhead uint32 // 큐 머리 인덱스
    runqtail uint32 // 큐 꼬리 인덱스

    // 가비지 콜렉터 관련 - Go의 concurrent GC를 위한 전용 worker
    gcBgMarkWorker *G                  // 백그라운드 GC 마킹 작업용 goroutine
    gcMarkWorkerMode gcMarkWorkerMode  // GC 모드 (idle, dedicated, fractional)
}

// 실제 goroutine 컨텍스트 스위칭 (어셈블리 코드)
// 이 코드가 Go의 경량 스레드의 비밀 - 극도로 빠른 컨텍스트 전환
TEXT runtime·mcall(SB), NOSPLIT, $0-8
    MOVQ fn+0(FP), DI           // 호출할 함수 주소를 DI 레지스터에 저장

    // 현재 goroutine의 컨텍스트 저장 - 나중에 재개할 수 있도록 모든 레지스터 보전
    MOVQ g(CX), AX              // 현재 goroutine을 AX 레지스터에 저장
    MOVQ 0(SP), BX              // 호출자의 Program Counter 저장
    MOVQ BX, (g_sched+gobuf_pc)(AX)  // PC를 goroutine 컨텍스트에 저장
    LEAQ fn+0(FP), BX          // 호출자의 Stack Pointer 계산
    MOVQ BX, (g_sched+gobuf_sp)(AX)  // SP를 goroutine 컨텍스트에 저장

    // 스케줄링 전용 g0 스택으로 전환 - 사용자 컨텍스트에서 커널 컨텍스트로
    MOVQ g_m(AX), BX           // 현재 goroutine이 속한 M 찾기
    MOVQ m_g0(BX), SI          // M의 스케줄링 전용 goroutine g0 찾기
    MOVQ SI, g(CX)
    MOVQ (g_sched+gobuf_sp)(SI), SP

    PUSHQ AX
    MOVQ DI, DX
    MOVQ 0(DI), DI
    CALL DI
    POPQ AX
    RET
```

## 6. 실전 디버깅과 모니터링

### 6.1 Event Loop Profiling

```javascript
// Node.js에서 실제 사용하는 프로파일링 코드
const async_hooks = require('async_hooks');
const fs = require('fs');

// 비동기 작업 추적
const asyncOperations = new Map();
let activeOperations = 0;

const hook = async_hooks.createHook({
    init(asyncId, type, triggerAsyncId) {
        asyncOperations.set(asyncId, {
            type,
            triggerAsyncId,
            startTime: Date.now(),
            stack: new Error().stack
        });
        activeOperations++;
    },

    before(asyncId) {
        const op = asyncOperations.get(asyncId);
        if (op) {
            op.execStartTime = Date.now();
        }
    },

    after(asyncId) {
        const op = asyncOperations.get(asyncId);
        if (op && op.execStartTime) {
            const execTime = Date.now() - op.execStartTime;
            if (execTime > 10) {  // 10ms 이상 걸린 작업
                console.warn(`Slow async operation ${op.type}: ${execTime}ms`);
                console.warn(op.stack);
            }
        }
    },

    destroy(asyncId) {
        asyncOperations.delete(asyncId);
        activeOperations--;
    }
});

hook.enable();

// Event Loop 지연 측정
let lastLoopTime = Date.now();
setImmediate(function checkLoopDelay() {
    const now = Date.now();
    const delay = now - lastLoopTime;

    if (delay > 100) {  // 100ms 이상 지연
        console.error(`Event loop delay: ${delay}ms`);
        console.error(`Active operations: ${activeOperations}`);

        // 어떤 타입의 작업이 많은지 분석
        const typeCounts = {};
        for (const [id, op] of asyncOperations) {
            typeCounts[op.type] = (typeCounts[op.type] || 0) + 1;
        }
        console.error('Operation types:', typeCounts);
    }

    lastLoopTime = now;
    setImmediate(checkLoopDelay);
});
```

### 6.2 Production 장애 사례와 해결

**사례 1: CPU Bound 작업으로 인한 Event Loop Blocking**

```javascript
// 문제가 된 코드
app.post('/analyze', async (req, res) => {
    const data = req.body.data;  // 100MB JSON

    // 이 작업이 5초 걸림 - Event Loop 블록!
    const result = complexAnalysis(data);

    res.json(result);
});

// 해결책 1: Worker Thread 사용
const { Worker } = require('worker_threads');

app.post('/analyze', async (req, res) => {
    const worker = new Worker('./analysis-worker.js');

    worker.postMessage(req.body.data);

    worker.on('message', (result) => {
        res.json(result);
    });
});

// 해결책 2: 청크 단위 처리
async function complexAnalysisAsync(data) {
    const chunks = splitIntoChunks(data, 1000);
    const results = [];

    for (const chunk of chunks) {
        results.push(processChunk(chunk));

        // Event Loop에 양보!
        await new Promise(resolve => setImmediate(resolve));
    }

    return mergeResults(results);
}
```

**사례 2: Memory Leak으로 인한 GC Pressure**

```javascript
// 문제: Event Listener 누수
class WebSocketManager {
    constructor() {
        this.connections = new Map();
    }

    handleConnection(ws) {
        const id = generateId();
        this.connections.set(id, ws);

        // 문제: close 이벤트에서 제거 안 함!
        ws.on('message', (data) => {
            this.broadcast(data);
        });

        // 수정: 명시적 정리
        ws.on('close', () => {
            this.connections.delete(id);
            ws.removeAllListeners();  // 중요!
        });
    }
}

// 모니터링 추가
setInterval(() => {
    const usage = process.memoryUsage();
    console.log({
        rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
        external: Math.round(usage.external / 1024 / 1024) + 'MB',
        connections: this.connections.size
    });

    // 메모리 누수 감지
    if (usage.heapUsed > 500 * 1024 * 1024) {  // 500MB
        console.error('Memory leak detected!');
        process.exit(1);  // 재시작
    }
}, 10000);
```

## 7. 성능 최적화 전략

### 7.1 Batching과 Debouncing

```javascript
// 나쁜 예: 매 요청마다 DB 쿼리
async function getUser(id) {
    return db.query('SELECT * FROM users WHERE id = ?', [id]);
}

// 좋은 예: 배치 처리
class BatchedUserLoader {
    constructor() {
        this.pending = new Map();
        this.timer = null;
    }

    async getUser(id) {
        if (!this.pending.has(id)) {
            this.pending.set(id, []);
        }

        return new Promise((resolve, reject) => {
            this.pending.get(id).push({ resolve, reject });

            if (!this.timer) {
                this.timer = setImmediate(() => this.flush());
            }
        });
    }

    async flush() {
        const ids = Array.from(this.pending.keys());
        const callbacks = new Map(this.pending);

        this.pending.clear();
        this.timer = null;

        try {
            // 한 번의 쿼리로 모든 사용자 가져오기
            const users = await db.query(
                'SELECT * FROM users WHERE id IN (?)',
                [ids]
            );

            const userMap = new Map(users.map(u => [u.id, u]));

            for (const [id, cbs] of callbacks) {
                const user = userMap.get(id);
                for (const cb of cbs) {
                    cb.resolve(user);
                }
            }
        } catch (err) {
            for (const cbs of callbacks.values()) {
                for (const cb of cbs) {
                    cb.reject(err);
                }
            }
        }
    }
}

// 성능 차이:
// 일반 방식: 100개 요청 = 100개 쿼리 = 1000ms
// 배치 방식: 100개 요청 = 1개 쿼리 = 50ms
```

### 7.2 Connection Pooling과 Keep-Alive

```javascript
// HTTP Keep-Alive 설정
const http = require('http');
const agent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10
});

// 성능 측정
async function benchmark() {
    console.time('Without Keep-Alive');
    for (let i = 0; i < 1000; i++) {
        await fetch('http://api.example.com/data');
    }
    console.timeEnd('Without Keep-Alive');
    // 결과: 5000ms (연결 설정 오버헤드)

    console.time('With Keep-Alive');
    for (let i = 0; i < 1000; i++) {
        await fetch('http://api.example.com/data', { agent });
    }
    console.timeEnd('With Keep-Alive');
    // 결과: 1000ms (5배 빠름!)
}
```

## 8. 마무리: Event Loop 마스터가 되는 길

이벤트 루프를 마스터한다는 것은 단순히 API를 아는 것이 아닙니다. 그것은:

1. **시스템 레벨 이해**: epoll, kqueue, IOCP의 차이를 알고 선택할 수 있는 능력
2. **패턴 인식**: Reactor vs Proactor, 각각의 적합한 사용 사례 파악
3. **성능 감각**: 언제 블로킹이 발생하는지, 어떻게 해결할지 직관적으로 아는 것
4. **디버깅 능력**: 프로덕션에서 문제를 빠르게 진단하고 해결하는 것

제가 10년간 백엔드 개발을 하면서 배운 가장 중요한 교훈은 이것입니다:

> "이벤트 루프는 마법이 아니다. 그것은 정교하게 설계된 엔지니어링의 결과물이다."

다음 챕터에서는 이런 이벤트 기반 시스템 위에서 어떻게 코루틴과 Green Thread를 구현하는지 알아보겠습니다. Go의 goroutine이 어떻게 수백만 개를 동시에 실행할 수 있는지, Python의 asyncio가 내부적으로 어떻게 동작하는지 깊이 파헤쳐 보겠습니다!

## 참고 자료

- [The C10K Problem](http://www.kegel.com/c10k.html) - Dan Kegel
- [libuv Design Overview](http://docs.libuv.org/en/v1.x/design.html)
- [Linux Kernel: epoll Implementation](https://github.com/torvalds/linux/blob/master/fs/eventpoll.c)
- [io_uring: The future of Linux I/O](https://kernel.dk/io_uring.pdf)
- [Go Scheduler Design Doc](https://golang.org/s/go11sched)
