---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 833. Find And Replace in String

## 문제

[LeetCode 833](https://leetcode.com/problems/find-and-replace-in-string/) •**Hard**

한번씩 비교하면서 index 을 더하는 방식. 이해하기가 힘들다.

S[i] 을 비교하는 방식.

```python
class Solution:
    def findReplaceString(self, S: str, indexes: List[int], sources: List[str], targets: List[str]) -> str:
        ans = ''
        items = sorted([(idx, source, target) for idx, source, target in zip(indexes, sources, targets)])
        
        i=0
        idx = 0
        while i <len(S):
            if len(items) <= idx:
                ans += S[i:]
                return ans
            item = items[idx]
            while i < item[0]:
                ans+=S[i]
                i+=1
            if S[i:i+len(item[1])] == item[1]:
                i = i+len(item[1])
                ans += item[2]
            idx+=1
        return ans
```

## Clean Code

target을 기준으로 생각하는 방식.

어떤 방식이든 기준을 잡을 때 더 간단한 애를 기준으로 잡는게 코드도 간단해짐

```python
class Solution:
    def findReplaceString(self, S: str, indexes: List[int], sources: List[str], targets: List[str]) -> str:
        v = []
        for idx, s, t in zip(indexes, sources, targets):
            if S[idx:idx+len(s)] == s:
                v.append((idx, len(s), t))
    # 전부다 sort 하는게 아니라 필요한 애들만 sort
        v.sort()
        
        ans = ''
        prev_idx = 0
    # prev_idx 을 사용해서 구간 별로 자르고 바꾼다.
        for idx, s, t in v:
            ans += S[prev_idx:idx] + t
            prev_idx=idx+s
        ans += S[prev_idx:]
        return ans
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
