---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
---

# 1231. Divide Chocolate

## 문제

[LeetCode 1231](https://leetcode.com/problems/divide-chocolate/) • **Medium**

## 핵심 아이디어

모든 tmp 는 val 보다 커야 한다. 만약 작은 것이 존재하면 minimum 만족 x

즉 마지막 `tmp == 0`

- Tip: `l=mid` 면 `mid = (l+r+1)//2` 가 된다.

## Solution

```python
class Solution:
    def maximizeSweetness(self, sweetness: List[int], K: int) -> int:
    # check(val) == True 면 K 조각으로 됨
        # check(val) == False 면 K+1 조각 또는 그 이상으로 됨.
        # 우리가 원하는건 K+1 조각으로 나누면서 최댓값
        # check(val) == True 인 최소의 val 이 존재할 때 val-1 은 K+1 조각으로 나누면서 그러한 최댓값
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

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
