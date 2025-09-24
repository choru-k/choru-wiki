---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 552. Student Attendance Record II

## 문제

[LeetCode 552](https://leetcode.com/problems/student-attendance-record-ii/) •**Medium**

일단 문제를 간단히 생각해보자.

Absent 은 1번만 들어갈 수 있다. 나중에 추가하기 쉬운 조건이니 일단은 Absent 조건은 잊어버리자.

그러면 남은 조건은 연속된 Late 2개까지만 허용이 된다.

DP 의 형식으로 풀어야 될 거 같다.

어떠한 DP 을 사용해야 할까?

`dp(n)` = `P + dp(n-1)` + `LP + dp(n-2)` + `LLP + dp(n-3)` 이 된다는 것을 알 수가 있다.

이미 가능한 어떤 문자열 `dp(n-1)` 에 대해서 앞에 P 가 있어도 가능한 문자열이 된다.

LP, LLP 도 마찬가지 이다. 그렇다면 왜 PL 이나 LPP 같은 경우는 따로 안 세어 주는 걸까?

그건 이미 `P+dp(n-1)` 이 `PL+dp(n-2)` 을 포함하고 있기 때문이다. LPP 의 경우도 마찬가지로 LPP 는 `LP` 의 하위 집합이다.

absent 가 존재하는 건 dp 을 이용해서 쉽게 구할 수 있다.

얘를 들어 n=5 라면 `A****`, `*A***`, `**A**`, `***A*` , `****A` 을 구하면 된다.

```python
class Solution:
    def checkRecord(self, n: int) -> int:
        m = 10**9+7
        if n == 0:
            return 0
        if n == 1:
            return 3
        dp = [1, 2, 4]
        for i in range(3, n+1):
            dp.append((dp[i-1]+dp[i-2]+dp[i-3]) % m)
        result = dp[n]
        for i in range(1,n+1):
            # print(i-1, n-i)
            result += dp[i-1] * dp[n-i] % m
            result %= m
        
        return result
```

## 공간 최적화

그 전의 dp(n) 을 noA(n) 으로 쓰자. 그 뒤 우리가 원하는 정답은 withA(n) 이라고 쓴다. withA 라고 썻지만 실제로는 A 가 0 or 1 개가 있는 문자열의 수이다.

일단 noA 는 위의 식과 일치한다.

withA 을 곰곰히 생각해보자.

같은 방법으로 `P + withA(n-1)` + `LP + withA(n-2)` + `LLP + withA(n-3)` 을 통해서 withA 에 P 와 L 을 합쳤다. `A + noA(n-1)` + `LA + noA(n-2)` + `LLA + noA(n-3)` 으로 noA 에 새로운 A 을 붙여줄수 있다.

즉 withA(n) = `P + withA(n-1)` + `LP + withA(n-2)` + `LLP + withA(n-3)` + `A + noA(n-1)` + `LA + noA(n-2)` + `LAA + noA(n-3)` 로 쓸 수 있다.

```python
class Solution:
    def checkRecord(self, n: int) -> int:
        m = 10**9+7
        noA = [1, 2, 4]
        withA = [1, 3, 8]
        if n <= 2:
            return withA[n]
        for i in range(3, n+1):
            sum_noA = sum(noA) % m
            noA = [noA[1], noA[2], sum_noA]
            sum_withA = sum(withA) % m
            withA = [withA[1], withA[2], sum_withA + sum_noA]
        
        return withA[-1] % m
```

## Log N 행렬

a는 `A` 가 없음. b 는 `A` 가 존재.

$\left[$

```python
import numpy as np

class Solution:
    def checkRecord(self, n: int) -> int:
    
        A = np.matrix([
            [1,1,1,0,0,0],
            [1,0,0,0,0,0],
            [0,1,0,0,0,0],
            [1,1,1,1,1,1],
            [0,0,0,1,0,0],
            [0,0,0,0,1,0],
        ])
        power = A
        mod = 10**9 + 7
        while n:
            if n & 1:
                power = (power * A) % mod
            A = A**2 % mod
            n //= 2
        
        return int(power[3, 0])
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
