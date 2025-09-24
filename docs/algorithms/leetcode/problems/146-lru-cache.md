---
tags:
  - LeetCode
  - Algorithm
  - Solution-Archive
---

# 146. LRU Cache

## 문제

[LeetCode 146](https://leetcode.com/problems/lru-cache/) •**Medium**

## 핵심 아이디어

```python
class Node:
    def __init__(self, key, val):
        self.val = val
        self.key = key
        self.nxt = self.pre = self

class LinkedList:
    def __init__(self):
        self.head = Node(-1,-1)
        self.len = 0
    
    def remove(self, node):
        pre, nxt = node.pre, node.nxt
        pre.nxt, nxt.pre = nxt, pre
        self.len -= 1
    
    def append(self, node):
        pre, nxt = self.head.pre, self.head
        pre.nxt, nxt.pre = node, node
        node.pre, node.nxt = pre, nxt
        self.len += 1
        

class LRUCache:

    def __init__(self, capacity: int):
        self.capacity = capacity
        self.ll = LinkedList()
        self.key_to_node = dict()

    def get(self, key: int) -> int:
        if key not in self.key_to_node:
            return -1
        
        node = self.key_to_node[key]
        self.ll.remove(node)
        self.ll.append(node)
        return self.key_to_node[key].val

    def put(self, key: int, value: int) -> None:
        if key not in self.key_to_node:
            node = Node(key, value)
            self.key_to_node[key] = node
            self.ll.append(node)

            if self.ll.len > self.capacity:
                node = self.ll.head.nxt
                self.ll.remove(node)
                del self.key_to_node[node.key]
        else:
            self.get(key)
            self.key_to_node[key].val = value
        


# Your LRUCache object will be instantiated and called as such:
# obj = LRUCache(capacity)
# param_1 = obj.get(key)
# obj.put(key,value)
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
