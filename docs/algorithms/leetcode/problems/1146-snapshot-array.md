---
tags:
  - LeetCode
  - Algorithm
  - Binary-Search
  - Hash-Table
---

# 1146. Snapshot Array

## 문제

[LeetCode 1146](https://leetcode.com/problems/snapshot-array/) •**Medium**

## 기본적인 방법

snap O(1), set O(1), get O(N)

```python
class SnapshotArray:

    def __init__(self, length: int):
        self.snap_id = 0
        self.arr = [[(-1, 0)] for _ in range(length)]
    def set(self, index: int, val: int) -> None:
        self.arr[index].append((self.snap_id, val))

    def snap(self) -> int:
        self.snap_id+=1
        return self.snap_id-1

    def get(self, index: int, snap_id: int) -> int:
        arr = self.arr[index]
        for i in range(1, len(arr)):
            if arr[i][0] > snap_id:
                return arr[i-1][1]
        return arr[-1][1]


# Your SnapshotArray object will be instantiated and called as such:
# obj = SnapshotArray(length)
# obj.set(index,val)
# param_2 = obj.snap()
# param_3 = obj.get(index,snap_id)
```

## Binary Search 최적화

snap O(1), set O(1), get O(logN)

```python
import bisect 
class SnapshotArray:

    def __init__(self, length: int):
        self.snap_id = 0
        self.arr = [[[-1, 0]] for _ in range(length)]
    def set(self, index: int, val: int) -> None:
        if self.arr[index][-1][0] == self.snap_id:
            self.arr[index][-1] = [self.snap_id, val]
        else:
            self.arr[index].append([self.snap_id, val])
        
    def snap(self) -> int:
        self.snap_id+=1
        return self.snap_id-1

    def get(self, index: int, snap_id: int) -> int:
        arr = self.arr[index]
        idx = bisect.bisect(arr, [snap_id])
        return arr[idx-1][1]


# Your SnapshotArray object will be instantiated and called as such:
# obj = SnapshotArray(length)
# obj.set(index,val)
# param_2 = obj.snap()
# param_3 = obj.get(index,snap_id)
```

```python
import bisect 
class SnapshotArray:

    def __init__(self, length: int):
        self.snap_id = 0
        self.arr = [[(-1, 0)] for _ in range(length)]
    def set(self, index: int, val: int) -> None:
        if self.arr[index][-1][0] == self.snap_id:
            self.arr[index][-1] = (self.snap_id, val)
        else:
            self.arr[index].append((self.snap_id, val))
        
    def snap(self) -> int:
        self.snap_id+=1
        return self.snap_id-1

    def get(self, index: int, snap_id: int) -> int:
        arr = self.arr[index]
        l, r = 0, len(arr)-1
        while l < r:
            mid = (l+r+1) // 2
            if arr[mid][0] > snap_id:
                r = mid-1
            else:
                l = mid
        return arr[l][1]


# Your SnapshotArray object will be instantiated and called as such:
# obj = SnapshotArray(length)
# obj.set(index,val)
# param_2 = obj.snap()
# param_3 = obj.get(index,snap_id)
```

## Dictionary

set O(1), snap O(N), get O(1)

즉 get, set 이 자주 일어나고 snap 이 가끔 일어나는 경우는 보다 효율적. arr 의 길이가 매우 짧다면 효율적

일반적인 Cache Memory 일 경우 크기는 작지만 get 이 매우 자주 일어나기 때문에 오히려 이런 방법이 효율적 일 수 있음. 백업을 하루에 1번, 일주일에 1번 이렇게 한다면.

```python
import bisect 
class SnapshotArray:

    def __init__(self, length: int):
        self.snap_id = 0
        self.arr = dict()
        self.snaps = []
    def set(self, index: int, val: int) -> None:
        self.arr[index] = val
        
    def snap(self) -> int:
        self.snaps.append(self.arr.copy())

        return len(self.snaps)-1

    def get(self, index: int, snap_id: int) -> int:
        if index in self.snaps[snap_id]:
            return self.snaps[snap_id][index]
        else:
            return 0


# Your SnapshotArray object will be instantiated and called as such:
# obj = SnapshotArray(length)
# obj.set(index,val)
# param_2 = obj.snap()
# param_3 = obj.get(index,snap_id)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
