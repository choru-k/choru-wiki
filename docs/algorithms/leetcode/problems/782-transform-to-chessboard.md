---
tags:
  - LeetCode
  - Algorithm
  - Math
---

# 782. Transform to Chessboard

## 문제

[LeetCode 782](https://leetcode.com/problems/transform-to-chessboard/) • **Hard**

## 핵심 아이디어

일단 문제의 조건을 생각해보자.

우리가 어떻게 하든 행렬에서 구성하고 있는 숫자의 조합은 바꿀 수 없고 순서만 바꿀수 있다.

그렇기 때문에 만약 행,열에서 1의 갯수가 절반이 아니라면 만들수 없다.

또한 우리는 행열을 동시에 교환하고, `board[0][0], board[i][0], board[0][j], board[i][j]` 가 0이 4개, 1이 4개, 0,1이 2개씩 이라는 조건이 아니라면 원하는 체스판을 만들 수 없다.

이러한 조건들을 다 만족한다면 우리는 체스판을 만들 수 있다는 것을 확인하였다.

그러면 최소의 swap 은 어떻게 구할까?

일단 맨 첫숫자가 1인 걸로 맞추엇을 때 교환이 필요한 행,열의 갯수를 구하자.

만약 n 이 짝수라면, 0 인걸로 맞춘거랑 비교하여서 더 적은 것을 구하면 된다.

만약 홀수라면, 짝수교환으로 바꾸어 주자.

## Solution

```python
class Solution:
    def movesToChessboard(self, board: List[List[int]]) -> int:
        n = len(board)
        if any(board[0][0]^board[i][0]^board[0][j]^board[i][j]==1 for i in range(n) for j in range(n)):
            return -1
        if not n // 2 <= sum(board[0]) <= (n+1) // 2:
            return -1
        if not n // 2 <= sum(board[i][0] for i in range(n)) <= (n+1) // 2:
            return -1
        # 맨 처음이 1 인걸로 맞추었을 때 바꾸어야 하는 것들.
        row = sum([1 if board[i][0] == i%2 else 0 for i in range(n)])
        col = sum([1 if board[0][i] == i%2 else 0 for i in range(n)])
        
        if n % 2 == 1:
            # 만약 col 의 바꾸어야 하는것들이 홀수라면 바꿀수가 없음
            # 왜냐하면 바꾸어야 하는것들 2개를 서로 교환 하는 형태인데
            # 홀수라면 마지막에 못 바꿈. 
            # 처음 시작을 0 인걸로 맞추면 짝수교환으로 만들수 있음.
            if col % 2 == 1:
                col = n - col
            if row % 2 == 1:
                row = n - row
        else:
            # 만약 무엇으로 시작하든 상관 없다면
            row = min(row, n-row)
            col = min(col, n-col)
        # 바꾸어야 하는것들 2개를 교환하기 때문에 실제 swap은 절반만 일어남
        return (row + col)//2
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
