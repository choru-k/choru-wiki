---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Math
---

# 296. Best Meeting Point

## 문제

[LeetCode 296](https://leetcode.com/problems/best-meeting-point/) • **Medium**

## 핵심 아이디어

이 문제의 핵심은 x축, y 축이 각각 독립적이라는 것이다.

식으로 보면 우리가 원하는 점이 (y,x) 이고 각각의 사람들의 좌표를 a_i 라고 하자.

$\sum_i^n |y-a_{iy}|+|x-a_{ix}| = |y-a_{1y}|+|x-a_{1x}|+ |y-a_{2y}|+|x-a_{2x}| + ... + |y-a_{ny}|+|x-a_{nx}|$

$(|y-a_{1y}|+|y-a_{2y}|+|y-a_{3y}|+... )+(|x-a_{1x}|+|x-a_{2x}|+|x-a_{3x}|+...)$

이 되기 때문에 2개의 1차원문제 2개로 생각 할 수 있다.

이제 저 1차원 문제를 풀어보자.

  

문제를 조금 간단하게 생각해보자.

만약 어떠한 정렬된 배열이 존재한다고 할때 그 숫자들의 차이들의 합이 최소가 되는 숫자를 찾아라.

즉, `[1, 2, 100]` 일때 `sum(abs(x-1), abs(x-2), abs(x-100))` 이 최소가 되는 정수 x 을 찾는 문제를 생각해보자.

그 경우 정답은 그 배열의 median 이 된다.

그 이유를 고려해보자.

절댓값의 그래프을 그려보면 알 수 있다.

  

![[__2.svg]]

  

이제 원래의 문제로 돌아가보자.

y축에 대해서만 문제를 고려한다고 할때

## Solution

```Plain
1 - 0 - 0 - 0 - 1
|   |   |   |   |
0 - 0 - 0 - 0 - 0
|   |   |   |   |
0 - 0 - 1 - 0 - 0

abs(x-0) + abs(x-0) + abs(x-2) 가 되는데 이건 위의
(0,0,2) 의 문제와 같다.
```

우리는 위처럼 배열을 얻게 되고 결국 이 배열에 대해서만 문제를 고려하면 되는데 이것은 위의 문제와 같다.

  

즉 정답은 밑이 된다.

```python
class Solution:
    def minTotalDistance(self, grid: List[List[int]]) -> int:
        if not grid:
            return 0
        h, w = len(grid), len(grid[0])
				# [0, 0, 2] 가 된다.
        r = [y for y in range(h) for x in range(w) if grid[y][x]]
				# [0, 2, 4] 가 된다.
        c = [x for x in range(w) for y in range(h) if grid[y][x]]
				
				# 즉 최적의 값은 [0,2] 가 된다.
        res_r = r[len(r) // 2]
        res_c = c[len(c) // 2]
        return sum(abs(ir - res_r) for ir in r) + sum(abs(ic - res_c) for ic in c)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
