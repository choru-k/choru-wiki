---
tags:
  - CPU
  - Performance
  - Profiling
  - FlameGraph
---

# 11.2 CPU 성능 최적화

> "CPU를 100% 쓰는데 뭘 하는지 모르겠어요" - 가장 흔한 성능 문제

## 🎯 실무 시나리오

### 문제 상황

```bash
# 서버 모니터링 알람 발생
htop
# CPU: 98.7% (4코어 모두 100% 근처)
# Load average: 8.2, 7.8, 6.5

# 애플리케이션 응답 지연
curl -w "%{time_total}" http://localhost:8080/api/heavy
# 응답시간: 15.2초 (평소 200ms)
```

### 해결해야 할 질문들

1. **어떤 함수가** CPU를 많이 쓰는가?
2. **왜** 그 함수가 느린가?
3. **어떻게** 최적화할 수 있는가?
4. **얼마나** 개선되었는가?

---

## 🔍 CPU Profiling 마스터

### perf: Linux 성능 분석의 핵심 도구

#### 기본 사용법

```bash
# 1. 실시간 CPU 핫스팟 확인
perf top
# 결과 해석:
# 25.00%  myapp     [.] heavy_computation    <- 가장 많은 CPU 사용
# 15.00%  libc      [.] malloc
# 10.00%  myapp     [.] data_processing

# 2. 프로그램 전체 프로파일링
perf record -g ./myapp
perf report

# 3. 특정 프로세스 프로파일링  
perf record -g -p $(pgrep myapp) sleep 30
```

#### 고급 프로파일링 옵션

```bash
# 높은 frequency로 정확한 측정
perf record -F 4000 -g ./myapp

# 특정 CPU 이벤트만 측정
perf record -e cycles,instructions,cache-misses ./myapp

# Call graph 포함 (함수 호출 관계)
perf record --call-graph dwarf ./myapp

# 결과를 다양한 형태로 분석
perf report --sort=dso,symbol
perf report --sort=cpu
```

---

## 🔥 FlameGraph: 시각적 성능 분석

### FlameGraph 생성

```bash
# 1. perf 데이터 수집
perf record -F 99 -g ./myapp

# 2. FlameGraph 생성
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg

# 3. 브라우저에서 열기
firefox flame.svg
```

### FlameGraph 해석 방법

#### 가로축: 시간 비율 (넓을수록 많은 CPU 시간)

```text
|████████████████| heavy_computation() - 40% CPU
|██████|           data_processing()   - 15% CPU  
|███|              network_io()        - 8% CPU
```

#### 세로축: 호출 스택 깊이

```text
main()
├── process_requests()
    ├── heavy_computation()     <- 병목점 발견!
    │   ├── algorithm_step1()   <- 구체적 문제 함수
    │   └── algorithm_step2()
    └── data_processing()
```

#### 색상 구분

- **빨간색**: 높은 CPU 사용률 (hot path)
- **노란색**: 중간 정도 사용률
- **파란색**: 낮은 사용률 (cold path)

### 실제 최적화 사례

```c
// FlameGraph에서 발견: string_concat()이 60% CPU 사용

// Before (느림)
char* result = malloc(1);
for (int i = 0; i < 10000; i++) {
    result = realloc(result, strlen(result) + strlen(data[i]) + 1);
    strcat(result, data[i]);  // O(n) 복사가 반복 = O(n²)
}

// After (빠름)  
size_t total_len = 0;
for (int i = 0; i < 10000; i++) {
    total_len += strlen(data[i]);  // 전체 길이 계산
}

char* result = malloc(total_len + 1);
char* ptr = result;
for (int i = 0; i < 10000; i++) {
    strcpy(ptr, data[i]);         // 한 번만 복사 = O(n)
    ptr += strlen(data[i]);
}

// 성능 개선: 100배 빨라짐 (60초 → 0.6초)
```

---

## 🎯 Hot Path 식별과 최적화

### 80/20 법칙 적용

```bash
# 함수별 CPU 사용률 확인
perf report --sort=symbol -n | head -10

# 결과 예시:
# 45.2%  heavy_computation     <- 전체의 45% 사용 (최우선 최적화)
# 12.3%  data_processing       <- 12% 사용 (두 번째 우선)
#  8.1%  network_handling      <- 8% 사용
#  5.4%  memory_allocation     <- 5% 사용
#  ...나머지 함수들은 각각 3% 이하
```

### Hot Path 최적화 기법

#### 1. 알고리즘 개선 (가장 높은 ROI)

```python
# Before: O(n²) 알고리즘
def find_duplicates_slow(arr):
    duplicates = []
    for i in range(len(arr)):
        for j in range(i+1, len(arr)):
            if arr[i] == arr[j]:
                duplicates.append(arr[i])
    return duplicates

# After: O(n) 알고리즘  
def find_duplicates_fast(arr):
    seen = set()
    duplicates = set()
    for item in arr:
        if item in seen:
            duplicates.add(item)
        seen.add(item)
    return list(duplicates)

# 성능 개선: n=10000일 때 1000배 빨라짐
```

#### 2. 반복문 최적화

```c
// Before: 비효율적인 반복문
for (int i = 0; i < n; i++) {
    result[i] = expensive_function(data[i]);
    if (strlen(result[i]) > MAX_LEN) {  // 매번 strlen 호출
        handle_long_string(result[i]);
    }
}

// After: 계산 결과 재사용
for (int i = 0; i < n; i++) {
    result[i] = expensive_function(data[i]);
    size_t len = strlen(result[i]);     // 한 번만 계산
    if (len > MAX_LEN) {
        handle_long_string(result[i]);
    }
}
```

#### 3. 함수 호출 오버헤드 제거

```c
// Before: 작은 함수의 반복 호출
inline int add(int a, int b) { return a + b; }

for (int i = 0; i < 1000000; i++) {
    sum += add(data[i], 1);  // 함수 호출 오버헤드
}

// After: 인라인화로 최적화
for (int i = 0; i < 1000000; i++) {
    sum += data[i] + 1;      // 직접 계산
}
```

---

## 🚀 Compiler 최적화 활용

### 최적화 레벨 이해

```bash
# -O0: 최적화 없음 (디버깅용)
gcc -O0 -g program.c

# -O2: 일반적인 최적화 (production)
gcc -O2 program.c

# -O3: aggressive 최적화 
gcc -O3 program.c

# Ofast: 수학 연산 정확도 trade-off
gcc -Ofast program.c

# 성능 비교
time ./program_O0    # 10.2초
time ./program_O2    #  3.1초 (3.3x 개선)
time ./program_O3    #  2.8초 (3.6x 개선)
```

### Link Time Optimization (LTO)

```bash
# 전체 프로그램 최적화
gcc -O3 -flto *.c -o optimized_program

# 성능 개선 예시:
# - 불필요한 함수 제거
# - 인라인화 확대  
# - Dead code elimination
# - 추가 5-15% 성능 향상
```

### Profile Guided Optimization (PGO)

```bash
# 1단계: 프로파일링 정보 수집
gcc -O2 -fprofile-generate program.c -o program_prof
./program_prof < typical_input.txt

# 2단계: 프로파일 기반 최적화
gcc -O2 -fprofile-use program.c -o program_optimized

# 결과: 실제 실행 패턴 기반 최적화
# - 자주 실행되는 경로 우선 최적화
# - Branch prediction 개선
# - 추가 10-20% 성능 향상
```

---

## 🎮 실습: CPU 병목점 해결

### 실습 1: FlameGraph로 병목점 찾기

```c
// cpu_heavy_example.c
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// 의도적으로 비효율적인 함수
void slow_string_processing(char* data) {
    char* result = malloc(1);
    result[0] = '\0';
    
    for (int i = 0; i < 1000; i++) {
        // 매번 realloc + strcat (O(n²))
        result = realloc(result, strlen(result) + strlen(data) + 1);
        strcat(result, data);
    }
    
    free(result);
}

int main() {
    char data[] = "Hello World ";
    for (int i = 0; i < 10000; i++) {
        slow_string_processing(data);
    }
    return 0;
}
```

```bash
# 컴파일 및 프로파일링
gcc -O2 -g cpu_heavy_example.c -o cpu_heavy
perf record -g ./cpu_heavy
perf script | stackcollapse-perf.pl | flamegraph.pl > cpu_heavy.svg

# FlameGraph 분석:
# slow_string_processing: 95% CPU 사용
# └── strcat: 80% (문자열 복사)
# └── realloc: 15% (메모리 재할당)
```

### 실습 2: 최적화 구현 및 측정

```c
// cpu_optimized_example.c
void fast_string_processing(char* data) {
    size_t data_len = strlen(data);
    size_t total_len = data_len * 1000;
    
    // 필요한 메모리 한 번에 할당
    char* result = malloc(total_len + 1);
    char* ptr = result;
    
    for (int i = 0; i < 1000; i++) {
        // 메모리 복사 한 번만
        strcpy(ptr, data);
        ptr += data_len;
    }
    
    free(result);
}
```

```bash
# 성능 비교
time ./cpu_heavy       # Before: 45.2초
time ./cpu_optimized   # After: 0.3초

# 개선율: 150배 향상 (99.3% 성능 개선)
```

### 실습 3: 컴파일러 최적화 비교

```bash
# 다양한 최적화 레벨 테스트
gcc -O0 -g example.c -o example_O0
gcc -O2 example.c -o example_O2  
gcc -O3 example.c -o example_O3
gcc -O3 -flto example.c -o example_LTO

# 벤치마크 스크립트
#!/bin/bash
echo "Optimization Level Comparison:"
echo "O0:" && time ./example_O0 2>&1 | grep real
echo "O2:" && time ./example_O2 2>&1 | grep real  
echo "O3:" && time ./example_O3 2>&1 | grep real
echo "LTO:" && time ./example_LTO 2>&1 | grep real
```

---

## 📊 언어별 CPU 최적화

### Java/JVM 최적화

```bash
# JIT 컴파일러 워밍업 확인
-XX:+PrintCompilation

# Escape Analysis 활용
-XX:+DoEscapeAnalysis

# NUMA 최적화  
-XX:+UseNUMA

# GC 튜닝 (CPU 오버헤드 최소화)
-XX:+UseG1GC -XX:MaxGCPauseMillis=50
```

### Go 최적화

```bash
# CPU 프로파일링
go tool pprof http://localhost:6060/debug/pprof/profile

# 컴파일 최적화
go build -ldflags="-s -w" program.go

# 고성능 빌드
go build -a -installsuffix cgo program.go
```

### Node.js/V8 최적화

```bash
# V8 프로파일링
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# V8 최적화 플래그
node --optimize-for-size app.js
node --max-old-space-size=8192 app.js
```

---

## ⚠️ CPU 최적화 주의사항

### 1. Premature Optimization 피하기

```bash
# ❌ Wrong: 측정 전 추측 최적화
"이 함수가 느릴 것 같으니 최적화하자"

# ✅ Right: 측정 기반 최적화
perf record -g ./app
perf report  # 실제 병목점 확인 후 최적화
```

### 2. 가독성 vs 성능 트레이드오프

```c
// ❌ 과도한 최적화 (가독성 희생)
int fast_but_unreadable(int* arr, int n) {
    int sum = 0;
    int* end = arr + n;
    for (; arr < end; arr++) sum += *arr;
    return sum;
}

// ✅ 적절한 균형 (컴파일러가 최적화)
int clear_and_fast(int* arr, int n) {
    int sum = 0;
    for (int i = 0; i < n; i++) {
        sum += arr[i];
    }
    return sum;  // -O2로 컴파일하면 위와 동일한 성능
}
```

### 3. 멀티코어 확장성 고려

```c
// 단순 병렬화의 함정
#pragma omp parallel for
for (int i = 0; i < n; i++) {
    result[i] = simple_function(data[i]);  // 오버헤드 > 병렬화 이익
}

// 효과적인 병렬화
const int chunk_size = n / num_threads;
#pragma omp parallel for schedule(static, chunk_size)
for (int i = 0; i < n; i++) {
    result[i] = expensive_function(data[i]);  // 충분한 작업량
}
```

---

## 📈 성능 개선 검증

### Before/After 측정

```bash
#!/bin/bash
# 성능 개선 검증 스크립트

echo "=== Performance Comparison ==="

echo "Before optimization:"
time ./app_before < test_input.txt
perf stat ./app_before < test_input.txt

echo "After optimization:"
time ./app_after < test_input.txt  
perf stat ./app_after < test_input.txt

echo "=== Improvement Calculation ==="
# 개선율 계산 로직
```

### 지속적 성능 모니터링

```bash
# 성능 저하 감지 스크립트
#!/bin/bash
THRESHOLD=2.0  # 2초 임계값

current_time=$(time ./app 2>&1 | grep real | awk '{print $2}')
if (( $(echo "$current_time > $THRESHOLD" | bc -l) )); then
    echo "Performance degradation detected: ${current_time}s"
    # FlameGraph 자동 생성
    perf record -g ./app
    perf script | stackcollapse-perf.pl | flamegraph.pl > regression.svg
fi
```

---

## 🎯 Key Takeaways

1. **측정이 먼저**: perf + FlameGraph로 실제 병목점 확인
2. **80/20 법칙**: 20%의 핫 경로가 80%의 성능 결정  
3. **알고리즘 우선**: O(n²) → O(n log n) 개선이 가장 효과적
4. **컴파일러 활용**: -O2, LTO, PGO로 무료 성능 향상
5. **지속적 검증**: 성능 개선을 측정하고 회귀 방지

---

**Next**: [11.3 메모리 성능 최적화](03-memory-optimization.md)에서 cache miss와 메모리 접근 패턴 최적화를 학습합니다.
