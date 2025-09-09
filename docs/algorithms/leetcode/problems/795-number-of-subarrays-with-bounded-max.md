---
tags:
  - LeetCode
  - Algorithm
  - Sliding-Window
---

# 795. Number of Subarrays with Bounded Max

## 문제

[LeetCode 795](https://leetcode.com/problems/number-of-subarrays-with-bounded-maximum/) • **Hard**

## 핵심 아이디어

일단 이 문제를 푸는 방법은 여러가지가 있다.

일단 가장 쉬운 방법부터 생각해보자.

  

보통 이런 문제를 풀 때는 어떠한 곳(특정포인트)에서 끝나는 subarray의 갯수나, 시작하는 subarray을 구하는 방법으로 풀 수가 있다.

  

이 문제 또한 비슷한 방법으로 풀 수가 있을까?

  

만약 특정포인트에서 끝나다고 할 때 sub array 는 몇개가 될까?

일단 경우의 수를 나누어 보자.

1. A[i] >R 인 경우
2. L≤A[i]≤R 인 경우
3. L>A[i]의 경우

만약 1의 경우는 간단하게 0이라는 것을 알 수가 있다.

두번째의 경우는 어떻게 될까? 이 sub array의 시작점은 어느곳이든 될 수 잇다. 단 1의 경우가 포함되면 안된다.

그렇기 때문에 마지막 나타난 1의 경우의 다음부터 2의 경우까지가 된다.

3의 경우는 어떻게 될까? 가장 최근에 나타난 경우의 수에 같게 된다.

## Solution

```python
class Solution:
    def numSubarrayBoundedMax(self, A: List[int], L: int, R: int) -> int:
        prev = -1
        ans = 0
        cur = 0
        for idx, num in enumerate(A):
            if num > R:
                cur = 0
                prev = idx
            elif L <= num <= R:
                cur = idx - prev
            else:
                cur = cur
            ans += cur
        return ans 
```

  

조금 다른 방법으로 풀어보자.

L≤A[i]≤R 이 포함된 sub array 는 A[i]≤L 과 A[i]≤R 의 sub array을 뺀것이다.

  

```python
class Solution:
    def numSubarrayBoundedMax(self, A: List[int], L: int, R: int) -> int:
				# 최대 수가 m인 subarray의 갯수를 구한다.
        def count(m):
            cnt = 0
            cur = 0
            for idx, num in enumerate(A):
                if num > m:
                    cur = 0
                else:
                    cur += 1
                cnt += cur
            return cnt
        return count(R)-count(L-1)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
