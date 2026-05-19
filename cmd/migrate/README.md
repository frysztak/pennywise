# migrate

Imports an external expense-tracker project into Pennywise. The tool is
source-agnostic: a backend reads the original data, validates a hand-edited
mapping of source-side persons to Pennywise users, and writes a new expense
group (members, expenses, transfers) inside a single transaction.

Supported sources:

| Source | Status | Backend identifier |
|---|---|---|
| [ihatemoney](https://github.com/spiral-project/ihatemoney) | ✅ stable | `ihatemoney` |
| [Splitwise](https://www.splitwise.com/) | ✅ stable | `splitwise` |

## Prerequisites

- The Pennywise Docker image. The migrator binary is built into the same
  image as the server, so you don't need a Go toolchain — `docker` is enough.
  (If you do have Go 1.25+ installed, you can also run `go run ./cmd/migrate
  ...` from a checkout; see [From source](#from-source).)
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

## Running (Docker Compose)

The recipes below assume a `compose.yml` with a service named `pennywise`
that mounts a volume at `/data` for the SQLite file (the default `DB_PATH`
inside the image). Adjust the service name and volume path if yours differ.
The example uses the `ihatemoney` backend; swap `ihatemoney` for another
registered source name as new backends land.

```bash
# 1. Stop the server — SQLite only allows one writer at a time.
docker compose stop pennywise

# 2. List projects in the source.
docker compose run --rm --no-deps \
    -v /path/to/budget.db:/data/budget.db:ro \
    --entrypoint migrate \
    pennywise ihatemoney inspect --ihatemoney-db /data/budget.db

# 3. Emit a mapping skeleton for one project. The redirect happens on the
#    host, so `mapping.json` lands in your current working directory.
docker compose run --rm --no-deps -T \
    -v /path/to/budget.db:/data/budget.db:ro \
    --entrypoint migrate \
    pennywise ihatemoney inspect \
      --ihatemoney-db /data/budget.db \
      --project roommates > mapping.json

# 4. Edit mapping.json on the host: set the creator and, per person,
#    either user_email or user_id (both checked against the live DB).

# 5. Dry-run — validates the mapping and prints per-currency totals
#    and warnings. Zero writes.
docker compose run --rm --no-deps \
    -v /path/to/budget.db:/data/budget.db:ro \
    -v "$PWD/mapping.json:/data/mapping.json:ro" \
    --entrypoint migrate \
    pennywise ihatemoney plan \
      --ihatemoney-db /data/budget.db \
      --project roommates \
      --mapping /data/mapping.json

# 6. Apply. The Pennywise volume is already mounted by the compose service,
#    so the migrator writes to the same `pennywise.db` the server uses.
docker compose run --rm --no-deps \
    -v /path/to/budget.db:/data/budget.db:ro \
    -v "$PWD/mapping.json:/data/mapping.json:ro" \
    --entrypoint migrate \
    pennywise ihatemoney apply \
      --ihatemoney-db /data/budget.db \
      --project roommates \
      --mapping /data/mapping.json

# 7. Restart the server.
docker compose start pennywise
```

`apply` prints the new group ID on success. On failure the entire transaction
rolls back — nothing is written.

Notes:

- `--no-deps` skips starting linked services (e.g. a reverse proxy) for the
  one-off run.
- `-T` on step 3 disables TTY allocation so the redirect to `mapping.json`
  captures clean stdout.
- The `pennywise` service must already have its data volume defined in
  `compose.yml` — `docker compose run` inherits the same mounts and env
  (so `DB_PATH` and `AUTH_SECRET` are already wired up).

## Running (plain `docker run`)

If you're not using Compose, mount the same data volume the server uses and
pass `DB_PATH` / `AUTH_SECRET` explicitly. Substitute `pennywise-data` for
your volume name (or use a bind mount).

```bash
# Stop the running container first.
docker stop pennywise

# Inspect.
docker run --rm \
    -v pennywise-data:/data \
    -v /path/to/budget.db:/data/budget.db:ro \
    -e DB_PATH=/data/pennywise.db \
    -e AUTH_SECRET=... \
    --entrypoint migrate \
    ghcr.io/frysztak/pennywise:latest \
    ihatemoney inspect --ihatemoney-db /data/budget.db --project roommates > mapping.json

# Plan / apply follow the same pattern; add
#     -v "$PWD/mapping.json:/data/mapping.json:ro"
# and pass --mapping /data/mapping.json.

docker start pennywise
```

Use the **same image tag** as the running server. The migrator and the
server share `db/schema`, so a version mismatch can write rows the running
server doesn't understand.

## From source

If you have a Go toolchain and a checkout, you can skip Docker:

```bash
# .env must define DB_PATH and AUTH_SECRET — same file the server uses.

# ihatemoney
go run ./cmd/migrate ihatemoney inspect --ihatemoney-db /path/to/budget.db
go run ./cmd/migrate ihatemoney inspect --ihatemoney-db /path/to/budget.db \
    --project roommates > mapping.json
# edit mapping.json
go run ./cmd/migrate ihatemoney plan  --ihatemoney-db /path/to/budget.db \
    --project roommates --mapping mapping.json
# stop the server, then:
go run ./cmd/migrate ihatemoney apply --ihatemoney-db /path/to/budget.db \
    --project roommates --mapping mapping.json

# Splitwise
go run ./cmd/migrate splitwise inspect --splitwise-csv "My Group.csv"
go run ./cmd/migrate splitwise inspect --splitwise-csv "My Group.csv" \
    --project "My Group" > mapping.json
# edit mapping.json
go run ./cmd/migrate splitwise plan  --splitwise-csv "My Group.csv" --mapping mapping.json
# stop the server, then:
go run ./cmd/migrate splitwise apply --splitwise-csv "My Group.csv" --mapping mapping.json
```

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
- The Pennywise server must be stopped during `apply` — SQLite allows only
  one writer.
- Amounts are converted float → cents with rounding; warnings are printed
  for any amount that doesn't round cleanly to two decimals.

## Adding a new source

A backend lives in `migrate/<name>/`, implements `migrate.Source`
(`Name`, `Projects`, `Project`, `Persons`, `Build`, `Close`), and is
registered with the CLI by adding a `sourceBuilder` in
`cmd/migrate/sources_<name>.go`. The shared mapping/validation/apply
pipeline does the rest.
