---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - Kth-Element
---

# 719. Find K-th Smallest Pair Distance

## 문제

[LeetCode 719](https://leetcode.com/problems/find-k-th-smallest-pair-distance/) • **Medium**

## 방법 1

sort + heap 사용

```python
from heapq import heappush, heappop

class Solution:
    def smallestDistancePair(self, nums: List[int], k: int) -> int:
        nums.sort()
        
        diffs = []
        for i in range(len(nums)-1):
            heappush(diffs, [nums[i+1] - nums[i], i, 1])
        
        while k > 0:
            k-=1
            ans, idx, d_idx = heappop(diffs)
            d_idx+=1
            if idx+d_idx < len(nums):
                heappush(diffs, [nums[idx+d_idx] - nums[idx], idx, d_idx])
        return ans
```

TLE ( k ≤ n^2) 즉 time complexity 는 O(n^2logn) 이 되서 너무 큼

처음 문제는 매우 어렵게 보인다. 하지만 nums 을 sort 하고 `matrix[i][j] = nums[i] - nums[j] (i > j)` 라는 조건을 추가해보자. 이제 2차원 배열에서 k 번째 작은 숫자를 찾는 문제로 바뀌었다. 그 뒤는 밑을 참조하면 된다.

[[Spaces/Home/PARA/Resource/Leetcode/378. Kth smallest element in a sorted Matrix]]

```python
class Solution:
    def smallestDistancePair(self, nums: List[int], k: int) -> int:
        nums = sorted(nums)
        n = len(nums)
        def check(num):
            row = 0
            col = 0
            cnt = 0
            for row in range(n):
                while col < n and nums[col] - nums[row] <= num:
                    col += 1
                cnt += col - row - 1
            return cnt
        
        start = 0
        end = nums[n-1] - nums[0]
        
        while start < end:
            mid = int((start + end) / 2)
            cnt = check(mid)
            if cnt < k:
                start = mid+1
            else:
                end = mid
            
        return start
```

이번에는 2차원 배열이 왼쪽에서 오른쪽 증가. 위에서 아래 감소 이기 때문에 살짝 check 부분의 함수를 바꾸었다. 하지만 지그재그의 기본 원리는 똑같다. 시간복잡도는 `O(nlogn + nlog(max-min))` 이 되겠다.

물론 Heap 으로도 풀수 있다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
