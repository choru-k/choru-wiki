---
tags:
  - LeetCode
  - Algorithm
  - Heap
---

# 480. Sliding Window Median

## 문제

[LeetCode 480](https://leetcode.com/problems/sliding-window-median/) • **Medium**

## 그냥 무작정 size-k 배열 유지

시간 복잡도 O(NK)

## Heap 사용

일단 연속적인 Median 은 MaxHeap, MinHeap 을 이용해서 구하는 방법이 유명하다.

이 방법 살짝 바뀌어서 사용하면 문제 해결이 될 것 같다.

max_heap 과 min_heap 의 길이는 항상 고정이다. 만약 k 가 짝수면 k/2 로 홀수 면 k/2, k/2+1 이다.

이걸 사용해서 조금 생각해보자.

핵심은 sliding 을 통해서 지워지는 Item 을 어떻게 할 것 이냐는 것이다.

물론 각 Item 을 hash table 로 접근할 수 있게 하고 Heap 의 중간을 삭제하는 것도 한 개의 방법이다. 하지만 이건 실제로 구현하기 복잡하다. 보다 쉬운 방법이 잇을까?

일단 지우는 것을 나중으로 미루어 보자. 그러면 문제가 되는건 max_heap 과 min_heap 의 길이를 알 수가 없는데 어떻게 k/2 로 고정 시키는 것이냐다.

이건 약간의 방법을 통해서 고정을 시킬 수 있다.

만약 max_heap 에 item 을 추가한다고 하자. 그리고 빼야할 Item 이 max_heap 안에 있는지 min_heap 안에 있는지 판단을 하고 만약 max_heap 안에 있다면 아무것도 안해도 된다. 왜냐하면 1개가 추가되고 1개가 빠지니 길이가 동일하기 때문이다. 만약 min_heap 안에 있다면 min_heap 의 길이가 1 줄고, max_heap 의 길이가 1 늘었기 때문에 유효한 max_heap 의 item 1개를 min_heap 으로 넘겨 주면 된다.

밑의 그림을 살펴보자.

![[__3.svg]]

```python
from heapq import heappush, heappop
class Solution:
    def medianSlidingWindow(self, nums: List[int], k: int) -> List[float]:
        if k == 1:
            return nums
        max_heap = []  # 상대적으로 작은 숫자
        min_heap = []  # 상대적으로 큰 숫자
        
        def get_mid():
            if k % 2 == 0:
                return (min_heap[0][0] + (-1) * max_heap[0][0]) / 2
            else:
                return -max_heap[0][0]
            
        def move(h1, h2):
            num, i = heappop(h1)
            heappush(h2, (-num, i))
        
        ans = []
        for i, num in enumerate(nums):
            if i < k:
                heappush(max_heap, (-num, i))
                move(max_heap, min_heap)
                move(min_heap, max_heap)
                if len(max_heap) > len(min_heap)+1:
                    move(max_heap, min_heap)
            else:
                ans.append(get_mid())
                if num <= min_heap[0][0]:
                    heappush(max_heap, (-num, i))
                    if nums[i-k] >= min_heap[0][0]:
                        # min_heap 에 이번에 뺄거 존재.
                        move(max_heap, min_heap)
                else:
                    heappush(min_heap, (num, i))
                    if nums[i-k] < min_heap[0][0]:
                        # max 에 이번에 뺄거 존재
                        move(min_heap, max_heap)
                while max_heap[0][1] <= i-k:
                    heappop(max_heap)
                while min_heap[0][1] <= i-k:
                    heappop(min_heap)
        ans.append(get_mid())
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
