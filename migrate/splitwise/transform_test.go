package splitwise

import (
	"strconv"
	"testing"
	"time"

	"pennywise/migrate"
)

// twoPersonFixture returns a resolved mapping for Alice (index 0) and Bob (index 1).
func twoPersonFixture() ([]string, *migrate.Resolved, migrate.BuildOptions) {
	members := []string{"Alice", "Bob"}
	resolved := &migrate.Resolved{
		Mapping: &migrate.Mapping{CreatorUserID: "uid-alice"},
		UsersBySource: map[string]migrate.ResolvedUser{
			"0": {ID: "uid-alice", Email: "alice@x"},
			"1": {ID: "uid-bob", Email: "bob@x"},
		},
	}
	opts := migrate.BuildOptions{Now: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)}
	return members, resolved, opts
}

func TestBuild_EqualSplit_AlicePays(t *testing.T) {
	members, resolved, opts := twoPersonFixture()
	rows := []expenseRow{{
		Date:        time.Date(2025, 3, 1, 0, 0, 0, 0, time.UTC),
		Description: "Dinner",
		Amount:      100.00,
		Currency:    "EUR",
		Shares:      []float64{50.00, -50.00}, // Alice paid 100, owed back 50; Bob owes 50
	}}

	plan, err := build("trip", "EUR", members, rows, resolved, opts)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if len(plan.Expenses) != 1 {
		t.Fatalf("got %d expenses, want 1", len(plan.Expenses))
	}
	pe := plan.Expenses[0]
	if pe.Payer.UserID != "uid-alice" {
		t.Errorf("payer = %q, want uid-alice", pe.Payer.UserID)
	}
	if pe.Payer.Amount != 10000 {
		t.Errorf("payer amount = %d, want 10000 cents", pe.Payer.Amount)
	}
	if len(pe.Beneficiaries) != 2 {
		t.Errorf("beneficiaries = %v, want both members", pe.Beneficiaries)
	}
}

func TestBuild_EqualSplit_BobPays(t *testing.T) {
	members, resolved, opts := twoPersonFixture()
	rows := []expenseRow{{
		Date: time.Date(2025, 3, 2, 0, 0, 0, 0, time.UTC),
		Description: "Taxi",
		Amount:      40.00,
		Currency:    "PLN",
		Shares:      []float64{-20.00, 20.00}, // Bob paid 40; Alice owes 20
	}}

	plan, err := build("trip", "EUR", members, rows, resolved, opts)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	pe := plan.Expenses[0]
	if pe.Payer.UserID != "uid-bob" {
		t.Errorf("payer = %q, want uid-bob", pe.Payer.UserID)
	}
	if pe.Payer.Amount != 4000 {
		t.Errorf("payer amount = %d, want 4000 cents", pe.Payer.Amount)
	}
}

func TestBuild_PayerNotBeneficiary(t *testing.T) {
	// Alice pays 100 entirely for Bob (her share = 0).
	// Alice net = 100 - 0 = +100; Bob net = -100.
	members, resolved, opts := twoPersonFixture()
	rows := []expenseRow{{
		Date:        time.Date(2025, 3, 3, 0, 0, 0, 0, time.UTC),
		Description: "Gift for Bob",
		Amount:      100.00,
		Currency:    "EUR",
		Shares:      []float64{100.00, -100.00},
	}}

	plan, err := build("trip", "EUR", members, rows, resolved, opts)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	pe := plan.Expenses[0]
	if pe.Payer.UserID != "uid-alice" {
		t.Errorf("payer = %q, want uid-alice", pe.Payer.UserID)
	}
	// Alice's effective share = 100 - 100 = 0 → not a beneficiary.
	if len(pe.Beneficiaries) != 1 || pe.Beneficiaries[0] != "uid-bob" {
		t.Errorf("beneficiaries = %v, want [uid-bob]", pe.Beneficiaries)
	}
}

func TestBuild_NoPayer_Skipped(t *testing.T) {
	members, resolved, opts := twoPersonFixture()
	rows := []expenseRow{{
		Date:        time.Date(2025, 3, 4, 0, 0, 0, 0, time.UTC),
		Description: "Weird row",
		Amount:      50.00,
		Currency:    "EUR",
		Shares:      []float64{0, 0},
	}}

	plan, err := build("trip", "EUR", members, rows, resolved, opts)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if len(plan.Expenses) != 0 {
		t.Errorf("expected 0 expenses (row skipped), got %d", len(plan.Expenses))
	}
	if len(plan.Warnings) == 0 {
		t.Errorf("expected a warning for the skipped row")
	}
}

func TestBuild_MultiCurrency(t *testing.T) {
	members, resolved, opts := twoPersonFixture()
	rows := []expenseRow{
		{Date: time.Now(), Description: "a", Amount: 10, Currency: "EUR", Shares: []float64{5, -5}},
		{Date: time.Now(), Description: "b", Amount: 20, Currency: "ISK", Shares: []float64{-10, 10}},
		{Date: time.Now(), Description: "c", Amount: 30, Currency: "PLN", Shares: []float64{15, -15}},
	}

	plan, err := build("trip", "ISK", members, rows, resolved, opts)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	wantCurrencies := map[string]bool{"EUR": true, "ISK": true, "PLN": true}
	if len(plan.Currencies) != len(wantCurrencies) {
		t.Fatalf("currencies = %v, want %v", plan.Currencies, wantCurrencies)
	}
	for _, c := range plan.Currencies {
		if !wantCurrencies[c] {
			t.Errorf("unexpected currency %q", c)
		}
	}
}

func TestBuild_ProjectNameOverride(t *testing.T) {
	members, resolved, opts := twoPersonFixture()
	resolved.Mapping.ProjectName = "My Override"
	rows := []expenseRow{{
		Date: time.Now(), Description: "x", Amount: 10, Currency: "EUR",
		Shares: []float64{5, -5},
	}}

	plan, err := build("original", "EUR", members, rows, resolved, opts)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if plan.Group.Name != "My Override" {
		t.Errorf("group name = %q, want %q", plan.Group.Name, "My Override")
	}
}

func TestBuild_MemberCount(t *testing.T) {
	members, resolved, opts := twoPersonFixture()
	plan, err := build("trip", "EUR", members, nil, resolved, opts)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if len(plan.Members) != 2 {
		t.Errorf("members = %d, want 2", len(plan.Members))
	}
	for _, m := range plan.Members {
		if m.Weight != 1.0 {
			t.Errorf("member weight = %f, want 1.0", m.Weight)
		}
	}
}

func TestMostFrequentCurrency(t *testing.T) {
	rows := []expenseRow{
		{Currency: "PLN"},
		{Currency: "PLN"},
		{Currency: "EUR"},
		{Currency: "ISK"},
		{Currency: "ISK"},
		{Currency: "PLN"},
	}
	if got := mostFrequentCurrency(rows); got != "PLN" {
		t.Errorf("mostFrequentCurrency = %q, want PLN", got)
	}
}

func TestToCents(t *testing.T) {
	tests := []struct {
		in       float64
		want     int64
		wantWarn bool
	}{
		{19.99, 1999, false},
		{5.0, 500, false},
		{0.1 + 0.2, 30, false},
		{1.0 / 3.0, 33, true},
		{0, 0, false},
	}
	for _, tc := range tests {
		got, warn := toCents(tc.in)
		if got != tc.want {
			t.Errorf("toCents(%v) = %d, want %d", tc.in, got, tc.want)
		}
		if (warn != "") != tc.wantWarn {
			t.Errorf("toCents(%v) warn = %q, wantWarn=%v", tc.in, warn, tc.wantWarn)
		}
	}
}

func TestSource_ParseCSV(t *testing.T) {
	src, err := Open("testdata/splitwise.csv")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer src.Close()

	if src.Name() != SourceName {
		t.Errorf("Name = %q, want %q", src.Name(), SourceName)
	}
	if len(src.members) != 2 {
		t.Fatalf("members = %v, want 2", src.members)
	}
	if len(src.expenses) == 0 {
		t.Fatal("no expenses parsed")
	}
	// Balance summary rows must not appear as expenses.
	for _, e := range src.expenses {
		if e.Description == "Całkowite saldo" {
			t.Errorf("balance summary row was not filtered: %+v", e)
		}
	}
	// All expenses must have a valid payer (at least one positive share).
	for _, e := range src.expenses {
		hasPos := false
		for _, s := range e.Shares {
			if s > 1e-6 {
				hasPos = true
				break
			}
		}
		if !hasPos {
			t.Errorf("expense %q has no positive share: %v", e.Description, e.Shares)
		}
	}
	// Verify SourceIDs are stringified indices.
	if src.members[0] != "" {
		persons := make([]migrate.PersonInfo, len(src.members))
		for i, name := range src.members {
			persons[i] = migrate.PersonInfo{SourceID: strconv.Itoa(i), Name: name}
		}
		if persons[0].SourceID != "0" || persons[1].SourceID != "1" {
			t.Errorf("unexpected SourceIDs: %v", persons)
		}
	}
}
