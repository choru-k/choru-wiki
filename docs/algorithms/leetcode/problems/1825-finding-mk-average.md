---
tags:
  - LeetCode
  - Algorithm
  - Segment-Tree
---

# 1825. Finding MK Average

## 문제

[LeetCode 1825](https://leetcode.com/problems/finding-mk-average/description/) • **Medium**

## 핵심 아이디어

기본적으로 queue 을 통해서 최신 m 개의 값만 유지시켜줘야 한다.

그리고 실시간으로 smallest k, largest k 값을 구해야 하기 때문에 sortedList 을 사용해야 한다는 것을 알 수 있다.

이제 키 포인트는 어떻게 주기적으로 smallest k, largest k 의 sum 을 구하냐는 것이다.

한가지 방법으로는 값이 들어올 때 마다, smallest k, largest k 에 들어가는지 보고, 만약 포함된다면

미리 구해논 smallest k, largest k 합계를 업데이트 하는 방법을 할 수 있다.

## Solution

```python
from sortedcontainers import SortedList
class MKAverage:

    def __init__(self, m: int, k: int):
        self.sl = SortedList()
        self.q = collections.deque()
        self.m, self.k = m, k

        self.cur_sum = 0
        self.s_k = 0
        self.l_k = 0
        

    def addElement(self, num: int) -> None:
        if len(self.q) == self.m:
            prv = self.q.popleft()
            if prv <= self.sl[self.k-1]:
                self.s_k -= prv
                self.s_k += self.sl[self.k]
            if self.sl[-self.k] <= prv:
                self.l_k -= prv
                self.l_k += self.sl[-self.k - 1]
            self.sl.remove(prv)
            self.cur_sum -= prv
        
        self.cur_sum += num
        if len(self.sl) >= self.k:
            if num < self.sl[self.k-1]:
                self.s_k -= self.sl[self.k-1]
                self.s_k += num
            if self.sl[-self.k] < num:
                self.l_k -= self.sl[-self.k]
                self.l_k += num
        else:
            self.s_k += num
            self.l_k += num
        self.sl.add(num)
        self.q.append(num)

    def calculateMKAverage(self) -> int:
        print(self.s_k, self.l_k)
        if len(self.q) < self.m:
            return -1
        return (self.cur_sum - self.s_k - self.l_k) // (self.m - 2*self.k)


# Your MKAverage object will be instantiated and called as such:
# obj = MKAverage(m, k)
# obj.addElement(num)
# param_2 = obj.calculateMKAverage()
```

두번째 방법으로는 Segment Tree 을 이용해서 범위 합을 빠르게 구하는 방법이 있다.

아래 코드의 장점으로는 Segment Tree 코드를 제외한다면 더욱 이해하기 쉬운 코드라고 생각한다.

```python
from sortedcontainers import SortedList

class Node:
    def __init__(self, l, r):
        self.l = l
        self.r = r
        self.m = (self.l + self.r) // 2
        self.val = 0
        self._left: Node | None = None
        self._right: Node | None = None
    
    @property
    def left(self):
        if self._left == None:
            self._left = Node(self.l, self.m)
        return self._left

    @property
    def right(self):
        if self._right == None:
            self._right = Node(self.m+1, self.r)
        return self._right
    
class SegmentTree:
    def __init__(self, l=0, r=10**5):
        self.head = Node(l, r)
    
    def query(self, l, r):
        def dfs(node):
            if r < node.l or l > node.r:
                return 0
            if l <= node.l and node.r <= r:
                return node.val
            left, right = dfs(node.left), dfs(node.right)
            return left + right
        return dfs(self.head)

    def update(self, val, factor):
        def dfs(node) -> int:
            if val < node.l or val > node.r:
                return node.val
            if val <= node.l and node.r <= val:
                node.val += val * factor
                return node.val
            left, right = dfs(node.left), dfs(node.right)
            node.val = left + right
            return node.val
        dfs(self.head)


class MKAverage:
    def __init__(self, m: int, k: int):
        self.sl = SortedList()
        self.q = collections.deque()
        self.m, self.k = m, k
        self.st = SegmentTree()
        

    def addElement(self, num: int) -> None:
        if len(self.q) == self.m:
            prv = self.q.popleft()
            self.sl.remove(prv)
            self.st.update(prv, -1)
            
        self.q.append(num)
        self.sl.add(num)
        self.st.update(num, 1)
        

    def calculateMKAverage(self) -> int:
        if len(self.q) < self.m:
            return -1
        l, r = self.sl[self.k], self.sl[-self.k-1]
        s = self.st.query(l, r)
        # 중복된 값이 있을 수 있기 때문에, 중복된 값을 빼주어야 한다.
    # l, r 이 [5,5] 이고, m 이 5, k 가 1
    # [5, 5, 5, 5, 5] 로 현재 sl 이 구성되어 있다면
    # [x, o, o, o, x] 중간의 [5, 5, 5] 만 우리가 원하는 범위이다.
    # 그래서 앞 뒤 적당한 값을 빼주어야 한다. 
        s -= (self.k - self.sl.bisect_left(l)) * l
        s -= (self.k - (self.m - self.sl.bisect_right(r))) * r
        # print(l, r, s, self.st.query(l, r), (self.m - 2*self.k))
        return s // (self.m - 2*self.k)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
