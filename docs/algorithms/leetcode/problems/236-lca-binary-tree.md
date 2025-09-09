# 236. Lowest Common Ancestor of a Binary Tree

## Problem

[LeetCode 236](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/)

Given a binary tree, find the lowest common ancestor (LCA) of two given nodes in the tree.

The LCA is defined as: "The lowest common ancestor is the node that is the deepest node that has both p and q as descendants (where we allow a node to be a descendant of itself)."

**Constraints:**
- The number of nodes in the tree is in the range `[2, 10^5]`
- `-10^9 <= Node.val <= 10^9`
- All `Node.val` are unique
- `p != q`
- `p` and `q` exist in the tree

## Solutions

### Solution 1: Path Comparison

Store paths from root to both nodes, then find where they diverge.

```python
class Solution:
    def lowestCommonAncestor(self, root: 'TreeNode', p: 'TreeNode', q: 'TreeNode') -> 'TreeNode':
        tmp_path = []
        path1 = []
        path2 = []
        
        def dfs(node):
            nonlocal path1, path2
            if not node:
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
        
        # Align paths by length
        while len(path1) != len(path2):
            if len(path1) > len(path2):
                path1.pop()
            else:
                path2.pop()
        
        # Find common ancestor
        while path1[-1] != path2[-1]:
            path1.pop()
            path2.pop()
        
        return path1[-1]
```

**Complexity:**
- Time: O(n) - Visit each node once
- Space: O(n) - Store paths

### Solution 2: Recursive (Elegant)

The most elegant solution using post-order traversal.

```python
class Solution:
    def lowestCommonAncestor(self, root: 'TreeNode', p: 'TreeNode', q: 'TreeNode') -> 'TreeNode':
        if root in (None, p, q):
            return root
        
        left = self.lowestCommonAncestor(root.left, p, q)
        right = self.lowestCommonAncestor(root.right, p, q)
        
        if left and right:
            return root  # Found p and q in different subtrees
        
        return left or right  # Found in one subtree or neither
```

**Key Insights:**
- If current node is `p` or `q`, return it
- If both subtrees return non-null, current node is LCA
- If only one subtree returns non-null, propagate it up
- Post-order traversal ensures we process children before parent

### Solution 3: Binary Lifting (Multiple Queries)

For multiple LCA queries, preprocess the tree for O(log n) query time.

```python
class Solution:
    def lowestCommonAncestor(self, root: 'TreeNode', p: 'TreeNode', q: 'TreeNode') -> 'TreeNode':
        from collections import defaultdict
        
        # Binary lifting setup
        MAX_LOG = 20  # log2(10^5) ≈ 17
        parent = defaultdict(lambda: [root] * MAX_LOG)
        depth = {}
        
        # DFS to set up parent pointers and depths
        def dfs(node, par, d):
            if not node:
                return
            
            depth[node] = d
            parent[node][0] = par
            
            # Build binary lifting table
            for i in range(1, MAX_LOG):
                if parent[node][i-1]:
                    parent[node][i] = parent[parent[node][i-1]][i-1]
            
            dfs(node.left, node, d + 1)
            dfs(node.right, node, d + 1)
        
        dfs(root, None, 0)
        
        # LCA query using binary lifting
        def lca(a, b):
            # Make 'a' the deeper node
            if depth[a] < depth[b]:
                a, b = b, a
            
            # Lift 'a' to same level as 'b'
            diff = depth[a] - depth[b]
            for i in range(MAX_LOG):
                if diff & (1 << i):
                    a = parent[a][i]
            
            if a == b:
                return a
            
            # Binary search for LCA
            for i in range(MAX_LOG - 1, -1, -1):
                if parent[a][i] != parent[b][i]:
                    a = parent[a][i]
                    b = parent[b][i]
            
            return parent[a][0]
        
        return lca(p, q)
```

**Complexity:**
- Preprocessing: O(n log n) time, O(n log n) space
- Query: O(log n) time
- Efficient for multiple queries on the same tree

## Pattern Recognition

### LCA Variants

1. **LCA in BST** - [235. LCA of BST](235-lca-bst.md)
   - Can use BST properties for optimization
   
2. **LCA with Parent Pointers** - [1650. LCA III](1650-lca-iii.md)
   - Convert to linked list intersection problem

3. **LCA in DAG** - General directed graphs
   - More complex, may have multiple LCAs

### When to Use Each Approach

| Scenario | Best Approach | Time | Space |
|----------|--------------|------|-------|
| Single query | Recursive | O(n) | O(h) |
| Multiple queries, same tree | Binary Lifting | O(log n) per query | O(n log n) |
| Need path information | Path Storage | O(n) | O(h) |
| BST | Use BST properties | O(h) | O(1) |

## Common Pitfalls

1. **Not handling null nodes** - Check base cases
2. **Assuming balanced tree** - Height can be O(n) in worst case
3. **Parent pointer confusion** - In binary lifting, parent[node][i] means 2^i-th ancestor

## Interview Tips

1. **Clarify requirements**:
   - Single query or multiple?
   - Is it a BST?
   - Do nodes have parent pointers?

2. **Start simple**: Present recursive solution first

3. **Optimize if needed**: Mention binary lifting for multiple queries

4. **Edge cases**:
   - One node is ancestor of the other
   - Root is one of the nodes
   - Nodes at different depths

## Related Problems

- [235. LCA of a Binary Search Tree](235-lca-bst.md) - Easier, uses BST properties
- [1644. LCA of a Binary Tree II](1644-lca-ii.md) - Nodes may not exist
- [1650. LCA of a Binary Tree III](1650-lca-iii.md) - With parent pointers
- [1676. LCA of a Binary Tree IV](1676-lca-iv.md) - Multiple nodes
- [2096. Step-By-Step Directions](2096-directions.md) - Find path between nodes

## Advanced Applications

### 1. Distance Between Nodes
```python
def distance(root, p, q):
    lca_node = lowestCommonAncestor(root, p, q)
    return depth(p) + depth(q) - 2 * depth(lca_node)
```

### 2. Path Between Nodes
```python
def findPath(root, p, q):
    lca_node = lowestCommonAncestor(root, p, q)
    path_to_p = getPath(lca_node, p)
    path_to_q = getPath(lca_node, q)
    return reversed(path_to_p) + path_to_q[1:]  # Avoid duplicating LCA
```