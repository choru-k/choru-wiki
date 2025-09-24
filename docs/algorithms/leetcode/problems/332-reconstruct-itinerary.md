---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Graph
---

# 332. Reconstruct Itinerary

## 문제

[LeetCode 332](https://leetcode.com/problems/reconstruct-itinerary/) •**Medium**

## 핵심 아이디어

이 문제를 푸는 방법은 2가지가 있다.

가장 간단한 DFS 을 사용한 방법, 그리고 `Hierholzer’s Algorithm` 을 사용한 방법

## Solution

```python
from collections import Counter
class Solution:
    def findItinerary(self, tickets: List[List[str]]) -> List[str]:
        flights = collections.defaultdict(list)
        for f, t in tickets:
            flights[f].append(t)
        
        for f in flights.keys():
            flights[f].sort()
        
    # Counter 을 사용하였다. 
        # 다른 방법으로는 list 에서 직접 삭제의 방법이 있지만, list 에서의 직접 삭제는 O(n) 의 시간복잡도
    # Counter 의 경우 O(1) 이다.
    # array 는 hash-key 가 될 수 없기 때문에 tuple 로 변경
        available = Counter(map(tuple, tickets))
        # print(available)
        def dfs(cur, path):
      # 전부다 돌앗음. 이게 정답
            if len(path) == len(tickets)+1:
                return path
            for to in flights[cur]:
                if available[(cur, to)] > 0:
                    available[(cur, to)] -= 1
                    tmp = dfs(to, path+[to])
          # 정답을 찾았다면 그 정답을 계속 전파한다.
                    if tmp: return tmp
                    available[(cur, to)] += 1
            return False
            
        return dfs('JFK', ['JFK'])
```

`Hierholzer’s Algorithm` 은 이걸 참조하는 편이 낫다.

[https://www.geeksforgeeks.org/hierholzers-algorithm-directed-graph/](https://www.geeksforgeeks.org/hierholzers-algorithm-directed-graph/)

```python
from collections import Counter
class Solution:
    def findItinerary(self, tickets: List[List[str]]) -> List[str]:
        flights = collections.defaultdict(list)
        for f, t in tickets:
            flights[f].append(t)
        
        for f in flights.keys():
      # 작은 순서부터 사용하기 때문에 sort 을 하지만 pop 으로 list 을 삭제하기 위해 
      # reverse 을 한다.
            flights[f].sort()
            flights[f].reverse()
        
        stack = ['JFK']
        res = []
        
        while len(stack) > 0:
            cur = stack[-1]
            if len(flights[cur]) > 0:
                stack.append(flights[cur].pop())
            else:
                res.append(stack.pop())
        return res[::-1]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
