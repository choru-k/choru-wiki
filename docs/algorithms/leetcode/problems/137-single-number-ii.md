---
tags:
  - LeetCode
  - Algorithm
  - Bit-Manipulation
---

# 137. Single Number II

## 문제

[LeetCode 137](https://leetcode.com/problems/single-number-ii/) •**Easy**

### 1개인 숫자가 비트가 0일때. 총 비트는 3n 개가 나온다

이번에 추가하는 x 가 비트가 1일때

3n+1

as-is: seen_twice = 0, seen_once = 0

to-be: seen_twice = 0, seen_once = 1

3n+2

as-is: seen_twice = 0, seen_once = 1

to-be: seen_twice = 1, seen_once = 0

3n+3

as-is: seen_twice = 1, seen_once = 0

to-be: seen_twice = 0, seen_once = 0

```python
class Solution:
    def singleNumber(self, nums: List[int]) -> int:
        seen_once = seen_twice = 0
        
        for num in nums:
            # 첫번째면 seen_once ^num  이 seen_once 가 된다.
            # ~seen_twice 은 seen_twice 에 들어가 있다면 무시하라는 것이다.
            # seen_once 에 이미 들어가 있기 때문에 (seen_twice ^ num) 은 무시된다.
            
            # 두번째면 (seen_once ^ num) 에 의해 seen_once 에서 사라진다.
            # seen_once에 없기 때문에 (seen_twice ^ num) 가 실행되고 seen_twice 에 기록된다.
            
            # 3번째면 seen_twice 에 있기 때문에 seen_once ^ num은 무시된다.
            # seen_once 없기 때문에 seen_twice ^ num 가 실행되고 seen_twice 에서 지워진다.
            seen_once = ~seen_twice & (seen_once ^ num)
            seen_twice = ~seen_once & (seen_twice ^ num)
        return seen_once
```

비트를 세어서 풀 수도 있다. 마이너스의 경우만 마지막 비트를 잘 활용하자.

```python
class Solution:
    def singleNumber(self, nums: List[int]) -> int:
        cnt = [0 for _ in range(33)]
        for num in nums:
            if num < 0:
                num = -num
                cnt[32] += 1
            for i in range(32):
                cnt[i] += (num >> i) % 2
        
        
        ret = sum(1<<i for i in range(32) if cnt[i]%3 == 1)
        if cnt[-1] % 3 == 1:
            ret = -ret
        return ret
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
