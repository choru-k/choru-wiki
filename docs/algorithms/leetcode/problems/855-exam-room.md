---
tags:
  - LeetCode
  - Algorithm
  - Heap
---

# 855. Exam Room

## 문제

[LeetCode 855](https://leetcode.com/problems/exam-room/) •**Hard**

## Search Linearly

chairs 을 sort 한 상태로 가지고 있다고 하면 그 다음 앉을 곳은 각 chair들의 가운데 라는 것을 알 수가 있다.

chair 을 맨 앞과 맨 뒤는 예외 케이스로 생각 하고 나머지의 경우에는 chair 들의 가운데를 비교하자.

```python
class ExamRoom:

    def __init__(self, N: int):
        self.chairs = []
        self.n = N

    def seat(self) -> int:
        N = self.n
        if len(self.chairs) == 0:
            cur = (0, float('inf'))
        else:
            if self.chairs[0] >= N-1 - self.chairs[-1]:
                cur = (0, self.chairs[0])
            else:
                cur = (N-1, N-1 - self.chairs[-1])
            for i in range(len(self.chairs)-1):
                c = (self.chairs[i+1]+self.chairs[i]) // 2
                dis = c - self.chairs[i]
                if cur[1] < dis or (cur[1] == dis and cur[0] > c):
                    cur = (c, dis)
        
        bisect.insort(self.chairs, cur[0])
        return cur[0]
        

    def leave(self, p: int) -> None:
        idx =self.chairs.index(p)
        self.chairs.pop(idx)
        # print(self.chairs)
```

## Use Heap and Hash

![[E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7.svg]]

```python
class ExamRoom:

    def __init__(self, N: int):
        self.n = N
        self.heap = []
        self.starts = dict()
        self.ends = dict()
        self.put_segment(0, N-1)
        
    # start 와 end 을 포함해서 그 사이의 좌석이 다 비어있다.
    # 그 segment 을 선택할 때 prior 을 기준으로 선택
    def put_segment(self, start, end):
        if start > end:
            return
        # 양 끝이면 끝을 선택할 것이기 때문에
        if start == 0 or end == self.n-1:
            prior = (end-start)
        else:
        # 중간을 선택할 것이기 때문에
            prior = (end-start) // 2
        
        # prior, start, end, valid 을 저장
        # valid 는 heap 의 원소를 지우는 것이 힘들기 때문에
        # heap 의 원소를 지우는것이 아니라 무시하기 위해서 사용.
        segment = [-prior, start, end, True]
        # starts 에는 각 segment 의 시작들이
        # ends 에는 각 segment 의 끝들이 저장되어 있다.
        self.starts[start] = segment
        self.ends[end] = segment
        heapq.heappush(self.heap, segment)

    def seat(self) -> int:
        valid = False
        while valid == False:
            # heap 에서 지워지지 않은 segment 찾음
            _, start, end, valid = heapq.heappop(self.heap)
        
        # 이 segment 을 사용하기 때문에 start, end 에서 지움
        del self.starts[start]
        del self.ends[end]
        # 양 끝이면 새로운 segment 가 1개씩 생김
        if start == 0:
            self.put_segment(start+1, end)
            return start
        if end == self.n-1:
            self.put_segment(start, end-1)
            return end
        
        # 중간이라면 2개의 segment 가 생김
        cur = (start+end) // 2
        self.put_segment(start, cur-1)
        self.put_segment(cur+1, end)
        return cur
        
        

    def leave(self, p: int) -> None:
        start = end = p
        # 두 segment 사이에 있는 p 을 없앤거면 2개의 segment 을 1개로 합칠 수 있음
        if p-1 in self.ends:
            self.ends[p-1][3] = False
            start = self.ends[p-1][1]
            del self.ends[p-1]
        if p+1 in self.starts:
            self.starts[p+1][3] = False
            end = self.starts[p+1][2]
            del self.starts[p+1]
        self.put_segment(start, end)


# Your ExamRoom object will be instantiated and called as such:
# obj = ExamRoom(N)
# param_1 = obj.seat()
# obj.leave(p)
```

## SortedList 을 사용

Heap 에서는 중간을 지우는 과정이 매우 복잡합니다. 그렇기 때문에 SortedList 을 heap 대신 사용합니다.

Heap 을 지우는 과정이 사라졌기 때문에 보다 간단한 코드로 표현이 가능합니다.

```python
from sortedcontainers import SortedList


class ExamRoom:

    def __init__(self, N: int):
        self.starts = dict()
        self.ends = dict()
        # Alternative Heap 
        self.fragments = SortedList()
        self.n = N
        
        self.add_fragment((0, N-1))
    
    def distance(self, s, e):
        if s == 0:
            return e
        if e == self.n-1:
            return e-s
        mid = (s+e) // 2
        return min(mid-s, e-mid)

    def add_fragment(self, fragment):
        s, e = fragment
        if s > e:
            return
        self.starts[s] = self.ends[e] = fragment
        self.fragments.add((self.distance(s,e), -s, -e))
        
    def remove_fragment(self, fragment):
        s, e = fragment
        if s > e:
            return
        self.starts.pop(s)
        self.ends.pop(e)
        self.fragments.remove((self.distance(s,e), -s, -e))
        
    def divideFragment(self, fragment):
        s, e = fragment
        if s == 0:
            return s, [(s+1, e)]
        elif e == self.n-1:
            return e, [(s, e-1)]
        mid = (s+e) // 2
        return mid, [(s, mid-1), (mid+1, e)]
    
    def mergeFragment(self, left, right):
        if left == None:
            return (right[0]-1, right[1])
        if right == None:
            return (left[0], left[1]+1)
        return (left[0], right[1])
    
    def seat(self) -> int:
        # print(self.fragments)
        _, s, e = self.fragments[-1]
        s, e = -s, -e
        
        self.remove_fragment((s, e))
        seat, fragments = self.divideFragment((s, e))
        for frag in fragments:
            self.add_fragment(frag)

        return seat

    def leave(self, p: int) -> None:
        # print(self.fragments)
        left, right = self.ends.get(p-1, None), self.starts.get(p+1, None)
        if left:
            self.remove_fragment(left)
        if right:
            self.remove_fragment(right)
        if left == right == None:
            fragment = (p, p)
        else:
            fragment = self.mergeFragment(left, right)
        self.add_fragment(fragment)


# Your ExamRoom object will be instantiated and called as such:
# obj = ExamRoom(N)
# param_1 = obj.seat()
# obj.leave(p)
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
