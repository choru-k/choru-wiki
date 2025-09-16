---
tags:
  - benchmarking
  - hands-on
  - intermediate
  - medium-read
  - memory_management
  - performance
  - swap
  - virtual_memory
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "3-4시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 3.7.6: 스왑 성능 분석

## 스왑이 시스템에 미치는 실질적 성능 영향

스왑은 시스템 안정성을 제공하지만, **디스크 I/O 기반의 메모리 확장**이라는 본질적 한계로 인해 성능 저하는 불가피합니다. 이 섹션에서는 스왑 사용이 시스템 성능에 미치는 구체적인 영향을 정량적으로 분석합니다.

## 스왑 vs 물리 메모리 성능 차이

### 현재 스왑 상태 확인

스왑 성능 분석의 첫 번째 단계는 시스템의 현재 상태를 정확히 파악하는 것입니다:

```bash
# 현재 스왑 상태 확인
$ cat /proc/swaps
Filename      Type        Size    Used    Priority
/swapfile     file        4194300 0       -2

$ free -h
              total        used        free      shared  buff/cache   available
Mem:           7.8G        2.1G        3.2G        145M        2.5G        5.4G
Swap:          4.0G          0B        4.0G

# 스왑 사용량 실시간 모니터링
$ watch -n 1 'cat /proc/meminfo | grep -E "(MemTotal|MemFree|MemAvailable|SwapTotal|SwapFree)"'
```

### 성능 저하의 근본 원인

| 저장매체 | 평균 액세스 시간 | 대역폭 | 상대적 속도 |
|----------|------------------|--------|-------------|
| **RAM** | 10-100ns | 25-100 GB/s | 기준 (1x) |
| **SSD** | 0.1-1ms | 200-7000 MB/s | **100-10,000x 느림** |
| **HDD** | 5-15ms | 50-200 MB/s | **50,000-150,000x 느림** |

## 스왑 성능 벤치마크

스왑 사용 시 성능 저하를 정량적으로 측정하는 종합 벤치마크 프로그램:

```c
// swap_performance_test.c - 스왑 사용이 성능에 미치는 실질적 영향을 측정
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <unistd.h>
#include <sys/mman.h>

#define GB (1024 * 1024 * 1024)

double get_time() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1000000.0;
}

// /proc/meminfo에서 시스템 메모리 및 스왑 현황 추출
void get_memory_stats(long *total_mem, long *free_mem, long *swap_used) {
    FILE *meminfo = fopen("/proc/meminfo", "r");
    char line[256];

    *total_mem = *free_mem = *swap_used = 0;

    while (fgets(line, sizeof(line), meminfo)) {
        // 각 라인을 파싱하여 필요한 메모리 정보 추출
        if (sscanf(line, "MemTotal: %ld kB", total_mem) == 1) {
            *total_mem *= 1024;  // kB를 bytes로 변환
        } else if (sscanf(line, "MemAvailable: %ld kB", free_mem) == 1) {
            *free_mem *= 1024;
        } else if (sscanf(line, "SwapTotal: %ld kB", swap_used) == 1) {
            long swap_total = *swap_used * 1024;
            long swap_free;
            // 다음 라인에서 SwapFree 읽기
            if (fgets(line, sizeof(line), meminfo) &&
                sscanf(line, "SwapFree: %ld kB", &swap_free) == 1) {
                *swap_used = swap_total - (swap_free * 1024);  // 사용중인 스왑 계산
            }
            break;
        }
    }

    fclose(meminfo);
}

// 메모리 부족 상황을 인위적으로 유발하여 스왑 사용 측정
void test_memory_allocation(size_t total_size) {
    printf("=== 메모리 할당 성능 테스트 ===\n");
    printf("목표 할당량: %.1f GB (스왑 사용 유발 목적)\n", (double)total_size / GB);

    // 초기 시스템 상태 확인
    long total_mem, free_mem, swap_used;
    get_memory_stats(&total_mem, &free_mem, &swap_used);

    printf("시스템 메모리: %.1f GB (사용 가능: %.1f GB)\n",
           (double)total_mem / GB, (double)free_mem / GB);
    printf("초기 스왑 사용량: %.1f MB\n", (double)swap_used / 1024 / 1024);

    // 청크 단위로 나누어 점진적 할당 (스왑 발생 지점 관찰)
    const size_t chunk_size = 256 * 1024 * 1024;  // 256MB 청크
    const int num_chunks = total_size / chunk_size;
    void **chunks = malloc(sizeof(void*) * num_chunks);

    printf("\n점진적 메모리 할당 시작 (%d개 청크, %dMB씩)...\n",
           num_chunks, (int)(chunk_size / 1024 / 1024));

    double start = get_time();

    for (int i = 0; i < num_chunks; i++) {
        // 메모리 할당 (아직 가상 메모리만 사용)
        chunks[i] = malloc(chunk_size);
        if (!chunks[i]) {
            printf("할당 실패: 청크 %d\n", i);
            break;
        }

        // 실제 물리 메모리 사용 유발 (페이지 폴트 발생)
        // 이 시점에서 OS가 스왑 사용을 결정할 수 있음
        memset(chunks[i], i % 256, chunk_size);

        // 1GB마다 메모리 상태 체크로 스왑 사용 추이 관찰
        if (i % 4 == 0) {
            get_memory_stats(&total_mem, &free_mem, &swap_used);
            printf("청크 %2d 완료: 사용 가능 메모리 %.1f GB, 스왑 사용 %.1f MB\n",
                   i + 1, (double)free_mem / GB, (double)swap_used / 1024 / 1024);
        }
    }

    double alloc_time = get_time() - start;
    printf("\n청크 할당 및 초기화 완료 시간: %.3f초\n", alloc_time);

    // 메모리 접근 성능 테스트 (스왑 사용 시 성능 저하 측정)
    printf("\n=== 스왑 매핑된 접근 성능 테스트 ===\n");
    start = get_time();

    // 여러 번의 라운드로 스왑 in/out 반복 발생 유도
    const int access_rounds = 5;
    for (int round = 0; round < access_rounds; round++) {
        printf("라운드 %d/%d 시작...\n", round + 1, access_rounds);

        for (int i = 0; i < num_chunks; i++) {
            if (chunks[i]) {
                // 청크 내 다양한 위치에 접근하여 스왑 활동 유발
                volatile char *ptr = (volatile char*)chunks[i];
                for (int j = 0; j < chunk_size; j += 4096) {  // 페이지 단위 접근
                    char val = ptr[j];  // 읽기: 스왑인 발생 가능
                    ptr[j] = val + 1;   // 쓰기: dirty page 생성으로 스왑아웃 유발
                }
            }
        }

        // 라운드별 성능 및 스왑 사용 현황 출력
        double round_time = get_time() - start;
        get_memory_stats(&total_mem, &free_mem, &swap_used);
        printf("라운드 %d 완료: %.3f초 경과, 스왑 사용량: %.1f MB\n",
               round + 1, round_time, (double)swap_used / 1024 / 1024);
    }

    double access_time = get_time() - start;
    printf("\n전체 접근 테스트 완료 시간: %.3f초\n", access_time);
    printf("성능 비교: 할당 %.3f초 vs 접근 %.3f초 (%.1fx 느림)\n",
           alloc_time, access_time, access_time / alloc_time);

    // 메모리 해제 및 정리
    printf("\n메모리 해제 중...\n");
    for (int i = 0; i < num_chunks; i++) {
        if (chunks[i]) {
            free(chunks[i]);
        }
    }
    free(chunks);

    // 해제 후에도 스왑에 남아있는 데이터 확인
    get_memory_stats(&total_mem, &free_mem, &swap_used);
    printf("메모리 해제 후 스왑 남은 사용량: %.1f MB\n",
           (double)swap_used / 1024 / 1024);
}

// 스왑 in/out 성능의 실질적 영향 측정
void test_swap_in_out_performance() {
    printf("\n=== 스왑 In/Out 성능 비교 테스트 ===\n");

    // 시스템 메모리보다 큰 크기로 스왑 사용 강제
    size_t size = 1.5 * GB;  // 1.5GB - 대부분의 시스템에서 스왑 사용 유발
    char *memory = malloc(size);
    if (!memory) {
        printf("메모리 할당 실패 - 시스템 메모리 부족\n");
        return;
    }

    printf("%.1f GB 대용량 메모리 할당 완료\n", (double)size / GB);
    printf("스왑아웃 유발을 위한 전체 메모리 초기화 중...\n");

    // 1단계: 모든 메모리 페이지를 터치하여 스왑아웃 유발
    double start = get_time();
    for (size_t i = 0; i < size; i += 4096) {
        memory[i] = i % 256;  // 각 페이지에 데이터 쓰기
    }
    double init_time = get_time() - start;

    printf("메모리 초기화 시간: %.3f초\n", init_time);

    // OS가 스왑아웃을 수행할 시간 제공
    printf("스왑아웃 대기 중 (5초)...\n");
    sleep(5);

    // 대부분의 메모리가 스왑아웃된 상태에서 재접근 시도
    printf("메모리 재접근 시작 - 스왑인 성능 측정\n");
    start = get_time();

    unsigned char checksum = 0;
    int progress_updates = 0;
    const int total_pages = size / 4096;

    // 모든 페이지에 순차적으로 접근하여 스왑인 발생
    for (size_t i = 0; i < size; i += 4096) {
        checksum ^= memory[i];  // 페이지 접근 시 스왑인 발생

        // 진행 상황 표시 (256MB마다)
        if (i % (256 * 1024 * 1024) == 0) {
            double current_time = get_time() - start;
            double progress = (double)(i / 4096) / total_pages * 100;
            printf("\r진행률: %5.1f%%, 소요시간: %6.1f초, 속도: %5.1f MB/s",
                   progress, current_time,
                   (i / 1024.0 / 1024.0) / (current_time > 0 ? current_time : 0.001));
            fflush(stdout);
        }
    }

    double swapin_time = get_time() - start;

    printf("\n\n=== 스왑 성능 분석 결과 ===\n");
    printf("초기화 시간 (RAM): %.3f초\n", init_time);
    printf("스왑인 시간 (Disk): %.3f초\n", swapin_time);
    printf("성능 저하 비율: %.1fx (스왑이 %.1f배 느림)\n",
           swapin_time / init_time, swapin_time / init_time);
    printf("체크섬 값: 0x%02x (데이터 무결성 확인용)\n", checksum);

    // 스왑 사용량에 따른 성능 영향 분석
    if (swapin_time / init_time > 10) {
        printf("\n⚠️  경고: 스왑 사용으로 인한 심각한 성능 저하 감지!\n");
        printf("   권장사항: 메모리 증설 또는 swappiness 값 조정\n");
    } else if (swapin_time / init_time > 3) {
        printf("\nℹ️  정보: 스왑 사용으로 인한 성능 영향 발생\n");
    }

    free(memory);
}

int main() {
    printf("스왑 성능 영향 종합 분석 프로그램\n");
    printf("=========================================\n");
    printf("이 프로그램은 스왑 사용 시 성능 저하를 정량적으로 측정합니다.\n");
    printf("주의: 시스템 메모리보다 큰 메모리를 사용하여 스왑을 유발합니다.\n\n");

    // 시스템 메모리 정보 확인 및 테스트 크기 결정
    long total_mem, free_mem, swap_used;
    get_memory_stats(&total_mem, &free_mem, &swap_used);

    printf("현재 시스템 상태:\n");
    printf("- 총 메모리: %.1f GB\n", (double)total_mem / GB);
    printf("- 사용 가능: %.1f GB\n", (double)free_mem / GB);
    printf("- 스왑 사용: %.1f MB\n\n", (double)swap_used / 1024 / 1024);

    // 테스트 크기를 시스템 메모리보다 크게 설정하여 스왑 사용 유발
    size_t test_size = total_mem + (1 * GB);  // 시스템 메모리 + 1GB

    test_memory_allocation(test_size);  // 단계적 메모리 할당 테스트
    test_swap_in_out_performance();     // 스왑 in/out 성능 직접 측정

    printf("\n=== 최종 결론 ===\n");
    printf("스왑은 메모리 부족 상황에서 시스템 안정성을 제공하지만,\n");
    printf("디스크 I/O로 인한 심각한 성능 저하를 수반합니다.\n");
    printf("적절한 swappiness 설정과 메모리 관리가 중요합니다.\n");

    return 0;
}
```

## 핵심 요점

### 1. 성능 저하의 정량적 분석

스왑 사용 시 **10-1000배의 성능 저하**가 발생하며, 이는 저장매체의 근본적 한계입니다.

### 2. 스왑의 숨겨진 비용

- **페이지 폴트 처리**: 커널이 디스크 I/O를 처리하는 동안 프로세스 블로킹
- **컨텍스트 스위칭 증가**: I/O 대기로 인한 추가적인 스케줄링 오버헤드
- **캐시 오염**: 스왑 작업이 CPU 캐시 효율성을 저해

### 3. 시스템 전반에 미치는 영향

스왑 사용은 해당 프로세스뿐만 아니라 **전체 시스템 성능**에 연쇄적 영향을 미칩니다.

---

**이전**: [스왑 관리와 최적화 개요](./03-04-02-swap-management.md)  
**다음**: [swappiness 파라미터 최적화](./03-05-07-swappiness-optimization.md)에서 스왑 사용을 제어하는 핵심 파라미터를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 3-4시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-03-memory-system)

- [Chapter 3-1: 주소 변환은 어떻게 동작하는가](./03-02-01-address-translation.md)
- [Chapter 3-2: TLB와 캐싱은 어떻게 동작하는가](./03-02-02-tlb-caching.md)
- [Chapter 3-3: 페이지 폴트와 메모리 관리 개요](./03-02-03-page-fault.md)
- [Chapter 3-2-4: 페이지 폴트 종류와 처리 메커니즘](./03-02-04-page-fault-handling.md)
- [Chapter 3-2-5: Copy-on-Write (CoW) - fork()가 빠른 이유](./03-02-05-copy-on-write.md)

### 🏷️ 관련 키워드

`swap`, `performance`, `memory_management`, `benchmarking`, `virtual_memory`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
