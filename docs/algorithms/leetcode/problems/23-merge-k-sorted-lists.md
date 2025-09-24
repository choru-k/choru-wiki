---
tags:
  - LeetCode
  - Algorithm
  - Heap
  - Linked-List
---

# 23. Merge k Sorted Lists

## 문제

[LeetCode 23](https://leetcode.com/problems/merge-k-sorted-lists/) •**Easy**

## 핵심 아이디어

[https://leetcode.com/problems/merge-k-sorted-lists/](https://leetcode.com/problems/merge-k-sorted-lists/)

매우 유명한 문제입니다.

그리고 21번 알고리즘을 그대로 사용할 수 있습니다.

21번 문제에서는 2개의 list 에서만 merge 을 햇지만 이번에는 k 개의 list 에 대해서 해야합니다.

어떠한 방법이 있을까요?

가장 간단한 방법은 k 개의 리스트을 순회하면서 가장 작은 node 을 찾고 그 node 을 정답 list 에 연결한 후,

원래의 list 에서 그 노드을 삭제.

이것을 반복하면 됩니다.

이 방법을 구현한게 밑의 코드 입니다.

리스트들의 평균 길이을 `n` 이라고 할 때, 시간 복잡도는 `O(n*k*k)` 이 됩니다. 총 `k*n` 개의 원소가 있고, 한개의 원소을 추가할 때 `O(k)` 만큼의 시간복잡도가 필요합니다.

## Solution

```python
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def mergeKLists(self, lists: List[ListNode]) -> ListNode:
        head = ListNode()
        cur = head
        lists = [lis for lis in lists if lis != None]
        while len(lists) > 0:
            min_lis = None
            min_idx = None
            for i, lis in enumerate(lists):
                if min_lis == None or lis.val < min_lis.val:
                    min_lis = lis
                    min_idx = i
            cur.next = min_lis
            cur = cur.next
            lists[min_idx] = lists[min_idx].next
            if lists[min_idx] == None:
                lists.pop(min_idx)
        return head.next
```

이제 위의 방법을 조금 더 최적화 해봅시다.

우리는 최솟값을 매번 반복문을 통해 찾습니다. 이걸 보다 효율적으로 찾는 방법이 있을까요?

예. heap 을 사용하면 됩니다.

밑의 코드의 시간 복잡도는 `O(n*k*logk)` 가 됩니다.

공간복잡도는 어떻게 될까요? 힙을 유지해야 하기 때문에 `O(k)` 라고 할 수 있겠군요.

```python
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def mergeKLists(self, lists: List[ListNode]) -> ListNode:
        head = ListNode()
        cur = head
        
        pq = [(lis.val, i) for i, lis in enumerate(lists) if lis != None]
        heapq.heapify(pq)
        while len(pq) > 0:
            _, i = heapq.heappop(pq)
            lis = lists[i]
            cur.next = lis
            cur = cur.next
            if lis.next != None:
                lis = lis.next
                lists[i] = lis
                heapq.heappush(pq, (lis.val, i))
            
        return head.next
```

이제 merge sort 을 사용해서 풀어보도록 합시다.

우리는 이미 2개의 리스트가 주어졌을 때 정렬하는 `mergeTwoLists` 가 있습니다.

이것을 어떻게 사용할 수 있을까요?

- lists 을 앞, 뒤 절반으로 나눈다.
- 각각에 대해서 mergeKLists 을 한다.
- 이제 앞, 뒤에 대해서 정렬된 리스트 2개을 가지고 있으므로, mergeTwoLists 을 사용한다.

이것을 구현한 것이 밑의 코드 입니다. 시간복잡도는 `O(n*k*logk)` 가 됩니다.

공간 복잡도는 어떻게 될까요? mergeKList 의 재귀의 깊이가 `O(logk)` 가 되기 때문에 공간 복잡도는 `O(logk)` 가 될 것 같습니다.

```python
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def mergeKLists(self, lists: List[ListNode]) -> ListNode:
        if len(lists) == 0:
            return None
        if len(lists) == 1:
            return lists[0]
        k = len(lists)
        l1, l2 = self.mergeKLists(lists[:k//2]), self.mergeKLists(lists[k//2:])
        lis = self.mergeTwoLists(l1, l2)
        return lis
    
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

이제 공간복잡도을 최적화 하겠습니다. 그 전의 148 문제와 마찬가지로 우리는 Top-Down 재귀을 Bottom-up 반복문으로 바꿀 수 있습니다.

밑의 코드는 공간 복잡도 `O(1)` , 시간 복잡도 `O(n*k*logk)` 의 코드입니다.

```python
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
class Solution:
    def mergeKLists(self, lists: List[ListNode]) -> ListNode:
        if len(lists) == 0:
            return None
        k = len(lists)
        l = 1
        while l < k:
            for i in range(0, k, l*2):
                if i+l < k:
                    l1 = lists[i]
                    l2 = lists[i+l]
                    lis = self.mergeTwoLists(l1, l2)
                    lists[i] = lis
                    lists[i+l] = None
            l *= 2
        return lists[0]
    
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

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
