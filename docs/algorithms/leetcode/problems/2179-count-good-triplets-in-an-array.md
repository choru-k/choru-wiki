---
tags:
  - Algorithm
  - LeetCode
---

# 2179. Count Good Triplets in an Array

## 문제

[LeetCode 2179](https://leetcode.com/problems/count-good-triplets-in-an-array/description/) •**Medium**

## 핵심 아이디어

문제 예제가 조금 헷갈리는 부분이 있다.

중요한건 숫자의 크기는 중요하지 않다는것

일단 2개의 숫자, x,y 로만 생각해보자.

어떠한 숫자 x, y 에 있어서 nums1 에서도 x 가 y 보다 왼쪽에 있고, num2 에서도 x 가 y 보다 왼쪽에 있는걸 어떻게 알 수 있을까?

일단 nums1 을 단순 순회 한다면 nums1 의 조건은 만족할 수 있다. 중요한건 순회하면서 나온수 중, nums2 의 순서를 만족시키는 방법이다.

이건 Map 을 통해서 구할 수 있다. nums1 에서 나온숫자들을 기반으로 nums2 의 index 를 넣는다면, binary 서치를 통해서 우리가 원하는 조합의 갯수를 구할 수 있다.

밑의 코드를 보면 이해하기 쉬울 것이다.

3개의 경우, 이 과정을 앞 뒤로 하면된다. x, y 의 경우의 수와, y,z 의 경우의 수를 곱하면 우리가 원하는 x,y,z 의 경우의 수가 된다.

## Solution

```python
from sortedcontainers import SortedList
class Solution:
    def goodTriplets(self, nums1: List[int], nums2: List[int]) -> int:
        rev_nums2 = {num:idx for idx, num in enumerate(nums2)}

        pre_nums1 = []
        pos_in_nums2 = SortedList()
        for num in nums1:
            idx = pos_in_nums2.bisect_left(rev_nums2[num])
            pre_nums1.append(idx)
            pos_in_nums2.add(rev_nums2[num])

        suf_nums1 = []
        pos_in_nums2 = SortedList()
        for num in nums1[::-1]:
            idx = len(pos_in_nums2) - pos_in_nums2.bisect_right(rev_nums2[num])
            suf_nums1.append(idx)
            pos_in_nums2.add(rev_nums2[num])
        
        suf_nums1 = suf_nums1[::-1]
        ret = sum(pre*suf for pre, suf in zip(pre_nums1, suf_nums1))
        return ret
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
