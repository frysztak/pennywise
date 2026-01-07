package integration

import (
	"testing"
	"time"

	"pennywise/calc"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/routes/expense"
	"pennywise/http/routes/group"
	"pennywise/http/routes/transfer"

	"connectrpc.com/connect"
	"github.com/google/go-cmp/cmp"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestTransferFlow(t *testing.T) {
	setupTestDB(t)

	// Create two users
	aliceID := createTestUser(t, "alice.transfer@test.com", "Alice", "password123")
	bobID := createTestUser(t, "bob.transfer@test.com", "Bob", "password123")

	// Create group with Alice as creator
	groupID := createTestGroup(t, aliceID, "Transfer Test Group", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)

	ctx := createTestSession(t, aliceID)
	expenseService := expense.NewExpenseService()
	transferService := transfer.NewTransferService()
	groupService := group.NewGroupService()

	// Create expense: Alice pays $10, split with Bob
	// Result: Alice +5, Bob -5
	_, err := expenseService.CreateExpense(ctx, &apiv1.CreateExpenseRequest{
		GroupId:          groupID,
		Name:             "Lunch",
		PayerId:          aliceID,
		Amount:           10.00,
		Currency:         "USD",
		BeneficiariesIds: []string{aliceID, bobID},
		Date:             timestamppb.New(time.Now()),
	})
	if err != nil {
		t.Fatalf("CreateExpense failed: %v", err)
	}

	// Verify initial balances
	balances := getGroupBalances(t, groupID)
	wantBalances := calc.GroupBalance{
		aliceID: calc.PerCurrencyBalance{"USD": amount(5.00)},
		bobID:   calc.PerCurrencyBalance{"USD": amount(-5.00)},
	}
	if !cmp.Equal(balances, wantBalances) {
		t.Errorf("Before transfer - wrong balance:\n%s", cmp.Diff(wantBalances, balances))
	}

	// Create transfer: Bob sends $5 to Alice to settle the debt
	createResp, err := transferService.CreateTransfer(ctx, &apiv1.CreateTransferRequest{
		GroupId:    groupID,
		SenderId:   bobID,
		ReceiverId: aliceID,
		Amount:     5.00,
		Currency:   "USD",
		Date:       timestamppb.New(time.Now()),
	})
	if err != nil {
		t.Fatalf("CreateTransfer failed: %v", err)
	}
	transferID := createResp.Id

	// Verify balances settle to 0
	balances = getGroupBalances(t, groupID)
	wantBalances = calc.GroupBalance{
		aliceID: calc.PerCurrencyBalance{"USD": 0},
		bobID:   calc.PerCurrencyBalance{"USD": 0},
	}
	if !cmp.Equal(balances, wantBalances) {
		t.Errorf("After transfer - wrong balance:\n%s", cmp.Diff(wantBalances, balances))
	}

	// Verify activity shows both expense and transfer
	activityResp, err := groupService.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId: groupID,
	})
	if err != nil {
		t.Fatalf("GetGroupActivity failed: %v", err)
	}
	if len(activityResp.Items) != 2 {
		t.Errorf("Expected 2 activity items, got %d", len(activityResp.Items))
	}

	// Count activity types
	expenseCount, transferCount := 0, 0
	for _, item := range activityResp.Items {
		switch item.Type {
		case apiv1.GetGroupActivityResponse_ActivityItem_TYPE_EXPENSE:
			expenseCount++
		case apiv1.GetGroupActivityResponse_ActivityItem_TYPE_TRANSFER:
			transferCount++
		}
	}
	if expenseCount != 1 || transferCount != 1 {
		t.Errorf("Expected 1 expense and 1 transfer, got %d expenses and %d transfers", expenseCount, transferCount)
	}

	// Delete transfer and verify balances revert
	_, err = transferService.DeleteTransfer(ctx, &apiv1.DeleteTransferRequest{
		Id: transferID,
	})
	if err != nil {
		t.Fatalf("DeleteTransfer failed: %v", err)
	}

	balances = getGroupBalances(t, groupID)
	wantBalances = calc.GroupBalance{
		aliceID: calc.PerCurrencyBalance{"USD": amount(5.00)},
		bobID:   calc.PerCurrencyBalance{"USD": amount(-5.00)},
	}
	if !cmp.Equal(balances, wantBalances) {
		t.Errorf("After delete transfer - wrong balance:\n%s", cmp.Diff(wantBalances, balances))
	}
}

func TestTransferPartialSettlement(t *testing.T) {
	setupTestDB(t)

	aliceID := createTestUser(t, "alice.partial@test.com", "Alice", "password123")
	bobID := createTestUser(t, "bob.partial@test.com", "Bob", "password123")

	groupID := createTestGroup(t, aliceID, "Partial Settlement", "EUR")
	addUserToGroup(t, bobID, groupID, 1.0)

	ctx := createTestSession(t, aliceID)
	expenseService := expense.NewExpenseService()
	transferService := transfer.NewTransferService()

	// Create expense: Alice pays 20 EUR, split -> Alice +10, Bob -10
	_, err := expenseService.CreateExpense(ctx, &apiv1.CreateExpenseRequest{
		GroupId:          groupID,
		Name:             "Tickets",
		PayerId:          aliceID,
		Amount:           20.00,
		Currency:         "EUR",
		BeneficiariesIds: []string{aliceID, bobID},
		Date:             timestamppb.New(time.Now()),
	})
	if err != nil {
		t.Fatalf("CreateExpense failed: %v", err)
	}

	// Create partial transfer: Bob sends 7 EUR to Alice
	_, err = transferService.CreateTransfer(ctx, &apiv1.CreateTransferRequest{
		GroupId:    groupID,
		SenderId:   bobID,
		ReceiverId: aliceID,
		Amount:     7.00,
		Currency:   "EUR",
		Date:       timestamppb.New(time.Now()),
	})
	if err != nil {
		t.Fatalf("CreateTransfer failed: %v", err)
	}

	// Verify partial settlement: Alice +3, Bob -3
	balances := getGroupBalances(t, groupID)
	wantBalances := calc.GroupBalance{
		aliceID: calc.PerCurrencyBalance{"EUR": amount(3.00)},
		bobID:   calc.PerCurrencyBalance{"EUR": amount(-3.00)},
	}
	if !cmp.Equal(balances, wantBalances) {
		t.Errorf("Partial settlement - wrong balance:\n%s", cmp.Diff(wantBalances, balances))
	}
}

func TestTransferValidation(t *testing.T) {
	setupTestDB(t)

	aliceID := createTestUser(t, "alice.val@test.com", "Alice", "password123")
	bobID := createTestUser(t, "bob.val@test.com", "Bob", "password123")
	outsiderID := createTestUser(t, "outsider@test.com", "Outsider", "password123")

	groupID := createTestGroup(t, aliceID, "Validation Test", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	// outsider is NOT in the group

	ctx := createTestSession(t, aliceID)
	transferService := transfer.NewTransferService()

	// Test: sender not in group
	_, err := transferService.CreateTransfer(ctx, &apiv1.CreateTransferRequest{
		GroupId:    groupID,
		SenderId:   outsiderID,
		ReceiverId: aliceID,
		Amount:     10.00,
		Currency:   "USD",
		Date:       timestamppb.New(time.Now()),
	})
	if err == nil {
		t.Error("Expected error for sender not in group")
	}
	if connectErr, ok := err.(*connect.Error); ok {
		if connectErr.Code() != connect.CodeInvalidArgument {
			t.Errorf("Expected CodeInvalidArgument, got %v", connectErr.Code())
		}
	}

	// Test: receiver not in group
	_, err = transferService.CreateTransfer(ctx, &apiv1.CreateTransferRequest{
		GroupId:    groupID,
		SenderId:   aliceID,
		ReceiverId: outsiderID,
		Amount:     10.00,
		Currency:   "USD",
		Date:       timestamppb.New(time.Now()),
	})
	if err == nil {
		t.Error("Expected error for receiver not in group")
	}
	if connectErr, ok := err.(*connect.Error); ok {
		if connectErr.Code() != connect.CodeInvalidArgument {
			t.Errorf("Expected CodeInvalidArgument, got %v", connectErr.Code())
		}
	}

	// Test: self-transfer (sender == receiver)
	_, err = transferService.CreateTransfer(ctx, &apiv1.CreateTransferRequest{
		GroupId:    groupID,
		SenderId:   aliceID,
		ReceiverId: aliceID,
		Amount:     10.00,
		Currency:   "USD",
		Date:       timestamppb.New(time.Now()),
	})
	if err == nil {
		t.Error("Expected error for self-transfer")
	}
	if connectErr, ok := err.(*connect.Error); ok {
		if connectErr.Code() != connect.CodeInvalidArgument {
			t.Errorf("Expected CodeInvalidArgument, got %v", connectErr.Code())
		}
	}
}

func TestMultiCurrencyBalances(t *testing.T) {
	setupTestDB(t)

	aliceID := createTestUser(t, "alice.multi@test.com", "Alice", "password123")
	bobID := createTestUser(t, "bob.multi@test.com", "Bob", "password123")

	groupID := createTestGroup(t, aliceID, "Multi Currency", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)

	ctx := createTestSession(t, aliceID)
	expenseService := expense.NewExpenseService()

	// Create USD expense
	_, err := expenseService.CreateExpense(ctx, &apiv1.CreateExpenseRequest{
		GroupId:          groupID,
		Name:             "US Dinner",
		PayerId:          aliceID,
		Amount:           20.00,
		Currency:         "USD",
		BeneficiariesIds: []string{aliceID, bobID},
		Date:             timestamppb.New(time.Now()),
	})
	if err != nil {
		t.Fatalf("CreateExpense (USD) failed: %v", err)
	}

	// Create EUR expense
	_, err = expenseService.CreateExpense(ctx, &apiv1.CreateExpenseRequest{
		GroupId:          groupID,
		Name:             "EU Lunch",
		PayerId:          bobID,
		Amount:           30.00,
		Currency:         "EUR",
		BeneficiariesIds: []string{aliceID, bobID},
		Date:             timestamppb.New(time.Now()),
	})
	if err != nil {
		t.Fatalf("CreateExpense (EUR) failed: %v", err)
	}

	// Verify separate balances per currency
	balances := getGroupBalances(t, groupID)
	wantBalances := calc.GroupBalance{
		aliceID: calc.PerCurrencyBalance{
			"USD": amount(10.00),  // Alice paid $20, split $10 each -> +10
			"EUR": amount(-15.00), // Bob paid 30 EUR, split 15 each -> -15
		},
		bobID: calc.PerCurrencyBalance{
			"USD": amount(-10.00),
			"EUR": amount(15.00),
		},
	}
	if !cmp.Equal(balances, wantBalances) {
		t.Errorf("Multi-currency - wrong balance:\n%s", cmp.Diff(wantBalances, balances))
	}
}
