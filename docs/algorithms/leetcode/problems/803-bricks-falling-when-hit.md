---
tags:
  - LeetCode
  - Algorithm
  - BFS
  - Reverse-Thinking
  - Work-In-Progress
---

# 803. Bricks Falling When Hit

## 문제

[LeetCode 803](https://leetcode.com/problems/bricks-falling-when-hit/) •**Hard**

## 핵심 아이디어

일단 가장 쉽게 푸는 법을 생각해보자.

단순하게 한번 입력을 받으면 2부분 으로 나뉠 것이고 각각을 DFS 등으로 탐색해서 한쪽은 위에 붙어있고 한쪽은 안 붙어 있다면 안붙어 있는 쪽의 크기를 반환해주면 된다.

한번 자를 때 마다 최악의 경우 `O(W*H)` 의 시간 복잡도를 갖고 총 `N` 만큼 반복한다고 할 때, 시간 복잡도는 `O(W*H*N)` 이 된다.

곰곰히 생각해보자. 우리가 잘릴 때 마다 모든 맵을 탐색해야 하는 이유가 무엇일까? 그건 잘린 부분의 크기를 모르고 위에 붙어있는지 아닌지를 모르기 때문이다.

일단 붙어 있는지 아닌지를 쉽게 아는 방법이 있을까? 맨 마지막까지 위에 붙어있는 조각이 있다면 어느 시점이든 이 조각과 붙어 있다면 그 조각은 현재는 붙어 있다고 생각 할 수 있다.

중요한건 뒤에서 부터 생각 한다는 것이다. `grid[y][x]` 가 -1 이면 붙어 있다고 할 수 있다.

## Solution

```python
class Solution:
    def hitBricks(self, grid: List[List[int]], hits: List[List[int]]) -> List[int]:        
        h, w = len(grid), len(grid[0])
        def getNeighbor(y,x):
            return filter(lambda p: 0<=p[0]<h and 0<=p[1]<w, [(y-1, x), (y+1, x), (y, x-1), (y, x+1)])
        
        def connectedRoot(y,x):
            if y == 0: return True
            return any([grid[a][b] == -1 for a, b in getNeighbor(y,x)])
        

# BFS 는 DFS 로 변경 가능하다. 
        def bfs(y,x):
            queue = collections.deque()
            queue.append([y,x])
            
            if connectedRoot(y,x) == False:
                return 0
            
            val = 0
            grid[y][x]=-1
            while len(queue)>0:
                y,x = queue.pop()
                
                for [new_y, new_x] in getNeighbor(y,x):
                    if grid[new_y][new_x] == 1:
                        val+=1
                        grid[new_y][new_x] = -1
                        queue.append([new_y, new_x])
            return val
            
        for hit in hits:
            y, x = hit
            if grid[y][x] == 1 : grid[y][x] = 2 
        for x in range(w):
            if grid[0][x] == 1:
                bfs(0, x)
        ans = []
# 뒤에서 부터 차근차근 복구한다.
        for hit in hits[::-1]:
            y,x = hit
            if grid[y][x] == 2:
                grid[y][x] = 1
                ans.append(bfs(y,x))
            else:
                ans.append(0)
        return ans[::-1]
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
