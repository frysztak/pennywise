package ihatemoney

import (
	"strings"
	"testing"
	"time"
)

func TestToCents(t *testing.T) {
	tests := []struct {
		name     string
		in       float64
		want     int64
		wantWarn bool
	}{
		{"clean two-decimal", 19.99, 1999, false},
		{"whole number", 5, 500, false},
		{"floating sum", 0.1 + 0.2, 30, false}, // 0.30000000000000004 → 30 cents, within tolerance
		{"negative", -3.50, -350, false},
		{"thirds (warns)", 1.0 / 3.0, 33, true},
		{"zero", 0, 0, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, warn := toCents(tc.in)
			if got != tc.want {
				t.Errorf("toCents(%v) = %d, want %d", tc.in, got, tc.want)
			}
			if (warn != "") != tc.wantWarn {
				t.Errorf("toCents(%v) warn = %q, wantWarn=%v", tc.in, warn, tc.wantWarn)
			}
		})
	}
}

// fixture builds a resolved 3-person mapping where Pennywise user IDs are
// derived from the IHM IDs for easy assertion.
func fixture() (*Project, []Person, *Resolved, BuildOptions) {
	proj := &Project{ID: "test", Name: "Test", DefaultCurrency: "EUR"}
	persons := []Person{
		{ID: 1, ProjectID: "test", Name: "Alice", Weight: 1, Activated: true},
		{ID: 2, ProjectID: "test", Name: "Bob", Weight: 1, Activated: true},
		{ID: 3, ProjectID: "test", Name: "Carol", Weight: 2, Activated: true},
	}
	users := map[int64]ResolvedUser{
		1: {ID: "uid-1", Email: "alice@x"},
		2: {ID: "uid-2", Email: "bob@x"},
		3: {ID: "uid-3", Email: "carol@x"},
	}
	resolved := &Resolved{
		Mapping:    &Mapping{CreatorUserID: "uid-1"},
		UsersByIHM: users,
	}
	opts := BuildOptions{Now: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)}
	return proj, persons, resolved, opts
}

func TestBuild_ExpenseBasic(t *testing.T) {
	proj, persons, resolved, opts := fixture()
	bills := []Bill{{
		ID: 10, PayerID: 1, Amount: 30.00,
		Date:         time.Date(2025, 1, 5, 0, 0, 0, 0, time.UTC),
		CreationDate: time.Date(2025, 1, 5, 12, 0, 0, 0, time.UTC),
		What:         "Groceries", OriginalCurrency: "EUR", BillType: BillTypeExpense,
	}}
	owers := map[int64][]int64{10: {1, 2, 3}}

	plan, err := Build(proj, persons, bills, owers, resolved, opts)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if len(plan.Expenses) != 1 || len(plan.Transfers) != 0 {
		t.Fatalf("got %d expenses, %d transfers", len(plan.Expenses), len(plan.Transfers))
	}
	pe := plan.Expenses[0]
	if pe.Expense.Name != "Groceries" || pe.Expense.Currency != "EUR" {
		t.Errorf("expense: name=%q currency=%q", pe.Expense.Name, pe.Expense.Currency)
	}
	if pe.Payer.Amount != 3000 || pe.Payer.UserID != "uid-1" {
		t.Errorf("payer: amount=%d user=%q", pe.Payer.Amount, pe.Payer.UserID)
	}
	if len(pe.Beneficiaries) != 3 {
		t.Errorf("beneficiaries: got %d, want 3", len(pe.Beneficiaries))
	}
}

func TestBuild_ReimbursementSingleOwer(t *testing.T) {
	proj, persons, resolved, opts := fixture()
	bills := []Bill{{
		ID: 20, PayerID: 1, Amount: 12.50,
		Date: time.Now(), CreationDate: time.Now(),
		What: "Repay Bob", OriginalCurrency: "EUR", BillType: BillTypeReimbursement,
	}}
	owers := map[int64][]int64{20: {2}}

	plan, err := Build(proj, persons, bills, owers, resolved, opts)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if len(plan.Expenses) != 0 || len(plan.Transfers) != 1 {
		t.Fatalf("got %d expenses, %d transfers", len(plan.Expenses), len(plan.Transfers))
	}
	tr := plan.Transfers[0]
	if tr.SenderID != "uid-1" || tr.ReceiverID != "uid-2" || tr.Amount != 1250 {
		t.Errorf("transfer: sender=%q receiver=%q amount=%d", tr.SenderID, tr.ReceiverID, tr.Amount)
	}
}

func TestBuild_ReimbursementFanOutByWeight(t *testing.T) {
	proj, persons, resolved, opts := fixture()
	// Alice repays Bob (w=1) and Carol (w=2) for 30.00 → 10, 20.
	bills := []Bill{{
		ID: 30, PayerID: 1, Amount: 30.00,
		Date: time.Now(), CreationDate: time.Now(),
		What: "Settle up", OriginalCurrency: "EUR", BillType: BillTypeReimbursement,
	}}
	owers := map[int64][]int64{30: {2, 3}}

	plan, err := Build(proj, persons, bills, owers, resolved, opts)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if len(plan.Transfers) != 2 {
		t.Fatalf("got %d transfers, want 2", len(plan.Transfers))
	}
	total := int64(0)
	got := map[string]int64{}
	for _, tr := range plan.Transfers {
		total += tr.Amount
		got[tr.ReceiverID] = tr.Amount
	}
	if total != 3000 {
		t.Errorf("transfer total = %d, want 3000", total)
	}
	if got["uid-2"] != 1000 || got["uid-3"] != 2000 {
		t.Errorf("split by weight wrong: %v", got)
	}
}

func TestBuild_ReimbursementStrictRejectsMultiOwer(t *testing.T) {
	proj, persons, resolved, opts := fixture()
	opts.StrictReimbursement = true
	bills := []Bill{{
		ID: 40, PayerID: 1, Amount: 10,
		Date: time.Now(), CreationDate: time.Now(),
		What: "x", OriginalCurrency: "EUR", BillType: BillTypeReimbursement,
	}}
	owers := map[int64][]int64{40: {2, 3}}

	if _, err := Build(proj, persons, bills, owers, resolved, opts); err == nil {
		t.Fatalf("expected error under strict mode")
	}
}

func TestBuild_CurrencyFallback(t *testing.T) {
	proj, persons, resolved, opts := fixture()
	bills := []Bill{{
		ID: 50, PayerID: 1, Amount: 5,
		Date: time.Now(), CreationDate: time.Now(),
		What: "no-currency", OriginalCurrency: "", BillType: BillTypeExpense,
	}}
	owers := map[int64][]int64{50: {1}}

	plan, err := Build(proj, persons, bills, owers, resolved, opts)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if plan.Expenses[0].Expense.Currency != "EUR" {
		t.Errorf("currency = %q, want EUR (default)", plan.Expenses[0].Expense.Currency)
	}
	found := false
	for _, w := range plan.Warnings {
		if strings.Contains(w, "no original_currency") {
			found = true
		}
	}
	if !found {
		t.Errorf("expected warning about missing currency; got: %v", plan.Warnings)
	}
}

func TestBuild_MultiCurrencyCollectsCurrencies(t *testing.T) {
	proj, persons, resolved, opts := fixture()
	bills := []Bill{
		{ID: 1, PayerID: 1, Amount: 1, Date: time.Now(), CreationDate: time.Now(),
			What: "a", OriginalCurrency: "USD", BillType: BillTypeExpense},
		{ID: 2, PayerID: 1, Amount: 1, Date: time.Now(), CreationDate: time.Now(),
			What: "b", OriginalCurrency: "GBP", BillType: BillTypeExpense},
	}
	owers := map[int64][]int64{1: {1}, 2: {1}}

	plan, err := Build(proj, persons, bills, owers, resolved, opts)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	want := map[string]bool{"EUR": true, "USD": true, "GBP": true}
	if len(plan.Currencies) != len(want) {
		t.Fatalf("currencies = %v, want keys %v", plan.Currencies, want)
	}
	for _, c := range plan.Currencies {
		if !want[c] {
			t.Errorf("unexpected currency %q", c)
		}
	}
}

func TestBuild_DeactivatedPayerWarns(t *testing.T) {
	proj, persons, resolved, opts := fixture()
	persons[0].Activated = false
	bills := []Bill{{
		ID: 1, PayerID: 1, Amount: 1, Date: time.Now(), CreationDate: time.Now(),
		What: "x", OriginalCurrency: "EUR", BillType: BillTypeExpense,
	}}
	owers := map[int64][]int64{1: {1}}

	plan, err := Build(proj, persons, bills, owers, resolved, opts)
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if len(plan.Warnings) == 0 {
		t.Errorf("expected deactivated-person warning")
	}
}
