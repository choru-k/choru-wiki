# **The Uncomfortable Truth About CI/CD: Why We're Migrating from Jenkins to GitHub Actions Despite Its Limitations**

## **Introduction: The $30,000 Question**

Our team runs 200+ builds daily on Jenkins with Kubernetes. Our setup is sophisticated: StatefulSet Jenkins master, Kubernetes plugin for dynamic agents, Karpenter for node autoscaling, and custom Docker images with all our tooling pre-installed. It works.

So why are we migrating to GitHub Actions—a platform that can't even handle our 2GB Docker images efficiently, forces us to download dependencies on every build, and costs more in GitHub billing?

The answer lies not in feature comparisons, but in understanding the fundamental architecture differences and hidden costs that marketing materials never mention.

## **Part 1: The Jenkins Kubernetes Reality Check**

### **The Architecture We Thought We Had**

When we designed our Jenkins on Kubernetes setup, the architecture looked beautiful on paper:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: jenkins-master
spec:
  replicas: 1  # The first red flag we ignored
  template:
    spec:
      containers:
      - name: jenkins
        resources:
          requests:
            memory: "8Gi"
            cpu: "4"
```

We thought Kubernetes would solve our scaling problems. Infinite agents! Dynamic provisioning! Cost optimization with spot instances!

### **The Architecture We Actually Had**

After two years in production, here's what really happens:

```text
T+0ms:    Build #1827 triggered
T+5000ms: Queue dispatcher wakes up (first delay)
T+6000ms: Jenkins evaluates queue
T+7000ms: Decides to provision pod
T+8000ms: Calls Kubernetes API
T+8500ms: Pod created in etcd
T+9000ms: Karpenter sees pod pending
T+9500ms: Node already available, pod scheduled
T+14000ms: Image pulled (2GB)
T+15000ms: Container starting
T+20000ms: JNLP agent connecting back to Jenkins
T+22000ms: Agent registered
T+23000ms: Finally executing build

23 seconds before any actual work begins.
```

### **The Hidden Serial Bottleneck**

The most painful discovery came when we load-tested our setup. With 50 jobs submitted simultaneously:

```java
// From Jenkins Kubernetes Plugin source
private synchronized Collection<PlannedNode> provision() {
    for (int i = 0; i < excessWorkload; i++) {
        if (i > MAX_CONCURRENT_PROVISIONS) break;  // Limited to 10!

        PodTemplate template = getTemplate();
        pods.add(createPod(template));
        Thread.sleep(PROVISION_DELAY_MS);  // 1 second delay
    }
}
```

That `synchronized` keyword? It means Jenkins creates pods one-by-one. Those 50 jobs? They take 5+ minutes just to get executors assigned.

### **The StatefulSet Trap**

Our HA strategy was fundamentally flawed:

```yaml
# What we wanted: High Availability
jenkins-master-0 (active)
jenkins-master-1 (standby)  # Useless! Jenkins doesn't support active-active

# What we got: Single Point of Failure with extra steps
```

Every job, every log line, every artifact upload—everything flows through that single master. Our monitoring shows:

-**CPU**: Constant 60-80% utilization just managing agents
-**Network**: 100+ persistent TCP connections
-**Memory**: 8GB RAM, 6GB heap, constant GC pressure
-**Thread count**: 400+ threads managing agent connections

## **Part 2: The GitHub Actions Architecture Revelation**

### **No Master, No Problem**

GitHub Actions has no central master. Each runner is autonomous:

```go
// Simplified runner logic
for {
    job := pollGitHub()  // No persistent connection
    if job != nil {
        executeJob(job)
        uploadResults(job)
    }
    time.Sleep(1 * time.Second)
}
```

With 50 jobs submitted:

- All 50 runners see jobs simultaneously
- All 50 claim jobs within 1-2 seconds
- No serial bottleneck
- No central coordination required

### **The Real Performance Numbers**

We benchmarked identical workflows:

| Metric | Jenkins on K8s | GitHub Actions Self-Hosted | Difference |
|--------|----------------|---------------------------|------------|
| Job start latency (P50) | 18s | 2s | 9x faster |
| Job start latency (P99) | 45s | 5s | 9x faster |
| 50 concurrent jobs | 5m to start all | 5s to start all | 60x faster |
| Master CPU usage | 80% | N/A (no master) | - |
| Network traffic | 50GB/day through master | 0 (direct to GitHub) | 100% reduction |

## **Part 3: The Brutal Honesty About GitHub Actions' Weaknesses**

### **The Dependency Download Disaster**

Our largest Node.js application:

```text
node_modules size: 1.2GB
Download time: 35-40 seconds
Cache restoration: 30-35 seconds (barely better!)
```

Every. Single. Build.

### **The Network Cost Bomb**

```text
Monthly GitHub Actions network costs:
- 200 builds/day × 1.2GB dependencies = 240GB/day
- 240GB × 30 days = 7.2TB/month
- AWS data transfer: 7.2TB × $0.09/GB = $648/month
- NAT Gateway costs: 7.2TB × $0.045/GB = $324/month
Total: $972/month just for downloading dependencies!
```

### **The Docker Image Maintenance Paradise Lost**

Our Jenkins setup:

```dockerfile
FROM ubuntu:22.04
# 200 lines of tool installation
# Results in a 3GB image
# But it's pulled ONCE per node, cached forever
```

GitHub Actions:

```yaml
- run: npm install
- run: pip install -r requirements.txt
- run: bundle install
- run: apt-get install -y ...
# Every. Single. Build.
```

### **The Limited Concurrency Ceiling**

- GitHub Free: 20 concurrent jobs (laughable)
- GitHub Team: 40 concurrent jobs (still not enough)
- GitHub Enterprise: 500 concurrent jobs (finally usable, but $$$)

## **Part 4: Why We're Still Migrating (The Counterintuitive Logic)**

### **1. The 90% Use Case**

Analyzing our 10,000 builds from last month:
-**89%**: Simple CI tasks (linting, unit tests, security scans)
-**8%**: Integration tests
-**3%**: Complex deployment pipelines

For 89% of our builds, GitHub Actions is actually faster despite downloading dependencies:

```text
Jenkins: 23s startup + 10s execution = 33s total
GitHub Actions: 2s startup + 15s npm install + 10s execution = 27s total
```

### **2. The Developer Experience Revolution**

**PR-based workflow in GitHub Actions:**

```yaml
name: CI
on:
  pull_request:
    paths:
      - 'src/**'
      - 'package.json'
```

Results appear directly in the PR. No context switching. No separate Jenkins UI. Developers actually look at CI results now.

**Jenkins workflow:**

1. Push code
2. Open Jenkins (separate login)
3. Find your job (among 500 others)
4. Check console output
5. Context switch back to GitHub

The cognitive overhead reduction is massive.

### **3. The Maintenance Time Bomb**

Our Jenkins maintenance burden (monthly):
-**8 hours**: Plugin updates and compatibility testing
-**4 hours**: Docker image rebuilds and security patches
-**6 hours**: Debugging pod provisioning issues
-**3 hours**: Master JVM tuning and GC analysis
-**2 hours**: Backup and disaster recovery testing
-**Total**: 23 hours/month = $3,450 in engineering time

GitHub Actions maintenance:
-**2 hours**: Runner image updates
-**Total**: 2 hours/month = $300 in engineering time

Annual savings: $37,800 in engineering time alone.

### **4. The Scaling Paradox**

Jenkins scaling is a lie:

```text
More jobs → More pods → More master load → Master bottleneck
Adding nodes doesn't help when the master is the bottleneck
```

GitHub Actions scaling is linear:

```text
More jobs → More runners → Linear scaling
Each runner is independent
```

## **Part 5: The Hybrid Architecture We Actually Built**

We didn't migrate everything. Here's our pragmatic split:

### **Stayed on Jenkins:**

```groovy
// Complex deployments with state management
pipeline {
    stages {
        stage('Database Migration') { ... }
        stage('Blue-Green Deployment') { ... }
        stage('Smoke Tests') { ... }
        stage('Traffic Shifting') { ... }
        stage('Rollback Gate') { ... }
    }
}
```

Why: Stateful, complex orchestration, proven reliability

### **Moved to GitHub Actions:**

```yaml
# High-volume, simple CI
name: PR Validation
on: pull_request
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci && npm run lint

  security:
    runs-on: ubuntu-latest
    steps:
      - run: trivy scan
```

Why: Fast feedback, low complexity, developer experience

### **The Numbers After 6 Months**

| Metric | Before (100% Jenkins) | After (Hybrid) | Change |
|--------|----------------------|----------------|---------|
| Average CI time | 4.5 min | 1.8 min | -60% |
| Developer satisfaction | 3.2/5 | 4.6/5 | +44% |
| Monthly maintenance hours | 23 | 8 | -65% |
| Infrastructure cost | $4,200 | $3,100 | -26% |
| Network transfer cost | $200 | $972 | +386% |
|**Total monthly cost**| $8,050 | $6,522 | -19% |

## **Part 6: The Technical Deep Dive**

### **Why Jenkins Pod Creation is Fundamentally Broken**

The problem isn't Kubernetes or network latency. It's architectural:

```java
// Jenkins Core - Single-threaded queue processor
class Queue {
    private synchronized void maintain() {
        // Only ONE thread can process queue
        while (!queue.isEmpty()) {
            Item item = queue.peek();
            if (canProvision(item)) {
                // Serial processing enforced here
                provision(item);
                queue.remove(item);
            }
        }
    }
}

// Kubernetes Plugin - Forced serialization
class KubernetesCloud {
    private static final Object provisioningLock = new Object();

    public Collection<PlannedNode> provision() {
        synchronized(provisioningLock) {  // Global lock!
            // Only one pod creation at a time
            createPod();
            Thread.sleep(1000);  // Forced delay
        }
    }
}
```

This isn't a bug—it's designed this way to prevent overwhelming the Kubernetes API. But it makes Jenkins fundamentally unsuitable for burst workloads.

### **Why GitHub Actions Runners Scale Linearly**

Each runner is a separate process with no shared state:

```go
// Each runner is independent
type Runner struct {
    id       string
    pollURL  string
    // No references to other runners
    // No central coordinator
    // No shared locks
}

func (r *Runner) Start() {
    for {
        job := r.pollForJob()  // HTTP polling, stateless
        if job != nil {
            r.executeJob(job)   // Completely independent
            r.uploadResults()   // Direct to storage
        }
    }
}
```

50 runners = 50 independent processes = true parallel execution

### **The Network Architecture Difference**

**Jenkins: Hub and Spoke**

```text
        ┌─────────────┐
        │   Master    │
        └──────┬──────┘
    ┌──────────┼──────────┐
    ▼          ▼          ▼
[Agent 1]  [Agent 2]  [Agent 3]

Every byte flows through master
Master bandwidth = bottleneck
```

**GitHub Actions: Mesh**

```text
[Runner 1] ←→ [GitHub API]
[Runner 2] ←→ [GitHub API]
[Runner 3] ←→ [GitHub API]

[Runner 1] ←→ [S3 Artifacts]
[Runner 2] ←→ [S3 Artifacts]

Direct connections, no bottleneck
```

## **Part 7: The Migration Decision Framework**

### **Keep on Jenkins When:**

1.**Complex State Management Required**

   ```groovy
   // Stateful deployments with rollback
   if (smokeTestsFailed) {
       rollback()
       notifyOncall()
       createIncident()
   }
   ```

2.**Regulatory Compliance Demands**

   ```groovy
   // Audit trail with signed artifacts
   withCredentials([certificate(credentialsId: 'signing-cert')]) {
       sh 'sign-binary --cert=$CERT --binary=app.exe'
   }
   ```

3.**Monolithic Applications**

- 45+ minute build times
- 10GB+ artifacts
- Complex dependency graphs

### **Move to GitHub Actions When:**

1.**Fast Feedback Loops Needed**

   ```yaml
   # PR checks under 2 minutes
   on: pull_request
   jobs:
     quick-check:
       timeout-minutes: 2
   ```

2.**High Concurrency Requirements**

- 50+ concurrent PR builds
- Microservices with independent pipelines
- Feature branch heavy workflows

3.**Developer Experience Priority**

- Direct GitHub integration
- No context switching
- Immediate feedback in PRs

## **Part 8: The Hidden Costs Nobody Talks About**

### **Jenkins Hidden Costs**

1.**The JVM Tax**

   ```text
   8GB heap → 12GB container → 16GB node reservation
   Actual utilization: 40%
   Waste: $1,200/month in unused memory
   ```

2.**The Plugin Ecosystem Trap**

- 45 plugins in our setup
- Average 3 breaking changes per month
- 6 hours debugging plugin conflicts monthly

3.**The Kubernetes API Pressure**

   ```bash
   # Jenkins hammering K8s API
   kubectl top nodes
   # API server CPU: 85% (mostly Jenkins)
   ```

### **GitHub Actions Hidden Costs**

1.**The Vendor Lock-in Reality**

   ```yaml
   # GitHub-specific features everywhere
   - uses: actions/github-script@v6
     with:
       github-token: ${{ secrets.GITHUB_TOKEN }}
   ```

2.**The Minute Billing Trap**

   ```text
   Job duration: 1 minute 3 seconds
   Billed: 2 minutes (100% markup for 3 seconds!)
   Monthly impact: $400 in rounded-up minutes
   ```

3.**The Cache Transfer Costs**

   ```text
   Cache miss rate: 15%
   Rebuild cache: 500MB upload
   Cost: $0.09/GB × 500MB × 200 builds/day × 0.15 = $1.35/day
   Annual: $493 just for cache misses
   ```

## **Part 9: What We Wish We Knew Before Starting**

### **1. The False Economy of "Free" Self-Hosted Runners**

"Free" self-hosted runners actually cost:

- EC2 instances: $2,000/month
- Network transfer: $972/month
- Runner maintenance: $300/month (2 hours)
- Security patching: $450/month (3 hours)
-**Total**: $3,722/month

GitHub-hosted runners would have been: $2,000/month

### **2. The Concurrency Limits Are Non-Negotiable**

We tried everything:

- Multiple organizations: Billing nightmare
- Repository splitting: Lost monorepo benefits
- Time-shifting builds: Developers revolted

Reality: You need Enterprise for serious workloads.

### **3. The Migration Is Never "Just CI"**

What started as "let's move linting to Actions" became:

- Rewriting deployment scripts
- Changing artifact storage
- Updating documentation
- Retraining developers
- Modifying security policies
- Updating compliance procedures

**Actual migration time: 8 months, not 2 months**

## **Part 10: The Verdict**

### **The Brutal Truth**

GitHub Actions is not better than Jenkins at CI/CD. It's better at**developer-centric continuous integration**. Jenkins remains superior for**operations-centric continuous deployment**.

### **Our Final Architecture**

```yaml
# GitHub Actions: 89% of builds (simple, fast, developer-facing)
- Pull request validation
- Unit tests
- Security scans
- Documentation builds
- Container image builds

# Jenkins: 11% of builds (complex, stateful, critical)
- Production deployments
- Database migrations
- Infrastructure provisioning
- Disaster recovery
- Compliance reporting
```

### **The Numbers That Matter**

**Developer Velocity**

- PR feedback time:**-67%**(12 min → 4 min)
- CI failure investigation time:**-54%**(30 min → 14 min)
- Time to first commit for new developers:**-80%**(5 hours → 1 hour)

**Operational Metrics**

- Deployment reliability:**Unchanged**(kept on Jenkins)
- Infrastructure costs:**-19%**overall
- Maintenance burden:**-65%**

**The Intangible Win**
Developers now actually care about CI. They fix broken builds immediately because the feedback is instant and integrated. This cultural shift alone justified the migration.

## **Conclusion: Engineering Is About Trade-offs**

We chose GitHub Actions not because it's perfect, but because its weaknesses (network costs, dependency downloads, vendor lock-in) are easier to manage than Jenkins' weaknesses (architectural bottlenecks, maintenance burden, developer experience).

The future isn't GitHub Actions or Jenkins. It's both, strategically deployed where each excels. The teams that recognize this will build faster, deploy safer, and spend less time fighting their tools.

**The ultimate lesson?**Sometimes the "worse" technology wins because it's worse at things that don't matter for your use case and better at things that do.

---

*Final thought: If you're running 50+ builds per day and your developers are complaining about CI speed, the problem isn't your tool choice. It's that you're optimizing for the wrong metrics. We spent two years making Jenkins "perfect" for ops while our developers suffered. GitHub Actions forced us to prioritize developer experience, and that changed everything.*
