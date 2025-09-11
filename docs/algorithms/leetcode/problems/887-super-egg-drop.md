---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 887. Super Egg Drop

## 문제

[LeetCode 887](https://leetcode.com/problems/super-egg-drop/) • **Hard**

문제는 심플하다.

## 기본 O(k*n^2)

일단 기본적으로

$dp[k][n] = 1 + min_{i=1...n}(max(dp[k-1][i-1], dp[k][n-i]))$

라는 것을 알 수 있다. 즉 k와 n 이 주어지고, i 층에서 계란을 떨어뜨릴 때 만약 깨진다면 `dp[k-1][i-1]` , 안 깨진다면 `dp[k][n-i]` 의 max 값이 되고, 이러한 i 중 정답을 최소로 하는 i 을 구한다.

이 경우 dp 의 한 칸을 채우는데 `O(n)` 이 되기 때문에 전체 시간 복잡도는 `O(n * k*n)` 이 된다.

```python
class Solution(object):
    def superEggDrop(self, K, N):
        """
        :type K: int
        :type N: int
        :rtype: int
        """
        dp=[[float('inf')]*(N+1) for _ in range(K+1)]
        for i in range(1, K+1):
            dp[i][0] = 0
            dp[i][1] = 1
        for j in range(1, N+1):
            dp[1][j] = j
        
        for i in range(2, K+1):
            for j in range(2, N+1):
                for k in range(1, j+1):
                    dp[i][j] = min(dp[i][j], 1 + max(dp[i-1][k-1], dp[i][j-k]))
        return dp[K][N]
```

## 이진 탐색 O(k*nlogn)

하지만 우리는 `dp[k-1][i-1]` 와 `dp[k][n-i]` 가 비슷할 때가 좋은 i 라는 것을 알 수 있다.

즉 `dp[k-1][i-1] > dp[k][n-i]` 라면 i 을 줄이고, `dp[k-1][i-1] < dp[k][n-i]` 라면 i 을 늘려야 한다고 알 수 있습니다. 이러한 방법을 통해서 우리는 최적의 i 을 구하는 것을 이진 탐색으로 할 수 있고 dp 한칸을 채우는데 `O(logn)` 이 되도록 할 수 있습니다.

```python
class Solution(object):
    def superEggDrop(self, K, N):
        """
        :type K: int
        :type N: int
        :rtype: int
        """
        def dfs(i, j):
            if i==1:
                return j
            if j==0:
                return 0
            if j==1:
                return 1
            if (i, j) in d:
                return d[i, j]
            lo, hi = 0, j
            while lo < hi:
                mid = (lo+hi)/2
                left, right = dfs(i-1, mid-1), dfs(i, j-mid)
                if left < right:
                    lo = mid + 1
                else:
                    hi = mid
            res = 1 + max(dfs(i-1, lo-1), dfs(i, j-lo))
            d[i, j]=res
            return res
        
        d={}
        return dfs(K, N)
```

## 탐색을 조금 더 효율적으로 O(k*n)

우리는 `dp[k][a]` 와 `dp[k][b]` 가 존재 할때 만약 `a > b` 이면 `dp[k][a]`의 최적의 i (i_a) 가 `dp[k][b]` 의 최적의 i (i_b) 보다 크다는 것을 알 수 있습니다. `i_a > i_b` 만약 a 가 100층 b 가 50층 이면 대략 a 는 50층 쯤에서 b는 20 층 쯤에서 나누는게 좋다는 것을 얼핏 알 수 있지요.

즉 dp 의 한 줄을 채우는 것에 대해서 i 을 한번만 훑으면 된 다는 것을 알 수가 있습니다.

```python
class Solution(object):
    def superEggDrop(self, K, N):
        """
        :type K: int
        :type N: int
        :rtype: int
        """
        dp=[[float('inf')]*(N+1) for _ in range(K+1)]
        for i in range(1, K+1):
            dp[i][0] = 0
            dp[i][1] = 1
        for j in range(1, N+1):
            dp[1][j] = j
            
        for i in range(2, K+1):
            k = 1
            for j in range(2, N+1):
                while k < j+1 and dp[i][j-k] > dp[i-1][k-1]:
                    k += 1
                dp[i][j] = 1 + dp[i-1][k-1]
        return dp[K][N]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
