-- Secrets Health Events — enhancement migration
-- Fixes RLS policy (workspace_members → workspace_memberships) and adds
-- columns to connections for rotation tracking and health check state.

-- 1. Fix the read policy on secrets_health_events (the base migration
--    referenced workspace_members which doesn't exist — should be workspace_memberships).
--    Drop the broken policy first, then recreate with the correct table name.

drop policy if exists "secrets_health_events_read_workspace"
  on public.secrets_health_events;

create policy "secrets_health_events_read_workspace"
  on public.secrets_health_events for select
  to authenticated
  using (
    workspace_id is null
    or workspace_id in (
      select workspace_id from public.workspace_memberships
      where user_id = auth.uid()
    )
  );

-- 2. Add rotation-tracking columns to connections.
--    rotation_due_at:       when the secret should next be rotated
--    last_health_check_at:  when secrets health was last evaluated for this connection

alter table public.connections
  add column if not exists rotation_due_at       timestamptz,
  add column if not exists last_health_check_at  timestamptz;

-- 3. Add a connection_provider column to secrets_health_events for easier
--    querying (avoids a JOIN to connections on every dashboard query).

alter table public.secrets_health_events
  add column if not exists connection_provider text;

-- 4. Index for fast "events by provider" queries on the dashboard.

create index if not exists secrets_health_events_provider_idx
  on public.secrets_health_events (connection_provider, created_at desc)
  where connection_provider is not null;

-- 5. Auto-update rotation_due_at when a connection is inserted or updated.
--    This trigger keeps rotation dates in sync with the connection lifecycle.

create or replace function public.set_connection_rotation_due()
returns trigger as $$
declare
  interval_days int;
begin
  -- Provider-specific rotation intervals (days)
  case NEW.provider
    when 'slack', 'notion', 'github', 'thunderbird' then interval_days := 180;
    else interval_days := 90;
  end case;

  -- Allow workspace-level override via secret_rotation_reminder_days
  if NEW.workspace_id is not null then
    declare
      ws_reminder int;
    begin
      select secret_rotation_reminder_days into ws_reminder
        from public.workspaces where id = NEW.workspace_id;
      if ws_reminder is not null and ws_reminder > 0 then
        interval_days := ws_reminder;
      end if;
    end;
  end if;

  NEW.rotation_due_at := NEW.created_at + (interval_days || ' days')::interval;
  return NEW;
end;
$$ language plpgsql;

-- Only fire on INSERT (created_at is set once; rotation_due_at is computed from it)
drop trigger if exists trg_set_rotation_due on public.connections;
create trigger trg_set_rotation_due
  before insert on public.connections
  for each row
  execute function public.set_connection_rotation_due();
