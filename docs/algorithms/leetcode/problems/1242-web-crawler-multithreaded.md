---
tags:
  - LeetCode
  - Algorithm
  - Multithreading
---

# 1242. Web Crawler Multithreaded

## 문제

[LeetCode 1242](https://leetcode.com/problems/web-crawler-multithreaded/) • **Medium**

일단 기본적인 Python 비동기에 대해서 알아야 한다.

python은 Queue와 Threading 을 통해서 기본적인 multi thread 방법을 구현할 수 있다.

  

## Queue

[https://docs.python.org/ko/3.7/library/queue.html](https://docs.python.org/ko/3.7/library/queue.html)

멀티 쓰레드에서 사용하는 Queue이다.

  

## Threading

[https://docs.python.org/3/library/threading.html](https://docs.python.org/3/library/threading.html)

`Lock` Class 을 통해서 유일하게 실행될 부분을 정의할 수 있다.

`Lock.acquire()`, `Lock.release()` dd

  

  

  

```python
# """
# This is HtmlParser's API interface.
# You should not implement it, or speculate about its implementation
# """
\#class HtmlParser(object):
#    def getUrls(self, url):
#        """
#        :type url: str
#        :rtype List[str]
#        """

import threading
from queue import Queue
class Solution:
    def crawl(self, startUrl: str, htmlParser: 'HtmlParser') -> List[str]:
        # def hostname(url):
        #     return '.'.join(url.split('/')[2].split('.')[1:])
        def hostname(url):
            start = len("http://")
            i = start
            while i < len(url) and url[i] != "/":
                i += 1
            return url[start:i]
        
        queue = Queue()
        seen = { startUrl }
        start_hostname = hostname(startUrl)
        seen_lock = threading.Lock()
        
        def worker():
            while True:
								# queue.join()을 하면 여기서 멈춰있다.
                url = queue.get()
                if url is None:
                    return
                for next_url in htmlParser.getUrls(url):
                    if next_url not in seen and hostname(next_url) == start_hostname:
                        seen_lock.acquire()
                        if next_url not in seen:
                            seen.add(next_url)
                            queue.put(next_url)
                        seen_lock.release()
                queue.task_done()
        
        
        num_workers = 8
        workers = []
        queue.put(startUrl)
        
        for i in range(num_workers):
            t = threading.Thread(target=worker)
            t.start()
            workers.append(t)
        queue.join()
        
        for i in range(num_workers):
            queue.put(None)
        for t in workers:
            t.join()
        return list(seen)
```

## 복잡도 분석

- **Time Complexity:** 분석 필요
- **Space Complexity:** 분석 필요


---

*Note: 이 문제는 개인 노트에서 마이그레이션되었습니다. Solution은 지속적으로 개선되고 있습니다.*
