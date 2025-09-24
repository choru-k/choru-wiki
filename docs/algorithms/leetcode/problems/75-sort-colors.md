---
tags:
  - LeetCode
  - Algorithm
  - Greedy
---

# 75. Sort Colors

## 문제

[LeetCode 75](https://leetcode.com/problems/sort-colors/) •**Easy**

## Brute Force

가장 간단하게 생각할 수 있는 방법은 bucket sort 이다.

```python
class Solution:
    def sortColors(self, nums: List[int]) -> None:
        """
        Do not return anything, modify nums in-place instead.
        """
        cnt = [0,0,0]
        for num in nums:
            cnt[num]+=1
        
        k=0
        for i in range(len(nums)):
            while cnt[k] == 0:
                k+=1
            nums[i] = k
            cnt[k]-=1
```

# Follow Up

이제 Follow Up 을 보자.

- Could you come up with a one-pass algorithm using only constant space?

일단 숫자가 0, 1 만 존재한다고 생각을 해보자.

그러면 어떻게 하면 될까?

0은 왼쪽부터 1을 오른쪽 부터 넣는다면 정렬이 된 배열을 얻을 수 있을 것 같다.

## Only 0-1 (Left - Right)

```python
class Solution:
    def sortColors(self, nums: List[int]) -> None:
        zero_idx = 0
        one_idx = len(nums)-1
        i=0
        
        while i < one_idx:
            if nums[i] == 0:
                nums[zero_idx] = 0
                zero_idx+=1
            if nums[i] == 1:
                nums[one_idx] = 1
                one_idx -= 1
            i+=1
```

하지만 우리는 3개의 숫자를 정렬을 해야하고 왼쪽 오른쪽 이외의 곳에도 숫자를 넣어야 한다.

그 전에 0,1 만 존재할 때 왼쪽, 오른쪽 부터 넣는 방법 말고 또다른 방법이 있을까?

만약 우리가 이미 정렬된 `[0,0,0,1,1]` 이란 배열이 존재할 때 0, 1을 넣는 다고 할 때를 생각해보자.

1인 경우는 간단하다. 그냥 맨 뒤에 넣기만 하면 된다. 0인 경우는 1을 맨 뒤에 넣고, 첫번째 1을 0으로 바꾸어 주면 된다.

이걸 코드로써 표현을 해보자

### Only 0-1 (Left - Mid)

```python
class Solution:
    def sortColors(self, nums: List[int]) -> None:
        zero_idx = 0
        one_idx = 0
        
        for i in range(len(nums)):
            if nums[i] == 1:
                nums[one_idx]=1
                one_idx+=1
            if nums[i] == 0:
                nums[one_idx]=1
                one_idx+=1
                
                nums[zero_idx]=0
                zero_idx+=1
```

이제 숫자가 3개 일 때 할 수 있는 방법을 찾을 수 있다. 위의 2방법을 합쳐서 0은 왼쪽 2는 오른쪽 1은 바로 위처럼 0 다음의 index 을 활용 하면 할 수 있다. 또는 바로 위의 방법을 응용해서 3개의 인덱스를 사용하는 방법도 존재한다.

### 3개의 인덱스를 사용한 방법 (Left, Mid-1, Mid-2)

```python
class Solution:
    def sortColors(self, nums: List[int]) -> None:
        zero_idx = 0
        one_idx = 0
        two_idx = 0
        
        for i in range(len(nums)):
            if nums[i] == 2:
                nums[two_idx]=2
                two_idx+=1
                
            if nums[i] == 1:
                nums[two_idx]=2
                two_idx+=1
                
                nums[one_idx]=1
                one_idx+=1
            if nums[i] == 0:
                nums[two_idx]=2
                two_idx+=1
                
                nums[one_idx]=1
                one_idx+=1
                
                nums[zero_idx]=0
                zero_idx+=1
```

왼쪽에는 0, 오른쪽에는 2 중간에 1을 넣는 방법

### Left-Mid-Right

```python
class Solution:
    def sortColors(self, nums: List[int]) -> None:
        zero_idx = 0
        one_idx = 0
        two_idx = len(nums)-1
        
        while one_idx <= two_idx:
            if nums[one_idx] == 2:
                nums[two_idx], nums[one_idx] = nums[one_idx], nums[two_idx]
                two_idx-=1
            
            elif nums[one_idx] == 1:
                one_idx+=1
            
            elif nums[one_idx] == 0:
                nums[one_idx] = 1
                one_idx+=1
                nums[zero_idx]=0
                zero_idx+=1
        # 위의 코드를 이렇게 고칠 수 있습니다.
        # nums[one_idx], nums[zero_idx] = nums[zero_idx], nums[one_idx]
                # one_idx+=1
                # zero_idx+=1
```

조금 더 생각해본다면 zero_idx, one_idx 만으로 문제를 풀 수 있다.

zero 와 one 이 잘 들어가 있다면 남은것도 어쩔 수 없이 잘 들어가 있을 수 밖에 없다.

```python
class Solution:
    def sortColors(self, nums: List[int]) -> None:
        """
        Do not return anything, modify nums in-place instead.
        """
        zero_idx = 0
        one_idx = 0
        for i in range(len(nums)):
            if nums[i] == 0:
                nums[zero_idx], nums[i] = nums[i], nums[zero_idx]
                zero_idx += 1
                one_idx = max(one_idx, zero_idx)
      # elif 가 아닌것이 핵심이다.
            if nums[i] == 1:
                nums[one_idx], nums[i] = nums[i], nums[one_idx]
                one_idx += 1
```

## Follow Up

Space Complexity 가 O(1) 이 되는 Quick Sort 을 구현하기

[https://leetcode.com/problems/sort-an-array/](https://leetcode.com/problems/sort-an-array/)

```python
# 위의 SortColor 와 비슷한 모양이 됩니다.
# 3-Way QuickSort 라고 검색 하시면 보다 자세한 내용이 나옵니다.

class Solution:
    def sortArray(self, nums: List[int]) -> List[int]:
        self.sort(nums, 0, len(nums)-1)
        return nums
    
    def sort(self, nums, low, high):
        if low >= high: 
            return
        pivot = nums[high]

        idx = low
        small_idx = low
        big_idx = high

        while idx <= big_idx:
            if nums[idx] > pivot:
                nums[idx], nums[big_idx] = nums[big_idx], nums[idx]
                big_idx -= 1
            elif nums[idx] == pivot:
                idx+=1
            elif nums[idx] < pivot:
                nums[small_idx], nums[idx] = nums[idx], nums[small_idx]
                idx+=1
                small_idx+=1
        self.sort(nums, low, small_idx-1)
        self.sort(nums, idx, high)
```

실제로는 Call stack 때문에 평균 O(logN) 최악의 경우 O(N) 의 공간 복잡도를 사용합니다.

## Follow up 2

in-place nth-element 구현해보기.

[https://leetcode.com/problems/kth-largest-element-in-an-array/](https://leetcode.com/problems/kth-largest-element-in-an-array/)

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
