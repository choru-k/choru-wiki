---
tags:
  - LeetCode
  - Algorithm
  - Heap
---

# 1405. Longest Happy String

## 문제

[LeetCode 1405](https://leetcode.com/problems/longest-happy-string/) • **Medium**

## 핵심 아이디어

일단 가장 생각 하기 쉬운 방법은 모든 경우을 다 해보는 것 입니다.

만약 `a` 가 a개, `b` 가 b 개, `c` 가 c 개 있다고 했을 때 모든 경우의 수는

$\frac {(a+b+c)!} {a!b!c!}$﻿이 됩니다. 이 경우의 수는 너무 크기 때문에 우리는 다른 방법을 생각 해야 합니다.

일단 조금 단순하게 생각하면 많이 쓸 수 있는 문자는 최대한 자주 사용하고, 많이 쓸 수 없는 문자는 최대한 아끼는 편이 좋을 것 같습니다. 이러한 방법을 조금 더 정리 해보죠.

남은 문자 중에서 아직 많이 쓸 수 있는 문자을 최대한 사용한다. 만약 그 문자을 이번에 사용할 수 없다면 (3번 연속이 된다면) 이번에는 그 문자을 사용하지 않고, 다음으로 많은 문자을 사용한다.

이러한 규칙대로 만들면 잘 될 것 같습니다.

## Solution

```python
class Solution:
    def longestDiverseString(self, a: int, b: int, c: int) -> str:
        arr = [(-a,'a'), (-b, 'b'), (-c, 'c')]
        arr = [(v,c) for v,c in arr if v < 0]
    # 가장 많이 사용할 수 있는 문자을 알기 위해서 heap 을 이용합니다. 
        heapq.heapify(arr)
        
        ret = []
        while len(arr) > 0:
            v, cur = heappop(arr)
      # 만약에 이번에 뽑은 문자가 3번 연속 문자라면
            if len(ret) >= 2 and len(arr) > 0 and ret[-1] == ret[-2] == cur:
                v2, cur2 = heappop(arr)
                v2 += 1
        # 2번째로 많이 남은 문자 추가
                ret.append(cur2)
                if v2 < 0:
                    heappush(arr, (v2, cur2))
            else:
                ret.append(cur)
                v += 1
            if v <0:
                heappush(arr, (v, cur))
            if len(ret) >= 3 and ret[-1] == ret[-2] == ret[-3] and len(arr)<=1:
                ret.pop()
                break
        return "".join(ret)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
