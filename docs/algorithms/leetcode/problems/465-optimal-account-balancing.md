---
tags:
  - LeetCode
  - Algorithm
  - BFS
  - DFS
  - Greedy
---

# 465. Optimal Account Balancing

## 문제

[LeetCode 465](https://leetcode.com/problems/optimal-account-balancing/) •**Medium**

일단 잘은 모르겠지만 3-parition 문제로 귀결된다고 하고 3-partition 문제가 NP 문제이니 모든 경우를 해보는 것이 최적의 방법이다.

모든 경우를 다 시도 하는 방법 중 가장 일반적인게 DFS, BFS 이다.

기본적으로 내가 주는 돈과 받는 돈의 합계가 0 이라면 나는 아무것도 안해도 된다.

그렇기 때문에 전처리를 해준다.

## DFS

```python
class Solution:
    def minTransfers(self, transactions: List[List[int]]) -> int:
        bals = collections.defaultdict(int)
        for x, y, z in transactions:
            bals[x] -= z
            bals[y] += z
        
    # 주는돈, 받는돈 합계 0 일때의 전처리
        debt = list(filter(lambda x: x != 0, bals.values()))
        # print(debt) 
        def dfs(d):
      # 일반적으로는 every(lambda x: x == 0, debt) == True 을 체크해서 
      # True 면 0, False 면 inf 을 return 해야하지만
      # 이 문제의 정의상 항상 True 가 된다. 
            if d == len(debt):
                return 0
            res = float('inf')
      # 현재 d 의 돈이 0이라면 아무것도 안해도 된다. pass
            if debt[d] == 0:
                return dfs(d+1)
            for i in range(d+1, len(debt)):
        # debt[d]*debt[i] 는 없어도 되지만 약간의 최적화 이다.
                if debt[d]*debt[i] < 0:
          # debt[d] 을 더이상 체크해 주지 않기 위해 debt[i] 에 돈을 옮긴다.
          # 곰곰히 생각해보면 
          # debt[i] = debt[i]+debt[d] 와 debt[d] = debt[d]+debt[i]는 동치이다.
                    debt[i] += debt[d]
                    res = min(res, 1+dfs(d+1))
                    debt[i] -= debt[d]
            return res if res != float('inf') else 0
        ans = dfs(0)
        return ans
```

## BFS

Delete Cycle

[https://leetcode.com/problems/couples-holding-hands/](https://leetcode.com/problems/couples-holding-hands/)

[[Spaces/Home/PARA/Resource/Leetcode/765. Couples Holding Hands]]

을 참고하면 Cycle 을 에 대해서 이해하기 쉽다.

마찬가지로 bal 을 합쳐서 0 이 되는 cycle 을 찾으면 이때 최소의 transaction 의 수는 `len(cycle)-1` 이다.

그러면 cycle 을 어떻게 찾을까? 그걸 BFS 로 찾는다.

```python
class Solution:
    def minTransfers(self, transactions: List[List[int]]) -> int:
        bals = collections.defaultdict(int)
        for x, y, z in transactions:
            bals[x] -= z
            bals[y] += z
        
        debt = list(filter(lambda x: x != 0, bals.values()))
        
        def bfs(debt):
            queue = collections.deque()
            queue.append(([0], debt[0], 0))
            
            cycle = None
            while cycle is None:
                path, now_val, idx = queue.popleft()
                for i in range(idx+1, len(debt)):
                    queue.append((path + [i], now_val+debt[i], i))
                    if now_val+debt[i] == 0:
                        cycle = set(path + [i])
                        break
            
            return cycle
        
        ans = 0
        while len(debt) > 0:
            cycle = bfs(debt)
            debt = list(map(lambda x: x[1], filter(lambda x: x[0] not in cycle, enumerate(debt))))
            ans += len(cycle)-1
        return ans
```

## DP DFS

기본 개념은 위의 cycle 과 같다.

위에서 합의 0 이 되는 set 이 있을 때, 최소의 transaction 은 len(set)-1 이라고 했다.

```python
ans = (transactions for min_set1) + (transactions for min_set2) + ... + (transactions for min_setm)
ans = len(min_set1) - 1 + len(min_set2) - 1 + ... + len(min_setm) - 1
Note: len(min_set1) + len(min_set2) + ... + len(min_setm) = N,
and there are M (-1)'s.
So we have ans = N - M.
```

그렇다면 위의 식이 성립한다는 것을 알 수가 있고, 즉 M 을 구하면 된다. M 은 이러한 set 들의 갯수이다.

`dp(mask)` 은 mask[i] 가 True 면 그 dept[i] 을 사용하는 집합을 의미한다.

```python
class Solution:
    def minTransfers(self, transactions: List[List[int]]) -> int:
        bals = collections.defaultdict(int)
        for x, y, z in transactions:
            bals[x] -= z
            bals[y] += z
        
        debt = [x for x in bals.values() if x != 0]
        # print(debt)
        memo = dict()
        def dfs(mask):
            # 모든 mask 의 원소가 False
            if any(mask) == False:
                return (0, 0)
            if mask not in memo:
                max_cnt = 0
                for i in range(len(debt)):
                    if mask[i] == True:
                        sub_mask = list(mask[:])
                        sub_mask[i] = False
                        
                        cnt, val = dfs(tuple(sub_mask))
                        now_sum = val + debt[i]
                        if now_sum == 0:
              # 우리는 이러한 set 들의 갯수의 최대을 원한다. 
                            max_cnt = max(max_cnt, cnt+1)
                        else:
                            max_cnt = max(max_cnt, cnt)
                        
                memo[mask] = (max_cnt, now_sum)
            return memo[mask]
        
        
        cnt, val = dfs(tuple([True] * len(debt)))
        
        return len(debt) - cnt
```

위의 방법을 Bit 조작을 통해서 구현했다.

Bit 조작을 사용하면, 보다 시간복잡도를 정확하게 구할 수 있어서 추천.

```python
class Solution:
    def minTransfers(self, transactions):
        persons = collections.defaultdict(int)
        for u,v,cost in transactions:
            persons[u] += cost
            persons[v] -= cost
        persons = [c for c in persons.values() if c != 0]
        n = len(persons)
        dp = [0 for _ in range(2**n)]
        sums = [0 for _ in range(2**n)]
        
        for state in range(2**n):
            for i in range(n):
                if state >> i & 1 == 0:
                    nxt = state | (1 << i)
                    sums[nxt] = persons[i] + sums[state]
                    dp[nxt] = max(dp[nxt], dp[state])
                    if sums[nxt] == 0:
                        dp[nxt] = max(dp[nxt], dp[state]+1)
                    
                        
        
        return n-dp[-1]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
