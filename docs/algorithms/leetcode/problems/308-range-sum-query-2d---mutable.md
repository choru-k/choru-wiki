---
tags:
  - LeetCode
  - Algorithm
  - Segment-Tree
---

# 308. Range Sum Query 2D - Mutable

## 문제

[LeetCode 308](https://leetcode.com/problems/range-sum-query-2d-mutable/) • **Medium**

총 2가지의 풀이법이 있다.

1개는 단순한 Cumulative sum 을 사용하는 것이고 2번째는 Segment Tree 을 사용하는 방법이다.

2D segment Tree

[http://www.secmem.org/blog/2018/12/23/segment-tree-2d-range-update-query/](http://www.secmem.org/blog/2018/12/23/segment-tree-2d-range-update-query/)

  

만약 `sums[row][col] = row` 줄의 0~col 까지의 cumulative sum 일 경우 update 는 O(n), sum 은 O(n) 이 된다.

  

Segment Tree 의 경우 update 는 O(logN) sum 은 O(NlogN) 이 된다.

  

즉 update 가 자주 일어나는지, sum 이 자주 일어나는지에 따라 최적의 알고리즘이 달라진다.

  

## Segment Tree

```python
class SegmentTree:
    def __init__(self, nums):
        self.length = len(nums)
        self.nodes= [0] * len(nums) * 4
        def dfs(idx, l, r):
            if l == r:
                self.nodes[idx] = nums[l]
            else:
                mid = (l+r)//2
                self.nodes[idx] = dfs(idx*2, l, mid) + dfs(idx*2+1, mid+1, r)
            return self.nodes[idx]
        dfs(1, 0, self.length-1)
        
    def update(self, col, num):
        def dfs(idx, l, r):
            if col < l or r < col:
                return 0
            elif r == l:
                diff = num - self.nodes[idx]
                self.nodes[idx] = num
                return diff
            else:
                mid = (l+r)//2
                diff = dfs(idx*2, l, mid) + dfs(idx*2+1, mid+1, r)
                self.nodes[idx] += diff
                return diff
        dfs(1, 0, self.length-1)
    def sum(self, start, end):
        def dfs(idx, l, r):
            if end < l or r < start:
                return 0
            elif start <= l  and r <= end:
                return self.nodes[idx]
            else:
                mid = (l+r) // 2
                return dfs(idx*2, l, mid) + dfs(idx*2+1, mid+1, r)
        return dfs(1, 0, self.length-1)

class NumMatrix:

    def __init__(self, matrix: List[List[int]]):
        self.segmentTrees = [SegmentTree(nums) for nums in matrix]
        
    def update(self, row: int, col: int, val: int) -> None:
        self.segmentTrees[row].update(col, val)

    def sumRegion(self, row1: int, col1: int, row2: int, col2: int) -> int:
        return sum([self.segmentTrees[row].sum(col1, col2) for row in range(row1, row2+1)])


# Your NumMatrix object will be instantiated and called as such:
# obj = NumMatrix(matrix)
# obj.update(row,col,val)
# param_2 = obj.sumRegion(row1,col1,row2,col2)
```

  

## 2D Segment Tree

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
