---
tags:
  - GDB
  - Debugging
  - Production
  - Core-Dump
  - Memory
  - Multi-threading
  - Remote-Debugging
  - Performance
  - Optimization
  - Container
  - Kubernetes
---

# GDB Advanced Debugging: Production Environment Complete Guide

## 들어가며

"Production에서 프로세스가 갑자기 크래시했는데, 스택 트레이스만으로는 원인을 찾을 수 없어요." "멀티스레드 애플리케이션에서 간헐적으로 데드락이 발생하는데 재현이 어려워요." "최적화된 바이너리에서 변수 값을 확인할 수 없어요."

이런 복잡한 production 문제들을 해결하기 위해서는 **GDB(GNU Debugger)**의 고급 기능들을 제대로 이해하고 활용해야 합니다. GDB는 단순한 브레이크포인트 설정 도구가 아니라, 메모리 corruption 추적, 멀티스레드 디버깅, 원격 디버깅, 그리고 심지어 시간을 되돌려가며 디버깅할 수 있는 강력한 도구입니다.

## GDB 내부 동작 원리

### ptrace 기반 프로세스 제어

GDB는 Linux의 `ptrace` 시스템 콜을 사용하여 대상 프로세스를 제어합니다:

```text
GDB Architecture:
┌─────────────────────────────────────────────────┐
│ GDB Process                                     │
│ ├─ Command Interface                            │
│ ├─ Symbol Table Management                      │
│ ├─ Breakpoint Management                        │
│ └─ ptrace() system calls                        │
├─────────────────────────────────────────────────┤
│ Kernel Space (ptrace subsystem)                 │
│ ├─ Process Control (PTRACE_ATTACH)              │
│ ├─ Memory Access (PTRACE_PEEKDATA/POKEDATA)     │
│ ├─ Register Access (PTRACE_GETREGS/SETREGS)     │
│ └─ Signal Handling (PTRACE_CONT/SINGLESTEP)     │
├─────────────────────────────────────────────────┤
│ Target Process                                  │
│ ├─ Text Segment (코드, 브레이크포인트)           │
│ ├─ Data Segment (전역 변수, 힙)                 │
│ ├─ Stack Segment (지역 변수, 함수 호출)         │
│ └─ Thread Context (레지스터, 스택 포인터)        │
└─────────────────────────────────────────────────┘
```

### 브레이크포인트 구현 메커니즘

GDB는 소프트웨어 브레이크포인트를 INT3 명령어(0xCC)로 구현합니다:

```c
// GDB 브레이크포인트 설정 과정 (간략화)
int set_software_breakpoint(pid_t pid, void *addr) {
    // 1. 원본 명령어 백업
    long original_instruction = ptrace(PTRACE_PEEKTEXT, pid, addr, NULL);

    // 2. INT3 명령어(0xCC)로 교체
    long breakpoint_instruction = (original_instruction & ~0xFF) | 0xCC;
    ptrace(PTRACE_POKETEXT, pid, addr, breakpoint_instruction);

    // 3. 브레이크포인트 정보 저장
    breakpoint_table[addr] = original_instruction;

    return 0;
}

// 브레이크포인트 히트 처리
void handle_breakpoint_hit(pid_t pid, void *addr) {
    // 1. RIP를 브레이크포인트 주소로 되돌림
    struct user_regs_struct regs;
    ptrace(PTRACE_GETREGS, pid, NULL, &regs);
    regs.rip = (unsigned long)addr;
    ptrace(PTRACE_SETREGS, pid, NULL, &regs);

    // 2. 원본 명령어 임시 복구
    long original = breakpoint_table[addr];
    ptrace(PTRACE_POKETEXT, pid, addr, original);

    // 3. 한 스텝 실행 후 브레이크포인트 재설정
    ptrace(PTRACE_SINGLESTEP, pid, NULL, NULL);
    wait_for_signal(pid, SIGTRAP);

    ptrace(PTRACE_POKETEXT, pid, addr, (original & ~0xFF) | 0xCC);
}
```

## Core Dump 분석

### Production Core Dump 완전 분석

실제 production 환경에서 발생한 segmentation fault 분석:

```bash
# Core dump 파일 생성 설정
ulimit -c unlimited
echo '/tmp/core.%e.%p.%t' | sudo tee /proc/sys/kernel/core_pattern

# Core dump 기본 분석
gdb /path/to/binary /tmp/core.myapp.12345.1640995200

# GDB 세션에서:
(gdb) info program
Program terminated with signal SIGSEGV, Segmentation fault.

(gdb) where
#0  0x0000000000401234 in process_request (req=0x0) at server.c:145
#1  0x0000000000401456 in handle_connection (fd=5) at server.c:230
#2  0x0000000000401678 in worker_thread (arg=0x7f8b4c000b20) at server.c:89
#3  0x00007f8b4c2a1609 in start_thread (arg=0x7f8b4c000700) at pthread_create.c:477
#4  0x00007f8b4c1c8163 in clone () at ../sysdeps/unix/sysv/linux/x86_64/clone.S:95

(gdb) frame 0
#0  0x0000000000401234 in process_request (req=0x0) at server.c:145
145         if (req->method == HTTP_GET) {

# 문제 발견: req 포인터가 NULL
```

### 메모리 corruption 상세 분석

```bash
# 메모리 내용 검사
(gdb) x/32x $rsp
0x7fff1234abcd: 0x00000000 0x00000000 0x12345678 0x87654321
0x7fff1234abdd: 0xdeadbeef 0xdeadbeef 0xdeadbeef 0xdeadbeef  # 오염된 메모리 패턴 발견

# 힙 메모리 상태 검사
(gdb) info proc mappings
process 12345
Mapped address spaces:
      Start Addr           End Addr       Size     Offset objfile
      0x400000           0x401000     0x1000        0x0 /usr/bin/myapp
      0x601000           0x602000     0x1000     0x1000 /usr/bin/myapp
    0x7f8b4c000000     0x7f8b4c021000    0x21000        0x0 [heap]

# 힙 영역 검사
(gdb) x/1024x 0x7f8b4c000000
# 힙 corruption 패턴 분석...

# 스택 오버플로우 검사
(gdb) info frame
Stack level 0, frame at 0x7fff1234abc0:
 rip = 0x401234 in process_request (server.c:145); saved rip = 0x401456
 called by frame at 0x7fff1234abd0
 source language c.
 Arglist at 0x7fff1234abb0, args: req=0x0
 Locals at 0x7fff1234abb0, Previous frame's sp is 0x7fff1234abc0

# 스택 경계 확인
(gdb) info proc stat
State:  t (tracing stop)
...
VmStk:    132 kB    # 스택 크기 정상
```

### 자동화된 Core Dump 분석 스크립트

```python
#!/usr/bin/env python3
"""
core_analyzer.py - 자동화된 core dump 분석 도구
"""

import subprocess
import sys
import re
import json
from pathlib import Path

class CoreAnalyzer:
    def __init__(self, binary_path, core_path):
        self.binary_path = binary_path
        self.core_path = core_path
        self.analysis_result = {
            'signal': None,
            'crash_location': None,
            'stack_trace': [],
            'memory_corruption': [],
            'thread_info': [],
            'recommendations': []
        }

    def run_gdb_command(self, command):
        """GDB 배치 모드로 명령어 실행"""
        cmd = ['gdb', '--batch', '--ex', command, self.binary_path, self.core_path]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return result.stdout
        except subprocess.TimeoutExpired:
            return "TIMEOUT: GDB command took too long"

    def analyze_signal(self):
        """크래시 시그널 분석"""
        output = self.run_gdb_command('info program')
        signal_match = re.search(r'terminated with signal (\w+)', output)
        if signal_match:
            self.analysis_result['signal'] = signal_match.group(1)

    def analyze_stack_trace(self):
        """스택 트레이스 분석"""
        output = self.run_gdb_command('where')
        frames = []
        for line in output.split(', '):
            if line.startswith('#'):
                frames.append(line.strip())
        self.analysis_result['stack_trace'] = frames

    def analyze_memory_corruption(self):
        """메모리 corruption 패턴 검사"""
        # 스택 영역 검사
        stack_output = self.run_gdb_command('x/64x $rsp')
        corruption_patterns = ['0xdeadbeef', '0xbaadf00d', '0x41414141']

        for pattern in corruption_patterns:
            if pattern in stack_output.lower():
                self.analysis_result['memory_corruption'].append({
                    'type': 'stack_corruption',
                    'pattern': pattern,
                    'location': 'stack'
                })

        # 힙 영역 검사 (첫 번째 힙 맵핑 주소 기준)
        mappings_output = self.run_gdb_command('info proc mappings')
        heap_match = re.search(r'0x([0-9a-f]+)\s+0x[0-9a-f]+.*\[heap\]', mappings_output)
        if heap_match:
            heap_addr = heap_match.group(1)
            heap_output = self.run_gdb_command(f'x/64x 0x{heap_addr}')

            # Use-after-free 패턴 검사
            if '0xfeedfeed' in heap_output or '0xcdcdcdcd' in heap_output:
                self.analysis_result['memory_corruption'].append({
                    'type': 'use_after_free',
                    'location': 'heap',
                    'address': f'0x{heap_addr}'
                })

    def analyze_threads(self):
        """스레드 정보 분석"""
        threads_output = self.run_gdb_command('info threads')
        for line in threads_output.split(', '):
            if re.match(r'\s*\*?\s*\d+', line):
                self.analysis_result['thread_info'].append(line.strip())

    def generate_recommendations(self):
        """분석 결과 기반 권장사항 생성"""
        recommendations = []

        if self.analysis_result['signal'] == 'SIGSEGV':
            recommendations.append("NULL pointer dereference 또는 잘못된 메모리 접근 확인")
            recommendations.append("AddressSanitizer(-fsanitize=address)로 빌드하여 재현 시도")

        if self.analysis_result['signal'] == 'SIGABRT':
            recommendations.append("assert() 또는 abort() 호출 확인")
            recommendations.append("malloc corruption 또는 double-free 의심")

        if any('use_after_free' in c['type'] for c in self.analysis_result['memory_corruption']):
            recommendations.append("Valgrind 또는 AddressSanitizer로 메모리 오류 상세 분석")

        if len(self.analysis_result['thread_info']) > 1:
            recommendations.append("멀티스레드 환경에서 race condition 또는 데드락 가능성 확인")
            recommendations.append("ThreadSanitizer(-fsanitize=thread)로 빌드하여 재현 시도")

        self.analysis_result['recommendations'] = recommendations

    def run_analysis(self):
        """전체 분석 실행"""
        print(f"Analyzing core dump: {self.core_path}")
        print(f"Binary: {self.binary_path}")
        print("=" * 60)

        self.analyze_signal()
        self.analyze_stack_trace()
        self.analyze_memory_corruption()
        self.analyze_threads()
        self.generate_recommendations()

        return self.analysis_result

    def print_report(self):
        """분석 결과 출력"""
        result = self.analysis_result

        print(f"🔍 CRASH SIGNAL: {result['signal']}")
        print()

        print("📋 STACK TRACE:")
        for frame in result['stack_trace']:
            print(f"  {frame}")
        print()

        if result['memory_corruption']:
            print("⚠️  MEMORY CORRUPTION DETECTED:")
            for corruption in result['memory_corruption']:
                print(f"  Type: {corruption['type']}")
                print(f"  Location: {corruption['location']}")
                if 'pattern' in corruption:
                    print(f"  Pattern: {corruption['pattern']}")
                print()

        if len(result['thread_info']) > 1:
            print(f"🧵 THREADS ({len(result['thread_info'])}):")
            for thread in result['thread_info']:
                print(f"  {thread}")
            print()

        print("💡 RECOMMENDATIONS:")
        for rec in result['recommendations']:
            print(f"  • {rec}")
        print()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 core_analyzer.py <binary> <core_dump>")
        sys.exit(1)

    analyzer = CoreAnalyzer(sys.argv[1], sys.argv[2])
    analyzer.run_analysis()
    analyzer.print_report()

    # JSON 형태로도 출력 (파이프라인 연동을 위해)
    json_output = Path(sys.argv[2]).with_suffix('.analysis.json')
    with open(json_output, 'w') as f:
        json.dump(analyzer.analysis_result, f, indent=2)

    print(f"📄 Detailed analysis saved to: {json_output}")
```

## 원격 디버깅 (Remote Debugging)

### GDB Server 설정과 활용

Production 서버에서 직접 디버깅이 어려운 경우 원격 디버깅을 활용:

```bash
# Target 서버 (Production)에서 gdbserver 실행
gdbserver :9999 /path/to/application
# 또는 이미 실행 중인 프로세스 attach
gdbserver :9999 --attach 12345

# 네트워크 설정 확인
netstat -tlnp | grep 9999

# 개발 머신에서 원격 접속
gdb /path/to/binary
(gdb) set sysroot /path/to/target/root  # cross-compile 환경인 경우
(gdb) target remote production-server:9999

# SSH 터널을 통한 보안 연결
ssh -L 9999:localhost:9999 user@production-server
# 별도 터미널에서:
gdb /path/to/binary
(gdb) target remote localhost:9999
```

### Container 환경에서 원격 디버깅

```bash
# Docker 컨테이너 내부에서 gdbserver 실행
docker run -it --cap-add=SYS_PTRACE --security-opt seccomp=unconfined \
    -p 9999:9999 myapp:debug \
    gdbserver :9999 /app/myapp

# Kubernetes에서 디버깅 Pod 실행
kubectl run debug-pod --image=myapp:debug --restart=Never \
    --overrides='{"spec":{"securityContext":{"capabilities":{"add":["SYS_PTRACE"]}}}}' \
    -- gdbserver :9999 /app/myapp

# 포트 포워딩으로 접근
kubectl port-forward debug-pod 9999:9999

# 로컬에서 연결
gdb /local/path/to/binary
(gdb) target remote localhost:9999
```

### 원격 디버깅 자동화 스크립트

```bash
#!/bin/bash
# remote_debug_session.sh

REMOTE_HOST="$1"
BINARY_PATH="$2"
PID="$3"

if [[ $# -ne 3 ]]; then
    echo "Usage: $0 <remote_host> <binary_path> <pid>"
    exit 1
fi

echo "Starting remote debugging session..."
echo "Remote host: $REMOTE_HOST"
echo "Binary: $BINARY_PATH"
echo "PID: $PID"

# SSH 터널 백그라운드 실행
ssh -fN -L 9999:localhost:9999 "$REMOTE_HOST"
TUNNEL_PID=$!

# 원격에서 gdbserver 시작
ssh "$REMOTE_HOST" "gdbserver :9999 --attach $PID" &
GDBSERVER_PID=$!

# 잠시 대기 (gdbserver 시작 시간)
sleep 2

# GDB 세션 시작
echo "Starting GDB session..."
gdb "$BINARY_PATH" -ex "target remote localhost:9999" \
                   -ex "set confirm off" \
                   -ex "set pagination off"

# 정리
echo "Cleaning up..."
kill $TUNNEL_PID 2>/dev/null
ssh "$REMOTE_HOST" "pkill -f 'gdbserver.*:9999'" 2>/dev/null

echo "Remote debugging session ended."
```

## 멀티스레드 디버깅

### 스레드 상태 및 동기화 분석

```bash
# 모든 스레드 정보 확인
(gdb) info threads
  Id   Target Id         Frame
* 1    Thread 0x7f123... (LWP 12345) main () at main.c:45
  2    Thread 0x7f124... (LWP 12346) worker_thread () at worker.c:123
  3    Thread 0x7f125... (LWP 12347) io_thread () at io.c:67
  4    Thread 0x7f126... (LWP 12348) timer_thread () at timer.c:34

# 특정 스레드로 전환
(gdb) thread 2
[Switching to thread 2 (Thread 0x7f124...)]

# 모든 스레드의 백트레이스 확인
(gdb) thread apply all bt

# 특정 명령을 모든 스레드에 적용
(gdb) thread apply all info registers
(gdb) thread apply all print errno
```

### 데드락 탐지와 분석

```bash
# 데드락 분석을 위한 GDB 매크로
define analyze_deadlock
    echo === DEADLOCK ANALYSIS ===,

    # 모든 스레드의 스택 트레이스
    thread apply all bt

    echo , === MUTEX STATUS ===,
    # 뮤텍스 상태 분석 (pthread_mutex_t 구조체 확인)
    thread apply all x/8x $rsp-64

    echo , === THREAD STATES ===,
    shell ps -eLf | grep $arg0
end

# 사용법
(gdb) analyze_deadlock 12345

# 실시간 뮤텍스 모니터링
define mutex_monitor
    while 1
        clear
        echo Current time:
        shell date
        echo , === Active Threads ===,
        info threads
        echo , === Waiting Threads ===,
        thread apply all bt 5
        sleep 1
    end
end
```

### 실제 데드락 사례 분석

```bash
# Production에서 발생한 데드락 분석 사례
(gdb) attach 12345
(gdb) info threads
  Id   Target Id         Frame
* 1    Thread 0x7f... (LWP 12345) __lll_lock_wait () at lowlevellock.S:135
  2    Thread 0x7f... (LWP 12346) __lll_lock_wait () at lowlevellock.S:135

# Thread 1 분석
(gdb) thread 1
(gdb) bt
#0  __lll_lock_wait () at lowlevellock.S:135
#1  pthread_mutex_lock () at pthread_mutex_lock.c:86
#2  database_query (query=0x...) at db.c:45
#3  process_user_request (req=0x...) at handler.c:123

# Thread 2 분석
(gdb) thread 2
(gdb) bt
#0  __lll_lock_wait () at lowlevellock.S:135
#1  pthread_mutex_lock () at pthread_mutex_lock.c:86
#2  log_message (level=INFO, msg=0x...) at logger.c:78
#3  database_query (query=0x...) at db.c:67

# 뮤텍스 객체 분석
(gdb) thread 1
(gdb) up 2
(gdb) print *db_mutex
$1 = {__data = {__lock = 1, __count = 0, __owner = 12346, ...}}

(gdb) thread 2
(gdb) up 2
(gdb) print *log_mutex
$2 = {__data = {__lock = 1, __count = 0, __owner = 12345, ...}}

# 데드락 발견:
# Thread 1(12345)이 log_mutex를 소유하고 db_mutex를 대기
# Thread 2(12346)가 db_mutex를 소유하고 log_mutex를 대기
```

### Race Condition 탐지

```bash
# 조건부 브레이크포인트로 race condition 탐지
(gdb) break shared_variable_access if shared_counter != expected_value
(gdb) commands
    > info registers
    > info threads
    > print shared_counter
    > print expected_value
    > continue
    > end

# 메모리 워치포인트 설정
(gdb) watch shared_data
Hardware watchpoint 1: shared_data

(gdb) watch *(int*)0x601020  # 특정 주소 감시
(gdb) awatch global_flag     # 읽기/쓰기 모두 감시
(gdb) rwatch read_only_data  # 읽기만 감시

# race condition이 발생하면:
Hardware watchpoint 1: shared_data
Old value = 100
New value = 101
worker_thread (arg=0x0) at worker.c:89
89          shared_data++;
```

## 메모리 corruption 디버깅

### Heap corruption 탐지

```bash
# malloc/free 추적을 위한 breakpoint 설정
(gdb) break malloc
(gdb) commands
    > print $rdi  # 할당 크기
    > continue
    > end

(gdb) break free
(gdb) commands
    > print $rdi  # 해제할 주소
    > x/32x $rdi  # 해제되는 메모리 내용 확인
    > continue
    > end

# 힙 구조체 손상 검사
(gdb) set environment MALLOC_CHECK_=2  # glibc malloc 디버그 모드

# 커스텀 힙 검사 함수
define check_heap_integrity
    # glibc의 내부 구조체 확인
    print &main_arena
    x/32x &main_arena

    # 첫 번째 청크 확인
    set $chunk = main_arena.top
    while $chunk != 0
        print $chunk
        x/4x $chunk
        set $chunk = *(void**)($chunk + 8)
    end
end
```

### Stack corruption 분석

```bash
# 스택 카나리(canary) 확인
(gdb) info frame
(gdb) x/32x $rbp-32   # 스택 하위 영역 검사

# 스택 스매싱 탐지
define check_stack_smashing
    set $saved_rbp = *(void**)$rbp
    set $return_addr = *(void**)($rbp + 8)

    print "Saved RBP:", $saved_rbp
    print "Return address:", $return_addr

    # 리턴 주소가 정상 범위에 있는지 확인
    if $return_addr < 0x400000 || $return_addr > 0x7fffffffffff
        print "🚨 STACK CORRUPTION DETECTED!"
        print "Invalid return address:", $return_addr
    else
        print "✅ Stack looks normal"
    end
end

# 함수 진입시마다 스택 확인
(gdb) break function_name
(gdb) commands
    > check_stack_smashing
    > continue
    > end
```

### Buffer overflow 실시간 탐지

```c
// 디버깅을 위한 헬퍼 함수 (컴파일 시 포함)
void debug_buffer_state(void *buffer, size_t size, const char *location) {
    // GDB에서 이 함수에 브레이크포인트 설정
    printf("Buffer check at %s: %p, size: %zu, ", location, buffer, size);
}

// 사용 예시
char buffer[256];
debug_buffer_state(buffer, sizeof(buffer), "before strcpy");
strcpy(buffer, user_input);
debug_buffer_state(buffer, sizeof(buffer), "after strcpy");
```

```bash
# GDB에서 buffer overflow 탐지
(gdb) break debug_buffer_state
(gdb) commands
    > print location
    > print size
    > x/64x buffer
    > if size > 256
        > print "⚠️ Buffer overflow detected!"
        > bt
    > end
    > continue
    > end
```

## 최적화된 코드 디버깅

### -O2, -O3 최적화 문제 해결

```bash
# 최적화된 바이너리에서 변수 접근
(gdb) info variables
All defined variables:
# 많은 변수가 최적화로 제거됨

# 레지스터에 저장된 값 추적
(gdb) info registers
rax            0x7fff12345678   140734799804024
rbx            0x0              0
rcx            0x4005a0         4195744

# 디스어셈블리로 변수 위치 추적
(gdb) disass /m main
10      int result = calculate(x, y);
   0x401234 <main+20>:  mov    %eax,%edi
   0x401237 <main+23>:  mov    %edx,%esi
   0x40123a <main+26>:  call   0x401180 <calculate>
   0x40123f <main+31>:  mov    %eax,0x10(%rbp)  # result가 rbp+0x10에 저장

# 특정 주소의 값 확인
(gdb) p *(int*)($rbp + 0x10)
$1 = 42

# 인라인된 함수 디버깅
(gdb) info line calculate  # 함수가 인라인됨
Line 25 of "calc.c" starts at address 0x401234 and ends at 0x401245

# 함수 내 특정 라인에 브레이크포인트
(gdb) break calc.c:27  # 인라인된 함수 내부
```

### 디버그 정보 최적화

```bash
# 디버그 정보 확인
objdump -h binary | grep debug
readelf -S binary | grep debug

# 컴파일러별 디버그 최적화 옵션
# GCC: -Og (디버깅에 최적화)
gcc -Og -g -o myapp myapp.c

# Clang: -O1 + 디버그 정보
clang -O1 -g -fno-omit-frame-pointer -o myapp myapp.c

# 프로덕션 바이너리에 디버그 정보 별도 생성
gcc -g -O2 -o myapp myapp.c
objcopy --only-keep-debug myapp myapp.debug
strip --strip-debug --strip-unneeded myapp
objcopy --add-gnu-debuglink=myapp.debug myapp

# GDB에서 디버그 정보 로드
(gdb) symbol-file myapp.debug
```

## Python extension과 자동화

### GDB Python API 활용

```python
# memory_leak_detector.py - GDB Python extension
import gdb
import time
from collections import defaultdict

class MemoryLeakDetector(gdb.Command):
    """메모리 누수 탐지를 위한 GDB 확장"""

    def __init__(self):
        super().__init__("detect-leaks", gdb.COMMAND_USER)
        self.allocations = defaultdict(list)
        self.total_allocated = 0
        self.total_freed = 0

    def invoke(self, arg, from_tty):
        """명령어 실행"""
        duration = int(arg) if arg else 60
        print(f"Memory leak detection for {duration} seconds...")

        # malloc/free 브레이크포인트 설정
        malloc_bp = gdb.Breakpoint("malloc", internal=True)
        malloc_bp.silent = True
        malloc_bp.commands = "python memory_detector.on_malloc()"

        free_bp = gdb.Breakpoint("free", internal=True)
        free_bp.silent = True
        free_bp.commands = "python memory_detector.on_free()"

        # 지정된 시간동안 실행
        start_time = time.time()
        gdb.execute("continue")

        while time.time() - start_time < duration:
            try:
                gdb.execute("continue", to_string=True)
            except gdb.error:
                break

        # 결과 출력
        self.print_leak_report()

        # 브레이크포인트 제거
        malloc_bp.delete()
        free_bp.delete()

    def on_malloc(self):
        """malloc 호출 시 처리"""
        try:
            size = int(gdb.parse_and_eval("$rdi"))  # malloc 크기
            gdb.execute("finish", to_string=True)   # malloc 완료까지 실행
            addr = int(gdb.parse_and_eval("$rax"))  # 할당된 주소

            if addr != 0:
                self.allocations[addr].append({
                    'size': size,
                    'time': time.time(),
                    'stack': self.get_stack_trace()
                })
                self.total_allocated += size

        except (gdb.error, ValueError):
            pass

    def on_free(self):
        """free 호출 시 처리"""
        try:
            addr = int(gdb.parse_and_eval("$rdi"))
            if addr in self.allocations:
                alloc_info = self.allocations[addr][-1]
                self.total_freed += alloc_info['size']
                del self.allocations[addr]
        except (gdb.error, ValueError):
            pass

    def get_stack_trace(self):
        """현재 스택 트레이스 획득"""
        try:
            bt_output = gdb.execute("bt 5", to_string=True)
            return bt_output.strip()
        except gdb.error:
            return "Stack trace unavailable"

    def print_leak_report(self):
        """누수 리포트 출력"""
        print(f", === Memory Leak Report ===")
        print(f"Total allocated: {self.total_allocated:,} bytes")
        print(f"Total freed: {self.total_freed:,} bytes")
        print(f"Potential leaks: {self.total_allocated - self.total_freed:,} bytes")
        print(f"Unfreed allocations: {len(self.allocations)}")

        if self.allocations:
            print(f", === Top 10 Unfreed Allocations ===")
            sorted_allocs = sorted(
                [(addr, info[-1]) for addr, info in self.allocations.items()],
                key=lambda x: x[1]['size'],
                reverse=True
            )[:10]

            for addr, info in sorted_allocs:
                print(f", Address: 0x{addr:x}")
                print(f"Size: {info['size']} bytes")
                print(f"Allocated at: {time.ctime(info['time'])}")
                print("Stack trace:")
                for line in info['stack'].split(', ')[:3]:
                    print(f"  {line}")

# 전역 인스턴스 생성
memory_detector = MemoryLeakDetector()

# 추가 유틸리티 함수들
class ThreadAnalyzer(gdb.Command):
    """스레드 분석 도구"""

    def __init__(self):
        super().__init__("analyze-threads", gdb.COMMAND_USER)

    def invoke(self, arg, from_tty):
        """스레드 상태 분석"""
        threads_info = gdb.execute("info threads", to_string=True)

        print("=== Thread Analysis ===")
        waiting_threads = []
        running_threads = []

        # 각 스레드 상태 확인
        for thread in gdb.selected_inferior().threads():
            thread.switch()

            try:
                frame = gdb.selected_frame()
                func_name = frame.name()

                if any(wait_func in func_name for wait_func in
                       ['__lll_lock_wait', 'pthread_cond_wait', 'futex']):
                    waiting_threads.append((thread.num, func_name))
                else:
                    running_threads.append((thread.num, func_name))

            except (gdb.error, AttributeError):
                pass

        print(f"Running threads: {len(running_threads)}")
        print(f"Waiting threads: {len(waiting_threads)}")

        if waiting_threads:
            print(f", === Waiting Threads ===")
            for thread_num, func in waiting_threads:
                print(f"Thread {thread_num}: waiting in {func}")

thread_analyzer = ThreadAnalyzer()
```

### GDB 자동화 스크립트

```bash
# .gdbinit - GDB 시작 시 자동 로드되는 설정
set confirm off
set pagination off
set history save on
set history size 10000

# Python extension 로드
python exec(open('/path/to/memory_leak_detector.py').read())

# 커스텀 명령어 정의
define heap-check
    printf "=== Heap Status ===, "
    info proc mappings | grep heap
    printf ", === Top 10 Allocations ===, "
    python memory_detector.print_top_allocations()
end

define thread-summary
    printf "=== Thread Summary ===, "
    info threads
    printf ", === Deadlock Check ===, "
    python thread_analyzer.check_deadlocks()
end

# 프로덕션 디버깅 매크로
define prod-debug-start
    printf "Starting production debugging session..., "

    # 시그널 처리 설정
    handle SIGPIPE nostop noprint pass
    handle SIGUSR1 stop print nopass

    # 자동 백트레이스 on crash
    set $_exitcode = -999
    define hook-stop
        if $_exitcode != -999
            echo , === CRASH DETECTED ===,
            bt
            info registers
            thread apply all bt
        end
    end
end

# 메모리 맵 시각화
define show-memory-layout
    printf "=== Process Memory Layout ===, "
    python
import gdb
mappings = gdb.execute("info proc mappings", to_string=True)
for line in mappings.split(', ')[4:]:  # 헤더 스킵
    if line.strip():
        parts = line.split()
        if len(parts) >= 5:
            start, end, size, offset, obj = parts[:5]
            print(f"{start}-{end} [{size:>10}] {obj}")
    end
end
```

## Reverse debugging (Record and Replay)

### GDB의 역방향 실행 기능

```bash
# 기록 모드 시작
(gdb) target record-full

# 또는 특정 명령어부터 기록
(gdb) break main
(gdb) run
(gdb) record

# 프로그램 실행 후 역방향 디버깅
(gdb) continue  # 프로그램이 크래시될 때까지 실행

# 크래시 후 역방향으로 실행
(gdb) reverse-step     # 한 스텝 뒤로
(gdb) reverse-next     # 함수 호출 건너뛰며 뒤로
(gdb) reverse-continue # 이전 브레이크포인트까지 뒤로

# 역방향 실행 예시
Breakpoint 1, main () at test.c:10
10        int *p = malloc(100);
(gdb) record
(gdb) continue
# ... 프로그램 실행 ...
# Segmentation fault 발생

(gdb) reverse-step
# 크래시 직전으로 돌아감
(gdb) print p
$1 = (int *) 0x0  # NULL pointer 발견!

(gdb) reverse-continue
# 이전 브레이크포인트로 돌아가서 다시 분석
```

### RR (Record and Replay) 도구 활용

```bash
# RR로 프로그램 기록
rr record ./myapp --args arg1 arg2

# 기록된 세션 재생
rr replay

# GDB 인터페이스로 재생
rr replay -d gdb

# 재생 세션에서:
(gdb) continue  # 끝까지 실행
(gdb) reverse-continue  # 처음으로 돌아가기

# 특정 이벤트까지 역방향 실행
(gdb) when-reverse malloc  # malloc 호출까지 뒤로
```

### 복잡한 race condition 디버깅

```bash
# race condition이 있는 멀티스레드 프로그램 기록
rr record -h  # chaos 모드로 기록 (스케줄링 변경)
rr record ./multithreaded_app

# 재생하며 분석
rr replay
(gdb) break shared_variable_write
(gdb) continue  # race condition 발생 지점까지

# 다른 스레드가 언제 값을 변경했는지 확인
(gdb) watch shared_variable
(gdb) reverse-continue  # 마지막 변경 지점까지 역추적

# 스레드간 실행 순서 분석
(gdb) info threads
(gdb) thread 1
(gdb) reverse-step 10  # 10스텝 뒤로
(gdb) thread 2
(gdb) reverse-step 5   # 5스텝 뒤로
```

## 커널 디버깅 (KGDB)

### KGDB 설정 및 사용

```bash
# 커널 설정 (CONFIG_KGDB=y, CONFIG_KGDB_SERIAL_CONSOLE=y)
# /etc/default/grub에 추가:
GRUB_CMDLINE_LINUX="kgdboc=ttyS0,115200 kgdbwait"

# 시리얼 연결로 커널 디버깅
gdb vmlinux
(gdb) set serial baud 115200
(gdb) target remote /dev/ttyS0

# 또는 네트워크를 통한 KGDB (CONFIG_KGDB_KDB=y)
# 대상 시스템에서:
echo ttyS0 > /sys/module/kgdboc/parameters/kgdboc
echo g > /proc/sysrq-trigger  # 커널 디버거 진입

# 호스트에서:
gdb vmlinux
(gdb) target remote 192.168.1.100:2345
```

### 커널 패닉 분석

```bash
# 커널 패닉 발생 시 자동 디버거 진입
# panic() 함수에 브레이크포인트
(gdb) break panic
(gdb) commands
    > bt
    > info registers
    > print *current  # 현재 태스크 정보
    > continue
    > end

# 커널 스택 오버플로우 분석
(gdb) break do_IRQ
(gdb) commands
    > print $rsp
    > if $rsp < 0xffff880000000000
        > print "Kernel stack overflow detected!"
        > bt
    > end
    > continue
    > end

# 커널 메모리 corruption 검사
(gdb) break kfree
(gdb) commands
    > print $rdi  # 해제할 주소
    > x/32x $rdi  # 메모리 내용 확인
    > continue
    > end
```

## Container & Kubernetes 디버깅

### Docker 컨테이너 디버깅

```bash
# 컨테이너 내부 프로세스 디버깅
docker exec -it --privileged container_name /bin/bash

# 호스트에서 컨테이너 프로세스 디버깅
docker inspect container_name | grep Pid
# "Pid": 12345

# 호스트에서 GDB attach
sudo gdb -p 12345

# 컨테이너 filesystem 마운트해서 심볼 접근
mkdir /tmp/container_root
docker export container_name | tar -C /tmp/container_root -xf -

gdb -p 12345
(gdb) set sysroot /tmp/container_root
(gdb) file /tmp/container_root/app/myapp
```

### Kubernetes Pod 디버깅

```yaml
# debug-pod.yaml - 디버깅용 특권 Pod
apiVersion: v1
kind: Pod
metadata:
  name: debug-pod
spec:
  hostPID: true  # 호스트 PID namespace 접근
  containers:
  - name: debugger
    image: ubuntu:20.04
    command: ["/bin/bash"]
    args: ["-c", "while true; do sleep 3600; done"]
    securityContext:
      privileged: true
      capabilities:
        add:
        - SYS_PTRACE
        - SYS_ADMIN
    volumeMounts:
    - name: host-proc
      mountPath: /host/proc
      readOnly: true
    - name: host-sys
      mountPath: /host/sys
      readOnly: true
  volumes:
  - name: host-proc
    hostPath:
      path: /proc
  - name: host-sys
    hostPath:
      path: /sys
  nodeSelector:
    kubernetes.io/hostname: target-node
```

```bash
# 디버깅 Pod에서 대상 프로세스 찾기
kubectl exec -it debug-pod -- /bin/bash

# 호스트의 프로세스 확인
ps aux --pid-namespace | grep myapp
# PID가 호스트 기준으로 표시됨

# GDB로 디버깅
apt update && apt install -y gdb
gdb -p <host_pid>
```

### 분산 시스템 디버깅

```bash
#!/bin/bash
# distributed_debug.sh - 여러 노드에서 동시 디버깅

NODES=("node1" "node2" "node3")
APP_NAME="myapp"

echo "Starting distributed debugging session..."

# 모든 노드에서 디버깅 시작
for node in "${NODES[@]}"; do
    echo "Setting up debugging on $node..."

    # 각 노드에서 백그라운드로 GDB server 시작
    ssh $node "
        PID=\$(pgrep $APP_NAME)
        if [ -n \"\$PID\" ]; then
            gdbserver :999\${RANDOM:0:1} --attach \$PID &
            echo 'GDB server started on $node with PID '\$PID
        fi
    " &
done

wait  # 모든 노드 설정 완료 대기

echo "All nodes ready for debugging"
echo "Connect with: gdb /path/to/binary -ex 'target remote node:port'"
```

## 성능 분석 with GDB

### CPU 프로파일링

```bash
# 샘플링 기반 프로파일링
define profile_cpu
    set $sample_count = 0
    set $max_samples = 1000

    while $sample_count < $max_samples
        # 프로세스 일시 중단
        signal SIGSTOP

        # 현재 위치 기록
        set $pc = $rip
        printf "Sample %d: 0x%lx ", $sample_count, $pc

        # 함수명 출력 시도
        python
try:
    frame = gdb.selected_frame()
    func_name = frame.name() if frame.name() else "unknown"
    print(f"({func_name})")
except:
    print("(unknown)")
        end

        # 잠시 실행 후 다시 샘플링
        signal SIGCONT
        shell sleep 0.01  # 10ms 대기

        set $sample_count = $sample_count + 1
    end
end

# 사용법
(gdb) attach 12345
(gdb) profile_cpu
```

### 메모리 액세스 패턴 분석

```bash
# 메모리 액세스 추적
define trace_memory_access
    # 메모리 읽기/쓰기 추적을 위한 워치포인트 설정
    python
import gdb

class MemoryTracer:
    def __init__(self):
        self.access_count = {}

    def trace_access(self, address, size, access_type):
        addr_range = (address, address + size)
        if addr_range not in self.access_count:
            self.access_count[addr_range] = {'read': 0, 'write': 0}
        self.access_count[addr_range][access_type] += 1

    def print_hotspots(self):
        print("=== Memory Access Hotspots ===")
        sorted_access = sorted(
            self.access_count.items(),
            key=lambda x: x[1]['read'] + x[1]['write'],
            reverse=True
        )[:10]

        for addr_range, counts in sorted_access:
            start, end = addr_range
            total = counts['read'] + counts['write']
            print(f"0x{start:x}-0x{end:x}: {total} accesses "
                  f"(R: {counts['read']}, W: {counts['write']})")

tracer = MemoryTracer()
    end
end
```

### I/O 성능 분석

```bash
# 시스템 콜 기반 I/O 추적
define trace_io_calls
    # 주요 I/O 시스템 콜에 브레이크포인트 설정
    break read
    commands
        python
import time
start_time = time.time()
fd = int(gdb.parse_and_eval("$rdi"))
size = int(gdb.parse_and_eval("$rdx"))
print(f"READ: fd={fd}, size={size}")
gdb.execute("finish")
end_time = time.time()
result = int(gdb.parse_and_eval("$rax"))
elapsed = (end_time - start_time) * 1000
print(f"READ result: {result} bytes, {elapsed:.2f}ms")
        end
        continue
    end

    break write
    commands
        python
import time
start_time = time.time()
fd = int(gdb.parse_and_eval("$rdi"))
size = int(gdb.parse_and_eval("$rdx"))
print(f"WRITE: fd={fd}, size={size}")
gdb.execute("finish")
end_time = time.time()
result = int(gdb.parse_and_eval("$rax"))
elapsed = (end_time - start_time) * 1000
print(f"WRITE result: {result} bytes, {elapsed:.2f}ms")
        end
        continue
    end
end
```

## CI/CD 파이프라인 통합

### 자동화된 Core Dump 분석

```yaml
# .github/workflows/core-dump-analysis.yml
name: Core Dump Analysis

on:
  push:
    paths:
    - 'src/**'
    - 'tests/**'

jobs:
  test-with-core-analysis:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Install debugging tools
      run: |
        sudo apt-get update
        sudo apt-get install -y gdb valgrind

    - name: Build with debug symbols
      run: |
        gcc -g -O0 -fno-omit-frame-pointer -o myapp src/*.c

    - name: Enable core dumps
      run: |
        ulimit -c unlimited
        echo '/tmp/core.%e.%p.%t' | sudo tee /proc/sys/kernel/core_pattern

    - name: Run tests with crash detection
      run: |
        timeout 300 ./run_tests.sh || true

    - name: Analyze core dumps
      if: always()
      run: |
        find /tmp -name 'core.*' -type f | while read core_file; do
          echo "Analyzing core dump: $core_file"
          python3 scripts/core_analyzer.py ./myapp "$core_file" > "${core_file}.analysis"
        done

    - name: Upload crash analysis
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: crash-analysis
        path: /tmp/core.*.analysis
```

### Dockerfile for 디버깅 환경

```dockerfile
# Dockerfile.debug - 프로덕션 디버깅용 이미지
FROM ubuntu:20.04 as debug

RUN apt-get update && apt-get install -y \
    gdb \
    strace \
    ltrace \
    valgrind \
    perf-tools-unstable \
    sysstat \
    procps \
    net-tools \
    tcpdump \
    && rm -rf /var/lib/apt/lists/*

# 디버그 심볼이 포함된 바이너리 복사
COPY --from=builder /app/myapp /app/myapp
COPY --from=builder /app/myapp.debug /app/myapp.debug

# GDB 설정
COPY gdbinit /root/.gdbinit
COPY debug_scripts/ /app/debug_scripts/

# 디버깅 도구들
COPY core_analyzer.py /usr/local/bin/
COPY memory_leak_detector.py /usr/local/bin/

WORKDIR /app

# 권한 설정 (ptrace 허용)
RUN echo 'kernel.yama.ptrace_scope = 0' >> /etc/sysctl.conf

CMD ["gdbserver", ":9999", "/app/myapp"]
```

## 문제 해결 가이드

### 일반적인 GDB 문제들

#### 1. 심볼 정보 없음

```bash
# 문제: (No debugging symbols found)
(gdb) bt
#0  0x0000000000401234 in ?? ()
#1  0x0000000000401456 in ?? ()

# 해결책들:
# 1. 디버그 정보 별도 설치
apt-get install myapp-dbg

# 2. 디버그 정보 수동 로드
objcopy --only-keep-debug myapp myapp.debug
(gdb) symbol-file myapp.debug

# 3. 시스템 라이브러리 디버그 정보
apt-get install libc6-dbg

# 4. 컴파일 시 디버그 정보 포함
gcc -g -O0 -o myapp myapp.c
```

#### 2. 최적화된 변수 접근 불가

```bash
# 문제: <optimized out> 변수
(gdb) print local_var
$1 = <optimized out>

# 해결책:
# 1. 레지스터에서 값 찾기
(gdb) info registers
(gdb) x/s $rdi  # 문자열 포인터인 경우

# 2. 디스어셈블리로 추적
(gdb) disass /m function_name
(gdb) x/x $rbp+offset  # 스택에서 값 읽기

# 3. -Og 옵션으로 재컴파일
gcc -Og -g -o myapp myapp.c
```

#### 3. 멀티스레드 디버깅 문제

```bash
# 문제: 스레드 전환 시 혼란
# 해결책: scheduler-locking 사용
(gdb) set scheduler-locking on   # 현재 스레드만 실행
(gdb) set scheduler-locking off  # 모든 스레드 실행
(gdb) set scheduler-locking step # step 명령에서만 현재 스레드

# Non-stop 모드 활용
(gdb) set non-stop on
(gdb) set target-async on
```

### Container 환경 특수 문제들

#### 1. 권한 부족

```bash
# 문제: Operation not permitted
# 해결책: 컨테이너 권한 설정
docker run --cap-add=SYS_PTRACE --security-opt seccomp=unconfined

# Kubernetes에서:
securityContext:
  capabilities:
    add: ["SYS_PTRACE"]
```

#### 2. 심볼 파일 경로 문제

```bash
# 문제: 컨테이너 내부 경로와 호스트 경로 불일치
# 해결책: sysroot 설정
(gdb) set sysroot /path/to/container/root
(gdb) set solib-search-path /container/lib:/container/usr/lib
```

### 메모리 분석 도구 통합

```bash
# Valgrind와 GDB 연동
valgrind --vgdb=yes --vgdb-error=0 ./myapp

# 별도 터미널에서:
gdb ./myapp
(gdb) target remote | vgdb

# AddressSanitizer와 연동
gcc -fsanitize=address -g -o myapp myapp.c
export ASAN_OPTIONS=abort_on_error=1:disable_coredump=0
./myapp
# 크래시 시 GDB로 core dump 분석
```

## 실제 Production 사례 연구

### 사례 1: 간헐적 Segmentation Fault

**상황**: 웹서버에서 하루에 2-3번 segfault 발생, 로그로는 원인 파악 불가

**디버깅 과정**:

```bash
# 1. Core dump 생성 설정
echo '/var/core/core.%e.%p.%t' | sudo tee /proc/sys/kernel/core_pattern
ulimit -c unlimited

# 2. Core dump 자동 분석 스크립트 배포
cat > /usr/local/bin/analyze_crash.sh << 'EOF'
#!/bin/bash
CORE_FILE="$1"
BINARY="/usr/bin/webserver"

gdb --batch --ex "bt" --ex "info registers" --ex "thread apply all bt" \
    "$BINARY" "$CORE_FILE" > "${CORE_FILE}.analysis"

# Slack 알림
curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"Crash detected on $(hostname): $CORE_FILE\"}" \
    "$SLACK_WEBHOOK_URL"
EOF

# 3. Core dump 발생 시 자동 실행
echo '|/usr/local/bin/analyze_crash.sh %p' > /proc/sys/kernel/core_pattern

# 4. 분석 결과 (실제 케이스)
# Stack trace showed corruption in request parsing
# Root cause: buffer overflow in HTTP header parsing
# Fix: Added bounds checking in parse_headers()
```

### 사례 2: 메모리 누수로 인한 OOM

**상황**: Java 애플리케이션이 아닌 C++ 서비스에서 메모리 사용량 지속 증가

**디버깅 과정**:

```bash
# 1. 실시간 메모리 할당 추적
gdb -p $(pgrep myservice)
(gdb) source memory_leak_detector.py
(gdb) detect-leaks 1800  # 30분간 추적

# 2. 분석 결과
=== Memory Leak Report ===
Total allocated: 2,456,789 bytes
Total freed: 1,234,567 bytes
Potential leaks: 1,222,222 bytes
Unfreed allocations: 1,234

Top unfreed allocation:
Address: 0x7f123456789a
Size: 65536 bytes
Stack trace:
  #0 malloc() at malloc.c:123
  #1 buffer_alloc() at buffer.c:45
  #2 process_large_request() at handler.c:234

# 3. 근본 원인 발견
# Large request 처리 후 buffer 해제 누락
# Fix: Added proper cleanup in error paths
```

### 사례 3: 멀티스레드 데드락

**상황**: 고부하 시 응답 없음, CPU 사용률 정상

**디버깅 과정**:

```bash
# 1. 스레드 상태 분석
gdb -p $(pgrep service)
(gdb) thread apply all bt

# 분석 결과: 전형적인 순환 대기
Thread 1: waiting for log_mutex (owned by thread 2)
Thread 2: waiting for db_mutex (owned by thread 1)

# 2. 뮤텍스 순서 일관성 확인
(gdb) thread 1
(gdb) print log_mutex.__data.__owner  # Thread 2 ID
(gdb) thread 2
(gdb) print db_mutex.__data.__owner   # Thread 1 ID

# 3. 해결책 적용
# Lock ordering 규칙 도입: log_mutex -> db_mutex 순서로 고정
# Timeout 기반 락 획득으로 변경
```

## 정리

GDB는 단순한 디버거를 넘어서 production 환경의 복잡한 문제를 해결할 수 있는 강력한 플랫폼입니다:

### 핵심 역량

- **Deep System Analysis**: 메모리, 스레드, 시스템 콜 레벨 분석
- **Remote Debugging**: 원격 환경에서 안전한 디버깅
- **Automation**: Python extension과 스크립팅으로 자동화
- **Time Travel**: Record & replay로 재현 어려운 버그 추적
- **Production Ready**: 최소 침입으로 라이브 시스템 분석

### Production 활용 전략

1. **예방적 모니터링**: Core dump 자동 분석 시스템 구축
2. **선택적 디버깅**: 특정 조건에서만 상세 분석 수행
3. **원격 분석**: 개발 환경에서 production 데이터 분석
4. **자동화**: 반복 작업을 스크립트와 extension으로 자동화
5. **통합**: CI/CD 파이프라인과 모니터링 시스템 연동

### 고급 기법 활용 지침

- **메모리 corruption**: AddressSanitizer + GDB 조합
- **멀티스레드 이슈**: ThreadSanitizer + 실시간 스레드 분석
- **성능 문제**: 샘플링 기반 프로파일링
- **분산 시스템**: 여러 노드 동시 디버깅
- **Container 환경**: 권한과 네임스페이스 고려사항

### 보안 및 성능 고려사항

- **성능 영향**: 디버깅 중 10-100배 성능 저하 가능
- **보안**: 메모리 내용과 심볼 정보 노출 위험
- **권한**: ptrace capability와 컨테이너 보안 정책
- **격리**: Production 영향 최소화를 위한 격리된 분석 환경

GDB를 mastering하면 "디버깅이 불가능해 보이는" production 문제들도 체계적으로 해결할 수 있습니다. 중요한 것은 도구의 한계를 이해하고, 상황에 맞는 적절한 기법을 선택하는 것입니다.

## 관련 문서

- [ptrace 시스템 콜: 디버깅 도구의 핵심 메커니즘](ptrace-internals.md)
- [strace로 문제 분석하기](strace-debugging.md)
- [Docker Exit 137 디버깅](docker-exit-137-debugging.md)
- [Memory Management Deep Dive](../../cs/memory/memory-management.md)
