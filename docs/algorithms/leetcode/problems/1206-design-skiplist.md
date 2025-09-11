---
tags:
  - LeetCode
  - Algorithm
  - Linked-List
---

# 1206. Design Skiplist

## 문제

[LeetCode 1206](https://leetcode.com/problems/design-skiplist/) • **Medium**

## 핵심 아이디어

기본 개념은 [https://hoororyn.tistory.com/14](https://hoororyn.tistory.com/14) 을 참고하는 편이 좋다.

일단 가장 기본적으로 각 level 이 존재하고 확률에 따라서 어느 레벨까지 특정 노드를 존재시키는 를 조정한다.

이러면 level 0 에는 모든 node 가 존재하고 level 1 에는 n/2, level 2 에는 n/4 의 노드가 존재하고 확률적으로 총 2n 개의 node 가 존재한다.

만약 정렬된 노드를 얻고 싶을때는 level 0 의 노드들을 return 하면 된다.

## Solution

```python
class Node:
    def __init__(self, val):
        self.val=val
        self.pre=None
        self.nxt=None
        self.down=None

class Skiplist:

    def __init__(self):
        self.head = None
        prev = None
        for _ in range(17):
            node = Node(float('-inf'))
            nxt_node = Node(float('inf'))
            node.nxt, nxt_node.pre = nxt_node, node
            node.down = prev
            self.head = node
            prev = node
        
    
    def _iter(self, val):
        res = []
        cur = self.head
        while cur != None:
            while cur.nxt != None and cur.nxt.val <= val:
                cur = cur.nxt
            res.append(cur)
            cur = cur.down
        return res
        

    def search(self, target: int) -> bool:
        res = self._iter(target)
        return res[-1].val == target
        
    def add(self, num: int) -> None:
        res = self._iter(num)
        prev = None
        for pre in res[::-1]:
            node = Node(num)
            nxt = pre.nxt
            nxt.pre, pre.nxt = node, node
            node.pre, node.nxt = pre, nxt
            node.down = prev
            prev = node
      # 50퍼 확률로 그 윗단계의 레벨에도 존재하게 한다.
            if random.random() < 0.5:
                break

    def erase(self, num: int) -> bool:
        if self.search(num)== False:
            return False
        res = self._iter(num)
        for node in res:
            if node.val == num:
                node.pre.nxt, node.nxt.pre = node.nxt, node.pre
        return True


# Your Skiplist object will be instantiated and called as such:
# obj = Skiplist()
# param_1 = obj.search(target)
# obj.add(num)
# param_3 = obj.erase(num)
```

만약 n 번째 node 을 알고 싶을 때는 각 노드들의 너비 cnt 을 저장해 둔다. 이건 현재 노드와 다음 노드 까지 몇개의 node 가 skip 되었는지를 나타낸다. 이걸 통해서 쉽게 k-th element 을 구할 수 있다.

```python
class Node:
    def __init__(self, val):
        self.val=val
        self.pre=None
        self.nxt=None
        self.down=None
        self.cnt = 1

class Skiplist:

    def __init__(self):
        self.head = None
        prev = None
        for _ in range(17):
            node = Node(float('-inf'))
            nxt_node = Node(float('inf'))
            node.nxt, nxt_node.pre = nxt_node, node
            node.down = prev
            self.head = node
            prev = node
        
    
    def _iter(self, val):
        res = []
        cur = self.head
        while cur != None:
            while cur.nxt != None and cur.nxt.val <= val:
                cur = cur.nxt
            res.append(cur)
            cur = cur.down
        return res
        

    def search(self, target: int) -> bool:
        res = self._iter(target)
        return res[-1].val == target
        
    def add(self, num: int) -> None:
        res = self._iter(num)
        prev = None
        done = False
        for pre in res[::-1]:
            if done == False:
                node = Node(num)
                nxt = pre.nxt
                nxt.pre, pre.nxt = node, node
                node.pre, node.nxt = pre, nxt
                node.down = prev
                prev = node
                if random.random() < 0.5:
                    done = True
            else:
                # pre 와 nxt 사이에 1 개의 node 가 존재함.
                pre.cnt += 1

    def erase(self, num: int) -> bool:
        if self.search(num)== False:
            return False
        res = self._iter(num)
        for node in res:
            if node.val == num:
                node.pre.nxt, node.nxt.pre = node.nxt, node.pre
            else:
                node.cnt -= 1
        return True
    
    def find_nth(self, k):
        cur = self.head
        while cur != None:
            while cur.nxt != None and cur.cnt <= k:
                cur = cur.nxt
                k -= cnt
            cur = cur.down
        return cur.val


# Your Skiplist object will be instantiated and called as such:
# obj = Skiplist()
# param_1 = obj.search(target)
# obj.add(num)
# param_3 = obj.erase(num)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
