---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 835. Image Overlap

## 문제

[LeetCode 835](https://leetcode.com/problems/image-overlap/) •**Hard**

## 핵심 아이디어

가장 간단하게 만들면 `O(N^4)` 이다.

조금 더 생각해보면 `1` 만 비교를 하면 된다는 것을 알 수가 있다. 0 가 얼마나 overlap 되었는지는 확인 하지 않기 때문이다.

즉 1들만 추출하고 걔네만 비교하자.

시간복잡도는 `O(len(a) * len(b) + N^2)` 가 된다. 최악의 경우 len(a), len(b) 가 N^2 가 되기 때문에 최악의 시간복잡도는 같지만 훨씬 최적화가 되었다.

## Solution

```python
class Solution:
    def largestOverlap(self, A: List[List[int]], B: List[List[int]]) -> int:
        a = [(y, x) for y in range(len(A)) for x in range(len(A[0])) if A[y][x] == 1]
        b = [(y, x) for y in range(len(B)) for x in range(len(B[0])) if B[y][x] == 1]
        
    # (ay-by), (ax-bx) 만큼 이동할 때 (ay,ax) 와 (by,bx) 가 겹친다.
    # 
        c= collections.Counter([(ay-by, ax-bx) for ay, ax in a for by, bx in b])
        # print(c)
        if len(c) == 0:
            return 0
        return max(c.values())
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
