---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Sliding-Window
---

# 727. Minimum Window Subsequence

## 문제

[LeetCode 727](https://leetcode.com/problems/minimum-window-subsequence/) •**Medium**

일반적인 문자열 비교 dp 문제 중 1개이다.

일단 Top-Down 으로 풀어보자.

`memo[(s,t)]` 는 S[s:] 와 T[t:] 을 비교할 때 나올 수 있는 가장 빠른 끝나는 End-point 이다.

즉 `S[s:memo[(s,t)]]` 에 T[t:] 가 전부 들어있을 때의 최소의 `memo[(s,t)]` 을 넣는다.

```python
class Solution:
    def minWindow(self, S: str, T: str) -> str:
        memo = dict() # memo[(s,t)] s시작과 t시작을 햇을때 가장 빨리 끝나는 점
        ans = (float('inf'), -1)
        def dp(s, t):
            nonlocal ans
            if t == len(T):
                return s
            if s == len(S):
                return float('inf')
            if (s,t) not in memo:
                if S[s]==T[t]:
                    memo[(s,t)] = min(dp(s+1, t+1), dp(s+1, t))
                else:
                    memo[(s,t)] = dp(s+1, t)
                if t == 0:
                    ans = min(ans, (memo[(s,t)] - s, s))
            return memo[(s,t)]
        dp(0, 0)
        
        return S[ans[1]:ans[1]+ans[0]] if ans[0] < len(S) else ''
```

위의 코드를 그래도 하면 `Time Limit Exceeded` 가 걸린다. 시간복잡도는 O(ST) 이지만 공간복잡도도 O(ST) 여서 memo 을 업데이트 할 때 시간이 조금 더 소요되는 것 같다.

위의 코드를 그래도 Bottom-Up 방식으로 바꾸어보다.

시간복잡도는 같지만 공간복잡도가 O(S) 가 된다.

```python
class Solution:
    def minWindow(self, S: str, T: str) -> str:
        ans = (float('inf'), -1)
        
        prev = [s for s in range(len(S)+1)]
        for t in range(len(T))[::-1]:
            now = [None] * len(S) + [float('inf')]
            for s in range(len(S))[::-1]:
                if S[s] == T[t]:
                    now[s] = min(prev[s+1], now[s+1])
                else:
                    now[s] = now[s+1]
                if t == 0:
                    ans = min(ans, (now[s] - s, s))
            prev = now
        
        return S[ans[1]:ans[1]+ans[0]] if ans[0] < len(S) else ''
```

## 최적화

문제를 좀 다른 방식으로 생각해보자. 이 문제를 2-pointer sliding 문제로 바꿀 수 있다.

일단 left, right 가 존재하고, `S[left:right]` 안에 T 가 존재 할 수 있도록 right 을 증가 시킨다.

그 후에 left, right 가 정해지면 left 을 줄이면서 현재의 답을 최적화 시킨다.

즉

- 특정 범위에서 답이 가능한지 확인
- 그 답을 최적화

라는 방식이다.

```python
class Solution:
    def minWindow(self, S: str, T: str) -> str:
        t = 0
        left, right = 0, 0
        ans = (-1, float('inf'))
        while right < len(S):
            if S[right] == T[t]:
                t +=1
            right += 1
            
            # S[left:right] 사이에 정답 존재 최적화 시작
            if t == len(T):
                left = right
                t -= 1
        # 뒤에서 부터 t을 세어주면서 최적화. 즉 left->right / right->left 방식의 최적화다.
                while t >= 0:
                    left -= 1
                    if S[left] == T[t]:
                        t -= 1
                ans = min(ans, (left, right), key=lambda x: x[1]-x[0])
                right = left+1
        
        
        
        if ans == (-1, float('inf')):
            return ''
        return S[ans[0]:ans[1]]
```

left, right 대신 s 하나만을 사용한 방법.

```python
class Solution:
    def minWindow(self, S: str, T: str) -> str:
        s, t = 0,0
        ans = (-1, float('inf'))
        while s < len(S):
            if S[s] == T[t]:
                t+=1
                s+=1
                if t == len(T):
                    saved_s = s
                    s, t = s-1, t-1
                    while True:
                        if S[s] == T[t]:
                            t-=1
                            if t == -1: break
                        s-=1
                    ans = min(ans, (s, saved_s), key=lambda x: x[1]-x[0])
                    s +=1
            else:
                s+=1
        if ans == (-1, float('inf')):
            return ''
        return S[ans[0]:ans[1]]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
