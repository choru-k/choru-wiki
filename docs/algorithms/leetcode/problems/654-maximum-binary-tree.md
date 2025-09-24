---
tags:
  - LeetCode
  - Algorithm
  - Monotonic-Stack
---

# 654. Maximum Binary Tree

## 문제

[LeetCode 654](https://leetcode.com/problems/maximum-binary-tree/) •**Hard**

일단 가장 쉬운 방법은 dfs 을 사용해서 구현 하는 방법이다. 하라는 그대로 가장 큰 값을 찾고, 그것을 기준으로 왼쪽, 오른쪽을 다시 트리로 만든다.

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, val=0, left=None, right=None):
#         self.val = val
#         self.left = left
#         self.right = right
class Solution:
    def constructMaximumBinaryTree(self, nums: List[int]) -> TreeNode:
        if len(nums) == 0:
            return None
        max_idx = max(range(len(nums)), key=lambda i: nums[i])
        # print(nums[max_idx])
        node = TreeNode(nums[max_idx])
        node.left = self.constructMaximumBinaryTree(nums[:max_idx])
        node.right = self.constructMaximumBinaryTree(nums[max_idx+1:])
        return node
```

## 최적화

조금 더 생각해보자. 이 문제을 monotonicity 하게 풀수 있을까?

만약 어떠한 값이 나왔을 때 이 값이 그 전에 나왔던 값 중 에서 제일 큰 값이라면, 그 전에 나왔던 숫자들이 만든 트리는 가장 큰 값이 만든 노드의 왼쪽에 위치 할 것이다.

그리고 만들어진 트리는 leaf 가 추가 될일이 없다. 왜냐하면 방금 값보다 더 큰값이 나오면 parent 로써 추가가 되고, 더 작은 값이 나오면 right 의 leaf 로 추가될 것이기 때문이다.

![[82F53FDE-7450-4A9B-9473-44FD2E7F49F9.jpeg]]

전체적으로 보았을 때 위의 1,2 과정을 번갈아 가면서 트리을 만든다는 것을 알 수가 있다.

위의 그림과 아래의 코드을 같이 보면서 이해하면 보다 이해하기 쉬울 것이다.

```python
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, val=0, left=None, right=None):
#         self.val = val
#         self.left = left
#         self.right = right
class Solution:
    def constructMaximumBinaryTree(self, nums: List[int]) -> TreeNode:
        st = []
        for num in nums:
            last = None
            while len(st) > 0 and st[-1].val < num:
                last = st.pop()
            node = TreeNode(num)
      # 즉 새로 만들어진 노드는, st[-1].val > num 을 만족한다.
      # 그래서 st[-1]의 오른쪽에 놓이게 된다.
      # 만약 len(st) == 0 이라면 이 node 가 root 의 후보가 된다.
            if len(st) > 0:
                st[-1].right = node
      # 갑이 1개라도 빠졋다면 이 값이 현재 노드의 left 가 된다.
      # 왜냐하면 [root후보, 어떠한 작은값들 .... , node] 의 형태가 되어있고
      # root후보 > 어떠한 작은 값들 < node 의 형태로 되어잇다.
      # 그리고 root후보 > node 이기 때문에
      # 먼저 root후보 값을 선택하고 그 뒤 node 을 선택할 것이다.
      # 그렇기 때문에 root후보의 right에 node 가 들어가고
      # 어떠한 작은 갑들 이 만든 트리가 node 의 left 에 들어갈 것이다.
            if last != None:
                node.left = last
            
            st.append(node)
        
        return st[0]
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
