---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 902. Numbers At Most N Given Digit Set

## 문제

[LeetCode 902](https://leetcode.com/problems/numbers-at-most-n-given-digit-set/) • **Hard**

## 핵심 아이디어

먼저 생각해야 할건 길이이다.

만약 n 이 10자리 숫자라면, 9자리 숫자까지는 고민할 필요 없이 쉽게 구할 수 있다.

`sum(len(digits) ** i for i in range(1, len(n)))`

문제는 10자리 숫자 들은 대소비교가 들어가야 한다.

일단 끝에서 부터 하나하나 생각해 보자.

## Solution

```python
class Solution:
    def atMostNGivenDigitSet(self, digits: List[str], n: int) -> int:
        dp = [1]
        n = str(n)
        for i in range(len(n)):
            dp.append(0)
            for d in digits:
                d = int(d)
                if d < int(n[~i]):
                    dp[i+1] += len(digits) ** i
                elif d == int(n[~i]):
                    dp[i+1] += dp[i]
        return dp[-1] + sum(len(digits) ** i for i in range(1, len(n)))
```

```python
class Solution:
    def atMostNGivenDigitSet(self, digits: List[str], n: int) -> int:
        n:list[int] = list(map(int, str(n)))
        digits:list[int] = list(map(int, digits))

        ret = sum(len(digits) ** i for i in range(1, len(n)))

        for i,c in enumerate(n):
            for d in digits:
                if c > d:
                    ret += len(digits)**(len(n)-i-1)
            if c not in digits:
                break
        else:
            ret += 1
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
