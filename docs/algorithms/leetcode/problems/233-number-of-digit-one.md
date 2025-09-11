---
tags:
  - LeetCode
  - Algorithm
  - Math
---

# 233. Number of Digit One

## 문제

[LeetCode 233](https://leetcode.com/problems/number-of-digit-one/) • **Medium**

## 핵심 아이디어

일단 각 자리수에서 몇번 나오는지를 생각하면 된다.

`40125` 을 생각해보자.

맨 앞의 4가 1이 될수 있는 경우의 수는 어떻게 될까?

총 `10000` 개가 있다. 왜냐하면 `10000~19999` 까지밖에 없기 때문이다.

이제 0의 자리가 1이 되는 경우를 생각해보자.

`01000~01999` `11000~11999`, `21000-21999` , `31000-31999` 까지만 있다.

1000개의 경우가 총 4번 나왔다.

그 다음은 1의 자리을 생각해보면 `00~39` 총 100개의 경우가 40번 나오고 나머지 `100-125` 까지 26번이 나온다.

규칙을 생각해보자. `10^i` 자리에서는 `10^i` 의 경우가 `n//(10^i+1)` 번 나온다. 하지만 `10^i` 의 자리가 2 이상일 경우는 ``n//(10^i+1)+1` 번 나온다. 1일 경우는 그 뒤자리도 더해준다.

밑의 코드는 이러한 것을 구현하였다.

## Solution

```python
class Solution:
    def countDigitOne(self, n):
        if n <=0:
            return 0
        str_n = str(n)
        ans = 0 
        for i, c in enumerate(str_n[::-1]):
            div = 10**(i+1)
            mul = 10**i
            if int(c) == 0:
                ans += n // div * mul
            elif int(c) == 1:
                ans += n // div * mul + n%mul +1
            else:
                ans += (n // div +1) * mul
        
        return ans
```

```python
class Solution:
    def countDigitOne(self, n: int) -> int:
        pivot, res = 1, 0
        while n >= pivot:
            res += n // (10 * pivot) * pivot \
         + min(pivot, \
           max(n % (10 * pivot) - pivot + 1, 0))
            pivot *= 10
        return res
```

```python
class Solution:
    def countDigitOne(self, n: int) -> int:
        
        cnt = [0, 1]
        for i in range(10):
            cnt.append(cnt[-1] * 10 + 10**(len(cnt)-1))
        d = 1
        def count(upper: int) -> int:
            cur = 0
            s_upper = str(upper)
            l = len(s_upper)
            for i in range(l):
                for j in range(int(s_upper[i])):
                    cur += cnt[l-i-1]
                    if d == j:
                        cur += 10**(l-i-1)
                if int(s_upper[i]) == 1:
                    cur += (int(s_upper[i+1:]) if i+1 < len(s_upper) else 0) + 1
            return cur
        
        return count(n)
```

```python
class Solution:
    def countDigitOne(self, n: int) -> int:
        n = str(n)
        ret = 0
        cnts = [0, 1]
        for i in range(1, 10):
            cnts.append(cnts[-1]*10 + 10**i)
        for idx in range(len(n)):
            k = len(n) - idx
            num = int(n[idx])
            if num == 0:
                continue
            elif num == 1:
                ret += cnts[k-1]
                ret += (int(n[idx+1:])+1) if len(n[idx+1:]) > 0 else 0
            else:
                ret += cnts[k-1]*num + 10**(k-1)
        return ret + (1 if n[-1] == '1' else 0)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
