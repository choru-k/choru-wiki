---
tags:
  - LeetCode
  - Algorithm
  - Graph
  - Union-Find
---

# 1168. Optimize Water Distribution in a Village

## 문제

[LeetCode 1168](https://leetcode.com/problems/optimize-water-distribution-in-a-village/) • **Medium**

## 핵심 아이디어

최소 스패닝 트리 문제이다

모든 물은 한곳에서 시작되고 그걸 -1 이라고 할 경우

-1 에서 부터 집까지의 pipe 가 우물을 설치하는 것이 된다.

  

전체 Edge 에서 짧은 걸 뽑아내는 경우 (Kruskal MST)

O(ElogE)

## Solution

```python
from heapq import heappush, heappop
class Solution:
    def minCostToSupplyWater(self, n: int, wells: List[int], pipes: List[List[int]]) -> int:
        par = [i for i in range(n+1)]
        def find(x):
            if par[x] != x:
                par[x] = find(par[x])
            return par[x]
        w = [[c, 0, i+1] for i, c in enumerate(wells)]
        p = [[c, i, j] for i, j, c in pipes]
        
        ans = 0
        for c, x, y in sorted(w + p):
            x, y = find(x), find(y)
            if x != y:
                par[x] = y
                ans += c
        return ans
```

  

현재 연결된 Edge 사이에서 짧은걸 뽑아내는 경우 (Prim MST)

O(V^2)

```python
from heapq import heappush, heappop
class Solution:
    def minCostToSupplyWater(self, n: int, wells: List[int], pipes: List[List[int]]) -> int:
        graph = collections.defaultdict(lambda: collections.defaultdict(lambda: float('inf')))
        edges = []
        for i in range(n):
            graph[0][i+1] = wells[i]
            heappush(edges, (wells[i], i+1))
        for u, v, w in pipes:
            graph[u][v] = min(w, graph[u][v])
            graph[v][u] = min(w, graph[v][u])
        
        ans = 0
        visited = {0}
        while len(edges) > 0 and len(visited) < n+1:
            w, node = heappop(edges)
            if node not in visited:
                visited.add(node)
                ans += w
                for nxt, cost in graph[node].items():
                    if nxt not in visited:
                        heappush(edges, (cost, nxt))
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
