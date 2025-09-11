---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Dynamic-Programming
---

# 361. Bomb Enemy

## 문제

[LeetCode 361](https://leetcode.com/problems/bomb-enemy/) • **Medium**

일단 가장 간단하게 푸는 법은 각 격자에서 실제로 해보는 것이다.

그 경우 `O(N^3)` 의 시간 복잡도를 갖는다.

하지만 곰곰히 생각해보면

![[Attachments/E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202 3.svg|E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202 3.svg]]

벽을 만나기 전까지의 x 방향의 값은 모두 같고, y 방향도 그렇다.

그렇다면 어떻게 이러한 값을 어떻게 구할 수 잇을까?

## DFS

```python
class Solution:
    def maxKilledEnemies(self, grid: List[List[str]]) -> int:
        if len(grid) == 0:
            return 0
        h, w = len(grid), len(grid[0])
        
        row_memo = [[-1 for _ in range(w)] for _ in range(h)]
        col_memo = [[-1 for _ in range(w)] for _ in range(h)]
        def row_dfs(y, x, cur):
            if x == w or y == h:
                return cur
            if row_memo[y][x] == -1:
                if grid[y][x] == 'W':
                    row_memo[y][x] = cur
                elif grid[y][x] == 'E':
                    row_memo[y][x] = row_dfs(y, x+1, cur+1)
                else:
                    row_memo[y][x] = row_dfs(y, x+1, cur)
            return row_memo[y][x]
            
        
        def col_dfs(y, x, cur):
            if x == w or y == h:
                return cur
            if col_memo[y][x] == -1:
                if grid[y][x] == 'W':
                    col_memo[y][x] = cur
                elif grid[y][x] == 'E':
                    col_memo[y][x] = col_dfs(y+1, x, cur+1)
                else:
                    col_memo[y][x] = col_dfs(y+1, x, cur)
            return col_memo[y][x]
        
        ans = 0
        for y in range(h):
            for x in range(w):
                r, c= row_dfs(y, x, 0), col_dfs(y, x, 0)
                
                if grid[y][x] == '0':
                    ans = max(ans,  r+ c)
                
        # print(row_memo)
        # print(col_memo)
        return ans
```

## left → right, right → left

```python
class Solution:
    def maxKilledEnemies(self, grid: List[List[str]]) -> int:
        if len(grid) == 0:
            return 0
        h, w = len(grid), len(grid[0])
        
        row_memo = [[0 for _ in range(w)] for _ in range(h)]
        col_memo = [[0 for _ in range(w)] for _ in range(h)]
        
        for y in range(h):
            cur = 0
            for x in range(w):
                if grid[y][x] == 'E':
                    cur += 1
                if grid[y][x] == 'W':
                    cur = 0
                row_memo[y][x] += cur
            cur=0
            for x in range(w)[::-1]:
                if grid[y][x] == 'E':
                    cur += 1
                if grid[y][x] == 'W':
                    cur = 0
                row_memo[y][x] += cur
            
        for x in range(w):
            cur = 0
            for y in range(h):
                if grid[y][x] == 'E':
                    cur += 1
                if grid[y][x] == 'W':
                    cur = 0
                col_memo[y][x] += cur
            cur=0
            for y in range(h)[::-1]:
                if grid[y][x] == 'E':
                    cur += 1
                if grid[y][x] == 'W':
                    cur = 0
                col_memo[y][x] += cur
        ans=0
        for y in range(h):
            for x in range(w):
                if grid[y][x] == '0':
                    ans = max(ans, row_memo[y][x] + col_memo[y][x])
        # print(row_memo)
        # print(col_memo)
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
