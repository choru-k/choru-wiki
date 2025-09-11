---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 1590. Make Sum Divisible by P

## 문제

[LeetCode 1590](https://leetcode.com/problems/make-sum-divisible-by-p/) • **Medium**

## 핵심 아이디어

일단 필요한 값을 찾는다

전체 합을 p 로 나눈 나머지가 우리가 원하는 target 이 된다.

이제 합이 target 이 되는 sub-array 중에서 길이가 제일 짧은 sub-array 을 찾으면 된다.

문제를 조금 쉽게 생각해서 합이 target 이 되는 sub-array 는 어떻게 구할지 부터 생각한다.

이건 이미 여러번 해봣을 것이다.

이걸 조금 더 생각해보자.

예를 들어서 target 이 3이고, 현재까지의 합의 나머지가 5 라면, 합이 2가 되는 가장 지점을 빼면 된다.

즉 `(current_sum)_idx - (current_sum-target)_idx` 가 될것이다.

만약 현재까지의 합이 1이라면, 합이 3 이 되는 지점을 찾으면 된다.

이걸 구현한게 밑이다.

## Solution

```python
class Solution:
    def minSubarray(self, nums: List[int], p: int) -> int:
        target = 0
        for num in nums:
            target = (target + num) % p
        if target == 0:
            return 0
        # Find a shortest sub-array which of sum is target.
        
        dp = dict()
        dp[0] = -1
        cur = 0
        ret = inf
        for idx, num in enumerate(nums):
            cur = (cur + num) % p
            if (cur-target + p) % p in dp:
                ret = min(ret, idx - dp[(cur-target + p) % p])
            dp[cur] = idx
        if ret == len(nums):
            return -1
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
