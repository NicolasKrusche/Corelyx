-- Compliance Dashboard: AI Act Readiness Score
-- Stores risk assessments for programs, enabling the compliance dashboard
-- to show historical and current risk classifications.

create table if not exists compliance_assessments (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references programs(id) on delete cascade,
  risk_level   text not null check (risk_level in ('minimal', 'limited', 'high', 'unacceptable')),
  risk_score   integer not null check (risk_score >= 0 and risk_score <= 100),
  factors      jsonb not null default '[]'::jsonb,
  assessed_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

comment on table compliance_assessments is 'Stores AI Act risk assessment results for workspace programs.';
comment on column compliance_assessments.risk_level is 'EU AI Act risk classification: minimal, limited, high, unacceptable.';
comment on column compliance_assessments.risk_score is 'Numeric risk score 0-100 where higher indicates greater risk.';
comment on column compliance_assessments.factors is 'Array of risk factors that contributed to the assessment.';

-- Index for fast lookups by program
create index if not exists idx_compliance_assessments_program_id
  on compliance_assessments(program_id);

-- Index for querying latest assessment per program
create index if not exists idx_compliance_assessments_program_assessed
  on compliance_assessments(program_id, assessed_at desc);

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table compliance_assessments enable row level security;

-- Users can only see assessments for programs in their workspace
create policy "compliance_assessments_select_workspace"
  on compliance_assessments
  for select
  using (
    program_id in (
      select p.id
      from programs p
      where p.workspace_id = (
        select org_id from profiles where id = auth.uid()
      )
    )
  );

-- Users can insert assessments for programs in their workspace
create policy "compliance_assessments_insert_workspace"
  on compliance_assessments
  for insert
  with check (
    program_id in (
      select p.id
      from programs p
      where p.workspace_id = (
        select org_id from profiles where id = auth.uid()
      )
    )
  );

-- Only the program owner or workspace admin can update assessments
create policy "compliance_assessments_update_workspace"
  on compliance_assessments
  for update
  using (
    program_id in (
      select p.id
      from programs p
      where p.workspace_id = (
        select org_id from profiles where id = auth.uid()
      )
    )
  );

-- Only workspace admins can delete assessments
create policy "compliance_assessments_delete_workspace"
  on compliance_assessments
  for delete
  using (
    program_id in (
      select p.id
      from programs p
      where p.workspace_id = (
        select org_id from profiles where id = auth.uid()
      )
    )
  );
