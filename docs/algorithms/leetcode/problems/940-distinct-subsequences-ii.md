---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 940. Distinct Subsequences II

## 문제

[LeetCode 940](https://leetcode.com/problems/distinct-subsequences-ii/) •**Hard**

## 핵심 아이디어

일단 곰곰히 생각해보자.

일단 모든 문자열은 `[a-z]` 의 범위 안에 있다.

각 문자열로 끝나는 단어의 갯수를 dp에 저장하면 어떻게 될까?

## Solution

```python
Input: "aba"
Current parsed: "ab"

endswith 'a': ["a"]
endswith 'b': ["ab","b"]

"a" -> "aa"
"ab" -> "aba"
"b" -> "ba"
"" -> "a"

endswith 'a': ["aa","aba","ba","a"]
endswith 'b': ["ab","b"]
result: 6
```

로 된다. 즉 밑의 코드로 표현이 된다.

```python
class Solution:
    def distinctSubseqII(self, S: str) -> int:
        mod = 10**9+7
        dp = [0] * 26
        for c in S:
            dp[ord(c)-ord('a')] = sum(dp)%mod+1
            # print(dp)
        return sum(dp) % mod
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
