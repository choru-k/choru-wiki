---
tags:
  - LeetCode
  - Algorithm
  - Stack
---

# 736. Parse Lisp Expression

## 문제

[LeetCode 736](https://leetcode.com/problems/parse-lisp-expression/) • **Medium**

## 핵심 아이디어

이 문제를 봤을 때 stack 을 사용해야 한다는 것은 명확하지만 조금 어려운 부분이 있다.

일단 변수를 어떠한 범위 안에서 지정해야한다는 것 때문에 변수의 범위에 대해서 지속적으로 stack 에 넣어야 한다. 일단 우리는 2개의 stack 을 사용한다.

1개는 `( )` 가 추가 될 때 마다 현재의 상황을 넣는 곳. 그리고 나머지 하나는 1 개의 `( )` 안에서의 상황이다.

## Solution

```python
class Solution:
    def evaluate(self, expression: str) -> int:
    # st 는 () 마다 1개씩
    # vals 는 현재 변수들을 저장
    # tokens 는 (   ) 블록 안에서의 상황
        st, vals, tokens = [], dict(), ['']
        
    # 변수라면 들어있는 값이 선택 될 것이고, 숫자라면 vals 안에 없기 때문에 숫자가 그대로 나옴
        def get_val(val):
            return vals.get(val, val)
        
        def parse(tokens):
            if tokens[0] in ['add', 'mult']:
        # 마지막 계산 할 때만 int 로 변경.
                v1, v2 = int(get_val(tokens[1])), int(get_val(tokens[2]))
                return v1+v2 if tokens[0] == 'add' else v1*v2
            else:
        # let 이라면 k1, v1  // k2, v2 로 되어 있기 때문에 
                for k,v in zip(tokens[1::2], tokens[2::2]):
                    if k != '' and v != '':
                        vals[k] = get_val(v)
        # let 의 경우 마지막을 출력
                return get_val(tokens[-1])
        for c in expression:
            if c == '(':
        # vals 을 업뎃 해준다.
                if tokens[0] == 'let':
                    parse(tokens)
        # 현재 상황을 st 에 넣음
                st.append((tokens, vals.copy()))
                tokens = ['']
            elif c == ')':
                tmp = parse(tokens)
                tokens, vals = st.pop()
                tokens[-1] = tmp
            elif c == ' ':
                tokens.append('')
            else:
        # 전부다 문자열로 처리함 으로써 마이너스나, 숫자에 대한 경우등 많은 경우에 대해서
        # 개별적으로 생각하지 않아도 됨.
                tokens[-1] += c
        return int(tokens[0])
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
