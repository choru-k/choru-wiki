---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 1397. Find All Good Strings

## 문제

[LeetCode 1397](https://leetcode.com/problems/find-all-good-strings/description/) •**Medium**

## 핵심 아이디어

일단 upper_bound, lower_bound 가 있다면 당연히

upper_bound 하나로 문제를 바꿀수 있다.

즉 s 이하의 evil 이 포함이 안되는 문자열 갯수 구하기를 생각해보자.

이건 다시 `s 이하의 모든 문자열 - s 이하의 evil 이 포함된 문자열` 로 문제를 바꿀 수 있다.

`s 이하의 모든 문자열` 는 밑의 `count_with_lower` 를 통해 간단히 구할 수 있다.

이제 핵심은 `s 이하의 evil 이 포함된 문자열` 이다.

`s 이하의 evil 이 포함된 문자열` 를 어떻게 구할까.

`include_evil_in_prefix`, `include_evil_in_nxt`, `include_evil_in_prefix_and_nxt` 을 통해서 구했다.

일단 `include_evil_in_prefix` 는 prefix 에 evil 이 포함된 문자열이다.

`include_evil_in_nxt` 는 s[1:] 의 문자열에 evil 이 포함된 문자열이다.

`include_evil_in_prefix_and_nxt` 는 prefix 와 s[1:] 에 둘다 evil 이 포함된 문자열이다.

예를 들어보자. `leet` 이 evil 이고 s 가 `leetzzzz` 라고 할때, `leetleet` 같은 문자는 prefix 도 leet 이 포함되지만 `eetzzzz` 이하의 문자열에도 `eetleet` 이라는 문자열이 포함된다. 즉 우리는 이러한 중복된 케이스를 구해서 따로 빼주어야 한다.

## Solution

```python
class Solution:
    def findGoodStrings(self, n: int, s1: str, s2: str, evil: str) -> int:
        MOD = 10**9 + 7
        
        @functools.cache
        def pow26(l):
            if l == 0:
                return 1
            return (pow26(l-1) * 26) % MOD

        @functools.cache
        def count_with_lower(s: str) -> int:
            cnt = 0
            for i,c in enumerate(s):
                cnt += pow26(len(s)-i-1) * (ord(c) - ord('a'))
                cnt %= MOD
            return cnt + 1
        
        @functools.cache
        def count_with_lower_include_evil(s: str) -> int:
            if len(s) < len(evil):
                return 0
            if len(s) == len(evil):
                return 0 if s < evil else 1
            
            # include_evil_in_prefix
            prefix = s[:len(evil)]
            if prefix < evil:
                include_evil_in_prefix = 0
            elif prefix == evil:
                include_evil_in_prefix = count_with_lower(s[len(evil):])
            else:
                include_evil_in_prefix = pow26(len(s)-len(evil))
            
            # include_evil_in_nxt
            include_evil_in_nxt = (ord(s[0]) - ord('a')) * count_with_lower_include_evil('z' * (len(s)-1))
            include_evil_in_nxt += count_with_lower_include_evil(s[1:])

            # include_evil_in_prefix_and_nxt
            if prefix < evil:
                include_evil_in_prefix_and_nxt = 0
            elif prefix == evil:
                upper_bound = evil[1:]+s[len(evil):]
                include_evil_in_prefix_and_nxt =  count_with_lower_include_evil(upper_bound)
                lower_bound = evil[1:]+'a'*(len(s) - len(evil))
                include_evil_in_prefix_and_nxt -= count_with_lower_include_evil(lower_bound)
                include_evil_in_prefix_and_nxt += 1 if evil in lower_bound else 0
            else:
                upper_bound = evil[1:]+'z'*(len(s) - len(evil))
                include_evil_in_prefix_and_nxt =  count_with_lower_include_evil(upper_bound)
                lower_bound = evil[1:]+'a'*(len(s) - len(evil))
                include_evil_in_prefix_and_nxt -= count_with_lower_include_evil(lower_bound)
                include_evil_in_prefix_and_nxt += 1 if evil in lower_bound else 0
            return (include_evil_in_prefix + include_evil_in_nxt - include_evil_in_prefix_and_nxt) % MOD

        
        ret = (count_with_lower(s2) - count_with_lower_include_evil(s2)) \
           -  (count_with_lower(s1) - count_with_lower_include_evil(s1)) \
           +  (1 if evil not in s1 else 0)
        ret = (ret + MOD) % MOD
        return ret
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
