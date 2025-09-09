---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Work-In-Progress
---

# 123. Best Time to Buy and Sell Stock III

## 문제

[LeetCode 123](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-iii/) • **Medium**

## 핵심 아이디어

```python
class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        # 2번 거래를 하기 때문에, 2개로 나눌수 있다.
        ans = 0
        n = len(prices)
        for i in range(n):
            ans = max(ans, self.getMaxProfit(prices[:i]) + self.getMaxProfit(prices[i:]))
        return ans
            
    def getMaxProfit(self, arr):
        tmp = 0
        min_price = float('inf')
        for p in arr:
            tmp = max(tmp, p - min_price)
            if min_price > p:
                min_price = p
        return tmp
```

O(N^2) Time Error

  

조금 더 생각해보면 배열을 앞 뒤로 순회하면서 최대 profit 을 구할 수 있다.

  

```python
class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        left = [0]
        cur_min = prices[0]
        for p in prices[1:]:
            left.append(max(left[-1], p-cur_min))
            cur_min = min(p, cur_min)
        right = [0]
        cur_max = prices[-1]
        for p in reversed(prices[:-1]):
            right.append(max(right[-1], cur_max-p))
            cur_max = max(p, cur_max)
        right = right[::-1]
        # print(left)
        # print(right)
        return max([left[i] + right[i] for i in range(len(prices))])
```

  

조금 더 생각하면 state 의 관점에서 생각할 수 있다.

  

```python
class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        sell1= sell2 = 0
        buy1 = buy2 = float('-inf')
        
        for p in prices:
            sell2 =  max(sell2, buy2 + p)
            buy2 = max(buy2, sell1 - p)
            sell1 = max(sell1, buy1+p)
            buy1 = max(buy1, -p)
            
        return sell2
```

  

```python
class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        f_sell = s_sell = f_buy = s_buy = float('-inf')

        for p in prices:
            s_sell = max(s_sell, s_buy+p)
            s_buy = max(s_buy, f_sell - p)
            f_sell = max(f_sell, f_buy+p)
            f_buy = max(f_buy, -p)
        return max(s_sell, f_sell, 0)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
