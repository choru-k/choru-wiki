---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 1353. Maximum Number of Events That Can Be At

## 문제

[LeetCode 1353](https://leetcode.com/problems/maximum-number-of-events-that-can-be-attended/) • **Medium**

## 핵심 아이디어

일단 하루하루을 직접 시뮬레이션을 한다. 이때 오늘 출석을 할 이벤트는 현재 참가 가능한 이벤트중, 가장 끝나는 날이 빠른 걸 고른다.

가장 끝나는 날이 빠른걸 고르기 위해서 우리는 힙을 사용했다.

또한 매일매일 새로 참가 가능한 이벤트가 존재하면 그 이벤트를 힙에 넣고, 만약 이벤트를 더 이상 참가하지 못할 경우, 힙에서 뺀다.

## Solution

```python
class Solution:
    def maxEvents(self, events: List[List[int]]) -> int:
        events.sort()
        events = collections.deque(events)
        pq = []
        d = events[0][0]
        ans = 0
        while len(events) > 0 or len(pq) > 0:
            while len(pq) > 0 and pq[0]< d:
                heapq.heappop(pq)
            while len(events) > 0 and events[0][0] <= d:
                heapq.heappush(pq, events[0][1])
                events.popleft()
            if len(pq) > 0:
                ans += 1
                heapq.heappop(pq)                
            d +=1
        return ans
```

  

위의 코드는 모든 날짜를 시뮬레이션 하기 때문에 보다 최적화를 하였다.

만약 현재 참가가능한 이벤트가 없다면, 참가가능한 이벤트가 존재하는 가장 첫날로 날짜를 점프시켜서 보다 최적화를 하였다.

```python
class Solution:
    def maxEvents(self, events: List[List[int]]) -> int:
        events.sort()
        events = collections.deque(events)
        pq = []
        d = events[0][0]
        ans = 0
        while len(events) > 0 or len(pq) > 0:
            while len(pq) > 0 and pq[0]< d:
                heapq.heappop(pq)
            if len(pq) == 0 and len(events) > 0:
                d = events[0][0]
            while len(events) > 0 and events[0][0] <= d:
                heapq.heappush(pq, events[0][1])
                events.popleft()
            if len(pq) > 0:
                ans += 1
                heapq.heappop(pq)                
            d +=1
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
