---
tags:
  - Algorithm
  - LeetCode
---

# 2030. Smallest K-Length Subsequence With Occurrences of a Letter

## 문제

[LeetCode 2030](https://leetcode.com/problems/smallest-k-length-subsequence-with-occurrences-of-a-letter/description/) •**Medium**

```python
class Solution:
    def smallestSubsequence(self, s: str, k: int, letter: str, repetition: int) -> str:
        

        def can_pop(st, c, cur_cnt, remain_cnt, remain_s):
      # st 가 비었으면 빼면 안된다.
            if len(st) == 0:
                return False 
##################### 이 사이의 조건들은 순서가 바뀌어도 문제 없지만
      # 지금 letter 이고, 남은 letter 와 현재 letter 을 다 더해서 repetition 이라면 더이상 빼면 안된다.
      if st[-1] == letter and cur_cnt + remain_cnt == repetition:
                return False
      # 만약 남은 문자열을 다 넣었을 때 k 라면 더이상 빼면 안된다.
            if len(st) + remain_s == k:
                return False
      # 남은 공간에 다 넣어도 repetition 이 부족하다면, 지금 있는 걸 빼서 공간을 만들어야 한다.
            if k - len(st) < repetition - cur_cnt:
                return True
##################### 이 마지막 조건은 순서가 바뀌면 안된다.
##################### 왜냐면 위의 조건은 꼭 필요한 조건이고, 밑은 위의조건을 만족시키면서 최적의 경우이기 때문에.
##################### 이게 위에 있으면 그게 우선순위가 되어버린다.
      # 단조증가를 위해서 빼준다.
            if st[-1] > c:
                return True
            return False
            
        st = []
        remain_cnt = collections.Counter(s)[letter]
        cur_cnt = 0
        for idx, c in enumerate(s):
            while can_pop(st, c, cur_cnt, remain_cnt, len(s) - idx):
                popped = st.pop()
                if popped == letter:
                    cur_cnt -= 1
            st.append(c)
            if c == letter:
                cur_cnt += 1
                remain_cnt -= 1
        
        return "".join(st[:k])
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
