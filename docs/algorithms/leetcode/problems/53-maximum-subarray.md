---
tags:
  - LeetCode
  - Algorithm
  - Divide-and-Conquer
  - Greedy
---

# 53. Maximum Subarray

## 문제

[LeetCode 53](https://leetcode.com/problems/maximum-subarray/) • **Easy**

[https://leetcode.com/problems/maximum-subarray/](https://leetcode.com/problems/maximum-subarray/)

매우 유명한 문제네요.

## Brute Force

일단 가장 쉬운 방법은 모든 경우에 대해서 해보는 것 입니다.

시작과 끝을 정하고, subarray 의 합을 구해 봅시다.

```python
class Solution:
    def maxSubArray(self, nums: List[int]) -> int:
        ret = float('-inf')
        for s in range(len(nums)):
            for e in range(s, len(nums)):
                ret = max(ret, sum(nums[s:e+1]))
        return ret
```

위의 코드의 시간 복잡도는 `O(N^3)` 입니다.

`prefix sum` 을 이용하여서 subarray 의 합을 `O(1)` 로 구할 수 있습니다.

```python
class Solution:
    def maxSubArray(self, nums: List[int]) -> int:
        sums = [0]
        for num in nums:
            sums.append(sums[-1] + num)
        ret = float('-inf')
        for s in range(len(nums)):
            for e in range(s, len(nums)):
                ret = max(ret, sums[e+1]-sums[s])
        return ret
```

## Divide and Conquer

이제 조금 더 생각 해 봅시다.

이 배열을 반으로 나눈다고 할 때, 정답은 왼쪽의 배열 또는 오른쪽의 배열 또는 중간을 지나는 배열이라고 생각 할 수 있습니다.

중간을 지나는 배열의 최대 subarray sum 은 어떻게 구할 까요?

중간점이 mid 라고 하고, 최대 sum 을 가지는 subarray 을 nums[l:r+1] 이라고 해봅시다.

그러면 $l \leq mid \leq r$﻿ , $max_l(max_r(\sum_{i=l}^rnum_i))$﻿ 로 우리가 원하는 식을 적을 수 있습니다.

$max_l(max_r(\sum_{i=l}^{mid}num_i + \sum_{i=mid+1}^{r}num_i)) = \\max_l(max_r(\sum_{i=l}^{mid}num_i)) + max_l(max_r(\sum_{i=mid+1}^{r}num_i))$

$max_l(\sum_{i=l}^{mid}num_i)+max_r(\sum_{i=mid+1}^{r}num_i)$﻿ 로 식을 변형할 수 있고, 이것은 쉽게 선형시간으로 구할 수 있습니다.

```python
class Solution:
    def maxSubArray(self, nums: List[int]) -> int:

        if len(nums) == 1:
            return nums[0]
    # 모든 숫자가 0 보다 작으면 가장 큰걸 리턴. 최소길이가 1이여야 하기 때문에 
        if all(num < 0 for num in nums):
            return max(nums)
        n = len(nums)
    # 왼쪽, 오른쪽의 sub-problem
        ret = max(0, self.maxSubArray(nums[:n//2]), self.maxSubArray(nums[n//2:]))
    # 중간을 지나는 subarray 의 최대 값.
        l = cur = 0
        for i in range(n//2-1, -1, -1):
            cur += nums[i]
            l = max(l, cur)
        r = cur = 0
        for i in range(n//2, len(nums)):
            cur += nums[i]
            r = max(r, cur)
        ret = max(ret, l+r)
        return ret
```

## Greedy

조금 더 쉽게 생각해 보죠.

우리가 원하는 subarray 가 `nums[l:r+1]` 이라고 해봅시다.

`l ≤ x ≤ r` 을 만족하는 x 중에서 `sum(nums[l:x])<0` 을 만족하는 x 가 존재할 수 있을까요?

`sum(nums[l:r+1]) = sum(nums[l:x]) + sum(nums[x:r])` 일 때 만약 `sum(nums[l:x])<0` 이라면

`sum(nums[l:r+1])` < `sum(nums[x:r])` 을 만족하게 됩니다.

즉 우리가 정답이라고 생각한 sub array 가 정답이 아니게 되고 모순이 일어납니다. 즉, 우리가 원하는 subarray 에는 위의 조건과 같은 x 는 존재 할 수 없습니다.

이것을 이용해서 구현을 해봅시다.

시간복잡도는 `O(N)` 이 됩니다.

```python
class Solution:
    def maxSubArray(self, nums: List[int]) -> int:
        cur = 0
        ret = float('-inf')
        for num in nums:
            cur += num
            ret = max(ret, cur)
            if cur < 0:
                cur = 0
        return ret
```

## Follow Up

- 곱이 최대가 되는 sub-array는? 정수 이외에 절댓값 1 이하의 수도 배열에 존재한다고 가정( 원래 문제를 곱셈 문제로) 단 모든 수는 0 이상

    이 문제는 간단하다. 원래 문제에서는 앞의 배열의 합이 마이너스면 배열을 새로시작할 수 있었다.

    이번 문제에서는 앞까지의 곱이 1 이하면 배열을 새로 시작하면 된다.

    ```python
    def solve(nums):
      ans = 0
      cur = 1
      for num in nums:
        cur *= num
        ans = max(ans, cur)
        # 앞에서의 합이 마이너스이면 정답 배열을 새로 시작한다. cur=0
        if cur < 1: 
          cur = 1
      return ans
    ```

- 곱이 최대가 되는 sub-array는? 단 음수인 정수도 존재. 절댓값 1 이하는 없음

    이 문제에서 하나 확신 할 수 있는 것은, 곱할 수록 숫자의 절댓값은 무조건 커진다는 것이다.

    ```python
    class Solution:
        def maxProduct(self, nums: List[int]) -> int:
            max_num = 1
            min_num = 1
            ans = float('-inf')
            for num in nums:
          # 만약 num 이 양수라면 max_num, min_num 는 num 을 곱한 수가 되고
          # num 이 음수라면, max_num = min_num*num, min_num = max_num*num 이 될 것이다.
          # num 이 0이 될수도 있기 때문에, num 까지 비교해준다.
                max_num, min_num = max(max_num * num, min_num * num, num), min(max_num * num, min_num * num, num)
                ans = max(max_num, min_num, ans)
                
            return ans
    ```

- 곱이 최대가 되는 sub-array는? 숫자는 모든 실수 범위

    매우 복잡한 문제이다. `O(N)` 의 방법은 잘 모르겠다.

    하지만 Divide and Conquer 을 사용할 경우 똑같은 방식으로 풀수가 있다. 다만 get_cross 에서 최소값과, 최댓값 둘다 필요하다.

    ```python
    def get_cross(nums):
      l_max = l_min = 1
      r_max = r_min = 1
      mid = len(nums)//2
      l, r = mid, mid
      l_cur, r_cur = 1
      # 무조건 중간을 지나기 때문에 l_max, r_max 는 중간부터 시작한 배열의 최대 합 이여야 한다.
      while l>=0:
        l_cur *= nums[l]
        l_max = max(l_max, l_cur)
        l_min = min(l_min, l_cur)
        l-=1
      while r < len(nums):
        r_cur *= nums[r]
        r_max = max(r_max, r_cur)
        r_min = min(r_min, r_cur)
        r+=1
      # 정답은 양수*양수, 음수*음수 2개중 한개가 된다.
      return max(l_max*r_max, l_min*r_min)
    ```

- 길이가 k 이상인 sub-array 중에서 최댓값을 구하는 방법은? (원래 문제에서 sub-array의 최소 길이 추가)

    최대합을 다시한번 생각해봅시다

    $\sum _{i=l}^ra_i = \sum_{i=0}^ra_i - \sum_{i=0}^{l-1}a_i$

    로 정의 될 수 있습니다. 어떠한 배열의 순서쌍 `(x,r)` 의 배열합 `nums[x]+nums[x+1]+...+nums[r]` 은 `0~r` 까지의 합 에서 `0~x-1` 까지의 합을 빼면 됩니다.

    즉 `r` 로 끝나는 부분 배열의 합을 최대로 하기 위해서는 `0~x` 까지의 합이 최소가 되는 x 을 고르면 됩니다.

    ```python
    def solve(nums, k):
      cur = 0
      ans = 0
      prev_min = 0 
      prev_cur = 0
      for i in range(len(nums)):
        cur += nums[i]
        # 0~x 중 가장 부분합이 작은 x 을 구한다.
        for x in range(i-k):
          prev_cur += nums[x]
          prev_min = min(prev_min, prev_cur)
         # i 로 끝나는 부분배열중 합이 가장 큰 부분배열의 합은 cur-prev_min 이 됩니다.
         ans = max(ans, cur-prev_min)
      return ans
    ```

    `0~x` 까지의 최소의 부분합은 i 가 1 커진다면, 그 최소합과 `0~x+1`의 합만 비교해서 더 작은게 `0~x+1` 까지의 최소 부분합이 된다.

    `0~x+1`의 최소 부분합 = min(`0~x` 의 최소 부분합, `0~x+1` 의 합)

    그래서 최적화 할 수 있다.

    ```python
    def solve(nums, k):
      cur = 0
      ans = 0
      prev_min = 0 
      prev_cur = 0
      for i in range(len(nums)):
        cur += nums[i]
        if i >= k-1:
          prev_cur += nums[i-k] if i-k>=0 else 0
          prev_min = min(prev_min, prev_cur)
          # i 로 끝나는 부분배열중 합이 가장 큰 부분배열의 합은 cur-prev_min 이 됩니다.
          ans = max(ans, cur-prev_min)
      return ans
    ```

    시간복자도는 `O(N)`

- 2차원 matrix 가 주어질 때 합이 최대가 되는 직사각형의 합은? (원래 문제를 2차원으로 확장)

    유명한 문제이다. 너비를 w 높이를 h 라고 하자.

    `(x1, y1, x2, y2)` 로 이루어진 직사각형의 합은 `(0, 0, x2, y2)` - `(0,0,x2, y1)` - `(0,0,x1,y2)` + `(0,0,x1,x2)` 이 된다. 그렇기 때문에 미리 `(0,0,x,y)` 의 직사각형의 합을 `cumluative sum` 으로 계산해 놓으면 `O(1)` 에 계산이된다. 이걸 점 2개의 순서쌍에 대해서 하기 때문에 전체 시간 복잡도는 `O(l^2*h^2)` 가 된다.

    ![[_.png]]

    보다 효율 적인 방법.

    만약 우리가 직사각형의 두 변을 고정한다고 한다. 밑에서는 2번째 열과, 4번째 열을 고정하였다.

    그 다음에 우리가 할 일은 이러한 두 변을 갖는 직사각형 중 합이 최대가 되는 행을 찾는 것이다.

    우리가 열 2개를 선택하였다면, 각 행들의 합으로 1차원 배열을 만들수 있다.

    밑의 경우 `[6,20,16]` 이다.

    ![[__2.png]]

    만약 이러한 각 행들의 합이 `[-3,2,5,1,-4]` 일 경우 합이 최대가 되는 행의 시작과, 끝을 찾아야 한다.

    이걸 잘 보면 우리의 맨처음 문제와 동일 하다는 것을 알 수가 있다. 즉 열을 2개 고정해 놓으면 문제를 1차원 문제로 바꿀 수 있고, 이건 원래의 문제와 동일 하기 때문에 시간복잡도 `O(h)` 으로 풀수가 있다.

    직사각형의 두변을 고정하는 순서쌍은 `O(w^2)` 이기 때문에 전체 시간복잡도는 `O(w*h*min(h,w))` 가 된다. 만약 w 가 h 보다 클 경우, 배열의 행열을 뒤집으면 된다.

    ```python
    def solve2d(matrix):
      h, w = len(matrix), len(matrix[0])
      if w > h:
        # 배열의 행열을 바꾼다. 
        # 굳이 이해하지 않아도 무방.
        matrix = map(list, zip(*matrix))
    
      row_sums = []
      for row in matrix:
        row_sum = [0]
        for num in row:
          row_sum.append(row_sum[-1]+num)
        row_sums.append(row_sum)
      def get_cumulative_row(i, j):
        rows = []
        for k in range(h):
          rows.append(row_sum[k][j+1]-row_sum[k][i])
        return rows
      ans = 0
      for i in range(w):
        for j in range(i+1):
          cumulative_row = get_cumulative_row(i, j)
          # 맨 처음에 풀었던 문제의 함수를 solve1d 라고 하자.
          ans = max(ans,  solve1d(cumulative_row))
      return ans
    ```

[https://blog.cheol.me/cheol94/53-Maximum-Subarray-4188e6e04a9a44e4a696e28d8569000a](https://blog.cheol.me/cheol94/53-Maximum-Subarray-4188e6e04a9a44e4a696e28d8569000a)

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
