-- ──────────────────────────────────────────────────────────────────────────────
-- Phase 1: Status system + audit trail
-- ──────────────────────────────────────────────────────────────────────────────

-- Add status column to signed_contracts
ALTER TABLE public.signed_contracts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'submitted'
  CONSTRAINT status_values CHECK (
    status IN (
      'draft','submitted','under_review','approved','rejected',
      'contract_sent','signed','active'
    )
  );

-- Index for fast status filtering
CREATE INDEX IF NOT EXISTS signed_contracts_status_idx
  ON public.signed_contracts (status);

CREATE INDEX IF NOT EXISTS signed_contracts_signed_at_idx
  ON public.signed_contracts (signed_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- Audit trail table
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.application_audit (
  id            uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id   uuid         REFERENCES public.signed_contracts(id) ON DELETE SET NULL,
  application_id text,
  event         text         NOT NULL,
  actor         text,
  old_value     text,
  new_value     text,
  metadata      jsonb        NOT NULL DEFAULT '{}'::jsonb,
  ip_hash       text,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_audit_contract_id_idx
  ON public.application_audit (contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS application_audit_application_id_idx
  ON public.application_audit (application_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- RLS: audit trail
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.application_audit ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by admin server functions)
CREATE POLICY "service role full access on audit"
  ON public.application_audit
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Artists can view their own audit events
CREATE POLICY "artists view own audit events"
  ON public.application_audit
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (
    contract_id IN (
      SELECT id FROM public.signed_contracts
      WHERE user_id = auth.uid()
    )
  );
