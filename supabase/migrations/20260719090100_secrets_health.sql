-- Corelyx Secrets Health Monitor (Task #4: Secrets Health Monitor, Score 8.2)
-- Schritt 1: Tabelle `secrets_health_events` (id, workspace_id, connection_id, event_type, severity, details, created_at)
-- Consumed by hourly Inngest job apps/runtime/jobs/secrets-health.ts

create table if not exists public.secrets_health_events (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid,
  connection_id  uuid,
  event_type     text not null
                  check (event_type in (
                    'token_expiring_7d',
                    'token_expiring_1d',
                    'token_expired',
                    'scope_drift',
                    'connection_revoked'
                  )),
  severity       text not null default 'info'
                  check (severity in ('info', 'warning', 'critical')),
  details        jsonb not null default '{}'::jsonb,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists secrets_health_events_connection_idx
  on public.secrets_health_events (connection_id, created_at desc);
create index if not exists secrets_health_events_workspace_idx
  on public.secrets_health_events (workspace_id, created_at desc);

alter table public.secrets_health_events enable row level security;

-- Workspace members can read their own workspace's health events
create policy "secrets_health_events_read_workspace"
  on public.secrets_health_events for select
  to authenticated
  using (workspace_id is null or workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid ()
  ));

-- Service role / runtime writes events (server-only path)
create policy "secrets_health_events_write_service"
  on public.secrets_health_events for insert
  to service_role
  with check (true);
