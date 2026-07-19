-- Corelyx Template Gallery v1 (Task #3: Template Gallery, Score 8.4)
-- Schritt 3: Tabelle `templates` (id, name, description, category, genesis_prompt, program_json, thumbnail_url, is_public)
-- Internal Beta Phase. RLS: readable by all authenticated users for internal beta; public flag gated for Phase 2.

create table if not exists public.templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text not null default '',
  category        text not null default 'general',
  genesis_prompt  text not null,
  program_json    jsonb not null,
  thumbnail_url   text,
  is_public       boolean not null default false,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists templates_category_idx on public.templates (category);
create index if not exists templates_is_public_idx on public.templates (is_public);

alter table public.templates enable row level security;

-- Internal beta: any authenticated user can read + manage templates
create policy "templates_read_authenticated"
  on public.templates for select
  to authenticated
  using (true);

create policy "templates_write_authenticated"
  on public.templates for all
  to authenticated
  using (auth.uid () = created_by)
  with check (auth.uid () = created_by);

-- Phase 2 (public light): uncomment to allow anon reads of public templates
-- create policy "templates_read_public"
--   on public.templates for select
--   to anon
--   using (is_public = true);
