# IDENTITY & AUTH READINESS REPORT

**Repo:** Manilla-Network/manilla-artist-contract  
**Date:** 2026-06-06  
**Auditor:** RALD Foundation Engineering  
**Score: 96 / 100**

---

## Executive Summary

Manilla's authentication and identity layer is built on Supabase Auth with OTP-only verification (no passwords), a server-side admin email whitelist, and PKCE-safe session management. The platform is registered in the RALD SSO ecosystem as an authorised app. Identity posture is strong; two minor gaps prevent a perfect score.

---

## 1. Auth Architecture

| Layer | Implementation | Status |
|-------|----------------|--------|
| Auth provider | Supabase Auth (managed) | ✅ Production-grade |
| Login method | OTP via email (no passwords) | ✅ Phishing-resistant |
| Session storage | Supabase JS client (httpOnly-managed) | ✅ Secure |
| Token validation | `supabase.auth.getUser(token)` server-side | ✅ Correct |
| Admin whitelist | `ADMIN_EMAILS` env var, `requireAdmin()` | ✅ Enforced server-side |
| RALD SSO registry | Added to `FALLBACK_APP_IDS` + `ECOSYSTEM_APPS` | ✅ Active |

### Auth Middleware (`src/integrations/supabase/auth-middleware.ts`)
- All server functions guarded by `requireSupabaseAuth` middleware
- Uses `createClient` with per-request `Authorization: Bearer` header (no shared client leakage)
- `getUser(token)` validates JWT against Supabase Auth server — no local decoding
- `requireAdmin()` throws `AccessDenied` for non-whitelisted emails

### Known Correct Fix Applied
`getUser()` replaces the non-existent `getClaims()` method. This fix prevents HTTP 500 on every admin server function call — the single most critical correctness fix in the codebase.

---

## 2. OTP Flow

```
Artist/Admin enters email
    → Supabase sends 6-digit OTP (10-min expiry)
    → User enters OTP
    → Supabase returns session JWT
    → Client stores in Supabase session store
    → Server fn reads Bearer token from Authorization header
    → getUser(token) validates server-side
```

**OTP hardening verified:**
- [x] 5-attempt lockout client-side (TC-REG-004 ✅)
- [x] 60-second resend cooldown (TC-REG-005 ✅)
- [x] 10-minute server-side OTP expiry (TC-LOGIN-003 ✅)
- [x] Sign-out invalidates session (TC-LOGIN-004 ✅)
- [x] Session persists across page navigations (TC-LOGIN-005 ✅)

---

## 3. Admin Access Control

```typescript
// src/lib/admin.functions.ts
export function requireAdmin(email: string): void {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  if (!adminEmails.includes(email.toLowerCase())) {
    throw new Error("Access denied: not an authorised admin");
  }
}
```

**Verified behaviours:**
- [x] Non-admin OTP succeeds but dashboard access denied (TC-LOGIN-002 ✅)
- [x] Admin check runs on every server function invocation
- [x] Admin route renders `noindex, nofollow` robots meta
- [x] No client-side-only access gating

---

## 4. RALD SSO Registry

Manilla was added to the RALD SSO ecosystem registry in `Ostinato-Loop/rald-auth-core`:

```typescript
// FALLBACK_APP_IDS
"manilla"

// ECOSYSTEM_APPS
{
  id: "manilla",
  name: "Manilla Collective",
  url: "https://manilla-contract.pages.dev",
  scopes: ["profile", "email"],
  category: "artist_services",
}
```

Migration `20260606000002_add_manilla_app.sql` applied to RALD auth DB.

---

## 5. Session Security

| Concern | Mitigation | Score |
|---------|-----------|-------|
| Session fixation | New Supabase session issued on each OTP verification | ✅ |
| Token leakage | Bearer tokens never logged or stored in DB | ✅ |
| CSRF | TanStack Start server functions use POST + JSON body (no cookie CSRF surface) | ✅ |
| Replay attacks | OTP single-use, Supabase-managed | ✅ |
| Concurrent sessions | Supabase allows multiple sessions (acceptable for admin use case) | ⚠️ Noted |

---

## 6. Gaps & Recommendations

### GAP-IDENTITY-01: No session revocation dashboard (-2 pts)
**Severity:** Low  
**Description:** Admins cannot view or revoke active sessions from the dashboard. If an admin account is compromised, the only recourse is rotating the `ADMIN_EMAILS` env var and waiting for session expiry.  
**Recommendation:** Add a "Sign out all sessions" button calling `supabase.auth.admin.signOut(userId, 'global')`.

### GAP-IDENTITY-02: ADMIN_EMAILS not validated at startup (-2 pts)
**Severity:** Low  
**Description:** If `ADMIN_EMAILS` is misconfigured (empty, whitespace-only), the admin dashboard becomes inaccessible with no clear error.  
**Recommendation:** Add startup validation that logs a warning if `ADMIN_EMAILS` is empty.

---

## 7. Compliance Checklist

- [x] Authentication required for all admin server functions
- [x] OTP-only (no password storage, no password reset vectors)
- [x] Admin whitelist enforced server-side on every request
- [x] Session JWT validated server-side (not decoded client-side)
- [x] RALD SSO registry entry active
- [x] Admin route robots: noindex, nofollow
- [x] Auth errors return clear messages without information leakage
- [ ] Session revocation dashboard (gap)
- [ ] Startup env validation for ADMIN_EMAILS (gap)

---

## Score Breakdown

| Category | Max | Score | Notes |
|----------|-----|-------|-------|
| Auth architecture | 25 | 25 | OTP-only, Supabase managed, correct token validation |
| Admin access control | 25 | 23 | Whitelist enforced; no session revocation |
| Session security | 20 | 20 | No CSRF, no leakage, proper invalidation |
| RALD SSO integration | 15 | 15 | Registry entry active, migration applied |
| Error handling | 15 | 13 | Clear errors; startup validation missing |
| **Total** | **100** | **96** | |

---

**Status: PRODUCTION READY**  
*Two low-severity gaps documented. Neither blocks launch.*
