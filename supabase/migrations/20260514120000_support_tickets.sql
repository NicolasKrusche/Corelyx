-- Support ticketing system
-- Users open tickets; admins reply. All communication is in-app.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email  TEXT        NOT NULL,
  user_tier   TEXT        NOT NULL DEFAULT 'free',
  type        TEXT        NOT NULL DEFAULT 'support'
              CHECK (type IN ('support', 'sales', 'priority')),
  subject     TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID        NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT        NOT NULL CHECK (sender_type IN ('user', 'admin')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id    ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status     ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_updated_at ON public.support_tickets(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON public.support_messages(ticket_id);

-- RLS
ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Tickets: users manage their own
CREATE POLICY "users_select_own_tickets"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Messages: users can read messages in their tickets and add 'user' messages
CREATE POLICY "users_select_ticket_messages"
  ON public.support_messages FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM public.support_tickets WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "users_insert_user_messages"
  ON public.support_messages FOR INSERT
  WITH CHECK (
    sender_type = 'user'
    AND ticket_id IN (
      SELECT id FROM public.support_tickets WHERE user_id = auth.uid()
    )
  );
-- Service role (used by API routes) bypasses RLS for admin operations.
