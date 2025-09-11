---
tags:
  - LeetCode
  - Algorithm
  - BFS
  - Dynamic-Programming
  - Greedy
---

# 818. Race Car

## 문제

[LeetCode 818](https://leetcode.com/problems/race-car/) • **Hard**

## BFS

일단 BFS 로 풀릴 수 있다는 건 알지만 position 과 speed 의 범위가 정해져 있지 않기 때문에 시간, 공간 복잡도를 정확하게 알 수가 없다. 그렇기 때문에 특정 조건을 추가했다.

`if p > target*2 or p < 0 or abs(s) > target*2: continue`

이게 왜 만족되는지 생각해보자.

만약 p 가 0 이하면 0뒤로 갔다는 건데 다시 앞으로 가야한다. 이건 앞으로 갔다가 뒤로 간 것과 다른것이 없고, 처음 시작이 앞방향으로 시작되기 때문에 앞방향으로 갔다가 뒤로 가는게 무조건 이득이다.

만약 p 가 target 이상이라면 ans(p-target) 의 문제로 바꿀 수가 있다. 만약 `p > target*2` 라면 원래 문제 ans(target) 보다 큰 것이 자명하다.

만약 speed 가 target*2 라면 pos 가 0 이상이면 위의 조건과 같다.

```python
class Solution:
    def racecar(self, target: int) -> int:
        layer = collections.deque([(0,1)])
        visited = set()
        ans = 0
        while len(layer) > 0:
            nxt_layer = collections.deque()
            while len(layer) > 0:
                p, s = layer.popleft()
        # 핵심
                if p<0 or p > target*2 or abs(s) > target*2:
                    continue
                if p == target:
                    return ans
                nxt_a = (p+s, 2*s)
                if nxt_a not in visited:
                    nxt_layer.append(nxt_a)
                    visited.add(nxt_a)
                nxt_r = (p, -1 if s > 0 else 1)
                if nxt_r not in visited:
                    nxt_layer.append(nxt_r)
                    visited.add(nxt_r)
            layer= nxt_layer
            ans+=1
```

## DP

약간의 Greedy 한 방법을 사용해보자.

`memo[num]: 현재 스피드가 +1 일 때, num 만큼 가기위해서 필요한 최소 횟수.`

라고 정의 할 때 `memo[num]` 을 어떻게 구할 수 있을까?

우리가 계속 엑셀을 밟을 경우 `1 + 2 + 4 + 8 + ...` 이 되고 `2^n-1 (n은 엑셀을 밟은 시간)` 이 된다.

3가지의 경우가 있다.

1. 정확히 목적지에 도착할 때
2. 목적지를 지나쳐 버렸을 때
3. 목적지에 아직 도착 하지 않았을 때

1의 경우는 바로 정답이 된다.

2의 경우에는 지나쳐 버리자 마자 reverse 을 해야한다. 속도가 매번 2배가 되기 때문에 지나쳐버린 후 계속 갈 경우 무조건 목적지의 2배 이상의 거리를 가게 되고 위의 BFS 에서 본 것 처럼 무조건 손해이다

3의 경우 되도록 가까이 가는게 중요하다. 물론 더 먼점에서 출발하는게 더 이득일 수 있지만 어차피 reverse 을 한 뒤 얼마만큼 뒤로 가기 때문에 결국 더 먼점에서 출발할 수 가 있고 중요한 것은 얼만큼 뒤로 가냐가 된다.

```python
class Solution:
    def racecar(self, target: int) -> int:
        # memo[num]: 현재 스피드가 +1 일 때, num 만큼 가기위해서 필요한 최소 횟수.
        memo = {0: 0}
        
        def dp(num: int):
            if num not in memo:
                n = num.bit_length()
        # 1의 경우
                if 2**n - 1 == num: 
                    memo[num] = n

                else:
        # 2의 경우
                # n 만큼 앞으로 간다. n
                # 한번 reverse 로 한다 1
                # 2**n-1 - t 만큼 뒤로 가야한다
                # 한번 reverse 을 했기 때문에 현재 스피드를 +1로 보고 2**n-1-t 만큼 앞으로 전진한다고 생각한다
                    memo[num] = dp(2**n - 1 - num) + n + 1
          # 3의 경우
                    for m in range(1, n):
                        # n-1 만큼 앞으로 간다.
                        # reverse 1
                        # m-1 만큼 뒤로 간다
                        # speed을 1 로 하기 위해서 다시 reverse 1
                        memo[num] = min(memo[num], dp(num - 2**(n-1) + 2**(m-1)) + (n-1) +1 + (m-1) + 1)
            return memo[num]
        return dp(target)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
