---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 600. Non-negative Integers without Consecutive Ones

## 문제

[LeetCode 600](https://leetcode.com/problems/non-negative-integers-without-consecutive-ones/) • **Hard**

## 핵심 아이디어

일단 이 문제를 간단하게 생각해 보자.

특정 숫자보다 작은게 아니라 이진수의 길이가 주어진다고 하면 어떻게 풀 수 있을 까?

## Solution

```python
class Solution:
    def findIntegers(self, num: int) -> int:
        num = bin(num)[2:][::-1]
        
        dp = [[1,1] for _ in range(len(num))] 
        
        ans = 1 if num[0]== '0' else 2
        for i in range(1, len(num)):
            dp[i][0] = dp[i-1][0] + dp[i-1][1] # 0 으로 시작
            dp[i][1] = dp[i-1][0] # 1로 시작

        return dp[-1][0]+dp[-1][1]
```

  

단순한 dp 계산을 통해서 이진수의 길이만 주어졌을 때는 쉽게 구할 수 있다.

`0xxxx` 와 `1xxxx` 의 길이가 다음 `0xxxx` 와 `1xxxx` 의 길이를 구할 때 사용 할 수 있다.

  

이제 조금 더 생각을 해보자.

주어진 수가 `11xxxxx` 일 경우, 정답은 `dp[-1][0]+dp[-1][1]` 가 된다. 왜냐하면 `11xxx` 로 시작하는수는 존재할 수 없기 때문이다.

이제 `10101010` 의 경우를 생각해 보자.

`10` 으로 시작하면 `01xxx` `00xxxx` 을 더하면 된다.

  

  

```python
class Solution:
    def findIntegers(self, num: int) -> int:
        num = bin(num)[2:][::-1]
        
        dp = [[1,1] for _ in range(len(num))] 
        
        ans = 1 if num[0]== '0' else 2
        for i in range(1, len(num)):
            dp[i][0] = dp[i-1][0] + dp[i-1][1] # 0 으로 시작
            dp[i][1] = dp[i-1][0] # 1로 시작
            if num[i-1:i+1] == '01':
                ans += dp[i][0]
            elif num[i-1:i+1] == '11':
                ans = dp[i][0]+dp[i][1]
        return ans
```

  

```python
class Solution:
    def findIntegers(self, n: int) -> int:

        str_n = bin(n)[2:]
        l = len(str_n)
        cnt = [1, 2, 3]
        for i in range(l-1):
            cnt.append(cnt[-1] + cnt[-2])
        ret = 0
        prv = '0'
        for i,c in enumerate(str_n):
            if c == '1':
                ret += cnt[l-i-1]
                if prv == '1':
                    break
            prv = c
        else:
            ret += 1
        return ret
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
