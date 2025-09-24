---
tags:
  - LeetCode
  - Algorithm
  - BFS
---

# 1293. Shortest Path in a Grid with Obstacles Elimination

## 문제

[LeetCode 1293](https://leetcode.com/problems/shortest-path-in-a-grid-with-obstacles-elimination/) •**Medium**

## 핵심 아이디어

일단 DP 을 사용해야 한다는 걸 알 수가 있다. 물론 BFS 을 사용하지 않고 할 수도 있지만 최소 길이를 구할 때는 BFS 을 사용 하는게 좋다.

`memo[(y,x,d)] = y, x, d 까지 올 때 최소의 l` 으로 정의하자.

만약 벽을 부셔서 가야한다면 벽을 부셔서 가고, 내가 지금까지 부순 벽이 k 보다 크면 무시한다.

시간복잡도는 `O(H*W*K)` 가 되고, 공간복잡도도 같다.

## Solution

```python
class Solution:
    def shortestPath(self, grid: List[List[int]], k: int) -> int:
        h, w = len(grid), len(grid[0])
    # memo[(y,x,d)] y, x, d 까지 올 때 최소의 l
        memo = set()
        queue = collections.deque([(0,0,0,0)])
        
        ans = float('inf')
        while len(queue) > 0:
            y, x, d, l = queue.popleft()
            if (y,x,d) in memo or d > k:
                continue
      # BFS 이기 때문에 l 이 항상 최소의 l
            memo.add((y,x,d))
            
            if y==h-1 and x==w-1 and ans >l:
                ans = l
            for ny, nx in [y+1,x],[y-1,x],[y,x+1],[y,x-1]:
                if 0<=ny<h and 0<=nx<w:
                    queue.append((ny, nx, d + grid[ny][nx], l+1))
                    
        
        return ans if ans != float('inf') else -1
```

만약 벽을 충분히 많이 부실수 있다면 그냥 직선거리가 최소의 거리가 된다.

최악의 경우의 시간복잡도는 같다.

```python
class Solution:
    def shortestPath(self, grid: List[List[int]], k: int) -> int:
        h, w = len(grid), len(grid[0])
    # 이부분 추가.
        if h + w - 2 <= k:
            return h + w - 2
        memo = set()
        queue = collections.deque([(0,0,0,0)])
        
        ans = float('inf')
        while len(queue) > 0:
            y, x, d, l = queue.popleft()
            if (y,x,d) in memo or d > k:
                continue

            memo.add((y,x,d))
            
            if y==h-1 and x==w-1 and ans >l:
                ans = l
            for ny, nx in [y+1,x],[y-1,x],[y,x+1],[y,x-1]:
                if 0<=ny<h and 0<=nx<w:
                    queue.append((ny, nx, d + grid[ny][nx], l+1))
                    
        
        return ans if ans != float('inf') else -1
```

조금 더 생각해보면 만약 특정 점 (y,x) 까지 갈 때 벽을 더 많이 부시고 왔다면 우리는 그걸 무시해도 된다. 어차피 queue 이기 때문에 l 이 더 크다. 즉 l 도 크고, d도 더 크면 우리는 그걸 무시해도 된다.

최악의 경우의 시간복잡도는 같다.

```python
class Solution:
    def shortestPath(self, grid: List[List[int]], k: int) -> int:
        h, w = len(grid), len(grid[0])
        if h + w - 2 <= k:
            return h + w - 2
        memo = set()
        memo_d = dict() # (y,x) 까지 갈 때  최소 d
        queue = collections.deque([(0,0,0,0)])
        
        ans = float('inf')
        while len(queue) > 0:
            y, x, d, l = queue.popleft()
            if (y,x,d) in memo or d > k:
                continue
            # (y,x) 까지 더 큰 d 로 옴 (더 많은 벽을 부셔서옴)
      # queue 즉 BFS 이기 때문에 나중에 오면 항상 L 이 더 큼
            if (y,x) in memo_d and memo_d[(y,x)] <= d:
                continue
            memo.add((y,x,d))
            memo_d[(y,x)] = d
            
            if y==h-1 and x==w-1 and ans >l:
                ans = l
            for ny, nx in [y+1,x],[y-1,x],[y,x+1],[y,x-1]:
                if 0<=ny<h and 0<=nx<w:
                    queue.append((ny, nx, d + grid[ny][nx], l+1))
                    
        
        return ans if ans != float('inf') else -1
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
