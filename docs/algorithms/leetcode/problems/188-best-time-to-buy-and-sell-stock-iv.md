---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Greedy
  - Stack
---

# 188. Best Time to Buy and Sell Stock IV

## 문제

[LeetCode 188](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-iv/) • **Medium**

## 핵심 아이디어

일단 기본적으로 DP을 사용해서 풀어보자.

$dp[k][i] = max_{j=0..i-1}(dp[k][i-1],dp[k-1][j]+price[i]-price[j])$

k 가 남은 횟수 i 가 날짜라고 할 경우, 위의 식이 표현 될 수 있다.

`dp[k][i-1]` 이번에 아무것도 안하기

`dp[k-1][j]+(price[i]-price[j])` j 일에 사서 i 을에 팔기.

위의 방법의 경우 dp 1칸을 채울 때 `O(N)` 이기 때문에 전체 시간복잡도는 `O(k*N*N)` 이 된다.

$max(dp[k][i-1], max_{j=0..i-1}(dp[k-1][j]+price[i]-price[j]))$

$max_{j=0..i-1}(price[i]+(dp[k-1][j]-price[j])) = price[i] + max_{j=0..i-1}(dp[k-1][j]-price[j])$

을 통해서 각 칸을 `O(1)` 에 구할 수 있고 전체 시간복잡도는 `O(k*N)` 이 된다.

  

  

좀더 다른 아이디어를 생각해보자.

우리는 항상 거래를 valley 에서 사고 peek 에서 팔 것 이라는 걸 알 수가 있다.

![[_2019._9._8._18_30_22.jpg]]

우리가 원하는 건 최적의 profit 만드는 조합 k 개 이다.

어떻게 좋은 profit 을 만들 수 있을까?

만약 v1 > v2 면, v1 이 만들 수 있는 최적의 profit 은 (p1-v1) 이 된다.

왜냐하면 그 뒤에 나오는 peak 들은 항상 v2와 조합을 만드는게 유리하기 때문이다.

v_1 ≤ v_2 and p_1 ≤ p_2 이면 우리는 (p_1-v_1) + (p_2-v_2) 을 (p_2-v_1) + (p_1-v_2) 로 바꿀 수 있다. 만약 (p_1-v_2) 가 Top k 에 들어갈 정도로 크다면 우리는 (v1~p2) 의 사이에 거래를 2번 할 수 있는 것이고 그렇지 않다면 1번의 거래가 최적의 거래였던 것이다.

  

이걸 코드로써 잘 표현해보자.

## Solution

```python
from heapq import heappush, heappop

class Solution:
    def maxProfit(self, k: int, prices: List[int]) -> int:
        profit_heap = []
        l = len(prices)
        v,p= 0,0
        vp_stack = []
        while p < len(prices):
						# valley 을 찾는다.
            v = p
            while v+1 < l and prices[v] > prices[v+1]:
                v+=1
						# peak 을 찾는다.
            p = v+1
            while p+1 < l and prices[p] < prices[p+1]:
                p+=1
						# 만약 v_2 < v_1 인 상황 일 때
            while len(vp_stack) > 0 and prices[v] < prices[vp_stack[-1]['v']]:
                tmp = vp_stack.pop()
                heappush(profit_heap, prices[tmp['p']] - prices[tmp['v']])
						# p 가 범위를 넘어 갈 수도 있음 v=len(prices)-1 이면 p = len(prices)가 됨
            if p < l:
								# 중간 사이즈 profit 을 큰 profit 1개 작은 profit 1개로 나눈다.
                while len(vp_stack) > 0 and prices[p] > prices[vp_stack[-1]['p']]:
                    tmp = vp_stack.pop()
                    heappush(profit_heap, prices[tmp['p']] - prices[v])
                    v = tmp['v']
                vp_stack.append({ 'v': v, 'p': p })
						# 항상 heap 사이즈를 k로 맞추어주어서 Nlogk 을 유지하게 한다.
            while len(profit_heap) > k: 
                heappop(profit_heap)
				# 남은 vp 조합 계산
        while len(vp_stack):
            tmp = vp_stack.pop()
            heappush(profit_heap, prices[tmp['p']] - prices[tmp['v']])
        while len(profit_heap) > k: 
            heappop(profit_heap)
        
				# 그냥 pop 으로 빼도 됨. 어차피 Top k 가 중요.
        ans = 0
        while len(profit_heap) > 0:
            ans += profit_heap.pop()
        return ans
```

이건 `O(N + NlogK)` 이 된다.

  

  

잘 생각해보면 우리는 Top K 만 구하면 된다. 그렇다면 nth-element 가 훨씬 유리하다.

```python
class Solution:
    def maxProfit(self, k: int, prices: List[int]) -> int:
        v, p = 0,-1
        vp = []
        profits = []
        while p+1 < len(prices):
            v = p+1
            while v+1 < len(prices) and prices[v] > prices[v+1]:
                v+=1
            p = v+1
            while p+1 < len(prices) and prices[p] < prices[p+1]:
                p+=1

						if p == len(prices): break

            while len(vp) > 0 and prices[vp[-1]['v']] > prices[v]:
                profits.append(prices[vp[-1]['p']] - prices[vp[-1]['v']])
                vp.pop()
            while len(vp) > 0 and prices[vp[-1]['p']] < prices[p]:
                profits.append(prices[vp[-1]['p']] - prices[v])
                v = vp[-1]['v']
                vp.pop()
            vp.append({'v': v, 'p': p})
        while len(vp) > 0:
            profits.append(prices[vp[-1]['p']] - prices[vp[-1]['v']])
            vp.pop()
        
        
        ans = 0
        nth_element(profits)
        for i in range(k):
            ans += profits[i]
        
        return ans
```

이건 `O(N)` 이 된다. python 에는 nth_element 가 구현되어 있지 않기 때문에 leetcode 제출을 위해서는 직접 구현해야한다.

  

  

  

![[0C1F680C-0072-4A62-95D4-0B75E3DAFA2A.jpeg]]

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
