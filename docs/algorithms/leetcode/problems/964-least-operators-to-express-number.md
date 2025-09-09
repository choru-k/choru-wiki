---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Greedy
  - Math
---

# 964. Least Operators to Express Number

## 문제

[LeetCode 964](https://leetcode.com/problems/least-operators-to-express-number/) • **Medium**

## Top Down DP

일단 직감적으로 최대한 큰 수를 잘 사용하는 것이 핵심 방법 같다.

예를 들어서 `x = 3, target = 19` 의 경우에는 3 을 많이 사용하는거 보다 27, 9 을 많이 사용하는게 더 효과적이다.

그러면 어떻게 더 높은 차수를 숫자를 사용할 수 있을까?

바로 더 높은 차수를 쓸 수 있게 현재 값을 적당히 바꾸어 주는 것이다.

얘를 들어서 19 는 1 을 더하거나 2 를 빼서 18, 21 을 만들 수 있다. 21 은 다시 6을 더해서 27을 만들어 줄 수 있다.

  

```python
class Solution:
    def leastOpsExpressTarget(self, x: int, target: int) -> int:
        memo = dict()
        # 1 <= target <= 2 * 10^8, 2 <= x <= 100 이기 때문에 40 정도면 충분하다.
        cost = [i for i in range(40)]
        cost[0] = 2
        
        def dfs(k, val):
            if (k, val) in memo:
                return memo[(k, val)]
            if val == 0:
                return 0
            if k >= len(cost):
                return float('inf')
            t,r = divmod(val, x)
						# 현재 숫자로만 다 구현 할 때, 적당히 빼서 더 높은 차수를 만들 때, 적당히 더해서 더 높은 차수를 만들 때
						memo[(k,val)] =  min(val*cost[k], dfs(k+1, t) + r*cost[k], dfs(k+1, t+1) + (x-r) * cost[k])
            return memo[(k,val)]
				# 맨 앞의 항은 + 나 - 같은 operator 가 없기 때문에 1을 뺀다.
        return dfs(0, target) - 1
```

  

## Bottom Up DP

pos : `y % (x ^ (k+1))` 을 구하기 위한 operations 의 수

neg: `x ^(k+1) - y % (x ^ (k+1))` 을 구하기 위한 operations 의 수

```python
class Solution:
    def leastOpsExpressTarget(self, x: int, target: int) -> int:
        pos = neg = k = 0
        while target>0:
            target, cur = divmod(target, x)
            if k > 0:
                pos2 = min(cur * k + pos, (cur + 1) * k + neg)
                neg2 = min((x - cur) * k + pos, (x - cur - 1) * k + neg)
                pos, neg = pos2, neg2
            else:
                pos, neg = cur * 2, (x - cur) * 2
            k += 1
        return min(pos, k + neg) - 1
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
