---
tags:
  - LeetCode
  - Algorithm
  - KMP
---

# 616. Add Bold Tag in String

## 문제

[LeetCode 616](https://leetcode.com/problems/add-bold-tag-in-string/) •**Hard**

## Brute-force

```python
class Solution:
    def addBoldTag(self, s: str, dict: List[str]) -> str:
        bold = [False] * len(s)
        for i in range(len(s)):
            for d in dict:
                if s[i:i+len(d)] == d:
                    bold[i:i+len(d)] = [True] * len(d)
        # print(bold)
        ans = []
        prev_bold = False
        for c,b in zip(s, bold):
            if prev_bold == False and b == True:
                ans.append('<b>')    
            if prev_bold == True and b == False:
                ans.append('</b>')
            ans.append(c)
            
            prev_bold =b
        if b == True:
            ans.append('</b>')
        # print(ans)
        return "".join(ans)
```

## KMP

```python
class Solution:
    def addBoldTag(self, s, dict):
        """
        :type s: str
        :type dict: List[str]
        :rtype: str
        """
        status = [False]*len(s)
        final = ""
        for word in dict:
            start = s.find(word)
            last = len(word)
            while start != -1:
                for i in range(start, last+start):
                    status[i] = True
                start = s.find(word,start+1)
        i = 0
        i = 0
        while i < len(s):
            if status[i]:
                final += "<b>"
                while i < len(s) and status[i]:
                    final += s[i]
                    i += 1
                final += "</b>"
            else:
                final += s[i]
                i += 1
        return final
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
