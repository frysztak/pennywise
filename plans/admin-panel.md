# Admin Panel

## Overview

An admin-only panel reached from the user dropdown in the sidebar (next to **Settings**), visible only to users whose `role == USER_ROLE_ADMIN`. It has two categories:

1. **Users** — list all users; change a user's role.
2. **App** — manage the list of currencies the app supports (currently hard-coded in the frontend) and the OCR scanning prompt (currently a hard-coded Go const).

Moving currencies and the OCR prompt to the backend means they become **runtime-editable, DB-backed settings** rather than constants. So this work is two-layered: (a) introduce persistence + read/write RPCs for these settings, and (b) build the admin UI on top.

## Current State

### Roles & auth
- `users.role` is `INTEGER NOT NULL` (`db/schema/001_init.sql:8`). The `UserRole` enum already exists: `UNSPECIFIED=0`, `ADMIN=1`, `REGULAR=2` (`proto/api/v1/user.proto:8`).
- `userInfo` (`UserService.UserInfo`) already returns `role`, and the frontend auth context exposes it: `AuthState.user: UserInfoResponse | null` (`web/src/auth.tsx:8`), reachable in route guards via `context.auth.user?.role` (`web/src/routes/__root.tsx:6`).
- **Gap:** the session stores `database.Session` in context (`helpers.GetSessionInfo` → `database.Session`, `http/helpers/auth.go`), which carries `UserID` but **not** the role. Any server-side admin check must load the role from the DB.
- `AdminService` is an empty placeholder (`proto/api/v1/admin.proto`, `http/routes/admin/admin.go`) already wired into the router with the standard interceptors (`http/router/routes.go:71`).
- Session middleware allow-lists only Login/Register; everything else requires auth (`http/middleware/session.go:29`). There is **no** role-based gating yet.

### Sidebar dropdown
- `NavUser` (`web/src/components/sidebar/nav-user.tsx`) renders the dropdown with a single **Settings** `DropdownMenuItem` (a `Link to="/settings"`) plus **Log out**. This is where the **Admin** entry goes.

### Currencies
- Hard-coded array `COMMON_CURRENCIES` (`web/src/lib/currencies.ts`), ~30 ISO codes, **codes only** (no labels — consistent with the "ISO code only" preference, memory `feedback_currency_labels`).
- Consumed by passing a `currencies: string[]` prop down to `AmountInput` (`web/src/components/amount-input.tsx:21`). Direct importers: `edit-group-dialog.tsx`, `new-group-modal.tsx`, and the storybook file. (`expense-modal.tsx` etc. receive it as a prop.)

### OCR prompt
- Hard-coded const `ai.ReceiptOCRPrompt` (`ai/prompts.go`). Used in `ai/provider.go:37` inside `AnalyzeReceipt`. The receipt handler (`http/routes/receipt/receipt.go`) gates on `config.Config.ReceiptScanningEnabled()` (needs `OPENAI_API_KEY` + `OPENAI_OCR_MODEL`).

### Frontend config injection
- `FrontendConfig` is computed at server start and injected into the HTML as `window.__PENNYWISE_CONFIG__` (`main.go` ~line 217; consumed via `web/src/lib/config.ts`). Good for static flags (`appVersion`, `receiptScanningEnabled`) but **not** for runtime-editable values like the currency list — those need a query.

---

## Decision: where the settings live & which service serves them

We need both **admin-only writes** and (for currencies) **all-users reads** (the expense/transfer modals need the list). Proposed split:

| RPC | Service | Auth | Purpose |
|-----|---------|------|---------|
| `GetCurrencies` | **AppService** (new) | any authenticated user | feed the modals + admin currency editor (single source of truth) |
| `ListUsers` | AdminService | admin only | user list with roles |
| `UpdateUserRole` | AdminService | admin only | change a role |
| `SetCurrencies` | AdminService | admin only | replace the currency list |
| `GetReceiptPrompt` | AdminService | admin only | load prompt into the editor |
| `SetReceiptPrompt` | AdminService | admin only | save prompt |

Rationale:
- The OCR prompt has **no** public reader — the backend receipt path reads it from the DB directly, and only the admin editor needs `GetReceiptPrompt`. So it stays entirely on the admin (gated) service.
- Currencies **do** have a public reader, so the read lands on a small new `AppService`; the admin editor reuses that same `GetCurrencies` rather than duplicating a read on AdminService. Only the write is admin-gated.
- Keeping every admin-only method on one service lets us gate the **whole service** with one interceptor (below) instead of per-method checks.

**Decided:** `GetCurrencies` lives on a dedicated new `AppService` (not bolted onto `UserService`) — it reads cleaner and gives a home for future app-wide reads.

## Decision: storage shape

A single key-value table `app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT` holds both settings (and any future scalar config):

- **OCR prompt** → one row, `key = 'receipt_ocr_prompt'`, `value` = the prompt text.
- **Currencies** → one row, `key = 'currencies'`, `value` = a JSON array of ISO codes (e.g. `["USD","EUR",...]`).

The currency list is always read and written *as a whole* (an admin edit replaces the entire list; consumers want the full array), and no code path queries or orders individual codes in SQL — so a relational `currencies` table buys nothing here. Dedup and basic code validation are done in Go before the upsert (cheap), and ordering a ~30-element array is done in memory. This keeps everything in one table with one read (`GetSetting`) and one write (`UpsertSetting`) path, and avoids a second migration/query file.

Seeding: the migration's `+goose Up` inserts the current default codes (as a JSON array) and the current `ReceiptOCRPrompt` text so behavior is unchanged on first deploy. The Go const stays as the **fallback** if the row is somehow missing.

## Decision: server-side admin enforcement

Add an **admin interceptor** applied only to `AdminService` (in addition to the shared logging/validation interceptors). It reads `helpers.GetSessionInfo(ctx).UserID`, loads the user's role (`GetUserById` already returns `role`), and rejects non-admins with `connect.CodePermissionDenied`. One interceptor covers every current and future admin method — no per-handler checks.

**Last-admin guard:** `UpdateUserRole` must refuse to demote the final remaining admin. Before applying a change that moves a user *out of* `USER_ROLE_ADMIN`, count current admins (a `CountAdmins :one` query, `SELECT COUNT(*) FROM users WHERE role = 1`); if the target is an admin and the count is `1`, reject with `connect.CodeFailedPrecondition` ("cannot remove the last admin"). This also covers an admin demoting themselves.

---

## Implementation Steps

### 1. Database

1. New migration `db/schema/006_app_settings.sql` (Goose up/down):
   - `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;`
   - Seed `('receipt_ocr_prompt', <current prompt text>)`.
   - Seed `('currencies', <JSON array of the ~30 codes from COMMON_CURRENCIES>)`.
   - `Down`: drop the table.
2. Queries:
   - `db/queries/settings.sql`: `GetSetting :one` (by key), `UpsertSetting :exec` (`INSERT ... ON CONFLICT(key) DO UPDATE`).
   - Add `UpdateUserRole :one` to `db/queries/users.sql` (`UPDATE users SET role = @role WHERE id = @id RETURNING id, email, username, role`).
   - Add `CountAdmins :one` to `db/queries/users.sql` (`SELECT COUNT(*) FROM users WHERE role = 1`) for the last-admin guard.
   - Add `role` to the existing `GetUsers :many` projection (currently `id, username, email`) **or** add a new `ListUsersWithRoles` query if other callers of `GetUsers` shouldn't change. (`GetUsers` is used by `add-member-dialog.tsx`; adding a column is harmless, so extend it.)
3. `sqlc generate`.

### 2. Protobuf

1. `proto/api/v1/app.proto` — new `AppService`:
   - `GetCurrencies(GetCurrenciesRequest) returns (GetCurrenciesResponse { repeated string currencies = 1; })`
2. `proto/api/v1/admin.proto` — flesh out `AdminService`:
   - `ListUsers` → `repeated AdminUser { id, username, email, UserRole role }`
   - `UpdateUserRole(UpdateUserRoleRequest { string user_id [uuid]; UserRole role; })` → returns updated user
   - `SetCurrencies(SetCurrenciesRequest { repeated string currencies; })` with `buf.validate` (each `min_len = 2`, consistent with existing currency validation) → returns the saved list. Codes are free-text — admins may add **any** ISO code, no master list to pick from.
   - `GetReceiptPrompt` / `SetReceiptPrompt(SetReceiptPromptRequest { string prompt [min_len=1]; })`
   - Import `user.proto` for `UserRole`.
3. `just gen` (buf generate Go + TS).
4. Register `AppService` handler in `http/router/routes.go` (mirror the existing blocks) and add it to the grpcreflect reflector list. Add `AppService`'s read to the session allow-list **only if** it must work pre-auth — it doesn't (all users are authenticated), so no allow-list change.

### 3. Backend handlers

1. `http/routes/admin/admin.go`: implement `ListUsers`, `UpdateUserRole`, `SetCurrencies`, `GetReceiptPrompt`, `SetReceiptPrompt` using `GetSetting`/`UpsertSetting` + the user queries. `SetCurrencies` upper-cases/trims/dedups the codes in Go (accepting any code — no master-list check), `json.Marshal`s the slice, and upserts `key='currencies'`. `UpdateUserRole` runs the last-admin guard (`CountAdmins`) before writing. `SetReceiptPrompt` upserts `key='receipt_ocr_prompt'`.
2. New `http/middleware/admin_interceptor.go` (or `http/routes/admin/interceptor.go`): the role-checking `connect.UnaryInterceptorFunc` described above. Wire it into the `NewAdminServiceHandler` call in `routes.go` (append to the existing interceptors for that service only).
3. New `http/routes/app/app.go`: `GetCurrencies` reads `key='currencies'` via `GetSetting` and `json.Unmarshal`s into the response (falling back to the seeded defaults if the row is missing/empty).
4. OCR prompt sourcing: change `ai.AnalyzeReceipt` / the receipt handler to fetch the prompt from `app_settings` (via a query) instead of the const, falling back to `ai.ReceiptOCRPrompt` if the row is absent. Cleanest: have `receipt.go` load the prompt and pass it into `AnalyzeReceipt(ctx, processed, prompt)` so the `ai` package stays free of DB concerns (consistent with keeping logic layered, memory `feedback_split_algorithm_files`). Keep the const as the default.

### 4. Frontend — routing & nav

1. New route `web/src/routes/_pathlessLayout/admin.tsx` with a `beforeLoad` guard:
   ```ts
   if (context.auth.user?.role !== UserRole.USER_ROLE_ADMIN) throw redirect({ to: "/dashboard" });
   ```
   (mirrors the auth guard in `_pathlessLayout/route.tsx`).
2. Register `/admin` in `main.go`'s `fePaths` list so a hard refresh serves the SPA.
3. `nav-user.tsx`: add an **Admin** `DropdownMenuItem` (`Link to="/admin"`, a `Shield`/`ShieldUser` lucide icon) inside the existing `DropdownMenuGroup`, rendered only when `useAuth().user?.role === USER_ROLE_ADMIN`. Use the `render={<Link/>}` prop pattern already used for Settings (memory `feedback_render_prop`).

### 5. Frontend — admin UI

Layout mirrors `settings.tsx` (serif `h1`, `Card`s). Two sections (Users, App) — tabs or stacked cards.

1. **Users**: `useQuery(listUsers)` → a `Table` (`web/src/components/ui/table.tsx`) of username/email/role, role column being a `Select` that calls `useMutation(updateUserRole)` with `mutate` + `onSuccess` (invalidate `listUsers`) per the mutation convention (memory `feedback_mutate_onsuccess`). Show ISO/enum label only, no decoration.
2. **App → Currencies**: a free-text **add-any-code** editor over `getCurrencies` — a text input to add a code plus removable chips/tags for the current list (build from an existing shadcn primitive — check `src/components/ui/` for input-group/combobox before hand-rolling, memory `feedback_use_shadcn_primitives`), saved via `setCurrencies`. Codes only, no labels (memory `feedback_currency_labels`); no master-list dropdown. On success invalidate both `getCurrencies` and any cached currency consumers.
3. **App → OCR prompt**: a `Textarea` seeded from `getReceiptPrompt`, saved via `setReceiptPrompt`. Consider gating this card on `getConfig().receiptScanningEnabled` (show a note if scanning isn't configured).

### 6. Frontend — consume currencies from backend

1. Replace `COMMON_CURRENCIES` imports with a `useQuery(getCurrencies)` hook. Cleanest: a small `useCurrencies()` hook (or expose via a context/provider mounted at the root per memory `feedback_global_providers_in_main`) returning `string[]`, so `edit-group-dialog.tsx`, `new-group-modal.tsx`, and the `AmountInput` callers stop importing the static list.
2. Keep `web/src/lib/currencies.ts` only if the storybook still needs a static fixture; otherwise delete it once all consumers move to the query.

### 7. Verify

- `go test ./...`, `go build ./...`.
- `npx tsc -b --noEmit` (empty output == success, memory `feedback_no_retry_typecheck`); `npm run lint`.
- Manual: as a regular user `/admin` redirects and the dropdown hides Admin; as admin the panel loads, role changes persist, currency edits show up in the expense modal without a restart, and an edited OCR prompt is used by a scan.

---

## Settled Decisions

1. **Service for `GetCurrencies`** — a dedicated new `AppService`, not `UserService`.
2. **Currency editor UX** — free-text, add **any** ISO code (validated `min_len >= 2`); no master list.
3. **Demotion guard** — block removing the **last remaining admin** server-side (covers self-demotion) via the `CountAdmins` check in `UpdateUserRole`.
4. **Currency labels** — codes only, no labels (consistent with `feedback_currency_labels`).
