---
tags:
  - LeetCode
  - Algorithm
  - Sliding-Window
---

# 992. Subarrays with K Different Integers

## 문제

[LeetCode 992](https://leetcode.com/problems/subarrays-with-k-different-integers/) • **Medium**

## 핵심 아이디어

이 문제를 좀더 쉽게 바꾸어 보자.

만약 정확히 K 가 아니라 최대 K 만큼 다른 문자열을 포함 할 수 있다면 어떻게 될까?

그럴 경우, 밑의 코드처럼 된다.

## Solution

```python
class Solution:
    def subarraysWithKDistinct(self, A: List[int], K: int) -> int:
        counter = collections.Counter()
        l = 0
        res = 0
   
    # 한번의 loop 마다 r 에서 끝나는 배열의 갯수를 더한다.
        for r in range(len(A)):
            counter[A[r]] += 1
            while len(counter) > K:
                counter[A[l]] -= 1
                if counter[A[l]] == 0:
                    del counter[A[l]]
                l+=1
      # [l:r+1], [l+1:r+1], [l+2:r+1], ..., [r:r+1] 전부다 정답이 되기 때문에
      # res += r-l+1 이 된다.
            res += r-l+1
        return res
```

그렇다면 정확히 K 만큼 다른 문자열은 어떻게 하면 될까?

`최대 K 만큼의 다른 문자열 허용` - `최대 K-1 만큼 다른 문자허용` 을 하면 `정확히 K 만큼 허용` 이 될 것 이다.

정확히 K 라는걸 최대문제로 바꾸어서 쉽게 구하는 아이디어가 중요하다.

```python
class Solution:
    def subarraysWithKDistinct(self, A: List[int], K: int) -> int:
        def helper(k):
            counter = collections.Counter()
            l = 0
            res = 0
            for r in range(len(A)):
                counter[A[r]] += 1
                while len(counter) > k:
                    counter[A[l]] -= 1
                    if counter[A[l]] == 0:
                        del counter[A[l]]
                    l+=1
                res += r-l+1
            return res
        return helper(K) - helper(K-1)
```

한번에 풀기.

```python
class Solution:
    def subarraysWithKDistinct(self, nums: List[int], k: int) -> int:
        def pop_val_from_cnt(cnt, val):
            cnt[val] -= 1
            if cnt[val] == 0:
                cnt.pop(val)
        cnt1 = collections.Counter()
        l1 = 0
        
        cnt2 = collections.Counter()
        l2 = 0
        
        ret = 0
        for r, num in enumerate(nums):
            cnt1[num] += 1
            cnt2[num] += 1
            
            while len(cnt1) > k:
                pop_val_from_cnt(cnt1, nums[l1])
                l1+=1
            while len(cnt2) > k or cnt2[nums[l2]] > 1:
                pop_val_from_cnt(cnt2, nums[l2])
                l2+=1
            if len(cnt1) == k:
                ret += l2-l1+1
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
