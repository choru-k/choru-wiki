---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
---

# 1060. Missing Element in Sorted Array

## 문제

[LeetCode 1060](https://leetcode.com/problems/missing-element-in-sorted-array/) •**Hard**

## Brute Force

일단 가장 간단한 방법은 missing number 들을 1개씩 세어보는 것이다.

밑의 코드를 보면 숫자와 숫자사이에 missing number 들이 있기 때문에 그걸 k 에서 빼가면서 k 번째 missing number 을 찾는다.

```python
class Solution:
    def missingElement(self, nums: List[int], k: int) -> int:
        if len(nums) == 1:
            return k+nums[0]
        prev = nums[0]
        for num in nums[1:]:
            if num-prev-1 < k:
                k -= num-prev-1
            else:
                return prev+k
            prev = num
        return nums[-1] + k
```

## Binary Search

위의 방법을 보다 발전시켜 보자.

만약 `[2, 5, 8]` 배열이 있고 k=3 이라면 [2,5] 사이에는 missing 이 2개

[5,8] 사이에는 missing 이 2개 이다. 즉 우리는 [5,8] 사이에 우리가 원하는 정답이 있다고 생각할 수 있다.

missing number 의 갯수는 `(arr[-1]-arr[0]+1) - len(arr)` 로 알수 있다.

즉 배열을 오른쪽 왼쪽으로 나누고 왼쪽의 missing number 가 k 보다 작다면 우리가 찾는 값은 왼쪽에 있고, 아니면 오른쪽에 있기 때문에 binary search 을 적용가능하다.

```python
class Solution:
    def missingElement(self, nums: List[int], k: int) -> int:
        missing = (nums[-1]-nums[0]+1) - len(nums)
        if missing < k:
            return nums[-1] + (k-missing)
        
        low, high = 0, len(nums)-1
    # low+1 < high 가 포인트다.
    # nums[low], nums[high] 사이에 우리가 찾는 값이 존재한다.
        while low+1 < high:
            mid = (low+high) // 2
            if (nums[mid] - nums[low]-1) - (mid-low-1) < k:
                k -= (nums[mid] - nums[low]-1) - (mid-low-1)
                low = mid
            else:
                high = mid
            
            
        return nums[low] + k
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
