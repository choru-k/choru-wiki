---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 1520. Maximum Number of Non-Overlapping Substrings

## 문제

[LeetCode 1520](https://leetcode.com/problems/maximum-number-of-non-overlapping-substrings/) •**Medium**

## 핵심 아이디어

도대체 난이도 설정이 어떻게 되어있는지 모르겠지만 이 문제가 `medium` 이라니....

일단 우리가 원하는 정답에서 맨처음과 맨 끝은 각 문자의 맨 처음과 맨 끝이 된다.

어떤 뜻일까?

예를 들어서 `adefaddaccc` 는

## Solution

```python
a = [0, 4, 7]
d = [1, 5, 6]
e = [2]
f = [3]
c = [8, 9, 10]
```

에 출현한다고 알 수 있다. 만약 조건을 만족하는 문자열이 존재하고 첫글자와 마지막 글자을 안다면 전체 문자을 알 수가 있다. 만약 `a` 로 시작해서 `c` 로 끝난다면 `[0:10]` 이 우리가 원하는 문자열이고, e 로 시작해서 f 로 끝나면 [2:3] 이 될 것이다.

즉 각 문자가 처음 나타난 곳과, 마지막에 나타난 곳이 중요한 지점이다.

원하는 문자열이 시작되는 위치을 알았으니, 문자열이 `idx` 에서 시작될 때, 원하는 문자열을 만들어 보자.

이 부분은 단순하다. 문자열이 끝나는 지점을 정해두고, 그 사이에서 문자열이 끝나는 지점을 늘려야 한다면 계속 늘리면 된다.

이걸 코드로 구현하면 밑이다.

시간복잡도는 `O(N)` 이 된다.

```python
from typing import Dict, List
from collections import defaultdict

from typing import Dict, List
from collections import defaultdict

class Solution:
    def maxNumOfSubstrings(self, s: str) -> List[str]:
        se = dict()
    # 각 문자가 처음 나온곳과 마지막 나온곳을 저장한다.
        for idx, c in enumerate(s):
            if c not in se:
                se[c] = [idx,idx]
            se[c][1] = idx
        
    # i 부터 시작했을 때, 원하는 문자열을 만드는 가장작은 right 을 구한다.
        def get_new_right(i, c):
            right = se[c][1]
            for j in range(i, len(s)):
                if j == right:
                    break
        # 지금 이 문자열은 i 부터 시작하는데 필요한 문자열이 i 보다 앞에 있다면 문자열을 만들수 없다.
                if se[s[j]][0] < i:
                    return -1
        # 중간에 문자가 새롭게 잇을 경우, right 가 계속 늘어난다.
                right = max(right, se[s[j]][1])
            return right
        right = len(s)
        ans = ['']
        for idx, c in enumerate(s):
      # 각문자의 시작점이 현재일때만 실행.
      # 이건 최대 26번만 실행된다.
            if se[c][0] == idx:
                new_right = get_new_right(idx, c)
        # 문자열을 만들수 잇다면
                if new_right != -1:
          # 만약 새롭게 시작하는 문자열과 저번에 만들었던 문자열이 안겹친다면 새로운 문자열이 된다.
                    if right < idx:
                        ans.append('')
          
                    right = new_right
                    ans[-1] = s[idx:right+1]
       # 밑의 코드도 잘 동작이 된다. 왜일까? 고민해보자.
#              if new_right != -1:
#                    if right < idx:
#                        ans.append('')
#                        right = new_right
#                    else:
#                        right = min(new_right, right)
#                    ans[-1] = s[idx:right+1]
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
