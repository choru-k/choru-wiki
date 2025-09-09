---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Design
  - Trie
---

# 642. Design Search Autocomplete System

## 문제

[LeetCode 642](https://leetcode.com/problems/design-search-autocomplete-system/) • **Hard**

일단 문제를 쉽게 푸는 법을 생각하고 점차 최적화를 해보자.

  

이 문제를 보자마자 Trie 을 사용해야 할 것 같다.

왜냐하면 입력을 받는다는 것이 Trie 의 자식을 탐색하는 것과 비슷하기 때문이다.

일단 Input 부분만 구현하면 밑처럼 된다.

  

```python
class Node:
    def __init__(self):
        self.end = False
        self.children = collections.defaultdict(Node)
        self.times = 0

class AutocompleteSystem:
    def __init__(self, sentences: List[str], times: List[int]):
        self.trie = Node()
        self.reset()
        for s,t in zip(sentences, times):
            self.register(s,t)

    def reset(self):
        self.now_node = self.trie
        self.now_word = ''
        
    def input(self, c: str) -> List[str]:
        if c == '#':
            self.register(self.now_word)
            self.reset()
        else:
            self.now_word += c
            self.now_node = self.now_node.children[c]
            return self.get_top(self.now_node)
    
    def get_top(self, root):
        # Something
    
    def register(self, word, times = 1):
        node = self.trie
        for c in word:
            node = node.children[c]
        node.end = True
        node.times += times
        


# Your AutocompleteSystem object will be instantiated and called as such:
# obj = AutocompleteSystem(sentences, times)
# param_1 = obj.input(c)
```

  

이제 get_top 부분을 구현하기만 하면 된다.

적당히 모든 자식을 탐색하고 sorting 하면 될 것 같다.

```python
def get_top(self, root):
      sentences = []
      def dfs(node, word):
          if node.end == True:
              sentences.append((-node.times, word))
          for key in node.children.keys():
              dfs(node.children[key], word + key)
      dfs(root, self.now_word)
      return map(lambda x: x[1], sorted(sentences)[:3])
```

  

  

## 최적화

보다 최적화를 해보자. `bottleneck` 이 되는 부분은 `get_top` 부분이다. 저 부분이 `O(m + mlogm)` 이 된다.(m 의 now_node의 자식 수)

즉 최악의 경우 `O(NlogN)` 이 되기 때문에 최적화를 해보자.

`register` 부분을 보면 node 에 `top3` 라는걸 저장해 놓고 지속적으로 업데이트를 하는 것을 알 수가 있다.

미리 모든 node 에 대해서 top3 을 구해놓기 때문에 `input` 에서 `O(1)` 을 구현할 수 있다.

하지만 `register` 부분에서는 전의 알고리즘과 같이 `O(s)` (s 는 문자열의 길이) 가 된다. 일반적인 autocomplete 에서 register 보다 input 이 훨씬 빈번하게 발생하고 `N(등록된 sentence의 갯수) >>>> s(sentence의 평균길이)` 이기 때문에 훨씬 효과적이라는 것을 알 수가 있다.

```python
class Node:
    def __init__(self):
        self.children = collections.defaultdict(Node)
        self.times = 0
        self.top3 = []
        self.sentence = ''

class AutocompleteSystem:
    def __init__(self, sentences: List[str], times: List[int]):
        self.trie = Node()
        self.reset()
        for s,t in zip(sentences, times):
            node = self.trie
            for c in s:
                node = node.children[c]
            self.register(s,node,t)

    def reset(self):
        self.now_node = self.trie
        self.now_sentence = ''
        
    def input(self, c: str) -> List[str]:
        if c == '#':
            self.register(self.now_sentence, self.now_node)
            self.reset()
        else:
            self.now_sentence += c
            self.now_node = self.now_node.children[c]
            return map(lambda x: x.sentence, self.now_node.top3)
    
    def register(self, sentence, sentence_node, times = 1):
        sentence_node.times += times
        sentence_node.sentence = sentence
        node = self.trie
        
        for c in sentence:
            node = node.children[c]
            comp = lambda x: (-x.times, x.sentence)
            if sentence_node not in node.top3:
                if len(node.top3) < 3:
                    node.top3.append(sentence_node)
                else:
                    minIdx = max(range(3), key=lambda i: comp(node.top3[i]))
                    if comp(sentence_node) <= comp(node.top3[minIdx]):
                        node.top3[minIdx] = sentence_node
            node.top3 = sorted(node.top3, key=comp)
        


# Your AutocompleteSystem object will be instantiated and called as such:
# obj = AutocompleteSystem(sentences, times)
# param_1 = obj.input(c)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
