# Group Sorting by Recent Activity & Pinning

## Overview

Four related changes to how groups are ordered and surfaced:

1. **Sort the groups list by recent activity** — the group with the most recent expense/transfer floats to the top.
2. **Pinning** — a per-user toggle that lifts a group above the rest. (Sorting *within* the pinned section is the open question — see [Decision: how to sort pinned groups](#decision-how-to-sort-pinned-groups).)
3. **Star indicator** — pinned groups show a star in the sidebar.
4. **Pin/Unpin action** — available in the menu on the group page (and the sidebar's per-group menu).

Both the sidebar (`NavGroups`) and the dashboard read the same `GetUserGroups` RPC, so doing the sort **server-side** means both views get the ordering and the pin state for free.

## Current State

- **`GetUserGroups`** (`http/routes/group/group.go:308`) calls `GetGroupsByUserId` and returns groups in arbitrary DB order. No sort, no pin concept.
- **`GetGroupsByUserId`** (`db/queries/groups.sql:49`) is a `LEFT JOIN` of `expense_groups` + `user_expense_groups` filtered by `user_id`. Generated row: `GetGroupsByUserIdRow` with `ID`, `CreatedAt`, `Name`, `Description`, `DefaultCurrency`, `ImageUpdatedAt`, `UserID`, `GroupID`, `AddedAt`, `Weight`.
- **`user_expense_groups`** is the natural home for a per-user pin flag (it already carries per-user/per-group `weight` and `added_at`).
- **Timestamps** are stored as TEXT in `time.RFC3339` (`db/overrides/text_time.go`). All written by the same server clock, so lexicographic string comparison == chronological order.
- **`UserGroup`** proto (`proto/api/v1/group.proto:68`) has fields 1–9; field 9 is `image_updated_at`.
- **Sidebar** `NavGroups` (`web/src/components/sidebar/nav-groups.tsx`) already renders a per-group `DropdownMenu` with a "Delete Group" item — the pin/unpin item slots in here.
- **Group page** menu lives in `GroupHeader` (`web/src/components/group/group-header.tsx`), a dropdown with Edit/Photo/Invite/Delete items.
- **Mutations** follow `mutate` + `onSuccess`/`onError` with `queryClient.invalidateQueries` (see `web/src/hooks/use-group-mutations.ts`).

---

## Decision: how to sort pinned groups

The user asked for a suggestion here. Options:

| Option | Behavior | Trade-off |
|--------|----------|-----------|
| **A. Same recent-activity sort (recommended)** | Pinned groups sit in their own block at the top, ordered by recent activity exactly like the unpinned block. | One mental model. A pinned group still moves within the pinned block as it gets activity — but it never leaves the top. |
| B. By pin time (`pinned_at DESC`) | Most recently pinned first; order is stable regardless of activity. | A second ordering rule to reason about; stale pins sink. |
| C. Alphabetical | Predictable, never moves. | Ignores activity entirely; inconsistent with the unpinned block. |
| D. Manual drag-reorder | Full control. | Much more work (ordering column + drag UI); out of scope. |

**Recommendation: Option A.** Pinning simply means "always keep this at the top"; within that constraint the familiar recent-activity ordering is the least surprising. We still store `pinned_at` (needed anyway to represent the pin), so switching to Option B later is a one-line `ORDER BY` change with no schema change.

> This is the one open design question. The plan below implements Option A; flag if you'd prefer B.

### What counts as "recent activity"?

`last_activity_at = MAX(group.created_at, latest expense.created_at, latest transfer.created_at)`.

- Uses `created_at` (when the record was *entered*), not `date` (the user-chosen expense date), so back-dating an old expense doesn't bury an active group. `date` is the alternative if "activity" should mean the event date instead.
- Falls back to the group's own `created_at` so a brand-new empty group sorts to the top of its block rather than the bottom.

---

## Implementation Steps

### Phase 1: Database

#### 1.1 Migration

**File:** `db/schema/005_group_pin.sql` (new)

```sql
-- +goose Up
ALTER TABLE user_expense_groups ADD COLUMN pinned_at TEXT;

-- +goose Down
ALTER TABLE user_expense_groups DROP COLUMN pinned_at;
```

`pinned_at` nullable: `NULL` = not pinned; a timestamp = pinned (and records when).

#### 1.2 Sorted + pin-aware list query

**File:** `db/queries/groups.sql` — rewrite `GetGroupsByUserId`

```sql
-- name: GetGroupsByUserId :many
SELECT
  g.id,
  g.created_at,
  g.created_by,
  g.name,
  g.default_currency,
  g.description,
  g.image_updated_at,
  u.user_id,
  u.weight,
  u.pinned_at,
  MAX(
    g.created_at,
    COALESCE((SELECT MAX(e.created_at) FROM expenses e   WHERE e.group_id = g.id), g.created_at),
    COALESCE((SELECT MAX(t.created_at) FROM transfers t WHERE t.group_id = g.id), g.created_at)
  ) AS last_activity_at
FROM expense_groups g
JOIN user_expense_groups u ON u.group_id = g.id
WHERE u.user_id = @user_id
ORDER BY
  (u.pinned_at IS NOT NULL) DESC,  -- pinned block first
  last_activity_at DESC;           -- recent activity within each block
```

Notes:
- Switched the implicit `LEFT JOIN` (it was already filtered to an inner join by the `WHERE u.user_id`) to an explicit `JOIN` so `user_id`/`weight`/`pinned_at` come back non-null where appropriate.
- Explicit column list (instead of `SELECT *`) drops the now-redundant `u.group_id` (we have `g.id`) and `u.added_at`, and gives stable generated field names.
- `MAX(a, b, c)` is SQLite's scalar max; correct on RFC3339 TEXT given consistent timezone (all server-written).
- Correlated subqueries are fine for the group counts we have; if the list grows large, add indexes `expenses(group_id, created_at)` and `transfers(group_id, created_at)`.

#### 1.3 Pin toggle query

**File:** `db/queries/groups.sql` (append)

```sql
-- name: SetGroupPinned :exec
UPDATE user_expense_groups
SET pinned_at = @pinned_at
WHERE user_id = @user_id AND group_id = @group_id;
```

Handler passes `pinned_at = now` to pin, `NULL` (via `overrides.NullTextTime{Valid:false}`) to unpin.

#### 1.4 Regenerate

```bash
sqlc generate
```

The new `GetGroupsByUserIdRow` will have fields: `ID`, `CreatedAt`, `CreatedBy`, `Name`, `DefaultCurrency`, `Description`, `ImageUpdatedAt`, `UserID`, `Weight`, `PinnedAt` (`overrides.NullTextTime`), `LastActivityAt`.

---

### Phase 2: Backend (proto + handler)

#### 2.1 Proto: pin field + RPC

**File:** `proto/api/v1/group.proto`

Add to `UserGroup` (next free field number is 10):

```protobuf
message UserGroup {
  // ... existing fields 1–9 ...
  bool pinned = 10;
}
```

Add request + RPC:

```protobuf
message SetGroupPinnedRequest {
  string group_id = 1 [(buf.validate.field).string.uuid = true];
  bool pinned = 2;
}

service GroupService {
  // ... existing ...
  rpc SetGroupPinned(SetGroupPinnedRequest) returns (google.protobuf.Empty) {}
}
```

```bash
buf generate   # or: just gen
```

#### 2.2 Handler: surface `pinned`

**File:** `http/routes/group/group.go` — `GetUserGroups`

The query now returns sorted rows, so the loop order is already correct. Two adjustments inside the loop:
- Group id is now `v.ID` (string) instead of `*v.GroupID`; user id is `v.UserID`. Update the references (`GetGroupMembers(ctx, v.ID)`, etc.).
- Set the new field: `pbGroups[i].Pinned = v.PinnedAt.Valid`.

Remove the now-unused pointer derefs for group id.

#### 2.3 Handler: `SetGroupPinned`

**File:** `http/routes/group/group.go` (new method)

```go
func (s *GroupService) SetGroupPinned(ctx context.Context, r *apiv1.SetGroupPinnedRequest) (*emptypb.Empty, error) {
    logger := log.FromContext(ctx)
    session := helpers.GetSessionInfo(ctx)

    pinnedAt := overrides.NullTextTime{Valid: false}
    if r.Pinned {
        pinnedAt = overrides.NullTextTime{Time: time.Now(), Valid: true}
    }

    if err := db.WriteQueries.SetGroupPinned(ctx, database.SetGroupPinnedParams{
        UserID:   session.UserID,
        GroupID:  r.GroupId,
        PinnedAt: pinnedAt,
    }); err != nil {
        logger.Error("failed to set group pinned", "error", err, "group_id", r.GroupId)
        return nil, connect.NewError(connect.CodeInternal, err)
    }
    return &emptypb.Empty{}, nil
}
```

The `UPDATE`'s `WHERE user_id = session` scopes the change to the caller's membership row — a non-member's update simply affects zero rows, so no extra membership check is required (mirror the existing handlers if you want an explicit `IsUserInGroup` guard for symmetry).

The service auto-registers via the generated interface; no change to `http/router/routes.go`.

---

### Phase 3: Frontend

#### 3.1 Pin mutation hook

**File:** `web/src/hooks/use-group-mutations.ts` (extend) — or a small dedicated hook

```ts
const { mutate: setPinnedMutate } = useMutation(setGroupPinned, {
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: userGroupsKey });
  },
  onError: handleError,
});
```

Expose `setGroupPinned: (groupId: string, pinned: boolean) => setPinnedMutate({ groupId, pinned })`.

`setGroupPinned` is the generated Connect Query method from `group-GroupService_connectquery`. Use `mutate` + callbacks (project convention), not `mutateAsync`. Invalidating `getUserGroups` re-fetches the now-resorted list, so the group visually jumps into the pinned block and the star appears. (Optimistic update is a possible later enhancement; invalidate is consistent with the existing delete mutations and simpler.)

#### 3.2 Sidebar: star + pin/unpin menu item

**File:** `web/src/components/sidebar/nav-groups.tsx`

- Import `Star`, `StarOff` from `lucide-react`.
- Render a star next to the name of pinned groups:

```tsx
<strong className="flex items-center gap-1.5">
  {item.pinned && <Star className="size-3.5 fill-current text-money" />}
  {item.groupName}
</strong>
```

- Add a pin/unpin item to the existing per-group `DropdownMenuContent` (above the destructive Delete item, with a separator):

```tsx
<DropdownMenuItem onClick={() => groupMutations.setGroupPinned(item.groupId, !item.pinned)}>
  {item.pinned ? <StarOff /> : <Star />}
  <span>{item.pinned ? "Unpin Group" : "Pin Group"}</span>
</DropdownMenuItem>
```

`NavGroups` isn't currently scoped to one group, so call the mutation hook once at component level (it isn't group-specific for the invalidate key) and pass `item.groupId` per row.

#### 3.3 Group page menu: pin/unpin item

**File:** `web/src/components/group/group-header.tsx`

- Add props `isPinned: boolean` and `onTogglePin: () => void`.
- Add a `DropdownMenuItem` in the second `DropdownMenuGroup` (next to Edit/Invite), e.g. above the destructive Delete item:

```tsx
<DropdownMenuItem onClick={onTogglePin}>
  {isPinned ? <StarOff /> : <Star />}
  {isPinned ? "Unpin Group" : "Pin Group"}
</DropdownMenuItem>
```

**File:** `web/src/routes/_pathlessLayout/group/$groupId.tsx`

- Pull the mutation from the hook (`const { setGroupPinned } = useGroupMutations(groupId)` or dedicated hook).
- Wire `GroupHeader`:

```tsx
isPinned={groupInfo.pinned}
onTogglePin={() => setGroupPinned(groupId, !groupInfo.pinned)}
```

#### 3.4 Dashboard (free win, optional polish)

**File:** `web/src/routes/_pathlessLayout/dashboard.tsx` — already maps `groupsData.groups` in order, so pinned-first + recent-activity ordering applies automatically. *Optional:* show a star badge on `ExpenseGroupCard` for `group.pinned` to match the sidebar (add a `pinned` prop to `expense-group-card.tsx`). Not required by the request.

---

### Phase 4: Tests

#### 4.1 Backend — `http/routes/group/group_test.go`

- **Ordering:** group with a newer expense `created_at` sorts before one with an older transfer; a group with no activity sorts by its `created_at`.
- **Pinned-first:** a pinned group with old activity still sorts above an unpinned group with new activity.
- **Within pinned block:** two pinned groups order by recent activity (Option A).
- **`SetGroupPinned`:** pin sets `pinned_at` and flips `UserGroup.pinned` to true on the next `GetUserGroups`; unpin clears it. Pin state is per-user (pinning as user A doesn't change user B's view).
- **Tie-break sanity:** equal `last_activity_at` produces a deterministic (stable) order.

#### 4.2 Frontend

- `NavGroups`: renders the star only for `pinned` groups; menu item label toggles "Pin"/"Unpin" and calls the mutation with the negated flag.
- `GroupHeader`: shows "Pin Group" vs "Unpin Group" from `isPinned`; clicking fires `onTogglePin`.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `db/schema/005_group_pin.sql` | Create | Add nullable `pinned_at` to `user_expense_groups` |
| `db/queries/groups.sql` | Modify | Rewrite `GetGroupsByUserId` (sort + `pinned_at` + `last_activity_at`); add `SetGroupPinned` |
| `proto/api/v1/group.proto` | Modify | `UserGroup.pinned` (field 10); `SetGroupPinnedRequest` + `SetGroupPinned` RPC |
| `http/routes/group/group.go` | Modify | Surface `pinned` in `GetUserGroups`; implement `SetGroupPinned`; adjust to new row field names |
| `web/src/hooks/use-group-mutations.ts` | Modify | Add `setGroupPinned` mutation (invalidate `getUserGroups`) |
| `web/src/components/sidebar/nav-groups.tsx` | Modify | Star on pinned groups; pin/unpin menu item |
| `web/src/components/group/group-header.tsx` | Modify | `isPinned`/`onTogglePin` props + pin/unpin menu item |
| `web/src/routes/_pathlessLayout/group/$groupId.tsx` | Modify | Wire pin toggle into `GroupHeader` |
| `web/src/components/expense-group-card.tsx` | Optional | Star badge on pinned cards (dashboard parity) |
| `group_test.go` / FE tests | Create/Modify | Ordering, pinned-first, per-user pin, menu toggles |

## Considerations

- **Per-user, not per-group:** pin lives on `user_expense_groups`, so each member pins independently. Correct — a pin is a personal preference.
- **Timezone assumption:** lexicographic TEXT comparison of RFC3339 timestamps is only chronological if offsets are consistent. They are (all server-written), but if mixed offsets ever appear, wrap comparisons in SQLite `datetime(...)`.
- **Performance:** the two correlated subqueries run per group per `GetUserGroups` call. Group counts are small today; add `expenses(group_id, created_at)` / `transfers(group_id, created_at)` indexes if this becomes hot. `GetUserGroups` already does several per-group queries (members, expenses, transfers, spending), so this is not a new pattern.
- **Sort drift:** with Option A, a pinned group reorders within the pinned block as activity arrives. If users find that disorienting, switch the `ORDER BY` tail to `pinned_at DESC` for the pinned block (Option B) — schema already supports it.
