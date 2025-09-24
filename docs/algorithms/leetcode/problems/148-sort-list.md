---
tags:
  - LeetCode
  - Algorithm
  - Sorting
---

# 148. Sort List

## 문제

[LeetCode 148](https://leetcode.com/problems/sort-list/) •**Medium**

일반적인 소팅알고리즘 중에서 효율적인 소팅 알고리즘은

`quick sort`, `merge sort`, `heap sort` 가 있습니다.

일단 `heap sort` 은 사용하기 매우 힘들어 보입니다. 물론 list 라는 자료구조을 생각하지 않고 heap 을 사용할 수는 있지만 그러면 아예 리스트을 배열로 바꾸고 소팅을 한 다음에 다시 리스트로 바꾼다라는 선택지도 존재하니까요.

여기서는 최대한 링크드 리스트의 형태을 유지하면서 소팅을 해보자 합니다.

`quick sort` 는 가능합니다. 물론 좋은 방법 같구요

`merge sort` 또한 가능할 것 같습니다. 그리고 21번 문제에서 만든 코드을 그래도 사용할 수 있을 것 같다는 점도 매우 마음에 드네요.

그렇다면 어떻게 `merge sort` 을 사용할 수 있을까요?

1. 링크드 리스트을 절반 길이로 나눕니다.
2. 각각을 소팅합니다.
3. 그리고 각각 소팅한 링크드 리스트을 합칩니다.

여기서 3번 과정은 21 번 문제에서 만든 코드 그대로 이군요.

그리고 각각을 소팅합니다는 원래 문제와 동일합니다.

즉 우리가 만들어야 하는 코드는 1번 `링크드 리스트을 절반길이로 나눕니다` 만 하면 될것 같습니다.

링크드 리스트을 절반 길이로 나누는 법은

- 길이를 세고 절반길이로 나눈다
- slow, fast 포인터을 사용한다

2가지 방법이 있습니다만 저는 길이을 세고 절반 길이로 나누기을 사용하겠습니다.(다음 최적화에서 코드을 그래도 사용하고 싶기 때문이죠.) 혹시 slow, fast 포인터을 사용해서 절반으로 나누는 방법을 모르시는 분들은 가장 밑의 번외을 봐주세요.

위의 방법을 정리해서 코드로 나타내면 밑의 코드가 됩니다.

시간 복잡도는 `O(NlogN)` 그리고 공간 복잡도는 `O(logN)` 이 될 것 같습니다. 왜냐하면 재귀의 깊이가 `logN` 이 되기 때문입니다.

```python
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def sortList(self, head: ListNode) -> ListNode:
        
        if head == None or head.next == None:
            return head
        l1, l2 = self.splitListHalf(head)
        l1 = self.sortList(l1)
        l2 = self.sortList(l2)
        sortedList = self.mergeTwoLists(l1, l2)
        return sortedList
    
    def splitListHalf(self, head: ListNode):
        l = self.getListLen(head)
        l1, l2 = self.splitListK(head, l // 2)
        return l1, l2
    
    def getListLen(self, head):
        l = 0
        cur = head
        while cur != None:
            cur = cur.next
            l += 1
        return l
    
    def splitListK(self, head: ListNode, k: int):
        cur = head
        l = 0
        while cur != None and l < k-1:
            cur = cur.next
            l+=1
        l1 = head
        if cur != None:
            l2 = cur.next
            cur.next = None
        else:
            l2 = None
        return l1, l2
    
    def mergeTwoLists(self, l1: ListNode, l2: ListNode) -> ListNode:
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

이제 공간복잡도를 보다 최적화 하도록 하겠습니다.

그 전의 문제에서도 재귀로 된 방법에서 공간복잡도을 최적화 하기 위해서 반복문의 형태로 바꾸었습니다.

즉 Top-down 방식에서 Bottom-up 방식으로 바꾸어야 합니다.

이번에도 동일하게 진행하도록 하겠습니다.

```python
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def sortList(self, head: ListNode) -> ListNode:
        dump = ListNode()
        dump.next = head
        l = self.getListLen(head)
        k = 1
    # 길이 k 인 리스트 두개을 정렬시켜서 합칩니다.
    
        while k < l:
            prev = dump
            cur = dump.next
            while cur != None:
                l1, cur = self.splitListK(cur, k)
                l2, cur = self.splitListK(cur, k)
                h, t = self.mergeTwoLists(l1, l2)
                prev.next = h
                if t != None:
                    t.next = cur
                prev = t
                
            k *= 2
        return dump.next
    
    
    def getListLen(self, head):
        l = 0
        cur = head
        while cur != None:
            cur = cur.next
            l += 1
        return l

    def splitListK(self, head: ListNode, k: int):
        cur = head
        l = 0
        while cur != None and l < k-1:
            cur = cur.next
            l+=1
        l1 = head
        if cur != None:
            l2 = cur.next
            cur.next = None
        else:
            l2 = None
        return l1, l2
    
    def mergeTwoLists(self, l1: ListNode, l2: ListNode) -> ListNode:
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
        while cur.next != None:
            cur = cur.next
        # head 와 tail 을 반환.
        return header.next, cur
```

## 번외 Slow, Fast pointer

위의 방법으로 Linked List 을 절반으로 나눌 수 있지만 Slow, Fast Pointer 기법을 사용할 수도 있습니다.

밑의 방법은 slow 은 1칸씩, fast 는 2칸씩 이동합니다. fast 가 List 의 끝에 도달했을 때 slow 는 List의 중간에 도달하게 됩니다. 이러한 기법은 여러 경우에 사용됩니다.

```python
def splitListHalf(head):
    slow = head
    fast = head.next

    while fast != None and fast.next != None:
        slow = slow.next
        fast = fast.next.next
    return head, slow
```

Linked List 에서 끝에서 K 번째 원소 구하기. Linked List 에서 Cycle 검출 등의 방법에서도 사용됩니다.

Leetcode 에 많은 예제 문제가 존재하니 풀어보면 좋을 것 같습니다.

```python
def getLastK(head, k):
    slow = fast = head
    for _ in range(k):
        fast = fast.next

    while fast != None:
        slow = slow.next
        fast = fast.next
    return slow

def hasCycle(head):
    slow = head
    fast = head.next

    while (fast != None and fast.next != None) or slow != fast:
        fast = fast.next.next
        slow = slow.next

    if slow == fast:
        return True
    return False
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
