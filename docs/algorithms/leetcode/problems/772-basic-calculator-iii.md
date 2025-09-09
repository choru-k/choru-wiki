---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Greedy
---

# 772. Basic Calculator III

## 문제

[LeetCode 772](https://leetcode.com/problems/basic-calculator-iii/) • **Hard**

## 핵심 아이디어

```python
class Solution:
    def calculate(self, s: str) -> int:
				# 마지막을 쉽게 알기 위해 '$' 을 붙였다.
        s = s+'$'
				# 공백은 정답과 영향이 없기때문에 미리 삭제를 한다.
        s = s.replace(' ','')
        idx = 0
        def dfs():
            nonlocal idx
            stack = []
            sign = '+'
            num = 0
						# Basic Calculator 2 와 유사하다.
            while idx < len(s):
                c = s[idx]
                if c.isdigit():
                    num = num*10 + int(c)
								# 괄호의 끝, 식의 끝, 숫자의 끝에서 값을 업데이트한다.
                if c in '+-*/$)':
                    if sign == '+':
                        stack.append(num)
                    if sign == '-':
                        stack.append(-num)
                    if sign == '*':
                        stack.append(stack.pop() * num)
                    if sign == '/':
                        stack.append(int(stack.pop() / num))
                    num=0
                    sign = c
                if c == '(':
                    idx+=1
                    num = dfs()
										# dfs 가 끝나는 시점에 idx 는 ')'의 위치에 존재한다.
                if c == ')':
                    return sum(stack)
                idx+=1
            return sum(stack)
        ans = dfs()
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
