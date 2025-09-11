---
tags:
  - LeetCode
  - Algorithm
  - Linked-List
---

# 21. Merge Two Sorted Lists

## 문제

[LeetCode 21](https://leetcode.com/problems/merge-two-sorted-lists/) • **Easy**

## 핵심 아이디어

매우 유명한 문제입니다.

가장 무작정 푸는 법은 두 리스트을 연결하고 소팅 알고리즘을 사용하면 될 것 같습니다.

하지만 이 방법은 주어진 조건을 제대로 활용하지 않는 것 입니다.

대부분의 문제에서 이미 입력이 소팅되어 있다면 이 주어진 정보을 이용해서 보다 효율적으로 풀 수가 있습니다.

항상 문제을 풀 때 주어진 조건을 최대한 활용하는 것이 좋습니다.

우리가 원하는 정답 리스트의 맨 처음 헤더는 두 링크드 리스트의 헤더 2개 중 1개 가 될 것 입니다.

헤더 2개중 더 작은 것이 우리가 원하는 정답이 되겟죠.

이제 그 헤더 1개을 사용하고 남은 링크드 리스트을 생각하여 봅시다. 이 뒤에 이어질 링크드 리스트는 남은 링크드 리스트로 만들어진 리스트의 소팅된 값 입니다.

대략적으로 밑처럼 표현될 것 입니다.

## Solution

```python
mergeTwoLists(l1, l2):
# l1, l2 의 header 중에서 에서 더 작은것을 header 라고 하자.
header = min(l1.header, l2.header)
# 그리고 그 header 을 l1 or l2 에서 제거
l1.delete(header) or l2.delete(header)
# 나머지 리스트을 소팅
header.next = mergeTwoLists(l1, l2) 
```

이걸 코드로 나타내면 밑의 코드가 됩니다.

시간 복잡도는 `O(N)` 공간 복잡도는 `O(N)` 이 되겠습니다. 재귀 함수의 호출 또한 공간복잡도을 차지하기 때문입니다.

```python
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def mergeTwoLists(self, l1: ListNode, l2: ListNode) -> ListNode:
        if l1 == None:
            return l2
        if l2 == None:
            return l1
        if l1.val > l2.val:
            header = l2
            l2 = l2.next
        else:
            header = l1
            l1 = l1.next
            
        header.next = self.mergeTwoLists(l1, l2)
        return header
```

공간복잡도의 최적화을 위해서 재귀함수을 사용하지 않고 문제을 풀어봅시다.

밑의 코드는 공간복잡도 `O(1)` 이 됩니다.

```python
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def mergeTwoLists(self, l1: ListNode, l2: ListNode) -> ListNode:
   # 맨 처음의 header 을 l1, l2 중 한개을 잡아야 하지만 가독성을 위해서 dump 헤더을 한개 만듭니다.
        header= ListNode()
        cur = header
        while l1 != None and l2 != None:
            if l1.val < l2.val:
                cur.next = l1
                l1 = l1.next
            else:
                cur.next = l2
                l2 = l2.next
            cur = cur.next
        
        if l1 != None:
            cur.next = l1
        else:
            cur.next = l2
        return header.next
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
