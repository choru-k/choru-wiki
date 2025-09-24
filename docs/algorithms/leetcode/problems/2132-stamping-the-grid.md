---
tags:
  - LeetCode
  - Algorithm
  - Reverse-Thinking
---

# 2132. Stamping the Grid

## 문제

[LeetCode 2132](https://leetcode.com/problems/stamping-the-grid/description/) •**Medium**

## 핵심 아이디어

문제를 2단계로 나누어서 생각해보자.

1. 각 cell 에서 stamp 를 찍을 수 있나?
2. 각 cell 에서 stamp 를 찍었을 때, 현재의 cell 이 포함되나?

뭔가 말이 어렵지만 차근차근 생각해보자.

일단 1번은 좀 더 명확하다.

각 `cell(y, x)` 에서 stamp 를 찍을 수 있는지 어떻게 알 수 있을까?

이건 다시 말하면 `cell(y, x) ~ cell(y + stamp_height, x + stamp_width)` 까지 occupied cell 이 있냐랑 똑같은 의미이고, occupied cell 은 1, non-occupied cell 은 0 이기 때문에 `cell(y, x) ~ cell(y + stamp_height, x + stamp_width)` 의 합이 0 인지 파악하면 된다.

2d range 에 대해서 sum 을 쉽게 구하는 방법은 2d-accumulate array 을 통하여 O(1) 에 할 수 있다.

여기까지 작성한 코드가 아래이다.

## Solution

```python
class Solution:
    def possibleToStamp(self, grid: List[List[int]], stampHeight: int, stampWidth: int) -> bool:
        h, w = len(grid), len(grid[0])
        def acc(grid):
            ret = [[0 for _ in range(w)] for _ in range(h)]

            for y in range(h):
                for x in range(w):
                    ret[y][x] = (
                        (ret[y-1][x] if y > 0 else 0) \
                        + (ret[y][x-1] if x > 0 else 0) \
                        - (ret[y-1][x-1] if y > 0 and x > 0 else 0) \
                        + grid[y][x]
                    )
            return ret
        
        def range_sum(acc_grid, start, end):
            sy, sx = start
            ey, ex = end
            return (
                acc_grid[ey][ex] 
                - (acc_grid[ey][sx-1] if sx > 0 else 0)
                - (acc_grid[sy-1][ex] if sy > 0 else 0)
                + (acc_grid[sy-1][sx-1] if sy > 0 and sx >0 else 0)
            )
        
        acc_grid = acc(grid)

        
        stampped = [[0 for _ in range(w)] for _ in range(h)]

        for y in range(h):
            for x in range(w):
                sy, sx = y, x
                ey = y + stampHeight - 1
                ex = x + stampWidth - 1

                if ey < h and ex < w and range_sum(acc_grid, (sy,sx), (ey,ex)) == 0:
                    stampped[y][x] = 1
       
```

이제 각 cell 에서 자신이 stampped 된 범위에 있는지 찾으면 된다.

즉 `cell(y, x) ~ cell(y-stamp_height, x-stamp_width)` 에 stampped 가 있는지 검사하면 된다.

위와 마찬가지로 stampped 가 있는지 검사한다는건 `cell(y, x) ~ cell(y-stamp_height, x-stamp_width)` 의 stampped 배열 합이 0 보다 크다는 것을 의미하고 마찬가지로 range_sum 을 할수 있다.

그것까지 구현한 코드가 밑이다.

```python
class Solution:
    def possibleToStamp(self, grid: List[List[int]], stampHeight: int, stampWidth: int) -> bool:
        h, w = len(grid), len(grid[0])
        def acc(grid):
            ret = [[0 for _ in range(w)] for _ in range(h)]

            for y in range(h):
                for x in range(w):
                    ret[y][x] = (
                        (ret[y-1][x] if y > 0 else 0) \
                        + (ret[y][x-1] if x > 0 else 0) \
                        - (ret[y-1][x-1] if y > 0 and x > 0 else 0) \
                        + grid[y][x]
                    )
            return ret
        
        def range_sum(acc_grid, start, end):
            sy, sx = start
            ey, ex = end
            return (
                acc_grid[ey][ex] 
                - (acc_grid[ey][sx-1] if sx > 0 else 0)
                - (acc_grid[sy-1][ex] if sy > 0 else 0)
                + (acc_grid[sy-1][sx-1] if sy > 0 and sx >0 else 0)
            )
        
        acc_grid = acc(grid)
    
        
        stampped = [[0 for _ in range(w)] for _ in range(h)]

        for y in range(h):
            for x in range(w):
                sy, sx = y, x
                ey = y + stampHeight - 1
                ex = x + stampWidth - 1

                if ey < h and ex < w and range_sum(acc_grid, (sy,sx), (ey,ex)) == 0:
                    stampped[y][x] = 1
        
        
        acc_stampped = acc(stampped)
        
        for y in range(h):
            for x in range(w):
                if grid[y][x] == 1:
                    continue
                ey, ex = y, x
                sy = max(0, y - stampHeight + 1)
                sx = max(0, x - stampWidth + 1)
                if range_sum(acc_stampped, (sy, sx), (ey, ex)) == 0:
                    return False
        return True
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
