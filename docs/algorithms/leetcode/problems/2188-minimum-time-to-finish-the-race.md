---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 2188. Minimum Time to Finish the Race

## 문제

[LeetCode 2188](https://leetcode.com/problems/minimum-time-to-finish-the-race/description/) • **Medium**

## 핵심 아이디어

일단 문제를 보는순간 dp 를 활용해야 겠다는 생각이 든다.

DP 를 이용해서 일단 풀어본다면 아래와 같은 형식이 될 것이다.

## Solution

```python
class Solution:
    def minimumFinishTime(self, tires: List[List[int]], changeTime: int, numLaps: int) -> int:
        # second 을 통해서 f,r,loop 를 주어질 때 걸리는 시간을 구한다.
        @functools.cache
        def second(f, r, loop):
            if loop == 0:
                return 0
            return f * (r**(loop-1)) + second(f, r, loop-1)

        @functools.cache
        def dfs(remain):
            if remain == 0:
                return 0
            ret = float('inf')
            # 각 타이어들을 비교한다.
            for f, r in tires:
                cur = 1
                # (second(f,r,cur)-second(f,r,cur-1)) <= second(f,r,1)+changeTime 조건이 중요하다.
                # 만약 타이어가 너무 마모되어서 같은 타이어로 새로 교체하는 게 더 낫다면 더 이상 해당 타이어로 주행하지 않는다.
                while cur <= remain and (second(f,r,cur)-second(f,r,cur-1)) <= second(f,r,1)+changeTime:
                    ret = min(ret, dfs(remain-cur) + second(f, r, cur) + (0 if cur == remain else changeTime))
                    cur += 1
            return ret
        
        ret = dfs(numLaps)
        
        return ret
```

  
TLE 가 되었기 때문에 좀더 보완해보자.  

  

```python
class Solution:
    def minimumFinishTime(self, tires: List[List[int]], changeTime: int, numLaps: int) -> int:
        # second 함수는 거듭제곱의 합으로 O(1) 에 계산할 수 있다.
        @functools.cache
        def second(f, r, loop):
            if loop == 0:
                return 0
            return f * (r**loop - 1) // (r-1)

        @functools.cache
        def dfs(remain):
            if remain == 0:
                return 0
            ret = float('inf')

            for f, r in tires:
                cur = 1

                while cur <= remain and (second(f,r,cur)-second(f,r,cur-1)) <= second(f,r,1)+changeTime:
                    ret = min(ret, dfs(remain-cur) + second(f, r, cur) + (0 if cur == remain else changeTime))
                    cur += 1
            return ret
        
        ret = dfs(numLaps)
        
        return ret
```

  

다시 TLE 가 나왔기 때문에 조금더 추가해보자.

```python
class Solution:
    def minimumFinishTime(self, tires: List[List[int]], changeTime: int, numLaps: int) -> int:
        
        @functools.cache
        def second(f, r, loop):
            if loop == 0:
                return 0
            return f * (r**loop - 1) // (r-1)

        # 각 dfs 마다 했던 작업을 따로 빼냈다.
        # 우리는 교환없이 i 바퀴를 돌 때 최소의 시간을 best_loop[i] 에 저장한다.
        best_loop = [0]
        for f, r in tires:
            cur = 1
            while (second(f,r,cur)-second(f,r,cur-1)) <= second(f,r,1)+changeTime:
                if len(best_loop) == cur:
                    best_loop.append(float('inf'))
                best_loop[cur] = min(best_loop[cur], second(f,r,cur))
                cur += 1

        @functools.cache
        def dfs(remain):
            if remain == 0:
                return 0
            ret = float('inf')
            

            for i in range(1, min(len(best_loop), remain+1)):
            # 교환 없이 i 바퀴를 돌 때의 값은 dfs(remain-i) + best_loop[i] + (0 if i == remain else changeTime)
            # 로 표현된다.
                ret = min(ret, dfs(remain-i) + best_loop[i] + (0 if i == remain else changeTime))
            return ret
        
        ret = dfs(numLaps)
        
        return ret
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
