---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 809. Expressive Words

## 문제

[LeetCode 809](https://leetcode.com/problems/expressive-words/) •**Hard**

## 핵심 아이디어

일단 가장 쉽게 S 와 word 을 매번 비교하자

## Solution

```python
class Solution:
    def expressiveWords(self, S: str, words: List[str]) -> int:
        def get_len(s, l):
            r=l
            while r < len(s) and s[l] == s[r]:
                r+=1
            return r
        
        def check(word):
            s_l=0
            w_l=0
            while s_l < len(S):
                if w_l >= len(word) or S[s_l] != word[w_l]:
                    return False
                s_r = get_len(S, s_l)
                w_r = get_len(word, w_l)
                if (s_r-s_l >=3 and s_r-s_l> w_r-w_l) or s_r-s_l == w_r-w_l:
                    s_l = s_r
                    w_l = w_r
                else:
                    return False
            return True
        ans = 0
        for word in words:
            if check(word):
                ans += 1
        return ans
```

최적화를 위해서 (문자, s_r-s_l) 을 저장해놓자. 이러면 매번 S 을 비교하지 않아도 된다.

```python
class Solution:
    def expressiveWords(self, S: str, words: List[str]) -> int:
        def get_len(s, l):
            r=l
            while r < len(s) and s[l] == s[r]:
                r+=1
            return r
        
        s_l = 0
        s_group = []
        while s_l < len(S):
            s_r = get_len(S, s_l)
            s_group.append((S[s_l], s_r-s_l))
            s_l = s_r
        def check(word):
            w_l=0
            for c, l in s_group:
                if w_l >= len(word) or c != word[w_l]:
                    return False
                w_r = get_len(word, w_l)
                if (l >=3 and l > w_r-w_l) or l == w_r-w_l:
                    w_l = w_r
                else:
                    return False
            return True
        ans = 0
        for word in words:
            if check(word):
                ans += 1
        return ans
```

Group 을 word 에도 적용. word 을 2번 돌기 때문에 위의 코드보다 느림. 하지만 이해하기는 보다 편해졌다.

```python
class Solution:
    def expressiveWords(self, S: str, words: List[str]) -> int:
        def get_len(s, l):
            r=l
            while r < len(s) and s[l] == s[r]:
                r+=1
            return r
        def create_group(s):
            l = 0
            group = []
            while l < len(s):
                r = get_len(s, l)
                group.append((s[l], r-l))
                l = r
            return group
        s_group = create_group(S)
        def check(word):
            group = create_group(word)
            if len(s_group) != len(group):
                return False
            for s, w in zip(s_group, group):
                if s[0] != w[0] or s[1] < w[1] or (s[1] <=2 and s[1] != w[1]):
                    return False
            return True
        return len(list(filter(check, words)))
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
