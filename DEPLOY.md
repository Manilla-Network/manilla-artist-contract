# Manilla Network — Auto-Deploy (Cloudflare + Netlify)

GitHub is the source of truth. Every push to `main` builds and deploys to
**both** hosts in parallel:

- **Cloudflare Pages/Workers** — `.github/workflows/deploy-cloudflare.yml`
  (project `manilla-contract`, auto-created on first run)
- **Netlify** — `.github/workflows/deploy-netlify.yml` (uses Nitro's
  `netlify` preset; see `netlify.toml`)

Both targets build from the same `vite build` output — Nitro switches
runtime via the `NITRO_PRESET` env var (`cloudflare-pages` by default,
`netlify` in the Netlify workflow). No code changes between targets.

## Required GitHub Secrets

Add these in **GitHub → Settings → Secrets and variables → Actions**:

### Cloudflare
- `CLOUDFLARE_API_TOKEN` — token with `Pages:Edit` permission
- `CLOUDFLARE_ACCOUNT_ID`

### Netlify
- `NETLIFY_AUTH_TOKEN` — personal access token (User Settings → Applications)
- `NETLIFY_SITE_ID` — from Site Settings → General → Site information
  (create an empty site once; the workflow handles every deploy after)

### Supabase (build + runtime)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Email (Resend fallback — manilla@rald.cloud)
- `RESEND_API_KEY`
- `RESEND_FROM` → e.g. `Manilla Collective <manilla@rald.cloud>`
  (defaults to `manilla@rald.cloud` if unset)
- `ADMIN_EMAIL` → defaults to `ideamack@gmail.com`

The workflow pushes runtime secrets into the Cloudflare Pages project
automatically via `wrangler pages secret put`, so server functions
(`createServerFn`) running on Cloudflare Workers can read them through
`process.env`. Resend is the fallback delivery channel — sending uses
`manilla@rald.cloud` unless `RESEND_FROM` overrides it.

---

## Email delivery test (no admin portal needed)

Endpoint: `GET /api/public/email-test?token=$EMAIL_TEST_TOKEN`

- Sends a Resend test email to **manilla@rald.cloud** (ops inbox) and
  **ideamack@gmail.com** (admin notifications) in parallel.
- Writes one row per recipient into `public.email_test_log` with
  `status` (`sent` / `failed` / `error`), `provider_message_id`, and any
  error text. Group by `run_id` to inspect a single test run.
- Response JSON includes the `run_id` and per-recipient results.
- Fetch a past run: `GET /api/public/email-test?token=...&runId=<uuid>`.

Required GitHub secret (also synced to Cloudflare by the workflow):
- `EMAIL_TEST_TOKEN` — long random string; the endpoint refuses to run
  without it, so it's safe to leave public.

Add it to the Cloudflare-sync step in `.github/workflows/deploy-cloudflare.yml`
if you want it pushed automatically.
