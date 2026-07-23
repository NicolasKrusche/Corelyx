-- Multi-Tenant Organization System
-- Adds organizations, org_memberships, and org_invites tables for team collaboration.
-- This builds on the existing workspace infrastructure, adding a token-based invite flow.

-- ── Organizations ─────────────────────────────────────────────────────────────
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 120),
  slug        text not null unique,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_organizations_owner_id
  on organizations (owner_id);

-- ── Org Memberships ───────────────────────────────────────────────────────────
create table if not exists org_memberships (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  invited_by   uuid references auth.users(id) on delete set null,
  invited_at   timestamptz,
  accepted_at  timestamptz default now(),
  created_at   timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists idx_org_memberships_org_id
  on org_memberships (org_id);

create index if not exists idx_org_memberships_user_id
  on org_memberships (user_id, org_id);

-- ── Org Invites (token-based invite flow) ─────────────────────────────────────
create table if not exists org_invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  email        text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role         text not null check (role in ('admin', 'editor', 'viewer')),
  token        text not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);

create index if not exists idx_org_invites_org_id
  on org_invites (org_id);

create index if not exists idx_org_invites_email
  on org_invites (email, created_at desc);

create index if not exists idx_org_invites_token
  on org_invites (token);

-- Prevent duplicate open invites per org+email
create unique index if not exists idx_org_invites_open_unique
  on org_invites (org_id, email)
  where accepted_at is null;

-- ── Helper Functions ──────────────────────────────────────────────────────────

create or replace function public.is_org_member(p_org_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_memberships om
    where om.org_id = p_org_id
      and om.user_id = p_user_id
  );
$$;

create or replace function public.can_manage_org(p_org_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_memberships om
    where om.org_id = p_org_id
      and om.user_id = p_user_id
      and om.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_org_owner(p_org_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_memberships om
    where om.org_id = p_org_id
      and om.user_id = p_user_id
      and om.role = 'owner'
  );
$$;

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table organizations enable row level security;
alter table org_memberships enable row level security;
alter table org_invites enable row level security;

-- Organizations: members can read, owners/admins can update, creator can insert
create policy "org members read organizations"
  on organizations for select
  using (public.is_org_member(id));

create policy "org owners can delete organizations"
  on organizations for delete
  using (public.is_org_owner(id));

create policy "org creators insert organizations"
  on organizations for insert
  with check (auth.uid() = owner_id);

create policy "org managers update organizations"
  on organizations for update
  using (public.can_manage_org(id))
  with check (public.can_manage_org(id));

-- Memberships: members can read, owners/admins can manage
create policy "org members read memberships"
  on org_memberships for select
  using (public.is_org_member(org_id));

create policy "org managers write memberships"
  on org_memberships for all
  using (public.can_manage_org(org_id))
  with check (public.can_manage_org(org_id));

-- Invites: org members can read, managers can write
-- Invite tokens are also readable by the invitee (for accepting)
create policy "org members read invites"
  on org_invites for select
  using (public.is_org_member(org_id));

create policy "org managers write invites"
  on org_invites for all
  using (public.can_manage_org(org_id))
  with check (public.can_manage_org(org_id));

-- Allow anyone to read an invite by token (for the accept flow)
-- This is needed so the invitee can look up their invite before they're a member.
create policy "invite token read for accept"
  on org_invites for select
  using (true);

-- ── Auto-update updated_at trigger ────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_updated_at
  before update on organizations
  for each row execute function public.set_updated_at();
