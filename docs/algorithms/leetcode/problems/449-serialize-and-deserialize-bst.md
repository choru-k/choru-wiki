---
tags:
  - LeetCode
  - Algorithm
  - DFS
---

# 449. Serialize and Deserialize BST

## 문제

[LeetCode 449](https://leetcode.com/problems/serialize-and-deserialize-bst/) • **Medium**

## 핵심 아이디어

BST 가 아닌 일반적인 트리의 경우

[https://leetcode.com/problems/serialize-and-deserialize-binary-tree/](https://leetcode.com/problems/serialize-and-deserialize-binary-tree/)

이지만 BST 의 경우 좀더 최적화가 가능하다.

Header 만 안다면 특정 value 가 left 에 존재할 지, right 에 존재 할 지 알 수가 있다.

즉 header 가 어디에 있는지가 중요하고, 그걸 맨 앞으로 둔다.

그 뒤에 header 에 맞춰서 left, right 을 구분해 주자.

## Solution

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Codec:

    def serialize(self, root: TreeNode) -> str:
        """Encodes a tree to a single string.
        """
        vals = []
        def preorder(node):
            if node != None:
                vals.append(str(node.val))
                preorder(node.left)
                preorder(node.right)
        preorder(root)
        return ",".join(vals)
    def deserialize(self, data: str) -> TreeNode:
        """Decodes your encoded data to tree.
        """
        if data == '':
            return None
        vals = collections.deque(map(int, data.split(',')))
        def build(min_val, max_val):
            if len(vals)>0 and min_val < vals[0] < max_val:
                val = vals.popleft()
                node = TreeNode(val)
                node.left = build(min_val, val)
                node.right = build(val, max_val)
                return node
        return build(float('-inf'), float('inf'))
                
        

# Your Codec object will be instantiated and called as such:
# codec = Codec()
# codec.deserialize(codec.serialize(root))
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
