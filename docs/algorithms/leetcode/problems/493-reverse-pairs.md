---
tags:
  - LeetCode
  - Algorithm
  - Merge-Sort
---

# 493. Reverse Pairs

## 문제

[LeetCode 493](https://leetcode.com/problems/reverse-pairs/) • **Medium**

## 핵심 아이디어

가장 간단한 방법은 모든 경우의 수를 해보는 것으로 시간 복잡도는 `O(N^2)` 다

조금 더 생각을 해보면 `i<j` 라는건 그냥 뒤에만 있으면 되고 얼마나 더 뒤에 있는지는 중요하지 않다.

이게 핵심이다. `얼마나 뒤에 있는지 보다 그냥 뒤에만 있다`

이런 조건이 있을 때 우리는 merge sort 을 고려 해 볼수 있다.

merge sort 을 사용할 경우 정렬된 앞의 배열 `list1` 과 정렬된 뒤의 배열 `list2` 을 가질 수 있다.

만약 정렬되어 있다면 우리는 쉽게 `nums[i] > nums[j] * 2` 의 조건을 만족하는 갯수를 찾을 수 있다.

## Solution

```python
class Solution:
    def reversePairs(self, nums: List[int]) -> int:
        if len(nums) == 0:
            return 0
        self.ans = 0
      
        def mergeSort(arr):
            if len(arr) == 1:
                return arr
            mid = int(len(arr) / 2)
            list1 = mergeSort(arr[:mid])
            list2 = mergeSort(arr[mid:])
            idx1, idx2 = 0, 0
            while idx1 < len(list1) and idx2 < len(list2):
                if list1[idx1] > list2[idx2] * 2:
                    self.ans += len(list1) - idx1
                    idx2 += 1
                else:
                    idx1 += 1
            return sorted(list1 + list2)
        mergeSort(nums)
        return self.ans

# 직접만든 merge 을 사용해도 되지만 time exceed 가 나온다. 전체적인 시간 복잡도는 밑의 방법이 좋지만 실제 python 최적화상 sorted 가 유리하다.
def merge(list1, list2):
    idx1, idx2 = 0, 0
    res = []
    while idx1 < len(list1) and idx2 < len(list2):
        if list1[idx1] > list2[idx2]: 
            res.append(list2[idx2])
            idx2 += 1
        else: 
            res.append(list1[idx1])
            idx1 += 1
    while idx1 < len(list1):
        res.append(list1[idx1])
        idx1+=1
    while idx2 < len(list2):
        res.append(list2[idx2])
        idx2+=1
    return res
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
