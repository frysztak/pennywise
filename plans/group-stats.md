# Group Stats Sub-Page Implementation Plan

## Overview

Add a read-only **Stats** sub-page to the group detail view. It surfaces aggregate
analytics for a single group:

1. **Total spent** (per currency) + headline KPIs
2. **Total spent per user** (who paid how much)
3. **Balance over time** (running per-member balance as a line chart)

Plus a set of optional extras (cumulative spending, monthly breakdown, share-of-spend
donut) that are cheap to add on top of the same data.

Charts use shadcn's Base UI **chart** component
(https://ui.shadcn.com/docs/components/base/chart), which wraps Recharts and reads the
`--chart-1..5` CSS tokens already defined in `src/index.css`.

## Current State

- **Routing**: `web/src/routes/_pathlessLayout/group/$groupId.tsx` is a single flat leaf
  route. It owns the `GroupHeader`, all expense/transfer/recurring modals + mutation
  wiring, and renders `GroupSections` (balances / settle-up / activity).
- **Backend**: `GroupService` (`http/routes/group/group.go`) already loads members,
  expenses, and transfers for balance/settlement. `calc.ComputeGroupBalance` computes the
  current per-currency balance from scratch.
- **Data already available**:
  - `GetGroupExpenses` returns each expense's `payer_id`, `amount`, `currency`,
    `beneficiaries_ids`, and `date` — enough to compute per-payer spend **and** the
    balance timeline in Go with no new SQL.
  - `GetGroupTransfersForBalance` returns transfers for the timeline.
  - `GetGroupTotalSpending` returns total spend per currency.
- **Charts**: Recharts / `ui/chart.tsx` are **not** installed yet. `--chart-1..5` tokens
  exist; `components.json` style is `base-vega` (Base UI registry).
- **Nav pattern to mirror**: `admin/route.tsx` (layout with `<Outlet/>`) +
  `admin/index.tsx` (redirect) + `admin/members.tsx` etc., with `AdminNav` using
  `<Link activeProps={…}>`.

## Architecture Decisions

### 1. Restructure `$groupId` into a layout + child routes

Convert the flat route into a directory so Activity and Stats are real URLs sharing one
header. This mirrors the existing `admin/` pattern.

```
routes/_pathlessLayout/group/$groupId/
  route.tsx    # layout: GroupHeader + tab nav + all modals/mutations + <Outlet/>
  index.tsx    # /group/$groupId        → current GroupSections body
  stats.tsx    # /group/$groupId/stats  → new stats UI
```

- `route.tsx` keeps the `beforeLoad`/`loader` group lookup, owns every modal + mutation
  hook (today living in `$groupId.tsx`), renders the absolutely-positioned `GroupHeader`
  and the `mt-68 md:mt-64` content wrapper, then a **tab nav** (Activity / Stats) and
  `<Outlet/>`.
- Modal openers and the resolved `groupInfo` / `currentUser` are shared with children via
  a small React context (`GroupPageProvider`) wrapping `<Outlet/>` — TanStack Router has
  no `Outlet context`, so a plain context is the idiomatic choice here. `index.tsx`
  consumes it for `GroupSections`; `stats.tsx` only needs `groupInfo` (members,
  currencies, default currency) and is otherwise self-contained and read-only.
- `routeTree.gen.ts` regenerates automatically from the file tree — **do not hand-edit
  it** (the dev server / `tsr` owns it). See `feedback_route_tree_regen`.

> Lighter-weight fallback (only if the context refactor feels too invasive): keep
> `$groupId.tsx` flat and make `stats.tsx` a sibling standalone route that re-derives
> `groupInfo` from the same `getUserGroups` suspense query and renders its own minimal
> header. Loses the shared header/tabs but avoids touching the modal wiring. The layout
> approach above is recommended.

### 2. One new backend RPC: `GetGroupStats`

Add a single `GetGroupStats(GetGroupStatsRequest) → GetGroupStatsResponse` to
`GroupService`. It reuses the three already-loaded datasets (members, expenses,
transfers) — **no new SQL queries**. All aggregation lives in a new `calc/stats.go` so
the handler stays thin (per `feedback_split_algorithm_files`).

### 3. Multi-currency: compute everything per currency, let the UI pick one

Balances and spend are per-currency and don't sum across currencies. The backend returns
all currencies; the frontend shows a currency `Select` (only when the group has >1
currency) defaulting to the group's default currency, and every chart respects it. ISO
code only in the selector (`feedback_currency_labels`), and always pass `items={…}` to
`<Select>` (`feedback_select_needs_items`).

### 4. Amounts stay in integer cents over the wire

Consistent with the rest of the app: `int64` cents in proto, `Number(x) / 100` for
display. A small `formatCents(currency)` axis formatter for chart ticks/tooltips.

---

## What to Show

### Required

| # | Stat | Visualization |
|---|------|---------------|
| 1 | Total spent | KPI stat card(s), one per currency |
| 2 | Total spent per user | Horizontal bar chart (amount **paid** per member) |
| 3 | Balance over time | Line chart, one line per member, y = running balance, 0 reference line |

### Suggested extras (same data, cheap to add)

- **Cumulative spending over time** — area chart of running total group spend; shows pace.
- **Spending by month** — bar chart bucketed by month; seasonality.
- **Share of spending** — donut of each member's % of total paid.
- **Headline KPIs** alongside total spent: expense count, transfer count, average expense
  size, largest single expense, most active payer.
- **Paid vs. share per member** — grouped bars: what each member *paid* vs. their *share*
  of consumption (the gap is essentially their balance). Nice complement to chart #3.

Recommend shipping the 3 required + KPI row + cumulative-spending area chart first; the
donut / monthly / paid-vs-share are fast follow-ons.

---

## Phase 1 — Backend

### 1.1 Proto (`proto/api/v1/group.proto`)

```protobuf
message GetGroupStatsRequest {
  string group_id = 1 [(buf.validate.field).string.uuid = true];
}

message GetGroupStatsResponse {
  // Total amount paid (expenses only), per currency, in cents.
  map<string, int64> total_spending = 1;

  // Per-member spend, per currency.
  message MemberSpending {
    string user_id = 1;
    string user_name = 2;
    map<string, int64> paid = 3;   // sum of expenses this member paid for
    map<string, int64> share = 4;  // sum of this member's beneficiary shares
  }
  repeated MemberSpending member_spending = 2;

  // Running per-member balance over time, grouped by currency.
  message BalancePoint {
    google.protobuf.Timestamp date = 1;
    map<string, int64> balances = 2; // user_id -> cents, at this date
  }
  message BalanceSeries {
    string currency = 1;
    repeated BalancePoint points = 2;
  }
  repeated BalanceSeries balance_over_time = 3;

  int64 expense_count = 4;
  int64 transfer_count = 5;
  map<string, int64> largest_expense = 6; // per currency, in cents
}

service GroupService {
  // …existing…
  rpc GetGroupStats(GetGroupStatsRequest) returns (GetGroupStatsResponse) {}
}
```

Run `just gen` (buf generate → Go stubs + TS client).

### 1.2 Aggregation logic (`calc/stats.go`, new file)

Pure functions over the already-loaded rows. Mirror `ComputeGroupBalance`'s float-cents
accumulation + single final round to avoid bias.

```go
package calc

// PaidPerUser: userID -> currency -> cents (expenses only, by payer).
// SharePerUser: userID -> currency -> cents (sum of weighted beneficiary shares).
func ComputeMemberSpending(members, expenses) (paid, share GroupBalance)

// BalanceSnapshot is the rounded per-currency, per-user balance as of Date.
type BalanceSnapshot struct {
    Date     time.Time
    Balances map[string]map[string]int64 // currency -> userID -> cents
}

// ComputeBalanceTimeline replays expenses+transfers in (date asc, created_at asc)
// order, accumulating in float cents, and emits one snapshot per distinct activity
// day (carry-forward between days). Reuses the same share math as ComputeGroupBalance
// so the final snapshot equals the current balance.
func ComputeBalanceTimeline(members, expenses, transfers, defaultCurrency) []BalanceSnapshot
```

Notes:
- Bucket snapshots by **day** (one point per day that had activity) to keep payloads
  bounded; Recharts renders sparse line data fine. Revisit week/month bucketing only if a
  group ever has thousands of active days.
- `paid` is summed directly from `GetGroupExpenses` rows (`payer_id`, `amount`,
  `currency`) — no new query. `share` reuses the weighted-split loop.
- Put unit tests in `calc/stats_test.go` (mirror `cursor_test.go`/existing calc tests):
  single-currency, multi-currency, weighted members, and "final timeline snapshot ==
  `ComputeGroupBalance`" invariant.

### 1.3 Handler (`http/routes/group/group.go` or new `stats.go`)

```go
func (s *GroupService) GetGroupStats(ctx, r *apiv1.GetGroupStatsRequest) (*apiv1.GetGroupStatsResponse, error) {
    // 1. membership check (copy pattern from GetSettlementSuggestions)
    // 2. load group (default currency), members, expenses, transfers, total spending
    //    via existing ReadQueries
    // 3. paid, share := calc.ComputeMemberSpending(...)
    //    timeline := calc.ComputeBalanceTimeline(...)
    // 4. expense/transfer counts = len(expenses)/len(transfers); largest per currency
    // 5. map into proto (cents stay int64)
}
```

Keep the membership-denied / not-a-member errors consistent with
`GetSettlementSuggestions`.

---

## Phase 2 — Frontend

### 2.1 Install the chart component

```bash
cd web
npx shadcn@latest add @shadcn/chart   # base-ui registry; pulls in recharts + ui/chart.tsx
```

Verify it lands at `src/shared/components/ui/chart.tsx` (per `components.json` `ui` alias)
and that `recharts` is added to `package.json`. The component already consumes
`--chart-1..5`.

### 2.2 Restructure the route (see Architecture §1)

1. `git mv` `group/$groupId.tsx` → `group/$groupId/route.tsx`.
2. In `route.tsx`: keep `beforeLoad`/`loader`/`head`; render `GroupHeader`, a tab nav, and
   `<GroupPageProvider value={{ groupInfo, currentUser, …modalOpeners }}><Outlet/></GroupPageProvider>`.
   Move the modal JSX + `useGroupMutations`/modal hooks here.
3. Create `group/$groupId/index.tsx`: `createFileRoute('/_pathlessLayout/group/$groupId/')`,
   pulls context, renders the existing `GroupSections` + reminders `Suspense` block.
4. Create `group/$groupId/stats.tsx`: `createFileRoute('/_pathlessLayout/group/$groupId/stats')`,
   pulls `groupInfo` from context, renders `<GroupStats … />`.
5. Let the dev server regenerate `routeTree.gen.ts`.

`GroupPageProvider`: new `features/group/hooks/use-group-page-context.tsx` (context +
hook). Children import `useGroupPageContext()`.

### 2.3 Tab nav (`features/group/components/group-tabs.tsx`)

Mirror `AdminNav`: two `<Link>`s using Base UI `render={}` where needed (per
`feedback_render_prop`), with `activeProps`/`inactiveProps`. Placed in the `route.tsx`
content wrapper, above `<Outlet/>`, below the header. `index` link needs
`activeOptions={{ exact: true }}` so it doesn't stay active on `/stats`.

```
[ Activity ]  [ Stats ]
```

### 2.4 Stats feature (`features/group/components/stats/`)

- `group-stats.tsx` — top-level: `useSuspenseQuery(getGroupStats, { groupId })`, currency
  `Select` (only if `currencies.length > 1`, ISO codes, `items={…}`), lays out the cards.
- `stats-kpis.tsx` — total spent (selected currency) + expense/transfer counts + avg +
  largest, as `Card`s.
- `spend-per-user-chart.tsx` — Recharts `BarChart` (horizontal), member name on Y, paid
  amount on X, `ChartTooltipContent`, one color per member from `--chart-N`.
- `balance-over-time-chart.tsx` — `LineChart`, x = date, a `<Line>` per member, dashed
  `ReferenceLine y={0}`, `ChartLegend`. Transform `BalanceSeries` for the selected
  currency into `[{ date, [userName]: balance/100 }]` rows.
- `cumulative-spend-chart.tsx` (extra) — `AreaChart` of running total.
- Empty state: if no expenses/transfers, render the existing `EmptyState` component
  ("No activity yet — add an expense to see stats").

`chartConfig` maps each member → `{ label, color: 'var(--chart-N)' }`, cycling 1..5.

Add a small `formatCents(cents, currency)` helper (or reuse the `AmountWithCurrency`
convention `Number/100 .toFixed(2)`) for axis ticks and tooltips.

### 2.5 Hooks

Stats is read-only (no mutations). Just the generated
`getGroupStats` Connect-Query hook via `useSuspenseQuery`. Wrap the stats route body in a
`<Suspense fallback={<Spinner/>}>` like the existing sections.

---

## Multi-Currency Handling (UI)

- Default the selector to `groupInfo.groupDefaultCurrency`.
- Hide the selector entirely for single-currency groups.
- KPIs/charts read only the selected currency's slice of each map.
- A member with no activity in the selected currency shows 0 (filter empty lines from the
  balance chart legend to reduce clutter).

## Edge Cases

- **No activity**: empty state, no charts.
- **Single member**: spend-per-user shows one bar; balance timeline is flat at 0.
- **Archived group**: stats still viewable (read-only); no archived-guard needed.
- **Currency present in default list but with zero spend**: appears in selector; charts
  render empty/zero — acceptable, or omit currencies with no activity from the selector
  (decide during impl; omitting is friendlier).
- **Long history**: day-bucketing keeps the timeline payload bounded; revisit bucketing
  granularity if needed.

## Testing

- **Backend**: `calc/stats_test.go` — `ComputeMemberSpending` and
  `ComputeBalanceTimeline` across single/multi-currency, weighted members, and the
  "final snapshot == `ComputeGroupBalance`" invariant. `go test ./calc -v`.
- **Frontend**: `npx tsc -b --noEmit` (empty output = pass, don't re-run —
  `feedback_no_retry_typecheck`), `npm run lint`. Manual smoke: switch currency, hover
  tooltips, navigate Activity ↔ Stats tabs, check mobile layout.

## File Checklist

**Backend**
- `proto/api/v1/group.proto` — add `GetGroupStats` messages + RPC
- `calc/stats.go` — `ComputeMemberSpending`, `ComputeBalanceTimeline`
- `calc/stats_test.go` — tests
- `http/routes/group/stats.go` (or extend `group.go`) — handler
- regen: `just gen`

**Frontend**
- `web/src/shared/components/ui/chart.tsx` — via `shadcn add` (+ recharts dep)
- `routes/_pathlessLayout/group/$groupId/route.tsx` — moved from `$groupId.tsx`, now layout
- `routes/_pathlessLayout/group/$groupId/index.tsx` — activity body
- `routes/_pathlessLayout/group/$groupId/stats.tsx` — stats route
- `features/group/hooks/use-group-page-context.tsx` — shared context
- `features/group/components/group-tabs.tsx` — Activity/Stats nav
- `features/group/components/stats/*` — `group-stats`, `stats-kpis`,
  `spend-per-user-chart`, `balance-over-time-chart`, `cumulative-spend-chart`

## Open Questions

1. **"Total spent per user"** — does this mean amount each member **paid** (out-of-pocket)
   or their **share** of consumption? Plan returns **both** (`paid` + `share`); the chart
   defaults to *paid* with an option to toggle. Confirm preferred default.
2. **Cross-currency aggregation** — keep strictly per-currency (this plan), or add an
   optional converted "all currencies in X" view like settlement's conversion-rate flow?
   Default: per-currency only, to avoid a rate-input UX on a stats page.
3. **Timeline bucketing** — per active **day** is proposed. Fine, or prefer fixed
   weekly/monthly buckets for smoother lines on long histories?
