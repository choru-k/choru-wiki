---
tags:
  - Demo
  - Mermaid
  - Diagram
---

# Mermaid 다이어그램 예시

ASCII 아트 대신 Mermaid 다이어그램을 사용하면 더 안정적이고 보기 좋은 다이어그램을 만들 수 있습니다.

## 1. 프로세스 메모리 구조 (Graph)

```mermaid
graph TB
    subgraph "Process Memory Layout"
        A["Kernel Space<br/>0xFFFFFFFF"]
        B["Stack<br/>↓ grows downward"]
        C["Memory Mapped Region<br/>shared libs, mmap"]
        D["Heap<br/>↑ grows upward"]
        E["BSS Segment<br/>uninitialized data"]
        F["Data Segment<br/>initialized data"]
        G["Text Segment<br/>code<br/>0x00000000"]
        
        A --> B
        B --> C
        C --> D
        D --> E
        E --> F
        F --> G
    end
```

## 2. Tree 구조 예시

```mermaid
graph TD
    A[Root Node]
    A --> B[Left Child]
    A --> C[Right Child]
    B --> D[Left Leaf]
    B --> E[Right Leaf]
    C --> F[Left Leaf]
    C --> G[Right Leaf]
```

## 3. Flow Chart 예시

```mermaid
flowchart LR
    Start([시작]) --> Input[/입력 받기/]
    Input --> Condition{조건 확인}
    Condition -->|Yes| Process[처리]
    Condition -->|No| Error[에러 처리]
    Process --> Output[/결과 출력/]
    Error --> Output
    Output --> End([종료])
```

## 4. Sequence Diagram 예시

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Database
    
    Client->>Server: Request
    Server->>Database: Query
    Database-->>Server: Result
    Server-->>Client: Response
```

## 5. State Diagram 예시

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : Start
    Processing --> Success : Complete
    Processing --> Error : Fail
    Success --> [*]
    Error --> Idle : Retry
```

## 6. Class Diagram 예시

```mermaid
classDiagram
    class Process {
        +int pid
        +string name
        +int memory_size
        +start()
        +stop()
        +allocate_memory()
    }
    
    class Thread {
        +int tid
        +int stack_size
        +run()
        +join()
    }
    
    Process "1" --> "*" Thread : creates
```

## 7. Gantt Chart 예시

```mermaid
gantt
    title 프로젝트 일정
    dateFormat YYYY-MM-DD
    section 설계
    요구사항 분석    :a1, 2024-01-01, 7d
    시스템 설계      :a2, after a1, 5d
    section 개발
    백엔드 개발      :b1, after a2, 10d
    프론트엔드 개발  :b2, after a2, 12d
    section 테스트
    통합 테스트      :c1, after b1, 5d
```

## 8. Pie Chart 예시

```mermaid
pie title 메모리 사용량 분포
    "Stack" : 10
    "Heap" : 45
    "Code" : 15
    "Data" : 30
```

## 9. Git Graph 예시

```mermaid
gitGraph
    commit
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
    branch feature
    checkout feature
    commit
    commit
    checkout main
    merge feature
```

## 10. ER Diagram 예시

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    USER {
        int id PK
        string name
        string email
    }
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER {
        int id PK
        date order_date
        string status
    }
    ORDER_ITEM {
        int order_id FK
        int product_id FK
        int quantity
    }
```

## Mermaid 사용 장점

1. **안정성**: 렌더링이 일관되고 깨지지 않음
2. **반응형**: 화면 크기에 따라 자동 조정
3. **스타일링**: 테마에 맞춰 자동으로 색상 적용
4. **유지보수**: 수정이 쉽고 버전 관리 용이
5. **접근성**: 스크린 리더 지원
6. **Export**: SVG, PNG 등으로 내보내기 가능

## ASCII Art vs Mermaid 비교

### ASCII Art 문제점

- 폰트에 따라 정렬이 깨짐
- 모바일에서 보기 어려움
- 수정이 번거로움
- 복사/붙여넣기 시 깨짐

### Mermaid 장점

- 항상 일정한 렌더링
- 반응형 디자인
- 간단한 문법으로 복잡한 다이어그램 생성
- MkDocs Material 테마와 완벽 호환

## 마이그레이션 가이드

ASCII Art를 Mermaid로 변환하는 예시:

**Before (ASCII):**

```text
    A
   / \
  B   C
 / \   \
D   E   F
```

**After (Mermaid):**

```mermaid
graph TD
    A --> B
    A --> C
    B --> D
    B --> E
    C --> F
```

더 자세한 Mermaid 문법은 [공식 문서](https://mermaid.js.org/)를 참고하세요.
