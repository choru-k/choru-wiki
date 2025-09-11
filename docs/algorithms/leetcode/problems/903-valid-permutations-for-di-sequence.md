---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
---

# 903. Valid Permutations for DI Sequence

## 문제

[LeetCode 903](https://leetcode.com/problems/valid-permutations-for-di-sequence/) • **Hard**

## 풀이법 1

만약 `DID` 을 만족하는 `1032` 가 있다고 해보자.

여기서 `DIDD` 을 만족하면서 2로 끝나는 순열을 어떻게 만들까?

일단 `1032`에서 2이상인 모든 숫자에 1을 더한다. 그 뒤에 1을 2을 추가한다.

그러면 `10432` 가 된다.

이러한 방법을 통해서 원래 순열에 있던 2가 3이 되었다. 그래서 이 배열안에는 2가 존재하지 않게 되고 우리는 2을 추가할 수 있게 되었다.

더욱 중요한것은 우리는 원래의 DI 순열의 순서를 깨지않고 새로운 DI 순열을 만든것이다.

또한 `1032` 에서 1을 추가하고 싶다면 `20431` , 0을 추가하고 싶다면 `21430` 을 만들수 있다.

1032 에서 3을 추가할수 있을까? 그건 불가능 하다. 왜냐하면 `DIDD` 을 만족하면서 2 뒤에 새로운 숫자를 추가하기 위해서는 3보다 작은 숫자만 가능하기 때문이다.

이제 `DIDI` 의 경우도 생각해보자.

`1032` 에서 숫자가 더 커지기 위해서는 3을 추가할 수 잇다. 3을 추가하기 위해서 3이상인 수에 다 1을 더한다.

`10423` , 4을 추가하면 `10324` 가 된다.

`dp[i][j]` 는 `s[:i+1]` 의 DI 규칙을 만족하면서 마지막이 j 로 끝나는 것을 의미한다.

```python
if(S[i-1] == 'D')
 # 만약 dp[i][j] 에서 j <= k 이면 dp[i-1][k]의 순열에서 j 이상의 값을 가진 곳은 +1을 하고 마지막에 j 을 넣어주면 된다.
   dp[i][j] = dp[i-1][j] + dp[i-1][j+1] + ... + dp[i-1][i-1]

if(S[i-1] == 'I') 
   dp[i][j] = dp[i-1][0] + dp[i-1][1] + ... + dp[i-1][j-1]
```

밑은 시간복잡도가 O(N^3) 이다. 이제 최적화를 하자.

```python
class Solution:
    def numPermsDISequence(self, S: str) -> int:
        MOD = 10**9+7
        n = len(S)
        dp = [[0] * (n+1) for _ in range(n+1)]
        dp[0] = [1]*(n+1)
        for i in range(1,n+1):
            c = S[i-1]
            for j in range(i+1):
                if c == 'D':
                    dp[i][j] = sum(dp[i-1][j:i]) % MOD
                else:
                    dp[i][j] = sum(dp[i-1][:j]) % MOD
        # print(dp)
        return sum(dp[-1]) % MOD
```

일단 prefix sum 을 통해서 한번 최적화를 하였다. O(N^2) 가 되었다.

```python
class Solution:
    def numPermsDISequence(self, S: str) -> int:
        def create_prefix(nums):
            sums = [0]
            for num in nums:
                sums.append(sums[-1]+num)
            return sums
        def get_sum(sums, j, i):
            return sums[i]-sums[j]
        MOD = 10**9+7
        n = len(S)
        dp = [[0] * (n+1) for _ in range(n+1)]
        dp[0] = [1]*(n+1)
        for i in range(1,n+1):
            c = S[i-1]
            sums = create_prefix(dp[i-1])
            for j in range(i+1):
                if c == 'D':
                    # dp[i][j] = sum(dp[i-1][j:i]) % MOD
                    dp[i][j] = get_sum(sums, j, i) % MOD
                else:
                    # dp[i][j] = sum(dp[i-1][:j]) % MOD
                    dp[i][j] = get_sum(sums, 0, j) % MOD
        # print(dp)
        return sum(dp[-1]) % MOD
```

공간복잡도도 최적화를 하였다.

```python
class Solution:
    def numPermsDISequence(self, S: str) -> int:
        def create_prefix(nums):
            sums = [0]
            for num in nums:
                sums.append(sums[-1]+num)
            return sums
        def get_sum(sums, j, i):
            return sums[i]-sums[j]
        MOD = 10**9+7
        n = len(S)
        
        dp = [1]*(n+1)
        for i in range(1,n+1):
            c = S[i-1]
            sums = create_prefix(dp)
            nxt_dp = [0] * (n+1)
            for j in range(i+1):
                if c == 'D':
                    nxt_dp[j] = get_sum(sums, j, i) % MOD
                else:
                    nxt_dp[j] = get_sum(sums, 0, j) % MOD
            dp = nxt_dp
        return sum(dp) % MOD
```

## 풀이법 2

조금 더 다르게 생각해보자.

만약 dp[i] 을 마지막 숫자와 현재 사용하지 않은 숫자들의 관계라고 해보자.

예를 들어서 dp[0] 은 마지막 숫자가 남은숫자들 보다 작은 경우

dp[1] 은 마지막 숫자가 남은 숫자들 중 1개보다 큰 경우

dp[2] 는 마지막 숫자가 남은 숫자들 중 2개보다 큰 경우라고 해보자.

핵심은 마지막 숫자와 남은숫자들의 관계이다.

이제 `D` 을 할 차례라면 우리는 남은 숫자들중 1개를 고를 것이다. 만약 dp[0] 은 남은 숫자들 중 더 작은 숫자가 없기 때문에 사용할 수 없다.

그리고 남은 숫자들중 가장 작은 숫자을 사용하면 dp[0] 이 될 것 이고, 2번 째로 작은 수을 사용하면 dp[1] 이 될 것 이다.

이걸 그림으로 표현하면 밑의 그림처럼 된다.

![[ca79e8a9-6e58-4bc9-9578-e520c80c402e_1593661446.7454202.png]]

```python
class Solution:
        def numPermsDISequence(self, S):
            dp = [1] * (len(S) + 1)
            for c in S:
                if c == "I":
                    dp = dp[:-1]
                    for i in range(1, len(dp)):
                        dp[i] += dp[i - 1]
                else:
                    dp = dp[1:]
                    for i in range(len(dp) - 1)[::-1]:
                        dp[i] += dp[i + 1]
            return dp[0] % (10**9 + 7)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
