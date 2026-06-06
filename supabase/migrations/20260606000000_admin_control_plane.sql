-- ─────────────────────────────────────────────────────────────────────────────
-- MANILLA ADMIN CONTROL PLANE V1
-- Migration: Core queue tables + audit system + fanlinks
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Universal Queue Audit Table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.queue_audit (
  id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  queue       text         NOT NULL,
  item_id     uuid         NOT NULL,
  event       text         NOT NULL,
  actor       text         NOT NULL DEFAULT 'system',
  old_status  text,
  new_status  text,
  note        text,
  metadata    jsonb        NOT NULL DEFAULT '{}',
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS queue_audit_item_idx
  ON public.queue_audit (queue, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS queue_audit_actor_idx
  ON public.queue_audit (actor, created_at DESC);
CREATE INDEX IF NOT EXISTS queue_audit_event_idx
  ON public.queue_audit (event, created_at DESC);
CREATE INDEX IF NOT EXISTS queue_audit_created_idx
  ON public.queue_audit (created_at DESC);

ALTER TABLE public.queue_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on queue_audit"
  ON public.queue_audit AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ─── Fanlinks Table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fanlinks (
  id             uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  slug           text         UNIQUE NOT NULL,
  target_url     text,
  contract_id    uuid         REFERENCES public.signed_contracts(id) ON DELETE SET NULL,
  application_id text,
  release_id     uuid,
  link_type      text         NOT NULL DEFAULT 'artist',  -- artist | release | label
  click_count    bigint       NOT NULL DEFAULT 0,
  metadata       jsonb        NOT NULL DEFAULT '{}',
  created_by     text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fanlinks_slug_idx ON public.fanlinks (slug);
CREATE INDEX IF NOT EXISTS fanlinks_contract_idx ON public.fanlinks (contract_id);
CREATE INDEX IF NOT EXISTS fanlinks_application_id_idx ON public.fanlinks (application_id);

ALTER TABLE public.fanlinks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on fanlinks"
  ON public.fanlinks AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ─── Extend signed_contracts with fanlink + assignment columns ────────────────

ALTER TABLE public.signed_contracts
  ADD COLUMN IF NOT EXISTS fanlink_url   text,
  ADD COLUMN IF NOT EXISTS assigned_to  text,
  ADD COLUMN IF NOT EXISTS escalated    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_notes jsonb NOT NULL DEFAULT '[]';

-- ─── Release Queue ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.release_queue (
  id                   uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  release_id           text         UNIQUE NOT NULL,   -- REL-YYYY-XXXXXXXX
  artist_id            uuid         REFERENCES public.signed_contracts(id) ON DELETE SET NULL,
  application_id       text,
  release_title        text         NOT NULL,
  release_type         text         NOT NULL DEFAULT 'single',  -- single | ep | album
  genre                text,
  release_date         date,
  audio_url            text,
  artwork_url          text,
  explicit             boolean      NOT NULL DEFAULT false,
  isrc                 text,
  upc                  text,
  distribution_targets jsonb        NOT NULL DEFAULT '[]',
  status               text         NOT NULL DEFAULT 'pending'
    CONSTRAINT release_status_check CHECK (
      status IN ('pending','under_review','approved','rejected','changes_requested','live')
    ),
  assigned_to          text,
  fanlink_url          text,
  internal_notes       jsonb        NOT NULL DEFAULT '[]',
  metadata             jsonb        NOT NULL DEFAULT '{}',
  submitted_at         timestamptz  NOT NULL DEFAULT now(),
  reviewed_at          timestamptz,
  reviewed_by          text
);

CREATE INDEX IF NOT EXISTS release_queue_status_idx  ON public.release_queue (status);
CREATE INDEX IF NOT EXISTS release_queue_artist_idx  ON public.release_queue (artist_id);
CREATE INDEX IF NOT EXISTS release_queue_submitted_idx ON public.release_queue (submitted_at DESC);

ALTER TABLE public.release_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on release_queue"
  ON public.release_queue AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "artists view own releases"
  ON public.release_queue AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (artist_id IN (SELECT id FROM public.signed_contracts WHERE user_id = auth.uid()));

-- ─── Artist Verification Queue ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.artist_verification_queue (
  id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id       uuid         REFERENCES public.signed_contracts(id) ON DELETE CASCADE,
  application_id    text,
  verification_type text         NOT NULL DEFAULT 'full',  -- identity | social | eligibility | full
  checklist         jsonb        NOT NULL DEFAULT '[]',
  id_document_url   text,
  selfie_url        text,
  social_verified   boolean      NOT NULL DEFAULT false,
  status            text         NOT NULL DEFAULT 'pending'
    CONSTRAINT verification_status_check CHECK (
      status IN ('pending','in_progress','verified','failed','manual_review')
    ),
  assigned_to       text,
  notes             text,
  internal_notes    jsonb        NOT NULL DEFAULT '[]',
  metadata          jsonb        NOT NULL DEFAULT '{}',
  verified_at       timestamptz,
  verified_by       text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artist_verification_status_idx
  ON public.artist_verification_queue (status);
CREATE INDEX IF NOT EXISTS artist_verification_contract_idx
  ON public.artist_verification_queue (contract_id);

ALTER TABLE public.artist_verification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on artist_verification_queue"
  ON public.artist_verification_queue AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ─── Label Queue ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.label_queue (
  id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  label_id          text         UNIQUE NOT NULL,   -- LBL-YYYY-XXXXXXXX
  label_name        text         NOT NULL,
  label_email       text         NOT NULL,
  contact_name      text         NOT NULL,
  country           text,
  roster_size       integer      NOT NULL DEFAULT 0,
  genre_focus       text[]       NOT NULL DEFAULT '{}',
  existing_distro   text,
  catalog_size      integer      NOT NULL DEFAULT 0,
  monthly_streams   bigint       NOT NULL DEFAULT 0,
  documents_url     text,
  status            text         NOT NULL DEFAULT 'pending'
    CONSTRAINT label_status_check CHECK (
      status IN ('pending','under_review','due_diligence','approved','rejected')
    ),
  tier              text         NOT NULL DEFAULT 'standard',  -- standard | premium | enterprise
  assigned_to       text,
  deal_terms        jsonb        NOT NULL DEFAULT '{}',
  internal_notes    jsonb        NOT NULL DEFAULT '[]',
  metadata          jsonb        NOT NULL DEFAULT '{}',
  submitted_at      timestamptz  NOT NULL DEFAULT now(),
  reviewed_at       timestamptz,
  reviewed_by       text
);

CREATE INDEX IF NOT EXISTS label_queue_status_idx    ON public.label_queue (status);
CREATE INDEX IF NOT EXISTS label_queue_submitted_idx ON public.label_queue (submitted_at DESC);

ALTER TABLE public.label_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access on label_queue"
  ON public.label_queue AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);
