-- Multi-User RBAC + Team Workspaces
-- Adds lightweight teams that sit alongside the existing multi-tenant orgs and
-- workspaces. A team groups users under a role (admin/member/viewer) and can be
-- granted access to individual programs via program_shares.
--
-- Design notes:
--  * Membership/permission checks live in SECURITY DEFINER helper functions so
--    RLS policies never recurse into the tables they protect.
--  * The program_shares SELECT policy on `programs` is ADDITIVE — Postgres OR's
--    policies together, so it only ever grants more read access and cannot
--    revoke access the existing workspace/owner policies already allow.

-- ── Teams ─────────────────────────────────────────────────────────────────────
create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 120),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists idx_teams_owner_id
  on teams (owner_id);

-- ── Team Members ──────────────────────────────────────────────────────────────
create table if not exists team_members (
  team_id     uuid not null references teams(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'member', 'viewer')),
  invited_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists idx_team_members_user_id
  on team_members (user_id, team_id);

-- ── Program Shares ────────────────────────────────────────────────────────────
create table if not exists program_shares (
  program_id  uuid not null references programs(id) on delete cascade,
  team_id     uuid not null references teams(id) on delete cascade,
  permission  text not null check (permission in ('view', 'edit', 'admin')),
  shared_at   timestamptz not null default now(),
  primary key (program_id, team_id)
);

create index if not exists idx_program_shares_team_id
  on program_shares (team_id, program_id);

-- ── Helper Functions (SECURITY DEFINER to avoid RLS recursion) ─────────────────

create or replace function public.is_team_member(p_team_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = p_user_id
  ) or exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and t.owner_id = p_user_id
  );
$$;

create or replace function public.is_team_admin(p_team_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = p_user_id
      and tm.role = 'admin'
  ) or exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and t.owner_id = p_user_id
  );
$$;

-- True when the user can read a program because it is shared with any team they
-- belong to. Used by the additive SELECT policy on `programs`.
create or replace function public.user_can_access_shared_program(p_program_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.program_shares ps
    join public.team_members tm on tm.team_id = ps.team_id
    where ps.program_id = p_program_id
      and tm.user_id = p_user_id
  ) or exists (
    select 1
    from public.program_shares ps
    join public.teams t on t.id = ps.team_id
    where ps.program_id = p_program_id
      and t.owner_id = p_user_id
  );
$$;

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table teams enable row level security;
alter table team_members enable row level security;
alter table program_shares enable row level security;

-- Teams: members can read; the creator inserts as owner; admins update;
-- only the owner can delete.
create policy "team members read teams"
  on teams for select
  using (public.is_team_member(id));

create policy "team creators insert teams"
  on teams for insert
  with check (auth.uid() = owner_id);

create policy "team admins update teams"
  on teams for update
  using (public.is_team_admin(id))
  with check (public.is_team_admin(id));

create policy "team owners delete teams"
  on teams for delete
  using (auth.uid() = owner_id);

-- Team members: members can read the roster; admins can manage it.
create policy "team members read members"
  on team_members for select
  using (public.is_team_member(team_id));

create policy "team admins manage members"
  on team_members for all
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

-- Program shares: any team member can see what's shared with their team;
-- team admins can create/remove shares.
create policy "team members read program shares"
  on program_shares for select
  using (public.is_team_member(team_id));

create policy "team admins manage program shares"
  on program_shares for all
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

-- Additive: let team members read programs shared with their team. Policies are
-- OR'd, so this only widens read access — existing owner/workspace policies are
-- untouched.
create policy "team shared programs readable"
  on programs for select
  using (public.user_can_access_shared_program(id));
