---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Math
---

# 650. 2 Keys Keyboard

## 문제

[LeetCode 650](https://leetcode.com/problems/2-keys-keyboard/solution/) • **Hard**

## 핵심 아이디어

일단 문제을 읽으면 가장 쉽게 DP 로 푸는 법이 떠오른다

## Solution

```python
class Solution:
    def minSteps(self, n: int) -> int:
        dp = [float('inf') for _ in range(n+1)]
        dp[1] = 0
        
        for i in range(1, n+1):
            k = 2
            while i*k < len(dp):
                dp[i*k] = min(dp[i*k], dp[i]+k)
                k+=1
        # print(dp)
        return dp[-1]
```

하지만 조금 수학적으로 들어가면 보다 효율적인 방법이 있다는걸 알 수가 있다.

n 이 있을 때 우리는 n 을 g_1 *g_2* ... * g_k 로 표현할 수 있다.

이때 우리가 원하는건 g_1 + g_2 + ... + g_k 가 최소가 되는 것이다.

만약 우리가 복사 해서 3번 붙여넣기을 하면 원래 길이의 4배가 된다.

즉 g_1 배을 하기 위해서 복사을 하고 g_1 -1 번 붙여 넣기을 해야하기 때문에 필요한 작업 수가 g_1 이 된다.

이제 g_1 을 p*q 라고 표현해보자. g_1 배을 하기 위해서 p*q 번 작업을 하거나 또는 p번 일단 작업 후, q 번 작업 즉 (p+q) 의 작업이 필요할 수 있다.

p+q ≤ pq 이기 때문에 우리는 g_1 을 최대한 나눌 수 있을 만큼 나눠야 한다. 즉 소수로 까지 나눠야 하고

이걸 다시 전체로 표현하면 g_1, g_2, ... g_k 는 소수가 된다는 걸 알 수가 있다.

이제 가장 효율적인 방법을 알았으니 n 을 소수로 분해하면 정답이 된다.

```python
class Solution:
    def minSteps(self, n: int) -> int:
        d = 2
        ret = 0
        while n > 1:
            while n % d == 0:
                ret += 1 + (d-1)
                n = n // d
            d+=1
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
