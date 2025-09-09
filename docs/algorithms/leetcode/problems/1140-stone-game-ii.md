---
tags:
  - LeetCode
  - Algorithm
  - Minimax
---

# 1140. Stone Game II

## 문제

[LeetCode 1140](https://leetcode.com/problems/stone-game-ii/) • **Medium**

## 핵심 아이디어

이러한 문제는 전형적인 minimax 문제이다.

  

minimax의 중요한 점은 니턴 내턴은 구분해야 한다는 것이다.

  

내턴 일때는 가장 최댓값을 리턴하도록 하고, 니턴 일때는 가장 최솟값을 리턴하도록 한다.

우리는 필요한 값이 Alice 의 값만 필요하기 때문에 max_alice라고 하였다.

## Solution

```python
class Solution:
    def stoneGameII(self, piles: List[int]) -> int:
        @functools.lru_cache(None)
        def max_alice(idx, m, who):
            if idx >= len(piles):
                return 0
            if who == 1:
                cur = 0
                res = 0
                for i in range(2*m):
                    if idx+i >= len(piles):
                        break
                    cur += piles[idx+i]
										# Alice 는 최선의 선택을 함
                    res = max(res, cur+max_alice(idx+i+1, max(m, i+1), -who))
                return res
            else:
								# Bob 은 자신이 최대가 되도록 행동한다.
								# 이 게임은 제로섬 게임이기 때문에
								# Alice 가 가장 불리하게 되도록 선택한다랑 일맥상통한다.
                return min(max_alice(idx+i+1, max(m,i+1), -who) for i in range(2*m))
        
        return max_alice(0, 1, 1)
```

  

보다 정확하게 구할 수도 있다.

각각의 턴을 나누고 각각의 턴에 최댓값을 만들도록 행동한다고 하면 밑의 코드가 된다.

```python
class Solution:
    def stoneGameII(self, piles: List[int]) -> int:
        @functools.lru_cache(None)
        def minimax(start, m, who):
            if start >= len(piles):
                return [0, 0]
            
            res = [0,0]
            for x in range(1, 2*m+1):
								# return 을 list등의 object로 할 경우 복사해주고 사용하자.
                cur = minimax(start+x, max(m, x), who^1)[:]
                cur[who] += sum(piles[start:start+x])
                res = max(res, cur, key=lambda x: x[who])
            
            return res
        ans = minimax(0, 1, 0)
        
        return ans[0]
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
