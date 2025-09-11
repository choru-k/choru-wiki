---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
---

# 154. Find Minimum in Rotated Sorted Array II

## 문제

[LeetCode 154](https://leetcode.com/problems/find-minimum-in-rotated-sorted-array-ii/) • **Medium**

## 핵심 아이디어

매우 고전적인 문제이다.

최악의 경우 `2222222122` 같은 경우도 있기 때문에 앞, 중간, 뒤 만 가지고는 판단이 불가능하다.

## Solution

```python
class Solution:
    def findMin(self, nums: List[int]) -> int:
        lo, hi = 0, len(nums)-1
        while lo < hi:
            mid = (lo+hi) // 2
      # mid 보다 작은 hi 가 존재하기 때문에 +1 해도 됨
            if nums[mid] > nums[hi]:
                lo = mid+1
      # mid 가 더 작기 때문에 mid 는 계속 가지고 감.
            elif nums[mid] < nums[hi]:
                hi = mid
            else:
        # duplicate 가 존재하기 때문에 이 경우에는 1개씩 체크를 해주어야 한다.
                hi-=1
        return nums[lo]
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
