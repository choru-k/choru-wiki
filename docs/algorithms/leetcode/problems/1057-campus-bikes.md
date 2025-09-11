---
tags:
  - LeetCode
  - Algorithm
  - Sorting
---

# 1057. Campus Bikes

## 문제

[LeetCode 1057](https://leetcode.com/problems/campus-bikes/) • **Hard**

## Brute-force

가장 작은 쌍 찾기 O(NM). 그걸 N 번 실행 O(N^2M)

## Sort

```python
class Solution:
    def assignBikes(self, workers: List[List[int]], bikes: List[List[int]]) -> List[int]:
        distances = [(abs(w[0]-b[0]) + abs(w[1]-b[1]), w_id, b_id) for w_id,w in enumerate(workers) for b_id,b in enumerate(bikes)]
        distances.sort()
        ans = [-1 for _ in range(len(workers))]
        used_bike = set()
        
        for d, w_id, b_id in distances:
            if b_id not in used_bike and ans[w_id] == -1:
                ans[w_id] = b_id
                used_bike.add(b_id)
            
            
        return ans
```

`O(NM * logNM)`

## Bucket Sort

```python
class Solution:
    def assignBikes(self, workers: List[List[int]], bikes: List[List[int]]) -> List[int]:
        distances = [[] for _ in range(2001)]        
        for w_id,w in enumerate(workers):
            for b_id,b in enumerate(bikes):
                distances[abs(w[0]-b[0]) + abs(w[1]-b[1])].append((w_id, b_id))
        
        
        ans = [-1 for _ in range(len(workers))]
        used_bike = set()
        
        for distance in distances:
            for w_id, b_id in distance:
                if b_id not in used_bike and ans[w_id] == -1:
                    ans[w_id] = b_id
                    used_bike.add(b_id)
            
            
        return ans
```

`O(NM)`

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
