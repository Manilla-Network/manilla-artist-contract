-- ─────────────────────────────────────────────────────────────────────────────
-- MANILLA SUPPORT QUEUE
-- Migration: Support ticket system
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_number   text         UNIQUE NOT NULL,   -- SUPP-YYYY-XXXXXX
  type            text         NOT NULL DEFAULT 'other'
    CONSTRAINT ticket_type_check CHECK (
      type IN ('artist','label','technical','billing','other')
    ),
  priority        text         NOT NULL DEFAULT 'medium'
    CONSTRAINT ticket_priority_check CHECK (
      priority IN ('low','medium','high','critical')
    ),
  subject         text         NOT NULL,
  description     text         NOT NULL,
  reporter_email  text         NOT NULL,
  reporter_name   text,
  contract_id     uuid         REFERENCES public.signed_contracts(id) ON DELETE SET NULL,
  status          text         NOT NULL DEFAULT 'open'
    CONSTRAINT ticket_status_check CHECK (
      status IN ('open','in_progress','waiting','resolved','closed')
    ),
  assigned_to     text,
  resolution      text,
  internal_notes  jsonb        NOT NULL DEFAULT '[]',
  metadata        jsonb        NOT NULL DEFAULT '{}',
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS support_tickets_status_idx    ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_priority_idx  ON public.support_tickets (priority);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx  ON public.support_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS support_tickets_created_idx   ON public.support_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_contract_idx  ON public.support_tickets (contract_id);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on support_tickets"
  ON public.support_tickets AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Artists can submit and view their own tickets
CREATE POLICY "artists insert support tickets"
  ON public.support_tickets AS PERMISSIVE FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "artists view own support tickets"
  ON public.support_tickets AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (reporter_email = (
    SELECT email FROM public.signed_contracts WHERE user_id = auth.uid() LIMIT 1
  ));

-- ─── Ticket number generator function ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  year_str text := to_char(now(), 'YYYY');
  rand_str text := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
BEGIN
  RETURN 'SUPP-' || year_str || '-' || rand_str;
END;
$$;

-- ─── Auto-set ticket_number and updated_at ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_ticket_defaults()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := public.generate_ticket_number();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_tickets_defaults
  BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_defaults();
