---
tags:
  - LeetCode
  - Algorithm
  - Hash-Table
  - Heap
  - Stack
---

# 895. Maximum Frequency Stack

## 문제

[LeetCode 895](https://leetcode.com/problems/maximum-frequency-stack/) •**Hard**

일단 가장 간단한 방법부터 생각해보자.

우리는 빈도수가 크고, 같은 빈도수 에서는 더 최근에 들어온 애를 return 해주면 된다.

그렇다면 빈도수 와 들어온 순서로 heap 을 만들어 주면 된다.

이게 그 방법이다.

```python
from heapq import heappush, heappop

class FreqStack:

    def __init__(self):
        self.pq = []
        self.freq = collections.defaultdict(int)
        self.idx = 0

    def push(self, x: int) -> None:
        self.freq[x] += 1
        self.idx += 1
        heappush(self.pq, (-self.freq[x], -self.idx, x))
        

    def pop(self) -> int:
        _, _, x = heappop(self.pq)
        self.freq[x] -= 1
        return x
        


# Your FreqStack object will be instantiated and called as such:
# obj = FreqStack()
# obj.push(x)
# param_2 = obj.pop()
```

## 보다 최적화

stack 을 사용할 수도 있다.

같은 freq 을 가질 때는 stack 을 이용해서 들어온 순서를 기억 할 수 있다.

```python
from heapq import heappush, heappop

class FreqStack:

    def __init__(self):
        self.stack = collections.defaultdict(list)
        self.freq = collections.defaultdict(int)
        self.max_freq = 0

    def push(self, x: int) -> None:
        self.freq[x] += 1
        self.stack[self.freq[x]].append(x)
        self.max_freq = max(self.max_freq, self.freq[x])
        
    def pop(self) -> int:
        x = self.stack[self.max_freq].pop()
        self.freq[x] -= 1
        if len(self.stack[self.max_freq]) == 0:
            self.max_freq -= 1
        return x
        


# Your FreqStack object will be instantiated and called as such:
# obj = FreqStack()
# obj.push(x)
# param_2 = obj.pop()
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
