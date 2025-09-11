---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Stack
---

# 907. Sum of Subarray Minimums

## 문제

[LeetCode 907](https://leetcode.com/problems/sum-of-subarray-minimums/) • **Hard**

## 핵심 아이디어

보자마자 가장 쉬운 방법은 모든 방법을 다 해보는 것이다.

총 O(n^2) 개 만큼의 subarray 가 존재하고 각각의 minimum 을 찾는 것에 O(n) 이 걸리기 때문에 총 시간 복잡도는 O(n^3) 이 된다.

## Solution

```python
ans = 0
for i in range(len(A)):
 for j in range(i+1, len(A)):
  arr = A[i:j]
  value = min(arr)
  ans += value
```

이 방법은 꽤나 시간 복잡도가 크다.

그 전의 결과를 사용할 수 있을까?

`min(A[i:j+1]) = min(A[i:j], A[j+1])` 이란 것을 알 수 있다. 즉 우리는 매번 최솟값을 구하지 않아도 그 전의 최소값을 이용해서 현재의 최소값을 알 수가 있다.

```python
ans = 0
for i in range(len(A)):
 value = A[i]
 for j in range(i+1, len(A)):
  value = min(value, A[j])
  ans += value
```

조금 더 생각을 해보자. `A[j]` 가 가장 오른쪽에 있는 subarray 들을 생각해보자.

`A = [4,2,3,5,1,3]` 이고, `j=3` 이라면 `[4,2,3,5]`, `[2,3,5]`, `[3,5]`, `[5]` 가 된다.

만약 이 때의 subarray min 의 값을 `sum_subarray(3)` 이라고 할 경우 `sum_subarray(3) = 12 = sum_subarayy(2) + 5` 가 된다. 즉 5 가 바로 왼쪽에 있는 3보다 크기 때문에 자기 자신만을 원소로 갖는 배열의 값 이외는 `sum_subarray(2)` 와 같게 된다.

이걸 좀 더 일반화 시켜보자.  
12는 2 + 2+ 3 + 5 였다. 즉 자기자신부터 시작하여서 왼쪽으로 이동하면서 가장 최솟값들을 더한다.  

j=4 가 되면 1 + 1+ 1+ 1 + 1 이 된다.

스택으로 생각해보자.

만약 스택의 맨 위의 값보다 더 작은 값이 나오면 우리는 그 값은 더 작은 값으로 치환 할 수 있다.

즉

[4]

[2, 2]

[2, 2, 3]

[2, 2, 3, 5]

[1, 1, 1, 1, 1]

[1, 1, 1, 1, 1, 3]

로 스택이 업데이트 된다고 생각 할 수 있다. 이러한 아이디를 사용한 게 밑의 코드이다.

```python
class Solution:
    def sumSubarrayMins(self, A: List[int]) -> int:
        stack = []
        ans = 0
        val = 0
        for num in A:
            cnt = 1
            while len(stack) > 0 and stack[-1][0] >= num:
                v, c = stack.pop()
                cnt += c
                val -= v * c
                
            stack.append([num, cnt])
            val += num * cnt
            ans += val
            ans = (ans % (pow(10,9) + 7))
        return ans
```

stack 은 최대 N 만큼 append 되기 때문에 pop 또한 최대 O(N) 만큼 실행되기 때문에 전체 시간 복잡도는 O(N) 이다

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
