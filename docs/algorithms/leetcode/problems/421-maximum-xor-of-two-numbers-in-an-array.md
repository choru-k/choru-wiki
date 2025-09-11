---
tags:
  - LeetCode
  - Algorithm
  - Bit-Manipulation
  - Greedy
---

# 421. Maximum XOR of Two Numbers in an Array

## 문제

[LeetCode 421](https://leetcode.com/problems/maximum-xor-of-two-numbers-in-an-array/) • **Medium**

## 핵심 아이디어

일단 이 문제를 풀기 위해서 XOR 연산의 기본적인 개념을 알아야한다.

## Solution

```Plain
0 ^ A = A
A ^ A = 0

A ^ B = C => 
A ^ B ^ B = C ^ B => 
A = C ^ B
```

단순하게 생각하면 가장 큰 자릿수가 1이 되어야 하는 건 당연하다.

만약 정답이 5자리 수라면 처음에 `1 * * * *` 이 되는지 확인하고 만약 된다면 `1 1 * * *` 가 정답이 되는지를 확인하면 될 것 같다.

```python
class Solution:
    def findMaximumXOR(self, nums: List[int]) -> int:
        ans = 0
        
        for i in range(32)[::-1]:
            ans = ans << 1
            
            target = ans | 1
            
            prefixes = { num >> i for num in nums }
            
      # p1 ^ p2 = target 이 되는지를 확인하고 싶다
      # 위의 식에서 p1 ^ target = p2 도 된다는 것을 알 수 있기 때문에 p2 를 확인한다.
            for p in prefixes:
                if p^target in prefixes:
                    ans = target
        return ans
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
