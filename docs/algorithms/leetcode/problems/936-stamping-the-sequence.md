---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Reverse-Thinking
  - Work-In-Progress
---

# 936. Stamping The Sequence

## 문제

[LeetCode 936](https://leetcode.com/problems/stamping-the-sequence/) • **Hard**

## 핵심 아이디어

이 문제의 핵심 포인트는 정답에서 부터 풀기이다.

`aabcaca` 라면 `a????ca` 그 뒤 `?????ca` `???????` 을 역순으로 만드는게 핵심이다.

## Solution

```python
class Solution:
    def movesToStamp(self, stamp: str, target: str) -> List[int]:
        stamp=list(stamp)
        target=list(target)
        ans = []
        def check(i):
            need_change=False
            for j in range(len(stamp)):
                if target[i+j] == '?': continue
                if target[i+j] != stamp[j]:
                    return False
                need_change=True
            if need_change:
                ans.append(i)
                target[i:i+len(stamp)] = ['?']*len(stamp)
            return need_change
        
        changed = True
        while changed:
            changed=False
            for i in range(len(target)-len(stamp)+1):
                changed = changed or check(i)
        ans.reverse()
        return  ans if target == ['?'] * len(target) else []
```

기본적인 아이디어를 사용하였다. 최소 한번의 while 문에 1개의 문자는 고쳐지기 때문에 `O(N * (N-M) * M)` 의 시간복잡도를 갖는다. check 가 O(M)

조그만 더 생각해보자. 우리는 계속 반복문을 돌 필요가 없다.

`aabcaca` 에서 바로 0 번째에 도장을 찍을 수 없는 도장이 찍어지는 다른 범위의 글자가 다르기 때문이다. 인덱스 1에서는 도장을 찍는 범위의 글자가 모두 같기 때문에 도장을 찍을 수 있었다.

`a????ca` 인덱스 1에서 도장을 찍었기 때문에 우리는 인덱스 0, 인덱스 3 에 도장을 찍을 수 있었다.

극단적으로 `aaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbaaaaaaaaaaaaaaaaaaaaaaa` 와 `abbbba` 을 생각해 보자.

중간에 `abbbba` 의 도장을 찍을 수 있다. 이 도장을 찍음으로 인해서 맨앞과 맨 뒤에 도장을 찍을 수 있을까?

`abbbba` 가 도장을 찍었을때 영향을 받는 것은 그 주변의 글자들 뿐이다. 즉 모든 글자를 다 볼 필요 없이 주위의 글자만 보면 된다.

그 것을 구현한 것이 밑이다

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
