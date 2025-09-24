---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Work-In-Progress
---

# 846. Hand of Straights

## 문제

[LeetCode 846](https://leetcode.com/problems/hand-of-straights/) •**Hard**

## 핵심 아이디어

`O(N*LogN*W)`

## Solution

```python
class Solution:
    def isNStraightHand(self, hand: List[int], W: int) -> bool:
        d = collections.Counter(hand)
        
        for k in sorted(d.keys()):
            if d[k] == 0:
                continue
            if all([d[k+w] - d[k] >= 0 for w in range(1, W)]):
                for w in range(1,W):
                    d[k+w] -= d[k]
            else:
                return False
            
        return True
```

[https://leetcode.com/problems/hand-of-straights/discuss/135598/C++JavaPython-O(MlogM)-Complexity](https://leetcode.com/problems/hand-of-straights/discuss/135598/C++JavaPython-O(MlogM)-Complexity)

`O(NLogN)`

```python
class Solution:
    
    def isNStraightHand(self, hand, W):
            c = collections.Counter(hand)
            start = collections.deque()
            last_checked, opened = -1, 0
            for i in sorted(c):
                if opened > c[i] or opened > 0 and i > last_checked + 1: return False
                start.append(c[i] - opened)
                last_checked, opened = i, c[i]
                if len(start) == W: opened -= start.popleft()
            return opened == 0
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
