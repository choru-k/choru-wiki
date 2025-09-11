---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 1630. Arithmetic Subarrays

## 문제

[LeetCode 1630](https://leetcode.com/problems/arithmetic-subarrays/?envType=list&envId=xfgt7zgc) • **Medium**

## 핵심 아이디어

가장 간단한 방법은 단순하게 정렬하게 비교하는 방법이 있다.

## Solution

```python
class Solution:
    def checkArithmeticSubarrays(self, nums: List[int], l: List[int], r: List[int]) -> List[bool]:
        def check(nums: List[int]):
            nums.sort()
            diff = nums[1]-nums[0]
            return all(cur+diff == nxt for cur, nxt in zip(nums[:-1], nums[1:]))
        ret = []
        for i, j in zip(l, r):
            ret.append(check(nums[i:j+1]))
        return ret
```

정렬하지 않고 어떻게 풀까?
일단 해당 배열에 max, min 을 구한다.
그리고 해당 배열에서 각 아이템의 diff 은 `(max-min) / (len(nums)-1)` 이 되어야 한다.
diff 을 알았으니, 각 아이템이 해당 배열에 있는지만 검사하면 되고 이건, set 으로 처리할 수 있다.

```python
class Solution:
    def checkArithmeticSubarrays(self, nums: List[int], l: List[int], r: List[int]) -> List[bool]:
        def check(nums: List[int]):
            mn = min(nums)
            mx = max(nums)

            if (mx-mn) % (len(nums)-1) != 0:
                return False
            diff = (mx-mn) / (len(nums)-1)

            nums_set = set(nums)
            curr = mn + diff
            while curr < mx:
                if curr not in nums_set:
                    return False
                curr += diff
            return True
        ret = []
        for i, j in zip(l, r):
            ret.append(check(nums[i:j+1]))
        return ret
```

<https://leetcode.com/problems/arithmetic-subarrays/solutions/4322369/mo-s-algorithm-o-m-sqrt-n-log-n-c/>

- #todo Mo's algorithm 정리

```cpp
 Mo's algorithm
```

더 좋은 방법이 잇을까? 약간 트릭이지만 더 좋은 방법이 잇을 수 있다.
일단 우리는 어떤 숫자가 들어가야 할지 안다.
그렇다면 우리가 원하는 배열의 합도 알고, 제곱한 합도 바로 구할 수 있다.
이것만을 가지고 파악하면 어떨까?

일단 segment tree 로 min, max 을 구한다.
그 다음 diff 를 구하고, min max 로 유추한 배열의 합, 제곱한 합을 구한다.
그 다음 실제 배열의 합, 제곱한 합을 구해야 하는데, 이건 prefix sum 으로 구할 수 있다.

이럴경우 시간복잡도는 `n*logn + m*logn` 이 될 것 이다.
물론 배열의 합, 제곱의 합 도 같은 경우가 있다면 틀릴 것이다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
