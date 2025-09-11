---
tags:
  - LeetCode
  - Algorithm
  - Sliding-Window
---

# 30. Substring with Concatenation of All Words

## 문제

[LeetCode 30](https://leetcode.com/problems/substring-with-concatenation-of-all-words/) • **Easy**

## 핵심 아이디어

```python
import collections
from typing import List


class Solution:
    def findSubstring(self, s: str, words: List[str]) -> List[int]:
        word_len = len(words[0])
        ret = []
        ll = len(words)
        words = collections.Counter(words)

        def get_word(idx): return s[idx:idx+word_len]
        for start in range(word_len):
            cnt = collections.Counter()
            l = start
            for r in range(start, len(s), word_len):
                cur = get_word(r)
                while (cur not in words and l <= r) \
                        or cnt[cur] >= words[cur]:
                    cnt[get_word(l)] -= 1
                    l += word_len
                cnt[cur] += 1
                if r-l == (ll-1) * word_len:
                    ret.append(l)
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
