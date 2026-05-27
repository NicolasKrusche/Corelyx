# Capacity Review - May 2026

**Owner:** Corelyx founding team  
**Review date:** 2026-05-27  
**Scope:** Web app, runtime, database, workflow orchestration, email, billing, and model-provider integrations.

| Service | Capacity signal | Current assessment | Action |
|---|---|---|---|
| Vercel | Build/runtime limits and bandwidth | No documented saturation in local evidence | Review project dashboard monthly |
| Supabase | Database size, connection limits, backups | Retention jobs reduce operational data growth | Review storage and connection metrics monthly |
| Railway | Runtime CPU/memory and execution duration | Runtime has per-run timeout and execution limits | Monitor failed runs and timeout rate |
| Inngest | Retention job schedule and event delivery | Data-retention purge job exists | Review job success logs monthly |
| Resend | Transactional email quota | Support/security email only | Monitor send failures |
| Stripe | Billing events and webhook delivery | Low-volume expected | Monitor webhook failures |

## Risks

- Provider limits may change as workflow volume grows.
- High-volume workflows can increase log and run-row growth; retention controls must stay enabled.
- EU-only mode may reduce available provider choices and require customer communication before activation.

## Next Review

2026-06-30, or earlier if a production incident, enterprise customer launch, or pricing-plan limit change occurs.
