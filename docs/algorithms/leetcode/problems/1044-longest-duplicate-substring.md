---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
---

# 1044. Longest Duplicate Substring

## 문제

[LeetCode 1044](https://leetcode.com/problems/longest-duplicate-substring/) • **Hard**

## 핵심 아이디어

일단 곰곰히 생각해보면 binary search 을 할 수 있다는 것을 알 수가 있다.

만약 길이가 10 인 duplicate substirng 이 존재한다면 길이가 9,8,7,... 인 duplicate substring 도 무조건 존재한다.

즉 duplicate substring 의 길이로 binary search 을 할 수가 있다.

밑은 그걸 구현 한 것이다.

## Solution

```python
class Solution:
    def longestDupSubstring(self, S: str) -> str:
        low, high = 0, len(S) -1
        
        def check(l):
            cache = set()
            word = ''
            for c in S:
                word += c
                if len(word) == l:
                    if word in cache:
                        return word
                    cache.add(word)
          # 문제의 부분
                    word = word[1:]
            return ''      
        while low < high:
            mid = (low + high + 1) // 2
            if check(mid) != '':
                low = mid
            else:
                high = mid-1
        return check(low)
```

이 때의 시간 복잡도는 어떻게 될까?

`O(logN * N * N)` 이 된다. 여기서 `O(N)` 은 word 에 앞글자를 1개 지우고 뒷글자를 1개 붙이는 것에 있다.

즉 우리는 이 부분을 최적화 해야한다.

어떻게 최적화를 할 수가 있을까?

숫자로 생각하면

`a=01`, `b=02` 로 생각하여서 word 을 표현할 수 있다.

예를 들어서 abc 면 word = `010203` 이다.

그렇다면 abc → bcd 로 어떻게 바꿀수 있을까?

( `010203` - `010000` ) * `100` + `04`

이러한 공식을 통해서 쉽게 다음 word 을 구할 수 있다.

이제 우리는 word 을 업데이트를 O(1) 에 할 수가 있다.

이러한 기법을 `Rabin-Karp Solution` 이라고 한다.

```python
class Solution:
    def longestDupSubstring(self, S: str) -> str:
        low, high = 0, len(S)
    # 매우큰수. 100 * len(S) 은 너무 큰 수 이기 때문에 적당히 나누어 주어야 한다.
    # 확률상 collision 이 일어날 확률이 너무 적기 때문에 충분히 문제 없다.
    # len(S) / 2**63 = 1.0842022e-14
        mod = 2**63 - 1
        originS = S
        S = [ord(c)-ord('a') for c in S]
        
        def check(l):
            word = 0
            for i in range(l):
                word = (word * 100 + S[i]) % mod
            
            cache = { word }
            p = pow(100, l, mod)
            for i in range(len(S) - l):
                word = (word * 100 - S[i] * p + S[l+i]) % mod
                if word in cache:
                    return i+1
                cache.add(word)
            return -1
            
            
        while low < high:
            mid = (low + high + 1) // 2
            if check(mid) != -1:
                low = mid
            else:
                high = mid-1
        ans = check(low)
        return originS[ans:ans+low] if ans != -1 else ''
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
