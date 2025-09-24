---
tags:
  - Algorithm
  - LeetCode
---

# 2979. Most Expensive Item That Can Not Be Bought

## 문제

[LeetCode 2979](https://leetcode.com/problems/most-expensive-item-that-can-not-be-bought/) •**Medium**

## 핵심 아이디어

결국 두 소수 로 만들수 없는 가장 큰 수를 구하는 문제이다.

일단 `p1 * p2` 이상은 항상 만들 수 있다.

그 이유를 살펴보자.

![[Attachments/bb2515c3a2f1aeae6471a5e9639aa128_MD5.jpeg]]
그림을 보면 `5 * 7` 이라고 할 때, 5번째 줄은 항상 살수 있다. 왜냐하면 5의 배수이기 때문이다.
이제 빨간색을 살펴보자. 이건 7의 배수이다.
7의 배수가 5의 배수와 다른 자리에 들어가기 때문에 해당 7의 배수 이후의 모든 숫자는 5를 더함으로써 만들수 있다.

즉 이제 찾아야 하는건, 가장 마지막으로 5의 배수와 만나기전(35) 의 7의 배수이다.
이건 28 이고, 이거보다 5 작은수가 우리가 만들수 없는 가장 큰 수라고 알 수 있다.

## Solution

```python
class Solution:
    def mostExpensiveItem(self, primeOne: int, primeTwo: int) -> int:
        arr = [False] * (primeOne * primeTwo + 1)
        arr[0] = True
        for i in range(1, primeOne * primeTwo + 1):
            if i - primeOne >= 0:
                arr[i] = arr[i-primeOne]
            if i - primeTwo >=0:
                arr[i] = arr[i] or arr[i-primeTwo]
        
        return max(
            idx for idx, c in enumerate(arr)
            if c == False
        )
```

```python
class Solution:

 def mostExpensiveItem(self, primeOne: int, primeTwo: int) -> int:

  return primeOne * primeTwo - primeOne - primeTwo
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
