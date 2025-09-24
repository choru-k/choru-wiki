---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Greedy
---

# 1199. Minimum Time to Build Blocks

## 문제

[LeetCode 1199](https://leetcode.com/problems/minimum-time-to-build-blocks/) •**Medium**

## 핵심 아이디어

이 문제를 처음에 잘못 이해를 햇다.

Block 의 순서와 상관없이 worker 는 1개를 설치하고 집을 가던지 다른 worker 2명을 부르고 집을 가던지 2개중 1개를 할 수 있다. block 을 설치하는건 그 만큼의 시간이 들고, worker 을 2명 부르는건 split 만큼의 시간이 든다.

모든 작업은 parallel 하기 때문에 동시에 3명이 2명씩 총 6명을 부르는 작업을 해도 결국 걸리는 시간은 split 이다.

가장 무식한 방법은 DP로 1개씩 하는것이다

## Solution

```python
class Solution:
    def minBuildTime(self, blocks: List[int], split: int) -> int:
    # 약간의 greedy 
        blocks.sort(reverse=True)
        memo = dict()
        def dfs(i, j):
            if i == j:
                return blocks[i]
            if (i, j) not in memo:
        
                memo[i, j] = min([max(dfs(i, k), dfs(k+1, j)) + split for k in range(i, j)])
            return memo[i, j]
        ans= dfs(0, len(blocks)-1)
        return ans
```

DP 을 조금더 똑똑하게 해보자.

```python
class Solution:
    def minBuildTime(self, blocks: List[int], split: int) -> int:
        blocks.sort(reverse=True)
        memo = dict()
        # idx 는 block 의 idx, k는 현재 worker 의 수
        def dp(idx, k):
            if idx == len(blocks):
                return 0
            if k == 0:
                return float('inf')
      # 만약 나머지 worker 로 다 건설할 수 있다면 max(blocks[idx:])가 되고, blocks[idx]
            if len(blocks)-idx <= k:
                return blocks[idx]
            if (idx, k) not in memo:
                memo[idx, k] = min(\
                 # 지금 worker 로 처리하던가
                                  max(dp(idx+1, k-1), blocks[idx]),\
                 # 다같이 친구 2명을 부르던가
                                  dp(idx, k*2)+split)
            return memo[idx, k]
        return dp(0, 1)
```

이제 조금더 생각을 해보자.

어떠한 [1,2] 블록이 2개에 split 이 1 이면 우리는 이 작업을 `1+max(1,2)` 의 block 으로 생각 할 수 있다.

즉 block 2개를 선택해서 `split + max(block_1, block_2)` 로 1개의 블록으로 바꿀 수 있다는 것이다.

그렇다면 전체 block 을 줄이기 위해서는 block_1과 block_2 가 최대한 비슷해야 한다.

블록은 항상 커지기만 하기 때문에 가장 작은 블록부터 2개를 1개로 만든후, 그걸 다시 blocks 에 넣은 후 이걸 반복하면 될 것 같다.

- [https://leetcode.com/problems/minimum-time-to-build-blocks/discuss/387035/Python%3A-O(n-log-n)-using-Huffman's-Algorithm-(priority-queue)-with-explanation](https://leetcode.com/problems/minimum-time-to-build-blocks/discuss/387035/Python%3A-O(n-log-n)-using-Huffman's-Algorithm-(priority-queue)-with-explanation).

이러한 알고리즘은 `Huffman's Algorithm` 이라고 한다.

```python
class Solution:
    def minBuildTime(self, blocks: List[int], split: int) -> int:
        heapq.heapify(blocks)
        while len(blocks) > 1:
            b1, b2 = heapq.heappop(blocks), heapq.heappop(blocks)
            heapq.heappush(blocks, max(b1,b2)+split)
            
        return blocks[0]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
