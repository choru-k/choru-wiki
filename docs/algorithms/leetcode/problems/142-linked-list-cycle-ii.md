---
tags:
  - LeetCode
  - Algorithm
  - Linked-List
---

# 142. Linked List Cycle II

## 문제

[LeetCode 142](https://leetcode.com/problems/linked-list-cycle-ii/) • **Medium**

## 핵심 아이디어

이 문제는 사실 워낙 유명한 문제여서 푸는 법 보다는 증명이 보다 중요한 것 같다.

일단 Fast 와 Slow 가 Cycle 안에서 만난 다는건 자명하다.

Slow 가 Cycle 에 들어오고 몇 바퀴째에 만날까?

정답은 1바퀴째이다.

Fast 가 Slow 을 건너뛰는것이 불가능하기 때문이다.

Fast가 Slow 을 건너뛰었다는 것은 그 전 Node 에서 만났다는 것이다.

그렇기 때문에 무조건 첫 바퀴에 만나게 된다

이제 어디에서 만나는지를 생각해보자.

![[53220251-F295-4C3F-9C22-DD0C89D081A3.jpeg]]

## Solution

```python
# Definition for singly-linked list.
# class ListNode(object):
#     def __init__(self, x):
#         self.val = x
#         self.next = None

class Solution:
    def detectCycle(self, head: Optional[ListNode]) -> Optional[ListNode]:
        if head == None or head.next == None:
            return None
        
        fast, slow = head.next.next, head.next
        while fast != None and fast.next != None and fast != slow:
            fast = fast.next.next
            slow = slow.next

        if fast != slow:
            return None
        slow = head
        while slow != fast:
            fast = fast.next
            slow = slow.next
        return slow
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
