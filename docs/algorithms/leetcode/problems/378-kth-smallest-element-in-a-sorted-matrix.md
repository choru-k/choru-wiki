---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - Heap
  - Kth-Element
---

# 378. Kth smallest element in a sorted Matrix

## 문제

[LeetCode 378](https://leetcode.com/problems/kth-smallest-element-in-a-sorted-matrix/description/) • **Medium**

[https://leetcode.com/problems/find-k-th-smallest-pair-distance/discuss/109082/Approach-the-problem-using-the-"trial-and-error"-algorithm](https://leetcode.com/problems/find-k-th-smallest-pair-distance/discuss/109082/Approach-the-problem-using-the-%22trial-and-error%22-algorithm)

문제 자체는 매우 심플하다.

푸는 법은 2가지가 있다.

## Heap 을 사용한 방법

첫 번째 열의 모든 숫자를 Heap 넣는다. 그 뒤에 heap 에서 숫자를 하나 뽑아내고 그 다음 열의 숫자를 넣는다. 이걸 k 번 반복하면 k 번째 작은 숫자가 나오게 된다. 시간복잡도는 `O(k logn)` , 공간 복잡도는 `O(n)` 이 된다.

```python
import heapq

class Solution:
    def kthSmallest(self, matrix: List[List[int]], k: int) -> int:
        arr = []
        for i in range(len(matrix)):
            heapq.heappush(arr, (matrix[i][0], i, 0))
        
        
        for _ in range(k):
            (val, row, col) = heapq.heappop(arr)
            if col < len(matrix[0])-1:
                heapq.heappush(arr, (matrix[row][col+1], row, col+1))
        
        return val
```

비슷한 문제로는 [https://leetcode.com/problems/merge-k-sorted-lists/](https://leetcode.com/problems/merge-k-sorted-lists/) 가 있다.

## Binary Search 을 이용한 방법

일반적인 Binary Search 의 경우 index 을 기준으로 Search 을 한다. 예를 들어 정렬되어 있는 배열에서 특정 숫자를 찾고 싶을 때, 각각의 index을 기준으로 Binary Search 을 하였다. 하지만 이 문제에서는 우리는 전체 정답이 될 것 같은 후보들 중에서 정답을 찾아야 한다. 정답의 후보는 matrix의 최솟값 ~ 최댓값 사이이다. 만약 특정 숫자가 주어질 때 그 숫자가 정답이 될 수 있는지를 판단하는 함수를 `check` 라고 만들었다.

- 관련 문제 [https://leetcode.com/problems/search-a-2d-matrix/](https://leetcode.com/problems/search-a-2d-matrix/)

check 의 시간복잡도는 `O(n)` , Search 의 시간 복잡도는 `log(max - min)` (배열의 최댓값, 최솟값) 이기 때문에 전체의 시간 복잡도는 `O(n log(max-min))` 이 된다.

```python
class Solution:
    def kthSmallest(self, matrix: List[List[int]], k: int) -> int:
        n = len(matrix)
        def check(num):
            col = n-1
            row = 0
            cnt = 0
            
            while row < n and col >=0:
                if matrix[row][col] <= num:
                    cnt += (col+1)
                    row += 1
                else:
                    col -= 1
            return cnt
        
        start = matrix[0][0]
        end = matrix[n-1][n-1]
        
        while start <= end:
            mid = int((start + end) / 2)
            cnt = check(mid)
            if (cnt < k) : start = mid + 1
            else: end = mid - 1
        
        
        return start
```

- 관련 문제 : [https://leetcode.com/problems/find-k-th-smallest-pair-distance/](https://leetcode.com/problems/find-k-th-smallest-pair-distance/)

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
