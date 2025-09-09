---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 309. Best Time to Buy and Sell Stock with Cooldown

## 문제

[LeetCode 309](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-with-cooldown/) • **Medium**

이 문제를 풀기 위해서 경우의 수를 나누어 보자.

우리는 총 3가지 상태를 가질 수 있다.

현재 주식을 구입하고 있는 상태.

주식을 보유하지 않지만 Cooltime 일 상태

주식을 보유하지 않고 Cooltime이 아닌 상태

  

각각의 상태를 hold, not_hold_cooltime, not_hold 라고 해보자. 그리고 그 값을 각각의 상태일 때 최대의 profix 이라고 해보자.

`hold = max(hold, not_hold-price)` 의 식이 성립한다.

그 전에 주식을 샀거나, 이번에 주식을 산 상태이다.

`not_hold_cooltime = hold+price` 이 된다.

주식을 팔았다면 이 상태가 되기 때문에 `hold+price` 가 된다.

`not_hold = max(not_hold, not_hold_cooltime)` 이 된다.

방금 주식을 파는게 이득이였는지, 그전에 팔았는게 이득이었는지를 체크한다.

  

전체 코드는 밑이다.

```python
class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        hold, not_hold, not_hold_cooltime = float('-inf'),0, 0
        for price in prices:
            hold, not_hold_cooltime, not_hold = max(hold, not_hold-price), hold+price, max(not_hold, not_hold_cooltime)
        return max(not_hold_cooltime, not_hold)
```

  

  

## 다른 접근방법

`buy[i], sell[i], rest[i]` 을 각각의 price 가 i 일때까지의 최대 profit 이라고 하자. buy 는 이번에 buy 을 했을때, sell 은 이번에 sell 을 했을때 rest 는 아무것도 없는 상태이다.

그러면

`buy[i] = max(buy[i-1], rest[i-1]-price)`

`sell[i] = max(buy[i-1]+price, sell[i-1])`

`rest[i] = max(rest[i-1], sell[i-1])`

이 된다.

우리는 `rest[i] <= sell[i]` 이라는 사실을 알 수가 있다. 왜냐하면 `sell` 이 `sell[i-1] <= sell[i]` 을 만족하기 때문이다.

즉 우리는 `rest[i] = sell[i-1]` 이 된다는 것을 알수가 있고

`buy[i] = max(buy[i-1], sell[i-2]-price)`

`sell[i] = max(buy[i-1]+price, sell[i-1])` 이 된다는 것을 알 수가 있다.

  

```python
class Solution:
    def maxProfit(self, prices):
        if len(prices) < 2:
            return 0
        sell_2, sell_1, sell, buy_1, buy = 0, 0, 0, float('-inf'), float('-inf')
        for price in prices:
            buy = max(buy_1, sell_2-price)
            sell = max(buy_1+price, sell_1)
            buy_1 = buy
            sell_2, sell_1 = sell_1, sell
        return sell
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
