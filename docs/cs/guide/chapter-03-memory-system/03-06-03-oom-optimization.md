---
tags:
  - advanced
  - hands-on
  - kernel-programming
  - medium-read
  - memory-optimization
  - oom-killer
  - page-fault-optimization
  - system-tuning
  - 시스템프로그래밍
difficulty: ADVANCED
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 3.6.3: OOM 최적화

## OOM Score 계산: 사형수 선정 기준

메모리가 완전히 바닥나면, Linux는 극단적인 선택을 합니다: 프로세스를 죽입니다. 이것이 **OOM(Out Of Memory) Killer**입니다.

"누구를 죽일까?"를 결정하는 잔인한 계산식:

```c
// OOM Score: 프로세스의 "죽을 확률" 계산
int calculate_oom_score(struct task_struct *task) {
    int points = 0;

    printf("[OOM Score 계산] %s (PID: %d)", task->comm, task->pid);

    // 1. 메모리 사용량 (죄목 1: 욕심)
    points = task->mm->total_vm;
    printf("  메모리 사용: %d MB (점수: %d)", points / 256, points);

    // 2. 조정 요소들

    // RSS (실제 사용 메모리)
    points += get_mm_rss(task->mm) * 10;

    // 스왑 사용량
    points += get_mm_counter(task->mm, MM_SWAPENTS) * 5;

    // 실행 시간 (노인 공경)
    int runtime = (jiffies - task->start_time) / HZ;
    if (runtime > 3600) {  // 1시간 이상
        points /= 2;
        printf("  오래된 프로세스 보호 (-%d점)", points);
    }

    // Root 프로세스 (VIP 대우)
    if (task->uid == 0) {
        points /= 4;
        printf("  Root 프로세스 특별 보호 (점수 1/4로)");
    }

    // oom_score_adj (면죄부 또는 사형 선고)
    int adj = task->signal->oom_score_adj;
    if (adj == -1000) {
        printf("  💀 면제! (oom_score_adj = -1000)");
        return 0;  // 절대 죽지 않음
    } else if (adj == 1000) {
        printf("  ☠️  첫 번째 희생자 지정됨! (oom_score_adj = 1000)");
    }
    points += points * adj / 1000;

    return points;
}

// OOM Killer 실행: 생사를 가르는 순간
void oom_killer_select_victim() {
    printf("\n🔪 OOM Killer 가동!");
    printf("메모리가 없습니다. 누군가는 죽어야 합니다...\n\n");
    struct task_struct *victim = NULL;
    int max_score = 0;

    // 모든 프로세스 검사
    for_each_process(task) {
        if (task->flags & PF_KTHREAD) {
            continue;  // 커널 스레드 제외
        }

        int score = calculate_oom_score(task);
        if (score > max_score) {
            max_score = score;
            victim = task;
        }
    }

    if (victim) {
        printf("\n⚰️  선택된 희생자:");
        printf("  프로세스: %s (PID: %d)", victim->comm, victim->pid);
        printf("  죽음의 점수: %d", max_score);
        printf("  마지막 메시지: \"Killed\"");

        send_sig(SIGKILL, victim, 1);  // 즉시 처형

        printf("\n시스템이 살아났습니다... %s의 희생으로.", victim->comm);
    }
}
```

## OOM 방지 전략: 죽음을 피하는 방법

OOM Killer의 표적이 되지 않으려면:

```c
// OOM 방지 설정
void configure_oom_prevention() {
    // 1. 프로세스 보호
    int oom_score_adj = -1000;  // OOM Kill 면제
    FILE *f = fopen("/proc/self/oom_score_adj", "w");
    fprintf(f, "%d", oom_score_adj);
    fclose(f);

    // 2. 메모리 제한 설정 (cgroup v2)
    FILE *mem_max = fopen("/sys/fs/cgroup/memory.max", "w");
    fprintf(mem_max, "%lu", 1ULL << 30);  // 1GB 제한
    fclose(mem_max);

    // 3. 메모리 예약
    FILE *mem_min = fopen("/sys/fs/cgroup/memory.min", "w");
    fprintf(mem_min, "%lu", 256ULL << 20);  // 256MB 보장
    fclose(mem_min);
}

// 메모리 사용량 모니터링
void monitor_memory_usage() {
    struct rusage usage;

    while (1) {
        getrusage(RUSAGE_SELF, &usage);

        long rss_mb = usage.ru_maxrss / 1024;  // Linux는 KB 단위
        long limit_mb = get_memory_limit() / 1024 / 1024;

        double usage_percent = (double)rss_mb / limit_mb * 100;

        if (usage_percent > 90) {
            printf("WARNING: Memory usage critical: %.1f%%",
                   usage_percent);
            // 메모리 정리 시도
            malloc_trim(0);

            // 캐시 삭제
            clear_internal_caches();
        }

        sleep(10);
    }
}
```

## 실전: 페이지 폴트 최적화 노하우

### 페이지 폴트 프로파일링: 문제 찾기

```bash
# perf를 이용한 페이지 폴트 분석
$ perf record -e page-faults,major-faults ./myapp
$ perf report

# 실시간 페이지 폴트 모니터링
$ perf stat -e page-faults,major-faults -I 1000

# 특정 함수의 페이지 폴트
$ perf probe -a 'do_page_fault'
$ perf record -e probe:do_page_fault ./myapp
```

### 최적화 기법: 페이지 폴트와의 전쟁

제가 게임 서버를 최적화하면서 배운 기법들:

```c
// 페이지 폴트 최소화 전략
void optimize_page_faults() {
    // 1. 프리폴팅
    void *data = mmap(NULL, size, PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS | MAP_POPULATE,
                     -1, 0);

    // 2. Huge Pages 사용
    void *huge = mmap(NULL, size, PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB,
                     -1, 0);

    // 3. 메모리 잠금
    mlock(critical_data, critical_size);

    // 4. 순차 접근 힌트
    madvise(data, size, MADV_SEQUENTIAL);

    // 5. 프리페치
    for (size_t i = 0; i < size; i += 4096) {
        __builtin_prefetch(&data[i + 4096], 0, 1);
        process_page(&data[i]);
    }
}

// 페이지 폴트 비용 측정
void measure_fault_cost() {
    struct timespec start, end;
    size_t size = 100 * 1024 * 1024;

    // Cold start (페이지 폴트 포함)
    void *mem1 = malloc(size);
    clock_gettime(CLOCK_MONOTONIC, &start);
    memset(mem1, 0, size);
    clock_gettime(CLOCK_MONOTONIC, &end);

    double cold_time = (end.tv_sec - start.tv_sec) * 1000.0 +
                      (end.tv_nsec - start.tv_nsec) / 1000000.0;

    // Warm start (페이지 폴트 없음)
    clock_gettime(CLOCK_MONOTONIC, &start);
    memset(mem1, 1, size);
    clock_gettime(CLOCK_MONOTONIC, &end);

    double warm_time = (end.tv_sec - start.tv_sec) * 1000.0 +
                      (end.tv_nsec - start.tv_nsec) / 1000000.0;

    printf("Cold start: %.2f ms", cold_time);
    printf("Warm start: %.2f ms", warm_time);
    printf("Page fault overhead: %.2f ms", cold_time - warm_time);

    free(mem1);
}
```

## 핵심 요점 정리

긴 여정이었습니다! 이제 여러분은 "Segmentation Fault"를 보고도 당황하지 않을 겁니다.

### 페이지 폴트란?

- **한 줄 요약**: CPU가 "이 메모리 어디 있어요?"라고 묻는 것
- **좋은 폴트**: Minor Fault - 빠른 처리 (0.001ms)
- **나쁜 폴트**: Major Fault - 디스크 I/O (5ms)
- **치명적 폴트**: Segmentation Fault - 게임 오버

### 왜 배워야 하는가?

1. **malloc()의 거짓말**: 1GB 할당 ≠ 1GB 사용
2. **fork()의 마법**: 100GB 복사가 1초 (CoW)
3. **스왑 지옥**: 왜 컴퓨터가 느려지는지 이해
4. **OOM Killer**: Chrome이 갑자기 죽는 이유

### 꺼 기억하세요

- **Minor Fault**: 초당 수천 번 발생해도 정상 (빠름)
- **Major Fault**: 초당 100번만 넘어도 지옥 (느림)
- **CoW**: Redis가 100GB를 1초에 백업하는 비밀
- **스왑 시작 = RAM 추가 시기**: 늘기 전에!
- **OOM Score -1000**: 불사신 프로세스 만들기

## 체크리스트: 페이지 폴트 마스터 되기

### 기본 이해

- [ ] Minor Fault와 Major Fault의 차이를 설명할 수 있다
- [ ] Copy-on-Write 메커니즘을 이해한다
- [ ] Demand Paging의 원리를 알고 있다
- [ ] 스왑이 시스템 성능에 미치는 영향을 이해한다

### 실전 능력

- [ ] perf로 페이지 폴트를 다사리어라할 수 있다
- [ ] mmap 옵션들을 효과적으로 사용할 수 있다
- [ ] OOM Killer로부터 프로세스를 보호할 수 있다
- [ ] 스왑 설정을 최적화할 수 있다

### 최적화 전문가

- [ ] HugePages를 효과적으로 활용한다
- [ ] NUMA 토폴로지를 고려한 메모리 배치를 한다
- [ ] 메모리 압축 기술(zRAM)을 적용한다
- [ ] 사용자 공간 페이지 폴트 핸들러를 구현한다

---

**이전**: [스왑과 메모리 압박](./03-03-02-swap-memory-pressure.md)에서 시스템이 느려지는 이유를 학습했습니다.
**다음**: [메모리 압축과 중복 제거](./03-04-01-compression-deduplication.md)에서 8GB RAM으로 16GB처럼 쓰는 방법을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-03-memory-system)

- [Chapter 3-1: 주소 변환은 어떻게 동작하는가](./03-02-01-address-translation.md)
- [Chapter 3-2: TLB와 캐싱은 어떻게 동작하는가](./03-02-02-tlb-caching.md)
- [Chapter 3-3: 페이지 폴트와 메모리 관리 개요](./03-02-03-page-fault.md)
- [Chapter 3-2-4: 페이지 폴트 종류와 처리 메커니즘](./03-02-04-page-fault-handling.md)
- [Chapter 3-2-5: Copy-on-Write (CoW) - fork()가 빠른 이유](./03-02-05-copy-on-write.md)

### 🏷️ 관련 키워드

`oom-killer`, `memory-optimization`, `kernel-programming`, `system-tuning`, `page-fault-optimization`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
