---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 368. Largest Divisible Subset

## 문제

[LeetCode 368](https://leetcode.com/problems/largest-divisible-subset/description/?envType=list&envId=xfgt7zgc) • **Medium**

## 핵심 아이디어

두가지 방법으로 문제를 풀 수 있다.

일단 기본적인 방법은 DP 를 사용한다는 점이다.

## Solution

```python
class Solution:
    def largestDivisibleSubset(self, nums: List[int]) -> List[int]:
        nums.sort()

        memo = dict()
        for idx, num in enumerate(nums):
            # memo 의 value 는 (num 으로 끝나는 수열의 최대 길이, 그 수열를 어떻게 만들었는지)
            memo[num] = (0, -1)
            for prev in nums[:idx]:
                if num % prev == 0:
                    memo[num] = max(memo[num], (memo[prev][0]+1, prev))
        ret = []
        cur = max(memo.keys(), key=lambda k: memo[k][0])
        while cur != -1:
            ret.append(cur)
            cur = memo[cur][1]
        
        return ret

```

이 방법의 시간 복잡도는 `O(nlogn) + O(n^2)` 가 된다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
