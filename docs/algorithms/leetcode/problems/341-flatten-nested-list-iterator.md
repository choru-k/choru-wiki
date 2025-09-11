---
tags:
  - LeetCode
  - Algorithm
  - Stack
---

# 341. Flatten Nested List Iterator

## 문제

[LeetCode 341](https://leetcode.com/problems/flatten-nested-list-iterator/) • **Medium**

## 핵심 아이디어

어렵다기 보다는 주어진 Class 을 잘 활용해야 하는 문제이다.

`hasNext` 는 현재 stack 을 Integer 가 있는 곳으로 데려다 준다. 즉 hasNext 뒤에는 `self.stack[-1]` 에는 Integer 의 index 가 존재하게 된다.

## Solution

```python
class NestedIterator(object):

    def __init__(self, nestedList):
        """
        Initialize your data structure here.
        :type nestedList: List[NestedInteger]
        """
        self.stack  = []
        self.stack.append([nestedList, 0])
        

    def next(self):
        """
        :rtype: int
        """
        self.hasNext()
        nestedList, i = self.stack[-1]
        self.stack[-1][1]+=1
        return nestedList[i]
        

    def hasNext(self):
        """
        :rtype: bool
        """
        while len(self.stack) > 0:
            nestedList, i = self.stack[-1]
            if len(nestedList) == i:
                self.stack.pop()
            else:
                if nestedList[i].isInteger():
                    return True
                self.stack[-1][1]+=1
                self.stack.append([nestedList[i].getList(), 0])
        return False
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
