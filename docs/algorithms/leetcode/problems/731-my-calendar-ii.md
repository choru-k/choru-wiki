---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
---

# 731. My Calendar II

## 문제

[LeetCode 731](https://leetcode.com/problems/my-calendar-ii/) • **Medium**

일단 가장 간단한 방법부터 생각해보자.

그건 입력이 들어올 때마다 지금까지 들어왔던 모든 입력을 다시 보는 것이다.

일단 현재까지의 모든 예약을 calendar 에 넣는다.

그 뒤에 겹치는 부분만 overlaps 에 넣는다.

```python
class MyCalendarTwo:
    def __init__(self):
        self.overlaps = []
        self.calendar = []

    def book(self, start, end):
        for i, j in self.overlaps:
            if start < j and end > i:
                return False
        for i, j in self.calendar:
            if start < j and end > i:
                self.overlaps.append((max(start, i), min(end, j)))
        self.calendar.append((start, end))
        return True
```

이 방법은 매우 간단하다. 이제 조금 더 발전시켜보자.

[https://leetcode.com/problems/my-calendar-i/](https://leetcode.com/problems/my-calendar-i/)

위의 문제에서는 binary search tree 을 사용 할 수 있었다.

이번에도 binary search tree 을 사용할 수 잇지 않을까?

```python
class Node:
    def __init__(self, start, end, duplicated=False):
        self.start = start
        self.end = end
        self.left = self.right = None
        self.duplicated = duplicated
    

class MyCalendarTwo:

    def __init__(self):
        self.head = Node(-1,-1)

    def book(self, start: int, end: int) -> bool:
        if not self.search(start, end, self.head):
            return False
        self.insert(start, end, self.head)
        return True
        
    def search(self, start, end, node):
        if start >= end or node == None:
            return True
        if end <= node.start:
            return self.search(start, end, node.left)
        if node.end <= start:
            return self.search(start, end, node.right)
        return not node.duplicated and self.search(start, node.start, node.left) and self.search(node.end, end, node.right)
    
    def insert(self, start, end, node):
        if start >= end:
            return node
        if node == None:
            return Node(start, end)
        
        if end <= node.start:
            node.left = self.insert(start, end, node.left)
            return node
        if node.end <= start:
            node.right = self.insert(start, end, node.right)
            return node
        
        
        s1,s2,e1,e2 = sorted([start, end, node.start, node.end])
        
        n = Node(s2, e1, True)
        n.left = self.insert(s1, s2, node.left)
        
        n.right = self.insert(e1, e2, node.right)
        
        
        return n
        
        
    

# Your MyCalendarTwo object will be instantiated and called as such:
# obj = MyCalendarTwo()
# param_1 = obj.book(start,end)
```

우리는 겹치는 4가지 경우를 생각할 수 있고, 3개의 범위로 범위가 나뉘어 진다는 것을 알 수 있다.

현재 node 의 start, end 을 바꾸는 것으로 범위를 쉽게 업데이트 할 수 있다.

## Lazy SegmentTree

```python
class MyCalendarTwo:
    def __init__(self):
        self.segments = collections.defaultdict(int)
        self.lazys = collections.defaultdict(int)

    def book(self, start: int, end: int) -> int:
        def update(id, low, high, val):
            if end <= low or high <= start:
                return 0 
            if start <= low < high <= end:
                self.segments[id] +=val
                self.lazys[id] +=val
                return self.segments[id]
            else:
                mid = (low+high) // 2
                l=update(id*2, low, mid, val)
                r=update(id*2+1, mid, high, val)
                self.segments[id] = self.lazys[id] + max(self.segments[id*2], self.segments[id*2+1])
                return self.lazys[id] + max(l, r)
            
        if update(1, 0, pow(10, 9), 0) >= 2:
            return False
        update(1, 0, pow(10, 9), 1)
        return True
        
        


# Your MyCalendarTwo object will be instantiated and called as such:
# obj = MyCalendarTwo()
# param_1 = obj.book(start,end)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
