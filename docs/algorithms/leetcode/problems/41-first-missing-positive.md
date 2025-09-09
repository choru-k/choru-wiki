---
tags:
  - Algorithm
  - LeetCode
---

# 41. First Missing Positive

## 문제

[LeetCode 41](https://leetcode.com/problems/first-missing-positive/) • **Easy**

## 핵심 아이디어

공간복잡도를 최적화 하기 위해서 배열의 인덱스를 저장장소로 사용해야 한다.

index 가 존재한다면 nums[index] 을 음수로 만든다.

이 때 문제는 nums 에는 0 또는 음수도 들어있다.

즉 우리는 이러한 숫자들을 다른 값으로 수정해주어야 한다.

가장 간단한 1 을 사용하자. 그런데 이럴경우 원래 배열에 1이 없다면 문제가 된다.

엇? 원래 배열에 1이 없다면 정답이 1 이 될 것 이다.

즉 원래배열에서 1이 있는지 일단 검사를 하자.

  

그 후 0 과 음수들을 1로 바꾸어 주자.

이제 남은 경우는 원래 배열에 배열길이보다 더 큰 숫자가 있을 때 이다.

이러한 경우는 무시해주면 된다.

## Solution

```python
class Solution:
    def firstMissingPositive(self, nums: List[int]) -> int:
        if 1 not in nums:
            return 1
        for i in range(len(nums)):
            nums[i] = 1 if nums[i] <= 0 else nums[i]
        for num in nums:
            if abs(num) <= len(nums):
								# 1을 0에 저장을 해주자! 항상 절댓값을 사용해주자.
								# 우리는 nums 을 전부 양수로 수정하였다.  
                nums[abs(num)-1] = -abs(nums[abs(num)-1])
        # print(nums)
        return min(
            [i
            for i in range(2, len(nums)+1)
            if nums[i-1] > 0]
        , default=len(nums)+1)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
