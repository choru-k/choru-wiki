---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 236. Lowest Common Ancestor of a Binary Tree

## 문제

[LeetCode 236](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/) • **Medium**

## 핵심 아이디어

전형적인 LCA 문제이다.

이러한 문제를 받았을 때, 일단 LCA 을 한번만 구하는지, 또는 여러번 구하는지가 중요하다.

  

만약 한번만 구한다고 할 때는 단순하게 DFS 을 통해 구할 수 있다. path 을 저장하고, 높이를 맞춘 뒤 한개씩 빼내는 방식이다. 시간복잡도는 `O(N)` 공간복잡도도 `O(N)` 이다.

## Solution

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution:
    def lowestCommonAncestor(self, root: 'TreeNode', p: 'TreeNode', q: 'TreeNode') -> 'TreeNode':
        tmp_path = []
        path1 = []
        path2 = []
        
        def dfs(node):
            nonlocal path1
            nonlocal path2
            if node == None:
                return
            tmp_path.append(node)
            
            if node == p:
                path1 = list(tmp_path)
            if node == q:
                path2 = list(tmp_path)
            dfs(node.left)
            dfs(node.right)
            tmp_path.pop()
        dfs(root)
        
        while len(path1) != len(path2):
            if len(path1) > len(path2):
                path1.pop()
            else:
                path2.pop()
        
        
        
        while True:
            if path1[-1] == path2[-1]:
                return path1[-1]    
            else:
                path1.pop()
                path2.pop()
```

  

조금 더 간단한 방법으로

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution:
    def lowestCommonAncestor(self, root: 'TreeNode', p: 'TreeNode', q: 'TreeNode') -> 'TreeNode':
				if root in (None, p, q):
            return root
        left = self.lowestCommonAncestor(root.left, p, q)
        right = self.lowestCommonAncestor(root.right, p, q)
        if left and right:
            return root

        return left or right
```

을 할 수 있다. 왼쪽과 오른쪽에 각각 p, q 가 존재한다면 root 가 정답이고, 1개만 존재하면 그 node 을 올려보낸다.

  

  

만약 여러번 구해야 한다면 우리는 전처리 과정을 통해서 시간복잡도를 줄일 수 있다.

핵심은 par 에 부모를 저장한다는 것이다. 1 번째 부모, 2번째 부보, 4 번째 부모, 8 번째 부모를 미리 저장한다면 우리가 k 번째 부모를 알고 싶을 때 `O(logN)` 에 알 수 있다.

  

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution:
    def lowestCommonAncestor(self, root: 'TreeNode', p: 'TreeNode', q: 'TreeNode') -> 'TreeNode':
        par = collections.defaultdict(lambda: [root for _ in range(21)])
        depth = dict()
        def dfs(node, level):
            depth[node] = level
            if node.left is not None:
                par[node.left][0] = node
                dfs(node.left, level + 1)
            if node.right is not None:
                par[node.right][0] = node
                dfs(node.right, level + 1)
        
        
        dfs(root, 0)
        for i in range(1, 21):
            for node in depth.keys():
                par[node][i] = par[par[node][i-1]][i-1]
        
        def lca(a, b):
            if depth[a] > depth[b]:
                a, b = b, a
            
            for i in range(20, -1, -1):
                if depth[b] - depth[a] >= pow(2, i):
                    b = par[b][i]
            if a == b:
                return a
            
            for i in range(20, -1, -1):
                if par[a][i] != par[b][i]:
                    a = par[a][i]
                    b = par[b][i]
            
            return par[a][0]
        return lca(p, q)
```

  

이 방법에서 초기화 과정 (depth 와 par 을 구하는 과정) 의 시간복잡도는 `O(N)` 그 뒤 LCA 을 구하는 과정은 `O(logN)` 이다. 또한 공간 복잡도는 `O(NlogN)` 이다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
