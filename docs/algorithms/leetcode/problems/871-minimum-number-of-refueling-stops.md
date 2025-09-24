---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Heap
---

# 871. Minimum Number of Refueling Stops

## 문제

[LeetCode 871](https://leetcode.com/problems/minimum-number-of-refueling-stops/) •**Hard**

## DP

단순하게 생각하면

`dp[i][cnt]=fuel` 이라는 식을 생각 할 수 있다.

이건 `stations[i]` 까지 cnt 번의 연료 보충을 통해 이동했을 때 남은 최대의 fuel 이다.

하지만 이런 방법은 너무 복잡하다.

더 좋은 방법이 있을까? 생각을 바꾸어서 i 번의 보급을 통해서 갈 수 있는 최대 거리를 생각해 보자.

즉 `dp[i] = i 번의 보급을 통해 갈 수 있는 최대거리`

여기서 중요한건 우리는 한번의 정류장에서 1번만 보급이 가능하다.

```python
class Solution:
    def minRefuelStops(self, target: int, startFuel: int, stations: List[List[int]]) -> int:
        dp = [startFuel] + [0]* len(stations)
        for i, (location, capacity) in enumerate(stations):
            for t in range(i)[::-1]:
                if dp[t] >= location:
                    dp[t+1] = max(dp[t+1], dp[t] + capacity)
                        
            
        for i, d in enumerate(dp):
            if d >= target: return i
        return -1
```

## Heap

Greedy 하게 생각하면 우리는 항상 보급을 많이 할 수 있는 정류장을 고르는게 이득이다.

그리고 가장 중요한건 우리의 연료탱크는 항상 양수 여야 한다.

```python

from heapq import heappush, heappop
class Solution:
    def minRefuelStops(self, target: int, startFuel: int, stations: List[List[int]]) -> int:
        stations.append((target, float('inf')))
        pq = []
        ans = 0
        prev_location = 0
        tank = startFuel
        for location, fuel in stations:
            tank -= location - prev_location
                
      # 양수를 유지하기 위해서 중간 stations 중 가장 좋은 station 을 선택한다.
            while len(pq) > 0 and tank < 0:
                tank += -heappop(pq)
                ans +=1
            if tank < 0: return -1
            
            prev_location = location
            heappush(pq, -fuel)
        return ans
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
