---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Trie
---

# 527. Word Abbreviation

## 문제

[LeetCode 527](https://leetcode.com/problems/word-abbreviation/) •**Medium**

가장 간단한 방법은 하나하나 직접 해보는 것이다.

일단 abbreviation 을 만들고, 만약 중복이 있을 경우, 앞을 1글자 늘려서 다시 해본다.

그리고 모든 중복이 사라질 때 까지 이걸 반복한다.

O(N^2*L^2) N은 words 의 갯수, L 의 각 word 의 길이.

최악의 경우 N

```python
class Solution:
    def wordsAbbreviation(self, words: List[str]) -> List[str]:
        
        abbre_to_word = collections.defaultdict(list)
        word_to_abbre = dict()
        q = []
        for word in words:
            key = word[0]+str(len(word)-2)+word[-1]
            if len(key) >= len(word):
                key = word    
                
            abbre_to_word[key].append(word)
            word_to_abbre[word] = key
      # 만약 중복이 있다면 queue 에 넣고, 나중에 다시 해본다.
            if len(abbre_to_word[key]) == 2:
        # key 와 prefix 의 길이. 
                q.append((key, 1))
        for key, l in q:
            for word in abbre_to_word[key]:
                new_key = word[:l+1] + str(len(word)-l-2) + word[-1]
                if len(new_key) >= len(word):
                    new_key = word
                abbre_to_word[new_key].append(word)
                word_to_abbre[word] = new_key
                if len(abbre_to_word[new_key]) == 2:
                    q.append((new_key, l+1))
        return [word_to_abbre[word] for word in words]
```

## Use Prefix with Trie

O(N*L)

Prefix 찾는 걸 Trie 을 이용해서 한다.

```python
class Trie:
    def __init__(self):
        self.cnt=0
        self.children=collections.defaultdict(Trie)
class Solution:
    def wordsAbbreviation(self, words: List[str]) -> List[str]:
        group = collections.defaultdict(list)
        for word in words:
      # 모든 각 group 을 만들고 trie 을 고려한다.
            group[(word[0], len(word)-2, word[-1])].append(word)
        
        word_to_abb = dict()
        for word_list in group.values():
            trie = Trie()
      # 그룹마다 trie 을 만들고 prefix을 찾는다.
            for word in word_list:
                cur = trie
                for c in word:
                    cur.cnt += 1
                    cur = cur.children[c]
                cur.cnt+=1
            for word in word_list:
                cur = trie
                for idx, c in enumerate(word):
          # 만약 prefix 가 유일하다면 여기서 스탑.
                    if cur.cnt == 1:
                        break
                    cur = cur.children[c]
        # 최소 앞에 글자 1개는 필요하기 때문에
                idx = max(idx, 1)
                abb = word[:idx]+ str(len(word)-idx-1)+ word[-1]
                if len(abb) >= len(word):
                    abb = word
                word_to_abb[word] = abb
        return [word_to_abb[word] for word in words]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
