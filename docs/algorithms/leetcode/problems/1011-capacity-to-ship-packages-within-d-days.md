---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - Dynamic-Programming
---

# 1011. Capacity To Ship Packages Within D Days

## 문제

[LeetCode 1011](https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/) • **Hard**

## 핵심 아이디어

DP 사용하면 `O(N*D)` 가 되고 `O(N^2)` 가 되어서 Time Error

## Solution

```python
class Solution:
    def shipWithinDays(self, weights: List[int], D: int) -> int:
        memo = dict()
        def dfs(i, d):
            if i == len(weights):
                return 0
            if d == 0:
                return float('inf')
            if (i, d) not in memo:
                tmp = 0
                res = float('inf')
                for j in range(i, len(weights)):
                    tmp += weights[j]
                    res = min(res, max(tmp, dfs(j+1, d-1)))
                memo[(i,d)] = res
            return memo[(i,d)]
        return dfs(0, D)
```

```python
class Solution:
    def shipWithinDays(self, weights: List[int], D: int) -> int:
        l, r = max(weights), sum(weights)
        
        def check(val):
            cnt = 1
            tmp = 0
            for w in weights:
                if tmp + w > val:
                    tmp = 0
                    cnt += 1
                tmp += w
                
            return cnt <= D

        while l<r:
            mid = (l+r) // 2
            if check(mid):
                r = mid
            else:
                l = mid+1
        return l
```

위는 정답이 3 이라면

2 2 2 3 3 3 4 일 때 2 2 2 `3` 3 3 4 선택. binarny left

[https://leetcode.com/problems/divide-chocolate/](https://leetcode.com/problems/divide-chocolate/)

```python
class Solution:
    def maximizeSweetness(self, sweetness: List[int], K: int) -> int:
        def check(val):
            tmp = 0
            cnt = 0
            for s in sweetness:
                tmp += s
                if tmp >= val:
                    cnt+=1
                    tmp=0
            return cnt <= K
        
        l, r = 0, sum(sweetness)
        while l < r:
            mid = (l+r+1)//2
            if check(mid):
                r = mid-1
            else:
                l = mid
        return l
```

얘는

2 2 2 3 3 3 4 4 면 2 2 2 3 3 `3` 4 4 선택 binary right

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
