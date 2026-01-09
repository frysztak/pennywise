package recurring_expense

import (
	"context"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type RecurringExpenseService struct{}

func NewRecurringExpenseService() *RecurringExpenseService {
	return &RecurringExpenseService{}
}

// frequencyToString converts RecurringFrequency enum to database string
func frequencyToString(freq apiv1.RecurringFrequency) string {
	switch freq {
	case apiv1.RecurringFrequency_RECURRING_FREQUENCY_DAILY:
		return "daily"
	case apiv1.RecurringFrequency_RECURRING_FREQUENCY_WEEKLY:
		return "weekly"
	case apiv1.RecurringFrequency_RECURRING_FREQUENCY_MONTHLY:
		return "monthly"
	case apiv1.RecurringFrequency_RECURRING_FREQUENCY_YEARLY:
		return "yearly"
	default:
		return "monthly"
	}
}

// StringToFrequency converts database string to RecurringFrequency enum
func StringToFrequency(s string) apiv1.RecurringFrequency {
	switch strings.ToLower(s) {
	case "daily":
		return apiv1.RecurringFrequency_RECURRING_FREQUENCY_DAILY
	case "weekly":
		return apiv1.RecurringFrequency_RECURRING_FREQUENCY_WEEKLY
	case "monthly":
		return apiv1.RecurringFrequency_RECURRING_FREQUENCY_MONTHLY
	case "yearly":
		return apiv1.RecurringFrequency_RECURRING_FREQUENCY_YEARLY
	default:
		return apiv1.RecurringFrequency_RECURRING_FREQUENCY_MONTHLY
	}
}

func (s *RecurringExpenseService) CreateRecurringExpense(ctx context.Context, req *apiv1.CreateRecurringExpenseRequest) (*apiv1.CreateRecurringExpenseResponse, error) {
	logger := log.FromContext(ctx)

	var amount *int64
	if req.Amount != nil {
		cents := int64(*req.Amount * 100)
		amount = &cents
	}

	recurringExpense, err := db.WriteQueries.CreateRecurringExpense(ctx, database.CreateRecurringExpenseParams{
		ID:             uuid.NewString(),
		CreatedAt:      overrides.TextTime{Time: time.Now()},
		GroupID:        req.GroupId,
		Name:           req.Name,
		Description:    &req.Description,
		Frequency:      frequencyToString(req.Frequency),
		StartDate:      overrides.TextTime{Time: req.StartDate.AsTime()},
		NextOccurrence: overrides.TextTime{Time: req.StartDate.AsTime()},
		PayerID:        req.PayerId,
		Amount:         amount,
		Currency:       req.Currency,
	})
	if err != nil {
		logger.Error("failed to create recurring expense", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("recurring expense created", "id", recurringExpense.ID, "name", recurringExpense.Name, "frequency", recurringExpense.Frequency)

	return &apiv1.CreateRecurringExpenseResponse{
		Id:   recurringExpense.ID,
		Name: recurringExpense.Name,
	}, nil
}

func (s *RecurringExpenseService) GetGroupRecurringExpenses(ctx context.Context, req *apiv1.GetGroupRecurringExpensesRequest) (*apiv1.GetGroupRecurringExpensesResponse, error) {
	logger := log.FromContext(ctx)

	rows, err := db.ReadQueries.GetGroupRecurringExpenses(ctx, req.GroupId)
	if err != nil {
		logger.Error("failed to get group recurring expenses", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	recurringExpenses := make([]*apiv1.GetGroupRecurringExpensesResponse_RecurringExpense, 0, len(rows))
	for _, row := range rows {
		re := &apiv1.GetGroupRecurringExpensesResponse_RecurringExpense{
			Id:             row.ID,
			CreatedAt:      timestamppb.New(row.CreatedAt.Time),
			GroupId:        row.GroupID,
			Name:           row.Name,
			Description:    row.Description,
			Frequency:      StringToFrequency(row.Frequency),
			StartDate:      timestamppb.New(row.StartDate.Time),
			NextOccurrence: timestamppb.New(row.NextOccurrence.Time),
		}

		if row.PayerID != nil {
			re.PayerId = row.PayerID
			if row.PayerName != nil {
				re.PayerName = row.PayerName
			}
		}

		if row.Amount != nil {
			amount := float64(*row.Amount) / 100
			re.Amount = &amount
		}

		if row.Currency != nil {
			re.Currency = row.Currency
		}

		recurringExpenses = append(recurringExpenses, re)
	}

	return &apiv1.GetGroupRecurringExpensesResponse{
		RecurringExpenses: recurringExpenses,
	}, nil
}

func (s *RecurringExpenseService) UpdateRecurringExpense(ctx context.Context, req *apiv1.UpdateRecurringExpenseRequest) (*apiv1.UpdateRecurringExpenseResponse, error) {
	logger := log.FromContext(ctx)

	var amount *int64
	if req.Amount != nil {
		cents := int64(*req.Amount * 100)
		amount = &cents
	}

	recurringExpense, err := db.WriteQueries.UpdateRecurringExpense(ctx, database.UpdateRecurringExpenseParams{
		ID:          req.Id,
		Name:        req.Name,
		Description: &req.Description,
		Frequency:   frequencyToString(req.Frequency),
		PayerID:     req.PayerId,
		Amount:      amount,
		Currency:    req.Currency,
	})
	if err != nil {
		logger.Error("failed to update recurring expense", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("recurring expense updated", "id", recurringExpense.ID)

	return &apiv1.UpdateRecurringExpenseResponse{
		Id:   recurringExpense.ID,
		Name: recurringExpense.Name,
	}, nil
}

func (s *RecurringExpenseService) DeleteRecurringExpense(ctx context.Context, req *apiv1.DeleteRecurringExpenseRequest) (*apiv1.DeleteRecurringExpenseResponse, error) {
	logger := log.FromContext(ctx)

	err := db.WriteQueries.DeleteRecurringExpense(ctx, req.Id)
	if err != nil {
		logger.Error("failed to delete recurring expense", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("recurring expense deleted", "id", req.Id)

	return &apiv1.DeleteRecurringExpenseResponse{}, nil
}

func (s *RecurringExpenseService) PayRecurringExpense(ctx context.Context, req *apiv1.PayRecurringExpenseRequest) (*apiv1.PayRecurringExpenseResponse, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)

	// Get the recurring expense template
	template, err := db.ReadQueries.GetRecurringExpense(ctx, req.RecurringExpenseId)
	if err != nil {
		logger.Error("failed to get recurring expense", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Determine values (use overrides or template defaults)
	payerID := session.UserID
	if req.PayerId != nil {
		payerID = *req.PayerId
	} else if template.PayerID != nil {
		payerID = *template.PayerID
	}

	amount := float64(0)
	if req.Amount != nil {
		amount = *req.Amount
	} else if template.Amount != nil {
		amount = float64(*template.Amount) / 100
	}

	expenseDate := time.Now()
	if req.Date != nil {
		expenseDate = req.Date.AsTime()
	}

	currency := "USD"
	if template.Currency != nil {
		currency = *template.Currency
	}

	// Get all group members for beneficiaries
	members, err := db.ReadQueries.GetGroupMembers(ctx, template.GroupID)
	if err != nil {
		logger.Error("failed to get group members", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Create expense in transaction
	tx, err := db.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		logger.Error("failed to begin transaction", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	defer tx.Rollback()

	qtx := db.WriteQueries.WithTx(tx)

	recurringID := template.ID
	expense, err := qtx.CreateExpense(ctx, database.CreateExpenseParams{
		ID:          uuid.NewString(),
		CreatedAt:   overrides.TextTime{Time: time.Now()},
		Name:        template.Name,
		Description: template.Description,
		GroupID:     template.GroupID,
		RecurringID: &recurringID,
		Date:        overrides.TextTime{Time: expenseDate},
		Currency:    currency,
	})
	if err != nil {
		logger.Error("failed to create expense from recurring", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Create payer
	_, err = qtx.CreateExpensePayer(ctx, database.CreateExpensePayerParams{
		ID:        uuid.NewString(),
		ExpenseID: expense.ID,
		UserID:    payerID,
		Amount:    int64(amount * 100),
	})
	if err != nil {
		logger.Error("failed to create expense payer", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Create beneficiaries (all group members)
	userIDs := make([]string, len(members))
	for i, member := range members {
		userIDs[i] = member.UserID
	}
	err = db.CreateExpenseBeneficiariesBatch(ctx, tx, expense.ID, userIDs)
	if err != nil {
		logger.Error("failed to create expense beneficiaries", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Calculate next occurrence
	nextOccurrence := calculateNextOccurrence(template.NextOccurrence.Time, template.Frequency)
	err = qtx.UpdateNextOccurrence(ctx, database.UpdateNextOccurrenceParams{
		ID:             template.ID,
		NextOccurrence: overrides.TextTime{Time: nextOccurrence},
	})
	if err != nil {
		logger.Error("failed to update next occurrence", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	err = tx.Commit()
	if err != nil {
		logger.Error("failed to commit transaction", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("expense created from recurring template", "expense_id", expense.ID, "recurring_id", template.ID, "next_occurrence", nextOccurrence)

	return &apiv1.PayRecurringExpenseResponse{
		ExpenseId:      expense.ID,
		NextOccurrence: timestamppb.New(nextOccurrence),
	}, nil
}

func (s *RecurringExpenseService) SkipRecurringExpense(ctx context.Context, req *apiv1.SkipRecurringExpenseRequest) (*apiv1.SkipRecurringExpenseResponse, error) {
	logger := log.FromContext(ctx)

	// Get the recurring expense template
	template, err := db.ReadQueries.GetRecurringExpense(ctx, req.RecurringExpenseId)
	if err != nil {
		logger.Error("failed to get recurring expense", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Calculate next occurrence
	nextOccurrence := calculateNextOccurrence(template.NextOccurrence.Time, template.Frequency)
	err = db.WriteQueries.UpdateNextOccurrence(ctx, database.UpdateNextOccurrenceParams{
		ID:             template.ID,
		NextOccurrence: overrides.TextTime{Time: nextOccurrence},
	})
	if err != nil {
		logger.Error("failed to update next occurrence", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("recurring expense skipped", "recurring_id", template.ID, "next_occurrence", nextOccurrence)

	return &apiv1.SkipRecurringExpenseResponse{
		NextOccurrence: timestamppb.New(nextOccurrence),
	}, nil
}

func calculateNextOccurrence(current time.Time, frequency string) time.Time {
	switch frequency {
	case "daily":
		return current.AddDate(0, 0, 1)
	case "weekly":
		return current.AddDate(0, 0, 7)
	case "monthly":
		return current.AddDate(0, 1, 0)
	case "yearly":
		return current.AddDate(1, 0, 0)
	default:
		return current.AddDate(0, 1, 0) // Default to monthly
	}
}
