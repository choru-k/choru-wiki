---
tags:
  - LeetCode
  - Algorithm
  - Heap
---

# 373. Find K Pairs with Smallest Sums

## 문제

[LeetCode 373](https://leetcode.com/problems/find-k-pairs-with-smallest-sums/) • **Medium**

## 핵심 아이디어

일단 간단히 생각해보면 만약 (nums1[i], nums2[j]) 가 이번에 뽑혔을 때 보다 큰 수는

(nums1[i+1], nums2[j]) or (nums1[i], nums[j+1) 이라는 것을 알수가 있다.

그걸 구현하면

## Solution

```python
class Solution:
    def kSmallestPairs(self, nums1: List[int], nums2: List[int], k: int) -> List[List[int]]:
        if len(nums1) == 0 or len(nums2) == 0:
            return []
        ans = []
        used = set()
        pq = [(nums1[0] + nums2[0], 0, 0)]
        while len(pq) > 0 and len(ans) < k:
            _, idx1, idx2 = heapq.heappop(pq)
            if (idx1, idx2) in used:
                continue
            used.add((idx1, idx2))
            ans.append([nums1[idx1], nums2[idx2]])
            if idx1+1 < len(nums1):
                heapq.heappush(pq, (nums1[idx1+1]+nums2[idx2], idx1+1, idx2))
            if idx2+1 < len(nums2):
                heapq.heappush(pq, (nums1[idx1]+nums2[idx2+1], idx1, idx2+1))
        return ans
```

가 된다.

  

조금 더 생각해보자.

이걸 Matrix 로 표현하면

일때 오른쪽, 아래 방향을 추가하는 모습이 된다.

그렇다면 사실은 아래을 추가하지 않고 오른쪽만 추가하면서

맨 첫번째 열에서만 아래방향을 추가해주면 된다.

```python
# # # # # ? . .
# # # ? . . . .
# ? . . . . . .   "#" means pair already in the output
# ? . . . . . .   "?" means pair currently in the queue
# ? . . . . . .
? . . . . . . .
. . . . . . . .
```

  

이게 그 코드이다. 보다 시간복잡도를 계산하기 쉬워졌고, used 을 사용하지 않는다.

```python
class Solution:
    def kSmallestPairs(self, nums1: List[int], nums2: List[int], k: int) -> List[List[int]]:
        if len(nums1) == 0 or len(nums2) == 0:
            return []
        ans = []
        pq = [(nums1[0] + nums2[0], 0, 0)]
        while len(pq) > 0 and len(ans) < k:
            _, idx1, idx2 = heapq.heappop(pq)
            
            ans.append([nums1[idx1], nums2[idx2]])
            if idx2 ==0 and idx1+1 < len(nums1):
                heapq.heappush(pq, (nums1[idx1+1]+nums2[idx2], idx1+1, idx2))
            if idx2+1 < len(nums2):
                heapq.heappush(pq, (nums1[idx1]+nums2[idx2+1], idx1, idx2+1))
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
