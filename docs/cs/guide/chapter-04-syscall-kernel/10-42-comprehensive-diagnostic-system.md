---
tags:
  - advanced
  - deep-study
  - dmesg
  - ftrace
  - hands-on
  - kernel debugging
  - lockdep
  - perf
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 06a. 종합 커널 진단 시스템

## 다기능 커널 분석 도구

커널 레벨의 문제를 체계적으로 진단하기 위한 통합 분석 시스템입니다. 이 도구는 커널 버전 확인부터 메모리 문제, 성능 카운터, 락 이슈까지 종합적으로 분석합니다.

## 1. 종합 커널 진단 시스템

다양한 커널 디버깅 도구를 통합한 분석 시스템입니다.

```python
#!/usr/bin/env python3
# kernel_debugger.py

import os
import sys
import subprocess
import time
import re
import json
import argparse
from datetime import datetime
from collections import defaultdict
import threading

class KernelDebugger:
    def __init__(self):
        self.debug_info = {}
        self.trace_data = []
        self.analysis_results = {}
        
    def check_kernel_version(self):
        """커널 버전 및 설정 확인"""
        print("=== 커널 정보 ===")
        
        # 커널 버전
        try:
            with open('/proc/version', 'r') as f:
                kernel_version = f.read().strip()
                print(f"커널 버전: {kernel_version}")
        except:
            print("커널 버전 정보를 읽을 수 없습니다")
        
        # 커널 매개변수
        try:
            with open('/proc/cmdline', 'r') as f:
                cmdline = f.read().strip()
                print(f"커널 매개변수: {cmdline}")
        except:
            print("커널 매개변수를 읽을 수 없습니다")
        
        # 디버깅 기능 확인
        debug_features = {
            'CONFIG_DEBUG_KERNEL': '/proc/config.gz',
            'KASAN': '/sys/kernel/debug',
            'LOCKDEP': '/proc/lockdep',
            'FTRACE': '/sys/kernel/debug/tracing',
            'PERF': '/proc/sys/kernel/perf_event_paranoid'
        }
        
        print("\n디버깅 기능 상태:")
        for feature, path in debug_features.items():
            if os.path.exists(path):
                print(f"  {feature}: 사용 가능")
            else:
                print(f"  {feature}: 사용 불가")
    
    def analyze_kernel_messages(self):
        """커널 메시지 분석"""
        print("\n=== 커널 메시지 분석 ===")
        
        try:
            # dmesg 출력 분석
            result = subprocess.run(['dmesg', '-T'], capture_output=True, text=True)
            if result.returncode == 0:
                messages = result.stdout.split('\n')
                
                # 오류 패턴 분석
                error_patterns = {
                    'Oops': r'Oops:',
                    'BUG': r'BUG:',
                    'WARNING': r'WARNING:',
                    'Call Trace': r'Call Trace:',
                    'RIP': r'RIP:',
                    'segfault': r'segfault',
                    'killed': r'killed',
                    'OOM': r'Out of memory',
                    'hung task': r'hung task',
                    'soft lockup': r'soft lockup',
                    'hard lockup': r'hard lockup'
                }
                
                error_counts = defaultdict(int)
                recent_errors = []
                
                for message in messages[-1000:]:  # 최근 1000개 메시지만
                    for error_type, pattern in error_patterns.items():
                        if re.search(pattern, message, re.IGNORECASE):
                            error_counts[error_type] += 1
                            recent_errors.append((error_type, message))
                
                # 오류 통계 출력
                if error_counts:
                    print("발견된 오류:")
                    for error_type, count in error_counts.items():
                        print(f"  {error_type}: {count}회")
                    
                    print("\n최근 오류 메시지:")
                    for error_type, message in recent_errors[-10:]:
                        print(f"  [{error_type}] {message}")
                else:
                    print("심각한 커널 오류 메시지가 발견되지 않았습니다")
                
        except Exception as e:
            print(f"커널 메시지 분석 실패: {e}")
    
    def check_memory_issues(self):
        """메모리 관련 문제 검사"""
        print("\n=== 메모리 문제 분석 ===")
        
        # 메모리 정보
        try:
            with open('/proc/meminfo', 'r') as f:
                meminfo = f.read()
                
            # 주요 메모리 정보 추출
            memory_stats = {}
            for line in meminfo.split('\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    memory_stats[key.strip()] = value.strip()
            
            # 메모리 사용률 계산
            total_mem = int(memory_stats.get('MemTotal', '0').split()[0])
            free_mem = int(memory_stats.get('MemFree', '0').split()[0])
            available_mem = int(memory_stats.get('MemAvailable', '0').split()[0])
            
            usage_percent = (total_mem - available_mem) / total_mem * 100
            
            print(f"총 메모리: {total_mem // 1024} MB")
            print(f"사용 가능: {available_mem // 1024} MB")
            print(f"사용률: {usage_percent:.1f}%")
            
            if usage_percent > 90:
                print("⚠️ 높은 메모리 사용률 감지")
            
            # Slab 메모리 확인
            print(f"Slab: {memory_stats.get('Slab', 'N/A')}")
            print(f"SReclaimable: {memory_stats.get('SReclaimable', 'N/A')}")
            print(f"SUnreclaim: {memory_stats.get('SUnreclaim', 'N/A')}")
            
        except Exception as e:
            print(f"메모리 정보 읽기 실패: {e}")
        
        # SLUB 디버깅 정보 (가능한 경우)
        slub_debug_path = '/sys/kernel/slab'
        if os.path.exists(slub_debug_path):
            print("\nSLUB 캐시 정보:")
            try:
                slub_dirs = os.listdir(slub_debug_path)
                large_caches = []
                
                for cache_dir in slub_dirs[:20]:  # 상위 20개만
                    cache_path = os.path.join(slub_debug_path, cache_dir)
                    try:
                        with open(os.path.join(cache_path, 'slabs'), 'r') as f:
                            slabs = int(f.read().strip())
                        with open(os.path.join(cache_path, 'object_size'), 'r') as f:
                            obj_size = int(f.read().strip())
                        
                        total_size = slabs * obj_size
                        if total_size > 1024 * 1024:  # 1MB 이상
                            large_caches.append((cache_dir, total_size, slabs))
                    except:
                        continue
                
                large_caches.sort(key=lambda x: x[1], reverse=True)
                for cache_name, size, slabs in large_caches[:10]:
                    print(f"  {cache_name}: {size // 1024} KB ({slabs} slabs)")
                    
            except Exception as e:
                print(f"SLUB 정보 읽기 실패: {e}")
    
    def analyze_performance_counters(self):
        """성능 카운터 분석"""
        print("\n=== 성능 카운터 분석 ===")
        
        # CPU 통계
        try:
            with open('/proc/stat', 'r') as f:
                stat_line = f.readline()
                cpu_times = list(map(int, stat_line.split()[1:]))
                
            total_time = sum(cpu_times)
            if total_time > 0:
                user_percent = cpu_times[0] / total_time * 100
                sys_percent = cpu_times[2] / total_time * 100
                idle_percent = cpu_times[3] / total_time * 100
                iowait_percent = cpu_times[4] / total_time * 100
                
                print(f"사용자 시간: {user_percent:.1f}%")
                print(f"시스템 시간: {sys_percent:.1f}%")
                print(f"유휴 시간: {idle_percent:.1f}%")
                print(f"I/O 대기: {iowait_percent:.1f}%")
                
                if iowait_percent > 20:
                    print("⚠️ 높은 I/O 대기 시간 감지")
                if sys_percent > 30:
                    print("⚠️ 높은 시스템 시간 감지")
        except:
            print("CPU 통계 읽기 실패")
        
        # 컨텍스트 스위치 및 인터럽트
        try:
            with open('/proc/stat', 'r') as f:
                for line in f:
                    if line.startswith('ctxt'):
                        ctxt_switches = int(line.split()[1])
                        print(f"컨텍스트 스위치: {ctxt_switches}")
                    elif line.startswith('intr'):
                        interrupts = int(line.split()[1])
                        print(f"인터럽트: {interrupts}")
        except:
            print("컨텍스트 스위치/인터럽트 정보 읽기 실패")
        
        # 로드 평균
        try:
            with open('/proc/loadavg', 'r') as f:
                loadavg = f.read().strip().split()
                print(f"로드 평균: {loadavg[0]} {loadavg[1]} {loadavg[2]}")
                
                if float(loadavg[0]) > 2.0:
                    print("⚠️ 높은 로드 평균 감지")
        except:
            print("로드 평균 읽기 실패")
    
    def check_lock_issues(self):
        """락 관련 문제 검사"""
        print("\n=== 락 문제 분석 ===")
        
        # lockdep 정보 (가능한 경우)
        lockdep_path = '/proc/lockdep'
        if os.path.exists(lockdep_path):
            try:
                with open(lockdep_path, 'r') as f:
                    lockdep_info = f.read()
                    
                lines = lockdep_info.split('\n')
                print(f"등록된 락 클래스: {len([l for l in lines if 'class' in l])}")
                
                # 락 통계 추출
                for line in lines:
                    if 'lock-classes' in line or 'direct dependencies' in line:
                        print(f"  {line.strip()}")
                        
            except Exception as e:
                print(f"lockdep 정보 읽기 실패: {e}")
        else:
            print("lockdep이 활성화되지 않음")
        
        # hung task 감지기 상태
        hung_task_path = '/proc/sys/kernel/hung_task_timeout_secs'
        if os.path.exists(hung_task_path):
            try:
                with open(hung_task_path, 'r') as f:
                    timeout = f.read().strip()
                    print(f"Hung task 타임아웃: {timeout}초")
            except:
                pass
        
        # 현재 대기 중인 태스크들
        try:
            result = subprocess.run(['ps', 'axo', 'pid,stat,comm'], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                lines = result.stdout.split('\n')
                waiting_tasks = []
                
                for line in lines[1:]:  # 헤더 스킵
                    if line.strip():
                        parts = line.split(None, 2)
                        if len(parts) >= 3:
                            pid, stat, comm = parts
                            if 'D' in stat:  # Uninterruptible sleep
                                waiting_tasks.append((pid, stat, comm))
                
                if waiting_tasks:
                    print(f"\n언인터럽터블 슬립 상태 프로세스: {len(waiting_tasks)}개")
                    for pid, stat, comm in waiting_tasks[:10]:
                        print(f"  PID {pid}: {comm} ({stat})")
                    
                    if len(waiting_tasks) > 5:
                        print("⚠️ 많은 프로세스가 I/O 대기 상태입니다")
        except:
            print("프로세스 상태 확인 실패")
    
    def trace_kernel_functions(self, function_name=None, duration=10):
        """커널 함수 추적"""
        print(f"\n=== 커널 함수 추적 ({duration}초) ===")
        
        ftrace_path = '/sys/kernel/debug/tracing'
        if not os.path.exists(ftrace_path):
            print("ftrace가 사용 불가능합니다")
            return
        
        try:
            # ftrace 설정
            with open(os.path.join(ftrace_path, 'current_tracer'), 'w') as f:
                f.write('function')
            
            if function_name:
                with open(os.path.join(ftrace_path, 'set_ftrace_filter'), 'w') as f:
                    f.write(function_name)
            
            # 추적 시작
            with open(os.path.join(ftrace_path, 'tracing_on'), 'w') as f:
                f.write('1')
            
            print(f"추적 시작... ({duration}초)")
            time.sleep(duration)
            
            # 추적 중지
            with open(os.path.join(ftrace_path, 'tracing_on'), 'w') as f:
                f.write('0')
            
            # 결과 읽기
            with open(os.path.join(ftrace_path, 'trace'), 'r') as f:
                trace_data = f.read()
            
            # 결과 분석
            lines = trace_data.split('\n')
            function_counts = defaultdict(int)
            
            for line in lines:
                if '|' in line and 'tracing_mark_write' not in line:
                    # 함수 이름 추출
                    match = re.search(r'\s+(\w+)\s*\(', line)
                    if match:
                        func_name = match.group(1)
                        function_counts[func_name] += 1
            
            # 상위 함수들 출력
            print("가장 많이 호출된 함수들:")
            sorted_funcs = sorted(function_counts.items(), 
                                key=lambda x: x[1], reverse=True)
            
            for func_name, count in sorted_funcs[:20]:
                print(f"  {func_name}: {count}회")
            
            # 정리
            with open(os.path.join(ftrace_path, 'trace'), 'w') as f:
                f.write('')
            
        except Exception as e:
            print(f"ftrace 실행 실패: {e}")
    
    def analyze_with_perf(self, duration=10):
        """perf를 사용한 성능 분석"""
        print(f"\n=== perf 성능 분석 ({duration}초) ===")
        
        try:
            # CPU 사용률이 높은 함수들 프로파일링
            result = subprocess.run([
                'perf', 'record', '-g', '-a', 
                '--', 'sleep', str(duration)
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                # 리포트 생성
                report_result = subprocess.run([
                    'perf', 'report', '--stdio', '--no-children'
                ], capture_output=True, text=True)
                
                if report_result.returncode == 0:
                    lines = report_result.stdout.split('\n')
                    print("CPU 사용률이 높은 함수들:")
                    
                    for line in lines[:30]:
                        if '%' in line and 'Samples' not in line:
                            print(f"  {line.strip()}")
                
                # 정리
                os.remove('perf.data')
            else:
                print("perf record 실행 실패 (권한 확인 필요)")
                
        except FileNotFoundError:
            print("perf 도구가 설치되지 않음")
        except Exception as e:
            print(f"perf 분석 실패: {e}")
    
    def check_hardware_errors(self):
        """하드웨어 오류 검사"""
        print("\n=== 하드웨어 오류 검사 ===")
        
        # MCE (Machine Check Exception) 확인
        mce_path = '/sys/devices/system/machinecheck'
        if os.path.exists(mce_path):
            try:
                mce_dirs = [d for d in os.listdir(mce_path) 
                           if d.startswith('machinecheck')]
                
                total_errors = 0
                for mce_dir in mce_dirs:
                    error_file = os.path.join(mce_path, mce_dir, 'mce_count')
                    if os.path.exists(error_file):
                        with open(error_file, 'r') as f:
                            count = int(f.read().strip())
                            total_errors += count
                
                print(f"MCE 오류 총 개수: {total_errors}")
                if total_errors > 0:
                    print("⚠️ 하드웨어 오류가 감지되었습니다")
                    
            except Exception as e:
                print(f"MCE 정보 읽기 실패: {e}")
        
        # EDAC (Error Detection and Correction) 확인
        edac_path = '/sys/devices/system/edac/mc'
        if os.path.exists(edac_path):
            try:
                mc_dirs = [d for d in os.listdir(edac_path) if d.startswith('mc')]
                
                for mc_dir in mc_dirs:
                    ce_file = os.path.join(edac_path, mc_dir, 'ce_count')
                    ue_file = os.path.join(edac_path, mc_dir, 'ue_count')
                    
                    ce_count = 0
                    ue_count = 0
                    
                    if os.path.exists(ce_file):
                        with open(ce_file, 'r') as f:
                            ce_count = int(f.read().strip())
                    
                    if os.path.exists(ue_file):
                        with open(ue_file, 'r') as f:
                            ue_count = int(f.read().strip())
                    
                    print(f"메모리 컨트롤러 {mc_dir}: CE={ce_count}, UE={ue_count}")
                    
                    if ue_count > 0:
                        print("🔴 수정 불가능한 메모리 오류 감지!")
                    elif ce_count > 100:
                        print("⚠️ 많은 수정 가능한 메모리 오류")
                        
            except Exception as e:
                print(f"EDAC 정보 읽기 실패: {e}")
        else:
            print("EDAC 정보 없음")
    
    def generate_debug_report(self):
        """종합 디버그 리포트 생성"""
        print("\n" + "="*60)
        print("종합 커널 디버그 리포트")
        print("="*60)
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"생성 시간: {timestamp}\n")
        
        # 모든 분석 실행
        self.check_kernel_version()
        self.analyze_kernel_messages()
        self.check_memory_issues()
        self.analyze_performance_counters()
        self.check_lock_issues()
        self.check_hardware_errors()
        
        print("\n" + "="*60)
        print("권장사항:")
        
        # 간단한 권장사항 로직
        recommendations = []
        
        # dmesg에서 오류가 있으면
        try:
            result = subprocess.run(['dmesg'], capture_output=True, text=True)
            if 'OOM' in result.stdout:
                recommendations.append("메모리 사용량을 줄이거나 스왑을 증가시키세요")
            if 'BUG:' in result.stdout or 'Oops:' in result.stdout:
                recommendations.append("커널 덤프를 분석하여 버그 원인을 파악하세요")
            if 'hung task' in result.stdout:
                recommendations.append("I/O 서브시스템이나 락 경합을 확인하세요")
        except:
            pass
        
        # 메모리 사용률 확인
        try:
            with open('/proc/meminfo', 'r') as f:
                meminfo = f.read()
                if 'MemAvailable' in meminfo:
                    for line in meminfo.split('\n'):
                        if 'MemTotal:' in line:
                            total_kb = int(line.split()[1])
                        elif 'MemAvailable:' in line:
                            avail_kb = int(line.split()[1])
                    
                    usage_percent = (total_kb - avail_kb) / total_kb * 100
                    if usage_percent > 90:
                        recommendations.append("메모리 사용률이 높습니다. 메모리 누수를 확인하세요")
        except:
            pass
        
        if recommendations:
            for i, rec in enumerate(recommendations, 1):
                print(f"{i}. {rec}")
        else:
            print("현재 심각한 문제는 발견되지 않았습니다.")
        
        print("\n추가 디버깅 도구:")
        print("- crash 도구로 크래시 덤프 분석")
        print("- eBPF/bpftrace로 상세 추적")
        print("- SystemTap으로 동적 추적")
        print("- Intel VTune으로 성능 분석")

def main():
    parser = argparse.ArgumentParser(description='커널 디버깅 도구')
    parser.add_argument('--report', action='store_true', 
                       help='종합 디버그 리포트 생성')
    parser.add_argument('--trace-function', type=str,
                       help='특정 커널 함수 추적')
    parser.add_argument('--trace-duration', type=int, default=10,
                       help='추적 시간 (초)')
    parser.add_argument('--perf-analysis', action='store_true',
                       help='perf를 사용한 성능 분석')
    parser.add_argument('--memory-check', action='store_true',
                       help='메모리 문제만 검사')
    parser.add_argument('--lock-check', action='store_true',
                       help='락 문제만 검사')
    
    args = parser.parse_args()
    
    debugger = KernelDebugger()
    
    if args.report:
        debugger.generate_debug_report()
    elif args.trace_function:
        debugger.trace_kernel_functions(args.trace_function, args.trace_duration)
    elif args.perf_analysis:
        debugger.analyze_with_perf(args.trace_duration)
    elif args.memory_check:
        debugger.check_memory_issues()
    elif args.lock_check:
        debugger.check_lock_issues()
    else:
        # 기본: 간단한 검사
        debugger.check_kernel_version()
        debugger.analyze_kernel_messages()
        debugger.analyze_performance_counters()

if __name__ == '__main__':
    main()
```

## 핵심 요점

### 1. 다층적 진단 접근법

종합적인 커널 상태 분석을 통해 문제의 근본 원인을 파악합니다.

### 2. 자동화된 패턴 인식

dmesg 로그에서 알려진 오류 패턴을 자동으로 감지하고 분류합니다.

### 3. 성능 메트릭 통합 분석

CPU, 메모리, I/O, 락 등 다양한 성능 지표를 종합적으로 분석합니다.

---

**이전**: [06. 커널 디버깅 기법 개요](index.md)  
**다음**: [06b. eBPF 기반 고급 추적](04-21-ebpf-advanced-tracing.md)에서 고성능 커널 추적 시스템을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-10-syscall-kernel)

- [Chapter 10-1: 시스템 호출 기초와 인터페이스](./04-01-system-call-basics.md)
- [Chapter 10-2: 리눅스 커널 아키텍처 개요](./04-02-kernel-architecture.md)
- [Chapter 10-2A: 커널 설계 철학과 아키텍처 기초](./04-10-kernel-design-philosophy.md)
- [Chapter 10-2A: 커널 설계 철학과 전체 구조](./04-11-kernel-design-structure.md)
- [Chapter 10-2B: 핵심 서브시스템 탐구](./04-12-core-subsystems.md)

### 🏷️ 관련 키워드

`kernel debugging`, `ftrace`, `perf`, `dmesg`, `lockdep`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
