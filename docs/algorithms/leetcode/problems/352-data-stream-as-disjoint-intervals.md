---
tags:
  - LeetCode
  - Algorithm
  - Hash-Table
---

# 352. Data Stream as Disjoint Intervals

## 문제

[LeetCode 352](https://leetcode.com/problems/data-stream-as-disjoint-intervals/) •**Medium**

## HashMap 을 사용한다

입력 num 이 들어오면 (num-1) 과 (num+1) 이 미리 들어왔는지 비교하고, 있다면 추가하는 식으로 구성하면 된다.

```python
class Interval:
    def __init__(self, start, end):
        self.start = start
        self.end = end
        
class SummaryRanges:

    def __init__(self):
        """
        Initialize your data structure here.
        """
        self.intervals = {}
        self.seen = set()
    
    def deleteInterval(self, interval):
        del self.intervals[interval.start]
        if interval.end in self.intervals:
            del self.intervals[interval.end]
    
    def addInterval(self, start, end):
        interval = Interval(start, end)
        self.intervals[start] = interval
        self.intervals[end] = interval

    def addNum(self, val: int) -> None:
        if val in self.seen:
            return
        self.seen.add(val)
        
        if val-1 in self.intervals and val+1 in self.intervals:
      # val 이 interval 의 중간일 경우 앞 뒤를 지우고 새로
            start = self.intervals[val-1].start
            end = self.intervals[val+1].end
            self.deleteInterval(self.intervals[val-1])
            self.deleteInterval(self.intervals[val+1])
            
        elif val-1 in self.intervals:
            start = self.intervals[val-1].start
            end = val
            self.deleteInterval(self.intervals[val-1])
            
        elif val+1 in self.intervals:
            end = self.intervals[val+1].end
            start = val
            self.deleteInterval(self.intervals[val+1])
        else:
            start, end = val, val
        self.addInterval(start, end)

    def getIntervals(self) -> List[List[int]]:
        ans = []
        for key in sorted(self.intervals):
            if key == self.intervals[key].start:
                ans.append([self.intervals[key].start, self.intervals[key].end])
            
        return ans
```

Add 의 시간 복잡도는 `O(1)` getInterval 의 시간복잡도는 `O(nlogn)` (모든 키가 별개인 최악의 경우) 가 된다.

## SortedDict 을 이용한다

c++ stl 의 Map 과 비슷하다. c++ STL Map은 단순하게 Tree 라고 생각하면 된다. key 가 val 일때 Dictionary 는 hash 을 사용해서 Find 을 `O(1)` 에 끝내지만 Map 은 `O(logn)` 을 사용한다. 다른점은 `bisect_left` `bisect_right` 을 사용할 수 있고 있고, `dictionary.keys()` 가 항상 sorted 된 상태로 얻을 수 있다. 그렇기 때문에 Add의 시간 복잡도는 `O(logn)` getInterval 의 시간 복잡도는 `O(n)` 이된다.

코드는 위의 HashMap 쓰는 것과 동일하게 할 수도 있고, key 에 항상 start 값만 넣어두는 형태로도 구현할 수 있다. 밑의 코드는 leetcode 에서 외부 라이브러리를 사용할 수 없기 때문에 실행하지 않았다. 적당히 참고용으로 보면 된다.

```python
def add(self, start, end):
 self.intervals.add(start, Interval(start,end))
def addNum(self, val:int) -> None:
 if val in self.seen: return
 self.seen.add(val)
 interval_left = self.intervals[self.intervals.bisect_left(val)]
 interval_right = slef.intervals[slef.intervals.bisect_right(val)]
 if interval_left.end + 1 == val and interval_right.start - 1 == val:
  start = interval_left.start
  end = interval_right.end
  delete(interval_left)
  delete(interval_right)
 elif interval_left.end + 1 == val:
  start = interval_left.start
  end = val
  delete(interval_left)
 elif interval_right.start - 1 == val:
  start = val
  end = interval_right.end
  delete(interval_right)
 else:
  start, end = val, val
 add(start, end)

def getIntervals(self):
 return self.intervals.items()
```

위나 아래 어느 방법이 더 좋다고 할 수 없다. 만약 `addNum` 이 자주 불린다면 위의 방법이, `getIntervals` 가 자주 불린다면 아래 방법이 더 좋을 수 있다. 이 데이터가 어떤 종류의 데이터인지 물어보고 어느 방법이 더 좋을지 인터뷰어와 토론하면 좋을 것 같다

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
