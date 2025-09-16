---
tags:
  - Dentry Cache
  - Inode Cache
  - Page Cache
  - Read-ahead
  - VFS Cache
  - balanced
  - intermediate
  - medium-read
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# Chapter 6-2D: VFS 캐시 시스템

## VFS 캐시 시스템

### 💾 세 가지 캐시의 합주곡

VFS 캐시는 세 가지 레벨로 작동합니다:

1. **Dentry Cache**: "이 경로 아까 본 거 같은데?"
2. **Inode Cache**: "이 파일 정보 방금 조회했어!"
3. **Page Cache**: "이 데이터 메모리에 있어!"

실제 효과를 측정해보면:

```bash
# 캐시 비우기
echo 3 > /proc/sys/vm/drop_caches

# 첫 번째 읽기 (디스크에서)
time find /usr -name "*.so" > /dev/null
real    0m8.234s   # 8초!

# 두 번째 읽기 (캐시에서)
time find /usr -name "*.so" > /dev/null  
real    0m0.156s   # 0.15초!

# 52배 빨라짐! 🚀
```

### 📄 페이지 캐시: 메모리의 마법

페이지 캐시는 디스크와 메모리 사이의 중간자입니다.

제가 겪은 실제 사례:

```python
# 대용량 로그 파일 분석
import time

# 첫 번째 실행: 느림
start = time.time()
with open('/var/log/huge.log', 'r') as f:
    data = f.read()  # 1GB 파일
print(f"First read: {time.time() - start:.2f}s")  # 3.45s

# 두 번째 실행: 빠름!
start = time.time()
with open('/var/log/huge.log', 'r') as f:
    data = f.read()  # 같은 파일
print(f"Second read: {time.time() - start:.2f}s")  # 0.02s
```

왜 빨라졌을까요? 페이지 캐시가 메모리에 데이터를 남겨두었기 때문입니다!

## 페이지 캐시 구현

### 주소 공간 관리

```c
// 페이지 캐시 관리
struct address_space {
    struct inode           *host;      // 소유 inode
    struct xarray          i_pages;    // 페이지 캐시 (radix tree)
    gfp_t                  gfp_mask;   // 할당 마스크
    atomic_t               i_mmap_writable;  // VM_SHARED 매핑 수
    struct rb_root_cached  i_mmap;     // VM_SHARED 매핑 트리
    struct rw_semaphore    i_mmap_rwsem;  // i_mmap 보호
    unsigned long          nrpages;    // 전체 페이지 수
    unsigned long          nrexceptional;  // 예외 엔트리 수
    pgoff_t                writeback_index;  // writeback 시작 오프셋
    
    const struct address_space_operations *a_ops;  // 연산 테이블
    
    unsigned long          flags;      // 에러 비트 등
    errseq_t               wb_err;
    spinlock_t             private_lock;  // private_list 보호
    struct list_head       private_list;  // 버퍼 등
    void                  *private_data;  // 파일시스템 전용
};
```

### 페이지 캐시 조회와 할당

```c
// 페이지 캐시 조회
struct page *find_get_page(struct address_space *mapping, pgoff_t offset) {
    struct page *page;
    
    rcu_read_lock();
    
    page = xa_load(&mapping->i_pages, offset);
    if (page && !xa_is_value(page)) {
        if (!page_cache_get_speculative(page))
            page = NULL;
        
        // 페이지가 여전히 매핑에 있는지 확인
        if (unlikely(page != xa_load(&mapping->i_pages, offset))) {
            put_page(page);
            page = NULL;
        }
    }
    
    rcu_read_unlock();
    
    return page;
}

// 페이지 캐시에서 찾거나 새로 할당
struct page *find_or_create_page(struct address_space *mapping,
                                 pgoff_t index, gfp_t gfp_mask) {
    struct page *page;
    int err;
    
repeat:
    page = find_lock_page(mapping, index);
    if (!page) {
        page = __page_cache_alloc(gfp_mask);
        if (!page)
            return NULL;
            
        err = add_to_page_cache_lru(page, mapping, index, gfp_mask);
        if (unlikely(err)) {
            put_page(page);
            if (err == -EEXIST)
                goto repeat;
            return NULL;
        }
    }
    
    return page;
}
```

## Read-ahead 메커니즘

### 순차 읽기 패턴 감지

```c
// Read-ahead 구현
static void do_sync_mmap_readahead(struct vm_area_struct *vma,
                                   struct file_ra_state *ra,
                                   struct file *file,
                                   pgoff_t offset) {
    struct address_space *mapping = file->f_mapping;
    
    // 순차 읽기 패턴 감지
    if (ra->mmap_miss < MMAP_LOTSAMISS * 10) {
        // 다음 읽기 예상 위치
        unsigned long start = max_t(unsigned long, 0, offset - ra->ra_pages/2);
        unsigned long end = offset + ra->ra_pages/2;
        
        // Read-ahead 수행
        force_page_cache_readahead(mapping, file, start, end - start);
    }
}

// Read-ahead 상태 관리
struct file_ra_state {
    pgoff_t start;          // 마지막 read-ahead의 시작점
    unsigned int size;      // 마지막 read-ahead 크기
    unsigned int async_size; // 비동기 read-ahead 크기
    unsigned int ra_pages;  // 최대 read-ahead 크기
    unsigned int mmap_miss; // 캐시 미스 카운터
    loff_t prev_pos;        // 이전 읽기 위치
};
```

### 적응적 Read-ahead

```c
// 적응적 read-ahead 알고리즘
static unsigned long get_next_ra_size(struct file_ra_state *ra,
                                     unsigned long max) {
    unsigned long cur = ra->size;
    unsigned long newsize;
    
    if (cur < max / 16)
        newsize = 4 * cur;
    else
        newsize = 2 * cur;
        
    return min(newsize, max);
}

// 순차 읽기 패턴에 최적화된 read-ahead
static void ondemand_readahead(struct address_space *mapping,
                               struct file_ra_state *ra,
                               struct file *filp,
                               bool hit_readahead_marker,
                               pgoff_t offset,
                               unsigned long req_size) {
    struct backing_dev_info *bdi = inode_to_bdi(mapping->host);
    unsigned long max_pages = ra->ra_pages;
    pgoff_t prev_offset;
    
    // 순차 읽기 감지
    if (offset && (offset == ra->start + ra->size ||
                  offset == ra->start + ra->size - ra->async_size)) {
        ra->start += ra->size;
        ra->size = get_next_ra_size(ra, max_pages);
        ra->async_size = ra->size;
        goto readit;
    }
    
    // 새로운 읽기 패턴
    ra->start = offset;
    ra->size = get_init_ra_size(req_size, max_pages);
    ra->async_size = ra->size > req_size ? ra->size - req_size : ra->size;
    
readit:
    // 실제 read-ahead 수행
    ra_submit(ra, mapping, filp);
}
```

## 페이지 회수 메커니즘

### LRU 기반 페이지 회수

```c
// 페이지 회수를 위한 LRU 리스트 관리
enum lru_list {
    LRU_INACTIVE_ANON = LRU_BASE,
    LRU_ACTIVE_ANON = LRU_BASE + LRU_ACTIVE,
    LRU_INACTIVE_FILE = LRU_BASE + LRU_FILE,
    LRU_ACTIVE_FILE = LRU_BASE + LRU_FILE + LRU_ACTIVE,
    LRU_UNEVICTABLE = LRU_BASE + LRU_FILE + LRU_ACTIVE + 1,
    NR_LRU_LISTS
};

// 페이지를 적절한 LRU 리스트에 추가
void lru_cache_add(struct page *page) {
    struct pagevec *pvec = &get_cpu_var(lru_add_pvec);
    
    get_page(page);
    if (!pagevec_add(pvec, page) || PageCompound(page))
        __pagevec_lru_add(pvec);
    put_cpu_var(lru_add_pvec);
}

// 메모리 압박 시 페이지 회수
static unsigned long shrink_page_list(struct list_head *page_list,
                                     struct zone *zone,
                                     struct scan_control *sc,
                                     enum ttu_flags ttu_flags,
                                     unsigned long *ret_nr_dirty,
                                     unsigned long *ret_nr_unqueued_dirty,
                                     unsigned long *ret_nr_congested,
                                     unsigned long *ret_nr_writeback,
                                     unsigned long *ret_nr_immediate,
                                     bool force_reclaim) {
    LIST_HEAD(ret_pages);
    LIST_HEAD(free_pages);
    int pgactivate = 0;
    unsigned long nr_unqueued_dirty = 0;
    unsigned long nr_dirty = 0;
    unsigned long nr_congested = 0;
    unsigned long nr_reclaimed = 0;
    unsigned long nr_writeback = 0;
    unsigned long nr_immediate = 0;
    
    cond_resched();
    
    while (!list_empty(page_list)) {
        struct address_space *mapping;
        struct page *page;
        int may_enter_fs;
        enum page_references references = PAGEREF_RECLAIM_CLEAN;
        
        cond_resched();
        
        page = list_entry(page_list->prev, struct page, lru);
        list_del(&page->lru);
        
        if (!trylock_page(page))
            goto keep;
            
        // 페이지 참조 상태 확인
        references = page_check_references(page, sc);
        
        switch (references) {
        case PAGEREF_ACTIVATE:
            goto activate_locked;
        case PAGEREF_KEEP:
            goto keep_locked;
        case PAGEREF_RECLAIM:
        case PAGEREF_RECLAIM_CLEAN:
            ; /* try to reclaim the page below */
        }
        
        // 페이지 회수 시도
        if (page_mapped(page) && mapping) {
            switch (try_to_unmap(page, ttu_flags)) {
            case SWAP_FAIL:
                goto activate_locked;
            case SWAP_AGAIN:
                goto keep_locked;
            case SWAP_MLOCK:
                goto cull_mlocked;
            case SWAP_SUCCESS:
                ; /* try to free the page below */
            }
        }
        
        if (PageDirty(page)) {
            // 더티 페이지는 먼저 쓰기 필요
            if (page_is_file_cache(page) &&
                (!current_is_kswapd() || !zone_is_reclaim_dirty(zone))) {
                inc_zone_page_state(page, NR_VMSCAN_IMMEDIATE);
                SetPageReclaim(page);
                goto keep_locked;
            }
            
            if (references == PAGEREF_RECLAIM_CLEAN)
                goto keep_locked;
            if (!may_enter_fs)
                goto keep_locked;
            if (!sc->may_writepage)
                goto keep_locked;
                
            // 페이지 쓰기 시작
            switch (pageout(page, mapping, sc)) {
            case PAGE_KEEP:
                goto keep_locked;
            case PAGE_ACTIVATE:
                goto activate_locked;
            case PAGE_SUCCESS:
                if (PageWriteback(page))
                    goto keep;
                if (PageDirty(page))
                    goto keep;
                    
                lock_page(page);
                if (PageDirty(page) || PageWriteback(page))
                    goto keep_locked;
                mapping = page_mapping(page);
            case PAGE_CLEAN:
                ; /* try to free the page below */
            }
        }
        
        // 페이지 해제 시도
        if (page_has_private(page)) {
            if (!try_to_release_page(page, sc->gfp_mask))
                goto activate_locked;
            if (!mapping && page_count(page) == 1) {
                unlock_page(page);
                if (put_page_testzero(page))
                    goto free_it;
                else {
                    nr_reclaimed++;
                    continue;
                }
            }
        }
        
        if (!mapping || !__remove_mapping(mapping, page, true))
            goto keep_locked;
            
        unlock_page(page);
free_it:
        nr_reclaimed++;
        
        if (mem_cgroup_page_lruvec(page, zone) != NULL)
            list_add(&page->lru, &free_pages);
        else
            __free_page(page);
        continue;
        
cull_mlocked:
        if (PageSwapCache(page))
            try_to_free_swap(page);
        unlock_page(page);
        list_add(&page->lru, &ret_pages);
        continue;
        
activate_locked:
        /* Not a candidate for swapping, so reclaim swap space. */
        if (PageSwapCache(page) && mem_cgroup_swap_full(page))
            try_to_free_swap(page);
        VM_BUG_ON_PAGE(PageActive(page), page);
        SetPageActive(page);
        pgactivate++;
keep_locked:
        unlock_page(page);
keep:
        list_add(&page->lru, &ret_pages);
        VM_BUG_ON_PAGE(PageLRU(page) || PageUnevictable(page), page);
    }
    
    mem_cgroup_uncharge_list(&free_pages);
    try_to_unmap_flush();
    free_hot_cold_page_list(&free_pages, true);
    
    list_splice(&ret_pages, page_list);
    count_vm_events(PGACTIVATE, pgactivate);
    
    *ret_nr_dirty += nr_dirty;
    *ret_nr_congested += nr_congested;
    *ret_nr_unqueued_dirty += nr_unqueued_dirty;
    *ret_nr_writeback += nr_writeback;
    *ret_nr_immediate += nr_immediate;
    
    return nr_reclaimed;
}
```

## Writeback 메커니즘

### 더티 페이지 관리

```c
// 더티 페이지 writeback 관리
struct bdi_writeback {
    struct backing_dev_info *bdi;   // 백킹 디바이스
    unsigned long state;            // WB_* 플래그
    
    unsigned long last_old_flush;   // 마지막 오래된 데이터 flush
    
    struct list_head b_dirty;       // 더티 inode 리스트
    struct list_head b_io;          // writeback을 위한 inode 리스트  
    struct list_head b_more_io;     // 더 많은 I/O가 필요한 inode
    struct list_head b_dirty_time;  // 시간만 더티한 inode
    
    spinlock_t list_lock;           // 리스트 보호 락
    
    struct percpu_counter stat[NR_WB_STAT_ITEMS];
    
    struct task_struct *task;       // writeback 커널 스레드
    
    struct timer_list wakeup_timer; // writeback 시작 타이머
    
    struct delayed_work dwork;      // writeback 작업
    
    unsigned long dirty_sleep;      // throttling을 위한 sleep 시간
};

// 더티 페이지 writeback 시작
static void wb_start_writeback(struct bdi_writeback *wb, bool range_cyclic) {
    struct wb_writeback_work *work;
    
    work = kzalloc(sizeof(*work), GFP_ATOMIC);
    if (!work) {
        trace_writeback_nowork(wb);
        wb_wakeup(wb);
        return;
    }
    
    work->sync_mode = WB_SYNC_NONE;
    work->nr_pages = 0;
    work->range_cyclic = range_cyclic;
    work->reason = WB_REASON_BACKGROUND;
    
    wb_queue_work(wb, work);
}
```

## 캐시 성능 분석

### 실제 성능 측정 도구

```bash
#!/bin/bash
# VFS 캐시 성능 분석 스크립트

echo "=== VFS 캐시 성능 분석 ==="

# 1. 현재 캐시 상태
echo "현재 캐시 사용량:"
free -h | grep -E "Mem:|Buff/cache"
cat /proc/meminfo | grep -E "Buffers|Cached|Dirty|Writeback"

# 2. 덴트리/아이노드 캐시 상태
echo -e "\n덴트리/아이노드 캐시:"
cat /proc/sys/fs/dentry-state
echo "inode 사용량: $(cat /proc/sys/fs/inode-nr)"

# 3. 캐시 효과 테스트
echo -e "\n캐시 효과 테스트:"

# 캐시 클리어
echo 3 > /proc/sys/vm/drop_caches
sync

# 첫 번째 실행 (캐시 미스)
echo "첫 번째 실행 (캐시 미스):"
time find /usr -name "*.so" | wc -l 2>&1 | grep real

# 두 번째 실행 (캐시 히트)
echo "두 번째 실행 (캐시 히트):"
time find /usr -name "*.so" | wc -l 2>&1 | grep real

# 4. 페이지 캐시 히트 비율 계산
echo -e "\n페이지 캐시 통계:"
awk '/pgpgin|pgpgout/ {print $1 ": " $2}' /proc/vmstat
```

### 캐시 튜닝 파라미터

```bash
# VFS 캐시 관련 커널 파라미터
echo "현재 캐시 압력 설정: $(cat /proc/sys/vm/vfs_cache_pressure)"
echo "현재 swappiness 설정: $(cat /proc/sys/vm/swappiness)"
echo "현재 dirty ratio: $(cat /proc/sys/vm/dirty_ratio)"
echo "현재 dirty background ratio: $(cat /proc/sys/vm/dirty_background_ratio)"

# 최적화 권장 설정
echo -e "\n권장 최적화 설정:"
echo "# 메모리 여유 있는 서버용"
echo "vm.vfs_cache_pressure = 50    # 캐시 적극 보존"
echo "vm.swappiness = 10            # 스왑 최소화"
echo "vm.dirty_ratio = 15           # 더티 페이지 비율"
echo "vm.dirty_background_ratio = 5 # 백그라운드 쓰기 시작점"
```

## 캐시 최적화 사례

### 웹 서버 최적화

```bash
# 정적 파일 서버 최적화
# 1. 페이지 캐시 극대화
echo 5 > /proc/sys/vm/vfs_cache_pressure  # 캐시 적극 보존

# 2. 액세스 시간 기록 비활성화 (30% 성능 향상)
mount -o remount,noatime /var/www

# 3. 더티 페이지 비율 조정 (응답성 향상)
echo 5 > /proc/sys/vm/dirty_background_ratio
echo 10 > /proc/sys/vm/dirty_ratio
```

### 데이터베이스 서버 최적화

```bash
# 데이터베이스 서버용 캐시 최적화
# 1. 스왑 최소화 (데이터베이스 성능)
echo 1 > /proc/sys/vm/swappiness

# 2. 파일시스템 캐시와 데이터베이스 캐시 균형
echo 100 > /proc/sys/vm/vfs_cache_pressure  # 약간 적극적 회수

# 3. 즉시 쓰기 모드 (데이터 안전성)
echo 5 > /proc/sys/vm/dirty_ratio
echo 1 > /proc/sys/vm/dirty_background_ratio
```

## 핵심 요점

### 1. 3단계 캐시 계층의 시너지

- **Dentry Cache**: 경로 탐색 52배 가속
- **Inode Cache**: 메타데이터 접근 최적화  
- **Page Cache**: 데이터 읽기 172배 가속

### 2. 적응적 최적화 메커니즘

- **Read-ahead**: 순차 읽기 패턴 자동 감지
- **LRU 관리**: 메모리 압박 시 지능적 회수
- **Writeback**: 비동기 쓰기로 성능 향상

### 3. 실전 튜닝 포인트

- **vfs_cache_pressure**: 캐시 보존 적극성 제어
- **dirty_ratio**: 더티 페이지 비율로 응답성 조절
- **read-ahead**: 워크로드별 크기 최적화

---

**이전**: [마운트 시스템과 네임스페이스](./06-15-mount-system.md)  
**다음**: [파일시스템별 구현](./06-17-filesystem-impl.md)에서 ext4, Btrfs, 특수 파일시스템의 내부 구조를 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-06-file-io)

- [Chapter 6-1: 파일 디스크립터의 내부 구조](./06-10-file-descriptor.md)
- [Chapter 6-1A: 파일 디스크립터 기본 개념과 3단계 구조](./06-01-fd-basics-structure.md)
- [Chapter 6-1B: 파일 디스크립터 할당과 공유 메커니즘](./06-11-fd-allocation-management.md)
- [Chapter 6-1C: 파일 연산과 VFS 다형성](./06-12-file-operations-vfs.md)
- [Chapter 6-2: VFS와 파일 시스템 추상화 개요](./06-13-vfs-filesystem.md)

### 🏷️ 관련 키워드

`VFS Cache`, `Page Cache`, `Dentry Cache`, `Inode Cache`, `Read-ahead`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
