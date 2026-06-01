-- Expand signed_contracts with all required profile, location, social, and audit fields
ALTER TABLE public.signed_contracts
  ADD COLUMN IF NOT EXISTS application_id TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS years_active INTEGER,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS spotify_url TEXT,
  ADD COLUMN IF NOT EXISTS apple_music_url TEXT,
  ADD COLUMN IF NOT EXISTS audiomack_url TEXT,
  ADD COLUMN IF NOT EXISTS boomplay_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS artist_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS press_kit_url TEXT,
  ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_signed_contracts_application_id
  ON public.signed_contracts (application_id)
  WHERE application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signed_contracts_country
  ON public.signed_contracts (country);

-- Storage bucket for artist assets (photo + press kit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'artist-assets',
  'artist-assets',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload into their own UID folder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Artists upload own assets'
  ) THEN
    CREATE POLICY "Artists upload own assets"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'artist-assets'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Artists read own assets'
  ) THEN
    CREATE POLICY "Artists read own assets"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'artist-assets'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Service role reads all assets'
  ) THEN
    CREATE POLICY "Service role reads all assets"
    ON storage.objects FOR SELECT
    TO service_role
    USING (bucket_id = 'artist-assets');
  END IF;
END $$;
