# Manilla Collective — Artist Application Platform

[![Deploy to Cloudflare Pages](https://github.com/Manilla-Network/manilla-artist-contract/actions/workflows/deploy-cloudflare.yml/badge.svg?branch=main)](https://github.com/Manilla-Network/manilla-artist-contract/actions/workflows/deploy-cloudflare.yml)
[![Deploy to Netlify](https://github.com/Manilla-Network/manilla-artist-contract/actions/workflows/deploy-netlify.yml/badge.svg?branch=main)](https://github.com/Manilla-Network/manilla-artist-contract/actions/workflows/deploy-netlify.yml)

Production-ready artist onboarding and 360° contract platform for **Manilla Collective** — part of the [Manilla Network](https://manilla.network) Ecosystem.

---

## Overview

A 5-step artist application wizard that handles:

1. **Identity** — legal name, stage name, contact info, location, DOB
2. **Email Verification** — 6-digit OTP via Supabase Auth
3. **Artist Profile** — genre, bio, 8 social/streaming links, photo + press kit uploads
4. **360° Agreement** — contract review, revenue split table, typed + drawn signature
5. **Review & Submit** — final confirmation → DB insert → branded emails with signed PDF attached

**Admin Dashboard** at `/admin`:
- Applications table with search, status filter, country filter, date range
- Application detail panel with full profile, assets, signature, metadata
- Status management (7 statuses: Submitted → Under Review → Approved/Rejected → Contract Sent → Signed → Active Artist)
- Audit trail for every status change and admin action
- Resend contract PDF to artist

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start (React 19, SSR) |
| Build | Vite 7 + Nitro |
| Runtime | Cloudflare Workers (`nodejs_compat`) |
| Hosting | Cloudflare Pages |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (OTP email) |
| File Storage | Supabase Storage (`artist-assets` bucket) |
| Email | Resend (`exclusive@rald.cloud`) |
| PDF | jsPDF (branded contract generation) |
| UI | shadcn/ui + Tailwind CSS v4 |
| Signatures | signature_pad |
| Runtime secrets | Cloudflare Pages Environment Variables |

---

## CI/CD

**GitHub → Cloudflare Pages** is the single source of truth.

Every push to `main`:
1. Installs deps (Bun)
2. Builds with `vite build` (Nitro cloudflare-pages preset)
3. Deploys to `manilla-contract` Cloudflare Pages project
4. Syncs all runtime secrets to Cloudflare via `wrangler pages secret put`
5. Writes deployment URL to GitHub Step Summary

The Netlify workflow mirrors the same build with the `netlify` Nitro preset.

---

## Setup

### 1. Clone

```bash
git clone https://github.com/Manilla-Network/manilla-artist-contract.git
cd manilla-artist-contract
bun install
```

### 2. Environment variables

Copy and fill in:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `SUPABASE_URL` | Supabase project URL (server) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM` | `Manilla Collective <exclusive@rald.cloud>` |
| `ADMIN_EMAIL` | Admin email(s), comma-separated |
| `PUBLIC_SITE_URL` | Production URL for logo in emails |

### 3. Database migrations

```bash
# Apply all migrations in order
supabase db push
```

Or apply manually in the Supabase SQL editor — see `supabase/migrations/` for files in order.

### 4. Run locally

```bash
bun run dev
```

Open http://localhost:3000 for the artist portal.
Open http://localhost:3000/admin for the admin dashboard (sign in with your ADMIN_EMAIL).

---

## GitHub Secrets (required for CI)

Add these in **Settings → Secrets and variables → Actions**:

```
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
RESEND_FROM
ADMIN_EMAIL
EMAIL_TEST_TOKEN
PUBLIC_SITE_URL
```

Optional (Netlify mirror):
```
NETLIFY_AUTH_TOKEN
NETLIFY_SITE_ID
```

---

## Database Schema

See [DEPLOY.md](./DEPLOY.md) for the complete column reference.

Key tables:
- `public.signed_contracts` — all artist applications (with `status` column)
- `public.application_audit` — immutable event log for every status change and admin action
- `public.email_test_log` — Resend delivery log for testing

---

## Application Status Flow

```
submitted → under_review → approved → contract_sent → signed → active
                         ↘ rejected
```

---

## Security

- OTP: 6-digit, Supabase-managed 10-min expiry, 5-attempt client limit, 60s resend cooldown
- Signature validation: typed name must exactly match legal name (client + server)
- Rate limiting: max 3 submissions per user per hour (server-side)
- IP hashing: SHA-256(ip + salt), only first 16 hex chars stored
- File validation: MIME type + size enforced before upload
- RLS: artists can only access their own rows; admin access via service role
- Admin dashboard: protected by Supabase OTP + server-side email whitelist check

---

## Directory structure

```
src/
├── routes/
│   ├── index.tsx          # 5-step artist wizard
│   ├── admin.tsx          # Admin dashboard
│   └── api/public/
│       └── email-test.ts  # Email delivery test endpoint
├── lib/
│   ├── contract.functions.ts  # Submit server function
│   ├── admin.functions.ts     # Admin server functions
│   ├── contract-pdf.ts        # jsPDF contract builder
│   ├── upload.ts              # Supabase Storage uploads
│   ├── draft.ts               # localStorage autosave
│   └── rate-limiter.ts        # In-memory rate limiting
├── integrations/supabase/
│   ├── client.ts              # Browser Supabase client
│   ├── client.server.ts       # Server Supabase client
│   ├── auth-middleware.ts     # TanStack Start auth middleware
│   └── types.ts               # Generated DB types
└── components/
    ├── ui/                    # shadcn/ui components
    └── SignaturePadCanvas.tsx # Signature pad wrapper
supabase/migrations/           # DB migrations in order
.github/workflows/
├── deploy-cloudflare.yml      # Primary CI/CD → Cloudflare Pages
└── deploy-netlify.yml         # Mirror → Netlify
```

---

## Owned & operated by

**LILCKY STUDIO LIMITED** · Lagos, Nigeria  
Part of the [Manilla Network](https://manilla.network) Ecosystem
