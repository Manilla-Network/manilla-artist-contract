-- ─────────────────────────────────────────────────────────────────────────────
-- MANILLA FEATURE FLAGS
-- Migration: Centralized feature management
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id             uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  key            text         UNIQUE NOT NULL,
  name           text         NOT NULL,
  description    text,
  enabled        boolean      NOT NULL DEFAULT false,
  rollout_pct    integer      NOT NULL DEFAULT 0
    CONSTRAINT rollout_pct_check CHECK (rollout_pct BETWEEN 0 AND 100),
  metadata       jsonb        NOT NULL DEFAULT '{}',
  created_by     text         NOT NULL DEFAULT 'system',
  updated_by     text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_flags_key_idx ON public.feature_flags (key);
CREATE INDEX IF NOT EXISTS feature_flags_enabled_idx ON public.feature_flags (enabled);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on feature_flags"
  ON public.feature_flags AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Read-only access for authenticated clients (to check if feature is enabled)
CREATE POLICY "authenticated read feature flags"
  ON public.feature_flags AS PERMISSIVE FOR SELECT
  TO authenticated USING (true);

-- ─── Seed default feature flags ──────────────────────────────────────────────

INSERT INTO public.feature_flags (key, name, description, enabled, rollout_pct, created_by)
VALUES
  ('publishing',    'Publishing',     'Music publishing administration module',           false, 0,   'system'),
  ('radio',         'Radio',          'Manilla Radio — artist radio stations',            false, 0,   'system'),
  ('loop',          'Loop',           'Loop — short-form audio content platform',         false, 0,   'system'),
  ('voice',         'Voice',          'AI-protected voice licensing and management',      false, 0,   'system'),
  ('ads',           'Ads',            'Manilla Ads — artist ad campaign management',      false, 0,   'system'),
  ('release_queue', 'Release Queue',  'Enable release submission for active artists',     true,  100, 'system'),
  ('label_portal',  'Label Portal',   'Label application and management portal',          false, 0,   'system'),
  ('analytics',     'Analytics',      'Advanced artist analytics dashboard',              false, 0,   'system'),
  ('royalties',     'Royalties',      'Real-time royalty tracking dashboard',             false, 0,   'system'),
  ('fanlinks',      'Fan Links',      'Auto-generated smart links on artist approval',    true,  100, 'system')
ON CONFLICT (key) DO NOTHING;
