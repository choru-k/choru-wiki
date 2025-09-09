---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 1000. Minimum Cost to Merge Stones

## 문제

[LeetCode 1000](https://leetcode.com/problems/minimum-cost-to-merge-stones/) • **Hard**

일단 DP 적인 방법으로 생각해보자.

  

`DP(l, r, m)` 을 `stones[l:r+1]` 을 m 개의 조각으로 합칠 때의 최소의 cost 라고 하자.

그러면

$dp(l,r,m) = min_{i=l..r}(dp(l,i,1)+dp(i+1,r,m-1))$

의 식을 쉽게 유추 할 수 있다.

이제 가장 중요한 base 상태를 고민해보자.

- `r==l` 이면 `m==1` 일 때는 그냥 안 합치고 만약 m 이 1보다 클 경우 만들 수 없으니 inf 을 리턴
- `m==1` 이면 가장 중요한 case 이다. 그대로 `dp(l, r, K)` + `sum(stones[l:r+1])` 로 바꾼다. 왜냐하면 우리는 K 개의 돌은 1개로 만들수 있고 그때 `sum(stones[l:r+1])` 만큼의 cost 가 필요하기 때문이다.

  

밑은 이러한 방법을 구현한 것이다.

```python
class Solution:
    def mergeStones(self, stones: List[int], K: int) -> int:
        
        ans = float('inf')
        memo = dict()
        def dp(l, r, m):
            # print(l,r,m)
            if r == l:
                return 0 if m == 1 else float('inf')
            if m == 1:
                return dp(l, r, K) + sum(stones[l:r+1])
            else:
                if (l,r,m) not in memo:
                    memo[(l,r,m)] = float('inf')
                    for i in range(l, r):
                        memo[(l,r,m)] = min(memo[(l,r,m)], dp(l,i,1) + dp(i+1, r, m-1))
                return memo[(l,r,m)]
        ans = dp(0, len(stones)-1, 1)
        # print(memo)
        return ans if ans != float('inf') else -1
```

  

살짝 최적화

```python
class Solution:
    def mergeStones(self, stones: List[int], K: int) -> int:
        
        sums = [0]
        for s in stones:
            sums.append(sums[-1] + s)
        
        ans = float('inf')
        memo = dict()
        def dp(l, r, m):
						# 우리는 한번의 작업으로 K 개의 돌을 1개로 만든다. 즉 K-1 만큼의 돌을 없애는 것이다.
						# 현재 l~r 사이에 r-l+1 만큼의 돌이 있고 m 개를 남기고 싶기 때문에
						# r-l+1-m 개의 돌을 없애야 하고 한번에 K-1 의 돌을 없앨 수 있기 때문에 미리 inf 을 리턴 할 수 있다.
            if (r-l+1-m) % (K-1) != 0:
                return float('inf')
            if r == l:
                return 0 if m == 1 else float('inf')
            if m == 1:
								# presum 배열을 통해 sum 을 O(1) 에 구할 수 있다.
                return dp(l, r, K) + sums[r+1]-sums[l]
            else:
                if (l,r,m) not in memo:
                    memo[(l,r,m)] = float('inf')
										# l~i 을 1개로 만들기 위해서는 i 의 후보를 미리 추려낼 수 있다.
                    for i in range(l, r, K-1):
                        memo[(l,r,m)] = min(memo[(l,r,m)], dp(l,i,1) + dp(i+1, r, m-1))
                return memo[(l,r,m)]
        ans = dp(0, len(stones)-1, 1)
        # print(memo)
        return ans if ans != float('inf') else -1
```

  

  

## 2D 최적화

일단 dp(l,r) 은 stones[l:r+1] 을 합칠 수 있을 만큼 합쳤을 때의 최소의 코스트 이다.

우리는 위에서 i 의 후보를 간추렸기 때문에 dp(l,i) 가 무조건 1개의 stone 이 된다는 것을 알 수가 있다.

`(r-l) % (K-1) == 0` 을 사용해서 합칠 수 있으면 무조건 합치기 때문에 `현재 dp(l,r)` = `위의 dp(l,r,m)` 에서 가장 좋은 m 만 사용한다는 것과 같다.

이게 가능한 핵심은 stone[l:r] 을 합칠때 stone[l:i], stone[i+1:r] 에서 어떤 i 을 사용했는지와 관계 없이 무조건 sum(stone[l:r]) 을 사용한다는 것에 있다. 즉 합칠 때의 비용은 그 전에 어떠한 merge 을 했는지와 관계 없이 일정 하기 때문에 m 이 필요 없어진 것이다.

```python
class Solution:
    def mergeStones(self, stones: List[int], K: int) -> int:
        
        if (len(stones) - 1) % (K-1)  != 0:
            return -1
        
        sums = [0]
        for s in stones:
            sums.append(sums[-1] + s)
            
        memo = dict()
        def dp(l, r):
            # 더 이상 합칠 수 없음
            if r - l + 1 < K:
                return 0
            if (l, r) not in memo:
                memo[(l,r)] = float('inf')
                for i in range(l, r, K-1):
                    memo[(l,r)] = min(memo[(l,r)], dp(l, i) + dp(i+1, r))
                if (r-l) % (K-1) == 0:
                    memo[(l,r)] += sums[r+1] - sums[l]
            return memo[(l,r)]
        return dp(0, len(stones)-1)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
