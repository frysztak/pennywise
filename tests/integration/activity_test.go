package integration

import (
	"context"
	"testing"
	"time"

	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/routes/expense"
	"pennywise/http/routes/group"
	"pennywise/http/routes/transfer"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// seedExpense creates an expense paid by payerID, split equally among beneficiaries.
// The expense `date` is set to `date`; created_at is time.Now().
func seedExpense(t *testing.T, ctx context.Context, groupID, name, currency string, amount float64, payerID string, beneficiaries []string, date time.Time) string {
	t.Helper()
	resp, err := expense.NewExpenseService().CreateExpense(ctx, &apiv1.CreateExpenseRequest{
		GroupId:          groupID,
		Name:             name,
		PayerId:          payerID,
		Amount:           amount,
		Currency:         currency,
		BeneficiariesIds: beneficiaries,
		Date:             timestamppb.New(date),
	})
	if err != nil {
		t.Fatalf("seedExpense %q failed: %v", name, err)
	}
	return resp.Id
}

func seedTransfer(t *testing.T, ctx context.Context, groupID, currency string, amount float64, senderID, receiverID string, date time.Time) string {
	t.Helper()
	resp, err := transfer.NewTransferService().CreateTransfer(ctx, &apiv1.CreateTransferRequest{
		GroupId:    groupID,
		SenderId:   senderID,
		ReceiverId: receiverID,
		Amount:     amount,
		Currency:   currency,
		Date:       timestamppb.New(date),
	})
	if err != nil {
		t.Fatalf("seedTransfer failed: %v", err)
	}
	return resp.Id
}

// insertExpenseRaw inserts an expense directly via DB queries with caller-controlled
// id and created_at, enabling tie-break ordering tests.
func insertExpenseRaw(t *testing.T, groupID, id, payerID, beneficiaryID string, amount int64, currency string, date, createdAt time.Time) {
	t.Helper()
	ctx := context.Background()
	desc := ""
	_, err := db.WriteQueries.CreateExpense(ctx, database.CreateExpenseParams{
		ID:          id,
		CreatedAt:   overrides.TextTime{Time: createdAt},
		Date:        overrides.TextTime{Time: date},
		GroupID:     groupID,
		Name:        "raw expense " + id,
		Description: &desc,
		Currency:    currency,
	})
	if err != nil {
		t.Fatalf("insertExpenseRaw expense: %v", err)
	}
	_, err = db.WriteQueries.CreateExpensePayer(ctx, database.CreateExpensePayerParams{
		ID:        uuid.NewString(),
		ExpenseID: id,
		UserID:    payerID,
		Amount:    amount,
	})
	if err != nil {
		t.Fatalf("insertExpenseRaw payer: %v", err)
	}
	_, err = db.WriteQueries.CreateExpenseBeneficiary(ctx, database.CreateExpenseBeneficiaryParams{
		ID:        uuid.NewString(),
		ExpenseID: id,
		UserID:    beneficiaryID,
	})
	if err != nil {
		t.Fatalf("insertExpenseRaw beneficiary: %v", err)
	}
}

func TestActivityPaginationFirstPage(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.pag1@test.com", "Alice", "pw")
	bobID := createTestUser(t, "bob.pag1@test.com", "Bob", "pw")
	groupID := createTestGroup(t, aliceID, "Pag Test", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	ctx := createTestSession(t, aliceID)

	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	// 25 expenses, distinct dates descending so newest is "expense 24"
	for i := range 25 {
		seedExpense(t, ctx, groupID, "expense", "USD", 10, aliceID, []string{aliceID, bobID}, base.Add(time.Duration(i)*time.Hour))
	}

	gs := group.NewGroupService()
	resp, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId: groupID,
		Page:    &apiv1.PageRequest{Limit: 20},
	})
	if err != nil {
		t.Fatalf("GetGroupActivity: %v", err)
	}
	if got := len(resp.Items); got != 20 {
		t.Errorf("expected 20 items, got %d", got)
	}
	if resp.Page == nil || resp.Page.NextCursor == nil {
		t.Error("expected next_cursor set on first page when more rows exist")
	}
	if resp.Page == nil || resp.Page.TotalCount != 25 {
		t.Errorf("expected total_count=25, got %d", resp.Page.GetTotalCount())
	}
}

func TestActivityPaginationSubsequentNoDuplicates(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.pag2@test.com", "Alice", "pw")
	bobID := createTestUser(t, "bob.pag2@test.com", "Bob", "pw")
	groupID := createTestGroup(t, aliceID, "Pag2", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	ctx := createTestSession(t, aliceID)

	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for i := range 45 {
		seedExpense(t, ctx, groupID, "expense", "USD", 10, aliceID, []string{aliceID, bobID}, base.Add(time.Duration(i)*time.Hour))
	}

	gs := group.NewGroupService()
	seen := make(map[string]bool)
	var cursor *string
	totalReturned := 0
	for page := range 5 { // safety bound
		resp, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
			GroupId: groupID,
			Page:    &apiv1.PageRequest{Limit: 20, Cursor: cursor},
		})
		if err != nil {
			t.Fatalf("page %d: %v", page, err)
		}
		for _, item := range resp.Items {
			id := item.GetExpense().Id
			if seen[id] {
				t.Errorf("duplicate item across pages: %s", id)
			}
			seen[id] = true
			totalReturned++
		}
		if resp.Page == nil || resp.Page.NextCursor == nil {
			break
		}
		cursor = resp.Page.NextCursor
	}
	if totalReturned != 45 {
		t.Errorf("expected 45 items across pages, got %d", totalReturned)
	}
}

func TestActivityPaginationLastPage(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.pag3@test.com", "Alice", "pw")
	bobID := createTestUser(t, "bob.pag3@test.com", "Bob", "pw")
	groupID := createTestGroup(t, aliceID, "Pag3", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	ctx := createTestSession(t, aliceID)

	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for i := range 13 {
		seedExpense(t, ctx, groupID, "expense", "USD", 10, aliceID, []string{aliceID, bobID}, base.Add(time.Duration(i)*time.Hour))
	}

	gs := group.NewGroupService()
	resp, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId: groupID,
		Page:    &apiv1.PageRequest{Limit: 20},
	})
	if err != nil {
		t.Fatalf("GetGroupActivity: %v", err)
	}
	if got := len(resp.Items); got != 13 {
		t.Errorf("expected 13 items, got %d", got)
	}
	if resp.Page != nil && resp.Page.NextCursor != nil {
		t.Errorf("expected nil next_cursor on last page, got %q", *resp.Page.NextCursor)
	}
	if resp.Page == nil || resp.Page.TotalCount != 13 {
		t.Errorf("expected total_count=13, got %d", resp.Page.GetTotalCount())
	}
}

func TestActivityPaginationExactBoundary(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.pag4@test.com", "Alice", "pw")
	bobID := createTestUser(t, "bob.pag4@test.com", "Bob", "pw")
	groupID := createTestGroup(t, aliceID, "Pag4", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	ctx := createTestSession(t, aliceID)

	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for i := range 20 {
		seedExpense(t, ctx, groupID, "expense", "USD", 10, aliceID, []string{aliceID, bobID}, base.Add(time.Duration(i)*time.Hour))
	}

	gs := group.NewGroupService()
	resp, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId: groupID,
		Page:    &apiv1.PageRequest{Limit: 20},
	})
	if err != nil {
		t.Fatalf("GetGroupActivity: %v", err)
	}
	if got := len(resp.Items); got != 20 {
		t.Errorf("expected 20 items, got %d", got)
	}
	if resp.Page != nil && resp.Page.NextCursor != nil {
		t.Errorf("expected nil next_cursor when total == limit, got %q", *resp.Page.NextCursor)
	}
}

func TestActivityPaginationLimitDefaultsTo20(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.pag5@test.com", "Alice", "pw")
	bobID := createTestUser(t, "bob.pag5@test.com", "Bob", "pw")
	groupID := createTestGroup(t, aliceID, "Pag5", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	ctx := createTestSession(t, aliceID)

	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for i := range 30 {
		seedExpense(t, ctx, groupID, "expense", "USD", 10, aliceID, []string{aliceID, bobID}, base.Add(time.Duration(i)*time.Hour))
	}

	gs := group.NewGroupService()
	// Limit=0 (or omitted Page entirely) should default to 20.
	resp, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId: groupID,
		Page:    &apiv1.PageRequest{Limit: 0},
	})
	if err != nil {
		t.Fatalf("GetGroupActivity: %v", err)
	}
	if got := len(resp.Items); got != 20 {
		t.Errorf("expected default limit 20, got %d items", got)
	}

	// Nil Page should behave the same way.
	resp2, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{GroupId: groupID})
	if err != nil {
		t.Fatalf("GetGroupActivity nil page: %v", err)
	}
	if got := len(resp2.Items); got != 20 {
		t.Errorf("expected default limit 20 with nil Page, got %d items", got)
	}
}

func TestActivityPaginationInvalidCursor(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.pag6@test.com", "Alice", "pw")
	groupID := createTestGroup(t, aliceID, "Pag6", "USD")
	ctx := createTestSession(t, aliceID)

	bad := "!!!not-base64!!!"
	gs := group.NewGroupService()
	_, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId: groupID,
		Page:    &apiv1.PageRequest{Limit: 20, Cursor: &bad},
	})
	if err == nil {
		t.Fatal("expected error for malformed cursor")
	}
	if cErr, ok := err.(*connect.Error); ok {
		if cErr.Code() != connect.CodeInvalidArgument {
			t.Errorf("expected CodeInvalidArgument, got %v", cErr.Code())
		}
	} else {
		t.Errorf("expected connect.Error, got %T", err)
	}
}

func TestActivityPaginationStableTieBreak(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.tie@test.com", "Alice", "pw")
	bobID := createTestUser(t, "bob.tie@test.com", "Bob", "pw")
	groupID := createTestGroup(t, aliceID, "Tie", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	ctx := createTestSession(t, aliceID)

	// Three expenses with IDENTICAL date and created_at — only id breaks the tie.
	d := time.Date(2026, 2, 1, 9, 0, 0, 0, time.UTC)
	insertExpenseRaw(t, groupID, "id-aaa", aliceID, bobID, 1000, "USD", d, d)
	insertExpenseRaw(t, groupID, "id-bbb", aliceID, bobID, 1000, "USD", d, d)
	insertExpenseRaw(t, groupID, "id-ccc", aliceID, bobID, 1000, "USD", d, d)

	gs := group.NewGroupService()

	// Page 1 (limit=2): expect descending id order → ccc, bbb
	resp, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId: groupID,
		Page:    &apiv1.PageRequest{Limit: 2},
	})
	if err != nil {
		t.Fatalf("page 1: %v", err)
	}
	if len(resp.Items) != 2 {
		t.Fatalf("page 1: expected 2 items, got %d", len(resp.Items))
	}
	if resp.Items[0].GetExpense().Id != "id-ccc" || resp.Items[1].GetExpense().Id != "id-bbb" {
		t.Errorf("page 1: unexpected order: %s, %s", resp.Items[0].GetExpense().Id, resp.Items[1].GetExpense().Id)
	}
	if resp.Page == nil || resp.Page.NextCursor == nil {
		t.Fatal("expected next_cursor after page 1")
	}

	// Page 2: cursor from id-bbb → next item must be id-aaa, no duplicates.
	resp2, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId: groupID,
		Page:    &apiv1.PageRequest{Limit: 2, Cursor: resp.Page.NextCursor},
	})
	if err != nil {
		t.Fatalf("page 2: %v", err)
	}
	if len(resp2.Items) != 1 {
		t.Fatalf("page 2: expected 1 item, got %d", len(resp2.Items))
	}
	if resp2.Items[0].GetExpense().Id != "id-aaa" {
		t.Errorf("page 2: expected id-aaa, got %s", resp2.Items[0].GetExpense().Id)
	}
}

func TestActivityFilterByType(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.ft@test.com", "Alice", "pw")
	bobID := createTestUser(t, "bob.ft@test.com", "Bob", "pw")
	groupID := createTestGroup(t, aliceID, "FT", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	ctx := createTestSession(t, aliceID)

	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for i := range 3 {
		seedExpense(t, ctx, groupID, "exp", "USD", 10, aliceID, []string{aliceID, bobID}, base.Add(time.Duration(i)*time.Hour))
	}
	for i := range 2 {
		seedTransfer(t, ctx, groupID, "USD", 5, bobID, aliceID, base.Add(time.Duration(10+i)*time.Hour))
	}

	gs := group.NewGroupService()

	// Filter: expenses only
	resp, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId:    groupID,
		Page:       &apiv1.PageRequest{Limit: 20},
		TypeFilter: apiv1.ActivityTypeFilter_ACTIVITY_TYPE_FILTER_EXPENSE,
	})
	if err != nil {
		t.Fatalf("expense filter: %v", err)
	}
	if len(resp.Items) != 3 {
		t.Errorf("expense filter: expected 3 items, got %d", len(resp.Items))
	}
	for _, it := range resp.Items {
		if it.Type != apiv1.GetGroupActivityResponse_ActivityItem_TYPE_EXPENSE {
			t.Errorf("expense filter returned non-expense item")
		}
	}
	if resp.Page.TotalCount != 3 {
		t.Errorf("expense filter total_count: got %d, want 3", resp.Page.TotalCount)
	}

	// Filter: transfers only
	resp, err = gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId:    groupID,
		Page:       &apiv1.PageRequest{Limit: 20},
		TypeFilter: apiv1.ActivityTypeFilter_ACTIVITY_TYPE_FILTER_TRANSFER,
	})
	if err != nil {
		t.Fatalf("transfer filter: %v", err)
	}
	if len(resp.Items) != 2 {
		t.Errorf("transfer filter: expected 2 items, got %d", len(resp.Items))
	}
	for _, it := range resp.Items {
		if it.Type != apiv1.GetGroupActivityResponse_ActivityItem_TYPE_TRANSFER {
			t.Errorf("transfer filter returned non-transfer item")
		}
	}
	if resp.Page.TotalCount != 2 {
		t.Errorf("transfer filter total_count: got %d, want 2", resp.Page.TotalCount)
	}

	// No filter (UNSPECIFIED) returns all
	resp, err = gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId: groupID,
		Page:    &apiv1.PageRequest{Limit: 20},
	})
	if err != nil {
		t.Fatalf("unfiltered: %v", err)
	}
	if len(resp.Items) != 5 || resp.Page.TotalCount != 5 {
		t.Errorf("unfiltered: expected 5 items / count 5, got %d / %d", len(resp.Items), resp.Page.TotalCount)
	}
}

func TestActivityFilterByCurrency(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.fc@test.com", "Alice", "pw")
	bobID := createTestUser(t, "bob.fc@test.com", "Bob", "pw")
	groupID := createTestGroup(t, aliceID, "FC", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	ctx := createTestSession(t, aliceID)

	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	seedExpense(t, ctx, groupID, "usd1", "USD", 10, aliceID, []string{aliceID, bobID}, base)
	seedExpense(t, ctx, groupID, "usd2", "USD", 10, aliceID, []string{aliceID, bobID}, base.Add(time.Hour))
	seedExpense(t, ctx, groupID, "eur1", "EUR", 10, aliceID, []string{aliceID, bobID}, base.Add(2*time.Hour))
	seedTransfer(t, ctx, groupID, "EUR", 5, bobID, aliceID, base.Add(3*time.Hour))

	gs := group.NewGroupService()
	eur := "EUR"
	resp, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId:        groupID,
		Page:           &apiv1.PageRequest{Limit: 20},
		CurrencyFilter: &eur,
	})
	if err != nil {
		t.Fatalf("currency filter: %v", err)
	}
	if len(resp.Items) != 2 {
		t.Errorf("currency filter: expected 2 items, got %d", len(resp.Items))
	}
	for _, it := range resp.Items {
		var cur string
		if it.GetExpense() != nil {
			cur = it.GetExpense().Currency
		} else {
			cur = it.GetTransfer().Currency
		}
		if cur != "EUR" {
			t.Errorf("currency filter leaked %q", cur)
		}
	}
	if resp.Page.TotalCount != 2 {
		t.Errorf("currency total_count: got %d, want 2", resp.Page.TotalCount)
	}
}

func TestActivityFilterByMember(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.fm@test.com", "Alice", "pw")
	bobID := createTestUser(t, "bob.fm@test.com", "Bob", "pw")
	carolID := createTestUser(t, "carol.fm@test.com", "Carol", "pw")
	groupID := createTestGroup(t, aliceID, "FM", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	addUserToGroup(t, carolID, groupID, 1.0)
	ctx := createTestSession(t, aliceID)

	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	// Bob payer; beneficiaries Alice+Carol  -> matches member=bob (payer) and member=alice (beneficiary)
	seedExpense(t, ctx, groupID, "e1", "USD", 12, bobID, []string{aliceID, carolID}, base)
	// Alice payer; beneficiaries Alice+Bob+Carol -> matches everyone
	seedExpense(t, ctx, groupID, "e2", "USD", 9, aliceID, []string{aliceID, bobID, carolID}, base.Add(time.Hour))
	// Carol payer; beneficiaries Carol only  -> matches only carol
	seedExpense(t, ctx, groupID, "e3", "USD", 5, carolID, []string{carolID}, base.Add(2*time.Hour))
	// Transfer Bob->Alice: matches both
	seedTransfer(t, ctx, groupID, "USD", 3, bobID, aliceID, base.Add(3*time.Hour))
	// Transfer Carol->Alice: matches carol & alice, not bob
	seedTransfer(t, ctx, groupID, "USD", 4, carolID, aliceID, base.Add(4*time.Hour))

	gs := group.NewGroupService()

	bobMember := bobID
	resp, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId:      groupID,
		Page:         &apiv1.PageRequest{Limit: 20},
		MemberFilter: &bobMember,
	})
	if err != nil {
		t.Fatalf("member filter bob: %v", err)
	}
	// Bob matches: e1 (payer), e2 (beneficiary), transfer Bob->Alice (sender). 3 items.
	if len(resp.Items) != 3 {
		t.Errorf("member=bob: expected 3 items, got %d", len(resp.Items))
	}
	if resp.Page.TotalCount != 3 {
		t.Errorf("member=bob total_count: got %d, want 3", resp.Page.TotalCount)
	}

	carolMember := carolID
	resp, err = gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId:      groupID,
		Page:         &apiv1.PageRequest{Limit: 20},
		MemberFilter: &carolMember,
	})
	if err != nil {
		t.Fatalf("member filter carol: %v", err)
	}
	// Carol matches: e1 (beneficiary), e2 (beneficiary), e3 (payer+beneficiary), transfer Carol->Alice (sender). 4 items.
	if len(resp.Items) != 4 {
		t.Errorf("member=carol: expected 4 items, got %d", len(resp.Items))
	}
}

func TestActivityCombinedFilters(t *testing.T) {
	setupTestDB(t)
	aliceID := createTestUser(t, "alice.cf@test.com", "Alice", "pw")
	bobID := createTestUser(t, "bob.cf@test.com", "Bob", "pw")
	groupID := createTestGroup(t, aliceID, "CF", "USD")
	addUserToGroup(t, bobID, groupID, 1.0)
	ctx := createTestSession(t, aliceID)

	base := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	// USD expense paid by Alice
	seedExpense(t, ctx, groupID, "e_usd_alice", "USD", 10, aliceID, []string{aliceID, bobID}, base)
	// EUR expense paid by Alice
	seedExpense(t, ctx, groupID, "e_eur_alice", "EUR", 10, aliceID, []string{aliceID, bobID}, base.Add(time.Hour))
	// USD transfer Alice->Bob (should be excluded by type filter)
	seedTransfer(t, ctx, groupID, "USD", 4, aliceID, bobID, base.Add(2*time.Hour))
	// USD expense paid by Bob
	seedExpense(t, ctx, groupID, "e_usd_bob", "USD", 10, bobID, []string{aliceID, bobID}, base.Add(3*time.Hour))

	gs := group.NewGroupService()
	usd := "USD"
	aliceMember := aliceID
	resp, err := gs.GetGroupActivity(ctx, &apiv1.GetGroupActivityRequest{
		GroupId:        groupID,
		Page:           &apiv1.PageRequest{Limit: 20},
		TypeFilter:     apiv1.ActivityTypeFilter_ACTIVITY_TYPE_FILTER_EXPENSE,
		CurrencyFilter: &usd,
		MemberFilter:   &aliceMember,
	})
	if err != nil {
		t.Fatalf("combined filter: %v", err)
	}
	// Expenses in USD where alice is payer or beneficiary:
	//   e_usd_alice (alice payer + alice beneficiary) ✓
	//   e_usd_bob (alice beneficiary) ✓
	// e_eur_alice excluded by currency; transfer excluded by type.
	if len(resp.Items) != 2 {
		t.Errorf("combined: expected 2 items, got %d", len(resp.Items))
	}
	if resp.Page.TotalCount != 2 {
		t.Errorf("combined total_count: got %d, want 2", resp.Page.TotalCount)
	}
}
