---
tags:
  - Event Sourcing
  - Domain Events
  - Event Store
  - Architecture
  - Guide
---

# 16.3c Event Sourcing 구현

## 📝 도메인 집합체와 이벤트 소싱

```csharp
// 이벤트 정의
public abstract class DomainEvent
{
    public string EventId { get; }
    public DateTime Timestamp { get; }
    public string AggregateId { get; protected set; }
    public int Version { get; set; }
    
    protected DomainEvent()
    {
        EventId = Guid.NewGuid().ToString();
        Timestamp = DateTime.UtcNow;
    }
}

public class AccountCreatedEvent : DomainEvent
{
    public string UserId { get; }
    public string AccountType { get; }
    public decimal InitialDeposit { get; }
    public string Currency { get; }
    
    public AccountCreatedEvent(
        string aggregateId,
        string userId,
        string accountType,
        decimal initialDeposit,
        string currency)
    {
        AggregateId = aggregateId;
        UserId = userId;
        AccountType = accountType;
        InitialDeposit = initialDeposit;
        Currency = currency;
    }
}

public class MoneyDepositedEvent : DomainEvent
{
    public decimal Amount { get; }
    public decimal BalanceAfter { get; }
    public string Reference { get; }
    
    public MoneyDepositedEvent(
        string aggregateId,
        decimal amount,
        decimal balanceAfter,
        string reference)
    {
        AggregateId = aggregateId;
        Amount = amount;
        BalanceAfter = balanceAfter;
        Reference = reference;
    }
}

public class MoneyWithdrawnEvent : DomainEvent
{
    public decimal Amount { get; }
    public decimal BalanceAfter { get; }
    public string Reference { get; }
    public decimal Fee { get; }
    
    public MoneyWithdrawnEvent(
        string aggregateId,
        decimal amount,
        decimal balanceAfter,
        string reference,
        decimal fee = 0)
    {
        AggregateId = aggregateId;
        Amount = amount;
        BalanceAfter = balanceAfter;
        Reference = reference;
        Fee = fee;
    }
}

public class MoneyTransferredEvent : DomainEvent
{
    public string ToAccountId { get; }
    public decimal Amount { get; }
    public decimal BalanceAfter { get; }
    public string Reference { get; }
    public decimal TransferFee { get; }
    
    public MoneyTransferredEvent(
        string aggregateId,
        string toAccountId,
        decimal amount,
        decimal balanceAfter,
        string reference,
        decimal transferFee)
    {
        AggregateId = aggregateId;
        ToAccountId = toAccountId;
        Amount = amount;
        BalanceAfter = balanceAfter;
        Reference = reference;
        TransferFee = transferFee;
    }
}

// 집합체 루트 기반 클래스
public abstract class AggregateRoot
{
    private readonly List<DomainEvent> _uncommittedEvents = new();
    
    public string Id { get; protected set; }
    public int Version { get; private set; }
    
    protected void ApplyEvent(DomainEvent @event)
    {
        // 이벤트를 집합체에 적용
        ApplyEventToState(@event);
        
        // 버전 증가
        Version++;
        @event.Version = Version;
        
        // 커밋되지 않은 이벤트 목록에 추가
        _uncommittedEvents.Add(@event);
    }
    
    protected abstract void ApplyEventToState(DomainEvent @event);
    
    public IEnumerable<DomainEvent> GetUncommittedEvents()
    {
        return _uncommittedEvents.AsReadOnly();
    }
    
    public void ClearUncommittedEvents()
    {
        _uncommittedEvents.Clear();
    }
    
    public void LoadFromHistory(IEnumerable<DomainEvent> events)
    {
        foreach (var @event in events.OrderBy(e => e.Version))
        {
            ApplyEventToState(@event);
            Version = @event.Version;
        }
    }
}

// 계좌 도메인 집합체
public class Account : AggregateRoot
{
    public string UserId { get; private set; }
    public string AccountType { get; private set; }
    public decimal Balance { get; private set; }
    public string Currency { get; private set; }
    public bool IsActive { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime LastTransactionAt { get; private set; }
    
    private Account() { } // EF Core를 위한 빈 생성자
    
    public static Account Create(
        string accountId, 
        string userId, 
        string accountType, 
        decimal initialDeposit,
        string currency)
    {
        // 비즈니스 규칙 검증
        if (initialDeposit < 0)
            throw new DomainException("초기 입금액은 0 이상이어야 합니다");
        
        if (string.IsNullOrEmpty(userId))
            throw new DomainException("사용자 ID는 필수입니다");
        
        if (!IsValidAccountType(accountType))
            throw new DomainException($"유효하지 않은 계좌 타입: {accountType}");
        
        var account = new Account();
        
        // 계좌 생성 이벤트 발생
        account.ApplyEvent(new AccountCreatedEvent(
            accountId, userId, accountType, initialDeposit, currency));
        
        return account;
    }
    
    public void Deposit(decimal amount, string reference)
    {
        if (amount <= 0)
            throw new DomainException("입금액은 0보다 커야 합니다");
        
        if (!IsActive)
            throw new DomainException("비활성 계좌에는 입금할 수 없습니다");
        
        var newBalance = Balance + amount;
        
        ApplyEvent(new MoneyDepositedEvent(Id, amount, newBalance, reference));
    }
    
    public void Withdraw(decimal amount, string reference)
    {
        if (amount <= 0)
            throw new DomainException("출금액은 0보다 커야 합니다");
        
        if (!IsActive)
            throw new DomainException("비활성 계좌에서는 출금할 수 없습니다");
        
        var fee = CalculateWithdrawalFee(amount);
        var totalAmount = amount + fee;
        
        if (Balance < totalAmount)
            throw new DomainException("잔액이 부족합니다");
        
        var newBalance = Balance - totalAmount;
        
        ApplyEvent(new MoneyWithdrawnEvent(Id, amount, newBalance, reference, fee));
    }
    
    public void TransferTo(string toAccountId, decimal amount, string reference)
    {
        if (amount <= 0)
            throw new DomainException("이체금액은 0보다 커야 합니다");
        
        if (!IsActive)
            throw new DomainException("비활성 계좌에서는 이체할 수 없습니다");
        
        if (Id == toAccountId)
            throw new DomainException("자기 자신에게는 이체할 수 없습니다");
        
        var transferFee = CalculateTransferFee(amount);
        var totalAmount = amount + transferFee;
        
        if (Balance < totalAmount)
            throw new DomainException("잔액이 부족합니다");
        
        var newBalance = Balance - totalAmount;
        
        ApplyEvent(new MoneyTransferredEvent(
            Id, toAccountId, amount, newBalance, reference, transferFee));
    }
    
    protected override void ApplyEventToState(DomainEvent @event)
    {
        switch (@event)
        {
            case AccountCreatedEvent e:
                Id = e.AggregateId;
                UserId = e.UserId;
                AccountType = e.AccountType;
                Balance = e.InitialDeposit;
                Currency = e.Currency;
                IsActive = true;
                CreatedAt = e.Timestamp;
                LastTransactionAt = e.Timestamp;
                break;
                
            case MoneyDepositedEvent e:
                Balance = e.BalanceAfter;
                LastTransactionAt = e.Timestamp;
                break;
                
            case MoneyWithdrawnEvent e:
                Balance = e.BalanceAfter;
                LastTransactionAt = e.Timestamp;
                break;
                
            case MoneyTransferredEvent e:
                Balance = e.BalanceAfter;
                LastTransactionAt = e.Timestamp;
                break;
        }
    }
    
    private static bool IsValidAccountType(string accountType)
    {
        var validTypes = new[] { "CHECKING", "SAVINGS", "BUSINESS", "INVESTMENT" };
        return validTypes.Contains(accountType.ToUpper());
    }
    
    private decimal CalculateWithdrawalFee(decimal amount)
    {
        // 출금 수수료 계산 로직
        return AccountType == "SAVINGS" && amount > 1000 ? 5.00m : 0.00m;
    }
    
    private decimal CalculateTransferFee(decimal amount)
    {
        // 이체 수수료 계산 로직
        return amount > 10000 ? 10.00m : 2.00m;
    }
}

// 이벤트 스토어 구현
public class EventStoreRepository : IAccountRepository
{
    private readonly IEventStore _eventStore;
    private readonly IEventPublisher _eventPublisher;
    private readonly ILogger<EventStoreRepository> _logger;
    
    public EventStoreRepository(
        IEventStore eventStore,
        IEventPublisher eventPublisher,
        ILogger<EventStoreRepository> logger)
    {
        _eventStore = eventStore;
        _eventPublisher = eventPublisher;
        _logger = logger;
    }
    
    public async Task<Account> GetByIdAsync(string accountId)
    {
        var streamName = GetStreamName(accountId);
        var events = await _eventStore.ReadStreamAsync(streamName);
        
        if (!events.Any())
        {
            return null;
        }
        
        var account = new Account();
        account.LoadFromHistory(events);
        
        _logger.LogDebug("계좌 로드 완료: {AccountId}, 이벤트 수: {EventCount}", 
            accountId, events.Count());
        
        return account;
    }
    
    public async Task SaveAsync(Account account)
    {
        var streamName = GetStreamName(account.Id);
        var expectedVersion = account.Version - account.GetUncommittedEvents().Count();
        var uncommittedEvents = account.GetUncommittedEvents().ToList();
        
        if (!uncommittedEvents.Any())
        {
            return;
        }
        
        try
        {
            // 이벤트 스토어에 저장
            await _eventStore.AppendToStreamAsync(
                streamName, 
                expectedVersion, 
                uncommittedEvents);
            
            // 이벤트 발행 (프로젝션 업데이트용)
            foreach (var @event in uncommittedEvents)
            {
                await _eventPublisher.PublishAsync(@event);
            }
            
            // 커밋되지 않은 이벤트 클리어
            account.ClearUncommittedEvents();
            
            _logger.LogInformation("계좌 저장 완료: {AccountId}, 이벤트 수: {EventCount}",
                account.Id, uncommittedEvents.Count);
        }
        catch (ConcurrencyException ex)
        {
            _logger.LogWarning("동시성 충돌: {AccountId}, 예상 버전: {ExpectedVersion}",
                account.Id, expectedVersion);
            throw new DomainException("다른 사용자가 동시에 같은 계좌을 수정했습니다. 다시 시도해주세요.");
        }
    }
    
    private string GetStreamName(string accountId)
    {
        return $"account-{accountId}";
    }
}
```

## 핵심 요점

### 1. Event Sourcing의 기본 원리

- **상태 저장 금지**: 현재 상태가 아닌 변화(이벤트)를 저장
- **이벤트 재생**: 저장된 이벤트들로 현재 상태 재구성
- **완전한 감사 추적**: 모든 변화 이력 영구 보존

### 2. 집합체(Aggregate) 설계

- **비즈니스 규칙 중심**: 도메인 로직을 집합체 내부에 캐샡화
- **이벤트 기반 설계**: 모든 비즈니스 로직이 이벤트 생산으로 귀결
- **상태 일관성**: 이벤트 적용으로만 상태 변경 가능

### 3. 이벤트 스토어 관리

- **동시성 제어**: Optimistic Concurrency Control로 데이터 일관성 보장
- **이벤트 발행**: 저장 후 다른 바운디드 컨텍스트에 이벤트 전파
- **스트림 관리**: 집합체별로 이벤트 스트림 분리

---

**이전**: [16.3b CQRS 패턴 구현](03b-cqrs-pattern-implementation.md)  
**다음**: [16.3d 프로젝션 구현](03d-projection-implementation.md)에서 이벤트로부터 읽기 모델을 생성하는 방법을 학습합니다.
