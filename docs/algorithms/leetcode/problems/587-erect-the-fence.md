---
tags:
  - LeetCode
  - Algorithm
  - Math
---

# 587. Erect the Fence

## 문제

[LeetCode 587](https://leetcode.com/problems/erect-the-fence/) •**Medium**

## 핵심 아이디어

전형적인 convex hull 문제입니다.

- [https://en.wikipedia.org/wiki/Convex_hull](https://en.wikipedia.org/wiki/Convex_hull)

간단하게 convex hull 문제는 볼록 다각형에서 이 볼록 다각형을 감싸는 껍질을 만드는 문제입니다.

바로 이 문제 이지요.

이번에는 graham scan 을 이용해서 문제을 풀겠습니다.

- [https://en.wikipedia.org/wiki/Graham_scan](https://en.wikipedia.org/wiki/Graham_scan)

graham scan 을 간단한 수학적인 방법을 통해서 블록 껍질을 만듭니다.

![[__2.jpg]]

위의 그림을 보면 일반적인 껍질입니다. 잘 보시면 가장 왼쪽, 위의 점부터 시작한다고 할 때 껍질은 6개의 선분으로 구성되어 있는데 이걸 모아서 보면 각각의 각도가 시계방향으로 회전 하는 것을 알 수가 있습니다.

즉 선분을 만들면서 각도가 최대한 시계 방향으로 되도록 다음 선분을 선택해 준다면 껍질을 만들 수 있습니다.

프로그래밍에서 선분의 각도을 계산하고 그것을 비교하는 것은 매우 어렵습니다. 그렇기 때문에 우리는 보다 간단한 외적을 통해서 선분의 각도의 대소 비교을 해줄 것 입니다.

## Solution

```python
class Solution:
    def outerTrees(self, points: List[List[int]]) -> List[List[int]]:
        # Find left, bottom point
        points.sort()
        def cross_product(p0, p1, p2):
            # ad - bc
            v1 = [p1[0] - p0[0], p1[1] - p0[1]]
            v2 = [p2[0] - p0[0], p2[1] - p0[1]]
            return (v1[0]*v2[1])-(v1[1]*v2[0])
        upper = points[:2]
        for p in points[2:]:
            while len(upper) >= 2 and cross_product(upper[-2], upper[-1], p) > 0:
                upper.pop()
            upper.append(p)

        lower = points[:2]
        for p in points[2:]:
            while len(lower) >= 2 and cross_product(lower[-2], lower[-1], p) < 0:
                lower.pop()
            lower.append(p)
        
        return set((y,x) for y,x in upper + lower)
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
