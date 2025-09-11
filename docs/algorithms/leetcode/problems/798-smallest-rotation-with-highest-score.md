---
tags:
  - LeetCode
  - Algorithm
  - Boundary-Count
  - Greedy
---

# 798. Smallest Rotation with Highest Score

## 문제

[LeetCode 798](https://leetcode.com/problems/smallest-rotation-with-highest-score/) • **Hard**

## 핵심 아이디어

일단 가장 간단한 방법을 생각해보자.

## Solution

```python

class Solution:
    def bestRotation(self, A: List[int]) -> int:
        arr = [0] * len(A)
        tmp = 0
        for i in range(len(A)):
            arr[i] = i - A[i]
            if arr[i] >= 0:
                tmp +=1
        
        max_value = tmp
        ans = 0
        k=1
        while k < len(A):
            tmp = 0
            arr[k-1] += len(A)
            for i in range(len(A)):
                arr[i] -= 1
                if arr[i] >= 0:
                    tmp +=1
            if max_value < tmp:
                max_value = tmp
                ans = k
            k+=1
        return ans
```

실제로 배열을 돌리면서 한다면 `O(N^2)` 의 시간복잡도가 된다.

이제 좀더 최적화를 해보자.

`arr[i] = i - A[i]` 의 값은 무조건 점점 작아지다가 어느 시점에 `len(A)` 가 더해지고 다시 작아진다.

즉 특정 K 이상일 때 무조건 point 을 잃는다고 생각할 수 있다. 그리고 다시 포인트를 얻는 시점은 자기자신이 맨 뒤의 index 로 갈 때이다.

즉 `K ==(i - A[i] + 1 + N) % N` 일때 포인트를 잃고, `K == i` 일 때 포인트를 얻는다고 생각 할 수 있다.

```python
class Solution:
    def bestRotation(self, A: List[int]) -> int:
        N = len(A)
        arr = [0] * N
        tmp = 0
        for i in range(N):
            arr[(i-A[i]+1+N)%N] -= 1
        ans = 0
        for i in range(1, N):
            arr[i] += arr[i-1] + 1
            if arr[ans] < arr[i]:
                ans = i
                
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
