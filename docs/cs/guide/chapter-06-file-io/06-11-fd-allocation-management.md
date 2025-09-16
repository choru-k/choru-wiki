---
tags:
  - allocation
  - balanced
  - bitmap
  - file_descriptor
  - fork
  - intermediate
  - kernel
  - medium-read
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "3-5시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# Chapter 6-1B: 파일 디스크립터 할당과 공유 메커니즘

## 파일 디스크립터 할당 메커니즘

### 🎰 빈 자리 찾기 게임

파일 디스크립터 할당은 극장에서 빈 좌석을 찾는 것과 비슷합니다.

상상해보세요. 65,536개의 좌석이 있는 거대한 극장에서 빈 자리를 찾아야 한다면? 하나씩 확인하면 너무 느리겠죠.

커널은 똑똑한 방법을 씁니다:

```c
// 실제 테스트 코드
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>

int main() {
    // fd 3, 4, 5를 차례로 할당
    int fd1 = open("/dev/null", O_RDONLY);  // fd = 3
    int fd2 = open("/dev/null", O_RDONLY);  // fd = 4
    int fd3 = open("/dev/null", O_RDONLY);  // fd = 5
    
    close(fd2);  // fd 4를 반납
    
    // 다음 open()은 뭘 반환할까요?
    int fd4 = open("/dev/null", O_RDONLY);
    printf("Next fd: %d\n", fd4);  // 4! (가장 작은 빈 번호)
    
    return 0;
}
```

커널은 항상 **가장 작은 사용 가능한 번호**를 할당합니다. 이를 위해 비트맵을 사용하죠.

### 빠른 할당을 위한 비트맵 기반 관리

```c
// 사용 가능한 파일 디스크립터 찾기
static int alloc_fd(unsigned start, unsigned flags) {
    struct files_struct *files = current->files;
    unsigned int fd;
    int error;
    struct fdtable *fdt;
    
    spin_lock(&files->file_lock);
repeat:
    fdt = files_fdtable(files);
    fd = start;
    
    // 비트맵에서 빈 슬롯 찾기
    if (fd < files->next_fd)
        fd = files->next_fd;
    
    if (fd < fdt->max_fds)
        fd = find_next_fd(fdt, fd);
    
    // 테이블 확장이 필요한 경우
    if (unlikely(fd >= fdt->max_fds)) {
        error = expand_files(files, fd);
        if (error < 0)
            goto out;
        goto repeat;
    }
    
    // fd 할당
    __set_open_fd(fd, fdt);
    if (flags & O_CLOEXEC)
        __set_close_on_exec(fd, fdt);
    else
        __clear_close_on_exec(fd, fdt);
    
    error = fd;
    
    // 다음 할당을 위한 힌트 업데이트
    files->next_fd = fd + 1;
    
out:
    spin_unlock(&files->file_lock);
    return error;
}

// 비트맵에서 다음 빈 fd 찾기
static unsigned int find_next_fd(struct fdtable *fdt, unsigned int start) {
    unsigned int maxfd = fdt->max_fds;
    unsigned int maxbit = maxfd / BITS_PER_LONG;
    unsigned int bitbit = start / BITS_PER_LONG;
    
    bitbit = find_next_zero_bit(fdt->full_fds_bits, maxbit, bitbit) * BITS_PER_LONG;
    if (bitbit > maxfd)
        return maxfd;
    if (bitbit > start)
        start = bitbit;
    
    return find_next_zero_bit(fdt->open_fds, maxfd, start);
}

// 파일 디스크립터 테이블 확장
static int expand_files(struct files_struct *files, unsigned int nr) {
    struct fdtable *fdt;
    int expanded = 0;
    
    fdt = files_fdtable(files);
    
    // 이미 충분한 크기인지 확인
    if (nr < fdt->max_fds)
        return expanded;
    
    // 최대 한계 체크
    if (nr >= sysctl_nr_open)
        return -EMFILE;
    
    if (unlikely(files->resize_in_progress)) {
        spin_unlock(&files->file_lock);
        expanded = 1;
        wait_event(files->resize_wait, !files->resize_in_progress);
        spin_lock(&files->file_lock);
        goto repeat;
    }
    
    // 새 테이블 할당
    files->resize_in_progress = true;
    expanded = expand_fdtable(files, nr);
    files->resize_in_progress = false;
    
    wake_up_all(&files->resize_wait);
    return expanded;
}
```

### 🔄 파일 디스크립터 복사와 공유

#### fork()의 마법과 함정

`fork()`는 프로세스를 복제하는데, 파일 디스크립터는 어떻게 될까요?

제가 처음 이걸 배웠을 때 혼란스러웠던 예제:

```c
#include <unistd.h>
#include <stdio.h>
#include <fcntl.h>

int main() {
    int fd = open("shared.txt", O_WRONLY | O_CREAT | O_TRUNC, 0644);
    
    write(fd, "Parent", 6);
    
    if (fork() == 0) {
        // 자식 프로세스
        write(fd, "Child", 5);  // 같은 fd 사용!
        close(fd);
        return 0;
    }
    
    wait(NULL);
    write(fd, "Parent2", 7);
    close(fd);
    
    // 파일 내용은? "ParentChildParent2"!
    // 왜? 파일 오프셋을 공유하기 때문!
}
```

이건 버그가 아니라 **feature**입니다! 파이프 구현의 핵심이죠.

### 파일 디스크립터 복사와 공유

```c
// fork() 시 파일 디스크립터 테이블 복사
static int copy_files(unsigned long clone_flags, struct task_struct *tsk) {
    struct files_struct *oldf, *newf;
    int error = 0;
    
    oldf = current->files;
    if (!oldf)
        goto out;
    
    if (clone_flags & CLONE_FILES) {
        // CLONE_FILES: 파일 테이블 공유
        atomic_inc(&oldf->count);
        goto out;
    }
    
    // 새 파일 테이블 생성
    newf = dup_fd(oldf, &error);
    if (!newf)
        goto out;
    
    tsk->files = newf;
    error = 0;
out:
    return error;
}

// 파일 디스크립터 테이블 복제 - fork()의 핵심 구현
// 실제 사용: 모든 프로세스 생성 시점에서 실행 (bash, docker, systemd 등)
// dup_fd() - fork() 시 파일 디스크립터 복제의 핵심 함수
// === 멀티프로세스 파일 공유 메커니즘 구현 ===
// 이 함수 하나가 Unix의 "Everything is a file" 철학을 완성한다!
// 평균 실행 시간: 2-15μs (열린 파일 개수에 따라)
static struct files_struct *dup_fd(struct files_struct *oldf, int *errorp) {
    struct files_struct *newf;   // 새 프로세스의 "파일 관리 사무실"
    struct file **old_fds, **new_fds;  // 부모/자식 파일 포인터 배열들
    unsigned int open_files, i;  // 실제 열린 파일 개수와 반복자
    struct fdtable *old_fdt, *new_fdt;  // 부모/자식 FD 테이블
    
    // === 1단계: 메모리 할당과 초기 설정 ===
    // "아이를 위한 새 사무실 준비하기"
    *errorp = -ENOMEM;  // 기본 에러 = 메모리 부족 (가장 흔한 실패 원인)
    
    // SLAB 캐시에서 files_struct 할당
    // 성능 핵심: 자주 할당/해제되므로 전용 캐시 사용 (일반 kmalloc보다 3배 빠름)
    newf = kmem_cache_alloc(files_cachep, GFP_KERNEL);
    if (!newf)
        goto out;  // OOM 킬러 작동 직전 상황!
    
    // === 2단계: 자식 프로세스 FD 시스템 기본 구조 초기화 ===
    // "새 사무실의 기본 장비 설치"
    atomic_set(&newf->count, 1);        // 참조 카운트 = 1 (자식 프로세스만 참조)
    spin_lock_init(&newf->file_lock);   // 멀티스레드 안전성을 위한 락
    newf->resize_in_progress = false;   // 아직 확장 작업 없음
    init_waitqueue_head(&newf->resize_wait);  // FD 테이블 확장 대기 큐 초기화
    newf->next_fd = 0;  // 다음 할당할 FD 번호 힌트 (0부터 시작)
    
    // === 3단계: 소규모 프로세스 최적화 - 기본 테이블 설정 ===
    // "작은 사무실엔 작은 책상만 필요해"
    // 대부분의 프로세스는 10개 미만 파일 사용 → 동적 할당 회피
    new_fdt = &newf->fdtab;  // 내장 테이블 사용 (별도 할당 불필요)
    new_fdt->max_fds = NR_OPEN_DEFAULT;  // 64개 FD까지 처리 가능
    
    // 비트맵들을 정적 배열로 초기화 (malloc 횟수 최소화)
    new_fdt->close_on_exec = newf->close_on_exec_init;   // exec 시 닫을 FD 추적
    new_fdt->open_fds = newf->open_fds_init;             // 열린 FD 추적  
    new_fdt->full_fds_bits = newf->full_fds_bits_init;   // 가득 찬 섹션 추적
    new_fdt->fd = &newf->fd_array[0];  // 기본 64개 슬롯 배열 연결
    
    // === 4단계: 부모 프로세스 상태 스냅샷 ===
    // "아빠의 파일들 어떤 게 있는지 확인"
    // Critical Section 시작: 부모 FD 테이블 변경 금지
    spin_lock(&oldf->file_lock);
    old_fdt = files_fdtable(oldf);  // RCU로 보호된 안전한 테이블 접근
    open_files = count_open_files(old_fdt);  // 실제 열린 파일 개수 비트맵 스캔
    
    // === 5단계: 대규모 서버 프로세스 처리 ===
    // "nginx 마스터가 10,000개 연결을 가진 상태에서 워커 fork()"
    if (open_files > NR_OPEN_DEFAULT) {
        // 임시로 락 해제: 큰 메모리 할당 중 다른 프로세스 블록 방지
        spin_unlock(&oldf->file_lock);
        
        // 동적 FD 테이블 할당 (큰 프로그램용)
        // 메모리 사용량: (열린_파일수 * 8바이트) + 비트맵들
        new_fdt = alloc_fdtable(open_files - 1);
        if (!new_fdt) {
            *errorp = -ENOMEM;
            goto out_release;  // 서버 메모리 부족: 치명적 상황!
        }
        
        // 재락: 할당 중 부모가 파일을 열거나 닫었을 수 있음
        // Race Condition 방지의 핵심 패턴
        spin_lock(&oldf->file_lock);
        old_fdt = files_fdtable(oldf);  // 업데이트된 테이블 재획득
        open_files = count_open_files(old_fdt);  // 파일 개수 재계산
    }
    
    // ⭐ 6단계: FD 비트맵 복사 (열린 파일 추적 정보)
    // open_fds: 어떤 FD가 사용 중인지, close_on_exec: exec 시 닫을 FD
    copy_fd_bitmaps(new_fdt, old_fdt, open_files);
    
    // ⭐ 7단계: 파일 포인터 배열 준비
    old_fds = old_fdt->fd;  // 부모의 파일 포인터 배열
    new_fds = new_fdt->fd;  // 자식의 파일 포인터 배열
    
    // ⭐ 8단계: 파일 포인터 복사 및 참조 카운트 증가
    // 핵심: 실제 파일은 복사하지 않고 포인터만 복사 (파일 오프셋 공유)
    for (i = open_files; i != 0; i--) {
        struct file *f = *old_fds++;  // 부모의 파일 포인터 획득
        if (f) {
            // ⭐ 참조 카운트 증가: 동일 파일을 두 프로세스가 공유
            // 실제 효과: 자식이 파일을 닫아도 부모 것은 영향 없음
            get_file(f);
        } else {
            // NULL 포인터: 비어있는 FD 슬롯 처리
            __clear_open_fd(open_files - i, new_fdt);
        }
        // RCU 보호된 포인터 할당: 동시 읽기 안전성 보장
        rcu_assign_pointer(*new_fds++, f);
    }
    spin_unlock(&oldf->file_lock);  // 부모 테이블 락 해제
    
    // ⭐ 9단계: 사용하지 않는 FD 슬롯들을 NULL로 초기화
    // 보안: 이전 프로세스의 잔여 포인터 정보 제거
    // 메모리 안전성: 초기화되지 않은 포인터로 인한 크래시 방지
    memset(&new_fds[open_files], 0, 
           (new_fdt->max_fds - open_files) * sizeof(struct file *));
           
    // ⭐ 10단계: RCU 안전한 테이블 연결 및 완료
    // "새 사무실이 준비됐다! 아이가 이제 독립적으로 파일 관리 가능"
    rcu_assign_pointer(newf->fdt, new_fdt);  // 원자적 테이블 연결
    
    // === fork() 성공 완료 ===
    // 결과: 부모/자식이 동일한 파일들을 독립적으로 관리
    // 파일 내용과 오프셋은 공유, FD 번호와 테이블은 독립적
    // 성능 영향: 파일당 8바이트 메모리 증가, CPU 오버헤드는 거의 없음
    return newf;  // 성공: 새 프로세스의 파일 관리 구조 반환

// === 에러 처리: 메모리 부족 상황 ===
out_release:
    // 할당했던 files_struct 메모리 해제
    // 실패 시나리오: 시스템 메모리 부족 또는 프로세스 한계 도달
    kmem_cache_free(files_cachep, newf);
out:
    // fork() 실패로 이어짐: 부모는 계속 실행, 자식 프로세스 생성 실패
    return NULL;  // 커널이 -ENOMEM 에러 반환
}
```

## 핵심 요점

### 1. 효율적 자원 할당

비트맵 기반 검색과 next_fd 힌트를 통해 O(1) 시간에 븈 fd를 찾을 수 있습니다.

### 2. 프로세스 간 파일 공유

fork()에서 파일 내용과 오프셋은 공유하지만, fd 테이블은 독립적으로 유지됩니다.

### 3. 동적 확장과 메모리 최적화

작은 프로그램은 정적 배열을, 큰 서버는 동적 할당을 사용하여 메모리를 효율적으로 사용합니다.

---

**이전**: [파일 디스크립터 기본 개념과 3단계 구조](./06-01-fd-basics-structure.md)  
**다음**: [파일 연산과 VFS 다형성](./06-12-file-operations-vfs.md)에서 파일 시스템별 연산 방식을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 3-5시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-06-file-io)

- [Chapter 6-1: 파일 디스크립터의 내부 구조](./06-10-file-descriptor.md)
- [Chapter 6-1A: 파일 디스크립터 기본 개념과 3단계 구조](./06-01-fd-basics-structure.md)
- [Chapter 6-1C: 파일 연산과 VFS 다형성](./06-12-file-operations-vfs.md)
- [Chapter 6-2: VFS와 파일 시스템 추상화 개요](./06-13-vfs-filesystem.md)
- [Chapter 6-2A: VFS 기본 개념과 아키텍처](./06-02-vfs-fundamentals.md)

### 🏷️ 관련 키워드

`file_descriptor`, `kernel`, `allocation`, `bitmap`, `fork`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
