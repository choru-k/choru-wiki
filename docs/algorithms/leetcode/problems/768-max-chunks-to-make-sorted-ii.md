---
tags:
  - LeetCode
  - Algorithm
  - Stack
---

# 768. Max Chunks To Make Sorted II

## 문제

[LeetCode 768](https://leetcode.com/problems/max-chunks-to-make-sorted-ii/) • **Hard**

## 핵심 아이디어

이 문제를 맨 처음 봣을 때 DP 로 풀 수 있을 것 같다.

`dp[i,j]` = `[(i~j) 의 최소값, 최대값, 최대 chunk]` 로 표현한다면

밑의 코드가 된다. 시간복잡도는 O(N^3) 이 된다.

## Solution

```python
class Solution:
    def maxChunksToSorted(self, arr: List[int]) -> int:
        memo = dict()
        def dfs(i, j):
            if i == j:
                # min, max, max_cnt
                return [arr[i], arr[i], 1]
            if (i,j) in memo:
                return memo[i, j]
            res = [float('inf'), float('-inf'), 0]
            for k in range(i, j):
                left, right = dfs(i,k), dfs(k+1, j)
                if left[1] <= right[0]:
                    res = max(res, [left[0], right[1], left[2] + right[2] ], key= lambda x: x[2])
            if res == [float('inf'), float('-inf'), 0]:
                res = [min(left[0], right[0]), max(left[1], right[1]), 1]
            memo[i, j] = res
            return memo[i, j]
        ans= dfs(0, len(arr)-1)[2]
        
        # print(memo)
        return ans
```

조금 더 생각해보자.

chunk 의 결과는 정렬된 배열이다.

즉 `arr[:k]` 의 chunk 하면 `sorted(arr[:k])` 가 되야 한다.

즉 `[2,1,3,4,4]` 라면 `[2,1]` 까지 chunk 을 하면 `[1,2]` , `[2,1,3]` 을 chunk 하면 `[1,2,3]` 이 되어야 한다.

만약 `sorted(arr[:k])` 와 `sorted(arr)[:k]` 가 같다면 chunk 가 될 수 있다는 것이다.

밑의 코드의 시간복잡도는 O(N^2) 이다. 정렬은 NlogN 이지만, `c1==c2` 가 최악의 경우 O(N) 이 되기 때문이다.

```python
class Solution:
    def maxChunksToSorted(self, arr: List[int]) -> int:
        c1, c2 = collections.Counter(), collections.Counter()
        ans = 0
        for n1, n2 in zip(arr, sorted(arr)):
            c1[n1] += 1
            c2[n2] += 1
            if c1 == c2:
                ans+=1
        return ans
```

Non-zero 을 사용하여 NlogN

```python
class Solution:
    def maxChunksToSorted(self, arr: List[int]) -> int:
        not_zero = 0
        cnt = collections.Counter()
        ret = 0
        for a, b in zip(arr, sorted(arr)):
            if a != b:
                cnt[a] += 1
                cnt[b] -= 1
                if cnt[a] == 1:
                    not_zero+=1
                if cnt[b] == 0:
                    not_zero-=1
            if not_zero == 0:
                ret +=1
        return ret
```

위의 방법을 좀더 발전시켜보자.

stack 을 이용해서 배열을 나누어 줄 수 있다.

만약 stack 이 `[4,10,13]` 일 경우, `[-inf, 4]` 까지의 chunk, `[4,10]` 의 chunk, `[10,13]` chunk 그리고 `[13, 13]`의 chunk 로 나누어진다고 해보자.

만약 새로운 수가 들어오면 어떻게 해야할까? 만약 그 새로운 수가 13 보다 크다면, 그 수로 시작하는 chunk 을 만들수 있다. 만약 더 작을 경우, 어느 chunk 에 들어가는지 보고, 그 전까지의 chunk 을 없애준다. 밑의 코드를 보면 더욱 이해가 쉬울것이다.

즉 만약 5가 들어오면 `[4,13]` 으로 바꿀것이다.

만약 14가 들어오면 `[4,10,13,14]`

0이 들어오면 `[13]`

```python
class Solution:
    def maxChunksToSorted(self, arr: List[int]) -> int:
        if len(arr) == 0:
            return 0
        st = [arr[0]]
        for num in arr[1:]:
            if num >= st[-1]:
                st.append(num)
                continue
            tmp = st[-1]
            while len(st) > 0 and num < st[-1]:
                st.pop()
            st.append(tmp)
        return len(st)
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
