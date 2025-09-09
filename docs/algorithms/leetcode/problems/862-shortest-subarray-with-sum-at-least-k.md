---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 862. Shortest Subarray with Sum at Least K

## 문제

[LeetCode 862](https://leetcode.com/problems/shortest-subarray-with-sum-at-least-k/) • **Hard**

## 핵심 아이디어

일단 가장 간단한 방법은 모든 경우의 수를 비교 하는 것이다. 특정 구간의 부분합은 precomuted sum 을 통해서 O(1) 에 구할 수 있다.

이 때의 시간 복잡도는 O(N^2) 이다.

  

  

특정 범위 (a, b) 가 조건을 만족하는지 아닌지 확인을 한다고 하자. 만약 (a,b) 가 조건을 만족한다면 a 가 고정인 상태에서 b 보다 더 큰 숫자에 대해서는 검사를 할 필요가 없다. 왜냐하면 b 가 정답에 가깝기 때문이다.

또한 b 가 고정일 경우 a 보다 작은 숫자에 대해서는 검사를 할 필요가 없다.

즉 b는 항상 커지는 방향으로만 진행해도 된다. 또한 b 가 커지는 방향으로만 진행된다면 a 또한 커지는 방향으로만 진행해도 문제가 없을 것이다.

또한 (a,b) 가 조건 만족 일 때 (a', b) 가 정답 후보가 되기 위해서는 `sums(a) < sums(a')` 의 조건을 만족해야 한다. 즉 sums 는 커지는 방향이여야 한다.

만약 이 조건을 안넣을 경우

정답 | 안정답 | 정답 의 a 가 deque 에 들어가게 되고, 안정답 때문에 뒤의 정답 queue가 pop 이 안되기 때문에 이걸 `정답 | 정답 | 정답 | 안정답 | 안정답 | 안정답` 처럼 만들기 위해서 단조 증가로 만들어야 한다.

  

조금 더 이해가 쉽게 하자면 만약 음수가 없었다면 어떻게 풀엇을지 부터 생각해보자. 그렇다면 간단하게 slide window 을 썻을 것이다. 이번에는 음수가 있었기 때문에 dq 의 pop 을 통해서 단조증가하게 억지로 만들었다.

  

위의 방법을 코드로써 표현한 것이 밑이다.

## Solution

```python
class Solution:
    def shortestSubarray(self, A: List[int], K: int) -> int:
        dq = collections.deque()
        
        # sums[i] = sum of 0 ~ i-1
        # sums[j] - sums[i] = sum(i~j)
        sums = [0]
        for num in A:
            sums.append(sums[-1] + num)
            
        ans = float('inf')
        for idx in range(len(sums)):
            while len(dq) >0 and sums[idx] - sums[dq[0]] >= K:
                ans = min(ans, idx - dq[0])
                dq.popleft()
            while len(dq) > 0 and sums[dq[-1]] >= sums[idx]:
                dq.pop()
            dq.append(idx)
        if ans == float('inf'):
            return -1
        return ans
```

  

두 번째 방법 Using heap

```python
from heapq import heappush, heappop
class Solution:
    def shortestSubarray(self, A: List[int], K: int) -> int:
        hq = []
        heappush(hq, (0, -1))
        ans = float('inf')
        sm = 0
        for i, num in enumerate(A):
            sm+=num
            # print(hq)
            while len(hq) > 0 and hq[0][0] <= sm - K:
                _, i2 = heappop(hq)
                ans = min(ans, i-i2)
            heappush(hq, (sm, i))
        if ans == float('inf'): return -1
        return ans
```

  

Using binary search

  

```python
class Solution:
    def shortestSubarray(self, A: List[int], K: int) -> int:
        pre_sums = [(0, -1)]
        ret = float('inf')
        cur = 0
        for idx, num in enumerate(A):
            cur += num
            i = bisect.bisect_left(pre_sums, (cur-K+1, ))
            if i > 0:
                ret = min(ret, idx - pre_sums[i-1][1])
            while len(pre_sums) > 0 and pre_sums[-1][0] >= cur:
                pre_sums.pop()
            pre_sums.append((cur, idx))
        
        return ret if ret != float('inf') else -1
```

  

[https://leetcode.com/problems/shortest-subarray-with-sum-at-least-k/discuss/531032/3-Clean-Python-Solution%3A-Deque-Heap-or-Binary-Search](https://leetcode.com/problems/shortest-subarray-with-sum-at-least-k/discuss/531032/3-Clean-Python-Solution%3A-Deque-Heap-or-Binary-Search)

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
