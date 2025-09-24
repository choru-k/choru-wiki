---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Dynamic-Programming
  - Greedy
---

# 968. Binary Tree Cameras

## 문제

[LeetCode 968](https://leetcode.com/problems/binary-tree-cameras/) •**Medium**

## 핵심 아이디어

문제 자체는 심플하다.

이 문제는 3가지 경우의 수로 풀 수가 있다.

특정 Node 에서,

1. 자신이 카메라를 설치할 때,
2. 자신의 children 이 카메라를 설치할 때
3. 자신의 children 은 카메라를 설치 하지 않을 때

만약 자신이 카메라를 설치한다면, 자신의 children 은 카메라를 설치할 필요가 없다.

그리고 만약 자신의 children 이 카메라를 설치한다면, 자신은 카메라를 설치할 필요가 없다.

이걸 이용해보자.

만약 반환값이 `(자신이 카메라를 설치할 때, 자신의 children 이 카메라를 설치할 때, 자신의 children이 카메라를 설치하지 않을 때)` 의 필요한 카메라의 수라고 해보자.

그렇다면, 쉽게 점화식을 세울 수 있다.

## Solution

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, val=0, left=None, right=None):
#         self.val = val
#         self.left = left
#         self.right = right
class Solution:
    def minCameraCover(self, root: TreeNode) -> int:
        # Cover parent, Cover me, Cover children
        def dfs(node):
            if node == None:
                return (1, 0, 0)
            if node.left == node.right == None:
                return (1, 1, 0)
            l, r= dfs(node.left), dfs(node.right)
            return (
        # 자신이 카메라를 설치하기 때문에 l, r 은 가장 작은걸 선택해도 상관이 없다.
                min(l)+min(r) + 1,
        # 자신이 카메라를 설치하지 않기 때문에, children 중에서 parent 을 포함시켜줘야 한다.
        # left 가 카메라를 설치할 때, right 가 카메라를 설치할 때, 2가지 경우의 수가 있다.
                min(l[0]+min(r[:2]), r[0]+min(l[:2])),
        # 자신이 카메라를 설치하지 않기 때문에, 각 children 이 포함되는 가장 작은 걸 선택.
                min(l[:2]) + min(r[:2])
            )
        ret = dfs(root)
        # print(ret)
        return min(ret[:2])
```

또는 항상 최적을 구하는 방법을 생각할 수가 있다.

각 경우에 대해서 최대한 카메라를 설치 안하는 방향으로 진행하면 된다.

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, val=0, left=None, right=None):
#         self.val = val
#         self.left = left
#         self.right = right
class Solution:
    def minCameraCover(self, root: TreeNode) -> int:
        CAMERA_HERE = 0
        COVER = 1
        NOT_COVER = 2
        def dfs(node):
            if node == None:
                return COVER, 0
            l_s, l_c = dfs(node.left)
            r_s, r_c = dfs(node.right)
      # 자식 중에서 1개라도 COVER 가 안되었다면 여기에 카메라를 설치
            if l_s == NOT_COVER or r_s == NOT_COVER:
                return CAMERA_HERE, 1 + l_c + r_c
      # 자식 중에서 1개라도 parent 을 COVER 한다면 카메라 설치 필요 없음
            if l_s == CAMERA_HERE or r_s == CAMERA_HERE:
                return COVER, l_c + r_c
      # 자식들은 COVER 가 되었지만, 본인은 COVER 가 안됨.
            return NOT_COVER, l_c + r_c
        s, c = dfs(root)
    # root 가 COVER 가 안되었다면 카메라 설치. 
        return c + (s == NOT_COVER)
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
