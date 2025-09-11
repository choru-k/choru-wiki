---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - Kth-Element
---

# 786. K-th Smallest Prime Fraction

## 문제

[LeetCode 786](https://leetcode.com/problems/k-th-smallest-prime-fraction/) • **Hard**

## 핵심 아이디어

[[Spaces/Home/PARA/Resource/Leetcode/378. Kth smallest element in a sorted Matrix]]

[[Spaces/Home/PARA/Resource/Leetcode/719. Find K-th Smallest Pair Distance]]

와 매우 비슷하다.

똑같이 matrix 로 생각하자. row 을 p, col을 q 라고 생각할 경우

왼쪽으로 갈 수록 작아지고, 내려갈수록 커지는 matrix 을 고려할 수 있다. 비슷한 방법으로 풀면 되지만 이 문제의 다른 점은 범위가 실수라는 것이다.

## Solution

```python
class Solution:
    def kthSmallestPrimeFraction(self, nums: List[int], k: int) -> List[int]:
        n = len(nums)
        def check(num):
            col = 0
            cnt = 0
            p,q = 0,1
            for row in range(n):
                while col < n and nums[row] / nums[col] > num:
                    col += 1
                if col < n and p/q < nums[row] / nums[col]: p,q = nums[row], nums[col]
                cnt += (n - col)
            return (cnt, p, q)
        
        start = 0
        end = 1
        
        while start < end:
            mid = (start + end)/2
            (cnt, p, q) = check(mid)
            if cnt < k:
                start = mid
            elif cnt > k:
                end = mid
            else:
                return [p, q]
```

실수의 경우 무한정 binary search 가 불가능 하기 때문에 최소의 최대 값을 구한다. 즉 mid 보다 작은 분수들 중 최대의 값을 구한다. mid 의 cnt 와 최소의 최대 값의 cnt 는 같기 때문에 그러한 값을 return 해 주면 된다.

이 알고리즘의 시간 복잡도는 구하기 어려운데 binary search 을 중지하는 시점이 애매모호 하기 때문이다. 최악의 경우 한번의 search 당 1개의 후보만이 탈락 될 수 있고 그 경우 `O(n * n^2)` 가 되겠지만 보다 huge factor 로 나뉘어 질 것이고, 만약 각각의 분수가 long으로 구분되어 질 수 있다면 실수 부는 32bit 을 사용하기 때문에 `O(n * log32)` 라고 예상할 수 있다.

물론 비슷한 원리로 Heap 도 가능하다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
