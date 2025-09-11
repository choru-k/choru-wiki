---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 2742. Painting the Walls

## 문제

[LeetCode 2742](https://leetcode.com/problems/painting-the-walls/description/) • **Medium**

## 핵심 아이디어

간단한 0/1 knapsack 문제이다.

우리가 i 번째 페인트를 칠한다면 i 번째의 time + 1 만큼의 free painter 을 사용할 수 있다.

단순한게 보면 cost 길이가 500, time 크기가 500 이니 `500*500` 만큼 time 의 가짓수가 나오나? 라고 생각할 수 있지만 그러지 않는다.

time 은 1씩 빠지기 때문에 최소 -500 까지만 갈 수 있고, 또한 500 이 넘어가면 나머지에 대해서는 바로 0 을 return 할 수 있다.

즉 `-n <= dp time <= n` 을 만족한다고 알 수 있다. 그래서 간단하게 dp 을 할 수 있다.

## Solution

```python
class Solution:
    def paintWalls(self, cost: List[int], time: List[int]) -> int:
        cur = []

        # -n <= remain_time <= n
        # 
        @functools.cache
        def dfs(remain_time, idx) -> float|int:
            if idx == len(cost):
                return 0 if remain_time >= 0 else float('inf')
            remain_painter = len(cost) - idx
      # 나머지를 전부다 공짜로 칠할 수 있다.
            if remain_painter <= remain_time:
                return 0
            
            ret = min(
                dfs(remain_time-1, idx+1),
                dfs(remain_time+time[idx], idx+1) + cost[idx]
            )
            return ret
        
        return dfs(0, 0)
```

```python
class Solution:
    def paintWalls(self, cost: List[int], time: List[int]) -> int:
        n = len(cost)
        dp = [float('inf')] * (n + 1)
        dp[0] = 0

        for i in range(n):
            for j in range(n, 0, -1):
                dp[j] = min(dp[j], dp[max(j - time[i] - 1, 0)] + cost[i])
        return dp[n]
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
