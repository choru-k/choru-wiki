---
tags:
  - LeetCode
  - Algorithm
  - Math
---

# 1012. Numbers With Repeated Digits

## 문제

[LeetCode 1012](https://leetcode.com/problems/numbers-with-repeated-digits/) • **Hard**

## 핵심 아이디어

문제를 살짝 바꾸어서 repeated digit 이 없는 숫자의 갯수를 구해보자.

만약 크기에 상관없이 자릿수만 생각하였을 때 repeat 이 없는걸 어떻게 구할까?

단순히 순열로 생각하면 된다. 길이를 `l` 이라고 할 때

맨 앞은 `[1-9]` 에서 선택가능하고, 나머지는 `[0-9]` 에서 선택가능 하기 때문에

$cnt = 9 * _{9}P_{l-1}$

이 된다.

그러면 이제 크기 제한이 있다고 생각해보자.

예를 들어서 조건이 밑이라면

`N = 8765`

`L = [8,7,6,6]`

우리는 저 X 을 만족하는 숫자들의 갯수를 찾으면 된다.

`XXX`

`XX`

`X`

`1XXX ~ 7XXX`

`80XX ~ 86XX`

`870X ~ 875X`

`8760 ~ 8765`

  

X 의 앞에 숫자로 선택되어 있는 부분을 prefix 라고 하자.

그러면 우리의 prefix 에 repeat 가 없고, 이번에 선택할 숫자가 N 보다 작게 하면서 나머지를 채우면 된다.

밑의 코드를 보는게 더 이해가 쉬울거다.

## Solution

```python
class Solution:
    def numDupDigitsAtMostN(self, N: int) -> int:
        def permutation(n, k):
            tmp = 1
            for i in range(k):
                tmp *= n-i
            return tmp
        
				# N+1 미만의 숫자들 중에서 찾는다.
        digits = list(map(int, str(N+1)))
        cnt = 0
        for i in range(1, len(digits)):
            # 맨처음은 [1-9] 선택가능, 나머지들은 [0-9] 선택가능.
            cnt+=9*permutation(9, i-1)
        for i in range(len(digits)):
            # prefix 에 duplicate 가 없다면
            prefix = digits[:i]
            if len(prefix) == len(set(prefix)):
                x = digits[i]
                # 맨앞이라면 1부터 시작가능
                # 중간이라면 0부터 시작가능
                for y in range(0 if i > 0 else 1, x):
                    # 이번에 선택할 숫자가 prefix 에 없다면
                    if y not in prefix:
                        # 얘를 선택하고, 나머지는 알아서 permutation
                        # 총 [0-9] 10 개를 선택가능한데, 그중에서 prefix 의 길이와, 이번에 선택한 수를 뺌
                        cnt += permutation(10-len(prefix)-1, len(digits)-len(prefix)-1)
            # if x in digits[:i]:
            #     break
        return N-cnt
```

  

[https://leetcode.com/problems/numbers-with-repeated-digits/discuss/256725/JavaPython-Count-the-Number-Without-Repeated-Digit](https://leetcode.com/problems/numbers-with-repeated-digits/discuss/256725/JavaPython-Count-the-Number-Without-Repeated-Digit)

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
