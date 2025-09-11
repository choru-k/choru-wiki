---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 517. Super Washing Machines

## 문제

[LeetCode 517](https://leetcode.com/problems/super-washing-machines/) • **Medium**

## 핵심 아이디어

문제를 쉽게 생각하기 위해서 세탁물이 왼쪽으로만 이동할 수 있다고 가정하자. 그리고 주어지는 배열은 왼쪽으로만 이동해도 정답이 되게 주어진다고 하자.

만약 `[0,0,5,11]` 라면 avg 는 4가 되고, m-avg 의 배열은 `[-4,-4,1,7]` 이 된다.

그렇다면 left 는 `-4, -8, -7, 0` 의 순서로 변한다.

즉 우리가 원하는 정답은 8이 된다.

첫번째 세탁물이 부족하면 2번째 에게 넘기고, 그걸 다시 그 뒤로 넘기는 방식이다.

## Solution

```python
class Solution:
    def findMinMoves(self, machines: List[int]) -> int:
        s = sum(machines)
        l = len(machines)
        if s % l != 0:
            return -1
        avg = s // l
        ans = 0
        left= 0
        for m in machines:
      # 왼쪽에서 오는 부족한 세탁물들
            left += m - avg
      ans = max(ans, abs(left))
        return ans
```

이제 이걸 양쪽으로 움직이게 생각해보자. 기본은 똑같다. 단지 다른건, 우리는 세탁물이 부족할 때 양쪽에서도 받을 수 있다는 것이다.

```python
class Solution:
    def findMinMoves(self, machines: List[int]) -> int:
        s = sum(machines)
        l = len(machines)
        if s % l != 0:
            return -1
        avg = s // l
        ans = 0
        left= 0
        for m in machines:
            left += m - avg
      # m-avg 는 abs(m-avg) 가 아니다. 왜냐하면 [1,-2,1] 과 [-1,2,-1]은 다르기 때문이다.
      # 세탁물은 받을 때는 한번에 2곳에서 받을 수 잇지만, 주는건 한번에 1개 밖에 줄수 없다.
            ans = max(ans, abs(left), m-avg)
      # ans = max(ans, abs(left), m-avg, math.ceil(abs(m-avg)/2)) 로도 할 수 있지만, left 의 계산에서 이 경우는 계산이 되어진다.
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
