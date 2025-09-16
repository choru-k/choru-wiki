---
tags:
  - CQRS
  - DDD
  - advanced
  - command-pattern
  - deep-study
  - event-sourcing
  - hands-on
  - query-pattern
  - 애플리케이션개발
difficulty: ADVANCED
learning_time: "8-12시간"
main_topic: "애플리케이션 개발"
priority_score: 4
---

# 16.3b CQRS 패턴 구현

## 📚 Command와 Query 책임 분리의 실제 구현

```csharp
// C#으로 구현한 CQRS 패턴

// === COMMAND SIDE (쓰기) ===

// 명령 정의
public abstract class Command
{
    public string CommandId { get; }
    public DateTime Timestamp { get; }
    public string UserId { get; }
    
    protected Command(string userId)
    {
        CommandId = Guid.NewGuid().ToString();
        Timestamp = DateTime.UtcNow;
        UserId = userId;
    }
}

public class CreateAccountCommand : Command
{
    public string AccountId { get; }
    public string AccountType { get; }
    public decimal InitialDeposit { get; }
    public string Currency { get; }
    
    public CreateAccountCommand(
        string userId, 
        string accountId, 
        string accountType, 
        decimal initialDeposit,
        string currency = "USD"
    ) : base(userId)
    {
        AccountId = accountId;
        AccountType = accountType;
        InitialDeposit = initialDeposit;
        Currency = currency;
    }
}

public class TransferMoneyCommand : Command
{
    public string FromAccountId { get; }
    public string ToAccountId { get; }
    public decimal Amount { get; }
    public string Reference { get; }
    
    public TransferMoneyCommand(
        string userId,
        string fromAccountId,
        string toAccountId,
        decimal amount,
        string reference
    ) : base(userId)
    {
        FromAccountId = fromAccountId;
        ToAccountId = toAccountId;
        Amount = amount;
        Reference = reference;
    }
}

// 명령 핸들러
public interface ICommandHandler<TCommand> where TCommand : Command
{
    Task<CommandResult> HandleAsync(TCommand command);
}

public class CreateAccountCommandHandler : ICommandHandler<CreateAccountCommand>
{
    private readonly IAccountRepository _accountRepository;
    private readonly IEventStore _eventStore;
    private readonly ILogger<CreateAccountCommandHandler> _logger;
    
    public CreateAccountCommandHandler(
        IAccountRepository accountRepository,
        IEventStore eventStore,
        ILogger<CreateAccountCommandHandler> logger)
    {
        _accountRepository = accountRepository;
        _eventStore = eventStore;
        _logger = logger;
    }
    
    public async Task<CommandResult> HandleAsync(CreateAccountCommand command)
    {
        try
        {
            // 1. 비즈니스 규칙 검증
            await ValidateBusinessRules(command);
            
            // 2. 도메인 집합체 생성
            var account = Account.Create(
                command.AccountId,
                command.UserId,
                command.AccountType,
                command.InitialDeposit,
                command.Currency
            );
            
            // 3. 집합체 저장 (이벤트들이 저장됨)
            await _accountRepository.SaveAsync(account);
            
            _logger.LogInformation("계좌 생성 완료: {AccountId}", command.AccountId);
            
            return CommandResult.Success(command.CommandId);
        }
        catch (DomainException ex)
        {
            _logger.LogWarning("계좌 생성 실패 - 도메인 규칙 위반: {Error}", ex.Message);
            return CommandResult.Failure(command.CommandId, ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "계좌 생성 중 예기치 못한 오류");
            return CommandResult.Failure(command.CommandId, "내부 서버 오류");
        }
    }
    
    private async Task ValidateBusinessRules(CreateAccountCommand command)
    {
        // 최소 입금액 검증
        if (command.InitialDeposit < 100)
        {
            throw new DomainException("최소 입금액은 $100입니다");
        }
        
        // 계좌 ID 중복 검증
        var existingAccount = await _accountRepository.GetByIdAsync(command.AccountId);
        if (existingAccount != null)
        {
            throw new DomainException($"계좌 ID {command.AccountId}는 이미 존재합니다");
        }
        
        // 사용자당 계좌 개수 제한
        var userAccountCount = await _accountRepository.CountByUserIdAsync(command.UserId);
        if (userAccountCount >= 5)
        {
            throw new DomainException("사용자당 최대 5개의 계좌만 생성할 수 있습니다");
        }
    }
}

// === QUERY SIDE (읽기) ===

// 쿼리 정의
public abstract class Query<TResult>
{
    public string QueryId { get; }
    public DateTime Timestamp { get; }
    
    protected Query()
    {
        QueryId = Guid.NewGuid().ToString();
        Timestamp = DateTime.UtcNow;
    }
}

public class GetAccountSummaryQuery : Query<AccountSummaryDto>
{
    public string AccountId { get; }
    
    public GetAccountSummaryQuery(string accountId)
    {
        AccountId = accountId;
    }
}

public class GetTransactionHistoryQuery : Query<TransactionHistoryDto>
{
    public string AccountId { get; }
    public DateTime? FromDate { get; }
    public DateTime? ToDate { get; }
    public int PageNumber { get; }
    public int PageSize { get; }
    
    public GetTransactionHistoryQuery(
        string accountId, 
        DateTime? fromDate = null, 
        DateTime? toDate = null,
        int pageNumber = 1,
        int pageSize = 20)
    {
        AccountId = accountId;
        FromDate = fromDate ?? DateTime.UtcNow.AddDays(-30);
        ToDate = toDate ?? DateTime.UtcNow;
        PageNumber = pageNumber;
        PageSize = pageSize;
    }
}

// 읽기 모델 (Read Model)
public class AccountSummaryDto
{
    public string AccountId { get; set; }
    public string AccountType { get; set; }
    public decimal CurrentBalance { get; set; }
    public decimal AvailableBalance { get; set; }
    public string Currency { get; set; }
    public DateTime LastTransactionDate { get; set; }
    public int TransactionCount30Days { get; set; }
    public List<string> RecentTransactionIds { get; set; }
}

public class TransactionHistoryDto
{
    public List<TransactionDto> Transactions { get; set; }
    public int TotalCount { get; set; }
    public int PageNumber { get; set; }
    public int PageSize { get; set; }
    public bool HasNextPage { get; set; }
}

public class TransactionDto
{
    public string TransactionId { get; set; }
    public string Type { get; set; } // "CREDIT", "DEBIT", "TRANSFER"
    public decimal Amount { get; set; }
    public string Currency { get; set; }
    public DateTime Timestamp { get; set; }
    public string Description { get; set; }
    public decimal BalanceAfter { get; set; }
    public string CounterpartyAccount { get; set; }
    public string Reference { get; set; }
}

// 쿼리 핸들러
public interface IQueryHandler<TQuery, TResult> where TQuery : Query<TResult>
{
    Task<TResult> HandleAsync(TQuery query);
}

public class GetAccountSummaryQueryHandler : IQueryHandler<GetAccountSummaryQuery, AccountSummaryDto>
{
    private readonly IAccountSummaryRepository _summaryRepository;
    private readonly IMemoryCache _cache;
    private readonly ILogger<GetAccountSummaryQueryHandler> _logger;
    
    public GetAccountSummaryQueryHandler(
        IAccountSummaryRepository summaryRepository,
        IMemoryCache cache,
        ILogger<GetAccountSummaryQueryHandler> logger)
    {
        _summaryRepository = summaryRepository;
        _cache = cache;
        _logger = logger;
    }
    
    public async Task<AccountSummaryDto> HandleAsync(GetAccountSummaryQuery query)
    {
        // 캐시에서 먼저 조회
        var cacheKey = $"account_summary_{query.AccountId}";
        
        if (_cache.TryGetValue(cacheKey, out AccountSummaryDto cachedSummary))
        {
            _logger.LogDebug("계좌 요약 캐시 적중: {AccountId}", query.AccountId);
            return cachedSummary;
        }
        
        // 캐시 미스 시 데이터베이스에서 조회
        var summary = await _summaryRepository.GetByAccountIdAsync(query.AccountId);
        
        if (summary == null)
        {
            throw new NotFoundException($"계좌 {query.AccountId}를 찾을 수 없습니다");
        }
        
        // 캐시에 저장 (5분간 유지)
        var cacheOptions = new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5),
            SlidingExpiration = TimeSpan.FromMinutes(1)
        };
        
        _cache.Set(cacheKey, summary, cacheOptions);
        
        _logger.LogDebug("계좌 요약 조회 완료: {AccountId}", query.AccountId);
        return summary;
    }
}

// CQRS 중재자 (Mediator)
public interface ICommandBus
{
    Task<CommandResult> SendAsync<TCommand>(TCommand command) where TCommand : Command;
}

public interface IQueryBus
{
    Task<TResult> SendAsync<TResult>(Query<TResult> query);
}

public class InMemoryCommandBus : ICommandBus
{
    private readonly IServiceProvider _serviceProvider;
    
    public InMemoryCommandBus(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }
    
    public async Task<CommandResult> SendAsync<TCommand>(TCommand command) where TCommand : Command
    {
        var handler = _serviceProvider.GetRequiredService<ICommandHandler<TCommand>>();
        return await handler.HandleAsync(command);
    }
}

public class InMemoryQueryBus : IQueryBus
{
    private readonly IServiceProvider _serviceProvider;
    
    public InMemoryQueryBus(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }
    
    public async Task<TResult> SendAsync<TResult>(Query<TResult> query)
    {
        var handlerType = typeof(IQueryHandler<,>).MakeGenericType(query.GetType(), typeof(TResult));
        var handler = _serviceProvider.GetRequiredService(handlerType);
        
        var method = handlerType.GetMethod("HandleAsync");
        var task = (Task<TResult>)method.Invoke(handler, new object[] { query });
        
        return await task;
    }
}
```

## 핵심 요점

### 1. 명령(Command) 설계 원칙

- **불변성**: 명령 객체는 생성 후 변경되지 않음
- **의도 명시**: 비즈니스 의도가 명확히 드러나는 명명
- **검증 책임**: 명령 핸들러에서 비즈니스 규칙 검증

### 2. 쿼리(Query) 최적화

- **읽기 전용**: 시스템 상태를 변경하지 않음
- **캐싱 활용**: 성능 향상을 위한 적극적 캐싱
- **특화된 모델**: 각 조회 목적에 최적화된 DTO

### 3. 책임 분리의 효과

- **독립적 확장**: 읽기와 쓰기를 개별적으로 스케일링
- **병렬 개발**: 팀이 독립적으로 개발 가능
- **성능 최적화**: 각 용도에 맞는 최적화 전략 적용

---

**이전**: [16.3a CQRS 기초와 실전 경험](./16-06-cqrs-fundamentals.md)  
**다음**: [16.3c Event Sourcing 구현](./03c-event-sourcing-implementation.md)에서 도메인 이벤트와 이벤트 스토어 구현을 학습합니다.

## 📚 관련 문서

### 📖 현재 문서 정보

- **난이도**: ADVANCED
- **주제**: 애플리케이션 개발
- **예상 시간**: 8-12시간

### 🎯 학습 경로

- [📚 ADVANCED 레벨 전체 보기](../learning-paths/advanced/)
- [🏠 메인 학습 경로](../learning-paths/)
- [📋 전체 가이드 목록](../README.md)

### 📂 같은 챕터 (chapter-16-distributed-system-patterns)

- [15.1 마이크로서비스 아키텍처 개요](../chapter-15-microservices-architecture/16-01-microservices-architecture.md)
- [15.1A 모놀리스 문제점과 전환 전략](../chapter-15-microservices-architecture/16-10-monolith-to-microservices.md)
- [16.1B 마이크로서비스 설계 원칙과 패턴 개요](./16-11-design-principles.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-12-1-single-responsibility-principle.md)
- [16.1B1 단일 책임 원칙 (Single Responsibility Principle)](./16-13-1-single-responsibility.md)

### 🏷️ 관련 키워드

`CQRS`, `command-pattern`, `query-pattern`, `DDD`, `event-sourcing`

### ⏭️ 다음 단계 가이드

- 시스템 전체의 관점에서 이해하려 노력하세요
- 다른 고급 주제들과의 연관성을 파악해보세요
