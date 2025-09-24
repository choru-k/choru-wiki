---
tags:
  - LeetCode
  - Algorithm
  - Hash-Table
---

# 106. Construct Binary Tree from Inorder and Postorder Traversal

## 문제

[LeetCode 106](https://leetcode.com/problems/construct-binary-tree-from-inorder-and-postorder-traversal/) •**Medium**

## 핵심 아이디어

일단 쉽게 푸는 방법부터 생각해 보자.

`postorder` 가 root 가 된다는 것은 쉽게 알 수 있다. inorder 에서는 postorder 을 기준으로 left, right 가 나뉘게 된다. 이것을 recursive 하게 풀어내면 밑의 답이 된다.

## Solution

```python
class Solution:
    def buildTree(self, inorder: List[int], postorder: List[int]) -> TreeNode:
        def build(lis):
            if len(lis) == 0:
                return None
            node = TreeNode(postorder.pop())
            mid = lis.index(node.val)
            node.right = build(lis[mid+1:])
            node.left = build(lis[:mid])
             
            return node
        return build(inorder)
```

위의 알고리즘의 시간 복잡도는 O(N^2) 가 된다. 왜냐하면 list 을 자르는 작업과 mid을 찾는 작업이 O(N) 이기 때문이다.

이것을 좀더 보완해보자. list 을 잘라서 인수로 주는 대신 list 의 범위를 인수로 줘보자.

```python
class Solution:
    def buildTree(self, inorder: List[int], postorder: List[int]) -> TreeNode:        
        def build(l, r):
            if l >= r:
                return None
            node = TreeNode(postorder.pop())
            
            mid = inorder.index(node.val)
            node.right = build(mid+1, r)
            node.left = build(l, mid)
             
            return node
        return build(0, len(inorder))
```

mid 을 찾는 과정을 O(1) 에 찾을수 있는 방법은 hash 을 이용하는 것이다.

```python
class Solution:
    def buildTree(self, inorder: List[int], postorder: List[int]) -> TreeNode:
        inorder_map = {num: i for i, num in enumerate(inorder)}
        
        def build(l, r):
            if l >= r:
                return None
            node = TreeNode(postorder.pop())
            mid = inorder_map[node.val]
            node.right = build(mid+1, r)
            node.left = build(l, mid)
             
            return node
        return build(0, len(inorder))
```

이제 전체 시간복잡도가 O(N) 이 되었다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
