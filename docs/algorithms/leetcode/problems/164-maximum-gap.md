---
tags:
  - LeetCode
  - Algorithm
  - Sorting
---

# 164. Maximum Gap

## 문제

[LeetCode 164](https://leetcode.com/problems/maximum-gap/) • **Easy**

## 핵심 아이디어

일단 가장 간단한 방법은 그냥 sort 을 하면 된다.

하지만 문제에서는 Linear Time Complexity 을 원한다.

우리가 아는 유일한 Linear Time Complexity 을 가진 Sort 는 Bucket Sort 만 있다.

만약 이 문제를 Bucket Sort 을 사용할 경우 시간 복잡도는 32bit-int 가 되고 너무 크다

이제 Bucket Sort 을 잘 최적화 하여서 시간복잡도를 줄여보자.

일단 우리의 정답의 최소 범위를 생각해 보자. 비둘기 집의 원리에 의해서 우리의 정답의 최소는

`math.ceil((max_val-min_val) / (len(nums)-1))` 가 된다는 걸 알수가 있다.

최소값과 최대값을 균일한 범위로 나눌 때, 우리의 정답이 최소가 된다.

그 때 균일한 범위가 `math.ceil((max_val-min_val) / (len(nums)-1))` 가 된다.

즉 저 size 로 bucket 을 만들면 된다는 걸 알 수가 있다. 같은 bucket 안에 있는 수들 끼리는 정답이 될 수가 없기 때문이다. 이제 이 bucket 을 이용해보자.

## Solution

```python
class Solution:
    def maximumGap(self, nums: List[int]) -> int:
        if len(nums) <=1 :
            return 0
        min_val, max_val = min(nums), max(nums)
        if min_val == max_val:
            return 0
        width = max(math.ceil((max_val-min_val) / (len(nums)-1)), 1)
        
        bucket = [[None, None] for _ in range(len(nums))]
        # print(bucket)
        for num in nums:
            bucket_id = (num-min_val) // width
            if bucket[bucket_id] == [None, None]:
                bucket[bucket_id] = [num, num]
            bucket[bucket_id][0] = min(num, bucket[bucket_id][0])
            bucket[bucket_id][1] = max(num, bucket[bucket_id][1])
        
        bucket = list(filter(lambda x: x != [None, None], bucket))
        
        return max([bucket[i+1][0]-bucket[i][1] for i in range(len(bucket)-1)])
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
