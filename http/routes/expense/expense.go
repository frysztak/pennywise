package expense

import (
	"context"
	"pennywise/db"
	"pennywise/db/database"
	apiv1 "pennywise/gen/api/v1"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
)

type ExpenseService struct{}

func NewExpenseService() *ExpenseService {
	return &ExpenseService{}
}

func (s *ExpenseService) CreateExpense(ctx context.Context, r *apiv1.CreateExpenseRequest) (*apiv1.CreateExpenseResponse, error) {
	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	defer tx.Rollback()

	qtx := db.Queries.WithTx(tx)

	expense, err := qtx.CreateExpense(ctx, database.CreateExpenseParams{
		ID:          uuid.NewString(),
		Name:        r.Name,
		Description: &r.Description,
		GroupID:     r.GroupId,
		RecurringID: nil,
		CreatedAt:   time.Now(),
		Currency:    r.Currency,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	_, err = qtx.CreateExpensePayer(ctx, database.CreateExpensePayerParams{
		ID:        uuid.NewString(),
		ExpenseID: expense.ID,
		UserID:    r.PayerId,
		Amount:    int64(r.Amount * 100),
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	for _, beneficiaryId := range r.BeneficiariesIds {
		_, err = qtx.CreateExpenseBeneficiary(ctx, database.CreateExpenseBeneficiaryParams{
			ID:        uuid.NewString(),
			ExpenseID: expense.ID,
			UserID:    beneficiaryId,
		})
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}
	}

	err = tx.Commit()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return &apiv1.CreateExpenseResponse{
		Id:   expense.ID,
		Name: expense.Name,
	}, nil
}
