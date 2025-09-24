---
tags:
  - LeetCode
  - Algorithm
  - Math
---

# 795. Number of Subarrays with Bounded Maximum

## 문제

[LeetCode 795](https://leetcode.com/problems/number-of-subarrays-with-bounded-maximum/) •**Hard**

## 핵심 아이디어

원하는 값이 `lower` 이상, `upper` 미만의 조건을 가질 경우, 일반적으로 각각을 따로 구하는 것으로 문제을 쉽게 풀 수 있습니다.

문제을 바꾸어 봅시다. 만약 Subarray 의 최댓값이 upper 이하인 갯수을 구하는 함수을 만들어 봅시다.

일반적으로 subarray 의 갯수을 구할 때는 현재 element 가 subarray 의 시작일 경우, subarray 의 마지막일 경우을 생각해서 풀면 쉽게 풀리는 경우가 많습니다.

이번에는 현재 element 가 subarray 의 마지막 원소일 때의 갯수을 구해보도록 하죠.

밑의 코드에서 `count` 는 subarray 의 최댓값이 `m` 이하일 때의 갯수을 구합니다.

## Solution

```python
class Solution:
    def numSubarrayBoundedMax(self, A: List[int], L: int, R: int) -> int:
        def count(m):
            cnt = 0
            cur = 0
      # A = [1,2,3,4,2,1], m =3 인 경우을 생각해보자.
      # cur은 [1,2,3,0,1,2] 가 될 것이다.
      # 다 더하면 subarray 의 갯수가 된다.
            for idx, num in enumerate(A):
        # 이번 num 은 포함이 안됨. 새로시작
                if num > m:
                    cur = 0
                else:
                    cur += 1
                cnt += cur
            return cnt
    # L이상 R 이하의 갯수 = R이하의 갯수 - L-1이하의 갯수
        return count(R)-count(L-1)
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
