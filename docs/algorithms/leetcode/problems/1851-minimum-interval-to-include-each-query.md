---
tags:
  - LeetCode
  - Algorithm
  - Sorting
  - Union-Find
---

# 1851. Minimum Interval to Include Each Query

## 문제

[LeetCode 1851](https://leetcode.com/problems/minimum-interval-to-include-each-query/description/) •**Medium**

## 핵심 아이디어

일단 이 문제를 보는 순간, [https://www.geeksforgeeks.org/maximum-number-of-overlapping-intervals/](https://www.geeksforgeeks.org/maximum-number-of-overlapping-intervals/) 와 비슷한 문제라는 것을 생각 할 수 있다.

다른 점은 maximum 이 아니라, 각 query 일때를 구하는것과, 몇개가 겹치는지를 구하는지가 아니라, 겹치는 interval 중 가장 작은 것을 고르는 것이라는 점이다.

1. 각 query 일 때 구하는 것은 어떻게 할까? 이건 query 의 각 점도 한개의 point 로 간주한다면 각 query point 를 쉽게 넣어줄 수 있다.
2. 겹치는 interval 중 가장 크기가 큰 것을 어떻게 구할까? 그건 heap 에 현재 속해있는 interval 의 크기를 넣어준다면 각 시점에 가장 작은 interval 의 크기를 구할 수 있다. 하지만 heap 중간의 item 을 지우는 것이 어렵기 때문에 sortedList(Map) 을 활용한다.

## Solution

```python
from sortedcontainers import SortedList
class Solution:
    def minInterval(self, intervals: List[List[int]], queries: List[int]) -> List[int]:
        
        START = -1
        QUERY = 0
        END = 1
        
        state = []
        # 모든 interval, query 을 point 로 바꾸고 state 에 넣어준다.
        for q in queries:
            state.append((q, QUERY, None))
        for s, e in intervals:
            state.append((s, START, (s,e)))
            state.append((e, END, (s,e)))
        
        state.sort()

        q_to_ret = dict()
        sl = SortedList()
        for num, cmd, info in state:
            if cmd == START:
                dis = info[1]-info[0]+1
        # 작은 값을 구하기 위해서 dis 을 넣어주고, 삭제를 위한 key 로써 info 전체를 넣어준다. 
                sl.add((dis, info))
            elif cmd == END:
                dis = info[1]-info[0]+1
                sl.remove((dis, info))
            else:
        # 가장 작은 dis 는 sl[0][0] 가 된다.
                q_to_ret[num] = sl[0][0] if len(sl) > 0 else -1
        
        ret = []
        for q in queries:
            ret.append(q_to_ret[q])
        
        return ret
```

interval 과 query 를 각각 다른 pointer 로 따로 loop 을 돌게 만든다면 heap 으로도 처리할 수 있다.

```python
class Solution:
    def minInterval(self, intervals: List[List[int]], queries: List[int]) -> List[int]:
        intervals.sort()
        intervals = collections.deque(intervals)
        q_to_ret = dict()
        pq = []
        for q in sorted(queries):
            while intervals and intervals[0][0] <= q:
                s, e = intervals.popleft()
                if e >= q:
                    heapq.heappush(pq, (e-s+1, e))
            while pq and pq[0][1] < q:
                heapq.heappop(pq)
            
            q_to_ret[q] = pq[0][0] if pq else -1
        
        return [q_to_ret[q] for q in queries]
```

이건 꽤 놀라운 접근이다.

일단 interval 을 크기가 작은것으로 정렬한다.

만약 첫번째 interval 에 포함되는 query 라면, 무조건 정답은 해당 interval 의 크기가 된다.

이걸 반복하면 되는데, 언뜻보면 모든 interval 이 모든 query 에 포함된다면 O(n*q) 가 되지 않을까 생각할 수 있다.

하지만 그전 interval 에서 처리한 query 를 건너뛰도록 한다면 O(n + q) 가 될 수도 있을 것이다.

어떻게 앞에서 처리한 query 를 건너뛸수 있을까?

그건 unionfind 를 통한 방법이다.  

```python
class Solution:
    def minInterval(self, intervals: List[List[int]], queries: List[int]) -> List[int]:
        q = sorted(list(set(queries)))

        intervals.sort(key=lambda x: x[1]-x[0])

        q_to_ret = dict()
        nxt = list(range(len(q)+1))
        def find(u):
            if nxt[u] != u:
                nxt[u] = find(nxt[u])
            return par[u]
        
        for s, e in intervals:
            l, r = bisect.bisect_left(q, s), bisect.bisect_right(q, e)
            v = find(l)
            while v < r:
                q_to_ret[q[v]] = e-s+1
                # 이건 처리하지 않아도 되기 때문에 skip 를 하게한다.
                nxt[v] = v+1
        # find 특성상 [l,r] 구간의 모든 nxt는 r+1 을 바라볼 것이다.
                v = find(v)
        
        return [q_to_ret.get(q, -1) for q in queries]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
