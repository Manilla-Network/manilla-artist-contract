# DATABASE AUDIT REPORT

**Repo:** Manilla-Network/manilla-artist-contract  
**Date:** 2026-06-06  
**Auditor:** RALD Foundation Engineering  
**Score: 96 / 100**

---

## Executive Summary

Manilla uses Supabase PostgreSQL with a well-structured 9-table schema managed through 8 incremental migrations. All tables have Row-Level Security (RLS) enabled with admin-only access policies. The schema covers the full operational lifecycle: artist registration, contract signing, release management, artist verification, label onboarding, feature flags, support tickets, fanlinks, and complete audit trails. Data integrity is enforced via foreign keys, check constraints, and JSONB validation at the application layer.

---

## 1. Migration History

| Migration | Date | Description |
|-----------|------|-------------|
| `20260101000000_initial_schema.sql` | 2026-01-01 | Core: `signed_contracts`, `application_audit` |
| `20260201000000_add_release_queue.sql` | 2026-02-01 | `release_queue` table |
| `20260301000000_add_verification_queue.sql` | 2026-03-01 | `artist_verification_queue` |
| `20260401000000_add_label_queue.sql` | 2026-04-01 | `label_queue` |
| `20260501000000_add_feature_flags.sql` | 2026-05-01 | `feature_flags` |
| `20260515000000_add_support_tickets.sql` | 2026-05-15 | `support_tickets` |
| `20260520000000_add_fanlinks.sql` | 2026-05-20 | `fanlinks` |
| `20260606000000_admin_control_plane.sql` | 2026-06-06 | `queue_audit`, fanlinks FK, indexes |

**Migration strategy:** Sequential timestamp-based migrations, each idempotent with `IF NOT EXISTS`. No destructive drops.

---

## 2. Schema Overview

### Table 1: `signed_contracts` (Core)
Primary artist registration and contract record.

| Column | Type | Constraint |
|--------|------|-----------|
| `id` | UUID | PK, default gen_random_uuid() |
| `application_id` | TEXT | UNIQUE, format MC-YYYY-XXXXXXXX |
| `email` | TEXT | NOT NULL |
| `legal_name` | TEXT | NOT NULL |
| `stage_name` | TEXT | NOT NULL |
| `phone` | TEXT | |
| `city`, `state`, `country` | TEXT | NOT NULL |
| `date_of_birth` | TEXT | NOT NULL |
| `genre` | TEXT | NOT NULL |
| `years_active` | INTEGER | CHECK >= 0 |
| `bio` | TEXT | NOT NULL |
| `spotify_url`, `apple_music_url`, ... | TEXT | 8 social link columns |
| `artist_photo_url` | TEXT | |
| `press_kit_url` | TEXT | |
| `signature_name` | TEXT | NOT NULL |
| `signature_data_url` | TEXT | |
| `accepted_terms` | BOOLEAN | NOT NULL, CHECK = true |
| `accepted_revenue_split` | BOOLEAN | NOT NULL, CHECK = true |
| `status` | TEXT | NOT NULL, CHECK IN (submitted, under_review, approved, rejected, contract_sent, active, changes_requested, withdrawn) |
| `ip_hash` | TEXT | |
| `user_agent` | TEXT | |
| `timezone`, `locale`, `screen_resolution`, `referrer` | TEXT | |
| `signed_at` | TIMESTAMPTZ | NOT NULL, default now() |
| `email_sent_at` | TIMESTAMPTZ | |
| `fanlink_url` | TEXT | |
| `notes` | TEXT | |
| `assigned_to` | TEXT | |

**Indexes:** `application_id`, `email`, `status`, `signed_at`, `country`, `genre`

### Table 2: `application_audit`
Audit trail for signed_contracts status changes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `contract_id` | UUID | FK → signed_contracts.id ON DELETE CASCADE |
| `event` | TEXT | STATUS_CHANGED, APPROVED, REJECTED, etc. |
| `actor` | TEXT | Admin email |
| `old_value`, `new_value` | TEXT | Status before/after |
| `metadata` | JSONB | Additional context |
| `created_at` | TIMESTAMPTZ | |

### Table 3: `queue_audit`
Universal audit trail for all queue operations.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `queue` | TEXT | release/contract/artist/label/support/feature_flags |
| `item_id` | UUID | ID in the respective queue table |
| `event` | TEXT | Action type |
| `actor` | TEXT | Admin email |
| `old_status`, `new_status` | TEXT | Status transition |
| `note` | TEXT | Admin note |
| `metadata` | JSONB | Additional data |
| `created_at` | TIMESTAMPTZ | |

### Table 4: `release_queue`
Release submission and approval pipeline.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `contract_id` | UUID | FK → signed_contracts.id |
| `application_id` | TEXT | MC reference |
| `title` | TEXT | Release title |
| `type` | TEXT | single/ep/album |
| `genre` | TEXT | |
| `release_date` | DATE | Must be future |
| `audio_url` | TEXT | Uploaded audio |
| `cover_art_url` | TEXT | |
| `status` | TEXT | pending/under_review/approved/rejected/withdrawn |
| `fanlink_url` | TEXT | Generated on approval |
| `assigned_to` | TEXT | |
| `notes` | TEXT | |
| `submitted_at` | TIMESTAMPTZ | |

### Table 5: `artist_verification_queue`
Artist identity and eligibility verification.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `contract_id` | UUID | FK → signed_contracts.id |
| `verification_type` | TEXT | identity/social/eligibility/full |
| `checklist` | JSONB | Array of pass/fail items |
| `id_document_url` | TEXT | |
| `selfie_url` | TEXT | |
| `social_verified` | BOOLEAN | |
| `status` | TEXT | pending/in_progress/verified/failed/manual_review |
| `verified_at` | TIMESTAMPTZ | |

### Table 6: `label_queue`
Label partnership approval pipeline.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `label_name`, `label_email` | TEXT | |
| `roster_size` | INTEGER | |
| `genre_focus` | TEXT[] | Array |
| `monthly_streams` | BIGINT | |
| `tier` | TEXT | standard/premium/enterprise |
| `deal_terms` | JSONB | Negotiated terms |
| `status` | TEXT | pending/under_review/due_diligence/approved/rejected |

### Table 7: `feature_flags`
Runtime feature flag management.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `key` | TEXT | UNIQUE, lowercase_underscore |
| `name` | TEXT | Display name |
| `description` | TEXT | |
| `enabled` | BOOLEAN | default false |
| `rollout_pct` | INTEGER | 0-100, CHECK constraint |
| `created_by`, `updated_by` | TEXT | Admin email |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### Table 8: `support_tickets`
Artist and user support queue.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `ticket_number` | TEXT | UNIQUE, SUPP-YYYY-XXXXXX |
| `type` | TEXT | artist/label/technical/billing/other |
| `priority` | TEXT | low/medium/high/critical |
| `status` | TEXT | open/in_progress/waiting/resolved/closed |
| `contract_id` | UUID | FK → signed_contracts.id (nullable) |
| `internal_notes` | JSONB | Array of {text, actor, ts} |
| `resolution` | TEXT | |
| `resolved_at` | TIMESTAMPTZ | |

### Table 9: `fanlinks`
Generated fanlink records.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `contract_id` | UUID | FK → signed_contracts.id |
| `release_id` | UUID | FK → release_queue.id (nullable) |
| `slug` | TEXT | UNIQUE, manilla.link/{slug} |
| `fanlink_url` | TEXT | Full URL |
| `created_at` | TIMESTAMPTZ | |

---

## 3. RLS Policy Coverage

All 9 tables: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`  
All tables: `CREATE POLICY "admin_only" ... USING (auth.role() = 'service_role')`  
Public access: Denied by default (no SELECT policy for anon role)

**Assessment: ✅ Complete RLS coverage across all tables.**

---

## 4. Data Integrity Controls

| Control | Implementation | Status |
|---------|---------------|--------|
| Primary keys | UUID with gen_random_uuid() | ✅ |
| Foreign keys | CASCADE on contract deletion | ✅ |
| Status enum enforcement | CHECK constraints | ✅ |
| Boolean acceptance fields | CHECK = true (cannot insert false) | ✅ |
| Feature flag rollout | CHECK 0–100 | ✅ |
| Unique application IDs | UNIQUE constraint | ✅ |
| Timestamp defaults | `default now()` or `default gen_random_uuid()` | ✅ |

---

## 5. Performance

| Optimization | Status |
|-------------|--------|
| Indexes on high-cardinality query columns | ✅ |
| Paginated queries with `.range()` | ✅ |
| Parallel health checks (Promise.all) | ✅ |
| Count queries use `head: true` | ✅ |
| No N+1 queries in admin list views | ✅ |

---

## 6. Gaps

### GAP-DB-01: No optimistic locking on status updates (-2 pts)
**Severity:** Low  
**Description:** Concurrent admin updates (TC-ADMIN-012) can overwrite each other. No `WHERE updated_at = expected_at` guard.  
**Fix:** Add `updated_at` version check in `updateApplicationStatus()`.

### GAP-DB-02: Old photo uploads not cleaned from storage (-2 pts)
**Severity:** Low  
**Description:** When an artist replaces their photo, the old Supabase Storage object is not deleted (TC-PROFILE-010).  
**Fix:** In `uploadArtistPhoto()`, before uploading new, call `supabase.storage.from(BUCKET).remove([oldPath])`.

---

## 7. Score Breakdown

| Category | Max | Score | Notes |
|----------|-----|-------|-------|
| Schema completeness | 30 | 30 | All 9 tables, correct relationships |
| RLS security | 25 | 25 | Full coverage, service-role only |
| Data integrity constraints | 20 | 20 | CHECK, UNIQUE, FK all enforced |
| Migration quality | 15 | 13 | Idempotent; no optimistic locking |
| Performance | 10 | 8 | Good indexing; storage cleanup gap |
| **Total** | **100** | **96** | |

---

**Status: PRODUCTION READY**  
*Two low-severity gaps (optimistic locking, orphan storage cleanup) — neither blocks launch.*
