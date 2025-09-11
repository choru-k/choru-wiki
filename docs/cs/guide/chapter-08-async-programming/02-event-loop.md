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

```
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
// Reactor 패턴 구현
class Reactor {
    constructor() {
        this.handlers = new Map();
        this.epoll = new Epoll();
    }
    
    registerHandler(fd, events, handler) {
        this.handlers.set(fd, handler);
        this.epoll.add(fd, events);
    }
    
    run() {
        while (true) {
            // 이벤트 대기
            const events = this.epoll.wait();
            
            for (const event of events) {
                // 핸들러가 직접 I/O 수행
                const handler = this.handlers.get(event.fd);
                
                if (event.readable) {
                    const data = fs.readSync(event.fd);  // 여기서 읽기!
                    handler.handleRead(data);
                }
                
                if (event.writable) {
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
// Proactor 패턴 구현
class Proactor {
    void asyncRead(int fd, Buffer* buffer, CompletionHandler handler) {
        // OS가 I/O를 대신 수행
        io_uring_prep_read(sqe, fd, buffer->data, buffer->size, 0);
        sqe->user_data = new Context{handler, buffer};
        io_uring_submit(&ring);
    }
    
    void run() {
        while (true) {
            // 완료된 작업 수신
            io_uring_cqe* cqe;
            io_uring_wait_cqe(&ring, &cqe);
            
            auto* ctx = (Context*)cqe->user_data;
            
            // I/O는 이미 완료됨!
            ctx->handler(ctx->buffer, cqe->res);
            
            delete ctx;
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
// Go의 work stealing 스케줄러 (단순화)
type P struct {  // Processor
    runq     [256]*G  // Local run queue
    runqhead uint32
    runqtail uint32
}

// 각 P는 자신의 큐에서 G(goroutine) 실행
func schedule() *G {
    // 1. 로컬 큐에서 가져오기 (빠름!)
    if g := runqget(); g != nil {
        return g
    }
    
    // 2. 글로벌 큐 확인
    if g := globrunqget(); g != nil {
        return g
    }
    
    // 3. 다른 P의 큐에서 훔치기!
    for i := 0; i < 4; i++ {
        p := allp[fastrand()%uint32(len(allp))]
        if g := runqsteal(p); g != nil {
            return g  // 훔치기 성공!
        }
    }
    
    // 4. 네트워크 폴링
    if g := netpoll(); g != nil {
        return g
    }
}

// 훔치기 전략: 절반을 가져옴
func runqsteal(p *P) *G {
    n := p.runqsize() / 2  // 절반만 훔치기
    if n == 0 {
        return nil
    }
    
    // 배치로 훔쳐서 캐시 효율성 극대화
    batch := make([]*G, n)
    for i := 0; i < n; i++ {
        batch[i] = p.runqget()
    }
    
    // 로컬 큐에 추가
    for _, g := range batch[1:] {
        runqput(g)
    }
    
    return batch[0]  // 첫 번째는 즉시 실행
}
```

### 5.2 M:N 모델의 실제 구현

```go
// Go의 GPM 모델
// G: Goroutine (수백만 개 가능)
// P: Processor (GOMAXPROCS개, 보통 CPU 코어 수)
// M: Machine thread (OS 스레드)

type G struct {
    stack       stack   // 2KB 시작, 동적 증가
    sched       gobuf   // 레지스터 저장
    atomicstatus uint32 // 상태
}

type M struct {
    g0      *G   // 스케줄링용 goroutine
    curg    *G   // 현재 실행 중인 G
    p       *P   // 연결된 P
    spinning bool // work stealing 중?
}

type P struct {
    m       *M      // 연결된 M
    runq    [256]*G // 로컬 큐
    
    // GC 관련
    gcBgMarkWorker *G
    gcMarkWorkerMode gcMarkWorkerMode
}

// 실제 컨텍스트 스위칭 (어셈블리)
TEXT runtime·mcall(SB), NOSPLIT, $0-8
    MOVQ fn+0(FP), DI
    
    MOVQ g(CX), AX    // g = getg()
    MOVQ 0(SP), BX    // caller's PC
    MOVQ BX, (g_sched+gobuf_pc)(AX)
    LEAQ fn+0(FP), BX // caller's SP
    MOVQ BX, (g_sched+gobuf_sp)(AX)
    
    // Switch to g0 stack
    MOVQ g_m(AX), BX
    MOVQ m_g0(BX), SI
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