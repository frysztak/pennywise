package calc

import (
	"pennywise/db/database"
	"pennywise/utils"
	"testing"

	"github.com/google/go-cmp/cmp"
)

// amount converts a decimal value to smallest currency unit (e.g., 12.34 → 1234)
func amount(value float64) int64 {
	return int64(value * 100)
}

func TestComputeGroupBalance(t *testing.T) {
	testcases := []struct {
		name            string
		members         []database.GetGroupMembersRow
		expenses        []database.GetGroupExpensesRow
		transfers       []database.GetGroupTransfersForBalanceRow
		defaultCurrency string
		want            GroupBalance
	}{
		{
			name: "two members equal weights, one expense",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "eA",
					Currency:         "PLN",
					GroupID:          "gA",
					RecurringID:      nil,
					PayerID:          "uA",
					Amount:           amount(21.37),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			defaultCurrency: "PLN",
			// 21.37 split 50/50 = 10.685 each. uA owes 10.685 of their own
			// expense, leaving them +10.685. uB owes 10.685. Both round half
			// away from zero → ±10.69. Matches ihatemoney's display, which
			// also rounds each balance independently from float.
			want: GroupBalance{
				"uA": PerCurrencyBalance{"PLN": amount(10.69)},
				"uB": PerCurrencyBalance{"PLN": amount(-10.69)},
			},
		},
		{
			name: "two members unequal weights",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 2.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(3.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(1.00)},
				"uB": PerCurrencyBalance{"USD": amount(-1.00)},
			},
		},
		{
			name: "three members equal weights",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
				{UserID: "uC", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "EUR",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(1.50),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB", "uC"),
				},
			},
			defaultCurrency: "EUR",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"EUR": amount(1.00)},
				"uB": PerCurrencyBalance{"EUR": amount(-0.50)},
				"uC": PerCurrencyBalance{"EUR": amount(-0.50)},
			},
		},
		{
			name: "multiple expenses same currency",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(1.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
				{
					ID:               "e2",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uB",
					Amount:           amount(2.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(-0.50)},
				"uB": PerCurrencyBalance{"USD": amount(0.50)},
			},
		},
		{
			name: "multiple currencies",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(1.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
				{
					ID:               "e2",
					Currency:         "EUR",
					GroupID:          "g1",
					PayerID:          "uB",
					Amount:           amount(2.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(0.50), "EUR": amount(-1.00)},
				"uB": PerCurrencyBalance{"USD": amount(-0.50), "EUR": amount(1.00)},
			},
		},
		{
			name: "expense for subset of members",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
				{UserID: "uC", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(1.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(0.50)},
				"uB": PerCurrencyBalance{"USD": amount(-0.50)},
				"uC": PerCurrencyBalance{"USD": 0},
			},
		},
		{
			name: "person pays only for themselves",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(1.00),
					BeneficiariesIds: utils.SliceToJSONString("uA"),
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": 0},
				"uB": PerCurrencyBalance{"USD": 0},
			},
		},
		{
			name: "no expenses",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses:        []database.GetGroupExpensesRow{},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": 0},
				"uB": PerCurrencyBalance{"USD": 0},
			},
		},
		{
			name: "default currency different from expense currencies",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "EUR",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(1.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": 0, "EUR": amount(0.50)},
				"uB": PerCurrencyBalance{"USD": 0, "EUR": amount(-0.50)},
			},
		},
		{
			name: "complex scenario with mixed weights and currencies",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 2.0},
				{UserID: "uB", Weight: 1.0},
				{UserID: "uC", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(4.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB", "uC"),
				},
				{
					ID:               "e2",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uB",
					Amount:           amount(2.00),
					BeneficiariesIds: utils.SliceToJSONString("uB", "uC"),
				},
				{
					ID:               "e3",
					Currency:         "EUR",
					GroupID:          "g1",
					PayerID:          "uC",
					Amount:           amount(3.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB", "uC"),
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{
					"USD": amount(2.00),
					"EUR": amount(-1.50),
				},
				"uB": PerCurrencyBalance{
					"USD": 0,
					"EUR": amount(-0.75),
				},
				"uC": PerCurrencyBalance{
					"USD": amount(-2.00),
					"EUR": amount(2.25),
				},
			},
		},
		// Transfer test cases
		{
			name: "transfer settles debt completely",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(10.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			transfers: []database.GetGroupTransfersForBalanceRow{
				{
					SenderID:   "uB",
					ReceiverID: "uA",
					Amount:     amount(5.00),
					Currency:   "USD",
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": 0},
				"uB": PerCurrencyBalance{"USD": 0},
			},
		},
		{
			name: "transfer partially settles debt",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(10.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			transfers: []database.GetGroupTransfersForBalanceRow{
				{
					SenderID:   "uB",
					ReceiverID: "uA",
					Amount:     amount(3.00),
					Currency:   "USD",
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(2.00)},
				"uB": PerCurrencyBalance{"USD": amount(-2.00)},
			},
		},
		{
			name: "transfer in different currency than expense",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(10.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
				},
			},
			transfers: []database.GetGroupTransfersForBalanceRow{
				{
					SenderID:   "uB",
					ReceiverID: "uA",
					Amount:     amount(5.00),
					Currency:   "EUR",
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(5.00), "EUR": amount(-5.00)},
				"uB": PerCurrencyBalance{"USD": amount(-5.00), "EUR": amount(5.00)},
			},
		},
		{
			name: "multiple transfers settle all debts",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
				{UserID: "uC", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{
				{
					ID:               "e1",
					Currency:         "USD",
					GroupID:          "g1",
					PayerID:          "uA",
					Amount:           amount(30.00),
					BeneficiariesIds: utils.SliceToJSONString("uA", "uB", "uC"),
				},
			},
			transfers: []database.GetGroupTransfersForBalanceRow{
				{
					SenderID:   "uB",
					ReceiverID: "uA",
					Amount:     amount(10.00),
					Currency:   "USD",
				},
				{
					SenderID:   "uC",
					ReceiverID: "uA",
					Amount:     amount(10.00),
					Currency:   "USD",
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": 0},
				"uB": PerCurrencyBalance{"USD": 0},
				"uC": PerCurrencyBalance{"USD": 0},
			},
		},
		{
			name: "transfers only, no expenses",
			members: []database.GetGroupMembersRow{
				{UserID: "uA", Weight: 1.0},
				{UserID: "uB", Weight: 1.0},
			},
			expenses: []database.GetGroupExpensesRow{},
			transfers: []database.GetGroupTransfersForBalanceRow{
				{
					SenderID:   "uA",
					ReceiverID: "uB",
					Amount:     amount(10.00),
					Currency:   "USD",
				},
			},
			defaultCurrency: "USD",
			want: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(10.00)},
				"uB": PerCurrencyBalance{"USD": amount(-10.00)},
			},
		},
	}

	for _, tc := range testcases {
		t.Run(tc.name, func(t *testing.T) {
			got := ComputeGroupBalance(&tc.members, &tc.expenses, &tc.transfers, tc.defaultCurrency)

			if !cmp.Equal(got, tc.want) {
				t.Errorf("Wrong balance:\n%s", cmp.Diff(tc.want, got))
			}
		})
	}
}

// TestComputeGroupBalance_NoSystematicBias guards against the bias the old
// integer-truncation implementation had: any rounding fraction leaked to the
// payer, so after many awkward-split expenses the sum drifted by tens of
// cents. With float accumulation + a single round per user, the sum stays
// within ±1¢ per currency even for many awkward splits.
func TestComputeGroupBalance_NoSystematicBias(t *testing.T) {
	members := []database.GetGroupMembersRow{
		{UserID: "uA", Weight: 1.0},
		{UserID: "uB", Weight: 1.0},
		{UserID: "uC", Weight: 1.0},
	}

	// 30 small awkward-cent expenses split three ways. Old truncation
	// would have leaked ~30¢ to the payer in total.
	expenses := make([]database.GetGroupExpensesRow, 0, 30)
	for i := range 30 {
		expenses = append(expenses, database.GetGroupExpensesRow{
			ID: "e" + string(rune('A'+i)), Currency: "USD", GroupID: "g1",
			PayerID:          "uA",
			Amount:           amount(10.00) + int64(i), // 10.00, 10.01, …, 10.29
			BeneficiariesIds: utils.SliceToJSONString("uA", "uB", "uC"),
		})
	}

	got := ComputeGroupBalance(&members, &expenses, &[]database.GetGroupTransfersForBalanceRow{}, "USD")

	var sum int64
	for _, perCurrency := range got {
		sum += perCurrency["USD"]
	}
	if sum < -1 || sum > 1 {
		t.Errorf("per-currency balance sum = %d, want within ±1¢ (drift indicates systematic bias)", sum)
	}
}
