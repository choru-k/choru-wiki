---
tags:
  - LeetCode
  - Algorithm
  - Topological-Sort
---

# 1136. Parallel Courses

## 문제

[LeetCode 1136](https://leetcode.com/problems/parallel-courses/) • **Medium**

간단하게 Topological Sort + BFS 로 해결된다.

시간복잡도, 공간 복잡도 `O(N+relations)`

모든 relation 들과 Node 들을 1번씩만 지나기 때문에.

```python
class Solution:
    def minimumSemesters(self, N: int, relations: List[List[int]]) -> int:
        par = {i:set() for i in range(1,N+1)}
        graph = {i:set() for i in range(1,N+1)}
        
        for s,e in relations:
            graph[s].add(e)
            par[e].add(s)
        
        layer = collections.deque()
        for node in par:
            if len(par[node])  == 0:
                layer.append(node)
        
        ans = 0
        while len(layer) > 0:
            nxt_layer = collections.deque()
            for node in layer:
                for nxt in graph[node]:
                    par[nxt].remove(node)
                    if len(par[nxt]) == 0:
                        nxt_layer.append(nxt)
            
            layer = nxt_layer
            ans +=1
        # print(par)
        return ans if max([len(p) for p in par.values()]) == 0 else -1
```

## Follow Up

- 만약 한번에 최대 K 개의 수업만 들을 수 있다면 어떻게 할 것인가
    
    [https://leetcode.com/problems/parallel-courses/discuss/363145/google-follow-up-questions](https://leetcode.com/problems/parallel-courses/discuss/363145/google-follow-up-questions)
    
    결국 k 개을 골라야 하는데 더 많은 자식과의 연관관계을 가진 것을 기준으로 뽑아야함. 대충 greedy 하게
    
    정답은 NP 여서 다 해봐야한다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
