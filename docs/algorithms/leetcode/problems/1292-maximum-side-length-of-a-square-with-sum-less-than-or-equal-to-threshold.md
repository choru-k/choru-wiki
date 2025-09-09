---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Sliding-Window
---

# 1292. Maximum Side Length of a Square with Sum Less than or Equal to Threshold

## 문제

[LeetCode 1292](https://leetcode.com/problems/maximum-side-length-of-a-square-with-sum-less-than-or-equal-to-threshold/) • **Medium**

무식한 방법 O(NM*min(NM))

```python
class Solution:
    def maxSideLength(self, mat: List[List[int]], threshold: int) -> int:
        if len(mat) == 0:
            return 0
        h, w = len(mat), len(mat[0])
        
        sums = collections.defaultdict(int)
        
        for i in range(h):
            tmp = 0
            for j in range(w):
                tmp += mat[i][j]
                sums[(i,j)] = tmp + sums[(i-1,j)]
        def get_area(y1,x1,y2,x2):
            return sums[(y2,x2)] - sums[(y2, x1-1)] - sums[(y1-1, x2)] + sums[(y1-1, x1-1)]
        
        ans = 0
        for y in range(h):
            for x in range(w):
                l = 0
                while y+l < h and x+l < w:
                    if get_area(y, x, y+l, x+l) <= threshold:
                        ans = max(ans, l+1)
                    else:
                        break
                    
                    l+=1
                        
        return ans
```

  

  

## Sliding Window

O(NM) 발상은 중복된 계산이 존재한다! 대각선으로 Sliding Window 가 가능.

```python
class Solution:
    def maxSideLength(self, mat: List[List[int]], threshold: int) -> int:
        if len(mat) == 0:
            return 0
        h, w = len(mat), len(mat[0])
        
        sums = collections.defaultdict(int)
        
        for i in range(h):
            tmp = 0
            for j in range(w):
                tmp += mat[i][j]
                sums[(i,j)] = tmp + sums[(i-1,j)]
        def get_area(y1,x1,y2,x2):
            return sums[(y2,x2)] - sums[(y2, x1-1)] - sums[(y1-1, x2)] + sums[(y1-1, x1-1)]
        
        ans = 0
        for y in range(h):
            # (y,0) 에서 시작하는 대각선
            begin, end = 0, 0
            while y+end < h and end<w:
                while begin <= end and get_area(y+begin, begin, y+end, end) > threshold:
                    begin+=1
                ans = max(ans, end-begin+1)
                end+=1
        for x in range(w):
            # (0, x) 에서 시작하는 대각선
            begin, end = 0, 0
            while x+end < w and end < h:
                while begin <= end and get_area(begin, x+begin, end, x+end) > threshold:
                    begin+=1
                ans = max(ans, end-begin+1)
                end+=1
        
                        
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
