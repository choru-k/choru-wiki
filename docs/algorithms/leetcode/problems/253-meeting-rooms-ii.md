---
tags:
  - LeetCode
  - Algorithm
  - Heap
---

# 253. Meeting Rooms II

## 문제

[LeetCode 253](https://leetcode.com/problems/meeting-rooms-ii/) • **Medium**

## 핵심 아이디어

Counting

## Solution

```python
class Solution:
    def minMeetingRooms(self, intervals: List[List[int]]) -> int:
        times = []
        for inter in intervals:
            times.append((inter[0],1))
            times.append((inter[1],-1))
        times.sort()
        ans = 0
        cur = 0
        for t in times:
            if t[1] >0: cur+=1
            else: cur -= 1
            ans = max(ans, cur)
        return ans
```

  

Heap

```python
from heapq import heappush, heappop
class Solution:
    def minMeetingRooms(self, intervals: List[List[int]]) -> int:
        intervals.sort()
        ans = 0
        pq = []
        for inter in intervals:
            while len(pq) >0 and pq[0] <= inter[0]:
                heappop(pq)
            heappush(pq, inter[1])
            ans = max(ans, len(pq))
        
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
