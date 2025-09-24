---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - DFS
---

# 222. Count Complete Tree Nodes

## 문제

[LeetCode 222](https://leetcode.com/problems/count-complete-tree-nodes/) •**Medium**

이 문제는 푸는 법이 2개가 있다.

## Binary Search

![[Attachments/E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202 5.svg|E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202 5.svg]]

의 경우를 생각해보자. 높이가 4 라는 이야기는 높이가 3까지는 다 꽉차있고 그 뒤 높이가 4 인 노드들이

`1~2^(4-1)` 개 가 존재한다는 것이다. 이제 우리가 구할 것은 `1 ~ 8` 개의 노드 중 몇개가 있냐만 보면 된다.

fully completed 하기 때문에 3번째 노드가 존재하면 1, 2 번 째 노드는 무조건 존재한다. 즉 binary search 을 할 수가 있다.

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, val=0, left=None, right=None):
#         self.val = val
#         self.left = left
#         self.right = right
class Solution:
    def is_valid(self, root, val):
        path = []
        while val > 1:
            path.append(val % 2)
            val = val // 2
        node = root
        for p in path[::-1]:
            node = node.left if p == 0 else node.right
            if node == None:
                return False
        return True
    def countNodes(self, root: Optional[TreeNode]) -> int:
        if root == None:
            return 0
        left = 1
        right = 1
        while self.is_valid(root, right):
            right *= 2
        
        while left < right:
            mid = (left + right+1) // 2
            if self.is_valid(root, mid):
                left = mid
            else:
                right = mid-1
        return left
```

## DFS

위의 방법과 비슷하지만 좀더 다르게 생각해보자.

여기서 맨위의 root 노드를 살펴보자. root→left 와 root→right 의 노드 전부 높이가 3이다.

그 말은 left 는 꽉 차있는 트리라는 것이다.

그렇기 때문에 right 에 대해서만 비교하면 된다.

다시 right 을 root 로 보고 생각하면 왼쪽은 높이가 2, 오른쪽은 높이가 1이다.

그 말은 다시 오른쪽이 꽉차있다는 것이다

![[Attachments/E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202 5.svg|E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202 5.svg]]

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution:
    def countNodes(self, root):
        if not root:
            return 0
        leftDepth = self.getDepth(root.left)
        rightDepth = self.getDepth(root.right)
        if leftDepth == rightDepth:
            return pow(2, leftDepth) + self.countNodes(root.right)
        else:
            return pow(2, rightDepth) + self.countNodes(root.left)

    def getDepth(self, root):
        if not root:
            return 0
        return 1 + self.getDepth(root.left)
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
