---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Union-Find
---

# 765. Couples Holding Hands

## 문제

[LeetCode 765](https://leetcode.com/problems/couples-holding-hands/) • **Hard**

이 문제를 풀기 전에 조금 더 쉬운 문제를 풀어보자.

길이가 N인 정수배열(`nums`)가 있고, 정수들이 `0 ~ N-1` 이 1번씩 들어있고, 순서는 랜덤이라고 하자. 배열에서 숫자 2개를 골라서 서로 자리를 바꿀 수 있다고 했을 때 `nums[i] = i` 을 만족하기 위해서 swap 의 최소 횟수는 어떻게 구할 수 있을까?

만약 배열이 `[2, 3, 1, 0, 5, 4]` 라고 하자. 우리는 인덱스 0 에서 0이 나오기를 원한다. 하지만 2 가 존재한다. index 2 에는 1, index 1 에는 3, index 3 에는 0 이렇게 이어진다.

즉 `0 → 2 → 1 → 3 → 0` 이런 식으로 이어진다. 즉 0,1,2,3 은 5,4 와 자리를 바꿀 필요가 없이 자기들끼리 자리만 바꾸어도 조건을 만족할 수 있다. 이런식으로 우리는 숫자를 몇개의 그룹으로 나눌 수 있다. 그렇다면 길이가 `k` 인 그룹에서 swap 의 최소의 횟수는 몇일까? 그건 `k-1` 이다.

증명은 귀류법을 이용해서 간단하게 할 수 있다. 길이가 `k` 인 그룹에서 1개의 swap 을 이용해서 `k-1` 의 그룹으로 바꿀 수 있다(1개의 자리를 맞춰줄 수 있음) 이렇게 1씩 줄여나가 보면 2 개일 경우 1번의 swap 이 최선이 될 것 이고, 즉 `k-1` 이 최선이 되는 것을 알 수가 있다.

```python
def swap(arr, i, j):
 arr[i], arr[j] = arr[j], arr[i]

def solve(nums):
 ans = 0
 for i in range(len(nums)):
  j = nums[i]
  while i is not j:
   swap(nums, i, j)
   ans+=1
   j = nums[i]
 return ans
```

### Union Find 을 사용하는 방법

위의 문제에서는 자리가 고정되어 있었다. 하지만 이번 문제는 고정된 자리가 없기 때문에 어려워 보인다. 조금 생각해 보면 숫자 1개가 자리를 만들고 1개가 거기에 찾아 들어가는 느낌으로 보면 위의 문제와 비슷하게 생각 할 수 있다. 일단 2개의 커플은 항상 `[2n, 2n+1] (n=0...)` 의 짝 으로 만 들어갈 수 있다. 즉 두 개씩 끊어서 여기서 2개의 숫자를 모두 바꿀 필요는 없다. 한쪽의 숫자에 맞춰서 한쪽의 숫자를 스왑시키면 된다. 위에서는 index 에 따라서 스왑시켰지만 이번에는 옆의 숫자에 따라서 스왑을 하면 된다.

첫번째로 Union-Find 을 통해서 그룹을 만드는 방식으로 문제를 풀 수 있다. 위에서 숫자를 group 시킨 것과 같은 원리이다.

```python
def solve(nums):
 n = int(nums/2)
 ans = 0

 groups = []
 for i in range(n):
    # 무조건 [0,1] [2,3] [4,5] 의 index 으로만 짝이 지어진다.
  # [0][1,2][3,4][5] 는 안됨
  groups.append(i, i)
 
 for i in range(n):
  person1, person2 = nums[i*2], nums[i*2+1]
  couple1, couple2 = int(person1/2), int(person2/2)
  if couple1 is not couple2:
   # 위의 문제에서 숫자를 group 것과 동일하다.
   if find_group(groups, person1) is not find_group(groups, person2):
    ans+=1
    union(groups, person1, person2)
 return ans

def find_group(groups, person):
 return groups[person]

def union(groups, person1, person2):
 for i in range(n):
  if groups[i] == groups[person2]:
   groups[i] = groups[person1]
```

총 N 개의 원소를 업데이트 하기 때문에 `O(N^2)` 가 된다.

### 최적화

자리를 바꾸는 곳이 정해져 있기 때문에 맨 처음의 문제처럼 자리를 바꾼다.

```python
def solve(nums):
 ans=0
 n = len(nums)

 pos = [0]*n
 for i in range(n):
  pos[nums[i]]=i
 
 for i in range(n):
  j = ptn(pos[ptn(nums[i])])
  while i != j:
   j = ptn(pos[ptn(nums[i])])
   swap(nums, i, j)
   swap(pos, nums[i], nums[j])
   ans+=1
 return ans
def ptn(i):
 return i+1 if i%2==0 else i-1
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
