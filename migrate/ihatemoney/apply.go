package ihatemoney

import (
	"context"
	"encoding/json"
	"fmt"
	"pennywise/db"
	"pennywise/db/database"
)

// Apply writes a Plan to the live Pennywise database inside a single
// transaction. On any error the entire group is rolled back so partial
// imports cannot end up persisted.
func Apply(ctx context.Context, plan *Plan) (string, error) {
	tx, err := db.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	qtx := db.WriteQueries.WithTx(tx)

	if _, err := qtx.CreateGroup(ctx, plan.Group); err != nil {
		return "", fmt.Errorf("create group: %w", err)
	}

	// Encode currencies as a JSON array — the BulkAddGroupCurrencies
	// query consumes it via SQLite's json_each().
	currenciesJSON, err := json.Marshal(plan.Currencies)
	if err != nil {
		return "", fmt.Errorf("marshal currencies: %w", err)
	}
	if err := qtx.BulkAddGroupCurrencies(ctx, database.BulkAddGroupCurrenciesParams{
		GroupID:    plan.GroupID,
		Currencies: string(currenciesJSON),
	}); err != nil {
		return "", fmt.Errorf("add currencies: %w", err)
	}

	for _, m := range plan.Members {
		if _, err := qtx.AddUserToGroup(ctx, m); err != nil {
			return "", fmt.Errorf("add member %s: %w", m.UserID, err)
		}
	}

	for _, e := range plan.Expenses {
		if _, err := qtx.CreateExpense(ctx, e.Expense); err != nil {
			return "", fmt.Errorf("create expense %q: %w", e.Expense.Name, err)
		}
		if _, err := qtx.CreateExpensePayer(ctx, e.Payer); err != nil {
			return "", fmt.Errorf("create payer for %q: %w", e.Expense.Name, err)
		}
		if err := db.CreateExpenseBeneficiariesBatch(ctx, tx, e.Expense.ID, e.Beneficiaries); err != nil {
			return "", fmt.Errorf("create beneficiaries for %q: %w", e.Expense.Name, err)
		}
	}

	for _, t := range plan.Transfers {
		if _, err := qtx.CreateTransfer(ctx, t); err != nil {
			return "", fmt.Errorf("create transfer: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	return plan.GroupID, nil
}
