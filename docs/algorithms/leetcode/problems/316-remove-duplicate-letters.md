---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Stack
---

# 316. Remove Duplicate Letters

## 문제

[LeetCode 316](https://leetcode.com/problems/remove-duplicate-letters/) • **Medium**

이 문제에서 핵심을 생각해보면 `b,c,d,a,b` 에서 a 로 시작하는 단어는 정답이 될 수 없다.

왜냐하면 a부터 시작하는 배열에는 모든 문자열이 들어있지 않기 때문이다.

## Greedy1

```python
class Solution:
    def removeDuplicateLetters(self, s: str) -> str:
        if len(s) == 0:
            return ''
        s_set = set(s)
    # 가장 작은 문자열 부터 본다.
        for c in sorted(s_set):
            from_c_s = s[s.index(c):]
      # 이 문자열 뒤에 그 외의 모든 문자열이 존재한다면 이 문자열부터 시작하는게 정답
            if len(set(from_c_s)) == len(s_set):
                return c + self.removeDuplicateLetters(from_c_s.replace(c, ''))
```

## Greedy2

```python
class Solution:
    def removeDuplicateLetters(self, s: str) -> str:
    # 1의 방법을 약간 변형하여서 실제 계산량을 줄였다.
        if len(s) == 0:
            return ''
        count_s = collections.Counter(s)
        mc = ''
        
        for c in s:
            if mc == '' or mc > c:
                mc = c
            count_s[c] -= 1
      # 특정 문자열 뒤에 모든 문자열이 존재하는지를 counter 을 사용하여 판단
            if count_s[c] == 0:
                break
        
        i = s.index(mc) 
        return mc + self.removeDuplicateLetters(s[i:].replace(mc, ''))
```

## Using Stack

```python
class Solution:
    def removeDuplicateLetters(self, s: str) -> str:
        # 마지막 문자열의 출연. 이것을 보고 현재 문자열을 꼭 지금 넣어야 하는지 아닌지를 판단.
        last_pos = {c: i for i,c in enumerate(s)}
        ans = []
        ans_set = set()
        
        for i, c in enumerate(s):
            while len(ans) > 0 and ans[-1] > c and last_pos[ans[-1]] > i and c not in ans_set:
                ans_set.remove(ans.pop())
            if c not in ans_set: 
                ans.append(c)
                ans_set.add(c)
        # print(ans)
        return "".join(ans)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
