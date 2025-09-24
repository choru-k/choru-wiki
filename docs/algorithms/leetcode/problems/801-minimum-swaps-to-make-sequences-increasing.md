---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 801. Minimum Swaps To Make Sequences Increasing

## 문제

[LeetCode 801](https://leetcode.com/problems/minimum-swaps-to-make-sequences-increasing/) •**Hard**

## 핵심 아이디어

일단 만약 `A[:i], B[:i]` 의 최적 값을 알 때, `A[:i+1], B[:i+1]` 의 최적 값을 알 수 있는지 생각해보자.

혹은 반대

그러면 `A[:i], B[:i]` 의 최적 값을 알아도 그 최적 값이 어떠한 상태를 가지고 있다는게 알게 된다.

`A[i], B[i]` 의 swap 유무에 따라 `A[:i+1] B[:i+1]` 의 최적 값이 달라진다. 마지막 값 이외는 영향을 받지 않는다. 그렇기 때문에 보다 우리는 `최적 값 + 상태`를 저장해야 한다. 상태는 2가지만 존재한다.

마지막을 swap 할 때, 안 할 때

swap, not_swap 2개의 경우로 나누어서 DP 을 구성한다.

만약

- `A[i], B[i]` 가 swap 된 상태일 때
  - `A[i] < A[i+1], B[i] < B[i+1]` 의 상태 여도 A[i], B[i] 가 swap 되었기 때문에 A[i+1], B[i+1] 도 swap 을 해줘야 한다. `swap[i+1] = swap[i]+1`
  - `A[i] < B[i+1], B[i] < A[i+1]` 이미 swap 된 상태 이기 때문에 swap 을 하지 않아도 된다. `not_swap[i+1] = swap[i]`
- `A[i], B[i]` 가 not_swap 상태일 때
  - `A[i] < A[i+1], B[i] < B[i+1]` 의 상태. `not_swap[i+1] = not_swap[i]`
  - `A[i] < B[i+1], B[i] < A[i+1]` → `swap[i+1] = not_swap[i]+1`

## Solution

```python
class Solution:
    def minSwap(self, A: List[int], B: List[int]) -> int:
        # swap[i] = A[:i] 와 B[:i] 을 가지고 계산햇을 때의 최적의 값(단 A[i], B[i], 마지막 값이 swap 되어있을때)
        swap = [float('inf')] * len(A)
        # 마지막 값이 swap 되지 않앗을 때
        not_swap = [float('inf')] * len(A)
        
        not_swap[0] = 0
        swap[0] = 1
        for i in range(len(A)-1):
            if A[i] < A[i+1] and B[i] < B[i+1]:
                # not_swap[i+1] = not_swap[i] 로 써도 되지만 코드의 통일성? 을 위해서
                not_swap[i+1] = min(not_swap[i+1], not_swap[i])
                swap[i+1] = min(swap[i+1], swap[i] + 1)
            if A[i] < B[i+1] and B[i] < A[i+1]:
                not_swap[i+1] = min(not_swap[i+1], swap[i])
                swap[i+1] = min(swap[i+1], not_swap[i]+1)
        return min(swap[-1], not_swap[-1])
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
