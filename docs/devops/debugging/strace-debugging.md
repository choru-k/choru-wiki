---
tags:
  - strace
  - Debugging
  - System-Call
  - Linux
  - Performance
  - Production
  - Kernel
---

# strace로 문제 분석하기: 시스템 콜 레벨 디버깅 완전 가이드

## 들어가며

"애플리케이션이 느려지는데 CPU, 메모리는 정상이야. 도대체 뭐가 문제지?" Production 환경에서 성능 문제나 원인 불명의 장애가 발생했을 때, 가장 강력한 디버깅 도구 중 하나가 바로 **strace**입니다. strace는 프로세스가 커널에 요청하는 모든 시스템 콜을 실시간으로 추적할 수 있어, **애플리케이션이 실제로 무엇을 하고 있는지** 투명하게 볼 수 있게 해줍니다.

## strace의 동작 원리

### ptrace 시스템 콜

strace는 Linux의 `ptrace` 시스템 콜을 사용하여 다른 프로세스를 추적합니다:

```c
// strace의 핵심 동작 (simplified)
#include <sys/ptrace.h>
#include <sys/wait.h>

int main() {
    pid_t child = fork();

    if (child == 0) {
        // 자식 프로세스: 추적 허용
        ptrace(PTRACE_TRACEME, 0, NULL, NULL);
        execl("/path/to/target", "target", NULL);
    } else {
        // 부모 프로세스: 추적 시작
        int status;
        while (waitpid(child, &status, 0)) {
            if (WIFSTOPPED(status)) {
                // 시스템 콜 진입/종료시 중단됨
                long syscall = ptrace(PTRACE_PEEKUSER, child, 8 * ORIG_RAX, NULL);
                printf("System call: %ld, ", syscall);
                ptrace(PTRACE_SYSCALL, child, NULL, NULL);  // 계속 실행
            }
        }
    }
}
```

### 시스템 콜 추적 메커니즘

```text
Process Execution Flow with strace:
┌─────────────────────────────────────────────────┐
│ User Process                                    │
├─────────────────────────────────────────────────┤
│ Application Code                                │
│ ↓                                               │
│ System Call (e.g., read(), write())             │
│ ↓                                               │
├─────────────────────────────────────────────────┤
│ Kernel Space                                    │
│ ↓                                               │
│ ptrace intercepts → strace logs → resume        │
│ ↓                                               │
│ Actual system call execution                    │
│ ↓                                               │
│ Return to user space                            │
└─────────────────────────────────────────────────┘
```

## 기본 strace 사용법

### 기본 명령어 구조

```bash
# 기본 사용법
strace <command>
strace -p <pid>

# 예시: ls 명령어 추적
strace ls /tmp
```

### 주요 옵션들

```bash
# 시간 정보 포함
strace -t ls                    # 시간 (HH:MM:SS)
strace -tt ls                   # 마이크로초 포함
strace -ttt ls                  # Unix timestamp

# 시스템 콜 소요 시간
strace -T ls                    # 각 시스템 콜 실행 시간

# 특정 시스템 콜만 추적
strace -e trace=open,read,write ls
strace -e trace=network nc google.com 80
strace -e trace=file ls /tmp    # 파일 관련 시스템 콜만

# 하위 프로세스도 함께 추적
strace -f ./script.sh           # fork된 자식 프로세스도 추적

# 출력을 파일로 저장
strace -o trace.log ls /tmp

# 통계 정보
strace -c ls                    # 시스템 콜 호출 빈도와 시간 통계
```

## 실전 strace 분석 시나리오

### 시나리오 1: 애플리케이션 시작이 느려요

```bash
# 웹서버 시작 시간 분석
strace -tt -T -o startup.log ./web-server

# 출력 예시 분석
```

$ head -20 startup.log
11:30:45.123456 execve("./web-server", ["web-server"], [...]) = 0 <0.001234>
11:30:45.125678 brk(NULL)                = 0x55e8b8c4c000 <0.000012>
11:30:45.125890 mmap(NULL, 8192, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f2b8c4a1000 <0.000023>
11:30:45.126123 access("/etc/ld.so.preload", R_OK) = -1 ENOENT <0.000045>
11:30:47.234567 connect(3, {sa_family=AF_INET, sin_port=htons(3306), sin_addr=inet_addr("10.0.0.100")}, 16) = -1 ETIMEDOUT <2.108432>

**분석**: 데이터베이스 연결에서 2초 이상 타임아웃 발생!

시간이 오래 걸리는 시스템 콜 분석:

```bash
# 소요 시간 순으로 정렬
grep -E "<[0-9]+\.[0-9]+" startup.log | sort -k2 -t'<' -nr | head -10
```

```text
# 출력:
connect(3, {...}, 16) = -1 ETIMEDOUT <2.108432>
read(4, "", 4096) = 0 <0.567890>
open("/etc/ssl/certs/ca-certificates.crt", O_RDONLY) = 5 <0.123456>
```

### 시나리오 2: 높은 CPU 사용률, 하지만 원인 불명

```bash
# CPU 100% 프로세스 추적
strace -p 12345 -c -S time

# 5초간 추적 후 통계 출력
timeout 5 strace -p 12345 -c

```

# 예시 출력

% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
 85.67    0.234567          12     19456           write
 10.23    0.028901           5      5678           read
  2.45    0.006789          15       456       123 stat
  1.23    0.003456           8       432           open
  0.42    0.001234           3       412           close

**분석**: write 시스템 콜이 85%의 시간을 차지 → 과도한 로그 출력이 원인

## 시나리오 3: 메모리 사용량이 계속 증가

```bash
# 메모리 관련 시스템 콜 추적
strace -p 12345 -e trace=mmap,munmap,brk,mprotect -o memory.log

# 메모리 할당 패턴 분석
grep -E "(mmap|munmap|brk)" memory.log | head -20

```

# 출력 예시

mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f123400000
mmap(NULL, 8192, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f123401000
mmap(NULL, 16384, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f123405000

# munmap 호출이 보이지 않음 → 메모리 누수 의심

메모리 할당/해제 균형 확인:

```bash
# mmap vs munmap 호출 수 비교
grep "mmap(" memory.log | wc -l
grep "munmap(" memory.log | wc -l

# brk 시스템 콜로 힙 증가 추적
grep "brk(" memory.log | tail -10
```

## 네트워크 문제 디버깅

### 연결 실패 분석

```bash
# 네트워크 관련 시스템 콜만 추적
strace -e trace=network -p 12345

# 또는 특정 소켓 시스템 콜
strace -e trace=socket,connect,bind,listen,accept,send,recv -p 12345
```

### 실제 사례: 데이터베이스 연결 문제

```bash
# MySQL 연결 문제 분석
strace -e trace=network mysql -h db.example.com -u user -p

```

# 출력

```text
socket(AF_INET, SOCK_STREAM, IPPROTO_TCP) = 3
connect(3, {sa_family=AF_INET, sin_port=htons(3306), sin_addr=inet_addr("10.0.0.100")}, 16) = -1 ECONNREFUSED (Connection refused)
close(3) = 0
```

**분석**: 3306 포트로 연결 시도하지만 거부됨
**해결책**: 방화벽 확인, MySQL 서비스 상태 확인

## HTTP 요청 분석

```bash
# curl 요청의 내부 동작
strace -e trace=network curl https://api.example.com/users
```

```text
# 출력에서 확인할 수 있는 정보:
socket(AF_INET, SOCK_STREAM, IPPROTO_TCP) = 3    # 소켓 생성
connect(3, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("1.2.3.4")}, 16) = 0  # HTTPS 연결
sendto(3, "GET /users HTTP/1.1\r, Host: api.example.com\r, ...", 145, MSG_NOSIGNAL, NULL, 0) = 145  # 요청 전송
recvfrom(3, "HTTP/1.1 200 OK\r, Content-Type: application/json\r, ...", 16384, 0, NULL, NULL) = 1234  # 응답 수신
```

## 파일 I/O 문제 분석

### 파일 접근 패턴 분석

```bash
# 파일 관련 시스템 콜 추적
strace -e trace=file ./application

# 자주 사용되는 파일 I/O 시스템 콜들:
# - open/openat: 파일 열기
# - read/write: 파일 읽기/쓰기
# - lseek: 파일 포인터 이동
# - close: 파일 닫기
# - stat/fstat: 파일 정보 조회
```

### 설정 파일 로딩 문제

```bash
# 애플리케이션이 어떤 설정 파일을 읽는지 확인
strace -e trace=open,openat ./app 2>&1 | grep -E "\.(conf|config|cfg|ini|yaml|json)"

```

```text
# 설정 파일 접근 결과:
openat(AT_FDCWD, "/etc/app/config.yaml", O_RDONLY) = -1 ENOENT (No such file or directory)
openat(AT_FDCWD, "/usr/local/etc/app.conf", O_RDONLY) = 3
read(3, "database:,   host: localhost,   port: 5432, ", 4096) = 45
```

### 로그 파일 과다 쓰기 분석

```bash
# write 시스템 콜 상세 분석
strace -e trace=write -v -s 100 ./app

# -v: 구조체 내용 자세히 출력
# -s 100: 문자열을 100바이트까지 출력

```

```text
# 로그 작성 결과:
write(2, "[2024-01-15 10:30:45] DEBUG: Processing request id=12345, ", 58) = 58
write(2, "[2024-01-15 10:30:45] DEBUG: Validating user input, ", 51) = 51
write(2, "[2024-01-15 10:30:45] DEBUG: Database query: SELECT * FROM users WHERE id = 12345, ", 81) = 81
```

**분석**: DEBUG 로그가 과도하게 출력됨

## Production 환경에서의 고급 활용

### 1. 성능 영향 최소화

```bash
# 특정 시스템 콜만 추적하여 오버헤드 감소
strace -e trace=write,read,open -p 12345

# 샘플링: 매 10번째 시스템 콜만 추적 (고급 기법)
# 직접 지원되지 않으므로 출력 후처리로 구현
strace -p 12345 | awk 'NR % 10 == 1'
```

### 2. 멀티프로세스 애플리케이션 분석

```bash
# 모든 자식 프로세스 추적
strace -f -o trace_all.log ./multi_process_app

# 프로세스별로 출력 파일 분리
strace -ff -o trace ./multi_process_app
# 결과: trace.12345, trace.12346, trace.12347 등의 파일 생성

# 특정 프로세스의 트레이스만 분석
strace -ff -o trace -e trace=network ./web_server
ls trace.*
grep "connect(" trace.* | head -10
```

### 3. 실시간 모니터링 스크립트

```bash
#!/bin/bash
# realtime_syscall_monitor.sh

PID="$1"
if [[ -z "$PID" ]]; then
    echo "Usage: $0 <pid>"
    exit 1
fi

echo "Real-time system call monitoring for PID: $PID"
echo "Press Ctrl+C to stop"

# 백그라운드에서 strace 실행
strace -p "$PID" -c -S time 2>&1 | while read line; do
    if [[ "$line" =~ "%" ]]; then
        # 통계 헤더나 결과 라인
        echo "$(date '+%H:%M:%S') $line"
    fi
done &

STRACE_PID=$!

# 주기적으로 상위 시스템 콜 표시
while true; do
    sleep 10
    echo "=== Top system calls at $(date) ==="

    # 임시로 strace 통계 수집
    timeout 5 strace -p "$PID" -c 2>/dev/null | tail -10
done

# 정리
kill $STRACE_PID 2>/dev/null
```

## Container 환경에서의 strace

### Docker 컨테이너 내부 프로세스 추적

```bash
# 컨테이너 내부 프로세스의 PID 찾기
docker exec container_name ps aux

# 호스트에서 컨테이너 프로세스 추적
# (컨테이너의 PID는 호스트에서 다른 번호)
docker exec container_name pgrep application
# 또는
ps aux | grep application

# 호스트에서 직접 strace
strace -p <host_pid>

# 컨테이너 내부에서 strace (권한 필요)
docker exec --privileged -it container_name strace -p 1
```

### Kubernetes Pod에서 strace 사용

```bash
# Pod 내부에서 strace 실행 (권한 필요)
kubectl exec -it pod-name -- strace -p 1

# 디버그 컨테이너로 strace 사용
kubectl debug pod-name -it --image=nicolaka/netshoot --profile=sysadmin

# 호스트 노드에서 Pod의 프로세스 추적
# 1. Pod가 실행 중인 노드 찾기
kubectl get pod pod-name -o wide

# 2. 노드에 접속 후 프로세스 찾기
ps aux | grep application
strace -p <pid>
```

## 고급 분석 기법

### 1. 시스템 콜 패턴 분석

```python
#!/usr/bin/env python3
"""
syscall_analyzer.py - strace 출력 분석 도구
"""

import sys
import re
from collections import defaultdict, Counter

def parse_strace_log(filename):
    syscall_stats = defaultdict(list)
    syscall_counts = Counter()

    with open(filename, 'r') as f:
        for line in f:
            # 시스템 콜 파싱: syscall(...) = result <time>
            match = re.match(r'^(\w+)\(.*\) = .* <(\d+\.\d+)>', line.strip())
            if match:
                syscall = match.group(1)
                time_spent = float(match.group(2))

                syscall_stats[syscall].append(time_spent)
                syscall_counts[syscall] += 1

    return syscall_stats, syscall_counts

def analyze_patterns(syscall_stats):
    print("=== System Call Performance Analysis ===")

    for syscall, times in syscall_stats.items():
        if len(times) < 5:  # 최소 5회 이상 호출된 것만 분석
            continue

        total_time = sum(times)
        avg_time = total_time / len(times)
        max_time = max(times)
        min_time = min(times)

        print(f"{syscall}:")
        print(f"  Calls: {len(times)}")
        print(f"  Total time: {total_time:.6f}s")
        print(f"  Avg time: {avg_time:.6f}s")
        print(f"  Max time: {max_time:.6f}s")
        print(f"  Min time: {min_time:.6f}s")

        # 비정상적으로 느린 호출 감지
        if max_time > avg_time * 10:
            print(f"  ⚠️  Detected slow calls (max is {max_time/avg_time:.1f}x average)")
        print()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 syscall_analyzer.py <strace_log>")
        sys.exit(1)

    stats, counts = parse_strace_log(sys.argv[1])
    analyze_patterns(stats)

    print("=== Top 10 Most Frequent System Calls ===")
    for syscall, count in counts.most_common(10):
        print(f"{syscall}: {count} calls")
```

### 2. I/O 패턴 시각화

```bash
#!/bin/bash
# io_pattern_analyzer.sh

STRACE_LOG="$1"
if [[ ! -f "$STRACE_LOG" ]]; then
    echo "Usage: $0 <strace_log_file>"
    exit 1
fi

echo "=== I/O Pattern Analysis ==="
echo

echo "1. File Access Frequency:"
grep -E "(open|openat)" "$STRACE_LOG" | \
    sed -E 's/.*"([^"]+)".*/\1/' | \
    sort | uniq -c | sort -nr | head -10

echo
echo "2. Read/Write Size Distribution:"
grep -E "(read|write)\(" "$STRACE_LOG" | \
    sed -E 's/.*= ([0-9]+).*/\1/' | \
    awk '{
        if ($1 < 1024) small++
        else if ($1 < 1024*1024) medium++
        else large++
        total += $1
    } END {
        print "Small (<1KB): " small
        print "Medium (1KB-1MB): " medium
        print "Large (>1MB): " large
        print "Total bytes: " total
    }'

echo
echo "3. System Call Timeline (last 20 calls):"
tail -20 "$STRACE_LOG" | while IFS= read -r line; do
    timestamp=$(echo "$line" | grep -o '[0-9][0-9]:[0-9][0-9]:[0-9][0-9]\.[0-9]*')
    syscall=$(echo "$line" | sed -E 's/^[^a-zA-Z]*([a-zA-Z_]+)\(.*/\1/')
    if [[ -n "$timestamp" && -n "$syscall" ]]; then
        printf "%-15s %s\n" "$timestamp" "$syscall"
    fi
done
```

## 보안 고려사항

### strace 사용 시 주의점

```bash
# strace는 민감한 정보를 노출할 수 있음
strace -s 1000 mysql -u user -ppassword

# 출력에 패스워드가 평문으로 노출:
execve("/usr/bin/mysql", ["mysql", "-u", "user", "-ppassword"], [...])

# 해결책: 민감한 정보 필터링
strace mysql -u user -ppassword 2>&1 | sed 's/password/****/g'
```

### 권한 요구사항

```bash
# 다른 사용자의 프로세스 추적 시 root 권한 필요
sudo strace -p 12345

# SELinux나 AppArmor 환경에서 추가 설정 필요할 수 있음
# /proc/sys/kernel/yama/ptrace_scope 확인
cat /proc/sys/kernel/yama/ptrace_scope
# 0: 제한 없음
# 1: 같은 사용자만 허용
# 2: 관리자만 허용
# 3: 완전 비활성화
```

## 정리

strace를 이용한 효과적인 디버깅 전략:

### 1단계: 문제 영역 특정

- `strace -c`: 전반적인 시스템 콜 통계
- 시간이 오래 걸리는 시스템 콜 식별

### 2단계: 상세 분석

- `strace -e trace=<category>`: 특정 영역 집중 분석
- `strace -T -tt`: 정확한 시간 정보로 병목 지점 파악

### 3단계: 패턴 분석

- 로그 파일 분석으로 반복 패턴 감지
- 비정상적인 시스템 콜 호출 빈도나 지연 시간 확인

### Production 환경 사용 팁

- **성능 영향**: strace는 프로세스 성능에 상당한 영향을 줌 (10-100배 느려질 수 있음)
- **보안**: 민감한 정보 노출 가능성 주의
- **권한**: 적절한 권한과 보안 정책 확인 필요
- **샘플링**: 전체 추적보다는 특정 시스템 콜이나 시간대만 추적 권장

### 유용한 strace 옵션 조합

```bash
# 빠른 문제 진단
strace -c -p <pid>                    # 통계만
strace -e trace=network -p <pid>      # 네트워크만
strace -e trace=file -T -p <pid>      # 파일 I/O + 시간

# 상세 분석
strace -tt -T -f -o trace.log <cmd>   # 완전한 추적
strace -e trace=!clock_gettime -p <pid>  # 노이즈 시스템 콜 제외
```

## 관련 문서

- [Python Library 분석](python-library-analysis-so-nm.md)
- [CPU 사용량 분석](../performance/cpu-usage-analysis.md)
- [Kubernetes Pod 디버깅](../kubernetes/pod-debugging.md)
