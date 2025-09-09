# LeetCode Problems by Pattern

## Greedy Algorithms (61 problems)

Greedy algorithms make locally optimal choices at each step to find a global optimum.

### Key Characteristics
- Makes the best choice at each step
- Never reconsiders previous choices
- Often used for optimization problems
- Requires proof of correctness

### Classic Problems
- [134. Gas Station](problems/134-gas-station.md) - Circular array optimization
- [135. Candy](problems/135-candy.md) - Two-pass greedy
- [452. Minimum Number of Arrows to Burst Balloons](problems/452-arrows-balloons.md) - Interval scheduling
- [846. Hand of Straights](problems/846-hand-of-straights.md) - Consecutive grouping
- [406. Queue Reconstruction by Height](problems/406-queue-reconstruction.md) - Sorting with constraints

### Problem-Solving Tips
1. Sort the input if order matters
2. Think about what to optimize at each step
3. Prove that local optimum leads to global optimum
4. Consider counter-examples

## Dynamic Programming (52 problems)

DP solves complex problems by breaking them into simpler subproblems.

### Key Patterns

#### 1. Linear DP
- [53. Maximum Subarray](problems/53-maximum-subarray.md) - Kadane's algorithm
- [121. Best Time to Buy and Sell Stock](problems/121-stock.md) - State tracking
- [413. Arithmetic Slices](problems/413-arithmetic-slices.md) - Sequence DP

#### 2. 2D DP
- [1035. Uncrossed Lines](problems/1035-uncrossed-lines.md) - LCS variant
- [312. Burst Balloons](problems/312-burst-balloons.md) - Interval DP
- [1000. Minimum Cost to Merge Stones](problems/1000-merge-stones.md) - Multi-dimensional DP

#### 3. State Machine DP
- [123. Best Time to Buy and Sell Stock III](problems/123-stock-iii.md) - Multiple transactions
- [309. Best Time to Buy and Sell Stock with Cooldown](problems/309-stock-cooldown.md) - State transitions

### Problem-Solving Framework
1. **Define state**: What do we need to know at each step?
2. **Recurrence relation**: How do states relate?
3. **Base cases**: What are the simplest cases?
4. **Optimization**: Can we reduce space complexity?

## Graph Traversal

### DFS (22 problems)

Depth-First Search explores as far as possible before backtracking.

#### Applications
- [200. Number of Islands](problems/200-number-of-islands.md) - Connected components
- [236. Lowest Common Ancestor](problems/236-lca-binary-tree.md) - Tree traversal
- [417. Pacific Atlantic Water Flow](problems/417-water-flow.md) - Multi-source DFS
- [332. Reconstruct Itinerary](problems/332-reconstruct-itinerary.md) - Eulerian path

#### Templates
```python
# Recursive DFS
def dfs(node, visited):
    if node in visited:
        return
    visited.add(node)
    for neighbor in graph[node]:
        dfs(neighbor, visited)

# Iterative DFS
def dfs_iterative(start):
    stack = [start]
    visited = set()
    while stack:
        node = stack.pop()
        if node not in visited:
            visited.add(node)
            stack.extend(graph[node])
```

### BFS (11 problems)

Breadth-First Search explores neighbors level by level.

#### Applications
- [1293. Shortest Path in Grid](problems/1293-shortest-path-obstacles.md) - Shortest path with constraints
- [310. Minimum Height Trees](problems/310-minimum-height-trees.md) - Tree center finding
- Level-order traversal in trees
- Shortest path in unweighted graphs

## Binary Search (17 problems)

Binary search finds targets in logarithmic time.

### Patterns

#### 1. Classic Binary Search
- Find exact value
- Find insertion position

#### 2. Binary Search on Answer
- [1011. Capacity To Ship Packages](problems/1011-ship-packages.md) - Minimize maximum
- [719. Find K-th Smallest Pair Distance](problems/719-kth-pair-distance.md) - Search on result space

#### 3. Advanced Applications
- [378. Kth Smallest Element in Sorted Matrix](problems/378-kth-in-matrix.md) - 2D binary search
- [1060. Missing Element in Sorted Array](problems/1060-missing-element.md) - Binary search with calculation

### Template
```python
def binary_search(left, right, condition):
    while left < right:
        mid = left + (right - left) // 2
        if condition(mid):
            right = mid
        else:
            left = mid + 1
    return left
```

## Stack & Monotonic Stack (16 problems)

Stack problems often involve matching, parsing, or finding next elements.

### Key Problems
- [224. Basic Calculator](problems/224-basic-calculator.md) - Expression parsing
- [239. Sliding Window Maximum](problems/239-sliding-window-max.md) - Monotonic deque
- [316. Remove Duplicate Letters](problems/316-remove-duplicate.md) - Greedy with stack
- [496. Next Greater Element](problems/496-next-greater.md) - Classic monotonic stack

### Monotonic Stack Pattern
```python
def next_greater_elements(nums):
    stack = []
    result = [-1] * len(nums)
    for i, num in enumerate(nums):
        while stack and nums[stack[-1]] < num:
            idx = stack.pop()
            result[idx] = num
        stack.append(i)
    return result
```

## Sliding Window (5 problems)

Sliding window optimizes subarray/substring problems.

### Fixed Window
- Process subarrays of fixed size

### Variable Window
- [862. Shortest Subarray with Sum at Least K](problems/862-shortest-subarray.md) - With negative numbers
- [992. Subarrays with K Different Integers](problems/992-k-different.md) - Exactly K constraint

### Template
```python
def sliding_window(s):
    left = 0
    window = {}
    result = 0
    
    for right in range(len(s)):
        # Expand window
        c = s[right]
        window[c] = window.get(c, 0) + 1
        
        # Contract window
        while not valid(window):
            d = s[left]
            window[d] -= 1
            if window[d] == 0:
                del window[d]
            left += 1
        
        # Update result
        result = max(result, right - left + 1)
    
    return result
```

## Advanced Data Structures

### Union-Find (8 problems)
- [685. Redundant Connection II](problems/685-redundant-connection.md) - Directed graph cycles
- [1168. Optimize Water Distribution](problems/1168-water-distribution.md) - MST variant

### Segment Tree (5 problems)
- [308. Range Sum Query 2D - Mutable](problems/308-range-sum-2d.md) - 2D range queries
- [732. My Calendar III](problems/732-calendar-iii.md) - Interval booking

### Trie (4 problems)
- [421. Maximum XOR of Two Numbers](problems/421-max-xor.md) - Bit manipulation with Trie
- [642. Design Search Autocomplete](problems/642-autocomplete.md) - Prefix search

## Problem Selection Strategy

### For Beginners
1. Start with Greedy problems to build intuition
2. Move to simple DP (1D arrays)
3. Practice BFS/DFS on trees
4. Learn basic Binary Search

### For Interview Prep
1. Focus on medium difficulty
2. Practice common patterns:
   - Two pointers
   - Sliding window
   - Tree traversals
   - Basic DP
3. Time yourself (30-45 minutes per problem)

### For Mastery
1. Solve Hard problems
2. Learn advanced techniques:
   - Segment trees
   - Advanced DP
   - Complex graph algorithms
3. Participate in contests