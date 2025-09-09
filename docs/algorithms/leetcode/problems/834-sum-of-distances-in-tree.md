---
tags:
  - LeetCode
  - Algorithm
  - DFS
---

# 834. Sum of Distances in Tree

## 문제

[LeetCode 834](https://leetcode.com/problems/sum-of-distances-in-tree/) • **Hard**

## 핵심 아이디어

밑의 그림을 보자. sumDist(B) 을 구하기 위해서 sumDist(A) 가 필요하다.

즉 우리는 가장 처음의 sumDist(root) 을 구해야 한다. 또한 각 subtree 의 cnt 도 구해야 한다.

이러한 과정을 dfs 을 통해서 구할 수 잇다.

  

![[Attachments/Untitled 7.png|Untitled 7.png]]

이 문제에서 가장 어려운 점은 DFS 을 2번 해야하고, reverse 을 해야한다는 것이다.

child 을 구하기 위해서 parent 의 값이 필요하면, 일단 가장 root 의 값을 DFS 1번 으로 구하고 그걸 사용해서 나머지 child 의 값을 구하자.

## Solution

```python
class Solution:
    def sumOfDistancesInTree(self, N: int, edges: List[List[int]]) -> List[int]:
        graph = collections.defaultdict(set)
        cnt = [1] * N
        dis = [0] * N
        for u,v in edges:
            graph[u].add(v)
            graph[v].add(u)
				# 여기서 sumDist(root) 와 cnt 을 구한다.
        def dfs1(node, prev):
            for nxt in graph[node]:
                if nxt == prev:
                    continue
                dfs1(nxt, node)
                cnt[node] += cnt[nxt]
                dis[node] += dis[nxt] + cnt[nxt]
        
        def dfs2(node, prev):
            for nxt in graph[node]:
                if nxt == prev:
                    continue
                dis[nxt] = dis[node] - cnt[nxt] + (N - cnt[nxt])
                dfs2(nxt, node)
        dfs1(0, -1)
        dfs2(0, -1)
        return dis
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
