-- One-time agents.
--
-- Agents reuse the programs table (unified model) via a program_type
-- discriminator, so they inherit runs, versions, memberships, RLS, and the
-- runtime with no parallel plumbing. They differ in lifecycle: no triggers,
-- run once, and discarded after a successful run unless saved as a template.
--
-- Workspaces also gain controls so an owner can decide whether other members'
-- agents may act on the workspace, and the minimum role required to do so.

-- ── programs: agent discriminator + lifecycle ────────────────────────────────
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS program_type TEXT NOT NULL DEFAULT 'workflow'
    CHECK (program_type IN ('workflow', 'agent')),
  -- Agent lifecycle state. NULL for workflows.
  ADD COLUMN IF NOT EXISTS agent_state TEXT
    CHECK (
      agent_state IS NULL
      OR agent_state IN (
        'draft',              -- generated, not yet approved
        'awaiting_approval',  -- plan presented to the user
        'approved',           -- approved, queued/ready to run
        'running',            -- executing
        'completed',          -- finished successfully
        'failed',             -- finished with an error
        'discarded'           -- one-time agent archived after its run
      )
    ),
  -- One-time agents are archived after a successful run unless the user opts to
  -- keep them as a reusable template.
  ADD COLUMN IF NOT EXISTS agent_discard_after_run BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS agent_saved_template BOOLEAN NOT NULL DEFAULT FALSE;

-- Agents are listed in their own surface; this index keeps that query cheap.
CREATE INDEX IF NOT EXISTS idx_programs_workspace_type
  ON public.programs (workspace_id, program_type);

COMMENT ON COLUMN public.programs.program_type IS
  'workflow = repeating automation; agent = one-time plan-then-run task.';

-- ── workspaces: external-agent controls ──────────────────────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS allow_external_agents BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS agent_min_role TEXT NOT NULL DEFAULT 'admin'
    CHECK (agent_min_role IN ('admin', 'member', 'viewer'));

COMMENT ON COLUMN public.workspaces.allow_external_agents IS
  'When true, members other than the owner may run agents that act on this workspace, subject to agent_min_role. Owner is always allowed.';
COMMENT ON COLUMN public.workspaces.agent_min_role IS
  'Minimum workspace role a member must have for their agents to act on this workspace.';
