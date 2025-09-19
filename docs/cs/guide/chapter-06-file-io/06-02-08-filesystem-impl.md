---
tags:
  - Btrfs
  - balanced
  - ext4
  - filesystem-implementation
  - intermediate
  - medium-read
  - procfs
  - tmpfs
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# 6.2.8: 파일시스템 구현 세부사항

## 파일 시스템별 구현

### 💿 ext4: 안정성의 왕자

ext4는 리눅스의 "토요타 캐리"입니다. 화려하지 않지만 믿을 수 있죠.

제가 10년간 ext4를 사용하며 배운 점:

```bash
# ext4의 장점
- 안정성: 10년간 데이터 손실 0회
- 성능: 대부분의 워크로드에서 우수
- 호환성: 모든 리눅스 도구가 지원

# extent 기반 할당의 위력
$ filefrag large_file.dat
large_file.dat: 2 extents found
# 전통적인 블록 맵핑이었다면 수천 개!
```

#### Extent Tree의 비밀

전통적인 파일시스템: "블록 1번, 블록 2번, 블록 3번..."
ext4 extent: "블록 1-1000번 한 번에!"

마치 "집 주소를 1번집, 2번집" 대신 "아파트 101동 1층-10층"이라고 표현하는 것과 같습니다.

### ext4 파일 시스템

```c
// ext4 슈퍼블록 연산
static const struct super_operations ext4_sops = {
    .alloc_inode    = ext4_alloc_inode,
    .destroy_inode  = ext4_destroy_inode,
    .write_inode    = ext4_write_inode,
    .dirty_inode    = ext4_dirty_inode,
    .drop_inode     = ext4_drop_inode,
    .evict_inode    = ext4_evict_inode,
    .put_super      = ext4_put_super,
    .sync_fs        = ext4_sync_fs,
    .freeze_fs      = ext4_freeze,
    .unfreeze_fs    = ext4_unfreeze,
    .statfs         = ext4_statfs,
    .remount_fs     = ext4_remount,
    .show_options   = ext4_show_options,
};

// ext4 extent 트리 구조
struct ext4_extent {
    __le32  ee_block;       // 논리 블록 번호
    __le16  ee_len;         // extent 길이
    __le16  ee_start_hi;    // 물리 블록 high 16 bits
    __le32  ee_start_lo;    // 물리 블록 low 32 bits
};

struct ext4_extent_idx {
    __le32  ei_block;       // 인덱스가 커버하는 블록
    __le32  ei_leaf_lo;     // 리프 블록 low 32 bits
    __le16  ei_leaf_hi;     // 리프 블록 high 16 bits
    __u16   ei_unused;
};

struct ext4_extent_header {
    __le16  eh_magic;       // 매직 넘버
    __le16  eh_entries;     // 유효한 엔트리 수
    __le16  eh_max;         // 최대 엔트리 수
    __le16  eh_depth;       // 트리 깊이
    __le32  eh_generation;  // 생성 번호
};
```

### ext4 블록 할당 최적화

```c
// ext4 블록 할당
static int ext4_ext_map_blocks(handle_t *handle, struct inode *inode,
                               struct ext4_map_blocks *map, int flags) {
    struct ext4_ext_path *path = NULL;
    struct ext4_extent newex, *ex;
    ext4_lblk_t ee_block;
    ext4_fsblk_t newblock = 0;
    int err = 0, depth;
    unsigned int allocated = 0;
    
    // extent 트리 탐색
    path = ext4_find_extent(inode, map->m_lblk, NULL, 0);
    if (IS_ERR(path)) {
        err = PTR_ERR(path);
        path = NULL;
        goto out;
    }
    
    depth = ext_depth(inode);
    ex = path[depth].p_ext;
    
    if (ex) {
        ee_block = le32_to_cpu(ex->ee_block);
        
        // extent가 요청한 블록을 포함하는지 확인
        if (in_range(map->m_lblk, ee_block, ext4_ext_get_actual_len(ex))) {
            // 이미 할당된 블록
            newblock = ext4_ext_pblock(ex) + map->m_lblk - ee_block;
            allocated = ext4_ext_get_actual_len(ex) - (map->m_lblk - ee_block);
            goto out;
        }
    }
    
    // 새 블록 할당 필요
    if (flags & EXT4_GET_BLOCKS_CREATE) {
        struct ext4_allocation_request ar = {
            .inode = inode,
            .len = map->m_len,
            .logical = map->m_lblk,
            .lleft = map->m_lblk,
            .pleft = 0,
            .goal = ext4_ext_find_goal(inode, path, map->m_lblk),
            .flags = flags
        };
        
        // 블록 할당
        newblock = ext4_mb_new_blocks(handle, &ar, &err);
        if (!newblock)
            goto out;
            
        // extent 트리에 추가
        newex.ee_block = cpu_to_le32(map->m_lblk);
        ext4_ext_store_pblock(&newex, newblock);
        newex.ee_len = cpu_to_le16(ar.len);
        
        err = ext4_ext_insert_extent(handle, inode, &path, &newex, flags);
        if (err) {
            ext4_discard_preallocations(inode);
            goto out;
        }
        
        allocated = ar.len;
    }
    
out:
    if (path)
        ext4_ext_drop_refs(path);
    kfree(path);
    
    map->m_pblk = newblock;
    map->m_len = allocated;
    
    return err ? err : allocated;
}
```

## Btrfs: 미래의 파일시스템

### 🌲 Btrfs: 미래의 파일시스템

Btrfs는 테슬라 같은 파일시스템입니다. 혁신적이지만 가끔 불안정...

#### Copy-on-Write의 마법

제가 실제로 사용하는 스냅샷 기능:

```bash
# 매일 자동 스냅샷
btrfs subvolume snapshot /home /snapshots/home-$(date +%Y%m%d)

# 실수로 파일 삭제?
btrfs subvolume snapshot /snapshots/home-20240115 /home
# 복구 완료! (타임머신처럼)

# 용량 확인
$ df -h /home
/dev/sda2  1TB  500GB  500GB  50%  /home
# 30개의 스냅샷이 있지만 공간은 변경된 부분만 차지!
```

#### B-Tree 구조의 우아함

Btrfs는 모든 것을 B-Tree로 저장합니다:

- 파일 메타데이터? B-Tree
- 디렉토리 구조? B-Tree  
- 체크섬? B-Tree
- 스냅샷? B-Tree

마치 '만능 자료구조'처럼 B-Tree를 사용합니다!

### Btrfs 파일 시스템

```c
// Btrfs B-tree 구조
struct btrfs_key {
    __u64 objectid;     // 객체 ID
    __u8 type;          // 키 타입
    __u64 offset;       // 오프셋
} __attribute__ ((__packed__));

struct btrfs_disk_key {
    __le64 objectid;
    __u8 type;
    __le64 offset;
} __attribute__ ((__packed__));

// Btrfs 슈퍼블록
struct btrfs_super_block {
    __u8 csum[BTRFS_CSUM_SIZE];         // 체크섬
    __u8 fsid[BTRFS_FSID_SIZE];         // 파일시스템 ID
    __le64 bytenr;                      // 물리 주소
    __le64 flags;                       // 플래그
    __u8 magic[BTRFS_MAGIC_L];          // 매직 넘버
    __le64 generation;                  // 생성 번호
    __le64 root;                        // root tree 루트
    __le64 chunk_root;                  // chunk tree 루트
    __le64 log_root;                    // log tree 루트
    
    __le64 log_root_transid;
    __le64 total_bytes;                 // 전체 크기
    __le64 bytes_used;                  // 사용된 크기
    __le64 root_dir_objectid;           // 루트 디렉토리 ID
    __le64 num_devices;                 // 디바이스 수
    
    __le32 sectorsize;                  // 섹터 크기
    __le32 nodesize;                    // 노드 크기
    __le32 __unused_leafsize;
    __le32 stripesize;                  // 스트라이프 크기
    
    __le32 sys_chunk_array_size;        // 시스템 chunk 배열 크기
    __le64 chunk_root_generation;       // chunk root 생성 번호
    
    __le64 compat_flags;
    __le64 compat_ro_flags;
    __le64 incompat_flags;
    
    __le16 csum_type;                   // 체크섬 타입
    __u8 root_level;                    // root tree 레벨
    __u8 chunk_root_level;              // chunk tree 레벨
    __u8 log_root_level;                // log tree 레벨
    
    struct btrfs_dev_item dev_item;     // 디바이스 정보
    
    char label[BTRFS_LABEL_SIZE];       // 레이블
    
    __le64 cache_generation;
    __le64 uuid_tree_generation;
    
    // 미래 확장용 공간
    __u8 reserved[4088];
    __u8 sys_chunk_array[BTRFS_SYSTEM_CHUNK_ARRAY_SIZE];
    struct btrfs_root_backup super_roots[BTRFS_NUM_BACKUP_ROOTS];
} __attribute__ ((__packed__));
```

### Copy-on-Write 구현

```c
// Copy-on-Write 구현
static noinline int cow_file_range(struct inode *inode,
                                   struct page *locked_page,
                                   u64 start, u64 end,
                                   u64 *done_offset,
                                   bool keep_locked) {
    struct btrfs_fs_info *fs_info = btrfs_sb(inode->i_sb);
    struct btrfs_root *root = BTRFS_I(inode)->root;
    u64 alloc_hint = 0;
    u64 num_bytes;
    unsigned long ram_size;
    u64 cur_alloc_size = 0;
    u64 blocksize = fs_info->sectorsize;
    struct btrfs_key ins;
    struct extent_map *em;
    int ret = 0;
    
    num_bytes = ALIGN(end - start + 1, blocksize);
    num_bytes = max(blocksize, num_bytes);
    ASSERT(num_bytes <= btrfs_super_total_bytes(fs_info->super_copy));
    
    // extent 할당
    while (num_bytes > 0) {
        cur_alloc_size = num_bytes;
        ret = btrfs_reserve_extent(root, cur_alloc_size, cur_alloc_size,
                                  fs_info->sectorsize, 0, alloc_hint,
                                  &ins, 1, 1);
        if (ret < 0)
            goto out;
            
        // extent map 생성
        em = create_io_em(inode, start, ins.offset, start,
                         ins.objectid, ins.offset, ins.offset,
                         ram_size, BTRFS_COMPRESS_NONE,
                         BTRFS_ORDERED_REGULAR);
        if (IS_ERR(em)) {
            ret = PTR_ERR(em);
            goto out;
        }
        free_extent_map(em);
        
        // ordered extent 추가
        ret = btrfs_add_ordered_extent(inode, start, ins.objectid,
                                       ram_size, cur_alloc_size, 0);
        if (ret)
            goto out;
            
        if (root->root_key.objectid == BTRFS_DATA_RELOC_TREE_OBJECTID)
            ret = btrfs_reloc_clone_csums(inode, start, cur_alloc_size);
            
        start += cur_alloc_size;
        num_bytes -= cur_alloc_size;
        alloc_hint = ins.objectid + ins.offset;
    }
    
out:
    return ret;
}
```

### 스냅샷 생성 메커니즘

```c
// 스냅샷 생성
static int create_snapshot(struct btrfs_root *root, struct inode *dir,
                          struct dentry *dentry, bool readonly,
                          struct btrfs_qgroup_inherit *inherit) {
    struct btrfs_fs_info *fs_info = btrfs_sb(dir->i_sb);
    struct inode *inode;
    struct btrfs_pending_snapshot *pending_snapshot;
    struct btrfs_trans_handle *trans;
    int ret;
    
    // pending snapshot 구조체 할당
    pending_snapshot = kzalloc(sizeof(*pending_snapshot), GFP_KERNEL);
    if (!pending_snapshot)
        return -ENOMEM;
        
    pending_snapshot->root_item = kzalloc(sizeof(struct btrfs_root_item),
                                         GFP_KERNEL);
    pending_snapshot->path = btrfs_alloc_path();
    if (!pending_snapshot->root_item || !pending_snapshot->path) {
        ret = -ENOMEM;
        goto free_pending;
    }
    
    // 트랜잭션 시작
    trans = btrfs_start_transaction(root, 0);
    if (IS_ERR(trans)) {
        ret = PTR_ERR(trans);
        goto free_pending;
    }
    
    spin_lock(&fs_info->trans_lock);
    list_add(&pending_snapshot->list,
            &trans->transaction->pending_snapshots);
    spin_unlock(&fs_info->trans_lock);
    
    // 스냅샷 설정
    pending_snapshot->dentry = dentry;
    pending_snapshot->root = root;
    pending_snapshot->readonly = readonly;
    pending_snapshot->dir = dir;
    pending_snapshot->inherit = inherit;
    
    // 트랜잭션 커밋 (스냅샷 생성)
    ret = btrfs_commit_transaction(trans);
    if (ret)
        goto fail;
        
    ret = pending_snapshot->error;
    if (ret)
        goto fail;
        
    ret = btrfs_orphan_cleanup(pending_snapshot->snap);
    if (ret)
        goto fail;
        
    inode = btrfs_lookup_dentry(dir, dentry);
    if (IS_ERR(inode)) {
        ret = PTR_ERR(inode);
        goto fail;
    }
    
    d_instantiate(dentry, inode);
    ret = 0;
    
fail:
    btrfs_put_root(pending_snapshot->snap);
    btrfs_subvolume_release_metadata(fs_info, &pending_snapshot->block_rsv);
    
free_pending:
    kfree(pending_snapshot->root_item);
    btrfs_free_path(pending_snapshot->path);
    kfree(pending_snapshot);
    
    return ret;
}
```

## 특수 파일 시스템

### 🔮 procfs: 커널의 수정 구슬

procfs는 "파일인 척하는" 가상 파일시스템입니다.

제가 자주 사용하는 proc 파일들:

```bash
# CPU 정보 확인
$ cat /proc/cpuinfo | grep "model name" | head -1
model name : AMD Ryzen 9 5950X

# 메모리 사용량
$ cat /proc/meminfo | head -3
MemTotal:       32768000 kB
MemFree:         1234567 kB
MemAvailable:   20000000 kB

# 프로세스의 비밀
$ ls /proc/self/
cmdline  environ  exe  fd/  maps  status  ...
# self는 현재 프로세스를 가리키는 마법의 링크!
```

#### /proc/[pid]/maps의 매력

프로세스의 메모리 지도를 보여줍니다:

```bash
$ cat /proc/self/maps | head -5
00400000-00452000 r-xp /usr/bin/cat      # 코드 영역
00651000-00652000 r--p /usr/bin/cat      # 읽기 전용 데이터
00652000-00653000 rw-p /usr/bin/cat      # 읽기/쓰기 데이터
7ffff7dd3000-7ffff7dfc000 r-xp /lib/x86_64-linux-gnu/ld-2.31.so
7ffffffde000-7ffffffff000 rw-p [stack]   # 스택!
```

디버깅할 때 정말 유용합니다!

### procfs: 프로세스 정보 파일 시스템

```c
// /proc 파일 시스템 구현
static struct dentry *proc_pid_lookup(struct inode *dir,
                                      struct dentry *dentry,
                                      unsigned int flags) {
    struct task_struct *task;
    unsigned tgid;
    struct pid_namespace *ns;
    struct dentry *result = ERR_PTR(-ENOENT);
    
    tgid = name_to_int(&dentry->d_name);
    if (tgid == ~0U)
        goto out;
        
    ns = dentry->d_sb->s_fs_info;
    rcu_read_lock();
    task = find_task_by_pid_ns(tgid, ns);
    if (task)
        get_task_struct(task);
    rcu_read_unlock();
    
    if (!task)
        goto out;
        
    result = proc_pid_instantiate(dentry, task, NULL);
    put_task_struct(task);
    
out:
    return result;
}

// /proc/[pid]/maps 구현
static int show_map_vma(struct seq_file *m, struct vm_area_struct *vma) {
    struct mm_struct *mm = vma->vm_mm;
    struct file *file = vma->vm_file;
    vm_flags_t flags = vma->vm_flags;
    unsigned long ino = 0;
    unsigned long long pgoff = 0;
    unsigned long start, end;
    dev_t dev = 0;
    const char *name = NULL;
    
    if (file) {
        struct inode *inode = file_inode(file);
        dev = inode->i_sb->s_dev;
        ino = inode->i_ino;
        pgoff = ((loff_t)vma->vm_pgoff) << PAGE_SHIFT;
    }
    
    start = vma->vm_start;
    end = vma->vm_end;
    
    seq_setwidth(m, 25 + sizeof(void *) * 6 - 1);
    seq_printf(m, "%08lx-%08lx %c%c%c%c %08llx %02x:%02x %lu ",
              start,
              end,
              flags & VM_READ ? 'r' : '-',
              flags & VM_WRITE ? 'w' : '-',
              flags & VM_EXEC ? 'x' : '-',
              flags & VM_MAYSHARE ? 's' : 'p',
              pgoff,
              MAJOR(dev), MINOR(dev), ino);
              
    if (file) {
        seq_pad(m, ' ');
        seq_file_path(m, file, ", ");
        goto done;
    }
    
    if (vma->vm_ops && vma->vm_ops->name) {
        name = vma->vm_ops->name(vma);
        if (name)
            goto done;
    }
    
    name = arch_vma_name(vma);
    if (!name) {
        if (!mm) {
            name = "[vdso]";
            goto done;
        }
        
        if (vma->vm_start <= mm->brk && vma->vm_end >= mm->start_brk) {
            name = "[heap]";
            goto done;
        }
        
        if (is_stack(vma)) {
            name = "[stack]";
            goto done;
        }
    }
    
done:
    if (name) {
        seq_pad(m, ' ');
        seq_puts(m, name);
    }
    seq_putc(m, '\n');
    
    return 0;
}
```

## tmpfs: 메모리 기반 파일시스템

### 💨 tmpfs: RAM 디스크의 속도

tmpfs는 메모리에만 존재하는 파일시스템입니다.

제가 실제로 활용하는 방법:

```bash
# 컴파일 속도 비교
# SSD에서 컴파일
time make -j16
real    2m30.5s

# tmpfs에서 컴파일  
mount -t tmpfs -o size=4G tmpfs /tmp/build
cp -r project /tmp/build/
cd /tmp/build/project
time make -j16
real    1m45.2s  # 30% 빨라짐!
```

#### tmpfs의 비밀

1. **동적 크기**: 사용한 만큼만 메모리 차지
2. **스왑 가능**: 메모리 부족시 스왑으로
3. **휘발성**: 재부팅하면 사라짐

```bash
# Docker가 tmpfs를 사용하는 이유
$ docker run --tmpfs /tmp:size=1G myapp
# 컨테이너 내부의 임시 파일은 디스크에 안 남음!
```

### tmpfs: 메모리 기반 파일 시스템

```c
// tmpfs inode 연산
static const struct inode_operations shmem_inode_operations = {
    .getattr    = shmem_getattr,
    .setattr    = shmem_setattr,
    .listxattr  = shmem_listxattr,
    .set_acl    = simple_set_acl,
};

// tmpfs 페이지 할당
static int shmem_getpage_gfp(struct inode *inode, pgoff_t index,
                             struct page **pagep, enum sgp_type sgp,
                             gfp_t gfp, struct vm_area_struct *vma,
                             struct vm_fault *vmf, vm_fault_t *fault_type) {
    struct address_space *mapping = inode->i_mapping;
    struct shmem_inode_info *info = SHMEM_I(inode);
    struct shmem_sb_info *sbinfo;
    struct mm_struct *charge_mm;
    struct page *page;
    pgoff_t hindex = index;
    gfp_t huge_gfp;
    int error;
    int once = 0;
    int alloced = 0;
    
    if (index > (MAX_LFS_FILESIZE >> PAGE_SHIFT))
        return -EFBIG;
        
repeat:
    page = find_lock_entry(mapping, index);
    if (xa_is_value(page)) {
        error = shmem_swapin_page(inode, index, &page,
                                 sgp, gfp, vma, fault_type);
        if (error == -EEXIST)
            goto repeat;
            
        *pagep = page;
        return error;
    }
    
    if (page) {
        if (sgp == SGP_WRITE)
            mark_page_accessed(page);
        if (PageUptodate(page))
            goto out;
        /* Page 초기화 필요 */
        
    } else {
        /* 새 페이지 할당 */
        if (sgp != SGP_WRITE && sgp != SGP_FALLOC)
            goto out;
            
        sbinfo = SHMEM_SB(inode->i_sb);
        charge_mm = vma ? vma->vm_mm : current->mm;
        
        page = shmem_alloc_page(gfp, info, index);
        if (!page) {
            error = -ENOMEM;
            goto out;
        }
        
        __SetPageLocked(page);
        __SetPageSwapBacked(page);
        __SetPageUptodate(page);
        
        /* 페이지 캐시에 추가 */
        error = shmem_add_to_page_cache(page, mapping, index,
                                       NULL, gfp & GFP_RECLAIM_MASK,
                                       charge_mm);
        if (error)
            goto out_release;
            
        shmem_recalc_inode(inode);
        alloced = true;
    }
    
out:
    *pagep = page;
    return 0;
    
out_release:
    unlock_page(page);
    put_page(page);
    return error;
}
```

## 파일시스템 선택 가이드

### 워크로드별 최적 파일시스템

```bash
# 1. 일반 데스크탑/서버 - 안정성 우선
# → ext4 권장
mkfs.ext4 -E lazy_itable_init=0,lazy_journal_init=0 /dev/sdb1

# 2. 대용량 미디어 서버 - 큰 파일, 고성능
# → XFS 권장  
mkfs.xfs -f /dev/sdb1

# 3. 개발/테스트 환경 - 스냅샷 필요
# → Btrfs 권장
mkfs.btrfs -f /dev/sdb1

# 4. 컨테이너 이미지 스토리지 - 오버레이 기능
# → overlay2 (Docker)
# 백엔드는 ext4/xfs 사용

# 5. 고성능 임시 작업 - 속도 최우선
# → tmpfs 권장
mount -t tmpfs -o size=8G tmpfs /tmp/fast
```

### 성능 특성 비교

| 파일시스템 | 큰 파일 | 작은 파일 | 메타데이터 | 스냅샷 | 압축 | 안정성 |
|-----------|---------|----------|-----------|--------|------|--------|
| **ext4**  | ⭐⭐⭐⭐   | ⭐⭐⭐    | ⭐⭐⭐     | ❌     | ❌   | ⭐⭐⭐⭐⭐ |
| **XFS**   | ⭐⭐⭐⭐⭐  | ⭐⭐      | ⭐⭐⭐⭐⭐   | ❌     | ❌   | ⭐⭐⭐⭐  |
| **Btrfs** | ⭐⭐⭐⭐   | ⭐⭐⭐    | ⭐⭐⭐⭐    | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐   |
| **tmpfs** | ⭐⭐⭐⭐⭐  | ⭐⭐⭐⭐⭐  | ⭐⭐⭐⭐⭐   | ❌     | ❌   | ❌(휘발성) |

## 핵심 요점

### 1. ext4의 실용성

- **Extent 기반 할당**: 대용량 파일 효율적 관리
- **저널링**: 시스템 크래시 시 데이터 보호
- **뛰어난 호환성**: 모든 리눅스 도구 완벽 지원

### 2. Btrfs의 혁신성

- **Copy-on-Write**: 스냅샷과 데이터 무결성
- **압축 지원**: 투명한 데이터 압축
- **다중 디바이스**: 소프트웨어 RAID 내장

### 3. 특수 파일시스템의 활용

- **procfs**: 시스템 정보 접근과 디버깅
- **tmpfs**: 고성능 임시 저장소
- **sysfs**: 디바이스 관리와 제어

---

**이전**: [Chapter 6.2.7: VFS 캐시 시스템](./06-02-07-vfs-cache.md)  
**다음**: [Chapter 6.4.1: 성능 최적화와 튜닝](./06-04-01-performance-tuning.md)에서 실전 성능 분석과 최적화 기법을 학습합니다.

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

- [6.2.1: 파일 디스크립터의 내부 구조](./06-02-01-file-descriptor.md)
- [6.1.1: 파일 디스크립터 기본 개념과 3단계 구조](./06-01-01-fd-basics-structure.md)
- [6.2.2: 파일 디스크립터 할당과 공유 메커니즘](./06-02-02-fd-allocation-management.md)
- [6.2.3: 파일 연산과 VFS 다형성](./06-02-03-file-operations-vfs.md)
- [6.2.4: VFS와 파일 시스템 추상화 개요](./06-02-04-vfs-filesystem.md)

### 🏷️ 관련 키워드

`ext4`, `Btrfs`, `procfs`, `tmpfs`, `filesystem-implementation`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
