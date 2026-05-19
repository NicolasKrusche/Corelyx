-- Ticket assignment: support staff can be assigned to specific tickets.
-- Non-support team members (dev/marketing) only see tickets assigned to them.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to
  ON public.support_tickets (assigned_to)
  WHERE assigned_to IS NOT NULL;
