---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 40. Combination Sum II

## 문제

[LeetCode 40](https://leetcode.com/problems/combination-sum-ii/) •**Easy**

일단 이 문제는 보자 마자 NP 문제라는 것을 알 수가 있습니다.

즉 시간복잡도는 `O(2^N)` 이 된다는 것을 알 수가 있고 결국 단순 구현 문제 라는 것을 알 수가 있습니다.

한가지 팁으로 일반적으로 NP 문제로써 최적의 시간복잡도가 `O(2^N)` 인지 아닌지 간단하게 판단하는 방법이 있는데 모든 조합을 다 출력하라고 하면 NP 이고, 단순히 조합의 가짓수을 출력하라고 하면 보다 최적의 방법이 있을 가능성이 있습니다.

예를 들어서 A→B 까지의 경로을 모두 출력하여라 라는건 NP 일 가능성이 높고, 경로의 가짓수을 출력하여라는 최적의 방법이 존재할 가능성이 높습니다. 물론 항상 맞지는 않으니 주의가 필요합니다.

일단 이 문제의 경우에는 모든 경우을 다 출력해야합니다. memorization 이나 전처리을 통해서 최적화을 할 수 있지만 최악의 경우의 시간복잡도는 동일합니다.

## Brute Force

일단 일반적으로 정답을 만들고 set 으로 정답의 중복을 체크합니다.

```python
class Solution:
    def combinationSum2(self, candidates: List[int], target: int) -> List[List[int]]:
        ans = set()
        candidates.sort()
        def dfs(idx, cur):
            if sum(cur) == target:
                ans.add(tuple(cur))
            if idx == len(candidates):
                return
            for i in range(idx, len(candidates)):
                cur.append(candidates[i])
                dfs(i+1, cur)
                cur.pop()
                    
        dfs(0, [])
        return ans
```

위의 코드에서는 sum(cur) 을 통해서 매번 현재 배열의 합을 계산하지만 cur_s 을 통해서 배열의 합을 관리해줍니다.

```python
class Solution:
    def combinationSum2(self, candidates: List[int], target: int) -> List[List[int]]:
        ans = set()
        candidates.sort()
        def dfs(idx, cur, cur_s):
            if cur_s == target:
                ans.add(tuple(cur))
            if idx == len(candidates):
                return
            for i in range(idx, len(candidates)):
                cur.append(candidates[i])
                dfs(i+1, cur, cur_s+candidates[i])
                cur.pop()
                    
        dfs(0, [], 0)
        return ans
```

## 최적화

만약 배열의 [1,1,2] 였다면 위에서는 첫번째 1을 사용한 [1,2] 와 두번째 1을 사용한 [1,2] 의 중복처리을 위해서 set 을 사용하였습니다.

살짝 생각의 관점을 바꿔서 1을 몇개 썻느지. 즉 각각의 숫자을 몇개씩 사용했는지을 저장합시다. 이러면 첫번째, 두번째 1을 고민할 필요없이 단순히 갯수로만 생각하면 됩니다.

```python
class Solution:
    def combinationSum2(self, candidates: List[int], target: int) -> List[List[int]]:
        cnt = Counter(candidates)
        keys = list(cnt.keys())
        ans = []
        def create_list(cur):
            return [k for k, v in cur.items() for _ in range(v)]
        def helper(idx, cur, cur_s):
            if cur_s > target:
                return
            if cur_s == target:
                ans.append(create_list(cur))
                return
            if idx == len(keys):
                return
            
            for i in range(0, cnt[keys[idx]]+1):
                cur[keys[idx]] = i
                helper(idx+1, cur, cur_s + i*keys[idx])
                cur[keys[idx]] = 0
            
        helper(0, dict(), 0)
        return ans
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
