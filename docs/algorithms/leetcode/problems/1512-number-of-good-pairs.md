---
tags:
  - LeetCode
  - Algorithm
  - Math
---

# 1512. Number of Good Pairs

## 문제

[LeetCode 1512](https://leetcode.com/problems/number-of-good-pairs/) • **Medium**

## 핵심 아이디어

매우 간단한 문제입니다.

가장 쉬운 방법은 그냥 문제에 주어진 대로 코딩을 하면 됩니다.

이 경우 시간복잡도는 `O(N^2)` 가 됩니다.

## Solution

```python
class Solution:
    def numIdenticalPairs(self, nums: List[int]) -> int:
        ans = 0
        for i in range(len(nums)):
            for j in range(i+1, len(nums)):
                if nums[i] == nums[j]:
                    ans +=1
        return ans
```

조금 더 생각해보면 우리는 갯수만 알면 되고, 조합을 사용할 수 있습니다.

만약 `1` 의 갯수가 4개 라면 `1` 로 만들수 있는 Good pair 는 $_4C_2$﻿가 됩니다.

즉 갯수가 k 라면 $_kC_2$﻿ 가 되고 이것으로 쉽게 계산을 할 수 있습니다.

시간복잡도는 `O(N)` 이 됩니다.

```python
class Solution:
    def numIdenticalPairs(self, nums: List[int]) -> int:
        cnt = collections.Counter(nums)

        return sum(k*(k-1)//2 for k in cnt.values())
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
