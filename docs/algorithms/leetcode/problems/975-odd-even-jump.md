---
tags:
  - LeetCode
  - Algorithm
  - Monotonic-Stack
  - Stack
---

# 975. Odd Even Jump

## 문제

[LeetCode 975](https://leetcode.com/problems/odd-even-jump/) • **Medium**

## 핵심 아이디어

일단 가장 간단한 방법으로는 DP 가 있다

## Solution

```python
class Solution:
    def oddEvenJumps(self, A: List[int]) -> int:
        memo = dict()
        n = len(A)
        
        def dfs(pos, k): \#position, k번째
            if pos == len(A)-1:
                return True
            if (pos, k%2) not in memo:
                res = -1
                if k%2 == 1:
                    for i in range(pos+1, n):
                        if A[pos] <= A[i] and (res==-1 or A[i] < A[res]):
                            res = i
                else:
                    for i in range(pos+1, n):
                        if A[pos] >= A[i] and (res == -1 or A[i] > A[res]):
                            res = i
                if res != -1:
                    memo[(pos, k%2)] = dfs(res, k+1)
                else:
                    memo[(pos, k%2)] = False
            return memo[(pos, k%2)]
        ans = 0
        for i in range(len(A)):
            if dfs(i, 1):
                # print(i)
                ans += 1
        return ans
```

  

하지만 실제로는 TimeLimit 가 된다.

문제는 매번 for-loop 을 하면서 적절한 next_high, next_low 을 찾기 때문이다.

이걸 바꾸어 보자.

가장 간단한 방법으로는 TreeMap(Ordered Map) 이 있다.

간단히 생각해서 binary search 을 해서 가장 가깝게 큰수와 작은 수를 찾고, 중간에 insert 을 해서 다시 sorted 된 배열이 존재한다고 생각하면 된다. 하지만 python 에서는 이러한 라이브러리가 없기 때문에 다른 방법 stack 을 사용하자.

  

만약 `A[i] < ... < A[j]` 을 만족하면서 i 의 홀수번째 다음칸이 j 가 되기 위해서는 저 `...` 의 부분이 모두 i 보다 작은 index 여야 한다. 그 때 저 `....` 의 다음칸이 j 이외가 될 수 없다. 즉 우리는 stack 을 사용할 수가 있다. 일단 위의 `A[i] < ... < A[j]` 을 만들어 주기 위해서 sort 을 하고 idx 을 기준으로 stack 을 만든다.

```python
class Solution:
    def oddEvenJumps(self, A: List[int]) -> int:
        nxt_high = [0] * len(A)
        nxt_low = [0] * len(A)
        
        stack = []
        for a, i in sorted([(a, i) for i, a in enumerate(A)]):
            while len(stack) > 0 and stack[-1] < i:
                nxt_high[stack.pop()] = i
            stack.append(i)
            
        
        stack = []
        for a, i in sorted([(-a, i) for i, a in enumerate(A)]):
            while len(stack) >0 and stack[-1] < i:
                nxt_low[stack.pop()] = i
            stack.append(i)
        
        odd = [0] * len(A)
        even = [0] * len(A)
        odd[-1] = even[-1] = 1
        
        for i in range(len(A)-1)[::-1]:
            odd[i] = even[nxt_high[i]]
            even[i] = odd[nxt_low[i]]
        # print(nxt_low, nxt_high)
        return sum(odd)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
