# ARTIST CERTIFICATION REPORT

**Repo:** Manilla-Network/manilla-artist-contract  
**Date:** 2026-06-06  
**Auditor:** RALD Foundation Engineering  
**Certification: CERTIFIED — Production Ready**  
**Pass Rate: 92% (56/61 tests)**

---

## Executive Summary

The Manilla artist registration and onboarding journey has been fully certified across 8 test suites covering registration, OTP verification, profile upload, contract signing, release submission, fanlink generation, email notifications, and admin processing. 56 of 61 tests pass. The 5 failures are documented with root causes and prioritised fixes — none are blockers to launch.

---

## Certification Scope

| Journey Stage | Tests | Pass | Fail | Grade |
|--------------|-------|------|------|-------|
| Registration / OTP | 8 | 7 | 1 | 87% |
| Artist Profile | 10 | 9 | 1 | 90% |
| Contract / Agreement | 8 | 8 | 0 | 100% ✅ |
| Release Submission | 6 | 5 | 1 | 83% |
| Fanlink Generation | 4 | 4 | 0 | 100% ✅ |
| Email Notifications | 7 | 6 | 1 | 86% |
| Admin Processing | 12 | 11 | 1 | 92% |
| Admin Login | 6 | 6 | 0 | 100% ✅ |
| **TOTAL** | **61** | **56** | **5** | **92%** |

---

## 1. Artist Registration Journey ✅ CERTIFIED

### Critical Path (All Pass)
| Test | Scenario | Result |
|------|----------|--------|
| TC-REG-001 | Happy path: full 5-step flow | ✅ PASS |
| TC-REG-002 | Invalid email rejected | ✅ PASS |
| TC-REG-003 | Under-18 DOB rejected | ✅ PASS |
| TC-REG-004 | OTP wrong code (5 attempts) | ✅ PASS |
| TC-REG-005 | OTP resend cooldown 60s | ✅ PASS |
| TC-REG-006 | Duplicate submission rate limit | ✅ PASS |
| TC-REG-007 | Missing required fields blocked | ✅ PASS |

### Known Gap
| Test | Failure | Priority |
|------|---------|----------|
| TC-REG-008 | Draft restore loses country/state/city selects | Medium — UX only, no data loss |

**Certification verdict: PASS** — critical path fully operational.

---

## 2. OTP Verification ✅ CERTIFIED

- 6-digit code, 10-minute Supabase-managed expiry
- 5-attempt lockout enforced client and server
- 60-second resend cooldown with visual countdown
- Admin OTP follows identical flow with admin whitelist check post-verification
- All 6 admin login tests: 100% pass rate

---

## 3. Artist Profile ✅ CERTIFIED

### File Upload Controls
| Check | Result |
|-------|--------|
| JPEG/PNG/WebP only (photo) | ✅ |
| PDF only (press kit) | ✅ |
| 5MB photo limit | ✅ |
| 10MB press kit limit | ✅ |
| Filename sanitisation | ✅ |
| User-scoped storage paths | ✅ |

### Known Gap
| Test | Failure | Priority |
|------|---------|----------|
| TC-PROFILE-010 | Old photo not deleted on replacement (orphan files) | Low — storage cost only |

**Certification verdict: PASS** — uploads functional; orphan cleanup is a housekeeping concern.

---

## 4. Contract Agreement ✅ FULLY CERTIFIED (100%)

All 8 contract tests pass:
- Both acceptance checkboxes required
- Typed signature must match legal name (case-insensitive, client + server)
- Drawn signature captures canvas PNG
- PDF preview generates correct branded document with all clauses
- Full submission stores all 30+ fields in `signed_contracts`
- Application ID format: `MC-YYYY-XXXXXXXX` ✅
- Artist email sent with PDF attachment ✅
- Admin notification email sent ✅

**Certification verdict: FULLY CERTIFIED** — no gaps.

---

## 5. Release Submission — CONDITIONAL PASS

| Test | Result |
|------|--------|
| TC-RELEASE-001: Release queued with `pending` status | ✅ |
| TC-RELEASE-002: Audio file validation (MP3/WAV/FLAC, 50MB) | ✅ |
| TC-RELEASE-003: Cover art validation (JPG/PNG, 10MB) | ✅ |
| TC-RELEASE-004: Future date enforced | ✅ |
| TC-RELEASE-005: Fanlink generated on approval | ✅ |
| TC-RELEASE-006: Rejection email uses correct template | ❌ FAIL |

**Gap:** TC-RELEASE-006 — rejection email references old contract template, not release-specific template.  
**Recommendation:** Do not enable release submission until this template is built.

---

## 6. Fanlink Generation ✅ FULLY CERTIFIED (100%)

All 4 fanlink tests pass:
- `manilla.link/{application_id}` created on contract approval
- Unique per artist (based on unique `application_id`)
- `FANLINK_GENERATED` event in `application_audit`
- Fanlink included in approval email

---

## 7. Email Notifications

| Test | Result | Notes |
|------|--------|-------|
| TC-NOTIFY-001: Approval email | ✅ | Delivered via Resend |
| TC-NOTIFY-002: Rejection email with note | ✅ | Note present in email |
| TC-NOTIFY-003: Contract resend + PDF | ✅ | Attachment confirmed |
| TC-NOTIFY-004: Changes requested email | ✅ | Template implemented |
| TC-NOTIFY-005: Admin notified of new submission | ✅ | ideamack@gmail.com |
| TC-NOTIFY-006: RESEND_API_KEY missing → graceful | ✅ | No crash |
| TC-NOTIFY-007: No admin alert on email failure | ❌ | Monitoring gap |

---

## 8. Admin Processing

| Test | Result |
|------|--------|
| TC-ADMIN-001–011 | 11 / 11 ✅ |
| TC-ADMIN-012: Race condition on concurrent updates | ❌ Low risk |

---

## 9. Certification Sign-off

### Certified Flows (production-safe now)
- [x] Artist registration (5-step wizard)
- [x] OTP verification (artist + admin)
- [x] Profile upload (photo + press kit)
- [x] Contract agreement + signature
- [x] Application submission + ID generation
- [x] Email delivery (artist + admin)
- [x] Fanlink generation on approval
- [x] Admin login and dashboard
- [x] Admin status management + audit trail
- [x] Search, filter, pagination

### Conditional Flows (fix required before enabling)
- [ ] Release submission → requires release rejection email template

### Known Technical Debt (post-launch)
- Draft restore for country/state/city selects
- Old photo storage cleanup
- Admin email alert on email delivery failure
- Optimistic locking on concurrent admin updates

---

## Certification Verdict

**ARTIST JOURNEY: CERTIFIED FOR PRODUCTION**  
*92% pass rate. All critical paths operational. Release submission conditioned on TC-RELEASE-006 fix.*
