---
tags:
  - LeetCode
  - Algorithm
  - BFS
  - DFS
---

# 248. Strobogrammatic Number III

## 문제

[LeetCode 248](https://leetcode.com/problems/strobogrammatic-number-iii/) • **Medium**

## 핵심 아이디어

[https://leetcode.com/problems/confusing-number-ii/](https://leetcode.com/problems/confusing-number-ii/)

비슷

  

일반적인 DFS

Time Exceed

## Solution

```python
class Solution:
    def strobogrammaticInRange(self, low: str, high: str) -> int:
        if int(low) > int(high):
            return 0
        rev = {0:0, 1: 1, 6: 9, 8: 8, 9: 6}
        # 그냥 high - low 하자
        def dfs(cur, rotation, limit, digit):
            if cur > limit:
                return 0
            res = 0
            if cur == rotation:
                # print(cur)
                res +=1
            for num, r_num in rev.items():
                res += dfs(cur*10+num, r_num*digit + rotation, limit, digit*10)
            return res
        
        high_cnt, down_cnt = 0, 0
        for k, v in rev.items():
            if k != 0:
                high_cnt += dfs(k, v, int(high), 10)
                down_cnt += dfs(k, v, int(low), 10)
        
        
        if "".join(list(map(lambda c: str(rev[int(c)]) if int(c) in rev else c, low[::-1]))) == low:
            high_cnt+=1
        
        return high_cnt - down_cnt
```

  

  

최적화

위와 같은 방법이지만 앞뒤로 문자열을 추가햇다.

```python
class Solution:
    def strobogrammaticInRange(self, low: str, high: str) -> int:
        if int(low) > int(high):
            return 0
        rev = {'0':'0', '1': '1', '6': '9', '8': '8', '9': '6'}
        
        # reutrn cur > num
        def isBig(cur, num):
            if len(cur) < len(num):
                return False
            if len(cur) > len(num):
                return True
            return cur > num
        
        def dfs(cur):
            if isBig(cur, high):
                return 0
            res = 0
            if len(cur) > 0 and cur[0] != '0' and (isBig(cur, low) or cur == low):
                res += 1
            for k, v in rev.items():
                res += dfs(k+cur+v)
            return res
        
        res = 1 if low == '0' else 0
        res += dfs("")
        res += dfs("0")
        res += dfs("1")
        res += dfs("8")
        
        return res
```

  

  

DP

길이가 n인 strobogrammatic number 을 구한다.

```python
from functools import lru_cache
class Solution:
    def strobogrammaticInRange(self, low: str, high: str) -> int:
        @lru_cache(None)
        def dfs(n):
            odd = ['0', '1', '8']
            even = ['11', '88', '69', '96', '00']
            
            if n < 1:
                return ['']
            if n == 1:
                return odd
            if n == 2:
                return even[:-1]
            
            # 1111
            if n % 2 == 0:
                pre, mid = dfs(n - 2), even
            else:
                pre, mid = dfs(n - 1), odd
            cut = (n - 1) // 2
            return [p[:cut] + m + p[cut:] for p in pre for m in mid]
        
        if int(low) > int(high):
            return 0
        
        if len(low) == len(high):
            return sum([int(low) <= int(i) <= int(high) for i in dfs(len(low))])
        
        total = sum([int(low) <= int(i) for i in dfs(len(low))])
        for i in range(len(low) + 1, len(high)):
            total += len(dfs(i))
        total += sum([int(high) >= int(i) for i in dfs(len(high))])
        return total
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
