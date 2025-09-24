---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Work-In-Progress
---

# 738. Monotone Increasing Digits

## 문제

[LeetCode 738](https://leetcode.com/problems/monotone-increasing-digits/) •**Medium**

## 핵심 아이디어

매우 간단한 문제이다. 하나의 규칙만 찾으면 된다. 그건 정답이 입력값 이거나 또는 9로 끝나는 수이다.

즉 `num[:k] + '9'*(len(num)-k)` 형식으로 된다.

## Solution

```python
def solve(self, num):
 num = list(str(num))
 while k < str
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
