package expense

import (
	"context"
	"pennywise/db"
	"pennywise/db/database"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/utils"
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

	// Parse date from request, default to now if not provided
	expenseDate := time.Now()
	if r.Date != nil && *r.Date != "" {
		parsed, err := time.Parse(time.RFC3339, *r.Date)
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
		expenseDate = parsed
	}

	expense, err := qtx.CreateExpense(ctx, database.CreateExpenseParams{
		ID:          uuid.NewString(),
		Name:        r.Name,
		Description: &r.Description,
		GroupID:     r.GroupId,
		RecurringID: nil,
		Date:        expenseDate,
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

func (s *ExpenseService) GetGroupExpenses(ctx context.Context, r *apiv1.GetGroupExpensesRequest) (*apiv1.GetGroupExpensesResponse, error) {
	rows, err := db.Queries.GetGroupExpenses(ctx, r.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	expenses := make([]*apiv1.GetGroupExpensesResponse_Expense, 0, len(rows))
	for _, row := range rows {
		beneficiariesIds, err := utils.JSONStringToSlice(row.BeneficiariesIds)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		expenses = append(expenses, &apiv1.GetGroupExpensesResponse_Expense{
			Id:               row.ID,
			CreatedAt:        row.CreatedAt.Format(time.RFC3339),
			Date:             row.Date.Format(time.RFC3339),
			Name:             row.Name,
			Description:      row.Description,
			Currency:         row.Currency,
			PayerId:          row.PayerID,
			PayerName:        row.PayerName,
			Amount:           row.Amount,
			BeneficiariesIds: beneficiariesIds,
		})
	}

	return &apiv1.GetGroupExpensesResponse{Expenses: expenses}, nil
}

func (s *ExpenseService) UpdateExpense(ctx context.Context, r *apiv1.UpdateExpenseRequest) (*apiv1.UpdateExpenseResponse, error) {
	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	defer tx.Rollback()

	qtx := db.Queries.WithTx(tx)

	// Parse date from request
	var expenseDate time.Time
	if r.Date != nil && *r.Date != "" {
		parsed, err := time.Parse(time.RFC3339, *r.Date)
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
		expenseDate = parsed
	}

	// Update expense basic info
	expense, err := qtx.UpdateExpense(ctx, database.UpdateExpenseParams{
		ID:          r.Id,
		Name:        r.Name,
		Description: &r.Description,
		Currency:    r.Currency,
		Date:        expenseDate,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Update payer
	err = qtx.UpdateExpensePayer(ctx, database.UpdateExpensePayerParams{
		ExpenseID: r.Id,
		UserID:    r.PayerId,
		Amount:    int64(r.Amount * 100),
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Delete old beneficiaries and insert new ones
	err = qtx.DeleteExpenseBeneficiaries(ctx, r.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	for _, beneficiaryId := range r.BeneficiariesIds {
		_, err = qtx.CreateExpenseBeneficiary(ctx, database.CreateExpenseBeneficiaryParams{
			ID:        uuid.NewString(),
			ExpenseID: r.Id,
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

	return &apiv1.UpdateExpenseResponse{
		Id:   expense.ID,
		Name: expense.Name,
	}, nil
}

func (s *ExpenseService) DeleteExpense(ctx context.Context, r *apiv1.DeleteExpenseRequest) (*apiv1.DeleteExpenseResponse, error) {
	err := db.Queries.DeleteExpense(ctx, r.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return &apiv1.DeleteExpenseResponse{}, nil
}
