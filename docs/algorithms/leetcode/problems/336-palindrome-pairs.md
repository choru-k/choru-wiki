---
tags:
  - LeetCode
  - Algorithm
  - Hash-Table
---

# 336. Palindrome Pairs

## 문제

[LeetCode 336](https://leetcode.com/problems/palindrome-pairs/) • **Medium**

## 핵심 아이디어

일단 가장 간단하게 생각 할 수 있는 방법은 모든 경우의 수를 다 해보는 것이다.

조합을 만드는게 `O(N^2)` panlindrome 체크가 `O(L)` (L은 word 의 평균길이) 이기 때문에 `O(N^2 * L)` 이 된다.

이러면 TLE 난다.

문제 조건에는 없지만 `N >> L` 이다. 왜 조건에 없는지 모르겠다.

이제 좀더 생각을 해보자.

문자열 A 와 문자열 C 가 합쳐서 parlindrome 이 되기위한 조건을 찾아보자.

A을 A'A'' 로 나누면 A'A''C 가 합친 문자열이 된다. A''가 그자체로 palindrome 이고 A' == C.reverse() 라면 전체 문자열이 Palindrome 이 된다. 반대의 경우도 마찬가지이다.

이 경우 하나의 문자열 마다 나누는 작업 `O(L)` , A' 가 기존 문자열과 일치하는지 `O(N)` 이 된다. 기존 문자열들을 전부다 Hash 에 넣는다면 이 작업이 `O(1)` 이 되기 때문에 보다 효율적이다.

또한 기존 문자열을 Trie 에 넣어도 일치하는지를 `O(L)` 에 알 수 있기 때문에 같은 시간 복잡도가 된다.

## Solution

```python
class Solution:
    def palindromePairs(self, words: List[str]) -> List[List[int]]:
        dic = {w[::-1]: i for i, w in enumerate(words) }
        
        ans = set()
        
        for k, word in enumerate(words):
            for i in range(len(word)+1):
                prefix, suffix = word[:i], word[i:]
                if prefix in dic and dic[prefix] != k and suffix[::-1] == suffix:
                    ans.add((k, dic[prefix]))
                if suffix in dic and dic[suffix] != k and prefix[::-1] == prefix:
                    ans.add((dic[suffix], k))
        return list(map(list, list(ans)))
```

시간복잡도는 `O(N * K^2)` 가 된다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
