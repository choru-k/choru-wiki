---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - Stack
---

# 962. Maximum Width Ramp

## 문제

[LeetCode 962](https://leetcode.com/problems/maximum-width-ramp/) • **Medium**

핵심은 앞에 나왔던 숫자보다 큰 숫자는 무시 할 수 있다는 것이다

예를들어

`[7, 8, 9, 1, 10, 2]` 이 있다고 해보자.

8은 과연 의미있는 숫자일까? 8로 만들어 지는 길이는 뒤에 8 보다 큰 숫자가 있을 때 의미가 있다. 하지만 8보다 작은 7이 그 앞에 있기 때문에 항상 7로 만들어 지는 길이가 더 길다는 것을 알 수 있다. 마찬가지로 9 또한 의미가 없다.

```python
for i, num in enumerate(nums):
	if stack[-1][1] > num:
		stack.append([i, num])
```

위의 코드가 핵심이 되겠다.

이 경우 stack 은 내림차순 정렬이 될 것이고, 우리는 binary search 을 이용할 수 있다.

python의 bisect 을 사용하기 위해서 queue 을 사용해서 오름차순으로 만들어 주었다.

  

```python
class Solution:
    def maxWidthRamp(self, nums: List[int]) -> int:
        stack = collections.deque()
        stack_idx = collections.deque()
        ans = 0
        for i, num in enumerate(nums):
            if len(stack)==0 or stack[0] > num:
                stack.appendleft(num)
                stack_idx.appendleft(i)
            else:
                idx = bisect.bisect(stack, num)
								# num 이 가장 큰 수 이기 때문에 자신의 길이가 ans 가 된다.
                if idx == len(stack):
                    ans = i
                else:
                    idx = stack_idx[idx-1] 
                    ans = max(ans, i-idx)
        return ans
```

### 보다 향상

조금 더 항상 binary search 을 할 필요 없이 전에 나왔던 숫자보다 더 클 가능성이 있을 때만 검색을 하면 된다.

즉 `[0,1,2,8,9]` 가 있을 때 뒤에서 부터 보면서 9가 나왔다면 그 다음 8,2,1,0 은 검사하지 않아도 된다. 그러한 방법을 적용한게 밑이다.

```python
class Solution:
    def maxWidthRamp(self, nums: List[int]) -> int:
        stack = []
        stack_idx = []
        ans = 0
        for i, num in enumerate(nums):
            if len(stack)==0 or stack[-1] > num:
                stack.append(num)
                stack_idx.append(i)
           
        for i in range(len(nums))[::-1]:
            num = nums[i]
            while len(stack) > 0 and stack[-1] <= num:
                ans = max(ans, i - stack_idx[-1])
                stack.pop()
                stack_idx.pop()
            
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
