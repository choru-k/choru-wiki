---
tags:
  - LeetCode
  - Algorithm
  - Math
---

# 483. Smallest Good Base

## 문제

[LeetCode 483](https://leetcode.com/problems/smallest-good-base/) • **Medium**

## 핵심 아이디어

일단 등비급수의 합을 이용해서

a 진수 `1111111` 의 길이가 k 라면 합은

$a^{k-1}+a^{k-2}+...+a^1+a^0 = \frac {a^{k}-1} {a-1}$

이라는 것을 알 수 있습니다.

그러면 무작정 a 을 2, 3, ,4 로 증가하면서 해도 되나 보다 최적화를 하고 싶습니다.

일단 우리는 항상 (n-1)진수로 2자리의 11 을 만들수 있습니다.

길이가 주어졌다면(k가 주어졌다면) 우리는 a 을 구할 수 있습니다.

이렇게 k 을 증가시키다가 만약 a 가 1 이 된다면 최악의 경우를 return 해 주면 됩니다.

가장 최악의 경우 k 는 logN 까지 증가됩니다. 왜냐하면 가장 긴 k 는 2진법 일때인데 그때의 길이가 logN 이기 때문입니다.

## Solution

```python
class Solution:
    def smallestGoodBase(self, n: str) -> str:
        n = int(n);
        k = 2
        while True:
            a = int(n ** k ** -1)                  # kth-root of n
            if a == 1:
                return str(n-1)
            if (1 - a ** (k + 1)) // (1 - a) == n: # [a^0 + a^1 + ... + a^k] == n
                return str(a)
            k+=1
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
