# Activity Table: Pagination & Filtering Implementation Plan

## Overview

Implement cursor-based pagination and filtering for the activity table using shadcn's DataTable (built on TanStack Table). This will enable efficient loading of large activity datasets with server-side pagination and client-side filtering controls.

## Current State

- **Frontend**: Manual HTML table in `activity-table.tsx`, no pagination or filtering
- **Backend**: `GetGroupActivity` RPC loads ALL expenses and transfers, sorts in-memory
- **Dependencies**: TanStack Table not installed, basic `ui/table.tsx` exists

## Architecture Decision: Cursor-Based Pagination

**Why cursor-based over offset-based:**
- More efficient for large datasets (no counting/skipping rows)
- Stable pagination (no duplicate/missing items when data changes)
- Natural fit for chronologically sorted activity data
- Cursor = composite of `(date, created_at, id)` for deterministic ordering

**Cursor format:** Base64-encoded JSON: `{ date, createdAt, id, type }`

---

## Implementation Steps

### Phase 1: Backend Changes

#### 1.1 Update Protobuf Definitions

**File:** `proto/api/v1/group.proto`

```protobuf
message GetGroupActivityRequest {
  string group_id = 1 [(buf.validate.field).string.uuid = true];

  // Pagination
  int32 limit = 2 [(buf.validate.field).int32 = { gte: 1, lte: 100 }];
  optional string cursor = 3; // Base64 encoded cursor for next page

  // Filters
  optional ActivityTypeFilter type_filter = 4;
  optional string currency_filter = 5;
  optional string member_filter = 6; // Filter by payer/sender/receiver user_id
}

enum ActivityTypeFilter {
  ACTIVITY_TYPE_FILTER_UNSPECIFIED = 0; // All types
  ACTIVITY_TYPE_FILTER_EXPENSE = 1;
  ACTIVITY_TYPE_FILTER_TRANSFER = 2;
}

message GetGroupActivityResponse {
  // ... existing ActivityItem message ...

  repeated ActivityItem items = 1;
  optional string next_cursor = 2; // Null if no more pages
  bool has_more = 3;
  int32 total_count = 4; // Optional: total matching items (for UI)
}
```

#### 1.2 Add Paginated Database Queries

**File:** `db/queries/activity.sql` (new file)

```sql
-- name: GetGroupActivityPaginated :many
-- Combined query using UNION ALL for expenses and transfers with cursor pagination
WITH activity AS (
  SELECT
    e.id,
    'expense' as type,
    e.date,
    e.created_at,
    e.name as description,
    e.currency,
    p.amount,
    p.user_id as actor_id,
    u.username as actor_name,
    NULL as receiver_id,
    NULL as receiver_name,
    json_group_array(b.user_id) as beneficiaries_ids,
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
    'transfer' as type,
    t.date,
    t.created_at,
    'Transfer' as description,
    t.currency,
    t.amount,
    t.sender_id as actor_id,
    s.username as actor_name,
    t.receiver_id,
    r.username as receiver_name,
    NULL as beneficiaries_ids,
    NULL as recurring_id
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
-- Count total matching items for pagination info
SELECT COUNT(*) as total FROM (
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

#### 1.3 Update Backend Handler

**File:** `http/routes/group/group.go`

Update `GetGroupActivity` to:
1. Parse cursor (base64 decode → JSON parse)
2. Apply filters to the paginated query
3. Fetch `limit + 1` items to detect `has_more`
4. Build next cursor from last item
5. Return paginated response

```go
type activityCursor struct {
    Date      string `json:"date"`
    CreatedAt string `json:"createdAt"`
    ID        string `json:"id"`
}

func (s *GroupService) GetGroupActivity(ctx context.Context, req *connect.Request[v1.GetGroupActivityRequest]) (*connect.Response[v1.GetGroupActivityResponse], error) {
    limit := int32(20) // Default
    if req.Msg.Limit > 0 {
        limit = req.Msg.Limit
    }

    // Parse cursor
    var cursor activityCursor
    if req.Msg.Cursor != nil && *req.Msg.Cursor != "" {
        // Decode and parse cursor
    }

    // Query with limit+1 to detect has_more
    items, err := db.ReadQueries.GetGroupActivityPaginated(ctx, database.GetGroupActivityPaginatedParams{
        GroupID:        req.Msg.GroupId,
        Limit:          limit + 1,
        TypeFilter:     mapTypeFilter(req.Msg.TypeFilter),
        CurrencyFilter: req.Msg.GetCurrencyFilter(),
        MemberFilter:   req.Msg.GetMemberFilter(),
        CursorDate:     cursor.Date,
        CursorCreatedAt: cursor.CreatedAt,
        CursorID:       cursor.ID,
    })

    hasMore := len(items) > int(limit)
    if hasMore {
        items = items[:limit]
    }

    // Build next cursor
    var nextCursor *string
    if hasMore && len(items) > 0 {
        last := items[len(items)-1]
        cursor := activityCursor{Date: last.Date, CreatedAt: last.CreatedAt, ID: last.ID}
        encoded := base64.StdEncoding.EncodeToString(jsonMarshal(cursor))
        nextCursor = &encoded
    }

    return connect.NewResponse(&v1.GetGroupActivityResponse{
        Items:      mapToProtoItems(items),
        NextCursor: nextCursor,
        HasMore:    hasMore,
    }), nil
}
```

---

### Phase 2: Frontend Changes

#### 2.1 Install TanStack Table

```bash
cd web && npm install @tanstack/react-table
```

#### 2.2 Add DataTable Component

**File:** `web/src/components/ui/data-table.tsx`

Create a reusable DataTable component following shadcn patterns:

```tsx
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function DataTable<TData, TValue>({ columns, data }: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

#### 2.3 Create Activity Table Columns

**File:** `web/src/components/group/activity-columns.tsx`

```tsx
import { ColumnDef } from "@tanstack/react-table";
import { ActivityItem } from "./activity-types";

export const activityColumns: ColumnDef<ActivityItem>[] = [
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => formatDate(row.original.data.date),
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => <DescriptionCell item={row.original} />,
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => <AmountCell item={row.original} />,
  },
  {
    accessorKey: "details",
    header: "Details",
    cell: ({ row }) => <DetailsCell item={row.original} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <ActionsCell item={row.original} />,
  },
];
```

#### 2.4 Add Filter Controls Component

**File:** `web/src/components/group/activity-filters.tsx`

```tsx
interface ActivityFiltersProps {
  typeFilter: ActivityTypeFilter;
  currencyFilter: string;
  memberFilter: string;
  currencies: string[];
  members: { id: string; name: string }[];
  onTypeChange: (type: ActivityTypeFilter) => void;
  onCurrencyChange: (currency: string) => void;
  onMemberChange: (memberId: string) => void;
}

export function ActivityFilters({ ... }: ActivityFiltersProps) {
  return (
    <div className="flex gap-2 mb-4">
      <Select value={typeFilter} onValueChange={onTypeChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="expense">Expenses</SelectItem>
          <SelectItem value="transfer">Transfers</SelectItem>
        </SelectContent>
      </Select>

      <Select value={currencyFilter} onValueChange={onCurrencyChange}>
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="Currency" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Currencies</SelectItem>
          {currencies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={memberFilter} onValueChange={onMemberChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Member" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Members</SelectItem>
          {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
```

#### 2.5 Add Pagination Controls Component

**File:** `web/src/components/group/activity-pagination.tsx`

```tsx
interface ActivityPaginationProps {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}

export function ActivityPagination({ hasMore, isLoading, onLoadMore }: ActivityPaginationProps) {
  if (!hasMore) return null;

  return (
    <div className="flex justify-center mt-4">
      <Button
        variant="outline"
        onClick={onLoadMore}
        disabled={isLoading}
      >
        {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
        Load More
      </Button>
    </div>
  );
}
```

#### 2.6 Update ActivitySection with Infinite Query

**File:** `web/src/components/group/activity-section.tsx`

Use TanStack Query's `useInfiniteQuery` for cursor-based pagination:

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";

export function ActivitySection({ groupId, ...callbacks }: ActivitySectionProps) {
  const [filters, setFilters] = useState({
    typeFilter: undefined,
    currencyFilter: undefined,
    memberFilter: undefined,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["groupActivity", groupId, filters],
    queryFn: async ({ pageParam }) => {
      return client.getGroupActivity({
        groupId,
        limit: 20,
        cursor: pageParam,
        ...filters,
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const allItems = data?.pages.flatMap((page) =>
    page.items.map(transformActivityItem)
  ) ?? [];

  return (
    <div>
      <ActivityFilters
        {...filters}
        onChange={(newFilters) => setFilters(newFilters)}
      />
      <DataTable columns={activityColumns} data={allItems} />
      <ActivityPagination
        hasMore={hasNextPage ?? false}
        isLoading={isFetchingNextPage}
        onLoadMore={fetchNextPage}
      />
    </div>
  );
}
```

---

### Phase 3: Code Generation & Testing

#### 3.1 Generate Code

```bash
just gen  # Runs buf generate + sqlc generate
```

#### 3.2 Backend Tests

**File:** `http/routes/group/group_test.go`

Add tests for:
- Pagination with various limits
- Cursor encoding/decoding
- Filter combinations (type, currency, member)
- Edge cases (empty results, single page, exact limit)
- Cursor stability when new items are added

#### 3.3 Frontend Tests

Test the ActivitySection component:
- Initial load shows first page
- "Load More" fetches next page and appends
- Filter changes reset pagination and refetch
- Empty state handling

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `proto/api/v1/group.proto` | Modify | Add pagination/filter fields to request/response |
| `db/queries/activity.sql` | Create | New paginated activity query with filters |
| `http/routes/group/group.go` | Modify | Update handler for pagination & filters |
| `web/package.json` | Modify | Add `@tanstack/react-table` dependency |
| `web/src/components/ui/data-table.tsx` | Create | Reusable DataTable component |
| `web/src/components/group/activity-columns.tsx` | Create | Column definitions for activity table |
| `web/src/components/group/activity-filters.tsx` | Create | Filter controls UI |
| `web/src/components/group/activity-pagination.tsx` | Create | Pagination controls UI |
| `web/src/components/group/activity-section.tsx` | Modify | Use useInfiniteQuery + filters |
| `web/src/components/group/activity-table.tsx` | Modify | Convert to use DataTable |

---

## Considerations

### Performance
- Default limit of 20 items per page balances UX and load time
- Count query is optional (can be removed if performance is a concern)
- Filters reduce dataset size server-side

### UX Decisions
- "Load More" button vs infinite scroll (button chosen for explicit control)
- Filters persist in URL query params (optional enhancement)
- Loading skeleton while fetching next page

### Future Enhancements
- Date range filter
- Search by expense name
- Export filtered results
- Infinite scroll option
- Sort direction toggle (ASC/DESC)
