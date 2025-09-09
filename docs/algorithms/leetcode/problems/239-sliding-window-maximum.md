---
tags:
  - LeetCode
  - Algorithm
  - Heap
  - Monotonic-Stack
  - Stack
---

# 239. Sliding Window Maximum

## 문제

[LeetCode 239](https://leetcode.com/problems/sliding-window-maximum/) • **Medium**

## 핵심 아이디어

가장 간단한 방법으로는 Heap 이 있다.

그때 그때 최댓값을 구하고, 필요없는 부분은 미리 index 을 사용해서 없앤다.

시간 복잡도는 O(NlogK) 이다.

## Solution

```python
from heapq import heappush, heappop
class Solution:
    def maxSlidingWindow(self, nums: List[int], k: int) -> List[int]:
        pq = []
        ans = []
        for idx, num in enumerate(nums):
            heappush(pq, (-num, idx))
            if idx+1 >= k:
                while pq[0][1] <= idx-k:
                    heappop(pq)
                ans.append(-pq[0][0])
        return ans
```

  

  

우리는 Stack 을 통해서 보다 효율적으로 구할 수 있다.

![[Attachments/__2 2.svg|__2 2.svg]]

```python
class Solution:
    def maxSlidingWindow(self, nums: List[int], k: int) -> List[int]:
        st = collections.deque()
        ans = []
        for idx, num in enumerate(nums):
            while len(st)>0 and nums[st[-1]] < num:
                st.pop()
            st.append(idx)
            if st[0] == idx-k:
                st.popleft()
            if idx >= k-1:
                ans.append(nums[st[0]])
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
