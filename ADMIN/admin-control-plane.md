# MANILLA ADMIN CONTROL PLANE V1

**Version:** 1.0.0  
**Date:** 2026-06-06  
**Platform:** Manilla Collective — Artist Contract & Operations Platform  
**Owner:** LILCKY STUDIO LIMITED, Lagos, Nigeria

---

## Overview

The Admin Control Plane is the single operational command center for the Manilla Collective platform. Every queue, approval, artist action, and platform event flows through this system. No manual database intervention is required.

---

## Architecture

```
Admin Control Plane
├── Release Approval Queue      → /admin?tab=releases
├── Contract Approval Queue     → /admin?tab=contracts
├── Artist Verification Queue   → /admin?tab=artists
├── Label Approval Queue        → /admin?tab=labels
└── Support Queue               → /admin?tab=support
```

All queues share a unified action model:
- **Approve** — moves item to approved state, triggers notification + workflow
- **Reject** — moves item to rejected state, sends rejection email with note
- **Request Changes** — returns item to submitter with specific change requests
- **Escalate** — flags for senior review, adds ESCALATED audit event
- **Internal Notes** — private notes visible only to admin team
- **Assignment** — assign queue item to specific admin team member

---

## Queue 1: Release Approval Queue

### Purpose
Review and approve music releases before they go live on distribution platforms.

### Table: `release_queue`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `artist_id` | UUID | FK → signed_contracts.id |
| `application_id` | TEXT | Artist's MC application ID |
| `release_title` | TEXT | Track/album title |
| `release_type` | TEXT | single / EP / album |
| `genre` | TEXT | Primary genre |
| `release_date` | DATE | Requested release date |
| `audio_url` | TEXT | Supabase Storage URL |
| `artwork_url` | TEXT | Cover art URL |
| `explicit` | BOOLEAN | Explicit content flag |
| `isrc` | TEXT | ISRC code (if available) |
| `upc` | TEXT | UPC code (if available) |
| `distribution_targets` | JSONB | Array of DSP targets |
| `status` | TEXT | pending / under_review / approved / rejected / changes_requested / live |
| `assigned_to` | TEXT | Admin email |
| `fanlink_url` | TEXT | Generated fanlink (on approval) |
| `metadata` | JSONB | Additional data |
| `submitted_at` | TIMESTAMPTZ | Submission timestamp |
| `reviewed_at` | TIMESTAMPTZ | Review completion timestamp |
| `reviewed_by` | TEXT | Reviewer admin email |

### Status Flow
```
pending → under_review → approved → live
                       ↘ rejected
                       ↘ changes_requested → pending (resubmit)
```

### On Approve
1. Insert audit event `RELEASE_APPROVED`
2. Generate fanlink (fanlink_url populated)
3. Send artist notification email
4. Trigger distribution workflow event
5. Update `reviewed_at`, `reviewed_by`

### On Reject
1. Insert audit event `RELEASE_REJECTED`
2. Send rejection email with admin note
3. Update status to `rejected`

### On Request Changes
1. Insert audit event `CHANGES_REQUESTED`
2. Send changes email with specific feedback
3. Status → `changes_requested`
4. Artist can resubmit → status resets to `pending`

---

## Queue 2: Contract Approval Queue

### Purpose
The existing `signed_contracts` table functions as the Contract Approval Queue. Extended with assignment and escalation capabilities.

### Extended Statuses
```
submitted → under_review → approved → contract_sent → signed → active
                         ↘ rejected
                         ↘ changes_requested
                         ↘ escalated → approved / rejected
```

### Actions Available
- **Approve** → sends approval email, triggers contract_sent flow
- **Reject** → sends rejection email with note
- **Request Changes** → artist notified to provide additional info
- **Escalate** → flags for senior review, assigns to escalation_queue
- **Resend Contract** → resends signed PDF to artist
- **Internal Note** → stored in application_audit with event `INTERNAL_NOTE`
- **Assign** → assigns to specific admin, logged in audit

### Fanlink Generation on Approval
When status changes to `approved`:
- Auto-generate fanlink slug: `manilla.link/{application_id}`
- Store in `signed_contracts.fanlink_url`
- Log `FANLINK_GENERATED` audit event

---

## Queue 3: Artist Verification Queue

### Purpose
Verify artist identity, social profiles, and eligibility before granting active status.

### Table: `artist_verification_queue`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `contract_id` | UUID | FK → signed_contracts.id |
| `application_id` | TEXT | MC application ID |
| `verification_type` | TEXT | identity / social / eligibility / full |
| `checklist` | JSONB | Array of verification items with pass/fail |
| `id_document_url` | TEXT | Government ID upload URL |
| `selfie_url` | TEXT | Selfie for liveness check |
| `social_verified` | BOOLEAN | Socials confirmed active |
| `status` | TEXT | pending / in_progress / verified / failed / manual_review |
| `assigned_to` | TEXT | Admin email |
| `notes` | TEXT | Internal verification notes |
| `verified_at` | TIMESTAMPTZ | Verification completion |
| `verified_by` | TEXT | Verifier admin email |

### Verification Checklist Items
- [ ] Legal name matches government ID
- [ ] Date of birth confirmed
- [ ] Address verified
- [ ] At least one active streaming profile confirmed
- [ ] Artist photo matches ID (liveness)
- [ ] No duplicate accounts detected
- [ ] Eligibility age (18+) confirmed
- [ ] Country eligibility confirmed

### On Verified
1. Update `signed_contracts.status` → `active`
2. Insert audit event `ARTIST_VERIFIED`
3. Send welcome email with dashboard access
4. Trigger onboarding workflow

---

## Queue 4: Label Approval Queue

### Purpose
Approve new label partnerships, sub-labels, or label distribution requests.

### Table: `label_queue`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `label_name` | TEXT | Label name |
| `label_email` | TEXT | Primary contact email |
| `contact_name` | TEXT | Label representative name |
| `country` | TEXT | Country of registration |
| `roster_size` | INTEGER | Number of artists |
| `genre_focus` | TEXT[] | Primary genres |
| `existing_distro` | TEXT | Current distributor |
| `catalog_size` | INTEGER | Existing release count |
| `monthly_streams` | BIGINT | Approximate monthly streams |
| `documents_url` | TEXT | Registration/legal docs |
| `status` | TEXT | pending / under_review / approved / rejected / due_diligence |
| `tier` | TEXT | standard / premium / enterprise |
| `assigned_to` | TEXT | Admin email |
| `deal_terms` | JSONB | Negotiated deal terms |
| `notes` | TEXT | Internal notes |
| `submitted_at` | TIMESTAMPTZ | Submission timestamp |
| `reviewed_at` | TIMESTAMPTZ | Review completion |
| `reviewed_by` | TEXT | Reviewer email |

### Status Flow
```
pending → under_review → due_diligence → approved
                       ↘ rejected
```

### On Approve
1. Insert audit event `LABEL_APPROVED`
2. Create label profile in platform
3. Send welcome package email
4. Grant portal access

---

## Queue 5: Support Queue

### Purpose
Internal support dashboard for handling artist and user issues. No direct database access required.

### Table: `support_tickets`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `ticket_number` | TEXT | SUPP-YYYY-XXXXXX format |
| `type` | TEXT | artist / label / technical / billing / other |
| `priority` | TEXT | low / medium / high / critical |
| `subject` | TEXT | Ticket subject line |
| `description` | TEXT | Full issue description |
| `reporter_email` | TEXT | Submitter email |
| `reporter_name` | TEXT | Submitter name |
| `contract_id` | UUID | FK → signed_contracts.id (if applicable) |
| `status` | TEXT | open / in_progress / waiting / resolved / closed |
| `assigned_to` | TEXT | Admin email |
| `resolution` | TEXT | Resolution description |
| `metadata` | JSONB | Extra context data |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |
| `resolved_at` | TIMESTAMPTZ | Resolution timestamp |

### Priority SLA
| Priority | First Response | Resolution |
|----------|---------------|------------|
| Critical | 1 hour | 4 hours |
| High | 4 hours | 24 hours |
| Medium | 24 hours | 72 hours |
| Low | 72 hours | 7 days |

---

## Universal Action Model

Every queue item supports these actions with full audit trails:

```typescript
type QueueAction = {
  action: 'approve' | 'reject' | 'request_changes' | 'escalate' | 'assign' | 'note';
  queue: 'release' | 'contract' | 'artist' | 'label' | 'support';
  item_id: string;
  actor: string;        // Admin email
  note?: string;        // Required for reject/request_changes
  assignee?: string;    // Required for assign
  metadata?: object;    // Additional context
};
```

### Audit Event Types
| Event | Trigger |
|-------|---------|
| `STATUS_CHANGED` | Any status transition |
| `APPROVED` | Item approved |
| `REJECTED` | Item rejected |
| `CHANGES_REQUESTED` | Change request sent |
| `ESCALATED` | Item escalated |
| `ASSIGNED` | Assignment changed |
| `INTERNAL_NOTE` | Note added |
| `FANLINK_GENERATED` | Fanlink created on approval |
| `NOTIFICATION_SENT` | Email notification dispatched |
| `WORKFLOW_TRIGGERED` | Downstream workflow started |

---

## Notification System

All actions trigger relevant notifications:

### Artist Notifications (via Resend)
- **Approval** → Welcome/congratulations email with next steps
- **Rejection** → Feedback email with reason and note
- **Changes Requested** → Specific change request with instructions
- **Contract Sent** → Contract PDF email
- **Active Status** → Dashboard access granted

### Admin Notifications (via Resend)
- **New Submission** → Immediate alert to admin team
- **Escalation** → High-priority alert to senior admin
- **Overdue Items** → Daily digest for items past SLA

---

## Assignment System

```
Admin Team Roles:
├── super_admin   → all queues, all actions, feature flags
├── a_and_r       → release + artist + contract queues
├── operations    → label + support queues
└── support_agent → support queue only
```

Assignment is stored in `assigned_to` column + logged in audit.
Unassigned items surface in a dedicated "Unassigned" filter.

---

## Fanlink Generation

On approval of a release or contract:
1. Generate slug: `manilla.link/{application_id}` or `manilla.link/{release_id}`
2. Create short URL record in `fanlinks` table
3. Populate `fanlink_url` on the queue item
4. Log `FANLINK_GENERATED` in audit
5. Include fanlink in artist notification email

---

## Success Criteria

- [x] Administrator can process entire platform from one dashboard
- [x] No manual database intervention required
- [x] Complete audit trail for every action
- [x] All actions trigger appropriate notifications
- [x] Status updates propagate across queues
- [x] Fanlinks generated on approval
- [x] Assignment and escalation supported
- [x] Internal notes are private and logged
