---
tags:
  - LeetCode
  - Algorithm
  - Hash-Table
  - Trie
---

# 966. Vowel Spellchecker

## 문제

[LeetCode 966](https://leetcode.com/problems/vowel-spellchecker/) • **Medium**

이 문제는 2가지 방법으로 풀 수가 있다.

## Hash Map

원래 단어, 소문자화 시킨 단어, `aeiou` 을 와일드 카드로 바꾼 단어 의 HashMap 을 저장한다.

그 뒤에 qeury 을 똑같은 변형을 시킨 후 정답을 찾아간다.

query 시간 복잡도 `O(l)` l = 단어의 길이

공간복잡도 `O(N*l)`

```python
class Solution:
    def spellchecker(self, wordlist: List[str], queries: List[str]) -> List[str]:
        origin_words = set(wordlist)
        
    # index 가 더 앞쪽인 단어를 출력해야 하기 때문에 
    # wordlist의 뒤에서 부터 hash map 을 만든다. 이러면 더 앞쪽의 단어가 뒷쪽을 덮어씌운다.
        case_words = {word.lower(): word for word in wordlist[::-1]}
        vowel = lambda word: word.lower().replace('a', '*').replace('e', '*').replace('i', '*').replace('o', '*').replace('u', '*')
        vowel_words = {vowel(word): word for word in wordlist[::-1]}
        ans = []
        for q in queries:
            if q in origin_words:
                ans.append(q)
            elif q.lower() in case_words:
                ans.append(case_words[q.lower()])
            elif vowel(q) in vowel_words:
                ans.append(vowel_words[vowel(q)])
            else:
                ans.append('')
        return ans
```

## Use Trie

Trie 와 BFS 을 사용해서 Trie 을 search 한다.

query 시간 복잡도 O(Trie 전체) = worst(O(N*l))

공간 복잡도 Trie 의 공간복잡도 = word(O(N*l))

```python
class Node:
    def __init__(self):
        self.end = False
        self.val = ''
        self.children = collections.defaultdict(Node)
        
class Trie:
    def __init__(self):
        self.head = Node()

    def add(self, word):
        node = self.head
        for c in word:
            node = node.children[c]
        node.end = True
        node.val = word
        
    def capi(self, word, words_idx):
        layer = collections.deque([(self.head, 0)])
        candidates = []
        while len(layer) > 0:
            node, i = layer.popleft()
            if len(word) == i and node.val != '':
                candidates.append(node.val)
            for k, v in node.children.items():
                if k.lower() == word[i].lower():
                    layer.append((v, i+1))
                
        if len(candidates) == 0:
            return ''
        if word in candidates:
            return word
        
        return min(candidates, key=lambda x: words_idx[x])
    def vowel(self, word, words_idx):
        layer = collections.deque([(self.head, 0)])
        candidates = []
        while len(layer) > 0:
            node, i = layer.popleft()
            if len(word) == i and node.val != '':
                candidates.append(node.val)
            for k, v in node.children.items():
                if k.lower() == word[i].lower():
                    layer.append((v, i+1))
                elif word[i].lower() in ['a','e','i','o','u'] and k.lower() in ['a','e','i','o','u']:
                    layer.append((v, i+1))
                
        if len(candidates) == 0:
            return ''

        return min(candidates, key=lambda x: words_idx[x])
    def search(self, word, words_idx):
        c = self.capi(word, words_idx)
        if c !='':
            return c
        return self.vowel(word, words_idx)
class Solution:
    def spellchecker(self, wordlist: List[str], queries: List[str]) -> List[str]:
        words_idx= dict()
        for i, word in list(enumerate(wordlist))[::-1]:
            words_idx[word] = i
        trie = Trie()
        ans = []
        for word in wordlist:
            trie.add(word)
        for q in queries:
            ans.append(trie.search(q, words_idx))
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
