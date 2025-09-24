---
tags:
  - Channel
  - GPM
  - Go
  - Goroutine
  - Scheduler
  - balanced
  - intermediate
  - medium-read
  - 애플리케이션개발
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 10.1.3: Go 고루틴 아키텍처

## 🎯 GPM 모델의 정수

Go의 스케줄러는 엔지니어링의 걸작으로 평가받는 시스템입니다:

1.**GPM 모델**: G(Goroutine), P(Processor), M(Machine) 세 요소의 조화
2.**콘티기어스 스택**: 동적 스택 확장과 Hot Split 문제 해결
3.**Channel 내부 구현**: CSP(Communicating Sequential Processes) 모델의 실제 구현
4.**실전 패턴**: Worker Pool, Fan-out/Fan-in, Context 기반 대반 효율적 사용법

## 3. Go의 Goroutine: 엔지니어링의 정수

### 3.1 GPM 모델의 세밀한 동작

Go의 스케줄러는 정말 아름다운 설계입니다:

```go
// runtime/runtime2.go의 실제 구조체들
type g struct {
    stack       stack   // 스택 정보
    stackguard0 uintptr // 스택 오버플로우 체크
    stackguard1 uintptr // C 스택 가드

    m         *m      // 현재 실행 중인 M
    sched     gobuf   // 컨텍스트 저장
    atomicstatus atomic.Uint32
    goid      uint64  // goroutine ID

    // 디버깅/프로파일링
    startpc     uintptr // goroutine 시작 PC
    racectx     uintptr // race detector context
    waiting     *sudog  // 대기 중인 채널
}

type gobuf struct {
    sp   uintptr  // 스택 포인터
    pc   uintptr  // 프로그램 카운터
    g    guintptr // g 포인터
    ctxt unsafe.Pointer
    ret  uintptr  // 반환값
    lr   uintptr  // link register (ARM)
    bp   uintptr  // base pointer (x86)
}

type m struct {
    g0      *g     // 스케줄링용 goroutine
    curg    *g     // 현재 실행 중인 G
    p       puintptr // 연결된 P
    nextp   puintptr
    oldp    puintptr

    // 시스템 스레드 정보
    thread  uintptr // 스레드 핸들

    // 스피닝 상태
    spinning bool
    blocked  bool

    // 시그널 처리
    gsignal *g

    // 캐시
    mcache *mcache
}

type p struct {
    id      int32
    status  uint32

    m       muintptr // 연결된 M
    mcache  *mcache

    // 로컬 실행 큐
    runqhead uint32
    runqtail uint32
    runq     [256]guintptr

    // 글로벌 큐에서 가져온 G 개수
    schedtick   uint32
    syscalltick uint32

    // GC 관련
    gcAssistTime int64
}
```

### 3.2 Goroutine 스택 관리: Contiguous Stack

Go는 초기에 segmented stack을 사용했지만, hot split 문제로 contiguous stack으로 전환했습니다:

```go
// 스택 증가 메커니즘
func growstack() {
    gp := getg()

    // 현재 스택 크기
    oldsize := gp.stack.hi - gp.stack.lo
    newsize := oldsize * 2

    // 최대 1GB까지 증가 가능
    if newsize > maxstacksize {
        throw("stack overflow")
    }

    // 새 스택 할당
    newstack := stackalloc(uint32(newsize))

    // 기존 스택 내용 복사
    memmove(newstack.hi-oldsize, gp.stack.lo, oldsize)

    // 포인터 조정 (스택 내부 포인터들)
    adjustpointers(&gp.sched, &adjinfo{
        old: gp.stack,
        new: newstack,
    })

    // 이전 스택 해제
    stackfree(gp.stack)

    // 새 스택 설정
    gp.stack = newstack
    gp.stackguard0 = newstack.lo + _StackGuard
}

// 스택 프리엠프션 (Go 1.14+)
func stackPreempt() {
    // 비동기 프리엠프션을 위한 시그널
    const preemptMark = uintptr(0xfffffade)

    gp := getg()
    gp.stackguard0 = preemptMark

    // 다음 함수 호출 시 스택 체크에서 걸림
    // -> preemption 처리
}
```

### 3.3 Channel의 내부 구현

Channel은 Go 동시성의 핵심입니다:

```go
// runtime/chan.go
type hchan struct {
    qcount   uint      // 큐에 있는 데이터 개수
    dataqsiz uint      // 버퍼 크기
    buf      unsafe.Pointer // 버퍼
    elemsize uint16
    closed   uint32
    elemtype *_type

    sendx    uint   // send 인덱스
    recvx    uint   // receive 인덱스

    recvq    waitq  // receive 대기 goroutine
    sendq    waitq  // send 대기 goroutine

    lock mutex
}

// 실제 send 구현
func chansend(c *hchan, ep unsafe.Pointer, block bool) bool {
    lock(&c.lock)

    // 1. 대기 중인 receiver가 있으면 직접 전달
    if sg := c.recvq.dequeue(); sg != nil {
        send(c, sg, ep, func() { unlock(&c.lock) })
        return true
    }

    // 2. 버퍼에 공간이 있으면 버퍼에 저장
    if c.qcount < c.dataqsiz {
        qp := chanbuf(c, c.sendx)
        typedmemmove(c.elemtype, qp, ep)
        c.sendx++
        if c.sendx == c.dataqsiz {
            c.sendx = 0
        }
        c.qcount++
        unlock(&c.lock)
        return true
    }

    // 3. 블로킹 모드: 현재 goroutine을 대기 큐에 추가
    if block {
        gp := getg()
        mysg := acquireSudog()
        mysg.g = gp
        mysg.elem = ep
        c.sendq.enqueue(mysg)

        // goroutine을 park (대기 상태로)
        gopark(chanparkcommit, unsafe.Pointer(&c.lock))

        // 깨어났을 때
        releaseSudog(mysg)
        return true
    }

    // 4. 논블로킹 모드: false 반환
    unlock(&c.lock)
    return false
}
```

### 3.4 실전 Goroutine 패턴

```go
// 1. Worker Pool 패턴
type Job struct {
    ID   int
    Data []byte
}

type Result struct {
    JobID int
    Output []byte
    Error error
}

func WorkerPool(jobs <-chan Job, results chan<- Result, workers int) {
    var wg sync.WaitGroup

    // Worker goroutines 생성
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func(workerID int) {
            defer wg.Done()

            for job := range jobs {
                start := time.Now()

                // 실제 작업
                output, err := processJob(job.Data)

                results <- Result{
                    JobID: job.ID,
                    Output: output,
                    Error: err,
                }

                log.Printf("Worker %d: Job %d took %v",
                    workerID, job.ID, time.Since(start))
            }
        }(i)
    }

    // 모든 worker 종료 대기
    go func() {
        wg.Wait()
        close(results)
    }()
}

// 2. Fan-out/Fan-in 패턴
func FanOutFanIn(input <-chan int) <-chan int {
    // Fan-out: 여러 goroutine에 작업 분배
    c1 := process(input)
    c2 := process(input)
    c3 := process(input)

    // Fan-in: 결과 수집
    return merge(c1, c2, c3)
}

func process(input <-chan int) <-chan int {
    output := make(chan int)
    go func() {
        for n := range input {
            output <- n * n  // CPU 집약적 작업
        }
        close(output)
    }()
    return output
}

func merge(channels ...<-chan int) <-chan int {
    out := make(chan int)
    var wg sync.WaitGroup

    for _, c := range channels {
        wg.Add(1)
        go func(ch <-chan int) {
            defer wg.Done()
            for n := range ch {
                out <- n
            }
        }(c)
    }

    go func() {
        wg.Wait()
        close(out)
    }()

    return out
}

// 3. Timeout과 Context 패턴
func TimeoutOperation(ctx context.Context) error {
    resultCh := make(chan string, 1)

    go func() {
        // 오래 걸리는 작업
        time.Sleep(5 * time.Second)
        resultCh <- "completed"
    }()

    select {
    case result := <-resultCh:
        fmt.Println("Result:", result)
        return nil

    case <-ctx.Done():
        return ctx.Err()  // timeout or cancellation

    case <-time.After(3 * time.Second):
        return fmt.Errorf("operation timeout")
    }
}
```

## 핵심 요점

### 1. GPM 모델의 에레간스

G(Goroutine), P(Processor), M(Machine) 세 요소의 조화로 효율적인 스케줄링을 구현했습니다.

### 2. 컨티기어스 스택의 지능적 관리

동적 스택 확장과 Hot Split 문제 해결로 2KB에서 시작해 필요시 1GB까지 확장 가능합니다.

### 3. Channel의 CSP 모델 실현

비동기 컴뮤니케이션을 동기 코드처럼 작성할 수 있게 하는 엘리간트한 추상화를 제공합니다.

---

**이전**: [10-02-07-python-asyncio-implementation.md](./10-02-07-python-asyncio-implementation.md)  
**다음**: [10-02-08-java-virtual-threads.md](./10-02-08-java-virtual-threads.md)에서 Java Virtual Thread와 Project Loom의 혁신을 다룹니다.

## 📚 관련 문서

### 📖 현재 문서 정보

-**난이도**: INTERMEDIATE
-**주제**: 애플리케이션 개발
-**예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-10-async-programming)

- [8.1 Promise/Future 패턴 개요](./10-02-01-promise-future.md)
- [8.1a Promise/Future 기본 개념과 구현](./10-01-01-promise-future-basics.md)
- [8.1b 비동기 연산 조합과 병렬 처리](./10-02-02-async-composition.md)
- [8.1c 취소와 타임아웃 처리](./10-02-03-cancellation-timeout.md)
- [8.1d 실행 모델과 스케줄링](./10-02-04-execution-scheduling.md)

### 🏷️ 관련 키워드

`Go`, `Goroutine`, `GPM`, `Channel`, `Scheduler`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
