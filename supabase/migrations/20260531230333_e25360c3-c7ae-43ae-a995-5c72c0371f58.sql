
CREATE TABLE public.signed_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  address TEXT NOT NULL,
  nationality TEXT NOT NULL,
  phone TEXT,
  signature_name TEXT NOT NULL,
  agreement_version TEXT NOT NULL DEFAULT '360-v1',
  accepted_terms BOOLEAN NOT NULL DEFAULT false,
  accepted_revenue_split BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  ip_address TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.signed_contracts TO authenticated;
GRANT ALL ON public.signed_contracts TO service_role;

ALTER TABLE public.signed_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own signed contract"
ON public.signed_contracts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own signed contracts"
ON public.signed_contracts FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_signed_contracts_user_id ON public.signed_contracts(user_id);
CREATE INDEX idx_signed_contracts_email ON public.signed_contracts(email);
