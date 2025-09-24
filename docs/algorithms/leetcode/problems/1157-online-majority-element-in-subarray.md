---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - Greedy
  - Math
  - Segment-Tree
---

# 1157. Online Majority Element In Subarray

## 문제

[LeetCode 1157](https://leetcode.com/problems/online-majority-element-in-subarray/) •**Medium**

일단 이 문제는 나누어서 생각해야 한다.

1. 정답 후보를 구한다
2. 정답이 맞는지를 체크를 한다.

일단 2부터 생각해보자.

어떠한 숫자가 있을 때 숫자가 주어진 query 에 대해서 majority 인지 어떻게 알 수 있을까?

다시 생각해보자. 숫자가 주어질 때 주어진 query 안에서 갯수를 어떻게 알 수 있을까?

binary search 을 통해서 쉽게 할 수 있다.

```python
class MajorityChecker:
    def __init__(self, arr: List[int]):
        self.pos = collections.defaultdict(list)
        for idx, num in enumerate(arr):
            self.pos[num].append(idx)
    def query(self, left: int, right: int, threshold: int) -> int:
        num = get_candidate()
        l = bisect.bisect_left(self.pos[num], left)
        r = bisect.bisect_right(self.pos[num], right)
        if r-l >= threshold:
            return num
        return -1
```

이제 남은 Candidate 을 구하는 방법을 생각해보자.

## 확률 적인 방법

만약 특정 범위 안에 majority 가 존재할 경우, 랜덤으로 범위 안에 숫자 1개를 선택할 때 최소 50% 확률로 majority 의 숫자가 선택된다. 10번 할 경우 (1-0.5^10) 의 확률로 정답이 선택되고, 20 번 하면 (1-0.5^20) 의 확률로 정답이 선택된다. 즉 99.9999% 로 정답이 선택된다.

단점: 정답이 선택 안 될 수도 있다.

```python
class MajorityChecker:
    def __init__(self, arr: List[int]):
        self.arr = arr
        self.pos = collections.defaultdict(list)
        for idx, num in enumerate(arr):
            self.pos[num].append(idx)
    def get_candidate(self, left, right):
        return self.arr[random.randint(left, right)]
    
    def query(self, left: int, right: int, threshold: int) -> int:
        for i in range(20):
            num = self.get_candidate(left, right)
            
            l = bisect.bisect_left(self.pos[num], left)
            r = bisect.bisect_right(self.pos[num], right)
            if r-l >= threshold:
                return num
        return -1


# Your MajorityChecker object will be instantiated and called as such:
# obj = MajorityChecker(arr)
# param_1 = obj.query(left,right,threshold)
```

## 모든 경우에 대해 해보기

candidates 에 모든 숫자를 넣는다. 가장 자주 나왔던 숫자의 순서대로 넣는다.

단점: 최악의 경우 O(N) 이 된다??

```python
class MajorityChecker:
    def __init__(self, arr: List[int]):
        self.arr = arr
        self.pos = collections.defaultdict(list)
        for idx, num in enumerate(arr):
            self.pos[num].append(idx)
        self.candidates = sorted(self.pos.keys(), key=lambda x: len(self.pos[x]))[::-1]
        
    
    def query(self, left: int, right: int, threshold: int) -> int:
        for num in self.candidates:
      # arr 전체에 num 이 등장한 횟수보다 threshold 가 더 크면 안함.
            if len(self.pos[num]) < threshold:
                return -1
            
            l = bisect.bisect_left(self.pos[num], left)
            r = bisect.bisect_right(self.pos[num], right)
            if r-l >= threshold:
                return num
        return -1


# Your MajorityChecker object will be instantiated and called as such:
# obj = MajorityChecker(arr)
# param_1 = obj.query(left,right,threshold)
```

## Segment Tree

Segment Tree 을 사용한다. 하지만 일반적인 방법으로 하면 merge 가 O(N) 이 되기 때문에 O(1) 로 만들어 주어야 한다. 그러한 방법으로 Boyer–Moore majority vote algorithm 가 있다

[https://leetcode.com/problems/majority-element-ii/](https://leetcode.com/problems/majority-element-ii/)

[https://en.wikipedia.org/wiki/Boyer–Moore_majority_vote_algorithm](https://en.wikipedia.org/wiki/Boyer%E2%80%93Moore_majority_vote_algorithm)

단점: SegmentTree 가 복잡하기 때문에 실제로는 느리다. 알고리즘이 복잡하다?

```python
class Node:
    def __init__(self, num=0, vote=0):
        self.num = num
        self.vote = vote
        self.left = self.right = None
        self.low = self.high = 0
    
        
class SegmentTree:
    def __init__(self, arr):
        def create(low, high):
            node = Node()
            if low == high:
                node.num = arr[low]
                node.vote = 1
                node.low = node.high = low
            else:
                mid = (low+high) // 2
                node.left = create(low, mid)
                node.right = create(mid+1, high)
                node.low, node.high = low, high
                n = self.merge(node.left, node.right)
                node.num, node.vote = n.num, n.vote
            return node
            
        self.head = create(0, len(arr)-1)
        
    def merge(self, left, right):
        if left.num == right.num:
            return Node(left.num, left.vote + right.vote)
        num = left.num if left.vote > right.vote else right.num
        vote = abs(left.vote - right.vote)
        return Node(num, vote)
    
    def query(self, low, high):
        def dfs(node):
            if high < node.low or node.high < low:
                return Node(0,0)
            if low <= node.low and node.high <=high:
                return node
            left = dfs(node.left)
            right = dfs(node.right)
            return self.merge(left, right)
        return dfs(self.head)
        
class MajorityChecker:
    def __init__(self, arr: List[int]):
        self.seg = SegmentTree(arr)
        self.pos = collections.defaultdict(list)
        for idx, num in enumerate(arr):
            self.pos[num].append(idx)
    def query(self, left: int, right: int, threshold: int) -> int:
        tmp = self.seg.query(left, right)
        num = tmp.num
        l = bisect.bisect_left(self.pos[num], left)
        r = bisect.bisect_right(self.pos[num], right)
        if r-l >= threshold:
            return num
        return -1


# Your MajorityChecker object will be instantiated and called as such:
# obj = MajorityChecker(arr)
# param_1 = obj.query(left,right,threshold)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
