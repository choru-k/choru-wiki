---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - Greedy
  - Work-In-Progress
---

# 240. Search a 2D Matrix II

## 문제

[LeetCode 240](https://leetcode.com/problems/search-a-2d-matrix-ii/) • **Medium**

2가지 방법이 존재한다.

어떠한 방법이든 ← 방향으로는 줄어들고 밑 방향으로는 커지는 성질을 이용한다.

```python
class Solution:
    def searchMatrix(self, matrix, target):
        """
        :type matrix: List[List[int]]
        :type target: int
        :rtype: bool
        """
        if len(matrix) == 0:
            return False
        h, w = len(matrix), len(matrix[0])
        idx = (0, w-1)
        
        while idx[0] < h and idx[1] >= 0:
            val = matrix[idx[0]][idx[1]]
            if val == target:
                return True
            elif val < target:
                idx = (idx[0]+1, idx[1])
            else:
                idx = (idx[0], idx[1]-1)
        
        return False
```

Thus, the overall time complexity can be approximated as O((log n + log m) * recursion depth). In the best-case scenario, this can be very efficient, especially compared to the linear approach. However, the worst-case scenario (where the recursion depth approaches min(n, m)) might still lead to a time complexity that is less favorable compared to simpler methods like the linear search from the top-right corner (O(m + n)).

```python
class Solution:
    def searchMatrix(self, matrix: List[List[int]], target: int) -> bool:
        def searchRec(left, up, right, down):
            # Submatrix has no height or width
            if left > right or up > down:
                return False
            # Target is out of the bounds of the matrix
            elif target < matrix[up][left] or target > matrix[down][right]:
                return False

            mid = (left + right + 1) // 2

            # Binary search to find the split row
            low, high = up, down
            while low <= high:
                mid_row = (low + high) // 2
                if matrix[mid_row][mid] == target:
                    return True
                elif matrix[mid_row][mid] < target:
                    low = mid_row + 1
                else:
                    high = mid_row - 1

            # mid_row is now the smallest index such that matrix[mid_row][mid] > target
            row = low

            return searchRec(left, row, mid - 1, down) or searchRec(mid + 1, up, right, row - 1)

        if not matrix:
            return False

        return searchRec(0, 0, len(matrix[0]) - 1, len(matrix) - 1)
```

`O(n^log_4(3))`

```python
class Solution:
    def searchMatrix(self, matrix: List[List[int]], target: int) -> bool:
        h, w = len(matrix),len(matrix[0])
        def dfs(y1, x1, y2, x2):
            if y1 > y2 or x1 > x2:
                return False
            if (y1, x1) == (y2, x2):
                return matrix[y1][x1] == target
            my, mx = (y1+y2) // 2, (x1+x2) // 2
            
            if target > matrix[my][mx]:
                return (
                    dfs(my+1, mx+1, y2, x2)
                    or dfs(my+1, x1, y2, mx)
                    or dfs(y1, mx+1, my, x2)
                )
            
            return (
                dfs(y1, x1, my, mx)
                or dfs(my+1, x1, y2, mx)
                or dfs(y1, mx+1, my, x2)
            )
            
        ret = dfs(0, 0, h-1, w-1)
        return ret
```

Certainly! Let's compare the three approaches to solve the "search a 2D matrix" problem in terms of their time complexity. The three methods are:

1. **Linear Search from Top-Right Corner (or Bottom-Left Corner)**
2. **Your First Divide-and-Conquer Approach with DFS**
3. **Your Second Divide-and-Conquer Approach with Binary Search**

### 1. Linear Search from Top-Right Corner

- **Time Complexity**: O(m + n), where m is the number of rows, and n is the number of columns.
- **Characteristics**: This approach involves linearly moving either down the rows or left across the columns, depending on the comparison with the target. It's simple and doesn't require additional space or recursion.

### 2. Your First Divide-and-Conquer Approach with DFS

- **Time Complexity**: Approximately O(n^{\log_4{3}}), based on the recurrence relation T(n) = 3T(n/4) + O(1). This is more efficient than linear but not as efficient as binary search.
- **Characteristics**: This method uses a divide-and-conquer strategy, recursively dividing the matrix into up to three smaller submatrices. It's more complex and utilizes recursion, potentially being more efficient than linear search for large matrices.

### 3. Your Second Divide-and-Conquer Approach with Binary Search

- **Time Complexity**: Roughly O(log n * log m), where the matrix is divided using a binary search in the middle column, reducing the search area significantly with each recursive call.
- **Characteristics**: This approach combines binary search with divide-and-conquer, reducing the problem size logarithmically in both dimensions. It's more complex due to recursion and binary searches but can be very efficient for large matrices.

### Comparison and Contextual Use

- **Best for Simplicity and Small Matrices**: The linear search from the top-right corner is the simplest and most straightforward. It is best used for smaller matrices or when simplicity is preferred.
- **Best for Large Matrices with Effective Pruning**: Your first divide-and-conquer approach can be more efficient than linear search in scenarios where the divide-and-conquer strategy significantly reduces the search space quickly. It's suited for larger matrices.
- **Best for Very Large Matrices and Complex Scenarios**: Your second divide-and-conquer approach with binary search is potentially the most efficient for very large matrices. The use of binary search optimizes the division process, making it suitable for complex and large-scale problems.

### Conclusion

- **Linear Search**: Best for simplicity and smaller matrices.
- **First Divide-and-Conquer (DFS)**: More efficient than linear for large matrices, especially where effective pruning is possible.
- **Second Divide-and-Conquer (Binary Search)**: Likely the most efficient for very large matrices, combining the benefits of binary search and divide-and-conquer.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
