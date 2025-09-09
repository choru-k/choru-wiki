---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Hash-Table
---

# 496. Next Greater Element I

## 문제

[LeetCode 496](https://leetcode.com/problems/next-greater-element-i/) • **Medium**

## Brute force

일단 가장 무식한 방법으로 풀어봅시다.

nums1 에서 숫자을 1개씩 골라서 num2 에서 같은 숫자을 찾고

그 숫자보다 오른쪽에 있는 숫자 중에서 더 큰 숫자가 존재하면 ans 에 넣고,

없으면 -1 을 넣으면 됩니다.

시간 복잡도는 `O(N^2)` 가 되겠네요.

```python
class Solution:
    def nextGreaterElement(self, nums1: List[int], nums2: List[int]) -> List[int]:
        ans = []
        for num in nums1:
            idx = nums2.index(num)
            for greater in nums2[idx+1:]:
                if greater > num:
                    ans.append(greater)
                    break
            else:
                ans.append(-1)
        return ans
```

  

## 최적화

일단 최적화 시킬 수 있는 곳이 하나 보이네요.

num2 의 인덱스을 매번 구하는게 아니라 미리 hash_table 에 넣어두고 가져다 씁시다.

시간복잡도는 똑같지만 보다 효율적으로 움직입니다.

```python
class Solution:
    def nextGreaterElement(self, nums1: List[int], nums2: List[int]) -> List[int]:
        ans = []
        num2_to_idx = {num:idx for idx, num in enumerate(nums2)}
        for num in nums1:
            idx = num2_to_idx[num]
            for greater in nums2[idx+1:]:
                if greater > num:
                    ans.append(greater)
                    break
            else:
                ans.append(-1)
        return ans
```

  

## 최적화 2

일단 num1 은 무시하고, num2 에 대해서만 생각을 해보죠.

어차피 num2 에 대해서만 정답을 구한다면 num1 에 대해서는 바로 정답을 구할 수 있습니다.

그렇다면 어떻게 특정 숫자보다 오른쪽에 있는 숫자들 중에서 큰 숫자을 쉽게 구할 수 있을까요?

우리는 스택을 이용할 수 있습니다.

`[5,3,2,4,1,6]` 라는 배열이 있다고 해봅시다. 여기서 `[5,3,2]` 을 가지고 스택을 만듭니다.

우리는 이 stack 을 내림차순으로 유지 하고 싶습니다.

이제 4가 들어올 차례군요. 내림차순으로 유지을 하고 싶기 때문에 2,3 을 빼야 합니다.

즉 2,3 의 next greater 는 4가 됩니다.

이제 스택은 [5,4] 가 됩니다. 이제 1이 들어올 차례 입니다. 그대로

[5,4,1] 이 됩니다. 이제 6이 들어올 차례인데 내림차순으로 유지해야 하기 때문에

[6] 이 되고, 5,4,1 의 next greater 는 6 이 됩니다.

이제 더 이상 들어올 숫자는 없고 stack 에 남아있는 숫자들은 next greater 가 존재하지 않습니다.

  

이 알고리즘을 구현한 코드가 밑에 있습니다. 시간복잡도는 `O(N)` 이 됩니다.

```python
class Solution:
    def nextGreaterElement(self, nums1: List[int], nums2: List[int]) -> List[int]:
        num2_greater = dict()
        st = []
        for num in nums2:
            while len(st) > 0 and st[-1] < num:
                num2_greater[st.pop()] = num
            st.append(num)
        while len(st) > 0:
            num2_greater[st.pop()] = -1
        return [num2_greater[num] for num in nums1]
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
