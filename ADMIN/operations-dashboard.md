# MANILLA OPERATIONS DASHBOARD

**Version:** 1.0.0  
**Date:** 2026-06-06  
**URL:** `/admin`

---

## Overview

The Operations Dashboard is the unified command center for managing all aspects of the Manilla Collective platform. It provides real-time visibility into every queue, system health metric, and operational KPI from a single interface.

---

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  🎵 Manilla Collective  │  Admin  │  admin@manilla.network  │ ⏻  │
├─────────────────────────────────────────────────────────────────┤
│  [Overview] [Contracts] [Releases] [Artists] [Labels] [Support] │
│            [Health]  [Feature Flags]  [Settings]               │
├─────────────────────────────────────────────────────────────────┤
│  PLATFORM STATS                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Total    │ │Pending   │ │ Active   │ │ Today    │          │
│  │ 1,247    │ │ Review   │ │ Artists  │ │ +12      │          │
│  │ Artists  │ │   38     │ │  892     │ │ New Apps │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├────────────────────────────────────┬────────────────────────────┤
│  QUEUE OVERVIEW                    │  SYSTEM HEALTH             │
│  ┌────────────────────────────┐   │  ● Database      OK        │
│  │ Contracts     38  pending  │   │  ● Storage       OK        │
│  │ Releases      12  pending  │   │  ● Auth          OK        │
│  │ Verification   7  pending  │   │  ● Email         OK        │
│  │ Labels         3  pending  │   │  ● Workers       OK        │
│  │ Support       15  open     │   │  ● Fanlinks      OK        │
│  └────────────────────────────┘   │  ● Contracts     OK        │
│                                    └────────────────────────────┤
│  RECENT ACTIVITY                                                │
│  [Timeline of latest admin actions]                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tab Structure

### Tab 1: Overview
- Platform-wide stats bar
- Queue summary cards (each with pending count + link)
- System health summary
- Recent activity feed (last 50 audit events across all queues)
- Charts: submissions over time, status distribution, country breakdown

### Tab 2: Contracts
- Full contract approval queue (existing admin dashboard, enhanced)
- Filters: search, status, country, date range, assigned_to
- Actions: Approve, Reject, Request Changes, Escalate, Assign, Note, Resend Contract
- Detail panel: full application + audit trail

### Tab 3: Releases
- Release approval queue
- Filters: search, status, genre, release_type, release_date
- Actions: Approve, Reject, Request Changes, Escalate, Assign, Note
- On approval: auto-generate fanlink, trigger DSP workflow

### Tab 4: Artists
- Artist verification queue
- Filters: search, verification_type, status
- Actions: Verify, Fail, Manual Review, Assign, Note
- Checklist interface: tick off each verification item
- On verify: update contract status to `active`

### Tab 5: Labels
- Label approval queue
- Filters: search, status, country, tier
- Actions: Approve, Reject, Due Diligence, Assign, Note
- On approve: create label profile, grant portal access

### Tab 6: Support
- Support ticket dashboard
- Filters: search, type, priority, status, assigned_to
- Actions: Respond, Resolve, Close, Escalate, Assign, Note
- SLA indicators: color-coded by time remaining
- No direct DB access — all via server functions

### Tab 7: Health
- Real-time system status for all platform components
- Database: connection status, query latency, row counts
- Storage: bucket status, total size, upload success rate
- Auth: active sessions, OTP success rate, failed logins
- Email: Resend delivery rate, bounce rate, last sent
- Workers: Cloudflare Workers status, error rate
- Fanlinks: total generated, click-through rate
- Contracts: daily generation count, PDF success rate

### Tab 8: Feature Flags
- Centralized feature flag management
- Toggle features on/off without deployment
- Features: Publishing, Radio, Loop, Voice, Ads + custom flags
- Per-flag: enabled state, description, rollout percentage, created_by

---

## Component Architecture

```
src/routes/admin.tsx
├── AdminControlPlane (root component)
│   ├── AdminLogin
│   ├── AdminHeader
│   ├── TabNavigation
│   ├── OverviewTab
│   │   ├── StatsBar
│   │   ├── QueueSummaryCards
│   │   ├── SystemHealthCard
│   │   └── RecentActivityFeed
│   ├── ContractsTab (existing AdminDashboard, extended)
│   ├── ReleasesTab
│   │   ├── ReleaseTable
│   │   ├── ReleaseFilters
│   │   └── ReleaseDetailSheet
│   ├── ArtistsTab
│   │   ├── VerificationTable
│   │   └── VerificationChecklist
│   ├── LabelsTab
│   │   ├── LabelTable
│   │   └── LabelDetailSheet
│   ├── SupportTab
│   │   ├── TicketTable
│   │   ├── TicketFilters
│   │   └── TicketDetailSheet
│   ├── HealthTab
│   │   └── SystemStatusGrid
│   └── FeatureFlagsTab
│       └── FlagManager
```

---

## Server Functions Required

```
lib/admin.functions.ts (existing, extended)
├── getAdminApplications
├── getAdminStats
├── getApplicationDetail
├── updateApplicationStatus      ← add escalate, request_changes
├── resendArtistContract
├── getAdminCountries
├── addInternalNote              ← NEW
├── assignQueueItem              ← NEW
└── generateFanlink              ← NEW

lib/admin-queues.functions.ts    ← NEW
├── getReleaseQueue
├── getReleaseDetail
├── processReleaseAction
├── getVerificationQueue
├── processVerificationAction
├── getLabelQueue
├── processLabelAction

lib/support.functions.ts         ← NEW
├── getSupportTickets
├── getSupportTicketDetail
├── createSupportTicket
├── processSupportAction
├── addTicketNote

lib/feature-flags.functions.ts   ← NEW
├── getFeatureFlags
├── setFeatureFlag
├── createFeatureFlag
├── deleteFeatureFlag

lib/health.functions.ts          ← NEW
├── getDatabaseHealth
├── getStorageHealth
├── getAuthHealth
├── getEmailHealth
├── getSystemHealth
```

---

## Database Migrations Required

Run in order after existing migrations:

1. `20260606000000_admin_control_plane.sql` — queues, fanlinks, assignments
2. `20260606000001_feature_flags.sql` — feature flags table
3. `20260606000002_support_tickets.sql` — support queue

---

## Success Criteria

✅ Single URL to manage the entire platform  
✅ No manual database queries needed for any operation  
✅ Every action is logged with actor, timestamp, and context  
✅ Notifications triggered automatically on state changes  
✅ Fanlinks generated on release/contract approval  
✅ Feature flags controllable without code deployment  
✅ System health visible without external monitoring tools  
✅ Support resolved without direct DB access  
