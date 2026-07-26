-- Playground Test Cases
-- Stores saved prompt→schema test cases for the Genesis Playground.

create table if not exists playground_test_cases (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  prompt       text not null,
  expected_schema jsonb,
  tags         text[] default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Index for listing a user's test cases quickly.
create index if not exists idx_playground_test_cases_user_id
  on playground_test_cases (user_id, created_at desc);

-- Row-Level Security
alter table playground_test_cases enable row level security;

-- Users can read their own test cases.
create policy "playground_test_cases_select_own"
  on playground_test_cases for select
  using (auth.uid() = user_id);

-- Users can insert their own test cases.
create policy "playground_test_cases_insert_own"
  on playground_test_cases for insert
  with check (auth.uid() = user_id);

-- Users can update their own test cases.
create policy "playground_test_cases_update_own"
  on playground_test_cases for update
  using (auth.uid() = user_id);

-- Users can delete their own test cases.
create policy "playground_test_cases_delete_own"
  on playground_test_cases for delete
  using (auth.uid() = user_id);

-- Auto-update the updated_at column on modification.
create or replace function update_playground_test_case_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger playground_test_cases_updated_at
  before update on playground_test_cases
  for each row
  execute function update_playground_test_case_updated_at();
