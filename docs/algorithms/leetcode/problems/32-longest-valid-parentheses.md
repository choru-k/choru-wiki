---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Stack
---

# 32. Longest Valid Parentheses

## 문제

[LeetCode 32](https://leetcode.com/problems/longest-valid-parentheses/) • **Easy**

## 핵심 아이디어

이 문제는 3가지 방법으로 풀 수가 있다. 일단 생각하기 쉬운 DP 부터 생각해보자.

`dp[i]` 는 i 가 정답 문자열(가장 긴 알맞은 문자열) 의 마지막 문자라고 했을 때의 그 길이이다.

만약 `s[i] == '('` 이면 `dp[i]=0` 이다. 왜냐하면 `(` 로는 끝날 수 없기 때문이다.

만약 `s[i] == ')'` 일 경우 2가지 경우가 생긴다. 첫 번째는 그 전문자가 `(` 일때, 밑의 첫번째 식처럼 된다.

만약 전 문자가 `)` 일때는 두 번째 식처럼 된다.

첫번째 식의 예는 `(())()` 에서 마지막 문자열을 생각해보자. 두번째식의 예제는 `(())()` 에서 4번째 문자열을 생각해보자.

$dp[i] = dp[i-2] + 2 \\ dp[i] = dp[i-dp[i-1]-2] + 2 + dp[i-1]$

이를 코드로 구현한게 밑이다.

## Solution

```python
class Solution:
    def longestValidParentheses1(self, s: str) -> int:
        dp = [0 for _ in range(len(s)+1)]

        for i in range(1, len(s)):
            if (s[i-1], s[i]) == ('(', ')'):
                dp[i] = 2 + dp[i-2]
            elif s[i] == ')' and i-dp[i-1]-1 >= 0 and s[i-dp[i-1]-1] == '(':
                dp[i] = dp[i-1] + dp[i-dp[i-1]-2] + 2
        return max(dp)
```

  

이제 스택을 이용해서 풀어보자. 일반적으로 `( )` 괄호 문제는 stack 을 이용하는게 일반적이기 때문에 오히려 이쪽이 더 쉽게 생각 할 수 있는 사람도 있을 수 있다.

똑같이 `)` 이 더 많다면 스택을 초기화 해준다. 그리고 괄호가 시작하면 0 을 넣어준다.

스택에서 빼낸다는 괄호가 2개추가 된다는 의미이기 때문에 2를 가장 위의 스택에 넣어준다.

가장 위의 스택이 현재만들어지고 있는 가장긴 괄호가 된다.

  

```python
class Solution:
	def longestValidParentheses2(self, s: str) -> int:
        st = [0]
        ret = 0
        for c in s:
            if c == '(':
                st.append(0)
            elif len(st) == 1:
                st = [0]
            else:
                k = st.pop() + 2
                st[-1] += k
            ret = max(ret, st[-1])
        return r
```

  

마지막 방법은 보다 직관적인 방법일 수도 있다.

일반적으로 `(` 와 `)` 의 수가 같다면 알맞은 괄호일 것이다.

`)` 가 더 많을 경우는 초기화 시켜준다면 말이다.

단순히 위의 방법으로 할 경우`(()` 의 경우엔 0이 된다. 이걸 대비해서 오른쪽으로도 한번세어주면 된다.

  

```python
class Solution:
	def longestValidParentheses3(self, s: str) -> int:
        def helper(s, reverse=False):
            cnt_l = cnt_r = ret = 0
            for c in (s[::-1] if reverse else s):
                if (reverse == False and c == "(") \
                        or (reverse and c == ')'):
                    cnt_l += 1
                else:
                    cnt_r += 1
                if cnt_r > cnt_l:
                    cnt_r = cnt_l = 0
                if cnt_l == cnt_r:
                    ret = max(ret, cnt_l*2)
            return ret
        return max(helper(s), helper(s, reverse=True))
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
