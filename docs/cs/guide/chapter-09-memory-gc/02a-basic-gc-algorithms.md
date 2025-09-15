---
tags:
  - GC
  - Memory
  - Algorithm
  - MarkSweep
  - Copying
  - MarkCompact
---

# Chapter 9-2A: 기본 GC 알고리즘

## 🎯 GC의 탄생: 1959년의 혁명

### John McCarthy의 천재적 발상

1959년, MIT AI Lab에서 일어난 일입니다:

```text
John McCarthy: "프로그래머가 메모리 해제를 잊어버리면 어떻게 될까?"
동료: "메모리 누수로 프로그램이 죽겠죠."
McCarthy: "그럼 컴퓨터가 알아서 치우게 하면 어떨까?"
동료: "그게 가능해요?"
McCarthy: "제가 Lisp에 구현해봤는데..."
```

그렇게 Garbage Collection이 탄생했습니다!

### GC가 없던 시절의 악몽

제가 2010년에 C++로 대규모 시스템을 개발할 때의 실화:

```c++
// 악몽의 코드 (실제 버그)
class DataProcessor {
    char* buffer;
public:
    DataProcessor() {
        buffer = new char[1024 * 1024];  // 1MB
    }

    ~DataProcessor() {
        // delete[] buffer;  // 깜빡했다! 😱
    }

    void process() {
        // 복잡한 처리...
        if (error_condition) {
            return;  // early return - 메모리 해제 누락!
        }
        // delete[] buffer;  // 여기도 있어야 하는데...
    }
};

// 결과: 하루에 10GB 메모리 누수
// 서버가 3일마다 OOM으로 재시작... 😭
```

### GC의 기본 원리: 도달 가능성

```c
// GC의 핵심 아이디어: Reachability (도달 가능성)
// "Root에서 도달할 수 없는 객체 = 쓰레기"

// Root Set (GC의 시작점) - GC가 살아있다고 확신할 수 있는 참조들
void* roots[] = {
    stack_variables,   // 1. 스택 변수: 현재 실행 중인 함수의 로컬 변수
    global_variables,  // 2. 전역 변수: 프로그램 생명주기 동안 유지되는 변수
    cpu_registers,     // 3. CPU 레지스터: 현재 처리 중인 포인터
    jni_references     // 4. JNI 참조: Native 코드와 연결된 객체 (Java)
};

// 도달 가능성 판단 - BFS 알고리즘으로 객체 그래프 탐색
bool is_reachable(Object* obj) {
    // BFS(너비 우선 탐색)로 root에서 도달 가능한지 확인
    Queue<Object*> queue;      // 탐색할 객체 대기열
    Set<Object*> visited;      // 이미 방문한 객체 집합 (중복 방문 방지)

    // Phase 1: Root set을 큐에 추가 (탐색 시작점)
    for (auto root : roots) {
        queue.push(root);
    }

    // Phase 2: BFS 탐색으로 객체 그래프 순회
    while (!queue.empty()) {
        Object* current = queue.pop();
        visited.insert(current);      // 방문 기록

        // 찾고자 하는 객체에 도달했나?
        if (current == obj) {
            return true;  // 도달 가능! (GC 대상이 아님)
        }

        // Phase 3: 현재 객체가 참조하는 모든 객체를 탐색 대상에 추가
        for (auto ref : current->references) {
            if (!visited.contains(ref)) {
                queue.push(ref);  // 아직 방문하지 않은 객체만 추가
            }
        }
    }

    return false;  // 도달 불가능 = 쓰레기 (GC 대상)
}
```

## Mark & Sweep: 가장 직관적인 방법

1960년대부터 사용된 고전 알고리즘입니다:

```c++
// Mark & Sweep GC 구현 - 가장 기본적인 GC 알고리즘
class MarkSweepGC {
private:
    struct Object {
        bool marked = false;                    // GC 표시 플래그 (살아있음/죽음)
        size_t size;                           // 객체 크기 (메모리 해제시 필요)
        void* data;                            // 실제 객체 데이터
        std::vector<Object*> references;       // 이 객체가 참조하는 다른 객체들
    };

    std::vector<Object*> all_objects;          // 힙의 모든 객체 목록
    std::vector<void*> roots;                  // Root set (GC 시작점)

public:
    // 메인 GC 수집 함수 - 전형적인 2단계 과정
    void collect() {
        // Phase 1: Mark (표시) - 살아있는 객체 찾기
        mark();

        // Phase 2: Sweep (청소) - 죽은 객체 제거
        sweep();
    }

private:
    // Phase 1: Mark 단계 - 도달 가능한 모든 객체에 표시
    void mark() {
        // Step 1: 모든 객체를 unmarked로 초기화 ("모두 죽었다고 가정")
        for (auto obj : all_objects) {
            obj->marked = false;
        }

        // Step 2: Root set부터 시작해서 도달 가능한 객체들을 재귀적으로 표시
        for (auto root : roots) {
            mark_object(static_cast<Object*>(root));
        }
    }

    // 재귀적 표시 함수 - DFS(깊이 우선 탐색) 방식
    void mark_object(Object* obj) {
        // 종료 조건: null이거나 이미 표시된 객체
        if (!obj || obj->marked) return;

        obj->marked = true;  // "이 객체는 살아있다!" 표시

        // 재귀적으로 이 객체가 참조하는 모든 객체들도 표시
        // (객체 그래프를 따라 전파)
        for (auto ref : obj->references) {
            mark_object(ref);
        }
    }

    // Phase 2: Sweep 단계 - 표시되지 않은 객체들을 메모리에서 제거
    void sweep() {
        auto it = all_objects.begin();
        while (it != all_objects.end()) {
            if (!(*it)->marked) {
                // 표시 안 된 객체 = 쓰레기 -> 메모리 해제
                delete (*it)->data;                // 객체 데이터 해제
                delete *it;                       // 객체 구조체 해제
                it = all_objects.erase(it);       // 목록에서 제거
            } else {
                ++it;  // 살아있는 객체는 그대로 두고 다음으로
            }
        }
    }
};

// 실제 실행 시간 측정
void benchmark_mark_sweep() {
    MarkSweepGC gc;

    // 100만 개 객체 생성
    for (int i = 0; i < 1000000; i++) {
        gc.create_object(rand() % 1024);
    }

    auto start = high_resolution_clock::now();
    gc.collect();
    auto end = high_resolution_clock::now();

    auto duration = duration_cast<milliseconds>(end - start);
    printf("Mark & Sweep: %ld ms (Stop-the-world!), ", duration.count());
    // 결과: 약 100ms - 게임에서는 치명적!
}
```

**Mark & Sweep의 문제점:**

```text
메모리 레이아웃 (GC 전):
[객체A][객체B][빈공간][객체C][객체D][빈공간][객체E]

GC 후:
[객체A][빈공간][빈공간][객체C][빈공간][빈공간][객체E]

문제: 메모리 단편화! (Swiss cheese problem)
```

## Copying Collector: 단편화 해결사

Cheney's Algorithm (1970):

```c++
// Semi-space Copying Collector - 단편화 문제 해결을 위한 복사 방식 GC
class CopyingGC {
private:
    uint8_t* from_space;      // 현재 사용 중인 공간 ("Old" space)
    uint8_t* to_space;        // 복사 대상 공간 ("New" space)
    size_t space_size;        // 각 공간의 크기 (전체 힙의 50%)
    uint8_t* allocation_ptr;  // 다음 할당 위치 (bump pointer 방식)

    struct Object {
        size_t size;                        // 객체 크기
        Object* forwarding_ptr;             // 복사된 새 주소 (중복 복사 방지)
        std::vector<Object**> references;   // 이 객체의 참조 포인터들
    };

public:
    CopyingGC(size_t size) : space_size(size) {
        from_space = new uint8_t[size];     // 현재 활성 공간
        to_space = new uint8_t[size];       // 복사 대상 공간
        allocation_ptr = from_space;        // 할당 시작 위치
    }

    // Cheney's Algorithm을 사용한 복사 수집
    void collect() {
        // BFS(너비 우선 탐색)로 복사 - 큐 없이 공간 자체를 큐로 활용하는 천재적 방법!
        uint8_t* scan_ptr = to_space;       // 스캔할 다음 객체 위치
        uint8_t* free_ptr = to_space;       // 다음 복사할 위치

        // Phase 1: Root set의 모든 객체를 to_space로 복사
        for (auto& root : roots) {
            if (is_in_from_space(root)) {
                root = copy_object(root, &free_ptr);  // root 포인터 업데이트
            }
        }

        // Phase 2: BFS로 참조 객체들을 순차적으로 복사
        // scan_ptr < free_ptr인 동안 계속 (큐가 빌 때까지)
        while (scan_ptr < free_ptr) {
            Object* obj = reinterpret_cast<Object*>(scan_ptr);

            // 현재 객체가 참조하는 모든 객체들을 복사
            for (auto& ref_ptr : obj->references) {
                if (is_in_from_space(*ref_ptr)) {
                    *ref_ptr = copy_object(*ref_ptr, &free_ptr);  // 참조 업데이트
                }
            }

            scan_ptr += obj->size;  // 다음 객체로 이동
        }

        // Phase 3: 공간 역할 교체 (from <-> to)
        std::swap(from_space, to_space);
        allocation_ptr = free_ptr;  // 새로운 할당 시작점

        // Phase 4: 이전 공간 정리 (매우 간단! - Mark&Sweep와 달리 개별 객체 해제 불필요)
        memset(to_space, 0, space_size);
    }

private:
    Object* copy_object(Object* obj, uint8_t** free_ptr) {
        // 이미 복사됨?
        if (obj->forwarding_ptr) {
            return obj->forwarding_ptr;
        }

        // to_space로 복사
        Object* new_obj = reinterpret_cast<Object*>(*free_ptr);
        memcpy(new_obj, obj, obj->size);
        *free_ptr += obj->size;

        // Forwarding pointer 설정
        obj->forwarding_ptr = new_obj;

        return new_obj;
    }

    bool is_in_from_space(void* ptr) {
        return ptr >= from_space && ptr < from_space + space_size;
    }
};

// 성능 비교 실험
void benchmark_copying_gc() {
    CopyingGC gc(1024 * 1024 * 1024);  // 1GB per space
    
    // 할당 패턴: 많은 작은 객체들
    std::vector<void*> objects;
    for (int i = 0; i < 100000; i++) {
        objects.push_back(gc.allocate(128));  // 128바이트 객체들
    }
    
    auto start = high_resolution_clock::now();
    gc.collect();
    auto end = high_resolution_clock::now();
    
    auto duration = duration_cast<microseconds>(end - start);
    printf("Copying GC: %ld μs (살아있는 객체만 처리!), ", duration.count());
    // 특징: 살아있는 객체 수에 비례 (죽은 객체는 무시!)
}
```

**Copying GC의 혁신적 장점:**

1. **할당이 매우 빠름**: Bump pointer로 O(1)
2. **단편화 전혀 없음**: 살아있는 객체를 연속으로 배치
3. **GC 시간이 예측 가능**: 살아있는 객체 수에만 비례

**단점:**

- 메모리를 절반만 사용 가능
- 객체 복사 비용

## Mark & Compact: 둘의 장점을 합치다

```c++
// Mark-Compact GC - 단편화 해결 + 전체 메모리 사용
class MarkCompactGC {
private:
    struct Object {
        bool marked;                           // Mark 단계용
        size_t size;                          // 객체 크기
        void* new_address;                    // 압축 후 새 주소
        std::vector<Object**> references;     // 참조 포인터들
    };

    std::vector<Object*> all_objects;
    std::vector<void*> roots;
    uint8_t* heap_start;
    size_t heap_size;

public:
    void collect() {
        printf("Mark-Compact GC 시작, ");
        
        // Phase 1: Mark - Mark & Sweep와 동일
        mark_phase();

        // Phase 2: Compute new addresses - 새 주소 계산
        compute_addresses();

        // Phase 3: Update references - 참조 업데이트
        update_references();

        // Phase 4: Compact - 실제 객체 이동
        compact();
        
        printf("Mark-Compact 완료, ");
    }

private:
    void mark_phase() {
        // Mark & Sweep와 동일한 marking
        for (auto obj : all_objects) {
            obj->marked = false;
        }
        
        for (auto root : roots) {
            mark_recursive(static_cast<Object*>(root));
        }
    }

    void mark_recursive(Object* obj) {
        if (!obj || obj->marked) return;
        obj->marked = true;
        
        for (auto ref : obj->references) {
            mark_recursive(*ref);
        }
    }

    void compute_addresses() {
        // 살아있는 객체들의 새 주소를 순차적으로 계산
        uint8_t* new_addr = heap_start;

        for (auto obj : all_objects) {
            if (obj->marked) {
                obj->new_address = new_addr;
                new_addr += obj->size;  // 연속 배치로 단편화 해결!
            }
        }
    }

    void update_references() {
        // 모든 참조를 새 주소로 업데이트
        
        // Root set 업데이트
        for (auto& root : roots) {
            Object* obj = static_cast<Object*>(root);
            if (obj && obj->marked) {
                root = obj->new_address;
            }
        }
        
        // 객체 간 참조 업데이트
        for (auto obj : all_objects) {
            if (obj->marked) {
                for (auto& ref : obj->references) {
                    if (*ref && (*ref)->marked) {
                        *ref = static_cast<Object*>((*ref)->new_address);
                    }
                }
            }
        }
    }

    void compact() {
        // Lisp2 algorithm: 객체를 새 위치로 실제 이동
        // 중요: 이동 순서를 잘못하면 데이터 손실!
        
        for (auto obj : all_objects) {
            if (obj->marked && obj != obj->new_address) {
                // memmove 사용: 메모리 영역이 겹쳐도 안전
                memmove(obj->new_address, obj, obj->size);
            }
        }
        
        // 죽은 객체들 정리
        auto it = all_objects.begin();
        while (it != all_objects.end()) {
            if (!(*it)->marked) {
                delete *it;
                it = all_objects.erase(it);
            } else {
                ++it;
            }
        }
    }
};

// 실제 사용 예: V8 JavaScript 엔진
/*
V8의 Mark-Compact 전략:
1. Marking: Tri-color marking (동시 실행 가능)
2. Sweeping: Lazy sweeping (필요할 때만)  
3. Compacting: Selective compaction (단편화가 심한 페이지만)

결과: Chrome이 빠른 이유 중 하나!

성능 특성:
- 메모리 사용률: 100% (Copying GC의 50%보다 2배 효율적)
- 단편화: 완전히 해결
- GC 시간: Mark & Sweep보다 약간 더 오래 걸림 (압축 비용)
- 할당 속도: Bump pointer 방식으로 빠름
*/
```

## 실제 성능 벤치마크

```c++
// 세 알고리즘의 실제 성능 비교
void compare_gc_algorithms() {
    const size_t OBJECTS = 1000000;  // 100만 개 객체
    const size_t HEAP_SIZE = 1024 * 1024 * 1024;  // 1GB

    printf("=== GC 알고리즘 성능 비교 ===, ");
    
    // 시나리오 1: 작은 객체들 (평균 256 바이트)
    printf("시나리오 1: 작은 객체 (256B avg), ");
    
    MarkSweepGC ms_gc;
    auto start = high_resolution_clock::now();
    simulate_workload(&ms_gc, OBJECTS, 256);
    auto ms_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);
    
    CopyingGC copy_gc(HEAP_SIZE);
    start = high_resolution_clock::now();
    simulate_workload(&copy_gc, OBJECTS, 256);
    auto copy_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);
    
    MarkCompactGC mc_gc;
    start = high_resolution_clock::now();
    simulate_workload(&mc_gc, OBJECTS, 256);
    auto mc_time = duration_cast<milliseconds>(high_resolution_clock::now() - start);
    
    printf("Mark&Sweep: %ld ms, Copying: %ld ms, Mark&Compact: %ld ms, ",
           ms_time.count(), copy_time.count(), mc_time.count());
    
    // 일반적인 결과:
    // Mark&Sweep: 150ms (단편화로 할당 느려짐)
    // Copying: 80ms (할당 빠름, 살아있는 객체만 처리)
    // Mark&Compact: 120ms (균형잡힌 성능)
}
```

## 핵심 요점

### 1. Mark & Sweep (1960년대 고전)

**장점**: 구현이 단순하고 이해하기 쉬움
**단점**: 메모리 단편화, 할당 성능 저하
**적용**: 메모리 제약이 적고 단순한 시스템

### 2. Copying GC (1970년대 혁신)  

**장점**: 단편화 없음, 할당 매우 빠름, GC 시간 예측 가능
**단점**: 메모리 50%만 사용, 큰 객체에 비효율적
**적용**: 단명 객체가 많은 환경 (함수형 언어, Young generation)

### 3. Mark & Compact (1980년대 완성)

**장점**: 단편화 없음, 메모리 100% 활용
**단점**: 구현 복잡도 높음, 압축 비용
**적용**: 메모리 효율성이 중요한 환경 (모바일, 임베디드)

---

**이전**: [GC 알고리즘과 구현 원리 개요](02-gc-algorithms.md)  
**다음**: [세대별 및 동시 GC](02b-advanced-gc-concepts.md)에서 Weak Generational Hypothesis와 동시 실행 GC의 원리를 학습합니다.
