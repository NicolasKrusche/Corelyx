-- Collaborative Workflow Review: Inline Comments + Approval Flow
-- Adds per-node commenting and a program-level review/approval workflow.
--
-- Design notes:
--  * program_comments stores inline review comments anchored to specific nodes.
--  * program_approvals tracks the approval lifecycle: pending → approved / changes_requested.
--  * RLS policies mirror the RBAC helpers from 20260724_rbac_teams.sql.
--  * SECURITY DEFINER helper avoids RLS recursion for cross-table checks.

-- ── Program Comments ────────────────────────────────────────────────────────
create table if not exists program_comments (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs(id) on delete cascade,
  node_id     text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 4000),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_program_comments_program_id
  on program_comments (program_id);

create index if not exists idx_program_comments_node_id
  on program_comments (node_id);

create index if not exists idx_program_comments_user_id
  on program_comments (user_id);

-- ── Program Approvals ───────────────────────────────────────────────────────
create table if not exists program_approvals (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  note        text check (length(note) <= 4000),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

create index if not exists idx_program_approvals_program_id
  on program_approvals (program_id);

create index if not exists idx_program_approvals_reviewer_id
  on program_approvals (reviewer_id);

-- ── Helper: can the user access this program for review? ────────────────────
-- Mirrors the workspace + program membership logic from workspaces.ts so RLS
-- policies never recurse into the tables they protect.
create or replace function public.user_can_review_program(p_program_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    -- program owner
    select 1
    from public.programs p
    join public.workspaces w on w.id = p.workspace_id
    where p.id = p_program_id
      and w.user_id = p_user_id
  ) or exists (
    -- workspace admin/owner
    select 1
    from public.programs p
    join public.workspace_memberships wm on wm.workspace_id = p.workspace_id
    where p.id = p_program_id
      and wm.user_id = p_user_id
      and wm.role in ('owner', 'admin')
  ) or exists (
    -- explicit program editor/member
    select 1
    from public.program_memberships pm
    where pm.program_id = p_program_id
      and pm.user_id = p_user_id
      and pm.role in ('editor', 'admin')
  ) or exists (
    -- shared via team
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

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table program_comments enable row level security;
alter table program_approvals enable row level security;

-- Comments: any user who can review the program may read/write/delete their
-- own comments; the program owner/admins can manage all comments.
create policy "reviewers read comments"
  on program_comments for select
  using (public.user_can_review_program(program_id));

create policy "reviewers insert comments"
  on program_comments for insert
  with check (
    auth.uid() = user_id
    and public.user_can_review_program(program_id)
  );

create policy "authors update own comments"
  on program_comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "authors delete own comments"
  on program_comments for delete
  using (auth.uid() = user_id);

-- Program owner/admins can also manage (resolve) comments on their programs.
create policy "admins manage comments"
  on program_comments for all
  using (
    exists (
      select 1
      from public.programs p
      join public.workspace_memberships wm on wm.workspace_id = p.workspace_id
      where p.id = program_comments.program_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.programs p
      join public.workspace_memberships wm on wm.workspace_id = p.workspace_id
      where p.id = program_comments.program_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- Approvals: reviewers who can access the program may read; any reviewer may
-- create; only the assigned reviewer may update their own decision.
create policy "reviewers read approvals"
  on program_approvals for select
  using (public.user_can_review_program(program_id));

create policy "reviewers insert approvals"
  on program_approvals for insert
  with check (
    auth.uid() = reviewer_id
    and public.user_can_review_program(program_id)
  );

create policy "reviewers update own decision"
  on program_approvals for update
  using (auth.uid() = reviewer_id)
  with check (auth.uid() = reviewer_id);

-- Program owner/admins can also manage approvals.
create policy "admins manage approvals"
  on program_approvals for all
  using (
    exists (
      select 1
      from public.programs p
      join public.workspace_memberships wm on wm.workspace_id = p.workspace_id
      where p.id = program_approvals.program_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.programs p
      join public.workspace_memberships wm on wm.workspace_id = p.workspace_id
      where p.id = program_approvals.program_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );
