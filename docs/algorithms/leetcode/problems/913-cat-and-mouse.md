---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Minimax
---

# 913. Cat and Mouse

## 문제

[LeetCode 913](https://leetcode.com/problems/cat-and-mouse/solution/) • **Hard**

이 문제는 `Minimax` 의 전형적인? 문제이다.

이 문제를 그냥 풀려고 하면 정말 막막하다. 이 문제를 그래프 문제로 바꾸어보자.

각 Node 의 Value 을 `(mouse 의 위치, cat 의 위치, 현재 누구의 trun인지)`

turn 은 1일 경우 mouse, 2 일 경우 cat 으로 하자.

그리고 그래프는 밑이라고 했을 때

```Plain
4---3---1
|   |
2---5
 \ /
  0
```

`(1,2,1)` 은 `(3,2,2)` 와 연결되어 있다. 그리고 `(3,2,2)`는 `(3,5,1), (3,4,1)` 과 연결 되어 있고

`(3,5,1)` 은 `(4,5,2)`, `(3,4,1)`은 `(4,5,2)` 와 연결 되어 있을 것이다.

이걸 그래프로 표현하면 밑이 된다. 뒷 부분은 생략하였다.

![[__6.svg]]

이제 생각해보자. 어떤 Node에서 mouse가 필승을 하기 위해서는 그 node 에서 갈 수 있는 모든 노드가 mouse 에서 필승이여야 한다. 일단 가장 base 상태를 만든다.

```python
  for i in range(N):
      # 어떤경우던 MOUSE 가 0 에 있으면 MOUSE 의 승리
      color_add(0, i, MOUSE, MOUSE)
      color_add(0, i, CAT, MOUSE)
      if i != 0:
          # CAT 과 MOUSE 가 동일한 위치면 CAT 승리
          color_add(i, i, MOUSE, CAT)
          color_add(i, i, CAT, CAT)
```

이제 이 노드들을 따라 올라가기 위해서 parents 을 구하는 함수을 만든다.

```python
def parents(mouse, cat, trun):
    # 현재의 trun 이 CAT 이면 그전에 MOUSE 가 움직엿음
    if turn == CAT:
        for pre_mouse in graph[mouse]:
            yield pre_mouse, cat, MOUSE
    else:
        for pre_cat in graph[cat]:
            if pre_cat != 0:
                yield mouse, pre_cat, CAT
```

만약 그 전의 turn 과 현재의 node 의 필승자가 일치하면 그전의 turn 에서 무조건 현재의 node 로 이동하는걸 선택하기 때문에 그 전의 node 도 필승 node 가 된다.

```python
while len(q) > 0:
   mouse, cat, turn, who_win = q.popleft()
   # 그 다음 노드는 pre_turn 이 선택
   for pre_mouse, pre_cat, pre_turn in parents(mouse, cat, turn):
       # 이미 이 상태에 대해서 누가 이길지 알면 계산 안해도 됨
       if color[(pre_mouse, pre_cat, pre_turn)] != DRAW:
           continue
       # pre_turn 이 다음 노드를 선택하는데, 만약 다음 노드들 중 내가 무조건 이기는 경우의 수가 있다면 그걸 선택하겠지
    # 예를 들어서 현재의 node (mouse, cat, turn) 의 승리자가 mouse 이고, 
    # pre_turn 이 mouse 면 pre_turn mouse 가 무조건 현재의 node 로 움직일 것이다.
       if pre_turn == who_win:
           color_add(pre_mouse, pre_cat, pre_turn, who_win)
```

만약 필승 현재의 어떠한 node 들에서 내 턴에서 이동할 수 있는 모든 node 가 필패 node 밖에 없다면 필패 node 가 된다. 이걸 쉽게 구하기 위해서 모든 child_node 의 수를 미리 구해놓는다.

```python
draw_childs = dict()
for mouse in range(N):
    for cat in range(N):
        # (mouse, cat, MOUSE) 로 부터 갈 수 있는 경우의 수
        # MOUSE 가 움직일 차례이니 graph[mouse] 만큼의 경우가 있다.
        draw_childs[(mouse, cat, MOUSE)] = len(graph[mouse])
        # CAT 은 hole(0) 을 못가기 때문에 그걸 제외한다.
        draw_childs[(mouse, cat, CAT)] = len(graph[cat]) - (1 if 0 in graph[cat] else 0)
```

만약 draw_child 가 0 이 되었다는건, `(pre_mouse, pre_cat, pre_turn)` 는 무조건 pre_turn 이 지는 경우의 수 밖에 없다는 것이다. 왜냐하면 q 에는 항상, 필승 또는 필패가 정해진 node 만 들어간다. 만약 필승 node가 있었다면 필승 node 을 선택하였을 것이고, draw child 가 1개라도 있다면 이 경우의 수에 들어가지 않앗을 것이다.

```python
draw_childs[(pre_mouse, pre_cat, pre_turn)] -= 1
# draw 로 가는 경우의 수가 없고, 무조건 내가 이기는 경우의 수도 없다면
# 즉 모든 경우의 수를 다 해봣는데 내가 무조건 이기는 경우의 수도 없고, draw 의 경우의 수도 없다.
if draw_childs[(pre_mouse, pre_cat, pre_turn)] == 0:
    pre_win = CAT if pre_turn == MOUSE else MOUSE
    color_add(pre_mouse, pre_cat, pre_turn, pre_win)
```

위의 코드를 다 조합하면 밑이 된다. 매우 어렵기 때문에 하나하나 고민하면서 생각해보면 알 수 있다.

시간복잡도는 O(N^3) 이 된다. 총 O(N^2)의 경우의 수(node) 가 존재하고 각 node 들은 최대 N 개의 edge 을 갖기 때문에.

```python
class Solution(object):
    def catMouseGame(self, graph):
        N = len(graph)
        DRAW = 0
        MOUSE = 1
        CAT = 2
        
        def parents(mouse, cat, trun):
            # 현재의 trun 이 CAT 이면 그전에 MOUSE 가 움직엿음
            if turn == CAT:
                for pre_mouse in graph[mouse]:
                    yield pre_mouse, cat, MOUSE
            else:
                for pre_cat in graph[cat]:
                    if pre_cat != 0:
                        yield mouse, pre_cat, CAT
        # (mouse 의 위치, CAT 의 위치, 움직일 차례)
        color = collections.defaultdict(lambda : DRAW)
        q = collections.deque()
    # q 는 항상 필패, 필승이 정해진 node 만 들어간다.
        def color_add(mouse, cat, turn, who_win):
            color[(mouse, cat, turn)] = who_win
            q.append((mouse, cat, turn, who_win))
        ## Base 상태 설정
        for i in range(N):
            # 어떤경우던 MOUSE 가 0 에 있으면 MOUSE 의 승리
            color_add(0, i, MOUSE, MOUSE)
            color_add(0, i, CAT, MOUSE)
            if i != 0:
                # CAT 과 MOUSE 가 동일한 위치면 CAT 승리
                color_add(i, i, MOUSE, CAT)
                color_add(i, i, CAT, CAT)
      draw_childs = dict()
      for mouse in range(N):
          for cat in range(N):
              # (mouse, cat, MOUSE) 로 부터 갈 수 있는 경우의 수
              # MOUSE 가 움직일 차례이니 graph[mouse] 만큼의 경우가 있다.
              draw_childs[(mouse, cat, MOUSE)] = len(graph[mouse])
              # CAT 은 hole(0) 을 못가기 때문에 그걸 제외한다.
              draw_childs[(mouse, cat, CAT)] = len(graph[cat]) - (1 if 0 in graph[cat] else 0)
        
        while len(q) > 0:
            mouse, cat, turn, who_win = q.popleft()
            # 그 다음 노드는 pre_turn 이 선택
            for pre_mouse, pre_cat, pre_turn in parents(mouse, cat, turn):
                # 이미 이 상태에 대해서 누가 이길지 알면 계산 안해도 됨
                if color[(pre_mouse, pre_cat, pre_turn)] != DRAW:
                    continue
                # pre_turn 이 다음 노드를 선택하는데, 만약 다음 노드들 중 내가 무조건 이기는 경우의 수가 있다면 그걸 선택하겠지
                if pre_turn == who_win:
                    color_add(pre_mouse, pre_cat, pre_turn, who_win)
                else:
                    draw_childs[(pre_mouse, pre_cat, pre_turn)] -= 1
                    # draw 로 가는 경우의 수가 없고, 무조건 내가 이기는 경우의 수도 없다면
                    # 즉 모든 경우의 수를 다 해봣는데 내가 무조건 이기는 경우의 수도 없고, draw 의 경우의 수도 없다.
                    if draw_childs[(pre_mouse, pre_cat, pre_turn)] == 0:
                        pre_win = CAT if pre_turn == MOUSE else MOUSE
                        color_add(pre_mouse, pre_cat, pre_turn, pre_win)
                        
        return color[(1, 2, MOUSE)]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
