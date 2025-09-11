---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 2242. Maximum Score of a Node Sequence

## 문제

[LeetCode 2242](https://leetcode.com/problems/maximum-score-of-a-node-sequence/description/) • **Medium**

## 핵심 아이디어

문제를 쉬운문제로 바꾸어서 한개씩 생각해보자.

만약 길이가 1인 경로였다면 정답을 어떻게 구할까? 그냥 score 에서 가장 최댓값을 구하면 된다.

만약 길이가 2 이라면? edges 들을 순회하면서 각 edge 에 연결된 node 의 2개의 값을 더하고 그중의 최댓값을 구한다.

만약 길이가 3 이라면? 각 node 들을 순회하면서 자기와 연결된 neighbor 들중 최댓값 2개를 구한다.

이제 길이가 4일 경우를 생각하자.

edge 들을 순회하면서 2개의 node 들을 구하고, 각 node 들의 neighbor 중 최댓값 을 1개씩 구하고 그것들을 더해주면 된다.

이 때 edge 케이스는, edge 에 연결된 노드를 u, w 라고 할때 u 의 neighbor 중 최댓값, w neighbor 중 최댓값 이 서로 겹칠 때다.

이 때는 그 다음 최댓값을 구하면 된다. 또한 neighbor 의 최댓값이 u 나 w 일 경우도 빼주어야 한다.

즉 최대 3개의 후보만 비교하면 된다는 것을 알 수 있다.

## Solution

```python
class Solution:
    def maximumScore(self, scores: List[int], edges: List[List[int]]) -> int:
        l = len(scores)
        graph = [[] for _ in range(l)]
        for u, w in edges:
           graph[u].append((scores[w], w))
           graph[w].append((scores[u], u))
        
        for i in range(l):
            # 어차피 3개의 후보로 충분하다.
            graph[i] = nlargest(3, graph[i])


        ret = -1
        for u, w in edges:
            for _, nxt_u in graph[u]:
                for _, nxt_w in graph[w]:
                    # 서로의 neighbor 중 최댓값이 겹치면 안된다. 또한 최대 neighbor 가 u, w 일때도 무시한다.
                    if nxt_u != nxt_w and u != nxt_w and w != nxt_u:
                        ret = max(ret, scores[u] + scores[w] + scores[nxt_u] + scores[nxt_w])
            
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
