---
tags:
  - LeetCode
  - Algorithm
  - Dynamic-Programming
  - Greedy
---

# 418. Sentence Screen Fitting

## 문제

[LeetCode 418](https://leetcode.com/problems/sentence-screen-fitting/) • **Hard**

# 직접 Col 을 구해서 풀기

## Greedy (Time Error)

`단어의 갯수를 n` `단어의 1개의 평균길이를 l` 이라고 하자.

최악의 경우 단어의 길이가 1이면 `O(row*col)` 의 시간복잡도를 갖는다.

```python
class Solution:
    def wordsTyping(self, sentence: List[str], rows: int, cols: int) -> int:
        n = len(sentence)
        ans = 0
        cur = 0
        for _ in range(rows):
						# col 이 남은칸
            col = cols
            col -= len(sentence[cur%n])
						# cur 은 이번에 지금 까지 들어간 단어의 갯수
            cur += 1
						# 다음 단어 + 스페이스 1칸 이 이번 col에 들어가면 넣고 그 다음 단어 비교
            while col - (len(sentence[cur%n])+1) >= 0:
                col -= (len(sentence[cur%n])+1)
                cur += 1
        # 총 들어간 단어에서 문장단위로 나눔
        return cur // n
```

  

## 첫번째 최적화

```python
class Solution:
    def wordsTyping(self, sentence: List[str], rows: int, cols: int) -> int:
        words = sentence
        n = len(words)
				# 미리 A 라는 단어로 시작하면 그 다음 단어는 무엇으로 시작할지 구해놓음
				# 전처리로 같은 계산 반복 안함.
        memo = [(0,0)] * len(words)
        for i in range(n):
            tmp = -1
            k=0
            while tmp + len(words[(i+k) % n])+1 <= cols:
                tmp+= len(words[(i+k) % n])+1
                k+=1
            memo[i] = ((i+k) % n , (i+k) // n)
        
        ans = 0
        cur = 0
        for _ in range(rows):
            nxt_cur, time=memo[cur]
            cur = nxt_cur
            ans += time
        return ans
```

처음 memo을 만들기 위해서 `O(n * col)` 그뒤 row 의 계산은 `O(row)`

즉 `O(n * col +row)`

## 두번째 최적화

곰곰히 생각해보면 만약 A 라는 글자로 시작을 햇는데 어느순간 다시 A 라는 숫자로 시작한다면 그러한 패턴이 계속 반복된다는 것을 알 수가 있다. 즉 cycle 이 존재하기 때문에 그 부분을 jump 할 수있다.

```python
class Solution:
    def wordsTyping(self, sentence: List[str], rows: int, cols: int) -> int:
        words = sentence
        n = len(words)
        memo = [(0,0)] * len(words)
        for i in range(n):
            tmp = -1
            k=0
            while tmp + len(words[(i+k) % n])+1 <= cols:
                tmp+= len(words[(i+k) % n])+1
                k+=1
            memo[i] = ((i+k) % n , (i+k) // n)
        
        times = 0
        cur = 0
        now_row = 0
        cache = dict()
				# cycle 을 찾는다. 
        while now_row < rows:
            if cur in cache:
                cycle = now_row - cache[cur][0]
                if rows-now_row > cycle:
                    times += ((rows-now_row) // cycle -1) * (times-cache[cur][1])
                    now_row += cycle * ((rows-now_row) // cycle - 1)
            else:
                cache[cur] = (now_row, times)
            
            nxt_cur, time=memo[cur]
            cur = nxt_cur
            times += time
            now_row+=1
        
        return times
```

비둘기 집의 원리에 의해서 `n < row` 면 무조건 cycle 이 발생하기 때문에

시간 복잡도는 `O(min(n,row) * col)`

## 세번째 최적화

필요할 때만 memo 을 구하자. 위에서는 미리 memo 을 구햇지만 사용하지 않는 memo 도 있기 때문에 필요할 때만 구하고 cache 해 놓으면 보다 효율적 일 것 같다.

```python
class Solution:
    def wordsTyping(self, sentence: List[str], rows: int, cols: int) -> int:
        words = sentence
        n = len(words)
        memo = dict()
        def get_memo(i):
            if i not in memo:
                tmp = -1
                k=0
                while tmp + len(words[(i+k) % n])+1 <= cols:
                    tmp+= len(words[(i+k) % n])+1
                    k+=1
                memo[i] = ((i+k) % n , (i+k) // n)
            return memo[i]
        times = 0
        cur = 0
        now_row = 0
        cache = dict()
        while now_row < rows:
            if cur in cache:
                cycle = now_row - cache[cur][0]
                if rows-now_row > cycle:
                    times += ((rows-now_row) // cycle -1) * (times-cache[cur][1])
                    now_row += cycle * ((rows-now_row) // cycle - 1)
            else:
                cache[cur] = (now_row, times)
            
            nxt_cur, time=get_memo(cur)
            cur = nxt_cur
            times += time
            now_row+=1
        
        return times
```

2번째와 최악의 경우는 같음

  

  

## 실제로 sentence 을 나누기?

위의 방법은 col 가 존재하고 여기에 word 을 한 개 한 개 넣으면서 col 이 넘치는지 안 넘치는 지를 비교하는 방법이였다. 밑의 방식은 넣고 싶은 words 을 지정하고 만약 중간에 문자열이 끊기면 안 끊기는 최소의 지점을 찾는다. 약간의 발상의 전환?

밑의 예를 들어서 설명하면 `a bcd` 가 6개의 칸에 들어가는지 비교 `e a bc` 가 들어가는지 비교, `bc` 부분의 문자열이 잘렸기 때문에 안 잘리는 최소점을 right→left 로 찾음 `e a` 가 들어갈 수 있는 걸 확인

  

![[Attachments/E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202 2.svg|E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7202 2.svg]]

```python
class Solution:
    def wordsTyping(self, sentence: List[str], rows: int, cols: int) -> int:
        s = ' '.join(sentence) + ' '
        start = 0
        for i in range(rows):
            start += cols
            # 지금이 스페이스라면 +1 을 해서 첫문자열로 이동
            if s[start % len(s)] == ' ':
                start += 1
            else:
                # 뒤로가면서 가장 처음 문자열로 이동
                while start > 0 and s[ (start - 1) % len(s) ] != ' ':
                    start -= 1
        return start// len(s)
```

모든 row 마다 단어의 길이만큼 `start -=1` 을 하기 때문에

`O(row*l)` 이 된다.

  

## 최적화

```python
class Solution:
    def wordsTyping(self, sentence: List[str], rows: int, cols: int) -> int:
        s = ' '.join(sentence) + ' '
				# 항상 while 을 하는게 아니라 미리미리 단어의 시작을 구해논다.
        cache = [0] * len(s)
        recent_space = 1
        for i in range(len(s)):
            if s[i] == ' ':
                recent_space = 0
            cache[i] = recent_space
            recent_space += 1
            
        start = 0
        for i in range(rows):
            start += cols
            # If next character is space, then we can put space in current line
            if s[start % len(s)] == ' ':
                start += 1
            else:
                # Otherwise, decrease start until it is space
                start -= cache[start % len(s)]
                start += 1
                if start < 0:
                    start = 0
        return start// len(s)
```

`O(n*l + rows)`

마찬가지로 cache 을 미리 구하는게 아니라 필요할 때 구하는 방식으로 하면 `O(min(row,n)*l + row)` 까지 줄일 수 있다.

  

100%

```python
class Solution:
    def wordsTyping(self, sentence: List[str], rows: int, cols: int) -> int:
        s = " ".join(sentence) + " "
        nxts = dict()
        cur = 0
        cnt = 0
        
        r = 0
        while r < rows:
            nxts[cur] = (r, cnt)
            
            nxt = cur + cols
            while s[nxt % len(s)] != ' ':
                nxt -= 1
            nxt += 1
            cur = nxt % len(s)
            cnt += nxt // len(s)
            
            r+=1
            if cur in nxts:
                cycle = (r - nxts[cur][0], cnt - nxts[cur][1])
                cnt += (rows-r) // cycle[0] * cycle[1]
                r += (rows-r) // cycle[0] * cycle[0]
        return cnt
```

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
