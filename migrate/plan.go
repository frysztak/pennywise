// Package migrate contains the source-agnostic core of the import tool:
// the Plan/Apply pipeline, the mapping format, and validation against the
// live Pennywise database. Per-source packages (e.g. migrate/ihatemoney)
// produce a Plan by implementing the Source interface defined here.
package migrate

import (
	"pennywise/db/database"
	"time"
)

// Plan is the immutable output of a source's Build step. Apply walks it
// once and writes every row inside a single transaction.
type Plan struct {
	GroupID    string
	Group      database.CreateGroupParams
	Currencies []string // distinct currencies seen in records + default; used for group_currencies
	Members    []database.AddUserToGroupParams
	Expenses   []PlannedExpense
	Transfers  []database.CreateTransferParams
	Warnings   []string
}

// PlannedExpense bundles every row that makes up one Pennywise expense:
// the expense itself, exactly one payer row, and N beneficiary rows.
type PlannedExpense struct {
	Expense       database.CreateExpenseParams
	Payer         database.CreateExpensePayerParams
	Beneficiaries []string // pennywise user IDs
}

// BuildOptions tweaks transformation behavior shared by all sources.
// Source-specific knobs (e.g. ihatemoney's StrictReimbursement) live on the
// source's own constructor options.
type BuildOptions struct {
	// Now is the clock used for created_at on derived rows that don't have
	// a source equivalent (group, group memberships). Defaults to time.Now()
	// when zero.
	Now time.Time
}
