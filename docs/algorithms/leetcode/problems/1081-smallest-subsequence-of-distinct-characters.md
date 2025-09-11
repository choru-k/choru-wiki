---
tags:
  - LeetCode
  - Algorithm
  - Stack
---

# 1081. Smallest Subsequence of Distinct Characters

## 문제

[LeetCode 1081](https://leetcode.com/problems/smallest-subsequence-of-distinct-characters/description/) • **Hard**

## 핵심 아이디어

일반적으로 생각할 수 있는 방법

## Solution

```python
class Solution:
    def smallestSubsequence(self, s: str) -> str:
        def dfs(s):
            if s == '':
                return ''
            seens = collections.defaultdict(list)
            for idx, c in enumerate(s):
                seens[c].append(idx)
            for k in sorted(seens.keys()):
                for idx in seens[k]:
                    if all(idx <= seens[other][-1] for other in seens.keys()):
                        nxt = "".join([c for c in s[idx+1:] if c != k])
                        return k + dfs(nxt)
        ret = dfs(s)
        return ret
```

stack 을 쓴다면?

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
