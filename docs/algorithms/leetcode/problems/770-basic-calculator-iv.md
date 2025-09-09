---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Greedy
---

# 770. Basic Calculator IV

## 문제

[LeetCode 770](https://leetcode.com/problems/basic-calculator-iv/) • **Hard**

## 핵심 아이디어

```python
from collections import Counter
import re
class Solution:
    def basicCalculatorIV(self, expression: str, evalvars: List[str], evalints: List[int]) -> List[str]:
        
        def calc(a, b, op):
            if op == '+':
                for k, v in b.items():
                    a[k] += v
                return a
            if op == '-':
                for k, v in b.items():
                    a[k] -= v
                return a
            if op == '*':
                new_k = Counter()
                for ak, av in a.items():
                    for bk, bv in b.items():
                        print(ak, bk, tuple(sorted(ak+bk)))
                        new_k[tuple(sorted(ak+bk))] += av*bv
                return new_k
        def help_calc(cur, ops):
            prev = cur.pop()
            p_prev = cur.pop()
            cur.append(calc(p_prev, prev, ops.pop()))
        prior = { '(': 0, '+': 1, '-': 1, '*': 2}
        ops = []
        cur = []
        values = {n:v for n,v in zip(evalvars, evalints)}
        for c in re.findall(r'[a-z]+|[0-9]+|[\+\-\*\(|\)]', expression):
            if c[0].isdigit():
                cur.append(Counter({tuple(''): int(c)}))
            elif c[0].isalpha():
                if c in values:
                    cur.append(Counter({tuple(''): values[c]}))
                else:
                    cur.append(Counter({tuple([c]): 1}))
            if c == '(':
                ops.append(c)
            if c == ')':
                while len(ops) > 0 and ops[-1] != '(':
                    help_calc(cur, ops)
                ops.pop()
                continue
            if c in '+-*':
                while len(ops) > 0 and prior[ops[-1]] >= prior[c]:
                    help_calc(cur, ops)
                ops.append(c)
        while len(ops) > 0:
            help_calc(cur, ops)
        
        res = []
        for k in sorted(cur[0].keys(), key=lambda x: (-len(x), x)):
            v = cur[0][k]
            if v == 0:
                continue
            if len(k) == 0:
                res.append(str(v))
            else:
                res.append(str(v) + '*' + '*'.join(k))
        return res
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
