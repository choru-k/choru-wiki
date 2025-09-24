---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Dynamic-Programming
---

# 22. Generate Parentheses

## 문제

[LeetCode 22](https://leetcode.com/problems/generate-parentheses/) •**Easy**

## 핵심 아이디어

모든 경우에 대해서 만들어야 합니다.

모든 경우에 대해서 만들어야 하기 때문에 NP 문제이다.

총 n 개의 괄호을 만들경우,

왼쪽에 k 개, 오른쪽에 n-k 개가 있는경우,

또는 전체을 괄호가 감싸고, 왼쪽에 k 개 오른쪽에 n-k-1 개가 있는 경우가 있습니다.

중복을 제거하기 위해서 set 을 사용하였습니다.

## Solution

```python
class Solution:
  # n 에 대해서는 불변이기 때문에 memorization 을 사용
    @functools.lru_cache(None)
    def generateParenthesis(self, n: int) -> List[str]:
        if n == 0:
            return ['']
        if n == 1:
            return ['()']
        ret = set()
        for k in range(1, n):
            ls, rs = self.generateParenthesis(k), self.generateParenthesis(n-k)
            for l in ls:
                for r in rs:
                    ret.add(l+r)
        for k in range(1, n):
            ls, rs = self.generateParenthesis(k), self.generateParenthesis(n-k-1)
            for l in ls:
                for r in rs:
                    ret.add(f'({l}{r})')
        return ret
```

```python
class Solution:
    def generateParenthesis(self, n: int) -> List[str]:
        dp = [[] for _ in range(n+1)]
        dp[0] = ['']
        for i in range(1, n+1):
            for j in range(i):
                dp[i] += ['(' + x + ')' + y for x in dp[j] for y in dp[i-j-1]]
        return dp[n]
```

```python
class Solution:
    def generateParenthesis(self, n: int) -> List[str]:
        ans = []
        def dfs(l, r, s):
            if len(s) == n*2:
                ans.append("".join(s))
            if l < n:
                s.append('(')
                dfs(l+1, r, s)
                s.pop()
            if l > r:
                s.append(')')
                dfs(l, r+1, s)
                s.pop()
        dfs(0,0,[])
        return ans
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
