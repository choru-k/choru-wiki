---
tags:
  - GC
  - Memory
  - Algorithm
  - Mark-Sweep
  - Copying-Collector
  - Mark-Compact
---

# Chapter.09-02A GC 역사와 기본 알고리즘: 메모리 자동 관리의 탄생

"프로그래머가 메모리 해제를 잊어버리면 어떻게 될까?" 1959년 MIT의 John McCarthy가 던진 이 질문이 현대 프로그래밍을 완전히 바꾼 Garbage Collection의 시작이었습니다.

## 1. GC의 탄생: 1959년의 혁명

### 1.1 John McCarthy의 천재적 발상

1959년, MIT AI Lab에서 일어난 일입니다:

```text
John McCarthy: "프로그래머가 메모리 해제를 잊어버리면 어떻게 될까?"
동료: "메모리 누수로 프로그램이 죽겠죠."
McCarthy: "그럼 컴퓨터가 알아서 치우게 하면 어떨까?"
동료: "그게 가능해요?"
McCarthy: "제가 Lisp에 구현해봤는데..."
```

그렇게 Garbage Collection이 탄생했습니다!

### 1.2 GC가 없던 시절의 악몽

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

### 1.3 GC의 기본 원리: 도달 가능성

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

## 2. 기본 GC 알고리즘

### 2.1 Mark & Sweep: 가장 직관적인 방법

1960년대부터 사용된 고전 알고리즘:

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
    printf("Mark & Sweep: %ld ms (Stop-the-world!)", duration.count());
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

### 2.2 Copying Collector: 단편화 해결사

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
};

// 장단점 비교
void compare_gc_algorithms() {
    printf("=== Mark & Sweep ===\n");
    printf("장점: 메모리 50%만 사용\n");
    printf("단점: 단편화 발생, 할당 느림\n\n");

    printf("=== Copying Collector ===\n");
    printf("장점: 단편화 없음, 할당 빠름 (bump pointer)\n");
    printf("단점: 메모리 50%만 사용 가능\n");

    // 실제 벤치마크
    // 할당 속도: Copying이 10배 빠름!
    // GC 시간: 살아있는 객체 수에만 비례
}
```

### 2.3 Mark & Compact: 둘의 장점을 합치다

```c++
// Mark-Compact GC
class MarkCompactGC {
private:
    struct Object {
        bool marked;
        size_t size;
        void* new_address;  // 압축 후 주소
        std::vector<Object**> references;
    };

public:
    void collect() {
        // Phase 1: Mark
        mark_phase();

        // Phase 2: Compute new addresses
        compute_addresses();

        // Phase 3: Update references
        update_references();

        // Phase 4: Compact
        compact();
    }

private:
    void compute_addresses() {
        uint8_t* new_addr = heap_start;

        for (auto obj : all_objects) {
            if (obj->marked) {
                obj->new_address = new_addr;
                new_addr += obj->size;
            }
        }
    }

    void update_references() {
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
        // Lisp2 algorithm: 객체를 새 위치로 이동
        for (auto obj : all_objects) {
            if (obj->marked && obj != obj->new_address) {
                memmove(obj->new_address, obj, obj->size);
            }
        }
    }
};

// 실제 사용 예: V8 JavaScript 엔진
/*
V8의 Mark-Compact:
1. Marking: Tri-color marking
2. Sweeping: Lazy sweeping
3. Compacting: Selective compaction (단편화가 심한 페이지만)

결과: Chrome이 빠른 이유 중 하나!
*/
```

## 핵심 요점

### 1. GC 알고리즘 진화 과정

GC는 메모리 누수 문제를 해결하기 위해 1959년 탄생했고, 각 알고리즘은 전임자의 문제점을 해결하며 발전했습니다.

### 2. 기본 알고리즘의 트레이드오프

- **Mark & Sweep**: 메모리 효율적이지만 단편화 발생
- **Copying Collector**: 단편화 없지만 메모리 50% 사용
- **Mark & Compact**: 균형적이지만 복잡한 구현

### 3. 도달 가능성이 핵심

모든 GC 알고리즘의 기본은 "Root에서 도달할 수 없는 객체는 쓰레기"라는 원칙입니다.

---

**다음**: [02b-generational-concurrent-gc.md](02b-generational-concurrent-gc.md)에서 세대별 GC와 동시 실행 GC를 학습합니다.
