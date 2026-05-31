
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_test_log_sent_per_run_recipient
ON public.email_test_log (run_id, recipient)
WHERE status = 'sent';
