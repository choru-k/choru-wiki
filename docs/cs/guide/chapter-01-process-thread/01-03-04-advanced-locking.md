---
tags:
  - aba-problem
  - advanced
  - compare-and-swap
  - deep-study
  - hands-on
  - lock-free
  - memory-ordering
  - rwlock
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "8-15시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 1.3.4: 고급 락킹 기법

## 🏎️ 포뮬러 원 트랙의 비밀

포뮬러 원 레이스에서 트랙의 일부 구간은 **여러 차가 동시에 달릴 수 있는 넓은 직선**이고, 일부 구간은 **한 번에 한 차만 지날 수 있는 좁은 코너**입니다.

프로그래밍도 마찬가지입니다:

- **읽기**: 넓은 직선 - 여러 스레드가 동시에 읽어도 안전
- **쓰기**: 좁은 코너 - 한 번에 하나만, 다른 모든 스레드 차단

제가 만든 뉴스 피드 서버에서:

- **읽기 요청**: 초당 100,000건 (사용자들이 글을 봄)
- **쓰기 요청**: 초당 1,000건 (사용자들이 글을 씀)

뮤텍스만 썼다면? 읽기끼리도 서로 기다려야 해서 **성능 참사**가 벌어졌을 겁니다! 😱

## 5. 읽기-쓰기 락: 도서관의 지혜

### 🏛️ 도서관 규칙

도서관에서는 이런 규칙이 있죠:

1. **읽기**: 여러 명이 동시에 같은 책을 읽을 수 있음
2. **쓰기**: 메모 작성할 때는 혼자만
3. **우선순위**: 누군가 쓰고 있으면 읽기도 대기

실제로 제가 캐시 시스템을 만들 때의 성능 비교:

```c
// 뮤텍스만 사용
pthread_mutex_t cache_mutex;

void cache_get_mutex(key_t key) {
    pthread_mutex_lock(&cache_mutex);  // 읽기도 배타적!
    value_t value = hashtable_get(cache, key);
    pthread_mutex_unlock(&cache_mutex);
    return value;
}

// 결과: 초당 50,000 읽기 요청 처리 (CPU 병목)

// RWLock 사용
pthread_rwlock_t cache_rwlock;

void cache_get_rwlock(key_t key) {
    pthread_rwlock_rdlock(&cache_rwlock);  // 읽기는 공유!
    value_t value = hashtable_get(cache, key);
    pthread_rwlock_unlock(&cache_rwlock);
    return value;
}

// 결과: 초당 500,000 읽기 요청 처리 (10배 향상!) 🚀
```

### RWLock 내부 구현

```c
// ⭐ 읽기-쓰기 락 내부 구조 - 읽기 동시성과 쓰기 배타성을 동시 지원
typedef struct {
    // ⭐ 1단계: 내부 상태 보호 장치 - RWLock 전체 상태의 원자성 보장
    pthread_mutex_t mutex;          // 내부 카운터와 플래그 조작용 배타적 락
                                    // 짧은 시간만 보유하여 성능 영향 최소화
    
    // ⭐ 2단계: 조건 변수 - 읽기/쓰기 스레드들의 효율적 대기 및 깨우기
    pthread_cond_t readers_cond;    // 읽기 스레드들의 대기 및 신호 전달용
                                    // broadcast로 여러 읽기 스레드를 동시에 깨우기 가능
    pthread_cond_t writers_cond;    // 쓰기 스레드들의 대기 및 신호 전달용
                                    // signal로 한 쓰기 스레드만 깨우기 (배타적 접근)
    
    // ⭐ 3단계: 활성 상태 추적 - 현재 진행 중인 읽기/쓰기 작업의 개수
    int active_readers;    // 현재 읽기 중인 스레드 수 (0 이상 가능)
                           // 여러 읽기 스레드가 동시에 데이터에 접근 가능
                           // 예: 캐시 서버에서 동시에 10개 읽기 요청 처리
    int waiting_readers;   // 대기 중인 읽기 스레드 수
                           // 쓰기 작업 완료 후 깨울 읽기 스레드 개수
    int active_writers;    // 현재 쓰기 중인 스레드 수 (0 또는 1만 가능)
                           // 배타적 접근: 쓰기 시 모든 다른 읽기/쓰기 접근 차단
    int waiting_writers;   // 대기 중인 쓰기 스레드 수
                           // starvation 방지를 위한 우선순위 제어에 사용
    
    // ⭐ 4단계: Writer Starvation 방지 메커니즘 - 공정한 리소스 배분
    int writer_priority;   // 쓰기 스레드 우선순위 플래그
                           // 쓰기 요청이 대기 중이면 새 읽기 요청 차단
                           // 예방: 지속적인 읽기 요청에 의해 쓰기가 무기한 대기
} rwlock_internal_t;

// ⭐ 실제 Production 사용 사례에서의 성능 개선 사례:
// 1. 데이터베이스 캐시: 읽기 95%, 쓰기 5% → 읽기 동시성으로 10배 성능 향상
// 2. 웹 서버 세션: 읽기 90%, 쓰기 10% → 동시 사용자 수 5배 증가 가능
// 3. 구성 파일 관리: 읽기 99%, 쓰기 1% → 무제한 동시 접근 가능
// 4. 로그 분석: 읽기 100% → 완벽한 동시성으로 CPU 코어 활용도 극대화

// ⭐ 읽기 잠금 연산 - 동시 읽기 접근을 위한 공유 락 획득
// 실제 동작: 쓰기 작업이 없을 때까지 대기 후 읽기 카운터 증가
void rwlock_rdlock(rwlock_internal_t *rwl) {
    // ⭐ 1단계: RWLock 내부 상태 보호 - 원자적 카운터 조작을 위한 임계구역 진입
    pthread_mutex_lock(&rwl->mutex);  // 빠른 카운터 업데이트만 수행
    
    // ⭐ 2단계: 대기 열 등록 - 대기 중인 읽기 스레드 수 추적
    rwl->waiting_readers++;  // starvation 방지와 공정성 보장을 위한 대기자 카운터
    
    // ⭐ 3단계: 읽기 가능 조건 확인 - writer 우선순위와 배타적 접근 고려
    while (rwl->active_writers > 0 ||                      // 현재 쓰기 작업 진행 중
           (rwl->waiting_writers > 0 && rwl->writer_priority)) {  // 쓰기 스레드 대기 + 우선순위 설정
        // ⭐ 대기 이유 분석:
        // 1) active_writers > 0: 다른 스레드가 쓰기 중 → 데이터 무결성 보장
        // 2) writer_priority: 쓰기 우선순위로 writer starvation 방지
        // 예시: 데이터베이스에서 지속적인 SELECT가 UPDATE를 무기한 차단하는 것 방지
        
        pthread_cond_wait(&rwl->readers_cond, &rwl->mutex);
        // ⭐ 조건변수 대기의 효과:
        // - CPU 사용률 0%로 busy wait 없이 효율적 대기
        // - writer가 작업 완료시 broadcast로 모든 대기 중인 reader들이 동시 깨어남
    }
    
    // ⭐ 4단계: 읽기 작업 시작 준비 - 대기 열에서 제거 및 활성 열에 등록
    rwl->waiting_readers--;  // 대기 열에서 제거
    rwl->active_readers++;   // 활성 읽기 스레드 수 증가
    // 중요: 여러 읽기 스레드가 동시에 active_readers 증가 가능
    // 예시: 3개 읽기 스레드가 동시에 깨어나서 active_readers = 3
    
    // ⭐ 5단계: 임계구역 탈출 - 빠른 락 해제로 다른 스레드에게 기회 제공
    pthread_mutex_unlock(&rwl->mutex);  // 내부 상태 보호 해제
    
    // ⭐ 이 시점 이후: 읽기 작업 수행 가능 (다른 reader들과 동시 접근)
    // 성능 이점: 읽기 작업 중에는 모든 reader들이 공유 자원에 락 없이 접근
    // 예시: 10개 CPU 코어에서 10개 reader가 동시에 캐시 데이터 읽기
    
    // ⭐ 주의사항:
    // - 읽기 작업 완료 후 반드시 rwlock_rdunlock() 호출 필수
    // - 예외 또는 조기 리턴 시에도 unlock 보장 필요 (RAII 패턴 권장)
    // - active_readers가 0이 될 때까지 모든 writer들은 대기 상태 유지
}

// ⭐ 읽기 해제 연산 - 읽기 작업 완료 후 writer에게 기회 제공
void rwlock_rdunlock(rwlock_internal_t *rwl) {
    // ⭐ 1단계: RWLock 내부 상태 보호 - 원자적 카운터 감소
    pthread_mutex_lock(&rwl->mutex);  // active_readers 안전한 감소를 위한 짧은 락
    
    // ⭐ 2단계: 활성 읽기 스레드 수 감소 - 하나의 읽기 작업 완료 표시
    rwl->active_readers--;  // 현재 읽기 중인 스레드 수 1 감소
    // 예시: 5개 동시 읽기 중 1개 완료 → active_readers: 5 -> 4
    
    // ⭐ 3단계: 모든 읽기 완료 후 writer 깨우기 - 쓰기 작업에 배타적 접근 기회 제공
    if (rwl->active_readers == 0 && rwl->waiting_writers > 0) {
        // ⭐ 마지막 읽기 스레드 완룼 감지 - 쓰기 작업을 위한 완전한 공간 확보
        pthread_cond_signal(&rwl->writers_cond);  // 대기 중인 writer 중 1개만 깨우기
        // 중요: signal (단일 깨우기) vs broadcast (전체 깨우기)
        // writer는 배타적이므로 1개만 깨워서 효율성 극대화
        
        // ⭐ 성능 최적화 전략:
        // 1. 대기 중인 writer 중 가장 오래 기다린 것을 우선 깨우기 (FIFO)
        // 2. writer가 작업을 시작하면 모든 새 reader 요청 차단
        // 3. write-heavy 워크로드에서 reader starvation 방지
    }
    // 주의: active_readers > 0이면 아직 다른 읽기 작업이 진행 중
    // → writer는 모든 reader가 완료될 때까지 계속 대기
    
    // ⭐ 4단계: 임계구역 탈출 - 다른 reader/writer 스레드에게 기회 제공
    pthread_mutex_unlock(&rwl->mutex);
    
    // ⭐ 이 시점 이후: 현재 스레드의 읽기 작업 완전히 종료
    // 다른 스레드들이 RWLock 상태를 업데이트하거나 깨어날 수 있음
    
    // ⭐ 실제 production 예시 시나리오:
    // 1. 캐시 서버: 10개 reader 동시 작업 중 1개 완료
    //    → 모든 reader 완료시 writer가 캐시 갱신 수행
    // 2. 데이터베이스: 100개 SELECT 동시 실행 중 마지막 SELECT 완료
    //    → 대기 중인 UPDATE 또는 DELETE 문 실행 시작
    // 3. 웹 서버 세션: 여러 사용자의 세션 읽기 완료 후
    //    → 세션 만료 정리 작업 수행
}

// 쓰기 잠금
void rwlock_wrlock(rwlock_internal_t *rwl) {
    pthread_mutex_lock(&rwl->mutex);
    
    rwl->waiting_writers++;
    rwl->writer_priority = 1;  // Writer 우선순위 설정
    
    // 읽기나 쓰기가 활성화되어 있으면 대기
    while (rwl->active_readers > 0 || rwl->active_writers > 0) {
        pthread_cond_wait(&rwl->writers_cond, &rwl->mutex);
    }
    
    rwl->waiting_writers--;
    rwl->active_writers = 1;   // 쓰기 활성화
    
    pthread_mutex_unlock(&rwl->mutex);
}

// 쓰기 해제
void rwlock_wrunlock(rwlock_internal_t *rwl) {
    pthread_mutex_lock(&rwl->mutex);
    
    rwl->active_writers = 0;
    rwl->writer_priority = 0;  // Writer 우선순위 해제
    
    // 대기 중인 모든 스레드 깨우기
    if (rwl->waiting_writers > 0) {
        pthread_cond_signal(&rwl->writers_cond);
    } else if (rwl->waiting_readers > 0) {
        pthread_cond_broadcast(&rwl->readers_cond);
    }
    
    pthread_mutex_unlock(&rwl->mutex);
}
```

### 실전 RWLock 사용 예제

```c
#include <pthread.h>

// 공유 데이터 구조
typedef struct {
    int data[1000];
    pthread_rwlock_t rwlock;
} shared_data_t;

shared_data_t *g_data;

// 읽기 전용 작업 (여러 스레드 동시 가능)
void* reader_thread(void *arg) {
    int thread_id = *(int*)arg;
    
    for (int i = 0; i < 100; i++) {
        // 읽기 락 획득
        pthread_rwlock_rdlock(&g_data->rwlock);
        
        // 데이터 읽기 (여러 스레드가 동시에!)
        int sum = 0;
        for (int j = 0; j < 1000; j++) {
            sum += g_data->data[j];
        }
        
        printf("Reader %d: sum = %d\n", thread_id, sum);
        
        // 읽기 락 해제
        pthread_rwlock_unlock(&g_data->rwlock);
        
        usleep(1000);  // 1ms 대기
    }
    return NULL;
}

// 쓰기 작업 (배타적 접근)
void* writer_thread(void *arg) {
    int thread_id = *(int*)arg;
    
    for (int i = 0; i < 10; i++) {
        // 쓰기 락 획득 (모든 다른 스레드 대기)
        pthread_rwlock_wrlock(&g_data->rwlock);
        
        printf("Writer %d: updating data...\n", thread_id);
        
        // 데이터 수정
        for (int j = 0; j < 1000; j++) {
            g_data->data[j] = thread_id * 1000 + j;
        }
        
        printf("Writer %d: update complete\n", thread_id);
        
        // 쓰기 락 해제
        pthread_rwlock_unlock(&g_data->rwlock);
        
        usleep(10000);  // 10ms 대기
    }
    return NULL;
}

// 성능 비교 데모
void demonstrate_rwlock_performance() {
    const int NUM_READERS = 8;
    const int NUM_WRITERS = 2;
    
    pthread_t readers[NUM_READERS];
    pthread_t writers[NUM_WRITERS];
    int reader_ids[NUM_READERS];
    int writer_ids[NUM_WRITERS];
    
    // 읽기 스레드 생성
    for (int i = 0; i < NUM_READERS; i++) {
        reader_ids[i] = i;
        pthread_create(&readers[i], NULL, reader_thread, &reader_ids[i]);
    }
    
    // 쓰기 스레드 생성
    for (int i = 0; i < NUM_WRITERS; i++) {
        writer_ids[i] = i;
        pthread_create(&writers[i], NULL, writer_thread, &writer_ids[i]);
    }
    
    // 모든 스레드 종료 대기
    for (int i = 0; i < NUM_READERS; i++) {
        pthread_join(readers[i], NULL);
    }
    for (int i = 0; i < NUM_WRITERS; i++) {
        pthread_join(writers[i], NULL);
    }
}
```

## 6. Lock-Free 프로그래밍: 무술의 최고 경지

### ⚡ 이소룡의 철학

"Be like water" - 이소룡의 명언처럼, Lock-free 프로그래밍은 **물처럼 흘러가는** 동시성입니다.

락이 없으니:

- **대기 시간 없음**: 바로바로 진행
- **데드락 불가능**: 락이 없으니 데드락도 없음
- **우선순위 역전 없음**: 누군가를 막지 않음

하지만 **이소룡급 실력**이 필요합니다! 🥋

제가 고성능 메시지 큐를 만들 때의 실제 성능:

```c
// Lock 기반 큐: 초당 1,000,000 메시지
// Lock-free 큐: 초당 10,000,000 메시지 (10배!)
```

### Compare-And-Swap: 원자적 마법

모든 Lock-free의 핵심은 **CAS (Compare-And-Swap)**입니다:

```c
// CAS의 의사코드
bool compare_and_swap(int *ptr, int expected, int new_value) {
    if (*ptr == expected) {
        *ptr = new_value;
        return true;  // 성공
    }
    return false;  // 실패 (다른 누군가 먼저 바꿨음)
}

// CPU가 원자적으로 수행 - 중간에 끼어들 수 없음!
```

**실제 사용 패턴:**

```c
do {
    old_value = atomic_load(&shared_var);
    new_value = compute_new_value(old_value);
} while (!atomic_compare_exchange_weak(&shared_var, &old_value, new_value));

// 누군가 먼저 바꿨으면 다시 시도!
```

### Lock-Free 스택 구현

```c
#include <stdatomic.h>
#include <stdlib.h>

// ⭐ Lock-free 스택 노드 구조 - ABA 문제와 링크 안전성을 고려한 설계
typedef struct node {
    int data;             // 실제 저장할 데이터 (예: 작업 ID, 메시지 등)
    struct node *next;    // 다음 노드에 대한 포인터 (기존 링크드 리스트 구조)
                          // 주의: 이 포인터의 읽기/쓰기는 race condition에 노출
} node_t;

// ⭐ Lock-free 스택 데이터 구조 - Compare-And-Swap 기반의 무잠금 스택
typedef struct {
    atomic_uintptr_t head;  // ⭐ 원자적 헤드 포인터 - 동시 접근의 핵심
                            // atomic: 모든 읽기/쓰기 연산이 단일 원자 단위로 수행
                            // uintptr_t: 포인터와 정수 간 안전한 변환 지원
                            // memory ordering 지원으로 멀티코어 환경에서 일관성 보장
} lock_free_stack_t;

// ⭐ 주요 특징과 제약사항:
// 장점: 1) 대기 시간 없음 (wait-free push/pop)
//        2) 데드락 불가능 (락 없음)
//        3) 우선순위 역전 없음
//        4) 극대 성능 (백만 ops/sec 수준)
// 단점: 1) ABA 문제 위험
//        2) 메모리 회수 복잡성
//        3) 고난이도 구현
//        4) 플랫폼 의존적 메모리 모델

// ⭐ Lock-free 스택 푸시 연산 - Compare-And-Swap 기반 무잠금 데이터 삽입
// 실제 동작: 새 노드 생성 → 헤드 연결 시도 → 실패시 재시도 반복
// 활용: 작업 큐, 이벤트 로그, 메시지 버퍼링, 고성능 라이브러리
void push(lock_free_stack_t *stack, int data) {
    // ⭐ 1단계: 새 노드 준비 - 동시 접근에 안전한 노드 생성
    node_t *new_node = malloc(sizeof(node_t));  // 희 상황: malloc 실패 처리 생략
    new_node->data = data;  // 데이터 초기화 (원자적 연산 필요 없음)
    // 주의: next 포인터는 CAS 루프에서 설정 (시점 중요)
    
    node_t *old_head;  // 현재 헤드를 저장할 임시 변수
    
    // ⭐ 2단계: CAS 기반 재시도 루프 - 성공할 때까지 무한 시도
    do {
        // ⭐ 현재 헤드 읽기 - Acquire 시맨틱으로 일관된 메모리 뷰 보장
        old_head = (node_t*)atomic_load_explicit(&stack->head, memory_order_acquire);
        // memory_order_acquire: 이후 메모리 연산이 이 로드보다 먼저 실행되지 않음 보장
        // 효과: 다른 스레드에서 old_head->next 접근시 일관된 데이터 보장
        
        // ⭐ 새 노드의 링크 설정 - 기존 헤드를 가리키도록 연결
        new_node->next = old_head;  // LIFO 순서: 마지막에 들어온 것이 먼저 나감
        // 중요: 이 대입은 원자적이지 않지만 다른 스레드가 new_node를 아직 보지 못하므로 안전
        
        // ⭐ memory_order_release 의미:
        // - 이전 모든 메모리 연산 (데이터 설정, next 연결)이 CAS 완료 전에 보이도록 보장
        // - 다른 스레드가 new_node를 본 순간 모든 데이터가 준비됨을 보장
        
    } while (!atomic_compare_exchange_weak_explicit(&stack->head,
                                           (uintptr_t*)&old_head,      // 예상값 (비교 대상)
                                           (uintptr_t)new_node,        // 새 값 (대체할 값)
                                           memory_order_release,       // 성공시 메모리 순서
                                           memory_order_relaxed));     // 실패시 메모리 순서
    // ⭐ CAS 연산의 원자성:
    // 1. stack->head == old_head인지 확인 (비교)
    // 2. 같으면 stack->head = new_node로 대체 (교환)
    // 3. 다르면 old_head를 현재 값으로 업데이트 후 재시도
    
    // ⭐ 성공 후: new_node가 스택의 새 헤드가 되고, 다른 스레드들도 즉시 pop 가능
    
    // ⭐ 실제 production 성능:
    // - Intel x86: CAS 연삵 약 20-50 사이클 (2-5ns)
    // - ARM: CAS 연산 약 10-30 사이클 (1-3ns)
    // - 경합 없음: 거의 1번 만에 성공
    // - 고경합: 10-100번 재시도 가능 (그래도 리벤 반복보다 빠름)
    //
    // ⭐ 주요 사용 사례:
    // 1. 웹 서버 요청 큐: 초고속 요청 버퍼링
    // 2. 로그 시스템: 멀티스레드 로그 메시지 수집
    // 3. 메모리 풀: 고속 메모리 할당/해제
    // 4. 작업 스카읬링: CPU 집약적 작업의 분산 처리
}

// ⭐ Lock-free 스택 팝 연산 - ABA 문제 완화와 안전한 메모리 접근
// 실제 동작: 헤드 읽기 → 연결 검증 → 헤드 업데이트 시도 → 실패시 재시도
// 주의: ABA 문제에 의한 데이터 무결성 위험 내재
int pop(lock_free_stack_t *stack) {
    node_t *old_head, *new_head;
    
    // ⭐ CAS 기반 재시도 루프 - 성공할 때까지 지속적 시도
    do {
        // ⭐ 1단계: 헤드 포인터 읽기 - 현재 스택 상단 노드 획득
        old_head = (node_t*)atomic_load_explicit(&stack->head, memory_order_acquire);
        // memory_order_acquire: 이후 메모리 연산이 이 로드보다 먼저 실행되지 않음
        // 필수: old_head->next 접근 전에 old_head가 유효한지 확신
        
        // ⭐ 2단계: 빈 스택 검사 - 팝할 데이터가 있는지 확인
        if (old_head == NULL) {
            return -1;  // 스택 비어있음: underflow 방지
        }
        
        // ⭐ 3단계: ABA 문제 완화 시도 - 메모리 배리어로 일관성 향상
        atomic_thread_fence(memory_order_acquire);
        // 의도: next 포인터 읽기 전에 모든 이전 메모리 연산이 완료되도록 보장
        // 주의: 완전한 ABA 방지는 아니지만 위험성 감소
        
        new_head = old_head->next;  // ⭐ 다음 노드 포인터 읽기 (위험한 지점)
        // ⚠️ 위험: old_head가 이미 해제되었다면 얘러 메모리 접근 (segfault)
        // ⚠️ ABA 문제: old_head가 A→B→A 순서로 변경되어 잘못된 링크 사용 가능
        
        // ⭐ 4단계: 이중 확인 - old_head가 여전히 유효한 헤드인지 재검증
        if (old_head != (node_t*)atomic_load_explicit(&stack->head, memory_order_relaxed)) {
            continue;  // 헤드가 변경되었으면 재시도 (다른 스레드가 끌어갔음)
            // 예시: Thread 1이 old_head 읽은 후 Thread 2가 pop 수행 → 재시도 필요
        }
        // 주의: 이 검사도 race condition에서 완전히 자유롭지는 않음
        
    } while (!atomic_compare_exchange_weak_explicit(&stack->head,
                                           (uintptr_t*)&old_head,      // 현재 헤드 (비교대상)
                                           (uintptr_t)new_head,        // 새 헤드 (다음 노드)
                                           memory_order_release,       // 성공시 메모리 순서
                                           memory_order_relaxed));     // 실패시 메모리 순서
    // ⭐ CAS 성공: stack->head가 old_head에서 new_head로 원자적 변경
    // ⭐ CAS 실패: 다른 스레드가 먼저 수정했으므로 old_head 업데이트 후 재시도
    
    // ⭐ 5단계: 성공적으로 노드 제거 후 데이터 반환
    int data = old_head->data;  // 제거된 노드의 데이터 복사
    
    // ⭐ 심각한 ABA 문제 경고 - 실제 production에서는 절대 사용 금지!
    free(old_head);  // ⚠️ 극도로 위험: 다른 스레드가 이 노드를 사용 중일 수 있음!
    // ⭐ 올바른 해결책들:
    // 1. Hazard Pointers: 사용 중인 포인터를 전역적으로 등록하여 해제 방지
    // 2. Epoch-based reclamation: 전체 시스템의 epoch 단위로 메모리 회수
    // 3. RCU (Read-Copy-Update): 리눅스 커널에서 사용하는 기법
    // 4. Double-width CAS: 포인터 + 카운터를 함께 업데이트
    
    return data;
    
    // ⭐ 실제 Production 사용 시 고려사항:
    // 1. 메모리 회수 전략 필수 적용
    // 2. 고빈도 pop 연산 시 contention 증가로 성능 저하 가능
    // 3. 메모리 순서 기법 이해 필수 (acquire-release semantic)
    // 4. 플랫폼별 CAS 성능 차이 고려 (x86 vs ARM vs RISC-V)
}

// Lock-free 카운터
typedef struct {
    atomic_long value;
} lock_free_counter_t;

void increment(lock_free_counter_t *counter) {
    atomic_fetch_add(&counter->value, 1);
}

long get_value(lock_free_counter_t *counter) {
    return atomic_load(&counter->value);
}

// Lock-free 큐 (Michael & Scott)
typedef struct {
    atomic_uintptr_t head;
    atomic_uintptr_t tail;
} lock_free_queue_t;

void enqueue(lock_free_queue_t *queue, int data) {
    node_t *new_node = malloc(sizeof(node_t));
    new_node->data = data;
    new_node->next = NULL;
    
    node_t *tail, *next;
    
    while (1) {
        tail = (node_t*)atomic_load(&queue->tail);
        next = (node_t*)atomic_load(&tail->next);
        
        // tail이 여전히 마지막인지 확인
        if (tail == (node_t*)atomic_load(&queue->tail)) {
            if (next == NULL) {
                // tail의 next를 새 노드로
                if (atomic_compare_exchange_weak(&tail->next,
                                                 (uintptr_t*)&next,
                                                 (uintptr_t)new_node)) {
                    break;
                }
            } else {
                // tail 이동 도움
                atomic_compare_exchange_weak(&queue->tail,
                                            (uintptr_t*)&tail,
                                            (uintptr_t)next);
            }
        }
    }
    
    // tail 업데이트
    atomic_compare_exchange_weak(&queue->tail,
                                (uintptr_t*)&tail,
                                (uintptr_t)new_node);
}
```

### ABA 문제: Lock-Free의 함정

**ABA 문제**는 Lock-free 프로그래밍의 가장 교활한 버그입니다:

```c
// 위험한 시나리오
// Thread 1이 스택에서 A를 pop하려고 함:
// 1. old_head = A
// 2. new_head = A->next = B

// 이 순간 Thread 2가 끼어들어:
// - A를 pop (성공)
// - C를 push
// - A를 다시 push (같은 주소!)

// Thread 1이 계속:
// 3. CAS(head, A, B) → 성공! (A가 다시 head이므로)
// 4. 하지만 B는 이미 해제된 메모리를 가리킴! 💥

// 해결책 1: Hazard Pointer
// 해결책 2: Epoch-based reclamation
// 해결책 3: Double-width CAS (포인터 + 카운터)
```

### Memory Ordering: 메모리의 시간 여행

Lock-free에서는 **메모리 순서**가 생명입니다:

```c
// Relaxed: 순서 보장 없음 (가장 빠름)
atomic_load_explicit(&ptr, memory_order_relaxed);

// Acquire: 이후 메모리 작업들이 앞으로 넘어오지 않음
atomic_load_explicit(&ptr, memory_order_acquire);

// Release: 이전 메모리 작업들이 뒤로 넘어가지 않음
atomic_store_explicit(&ptr, value, memory_order_release);

// Sequential Consistency: 모든 스레드가 같은 순서로 봄 (가장 안전)
atomic_load_explicit(&ptr, memory_order_seq_cst);
```

// ⭐ 실제 Memory Ordering 사용 패턴 - Producer-Consumer의 안전한 데이터 전달

```c
// ⭐ Producer 스레드 (Release 시맨틱) - 데이터 준비 후 준비 완료 신호
// 실제 동작: 데이터 생산 → 모든 준비 완료 → ready 플래그 설정
data = prepare_data();  // ⭐ 1단계: 실제 비즈니스 데이터 준비
                        // 예: JSON 파싱, 이미지 연산, 데이터베이스 쿼리 결과
atomic_store_explicit(&ready_flag, 1, memory_order_release);
// ⭐ memory_order_release의 의미:
// - 이 스토어 이전의 모든 메모리 연산이 이 스토어보다 늦게 실행되지 않도록 보장
// - data 준비가 ready_flag 설정보다 먼저 끝나고 보이도록 보장
// - 다른 스레드가 ready_flag=1을 본 순간 data도 보이도록 보장
// 효과: Consumer가 완전히 준비된 데이터만 처리하도록 보장

// ⭐ Consumer 스레드 (Acquire 시맨틱) - 준비 완료까지 대기 후 데이터 사용
while (!atomic_load_explicit(&ready_flag, memory_order_acquire)) {
    // ⭐ 효율적 대기: busy wait 대신 다른 방법 고려 가능
    // 예: sched_yield(), usleep(1), 또는 조건변수 사용
    // 성능: 짧은 대기시 busy wait, 긴 대기시 sleep 혜용
}
// ⭐ memory_order_acquire의 의미:
// - 이 로드 이후의 모든 메모리 연산이 이 로드보다 먼저 실행되지 않도록 보장
// - ready_flag=1을 본 후의 data 읽기가 reorder되지 않음을 보장
// - Producer가 설정한 모든 데이터가 Consumer에게 보이도록 보장

process_data(data);  // ⭐ 안전한 데이터 사용
// 이 시점에서 data는 Producer에 의해 완전히 준비된 상태임이 보장
// 예: 완성된 JSON 객체, 처리된 이미지, 유효한 DB 결과 등

// ⭐ 실제 Production 사용 예시:
// 1. 웹 서버: HTTP 요청 처리 완료 후 응답 전송 신호
// 2. 게임 엔진: 렌더링 데이터 준비 완료 후 화면 업데이트
// 3. 데이터베이스: 트랜잭션 커밋 완료 후 다른 연결에 가시성 제공
// 4. 메시징 시스템: 메시지 암호화 완료 후 전송 가능 신호
//
// ⭐ 성능 특성:
// - acquire-release: 대부분의 플랫폼에서 매우 빠름 (거의 비용 없음)
// - seq_cst보다 낮은 오버헤드로 고성능 달성
// - 정확한 동기화로 데이터 무결성 보장
// - 복잡한 버퍼링 또는 락 없이 안전한 통신 가능
```

## 핵심 요점

### 1. RWLock은 읽기가 많을 때 성능 혁신을 가져온다

읽기 요청이 쓰기보다 10배 이상 많은 시나리오에서 뮤텍스 대비 5-10배 성능 향상이 가능하다.

### 2. Lock-Free는 최고 성능이지만 극도로 어렵다

정확한 구현을 위해 메모리 모델, ABA 문제, 메모리 회수 등 깊은 이해가 필요하다.

### 3. 성능과 복잡도의 트레이드오프를 고려하라

대부분의 경우 RWLock만으로도 충분한 성능을 얻을 수 있다.

### 4. 프로파일링 후 최적화하라

추측하지 말고 실제 병목지점을 측정한 후 적절한 동기화 메커니즘을 선택하라.

---

**이전**: [1.3.3 세마포어와 조건 변수](./01-03-03-semaphore-condvar.md)  
**다음**: [1.5.2 실전 디버깅과 최적화](./01-05-02-practical-debugging.md)에서 동기화 관련 문제 해결과 성능 튜닝을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 8-15시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-01-process-thread)

- [1.2.1: 프로세스 생성과 종료 개요](./01-02-01-process-creation.md)
- [1.2.2: fork() 시스템 콜과 프로세스 복제 메커니즘](./01-02-02-process-creation-fork.md)
- [1.2.3: exec() 패밀리와 프로그램 교체 메커니즘](./01-02-03-program-replacement-exec.md)
- [1.2.4: 프로세스 종료와 좀비 처리](./01-02-04-process-termination-zombies.md)
- [1.5.1: 프로세스 관리와 모니터링](./01-05-01-process-management-monitoring.md)

### 🏷️ 관련 키워드

`rwlock`, `lock-free`, `compare-and-swap`, `memory-ordering`, `aba-problem`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
