---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Stack
---

# 889. Construct Binary Tree from Preorder and Postorder Traversal

## 문제

[LeetCode 889](https://leetcode.com/problems/construct-binary-tree-from-preorder-and-postorder-traversal/) •**Hard**

## 핵심 아이디어

일단 가장 먼저 알아야 할 것은 규칙이다.

어떤 특정 val 이 pre 의 1번째에 존재하고 post 의 5번째에 존재한다면 그 node 의 child 는 pre 의 2번째부터, post 의 0~4 번째의 val 이다. pre 에서는 child 가 나중에 나오고 post 에서는 먼저나온다.

이 특성을 이용하자.

## Solution

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution:
    def constructFromPrePost(self, pre: List[int], post: List[int]) -> TreeNode:
        if len(pre) == 0: return None
        node = TreeNode(pre[0])
    # node 의 child 는 pre[1:], post[:-1] 사이에 존재한다.
    # node.left 의 pre index 을 L 이라고 하자.
    # 마찬가지로 node.left 는 pre[1:L+1], post[:L] 으로 만들 수 있다.
        if len(pre) == 1: return node
    # index 가 O(N) 이여서 전체는 O(N^2)
        L = post.index(pre[1])+1
        node.left = self.constructFromPrePost(pre[1:L+1], post[:L])
        node.right = self.constructFromPrePost(pre[L+1:], post[L:-1])
        return node
```

간단한 최적화.

```python
class Solution:
    def constructFromPrePost(self, pre: List[int], post: List[int]) -> TreeNode:
        pre_idx, post_idx = 0, 0
        def dfs():
            nonlocal pre_idx, post_idx
            node = TreeNode(pre[pre_idx])
            pre_idx+=1
            
            if node.val != post[post_idx]:
                node.left = dfs()
            if node.val != post[post_idx]:
                node.right = dfs()
            post_idx+=1
            return node
        return dfs()
```

곰곰히 생각해보면 pre 로 시작해서 post 로 끝난다는 점을 사용할 수 있다.

pre 는 무조건 node 을 만든다. post 에서 현재 node 가 끝나는걸 판단해서 stack 에서 pop 한다.

```python
class Solution:
    def constructFromPrePost(self, pre: List[int], post: List[int]) -> TreeNode:
        st = [TreeNode(pre[0])]
        post_idx=0
        for val in pre[1:]:
            node = TreeNode(val)
            while st[-1].val == post[post_idx]:
                st.pop()
                post_idx+=1
            if st[-1].left == None:
                st[-1].left = node
            else :
                st[-1].right = node
            st.append(node)
        return st[0]
```

약간 설명이 복잡하지만 알면 좋은 유형이다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
