# Manilla Network — Cloudflare Auto-Deploy

GitHub is the source of truth. Every push to `main` builds and deploys to
**Cloudflare Pages** (project `manilla-contract`, auto-created on first run)
via `.github/workflows/deploy-cloudflare.yml`.

## Required GitHub Secrets

Add these in **GitHub → Settings → Secrets and variables → Actions**:

### Cloudflare
- `CLOUDFLARE_API_TOKEN` — token with `Pages:Edit` permission
- `CLOUDFLARE_ACCOUNT_ID`

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
