# MANILLA APPROVAL & AUDIT SYSTEM

**Version:** 1.0.0  
**Date:** 2026-06-06  
**Scope:** All approval queues across the Manilla Collective platform

---

## Overview

Every administrative action on the Manilla platform is immutably recorded in a tamper-evident audit trail. The audit system provides full accountability, reconstructable history, and compliance-ready reporting.

---

## Audit Architecture

```
Action Triggered
       ↓
Validate Actor (admin check)
       ↓
Execute State Change
       ↓
Insert Audit Record (immutable)
       ↓
Trigger Notification
       ↓
Update Queue Item
       ↓
Return Result + Audit ID
```

---

## Audit Tables

### `application_audit` (existing — extended)
Records all events on artist contract applications.

```sql
CREATE TABLE public.application_audit (
  id             uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id    uuid         REFERENCES signed_contracts(id) ON DELETE SET NULL,
  application_id text,
  event          text         NOT NULL,
  actor          text,        -- Admin email or 'system'
  old_value      text,
  new_value      text,
  metadata       jsonb        NOT NULL DEFAULT '{}',
  ip_hash        text,
  created_at     timestamptz  NOT NULL DEFAULT now()
);
```

### `queue_audit` (new — universal)
Records all events across all queues.

```sql
CREATE TABLE public.queue_audit (
  id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  queue       text         NOT NULL,  -- release|contract|artist|label|support
  item_id     uuid         NOT NULL,
  event       text         NOT NULL,
  actor       text         NOT NULL,  -- admin email or 'system'
  old_status  text,
  new_status  text,
  note        text,
  metadata    jsonb        NOT NULL DEFAULT '{}',
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX queue_audit_item_idx ON queue_audit (queue, item_id, created_at DESC);
CREATE INDEX queue_audit_actor_idx ON queue_audit (actor, created_at DESC);
CREATE INDEX queue_audit_event_idx ON queue_audit (event, created_at DESC);
```

---

## Audit Event Catalogue

### Contract / Artist Application Events
| Event | Description | Triggered By |
|-------|-------------|-------------|
| `SUBMITTED` | Artist submitted application | System |
| `OTP_SENT` | Verification code sent | System |
| `OTP_VERIFIED` | Email verified | System |
| `STATUS_CHANGED` | Status transition | Admin |
| `APPROVED` | Application approved | Admin |
| `REJECTED` | Application rejected | Admin |
| `CHANGES_REQUESTED` | Change request issued | Admin |
| `ESCALATED` | Escalated for senior review | Admin |
| `ASSIGNED` | Assigned to admin team member | Admin |
| `INTERNAL_NOTE` | Private note added | Admin |
| `CONTRACT_SENT` | Contract PDF sent to artist | System/Admin |
| `CONTRACT_RESENT` | Contract PDF resent | Admin |
| `SIGNED` | Artist signed contract | System |
| `ACTIVE` | Artist activated | Admin/System |
| `FANLINK_GENERATED` | Fanlink created | System |
| `NOTIFICATION_SENT` | Email dispatched | System |

### Release Queue Events
| Event | Description |
|-------|-------------|
| `RELEASE_SUBMITTED` | New release submitted |
| `RELEASE_UNDER_REVIEW` | Review started |
| `RELEASE_APPROVED` | Release approved |
| `RELEASE_REJECTED` | Release rejected |
| `RELEASE_CHANGES_REQUESTED` | Feedback sent |
| `RELEASE_LIVE` | Went live on DSPs |
| `RELEASE_FANLINK_GENERATED` | Fan link created |

### Artist Verification Events
| Event | Description |
|-------|-------------|
| `VERIFICATION_STARTED` | Verification initiated |
| `VERIFICATION_CHECKLIST_UPDATED` | Checklist item updated |
| `VERIFICATION_PASSED` | Fully verified |
| `VERIFICATION_FAILED` | Verification failed |
| `MANUAL_REVIEW_REQUESTED` | Escalated to manual review |

### Label Events
| Event | Description |
|-------|-------------|
| `LABEL_SUBMITTED` | Label application submitted |
| `LABEL_DUE_DILIGENCE` | Due diligence started |
| `LABEL_APPROVED` | Label approved |
| `LABEL_REJECTED` | Label rejected |

### Support Events
| Event | Description |
|-------|-------------|
| `TICKET_CREATED` | New support ticket |
| `TICKET_ASSIGNED` | Assigned to agent |
| `TICKET_IN_PROGRESS` | Work started |
| `TICKET_WAITING` | Waiting on customer |
| `TICKET_RESOLVED` | Resolution provided |
| `TICKET_CLOSED` | Ticket closed |
| `TICKET_ESCALATED` | Escalated to senior |
| `TICKET_NOTE_ADDED` | Internal note |

---

## Audit Record Structure

Every audit event contains:

```typescript
interface AuditRecord {
  id: string;              // UUID — unique event ID
  queue: string;           // Which queue this belongs to
  item_id: string;         // UUID of the queue item
  event: string;           // Event type from catalogue above
  actor: string;           // Who performed the action (email or 'system')
  old_status?: string;     // Previous status (if status change)
  new_status?: string;     // New status (if status change)
  note?: string;           // Admin note (required for reject/changes)
  metadata: {
    note?: string;         // Admin-visible note
    assignee?: string;     // For assignment events
    notification?: {       // For notification events
      to: string;
      subject: string;
      delivered: boolean;
    };
    fanlink?: string;      // For fanlink generation events
    ip_hash?: string;      // For system events
    user_agent?: string;   // For system events
    [key: string]: unknown;
  };
  created_at: string;      // ISO timestamp — immutable
}
```

---

## Immutability Guarantee

Audit records are **append-only**. No UPDATE or DELETE is permitted:

```sql
-- RLS policy: audit records are insert-only
CREATE POLICY "audit insert only"
  ON public.queue_audit
  AS PERMISSIVE FOR INSERT
  TO service_role
  WITH CHECK (true);

-- No update/delete policies → any attempt silently blocked or raises error
ALTER TABLE public.queue_audit
  ENABLE ROW LEVEL SECURITY;
```

---

## Approval Workflow Implementation

### Server Function Pattern

```typescript
export const processQueueAction = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(actionSchema)
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const actor = claims.email;
    requireAdmin(actor);

    // 1. Fetch current state
    const current = await fetchQueueItem(supabase, data.queue, data.item_id);

    // 2. Validate transition
    validateTransition(current.status, data.action);

    // 3. Execute state change
    const newStatus = ACTION_TO_STATUS[data.action];
    await updateQueueItem(supabase, data.queue, data.item_id, {
      status: newStatus,
      reviewed_by: actor,
      reviewed_at: new Date().toISOString(),
    });

    // 4. Write audit record (MUST succeed)
    await supabase.from('queue_audit').insert({
      queue: data.queue,
      item_id: data.item_id,
      event: ACTION_TO_EVENT[data.action],
      actor,
      old_status: current.status,
      new_status: newStatus,
      note: data.note,
      metadata: buildMetadata(data),
    });

    // 5. Trigger notifications (non-blocking)
    sendNotification(data, current, actor).catch(console.error);

    // 6. Generate fanlink if applicable
    if (data.action === 'approve' && FANLINK_QUEUES.includes(data.queue)) {
      generateFanlink(data.item_id, current).catch(console.error);
    }

    return { success: true, new_status: newStatus };
  });
```

---

## Audit Trail UI

Each queue item's detail panel shows a chronological audit timeline:

```
┌─────────────────────────────────────────────────────┐
│  AUDIT TRAIL                                        │
├─────────────────────────────────────────────────────┤
│  ● STATUS_CHANGED                    06 Jun 11:42  │
│    submitted → under_review                         │
│    By: admin@manilla.network                        │
│                                                     │
│  ● ASSIGNED                          06 Jun 11:40  │
│    Assigned to: a_and_r@manilla.network             │
│    By: admin@manilla.network                        │
│                                                     │
│  ● SUBMITTED                         05 Jun 09:12  │
│    Application received                             │
│    System                                           │
└─────────────────────────────────────────────────────┘
```

---

## Audit Export & Compliance

### Downloadable Reports
- Full audit trail per artist (CSV)
- All actions by admin (CSV)
- Status flow report (daily/weekly/monthly)
- Compliance report (ISO 27001 aligned)

### Retention Policy
- Audit records: **7 years** (per financial regulation)
- No automatic deletion
- Annual archival to cold storage after 2 years active

---

## Security Properties

1. **Non-repudiation** — Every action is tied to an authenticated admin email
2. **Immutability** — Audit records cannot be updated or deleted
3. **Completeness** — Every state change produces an audit record; no silent transitions
4. **Transparency** — Artists can view their own audit events
5. **Separation** — Admin notes (internal) vs. notification content (external) are stored separately
