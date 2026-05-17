# migrate-ihatemoney

Imports an [ihatemoney](https://github.com/spiral-project/ihatemoney) project
into Pennywise. Reads ihatemoney's SQLite database read-only, writes a new
expense group (members, expenses, transfers) to Pennywise inside a single
transaction.

## Prerequisites

- Go 1.25+
- The Pennywise SQLite database the tool will write to. Schema must already
  be migrated — start the Pennywise server at least once against this file.
- A copy of the ihatemoney SQLite database (e.g. `budget.db`).
- One Pennywise user account per ihatemoney person. No placeholder users
  are created; create/invite missing users in Pennywise first.

## Running

```bash
git clone https://github.com/<you>/pennywise.git
cd pennywise

# .env must define DB_PATH and AUTH_SECRET — same file the server uses.
cp .env.example .env  # if you don't already have one

# 1. List projects in the source DB.
go run ./cmd/migrate-ihatemoney inspect \
    --ihatemoney-db /path/to/budget.db

# 2. Emit a mapping skeleton for one project and save it.
go run ./cmd/migrate-ihatemoney inspect \
    --ihatemoney-db /path/to/budget.db \
    --project roommates > mapping.json

# 3. Edit mapping.json: set creatorUserId and, per person,
#    either user_email or user_id (both checked against the live DB).

# 4. Dry-run — validates the mapping and prints per-currency totals
#    and warnings. Zero writes.
go run ./cmd/migrate-ihatemoney plan \
    --ihatemoney-db /path/to/budget.db \
    --project roommates \
    --mapping mapping.json

# 5. Stop the Pennywise server (SQLite is single-writer), then apply.
go run ./cmd/migrate-ihatemoney apply \
    --ihatemoney-db /path/to/budget.db \
    --project roommates \
    --mapping mapping.json
```

`apply` prints the new group ID on success. On failure the entire transaction
rolls back — nothing is written.

## Mapping file

```json
{
  "projectName": "Roommates",
  "creatorUserEmail": "alice@example.com",
  "persons": [
    { "ihm_id": 1, "user_email": "alice@example.com" },
    { "ihm_id": 2, "user_id": "22222222-2222-..." }
  ]
}
```

- `projectName` — optional; defaults to ihatemoney's project name.
- Creator — **exactly one** of `creatorUserEmail` or `creatorUserId`. Must resolve to one of the mapped Pennywise users.
- Each person needs **exactly one** of `user_email` or `user_id`.

## Flags

| flag | applies to | meaning |
|---|---|---|
| `--ihatemoney-db` | all | path to source SQLite file (opened read-only) |
| `--project` | inspect (optional), plan, apply | ihatemoney project slug |
| `--mapping` | plan, apply | path to mapping JSON |
| `--strict-reimbursement` | plan, apply | reject multi-ower reimbursements instead of fanning them out by weight |

## What gets imported

| ihatemoney | Pennywise |
|---|---|
| `Project.name`, `default_currency` | `expense_groups.name`, `default_currency` |
| `Person` (+ weight) | `user_expense_groups` row (resolved to existing user) |
| `Bill` where `bill_type=EXPENSE` | `expenses` + `expense_payers` + `expense_beneficiaries` |
| `Bill` where `bill_type=REIMBURSEMENT` | one `transfers` row per ower (split by weight) |
| Distinct bill currencies | `group_currencies` |

Discarded: `Project.password`, `contact_email`, `Bill.external_link`,
`Archive` groupings. `Person.activated=false` is imported as an active
member with a warning.

## Caveats

- Re-running `apply` against the same source produces a duplicate group.
  Delete the dupe manually if needed.
- The Pennywise server must be stopped during `apply` — SQLite allows only
  one writer.
- Amounts are converted float → cents with rounding; warnings are printed
  for any amount that doesn't round cleanly to two decimals.
