---
tags:
  - LeetCode
  - Algorithm
  - Sorting
  - Work-In-Progress
---

# 324. WiggleSort

## 문제

[LeetCode 324](https://leetcode.com/problems/wiggle-sort-ii/) • **Medium**

## 핵심 아이디어

```python
class Solution:
    def wiggleSort(self, nums: List[int]) -> None:
        """
        Do not return anything, modify nums in-place instead.
        """
        
        def get(idx):
            k = idx*2+1
            # return idx
            if k < len(nums):
                return k
            return k-(len(nums)+1) if len(nums) %2 ==0 else k-len(nums)
        
        def sort(l, r, nums, pivot):
            low = mid = l
            high = r
            while mid <= high:
                if nums[get(mid)] > pivot:
                    nums[get(low)], nums[get(mid)] = nums[get(mid)], nums[get(low)]
                    low+=1
                    mid+=1
                elif nums[get(mid)] == pivot:
                    mid+=1
                else:
                    nums[get(high)], nums[get(mid)] = nums[get(mid)], nums[get(high)]
                    high-=1
                    
            return low, high
        
        def find_nth(l, r, k, nums):
            if l==r: return nums[get(l)]
            if k <= r-l:
                low, high = sort(l, r, nums, nums[get(l)])
                # print(l,r,k,low, high)
                if k > (high-l+1):
                    return find_nth(high+1, r, k-(high-l+1), nums)
                elif k < (low-l):
                    return find_nth(l, low-1, k, nums)
                return nums[get(high)]
            return float('inf')
        midean = find_nth(0, len(nums)-1, (len(nums)+1)//2, nums)
        # print(midean)
        sort(0, len(nums)-1, nums, midean)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
