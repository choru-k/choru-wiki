---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 546. Remove Boxes

## 문제

[LeetCode 546](https://leetcode.com/problems/remove-boxes/) • **Medium**

## 핵심 아이디어

이 문제에서 가장 어려운 점은 중간의 박스를 먼저 없애는 경우도 있다는 것이다.

어떤 경우에 중간의 박스를 지우는게 이득일까?

앞이나 뒤에도 같은 박스가 있다면 지우는게 이득일 것이다. 하지만 중간의 박스도 같은 경우를 가질 수 있다.

좀더 생각해보자.

만약 인접한 박스들이 같은 박스라면 무조건 같이 지우는것이 이득이다. 이건 변하지 않는 사실이다.

어떠한 박스에서 우리는 이 박스와 연결된 같은 박스를 전부다 지우던가, 혹은 안지우고 다른 박스로 넘어가느냐 2가지 경우가 있다. 이 때 다른 박스로 넘어가는 경우에는 현재의 박스를 저장시켜서 다음 박스를 지울 때 사용해야 한다. 만약 그 뒤에 같은 박스가 나올 때 중간의 박스를 지움으로써 이 박스를 같이 지울 수 있다.

## Solution

```python
class Solution:
    def removeBoxes(self, boxes: List[int]) -> int:
        @functools.lru_cache(None)
        def dfs(l, r, k):
						# 박스가 없는 경우
            if l > r:
                return 0
						# 항상 우리는 이 박스와 이어진 모든 박스를 지우던가, 안 지우고 다른 박스로 넘어가는 경우 2개 밖에 없다.
            cnt = 0
            while l+cnt <= r and boxes[l] == boxes[l+cnt]:
                cnt +=1
						# 이어진 모든 박스를 지우면 res 가 된다. 이때 k 는 그전까지 나온 l 과 같은 박스가 된다.
            res= (k+cnt)**2 + dfs(l+cnt, r, 0)
            for l2 in range(l+cnt, r+1):
								# 현재의 박스를 그 다음의 박스을 지울 때 사용할 수 있도록 넘긴다.
                if boxes[l2] ==boxes[l]:
                    res = max(res, dfs(l+cnt, l2-1,0) + dfs(l2, r, cnt+k))
            return res
        ans = dfs(0, len(boxes)-1, 0)
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
