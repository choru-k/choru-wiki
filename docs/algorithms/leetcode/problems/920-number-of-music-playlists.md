---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 920. Number of Music Playlists

## 문제

[LeetCode 920](https://leetcode.com/problems/number-of-music-playlists/) •**Hard**

## 핵심 아이디어

일단 문제을 풀기 전에 조건을 잘 보자.

1. 모든 곡은 최소 1번 재생되어야 한다.
2. 최근 K 개의 곡은 반복하면 안된다.

`numMusicPlaylists(N, L, K)` 가 우리가 원하는 함수이다.

일단 `numMusicPlaylists(N, L, K)` 와 `numMusicPlaylists(N-1,L-1,K)` 의 관계을 보자.

만약 우리가 L-1 의 길이에서 N -1 개의 곡만 선택한다면 나머지 1개의 곡은 무조건 선택하지 않은 곡을 선택해야 한다. 1번 조건에서 모든 곡은 최소 1번 재생되어야 하기 때문이다. 그리고 나머지 1개의 곡은 한번도 재생되지 않았기 때문에 2번 조건에서 자유롭다. 어떤 곡이든 나머지 1개의 곡이 될 수 있다. 예를 들어서 `(1,2,3,4,5)` 라는 곡이 있을 때, (1)(2,3,4,5) 가 될 수도 있고, (2)(1,3,4,5) 가 될 수도 잇다. 즉 `N*numMusicPlaylists(N-1,L-1,K)` 가 포함된다.

이제 `numMusicPlaylists(N, L, K)` 와 `numMusicPlaylists(N, L-1, K)` 의 관계을 보자.

이미 L-1 의 길이에서 N 개의 곡을 선택하였기 때문에 1번 조건에서 자유롭다. 이제 2번 조건만 살펴보자. 우리는 최근 K 개 안에서 곡을 선택하지 않아야 한다. 즉 `(N-K)*numMusicPlaylists(N, L-1, K)` 가 포함된다.

이걸 표현한게 밑의 코드이다. 시간복잡도는 `O(N*L)` 이 된다.

## Solution

```python
class Solution:
    def numMusicPlaylists(self, N: int, L: int, K: int) -> int:
        memo = dict()
        
        def dfs(n, l):
            if l == 0:
                return 1 if n == 0 else 0
            if n == 0:
                return 0
            if (n, l) not in memo:
                memo[n, l] = dfs(n-1, l-1) * n
                if n-K > 0:
                    memo[n, l] += dfs(n, l-1) * (n-K)
                memo[n, l] %= 10**9+7
            return memo[n, l]
        return dfs(N,L)
```

코드을 최적화 하면 밑의 코드가 된다.

```python
class Solution:
    @functools.lru_cache(None)
    def numMusicPlaylists(self, N: int, L: int, K: int) -> int:
        MOD = 10**9 + 7
        if L == 0:
            return 1 if N == 0 else 0
        
        return (self.numMusicPlaylists(N, L-1, K) * max(N-K, 0) + self.numMusicPlaylists(N-1, L-1, K) * N ) % MOD
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
