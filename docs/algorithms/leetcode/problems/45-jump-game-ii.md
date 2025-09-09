---
tags:
  - LeetCode
  - Algorithm
  - BFS
  - Dynamic-Programming
---

# 45. Jump Game II

## 문제

[LeetCode 45](https://leetcode.com/problems/jump-game-ii/) • **Easy**

## 핵심 아이디어

일반 적인 DP 로 풀려고 하면 TLE 가 난다.

그렇기 때문에 조금 더 최적화을 해야 한다.

  

문제을 바꿔 생각해보자.

DP[i] 을 i 번 점프을 할 때 갈 수 있는 최대 index 라고 하자.

  

그렇다면 밑의 코드로 dp 을 완성 시킬 수 있다.

즉 최대 index 가 마지막을 넘을 때의 jump 수가 정답이 된다.

## Solution

```python
class Solution:
    def jump(self, nums: List[int]) -> int:
        dp = [-1 for _ in range(len(nums)+1)]
        dp[0] = 0
        cur = 0
        for idx, num in enumerate(nums):
            if dp[cur] < idx:
                cur +=1
            dp[cur+1] = max(dp[cur+1], idx+num)
        # print(dp)
        return cur
```

  

이걸 조금 더 생각해 보면 BFS 적인 관점으로 볼 수가 있다.

우리는 원래 배열을 점프 1번으로 갈수 잇는 영역, 점프 2번 으로 갈 수 있는 영역으로 나눌 수 있다.

  

```python
class Solution:
    def jump(self, nums: List[int]) -> int:
        l = r = ans = 0
        while r < len(nums)-1:
            l, r = r+1, max(i+nums[i] for i in range(l, r+1))
            ans+=1
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
