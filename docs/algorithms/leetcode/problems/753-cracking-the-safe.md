---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Math
---

# 753. Cracking the Safe

## 문제

[LeetCode 753](https://leetcode.com/problems/cracking-the-safe/) •**Hard**

## 핵심 아이디어

이 문제는 답은 쉽지만 그것을 생각하는 것이 매우 어렵다.

생각하는 방식을 고민해 보자.

일단 이 문제를 그래프 문제로 바꾸어 보자.

현재 노드에서 마지막 자리만 뒤에 다른 숫자가 추가될 때 생길 수 있는 노드와 연결되어 있다고 하자.

밑의 그림처럼 `n=2,k=2` 의 경우와 `n=3,k=2` 의 경우의 그래프로 나타낼 수 있다.

![[E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7201.jpg]]

잘보면 정답에서 마지막 노드는 항상 첫번째 노드와 다시 연결될 수 있고 경로는 circuit 이 된다.

항상 모든 정답이 circuit 일까? 이 그래프는 complete symmetric 만 그래프이다. 우리가 원하는건 모든 Node 을 한번씩 지나는 circuit 이고 아마도 존재 할 것 이라고(?) 생각해야한다. 이걸 증명하는 것은 매우 어렵다.

어떤 Node 에서 시작하든 정답 circuit 은 바뀌지 않는다.

## Solution

```python
class Solution(object):
    def crackSafe(self, n, k):
        seen = set()
        ans = []
        def dfs(node):
      # 뒤에서 부터 탐색한다. 만약 range(k) 로 할 경우 순환 싸이클을 돌아버린다.
      # 위의 그래프 그림에서 직접 해보아라.
            for x in map(str, range(k)[::-1]):
                nei = node + x
                if nei not in seen:
                    seen.add(nei)
                    ans.append(x)
                    dfs(nei[1:])
        
        start = "0" * n
        seen.add(start)
        ans.append(start)
        dfs(start[1:])
        return "".join(ans)
```

```python
class Solution:
    def crackSafe(self, n: int, k: int) -> str:
        if n == 1:
            return "".join([str(i) for i in range(k)])
        cur = []
        circuit = []
        seen = set()
        def dfs(node):
            if all(node+x in seen for x in map(str, range(k))):
                circuit.append(cur.pop())
                return
            for x in map(str, range(k)):
                if node + x not in seen:
                    seen.add(node+x)
                    cur.append(x)
                    dfs(node[1:]+x)
        dfs('0'*(n-1))
        circuit += cur[::-1] + ['0'*(n-1)]
        return "".join(circuit)
```

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
