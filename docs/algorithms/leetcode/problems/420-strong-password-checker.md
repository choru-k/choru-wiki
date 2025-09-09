---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Math
---

# 420. Strong Password Checker

## 문제

[LeetCode 420](https://leetcode.com/problems/strong-password-checker/) • **Hard**

## 핵심 아이디어

일단 부족한 패턴을 찾는다. 그리고 부족한 패턴을 추가해준다.

만약 길이가 너무 길다면 그 만큼 지운다.

지울 때 `잘` 지우면 패턴을 맞춰주면서 지워줄 수 있다.

## Solution

```python
class Solution:
    def strongPasswordChecker(self, s: str) -> int:
        missing = 3
        if any('A'<=c<='Z' for c in s):
            missing -= 1
        if any('a'<=c<='z' for c in s):
            missing -= 1
        if any('0'<=c<='9' for c in s):
            missing -= 1
        
        change = 0
        one = two = 0
        for c,v in itertools.groupby(s):
            l = len(list(v))
            if l >= 3:
                change += l//3
                if l%3 == 0:
										# 만약 aaa 나 aaaaaa 같은 경우라면 1개를 지워주면 change 을 1개 줄여 줄 수 있다.
                    one += 1
                if l%3 == 1:
										# aaaa, aaaaaaa 라면 2개를 지워주면 change 을 1개 줄여줄 수 있다.
                    two += 1
        
				# 위의 과정을 one-pass 로 처리할 수도 있다. 가독성을 위해 일단 따로 처리.
        if len(s) <6:
            return max(missing, 6-len(s))
        if len(s) <= 20:
            return max(change, missing)
        else:
            base_delete = len(s) - 20
            
            delete = base_delete
            
            # delete 1개을 잘 함으로써, change 1개를 줄여줄 수 있다.
            replace = min(delete, one)
            change -= replace
            delete -= replace
            # delete 2개을 잘 함으로써, change 2개를 줄여줄 수 있다.
            if delete >= 0:
                replace = min(delete, two * 2) // 2
                change -= replace
                delete -= replace*2
            if delete >= 0:
								# 연속된 3 개를 다 delete 해버리면 change 1개를 안해도 된다.
                replace = delete // 3
                change -= replace

            return base_delete + max(change, missing)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
