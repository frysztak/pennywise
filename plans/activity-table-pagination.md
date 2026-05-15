# Activity Table: Pagination & Filtering Implementation Plan

## Overview

Implement cursor-based pagination and filtering for the group activity feed. The desktop view uses shadcn's Data Table (built on TanStack Table + Base UI primitives); the mobile view continues to use `ActivityCards`. Both views share the same paginated data source and pagination controls.

## Current State

- **Frontend**:
  - `activity-section.tsx` renders `ActivityTable` on `md+` and `ActivityCards` on mobile (`md:hidden`)
  - No pagination, no filtering
- **Backend**: `GetGroupActivity` returns all expenses and transfers, sorted in-memory
- **Dependencies**: TanStack Table not installed; `ui/table.tsx` exists; UI components compose via Base UI's `render={}` prop

## Architecture Decisions

### Cursor-Based Pagination with Bidirectional Navigation

We keep cursor-based pagination on the server (stable, efficient on large datasets) but expose **prev/next + page numbers + total items** in the UI. We reconcile these by:

- Server returns: `items`, `next_cursor`, `total_count` (filtered)
- Client maintains a **cursor stack** for prev navigation (`[c0=null, c1, c2, ...]`); `Prev` pops, `Next` pushes `next_cursor`
- "Page X of Y" is derived from `floor(total_count / limit) + 1` and the stack depth
- Cursor = base64-encoded JSON of `{ date, createdAt, id }` (composite for stable ordering)

### Generic Pagination Proto

Define a reusable `PageRequest`/`PageResponse` pair under `proto/api/v1/pagination.proto` so future paginated endpoints can adopt the same wire format.

### shadcn Data Table (Base UI)

The project already uses shadcn primitives with Base UI's `render={}` composition pattern (see `feedback_render_prop.md` / `feedback_use_shadcn_primitives.md`). Install TanStack Table and add `ui/data-table.tsx` consistent with these conventions. Mobile keeps `ActivityCards`; both views are driven by the same paginated query result.

---

## Implementation Steps

### Phase 1: Backend

#### 1.1 Generic pagination proto

**File:** `proto/api/v1/pagination.proto` (new)

```protobuf
syntax = "proto3";

package api.v1;

import "buf/validate/validate.proto";

// Reusable cursor-based pagination request.
// Embed as `PageRequest page = N;` in any list RPC.
message PageRequest {
  // Page size. Server clamps to [1, 100]; defaults to 20 when zero.
  int32 limit = 1 [(buf.validate.field).int32 = { gte: 0, lte: 100 }];

  // Opaque cursor returned by a previous PageResponse. Empty/unset = first page.
  optional string cursor = 2;
}

// Reusable cursor-based pagination response.
// Embed as `PageResponse page = N;` in any list RPC response.
message PageResponse {
  // Cursor to fetch the next page. Unset when there is no next page.
  optional string next_cursor = 1;

  // Total number of items matching the (filtered) query, across all pages.
  // Used by clients to render "X items" / "Page X of Y".
  int64 total_count = 2;
}
```

#### 1.2 Activity request/response

**File:** `proto/api/v1/group.proto`

Modify `GetGroupActivityRequest` / `GetGroupActivityResponse`:

```protobuf
import "api/v1/pagination.proto";

enum ActivityTypeFilter {
  ACTIVITY_TYPE_FILTER_UNSPECIFIED = 0; // All types
  ACTIVITY_TYPE_FILTER_EXPENSE = 1;
  ACTIVITY_TYPE_FILTER_TRANSFER = 2;
}

message GetGroupActivityRequest {
  string group_id = 1 [(buf.validate.field).string.uuid = true];
  PageRequest page = 2;

  // Filters (all optional; unset = no filter on that dimension)
  ActivityTypeFilter type_filter = 3;
  optional string currency_filter = 4;
  optional string member_filter = 5; // payer/sender/receiver user_id
}

message GetGroupActivityResponse {
  repeated ActivityItem items = 1;
  PageResponse page = 2;

  // (ActivityItem message unchanged)
}
```

#### 1.3 Paginated SQL queries

**File:** `db/queries/activity.sql` (new)

Two queries — one for the page, one for the filtered count.

```sql
-- name: GetGroupActivityPaginated :many
WITH activity AS (
  SELECT
    e.id,
    'expense' AS type,
    e.date,
    e.created_at,
    e.name AS description,
    e.currency,
    p.amount,
    p.user_id AS actor_id,
    u.username AS actor_name,
    NULL AS receiver_id,
    NULL AS receiver_name,
    json_group_array(b.user_id) AS beneficiaries_ids,
    e.recurring_id
  FROM expenses e
  INNER JOIN expense_payers p ON p.expense_id = e.id
  INNER JOIN users u ON u.id = p.user_id
  INNER JOIN expense_beneficiaries b ON b.expense_id = e.id
  WHERE e.group_id = @group_id
    AND (@type_filter = '' OR @type_filter = 'expense')
    AND (@currency_filter = '' OR e.currency = @currency_filter)
    AND (@member_filter = '' OR p.user_id = @member_filter OR b.user_id = @member_filter)
  GROUP BY e.id

  UNION ALL

  SELECT
    t.id,
    'transfer' AS type,
    t.date,
    t.created_at,
    'Transfer' AS description,
    t.currency,
    t.amount,
    t.sender_id AS actor_id,
    s.username AS actor_name,
    t.receiver_id,
    r.username AS receiver_name,
    NULL AS beneficiaries_ids,
    NULL AS recurring_id
  FROM transfers t
  JOIN users s ON s.id = t.sender_id
  JOIN users r ON r.id = t.receiver_id
  WHERE t.group_id = @group_id
    AND (@type_filter = '' OR @type_filter = 'transfer')
    AND (@currency_filter = '' OR t.currency = @currency_filter)
    AND (@member_filter = '' OR t.sender_id = @member_filter OR t.receiver_id = @member_filter)
)
SELECT * FROM activity
WHERE (
  @cursor_date = '' OR
  date < @cursor_date OR
  (date = @cursor_date AND created_at < @cursor_created_at) OR
  (date = @cursor_date AND created_at = @cursor_created_at AND id < @cursor_id)
)
ORDER BY date DESC, created_at DESC, id DESC
LIMIT @limit;

-- name: GetGroupActivityCount :one
SELECT COUNT(*) AS total FROM (
  SELECT e.id FROM expenses e
  INNER JOIN expense_payers p ON p.expense_id = e.id
  INNER JOIN expense_beneficiaries b ON b.expense_id = e.id
  WHERE e.group_id = @group_id
    AND (@type_filter = '' OR @type_filter = 'expense')
    AND (@currency_filter = '' OR e.currency = @currency_filter)
    AND (@member_filter = '' OR p.user_id = @member_filter OR b.user_id = @member_filter)
  GROUP BY e.id

  UNION ALL

  SELECT t.id FROM transfers t
  WHERE t.group_id = @group_id
    AND (@type_filter = '' OR @type_filter = 'transfer')
    AND (@currency_filter = '' OR t.currency = @currency_filter)
    AND (@member_filter = '' OR t.sender_id = @member_filter OR t.receiver_id = @member_filter)
);
```

#### 1.4 Handler update

**File:** `http/routes/group/group.go`

Update `GetGroupActivity` to:
1. Read `req.Msg.Page` (limit, cursor); apply defaults/clamps (`limit=20` when 0)
2. Base64-decode the cursor → `activityCursor{Date, CreatedAt, ID}`
3. Run the paginated query with `limit + 1` to detect "has next"
4. Run the count query (same filters, no cursor) in parallel
5. Build `next_cursor` from the last returned item if `has_next`
6. Return `{ items, page: { next_cursor, total_count } }`

```go
type activityCursor struct {
    Date      string `json:"date"`
    CreatedAt string `json:"createdAt"`
    ID        string `json:"id"`
}
```

Encode/decode via `encoding/base64` + `encoding/json`. Reject malformed cursors with `connect.CodeInvalidArgument`.

---

### Phase 2: Frontend

#### 2.1 Dependency

```bash
cd web && npm install @tanstack/react-table
```

#### 2.2 Shared DataTable primitive

**File:** `web/src/components/ui/data-table.tsx` (new)

Generic, headless wrapper around TanStack Table + the existing `ui/table.tsx` primitives. Composition follows Base UI's `render={}` pattern; no `asChild`.

```tsx
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "./table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage?: React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns, data, emptyMessage,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const rows = table.getRowModel().rows;

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((h) => (
              <TableHead key={h.id}>
                {flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
              {emptyMessage ?? "No results."}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
```

#### 2.3 Activity column definitions

**File:** `web/src/components/group/activity-columns.tsx` (new)

Move the per-row rendering logic out of `activity-table.tsx` into `ColumnDef<ActivityItem>[]`. Cell renderers receive callbacks (`onEditExpense`, `onDeleteExpense`, …) via column meta or by exporting a `makeActivityColumns(callbacks)` factory — factory is simpler and avoids leaking callbacks through `table.options.meta`.

```tsx
export function makeActivityColumns(callbacks: ActivityCallbacks): ColumnDef<ActivityItem>[]
```

#### 2.4 Cursor stack hook

**File:** `web/src/hooks/use-cursor-pagination.ts` (new)

Encapsulates the prev/next cursor stack so the server stays cursor-based while the UI gets bidirectional navigation.

```tsx
export function useCursorPagination(opts: { limit: number; totalCount: number }) {
  const [stack, setStack] = useState<(string | undefined)[]>([undefined]);
  const cursor = stack[stack.length - 1];
  const pageIndex = stack.length - 1;
  const totalPages = Math.max(1, Math.ceil(opts.totalCount / opts.limit));

  return {
    cursor,
    pageIndex,
    totalPages,
    canPrev: stack.length > 1,
    canNext: pageIndex + 1 < totalPages,
    next: (nextCursor: string | undefined) =>
      nextCursor && setStack((s) => [...s, nextCursor]),
    prev: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    reset: () => setStack([undefined]),
  };
}
```

Reset is called whenever filters change (so we always land on page 1 for a new filter set).

#### 2.5 Filter controls

**File:** `web/src/components/group/activity-filters.tsx` (new)

Three selects (Type / Currency / Member), built on existing shadcn `select` / `combobox` primitives. Compact layout that wraps on narrow widths so it works in both the desktop section and above the mobile cards.

```tsx
interface ActivityFiltersProps {
  typeFilter: ActivityTypeFilter;
  currencyFilter?: string;
  memberFilter?: string;
  currencies: string[];
  members: { id: string; name: string }[];
  onChange: (next: Partial<ActivityFiltersState>) => void;
}
```

Currency labels follow the existing rule: ISO code only (per `feedback_currency_labels.md`).

#### 2.6 Pagination controls

**File:** `web/src/components/group/activity-pagination.tsx` (new)

Single component used for both desktop and mobile. Shows:
- Left: `"{from}–{to} of {totalCount} items"` (e.g. `"21–40 of 137 items"`)
- Right: `[Prev] Page X of Y [Next]`

```tsx
interface ActivityPaginationProps {
  pageIndex: number;     // 0-based
  totalPages: number;
  totalCount: number;
  limit: number;
  itemsOnPage: number;   // rows actually rendered (last page may be short)
  canPrev: boolean;
  canNext: boolean;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
}
```

`from = pageIndex * limit + 1`, `to = pageIndex * limit + itemsOnPage`. Both buttons are disabled while `isLoading` to prevent double-clicks. Buttons use shadcn `Button` with the Base UI `render={}` pattern where needed (e.g. wrapping icons).

#### 2.7 `ActivitySection` orchestration

**File:** `web/src/components/group/activity-section.tsx`

The section owns:
- Filter state (`useState<ActivityFiltersState>`)
- Cursor stack (`useCursorPagination`)
- Single paginated query — feeding **both** `ActivityTable` (desktop) and `ActivityCards` (mobile)

```tsx
const [filters, setFilters] = useState<ActivityFiltersState>({});
const limit = 20;

// First fetch: no cursor → response includes totalCount.
// Subsequent fetches: cursor present; totalCount still returned (cheap COUNT)
// so the hook can keep totalPages fresh.
const { data, isFetching } = useQuery(getGroupActivity, {
  groupId,
  page: { limit, cursor },
  typeFilter: filters.typeFilter,
  currencyFilter: filters.currencyFilter,
  memberFilter: filters.memberFilter,
});

const totalCount = Number(data?.page?.totalCount ?? 0n);
const pager = useCursorPagination({ limit, totalCount });

useEffect(() => { pager.reset(); }, [filters]);

const items = transformItems(data?.items ?? []);

return (
  <div className="flex flex-col gap-4">
    <ActivityFilters {...filters} onChange={(p) => setFilters((f) => ({ ...f, ...p }))} />

    <div className="hidden md:block">
      <ActivityTable recentActivity={items} {...callbacks} />
    </div>
    <div className="md:hidden">
      <ActivityCards recentActivity={items} {...callbacks} />
    </div>

    <ActivityPagination
      pageIndex={pager.pageIndex}
      totalPages={pager.totalPages}
      totalCount={totalCount}
      limit={limit}
      itemsOnPage={items.length}
      canPrev={pager.canPrev}
      canNext={pager.canNext}
      isLoading={isFetching}
      onPrev={pager.prev}
      onNext={() => pager.next(data?.page?.nextCursor)}
    />
  </div>
);
```

Note: `useSuspenseQuery` is replaced with `useQuery` because `isFetching` is needed to disable the pagination buttons during page transitions. Empty state moves into `DataTable.emptyMessage` for desktop and a conditional render for mobile.

#### 2.8 Convert `ActivityTable` to use `DataTable`

**File:** `web/src/components/group/activity-table.tsx`

Replace the manual `<table>` JSX with `<DataTable columns={makeActivityColumns(callbacks)} data={recentActivity} />`. Cell components (description, amount, details, actions) move into `activity-columns.tsx` unchanged.

`ActivityCards` is **not** changed structurally — it continues to render the same `recentActivity` array, which is now just shorter (one page).

---

### Phase 3: Code generation

```bash
just gen  # buf generate + sqlc generate
```

Add `proto/api/v1/pagination.proto` to whatever buf module config aggregates the v1 protos (no action needed if the config globs the directory).

---

### Phase 4: Tests

#### 4.1 Backend — `http/routes/group/group_test.go`

- **Cursor codec**: round-trip encode/decode; malformed base64 / malformed JSON → `CodeInvalidArgument`
- **First page**: `limit=20`, no cursor → returns ≤20 items, `next_cursor` set iff more, `total_count` matches filtered count
- **Subsequent pages**: feeding `next_cursor` returns items strictly older than the last item of the previous page; no duplicates across page boundaries
- **Last page**: returns `< limit` items, `next_cursor` unset
- **Exact boundary**: total items == `limit` → one full page, `next_cursor` unset
- **Filters**:
  - `type_filter=EXPENSE` excludes transfers and vice versa
  - `currency_filter` excludes other currencies
  - `member_filter` matches payer, beneficiary, sender, and receiver
  - Combined filters AND together
  - `total_count` reflects filters
- **Stable ordering under ties**: two items with identical `(date, created_at)` are disambiguated by `id` — fabricate the tie and assert deterministic ordering across pages
- **Limit clamping**: `limit=0` defaults to 20; `limit=101` rejected by buf.validate

#### 4.2 Frontend

- **`useCursorPagination`** (`web/src/hooks/use-cursor-pagination.test.ts`):
  - Initial state: `pageIndex=0`, `canPrev=false`
  - `next("c1")` pushes cursor → `pageIndex=1`, `canPrev=true`
  - `prev()` pops → returns to previous cursor
  - `next(undefined)` is a no-op
  - `reset()` returns to initial state regardless of depth
  - `totalPages` reflects `ceil(totalCount / limit)`, min 1

- **`ActivityPagination`** (`web/src/components/group/activity-pagination.test.tsx`):
  - Renders `"21–40 of 137 items"` and `"Page 2 of 7"` for `pageIndex=1, limit=20, itemsOnPage=20, totalCount=137`
  - Renders `"1–13 of 13 items"` and `"Page 1 of 1"` for a short single page
  - Prev disabled when `!canPrev`; Next disabled when `!canNext`; both disabled when `isLoading`
  - Click handlers fire `onPrev` / `onNext`

- **`ActivitySection`** (`web/src/components/group/activity-section.test.tsx`):
  - Renders the table on desktop viewport, cards on mobile (assert by query for both containers; CSS visibility is class-driven, so assert classnames or use jsdom matchMedia stub)
  - Clicking Next refetches with the returned `cursor` and updates the rows
  - Changing a filter resets the cursor stack (next request goes out with `cursor=undefined`) and re-renders page 1
  - Loading state disables pagination buttons

Use the existing test setup (vitest + RTL). Mock the Connect Query hook with a small stub that returns scripted page responses.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `proto/api/v1/pagination.proto` | Create | Generic `PageRequest` / `PageResponse` |
| `proto/api/v1/group.proto` | Modify | Embed `PageRequest`/`PageResponse`; add filter fields & enum |
| `db/queries/activity.sql` | Create | Paginated + count queries with filters |
| `http/routes/group/group.go` | Modify | Cursor codec, paginated handler, filter wiring |
| `http/routes/group/group_test.go` | Modify | Pagination + filter tests |
| `web/package.json` | Modify | Add `@tanstack/react-table` |
| `web/src/components/ui/data-table.tsx` | Create | Generic shadcn DataTable wrapper |
| `web/src/components/group/activity-columns.tsx` | Create | `makeActivityColumns(callbacks)` factory |
| `web/src/components/group/activity-filters.tsx` | Create | Type/Currency/Member filter controls |
| `web/src/components/group/activity-pagination.tsx` | Create | Prev/Next + "X–Y of N items" / "Page X of Y" |
| `web/src/hooks/use-cursor-pagination.ts` | Create | Cursor stack hook |
| `web/src/components/group/activity-section.tsx` | Modify | Wire query + filters + pagination; keep desktop/mobile split |
| `web/src/components/group/activity-table.tsx` | Modify | Render via `DataTable` |
| `web/src/components/group/activity-cards.tsx` | Unchanged | Receives the same paged `recentActivity` |
| `web/src/hooks/use-cursor-pagination.test.ts` | Create | Hook unit tests |
| `web/src/components/group/activity-pagination.test.tsx` | Create | Component tests |
| `web/src/components/group/activity-section.test.tsx` | Create | Integration tests |

---

## Considerations

### UX

- `Prev` is only enabled when the cursor stack has depth > 1 — the user cannot navigate backward across a filter change (the stack resets), which is the correct behavior since the page index space is filter-dependent.
- "Page X of Y" can drift mid-session if new items are inserted/deleted by other users between fetches. This is acceptable for cursor-based pagination; the cursor still guarantees no duplicates/skips for forward traversal.
- Mobile users see the same pagination controls below the cards.

### Performance

- The COUNT query runs on every page fetch. For very large groups this is cheap on SQLite with the right indexes; if it becomes a hot spot, we can return `total_count` only on the first page (cursor unset) and have the client cache it until filters change.
- Default `limit=20` keeps the rendered DOM small on mobile.

### Future enhancements

- Date-range filter
- Search by expense name
- URL-persisted filters/page
- Sort direction toggle
