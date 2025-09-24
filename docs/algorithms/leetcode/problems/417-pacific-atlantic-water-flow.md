---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Reverse-Thinking
---

# 417. Pacific Atlantic Water Flow

## 문제

[LeetCode 417](https://leetcode.com/problems/pacific-atlantic-water-flow/) •**Hard**

## 핵심 아이디어

일반적인 DFS 로 풀려고 하면 안됨. 이유 무한 순환 이 일어남

보통 무한 순환이 일어나면 visited 을 이용해서 체크를 하는데 memorization 을 사용하는 경우, visited 을 사용할 수 없음

즉 memorization 을 안쓰고 해야하기 때문에 reverse thinking 을 해야됨

물이 내려오는 것을 보는게 아니라 물을 올려보내자. 이 물이 올라 갓을 때 어디 까지 갈 수 있는지 체크.

## Solution

```python
class Solution:
    def pacificAtlantic(self, matrix: List[List[int]]) -> List[List[int]]:
        if len(matrix) == 0:
            return []
        h, w = len(matrix), len(matrix[0])
        def dfs(y, x, visited):
            for ny, nx in [y-1,x],[y+1,x],[y,x-1],[y,x+1]:
                if 0<=ny<h and 0<=nx<w and (ny,nx) not in visited and matrix[y][x] <= matrix[ny][nx]:
                    visited.add((ny,nx))
                    dfs(ny, nx, visited)
        a_set = set()
        p_set = set()
        for i in range(w):
            a_set.add((0, i))
            dfs(0, i, a_set)
            p_set.add((h-1, i))
            dfs(h-1, i, p_set)
        for i in range(h):
            a_set.add((i, 0))
            dfs(i, 0, a_set)
            p_set.add((i, w-1))
            dfs(i, w-1, p_set)
        ans = []
        for y in range(h):
            for x in range(w):
                if (y,x) in a_set and (y,x) in p_set:
                    ans.append([y,x])
        return ans
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
