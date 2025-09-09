---
tags:
  - LeetCode
  - Algorithm
  - Hash-Table
  - Math
---

# 963. Minimum Area Rectangle II

## 문제

[LeetCode 963](https://leetcode.com/problems/minimum-area-rectangle-ii/) • **Medium**

## 핵심 아이디어

2가지의 풀이가 있다.

첫번째는 두 벡터을 구하고 그 두 벡터가 서로 수직이고 반대편의 점이 존재하면 직사각형을 만들 수 있다.

## Solution

```python
from itertools import permutations
class Solution:
    def minAreaFreeRect(self, points: List[List[int]]) -> float:
				# 벡터 연산을 위해서 복소수로 만들어 주자.
        points = [complex(*z) for z in points]
        points_set = set(points)

				# 내적이 0 이면 두 벡터가 수직이다.
        dot_product = lambda z1, z2: z1.real*z2.real + z1.imag * z2.imag
        return min([abs(p2-p1) * abs(p3-p1)
            for p1, p2, p3 in permutations(points, 3) 
						# p1 의 반대편의 점이 존재하고
            if p2+p3-p1 in points_set 
						# 내적이 수직이면
            and dot_product(p2-p1,p3-p1) == 0] or [0])
```

  

  

조금 다르게 생각하면 한 원 위에서 중심을 지나는 선분 2개을 이용하면 직사각형을 만들 수 있다.

```python
from itertools import combinations
class Solution:
    def minAreaFreeRect(self, points: List[List[int]]) -> float:
        points = [complex(*z) for z in points]
        memo = collections.defaultdict(list)
        for p1, p2 in combinations(points, 2):
            mid_point = (p1+p2) / 2
            radius = abs(mid_point-p1)
            memo[(mid_point, radius)].append(p1)
        
        
        return min([
            abs(p1-p2) * abs(p1+p2 - 2 * mid_point)
            for (mid_point, radius), candidates in memo.items()
            for p1, p2 in combinations(candidates, 2)
        ] or [0])
```

![[__7.svg]]

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
