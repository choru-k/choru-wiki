---
tags:
  - LeetCode
  - Algorithm
  - Heap
  - Work-In-Progress
---

# 632. Smallest Range Covering Elements from K Lists

## 문제

[LeetCode 632](https://leetcode.com/problems/smallest-range-covering-elements-from-k-lists/) •**Hard**

## 핵심 아이디어

문제가 정말 깔끔.

기본 문제: [https://leetcode.com/problems/merge-k-sorted-lists/](https://leetcode.com/problems/merge-k-sorted-lists/)

색깔 칠하기

## Solution

```python
from heapq import heappush, heappop
class Solution:
    def smallestRange(self, nums: List[List[int]]) -> List[int]:
        queue = collections.deque()
        heap = []
        check_arr = []
        check = len(nums)
        ans = None
        
        for idx, lis in enumerate(nums):
            heappush(heap, [lis[0], idx, 0])
            check_arr.append(1)
        
        while len(heap) > 0:
            num, lis_num, idx = heappop(heap)
            lis = nums[lis_num]
            if len(lis) > idx+1:
                heappush(heap, [lis[idx+1], lis_num, idx+1])
            queue.append([num, lis_num])
            check_arr[lis_num] -= 1
            if check_arr[lis_num] == 0:
                check -= 1
                
            while check == 0:
                
                if ans == None or (ans[1]-ans[0]) > (queue[-1][0] - queue[0][0]):
                    ans = [queue[0][0], queue[-1][0]]
                _, lis_num = queue.popleft()
                check_arr[lis_num] += 1
                if check_arr[lis_num] == 1:
                    check += 1
        return ans
```

```python
from heapq import heappush, heappop

class Solution:
    def smallestRange(self, nums: List[List[int]]) -> List[int]:
        pq = []
        max_val = 0
        for lis in nums:
            heappush(pq, (lis[0], 0, lis))
            max_val = max(max_val, lis[0])
            
            
        ans = None
        while True:
            val, idx, lis = heappop(pq)
            if ans == None or ans[1] - ans[0] > max_val - val:
                ans = [val, max_val]
            
            if len(lis) == idx+1:
                return ans
            heappush(pq, (lis[idx+1], idx+1, lis))
            max_val = max(max_val, lis[idx+1])
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
