---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 1048. Longest String Chain

## 문제

[LeetCode 1048](https://leetcode.com/problems/longest-string-chain/) • **Hard**

일단 몇 가지를 생각해보자.

- word1 이 word2 의 predecessor 가 되기 위해서는 `len(word1)+1 == len(word2)` 을 만족
  - 즉 `sorted(words, key=len)`
- 정렬된 words 에 대해서 `dp[i] = max(dp[j]) + 1` (if word[i] is predecessor of word[j])
- word1 과 word2 의 predecessor 을 check 하는 함수를 만들기

밑은 이걸 차례대로 구현한 것이다.

```python
class Solution:
    def longestStrChain(self, words: List[str]) -> int:
        words = sorted(words, key=lambda word: len(word))
        
        def check(word1, word2):
            if len(word1)+1 != len(word2): return False
            if word1 == word2[:len(word1)]: return True
            k = 0
            
            while word1[k] == word2[k]:
                k+=1
            return word1[k:] == word2[k+1:]
        
        dp = [1 for _ in range(len(words))]
        
        for i in range(len(words))[::-1]:
            for j in range(i, len(words)):
                if check(words[i], words[j]):
                    dp[i] = max(dp[i], dp[j]+1)
        
        return max(dp)
```

이 풀이의 시간복잡도는 `O(N^2S)` 가 된다. S 는 평균 word 의 길이다

## Hash 을 이용한 보다 향상된 방법

이 문제가 word 을 사용한 방법에서 착안된 것이다.

우리는 정렬된 words 의 순서가 아니라 word 을 가지고 dp 을 만들 수 있다. 하지만 dp 의 완성 순서는 words 의 순서에 의해 결정된다.

시간 복잡도는 `O(NlogN + NS)` 가 된다. 정렬이 `NlogN` dp 완성을 위해서 `NS` 가 필요해진다.

```python
class Solution:
    def longestStrChain(self, words: List[str]) -> int:
        words = sorted(words, key=lambda word: len(word))
        dp = collections.defaultdict(int)
        for word in words:
            for i in range(len(word)):
                dp[word] = max(dp[word], dp[word[:i]+word[i+1:]] +1)
        
        # print(dp)
        return max(dp.values())
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
