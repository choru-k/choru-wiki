---
tags:
  - LeetCode
  - Algorithm
  - Bit-Manipulation
---

# 411. Minimum Unique Word Abbreviation

## 문제

[LeetCode 411](https://leetcode.com/problems/minimum-unique-word-abbreviation/) • **Hard**

## 핵심 아이디어

일단 우리는 dictionary 의 단어와 target 사이의 diff 를 2진수로 표현할 수 있다.

`apple` 와 `abble` 의 diff 을 `01100` 로 표현 가능 하다.

## Solution

```python
class Solution:
    def minAbbreviation(self, target: str, dictionary: List[str]) -> str:
        diffs = { 
            sum(1<<i for i in range(len(d)) if target[i] != d[i])
            for d in dictionary if len(d)== len(target)
        }
        if len(diffs) == 0:
            return str(len(target))
        ret = 2**len(target)-1
        for cur in range(1, 2**len(target)):
						# 만약 모든 diff 에 대해서 target 이 특정 가능하다면
            if all(
                cur & diff != 0
                for diff in diffs
            ):
								# ret 의 길이는 모든 문자에서 00 을 뺀것 과 같다. 00 이 되면 전체 길이가 1줄고
								# 000 이면 전체 길이가 2가 줄고, 즉 중복된 00 의 갯수가 총 줄어들는 길이다.
								# 우리는 이 줄어드는 길이가 max 가 되는 ret 을 구하고 싶다.
                ret = max(ret, cur, 
                          key=lambda x: sum((3<<i & x)== 0 for i in range(len(target)-1))
                         )
	      # #으로 치환
        s = ''.join(target[i] if ret & 1<<i else '#' for i in range(len(target)))
        # #의 길이를 숫자로 변환
        return re.sub('#+', lambda m: str(len(m.group())), s)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
