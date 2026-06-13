# Currency Conversion Action

## Overview

Introduce a new first-class action type — **currency conversion** — alongside expenses
and transfers. A conversion consolidates a group's outstanding balance in one currency
into another currency at a given rate, at a point in time. Like expenses and transfers,
conversions live in the activity feed and can be created, edited, and deleted.

This unlocks two things:

1. Users in multi-currency groups can permanently fold (say) all EUR debt into USD,
   instead of carrying parallel per-currency balances forever.
2. **Single-currency settlement** (see `plans/single-currency-settlement.md`) stops being a
   special ephemeral query path. Instead, the user creates conversion actions until the
   group is effectively single-currency, after which the *existing* per-currency settlement
   logic already produces a single consolidated set of transfers — no special casing.

## 1. Exchange Rate Source

### Recommendation: Frankfurter (default) + manual entry (always available)

[Frankfurter](https://frankfurter.dev/) is the best fit:

- **Free, no API key, no quota.** Nothing to provision, nothing to leak, no BYO-key UX.
- Sourced from the ECB / 84 central banks, 201 currencies.
- **Historical rates by date** — `GET https://api.frankfurter.dev/v1/{date}?base=EUR&symbols=USD`.
  This matters: a conversion action has a `date`, so we fetch the rate *as of that date*,
  not today's rate.
- Open-source and self-hostable via Docker if we ever want to remove the external dependency.

Example (rate of 1 EUR in USD on a given day):

```
GET https://api.frankfurter.dev/v1/2026-06-01?base=EUR&symbols=USD
→ { "amount": 1.0, "base": "EUR", "date": "2026-05-30", "rates": { "USD": 1.0857 } }
```

(Note: Frankfurter snaps to the nearest prior business day — surface the returned `date`
so the user knows which day's rate was used.)

**The exchange rate is never trusted blindly.** The API only *pre-fills* the rate input.
The user can always override it, and a rate can be entered fully manually (e.g. an offline
group, a crypto/local currency Frankfurter doesn't cover, or a rate the members agreed on).
The rate is stored on the conversion row, so settlement math is deterministic and never
depends on a live API call at read time.

### Alternatives considered

- `open.er-api.com` / exchangerate-api.com free tier — also keyless, but weaker historical support.
- Fixer.io / currencyapi.com — require API keys and impose monthly caps; rejected to avoid
  BYO-key complexity for a self-hosted app.

### Backend integration

Add a tiny server-side endpoint rather than calling Frankfurter from the browser (avoids
CORS surprises, lets us cache, and keeps any future keyed provider server-side):

- New RPC, e.g. `GetExchangeRate(from_currency, to_currency, date) → { rate, rate_date }`.
- Lives in a new `fx` package (`fx/frankfurter.go`) with an `http.Client` and a small
  in-memory cache keyed by `(from, to, date)` since historical rates are immutable.
- Config: `FX_PROVIDER` (default `frankfurter`), `FX_BASE_URL` (override for self-hosted),
  optional `FX_API_KEY` reserved for a future keyed provider. Document in `.env` / README.
- Failures are non-fatal: the endpoint returns an error, the UI falls back to manual entry.

## 2. Conversion as an Action & Balance Calculation

### The core modeling decision

Today balances are **order-independent**: `ComputeGroupBalance` sums every expense/transfer
into per-(user, currency) buckets in a single pass (`calc/balance.go`). A conversion cannot
work that way, because "convert outstanding EUR to USD" only has meaning *relative to the
balance at that moment*.

So the conversion is modeled as a **point-in-time fold of the whole group's position in one
currency**, and balance computation becomes **temporally ordered**:

```
sort all actions (expenses, transfers, conversions) by (date, created_at, id)
running balance b[user][currency] = 0
for each action in order:
    expense:    apply weighted split (payer +amount, beneficiaries -share) in its currency
    transfer:   sender +amount, receiver -amount in its currency
    conversion (from F, to T, rate R):
        for each user u:
            b[u][T] += round(b[u][F] * R)
            b[u][F]  = 0
```

**Why fold the whole group at once (not per-user, not a self-transfer):** balances per
currency are zero-sum across the group. If `Σ b[*][F] == 0`, then after multiplying every
user's F balance by the same R, `Σ b[*][T contribution] == 0` too. Zero-sum is preserved
automatically. A per-user or two-party conversion would break that invariant and create
phantom money.

This means a single conversion row carries only: `from_currency`, `to_currency`, `rate`,
`date` (+ id/group/created_at). No per-user amounts to store — they're derived.

### Properties / edge cases of this model

- **Editing & deletion are free.** Because balances are always recomputed from the full
  ordered action list, editing a conversion's rate or deleting it just re-runs the fold.
  No stored derived state to migrate.
- **Late-dated expenses in the source currency.** An expense in EUR dated *after* a
  EUR→USD conversion stays in EUR (the fold already happened before it in time order). The
  group is multi-currency again until another conversion is added. The settlement UI should
  detect leftover currencies and offer to add a fresh conversion (this is exactly the
  single-currency flow in §3). This is correct behavior, not a bug — surface it, don't hide it.
- **Backdating a conversion.** Allowed and meaningful: it folds whatever F-balance existed
  as of that date. Document that conversions apply to balance *as of their date*.
- **Rounding.** Round once per user at the fold (mirrors the existing "round only at the
  end" philosophy in `balance.go`). Across the group the rounded T contributions still sum
  to ~0 (±1¢ per currency, same property the codebase already tolerates).
- **Rate sign/validation.** `rate > 0`. `from_currency != to_currency`. Both ≥ 2 chars.

### Refactor required in `calc`

`ComputeGroupBalance` must move from "bucketed sum" to "ordered replay":

- New signature accepting a unified, chronologically sortable action list (or accepting
  expenses + transfers + conversions and merging/sorting internally).
- `calc/stats.go` shares the same weighted-share math (see its comment referencing
  `ComputeGroupBalance`) — update it in lockstep so stats stay consistent with balances.
- Heavy unit test coverage in `calc/balance_test.go`:
  - conversion preserves zero-sum,
  - conversion before vs. after an expense yields different (correct) results,
  - chained conversions (EUR→USD then USD→GBP),
  - deletion/edit re-derivation,
  - rounding edges.

### Data model

New migration `db/schema/008_currency_conversions.sql` (Goose up/down):

```sql
CREATE TABLE currency_conversions (
    id              TEXT PRIMARY KEY,
    group_id        TEXT NOT NULL,
    from_currency   TEXT NOT NULL,
    to_currency     TEXT NOT NULL,
    rate            REAL NOT NULL,      -- 1 from_currency = rate to_currency
    created_at      TEXT NOT NULL,
    date            TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES expense_groups(id) ON DELETE CASCADE
) STRICT;
```

Queries in `db/queries/conversions.sql` (mirror `transfers.sql`): `CreateCurrencyConversion`,
`GetCurrencyConversionById`, `GetGroupConversions` (for activity), `GetGroupConversionsForBalance`
(slim: from/to/rate/date), `UpdateCurrencyConversion`, `DeleteCurrencyConversion`. Run `just gen`.

### Proto / API

New `proto/api/v1/conversion.proto` mirroring `transfer.proto`:

- `ConversionService` with `CreateConversion`, `UpdateConversion`, `DeleteConversion`,
  `GetGroupConversions`.
- Request fields validated with buf.validate: `from_currency`/`to_currency` `min_len = 2`,
  `rate` `double.gt = 0.0`, group_id uuid, `date` timestamp. Pass `group_id` on write
  requests directly (per `[[feedback_thread_id_over_reverse_lookup]]`).
- Register in `http/router/routes.go`; implement in new `http/routes/conversion/conversion.go`
  following the transfer handler (archived-group assert, currency presence, validation, logging).

### Activity feed

Extend `db/queries/activity.sql` with a third `UNION ALL` branch for conversions so they
appear chronologically in the feed and count query. Suggested column mapping for the shared
activity row shape:

- `type = 'conversion'`, `description = 'Currency conversion'`,
- `currency = to_currency`, `amount = NULL` (no single amount — it's a rate),
- stash `from_currency` / `rate` either in reused nullable columns or by widening the
  activity row. Honor the existing `@type_filter` / `@currency_filter` params.

## 3. Single-Currency Settlement via Conversions

This **replaces** the ephemeral approach sketched in `plans/single-currency-settlement.md`
(which passes `target_currency` + `conversion_rates` on `GetSettlementSuggestions` and never
persists them). That approach computes a one-off consolidated suggestion that vanishes on
refresh and isn't reflected in anyone's actual balance.

### New flow

1. In the settlement section, "Single currency mode" opens a modal listing every non-target
   currency present in the group's balances and a target currency selector (default: group
   `default_currency`).
2. For each source currency, an exchange-rate input **pre-filled from the FX endpoint**
   (§1) using the chosen rate date — editable, with manual fallback.
3. On confirm, the app **creates one conversion action per source currency** (`from = source`,
   `to = target`, `rate`, `date`). Use `mutate` + `onSuccess` (per
   `[[feedback_mutate_onsuccess]]`), batching the creates.
4. After the writes, balances are recomputed by the temporal replay (§2) and the group is now
   effectively single-currency. The **existing** `CalculateSettlements` (per-currency path,
   `r.TargetCurrency == nil`) naturally yields one consolidated currency's suggestions.
   Settlements are then recorded as normal transfers — no special target-currency transfer logic.

### What gets removed / deprecated

- `GetSettlementSuggestionsRequest.target_currency` and `.conversion_rates`, and the
  `CalculateSettlementsInCurrency` branch in `group.go` (lines ~492–501) and
  `calc/settlement.go`. The single-currency outcome now falls out of persisted conversions
  + the plain settlement path.
- Keep `currencies_in_group` in the response — the modal still needs it to know which rate
  inputs to show.
- Mark `plans/single-currency-settlement.md` as superseded by this plan.

### Frontend pieces (feature: `features/conversion/`)

- `features/conversion/` — conversion modal (create/edit), delete dialog, hooks
  (`use-conversion-modal`, `use-delete-conversion-modal`, mutation hooks), mirroring
  `features/transfer/`.
- Activity feed renders a conversion row (e.g. "EUR → USD @ 1.0857"). Reuse shadcn
  primitives (`[[feedback_use_shadcn_primitives]]`); amount-input family for the rate field;
  ISO codes only in currency selectors (`[[feedback_currency_labels]]`).
- The single-currency modal from `single-currency-settlement.md` is repurposed to *create
  conversion actions* instead of holding ephemeral local state.

## Implementation Order

1. **Migration + sqlc queries** for `currency_conversions` (`just gen`).
2. **`calc` refactor** to temporal replay + conversion fold, with tests (the riskiest part —
   land and prove correct before any UI).
3. **Proto + handler** for `ConversionService`; register routes (`just gen`).
4. **Activity feed** query + count branch; render conversion rows.
5. **FX endpoint** (`fx` package + RPC) with manual-entry fallback.
6. **Conversion UI** (create/edit/delete) in `features/conversion/`.
7. **Rewire single-currency settlement** to create conversions; remove the ephemeral
   `target_currency`/`conversion_rates` path.

## File Changes Summary

| File | Change |
|------|--------|
| `db/schema/008_currency_conversions.sql` | New migration |
| `db/queries/conversions.sql` | New queries (mirror transfers) |
| `db/queries/activity.sql` | Add conversion `UNION ALL` branch + count |
| `calc/balance.go` | Refactor to ordered replay + conversion fold |
| `calc/stats.go` | Keep in sync with new balance math |
| `calc/balance_test.go` | Conversion coverage (zero-sum, ordering, chaining, rounding) |
| `proto/api/v1/conversion.proto` | New service/messages |
| `proto/api/v1/group.proto` | Remove `target_currency`/`conversion_rates` |
| `calc/settlement.go` | Remove `CalculateSettlementsInCurrency` |
| `http/routes/conversion/conversion.go` | New handler |
| `http/routes/group/group.go` | Drop single-currency settlement branch; feed conversions into balance |
| `http/router/routes.go` | Register ConversionService |
| `fx/frankfurter.go` + RPC | Exchange-rate lookup endpoint |
| `config/config.go`, `.env`, README | `FX_*` settings |
| `web/src/features/conversion/**` | Modal, delete dialog, hooks |
| `web/src/features/group/components/settlement-suggestions.tsx` | Single-currency mode → create conversions |
| `plans/single-currency-settlement.md` | Mark superseded |

## Open Questions

- **Granularity of the source-currency choice in a conversion:** always whole-group fold of
  one currency (recommended, preserves zero-sum). Confirm we don't want partial/per-amount
  conversions — those break the invariant and add a lot of complexity.
- **Activity row shape:** widen the shared activity row vs. reuse nullable columns for
  `from_currency`/`rate`. Lean toward widening for clarity.
- **Stats display:** how converted historical spend appears in `calc/stats.go` /
  group stats (show in post-conversion currency, or keep original per-currency totals).

## Sources

- [Frankfurter — Free exchange rates API](https://frankfurter.dev/)
- [Frankfurter on GitHub (self-hosting)](https://github.com/lineofflight/frankfurter)
