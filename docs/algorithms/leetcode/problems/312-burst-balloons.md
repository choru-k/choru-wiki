---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Divide-and-Conquer
  - Reverse-Thinking
---

# 312. Burst Balloons

## 문제

[LeetCode 312](https://leetcode.com/problems/burst-balloons/) • **Hard**

## 핵심 아이디어

이 문제는 정말 어렵다.

차근 차근 방법을 생각해보자. 일단 모든 경우의 수를 생각해본다고 해보자. 그것은 풍선을 줄 세우는 경우의 수와 같고 O(n!) 의 된다. (줄세우고 줄 세운 순서대로 터트린다고 할때)

이것은 정답이 아닌 것 같다.

이제 조금 발전 된 방법을 생각해보자.

남은 풍선들이 만드는 최대 값은 이미 터진 풍선들과 관계가 없다. 즉 남은 풍선들의 최적의 값을 memorization 할 수 있다는 것이고 조합 문제로 바뀌게 된다.

이것은 위의 순열보다 좋아보이지만 충분히 큰 값이라는 걸 알 수가 있다.

조금 더 생각해보자.

이 문제를 Divide and Conquer 로 풀 수 있을까?

풍선을 2개의 그룹으로 나누어서 각각의 최적의 해를 안다고 해도 전체의 최적의 해를 알 수가 없다. 왜냐하면 왼쪽에서 남는 마지막 숫자와 오른쪽에서 남는 마지막 숫자에 따라서 전체의 최적의 해가 바뀌기 때문이다. 예를들어

[1,3,2,4,1,3,2] 라는 풍선의 배열이 있을 때

[1,3,2] 4 [1,3,2] 로 나눌 수 있다.

각각의 최적의 해는 3 → 2 → 1 을 터트리는게 최적의 해 이다.

하지만 실제로 전체를 보면 3을 가장 나중에 터트리는게 이득이다. 또한 2을 터트릴때도 4에 영향을 받기 때문에 독립적으로 최적의 해를 구할 수가 없다.

이 문제를 해결하기 위해서 우리는 한가지 규칙을 세우도록한다.

DP\[left\]\[right\] 는 left ≤ i ≤ right 의 풍선 사이에서 left 와 right 을 터트리지 않고 얻을 수 있는 최적해 라고 하자.

이 조건 하나만으로 문제가 어떻게 달라지는지 보자.

1. 위에서는 2그룹으로 나눌 때 각각의 그룹의 가장 오른쪽, 가장 왼쪽을 터트릴 때 중간 풍선에 영향을 받기 때문에 독립적인 최대값이 전체 최대 값과 연관 짓기가 힘들었다. 예를 들어 [1, 3, 2] 에서 2을 터트릴때 그전에 나눈 4의 영향을 받았다. 하지만 이제 완벽히 모든 영향이 배열안에서 존재하기 때문에 독립적으로 최적해를 구할 수 있다.
2. 마지막에 남은 숫자가 정해져 있다. 즉 안 터트리는 풍선이 있기 때문에 두 배열을 합치었을때 터트릴 풍선이 무엇인지 알 수가 있다.

`dp[left][right] = max(dp[left][right], dp[left][i] + dp[i][right] + nums[left]*nums[i]*nums[right])` 식이 성립된다.

DP 전체 크기는 n^2, 한칸을 채우는데 n 이 되기 때문에 전체 시간 복잡도는 O(n^3) 이 된다.

## Solution

```python
# Top Down
class Solution:
    def maxCoins(self, nums: List[int]) -> int:
        # 0 이 있다면 무시가능. 
        nums = [1] + [i for i in nums if i>0] + [1]
        n = len(nums)
        dp = {}
        
        def dfs(left, right):
            if right - left <= 1:
                dp[(left, right)] = 0
            if (left, right) in dp:
                return dp[(left, right)]
            dp[(left, right)] = 0
            for i in range(left+1, right):
                dp[(left, right)] = max(dp[(left, right)], dfs(left, i) + dfs(i, right) + nums[left]*nums[i]*nums[right])
            return dp[(left, right)]
                
        dfs(0, n-1)
        # print(dp)
        return dp[(0, n-1)]
```

```python
# Bottom Up
def maxCoins(self, iNums):
    nums = [1] + [i for i in iNums if i > 0] + [1]
    n = len(nums)
    dp = [[0]*n for _ in xrange(n)]

    for k in xrange(2, n):
        for left in xrange(0, n - k):
            right = left + k
            for i in xrange(left + 1,right):
                dp[left][right] = max(dp[left][right],
                       nums[left] * nums[i] * nums[right] + dp[left][i] + dp[i][right])
    return dp[0][n - 1]
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
