---
tags:
  - LeetCode
  - Algorithm
  - Challenge-30Days
---

# 136. Single Number

## 문제

[LeetCode 136](https://leetcode.com/problems/single-number/) •**Easy**

일단 문제를 처음 봤을 때, 가장 쉽게 생각 날 수 있는 방법 부터 풀어보자.

## Hash Map 을 이용한 Counting

가장 쉬운 방법은 모든 수를 다 세어본 후 1개만 들어있는 수를 출력하는 것이다.

```python
class Solution:
    def singleNumber(self, nums: List[int]) -> int:
        counter = dict()
        for num in nums:
            # counter 초기화
            if num not in counter:
                counter[num]=0
            counter[num] +=1
        
        # counter 에는 숫자가 key, 나온 횟수가 value 이기 때문에
        for key, value in counter.items():
            # 만약 나온 횟수가 1번 이라면
            if value == 1:
                # 정답
                return key
```

## Set 을 이용한 계산

이제 좀더 생각해 보면 nums 의 합은 밑의 식으로 표현 될 수 있다.(만약 a_0 가 한번만 나온 수라고 가정하면)

$a_0 + \sum_{i=1}^{n} 2 \times a_i$

그렇다면 밑의 식이 성립한다. 밑의 첫항은 nums 의 모든 수를 한번 씩만 더한것이다.

$2\sum_{i=0}^{n} a_i - (a_0 + \sum_{i=1}^{n} 2 \times a_i) = a_0$

```python
class Solution:
    def singleNumber(self, nums: List[int]) -> int:
        s = set(nums)
        return 2*sum(s) - sum(nums)
```

## XOR 을 이용한 방법

이 문제에서 가장 유명한 방법이다. xor 의 특성상 교환 법칙과 분배법칙이 성립한다.

즉 `a^b^c^d^a^c^b` 라면 `a^a^b^b^c^c^d` 로 순서를 바꿔서 계산이 가능 하고, `0^0^0^d` 가 되기 때문에 우리가 원하는 1번만 나온 수만 찾을 수 있을 것이다.

```python
class Solution:
    def singleNumber(self, nums: List[int]) -> int:
        res = 0
        for num in nums:
            res = res ^ num
        return res
```

## Bit 을 세어주는방법

정답이 32Bit 라고 할 경우, 모든 비트에 대해서 총 몇번이 나와 주었는지 세어주고 만약 홀수 번 나왔다면 1번 나온 숫자가 그 bit 을 사용한다는 것이다. 즉 정답에 그러한 bit 을 1로 만들어 준다.

XOR 의 경우 이러한 방법을 XOR의 특성을 이용해서 보다 간단하게 만든것이다.

```python
class Solution:
    def singleNumber(self, nums: List[int]) -> int:
        res = 0
    for i in range(33):
      cnt = 0
      for num in nums:
        cnt += 1 if (num >> i) & 1 == 1 else 0
      if cnt %2 == 1:
        res = res | 1<<i
        return res
```

## Quick Select 을 변형한 방법

만약 어떠한 수(pivot)를 기준으로 이 nums 을 나눈다고 해보자. pivot 보다 작은 수를 left, pivot 보다 크거나 같은 수를 right 라고 하자. 만약 left 의 갯수가 홀수라면 어떤 걸 의미할까?

한 숫자만 제외 하고 모든 수는 2번씩 출현한다. 즉 left 의 갯수가 홀수라는건 우리가 원하는 1번만 출현한 숫자가 left 안에 존재한다는 것을 의미한다. 그렇다면 다시 left 만 가지고 방금의 작업을 반복한다.

이걸 1개의 숫자가 남을 때 까지 반복하면, 우리가 원하는 정답을 얻을 수 있다.

시간복잡도는 평균 `O(N)` 최악 `O(N^2)` , 공간복잡도는 `O(1)` 이 된다.

```python
class Solution:
    def singleNumber(self, nums: List[int]) -> int:
        def sort(lo, hi):
            pivot = random.randint(lo, hi)
            nums[pivot], nums[hi] = nums[hi], nums[pivot]
            pivot = nums[hi]
            l, r = lo, hi-1
            while l <= r:
                if nums[l] >= pivot:
                    nums[l], nums[r] = nums[r], nums[l]
                    r-=1
                else:
                    l+=1
            return (r-lo+1, r+1)
        lo, hi = 0, len(nums)-1
        while lo < hi:
            cnt, mid = sort(lo, hi)
            if cnt %2 == 0:
                lo = mid
            else:
                hi = mid-1
        return nums[lo]
```

## Follow Up

- 만약 모든수가 K 만큼 출현한다고 할때 어떻게 풀수 있을까?

    이 때는 2가지 방법이 있다.

    XOR 을 제외한 나머지 방법들을 사용할 수 있다.

    Bit 을 세어주는 방법의 경우 그대로 Bit 을 세어주고 K 로 나누었을 때 나머지가 있는지 없는지로 판별하면 된다.

    두번 째는 Quick Select 을 그대로 이용한 방법이 있다.

    이 경우에는 XOR 을 사용한 방법은 사용할 수 없다.

    Quick Select 을 사용한 방법에서는 left, right 의 갯수가 k의 배수인지 아닌지를 판별하면 된다.

이 문제를 Time Complexity `O(N)` Space Complexity `O(1)` 에 풀어보자.

가장 유명한 방법은 XOR 을 사용하는 것이다

```python
X^X = 0
# 을 이용
X^X^Y^Y^Z = (X^X)^(Y^Y)^Z = 0^0^Z = Z
```

하지만 이러한 방법은 푸는 법을 몰랐을 때 면접장에서 바로 떠오르기는 힘들다.

보다 면접에서 사용할 만한 방법이 있을까?

문제에서 우리는 다른 숫자들은 2번씩, 우리가 찾고자 하는 숫자만 1개가 있다고 한다.

Quick Sort 처럼 1개의 숫자를 pivot 으로 잡는다고 가정해보자

그러면 왼쪽, pivot, 오른쪽 으로 분배가 될 것이다.

배열이 `[1,2,3,4,4,2,1]` 이고 3을 피벗으로 잡는다면

`[1,2,2,1]` `3` `[4,4]` 이렇게 된다. 왼쪽, 오른쪽이 둘다 짝수 이기 때문에 우리가 잡은 피벗이 single number 라는 걸 알 수가 있다.

피벗이 2라면 `[1,1]` `[2,2]` `[3,4,4]` 가 되니 그 오른쪽이 홀수 가 된다는 것을 알 수가 있다. 그러면 오른쪽을 다시 한번 같은 방법으로 탐색하면 된다.

만약 왼쪽의 갯수가 홀수라면 우리가 찾는 숫자는 여기에 있을 것이다.

반대로 오른쪽의 갯수가 홀수라면 우리가 찾는 숫자는 오른쪽에 있을 것이다.

만약 왼쪽, 오른쪽 둘다 짝수라면 pivot 이 우리가 찾는 숫자일 것이다.

이것을 python 에서 구현해 보자.

밑의 방법에 대한 자세한 설명은

[[Spaces/Home/PARA/Resource/Leetcode/75. Sort Colors]]

에 나와있다.

```python
class Solution:
    def singleNumber(self, nums: List[int]) -> int:
        left, right = 0, len(nums)-1
        
        while True:
      # 적당히 pivot 을 고른다.
            pivot = nums[left]
            # 3-way-sort 을 한다.
            left_idx, right_idx = left, right
            mid_idx = left
            while mid_idx <= right_idx:
                if nums[mid_idx] > pivot:
                    nums[right_idx], nums[mid_idx] = nums[mid_idx], nums[right_idx]
                    right_idx-=1
                elif nums[mid_idx] == pivot:
                    mid_idx+=1
                else:
                    nums[mid_idx], nums[left_idx] = nums[left_idx], nums[mid_idx]
                    mid_idx+=1
                    left_idx+=1
                    
            # 만약 pivot보다 작은숫자가 홀수개 라면 right=left_idx-1 로 하고 다시 반복한다.        
            if (left_idx - left) % 2 == 1:
                left, right = left, left_idx-1
            elif (right - right_idx)%2 == 1:
                left, right = right_idx+1, right
      # 왼쪽, 오른쪽 둘다 짝수라면 pivot 을 반환한다.
            else:
                return pivot
```

## Follow UP

만약 1개만 들어있는 숫자가 2개라면?

- 정답

    일단 그 숫자들을 A,B 라고 하자. 그러면 전체를 XOR 한다면 A^B 을 얻게 된다. A^B 의 값에서 비트가 1인 것을 아무거나 하나 잡자. 이건 A,B 가 서로 다른 비트를 가졌다는 의미다. 이걸 이용해서 A,B 를 나눌 수 있다.

    ```python
    def find_two_single_numbers(nums):
        # Step 1: XOR all elements
        xor_all = 0
        for num in nums:
            xor_all ^= num
    
        # Step 2: Find a set bit
        set_bit = xor_all & ~(xor_all - 1)
    
        # Step 3 & 4: Partition and XOR
        num1, num2 = 0, 0
        for num in nums:
            if num & set_bit:
                num1 ^= num
            else:
                num2 ^= num
    
        return [num1, num2]
    ```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
