---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Stack
---

# 224. Basic Calculator

## 문제

[LeetCode 224](https://leetcode.com/problems/basic-calculator/) • **Hard**

## 핵심 아이디어

살짝 전형적인 문제이다. 처음에는 어려울 수 있지만 한번 방법을 알면 쉽게 풀 수가 있다.

일단 원하는 문자열을 추출하기 위해서 `regexp(정규표현식)` 을 사용한다.

괄호을 먼저 계산하기 때문에 stack 을 사용해야 한다는 것을 생각 할 수 있다.

## Solution

```python
class Solution:
    def calculate(self, s: str) -> int:
				# 현재 괄호을 계산한다.
        def calc(st):
            cur = st.pop()
            ret = cur[0]
            for i in range(1, len(cur), 2):
                if cur[i] == '+':
                    ret += cur[i+1]
                else:
                    ret -= cur[i+1]
            return ret
        st = [[]]
        for c in re.findall(r'[0-9]+|\+|\-|\(|\)', s):
            if c == '(':
                st.append([])
                continue
            if c == ')':
								# 방금까지의 괄호을 계산하고, 그 값을 다시 넣는다.
                val = calc(st)
                st[-1].append(val)
                continue
            if c.isdigit():
								# 숫자면 숫자로 바꿔서 넣는다.
                st[-1].append(int(c))
                continue
            st[-1].append(c)
        
        val = calc(st)
        st.append(val)
            
        return st[0]


class Solution:
    def calculate(self, s: str) -> int:
        st = [[]]
        def calculate(exp):
            if exp[0]=='-':
								# deque 사용하면 최적화 가능
                exp = exp[1:]
                ret = -exp[0]
            else:
                ret = exp[0]
            
            for op, num in zip(exp[1::2], exp[2::2]):
                ret += (1 if op == '+' else -1) * num
            return ret
        
        for c in re.findall(r'[0-9]+|\+|\-|\(|\)', s):
            if c == '(':
                st.append([])
            elif c == ')':
                num = calculate(st.pop())
                st[-1].append(num)
            elif c in ['-', '+']:
                st[-1].append(c)
            else:
                st[-1].append(int(c))
        
        return calculate(st[-1])
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
