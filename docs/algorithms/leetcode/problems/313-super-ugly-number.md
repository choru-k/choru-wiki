---
tags:
  - LeetCode
  - Algorithm
  - BFS
  - DFS
---

# 313. Super Ugly Number

## 문제

[LeetCode 313](https://leetcode.com/problems/super-ugly-number/) • **Medium**

n 과 소수 primes 가 주어질 때, n 번째 super ugly number 을 구하세요.

super ugly number 는 약수로 primes 의 수만을 가진 수을 의미합니다.

## 아이디어

일단 가장 쉽게 푸는 법을 생각해 봅시다.

1 부터 차근차근 체크을 합니다. check 함수는 num 이 super ugly number 인지 체크 합니다.

```python
class Solution:
    def nthSuperUglyNumber(self, n: int, primes: List[int]) -> int:

        def check(num):
            divide = set()
            for prime in primes:
                while num % prime == 0:
                    num //= prime
                    divide.add(prime)
            return num == 1
        k = 0
        num = 1
        while True:
            if check(num):
                k+=1
            if k == n:
                return num
            num +=1
```

위의 방법의 경우 시간 복잡도는 `O(nth super ugly number * len(primes))` 가 됩니다.

매우 큰 수 이기 때문에 우리는 좀더 최적화을 하여야 합니다.

## 모든 수을 세지 말고 후보들만 세자

super ugly number 가 될수 있는 건 어떤 숫자들 일까요?

일단 primes 들은 기본적으로 super ugly number 가 됩니다. 또한 super ugly number 끼리 곱한 수도 super ugly number 가 됩니다. 그렇기 때문에 우리는 super ugly number 끼리 곱해서 후보을 찾고 후보들 중 가장 작은 수가 그 다음 super ugly number 가 된다는 것을 알 수가 있습니다.

```Plain
class Solution:
    def nthSuperUglyNumber(self, n: int, primes: List[int]) -> int:
        if n == 1:
            return 1
        uglys = set([1])

        while len(uglys) < n:
            candidates = []
            for ugly in uglys:
                for prime in primes:
                    num = ugly * prime
                    if num not in uglys:
                        candidates.append(num)
            cur = min(candidates)
            uglys.add(cur)

        return cur
```

이 방법은 잘 작동 하지만 시간 복잡도가 아직도 꽤 큽니다.

시간 복잡도는 `O(len*(primes) * n^2)` 가 됩니다.

## 최적화 1

위의 코드을 보면 전에 나왔던 모든 uglys 에 대해서 prime 을 곱해서 candidate 을 만듭니다.

예를 들어서 `uglys=[1,2,4,7,8]` 이고 `primes=[2,7,13]` 라면 항상 15의 후보을 만들고 계산하겠죠

만약 이번에 prime 2 와 ugly 의 4을 곱해서 8을 만들었다면 prime 2 로 만들수 있는 그 다음 숫자는 7을 곱한 14 입니다. 즉 항상 모든 경우을 계산 하는게 아니라, 어느 지점까지의 uglys 을 저장한다면 보다 최적화가 가능합니다.

```python
class Solution:
    def nthSuperUglyNumber(self, n: int, primes: List[int]) -> int:
        if n == 1:
            return 1
        uglys = [1]
    # 중복체크을 위해서 존재
        uglys_set = set([1])
        idxes = [0 for _ in range(len(primes))]
        while len(uglys) < n:
            candidates = []
      # ugly number 후보와, 어떤 prime 을 썻는지을 저장.
            for i, (prime, idx) in enumerate(zip(primes, idxes)):
                candidates.append((uglys[idx]* prime, i))

            cur = min(candidates)
            idxes[cur[1]] += 1
      # 중복된 숫자가 잇다면 무시. 예를 들어 2*7, 7*2 같은 경우
            if cur[0] in uglys_set:
                continue
            uglys_set.add(cur[0])
            uglys.append(cur[0])


        return uglys[-1]
```

위의 코드의 시간복잡는 `O(N * len(primes))` 가 됩니다. 이 코드는 패스가 됩니다.

## 최적화 2

우리는 보다 최적화 할 수 있는 여지가 있습니다. 바로 어디 일까요?

위의 코드에서 candidates 는 자주 바뀌지 않습니다. 대부분의 숫자는 그대로 유지가 되겠지요. 하지만 우리는 이러한 계산을 반복적으로 하고 또 최솟값을 찾습니다. 이것을 최적화 하기 위해서 heap 을 사용할 수 있습니다.

또한 중복 체크 또한 간단하게 할 수 있죠.

예를 들어서 `2*7, 7*2` 의 경우에는 `7*2` 가 아예 안 일어나도록 조절 하면 됩니다.

밑의 코드는 새로운 super ugly number 을 구한다면 그걸로 만들수 있는 모든 super ugly number 후보을 heap 안에 넣습니다.

```python
class Solution:
    def nthSuperUglyNumber(self, n: int, primes: List[int]) -> int:
        if n == 1:
            return 1
        n-=1
        primes.sort()
    # prime 과 prime 이 몇번째 수 인지을 저장합니다.
        cur = [(num, i) for i, num in enumerate(primes)]
        while n > 0:
      # 후보들 중 안에서 가장 작은수가 다음 super ugly number 입니다.
            num, x = heapq.heappop(cur)
            for i in range(x, len(primes)):
        # 2*7, 7*2 의 경우을 방지하기 위해서 더 큰 소수만 곱셈을 합니다.
                heapq.heappush(cur, (num*primes[i], i))
            n-=1
        return num
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
