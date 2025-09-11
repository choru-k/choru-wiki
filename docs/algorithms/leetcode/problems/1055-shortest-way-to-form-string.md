---
tags:
  - LeetCode
  - Algorithm
  - Hash-Table
---

# 1055. Shortest Way to Form String

## 문제

[LeetCode 1055](https://leetcode.com/problems/shortest-way-to-form-string/) • **Hard**

## 핵심 아이디어

일단 가장 쉽게 생각할 수 있는 방법을 보자

source 와 target 을 1개씩 증가하면서 실제로 target 을 완성시킨다.

시간복잡도는 O(S*T) 가 된다.

만약 source = `abbbbbbbbbbbbbbbbb` target =`aaaaaaaaaaaaaa` 가 최악의 경우가 된다.

## Solution

```python
class Solution:
    def shortestWay(self, source: str, target: str) -> int:
        s_set = set(source)
        for c in target:
            if c not in s_set:
                return -1
        
        idx_s = 0
        ans = 1
        for c in target:
            if idx_s == len(source): 
                ans += 1
                idx_s = 0
            while source[idx_s] != c:
                idx_s += 1
                if idx_s == len(source): 
                    ans += 1
                    idx_s = 0
            idx_s+=1
            
        return ans
```

Hash Table 을 사용해서 매번 다음 문자열 까지 1개씩 가는게 아니라 바로 jump 을 하자.

```python
class Solution:
    def shortestWay(self, source: str, target: str) -> int:
        s_set = set(source)
        for c in target:
            if c not in s_set:
                return -1
        
        cache = dict()
        s_to_nxt = [None] * len(source)
        
    # s_to_nxt[i]['a'] 는 soure[i]에서 다음 a 가 있는 index
        for idx,c in list(enumerate(source+source))[::-1]:
            if idx < len(source):
                s_to_nxt[idx] = cache.copy()
            cache[c] = idx
        # print(cache)
        # print(s_to_nxt)
        
    # 첫 시작은 target[0] 이 있는곳. 1개씩 걸어가면서 찾아도 되지만 cache 을 사용하자.
        idx_s = cache[target[0]]
        ans = 1
        for c in target[1:]:
            nxt_s_idx = s_to_nxt[idx_s][c]
            if nxt_s_idx >= len(source):
                ans+=1
                nxt_s_idx -= len(source)
            idx_s = nxt_s_idx
            
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
