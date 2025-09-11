# LeetCode Problems by Topic

## Arrays & Strings

### Two Pointers

- [75. Sort Colors](../problems/75-sort-colors.md) - Dutch National Flag
- [31. Next Permutation](../problems/31-next-permutation.md) - Lexicographic ordering
- [41. First Missing Positive](../problems/41-first-missing-positive.md) - Cyclic sort

### Sliding Window

- [30. Substring with Concatenation](../problems/30-substring-concatenation.md) - Fixed window
- [239. Sliding Window Maximum](../problems/239-sliding-window-max.md) - Monotonic deque
- [992. Subarrays with K Different Integers](../problems/992-k-different.md) - At most K pattern

### Prefix Sum

- [53. Maximum Subarray](../problems/53-maximum-subarray.md) - Kadane's algorithm
- [327. Count of Range Sum](../problems/327-range-sum.md) - Merge sort with counting

## Binary Trees

### Traversal

- [236. Lowest Common Ancestor](../problems/236-lca-binary-tree.md) - Classic LCA
- [106. Construct from Inorder and Postorder](../problems/106-construct-tree.md) - Tree reconstruction
- [889. Construct from Preorder and Postorder](../problems/889-construct-preorder-postorder.md)

### BST Operations

- [99. Recover Binary Search Tree](../problems/99-recover-bst.md) - Morris traversal
- [449. Serialize and Deserialize BST](../problems/449-serialize-bst.md) - Optimal encoding

### Tree DP

- [968. Binary Tree Cameras](../problems/968-tree-cameras.md) - Greedy on trees
- [834. Sum of Distances in Tree](../problems/834-sum-distances.md) - Re-rooting technique

## Graphs

### BFS Applications

- [1293. Shortest Path with Obstacles](../problems/1293-shortest-path-obstacles.md) - State BFS
- [310. Minimum Height Trees](../problems/310-min-height-trees.md) - Topological pruning

### DFS Applications

- [200. Number of Islands](../problems/200-islands.md) - Connected components
- [417. Pacific Atlantic Water Flow](../problems/417-water-flow.md) - Multi-source DFS
- [332. Reconstruct Itinerary](../problems/332-reconstruct-itinerary.md) - Eulerian path

### Advanced Graph

- [886. Possible Bipartition](../problems/886-bipartition.md) - Graph coloring
- [1136. Parallel Courses](../problems/1136-parallel-courses.md) - Topological sort
- [685. Redundant Connection II](../problems/685-redundant-connection.md) - Directed graph cycles

## Dynamic Programming

### Stock Problems Series

Complete series with increasing complexity:

1. [121. Best Time to Buy and Sell Stock](../problems/121-stock.md) - One transaction
2. [122. Best Time to Buy and Sell Stock II](../problems/122-stock-ii.md) - Unlimited transactions
3. [123. Best Time to Buy and Sell Stock III](../problems/123-stock-iii.md) - Two transactions
4. [188. Best Time to Buy and Sell Stock IV](../problems/188-stock-iv.md) - K transactions
5. [309. With Cooldown](../problems/309-stock-cooldown.md) - State machine
6. [714. With Transaction Fee](../problems/714-stock-fee.md) - Cost consideration

### Interval DP

- [312. Burst Balloons](../problems/312-burst-balloons.md) - Matrix chain multiplication variant
- [1000. Minimum Cost to Merge Stones](../problems/1000-merge-stones.md) - K-way merging
- [546. Remove Boxes](../problems/546-remove-boxes.md) - Complex state definition

### Digit DP

- [233. Number of Digit One](../problems/233-digit-one.md) - Count digits
- [902. Numbers At Most N Given Digit Set](../problems/902-numbers-at-most-n.md) - Lexicographic DP
- [1067. Digit Count in Range](../problems/1067-digit-count-range.md) - Range counting

## Heap & Priority Queue

### K-th Element

- [973. K Closest Points to Origin](../problems/973-k-closest.md) - Quick select
- [347. Top K Frequent Elements](../problems/347-top-k-frequent.md) - Bucket sort alternative
- [378. Kth Smallest in Sorted Matrix](../problems/378-kth-in-matrix.md) - Min heap + binary search

### Merge K Ways

- [23. Merge k Sorted Lists](../problems/23-merge-k-lists.md) - Classic heap problem
- [632. Smallest Range Covering Elements](../problems/632-smallest-range.md) - K pointers

### Meeting Rooms

- [253. Meeting Rooms II](../problems/253-meeting-rooms.md) - Interval scheduling
- [732. My Calendar III](../problems/732-calendar-iii.md) - Boundary counting

## Math & Bit Manipulation

### Number Theory

- [483. Smallest Good Base](../problems/483-smallest-good-base.md) - Binary search on base
- [372. Super Pow](../problems/372-super-pow.md) - Modular exponentiation
- [810. Chalkboard XOR Game](../problems/810-xor-game.md) - Game theory

### Bit Manipulation

- [137. Single Number II](../problems/137-single-number-ii.md) - Bit counting
- [421. Maximum XOR](../problems/421-max-xor.md) - Trie optimization
- [1611. Minimum Operations to Zero](../problems/1611-min-operations.md) - Gray code

### Combinatorics

- [920. Number of Music Playlists](../problems/920-music-playlists.md) - Inclusion-exclusion
- [903. Valid Permutations for DI Sequence](../problems/903-di-sequence.md) - DP on permutations

## Design Problems

### Data Structures

- [146. LRU Cache](../problems/146-lru-cache.md) - Doubly linked list + HashMap
- [432. All O(1) Data Structure](../problems/432-all-o1.md) - Complex bookkeeping
- [895. Maximum Frequency Stack](../problems/895-max-freq-stack.md) - Stack of stacks

### System Design

- [642. Design Search Autocomplete](../problems/642-autocomplete.md) - Trie + ranking
- [1146. Snapshot Array](../problems/1146-snapshot-array.md) - Version control
- [1206. Design Skiplist](../problems/1206-skiplist.md) - Probabilistic data structure

## String Algorithms

### Pattern Matching

- [214. Shortest Palindrome](../problems/214-shortest-palindrome.md) - KMP application
- [336. Palindrome Pairs](../problems/336-palindrome-pairs.md) - Trie + palindrome
- [1044. Longest Duplicate Substring](../problems/1044-longest-duplicate.md) - Binary search + rolling hash

### Parsing

- [224. Basic Calculator](../problems/224-basic-calculator.md) - Expression evaluation
- [770. Basic Calculator IV](../problems/770-calculator-iv.md) - Polynomial arithmetic
- [736. Parse Lisp Expression](../problems/736-lisp-expression.md) - Recursive parsing

## Hard Classic Problems

These are must-know hard problems that appear frequently:

1. [4. Median of Two Sorted Arrays](../problems/4-median-sorted-arrays.md) - Binary search
2. [10. Regular Expression Matching](../problems/10-regex-matching.md) - DP
3. [25. Reverse Nodes in k-Group](../problems/25-reverse-k-group.md) - Linked list
4. [32. Longest Valid Parentheses](../problems/32-valid-parentheses.md) - Stack/DP
5. [42. Trapping Rain Water](../problems/42-trapping-rain.md) - Two pointers
6. [72. Edit Distance](../problems/72-edit-distance.md) - Classic DP
7. [76. Minimum Window Substring](../problems/76-min-window.md) - Sliding window
8. [84. Largest Rectangle in Histogram](../problems/84-largest-rectangle.md) - Monotonic stack
9. [124. Binary Tree Maximum Path Sum](../problems/124-max-path-sum.md) - Tree DP
10. [295. Find Median from Data Stream](../problems/295-median-stream.md) - Two heaps
