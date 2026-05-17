# ihatemoney → Pennywise Migration Tool

## Overview

A standalone Go CLI that imports an [ihatemoney](https://github.com/spiral-project/ihatemoney) SQLite database into Pennywise. The operator picks an ihatemoney project, supplies a mapping file pointing each ihatemoney `Person` at an existing Pennywise user, and the tool creates a new Pennywise group with all members, expenses, and transfers in a single transaction.

## Current State

- No migration tooling exists. Pennywise has no concept of importing external data.
- ihatemoney persists data to SQLite (or Postgres) via SQLAlchemy; schema is in `ihatemoney/models.py` upstream.
- Pennywise stores monetary amounts as `int64` cents; ihatemoney uses `Float`.

## Architecture Decisions

### CLI tool, not a web wizard

Migrations are admin-driven and rare. A CLI avoids file-upload handling, multi-step session state, and frontend work. The binary lives at `cmd/migrate-ihatemoney/` and reuses the existing `db/`, `db/database/` (sqlc), and `config/` packages so write paths are identical to the running server's.

### Strict person → user mapping

Every ihatemoney `Person` must be mapped to an **existing** Pennywise user before `apply` will run. No placeholder accounts are created. This keeps imported data consistent with the rest of the user-auth model and pushes account creation upstream (the operator invites/creates users first, then migrates).

### Three subcommands

`inspect` → `plan` → `apply`. Separation makes the mapping file a hand-edited intermediate artifact, and `plan` is a pure dry-run with zero writes.

### Single transaction per project

`apply` opens one `db.WriteDB.BeginTx`, performs all inserts via the existing sqlc query interface, commits at the end. Partial failure rolls back the entire group. Source DB is opened read-only.

### Reuse sqlc writers, don't reimplement SQL

Calling `db.WriteQueries.WithTx(tx)` for every insert keeps the migration consistent with service-layer writes — same column ordering, same validation surface, same constraint behavior.

---

## Schema Mapping

| ihatemoney | Pennywise | Notes |
|---|---|---|
| `Project.id` (string slug) | `expense_groups.id` (UUID) | Generate new UUID; original slug discarded. |
| `Project.name` | `expense_groups.name` | Override possible via mapping file. |
| `Project.default_currency` | `expense_groups.default_currency` | Direct copy. |
| `Project.password` | — | Project-level password has no analog. Discarded. |
| `Project.contact_email` | — | Discarded. |
| `Person` | `users` + `group_members` | Person resolved to an existing user via mapping file. `Person.weight` → `group_members.weight`. |
| `Person.activated = false` | `group_members` (still inserted, active) | Pennywise has no active flag on `group_members`; all imported members are active regardless of ihatemoney's `activated` value. |
| `Bill` where `bill_type = EXPENSE` | `expenses` | See below. |
| `Bill` where `bill_type = REIMBURSEMENT` | `transfers` | See below. |
| `Bill.amount` (Float) | `expenses.amount` / `transfers.amount` (cents) | `int64(math.Round(amount * 100))`. |
| `Bill.original_currency` | `currency` | Falls back to `Project.default_currency` if null (older DBs). |
| `Bill.what` | `expenses.description` | |
| `Bill.date`, `Bill.creation_date` | `date`, `created_at` | Direct copy. |
| `Bill.external_link` | — | Discarded (no field on Pennywise side). |
| `Bill.payer_id` | `expenses.payer_id` / `transfers.sender_id` | Resolved via mapping. |
| `billowers` (join table) | `expenses.beneficiaries` (JSON array) | Resolved via mapping, serialized with `utils.SliceToJSONString`. |
| `Archive` | — | Ignored; archived bills imported as regular bills with original dates. |

### Reimbursement fan-out

An ihatemoney `REIMBURSEMENT` bill has one payer (sender) and one or more owers (receivers). Pennywise `transfers` are strictly 1:1. The default is to fan out into N transfers, splitting the amount by ower weight (matching ihatemoney's own settlement math). `plan` lists every fanned-out transfer so the operator can review. A `--strict-reimbursement` flag rejects multi-ower reimbursements instead.

---

## Implementation Steps

### Phase 1: Source loader

#### 1.1 Open source DB read-only

**File:** `migrate/ihatemoney/source.go` (new)

Open with `sqlite3` driver and `?mode=ro&immutable=1` to guarantee zero writes. Expose:

```go
type Source struct { db *sql.DB }

func Open(path string) (*Source, error)
func (s *Source) Projects(ctx context.Context) ([]Project, error)
func (s *Source) Project(ctx context.Context, id string) (*Project, error)
func (s *Source) Persons(ctx context.Context, projectID string) ([]Person, error)
func (s *Source) Bills(ctx context.Context, projectID string) ([]Bill, error)
func (s *Source) BillOwers(ctx context.Context, billIDs []int64) (map[int64][]int64, error)
```

Plain `database/sql`, no ORM. Struct types mirror the ihatemoney schema 1:1.

### Phase 2: Mapping file

#### 2.1 Format

**File:** `migrate/ihatemoney/mapping.go` (new)

JSON, hand-edited between `inspect` and `apply`:

```json
{
  "projectName": "Roommates",
  "creatorUserId": "11111111-1111-...",
  "persons": [
    { "ihm_id": 1, "user_email": "alice@example.com" },
    { "ihm_id": 2, "user_id": "22222222-2222-..." }
  ]
}
```

- `projectName` optional; defaults to ihatemoney `Project.name`.
- `creatorUserId` required — must be one of the mapped Pennywise user IDs. Used for `expense_groups.creator_id`.
- Each person entry accepts **either** `user_email` (resolved via `db.ReadQueries.GetUserByEmail`) **or** `user_id` (resolved via `GetUser`). Both forms are validated against the live DB.

#### 2.2 Validation

`Validate(ctx, src, mapping)` returns a `[]ValidationError` with structured failures:

- Every `Person` in the source project has an entry.
- Every entry resolves to an existing Pennywise user.
- `creatorUserId` is among the resolved users.
- No duplicate `pennywise_user_id` across persons.

### Phase 3: Transform

#### 3.1 Pure transform layer

**File:** `migrate/ihatemoney/transform.go` (new)

Pure functions, no DB. Produces typed structs containing exactly the sqlc params needed for insertion:

```go
type Plan struct {
    Group    database.CreateExpenseGroupParams
    Members  []database.AddGroupMemberParams
    Expenses []database.CreateExpenseParams
    Transfers []database.CreateTransferParams
    Warnings []string
}

func Build(project *Project, persons []Person, bills []Bill,
           owers map[int64][]int64, mapping *Mapping) (*Plan, error)
```

Responsibilities:

- Float → cents conversion with rounding sanity check (`abs(amount*100 - round) < 0.01` else warn).
- Currency fallback (`Bill.original_currency` or `Project.default_currency`).
- Split bills by `bill_type` into expenses vs transfers.
- Fan out multi-ower reimbursements (split by weight).
- Serialize `beneficiaries` via `utils.SliceToJSONString`.
- Record warnings instead of failing for non-fatal issues (missing currency, oddly-rounded floats, deactivated payer).

#### 3.2 Tests

**File:** `migrate/ihatemoney/transform_test.go` (new)

Table-driven, no DB. Covers:

- Float→cents rounding edge cases (`19.99`, `0.1 + 0.2`, negative amounts).
- Currency fallback when `original_currency` is null.
- Single-ower reimbursement → one transfer.
- Multi-ower reimbursement → fan-out with weight-based split.
- Multi-currency project produces correctly-tagged expenses.

### Phase 4: Apply

**File:** `migrate/ihatemoney/apply.go` (new)

```go
func Apply(ctx context.Context, plan *Plan) (groupID string, err error)
```

Opens `db.WriteDB.BeginTx`, defers rollback, runs:

1. `qtx.CreateExpenseGroup(plan.Group)`
2. `qtx.AddGroupMember` for each member
3. `qtx.CreateExpense` for each expense (loop — Pennywise has no bulk insert today; acceptable given migration is one-shot)
4. `qtx.CreateTransfer` for each transfer
5. `tx.Commit`

If Pennywise gains bulk-insert paths via `json_each` (per the `feedback_bulk_db_writes` memory), switch the loops over to those.

### Phase 5: CLI binary

**File:** `cmd/migrate-ihatemoney/main.go` (new)

Subcommand dispatch via `flag` + a switch on `os.Args[1]` — no cobra dependency.

```
migrate-ihatemoney inspect --ihatemoney-db <path> [--project <slug>]
migrate-ihatemoney plan    --ihatemoney-db <path> --project <slug> --mapping <file>
migrate-ihatemoney apply   --ihatemoney-db <path> --project <slug> --mapping <file>
```

**`inspect`:**
- No `--project`: prints project list (id, name, members, bills, currencies).
- With `--project`: prints a mapping JSON skeleton to stdout, ready to redirect into a file.

**`plan`:**
- Loads source, mapping, validates against live Pennywise DB.
- Runs `transform.Build`, prints a summary table: N expenses per currency, M transfers per currency, total amount per currency, full warnings list.
- Exits non-zero on any validation failure. Zero writes.

**`apply`:**
- Repeats `plan`'s validation.
- Calls `Apply`, prints new group ID on success.
- Prints clear error and exits non-zero on rollback.

### Phase 6: Operator workflow

1. **Stop the Pennywise server** (SQLite single-writer; document this in the binary's help text).
2. `migrate-ihatemoney inspect --ihatemoney-db budget.db` — see what's in the source.
3. `migrate-ihatemoney inspect --ihatemoney-db budget.db --project roommates > mapping.json`
4. Edit `mapping.json`, fill in `creatorUserId` and a `user_email` for each person.
5. `migrate-ihatemoney plan --ihatemoney-db budget.db --project roommates --mapping mapping.json`
6. Review summary and warnings. Loop on 4–5 until clean.
7. `migrate-ihatemoney apply ...` — writes the new group.
8. Restart server.

---

## Open Questions

- **Idempotency:** Re-running `apply` against the same source produces a duplicate group. Acceptable for now (operator can delete the dupe). Could later store an `import_source` marker on the group to make `apply` refuse duplicates.

## Out of Scope

- Importing from ihatemoney's REST API (only SQLite supported).
- Importing ihatemoney `Project.password` as any kind of group-level auth.
- Migrating bill `external_link` (no analog on the Pennywise side).
- Preserving ihatemoney `Archive` groupings.
- Web UI / file-upload form.
