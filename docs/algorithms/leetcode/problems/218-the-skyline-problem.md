---
tags:
  - LeetCode
  - Algorithm
  - Sorting
  - Sorted-List
---

# 218. The Skyline Problem

## 문제

[LeetCode 218](https://leetcode.com/problems/the-skyline-problem/) • **Medium**

## 핵심 아이디어

일단 범위를 주는 문제는 시작점 끝점으로 point 를 나누면 매우 편리하다.

일단 범위를 끝점, 시작점으로 나눈다면 우리가 관리해야 하는건 높이 뿐이다.

우리는 지속적으로 높이의 최댓값을 구해야 한다.

쓸 수 있는 자료구조는 heap, orderedMap 이 있을 것이다.

우리는 이 자료구조에서 삭제할 때는 특정 값을 삭제해야 한다.

결국 사용할 수 있는 자료구조는 orderedMap 뿐이다.

## Solution

```python
from sortedcontainers import SortedList
class Solution:
    def getSkyline(self, buildings: List[List[int]]) -> List[List[int]]:
    # 기본값 0 부터 시작. 이래야 비어있는 경우 0을 출력한다.
        cur = SortedList([0])
        ret = []
        
    # 범위를 시작점, 끝점 으로 나눈다.
        points = [(x, v, h) for s, e, h in buildings for x, v in [(s,-1), (e,1)]]
        points.sort()
        for x, v, h in points:
      # v 을 통해, 시작인지 끝인지 확인
            if v == 1:
                cur.remove(h)
            else:
                cur.add(h)
      # max height 가 바뀌지 않는다면 추가할 필요 없음
            if ret and ret[-1][1] == cur[-1]:
                continue
      # 같은 x 값을 가지고 있다면, 현재 값을 뺌 [(1,2,1), (1,3,1), (1,4,1)] 같은 경우.
            if ret and ret[-1][0] == x:
                ret.pop()
            ret.append([x, cur[-1]])
        
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
