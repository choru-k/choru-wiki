---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
---

# 715. Range Module

## 문제

[LeetCode 715](https://leetcode.com/problems/range-module/) • **Medium**

## 핵심 아이디어

일단 가장 쉬운 방법을 생각해보자.

단순하게 모든 range 을 배열로 표현하고 하는것이다

## Solution

```python
from bisect import bisect_left, bisect_right
class RangeModule:

    def __init__(self):
        self.ranges = [False] * 10**9
        

    def addRange(self, left: int, right: int) -> None:
        for i in range(left, right):
            self.ranges[i] = True

    def queryRange(self, left: int, right: int) -> bool:
        return all([self.ranges[i] for i in range(left, right)])
        

    def removeRange(self, left: int, right: int) -> None:
        for i in range(left, right):
            self.ranges[i] = False


# Your RangeModule object will be instantiated and called as such:
# obj = RangeModule()
# obj.addRange(left,right)
# param_2 = obj.queryRange(left,right)
# obj.removeRange(left,right)
```

실제로 돌려보면 Memory 에러가 된다. 배열이 너무 크기 때문이다.

범위을 저장하는 방법을 더욱 압축시켜보자.

간단한 방법으로는 `[start,end]` 로써 저장을한다.

```python
from bisect import bisect_left, bisect_right
class RangeModule:

    def __init__(self):
        self.ranges = []
        

    def addRange(self, left: int, right: int) -> None:
        l = r = len(self.ranges)
        for i in range(len(self.ranges)):
            if i+1 < len(self.ranges) and self.ranges[i][1] < left and right< self.ranges[i+1][0]:
                self.ranges.insert([left, right], i+1)
                break
            if self.ranges[i][0] <= left < self.ranges[i][1]:
                self.ranges[i][1] = max(self.ranges[i][1], right)
            if self.ranges[i][0] <= right < self.rnages[i][1]:
                self.ranges[i][0] = max(self.ranges[i][1], left)
            if self.ranges[i][1] >= self.ranges[i+1][0]:
                self.ranges.pop(i+1)
        

    def queryRange(self, left: int, right: int) -> bool:
        for i in range(len(self.ranges)):
            if self.ranges[i][0] <= left < right <= self.range[i][1]:
                return True
        return False
        

    def removeRange(self, left: int, right: int) -> None:
        # add Range 와 비슷하게


# Your RangeModule object will be instantiated and called as such:
# obj = RangeModule()
# obj.addRange(left,right)
# param_2 = obj.queryRange(left,right)
# obj.removeRange(left,right)
```

위의 코드을 binary search 와 set 을 이용해 최적화 하자.

```python
from bisect import bisect_left, bisect_right
class RangeModule:

    def __init__(self):
        self.ranges = []
        

    def addRange(self, left: int, right: int) -> None:
    # Binary Search O(LogN)
        l = bisect_left(self.ranges, [left])
        r = bisect_left(self.ranges, [right])
        if self.ranges[l-1][0] <= l < self.ranges[l-1][1]:
            self.ranges[l-1][1] = max(self.ranges[l-1][1], right)
        if self.ranges[r][0] <= r < self.ranges[r][1]:
            self.ranges[r][0] = min(self.ranges[r][0], left)
        if self.ragnes[l-1][1] < l < r < self.ranges[r][0]:
            bisect.bisect_insort(self.ranges, [left, right])
               
    # O(N) 
        prev = None
        deleted = set()
        for i in range(len(self.ranges)):
            if prev == None:
                prev = self.ranges[i]
                continue
            if prev[1] >= self.ranges[i][0]:
                deleted.add(i)
            else:
                prev = self.range[i]
        self.ranges = [self.ranges[i] for i in len(self.ranges) if i not in deleted]
        

  # O(LogN)
    def queryRange(self, left: int, right: int) -> bool:
        idx = bisect_left(self.ranges, [left])
        return idx < len(self.ranges) and self.ranges[idx][0] <= left < right <= self.ranges[idx][1]
        
        

    def removeRange(self, left: int, right: int) -> None:
        # add Range 와 비슷하게


# Your RangeModule object will be instantiated and called as such:
# obj = RangeModule()
# obj.addRange(left,right)
# param_2 = obj.queryRange(left,right)
# obj.removeRange(left,right)
```

하지만 코드가 매우 복잡해진다. 조금더 간단히 생각해보자. 현재 범위가 `(1,3), (6,10)` 이라면 현재는`[[1,3], [6,10]]` 로 저장을 했다. 이걸 `[1,3,6,10]` 으로 저장해도 될까? 문제 없을 것 같다. 왜냐하면 모든 범위는 중복 된다면 합쳐지기 때문에 항상 범위는 열리고 닫힌다. 이러한 규칙을 이용해서 binary search 을 보다. 기본적인 방법은 똑같다. 하지만 1d-array 로 표현함 으로써 코드가 보다 간단해졌다.

```python
from bisect import bisect_left, bisect_right
class RangeModule:

    def __init__(self):
        self.ranges = []
        

 # O(N)
    def addRange(self, left: int, right: int) -> None:
        l = bisect_left(self.ranges, left)
        r = bisect_right(self.ranges, right)
        block = []
        if l%2 == 0:
            block.append(left)
        if r%2 == 0:
            block.append(right)
        self.ranges[l:r] = block

  # O(logN)
    def queryRange(self, left: int, right: int) -> bool:
        l = bisect_right(self.ranges, left)
        r = bisect_left(self.ranges, right)
        return l==r and l%2 == 1
        

    def removeRange(self, left: int, right: int) -> None:
        l = bisect_left(self.ranges, left)
        r = bisect_right(self.ranges, right)
        block = []
        if l%2 == 1:
            block.append(left)
        if r%2 == 1:
            block.append(right)
        self.ranges[l:r] = block


# Your RangeModule object will be instantiated and called as such:
# obj = RangeModule()
# obj.addRange(left,right)
# param_2 = obj.queryRange(left,right)
# obj.removeRange(left,right)
```

만약 c++ 의 Map 같은 self-balanced tree 을 사용한다면 어떻게 될까?

Map 의 경우 append, delete 가 LogN 이 되기 때문에 보다 효율적으로 될 것이라고 예상할 수 있다. 하지만 모든 범위을 다 포함하는 새로운 범위가 생길때 모든 Node 을 지워야 하고 그 경우 NLogN 이 된다.

Map 을 사용하는 방법일 경우 3번째 코드와 거의 유사하게 작동한다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
