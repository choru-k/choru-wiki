---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Minimax
---

# 294. Flip Game II

## 문제

[LeetCode 294](https://leetcode.com/problems/flip-game-ii/) •**Medium**

## 핵심 아이디어

일단

[[Spaces/Home/PARA/Resource/Leetcode/913. Cat and Mouse]]

을 이해하고 푸는게 더 나을 것 같다.

같은 방식으로 생각해보자.

현재 `state` 에서 다음 `state` 로 갈때, 다음 `state` 중에 나의 필승이 보장된 `state` 가 있다면 무조건 거기로 `action` 을 할 것이다.

나의턴을 0, 상대방의 턴을 1 이라고 하자.

만약 내가 갈 수 있는 모든 `state` 중에서 나의 필승이 보장된 `state` 가 없다면 그 `state` 는 나의 필패 `state` 이다. (이 문제에서는 무승부라는 것이 존재하지 않는다. 즉 모든 state 는 `승, 패` 로 갈린다.)

그것을 구현한 것이 밑의 코드이다.

## Solution

```python
class Solution:
    def canWin(self, s: str) -> bool:
        @functools.lru_cache(None)
        def dfs(s, turn):
      # 만약 `++` 이 없다면 현재 턴인 사람이 패배이니. 반대쪽이 승인 state 가 된다.
            if not '++' in s:
                return 1^turn
            
            for i in range(1, len(s)):
                if s[i-1] == s[i] == '+':
          # 현재 turn 인 사람이 승인 state 로 갈 수 있다면
                    if dfs(s[:i-1] + '--' + s[i+1:], 1^turn) == turn:
                        return turn
      # 내 승리 state 로 갈 수 있는 action 이 없다면 패.
            return 1^turn
        ans = dfs(s, 0)
        # print(ans)
        return ans == 0
```

그걸 구현한게

```python
class Solution:
    def canWin(self, s: str) -> bool:
        def dfs(s):
            return any(
                s[i:i+2] == '++' 
                and not dfs(s[:i] + '--' + s[i+2:]) 
                for i in range(len(s))
            )
        return dfs(s)
```

memorization 을 하면

`+ -> 1` `- -> 0` 으로 치환해서 bit 을 사용하면 조금 더 최적화가 되지만 `O(2^N)` 의 시간 복잡도는 변하지 않는다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
