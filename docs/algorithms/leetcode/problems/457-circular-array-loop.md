---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Linked-List
---

# 457. Circular Array Loop

## 문제

[LeetCode 457](https://leetcode.com/problems/circular-array-loop/) • **Medium**

## 핵심 아이디어

일단 문제를 보면 LinkedList 와 유사한 방법으로 풀 수 있다는 것을 알 수가 있다.

왜냐하면 현재의 Node 에서 갈수 있는 next Node 가 1개 밖에 없기 때문이다.

  

가장 간단한 방법을 생각해보면 각 Node 에서마다 Circular Array Loop 가 되는지 확인해 보는 것이다.

## Solution

```python
class Solution:
    def circularArrayLoop(self, nums: List[int]) -> bool:
        if not nums or len(nums) < 2:
            return False
        
        n = len(nums)
        for i in range(n):           
            path = dict()
            k = i
            order = 0
            while k not in path and nums[i] * nums[k] > 0:
                path[k] = order
                order+=1
                k = (k + nums[k]) % n
						# Loop 가 만들어 졌는지 k in path 로 확인
						# order - path[k] == 1 이라는 것은 현재 loop 가 길이가 1이상인걸 확인
            if k in path and order - path[k] > 1:
                return True
                
        return False
```

  

```python
class Solution:
    def circularArrayLoop(self, nums: List[int]) -> bool:
        if not nums or len(nums) < 2:
            return False
        
        n = len(nums)
        for i in range(n):           
            path = set()
            k = i
            while k not in path and nums[i] * nums[k] > 0:
                path.add(k)
                k = (k + nums[k]) % n
						# 길이가 1 이상인건 nums[k]%n != 0 로 확인 가능.
            if k in path and nums[k]%n != 0:
                return True
                
        return False
```

위의 방법들은 시간복잡도 `O(N^2)` 공간복잡도 `O(N)` 이 된다.

  

일반적으로 Graph 에서 Cycle 을 찾을때 grey-black 으로 색깔을 칠하는 방법이 유명하다

- [https://www.geeksforgeeks.org/detect-cycle-direct-graph-using-colors/](https://www.geeksforgeeks.org/detect-cycle-direct-graph-using-colors/)
- [https://www.youtube.com/watch?v=rKQaZuoUR4M](https://www.youtube.com/watch?v=rKQaZuoUR4M)

위의 유튜브을 보면 쉽게 이해가 될 것이다.

핵심은 현재 visiting 중인 것을 grey, visited 인 것을 black 에 넣는다.

즉 visiting 과 visited, not visit 을 구분해서 그래프을 순회한다. 만약 visiting 인 node 을 만나면 그 때 cycle 이 발생한 것이다.

밑은 이러한 방법을 통해서 구현한 코드이다.

```python
class Solution:
    def circularArrayLoop(self, nums: List[int]) -> bool:
        grey, black = set(), set()
        
        def find_circle(node, dirt):
            # change direction
            if nums[node] * dirt < 0:
                return False
            if node in grey:
                return True
            if node in black:
                return False
            grey.add(node)
            nxt = (node + nums[node]) % len(nums)
						# 1개로만 cycle 을 만들면 안된다.
            if nxt != node and find_circle(nxt, nums[node]) == True:
                return True
            grey.remove(node)
            black.add(node)
            return False
            
        for i in range(len(nums)):
            if find_circle(i, 1):
                return True
        grey, black = set(), set()
        for i in range(len(nums)):
            if find_circle(i, -1):
                return True
        return False
```

  

숫자의 범위가 나와있기 때문에 1000 보다 큰 수을 이용해서 공간복잡도을 줄일 수 있다.

밑은 grey, black 을 set 을 사용하는 대신에 배열에 숫자을 더해서 표현하였다.

```python
class Solution:
    def circularArrayLoop(self, nums: List[int]) -> bool:

        def in_grey(num, dirt):
            return dirt*num // 1000 == 1
        def in_black(num, dirt):
            return dirt*num // 1000 == 2
        
        def find_circle(node, dirt):
            # change direction
            if nums[node] * dirt < 0:
                return False
            if in_grey(nums[node], dirt):
                return True
            if in_black(nums[node], dirt):
                return False
            val = nums[node]
            nums[node] += 1000 * dirt
            nxt = (node + val) % len(nums)
            if nxt != node and find_circle(nxt, dirt) == True:
                return True
            nums[node] += 1000 * dirt
            return False
            
        for i in range(len(nums)):
            if find_circle(i, 1):
                return True
        for i in range(len(nums)):
            if find_circle(i, -1):
                return True
        return False
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
