---
tags:
  - eBPF
  - Kernel
  - Tracing
  - Performance
---

# 06b. eBPF 기반 고급 추적 시스템

## 고성능 커널 레벨 동적 추적

eBPF(Extended Berkeley Packet Filter)를 활용한 고성능 커널 추적 시스템입니다. 이 도구는 시스템 호출 지연시간, 메모리 누수, 락 경합, I/O 지연시간을 실시간으로 모니터링하고 분석합니다.

## 2. eBPF 기반 고급 추적 시스템

eBPF를 사용한 고성능 커널 추적 도구입니다.

```python
#!/usr/bin/env python3
# ebpf_kernel_tracer.py

from bcc import BPF
import time
import json
import argparse
from collections import defaultdict

# eBPF 프로그램들
SYSCALL_LATENCY_PROG = """
#include <uapi/linux/ptrace.h>
#include <linux/sched.h>

BPF_HASH(start, u32);
BPF_HISTOGRAM(dist);

int syscall_enter(struct pt_regs *ctx, int nr) {
    u32 pid = bpf_get_current_pid_tgid();
    u64 ts = bpf_ktime_get_ns();
    start.update(&pid, &ts);
    return 0;
}

int syscall_exit(struct pt_regs *ctx, long ret) {
    u32 pid = bpf_get_current_pid_tgid();
    u64 *tsp = start.lookup(&pid);
    if (tsp == 0) {
        return 0;
    }
    
    u64 delta = bpf_ktime_get_ns() - *tsp;
    dist.increment(bpf_log2l(delta / 1000));  // microseconds
    start.delete(&pid);
    return 0;
}
"""

MEMORY_LEAK_PROG = """
#include <uapi/linux/ptrace.h>
#include <linux/mm.h>

BPF_HASH(sizes, u64);
BPF_HASH(stack_traces, u32);

int alloc_enter(struct pt_regs *ctx, size_t size) {
    u64 pid_tgid = bpf_get_current_pid_tgid();
    u32 pid = pid_tgid >> 32;
    
    // 스택 추적 ID 생성
    u32 stack_id = stack_traces.get_stackid(ctx, BPF_F_REUSE_STACKID);
    
    // 할당 크기 저장
    sizes.update(&pid_tgid, &size);
    
    return 0;
}

int alloc_exit(struct pt_regs *ctx) {
    u64 address = PT_REGS_RC(ctx);
    u64 pid_tgid = bpf_get_current_pid_tgid();
    
    if (address != 0) {
        u64 *size = sizes.lookup(&pid_tgid);
        if (size != 0) {
            // 할당 기록
            bpf_trace_printk("ALLOC pid=%d addr=%llx size=%lld\n", 
                           pid_tgid >> 32, address, *size);
        }
    }
    
    sizes.delete(&pid_tgid);
    return 0;
}

int free_enter(struct pt_regs *ctx, void *ptr) {
    u64 address = (u64)ptr;
    u32 pid = bpf_get_current_pid_tgid() >> 32;
    
    if (address != 0) {
        bpf_trace_printk("FREE pid=%d addr=%llx\n", pid, address);
    }
    
    return 0;
}
"""

LOCK_CONTENTION_PROG = """
#include <uapi/linux/ptrace.h>
#include <linux/sched.h>

BPF_HASH(lock_start, u64);
BPF_HASH(lock_stats, u64, u64);

int lock_acquire_enter(struct pt_regs *ctx, void *lock) {
    u64 lock_addr = (u64)lock;
    u64 ts = bpf_ktime_get_ns();
    lock_start.update(&lock_addr, &ts);
    return 0;
}

int lock_acquire_exit(struct pt_regs *ctx, void *lock) {
    u64 lock_addr = (u64)lock;
    u64 *tsp = lock_start.lookup(&lock_addr);
    
    if (tsp == 0) {
        return 0;
    }
    
    u64 delta = bpf_ktime_get_ns() - *tsp;
    
    // 1ms 이상 걸린 락만 기록
    if (delta > 1000000) {
        u64 *count = lock_stats.lookup(&lock_addr);
        if (count == 0) {
            u64 initial = 1;
            lock_stats.update(&lock_addr, &initial);
        } else {
            (*count)++;
            lock_stats.update(&lock_addr, count);
        }
        
        bpf_trace_printk("LOCK_CONTENTION addr=%llx time=%lld\n", 
                        lock_addr, delta);
    }
    
    lock_start.delete(&lock_addr);
    return 0;
}
"""

class EBPFKernelTracer:
    def __init__(self):
        self.bpf = None
        self.traces = []
        
    def trace_syscall_latency(self, duration=30):
        """시스템 호출 지연시간 추적"""
        print(f"시스템 호출 지연시간 추적 시작 ({duration}초)...")
        
        try:
            self.bpf = BPF(text=SYSCALL_LATENCY_PROG)
            self.bpf.attach_kprobe(event="sys_enter", fn_name="syscall_enter")
            self.bpf.attach_kretprobe(event="sys_exit", fn_name="syscall_exit")
            
            print("추적 중... Ctrl+C로 중단")
            time.sleep(duration)
            
            print("\n시스템 호출 지연시간 분포 (마이크로초):")
            self.bpf["dist"].print_log2_hist("latency")
            
        except KeyboardInterrupt:
            print("\n추적 중단됨")
        except Exception as e:
            print(f"eBPF 추적 실패: {e}")
        finally:
            if self.bpf:
                self.bpf.detach_kprobe(event="sys_enter")
                self.bpf.detach_kretprobe(event="sys_exit")
    
    def trace_memory_leaks(self, target_pid=None, duration=60):
        """메모리 누수 추적"""
        print(f"메모리 누수 추적 시작 ({duration}초)...")
        
        try:
            self.bpf = BPF(text=MEMORY_LEAK_PROG)
            
            # kmalloc/kfree 추적
            self.bpf.attach_kprobe(event="__kmalloc", fn_name="alloc_enter")
            self.bpf.attach_kretprobe(event="__kmalloc", fn_name="alloc_exit")
            self.bpf.attach_kprobe(event="kfree", fn_name="free_enter")
            
            allocations = defaultdict(int)
            frees = defaultdict(int)
            
            print("메모리 할당/해제 추적 중...")
            start_time = time.time()
            
            while time.time() - start_time < duration:
                try:
                    (task, pid, cpu, flags, ts, msg) = self.bpf.trace_fields()
                    
                    if b"ALLOC" in msg:
                        allocations[pid] += 1
                    elif b"FREE" in msg:
                        frees[pid] += 1
                        
                except ValueError:
                    continue
                except KeyboardInterrupt:
                    break
            
            print("\n메모리 할당/해제 통계:")
            print("PID\t할당\t해제\t누수 의심")
            print("-" * 40)
            
            for pid in set(list(allocations.keys()) + list(frees.keys())):
                alloc_count = allocations[pid]
                free_count = frees[pid]
                leak_suspected = alloc_count - free_count
                
                if leak_suspected > 10:  # 10개 이상 차이
                    print(f"{pid}\t{alloc_count}\t{free_count}\t{leak_suspected} ⚠️")
                else:
                    print(f"{pid}\t{alloc_count}\t{free_count}\t{leak_suspected}")
                    
        except Exception as e:
            print(f"메모리 누수 추적 실패: {e}")
        finally:
            if self.bpf:
                self.bpf.detach_kprobe(event="__kmalloc")
                self.bpf.detach_kretprobe(event="__kmalloc")
                self.bpf.detach_kprobe(event="kfree")
    
    def trace_lock_contention(self, duration=30):
        """락 경합 추적"""
        print(f"락 경합 추적 시작 ({duration}초)...")
        
        try:
            self.bpf = BPF(text=LOCK_CONTENTION_PROG)
            
            # 스핀락 경합 추적
            self.bpf.attach_kprobe(event="queued_spin_lock_slowpath", 
                                 fn_name="lock_acquire_enter")
            self.bpf.attach_kretprobe(event="queued_spin_lock_slowpath", 
                                    fn_name="lock_acquire_exit")
            
            contentions = defaultdict(int)
            
            print("락 경합 추적 중...")
            start_time = time.time()
            
            while time.time() - start_time < duration:
                try:
                    (task, pid, cpu, flags, ts, msg) = self.bpf.trace_fields()
                    
                    if b"LOCK_CONTENTION" in msg:
                        # 락 주소 추출
                        msg_str = msg.decode('utf-8', 'replace')
                        if 'addr=' in msg_str:
                            addr = msg_str.split('addr=')[1].split()[0]
                            contentions[addr] += 1
                            
                except ValueError:
                    continue
                except KeyboardInterrupt:
                    break
            
            print("\n락 경합 통계:")
            print("락 주소\t\t경합 횟수")
            print("-" * 30)
            
            sorted_locks = sorted(contentions.items(), 
                                key=lambda x: x[1], reverse=True)
            
            for addr, count in sorted_locks[:20]:
                print(f"{addr}\t{count}")
            
            if sorted_locks:
                print(f"\n가장 경합이 심한 락: {sorted_locks[0][0]} ({sorted_locks[0][1]}회)")
            else:
                print("심각한 락 경합이 감지되지 않았습니다")
                
        except Exception as e:
            print(f"락 경합 추적 실패: {e}")
        finally:
            if self.bpf:
                self.bpf.detach_kprobe(event="queued_spin_lock_slowpath")
                self.bpf.detach_kretprobe(event="queued_spin_lock_slowpath")
    
    def trace_io_latency(self, duration=30):
        """I/O 지연시간 추적"""
        print(f"I/O 지연시간 추적 시작 ({duration}초)...")
        
        io_prog = """
        #include <uapi/linux/ptrace.h>
        #include <linux/blkdev.h>
        
        BPF_HASH(start, struct request *);
        
        int block_rq_insert(struct pt_regs *ctx, struct request_queue *q, struct request *rq) {
            u64 ts = bpf_ktime_get_ns();
            start.update(&rq, &ts);
            return 0;
        }
        
        int block_rq_complete(struct pt_regs *ctx, struct request_queue *q, struct request *rq) {
            u64 *tsp = start.lookup(&rq);
            if (tsp == 0) {
                return 0;
            }
            
            u64 delta = bpf_ktime_get_ns() - *tsp;
            bpf_trace_printk("IO_LATENCY %lld\n", delta);
            start.delete(&rq);
            return 0;
        }
        """
        
        try:
            self.bpf = BPF(text=io_prog)
            self.bpf.attach_kprobe(event="blk_account_io_start", fn_name="block_rq_insert")
            self.bpf.attach_kprobe(event="blk_account_io_done", fn_name="block_rq_complete")
            
            latencies = []
            start_time = time.time()
            
            print("I/O 지연시간 측정 중...")
            
            while time.time() - start_time < duration:
                try:
                    (task, pid, cpu, flags, ts, msg) = self.bpf.trace_fields()
                    
                    if b"IO_LATENCY" in msg:
                        latency_ns = int(msg.decode().split()[1])
                        latency_ms = latency_ns / 1000000
                        latencies.append(latency_ms)
                        
                except ValueError:
                    continue
                except KeyboardInterrupt:
                    break
            
            if latencies:
                latencies.sort()
                avg_latency = sum(latencies) / len(latencies)
                p95_latency = latencies[int(len(latencies) * 0.95)]
                p99_latency = latencies[int(len(latencies) * 0.99)]
                
                print(f"\nI/O 지연시간 통계 ({len(latencies)}개 요청):")
                print(f"평균: {avg_latency:.2f} ms")
                print(f"95th percentile: {p95_latency:.2f} ms")
                print(f"99th percentile: {p99_latency:.2f} ms")
                print(f"최대: {max(latencies):.2f} ms")
                
                if p95_latency > 100:
                    print("⚠️ 높은 I/O 지연시간이 감지되었습니다")
            else:
                print("I/O 활동이 감지되지 않았습니다")
                
        except Exception as e:
            print(f"I/O 지연시간 추적 실패: {e}")
        finally:
            if self.bpf:
                self.bpf.detach_kprobe(event="blk_account_io_start")
                self.bpf.detach_kprobe(event="blk_account_io_done")

def main():
    parser = argparse.ArgumentParser(description='eBPF 커널 추적기')
    parser.add_argument('--syscall-latency', action='store_true',
                       help='시스템 호출 지연시간 추적')
    parser.add_argument('--memory-leaks', action='store_true',
                       help='메모리 누수 추적')
    parser.add_argument('--lock-contention', action='store_true',
                       help='락 경합 추적')
    parser.add_argument('--io-latency', action='store_true',
                       help='I/O 지연시간 추적')
    parser.add_argument('--duration', type=int, default=30,
                       help='추적 시간 (초)')
    parser.add_argument('--pid', type=int,
                       help='특정 PID만 추적')
    
    args = parser.parse_args()
    
    if not any([args.syscall_latency, args.memory_leaks, 
                args.lock_contention, args.io_latency]):
        print("추적할 항목을 선택하세요:")
        print("  --syscall-latency  : 시스템 호출 지연시간")
        print("  --memory-leaks     : 메모리 누수")
        print("  --lock-contention  : 락 경합")
        print("  --io-latency       : I/O 지연시간")
        return
    
    tracer = EBPFKernelTracer()
    
    try:
        if args.syscall_latency:
            tracer.trace_syscall_latency(args.duration)
        elif args.memory_leaks:
            tracer.trace_memory_leaks(args.pid, args.duration)
        elif args.lock_contention:
            tracer.trace_lock_contention(args.duration)
        elif args.io_latency:
            tracer.trace_io_latency(args.duration)
    except KeyboardInterrupt:
        print("\n추적이 중단되었습니다")
    except Exception as e:
        print(f"오류: {e}")

if __name__ == '__main__':
    main()
```

## eBPF 프로그램 세부 구조

### 1. 시스템 호출 지연시간 추적

```c
BPF_HASH(start, u32);      // 프로세스별 시작 시간 저장
BPF_HISTOGRAM(dist);       // 지연시간 분포 히스토그램

// 시스템 호출 진입시 타임스탬프 기록
int syscall_enter(struct pt_regs *ctx, int nr) {
    u32 pid = bpf_get_current_pid_tgid();
    u64 ts = bpf_ktime_get_ns();
    start.update(&pid, &ts);
    return 0;
}

// 시스템 호출 종료시 지연시간 계산 및 히스토그램 업데이트
int syscall_exit(struct pt_regs *ctx, long ret) {
    u32 pid = bpf_get_current_pid_tgid();
    u64 *tsp = start.lookup(&pid);
    if (tsp != 0) {
        u64 delta = bpf_ktime_get_ns() - *tsp;
        dist.increment(bpf_log2l(delta / 1000));  // 마이크로초 단위
        start.delete(&pid);
    }
    return 0;
}
```

### 2. 메모리 누수 감지 시스템

```c
BPF_HASH(sizes, u64);           // 할당 크기 임시 저장
BPF_HASH(stack_traces, u32);    // 스택 추적 정보

// kmalloc 호출 추적 - 할당 크기 기록
int alloc_enter(struct pt_regs *ctx, size_t size) {
    u64 pid_tgid = bpf_get_current_pid_tgid();
    u32 stack_id = stack_traces.get_stackid(ctx, BPF_F_REUSE_STACKID);
    sizes.update(&pid_tgid, &size);
    return 0;
}

// kmalloc 반환시 할당 정보 출력
int alloc_exit(struct pt_regs *ctx) {
    u64 address = PT_REGS_RC(ctx);
    u64 pid_tgid = bpf_get_current_pid_tgid();
    
    if (address != 0) {
        u64 *size = sizes.lookup(&pid_tgid);
        if (size != 0) {
            bpf_trace_printk("ALLOC pid=%d addr=%llx size=%lld\n", 
                           pid_tgid >> 32, address, *size);
        }
    }
    
    sizes.delete(&pid_tgid);
    return 0;
}
```

### 3. 락 경합 모니터링

```c
BPF_HASH(lock_start, u64);    // 락별 대기 시작 시간
BPF_HASH(lock_stats, u64, u64); // 락별 경합 통계

// 스핀락 대기 시작
int lock_acquire_enter(struct pt_regs *ctx, void *lock) {
    u64 lock_addr = (u64)lock;
    u64 ts = bpf_ktime_get_ns();
    lock_start.update(&lock_addr, &ts);
    return 0;
}

// 스핀락 획득 완료 - 대기 시간 측정
int lock_acquire_exit(struct pt_regs *ctx, void *lock) {
    u64 lock_addr = (u64)lock;
    u64 *tsp = lock_start.lookup(&lock_addr);
    
    if (tsp != 0) {
        u64 delta = bpf_ktime_get_ns() - *tsp;
        
        // 1ms 이상 대기한 경우만 기록 (심각한 경합)
        if (delta > 1000000) {
            bpf_trace_printk("LOCK_CONTENTION addr=%llx time=%lld\n", 
                            lock_addr, delta);
        }
        
        lock_start.delete(&lock_addr);
    }
    return 0;
}
```

## 핵심 요점

### 1. 커널 레벨 실시간 관측

eBPF를 통해 사용자 공간의 오버헤드 없이 커널 이벤트를 실시간으로 추적합니다.

### 2. 효율적인 데이터 수집

히스토그램과 해시 테이블을 활용해 대량의 이벤트 데이터를 효율적으로 집계합니다.

### 3. 선택적 상세 추적

임계값 기반 필터링으로 성능에 영향을 주는 중요한 이벤트만 상세히 추적합니다.

---

**이전**: [06a. 종합 커널 진단 시스템](04-42-comprehensive-diagnostic-system.md)  
**다음**: [06c. 실무 적용 사례 및 추가 리소스](04-51-practical-cases-resources.md)에서 실제 프로덕션 환경에서의 디버깅 사례를 학습합니다.
