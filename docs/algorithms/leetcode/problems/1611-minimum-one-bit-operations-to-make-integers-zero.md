---
tags:
  - Algorithm
  - LeetCode
---

# 1611. Minimum One Bit Operations to Make Integers Zero

## 문제

[LeetCode 1611](https://leetcode.com/problems/minimum-one-bit-operations-to-make-integers-zero/) •**Medium**

## 핵심 아이디어

일단 문제를 확실하게 해보자.

- 가장 오른쪽에 있는 숫자를 바꿀수 있다.
- 만약 i-1, i-2 번째 숫자가 각각 0, 1 이면 i 번째의 숫자를 바꿀 수 있다.

이 두 조건으로 특정숫자를 0으로 만들어야 한다.

일단 이 조건들을 잘 읽어보면 1→0, 0→1 둘다 가능하다.

즉 이 변화는 가역성이 존재한다.

즉 숫자 xxxxxx 에서 yyyyyy 로 변화시킨다고 할 때 필요한 조작의 수는 yyyyyy→xxxxxx 의 조작수와 같다.

바로 이해가 안간다면 각 숫자를 노드로 생각하고 변화를 edge로 생각해서 그래프를 생각해보자.

그래프가 양방향이기 때문에 최적의 경로는 같다.

이제 다음 규칙을 생각해보자.

1000000 을 0으로 바꾸기 위해서는

1000000 → 1100000 → 0100000 → 0000000

으로 변환해야 한다.

즉 000000 → 100000, 100000 → 000000 의 작업 + 1 이 필요하다.

이 작업을 `bto0(k)` 라고 할때, `bto0(k) = 2*bto0(k-1)+1` 가 된다.

즉 `bto0(k) = 2^(k+1)-1` 이 된다.

여기서 재밋는 점은 길이가 k 인 100000 을 00000 으로 바꾸는데 필요한 조작의 수가 `2^k-1` 이 된다는 점이다. 이 변환에서 모든 수를 한번씩 지난다는 이야기가 된다.

즉 숫자 64(1000000)을 0으로 만들 때, 1~127 을 한번씩 지난다는 이야기가 된다.

10000 → xxxxx → 0

의 과정을 거치는 중간이 된다.

만약 xxxxx 가 10110 이면

0000 → 0110 으로 바꾸는 작업이 필요한데, 이건 위에서 알아본 가역성에 의해서

110 → 000 으로 바꾸는 작업과 똑같다.

즉 재귀를 통해서 구하면 된다.

## Solution

```python
class Solution:
    def minimumOneBitOperations(self, n: int) -> int:
        @functools.lru_cache(None)
        # change 2^b into 0
        def bto0(b): return (1<<b+1) - 1

        @functools.lru_cache(None)
        # change integer n into 0
        def nto0(n):
            if n == 0: return 0
            b1 = int(log2(n))
            return bto0(b1) - nto0(n - (1<<b1))
        return nto0(n)
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
