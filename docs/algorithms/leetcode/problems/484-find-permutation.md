---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 484. Find Permutation

## 문제

[LeetCode 484](https://leetcode.com/problems/find-permutation/) • **Medium**

일단 가장 극단적인 경우를 생각하자.

다 `IIII` , `DDDD` 일 경우, `12345`, `54321` 이 된다.

만약 `IIID` 이면 `12354` 여야한다. `IIDD` 라면 `12543` 이다.

즉 `IIII` 의 기본 오름차순을 만들고 `D` 에 해당하는 부분만 역순으로 해서 내림차순을 만들어 주면 된다.

## 아이디어

가장 극단적인 경우를 생각하자. 그리고 한개씩 바꾸어 보면서 규칙을 찾자.

  

```python
class Solution:
    def findPermutation(self, s: str) -> List[int]:
        a = list(range(1, len(s) + 2))
        left = 0
        while left < len(s):
            if s[left] == 'I':
                left+=1
                continue
            right = left
            while right < len(s) and s[right] == 'D':
                right += 1
            a[left:right+1] = a[left:right+1][::-1]
            left=right
        # for m in re.finditer('D+', s):
        #     i, j = m.start(), m.end() + 1
        #     a[i:j] = a[i:j][::-1]
        return a
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
