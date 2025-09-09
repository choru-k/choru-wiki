---
tags:
  - LeetCode
  - Algorithm
  - Math
---

# 1121. Divide Array Into Increasing Sequences

## 문제

[LeetCode 1121](https://leetcode.com/problems/divide-array-into-increasing-sequences/) • **Medium**

## 핵심 아이디어

일단 곰곰히 생각해 보면 우리는 최소한 `most frequent` 만큼의 list 가 필요하다는걸 알수가 있다.

그리고 각각의 list 는 최소한 K 의 길이가 필요한다.

`most frequent` 을 m 이라고 할 경우, `nums[i%m]` 은 모두 다른 숫자가 된다.

## Solution

```python
class Solution:
    def canDivideIntoSubsequences(self, nums: List[int], K: int) -> bool:
        m = max(collections.Counter(nums).values()) 
        arr = [[] for _ in range(m)]
        for idx in range(len(nums)):
            arr[idx%m].append(nums[idx])
        # print(arr)
        return all(len(v)>=K for v in arr)
```

  

이걸 좀더 간단히 하면 가 된다.

arr 는 각 배열은 최대차이가 1이고 가장 최소는 다들 길이가 K 일 때 이기 때문에 밑처럼 표현이 된다.

```python
class Solution:
    def canDivideIntoSubsequences(self, nums: List[int], K: int) -> bool:
        return len(nums) >= max(collections.Counter(nums).values()) * K
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
