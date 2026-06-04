package calc

import (
	"pennywise/db/database"
	"pennywise/db/overrides"
	"pennywise/utils"
	"testing"
	"time"

	"github.com/google/go-cmp/cmp"
)

func day(s string) overrides.TextTime {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return overrides.TextTime{Time: t}
}

func TestComputeMemberSpending(t *testing.T) {
	testcases := []struct {
		name      string
		members   []database.GetGroupMembersRow
		expenses  []database.GetGroupExpensesRow
		wantPaid  GroupBalance
		wantShare GroupBalance
	}{
		{
			name: "single currency equal weights",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID: "e1", Currency: "USD", PayerID: "uA", Amount: amount(10.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
				{
					ID: "e2", Currency: "USD", PayerID: "uB", Amount: amount(4.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			wantPaid: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(10.00)},
				"uB": PerCurrencyBalance{"USD": amount(4.00)},
			},
			wantShare: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(7.00)},
				"uB": PerCurrencyBalance{"USD": amount(7.00)},
			},
		},
		{
			name: "weighted members",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 2.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID: "e1", Currency: "USD", PayerID: "uA", Amount: amount(3.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			wantPaid: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(3.00)},
				"uB": PerCurrencyBalance{},
			},
			wantShare: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(2.00)},
				"uB": PerCurrencyBalance{"USD": amount(1.00)},
			},
		},
		{
			name: "multi currency",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID: "e1", Currency: "USD", PayerID: "uA", Amount: amount(10.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
				{
					ID: "e2", Currency: "EUR", PayerID: "uB", Amount: amount(6.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			wantPaid: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(10.00)},
				"uB": PerCurrencyBalance{"EUR": amount(6.00)},
			},
			wantShare: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(5.00), "EUR": amount(3.00)},
				"uB": PerCurrencyBalance{"USD": amount(5.00), "EUR": amount(3.00)},
			},
		},
	}

	for _, tc := range testcases {
		t.Run(tc.name, func(t *testing.T) {
			paid, share := ComputeMemberSpending(&tc.members, &tc.expenses)
			if diff := cmp.Diff(tc.wantPaid, paid); diff != "" {
				t.Errorf("paid mismatch (-want +got):\n%s", diff)
			}
			if diff := cmp.Diff(tc.wantShare, share); diff != "" {
				t.Errorf("share mismatch (-want +got):\n%s", diff)
			}
		})
	}
}

func TestComputeBalanceTimeline(t *testing.T) {
	members := []database.GetGroupMembersRow{
		{UserID: "uA", Weight: 1.0},
		{UserID: "uB", Weight: 1.0},
	}
	expenses := []database.GetGroupExpensesRow{
		{
			ID: "e1", Currency: "USD", PayerID: "uA", Amount: amount(10.00),
			BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
			Date:             day("2024-01-01"), CreatedAt: day("2024-01-01"),
		},
		{
			ID: "e2", Currency: "USD", PayerID: "uB", Amount: amount(4.00),
			BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
			Date:             day("2024-01-03"), CreatedAt: day("2024-01-03"),
		},
	}
	transfers := []database.GetGroupTransfersRow{
		{
			ID: "t1", SenderID: "uB", ReceiverID: "uA", Amount: amount(3.00), Currency: "USD",
			Date: day("2024-01-03"), CreatedAt: day("2024-01-03"),
		},
	}

	timeline := ComputeBalanceTimeline(&members, &expenses, &transfers, "USD")

	// Two distinct activity days -> two snapshots.
	if len(timeline) != 2 {
		t.Fatalf("expected 2 snapshots, got %d", len(timeline))
	}

	// After day 1: uA paid 10, both owe 5 -> uA +5, uB -5.
	if got := timeline[0].Balances["USD"]["uA"]; got != amount(5.00) {
		t.Errorf("day1 uA = %d, want %d", got, amount(5.00))
	}
	if got := timeline[0].Balances["USD"]["uB"]; got != amount(-5.00) {
		t.Errorf("day1 uB = %d, want %d", got, amount(-5.00))
	}

	// Final snapshot must equal ComputeGroupBalance.
	forBalance := []database.GetGroupTransfersForBalanceRow{
		{SenderID: "uB", ReceiverID: "uA", Amount: amount(3.00), Currency: "USD"},
	}
	want := ComputeGroupBalance(&members, &expenses, &forBalance, "USD")
	final := timeline[len(timeline)-1]
	for userID, perCurr := range want {
		for currency, cents := range perCurr {
			if got := final.Balances[currency][userID]; got != cents {
				t.Errorf("final snapshot %s/%s = %d, want %d", userID, currency, got, cents)
			}
		}
	}
}

func TestComputeSpendingTimeline(t *testing.T) {
	expenses := []database.GetGroupExpensesRow{
		{
			ID: "e1", Currency: "USD", PayerID: "uA", Amount: amount(10.00),
			BeneficiariesIds: utils.SliceToJSONString("uA"),
			Date:             day("2024-01-01"), CreatedAt: day("2024-01-01"),
		},
		{
			ID: "e2", Currency: "EUR", PayerID: "uA", Amount: amount(5.00),
			BeneficiariesIds: utils.SliceToJSONString("uA"),
			Date:             day("2024-01-01"), CreatedAt: day("2024-01-01"),
		},
		{
			ID: "e3", Currency: "USD", PayerID: "uB", Amount: amount(4.00),
			BeneficiariesIds: utils.SliceToJSONString("uB"),
			Date:             day("2024-01-03"), CreatedAt: day("2024-01-03"),
		},
	}

	timeline := ComputeSpendingTimeline(&expenses, "USD")

	if len(timeline) != 2 {
		t.Fatalf("expected 2 snapshots, got %d", len(timeline))
	}

	// Day 1: 10 USD + 5 EUR accumulated.
	if got := timeline[0].Total["USD"]; got != amount(10.00) {
		t.Errorf("day1 USD = %d, want %d", got, amount(10.00))
	}
	if got := timeline[0].Total["EUR"]; got != amount(5.00) {
		t.Errorf("day1 EUR = %d, want %d", got, amount(5.00))
	}

	// Day 2: USD carries forward and grows to 14; EUR carries forward at 5.
	if got := timeline[1].Total["USD"]; got != amount(14.00) {
		t.Errorf("day2 USD = %d, want %d", got, amount(14.00))
	}
	if got := timeline[1].Total["EUR"]; got != amount(5.00) {
		t.Errorf("day2 EUR = %d, want %d", got, amount(5.00))
	}
}
