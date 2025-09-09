---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Greedy
---

# 761. Special Binary String

## 문제

[LeetCode 761](https://leetcode.com/problems/special-binary-string/) • **Hard**

## 핵심 아이디어

일단 `1xxxx0` 가 Special Binary String 이라고 해보자.

`xxxx` 는 Special Binary String 이 될 수 있을까?

만약 `0110` 이라면 `101100` 은 `10`,`1100` 으로 나누어 졋을 것이다.

즉 `1xxxx0` 는 `110100` 과 같은 상태로만 구성되어있어야 한다.

만약 `AB` 가 있다면 AB 자리를 바꾸어서 Special 이 될수 있는건 알겠다. 그렇다면 `AB` 의 중간 그러니깐 `abc` 로 나누어서 자리를 바꾸는 것도 가능하지 않을까? 왜 저렇게 큰 단위로만 바꾸어야 할까?

우리는 항상 연속된 1이 많도록 배열하는게 가장 유리하다. 즉 연속된 1이 가장많은 곳은 A, B 의 가장 앞쪽이다. 만약 가장 앞쪽에 연속된 1이 가장 많은 곳이 아니라면 special binary string 이 아니게 된다.

  

그렇다면 `1xxxxxx0` 에서 `xxxxxxx` 을 dfs 한게 과연 실제로 만들어 질수 있을까?

일단 xxxxxx 안에서 count 가 0으로 내려갓다가 0이 될수는 없다.

왜냐하면 주어진 문자열 s 가 special binary string 이기 때문이다.

또한 xxxxx 또한 special binary string 이 된다. 맨앞, 맨뒤에 1,0을 없앳기 때문에 실제 cnt 는 변화가 없어야 하기 때문이다.

## Solution

```python
class Solution:
    def makeLargestSpecial(self, S: str) -> str:
        res = []
        cnt = 0
        i=0
        for j, c in enumerate(S):
            cnt = cnt + 1 if c == '1' else cnt -1
            if cnt == 0:
                res.append(f"1{self.makeLargestSpecial(S[i+1:j])}0")
                i=j+1
        return "".join(sorted(res, reverse=True))
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
