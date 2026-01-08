package calc

import (
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestCalculateSettlements_Empty(t *testing.T) {
	got := CalculateSettlements(nil)
	if got != nil {
		t.Errorf("expected nil for empty balances, got %v", got)
	}

	got = CalculateSettlements(GroupBalance{})
	if got != nil {
		t.Errorf("expected nil for empty map, got %v", got)
	}
}

func TestCalculateSettlements_AllZero(t *testing.T) {
	balances := GroupBalance{
		"uA": PerCurrencyBalance{"USD": 0},
		"uB": PerCurrencyBalance{"USD": 0},
	}
	got := CalculateSettlements(balances)
	if len(got) != 0 {
		t.Errorf("expected no settlements for zero balances, got %v", got)
	}
}

func TestCalculateSettlements_TwoUsers(t *testing.T) {
	balances := GroupBalance{
		"uA": PerCurrencyBalance{"USD": amount(50.00)},  // owed $50
		"uB": PerCurrencyBalance{"USD": amount(-50.00)}, // owes $50
	}

	got := CalculateSettlements(balances)
	want := []SettlementSuggestion{
		{FromUserID: "uB", ToUserID: "uA", Amount: amount(50.00), Currency: "USD"},
	}

	if !cmp.Equal(got, want) {
		t.Errorf("Wrong settlements:\n%s", cmp.Diff(want, got))
	}
}

func TestCalculateSettlements_MultipleDebtors(t *testing.T) {
	balances := GroupBalance{
		"uA": PerCurrencyBalance{"USD": amount(30.00)},  // owed $30
		"uB": PerCurrencyBalance{"USD": amount(-20.00)}, // owes $20
		"uC": PerCurrencyBalance{"USD": amount(-10.00)}, // owes $10
	}

	got := CalculateSettlements(balances)
	want := []SettlementSuggestion{
		{FromUserID: "uB", ToUserID: "uA", Amount: amount(20.00), Currency: "USD"},
		{FromUserID: "uC", ToUserID: "uA", Amount: amount(10.00), Currency: "USD"},
	}

	if !cmp.Equal(got, want) {
		t.Errorf("Wrong settlements:\n%s", cmp.Diff(want, got))
	}
}

func TestCalculateSettlements_MultipleCreditors(t *testing.T) {
	balances := GroupBalance{
		"uA": PerCurrencyBalance{"USD": amount(20.00)},  // owed $20
		"uB": PerCurrencyBalance{"USD": amount(10.00)},  // owed $10
		"uC": PerCurrencyBalance{"USD": amount(-30.00)}, // owes $30
	}

	got := CalculateSettlements(balances)
	want := []SettlementSuggestion{
		{FromUserID: "uC", ToUserID: "uA", Amount: amount(20.00), Currency: "USD"},
		{FromUserID: "uC", ToUserID: "uB", Amount: amount(10.00), Currency: "USD"},
	}

	if !cmp.Equal(got, want) {
		t.Errorf("Wrong settlements:\n%s", cmp.Diff(want, got))
	}
}

func TestCalculateSettlements_ComplexMultiParty(t *testing.T) {
	// Example from plan: Alice +$100, Carol +$20, Bob -$60, Dave -$40, Eve -$20
	balances := GroupBalance{
		"Alice": PerCurrencyBalance{"USD": amount(100.00)},
		"Bob":   PerCurrencyBalance{"USD": amount(-60.00)},
		"Carol": PerCurrencyBalance{"USD": amount(20.00)},
		"Dave":  PerCurrencyBalance{"USD": amount(-40.00)},
		"Eve":   PerCurrencyBalance{"USD": amount(-20.00)},
	}

	got := CalculateSettlements(balances)

	// Expected: 3 transfers (optimal for 2 creditors, 3 debtors)
	want := []SettlementSuggestion{
		{FromUserID: "Bob", ToUserID: "Alice", Amount: amount(60.00), Currency: "USD"},
		{FromUserID: "Dave", ToUserID: "Alice", Amount: amount(40.00), Currency: "USD"},
		{FromUserID: "Eve", ToUserID: "Carol", Amount: amount(20.00), Currency: "USD"},
	}

	if !cmp.Equal(got, want) {
		t.Errorf("Wrong settlements:\n%s", cmp.Diff(want, got))
	}
}

func TestCalculateSettlements_DebtSimplification(t *testing.T) {
	// Example 3 from plan: debt simplification
	// Alice: paid $20 for Bob, received $15 from Carol -> net owed $5
	// Bob: received $20 from Alice, paid $10 for Carol -> owes $10
	// Carol: received $10 from Bob, paid $15 for Alice -> owed $5
	balances := GroupBalance{
		"Alice": PerCurrencyBalance{"USD": amount(5.00)},
		"Bob":   PerCurrencyBalance{"USD": amount(-10.00)},
		"Carol": PerCurrencyBalance{"USD": amount(5.00)},
	}

	got := CalculateSettlements(balances)

	// Result: 2 transfers instead of 3
	want := []SettlementSuggestion{
		{FromUserID: "Bob", ToUserID: "Alice", Amount: amount(5.00), Currency: "USD"},
		{FromUserID: "Bob", ToUserID: "Carol", Amount: amount(5.00), Currency: "USD"},
	}

	if !cmp.Equal(got, want) {
		t.Errorf("Wrong settlements:\n%s", cmp.Diff(want, got))
	}
}

func TestCalculateSettlements_MultipleCurrencies(t *testing.T) {
	balances := GroupBalance{
		"uA": PerCurrencyBalance{
			"USD": amount(30.00),
			"EUR": amount(20.00),
		},
		"uB": PerCurrencyBalance{
			"USD": amount(-30.00),
			"EUR": 0,
		},
		"uC": PerCurrencyBalance{
			"USD": 0,
			"EUR": amount(-20.00),
		},
	}

	got := CalculateSettlements(balances)

	// Currencies sorted alphabetically: EUR first, then USD
	want := []SettlementSuggestion{
		{FromUserID: "uC", ToUserID: "uA", Amount: amount(20.00), Currency: "EUR"},
		{FromUserID: "uB", ToUserID: "uA", Amount: amount(30.00), Currency: "USD"},
	}

	if !cmp.Equal(got, want) {
		t.Errorf("Wrong settlements:\n%s", cmp.Diff(want, got))
	}
}

func TestCalculateSettlements_Deterministic(t *testing.T) {
	// Run multiple times to ensure deterministic output
	balances := GroupBalance{
		"uA": PerCurrencyBalance{"USD": amount(10.00)},
		"uB": PerCurrencyBalance{"USD": amount(10.00)},
		"uC": PerCurrencyBalance{"USD": amount(-10.00)},
		"uD": PerCurrencyBalance{"USD": amount(-10.00)},
	}

	first := CalculateSettlements(balances)
	for range 10 {
		got := CalculateSettlements(balances)
		if !cmp.Equal(got, first) {
			t.Errorf("Non-deterministic output:\n%s", cmp.Diff(first, got))
		}
	}
}

func TestCalculateSettlementsInCurrency_Basic(t *testing.T) {
	balances := GroupBalance{
		"uA": PerCurrencyBalance{
			"USD": amount(50.00),
			"EUR": amount(30.00),
		},
		"uB": PerCurrencyBalance{
			"USD": amount(-50.00),
			"EUR": 0,
		},
		"uC": PerCurrencyBalance{
			"USD": 0,
			"EUR": amount(-30.00),
		},
	}

	conversionRates := map[string]float64{
		"EUR": 1.10, // 1 EUR = 1.10 USD
	}

	got := CalculateSettlementsInCurrency(balances, "USD", conversionRates)

	// Alice: $50 + €30*1.10 = $50 + $33 = +$83 USD
	// Bob: -$50 USD
	// Carol: -€30*1.10 = -$33 USD
	want := []SettlementSuggestion{
		{FromUserID: "uB", ToUserID: "uA", Amount: amount(50.00), Currency: "USD"},
		{FromUserID: "uC", ToUserID: "uA", Amount: amount(33.00), Currency: "USD"},
	}

	if !cmp.Equal(got, want) {
		t.Errorf("Wrong settlements:\n%s", cmp.Diff(want, got))
	}
}

func TestCalculateSettlementsInCurrency_MultipleSourceCurrencies(t *testing.T) {
	balances := GroupBalance{
		"uA": PerCurrencyBalance{
			"USD": amount(10.00),
			"EUR": amount(10.00),
			"GBP": amount(10.00),
		},
		"uB": PerCurrencyBalance{
			"USD": amount(-10.00),
			"EUR": amount(-10.00),
			"GBP": amount(-10.00),
		},
	}

	conversionRates := map[string]float64{
		"EUR": 1.10, // 1 EUR = 1.10 USD
		"GBP": 1.25, // 1 GBP = 1.25 USD
	}

	got := CalculateSettlementsInCurrency(balances, "USD", conversionRates)

	// Alice: $10 + €10*1.10 + £10*1.25 = $10 + $11 + $12.50 = +$33.50
	// Bob: -$10 - $11 - $12.50 = -$33.50
	want := []SettlementSuggestion{
		{FromUserID: "uB", ToUserID: "uA", Amount: amount(33.50), Currency: "USD"},
	}

	if !cmp.Equal(got, want) {
		t.Errorf("Wrong settlements:\n%s", cmp.Diff(want, got))
	}
}

func TestCalculateSettlementsInCurrency_Empty(t *testing.T) {
	got := CalculateSettlementsInCurrency(nil, "USD", nil)
	if got != nil {
		t.Errorf("expected nil for empty balances, got %v", got)
	}
}

func TestCalculateSettlementsInCurrency_TargetCurrencyOnly(t *testing.T) {
	// When all balances are in target currency, no conversion needed
	balances := GroupBalance{
		"uA": PerCurrencyBalance{"USD": amount(50.00)},
		"uB": PerCurrencyBalance{"USD": amount(-50.00)},
	}

	got := CalculateSettlementsInCurrency(balances, "USD", nil)
	want := []SettlementSuggestion{
		{FromUserID: "uB", ToUserID: "uA", Amount: amount(50.00), Currency: "USD"},
	}

	if !cmp.Equal(got, want) {
		t.Errorf("Wrong settlements:\n%s", cmp.Diff(want, got))
	}
}

func TestCalculateSettlements_MinimalTransactions(t *testing.T) {
	// Verify that the algorithm produces minimal transaction count
	testCases := []struct {
		name        string
		balances    GroupBalance
		maxExpected int // theoretical minimum transactions
	}{
		{
			name: "2 users, 1 currency",
			balances: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(100)},
				"uB": PerCurrencyBalance{"USD": amount(-100)},
			},
			maxExpected: 1,
		},
		{
			name: "3 users, 1 debtor",
			balances: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(50)},
				"uB": PerCurrencyBalance{"USD": amount(50)},
				"uC": PerCurrencyBalance{"USD": amount(-100)},
			},
			maxExpected: 2,
		},
		{
			name: "3 users, 2 debtors",
			balances: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(100)},
				"uB": PerCurrencyBalance{"USD": amount(-50)},
				"uC": PerCurrencyBalance{"USD": amount(-50)},
			},
			maxExpected: 2,
		},
		{
			name: "5 users complex",
			balances: GroupBalance{
				"uA": PerCurrencyBalance{"USD": amount(100)},
				"uB": PerCurrencyBalance{"USD": amount(-60)},
				"uC": PerCurrencyBalance{"USD": amount(20)},
				"uD": PerCurrencyBalance{"USD": amount(-40)},
				"uE": PerCurrencyBalance{"USD": amount(-20)},
			},
			maxExpected: 3,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := CalculateSettlements(tc.balances)
			if len(got) > tc.maxExpected {
				t.Errorf("expected at most %d transactions, got %d: %v", tc.maxExpected, len(got), got)
			}
		})
	}
}

func TestCalculateSettlements_BalanceSumsToZero(t *testing.T) {
	// Verify that settlements correctly zero out all balances
	balances := GroupBalance{
		"uA": PerCurrencyBalance{"USD": amount(100.00)},
		"uB": PerCurrencyBalance{"USD": amount(-60.00)},
		"uC": PerCurrencyBalance{"USD": amount(20.00)},
		"uD": PerCurrencyBalance{"USD": amount(-40.00)},
		"uE": PerCurrencyBalance{"USD": amount(-20.00)},
	}

	settlements := CalculateSettlements(balances)

	// Apply settlements to balances
	for _, s := range settlements {
		balances[s.FromUserID][s.Currency] += s.Amount
		balances[s.ToUserID][s.Currency] -= s.Amount
	}

	// Verify all balances are zero
	for userID, currencies := range balances {
		for currency, balance := range currencies {
			if balance != 0 {
				t.Errorf("user %s still has %d cents in %s after settlement", userID, balance, currency)
			}
		}
	}
}
