---
tags:
  - LeetCode
  - Algorithm
  - Boundary-Count
  - Greedy
---

# 659. Split Array into Consecutive Subsequences

## 문제

[LeetCode 659](https://leetcode.com/problems/split-array-into-consecutive-subsequences/) • **Hard**

## 핵심 아이디어

만약 counter(prev) < counter(now) → now 에서 시작하는 순열이 있어야 한다.

만약 counter(prev) > counter(now) → prev 에서 끝나는 순열이 있어야 한다.

## Solution

```python
class Solution:
    def isPossible(self, nums: List[int]) -> bool:
        counter = collections.Counter(nums)
				# 순열의 시작점들을 저장한다.
        starts = collections.deque()
        prev = None
        counter[prev] = 0
        for now in nums:
            if prev == now:
                continue
						# prev 와 now 가 이어지지 않기 때문에 남아있는 starts 을 체크한다.
            if prev!= None and prev+1 != now:
                while len(queue)>0:
                    if prev - starts.popleft() < 2:
                        return False
                prev = None
            if prev == None or prev+1 == now:
                if counter[now] > counter[prev]:
                    for _ in range(counter[now] - counter[prev]):
												# counter(now) 가 더 크기 때문에 now 에서 시작하는 순열이 존재
                        starts.append(now)
                if counter[prev] > counter[now]:
                    for _ in range(counter[prev] - counter[now]):
												# counter(prev) 가 더 크기 때문에 prev 에서 끝나는 순열이 존재. 최소 길이가 3 이하면 False
                        if prev - starts.popleft() < 2:
                            return False
            prev = now

        while len(starts)>0:
            if prev - starts.popleft() < 2:
                return False
        return True
```

  

  

```python
def isPossible(self, A):
    counts = [(x, len(list(group)))
              for x, group in itertools.groupby(A)]

    def possible(chunk):
        starts, ends = [], []
        prev_count = 0
        for time, count in enumerate(chunk):
            if count > prev_count:
                starts.extend([time] * (count - prev_count))
            elif count < prev_count:
                ends.extend([time-1] * (prev_count - count))
            prev_count = count

        ends.extend([time] * count)
        return all(e >= s+2 for s, e in zip(starts, ends))

    chunk = []
    prev = None
    for x, count in counts:
        if prev is None or x - prev == 1:
            chunk.append(count)
        else:
            if not possible(chunk):
                return False
            chunk = []
        prev = x

    return possible(chunk)
```

  

  

```python
class Solution(object):
    def isPossible(self, nums):
        count = collections.Counter(nums)
				# 수열이 끝나는 점
        tails = collections.Counter()
        for x in nums:
						# 이미 다 사용한 숫자. (수열 진행중)
            if count[x] == 0:
                continue
						count[x] -= 1
						# x-1 에서 수열이 끝낫는데 x 가 존재하면 이 수열을 이어서 사용가능
            elif tails[x-1] > 0:
                tails[x-1] -= 1
                tails[x] += 1
						# 최소 길이가 3인 수열을 만들 수 있다면 만듬.
            elif count[x+1] > 0 and count[x+2] > 0:
                count[x+1] -= 1
                count[x+2] -= 1
                tails[x+2] += 1
            else:
								# 즉 현재 점이 점이 (수열 진행중) (수열이 끝나는 점) (수열이 시작하는 점) 이 아니라면 False
                return False
            
        return True
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
