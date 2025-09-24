---
tags:
  - LeetCode
  - Algorithm
  - Boundary-Count
  - Segment-Tree
---

# 732. My Calendar III

## 문제

[LeetCode 732](https://leetcode.com/problems/my-calendar-iii/) •**Medium**

가장 쉬운 방법은 모든 날짜를 배열로 만들고 하나하나 직접 해보는 것이다.

당연하겠지만 `O(N* 10^9)` 은 너무 크다.

조금 생각해보자.

### Boundary Count

이런 종류의 문제는 , 즉 start / end 가 존재하는 문제는 대부분 `boundary count` 방법으로 풀 수가 있다.

Boundary Count 방법은 표준라이브러리의 부족 때문에 python 으로는 구현하기 힘들다. 실제 면접이라면 c++ 의 Map 이라고 설명하면서 적당히 말하면 될 것 같다.

```python
class MyCalendarThree(object):

    def __init__(self):
        self.delta = collections.Counter()

    def book(self, start, end):
        self.delta[start] += 1
        self.delta[end] -= 1

        active = ans = 0
        for x in sorted(self.delta):
            active += self.delta[x]
            if active > ans: ans = active

        return ans
```

python 의 경우에는 배번 sort 을 하기 때문에 `O(N^2logN)` 이지만 Map 이 존재한다면 `O(N*logN + N*N)` 즉 `O(N^2)` 가 된다.

### Segment Tree

Segment Tree 을 사용해서 풀 수가 있을까?

조금 생각해보자.

단순하게 segment 을 쓰면 TLE 가 된다. 왜냐하면 기본적으로 Segment Tree 는 Tree 을 만들 때 O(Range) 가 필요하기 때문이다. 하지만 우리는 Range >> N 을 알기 때문에 Dynamic Segment Tree 을 사용 할 수 있다.

```python

class MyCalendarThree:
    def __init__(self):
        self.segments = collections.defaultdict(int)
        self.lazys = collections.defaultdict(int)

    def book(self, start: int, end: int) -> int:
        def update(id, low, high):
            if end <= low or high <= start:
                return
            if start <= low < high <= end:
                self.segments[id] +=1
                self.lazys[id] +=1
            else:
                mid = (low+high) // 2
                update(id*2, low, mid)
                update(id*2+1, mid, high)
                self.segments[id] = self.lazys[id] + max(self.segments[id*2], self.segments[id*2+1])
        update(1, 0, pow(10, 9))
        return self.segments[1] + self.lazys[1]
        
    
        
            

# Your MyCalendarThree object will be instantiated and called as such:
# obj = MyCalendarThree()
# param_1 = obj.book(start,end)
```

```python
class MyCalendarThree:
    def __init__(self):
        self.segments = collections.defaultdict(int)
        self.lazys = collections.defaultdict(int)

    def book(self, start: int, end: int) -> int:
        def update(id, low, high, val, start, end):
            if end <= low or high <= start:
                return 0 
            if start <= low < high <= end:
                self.segments[id] +=val
                self.lazys[id] +=val
                return self.segments[id] 
            else:
                mid = (low+high) // 2
                l=update(id*2, low, mid, val, start, end)
                r=update(id*2+1, mid, high, val, start, end)
                self.segments[id] = self.lazys[id] + max(self.segments[id*2], self.segments[id*2+1])
                return self.lazys[id] + max(l, r)
            
        update(1, 0, pow(10, 9), 1, start, end)
        return update(1, 0, pow(10, 9), 0, 0, pow(10,9))
        
        


# Your MyCalendarThree object will be instantiated and called as such:
# obj = MyCalendarThree()
# param_1 = obj.book(start,end)
```

```python
class Node:
    def __init__(self):
        self.val = self.lazy = 0
        self.left = self.right = None
class MyCalendarThree:
    def __init__(self):
        self.head = Node()

    def book(self, start: int, end: int) -> int:
        def update(node, low, high, val, start, end):
            if node == None:
                node = Node()
            if end <= low or high <= start:
                return [node, 0]
            if start <= low < high <= end:
                node.val += val
                node.lazy += val
                return [node, node.val]
            else:
                mid = (low+high) // 2
                node.left, l=update(node.left, low, mid, val, start, end)
                node.right, r=update(node.right, mid, high, val, start, end)
                node.val = node.lazy + max(node.left.val, node.right.val)
                return [node, node.lazy + max(l, r)]
            
        update(self.head, 0, pow(10, 9), 1, start, end)
        return update(self.head, 0, pow(10, 9), 0, 0, pow(10,9))[1]
        
        


# Your MyCalendarThree object will be instantiated and called as such:
# obj = MyCalendarThree()
# param_1 = obj.book(start,end)
```

```python
class Node:
    def __init__(self,l,r):
        self.l = l
        self.r = r
        self.val = self.lazy = 0
        self.left = self.right = None
class MyCalendarThree:
    def __init__(self):
        self.head = Node(0, pow(10,9))

    def book(self, start: int, end: int) -> int:
        def update(node, val, start, end):
            if end <= node.l or node.r <= start:
                return 0
            if start <= node.l < node.r <= end:
                node.val += val
                node.lazy += val
                return node.val
            else:
                mid = (node.l+node.r) // 2
                if node.left == None:
                    node.left = Node(node.l, mid)
                if node.right == None:
                    node.right = Node(mid, node.r)
                l=update(node.left, val, start, end)
                r=update(node.right, val, start, end)
                node.val = node.lazy + max(node.left.val, node.right.val)
                return node.lazy + max(l, r)
            
        update(self.head, 1, start, end)
        return update(self.head, 0, 0, pow(10,9))
        
        


# Your MyCalendarThree object will be instantiated and called as such:
# obj = MyCalendarThree()
# param_1 = obj.book(start,end)
```

```python
class SegmentNode:
    def __init__(self, l, r):
        self.l:int = l
        self.r:int = r
        self.val:int = 0
        self.lazy:int = 0
        self._left: SegmentNode = None
        self._right: SegmentNode = None
        
    @property
    def left(self):
        if self._left == None:
            mid = (self.l + self.r) // 2
            self._left = SegmentNode(self.l, mid)
        return self._left

    @property
    def right(self):
        if self._right == None:
            mid = (self.l + self.r) // 2
            self._right = SegmentNode(mid+1, self.r)
        return self._right

    def propagate(self):
        left, right = self.left, self.right
        left.lazy += self.lazy
        right.lazy += self.lazy
        self.val += self.lazy
        self.lazy = 0
    
class SegmentTree:
    def __init__(self, l, r):
        self.head = SegmentNode(l, r)
    
    def query(self, l, r):
        def dfs(node):
            if r < node.l or l > node.r:
                return 0
            if l <= node.l and node.r <= r:
                return node.val + node.lazy
            ret = max(dfs(node.left), dfs(node.right))
            return ret
        return dfs(self.head)
    def update(self, l, r, val):
        def dfs(node):
            node.propagate()
            if r < node.l or l > node.r:
                return node.val
            if l <= node.l and node.r <= r:
                node.lazy += val
                return node.lazy + node.val
            node.val = max(dfs(node.left), dfs(node.right))
            return node.val
        dfs(self.head)

class MyCalendarThree:

    def __init__(self):
        self.sgtree = SegmentTree(0, 10**9)

    def book(self, startTime: int, endTime: int) -> int:
        self.sgtree.update(startTime, endTime-1, 1)
        
        return self.sgtree.query(0, 10**9)


# Your MyCalendarThree object will be instantiated and called as such:
# obj = MyCalendarThree()
# param_1 = obj.book(startTime,endTime)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
