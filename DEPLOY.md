# Manilla Network — Artist Contract Application

Deployed via Cloudflare Pages + Workers (primary) and Netlify (mirror).
Every push to `main` triggers both deployments automatically.

## Required Environment Variables

Set all of these as **GitHub Actions Secrets** (Settings → Secrets → Actions).
The CI pipeline pushes runtime secrets to Cloudflare Pages automatically.

### Cloudflare
| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Token with `Pages:Edit` permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

### Netlify (mirror deploy)
| Secret | Description |
|--------|-------------|
| `NETLIFY_AUTH_TOKEN` | Personal access token (User Settings → Applications) |
| `NETLIFY_SITE_ID` | Site ID from Site Settings → General |

### Supabase
| Secret | Description |
|--------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL (build-time, client) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (build-time, client) |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ID (build-time) |
| `SUPABASE_URL` | Supabase project URL (runtime, server) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (runtime, server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (runtime, admin) |

### Email (Resend)
| Secret | Value |
|--------|-------|
| `RESEND_API_KEY` | Your Resend API key |
| `RESEND_FROM` | `Manilla Collective <exclusive@rald.cloud>` |
| `ADMIN_EMAIL` | `ideamack@gmail.com` |
| `EMAIL_TEST_TOKEN` | Random token for `/api/public/email-test` |

### Optional
| Secret | Description |
|--------|-------------|
| `PUBLIC_SITE_URL` | Production URL (e.g. `https://manilla-contract.pages.dev`) used for logo in emails |

---

## Database Setup

Run Supabase migrations in order:

```bash
supabase db push
```

Or apply manually in the Supabase SQL editor in this order:
1. `20260531230333_*.sql` — base signed_contracts table
2. `20260531231152_*.sql` — audit columns
3. `20260531232115_*.sql` — email test log
4. `20260531232430_*.sql` — additional columns
5. `20260601000000_artist_profile.sql` — artist profile, social links, uploads, MC application ID

---

## Database Schema (`public.signed_contracts`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `application_id` | TEXT | MC-YYYY-XXXXXXXX format (unique) |
| `user_id` | UUID | Supabase auth user ID |
| `email` | TEXT | Verified email address |
| `legal_name` | TEXT | Artist legal name |
| `stage_name` | TEXT | Artist stage name |
| `phone` | TEXT | Optional phone number |
| `city` | TEXT | City of residence |
| `state` | TEXT | State / Province |
| `country` | TEXT | Country of residence |
| `date_of_birth` | DATE | Date of birth |
| `address` | TEXT | Computed: `city, state, country` |
| `nationality` | TEXT | Maps to country |
| `genre` | TEXT | Primary music genre |
| `years_active` | INT | Years active as an artist |
| `bio` | TEXT | Artist biography |
| `spotify_url` | TEXT | Spotify profile URL |
| `apple_music_url` | TEXT | Apple Music URL |
| `audiomack_url` | TEXT | Audiomack profile URL |
| `boomplay_url` | TEXT | Boomplay profile URL |
| `youtube_url` | TEXT | YouTube channel URL |
| `tiktok_url` | TEXT | TikTok profile URL |
| `instagram_url` | TEXT | Instagram profile URL |
| `website_url` | TEXT | Artist website URL |
| `artist_photo_url` | TEXT | Supabase Storage public URL |
| `press_kit_url` | TEXT | Supabase Storage public URL |
| `signature_name` | TEXT | Typed legal name signature |
| `signature_data_url` | TEXT | Base64 drawn signature PNG |
| `accepted_terms` | BOOL | Terms consent |
| `accepted_revenue_split` | BOOL | Revenue split consent |
| `agreement_version` | TEXT | `360-v1` |
| `ip_address` | TEXT | Raw client IP |
| `ip_hash` | TEXT | SHA-256(ip + salt), first 16 hex chars |
| `user_agent` | TEXT | Browser user agent string |
| `timezone` | TEXT | Client IANA timezone |
| `locale` | TEXT | Browser locale |
| `signed_at` | TIMESTAMPTZ | UTC submission timestamp |
| `email_sent_at` | TIMESTAMPTZ | When artist email was delivered |
| `admin_email_sent_at` | TIMESTAMPTZ | When admin email was delivered |

---

## User Flow

| Step | Name | Key Fields |
|------|------|------------|
| 1 | Artist Identity | Legal name, stage name, email, phone, country, state, city, DOB |
| 2 | Email Verification | 6-digit OTP (Supabase Auth), 10-min expiry, 5-attempt limit, 60s resend cooldown |
| 3 | Artist Profile | Genre, years active, bio, 8 social/streaming links, artist photo (JPG/PNG ≤5MB), press kit PDF (≤10MB) |
| 4 | Agreement | Contract summary, revenue table, consent checkboxes, typed + optional drawn signature |
| 5 | Review & Submit | Full summary, final submit → signed_contracts insert + emails |

---

## Post-Submission Emails

**To Artist** (`exclusive@rald.cloud` → artist's email):
- Welcome message with stage name
- Application ID (MC-YYYY-XXXXXXXX)
- Full identity + profile summary table
- Signed contract PDF attached
- Next steps copy (A&R contact within 48 hours)

**To Admin** (`exclusive@rald.cloud` → `ideamack@gmail.com`):
- Application ID
- Full identity, profile, bio, social links
- Signature metadata: IP, IP hash, user agent, timezone, locale
- Clickable links to uploaded artist photo + press kit
- Signed contract PDF attached

---

## Supabase Storage

Bucket: `artist-assets` (private, created via migration)

Upload paths:
- Artist photo: `{userId}/photo_{timestamp}.{ext}`
- Press kit:    `{userId}/presskit_{timestamp}.pdf`

RLS: Users read/write only their own UID folder. Service role has full access.

---

## Security Checklist

- [x] OTP: 6 digits, Supabase-managed 10-min expiry, 5-attempt client guard, 60s resend cooldown
- [x] Signature: must match legal name exactly — validated both client and server
- [x] Rate limiting: max 3 submissions per user per hour (in-memory, server-side)
- [x] File validation: MIME type + size enforced before upload
- [x] IP hashing: SHA-256(ip + salt), first 16 hex chars stored; raw IP also stored
- [x] No secrets exposed to browser — all `process.env` reads are server-only
- [x] Supabase RLS: each user can only insert/read their own signed_contracts rows
- [x] Input sanitisation: all fields validated via Zod on the server function
- [x] CSRF: TanStack Start server functions require authenticated session header
