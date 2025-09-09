---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 360. Sort Transformed Array

## 문제

[LeetCode 360](https://leetcode.com/problems/sort-transformed-array/) • **Medium**

## 핵심 아이디어

일단 2차 함수 이기 때문에 위쪽방향 포물선, 또는 아래쪽 방향 포물선의 모양이 된다.

포물선의 특성상 위쪽방향일 경우 최댓값, 아래쪽 방향일 경우 최솟값이 존재하기 때문에

포물선의 꼭지점에서 가장가까운 두점을 찾고, 왼쪽, 오른쪽으로 이동시키면 될 것 같다.

  

하지만 보다 쉬운 방법이 잇을거 같다. 그건 중간에서 부터 왼쪽 오른쪽을 하는게 아니라, 맨 끝에서 부터 중간을 향하게 하는 것이다. 같은 방식이지만 구현에 잇어서 훨씬 간단해진다.

## Solution

```python
class Solution:
    def sortTransformedArray(self, nums: List[int], a: int, b: int, c: int) -> List[int]:
        nums = [a*x*x + b*x + c for x in nums]
        
        l,r = 0, len(nums)-1
        ans = [None] * len(nums)
        
				# a 가 양수일 때는 뒤에서 부터 시작하고, 큰 순서대로 넣는다
				# a 가 음수일 때는 앞에서 부터 시작하고, 작은 순서대로 넣는다.
        if a > 0:
            idx = len(nums)-1
            while l<=r:
                if nums[l] < nums[r]:
                    ans[idx] = nums[r]
                    r-=1
                else:
                    ans[idx] = nums[l]
                    l+=1
                idx -= 1
            return ans
        
        else:
            idx = 0
            while l<=r:
                if nums[l] > nums[r]:
                    ans[idx] = nums[r]
                    r-=1
                else:
                    ans[idx] = nums[l]
                    l+=1
                idx += 1
            return ans
```

  

중복 되는 코드를 합쳐서 간소화 햇다.

```python
class Solution:
    def sortTransformedArray(self, nums: List[int], a: int, b: int, c: int) -> List[int]:
        nums = [a*x*x + b*x + c for x in nums]
        
        l,r = 0, len(nums)-1
        ans = [None] * len(nums)
        
				# a 가 양수일 때는 뒤에서 부터 시작하고, 큰 순서대로 넣는다
				# a 가 음수일 때는 앞에서 부터 시작하고, 작은 순서대로 넣는다.
        idx = (0, 1) if a < 0 else (len(nums)-1, -1)
        while l<=r:
						# a 을 그대로 사용을 하면 a가 0인 경우에 캐치를 못한다.
						# 그렇기 때문에 a 와 같은 방향의 부호를 가진 다른 수를 사용한다.
            if -idx[1] * nums[l] < -idx[1] * nums[r]:
                ans[idx[0]] = nums[r]
                r-=1
            else:
                ans[idx[0]] = nums[l]
                l+=1
            idx = (idx[0]+idx[1], idx[1])
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
