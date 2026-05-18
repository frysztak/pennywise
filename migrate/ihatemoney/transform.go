package ihatemoney

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/google/uuid"

	"pennywise/db/database"
	"pennywise/db/overrides"
	"pennywise/migrate"
)

// buildOpts bundles the shared migrate.BuildOptions with ihatemoney's
// source-specific knobs. Tests construct it directly; production code goes
// through (*Source).Build.
type buildOpts struct {
	Shared migrate.BuildOptions
	Strict bool
}

// build runs the full pure transformation. It performs no I/O. All Pennywise
// IDs are freshly generated UUIDs; the original ihatemoney IDs are discarded.
func build(
	proj *project,
	persons []person,
	bills []bill,
	owers map[int64][]int64,
	resolved *migrate.Resolved,
	opts buildOpts,
) (*migrate.Plan, error) {
	now := opts.Shared.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	plan := &migrate.Plan{
		GroupID: uuid.NewString(),
	}

	name := proj.Name
	if resolved.Mapping.ProjectName != "" {
		name = resolved.Mapping.ProjectName
	}
	emptyDesc := ""
	plan.Group = database.CreateGroupParams{
		ID:              plan.GroupID,
		CreatedBy:       resolved.Mapping.CreatorUserID,
		CreatedAt:       overrides.TextTime{Time: now},
		DefaultCurrency: proj.DefaultCurrency,
		Name:            name,
		Description:     &emptyDesc,
	}

	// Members — preserve source order so plan output is stable.
	personWeight := make(map[int64]float64, len(persons))
	for _, p := range persons {
		personWeight[p.ID] = p.Weight
		if !p.Activated {
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("person %q (id=%d) is deactivated in source; importing as active member",
					p.Name, p.ID))
		}
		u, ok := resolved.UsersBySource[ihmKey(p.ID)]
		if !ok {
			// Should have been caught in Validate, but guard anyway.
			return nil, fmt.Errorf("internal: no resolved user for person id %d", p.ID)
		}
		plan.Members = append(plan.Members, database.AddUserToGroupParams{
			UserID:  u.ID,
			GroupID: plan.GroupID,
			Weight:  p.Weight,
			AddedAt: overrides.TextTime{Time: now},
		})
	}

	// Track distinct currencies for group_currencies.
	currencySet := map[string]struct{}{proj.DefaultCurrency: {}}

	for _, b := range bills {
		currency := b.OriginalCurrency
		if currency == "" {
			currency = proj.DefaultCurrency
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("bill %d (%q): no original_currency, defaulted to %s",
					b.ID, b.What, proj.DefaultCurrency))
		}
		currencySet[currency] = struct{}{}

		amountCents, warn := toCents(b.Amount)
		if warn != "" {
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("bill %d (%q): %s", b.ID, b.What, warn))
		}

		payerUser, ok := resolved.UsersBySource[ihmKey(b.PayerID)]
		if !ok {
			return nil, fmt.Errorf("bill %d: payer person id %d not in mapping", b.ID, b.PayerID)
		}

		owerIDs := owers[b.ID]
		if len(owerIDs) == 0 {
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("bill %d (%q): has no owers; skipping", b.ID, b.What))
			continue
		}

		switch b.BillType {
		case billTypeReimbursement:
			transfers, err := buildReimbursement(b, owerIDs, personWeight, resolved,
				plan.GroupID, payerUser, currency, amountCents, opts)
			if err != nil {
				return nil, err
			}
			plan.Transfers = append(plan.Transfers, transfers...)

		default: // EXPENSE
			ex, err := buildExpense(b, owerIDs, resolved,
				plan.GroupID, payerUser, currency, amountCents)
			if err != nil {
				return nil, err
			}
			plan.Expenses = append(plan.Expenses, ex)
		}
	}

	plan.Currencies = make([]string, 0, len(currencySet))
	for c := range currencySet {
		plan.Currencies = append(plan.Currencies, c)
	}
	sort.Strings(plan.Currencies)

	return plan, nil
}

// ihmKey is the stringified person id used as the mapping key.
func ihmKey(id int64) string { return strconv.FormatInt(id, 10) }

// toCents converts a float amount to integer cents with a sanity check.
// SQLAlchemy floats from ihatemoney are usually clean to 2dp, but we surface
// anything that rounds off by more than 0.001¢ for operator review.
func toCents(amount float64) (int64, string) {
	scaled := amount * 100
	rounded := math.Round(scaled)
	if math.Abs(scaled-rounded) > 0.001 {
		return int64(rounded), fmt.Sprintf(
			"amount %f rounded to %d cents (delta %.6f)", amount, int64(rounded), scaled-rounded)
	}
	return int64(rounded), ""
}

func buildExpense(
	b bill,
	owerIDs []int64,
	resolved *migrate.Resolved,
	groupID string,
	payer migrate.ResolvedUser,
	currency string,
	amountCents int64,
) (migrate.PlannedExpense, error) {
	beneficiaries := make([]string, 0, len(owerIDs))
	for _, oid := range owerIDs {
		u, ok := resolved.UsersBySource[ihmKey(oid)]
		if !ok {
			return migrate.PlannedExpense{}, fmt.Errorf("bill %d: ower person id %d not in mapping", b.ID, oid)
		}
		beneficiaries = append(beneficiaries, u.ID)
	}

	expenseID := uuid.NewString()
	return migrate.PlannedExpense{
		Expense: database.CreateExpenseParams{
			ID:        expenseID,
			CreatedAt: overrides.TextTime{Time: b.CreationDate},
			Date:      overrides.TextTime{Time: b.Date},
			GroupID:   groupID,
			Name:      b.What,
			Currency:  currency,
		},
		Payer: database.CreateExpensePayerParams{
			ID:        uuid.NewString(),
			ExpenseID: expenseID,
			UserID:    payer.ID,
			Amount:    amountCents,
		},
		Beneficiaries: beneficiaries,
	}, nil
}

// buildReimbursement turns an ihatemoney REIMBURSEMENT bill into one or more
// Pennywise transfers. Multi-ower reimbursements are split by ower weight
// (matching ihatemoney's settlement formula); rounding remainders are placed
// on the last ower so the cents sum exactly equals the source.
func buildReimbursement(
	b bill,
	owerIDs []int64,
	personWeight map[int64]float64,
	resolved *migrate.Resolved,
	groupID string,
	payer migrate.ResolvedUser,
	currency string,
	amountCents int64,
	opts buildOpts,
) ([]database.CreateTransferParams, error) {
	if len(owerIDs) == 1 {
		recv, ok := resolved.UsersBySource[ihmKey(owerIDs[0])]
		if !ok {
			return nil, fmt.Errorf("bill %d: ower person id %d not in mapping", b.ID, owerIDs[0])
		}
		return []database.CreateTransferParams{{
			ID:         uuid.NewString(),
			CreatedAt:  overrides.TextTime{Time: b.CreationDate},
			Date:       overrides.TextTime{Time: b.Date},
			GroupID:    groupID,
			SenderID:   payer.ID,
			ReceiverID: recv.ID,
			Amount:     amountCents,
			Currency:   currency,
		}}, nil
	}

	if opts.Strict {
		return nil, fmt.Errorf("bill %d: multi-ower reimbursement rejected under --strict-reimbursement", b.ID)
	}

	// Weight-based split. Weights default to 1.0 in ihatemoney so this
	// degrades to an equal split when nothing has been customized.
	totalWeight := 0.0
	for _, oid := range owerIDs {
		totalWeight += personWeight[oid]
	}
	if totalWeight <= 0 {
		return nil, fmt.Errorf("bill %d: total ower weight is %f", b.ID, totalWeight)
	}

	transfers := make([]database.CreateTransferParams, 0, len(owerIDs))
	allocated := int64(0)
	for i, oid := range owerIDs {
		recv, ok := resolved.UsersBySource[ihmKey(oid)]
		if !ok {
			return nil, fmt.Errorf("bill %d: ower person id %d not in mapping", b.ID, oid)
		}
		var share int64
		if i == len(owerIDs)-1 {
			// Last ower absorbs any rounding remainder so the sum is exact.
			share = amountCents - allocated
		} else {
			share = int64(math.Round(float64(amountCents) * personWeight[oid] / totalWeight))
			allocated += share
		}
		if share <= 0 {
			continue
		}
		transfers = append(transfers, database.CreateTransferParams{
			ID:         uuid.NewString(),
			CreatedAt:  overrides.TextTime{Time: b.CreationDate},
			Date:       overrides.TextTime{Time: b.Date},
			GroupID:    groupID,
			SenderID:   payer.ID,
			ReceiverID: recv.ID,
			Amount:     share,
			Currency:   currency,
		})
	}
	return transfers, nil
}
