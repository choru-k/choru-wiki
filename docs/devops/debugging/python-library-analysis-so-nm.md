---
tags:
  - Python
  - Debugging
  - Library
  - Native
  - SO
  - NM
  - C-Extension
---

# Python Library Analysis: SO 파일과 nm으로 네이티브 의존성 분석하기

## 들어가며

"Python 애플리케이션이 갑자기 ImportError를 뱉으며 죽었는데, 어떤 네이티브 라이브러리가 문제일까?" Production 환경에서 Python 애플리케이션 배포 시 가장 골치 아픈 문제 중 하나가 네이티브 라이브러리 의존성입니다. Python의 C extension들은 시스템의 공유 라이브러리(.so 파일)에 의존하는데, 이런 의존성 문제를 효과적으로 분석하는 방법을 살펴보겠습니다.

## Python C Extension과 SO 파일 이해하기

### Python Extension Module 구조

Python은 성능 향상을 위해 C/C++로 작성된 확장 모듈을 네이티브하게 사용할 수 있습니다:

```python
# 예: numpy의 경우
import numpy as np
print(np.__file__)
# /opt/python/lib/python3.9/site-packages/numpy/__init__.py

# 실제 네이티브 코드는 .so 파일에 있음
import os
numpy_path = os.path.dirname(np.__file__)
so_files = []
for root, dirs, files in os.walk(numpy_path):
    for file in files:
        if file.endswith('.so'):
            so_files.append(os.path.join(root, file))

print("NumPy SO files:")
for so_file in so_files:
    print(f"  {so_file}")
```

### SO 파일의 심볼 테이블

공유 라이브러리(.so)는 ELF(Executable and Linkable Format) 형식으로, 심볼 테이블을 포함합니다:

```text
ELF Structure:
┌─────────────────────────┐
│   ELF Header            │
├─────────────────────────┤
│   Program Headers       │
├─────────────────────────┤
│   Section Headers       │
├─────────────────────────┤
│   .text (code)          │
│   .data (initialized)   │
│   .bss (uninitialized)  │
│   .symtab (symbols)     │ ← nm이 읽는 부분
│   .strtab (string table)│
│   .dynsym (dynamic)     │ ← 런타임 링킹용
└─────────────────────────┘
```

## nm 명령어로 심볼 분석하기

### 기본 nm 사용법

```bash
# Python 확장 모듈의 심볼 확인
nm -D /opt/python/lib/python3.9/site-packages/numpy/core/_multiarray_umath.cpython-39-x86_64-linux-gnu.so

```text
# 출력 예시:
                 U __cxa_finalize@GLIBC_2.2.5
                 U abort@GLIBC_2.2.5
00000000002b8180 T PyInit__multiarray_umath
                 U PyArg_ParseTuple@GLIBC_2.2.5
                 U PyErr_SetString@GLIBC_2.2.5
```

**심볼 타입 설명:**

- `T` (text): 정의된 함수 (exported)
- `U` (undefined): 외부에서 가져오는 심볼
- `D` (data): 초기화된 데이터
- `B` (bss): 초기화되지 않은 데이터
- `W` (weak): 약한 심볼 (optional)

### 의존성 분석을 위한 고급 nm 기법

#### 1. Python C API 사용 현황 분석

```bash
# Python C API 함수 사용 현황
nm -D mymodule.so | grep -E "^[[:space:]]*U.*Py" | sort

```text
# 출력 예시:
                 U PyArg_ParseTuple
                 U PyArg_ParseTupleAndKeywords
                 U PyErr_SetString
                 U PyList_New
                 U PyLong_AsLong
                 U PyModule_Create2
```

#### 2. 외부 라이브러리 의존성 확인

```bash
# GLIBC 버전 의존성 확인
nm -D mymodule.so | grep GLIBC | awk -F'@' '{print $2}' | sort -V | uniq

```text
# 출력:
GLIBC_2.2.5
GLIBC_2.3.4
GLIBC_2.14
```

# 수학 라이브러리 의존성
nm -D mymodule.so | grep -E "(sin|cos|exp|log)"

### 3. 정의된 함수 목록 (API 분석)

```bash
# 모듈에서 export하는 함수들
nm -D mymodule.so | grep " T " | awk '{print $3}'

# Python 모듈 초기화 함수 확인
nm -D mymodule.so | grep PyInit
```

```text
00000000002b8180 T PyInit_mymodule
```

## ldd와 nm의 조합 분석

### 동적 링킹 의존성 완전 분석

```bash
#!/bin/bash
# python_lib_analyzer.sh

MODULE_SO="$1"
if [[ ! -f "$MODULE_SO" ]]; then
    echo "Usage: $0 <python_module.so>"
    exit 1
fi

echo "=== Python Module Analysis: $MODULE_SO ==="
echo

echo "1. Dynamic Library Dependencies:"
ldd "$MODULE_SO" | while read lib; do
    if [[ "$lib" =~ "=>" ]]; then
        lib_name=$(echo "$lib" | awk '{print $1}')
        lib_path=$(echo "$lib" | awk '{print $3}')
        echo "  $lib_name -> $lib_path"
    fi
done
echo

echo "2. Undefined Symbols (Dependencies):"
nm -D "$MODULE_SO" | grep "^[[:space:]]*U" | awk '{print $2}' | sort
echo

echo "3. Exported Functions:"
nm -D "$MODULE_SO" | grep " T " | awk '{print $3}' | sort
echo

echo "4. Python C API Usage:"
nm -D "$MODULE_SO" | grep "^[[:space:]]*U.*Py" | wc -l | xargs printf "  Uses %d Python C API functions, "

echo "5. GLIBC Version Requirements:"
nm -D "$MODULE_SO" | grep GLIBC | awk -F'@' '{print $2}' | sort -V | uniq | sed 's/^/  /'
```

### 사용 예시

```bash
# NumPy 모듈 분석
./python_lib_analyzer.sh /opt/python/lib/python3.9/site-packages/numpy/core/_multiarray_umath.cpython-39-x86_64-linux-gnu.so

# 출력:
```text
=== Python Module Analysis: _multiarray_umath.cpython-39-x86_64-linux-gnu.so ===

1. Dynamic Library Dependencies:
  libpthread.so.0 -> /lib/x86_64-linux-gnu/libpthread.so.0
  libm.so.6 -> /lib/x86_64-linux-gnu/libm.so.6
  libc.so.6 -> /lib/x86_64-linux-gnu/libc.so.6

2. Undefined Symbols (Dependencies):
  PyArg_ParseTuple
  PyErr_SetString
  malloc
  free
  sin
  cos

3. Exported Functions:
  PyInit__multiarray_umath
  array_function_dispatch
  
4. Python C API Usage:
  Uses 127 Python C API functions

5. GLIBC Version Requirements:
  GLIBC_2.2.5
  GLIBC_2.14
```

## Production 문제 해결 시나리오

### 시나리오 1: ImportError 디버깅

```python
# 에러 발생
>>> import mypackage
ImportError: /opt/python/lib/python3.9/site-packages/mypackage/core.cpython-39-x86_64-linux-gnu.so: 
undefined symbol: _ZN4BLAS4gemm...
```

디버깅 과정:

```bash
# 1. 누락된 심볼 확인
nm -D core.cpython-39-x86_64-linux-gnu.so | grep -F "_ZN4BLAS4gemm"
                 U _ZN4BLAS4gemm...

# 2. 어떤 라이브러리에서 제공해야 하는지 확인
find /usr/lib /opt -name "*.so*" -exec nm -D {} 2>/dev/null \; -print | grep -B1 "_ZN4BLAS4gemm" 2>/dev/null
/usr/lib/x86_64-linux-gnu/libblas.so.3
00000000000c4a20 T _ZN4BLAS4gemm...

# 3. 링킹 확인
ldd core.cpython-39-x86_64-linux-gnu.so | grep blas
# (출력 없음 → 문제 발견!)

# 4. 수동으로 의존성 설정
export LD_PRELOAD="/usr/lib/x86_64-linux-gnu/libblas.so.3:$LD_PRELOAD"
python -c "import mypackage"  # 성공!
```

### 시나리오 2: GLIBC 버전 호환성 문제

```bash
# 에러: version `GLIBC_2.28' not found
ldd mymodule.so
# mymodule.so: version `GLIBC_2.28' not found (required by mymodule.so)

# 현재 시스템 GLIBC 확인
ldd --version
# ldd (Ubuntu GLIBC 2.23-0ubuntu11.3) 2.23

# 모듈이 요구하는 GLIBC 버전 확인
nm -D mymodule.so | grep GLIBC | awk -F'@' '{print $2}' | sort -V | tail -1
# GLIBC_2.28

# 해결책: 호환 가능한 패키지 빌드 또는 시스템 업그레이드 필요
```

## Container 환경에서의 네이티브 의존성 관리

### Multi-stage 빌드로 의존성 최적화

```dockerfile
# Build stage
FROM python:3.9-slim as builder

RUN apt-get update && apt-get install -y \
    build-essential \
    libblas-dev \
    liblapack-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /wheels -r requirements.txt

# Runtime stage
FROM python:3.9-slim as runtime

# 런타임에 필요한 SO 파일만 설치
RUN apt-get update && apt-get install -y \
    libblas3 \
    liblapack3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /wheels /wheels
RUN pip install --no-cache /wheels/*

# 의존성 검증
RUN python -c "import numpy; print('NumPy imported successfully')"
```

### 의존성 검증 스크립트

```python
#!/usr/bin/env python3
"""
validate_dependencies.py
Python 모듈의 네이티브 의존성을 검증하는 스크립트
"""

import sys
import os
import subprocess
import importlib.util

def check_native_dependencies(module_path):
    """SO 파일의 의존성을 검증"""
    result = subprocess.run(['ldd', module_path], 
                          capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"❌ ldd failed for {module_path}")
        return False
        
    missing_deps = []
    for line in result.stdout.split(', '):
        if 'not found' in line:
            missing_deps.append(line.strip())
    
    if missing_deps:
        print(f"❌ Missing dependencies in {module_path}:")
        for dep in missing_deps:
            print(f"   {dep}")
        return False
    
    print(f"✅ All dependencies satisfied for {module_path}")
    return True

def validate_python_module(module_name):
    """Python 모듈 임포트 및 네이티브 의존성 검증"""
    try:
        # 모듈 임포트 시도
        module = importlib.import_module(module_name)
        print(f"✅ Successfully imported {module_name}")
        
        # 모듈 경로에서 SO 파일 찾기
        module_dir = os.path.dirname(module.__file__)
        so_files = []
        
        for root, dirs, files in os.walk(module_dir):
            for file in files:
                if file.endswith('.so'):
                    so_files.append(os.path.join(root, file))
        
        # 각 SO 파일의 의존성 검증
        all_valid = True
        for so_file in so_files:
            if not check_native_dependencies(so_file):
                all_valid = False
        
        return all_valid
        
    except ImportError as e:
        print(f"❌ Failed to import {module_name}: {e}")
        return False

if __name__ == "__main__":
    modules_to_check = ['numpy', 'scipy', 'pandas', 'tensorflow', 'torch']
    
    print("=== Python Native Dependency Validation ===")
    
    for module in modules_to_check:
        print(f"Checking {module}...")
        validate_python_module(module)
        print()
```

## 고급 분석 기법

### 심볼 버전 충돌 디버깅

```bash
# 같은 심볼이 여러 라이브러리에 있을 때
nm -D /lib/x86_64-linux-gnu/libc.so.6 | grep malloc
nm -D /lib/x86_64-linux-gnu/libtcmalloc.so.4 | grep malloc

# 실제로 어느 것이 사용되는지 확인
LD_DEBUG=bindings python -c "import numpy" 2>&1 | grep malloc
```

### 성능 영향 분석

```bash
# PLT (Procedure Linkage Table) 엔트리 수 확인
objdump -R mymodule.so | wc -l

# GOT (Global Offset Table) 크기
objdump -s -j .got.plt mymodule.so

# 많은 외부 함수 호출은 성능에 영향
```

## 모니터링과 자동화

### CI/CD에서 의존성 검증

```yaml
# .github/workflows/dependency-check.yml
name: Native Dependency Check

on: [push, pull_request]

jobs:
  dependency-check:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Build wheel
      run: |
        pip install build
        python -m build --wheel
    
    - name: Extract and analyze SO files
      run: |
        wheel_file=$(ls dist/*.whl | head -n1)
        unzip "$wheel_file" -d extracted/
        
        find extracted/ -name "*.so" | while read so_file; do
          echo "Analyzing: $so_file"
          nm -D "$so_file" | grep GLIBC | awk -F'@' '{print $2}' | sort -V | uniq
          ldd "$so_file" | grep "not found" && exit 1 || true
        done
    
    - name: Test import
      run: |
        pip install dist/*.whl
        python -c "import mypackage; print('Import successful')"
```

## 정리

Python 네이티브 라이브러리 분석을 위한 핵심 도구들:

1. **nm**: 심볼 테이블 분석으로 함수 의존성 파악
2. **ldd**: 동적 라이브러리 의존성 확인
3. **objdump**: ELF 바이너리 상세 분석
4. **readelf**: ELF 헤더 및 섹션 정보

**Production 환경에서 주의사항:**

- GLIBC 버전 호환성 항상 확인
- Container 이미지에서 불필요한 개발 의존성 제거
- CI/CD에서 의존성 검증 자동화
- LD_LIBRARY_PATH보다는 wheel 빌드 시 RPATH 설정 권장

## 관련 문서

- [Container Image 최적화](../container/docker-image-optimization.md)
- [strace로 시스템 호출 분석](strace-debugging.md)
- [Kubernetes Pod 디버깅](../kubernetes/pod-debugging.md)
