---
tags:
  - LeetCode
  - Algorithm
  - Divide-and-Conquer
---

# 932. Beautiful Array

## 문제

[LeetCode 932](https://leetcode.com/problems/beautiful-array/) • **Hard**

이 문제의 핵심은 `length = 4` 의 beautiful array 에서 `length > 4` 의 beautiful array 을 만들 수 있을까 가 아이디어의 핵심이다.

### 덧셈

$[n_1,n_2,n_3,...,n_l]$

라는 beautiful array 가 존재한다고 하자.

$n_i+n_j \neq 2 * n_k (i \leq k \leq j)$

을 만족한다. 만약 모든 배열의 원소에 `a` 을 더해보자

$[n_1+a, n_2+a, ..., n_l+a] \\ (n_i + a) + (n_j + a) \neq 2 * (n_k + a)$

즉 `a` 을 더해도 그 배열은 beautiful array 가 된다는 걸 보여줄 수 있다.

### 곱셈

마찬가지로 `a` 을 곱해보자

$[an_1, an_2, ..., an_l] \\ (an_i) + (an_j) \neq 2 * (an_k)$

즉 `a` 을 곱해도 그 배열은 beautiful array 가 된다는 걸 알 수 있다.

`[1, ... , n]` 의 배열이 있을 때 2를 곱하면 `[2, ... , 2n]` 여기서 1 을 빼면 `[1, ... , 2n-1]` 이 둘을 합치면 `[1, 2, ... , 2n-1, 2n]` 이 된다. 즉 1~n 까지의 beautiful array 을 안다면 1~2n까지의 beatiful array 을 구할 수 있다는 것을 알 수 있다.

### 지우기

$[n_1,n_2,n_3,...,n_l]$

의 beautiful array 에서 중간의 1개의 원소를 삭제해도 그래도 beautiful array 가 성립된다는 것은 쉽게 알 수 있다.

이제 쉽게 k length 의 beautiful array 을 구할 수 있다.

```python
class Solution:
    def beautifulArray(self, N: int) -> List[int]:
        arr = [1]
        while len(arr) < N:
            arr = list(map(lambda x: 2*x-1, arr)) + list( map(lambda x: 2*x, arr))
        return list(filter(lambda x: x<=N, arr))
```

정답을 봤지만 이게 과연 인터뷰에 나올까 했고 댓글에도 충분히 그런 말들이 있었다. 하지만 스태프가 구글 온사이트 면접에서 나왔다고 한다. 프로그래밍보다 오히려 수학에 가까운 문제였다.

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
