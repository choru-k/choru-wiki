---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Math
---

# 134. Gas Station

## 문제

[LeetCode 134](https://leetcode.com/problems/gas-station/) •**Medium**

## 핵심 아이디어

이 문제는 Greedy 한 방법이지만 살짝의 증명이 필요하다.

밑이 정답코드이다.

## Solution

```python
class Solution:
    def canCompleteCircuit(self, gas: List[int], cost: List[int]) -> int:
        gas2 = gas + gas
        cost2 = cost + cost
        
        tmp = 0
        idx = 0
        
        for i in range(len(gas2)):
            if tmp < 0:
                idx=i
                tmp = 0
            tmp += gas2[i] - cost2[i]
            # print(i, idx, tmp)
            
            if i-idx == len(gas):
                return idx
        return -1
```

왜 이렇게 풀면 정답이 되는지 증명해보자.

![[abc.png]]

만약 정답 idx(ans) 보다 앞에있는 start 에서 idx 을 시작했다고 하자. 만약

$\sum_{i=start}^{ans} gas[i]-cost[i] >0$

을 만족하여야만 정답 idx(ans) 을 지나칠 수가 있다.

하지만

$\sum_{i=ans}^{start'} gas[i]-cost[i] >0$

정답의 정의에서 위의 식을 무조건 만족한다 (정답에서 시작하는 어떤 범위에서든 0이하가 되면 안되기 때문에) 즉 `start ~ start'` 도 정답이 되기 때문에 정답이 1개라는 unique 한 조건을 벗어나고 start 또한 정답이 된다. 즉 항상 우리의 코드는 항상 정답을 지나치지 않고 제대로된 정답을 찾는다.

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
