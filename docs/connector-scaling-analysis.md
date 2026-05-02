# Connector & API Key Scaling Analysis

## Current Architecture Overview

### Connector System
- **205 connectors** loaded dynamically at runtime startup
- Each connector is a Python module implementing `IConnector` interface
- Connectors instantiated fresh on each execution (no pooling)
- Each connector creates new `httpx.AsyncClient` for every operation

### Authentication Flow
1. OAuth tokens fetched from Next.js `/api/internal/connections/{id}/token`
2. API keys fetched from Vault via `/api/internal/vault/{ref}`
3. Tokens cached in memory for 5 minutes
4. No distributed locking for token refresh (RACE CONDITION RISK)

### Current Resource Limits
- 30-second timeout per connector call
- Rate limiting handled per-connector with retry logic
- No global connector call limits

---

## Identified Scaling Issues

### 1. 🚨 Connection Pool Exhaustion (HIGH RISK)

**Problem**: Each connector creates a new `httpx.AsyncClient` per execution:

```python
# In gmail.py connector
async with httpx.AsyncClient(timeout=30.0) as client:
    # ... make requests
```

**Impact**:
- High connection churn under load
- TCP socket exhaustion
- Increased latency from connection setup/teardown
- Memory pressure from client objects

**Threshold**: ~1000 concurrent connector calls could exhaust file descriptors

### 2. 🚨 OAuth Token Refresh Race Condition (HIGH RISK)

**Problem**: Multiple runs hitting the same expired token will all trigger refresh:

```python
# OLD CODE - vulnerable to race condition
access_token = await self._fetch_oauth_token(connection_id)
```

**Impact**:
- Token invalidation cascades
- User's OAuth session disrupted
- All runs fail simultaneously

### 3. ⚠️ No Connector Call Quotas (MEDIUM RISK)

**Problem**: A single run can make unlimited connector calls:

```python
# Loop node with 1000 iterations, each making Gmail call
for item in items:  # 1000 items
    await gmail_connector.execute(...)  # No limit check
```

**Impact**:
- API quota exhaustion (Gmail, Slack, etc.)
- Runaway costs
- Provider rate limiting

### 4. ⚠️ Connector Loading Memory (MEDIUM RISK)

**Problem**: All 205 connectors loaded at startup:

```python
# In connectors/__init__.py
REGISTRY: dict[str, type[IConnector]] = _discover_registry()
```

**Impact**:
- ~50-100MB memory per runtime instance
- Slower cold starts
- Unused connectors still consume memory

### 5. ⚠️ No Circuit Breaker for External APIs (MEDIUM RISK)

**Problem**: If Gmail/Slack API is down, all runs keep trying:

**Impact**:
- Wasted compute on doomed requests
- Increased error rates
- No graceful degradation

---

## Implemented Solutions

### ✅ 1. Distributed Credential Locking

**File**: `apps/runtime/engine/credential_lock.py`

Prevents race conditions during token refresh:

```python
manager = get_token_refresh_manager()
token = await manager.refresh_with_lock(
    connection_id,
    self._do_fetch_oauth_token,
    connection_id,
    force_refresh,
)
```

**Table**: `credential_locks` with 30-second TTL

### ✅ 2. Connector Call Limits

**File**: `apps/runtime/engine/run_limits.py`

Limits per run:
- Max 100 connector calls (free) / 500 (paid)
- Tracks and enforces at runtime

```python
self._limiter.check_connector_call()  # Raises RunLimitExceeded if over limit
```

### ✅ 3. Circuit Breakers

**File**: `apps/runtime/engine/circuit_breaker.py`

Protects against cascading failures:

```python
circuit = get_oauth_token_circuit()
token = await circuit.call(self._fetch_oauth_token, connection_id)
```

States:
- CLOSED: Normal operation
- OPEN: Reject calls for 60 seconds after 5 failures
- HALF_OPEN: Allow 3 test calls to check recovery

### ✅ 4. Cost Tracking

**File**: `apps/web/lib/cost-tracking.ts`

Tracks LLM usage per user/day:

```typescript
await trackLLMUsage({
  userId,
  model,
  promptTokens,
  completionTokens,
  estimatedCost,
});
```

**Table**: `llm_usage_logs`

---

## Recommendations for Production Scaling

### Phase 1: Immediate (Pre-Launch)

1. **Deploy database migrations**
   ```bash
   supabase migration up
   ```

2. **Set environment variables**
   ```bash
   # Run limits
   MAX_NODES_PER_RUN=100
   MAX_CONNECTOR_CALLS_PER_RUN=100
   MAX_COST_PER_RUN=5.0
   MAX_EXECUTION_TIME=600
   
   # Circuit breaker
   CIRCUIT_FAILURE_THRESHOLD=5
   CIRCUIT_RECOVERY_TIMEOUT=60
   ```

3. **Enable maintenance mode capability**
   - Test emergency stop procedure
   - Document in incident response runbook

### Phase 2: Short Term (First Month)

4. **Implement connection pooling**
   - Use shared `httpx.AsyncClient` across connector calls
   - Pool size: 100 connections per runtime instance
   - Connection TTL: 5 minutes

5. **Add connector usage quotas**
   - Per-user daily limits
   - Per-workspace limits
   - Alert at 80%, hard stop at 100%

6. **Lazy-load connectors**
   - Only load connectors when first used
   - Cache loaded connectors in registry
   - Unload unused connectors after 10 minutes

### Phase 3: Medium Term (Quarter 1)

7. **Add connector-level circuit breakers**
   - Separate circuit per provider (Gmail, Slack, etc.)
   - Provider-specific thresholds

8. **Implement request coalescing**
   - Multiple runs requesting same token → single refresh request
   - Cache shared across concurrent runs

9. **Add connector performance metrics**
   - Track latency per connector
   - Track error rates
   - Auto-disable failing connectors

### Phase 4: Long Term (Year 1)

10. **Shard runtime by connector type**
    - Separate instances for high-volume connectors
    - Gmail/Slack/Notion on dedicated runners
    - Tier 3 connectors on shared instances

11. **Implement connector sandboxing**
    - Isolate connectors in separate processes
    - Prevent memory leaks from affecting main runtime
    - Kill misbehaving connectors

---

## Scaling Thresholds

### Current Capacity (Single Runtime Instance)

| Metric | Limit | Notes |
|--------|-------|-------|
| Concurrent runs | 50 | Limited by Python GIL + async |
| Connectors/second | ~100 | Limited by connection pool |
| LLM calls/second | ~20 | Limited by external API quotas |
| Memory usage | ~500MB | All connectors loaded |
| Cold start | 5-10s | Connector discovery |

### Scaling Triggers

**Scale up (add runtime instances) when:**
- CPU > 70% for 5 minutes
- Memory > 80% for 5 minutes
- Run queue > 100 pending
- Average run latency > 30 seconds

**Enable circuit breaker when:**
- Error rate > 10% for provider
- 5 consecutive failures
- Latency > 10 seconds p95

**Enable maintenance mode when:**
- Database connection failures
- >50% run failure rate
- Suspected security incident

---

## Monitoring Checklist

### Key Metrics to Track

1. **Runtime Health**
   - [ ] Active runs count
   - [ ] Run success/failure rate
   - [ ] Average run duration
   - [ ] Memory usage

2. **Connector Performance**
   - [ ] Calls per connector type
   - [ ] Average latency per connector
   - [ ] Error rate per connector
   - [ ] Circuit breaker state

3. **OAuth Token Health**
   - [ ] Refresh rate
   - [ ] Refresh failures
   - [ ] Token cache hit rate
   - [ ] Concurrent refresh collisions

4. **Cost Control**
   - [ ] Daily spend per user
   - [ ] Cost per run
   - [ ] Limit enforcement events
   - [ ] Alert triggers

### Alert Thresholds

```yaml
alerts:
  high_error_rate:
    condition: error_rate > 10%
    duration: 5m
    severity: critical
    
  circuit_breaker_open:
    condition: any_circuit_open == true
    severity: warning
    
  cost_limit_warning:
    condition: daily_cost > 80% of limit
    severity: warning
    
  run_limit_exceeded:
    condition: run_limit_violations > 0
    severity: info
    
  credential_lock_contention:
    condition: lock_wait_time > 5s
    severity: warning
```

---

## Summary

**Current State**: Functional but vulnerable to:
- Race conditions on token refresh
- Runaway resource consumption
- Cascading failures

**Implemented Protections**:
- ✅ Credential locking
- ✅ Run limits (nodes, tokens, cost, time)
- ✅ Circuit breakers (LLM, OAuth)
- ✅ Cost tracking
- ✅ Kill switch / maintenance mode

**Next Priority**:
1. Connection pooling for connectors
2. Lazy loading of connectors
3. Connector-level quotas
4. Request coalescing

**Estimated Timeline**:
- Phase 1: 1 day (deployment)
- Phase 2: 1 week (pooling, quotas)
- Phase 3: 1 month (circuit breakers, metrics)
- Phase 4: 3 months (sharding, sandboxing)
