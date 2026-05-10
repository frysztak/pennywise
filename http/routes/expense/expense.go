package expense

import (
	"context"
	"database/sql"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/log"
	"pennywise/utils"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type ExpenseService struct{}

func NewExpenseService() *ExpenseService {
	return &ExpenseService{}
}

func (s *ExpenseService) CreateExpense(ctx context.Context, r *apiv1.CreateExpenseRequest) (*apiv1.CreateExpenseResponse, error) {
	logger := log.FromContext(ctx)
	tx, err := db.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		logger.Error("failed to begin transaction", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	defer tx.Rollback()

	resp, err := createExpenseTx(ctx, tx, r)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		logger.Error("failed to commit transaction", "error", err, "expense_id", resp.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return resp, nil
}

func (s *ExpenseService) BulkCreateExpenses(ctx context.Context, r *apiv1.BulkCreateExpensesRequest) (*apiv1.BulkCreateExpensesResponse, error) {
	logger := log.FromContext(ctx)
	tx, err := db.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		logger.Error("failed to begin transaction", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	defer tx.Rollback()

	out := make([]*apiv1.CreateExpenseResponse, 0, len(r.Expenses))
	for i, req := range r.Expenses {
		resp, err := createExpenseTx(ctx, tx, req)
		if err != nil {
			logger.Error("bulk create failed mid-flight", "error", err, "index", i, "name", req.Name)
			return nil, err
		}
		out = append(out, resp)
	}

	if err := tx.Commit(); err != nil {
		logger.Error("failed to commit bulk transaction", "error", err, "count", len(out))
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("bulk expenses created", "count", len(out))
	return &apiv1.BulkCreateExpensesResponse{Expenses: out}, nil
}

func createExpenseTx(ctx context.Context, tx *sql.Tx, r *apiv1.CreateExpenseRequest) (*apiv1.CreateExpenseResponse, error) {
	logger := log.FromContext(ctx)
	qtx := db.WriteQueries.WithTx(tx)

	expense, err := qtx.CreateExpense(ctx, database.CreateExpenseParams{
		ID:          uuid.NewString(),
		CreatedAt:   overrides.TextTime{Time: time.Now()},
		Name:        r.Name,
		Description: &r.Description,
		GroupID:     r.GroupId,
		RecurringID: nil,
		Date:        overrides.TextTime{Time: r.Date.AsTime()},
		Currency:    r.Currency,
	})
	if err != nil {
		logger.Error("failed to create expense", "error", err, "group_id", r.GroupId, "name", r.Name)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	_, err = qtx.CreateExpensePayer(ctx, database.CreateExpensePayerParams{
		ID:        uuid.NewString(),
		ExpenseID: expense.ID,
		UserID:    r.PayerId,
		Amount:    int64(r.Amount * 100),
	})
	if err != nil {
		logger.Error("failed to create expense payer", "error", err, "expense_id", expense.ID, "payer_id", r.PayerId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err := db.CreateExpenseBeneficiariesBatch(ctx, tx, expense.ID, r.BeneficiariesIds); err != nil {
		logger.Error("failed to create expense beneficiaries", "error", err, "expense_id", expense.ID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("expense created successfully", "expense_id", expense.ID, "group_id", r.GroupId, "name", r.Name, "amount", r.Amount, "currency", r.Currency)

	return &apiv1.CreateExpenseResponse{
		Id:   expense.ID,
		Name: expense.Name,
	}, nil
}

func (s *ExpenseService) GetGroupExpenses(ctx context.Context, r *apiv1.GetGroupExpensesRequest) (*apiv1.GetGroupExpensesResponse, error) {
	logger := log.FromContext(ctx)
	rows, err := db.ReadQueries.GetGroupExpenses(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group expenses", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	expenses := make([]*apiv1.GetGroupExpensesResponse_Expense, 0, len(rows))
	for _, row := range rows {
		beneficiariesIds, err := utils.JSONStringToSlice(row.BeneficiariesIds)
		if err != nil {
			logger.Error("failed to parse beneficiaries IDs", "error", err, "expense_id", row.ID, "beneficiaries_ids", row.BeneficiariesIds)
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		expenses = append(expenses, &apiv1.GetGroupExpensesResponse_Expense{
			Id:               row.ID,
			CreatedAt:        timestamppb.New(row.CreatedAt.Time),
			Date:             timestamppb.New(row.Date.Time),
			Name:             row.Name,
			Description:      row.Description,
			Currency:         row.Currency,
			PayerId:          row.PayerID,
			PayerName:        row.PayerName,
			Amount:           row.Amount,
			BeneficiariesIds: beneficiariesIds,
		})
	}

	logger.Info("group expenses retrieved", "group_id", r.GroupId, "count", len(expenses))

	return &apiv1.GetGroupExpensesResponse{Expenses: expenses}, nil
}

func (s *ExpenseService) UpdateExpense(ctx context.Context, r *apiv1.UpdateExpenseRequest) (*apiv1.UpdateExpenseResponse, error) {
	logger := log.FromContext(ctx)
	tx, err := db.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		logger.Error("failed to begin transaction", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	defer tx.Rollback()

	qtx := db.WriteQueries.WithTx(tx)

	// Update expense basic info
	expense, err := qtx.UpdateExpense(ctx, database.UpdateExpenseParams{
		ID:          r.Id,
		Name:        r.Name,
		Description: &r.Description,
		Currency:    r.Currency,
		Date:        overrides.TextTime{Time: r.Date.AsTime()},
	})
	if err != nil {
		logger.Error("failed to update expense", "error", err, "expense_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Update payer
	err = qtx.UpdateExpensePayer(ctx, database.UpdateExpensePayerParams{
		ExpenseID: r.Id,
		UserID:    r.PayerId,
		Amount:    int64(r.Amount * 100),
	})
	if err != nil {
		logger.Error("failed to update expense payer", "error", err, "expense_id", r.Id, "payer_id", r.PayerId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Delete old beneficiaries and insert new ones
	err = qtx.DeleteExpenseBeneficiaries(ctx, r.Id)
	if err != nil {
		logger.Error("failed to delete expense beneficiaries", "error", err, "expense_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	err = db.CreateExpenseBeneficiariesBatch(ctx, tx, r.Id, r.BeneficiariesIds)
	if err != nil {
		logger.Error("failed to create expense beneficiaries", "error", err, "expense_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	err = tx.Commit()
	if err != nil {
		logger.Error("failed to commit transaction", "error", err, "expense_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("expense updated successfully", "expense_id", r.Id, "name", r.Name, "amount", r.Amount, "currency", r.Currency)

	return &apiv1.UpdateExpenseResponse{
		Id:   expense.ID,
		Name: expense.Name,
	}, nil
}

func (s *ExpenseService) DeleteExpense(ctx context.Context, r *apiv1.DeleteExpenseRequest) (*apiv1.DeleteExpenseResponse, error) {
	logger := log.FromContext(ctx)
	err := db.WriteQueries.DeleteExpense(ctx, r.Id)
	if err != nil {
		logger.Error("failed to delete expense", "error", err, "expense_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("expense deleted successfully", "expense_id", r.Id)

	return &apiv1.DeleteExpenseResponse{}, nil
}
