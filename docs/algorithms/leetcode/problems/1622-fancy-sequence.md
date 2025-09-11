---
tags:
  - LeetCode
  - Algorithm
  - Math
---

# 1622. Fancy Sequence

## 문제

[LeetCode 1622](https://leetcode.com/problems/fancy-sequence/) • **Medium**

## 핵심 아이디어

이 문제를 조금 생각해보자.

일단 가장 간단한 방법은 그냥 그 때 그 때 계산 하는 것이다.

이 방법은 add, mul 에서 O(N) 의 시간 복잡도가 필요하다.

조금 더 고민해보자.

이제 그 때 그 때 계산이 아니라 조금 모아서 계산을 해보자.

밑의 코드를 보면 lazy 을 만들어서 조금 씩 모아서 계산을 한다.

아까 방법보다는 효과적 이지만 아직도 시간복잡도 O(N) 이 된다.

## Solution

```python
MOD = 10**9+7
class Fancy:

    def __init__(self):
        self.seq = []
        self.lazy = []
    
    def _resolveLazy(self):
        # ax+b
        if len(self.lazy) == 0:
            return
        cur= [1, 0]
        for c, num in self.lazy:
            if c == '+':
                cur[1] += num
            else:
                cur[0] *= num
                cur[1] *= num
        self.seq = [(num*cur[0] + cur[1]) % MOD for num in self.seq]
        self.lazy = []
    def append(self, val: int) -> None:
        self._resolveLazy()
        self.seq += [val]

    def addAll(self, inc: int) -> None:
        self.lazy.append(('+', inc))

    def multAll(self, m: int) -> None:
        self.lazy.append(('*', m))

    def getIndex(self, idx: int) -> int:
        self._resolveLazy()
        if idx >= len(self.seq):
            return -1
        return self.seq[idx]


# Your Fancy object will be instantiated and called as such:
# obj = Fancy()
# obj.append(val)
# obj.addAll(inc)
# obj.multAll(m)
# param_4 = obj.getIndex(idx)
```

위의 코드을 조금 더 고민해보자.

특정 시점의 변환을 `ax+b` 라고하고, 그 뒤의 변환을 `cx+d` 라고 할 때,

우리는 `e(ax+b) + f = cx+d` 을 구할 수 있다.

이것이 우리가 원하는 변환이다.

밑의 코드는 그것을 구현한 것이고 시간복잡도 O(N) 이 된다.

```python
class Fancy:

    def __init__(self):
        self.arr = []
        self.pre = [[1, 0]]

    def append(self, val: int) -> None:
        self.arr.append(val)
        self.pre.append(list(self.pre[-1]))
    def addAll(self, inc: int) -> None:
        self.pre[-1][1] += inc

    def multAll(self, m: int) -> None:
        self.pre[-1][0] *= m
        self.pre[-1][1] *= m

    def getIndex(self, idx: int) -> int:
        if idx >= len(self.arr):
            return -1
   
        c, d = self.pre[-1]
        a, b= self.pre[idx]
        # e*(a*x+b) + f = c*x + d
  # e*a = c
  # e*b + f = d
        e = c//a
        f = d-e*b

        return (e*self.arr[idx] + f) % (10**9+7)
```

하지만 실제로 위의코드는 TLE 가 된다. 왜냐하면 너무 큰 수를 다루기 때문이다.

그렇기 때문에 우리는 저 pre 을 지속적으로 나누어 주어야 한다.

`m = 10**9+7`

`a^(m-1) ≡ 1 (mod m)` ⇒ m이 소수. 즉 페르마의 소정리를 사용 할 수 있다. [https://ko.wikipedia.org/wiki/페르마의_소정리](https://ko.wikipedia.org/wiki/%ED%8E%98%EB%A5%B4%EB%A7%88%EC%9D%98_%EC%86%8C%EC%A0%95%EB%A6%AC)

각 변에 `a^(-1)` 을 곱하면

`a^(-1) ≡ a^(m-2) (mod m)`

```python
MOD = 10**9+7
class Fancy:

    def __init__(self):
        self.arr = []
        self.pre = [[1, 0]]

    def append(self, val: int) -> None:
        self.arr.append(val)
        self.pre.append(list(self.pre[-1]))
    def addAll(self, inc: int) -> None:
        self.pre[-1][1] += inc

    def multAll(self, m: int) -> None:
        self.pre[-1][0] = (self.pre[-1][0] * m) % MOD
        self.pre[-1][1] = (self.pre[-1][1] * m) % MOD

    def getIndex(self, idx: int) -> int:
        if idx >= len(self.arr):
            return -1
   
        
        c, d = self.pre[-1]
        a, b= self.pre[idx]
        # e*(a*x+b) + f = c*x + d
    # e = c // a => c * a^(-1) => a^(-1) 은 위의 식에서 구할 수 있음
    # e*b + f = d
        e= c * pow(a, MOD-2, MOD)
        f = d - e*b

        return (e*self.arr[idx] + f) % (10**9+7)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
