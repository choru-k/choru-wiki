---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Work-In-Progress
---

# 321. Create Maximum Number

## 문제

[LeetCode 321](https://leetcode.com/problems/create-maximum-number/) • **Medium**

## 핵심 아이디어

DP 을 사용할 경우 Time Exceed

## Solution

```python
class Solution:
    def maxNumber(self, nums1: List[int], nums2: List[int], k: int) -> List[int]:
        # (k, idx_1, idx_2)
        
        length_1 = len(nums1)
        length_2 = len(nums2)
        cache = {}
        
        def check_max(num1, num2):
            if num1 != None and num2 != None:
                return max(num1, num2)
            if num1 == None and num2 == None:
                return None
            if num1 == None:
                return num2
            if num2 == None:
                return num1
        
        def dfs(k, idx_1, idx_2):
            if (k, idx_1, idx_2) in cache:
                return cache[(k, idx_1, idx_2)]
            if k == 0:
                return 0
            if length_1 <= idx_1 and length_2 <= idx_2:
                return None
            if length_1 <= idx_1:
                cache[(k, idx_1, idx_2)] =  check_max(nums2[idx_2] * pow(10, k-1) + dfs(k-1, idx_1, idx_2+1) if dfs(k-1, idx_1, idx_2+1) != None else None, dfs(k, idx_1, idx_2+1))
            elif length_2 <= idx_2:
                cache[(k, idx_1, idx_2)] =  check_max(nums1[idx_1] * pow(10, k-1) + dfs(k-1, idx_1+1, idx_2) if dfs(k-1, idx_1+1, idx_2) != None else None, dfs(k, idx_1+1, idx_2))
            else:
                cache[(k, idx_1, idx_2)] = check_max(
                check_max(
                    nums1[idx_1] * pow(10, k-1) + dfs(k-1, idx_1+1, idx_2) if dfs(k-1, idx_1+1, idx_2) != None else None,
                    dfs(k, idx_1+1, idx_2)),
                check_max(
                    nums2[idx_2] * pow(10, k-1) + dfs(k-1, idx_1, idx_2+1) if dfs(k-1, idx_1, idx_2+1) != None else None,
                    dfs(k, idx_1, idx_2+1))
                )
            return cache[(k, idx_1, idx_2)]
        
        
        dfs(k, 0, 0)
        # print(cache)
        
        return list(map(int, list(str(cache[(k, 0, 0)]))))
```

  

이러 문제의 가장 중요한 점은 뒤의 숫자에 필요없이 앞의 숫자가 가장 큰게 제일 중요하다는 것이다.

```python
class Solution:
    def maxNumber(self, nums1: List[int], nums2: List[int], k: int) -> List[int]:
        def makeArr(nums, k):
            drop = len(nums) - k
            out = []
            for num in nums:
                while drop and out and out[-1] < num:
                    out.pop()
                    drop -= 1
                out.append(num)
            return out[:k]
        def merge(a, b):
            return [max(a, b).pop(0) for _ in a+b]
        ans = []
        ans_value = 0
        def toInt(arr):
            val = 0
            for num in arr:
                val *= 10
                val += num
            return val
        for i in range(k+1):
            j = k-i
            if i <= len(nums1) and j <= len(nums2):
                res1 = makeArr(nums1, i)
                res2 = makeArr(nums2, j)
                print(i,j,res1, res2)
                arr = merge(res1, res2)
                val = toInt(arr)
                if ans_value < val:
                    ans = arr
                    ans_value = val
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
