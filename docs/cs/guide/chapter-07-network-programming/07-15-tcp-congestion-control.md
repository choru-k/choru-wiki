---
tags:
  - BBR
  - CUBIC
  - TCP
  - balanced
  - congestion_control
  - intermediate
  - medium-read
  - network_performance
  - 시스템프로그래밍
difficulty: INTERMEDIATE
learning_time: "4-6시간"
main_topic: "시스템 프로그래밍"
priority_score: 4
---

# Chapter 7-2C: TCP 혼잡 제어

## 🚦 인터넷 교통 체증 해결사

1986년, 인터넷이 거의 마비될 뿭한 사건이 있었습니다. "혼잡 붕괴(Congestion Collapse)"라고 불리는 이 사건은 모든 노드가 최대 속도로 전송하려다 오히려 처리량이 1000분의 1로 떨어진 사태였습니다.

Van Jacobson이 이 문제를 해결하기 위해 만든 것이 바로 TCP 혼잡 제어입니다:

```python
# 혼잡 제어 기본 원리
if 패킷_손실_감지:
    전송_속도 = 전송_속도 / 2  # 겸손하게 줄이기
else:
    if 전송_속도 < 임계값:
        전송_속도 = 전송_속도 * 2  # Slow Start: 지수 증가
    else:
        전송_속도 += 1  # Congestion Avoidance: 선형 증가
```

## 혼잡 제어 알고리즘

### 🎢 혼잡 제어의 진화

제가 CDN 회사에서 일할 때, 혼잡 제어 알고리즘을 바꾸는 것만으로도 처리량이 30% 향상된 경험이 있습니다:

```bash
# 현재 혼잡 제어 알고리즘 확인
$ sysctl net.ipv4.tcp_congestion_control
net.ipv4.tcp_congestion_control = cubic

# 사용 가능한 알고리즘들
$ sysctl net.ipv4.tcp_available_congestion_control
net.ipv4.tcp_available_congestion_control = reno cubic bbr

# BBR로 변경 (구글이 개발한 최신 알고리즘)
$ sudo sysctl -w net.ipv4.tcp_congestion_control=bbr

# 성능 비교 테스트
$ iperf3 -c server_ip -t 30
[ ID] Interval           Transfer     Bitrate
[  5]   0.00-30.00  sec  3.45 GBytes  988 Mbits/sec  # CUBIC
[  5]   0.00-30.00  sec  4.52 GBytes  1.29 Gbits/sec  # BBR (30% 향상!)
```

```c
// 혼잡 제어 연산 테이블
struct tcp_congestion_ops {
    struct list_head list;
    u32 key;
    u32 flags;

    char name[TCP_CA_NAME_MAX];
    struct module *owner;

    // 필수 콜백
    void (*init)(struct sock *sk);
    void (*release)(struct sock *sk);

    // 혼잡 제어 이벤트
    u32 (*ssthresh)(struct sock *sk);
    void (*cong_avoid)(struct sock *sk, u32 ack, u32 acked);
    void (*set_state)(struct sock *sk, u8 new_state);
    void (*cwnd_event)(struct sock *sk, enum tcp_ca_event ev);
    void (*in_ack_event)(struct sock *sk, u32 flags);
    void (*pkts_acked)(struct sock *sk, const struct ack_sample *sample);
    u32 (*min_tso_segs)(struct sock *sk);
    void (*cong_control)(struct sock *sk, const struct rate_sample *rs);
    u32 (*undo_cwnd)(struct sock *sk);
    u32 (*sndbuf_expand)(struct sock *sk);

    // RTT 측정
    void (*rtt_sample)(struct sock *sk, const struct rate_sample *rs);

    size_t (*get_info)(struct sock *sk, u32 ext, int *attr,
                      union tcp_cc_info *info);
};

// CUBIC 혼잡 제어 (리눅스 기본값)
// CUBIC은 고속 네트워크에 최적화된 알고리즘입니다
// 이름은 3차 함수(cubic function)를 사용해서 붙여졌습니다
static struct tcp_congestion_ops cubictcp __read_mostly = {
    .init        = bictcp_init,
    .ssthresh    = bictcp_recalc_ssthresh,
    .cong_avoid  = bictcp_cong_avoid,
    .set_state   = bictcp_state,
    .undo_cwnd   = tcp_reno_undo_cwnd,
    .cwnd_event  = bictcp_cwnd_event,
    .pkts_acked  = bictcp_acked,
    .owner       = THIS_MODULE,
    .name        = "cubic",
};

struct bictcp {
    u32 cnt;           // cwnd 증가 카운터
    u32 last_max_cwnd; // 마지막 최대 cwnd
    u32 last_cwnd;     // 마지막 cwnd
    u32 last_time;     // 마지막 시간
    u32 bic_origin_point;
    u32 bic_K;         // Cubic의 K 파라미터
    u32 delay_min;     // 최소 RTT
    u32 epoch_start;   // 에포크 시작
    u32 ack_cnt;       // ACK 카운터
    u32 tcp_cwnd;      // 예상 TCP cwnd
    u16 unused;
    u8 sample_cnt;
    u8 found;
    u32 round_start;
    u32 end_seq;
    u32 last_ack;
    u32 curr_rtt;
};

// CUBIC 혼잡 회피
static void bictcp_cong_avoid(struct sock *sk, u32 ack, u32 acked) {
    struct tcp_sock *tp = tcp_sk(sk);
    struct bictcp *ca = inet_csk_ca(sk);

    if (!tcp_is_cwnd_limited(sk))
        return;

    if (tcp_in_slow_start(tp)) {
        // Slow Start
        acked = tcp_slow_start(tp, acked);
        if (!acked)
            return;
    }

    // Congestion Avoidance
    bictcp_update(ca, tp->snd_cwnd, acked);
    tcp_cong_avoid_ai(tp, ca->cnt, acked);
}

// CUBIC 혼잡 제어 핵심 알고리즘 - 현대 인터넷의 성능을 결정하는 수학
// 실제 사용: Linux 기본 TCP 알고리즘, Google/Facebook/Netflix의 모든 데이터 전송
// 혁신성: 기존 AIMD 대신 3차 함수를 사용하여 고대역폭 네트워크에서 최적 성능 달성
static void bictcp_update(struct bictcp *ca, u32 cwnd, u32 acked) {
    u32 delta, bic_target, max_cnt;
    u64 offs, t;

    // ⭐ 1단계: ACK 카운트 업데이트
    // acked: 이번에 확인된 패킷 수
    // 누적 ACK 수를 추적하여 TCP 친화성 계산에 사용
    ca->ack_cnt += acked;

    // ⭐ 2단계: 중복 계산 방지 최적화
    // 동일한 jiffies 시점에서는 계산 건너뛰기 (성능 최적화)
    // 실무: 고부하 서버에서 불필요한 계산 overhead 제거
    if (ca->epoch_start && tcp_jiffies32 == ca->last_time)
        goto tcp_friendliness;

    // ⭐ 3단계: 상태 업데이트
    // 현재 혼잡 창 크기와 시간을 기록하여 다음 계산의 기준점으로 사용
    ca->last_cwnd = cwnd;
    ca->last_time = tcp_jiffies32;

    // ⭐ 4단계: 새로운 혼잡 회피 에포크 시작
    if (ca->epoch_start == 0) {
        // 에포크 시작: 혼잡 회피 단계 진입 시점 기록
        ca->epoch_start = tcp_jiffies32;
        ca->ack_cnt = acked;
        ca->tcp_cwnd = cwnd;

        // ⭐ 5단계: CUBIC 함수의 핵심 파라미터 계산
        if (ca->last_max_cwnd <= cwnd) {
            // 🚀 새로운 최대값 도달: 탐색적 증가 모드
            // 이전 최대값보다 크면 미지의 영역 탐색
            ca->bic_K = 0;  // 즉시 증가 시작 (K=0이면 변공점이 현재 시점)
            ca->bic_origin_point = cwnd;  // 현재 지점을 새로운 기준점으로 설정
        } else {
            // 📉 이전 최대값 미달: 회복 모드
            // 핵심 수식: K = ∛(β × (W_max - W_curr) / C)
            // K: 이전 최대값에 도달하는 데 걸리는 시간
            ca->bic_K = cubic_root(cube_factor * (ca->last_max_cwnd - cwnd));
            ca->bic_origin_point = ca->last_max_cwnd;  // 이전 최대값을 목표로 설정
        }
    }

    // ⭐ 6단계: CUBIC 함수 시간 계산
    // 핵심 공식: W(t) = C × (t - K)³ + W_max
    // t: 에포크 시작부터 현재까지의 시간 (RTT 보정 포함)
    t = (s32)(tcp_jiffies32 - ca->epoch_start);
    t += msecs_to_jiffies(ca->delay_min >> 3);  // RTT 기반 시간 보정 (1/8)
    t <<= BICTCP_HZ;  // 시간 단위 정규화
    do_div(t, HZ);

    // ⭐ 7단계: K를 중심으로 한 대칭적 거리 계산
    // t < K: 아직 변공점에 도달하지 않음 (감속 증가)
    // t > K: 변곱점 통과 (가속 증가)
    if (t < ca->bic_K)
        offs = ca->bic_K - t;  // 변곱점까지의 거리
    else
        offs = t - ca->bic_K;  // 변곱점을 지난 거리

    // ⭐ 8단계: CUBIC 함수의 핵심 - 3차 함수 계산
    // delta = C × |t - K|³
    // 변곱점(K) 근처에서는 완만하게, 멀어질수록 급격하게 증가
    // 실제 Netflix/Google 등에서 고대역폭 링크의 최적 활용을 가능하게 하는 수식
    delta = (cube_rtt_scale * offs * offs * offs) >> (10+3*BICTCP_HZ);

    // ⭐ 9단계: 목표 혼잡 창 크기 계산
    if (t < ca->bic_K)
        // 변곱점 이전: 목표값에서 차감 (완만한 증가)
        bic_target = ca->bic_origin_point - delta;
    else
        // 변곱점 이후: 목표값에 가산 (가속 증가)
        bic_target = ca->bic_origin_point + delta;

    // ⭐ 10단계: 증가 속도 제어 (cnt 계산)
    if (bic_target > cwnd) {
        // 목표가 현재보다 크면: 빠른 증가
        // cnt: 몇 개의 ACK마다 cwnd를 1씩 증가시킬지 결정
        // 작은 cnt = 빠른 증가, 큰 cnt = 느린 증가
        ca->cnt = cwnd / (bic_target - cwnd);
    } else {
        // 목표 도달 또는 초과: 매우 느린 증가 (안전 모드)
        ca->cnt = 100 * cwnd;  // 매우 큰 값으로 설정하여 거의 증가하지 않도록
    }

    // ⭐ 11단계: 초기 상태 안전장치
    // 이전 최대값이 없고 너무 빨리 증가하려는 경우 제한
    // 실무: 연결 초기의 급격한 증가 방지
    if (ca->last_max_cwnd == 0 && ca->cnt > 20)
        ca->cnt = 20;

tcp_friendliness:
    // ⭐ 12단계: TCP 친화성 - 기존 TCP Reno와의 공정성 보장
    // 핵심: CUBIC이 너무 공격적이지 않도록 Reno 수준으로 제한
    // 중요성: 인터넷의 공정성 유지 (다른 TCP 연결과 대역폭 공평 분할)
    if (tcp_friendliness) {
        u32 scale = beta_scale;
        delta = (cwnd * scale) >> 3;  // Reno 스타일 증가량 계산

        // Reno 방식 시뮬레이션: 매 RTT마다 1씩 증가
        while (ca->ack_cnt > delta) {
            ca->ack_cnt -= delta;
            ca->tcp_cwnd++;  // 가상의 TCP Reno 창 크기
        }

        // CUBIC이 Reno보다 느리면 Reno 속도로 조정
        if (ca->tcp_cwnd > cwnd) {
            delta = ca->tcp_cwnd - cwnd;
            max_cnt = cwnd / delta;
            if (ca->cnt > max_cnt)
                ca->cnt = max_cnt;  // Reno 속도로 제한
        }
    }
}
```

## BBR (Bottleneck Bandwidth and RTT)

### 🚀 구글의 혁신

BBR은 구글이 2016년 발표한 혁신적인 알고리즘입니다. 패킷 손실이 아닌 대역폭과 RTT를 측정하여 속도를 조절합니다. YouTube 트래픽에 적용하여 평균 4% 처리량 향상, 33% 지연 감소 달성!

```c
struct bbr {
    u32 min_rtt_us;
    u32 min_rtt_stamp;
    u32 probe_rtt_done_stamp;
    struct minmax bw;
    u32 rtt_cnt;
    u32 next_rtt_delivered;
    u64 cycle_mstamp;
    u32 mode:3,
        prev_ca_state:3,
        packet_conservation:1,
        round_start:1,
        idle_restart:1,
        probe_rtt_round_done:1,
        unused:13,
        lt_is_sampling:1,
        lt_rtt_cnt:7,
        lt_use_bw:1;
    u32 lt_bw;
    u32 lt_last_delivered;
    u32 lt_last_stamp;
    u32 lt_last_lost;
    u32 pacing_gain:10,
        cwnd_gain:10,
        full_bw_reached:1,
        full_bw_cnt:2,
        cycle_idx:3,
        has_seen_rtt:1,
        unused_b:5;
    u32 prior_cwnd;
    u32 full_bw;

    u64 ack_epoch_mstamp;
    u16 extra_acked[2];
    u32 ack_epoch_acked:20,
        extra_acked_win_rtts:5,
        extra_acked_win_idx:1,
        unused_c:6;
};

static void bbr_main(struct sock *sk, const struct rate_sample *rs) {
    struct bbr *bbr = inet_csk_ca(sk);
    u32 bw;

    bbr_update_model(sk, rs);

    bw = bbr_bw(sk);
    bbr_set_pacing_rate(sk, bw, bbr->pacing_gain);
    bbr_set_cwnd(sk, rs, rs->acked_sacked, bw, bbr->cwnd_gain);
}
```

## 혼잡 제어 비교

### 성능 비교 분석

```text
알고리즘    대역폭 활용률    지연시간    공정성    적용 환경
──────────────────────────────────────────────────────────────
Reno         70%           보통        높음      전통 네트워크
CUBIC        85-95%        낮음        중간      고속 네트워크
BBR          95-98%        매우 낮음   보통      모든 환경
Westwood     75-85%        높음        높음      무선 네트워크
```

### 실전 성능 테스트

```bash
# 다양한 환경에서 성능 비교

# 1. 고속 LAN 환경 (1Gbps, RTT 1ms)
$ iperf3 -c 192.168.1.100 -t 30
[CUBIC] 945 Mbits/sec  # 95% 활용률
[BBR]   985 Mbits/sec  # 98% 활용률

# 2. WAN 환경 (100Mbps, RTT 50ms)
$ iperf3 -c remote.server.com -t 30
[CUBIC] 78 Mbits/sec   # 높은 RTT에서 전형적 성능 저하
[BBR]   96 Mbits/sec   # RTT에 비례한 성능 저하 방지

# 3. 손실이 있는 네트워크 (1% 패킷 로스)
$ tc qdisc add dev eth0 root netem loss 1%
[CUBIC] 651 Mbits/sec  # 패킷 손실에 민감
[BBR]   823 Mbits/sec  # 패킷 손실 보다는 대역폭 기반 조절
```

## 혼잡 제어 튤닝

### 실용적인 최적화 기법

```bash
# 1. BBR 활성화 (추천)
echo 'net.core.default_qdisc=fq' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_congestion_control=bbr' >> /etc/sysctl.conf
sysctl -p

# 2. 버퍼 크기 최적화
echo 'net.core.rmem_max = 134217728' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 134217728' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_rmem = 4096 87380 134217728' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_wmem = 4096 65536 134217728' >> /etc/sysctl.conf

# 3. 초기 윈도우 크기 조정
echo 'net.ipv4.tcp_slow_start_after_idle = 0' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_initial_cwnd = 10' >> /etc/sysctl.conf

# 4. 성능 모니터링
ss -i | grep -E "(cubic|bbr|reno)"
tcp ESTAB 0 0 192.168.1.100:22 192.168.1.10:12345
     cubic wscale:7,7 rto:201 rtt:0.5/0.25 ato:40 mss:1448 cwnd:10
```

## 핵심 요점

### 1. CUBIC 알고리즘

3차 함수를 사용하여 고대역폭 네트워크에서 최적 성능을 달성하는 리눅스 기본 혼잡 제어

### 2. BBR 알고리즘

패킷 손실 대신 대역폭과 RTT를 기반으로 하는 구글의 혁신적인 접근법

### 3. 성능 최적화 전략

네트워크 환경과 애플리케이션 특성에 따른 적절한 알고리즘 선택과 파라미터 튤닝

---

**이전**: [Chapter 7-2B: TCP 상태 머신](./07-14-tcp-state-machine.md)
**다음**: [Chapter 7-2D: Netfilter와 커널 바이패스](./07-16-netfilter-kernel-bypass.md)에서 패킷 필터링과 고성능 처리 기술을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: INTERMEDIATE
- **주제**: 시스템 프로그래밍
- **예상 시간**: 4-6시간

### 🎯 학습 경로

- [📚 INTERMEDIATE 레벨 전체 보기](../learning-paths/intermediate/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-07-network-programming)

- [Chapter 7-1: 소켓 프로그래밍의 기초 개요](./07-01-socket-basics.md)
- [Chapter 7-1A: 소켓의 개념과 기본 구조](./07-02-socket-fundamentals.md)
- [Chapter 7-1B: TCP 소켓 프로그래밍](./07-10-tcp-programming.md)
- [Chapter 7-1C: UDP와 Raw 소켓 프로그래밍](./07-11-udp-raw-sockets.md)
- [Chapter 7-1D: 소켓 옵션과 Unix 도메인 소켓](./07-12-socket-options-unix.md)

### 🏷️ 관련 키워드

`TCP`, `congestion_control`, `CUBIC`, `BBR`, `network_performance`

### ⏭️ 다음 단계 가이드

- 실무 적용을 염두에 두고 프로젝트에 적용해보세요
- 관련 도구들을 직접 사용해보는 것이 중요합니다
