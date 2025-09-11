---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 1067. Digit Count in Range

## 문제

[LeetCode 1067](https://leetcode.com/problems/digit-count-in-range/) • **Hard**

## 핵심 아이디어

[[Spaces/Home/PARA/Resource/Leetcode/233. Number of Digit One]]

위의 문제에서 달라진점은

1. 범위가 생겼다.
2. 1 이 아니라 특정 숫자을 센다.

1번은 간단히 count(high)- count(low-1) 로 해결 할 수 있다.

2번은 생각을 해보자.

## Solution

```python
class Solution:
    def digitsCount(self, d: int, low: int, high: int) -> int:
        def countDigitOne(n, d) -> int:
            if n <= 0:
                return 0
            str_n = str(n)

            res = 0
            for i, c in enumerate(str_n[::-1]):
                div, mul = 10**(i+1), 10**i

                if int(c) < d:
                    res += (n // div) * mul
                elif int(c) == d:
                    res += (n // div) * mul + (n % mul + 1)
                else:
                    res += (n // div + 1) * mul
        # 여기가 핵심이다. 0으로 시작하는 숫자는 없기 때문에, 그 만큼을 빼준다.
        # i 번째 자릿수가 d 일때의 경우의 수를 더하는 건데, 만약 i 번째 자릿수가 0 이라면 000xxx 같은 경우를 빼야하기 때문에 mul 을 빼주었다.
                res -= mul if d == 0 else 0
            return res 
        return countDigitOne(high, d) - countDigitOne(low-1, d)
```

```JavaScript
class Solution:
    def digitsCount(self, d: int, low: int, high: int) -> int:
        cnt = [0, 1]
        for i in range(10):
            cnt.append(cnt[-1] * 10 + 10**(len(cnt)-1))
        
        
        def count(upper: int) -> int:
            cur = 0
            s_upper = str(upper)
            l = len(s_upper)
            for i in range(l):
                for j in range(int(s_upper[i])):
                    cur += cnt[l-i-1]
                    if d == j:
                        cur += 10**(l-i-1)
                if int(s_upper[i]) == d:
                    cur += (int(s_upper[i+1:]) if i+1 < len(s_upper) else 0)+1
                if d == 0:
                    cur -= 10**i
            return cur
        

        return count(high) - count(low-1)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
