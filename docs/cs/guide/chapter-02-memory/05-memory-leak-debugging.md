---
tags:
  - Memory
  - Debugging
  - Valgrind
  - AddressSanitizer
  - Profiling
  - Leak
---

# 2-5: 메모리 누수 디버깅 - "메모리가 계속 증가해요"

## 이 문서를 읽으면 답할 수 있는 질문들

- 메모리가 계속 증가하는 이유를 어떻게 찾나요?
- Valgrind와 AddressSanitizer 중 언제 무엇을 써야 하나요?
- /proc/[pid]/maps와 smaps를 어떻게 해석하나요?
- 메모리 프로파일링으로 무엇을 알 수 있나요?
- 메모리 누수 없이 프로그램을 작성하는 방법은?

## 들어가며: 메모리 누수의 공포

서버를 운영하다 보면 이런 경험이 있을 거예요:

"처음엔 잘 돌아가던 서비스가 시간이 지나면서 점점 느려지더니, 결국 OOM(Out of Memory)으로 죽어버렸어요..."

```mermaid
graph LR
    subgraph "정상적인 메모리 사용"
        T1[시작: 100MB] --> T2[1시간 후: 120MB]
        T2 --> T3[2시간 후: 125MB]
        T3 --> T4[3시간 후: 130MB]
        style T4 fill:#c8e6c9
    end
    
    subgraph "메모리 누수 발생"
        L1[시작: 100MB] --> L2[1시간 후: 200MB]
        L2 --> L3[2시간 후: 500MB]
        L3 --> L4[3시간 후: 1.2GB]
        L4 --> L5[4시간 후: 💀 OOM Killed]
        style L5 fill:#ffcccb
    end
```text

메모리 누수는 **조용한 살인자**입니다. 처음엔 별 문제 없어 보이다가 시간이 지나면서 서서히 시스템을 죽입니다.

### 메모리 누수가 생기는 이유

```mermaid
mindmap
  root((메모리 누수 원인))
    직접적 누수
      malloc/free 불일치
      new/delete 불일치
      리소스 해제 미호출
      exception 발생 시 누수
    간접적 누수
      순환 참조
      이벤트 리스너 미해제
      캐시 무한 증가
      스레드 정리 안됨
    도구 문제
      라이브러리 버그
      메모리 풀 설정 오류
      GC 설정 문제
      컨테이너 제한 무시
```text

각각을 체계적으로 찾고 해결하는 방법을 배워보겠습니다.

## 1. 메모리 누수 진단 프로세스

### 1.1 첫 번째 단계: 누수 여부 확인

메모리 누수가 정말 있는지부터 확인해야 합니다:

```bash
# 1. 프로세스 메모리 사용량 실시간 모니터링
$ watch -n 1 'ps -p <PID> -o pid,vsz,rss,pmem,cmd'

# 2. 시스템 전체 메모리 상황
$ watch -n 1 'free -h && echo "---" && ps aux --sort=-rss | head -10'

# 3. 특정 프로세스의 상세 메모리 정보
$ watch -n 1 'cat /proc/<PID>/status | grep -E "(VmSize|VmRSS|VmHWM|VmData)"'
```text

**메모리 지표 해석**:

```mermaid
graph TD
    subgraph "메모리 지표 이해"
        VSZ["VSZ (Virtual Size), 가상 메모리 총 크기"] 
        RSS["RSS (Resident Set Size), 실제 물리 메모리 사용량"]
        PSS["PSS (Proportional Set Size), 공유 메모리 포함한 실제 사용량"]
        USS["USS (Unique Set Size), 해당 프로세스만 사용하는 메모리"]
    end
    
    subgraph "누수 패턴"
        NORMAL["정상: RSS 안정적"] 
        LEAK["누수: RSS 계속 증가"]
    end
    
    VSZ --> NORMAL
    RSS --> LEAK
    
    style NORMAL fill:#c8e6c9
    style LEAK fill:#ffcccb
```text

### 1.2 메모리 사용 패턴 분석

```bash
# 메모리 사용 패턴 로그 생성
#!/bin/bash
# memory_monitor.sh
while true; do
    echo "$(date): $(ps -p $1 -o pid,vsz,rss --no-headers)" >> memory_usage.log
    sleep 60
done
```text

**패턴 분석 예시**:

```bash
# 로그 분석
$ tail -f memory_usage.log
2024-01-01 10:00: 1234  52000 45000
2024-01-01 10:01: 1234  52100 45100   # 100KB 증가
2024-01-01 10:02: 1234  52200 45200   # 계속 증가 중 (누수 의심!)
2024-01-01 10:03: 1234  52150 45150   # 약간 감소 (정상 변동)
```text

## 2. Valgrind로 메모리 누수 잡기

### 2.1 Valgrind 기본 사용법

Valgrind는 메모리 디버깅의 **황금 표준**입니다:

```bash
# 기본 메모리 누수 검사
$ valgrind --leak-check=full --show-leak-kinds=all ./program

# 상세 분석 옵션
$ valgrind \
    --leak-check=full \
    --show-leak-kinds=all \
    --track-origins=yes \
    --verbose \
    --log-file=valgrind.log \
    ./program
```text

**Valgrind 출력 해석**:

```mermaid
graph TD
    subgraph "Valgrind 누수 분류"
        DEF["Definitely lost, 확실한 누수"]
        IND["Indirectly lost, 간접 누수"]
        POS["Possibly lost, 가능한 누수"]
        REACH["Still reachable, 도달 가능"]
    end
    
    DEF --> CRITICAL["🚨 즉시 수정 필요"]
    IND --> CRITICAL
    POS --> CHECK["🔍 확인 필요"]
    REACH --> NORMAL["✅ 정상 (종료 시 정리됨)"]
    
    style CRITICAL fill:#ffcccb
    style CHECK fill:#fff3e0
    style NORMAL fill:#c8e6c9
```text

### 2.2 실제 누수 사례와 해결

**사례 1: 단순 malloc 누수**

```c
// 누수 코드
void process_data() {
    char *buffer = malloc(1024);
    if (some_error_condition) {
        return;  // malloc된 메모리 누수!
    }
    process(buffer);
    free(buffer);
}
```text

Valgrind 출력:

```bash
==1234== 1,024 bytes in 1 blocks are definitely lost
==1234==    at malloc (vg_replace_malloc.c:309)
==1234==    by process_data (leak.c:5)
==1234==    by main (leak.c:15)
```text

**해결책**:

```c
// 수정된 코드
void process_data() {
    char *buffer = malloc(1024);
    if (some_error_condition) {
        free(buffer);  // 에러 경로에서도 정리
        return;
    }
    process(buffer);
    free(buffer);
}
```text

**사례 2: C++ 순환 참조 누수**

```cpp
// 누수 코드
class Node {
public:
    std::shared_ptr<Node> next;
    std::weak_ptr<Node> parent;  // 이게 shared_ptr이면 순환 참조!
};

void create_cycle() {
    auto a = std::make_shared<Node>();
    auto b = std::make_shared<Node>();
    a->next = b;
    b->parent = a;  // weak_ptr이므로 순환 참조 방지됨
}
```text

### 2.3 Valgrind 고급 기법

```bash
# 특정 함수만 추적
$ valgrind --trace-malloc=yes --demangle=yes ./program

# 메모리 사용량 프로파일링
$ valgrind --tool=massif ./program
$ ms_print massif.out.1234

# 캐시 미스 분석 (성능 관련)
$ valgrind --tool=cachegrind ./program
$ cg_annotate cachegrind.out.1234
```text

## 3. AddressSanitizer (ASan) 활용

### 3.1 ASan vs Valgrind 비교

```mermaid
graph LR
    subgraph "Valgrind"
        V1[장점: 완벽한 분석] 
        V2[단점: 50-100x 느림]
    end
    
    subgraph "AddressSanitizer"  
        A1[장점: 2-3x 속도]
        A2[단점: 컴파일 시 설정 필요]
    end
    
    subgraph "사용 시나리오"
        DEV[개발 중: ASan]
        QA[테스트: Valgrind]
        PROD[운영: 모니터링]
    end
    
    A1 --> DEV
    V1 --> QA
```text

### 3.2 ASan 사용법

```bash
# 컴파일 시 ASan 활성화
$ gcc -fsanitize=address -g -o program program.c

# 런타임 옵션 설정
$ export ASAN_OPTIONS="detect_leaks=1:abort_on_error=1:detect_stack_use_after_return=1"
$ ./program
```text

**ASan 출력 예시**:

```bash
=================================================================
==1234==ERROR: LeakSanitizer: detected memory leaks

Direct leak of 1024 byte(s) in 1 object(s) allocated from:
    #0 0x4c2db8 in __interceptor_malloc
    #1 0x4007f6 in process_data program.c:5
    #2 0x400856 in main program.c:15

SUMMARY: AddressSanitizer: 1024 byte(s) leaked in 1 allocation(s).
```text

## 4. 시스템 레벨 메모리 분석

### 4.1 /proc/[pid]/maps 해석

```bash
# 프로세스 메모리 맵 확인
$ cat /proc/1234/maps
```text

**출력 해석**:

```bash
주소 범위                 권한 오프셋   디바이스  inode 경로
7f8b4c000000-7f8b4c021000 r-xp 00000000 08:01 131 /lib64/ld-linux-x86-64.so.2
```text

```mermaid
graph TD
    subgraph "메모리 권한"
        R[r: 읽기]
        W[w: 쓰기] 
        X[x: 실행]
        P[p: 프라이빗]
        S[s: 공유]
    end
    
    subgraph "일반적인 패턴"
        TEXT["r-xp: 코드 섹션"]
        DATA["rw-p: 데이터 섹션"]
        HEAP["rw-p: 힙 영역"]
        STACK["rw-p: 스택 영역"]
    end
```text

### 4.2 /proc/[pid]/smaps 상세 분석

```bash
# 상세 메모리 정보
$ cat /proc/1234/smaps | head -20

# 힙 영역만 추출
$ cat /proc/1234/smaps | grep -A 15 "\[heap\]"
```text

**중요한 지표들**:

```bash
Size:               1024 kB  # 가상 메모리 크기
Rss:                 512 kB  # 실제 물리 메모리
Pss:                 256 kB  # 비례 할당된 메모리
Shared_Clean:         64 kB  # 공유된 깨끗한 페이지
Shared_Dirty:         32 kB  # 공유된 더러운 페이지
Private_Clean:       128 kB  # 프라이빗 깨끗한 페이지
Private_Dirty:       288 kB  # 프라이빗 더러운 페이지
```text

## 5. 실무 메모리 디버깅 워크플로우

### 5.1 체계적 접근법

```mermaid
flowchart TD
    START[메모리 문제 발견] --> MONITOR{모니터링}
    MONITOR -->|사용량 증가| LEAK_SUSPECTED[누수 의심]
    MONITOR -->|사용량 안정| OTHER[다른 문제]
    
    LEAK_SUSPECTED --> QUICK[빠른 진단: ASan]
    QUICK --> DETAILED[상세 분석: Valgrind]
    DETAILED --> FIX[코드 수정]
    FIX --> VERIFY[수정 검증]
    
    OTHER --> PROFILE[성능 프로파일링]
    PROFILE --> OPTIMIZE[최적화]
```text

### 5.2 메모리 누수 방지 체크리스트

**코딩 단계**:

- [ ] 모든 malloc/new에 대응하는 free/delete 확인
- [ ] 예외 처리 경로에서도 메모리 정리
- [ ] RAII 패턴 사용 (C++)
- [ ] 스마트 포인터 적절한 사용
- [ ] 순환 참조 회피

**테스트 단계**:

- [ ] ASan으로 개발 중 상시 검사
- [ ] CI/CD에 Valgrind 검사 포함
- [ ] 장기 실행 테스트 수행
- [ ] 다양한 에러 상황 테스트

**운영 단계**:

- [ ] 메모리 사용량 모니터링 설정
- [ ] 임계치 초과 시 알림 설정
- [ ] 주기적인 메모리 프로파일링
- [ ] 코어 덤프 분석 체계 구축

## 6. 고급 메모리 디버깅 기법

### 6.1 커스텀 메모리 할당자 디버깅

```c
// 디버깅용 malloc 래퍼
#ifdef DEBUG_MALLOC
static size_t allocated_bytes = 0;
static int allocation_count = 0;

void* debug_malloc(size_t size) {
    void* ptr = malloc(size + sizeof(size_t));
    if (ptr) {
        *(size_t*)ptr = size;
        allocated_bytes += size;
        allocation_count++;
        printf("ALLOC: %zu bytes at %p (total: %zu bytes, count: %d), ", 
               size, (char*)ptr + sizeof(size_t), allocated_bytes, allocation_count);
        return (char*)ptr + sizeof(size_t);
    }
    return NULL;
}

void debug_free(void* ptr) {
    if (ptr) {
        char* real_ptr = (char*)ptr - sizeof(size_t);
        size_t size = *(size_t*)real_ptr;
        allocated_bytes -= size;
        allocation_count--;
        printf("FREE: %zu bytes at %p (total: %zu bytes, count: %d), ", 
               size, ptr, allocated_bytes, allocation_count);
        free(real_ptr);
    }
}

#define malloc(size) debug_malloc(size)
#define free(ptr) debug_free(ptr)
#endif
```text

### 6.2 메모리 사용 패턴 시각화

```python
#!/usr/bin/env python3
# memory_visualizer.py
import matplotlib.pyplot as plt
import re
import sys

def parse_memory_log(filename):
    timestamps = []
    rss_values = []
    
    with open(filename) as f:
        for line in f:
            match = re.search(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*rss:(\d+)', line)
            if match:
                timestamps.append(match.group(1))
                rss_values.append(int(match.group(2)))
    
    return timestamps, rss_values

def plot_memory_usage(timestamps, rss_values):
    plt.figure(figsize=(12, 6))
    plt.plot(range(len(rss_values)), rss_values, 'b-', linewidth=2)
    plt.title('Memory Usage Over Time')
    plt.xlabel('Time')
    plt.ylabel('RSS (KB)')
    plt.grid(True)
    
    # 누수 패턴 감지
    if len(rss_values) > 10:
        trend = (rss_values[-1] - rss_values[0]) / len(rss_values)
        if trend > 100:  # 시간당 100KB 이상 증가
            plt.text(0.02, 0.98, f'POTENTIAL LEAK: +{trend:.1f}KB/sample', 
                    transform=plt.gca().transAxes, 
                    bbox=dict(boxstyle="round,pad=0.3", facecolor="red", alpha=0.7),
                    color='white', fontweight='bold')
    
    plt.show()

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python memory_visualizer.py <memory_log_file>")
        sys.exit(1)
    
    timestamps, rss_values = parse_memory_log(sys.argv[1])
    plot_memory_usage(timestamps, rss_values)
```text

## 7. 정리와 다음 단계

메모리 누수는 예방이 최선입니다. 체계적인 디버깅 프로세스와 적절한 도구를 사용하면, 대부분의 누수는 개발 단계에서 잡을 수 있습니다.

**핵심 기억사항**:

- 🔍 **조기 발견**: ASan을 개발 중 상시 사용
- 🛠️ **정확한 진단**: Valgrind로 상세 분석
- 📊 **지속적 모니터링**: 운영 중 메모리 사용량 추적
- 🔄 **체계적 접근**: 문제 → 진단 → 수정 → 검증

다음 섹션 [2-6: 메모리 할당자 선택과 최적화](06-memory-allocator.md)에서는 malloc이 느릴 때의 해결책을 다뤄보겠습니다.

메모리 누수 없는 안정적인 서비스를 만들어봅시다! 🚀
