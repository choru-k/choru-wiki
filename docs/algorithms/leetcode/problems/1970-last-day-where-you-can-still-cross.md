---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - Reverse-Thinking
  - Union-Find
---

# 1970. Last Day Where You Can Still Cross

## 문제

[LeetCode 1970](https://leetcode.com/problems/last-day-where-you-can-still-cross/description/) • **Medium**

## 핵심 아이디어

일단 간단하게 생각해서, 특정 시간에 start → end 로 가는게 가능한지 어떻게 알 수 있을까?

첫번째 방법은 단순하게 BFS 을 통해서 맨위에서 맨밑을 가는거고

두번째 방법은 UnionFind 을 통해서 맨위와 맨아래가 이어져 있다는 것으로 알수가 있다.

  

만약 어느 시점에 BFS 을 통해서 맨위에서 맨밑을 가는게 가능하다고 하면, 우리는 binary search 을 통해서 이러한 문제를 쉽게 풀 수 있다.

## Solution

```python
class Solution:
    def latestDayToCross(self, row: int, col: int, cells: List[List[int]]) -> int:
        MAX = 2*(10**4) + 1

        maps = [[MAX for x in range(col)] for y in range(row)]
        for day, (y, x) in enumerate(cells):
            maps[y-1][x-1] = day + 1
        
        def can_arrive_bottom_in_day(day):
            queue = collections.deque([(0, x) for x in range(col) if maps[0][x] > day])
            visited = set()
            while len(queue) > 0:
                y, x = queue.popleft()
                if (y,x) in visited:
                    continue
                visited.add((y,x))
                if y == row-1:
                    return True
                for ny, nx in (y-1,x), (y+1, x), (y, x-1), (y,x+1):
                    if 0<=ny<row and 0<=nx<col and maps[ny][nx] > day:
                        queue.append((ny,nx))
            return False
        
        l, r = 0, len(cells)+1

        while l < r:
            mid = (l+r+1) // 2
            if can_arrive_bottom_in_day(mid):
                l = mid
            else:
                r = mid-1
        return l
```

  

위에서 말한 두번째 방법인 UnionFind 을 통해서도 답을 구할 수 있다.

맨 마지막 상황에서는 start → end 가 한개로 이어져 있지 않을 것이다.

한개씩 cell 을 거슬러 올라가면서 어느순간 start → end 가 한개로 이어질 텐데, 그게 우리가 원하는 정답일 것이다.

  

```python
class UnionFind:
    def __init__(self) -> None:
        self.par = dict()
        
    def find(self, u):
        if u not in self.par:
            self.par[u] = u
        if self.par[u] != u:
            self.par[u] = self.find(self.par[u])
        return self.par[u]
    
    def union(self, u, w):
        u, w = self.find(u), self.find(w)
        if u != w:
            self.par[u] = w

class Solution:
    def latestDayToCross(self, row: int, col: int, cells: List[List[int]]) -> int:
        uf = UnionFind()
        maps = [[0 for x in range(col)] for y in range(row)]
        cells = [[y-1, x-1] for y, x in cells]
        for y, x in cells:
            maps[y][x] = 1
        
        
        START = (-1, 0) # 'start'
        END = (row, 0) # 'end'
        
        for idx, (y, x) in enumerate(cells[::-1]):
            maps[y][x] = 0
            for ny, nx in (y-1,x),(y+1,x),(y,x-1),(y,x+1):
                if 0<=ny<row and 0<=nx<col and maps[ny][nx] == 0:
                    uf.union((y, x), (ny, nx))
            if y == 0:
                uf.union(START, (y,x))
            if y == row-1:
                uf.union(END, (y,x))
            
            if uf.find(START) == uf.find(END):
                return len(cells) - idx - 1
        
        return 0
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
