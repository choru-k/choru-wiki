---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Math
---

# 1153. String Transforms Into Another String

## 문제

[LeetCode 1153](https://leetcode.com/problems/string-transforms-into-another-string/) • **Medium**

## 핵심 아이디어

c1 → c2 로 바꾼다.

만약 c1 이 이미 다른 문자열에 배정이 되어 있다면 False

만약 `len(set(strMap.values()))` 가 26 이라면 우리는 바꿀수 없다.

문자열이 a,b,c 만 존재한다고 하자.

abc → bca 로 바꾸는 것이 가능할까? 이것은 불가능 하다. 왜냐하면 a→b 로 바꾸는 순간 b→c 로 바꾸면 ccc가 된다.

만약 d 가 추가된다면

abc → abd → acd → acb → dcb → dba → cba 즉 d 을 temp 로 이용해서 바꿀수 있다.

간단하게 생각하면 a,b 의 값을 바꿀때

## Solution

```python
temp = a
a = b
b = temp
```

의 하는 것과 동일하다.

```python
class Solution:
    def canConvert(self, str1: str, str2: str) -> bool:
        if str1 == str2: return True
        if len(str1) != len(str2):
            return False
        strMap = dict()
        for c1,c2 in zip(str1, str2):
            if c1 not in strMap:
                strMap[c1] = c2
            if strMap[c1] != c2:
                return False
        
        return len(set(strMap.values())) < 26
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
