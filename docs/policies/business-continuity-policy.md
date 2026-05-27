# Corelyx Business Continuity Policy

**Status:** Approved internal policy, pre-certification evidence  
**Owner:** Corelyx responsible person / founder  
**Approved:** 2026-05-27  
**Review cadence:** Annual and after major incidents

## Purpose

Maintain a practical continuity baseline for the Corelyx SaaS service.

## Critical Services

| Service | Recovery expectation |
|---|---|
| Web app and API routes | Restore or roll back within 4 hours for SEV-1 incidents where provider status allows. |
| Runtime execution | Pause triggers, recover worker service, and resume safe workflows within 4 hours. |
| Database and auth | Restore through managed Supabase backup/recovery processes. |
| Secrets and credentials | Preserve Vault-backed secret references; rotate exposed credentials immediately. |
| Billing and email | Degraded mode acceptable while core workflow safety is restored. |

## Continuity Controls

- Managed cloud backups and deployment rollbacks are the primary recovery mechanism.
- Critical secrets are documented by purpose and storage location, not by value.
- Incident response includes pausing workflows, freezing high-risk writes, and preserving evidence.
- Backup-restore and notification dry-runs are performed at least annually.

## Targets

| Measure | Target |
|---|---|
| RTO for SEV-1 service outage | 4 hours where dependencies are available. |
| RPO for managed database recovery | Provider-managed backup window; document actual recovery point during drills. |
| P1 response | Acknowledge within 30 minutes after detection where practicable. |
