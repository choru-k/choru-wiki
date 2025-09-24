---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 730. Count Different Palindromic Subsequences

## 문제

[LeetCode 730](https://leetcode.com/problems/count-different-palindromic-subsequences/) •**Medium**

## 핵심 아이디어

이 문제의 핵심은 dp 의 경우를 나눈다는 것이다.

`dp(i,j,k)` 는 `s[i:j]` 의 안에서 `k 문자` 로 묶인 판다드롬의 갯수이다.

즉 `dp(1,5,'a')` 라면 1~5 사이의에서 `a__a` 로 된 판다드롬의 갯수를 뜻한다.

## Solution

```python
class Solution:
    def countPalindromicSubsequences(self, s: str) -> int:
        cache = collections.defaultdict()
        mod = 1000000007
        def dfs(i, j, k):
            if i>j: 
                return 0
            if i==j:
        # 문자열이 1개일 경우다.
                return 1 if k == s[i] else 0
            
            if (i, j, k) in cache:
                return cache[(i,j,k)]
            if s[i] != k:
        # 우리는 k 로 덮힌 판다드롬만 생각하기 때문에 그 외라면 무시한다.
                cache[(i,j,k)] = dfs(i+1,j,k)
            elif s[j] != k:
                cache[(i,j,k)] = dfs(i,j-1,k)
            else:
        # 판다드럼이기 때문에 {a}, {aa} 최소 2가지 경우가 나온다.
        # 여기서 i+1 == j 이면 {a} 의 경우를 위의 i==j 을 건너띄기 때문에 
        # 여기서 한꺼번에 2개로 세준다.
                cache[(i,j,k)] = 2
                for m in ['a','b','c','d']:
          # 만약 현재 k가 a 라면
          # aa___aa, ab___ba, ac___ca, ad___da 을 구하고 다 더하는 것이다.
                    cache[(i, j, k)] += dfs(i+1, j-1, m)
                    cache[(i, j, k)] %= mod
            return cache[(i, j, k)]
        ans =0
        for m in ['a','b','c','d']:
            ans += dfs(0, len(s)-1, m)
            ans %= mod
        return ans
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
