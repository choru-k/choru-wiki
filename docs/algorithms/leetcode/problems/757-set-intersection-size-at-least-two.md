---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 757. Set Intersection Size At Least Two

## 문제

[LeetCode 757](https://leetcode.com/problems/set-intersection-size-at-least-two/) •**Hard**

## 핵심 아이디어

약간의 Greedy 한 접근이 필요하다.

일단 intervals 가 sort 되어 있다고 할 때, 항상 가장 마지막 원소(가장 큰 원소) 을 넣는게 유리하다.

만약 그 전의 interval 과 현재의 interval 이 겹치는 곳이 없다면 항상 새로운 원소를 넣어야 한다.

일단 우리가 `intervals.sort(key=lambda x: (x[1], -x[0]))` 로 정렬을 하면 4 가지 경우의 수가 있다.

![[__11.svg]]

위를 보면, 1,2 번의 경우일 때는 겹치는 부분이 1개 밖에 없기 때문에 1개를 더 추가한다.

3번의 경우 이미 2개가 겹치기 때문에 아무것도 하지 않아도 된다.

4번의 경우에는 겹치는 점이 하나도 없기 때문에 가장유리한(가장 큰) 두 end 을 더한다.

밑이 그 코드이다.

## Solution

```python
class Solution:
    def intersectionSizeTwo(self, intervals: List[List[int]]) -> int:
        group = []
        intervals.sort(key=lambda x: (x[1], -x[0]))
        for s, e in intervals:
            if len(group) == 0 or group[-1] < s:
                group.extend([e-1, e])
            elif group[-2] < s:
        # 갯수만 구할 때는 없어도 됨.
                if group[-1] == e:
                    group[-1] = e-1
                group.append(e)
        return len(group)
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
