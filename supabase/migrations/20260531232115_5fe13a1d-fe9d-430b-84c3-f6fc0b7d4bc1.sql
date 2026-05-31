
CREATE TABLE public.email_test_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL,
  recipient text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL,
  provider_message_id text,
  error_message text,
  from_address text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_test_log TO authenticated;
GRANT ALL ON public.email_test_log TO service_role;

ALTER TABLE public.email_test_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view test log"
ON public.email_test_log
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_email_test_log_run_id ON public.email_test_log(run_id);
CREATE INDEX idx_email_test_log_created_at ON public.email_test_log(created_at DESC);
