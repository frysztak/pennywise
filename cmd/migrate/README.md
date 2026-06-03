# migrate

Imports an external expense-tracker project into Pennywise. The tool is
source-agnostic: a backend reads the original data, validates a hand-edited
mapping of source-side persons to Pennywise users, and writes a new expense
group (members, expenses, transfers) inside a single transaction.

Supported sources:

| Source | Backend identifier |
|---|---|
| [ihatemoney](https://github.com/spiral-project/ihatemoney) | `ihatemoney` |
| [Splitwise](https://www.splitwise.com/) | `splitwise` |

## Prerequisites

- The Pennywise Docker image. The migrator binary is built into the same
  image as the server, so you don't need a Go toolchain — `docker` is enough.
- The Pennywise SQLite database, already migrated by a previous server run.
- The source data (e.g. a copy of `budget.db` for ihatemoney, or a Splitwise CSV export).
- One Pennywise user account per source-side person. No placeholder users
  are created; create/invite missing users in Pennywise first.

## Command shape

```
migrate <source> inspect [--project <slug>] <source-flags...>
migrate <source> plan    --project <slug> --mapping <file> <source-flags...>
migrate <source> apply   --project <slug> --mapping <file> <source-flags...>
migrate sources         # list registered backends
migrate help
```

`<source>` is the backend identifier from the table above. Each source adds
its own flags (e.g. `--ihatemoney-db PATH`); see [Source-specific flags](#source-specific-flags)
below.

## Running

The recipes below assume a service named `pennywise`
that mounts a volume at `/data` for the SQLite file (the default `DB_PATH`
inside the image). Adjust the service name and volume path if yours differ.
The example uses the `ihatemoney` backend; swap `ihatemoney` for another
registered source name as new backends land.

You don't need to stop the server. The migrator opens the same database with
the same WAL journal mode and busy-timeout as the server, so SQLite serializes
it against the live server safely (see [Caveats](#caveats)). The flow is: copy
the source data into the running container, then run the migrator from a shell
inside it.

```bash
# On the HOST: copy the source DB into the running container (ephemeral /tmp).
docker cp /path/to/budget.db pennywise:/tmp/budget.db

# Open an interactive shell in the container.
docker exec -it pennywise sh
```

Then, inside the container shell — `migrate` is on PATH, and `DB_PATH` /
`AUTH_SECRET` are already in the environment:

```sh
cd /tmp

# 1. List projects in the source.
migrate ihatemoney inspect --ihatemoney-db budget.db

# 2. Emit a mapping skeleton for one project.
migrate ihatemoney inspect --ihatemoney-db budget.db --project roommates > mapping.json

# 3. Edit the mapping in place (busybox vi): set the creator and, per person,
#    either user_email or user_id (both checked against the live DB).
vi mapping.json

# 4. Dry-run — validates the mapping and prints per-currency totals and
#    warnings. Zero writes.
migrate ihatemoney plan  --ihatemoney-db budget.db --project roommates --mapping mapping.json

# 5. Apply — writes the new group to the same live database.
migrate ihatemoney apply --ihatemoney-db budget.db --project roommates --mapping mapping.json

# 6. Clean up the temp files and leave.
rm -f budget.db mapping.json
exit
```

`apply` prints the new group ID on success. On failure the entire transaction
rolls back — nothing is written.

## Mapping file

The mapping shape is the same for every source — only the `source_id`
values come from a different namespace (ihatemoney person ids, Splitwise
user ids, …).

```json
{
  "projectName": "Roommates",
  "creatorUserEmail": "alice@example.com",
  "persons": [
    { "source_id": "1", "user_email": "alice@example.com" },
    { "source_id": "2", "user_id": "22222222-2222-..." }
  ]
}
```

- `projectName` — optional; defaults to the source's project name.
- Creator — **exactly one** of `creatorUserEmail` or `creatorUserId`. Must
  resolve to one of the mapped Pennywise users.
- Each person needs **exactly one** of `user_email` or `user_id`.
- `source_id` is whatever opaque identifier the source uses, stringified
  (`inspect --project` populates these for you).

## Source-specific flags

### `splitwise`

Export a group's history from Splitwise via *Settings → Export as CSV* (or the equivalent in the mobile app), then point the tool at the downloaded file.

| flag | applies to | meaning |
|---|---|---|
| `--splitwise-csv` | all | path to Splitwise CSV export file |
| `--project` | inspect (optional), plan, apply | project slug (defaults to the filename without extension) |
| `--mapping` | plan, apply | path to mapping JSON |

What gets imported:

| Splitwise CSV | Pennywise |
|---|---|
| Filename (without `.csv`) | `expense_groups.name` (overridable via `projectName` in mapping) |
| Most-frequent currency in the file | `expense_groups.default_currency` |
| Header columns (member names) | `user_expense_groups` rows (resolved to existing users) |
| Expense rows | `expenses` + `expense_payers` + `expense_beneficiaries` |
| Distinct currencies | `group_currencies` |

Notes on the CSV format:

- Each row's per-member columns hold the **net balance change** for that person: negative means they paid more than their share (they are the payer); positive means they owe money (they are a beneficiary).
- The payer's own share is re-derived as `total_cost + net`; if non-zero the payer is also included as a beneficiary (equal split).
- Balance summary rows (empty cost column) are silently skipped.
- Member weights are not exported by Splitwise; all members are imported with equal weight (`1.0`).

### `ihatemoney`

| flag | applies to | meaning |
|---|---|---|
| `--ihatemoney-db` | all | path to source SQLite file (opened read-only) |
| `--project` | inspect (optional), plan, apply | ihatemoney project slug |
| `--mapping` | plan, apply | path to mapping JSON |
| `--strict-reimbursement` | plan, apply | reject multi-ower reimbursements instead of fanning them out by weight |

What gets imported:

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
- You can run `apply` while the server is live. The migrator opens the database
  with the same WAL journal mode and 5s busy-timeout as the server, so SQLite
  serializes the two writers safely — no corruption. `apply` runs in a single,
  short transaction; only a very large import could hold the write lock long
  enough for a concurrent user write to hit a transient `SQLITE_BUSY`. If your
  import is huge, run it at a quiet moment.
- Amounts are converted float → cents with rounding; warnings are printed
  for any amount that doesn't round cleanly to two decimals.

## Adding a new source

A backend lives in `migrate/<name>/`, implements `migrate.Source`
(`Name`, `Projects`, `Project`, `Persons`, `Build`, `Close`), and is
registered with the CLI by adding a `sourceBuilder` in
`cmd/migrate/sources_<name>.go`. The shared mapping/validation/apply
pipeline does the rest.
