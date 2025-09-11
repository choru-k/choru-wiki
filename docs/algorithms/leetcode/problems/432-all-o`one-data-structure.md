---
tags:
  - LeetCode
  - Algorithm
  - Hash-Table
  - Linked-List
---

# 432. All O`one Data Structure

## 문제

[LeetCode 432](https://leetcode.com/problems/all-oone-data-structure/) • **Medium**

## 핵심 아이디어

밑의 그림을 보면 Bucket 이 있고 각각의 Bucket 들은 Double Linked List 로 구성되어 있다. 각각의 Bucket 들은 items 라는 항목을 가지고 여기에 각 Bucket 에 알맞은 freq 을 가진 key 들이 보관이 된다.

만약 처음에는 freq 가 2 인 bucket 이 없다. 만약 `inc(key2)` 가 불러지면 freq가 2인 새로운 bucket 이 생성되고 이 bucket 은 bucket 들의 중간에 들어가게 된다.

이런식으로 할 경우 max_key 는 맨 뒤의 bucket 의 items 중 하나, min_key 는 맨 앞의 bucket 의 items 중 1개가 된다.

![[E1848CE185A6E18486E185A9E186A820E1848BE185A5E186B9E1848BE185B3E186B7.jpg]]

## Solution

```python
class Bucket:
    def __init__(self, freq):
        self.freq = freq
        self.items = set()
        self.prev = None
        self.next = None

class AllOne:

    def __init__(self):
        """
        Initialize your data structure here.
        """
        self.key2bucket = dict()
        self.head = Bucket(0)
        self.head.next = self.head
        self.head.prev = self.head
    
    def insert_bucket(self, bucket, new_bucket):
        tmp = bucket.next
        bucket.next = new_bucket
        new_bucket.prev = bucket
        new_bucket.next = tmp
        tmp.prev = new_bucket
    
    def delete_bucket(self, bucket):
        prev_bucket = bucket.prev
        next_bucket = bucket.next
        prev_bucket.next, next_bucket.prev = next_bucket, prev_bucket

    def inc(self, key: str) -> None:
        """
        Inserts a new key <Key> with value 1. Or increments an existing key by 1.
        """
        if key in self.key2bucket:
            now_bucket = self.key2bucket[key]
            now_bucket.items.remove(key)
        else:
            now_bucket = self.head
            
        if now_bucket.next.freq != now_bucket.freq+1:
            next_bucket = Bucket(now_bucket.freq+1)
            self.insert_bucket(now_bucket, next_bucket)
        else:
            next_bucket = now_bucket.next
        
        next_bucket.items.add(key)
        self.key2bucket[key] = next_bucket
        
        if now_bucket != self.head and len(now_bucket.items) == 0:
            self.delete_bucket(now_bucket)
        
        
    def dec(self, key: str) -> None:
        """
        Decrements an existing key by 1. If Key's value is 1, remove it from the data structure.
        """
        if key not in self.key2bucket:
            return
        now_bucket = self.key2bucket[key]
        del self.key2bucket[key]
        now_bucket.items.remove(key)
        
        if now_bucket.freq != 1:
            if now_bucket.prev.freq != now_bucket.freq-1:
                prev_bucket = Bucket(now_bucket.freq-1)
                self.insert_bucket(now_bucket, prev_bucket)
            else:
                prev_bucket = now_bucket.prev
            prev_bucket.items.add(key)
            self.key2bucket[key] = prev_bucket
        if len(now_bucket.items) == 0:
            self.delete_bucket(now_bucket)

    def getItemFromSet(self, sets):
        val = sets.pop()
        sets.add(val)
        return val
    
    def getMaxKey(self) -> str:
        """
        Returns one of the keys with maximal value.
        """
        if len(self.head.prev.items) == 0:
            return ''
        return self.getItemFromSet(self.head.prev.items)
        

    def getMinKey(self) -> str:
        """
        Returns one of the keys with Minimal value.
        """
        if len(self.head.next.items) == 0:
            return ''
        
        return self.getItemFromSet(self.head.next.items)
        


# Your AllOne object will be instantiated and called as such:
# obj = AllOne()
# obj.inc(key)
# obj.dec(key)
# param_3 = obj.getMaxKey()
# param_4 = obj.getMinKey()
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요

---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
