---
tags:
  - LeetCode
  - Algorithm
  - Linked-List
---

# 1171. Remove Zero Sum Consecutive Nodes from Linked List

## 문제

[LeetCode 1171](https://leetcode.com/problems/remove-zero-sum-consecutive-nodes-from-linked-list/description/?envType=list&envId=xfgt7zgc) • **Medium**

## 핵심 아이디어

```python
class Solution:
    def removeZeroSumSublists(self, head: Optional[ListNode]) -> Optional[ListNode]:
        dummy = ListNode(0, head)

        memo = dict()

        cur = dummy
        pre_fix_sum = 0
        while cur != None:
            pre_fix_sum += cur.val
            if pre_fix_sum in memo:
                unused_node = memo[pre_fix_sum].next

				# --------------
				# 지우는 아이템은 Hashmap 에서 잘 빼줘야 한다.
                p = pre_fix_sum + unused_node.val
                while unused_node != cur:
                    memo.pop(p)
                    unused_node = unused_node.next
                    p += unused_node.val
                # --------------
                memo[pre_fix_sum].next = cur.next
            else:
                memo[pre_fix_sum] = cur
            cur = cur.next
        return dummy.next
```


한번째 다 돌고, 그 담에 한번에 정리한다. 훨씬 깔끔한듯. 

```python
class Solution:
    def removeZeroSumSublists(self, head: Optional[ListNode]) -> Optional[ListNode]:
        state = dict()

        ps = 0
        dummy = ListNode(0, head)
        node = dummy
        while node != None:
            ps += node.val
            state[ps] = node
            node = node.next
        
        node = dummy
        ps = 0
        while node != None:
            ps += node.val
            node.next = state[ps].next
            node = node.next
        return dummy.next
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
