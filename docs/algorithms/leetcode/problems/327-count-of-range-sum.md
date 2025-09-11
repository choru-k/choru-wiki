---
tags:
  - LeetCode
  - Algorithm
  - Merge-Sort
---

# 327. Count of Range Sum

## 문제

[LeetCode 327](https://leetcode.com/problems/count-of-range-sum/) • **Medium**

## 핵심 아이디어

일단 이 문제에 대해서 좀더 생각해보자.

가장 간단한 방법은 모든 조합에 대해서 해 보는 것이다.

범위의 합은 cumulative sum 을 통해서 O(1) 에 알 수 있기 때문에 전체 시간복잡도는 O(N^2) 가 된다.

문제에서는 보다 좋은 시간복잡도를 원한다.

이 문제에서의 2개의 힌트가 있다.

- 갯수만 알면 됨
- 범위의 크기가 중요하지는 않음 (길이 상관 x)

Range 의 길이가 중요하지 않기 때문에 순서에만 영향이 없다면 서로 자리를 바꾸어도 무관하다.

즉 우리는 Merge Sort 을 사용할 수 있다.

## Solution

```python
class Solution:
    def countRangeSum(self, nums: List[int], lower: int, upper: int) -> int:
        sums = [0]
        for num in nums:
            sums.append(sums[-1] + num)
        def sort(arr):
            if len(arr) == 1:
                return arr, 0
            mid = len(arr) // 2
            l, l_cnt = sort(arr[:mid])
            r, r_cnt = sort(arr[mid:])
            cnt = l_cnt + r_cnt
            i, j = 0, 0
            for left in l:
                while i < len(r) and r[i]-left < lower: i+=1
                while j < len(r) and r[j]-left <= upper: j+=1
        # upper 보다 작은 수에서  lower 보다 작은걸 빼면 사이의 갯수가 나온다.
                cnt += j-i
      # 이 부분을 마찬가지로 merge sort의 merge 을 쓰면 O(N) 이 되지만 가독성을 위해 O(NlogN) 을 사용하였다.
            return sorted(arr), cnt
        _, ans = sort(sums)
        # print(k)
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
