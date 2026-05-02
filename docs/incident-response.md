# FlowOS Incident Response Runbook

Quick reference for handling production incidents.

## Severity Levels

- **P0 (Critical)**: Complete service outage, data loss, security breach
- **P1 (High)**: Major feature degradation, significant performance issues
- **P2 (Medium)**: Partial feature issues, minor degradation
- **P3 (Low)**: Cosmetic issues, non-urgent bugs

---

## Emergency Contacts

- **Primary**: Founders/Engineering leads
- **On-call**: Check PagerDuty/Opsgenie rotation
- **Slack**: #incidents channel

---

## Quick Response Checklist

### 1. Assess Impact (2 minutes)

```bash
# Check overall health
curl https://flowos.app/api/health

# Check error rates in Vercel dashboard
# Check runtime logs in Railway
```

### 2. Communicate (5 minutes)

- Post in #incidents Slack channel
- Update status page if applicable
- Notify stakeholders for P0/P1

### 3. Mitigate (varies)

See specific scenarios below.

---

## P0 Scenarios

### Service Completely Down

**Symptoms**: 503 errors, health check failing

**Immediate Actions**:
1. Check Vercel status page
2. Check Railway status page
3. Enable maintenance mode:
   ```bash
   # In Vercel dashboard or via API
   EMERGENCY_MAINTENANCE_MODE=true
   ```
4. Post incident notice

**Recovery**:
1. Identify root cause from logs
2. Fix and deploy
3. Disable maintenance mode
4. Verify health checks pass

### Database Outage

**Symptoms**: All DB queries failing

**Immediate Actions**:
1. Check Supabase status page
2. Enable maintenance mode
3. Check for connection pool exhaustion

**Recovery**:
1. Wait for Supabase recovery, OR
2. Restore from backup if data issue
3. Verify connectivity before disabling maintenance

### Security Breach

**Symptoms**: Unauthorized access, suspicious activity

**Immediate Actions**:
1. Trigger kill switch:
   ```bash
   # This immediately stops all workflow execution
   DISABLE_WORKFLOW_EXECUTION=true
   ```
2. Rotate all service tokens
3. Review audit logs
4. Notify security team

**Recovery**:
1. Patch vulnerability
2. Re-rotate credentials
3. Gradually re-enable services
4. Post incident report

---

## P1 Scenarios

### Genesis Generating Invalid Schemas

**Symptoms**: High error rate in workflow creation, validation failures

**Immediate Actions**:
1. Disable Genesis temporarily:
   ```bash
   DISABLE_GENESIS_GENERATION=true
   ```
2. Check LiteLLM proxy status
3. Review recent model changes

**Recovery**:
1. Identify model/prompt issue
2. Fix and redeploy
3. Re-enable Genesis
4. Test with sample prompts

### High LLM Costs / Token Exploit

**Symptoms**: Spiking costs, unusual token usage

**Immediate Actions**:
1. Check cost tracking dashboard
2. Identify affected users/runs
3. Set emergency cost limits:
   ```bash
   MAX_COST_PER_RUN=1.0  # Temporarily lower
   ```

**Recovery**:
1. Review run logs for exploits
2. Block suspicious patterns
3. Adjust limits back to normal

### Connector Token Refresh Failing

**Symptoms**: OAuth errors across multiple connections

**Immediate Actions**:
1. Check circuit breaker status
2. Verify internal service tokens
3. Check Next.js internal API health

**Recovery**:
1. Reset circuit breakers if needed
2. Re-authenticate affected connections
3. Monitor for resolution

---

## Common Commands

### Enable Maintenance Mode

```bash
# Via Vercel CLI
vercel env add EMERGENCY_MAINTENANCE_MODE production
# Value: true
vercel --prod
```

### Reset Circuit Breakers

```python
# In Python runtime console
from engine.circuit_breaker import reset_all_circuits
reset_all_circuits()
```

### Check Run Limits

```python
from engine.run_limits import get_run_limits
limits = get_run_limits()
print(limits.get_limits())
```

### View Active Locks

```sql
-- In Supabase SQL editor
SELECT * FROM credential_locks 
WHERE expires_at > now()
ORDER BY created_at DESC;
```

### Kill Specific Run

```sql
-- Cancel a run
UPDATE runs 
SET status = 'cancelled', 
    error_message = 'Cancelled by operator'
WHERE id = 'run-id-here';
```

---

## Monitoring & Alerts

### Key Metrics to Watch

1. **Error Rate**: >5% is concerning, >10% is critical
2. **Latency**: API p95 >2s is concerning
3. **LLM Costs**: Daily spend 2x average is concerning
4. **Run Success Rate**: <90% is concerning

### Alert Channels

- P0: PagerDuty + Slack #incidents
- P1: Slack #incidents
- P2: Slack #alerts

---

## Post-Incident

### Within 24 Hours

1. Write incident summary
2. Identify root cause
3. List affected users/data

### Within 1 Week

1. Publish post-mortem
2. Implement preventive measures
3. Update this runbook if needed

---

## Feature Flags Reference

| Flag | Purpose | Default |
|------|---------|---------|
| `EMERGENCY_MAINTENANCE_MODE` | Block all API traffic | false |
| `DISABLE_GENESIS_GENERATION` | Stop AI program generation | false |
| `DISABLE_WORKFLOW_EXECUTION` | Stop all runs | false |
| `MAX_COST_PER_RUN` | Cost limit per run | 5.0 |
| `MAX_NODES_PER_RUN` | Node execution limit | 100 |
| `MAX_EXECUTION_TIME` | Run timeout | 600 |

---

## Escalation Path

1. **Self-Service** (0-15 min): Use this runbook
2. **Team Support** (15-30 min): Ping @channel in #incidents
3. **Executive** (30+ min): Call founders for P0

---

*Last updated: 2026-01-11*
*Version: 1.0*
