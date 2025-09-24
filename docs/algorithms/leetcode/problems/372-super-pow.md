---
tags:
  - Algorithm
  - LeetCode
---

# 372. Super Pow

## 문제

[LeetCode 372](https://leetcode.com/problems/super-pow/description/?envType=list&envId=xfgt7zgc) •**Medium**

## 핵심 아이디어

`n1 * n2 % 1337 = (n1 % 1337) * (n2 % 1337) % 1337`

이게 핵심이다.

`b = m*10 + d` 이라면 `a**b = (a**d)*(a**10)**m` 로 쓸수 있고

`a^b = (a^d)*(a^10)^`

`a^(m*10)+d = a^d * a^(m*10) = a^d * (a^10)^m`

## Solution

```python
class Solution(object):
    def superPow(self, a, b):        
        acc = 1
        while b: 
            a, acc = pow(a, 10, 1337), pow(a, b.pop(), 1337) * acc % 1337
        return acc
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
