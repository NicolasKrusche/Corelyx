-- Connector Health Events — periodic health checks + auto-retry/backoff tracking
-- Tracks connection_test, auth_validity, and rate_limit_status events
-- for every connector in a workspace.

create table if not exists public.connector_health_events (
  id                uuid primary key default gen_random_uuid(),
  connector_name    text not null,
  workspace_id      uuid,
  check_type        text not null
                      check (check_type in (
                        'connection_test',
                        'auth_validity',
                        'rate_limit_status'
                      )),
  status            text not null
                      check (status in ('healthy', 'warning', 'critical')),
  error_message     text,
  latency_ms        double precision,
  retry_count       integer not null default 0,
  next_retry_at     timestamptz,
  checked_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- Indexes for fast dashboard queries
create index if not exists connector_health_events_workspace_idx
  on public.connector_health_events (workspace_id, created_at desc);

create index if not exists connector_health_events_connector_idx
  on public.connector_health_events (connector_name, created_at desc);

-- Most-recent-event-per-connector lookup (used by the dashboard)
create index if not exists connector_health_events_latest_idx
  on public.connector_health_events (connector_name, workspace_id, created_at desc);

-- Enable RLS
alter table public.connector_health_events enable row level security;

-- Workspace members can read their own workspace's health events
create policy "connector_health_events_read_workspace"
  on public.connector_health_events for select
  to authenticated
  using (
    workspace_id is null
    or workspace_id in (
      select workspace_id from public.workspace_memberships
      where user_id = auth.uid()
    )
  );

-- Service role / runtime writes events (server-only path)
create policy "connector_health_events_write_service"
  on public.connector_health_events for insert
  to service_role
  with check (true);

-- Service role can also update retry tracking fields
create policy "connector_health_events_update_service"
  on public.connector_health_events for update
  to service_role
  using (true)
  with check (true);
