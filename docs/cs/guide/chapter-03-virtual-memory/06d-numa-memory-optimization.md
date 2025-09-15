---
tags:
  - VirtualMemory
  - NUMA
  - Performance
  - MemoryBinding
---

# 3-6D: NUMA 환경 최적화

## NUMA의 중요성 이해

NUMA(Non-Uniform Memory Access) 시스템에서는 메모리 접근 지연시간이 CPU와 메모리의 위치 관계에 따라 2배 이상 차이날 수 있습니다. 올바른 NUMA 바인딩으로 50-200%의 성능 향상을 달성할 수 있습니다.

## NUMA 토폴로지 분석

### 시스템 구성 확인

```bash
#!/bin/bash
# numa_topology_analysis.sh - NUMA 토폴로지 분석

echo "=== NUMA 시스템 분석 ==="

# 1. 기본 NUMA 정보
echo "1. NUMA 노드 구성:"
numactl --hardware

echo -e "\n2. CPU별 NUMA 노드 매핑:"
lscpu | grep -E "NUMA|CPU\(s\)"

# 3. 메모리 분포
echo -e "\n3. 노드별 메모리 분포:"
for node in $(ls /sys/devices/system/node/ | grep node); do
    if [ -f "/sys/devices/system/node/$node/meminfo" ]; then
        echo "=== $node ==="
        cat /sys/devices/system/node/$node/meminfo | head -5
    fi
done

# 4. 노드간 거리 매트릭스
echo -e "\n4. 노드간 접근 지연시간:"
cat /sys/devices/system/node/node*/distance

# 5. 현재 프로세스의 NUMA 바인딩 상태  
echo -e "\n5. 현재 NUMA 정책:"
numactl --show

# 6. 실시간 NUMA 사용량
echo -e "\n6. 실시간 NUMA 메모리 사용량:"
numastat

# 7. NUMA 밸런싱 설정 확인
echo -e "\n7. NUMA 밸런싱 설정:"
cat /proc/sys/kernel/numa_balancing
cat /proc/sys/kernel/numa_balancing_migrate_deferred
```

### NUMA 성능 측정

```bash
# numa_performance_test.sh - NUMA 성능 차이 측정
measure_numa_latency() {
    echo "=== NUMA 노드별 메모리 접근 지연시간 측정 ==="
    
    local nodes=$(numactl --hardware | grep "available:" | cut -d: -f2 | cut -d' ' -f2)
    
    for node in $(seq 0 $((nodes-1))); do
        echo "노드 $node 테스트 중..."
        
        # 해당 노드에서 메모리 할당 후 접근 시간 측정
        numactl --membind=$node --cpunodebind=$node \
            /usr/bin/time -f "노드 $node: 실시간 %e초, CPU시간 %U초" \
            dd if=/dev/zero of=/dev/null bs=1M count=1000 2>&1
    done
}

measure_cross_numa_penalty() {
    echo -e "\n=== 크로스 노드 접근 성능 손실 측정 ==="
    
    # 노드 0 CPU에서 노드 1 메모리 접근
    echo "크로스 노드 접근 (CPU:0 → MEM:1):"
    numactl --cpunodebind=0 --membind=1 \
        /usr/bin/time -f "시간: %e초" \
        dd if=/dev/zero of=/dev/null bs=1M count=500 2>&1
    
    # 로컬 노드 접근 비교
    echo "로컬 노드 접근 (CPU:0 → MEM:0):"
    numactl --cpunodebind=0 --membind=0 \
        /usr/bin/time -f "시간: %e초" \
        dd if=/dev/zero of=/dev/null bs=1M count=500 2>&1
}

# 실행
measure_numa_latency
measure_cross_numa_penalty
```

## NUMA 바인딩 최적화

### C 프로그램에서 NUMA 제어

```c
// numa_optimization.c - NUMA 최적화 프로그래밍
#include <stdio.h>
#include <stdlib.h>
#include <numa.h>
#include <numaif.h>
#include <sys/time.h>
#include <string.h>
#include <unistd.h>

double get_time() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

void test_local_memory_access() {
    printf("=== NUMA 로컬 메모리 접근 테스트 ===\n");

    if (numa_available() < 0) {
        printf("NUMA not available\n");
        return;
    }

    int num_nodes = numa_max_node() + 1;
    printf("NUMA 노드 수: %d\n", num_nodes);

    for (int node = 0; node < num_nodes; node++) {
        printf("\n--- NUMA 노드 %d 테스트 ---\n", node);

        // 특정 NUMA 노드로 프로세스 바인딩
        struct bitmask *node_mask = numa_allocate_nodemask();
        numa_bitmask_setbit(node_mask, node);
        numa_bind(node_mask);

        // 해당 노드에서 메모리 할당
        size_t size = 128 * 1024 * 1024;  // 128MB
        void *memory = numa_alloc_onnode(size, node);
        if (!memory) {
            printf("메모리 할당 실패 (노드 %d)\n", node);
            continue;
        }

        double start = get_time();

        // 메모리 접근 테스트
        char *buffer = (char*)memory;
        for (size_t i = 0; i < size; i += 4096) {
            buffer[i] = i % 256;
            volatile char c = buffer[i];  // 읽기
        }

        double end = get_time();

        printf("노드 %d 접근 성능: %.3f초 (%.1f MB/s)\n",
               node, end - start,
               (size / 1024.0 / 1024.0) / (end - start));

        numa_free(memory, size);
        numa_bitmask_free(node_mask);
    }

    // 바인딩 해제
    numa_bind(numa_all_nodes_ptr);
}

void test_cross_node_access() {
    printf("\n=== NUMA 크로스 노드 접근 테스트 ===\n");

    if (numa_max_node() < 1) {
        printf("멀티 NUMA 시스템이 아닙니다.\n");
        return;
    }

    // 노드 0에서 실행, 노드 1의 메모리에 접근
    struct bitmask *cpu_mask = numa_allocate_cpumask();
    struct bitmask *mem_mask = numa_allocate_nodemask();

    // CPU는 노드 0에 바인딩
    numa_bitmask_setbit(cpu_mask, 0);
    numa_sched_setaffinity(0, cpu_mask);

    // 메모리는 노드 1에서 할당
    size_t size = 128 * 1024 * 1024;
    void *remote_memory = numa_alloc_onnode(size, 1);

    if (remote_memory) {
        double start = get_time();

        char *buffer = (char*)remote_memory;
        for (size_t i = 0; i < size; i += 4096) {
            buffer[i] = i % 256;
            volatile char c = buffer[i];
        }

        double end = get_time();

        printf("크로스 노드 접근 성능: %.3f초 (%.1f MB/s)\n",
               end - start,
               (size / 1024.0 / 1024.0) / (end - start));

        numa_free(remote_memory, size);
    }

    numa_bitmask_free(cpu_mask);
    numa_bitmask_free(mem_mask);
}

void optimize_numa_allocation() {
    printf("\n=== NUMA 최적화 할당 전략 ===\n");

    // 현재 실행 중인 CPU의 NUMA 노드 확인
    int current_node = numa_node_of_cpu(sched_getcpu());
    printf("현재 CPU의 NUMA 노드: %d\n", current_node);

    // 로컬 노드에서 메모리 할당
    size_t size = 64 * 1024 * 1024;
    void *local_memory = numa_alloc_onnode(size, current_node);

    // 첫 번째 터치 정책 적용 (first-touch policy)
    char *buffer = (char*)local_memory;
    memset(buffer, 0, size);  // 로컬 노드에서 페이지 할당 보장

    printf("로컬 노드 메모리 할당 및 초기화 완료\n");

    // 메모리 정책 확인
    int policy;
    struct bitmask *node_mask = numa_allocate_nodemask();

    if (get_mempolicy(&policy, node_mask->maskp, node_mask->size,
                     buffer, MPOL_F_ADDR) == 0) {
        printf("메모리 정책: ");
        switch (policy) {
            case MPOL_DEFAULT: printf("DEFAULT\n"); break;
            case MPOL_BIND: printf("BIND\n"); break;
            case MPOL_INTERLEAVE: printf("INTERLEAVE\n"); break;
            case MPOL_PREFERRED: printf("PREFERRED\n"); break;
            default: printf("UNKNOWN\n"); break;
        }
    }

    numa_free(local_memory, size);
    numa_bitmask_free(node_mask);
}

int main() {
    test_local_memory_access();
    test_cross_node_access();
    optimize_numa_allocation();

    return 0;
}
```

### 고급 NUMA 메모리 할당자

```c
// advanced_numa_allocator.c - 고급 NUMA 메모리 할당자
typedef struct numa_memory_pool {
    void **blocks;
    size_t *block_sizes;
    int *node_assignments;
    size_t block_count;
    size_t total_size;
    pthread_mutex_t lock;
} numa_memory_pool_t;

typedef struct {
    int node;
    size_t available_memory;
    double access_latency;
    int cpu_count;
    double load_factor;
} numa_node_info_t;

numa_memory_pool_t* create_numa_memory_pool() {
    numa_memory_pool_t *pool = malloc(sizeof(numa_memory_pool_t));
    pool->blocks = malloc(sizeof(void*) * 1000);
    pool->block_sizes = malloc(sizeof(size_t) * 1000);
    pool->node_assignments = malloc(sizeof(int) * 1000);
    pool->block_count = 0;
    pool->total_size = 0;
    pthread_mutex_init(&pool->lock, NULL);
    
    return pool;
}

// NUMA 노드 정보 수집
numa_node_info_t* collect_numa_node_info(int *node_count) {
    *node_count = numa_max_node() + 1;
    numa_node_info_t *nodes = malloc(sizeof(numa_node_info_t) * (*node_count));
    
    for (int i = 0; i < *node_count; i++) {
        nodes[i].node = i;
        
        // 각 노드의 가용 메모리 확인
        long long freemem;
        if (numa_node_size64(i, &freemem) >= 0) {
            nodes[i].available_memory = freemem;
        }
        
        // CPU 개수 확인
        struct bitmask *cpus = numa_allocate_cpumask();
        numa_node_to_cpus(i, cpus);
        nodes[i].cpu_count = numa_bitmask_weight(cpus);
        numa_bitmask_free(cpus);
        
        // 부하 지수 계산 (단순화)
        nodes[i].load_factor = 1.0;  // 실제로는 현재 사용률 기반
        
        printf("NUMA 노드 %d: 메모리 %.1f MB, CPU %d개\n", 
               i, nodes[i].available_memory / 1024.0 / 1024.0, 
               nodes[i].cpu_count);
    }
    
    return nodes;
}

// 최적 노드 선택 알고리즘
int select_optimal_numa_node(numa_node_info_t *nodes, int node_count, 
                             size_t required_size, int prefer_local) {
    int current_node = numa_node_of_cpu(sched_getcpu());
    
    // 로컬 노드 우선 고려
    if (prefer_local && nodes[current_node].available_memory >= required_size) {
        return current_node;
    }
    
    // 가용 메모리와 부하를 고려한 최적 노드 선택
    int best_node = -1;
    double best_score = -1;
    
    for (int i = 0; i < node_count; i++) {
        if (nodes[i].available_memory < required_size) continue;
        
        // 점수 계산: 가용 메모리 높고 부하 낮을수록 좋음
        double score = nodes[i].available_memory / nodes[i].load_factor;
        
        // 로컬 노드에 보너스
        if (i == current_node) {
            score *= 1.5;
        }
        
        if (score > best_score) {
            best_score = score;
            best_node = i;
        }
    }
    
    return best_node;
}

void* smart_numa_alloc(numa_memory_pool_t *pool, size_t size, int flags) {
    pthread_mutex_lock(&pool->lock);
    
    int node_count;
    numa_node_info_t *nodes = collect_numa_node_info(&node_count);
    
    int optimal_node = select_optimal_numa_node(nodes, node_count, size, 
                                               flags & NUMA_PREFER_LOCAL);
    
    if (optimal_node == -1) {
        pthread_mutex_unlock(&pool->lock);
        free(nodes);
        return NULL;
    }
    
    void *memory = numa_alloc_onnode(size, optimal_node);
    if (memory) {
        // 메모리 풀에 등록
        pool->blocks[pool->block_count] = memory;
        pool->block_sizes[pool->block_count] = size;
        pool->node_assignments[pool->block_count] = optimal_node;
        pool->block_count++;
        pool->total_size += size;
        
        // first-touch 정책으로 페이지 할당 보장
        if (flags & NUMA_ZERO_MEMORY) {
            memset(memory, 0, size);
        }
        
        printf("메모리 할당 성공: %.1f MB (노드 %d)\n", 
               size / 1024.0 / 1024.0, optimal_node);
    }
    
    free(nodes);
    pthread_mutex_unlock(&pool->lock);
    return memory;
}

// 메모리 이주 (migration)
int migrate_memory_to_node(void *memory, size_t size, int target_node) {
    struct bitmask *target_mask = numa_allocate_nodemask();
    numa_bitmask_setbit(target_mask, target_node);
    
    // 메모리 이주 요청
    int result = mbind(memory, size, MPOL_BIND, 
                      target_mask->maskp, target_mask->size, 
                      MPOL_MF_MOVE | MPOL_MF_STRICT);
    
    if (result == 0) {
        printf("메모리 이주 성공: %.1f MB → 노드 %d\n", 
               size / 1024.0 / 1024.0, target_node);
    } else {
        perror("메모리 이주 실패");
    }
    
    numa_bitmask_free(target_mask);
    return result;
}
```

## 실무 NUMA 최적화 패턴

### 데이터베이스 버퍼 풀 최적화

```c
// database_numa_optimization.c - 데이터베이스 NUMA 최적화
typedef struct db_buffer_pool {
    void *buffer_memory;
    size_t buffer_size;
    int numa_node;
    
    // 접근 통계
    atomic_long access_count;
    atomic_long local_access;
    atomic_long remote_access;
    
    pthread_mutex_t lock;
} db_buffer_pool_t;

db_buffer_pool_t* create_db_buffer_pool(size_t size) {
    db_buffer_pool_t *pool = malloc(sizeof(db_buffer_pool_t));
    
    // 현재 CPU의 NUMA 노드에서 할당
    int current_node = numa_node_of_cpu(sched_getcpu());
    pool->numa_node = current_node;
    pool->buffer_size = size;
    
    // NUMA 로컬 메모리 할당
    pool->buffer_memory = numa_alloc_onnode(size, current_node);
    if (!pool->buffer_memory) {
        free(pool);
        return NULL;
    }
    
    // 메모리 초기화 (first-touch)
    memset(pool->buffer_memory, 0, size);
    
    // Huge pages 적용
    madvise(pool->buffer_memory, size, MADV_HUGEPAGE);
    
    // 통계 초기화
    atomic_init(&pool->access_count, 0);
    atomic_init(&pool->local_access, 0);  
    atomic_init(&pool->remote_access, 0);
    
    pthread_mutex_init(&pool->lock, NULL);
    
    printf("DB 버퍼 풀 생성: %.1f MB (NUMA 노드: %d)\n", 
           size / 1024.0 / 1024.0, current_node);
    
    return pool;
}

void access_buffer_page(db_buffer_pool_t *pool, size_t page_offset) {
    atomic_fetch_add(&pool->access_count, 1);
    
    // 현재 CPU의 NUMA 노드 확인
    int current_node = numa_node_of_cpu(sched_getcpu());
    
    if (current_node == pool->numa_node) {
        atomic_fetch_add(&pool->local_access, 1);
    } else {
        atomic_fetch_add(&pool->remote_access, 1);
    }
    
    // 실제 메모리 접근
    volatile char *page = (char*)pool->buffer_memory + page_offset;
    volatile char data = *page;
    *page = data;  // 쓰기도 수행
}

// 성능 통계 및 재배치 결정
void analyze_buffer_pool_performance(db_buffer_pool_t *pool) {
    long total = atomic_load(&pool->access_count);
    long local = atomic_load(&pool->local_access);
    long remote = atomic_load(&pool->remote_access);
    
    double local_ratio = (double)local / total * 100;
    
    printf("\n=== DB 버퍼 풀 성능 분석 ===\n");
    printf("총 접근: %ld회\n", total);
    printf("로컬 접근: %ld회 (%.1f%%)\n", local, local_ratio);
    printf("원격 접근: %ld회 (%.1f%%)\n", remote, 100 - local_ratio);
    
    // 원격 접근이 많으면 메모리 재배치 고려
    if (local_ratio < 50.0 && total > 10000) {
        printf("경고: 원격 접근이 과도합니다. 메모리 재배치를 고려하세요.\n");
        suggest_memory_reallocation(pool);
    }
}

void suggest_memory_reallocation(db_buffer_pool_t *pool) {
    // 가장 많이 접근하는 CPU 노드 찾기
    int node_access[8] = {0};  // 최대 8노드 지원
    
    // 여러 워커 스레드의 접근 패턴 분석
    // (실제로는 스레드별 통계 수집 필요)
    
    // 최적 노드 제안
    int best_node = 0;
    int max_access = 0;
    
    for (int i = 0; i <= numa_max_node(); i++) {
        if (node_access[i] > max_access) {
            max_access = node_access[i];
            best_node = i;
        }
    }
    
    if (best_node != pool->numa_node) {
        printf("제안: 버퍼 풀을 노드 %d → 노드 %d로 이주\n", 
               pool->numa_node, best_node);
    }
}
```

### 멀티스레드 워크로드 NUMA 최적화

```c
// multithread_numa_optimization.c - 멀티스레드 NUMA 최적화
typedef struct worker_thread {
    int thread_id;
    int numa_node;
    void *local_memory;
    size_t memory_size;
    
    // 작업 통계
    atomic_long tasks_processed;
    atomic_long cache_hits;
    atomic_long cache_misses;
    
    pthread_t thread;
} worker_thread_t;

typedef struct numa_workload_manager {
    worker_thread_t *workers;
    int worker_count;
    int numa_nodes;
    
    // 작업 큐 (노드별)
    void **task_queues;
    pthread_mutex_t *queue_locks;
    
    // 로드 밸런서
    atomic_int *node_loads;
} numa_workload_manager_t;

numa_workload_manager_t* create_numa_workload_manager() {
    numa_workload_manager_t *mgr = malloc(sizeof(numa_workload_manager_t));
    
    mgr->numa_nodes = numa_max_node() + 1;
    mgr->worker_count = mgr->numa_nodes * 2;  // 노드당 2개 워커
    
    // 워커 스레드 초기화
    mgr->workers = malloc(sizeof(worker_thread_t) * mgr->worker_count);
    
    // 작업 큐 초기화 (노드별)
    mgr->task_queues = malloc(sizeof(void*) * mgr->numa_nodes);
    mgr->queue_locks = malloc(sizeof(pthread_mutex_t) * mgr->numa_nodes);
    mgr->node_loads = malloc(sizeof(atomic_int) * mgr->numa_nodes);
    
    for (int i = 0; i < mgr->numa_nodes; i++) {
        mgr->task_queues[i] = create_task_queue();
        pthread_mutex_init(&mgr->queue_locks[i], NULL);
        atomic_init(&mgr->node_loads[i], 0);
    }
    
    return mgr;
}

void* worker_thread_func(void *arg) {
    worker_thread_t *worker = (worker_thread_t*)arg;
    
    // 워커를 특정 NUMA 노드에 바인딩
    struct bitmask *cpu_mask = numa_allocate_cpumask();
    numa_node_to_cpus(worker->numa_node, cpu_mask);
    numa_sched_setaffinity(0, cpu_mask);
    numa_bitmask_free(cpu_mask);
    
    // 로컬 메모리 할당
    worker->memory_size = 64 * 1024 * 1024;  // 64MB
    worker->local_memory = numa_alloc_onnode(worker->memory_size, worker->numa_node);
    
    if (!worker->local_memory) {
        printf("워커 %d: 로컬 메모리 할당 실패\n", worker->thread_id);
        return NULL;
    }
    
    // 메모리 초기화 (first-touch)
    memset(worker->local_memory, 0, worker->memory_size);
    
    printf("워커 %d 시작: NUMA 노드 %d (메모리: %.1f MB)\n", 
           worker->thread_id, worker->numa_node,
           worker->memory_size / 1024.0 / 1024.0);
    
    // 작업 처리 루프
    while (1) {
        // 로컬 노드의 작업 큐에서 작업 가져오기
        void *task = get_task_from_local_queue(worker->numa_node);
        
        if (task) {
            process_task(worker, task);
            atomic_fetch_add(&worker->tasks_processed, 1);
        } else {
            // 로컬 작업이 없으면 다른 노드에서 작업 훔치기
            steal_task_from_other_nodes(worker);
        }
        
        usleep(1000);  // 1ms 대기
    }
    
    numa_free(worker->local_memory, worker->memory_size);
    return NULL;
}

void start_numa_optimized_workers(numa_workload_manager_t *mgr) {
    for (int i = 0; i < mgr->worker_count; i++) {
        worker_thread_t *worker = &mgr->workers[i];
        worker->thread_id = i;
        worker->numa_node = i % mgr->numa_nodes;  // 라운드 로빈 배치
        
        atomic_init(&worker->tasks_processed, 0);
        atomic_init(&worker->cache_hits, 0);
        atomic_init(&worker->cache_misses, 0);
        
        pthread_create(&worker->thread, NULL, worker_thread_func, worker);
    }
}

// NUMA 인식 로드 밸런서
int select_best_numa_node_for_task(numa_workload_manager_t *mgr, void *task) {
    int min_load = INT_MAX;
    int best_node = 0;
    
    // 가장 부하가 낮은 노드 선택
    for (int i = 0; i < mgr->numa_nodes; i++) {
        int current_load = atomic_load(&mgr->node_loads[i]);
        if (current_load < min_load) {
            min_load = current_load;
            best_node = i;
        }
    }
    
    atomic_fetch_add(&mgr->node_loads[best_node], 1);
    return best_node;
}

// 성능 모니터링 및 보고
void monitor_numa_performance(numa_workload_manager_t *mgr) {
    while (1) {
        sleep(10);  // 10초마다 모니터링
        
        printf("\n=== NUMA 성능 모니터링 ===\n");
        printf("%-6s %-12s %-10s %-10s %-15s\n", 
               "워커", "NUMA노드", "처리작업", "캐시히트", "히트율(%)");
        printf("-----------------------------------------------------\n");
        
        for (int i = 0; i < mgr->worker_count; i++) {
            worker_thread_t *worker = &mgr->workers[i];
            
            long processed = atomic_load(&worker->tasks_processed);
            long hits = atomic_load(&worker->cache_hits);
            long misses = atomic_load(&worker->cache_misses);
            
            double hit_rate = (hits + misses > 0) ? 
                             (double)hits / (hits + misses) * 100 : 0;
            
            printf("%-6d %-12d %-10ld %-10ld %-15.1f\n",
                   worker->thread_id, worker->numa_node, 
                   processed, hits, hit_rate);
        }
        
        // 노드별 부하
        printf("\n노드별 작업 부하:\n");
        for (int i = 0; i < mgr->numa_nodes; i++) {
            printf("노드 %d: %d개 작업\n", i, atomic_load(&mgr->node_loads[i]));
        }
    }
}
```

## NUMA 모니터링 도구

### 실시간 NUMA 사용량 모니터링

```bash
#!/bin/bash
# numa_realtime_monitor.sh - 실시간 NUMA 모니터링

monitor_numa_realtime() {
    while true; do
        clear
        echo "=== NUMA 실시간 모니터링 - $(date) ==="
        echo
        
        # 1. 노드별 메모리 사용량
        echo "1. 노드별 메모리 사용량:"
        numastat -c
        
        echo -e "\n2. 프로세스별 NUMA 분포:"
        # 상위 메모리 사용 프로세스의 NUMA 바인딩
        ps aux --sort=-%mem | head -10 | while read line; do
            pid=$(echo $line | awk '{print $2}')
            if [[ $pid =~ ^[0-9]+$ ]]; then
                echo -n "PID $pid: "
                cat /proc/$pid/numa_maps 2>/dev/null | \
                    grep -E "N[0-9]=" | head -1 | \
                    sed 's/.*\(N[0-9]=\)/\1/' || echo "정보없음"
            fi
        done
        
        echo -e "\n3. NUMA 히트/미스 통계:"
        grep -E "numa_" /proc/vmstat | head -5
        
        echo -e "\n4. 노드간 이주 통계:"
        grep -E "pgmigrate_" /proc/vmstat
        
        sleep 5
    done
}

analyze_numa_efficiency() {
    echo "=== NUMA 효율성 분석 ==="
    
    # 1. 크로스 노드 접근 비율
    echo "1. 크로스 노드 메모리 접근 분석:"
    
    local total_access=$(grep "numa_hit" /proc/vmstat | awk '{print $2}')
    local foreign_access=$(grep "numa_foreign" /proc/vmstat | awk '{print $2}')
    
    if [ $total_access -gt 0 ]; then
        local efficiency=$(echo "scale=2; (1 - $foreign_access / $total_access) * 100" | bc)
        echo "NUMA 효율성: ${efficiency}%"
        
        if (( $(echo "$efficiency < 80" | bc -l) )); then
            echo "경고: NUMA 효율성이 낮습니다. 바인딩 최적화가 필요합니다."
        fi
    fi
    
    # 2. 메모리 지역성 분석
    echo -e "\n2. 메모리 지역성 점수:"
    for node in $(seq 0 $(($(numactl --hardware | grep available | cut -d: -f2 | cut -d' ' -f2) - 1))); do
        local node_hit=$(numastat -p $$ | grep "Node $node" | awk '{print $2}')
        local node_total=$(numastat -p $$ | grep "Node $node" | awk '{sum=0; for(i=2;i<=NF;i++) sum+=$i; print sum}')
        
        if [ "$node_total" -gt 0 ]; then
            local locality=$(echo "scale=2; $node_hit / $node_total * 100" | bc)
            echo "노드 $node 지역성: ${locality}%"
        fi
    done
}

# 사용법에 따른 실행
case "$1" in
    "monitor")
        monitor_numa_realtime
        ;;
    "analyze")
        analyze_numa_efficiency
        ;;
    *)
        echo "사용법: $0 [monitor|analyze]"
        echo "  monitor: 실시간 NUMA 모니터링"
        echo "  analyze: NUMA 효율성 분석"
        ;;
esac
```

## 핵심 요점

### NUMA의 실질적 영향

- **로컬 vs 원격 접근**: 지연시간 2-3배 차이
- **대용량 워크로드**: 올바른 바인딩으로 50-200% 성능 향상
- **멀티스레드 환경**: 스레드와 메모리의 친화성이 성능 결정적 영향

### 최적화 전략

- **First-touch 정책**: 메모리 초기화를 올바른 노드에서 수행
- **동적 마이그레이션**: 접근 패턴 변화에 따른 메모리 이주
- **워크로드 인식 스케줄링**: 작업의 특성에 맞는 노드 배치

### 실무 적용 가이드라인

- **데이터베이스**: 버퍼 풀을 주요 접근 CPU 노드에 배치
- **웹 서버**: 연결당 워커 스레드의 NUMA 바인딩
- **과학 계산**: 대용량 배열과 처리 스레드의 공동 배치

---

**이전**: [Huge Pages 최적화](06c-huge-pages-optimization.md)  
**다음**: [실무 최적화 패턴](06e-practical-optimization-patterns.md)에서 종합적인 메모리 매핑 최적화 패턴을 학습합니다.
