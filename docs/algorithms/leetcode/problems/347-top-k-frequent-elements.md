---
tags:
  - LeetCode
  - Algorithm
  - Sorting
  - Kth-Element
---

# 347. Top K Frequent Elements

## 문제

[LeetCode 347](https://leetcode.com/problems/top-k-frequent-elements/) •**Medium**

[https://leetcode.com/problems/k-closest-points-to-origin/](https://leetcode.com/problems/k-closest-points-to-origin/) 와 매우 유사한 문제이다.

전체적인 설명은 [[Spaces/Home/PARA/Resource/Leetcode/973. K Closest Points to Origin]] 을 참고하면 된다.

일단 가장 중요한 건 `각각의 원소가 몇번 나왔는지를 저장`해야 된다는 점이다.

가장 좋은 방법은 HashTable 을 사용해서 저장하는 것이다.

그 뒤 Frequent 순서대로 정렬을 해주면 된다.

## Sort 을 사용한 방법

`O(NlogN)`

```python
class Solution:
    def topKFrequent(self, nums: List[int], k: int) -> List[int]:
        nums_dict = collections.defaultdict(int)
        
        for num in nums:
            nums_dict[num] += 1
        
    # Python 기본 정렬은 내림차순 이기 때문에 오름차순 정렬을 위해 음수를 곱햇다.
        return list(map(lambda x: x[1], sorted([(-v,k) for k,v in nums_dict.items()])[:k]))
```

## Heap 을 이용한 방법

`O(NlogK)`

```python
from heapq import heappush, heappop

class Solution:
    def topKFrequent(self, nums: List[int], k: int) -> List[int]:
        nums_dict = collections.defaultdict(int)
        
        for num in nums:
            nums_dict[num] += 1
        
        pq = []
        for key,value in nums_dict.items():
            if len(pq) == k and pq[0][0] < value:
                heappop(pq)
            if len(pq) < k:
                heappush(pq, (value, key))
        return list(map(lambda x: x[1], pq))
```

## Double HashMap 을 사용한 방법 `O(N)`

여기서 중요한 점은 `num → freq` 와 `freq → num` 2개의 HashMap 을 사용한 것이다.

이렇게 함으로써 정렬을 하지 않더라도 `freq→num` HashMap 을 큰 Key 부터 한개씩 ans 에 넣으므로써 원하는 Top K 을 구할 수 있게 한다.

```python
class Solution:
    def topKFrequent(self, nums: List[int], k: int) -> List[int]:
        nums_dict = collections.defaultdict(int)
        reverse_nums_dict = collections.defaultdict(set)
        
        for num in nums:
            if num not in nums_dict:
                nums_dict[num] = 0
                reverse_nums_dict[0].add(num)
                
            freq = nums_dict[num]
            reverse_nums_dict[freq].remove(num)
            freq += 1
            nums_dict[num] = freq
            reverse_nums_dict[freq].add(num)
            
    # Max_Key 을 구하고 key 을 1개씩 줄이므로써 원하는 Top K 을 Sort 없이 구할 수 있다.
        key = max(reverse_nums_dict.keys())
        ans = []
        while key >= 0:
      # ans 가 K 보다 커지면 안되기 때문에 적당히 배열을 잘라준다.
            if len(ans)+ len(reverse_nums_dict[key]) < k:
                for num in reverse_nums_dict[key]:
                    ans.append(num)
            else:
                tmp = list(reverse_nums_dict[key])[:k-len(ans)]
                for num in tmp:
                    ans.append(num)
            
            key -= 1
        return ans
```

## kth 을 사용한 방법 `O(N)`

생략

위의 [[Spaces/Home/PARA/Resource/Leetcode/973. K Closest Points to Origin]] 을 참조해서 직접 해보시길 바랍니다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
