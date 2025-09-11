---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Stack
---

# 1130. Minimum Cost Tree From Leaf Values

## 문제

[LeetCode 1130](https://leetcode.com/problems/minimum-cost-tree-from-leaf-values/) • **Medium**

## DP 풀이법

생각하기 쉽다

```python
class Solution:
    def mctFromLeafValues(self, arr: List[int]) -> int:
        memo = dict()
        def dfs(left, right):
            if left == right:
                return 0
            if (left, right) not in memo:
                res = float('inf')
                for mid in range(left, right):
                    # print(left, mid, right, )
                    res = min(
                        res, 
                        dfs(left, mid) 
                        + dfs(mid+1, right) 
                        + max(arr[left:mid+1]) * max(arr[mid+1:right+1])
                    )
                memo[(left, right)] = res
            return memo[(left, right)]
        return dfs(0, len(arr)-1)
```

## Stack 사용

연속된 숫자 a, b, c 가 존재한다고 하자.

그 뒤 `a > b`, `b < c` , `a<c` 가 존재할 때

- (a,b) 을 하고 (a,c) 을 하는 것과
- (b,c) 을 하고 (c,a) 을 하는

2가지 방법이 존재할 때

첫번째 방법이 더 유리하다. 이것을 토대로 전체적인 방향을 잡을 수 잇다.

```python
class Solution:
    def mctFromLeafValues(self, arr: List[int]) -> int:
    # Edge 케이스 귀찮으니간 이렇게
        arr = [inf] + arr + [inf]
        ret = 0
        st = []
        for num in arr:
      # stack 은 내림차순이 된다. num 이 더 작으면 넣고 stack이 더 작으면 계속 빼기 때문에
      # 즉 stack[-2] > stack[-1] < num 일 때만 while 이 작동되고
      # 위의 (a,b,c)의 경우가 된다.
            while len(st) >= 2 and st[-2] >= st[-1] <= num:
                if st[-2] == num == inf:
                    break
                ret += st.pop() * min(st[-1], num)
            st.append(num)
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
