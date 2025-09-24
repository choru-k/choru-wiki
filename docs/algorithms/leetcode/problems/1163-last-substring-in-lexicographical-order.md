---
tags:
  - LeetCode
  - Algorithm
  - BFS
  - Dynamic-Programming
  - Greedy
---

# 1163. Last Substring in Lexicographical Order

## 문제

[LeetCode 1163](https://leetcode.com/problems/last-substring-in-lexicographical-order/) •**Medium**

## BFS

```python
class Solution:
    def lastSubstring(self, s: str) -> str:
        start = max(s)
        
        candidates = [i for i,c in enumerate(s) if c== start]
        
        k=1
        while len(candidates) > 1:
            new_candiates = []
            c = max([s[candidate+k] for candidate in candidates if candidate+k < len(s)])
            
            
            for i, candidate in enumerate(candidates):
                if candidate+k >= len(s):
                    break
                if i >= 1 and candidates[i-1]+k == candidate:
                    continue
                if c == s[candidate+k]:
                    new_candiates.append(candidate)
            
            candidates = new_candiates
            k+=1
        
        return s[candidates[0]:]
```

정답은 무조건 suffix 이다.

`i<j` 일 때, `p<j` `p != i` 이면, `s[p:]` 는 최대 subtring 보다 작다고 하자.

## DP

```python
class Solution:
    def lastSubstring(self, s: str) -> str:
        i, j, k = 0, 1, 0
        n = len(s)
        while j + k < n:
            if s[i+k] == s[j+k]:
                k += 1
                continue
            elif s[i+k] > s[j+k]:
                j = j + k + 1
            else:
                i = max(i + k + 1, j)
                j = i + 1
            k = 0
        return s[i:]
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
