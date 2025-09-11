---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Graph
---

# 943. Find the Shortest Superstring

## 문제

[LeetCode 943](https://leetcode.com/problems/find-the-shortest-superstring/) • **Hard**

## 핵심 아이디어

문제를 조금 바꿔서 생각해보자.

만약 word1 의 뒤에 word2 을 이어붙인다고 할 때 필요한 최소의 문자열은 쉽게 구할 수 있다.

`word1[l:] == word2[:l]` 을 만족하는 최대 l 을 구하고 나머지를 앞뒤에 붙이면 된다.

이걸 Graph 로 생각해보자.

`word1 → word2` 로 갈 때 비용이 `len(word[l:])` 라고 한다면 우리의 문제는 Graph 가 존재할 때 모든 Node 을 방문 할때 필요한 최소의 비용이 된다.

이건 외판원문제(TPE) 와 비슷하다.

`dp[state][end_word]` 로 state 는 사용한 word을 나타내고, end_word 는 마지막 문자열을 나타낸다.

`dp[state][word] = min(dp[state-word][end_word] + dis[end_word][word])`

의 식을 나타낼 수 있다. 즉 어떠한 state 에서 마지막이 word 로 끝날 때 최소의 비용은 word 을 사용하지 않은 state 을 가진 dp 중에서 end_word와 word 의 거리의 합이 최소가 되게 만들면 된다.

위의 식까지 유추했다면 이제 구현만 하면 된다. state 는 bit 을 이용하겠다.

## Solution

```python
class Solution:
    def shortestSuperstring(self, A: List[str]) -> str:
        n = len(A)
        graph = [[0 for _ in range(n)] for _ in range(n)]
        for i in range(n):
            for j in range(n):
                word1, word2 = A[i], A[j]
        # word1 과 word2 가 겹치는 최대 길이를 graph[i][j] 라고 한다.
                graph[i][j] = max([l for l in range(1, min(len(word1), len(word2))) if word1[-l:] == word2[:l]] or [0])
        memo = dict()
        def dfs(state, word_idx):
      # state 을 업데이트
            cur_state = state | (1 << word_idx)
      # 만약 state 가 마지막 상태이면 자기자신만 존재.
            if cur_state == (2**n) - 1:
                return A[word_idx]
            if (cur_state, word_idx) not in memo:
                res = ''
                for i in range(n):
                    if cur_state >> i & 1 == 0:
            # i 가 마지막인 정답에서 word_idx 을 추가하여서 정답 후보를 만듬.
                        candidate = dfs(cur_state, i) + A[word_idx][graph[i][word_idx]:]
                        if res == '' or len(candidate) < len(res):
                            res = candidate
                memo[(cur_state, word_idx)] = res
            return memo[(cur_state, word_idx)]
        # 적당히 시작점을 잡음.
        return min([dfs(0, k) for k in range(n)], key=lambda x: len(x))
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
