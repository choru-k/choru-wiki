---
tags:
  - Algorithm
  - LeetCode
---

# 930. Binary Subarrays With Sum

## 문제

[LeetCode 930](https://leetcode.com/problems/binary-subarrays-with-sum/) •**Hard**

## 핵심 아이디어

제일 간단한 방법은 Prefix Sum Counter 을 통하는 방법이다.

## Solution

```python
class Solution:

def numSubarraysWithSum(self, nums: List[int], goal: int) -> int:

ret = 0

prefix_sum = collections.Counter()

prefix_sum[0] = 1

  

cur = 0

for num in nums:

cur += num

ret += (prefix_sum[cur-goal])

prefix_sum[cur] += 1

return ret
```

하지만 좀더 공간복잡도를 최적화 하고 싶다면 어떻게 할 수 있을까?

문제를 조금 바꾸어서
subarray 의 합이 Goal 을 넘지 않는 subarray 의 갯수는 어떻게 될까?

이건 two pointer 을 통해서 쉽게 구할수 있다.

```python
        def atMost(cur):
            if cur < 0:
                return 0
            ret = l = 0
            for r in range(len(nums)):
                cur -= nums[r]
                while cur < 0:
                    cur += nums[l]
                    l += 1
                ret += r-l+1
            return ret
```

이걸 가지고 정확하게 subarray 의 합이 Goal 인 subarray 의 갯수를 구해보자.

```python
class Solution:
    def numSubarraysWithSum(self, nums: List[int], goal: int) -> int:
        def atMost(cur):
            if cur < 0:
                return 0
            ret = l = 0
            for r in range(len(nums)):
                cur -= nums[r]
                while cur < 0:
                    cur += nums[l]
                    l += 1
                ret += r-l+1
            return ret
        return atMost(goal) - atMost(goal-1)
```

이 방법을 통하면 goal 이 단순하게 정수가 아니라 범위여도 구할 수 있다.
시간 복잡도 `O(n)`, 공간 복잡도 `O(1)`

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
