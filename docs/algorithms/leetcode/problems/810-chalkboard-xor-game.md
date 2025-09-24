---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Minimax
---

# 810. Chalkboard XOR Game

## 문제

[LeetCode 810](https://leetcode.com/problems/chalkboard-xor-game/) •**Hard**

## 핵심 아이디어

주어진 배열을 `[a1, a2, ..., an]` 이라고 하자.

그렇다면 이걸 전부다 xor 한 값을 `N=a1^a2^...^an` 이라고 하면 `ai`을 지운다고 할때,

`a1^a2^...^a(i-1)^a(i+1)...^an` 으로 그 값을 표현할 수 있다.

저 값은 N 에서 `ai` 을 지운것인데, xor 의 특성상 `N^ai` 도 같은 값이 된다.

즉 alice 가 고르는 `ai` 가 N 이라면 패배가 된다. 하지만 alice 는 항상 이러한 값을 고르지 않을려고 하기 때문에, alice 가 지는 경우는 N을 고를수 밖에 없을 때, 즉 모든 숫자가 N 일 때만 진다.

그렇다면 모든 숫자가 N 이라는 것을 어떤 의미를 가질까?

모든 숫자가 N 이면 xor 했을 때, 홀수면 N 짝수면 0 이 된다. 즉 처음 수가 짝수면 항상 alice 는 이길 수 밖에 없다.

갯수가 짝수라면, 최악의 경우라도 bob이 마지막 숫자를 지우기 때문에 alice는 최악의 경우를 피할 수있다.

만약 갯수가 홀수라면 최악의 경우 alice 가 마지막 숫자를 지워야 하기 때문에 alice 가 진다.

몇가지 예를 들어보자, 어차피 alice 와 bob 은 숫자를 1개씩 지우기 때문에 마지막은 어떠한 같은 숫자로만 이루어지거나, 또는 다른숫자 1개가 추가된

[1,1,1,1], [1,1,1,2] 의 경우 만 존재한다.

만약 처음 시작이 짝수였다면, alice 의 차례는 항상 짝수개의 숫자가 온다. 만약 앨리스가 [1,1,1,1] 의 경우를 받는다면 그전에 bob 이 [1,1,1,1] 의 경우를 만들었기 때문에 앨리스가 이긴다.

[1,1,1,2] 면 alice 가 2 을 고르면 bob 은 무조건 지게된다.

## Solution

```python
class Solution:
    def xorGame(self, nums: List[int]) -> bool:
        res = 0
        for num in nums:
            res ^= num
        if res == 0:
            return True
        return len(nums) %2 == 0
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
