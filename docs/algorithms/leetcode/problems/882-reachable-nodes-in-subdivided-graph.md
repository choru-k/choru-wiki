---
tags:
  - LeetCode
  - Algorithm
  - Graph
---

# 882. Reachable Nodes In Subdivided Graph

## 문제

[LeetCode 882](https://leetcode.com/problems/reachable-nodes-in-subdivided-graph/) •**Hard**

## 핵심 아이디어

이 문제를 곰곰히 생각해보자. 일단 핵심은 특정 Node 까지 최단거리로 가는게 가장 유리하다. 그 뒤에 거기서 이어지는 다른 점을 갈 수 있냐 없냐가 또 중요해진다.

특정 점까지 최단 거리로 가는 걸 구하기 위해서 일단 다익스트라를 사용한다.

다른점은 마지막에 총 몇개의 점을 지나서 갔는지만 따로 구해주면 된다.

## Solution

```python
from heapq import heappush, heappop
class Solution:
    def reachableNodes(self, edges: List[List[int]], M: int, N: int) -> int:
        connect = collections.defaultdict(dict)
        
        for v, u, dis in edges:
            connect[v][u] = dis
            connect[u][v] = dis
            
    # 일반적인 다익스트라에서는 현재까지의 거리를 기준으로 작은걸 뽑아오지만
    # 이번에는 남은 행동을 기준으로 큰걸 뽑아온다.
    # 물론 현재까지의 거리를 기준으로 문제를 풀어도 풀리지만 코드를 좀더 간결하게 하기 위해
    # 남은 행동 기준으로 만들었다.
        pq = [(-M, 0)]
        seen = collections.defaultdict(int)
        while len(pq) > 0:
            can_moves, node = heappop(pq)
            if node in seen:
                continue
            can_moves = -can_moves
            seen[node] = can_moves
            for nxt, dis in connect[node].items():
        # 총 거리 + 1(node) 만큼 행동을 사용한다.
                nxt_moves = can_moves-dis-1
        # 현재까지의 거리를 기준으로 만들때는 이 부분을 수정해주면 된다.
                if nxt_moves >= 0:
                    heappush(pq, (-nxt_moves, nxt))
                    
    # 일단 총 갈수 있는 Node 의 갯수
        ans = len(seen)
        for u, v, dis in edges:
      # u 에서 출발해서 (u, v) 사이의 길을 총 seen[u] 만큼 갈수있다. v 도 동일
      # 만약 dis 보다 크다면 그 길을 다 방문 할 수 있다.
            ans += min(seen[u]+seen[v], dis)
        return ans
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
