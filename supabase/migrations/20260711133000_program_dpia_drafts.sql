-- Durable, workflow-scoped DPIA drafts.
--
-- Each generation or manual save is an immutable revision. This keeps a DPIA
-- attached to the workflow it assesses and preserves the evidence that was
-- available when the revision was created.

CREATE TABLE IF NOT EXISTS public.program_dpia_drafts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id                UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_kind               TEXT NOT NULL CHECK (source_kind IN ('generated', 'edited', 'status_change')),
  review_status             TEXT NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'completed')),
  reviewed_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at               TIMESTAMPTZ,
  content                   TEXT NOT NULL CHECK (
    char_length(content) > 0 AND octet_length(content) <= 500000
  ),
  source_schema_version     INTEGER,
  source_program_updated_at TIMESTAMPTZ,
  source_snapshot           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (review_status = 'draft' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status = 'completed' AND reviewed_at IS NOT NULL)
  ),
  CHECK (source_kind = 'status_change' OR review_status = 'draft')
);

CREATE INDEX IF NOT EXISTS idx_program_dpia_drafts_program_created
  ON public.program_dpia_drafts (program_id, created_at DESC);

ALTER TABLE public.program_dpia_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read program_dpia_drafts"
  ON public.program_dpia_drafts
  FOR SELECT USING (public.can_view_program(program_id));

-- Writes go through the authenticated Next.js route with the service role.
-- Do not expose direct INSERT/UPDATE/DELETE privileges: doing so would let an
-- editor bypass the route's revision-parent, staleness, and review-transition
-- checks and forge compliance evidence through PostgREST.
REVOKE INSERT, UPDATE, DELETE ON public.program_dpia_drafts FROM authenticated, anon;

COMMENT ON TABLE public.program_dpia_drafts IS
  'Immutable DPIA content and review-status revisions, scoped to one workflow.';

COMMENT ON COLUMN public.program_dpia_drafts.source_snapshot IS
  'Non-secret workflow compliance inputs used to generate this revision.';
