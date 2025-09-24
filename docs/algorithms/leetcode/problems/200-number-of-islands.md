---
tags:
  - LeetCode
  - Algorithm
  - BFS
  - DFS
  - Union-Find
---

# 200. Number of Islands

## 문제

[LeetCode 200](https://leetcode.com/problems/number-of-islands/) •**Medium**

## 핵심 아이디어

전형적인 탐색 문제입니다. DFS 을 사용할 수도 있고, BFS 을 사용할 수도 있고, UnionFind 을 사용할 수도 있습니다.

저는 간단한게 DFS 을 사용해서 구현을 하였습니다.

시간복잡도는  `O(H*W)` 가 됩니다.

## Solution

```python
class Solution:
    def numIslands(self, grid: List[List[str]]) -> int:
        def dfs(i: int, j: int) -> None:
            if i < 0 or j < 0 or i >= N or j >= M or grid[i][j] == "0":
                return
      # 한번 탐험한 곳은 다시 탐험하지 않도록 0으로 바꾸어 줍니다.
            grid[i][j] = "0"

            positions = [(-1, 0), (0, 1), (1, 0), (0, -1)]

            for pos in positions:
                neighbor_i = i + pos[0]
                neighbor_j = j + pos[1]
        # 인접 한 곳으로 이동합니다.
                dfs(neighbor_i, neighbor_j)

        if len(grid) == 0 or len(grid[0]) == 0:
            return 0

        N, M = len(grid), len(grid[0])

        island_num = 0

        for i in range(N):
            for j in range(M):
                if grid[i][j] == "1":
          # 한번 탐색을 시작하면 그부분을 포함하는 섬 전부가 0이 됩니다.
                    island_num += 1
                    dfs(i, j)

        return island_num
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
