package integration

import (
	"context"
	"testing"
	"time"

	"pennywise/calc"
	"pennywise/db"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/routes/expense"
	"pennywise/http/routes/group"

	"github.com/google/go-cmp/cmp"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestExpenseFlow(t *testing.T) {
	setupTestDB(t)

	// Create two users: Alice and Bob
	aliceID := createTestUser(t, "alice@test.com", "Alice", "password123")
	bobID := createTestUser(t, "bob@test.com", "Bob", "password123")

	// Create group with Alice as creator
	groupID := createTestGroup(t, aliceID, "Trip to Paris", "USD")

	// Add Bob to the group
	addUserToGroup(t, bobID, groupID, 1.0)

	// Create session context for Alice
	ctx := createTestSession(t, aliceID)

	// Create expense service
	expenseService := expense.NewExpenseService()
	groupService := group.NewGroupService()

	// Test 1: Create expense - Alice pays $30, split with Bob
	createResp, err := expenseService.CreateExpense(ctx, &apiv1.CreateExpenseRequest{
		GroupId:         groupID,
		Name:            "Dinner",
		Description:     "French dinner",
		PayerId:         aliceID,
		Amount:          30.00,
		Currency:        "USD",
		BeneficiariesIds: []string{aliceID, bobID},
		Date:            timestamppb.New(time.Now()),
	})
	if err != nil {
		t.Fatalf("CreateExpense failed: %v", err)
	}
	if createResp.Id == "" {
		t.Error("Expected expense ID to be non-empty")
	}
	expenseID := createResp.Id

	// Verify balances: Alice +15, Bob -15
	balances := getGroupBalances(t, groupID)
	wantBalances := calc.GroupBalance{
		aliceID: calc.PerCurrencyBalance{"USD": amount(15.00)},
		bobID:   calc.PerCurrencyBalance{"USD": amount(-15.00)},
	}
	if !cmp.Equal(balances, wantBalances) {
		t.Errorf("After create - wrong balance:\n%s", cmp.Diff(wantBalances, balances))
	}

	// Verify activity shows the expense
	activityResp, err := groupService.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId: groupID,
	})
	if err != nil {
		t.Fatalf("GetGroupActivity failed: %v", err)
	}
	if len(activityResp.Items) != 1 {
		t.Errorf("Expected 1 activity item, got %d", len(activityResp.Items))
	}
	if activityResp.Items[0].Type != apiv1.GetGroupActivityResponse_ActivityItem_TYPE_EXPENSE {
		t.Error("Expected activity item to be an expense")
	}

	// Test 2: Update expense - change amount to $20
	_, err = expenseService.UpdateExpense(ctx, &apiv1.UpdateExpenseRequest{
		Id:               expenseID,
		Name:             "Dinner (updated)",
		Description:      "French dinner - cheaper",
		PayerId:          aliceID,
		Amount:           20.00,
		Currency:         "USD",
		BeneficiariesIds: []string{aliceID, bobID},
		Date:             timestamppb.New(time.Now()),
	})
	if err != nil {
		t.Fatalf("UpdateExpense failed: %v", err)
	}

	// Verify balances updated: Alice +10, Bob -10
	balances = getGroupBalances(t, groupID)
	wantBalances = calc.GroupBalance{
		aliceID: calc.PerCurrencyBalance{"USD": amount(10.00)},
		bobID:   calc.PerCurrencyBalance{"USD": amount(-10.00)},
	}
	if !cmp.Equal(balances, wantBalances) {
		t.Errorf("After update - wrong balance:\n%s", cmp.Diff(wantBalances, balances))
	}

	// Test 3: Delete expense
	_, err = expenseService.DeleteExpense(ctx, &apiv1.DeleteExpenseRequest{
		Id: expenseID,
	})
	if err != nil {
		t.Fatalf("DeleteExpense failed: %v", err)
	}

	// Verify balances reset to 0
	balances = getGroupBalances(t, groupID)
	wantBalances = calc.GroupBalance{
		aliceID: calc.PerCurrencyBalance{"USD": 0},
		bobID:   calc.PerCurrencyBalance{"USD": 0},
	}
	if !cmp.Equal(balances, wantBalances) {
		t.Errorf("After delete - wrong balance:\n%s", cmp.Diff(wantBalances, balances))
	}
}

func TestExpenseWithWeightedSplit(t *testing.T) {
	setupTestDB(t)

	// Create users
	aliceID := createTestUser(t, "alice2@test.com", "Alice", "password123")
	bobID := createTestUser(t, "bob2@test.com", "Bob", "password123")
	charlieID := createTestUser(t, "charlie@test.com", "Charlie", "password123")

	// Create group
	groupID := createTestGroup(t, aliceID, "Roommates", "EUR")

	// Add members with different weights
	addUserToGroup(t, bobID, groupID, 1.0)
	addUserToGroup(t, charlieID, groupID, 2.0) // Charlie has double weight

	// Update Alice's weight to 1.0 (default already, but explicit)
	ctx := createTestSession(t, aliceID)
	expenseService := expense.NewExpenseService()

	// Create expense: Alice pays 40 EUR, split among all three
	// With weights 1:1:2, shares are 10:10:20
	// Alice paid 40, owes 10 -> balance +30
	// Bob paid 0, owes 10 -> balance -10
	// Charlie paid 0, owes 20 -> balance -20
	_, err := expenseService.CreateExpense(ctx, &apiv1.CreateExpenseRequest{
		GroupId:         groupID,
		Name:            "Groceries",
		Description:     "Weekly groceries",
		PayerId:         aliceID,
		Amount:          40.00,
		Currency:        "EUR",
		BeneficiariesIds: []string{aliceID, bobID, charlieID},
		Date:            timestamppb.New(time.Now()),
	})
	if err != nil {
		t.Fatalf("CreateExpense failed: %v", err)
	}

	balances := getGroupBalances(t, groupID)
	wantBalances := calc.GroupBalance{
		aliceID:   calc.PerCurrencyBalance{"EUR": amount(30.00)},
		bobID:     calc.PerCurrencyBalance{"EUR": amount(-10.00)},
		charlieID: calc.PerCurrencyBalance{"EUR": amount(-20.00)},
	}
	if !cmp.Equal(balances, wantBalances) {
		t.Errorf("Weighted split - wrong balance:\n%s", cmp.Diff(wantBalances, balances))
	}
}

func TestExpensePartialBeneficiaries(t *testing.T) {
	setupTestDB(t)

	aliceID := createTestUser(t, "alice3@test.com", "Alice", "password123")
	bobID := createTestUser(t, "bob3@test.com", "Bob", "password123")
	charlieID := createTestUser(t, "charlie3@test.com", "Charlie", "password123")

	groupID := createTestGroup(t, aliceID, "Friends", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	addUserToGroup(t, charlieID, groupID, 1.0)

	ctx := createTestSession(t, aliceID)
	expenseService := expense.NewExpenseService()

	// Create expense: Alice pays $10, only for herself and Bob (not Charlie)
	_, err := expenseService.CreateExpense(ctx, &apiv1.CreateExpenseRequest{
		GroupId:         groupID,
		Name:            "Movie tickets",
		Description:     "Just Alice and Bob",
		PayerId:         aliceID,
		Amount:          10.00,
		Currency:        "USD",
		BeneficiariesIds: []string{aliceID, bobID}, // Charlie not included
		Date:            timestamppb.New(time.Now()),
	})
	if err != nil {
		t.Fatalf("CreateExpense failed: %v", err)
	}

	balances := getGroupBalances(t, groupID)
	wantBalances := calc.GroupBalance{
		aliceID:   calc.PerCurrencyBalance{"USD": amount(5.00)},
		bobID:     calc.PerCurrencyBalance{"USD": amount(-5.00)},
		charlieID: calc.PerCurrencyBalance{"USD": 0},
	}
	if !cmp.Equal(balances, wantBalances) {
		t.Errorf("Partial beneficiaries - wrong balance:\n%s", cmp.Diff(wantBalances, balances))
	}
}

// getGroupBalances fetches members, expenses, and transfers, then computes balances
func getGroupBalances(t *testing.T, groupID string) calc.GroupBalance {
	t.Helper()
	ctx := context.Background()

	members, err := db.ReadQueries.GetGroupMembers(ctx, groupID)
	if err != nil {
		t.Fatalf("GetGroupMembers failed: %v", err)
	}

	expenses, err := db.ReadQueries.GetGroupExpenses(ctx, groupID)
	if err != nil {
		t.Fatalf("GetGroupExpenses failed: %v", err)
	}

	transfers, err := db.ReadQueries.GetGroupTransfersForBalance(ctx, groupID)
	if err != nil {
		t.Fatalf("GetGroupTransfersForBalance failed: %v", err)
	}

	// Get default currency from group
	group, err := db.ReadQueries.GetGroupById(ctx, groupID)
	if err != nil {
		t.Fatalf("GetGroupById failed: %v", err)
	}

	return calc.ComputeGroupBalance(&members, &expenses, &transfers, group.DefaultCurrency)
}
