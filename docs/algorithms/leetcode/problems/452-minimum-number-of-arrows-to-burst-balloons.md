---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 452. Minimum Number of Arrows to Burst Balloons

## 문제

[LeetCode 452](https://leetcode.com/problems/minimum-number-of-arrows-to-burst-balloons/) • **Medium**

## 핵심 아이디어

자주 나오는 유형의 문제이다.

핵심은 end 로 정렬을 한다는 것이다.

일단 우리가 화살을 날리는 곳은 풍선의 시작 또는 끝이다. 왜냐하면 그 부분이 edge 하기 때문이다.

이제 우리가 어떠한 곳에 화살을 날린다고 한다.

무조건 end 로만 정렬을 하고 그리디 하게 화살을 날릴 때 우리가 원하는 최적의 답을 찾을 수 있을까?

몇가지 특수한 경우를 생각해 보았다. 만약 이번 풍선을 i 번 째 풍선이라고 하자

- $i_{th}$﻿ end < $i+1_{th}$﻿ start
- $i_{th}$﻿ end > $i+1_{th}$﻿ start

두가지 경우가 있다.

만약 첫번째 경우에는 우리는 한개의 화살로 다음 풍선을 터뜨릴 수 없지만, 두번째의 경우에는 우리는 다음 풍선까지 터뜨릴수 있다.

만약 밑의 그림의 첫번째 처럼, i+1th 의 풍선은 터뜨릴수 없지만, 그 다음 풍선은 터뜨릴수 있을 때는 어떻게 될까?

이런 경우는 풍선이 매우 크기 때문에 두번째의 화살로도 터질수 있다. 그렇기 때문에 우리는 이러한 경우를 무시할 수 있다.

![[__1.jpg]]

## Solution

```python
class Solution:
    def findMinArrowShots(self, points: List[List[int]]) -> int:
        if len(points) == 0:
            return 0
        ans = 1
        points.sort(key=lambda x: (x[1], x[0]))
        cur = points[0][1]
        for s, e in points[1:]:
            if cur < s:
                ans += 1
                cur = e
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
