---
tags:
  - LeetCode
  - Algorithm
  - Greedy
  - Math
  - Monotonic-Stack
---

# 135. Candy

## 문제

[LeetCode 135](https://leetcode.com/problems/candy/) •**Medium**

## 2 Array Method

문제를 조금 나누어 보자.

왼쪽의 rating 에 대해서만 규칙을 적용한다고 하면 어떻게 될까?

밑의 코드처럼 쉽게 구현될 것이다.

마찬가지로 오른쪽도 같은 방법을 사용해보자.

```python
class Solution:
    def candy(self, ratings: List[int]) -> int:
        left2right = [1 for _ in range(len(ratings))]
        
        
        for i in range(len(ratings)-1):
            if ratings[i] < ratings[i+1]:
                left2right[i+1] = left2right[i]+1
            else:
                left2right[i+1] = 1  
        
        
        return left2right
```

우리가 원하는 조건은 이 두 개의 조건을 동시에 만족하는 경우이기 때문에 둘다 각각의 배열의 max 만 구하면 그것이 우리가 원하는 정답이 된다.

```python
class Solution:
    def candy(self, ratings: List[int]) -> int:
        left2right = [1 for _ in range(len(ratings))]
        right2left = [1 for _ in range(len(ratings))]
        
        for i in range(len(ratings)-1):
            if ratings[i] < ratings[i+1]:
                left2right[i+1] = left2right[i]+1
            else:
                left2right[i+1] = 1  
        
        for i in range(1, len(ratings))[::-1]:
            if ratings[i-1] > ratings[i]:
                right2left[i-1] = right2left[i]+1
            else:
                right2left[i-1] = 1  
        
        # print(left2right)
        # print(right2left)
        return sum(max(r,l) for r,l in zip(left2right, right2left))
```

## Single Pass with Mountain?

곰곰히 생각해보면 Candy 는 어떠한 특정한 패턴? 을 가지고 있다.

잘 보면 1개의 오르막과 1개의 내리막으로 구성되어 있는 1개의 산으로 표현이 된다. 이러한 산이 여러 개 존재한다.

1개의 산에서 필요한 candy 는 몇개일까? 우리는 무조건 1씩 증가 or 1 씩 감소가 최적이라는 것을 안다.

만약 오르막(up) 의 길이가 up, 내리막(down) 의 길이가 down 일때 1개의 산에서 필요한 candy 는

$\sum_{i=1}^{up}i + \sum_{i=1}^{down}i + max(up, down)$

이 된다는 것을 알 수가 있다. 밑의 파란색 산을 보면 up 이 3, down 이 3 일 때의 예 이다.

max 부분은 산의 정산 으로써 up과 down 중 더 큰 곳에만 영향을 받는다.

![[E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202.jpg]]

이것을 구현한 코드가 밑이다.

```python
class Solution:
    def candy(self, ratings: List[int]) -> int:
        if len(ratings)==0: return 0
        ret = 1
        up = down = peak = 0
        for i in range(1, len(ratings)):
            if ratings[i-1] < ratings[i]:
                up += 1
                peak = up
                down = 0
                ret += 1 + up
            elif ratings[i-1] == ratings[i]:
                peak = up = down = 0
                ret += 1
            else:
                up = 0
                down+=1
                ret += 1 + down + (-1 if peak >= down else 0)
            
        return ret
```

몇가지 경우에서 실제로 어떻게 작동 하는지의 예이다.

![[E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202 1.jpg]]

## 복잡도 분석

-**Time Complexity:**분석 필요
-**Space Complexity:**분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
