# In-App Notifications

## Overview

A per-user notification feed surfaced next to the user dropdown in the sidebar footer. Notifications are generated **server-side at the moment the triggering action happens** (fan-out on write) and stored in a new `notifications` table. The frontend polls for them, shows an unread badge, renders a list in a popover, and lets the user dismiss each one.

Three notification types in v1:

| Type | Trigger | Recipients | Links to |
|------|---------|------------|----------|
| `expense_created` | `CreateExpense` / `BulkCreateExpenses` | payer ∪ beneficiaries, minus the actor | group page |
| `transfer_created` | `CreateTransfer` | sender ∪ receiver, minus the actor | group page |
| `group_invite` | `AddUserToGroup` | the added user | group page |

"Relates to you" is defined per type in the recipients column. The acting user never gets a notification for their own action.

> **Deferred to a later version:** `recurring_due` (recurring expense due-date reminders). It's the only type that needs a scheduler, which doesn't exist yet. The table and API below reserve room for it (the enum value and `dedupe_key` column stay) so adding it later needs no migration — see [Deferred: recurring_due](#deferred-recurring_due).

---

## Current State

- **No invitation/acceptance flow.** `AddUserToGroup` (`http/routes/group/group.go:224`) adds a user to a group directly. "Being invited to a new group" therefore means "you were added to a group" — fire the notification at the end of that handler. (The creator's own membership, inserted in `CreateExpenseGroup` at `group.go:98`, must **not** generate a self-notification.)
- **No scheduler exists.** The only goroutine in `main.go:126` is the HTTP server. `recurring_expenses` has a `next_occurrence TEXT` column (`db/schema/001_init.sql:101`) but nothing reads it. This is why `recurring_due` is deferred — there's no trigger to hang it off without building scheduler infrastructure.
- **Expense participants** live in two tables: `expense_payers` (`001_init.sql:58`) and `expense_beneficiaries` (`001_init.sql:68`). A `CreateExpense` request carries `PayerId` + `BeneficiariesIds` (`http/routes/expense/expense.go:75`). Recipients = `{PayerId} ∪ BeneficiariesIds`.
- **Transfers** carry `sender_id` / `receiver_id` (`001_init.sql:80`).
- **Connect RPC + sqlc + Goose** are the established patterns. Timestamps are `overrides.TextTime` stored as RFC3339 TEXT, so lexicographic ordering == chronological (same trick used in [[group-sorting-and-pinning]]). IDs are `uuid.NewString()`.
- **Read/write split:** `db.WriteQueries` / `db.ReadQueries`, `db.WriteDB.BeginTx` for transactions.
- **Sidebar footer** renders `<NavUser/>` only (`web/src/components/sidebar/app-sidebar.tsx`, `SidebarFooter`). The notification entry point slots in here, above or beside `NavUser`.
- **UI primitives available:** `popover.tsx`, `badge.tsx`, `button.tsx`, `separator.tsx`, `skeleton.tsx`, `sidebar.tsx` (`SidebarMenuButton`). No bell icon yet — `lucide-react` is already used (`Bell`, `BellDot`).
- **No realtime infra** (no websocket/SSE). Delivery is via TanStack Query polling.
- **i18n is planned but not yet implemented** (no `i18next`, no `locales/`). See [[i18n-implementation]]. Messages are rendered client-side from structured metadata, so when i18n lands the message strings become translation keys with no schema change.

---

## Decision: how to store notification content

**Store a self-contained JSON metadata snapshot, render the message on the frontend.**

Two options:

| Option | Trade-off |
|--------|-----------|
| **A. Store structured refs + metadata snapshot (recommended)** | Columns for `type`, `group_id`, `actor_id`, `reference_id`, plus a `metadata` JSON TEXT blob holding display values (`actorName`, `entityName`, `amount`, `currency`, `groupName`). Self-contained: survives deletion of the underlying expense/transfer, no joins at read time, message text is built client-side (i18n-ready). |
| B. Store refs only, join at read time | Smaller rows, but a deleted expense leaves a dangling notification, and every read fans out into joins across expenses/transfers/users/groups. |

**Recommendation: Option A.** The snapshot is tiny, dismissal is the normal lifecycle anyway, and rendering client-side keeps the message translatable. `group_id` is stored as a first-class column (not just in JSON) because it's the link target and we filter/cascade on it.

---

## Decision: dismiss = delete; "read" tracked separately

- **Unread count** (the badge) is driven by `read_at IS NULL`. Opening the popover marks visible notifications read (clears the badge) without removing them.
- **Dismiss** (the per-item ✕) **hard-deletes** the row. The user explicitly asked for dismissal; there's no audit need, and hard delete keeps the table from growing unbounded.
- A **"Dismiss all"** action clears the list.

(If you'd rather keep a history, switch dismiss to a `dismissed_at` soft-delete and filter it out of the feed — one-column change. Recommending hard delete for simplicity.)

## Decision: feed capped at 50; purge deferred

- The feed query is capped at **50** most-recent notifications (`LIMIT 50`). The badge count is a separate `COUNT(*)` of unread rows and is **not** capped.
- A **periodic purge** of old/read notifications is intentionally **out of scope for v1**. With hard-delete-on-dismiss the table stays small in practice; a background cleanup can be added later (it pairs naturally with the deferred scheduler).

---

## Implementation Steps

### Phase 1: Database

#### 1.1 Migration

**File:** `db/schema/006_notifications.sql` (new)

```sql
-- +goose Up
CREATE TABLE notifications (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,          -- recipient
    type         TEXT NOT NULL,          -- expense_created | transfer_created | group_invite | recurring_due
    group_id     TEXT,                   -- link target (nullable so a deleted group doesn't orphan-block)
    actor_id     TEXT,                   -- who triggered it (nullable for system/recurring)
    reference_id TEXT,                   -- expense/transfer/recurring id
    dedupe_key   TEXT,                   -- e.g. occurrence day for recurring_due; NULL otherwise
    metadata     TEXT NOT NULL DEFAULT '{}', -- JSON snapshot: actorName, entityName, amount, currency, groupName
    created_at   TEXT NOT NULL,
    read_at      TEXT,

    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

-- Idempotency for the recurring sweep (and any future deduped type).
CREATE UNIQUE INDEX idx_notifications_dedupe
    ON notifications (user_id, type, reference_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;

-- +goose Down
DROP TABLE notifications;
```

Note `group_id` FK uses `ON DELETE CASCADE`: deleting a group clears its notifications. `actor_id`/`reference_id` are plain TEXT (no FK) so deleting the source expense doesn't cascade-delete the notification — the JSON snapshot keeps it meaningful.

#### 1.2 Queries

**File:** `db/queries/notifications.sql` (new)

```sql
-- name: CreateNotification :exec
INSERT INTO notifications (id, user_id, type, group_id, actor_id, reference_id, dedupe_key, metadata, created_at)
VALUES (@id, @user_id, @type, @group_id, @actor_id, @reference_id, @dedupe_key, @metadata, @created_at)
ON CONFLICT (user_id, type, reference_id, dedupe_key) DO NOTHING;

-- name: GetNotificationsByUser :many
-- Feed is capped at the 50 most recent (v1).
SELECT * FROM notifications
WHERE user_id = @user_id
ORDER BY created_at DESC
LIMIT 50;

-- name: CountUnreadNotifications :one
SELECT COUNT(*) FROM notifications WHERE user_id = @user_id AND read_at IS NULL;

-- name: MarkAllNotificationsRead :exec
UPDATE notifications SET read_at = @read_at WHERE user_id = @user_id AND read_at IS NULL;

-- name: DismissNotification :exec
DELETE FROM notifications WHERE id = @id AND user_id = @user_id;

-- name: DismissAllNotifications :exec
DELETE FROM notifications WHERE user_id = @user_id;
```

`DismissNotification` includes `user_id` in the WHERE clause so a user can only delete their own rows (authorization in the query, not just the handler).

Run `sqlc generate`.

### Phase 2: Notification creation helper (backend)

Per [[feedback_split_algorithm_files]], keep the fan-out logic in its own package, not inline in the RPC handlers.

**File:** `notify/notify.go` (new package)

A small service with one method per event. Each method computes recipients, builds the metadata snapshot, and bulk-inserts (best-effort: log on error, never fail the originating request — a notification failure must not roll back an expense).

```go
package notify

// EmitExpenseCreated inserts notifications for everyone tied to the expense
// except the actor. Called from the expense handler AFTER the tx commits.
func EmitExpenseCreated(ctx context.Context, actorID, groupID, expenseID string,
    payerID string, beneficiaryIDs []string, name string, amountCents int64, currency string) {

    recipients := dedupe(append([]string{payerID}, beneficiaryIDs...))
    recipients = remove(recipients, actorID)
    // resolve actorName/groupName once, build metadata JSON, loop CreateNotification.
}

func EmitTransferCreated(ctx context.Context, actorID, groupID, transferID,
    senderID, receiverID string, amountCents int64, currency string) { /* recipients = {sender,receiver} \ actor */ }

func EmitGroupInvite(ctx context.Context, actorID, addedUserID, groupID string) { /* recipient = addedUserID */ }
```

Design notes:
- **Call after commit.** In `createExpenseTx` the insert happens in a tx; emit from the outer `CreateExpense` handler once the tx has committed, so we never notify about an expense that rolled back.
- **Best-effort.** Wrap in its own error handling; log via `log.FromContext(ctx)` and move on.
- **Metadata** is `json.Marshal` of a small struct (`actorName`, `entityName`, `amount`, `currency`, `groupName`). Reuse `utils.SliceToJSONString`/`json` as appropriate.
- Helper resolves `actorName` and `groupName` with existing read queries (`GetGroupById`, a user-by-id lookup) — one query each, not per-recipient.

**Wire-in points:**
- `http/routes/expense/expense.go` — `CreateExpense` (after `tx.Commit`) and `BulkCreateExpenses` (one emit per expense, or a batched variant).
- `http/routes/transfer/transfer.go` — `CreateTransfer`.
- `http/routes/group/group.go:224` — `AddUserToGroup`, after the successful insert. **Do not** emit from `CreateExpenseGroup` (creator adding themselves).

**Edits do not notify.** `UpdateExpense` / `UpdateTransfer` deliberately emit nothing in v1 — create-only, to avoid noise. (Adding it later is just a call to the same helper from the update handlers.)

### Phase 3: API (proto + handlers)

**File:** `proto/api/v1/notification.proto` (new)

```proto
syntax = "proto3";
package api.v1;

import "buf/validate/validate.proto";
import "google/protobuf/timestamp.proto";
import "google/protobuf/empty.proto";

enum NotificationType {
  NOTIFICATION_TYPE_UNSPECIFIED = 0;
  NOTIFICATION_TYPE_EXPENSE_CREATED = 1;
  NOTIFICATION_TYPE_TRANSFER_CREATED = 2;
  NOTIFICATION_TYPE_GROUP_INVITE = 3;
  NOTIFICATION_TYPE_RECURRING_DUE = 4; // reserved; not emitted in v1 (see Deferred section)
}

message Notification {
  string id = 1;
  NotificationType type = 2;
  string group_id = 3;           // link target (may be empty)
  string actor_name = 4;
  string entity_name = 5;
  optional double amount = 6;
  optional string currency = 7;
  string group_name = 8;
  google.protobuf.Timestamp created_at = 9;
  bool read = 10;
}

message GetNotificationsRequest {}
message GetNotificationsResponse {
  repeated Notification notifications = 1;
  int32 unread_count = 2;
}

message MarkNotificationsReadRequest {}
message DismissNotificationRequest { string id = 1 [(buf.validate.field).string.uuid = true]; }
message DismissAllNotificationsRequest {}

service NotificationService {
  rpc GetNotifications(GetNotificationsRequest) returns (GetNotificationsResponse) {}
  rpc MarkNotificationsRead(MarkNotificationsReadRequest) returns (google.protobuf.Empty) {}
  rpc DismissNotification(DismissNotificationRequest) returns (google.protobuf.Empty) {}
  rpc DismissAllNotifications(DismissAllNotificationsRequest) returns (google.protobuf.Empty) {}
}
```

The handler flattens the stored `metadata` JSON into the typed `Notification` fields, so the frontend never parses JSON.

**Handler:** `http/routes/notification/notification.go` (new) — standard Connect handlers using `helpers.GetSessionInfo(ctx)` for the recipient; no `group_id` arg needed since the feed is per-user.

**Register:** in `http/router/routes.go` add `apiv1connect.NewNotificationServiceHandler(...)` wrapped with `session.Wrap` (auth required) and add to the grpcreflect reflector list.

Run `just gen`.

### Phase 4: Frontend

**Polling hook** — `web/src/hooks/use-notifications.ts`

- `useQuery(getNotifications, {}, { refetchInterval: 30_000, refetchOnWindowFocus: true })`.
- Mutations for `markNotificationsRead`, `dismissNotification`, `dismissAllNotifications`, each with `onSuccess` → `queryClient.invalidateQueries` per [[feedback_mutate_onsuccess]].
- Optimistic remove on dismiss for snappy UX.

**Component** — `web/src/components/sidebar/nav-notifications.tsx`

- A `SidebarMenuButton` (bell icon) rendered in `SidebarFooter` of `app-sidebar.tsx`, above `<NavUser/>`. Shows a `Badge` with `unread_count` when > 0 (use `BellDot` / a dot indicator).
- Wrapped in a `Popover` (side `right` on desktop, `bottom` on mobile via `useSidebar().isMobile`, mirroring `NavUser`).
- Popover content: header with title + "Dismiss all", a scrollable list, empty state.
- Each row: icon by `type`, message text, relative time, and a ✕ dismiss button (`stopPropagation` so dismissing doesn't navigate). Clicking the row body navigates to the group via `<Link to="/group/$groupId" params={{ groupId }}>` (using `render={<Link/>}` per [[feedback_render_prop]]).
- Opening the popover fires `markNotificationsRead` to clear the badge.

**Message rendering** — `web/src/lib/notification-messages.ts`

- Pure function `(n: Notification) => string` building text per `type` from the typed fields (e.g. `` `${actorName} added "${entityName}"` ``). Plain strings now; swap to i18n keys when [[i18n-implementation]] lands — no other changes needed.
- Currency/amount formatting reuses existing money formatting helpers.

**Styling:** semantic Tailwind utilities and `transition-all` per [[feedback_tailwind_style]]; compose from existing `ui/` primitives per [[feedback_use_shadcn_primitives]].

### Phase 5: Tests

- `notify/` unit tests: recipient computation (actor excluded; dedupe of payer also being a beneficiary), metadata snapshot shape.
- Handler test: `DismissNotification` can't delete another user's notification.
- Feed cap: more than 50 notifications returns only the 50 most recent, while `unread_count` still reflects the true total.
- Frontend type check: `npx tsc -b --noEmit` (empty output = pass, don't retry per [[feedback_no_retry_typecheck]]); `npm run lint`.

---

## File Change Summary

**New:**
- `db/schema/006_notifications.sql`
- `db/queries/notifications.sql`
- `notify/notify.go` (+ tests)
- `proto/api/v1/notification.proto`
- `http/routes/notification/notification.go`
- `web/src/hooks/use-notifications.ts`
- `web/src/components/sidebar/nav-notifications.tsx`
- `web/src/lib/notification-messages.ts`

**Modified:**
- `http/routes/expense/expense.go` (emit on create / bulk-create)
- `http/routes/transfer/transfer.go` (emit on create)
- `http/routes/group/group.go` (emit on `AddUserToGroup`)
- `http/router/routes.go` (register service + reflector)
- `web/src/components/sidebar/app-sidebar.tsx` (mount `<NavNotifications/>`)

---

## Deferred: `recurring_due`

Out of scope for v1, recorded here so the follow-up is cheap. It's the only type with no existing trigger — nothing scans `recurring_expenses.next_occurrence`. Adding it needs **no migration** (the `NOTIFICATION_TYPE_RECURRING_DUE` enum value and the `dedupe_key` column + partial unique index are already in place). When picked up:

- A background ticker goroutine (started from `main.go`, cancelable on shutdown, gated behind a config flag) sweeps for occurrences within a lead window and emits one notification per group member.
- Idempotency: `dedupe_key = next_occurrence` truncated to the day, with `INSERT ... ON CONFLICT DO NOTHING`, so re-runs and restarts are harmless.
- Open sub-questions for then: notify all members or only the template `payer_id`; tick interval and lead window; re-notify each occurrence vs. once per template.

A **periodic purge** of old/read notifications belongs to the same follow-up — it pairs naturally with the scheduler.

---

## Resolved Decisions

- **Delivery: polling.** TanStack Query `refetchInterval` (30s) + refetch on window focus. No realtime infra is added in v1; SSE/websocket is a possible later enhancement.
- **Mark-read: on popover open.** Opening the popover fires `MarkNotificationsRead`, clearing the badge for everything currently in the feed (no per-item read tracking).
