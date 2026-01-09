package db

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/google/uuid"
)

type beneficiaryEntry struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
}

// CreateExpenseBeneficiariesBatch inserts multiple beneficiaries in a single query.
// This is a raw SQL helper because sqlc doesn't properly detect parameters inside
// json_each() function calls - it fails to generate the second parameter binding.
const createExpenseBeneficiariesBatchQuery = `
INSERT INTO expense_beneficiaries (id, expense_id, user_id)
SELECT
    json_extract(j.value, '$.id'),
    ?,
    json_extract(j.value, '$.user_id')
FROM json_each(?) AS j
`

func CreateExpenseBeneficiariesBatch(ctx context.Context, tx *sql.Tx, expenseID string, userIDs []string) error {
	if len(userIDs) == 0 {
		return nil
	}

	entries := make([]beneficiaryEntry, len(userIDs))
	for i, userID := range userIDs {
		entries[i] = beneficiaryEntry{ID: uuid.NewString(), UserID: userID}
	}

	beneficiariesJSON, err := json.Marshal(entries)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, createExpenseBeneficiariesBatchQuery, expenseID, string(beneficiariesJSON))
	return err
}
