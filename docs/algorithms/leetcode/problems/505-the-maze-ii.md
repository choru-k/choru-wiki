---
tags:
  - LeetCode
  - Algorithm
  - Graph
---

# 505. The Maze II

## 문제

[LeetCode 505](https://leetcode.com/problems/the-maze-ii/) • **Medium**

## 핵심 아이디어

문제를 잘 생각해보자.

특정 point 에서 그 다음 point 로 갈 수 있는 곳은 정해져 있다.

즉 이 문제를 Graph 문제로 생각할 수 있다.

각 point 에서 다음 point 로 갈 수 있을 때 서로 연결 되어 있는 Node 라고 생각하면 이 문제를 단순하게 그래프가 주어졌을 때 목적지 까지의 최단 거리를 구하는 것이 된다.

  

목적지까지 최단 거리를 구하는 방법은 다익스트라를 쓰면 된다.

## Solution

```python
class Solution:
    def shortestDistance(self, maze: List[List[int]], start: List[int], destination: List[int]) -> int:
        h, w = len(maze), len(maze[0])
        def get_nxt(y, x):
            for direct in (0, -1), (0,1), (1,0), (-1,0):
                ny, nx, dis = y, x, 0
                while 0<=ny<h and 0<=nx<w and maze[ny][nx] == 0:
                    ny+=direct[0]
                    nx+=direct[1]
                    dis+=1
                yield (ny-direct[0], nx-direct[1], dis-1)
        pq = [(0, start[0], start[1])]
        visited = set()
        while len(pq) > 0:
            dis, y, x = heapq.heappop(pq)
            if (y, x) == tuple(destination):
                return dis
            if (y, x) in visited:
                continue
            visited.add((y,x))
            for ny, nx, ndis in get_nxt(y, x):
                heapq.heappush(pq, (dis+ndis, ny, nx))
        return -1
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
