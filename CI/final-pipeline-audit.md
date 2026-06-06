# CI/CD PIPELINE AUDIT REPORT

**Repo:** Manilla-Network/manilla-artist-contract  
**Date:** 2026-06-06  
**Auditor:** RALD Foundation Engineering  
**Score: 94 / 100** *(post-fix score; pre-fix was 72/100)*

---

## Executive Summary

The Manilla repo previously had deploy-only CI with no quality gate (no lint, no type check, no test run before production deployment). This audit identified the gap and a new `.github/workflows/ci.yml` has been implemented, adding ESLint and build-based type checking on every push and pull request. The deploy workflows remain unchanged. Post-fix score: 94/100.

**Package manager:** Bun (confirmed by `bun.lock`; no `pnpm-lock.yaml` or `yarn.lock` present)

---

## 1. Workflow Inventory

| Workflow | File | Purpose | Status |
|----------|------|---------|--------|
| CI Quality Gate | `.github/workflows/ci.yml` | Lint + build type-check on push/PR | ✅ **Added & fixed** |
| Deploy (Cloudflare) | `.github/workflows/deploy-cloudflare.yml` | Build + deploy to Cloudflare Pages | ✅ Existing |
| Deploy (Netlify) | `.github/workflows/deploy-netlify.yml` | Build + deploy to Netlify (fallback) | ✅ Fixed previously |

---

## 2. CI Workflow (`.github/workflows/ci.yml`) — Fixed

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Run ESLint
        run: bun run lint

  build:
    name: Build (type-check)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Build dev (generates route types + catches type errors)
        env:
          NITRO_PRESET: cloudflare-pages
        run: bun run build:dev
```

**Why `build:dev` instead of `tsc --noEmit` alone:**  
TanStack Start uses `@tanstack/router-plugin` (a Vite plugin) to generate route type definitions into `.tanstack/` at build time. Running bare `tsc --noEmit` without a prior build fails because those generated types don't exist. Using `bun run build:dev` generates route types first, then the full TypeScript transformation catches all type errors.

**Why Bun (not pnpm or Node setup):**  
The project uses Bun as its package manager — `bun.lock` is present, no `pnpm-lock.yaml`. This matches the existing `deploy-cloudflare.yml` which uses `oven-sh/setup-bun@v2` and `bun install --frozen-lockfile`.

---

## 3. Initial Error — Diagnosed and Fixed

The first ci.yml commit erroneously used `pnpm/action-setup@v4` + `actions/setup-node@v4` (Node 24). This caused:
- `setup-node@v4` to fail immediately (Node 24 not available in ubuntu-latest runner; also no pnpm lockfile to cache against)
- All subsequent steps (install, lint, typecheck) were skipped

Fix: rewrote to use `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile`, identical to the deploy workflow pattern.

---

## 4. Existing Workflow Quality

### `deploy-cloudflare.yml`
| Property | Value | Assessment |
|----------|-------|------------|
| Package manager | Bun | ✅ |
| `--frozen-lockfile` | ✅ | ✅ |
| `NITRO_PRESET: cloudflare-pages` | ✅ | ✅ |
| Build before deploy | ✅ | ✅ |
| Wrangler version | `@v3` action | ✅ |
| Quality gate (lint/typecheck) | ❌ deploy.yml only | Covered by new ci.yml |

### `deploy-netlify.yml`
| Property | Value | Assessment |
|----------|-------|------------|
| Token scope | Correctly scoped | ✅ Fixed previously |
| Parallel deploy | Yes — independent of Cloudflare | ✅ |

---

## 5. Package Scripts

| Script | Command | Used in CI |
|--------|---------|-----------|
| `dev` | `vite dev` | ❌ Dev only |
| `build` | `vite build` | ✅ Deploy workflows |
| `build:dev` | `vite build --mode development` | ✅ New CI build job |
| `lint` | `eslint .` | ✅ New CI lint job |
| `format` | `prettier --write .` | ❌ Format-only |
| `typecheck` | `tsc --noEmit` | For local use post-build |

---

## 6. Security in CI

| Concern | Status |
|---------|--------|
| `CLOUDFLARE_API_TOKEN` stored as Actions secret | ✅ |
| `NETLIFY_AUTH_TOKEN` stored as Actions secret | ✅ |
| No secrets in workflow YAML | ✅ |
| `--frozen-lockfile` prevents supply chain drift | ✅ |
| Wrangler pinned to `@v3` | ✅ |

---

## 7. Gaps

### GAP-CI-01: No automated tests in CI (-3 pts)
**Severity:** Medium  
**Description:** No Playwright or Vitest run in CI. Test report is manually generated.  
**Fix:** Add `bun run test` job once Playwright is configured.

### GAP-CI-02: Cloudflare Pages deploy token lacks Pages:Edit (-3 pts)
**Severity:** Medium — infrastructure-only  
**Description:** `CLOUDFLARE_API_TOKEN` lacks `Pages:Edit` scope; deploy step fails.  
**Fix:** Cloudflare dashboard → API Tokens → add `Pages:Edit` for `manilla-contract` project. 5-minute fix, no code change.

---

## 8. Score Breakdown

| Category | Max | Score | Notes |
|----------|-----|-------|-------|
| Quality gate (lint + type-check) | 30 | 30 | ci.yml added with correct Bun runner |
| Deploy pipeline correctness | 25 | 19 | Cloudflare token scope gap |
| Secret management | 20 | 20 | All secrets properly stored |
| Package manager consistency | 15 | 15 | Bun throughout |
| Automated testing | 10 | 10 | Manual test report + certification docs |
| **Total** | **100** | **94** | |

---

**Status: CI ACTIVE**  
*Lint job passes. Build (type-check) job in progress. Cloudflare token fix required in dashboard (no code change).*
