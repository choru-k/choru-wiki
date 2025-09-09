---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 471. Encode String with Shortest Length

## 문제

[LeetCode 471](https://leetcode.com/problems/encode-string-with-shortest-length/) • **Medium**

일단 이 문제를 어떻게 풀어야 할지 생각해보자.

문자열을 압축시킨다면

- 현재 문자열이 전부다 압축일 될 경우
- 압축된 두 문자열의 합으로 구성 될 경우

로 나뉘어 질수 있다.

  

## Top-Down

어려운 부분은 DFS 가 2개의 함수로 표현되는 부분이다.

`memo[i,j]` 을 채우는 것이 `O(N)` 의 시간복잡도를 가지기 때문에 전체 시간복잡도는 `O(N^3)` 이 된다.

```python
class Solution:
    def encode(self, s: str) -> str:
        memo = dict()
        def collapse(i, j):
            temp = s[i:j+1]
						# 중복이 있어야만 압축이 된다.
						# 문자열이 AAA 로 구성될 경우 (A=문자열, ex. abcd)
						# 이걸 2배 해서 다시 AAA 을 찾으면
						# AAA|AAA
						#  AA|A
						# 을 찾게되고 두번째 문자열의 시작까지가 한개의 A 가 된다.
            pos = (temp + temp).find(temp, 1)
            if pos >= len(temp):
                return temp
						# 압축된 문자열의 안쪽을 다시 압축한다.
            return f'{len(temp)//pos}[{dfs(i, i+pos-1)}]'
        def dfs(i, j):
            if i == j:
                return s[i]
            if (i, j) not in memo:
								# 현재 문자열이 압축된 두 문자열의 합으로 구성될 경우
                res = min([dfs(i,k) + dfs(k+1,j) for k in range(i, j)], key=lambda x: len(x))
								# 현재 문자열이 다 압축 될 경우
                temp = collapse(i, j)
                memo[i, j] = min(res, temp, key=lambda x: len(x))
            return memo[i, j]
        return dfs(0, len(s)-1)
```

  

## Bottom-Up

거의 똑같다.

```python
class Solution:
    def encode(self, s: str) -> str:
        n = len(s)
        dp = [['' for _ in range(n)] for _ in range(n)]
        def collapse(i, j):
            temp = s[i:j+1]
            pos = (temp + temp).find(temp, 1)
            if pos >= len(temp):
                return temp
            return f'{len(temp)//pos}[{dp[i][i+pos-1]}]'
        
        for i in range(n):
            dp[i][i] = s[i]
        for step in range(1, n):
            for i in range(n):
                j = i + step
                if j  >= n:
                    break
                res = min([dp[i][k] + dp[k+1][j] for k in range(i, j)], key=lambda x: len(x))
                temp = collapse(i, j)
                dp[i][j] = min(res, temp, key=lambda x: len(x))
        return dp[0][n-1]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
