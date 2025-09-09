---
tags:
  - LeetCode
  - Algorithm
  - Stack
---

# 456. 132 Pattern

## 문제

[LeetCode 456](https://leetcode.com/problems/132-pattern/) • **Medium**

천천히 풀어보자

  

가장 쉬운 방법은 무식하게 하는 방법으로 O(N^3) 이 된다.

  

좀 더 생각해보자. 우리는 이 문제를 풀 수 있는 방법 3가지를 가지고 있다.

- 1, 3 을 구하고 2을 구하는 방법
- 1, 2 을 구하고 3을 구하는 방법
- 3,2 을 구하고 1을 구하는 방법

  

각각의 방법들로 푸는 방법을 생각해보자.

### 1,3 을 구하고 2을 구하는 방법

일단 가장 유리한 1을 찾는건 간단하다. left→right 순으로 읽어 들이면서 가장 작은 수를 1 이라고 하고 현재의 수를 3 으로 한 뒤 다시 loop 을 통해서 2을 구하는 방법이다.

```python
class Solution:
    def find132pattern(self, nums: List[int]) -> bool:
        first = float('inf')
        for i in range(len(nums)):
            if first >= nums[i]:
                first = nums[i]
            else:
                # 현재의 숫자를 3 으로 한다.
                third = nums[i]
                for j in range(i+1, len(nums)):
                    if first < nums[j] and nums[j] < third:
                        return True
        return False
```

  

시간 복잡도가 `O(N^2)` 가 되서 Time Limit Exceeded 가 된다.

  

### 1, 2 을 구하고 3을 구하는 방법

1은 left → right 로 구하고, 2 는 right → left 로 돌면서 구해야 한다.

일단 1은 left → right 로 진행하면서 가장 최솟값이 된다. 그렇다면 2 는 어떻게 될까?

가장 유리한 2는 1 보다 큰 숫자들 중 가장 작은 숫자이다. 그래야 3이 성립하기 쉬워지기 때문이다.

```python
class Solution:
    def find132pattern(self, nums: List[int]) -> bool:
        if len(nums) <3:
            return False
        
        firsts = [0] * len(nums)
        firsts[0] = nums[0]
        for i in range(1, len(nums)):
            firsts[i] = min(firsts[i-1], nums[i])
        
        seconds = [0] * len(nums)
        st = [float('inf')]
        for i in range(len(nums))[::-1]:
            st.append(nums[i])
						# 현재 i 보다 왼쪽에 있는 숫자중 최솟값을 first 로써 사용
						# first[i-1] >= st[-1] 이면 second 가 될 수 없기 때문에 pop
            while len(st) > 0 and firsts[i-1] >= st[-1]:
                st.pop()
            seconds[i] = st[-1]
        
        # print(firsts)
        # print(seconds)
        for i in range(1, len(nums)-1):
						# 이미 first < second 만족 했기 때문에 second < third 만 비교
            if seconds[i+1] < nums[i]:
                return True
            
            
        return False
```

시간 복잡도는 `O(N)` 이 된다.

  

### 3,2 을 구하고 1을 구하는 방법

3,2 둘다 left → right 로 구한다.

3(third) 은 `자신보다 오른쪽에 있는 수중에 더 작은 수가 존재하는 수` 중의 최댓값이다.

즉 `[4,2,1,3]` 의 경우 오른쪽부터 생각하면 3 은 오른쪽에 더 작은 수가 존재 하지 않기 때문에 third는 존재 x.

1 도 더 오른쪽에 더 작은 수가 존재 안하기 때문에 third = x

2 는 오른쪽에 더 작은 수 1이 존재하기 때문에 third = 2

4 도 오른쪽에 더 작은 수가 존재하기 때문에 third = 4

second 는 third 보다 오른쪽에 있는 수들 중 가장 큰 수이다.

  

```python
class Solution:
    def find132pattern(self, nums: List[int]) -> bool:
        if len(nums) <3:
            return False
        
        st = []
        third_second = [] * len(nums)
        second = float('-inf')
        third = float('-inf')
        for num in nums[::-1]:
            while len(st) > 0 and num > st[-1]:
                third = num
                second = st.pop()
            st.append(num)
            third_second.append((third, second))
        
        third_second.reverse()
        # print(third_second)
        for i in range(len(nums)-1):
            first = nums[i]
            if first < third_second[i+1][1] < third_second[i+1][0]:
                return True
        return False
```

  

One pass 최적화

```python
class Solution:
    def find132pattern(self, nums: List[int]) -> bool:
        if len(nums) <3:
            return False
        
        st = []
        second = float('-inf')
        for num in nums[::-1]:
            if num < second:
                return True
            while len(st) > 0 and num > st[-1]:
                second = st.pop()
            st.append(num)
            
        return False
```

  

적당히 문제 풀 때 스케치.

![[E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202.svg]]

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
