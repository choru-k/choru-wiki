---
tags:
  - LeetCode
  - Algorithm
  - Divide-and-Conquer
  - Merge-Sort
---

# 406. Queue Reconstruction by Height

## 문제

[LeetCode 406](https://leetcode.com/problems/queue-reconstruction-by-height/) • **Medium**

이 문제는 2가지의 풀이법이 있다

  

## Insert Sort

일단 큰 숫자의 위치는 작은 숫자에 영향을 받지 않는 점이 포인트이다.

  

즉 height 가 큰 순서대로 분류한 뒤에 height 가 작은 item 을 알맞은 자리에 넣어주면 된다.

```python
class Solution(object):
    def reconstructQueue(self, people):
        ans = []
        
        people.sort(key=lambda x: [-x[0],x[1]])
        
        for p in people:
            ans.insert(p[1], p)
            
        return ans
```

Insert 가 `O(n)` 이기 때문에 전체 시간 복잡도는 `O(n^2)` 가 된다.

  

## Merge Sort

이 문제를 보고 `Merge Sort` 을 바로 생각하기는 매우 어렵고 나 또한 Discussion 보고 매우 신기했다. 단순하게 푸는 방법이 아니라 아이디어를 생각해보자.

  

정답 배열이 이미 존재한다고 한다. 그중 앞, 뒤을 반반으로 잘라서 앞의 배열의 순서를 바꾼다고해서 뒤의 배열의 순서가 바뀔까? 뒤의 배열은 앞의 배열의 순서와 상관없이 단순한 순자의 갯수에 따라서만 순서가 바뀐다. 또한 앞의 배열은 뒤의 배열과 전혀 연관이 없다.

즉 앞의 배열의 순서는 뒤의 배열을 정렬하는 문제와 별개의 문제이며, 뒤의 배열은 앞의 배열의 순서 정렬과 별개의 문제이다. 즉 우리는 이 문제를 `Divide And Conquer` 로 풀 수 있다고 아이디어를 낼 수 있다.

  

아직 조금 이해가 안 갈 수 있다. 조금 더 생각해보자.

올바른 순서를 가진 배열 `A` 와 올바른 순서를 가진 배열 `B` 가 존재하고 `max(A) ≤ min(B)` 라고 해보자.

이 둘을 합쳐서 새로운 올바른 배열 `C` 을 만들 때 배열 `A`와 배열 `B` 의 순서가 유지 될까?

일단 배열 `B`의 순서는 무조건 유지가 된다. 왜냐하면 배열 `A`에 아무런 영향을 받지 않기 때문이다.

배열 `A`의 중간에 `B`의 원소 들이 들어간다고 생각해보자. 배열 `B`의 원소가 들어간 지점부터 그 뒤의 모든 `A`의 원소들이 똑같은 영향을 받기 때문에 배열 `A`의 순서도 똑같이 유지가 된다.

  

즉 `A`와 `B` 의 순서가 올바르다면, 새로운 배열 `C`을 만들 수 있고, 이건 `Merge Sort` 이다.

  

그러면 어떻게 `Merge` 을 해야할 까?

  

```python
def merge(left, right):
	l_idx = 0, r_idx = 0
	new_list = []
	while l_idx < len(left) and r_idx < len(right):
		if left[l_idx][1] < right[r_idx][1]: # left 앞에 큰 숫자가 필요하지 않음.
			new_list.append(left[l_idx]) # 만약 right 을 선택할 경우, 조건 만족이 안됨
			# 예를 들어 left가 (5, 3) right가 (10, 4) 일때 right을 선택하면 그 앞에 10보다 큰 수가 4개가
			# 존재 해야 하는데 그러면 left 의 (5, 3)을 만족 시킬 수 없음.
			l_idx+=1
		if left[l_idx][1] > right[r_idx][1]: # left 앞에 더 큰 숫자가 필요.
			new_list.append(right[r_idx]) 
			r_idx+=1
		else:
			if left[l_idx][0] < right[r_idx][0]:
				new_list.append(left[l_idx])
				l_idx+=1
			else:
				new_list.append(right[r_idx])
				r_idx+=1
	
	# 나머지 넣기
	while l_idx < len(left):
		new_list.append(left[l_idx])
		l_idx+=1
	while r_idx < len(right):
		new_list.append(right[r_idx])
		r_idx+=1
```

대략 이런 방법을 통해서 `Merge` 을 하면 우리가 원하는 답을 얻을 수 있다.

밑의 코드는 전체 정답코드이다.

  

```python
class Solution:
    def reconstructQueue(self, people: List[List[int]]) -> List[List[int]]:
        people.sort(key=lambda x: (x[0], -x[1]))
        people = list(map(lambda x: [x[0],x[1],x[1]], people))
        
        def mergeSort(lis):
            if len(lis) in [0,1]:
                return lis
            lis1 = mergeSort(lis[:len(lis)//2])
            lis2 = mergeSort(lis[len(lis)//2:])
            
            idx1,idx2 = 0,0
            tmp=0
            res = []
            while idx1<len(lis1) and idx2<len(lis2):
                if lis1[idx1][1] - tmp > lis2[idx2][1]:
                    res.append(lis2[idx2])
                    idx2+=1
                    tmp+=1
                else:
                    lis1[idx1][1] -= tmp
                    res.append(lis1[idx1])
                    idx1+=1
                
            while idx1<len(lis1):
                lis1[idx1][1] -= tmp
                res.append(lis1[idx1])
                idx1+=1
            while idx2<len(lis2):
                res.append(lis2[idx2])
                idx2+=1
            return res
        # print(people)
        return list(map(lambda x: [x[0],x[2]], mergeSort(people)))
```

시간복잡도는 `O(nlong)` 이 된다.

  

재밌는게 실제 두 코드를 전부다 돌려보면 위의 코드가 더 빠른 시간을 보인다. n 자체가 1100 이하이기 때문에 오히려 복잡한 작업이 많은 밑의 코드가 더 느린 것을 볼 수가 있다.

[blog.cheol.me/cheol94/406-Queue-Reconstruction-by-Height-2fe1d91077c84eb9a473300fb02b7af3](http://blog.cheol.me/cheol94/406-Queue-Reconstruction-by-Height-2fe1d91077c84eb9a473300fb02b7af3)

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
