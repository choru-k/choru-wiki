---
tags:
  - LeetCode
  - Algorithm
  - Coordinate-Compression
  - Greedy
---

# 850. Rectangle Area II

## 문제

[LeetCode 850](https://leetcode.com/problems/rectangle-area-ii/) •**Hard**

## 핵심 아이디어

이 문제를 가장 간단한게 푸는 방법은 아예 한칸한칸을 다 배열 로 만들어서 하나하나 세보는 것이다.

하지만 이 경우, 범위 *범위* N 이라는 매우 큰 시간 복잡도를 가지기 때문에 어렵다.

그렇다면 이 방법을 보다 빠르게 할 수 있는 방법이 있을까?

우리는 좌표압축을 통해서 보다 배열을 효율적으로 이용할 수 있다.

## Solution

```python
class Solution:
    def rectangleArea(self, rectangles: List[List[int]]) -> int:
        xs = sorted(list(set([x for rectangle in rectangles for x in [rectangle[0], rectangle[2]] ])))
        ys = sorted(list(set([y for rectangle in rectangles for y in [rectangle[1], rectangle[3]] ])))
        
        graph = [[0 for _ in xs] for _ in ys]
        
        for rectangle in rectangles:
            for y_idx in range(len(ys)):
                for x_idx in range(len(xs)):
                    if rectangle[0] <= xs[x_idx] < rectangle[2] and rectangle[1] <= ys[y_idx] < rectangle[3]:
                        graph[y_idx][x_idx] = 1

        ans = 0
        for y_idx in range(len(ys)):
            for x_idx in range(len(xs)):
                if graph[y_idx][x_idx] == 1:
                    ans += (ys[y_idx+1] - ys[y_idx]) * (xs[x_idx+1] - xs[x_idx])
                    ans = ans % (pow(10,9) + 7)
        return ans
```

보면 x의 좌표들을 xs, y의 좌표들을 ys 에 넣었다. 이제 우리는 그래프를 보다 효율적으로 계산할 수 있다.

총 xs의 길이는 2N, ys 의 길이는 2N. 전체 rectangle 는 N 이기 때문에 시간복잡도는 `O(N^3)` 이 된다.

이제 이걸 좀더 효율적으로 계산해보자.

```python
class Solution:
    def rectangleArea(self, rectangles: List[List[int]]) -> int:
        xs = sorted(list(set([x for rectangle in rectangles for x in [rectangle[0], rectangle[2]] ])))
        ys = sorted(list(set([y for rectangle in rectangles for y in [rectangle[1], rectangle[3]] ])))
        
        
        y_open = collections.defaultdict(list)
        y_close = collections.defaultdict(list)
        for rectangle in rectangles:
            y_open[rectangle[1]].append([rectangle[0], rectangle[2]])
            y_close[rectangle[3]].append([rectangle[0], rectangle[2]])
        
        xs_reverse = {}
        for idx, x in enumerate(xs):
            xs_reverse[x] = idx
        ans = 0
        
        count = [0 for _ in xs]
        for y_idx in range(len(ys)-1):
            for x_open, x_close in y_open[ys[y_idx]]:
                for i in range(xs_reverse[x_open],xs_reverse[x_close]):
                    count[i] += 1
            for x_open, x_close in y_close[ys[y_idx]]:
                for i in range(xs_reverse[x_open],xs_reverse[x_close]):
                    count[i] -= 1
            
            for x_idx in range(len(xs)):
                if count[x_idx] > 0:
                    ans += (ys[y_idx+1] - ys[y_idx]) * (xs[x_idx+1] - xs[x_idx])
                    ans = ans % (pow(10,9) + 7)
        
        return ans
```

이제 모든 그래프에 색칠을 하는 게 아니라, open close 을 만듬 으로써, 각각 한번의 작업으로 이번 줄에 무엇이 색칠 되었는지 알 게 되었다.

```python
class Solution:
    def rectangleArea(self, rectangles: List[List[int]]) -> int:
        xs = sorted(list(set([x for rectangle in rectangles for x in [rectangle[0], rectangle[2]] ])))
        ys = sorted(list(set([y for rectangle in rectangles for y in [rectangle[1], rectangle[3]] ])))
        
        y_open = collections.defaultdict(list)
        y_close = collections.defaultdict(list)
        for rectangle in rectangles:
            y_open[rectangle[1]].append([rectangle[0], rectangle[2]])
            y_close[rectangle[3]].append([rectangle[0], rectangle[2]])
        
        xs_reverse = {}
        for idx, x in enumerate(xs):
            xs_reverse[x] = idx
        ans = 0
        
        count = [0 for _ in xs]
        val = 0
        for y_idx in range(len(ys)-1):
            for x_open, x_close in y_open[ys[y_idx]]:
                for i in range(xs_reverse[x_open],xs_reverse[x_close]):
                    count[i] += 1
                    if count[i] == 1: val += xs[i+1] - xs[i]
            for x_open, x_close in y_close[ys[y_idx]]:
                for i in range(xs_reverse[x_open],xs_reverse[x_close]):
                    count[i] -= 1
                    if count[i] == 0: val -= xs[i+1] - xs[i]
            
            ans += (ys[y_idx+1] - ys[y_idx]) * val
            ans = ans % (pow(10,9) + 7)
        
        return ans
```

시간복잡도는 O(N^2) 가 된다.

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
