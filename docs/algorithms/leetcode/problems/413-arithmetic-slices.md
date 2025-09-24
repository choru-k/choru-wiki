---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 413. Arithmetic Slices

## 문제

[LeetCode 413](https://leetcode.com/problems/find-right-interval/description/) •**Hard**

## 핵심 아이디어

```python
class Solution:
    def numberOfArithmeticSlices(self, nums: List[int]) -> int:
        cnt = 0
        prv = 0
        for i in range(2, len(nums)):
            if nums[i] - nums[i-1] == nums[i-1] - nums[i-2]:
                cur = prv + 1
            else:
                cur = 0
            cnt += cur
            prv = cur
        return cnt
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
