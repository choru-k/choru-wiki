---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 1521. Find a Value of a Mysterious Function Closest to Target

## 문제

[LeetCode 1521](https://leetcode.com/problems/find-a-value-of-a-mysterious-function-closest-to-target/) • **Medium**

## 핵심 아이디어

풀이 방법은 꽤 심플하다.

각각의 원소에서 `arr[0:idx], arr[1:idx], arr[2:idx],...arr[idx-1:idx]` 의 모든 and 값에 대해서 연산을 해주고 정답을 구하면 된다.

문제는 시간복잡도이다. 곰곰히 생각해보면 이 방법은 `O(N^2)` 처럼 보인다. 왜냐하면 `s` 에 들어가는 아이템이 매우 많을 것 같기 때문이다.

하지만 `s` 의 크기는 `log(max(arr))` 이라는 것을 알 수가 있다.

일단 `and` 연산의 특성상 값은 무조건 작아진다. 무슨 소리냐 하면 `a&b=c` 라고 할 때 `a>=c` 을 무조건 만족한다.

또한 `c` 는 `a` 비트에서 0개 이상의 `1` 이 `0` 으로 변한 것이다.

예를들어서 `max(arr)` 이 `1111` 이라고 하면 `s` 는 `(1111,1101,1001,0001)` 이거나 `(1111,1011,0011,0010)` 이 될 수 있다. 하지만 `(1111,1011,1101, 1000,0001)` 같이 한번 지워진 1이 다시 생길수는 없다. 즉 s 는 그전의 s 에서 비트을 1개씩 지우것들의 집합이 될수 밖에 없으며, 크기는 `log(max(arr))` 이 된다는 것을 알 수가 있다.

즉 시간 복잡도는 `O(N*log(max(arr))` 이라는 것을 알 수가 있다.

## Solution

```python
class Solution:
    def closestToTarget(self, arr: List[int], target: int) -> int:

        ans = inf
        s = set()
        for num in arr:
            ns = set()
            ns.add(num)
            for a in s:
                ns.add(a&num)
            for a in ns:
                ans = min(ans, abs(a- target))
            s = ns
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
