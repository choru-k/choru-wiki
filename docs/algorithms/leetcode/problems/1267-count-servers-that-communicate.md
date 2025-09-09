---
tags:
  - LeetCode
  - Algorithm
  - DFS
  - Graph
  - Union-Find
---

# 1267. Count Servers that Communicate

## 문제

[LeetCode 1267](https://leetcode.com/problems/count-servers-that-communicate/) • **Medium**

여기서 알고 싶은 건 다른 서버와 통신하지 않는 서버의 갯수이다.

구할 수 있는 방법은 두 가지가 있다.

- 전체 서버의 갯수 - 다른 서버와 통신하는 서버의 갯수
- 다른서버와 통신하지 않는 서버의 갯수

  

이 두 가지을 어떻게 구할 수 있을까?

## Graph 로 바꾸기

이 문제을 그래프 문제로 바꾸고 grouping 문제로 생각을 해보자.

즉 각각의 서버을 node 로 보고, 서로 통신할 수 있는 서버는 서로 edge 로 연결되어있다고 하자.

  

```python
class Solution:
    def countServers(self, grid: List[List[int]]) -> int:
        h, w = len(grid), len(grid[0])
        computers = dict()
        for y in range(len(grid)):
            for x in range(len(grid[y])):
                if grid[y][x] == 1:
                    computers[y, x] = len(computers)
        
        graph = collections.defaultdict(set)
        for y, x in computers.keys():
            for i in range(h):
                if grid[i][x] == 1 and y != i:
                    graph[y,x].add((i,x))
            for i in range(w):
                if grid[y][i] == 1 and x != i:
                    graph[y,x].add((y,i))
```

위의 코드로 우리는 이 문제을 graph 문제로 바꾸었다.

  

## Group 만들기

이제 group 을 지어보자. group 을 만드는 가장 쉬운 방법은 DFS 을 사용하는 것이다.

  

```python
class Solution:
    def countServers(self, grid: List[List[int]]) -> int:
        h, w = len(grid), len(grid[0])
        computers = dict()
        for y in range(len(grid)):
            for x in range(len(grid[y])):
                if grid[y][x] == 1:
                    computers[y, x] = len(computers)
        
        graph = collections.defaultdict(set)
        for y, x in computers.keys():
            for i in range(h):
                if grid[i][x] == 1 and y != i:
                    graph[y,x].add((i,x))
            for i in range(w):
                if grid[y][i] == 1 and x != i:
                    graph[y,x].add((y,i))
        
				# dfs 로 연결되어 있는 node 로 이동하고 같은 그룹으로 묶어준다.
        def dfs(y, x, group, visited):
            if (y,x) in visited:
                return
            visited.add((y,x))
            groups[group].append((y,x))
            for nxt_y, nxt_x in graph[y,x]:
                dfs(nxt_y, nxt_x, group, visited)
        visited = set()
        groups = collections.defaultdict(list)
        group = 0
        for y, x in computers.keys():
            dfs(y, x, group, visited)
            group+=1
        # print(groups)
        return sum([len(v) for v in groups.values() if len(v) > 1])
```

위의 코드의 시간 복잡도는 몇일까?

computers 의 크기는 최대 `O(h*w)` 가 된다. 즉 edge 의 크기는 최대 `O(h*w*max(h,w))` 가 된다.

dfs 는 `O(V+E)` 이기 때문에 시간복잡도는 `O(h*w*max(h,w))` 가 된다.

  

## Graph 안쓰고 바로 풀기

이번에는 graph 로 바꾸지 말고 바로 풀어보도록 하자.

```python
class Solution:
    def countServers(self, grid: List[List[int]]) -> int:
        h, w = len(grid), len(grid[0])
        visited = set()
        groups = collections.defaultdict(list)
        group = 0
        def dfs(y, x, group, visited):
            if (y,x) in visited:
                return
            visited.add((y,x))
            groups[group].append((y,x))
            for i in range(h):
                if grid[i][x] == 1 and i != y:
                    dfs(i, x, group, visited)
            for i in range(w):
                if grid[y][i] == 1 and i != x:
                    dfs(y, i, group, visited)
                    
        for y in range(len(grid)):
            for x in range(len(grid[y])):
                if grid[y][x] == 1:
                    dfs(y, x, group, visited)
                    group+=1
        # print(groups)
        return sum([len(v) for v in groups.values() if len(v) > 1])
```

dfs 안에서 바로 다음 server 을 찾는다. 시간복잡도의 변화는 없다.

  

## Union Find 사용하기

group 을 짓는 방법은 DFS 이외에도 `UnionFind(disjoint set)` 을 사용하는 방법이 있다.

이번에는 Union Find 을 사용해서 풀어보자.

서로 이어지는 y 와 x 을 이용해서 같은 그룹으로 묶어줍니다.

```python
class UnionFind:
    def __init__(self, n):
        self.par = [i for i in range(n)]
        self.cnt = [1 for _ in range(n)]
    def find(self, a):
        if self.par[a] == a:
            return a
        self.par[a] = self.find(self.par[a])
        return self.par[a]
    
    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.par[b] = a
            self.cnt[a] += self.cnt[b]
            self.cnt[b] = 0
        
class Solution:
    def countServers(self, grid: List[List[int]]) -> int:
        h, w = len(grid), len(grid[0])
        computers = dict()
        for y in range(h):
            for x in range(w):
                if grid[y][x] == 1:
                    computers[y, x] = len(computers)
        n = len(computers)
				# x 로 이어진 그룹
        union_find_x = UnionFind(n)
				# y 로 이어진 그룹
        union_find_y = UnionFind(n)
        for y in range(len(grid)):
            for x in range(len(grid[y])):
                if grid[y][x] == 1:
                    for i in range(h):
                        if grid[i][x] == 1 and i != y:
                            union_find_y.union(computers[y,x], computers[i,x])
                    for i in range(w):
                        if grid[y][i] == 1 and i != x:
                            union_find_x.union(computers[y,x], computers[y,i])
        for i in range(n):
            union_find_y.find(i)
            union_find_x.find(i)
        # y 로 이어진 곳도 없고, x 로 이어진 곳이 없다면 통신 안하는 서버.
				# 전체 서버에서 통신 안하는 서버를 빼면 통신하는 서버의 갯수가 나온다.
        return n - sum(1 for i in range(n) if union_find_y.cnt[i] == union_find_x.cnt[i] == 1)
```

위의 코드도 시간복잡도는 `O(h*w*max(h,w))` 가 됩니다. (union find 의 alpha 을 상수로 생각)

  

## 최적화

이제 마지막으로 위의 아이디어을 이용해서 최적화을 해봅시다. 위의 unionFind 에서 사용한 아이디어는 y 로 이어진 그룹, x 로 이어진 그룹을 만드는 것 이였습니다.

이번에도 마찬가지로 x 로 이어진 그룹, y 로 이어진 그룹을 만듭니다.

이제 xs, ys 을 통해서 서로 어떤 컴퓨터가 이어졌는지 알 수 있습니다.

만약 서로 이어진 컴퓨터가 없다면 그것이 정답입니다.

시간 복잡도는 `O(h*w)` 가 됩니다.

```python
class Solution:
    def countServers(self, grid: List[List[int]]) -> int:
        xs = collections.defaultdict(list)
        ys = collections.defaultdict(list)
        computers = [(y,x) for y in range(len(grid)) for x in range(len(grid[y])) if grid[y][x]==1]
        for id, (y, x) in enumerate(computers):
            xs[x].append(id)
            ys[y].append(id)
        # print(computers)
        return len([id for id, (y, x) in enumerate(computers) if len(ys[y])>1 or len(xs[x]) > 1])
```

  

공간 복잡도도 최적화 할 수 있습니다. 우리가 원하는 건 단순히 갯수 이기 때문에 누가 어떻게 연결되었는지 알 필요가 없습니다. 밑의 코드의 공간 복잡도는 `O(h+w)` 가 됩니다.

```python
class Solution:
    def countServers(self, grid: List[List[int]]) -> int:
        h, w = len(grid), len(grid[0])
        xs = collections.Counter()
        ys = collections.Counter()
        cnt = 0
        for y in range(h):
            for x in range(w):
                if grid[y][x] == 1:
                    xs[x]+=1
                    ys[y]+=1
                    cnt +=1
        
        return cnt - sum([1 for y in range(h) for x in range(w) if grid[y][x] == ys[y] == xs[x] == 1])
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
