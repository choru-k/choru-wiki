---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 1751. Maximum Number of Events That Can Be Attended II

## 문제

[LeetCode 1751](https://leetcode.com/problems/maximum-number-of-events-that-can-be-attended-ii/description/) • **Medium**

## 핵심 아이디어

간단한 knapsack problem 이다.

  

다만 한가지 조건이 들어간다.

같은 캘린더는 들을수 없다.

A 를 듣는다고 할 때, 들을 수 없는 B,C,D 를 빨리 무시하기 위해서 binary-search 을 이용할 수 있다.

## Solution

```python
class Solution:
    def maxValue(self, events: List[List[int]], k: int) -> int:
        events.sort()
        @functools.cache
        def dfs(event_idx, remain_k):
            if remain_k == 0:
                return 0
            if event_idx == len(events):
                return 0
            s, e, v = events[event_idx]
            nxt_event_id = bisect.bisect_left(events, [e+1, 0, 0])
            ret = max(
                dfs(event_idx+1, remain_k),
                v + dfs(nxt_event_id, remain_k-1)
            )
            return ret
        
        return dfs(0, k)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
