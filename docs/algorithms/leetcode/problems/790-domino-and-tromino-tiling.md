---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Greedy
---

# 790. Domino and Tromino Tiling

## 문제

[LeetCode 790](https://leetcode.com/problems/domino-and-tromino-tiling/) •**Hard**

![[__9.svg]]

그림을 그려보면 기본적으로

$dp[n] = dp[n-1]+dp[n-2]+2\sum_{i=0}^{n-3}dp[i]$

가 된다는 걸 알수가 있다. 그림에서 핵심은 우리가 따로 그린 부분은 길이가 1, 2, 3, 4, 5 일 때만 놓을 수 있는 유니크한 방법이라는 것이다. 길이가 5일때 `|||||` 같은 방법으로 놓을 수 있지만 이건 `|` 와 `||||` 로 나눌 수 있기 때문에 위쪽의 방법에서 세어줄 것이다.

저 위의 식만 이해했다면 뒤는 간단한다

$dp[n-1] = dp[n-2]+dp[n-3]+2\sum_{i=0}^{n-4}dp[i]$

$dp[n] = dp[n-1]+dp[n-2]+dp[n-3]+dp[n-3]+2\sum_{i=0}^{n-4}dp[i] \\=dp[n-1]+dp[n-3]+dp[n-1]$

이 된다.

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
