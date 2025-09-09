---
tags:
  - LeetCode
  - Algorithm
  - DFS
---

# 99. Recover Binary Search Tree

## 문제

[LeetCode 99](https://leetcode.com/problems/recover-binary-search-tree/) • **Easy**

일단 `Inorder` 을 탐색하는 방법을 생각해보자.

`left -> mid -> right` 순으로 탐색한다.

만약 잘 정렬 되어 있는 BST 라면 `left < mid < right` 을 만족할 것이고 이를 만족하지 않는다면 그게 틀린 BST 가 될 것 이다.

`1, 2, 3, 4` 에서 `1, 3, 2, 4` 같이 연속된 숫자가 바뀔 경우 `3, 2, 1, 4` 와 같이 떨어진 숫자가 바뀔 경우를 생각하자.

일단 탐색을 하다가 두 숫자가 틀릴경우 저장을 하고 다시 틀린 부분이 나타나면 업데이트 해주는 방식으로 하자.

  

이제 InOrder 을 어떻게 구현을 할까?

밑의 방법 전부다 시간복잡도는 `O(N)` 이다. 공간 복잡도의 차이만 있다.

## 배열을 사용하는 방법 O(N)

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution:
    def recoverTree(self, root: TreeNode) -> None:
        """
        Do not return anything, modify root in-place instead.
        """
        ans = [None, None]
        def visit(prev, cur):
            nonlocal ans
            if prev != None and prev.val > cur.val:
                ans[1] = cur
                if ans[0] == None: 
                    ans[0] = prev

        def inorder(r):
            return inorder(r.left)+ [r]+ inorder(r.right) if r else []
        nodes = inorder(root)
        for i in range(len(nodes)-1):
            visit(nodes[i], nodes[i+1])
        
       
            
        ans[0].val, ans[1].val = ans[1].val, ans[0].val
```

  

## DFS 을 사용하는 방법 O(H) H:트리의 높이

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution:
    def recoverTree(self, root: TreeNode) -> None:
        """
        Do not return anything, modify root in-place instead.
        """
        ans = [None, None]
        def visit(prev, cur):
            nonlocal ans
            if prev != None and prev.val > cur.val:
                ans[1] = cur
                if ans[0] == None: 
                    ans[0] = prev

        
        prev = None
        def dfs(node):
            nonlocal prev
            if node == None:
                return
            dfs(node.left)
            visit(prev, node)
            prev = node
            dfs(node.right)   
        dfs(root)
        
        
        ans[0].val, ans[1].val = ans[1].val, ans[0].val
```

  

## Morris Traversal 을 사용하는 방법 O(1)

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution:
    def recoverTree(self, root: TreeNode) -> None:
        """
        Do not return anything, modify root in-place instead.
        """
        ans = [None, None]
        def visit(prev, cur):
            nonlocal ans
            if prev != None and prev.val > cur.val:
                ans[1] = cur
                if ans[0] == None: 
                    ans[0] = prev

        
        cur = None
        cur = root
        prev = None
        while cur:
            if cur.left == None:
                visit(prev, cur)
                prev = cur
                cur = cur.right
            else:
                pred = cur.left
                while pred.right != None and pred.right != cur:
                    pred = pred.right
                if pred.right == None:
                    pred.right = cur
                    cur = cur.left
                else:
                    visit(prev, cur)
                    prev = cur
                    pred.right = None
                    cur = cur.right
            
        ans[0].val, ans[1].val = ans[1].val, ans[0].val
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
