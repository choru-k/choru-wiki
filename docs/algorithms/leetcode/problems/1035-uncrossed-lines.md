---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 1035. Uncrossed Lines

## 문제

[LeetCode 1035](https://leetcode.com/problems/uncrossed-lines/) • **Hard**

## 핵심 아이디어

전형적인 dp 문제 입니다.

선은 교차하지 않기 때문에 우리는 선을 순서대로 이을 수 있습니다.

아래 그림에서 만약 우리가 중간의 1 빨간색 선으로 이으면

나머지 왼쪽 부분과 오른쪽 부분에서의 부분문제로 나눠서 풀 수있습니다.

문제의 정의상 오른쪽부분에서 왼쪽부분으로 선을 긋는 것은 불가능합니다.

![[Attachments/__2 2.jpg|__2 2.jpg]]

이 과정을 좀더 극단적으로 하여서 왼쪽에서 부터 선을 긋고 오른쪽에 대한 부분문제로 문제을 바꿉니다.

선을 긋는 경우는 총 `O(N^2)` 만큼의 경우가 있고, 이것들이 각각의 부분문제가 됩니다.

전체 시간복잡도는 `O(N^2)` 가 됩니다.

## Solution

```python
class Solution:
    def maxUncrossedLines(self, A: List[int], B: List[int]) -> int:
    # a_idx 와 b_idx 을 선을 긋는다. (그을
        @functools.lru_cache(None)
        def dfs(a_idx, b_idx):
      # 한쪽이 끝났다면 0
            if a_idx == len(A) or b_idx == len(B):
                return 0
      # a을 한쪽 사용안하거나, b 을 한쪽 사용안하거나
      # 선을 긋지 않는 경우
            res = max(dfs(a_idx+1, b_idx), dfs(a_idx, b_idx+1))
      # 선을 긋는 경우
            if A[a_idx] == B[b_idx]:
                res = max(res, 1 + dfs(a_idx+1, b_idx+1))
            return res
        return dfs(0,0)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
