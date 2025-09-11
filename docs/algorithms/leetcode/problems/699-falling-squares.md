---
tags:
  - LeetCode
  - Algorithm
  - Segment-Tree
---

# 699. Falling Squares

## 문제

[LeetCode 699](https://leetcode.com/problems/falling-squares/description/) • **Hard**

## 핵심 아이디어

Lazy Segment !

값이 잘 변하는!

lazy 는 복잡하니 그때그때 lazy 를 안쓰고 propagate! 어차피 propagate 시간복잡도는 O(1)

이러면 return 값은 항상 node.val 이 됨.

## Solution

```python
class SegmentNode:
    def __init__(self, l: int, r: int):
        self.l, self. r = l, r
        self.val = 0
        self.lazy = 0
        self._left: SegmentNode = None
        self._right: SegmentNode = None
    
    @property
    def m(self):
        return (self.l + self.r) // 2
    
    @property
    def left(self):
        if self._left is None:
            self._left = SegmentNode(self.l, self.m)
        return self._left
    
    @property
    def right(self):
        if self._right is None:
            self._right = SegmentNode(self.m+1, self.r)
        return self._right
    
    def propagtate(self):
        if self.lazy == 0:
            return
        if self.l != self.r:
            self.left.lazy = self.lazy
            self.right.lazy = self.lazy
        self.val = self.lazy
        self.lazy = 0

class SegmentTree:
    def __init__(self, l, r):
        self.head = SegmentNode(l, r)
    
    def query(self, l, r):
        def dfs(node: SegmentNode):
            # 아 node.lazy 신경쓰기 싫어. node.propagate!
            node.propagtate()
            if node.r < l or r < node.l:
                return 0
            elif l <= node.l and node.r <= r:
                return node.val
            else:
                left, right = dfs(node.left), dfs(node.right)
                return max(left, right)
        return dfs(self.head)
            
    
    def update(self, l, r, val):
        def dfs(node: SegmentNode):
            if node.r < l or r < node.l:
                pass
            elif l <= node.l and node.r <= r:
                if l == r:
                    node.val = val
                else:
          # node.lazy 가 생겨버렸잖아. 바아아아아로 node.propagate!
                    node.lazy = val
                    node.propagtate()
            else:
                left, right = dfs(node.left), dfs(node.right)
                node.val = max(left, right)
            return node.val
        dfs(self.head)

class Solution:
    def fallingSquares(self, positions: List[List[int]]) -> List[int]:
        mn = min(x for x, _ in positions)
        mx = max(x+d for x, d in positions)
        sgtree = SegmentTree(mn, mx)
        ret = []
        for x, d in positions:
            cur = sgtree.query(x, x+d-1)
            sgtree.update(x, x+d-1, cur+d)
            tmp = sgtree.query(mn, mx)
            ret.append(tmp)
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
