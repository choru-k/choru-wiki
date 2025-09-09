---
tags:
  - Algorithm
  - LeetCode
---

# 2272. Substring With Largest Variance

## 문제

[LeetCode 2272](https://leetcode.com/problems/substring-with-largest-variance/description/) • **Medium**

## 핵심 아이디어

이 문제의 핵심은 경우를 잘 나누어서 생각하자이다.

  

문제를 쉽게 생각해보자.

  

아무 조건없이 _**largest variance**_ 을 구하기 위해서는 우리가 원하는 문자 2개 c1, c2 를 고르고

c1 이 나오면 +1, c2 가 나오면 -1 을 하자.

## Solution

```python
class Solution:
    def largestVariance(self, s: str) -> int:
        
        ret = 0
        for c1,c2 in itertools.permutations(set(s), 2):
            
            cur = 0
            for c in s:
                if c == c1:
                    cur += 1
                elif c == c2:
                    cur -= 1
								cur = max(cur, 0)
                ret = max(ret, cur)
        
        return ret
```

  

이제 조건을 조금더 추가해보자.

최소한 c2 가 한개는 꼭 들어가야 한다.

  

```python
class Solution:
    def largestVariance(self, s: str) -> int:
        
        ret = 0
        for c1,c2 in itertools.permutations(set(s), 2):
            
            cur = 0
            has_c2 = False
            first_c2 = False
            for c in s:
                if c == c1:
                    cur += 1
                elif c == c2:
                    has_c2 = True
                    cur -= 1
                if has_c2:
                    ret = max(ret, cur)
                if cur < 0:
										cur = 0
										has_c2 = False
        
        return ret
```

  

위의 조건으로는 만족못시키는 경우의 수를 생각해보자.

`abbb` 같은 경우 cur 이 `0, 1, 2, 3` 이 되어버린다. 우리가 원하는 값은 2 인데 말이다.

문제의 원인은 맨 앞에 c2 가 있는 경우는 cur 이 -1 이 되기때문에 초기화 되어버린다.

그렇기 때문에 처음 시작을 0 이 아닌 -1 로 해야한다.

  

```python
class Solution:
    def largestVariance(self, s: str) -> int:
        
        ret = 0
        for c1,c2 in itertools.permutations(set(s), 2):
            
            cur = 0
            has_c2 = False
            first_c2 = False
            for c in s:
                if c == c1:
                    cur += 1
                elif c == c2:
                    has_c2 = True

                    if first_c2 == True and cur >= 0:
                        first_c2 = False
                    elif (cur-1) < 0:
                        first_c2 = True
                        cur = -1
                    else:
                        cur -= 1
                if has_c2:
                    ret = max(ret, cur)
        
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
