---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - Greedy
---

# 644. Maximum Average Subarray II

## 문제

[LeetCode 644](https://leetcode.com/problems/maximum-average-subarray-ii/) • **Hard**

## 핵심 아이디어

이 문제는 몇가지 조건이 있다. 그 중 가장 중요한 조건은 최소 길이가 N 이라는 것이다.

일단 가장 쉬운 방법으로 풀어보자. 그건 모든 길이에 대해서 최대 평균을 구하고, 그 최대의 최대을 사용하는 것이다.

시간 복잡도는 `O(N^2)` 가 된다.

## Solution

```python
def get_max_average(self, nums, k):
        if len(nums) < k:
            return 0.0
        max_so_far = sum_so_far = sum(nums[:k])
        for i in range(k, len(nums)):
            sum_so_far = sum_so_far + nums[i] - nums[i-k]
            max_so_far = max(max_so_far, sum_so_far)
        return float(max_so_far)/k    
    
    def findMaxAverage(self, nums, k):
        """
        :type nums: List[int]
        :type k: int
        :rtype: float
        """
        result = float('-inf')
        for x in range(k, len(nums)+1):
            result = max(result, self.get_max_average(nums, x))
        return result
```

좀더 고민해보자. 어떠한 범위에서 평균이 x 이상이라는 것은 밑의 식처럼 쓸수가 잇다.

$\sum ^j_{i=1} nums[i] / (j-i+1) > x \\ = \sum ^j_{i=1} nums[i] > (j-i+1)x \\ = \sum ^j_{i=1} (nums[i]-x) > 0$

즉 보다 쉬운 0 이상이라는 문제로 바꿀 수 있다. 이제 어떠한 범위에서 평균이 x 이상인지를 쉽게 알 수 있다.

최대 평균을 알기위해서는 binary search 을 사용할 수 있겠다. 하지만 한가지 문제가 있다. 그건 최소길이가 K 이상이여야 하는 것이다. 이 문제를 위해서 sliding window 에 어떠한 조건을 더하자.

```python
class Solution:
    def findMaxAverage(self, nums: List[int], k: int) -> float:
        def check(val):
            cur = sum(nums[:k]) - val*k
            if cur >=0 :
                return True
            prev= 0
            min_prev = 0
            for i in range(k, len(nums)):
                cur += nums[i]-val
                # 포인트. 즉 0~i-k 까지의 합을 prev 라고 하자
                # 그 경우 i~0 의 부분합들 중에서 i에서 끝나면서 길이가 K 이상인 부분합을 구할 수 있다.
                prev += nums[i-k]-val
                min_prev = min(min_prev, prev)
                if cur - min_prev >= 0:
                    return True
            return False
        lo, hi = min(nums), max(nums)
        while abs(lo-hi) > 0.1**5:
            mid = (lo + hi) / 2
            if check(mid):
                lo = mid
            else:
                hi = mid
            
        return lo
```

![[__10.svg]]

```python
class Solution:
    def findMaxAverage(self, nums: List[int], k: int) -> float:
        points= [[0,0]]
        for num in nums:
            points.append([len(points), points[-1][1] + num])
        def get_slope(i, j):
            return (points[i][1]-points[j][1]) / (points[i][0]-points[j][0])
        hull = collections.deque()
        ans = float('-inf')
        for j in range(k, len(points)):
            while len(hull) >= 2 and get_slope(hull[-2], hull[-1]) >= get_slope(hull[-1], j-k):
                hull.pop()
            hull.append(j-k)
            
            while len(hull) >= 2 and get_slope(hull[0], hull[1]) <= get_slope(hull[0], j):
                hull.popleft()
            ans = max(ans, get_slope(hull[0],j))
        return ans
```

길이 제한이 없다면.

```JavaScript
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y
    def __sub__(self, other):
        return Point(self.x - other.x, self.y - other.y)
    def __str__(self):
        return f"({self.x}, {self.y})"
    def __repr__(self):
        return f"({self.x}, {self.y})"
    @property
    def avg(self):
        return self.y / self.x
class Solution:
    def findMaxAverage(self, nums: List[int], k: int) -> float:
        def cross(p0, p1, p2):
            v1 = p1-p0
            v2 = p2-p0
            return v1.x * v2.y - v1.y * v2.x
        
        points = [(0, 0)]
        cur = 0
        for idx, num in enumerate(nums, 1):
            cur += num
            points.append((idx, cur))
        points = [Point(idx, cur) for idx, cur in points]
        
        dq = collections.deque()
        ret = points[-1].avg
        for p in points:
            if dq:
                ret = max(ret, (p - dq[-1]).avg)
            while len(dq) > 1 and cross(dq[-2], dq[-1], p) < 0:
                dq.pop()
            dq.append(p)
            
        
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
