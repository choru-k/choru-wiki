---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 544. Output Contest Matches

## 문제

[LeetCode 544](https://leetcode.com/problems/output-contest-matches/) • **Medium**

## 핵심 아이디어

`O(NlogN)`

총 깊이는 logN, 문자열을 매번 새로 합치기 때문에 그 때마다 O(N)

## Solution

```python
class Solution:
    def findContestMatch(self, n: int) -> str:
        def dfs(k):
            if k == 0:
                return list(map(str,range(1,n+1)))
            cur = dfs(k-1)
            l, r = 0, len(cur)-1
            res = []
            while l<r:
                res.append('(' + cur[l] +',' + cur[r]+')')
                l+=1
                r-=1
            return res
        return dfs(math.log2(n))[0]
```

  

`O(N)` 문자열을 합치는 대신에 일단 배열을 반환함.

그 뒤 배열을 순회하면서 문자열을 배열에 넣고 한번에 합침.

즉 문자열을 매번 합치는게 아니라 배열에 저장하고 한번에 합침으로서 필요없는 시간제거

```python
class Solution:
    def findContestMatch(self, n: int) -> str:
        def dfs(k):
            if k == 0:
                return range(1,n+1)
            cur = dfs(k-1)
            l, r = 0, len(cur)-1
            res = []
            while l<r:
                res.append([cur[l],cur[r]])
                l+=1
                r-=1
            return res
        ans = []
        def resolve(res):
            if isinstance(res, int):
                ans.append(str(res))
                return
            ans.append('(')
            resolve(res[0])
            ans.append(',')
            resolve(res[1])
            ans.append(')')
        resolve(dfs(math.log2(n))[0])
        
        return "".join(ans)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
