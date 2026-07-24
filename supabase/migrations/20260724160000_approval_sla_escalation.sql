-- ─── Approval SLA tracking + escalation ────────────────────────────────────────
-- Extends the existing approvals table with SLA tracking and adds an
-- escalation_history table for audit-trail purposes.

-- 1. Add sla_hours column to approvals (default 24h, nullable for backwards compat)
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS sla_hours integer DEFAULT 24;

COMMENT ON COLUMN public.approvals.sla_hours IS 'SLA deadline in hours from created_at. Approvals escalate to workspace admins if not decided within this window.';

-- Index for the SLA checker to find pending approvals efficiently.
CREATE INDEX IF NOT EXISTS idx_approvals_pending_sla
  ON public.approvals (status, created_at)
  WHERE status = 'pending';

-- 2. Approval escalations table — immutable append-only audit log
CREATE TABLE IF NOT EXISTS public.approval_escalations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id   uuid NOT NULL REFERENCES public.approvals(id) ON DELETE CASCADE,
  escalated_to  text NOT NULL,                -- user_id or email of escalation target
  escalation_reason text NOT NULL,            -- e.g. 'sla_breach', 'manual'
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.approval_escalations IS 'Immutable log of every escalation event for an approval. Used for compliance audit trails (AI Act Art. 14).';

CREATE INDEX IF NOT EXISTS idx_escalations_approval
  ON public.approval_escalations (approval_id);

-- 3. RLS — service role bypasses, users see escalations for their own approvals
ALTER TABLE public.approval_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on approval_escalations"
  ON public.approval_escalations FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view escalations for their own approvals"
  ON public.approval_escalations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.approvals a
      WHERE a.id = approval_escalations.approval_id
        AND a.user_id = auth.uid()
    )
  );

-- 4. Add a notification preference key for escalations (via the existing
--    notification_preferences JSON column on profiles).
--    The application code handles defaults, but document it here for clarity.
COMMENT ON COLUMN public.profiles.notification_preferences IS
  'JSON map of notification keys to booleans. Escalation alerts use the "approvals" key. Push variant: "push_approvals".';
