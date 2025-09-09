---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Hash-Table
  - Bucket-Sort
---

# 220. Contains Duplicate III

## 문제

[LeetCode 220](https://leetcode.com/problems/contains-duplicate-iii/) • **Medium**

## 핵심 아이디어

만약 Python 에 Map 같은 self balanced tree 가 존재한다면 이 문제는 간단하게 풀 수가 있다.

숫자를 순서대로 넣고, Map 의 길이가 K 이상이 되면 먼저 넣었던 것들을 순서대로 뺀다.

그리고 숫자를 넣기전에 가장 가까운 두 수를 찾고, 그 값이 t 이하인지 체크를 하면 된다.

## Solution

```python
from sortedcontainers import SortedList

class Solution:
    def containsNearbyAlmostDuplicate(self, nums: List[int], indexDiff: int, valueDiff: int) -> bool:
        sl = SortedList()

        queue = collections.deque()


        for num in nums:
            idx= sl.bisect(num)
            if (0 <= idx-1 and abs(sl[idx-1]-num) <= valueDiff) \
                or (idx < len(sl) and abs(sl[idx]-num) <= valueDiff):
                return True
            sl.add(num)
            queue.append(num)

            if len(queue) > indexDiff:
                x = queue.popleft()
                sl.remove(x)
        return False


class Solution:
    def containsNearbyAlmostDuplicate(self, nums: List[int], indexDiff: int, valueDiff: int) -> bool:
        sl = SortedList()

        for i,num in enumerate(nums):
            idx = sl.bisect(num)
            if (0 <= idx-1 and abs(sl[idx-1]-num) <= valueDiff) \
                or (idx < len(sl) and abs(sl[idx]-num) <= valueDiff):
                return True
            sl.add(num)
            

            if i-indexDiff >= 0:
                sl.remove(nums[i-indexDiff])
            
        return False
```

하지만 파이썬은 존재하지 않기 때문에 다른 방법을 생각해보자.

  

크기가 valueDiff 인 bucket 을 생각해보자. 만약 이 bucket 에 두개의 원소가 들어있다면 무조건 그 두개의 원소의 길이는 valueDiff 이하가 될 것 이다. 만약 같은 bucket 에 있지 않지만 두 원소의 길이가 valueDiff 이하인 경우는 어떻게 처리할까?

우리는 두 원소의 길이가 valueDiff 이하라면 최대 버킷의 차이가 1이란걸 알수 있다. 즉 자신이 속한 bucket 과 그 주변만 고려해주면 된다.

```python

class Solution:
    def containsNearbyAlmostDuplicate(self, nums: List[int], indexDiff: int, valueDiff: int) -> bool:
        bucket = dict()

        for idx, num in enumerate(nums):
						# 0 일때는 나누지 말고 그대로 사용. 단 주변을 보지 않음
            key = num // max(valueDiff, 1)
						# 한 버킷에 두개의 키가 존재
            if key in bucket:
                return True
            bucket[key] = num
            if valueDiff > 0:
                if key-1 in bucket and abs(num - bucket[key-1]) <= valueDiff:
                    return True
                if key+1 in bucket and abs(num - bucket[key+1]) <= valueDiff:
                    return True
						# k 만큼의 거리만 유지.            
            if idx-indexDiff >= 0:
                bucket.pop(nums[idx-indexDiff] // max(valueDiff, 1))
        return False
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
