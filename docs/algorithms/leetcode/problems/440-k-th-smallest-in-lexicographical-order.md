---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Work-In-Progress
---

# 440. K-th Smallest in Lexicographical Order

## 문제

[LeetCode 440](https://leetcode.com/problems/k-th-smallest-in-lexicographical-order/) • **Medium**

## 핵심 아이디어

```python
	def findKthNumber(self, n, k):
        cur = 1
        k = k - 1
        while k > 0:
            steps = self.calSteps(n, cur)
            if steps <= k:
                cur += 1
                k -= steps
            else:
                cur *= 10
                k -= 1
        return cur

    def calSteps(self, n, cur):
        steps = 0
        n1, n2 = cur, cur + 1
        while n1 <= n:
            steps += min(n + 1, n2) - n1
            n1 *= 10
            n2 *= 10
        return steps
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
