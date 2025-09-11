---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 665. Non-decreasing Array

## 문제

[LeetCode 665](https://leetcode.com/problems/non-decreasing-array/) • **Hard**

## 핵심 아이디어

일단 1번도 허용하지 않는다는 조건으로 문제를 생각해보자.
그렇다면 아래의 조건으로 문제를 풀린다.

## Solution

```python
for idx in range(len(nums)-1):
 if nums[idx] > nums[idx+1]:
  return False
```

이제 1개만 허용한다는 조건을 생각해보자.

```python

class Solution:
    def checkPossibility(self, nums: List[int]) -> bool:
        nums = [float('-inf')] + nums + [float('inf')]
        p = -1
        for idx in range(len(nums)-1):
            if nums[idx] > nums[idx+1]:
          # 두번이러면 False
                if p != -1:
                    return False
             # 한번은 봐줌
                p = idx
                
  # 1번도 없거나
  # nums[p] 를 바꾸면 문제가 없거나
  # nums[p+1] 를 바꾸면 문제가 없거나
  
        return p == -1 or nums[p-1] <= nums[p+1] or nums[p] <= nums[p+2]
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
