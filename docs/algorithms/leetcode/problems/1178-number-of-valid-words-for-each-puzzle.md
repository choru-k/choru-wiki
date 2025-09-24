---
tags:
  - LeetCode
  - Algorithm
  - Hash-Table
---

# 1178. Number of Valid Words for Each Puzzle

## 문제

[LeetCode 1178](https://leetcode.com/problems/number-of-valid-words-for-each-puzzle/) •**Medium**

## 핵심 아이디어

일단 가장 무식하게 생각해보자.

모든 퍼즐마다 모든 단어를 한번씩 비교하면 된다.

그 경우 시간복잡도는 `O(W*P)` 가 된다.

좀더 문제를 보면 퍼즐의 길이가 매우 작다는 것을 알 수가 있다. 또한 퍼즐은 중복이 존재하지 않는다.

이걸 통해서 퍼즐이 존재할 때, 이 퍼즐로 만들수 있는 set 의 가짓수는 2^6 이라는 것을 알수가 있다.(첫번째는 무조건 포함)

그렇다면 맨 처음 단어의 set 을 key 로 만들면, 이러한 set 으로 만들수 있는 총 단어의 수가 나온다.

남은건 주어진 퍼즐로 만들 수 있는 모든 set 을 구하면 된다.

## Solution

```python
class Solution:
    def findNumOfValidWords(self, words: List[str], puzzles: List[str]) -> List[int]:
        counter = collections.Counter(frozenset(word) for word in words)
        
        
        ans = []
        for p in puzzles:
            cur = 0
            for k in range(7):
                for comb in itertools.combinations(p[1:], k):
                    cur += counter[frozenset(tuple(p[0]) + comb)]
                    
            ans.append(cur)
        return ans
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
