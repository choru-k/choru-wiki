---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 1395. Count Number of Teams

## 문제

[LeetCode 1395](https://leetcode.com/problems/count-number-of-teams/) • **Medium**

## 핵심 아이디어

일단 가장 쉬운 방법을 생각해 보죠.

그냥 모든 경우의 수을 생각해 주면 됩니다.

이 경우 시간 복잡도는 `O(N^3)` 이 됩니다.

## Solution

```python
class Solution:
    def numTeams(self, rating: List[int]) -> int:
        ret = 0
        for i in range(len(rating)):
            for j in range(i+1, len(rating)):
                for k in range(j+1, len(rating)):
                    if rating[i] < rating[j] < rating[k]:
                        ret +=1
                    elif rating[i] > rating[j] > rating[k]:
                        ret +=1
        return ret
```

이제 조금 최적화을 해봅시다.

만약 배열이 `[1,2,3,4,2,1]` 라고 할때 (1,3,4) (2,3,4) 모두 팀이 될 수 있지만 이 때 우리는 3 뒤에 큰 수가 4밖에 없다는 걸 알지만 매번 반복문을 통해서 새로 찾습니다.

이걸 미리 구해놓으면 어떨 까요?

즉 `greater[i] = i 보다 오른쪽에 있는 수에서 rating[i] 보다 큰 수` 라고 해보죠.

그렇다면 우리는 매번 탐색할 필요 없이 이 배열을 사용 할 수 있습니다.

밑의 코드의 시간복잡도는 `O(N^2)` 입니다.

```python
class Solution:
    def numTeams(self, rating: List[int]) -> int:
        ret = 0
        greater = [sum(rating[j] > rating[i] for j in range(i+1, len(rating))) for i in range(len(rating))]
        less    = [sum(rating[j] < rating[i] for j in range(i+1, len(rating))) for i in range(len(rating))]
        
        for i in range(len(rating)):
            for j in range(i+1, len(rating)):
        # 만약 (rating[i] > rating[j]) 면 rating[j] 보다 작으면서, 더 오른쪽에 있는 갯수을 더해주면 된다. 
                if rating[i] > rating[j]:
                    ret += less[j]
                elif rating[i] < rating[j]:
                    ret += greater[j]
        return ret
```

보다 최적화을 해봅시다.

nums[j] 가 존재할 때, i<j 을 만족하면서 nums[i] < nums[j] 을 만족하는 갯수을 지금까지는 반복문을 통해서 구했습니다. 만약 `nums[0~j]` 까지 미리 정렬 되어 있는 배열이 있다면 우리는 binary search 을 통해서 쉽게 갯수을 구할 수 있습니다. 그리고 nums[j] 을 그 정렬되어 있는 배열에 잘 넣는다면 지속적으로 정렬된 배열을 가져가면서 갯수을 쉽게 구할 수 있을 것 같습니다.

일반적으로 이러한 자료구조는 Red-Black Tree, AVL Tree 같은 Self-balanced Tree 또는 Skip List 등으로 구현 할 수 있습니다. C++, Java 에서는 `Map` , `Set` 으로 구현 되어 있지만 Python 에서는 기본 자료구조가 아니기 때문에 sortedcontainer 을 임포트 해서 사용해야 합니다.

밑의 코드의 시간복잡도는 `O(NlogN)` 이 됩니다.

```python
from sortedcontainers import SortedList
class Solution:
    def numTeams(self, rating: List[int]) -> int:
        ret=0
        # num 보다 왼쪽의 요소들로 만든 정렬된 배열
        sl_l = SortedList()
        # num 보다 오른쪽의 요소들로 만든 정렬된 배열
        sl_r = SortedList(rating)
        # 중간 num 을 구한다.
        for num in rating:
            sl_r.remove(num)
            # 왼쪽배열에서 num의 위치, 오른쪽배열에서 num의 위치을 구한다
            l_idx, r_idx = sl_l.bisect_left(num), sl_r.bisect_right(num)
            # 왼쪽배열에서 num보다 작은 요소의 갯수는 l_cnt
            # 오른쪽 배열에서 num보다 큰 요소의 갯수는 r_cnt
            l_cnt, r_cnt = l_idx, len(sl_r) - r_idx
            # (왼쪽 < num < 오른쪽) 의 갯수
            ret += l_cnt*r_cnt
            # (왼쪽 > num > 오른쪽) 의 갯수
            l_cnt, r_cnt = len(sl_l)-l_idx, r_idx
            ret += l_cnt*r_cnt
            sl_l.add(num)
        return ret
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
