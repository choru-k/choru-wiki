---
tags:
  - Algorithm
  - LeetCode
---

# 683. K Empty Slots

## 문제

[LeetCode 683](https://leetcode.com/problems/k-empty-slots/) •**Hard**

## BST 을 사용하는 방법

```python
from sortedcontainers import SortedList
class Solution:
    def kEmptySlots(self, bulbs: List[int], k: int) -> int:
        sl = SortedList()
        for day, b in enumerate(bulbs, 1):
            idx = sl.bisect_left(b)
            if idx < len(sl) and sl[idx] - b == k+1:
                return day
            if 0 < idx and b - sl[idx-1] == k+1:
                return day
            sl.add(b)
            
        return -1
```

## BST 을 발전시켜서 Double Linked List 을 사용하는 방법

BST 의 문제는 insert, search 등등이 log N 이 걸린다는 단점이 있음

어차피 Search 를 insert 후 인접에 대해서만 하기 때문에 double linked list 을 사용할 수 있음

뒤에서 부터 진행하면 double linked list + Hashtable 을 사용가능

## Bucket Sort 을 사용하는 방법

버킷을 크기를 k+1 로 잡으면 같은 bucket 이내에서는 정답이 될 수 없고, 양옆의 bucket 에 대해서만 비교하면 정답을 알 수 있다.

```python
class Bucket:
    def __init__(self):
        self.mn = self.mx = inf
    def add(self, num):
        if self.mn == inf:
            self.mn = self.mx = num
        self.mn = min(self.mn, num)
        self.mx = max(self.mx, num)
class Solution:
    def kEmptySlots(self, bulbs: List[int], k: int) -> int:
        l = len(bulbs)
        buckets = [
            Bucket() for _ in range(l // (k+1) + 1)
        ]
        for day, b in enumerate(bulbs, 1):
            idx = b //(k+1)
            buckets[idx].add(b)
            if idx > 0 and buckets[idx].mn-buckets[idx-1].mx == k+1:
                return day
            if idx < len(buckets)-1 and buckets[idx+1].mn-buckets[idx].mx == k+1:
                return day
        
        return -1
```

## Day 기반으로 문제 풀기

만약 day 을 기반으로 문제를 푼다면 두점 L, L+K+1 사이에서 에 대해서 L, L+K+1 이 전구가 켜지는게 먼저라면 정답이 된다.

```python
class Solution:
    def kEmptySlots(self, bulbs: List[int], k: int) -> int:
        days = [0 for _ in range(len(bulbs))]
        for d,b in enumerate(bulbs):
            days[b-1] = d
        
        l = 0
        r = k + 1
        ans = inf
        for pos, day in enumerate(days):
            if r >= len(bulbs):
                break
            if day > max(days[l], days[r]):
                continue
            if pos == r:
                ans = min(ans, max(days[l], days[r]))
            
            l = pos
            r = pos + k + 1
        
        return ans+1 if ans != inf else -1
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
