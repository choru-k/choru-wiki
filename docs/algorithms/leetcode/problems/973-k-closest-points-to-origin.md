---
tags:
  - LeetCode
  - Algorithm
  - Sorting
  - Kth-Element
---

# 973. K Closest Points to Origin

## 문제

[LeetCode 973](https://leetcode.com/problems/k-closest-points-to-origin/) • **Medium**

가장 간단한 방법은 길이를 기준으로 각각을 소팅 하는 방법이다.

시간 복잡도는 `O(NlogN)` 이 된다.

```python
class Solution:
    def kClosest(self, points: List[List[int]], K: int) -> List[List[int]]:
        points = [(x*x+y*y, x, y) for x,y in points]
        return list(map(lambda point: [point[1],point[2]], sorted(points)[:K]))
```

  

우리는 사실 N개를 모두 정렬 할 필요가 없다.

우리가 필요한건 Top K 이기 때문에 Heap 을 통해서 항상 Top K 을 가지고 있다가 새로운 Point 가 들어올 때 Top K 보다 더 작으면 넣고 더 크면 그냥 버리면 된다.

시간 복잡도는 `O(NlogK)` 가 된다.

```python
from heapq import heappush, heappop

class Solution:
    def kClosest(self, points: List[List[int]], K: int) -> List[List[int]]:
        points = [(x*x+y*y, x, y) for x,y in points]
        pq = []
        for point in points:
            if len(pq) < K:
                # python heap 은 작은 숫자가 heap 의 맨위에 있기 때문에 마이너스를 곱해서 큰 수가 먼저 나오게 한다.
                heappush(pq, (-point[0], point[1], point[2]))
            else:
                if -pq[0][0] > point[0]:
                    heappop(pq)
                    heappush(pq, (-point[0], point[1], point[2]))
        return list(map(lambda point: [point[1],point[2]], pq))
```

  

문제에서는

- You may return the answer in any order.

라고 이야기 한다. 즉 우리는 nth-element 을 사용 할 수있다.

python 에서는 nth-element 가 없기 때문에 직접 구현해야 한다.

이 경우 시간복잡도는 `O(N)` 이 된다.

이 방법에 대한 자세한 설명은 구글 검색과

[[Spaces/Home/PARA/Resource/Leetcode/75. Sort Colors]] 보면 보다 쉽게 이해 할 수 있다.

```python
class Solution:
    def kClosest(self, points: List[List[int]], K: int) -> List[List[int]]:
        points = [(x*x+y*y, x, y) for x,y in points]
        self.kth(points, 0, len(points)-1, K)
        return list(map(lambda point: [point[1],point[2]], points[:K]))
    
    def kth(self, points, start, end, k):
        pivot = points[start][0]
        small_idx, idx, big_idx = start, start, end
        
        while idx <= big_idx:
            if points[idx][0] < pivot:
                points[small_idx], points[idx] = points[idx], points[small_idx]
                small_idx+=1
                idx+=1
            elif points[idx][0] == pivot:
                idx+=1
            else:
                points[big_idx], points[idx] = points[idx], points[big_idx]
                big_idx-=1
        small_cnt = small_idx-start
        same_cnt = idx - small_idx
        if k <= small_cnt:
            return self.kth(points, start, small_idx-1, k)
        if small_cnt + same_cnt < k:
            return self.kth(points, idx, end, k-(small_cnt + same_cnt))
        else:
            return points[small_idx]
```

  

  

## Follow Up

음식점들의 좌표가 처음에 Input 배열로 들어온다.

[[-1,0], [3,2] , ..., ]

그 뒤 유저가 맛집 검색을 할때 자신의 위치에서 가장 가까운 음식점 K 개를 검색 결과에 표시 해주고 싶다.

유저의 위치와 K 는 (x, y, k) 로 들어온다. 검색은 자주 일어난다고 한다. 이러한 클래스를 구현하시오.

  

```python
class Solution:
	def __init__(self, points: List[List[int]]) -> None:

	def query(self, x, y, k) -> List[List[int]]:
```

  

  

### 풀이

  

일단 수학적으로 생각을 해봐야 한다. 이미 모든 식당의 원점에서부터의 거리를 가지고 있다고 해보자. 그 다음 특정 query point (x,y) 가 들어온다.

![[CB9B1B62-9766-4886-91C3-44AA0EA48B24.jpeg]]

처음에 binary search 을 이용해서 `r_k` 을 구할 수 있다. 그리고 `left=k` 을 한 뒤 left 을 점점 줄여나간다.

우리는 언제까지 left 을 줄여나가면 Top K 을 구할 수 있을까?

![[3EB54C49-8ABD-4ED4-80B2-7C8EE75D1F09.jpeg]]

수학적으로 봤을 때 위의 식처럼 가장 먼 distance 을 d 라고 할때 `r_1 ≥ r_2 -d` 을 만족하는 r_1 만 정답 후보가 된다. 즉 저걸 불만족 하는 r_1 이 나온다면 left 는 멈추어도 된다.

같은 방법으로 right 도 구하면 우리가 원하는 답이 나온다.

  

밑은 위의 식을 코드로 표현한 것이다. 시간 복잡도는 최악의 경우 `O(N^2)` 이다. 하지만 N >> K 일 경우 단순 `O(N^2)` 보다 훨씬 효율적으로 원하는 답을 구할 수 있다.

```python
from bisect import bisect
from heapq import heappush, heappop

class Solution:
	def __init__(self, points: List[List[int]]) -> None:
        points = [(x*x+y*y, x, y) for x,y in points]
        self.points = sorted(points)

	def query(self, x, y, k) -> List[List[int]]:
        distance = x*x+y*x
        left = bisect(self.points, distance)
        right = left+1
        pq = []

        while True:
            point = self.points[left]
            distance_query = (x-point[0])^2 + (y-point[1])^2
            if len(pq) == k and  -pq[0][1] > distance_query:
                heappop(pq)
            if len(pq) < k:    
                heappush(pq, (-distance_query, point[1], point[2]))
                
            left -= 1
            if left == -1 or distance - (-1*pq[0][1]) > self.points[left][0]:
                break
        
        while True:
            point = self.points[right]
            distance_query = (x-point[0])^2 + (y-point[1])^2
            if len(pq) == k and  -pq[0][1] > distance_query:
                heappop(pq)
            if len(pq) < k:    
                heappush(pq, (-distance_query, point[1], point[2]))
                
            right += 1
            if right == len(self.points) or distance - (-1*pq[0][1]) < self.points[right][0]:
                break
        return list(pq)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
