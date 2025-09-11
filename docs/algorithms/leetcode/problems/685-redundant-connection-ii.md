---
tags:
  - LeetCode
  - Algorithm
  - Union-Find
---

# 685. Redundant Connection II

## 문제

[LeetCode 685](https://leetcode.com/problems/redundant-connection-ii/) • **Hard**

## 핵심 아이디어

이 문제를 정답의 경우를 찾아서 풀어야 한다.

정답은 총 3가지의 경우의 수를 가지고 있다.

1. 1개의 노드가 2명의 parent 을 가지고 있다.
2. cycle 이 존재한다.
3. cycle 이 존재하고 2명의 parent 가 존재한다.

일단 우리는 1개의 노드가 2명의 parent 을 가지고 있는지를 확인한다.

만약 2명의 parent 을 가지고 있다면 그 2개의 edge 가 정답의 후보가 된다.

그 뒤 cycle 이 존재하는지 확인을 한다. 이때 정답 후보 중 1개를 사용하지 않기로 한다.

cycle 이 존재하는지는 Union-Find 을 통해서 쉽게 알아 낼수 있다.

물론 DFS 등을 통해서도 쉽게 알 수 있다.

만약 cycle 이 존재한다면 이번에 사용한 정답 후보가 정답이 된다.

또는 cycle 을 만든 edge 가 정답이 된다.

만약 cycle 이 없을 경우 아까 제껴놓은 정답 후보가 정답이 된다.

## Solution

```python
class UnionFind:
    def __init__(self, size):
        self.par = [i for i in range(size+1)]
    
    def union(self, s, e):
        s = self.find(s)
        e = self.find(e)
        
        if s != e:
            self.par[s] = self.par[e]
            return True
        else:
            # this is cycle
            return False
        
        
    def find(self, a):
        if self.par[a] != a:
            self.par[a] = self.find(self.par[a])
        return self.par[a]

class Solution:
    def findRedundantDirectedConnection(self, edges: List[List[int]]) -> List[int]:
        can1, can2 = None, None
        pointToNode = {}
        
        for edge in edges:
            if edge[1] in pointToNode:
                can1, can2 = pointToNode[edge[1]], edge
                break
            pointToNode[edge[1]] = edge
        unionFind = UnionFind(len(edges))
        ans = []
        for [s, e] in edges:
            if [s, e] == can2: continue
            if unionFind.union(s,e) == False:
                if can1 is not None:
                    return can1
                else:
                    return [s, e]
        
        return can2
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
