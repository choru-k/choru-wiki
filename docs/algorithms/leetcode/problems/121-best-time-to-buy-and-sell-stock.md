---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Greedy
---

# 121. Best Time to Buy and Sell Stock

## 문제

[LeetCode 121](https://leetcode.com/problems/best-time-to-buy-and-sell-stock/) •**Easy**

## 핵심 아이디어

매우 간단한 방법으로 풀 수가 있습니다.

최대 수익은 가장 싼 가격에 사서, 가장 비싼 가격에 팔면 됩니다.

## Solution

```python
class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        if len(prices) == 0:
            return 0
    # 현재까지의 가격중에서 가장 싼 가격
        cur_min_price = prices[0]
        ret= 0
        for price in prices[1:]:
      # 만약 지금 판다고 했을 때의 수익.
      # 지금까지의 가격 중 가장 쌌을 때 샀다고 가정한다. 공매도가 안되므로..
            ret = max(price - cur_min_price, ret)
            cur_min_price = min(price, cur_min_price)
        return ret
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
