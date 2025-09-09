---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Union-Find
---

# 1202. Smallest String With Swaps

## 문제

[LeetCode 1202](https://leetcode.com/problems/smallest-string-with-swaps/) • **Medium**

## 핵심 아이디어

일단 가장 간단한 방법을 생각해보자.

swap 으로 생길 수 있는 모든 경우의 수 중에서 가장 smallest 한 것을 고르면 된다.

하지만 모든 경우의 수를 어떻게 구할까? 최소한 n! 만큼은 필요하다는 것을 알 수 있다. 보다 클 수도 있다.

그렇기 때문에 우리는 다른 방법을 생각해야 한다.

  

![[238DA2DB-7B92-42A2-8248-FA2E254A438A.jpeg]]

  

보면 알겠지만 실제로 각각의 원소는 연결된 pair 에 따라서 그룹으로 묶을 수 잇다. 왜냐하면 그룹으로 묶이지 않은 곳으로 원소는 이동 할 수 없기 때문이다. 그렇기 때문에 우리는 pair 로 연결된 그룹을 찾고 각각의 그룹을 가장 smallest 하게 만들면 그것이 전체 정답이 된 다는 것을 알 수가 있다.

  

그러면 이제 어떻게 그룹을 만들지 생각해 보자.

  

가장 간단한 방법은 DFS 이다.

시간 복잡도는 `O(NlogN)` 이다. 그룹을 만들때는 `O(N)` 이지만 각각의 그룹을 Sort 하기 때문에 이때 `O(NlogN)` 을 사용한다. 만약 pairs 가 N^2 이라면 `O(N^2)`

## Solution

```python
class Solution:
    def smallestStringWithSwaps(self, s: str, pairs: List[List[int]]) -> str:
        check = [False] * len(s)
        
        ans = list(s)
        pairs_dic = collections.defaultdict(list)
        for a, b in pairs:
            pairs_dic[a].append(b)
            pairs_dic[b].append(a)
        
        def sortGroup(group):
            group.sort()
            ss = [s[i] for i in group]
            ss.sort()
            for i in range(len(group)):
                ans[group[i]] = ss[i]

        def makeGroup(idx):
            group=[]
            def dfs(i, group):
                if check[i] == False:
                    check[i] = True
                    group.append(i)
                    for e in pairs_dic[i]:
                        dfs(e, group)
                    
            dfs(idx, group)
            return group
            
        for idx in range(len(s)):
            group = makeGroup(idx)
            sortGroup(group)
        return "".join(ans)
```

  

우리는 Group 을 만들 때 좋은 알고리즘을 알고 있다. 그것은 Union-Find 이다. Union-Find 을 사용해서 위의 알고리즘을 변형해보자

시간 복잡도는 바뀌지 않는다. Union-Find 가 최적화 되어있다면 `O(N)` 으로 그룹을 만들 수 있다.

```python
class UnionFind:
    def __init__(self, l):
        self.ids = [i for i in range(l)]
        
    def find(self, id):
        if self.ids[id] == id:
            return id
        self.ids[id] = self.find(self.ids[id])
        return self.ids[id]

    def union(self, a, b):
        a = self.find(a)
        b = self.find(b)
        if a > b : a, b = b,a
        self.ids[b] = a
        

class Solution:
    def smallestStringWithSwaps(self, s: str, pairs: List[List[int]]) -> str:
        unionFind = UnionFind(len(s))
        
        for a, b in pairs:
            unionFind.union(a,b)
        
        ans = list(s)
        def sortGroup(group):
            group.sort()
            ss = [s[i] for i in group]
            ss.sort()
            for i in range(len(group)):
                ans[group[i]] = ss[i]
            
        groups = collections.defaultdict(list)    
        for idx in range(len(s)):
            groups[unionFind.find(idx)].append(idx)
        
        for group in groups.values():
            sortGroup(group)
            
        
        return "".join(ans)
```

  

Deque 을 활용해서 코드를 좀더 간략화 시킬 수 있다. 시간 복잡도는 바뀌지 않는다.

```python
class UnionFind:
    def __init__(self, l):
        self.ids = [i for i in range(l)]
        
    def find(self, id):
        if self.ids[id] == id:
            return id
        self.ids[id] = self.find(self.ids[id])
        return self.ids[id]

    def union(self, a, b):
        a = self.find(a)
        b = self.find(b)
        if a > b : a, b = b,a
        self.ids[b] = a
        

class Solution:
    def smallestStringWithSwaps(self, s: str, pairs: List[List[int]]) -> str:
        unionFind = UnionFind(len(s))
        
        for a, b in pairs:
            unionFind.union(a,b)
            
        groups = collections.defaultdict(list)    
        for idx in range(len(s)):
            groups[unionFind.find(idx)].append(s[idx])
        
        for key in groups.keys():
            groups[key] = collections.deque(sorted(groups[key]))
            
        ans = list(s)
        for idx in range(len(s)):
            ans[idx] = groups[unionFind.find(idx)].popleft()
        return "".join(ans)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
