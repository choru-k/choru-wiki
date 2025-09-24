---
tags:
  - LeetCode
  - Algorithm
  - Solution-Archive
---

# 2. Add Two Numbers

## 문제

[LeetCode 2](https://leetcode.com/problems/add-two-numbers/) •**Easy**

## 핵심 아이디어

```python
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, x):
#         self.val = x
#         self.next = None

class Solution:
    def addTwoNumbers(self, l1: ListNode, l2: ListNode) -> ListNode:
        n1, n2 = l1, l2
        while n1.next != None or n2.next != None:
            if n1.next == None:
                n1.next = ListNode(0)
            if n2.next == None:
                n2.next = ListNode(0)
            n1, n2 = n1.next, n2.next
            
        ans = head = ListNode(-1)
        n1, n2 = l1, l2
        nxt = 0
        while n1 != None and n2 != None:
            nxt, val = divmod(n1.val + n2.val + nxt, 10)
            head.next = ListNode(val)
            head = head.next
            n1,n2 = n1.next, n2.next
        if nxt == 1:
            head.next = ListNode(1)
        return ans.next
```

루프 2번 도는걸 1번으로 합친거

```python
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, x):
#         self.val = x
#         self.next = None

class Solution:
    def addTwoNumbers(self, l1: ListNode, l2: ListNode) -> ListNode:

        ans = head = ListNode(-1)
        n1, n2 = l1, l2
        nxt = 0
        while True:
            nxt, val = divmod(n1.val + n2.val + nxt, 10)
            head.next = ListNode(val)
            head = head.next
            
            if n1.next == None and n2.next == None:
                break
            if n1.next == None:
                n1.next = ListNode(0)
            if n2.next == None:
                n2.next = ListNode(0)
                
            n1,n2 = n1.next, n2.next
        if nxt == 1:
            head.next = ListNode(1)
        return ans.next
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
