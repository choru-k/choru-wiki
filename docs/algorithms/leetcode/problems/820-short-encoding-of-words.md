---
tags:
  - LeetCode
  - Algorithm
  - Trie
---

# 820. Short Encoding of Words

## 문제

[LeetCode 820](https://leetcode.com/problems/short-encoding-of-words/) • **Hard**

## 핵심 아이디어

이 문제는 여러가지 푸는 방법이 있다.

  

가장 쉽게 생각 할 수 있는 방법부터 생각해보자.

  

가장 긴 문자열이 다른 문자열에 포함 될 수는 없을 것이다.

그렇기 때문에 문자열 길이순으로 정렬한 후 부분 문자열을 hashMap 에 넣어두는 방법을 사용할 수도 있다.

## Solution

```python
class Solution:
    def minimumLengthEncoding(self, words: List[str]) -> int:
        dic = {}
        
        new_words = sorted(words, key=lambda word: -len(word))
        
        idx=0
        for word in new_words:
            if word not in dic:
                for i in range(len(word)):
                    slice_word = word[i:]
                    if slice_word not in dic:
                        dic[slice_word] = idx+i
                idx += len(word)+1
        print(dic)
        return idx
```

  

  

조금 더 생각을 해보자.

위의 방법을 사용할 경우 우리는 각 문자열의 index 을 구할 수 있다. 하지만 우리에게 필요한건 단순하게 길이이다. 핵심은 중복되는 부분 문자열을 지우는 것이다.

  

```python
class Solution:
    def minimumLengthEncoding(self, words: List[str]) -> int:
        word_set = set(words)
        
        for word in words:
            for i in range(1, len(word)):
								# word[i:] 배열을 자르는 행위가 O(K)
                word_set.discard(word[i:])
        
        return sum(len(word) + 1 for word in word_set)
```

즉 처음에 모든 문자열을 set 에 넣어두고 각 부분 문자열을 지우는 방법을 생각 할 수도 있다.

TimeComplexity 는 `O(N * K^2)` 가 된다.(N 단어 갯수, K 문자열 길이)

  

  

조금 더 생각해 보자. 우리는 HashMap 이외의 자료구조를 사용할 수도 있을 것이다.

  

```python
class Node:
    def __init__(self):
        self.length = 0
        self.children = {}

class Trie:
    def __init__(self):
        self.head = Node()

    def insert(self, word):
        node = self.head
        
        idx = 0
        while idx < len(word):
            if word[idx] not in node.children:
                node.children[word[idx]] = Node()
                node.children[word[idx]].length = idx+1
            node = node.children[word[idx]]
            idx+=1
    
    def get_leafs(self):
        self.leafs = []
        
        def dfs(node):
            if len(node.children) == 0:
                self.leafs.append(node)
            else:
                for child in node.children.values():
                    dfs(child)
        dfs(self.head)
        return self.leafs
class Solution:
    def minimumLengthEncoding(self, words: List[str]) -> int:
        trie = Trie()
        for word in words:
            trie.insert(word[::-1])
        
        
        return sum(node.length + 1 for node in trie.get_leafs())
```

Trie 을 사용하였다. 시간 복잡도는 `O(N * K)` 가 된다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
