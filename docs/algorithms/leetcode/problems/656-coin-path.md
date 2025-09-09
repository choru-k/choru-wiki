---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 656. Coin Path

## 문제

[LeetCode 656](https://leetcode.com/problems/coin-path/) • **Hard**

일단 문제을 좀 더 간단한 문제로 생각해보자.

만약 path 가 아니라 단순하게 최소인 cost 가 구하고자 한다면 어떻게 될까?

$dp[i] = min_{j=i+1}^{n}dp[j] + cost[i]$﻿

의 식을 만족하게 될 것 입니다.

  

이제 path 을 고려해주기 위해서 dp 안에 cost 와 최소의 코스트을 만들 때의 node 을 같이 넣어주도록 합시다.

시간복잡도는 `O(A*B)` 가 됩니다.

```python
class Solution:
    def cheapestJump(self, A: List[int], B: int) -> List[int]:
        @functools.lru_cache(None)
        def dfs(cur):
            if cur >= len(A) or A[cur] == -1:
                return (float('inf'), -1)
            if cur == len(A)-1:
                return (A[cur], -1)
						# cost, 코스트가 최소가 되는 next_node
            ret = (float('inf'), -1)
            for i in range(1, B+1):
                if cur + i > len(A):
                    break
								# cur+i 을 방문할 때, 최소의 cost 가 된다.
                ret = min(ret, (dfs(cur+i)[0], cur+i))
            return (ret[0]+A[cur], ret[1])
        cost, _ = dfs(0)
				# 만약 cost 가 inf 면 도착하지 못햇다.
        if cost == float('inf'):
            return []
				# 최소의 코스트을 따라 올라간다.
        cur = 0
        ans = []
        while cur != -1:
            ans.append(cur+1)
            _, cur = dfs(cur)
        return ans
```

  

밑은 위의 코드을 Bottom-up 방식으로 구현한 것이다.

```python
class Solution:
    def cheapestJump(self, A: List[int], B: int) -> List[int]:
        if A[-1] == -1:
            return []
        dp = [(float('inf'), -1) for _ in range(len(A))]
        dp[-1] = (A[-1], -1)
        
        for cur in reversed(range(len(A))):
            if A[cur] == -1:
                continue
            for i in range(1, B+1):
                if cur+i >= len(A):
                    break
                dp[cur] = min(dp[cur], (dp[cur+i][0] + A[cur], cur+i))
        if dp[0][0] == float('inf'):
            return []
        cur = 0
        ans = []
        while cur != -1:
            ans.append(cur+1)
            _, cur = dp[cur]
        return ans
```

  

## 최적화

조금 더 고민해보자. 만약 i < j 이고 dp[i] ≤ dp[j] 을 만족한다면 i 보다 왼쪽에 있는 모든 점들은 j 대신 i 을 선택할 것이다. 왜냐하면 i 을 선택하는게 더 코스트가 적고, index 상으로도 더 작기 때문이다.

이걸 잘 이용해보자. 즉 매번 B 개의 다음 node 들을 비교하는 것이 아니라 더 유리한 것들만 비교하도록 합시다.

일단 j > i 을 만족할 때, j → i 순으로 값을 차곡차곡 넣기 때문에 인덱스 순으로는 이미 정렬이 되어 있습니다.

만약 dp[j] ≥ dp[i] 라면 이러한 j 는 정답의 후보가 될 수 없기 때문에 빼냅니다.

이러한 자료구조는 stack 을 이용해서 구현할 수 있습니다. 그리고 최대 B 개만 유지해야 되기 때문에 B 가 넘을 시 빼내야 하기 때문에 deque 을 사용해야 합니다.

  

밑의 코드는 이것을 구현하였습니다. 전체 시간복잡도는 `O(N)` 이 됩니다.

```python
class Solution:
    def cheapestJump(self, A: List[int], B: int) -> List[int]:
        
        if A[-1] == -1:
            return []
        dp = [(float('inf'), -1) for _ in range(len(A))]
        dp[-1] = (A[-1], -1)
				# 그 다음 node 가 될 수 있는 후보들 입니다.
        candidates = collections.deque()
        candidates.append((A[-1], len(A)-1))
        
        for cur in reversed(range(len(A)-1)):
            if len(candidates) == 0:
                return []
            if A[cur] >= 0:
								# 일단 candidates 안에서 코스트가 내림차순 정렬이 되어 있기 때문에
								# 가장 작은 코스트을 가진 것은 candidates[-1] 입니다. 그래서 바로 사용가능 합니다. 
                dp[cur] = (candidates[-1][0] + A[cur], candidates[-1][1])
								# 내림차순을 계속 유지하기 위해서 조작을 해줍니다.
                while len(candidates) > 0 and dp[cur][0] <= candidates[0][0]:
                    candidates.popleft()
                candidates.appendleft((dp[cur][0], cur))
						# 최대 B 까지만 이동가능 합니다.
            if candidates[-1][1] == cur+B:
                candidates.pop()
        
        if dp[0][0] == float('inf'):
            return []
        cur = 0
        ans = []
        while cur != -1:
            ans.append(cur+1)
            _, cur = dp[cur]
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
