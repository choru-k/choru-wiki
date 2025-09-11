---
tags:
  - Algorithm
  - LeetCode
---

# 1585. Check If String Is Transformable With Substring Sort Operations

## 문제

[LeetCode 1585](https://leetcode.com/problems/check-if-string-is-transformable-with-substring-sort-operations/) • **Medium**

## 핵심 아이디어

일단 기본적으로 버블소트와 비슷한 방식으로 움직인다고 할 수 있다.

어차피 최적의 수을 구하는 것이 아니라, 되냐 안되냐만 알면 되기 때문에 우리는 소팅을 최소의 단위로 한다.

어차피 최소의 단위로 소팅을 해서 큰 단위의 소팅을 만들 수 있기 때문이다.

최소의 단위의 소팅이란건 2개을 비교해서, 소팅을한다. 이건 버블소팅과 매우 유사하다.

이제 우리가 s에서 t을 못만드는 경우를 생각하자.

그건 t에 있는 어떤 숫자가 왼쪽으로 가고 싶은데 왼쪽에는 모두 자신보다 작은 수 밖에 없어서 이동이 불가능 할 때 우리는 만들수 없다 라고 생각한다.

이걸 다시 한번 생각해보자. 왼쪽에 있는 작은 수가 오른쪽에 있는 큰 수을 뛰어 넘어야할 필요가 있을 때!, 우리는 만들 수 없다라고 생각한다.

즉 `112` 에서 `121` 을 만들 수 없다. 왜냐하면 두번째 1일 2을 뛰어 넘어야 하기 때문이다.

`1231239123123` 이란 s가 있다고 하자. 중간에 9가 들어가있다.

뒤의 123123 에서 앞의 123123으로 이동은 가능하지만, 앞의 123123 에서 뒤의 123123 으로는 이동이 불 가능하다. 왜냐하면 큰수 9 가 가로 막기 때문이다.

현재 9의 앞에는 1,2,3 이 2개씩 들어가있다.

여기서 `1239123123123`은 만들 수 없다. 왜냐하면 앞의 123이 뒤로 가야하기 때문이다.

이제 이걸 이용해서 코드을 구현하자.

## Solution

```python
class Solution:
    def isTransformable(self, s: str, t: str) -> bool:
        s_idx= [collections.deque() for _ in range(10)]
        
        for i, c in enumerate(s):
            s_idx[int(c)].append(i)
            
        for c in t:
            c = int(c)
            if len(s_idx[c]) == 0:
                return False
            i = s_idx[c][0]
            for j in range(c):
        # 위의 예제에서 9보다 작은 수가 존재하고, 그것이 9의 오른쪽으로 가야한다면 실패다.
                if len(s_idx[j]) > 0 and i < s_idx[j][0] :
                    return False
            s_idx[c].popleft()
            
        return True
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
