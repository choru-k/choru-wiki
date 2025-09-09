---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 927. Three Equal Parts

## 문제

[LeetCode 927](https://leetcode.com/problems/three-equal-parts/) • **Hard**

## 핵심 아이디어

일단 3 부분을 같은 값으로 나누어야 할 때 꼭 필요한 조건을 하나 생각해보자.

그건 바로 3 부분의 `1` 의 갯수가 일치해야 한다는 것이다.

  

이게 가장 큰 힌트이다.

밑의 코드을 보면 알기 쉽다.

## Solution

```python
def threeEqualParts(self, A: List[int]) -> List[int]:
        ones= sum(A)
        if ones%3 != 0:
            return [-1, -1]
        if ones == 0:
            return [0, len(A)-1]
```

  

즉 우리가 원하는 나누는 기준점은 각 부분이 1/3 개씩 가지고 있을 때, 사이에 있는 0들중 한개일 것이다.

  

우리가 원하는 숫자가 몇인지 확정할 수 있을까?

`leading zeros are allowed` 은 허용이지만, 뒷부분의 0은 무시할 수 있다.

즉 왼쪽, 중간, 오른쪽으로 나눌 때 오른쪽 부분으로 우리는 숫자을 확정 할 수 있다.

  

```python
				first = second = third = None
        
        cur = 0
        for idx, c in enumerate(A):
            if c == 1:
                if cur == 0:
                    first = idx
                if cur == ones//3:
                    second = idx
                if cur == 2*ones//3:
                    third = idx
                cur += 1
	      # third 로 숫자을 확정 시킬 수 있다.
        l = len(A[third:])
```

  

나머지는 확정 시킨 숫자을 비교해 주는 것이다.

전체 시간복잡도는 `O(N)` 이 된다.

```python
class Solution:
    def threeEqualParts(self, A: List[int]) -> List[int]:
        ones= sum(A)
        if ones%3 != 0:
            return [-1, -1]
        if ones == 0:
            return [0, len(A)-1]
        
        first = second = third = None
        
        cur = 0
        for idx, c in enumerate(A):
            if c == 1:
                if cur == 0:
                    first = idx
                if cur == ones//3:
                    second = idx
                if cur == 2*ones//3:
                    third = idx
                cur += 1
        
        l = len(A[third:])
        
        if A[first:first+l] == A[second:second+l] == A[third:]:
            return [first+l-1, second+l]
        return [-1, -1]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
